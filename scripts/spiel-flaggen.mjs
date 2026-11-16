// Die Flagge, die jeder Spieler in Fortnite selbst gewaehlt hat, je Konto sammeln - data/power-rankings/spiel-flaggen.json (16.11.2026).
//
// Epic fuehrt sie in jeder Bestenliste als playerFlagTokens ("GroupIdentity_GeoIdentity_germany"): in der Weltrangliste (power-rankings-holen.mjs, global.json)
// und in jeder Turnier-Bestenliste. Diese Datei sammelt beides, damit Posts, Profile und Statistikseiten eine Flagge haben, wo kein Profil und keine Szene-Liste
// ein Land kennt - als Quelle "spiel" (lib/spielerFlagge.mjs: nach Profil und Szene-Liste, vor Noble).
//
//   node scripts/spiel-flaggen.mjs [--minuten 4] [--tage 3] [--fenster <windowId,...>]
//
// Je Lauf: die Weltrangliste (schon geholt) und die Turnier-Bestenlisten der Spieltage, die in den letzten --tage Tagen endeten und noch nicht gelesen sind
// (Katalog der Seite, /api/cup-catalog), bis das Zeitbudget um ist - der naechste Lauf setzt fort. Eine neuere Angabe ersetzt eine aeltere.
//   { stand, fenster: [windowId, ...], konten: { <id>: [land, zeitMs] } }
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { landAusGeoToken, unbekannteGeoTokens } from '../lib/spielerFlagge.mjs';

try {
  for (const z of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = z.indexOf('=');
    const k = z.slice(0, i).trim();
    if (i > 0 && !z.startsWith('#') && !process.env[k]) process.env[k] = z.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
} catch { /* nur Umgebung */ }

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ENDE = Date.now() + Number(arg('--minuten', 4)) * 60_000;
const TAGE = Number(arg('--tage', 3));
const NUR = String(arg('--fenster', '') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const ORDNER = path.join(process.cwd(), 'data', 'power-rankings');
const DATEI = path.join(ORDNER, 'spiel-flaggen.json');
const RELEASE = 'https://github.com/comphubgg/CompHub/releases/download/daten-rangliste/power-rankings__spiel-flaggen.json';
const SEITE = 'https://www.thecomphub.com';
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const { holeNutzerToken, verwirfNutzerToken } = await import('../lib/replayKern.mjs');
let zugang = await holeNutzerToken();
async function hole(url) {
  for (let v = 1; v <= 4; v += 1) {
    let r = await fetch(url, { headers: { Authorization: zugang.token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.status === 401) { verwirfNutzerToken(); zugang = await holeNutzerToken(); continue; }
    if (r?.status === 404) return null;
    if (r?.ok) return r.json();
    await warte(1500 * v);
  }
  return null;
}

// Der bisherige Stand: hier auf der Platte, sonst vom Release.
let d = null;
try { d = JSON.parse(await fs.readFile(DATEI, 'utf8')); } catch { /* dann vom Release */ }
if (!d) d = await fetch(RELEASE, { redirect: 'follow', signal: AbortSignal.timeout(60_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
d ??= { konten: {}, fenster: [] };
d.konten ??= {}; d.fenster ??= [];
const vorher = Object.keys(d.konten).length;
const setze = (id, land, zeit) => {
  const k = String(id ?? '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(k) || !land) return;
  const alt = d.konten[k];
  if (!alt || alt[1] <= zeit) d.konten[k] = [land, zeit];
};

// 1. Die Weltrangliste - power-rankings-holen.mjs hat die Flaggen schon in Kuerzel umgesetzt.
try {
  const pr = JSON.parse(await fs.readFile(path.join(ORDNER, 'global.json'), 'utf8'));
  const zeit = Number(pr.geholt) || Date.now();
  for (const s of pr.spieler ?? []) setze(s.id, String(s.land ?? '').trim(), zeit);
  console.log(`Weltrangliste: ${(pr.spieler ?? []).filter((s) => s.id && s.land).length} Flaggen`);
} catch { console.log('Weltrangliste: keine global.json'); }

// 2. Die Turnier-Bestenlisten der juengsten Spieltage, die noch nicht gelesen sind.
let fenster = [];
if (NUR.length) {
  const k = await fetch(`${SEITE}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json()).catch(() => ({}));
  const alle = (k.cups ?? []).flatMap((c) => Object.values(c.regionen ?? {}).flat());
  fenster = NUR.map((w) => alle.find((f) => f.windowId === w) ?? { windowId: w, eventId: `epicgames_${w}`, end: Date.now() });
} else {
  const k = await fetch(`${SEITE}/api/cup-catalog?modus=standard`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json()).catch(() => ({}));
  const gelesen = new Set(d.fenster);
  fenster = (k.cups ?? []).flatMap((c) => Object.values(c.regionen ?? {}).flat())
    .filter((f) => f?.status === 'vorbei' && f.end && f.end > Date.now() - TAGE * 864e5 && f.end < Date.now() - 20 * 60_000 && !gelesen.has(f.windowId)
      && !String(f.eventId ?? '').startsWith('manuell_'))
    .sort((a, b) => (b.end ?? 0) - (a.end ?? 0));
}
console.log(`Spieltage offen: ${fenster.length}`);
let gelesen = 0;
for (const f of fenster) {
  if (Date.now() > ENDE) { console.log('Zeitbudget um - der naechste Lauf setzt fort.'); break; }
  const url = (p) => `${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(f.eventId)}/${encodeURIComponent(f.windowId)}/${zugang.accountId}?page=${p}&rank=0&teamAccountIds=`;
  const erste = await hole(url(0));
  if (!erste) { console.log(`  ${f.windowId}: keine Bestenliste`); continue; }
  const seiten = Math.min(Number(erste.totalPages) || 1, 100);
  const eintraege = [...(erste.entries ?? [])];
  let vollstaendig = true;
  for (let p = 1; p < seiten && Date.now() < ENDE + 60_000; p += 4) {
    const teil = await Promise.all(Array.from({ length: Math.min(4, seiten - p) }, (_, i) => hole(url(p + i))));
    if (teil.some((x) => !x)) vollstaendig = false;
    for (const x of teil) eintraege.push(...(x?.entries ?? []));
    await warte(200);
  }
  const zeit = Date.parse(erste.updatedTime ?? '') || f.end || Date.now();
  let mit = 0, spieler = 0;
  for (const e of eintraege) {
    for (const id of e.teamAccountIds ?? []) {
      spieler += 1;
      const land = landAusGeoToken(e.playerFlagTokens?.[id]);
      if (land) { mit += 1; setze(id, land, zeit); }
    }
  }
  if (vollstaendig && eintraege.length >= Math.min(seiten * 100, 10000) - 100) d.fenster.push(f.windowId);
  gelesen += 1;
  console.log(`  ${f.windowId}: ${spieler} Spieler, ${mit} mit Flagge${vollstaendig ? '' : ' (unvollstaendig - wird wiederholt)'}`);
}
d.fenster = d.fenster.slice(-3000);
d.stand = Date.now();
await fs.mkdir(ORDNER, { recursive: true });
await fs.writeFile(DATEI, JSON.stringify(d), 'utf8');
console.log(`spiel-flaggen.json: ${Object.keys(d.konten).length} Konten (vorher ${vorher}), ${gelesen} Spieltage gelesen`);
if (unbekannteGeoTokens.size) console.log(`Flaggen ohne Kuerzel: ${[...unbekannteGeoTokens].join(', ')}`);
