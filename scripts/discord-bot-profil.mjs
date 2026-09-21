/*
 * Das Profil des CompHub-Bots bei Discord: Banner, Beschreibung, Schlagworte.
 *
 * Der Betreiber: "mach mal Discord Banner + Infos mit meiner Seite, dass das
 * der Bot ist, und Discord-Invite-Link usw., einfach professionell."
 *
 * Zwei Stellen fuehren das Profil:
 *   - der Bot-Nutzer (PATCH /users/@me): Banner, Profilbild, Name
 *   - die Anwendung (PATCH /applications/@me): die Beschreibung, die im
 *     Profil unter "Bio" steht, und die Schlagworte
 *
 * Das Banner baut scripts/discord-banner-bauen.py (data/discord/banner.png).
 * Der Einladungslink kommt von der Seite selbst (/api/discord/einladung),
 * damit hier derselbe steht wie auf der Startseite.
 *
 *   node scripts/discord-bot-profil.mjs            Banner und Beschreibung setzen
 *   node scripts/discord-bot-profil.mjs --zeigen   nur anzeigen, was gerade steht
 *
 * Der Bot-Token kommt aus .env.local (DISCORD_BOT_TOKEN). Kein process.exit:
 * Node 24 unter Windows meldet sonst nach einem fetch eine Assertion.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const BANNER = path.join(PROJEKT, 'data', 'discord', 'banner.png');
const API = 'https://discord.com/api/v10';
const SEITE = 'https://www.thecomphub.com';

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
const nurZeigen = process.argv.includes('--zeigen');

async function ruf(weg, methode = 'GET', koerper) {
  const r = await fetch(`${API}${weg}`, {
    method: methode,
    headers: { Authorization: `Bot ${TOKEN}`, ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    ...(koerper ? { body: JSON.stringify(koerper) } : {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function einladung() {
  try {
    const r = await fetch(`${SEITE}/api/discord/einladung`, { signal: AbortSignal.timeout(15_000) });
    const j = await r.json();
    if (typeof j?.url === 'string' && j.url.startsWith('https://discord.gg/')) return j.url;
  } catch { /* unten der Rueckfall */ }
  return U.DISCORD_EINLADUNG || '';
}

/*
 * Die Beschreibung - Discord zeigt sie im Profil des Bots unter "Bio"
 * (hoechstens 400 Zeichen). Englisch wie die Seite. Was der Bot tut, wo
 * die Seite ist, wie man in den Discord kommt.
 */
function beschreibung(link) {
  return [
    'Official bot of CompHub, the home of Fortnite competitive: stats, tournaments, live leaderboards and rankings.',
    `Website: ${SEITE.replace('https://www.', '')}`,
    link ? `Discord: ${link.replace('https://', '')}` : null,
    'I post updates, run Get Access for VIP and manager keys and keep the admin channels current.',
  ].filter(Boolean).join('\n').slice(0, 400);
}

async function main() {
  if (!TOKEN) { console.log('DISCORD_BOT_TOKEN fehlt in .env.local.'); return; }
  const ich = await ruf('/users/@me');
  const app = await ruf('/applications/@me');
  console.log(`  Bot: ${ich.username}#${ich.discriminator} (${ich.id})`);
  console.log(`  Banner: ${ich.banner ? 'gesetzt' : 'keins'} · Beschreibung: ${app.description ? JSON.stringify(app.description).slice(0, 120) : 'keine'}`);
  console.log(`  Schlagworte: ${(app.tags ?? []).join(', ') || 'keine'}`);
  if (nurZeigen) return;

  const link = await einladung();
  if (!link) console.log('  Kein Einladungslink gefunden - Beschreibung ohne Link.');

  // Das Banner - als Data-URI, wie Discord es fuer Bilder verlangt.
  if (fs.existsSync(BANNER)) {
    const daten = fs.readFileSync(BANNER);
    if (daten.length > 10 * 1024 * 1024) throw new Error('Banner groesser als 10 MB');
    await ruf('/users/@me', 'PATCH', { banner: `data:image/png;base64,${daten.toString('base64')}` });
    console.log(`  Banner gesetzt (${Math.round(daten.length / 1024)} KB).`);
  } else {
    console.log(`  Kein Banner unter ${path.relative(PROJEKT, BANNER)} - erst scripts/discord-banner-bauen.py laufen lassen.`);
  }

  // Beschreibung und Schlagworte der Anwendung.
  const text = beschreibung(link);
  await ruf('/applications/@me', 'PATCH', {
    description: text,
    tags: ['Fortnite', 'Esports', 'Stats', 'Tournaments', 'Leaderboards'],
  });
  console.log('  Beschreibung gesetzt:');
  for (const zeile of text.split('\n')) console.log(`    ${zeile}`);
}

main().catch((e) => console.log(`Fehlgeschlagen: ${e.message}`));
