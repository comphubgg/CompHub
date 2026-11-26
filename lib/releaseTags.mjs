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
  { muster: /^epic-spieltage\/S(\d+)(?:\/|$)/, ordner: /^epic-spieltage\//, alt: 'daten-spieltage', vor: 'daten-spieltage', ueberlauf: true },
  { muster: /^platzierungen\/S(\d+)(?:\/|$)/, ordner: /^platzierungen\//, alt: 'daten-platzierungen', vor: 'daten-platzierungen', ueberlauf: true },
  { muster: /^replays\/S(\d+)(?:\/|$)/, ordner: /^replays\//, alt: 'daten-replays', vor: 'daten-replays' },
];

const saisonTag = (vor, s) => `${vor}-s${s}`;

/*
 * Ueberlauf fuer Spieltage und Platzierungen (18.11.2026): daten-spieltage stand bei 1000 von 1000 Anhaengen (Saison 30 bis 41 und 488 S42-Dateien von vor
 * dem Umzug), daten-platzierungen bei 992. Nachgeholte alte Spieltage (S36 ...) kamen in kein Release - 149 Dateien je Lauf "alle Releases zum Schreiben
 * voll". Jetzt hat jedes dieser Releases (das alte und jedes Saison-Release) drei Ueberlauf-Releases dahinter ("daten-spieltage-ueberlauf-1",
 * "daten-spieltage-s43-ueberlauf-1" ...): ab GETEILT_GRENZE Anhaengen gehen neue Dateien ins erste mit Platz. Was schon liegt, bleibt, wo es ist, und wird
 * dort ersetzt (tagsFuer(...)[0] ist unveraendert). Gelesen wird ein Ueberlauf direkt nach seinem Stamm - vor dem alten Release, damit eine neue Fassung
 * einer S42-Datei vor ihrer alten Kopie in daten-spieltage gefunden wird.
 */
const GETEILT_UEBERLAUF = 3;
export const GETEILT_GRENZE = 950;
/** Die Ueberlauf-Releases eines Spieltag- oder Platzierungs-Releases, in dieser Reihenfolge. */
export const geteiltUeberlauf = (stamm) => Array.from({ length: GETEILT_UEBERLAUF }, (unbenutzt, i) => `${stamm}-ueberlauf-${i + 1}`);
const mitUeberlauf = (g, stamm) => (g.ueberlauf ? [stamm, ...geteiltUeberlauf(stamm)] : [stamm]);

/**
 * Monate, deren Replay-Release (daten-replayvoll-JJJJ-MM) die tausend Anhaenge erreicht hat (September 2026; der Oktober am 20.10.2026 mit 999 - ab da kam
 * keine Auswertung mehr ans Release, der Index meldete sie aber als fertig). Fuer sie gibt es weitere Releases ("-b", "-c" ...), auf die sich die Matches nach
 * ihrem Dateinamen verteilen. Ab Oktober 2026 gilt das fuer jeden Monat gleich (drei weitere Releases = 3000 Anhaenge zusaetzlich).
 */
const VOLLE_MONATE = new Map([['2026-09', 1]]);
const WEITERE_AB = '2026-10';
const WEITERE_RELEASES = 3;
/**
 * Ab Dezember 2026 32 statt drei: die FNCS-Qualifier fuellten den November in drei Tagen (6.11.2026: -b, -c und -d voll, das Performance-Finale hatte keine
 * Datei und die Zonen luden endlos), und bis zum 13.11. waren auch die 16 Nachtraege voll (rund 19.000 Matches in zwei Wochen). Die acht, die hier zuerst
 * standen, haetten keinen halben Monat gereicht. Noch liegt keine Dezember-Datei am Release - die Zahl darf sich bis dahin noch aendern, danach nie mehr.
 */
const WEITERE_RELEASES_NEU = 32;
const NEU_AB = '2026-12';
const weitereZahl = (monat) => (monat >= NEU_AB ? WEITERE_RELEASES_NEU : monat >= WEITERE_AB ? WEITERE_RELEASES : VOLLE_MONATE.get(monat) ?? 0);
/** Monate, die nachtraeglich weitere Releases bekamen: dorthin wird geschrieben, die alten bleiben zum Lesen. Die Verteilung der alten darf sich nicht aendern, sonst fuehren die Adressen ins Leere. */
const NACHTRAG = new Map([['2026-11', 6]]);
/**
 * Ein zweiter Nachtrag (7.11.2026): auch -b bis -j waren mit je 1.000 Anhaengen voll - die Replays der FNCS Solos Reload Round 2 lagen in keinem Release,
 * die Seite zeigte "Die Auswertung ist gerade nicht lesbar". Neue Matches gehen in diese, gelesen wird danach weiter in den alten (Verteilung unveraendert).
 */
const NACHTRAG2 = new Map([['2026-11', 10]]);
/**
 * Ein dritter Nachtrag (15.11.2026): -k bis -t waren am 13.11. voll, die FNCS Solos Reload Heats (14./15.11., alle Regionen) kamen in kein Release - der Ablauf
 * meldete "file_count limited to 1000 assets per release" und lief gruen weiter (der Schritt endet in "|| true"). Dreissig weitere ab "-u"; nach "-z" geht
 * es mit "-z01", "-z02" ... weiter. Alte Adressen bleiben, wie sie sind.
 */
const NACHTRAG3 = new Map([['2026-11', 30]]);
/**
 * Ueberlauf: ist das Release, in das eine Match-Datei nach ihrer Streuung gehoert, voll, schreibt der Hochlader (scripts/ablage-github.mjs) sie ins erste
 * Ueberlauf-Release mit Platz, statt still zu scheitern. Gelesen werden sie nach allen anderen - wer im Streu-Release liegt, kostet keine Anfrage mehr.
 */
const UEBERLAUF = 8;
const UEBERLAUF_AB = '2026-11';
/** Der Name des i-ten weiteren Releases (0 = "-b"): erst Buchstaben bis "-z", dann "-z01", "-z02" ... - die bisherigen Namen bleiben unveraendert. */
const zusatz = (basis, i) => `${basis}-${i < 25 ? String.fromCharCode(98 + i) : `z${String(i - 24).padStart(2, '0')}`}`;
const ueberlaufTags = (monat) => (monat >= UEBERLAUF_AB ? Array.from({ length: UEBERLAUF }, (unbenutzt, i) => `daten-replayvoll-${monat}-ueberlauf-${i + 1}`) : []);
/*
 * Ueberlauf fuer die Solo Clutch Points (15.11.2026): daten-clutch stand vor FNCS Heat 2 bei 909 von 1000 Anhaengen (eine Datei je Spieltag, dazu
 * _listen.json und _uebersprungen-*.json), daten-clutch-roh bei 615. Ist ein Release voll, antwortet GitHub mit 422 "file_count limited to 1000" - und der
 * Ablauf lief gruen weiter. Jetzt: ab CLUTCH_GRENZE Anhaengen schreibt der Hochlader (scripts/ablage-github.mjs) neue Dateien ins erste Ueberlauf-Release
 * mit Platz ("daten-clutch-ueberlauf-1" ...); gelesen werden sie nach dem Stamm-Release. Was schon im Stamm-Release liegt, bleibt dort (tagsFuer(...)[0]
 * ist unveraendert) und wird dort auch ersetzt. Die Grenze liegt unter 1000, damit das Ersetzen (".neu" neben der alten Fassung) Platz hat.
 */
const CLUTCH_UEBERLAUF = 4;
export const CLUTCH_GRENZE = 980;
const clutchUeberlauf = (stamm) => Array.from({ length: CLUTCH_UEBERLAUF }, (unbenutzt, i) => `${stamm}-ueberlauf-${i + 1}`);
/** Wie viele Anhaenge ein Release hoechstens bekommt, bevor neue Dateien ins naechste der Schreib-Reihe gehen (null = die allgemeine Grenze des Hochladers). */
export function schreibGrenze(tag) {
  if (/^daten-(spieltage|platzierungen)(-s\d+)?(-ueberlauf-\d+)?$/.test(tag)) return GETEILT_GRENZE;
  return /^daten-clutch(-roh)?(-ueberlauf-\d+)?$/.test(tag) ? CLUTCH_GRENZE : null;
}
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
  // Weltrangliste und Spieler-Kreis: nur eine Handvoll Dateien, aber im
  // vollen Release nicht mehr zu ersetzen - darum ein eigenes.
  if (/^(power-rankings|spieler-kreis)\//.test(name)) return ['daten-rangliste', 'daten-spieltage'];
  /*
   * Die Auswertungen je Fenster (replays/S42/<Fenster>/_aggregat.json und _zustand.json): das Saison-Release stand am 26.10.2026 bei 946 von 1000 Anhaengen
   * (zwei Dateien je Fenster, rund 470 Fenster). Neue und erneuerte Dateien gehen deshalb auf zwei weitere Releases ("-b", "-c", nach dem Fenster gestreut,
   * beide Dateien eines Fensters zusammen); gelesen wird in der Reihenfolge Streuung, Saison-Release, altes Release - was dort noch liegt, bleibt lesbar.
   */
  { const m = name.match(/^replays\/S(\d+)\/([^/]+)\/[^/]+$/);
    if (m && Number(m[1]) >= ERSTE_GETEILTE_SAISON) { const basis = saisonTag('daten-replays', m[1]); return [`${basis}-${streuung(m[2]) % 2 ? 'c' : 'b'}`, basis, 'daten-replays']; } }
  { const m = name.match(/^replays\/S(\d+)\/?$/);
    if (m && Number(m[1]) >= ERSTE_GETEILTE_SAISON) { const basis = saisonTag('daten-replays', m[1]); return [`${basis}-b`, `${basis}-c`, basis, 'daten-replays']; } }
  if (/^epic-spieltage\//.test(name) || /^platzierungen\//.test(name) || /^replays\//.test(name)) {
    for (const g of GETEILT) {
      if (!g.ordner.test(name)) continue;
      const m = name.match(g.muster);
      if (m) {
        const s = Number(m[1]);
        return s >= ERSTE_GETEILTE_SAISON ? [...mitUeberlauf(g, saisonTag(g.vor, s)), g.alt] : mitUeberlauf(g, g.alt);
      }
      // Ein Ordner oder eine Datei ohne Saison im Namen: alle Saison-Releases (die neuesten zuerst, jedes mit seinem Ueberlauf), dann das alte.
      const neu = [];
      for (let s = LETZTE_SAISON; s >= ERSTE_GETEILTE_SAISON; s -= 1) neu.push(...mitUeberlauf(g, saisonTag(g.vor, s)));
      return name.endsWith('/') ? [...neu, ...mitUeberlauf(g, g.alt)] : mitUeberlauf(g, g.alt);
    }
  }
  if (/^tournament-leaderboards\//.test(name)) return ['daten-leaderboards'];
  // Solo Clutch Points: eigenes Release, geschrieben nur vom Ablauf "Clutch rechnen"
  // (zwei Schreiber an einem Manifest verlieren sich gegenseitig Eintraege).
  // Ist das Stamm-Release voll (CLUTCH_GRENZE), kommen neue Dateien in die Ueberlauf-Releases dahinter (clutchUeberlauf); was schon liegt, bleibt, wo es ist.
  if (/^clutch\//.test(name)) return ['daten-clutch', ...clutchUeberlauf('daten-clutch')];
  if (/^clutch-roh\//.test(name)) return ['daten-clutch-roh', ...clutchUeberlauf('daten-clutch-roh')];
  // Der Stand eines laufenden Neu-Lesens neben der veroeffentlichten Datei (scripts/clutch-zusammen.mjs, UMBAU, 16.11.2026) - Datei, Werte je Match, Rohdaten.
  if (/^clutch-umbau(-je|-roh)?\//.test(name)) return ['daten-clutch-umbau'];
  // Die Werte je Spieler und Match (lib/jeSpiel.mjs), je Saison ein Release - eine Datei je Spieltag.
  { const m = name.match(/^clutch-je\/(S\d+)_/i); if (m) return [`daten-clutch-je-${m[1].toLowerCase()}`]; }
  if (/^clutch-je\//.test(name)) return ['daten-clutch-je'];
  // Deep Stats je Spieltag (scripts/clutch-zusammen.mjs, lib/tiefeWerte): Zusammenfassung (clutch-tief/) und Beitraege je Match (clutch-tief-je/), je Saison ein
  // Release, eine Datei je Spieltag; dazu clutch-tief/_liste.json.
  { const m = name.match(/^clutch-tief(-je)?\/(S\d+)_/i); if (m) return [`daten-clutch-tief${m[1] ?? ''}-${m[2].toLowerCase()}`]; }
  if (/^clutch-tief(-je)?\//.test(name)) return ['daten-clutch-tief'];
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
      const weitere = Array.from({ length: k }, (unbenutzt, i) => zusatz(basis, i));
      const dazu = Array.from({ length: NACHTRAG.get(m[1]) ?? 0 }, (unbenutzt, i) => zusatz(basis, k + i));
      const dazu2 = Array.from({ length: NACHTRAG2.get(m[1]) ?? 0 }, (unbenutzt, i) => zusatz(basis, k + dazu.length + i));
      const dazu3 = Array.from({ length: NACHTRAG3.get(m[1]) ?? 0 }, (unbenutzt, i) => zusatz(basis, k + dazu.length + dazu2.length + i));
      const ueber = ueberlaufTags(m[1]);
      // Eine einzelne Match-Datei (Fenster/Id.json) hat ein Release zum Schreiben (dazu die Ueberlauf-Releases); ein Ordner oder das Verzeichnis liest sie alle.
      if (k > 1 && /^[^/]+\/[^/]+\.json$/.test(m[2])) {
        const h = streuung(m[2]);
        let alt = dazu.length ? [dazu[h % dazu.length], weitere[h % k], basis] : [weitere[h % k], basis];
        if (dazu2.length) alt = [dazu2[h % dazu2.length], ...alt];
        if (dazu3.length) alt = [dazu3[h % dazu3.length], ...alt];
        return [...alt, ...ueber];
      }
      return [...dazu3, ...dazu2, ...dazu, ...weitere, basis, ...ueber];
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

/**
 * Die Releases, in die eine Datei geschrieben werden darf, in dieser Reihenfolge: das erste mit Platz (oder das, das sie schon hat) bekommt sie.
 * Fuer fast alles nur tagFuer(name); fuer Spieltage und Platzierungen dazu der Ueberlauf ihres Releases (geteiltUeberlauf); fuer Match-Dateien der voll ausgelesenen Replays dazu die Ueberlauf-Releases ihres Monats; fuer clutch/ und
 * clutch-roh/ das Stamm-Release und seine Ueberlauf-Releases (dieselbe Reihe wie zum Lesen).
 */
export function schreibTagsFuer(name) {
  const tags = tagsFuer(name);
  if (/^clutch(-roh)?\//.test(name)) return tags;
  // Spieltage und Platzierungen: das Stamm-Release und sein Ueberlauf (nie das alte Release einer Saison-Datei - dort liegt nur, was vor dem Umzug kam).
  if (/^(epic-spieltage|platzierungen)\/./.test(name) && !name.endsWith('/')) return [tags[0], ...geteiltUeberlauf(tags[0])];
  const m = name.match(/^replay-voll\/(\d{4}-\d{2})\/[^/]+\/[^/]+\.json$/);
  if (!m) return [tags[0]];
  const ueber = ueberlaufTags(m[1]);
  return [tags[0], ...ueber.filter((t) => t !== tags[0])];
}

/**
 * Das Release, in das eine Datei geschrieben wird: das erste der Schreib-Reihe (schreibTagsFuer), das sie schon hat; sonst das erste, das noch unter seiner
 * Grenze liegt; sonst null (kein Platz - der Hochlader meldet das laut als ::error::). nachsehen(tag) -> { hat, anzahl }; grenze(tag) -> Anhaenge hoechstens.
 */
export async function schreibZiel(name, nachsehen, grenze) {
  const ziele = schreibTagsFuer(name);
  for (const tag of ziele) if ((await nachsehen(tag)).hat) return tag;
  for (const tag of ziele) if ((await nachsehen(tag)).anzahl < grenze(tag)) return tag;
  return null;
}
