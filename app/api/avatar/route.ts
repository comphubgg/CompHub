import { NextResponse } from 'next/server';
import { avatarStatus, avatare } from '@/lib/epicAvatare';

/*
 * Das Bild zu einer Cosmetic-Id (Epics Avatar eines Spielers ohne eigenes Foto, lib/epicAvatare) - von fortnite-api.com geholt und lange gecacht.
 *   GET ?c=cid_028_athena_commando_f   -> PNG
 *   GET ?stand=1                       -> wie viele Avatare bekannt sind, letzter Fehler
 */

export const runtime = 'nodejs';
const merker = new Map<string, { bytes: ArrayBuffer; typ: string }>();

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get('stand')) {
    const m = await avatare();
    return NextResponse.json({ bekannt: m.size, mitBild: [...m.values()].filter((e) => e.c).length, ...avatarStatus }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const c = (p.get('c') ?? '').toLowerCase();
  if (!/^[a-z0-9_]{3,80}$/.test(c)) return new NextResponse(null, { status: 400 });
  let b = merker.get(c);
  if (!b) {
    for (const art of ['smallicon', 'icon']) {
      const r = await fetch(`https://fortnite-api.com/images/cosmetics/br/${c}/${art}.png`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
      if (r?.ok) { b = { bytes: await r.arrayBuffer(), typ: r.headers.get('content-type') ?? 'image/png' }; break; }
    }
    if (!b) return NextResponse.redirect(new URL('/spielerbild-platzhalter.svg', request.url), 302);
    if (merker.size > 3000) merker.clear();
    merker.set(c, b);
  }
  return new NextResponse(b.bytes, { headers: { 'Content-Type': b.typ, 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
}
