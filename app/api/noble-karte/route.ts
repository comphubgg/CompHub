import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { nobleFenster, nobleKarte } from '@/lib/nobleKarte';
import { vitalAlsNoble } from '@/lib/vitalScrims';

/*
 * Die Formen und Spieler eines Turniers von Noble Practice - fuer "Generate map" auf der Turnierkarte.
 *
 *   GET ?window=<Epic-windowId>                      die Karte dieses Fensters
 *   GET ?window=...&turnier=<id>&region=<EU>         wenn Noble das Fenster anders nennt
 *   GET ?window=...&titel=<Cup>&begin=<ms>           Zuordnung ueber Turniername und Datum, wenn die Kennung nicht passt
 *   GET ?liste=1[&titel=<Cup>&begin=<ms>]            die Spieltage zur Auswahl - nur die zum Cup (Name) gehoeren, die naechsten zuerst
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
      const wunsch = { titel: (p.get('titel') ?? '').trim() || undefined, begin: Number(p.get('begin')) || undefined };
      return NextResponse.json({ ok: true, fenster: await nobleFenster(40, wunsch) }, { headers: nie });
    }
    const kennung = (p.get('window') ?? '').trim();
    if (!kennung) return NextResponse.json({ ok: false, error: 'Kein Spieltag gewählt.' }, { status: 400, headers: nie });
    const wunsch = { titel: (p.get('titel') ?? '').trim() || undefined, begin: Number(p.get('begin')) || undefined };
    let karte = await nobleKarte(kennung, p.get('turnier') ?? undefined, p.get('region') ?? undefined, wunsch);
    // Noble fuehrt nur Europa: fuer NA Central, NA West, Middle East und Ozeanien kommen die Landepunkte von Vital Scrims.
    if (!karte) karte = await vitalAlsNoble(kennung, wunsch.begin, Number(p.get('ende')) || null, p.get('region') ?? undefined);
    if (!karte) {
      return NextResponse.json({
        ok: false, nichtGefunden: true,
        error: 'Weder Noble noch Vital führen diesen Spieltag (noch). Wähle ihn aus der Liste von Noble.',
      }, { status: 404, headers: nie });
    }
    return NextResponse.json({ ok: true, ...karte, stand: new Date().toISOString() }, { headers: nie });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Noble nicht erreichbar: ${(e as Error).message}` },
      { status: 424, headers: nie });
  }
}
