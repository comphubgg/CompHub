import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
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

export async function GET() {
  return NextResponse.json(
    { stand: await bauKennung() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
