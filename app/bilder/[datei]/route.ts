import { GET as karte } from '@/app/api/fortnite-map/route';

/*
 * /bilder/karte-leer.png und /bilder/karte-orte.png - Epics Karte unter einer
 * Adresse mit Endung, damit Cloudflare sie zwischenspeichert (lib/bildAdressen).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BILDER: Record<string, string> = { 'karte-leer.png': 'leer', 'karte-orte.png': 'poi' };

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const bild = BILDER[(await params).datei];
  if (!bild) return new Response('not found', { status: 404 });
  return karte(new Request(new URL(`/api/fortnite-map?bild=${bild}`, request.url), { headers: request.headers }));
}
