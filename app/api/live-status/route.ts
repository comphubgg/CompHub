import { t } from "@/app/lib/i18n";
import { detectTwitchLiveStatusFromHtml } from "@/app/lib/liveStatus";
import { twitchToken, erneuereTwitchToken, twitchEingerichtet } from "@/lib/twitchToken";

/** title: der Titel des laufenden Streams - fuer den Titelfilter der Streams-Seite (Betreiber, 19.10.2026: nach "LCQ" und Co. filtern). */
/** bild: das Twitch-Profilbild - die Streamer-Liste zeigt es neben dem Namen (Idee 28, 31.10.2026). */
type Status = { isLive: boolean; viewers: number; title?: string; bild?: string | null };

// Profilbilder aendern sich selten - einen Tag merken, damit nicht jede Abfrage der Liste auch /helix/users fragt.
const bildMerker = new Map<string, { bild: string | null; bis: number }>();
async function bilderHolen(namen: string[], clientId: string, token: string): Promise<void> {
  const offen = namen.map((n) => n.toLowerCase()).filter((n) => !((bildMerker.get(n)?.bis ?? 0) > Date.now()));
  for (let i = 0; i < offen.length; i += 100) {
    const teil = offen.slice(i, i + 100);
    try {
      const r = await fetch(`https://api.twitch.tv/helix/users?${teil.map((n) => `login=${encodeURIComponent(n)}`).join('&')}`, {
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return;
      const j = await r.json() as { data?: Array<{ login: string; profile_image_url?: string }> };
      const da = new Map((j.data ?? []).map((u) => [u.login.toLowerCase(), u.profile_image_url || null]));
      for (const n of teil) bildMerker.set(n, { bild: da.get(n) ?? null, bis: Date.now() + 24 * 3600_000 });
    } catch { return; }
  }
}

// Kurzes Gedaechtnis, damit dieselbe Frage nicht mehrfach hintereinander
// bei Twitch landet. Ein Stream wechselt nicht sekuendlich den Zustand.
const merker = new Map<string, { wert: Status; bis: number }>();
const MERK_DAUER = 45_000;

// Rueckfallweg ohne API: die oeffentliche Twitch-Seite auslesen.
// Wichtig: alle Namen gleichzeitig abfragen. Vorher lief das nacheinander -
// bei 20 Streamern dauerte eine Antwort dadurch mehrere Sekunden, was sich
// im Dashboard wie "laedt ewig" oder "zeigt offline" angefuehlt hat.
async function ueberSeite(namen: string[]): Promise<Record<string, Status>> {
  const ergebnis: Record<string, Status> = {};
  const offen: string[] = [];

  for (const n of namen) {
    const key = n.toLowerCase();
    const m = merker.get(key);
    if (m && m.bis > Date.now()) ergebnis[key] = m.wert;
    else offen.push(n);
  }

  await Promise.all(offen.map(async (name) => {
    const key = name.toLowerCase();
    let wert: Status = { isLive: false, viewers: 0 };
    try {
      const res = await fetch(`https://www.twitch.tv/${encodeURIComponent(name)}`, {
        redirect: 'manual',
        headers: {
          // Ohne Browser-Kennung liefert Twitch teils eine abgespeckte Seite
          // ohne den Titel, an dem der Live-Zustand erkennbar ist.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                        '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cache: 'no-store',
      });
      if (res.ok) wert = detectTwitchLiveStatusFromHtml(await res.text(), name);
    } catch { /* offline lassen */ }
    merker.set(key, { wert, bis: Date.now() + MERK_DAUER });
    ergebnis[key] = wert;
  }));

  return ergebnis;
}

export async function POST(req: Request) {
  try {
    const { usernames } = await req.json();

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return Response.json({}, { status: 400 });
    }

    const clientId = process.env.TWITCH_CLIENT_ID || '';
    // Holt einen gueltigen Token - notfalls einen frisch erzeugten.
    // Ein fest eingetragener Token laeuft nach rund 60 Tagen ab; genau das
    // hat vorher dazu gefuehrt, dass laufende Streams als offline galten.
    const accessToken = twitchEingerichtet() ? await twitchToken() : null;

    if (!clientId || !accessToken) {
      console.warn(t('twitch_api_credentials_not_configured', '⚠️ Twitch API credentials not configured'));
      return Response.json(await ueberSeite(usernames));
    }

    const result: { [key: string]: Status } = {};

    // Twitch API limits to 100 per request
    const chunks = [];
    for (let i = 0; i < usernames.length; i += 100) {
      chunks.push(usernames.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const params = new URLSearchParams();
      chunk.forEach((username: string) => {
        params.append('user_login', username.toLowerCase());
      });

      try {
        const frage = (token: string) => fetch(
          `https://api.twitch.tv/helix/streams?${params}&first=100`,
          {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${token}`,
            },
            cache: 'no-store',
          }
        );

        let response = await frage(accessToken);

        // 401 heisst fast immer: Token abgelaufen. Einmal frisch holen und
        // erneut fragen, statt den Streamer faelschlich offline zu melden.
        if (response.status === 401) {
          const frisch = await erneuereTwitchToken();
          if (frisch) {
            console.info('Twitch-Token war abgelaufen - neuen geholt.');
            response = await frage(frisch);
          }
        }

        if (!response.ok) {
          console.warn(`Twitch API error: ${response.status} — weiche auf die Twitch-Seite aus`);
          Object.assign(result, await ueberSeite(chunk));
          continue;
        }

        const data = await response.json();
        const liveUsers = new Map<string, { viewers: number; title: string }>();

        // Map live users to viewer count
        (data.data || []).forEach((stream: any) => {
          liveUsers.set(stream.user_login.toLowerCase(), { viewers: stream.viewer_count || 0, title: String(stream.title ?? '') });
        });

        await bilderHolen(chunk, clientId, accessToken);
        // Set results
        chunk.forEach((name: string) => {
          const treffer = liveUsers.get(name.toLowerCase());
          if (treffer !== undefined) {
            result[name.toLowerCase()] = { isLive: true, viewers: treffer.viewers, title: treffer.title, bild: bildMerker.get(name.toLowerCase())?.bild ?? null };
          } else {
            result[name.toLowerCase()] = { isLive: false, viewers: 0, bild: bildMerker.get(name.toLowerCase())?.bild ?? null };
          }
        });
      } catch (error) {
        console.error(t('error_fetching_stream_data', 'Error fetching stream data:'), error);
        chunk.forEach((name: string) => {
          result[name.toLowerCase()] = { isLive: false, viewers: 0 };
        });
      }

      // Rate limit protection: small delay between chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return Response.json(result);
  } catch (error) {
    console.error(t('error_in_live_status_route', 'Error in live status route:'), error);
    return Response.json({}, { status: 424 });
  }
}
