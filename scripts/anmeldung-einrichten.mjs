#!/usr/bin/env node
/*
 * Die Anmeldung auf ein eigenes Supabase-Projekt legen - einmal starten.
 *
 * Der Betreiber, nachdem "Comphub 2" am 24.9.2026 zweimal stillstand und mit
 * ihm das Einloggen: "ich hab einen dritten Account Supabase, benutze den,
 * wenn es was nuetzt, komplett nur fuer das Login-System."
 *
 * Vorher in .env.local eintragen (Supabase -> Projekt -> Settings -> API):
 *   SUPABASE_LOGIN_URL=https://<projekt>.supabase.co
 *   SUPABASE_LOGIN_SERVICE_ROLE_KEY=<service_role- oder sb_secret-Schluessel>
 *
 * Dann:  node scripts/anmeldung-einrichten.mjs
 *
 * Was es tut:
 *   1. legt im neuen Projekt den privaten Eimer "anmeldung" an (kein SQL);
 *   2. kopiert konten.json und vip-users.json aus "Comphub 2" dorthin und
 *      prueft die Kopie Byte fuer Byte. Liegen dort schon welche, bleiben
 *      sie stehen - sie sind dann die neueren (erst --ueberschreiben ersetzt);
 *   3. traegt die beiden Werte bei Vercel ein und rollt die Seite neu aus.
 *
 * Antwortet "Comphub 2" nicht, bricht es ab. Mit --lokal nimmt es statt
 * dessen die Kopien auf diesem Rechner (data/) - die koennen aelter sein,
 * das Skript sagt, von wann.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJEKT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATEIEN = ['konten.json', 'vip-users.json'];
const EIMER = 'anmeldung';
const args = process.argv.slice(2);
const lokal = args.includes('--lokal');
const ueberschreiben = args.includes('--ueberschreiben');

const env = {};
for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = z.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const LOGIN_URL = (env.SUPABASE_LOGIN_URL ?? '').replace(/\/+$/, '');
const LOGIN_KEY = env.SUPABASE_LOGIN_SERVICE_ROLE_KEY ?? '';
const HAUPT_URL = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const HAUPT_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const kopf = (key) => (key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` });
const summe = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const stopp = (text) => { console.error(`\n  ${text}\n`); process.exit(1); };

if (!LOGIN_URL || !LOGIN_KEY) {
  stopp('In .env.local fehlen SUPABASE_LOGIN_URL und/oder SUPABASE_LOGIN_SERVICE_ROLE_KEY.\n'
    + '  Beides steht im neuen Supabase-Projekt unter Settings -> API\n'
    + '  ("Project URL" und der service_role- bzw. Secret-Schluessel).');
}
if (LOGIN_URL === HAUPT_URL) stopp('SUPABASE_LOGIN_URL ist dasselbe Projekt wie SUPABASE_URL - das soll ein eigenes sein.');

console.log('\n  Anmeldung auf eigenes Supabase-Projekt legen');
console.log(`  Ziel: ${LOGIN_URL}\n`);

// 1. Der Eimer
const eimer = await fetch(`${LOGIN_URL}/storage/v1/bucket/${EIMER}`, { headers: kopf(LOGIN_KEY) });
if (eimer.status === 200) {
  console.log(`  Eimer "${EIMER}" ist schon da.`);
} else {
  const r = await fetch(`${LOGIN_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { ...kopf(LOGIN_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: EIMER, name: EIMER, public: false }),
  });
  if (!r.ok) stopp(`Eimer anlegen ging nicht (${r.status}): ${(await r.text()).slice(0, 200)}`);
  console.log(`  Eimer "${EIMER}" angelegt (privat).`);
}

// 2. Die Dateien
for (const name of DATEIEN) {
  const ziel = `${LOGIN_URL}/storage/v1/object/${EIMER}/${name}`;
  const schonDa = await fetch(`${LOGIN_URL}/storage/v1/object/info/${EIMER}/${name}`, { headers: kopf(LOGIN_KEY) });
  if (schonDa.ok && !ueberschreiben) {
    console.log(`  ${name}: liegt schon im neuen Projekt - bleibt (neuer als jede Kopie). --ueberschreiben ersetzt es.`);
    continue;
  }

  let inhalt = null;
  try {
    const r = await fetch(`${HAUPT_URL}/rest/v1/ablage?name=eq.${encodeURIComponent(name)}&select=wert`,
      { headers: kopf(HAUPT_KEY), signal: AbortSignal.timeout(20_000) });
    if (r.ok) {
      const zeilen = await r.json();
      if (zeilen.length) inhalt = Buffer.from(zeilen[0].wert, 'utf8');
    }
  } catch { /* unten entschieden */ }

  if (!inhalt) {
    if (!lokal) {
      stopp(`${name}: "Comphub 2" antwortet nicht. Erst dort neu starten und dieses Skript noch einmal\n`
        + '  starten - oder mit --lokal die Kopie auf diesem Rechner nehmen.');
    }
    const datei = path.join(PROJEKT, 'data', name);
    inhalt = fs.readFileSync(datei);
    console.log(`  ${name}: aus der lokalen Kopie vom ${fs.statSync(datei).mtime.toLocaleString('de-DE')} (kann aelter sein).`);
  } else {
    console.log(`  ${name}: aus "Comphub 2" geholt.`);
  }
  JSON.parse(inhalt.toString('utf8'));   // nur gueltiges JSON wandert hinueber

  const w = await fetch(ziel, {
    method: 'POST',
    headers: { ...kopf(LOGIN_KEY), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: inhalt,
  });
  if (!w.ok) stopp(`${name} schreiben ging nicht (${w.status}): ${(await w.text()).slice(0, 200)}`);
  const zurueck = Buffer.from(await (await fetch(ziel, { headers: kopf(LOGIN_KEY) })).arrayBuffer());
  if (summe(zurueck) !== summe(inhalt)) stopp(`${name}: die Kopie weicht ab - abgebrochen.`);
  console.log(`  ${name}: kopiert und geprueft (${inhalt.length} Bytes, ${summe(inhalt)}).`);
}

// 3. Vercel
if (args.includes('--ohne-vercel')) {
  console.log('\n  Vercel uebersprungen (--ohne-vercel).\n');
  process.exit(0);
}
const vercel = (...a) => spawnSync('vercel', a, { cwd: PROJEKT, shell: true, encoding: 'utf8' });
for (const [name, wert] of [['SUPABASE_LOGIN_URL', LOGIN_URL], ['SUPABASE_LOGIN_SERVICE_ROLE_KEY', LOGIN_KEY]]) {
  vercel('env', 'rm', name, 'production', '-y');
  const r = spawnSync('vercel', ['env', 'add', name, 'production'], { cwd: PROJEKT, shell: true, input: wert, encoding: 'utf8' });
  if (r.status !== 0) stopp(`Vercel: ${name} eintragen ging nicht:\n${(r.stderr || r.stdout).slice(0, 300)}`);
  console.log(`  Vercel: ${name} eingetragen.`);
}
const neu = vercel('redeploy', 'https://www.thecomphub.com', '--target', 'production');
console.log(neu.status === 0
  ? '  Vercel: Seite wird neu ausgerollt - in ein, zwei Minuten laeuft die Anmeldung ueber das neue Projekt.'
  : '  Vercel: Neu ausrollen ging nicht von hier - der naechste Push erledigt es.');
console.log('\n  Fertig.\n');
