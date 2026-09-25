/*
 * Die offenen Aufgaben - als eine Nachricht in #admin-aufgaben, die
 * fortgeschrieben wird.
 *
 * Der Betreiber: "wenn ich dir Aufgaben gebe, die du aber noch nicht
 * erledigt hast und die eigentlich geplant sind, aber noch nicht fertig
 * sind." Die Liste lebt in data/offene-aufgaben.json; jede Aenderung
 * schreibt dieselbe Nachricht im Kanal neu, damit dort immer genau ein
 * aktueller Stand steht und nichts nach oben wegrutscht.
 *
 * Aufruf:
 *   node scripts/discord-aufgaben.mjs --neu "Replay-Upload im Profil"
 *   node scripts/discord-aufgaben.mjs --neu "…" --hinweis "wartet auf Ok"
 *   node scripts/discord-aufgaben.mjs --fertig 3
 *   node scripts/discord-aufgaben.mjs --stand 3 "haengt an Epic"
 *   node scripts/discord-aufgaben.mjs --liste        nur anzeigen
 *   node scripts/discord-aufgaben.mjs --senden       Nachricht neu schreiben
 *
 * Der Bot-Token kommt aus .env.local (DISCORD_BOT_TOKEN).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEI = path.join(PROJEKT, 'data', 'offene-aufgaben.json');
const API = 'https://discord.com/api/v10';
const KANAL = 'admin-aufgaben';
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

const argumente = process.argv.slice(2);
const arg = (name) => { const i = argumente.indexOf(name); return i >= 0 ? (argumente[i + 1] ?? '') : null; };

function lies() {
  try { return JSON.parse(fs.readFileSync(DATEI, 'utf8')); } catch { return { naechste: 1, nachricht: null, aufgaben: [] }; }
}
function schreib(d) {
  fs.mkdirSync(path.dirname(DATEI), { recursive: true });
  fs.writeFileSync(DATEI, JSON.stringify(d, null, 2));
}

const daten = lies();
const heute = new Date().toISOString().slice(0, 10);
let geaendert = false;

const neu = arg('--neu');
if (neu) {
  daten.aufgaben.push({ id: daten.naechste++, titel: neu, hinweis: arg('--hinweis') ?? '', seit: heute, stand: 'offen' });
  geaendert = true;
}
const fertig = arg('--fertig');
if (fertig) {
  const a = daten.aufgaben.find((x) => x.id === Number(fertig));
  if (!a) { console.error(`Aufgabe ${fertig} gibt es nicht.`); process.exit(1); }
  a.stand = 'erledigt'; a.erledigt = heute; geaendert = true;
}
const stand = arg('--stand');
if (stand) {
  const a = daten.aufgaben.find((x) => x.id === Number(stand));
  if (!a) { console.error(`Aufgabe ${stand} gibt es nicht.`); process.exit(1); }
  a.hinweis = argumente[argumente.indexOf('--stand') + 2] ?? ''; geaendert = true;
}
// Einen doppelt angelegten Eintrag entfernen (--weg 68,69). Nur fuer
// Dubletten - Erledigtes wird mit --fertig abgehakt, nicht geloescht.
const weg = arg('--weg');
if (weg) {
  const ids = new Set(weg.split(',').map(Number));
  const vorher = daten.aufgaben.length;
  daten.aufgaben = daten.aufgaben.filter((x) => !ids.has(x.id));
  if (daten.aufgaben.length === vorher) { console.error(`Keine Aufgabe ${weg}.`); process.exit(1); }
  geaendert = true;
}
if (geaendert) schreib(daten);

const offen = daten.aufgaben.filter((a) => a.stand !== 'erledigt');
const zuletzt = daten.aufgaben.filter((a) => a.stand === 'erledigt').slice(-8).reverse();
console.log(`  Offen: ${offen.length}`);
for (const a of offen) console.log(`   ${String(a.id).padStart(3)}  ${a.titel}${a.hinweis ? `  (${a.hinweis})` : ''}  seit ${a.seit}`);

if (argumente.includes('--liste') || (!geaendert && !argumente.includes('--senden'))) process.exit(0);
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt in .env.local.'); process.exit(1); }

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

const kanaele = await ruf(`/guilds/${SERVER}/channels`);
let kanal = kanaele.find((k) => k.type === 0 && k.name.toLowerCase() === KANAL);
if (!kanal) {
  // Wie infoKanal in lib/discord.ts fuer den Admin-Bereich: nur Admin und Bot.
  const rollen = await ruf(`/guilds/${SERVER}/roles`);
  const admin = rollen.find((r) => (BigInt(r.permissions) & 8n) === 8n && !r.managed)?.id ?? null;
  const ich = (await ruf('/users/@me')).id;
  let kategorie = kanaele.find((k) => k.type === 4 && k.name.toLowerCase() === 'admin')?.id ?? null;
  if (!kategorie) kategorie = (await ruf(`/guilds/${SERVER}/channels`, 'POST', { name: 'Admin', type: 4 })).id;
  const NICHT_SCHREIBEN = String(2048 + 2 ** 35 + 2 ** 36 + 2 ** 38);
  const regeln = [{ id: SERVER, type: 0, allow: '0', deny: String(1024 + Number(NICHT_SCHREIBEN)) }, { id: ich, type: 1, allow: '76800', deny: '0' }];
  if (admin) regeln.push({ id: admin, type: 0, allow: '76800', deny: '0' });
  kanal = await ruf(`/guilds/${SERVER}/channels`, 'POST', { name: KANAL, type: 0, parent_id: kategorie, permission_overwrites: regeln, topic: 'Open tasks - one message, kept up to date' });
  console.log(`  Kanal #${KANAL} angelegt.`);
}

const zeile = (a) => `**${a.id}** · ${a.titel}${a.hinweis ? ` · _${a.hinweis}_` : ''} · seit ${a.seit}`;

/*
 * Die Liste auf mehrere Nachrichten verteilt, sobald sie zu lang wird.
 *
 * Discord nimmt je Beschreibung hoechstens 4096 Zeichen. Am 25.9.2026 war
 * die Liste laenger, und jedes Eintragen scheiterte mit "Invalid Form Body".
 * Jetzt je Nachricht bis 3800 Zeichen; alle bleiben angepinnt.
 */
const zeilen = [
  ...(offen.length ? offen.map(zeile) : ['Nothing open.']),
  ...(zuletzt.length ? ['', '**Recently done**', ...zuletzt.map((a) => `~~${a.titel}~~ · ${a.erledigt}`)] : []),
];
const teile = [];
let teil = '';
for (const z of zeilen) {
  const kurz = z.length > 1000 ? `${z.slice(0, 997)}...` : z;
  if (teil && teil.length + kurz.length + 1 > 3800) { teile.push(teil); teil = ''; }
  teil += (teil ? '\n' : '') + kurz;
}
teile.push(teil);
const aktualisiert = `updated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
const einbettungen = teile.map((text, i) => ({
  title: i === 0 ? `Open tasks (${offen.length})` : `Open tasks (${i + 1}/${teile.length})`,
  description: text,
  color: FARBE,
  ...(i === teile.length - 1 ? { footer: { text: aktualisiert } } : {}),
}));

const alte = daten.nachrichten ?? (daten.nachricht ? [daten.nachricht] : []);
const neue = [];
for (let i = 0; i < einbettungen.length; i += 1) {
  let id = alte[i] ?? null;
  if (id) {
    try { await ruf(`/channels/${kanal.id}/messages/${id}`, 'PATCH', { embeds: [einbettungen[i]] }); }
    catch { id = null; }
  }
  if (!id) {
    const n = await ruf(`/channels/${kanal.id}/messages`, 'POST', { embeds: [einbettungen[i]] });
    id = n.id;
    // Angepinnt, damit sie im Kanal oben bleibt.
    await ruf(`/channels/${kanal.id}/pins/${id}`, 'PUT').catch(() => {});
  }
  neue.push(id);
}
// Was die Liste nicht mehr braucht, verschwindet.
for (const id of alte.slice(einbettungen.length)) {
  await ruf(`/channels/${kanal.id}/messages/${id}`, 'DELETE').catch(() => {});
}
daten.nachrichten = neue;
daten.nachricht = neue[0];
schreib(daten);
console.log(`  #${KANAL} aktualisiert.`);
