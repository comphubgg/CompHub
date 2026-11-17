import { NextResponse } from 'next/server';
import { liesCredits, oeffentlich } from '@/lib/fotoCredits';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die Fotografen-Angaben, die oeffentlich am Foto stehen duerfen (lib/fotoCredits.ts): nur bestaetigte Eintraege, je Dateistamm Text und Link.
 *
 *   GET -> { credits: { "bloomy": { text: "Michal Konkol", link: "https://x.com/KonkolMichal" }, ... } }
 *
 * Vermutungen ("wahrscheinlich"), Herkunft und Notizen gehen hier nie hinaus. Gelesen von app/components/FotoCredit.tsx.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const credits = oeffentlich(await liesCredits().catch(() => ({})));
  return zwischenspeichern(NextResponse.json({ credits }), 300);
}
