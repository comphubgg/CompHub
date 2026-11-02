import { NextResponse } from 'next/server';
import { globalsSolos } from '@/lib/globalsSolos';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';
import { leereNoble } from '@/lib/nobleKarte';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { liesJson, schreibJson } from '@/lib/ablage';

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
  /*
   * Eine fruehere Reihe als Archiv (Betreiber, 2.11.2026: "die alte Solo-FNCS-Seite soll wie die Globals-Seite sein - offline, aber noch
   * vorhanden"): ?reihe=S42. Einmal eingefroren in solos-archiv/<reihe>-<region>.json, danach immer genau dieser Stand - Noble und Epic
   * fuehren die alte Reihe nicht ewig.
   */
  const reihe = (suche.get('reihe') ?? '').toUpperCase();
  if (/^S\d{2}$/.test(reihe)) {
    try {
      const datei = `solos-archiv/${reihe}-${region}.json`;
      const da = await liesJson<Record<string, unknown> | null>(datei, null).catch(() => null);
      if (da) return NextResponse.json({ ok: true, archiv: reihe, ...da }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
      const neu = await globalsSolos(region, reihe.slice(1));
      const passt = !!neu && neu.stufen.length > 0 && neu.stufen.every((x) => x.windowId.toUpperCase().startsWith(`${reihe}_`))
        && (!neu.fenster.length || neu.fenster.some((x) => x.windowId.toUpperCase().startsWith(`${reihe}_`)));
      if (!neu || !passt) return NextResponse.json({ ok: false, error: 'Diese Reihe liegt nicht mehr vor.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      await schreibJson(datei, neu).catch(() => { /* dann beim naechsten Aufruf */ });
      return NextResponse.json({ ok: true, archiv: reihe, ...neu }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  try {
    // Die Kurzfassung der Startseite kommt nach einem Neustart sofort aus der letzten guten Antwort (lib/ueberdauernd); frisch gerechnet wird im Hintergrund.
    const kurzAnfrage = suche.get('kurz') === '1' && !frisch;
    const roh = kurzAnfrage
      ? await ueberdauernd(`globals-solos-${region}`, 2 * 60_000, 24 * 3600_000, () => globalsSolos(region))
      : await globalsSolos(region);
    /*
     * Nur die laufende Reihe (2.11.2026): Epics Stufen waren schon die Solos Reload (Season 43), Spieler, Heats und Karten kamen aber noch von
     * den Battle-Royale-Solos der Season 42 - die Seite stand deshalb als "FNCS · Battle Royale" da, die Startseite zeigte deren Heats. Gehoert
     * die Reihe der Stufen nicht zu der der Spieltage, fallen die Spieltage weg, bis die neue Reihe eigene hat.
     */
    const reloadStufen = !!roh?.stufen.some((x) => /reload/i.test(x.windowId));
    const reloadFenster = !!roh?.fenster.some((x) => /reload/i.test(x.windowId));
    const daten = roh && roh.fenster.length && reloadStufen !== reloadFenster ? { ...roh, fenster: [], qualifiziert: [] } : roh;
    if (!daten) {
      return NextResponse.json({ ok: false, error: region === 'EU' ? 'Noble führt FNCS Solos gerade nicht.' : 'Epic führt FNCS Solos in dieser Region gerade nicht.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    // Die Startseite braucht nur die Heats mit je acht Spielern (?kurz=1): ein paar Kilobyte statt 230 - sie war an der Groesse und der Wartezeit gescheitert ("Not reachable right now", 26.10.2026).
    if (suche.get('kurz') === '1') {
      const heats = daten.fenster.filter((f) => f.art === 'heat').map((f) => ({ windowId: f.windowId, name: f.name, art: f.art, start: f.start, end: f.end, spieler: f.spieler.slice(0, 8), teams: [], formen: [] }));
      // Dazu die Stufen mit Stand und Zeit: die Startseite zeigt die Solos nur, solange eine Reihe laeuft (Betreiber, 30.10.2026).
      const stufen = daten.stufen.map((s) => ({ windowId: s.windowId, name: s.name, art: s.art, status: s.status, begin: s.begin, end: s.end }));
      return NextResponse.json({ ok: true, region: daten.region, fenster: heats, stufen }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
    }
    return NextResponse.json({ ok: true, ...daten },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Noble nicht erreichbar: ${(e as Error).message}` },
      { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
