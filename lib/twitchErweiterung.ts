import crypto from 'crypto';
import { liesJson, schreibJson } from '@/lib/ablage';
import { finde } from '@/lib/matchFinder';
import { getToken } from '@/lib/epicCups';
import { twitchToken } from '@/lib/twitchToken';
import { epicZuKanal } from '@/lib/matchIdAuskunft';

/*
 * Die Twitch-Erweiterung "CompHub Live" (Betreiber, 26.11.2026: "mach mal diese Twitch-Erweiterung"). Die Seiten der Erweiterung (twitch-erweiterung/)
 * liegen bei Twitch; sie fragen hier mit dem JWT, das Twitch ihnen gibt. Nur mit gueltiger Signatur (Erweiterungs-Secret) gibt es Daten - und nur fuer
 * den Kanal, der im JWT steht.
 *
 *   twitch-ext/<Kanal-Id>.json   Einstellungen des Streamers: Epic-Konto, Match-Code an/aus + Verzoegerung, Stream-Plan an/aus
 *
 * Der Match-Code erscheint NUR, wenn der Streamer ihn selbst einschaltet (sonst waere es ein Weg in die Lobby eines Pros), und auf Wunsch erst nach
 * 1 oder 3 Minuten im Match.
 */

export interface ExtKonfig { epicId: string | null; epicName: string | null; code: boolean; verzoegerungMin: 0 | 1 | 3; plan: boolean; geaendert: number }
export interface ExtJwt { channel_id: string; role: 'broadcaster' | 'moderator' | 'viewer' | 'external'; opaque_user_id?: string; user_id?: string; exp: number }

const STANDARD: ExtKonfig = { epicId: null, epicName: null, code: false, verzoegerungMin: 1, plan: true, geaendert: 0 };
const datei = (kanal: string) => `twitch-ext/${kanal}.json`;

/** HS256-JWT der Twitch-Erweiterung pruefen (Secret aus der Twitch-Konsole, base64). */
export function jwtPruefen(kopf: string | null): ExtJwt | null {
  const geheim = process.env.TWITCH_EXT_SECRET;
  const t = (kopf ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!geheim || !t) return null;
  const [h, p, s] = t.split('.');
  if (!h || !p || !s) return null;
  try {
    if (JSON.parse(Buffer.from(h, 'base64url').toString()).alg !== 'HS256') return null;
    const soll = crypto.createHmac('sha256', Buffer.from(geheim, 'base64')).update(`${h}.${p}`).digest();
    const ist = Buffer.from(s, 'base64url');
    if (ist.length !== soll.length || !crypto.timingSafeEqual(ist, soll)) return null;
    const j = JSON.parse(Buffer.from(p, 'base64url').toString()) as ExtJwt;
    if (!j.channel_id || !/^\d+$/.test(j.channel_id) || !(j.exp * 1000 > Date.now())) return null;
    return j;
  } catch { return null; }
}

export async function konfigVon(kanal: string): Promise<ExtKonfig> {
  return { ...STANDARD, ...(await liesJson<Partial<ExtKonfig> | null>(datei(kanal), null).catch(() => null) ?? {}) };
}

async function kontoZuName(name: string): Promise<{ id: string; name: string } | null> {
  const { token } = await getToken();
  for (const v of [...new Set([name, name.replace(/!/g, 'ǃ'), name.replace(/ǃ/g, '!')])]) {
    const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(v)}`,
      { headers: { Authorization: token }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!r.ok && r.status !== 404) throw new Error(`Epic ${r.status}`);
    const j = r.ok ? await r.json() as { id?: string; displayName?: string } : null;
    if (j?.id) return { id: j.id.replace(/-/g, '').toLowerCase(), name: j.displayName ?? name };
  }
  return null;
}

/** Einstellungen speichern (nur der Streamer). Ein Epic-Name wird gleich zum Konto aufgeloest. */
export async function konfigSetzen(kanal: string, eingabe: Partial<ExtKonfig> & { epicName?: string | null }): Promise<{ ok: true; konfig: ExtKonfig } | { ok: false; fehler: string }> {
  const alt = await konfigVon(kanal);
  const neu: ExtKonfig = { ...alt, geaendert: Date.now() };
  if (typeof eingabe.code === 'boolean') neu.code = eingabe.code;
  if (typeof eingabe.plan === 'boolean') neu.plan = eingabe.plan;
  if (eingabe.verzoegerungMin === 0 || eingabe.verzoegerungMin === 1 || eingabe.verzoegerungMin === 3) neu.verzoegerungMin = eingabe.verzoegerungMin;
  const name = typeof eingabe.epicName === 'string' ? eingabe.epicName.trim().slice(0, 40) : null;
  if (name && name !== alt.epicName) {
    const konto = await kontoZuName(name).catch(() => null);
    if (!konto) return { ok: false, fehler: 'Epic-Name nicht gefunden' };
    neu.epicId = konto.id; neu.epicName = konto.name;
  } else if (eingabe.epicName === '') { neu.epicId = null; neu.epicName = null; }
  await schreibJson(datei(kanal), neu);
  extCacheLeeren(kanal);
  return { ok: true, konfig: neu };
}

/** Der Stream-Plan aus Twitch (Helix Get Channel Stream Schedule) - die naechsten 5 Termine. */
async function streamPlan(kanal: string) {
  const token = await twitchToken().catch(() => null);
  if (!token || !process.env.TWITCH_CLIENT_ID) return [];
  try {
    const r = await fetch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${kanal}&first=5`,
      { headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }, signal: AbortSignal.timeout(5_000), next: { revalidate: 600 } });
    if (!r.ok) return [];
    const j = await r.json() as { data?: { segments?: Array<{ start_time: string; end_time: string | null; title: string; canceled_until: string | null; category?: { name?: string } | null }> } };
    return (j.data?.segments ?? []).filter((s) => !s.canceled_until).map((s) => ({ start: s.start_time, ende: s.end_time, titel: s.title, spiel: s.category?.name ?? null }));
  } catch { return []; }
}

/** Twitch-Kanal-Id -> Login (fuer die Zuordnung ueber die Spielerprofile, wenn der Streamer noch nichts eingestellt hat). */
async function loginVon(kanal: string): Promise<string | null> {
  const token = await twitchToken().catch(() => null);
  if (!token || !process.env.TWITCH_CLIENT_ID) return null;
  const r = await fetch(`https://api.twitch.tv/helix/users?id=${kanal}`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }, signal: AbortSignal.timeout(5_000), next: { revalidate: 86_400 } }).catch(() => null);
  const j = r?.ok ? await r.json() as { data?: Array<{ login: string }> } : null;
  return j?.data?.[0]?.login ?? null;
}

/*
 * Jeder Zuschauer fragt selbst (alle ~20 s) - bei vielen Zuschauern waeren das sehr viele Abrufe. Darum je Kanal 10 s im Speicher; der Streamer bekommt
 * zusaetzlich seine Einstellungen, darum getrennt.
 */
const zwischen = new Map<string, { bis: number; wert: Promise<unknown> }>();
export function extDaten(kanal: string, rolle: ExtJwt['role']) {
  const schluessel = `${kanal}|${rolle === 'broadcaster' ? 'b' : 'v'}`;
  const z = zwischen.get(schluessel);
  if (z && z.bis > Date.now()) return z.wert;
  const wert = extDatenFrisch(kanal, rolle);
  zwischen.set(schluessel, { bis: Date.now() + 10_000, wert });
  wert.catch(() => zwischen.delete(schluessel));
  if (zwischen.size > 5000) for (const [k, v] of zwischen) if (v.bis < Date.now()) zwischen.delete(k);
  return wert;
}
export const extCacheLeeren = (kanal: string) => { zwischen.delete(`${kanal}|b`); zwischen.delete(`${kanal}|v`); };

async function extDatenFrisch(kanal: string, rolle: ExtJwt['role']) {
  const k = await konfigVon(kanal);
  let epic = k.epicId;
  if (!epic) { const login = await loginVon(kanal); epic = login ? await epicZuKanal(login) : null; }
  const plan = k.plan ? await streamPlan(kanal) : [];
  if (!epic) return { eingerichtet: false, spieler: null, cup: null, matches: [], code: null, plan, konfig: rolle === 'broadcaster' ? k : undefined };
  const { cups, spieler } = await finde([epic]);
  const s = spieler[epic];
  const cup = s?.windowId ? cups.find((c) => c.windowId === s.windowId) ?? null : null;
  let code: { matchId: string; seit: string | null } | { wartet: number } | null = null;
  if (k.code && s?.live?.matchId) {
    const seit = s.live.seit ? Date.parse(s.live.seit) : NaN;
    const offen = Number.isFinite(seit) ? seit + k.verzoegerungMin * 60_000 - Date.now() : (k.verzoegerungMin ? k.verzoegerungMin * 60_000 : 0);
    code = offen <= 0 ? { matchId: s.live.matchId, seit: s.live.seit } : { wartet: Math.ceil(offen / 1000) };
  }
  return {
    eingerichtet: true,
    spieler: { id: epic, name: k.epicName, profil: `https://www.thecomphub.com/player/${epic}` },
    cup: cup ? { titel: cup.titel, region: cup.region, live: cup.live, rang: s?.rang ?? null, punkte: s?.punkte ?? null, event: cup.eventId, fenster: cup.windowId } : null,
    imMatch: !!s?.live,
    matches: (s?.matches ?? []).slice(0, 5).map((m) => ({ platz: m.platz, elims: m.elims, ende: m.ende, titel: m.titel })),
    code,
    plan,
    konfig: rolle === 'broadcaster' ? k : undefined,
  };
}
