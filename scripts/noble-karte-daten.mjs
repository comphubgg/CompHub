// Die Turnierkarte eines Spieltags von Noble Practice holen (lib/nobleKarte.ts) - fuer tools/posts/karte.html, wenn die Seite offline ist.
//   node --experimental-strip-types scripts/noble-karte-daten.mjs <windowId> <aus.js> [titel] [beginnMs]
import fs from 'node:fs';
import { nobleKarte, nobleFenster } from '../lib/nobleKarte.ts';
import { nobleAnzeige } from '../lib/formVereinfachen.ts';

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
// Zum Zeichnen die leicht vereinfachten Formen (lib/formVereinfachen, Wunsch von Noble Practice 16.11.2026); punkte bleibt das Original
// (scripts/karte-speichern legt es so in die Ablage).
const anzeige = nobleAnzeige(k.formen, () => true);
const daten = {
  ...k,
  formen: k.formen.map((f, fi) => ({ ...f, anzeige: anzeige[fi], teams: f.teams.map((t) => ({ ...t, roh: t.namen, namen: t.ids.map((id, i) => name(id, t.namen[i])), bekannt: t.ids.map((id) => Boolean(pro[id])) })) })),
};
fs.writeFileSync(aus, `window.KARTE=${JSON.stringify(daten)};`);
console.log(`${k.turnier.name} · ${k.fenster.name}: ${k.formen.length} Formen, ${k.anzahlTeams} Teams, ${k.ohneForm.length} ohne Form`);
