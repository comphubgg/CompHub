// Tweets im Stil von Fortnite Tracker aus CompHubs Replay-Auswertung: "Best Stats", "Most Damage Dealt (Ratio)", "Most Eliminations (Damage)".
//   node scripts/ft-posts.mjs <windowId> <titel> <cup-daten.js aus cup-post.yml> [minSpiele]
// Werte je Spieler aus clutch/<w>.json (Schaden, erlitten) und clutch-je (Elims = killsEcht), Sieger und Siege aus Epics Bestenliste.
import fs from 'node:fs';
import { JE_SPALTEN, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';

const [windowId, titel, cupDaten, minSpieleArg] = process.argv.slice(2);
const R = 'https://github.com/comphubgg/CompHub/releases/download';
const hole = async (url, json = true) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return json ? r.json() : r.text(); };
const d = await hole(`${R}/daten-clutch/clutch__${windowId}.json`);
const jeName = `clutch-je/${windowId}.json`;
const je = jeLesen(await hole(`${R}/${tagFuer(jeName)}/${jeName.replace(/\//g, '__')}`, false));
const pro = await hole(`${R}/daten/spieler-namen.json`).catch(() => ({}));
const profile = await hole(`${R}/daten/spieler-profile.json`).catch(() => ({}));
const liste = await hole(`${R}/daten/szene-quelle__spielerliste.json`).catch(() => []);
const C = cupDaten ? JSON.parse(fs.readFileSync(cupDaten, 'utf8').replace(/^window\.DATEN=/, '').replace(/;\s*$/, '')) : null;

const x = {}; const land = {};
for (const p of Object.values(profile)) if (p?.id) { if (p.x) x[p.id] = p.x; if (p.land) land[p.id] = p.land; }
for (const r of liste) if (r?.ID && r.COUNTRY && !land[r.ID]) land[r.ID] = r.COUNTRY;
const flagge = (c) => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((b) => 0x1f1a5 + b.charCodeAt(0))) : '');
const name = (id) => pro[id]?.haupt ?? d.namen?.[id] ?? id.slice(0, 8);
const wer = (id) => [flagge(land[id]), x[id] ? `@${x[id]}` : name(id)].filter(Boolean).join(' ');
const zahl = (n) => Math.round(n).toLocaleString('en-US');
const PLATZ = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const ki = 1 + JE_SPALTEN.indexOf('killsEcht');
const spiele = d.spiele ?? {};
const minSpiele = Number(minSpieleArg) || Math.max(1, Math.round(Math.max(...Object.values(spiele)) / 2));
const spieler = Object.keys(d.schaden ?? {}).map((id) => ({
  id, dmg: d.schaden[id].dmg ?? 0, erlitten: d.schaden[id].erlitten ?? 0, spiele: spiele[id] ?? 0,
  elims: (je[id] ?? []).reduce((a, z) => a + (z[ki] ?? 0), 0),
}));
const ratio = (s) => (s.erlitten ? s.dmg / s.erlitten : 0);
const top = (f, n = 10, filt = () => true) => spieler.filter(filt).sort((a, b) => f(b) - f(a)).slice(0, n);

const kopf = `🏆 ${titel}`;
const dmgText = [kopf, '💥 Most Damage Dealt (Ratio)', '', ...top((s) => s.dmg).map((s, i) => `${PLATZ[i]} ${wer(s.id)}: ${zahl(s.dmg)} (${ratio(s).toFixed(2)})`)].join('\n');
const elimText = [kopf, '📊 Most Eliminations (Damage)', '', ...top((s) => s.elims * 1e6 + s.dmg).map((s, i) => `${PLATZ[i]} ${wer(s.id)}: ${s.elims} (${zahl(s.dmg)})`)].join('\n');

const zeilen = [kopf, '⭐ Best Stats', ''];
if (C?.top?.[0]) zeilen.push(`🥇 Winner: ${C.top[0].ids.map(wer).join(' + ')}`);
const [e1] = top((s) => s.elims * 1e6 + s.dmg, 1); if (e1) zeilen.push(`⚔️ Most Eliminations: ${wer(e1.id)} - ${e1.elims}`);
const [d1] = top((s) => s.dmg, 1); if (d1) zeilen.push(`💥 Most Dmg Dealt: ${wer(d1.id)} - ${zahl(d1.dmg)}`);
const [r1] = top(ratio, 1, (s) => s.spiele >= minSpiele && s.erlitten > 0); if (r1) zeilen.push(`📊 Best Dmg Ratio: ${wer(r1.id)} - ${ratio(r1).toFixed(2)}`);
const [g1] = top((s) => s.erlitten, 1); if (g1) zeilen.push(`🛡️ Most Dmg Received: ${wer(g1.id)} - ${zahl(g1.erlitten)}`);
if (C?.teamWerte?.length) {
  const meisteSiege = Math.max(...C.teamWerte.map((t) => t.siege));
  const w = C.teamWerte.find((t) => t.siege === meisteSiege && meisteSiege > 0);
  if (w) zeilen.push(`👑 Most Wins: ${w.ids.map(wer).join(' + ')} - ${w.siege}`);
  const k = [...C.teamWerte].filter((t) => t.spiele >= minSpiele).sort((a, b) => b.elims / b.spiele - a.elims / a.spiele)[0];
  if (k) zeilen.push(`🎯 Most Kills/Match: ${k.ids.map(wer).join(' + ')} - ${(k.elims / k.spiele).toFixed(1)}`);
}
const gelesen = d.matches?.length ?? 0;
console.log(`STAND ${gelesen}/${d.gesamt ?? '?'} Matches gelesen${d.teilweise ? ' - TEILWEISE, Werte noch nicht endgueltig' : ''}`);
console.log(`\n${zeilen.join('\n')}\n\n=====\n\n${dmgText}\n\n=====\n\n${elimText}\n`);
