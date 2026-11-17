import { NextResponse } from 'next/server';
import { ichDarfFinest, FINEST_KOEPFE } from '@/lib/finestZugang';

/*
 * Private partner tabs on the overlay overview - only the ones the signed-in
 * person may see, everyone else gets an empty list.
 *
 * The cards come from here, not from the page's code: so nothing about a
 * private partner (name, link, logo) is in the public JavaScript that every
 * visitor downloads (lib/finestZugang).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface PartnerKachel {
  id: string;
  titel: string;
  text: string;
  href: string;
  logo: string;
  farbe: string;
  knopf: string;
}

export async function GET() {
  const kacheln: PartnerKachel[] = [];
  if ((await ichDarfFinest()).length) {
    kacheln.push({
      id: 'finest',
      titel: 'Finest Creative',
      text: 'Private demo: 1v1–4v4 scoreboards with the animated map header. Only visible to invited accounts.',
      href: '/overlays/finest',
      logo: '/api/finest/datei/logo.png',
      farbe: '#f5b82e',
      knopf: 'Open Finest Creative',
    });
  }
  return NextResponse.json({ kacheln }, { headers: FINEST_KOEPFE });
}
