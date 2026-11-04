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
 * Ins Profil kommt, wer mindestens MINDEST_CUPS sichtbare Ergebnisse und mindestens NOTE_AB hat. Ein Einzelerfolg reicht so nie.
 */
const MINDEST_CUPS = 10;
const NOTE_AB = 0.4;
const LETZTE = 20;
const OFFENES_FELD = 30_000;
const OFFEN_AB = 3000;
const REGION_FAKTOR = { EU: 1, NAC: 1, BR: 0.95, NAW: 0.9, OCE: 0.9, ME: 0.9, ASIA: 0.85 };

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
const ergebnisse = new Map();
let tage = 0;
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  tage += 1;
  for (const t of tag.teams) {
    const n = note(tag, t.platz);
    for (const id of t.spieler ?? []) {
      let l = ergebnisse.get(id);
      if (!l) { l = []; ergebnisse.set(id, l); }
      l.push(tag.datum ?? 0, n);
    }
  }
}
const noten = new Map();
for (const [id, l] of ergebnisse) {
  if (l.length / 2 < MINDEST_CUPS) continue;
  const paare = [];
  for (let i = 0; i < l.length; i += 2) paare.push([l[i], l[i + 1]]);
  paare.sort((a, b) => b[0] - a[0]);
  const letzte = paare.slice(0, LETZTE).map((x) => x[1]).sort((a, b) => b - a);
  const behalten = letzte.slice(0, Math.ceil(letzte.length * 0.8));
  const wert = behalten.reduce((a, b) => a + b, 0) / behalten.length;
  if (wert >= NOTE_AB) noten.set(id, Math.round(wert * 1000) / 1000);
}
ergebnisse.clear();
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
  const fehlend = [...zeilen.keys()].filter((id) => !namen[id]);
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
console.log(`${index.length} Profile in ${eimer.size} Dateien, ${index.filter((x) => !x.name).length} ohne Namen.`);
