// Spieler-Stats eines Spieltags fuer einen Post (tools/posts/stats-post.html): Top 5 bei Elims, Schaden und Laufstrecke aus CompHubs Replay-Auswertung.
//   node scripts/stats-post-daten.mjs <windowId> <aus.js>
import fs from 'node:fs';

const [windowId, aus] = process.argv.slice(2);
const url = `https://github.com/comphubgg/CompHub/releases/download/daten-clutch/clutch__${windowId}.json`;
const r = await fetch(url);
if (!r.ok) { console.log(`Noch keine Auswertung fuer ${windowId} (${r.status})`); process.exit(2); }
const d = await r.json();
let pro = {};
try { pro = await (await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-namen.json')).json(); } catch { /* ohne */ }
const ORDNER = new URL('../public/spielerbilder/', import.meta.url);
const bilder = fs.existsSync(ORDNER) ? fs.readdirSync(ORDNER) : [];
let gesichter = {};
try { gesichter = JSON.parse(fs.readFileSync(new URL('_gesichter.json', ORDNER), 'utf8')); } catch { /* ohne */ }
const name = (id) => pro[id]?.haupt ?? d.namen?.[id] ?? id.slice(0, 8);
const kurz = (n) => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^\S+\s+(?=\S)/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bild = (id) => {
  for (const k of [pro[id]?.schluessel, kurz(name(id)), kurz(name(id)).split('-')[0]].filter(Boolean)) {
    const f = bilder.find((b) => b === `${k}.jpg` || b === `${k}.png`);
    if (f) return { datei: f, gesicht: gesichter[f] ?? null };
  }
  return null;
};
const top = (werte, n = 5) => Object.entries(werte).filter(([, v]) => Number.isFinite(v) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([id, v]) => ({ id, name: name(id), wert: v, spiele: d.spiele?.[id] ?? null, bild: bild(id) }));

const elims = top(d.solo ?? {});
const schaden = top(Object.fromEntries(Object.entries(d.schaden ?? {}).map(([id, s]) => [id, s.dmg])));
const strecke = top(Object.fromEntries(Object.entries(d.strecke ?? {}).map(([id, s]) => [id, Math.round(s[0] ?? 0)])));
const daten = {
  windowId, eventId: d.eventId, gelesen: d.matches?.length ?? 0, gesamt: d.gesamt ?? null, teilweise: Boolean(d.teilweise),
  spieler: Object.keys(d.spiele ?? {}).length, elims, schaden, strecke,
};
fs.writeFileSync(aus, `window.DATEN=${JSON.stringify(daten)};`);
console.log(JSON.stringify(daten, null, 1).slice(0, 3000));
