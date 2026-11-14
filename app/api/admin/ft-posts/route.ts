import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { FtDatenFehlen, ftPostsFuer } from '@/lib/ftPostsDaten';

/*
 * Die Stat-Posts eines Spieltags fuer die Beitragsseite (app/admin/tweets): Best Stats, Elims, Damage, Best Game, Hits, Builds, Mats, Time Alive,
 * Distance, Storm - dieselben Texte wie scripts/ft-posts.mjs (lib/ftPosts.ts). Je Post dazu die Fotos fuer das Bild darunter (lib/ftBild.ts zeichnet es im Browser).
 *
 *   GET ?event=<eventId>&window=<windowId>&titel=<Kopfzeile>[&min=<Mindestspiele>][&quelle=auto|epic|replay]
 *     -> { posts: [{ art, titel, text, quelle: 'epic' | 'replay', kandidaten: [{ id, name, land }], bild: [{ id, name, land, datei, gesicht: [x, y, w] | null }] }],
 *          stand: { gelesen, gesamt, teilweise }, minSpiele, spieler, teams, quelle, replayFehlt?, epicStand? }
 *   Der Standings-Post (Plaetze 1-10 nach Punkten) kommt aus Epics Bestenliste und steht sofort nach dem letzten Game bereit; alle Stat-Posts nur aus
 *   den Replays. Ohne Replay-Auswertung kommt nur der Standings-Post mit replayFehlt. quelle=epic: nur der Standings-Post, frisch von Epic.
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
  const quelle = q.get('quelle') === 'epic' ? 'epic' : q.get('quelle') === 'replay' ? 'replay' : 'auto';
  try {
    return NextResponse.json(await ftPostsFuer(eventId, windowId, titel, min, quelle), { headers: nie });
  } catch (e) {
    const fehlt = e instanceof FtDatenFehlen;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: fehlt ? 404 : 500, headers: nie });
  }
}
