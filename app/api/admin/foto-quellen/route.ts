import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { liesExtra, liesQuellen, setzeExtra } from '@/lib/fotoQuellen';

/*
 * Die von Hand ergaenzten Eintraege der Liste "Photos from" (foto-quellen-extra.json, lib/fotoQuellen.ts) - nur fuer den Admin, /admin/fotos-credits.
 *
 *   GET  -> { extra: { organisationen, fotografen }, liste: { organisationen, fotografen } }   (liste = was oeffentlich erscheint)
 *   POST { organisationen: [{ name, handle?, link? }], fotografen: [...] } -> ersetzt die Datei
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nein = () => NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });

export async function GET() {
  if (!await istAdminAnfrage()) return nein();
  const [extra, q] = await Promise.all([liesExtra(), liesQuellen()]);
  return NextResponse.json({ ok: true, extra, liste: { organisationen: q.organisationen, fotografen: q.fotografen } }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  let e: unknown;
  try { e = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Kein JSON' }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, extra: await setzeExtra(e) });
  } catch (f) {
    return NextResponse.json({ ok: false, error: `Speichern gescheitert: ${(f as Error).message}` }, { status: 503 });
  }
}
