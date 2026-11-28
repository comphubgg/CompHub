import { NextResponse } from 'next/server';
import { EpicLoginNoetig } from '@/lib/epicCups';
import { holeInseln, inselCode, oeffentlich, type Insel } from '@/lib/fnInseln';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Titel, Vorschaubild und Ersteller zu Fortnite-Codes (27.11.2026, Community-Bereich des neuen Hubs).
 *
 *   GET ?codes=1234-5678-9012,playlist_defaultsquad,set_br_playlists   (hoechstens 100)
 *   -> { inseln: { "<code>": { titel, bild, bildGross, creator, tagline, typ } | null } }
 *
 * null heisst: Epic kennt den Code nicht (oder er ist kein gueltiger Code). Konnte Epic gerade nicht gefragt werden, steht zusaetzlich
 * "unvollstaendig": true in der Antwort - dann sind die null-Eintraege keine Auskunft, und die Antwort wird nicht zwischengespeichert.
 *
 * Quelle und Fristen: lib/fnInseln (Epics Links-Dienst, zwoelf Stunden je Code).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOECHSTENS = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const roh = [...new Set((searchParams.get('codes') ?? '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, HOECHSTENS);
  if (!roh.length) return NextResponse.json({ error: 'codes= fehlt (durch Komma getrennt, hoechstens 100)' }, { status: 400 });

  // Der Schluessel der Antwort ist der Code, wie er gefragt wurde - auch wenn er ungueltig ist (dann null, ohne Epic zu fragen).
  const gueltig = new Map<string, string>();
  for (const r of roh) { const c = inselCode(r); if (c) gueltig.set(r, c); }

  try {
    const { inseln, fehler } = await holeInseln([...gueltig.values()]);
    const aus: Record<string, Insel | null> = {};
    let offen = false;
    for (const r of roh) {
      const c = gueltig.get(r);
      if (c && !inseln.has(c)) offen = true;
      aus[r] = c ? oeffentlich(inseln.get(c)) : null;
    }
    if (offen) return NextResponse.json({ inseln: aus, unvollstaendig: true, error: fehler }, { headers: { 'Cache-Control': 'no-store' } });
    return zwischenspeichern(NextResponse.json({ inseln: aus }, { headers: { 'Cache-Control': 'public, max-age=300' } }), 1800);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json({ error: (e as Error).message, needsLogin: login }, { status: login ? 401 : 500 });
  }
}
