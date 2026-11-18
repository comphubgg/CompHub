import { Session } from 'node:inspector';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Was hielt die Ereignisschleife an? (18.11.2026)
 *
 * lib/schleifenWaechter sieht nur, DASS die Schleife stand (nach dem Neustart um 16:47 einmal 33 s am Stueck), nicht womit. Hier laeuft V8s
 * Stichproben-Profiler in Fenstern von 30 s (alle 5 ms eine Stichprobe - kaum Last). Am Ende eines Fensters wird die laengste Strecke ohne Leerlauf
 * gesucht; dauerte sie mindestens eine Sekunde, bleiben die Funktionen mit der meisten Zeit darin samt Aufrufkette stehen (/api/stand?bloecke=1).
 * Sonst wird das Fenster verworfen. Die Profile selbst bleiben nicht im Speicher.
 */

interface Knoten { id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; children?: number[] }
interface Profil { nodes: Knoten[]; startTime: number; samples: number[]; timeDeltas: number[] }
export interface Block { ende: string; ms: number; oben: Array<{ ms: number; kette: string[]; quelltext?: string }> }

const FENSTER_MS = 30_000;
const AB_MS = 1_000;

function post<T>(s: Session, methode: string, params?: object): Promise<T> {
  return new Promise((r, f) => { s.post(methode, params ?? {}, (e, erg) => (e ? f(e) : r(erg as T))); });
}

const kurz = (k: Knoten) => {
  const url = k.callFrame.url.replace(/^.*\/(\.next|node_modules)\//, '$1/');
  return `${k.callFrame.functionName || '(anonym)'} ${url}:${k.callFrame.lineNumber + 1}:${k.callFrame.columnNumber + 1}`;
};

/*
 * Der Quelltext an der Stelle (18.11.2026): die Chunks sind verkleinert - "I lib_mapsVerzeichnis_ts_0o08k49._.js:1:14574" sagt nicht, welche Funktion
 * es ist. Ein Stueck Text ab der Spalte (aus der Datei im Container) zeigt es. Nur fuer eigene Chunks, hoechstens 240 Zeichen.
 */
const dateien = new Map<string, string[] | null>();
function ausschnitt(k: Knoten | undefined): string | undefined {
  const url = k?.callFrame.url ?? '';
  if (!/\.next\/server\//.test(url)) return undefined;
  let zeilen = dateien.get(url);
  if (zeilen === undefined) {
    try { zeilen = readFileSync(url.startsWith('file:') ? fileURLToPath(url) : url, 'utf8').split('\n'); } catch { zeilen = null; }
    dateien.set(url, zeilen);
    if (dateien.size > 50) dateien.delete(dateien.keys().next().value as string);
  }
  const z = zeilen?.[k!.callFrame.lineNumber];
  return z === undefined ? undefined : z.slice(Math.max(0, k!.callFrame.columnNumber - 40), k!.callFrame.columnNumber + 200);
}

export function auswerten(p: Profil, jetztIso: string): Block | null {
  const nach = new Map(p.nodes.map((k) => [k.id, k]));
  const eltern = new Map<number, number>();
  for (const k of p.nodes) for (const c of k.children ?? []) eltern.set(c, k.id);
  const leer = (id: number) => /^\((idle|program|garbage collector)\)$/.test(nach.get(id)?.callFrame.functionName ?? '');
  // Laengste Strecke ohne Leerlauf: aufeinanderfolgende Stichproben, die nicht "(idle)" sind. GC zaehlt mit, ist aber kein Ende.
  let best = { von: 0, bis: -1, us: 0 };
  let von = 0; let us = 0;
  for (let i = 0; i < p.samples.length; i += 1) {
    const fn = nach.get(p.samples[i])?.callFrame.functionName;
    if (fn === '(idle)') { von = i + 1; us = 0; continue; }
    us += p.timeDeltas[i] ?? 0;
    if (us > best.us) best = { von, bis: i, us };
  }
  if (best.us / 1000 < AB_MS) return null;
  const selbst = new Map<number, number>();
  for (let i = best.von; i <= best.bis; i += 1) {
    const id = p.samples[i];
    if (leer(id) && nach.get(id)?.callFrame.functionName !== '(garbage collector)') continue;
    selbst.set(id, (selbst.get(id) ?? 0) + (p.timeDeltas[i] ?? 0));
  }
  const oben = [...selbst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, t]) => {
    const kette: string[] = [];
    for (let k: number | undefined = id; k !== undefined && kette.length < 14; k = eltern.get(k)) {
      const n = nach.get(k);
      if (n && n.callFrame.functionName !== '(root)') kette.push(kurz(n));
    }
    return { ms: Math.round(t / 1000), kette, quelltext: ausschnitt(nach.get(id)) };
  });
  return { ende: jetztIso, ms: Math.round(best.us / 1000), oben };
}

export function schleifenProfil(): Block[] {
  const g = globalThis as { __comphubProfil?: Block[] };
  if (g.__comphubProfil) return g.__comphubProfil;
  const bloecke: Block[] = [];
  g.__comphubProfil = bloecke;
  if (process.env.COMPHUB_KEIN_PROFIL === '1') return bloecke;
  const s = new Session();
  try { s.connect(); } catch { return bloecke; }
  const runde = async () => {
    try {
      await post(s, 'Profiler.enable');
      await post(s, 'Profiler.setSamplingInterval', { interval: 5_000 });
      await post(s, 'Profiler.start');
      await new Promise((r) => { setTimeout(r, FENSTER_MS).unref?.(); });
      const { profile } = await post<{ profile: Profil }>(s, 'Profiler.stop');
      const b = auswerten(profile, new Date().toISOString());
      if (b) {
        bloecke.push(b);
        if (bloecke.length > 8) bloecke.shift();
        console.warn(`[schleife] Block ${b.ms} ms: ${b.oben[0]?.kette.slice(0, 4).join(' <- ')}`);
      }
    } catch { /* naechstes Fenster */ }
    // Nur die ersten 15 Minuten nach dem Start (dort liegen die meisten Bloecke) - danach kostet jedes Fenster beim Anhalten rund 0,3 s Schleife
    // (gemessen 18.11.2026: alle 30 s eine Luecke von 310-380 ms). COMPHUB_PROFIL=dauer laesst ihn weiterlaufen.
    if (Date.now() - start < 15 * 60_000 || process.env.COMPHUB_PROFIL === 'dauer') setTimeout(() => { void runde(); }, 100).unref?.();
    else { void post(s, 'Profiler.disable').catch(() => undefined); }
  };
  const start = Date.now();
  void runde();
  return bloecke;
}
