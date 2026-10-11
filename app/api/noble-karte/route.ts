import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { nobleFenster, nobleKarte } from '@/lib/nobleKarte';

/*
 * Die Formen und Spieler eines Turniers von Noble Practice - fuer "Generate map" auf der Turnierkarte.
 *
 *   GET ?window=<Epic-windowId>                      die Karte dieses Fensters
 *   GET ?window=...&turnier=<id>&region=<EU>         wenn Noble das Fenster anders nennt
 *   GET ?liste=1                                     die Fenster der juengsten Turniere zur Auswahl
 *
 * Nur Admin: die Antwort wird in eine Karte uebernommen, die der Betreiber verantwortet.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ ok: false, error: 'Nicht erlaubt.' }, { status: 403, headers: nie });
  }
  const p = new URL(request.url).searchParams;
  try {
    if (p.get('liste')) {
      return NextResponse.json({ ok: true, fenster: await nobleFenster(10) }, { headers: nie });
    }
    const kennung = (p.get('window') ?? '').trim();
    if (!kennung) return NextResponse.json({ ok: false, error: 'Kein Spieltag gewählt.' }, { status: 400, headers: nie });
    const karte = await nobleKarte(kennung, p.get('turnier') ?? undefined, p.get('region') ?? undefined);
    if (!karte) {
      return NextResponse.json({
        ok: false, nichtGefunden: true,
        error: 'Noble führt diesen Spieltag (noch) nicht. Wähle ihn aus der Liste von Noble.',
      }, { status: 404, headers: nie });
    }
    return NextResponse.json({ ok: true, ...karte, stand: new Date().toISOString() }, { headers: nie });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Noble nicht erreichbar: ${(e as Error).message}` },
      { status: 502, headers: nie });
  }
}
