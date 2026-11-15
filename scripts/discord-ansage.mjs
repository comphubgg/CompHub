/*
 * Eine Ankuendigung nach #announcements - aus den Vorlagen in scripts/discord-vorlagen.mjs (englisch).
 *
 *   node scripts/discord-ansage.mjs --vorlage wartung                 zeigen, was gepostet wuerde
 *   node scripts/discord-ansage.mjs --vorlage wartung --anwenden      posten
 *   node scripts/discord-ansage.mjs --vorlage video --url https://youtu.be/... --text "Season recap" --anwenden
 *   --ping   mit @everyone (nur bei echten Ausfaellen - sonst stumm)
 *
 * Vorlagen: wartung, wartung-fertig, video, neu, stoerung.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ANSAGEN, ansage } from './discord-vorlagen.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const U = (() => {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
})();
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const vorlage = arg('--vorlage');
const werte = { url: arg('--url') ?? '', text: (arg('--text') ?? '').replace(/\\n/g, '\n') };
if (!ANSAGEN[vorlage]) { console.error(`--vorlage: ${Object.keys(ANSAGEN).join(', ')}`); process.exit(1); }
for (const n of ANSAGEN[vorlage].braucht ?? []) if (!werte[n]) { console.error(`--${n} fehlt fuer "${vorlage}".`); process.exit(1); }

const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '');
let kanaele = [];
if (TOKEN) {
  const r = await fetch(`https://discord.com/api/v10/guilds/${SERVER}/channels`, { headers: { Authorization: `Bot ${TOKEN}` } });
  kanaele = r.ok ? await r.json() : [];
}
const verweis = (n) => {
  const k = kanaele.find((x) => x.type !== 4 && (kern(x.name) === n || (n === 'comphub-updates' && kern(x.name) === 'updates')));
  return k ? `<#${k.id}>` : `#${n}`;
};
const embed = ansage(vorlage, werte, verweis);
const ping = process.argv.includes('--ping');
const nachricht = { ...(ping ? { content: '@everyone', allowed_mentions: { parse: ['everyone'] } } : { allowed_mentions: { parse: [] } }), embeds: [embed] };
console.log(JSON.stringify(nachricht, null, 2));

if (!process.argv.includes('--anwenden')) { console.log('\nNur Vorschau - posten mit --anwenden.'); process.exit(0); }
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt.'); process.exit(1); }
const ziel = kanaele.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === 'announcements');
if (!ziel) { console.error('#announcements nicht gefunden.'); process.exit(1); }
const r = await fetch(`https://discord.com/api/v10/channels/${ziel.id}/messages`, {
  method: 'POST', headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(nachricht),
});
if (!r.ok) { console.error(`Abgelehnt: ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
console.log(`Gepostet in #${ziel.name}.`);
