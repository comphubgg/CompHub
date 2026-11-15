import { NextResponse } from 'next/server';
import { sseAntwort } from '@/lib/liveStrom';
import { abonniereFenster, pruefeFenster } from '@/lib/liveFenster';

/*
 * Ein laufender Spieltag als Datenstrom (Betreiber, 15.11.2026: "When the server has it, I want to see it on the page within 1 second").
 *
 *   GET ?event=<eventId>&window=<windowId>&what=matches,leaderboard,qual   (EventSource)
 *     event: hallo        { v, updated, seiten }  gleich beim Verbinden (die Seite gleicht damit nach einem Neuverbinden ab)
 *     event: leaderboard  { v, updated, seiten, teil, zeit }   neuer Stand der Bestenliste - jetzt neu fragen, er liegt schon im Speicher
 *     event: matches      dasselbe fuer die Runden-Liste
 *     event: qual         dasselbe fuer Quali-Linie und Punkte je Platz
 *     event: ende         der Spieltag ist vorbei (der Abruf endet)
 *
 * Gefragt wird Epic nicht je Zuschauer, sondern einmal je Spieltag (lib/liveFenster). Oeffentlich wie die Bestenliste selbst, aber nur fuer Spieltage,
 * die laut Epics Katalog gerade laufen (sonst 409/404) - so kann niemand Abrufe fuer beliebige Fenster anstossen. Ohne Strom fragt die Seite wie bisher.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEILE = ['matches', 'leaderboard', 'qual'] as const;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = (p.get('event') ?? '').trim();
  const window = (p.get('window') ?? '').trim();
  const gewuenscht = (p.get('what') ?? TEILE.join(',')).split(',').map((s) => s.trim());
  const teile = TEILE.filter((t) => gewuenscht.includes(t));
  const pruefung = await pruefeFenster(event, window);
  if (!pruefung.ok) return NextResponse.json({ ok: false, grund: pruefung.grund }, { status: pruefung.status, headers: { 'Cache-Control': 'no-store' } });
  return sseAntwort(request, (s) => {
    const abo = abonniereFenster(event, window, pruefung, (ereignis, daten) => {
      if (ereignis === 'stand') for (const t of teile) s.sende(t, daten);
      else if (ereignis === 'ende') { s.sende('ende', daten); s.schliesse(); }
    });
    s.sende('hallo', abo.stand());
    return abo.weg;
  });
}
