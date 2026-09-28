import { GET as kartenBild } from '@/app/api/karten-bild/route';

/* /bilder/karten/<id>.png - ein hochgeladenes Kartenbild, von Cloudflare zwischengespeichert (lib/bildAdressen). */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const id = (await params).datei.replace(/\.png$/, '');
  return kartenBild(new Request(new URL(`/api/karten-bild?datei=1&id=${encodeURIComponent(id)}`, request.url), { headers: request.headers }));
}
