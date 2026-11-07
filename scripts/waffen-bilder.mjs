// Bilder und Namen aller Waffen und Gegenstaende aus dem Fortnite-Wiki - fuer das HUD der Replay-Ansicht (app/replays/SpielerEbene).
//
// Der Betreiber (7.11.2026): "fuer Zero Build, fuer Build, fuer Battle Royale und fuer Reload jeweils die Weapons ... immer auf die aktuellsten Updates, weil
// wenn ein Update kommt, kommen neue Weapons". fortnite.gg sperrt Abrufe von Servern (403); das Wiki nicht, und seine Seiten fuehren die internen Kennungen
// (WID_...), unter denen die Gegenstaende auch im Replay stehen. Der Weg:
//   1. alle Seiten "Full List of Items" und "Full List of Items/..." (Gewehre, Schrotflinten, Pistolen, Heilung, Werkzeuge ...) -> die Namen der Gegenstaende
//   2. je Gegenstand seine Seite: die Kennungen und das Bild aus der Infobox
//   3. die Bildadressen (160 px breit) ueber die Dateiinfo des Wikis
// Ergebnis: data/waffen-bilder.json { "<Kennung ohne Seltenheit>": { name, bild } } - laeuft taeglich in "Daten erneuern", ans Release wie die anderen Daten.
//
//   node scripts/waffen-bilder.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://fortnite.fandom.com/api.php';
const ZIEL = path.join(process.cwd(), 'data', 'waffen-bilder.json');
const KOPF = { 'User-Agent': 'CompHub/1.0 (+https://thecomphub.com)' };

async function frage(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, v);
  for (let v = 0; v < 4; v += 1) {
    try {
      const r = await fetch(u, { headers: KOPF, signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json();
    } catch { /* gleich noch einmal */ }
    await new Promise((ok) => setTimeout(ok, 2000 * (v + 1)));
  }
  throw new Error(`Wiki antwortet nicht: ${params.action} ${params.titles ?? params.apprefix ?? params.page ?? ''}`.slice(0, 160));
}

const listen = (await frage({ action: 'query', list: 'allpages', apprefix: 'Full List of Items', aplimit: '100' })).query.allpages.map((p) => p.title)
  .filter((t) => !/Save the World|Ballistic|Creative|LEGO/i.test(t));
const titel = new Set();
for (const l of listen) {
  const w = (await frage({ action: 'parse', page: l, prop: 'wikitext' })).parse?.wikitext ?? '';
  for (const m of w.matchAll(/^\|\s*\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/gm)) titel.add(m[1].trim());
}
console.log(`${listen.length} Listen, ${titel.size} Gegenstaende`);

const kennungen = {}; const bildVon = {};
const alle = [...titel];
for (let i = 0; i < alle.length; i += 50) {
  const j = await frage({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: alle.slice(i, i + 50).join('|') });
  for (const p of j.query?.pages ?? []) {
    const text = p.revisions?.[0]?.slots?.main?.content ?? '';
    const ids = [...new Set((text.match(/\b(?:WID|AGID)_[A-Za-z0-9_]+/g) ?? []))];
    if (!ids.length) continue;
    const bild = /\|\s*image\s*=\s*([^\n|<]+?\.(?:png|jpg|jpeg|gif|webp))/i.exec(text)?.[1]?.trim();
    if (!bild) continue;
    kennungen[p.title] = ids; bildVon[p.title] = bild;
  }
}
const dateien = [...new Set(Object.values(bildVon))];
const adresse = {};
for (let i = 0; i < dateien.length; i += 50) {
  const j = await frage({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '160', titles: dateien.slice(i, i + 50).map((d) => `File:${d}`).join('|') });
  for (const p of j.query?.pages ?? []) {
    const ii = p.imageinfo?.[0];
    if (ii) adresse[p.title.replace(/^File:/, '')] = ii.thumburl ?? ii.url;
  }
}
const raus = {};
const ohneSeltenheit = (id) => id.replace(/_(C|UC|R|VR|SR|UR|X|Exotic|Mythic|Legendary|Epic|Rare|Uncommon|Common)(_Ore_T0\d|_T0\d)?$/i, '').replace(/_Ore_T0\d$/i, '');
for (const [seite, ids] of Object.entries(kennungen)) {
  // "Pepper/Consumable Item" -> "Pepper"
  const name = seite.split('/')[0];
  const bild = adresse[bildVon[seite]] ?? adresse[bildVon[seite].replace(/_/g, ' ')];
  if (!bild) continue;
  // Mehrere Seiten mit derselben Kennung (Pump Shotgun, Enhanced ..., Boss ...): die schlichte zuerst.
  const guete = (n) => (/Enhanced|Boss|Mythic|\/|Prototype/i.test(n) ? 100 : 0) + n.length;
  for (const id of ids) { const k = ohneSeltenheit(id); if (!raus[k] || guete(name) < guete(raus[k].name)) raus[k] = { name, bild }; }
}
const anzahl = Object.keys(raus).length;
// Ein Wiki-Ausfall darf die Liste nicht leeren: weniger als die Haelfte des alten Stands wird nicht geschrieben.
const alt = (() => { try { return Object.keys(JSON.parse(fs.readFileSync(ZIEL, 'utf8'))).length; } catch { return 0; } })();
if (anzahl < Math.max(50, alt / 2)) { console.log(`Nur ${anzahl} Kennungen (vorher ${alt}) - nicht geschrieben`); process.exit(0); }
fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, JSON.stringify(raus));
console.log(`${anzahl} Kennungen mit Bild aus ${Object.keys(kennungen).length} Gegenstaenden geschrieben`);
