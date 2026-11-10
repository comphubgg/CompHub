// Die Teilstaende der vollen Replays (scripts/clutch-berechnen.mjs --verteilt) in die Spieltags-Dateien einarbeiten.
//
// Jeder Rechner liest von jedem offenen Spieltag jedes N-te Match und legt nur seinen Teil ab: data/clutch-teil/<windowId>__<n>.json. Hier - an einer
// einzigen Stelle, im Schritt "ablegen" - kommen die Teile auf den Stand vom Release: Matches anhaengen, Summen addieren (Clutch-Punkte, Schaden,
// Treffer, Sturmzeit, Reboots, Spiele, Ueberlebenszeit), Plattform je Spieler, Matches ohne Replay merken. Solange nicht jedes bekannte Match gelesen ist,
// steht "teilweise" in der Datei - die Seite zeigt Werte dann nur bei Spielern, deren Spiele alle gelesen sind (app/api/cup-spieler).
//
// Rohdaten (Kill-Feed, Figuren - fuer spaetere Neuberechnungen) gibt es nur bei kleinen Spieltagen (bis 250 Matches). Grosse Spieltage tragen
// "ohneRohRechnung": clutch-neu-rechnen.mjs und clutch-leben.mjs rechnen sie nicht aus Rohdaten neu, denn die decken dort nur einen Teil ab.
//
//   node scripts/clutch-zusammen.mjs

import fs from 'node:fs';
import path from 'node:path';
import { JE_SPALTEN, alteZeile, jeDatei, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const TEILE = path.join(DATEN, 'clutch-teil');
const ZIEL = path.join(DATEN, 'clutch');
const ROH = path.join(DATEN, 'clutch-roh');
const JE = path.join(DATEN, 'clutch-je');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';

/** Die Werte je Match, die schon am Release liegen (lib/jeSpiel.mjs) - das Repo ist oeffentlich, ein einfacher Abruf genuegt. Fehlt die Datei, ist es der erste Lauf. */
async function jeVomRelease(w) {
  const name = `clutch-je/${w}.json`;
  const lokal = path.join(DATEN, name);
  if (fs.existsSync(lokal)) return fs.readFileSync(lokal);
  const url = `https://github.com/${REPO}/releases/download/${tagFuer(name)}/${name.replace(/\//g, '__')}`;
  for (let v = 0; v < 3; v += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (r.status === 404) return null;
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* noch einmal */ }
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new Error(`${name} nicht lesbar`);
}
const GROSS_MAX = 250;
const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const addiere = (ziel, quelle) => { for (const [k, v] of Object.entries(quelle ?? {})) ziel[k] = (ziel[k] ?? 0) + v; };

const jeTag = new Map();
for (const f of fs.existsSync(TEILE) ? fs.readdirSync(TEILE).filter((x) => x.endsWith('.json')) : []) {
  const w = f.replace(/__\d+\.json$/, '');
  jeTag.set(w, [...(jeTag.get(w) ?? []), path.join(TEILE, f)]);
}

fs.mkdirSync(ZIEL, { recursive: true });
fs.mkdirSync(ROH, { recursive: true });
let tage = 0; let neu = 0; let fertigTage = 0;
for (const [w, dateien] of jeTag) {
  const zielDatei = path.join(ZIEL, `${w}.json`);
  const alt = liesDatei(zielDatei);
  // Vor Fassung 4 (alte Schadensregel) wird nichts weitergefuehrt - der Spieltag ist ganz neu gelesen.
  // Ein Spieltag, den der Plan neu lesen liess (neuAnfang), faengt ebenfalls leer an - die alten Werte wuerden sonst doppelt zaehlen.
  const neuAnfang = dateien.some((datei) => liesDatei(datei)?.neuAnfang);
  const d = alt && (alt.version ?? 0) >= 4 && !neuAnfang ? alt : { version: 4, schadenFassung: 17, windowId: w, matches: [], summe: {}, spiele: {} };
  d.matches ??= []; d.summe ??= {}; d.spiele ??= {}; d.ohne ??= [];
  const da = new Set([...d.matches.map((m) => m.id), ...d.ohne]);
  // Die Werte je Match: erst, wenn ein Teil welche bringt, wird der alte Stand geholt. Laesst er sich nicht lesen, bleibt die Datei diesmal, wie sie ist.
  let je = null; let jeNeu = false; let jeKaputt = false;
  const jeLaden = async () => {
    if (je || jeKaputt) return je;
    try {
      const alt = d.je && !neuAnfang ? await jeVomRelease(w) : null;
      je = alt ? jeLesen(alt) : {};
    } catch (e) { console.log(`  ${w}: ${e.message} - Werte je Match diesmal nicht weitergefuehrt`); jeKaputt = true; return null; }
    if (d.jeSpiel) { for (const [k, v] of Object.entries(d.jeSpiel)) (je[k] ??= []).push(...v.map(alteZeile)); delete d.jeSpiel; jeNeu = true; }
    return je;
  };
  const rohDatei = path.join(ROH, `${w}.json`);
  if (neuAnfang) fs.rmSync(rohDatei, { force: true });
  let roh = null;
  for (const datei of dateien) {
    const t = liesDatei(datei);
    if (!t) continue;
    d.eventId ??= t.eventId;
    if (t.regeln?.length && !d.regeln?.length) d.regeln = t.regeln;
    d.gesamt = Math.max(d.gesamt ?? 0, t.gesamt ?? 0);
    const gross = d.gesamt > GROSS_MAX;
    // Ein Teil traegt nur Matches, die der Rechner zu Beginn offen sah - schon vorhandene kommen nicht doppelt.
    // Ein frueher als "ohne Replay" vermerktes Match darf nachgelesen werden - es zaehlt dann nicht als "stand schon da".
    const ohneSet = new Set(d.ohne);
    const neuHier = (t.matches ?? []).filter((m) => !da.has(m.id) || ohneSet.has(m.id));
    if (neuHier.length !== (t.matches ?? []).length) {
      console.log(`  ${w}: ${t.matches.length - neuHier.length} Matches standen schon da - Teil ${path.basename(datei)} uebersprungen`);
      continue;
    }
    for (const m of neuHier) { d.matches.push(m); da.add(m.id); }
    for (const id of t.ohne ?? []) if (!da.has(id)) { d.ohne.push(id); da.add(id); }
    /*
     * Ein Match, das in drei Laeufen scheitert (Leser stuerzt ab, Download bricht immer wieder), gilt als ohne lesbares Replay (31.10.2026). Vorher
     * blieb ein Spieltag wegen ein, zwei solcher Matches fuer immer "teilweise" - und jeder Lauf verlor Zeit mit denselben Fehlern.
     */
    // Erfolgreich nachgelesene Matches aus "ohne" streichen; Zeitpunkt des letzten Versuchs fuer die Wiederholung merken (scripts/clutch-berechnen.mjs).
    if ((t.matches ?? []).length && d.ohne?.length) { const neuGelesen = new Set(t.matches.map((m) => m.id)); d.ohne = d.ohne.filter((id) => !neuGelesen.has(id)); }
    d.ohneVersucht = new Date().toISOString();
    for (const id of t.fehler ?? []) {
      if (da.has(id)) continue;
      d.fehlversuche ??= {};
      d.fehlversuche[id] = (d.fehlversuche[id] ?? 0) + 1;
      if (d.fehlversuche[id] >= 3) { d.ohne.push(id); da.add(id); delete d.fehlversuche[id]; }
    }
    addiere(d.summe, t.summe);
    if (t.jeSpiel && await jeLaden()) {
      for (const [k, v] of Object.entries(t.jeSpiel)) (je[k] ??= []).push(...(t.jeSpalten ? v : v.map(alteZeile)));
      jeNeu = true;
    }
    addiere(d.spiele, t.spiele);
    if (Object.keys(t.solo ?? {}).length) { d.solo ??= {}; addiere(d.solo, t.solo); }
    if (Object.keys(t.leben ?? {}).length) { d.leben ??= {}; addiere(d.leben, t.leben); }
    // Laufstrecke je Spieler [zu Fuss, Luft] in Metern (lib/replayPositionen).
    if (Object.keys(t.strecke ?? {}).length) {
      d.strecke ??= {};
      for (const [k, v] of Object.entries(t.strecke)) { const s = d.strecke[k] ?? [0, 0]; d.strecke[k] = [s[0] + (v[0] ?? 0), s[1] + (v[1] ?? 0)]; }
    }
    if (Object.keys(t.schaden ?? {}).length) {
      d.schaden ??= {};
      for (const [k, v] of Object.entries(t.schaden)) {
        const s = d.schaden[k] ?? { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
        for (const f of Object.keys(v)) s[f] = (s[f] ?? 0) + (v[f] ?? 0);
        d.schaden[k] = s;
      }
    }
    if (Object.keys(t.plattform ?? {}).length) { d.plattform ??= {}; Object.assign(d.plattform, t.plattform); }
    if (Object.keys(t.namen ?? {}).length) { d.namen ??= {}; Object.assign(d.namen, t.namen); }
    if (gross) d.ohneRohRechnung = true;
    else if ((t.roh ?? []).length) {
      roh ??= liesDatei(rohDatei) ?? { eventId: d.eventId, windowId: w, regeln: d.regeln ?? [], matches: [] };
      const rohDa = new Set(roh.matches.map((m) => m.id));
      for (const m of t.roh) if (!rohDa.has(m.id)) roh.matches.push(m);
    }
    neu += neuHier.length;
  }
  const gelesen = d.matches.length;
  const erledigt = gelesen + d.ohne.length;
  if (erledigt < (d.gesamt ?? 0)) d.teilweise = { teams: 0, matches: gelesen, vonMindestens: d.gesamt };
  else { delete d.teilweise; fertigTage += 1; }
  d.gerechnet = new Date().toISOString();
  if (jeNeu && je) {
    const { inhalt, lage } = jeDatei(je);
    fs.mkdirSync(JE, { recursive: true });
    fs.writeFileSync(path.join(JE, `${w}.json`), inhalt);
    d.je = { spalten: JE_SPALTEN, lage, bytes: inhalt.length };
  }
  fs.writeFileSync(zielDatei, JSON.stringify(d));
  if (roh) fs.writeFileSync(rohDatei, JSON.stringify(roh));
  tage += 1;
}
console.log(`Zusammengefuehrt: ${neu} neue Matches in ${tage} Spieltagen, davon ${fertigTage} jetzt ganz gelesen.`);
