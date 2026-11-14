/*
 * Die Werte je Spieler und Match (Kurven in den Stats wie bei Osirion, Betreiber 7.11.2026: "rechts hat ueberall so eine Art Diagramm").
 *
 * Bei grossen Spieltagen (FNCS-Qualifier: 2.000 Matches, 40.000 Spieler) sind das zehntausende Zeilen - zu viel fuer die Datei, die die Seite bei jedem Klick
 * liest. Deshalb liegen sie in einer eigenen Datei clutch-je/<Fenster>.json: 256 Stuecke hintereinander, je Stueck die Spieler, deren Id dorthin streut
 * (FNV-1a), eine Zeile je Stueck. Wo welches Stueck beginnt, steht in clutch/<Fenster>.json unter "je". Die Seite holt mit einer Teilanfrage (Range) nur
 * das eine Stueck des Spielers - rund hundert Kilobyte statt zwanzig Megabyte.
 */

/** Die Spalten einer Zeile nach der Match-Id. Neue Spalten nur hinten anhaengen: die Seite liest sie ueber diese Liste, alte Dateien bleiben lesbar. */
export const JE_SPALTEN = [
  'killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht',
  'farmHolz', 'farmStein', 'farmMetall', 'samHolz', 'samStein', 'samMetall',
  'editZahl', 'editOk', 'editSek', 'sturmSchaden', 'sturm', 'lebenWeg', 'schildWegEcht', 'dmgAlle',
  'selbstHolz', 'selbstStein', 'selbstMetall', 'todeEcht', 'killsNachAus', 'wiederbelebt', 'rebootet', 'axt', 'busDank',
  'leben', 'strecke',
];

/** Die alten Zeilen (bis 7.11.2026, nur kleine Spieltage): [Match, Elims, Schaden, erlitten, Leben geheilt, Schild geheilt, Kopftreffer, Treffer, Schuesse, Mats gefarmt]. */
const ALT = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht'];
export function alteZeile(z) {
  const raus = [z[0], ...JE_SPALTEN.map(() => null)];
  ALT.forEach((k, i) => { raus[1 + JE_SPALTEN.indexOf(k)] = z[1 + i] ?? null; });
  return raus;
}

const rund = (v, n = 0) => (typeof v === 'number' && Number.isFinite(v) ? (n ? Math.round(v * 10 ** n) / 10 ** n : Math.round(v)) : null);

/** Eine Zeile aus den Werten eines Spielers in einem Match (scripts/clutch-berechnen.mjs, schadenAus) - Leben und Strecke kommen aus eigenen Rechnungen. */
export function jeZeile(matchId, v, leben, strecke) {
  return [matchId, ...JE_SPALTEN.map((k) => {
    if (k === 'leben') return rund(leben);
    if (k === 'strecke') return rund(strecke);
    return rund(v?.[k], k === 'editSek' ? 1 : 0);
  })];
}

export const STUECKE = 256;
/** Dieselbe Streuung wie in app/api/spieler-detail (FNV-1a ueber die kleingeschriebene Id). */
export function stueckVon(id) {
  let h = 2166136261;
  const s = String(id).toLowerCase();
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % STUECKE;
}

/** Alle Zeilen (Id -> Zeilen) als Datei: gibt den Inhalt und die Lage der Stuecke [Anfang, Laenge] in Bytes zurueck. */
export function jeDatei(alle) {
  const stuecke = Array.from({ length: STUECKE }, () => ({}));
  for (const [id, zeilen] of Object.entries(alle)) stuecke[stueckVon(id)][id] = zeilen;
  const teile = []; const lage = []; let pos = 0;
  for (const s of stuecke) {
    const b = Buffer.from(`${JSON.stringify(s)}\n`, 'utf8');
    lage.push([pos, b.length - 1]); teile.push(b); pos += b.length;
  }
  return { inhalt: Buffer.concat(teile), lage };
}

/** Die Match-Ids, zu denen es mindestens eine Zeile gibt. */
export function jeMatchIds(alle) {
  const ids = new Set();
  for (const zeilen of Object.values(alle ?? {})) for (const z of zeilen ?? []) ids.add(z[0]);
  return ids;
}

/**
 * Die gelesenen Matches eines Spieltags ohne eine einzige Zeile (14.11.2026). Bis dahin lud die Sofort-Ablage (clutch-ablegen.yml) clutch/<w>.json hoch, aber nicht
 * clutch-je/<w>.json: die Lage zeigte in eine aeltere Datei, und der naechste Lauf haengte die neuen Zeilen an diese aeltere Datei - die Zeilen der dazwischen
 * eingearbeiteten Teile fehlten fuer immer (70 von 118 Spieltagen, z. B. TriosCashCup_Event2_BR: 122 von 488 Matches). Was hier steht, liest der Planer nach
 * (scripts/clutch-berechnen.mjs, nurJe). "leer" sind Matches, die schon nachgelesen wurden und trotzdem keine Zeile bringen.
 */
export function jeOhneZeilen(matches, alle, leer = []) {
  const da = jeMatchIds(alle);
  const weg = new Set(leer);
  return (matches ?? []).map((m) => m.id).filter((id) => !da.has(id) && !weg.has(id));
}

/** Und zurueck: die ganze Datei lesen (zum Weiterfuehren im naechsten Lauf). */
export function jeLesen(inhalt) {
  const alle = {};
  for (const zeile of String(inhalt).split('\n')) {
    if (!zeile.trim()) continue;
    try { Object.assign(alle, JSON.parse(zeile)); } catch { /* ein kaputtes Stueck fehlt */ }
  }
  return alle;
}
