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
console.log(`\n${ok} von ${alle} innerhalb 0,1 %`);
