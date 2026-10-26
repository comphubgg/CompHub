/*
 * In welchem GitHub-Release liegt welche Datei? - die eine Regel fuer Seite
 * (lib/ablageGithub.ts), Hochlader (scripts/ablage-github.mjs) und Holer
 * (scripts/ablage-github-holen.mjs).
 *
 * Ein Release fasst hoechstens tausend Anhaenge. Am 11. und 12.10.2026 waren
 * daten-spieltage und daten-replays genau dort angekommen: kein neuer Anhang
 * ging mehr hinein, und weil ein Ersetzen die neue Fassung erst als ".neu"
 * daneben legt, ging auch das nicht mehr. Spieltage, Weltrangliste,
 * Platzierungen und Replays blieben auf dem Stand vom 11.10. stehen - die Seite
 * zeigte neun Tage alte Zahlen. daten-szene (945) und daten-platzierungen
 * (910) waren die naechsten.
 *
 * Deshalb liegt ab der Saison 42 je Saison ein eigenes Release
 * ("daten-spieltage-s42" ...). Was bis Saison 41 galt, bleibt, wo es liegt:
 * Vergangenes soll dauerhaft abrufbar bleiben, und das Umziehen kostete
 * tausende Anfragen. Gelesen wird immer in dieser Reihenfolge - erst das
 * Saison-Release, dann das alte. Eine Datei, die schon vor dem Umzug im alten
 * Release lag, bleibt dort lesbar, bis das neue sie ersetzt.
 */

/** Ab dieser Saison bekommt jede ihr eigenes Release. */
export const ERSTE_GETEILTE_SAISON = 42;
/** Bis hierhin sucht ein Leser auf Vorrat nach Saison-Releases (Ordner ohne Saison im Namen). */
export const LETZTE_SAISON = 58;

/** Die Ordner, die je Saison geteilt werden: Muster mit der Saisonzahl in Gruppe 1, das alte Release, die Vorsilbe. */
const GETEILT = [
  { muster: /^epic-spieltage\/S(\d+)(?:\/|$)/, ordner: /^epic-spieltage\//, alt: 'daten-spieltage', vor: 'daten-spieltage' },
  { muster: /^platzierungen\/S(\d+)(?:\/|$)/, ordner: /^platzierungen\//, alt: 'daten-platzierungen', vor: 'daten-platzierungen' },
  { muster: /^szene-stats\/[^/]+\/S(\d+)(?:\/|$)/, ordner: /^szene-stats\//, alt: 'daten-szene', vor: 'daten-szene' },
  { muster: /^replays\/S(\d+)(?:\/|$)/, ordner: /^replays\//, alt: 'daten-replays', vor: 'daten-replays' },
];

const saisonTag = (vor, s) => `${vor}-s${s}`;

/**
 * Monate, deren Replay-Release (daten-replayvoll-JJJJ-MM) die tausend Anhaenge erreicht hat (September 2026; der Oktober am 20.10.2026 mit 999 - ab da kam
 * keine Auswertung mehr ans Release, der Index meldete sie aber als fertig). Fuer sie gibt es weitere Releases ("-b", "-c" ...), auf die sich die Matches nach
 * ihrem Dateinamen verteilen. Ab Oktober 2026 gilt das fuer jeden Monat gleich (drei weitere Releases = 3000 Anhaenge zusaetzlich).
 */
const VOLLE_MONATE = new Map([['2026-09', 1]]);
const WEITERE_AB = '2026-10';
const WEITERE_RELEASES = 3;
const weitereZahl = (monat) => (monat >= WEITERE_AB ? WEITERE_RELEASES : VOLLE_MONATE.get(monat) ?? 0);
/** Eine feste Streuung aus dem Dateinamen (FNV-1a) - Schreiber und Leser kommen so immer zum selben Release. */
function streuung(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * Alle Releases, in denen diese Datei (oder, bei einem Namen mit "/" am Ende,
 * dieser Ordner) liegen kann - das, in das geschrieben wird, zuerst.
 */
export function tagsFuer(name) {
  if (/^akten\//.test(name)) return ['daten-akten'];
  // Weltrangliste und Quelle der Szene: nur eine Handvoll Dateien, aber im
  // vollen Release nicht mehr zu ersetzen - darum ein eigenes.
  if (/^(power-rankings|szene-quelle)\//.test(name)) return ['daten-rangliste', 'daten-spieltage'];
  /*
   * Die Auswertungen je Fenster (replays/S42/<Fenster>/_aggregat.json und _zustand.json): das Saison-Release stand am 26.10.2026 bei 946 von 1000 Anhaengen
   * (zwei Dateien je Fenster, rund 470 Fenster). Neue und erneuerte Dateien gehen deshalb auf zwei weitere Releases ("-b", "-c", nach dem Fenster gestreut,
   * beide Dateien eines Fensters zusammen); gelesen wird in der Reihenfolge Streuung, Saison-Release, altes Release - was dort noch liegt, bleibt lesbar.
   */
  { const m = name.match(/^replays\/S(\d+)\/([^/]+)\/[^/]+$/);
    if (m && Number(m[1]) >= ERSTE_GETEILTE_SAISON) { const basis = saisonTag('daten-replays', m[1]); return [`${basis}-${streuung(m[2]) % 2 ? 'c' : 'b'}`, basis, 'daten-replays']; } }
  { const m = name.match(/^replays\/S(\d+)\/?$/);
    if (m && Number(m[1]) >= ERSTE_GETEILTE_SAISON) { const basis = saisonTag('daten-replays', m[1]); return [`${basis}-b`, `${basis}-c`, basis, 'daten-replays']; } }
  if (/^epic-spieltage\//.test(name) || /^platzierungen\//.test(name) || /^szene-stats\//.test(name) || /^replays\//.test(name)) {
    for (const g of GETEILT) {
      if (!g.ordner.test(name)) continue;
      const m = name.match(g.muster);
      if (m) {
        const s = Number(m[1]);
        return s >= ERSTE_GETEILTE_SAISON ? [saisonTag(g.vor, s), g.alt] : [g.alt];
      }
      // Ein Ordner oder eine Datei ohne Saison im Namen: alle Saison-Releases (die neuesten zuerst), dann das alte.
      const neu = [];
      for (let s = LETZTE_SAISON; s >= ERSTE_GETEILTE_SAISON; s -= 1) neu.push(saisonTag(g.vor, s));
      return name.endsWith('/') ? [...neu, g.alt] : [g.alt];
    }
  }
  if (/^tournament-leaderboards\//.test(name)) return ['daten-leaderboards'];
  // Solo Clutch Points: eigenes Release, geschrieben nur vom Ablauf "Clutch rechnen"
  // (zwei Schreiber an einem Manifest verlieren sich gegenseitig Eintraege).
  if (/^clutch\//.test(name)) return ['daten-clutch'];
  if (/^clutch-roh\//.test(name)) return ['daten-clutch-roh'];
  // Die Team-Historie der Spieler (scripts/team-verlauf-holen.mjs) - eigenes
  // Release, geschrieben nur von diesem Ablauf.
  if (name === 'team-verlauf.json') return ['daten-teams'];
  // Die Scrims: Tagesdateien je Monat ein Release (hoechstens tausend
  // Anhaenge je Release), das Verzeichnis fuer sich - scripts/scrims-holen.mjs.
  { const m = name.match(/^scrims\/(\d{4}-\d{2})-\d{2}\//); if (m) return [`daten-scrims-${m[1]}`]; }
  if (/^scrims\//.test(name)) return ['daten-scrims'];
  // Voll ausgelesene Replays je Monat (scripts/replay-voll-holen.mjs), das
  // Verzeichnis selbst am allgemeinen Release. Ist ein Monat mit tausend Anhaengen
  // voll (September 2026), kommen neue Matches in ein zweites Release ("-b", steht
  // vorn - dorthin wird geschrieben); gelesen werden beide.
  {
    const m = name.match(/^replay-voll\/(\d{4}-\d{2})\/(.*)$/);
    if (m) {
      const basis = `daten-replayvoll-${m[1]}`;
      const k = weitereZahl(m[1]);
      if (!k) return [basis];
      const weitere = Array.from({ length: k }, (unbenutzt, i) => `${basis}-${String.fromCharCode(98 + i)}`);
      // Eine einzelne Match-Datei (Fenster/Id.json) hat genau ein Release zum Schreiben; ein Ordner oder das Verzeichnis liest sie alle.
      if (k > 1 && /^[^/]+\/[^/]+\.json$/.test(m[2])) return [weitere[streuung(m[2]) % k], basis];
      return [...weitere, basis];
    }
  }
  // Die schlanken Replay-Werte fuer die Seite (scripts/replays-schlank.mjs), je Saison ein Release.
  { const m = name.match(/^replays-schlank\/(S\d+)\//i); if (m) return [`daten-replays-schlank-${m[1].toLowerCase()}`]; }
  return ['daten'];
}

/** Das Release, in das eine Datei geschrieben wird. */
export function tagFuer(name) {
  return tagsFuer(name)[0];
}
