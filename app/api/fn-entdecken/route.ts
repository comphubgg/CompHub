import { NextResponse } from 'next/server';
import { EpicLoginNoetig } from '@/lib/epicCups';
import { diagnose } from '@/lib/fnDiagnose';
import { entdecken, entdeckenVerlauf } from '@/lib/fnEntdecken';
import { inselCode } from '@/lib/fnInseln';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Was Fortnites "Entdecken" gerade zeigt, mit den Spielerzahlen von jetzt (27.11.2026, Community-Bereich des neuen Hubs).
 *
 *   GET            -> { stand, eintraege: [{ code, titel, bild, creator, spieler, epic }] }      nach spieler absteigend
 *   GET ?reihen=1  -> zusaetzlich reihen: [{ name, titel, codes }]                               die Reihen der Uebersicht in Epics Reihenfolge
 *   GET ?verlauf=1 -> { stand, verlauf: { "<code>": [[msSeit1970, spieler], ...] } }             Stundenpunkte (hoechster Stand der Stunde)
 *        &tage=1..7 (Voreinstellung 7)   &codes=a,b,c (Voreinstellung: alle gefuehrten)
 *   Laenger als sieben Tage, mit Hoechststand aller Zeiten und den Reihen von Discover je Stunde: /api/fn-verlauf?code=... (lib/fnVerlauf).
 *
 * Epics eigene Modi (Battle Royale, Reload, OG ...) stehen mit epic: true in derselben Liste. Quelle, Fristen und Verlauf: lib/fnEntdecken.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    // Voruebergehend, siehe lib/fnDiagnose.
    if (searchParams.get('diagnose')) return NextResponse.json(await diagnose(), { headers: { 'Cache-Control': 'no-store' } });
    if (searchParams.get('verlauf')) {
      const codes = (searchParams.get('codes') ?? '').split(',').map((c) => inselCode(c)).filter((c): c is string => Boolean(c)).slice(0, 100);
      const tage = Number(searchParams.get('tage')) || 7;
      return zwischenspeichern(NextResponse.json(await entdeckenVerlauf(codes.length ? codes : null, tage), { headers: { 'Cache-Control': 'public, max-age=60' } }), 300);
    }
    const { stand, eintraege, reihen } = await entdecken();
    const antwort = searchParams.get('reihen') ? { stand, eintraege, reihen } : { stand, eintraege };
    return zwischenspeichern(NextResponse.json(antwort, { headers: { 'Cache-Control': 'public, max-age=60' } }), 60);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json({ error: (e as Error).message, needsLogin: login }, { status: login ? 401 : 500 });
  }
}
