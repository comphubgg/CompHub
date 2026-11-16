import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/*
 * Welche Fassung der Seite gerade ausgeliefert wird.
 *
 * Wer die Seite offen liegen laesst - im Stream laeuft ein Tab schon mal
 * einen ganzen Turniertag lang -, sieht nach einem Aufspielen weiter die alte
 * Fassung. Nichts weist darauf hin; erst ein Neuladen bringt sie zurueck.
 * Der Betreiber wollte genau dafuer einen Hinweis: "unten rechts kommt ein
 * Balken: This page got updated. Please reload."
 *
 * Die Kennung stammt von Next selbst. Beim Bauen legt Next unter
 * .next/BUILD_ID eine Zeichenfolge ab, die sich mit jedem Bauen aendert und
 * zwischen zwei Bauvorgaengen konstant bleibt - genau die Eigenschaft, die
 * hier gebraucht wird. Erfunden oder geraten wird nichts.
 *
 * Im Entwicklungsbetrieb bleibt die Antwort leer: dort schreibt Turbopack
 * dauernd neu, und der Balken stuende nach jeder gespeicherten Datei da.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let gemerkt: string | null = null;

async function bauKennung(): Promise<string> {
  if (gemerkt !== null) return gemerkt;
  if (process.env.NODE_ENV !== 'production') {
    gemerkt = '';
    return gemerkt;
  }
  try {
    const roh = await fs.readFile(
      path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8');
    gemerkt = roh.trim();
  } catch {
    // Ohne die Datei gibt es keinen verlaesslichen Stand - dann lieber
    // schweigen als einen Balken zeigen, der nie wieder verschwindet.
    gemerkt = '';
  }
  return gemerkt;
}

/*
 * Der Takt der Live-Spur (Dienst "live", scripts/live-spur.mjs schreibt /app/live/takt.json je Minute) und die Last des Servers (16.11.2026): ohne
 * Zugang zum Server war nicht zu messen, wie viele volle Replays je Minute er schafft. Im Container zeigen loadavg und cpus die Werte des ganzen Rechners.
 */
async function liveTakt() {
  try {
    const j = JSON.parse(await fs.readFile(path.join(process.env.COMPHUB_LIVE_ORT || '/app/live', 'takt.json'), 'utf8'));
    return { zeit: j.zeit, leser: j.leser, messung: j.messung, fenster: j.fenster, verlauf: Array.isArray(j.verlauf) ? j.verlauf.slice(-60) : [] };
  } catch { return null; }
}

export async function GET() {
  return NextResponse.json(
    {
      stand: await bauKennung(),
      // Speicher und Laufzeit des Servers - um Abstuerze zu sehen (die
      // Laufzeit faengt nach jedem Neustart bei null an) und wie nah er an
      // Renders 512 MB kommt.
      speicherMb: Math.round(process.memoryUsage().rss / 1048576),
      heapMb: Math.round(process.memoryUsage().heapUsed / 1048576),
      // Absturzschleife 16.11.2026: rss 5-8 GB bei 1 GB Heap - der Rest liegt ausserhalb (Buffer, native Bibliotheken). Zur Eingrenzung mit ausgegeben.
      externMb: Math.round(process.memoryUsage().external / 1048576),
      pufferMb: Math.round(process.memoryUsage().arrayBuffers / 1048576),
      laufzeitMin: Math.round(process.uptime() / 60),
      kerne: os.cpus().length,
      last: os.loadavg().map((x) => Math.round(x * 100) / 100),
      freiMb: Math.round(os.freemem() / 1048576),
      live: await liveTakt(),
    },
    // Fuer alle gleich - Vercels Zwischenspeicher beantwortet den Takt.
    { headers: { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'max-age=60', 'CDN-Cache-Control': 'max-age=60' } },
  );
}
