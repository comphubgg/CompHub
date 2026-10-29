import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { wer, vipWerkzeug } from '@/lib/pov';
import { freundesStatus } from '@/lib/epicFreundeStatus';

/*
 * Die Match-ID eines Streamers, der gerade spielt (Betreiber, 29.10.2026: "bei den Streams irgendwas machen, dass wir die Match-ID finden").
 *
 *   GET ?kanal=<twitch-login>  ->  { matchId, playlist, seit, zeile } | { matchId: null, grund }
 *
 * Der Kanal fuehrt ueber das Spielerprofil (Twitch-Feld) zum Epic-Konto, das Epic-Konto ueber den Status der Freunde des CompHub-Kontos
 * (lib/epicFreundeStatus) zur vollen Match-ID. Nur fuer den Admin und VIPs mit dem Match-ID-Finder - eine laufende Match-ID oeffentlich zu zeigen,
 * hiesse, jedem den Weg in die Lobby eines Pros zu geben.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const ich = await wer();
  if (!vipWerkzeug(ich, 'matchfinder')) return NextResponse.json({ matchId: null, grund: 'kein-zugang' }, { headers: nie });
  const kanal = (new URL(request.url).searchParams.get('kanal') ?? '').trim().toLowerCase();
  if (!kanal) return NextResponse.json({ matchId: null, grund: 'kein-kanal' }, { headers: nie });

  const profile = await liesJson<Record<string, { id?: string; twitch?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { id?: string; twitch?: string }>));
  const epic = Object.entries(profile).map(([k, v]) => ({ id: (v.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase(), tw: (v.twitch ?? '').toLowerCase() }))
    .find((x) => x.id && x.tw === kanal)?.id;
  if (!epic) return NextResponse.json({ matchId: null, grund: 'kein-epic-konto' }, { headers: nie });

  const { freunde, verbunden } = await freundesStatus().catch(() => ({ freunde: new Map(), verbunden: false }));
  const f = freunde.get(epic);
  if (!f) return NextResponse.json({ matchId: null, grund: verbunden ? 'kein-freund-oder-offline' : 'nicht-verbunden', epicId: epic }, { headers: nie });
  return NextResponse.json({ matchId: f.sessionId, playlist: f.playlist, seit: f.seit, zeile: f.zeile, epicId: epic, grund: f.sessionId ? null : 'nicht-im-game' }, { headers: nie });
}
