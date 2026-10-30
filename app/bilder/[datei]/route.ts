import path from 'path';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import { GET as karte } from '@/app/api/fortnite-map/route';

/*
 * /bilder/karte-leer.png und /bilder/karte-orte.png - Epics Karte unter einer
 * Adresse mit Endung, damit Cloudflare sie zwischenspeichert (lib/bildAdressen).
 *
 * /bilder/karte-s42.png - die Insel einer Saison (lib/saisonKarte, insel-bilder.json "BR:S42"), damit ein Replay von Season 42 nach dem
 * Season-Wechsel nicht die neue Insel zeigt. Ist fuer die Saison noch keine abgelegt, die Karte von heute.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BILDER: Record<string, string> = { 'karte-leer.png': 'leer', 'karte-orte.png': 'poi' };

async function saisonBild(saison: string): Promise<Response | null> {
  try {
    const inseln = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'insel-bilder.json'), 'utf8')) as Record<string, string>;
    const id = inseln[`BR:S${saison}`];
    if (!id || !/^[a-z0-9-]+$/.test(id)) return null;
    const daten = await fs.readFile(path.join(DATEN_ORT, 'kartenbilder', `${id}.png`));
    return new Response(new Uint8Array(daten), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'CDN-Cache-Control': 'public, max-age=86400' },
    });
  } catch { return null; }
}

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const datei = (await params).datei;
  const saison = /^karte-s(\d{2,3})\.png$/.exec(datei);
  if (saison) {
    const antwort = await saisonBild(saison[1]);
    if (antwort) return antwort;
  }
  const bild = saison ? 'leer' : BILDER[datei];
  if (!bild) return new Response('not found', { status: 404 });
  return karte(new Request(new URL(`/api/fortnite-map?bild=${bild}`, request.url), { headers: request.headers }));
}
