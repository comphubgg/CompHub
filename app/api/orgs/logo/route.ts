import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import { speicher } from '@/lib/ablage';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';

/*
 * Die Logos der Organisationen, die der Betreiber selbst hochlaedt.
 *
 *   POST (Formular, Feld "datei", "org")  hochladen - nur Admin; zurueck kommt
 *                                         die Adresse fuer das Feld "logo"
 *   GET ?datei=org-logos/...              das Bild ausliefern
 *
 * Abgelegt als quadratisches WebP (256 px) im Objektspeicher - ein Logo muss
 * nicht groesser sein, und ein Handyfoto von zehn Megabyte gehoert nicht in
 * die Ablage.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin' && !k.gesperrt) return true;
  }
  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;
  const name = vipAus(wert);
  if (!name) return false;
  return rechteVon(await zugangNach(name)).rolle === 'admin';
}

export async function GET(request: Request) {
  const datei = new URL(request.url).searchParams.get('datei') ?? '';
  if (!/^org-logos\/[a-z0-9-]+\.webp$/.test(datei)) {
    return NextResponse.json({ fehler: 'unknown logo' }, { status: 404 });
  }
  try {
    const roh = await speicher.lies(datei);
    if (!roh) return NextResponse.json({ fehler: 'unknown logo' }, { status: 404 });
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

/**
 * Ist das Logo dunkel auf durchsichtigem Grund?
 *
 * Gemessen am staerksten Farbkanal der deckenden Punkte, nicht an der
 * Leuchtdichte: ein rotes Logo (T1) ist auf dunklem Grund gut zu sehen,
 * obwohl seine Leuchtdichte niedrig ist; ein schwarzes (CGN) nicht.
 */
async function dunklesLogo(png: Buffer): Promise<boolean> {
  const { data } = await sharp(png).ensureAlpha().resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  let summe = 0; let deckend = 0; let durch = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128) { summe += Math.max(data[i], data[i + 1], data[i + 2]); deckend += 1; } else durch += 1;
  }
  return deckend > 0 && summe / deckend < 70 && durch / (durch + deckend) > 0.2;
}

export async function POST(request: Request) {
  if (!await istAdmin()) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const datei = form?.get('datei');
  const org = String(form?.get('org') ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'org';
  if (!(datei instanceof File) || !datei.size) {
    return NextResponse.json({ fehler: 'No image received.' }, { status: 400 });
  }
  if (datei.size > 8 * 1024 * 1024) {
    return NextResponse.json({ fehler: 'The image is larger than 8 MB.' }, { status: 413 });
  }
  let bild: Buffer;
  try {
    const roh = await sharp(Buffer.from(await datei.arrayBuffer()))
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
    bild = await (await dunklesLogo(roh)
      // Schwarz auf durchsichtig verschwindet auf der dunklen Seite - dann
      // bekommt das Logo eine helle Flaeche.
      ? sharp(roh).flatten({ background: '#f1f5f9' })
      : sharp(roh)).webp({ quality: 90 }).toBuffer();
  } catch {
    return NextResponse.json({ fehler: 'This file is not an image that can be read (PNG, JPG, WebP, SVG).' }, { status: 400 });
  }
  const name = `org-logos/${org}-${Date.now().toString(36)}.webp`;
  try {
    await speicher.schreib(name, bild);
  } catch (e) {
    return NextResponse.json({ fehler: `Not saved: ${(e as Error).message}` }, { status: 503 });
  }
  return NextResponse.json({ ok: true, logo: `/api/orgs/logo?datei=${encodeURIComponent(name)}` });
}
