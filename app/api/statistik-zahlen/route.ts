import { NextResponse } from 'next/server';
import { gesamtSummen } from '@/lib/szeneStats';
import { abgelegteAntwort, CDN_FRIST } from '@/lib/antwortSpeicher';

/*
 * Die vier grossen Zahlen der Statistikseite: Spieler, Spieltage, Eliminierungen, Schaden.
 *
 * Der Betreiber (12.10.2026): "wie viele Spieler, wie viele Tournaments, wie viele Eliminations, wie viel Damage dealt
 * wurde" - mit Zaehl-Animation, wenn man auf die Seite kommt. Alles aus dem eigenen Archiv: die Summe ueber alle Spieler
 * (gesamtSummen, vorgerechnet vom stuendlichen Lauf) und die Zahl der Spieltage. Fehlt eine Quelle, fehlt die Zahl -
 * sie wird nicht geschaetzt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let merker: { bis: number; antwort: Record<string, unknown> } | null = null;

export async function GET() {
  if (merker && merker.bis > Date.now()) {
    return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  }
  let spieler: number | null = null; let elims: number | null = null; let schaden: number | null = null; let matches: number | null = null;
  let spieltage: number | null = null;
  try {
    const liste = await gesamtSummen();
    if (liste.length) {
      spieler = liste.length;
      elims = liste.reduce((a, s) => a + (s.elims ?? 0), 0);
      schaden = Math.round(liste.reduce((a, s) => a + (s.damage ?? 0), 0));
      matches = Math.round(liste.reduce((a, s) => a + (s.matches ?? 0), 0));
    }
  } catch { /* ohne Summen bleiben die Zahlen leer */ }
  try {
    const s = await abgelegteAntwort<{ spieltage?: number }>('szene|standard');
    if (typeof s?.spieltage === 'number') spieltage = s.spieltage;
  } catch { /* ohne Spieltage bleibt die Zahl leer */ }

  const antwort = { ok: spieler !== null || spieltage !== null, spieler, spieltage, elims, schaden, matches };
  if (antwort.ok) merker = { bis: Date.now() + 30 * 60_000, antwort };
  return NextResponse.json(antwort, { headers: { 'Cache-Control': antwort.ok ? CDN_FRIST : 'no-store' } });
}
