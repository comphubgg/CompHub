import { NextResponse } from 'next/server';
import {
  twitchToken, erneuereTwitchToken, twitchEingerichtet,
} from '@/lib/twitchToken';

/*
 * Twitch-Kanaele zu einem Namen - fuer die Suche ueber der Multiview.
 *
 *   GET ?q=okis  ->  { kanaele: [{ login, name, live, zuschauer, follower,
 *                                   spiel, bild }] }
 *
 * Der Betreiber wollte unter dem Suchfeld "eine Liste von denen, die live
 * sind ... die mit den meisten Zuschauern zuerst; wenn niemand live ist,
 * die Top fuenf nach Followern." Genau so ist die Antwort geordnet: erst
 * die Sendenden nach Zuschauern, dann die uebrigen nach Followern.
 *
 * Zuschauer und Follower kommen von Twitch selbst - die Kanalsuche liefert
 * beides nicht, deshalb zwei weitere Fragen: eine fuer alle laufenden
 * Streams zusammen, und je Kanal eine nach der Follower-Zahl. Zahlen, die
 * Twitch nicht liefert, bleiben null und werden nicht angezeigt.
 *
 * Kurz zwischengespeichert: wer "oki", "okis", "okisf" tippt, soll nicht
 * fuer jede Taste ein Dutzend Twitch-Anfragen ausloesen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RohKanal {
  id?: string; broadcaster_login?: string; display_name?: string;
  is_live?: boolean; thumbnail_url?: string; game_name?: string;
}

interface Kanal {
  login: string; name: string; live: boolean;
  zuschauer: number | null; follower: number | null;
  spiel: string; bild: string;
}

const HOECHSTENS = 12;
const FRISCH_MS = 60_000;
const speicher = new Map<string, { bis: number; kanaele: Kanal[] }>();

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ kanaele: [] });

  const alt = speicher.get(q);
  if (alt && alt.bis > Date.now()) return NextResponse.json({ kanaele: alt.kanaele });

  if (!twitchEingerichtet()) {
    return NextResponse.json({ kanaele: [], hinweis: 'Twitch ist nicht eingerichtet.' });
  }
  const id = process.env.TWITCH_CLIENT_ID || '';
  let token = await twitchToken();
  if (!token || !id) {
    return NextResponse.json({ kanaele: [], hinweis: 'Twitch nimmt die Zugangsdaten nicht an.' });
  }

  const kopf = (mit: string) => ({ 'Client-Id': id, Authorization: `Bearer ${mit}` });
  const frage = async (pfad: string): Promise<Response> => {
    let r = await fetch(`https://api.twitch.tv/helix/${pfad}`,
      { headers: kopf(token as string), cache: 'no-store' });
    if (r.status === 401) {
      // Ein abgelaufener Token - einmal frisch holen und nachfassen.
      const frisch = await erneuereTwitchToken();
      if (frisch) { token = frisch; r = await fetch(`https://api.twitch.tv/helix/${pfad}`,
        { headers: kopf(frisch), cache: 'no-store' }); }
    }
    return r;
  };

  try {
    const suche = await frage(`search/channels?query=${encodeURIComponent(q)}&first=${HOECHSTENS}`);
    if (!suche.ok) {
      return NextResponse.json({ kanaele: [], hinweis: `Twitch antwortet mit HTTP ${suche.status}.` });
    }
    const roh = ((await suche.json()) as { data?: RohKanal[] }).data ?? [];
    // Die Twitch-Kennung je Kanal, fuer die Follower-Frage - gleiche
    // Reihenfolge wie "kanaele", weil beide aus derselben Auslese kommen.
    const brauchbar = roh.filter((k) => k.broadcaster_login);
    const kennungen = brauchbar.map((k) => k.id ?? '');
    const kanaele: Kanal[] = brauchbar
      .map((k) => ({
        login: (k.broadcaster_login ?? '').toLowerCase(),
        name: k.display_name ?? k.broadcaster_login ?? '',
        live: Boolean(k.is_live),
        zuschauer: null,
        follower: null,
        spiel: k.game_name ?? '',
        bild: (k.thumbnail_url ?? '').replace('{width}', '70').replace('{height}', '70'),
      }));

    /* Die Zuschauer der Sendenden - eine Frage fuer alle zusammen. */
    const live = kanaele.filter((k) => k.live);
    if (live.length) {
      const r = await frage('streams?first=100&'
        + live.map((k) => `user_login=${encodeURIComponent(k.login)}`).join('&'));
      if (r.ok) {
        const d = ((await r.json()) as { data?: Array<{ user_login: string; viewer_count: number }> }).data ?? [];
        const nach = new Map(d.map((s) => [s.user_login.toLowerCase(), s.viewer_count]));
        live.forEach((k) => { k.zuschauer = nach.get(k.login) ?? null; });
      }
    }

    /* Die Follower - je Kanal eine Frage, alle gleichzeitig. */
    await Promise.all(kanaele.map(async (k, i) => {
      const kennung = kennungen[i];
      if (!kennung) return;
      try {
        const r = await frage(`channels/followers?broadcaster_id=${encodeURIComponent(kennung)}&first=1`);
        if (!r.ok) return;
        const d = (await r.json()) as { total?: number };
        if (typeof d.total === 'number') kanaele[i].follower = d.total;
      } catch { /* dann bleibt es bei null */ }
    }));

    kanaele.sort((a, b) => Number(b.live) - Number(a.live)
      || (b.zuschauer ?? -1) - (a.zuschauer ?? -1)
      || (b.follower ?? -1) - (a.follower ?? -1));

    speicher.set(q, { bis: Date.now() + FRISCH_MS, kanaele });
    if (speicher.size > 500) {
      const aeltester = speicher.keys().next().value;
      if (aeltester !== undefined) speicher.delete(aeltester);
    }
    return NextResponse.json({ kanaele });
  } catch (e) {
    return NextResponse.json({ kanaele: [], hinweis: (e as Error).message });
  }
}
