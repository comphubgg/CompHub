/*
 * Eine Mitteilung als Bot nach #comphub-updates (Betreiber, 15.11.2026: "wir sind gerade am Updaten - es koennen Fehler auftreten").
 *
 *   TEXT="..." TITEL="..." node scripts/discord-notiz.mjs              nur zeigen
 *   ... --anwenden                                                     posten
 *
 * Gestartet ueber .github/workflows/discord-umbau.yml (modus notiz-plan / notiz-posten). Ohne Ping.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FARBE } from '../lib/discordVorlagen.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';
const U = (() => {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
})();
const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
const ANWENDEN = process.argv.includes('--anwenden');
const TITEL = String(U.TITEL || '').trim().slice(0, 256);
const TEXT = String(U.TEXT || '').replace(/\\n/g, '\n').trim().slice(0, 4000);

if (!TEXT) { console.error('TEXT fehlt.'); process.exit(1); }
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt.'); process.exit(1); }

async function ruf(weg, methode = 'GET', koerper) {
  for (let v = 0; v < 6; v += 1) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((s) => setTimeout(s, Math.ceil((j.retry_after ?? 2) * 1000) + 250)); continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: zu oft gedrosselt`);
}

const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim();
const kanaele = await ruf(`/guilds/${SERVER}/channels`);
const kanal = kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'comphub-updates')
  ?? kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'updates');
if (!kanal) { console.error('#comphub-updates fehlt.'); process.exit(1); }

const embed = { ...(TITEL ? { title: TITEL } : {}), description: TEXT, color: FARBE, timestamp: new Date().toISOString() };
console.log(`Kanal #${kanal.name} · ${ANWENDEN ? 'POSTEN' : 'nur zeigen'}\n${TITEL}\n${TEXT}`);
if (ANWENDEN) {
  const m = await ruf(`/channels/${kanal.id}/messages`, 'POST', { embeds: [embed], allowed_mentions: { parse: [] } });
  console.log(`gepostet: ${m.id}`);
}
