// Epics eigener Schaden je Spieler, fuer die Solo-Spieltage in data/clutch.
//
// Der Betreiber (4.11.2026): die Stats sollen zu Osirion passen. Unser Replay-Schaden lag bei Solo Reload Day 1 EU rund fuenf Prozent zu hoch (Vynqez 27.390),
// Epics "DamageDealt" aus der Bestenliste trifft Osirion fast genau (26.050 gegen 26.077). Epic fuehrt die Werte je Team, deshalb nur bei Solo-Eintraegen -
// und nur fuer die Top 10.000, mehr gibt die Liste nicht her. Alle anderen behalten den Replay-Wert (app/api/cup-spieler).
//
// Laeuft im Schritt "ablegen" von clutch-rechnen.yml, vor dem Hochladen. Schreibt epicDmg (Epic-Id -> Schaden) in die Spieltags-Datei.
//
//   node scripts/epic-schaden-holen.mjs [windowId ...]

import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const ORDNER = path.join(process.cwd(), 'data', 'clutch');
const HOECHSTENS = 40;
const NEU_NACH_MS = 6 * 3600_000;
const FRISCH_MS = 7 * 864e5;
const wunsch = process.argv.slice(2);

async function seite(d, nr) {
  for (let versuch = 0; versuch < 4; versuch++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(d.eventId)}/${encodeURIComponent(d.windowId)}/${accountId}`
      + `?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 401) verwirfNutzerToken();
    await warte(r?.status === 429 ? 30_000 : 2000 * (versuch + 1));
  }
  return null;
}

const dateien = fs.existsSync(ORDNER) ? fs.readdirSync(ORDNER).filter((f) => f.endsWith('.json') && !f.startsWith('_')) : [];
const rang = (w) => (/_EU(_|$)/.test(w) ? 0 : /_NAC(_|$)/.test(w) ? 1 : 2);
const liste = dateien.map((f) => f.replace(/\.json$/, ''))
  .filter((w) => !wunsch.length || wunsch.includes(w))
  .sort((a, b) => rang(a) - rang(b));

let fertig = 0; let gleich = 0;
const STAND = path.join(ORDNER, '_epic-stand.json');
let standDatei = {};
try { standDatei = JSON.parse(fs.readFileSync(STAND, 'utf8')) ?? {}; } catch { /* noch keine */ }
// Zeitrahmen (EPIC_SCHADEN_MINUTEN, 16.11.2026): laeuft jetzt in jeder Ablage (clutch-ablegen.yml) - geprueft zwischen den Spieltagen, nie mitten im Schreiben.
const schluss = Number(process.env.EPIC_SCHADEN_MINUTEN) ? Date.now() + Number(process.env.EPIC_SCHADEN_MINUTEN) * 60_000 : Infinity;
for (const w of liste) {
  if (fertig >= HOECHSTENS) break;
  if (Date.now() > schluss) { console.log('Zeitrahmen erreicht - der Rest mit der naechsten Ablage'); break; }
  const datei = path.join(ORDNER, `${w}.json`);
  let d;
  try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { continue; }
  if (!d.eventId || !d.schaden) continue;
  d.windowId ??= w;
  const stand = Math.max(Date.parse(d.epicDmgStand ?? '') || 0, Date.parse(standDatei[w] ?? '') || 0);
  if (!wunsch.length) {
    if (Date.now() - (Date.parse(d.gerechnet ?? '') || 0) > FRISCH_MS) continue;
    // Am ersten Tag alle 30 Minuten: Epic traegt nach dem Cup-Ende noch nach, eine Kopie von mitten im Cup stand sonst sechs Stunden (Focus: 14.080 statt 25.406).
    if (Date.now() - stand < (Date.now() - (Date.parse(d.gerechnet ?? '') || 0) < 864e5 ? 30 * 60_000 : NEU_NACH_MS)) continue;
  }
  const erste = await seite(d, 0);
  if (!erste) { console.log(`${w}: Bestenliste nicht erreichbar`); continue; }
  const seiten = Math.min(erste.totalPages ?? 1, 100);
  const werte = {}; const zeit = {}; const strecke = {}; const kopf = {}; const teamZeit = {};
  let team = false;
  const nehmen = (j) => {
    for (const e of j?.entries ?? []) {
      const summe = (feld) => (e.sessionHistory ?? []).reduce((a, s) => a + (Number(s.trackedStats?.[feld]) || 0), 0);
      /*
       * Team-Cups fuehren nur die Zeit des Teams: niemand aus dem Team kann laenger gelebt haben. Das ist die Obergrenze fuer die Zeit aus dem Replay, dort zaehlt ein Spieler ohne
       * Todes-Eintrag bis zum Spielende (6.11.2026: 2 Std 31 Min bei uns, Osirions Bester hatte 2 Std 7 Min).
       */
      if ((e.teamAccountIds ?? []).length !== 1) {
        team = true;
        for (const id of e.teamAccountIds ?? []) teamZeit[id.toLowerCase()] = summe('TIME_ALIVE_STAT');
        continue;
      }
      const id = e.teamAccountIds[0].toLowerCase();
      if (summe('DamageDealt') > 0) werte[id] = summe('DamageDealt');
      // Ohne doppelt gezaehlte Zeit (zwei Spiele, die sich ueberschneiden - siehe lib/epicCups lebenOhneUeberlappung).
      if (summe('TIME_ALIVE_STAT') > 0) {
        const iv = (e.sessionHistory ?? []).map((s) => { const ende = Date.parse(s.endTime ?? ''); const z = Number(s.trackedStats?.TIME_ALIVE_STAT) || 0; return Number.isFinite(ende) && z > 0 ? [ende - z * 1000, ende] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
        let ges = 0; let akt = null;
        for (const [x, y] of iv) { if (akt && x <= akt[1]) akt[1] = Math.max(akt[1], y); else { if (akt) ges += akt[1] - akt[0]; akt = [x, y]; } }
        if (akt) ges += akt[1] - akt[0];
        zeit[id] = iv.length === (e.sessionHistory ?? []).length ? Math.round(ges / 1000) : summe('TIME_ALIVE_STAT');
      }
      // Epic zaehlt in Zentimetern.
      if (summe('Travel_Distance_Ground') > 0) strecke[id] = Math.round(summe('Travel_Distance_Ground') / 100);
      if (e.sessionHistory?.length) kopf[id] = summe('Headshots');
    }
  };
  nehmen(erste);
  let naechste = 1;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (naechste < seiten) nehmen(await seite(d, naechste++));
  }));
  const gleichSortiert = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) : o);
  const vorher = JSON.stringify([d.epicDmg, d.epicZeit, d.epicStrecke, d.epicKopf, d.epicTeamZeit].map(gleichSortiert));
  // Nach Id sortiert: die Seiten kommen zu fuenft parallel, die Reihenfolge der Eintraege wechselt - ohne Sortieren galt fast jede Datei als geaendert
  // (17.11.2026: je Ablage 40 Spieltage gelesen, nur 2 bis 24 "unveraendert").
  const sortiert = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  if (team) { delete d.epicDmg; delete d.epicZeit; delete d.epicStrecke; delete d.epicKopf; d.epicTeamZeit = sortiert(teamZeit); } else { d.epicDmg = sortiert(werte); d.epicZeit = sortiert(zeit); d.epicStrecke = sortiert(strecke); d.epicKopf = sortiert(kopf); }
  standDatei[w] = new Date().toISOString();
  /*
   * Unveraendert: die (oft zig MB grosse) Spieltags-Datei bleibt, wie sie ist - nur der Zeitpunkt kommt nach clutch/_epic-stand.json (16.11.2026). Vorher
   * bekam sie jedes Mal ein neues epicDmgStand und ging ganz ans Release: die erste Ablage nach der Umstellung lud so 40 Dateien, 1,1 GB, fast ohne Aenderung.
   */
  if (JSON.stringify([d.epicDmg, d.epicZeit, d.epicStrecke, d.epicKopf, d.epicTeamZeit]) !== vorher) {
    d.epicDmgStand = standDatei[w];
    fs.writeFileSync(datei, JSON.stringify(d));
  } else gleich += 1;
  fertig += 1;
  console.log(`${w}: ${team ? 'Team-Cup, kein Epic-Schaden' : `${Object.keys(werte).length} Spieler`}`);
}
for (const [w, t] of Object.entries(standDatei)) if (Date.now() - Date.parse(t) > 2 * FRISCH_MS) delete standDatei[w];
try { fs.writeFileSync(STAND, JSON.stringify(standDatei)); } catch { /* ohne Ordner keine Spieltage */ }
console.log(`Epic-Schaden: ${fertig} Spieltage gelesen, davon ${gleich} unveraendert (Datei nicht neu geschrieben).`);
