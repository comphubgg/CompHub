import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

/*
 * Wie lange stand die Ereignisschleife? (18.11.2026, Betreiber: "die Startseite hing etwa eine Minute")
 *
 * Ohne Zugang zum Server war von aussen nur zu sehen, dass alle Routen zugleich langsam wurden. Hier wird es gemessen: ein Takt alle 100 ms merkt,
 * wenn er spaeter kam als geplant - jede Luecke ueber 300 ms ist eine Zeit, in der der Prozess keine einzige Anfrage beantworten konnte (ein grosses
 * JSON.parse, ein synchrones Lesen, eine lange Speicherbereinigung). Die letzten Luecken mit Uhrzeit und Speicher stehen in /api/stand ("schleife"),
 * jede ueber einer Sekunde zusaetzlich im Protokoll des Containers (docker compose logs web).
 *
 * Ueber globalThis, weil Next jede Route als eigenes Bauteil laedt - sonst liefe je Route ein eigener Waechter.
 */

interface Luecke { zeit: string; ms: number; rssMb: number; heapMb: number }
interface Minute { p50: number; p99: number; max: number }
interface Waechter { histo: IntervalHistogram; luecken: Luecke[]; seit: number; ueber1s: number; letzteMinute: Minute | null }

const TAKT_MS = 100;
const MELDEN_AB_MS = 300;

export function schleifenWaechter(): Waechter {
  const g = globalThis as { __comphubSchleife?: Waechter };
  if (g.__comphubSchleife) return g.__comphubSchleife;
  const histo = monitorEventLoopDelay({ resolution: 20 });
  histo.enable();
  const w: Waechter = { histo, luecken: [], seit: Date.now(), ueber1s: 0, letzteMinute: null };
  g.__comphubSchleife = w;
  let erwartet = performance.now() + TAKT_MS;
  const uhr = setInterval(() => {
    const jetzt = performance.now();
    const spaet = jetzt - erwartet;
    erwartet = jetzt + TAKT_MS;
    if (spaet < MELDEN_AB_MS) return;
    const m = process.memoryUsage();
    const l: Luecke = { zeit: new Date().toISOString(), ms: Math.round(spaet), rssMb: Math.round(m.rss / 1048576), heapMb: Math.round(m.heapUsed / 1048576) };
    w.luecken.push(l);
    if (w.luecken.length > 40) w.luecken.shift();
    if (spaet >= 1000) {
      w.ueber1s += 1;
      console.warn(`[schleife] stand ${l.ms} ms (rss ${l.rssMb} MB, heap ${l.heapMb} MB)`);
    }
  }, TAKT_MS);
  uhr.unref?.();
  // Je Minute ein Schnitt (p50/p99/max) - /api/stand fragen viele Browser ab, ein Zuruecksetzen je Abruf ergaebe Zufallswerte.
  const ms = (ns: number) => Math.round(ns / 1e6);
  setInterval(() => {
    w.letzteMinute = { p50: ms(histo.percentile(50)), p99: ms(histo.percentile(99)), max: ms(histo.max) };
    histo.reset();
  }, 60_000).unref?.();
  return w;
}

/** Fuer /api/stand: Verzoegerung der Schleife in der letzten vollen Minute (p50/p99/max in ms) und die letzten Luecken ueber 300 ms. */
export function schleifenStand() {
  const w = schleifenWaechter();
  return { minute: w.letzteMinute, luecken: w.luecken.slice(-15), ueber1s: w.ueber1s, seitMin: Math.round((Date.now() - w.seit) / 60_000) };
}
