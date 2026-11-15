/*
 * Posts von X als CompHub-Bot nach #🐦-social-posts (Betreiber, 15.11.2026).
 *
 * Die Zeitleiste von @CompHub_gg liest sich ohne die kostenpflichtige X-Schnittstelle nicht von selbst
 * (geprueft mit dem Modus x-probe in .github/workflows/discord-umbau.yml: kein offener Weg lieferte Beitrags-Links).
 * Deshalb: der Betreiber nennt die Links, dieses Skript holt jeden Beitrag ueber FixTweet (api.fxtwitter.com - wie
 * app/api/tweet-holen) und postet ihn als saubere Einbettung: Text, erstes Bild (bei Videos das Vorschaubild),
 * Datum, Knopf "View on X".
 *
 *   node scripts/discord-tweets.mjs --links "https://x.com/CompHub_gg/status/1,https://x.com/CompHub_gg/status/2"
 *                                              nur zeigen, was gepostet wuerde
 *   ... --anwenden                             posten
 *
 * Nie doppelt: die Einbettung traegt als Adresse den Link des Beitrags (x.com/<konto>/status/<id>); was in den
 * letzten 100 Bot-Nachrichten des Kanals schon steht, wird uebersprungen. Aeltere Beitraege zuerst, damit der
 * Kanal in der richtigen Reihenfolge steht.
 *
 * Bot-Token aus .env.local oder der Umgebung (DISCORD_BOT_TOKEN), Server DISCORD_SERVER_ID.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FARBE } from '../lib/discordVorlagen.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
const ANWENDEN = process.argv.includes('--anwenden');
const i = process.argv.indexOf('--links');
const LINKS = String(i >= 0 ? process.argv[i + 1] ?? '' : U.LINKS ?? '');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aus jeder Schreibweise die Beitrags-Nummer (wie app/api/tweet-holen). */
function nummer(roh) {
  const t = String(roh ?? '').trim();
  if (/^\d{1,25}$/.test(t)) return t;
  const m = t.match(/(?:twitter|x|fxtwitter|vxtwitter|fixupx)\.com\/[^/]+\/status(?:es)?\/(\d{1,25})/i);
  return m ? m[1] : null;
}

async function ruf(weg, methode = 'GET', koerper) {
  for (let versuch = 0; versuch < 6; versuch += 1) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await warte(Math.ceil((j.retry_after ?? 2) * 1000) + 250); continue; }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: zu oft gedrosselt`);
}

async function beitrag(id) {
  for (const weg of [`https://api.fxtwitter.com/i/status/${id}`, `https://api.fxtwitter.com/status/${id}`]) {
    for (let versuch = 0; versuch < 3; versuch += 1) {
      try {
        const r = await fetch(weg, { headers: { 'User-Agent': 'CompHub/1.0' }, signal: AbortSignal.timeout(20_000) });
        if (r.status === 404) break;
        if (r.ok) { const j = await r.json(); if (j?.tweet) return j.tweet; }
      } catch { /* noch einmal */ }
      await warte(800 * (versuch + 1));
    }
  }
  return null;
}

function einbettung(id, tw) {
  const konto = tw.author?.screen_name ?? 'CompHub_gg';
  const url = `https://x.com/${konto}/status/${id}`;
  const foto = tw.media?.photos?.[0]?.url ?? tw.media?.videos?.[0]?.thumbnail_url ?? tw.media?.mosaic?.formats?.jpeg ?? null;
  const zeit = tw.created_timestamp ? new Date(tw.created_timestamp * 1000) : tw.created_at ? new Date(tw.created_at) : null;
  return {
    embed: {
      author: { name: `${tw.author?.name ?? konto} (@${konto})`.slice(0, 256), url: `https://x.com/${konto}`, ...(tw.author?.avatar_url ? { icon_url: tw.author.avatar_url } : {}) },
      url,
      description: String(tw.text ?? '').slice(0, 4000) || undefined,
      color: FARBE,
      ...(foto ? { image: { url: foto } } : {}),
      ...(zeit && !Number.isNaN(zeit.getTime()) ? { timestamp: zeit.toISOString() } : {}),
      footer: { text: (tw.media?.videos?.length ? 'X · video - watch on X' : 'X') },
    },
    knopf: { type: 1, components: [{ type: 2, style: 5, label: 'View on X', url }] },
  };
}

/*
 * --aus-admin-posts (15.11.2026): der Betreiber schickt den Link einfach nach #admin-posts. Der Server fragt jede Minute (deploy/server-compose.yml,
 * Dienst "tweets"), findet neue X-Links von @CompHub_gg, postet sie mit @everyone nach #social-posts und hakt die Nachricht mit ✅ ab.
 */
const AUS_ADMIN = process.argv.includes('--aus-admin-posts');
const PING = AUS_ADMIN || process.argv.includes('--ping');
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt (.env.local oder Umgebung).'); process.exit(1); }
const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim();
const [kanaele, ich] = await Promise.all([ruf(`/guilds/${SERVER}/channels`), ruf('/users/@me')]);
const quellen = new Map();
let linkText = LINKS;
if (AUS_ADMIN) {
  const admin = kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'admin-posts');
  if (!admin) { console.error('#admin-posts fehlt'); process.exit(1); }
  const nachrichten = await ruf(`/channels/${admin.id}/messages?limit=30`).catch(() => []);
  for (const m of nachrichten) {
    if (m.author?.bot) continue;
    if ((m.reactions ?? []).some((r) => r.emoji?.name === '✅' && r.me)) continue;
    for (const t of String(m.content ?? '').match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/CompHub_gg\/status\/\d+/gi) ?? []) {
      const n = nummer(t); if (n) quellen.set(n, { kanal: admin.id, nachricht: m.id });
      linkText += `,${t}`;
    }
  }
}
const ids = [...new Set(linkText.split(/[\s,]+/).map(nummer).filter(Boolean))].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
if (!ids.length) { console.log('Keine (neuen) Beitrags-Links.'); process.exit(0); }
const kanal = kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'social-posts');
if (!kanal) { console.error('#social-posts fehlt - erst den Umbau (modus anwenden) laufen lassen.'); process.exit(1); }
const verlauf = await ruf(`/channels/${kanal.id}/messages?limit=100`).catch(() => []);
const schon = new Set(verlauf.filter((m) => m.author?.id === ich.id)
  .flatMap((m) => (m.embeds ?? []).map((e) => /\/status\/(\d+)/.exec(e.url ?? '')?.[1]).filter(Boolean)));

console.log(`Kanal #${kanal.name} · ${ids.length} Link(s) · ${ANWENDEN ? 'POSTEN' : 'nur zeigen'}`);
let fehler = 0;
for (const id of ids) {
  const abhaken = async () => { const q = quellen.get(id); if (q && ANWENDEN) await ruf(`/channels/${q.kanal}/messages/${q.nachricht}/reactions/${encodeURIComponent('✅')}/@me`, 'PUT').catch(() => null); };
  if (schon.has(id)) { console.log(`  = ${id} steht schon im Kanal - uebersprungen`); await abhaken(); continue; }
  const tw = await beitrag(id);
  if (!tw) { fehler += 1; console.log(`  ✗ ${id}: FixTweet lieferte nichts (geloescht, privat oder gesperrt?)`); continue; }
  const { embed, knopf } = einbettung(id, tw);
  console.log(`  ${ANWENDEN ? '→' : '·'} ${id} @${tw.author?.screen_name ?? '?'} ${embed.timestamp ?? ''}${embed.image ? ' [Bild]' : ''}\n      ${String(tw.text ?? '').replace(/\s+/g, ' ').slice(0, 140)}`);
  if (!ANWENDEN) continue;
  try {
    await ruf(`/channels/${kanal.id}/messages`, 'POST', {
      ...(PING ? { content: '@everyone' } : {}), embeds: [embed], components: [knopf],
      allowed_mentions: { parse: PING ? ['everyone'] : [] },
    });
    schon.add(id);
    await abhaken();
  } catch (e) { fehler += 1; console.log(`      ${e.message}`); }
  await warte(600);
}
process.exitCode = fehler ? 1 : 0;
