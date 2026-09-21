/*
 * Ein Update in den Discord-Server schreiben - aus dem Terminal.
 *
 * Der Betreiber: "Im Discord-Server wird dann ein kleiner Bericht
 * geschrieben, was updated wurde, was hinzugefuegt wurde, was fuer Bugs
 * gefixt wurden. Das kommt dann immer, nachdem du was gefixt hast." Drei
 * Kanaele nach Zielgruppe: #updates (alle), #vip-updates, #manager-updates.
 * Die Kanaele legt der Server-Aufbau an (lib/discord.ts, richteUpdatesEin);
 * fehlt einer, wird er hier mit denselben Regeln nachgeholt.
 *
 * Aufruf:
 *   node scripts/discord-update.mjs --ziel alle --art behoben \
 *     --titel "Login und Registrierung" --text "Seit dem 17.9. ..."
 *   --ziel alle|vip|manager   --art neu|behoben|geaendert
 *   --text kann mehrzeilig sein (\n im Text wird zum Zeilenumbruch).
 *
 * Der Bot-Token kommt aus .env.local (DISCORD_BOT_TOKEN).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';
const KANAELE = {
  alle: 'updates', vip: 'vip-updates', manager: 'manager-updates',
  // Der Admin-Bereich: nur Betreiber und Bot.
  admin: 'admin-log', alarm: 'admin-alarm',
};
const FARBE = 0x0ea5e9;

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim();
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = U.DISCORD_BOT_TOKEN || '';
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';

const arg = (name, standard = '') => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? standard) : standard; };
const ziel = arg('--ziel', 'alle');
const art = arg('--art', 'geaendert');
const titel = arg('--titel');
const text = arg('--text').replace(/\\n/g, '\n');

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt in .env.local.'); process.exit(1); }
if (!KANAELE[ziel]) { console.error('--ziel muss alle, vip, manager, admin oder alarm sein.'); process.exit(1); }
if (!['neu', 'behoben', 'geaendert', 'erledigt', 'alarm', 'info'].includes(art)) { console.error('--art muss neu, behoben, geaendert, erledigt, alarm oder info sein.'); process.exit(1); }
if (!titel || !text) { console.error('--titel und --text sind noetig.'); process.exit(1); }

async function ruf(weg, methode = 'GET', koerper) {
  const r = await fetch(`${API}${weg}`, {
    method: methode,
    headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Dieselben Rechte wie infoKanal in lib/discord.ts: lesen ja, schreiben nein.
const LESEN = '66560';
const NICHT_SCHREIBEN = String(2048 + 2 ** 35 + 2 ** 36 + 2 ** 38);
const VOLLZUGRIFF = '76800';

async function kanalFinden() {
  const kanaele = await ruf(`/guilds/${SERVER}/channels`);
  const name = KANAELE[ziel];
  const da = kanaele.find((k) => k.type === 0 && k.name.toLowerCase() === name);
  if (da) return da.id;

  // Nachholen: Kategorie "Updates", Rollen fuer VIP und Manager, Admin-Rolle.
  const rollen = await ruf(`/guilds/${SERVER}/roles`);
  const admin = rollen.find((r) => (BigInt(r.permissions) & 8n) === 8n && !r.managed)?.id ?? null;
  const ich = (await ruf('/users/@me')).id;
  const nackt = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const sammel = ziel === 'vip' ? 'vipstreamer' : ziel === 'manager' ? 'vipmanager' : null;
  const sichtbar = rollen.filter((r) => !r.managed && (
    (sammel && nackt(r.name) === sammel)
    || (ziel === 'manager' && r.name.toLowerCase().endsWith(' manager'))
  )).map((r) => r.id);

  const istAdmin = ziel === 'admin' || ziel === 'alarm';
  const kategorieName = istAdmin ? 'Admin' : 'Updates';
  let kategorie = kanaele.find((k) => k.type === 4 && k.name.toLowerCase() === kategorieName.toLowerCase())?.id ?? null;
  if (!kategorie) kategorie = (await ruf(`/guilds/${SERVER}/channels`, 'POST', { name: kategorieName, type: 4 })).id;

  const regeln = ziel === 'alle'
    ? [{ id: SERVER, type: 0, allow: LESEN, deny: NICHT_SCHREIBEN }]
    : [{ id: SERVER, type: 0, allow: '0', deny: String(1024 + Number(NICHT_SCHREIBEN)) },
      ...(istAdmin ? [] : sichtbar).map((id) => ({ id, type: 0, allow: LESEN, deny: NICHT_SCHREIBEN }))];
  regeln.push({ id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' });
  if (admin) regeln.push({ id: admin, type: 0, allow: VOLLZUGRIFF, deny: '0' });

  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name, type: 0, parent_id: kategorie, permission_overwrites: regeln,
    topic: ziel === 'alle' ? 'What is new on CompHub - for everyone' : ziel === 'vip' ? 'Updates that only VIPs get' : 'Updates for managers',
  });
  console.log(`  Kanal #${name} angelegt.`);
  return neu.id;
}

const kanal = await kanalFinden();
const vorsatz = { neu: 'NEW', behoben: 'FIXED', geaendert: 'CHANGED', erledigt: 'DONE', alarm: 'ALERT', info: 'INFO' }[art];
const farbe = art === 'alarm' ? 0xef4444 : FARBE;
await ruf(`/channels/${kanal}/messages`, 'POST', {
  embeds: [{
    title: `${vorsatz} · ${titel}`.slice(0, 256),
    description: text.slice(0, 4000),
    color: farbe,
    footer: { text: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
  }],
});
console.log(`  Update in #${KANAELE[ziel]} geschrieben: ${vorsatz} · ${titel}`);
