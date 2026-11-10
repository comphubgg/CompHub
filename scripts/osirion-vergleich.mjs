// Gegenprobe: unsere Werte eines Spieltags (clutch-Datei) gegen Osirion, Spieler fuer Spieler und Stat fuer Stat.
//   node scripts/osirion-vergleich.mjs <clutch-datei.json> <osirion-ref.json>
import fs from 'node:fs';
const [datei, refDatei] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(datei, 'utf8')); const ref = JSON.parse(fs.readFileSync(refDatei, 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 .]/g, '');
const ids = Object.entries(d.namen ?? {});
const finde = (name) => ids.filter(([, n]) => norm(n).includes(norm(name))).map(([id]) => id)[0];
const s = (id) => d.schaden?.[id] ?? {};
const wert = {
  damage: (id) => s(id).dmg, elims: (id) => (s(id).killsEcht ?? 0) + (s(id).killsNachAus ?? 0), hits: (id) => s(id).treffer,
  ratio: (id) => s(id).erlitten ? Math.round(s(id).dmg / s(id).erlitten * 100) / 100 : null,
  zeitMin: (id) => d.leben?.[id] != null ? Math.round(Math.min(d.leben[id], d.epicTeamZeit?.[id] ?? Infinity) / 60) : null,
  streckeKm: (id) => d.strecke?.[id] ? Math.round((d.strecke[id][0] + d.strecke[id][1]) / 100) / 10 : null,
  matsFarmed: (id) => (s(id).farmHolz ?? 0) + (s(id).farmStein ?? 0) + (s(id).farmMetall ?? 0),
  builds: (id) => (s(id).selbstHolz ?? 0) + (s(id).selbstStein ?? 0) + (s(id).selbstMetall ?? 0),
  sturmSek: (id) => s(id).sturm != null ? Math.round(s(id).sturm) : null,
};
console.log(`Fassung ${d.schadenFassung}, Matches ${d.matches?.length}, teilweise ${JSON.stringify(d.teilweise ?? null)}`);
let ok = 0, alle = 0;
for (const [stat, liste] of Object.entries(ref)) {
  if (!wert[stat]) continue;
  console.log(`\n== ${stat}`);
  for (const [name, soll] of Object.entries(liste)) {
    const id = finde(name); const ist = id ? wert[stat](id) : null;
    const abw = ist == null ? null : soll ? (ist - soll) / soll * 100 : 0;
    const gut = abw != null && Math.abs(abw) <= 0.1; alle++; if (gut) ok++;
    console.log(`${gut ? 'OK ' : '   '} ${name.padEnd(20)} Osirion ${String(soll).padStart(7)}  wir ${String(ist ?? '-').padStart(7)}  ${abw == null ? 'fehlt' : (abw >= 0 ? '+' : '') + abw.toFixed(2) + ' %'}`);
  }
}
// Summen ueber den ganzen Spieltag (Osirions "Player Stats - Total").
if (ref.gesamt) {
  const alleIds = Object.keys(d.schaden ?? {}); const sum = (f) => alleIds.reduce((a, id) => a + (f(id) ?? 0), 0);
  const g = { matches: d.matches?.length, spieler: Object.keys(d.namen ?? {}).length, elims: sum(wert.elims), damage: sum(wert.damage), shots: sum((id) => s(id).schussEcht ?? s(id).schuss), hits: sum(wert.hits),
    builds: sum(wert.builds), matsFarmed: sum(wert.matsFarmed), buildsEdited: sum((id) => s(id).editOk ?? s(id).editZahl), editStunden: Math.round(sum((id) => s(id).editSek) / 3600), streckeKm: Math.round(Object.values(d.strecke ?? {}).reduce((a, x) => a + x[0] + x[1], 0) / 100) / 10 };
  console.log('\n== Summe Spieltag');
  for (const [k, soll] of Object.entries(ref.gesamt)) { if (typeof soll !== 'number') continue; const ist = g[k]; const abw = ist == null ? null : (ist - soll) / soll * 100; alle++; if (abw != null && Math.abs(abw) <= 0.1) ok++;
    console.log(`${abw != null && Math.abs(abw) <= 0.1 ? 'OK ' : '   '} ${k.padEnd(20)} Osirion ${String(soll).padStart(9)}  wir ${String(ist ?? '-').padStart(9)}  ${abw == null ? 'fehlt' : (abw >= 0 ? '+' : '') + abw.toFixed(2) + ' %'}`); }
}
console.log(`\n${ok} von ${alle} innerhalb 0,1 %`);
