import { NextResponse } from 'next/server';
import {
  twitchToken, erneuereTwitchToken, twitchEingerichtet,
} from '@/lib/twitchToken';
import { istAdminAnfrage } from '@/lib/adminPruefung';

// Twitch-Kanaele zu einem Namen vorschlagen.
//
//   GET ?q=ritual   -> { kanaele: [{ login, name, live, bild, spiel }] }
//
// Wozu: den Twitch-Kanal eines Profis von Hand einzutippen ist muehsam, und
// aus dem Turniernamen zu erraten ist gefaehrlich - "Sky" gibt es auf Twitch
// hundertmal, und ein fremder Kanal unter dem Namen eines Profis waere ein
// Fehler, den niemand bemerkt.
//
// Deshalb schlaegt diese Stelle nur vor. Sie fragt Twitchs eigene
// Kanalsuche und gibt zurueck, was dort steht - mit Bild und Live-Zustand,
// damit sich der richtige Kanal erkennen laesst. Uebernommen wird erst, was
// der Betreiber anklickt; gespeichert wird das im Spielerprofil.
//
// Nur fuer den Admin: es ist ein Werkzeug zum Pflegen, keine oeffentliche
// Suche, und jede Anfrage geht auf das Kontingent der eigenen Twitch-App.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RohKanal {
  broadcaster_login?: string; display_name?: string;
  is_live?: boolean; thumbnail_url?: string; game_name?: string;
}

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ kanaele: [] });

  if (!twitchEingerichtet()) {
    return NextResponse.json({
      kanaele: [],
      hinweis: 'Twitch ist nicht eingerichtet - ohne Client-ID gibt es keine Suche.',
    });
  }

  const token = await twitchToken();
  const id = process.env.TWITCH_CLIENT_ID || '';
  if (!token || !id) {
    return NextResponse.json({
      kanaele: [],
      hinweis: 'Twitch nimmt die hinterlegten Zugangsdaten nicht an.',
    });
  }

  try {
    /*
     * Bei 401 einmal mit frischem Token nachfassen.
     *
     * Ein in .env eingetragener Twitch-Token laeuft nach rund sechzig Tagen
     * ab. Ohne diesen zweiten Versuch waere die Kanalsuche irgendwann
     * stillschweigend leer - derselbe Fehler, der schon einmal dazu gefuehrt
     * hat, dass laufende Streams als offline galten.
     */
    const frage = (mitToken: string) => fetch(
      'https://api.twitch.tv/helix/search/channels'
      + `?query=${encodeURIComponent(q)}&first=6`,
      { headers: { 'Client-Id': id, Authorization: `Bearer ${mitToken}` },
        cache: 'no-store' });

    let r = await frage(token);
    if (r.status === 401) {
      const frisch = await erneuereTwitchToken();
      if (frisch) r = await frage(frisch);
    }
    if (!r.ok) {
      /*
       * 401 auch nach dem zweiten Versuch heisst: nicht der Token ist alt,
       * sondern die App stimmt nicht mehr. Das gehoert so gesagt - sonst
       * sucht jemand den Fehler bei sich.
       */
      return NextResponse.json({
        kanaele: [],
        hinweis: r.status === 401
          ? 'Twitch nimmt die hinterlegten Zugangsdaten nicht an — '
            + 'TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET erneuern.'
          : `Twitch antwortet mit HTTP ${r.status}.`,
      });
    }
    const j = await r.json() as { data?: RohKanal[] };
    const kanaele = (j.data ?? []).map((k) => ({
      login: k.broadcaster_login ?? '',
      name: k.display_name ?? k.broadcaster_login ?? '',
      live: Boolean(k.is_live),
      bild: (k.thumbnail_url ?? '').replace('{width}', '70').replace('{height}', '70'),
      spiel: k.game_name ?? '',
    })).filter((k) => k.login);

    return NextResponse.json({ kanaele });
  } catch (e) {
    return NextResponse.json({ kanaele: [], hinweis: (e as Error).message });
  }
}
