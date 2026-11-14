import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { FtDatenFehlen, ftPostsFuer } from '@/lib/ftPostsDaten';

/*
 * Die Fortnite-Tracker-Posts eines Spieltags fuer die Beitragsseite (app/admin/tweets): "Best Stats", "Most Damage Dealt (Ratio)",
 * "Most Eliminations (Damage)" - dieselben Texte wie scripts/ft-posts.mjs (lib/ftPosts.ts).
 *
 *   GET ?event=<eventId>&window=<windowId>&titel=<Kopfzeile>[&min=<Mindestspiele>]
 *     -> { posts: [{ art, titel, text }], stand: { gelesen, gesamt, teilweise }, minSpiele, spieler, teams }
 *
 * Nur fuer den Admin.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!(await istAdminAnfrage(request))) return NextResponse.json({ error: 'Nur fuer den Admin' }, { status: 403, headers: nie });
  const q = new URL(request.url).searchParams;
  const eventId = (q.get('event') ?? q.get('eventId') ?? '').trim();
  const windowId = (q.get('window') ?? q.get('windowId') ?? '').trim();
  if (!eventId || !windowId) return NextResponse.json({ error: 'event und window sind noetig' }, { status: 400, headers: nie });
  const titel = (q.get('titel') ?? '').trim() || windowId;
  const min = Number(q.get('min')) || undefined;
  try {
    return NextResponse.json(await ftPostsFuer(eventId, windowId, titel, min), { headers: nie });
  } catch (e) {
    const fehlt = e instanceof FtDatenFehlen;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: fehlt ? 404 : 500, headers: nie });
  }
}
