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
import { JE_SPALTEN, alteZeile, jeDatei, jeFehltVon, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const TEILE = path.join(DATEN, 'clutch-teil');
const ZIEL = path.join(DATEN, 'clutch');
const ROH = path.join(DATEN, 'clutch-roh');
const JE = path.join(DATEN, 'clutch-je');
/*
 * Der Schatten (16.11.2026): liest der Plan einen Spieltag ganz neu (neuAnfang, z. B. nach einer neuen Schadensregel), entsteht der neue Stand hier -
 * clutch-neu/clutch/<w>.json, clutch-neu/clutch-je/<w>.json, clutch-neu/clutch-roh/<w>.json (eigenes Release daten-clutch-neu, lib/releaseTags.mjs).
 * Bis dahin fing clutch/<w>.json leer an, und jede Sofort-Ablage legte den halben Stand ueber den ganzen: am Morgen des 16.11.2026 (Fassung 20) zeigten
 * die Leaders der FNCS Solos Reload Heat 2 EU nur bei Nova, skinny covx und Kami Schaden, "8 offen von 8" im Plan. Jetzt bleibt clutch/<w>.json, wie es
 * ist, bis der Schatten ganz gelesen ist (kein "teilweise" mehr); dann wird getauscht - Epics Werte (epic-schaden-holen.mjs) bleiben dabei erhalten - und
 * die Schatten-Dateien werden am Release geloescht (Marker <name>.weg, scripts/ablage-github.mjs).
 */
const SCHATTEN = path.join(DATEN, 'clutch-neu');
const EPIC_FELDER = ['epicDmg', 'epicZeit', 'epicStrecke', 'epicKopf', 'epicTeamZeit', 'epicDmgStand'];
/** Eine Datei am Release loeschen lassen (scripts/ablage-github.mjs liest den Marker). */
const wegMarke = (name) => { const p = path.join(DATEN, `${name}.weg`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); };
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';

/** Die Werte je Match (lib/jeSpiel.mjs) oder eine andere Datei, die schon am Release liegt - das Repo ist oeffentlich, ein einfacher Abruf genuegt. Fehlt die Datei, ist es der erste Lauf (null). */
async function vomRelease(name) {
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

// Auch Schatten ohne neue Teile: ist einer inzwischen ganz gelesen (z. B. der Tausch scheiterte letztes Mal am Holen der Werte je Match), wird er jetzt getauscht.
for (const f of fs.existsSync(path.join(SCHATTEN, 'clutch')) ? fs.readdirSync(path.join(SCHATTEN, 'clutch')).filter((x) => x.endsWith('.json')) : []) {
  const w = f.replace(/\.json$/, '');
  if (!jeTag.has(w)) jeTag.set(w, []);
}

fs.mkdirSync(ZIEL, { recursive: true });
fs.mkdirSync(ROH, { recursive: true });
let tage = 0; let neu = 0; let fertigTage = 0; let getauscht = 0; let imSchattenZahl = 0;
for (const [w, dateien] of jeTag) {
  const hauptDatei = path.join(ZIEL, `${w}.json`);
  const haupt = liesDatei(hauptDatei);
  // Vor Fassung 4 (alte Schadensregel) wird nichts weitergefuehrt - der Spieltag ist ganz neu gelesen.
  // Ein Spieltag, den der Plan neu lesen liess (neuAnfang), faengt ebenfalls leer an - die alten Werte wuerden sonst doppelt zaehlen.
  const neuAnfang = dateien.some((datei) => liesDatei(datei)?.neuAnfang);
  // Im Schatten: es gibt schon einen, oder der Spieltag wird neu gelesen und am Release steht ein Stand mit Matches, der bis zum Ende stehen bleiben soll.
  const schattenDatei = path.join(SCHATTEN, 'clutch', `${w}.json`);
  const imSchatten = fs.existsSync(schattenDatei) || (neuAnfang && !!haupt?.matches?.length);
  const zielDatei = imSchatten ? schattenDatei : hauptDatei;
  const jeName = imSchatten ? `clutch-neu/clutch-je/${w}.json` : `clutch-je/${w}.json`;
  const jeOrdner = path.dirname(path.join(DATEN, jeName));
  const alt = imSchatten ? liesDatei(schattenDatei) : haupt;
  // Ein Schatten ohne neue Teile, der noch nicht ganz gelesen ist: nichts zu tun (nicht neu schreiben, sonst geht er jedes Mal hoch).
  if (imSchatten && !dateien.length && (!alt || alt.teilweise)) continue;
  // jeFrisch: ganz nach dem 15.11.2026 gelesen - die Werte je Match koennen nicht mehr verloren sein (der Planer liest so einen Spieltag wegen jeFehlt nicht noch einmal).
  const d = alt && (alt.version ?? 0) >= 4 && !neuAnfang ? alt : { version: 4, schadenFassung: 20, windowId: w, matches: [], summe: {}, spiele: {}, jeFrisch: true };
  d.matches ??= []; d.summe ??= {}; d.spiele ??= {}; d.ohne ??= [];
  const da = new Set([...d.matches.map((m) => m.id), ...d.ohne]);
  // Die Werte je Match: erst, wenn ein Teil welche bringt, wird der alte Stand geholt. Laesst er sich nicht lesen, bleibt die Datei diesmal, wie sie ist.
  let je = null; let jeNeu = false; let jeKaputt = false;
  const jeLaden = async () => {
    if (je || jeKaputt) return je;
    try {
      const bisher = d.je && !neuAnfang ? await vomRelease(jeName) : null;
      je = bisher ? jeLesen(bisher) : {};
    } catch (e) { console.log(`  ${w}: ${e.message} - Werte je Match diesmal nicht weitergefuehrt`); jeKaputt = true; return null; }
    if (d.jeSpiel) { for (const [k, v] of Object.entries(d.jeSpiel)) (je[k] ??= []).push(...v.map(alteZeile)); delete d.jeSpiel; jeNeu = true; }
    return je;
  };
  const rohDatei = path.join(imSchatten ? path.join(SCHATTEN, 'clutch-roh') : ROH, `${w}.json`);
  /*
   * Faengt der Spieltag leer an, gilt das auch fuer die Rohdaten (15.11.2026). Bis dahin nur bei neuAnfang: bei einer Datei der Fassung 3 (clutch-neu-rechnen.mjs
   * schrieb bis zum 15.11.2026 "version: 3" in jede kleine Datei) fing d leer an, die Rohdaten vom Release blieben aber - clutch-neu-rechnen.mjs rechnete
   * die Matches dann aus ALLEN Rohdaten, Spiele/Schaden/Strecke kamen nur aus den Teilen dieses Rechners. Am Release gesehen: FNCS Solos Reload Heat 1 EU,
   * 8 Matches, Spiele je Spieler 1 bis 5 statt 8 (11:31 UTC), bis der Abschluss der Runde alle Teile zusammen einarbeitete.
   */
  if (neuAnfang || d !== alt) fs.rmSync(rohDatei, { force: true });
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
    // Ohne lesbaren alten Stand der Werte je Match nicht einarbeiten: sonst stuenden die Matches da, ihre Zeilen waeren fuer immer weg (15.11.2026). So bleiben sie offen
    // und kommen im naechsten Lauf wieder.
    if (t.jeSpiel && !(await jeLaden())) { console.log(`  ${w}: Teil ${path.basename(datei)} zurueckgestellt - Werte je Match nicht lesbar`); continue; }
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
    fs.mkdirSync(jeOrdner, { recursive: true });
    fs.writeFileSync(path.join(DATEN, jeName), inhalt);
    d.je = { spalten: JE_SPALTEN, lage, bytes: inhalt.length };
    // Ob gelesene Matches ohne eine einzige Zeile dastehen (bis 15.11.2026 gingen Zeilen verloren, siehe scripts/clutch-je-abgleich.mjs) - der Planer liest sie neu.
    d.jeGeprueft = inhalt.length;
    const fehlt = jeFehltVon(d, je);
    if (fehlt) d.jeFehlt = fehlt; else delete d.jeFehlt;
  }
  fs.mkdirSync(path.dirname(zielDatei), { recursive: true });
  fs.mkdirSync(path.dirname(rohDatei), { recursive: true });
  fs.writeFileSync(zielDatei, JSON.stringify(d));
  if (roh) fs.writeFileSync(rohDatei, JSON.stringify(roh));
  tage += 1;
  if (!imSchatten) continue;
  if (d.teilweise || !d.matches.length) {
    imSchattenZahl += 1;
    console.log(`  ${w}: neu gelesen im Schatten - ${erledigt} von ${d.gesamt}; am Release bleibt der bisherige Stand (${haupt?.matches?.length ?? 0} Matches)`);
    continue;
  }
  /*
   * Tauschen. Die Werte je Match gehoeren zur Lage in d.je - ohne sie kein Tausch (sonst zeigte die Lage ins Leere); dann bleibt der Schatten und der
   * naechste Lauf versucht es wieder.
   */
  let jeBuf = null;
  if (d.je) {
    try { jeBuf = await vomRelease(jeName); } catch (e) { console.log(`  ${w}: ${e.message}`); }
    if (!jeBuf) { console.log(`  ${w}: Schatten ganz gelesen, aber ${jeName} nicht lesbar - Tausch im naechsten Lauf`); continue; }
  }
  // Die Rohdaten des Schattens gehoeren dazu (clutch-neu-rechnen.mjs rechnet daraus): lagen sie nicht auf der Platte, vom Release - sonst ein Tausch spaeter.
  if (!fs.existsSync(rohDatei) && !d.ohneRohRechnung) {
    let b;
    try { b = await vomRelease(`clutch-neu/clutch-roh/${w}.json`); } catch (e) { console.log(`  ${w}: ${e.message} - Tausch im naechsten Lauf`); continue; }
    if (b) fs.writeFileSync(rohDatei, b);
  }
  // Epics eigene Werte haengen an der Bestenliste, nicht am Lesen der Replays - sie bleiben (epic-schaden-holen.mjs frischt sie im Abschluss auf).
  for (const f of EPIC_FELDER) if (haupt?.[f] !== undefined && d[f] === undefined) d[f] = haupt[f];
  fs.writeFileSync(hauptDatei, JSON.stringify(d));
  if (jeBuf) { fs.mkdirSync(JE, { recursive: true }); fs.writeFileSync(path.join(JE, `${w}.json`), jeBuf); }
  const hauptRoh = path.join(ROH, `${w}.json`);
  if (fs.existsSync(rohDatei)) fs.renameSync(rohDatei, hauptRoh);
  // Ohne neue Rohdaten (grosser Spieltag) passen die alten nicht mehr zu den Matches - weg damit, auch am Release.
  else if (fs.existsSync(hauptRoh) || haupt) { fs.rmSync(hauptRoh, { force: true }); wegMarke(`clutch-roh/${w}.json`); }
  fs.rmSync(schattenDatei, { force: true });
  fs.rmSync(path.join(DATEN, jeName), { force: true });
  for (const n of [`clutch-neu/clutch/${w}.json`, `clutch-neu/clutch-je/${w}.json`, `clutch-neu/clutch-roh/${w}.json`]) wegMarke(n);
  getauscht += 1;
  console.log(`  ${w}: Schatten ganz gelesen (${d.matches.length} Matches) - getauscht, vorher ${haupt?.matches?.length ?? 0} Matches`);
}
console.log(`Zusammengefuehrt: ${neu} neue Matches in ${tage} Spieltagen, davon ${fertigTage} jetzt ganz gelesen`
  + `${getauscht || imSchattenZahl ? ` (Schatten: ${getauscht} getauscht, ${imSchattenZahl} noch im Schatten)` : ''}.`);
