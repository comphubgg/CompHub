import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { speicher, liesJson, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * Ein Spielerfoto hochladen - aus dem Admin-Werkzeug der E-Sports-Teams.
 *
 * Der Betreiber (28.9.2026): "lass mich bei den Admin Tool ... die Spieler
 * auch ein Profil[bild] hochladen ... wenn es keins hat." Ein vorhandenes
 * Foto laesst sich ersetzen, muss aber nicht.
 *
 *   POST (Formular: datei, epicId, name)   nur Admin
 *   GET  ?datei=spielerfotos/...webp       das Bild ausliefern
 *
 * Abgelegt als WebP (hoechstens 600 px hoch) im Objektspeicher; die
 * Zuordnung Konto -> Datei steht wie bei allen Fotos in spielerbilder.json.
 * Angezeigt wird es ueber dieselbe Adresse wie die mitgelieferten Fotos
 * (/spielerbilder/<datei>) - was dort nicht als Datei liegt, reicht
 * next.config an diese Schnittstelle weiter.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDNER = 'spielerfotos/';
const NAME = /^[a-z0-9-]+\.webp$/;

export async function GET(request: Request) {
  const datei = (new URL(request.url).searchParams.get('datei') ?? '').replace(/^spielerfotos\//, '');
  if (!NAME.test(datei)) return NextResponse.json({ fehler: 'unknown photo' }, { status: 404 });
  try {
    const roh = await speicher.lies(ORDNER + datei);
    if (!roh) return NextResponse.json({ fehler: 'unknown photo' }, { status: 404 });
    return new NextResponse(new Uint8Array(roh), {
      headers: {
        'Content-Type': 'image/webp',
        // Jede Fassung hat ihren eigenen Namen - sie aendert sich nie.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 503 });
  }
}

interface Bild { datei?: string; epicId?: string; name?: string; echtesFoto?: boolean }

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const datei = form?.get('datei');
  const epicId = String(form?.get('epicId') ?? '').toLowerCase();
  const name = String(form?.get('name') ?? '').trim().slice(0, 40);
  if (!(datei instanceof File) || !/^[0-9a-f]{32}$/.test(epicId)) {
    return NextResponse.json({ fehler: 'Photo or account missing.' }, { status: 400 });
  }
  if (datei.size > 15 * 1024 * 1024) return NextResponse.json({ fehler: 'The photo is larger than 15 MB.' }, { status: 413 });

  let bild: Buffer;
  try {
    bild = await sharp(Buffer.from(await datei.arrayBuffer())).rotate()
      .resize({ height: 600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch {
    return NextResponse.json({ fehler: 'This file is not an image.' }, { status: 400 });
  }

  const kurz = (name || 'spieler').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spieler';
  const dateiName = `${kurz}-${epicId.slice(0, 8)}-${Date.now().toString(36)}.webp`;
  try {
    await speicher.schreib(ORDNER + dateiName, bild);
    const liste = await liesJson<Bild[]>('spielerbilder.json', []);
    const da = liste.find((b) => b.epicId === epicId);
    if (da) { da.datei = dateiName; da.echtesFoto = true; }
    else liste.push({ datei: dateiName, epicId, name: name || epicId.slice(0, 8), echtesFoto: true });
    await schreibJson('spielerbilder.json', liste);
  } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now - the photo was not saved.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, bild: `/spielerbilder/${dateiName}` });
}
