// Die wichtigen Spieler fuer /admin/flaggen (Betreiber, 16.11.2026): wer oft qualifiziert ist oder wiederholt gut platziert - die Regel steht in
// lib/flaggenWichtig.mjs. Gelesen werden dieselben Bestenlisten wie in scripts/spieler-kreis.mjs (data/epic-spieltage und das alte Archiv), dazu Epics Power
// Ranking, die Szene-Liste (Finals CH1 bis Globals 2025) und die LAN-Konten (ein Turnierkonto zaehlt fuer das echte Konto).
//
//   data/spieler-kreis/_wichtig.json  { stand, regeln, konten: { <epicId>: [punkte, final, semi, heat, runde, cup, besteFinal, letzte, region, name, prRang, weg] } }
//   weg = 1: Epic kennt das Konto nicht mehr (geloescht oder gesperrt) - die Seite laesst es als Ausschuss weg.
//
// Laeuft im Spieler-Kreis (spieler-kreis.yml) nach scripts/spieler-kreis.mjs und geht mit dessen Ordner ans Release. Flagge und X-Konto stehen hier
// absichtlich nicht drin: die liest die Seite frisch aus spieler-profile.json, sonst stuende ein eben gepflegter Spieler bis zum naechsten Lauf als offen da.
//
//   node scripts/flaggen-wichtig.mjs

import fs from 'node:fs';
import path from 'node:path';
import { stufe, cupZaehlt, bewerten, STUFEN, REGELN } from '../lib/flaggenWichtig.mjs';
import { holeNutzerToken, warte } from '../lib/replayKern.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'spieler-kreis', '_wichtig.json');
const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };

const dateien = [];
const schonDa = new Set();
for (const wurzel of [path.join(DATEN, 'epic-spieltage'), path.join(DATEN, 'epic-spieltage-alt')]) {
  for (const ordner of fs.existsSync(wurzel) ? fs.readdirSync(wurzel) : []) {
    const voll = path.join(wurzel, ordner);
    if (!fs.statSync(voll).isDirectory()) continue;
    for (const f of fs.readdirSync(voll)) {
      if (!f.endsWith('.json') || f.startsWith('_') || schonDa.has(f)) continue;
      schonDa.add(f);
      dateien.push(path.join(voll, f));
    }
  }
}
if (!dateien.length) { console.log('Keine Bestenlisten in data/epic-spieltage - nichts geschrieben.'); process.exit(1); }

// LAN-Turnierkonten ("[FNCSGC26] BIG Vico") zaehlen fuer das echte Konto.
const lan = lies(path.join(DATEN, 'lan-konten.json'), {});
const echt = (id) => lan[id]?.echt ?? id;

// Erster Durchgang: je Liste die Stufe und ihr Abdruck (die ersten zwanzig Teams). Dieselbe Liste unter mehreren Kennungen zaehlt einmal, mit der niedrigsten Stufe.
const jeAbdruck = new Map();
let gelesen = 0;
for (const datei of dateien) {
  const tag = lies(datei, null);
  const s = stufe(tag);
  if (!s) continue;
  gelesen += 1;
  const abdruck = tag.teams.slice(0, 20).map((t) => (t.spieler ?? []).join('+')).join(',');
  const vorher = jeAbdruck.get(abdruck);
  if (!vorher || STUFEN.indexOf(s.art) < STUFEN.indexOf(vorher.s.art)) jeAbdruck.set(abdruck, { datei, s, kennungen: new Set([...(vorher?.kennungen ?? []), tag.windowId]) });
  else vorher.kennungen.add(tag.windowId);
}
const zaehlen = [...jeAbdruck.values()];
console.log(`${dateien.length} Bestenlisten, ${gelesen} zaehlen, ${zaehlen.length} nach Kopien (${zaehlen.filter((z) => z.kennungen.size > 1).length} Listen unter mehreren Kennungen).`);

// Zweiter Durchgang: je Konto und Ereignis die beste Stufe und der beste Platz.
const konten = new Map();
const neu = () => ({ ereignisse: new Map(), letzte: 0, regionen: new Map() });
for (const { datei, s } of zaehlen) {
  const tag = lies(datei, null);
  for (const t of tag.teams) {
    if (s.art === 'cup' && !cupZaehlt(s, t.platz)) continue;
    for (const roh of t.spieler ?? []) {
      const id = echt(roh);
      const k = konten.get(id) ?? neu();
      konten.set(id, k);
      const e = k.ereignisse.get(s.schluessel);
      if (!e || STUFEN.indexOf(s.art) > STUFEN.indexOf(e.art) || (e.art === s.art && t.platz < e.platz)) k.ereignisse.set(s.schluessel, { art: s.art, platz: t.platz });
      k.letzte = Math.max(k.letzte, tag.datum ?? 0);
      if (tag.region) k.regionen.set(tag.region, (k.regionen.get(tag.region) ?? 0) + 1);
    }
  }
}

const pr = new Map((lies(path.join(DATEN, 'power-rankings', 'global.json'), null)?.spieler ?? [])
  .filter((x) => x?.id).map((x) => [String(x.id).replace(/-/g, '').toLowerCase(), x.rank]));
const namen = lies(path.join(DATEN, 'epic-namen.json'), {});
console.log(`Power Ranking: ${pr.size}, Namen: ${Object.keys(namen).length}, LAN-Konten: ${Object.keys(lan).length}.`);

// Wer nur im Power Ranking steht, kommt auch hinein.
for (const id of pr.keys()) if (!konten.has(id)) konten.set(id, neu());

const raus = {};
let wichtig = 0;
for (const [id, k] of konten) {
  const z = { final: 0, semi: 0, heat: 0, runde: 0, cup: 0, besteFinal: null, letzte: k.letzte };
  for (const e of k.ereignisse.values()) {
    z[e.art] += 1;
    if (e.art === 'final') z.besteFinal = Math.min(z.besteFinal ?? 999, e.platz);
  }
  const b = bewerten(z, { pr: pr.get(id) ?? null });
  if (!b.wichtig) continue;
  wichtig += 1;
  const region = [...k.regionen].sort((a, c) => c[1] - a[1])[0]?.[0] ?? '';
  raus[id] = [b.punkte, b.finals, z.semi, z.heat, z.runde, z.cup, z.besteFinal, z.letzte || null, region, namen[id] ?? '', pr.get(id) ?? null];
}
/*
 * Namen: epic-namen.json kennt nicht jedes Konto - im ersten Lauf (16.11.2026) fehlten 7.700 der wichtigen, darunter 3.200 mit einem Finale (Finals
 * 2019 bis 2021 im alten Archiv, kleine Regionen). Ohne Namen erkennt sie niemand. Wie in scripts/spieler-kreis.mjs: bei Epic nachfragen, hundert je Abfrage.
 * Was Epic nicht zurueckgibt, gibt es nicht mehr - das ist Ausschuss.
 */
const ohneName = Object.keys(raus).filter((id) => !raus[id][9]);
let gefunden = 0; let weg = 0; let gefragt = 0;
try {
  const { token } = await holeNutzerToken();
  for (let i = 0; i < ohneName.length; i += 100) {
    const teil = ohneName.slice(i, i + 100);
    const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account?${teil.map((id) => `accountId=${id}`).join('&')}`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (r?.status === 429) { await warte(30_000); i -= 100; continue; }
    if (!r?.ok) continue;
    const da = new Set();
    for (const k of await r.json()) {
      const id = String(k.id ?? '').toLowerCase();
      da.add(id);
      const n = k.displayName || Object.values(k.externalAuths ?? {}).map((e) => e.externalDisplayName).find(Boolean);
      if (n && raus[id]) { raus[id][9] = n; gefunden += 1; }
    }
    gefragt += teil.length;
    for (const id of teil) if (!da.has(id)) { raus[id][11] = 1; weg += 1; }
    await warte(250);
  }
} catch (e) { console.log(`Namen bei Epic: ${e.message}`); }
console.log(`Namen: ${ohneName.length} ohne Namen, ${gefragt} bei Epic gefragt, ${gefunden} gefunden, ${weg} gibt es nicht mehr.`);

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, JSON.stringify({ stand: Date.now(), regeln: REGELN, konten: raus }));
console.log(`${konten.size} Konten mit gezaehlten Ergebnissen, ${wichtig} wichtig -> ${path.relative(process.cwd(), ZIEL)}.`);
