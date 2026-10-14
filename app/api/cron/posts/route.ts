import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { heuteDatum, postSeite, tagesplan } from '@/lib/tagesposts';
import { schickePosts } from '@/lib/discord';

/*
 * Taeglich am Morgen (Ablauf "Discord live", 07 Uhr UTC): den Tagesplan anlegen und dem Admin in #admin-posts Bescheid geben (lib/tagesposts).
 * Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel. Ein zweiter Aufruf am selben Tag legt nichts neu an und
 * meldet nichts noch einmal (der Plan des Tages steht schon in der Ablage).
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const datum = heuteDatum();
    const vorher = await tagesplan(datum, false);
    if (vorher) return NextResponse.json({ ok: true, schon: true, posts: vorher.posts.length });
    const plan = await tagesplan(datum, true);
    if (!plan?.posts.length) return NextResponse.json({ ok: true, posts: 0, hinweis: 'keine Posts moeglich - Datenlage leer' });
    // Zum Ausprobieren (COMPHUB_NUR_LESEN=1, Entwicklungsserver): den Plan zeigen, aber nichts nach Discord schicken.
    if (process.env.COMPHUB_NUR_LESEN === '1') return NextResponse.json({ ok: true, probe: true, plan });
    const r = await schickePosts({
      titel: `Heutige Posts (${plan.posts.length}) - ${datum}`,
      zeilen: plan.posts.map((p) => p.titel),
      url: postSeite(datum),
    });
    return NextResponse.json({ ok: true, posts: plan.posts.length, gemeldet: r.ok, grund: r.grund });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
