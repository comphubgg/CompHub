// Solo Clutch Points eines Spieltags aus den Server-Replays rechnen.
//
// Siehe lib/clutch.mjs fuer die Rechnung. Hier: Match-Ids von Epic holen,
// jedes Replay voll laden (Ereignisse, Spieler, Teams), mit dem C#-Leser
// auslesen, die Clutch-Punkte je Spieler zusammenzaehlen und ablegen:
//
//   data/clutch/<windowId>.json
//     { eventId, windowId, gerechnet, matches: [{ id, spieler: {epicId: pkt} }],
//       summe: { epicId: pkt }, spiele: { epicId: anzahl } }
//
// Epic haelt Replays 31 Tage vor; was hier einmal steht, bleibt (Release).
//
//   node scripts/clutch-berechnen.mjs <eventId> <windowId> [...]  bestimmte Tage
//   node scripts/clutch-berechnen.mjs --lan                        alle LAN-/Finaltage
//                                                                    der letzten 31 Tage
//                                                                    ohne Ergebnis

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';
import { clutchPunkte } from '../lib/clutch.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';

/** Die Wertungsregeln eines Spieltags - wie lib/cupWertung.ts (wertungVon). */
async function wertung(eventId, windowId) {
  const { token, accountId } = await holeNutzerToken();
  for (const region of ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE']) {
    const r = await fetch(`${EVENTS}/api/v1/events/Fortnite/download/${accountId}?region=${region}&platform=Windows&teamAccountIds=${accountId}`,
      { headers: { Authorization: token } });
    if (!r.ok) continue;
    const d = await r.json();
    const schluessel = `Fortnite:${eventId}:${windowId}`;
    const satz = (d.scoreLocationScoringRuleSets ?? {})[schluessel]
      ?? Object.entries(d.scoreLocationScoringRuleSets ?? {}).find(([k]) => k.endsWith(`:${windowId}`))?.[1];
    const fenster = (d.events ?? []).flatMap((e) => e.eventWindows ?? []).find((w) => w.eventWindowId === windowId);
    const vorlage = (d.templates ?? []).find((t) => t.eventTemplateId === fenster?.eventTemplateId);
    const regeln = (satz ? (d.scoringRuleSets ?? {})[satz] : null) ?? vorlage?.scoringRules ?? [];
    if (!regeln.length) continue;
    const NAME = { PLACEMENT_STAT_INDEX: 'Placement', TEAM_ELIMS_STAT_INDEX: 'Elimination', VICTORY_ROYALE_STAT: 'Victory Royale', MATCH_PLAYED_STAT: 'Match played' };
    return regeln.flatMap((x) => (x.rewardTiers ?? []).map((st) => ({
      was: NAME[x.trackedStat] ?? x.trackedStat, schwelle: st.keyValue ?? 0, regel: x.matchRule ?? '',
      punkte: st.pointsEarned ?? 0, jeStueck: Boolean(st.multiplicative),
    }))).filter((x) => x.punkte > 0);
  }
  return [];
}

async function tag(eventId, windowId) {
  const regeln = await wertung(eventId, windowId);
  if (!regeln.length) { console.log(`  ${windowId}: keine Wertungstabelle - uebersprungen`); return; }
  const ids = [...await matchIds(eventId, windowId, 3)];
  console.log(`  ${windowId}: ${ids.length} Matches, ${regeln.length} Regeln`);
  const matches = []; const summe = {}; const spiele = {};
  for (const id of ids) {
    const datei = path.join(os.tmpdir(), `clutch-${id}.replay`);
    try {
      const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
      fs.writeFileSync(datei, puffer);
      const roh = await leseReplay(datei);
      const c = clutchPunkte(roh, regeln);
      const spieler = Object.fromEntries(c);
      matches.push({ id, spieler });
      for (const p of (roh.PlayerData ?? []).filter((x) => !x.IsBot && x.EpicId)) {
        const k = String(p.EpicId).toLowerCase();
        spiele[k] = (spiele[k] ?? 0) + 1;
      }
      for (const [k, v] of c) summe[k] = (summe[k] ?? 0) + v;
      console.log(`    ${id}: ${c.size} Spieler mit Clutch-Punkten`);
    } catch (e) {
      console.log(`    ${id}: ${e.message}`);
    } finally { fs.rmSync(datei, { force: true }); }
  }
  if (!matches.length) return;
  fs.mkdirSync(ZIEL, { recursive: true });
  fs.writeFileSync(path.join(ZIEL, `${windowId}.json`), JSON.stringify({
    eventId, windowId, gerechnet: new Date().toISOString(), regeln, matches, summe, spiele,
  }, null, 1));
}

const arg = process.argv.slice(2);
if (arg[0] === '--lan') {
  // Finaltage und LANs der letzten 31 Tage aus den Epic-Spieltagen, die noch kein Ergebnis haben.
  const grenze = Date.now() - 31 * 864e5;
  const ordner = path.join(DATEN, 'epic-spieltage');
  const tage = [];
  for (const s of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    const o = path.join(ordner, s);
    if (!fs.statSync(o).isDirectory()) continue;
    for (const f of fs.readdirSync(o).filter((x) => x.endsWith('.json'))) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(o, f), 'utf8'));
        const gross = t.istFinale || /MannekenPis|Global|LAN/i.test(`${t.windowId} ${t.cupId} ${t.titel}`);
        if (!gross || (t.datum ?? 0) < grenze) continue;
        if ((t.teams?.[0]?.spieler?.length ?? 0) !== 2) continue; // Clutch gibt es nur im Duo
        if (fs.existsSync(path.join(ZIEL, `${t.windowId}.json`))) continue;
        tage.push([t.eventId, t.windowId]);
      } catch { /* eine kaputte Datei haelt nichts auf */ }
    }
  }
  console.log(`Offene Tage: ${tage.length}`);
  for (const [e, w] of tage.slice(0, 6)) await tag(e, w);
} else {
  for (let i = 0; i + 1 < arg.length; i += 2) await tag(arg[i], arg[i + 1]);
}
