import { NextResponse } from 'next/server';
import { liesQuellen } from '@/lib/fotoQuellen';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die Credits, die am einzelnen Foto stehen bleiben (lib/fotoQuellen.ts): nur kleine Quellen (weniger als zwei oeffentliche Fotos, typisch das X-Konto
 * einer Org) oder Eintraege mit "einzeln". Grosse Quellen stehen nur in der Liste "Photos from" (/api/foto-quellen).
 *
 *   GET -> { credits: { "f1shyx": { text: "@glore_gg", link: "https://x.com/glore_gg", handle: "glore_gg" }, ... } }
 *
 * Lizenz, Vermutungen und Notizen gehen hier nie hinaus. Gelesen von app/components/FotoCredit.tsx.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const credits = await liesQuellen().then((q) => q.einzeln).catch(() => ({}));
  return zwischenspeichern(NextResponse.json({ credits }), 300);
}
