// Der Turnierverlauf jedes Kontos, das je in einer unserer Bestenlisten stand - fuer das Profil und die Spielersuche unter Statistics.
//
// Der Betreiber (16.11.2026): "jeder, der je ein Turnier gespielt hat, soll sich suchen koennen und ein Profil bekommen - nicht nur die Pros, auch ich".
// Die Akten (Pros) und der Spieler-Kreis (wer regelmaessig gut platziert) decken nur einen kleinen Teil. Die Bestenlisten selbst liegen aber laengst am
// Release (data/epic-spieltage: die ganzen Listen, je Spieltag die ersten 10.000 Teams; data/epic-spieltage-alt: bis 2019 zurueck, je Spieltag die besten 500).
// Hier wird daraus EIN Index gebaut - einmal auf GitHub, nie auf dem Server der Seite (der lief am 16.11.2026 im Speicher ueber und startete immer neu):
//
//   _stand.json                    { build, tage: [Spieltag ...], lage: [[start, laenge] x 4096], namenLage: [[start, laenge] x 4096], ... }
//   verlauf-<build>-<xx>.bin       256 Dateien, je ersten zwei Zeichen der Konto-Id; darin 16 einzeln gepackte Stuecke (drittes Zeichen),
//                                  jedes { <epicId>: { n: Name, a: [alte Namen], pr: [Platz, Punkte], z: [[tag, platz, punkte, matches, preis, [mitspieler]]], m: {id: Name} } }
//   namen-<build>.bin              4096 gepackte Stuecke (nach den ersten drei Zeichen des Namens): [[schluessel, name, epicId, events, region, alt?, heutigerName?], ...]
//   namen-stand.json.gz            { <epicId>: [name, geprueftTag, ...alteNamen] } - nur fuer den naechsten Lauf
//   zusatz.json                    das eigene Konto hinter Platz 10.000 (Epic gibt es heraus, fremde nicht) - nur fuer den naechsten Lauf
//
// Die Seite (lib/spielerVerlauf.ts) liest je Profil genau EIN Stueck (HTTP Range, rund 100 KB gepackt) und je Suche ein Namensstueck - nie alles.
// Inkrementell: ein Spieltag wird nur neu gelesen, wenn seine Pruefsumme im Manifest des Releases eine andere ist (oder er neu ist); alle anderen
// Zeilen kommen aus dem vorigen Stand. Mit --voll wird alles neu gerechnet.
//
//   node scripts/spieler-verlauf.mjs --holen        Manifeste lesen, vorigen Stand und nur neue/geaenderte Spieltage herunterladen
//   node scripts/spieler-verlauf.mjs                rechnen (data/spieler-verlauf -> data/spieler-verlauf-neu)
//   Schalter: --voll (ohne vorigen Stand), --ohne-epic (keine Namen und kein eigenes Konto bei Epic), NAMEN_MINUTEN=25 (Zeit fuer die Namen)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { tagsFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const SPIELTAGE = path.join(DATEN, 'epic-spieltage');
const ALT = path.join(DATEN, 'epic-spieltage-alt');
const VORHER = path.join(DATEN, 'spieler-verlauf');
const ZIEL = path.join(DATEN, 'spieler-verlauf-neu');
const TMP = path.join(DATEN, 'spieler-verlauf-tmp');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
export const RELEASE = 'daten-verlauf';
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';

const arg = new Set(process.argv.slice(2));
const VOLL = arg.has('--voll');
const OHNE_EPIC = arg.has('--ohne-epic');
const NAMEN_MS = (Number(process.env.NAMEN_MINUTEN) || 25) * 60_000;
const TAG_MS = 864e5;
const heute = Math.floor(Date.now() / TAG_MS);

const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex').slice(0, 24);
const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const anhang = (tag, name) => `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;

/** Dieselbe Streuung wie lib/spielerVerlauf.ts (FNV-1a) - fuer die Namensstuecke. */
export function streu(s, n = 4096) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % n;
}
/** Wie lib/spielerVerlauf.ts: klein, ohne Akzente, Leerraum zusammengezogen. */
export function normName(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const praefix = (k) => [...k].slice(0, 3).join('');

/* ------------------------------------------------------------------ Holen */

async function holeText(url, versuche = 4) {
  for (let v = 0; v < versuche; v++) {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) }).catch(() => null);
    if (r?.status === 404) return null;
    if (r?.ok) return Buffer.from(await r.arrayBuffer());
    await warte(3000 * (v + 1));
  }
  throw new Error(`nicht erreichbar: ${url}`);
}

async function holen() {
  fs.mkdirSync(VORHER, { recursive: true });
  // Der vorige Stand: _stand.json, die Stuecke seines Builds, die Namen und das eigene Konto.
  const standRoh = VOLL ? null : await holeText(anhang(RELEASE, '_stand.json'));
  const stand = standRoh ? JSON.parse(standRoh.toString('utf8')) : null;
  if (stand) {
    fs.writeFileSync(path.join(VORHER, '_stand.json'), standRoh);
    const namen = ['namen-stand.json.gz', 'zusatz.json', ...Array.from({ length: 256 }, (_, i) => `verlauf-${stand.build}-${i.toString(16).padStart(2, '0')}.bin`)];
    let n = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (namen.length) {
        const name = namen.shift();
        const b = await holeText(anhang(RELEASE, name));
        if (b) { fs.writeFileSync(path.join(VORHER, name), b); n += 1; }
        else if (name.startsWith('verlauf-')) throw new Error(`${name} fehlt am Release - mit --voll neu rechnen`);
      }
    }));
    console.log(`Voriger Stand ${stand.build}: ${stand.tage.length} Spieltage, ${n} Dateien geholt.`);
  } else console.log('Kein voriger Stand - alles wird gerechnet.');

  // Die Manifeste der Spieltag-Releases, in der umgekehrten Lesereihe von lib/releaseTags.mjs (spaetere gewinnen: Saison-Release und sein Ueberlauf vor dem alten).
  const bekannt = new Map((stand?.tage ?? []).map((t) => [t.w, t.f]));
  const tags = [...tagsFuer('epic-spieltage/')].reverse();
  const wahl = new Map();
  for (const tag of tags) {
    const roh = await holeText(anhang(tag, 'manifest.json')).catch(() => null);
    if (!roh) continue;
    for (const [name, eintrag] of Object.entries(JSON.parse(roh.toString('utf8')))) {
      const m = /^epic-spieltage__(S\d+|LAN)__(.+\.json)$/.exec(name);
      if (!m || m[2].startsWith('_')) continue;
      // Spaetere Tags (Saison-Releases) ersetzen das alte Release.
      wahl.set(`${m[1]}/${m[2]}`, { tag, name, summe: eintrag.summe });
    }
  }
  const laden = [];
  for (const [rel, e] of wahl) {
    const w = rel.split('/')[1].replace(/\.json$/, '');
    if (bekannt.get(w) === e.summe) continue;
    laden.push([rel, e]);
  }
  console.log(`${wahl.size} Spieltage am Release, ${laden.length} neu oder geaendert.`);
  let fertig = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (laden.length) {
      const [rel, e] = laden.shift();
      const b = await holeText(anhang(e.tag, e.name));
      if (!b) continue;
      const ziel = path.join(SPIELTAGE, rel);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, b);
      fertig += 1;
    }
  }));
  console.log(`${fertig} Spieltage heruntergeladen.`);
  // Das alte Archiv (bis 2019) nur beim ersten Lauf - es aendert sich nicht.
  if (!stand && !fs.existsSync(ALT)) console.log('Hinweis: data/epic-spieltage-alt fehlt (der Ablauf entpackt es vorher).');
}

if (arg.has('--holen')) { await holen(); process.exit(0); }

/* ------------------------------------------------------------- Rechnen */

const t0 = Date.now();
const vorher = VOLL ? null : lies(path.join(VORHER, '_stand.json'), null);
const tage = vorher?.tage ? vorher.tage.map((t) => ({ ...t })) : [];
const tagNr = new Map(tage.map((t, i) => [t.w, i]));

// Was das Werkzeug zu den Spieltagen weiss: Titel, Spielart und Quali-Grenze aus dem Katalog, Preisgeld aus Epics Auszahlungstabellen.
const katalog = new Map((lies(path.join(DATEN, 'cup-archiv.json'), []) ?? []).filter((e) => e?.windowId).map((e) => [e.windowId, e]));
const tabellenRoh = lies(path.join(DATEN, 'preisgeld-tabellen.json'), {})?.eintraege ?? [];
const tabelleExakt = new Map();
const tabelleMuster = [];
for (const t of tabellenRoh) {
  if (!t?.stufen?.length) continue;
  if (t.fenster) tabelleExakt.set(t.fenster, t);
  try { if (t.muster && !t.muster.startsWith(`^${t.fenster}$`)) tabelleMuster.push([new RegExp(t.muster), t]); } catch { /* kaputtes Muster */ }
}
const tabelleFuer = (w, region) => tabelleExakt.get(w) ?? tabelleMuster.find(([re, t]) => (!t.region || !region || t.region === region) && re.test(w))?.[1] ?? null;
/** Preisgeld je Person nach der Tabelle - nur Tabellen, die einen einzelnen Tag werten (Finals ueber mehrere Tage zaehlen den Endstand, siehe Verdienst-Akte). */
function preisNachTabelle(t, platz, punkte) {
  if (!t || t.tage !== 'einzeln') return 0;
  if (t.art === 'punkte') {
    let b = 0;
    for (const s of t.stufen) if (typeof s.abPunkte === 'number' && punkte >= s.abPunkte) b = Math.max(b, s.betrag ?? 0);
    return b;
  }
  for (const s of t.stufen) if (typeof s.bis === 'number' && platz <= s.bis) return s.betrag ?? 0;
  return 0;
}
/** Die Quali-Grenze aus der Tabelle: die weiteste Stufe ohne Geld (die traegt nur die Marke fuer die naechste Runde). */
const quoteAusTabelle = (t) => (t?.art === 'platz' ? Math.max(0, ...t.stufen.filter((s) => !s.betrag && typeof s.bis === 'number').map((s) => s.bis)) : 0) || null;
// Die Verdienst-Akte (bekannte Konten, je Fenster der Betrag je Person - auch fuer Finals ueber mehrere Tage).
const verdienst = new Map();
for (const [id, l] of Object.entries(lies(path.join(DATEN, 'verdienst-archiv.json'), {})?.konten ?? {})) {
  for (const [w, , , , , betrag] of l ?? []) if (betrag > 0) verdienst.set(`${id}|${w}`, betrag);
}
console.log(`Katalog ${katalog.size}, Auszahlungstabellen ${tabellenRoh.length}, Verdienst-Akte ${verdienst.size} bezahlte Zeilen.`);

const istReload = (tag, k) => /reload|blastberry|punchberry|piperboot|venture|surfcity/i.test(`${tag.windowId} ${tag.cupId ?? ''} ${tag.titel ?? ''} ${k?.titel ?? ''} ${k?.untertitel ?? ''} ${k?.playlist ?? ''}`);
const istZb = (tag, k) => /(^|_)ZB(_|$)|ZeroBuild|Zero Build|NoBuild/i.test(`${tag.windowId} ${tag.cupId ?? ''} ${k?.untertitel ?? ''} ${k?.playlist ?? ''}`);
const istRanked = (tag) => /ranked/i.test(`${tag.windowId} ${tag.cupId ?? ''} ${tag.titel ?? ''}`);

// Alle Spieltage, die hier liegen: neuer Ordner vor dem alten Archiv, eine Datei je windowId (die Datei, die so heisst wie ihr Fenster, vor Kopien wie "_mg").
const quellen = new Map();
for (const [wurzel, alt] of [[SPIELTAGE, false], [ALT, true]]) {
  for (const ordner of fs.existsSync(wurzel) ? fs.readdirSync(wurzel) : []) {
    const voll = path.join(wurzel, ordner);
    if (!fs.statSync(voll).isDirectory()) continue;
    for (const f of fs.readdirSync(voll).sort()) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const roh = fs.readFileSync(path.join(voll, f));
      let tag;
      try { tag = JSON.parse(roh.toString('utf8')); } catch { continue; }
      if (!tag?.windowId || !Array.isArray(tag.teams) || !tag.teams.length) continue;
      const da = quellen.get(tag.windowId);
      const passtName = f === `${tag.windowId}.json`;
      if (da && (da.alt === alt ? (da.passtName || !passtName) : !da.alt)) continue;
      quellen.set(tag.windowId, { datei: path.join(voll, f), alt, passtName, summe: alt ? `alt:${pruefsumme(roh)}` : pruefsumme(roh) });
    }
  }
}
// Neu oder geaendert?
const geaendert = new Set();
for (const [w, q] of quellen) {
  const i = tagNr.get(w);
  if (i === undefined) { tagNr.set(w, tage.length); tage.push({ w, f: q.summe }); geaendert.add(tagNr.get(w)); continue; }
  if (tage[i].f !== q.summe) geaendert.add(i);
}
console.log(`${quellen.size} Spieltage hier, ${tage.length} im Index, ${geaendert.size} werden (neu) gelesen.`);

// Zwischenablage je Stueck (zwei Zeichen): eine Zeile je Konto und Spieltag.
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const puffer = new Map();
let pufferGroesse = 0;
const leeren = (alle = false) => {
  for (const [k, teile] of puffer) {
    if (!alle && teile.join('').length < 1 << 20) continue;
    fs.appendFileSync(path.join(TMP, `${k}.tsv`), teile.join(''));
    puffer.delete(k);
  }
  pufferGroesse = [...puffer.values()].reduce((a, t) => a + t.length, 0);
};
const zeileAblegen = (id, text) => {
  const k = id.slice(0, 2);
  const l = puffer.get(k) ?? puffer.set(k, []).get(k);
  l.push(text);
  if (++pufferGroesse > 400_000) leeren(true);
};

const neueIds = new Set();
let zeilenNeu = 0;
for (const i of [...geaendert].sort((a, b) => a - b)) {
  const q = quellen.get(tage[i].w);
  const tag = lies(q.datei, null);
  if (!tag) continue;
  const k = katalog.get(tag.windowId);
  const tabelle = tabelleFuer(tag.windowId, tag.region);
  const quote = (k?.qualifiziert > 0 ? k.qualifiziert : null) ?? quoteAusTabelle(tabelle);
  const nachPlatz = new Map(tag.teams.map((t) => [t.platz, t.punkte]));
  const titel = tag.titel && tag.titel !== tag.windowId ? tag.titel : (k?.titel ?? '');
  tage[i] = {
    w: tag.windowId, f: q.summe, e: tag.eventId ?? '', t: titel, r: tag.region ?? '', s: tag.season ?? (/^S\d+/.exec(tag.windowId)?.[0] ?? ''),
    d: tag.datum ?? 0, n: tag.teams.length,
    ...(tag.gekuerzt ? { g: 1 } : {}),
    ...(quote ? { q: quote, ...(nachPlatz.has(quote) ? { qp: nachPlatz.get(quote) } : {}) } : {}),
    m: istReload(tag, k) ? 'reload' : 'br', ...(istZb(tag, k) ? { zb: 1 } : {}), ...(istRanked(tag) ? { rk: 1 } : {}),
    ...(tag.istFinale ? { fi: 1 } : {}),
  };
  for (const t of tag.teams) {
    const spieler = (t.spieler ?? []).filter((x) => /^[0-9a-f]{32}$/.test(x));
    for (const id of spieler) {
      const preis = verdienst.get(`${id}|${tag.windowId}`) ?? preisNachTabelle(tabelle, t.platz, t.punkte);
      zeileAblegen(id, `${id}\t${i}\t${t.platz}\t${t.punkte ?? 0}\t${t.matches ?? 0}\t${preis}\t${spieler.filter((x) => x !== id).join(',')}\t0\n`);
      neueIds.add(id);
      zeilenNeu += 1;
    }
  }
}
leeren(true);
console.log(`${zeilenNeu} Zeilen aus ${geaendert.size} Spieltagen, ${neueIds.size} Konten darin (${Math.round((Date.now() - t0) / 1000)} s).`);

/* --------------------------------------------- Epic: Namen und eigenes Konto */

// Namen: { id: [name, geprueftTag, ...alteNamen] } - wer noch nie geprueft wurde, hat Tag 0.
const namen = new Map();
{
  let roh = null;
  try { roh = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(VORHER, 'namen-stand.json.gz'))).toString('utf8')); } catch { /* erster Lauf */ }
  for (const [id, v] of Object.entries(roh ?? {})) namen.set(id, v);
  // Die Namen, die das Werkzeug ohnehin kennt (taeglich fuer die Pros erneuert), zaehlen als geprueft am Tag ihrer Datei.
  const epicNamen = lies(path.join(DATEN, 'epic-namen.json'), {});
  let neu = 0;
  for (const [id, name] of Object.entries(epicNamen)) {
    if (!name || !/^[0-9a-f]{32}$/.test(id)) continue;
    const da = namen.get(id);
    if (!da) { namen.set(id, [name, heute - 1]); neu += 1; continue; }
    if (da[0] !== name && !da[0]) { da[0] = name; }
  }
  for (const id of neueIds) if (!namen.has(id)) namen.set(id, ['', 0]);
  console.log(`Namen: ${namen.size} Konten, ${neu} aus epic-namen.json, ${[...namen.values()].filter((v) => v[0]).length} mit Namen.`);
}
/** Einen neuen Namen eintragen - der alte wandert zu den alten Namen. */
const nameSetzen = (id, name) => {
  const da = namen.get(id) ?? ['', 0];
  if (name && da[0] && da[0] !== name && !da.slice(2).includes(da[0])) da.push(da[0]);
  if (name) da[0] = name;
  da[1] = heute;
  namen.set(id, da);
};

const zusatz = lies(path.join(VORHER, 'zusatz.json'), {}) ?? {};
let zugang = null;
if (!OHNE_EPIC) {
  try {
    const { holeNutzerToken, verwirfNutzerToken } = await import('../lib/replayKern.mjs');
    zugang = { holeNutzerToken, verwirfNutzerToken };
    await holeNutzerToken();
  } catch (e) { console.log(`Epic: keine Anmeldung (${e.message}) - Namen und eigenes Konto bleiben, wie sie sind.`); zugang = null; }
}

async function epic(url) {
  for (let v = 0; v < 5; v++) {
    const { token } = await zugang.holeNutzerToken();
    const r = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404 || r?.status === 400 || r?.status === 403) return { fehler: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
    if (r?.status === 401) zugang.verwirfNutzerToken();
    await warte(r?.status === 429 ? (Number(r.headers.get('retry-after')) || 20) * 1000 : 1500 * (v + 1));
  }
  return null;
}

if (zugang) {
  // 1. Namen: zuerst die Konten der neuen Spieltage, die noch keinen Namen haben oder deren Pruefung ueber eine Woche her ist, dann alle anderen ohne Namen.
  const bis = Date.now() + NAMEN_MS;
  const offen = [];
  for (const id of neueIds) { const v = namen.get(id); if (!v[0] || heute - v[1] > 7) offen.push(id); }
  const schon = new Set(offen);
  for (const [id, v] of namen) if (!schon.has(id) && v[1] === 0) offen.push(id);
  let gefragt = 0, gefunden = 0, gebremst = 0;
  const stuecke = [];
  for (let i = 0; i < offen.length; i += 100) stuecke.push(offen.slice(i, i + 100));
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (stuecke.length && Date.now() < bis) {
      const teil = stuecke.shift();
      const { token } = await zugang.holeNutzerToken();
      const r = await fetch(`${ACCOUNT}/account/api/public/account?${teil.map((id) => `accountId=${id}`).join('&')}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (r?.status === 429) { gebremst += 1; stuecke.push(teil); await warte((Number(r.headers.get('retry-after')) || 15) * 1000); continue; }
      if (r?.status === 401) { zugang.verwirfNutzerToken(); stuecke.push(teil); continue; }
      if (!r?.ok) { await warte(2000); continue; }
      const da = new Set();
      for (const k of await r.json()) {
        const n = k.displayName || Object.values(k.externalAuths ?? {}).map((e) => e.externalDisplayName).find(Boolean);
        if (n) { nameSetzen(k.id, n); gefunden += 1; da.add(k.id); }
      }
      // Was Epic nicht kennt (geloescht), gilt als geprueft - sonst fragt jeder Lauf erneut.
      for (const id of teil) if (!da.has(id)) { const v = namen.get(id) ?? ['', 0]; v[1] = heute; namen.set(id, v); }
      gefragt += teil.length;
    }
  }));
  console.log(`Namen bei Epic: ${gefragt} gefragt, ${gefunden} gefunden, ${gebremst}x gebremst, ${stuecke.length * 100} bleiben fuer den naechsten Lauf (${offen.length} offen).`);

  // 2. Das eigene Konto (der Zugang der Laeufe): Epic gibt seinen Eintrag heraus, auch weit hinter Platz 10.000 (replays-live-sammler.mjs) - in den Listen fehlt er dort.
  const { accountId: eigen } = await zugang.holeNutzerToken();
  const seit = Date.now() - 60 * TAG_MS;
  // Erst ab acht Stunden nach dem Start: solange der Cup laeuft, aendert sich der Platz noch.
  const reif = Date.now() - 8 * 3600_000;
  /*
   * Bei Duos und Trios gibt Epic den Eintrag nur heraus, wenn teamAccountIds das ganze Team nennt (16.11.2026: der Reload ZB Duos Cash Cup EU vom 15.11.
   * kam mit dem eigenen Konto allein leer zurueck, obwohl das Konto in den Replays dieses Tages steht). Darum dazu die letzten Mitspieler, die haeufigsten zuerst.
   * Fassung 2: alte leere Eintraege von Team-Spieltagen werden einmal neu gefragt.
   */
  if (zusatz._v !== 2) { for (const [w, v] of Object.entries(zusatz)) if (v === null && /Duo|Trio|Squad/i.test(w)) delete zusatz[w]; zusatz._v = 2; }
  const mitZahl = new Map();
  const mitNehmen = (l) => { for (const m of l ?? []) if (m !== eigen) mitZahl.set(m, (mitZahl.get(m) ?? 0) + 1); };
  for (const v of Object.values(zusatz)) if (v && v.spieler) mitNehmen(v.spieler);
  if (vorher?.lage) {
    try {
      const [start, laenge] = vorher.lage[parseInt(eigen.slice(0, 3), 16)];
      const b = fs.readFileSync(path.join(VORHER, `verlauf-${vorher.build}-${eigen.slice(0, 2)}.bin`)).subarray(start, start + laenge);
      for (const r of (JSON.parse(zlib.gunzipSync(b).toString('utf8'))[eigen]?.z ?? []).slice(0, 40)) mitNehmen(r[5]);
    } catch { /* ohne vorigen Stand nur die neuen Spieltage */ }
  }
  const teamGroesse = new Map();
  for (const i of geaendert) {
    const q = quellen.get(tage[i].w);
    if (!q || (tage[i].d ?? 0) < seit) continue;
    const tag = lies(q.datei, null);
    teamGroesse.set(tage[i].w, Math.max(1, ...(tag?.teams ?? []).slice(0, 50).map((x) => (x.spieler ?? []).length)));
    for (const x of tag?.teams ?? []) if ((x.spieler ?? []).includes(eigen)) mitNehmen(x.spieler);
  }
  const mitspieler = [...mitZahl].sort((a, b) => b[1] - a[1]).map(([m]) => m).slice(0, 6);
  const istTeam = (w) => (teamGroesse.get(w) ?? (/Duo|Trio|Squad/i.test(w) ? 2 : 1)) > 1;
  let geprueft = 0, ergaenzt = 0;
  for (const t of tage) {
    if (!t.e || (t.d ?? 0) < seit || (t.d ?? 0) > reif || t.n < 9000 || t.w in zusatz || geprueft >= 600) continue;
    // Steht das Konto schon in der Liste, ist nichts zu ergaenzen (null = geprueft, nichts dahinter).
    const q = quellen.get(t.w);
    if (q && fs.readFileSync(q.datei, 'utf8').includes(eigen)) { zusatz[t.w] = null; continue; }
    let e = null, fehler = false;
    for (const team of [[eigen], ...(istTeam(t.w) ? mitspieler.map((m) => [eigen, m]) : [])]) {
      const j = await epic(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(t.e)}/${encodeURIComponent(t.w)}/${eigen}?page=0&rank=0&teamAccountIds=${team.join(',')}`);
      geprueft += 1;
      if (!j || j.fehler) { fehler = true; break; }
      e = (j.entries ?? []).find((x) => (x.teamAccountIds ?? []).includes(eigen)) ?? null;
      if (e) break;
    }
    if (fehler) continue;
    zusatz[t.w] = e && e.rank > t.n ? { platz: e.rank, punkte: e.pointsEarned ?? 0, matches: (e.sessionHistory ?? []).length, spieler: e.teamAccountIds ?? [eigen] } : null;
    if (zusatz[t.w]) ergaenzt += 1;
  }
  console.log(`Eigenes Konto ${eigen.slice(0, 8)}: ${geprueft} Spieltage geprueft, ${ergaenzt} Platzierungen hinter der Liste ergaenzt.`);

  // 3. Probe (nur Protokoll): gibt Epic auch FREMDE Konten hinter Platz 10.000 heraus? Konten aus Tag 2, die an Tag 1 nicht unter den ersten 10.000 standen.
  try {
    const t1 = tage.find((t) => /FNCSSoloReloadQualifiers_Qual1Round1Day1_EU$/.test(t.w));
    const q1 = t1 && quellen.get(t1.w); const q2 = quellen.get(t1?.w.replace('Day1', 'Day2'));
    if (q1 && q2) {
      const in1 = new Set(lies(q1.datei, { teams: [] }).teams.flatMap((t) => t.spieler));
      const kandidaten = lies(q2.datei, { teams: [] }).teams.flatMap((t) => t.spieler).filter((id) => !in1.has(id) && id !== eigen).slice(500, 503);
      for (const id of kandidaten) {
        const a = await epic(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(t1.e)}/${encodeURIComponent(t1.w)}/${eigen}?page=0&rank=0&teamAccountIds=${id}`);
        const ea = (a?.entries ?? []).find((x) => (x.teamAccountIds ?? []).includes(id));
        const h = await epic(`${EVENTS}/api/v1/events/Fortnite/${encodeURIComponent(t1.e)}/history/${id}`);
        const eh = Array.isArray(h) ? h.find((x) => x.scoreKey?.eventWindowId === t1.w) : null;
        console.log(`PROBE ${id.slice(0, 8)} teamAccountIds: ${ea ? `Platz ${ea.rank}` : 'nicht dabei'} | history: ${eh ? `Platz ${eh.rank} ${eh.pointsEarned} Pkt` : JSON.stringify(h)?.slice(0, 160)}`);
      }
    }
  } catch (e) { console.log(`PROBE gescheitert: ${e.message}`); }
}
// Die Zusatz-Zeilen gehen bei jedem Lauf neu hinein (Kennung 1 - die alten fallen beim Zusammenlegen heraus).
for (const [w, t] of Object.entries(zusatz)) {
  const i = tagNr.get(w);
  if (!t || typeof t !== 'object' || i === undefined) continue;
  for (const id of t.spieler) {
    zeileAblegen(id, `${id}\t${i}\t${t.platz}\t${t.punkte}\t${t.matches}\t0\t${t.spieler.filter((x) => x !== id).join(',')}\t1\n`);
    if (!namen.has(id)) namen.set(id, ['', 0]);
  }
}
leeren(true);

/* ------------------------------------------------- Preisgeld wie "Most earnings" */

/*
 * Das Preisgeld jeder Zeile kommt aus derselben Rechnung wie "Most earnings" (lib/szeneStats geldRechnen, vorgerechnet vom stuendlichen Lauf als
 * Antwort "ansicht=verdienst-posten"): je Konto jeder Posten mit Fenster, Betrag, Platz und Punkten. Der Betreiber (17.11.2026): Vico stand im
 * Profil mit 167.105 Dollar gesamt, in "Most earnings 2026" mit 365.025 allein fuer das Jahr. Der Verlauf kannte nur die Epic-Spieltage dieses
 * Index - die Grand Finals der Majors (Platzierungen aus Epics Bestenliste, data/platzierungen), die Global Championship, die LANs (veroeffentlichte
 * Preislisten) und die Finals ueber zwei Tage (Endstand) fehlten ganz oder ohne Geld.
 *
 *   - Steht ein Posten zu einem Spieltag, den die Zeile schon hat: Betrag (und bei Finals der Endstand) aus dem Posten.
 *   - Fehlt die Zeile: sie kommt dazu (Kennung 2 - beim naechsten Lauf wieder aus den Posten, nie aus dem vorigen Stand).
 *   - Jede andere Zeile hat kein Preisgeld - die Summe im Profil ist so genau der Betrag in "Most earnings" aller Zeiten.
 * Liegt die Antwort nicht vor, bleibt es bei der alten Rechnung (Verdienst-Akte und Tabellen je Tag).
 */
const postenRoh = lies(path.join(DATEN, 'antworten', 'szene_ansicht=verdienst-posten.json'), null);
const posten = postenRoh?.wert?.konten ? postenRoh.wert : (postenRoh?.konten ? postenRoh : null);
/** Fensternummer der Posten -> Spieltag im Index (neue Spieltage werden angelegt). */
const postenTag = [];
if (posten) {
  let neu = 0;
  for (const f of posten.fenster) {
    let i = tagNr.get(f.w);
    const kopf = {
      w: f.w, f: 'posten', e: f.e ?? '',
      // Die Titel tragen die Runde oft schon ("FNCS Major 2 - Grand Finals Day 2"); die Seite setzt sie selbst dazu. Ein Titel ohne Leerzeichen
      // ist nur die Fensterkennung - dann sucht die Seite den Namen (lib/rundenName).
      t: (() => { const k = String(f.t ?? '').split(' - ')[0].trim(); return /\s/.test(k) ? k : ''; })(),
      r: f.r ?? '', s: f.s ?? '', d: f.d ?? 0, n: f.n ?? 0,
      m: istReload({ windowId: f.w, titel: f.t }, null) ? 'reload' : 'br', ...(istZb({ windowId: f.w }, null) ? { zb: 1 } : {}),
      ...(/final/i.test(f.w) || f.q === 'lan' ? { fi: 1 } : {}),
    };
    if (i === undefined) { i = tage.length; tagNr.set(f.w, i); tage.push(kopf); neu += 1; }
    else if (tage[i].f === 'posten') tage[i] = kopf;
    else {
      // Ein Spieltag aus den Listen: nur fehlende Angaben ergaenzen (Datum, Titel, Region).
      if (!tage[i].d && kopf.d) tage[i].d = kopf.d;
      if (!tage[i].t && kopf.t) tage[i].t = kopf.t;
      if (!tage[i].r && kopf.r) tage[i].r = kopf.r;
      // Die LAN-Tage liegen unter "LAN" - zaehlen aber zu ihrer Saison (wie in "Most earnings" je Jahr).
      if (!/^S\d+$/.test(tage[i].s ?? '') && /^S\d+$/.test(kopf.s)) tage[i].s = kopf.s;
    }
    postenTag.push(i);
  }
  const summe = Object.values(posten.summen ?? {}).reduce((a, b) => a + b, 0);
  console.log(`Preisgeld-Posten (${posten.erstellt ?? '?'}): ${Object.keys(posten.konten).length} Konten, ${posten.fenster.length} Spieltage (${neu} neu im Index), zusammen ${summe} Dollar.`);
} else console.log('Preisgeld-Posten fehlen (antworten/szene_ansicht=verdienst-posten.json) - Preisgeld nach Verdienst-Akte und Tabellen.');

/* ------------------------------------------------------- Stuecke schreiben */

const build = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });
// Power Ranking: Platz und Punkte je Konto (die ersten 10.000 weltweit).
const prRoh = lies(path.join(DATEN, 'power-rankings', 'global.json'), null);
const pr = new Map((prRoh?.spieler ?? []).filter((x) => x?.id).map((x) => [String(x.id).replace(/-/g, '').toLowerCase(), [x.rank, x.wertung ?? 0]]));
const vorherLage = vorher?.lage ?? null;
const lage = [];
const namenEimer = Array.from({ length: 4096 }, () => []);
let konten = 0, zeilen = 0, groesse = 0, groesstes = 0;
const regionZaehlen = (z) => {
  const c = new Map();
  for (const r of z.slice(0, 30)) { const reg = tage[r[0]]?.r; if (reg) c.set(reg, (c.get(reg) ?? 0) + 1); }
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

for (let a = 0; a < 256; a++) {
  const k2 = a.toString(16).padStart(2, '0');
  // Die vorigen Zeilen dieses Stuecks, ohne die neu gelesenen Spieltage und ohne die Zusatz-Zeilen.
  const konto = new Map();
  if (vorherLage) {
    const datei = fs.readFileSync(path.join(VORHER, `verlauf-${vorher.build}-${k2}.bin`));
    for (let b = 0; b < 16; b++) {
      const [start, laenge] = vorherLage[a * 16 + b];
      if (!laenge) continue;
      const stueck = JSON.parse(zlib.gunzipSync(datei.subarray(start, start + laenge)).toString('utf8'));
      for (const [id, e] of Object.entries(stueck)) {
        const z = e.z.filter((r) => !geaendert.has(r[0]) && !r[6]);
        if (z.length) konto.set(id, z);
      }
    }
  }
  // Konten, die nur Posten haben (z. B. ein Grand Final ohne einen einzigen Epic-Spieltag in diesem Index).
  if (posten) for (const id of Object.keys(posten.konten)) if (id.startsWith(k2) && !konto.has(id)) konto.set(id, []);
  const tmp = path.join(TMP, `${k2}.tsv`);
  if (fs.existsSync(tmp)) {
    for (const l of fs.readFileSync(tmp, 'utf8').split('\n')) {
      if (!l) continue;
      const [id, d, platz, punkte, matches, preis, mit, extra] = l.split('\t');
      const z = konto.get(id) ?? konto.set(id, []).get(id);
      const r = [+d, +platz, +punkte, +matches, +preis, mit ? mit.split(',') : []];
      if (extra === '1') r.push(1);
      z.push(r);
    }
    fs.rmSync(tmp);
  }
  const datei = [];
  let pos = 0;
  const gruppen = Array.from({ length: 16 }, () => ({}));
  for (const [id, z0] of konto) {
    // Je Spieltag eine Zeile: Epics Liste fuehrt ein Konto nach einem Teamwechsel manchmal doppelt - es zaehlt die mit den meisten Punkten (wie ohneDoppelte).
    const je = new Map();
    for (const r of z0) { const da = je.get(r[0]); if (!da || r[2] > da[2] || (r[2] === da[2] && r[1] < da[1])) je.set(r[0], r); }
    if (posten) {
      // Je Spieltag der Betrag (mehrere Posten zum selben Fenster, z. B. Tabelle und LAN, zaehlen zusammen) - wie in "Most earnings".
      const geldJeTag = new Map();
      for (const [fi, betrag, platz, punkte, mit] of posten.konten[id] ?? []) {
        const i = postenTag[fi];
        if (i === undefined) continue;
        const g = geldJeTag.get(i);
        if (g) g.b += betrag; else geldJeTag.set(i, { b: betrag, p: platz, pk: punkte, mit: mit ?? [], tag: posten.fenster[fi].q === 'tag' });
      }
      for (const r of je.values()) {
        const g = geldJeTag.get(r[0]);
        r[4] = g ? g.b : 0;
        // Finals ueber mehrere Tage: der Endstand, nach dem bezahlt wurde (lib/szeneStats platzKarte).
        if (g?.tag && typeof g.p === 'number' && g.p > 0 && !r[6]) { r[1] = g.p; if (typeof g.pk === 'number') r[2] = g.pk; }
      }
      for (const [i, g] of geldJeTag) {
        if (!je.has(i)) je.set(i, [i, g.p ?? 0, g.pk ?? 0, 0, g.b, g.mit, 2]);
      }
    }
    const z = [...je.values()].sort((x, y) => (tage[y[0]]?.d ?? 0) - (tage[x[0]]?.d ?? 0) || y[0] - x[0]);
    if (!z.length) continue;
    const v = namen.get(id) ?? ['', 0];
    const m = {};
    for (const r of z) for (const mid of r[5]) { const n = namen.get(mid)?.[0]; if (n) m[mid] = n; }
    const eintrag = { ...(v[0] ? { n: v[0] } : {}), ...(v.length > 2 ? { a: v.slice(2) } : {}), ...(pr.has(id) ? { pr: pr.get(id) } : {}), z, ...(Object.keys(m).length ? { m } : {}) };
    gruppen[parseInt(id[2], 16)][id] = eintrag;
    konten += 1; zeilen += z.length;
    // Fuer die Namenssuche: der Name, jedes weitere Wort ab drei Zeichen, und die alten Namen.
    const region = regionZaehlen(z);
    const alle = [[v[0], 0], ...v.slice(2).map((n) => [n, 1])];
    for (const [name, alt] of alle) {
      if (!name) continue;
      const voll = normName(name);
      const schluessel = new Set([voll, ...voll.split(/[\s_.\-]+/).slice(1).filter((w) => [...w].length >= 3)]);
      for (const s of schluessel) {
        if ([...s].length < 3) continue;
        namenEimer[streu(praefix(s))].push([s, name, id, z.length, region, ...(alt && v[0] ? [1, v[0]] : [])]);
      }
    }
  }
  for (let b = 0; b < 16; b++) {
    const gz = zlib.gzipSync(JSON.stringify(gruppen[b]), { level: 9 });
    lage.push([pos, gz.length]);
    datei.push(gz);
    pos += gz.length;
    groesstes = Math.max(groesstes, gz.length);
  }
  fs.writeFileSync(path.join(ZIEL, `verlauf-${build}-${k2}.bin`), Buffer.concat(datei));
  groesse += pos;
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${konten} Konten, ${zeilen} Zeilen, ${(groesse / 1e6).toFixed(1)} MB gepackt, groesstes Stueck ${(groesstes / 1e3).toFixed(0)} KB (${Math.round((Date.now() - t0) / 1000)} s).`);

// Die Namenssuche: je Stueck nach Treffern (exakt zuerst) und Spieltagen sortiert.
const namenLage = [];
{
  const teile = [];
  let pos = 0, eintraege = 0, groesstesN = 0;
  for (const eimer of namenEimer) {
    eimer.sort((x, y) => y[3] - x[3]);
    eintraege += eimer.length;
    const gz = zlib.gzipSync(JSON.stringify(eimer), { level: 9 });
    namenLage.push([pos, gz.length]);
    teile.push(gz);
    pos += gz.length;
    groesstesN = Math.max(groesstesN, gz.length);
  }
  fs.writeFileSync(path.join(ZIEL, `namen-${build}.bin`), Buffer.concat(teile));
  console.log(`Namenssuche: ${eintraege} Schluessel, ${(pos / 1e6).toFixed(1)} MB, groesstes Stueck ${(groesstesN / 1e3).toFixed(0)} KB.`);
}

// Der Stand fuer den naechsten Lauf und fuer die Seite.
fs.writeFileSync(path.join(ZIEL, 'namen-stand.json.gz'), zlib.gzipSync(JSON.stringify(Object.fromEntries(namen))));
fs.writeFileSync(path.join(ZIEL, 'zusatz.json'), JSON.stringify(zusatz));
const saisons = {};
for (const t of tage) { const s = saisons[t.s] ?? (saisons[t.s] = { tage: 0, voll: 0 }); s.tage += 1; if (!t.g) s.voll += 1; }
fs.writeFileSync(path.join(ZIEL, '_stand.json'), JSON.stringify({
  build, erstellt: new Date().toISOString(), konten, zeilen, namen: [...namen.values()].filter((v) => v[0]).length,
  prStand: prRoh?.geholt ?? null, prTop: Math.max(0, ...[...pr.values()].map((x) => x[0])), saisons, tage, lage, namenLage,
}));
console.log(`Fertig: Build ${build} in ${Math.round((Date.now() - t0) / 1000)} s.`);
