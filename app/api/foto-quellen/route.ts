import { NextResponse } from 'next/server';
import { liesQuellen } from '@/lib/fotoQuellen';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die Liste "Photos from" (lib/fotoQuellen.ts, app/components/FotoQuellen.tsx): Organisationen und Fotografen mit der Zahl ihrer oeffentlichen Fotos.
 *
 *   GET -> { organisationen: [{ name, handle?, link?, fotos }], fotografen: [...] }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { organisationen, fotografen } = await liesQuellen();
    return zwischenspeichern(NextResponse.json({ organisationen, fotografen }), 300);
  } catch {
    return NextResponse.json({ organisationen: [], fotografen: [], fehler: true }, { status: 503 });
  }
}
