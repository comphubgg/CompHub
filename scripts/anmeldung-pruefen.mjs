// Die Anmelde-Rueckwege pruefen, ohne dass sich jemand anmeldet (Betreiber, 29.10.2026: "du musst die Callbacks immer wieder testen").
//
// 1. Der Hinweg: /api/auth/<dienst>/authorize auf der Seite und auf der Netlify-Ersatzseite muss mit dem Rueckweg https://www.thecomphub.com/... zum
//    Dienst schicken.
// 2. Der Tausch: mit einem absichtlich falschen Code beim Dienst nachfragen. Ein eingetragener Rueckweg ergibt "Code ungueltig" (invalid_grant), ein
//    nicht eingetragener "redirect_uri passt nicht" - so sieht man, ob der Dienst unseren Rueckweg kennt. Geheimnisse werden nie ausgegeben.
//
//   node scripts/anmeldung-pruefen.mjs            Bericht
//   node scripts/anmeldung-pruefen.mjs --discord  bei Fehlern nach #admin-alarm

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = { ...process.env };
try {
  for (const z of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = z.indexOf('=');
    if (i > 0 && !z.startsWith('#') && !env[z.slice(0, i).trim()]) env[z.slice(0, i).trim()] = z.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
} catch { /* nur Umgebung */ }
// Wie lib/dienstZugaenge (holeDienst): unter /admin/services Eingetragenes schlaegt die Umgebung.
try {
  const eingetragen = JSON.parse(fs.readFileSync('data/dienst-zugaenge.json', 'utf8'));
  for (const [d, v] of Object.entries(eingetragen)) {
    if (v?.id && v?.secret) { env[`${d.toUpperCase()}_CLIENT_ID`] = v.id; env[`${d.toUpperCase()}_CLIENT_SECRET`] = v.secret; }
  }
} catch { /* keine eingetragenen */ }

const SEITEN = ['https://www.thecomphub.com', 'https://lambent-moxie-2dc34a.netlify.app'];
const DIENSTE = ['twitch', 'discord', 'google', 'epic'];
// Twitch, Google und Discord kennen nur den Rueckweg ohne www (lib/oeffentlicheAdresse, EINGETRAGEN).
const OHNE_WWW = ['twitch', 'google', 'discord'];
const RUECK = (d) => `https://${OHNE_WWW.includes(d) ? '' : 'www.'}thecomphub.com/api/auth/${d}/callback`;
const probleme = [];

for (const seite of SEITEN) {
  for (const d of DIENSTE) {
    try {
      const r = await fetch(`${seite}/api/auth/${d}/authorize`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
      const ziel = r.headers.get('location') ?? '';
      const ru = new URL(ziel, seite).searchParams.get('redirect_uri');
      const ok = ru === RUECK(d);
      console.log(`${ok ? 'ok  ' : 'FEHL'} Hinweg ${d.padEnd(8)} ${seite.replace('https://', '')}: ${ru ?? `HTTP ${r.status}`}`);
      if (!ok) probleme.push(`${d} auf ${seite.replace('https://', '')}: Rueckweg ${ru ?? `HTTP ${r.status}`}`);
    } catch (e) { console.log(`FEHL Hinweg ${d} ${seite}: ${e.message}`); probleme.push(`${d} auf ${seite}: nicht erreichbar`); }
  }
}

// Der Tausch mit falschem Code - was sagt der Dienst zu unserem Rueckweg?
async function tausch(d, url, felder, kopf = {}) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...kopf }, body: new URLSearchParams(felder), signal: AbortSignal.timeout(20_000) });
    const t = (await r.text()).slice(0, 300);
    const passt = /redirect|mismatch/i.test(t) && !/invalid.?grant|authorization code|invalid code/i.test(t);
    console.log(`${passt ? 'FEHL' : 'ok  '} Tausch  ${d.padEnd(8)} HTTP ${r.status}: ${t.replace(/\s+/g, ' ').slice(0, 140)}`);
    if (passt) probleme.push(`${d}: der Dienst kennt den Rueckweg ${RUECK(d)} nicht`);
  } catch (e) { console.log(`?    Tausch  ${d}: ${e.message}`); }
}
if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
  await tausch('twitch', 'https://id.twitch.tv/oauth2/token', { client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, code: 'pruefung', grant_type: 'authorization_code', redirect_uri: RUECK('twitch') });
}
if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
  await tausch('discord', 'https://discord.com/api/oauth2/token', { client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, code: 'pruefung', grant_type: 'authorization_code', redirect_uri: RUECK('discord') });
}
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  await tausch('google', 'https://oauth2.googleapis.com/token', { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: 'pruefung', grant_type: 'authorization_code', redirect_uri: RUECK('google') });
}

console.log(probleme.length ? `\n${probleme.length} Problem(e)` : '\nAlles in Ordnung');
try {
  const r = await fetch(`https://www.thecomphub.com/api/auth/google/authorize`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const g = await fetch(r.headers.get('location') ?? '', { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const weiter = g.headers.get('location') ?? '';
  const fehler = /oauth\/error|authError/i.test(weiter);
  console.log(`${fehler ? 'FEHL' : 'ok  '} Google-Seite: ${fehler ? 'Fehlerseite (Rueckweg nicht eingetragen)' : 'Kontoauswahl'}`);
  if (fehler) probleme.push('google: Google zeigt redirect_uri_mismatch');
} catch (e) { console.log(`?    Google-Seite: ${e.message}`); }

if (probleme.length && process.argv.includes('--discord')) {
  try {
    execFileSync('node', ['scripts/discord-update.mjs', '--ziel', 'alarm', '--art', 'behoben', '--titel', 'Anmeldung gestoert', '--text', probleme.join('\n')], { stdio: 'inherit' });
  } catch { /* Bericht ist zweitrangig */ }
}
