import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { aenderungenSchreiben, wendeAktionAn, type PoolAktion, type PoolFoto, type PoolTafel } from '@/lib/fotoPool';

/*
 * Die Schreibreihe des Foto-Pools (Betreiber, 17.11.2026, /admin/fotos-pool: "Fehler: Unexpected token '<', "<!DOCTYPE "... is not valid JSON").
 *
 * Wie /admin/flaggen (lib/profilWarteschlange.ts): die Anfrage prueft die Eingabe, legt sie hier ab und antwortet sofort ("wartet"). Gesammelt wird
 * kurz (SAMMELN_MS nach der letzten Aenderung, hoechstens HOECHSTENS_MS nach der ersten); dann gehen alle wartenden Aenderungen in EINEM Commit hinaus
 * (lib/fotoPool aenderungenSchreiben: frisch gelesen, angewandt, abgeglichen; bewegt sich der Zweig, wird neu gelesen). Scheitert das Schreiben,
 * bleibt alles in der Reihe, neuer Versuch nach 5, 10, 20 ... Sekunden (hoechstens einer Minute). Je Aenderung gibt es einen Stand (cid, von der Seite
 * vergeben), den die Seite abfragt: wartet -> gespeichert, oder fehler (endgueltig: die Aenderung passt nicht mehr, z. B. Foto geloescht).
 *
 * Gegen einen Neustart dazwischen liegt das Wartende auf der Platte; die Seite schickt ausserdem jede Aenderung noch einmal, deren Stand der Server
 * nicht kennt (dieselbe cid wird nie zweimal angewandt).
 */

const SAMMELN_MS = 1500;
const HOECHSTENS_MS = 5000;

export interface AenderungStand { art: 'wartet' | 'gespeichert' | 'fehler'; endgueltig?: boolean; fehler?: string; id: string; zeit: number }
interface Offen { cid: string; a: PoolAktion; zeit: number }

interface Zustand {
  offen: Offen[];
  stand: Map<string, AenderungStand>;
  uhr: ReturnType<typeof setTimeout> | null;
  erstes: number;
  laeuft: boolean;
  fehlschlaege: number;
  geladen: boolean;
  letzterCommit: { zeit: number; commit: string | null; anzahl: number } | null;
  letzterFehler: { zeit: number; text: string } | null;
  zeit: number;
}
// Ueber globalThis: der Entwicklungsserver laedt jede Route als eigenes Bauteil, und es darf nur eine Reihe geben.
const g = globalThis as { __comphubFotoPoolReihe?: Zustand };
const z: Zustand = (g.__comphubFotoPoolReihe ??= {
  offen: [], stand: new Map(), uhr: null, erstes: 0, laeuft: false, fehlschlaege: 0, geladen: false, letzterCommit: null, letzterFehler: null, zeit: 0,
});

const PLATTE = path.join(process.env.ABLAGE_ZWISCHEN || path.join(os.tmpdir(), 'comphub-ablage-zwischen'), 'fotopool-reihe.json');
let sichernLaeuft: Promise<void> = Promise.resolve();
function sichern(): void {
  const daten = JSON.stringify(z.offen);
  sichernLaeuft = sichernLaeuft.then(() => fsp.mkdir(path.dirname(PLATTE), { recursive: true }).then(() => fsp.writeFile(PLATTE, daten))).catch(() => undefined);
}
async function laden(): Promise<void> {
  if (z.geladen) return;
  z.geladen = true;
  try {
    const alt = JSON.parse(await fsp.readFile(PLATTE, 'utf8')) as Offen[];
    for (const e of Array.isArray(alt) ? alt : []) if (e?.cid && !z.stand.has(e.cid)) einreihenIntern(e);
  } catch { /* nichts liegen geblieben */ }
}

function planen(nachMs?: number): void {
  if (z.uhr) clearTimeout(z.uhr);
  const warte = nachMs ?? Math.max(0, Math.min(SAMMELN_MS, z.erstes + HOECHSTENS_MS - Date.now()));
  z.uhr = setTimeout(() => { z.uhr = null; void schreiben(); }, warte);
}

/** Streng steigende Zeit je Aenderung: "zugeordnet" (und damit der Name der oeffentlichen Kopie) ist so je Foto verschieden. */
function naechsteZeit(): number {
  z.zeit = Math.max(Date.now(), z.zeit + 1);
  return z.zeit;
}

function einreihenIntern(e: Offen): void {
  if (!z.offen.length) z.erstes = Date.now();
  z.offen.push(e);
  z.stand.set(e.cid, { art: 'wartet', id: e.a.id, zeit: Date.now() });
  sichern();
  if (!z.laeuft && z.fehlschlaege === 0) planen();
}

export const CID = /^[a-z0-9-]{8,64}$/i;

/** Eine (schon gepruefte) Aenderung einreihen. Antwortet sofort. Dieselbe cid ein zweites Mal: nichts Neues, nur ihr Stand. */
export async function einreihen(cid: string, a: PoolAktion): Promise<AenderungStand> {
  await laden();
  const da = z.stand.get(cid);
  if (da) return da;
  einreihenIntern({ cid, a, zeit: naechsteZeit() });
  return z.stand.get(cid)!;
}

/** Ohne neue Aenderung einmal abgleichen (ein halber Stand von frueher: aktives Foto ohne oeffentliche Kopie). */
let abgleichAngestossen = 0;
export function abgleichAnstossen(): void {
  if (z.offen.length || z.laeuft || Date.now() - abgleichAngestossen < 5 * 60_000) return;
  abgleichAngestossen = Date.now();
  void schreiben(true);
}

async function schreiben(auchLeer = false): Promise<void> {
  if (z.laeuft || (!z.offen.length && !auchLeer)) return;
  z.laeuft = true;
  const zug = z.offen.splice(0, z.offen.length);
  try {
    const { ergebnisse, commit } = await aenderungenSchreiben(zug);
    z.fehlschlaege = 0;
    z.letzterCommit = { zeit: Date.now(), commit, anzahl: zug.length };
    for (const e of zug) {
      const r = ergebnisse[e.cid];
      z.stand.set(e.cid, r && !r.ok
        ? { art: 'fehler', endgueltig: true, fehler: r.fehler, id: e.a.id, zeit: Date.now() }
        : { art: 'gespeichert', id: e.a.id, zeit: Date.now() });
    }
  } catch (f) {
    z.fehlschlaege += 1;
    const text = String((f as Error)?.message ?? f).slice(0, 200);
    z.letzterFehler = { zeit: Date.now(), text };
    console.warn(`[foto-pool] Schreiben gescheitert (${z.fehlschlaege}.): ${text}`);
    // Nichts verlieren: vorn wieder einreihen, in der alten Reihenfolge.
    z.offen.unshift(...zug);
    for (const e of zug) z.stand.set(e.cid, { art: 'wartet', fehler: `${text} – neuer Versuch läuft`, id: e.a.id, zeit: Date.now() });
  } finally {
    z.laeuft = false;
    sichern();
    for (const [k, s] of z.stand) if (s.art !== 'wartet' && Date.now() - s.zeit > 3_600_000) z.stand.delete(k);
    if (z.offen.length) planen(z.fehlschlaege ? Math.min(60_000, 5000 * 2 ** (z.fehlschlaege - 1)) : undefined);
  }
}

/** Der Stand je cid - fehlt eine, kennt dieser Server sie nicht (Neustart): dann schickt die Seite sie noch einmal. */
export function status(cids: string[]): Record<string, AenderungStand> {
  const raus: Record<string, AenderungStand> = {};
  for (const k of cids) { const s = z.stand.get(k); if (s) raus[k] = s; }
  return raus;
}

/** Ueberblick fuer die Seite: wie viel noch wartet, ob gerade geschrieben wird, letzter Commit und letzter Fehler. */
export function reiheZustand() {
  return {
    wartend: z.offen.length, laeuft: z.laeuft, fehlschlaege: z.fehlschlaege,
    letzterCommit: z.letzterCommit, letzterFehler: z.fehlschlaege ? z.letzterFehler : null,
  };
}

/** Was noch wartet, auf einen gelesenen Stand gelegt - damit die Liste nach dem Neuladen schon zeigt, was gleich gespeichert wird. */
export function mitWartendem(pool: PoolTafel): PoolTafel {
  if (!z.offen.length) return pool;
  const kopie = structuredClone(pool);
  const st = { pool: kopie, credits: {}, bilder: [] };
  const weg: PoolFoto[] = [];
  for (const e of z.offen) { try { wendeAktionAn(st, e.a, e.zeit, weg); } catch { /* passt nicht mehr - zeigt der Stand */ } }
  return kopie;
}

/** Fuer Tests und den Betrieb: alles Wartende jetzt schreiben. */
export async function jetztSchreiben(): Promise<void> {
  if (z.uhr) { clearTimeout(z.uhr); z.uhr = null; }
  await schreiben();
}
