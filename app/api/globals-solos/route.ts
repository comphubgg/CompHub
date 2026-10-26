import { NextResponse } from 'next/server';
import { globalsSolos } from '@/lib/globalsSolos';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';
import { leereNoble } from '@/lib/nobleKarte';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { ueberdauernd } from '@/lib/ueberdauernd';

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
    // Die Kurzfassung der Startseite kommt nach einem Neustart sofort aus der letzten guten Antwort (lib/ueberdauernd); frisch gerechnet wird im Hintergrund.
    const kurzAnfrage = suche.get('kurz') === '1' && !frisch;
    const daten = kurzAnfrage
      ? await ueberdauernd(`globals-solos-${region}`, 2 * 60_000, 24 * 3600_000, () => globalsSolos(region))
      : await globalsSolos(region);
    if (!daten) {
      return NextResponse.json({ ok: false, error: region === 'EU' ? 'Noble führt FNCS Solos gerade nicht.' : 'Epic führt FNCS Solos in dieser Region gerade nicht.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    // Die Startseite braucht nur die Heats mit je acht Spielern (?kurz=1): ein paar Kilobyte statt 230 - sie war an der Groesse und der Wartezeit gescheitert ("Not reachable right now", 26.10.2026).
    if (suche.get('kurz') === '1') {
      const heats = daten.fenster.filter((f) => f.art === 'heat').map((f) => ({ windowId: f.windowId, name: f.name, art: f.art, start: f.start, end: f.end, spieler: f.spieler.slice(0, 8), teams: [], formen: [] }));
      return NextResponse.json({ ok: true, region: daten.region, fenster: heats }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
    }
    return NextResponse.json({ ok: true, ...daten },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Noble nicht erreichbar: ${(e as Error).message}` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
