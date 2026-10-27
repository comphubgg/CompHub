import { NextRequest, NextResponse } from 'next/server';
import { twitchToken, erneuereTwitchToken } from '@/lib/twitchToken';

/*
 * Twitch-Kanaele suchen (Streams-Seite: Streamer hinzufuegen und der Live-Zustand eines Kanals).
 *
 * Bis zum 27.10.2026 verlangte diese Stelle einen fest eingetragenen TWITCH_ACCESS_TOKEN, den es auf dem Server nicht gibt - jede Anfrage endete mit 500 "API credentials not
 * configured". Ausserdem las sie Felder der alten Twitch-Schnittstelle (name, follower_count), die die heutige (Helix) nicht mehr liefert. Jetzt holt sich der Server den App-Token
 * selbst (lib/twitchToken, wie twitch-suche und kanal-suche) und liest die Felder, die Helix wirklich nennt. Follower liefert die Kanalsuche nicht - es wird nach Zuschauern
 * und Live-Zustand geordnet. Bei erwarteten Fehlern gibt es nie einen 5xx (Cloudflare macht daraus eine HTML-Seite), sondern eine leere Liste mit "error".
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function helix(pfad: string): Promise<Response | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await twitchToken();
  if (!clientId || !token) return null;
  const rufen = (t: string) => fetch(`https://api.twitch.tv/helix/${pfad}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store',
  });
  let r = await rufen(token);
  if (r.status === 401) {
    const neu = await erneuereTwitchToken();
    if (neu) r = await rufen(neu);
  }
  return r;
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const liveOnly = request.nextUrl.searchParams.get('liveOnly') === 'true';
  if (query.length < 2) return NextResponse.json({ channels: [] });

  try {
    const suche = await helix(`search/channels?query=${encodeURIComponent(query)}&first=25`);
    if (!suche) return NextResponse.json({ channels: [], error: 'Twitch ist nicht eingerichtet.' });
    if (!suche.ok) return NextResponse.json({ channels: [], error: `Twitch HTTP ${suche.status}` });
    const roh = ((await suche.json()) as { data?: Array<{ broadcaster_login?: string; display_name?: string; game_name?: string; is_live?: boolean }> }).data ?? [];
    const liste = roh.filter((c) => c.broadcaster_login && c.display_name);
    if (!liste.length) return NextResponse.json({ channels: [] });

    // Zuschauerzahlen der Kanaele, die gerade live sind.
    const viewers = new Map<string, number>();
    const streams = await helix(`streams?${liste.map((c) => `user_login=${encodeURIComponent(c.broadcaster_login as string)}`).join('&')}&first=100`);
    if (streams?.ok) {
      for (const s of ((await streams.json()) as { data?: Array<{ user_login?: string; viewer_count?: number }> }).data ?? []) {
        if (s.user_login) viewers.set(s.user_login.toLowerCase(), s.viewer_count ?? 0);
      }
    }

    let channels = liste.map((c) => {
      const live = viewers.has((c.broadcaster_login as string).toLowerCase()) || Boolean(c.is_live);
      return {
        twitch: c.display_name as string, epic: c.display_name as string, twitter: c.display_name as string,
        followers: 0, game: c.game_name || 'Unknown', isLive: live, viewers: viewers.get((c.broadcaster_login as string).toLowerCase()) ?? 0,
      };
    });
    if (liveOnly) channels = channels.filter((c) => c.isLive);
    // Live zuerst, dann nach Zuschauern; bei gleichem Stand bleibt Twitchs eigene Reihenfolge.
    channels.sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.viewers - a.viewers);
    return NextResponse.json({ channels: channels.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ channels: [], error: `Twitch nicht erreichbar: ${(e as Error).message}` });
  }
}
