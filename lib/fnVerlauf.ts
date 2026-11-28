/*
 * Der lange Verlauf von Fortnites Entdecken (28.11.2026, Inselseite des neuen Hubs).
 *
 * Epics Data API behaelt nur sieben Tage; Seiten wie fortnite.gg zeigen dagegen den Hoechststand aller Zeiten, Kurven ueber Monate und eine
 * Zeitleiste, in welchen Reihen von Discover eine Insel stand. Das gibt es nur, wenn man es selbst aufschreibt - ab jetzt tut das der Takt von
 * lib/fnEntdecken (alle fuenf Minuten ein Stand), und hier wird er abgelegt:
 *
 *   fn-verlauf/tage/<JJJJ-MM-TT>.tsv   ein Tag (UTC), je Code eine Zeile:
 *                                        <code> TAB <24 Werte, durch Komma, leer = in der Stunde nicht gesehen> TAB <Discover: h.r.p durch Leerzeichen>
 *                                      h = Stunde 0..23, r = Nummer der Reihe aus der Kopfzeile "#reihen", p = Platz in der Reihe (ab 1)
 *   fn-verlauf/spitzen.tsv             je Code: <code> TAB <Hoechststand> TAB <Stunde des Hoechststands, ms> TAB <zuerst gesehen, ms>
 *                                      Kopfzeile: #fn-verlauf-spitzen TAB 1 TAB <Beginn der Aufzeichnung, ms>
 *
 * Warum Zeilen statt JSON: die Leseschnittstelle (app/api/fn-verlauf) braucht EINEN Code ueber viele Tage. Mit einer Zeile je Code ist das ein
 * Buffer.indexOf je Tag - kein JSON.parse von hunderten Kilobyte je Tag und keine Objekte fuer tausend fremde Codes im Speicher.
 *
 * Gefuehrt wird jeder Code, den der Stand mit einer Spielerzahl nennt (alle Eintraege und die Spiellisten von Epics Modi), je Stunde der HOECHSTE
 * Stand (wie bisher: ein Neustart oder ein zweiter Vorgang verfaelscht ihn nicht, max ist max). Discover nach derselben Regel: je Stunde jede Reihe,
 * in der die Insel in einer der Beobachtungen stand, mit dem BESTEN Platz der Stunde (min ist min).
 *
 * Im Arbeitsspeicher liegt nur, was noch nicht im Archiv steht (der laufende Tag, um Mitternacht kurz auch der vorige): rund tausend Codes mal 24
 * Zahlen. Geschrieben wird hoechstens alle zwanzig Minuten, das erste Mal fuenf Minuten nach dem ersten Stand (Neustarts kommen oft - so geht
 * hoechstens eine Viertelstunde verloren), Tag und Spitzen in EINEM Commit (lib/ablage aendereMehrere). Beim Beenden wird versucht, den Rest
 * noch hinauszubringen.
 *
 * Abgeloest wird damit fn-entdecken-verlauf.json (sieben Tage, nur die oberen sechzig je Stand): beim allerersten Schreiben (spitzen.tsv fehlt
 * noch) werden seine Stunden in die Tage uebernommen, danach wird es nicht mehr geschrieben. /api/fn-entdecken?verlauf=1 liest von hier.
 */

import { aendereMehrere, liesJson, speicher } from '@/lib/ablage';

const STUNDE_MS = 3_600_000;
const ORDNER = 'fn-verlauf/tage';
const SPITZEN = 'fn-verlauf/spitzen.tsv';
const ALT = 'fn-entdecken-verlauf.json';
const SCHREIB_ABSTAND_MS = 20 * 60_000;
const ERSTES_SCHREIBEN_MS = 5 * 60_000;
/** Laengster Zeitraum einer Abfrage (gelesen wird je Tag eine Datei). */
const TAGE_HOECHSTENS = 3 * 366;

const tagDatei = (tag: string) => `${ORDNER}/${tag}.tsv`;
const tagVon = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const tagBeginn = (tag: string) => Date.parse(`${tag}T00:00:00Z`);
const sauber = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

/* ------------------------------------------------------------ Ein Tag */

interface Tag {
  tag: string;
  /** Zaehlt jede Aenderung im Speicher - was waehrend des Schreibens dazukam, bleibt offen. */
  fassung: number;
  /** Reihe -> Titel, in der Reihenfolge, in der Epic sie zeigt. */
  titel: Map<string, string>;
  /** Code -> 24 Werte (0 = in der Stunde nicht gesehen - Codes ohne Spieler fuehrt der Stand nicht). */
  werte: Map<string, number[]>;
  /** Je Stunde: Reihe -> (Code -> bester Platz der Stunde, ab 1). undefined = in der Stunde keine Beobachtung. */
  discover: Array<Map<string, Map<string, number>> | undefined>;
}

const leererTag = (tag: string): Tag => ({ tag, fassung: 0, titel: new Map(), werte: new Map(), discover: new Array(24).fill(undefined) });
/** Einen Platz eintragen - der bessere (kleinere) bleibt. */
function platzSetzen(t: Tag, h: number, reihe: string, code: string, p: number) {
  const stunde = (t.discover[h] ??= new Map());
  let r = stunde.get(reihe);
  if (!r) { r = new Map(); stunde.set(reihe, r); }
  const da = r.get(code);
  if (da === undefined || p < da) r.set(code, p);
}

function liesTag(roh: Buffer | null, tag: string): Tag {
  const t = leererTag(tag);
  if (!roh) return t;
  let reihen: string[] = [];
  for (const zeile of roh.toString('utf8').split('\n')) {
    if (!zeile) continue;
    const teile = zeile.split('\t');
    if (zeile.startsWith('#reihen')) {
      reihen = [];
      for (let i = 1; i < teile.length; i += 2) { reihen.push(teile[i]); t.titel.set(teile[i], teile[i + 1] ?? ''); }
      continue;
    }
    if (zeile.startsWith('#')) continue;
    const [code, w, d] = teile;
    if (!code) continue;
    const werte = (w ?? '').split(',').slice(0, 24).map((x) => Number(x) || 0);
    while (werte.length < 24) werte.push(0);
    t.werte.set(code, werte);
    for (const e of (d ?? '').split(' ')) {
      const [h, r, p] = e.split('.').map(Number);
      const name = reihen[r];
      if (h >= 0 && h < 24 && name && p >= 1) platzSetzen(t, h, name, code, p);
    }
  }
  return t;
}

function schreibTag(t: Tag): Buffer {
  const reihen = [...t.titel.keys()];
  for (const s of t.discover) for (const n of s?.keys() ?? []) if (!t.titel.has(n)) { t.titel.set(n, ''); reihen.push(n); }
  const nummer = new Map(reihen.map((n, i) => [n, i]));
  const dis = new Map<string, string[]>();
  t.discover.forEach((s, h) => {
    for (const [n, codes] of s ?? []) for (const [c, p] of codes) { let l = dis.get(c); if (!l) { l = []; dis.set(c, l); } l.push(`${h}.${nummer.get(n)}.${p}`); }
  });
  const zeilen = [`#fn-verlauf\t1\t${t.tag}`, ['#reihen', ...reihen.flatMap((n) => [n, sauber(t.titel.get(n) ?? '')])].join('\t')];
  for (const [code, w] of t.werte) zeilen.push(`${code}\t${w.map((x) => (x > 0 ? String(x) : '')).join(',')}\t${(dis.get(code) ?? []).join(' ')}`);
  return Buffer.from(zeilen.join('\n') + '\n', 'utf8');
}

/** Zwei Fassungen eines Tages zu einer: je Stunde der hoehere Wert, in Discover je Stunde und Reihe der bessere Platz. */
function mische(a: Tag, b: Tag): Tag {
  const t = leererTag(a.tag);
  for (const [n, x] of a.titel) t.titel.set(n, x);
  for (const [n, x] of b.titel) if (x || !t.titel.has(n)) t.titel.set(n, x);
  for (const v of [a, b]) {
    for (const [code, w] of v.werte) {
      const ziel = t.werte.get(code);
      if (!ziel) { t.werte.set(code, [...w]); continue; }
      for (let i = 0; i < 24; i += 1) if (w[i] > ziel[i]) ziel[i] = w[i];
    }
  }
  for (const v of [a, b]) v.discover.forEach((s, h) => { for (const [n, codes] of s ?? []) for (const [c, p] of codes) platzSetzen(t, h, n, c, p); });
  return t;
}

/* ------------------------------------------------------------ Zeilen lesen, ohne die Datei zu zerlegen */

function zeileAus(roh: Buffer | null, code: string): string[] | null {
  if (!roh) return null;
  const i = roh.indexOf(`\n${code}\t`);
  if (i < 0) return null;
  const ende = roh.indexOf(10, i + 1);
  return roh.toString('utf8', i + 1, ende < 0 ? roh.length : ende).split('\t');
}

function reihenAus(roh: Buffer | null): string[] {
  if (!roh) return [];
  const i = roh.indexOf('\n#reihen\t');
  if (i < 0) return [];
  const ende = roh.indexOf(10, i + 1);
  return roh.toString('utf8', i + 1, ende < 0 ? roh.length : ende).split('\t').slice(1);
}

/* ------------------------------------------------------------ Spitzen */

interface Spitze { wert: number; t: number; seit: number }

function liesSpitzen(roh: Buffer | null): { start: number | null; spitzen: Map<string, Spitze> } {
  const spitzen = new Map<string, Spitze>();
  let start: number | null = null;
  if (!roh) return { start, spitzen };
  for (const zeile of roh.toString('utf8').split('\n')) {
    const [a, b, c, d] = zeile.split('\t');
    if (!a) continue;
    if (a.startsWith('#')) { if (a === '#fn-verlauf-spitzen' && Number(c) > 0) start = Number(c); continue; }
    spitzen.set(a, { wert: Number(b) || 0, t: Number(c) || 0, seit: Number(d) || 0 });
  }
  return { start, spitzen };
}

function schreibSpitzen(start: number, spitzen: Map<string, Spitze>): Buffer {
  const zeilen = [`#fn-verlauf-spitzen\t1\t${start}`];
  for (const [code, s] of spitzen) zeilen.push(`${code}\t${s.wert}\t${s.t}\t${s.seit}`);
  return Buffer.from(zeilen.join('\n') + '\n', 'utf8');
}

/** Die Spitzen um einen Tag fortschreiben. Gibt die frueheste Stunde des Tages mit einem Wert zurueck (oder null). */
function spitzenAusTag(spitzen: Map<string, Spitze>, t: Tag): number | null {
  const beginn = tagBeginn(t.tag);
  let frueh: number | null = null;
  for (const [code, w] of t.werte) {
    let s = spitzen.get(code);
    for (let h = 0; h < 24; h += 1) {
      if (!(w[h] > 0)) continue;
      const ms = beginn + h * STUNDE_MS;
      if (frueh === null || ms < frueh) frueh = ms;
      if (!s) { s = { wert: w[h], t: ms, seit: ms }; spitzen.set(code, s); continue; }
      if (w[h] > s.wert) { s.wert = w[h]; s.t = ms; }
      if (!s.seit || ms < s.seit) s.seit = ms;
    }
  }
  return frueh;
}

/* ------------------------------------------------------------ Zustand */

interface Zustand {
  tage: Map<string, Tag>;
  /** Tage mit Aenderungen, die noch nicht im Archiv stehen. */
  offen: Set<string>;
  geschrieben: number;
  schreibt: Promise<void> | null;
  beimBeenden: boolean;
  letzterFehler: string | null;
}
const Z: Zustand = ((globalThis as { __comphubFnVerlauf?: Zustand }).__comphubFnVerlauf ??= {
  tage: new Map(), offen: new Set(), geschrieben: Date.now() - SCHREIB_ABSTAND_MS + ERSTES_SCHREIBEN_MS, schreibt: null,
  beimBeenden: false, letzterFehler: null,
});

export interface Beobachtung {
  /** Zeitpunkt des Stands (ISO). */
  stand: string;
  /** Code -> Spieler in diesem Moment (nur Codes mit Zahl). */
  spieler: Map<string, number>;
  /** Die Reihen in Epics Reihenfolge, nur Codes mit Spielerzahl. */
  reihen: Array<{ name: string; titel: string | null; codes: string[] }>;
}

/** Einen Stand (alle fuenf Minuten aus lib/fnEntdecken) in die laufende Stunde schreiben und, wenn es Zeit ist, ins Archiv. */
export function verlaufMerken(b: Beobachtung): void {
  const ms = Date.parse(b.stand);
  if (!Number.isFinite(ms)) return;
  const tag = tagVon(ms);
  const h = new Date(ms).getUTCHours();
  let t = Z.tage.get(tag);
  if (!t) { t = leererTag(tag); Z.tage.set(tag, t); }
  for (const [code, n] of b.spieler) {
    if (!(n > 0)) continue;
    let w = t.werte.get(code);
    if (!w) { w = new Array(24).fill(0); t.werte.set(code, w); }
    if (n > w[h]) w[h] = n;
  }
  for (const r of b.reihen) {
    if (!r.codes.length) continue;
    if (r.titel || !t.titel.has(r.name)) t.titel.set(r.name, r.titel ?? '');
    r.codes.forEach((c, i) => platzSetzen(t, h, r.name, c, i + 1));
  }
  Z.offen.add(tag);
  t.fassung += 1;
  if (!Z.beimBeenden) {
    Z.beimBeenden = true;
    // Bester Versuch: Next beendet den Vorgang, sobald die offenen Anfragen fertig sind - reicht die Zeit, steht auch die letzte Viertelstunde da.
    process.once('SIGTERM', () => { void verlaufSichern(true); });
  }
  void verlaufSichern();
}

/** Was offen ist ins Archiv: je offener Tag die Datei, dazu die Spitzen - in einem Commit, jeweils auf den frisch gelesenen Stand gesetzt. */
export function verlaufSichern(sofort = false): Promise<void> {
  if (Z.schreibt) return Z.schreibt;
  if (!Z.offen.size || (!sofort && Date.now() - Z.geschrieben < SCHREIB_ABSTAND_MS)) return Promise.resolve();
  const tage = [...Z.offen].sort();
  const fassungen = new Map(tage.map((tag) => [tag, Z.tage.get(tag)?.fassung ?? 0]));
  Z.geschrieben = Date.now();
  Z.schreibt = (async () => {
    try {
      const namen = [...tage.map(tagDatei), SPITZEN];
      await aendereMehrere(`fn-verlauf: ${tage.join(', ')} bis ${new Date().toISOString().slice(11, 16)} UTC`, async (lies) => {
        const spitzenRoh = await lies(SPITZEN);
        const { start, spitzen } = liesSpitzen(spitzenRoh);
        const neu = new Map<string, Tag>();
        for (const tag of tage) neu.set(tag, mische(liesTag(await lies(tagDatei(tag)), tag), Z.tage.get(tag) ?? leererTag(tag)));
        // Beim allerersten Mal: die Stunden der bisherigen Sieben-Tage-Datei uebernehmen (siehe oben).
        if (!spitzenRoh) {
          const alt = await liesJson<{ stunden?: number[]; werte?: Record<string, Array<number | null>> } | null>(ALT, null).catch(() => null);
          if (alt && Array.isArray(alt.stunden) && alt.werte) {
            const altTage = new Map<string, Tag>();
            for (const [code, reihe] of Object.entries(alt.werte)) {
              (reihe ?? []).forEach((w, i) => {
                const st = alt.stunden![i];
                if (typeof w !== 'number' || !(w > 0) || !Number.isFinite(st)) return;
                const tag = tagVon(st * STUNDE_MS);
                let t = altTage.get(tag);
                if (!t) { t = leererTag(tag); altTage.set(tag, t); }
                let ww = t.werte.get(code);
                if (!ww) { ww = new Array(24).fill(0); t.werte.set(code, ww); }
                const h = new Date(st * STUNDE_MS).getUTCHours();
                if (w > ww[h]) ww[h] = w;
              });
            }
            for (const [tag, t] of altTage) {
              const da = neu.get(tag) ?? liesTag(await lies(tagDatei(tag)), tag);
              neu.set(tag, mische(t, da));
            }
          }
        }
        let anfang = start;
        for (const t of neu.values()) {
          const f = spitzenAusTag(spitzen, t);
          if (f !== null && (anfang === null || f < anfang)) anfang = f;
        }
        const schreiben: Record<string, Buffer> = {};
        for (const [tag, t] of neu) schreiben[tagDatei(tag)] = schreibTag(t);
        schreiben[SPITZEN] = schreibSpitzen(anfang ?? Date.now(), spitzen);
        return { schreiben, kopieren: {}, loeschen: [] };
      }, namen);
      // Was waehrend des Schreibens dazukam, bleibt offen; ein vergangener Tag ohne neue Aenderung verlaesst den Speicher (er steht jetzt im Archiv).
      const heute = tagVon(Date.now());
      for (const tag of tage) {
        if ((Z.tage.get(tag)?.fassung ?? 0) !== fassungen.get(tag)) continue;
        Z.offen.delete(tag);
        if (tag < heute) Z.tage.delete(tag);
      }
      Z.letzterFehler = null;
    } catch (e) {
      // Bleibt vorgemerkt - beim naechsten Mal wieder.
      Z.letzterFehler = (e as Error).message;
      console.warn('[fn-verlauf] Schreiben fehlgeschlagen:', (e as Error).message);
    } finally {
      Z.schreibt = null;
    }
  })();
  return Z.schreibt;
}

/* ------------------------------------------------------------ Lesen */

export interface InselVerlauf {
  code: string;
  /** Beginn der Aufzeichnung (ms), null = noch nichts aufgezeichnet. */
  start: number | null;
  /** Wann dieser Code zum ersten Mal gesehen wurde (ms). */
  seit: number | null;
  /** [Beginn der Stunde in ms, hoechste Spielerzahl der Stunde], aufsteigend. */
  stunden: Array<[number, number]>;
  /** Hoechststand seit Beginn der Aufzeichnung (nicht nur im gefragten Zeitraum). */
  peak: { wert: number; t: number } | null;
  /** [Beginn der Stunde in ms, Reihe, Platz ab 1], nach Zeit, dann Reihe. */
  discover: Array<[number, string, number]>;
  /** Reihe -> Titel, wie Epic sie zeigt (in Epics Reihenfolge, soweit bekannt). */
  reihen: Record<string, string>;
}

/** Beginn der Aufzeichnung und die Spitzen-Datei (fuer peak) - aus dem Archiv, die laufenden Tage im Speicher dazu. */
async function anfang(): Promise<{ start: number | null; roh: Buffer | null }> {
  const roh = await speicher.lies(SPITZEN).catch(() => null);
  let start: number | null = null;
  if (roh) {
    const kopf = roh.toString('utf8', 0, Math.min(roh.length, 200)).split('\n')[0].split('\t');
    if (kopf[0] === '#fn-verlauf-spitzen' && Number(kopf[2]) > 0) start = Number(kopf[2]);
  }
  for (const t of Z.tage.values()) {
    const beginn = tagBeginn(t.tag);
    for (const w of t.werte.values()) {
      const h = w.findIndex((x) => x > 0);
      if (h >= 0 && (start === null || beginn + h * STUNDE_MS < start)) start = beginn + h * STUNDE_MS;
    }
  }
  return { start, roh };
}

/** Werte und Discover eines Codes an einem Tag: aus der Datei im Archiv, mit dem, was nur im Speicher steht, zusammengelegt. */
function codeAmTag(roh: Buffer | null, imSpeicher: Tag | undefined, tag: string, code: string, reihen: Map<string, string>): { werte: number[]; dis: Array<[number, string, number]> } {
  const werte = new Array<number>(24).fill(0);
  const disJe = new Array<Map<string, number> | undefined>(24).fill(undefined);
  const zeile = zeileAus(roh, code);
  if (zeile) {
    (zeile[1] ?? '').split(',').forEach((x, i) => { if (i < 24) werte[i] = Number(x) || 0; });
    const namen = reihenAus(roh);
    for (let i = 0; i < namen.length; i += 2) if (namen[i] && !reihen.has(namen[i])) reihen.set(namen[i], namen[i + 1] ?? '');
    for (const e of (zeile[2] ?? '').split(' ')) {
      const [h, r, p] = e.split('.').map(Number);
      const name = namen[r * 2];
      if (h >= 0 && h < 24 && name && p >= 1) { const m = (disJe[h] ??= new Map()); if (!(m.get(name)! <= p)) m.set(name, p); }
    }
  }
  if (imSpeicher) {
    const w = imSpeicher.werte.get(code);
    if (w) for (let i = 0; i < 24; i += 1) if (w[i] > werte[i]) werte[i] = w[i];
    for (const [n, x] of imSpeicher.titel) if (!reihen.has(n) || (x && !reihen.get(n))) reihen.set(n, x);
    imSpeicher.discover.forEach((s, h) => {
      for (const [n, codes] of s ?? []) {
        const p = codes.get(code);
        if (p === undefined) continue;
        const m = (disJe[h] ??= new Map());
        if (!(m.get(n)! <= p)) m.set(n, p);
      }
    });
  }
  const beginn = tagBeginn(tag);
  const dis: Array<[number, string, number]> = [];
  disJe.forEach((m, h) => { for (const [n, p] of m ?? []) dis.push([beginn + h * STUNDE_MS, n, p]); });
  return { werte, dis };
}

/** Der Verlauf eines Codes zwischen `von` und `bis` (ms; Voreinstellung: seit Beginn der Aufzeichnung bis jetzt). */
export async function inselVerlauf(code: string, von?: number | null, bis?: number | null): Promise<InselVerlauf> {
  const { start, roh: spitzenRoh } = await anfang();
  const reihen = new Map<string, string>();
  const leer: InselVerlauf = { code, start, seit: null, stunden: [], peak: null, discover: [], reihen: {} };
  if (start === null) return leer;
  const jetzt = Date.now();
  const ab = Math.max(start, Number.isFinite(von) && von ? von : start);
  const ende = Math.min(jetzt, Number.isFinite(bis) && bis ? bis : jetzt);
  if (ende < ab) return leer;

  const tage: string[] = [];
  for (let t = tagBeginn(tagVon(ab)); t <= ende && tage.length < TAGE_HOECHSTENS; t += 24 * STUNDE_MS) tage.push(tagVon(t));
  const stunden: Array<[number, number]> = [];
  const discover: Array<[number, string, number]> = [];
  // Je acht Tage zugleich aus dem Archiv (die Dateien liegen danach im Speicher der Ablage, nachgefragt wird mit ETag).
  for (let i = 0; i < tage.length; i += 8) {
    const teil = tage.slice(i, i + 8);
    const dateien = await Promise.all(teil.map((tag) => speicher.lies(tagDatei(tag)).catch(() => null)));
    teil.forEach((tag, j) => {
      const { werte, dis } = codeAmTag(dateien[j], Z.tage.get(tag), tag, code, reihen);
      const beginn = tagBeginn(tag);
      werte.forEach((w, h) => { const ms = beginn + h * STUNDE_MS; if (w > 0 && ms >= ab - STUNDE_MS + 1 && ms <= ende) stunden.push([ms, w]); });
      for (const d of dis) if (d[0] >= ab - STUNDE_MS + 1 && d[0] <= ende) discover.push(d);
    });
  }

  // Hoechststand und "zuerst gesehen": aus den Spitzen im Archiv und dem, was nur im Speicher steht.
  let peak: { wert: number; t: number } | null = null;
  let seit: number | null = null;
  const s = zeileAus(spitzenRoh, code);
  if (s) { peak = { wert: Number(s[1]) || 0, t: Number(s[2]) || 0 }; seit = Number(s[3]) || null; }
  for (const t of Z.tage.values()) {
    const w = t.werte.get(code);
    if (!w) continue;
    const beginn = tagBeginn(t.tag);
    w.forEach((x, h) => {
      if (!(x > 0)) return;
      const ms = beginn + h * STUNDE_MS;
      if (!peak || x > peak.wert) peak = { wert: x, t: ms };
      if (seit === null || ms < seit) seit = ms;
    });
  }
  for (const [ms, w] of stunden) { if (!peak || w > peak.wert) peak = { wert: w, t: ms }; if (seit === null || ms < seit) seit = ms; }
  if (peak && !(peak.wert > 0)) peak = null;

  const benutzt = new Set(discover.map((d) => d[1]));
  return {
    code, start, seit, stunden, peak, discover,
    reihen: Object.fromEntries([...reihen].filter(([n]) => benutzt.has(n))),
  };
}

/** Mehrere Codes ueber die letzten Stunden (fuer /api/fn-entdecken?verlauf=1): je Code [[Stunde ms, Spieler]]. */
export async function verlaufFuer(codes: string[], ab: number): Promise<Record<string, Array<[number, number]>>> {
  const tage: string[] = [];
  for (let t = tagBeginn(tagVon(ab)); t <= Date.now(); t += 24 * STUNDE_MS) tage.push(tagVon(t));
  const dateien = await Promise.all(tage.map((tag) => speicher.lies(tagDatei(tag)).catch(() => null)));
  const aus: Record<string, Array<[number, number]>> = {};
  for (const code of codes) {
    const punkte: Array<[number, number]> = [];
    tage.forEach((tag, j) => {
      const beginn = tagBeginn(tag);
      const z = zeileAus(dateien[j], code);
      const werte = new Array<number>(24).fill(0);
      if (z) (z[1] ?? '').split(',').forEach((x, i) => { if (i < 24) werte[i] = Number(x) || 0; });
      const m = Z.tage.get(tag)?.werte.get(code);
      if (m) for (let i = 0; i < 24; i += 1) if (m[i] > werte[i]) werte[i] = m[i];
      werte.forEach((w, h) => { const ms = beginn + h * STUNDE_MS; if (w > 0 && ms >= ab) punkte.push([ms, w]); });
    });
    if (punkte.length) aus[code] = punkte;
  }
  return aus;
}

/** Fuer die Diagnose: was im Speicher liegt und wann zuletzt geschrieben wurde. */
export function verlaufZustand() {
  return {
    tage: [...Z.tage.values()].map((t) => ({ tag: t.tag, codes: t.werte.size, stundenMitDiscover: t.discover.filter(Boolean).length })),
    offen: [...Z.offen], geschrieben: new Date(Z.geschrieben).toISOString(), letzterFehler: Z.letzterFehler,
  };
}

/** Nur zum Pruefen (scripts/fn-verlauf-pruefen): Lesen und Schreiben des Dateiformats. */
export const _format = { liesTag, schreibTag, mische, liesSpitzen, schreibSpitzen, spitzenAusTag };
