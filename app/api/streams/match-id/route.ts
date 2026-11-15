import { NextResponse } from 'next/server';
import { wer, vipWerkzeug } from '@/lib/pov';
import { matchIdAuskunft } from '@/lib/matchIdAuskunft';
import { freundeDienstStatus } from '@/lib/epicFreundeStatus';

/*
 * Die Match-ID eines Streamers, der gerade spielt (Betreiber, 29.10.2026: "bei den Streams irgendwas machen, dass wir die Match-ID finden").
 *
 *   GET ?kanal=<twitch-login>  ->  { matchId, playlist, seit, zeile } | { matchId: null, grund }
 *
 * Der Kanal fuehrt ueber das Spielerprofil (Twitch-Feld) zum Epic-Konto, das Epic-Konto ueber den Status der Freunde des CompHub-Kontos
 * (lib/epicFreundeStatus) zur vollen Match-ID. Nur fuer den Admin und VIPs mit dem Match-ID-Finder - eine laufende Match-ID oeffentlich zu zeigen,
 * hiesse, jedem den Weg in die Lobby eines Pros zu geben.
 *
 * Sofort statt alle 2 s: ./stream (Server-Sent Events) schickt jeden Wechsel im Augenblick, in dem Epic ihn per XMPP meldet. Diese Abfrage bleibt
 * fuer den Fall, dass der Strom nicht durchkommt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const ich = await wer();
  if (!vipWerkzeug(ich, 'matchfinder')) return NextResponse.json({ matchId: null, grund: 'kein-zugang' }, { headers: nie });
  const kanal = (new URL(request.url).searchParams.get('kanal') ?? '').trim().toLowerCase();
  const { antwort } = await matchIdAuskunft(kanal);
  // Nur der Admin sieht, woher die Status kommen und seit wann die Verbindung steht (Statuszeile in app/streams/MatchIdAnzeige).
  return NextResponse.json(ich.rolle === 'admin' ? { ...antwort, xmpp: freundeDienstStatus() } : antwort, { headers: nie });
}
