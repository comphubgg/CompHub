/*
 * Der Ideen-Kanal: Vorschlaege fuer den Betreiber, er antwortet mit Ja oder Nein.
 *
 * Der Betreiber (1.10.2026): "mach auf DC ein Channel mit Ideen, wo du Ideen
 * schreibst, ich sag das ja oder nein." Jede Idee ist eine eigene Nachricht
 * mit Nummer, kurzer Begruendung und Aufwand; darunter haengen zwei Knoepfe
 * (Reaktionen) - Haken heisst bauen, Kreuz heisst nein. Er tippt nur einen an.
 *
 * Aufruf:
 *   node scripts/discord-ideen.mjs --neu --titel "..." --text "..." [--aufwand klein|mittel|gross]
 *   node scripts/discord-ideen.mjs --auswerten    # was ist angetippt, was ist offen
 *
 * Der Kanal #admin-ideen liegt in der Kategorie "Admin" und ist nur fuer
 * Betreiber und Bot sichtbar. Der Bot-Token kommt aus .env.local.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';
const KANAL = 'admin-ideen';
const JA = '✅';
const NEIN = '❌';

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
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt in .env.local.'); process.exit(1); }

const arg = (name, standard = '') => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? standard) : standard; };
const hat = (name) => process.argv.includes(name);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function ruf(weg, methode = 'GET', koerper) {
  for (let versuch = 0; versuch < 4; versuch++) {
    const r = await fetch(`${API}${weg}`, {
      method: methode,
      headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
      ...(koerper ? { body: JSON.stringify(koerper) } : {}),
    });
    if (r.status === 429) { // gedrosselt: so lange warten, wie Discord sagt
      const j = await r.json().catch(() => ({}));
      await warte(Math.ceil(((j.retry_after ?? 1) + 0.3) * 1000));
      continue;
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: dauernd gedrosselt`);
}

// Lesen, schreiben, Verlauf, Nachrichten verwalten, Reaktionen setzen.
const VOLLZUGRIFF = String(1024 + 2048 + 8192 + 65536 + 64);

async function kanalFinden() {
  const kanaele = await ruf(`/guilds/${SERVER}/channels`);
  const da = kanaele.find((k) => k.type === 0 && k.name.toLowerCase() === KANAL);
  if (da) return da.id;

  const rollen = await ruf(`/guilds/${SERVER}/roles`);
  const admin = rollen.find((r) => (BigInt(r.permissions) & 8n) === 8n && !r.managed)?.id ?? null;
  const ich = (await ruf('/users/@me')).id;
  let kategorie = kanaele.find((k) => k.type === 4 && k.name.toLowerCase() === 'admin')?.id ?? null;
  if (!kategorie) kategorie = (await ruf(`/guilds/${SERVER}/channels`, 'POST', { name: 'Admin', type: 4 })).id;

  // Fuer alle anderen unsichtbar; Betreiber-Rolle und Bot sehen und schreiben.
  const regeln = [{ id: SERVER, type: 0, allow: '0', deny: '1024' }, { id: ich, type: 1, allow: VOLLZUGRIFF, deny: '0' }];
  if (admin) regeln.push({ id: admin, type: 0, allow: VOLLZUGRIFF, deny: '0' });
  const neu = await ruf(`/guilds/${SERVER}/channels`, 'POST', {
    name: KANAL, type: 0, parent_id: kategorie, permission_overwrites: regeln,
    topic: `Ideen von Claude. ${JA} = bauen, ${NEIN} = nein. Einfach eine Reaktion antippen.`,
  });
  console.log(`  Kanal #${KANAL} angelegt.`);
  return neu.id;
}

const kanal = await kanalFinden();
const nummerAus = (m) => Number(/^IDEE (\d+) ·/.exec(m.embeds?.[0]?.title ?? '')?.[1] ?? 0);

async function alleIdeen() {
  const nachrichten = await ruf(`/channels/${kanal}/messages?limit=100`);
  return nachrichten.filter((m) => nummerAus(m) > 0).sort((a, b) => nummerAus(a) - nummerAus(b));
}

if (hat('--auswerten')) {
  const ideen = await alleIdeen();
  const rest = (await ruf(`/channels/${kanal}/messages?limit=100`)).filter((m) => !nummerAus(m) && !m.author?.bot);
  if (!ideen.length) console.log('  Noch keine Ideen im Kanal.');
  for (const m of ideen) {
    const zaehl = (emoji) => {
      const x = (m.reactions ?? []).find((r) => r.emoji?.name === emoji);
      return x ? x.count - (x.me ? 1 : 0) : 0; // die eigene Reaktion des Bots zaehlt nicht
    };
    const ja = zaehl(JA); const nein = zaehl(NEIN);
    const stand = ja && !nein ? 'JA' : nein && !ja ? 'NEIN' : ja && nein ? 'WIDERSPRUECHLICH' : 'offen';
    console.log(`  ${String(nummerAus(m)).padStart(3)}  ${stand.padEnd(7)}  ${m.embeds[0].title.replace(/^IDEE \d+ · /, '')}`);
  }
  if (rest.length) {
    console.log('\n  Antworten in Textform:');
    for (const m of rest.reverse()) console.log(`    - ${m.content.slice(0, 200)}`);
  }
} else if (hat('--neu')) {
  const titel = arg('--titel'); const text = arg('--text').replace(/\\n/g, '\n');
  if (!titel || !text) { console.error('--titel und --text sind noetig.'); process.exit(1); }
  const aufwand = arg('--aufwand', '');
  const nummer = Math.max(0, ...(await alleIdeen()).map(nummerAus)) + 1;
  const m = await ruf(`/channels/${kanal}/messages`, 'POST', {
    embeds: [{
      title: `IDEE ${nummer} · ${titel}`.slice(0, 256),
      description: text.slice(0, 3800),
      color: 0xa855f7,
      footer: { text: `${aufwand ? `Aufwand: ${aufwand} · ` : ''}Kostet nichts · ${JA} bauen   ${NEIN} nein` },
    }],
  });
  for (const e of [JA, NEIN]) {
    await warte(450);
    await ruf(`/channels/${kanal}/messages/${m.id}/reactions/${encodeURIComponent(e)}/@me`, 'PUT');
  }
  console.log(`  Idee ${nummer} in #${KANAL}: ${titel}`);
} else {
  console.error('Aufruf: --neu --titel ... --text ... [--aufwand ...]   oder   --auswerten');
  process.exit(1);
}
