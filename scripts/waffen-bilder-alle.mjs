// ALLE Waffen, die es je gab, mit eigenem Bild (Betreiber 28.11.2026: "es darf kein einziges Fragezeichen mehr haben ... jede Waffe ... als PNG finden").
//
// Die Hub-Vorschau (Branch hub-vorschau, src/seiten/community/waffenWiki.ts) liest die Waffenliste aus dem Fortnite-Wiki und lud die Bilder bisher direkt
// aus dem Wiki (static.wikia.nocookie.net, ueber einen Proxy) - viele Karten blieben leer, andere zeigten ein Quadrat mit Seltenheits-Hintergrund.
// Dieses Skript laeuft auf dem Runner (.github/workflows/waffen-bilder-alle.yml, die Sandbox kommt nicht ans Wiki):
//   1. Diagnose: GENAU die Liste des Hubs (alleWaffenLesen() aus dem gebuendelten waffenWiki.ts) - jede Anfrage protokolliert - und je Waffe, welches
//      Bild der Hub zeigen wuerde (eigenes Symbol unter /waffen, Wiki-Adresse oder nichts) und warum nichts; dazu ein Lasttest wie im Browser
//      (alle Wiki-Bilder auf einmal) - kommt 429?
//   2. Bilder: je Waffenseite alle Dateien der Seite (prop=images) + Infobox-Dateien + Seitenbild, nach Namen gefiltert, heruntergeladen und geprueft
//      (durchsichtig? Rand?). Bevorzugt die freigestellte Darstellung ("<Name> - Weapon - Fortnite.png"), je Seltenheit eigene, wo das Wiki
//      unterschiedliche Bilder hat. Durchsichtige Raender abgeschnitten, WebP (hoechstens 400 x 300, nie hochskaliert) unter public/waffen/alle/,
//      Zuordnung in public/waffen/alle.json. Wo es nur ein Quadrat mit Hintergrund gibt: behalten, mit f: 0 markiert (die Seite zeigt es eingepasst).
// Hoeflich: wenige Anfragen gleichzeitig, bei 429/5xx Pause und neu.
//
//   node waffen-bilder-alle.mjs <Ordner mit hub/waffenWiki.js + hub/waffenNamen.js> <Ausgabeordner>

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const HUB = path.resolve(process.argv[2] || 'hub');
const AUS = path.resolve(process.argv[3] || 'aus');
const BILDER = path.join(AUS, 'public', 'waffen', 'alle');
fs.mkdirSync(BILDER, { recursive: true });
const API = 'https://fortnite.fandom.com/api.php';
const KOPF = { 'User-Agent': 'CompHub/1.0 (+https://thecomphub.com; weapon icons, one-off)' };
const warte = (ms) => new Promise((w) => setTimeout(w, ms));
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];

/* ---------------------------------------------- Jede Anfrage protokollieren (auch die des Hub-Codes) */
const protokoll = [];
const echtFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const t = Date.now(); const adresse = String(u);
  try {
    const r = await echtFetch(u, { ...o, headers: { ...KOPF, ...(o.headers ?? {}) } });
    const e = { u: adresse.slice(0, 400), s: r.status, ms: Date.now() - t };
    if (adresse.includes('api.php')) {
      try { const j = await r.clone().json(); if (j?.error) e.fehler = j.error.code; if (j?.warnings) e.warnung = JSON.stringify(j.warnings).slice(0, 300); } catch { e.fehler = 'kein JSON'; }
    }
    protokoll.push(e); return r;
  } catch (f) { protokoll.push({ u: adresse.slice(0, 400), f: String(f?.cause?.code ?? f?.message ?? f), ms: Date.now() - t }); throw f; }
};

async function parallel(liste, n, fn) {
  const aus = new Array(liste.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { for (let k = i++; k < liste.length; k = i++) aus[k] = await fn(liste[k], k); }));
  return aus;
}
/** MediaWiki-API mit Wiederholung (POST - lange Titellisten). */
async function api(q) {
  let letzter;
  for (let v = 0; v < 7; v++) {
    try {
      const r = await fetch(API, { method: 'POST', body: new URLSearchParams({ format: 'json', formatversion: '2', ...q }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.code);
      return j;
    } catch (f) { letzter = f; await warte(1500 * 2 ** v); }
  }
  throw letzter;
}
/** query mit continue ganz durchblaettern und die Seiten zusammenlegen. */
async function abfrageAlle(q) {
  const seiten = new Map(); let weiter = {}; const normal = []; const weiterl = [];
  for (let n = 0; n < 50; n++) {
    const j = await api({ action: 'query', ...q, ...weiter });
    normal.push(...(j.query?.normalized ?? [])); weiterl.push(...(j.query?.redirects ?? []));
    for (const p of j.query?.pages ?? []) {
      const alt = seiten.get(p.title) ?? {};
      seiten.set(p.title, { ...alt, ...p, images: [...(alt.images ?? []), ...(p.images ?? [])] });
    }
    if (!j.continue) break; weiter = j.continue;
  }
  return { seiten, normal, weiter: weiterl };
}
/** Bild laden (mit Wiederholung) - Status-Codes zaehlen. */
const ladeStatus = {};
async function bildLaden(url) {
  for (let v = 0; v < 6; v++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'image/png,image/*;q=0.8' }, signal: AbortSignal.timeout(30_000) });
      ladeStatus[r.status] = (ladeStatus[r.status] ?? 0) + 1;
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      return Buffer.from(await r.arrayBuffer());
    } catch { await warte(1500 * 2 ** v); }
  }
  return null;
}

/* ---------------------------------------------- 1. Die Liste des Hubs */
const { alleWaffenLesen } = await import(pathToFileURL(path.join(HUB, 'waffenWiki.js')).href);
const { bildNachName, kern } = await import(pathToFileURL(path.join(HUB, 'waffenNamen.js')).href);
const t0 = Date.now();
const liste = await alleWaffenLesen();
const hubProtokoll = protokoll.splice(0);
console.log(`Hub-Liste: ${liste.length} Waffen in ${Math.round((Date.now() - t0) / 1000)} s, ${hubProtokoll.length} Anfragen`);
const hubFehler = hubProtokoll.filter((e) => e.f && !e.u.startsWith('/') || (e.s && e.s !== 200) || e.fehler);

// /api/waffen-bilder wie im Hub (Waffen.tsx useWiki): Kern der Kennung -> { name, bild }
const tabelle = await (await fetch('https://www.thecomphub.com/api/waffen-bilder')).json().catch(() => ({}));
const wikiTabelle = new Map();
for (const [k, v] of Object.entries(tabelle ?? {})) { const n = kern(k); if (!wikiTabelle.has(n)) wikiTabelle.set(n, v); }
const ohneProxy = (u) => (u?.startsWith('/wikia/') ? `https://static.wikia.nocookie.net/${u.slice(7)}` : u);

const diagnose = liste.map((w) => {
  const eigen = bildNachName(w.name, wikiTabelle);
  const wikiUrl = ohneProxy(w.wikiBild ?? (w.wikiBilder ? Object.values(w.wikiBilder)[0] : undefined));
  const zeigt = eigen ?? wikiUrl ?? null;
  return { id: w.id, name: w.name, seite: w.wikiSeite, hub: { quelle: eigen?.startsWith('/waffen/') ? 'eigenes-symbol' : eigen ? 'api-waffen-bilder' : wikiUrl ? 'wiki' : 'keins', url: zeigt, jeSeltenheit: Object.keys(w.wikiBilder ?? {}) } };
});

/* ---------------------------------------------- 1b. Lasttest wie im Browser: alle Wiki-Bilder des Hubs auf einmal */
const hubUrls = [...new Set(diagnose.map((d) => d.hub.url).filter((u) => u?.startsWith('https://')))];
const last = {};
const lastErgebnis = new Map();
await parallel(hubUrls, 60, async (u) => {
  try {
    const r = await echtFetch(u, { headers: KOPF, signal: AbortSignal.timeout(30_000) }); const buf = Buffer.from(await r.arrayBuffer());
    last[r.status] = (last[r.status] ?? 0) + 1;
    // Was der Browser dann zeigt: durchsichtig (Ecken frei) oder ein Quadrat mit Hintergrund?
    let frei;
    if (r.ok) { try { const { data, info: i } = await sharp(buf, { animated: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); frei = [[1, 1], [i.width - 2, 1], [1, i.height - 2], [i.width - 2, i.height - 2]].filter(([x, y]) => data[(y * i.width + x) * 4 + 3] < 16).length >= 3; } catch { frei = undefined; } }
    lastErgebnis.set(u, { s: r.status, frei });
  } catch (f) { last.fehler = (last.fehler ?? 0) + 1; lastErgebnis.set(u, { s: 'fehler' }); }
});
console.log('Lasttest (60 gleichzeitig):', JSON.stringify(last));
await warte(5000);

/* ---------------------------------------------- 2. Je Seite: Quelltext, Seitenbild, alle Dateien */
const titel = [...new Set(liste.map((w) => w.wikiSeite).filter(Boolean))];
const proSeite = new Map();
for (let i = 0; i < titel.length; i += 50) {
  const teil = titel.slice(i, i + 50);
  const a = await abfrageAlle({ prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', piprop: 'name|original', titles: teil.join('|') });
  const b = await abfrageAlle({ prop: 'images', imlimit: 'max', titles: teil.join('|') });
  for (const [t, p] of a.seiten) proSeite.set(t, { text: p.revisions?.[0]?.slots?.main?.content ?? '', seitenBild: p.pageimage ? `File:${p.pageimage}` : null, dateien: [] });
  for (const [t, p] of b.seiten) if (proSeite.has(t)) proSeite.get(t).dateien = (p.images ?? []).map((x) => x.title);
  await warte(300);
}
console.log(`${proSeite.size} Seiten gelesen`);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const RAR_WORT = /\b(common|uncommon|rare|epic|legendary|mythic|exotic)\b/i;
/** Dateiname -> Stamm ohne Zusaetze (" - Weapon - Fortnite", Seltenheit, Klammern, Version), zum Vergleich mit dem Waffennamen. */
const stamm = (f) => norm(f.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/\s*-\s*(weapon|item|gadget|consumable)?\s*-?\s*fortnite$/i, '')
  .replace(/\((?:[^)]*)\)/g, ' ').replace(RAR_WORT, ' ').replace(/\b(icon|hd|render|model|transparent|new|old|v\d+[-.]\d+|chapter \d+|high tier|low tier)\b/gi, ' '));
const NICHT_WAFFE = /\b(map|location|loading|screenshot|spray|emote|wrap|banner|challenge|concept|outfit|gameplay|promo|trailer|vending|chest|logo|emoticon|killfeed|hud|reticle|crosshair|stw|save the world|lego|quest|loot ?pool|ammo|holding|in-game|ingame|first person|third person|animation|sound|patch notes|news|tweet|teaser|leak|blog|keyart|key art|season|battle pass|tier \d+|update)\b/i;
/** Alle Dateinamen in einem Infobox-Wert. */
const dateienIn = (v) => [...(v ?? '').matchAll(/([^|[\]{}=\n:]+?\.(?:png|jpe?g|webp|gif))/gi)].map((m) => `File:${m[1].trim()}`);

// Infobox-Dateien (je Seltenheit, soweit erkennbar) aus dem Quelltext - mit vorlagen() des Hubs
const { vorlagen, seiteLesen } = await import(pathToFileURL(path.join(HUB, 'waffenWiki.js')).href);
const kandidaten = new Map(); // Waffe -> [{ datei, infobox, rar, seitenBild, name }]
const alleDateien = new Set();
for (const w of liste) {
  const s = proSeite.get(w.wikiSeite); const k = [];
  if (!s) { kandidaten.set(w.id, k); continue; }
  const box = vorlagen(s.text).filter((x) => /infobox|weapon/i.test(x.name) && !/navbox|nav\b/i.test(x.name));
  const p = Object.assign({}, ...box.map((b) => b.params));
  const reihe = (p.rarities ?? p.rarity ?? p.availablerarities ?? '').split(/[,/;\n]|<br\s*\/?>/i).map((x) => RAR.find((r) => norm(x).replace(/[^a-z]/g, '') === r)).filter(Boolean);
  for (const [schl, v] of Object.entries(p)) {
    if (!/^(image|icon|gallery)/.test(schl)) continue;
    const w1 = RAR.find((r) => schl.includes(r)); const z = /(\d)$/.exec(schl);
    for (const d of dateienIn(v)) k.push({ datei: d, infobox: true, rar: w1 ?? (z ? reihe[Number(z[1]) - 1] : undefined) ?? RAR_WORT.exec(d)?.[1]?.toLowerCase() });
  }
  if (s.seitenBild) k.push({ datei: s.seitenBild, seitenBild: true });
  const namen = [norm(w.name), norm((w.wikiSeite ?? '').replace(/\s*\([^)]*\)\s*$/, ''))].filter(Boolean);
  for (const d of s.dateien) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(d)) continue;
    const st = stamm(d);
    const genau = namen.includes(st);
    const enthaelt = !genau && namen.some((n) => n.length >= 6 && st.includes(n) && st.length - n.length <= 12);
    if (!genau && !enthaelt) continue;
    if (!genau && NICHT_WAFFE.test(d)) continue;
    k.push({ datei: d, name: genau ? 2 : 1, rar: RAR_WORT.exec(d.replace(/\.[a-z]+$/i, ''))?.[1]?.toLowerCase() });
  }
  // Die uebliche Benennung des Wikis auch dann pruefen, wenn die Seite sie nicht einbindet
  k.push({ datei: `File:${w.name} - Weapon - Fortnite.png`, name: 2, geraten: true });
  // zusammenlegen (dieselbe Datei aus mehreren Quellen)
  const m = new Map();
  for (const x of k) {
    const d = x.datei.replace(/_/g, ' '); const alt = m.get(d);
    if (!alt) { m.set(d, { ...x, datei: d, geraten: !!x.geraten }); continue; }
    alt.infobox ||= x.infobox; alt.seitenBild ||= x.seitenBild; alt.name = Math.max(alt.name ?? 0, x.name ?? 0); alt.rar ??= x.rar; alt.geraten = alt.geraten && !!x.geraten;
  }
  kandidaten.set(w.id, [...m.values()]); for (const x of m.values()) alleDateien.add(x.datei);
}
console.log(`${alleDateien.size} Dateien zu pruefen`);

/* ---------------------------------------------- 3. Dateien: Adresse, Groesse; dann laden und ansehen */
const info = new Map(); // Dateiname -> { url, thumb, w, h, mime } | null
const dateiListe = [...alleDateien];
for (let i = 0; i < dateiListe.length; i += 50) {
  const teil = dateiListe.slice(i, i + 50);
  const { seiten, normal, weiter } = await abfrageAlle({ prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '512', titles: teil.join('|'), redirects: '1' });
  const nach = new Map();
  for (const x of normal) nach.set(x.to, [...(nach.get(x.to) ?? []), x.from]);
  for (const x of weiter) nach.set(x.to, [...(nach.get(x.to) ?? []), ...(nach.get(x.from) ?? [x.from])]);
  for (const [t, p] of seiten) {
    const ii = p.imageinfo?.[0];
    const wert = ii && !p.missing ? { url: ii.url, thumb: ii.thumburl ?? ii.url, w: ii.width, h: ii.height, mime: ii.mime, echt: t } : null;
    for (const name of [t, ...(nach.get(t) ?? [])]) info.set(name.replace(/_/g, ' '), wert);
  }
  await warte(200);
}
const geladen = new Map(); // Dateiname -> Analyse
const zuLaden = dateiListe.filter((d) => info.get(d));
await parallel(zuLaden, 4, async (d) => {
  const i = info.get(d);
  const buf = await bildLaden(i.w > 512 ? i.thumb : i.url);
  if (!buf) { geladen.set(d, { fehler: 'nicht ladbar' }); return; }
  try {
    const { data, info: r } = await sharp(buf, { animated: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = r.width; const H = r.height; let frei = 0; let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a < 16) frei++; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const ecke = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].filter(([x, y]) => data[(y * W + x) * 4 + 3] < 16).length;
    const anteil = frei / (W * H);
    geladen.set(d, { buf, W, H, durchsichtig: ecke >= 3 && anteil > 0.08, anteil: Math.round(anteil * 100) / 100, ecke, rahmen: x1 >= 0 ? [x0, y0, x1, y1] : null });
  } catch (f) { geladen.set(d, { fehler: `kein Bild: ${f.message}` }); }
});
console.log('Bilder geladen, Status:', JSON.stringify(ladeStatus));

/* ---------------------------------------------- 4. Auswahl je Waffe (und je Seltenheit) */
const punkte = (k) => {
  const g = geladen.get(k.datei);
  if (!g || g.fehler || !g.rahmen) return -1;
  if (Math.min(g.W, g.H) < 48) return -1;
  return (g.durchsichtig ? 10 : 0) + (k.name ?? 0) * 2 + (k.infobox ? 3 : 0) + (k.seitenBild ? 1 : 0) + (/- weapon - fortnite/i.test(k.datei) ? 2 : 0) + Math.min(2, (g.W * g.H) / 131072);
};
const gespeichert = new Map(); // Dateiname -> { b, f, q, bytes }
async function speichern(datei) {
  if (gespeichert.has(datei)) return gespeichert.get(datei);
  const g = geladen.get(datei); const echt = info.get(datei)?.echt ?? datei;
  const slug = echt.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/\s*-\s*weapon\s*-\s*fortnite$/i, '').normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 90) || 'bild';
  let name = slug; for (let n = 2; [...gespeichert.values()].some((x) => x.b === `alle/${name}.webp`); n++) name = `${slug}-${n}`;
  let bild = sharp(g.buf, { animated: false });
  if (g.durchsichtig) { const [x0, y0, x1, y1] = g.rahmen; const rand = 2; bild = bild.extract({ left: Math.max(0, x0 - rand), top: Math.max(0, y0 - rand), width: Math.min(g.W, x1 + rand + 1) - Math.max(0, x0 - rand), height: Math.min(g.H, y1 + rand + 1) - Math.max(0, y0 - rand) }); }
  const ziel = path.join(BILDER, `${name}.webp`);
  await bild.resize({ width: g.durchsichtig ? 400 : 256, height: g.durchsichtig ? 300 : 256, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(ziel);
  const m = await sharp(ziel).metadata();
  const x = { b: `alle/${name}.webp`, f: g.durchsichtig ? 1 : 0, q: echt.replace(/^File:/i, ''), w: m.width, h: m.height, bytes: fs.statSync(ziel).size };
  gespeichert.set(datei, x); return x;
}
const manifest = {}; const ohne = [];
for (const [n, w] of liste.entries()) {
  const alleK = (kandidaten.get(w.id) ?? []).map((x) => ({ ...x, p: punkte(x) })).filter((x) => x.p >= 0);
  // Stufe A: genauer Name, Infobox oder Seitenbild. Nur wenn es davon nichts gibt: Dateien, deren Name den Waffennamen enthaelt (Stufe B, im Bericht markiert)
  const stufeA = alleK.filter((x) => x.name >= 2 || x.infobox || x.seitenBild);
  const k = (stufeA.length ? stufeA : alleK.filter((x) => x.name === 1)).sort((a, b) => b.p - a.p);
  const d = diagnose[n];
  // Warum zeigte der Hub nichts? Mit dem Quelltext nachgestellt (seiteLesen des Hubs)
  if (d.hub.quelle === 'keins') {
    const s = proSeite.get(w.wikiSeite); const nach = s ? seiteLesen(w.wikiSeite, s.text) : null;
    const dat = nach?.wikiBild?.startsWith('datei:') ? `File:${nach.wikiBild.slice(6)}`.replace(/_/g, ' ') : null;
    d.hub.warum = !s ? 'Seite nicht gelesen' : dat ? (info.get(dat) ? `Infobox-Datei existiert (${dat}) - im Hub nicht aufgeloest` : `Infobox nennt ${dat} - die Datei gibt es nicht`)
      : s.seitenBild ? `keine Infobox-Datei erkannt (Seitenbild ${s.seitenBild} - im Hub nicht angekommen)` : 'weder Infobox-Datei noch Seitenbild';
    d.hub.infoboxRoh = Object.entries(Object.assign({}, ...vorlagen(s?.text ?? '').filter((x) => /infobox|weapon/i.test(x.name)).map((b) => b.params))).filter(([k]) => /^(image|icon)/.test(k)).map(([k, v]) => `${k}=${v.slice(0, 160)}`);
  }
  d.kandidaten = (kandidaten.get(w.id) ?? []).map((x) => { const g = geladen.get(x.datei); const i = info.get(x.datei); return { d: x.datei.replace(/^File:/, ''), ib: x.infobox ? 1 : undefined, sb: x.seitenBild ? 1 : undefined, nm: x.name || undefined, rar: x.rar, ger: x.geraten ? 1 : undefined, da: i ? 1 : 0, gr: g?.W ? `${g.W}x${g.H}` : undefined, frei: g?.durchsichtig ? 1 : g?.W ? 0 : undefined, err: g?.fehler, p: Math.round(punkte(x) * 10) / 10 }; });
  if (!k.length) { ohne.push(w.id); d.grund = !proSeite.has(w.wikiSeite) ? 'Seite nicht gelesen' : !(kandidaten.get(w.id) ?? []).some((x) => info.get(x.datei)) ? 'keine Bilddatei auf der Seite' : 'Dateien nicht ladbar oder kein passendes Bild'; continue; }
  // Standardbild: durchsichtig und ohne Seltenheit vor durchsichtig mit Seltenheit vor allem anderen
  const ohneRar = k.filter((x) => !x.rar);
  const haupt = [...k].sort((a, b) => (b.p + (b.rar ? 0 : 0.5)) - (a.p + (a.rar ? 0 : 0.5)))[0] ?? ohneRar[0];
  const e = { n: w.name, ...(await speichern(haupt.datei)) };
  // je Seltenheit: nur wenn eine andere Datei dafuer da ist und sie mindestens so gut ist (durchsichtig bleibt durchsichtig)
  const je = {};
  for (const r of RAR) {
    const x = k.filter((y) => y.rar === r && y.datei !== haupt.datei).sort((a, b) => b.p - a.p)[0];
    if (!x) continue;
    if (geladen.get(haupt.datei).durchsichtig && !geladen.get(x.datei).durchsichtig) continue;
    const s = await speichern(x.datei); je[r] = { b: s.b, f: s.f, q: s.q };
  }
  if (Object.keys(je).length) e.r = je;
  delete e.bytes;
  manifest[w.id] = e;
  d.gewaehlt = { haupt: e.q, frei: e.f, nurAehnlich: stufeA.length ? undefined : 1, je: Object.fromEntries(Object.entries(je).map(([r, x]) => [r, x.q])) };
}

/* ---------------------------------------------- 5. Ausgabe */
const summe = [...gespeichert.values()].reduce((s, x) => s + x.bytes, 0);
fs.writeFileSync(path.join(AUS, 'public', 'waffen', 'alle.json'), `${JSON.stringify({ stand: new Date().toISOString(), quelle: 'fortnite.fandom.com', waffen: manifest })}\n`);
const zaehle = (f) => diagnose.reduce((m, d) => { const k = f(d); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const bericht = {
  stand: new Date().toISOString(),
  hub: {
    waffen: liste.length, anfragen: hubProtokoll.length, fehlerAnfragen: hubFehler,
    bildQuelle: zaehle((d) => d.hub.quelle),
    lasttest: { gleichzeitig: 60, urls: hubUrls.length, status: last },
    hubBildDurchsichtig: zaehle((d) => (d.hub.url?.startsWith('https://') ? `frei=${lastErgebnis.get(d.hub.url)?.frei}` : 'eigen/keins')),
    warumKeins: zaehle((d) => (d.hub.warum ?? '-').replace(/\(.*\)/, '').replace(/File:.*? -/, 'File -')),
  },
  neu: { waffen: Object.keys(manifest).length, durchsichtig: Object.values(manifest).filter((x) => x.f).length, jeSeltenheit: Object.values(manifest).filter((x) => x.r).length, dateien: gespeichert.size, bytes: summe, ohne: ohne.length, ladeStatus },
  waffen: diagnose.map((d) => ({ ...d, lasttest: d.hub.url ? lastErgebnis.get(d.hub.url) : undefined })),
};
fs.writeFileSync(path.join(AUS, 'diagnose.json'), `${JSON.stringify(bericht, null, 1)}\n`);
fs.writeFileSync(path.join(AUS, 'protokoll-hub.json'), `${JSON.stringify(hubProtokoll)}\n`);
console.log(JSON.stringify({ hub: { ...bericht.hub, fehlerAnfragen: bericht.hub.fehlerAnfragen.length }, neu: bericht.neu }, null, 1));
console.log('Ohne Bild:', ohne.map((id) => manifest[id]?.n ?? diagnose.find((d) => d.id === id)?.name).join(' | '));
