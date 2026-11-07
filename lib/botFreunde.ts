import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Das Bot-Konto der Seite ("comphub.") und seine Freunde - gesteuert ueber den Discord-Kanal #admin-bot-friends (Betreiber, 7.11.2026: "wenn ich als Admin
 * da einen Namen reinschreibe, testet er das gleich auch und fuegt den als Pro hinzu. Wenn er annimmt oder ablehnt, sagt er mir das").
 *
 * Ein Takt (alle zwei Minuten, vom Server selbst angestossen - instrumentation.ts -> /api/bot-freunde):
 *   1. neue Nachrichten im Kanal lesen: je Zeile ein Epic-Name (oder eine Konto-Id) -> Konto suchen, Freundschaftsanfrage schicken, als Pro aufnehmen, antworten
 *   2. die Freundesliste des Bots ansehen: wer angenommen hat, wessen Anfrage verschwunden ist (abgelehnt) -> eine Nachricht mit den Aenderungen
 * Stand je Konto in data/bot-freunde.json (dieselbe Datei wie scripts/bot-freunde.mjs). Alles fuer Discord auf Englisch.
 */

const KANAL = 'admin-bot-friends';
const DISCORD = 'https://discord.com/api/v10';
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const FREUNDE = 'https://friends-public-service-prod.ol.epicgames.com/friends/api/v1';
const BASIC = 'basic ' + Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64');

interface Eintrag { name: string; status: 'gesendet' | 'freund' | 'abgelehnt' | 'nimmt nicht an' | 'fehler'; zeit: string; grund?: string; quelle?: string }
type Stand = Record<string, Eintrag>;

const STAND = path.join(DATEN_ORT, 'bot-freunde.json');
const ZEIGER = path.join(DATEN_ORT, 'bot-freunde-discord.json');
const lies = async <T>(p: string, ersatz: T): Promise<T> => { try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; } catch { return ersatz; } };

/* ------------------------------------------------------------ Epic */

let epic: { token: string; konto: string; bis: number } | null = null;
async function epicToken(): Promise<{ token: string; konto: string } | null> {
  if (epic && Date.now() < epic.bis) return epic;
  const a = await lies<{ accountId?: string; deviceId?: string; secret?: string } | null>(path.join(DATEN_ORT, 'epic-auth-bot.json'), null);
  if (!a?.accountId || !a.deviceId || !a.secret) return null;
  const r = await fetch(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST', headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'device_auth', account_id: a.accountId, device_id: a.deviceId, secret: a.secret }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Bot-Anmeldung: HTTP ${r.status}`);
  const j = await r.json() as { access_token: string; account_id: string; expires_in?: number };
  // Ein Schluessel fuer zwei Stunden, nicht einer je Takt - jede Anmeldung ist bei Epic eine Sitzung.
  epic = { token: j.access_token, konto: j.account_id, bis: Date.now() + Math.max(60, (j.expires_in ?? 7200) - 300) * 1000 };
  return epic;
}

async function kontoVon(eingabe: string, token: string): Promise<{ id: string; name: string } | null> {
  const s = eingabe.trim().replace(/^@/, '').replace(/^["'`]|["'`]$/g, '');
  if (/^[0-9a-f]{32}$/i.test(s)) {
    const r = await fetch(`${ACCOUNT}/account/api/public/account/${s.toLowerCase()}`, { headers: { Authorization: `bearer ${token}` } });
    const j = r.ok ? await r.json() as { id?: string; displayName?: string } : null;
    return j?.id ? { id: j.id, name: j.displayName ?? s } : null;
  }
  const r = await fetch(`${ACCOUNT}/account/api/public/account/displayName/${encodeURIComponent(s)}`, { headers: { Authorization: `bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json() as { id?: string; displayName?: string };
  return j.id ? { id: j.id, name: j.displayName ?? s } : null;
}

async function anfrage(id: string, token: string, konto: string): Promise<{ status: Eintrag['status']; grund?: string }> {
  const r = await fetch(`${FREUNDE}/${konto}/friends/${id}`, { method: 'POST', headers: { Authorization: `bearer ${token}` } });
  if (r.ok) return { status: 'gesendet' };
  const code = String(((await r.json().catch(() => null)) as { errorCode?: string } | null)?.errorCode ?? `HTTP ${r.status}`);
  if (/already_sent|duplicate/i.test(code)) return { status: 'gesendet' };
  if (/already_friends|friendship_exists/i.test(code)) return { status: 'freund' };
  if (/target_settings|not_accepting|restricted|privacy/i.test(code)) return { status: 'nimmt nicht an', grund: code };
  return { status: 'fehler', grund: code };
}

/* ------------------------------------------------------------ Discord */

async function dc(weg: string, art: 'GET' | 'POST' = 'GET', koerper?: unknown): Promise<unknown> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!token) return null;
  const r = await fetch(`${DISCORD}${weg}`, {
    method: art, headers: { Authorization: `Bot ${token}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}), signal: AbortSignal.timeout(20_000),
  });
  return r.ok ? r.json().catch(() => ({})) : null;
}

let kanalId: string | null = null;
async function kanal(): Promise<string | null> {
  if (kanalId) return kanalId;
  const gilden = (await dc('/users/@me/guilds')) as Array<{ id: string }> | null;
  for (const g of gilden ?? []) {
    const k = (await dc(`/guilds/${g.id}/channels`)) as Array<{ id: string; name: string }> | null;
    const t = k?.find((x) => x.name === KANAL);
    if (t) { kanalId = t.id; return t.id; }
  }
  return null;
}
const sag = (id: string, text: string) => dc(`/channels/${id}/messages`, 'POST', { content: text.slice(0, 1900), allowed_mentions: { parse: [] } });

/* ------------------------------------------------------------ Pros */

/** Als Pro aufnehmen (spieler-profile.json, wie im Admin-Bereich), falls noch nicht da. */
async function alsPro(id: string, name: string): Promise<boolean> {
  const p = await liesJson<Record<string, { id?: string; name?: string; namen?: string[]; land?: string | null; anzeige?: string }>>('spieler-profile.json', {});
  if (!Object.keys(p).length) return false; // Ablage nicht lesbar: nichts ueberschreiben
  if (p[id] || Object.values(p).some((v) => v?.id === id)) return false;
  p[id] = { id, name, namen: [name], land: null, anzeige: name };
  await schreibJson('spieler-profile.json', p);
  return true;
}

/* ------------------------------------------------------------ Takt */

let laeuft = false;
export async function botFreundeTakt(): Promise<{ ok: boolean; text: string }> {
  if (laeuft) return { ok: true, text: 'laeuft schon' };
  laeuft = true;
  try {
    const e = await epicToken();
    if (!e) return { ok: false, text: 'kein Bot-Konto' };
    const k = await kanal();
    const stand = await lies<Stand>(STAND, {});
    let neu = 0;

    // 1. Namen aus dem Kanal
    if (k) {
      const zeiger = await lies<{ letzte?: string }>(ZEIGER, {});
      const nachrichten = ((await dc(`/channels/${k}/messages?limit=50${zeiger.letzte ? `&after=${zeiger.letzte}` : ''}`)) as Array<{ id: string; content?: string; author?: { bot?: boolean } }> | null) ?? [];
      nachrichten.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      for (const n of nachrichten) {
        zeiger.letzte = n.id;
        if (n.author?.bot) continue;
        const namen = String(n.content ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 40).slice(0, 25);
        const zeilen: string[] = [];
        for (const name of namen) {
          const konto = await kontoVon(name, e.token);
          if (!konto) { zeilen.push(`❌ **${name}** - no Epic account with this name`); continue; }
          const a = await anfrage(konto.id, e.token, e.konto);
          stand[konto.id] = { name: konto.name, status: a.status, zeit: new Date().toISOString(), quelle: 'discord', ...(a.grund ? { grund: a.grund } : {}) };
          const pro = await alsPro(konto.id, konto.name).catch(() => false);
          const proText = pro ? ' - added as pro' : '';
          zeilen.push(a.status === 'gesendet' ? `📨 **${konto.name}** - friend request sent${proText}`
            : a.status === 'freund' ? `✅ **${konto.name}** - already friends${proText}`
            : a.status === 'nimmt nicht an' ? `🚫 **${konto.name}** - does not accept friend requests (Epic settings)${proText}`
            : `⚠️ **${konto.name}** - request failed (${a.grund})${proText}`);
          neu += 1;
        }
        if (zeilen.length) await sag(k, zeilen.join('\n'));
      }
      await fs.writeFile(ZEIGER, JSON.stringify(zeiger));
    }

    // 2. Wer hat angenommen, wessen Anfrage ist weg
    const r = await fetch(`${FREUNDE}/${e.konto}/summary`, { headers: { Authorization: `bearer ${e.token}` }, signal: AbortSignal.timeout(20_000) });
    if (r.ok) {
      const s = await r.json() as { friends?: Array<{ accountId: string }>; outgoing?: Array<{ accountId: string }> };
      const freunde = new Set((s.friends ?? []).map((f) => f.accountId));
      const offen = new Set((s.outgoing ?? []).map((f) => f.accountId));
      const angenommen: string[] = []; const abgelehnt: string[] = [];
      for (const [id, x] of Object.entries(stand)) {
        if (freunde.has(id) && x.status !== 'freund') { x.status = 'freund'; x.zeit = new Date().toISOString(); angenommen.push(x.name); }
        else if (x.status === 'gesendet' && !offen.has(id) && !freunde.has(id)) { x.status = 'abgelehnt'; x.zeit = new Date().toISOString(); abgelehnt.push(x.name); }
      }
      if (k && (angenommen.length || abgelehnt.length)) {
        await sag(k, [
          ...(angenommen.length ? [`🎉 **Accepted (${angenommen.length}):** ${angenommen.join(', ')} - their match ID now shows in the Match Finder as soon as they queue`] : []),
          ...(abgelehnt.length ? [`👋 **Declined (${abgelehnt.length}):** ${abgelehnt.join(', ')}`] : []),
        ].join('\n'));
      }
    }
    await fs.writeFile(STAND, JSON.stringify(stand, null, 1));
    return { ok: true, text: `${neu} neue Namen` };
  } finally { laeuft = false; }
}
