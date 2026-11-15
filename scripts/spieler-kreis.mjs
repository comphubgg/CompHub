// Der Spieler-Kreis: ein Profil fuer jeden, der regelmaessig gut platziert ist.
//
// Der Betreiber (4.11.2026): "wir haben gerade mal 8000 Profile" - "ein Bot im Hintergrund, der jedes Leaderboard analysiert und schaut, welche Spieler
// regelmaessig gut platzieren. Nicht ueber den Username, jeder kann ihn jede zweite Woche aendern." Die Akten entstanden bisher nur fuer Konten aus dem Archiv der
// Szene, und das bekommt seit dem 10.10.2026 nichts mehr. Epics Bestenlisten liegen aber laengst hier (data/epic-spieltage), je Team mit Konto-Ids: ueber
// 900.000 Konten. Hier wird daraus gefiltert, wer es verdient - allein ueber die Konto-Id, Ranked Cups zaehlen nicht:
//
//   data/spieler-kreis/_index.json   [{ epicId, name, konstanz, region, cups, top500, top100, beste, matches }]  fuer die Suche
//   data/spieler-kreis/<xx>.json     { <epicId>: [Zeile je Spieltag] }  je ersten zwei Zeichen der Kennung, dieselben Zeilen wie die Akte (EpicZeile)
//
// Kein Name, keine Flagge und kein Foto werden erfunden: der Name ist der letzte, den Epic zu diesem Konto nannte; Schaden und Clutch stehen nur, wo ein volles
// Replay gelesen ist. Laeuft auf GitHub (spieler-kreis.yml), nie auf dem PC des Betreibers.
//
//   node scripts/spieler-kreis.mjs

import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken, warte } from '../lib/replayKern.mjs';

const DATEN = path.join(process.cwd(), 'data');
const SPIELTAGE = path.join(DATEN, 'epic-spieltage');
const ZIEL = path.join(DATEN, 'spieler-kreis');
/*
 * Wer ins Profil kommt, entscheidet kein fester Wert wie "dreimal Top 300" (Betreiber, 4.11.2026: "zweimal Top 100 kann jeder erreichen, indem man im Busch campt.
 * Du musst das zusammenrechnen, fuer jeden Spieler ein bisschen anders ... er platziert zu 70, 80 Prozent gut, und dann gibt es einen kleinen Ausrutscher").
 *
 * Darum eine Note je Spieler aus seinen letzten zwanzig Cups:
 *   - Jede Platzierung zaehlt nach dem Feld: 1 - log(Platz) / log(Feld). Platz 1 ist 1, Platz 100 von 30.000 etwa 0,55, Platz 1.000 etwa 0,33.
 *   - Offene Runden (ab 3.000 Teams) und gekuerzte alte Listen zaehlen mit einem Feld von 30.000. Kleinere Felder sind schon gesiebt: 0,15 dazu.
 *   - Listen unter zwanzig Teams zaehlen nicht, die Note ist hoechstens 1. Der erste Lauf hatte Konten mit 25 ersten Plaetzen in Mini-Listen ganz oben.
 *   - Die Regionen sind nicht gleich stark: Top 100 in Asien ist nicht Top 100 in Europa (REGION_FAKTOR).
 *   - Das schlechteste Fuenftel faellt weg - das sind die Ausrutscher wegen Mitspielern oder eines schlechten Tages. Die Note ist der Schnitt des Rests.
 * Ins Profil kommt, wer mindestens MINDEST_CUPS sichtbare Ergebnisse und mindestens NOTE_AB hat; wer seit einem Jahr nicht mehr auftaucht, braucht NOTE_ALT.
 * Ein Einzelerfolg reicht so nie. Mit dem Archiv bis 2019 waren es bei einer Grenze fuer alle 59.000 Konten, die meisten davon laengst nicht mehr aktiv.
 */
const MINDEST_CUPS = 10;
const NOTE_AB = 0.4;
const NOTE_ALT = 0.5;
const LETZTE = 20;
const OFFENES_FELD = 30_000;
const OFFEN_AB = 3000;
const REGION_FAKTOR = { EU: 1, NAC: 1, BR: 0.95, NAW: 0.9, OCE: 0.9, ME: 0.9, ASIA: 0.85 };

/*
 * Prospects (Betreiber, 15.11.2026): ein Alter kennen wir nicht, also gilt als neu, wer seinen ERSTEN nennenswerten Auftritt erst kuerzlich hatte - ueber die ganze
 * gespeicherte Geschichte bis 2019 (epic-spieltage + epic-spieltage-alt), allein ueber die Konto-Id. Nennenswert ist:
 *   - ein FNCS-Spieltag ab der dritten Runde: Round 3, Heat, Semi, Final (ohne die Skin-Cups "... FNCS Cup", ohne Divisional Cups unter Division 1) - oder
 *   - ein Top-100-Platz in einem Cash, Victory, Elite, Series Cup oder einer Performance Evaluation. Kein Mindestfeld: die zweiten Runden dieser Cups
 *     sind kleine Felder aus lauter Qualifizierten (Squads Victory Cash Cup Round 2: 145 Teams) - wer dort Top 100 ist, war schon frueher nennenswert.
 * Zero Build, Mobile und Ranked zaehlen weder als Auftritt noch fuer die Note der Prospects.
 * Kandidat: der erste Auftritt liegt hoechstens PROSPECT_TAGE zurueck (~ zwei Saisons) und in dieser Zeit stehen mindestens PROSPECT_MIN Spieltage.
 * Score = Niveau + PROSPECT_TREND * Trend
 *   Niveau = dieselbe Note wie oben (Platz nach Feldgroesse, Regionsfaktor, schlechtestes Fuenftel weg) ueber die letzten zwanzig Spieltage im Fenster,
 *            mit PROSPECT_STUETZE gedachten Spieltagen auf Hoehe der Referenz gemischt: (n * Note + 5 * Referenz) / (n + 5). Fuenf gute Cups sind noch kein Beweis.
 *   Trend  = Note der neueren Haelfte dieser Spieltage minus Note der aelteren Haelfte, begrenzt auf +-PROSPECT_TREND_MAX, unter PROSPECT_TREND_VOLL Spieltagen anteilig
 * Rating = Score / Referenz; die Referenz ist die mittlere Note (Median) aller Spieler im Kreis, die im Fenster gespielt haben. Ueber 1 = besser als der
 * typische etablierte Spieler. Ausgabe: spieler-kreis/_prospects.json, gelesen von app/api/prospects (dort kommt die Pflege des Betreibers dazu, prospects.json).
 */
const PROSPECT_TAGE = 183;
const PROSPECT_MIN = 5;
const PROSPECT_TREND = 0.5;
const PROSPECT_TREND_MAX = 0.2;
/** Ab so vielen Spieltagen zaehlt der Trend voll, darunter anteilig (bei fuenf halb) - zwei gute Cups am Ende sind noch keine Entwicklung. */
const PROSPECT_TREND_VOLL = 10;
const PROSPECT_JE_REGION = 150;
const PROSPECT_STUETZE = 5;
const PROSPECT_AB = Date.now() - PROSPECT_TAGE * 864e5;
const ohneProspect = (tag) => /(^|_)ZB(_|$)|ZeroBuild|NoBuild|Mobile/i.test(`${tag.windowId} ${tag.cupId ?? ''}`);
const fncsStufe = (w) => /FNCS/i.test(w) && !/FNCSCup/i.test(w) && !/Division[2-9]/i.test(w) && /Round[3-9]|Heat|Semi|Final/i.test(w) && !/LastChance/i.test(w);
const cupArt = (w) => /CashCup|VictoryCup|EliteCup|SeriesCup|PerformanceEvaluation|FN[CS]{2}Showdown/i.test(w);
/** 2 = FNCS ab Runde 3, 1 = Top 100 in einem grossen Cup, 0 = nichts Nennenswertes. */
const nennenswert = (tag, platz) => {
  if (ohneProspect(tag)) return 0;
  if (fncsStufe(tag.windowId)) return 2;
  if (cupArt(tag.windowId) && platz <= 100) return 1;
  return 0;
};

const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
// Neue Spieltage zuerst: was in beiden Ordnern liegt, zaehlt aus dem neueren. Das alte Archiv reicht bis 2019 zurueck (je Spieltag die besten 500).
const dateien = [];
const schonDa = new Set();
for (const wurzel of [SPIELTAGE, path.join(DATEN, 'epic-spieltage-alt')]) {
  for (const ordner of fs.existsSync(wurzel) ? fs.readdirSync(wurzel) : []) {
    const voll = path.join(wurzel, ordner);
    if (!fs.statSync(voll).isDirectory()) continue;
    for (const f of fs.readdirSync(voll)) {
      if (!f.endsWith('.json') || f.startsWith('_') || schonDa.has(f)) continue;
      schonDa.add(f);
      dateien.push(path.join(voll, f));
    }
  }
}
const zaehlt = (tag) => tag?.windowId && Array.isArray(tag.teams) && tag.teams.length >= 20 && !/ranked/i.test(`${tag.windowId} ${tag.titel ?? ''} ${tag.cupId ?? ''}`);
const note = (tag, platz) => {
  const offen = tag.gekuerzt || tag.teams.length >= OFFEN_AB;
  const feld = offen ? OFFENES_FELD : Math.max(tag.teams.length, 50);
  const roh = Math.max(0, 1 - Math.log10(Math.max(platz, 1)) / Math.log10(feld)) + (offen ? 0 : 0.15);
  return Math.min(1, roh) * (REGION_FAKTOR[tag.region] ?? 1);
};

// Erster Durchgang: je Konto Datum und Note jedes Ergebnisses.
// Je Ergebnis SCHRITT Werte: Datum, Note, Platz, Region, Nummer des Spieltags (tagListe) und Art fuer die Prospects (-1 Zero Build/Mobile, sonst nennenswert()).
const SCHRITT = 6;
const ergebnisse = new Map();
const tagListe = [];
/*
 * Dieselbe Bestenliste unter mehreren Spieltagen (Stand 15.11.2026: 370 Dateien, z. B. am 4.10.2026 eine Liste mit 0 Punkten unter allen Regionen von
 * FNCSSoloFastTracks, PerformanceEvaluation und ReloadSoloVictoryCup). Fuer die Prospects zaehlt keine dieser Kopien - welche die echte ist, laesst sich nicht sagen.
 */
const abdruecke = new Map();
let tage = 0;
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  tage += 1;
  const nr = tagListe.length;
  tagListe.push({ windowId: tag.windowId, titel: tag.titel ?? '', region: tag.region ?? '', datum: tag.datum ?? 0 });
  const abdruck = tag.teams.slice(0, 20).map((t) => (t.spieler ?? []).join('+')).join(',');
  (abdruecke.get(abdruck) ?? abdruecke.set(abdruck, []).get(abdruck)).push(nr);
  const aus = ohneProspect(tag);
  for (const t of tag.teams) {
    const n = note(tag, t.platz);
    const art = aus ? -1 : nennenswert(tag, t.platz);
    for (const id of t.spieler ?? []) {
      let l = ergebnisse.get(id);
      if (!l) { l = []; ergebnisse.set(id, l); }
      l.push(tag.datum ?? 0, n, t.platz, tag.region ?? '', nr, art);
    }
  }
}
const noten = new Map();
// Das Rating im Profil und die Aufsteiger (app/api/spieler-rating): Note und Form jedes Kontos ab 0,30, nicht nur der Konten im Kreis.
const formen = new Map();
const aufsteiger = [];
const absteiger = [];
const schnitt = (liste) => {
  const b = [...liste].sort((x, y) => y - x);
  const behalten = b.slice(0, Math.ceil(b.length * 0.8));
  return behalten.reduce((a, c) => a + c, 0) / behalten.length;
};
const zwei = (x) => Math.round(x * 100) / 100;
const kopien = new Set();
for (const nrn of abdruecke.values()) if (new Set(nrn.map((n) => tagListe[n].windowId)).size > 1) for (const n of nrn) kopien.add(n);
abdruecke.clear();
console.log(`${kopien.size} Spieltage sind Kopien einer anderen Bestenliste - fuer die Prospects ausgelassen.`);
const prospects = [];
// Fuer die Referenz der Prospects: die Note jedes Kreis-Spielers, der im Fenster gespielt hat.
const referenzNoten = [];
for (const [id, l] of ergebnisse) {
  if (l.length / SCHRITT < PROSPECT_MIN) continue;
  const paare = [];
  for (let i = 0; i < l.length; i += SCHRITT) paare.push([l[i], l[i + 1], l[i + 2], l[i + 3], l[i + 4], kopien.has(l[i + 4]) ? -1 : l[i + 5]]);
  paare.sort((a, b) => b[0] - a[0]);
  // Prospects: der erste nennenswerte Auftritt (ueber die ganze Geschichte) liegt im Fenster.
  let erstes = null;
  for (const x of paare) if (x[5] > 0 && (!erstes || x[0] < erstes[0])) erstes = x;
  if (erstes && erstes[0] >= PROSPECT_AB) {
    const fenster = paare.filter((x) => x[0] >= PROSPECT_AB && x[5] >= 0);
    if (fenster.length >= PROSPECT_MIN) {
      const letzte = fenster.slice(0, LETZTE);
      const niveau = schnitt(letzte.map((x) => x[1]));
      const alt = [...letzte].reverse();
      const mitte = Math.floor(alt.length / 2);
      const trendRoh = schnitt(alt.slice(mitte).map((x) => x[1])) - schnitt(alt.slice(0, mitte).map((x) => x[1]));
      const trend = Math.max(-PROSPECT_TREND_MAX, Math.min(PROSPECT_TREND_MAX, trendRoh)) * Math.min(1, letzte.length / PROSPECT_TREND_VOLL);
      if (niveau + PROSPECT_TREND * trend >= 0.3) {
        const zaehlung = new Map();
        for (const x of letzte) zaehlung.set(x[3], (zaehlung.get(x[3]) ?? 0) + 1);
        const t = tagListe[erstes[4]];
        prospects.push({
          epicId: id, region: [...zaehlung].sort((a, b) => b[1] - a[1])[0][0], roh: niveau, trend,
          events: fenster.length, fncs: fenster.filter((x) => x[5] === 2).length, top100: fenster.filter((x) => x[2] <= 100).length, beste: Math.min(...fenster.map((x) => x[2])),
          erstes: { datum: erstes[0], windowId: t.windowId, titel: t.titel, platz: erstes[2], art: erstes[5] === 2 ? 'fncs' : 'cup' },
          verlauf: alt.map((x) => zwei(x[1])),
        });
      }
    }
  }
  if (paare.length < MINDEST_CUPS) continue;
  const wert = schnitt(paare.slice(0, LETZTE).map((x) => x[1]));
  if (wert >= 0.3) formen.set(id, { n: zwei(wert), f: paare.slice(0, LETZTE).reverse().map((x) => [zwei(x[1]), x[2]]), c: paare.length });
  // Aufsteiger: die letzten zehn gegen die zehn davor, nur wer im letzten Monat gespielt hat und schon jetzt gut ist.
  if (paare.length >= 15 && paare[0][0] >= Date.now() - 31 * 864e5) {
    const jetzt = schnitt(paare.slice(0, 10).map((x) => x[1]));
    const vorher = schnitt(paare.slice(10, 20).map((x) => x[1]));
    const steigt = jetzt >= NOTE_AB && jetzt > vorher;
    // Die Absteiger: dieselbe Rechnung andersherum, nur wer vorher gut war.
    const faellt = vorher >= NOTE_AB && jetzt < vorher;
    if (steigt || faellt) {
      const zaehlung = new Map();
      for (const x of paare.slice(0, 10)) zaehlung.set(x[3], (zaehlung.get(x[3]) ?? 0) + 1);
      (steigt ? aufsteiger : absteiger).push({
        epicId: id, region: [...zaehlung].sort((a, b) => b[1] - a[1])[0][0], jetzt: zwei(jetzt), vorher: zwei(vorher), delta: zwei(jetzt - vorher), cups: paare.length,
        verlauf: paare.slice(0, 20).reverse().map((x) => zwei(x[1])), beste: Math.min(...paare.slice(0, 10).map((x) => x[2])),
      });
    }
  }
  if (wert >= (paare[0][0] >= Date.now() - 365 * 864e5 ? NOTE_AB : NOTE_ALT)) noten.set(id, Math.round(wert * 1000) / 1000);
  if (wert >= NOTE_AB && paare[0][0] >= PROSPECT_AB) referenzNoten.push(wert);
}
ergebnisse.clear();
// Prospects: Referenz (Median der aktiven Kreis-Noten), Rating, je Region die besten PROSPECT_JE_REGION.
const referenz = (() => { const b = [...referenzNoten].sort((a, c) => a - c); return b.length ? b[Math.floor(b.length / 2)] : 0.5; })();
referenzNoten.length = 0;
for (const x of prospects) {
  const niveau = (x.roh * Math.min(x.events, LETZTE) + PROSPECT_STUETZE * referenz) / (Math.min(x.events, LETZTE) + PROSPECT_STUETZE);
  x.score = Math.round((niveau + PROSPECT_TREND * x.trend) * 1000) / 1000;
  x.rating = Math.round((x.score / referenz) * 1000) / 1000;
  x.niveau = zwei(niveau); x.note = zwei(x.roh); x.trend = zwei(x.trend);
  delete x.roh;
}
prospects.sort((a, b) => b.score - a.score);
{
  const je = new Map();
  prospects.splice(0, prospects.length, ...prospects.filter((x) => { je.set(x.region, (je.get(x.region) ?? 0) + 1); return je.get(x.region) <= PROSPECT_JE_REGION; }));
}
console.log(`Prospects: ${prospects.length} (Referenz ${referenz.toFixed(3)}).`);
const kreis = new Set(noten.keys());
console.log(`${tage} Spieltage ohne Ranked, ${kreis.size} Konten im Kreis.`);
if (!kreis.size) { console.log('Kein Konto im Kreis - nichts geschrieben.'); process.exit(1); }

// Zweiter Durchgang: die Zeilen. Schaden und Clutch aus den vollen Replays, wo der Spieltag gelesen ist.
const zeilen = new Map();
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  const voll = lies(path.join(DATEN, 'clutch', `${tag.windowId}.json`), null);
  const gelesen = voll && !voll.teilweise ? voll : null;
  for (const t of tag.teams) {
    for (const id of t.spieler ?? []) {
      if (!kreis.has(id)) continue;
      const sch = gelesen?.schaden?.[id];
      const dmg = gelesen?.epicDmg?.[id] ?? sch?.dmg;
      const liste = zeilen.get(id) ?? [];
      liste.push({
        event: tag.windowId, windowId: tag.windowId, region: tag.region, season: tag.season, titel: tag.titel, datum: tag.datum ?? null,
        platz: t.platz, punkte: t.punkte, matches: t.matches, mitspieler: (t.spieler ?? []).filter((x) => x !== id), nurEpic: true,
        ...(sch ? { replaySchaden: { dmg: Math.round(dmg), erlitten: Math.round(sch.erlitten), treffer: sch.treffer, krit: sch.krit } } : {}),
        ...(gelesen?.summe && Object.keys(gelesen.summe).length ? { replayClutch: gelesen.summe[id] ?? 0 } : {}),
      });
      zeilen.set(id, liste);
    }
  }
}

const namen = lies(path.join(DATEN, 'epic-namen.json'), {});
// Wer im Namensverzeichnis fehlt, wird bei Epic nachgefragt: hundert Konten je Abfrage. Ohne Namen waere das Profil nicht zu finden.
{
  aufsteiger.sort((a, b) => b.delta - a.delta);
  const je = new Map();
  aufsteiger.splice(0, aufsteiger.length, ...aufsteiger.filter((x) => { je.set(x.region, (je.get(x.region) ?? 0) + 1); return je.get(x.region) <= 60; }));
  absteiger.sort((a, b) => a.delta - b.delta);
  const jeAb = new Map();
  absteiger.splice(0, absteiger.length, ...absteiger.filter((x) => { jeAb.set(x.region, (jeAb.get(x.region) ?? 0) + 1); return jeAb.get(x.region) <= 60; }));
  const fehlend = [...new Set([...zeilen.keys(), ...aufsteiger.map((x) => x.epicId), ...absteiger.map((x) => x.epicId), ...prospects.map((x) => x.epicId)])].filter((id) => !namen[id]);
  let gefunden = 0;
  try {
    const { token } = await holeNutzerToken();
    for (let i = 0; i < fehlend.length; i += 100) {
      const qs = fehlend.slice(i, i + 100).map((id) => `accountId=${id}`).join('&');
      const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account?${qs}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (r?.status === 429) { await warte(30_000); i -= 100; continue; }
      if (!r?.ok) continue;
      for (const k of await r.json()) {
        const n = k.displayName || Object.values(k.externalAuths ?? {}).map((e) => e.externalDisplayName).find(Boolean);
        if (n) { namen[k.id] = n; gefunden += 1; }
      }
      await warte(250);
    }
  } catch (e) { console.log(`Namen: ${e.message}`); }
  console.log(`Namen: ${gefunden} von ${fehlend.length} fehlenden bei Epic gefunden.`);
}
const eimer = new Map();
const index = [];
for (const [id, liste] of zeilen) {
  liste.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  const k = id.slice(0, 2);
  const e = eimer.get(k) ?? {};
  e[id] = liste;
  eimer.set(k, e);
  const regionen = new Map();
  for (const z of liste) regionen.set(z.region, (regionen.get(z.region) ?? 0) + 1);
  index.push({
    epicId: id, name: namen[id] ?? '', konstanz: noten.get(id) ?? 0, region: [...regionen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    cups: liste.length, top500: liste.filter((z) => z.platz <= 500).length, top100: liste.filter((z) => z.platz <= 100).length,
    beste: Math.min(...liste.map((z) => z.platz)), matches: liste.reduce((a, z) => a + (z.matches ?? 0), 0),
  });
}
index.sort((a, b) => b.konstanz - a.konstanz);

fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });
for (const [k, e] of eimer) fs.writeFileSync(path.join(ZIEL, `${k}.json`), JSON.stringify(e));
fs.writeFileSync(path.join(ZIEL, '_index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(ZIEL, '_aufsteiger.json'), JSON.stringify(aufsteiger.map((x) => ({ ...x, name: namen[x.epicId] ?? '' }))));
fs.writeFileSync(path.join(ZIEL, '_absteiger.json'), JSON.stringify(absteiger.map((x) => ({ ...x, name: namen[x.epicId] ?? '' }))));
fs.writeFileSync(path.join(ZIEL, '_prospects.json'), JSON.stringify({
  stand: Date.now(), ab: PROSPECT_AB, tage: PROSPECT_TAGE, minEvents: PROSPECT_MIN, trendGewicht: PROSPECT_TREND, trendMax: PROSPECT_TREND_MAX, trendVoll: PROSPECT_TREND_VOLL, stuetze: PROSPECT_STUETZE, referenz: Math.round(referenz * 1000) / 1000,
  liste: prospects.map((x) => ({ ...x, name: namen[x.epicId] ?? '' })),
}));
const notenEimer = new Map();
for (const [id, r] of formen) {
  const k = id.slice(0, 2);
  const e = notenEimer.get(k) ?? {};
  e[id] = r;
  notenEimer.set(k, e);
}
for (const [k, e] of notenEimer) fs.writeFileSync(path.join(ZIEL, `n-${k}.json`), JSON.stringify(e));
console.log(`${formen.size} Ratings, ${aufsteiger.length} Aufsteiger.`);
console.log(`${index.length} Profile in ${eimer.size} Dateien, ${index.filter((x) => !x.name).length} ohne Namen.`);
