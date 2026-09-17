// Die zweite Ablage fuellen: Dateien des Laufrechners an ein GitHub-Release.
//
// Gegenstueck zu lib/ablageGithub.ts. Alles, was der Laufrechner erzeugt
// (fertige Antworten, Akten, Spieltage, Werte der Szene, Tabellen), kommt
// als Anhang an das Release "daten" des Projekts. Die Seite liest es von
// dort, wenn Supabase nicht antwortet - und die Antworten und Akten sogar
// zuerst von dort. Supabase bleibt die Zweitkopie; hier wird nichts dort
// geloescht.
//
//   node scripts/ablage-github.mjs                    alles, was sich geaendert hat
//   node scripts/ablage-github.mjs --nur antworten    nur ein Ordner (mehrfach moeglich)
//   node scripts/ablage-github.mjs --neuer-als 120    nur Dateien der letzten 120 Minuten
//   node scripts/ablage-github.mjs --probe            zeigen, nicht uebertragen
//
// Geaendert heisst: die Pruefsumme weicht von der im Manifest ab, das als
// eigener Anhang ("manifest.json") am Release liegt. Akten werden in 256
// Buendel nach den ersten zwei Zeichen der Konto-Id gepackt (siehe
// lib/ablageGithub), ein Buendel wird nur hochgeladen, wenn sich darin
// etwas geaendert hat.
//
// Zugang: GITHUB_TOKEN aus der Umgebung oder .env.local (auf dem Laufrechner
// das Token des Auftrags). Rate: 5000 Anfragen je Stunde; ein Anhang kostet
// zwei (loeschen, hochladen), ein Lauf mit ein paar hundert Aenderungen
// bleibt weit darunter.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROJEKT = process.cwd();
const DATEN = path.join(PROJEKT, 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const TAG = process.env.COMPHUB_GITHUB_TAG || 'daten';
const API = 'https://api.github.com';
const GLEICHZEITIG = 4;

/* ------------------------------------------------------------ Aufruf */

const argumente = process.argv.slice(2);
const wert = (name) => { const i = argumente.indexOf(name); return i >= 0 ? argumente[i + 1] : undefined; };
const werte = (name) => argumente.flatMap((a, i) => (a === name && argumente[i + 1] ? [argumente[i + 1]] : []));
const nur = werte('--nur');
const neuerAls = Number(wert('--neuer-als') || 0);
const probe = argumente.includes('--probe');

function umgebung() {
  const raus = {};
  const datei = path.join(PROJEKT, '.env.local');
  if (fs.existsSync(datei)) {
    for (const zeile of fs.readFileSync(datei, 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^([A-Z_]+)=(.*)$/);
      if (m) raus[m[1]] = m[2].trim();
    }
  }
  return { ...raus, ...process.env };
}
const TOKEN = umgebung().GITHUB_TOKEN || umgebung().GH_TOKEN || '';
if (!TOKEN) { console.error('GITHUB_TOKEN fehlt (Umgebung oder .env.local).'); process.exit(1); }

const KOPF = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'comphub-ablage',
};

/* ------------------------------------------------------------ Regeln */

// Dieselben Regeln wie lib/ablageGithub.ts - was ans Release gehoert.
const AM_RELEASE = [
  /^antworten\/(?!catalog_)/,
  /^akten\//,
  /^epic-spieltage\//,
  /^platzierungen\//,
  /^szene-stats\//,
  /^szene-quelle\//,
  /^tournament-leaderboards\//,
  /^power-rankings\//,
  /^(verdienst-archiv|preisgeld-tabellen|preisgelder|lan-preisgelder|epic-namen|cup-archiv)\.json$/,
];
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');

function gewuenscht(name) {
  if (name.startsWith('.') || name.endsWith('.neu') || /\.\d+\.neu$/.test(name)) return false;
  if (!AM_RELEASE.some((m) => m.test(name))) return false;
  if (nur.length && !nur.some((n) => name === n || name.startsWith(`${n}/`))) return false;
  return true;
}

function sammle(ordner = '', raus = []) {
  let eintraege;
  try { eintraege = fs.readdirSync(path.join(DATEN, ordner), { withFileTypes: true }); } catch { return raus; }
  for (const e of eintraege) {
    const name = ordner ? `${ordner}/${e.name}` : e.name;
    if (e.isDirectory()) sammle(name, raus);
    else if (e.isFile()) raus.push(name);
  }
  return raus;
}

const pruefsumme = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 24);

/* ------------------------------------------------------------ GitHub */

async function api(pfad, init = {}, versuche = 3) {
  for (let v = 1; ; v++) {
    const r = await fetch(pfad.startsWith('http') ? pfad : `${API}${pfad}`, {
      ...init, headers: { ...KOPF, ...(init.headers || {}) }, signal: AbortSignal.timeout(120_000),
    });
    if (r.ok || r.status === 404 || v >= versuche) return r;
    // Sekundaere Rate-Grenze oder Wackler: kurz warten, noch einmal.
    const warte = r.status === 403 || r.status === 429 ? 30_000 : 3_000;
    await new Promise((res) => setTimeout(res, warte * v));
  }
}

async function releaseHolen() {
  let r = await api(`/repos/${REPO}/releases/tags/${TAG}`);
  if (r.status === 404) {
    r = await api(`/repos/${REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: TAG, target_commitish: 'main', name: 'Daten der Seite', prerelease: true,
        body: 'Second copy of the data the hourly run produces (answers, player files, match days). '
          + 'Read by the site when Supabase does not answer. Written by scripts/ablage-github.mjs. '
          + 'Not a software release.',
      }),
    });
  }
  if (!r.ok) throw new Error(`Release: ${r.status} ${await r.text()}`);
  return r.json();
}

async function anhaenge(releaseId) {
  const karte = new Map();
  for (let seite = 1; ; seite++) {
    const r = await api(`/repos/${REPO}/releases/${releaseId}/assets?per_page=100&page=${seite}`);
    if (!r.ok) throw new Error(`Anhaenge: ${r.status}`);
    const teil = await r.json();
    for (const a of teil) karte.set(a.name, a);
    if (teil.length < 100) break;
  }
  return karte;
}

async function anhangLesen(a) {
  const r = await fetch(a.browser_download_url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function hochladen(releaseId, vorhandene, name, daten) {
  const alt = vorhandene.get(name);
  if (alt) {
    const r = await api(`/repos/${REPO}/releases/assets/${alt.id}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`loeschen ${name}: ${r.status}`);
  }
  const r = await api(
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
                 'Content-Length': String(daten.length) },
      body: daten,
    });
  if (!r.ok) throw new Error(`hochladen ${name}: ${r.status} ${(await r.text()).slice(0, 600)}`);
  const neu = await r.json();
  vorhandene.set(name, neu);
}

/* ------------------------------------------------------------ Ablauf */

async function main() {
  const frisch = (name) => {
    if (!neuerAls) return true;
    const st = fs.statSync(path.join(DATEN, name));
    return Date.now() - st.mtimeMs < neuerAls * 60_000;
  };
  const alle = sammle().filter(gewuenscht);

  // Akten buendeln, alles andere einzeln.
  const einzeln = [];
  const buendel = new Map();
  for (const name of alle) {
    const m = name.match(/^akten\/([0-9a-f]{32})\.json$/i);
    if (m) {
      const k = `akten__${m[1].slice(0, 2).toLowerCase()}.json`;
      (buendel.get(k) ?? buendel.set(k, []).get(k)).push([m[1].toLowerCase(), name]);
    } else if (frisch(name)) {
      einzeln.push(name);
    }
  }

  const release = await releaseHolen();
  const vorhandene = await anhaenge(release.id);
  const manifestAlt = vorhandene.get('manifest.json')
    ? JSON.parse((await anhangLesen(vorhandene.get('manifest.json')))?.toString('utf8') || '{}') : {};
  const manifest = { ...manifestAlt };

  // Was hochgeladen wird: Name des Anhangs -> Bytes.
  const aufgaben = [];
  for (const name of einzeln) {
    const daten = fs.readFileSync(path.join(DATEN, name));
    const anhang = anhangName(name);
    const summe = pruefsumme(daten);
    if (manifestAlt[anhang]?.summe === summe && vorhandene.has(anhang)) continue;
    aufgaben.push({ anhang, daten, summe });
  }
  for (const [anhang, dateien] of buendel) {
    if (neuerAls && !dateien.some(([, name]) => frisch(name))) {
      if (vorhandene.has(anhang)) continue;
    }
    const inhalt = {};
    for (const [id, name] of dateien.sort((a, b) => a[0].localeCompare(b[0]))) {
      try { inhalt[id] = JSON.parse(fs.readFileSync(path.join(DATEN, name), 'utf8')); } catch { /* kaputt - weglassen */ }
    }
    const daten = Buffer.from(JSON.stringify(inhalt), 'utf8');
    const summe = pruefsumme(daten);
    if (manifestAlt[anhang]?.summe === summe && vorhandene.has(anhang)) continue;
    aufgaben.push({ anhang, daten, summe });
  }

  const umfang = aufgaben.reduce((s, a) => s + a.daten.length, 0);
  console.log('');
  console.log(`  Release   : ${REPO} #${TAG} (${vorhandene.size} Anhaenge vorhanden)`);
  console.log(`  Dateien   : ${alle.length} passend, ${aufgaben.length} zu uebertragen`);
  console.log(`  Umfang    : ${(umfang / 1024 / 1024).toFixed(1)} MB`);
  if (nur.length) console.log(`  Nur       : ${nur.join(', ')}`);
  if (neuerAls) console.log(`  Nur juenger als: ${neuerAls} Minuten`);
  console.log('');
  if (probe) {
    for (const a of aufgaben.slice(0, 40)) console.log(`    ${a.anhang} (${(a.daten.length / 1024).toFixed(0)} KB)`);
    if (aufgaben.length > 40) console.log(`    … und ${aufgaben.length - 40} weitere`);
    console.log('\n  Nur eine Probe - es wurde nichts uebertragen.\n');
    return;
  }

  let fertig = 0; let schief = 0; const fehler = [];
  let naechste = 0;
  const arbeiter = async () => {
    while (naechste < aufgaben.length) {
      const a = aufgaben[naechste++];
      try {
        await hochladen(release.id, vorhandene, a.anhang, a.daten);
        manifest[a.anhang] = { summe: a.summe, groesse: a.daten.length, zeit: new Date().toISOString() };
        fertig += 1;
      } catch (e) {
        schief += 1; fehler.push(`${a.anhang}: ${e.message}`);
      }
      process.stdout.write(`\r  ${String(fertig + schief).padStart(5)}/${aufgaben.length}  ${a.anhang.slice(0, 56).padEnd(56)}`);
    }
  };
  await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));

  if (fertig) {
    try {
      await hochladen(release.id, vorhandene, 'manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
    } catch (e) { fehler.push(`manifest.json: ${e.message}`); }
  }
  console.log('');
  console.log(`  Uebertragen : ${fertig}`);
  console.log(`  Gescheitert : ${schief}`);
  for (const f of fehler.slice(0, 20)) console.log(`    - ${f}`);
  console.log('');
  process.exit(schief ? 1 : 0);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
