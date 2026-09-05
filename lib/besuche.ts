import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Wie oft das Werkzeug aufgerufen wird.
 *
 * Der Betreiber wollte sehen, wie viele Leute vorbeikommen - "aber echte,
 * wenn das geht". Rueckwirkend geht es nicht: gezaehlt wurde bisher nichts,
 * und aus nichts laesst sich keine Vergangenheit herstellen. Was hier
 * entsteht, beginnt am Tag der Einrichtung und waechst von da an mit.
 *
 * Gezaehlt wird dreierlei, und die Unterscheidung ist wichtig, weil die drei
 * Zahlen ganz verschiedene Dinge bedeuten:
 *
 *   aufrufe   - jede geoeffnete Seite. Wer durch Statistik, Events und
 *               Tierlist geht, macht drei davon.
 *   besucher  - Browser, die an diesem Tag mindestens einmal da waren.
 *               Das ist die Zahl, die dem umgangssprachlichen "wie viele
 *               Leute" am naechsten kommt. Sie ist eine Untergrenze: wer
 *               Handy und Rechner benutzt, zaehlt zweimal, und wer seine
 *               Daten loescht, ist am naechsten Tag wieder neu.
 *   neu       - davon die, die zum ersten Mal ueberhaupt hier waren.
 *
 * Mehr ist ehrlich nicht drin. Ob hinter zwei Browsern zwei Menschen stehen,
 * weiss dieser Server nicht, und eine Zahl, die so tut, als wuesste sie es,
 * waere schlimmer als keine.
 *
 * Zur Wiedererkennung dient ein einziges eigenes Cookie, in dem zwei Daten
 * stehen: der erste und der letzte Besuch. Keine Kennung, keine Adresse,
 * nichts, was zu einer Person zurueckfuehrt - und nichts, was ein fremder
 * Dienst zu sehen bekommt.
 */

const DATEI = path.join(DATEN_ORT, 'besuche.json');

/** Das Cookie mit erstem und letztem Besuch, durch einen Punkt getrennt. */
export const BESUCH_COOKIE = 'comphub_besuch';

export interface Tageswert {
  /** Geoeffnete Seiten. */
  aufrufe: number;
  /** Browser, die an diesem Tag da waren. */
  besucher: number;
  /** Davon zum ersten Mal ueberhaupt. */
  neu: number;
}

type Stand = Record<string, Tageswert>;

let stand: Stand | null = null;
let geplant: NodeJS.Timeout | null = null;

/**
 * Wie lange gesammelt wird, bevor geschrieben wird.
 *
 * Bei jedem Seitenaufruf eine Datei anzufassen waere ein spuerbarer Preis
 * fuer eine Zahl, die niemand in Echtzeit braucht. Drei Sekunden fassen einen
 * Schwung zusammen und kosten im schlimmsten Fall - der Server faellt genau
 * dazwischen aus - eine Handvoll Aufrufe.
 */
const SAMMELZEIT_MS = 3_000;

/** Der Tag in Ortszeit als YYYY-MM-DD. */
export function tagVon(d: Date = new Date()): string {
  // Ortszeit, nicht UTC: der Betreiber liest die Zahlen nach seinem Kalender.
  // Ein Tag, der um zwei Uhr nachts umspringt, verwirrt nur.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`;
}

async function lies(): Promise<Stand> {
  if (stand) return stand;
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Stand;
    stand = roh && typeof roh === 'object' ? roh : {};
  } catch {
    stand = {};
  }
  return stand;
}

function planeSchreiben(): void {
  if (geplant) return;
  geplant = setTimeout(() => {
    geplant = null;
    void (async () => {
      if (!stand) return;
      try {
        await fs.mkdir(path.dirname(DATEI), { recursive: true });
        await fs.writeFile(DATEI, JSON.stringify(stand, null, 1), 'utf8');
      } catch { /* eine verlorene Zahl ist kein Grund, eine Seite scheitern zu lassen */ }
    })();
  }, SAMMELZEIT_MS);
  // Ein wartender Zeitgeber darf den Vorgang nicht am Beenden hindern.
  geplant.unref?.();
}

/**
 * Einen Aufruf vermerken und das neue Cookie zurueckgeben.
 *
 * `voriges` ist der bisherige Cookie-Wert, `erstTag.letzterTag`. Fehlt er
 * oder ist er unbrauchbar, gilt der Browser als neu.
 *
 * Zurueck kommt der Wert, der als Cookie gesetzt werden soll - oder null,
 * wenn sich nichts geaendert hat und das Cookie stehen bleiben kann.
 */
export async function zaehleAufruf(voriges: string | undefined): Promise<string | null> {
  const z = await lies();
  const heute = tagVon();
  const tag = (z[heute] ??= { aufrufe: 0, besucher: 0, neu: 0 });

  tag.aufrufe += 1;

  const teile = String(voriges ?? '').split('.');
  const gueltig = teile.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(teile[0])
    && /^\d{4}-\d{2}-\d{2}$/.test(teile[1]);
  const erstTag = gueltig ? teile[0] : heute;
  const letzterTag = gueltig ? teile[1] : '';

  let neuesCookie: string | null = null;
  if (letzterTag !== heute) {
    // Heute zum ersten Mal gesehen.
    tag.besucher += 1;
    if (!gueltig) tag.neu += 1;
    neuesCookie = `${erstTag}.${heute}`;
  }

  planeSchreiben();
  return neuesCookie;
}

/** Die Zaehlung je Tag, aeltester zuerst. */
export async function besucheJeTag(): Promise<Array<Tageswert & { tag: string }>> {
  const z = await lies();
  return Object.entries(z)
    .filter(([tag]) => /^\d{4}-\d{2}-\d{2}$/.test(tag))
    .map(([tag, w]) => ({
      tag,
      aufrufe: Number(w?.aufrufe) || 0,
      besucher: Number(w?.besucher) || 0,
      neu: Number(w?.neu) || 0,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Seit wann gezaehlt wird - oder null, wenn noch gar nicht.
 *
 * Die Auswertung braucht das, um vor dieser Grenze keine Nullen zu zeigen.
 * Ein leerer Balken fuer den letzten Monat saehe aus wie "niemand war da",
 * und das waere schlicht falsch: da wurde nur nicht gezaehlt.
 */
export async function zaehltSeit(): Promise<string | null> {
  const liste = await besucheJeTag();
  return liste.length ? liste[0].tag : null;
}
