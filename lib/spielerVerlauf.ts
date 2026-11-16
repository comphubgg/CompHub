import { promises as platte } from 'fs';
import path from 'path';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Der Turnierverlauf jedes Kontos aus unseren Bestenlisten (scripts/spieler-verlauf.mjs, Ablauf spieler-verlauf.yml) - fuer das Profil jedes Spielers und die
 * Spielersuche unter Statistics (Betreiber, 16.11.2026: "jeder, der je ein Turnier gespielt hat").
 *
 * Gerechnet wird auf GitHub, nie hier. Die Seite liest je Profil genau EIN Stueck des Index (HTTP Range am Release "daten-verlauf", rund 100 KB gepackt)
 * und je Suche ein Namensstueck. Der Server lief am 16.11.2026 im Speicher ueber und startete immer neu - deshalb haelt diese Datei wenig fest:
 *   - _stand.json (Spieltage und Lage der Stuecke, gut 1 MB) fuenf Minuten,
 *   - gepackte Stuecke hoechstens VORRAT_BYTES zusammen (die aeltesten fliegen zuerst), entpackt wird je Anfrage und danach weggeworfen.
 * Liegt data/spieler-verlauf/_stand.json auf der Platte (Rechner des Betreibers, Tests), wird von dort gelesen.
 */

const entpacken = promisify(gunzip);
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const RELEASE = 'daten-verlauf';
// SPIELER_VERLAUF_URL nur fuer Tests (ein anderer Ort mit denselben Dateien, z. B. ein lokaler Server mit Range).
const BASIS = process.env.SPIELER_VERLAUF_URL || `https://github.com/${REPO}/releases/download/${RELEASE}/`;
const LOKAL = path.join(DATEN_ORT, 'spieler-verlauf');
const STAND_MS = 5 * 60_000;
const VORRAT_BYTES = 8 * 1024 * 1024;
const FRIST_MS = 15_000;

export interface VerlaufTag {
  /** windowId */ w: string; /** eventId */ e: string; /** Titel */ t: string; r: string; s: string; d: number;
  /** Teams in der Liste */ n: number; /** gekuerzt (altes Archiv, nur die besten 500) */ g?: 1;
  /** Quali-Grenze (Top N) und die Punkte dort */ q?: number; qp?: number;
  m: 'reload' | 'br'; zb?: 1; rk?: 1; fi?: 1;
}
interface Stand {
  build: string; erstellt: string; konten: number; zeilen: number; prTop: number; prStand: number | null;
  tage: VerlaufTag[]; lage: Array<[number, number]>; namenLage: Array<[number, number]>;
}
/** [tag, platz, punkte, matches, preis je Person, mitspieler, zusatz?] */
export type VerlaufZeileRoh = [number, number, number, number, number, string[], 1?];
export interface KontoEintrag { n?: string; a?: string[]; pr?: [number, number]; z: VerlaufZeileRoh[]; m?: Record<string, string> }

let lokal: boolean | null = null;
async function istLokal(): Promise<boolean> {
  if (lokal === null) lokal = !process.env.SPIELER_VERLAUF_URL && await platte.access(path.join(LOKAL, '_stand.json')).then(() => true, () => false);
  return lokal;
}

let standMerker: { bis: number; wert: Promise<Stand | null> } | null = null;
async function standNeu(): Promise<Stand | null> {
  try {
    if (await istLokal()) return JSON.parse(await platte.readFile(path.join(LOKAL, '_stand.json'), 'utf8')) as Stand;
    const r = await fetch(`${BASIS}_stand.json`, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(FRIST_MS) });
    return r.ok ? (await r.json()) as Stand : null;
  } catch { return null; }
}
export async function verlaufStand(neu = false): Promise<Stand | null> {
  const jetzt = Date.now();
  if (!neu && standMerker && standMerker.bis > jetzt) return standMerker.wert;
  // Ein Fehlschlag gilt nur eine halbe Minute - dann wird es neu versucht.
  const wert = standNeu();
  standMerker = { bis: jetzt + STAND_MS, wert };
  void wert.then((s) => { if (!s && standMerker?.wert === wert) standMerker.bis = Date.now() + 30_000; });
  return wert;
}

/** Gepackte Stuecke, nach Alter geordnet (Map haelt die Reihenfolge). */
const vorrat = new Map<string, Buffer>();
let vorratBytes = 0;
const unterwegs = new Map<string, Promise<Buffer | null>>();
function merken(k: string, b: Buffer) {
  if (b.length > VORRAT_BYTES / 4) return;
  vorrat.set(k, b); vorratBytes += b.length;
  for (const [alt, w] of vorrat) {
    if (vorratBytes <= VORRAT_BYTES) break;
    vorrat.delete(alt); vorratBytes -= w.length;
  }
}

class Veraltet extends Error {}

async function bereichNeu(name: string, start: number, laenge: number): Promise<Buffer | null> {
  if (await istLokal()) {
    const h = await platte.open(path.join(LOKAL, name), 'r');
    try {
      const b = Buffer.alloc(laenge);
      const { bytesRead } = await h.read(b, 0, laenge, start);
      return b.subarray(0, bytesRead);
    } finally { await h.close(); }
  }
  const r = await fetch(BASIS + encodeURIComponent(name), {
    redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(FRIST_MS), headers: { Range: `bytes=${start}-${start + laenge - 1}` },
  });
  // Die Datei eines alten Builds ist weg (der Ablauf raeumt auf): der Aufrufer holt den Stand neu.
  if (r.status === 404) throw new Veraltet(name);
  if (!r.ok) throw new Error(`Release ${r.status} bei ${name}`);
  // Ohne Range-Antwort (200) kaeme die ganze Datei - dann nur das Stueck behalten.
  const b = Buffer.from(await r.arrayBuffer());
  return r.status === 206 ? b : b.subarray(start, start + laenge);
}

async function bereich(name: string, start: number, laenge: number): Promise<Buffer | null> {
  if (!laenge) return null;
  const k = `${name}#${start}`;
  const da = vorrat.get(k);
  if (da) { vorrat.delete(k); vorrat.set(k, da); return da; }
  let l = unterwegs.get(k);
  if (!l) {
    l = bereichNeu(name, start, laenge).then((b) => { if (b) merken(k, b); return b; }).finally(() => unterwegs.delete(k));
    unterwegs.set(k, l);
  }
  return l;
}

/** Ein Stueck lesen und entpacken - mit einem zweiten Versuch, wenn der Ablauf inzwischen einen neuen Build hochgeladen hat. */
async function stueck<T>(waehle: (s: Stand) => { name: string; start: number; laenge: number } | null): Promise<{ stand: Stand; wert: T | null } | null> {
  for (let versuch = 0; versuch < 2; versuch += 1) {
    const s = await verlaufStand(versuch > 0);
    if (!s) return null;
    const ort = waehle(s);
    if (!ort) return { stand: s, wert: null };
    try {
      const gz = await bereich(ort.name, ort.start, ort.laenge);
      if (!gz) return { stand: s, wert: null };
      return { stand: s, wert: JSON.parse((await entpacken(gz)).toString('utf8')) as T };
    } catch (e) {
      if (!(e instanceof Veraltet) || versuch > 0) throw e;
    }
  }
  return null;
}

/** Der Eintrag eines Kontos - null, wenn es in keiner unserer Bestenlisten steht (oder der Index nicht erreichbar ist: dann ist stand null). */
export async function kontoVerlauf(epicId: string): Promise<{ stand: Stand | null; konto: KontoEintrag | null }> {
  const id = epicId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return { stand: null, konto: null };
  const r = await stueck<Record<string, KontoEintrag>>((s) => {
    const [start, laenge] = s.lage[parseInt(id.slice(0, 3), 16)] ?? [0, 0];
    return { name: `verlauf-${s.build}-${id.slice(0, 2)}.bin`, start, laenge };
  });
  return { stand: r?.stand ?? null, konto: r?.wert?.[id] ?? null };
}

/* ------------------------------------------------------------ Namenssuche */

/** Wie scripts/spieler-verlauf.mjs: klein, ohne Akzente, Leerraum zusammengezogen. */
export function normName(s: string): string {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function streu(s: string, n = 4096): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h % n;
}

/** [schluessel, name, epicId, events, region, alt?, heutigerName?] - bei einem alten Namen steht der heutige dahinter. */
type NamenEintrag = [string, string, string, number, string, 1?, string?];
export interface NamenTreffer { epicId: string; name: string; events: number; region: string; alterName?: string; ohneVerlauf?: boolean }

/** Namen, die mit q anfangen (auch ein spaeteres Wort des Namens, auch alte Namen) - exakte Treffer zuerst, dann nach Zahl der Spieltage. */
export async function namenSuchen(q: string, wieViele = 8): Promise<NamenTreffer[]> {
  const k = normName(q);
  if ([...k].length < 3) return [];
  const r = await stueck<NamenEintrag[]>((s) => {
    const [start, laenge] = s.namenLage[streu([...k].slice(0, 3).join(''))] ?? [0, 0];
    return { name: `namen-${s.build}.bin`, start, laenge };
  });
  const treffer = (r?.wert ?? []).filter((e) => e[0].startsWith(k));
  treffer.sort((a, b) => Number(b[0] === k) - Number(a[0] === k) || Number(!b[5]) - Number(!a[5]) || b[3] - a[3]);
  const raus: NamenTreffer[] = [];
  const da = new Set<string>();
  for (const e of treffer) {
    if (da.has(e[2])) continue;
    da.add(e[2]);
    raus.push({ epicId: e[2], name: e[5] ? (e[6] ?? e[1]) : e[1], events: e[3], region: e[4], ...(e[5] ? { alterName: e[1] } : {}) });
    if (raus.length >= wieViele) break;
  }
  return raus;
}
