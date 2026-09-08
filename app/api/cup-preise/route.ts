import { NextResponse } from 'next/server';
import { holeGegenstaende } from '@/lib/gegenstaende';
import fs from '@/lib/ablageFs';
import path from 'path';
import { EpicLoginNoetig } from '@/lib/epicCups';
import {
  holeKatalog, wertungVon, type EpicKatalog,
} from '@/lib/cupWertung';
import { DATEN_ORT } from '@/lib/datenOrt';

// Was es in einem Cup zu gewinnen gibt.
//
// Epic fuehrt zu jedem Spieltag eine Auszahlungstabelle. Sie steht in
// derselben Antwort wie die Turnierliste, wird dort aber nur nach der
// Rangschwelle fuer die Qualifikation durchsucht. Tatsaechlich steht mehr
// darin:
//
//   rewardType "ecomm" + value "USD"  -> Preisgeld, quantity ist der Betrag
//   rewardType "game"                 -> ein Gegenstand, value seine Kennung
//   rewardType "token"                -> die Marke fuer die naechste Runde
//
// Zwei Arten der Wertung kommen vor, und sie bedeuten Verschiedenes:
//
//   scoringType "rank"        -> nach Platzierung  ("Platz 1: 600 $")
//   scoringType "value"       -> nach Punkten      ("100 Punkte: 100 $")
//   scoringType "percentile"  -> nach oberem Anteil ("beste 5 %")
//
//   ?region=EU&window=S42_…_EU   -> die Tabelle dieses Spieltags
//
// Erfunden wird nichts: fehlt eine Tabelle, kommt eine leere Antwort mit dem
// Hinweis, dass Epic zu diesem Spieltag nichts veroeffentlicht.

export const revalidate = 0;

interface RohZahlung {
  rewardType?: string; value?: string; quantity?: number;
}
interface RohRang {
  threshold?: number; payouts?: RohZahlung[];
}
interface RohGruppe {
  scoringType?: string; ranks?: RohRang[];
}

/** Aus "AthenaGlider:glider_season_41reload" wird "Glider Season 41 Reload". */
function gegenstandName(wert: string): string {
  const teil = (wert ?? '').split(':').pop() ?? '';
  return teil
    .replace(/^(athena|cid|eid|bid|pickaxe|glider|wrap)[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (z) => z.toUpperCase())
    .trim() || wert;
}

/* ------------------------------------------------ Von Hand gepflegtes */

/**
 * Preisgelder, die Epic nicht herausgibt.
 *
 * In der Auszahlungstabelle steht Geld nur bei Cash Cups. Bei FNCS,
 * Performance und Victory Cups steht dort nur die Qualifikationsmarke -
 * die Preisgelder werden von Epic zwar oeffentlich angekuendigt, aber
 * nirgends als Daten ausgeliefert. Sie stammen deshalb aus
 * data/preisgelder.json und werden in der Anzeige ausdruecklich als
 * gepflegte Angabe gekennzeichnet, nicht als Epic-Wert.
 */
interface Stufe { ab: number; betrag: number }
interface Gepflegt {
  turnier: string; region: string; nurFinale?: boolean;
  waehrung?: string; proPerson?: boolean; art: 'platz' | 'punkte';
  quelle?: string; erlaeuterung?: string;
  stufen?: Stufe[]; jePunkte?: number; betrag?: number;
  /** Wie viele Vielfache gezeigt werden - "zwei Siege bringen …". */
  stufen_anzahl?: number;
}

interface Zahlung { art: string; schwelle: number; betrag: number }

/**
 * Aus den Schwellen die Plaetze machen, die sie wirklich meinen.
 *
 * Epics Tabelle nennt je Stufe nur eine Zahl: 1, 2, 3, 4, 5, 7, 10, 20, 40.
 * Das sind keine neun Preise, sondern neun Spannen. Wer Siebter wird,
 * bekommt 250 - und der Sechste bekommt dasselbe, weil zwischen der Stufe
 * "5" und der Stufe "7" nichts anderes steht. Genauso teilen sich der Achte
 * bis Zehnte die 200, der Elfte bis Zwanzigste die 150 und der
 * Einundzwanzigste bis Vierzigste die 100.
 *
 * Ohne diese Rechnung stimmte zweierlei nicht. In der Liste stand "Platz 7"
 * ueber einem Betrag, den auch der Sechste bekommt - eine Zeile, die man
 * falsch liest. Und die Summe darueber addierte neun Betraege statt
 * vierzig: beim FNCS Divisional Cup 5.950 statt 9.850 Dollar. Der Betreiber
 * hat genau das bemerkt.
 *
 * Nur Platzierungen lassen sich so aufspannen. Punkte- und Prozentstufen
 * beschreiben keine Plaetze und bleiben unangetastet.
 */
function mitPlaetzen<T extends Zahlung>(geld: T[]) {
  let vorige = 0;
  return geld.map((z) => {
    if (z.art !== 'rank') return { ...z, von: z.schwelle, plaetze: 1 };
    const von = vorige + 1;
    const plaetze = Math.max(1, z.schwelle - vorige);
    vorige = z.schwelle;
    return { ...z, von, plaetze };
  });
}

/** Was ein Spieltag ausschuettet - jede Spanne mit allen ihren Plaetzen. */
function summeUeberPlaetze(geld: Array<Zahlung & { plaetze: number }>) {
  return geld.reduce((s, x) => s + x.betrag * x.plaetze, 0);
}

/** Die Turnierkennung ohne Season und Region - wie in der Kartenablage. */
function turnierKern(eventId: string): string {
  return (eventId ?? '')
    .replace(/^epicgames_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/^(CH\d+S\d+|S\d+)_?/i, '')
    .toLowerCase();
}

async function gepflegte(): Promise<Gepflegt[]> {
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'preisgelder.json'), 'utf8'));
    return (roh?.eintraege ?? []) as Gepflegt[];
  } catch { return []; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const window_ = searchParams.get('window');
  const region = (searchParams.get('region') ?? 'EU').toUpperCase();
  if (!window_) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }

  let epic: EpicKatalog;
  try {
    epic = await holeKatalog(region);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 502 });
  }

  // Epic schluesselt teils mit der blossen Fenster-Id, teils mit einer
  // laengeren Kennung, die sie enthaelt - beides beruecksichtigen.
  const eventIdRoh = searchParams.get('event') ?? '';
  const alle = epic.payoutTables ?? {};
  const gruppen = alle[window_]
    ?? Object.entries(alle).find(([k]) => k.includes(window_))?.[1];
  const wertung = wertungVon(epic, window_, eventIdRoh);

  const eventId = eventIdRoh;
  const istFinale = searchParams.get('finale') === '1';

  /*
   * Steht bei Epic kein Geld, gilt die gepflegte Angabe.
   *
   * Sie wird nur genommen, wenn Turnier UND Region passen - der Betreiber
   * war ausdruecklich: seine Zahlen gelten fuer Europa, andere Regionen
   * zahlen weniger. Eine europaeische Zahl unter NAC zu schreiben waere
   * schlicht falsch.
   */
  async function ausDatei() {
    if (!eventId) return null;
    const kern = turnierKern(eventId);
    const treffer = (await gepflegte()).find((g) =>
      g.turnier.toLowerCase() === kern
      && g.region.toUpperCase() === region
      && (!g.nurFinale || istFinale));
    if (!treffer) return null;

    /*
     * Die Stufen tragen in der Datei den Schluessel "ab". Gemeint ist die
     * letzte Platzierung der Spanne, genau wie bei Epic - "ab: 7" heisst
     * "Platz 6 und 7", nicht "ab Platz 7". Der Name stammt aus der ersten
     * Fassung und bleibt, damit die gepflegte Datei nicht angefasst werden
     * muss; gerechnet wird nach der Bedeutung.
     */
    const platzStufen = mitPlaetzen((treffer.stufen ?? []).map((s) => ({
      art: 'rank', schwelle: s.ab, betrag: s.betrag,
    })));

    return NextResponse.json({
      vorhanden: true, window: window_, region,
      waehrung: treffer.waehrung ?? 'USD',
      proPerson: treffer.proPerson ?? false,
      gepflegt: true, quelle: treffer.quelle ?? null,
      erlaeuterung: treffer.erlaeuterung ?? null,
      /*
       * Bei Punktezahlungen die Vielfachen mit ausrechnen.
       *
       * "100 Punkte: 100 $" allein beantwortet die naheliegende Frage nicht -
       * was bringen zwei Siege? Deshalb stehen dort mehrere Stufen, so wie
       * es auch Fortnite Tracker zeigt. Gerechnet, nicht geraten: es ist
       * dieselbe Zahl mal zwei, mal drei.
       */
      geld: treffer.art === 'platz'
        ? platzStufen
        : Array.from({ length: Math.max(1, treffer.stufen_anzahl ?? 3) },
          (unbenutzt, i) => ({
            art: 'value',
            schwelle: (treffer.jePunkte ?? 100) * (i + 1),
            betrag: (treffer.betrag ?? 0) * (i + 1),
            von: (treffer.jePunkte ?? 100) * (i + 1),
            plaetze: 1,
          })),
      gegenstaende: [], wertung,
      // Bei Punktezahlungen laesst sich nichts aufaddieren - siehe unten.
      gesamt: treffer.art === 'platz' ? summeUeberPlaetze(platzStufen) : null,
    });
  }

  if (!gruppen?.length) {
    const eigen = await ausDatei();
    if (eigen) return eigen;
    return NextResponse.json({
      vorhanden: false, window: window_, region,
      hinweis: 'Epic veroeffentlicht zu diesem Spieltag keine Auszahlungstabelle.',
      geld: [], gegenstaende: [], waehrung: null, gesamt: null, wertung,
    });
  }

  const geld: Array<{ art: string; schwelle: number; betrag: number }> = [];
  const gegenstaende: Array<{
    art: string; schwelle: number; name: string;
    kennung?: string; bild?: string | null; sorte?: string | null;
  }> = [];
  let waehrung: string | null = null;

  for (const g of gruppen) {
    for (const r of g.ranks ?? []) {
      for (const p of r.payouts ?? []) {
        if (typeof r.threshold !== 'number') continue;
        if (p.rewardType === 'ecomm' && typeof p.quantity === 'number') {
          waehrung ??= p.value ?? 'USD';
          geld.push({ art: g.scoringType ?? 'rank', schwelle: r.threshold,
            betrag: p.quantity });
        } else if (p.rewardType === 'game' && p.value) {
          /*
           * Die rohe Kennung wandert mit.
           *
           * Aus ihr wird der Name gemacht ("AthenaEmoji:emoji_megaman8bit" ->
           * "Megaman8bit"), aber sie ist auch das Einzige, womit sich das Bild
           * des Gegenstands finden laesst. Ohne sie stuende in der Anzeige ein
           * Name ohne Bild, und Epic zeigt an derselben Stelle beides.
           */
          gegenstaende.push({
            art: g.scoringType ?? 'rank', schwelle: r.threshold,
            name: gegenstandName(p.value), kennung: p.value,
          });
        }
      }
    }
  }

  if (!geld.length) {
    // Tabelle vorhanden, aber ohne Geld - dann gilt ebenfalls die Datei.
    const eigen = await ausDatei();
    if (eigen) return eigen;
  }

  geld.sort((a, b) => a.schwelle - b.schwelle);
  gegenstaende.sort((a, b) => a.schwelle - b.schwelle);

  /*
   * Die Gegenstaende bekommen ihren richtigen Namen und ihr Bild.
   *
   * Aus "Character Dunebriefshift" wird "Mega Man X", und daneben steht das
   * Bild - so wie Epic es selbst zeigt. Was sich nicht nachschlagen laesst,
   * behaelt den entzierten Decknamen; erfunden wird nichts.
   */
  try {
    const bekannt = await holeGegenstaende(
      gegenstaende.map((g) => g.kennung ?? '').filter(Boolean));
    for (const g of gegenstaende) {
      const gefunden = g.kennung ? bekannt.get(g.kennung) : undefined;
      if (!gefunden) continue;
      g.name = gefunden.name;
      g.bild = gefunden.bild;
      g.sorte = gefunden.art;
    }
  } catch { /* dann bleiben die Decknamen stehen */ }

  const gespannt = mitPlaetzen(geld);

  /*
   * Die Gesamtsumme nur bei Platzierungen, und nur wenn jede Stufe eine
   * eigene Schwelle hat. Bei "100 Punkte: 100 $" bekaeme jeder, der die
   * Punkte schafft, den Betrag - da liesse sich nichts aufaddieren, ohne die
   * Teilnehmerzahl zu kennen. Eine erfundene Summe waere schlimmer als keine.
   */
  const nurRang = gespannt.filter((x) => x.art === 'rank');
  const gesamt = nurRang.length && nurRang.length === gespannt.length
    ? summeUeberPlaetze(nurRang) : null;

  return NextResponse.json({
    vorhanden: true, window: window_, region, waehrung,
    geld: gespannt, gegenstaende, gesamt, wertung,
  });
}
