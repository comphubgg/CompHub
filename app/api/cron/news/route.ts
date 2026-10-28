import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { neueCupsFuerNews, rankingFuerNews } from '@/lib/newsPosts';
import { schickeNews } from '@/lib/discord';

/*
 * Alle zehn Minuten (Ablauf "Discord live"): neue Cups im Katalog als Beitrag mit Grafik nach #news (lib/newsPosts). Geschützt wie die anderen Anstöße von außen:
 * CRON_SECRET oder der Bot-Schlüssel. Beim ersten Lauf wird nur der Bestand vermerkt, es kommt nichts.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const neu = await neueCupsFuerNews(3);
    // Dazu ein Power-Ranking-Update, wenn Epic die Rangliste neu berechnet hat (lib/newsPosts).
    const ranking = await rankingFuerNews().catch(() => null);
    if (ranking) neu.push(ranking);
    if (!neu.length) return NextResponse.json({ ok: true, neu: 0 });
    // Zum Ausprobieren (COMPHUB_NUR_LESEN=1): zeigen, nichts nach Discord schicken.
    if (process.env.COMPHUB_NUR_LESEN === '1') return NextResponse.json({ ok: true, probe: true, neu: neu.length, beitraege: neu });
    let gemeldet = 0;
    for (const n of neu) if ((await schickeNews(n)).ok) gemeldet += 1;
    return NextResponse.json({ ok: true, neu: neu.length, gemeldet });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
