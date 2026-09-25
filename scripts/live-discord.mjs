/*
 * #live-now: wer von den CompHub-VIPs gerade auf Twitch live ist.
 *
 * Laeuft alle zehn Minuten im Ablauf "Discord live" (.github/workflows/
 * discord-live.yml). Welche Streamer dazugehoeren, sagt die Startseite: die
 * VIPs, die der Betreiber dort mit Twitch-Konto eingetragen hat
 * (/api/vips). Ob sie live sind, sagt Twitch selbst (Helix, kostenlos mit
 * dem vorhandenen Client).
 *
 * Ohne eigene Ablage: der Kanal ist das Gedaechtnis. Jede Meldung traegt im
 * Fuss "live:<login>"; geht der Stream zu Ende, wird dieselbe Meldung auf
 * "ended" umgeschrieben. Geht jemand wieder live, dessen letzte Meldung
 * beendet ist, kommt eine neue.
 *
 * Antwortet die Seite nicht oder liefert sie keine VIPs, passiert nichts -
 * schon gar nicht wird dann ein laufender Stream fuer beendet erklaert.
 *
 * Aufruf:  node scripts/live-discord.mjs [--probe]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const SEITE = 'https://www.thecomphub.com';
const API = 'https://discord.com/api/v10';
const KANAL = 'live-now';
const ROT = 0xef4444;
const GRAU = 0x52525b;
const PROBE = process.argv.includes('--probe');

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
const TOKEN = U.DISCORD_BOT_TOKEN || '';
const SERVER_ID = U.DISCORD_SERVER_ID || '1529205620287344783';

async function ruf(weg, methode = 'GET', koerper) {
  const r = await fetch(`${API}${weg}`, {
    method: methode,
    headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

async function twitchLive(logins) {
  const tok = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: U.TWITCH_CLIENT_ID || '', client_secret: U.TWITCH_CLIENT_SECRET || '',
      grant_type: 'client_credentials',
    }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('Twitch: kein Token');
  const live = new Map();
  for (let i = 0; i < logins.length; i += 100) {
    const p = new URLSearchParams();
    for (const l of logins.slice(i, i + 100)) p.append('user_login', l);
    const r = await fetch(`https://api.twitch.tv/helix/streams?${p}&first=100`, {
      headers: { 'Client-ID': U.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` },
    });
    if (!r.ok) throw new Error(`Twitch: ${r.status}`);
    for (const s of (await r.json()).data ?? []) live.set(s.user_login.toLowerCase(), s);
  }
  return live;
}

async function main() {
  if (!TOKEN) { console.log('Kein Bot-Token.'); return; }

  const vips = await fetch(`${SEITE}/api/vips`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  const streamer = (vips?.vips ?? [])
    .filter((v) => v.twitch)
    .map((v) => ({ name: v.name, login: String(v.twitch).toLowerCase().replace(/^@/, '') }));
  if (!streamer.length) { console.log('Keine VIPs mit Twitch-Konto - nichts zu tun.'); return; }

  const live = await twitchLive(streamer.map((s) => s.login));

  const kanaele = await ruf(`/guilds/${SERVER_ID}/channels`);
  const kanal = kanaele.find((k) => k.type === 0 && k.name === KANAL);
  if (!kanal) { console.log(`#${KANAL} fehlt - erst den Community-Aufbau laufen lassen.`); return; }
  const ich = await ruf('/users/@me');
  const verlauf = (await ruf(`/channels/${kanal.id}/messages?limit=100`))
    .filter((m) => m.author?.id === ich.id && m.embeds?.[0]?.footer?.text?.startsWith('live:'));

  // Die juengste Meldung je Streamer (die Liste kommt neueste zuerst).
  const letzte = new Map();
  for (const m of verlauf) {
    const login = m.embeds[0].footer.text.split(':')[1];
    if (!letzte.has(login)) letzte.set(login, m);
  }

  for (const s of streamer) {
    const stream = live.get(s.login);
    const m = letzte.get(s.login);
    const beendet = !m || m.embeds[0].footer.text.endsWith(':ended');
    if (stream && beendet) {
      const koerper = {
        embeds: [{
          title: `🔴 ${s.name} is live`,
          url: `https://www.twitch.tv/${s.login}`,
          description: [stream.title, stream.game_name ? `Playing **${stream.game_name}**` : ''].filter(Boolean).join('\n').slice(0, 2000),
          color: ROT,
          thumbnail: stream.thumbnail_url ? { url: stream.thumbnail_url.replace('{width}', '440').replace('{height}', '248') } : undefined,
          footer: { text: `live:${s.login}` },
          timestamp: stream.started_at,
        }],
      };
      console.log('live:', s.login);
      if (!PROBE) await ruf(`/channels/${kanal.id}/messages`, 'POST', koerper);
    } else if (!stream && m && !beendet) {
      const alt = m.embeds[0];
      const koerper = {
        embeds: [{
          ...alt,
          title: alt.title.replace('🔴 ', '').replace(' is live', ' was live'),
          color: GRAU,
          description: `Stream ended <t:${Math.floor(Date.now() / 1000)}:R>`,
          thumbnail: undefined,
          footer: { text: `live:${s.login}:ended` },
        }],
      };
      console.log('beendet:', s.login);
      if (!PROBE) await ruf(`/channels/${kanal.id}/messages/${m.id}`, 'PATCH', koerper);
    }
  }
  console.log(`${streamer.length} VIPs mit Twitch, ${live.size} live.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
