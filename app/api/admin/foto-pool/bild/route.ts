import { NextResponse } from 'next/server';
import { speicher } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { POOL_ORDNER, istPoolId } from '@/lib/fotoPool';

/*
 * Ein Foto aus dem Pool (lib/fotoPool.ts) - nur fuer den Admin. Unzugeordnete Fotos sind privat: sie liegen nicht unter /spielerbilder, und
 * hier wird nichts zwischengespeichert, was ein anderer abrufen koennte.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (!await istAdminAnfrage()) return NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Anmeldung nicht prüfbar' }, { status: 503 });
  }
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!istPoolId(id)) return NextResponse.json({ ok: false, error: 'Unbekanntes Foto' }, { status: 400 });
  try {
    const roh = await speicher.lies(`${POOL_ORDNER}${id}.webp`);
    if (!roh) return NextResponse.json({ ok: false, error: 'Nicht gefunden' }, { status: 404 });
    return new NextResponse(new Uint8Array(roh), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=600' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Ablage antwortet nicht' }, { status: 424 });
  }
}
