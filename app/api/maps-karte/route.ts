import { NextResponse } from 'next/server';
import { fensterFuer, vitalFenster } from '@/lib/globalsSolos';
import { istVitalRegion } from '@/lib/vitalScrims';
import { mapsVerzeichnis } from '@/lib/mapsVerzeichnis';
import { ALT, alteFenster, inselFuer, mitHandEbene } from '@/lib/alteMaps';
import { fncsPlatzierungen } from '@/lib/fncsEreignisse';

/*
 * Die Karte eines Fensters, wie Noble Practice sie fuehrt: die Spieler (mit Land und Foto) und die Landepunkte.
 * Fuer die Detailseite unter /tournament-maps/karte. Kein Konto noetig.
 *
 *   GET ?t=<Turnier-Id>&r=<Region>&w=<Fenster-Kennung>
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const t = p.get('t') ?? '';
  const r = p.get('r') ?? '';
  const w = p.get('w') ?? '';
  if (!t || !r || !w) return NextResponse.json({ ok: false, error: 'Turnier, Region und Fenster fehlen.' }, { status: 400 });
  try {
    // Die Karten ohne Landepunkte (Archiv, aeltere Events, vom Admin angelegt) - siehe lib/alteMaps.
    if (t.startsWith(ALT)) {
      const e = (await mapsVerzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
      if (!e) return NextResponse.json({ ok: false, error: 'Dieses Fenster gibt es nicht.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const platzierungen = await fncsPlatzierungen(e).catch(() => []);
      return NextResponse.json({ ok: true, ...await alteFenster(e, p.get('tag') ?? 'gesamt'), platzierungen }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // NA Central, NA West, Middle East und Ozeanien: die Landepunkte kommen von Vital Scrims, nicht von Noble.
    const vitalEintrag = istVitalRegion(r) ? (await mapsVerzeichnis()).find((x) => x.turnierId === t && x.windowId === w && x.region === r) : undefined;
    const f = vitalEintrag
      ? await vitalFenster({ windowId: vitalEintrag.windowId, name: vitalEintrag.fenster || vitalEintrag.titel, region: r, begin: vitalEintrag.datum ?? 0, ende: vitalEintrag.ende, vitalId: vitalEintrag.vitalId })
      : await fensterFuer(t, r, w);
    if (!f) return NextResponse.json({ ok: false, error: 'Dieses Fenster gibt es nicht.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Ein Finale an zwei Tagen (Epics Archiv): die Seite zeigt Day 1 / Day 2 / Combined.
    const e = (await mapsVerzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
    const platzierungen = e ? await fncsPlatzierungen(e).catch(() => []) : [];
    // Nennt Noble fuer das Fenster nur die allgemeine, immer aktuelle Spielkarte (fortnite-api.com), steht dort bei einem alten Event die falsche
    // Insel (Global Championship 2025 zeigte die Insel von heute): dann gilt die Insel der Saison des Events.
    if (e && (!f.fenster.bild || f.fenster.bild.includes('fortnite-api.com/images/map'))) f.fenster.bild = inselFuer(e.saison);
    // Formen und Teams, die der Admin selbst eingetragen hat (wo Noble keine fuehrt), gelten vor Nobles.
    // Antwortet die Ablage nicht, bleibt es bei Nobles Karte - sie faellt nicht aus.
    if (e) f.fenster = await mitHandEbene(e, f.fenster).catch(() => f.fenster);
    return NextResponse.json({ ok: true, ...f, tage: (e?.tage ?? []).map((d) => ({ name: d.name, windowId: d.windowId })), platzierungen }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
