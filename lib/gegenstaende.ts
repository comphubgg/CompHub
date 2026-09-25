/*
 * Aus Epics Aktenzeichen einen Gegenstand machen.
 *
 * In der Auszahlungstabelle eines Cups steht nicht "Mega Man X", sondern
 * "AthenaCharacter:character_dunebriefshift" - Epics interner Deckname fuer
 * den Skin. Bisher wurde daraus nur die Zeichenkette entziert, und in der
 * Anzeige stand "Character Dunebriefshift". Der Betreiber hat das auf seinem
 * Bild danebengehalten: Epic selbst zeigt an derselben Stelle "Mega Man X"
 * mit Bild.
 *
 * fortnite-api.com kennt diese Zuordnung und gibt sie ohne Anmeldung und ohne
 * Schluessel heraus - geprueft, bevor hier Code dafuer entstand:
 *
 *   character_dunebriefshift  -> Mega Man X          (Outfit)
 *   backpack_dunebriefshift   -> E-Tank Power Pack   (Back Bling)
 *
 * Nicht jede Kennung ist dort zu finden; Emoticons und manche Spitzhacken
 * fehlen. Dann bleibt es beim entzierten Decknamen - erfunden wird nichts.
 *
 * Nachgeschlagen wird einmal je Gegenstand. Das Ergebnis liegt in der Ablage,
 * denn es aendert sich nie: ein Skin bekommt keinen neuen Namen.
 */

import { liesJson, schreibJson } from '@/lib/ablage';

export interface Gegenstand {
  /** Der Name, unter dem ihn jeder kennt. */
  name: string;
  /** "Outfit", "Back Bling", "Emoticon" - wie Epic die Art nennt. */
  art: string | null;
  /** Adresse des Bildes, oder null. */
  bild: string | null;
}

/** Wo die nachgeschlagenen Gegenstaende liegen. */
const ABLAGE = 'gegenstaende.json';

/** Im laufenden Vorgang, damit eine Seite mit zehn Preisen einmal liest. */
let vorrat: Record<string, Gegenstand> | null = null;
/** Was in diesem Vorgang dazugekommen ist und noch abgelegt werden muss. */
let neuDabei = false;

/** Der Teil hinter dem Doppelpunkt, klein geschrieben. */
function kennungAus(wert: string): string {
  return (wert ?? '').split(':').pop()?.trim().toLowerCase() ?? '';
}

/**
 * Der Notname, wenn nichts gefunden wird.
 *
 * "AthenaCharacter:character_dunebriefshift" wird zu "Dunebriefshift" - nicht
 * schoen, aber ehrlich: es ist das, was in den Daten steht.
 */
export function notName(wert: string): string {
  const teil = kennungAus(wert);
  return teil
    .replace(/^(athena|cid|eid|bid|pickaxe|glider|wrap|character|backpack|emoji)[_-]?/i, '')
    .replace(/^id[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (z) => z.toUpperCase())
    .trim() || wert;
}

/*
 * Die Ablage ist nur ein Merkzettel. Antwortet sie nicht, wird trotzdem
 * nachgeschlagen - am 25.9.2026 standen bei einem Skin-Cup nur Decknamen
 * ("Character Cosmictrellis" statt "Joker (P5R)"), weil Supabase ausfiel
 * und damit das ganze Nachschlagen. Geschrieben wird dann nichts.
 */
let ablageLesbar = true;

async function laden(): Promise<Record<string, Gegenstand>> {
  if (vorrat) return vorrat;
  try {
    vorrat = await liesJson<Record<string, Gegenstand>>(ABLAGE, {});
    ablageLesbar = true;
  } catch {
    ablageLesbar = false;
    vorrat = {};
    return vorrat;
  }
  // Fruehere Fehlschlaege (Deckname ohne Art und Bild) nicht mehr glauben -
  // ein neuer Skin steht oft erst Stunden nach dem Cup bei fortnite-api.com.
  for (const [k, g] of Object.entries(vorrat)) if (!g.art && !g.bild) delete vorrat[k];
  return vorrat;
}

/** Was eben nicht gefunden wurde - erst nach einer Stunde wieder fragen. */
const fehlt = new Map<string, number>();

async function sichern(): Promise<void> {
  if (!neuDabei || !vorrat || !ablageLesbar) return;
  neuDabei = false;
  try {
    await schreibJson(ABLAGE, vorrat);
  } catch { /* beim naechsten Mal wieder */ }
}

async function nachschlagen(kennung: string): Promise<Gegenstand | null> {
  try {
    const r = await fetch(
      `https://fortnite-api.com/v2/cosmetics/br/search?id=${encodeURIComponent(kennung)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json() as {
      data?: { name?: string; type?: { displayValue?: string };
               images?: { smallIcon?: string; icon?: string } };
    };
    const d = j.data;
    if (!d?.name) return null;
    return {
      name: d.name,
      art: d.type?.displayValue ?? null,
      bild: d.images?.smallIcon ?? d.images?.icon ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Mehrere Gegenstaende auf einmal - so wie sie in einer Preistabelle stehen.
 *
 * Nachgeschlagen wird nur, was noch nicht bekannt ist, und die Abfragen
 * laufen nebeneinander: bei einem Skin-Cup sind es vier bis sechs, und
 * nacheinander waeren das ein paar Sekunden fuer nichts.
 */
export async function holeGegenstaende(
  werte: string[],
): Promise<Map<string, Gegenstand>> {
  const bekannt = await laden();
  const raus = new Map<string, Gegenstand>();
  const offen: string[] = [];

  for (const wert of new Set(werte)) {
    const k = kennungAus(wert);
    if (!k) continue;
    if (bekannt[k]) raus.set(wert, bekannt[k]);
    else offen.push(wert);
  }

  if (offen.length) {
    const jetzt = Date.now();
    const ergebnisse = await Promise.all(offen.map(async (wert) => {
      const k = kennungAus(wert);
      if ((fehlt.get(k) ?? 0) > jetzt) return [wert, null] as const;
      return [wert, await nachschlagen(k)] as const;
    }));
    for (const [wert, gefunden] of ergebnisse) {
      const k = kennungAus(wert);
      /*
       * Nur Gefundenes wird dauerhaft gemerkt. Ein Fehlschlag wartet eine
       * Stunde im Speicher und wird dann neu versucht - frueher blieb er fuer
       * immer als Deckname stehen, auch nachdem fortnite-api.com den Skin
       * laengst kannte.
       */
      if (gefunden) {
        bekannt[k] = gefunden;
        neuDabei = true;
        raus.set(wert, gefunden);
      } else {
        fehlt.set(k, jetzt + 60 * 60_000);
        raus.set(wert, { name: notName(wert), art: null, bild: null });
      }
    }
    void sichern();
  }

  return raus;
}
