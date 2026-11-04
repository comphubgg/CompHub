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

let fertig = 0;
for (const w of liste) {
  if (fertig >= HOECHSTENS) break;
  const datei = path.join(ORDNER, `${w}.json`);
  let d;
  try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { continue; }
  if (!d.eventId || !d.schaden) continue;
  d.windowId ??= w;
  const stand = Date.parse(d.epicDmgStand ?? '') || 0;
  if (!wunsch.length) {
    if (Date.now() - (Date.parse(d.gerechnet ?? '') || 0) > FRISCH_MS) continue;
    if (Date.now() - stand < NEU_NACH_MS) continue;
  }
  const erste = await seite(d, 0);
  if (!erste) { console.log(`${w}: Bestenliste nicht erreichbar`); continue; }
  const seiten = Math.min(erste.totalPages ?? 1, 100);
  const werte = {}; const zeit = {}; const strecke = {}; const kopf = {};
  let team = false;
  const nehmen = (j) => {
    for (const e of j?.entries ?? []) {
      if ((e.teamAccountIds ?? []).length !== 1) { team = true; return; }
      const id = e.teamAccountIds[0].toLowerCase();
      const summe = (feld) => (e.sessionHistory ?? []).reduce((a, s) => a + (Number(s.trackedStats?.[feld]) || 0), 0);
      if (summe('DamageDealt') > 0) werte[id] = summe('DamageDealt');
      if (summe('TIME_ALIVE_STAT') > 0) zeit[id] = summe('TIME_ALIVE_STAT');
      // Epic zaehlt in Zentimetern.
      if (summe('Travel_Distance_Ground') > 0) strecke[id] = Math.round(summe('Travel_Distance_Ground') / 100);
      if (e.sessionHistory?.length) kopf[id] = summe('Headshots');
    }
  };
  nehmen(erste);
  let naechste = 1;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (naechste < seiten && !team) nehmen(await seite(d, naechste++));
  }));
  d.epicDmgStand = new Date().toISOString();
  if (team) { delete d.epicDmg; delete d.epicZeit; delete d.epicStrecke; delete d.epicKopf; } else { d.epicDmg = werte; d.epicZeit = zeit; d.epicStrecke = strecke; d.epicKopf = kopf; }
  fs.writeFileSync(datei, JSON.stringify(d));
  fertig += 1;
  console.log(`${w}: ${team ? 'Team-Cup, kein Epic-Schaden' : `${Object.keys(werte).length} Spieler`}`);
}
console.log(`Epic-Schaden: ${fertig} Spieltage gelesen.`);
