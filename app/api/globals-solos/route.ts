import { NextResponse } from 'next/server';
import { globalsSolos } from '@/lib/globalsSolos';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';
import { leereNoble } from '@/lib/nobleKarte';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * Die Daten der Seite "Globals Solos": Finalisten nach Herkunft, die Heats und die Karten.
 *
 * Der Inhalt steht bei Noble Practice ohnehin offen im Netz; die Seite dazu ist fuer VIPs, die Sperre
 * liegt auf der Seite (lib/sektionen). "?frisch=1" leert den Kurzspeicher - nur fuer den Admin, damit
 * niemand die Quelle im Sekundentakt abfragt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const suche = new URL(request.url).searchParams;
  const frisch = suche.get('frisch') === '1';
  const wunsch = (suche.get('region') ?? 'EU').toUpperCase();
  const region = (SOLOS_REGIONEN as readonly string[]).includes(wunsch) ? wunsch : 'EU';
  if (frisch && await istAdminAnfrage(request)) leereNoble();
  try {
    const daten = await globalsSolos(region);
    if (!daten) {
      return NextResponse.json({ ok: false, error: region === 'EU' ? 'Noble führt FNCS Solos gerade nicht.' : 'Epic führt FNCS Solos in dieser Region gerade nicht.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: true, ...daten },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Noble nicht erreichbar: ${(e as Error).message}` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
