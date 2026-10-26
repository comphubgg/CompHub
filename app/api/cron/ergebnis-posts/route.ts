import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { ergebnisPostsAnlegen } from '@/lib/ergebnisPosts';
import { heuteDatum, postSeite } from '@/lib/tagesposts';
import { schickePosts, schickeBeitragMitBild } from '@/lib/discord';

/*
 * Alle zehn Minuten (Ablauf "Discord live"): zu jedem seit einer halben Stunde beendeten Spieltag den fertigen Ergebnis-Post anlegen (lib/ergebnisPosts) und dem
 * Admin in #admin-posts Bescheid geben. Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel. Ein Spieltag bekommt nur einen
 * Post - ein zweiter Lauf findet nichts Neues und meldet nichts.
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
    // ?stunden=48 (nur zum Ausprobieren/Nachholen): wie weit zurueck gesucht wird, hoechstens drei Tage.
    const stunden = Math.min(72, Math.max(1, Number(new URL(request.url).searchParams.get('stunden')) || 12));
    const neu = await ergebnisPostsAnlegen(6, stunden);
    if (!neu.length) return NextResponse.json({ ok: true, neu: 0 });
    // Zum Ausprobieren (COMPHUB_NUR_LESEN=1): zeigen, nichts nach Discord schicken.
    if (process.env.COMPHUB_NUR_LESEN === '1') return NextResponse.json({ ok: true, probe: true, neu: neu.length, posts: neu });
    const r = await schickePosts({
      titel: `Neue Ergebnis-Posts (${neu.length}) - ${heuteDatum()}`,
      zeilen: neu.map((p) => p.titel),
      url: postSeite(heuteDatum()),
    });
    // Dazu je Post das fertige Bild (Fotomosaik der Besten) mit dem Text zum Kopieren - das Ergebnisbild nach jedem Spieltag (Idee 5).
    let bilder = 0;
    for (const p of neu) {
      const info = (p.bild ?? {}) as { ids?: string[]; event?: string; window?: string; region?: string; titel?: string; stufe?: string; datum?: string };
      const ids = info.ids ?? [];
      let png: Uint8Array | null = null;
      // Das Bild: das Standings-Plakat mit den Top 10, Profilbildern und Flaggen (Betreiber, 26.10.2026); faellt es aus, das Fotomosaik wie bisher.
      const schluesselBot = (process.env.CRON_SECRET || process.env.DISCORD_BOT_TOKEN || '').trim();
      if (info.event && info.window && schluesselBot) {
        try {
          const q = new URLSearchParams({ art: 'standings', event: info.event, windows: info.window, titel: info.titel ?? '', stufe: info.stufe ?? '', region: info.region ?? '', datum: info.datum ?? '' });
          const pl = await fetch(`https://www.thecomphub.com/api/plakat?${q.toString()}`, { headers: { Authorization: `Bearer ${schluesselBot}` }, signal: AbortSignal.timeout(90_000) });
          if (pl.ok && (pl.headers.get('content-type') ?? '').startsWith('image/')) png = new Uint8Array(await pl.arrayBuffer());
        } catch { /* dann das Fotomosaik */ }
      }
      if (png || ids.length) {
        try {
          const b = png ? null : await fetch(`https://www.thecomphub.com/api/beitrag-bild?ids=${ids.join(',')}&anzahl=5`, { signal: AbortSignal.timeout(60_000) });
          if (!png && b && b.ok) png = new Uint8Array(await b.arrayBuffer());
          if (png) {
            const s = await schickeBeitragMitBild({ titel: p.titel, text: p.text, url: postSeite(heuteDatum()), bild: png, dateiname: `ergebnis-${heuteDatum()}-${bilder + 1}.png` });
            if (s.ok) bilder += 1;
          }
        } catch { /* ohne Bild bleibt die Meldung oben */ }
      }
    }
    return NextResponse.json({ ok: true, neu: neu.length, gemeldet: r.ok, grund: r.grund, bilder });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
