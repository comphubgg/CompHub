/*
 * Videos und Vorschaubilder der Seite /how-it-works - aus dem Release "medien", mit dem richtigen Inhaltstyp und mit Teilabrufen (Range).
 *
 * Ein Release-Anhang kommt von GitHub als application/octet-stream mit "attachment" - ein <video> soll aber video/mp4 bekommen und vorspulen koennen
 * (206 Partial Content). Darum reicht diese Route den Abruf durch: die Range-Angabe des Browsers geht unveraendert an GitHub, Status, Laenge und
 * Content-Range kommen unveraendert zurueck, nur Inhaltstyp und Zwischenspeicher setzt sie selbst. Die Videos liegen bewusst nicht im Git (40-60 MB).
 *
 * Nur die Dateien der Liste - kein offener Durchgriff auf alles im Release.
 *
 *   GET /media/hiw-match-replays.mp4      (Range: bytes=0- -> 206)
 *   HEAD /media/hiw-match-replays.mp4
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { MEDIEN, medienQuelle } from '@/lib/hiwMedien';

async function liefern(request: Request, datei: string, nurKopf: boolean) {
  const typ = MEDIEN[datei];
  if (!typ) return new Response('Not found', { status: 404 });
  const range = request.headers.get('range');
  let r: Response;
  try {
    r = await fetch(medienQuelle(datei), {
      method: nurKopf ? 'HEAD' : 'GET',
      headers: range ? { range } : {},
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return new Response('Upstream unreachable', { status: 502 });
  }
  if (r.status === 404) return new Response('Not found', { status: 404 });
  if (r.status === 416) {
    return new Response(null, { status: 416, headers: { 'content-range': r.headers.get('content-range') ?? '' } });
  }
  if (!r.ok) return new Response('Upstream error', { status: 502 });
  const kopf = new Headers({
    'content-type': typ,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
  });
  const laenge = r.headers.get('content-length');
  if (laenge) kopf.set('content-length', laenge);
  const bereich = r.headers.get('content-range');
  if (bereich) kopf.set('content-range', bereich);
  return new Response(nurKopf ? null : r.body, { status: r.status === 206 ? 206 : 200, headers: kopf });
}

export async function GET(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  return liefern(request, (await params).datei, false);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ datei: string }> }) {
  return liefern(request, (await params).datei, true);
}
