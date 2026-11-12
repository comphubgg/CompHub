// Die Turnierkarte eines Spieltags von Noble Practice holen (lib/nobleKarte.ts) - fuer tools/posts/karte.html, wenn die Seite offline ist.
//   node --experimental-strip-types scripts/noble-karte-daten.mjs <windowId> <aus.js> [titel] [beginnMs]
import fs from 'node:fs';
import { nobleKarte, nobleFenster } from '../lib/nobleKarte.ts';

const [windowId, aus, titel, beginn] = process.argv.slice(2);
let k = await nobleKarte(windowId, undefined, undefined, { titel: titel || undefined, begin: Number(beginn) || undefined });
if (!k) {
  console.log('Kein Treffer ueber die Kennung. Spieltage bei Noble:');
  for (const f of await nobleFenster(40, { titel: titel || undefined, begin: Number(beginn) || undefined })) console.log(' ', JSON.stringify(f));
  process.exit(2);
}
let pro = {};
try { pro = await (await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-namen.json')).json(); } catch { /* ohne */ }
const name = (id, roh) => pro[id]?.haupt ?? roh;
const daten = {
  ...k,
  formen: k.formen.map((f) => ({ ...f, teams: f.teams.map((t) => ({ ...t, namen: t.ids.map((id, i) => name(id, t.namen[i])), bekannt: t.ids.map((id) => Boolean(pro[id])) })) })),
};
fs.writeFileSync(aus, `window.KARTE=${JSON.stringify(daten)};`);
console.log(`${k.turnier.name} · ${k.fenster.name}: ${k.formen.length} Formen, ${k.anzahlTeams} Teams, ${k.ohneForm.length} ohne Form`);
