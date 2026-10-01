// Die Win-Clips der Globals 2026 ins Archiv legen.
//
// Der Betreiber (1.10.2026): in C:\Users\jumik\Desktop\Grands\WINS liegen
// Clips von Fortnites offiziellem Stream - "Name plus Name und nachher welches
// Game sie gewonnen haben" - die unter Grands ins Archiv sollen.
//
// Wie bei den Walk-outs: das Video ans Release "archiv-videos" (dort gibt es
// kein Kontingent), ein Eintrag im Archiv-Event der Globals mit Titel und den
// Konten der Spieler. Die Konten kommen aus dem Globals-Teilnehmerfeld und aus
// den Walk-out-Eintraegen desselben Events - nie ueber einen Namen geraten.
//
//   node scripts/archiv-wins.mjs --probe     nur zeigen, was passieren wuerde
//   node scripts/archiv-wins.mjs             hochladen und eintragen

import fs from 'node:fs';
import path from 'node:path';

const probe = process.argv.includes('--probe');
const ORDNER = 'C:/Users/jumik/Desktop/Grands/WINS';
const EVENT = 'mui89565f3bwjg'; // Fortnite Global Championship 2026 im Archiv
const REPO = 'comphubgg/CompHub';
const TAG = 'archiv-videos';

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
if (!probe && (!SB || !KEY || !GH)) { console.error('Supabase oder GitHub nicht eingerichtet.'); process.exit(1); }
const sbKopf = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const ghKopf = { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-archiv' };

// Wie der Betreiber die Dateien benannt hat -> Titel und Spieler.
const clips = [
  ['curve + higgs game 1.mp4', 'win-game-01-curve-higgs', 'Win · Curve + Higgs · Game 1', ['curve', 'higgs']],
  ['koyota + yuma game 2.mp4', 'win-game-02-koyota-yuma', 'Win · Koyota + Yuma · Game 2', ['koyota', 'yuma']],
  ['randu + GXR game 3.mp4', 'win-game-03-randu-grx', 'Win · Randu + GRX · Game 3', ['randu', 'grx']],
  ['yuma + koyota game 4.mp4', 'win-game-04-yuma-koyota', 'Win · Yuma + Koyota · Game 4', ['yuma', 'koyota']],
  ['curve + higgs game 5.mp4', 'win-game-05-curve-higgs', 'Win · Curve + Higgs · Game 5', ['curve', 'higgs']],
  ['shxrk + t3eny game 6.mp4', 'win-game-06-shxrk-t3eny', 'Win · Shxrk + T3eny · Game 6', ['shxrk', 't3eny']],
  ['vico + malibuca game 7.mp4', 'win-game-07-vico-malibuca', 'Win · Vico + Malibuca · Game 7', ['vico', 'malibuca']],
  ['sky + scroll game  8.mp4', 'win-game-08-sky-scroll', 'Win · Sky + Scroll · Game 8', ['sky', 'scroll']],
  ['acorn + boltz game 9 .mp4', 'win-game-09-acorn-boltz', 'Win · Acorn + Boltz · Game 9', ['acorn', 'boltz']],
  ['pixie + swizzy game 10.mp4', 'win-game-10-pixie-swizzy', 'Win · Pixie + Swizzy · Game 10', ['pixie', 'swizzy']],
  ['clix + rapid game 11.mp4', 'win-game-11-clix-rapid', 'Win · Clix + Rapid · Game 11', ['clix', 'rapid']],
  ['volko + fant game 12.mp4', 'win-game-12-volko-fant', 'Win · Volko + Fant · Game 12', ['volko', 'fant']],
  ['pixie + swizzy winner 2026.mp4', 'winner-2026-pixie-swizzy', 'Winner 2026 · Pixie + Swizzy', ['pixie', 'swizzy']],
  ['shxrk crazy .mp4', 'shxrk-crazy', 'Shxrk · crazy', ['shxrk']],
  ['trios annoucement.mp4', 'trios-announcement', 'Trios announcement', []],
];
const bild = ['peterbot + pollo gegen shxrk + t3eny.png', 'Peterbot + Pollo vs Shxrk + T3eny', ['peterbot', 'pollo', 'shxrk', 't3eny']];

const rein = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = { gxr: 'grx' };

async function konten() {
  const karte = new Map();
  // 1. das Globals-Teilnehmerfeld (Konto je Spieler, vom Betreiber zugeordnet)
  const feld = await (await fetch('https://www.thecomphub.com/api/globals-teams')).json();
  for (const t of feld.teams ?? []) for (const s of t.spieler ?? []) {
    if (s.epicId) for (const n of [s.anzeige, s.name]) if (n) karte.set(rein(n), s.epicId);
  }
  // 2. die Walk-out-Eintraege: "Walk-out · Curve + Higgs" -> beide Konten
  const g = await (await fetch('https://www.thecomphub.com/api/galerie')).json();
  const aus = new Map();
  for (const e of g.eintraege ?? []) {
    const m = /^Walk-(?:out|in) · (.+)$/i.exec(e.titel ?? '');
    if (!m || (e.spieler ?? []).length !== 2) continue;
    const namen = m[1].split('+').map((x) => rein(x));
    for (const n of namen) if (!aus.has(n)) aus.set(n, []);
    // Das Paar: jeder Name bekommt seine beiden Kandidaten; eindeutig erst ueber den Schnitt.
    for (const n of namen) aus.get(n).push(new Set(e.spieler));
  }
  return { karte, aus, galerie: g };
}

function kontoVon(name, k) {
  const n = ALIAS[rein(name)] ?? rein(name);
  if (k.karte.has(n)) return k.karte.get(n);
  // Aus den Walk-outs: das Konto, das in allen Paaren dieses Namens vorkommt.
  const mengen = k.aus.get(n);
  if (mengen?.length) {
    const gemeinsam = [...mengen[0]].filter((id) => mengen.every((m) => m.has(id)));
    if (gemeinsam.length === 1) return gemeinsam[0];
  }
  return null;
}

const k = await konten();
const plan = [];
let fehlt = 0;
for (const [datei, slug, titel, namen] of clips) {
  const ids = namen.map((n) => kontoVon(n, k));
  if (ids.some((x) => !x)) { fehlt += 1; console.log(`  ! ${titel}: Konto fehlt fuer ${namen.filter((n, i) => !ids[i]).join(', ')}`); }
  const pfad = path.join(ORDNER, datei);
  const da = fs.existsSync(pfad);
  if (!da) console.log(`  ! ${datei}: Datei fehlt`);
  plan.push({ datei, slug, titel, ids: ids.filter(Boolean), pfad, da });
}
const bildIds = bild[2].map((n) => kontoVon(n, k));
if (bildIds.some((x) => !x)) { fehlt += 1; console.log(`  ! Bild: Konto fehlt fuer ${bild[2].filter((n, i) => !bildIds[i]).join(', ')}`); }

console.log(`\n${plan.length} Videos + 1 Bild; Konten fehlen bei ${fehlt}`);
for (const p of plan) console.log(`  ${p.titel.padEnd(40)} ${p.ids.map((i) => i.slice(0, 6)).join('+').padEnd(16)} ${p.da ? Math.round(fs.statSync(p.pfad).size / 1e6) + ' MB' : '-'}`);
console.log(`  ${bild[1].padEnd(40)} ${bildIds.map((i) => i?.slice(0, 6)).join('+')}`);
if (probe || fehlt) { if (fehlt) console.log('\nAbbruch: erst die fehlenden Konten klaeren.'); process.exit(fehlt ? 1 : 0); }

// ---------------------------------------------------------------- hochladen
const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers: ghKopf })).json();
if (!rel?.id) { console.error(`Release ${TAG} fehlt`); process.exit(1); }
const vorhanden = new Set((await (await fetch(`https://api.github.com/repos/${REPO}/releases/${rel.id}/assets?per_page=100`, { headers: ghKopf })).json()).map((a) => a.name));

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const eintraege = [];
for (const p of plan) {
  const name = `globals26-${p.slug}.mp4`;
  const url = `https://github.com/${REPO}/releases/download/${TAG}/${name}`;
  if (!vorhanden.has(name)) {
    const daten = fs.readFileSync(p.pfad);
    const r = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { ...ghKopf, 'Content-Type': 'video/mp4' }, body: daten,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.log(`  x ${name}: ${r.status} ${JSON.stringify(j).slice(0, 120)}`); continue; }
    console.log(`  + ${name} (${Math.round(daten.length / 1e6)} MB)`);
  } else console.log(`  = ${name} liegt schon am Release`);
  eintraege.push({ id: neueId(), eventId: EVENT, art: 'video', url, titel: p.titel, spieler: p.ids, erstellt: Date.now() });
}

// Das Bild: Objektspeicher, wie bei jedem hochgeladenen Bild (lib/galerie.ts).
const bildId = neueId();
const bildDatei = `${bildId}.png`;
const bildDaten = fs.readFileSync(path.join(ORDNER, bild[0]));
const br = await fetch(`${SB}/storage/v1/object/comphub/galerie/${bildDatei}`, {
  method: 'POST', headers: { ...sbKopf, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: bildDaten,
});
if (br.ok) {
  eintraege.push({ id: bildId, eventId: EVENT, art: 'bild', datei: bildDatei, typ: 'image/png', bytes: bildDaten.length,
    spieler: bildIds, erstellt: Date.now(), titel: bild[1] });
  console.log(`  + Bild ${bildDatei}`);
} else console.log(`  x Bild: ${br.status} ${(await br.text()).slice(0, 120)}`);

// Die Eintraege frisch lesen und anhaengen - was inzwischen geaendert wurde, bleibt.
const r = await fetch(`${SB}/rest/v1/ablage?name=eq.galerie.json&select=wert`, { headers: sbKopf });
const z = await r.json();
const g = JSON.parse(z[0].wert);
const schonDa = new Set(g.eintraege.filter((e) => e.eventId === EVENT).map((e) => e.titel));
const neu = eintraege.filter((e) => !schonDa.has(e.titel));
g.eintraege.push(...neu);
const w = await fetch(`${SB}/rest/v1/ablage`, {
  method: 'POST', headers: { ...sbKopf, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ name: 'galerie.json', wert: JSON.stringify(g, null, 1) }),
});
console.log(w.ok ? `\n${neu.length} Eintraege im Archiv ergaenzt.` : `\ngalerie.json schreiben: ${w.status} ${await w.text()}`);
