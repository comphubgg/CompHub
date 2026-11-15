import { NextResponse } from 'next/server';
import { wer, vipWerkzeug } from '@/lib/pov';
import { matchIdAuskunft, antwortAus } from '@/lib/matchIdAuskunft';
import { freundKanal, freundeDienstStatus, freundeStatusKanal, type FreundStatus } from '@/lib/epicFreundeStatus';
import { abonniere, sseAntwort } from '@/lib/liveStrom';

/*
 * Die Match-ID als Datenstrom (Betreiber, 15.11.2026: "When the server has it, I want to see it on the page within 1 second").
 *
 *   GET ?kanal=<twitch-login>   (EventSource)
 *     event: matchid   data: dieselbe Antwort wie /api/streams/match-id - gleich beim Verbinden und bei jedem Wechsel
 *
 * Der Zugang wie bei der Abfrage: nur Admin und VIPs mit dem Match-ID-Finder; alle anderen bekommen 403 (kein Strom). Ohne Epic-Konto zum
 * Kanal antwortet der Strom mit 204 - der Browser fragt dann nicht weiter. Der Admin bekommt in jeder Nachricht "xmpp" mit (Quelle, verbunden seit,
 * Zahl der Freunde) - auch bei jedem Verbinden/Trennen des XMPP-Dienstes.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const ich = await wer();
  if (!vipWerkzeug(ich, 'matchfinder')) {
    return NextResponse.json({ matchId: null, grund: 'kein-zugang' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const kanal = (new URL(request.url).searchParams.get('kanal') ?? '').trim().toLowerCase();
  const { antwort, epic } = await matchIdAuskunft(kanal);
  if (!epic) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const admin = ich.rolle === 'admin';
  // Der Admin bekommt dazu die Statuszeile der Verbindung (xmpp), auch bei jedem Verbinden/Trennen des XMPP-Dienstes.
  const mit = (a: Record<string, unknown>) => (admin ? { ...a, xmpp: freundeDienstStatus() } : a);
  let letzte: Record<string, unknown> = antwort;
  return sseAntwort(request, (s) => {
    s.sende('matchid', mit(antwort));
    const weg1 = abonniere(freundKanal(epic), (_e, f) => { letzte = antwortAus(epic, f as FreundStatus | null, true); s.sende('matchid', mit(letzte)); });
    const weg2 = admin ? abonniere(freundeStatusKanal, () => s.sende('matchid', mit(letzte))) : () => {};
    return () => { weg1(); weg2(); };
  });
}
