import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { postIdeen } from '@/lib/postIdeenDaten';
import { bildMittel, ideeBild } from '@/lib/postIdeenBild';
import { FORMATE, type Format } from '@/lib/postIdeen';

/*
 * Post-Ideen fuer jeden Tag (lib/postIdeen.ts) - fuer die Seite /admin/post-ideen.
 *
 *   GET                                   { erstellt, ideen, auswahl, fehler } - auswahl: die zwei fuer heute
 *   GET ?neu=1                            dasselbe, frisch gerechnet (sonst zehn Minuten vorgehalten)
 *   GET ?bild=<id>&format=1600x900        das Bild einer Idee als PNG (format: 1600x900 oder 1500x500)
 *   &download=1                           als Datei zum Speichern
 *
 * Nur fuer den Admin: das Teilnehmerfeld fragt Epic je Konto nach Marken, und die Bilder kosten Rechenzeit.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const url = new URL(request.url);
  const p = url.searchParams;
  const stand = await postIdeen(p.get('neu') === '1');

  const id = p.get('bild');
  if (!id) return NextResponse.json(stand, { headers: { 'Cache-Control': 'private, no-store' } });

  const idee = stand.ideen.find((i) => i.id === id);
  if (!idee) return NextResponse.json({ fehler: 'Diese Idee gibt es heute nicht (mehr).' }, { status: 404 });
  const format = (FORMATE as string[]).includes(p.get('format') ?? '') ? p.get('format') as Format : idee.standardFormat;
  const mittel = await bildMittel(idee.bild, url.origin);
  const { element, breite, hoehe } = ideeBild(idee.bild, format, mittel);
  const antwort = new ImageResponse(element, { width: breite, height: hoehe, fonts: mittel.fonts });
  antwort.headers.set('Cache-Control', 'private, max-age=300');
  if (p.get('download') === '1') {
    const name = `comphub-${idee.id.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${format}.png`;
    antwort.headers.set('Content-Disposition', `attachment; filename="${name}"`);
  }
  return antwort;
}
