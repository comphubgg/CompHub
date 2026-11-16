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
 * Neu-Lesen ohne leere Seite (16.11.2026). Faengt ein Spieltag neu an (neuere Leser-Fassung, verlorene Werte je Match, haengender Zwischenstand), begann
 * clutch/<w>.json bisher leer und wuchs mit jedem Rechner wieder an. Bis alle durch waren, zeigten cup-stats, Leaders und Player Stats nur die Spieler mit
 * wenigen Spielen oder gar nichts (FNCS Solos Reload Heat 2 EU am Morgen des 16.11.: "Most Damage Dealt" mit drei Spielern). Jetzt waechst der neue Stand
 * daneben - clutch-umbau/<w>.json mit seinen Werten je Match (clutch-umbau-je/) und Rohdaten (clutch-umbau-roh/) - und ersetzt die veroeffentlichte Datei
 * erst, wenn er ganz gelesen ist. Bis dahin traegt die veroeffentlichte Datei nur "umbau" (seit, gelesen, von): daran erkennen Planer und dieses Skript
 * den laufenden Umbau, und die Seite kann "wird neu gelesen" sagen. Ein Umbau-Stand gilt nur, wenn sein umbauSeit zu dem der veroeffentlichten Datei
 * passt - ein alter, schon uebernommener am Release wird so nie wieder aufgegriffen.
 */
const UMBAU = path.join(DATEN, 'clutch-umbau');
const UMBAU_JE = path.join(DATEN, 'clutch-umbau-je');
const UMBAU_ROH = path.join(DATEN, 'clutch-umbau-roh');
/** Was Epic selbst liefert (scripts/epic-schaden-holen.mjs) haengt nicht am Leser - beim Uebernehmen des neuen Stands bleibt es. */
const EPIC_FELDER = ['epicDmg', 'epicZeit', 'epicStrecke', 'epicKopf', 'epicTeamZeit', 'epicDmgStand'];
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';

/**
 * Eine Datei vom Release (das Repo ist oeffentlich, ein einfacher Abruf genuegt), lokal zuerst. 404 heisst erst nach 10 s und 30 s "fehlt" (16.11.2026):
 * waehrend ein anderer Lauf die Datei am vollen Release austauscht (erst loeschen, dann anlegen), fehlt sie fuer die Dauer des Hochladens - siehe
 * scripts/ablage-github-holen.mjs. Andere Fehler: dreimal versuchen, dann werfen.
 */
async function vomRelease(name) {
  const lokal = path.join(DATEN, name);
  if (fs.existsSync(lokal)) return fs.readFileSync(lokal);
  const url = `https://github.com/${REPO}/releases/download/${tagFuer(name)}/${name.replace(/\//g, '__')}`;
  let fehlt = 0;
  for (let v = 0; v < 5; v += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404 && ++fehlt >= 3) return null;
    } catch { /* noch einmal */ }
    await new Promise((ok) => setTimeout(ok, fehlt === 1 ? 10_000 : fehlt === 2 ? 30_000 : 3000));
  }
  throw new Error(`${name} nicht lesbar`);
}
/** Die Werte je Match, die schon am Release liegen (lib/jeSpiel.mjs) - fuer einen laufenden Umbau die zurueckgestellten (clutch-umbau-je/). */
const jeVomRelease = (w, umbau) => vomRelease(`${umbau ? 'clutch-umbau-je' : 'clutch-je'}/${w}.json`);
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
  const pub = liesDatei(zielDatei);
  // Ein Spieltag, den der Plan neu lesen liess (neuAnfang), faengt leer an - die alten Werte wuerden sonst doppelt zaehlen.
  const neuAnfang = dateien.some((datei) => liesDatei(datei)?.neuAnfang);
  // Laeuft ein Umbau (siehe UMBAU oben), wird er fortgefuehrt - ausser der Plan faengt ganz neu an.
  let stufe = null;
  if (pub?.umbau?.seit && !neuAnfang) {
    try { stufe = JSON.parse(String(await vomRelease(`clutch-umbau/${w}.json`) ?? 'null')); } catch { stufe = null; }
    if (stufe?.umbauSeit !== pub.umbau.seit) {
      // Die Teile dieses Laufs sind gegen den Umbau-Stand geplant - in die veroeffentlichte Datei gehoeren sie nicht (sie zaehlten doppelt). Zurueckstellen:
      // der naechste Plan sieht den Umbau-Stand wieder oder faengt neu an.
      console.log(`  ${w}: Umbau-Stand seit ${pub.umbau.seit} nicht lesbar - Teile zurueckgestellt`);
      continue;
    }
  }
  const alt = stufe ?? pub;
  // Vor Fassung 4 (alte Schadensregel) wird nichts weitergefuehrt - der Spieltag ist ganz neu gelesen.
  // jeFrisch: ganz nach dem 15.11.2026 gelesen - die Werte je Match koennen nicht mehr verloren sein (der Planer liest so einen Spieltag wegen jeFehlt nicht noch einmal).
  // angefangen: wann dieser Stand leer anfing - der Planer liest einen Spieltag aus NEU_LESEN (scripts/clutch-berechnen.mjs) nur einmal neu.
  const d = alt && (alt.version ?? 0) >= 4 && !neuAnfang ? alt : { version: 4, schadenFassung: 20, windowId: w, matches: [], summe: {}, spiele: {}, jeFrisch: true, angefangen: new Date().toISOString() };
  d.matches ??= []; d.summe ??= {}; d.spiele ??= {}; d.ohne ??= [];
  // Umbau: ein neuer Anfang ueber einer veroeffentlichten Datei mit Werten aus den Replays, oder die Fortsetzung eines laufenden. Eine Datei ohne Schaden
  // (z. B. Fassung 3) hat nichts, was die Seite verlieren koennte - dort zeigt der wachsende Stand gleich, was schon gelesen ist.
  const umbau = d === stufe || (d !== alt && Object.keys(pub?.schaden ?? {}).length > 0);
  if (umbau && d !== stufe) d.umbauSeit = new Date().toISOString();
  const da = new Set([...d.matches.map((m) => m.id), ...d.ohne]);
  // Die Werte je Match: erst, wenn ein Teil welche bringt, wird der alte Stand geholt. Laesst er sich nicht lesen, bleibt die Datei diesmal, wie sie ist.
  let je = null; let jeNeu = false; let jeKaputt = false;
  const jeLaden = async () => {
    if (je || jeKaputt) return je;
    try {
      const alt = d.je && !neuAnfang && (d === stufe || !umbau) ? await jeVomRelease(w, d === stufe) : null;
      // Im Umbau gibt es die Datei sicher (dieses Skript hat sie neben den Stand gelegt) - fehlt sie, ist das ein Aussetzer, kein Anfang.
      if (!alt && d === stufe && d.je) throw new Error(`clutch-umbau-je/${w}.json nicht lesbar`);
      je = alt ? jeLesen(alt) : {};
    } catch (e) { console.log(`  ${w}: ${e.message} - Werte je Match diesmal nicht weitergefuehrt`); jeKaputt = true; return null; }
    if (d.jeSpiel) { for (const [k, v] of Object.entries(d.jeSpiel)) (je[k] ??= []).push(...v.map(alteZeile)); delete d.jeSpiel; jeNeu = true; }
    return je;
  };
  const rohDatei = path.join(umbau ? UMBAU_ROH : ROH, `${w}.json`);
  /*
   * Faengt der Spieltag leer an, gilt das auch fuer die Rohdaten (15.11.2026). Bis dahin nur bei neuAnfang: bei einer Datei der Fassung 3 (clutch-neu-rechnen.mjs
   * schrieb bis zum 15.11.2026 "version: 3" in jede kleine Datei) fing d leer an, die Rohdaten vom Release blieben aber - clutch-neu-rechnen.mjs rechnete
   * die Matches dann aus ALLEN Rohdaten, Spiele/Schaden/Strecke kamen nur aus den Teilen dieses Rechners. Am Release gesehen: FNCS Solos Reload Heat 1 EU,
   * 8 Matches, Spiele je Spieler 1 bis 5 statt 8 (11:31 UTC), bis der Abschluss der Runde alle Teile zusammen einarbeitete.
   * Im Umbau sind das die Rohdaten daneben (clutch-umbau-roh/) - die veroeffentlichten gehoeren zur veroeffentlichten Datei und bleiben.
   */
  if (neuAnfang || d !== alt || (umbau && d !== stufe)) fs.rmSync(rohDatei, { force: true });
  // Ein fortgesetzter Umbau mit Rohdaten: die vom Release holen. Fehlen sie, diesmal nichts einarbeiten - sonst ersetzten die Rohdaten nur dieses Laufs die ganzen.
  if (d === stufe && stufe.umbauRoh && !fs.existsSync(rohDatei)) {
    let b = null;
    try { b = await vomRelease(`clutch-umbau-roh/${w}.json`); } catch { b = null; }
    if (!b) { console.log(`  ${w}: Rohdaten des Umbaus nicht lesbar - Teile zurueckgestellt`); continue; }
    fs.mkdirSync(UMBAU_ROH, { recursive: true });
    fs.writeFileSync(rohDatei, b);
  }
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
  let jeInhalt = null;
  if (jeNeu && je) {
    const { inhalt, lage } = jeDatei(je);
    jeInhalt = inhalt;
    d.je = { spalten: JE_SPALTEN, lage, bytes: inhalt.length };
    // Ob gelesene Matches ohne eine einzige Zeile dastehen (bis 15.11.2026 gingen Zeilen verloren, siehe scripts/clutch-je-abgleich.mjs) - der Planer liest sie neu.
    d.jeGeprueft = inhalt.length;
    const fehlt = jeFehltVon(d, je);
    if (fehlt) d.jeFehlt = fehlt; else delete d.jeFehlt;
  }
  if (roh) d.umbauRoh = true;
  // Ein fertiger Umbau ersetzt die veroeffentlichte Datei - mit seinen Werten je Match. Hat dieser Lauf keine neuen Zeilen gebracht, liegen sie noch im Umbau.
  /*
   * War schon die veroeffentlichte Datei nur teilweise gelesen (ein Neu-Lesen von vor dem 16.11.2026, z. B. Trios Cash Cup Event 2 BR: 116 von 554), ersetzt der
   * neue Stand sie, sobald er mindestens so viele Matches hat - nie ein schlechterer Stand auf der Seite, aber auch kein besserer, der daneben wartet.
   */
  let fertigUmbau = umbau && (!d.teilweise || (!!pub?.teilweise && d.matches.length >= (pub.matches?.length ?? 0)));
  if (fertigUmbau && d.je && !jeInhalt) {
    try { jeInhalt = await jeVomRelease(w, true); } catch { jeInhalt = null; }
    if (!jeInhalt) { fertigUmbau = false; console.log(`  ${w}: Umbau ganz gelesen, Werte je Match aber nicht lesbar - bleibt diesmal daneben`); }
  }
  if (umbau && !fertigUmbau) {
    fs.mkdirSync(UMBAU, { recursive: true });
    fs.writeFileSync(path.join(UMBAU, `${w}.json`), JSON.stringify(d));
    if (jeInhalt) { fs.mkdirSync(UMBAU_JE, { recursive: true }); fs.writeFileSync(path.join(UMBAU_JE, `${w}.json`), jeInhalt); }
    if (roh) { fs.mkdirSync(UMBAU_ROH, { recursive: true }); fs.writeFileSync(rohDatei, JSON.stringify(roh)); }
    // Die veroeffentlichte Datei bleibt, wie sie ist - nur der Hinweis auf den Umbau kommt dazu.
    pub.umbau = { seit: d.umbauSeit, gelesen, von: d.gesamt ?? null, fassung: d.schadenFassung ?? null };
    fs.writeFileSync(zielDatei, JSON.stringify(pub));
    console.log(`  ${w}: wird neu gelesen (${gelesen} von ${d.gesamt ?? '?'}) - die veroeffentlichte Datei bleibt bis zum Ende`);
    tage += 1;
    continue;
  }
  if (fertigUmbau) {
    roh ??= liesDatei(rohDatei);
    for (const k of EPIC_FELDER) if (pub?.[k] !== undefined && d[k] === undefined) d[k] = pub[k];
    delete d.umbauSeit; delete d.umbauRoh; delete d.umbau;
    console.log(d.teilweise
      ? `  ${w}: Neu-Lesen hat ${gelesen} von ${d.gesamt ?? '?'} Matches, die veroeffentlichte Datei nur ${pub?.matches?.length ?? 0} (selbst teilweise) - ersetzt sie`
      : `  ${w}: Neu-Lesen fertig (${gelesen} Matches) - ersetzt die veroeffentlichte Datei`);
    for (const ordner of [UMBAU, UMBAU_JE, UMBAU_ROH]) fs.rmSync(path.join(ordner, `${w}.json`), { force: true });
  }
  delete d.umbauRoh;
  if (jeInhalt) {
    fs.mkdirSync(JE, { recursive: true });
    fs.writeFileSync(path.join(JE, `${w}.json`), jeInhalt);
  }
  fs.writeFileSync(zielDatei, JSON.stringify(d));
  if (roh) fs.writeFileSync(path.join(ROH, `${w}.json`), JSON.stringify(roh));
  tage += 1;
}
console.log(`Zusammengefuehrt: ${neu} neue Matches in ${tage} Spieltagen, davon ${fertigTage} jetzt ganz gelesen.`);
