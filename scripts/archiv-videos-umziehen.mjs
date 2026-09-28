// Hochgeladene Archiv-Videos vom Objektspeicher ans Release legen.
//
// Im Admin-Archiv laesst sich ein Video als Datei hochladen (app/api/galerie,
// aktion video-datei). Es landet zuerst im Objektspeicher von Supabase - dort
// darf es nicht bleiben: das kostenlose Kontingent hat ein Gigabyte Platz und
// fuenf Gigabyte Datenverkehr im Monat, und ein Video, das hundertmal
// angesehen wird, brauchte das allein auf. Am GitHub-Release "archiv-videos"
// gibt es kein solches Kontingent.
//
// Dieser Lauf (stuendlich, .github/workflows/daten-erneuern.yml):
//   1. sucht in galerie.json Eintraege mit "videoDatei" und ohne "url",
//   2. holt die Datei, legt sie ans Release,
//   3. setzt "url", nimmt "ausstehend" weg (frisch gelesen, damit keine
//      Aenderung aus der Zwischenzeit verlorengeht),
//   4. loescht die Datei im Objektspeicher.
// Ein Eintrag, dessen Datei nach einem Tag noch fehlt (Hochladen
// abgebrochen), wird entfernt.
//
//   node scripts/archiv-videos-umziehen.mjs [--probe]

import fs from 'node:fs';

const probe = process.argv.includes('--probe');
const env = { ...process.env };
try {
  for (const z of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = z.indexOf('=');
    if (i > 0 && !z.startsWith('#') && !env[z.slice(0, i).trim()]) env[z.slice(0, i).trim()] = z.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
} catch { /* nur Umgebung */ }

const SB = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
const GH = env.GITHUB_TOKEN || '';
const REPO = env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const TAG = 'archiv-videos';
if (!SB || !KEY || !GH) { console.log('Supabase oder GitHub nicht eingerichtet - nichts zu tun.'); process.exit(0); }
const sbKopf = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const ghKopf = { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-archiv' };

async function liesGalerie() {
  const r = await fetch(`${SB}/rest/v1/ablage?name=eq.galerie.json&select=wert`, { headers: sbKopf });
  if (!r.ok) throw new Error(`galerie.json lesen: ${r.status}`);
  const z = await r.json();
  return z.length ? JSON.parse(z[0].wert) : { events: [], eintraege: [] };
}
async function schreibGalerie(g) {
  const r = await fetch(`${SB}/rest/v1/ablage`, {
    method: 'POST',
    headers: { ...sbKopf, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ name: 'galerie.json', wert: JSON.stringify(g, null, 1) }),
  });
  if (!r.ok) throw new Error(`galerie.json schreiben: ${r.status} ${await r.text()}`);
}

const g = await liesGalerie();
const offen = g.eintraege.filter((e) => e.videoDatei && !e.url);
console.log(`ausstehende Videos: ${offen.length}`);
if (!offen.length || probe) process.exit(0);

const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers: ghKopf })).json();
if (!rel?.id) { console.log(`Release ${TAG} fehlt`); process.exit(1); }

const erledigt = new Map(); const weg = new Set(); const aufraeumen = [];
for (const e of offen) {
  const r = await fetch(`${SB}/storage/v1/object/comphub/${e.videoDatei}`, { headers: sbKopf });
  if (!r.ok) {
    if (Date.now() - (e.erstellt ?? 0) > 24 * 3600_000) { weg.add(e.id); console.log(`  ${e.id}: Datei fehlt seit ueber einem Tag - Eintrag entfernt`); }
    else console.log(`  ${e.id}: Datei noch nicht da (${r.status})`);
    continue;
  }
  const daten = Buffer.from(await r.arrayBuffer());
  const ext = (e.videoDatei.split('.').pop() || 'mp4').toLowerCase();
  const name = `archiv-${e.id}.${ext}`;
  const hoch = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { ...ghKopf, 'Content-Type': 'application/octet-stream' }, body: daten,
  });
  const j = await hoch.json().catch(() => ({}));
  if (!hoch.ok || !j.browser_download_url) { console.log(`  ${e.id}: ans Release gescheitert (${hoch.status})`); continue; }
  erledigt.set(e.id, j.browser_download_url);
  aufraeumen.push(e.videoDatei);
  console.log(`  ${e.id}: ${(daten.length / 1e6).toFixed(1)} MB -> ${name}`);
}

if (erledigt.size || weg.size) {
  // Frisch lesen - der Admin kann in der Zwischenzeit Titel oder Spieler geaendert haben.
  const frisch = await liesGalerie();
  frisch.eintraege = frisch.eintraege.filter((e) => !weg.has(e.id)).map((e) => {
    const url = erledigt.get(e.id);
    if (!url) return e;
    const { videoDatei, ausstehend, ...rest } = e; // eslint-disable-line no-unused-vars
    return { ...rest, url };
  });
  await schreibGalerie(frisch);
  for (const d of aufraeumen) {
    await fetch(`${SB}/storage/v1/object/comphub/${d}`, { method: 'DELETE', headers: sbKopf });
  }
}
console.log(`umgezogen ${erledigt.size}, entfernt ${weg.size}`);
