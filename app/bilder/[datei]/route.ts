import path from 'path';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import { GET as karte } from '@/app/api/fortnite-map/route';
import sharp from 'sharp';

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

/*
 * /bilder/karte-nah.png - die Karte von heute ohne Ortsnamen, eng um die Insel geschnitten (Betreiber, 2.11.2026: "mehr Zoom, weniger
 * Wasser"). Der Ausschnitt wird am Bild gemessen statt fest eingestellt: die Insel von Season 43 fuellt nur gut die Haelfte des Bildes,
 * eine groessere in der naechsten Season wuerde ein fester Zoom abschneiden. Fuer kleine Vorschauen; Landepunkte bleiben auf karte-leer.
 */
async function naheKarte(request: Request): Promise<Response> {
  const leer = await karte(new Request(new URL('/api/fortnite-map?bild=leer', request.url)));
  if (!leer.ok) return leer;
  const bild = Buffer.from(await leer.arrayBuffer());
  const N = 256;
  const { data, info } = await sharp(bild).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * info.channels;
    // Wasser ist deutlich blauer als rot und mindestens so blau wie gruen - alles andere ist Land.
    if (data[i + 2] > data[i] + 25 && data[i + 2] > data[i + 1] - 10) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const meta = await sharp(bild).metadata();
  const B = meta.width ?? 2048, H = meta.height ?? 2048;
  let ausschnitt = { left: 0, top: 0, width: B, height: H };
  if (x1 > x0 && y1 > y0) {
    const seite = Math.min(N, Math.max(x1 - x0, y1 - y0) * 1.08);
    const l = Math.max(0, Math.min(N - seite, (x0 + x1) / 2 - seite / 2)), o = Math.max(0, Math.min(N - seite, (y0 + y1) / 2 - seite / 2));
    ausschnitt = { left: Math.round(l / N * B), top: Math.round(o / N * H), width: Math.round(seite / N * B), height: Math.round(seite / N * H) };
  }
  const nah = await sharp(bild).extract(ausschnitt).resize(1024, 1024).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(nah), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'CDN-Cache-Control': 'public, max-age=3600' },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  const datei = (await params).datei;
  if (datei === 'karte-nah.png') return naheKarte(request).catch(() => karte(new Request(new URL('/api/fortnite-map?bild=leer', request.url))));
  const saison = /^karte-s(\d{2,3})\.png$/.exec(datei);
  if (saison) {
    const antwort = await saisonBild(saison[1]);
    if (antwort) return antwort;
  }
  const bild = saison ? 'leer' : BILDER[datei];
  if (!bild) return new Response('not found', { status: 404 });
  return karte(new Request(new URL(`/api/fortnite-map?bild=${bild}`, request.url), { headers: request.headers }));
}
