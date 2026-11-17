// Alle Daten einer Quelle loeschen, deren Betreiber jede Nutzung untersagt hat (17.11.2026) - einmalig, vom Betreiber angestossen
// (.github/workflows/fremdquelle-loeschen.yml, nur workflow_dispatch). Siehe scripts/fremdquellen-sperre.mjs fuer die Sperre im Code.
//
// Geloescht wird:
//   GitHub-Releases   daten-szene, daten-szene-s42 (sein Archiv der Spieltage, ganz)
//   Anhaenge          szene-quelle__* und szene-stats__* in jedem Release (seine Spielerliste und Spieltage)
//                     medien/fremd-ansehen.tar, medien/referenz-replay.tar (Aufnahmen seiner Seite)
//                     aus seinen Daten Gerechnetes: antworten__szene_*, antworten__center_*, antworten__laender_*,
//                     antworten__tierlist_trios_auto*, lan-konten.json, alle Akten (daten-akten) - der Stundenlauf rechnet sie aus eigenen
//                     Daten neu (daten-erneuern.yml)
//   Sicherungen       daten-sicherung/*.tar.gz: spieler-namen.json und spielerbilder.json (aus seinen Daten gebaut) werden aus jedem Archiv entfernt
//   Actions-Caches    alle (der Datenordner im Zwischenspeicher trug sein Archiv)
//   Supabase          Objekte und Tabellenzeilen unter szene-stats/, szene-quelle/, antworten/szene_*, akten/, fotos-eingang.json
//
//   node scripts/fremdquelle-loeschen.mjs [--probe]     --probe zeigt nur, was geloescht wuerde
//
// Braucht GITHUB_TOKEN (contents: write, actions: write) und fuer Supabase SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (sonst wird Supabase uebersprungen).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Die Schluessel wie im Stundenlauf aus .env.local (secrets.ENV_LOCAL), falls sie nicht schon in der Umgebung stehen.
try {
  for (const z of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(z);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ohne .env.local */ }

const PROBE = process.argv.includes('--probe');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const API = `https://api.github.com/repos/${REPO}`;
const kopf = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

const RELEASES_GANZ = ['daten-szene', 'daten-szene-s42', 'daten-szene-s43', 'daten-szene-s44'];
const ANHANG = [
  /^szene-quelle__/, /^szene-stats__/,
  /^antworten__szene_/, /^antworten__center_/, /^antworten__laender_/, /^antworten__tierlist_trios_auto/,
  /^lan-konten\.json$/, /^fotos-eingang\.json$/, /^fehlende-bilder\.txt$/, /^bekannte-ohne-foto\.txt$/,
];
const ANHANG_JE_RELEASE = { medien: [/^fremd-ansehen\.tar$/, /^referenz-replay\.tar$/], 'daten-akten': [/./] };
const SICHERUNG_RAUS = ['spieler-namen.json', 'spielerbilder.json', 'fotos-eingang.json', 'fehlende-bilder.txt', 'bekannte-ohne-foto.txt'];

let geloescht = 0;
const log = (...a) => console.log(...a);

async function gh(pfad, opt = {}) {
  const r = await fetch(pfad.startsWith('http') ? pfad : `${API}${pfad}`, { ...opt, headers: { ...kopf, ...(opt.headers ?? {}) } });
  if (r.status === 204) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(`${opt.method ?? 'GET'} ${pfad}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function alleReleases() {
  const raus = [];
  for (let seite = 1; seite < 50; seite += 1) {
    const l = await gh(`/releases?per_page=100&page=${seite}`);
    raus.push(...l);
    if (l.length < 100) break;
  }
  return raus;
}

async function alleAnhaenge(rel) {
  const raus = [];
  for (let seite = 1; seite < 30; seite += 1) {
    const l = await gh(`/releases/${rel.id}/assets?per_page=100&page=${seite}`);
    raus.push(...l);
    if (l.length < 100) break;
  }
  return raus;
}

async function loescheAnhang(rel, a) {
  log(`  Anhang ${rel.tag_name}/${a.name} (${a.size} B)`);
  if (PROBE) return;
  await gh(`/releases/assets/${a.id}`, { method: 'DELETE' });
  geloescht += 1;
}

async function sicherungenSaeubern(rel) {
  for (const a of await alleAnhaenge(rel)) {
    if (!a.name.endsWith('.tar.gz')) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sich-'));
    const datei = path.join(dir, a.name);
    const r = await fetch(a.url, { headers: { ...kopf, Accept: 'application/octet-stream' } });
    if (!r.ok) { log(`  ${a.name}: Download ${r.status}`); continue; }
    fs.writeFileSync(datei, Buffer.from(await r.arrayBuffer()));
    const liste = execFileSync('tar', ['tzf', datei], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const raus = liste.filter((n) => SICHERUNG_RAUS.includes(path.basename(n)));
    if (!raus.length) continue;
    log(`  Sicherung ${a.name}: ohne ${raus.join(', ')}`);
    if (PROBE) continue;
    const aus = path.join(dir, 'x'); fs.mkdirSync(aus);
    execFileSync('tar', ['xzf', datei, '-C', aus]);
    for (const n of raus) fs.rmSync(path.join(aus, n), { force: true });
    const neu = path.join(dir, 'neu.tar.gz');
    execFileSync('tar', ['czf', neu, '-C', aus, '.']);
    // Erst die neue Fassung daneben, dann die alte weg und die neue umbenennen - so geht keine Sicherung verloren.
    const hoch = `https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(`${a.name}.neu`)}`;
    const neuAnhang = await gh(hoch, { method: 'POST', body: fs.readFileSync(neu), headers: { 'Content-Type': 'application/gzip' } });
    await gh(`/releases/assets/${a.id}`, { method: 'DELETE' });
    await gh(`/releases/assets/${neuAnhang.id}`, { method: 'PATCH', body: JSON.stringify({ name: a.name }), headers: { 'Content-Type': 'application/json' } });
    geloescht += 1;
  }
}

async function github() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN fehlt');
  const releases = await alleReleases();
  for (const rel of releases) {
    if (RELEASES_GANZ.includes(rel.tag_name)) {
      log(`Release ${rel.tag_name} ganz (${rel.assets?.length ?? '?'} Anhaenge)`);
      if (!PROBE) {
        await gh(`/releases/${rel.id}`, { method: 'DELETE' });
        await gh(`/git/refs/tags/${encodeURIComponent(rel.tag_name)}`, { method: 'DELETE' }).catch(() => null);
        geloescht += 1;
      }
      continue;
    }
    if (rel.tag_name === 'daten-sicherung') { await sicherungenSaeubern(rel); continue; }
    const muster = [...ANHANG, ...(ANHANG_JE_RELEASE[rel.tag_name] ?? [])];
    const treffer = (await alleAnhaenge(rel)).filter((a) => muster.some((m) => m.test(a.name)));
    if (treffer.length) log(`Release ${rel.tag_name}: ${treffer.length} Anhaenge`);
    for (const a of treffer) await loescheAnhang(rel, a);
  }
  // Die Zwischenspeicher der Ablaeufe - der Datenordner darin trug sein Archiv.
  for (let runde = 0; runde < 20; runde += 1) {
    const c = await gh('/actions/caches?per_page=100');
    const liste = c?.actions_caches ?? [];
    if (!liste.length) break;
    log(`Actions-Caches: ${liste.length}`);
    if (PROBE) break;
    for (const x of liste) { await gh(`/actions/caches/${x.id}`, { method: 'DELETE' }).catch((e) => log(`  ${x.key}: ${e.message}`)); geloescht += 1; }
  }
}

async function supabase() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) { log('Supabase: kein Zugang - uebersprungen'); return; }
  const k = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const EIMER = 'comphub';
  const PRAEFIXE = ['szene-stats/', 'szene-quelle/', 'antworten/szene_', 'akten/', 'fotos-eingang.json'];
  // Objektspeicher: rekursiv auflisten (Ordner haben kein "id").
  const objekte = [];
  const liste = async (ordner) => {
    for (let offset = 0; ; offset += 1000) {
      const r = await fetch(`${url}/storage/v1/object/list/${EIMER}`, { method: 'POST', headers: k, body: JSON.stringify({ prefix: ordner, limit: 1000, offset }) });
      if (!r.ok) { log(`  Liste ${ordner}: ${r.status}`); return; }
      const l = await r.json();
      for (const x of l) {
        const voll = `${ordner}${ordner && !ordner.endsWith('/') ? '/' : ''}${x.name}`;
        if (x.id == null) await liste(voll); else objekte.push(voll);
      }
      if (l.length < 1000) return;
    }
  };
  for (const p of ['szene-stats', 'szene-quelle', 'akten']) await liste(p);
  await liste('antworten');
  const weg = objekte.filter((o) => PRAEFIXE.some((p) => o.startsWith(p)));
  log(`Supabase-Objekte: ${weg.length}`);
  if (!PROBE) {
    for (let i = 0; i < weg.length; i += 500) {
      const r = await fetch(`${url}/storage/v1/object/${EIMER}`, { method: 'DELETE', headers: k, body: JSON.stringify({ prefixes: weg.slice(i, i + 500) }) });
      if (!r.ok) log(`  Loeschen: ${r.status} ${await r.text()}`); else geloescht += Math.min(500, weg.length - i);
    }
  }
  // Tabelle "ablage" (kleine Dateien).
  for (const p of PRAEFIXE) {
    const filter = `name=like.${encodeURIComponent(`${p}*`)}`;
    const r = await fetch(`${url}/rest/v1/ablage?select=name&${filter}`, { headers: k });
    const zeilen = r.ok ? await r.json() : [];
    log(`Supabase-Zeilen ${p}*: ${zeilen.length}`);
    if (!PROBE && zeilen.length) {
      const d = await fetch(`${url}/rest/v1/ablage?${filter}`, { method: 'DELETE', headers: { ...k, Prefer: 'return=minimal' } });
      if (!d.ok) log(`  Loeschen: ${d.status} ${await d.text()}`); else geloescht += zeilen.length;
    }
  }
}

try {
  await github();
} catch (e) { console.error(`GitHub: ${e.message}`); process.exitCode = 1; }
try {
  await supabase();
} catch (e) { console.error(`Supabase: ${e.message}`); process.exitCode = 1; }
log(PROBE ? 'Probe - nichts geloescht.' : `Geloescht/ersetzt: ${geloescht}`);
