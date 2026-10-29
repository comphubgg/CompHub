import crypto from 'crypto';
import { liesJson, schreibJson } from '@/lib/ablage';
import { twitchToken } from '@/lib/twitchToken';

/*
 * Der CompHub-Twitch-Bot (Betreiber, 27./29.10.2026): "wie Fossabot - geht ueber Commands: jemand schreibt !webseite, der Streamer richtet im Dashboard
 * so einen Command ein und bestimmt, was der Bot antwortet (z. B. eine URL) ... oder Regeln: schreibt jemand eine Beleidigung, bannt oder timeoutet der
 * Bot ihn fuer so und so lange ... nicht: jemand schreibt Hallo, der Bot antwortet Hallo ... 24/7, nicht nur, wenn mein PC an ist".
 *
 * Ohne dauernde Verbindung: Twitch schickt jede Chatnachricht der eingetragenen Kanaele per EventSub-Webhook an /api/twitch/eventsub (channel.chat.message),
 * der Bot antwortet ueber Helix (Send Chat Message) und moderiert ueber Helix (Ban/Timeout, Nachricht loeschen). Das laeuft auf jeder Fassung der Seite -
 * dem Rechner daheim und der Netlify-Ausweichseite.
 *
 * Voraussetzungen: das Bot-Konto ist einmal ueber /twitch-bot (Admin) mit CompHub verbunden (Scopes unten), und im Kanal des Streamers ist der Bot Moderator
 * (/mod <Botname>) - sonst darf er dort weder lesen (App-Token) noch bannen.
 *
 *   twitch-bot/zugang.json       das Bot-Konto: Kennung, Name, Tokens (privates Datenarchiv)
 *   twitch-bot/<Kanal-Id>.json   je Kanal: an/aus, Befehle, Regeln, Abo-Kennung
 * Welche Kanaele ein VIP einstellen darf, sagt dieselbe Zuordnung wie bei der Twitch-Statistik (twitch-kanaele.json, Admin).
 */

export const BOT_SCOPES = 'user:read:chat user:write:chat user:bot moderator:manage:banned_users moderator:manage:chat_messages';
const ZUGANG = 'twitch-bot/zugang.json';

export interface BotZugang { id: string; login: string; access: string; refresh: string; bis: number; scopes: string[] }
export interface Befehl { name: string; antwort: string; cooldownSek: number; nurMods: boolean }
export interface Regel { woerter: string[]; aktion: 'loeschen' | 'timeout' | 'bann'; dauerSek: number; grund: string }
export interface BotKanal { id: string; login: string; an: boolean; befehle: Befehl[]; regeln: Regel[]; abo?: string | null; geaendert: number }

export const liesZugang = () => liesJson<BotZugang | null>(ZUGANG, null).catch(() => null);
export const speichereZugang = (z: BotZugang) => schreibJson(ZUGANG, z);
export const liesKanal = (id: string) => liesJson<BotKanal | null>(`twitch-bot/${id}.json`, null).catch(() => null);
export const speichereKanal = (k: BotKanal) => schreibJson(`twitch-bot/${k.id}.json`, { ...k, geaendert: Date.now() });

/** Das Geheimnis, mit dem Twitch die Webhooks unterschreibt - auf jeder Fassung der Seite gleich (abgeleitet vom Client-Secret). */
export function eventsubGeheimnis(): string {
  return crypto.createHash('sha256').update(`comphub-eventsub|${process.env.TWITCH_CLIENT_SECRET ?? ''}`).digest('hex').slice(0, 40);
}

const CLIENT = () => process.env.TWITCH_CLIENT_ID || '';

/** Ein gueltiges Token des Bot-Kontos - wird erneuert, wenn es bald ablaeuft. */
export async function botToken(): Promise<BotZugang | null> {
  const z = await liesZugang();
  if (!z) return null;
  if (z.bis > Date.now() + 5 * 60_000) return z;
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: z.refresh, client_id: CLIENT(), client_secret: process.env.TWITCH_CLIENT_SECRET || '' }),
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { access_token: string; refresh_token: string; expires_in: number };
    const neu = { ...z, access: j.access_token, refresh: j.refresh_token ?? z.refresh, bis: Date.now() + (j.expires_in ?? 3600) * 1000 };
    await speichereZugang(neu);
    return neu;
  } catch { return null; }
}

async function helix(weg: string, init: RequestInit & { token: string }) {
  return fetch(`https://api.twitch.tv/helix/${weg}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { 'Client-Id': CLIENT(), Authorization: `Bearer ${init.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** Ist der Bot in diesem Kanal Moderator? (Ohne das darf er dort weder lesen noch bannen.) */
export async function istModerator(kanalId: string): Promise<boolean | null> {
  const z = await botToken();
  if (!z) return null;
  const r = await helix(`moderation/channels?user_id=${z.id}&first=100`, { method: 'GET', token: z.access }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json() as { data?: Array<{ broadcaster_id: string }> };
  return (j.data ?? []).some((c) => c.broadcaster_id === kanalId);
}

/** Das Abo fuer die Chatnachrichten eines Kanals anlegen (App-Token; der Bot muss dort Moderator sein). Zurueck: Abo-Kennung oder Fehlertext. */
export async function abonnieren(kanalId: string, rueckweg: string): Promise<{ abo: string } | { fehler: string }> {
  const z = await liesZugang();
  if (!z) return { fehler: 'Das Bot-Konto ist noch nicht verbunden.' };
  const app = await twitchToken();
  if (!app) return { fehler: 'Twitch antwortet gerade nicht.' };
  const r = await helix('eventsub/subscriptions', {
    method: 'POST', token: app,
    body: JSON.stringify({
      type: 'channel.chat.message', version: '1',
      condition: { broadcaster_user_id: kanalId, user_id: z.id },
      transport: { method: 'webhook', callback: rueckweg, secret: eventsubGeheimnis() },
    }),
  }).catch(() => null);
  if (r?.status === 409) return { abo: 'schon-da' };
  if (!r?.ok) {
    const t = await r?.text().catch(() => '') ?? '';
    return { fehler: /moderator|authorization|forbidden/i.test(t) ? 'Der Bot ist in diesem Kanal noch kein Moderator - im Chat /mod eingeben.' : `Twitch lehnt das Abo ab (${r?.status ?? 'keine Antwort'}).` };
  }
  const j = await r.json() as { data?: Array<{ id: string }> };
  return { abo: j.data?.[0]?.id ?? 'angelegt' };
}

export async function abbestellen(abo: string | null | undefined): Promise<void> {
  if (!abo || abo === 'schon-da' || abo === 'angelegt') return;
  const app = await twitchToken();
  if (app) await helix(`eventsub/subscriptions?id=${encodeURIComponent(abo)}`, { method: 'DELETE', token: app }).catch(() => null);
}

/* ------------------------------------------------------------------ Nachrichten */

interface Nachricht {
  broadcaster_user_id: string; chatter_user_id: string; chatter_user_login: string; chatter_user_name: string; message_id: string;
  message: { text: string }; badges?: Array<{ set_id: string }>;
}

const abklingen = new Map<string, number>();
const gesehen = new Map<string, number>();

async function sende(kanalId: string, text: string, antwortAuf?: string) {
  const z = await botToken();
  if (!z) return;
  await helix('chat/messages', {
    method: 'POST', token: z.access,
    body: JSON.stringify({ broadcaster_id: kanalId, sender_id: z.id, message: text.slice(0, 480), ...(antwortAuf ? { reply_parent_message_id: antwortAuf } : {}) }),
  }).catch(() => null);
}

/** Eine Chatnachricht verarbeiten: erst die Regeln (Moderation), dann die Befehle. */
export async function verarbeite(n: Nachricht): Promise<void> {
  // Twitch schickt eine Nachricht bei Wiederholung erneut - jede nur einmal.
  const jetzt = Date.now();
  if (gesehen.has(n.message_id)) return;
  gesehen.set(n.message_id, jetzt);
  if (gesehen.size > 5000) for (const [k, t] of gesehen) if (jetzt - t > 10 * 60_000) gesehen.delete(k);

  const kanal = await liesKanal(n.broadcaster_user_id);
  if (!kanal?.an) return;
  const z = await liesZugang();
  if (!z || n.chatter_user_id === z.id) return;
  const text = n.message.text.trim();
  const mod = (n.badges ?? []).some((b) => b.set_id === 'moderator' || b.set_id === 'broadcaster');

  // Regeln - nie gegen Moderatoren und den Streamer.
  if (!mod) {
    const klein = text.toLowerCase();
    const regel = kanal.regeln.find((r) => r.woerter.some((w) => w && klein.includes(w.toLowerCase())));
    if (regel) {
      const t = await botToken();
      if (!t) return;
      if (regel.aktion === 'loeschen') {
        await helix(`moderation/chat?broadcaster_id=${kanal.id}&moderator_id=${t.id}&message_id=${n.message_id}`, { method: 'DELETE', token: t.access }).catch(() => null);
      } else {
        await helix(`moderation/bans?broadcaster_id=${kanal.id}&moderator_id=${t.id}`, {
          method: 'POST', token: t.access,
          body: JSON.stringify({ data: { user_id: n.chatter_user_id, reason: regel.grund || 'CompHub bot rule', ...(regel.aktion === 'timeout' ? { duration: Math.min(1_209_600, Math.max(1, regel.dauerSek || 600)) } : {}) } }),
        }).catch(() => null);
      }
      return;
    }
  }

  // Befehle: "!name" am Anfang der Nachricht.
  const m = /^!(\S+)/.exec(text);
  if (!m) return;
  const befehl = kanal.befehle.find((b) => b.name.replace(/^!/, '').toLowerCase() === m[1].toLowerCase());
  if (!befehl || (befehl.nurMods && !mod)) return;
  const schluessel = `${kanal.id}|${befehl.name}`;
  if ((abklingen.get(schluessel) ?? 0) > jetzt) return;
  abklingen.set(schluessel, jetzt + Math.max(0, befehl.cooldownSek) * 1000);
  const ausgabe = befehl.antwort
    .replace(/\{user\}/gi, n.chatter_user_name)
    .replace(/\{channel\}/gi, kanal.login)
    .replace(/\{args\}/gi, text.slice(m[0].length).trim());
  await sende(kanal.id, ausgabe, n.message_id);
}
