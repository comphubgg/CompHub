import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber } from '@/lib/vipCookie';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Die Bilder zu einer Meldung.
 *
 * Sie liegen bewusst nicht unter "public": dort waere jedes davon fuer jeden
 * abrufbar, der die Adresse errät - und auf einem Bildschirmausschnitt steht
 * schnell mehr, als der Absender zeigen wollte. Hier sieht sie nur der
 * Betreiber.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDNER = path.join(DATEN_ORT, 'kontakt-bilder');
const TYPEN: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

export async function GET(request: Request) {
  const laden = await cookies();
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  const perKonto = id ? (await nachId(id))?.rolle === 'admin' : false;
  const erlaubt = perKonto
    || istBetreiber(laden.get('streamer_dashboard_auth')?.value);
  if (!erlaubt) return new NextResponse('nicht erlaubt', { status: 403 });

  const datei = new URL(request.url).searchParams.get('datei') ?? '';
  /*
   * Nur ein reiner Dateiname, kein Pfad.
   *
   * Ohne diese Pruefung liesse sich mit "../../.env.local" jede Datei des
   * Rechners abholen - der klassische Weg aus einem Ordner heraus.
   */
  if (!/^[A-Za-z0-9-]+\.(png|jpg|webp|gif)$/.test(datei)) {
    return new NextResponse('ungueltig', { status: 400 });
  }

  try {
    const roh = await fs.readFile(path.join(ORDNER, datei));
    return new NextResponse(new Uint8Array(roh), {
      headers: {
        'Content-Type': TYPEN[path.extname(datei)] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('nicht gefunden', { status: 404 });
  }
}
