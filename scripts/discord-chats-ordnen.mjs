/*
 * Gespraechskanaele, die unter "Support" statt unter "Chats" gelandet sind, nach "Chats" holen - erst zeigen, dann tun.
 *
 * Der Betreiber (28.11.2026): "Chat" unter einer Anfrage in #access-requests machte #ticket-ben-nazha unter "Support" auf,
 * nicht unter "Chats". Ursache (behoben in lib/discord.ts ticketOeffnen): die Funktion nahm fuer jeden Ticketkanal die
 * Kategorie von #support - auch fuer die Gespraeche, die der Admin anstoesst. Dieses Skript zeigt den Bestand und holt die
 * schon falsch abgelegten Admin-Gespraeche nach "Chats".
 *
 *   node scripts/discord-chats-ordnen.mjs              nur zeigen (liest, aendert nichts)
 *   node scripts/discord-chats-ordnen.mjs --anwenden   die Admin-Gespraeche verschieben
 *
 * Woran ein Admin-Gespraech zu erkennen ist: die erste Nachricht des Bots im Kanal hat den Titel, den lib/discord.ts dafuer
 * setzt ("About your VIP access request", "About your manager access request", "A message from CompHub"). Ein Ticket, das
 * jemand selbst im Support-Panel aufgemacht hat, bleibt unter Support. Verschoben wird ohne lock_permissions - die
 * Freigaben des Kanals (nur die Person, der Bot, die Admin-Rolle) bleiben genau, wie sie sind. Geloescht wird nichts.
 *
 * Bot-Token aus .env.local oder der Umgebung (DISCORD_BOT_TOKEN) - es laeuft als die CompHub-App, nie als Person.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
const ADMIN_TITEL = ['About your VIP access request', 'About your manager access request', 'A message from CompHub'];

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function ruf(weg, methode = 'GET', koerper) {
  if (methode !== 'GET' && !ANWENDEN) throw new Error(`Planmodus: ${methode} ${weg} nicht erlaubt`);
  for (let versuch = 0; versuch < 6; versuch += 1) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}),
        'X-Audit-Log-Reason': 'Move admin chats into Chats (scripts/discord-chats-ordnen.mjs)' },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await warte(Math.ceil((j.retry_after ?? 2) * 1000) + 250); continue; }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: zu oft gedrosselt`);
}
const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim();

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt (.env.local oder Umgebung).'); process.exit(1); }

const ich = await ruf('/users/@me');
console.log(`Bot: ${ich.username} (${ich.bot ? 'App-Konto' : 'KEIN Bot-Konto!'})`);
const kanaele = await ruf(`/guilds/${SERVER}/channels`);
const name = new Map(kanaele.map((k) => [k.id, k.name]));
const kinder = (id) => kanaele.filter((k) => k.parent_id === id).length;

console.log('\nKategorien (Kanaele darin, Discord erlaubt 50):');
for (const k of kanaele.filter((x) => x.type === 4).sort((a, b) => a.position - b.position)) {
  console.log(`  ${String(kinder(k.id)).padStart(2)}  ${k.name}`);
}
const chats = kanaele.filter((k) => k.type === 4 && /^chats( \d+)?$/.test(kern(k.name)));
console.log(`\nChats-Kategorien: ${chats.map((c) => `${c.name} (${kinder(c.id)}/50)`).join(', ') || 'keine'}`);

const tickets = kanaele.filter((k) => k.type === 0 && /^(m?ticket|chat)-/.test(k.name));
console.log(`\nTicket- und Chatkanaele: ${tickets.length}`);
const verschieben = [];
for (const t of tickets) {
  const inChats = chats.some((c) => c.id === t.parent_id);
  let titel = '';
  if (!inChats && /^m?ticket-/.test(t.name)) {
    // Die aeltesten Nachrichten (after=0): dort steht die Begruessung des Bots.
    const alt = await ruf(`/channels/${t.id}/messages?after=0&limit=5`).catch(() => []);
    const bot = (Array.isArray(alt) ? alt : []).filter((m) => m.author?.id === ich.id).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))[0];
    titel = bot?.embeds?.[0]?.title ?? '';
  }
  const admin = ADMIN_TITEL.includes(titel);
  console.log(`  ${t.name.padEnd(28)} unter ${String(name.get(t.parent_id) ?? '(keiner)').padEnd(16)} ${inChats ? 'ok' : admin ? `-> Chats (Admin-Gespraech: "${titel}")` : `bleibt (${titel || 'kein Bot-Titel'})`}`);
  if (!inChats && admin) verschieben.push(t);
}

if (!verschieben.length) { console.log('\nNichts zu verschieben.'); process.exit(0); }
if (!ANWENDEN) { console.log(`\nPlan: ${verschieben.length} Kanal/Kanaele nach Chats. Mit --anwenden ausfuehren.`); process.exit(0); }
const ziel = chats.find((c) => kinder(c.id) + verschieben.length <= 50) ?? chats.find((c) => kinder(c.id) < 50);
if (!ziel) {
  console.error('Keine Chats-Kategorie mit Platz - zuerst im Bot "Chat" druecken (legt sie an) oder aufraeumen.');
  process.exit(1);
}
for (const t of verschieben) {
  if (kinder(ziel.id) >= 50) { console.error(`${ziel.name} ist voll - Rest bleibt.`); break; }
  await ruf(`/channels/${t.id}`, 'PATCH', { parent_id: ziel.id, lock_permissions: false });
  t.parent_id = ziel.id;
  console.log(`  verschoben: #${t.name} -> ${ziel.name}`);
}
