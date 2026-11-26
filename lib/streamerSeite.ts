import crypto from 'crypto';
import { liesJson, aendereJson } from '@/lib/ablage';
import { twitchToken } from '@/lib/twitchToken';
import { epicZuKanal } from '@/lib/matchIdAuskunft';
import { gecacht } from '@/lib/epicCups';

/*
 * Streamer-Seiten (Betreiber, 26.11.2026: "Streamer koennen eine eigene Seite daraus machen ... Kalender ... Twitch Statistics ... eine Art
 * Post-Channel, wo er Sachen posten kann, oder Community-Fragen ... ohne dass sie Geld ausgeben muessen"). Erst nur fuer den Admin
 * ("einfach mal privat stellen ... fuer den Admin machen"), spaeter gibt der Admin sie Streamern frei.
 *
 *   Twitch (Helix, App-Token): Kanal, Live-Status, Stream-Plan, beste Clips der letzten 30 Tage
 *   CompHub: das Epic-Konto ueber das Spielerprofil (Twitch-Feld) -> Link aufs Spielerprofil
 *   streamer-seiten/<login>.json: Posts und Community-Fragen
 * Twitch-Daten werden nur kurz im Speicher gehalten (Twitch-Entwicklervereinbarung), nicht abgelegt.
 */

export interface StreamerPost { id: string; art: 'post' | 'frage'; text: string; t: number; von: string }
const datei = (login: string) => `streamer-seiten/${login}.json`;
export const loginOk = (s: string) => /^[a-z0-9_]{3,25}$/.test(s);

async function helix<T>(pfad: string): Promise<T | null> {
  const token = await twitchToken().catch(() => null);
  const id = process.env.TWITCH_CLIENT_ID;
  if (!token || !id) return null;
  const r = await fetch(`https://api.twitch.tv/helix/${pfad}`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': id }, signal: AbortSignal.timeout(8_000), cache: 'no-store' }).catch(() => null);
  return r?.ok ? await r.json() as T : null;
}

export async function streamerDaten(login: string) {
  return gecacht(`streamer-seite|${login}`, 60_000, async () => {
    const u = (await helix<{ data: Array<{ id: string; login: string; display_name: string; description: string; profile_image_url: string; offline_image_url: string; created_at: string }> }>(`users?login=${login}`))?.data?.[0];
    if (!u) return null;
    const seit = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [live, kanal, plan, clips, epic] = await Promise.all([
      helix<{ data: Array<{ title: string; game_name: string; viewer_count: number; started_at: string; thumbnail_url: string }> }>(`streams?user_id=${u.id}`),
      helix<{ data: Array<{ title: string; game_name: string }> }>(`channels?broadcaster_id=${u.id}`),
      helix<{ data: { segments?: Array<{ start_time: string; end_time: string | null; title: string; canceled_until: string | null; category?: { name?: string } | null }> } }>(`schedule?broadcaster_id=${u.id}&first=10`),
      helix<{ data: Array<{ url: string; title: string; view_count: number; created_at: string; thumbnail_url: string; duration: number }> }>(`clips?broadcaster_id=${u.id}&started_at=${seit}&first=9`),
      epicZuKanal(login).catch(() => null),
    ]);
    const l = live?.data?.[0];
    return {
      login: u.login, name: u.display_name, bio: u.description, bild: u.profile_image_url, banner: u.offline_image_url || null, seit: u.created_at,
      live: l ? { titel: l.title, spiel: l.game_name, zuschauer: l.viewer_count, seit: l.started_at, vorschau: l.thumbnail_url.replace('{width}', '640').replace('{height}', '360') } : null,
      titel: kanal?.data?.[0]?.title ?? null, spiel: kanal?.data?.[0]?.game_name ?? null,
      plan: (plan?.data?.segments ?? []).filter((s) => !s.canceled_until).map((s) => ({ start: s.start_time, ende: s.end_time, titel: s.title, spiel: s.category?.name ?? null })),
      clips: (clips?.data ?? []).map((c) => ({ url: c.url, titel: c.title, aufrufe: c.view_count, datum: c.created_at, bild: c.thumbnail_url, dauer: c.duration })),
      epicId: epic,
    };
  });
}

export async function posts(login: string): Promise<StreamerPost[]> {
  const d = await liesJson<{ posts?: StreamerPost[] } | null>(datei(login), null).catch(() => null);
  return (d?.posts ?? []).sort((a, b) => b.t - a.t);
}

export async function postDazu(login: string, art: StreamerPost['art'], text: string, von: string) {
  const p: StreamerPost = { id: crypto.randomUUID().slice(0, 8), art, text: text.trim().slice(0, 1000), t: Date.now(), von };
  await aendereJson<{ posts: StreamerPost[] }>(datei(login), { posts: [] }, (d) => { d.posts = [p, ...(d.posts ?? [])].slice(0, 200); });
  return p;
}

export async function postWeg(login: string, id: string) {
  await aendereJson<{ posts: StreamerPost[] }>(datei(login), { posts: [] }, (d) => { d.posts = (d.posts ?? []).filter((x) => x.id !== id); });
}
