import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { heimatRegionen } from '@/lib/szeneStats';
import { DATEN_ORT } from '@/lib/datenOrt';

// Spielervorschlaege fuer einen Beitrag - aus echten Zahlen, nach offener Regel.
//
// Fuer eine Frage wie "who is the most underrated player right now?" braucht
// es Namen, die zur Frage passen. Geraten wird dabei nichts: gerechnet wird
// aus data/spielerbilder.json, wo zu jedem Konto Matches, Events und
// Eliminierungen stehen.
//
// "Unterschaetzt" ist ein Urteil, keine Messgroesse - deshalb wird die Regel
// mitgeliefert und in der Oberflaeche genannt, statt eine Rangliste zu
// behaupten:
//
//   stark   = viele Eliminierungen je Match
//   leise   = unterdurchschnittlich viele Turnierauftritte
//
// Wer beides erfuellt, faellt auf. Ob er wirklich unterschaetzt ist,
// entscheidet weiterhin der Mensch davor.
//
//   ?art=underrated | topelims   &anzahl=9
//
// Nur Konten mit echtem Foto: das Bild darunter braucht Gesichter, und wer
// keins hat, waere dort eine Silhouette.

export const revalidate = 0;

const MINDEST_MATCHES = 40;

/*
 * Wie sich die Vorschlaege auf die Regionen verteilen.
 *
 * Das Werkzeug ist in Europa bekannt, und ein Beitrag mit lauter Namen aus
 * Asien geht dort an den Lesern vorbei. Der Betreiber: "Am meisten
 * Europaspieler und andere NAC Spieler", aus dem Rest "eins, zwei ... aber
 * auch nicht mehr".
 *
 * Die Heimat kommt aus heimatRegionen(): dort zaehlt, wo ein Konto
 * tatsaechlich am haeufigsten gespielt hat - nicht, wo zufaellig ein
 * einzelner Spieltag lief.
 */
const ANDERE_HOECHSTENS = 2;
const EU_ANTEIL = 0.62;

interface RohSpieler {
  epicId?: string; name?: string; datei?: string;
  echtesFoto?: boolean | string;
  matches?: number | string; events?: number | string; elims?: number | string;
}

const zahl = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
const jaNein = (x: unknown) => String(x).toLowerCase() === 'true' || x === true;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const art = p.get('art') ?? 'underrated';
  const anzahl = Math.max(1, Math.min(20, Number(p.get('anzahl')) || 9));

  let roh: RohSpieler[];
  try {
    roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spielerbilder.json'), 'utf8'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const feld = roh
    .filter((x) => x.epicId && jaNein(x.echtesFoto))
    .map((x) => ({
      epicId: x.epicId as string,
      name: x.name ?? '',
      matches: zahl(x.matches),
      events: zahl(x.events),
      elims: zahl(x.elims),
    }))
    .filter((x) => x.matches >= MINDEST_MATCHES);

  if (!feld.length) {
    return NextResponse.json({
      art, regel: null, spieler: [],
      hinweis: 'Zu wenige Konten mit Foto und genug Matches.',
    });
  }

  for (const x of feld as Array<typeof feld[number] & { proMatch: number }>) {
    x.proMatch = +(x.elims / Math.max(1, x.matches)).toFixed(2);
  }
  const mitQuote = feld as Array<typeof feld[number] & { proMatch: number }>;

  let gewaehlt = mitQuote;
  let regel: string;

  if (art === 'underrated') {
    /*
     * Der Median der Auftritte trennt laut von leise.
     *
     * Ein fester Schwellwert waere willkuerlich und mit jeder Season falsch;
     * der Median passt sich dem Feld an und laesst immer ungefaehr die
     * Haelfte uebrig.
     */
    const sortiert = [...mitQuote].map((x) => x.events).sort((a, b) => a - b);
    const median = sortiert[Math.floor(sortiert.length / 2)] ?? 0;
    gewaehlt = mitQuote.filter((x) => x.events <= median);
    regel = `At least ${MINDEST_MATCHES} matches, at most ${median} events `
      + '(below the median), sorted by eliminations per match.';
  } else {
    regel = `At least ${MINDEST_MATCHES} matches, sorted by eliminations per match.`;
  }

  const nachStaerke = [...gewaehlt].sort((a, b) => b.proMatch - a.proMatch);

  let heimat: Map<string, string>;
  try { heimat = await heimatRegionen(); } catch { heimat = new Map(); }
  const regionVon = (id: string) => heimat.get(id) ?? '';

  const eu = nachStaerke.filter((x) => regionVon(x.epicId) === 'EU');
  const nac = nachStaerke.filter((x) => regionVon(x.epicId) === 'NAC');
  const rest = nachStaerke.filter((x) => !['EU', 'NAC'].includes(regionVon(x.epicId)));

  const wieVieleAndere = Math.min(ANDERE_HOECHSTENS, Math.floor(anzahl / 5));
  const fuerKern = anzahl - wieVieleAndere;
  const wieVieleEu = Math.ceil(fuerKern * EU_ANTEIL);

  const spieler: typeof nachStaerke = [];
  /*
   * Je Gruppe zaehlen, nicht je Region.
   *
   * Zuerst zaehlte ich, wie viele derselben Region schon dastehen - bei
   * "hoechstens zwei von anderswo" haette dann je ein Spieler aus Ozeanien,
   * Brasilien und Asien durchgepasst, weil jede Region fuer sich unter der
   * Grenze blieb. Gemeint ist die Gruppe als Ganzes.
   */
  const dazu = (liste: typeof nachStaerke, wie: number) => {
    let genommen = 0;
    for (const x of liste) {
      if (spieler.length >= anzahl || genommen >= wie) return;
      if (spieler.includes(x)) continue;
      spieler.push(x);
      genommen++;
    }
  };
  dazu(eu, wieVieleEu);
  dazu(nac, fuerKern - wieVieleEu);
  dazu(rest, wieVieleAndere);
  // Bleibt ein Platz frei, weil eine Region zu duenn besetzt ist, fuellt der
  // Staerkste auf - eine Luecke im Bild waere schlechter als ein Name mehr
  // aus derselben Region.
  for (const x of nachStaerke) {
    if (spieler.length >= anzahl) break;
    if (!spieler.includes(x)) spieler.push(x);
  }

  const verteilung: Record<string, number> = {};
  for (const x of spieler) {
    const r = regionVon(x.epicId) || '?';
    verteilung[r] = (verteilung[r] ?? 0) + 1;
  }

  return NextResponse.json({
    art,
    regel: `${regel} Mostly EU, then NAC, at most ${ANDERE_HOECHSTENS} from elsewhere.`,
    gepruefte: mitQuote.length,
    verteilung,
    spieler: spieler.map((x) => ({ ...x, region: regionVon(x.epicId) || null })),
  });
}
