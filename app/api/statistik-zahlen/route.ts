import { NextResponse } from 'next/server';
import { gesamtSummen, heimatRegionen } from '@/lib/szeneStats';
import { liesJson } from '@/lib/ablage';
import { abgelegteAntwort, CDN_FRIST } from '@/lib/antwortSpeicher';
import { ARCHIV_MINDEST_MATCHES } from '@/lib/archivRegel';

/*
 * Die vier grossen Zahlen der Statistikseite: Spieler, Spieltage, Eliminierungen, Schaden.
 *
 * Gezaehlt wird, was auch im Spielerarchiv des Werkzeugs steht: Konten mit mindestens zehn Matches (lib/archivRegel) oder mit einem
 * echten Foto (dieselbe Regel wie in der Bilderansicht, /api/szene-stats?ansicht=bilder). Der Betreiber (12.10.2026):
 * die Zahl soll "von mir" sein - in seinem Archiv standen 3.315 Spieler, auf der Seite aber 8.000. Die Konten mit
 * fast keinen Spielen zaehlen nicht mit; alle vier Zahlen beziehen sich auf dieselben Spieler.
 *
 * Der Betreiber (12.10.2026): "wie viele Spieler, wie viele Tournaments, wie viele Eliminations, wie viel Damage dealt
 * wurde" - mit Zaehl-Animation, wenn man auf die Seite kommt. Alles aus dem eigenen Archiv: die Summe ueber alle Spieler
 * (gesamtSummen, vorgerechnet vom stuendlichen Lauf) und die Zahl der Spieltage. Fehlt eine Quelle, fehlt die Zahl -
 * sie wird nicht geschaetzt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let merker: { bis: number; antwort: Record<string, unknown> } | null = null;

interface Bildeintrag { epicId: string; echtesFoto?: boolean }

export async function GET() {
  if (merker && merker.bis > Date.now()) {
    return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  }
  let spieler: number | null = null; let elims: number | null = null; let schaden: number | null = null; let matches: number | null = null;
  let spieltage: number | null = null;
  let regionen: Array<{ region: string; n: number }> = [];
  try {
    const [alle, bilder, heimat] = await Promise.all([
      gesamtSummen(),
      liesJson<Bildeintrag[]>('spielerbilder.json', []).catch(() => [] as Bildeintrag[]),
      heimatRegionen().catch(() => new Map<string, string>()),
    ]);
    const mitFoto = new Set(bilder.filter((b) => b.echtesFoto).map((b) => b.epicId));
    const liste = alle.filter((x) => (x.matches ?? 0) >= ARCHIV_MINDEST_MATCHES || mitFoto.has(x.epicId));
    if (liste.length) {
      const je = new Map<string, number>();
      for (const x of liste) { const r = heimat.get(x.epicId) || x.regionen?.[0] || ''; if (r) je.set(r, (je.get(r) ?? 0) + 1); }
      regionen = [...je.entries()].map(([region, n]) => ({ region, n })).sort((a, b) => b.n - a.n);
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

  const antwort = { ok: spieler !== null || spieltage !== null, spieler, spieltage, elims, schaden, matches, regionen };
  if (antwort.ok) merker = { bis: Date.now() + 30 * 60_000, antwort };
  return NextResponse.json(antwort, { headers: { 'Cache-Control': antwort.ok ? CDN_FRIST : 'no-store' } });
}
