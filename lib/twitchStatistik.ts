import { liesJson, schreibJson } from '@/lib/ablage';
import { twitchToken } from '@/lib/twitchToken';

/*
 * Die Twitch-Statistik der VIPs (Betreiber, 27.10.2026: "Twitch daily/weekly/month/year/all time Recap - bester Peak mit/ohne Raid, neue Follower, Chatter -
 * fuer VIPs, wenn ich denen das gebe"). Gesammelt von scripts/twitch-statistik.mjs (GitHub-Dauerlauf), hier nur gelesen und zusammengerechnet.
 *
 *   twitch-kanaele.json            welche Kanaele gezaehlt werden und welcher VIP sie sehen darf - schreibt nur die Seite (Admin)
 *   twitch-statistik/<Id>.json     je Kanal: Follower-Tagesstaende und Streams (Minutenverlauf der Zuschauer, Raids, Chatter) - schreibt nur der Sammler
 *
 * 29.10.2026 (Betreiber: "auch die vergangenen Stats, wenn moeglich ... Year/Month nur, wenn es so viel hat ... andere Monate auswaehlen wie im Kalender ...
 * live Stats, wenn er gerade live ist"):
 *   - Zeitraeume sind Kalender-Einheiten (Tag, Woche, Monat, Jahr; deutsche Zeit) und nur die mit Daten stehen zur Wahl; Woche/Monat/Jahr erst, wenn die
 *     Daten so weit reichen.
 *   - Vergangenheit: Twitchs gespeicherte Streams (VODs: Datum, Dauer, Titel - ohne Zuschauerzahlen) und die 30-Tage-Zusammenfassung von TwitchTracker
 *     (oeffentliche Schnittstelle: Durchschnitt, Spitze, Stunden, Watch-Hours, Follower).
 *   - Live: laeuft ein Stream, kommen die Zuschauer direkt von Twitch, Chatter und Nachrichten vom Sammler (alle zwei Minuten).
 */

export interface TwitchKanal { login: string; id?: string; name?: string; vips: string[]; vipName: string; seit: number }
export interface TwitchStream {
  id: string; start: string; ende: string | null; titel: string; spiel: string;
  /** [Minute seit Start, Zuschauer] - je Minute ein Wert. */
  verlauf: Array<[number, number]>;
  raids: Array<{ von: string; zuschauer: number; zeit: string }>;
  nachrichten: number;
  /** Eindeutige Konten, die geschrieben haben - nach dem Ende; waehrend des Streams stehen die Kennungen in chatterIds. */
  chatter?: number; chatterIds?: string[];
}
export interface TwitchDatei { id: string; login: string; name: string; follower: Array<[string, number]>; streams: TwitchStream[] }

const KANAELE = 'twitch-kanaele.json';
export const liesKanaele = async () => (await liesJson<{ kanaele?: TwitchKanal[] } | null>(KANAELE, null))?.kanaele ?? [];
export const schreibeKanaele = (kanaele: TwitchKanal[]) => schreibJson(KANAELE, { kanaele });
export const liesDatei = (id: string) => liesJson<TwitchDatei | null>(`twitch-statistik/${id}.json`, null).catch(() => null);

/** Wie lange nach einem Raid dessen Zuschauer als "geraidet" gelten - so lange zaehlt die Spitze ohne Raid sie nicht mit. */
const RAID_WIRKUNG_MS = 30 * 60_000;
const ZONE = 'Europe/Berlin';

/* ------------------------------------------------------------------ Kalender */

const tagVon = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: ZONE });
function wocheVon(ms: number): string {
  // ISO-Woche des deutschen Kalendertags.
  const [j, m, t] = tagVon(ms).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  const wt = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wt + 3);
  const jahr = d.getUTCFullYear();
  const erste = new Date(Date.UTC(jahr, 0, 4));
  const nr = 1 + Math.round(((d.getTime() - erste.getTime()) / 864e5 - 3 + ((erste.getUTCDay() + 6) % 7)) / 7);
  return `${jahr}-W${String(nr).padStart(2, '0')}`;
}
export const ARTEN = ['tag', 'woche', 'monat', 'jahr', 'gesamt'] as const;
export type Art = typeof ARTEN[number];
const einheitVon = (art: Art, ms: number) => (art === 'tag' ? tagVon(ms) : art === 'woche' ? wocheVon(ms) : art === 'monat' ? tagVon(ms).slice(0, 7) : art === 'jahr' ? tagVon(ms).slice(0, 4) : 'gesamt');

/* ------------------------------------------------------------------ Twitch-Archiv und TwitchTracker */

interface ArchivStream { start: string; minuten: number; titel: string; aufrufe: number }
const archivSpeicher = new Map<string, { bis: number; liste: ArchivStream[] }>();

/** Twitchs gespeicherte Streams (VODs) - je nach Kanal 7 bis 60 Tage zurueck, ohne Zuschauerzahlen. */
export async function archivVon(id: string): Promise<ArchivStream[]> {
  const da = archivSpeicher.get(id);
  if (da && da.bis > Date.now()) return da.liste;
  let liste: ArchivStream[] = [];
  try {
    const token = await twitchToken();
    const r = token ? await fetch(`https://api.twitch.tv/helix/videos?user_id=${id}&type=archive&first=100`, {
      headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    }) : null;
    const j = r?.ok ? await r.json() as { data?: Array<{ created_at: string; duration: string; title: string; view_count: number }> } : null;
    liste = (j?.data ?? []).map((v) => {
      const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(v.duration) ?? [];
      return { start: v.created_at, minuten: Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0), titel: v.title, aufrufe: v.view_count };
    });
  } catch { /* ohne Archiv */ }
  archivSpeicher.set(id, { bis: Date.now() + 3600_000, liste });
  return liste;
}

export interface Tracker { avgViewers: number; maxViewers: number; stunden: number; watchHours: number; follower: number; followerGesamt: number }
const trackerSpeicher = new Map<string, { bis: number; wert: Tracker | null }>();

/** Die letzten 30 Tage laut TwitchTracker (oeffentliche Schnittstelle) - oder null. */
export async function trackerVon(login: string): Promise<Tracker | null> {
  const da = trackerSpeicher.get(login);
  if (da && da.bis > Date.now()) return da.wert;
  let wert: Tracker | null = null;
  try {
    const r = await fetch(`https://twitchtracker.com/api/channels/summary/${encodeURIComponent(login)}`, {
      headers: { 'User-Agent': 'CompHub/1.0 (+https://www.thecomphub.com)' }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const j = await r.json() as { avg_viewers?: number; max_viewers?: number; minutes_streamed?: number; hours_watched?: number; followers?: number; followers_total?: number };
      if (typeof j.avg_viewers === 'number') {
        wert = { avgViewers: j.avg_viewers, maxViewers: j.max_viewers ?? 0, stunden: Math.round((j.minutes_streamed ?? 0) / 6) / 10, watchHours: j.hours_watched ?? 0, follower: j.followers ?? 0, followerGesamt: j.followers_total ?? 0 };
      }
    }
  } catch { /* ohne TwitchTracker */ }
  trackerSpeicher.set(login, { bis: Date.now() + 3600_000, wert });
  return wert;
}

/** Die Zuschauer gerade jetzt, direkt von Twitch - null, wenn nicht live. */
async function liveVon(id: string): Promise<{ zuschauer: number; titel: string; spiel: string; start: string } | null> {
  try {
    const token = await twitchToken();
    const r = token ? await fetch(`https://api.twitch.tv/helix/streams?user_id=${id}`, {
      headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
    }) : null;
    const s = r?.ok ? (await r.json() as { data?: Array<{ viewer_count: number; title: string; game_name: string; started_at: string }> }).data?.[0] : undefined;
    return s ? { zuschauer: s.viewer_count, titel: s.title, spiel: s.game_name, start: s.started_at } : null;
  } catch { return null; }
}

/* ------------------------------------------------------------------ Rechnen */

function streamWerte(s: TwitchStream) {
  const start = Date.parse(s.start);
  const minuten = s.verlauf.length ? s.verlauf[s.verlauf.length - 1][0] : 0;
  const zuschauer = s.verlauf.map(([, v]) => v);
  const peak = zuschauer.length ? Math.max(...zuschauer) : 0;
  const durchschnitt = zuschauer.length ? Math.round(zuschauer.reduce((a, b) => a + b, 0) / zuschauer.length) : 0;
  // Spitze ohne Raid: zu jedem Zeitpunkt die Zuschauer der Raids der letzten halben Stunde abgezogen.
  const peakOhneRaid = s.raids.length
    ? Math.max(0, ...s.verlauf.map(([m, v]) => {
      const t = start + m * 60_000;
      const geraidet = s.raids.filter((r) => { const rt = Date.parse(r.zeit); return rt <= t && t - rt < RAID_WIRKUNG_MS; }).reduce((a, r) => a + r.zuschauer, 0);
      return Math.max(0, v - geraidet);
    }))
    : peak;
  return {
    id: s.id, start: s.start, ende: s.ende, live: !s.ende, titel: s.titel, spiel: s.spiel, minuten, peak, peakOhneRaid, durchschnitt,
    chatter: s.chatter ?? s.chatterIds?.length ?? 0, nachrichten: s.nachrichten ?? 0,
    raids: s.raids.length, raidZuschauer: s.raids.reduce((a, r) => a + r.zuschauer, 0), nurArchiv: false,
  };
}
type StreamWerte = ReturnType<typeof streamWerte>;

function zusammen(st: StreamWerte[], neueFollower: number | null) {
  const gezaehlt = st.filter((s) => !s.nurArchiv);
  return {
    streams: st.length,
    stunden: Math.round(st.reduce((a, s) => a + s.minuten, 0) / 6) / 10,
    peak: gezaehlt.length ? Math.max(...gezaehlt.map((s) => s.peak)) : null,
    peakOhneRaid: gezaehlt.length ? Math.max(...gezaehlt.map((s) => s.peakOhneRaid)) : null,
    durchschnitt: gezaehlt.length ? Math.round(gezaehlt.reduce((a, s) => a + s.durchschnitt * Math.max(1, s.minuten), 0) / gezaehlt.reduce((a, s) => a + Math.max(1, s.minuten), 0)) : null,
    chatter: gezaehlt.length ? gezaehlt.reduce((a, s) => a + s.chatter, 0) : null,
    chatterMax: gezaehlt.length ? Math.max(...gezaehlt.map((s) => s.chatter)) : null,
    nachrichten: gezaehlt.length ? gezaehlt.reduce((a, s) => a + s.nachrichten, 0) : null,
    raids: gezaehlt.reduce((a, s) => a + s.raids, 0),
    raidZuschauer: gezaehlt.reduce((a, s) => a + s.raidZuschauer, 0),
    neueFollower,
    nurArchiv: st.length > 0 && !gezaehlt.length,
  };
}

/** Die Auswertung eines Kanals fuer eine Kalender-Einheit (Art + Schluessel, z. B. "monat" + "2026-10"); ohne Angabe die juengste. */
export async function auswerten(d: TwitchDatei, art?: string, einheit?: string) {
  const [archiv, tracker, live] = await Promise.all([archivVon(d.id), trackerVon(d.login), liveVon(d.id)]);
  const gezaehlt = d.streams.map(streamWerte);
  // VODs aus der Zeit, die der Sammler nicht hat (kein gezaehlter Stream beginnt binnen 15 Minuten).
  const ausArchiv: StreamWerte[] = archiv
    .filter((a) => !gezaehlt.some((s) => Math.abs(Date.parse(s.start) - Date.parse(a.start)) < 15 * 60_000))
    .map((a) => ({ id: `vod-${a.start}`, start: a.start, ende: a.start, live: false, titel: a.titel, spiel: '', minuten: a.minuten, peak: 0, peakOhneRaid: 0, durchschnitt: 0, chatter: 0, nachrichten: 0, raids: 0, raidZuschauer: 0, nurArchiv: true }));
  const alle = [...gezaehlt, ...ausArchiv].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const follower = [...d.follower].sort((a, b) => a[0].localeCompare(b[0]));

  // Welche Einheiten Daten haben - und ab welcher Spanne Woche, Monat und Jahr ueberhaupt zur Wahl stehen.
  const zeiten = [...alle.map((s) => Date.parse(s.start)), ...follower.map((f) => Date.parse(`${f[0]}T12:00:00Z`))].filter(Number.isFinite);
  const spanneTage = zeiten.length ? (Date.now() - Math.min(...zeiten)) / 864e5 : 0;
  const einheiten: Record<Art, string[]> = { tag: [], woche: [], monat: [], jahr: [], gesamt: zeiten.length ? ['gesamt'] : [] };
  for (const a of ['tag', 'woche', 'monat', 'jahr'] as const) {
    const genug = a === 'tag' || (a === 'woche' && spanneTage >= 7) || (a === 'monat' && spanneTage >= 28) || (a === 'jahr' && spanneTage >= 365);
    if (genug) einheiten[a] = [...new Set(zeiten.map((z) => einheitVon(a, z)))].sort().reverse();
  }
  const gewArt: Art = (ARTEN as readonly string[]).includes(art ?? '') && einheiten[art as Art].length ? art as Art : (einheiten.woche.length ? 'woche' : einheiten.tag.length ? 'tag' : 'gesamt');
  const gewEinheit = einheit && einheiten[gewArt].includes(einheit) ? einheit : einheiten[gewArt][0] ?? 'gesamt';

  const inEinheit = (ms: number) => gewArt === 'gesamt' || einheitVon(gewArt, ms) === gewEinheit;
  const st = alle.filter((s) => inEinheit(Date.parse(s.start)));
  // Neue Follower in der Einheit: letzter Tagesstand darin minus letzter davor (oder der erste darin, wenn die Zaehlung erst darin begann).
  const drin = follower.filter((f) => inEinheit(Date.parse(`${f[0]}T12:00:00Z`)));
  const davor = follower.filter((f) => f[0] < (drin[0]?.[0] ?? '')).pop();
  const neueFollower = drin.length ? drin[drin.length - 1][1] - (davor ?? drin[0])[1] : null;

  const offen = d.streams.find((s) => !s.ende);
  const liveBlock = live && offen ? (() => {
    const w = streamWerte(offen);
    return { seit: live.start, zuschauer: live.zuschauer, titel: live.titel, spiel: live.spiel, minuten: Math.round((Date.now() - Date.parse(live.start)) / 60_000),
      peak: Math.max(w.peak, live.zuschauer), durchschnitt: w.durchschnitt, chatter: w.chatter, nachrichten: w.nachrichten, raids: offen.raids };
  })() : live ? { seit: live.start, zuschauer: live.zuschauer, titel: live.titel, spiel: live.spiel, minuten: Math.round((Date.now() - Date.parse(live.start)) / 60_000),
    peak: live.zuschauer, durchschnitt: null, chatter: null, nachrichten: null, raids: [] } : null;

  const juengster = [...d.streams].filter((s) => inEinheit(Date.parse(s.start))).pop() ?? null;
  return {
    id: d.id, login: d.login, name: d.name,
    follower: follower.length ? follower[follower.length - 1][1] : tracker?.followerGesamt ?? null,
    zaehltSeit: d.streams[0]?.start ?? follower[0]?.[0] ?? null,
    einheiten, art: gewArt, einheit: gewEinheit,
    werte: zusammen(st, neueFollower),
    streams: st.slice(-30).reverse(),
    verlauf: juengster ? { start: juengster.start, live: !juengster.ende, punkte: juengster.verlauf, raids: juengster.raids } : null,
    live: liveBlock,
    tracker,
  };
}
