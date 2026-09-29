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
//   node scripts/clutch-berechnen.mjs --alle [--teil 0/4] [--minuten 55]
//                                   jeder Team-Spieltag der letzten 31 Tage ohne
//                                   Ergebnis (Duos, Trios, Squads), soweit er
//                                   hoechstens GROSS_MAX Matches hat
//
// Der Betreiber (29.9.2026): Solo Clutch Points "fuer jeden einzelnen Cup ...
// Division 1, 2, 3, 4, egal fuer welchen Cup", bei Duos, Trios, Squads. Ein
// volles Server-Replay sind rund 140 MB - Finals, Division- und Cash-Cup-
// Finals (eine Handvoll Lobbys) gehen damit, eine offene Runde mit
// Tausenden Lobbys nicht (dort waeren es Hunderte Gigabyte je Spieltag).
// Solche Tage stehen mit ihrer Matchzahl in data/clutch/_zu-gross.json.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';
import { clutchPunkte, clutchAusVoll } from '../lib/clutch.mjs';

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

// Bis 250 Matches: Finals, Division 1 bis 4 und Cash-Cup-Finals (mehrere
// Lobbys). Offene Runden mit 400 bis 2000 Lobbys bleiben aussen vor.
const GROSS_MAX = 250;

/*
 * Schaden je Spieler aus demselben Replay - mit dem eigenen Leser
 * (tools/replay-voll, SchadenLeser). Der Betreiber (29.9.2026): Damage und
 * Ratio "fuer jeden einzelnen Cup". Gezaehlt werden Treffer auf Spieler nach
 * dem Start des Busses, ohne Treffer auf schon Umgehauene; an den Globals
 * Day 1 gegen Epics eigene Werte geprueft (scripts/schaden-probe.mjs): im
 * Mittel 6 % darunter, Treffer auf etwa 4 % genau. Epic zaehlt den Schaden
 * je Schuss nur bis zu den restlichen Lebenspunkten; die stehen im Replay
 * nicht, der Ueberschuss laesst sich deshalb nicht genau abziehen.
 */
const SCHADEN_LESER = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');
/** Die volle Ausgabe des eigenen Lesers - oder null, wenn er fehlt oder scheitert. */
function vollAus(datei) {
  if (!fs.existsSync(SCHADEN_LESER)) return null;
  try {
    return JSON.parse(execFileSync('dotnet', [SCHADEN_LESER, datei], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
  } catch (e) { console.log(`    Leser: ${String(e.message).slice(0, 120)}`); return null; }
}

function schadenAus(roh) {
  if (!roh) return null;
  try {
    const epicVon = new Map((roh.spieler ?? []).map((p) => [p.id, p.epic]));
    const raus = {};
    for (const s of roh.schaden ?? []) {
      const k = epicVon.get(s.id);
      if (!k) continue;
      raus[k] = { dmg: s.gemachtOhneBoden ?? s.gemacht, dmgAlle: s.gemacht, erlitten: s.genommen, treffer: s.treffer, krit: s.krit };
    }
    return raus;
  } catch (e) { console.log(`    Schaden: ${String(e.message).slice(0, 120)}`); return null; }
}

async function tag(eventId, windowId, idsVorab = null) {
  const regeln = await wertung(eventId, windowId);
  // Ohne Wertungstabelle keine Clutch-Punkte - der Schaden zaehlt trotzdem.
  if (!regeln.length) console.log(`  ${windowId}: keine Wertungstabelle - nur Schaden`);
  const ids = idsVorab ?? [...await matchIds(eventId, windowId, 3)];
  console.log(`  ${windowId}: ${ids.length} Matches, ${regeln.length} Regeln`);
  const matches = []; const summe = {}; const spiele = {}; const schaden = {};
  // Die Rohdaten je Match, kompakt (Teams, Kill-Feed, neue Figuren, Endplaetze):
  // damit laesst sich die Clutch-Regel spaeter neu rechnen, ohne ein Replay
  // erneut zu laden (scripts/clutch-neu-rechnen.mjs).
  const roh = [];
  for (const id of ids) {
    const datei = path.join(os.tmpdir(), `clutch-${id}.replay`);
    try {
      const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
      fs.writeFileSync(datei, puffer);
      const roh = await leseReplay(datei);
      // Clutch nach der Regel des Betreibers aus dem eigenen Leser (Reboots
      // inklusive); nur wenn der fehlt, die alte Rechnung.
      const voll = vollAus(datei);
      if (voll) {
        roh.push({
          id, busAb: voll.busAb ?? null,
          spieler: (voll.spieler ?? []).map((p) => ({ id: p.id, epic: p.epic, name: p.name, team: p.team, platz: p.platz, bot: p.bot })),
          feed: (voll.feed ?? []).map((f) => ({ t: f.t, opfer: f.opfer, taeter: f.taeter, art: f.art })),
          figuren: voll.figuren ?? [],
        });
      }
      // Fuer den Abgleich (scripts/clutch-varianten.mjs) die Ausgabe ablegen.
      if (voll && process.env.VOLL_ABLEGEN) {
        fs.mkdirSync(process.env.VOLL_ABLEGEN, { recursive: true });
        fs.writeFileSync(path.join(process.env.VOLL_ABLEGEN, `${windowId}__${id}.json`), JSON.stringify(voll));
      }
      const c = !regeln.length ? new Map() : voll ? clutchAusVoll(voll, regeln) : clutchPunkte(roh, regeln);
      const sch = schadenAus(voll);
      for (const [k, v] of Object.entries(sch ?? {})) {
        const d = schaden[k] ?? { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0 };
        for (const f of Object.keys(d)) d[f] += v[f] ?? 0;
        schaden[k] = d;
      }
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
  if (!matches.length) return false;
  fs.mkdirSync(ZIEL, { recursive: true });
  if (roh.length) {
    const rohOrdner = path.join(DATEN, 'clutch-roh');
    fs.mkdirSync(rohOrdner, { recursive: true });
    fs.writeFileSync(path.join(rohOrdner, `${windowId}.json`), JSON.stringify({ eventId, windowId, regeln, matches: roh }));
  }
  fs.writeFileSync(path.join(ZIEL, `${windowId}.json`), JSON.stringify({
    version: 2, eventId, windowId, gerechnet: new Date().toISOString(), regeln, matches, summe, spiele,
    ...(Object.keys(schaden).length ? { schaden } : {}),
  }, null, 1));
}

const arg = process.argv.slice(2);
const wert = (name) => { const i = arg.indexOf(name); return i >= 0 ? arg[i + 1] : null; };
if (arg[0] === '--alle') {
  const [teilNr, teilVon] = (wert('--teil') ?? '0/1').split('/').map(Number);
  const schluss = Date.now() + Number(wert('--minuten') ?? 50) * 60_000;
  const grenze = Date.now() - 31 * 864e5;
  const ordner = path.join(DATEN, 'epic-spieltage');
  // Was uebersprungen wurde (zu viele Lobbys, kein Replay mehr), je Rechner
  // eine Datei - die vier Rechner eines Laufs schreiben sonst dieselbe.
  const grossDatei = path.join(ZIEL, `_uebersprungen-${teilNr}.json`);
  const zuGross = {};
  for (const f of fs.existsSync(ZIEL) ? fs.readdirSync(ZIEL) : []) {
    if (!/^_uebersprungen-\d+\.json$/.test(f)) continue;
    try { Object.assign(zuGross, JSON.parse(fs.readFileSync(path.join(ZIEL, f), 'utf8'))); } catch { /* kaputt */ }
  }
  const meineGross = (() => { try { return JSON.parse(fs.readFileSync(grossDatei, 'utf8')); } catch { return {}; } })();
  const merke = (w, grund) => {
    zuGross[w] = { grund, zeit: Date.now() }; meineGross[w] = zuGross[w];
    fs.mkdirSync(ZIEL, { recursive: true });
    fs.writeFileSync(grossDatei, JSON.stringify(meineGross, null, 1));
  };
  const tage = [];
  for (const s of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    const o = path.join(ordner, s);
    if (!fs.statSync(o).isDirectory()) continue;
    for (const f of fs.readdirSync(o).filter((x) => x.endsWith('.json'))) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(o, f), 'utf8'));
        if ((t.datum ?? 0) < grenze || !t.eventId) continue;
        // Auch Solo-Tage: dort gibt es keine Clutch-Punkte, aber den Schaden.
        // Zu gross bleibt zu gross; "nichts zu rechnen" kann ein Aussetzer bei
        // Epic gewesen sein und wird nach einem Tag noch einmal versucht.
        const weg = zuGross[t.windowId];
        // Zu gross nur, wenn es ueber der heutigen Grenze liegt (die Grenze ist
        // gestiegen - was vorher zu gross war, kann jetzt passen).
        const zahlText = /(\d+) Matches/.exec(weg?.grund ?? String(weg ?? ''))?.[1];
        const gilt = weg && (zahlText ? Number(zahlText) > GROSS_MAX : (weg.zeit ?? 0) > Date.now() - 864e5);
        // Schon gerechnet - es sei denn, der Schaden fehlt noch (Dateien von vor dem 29.9.2026).
        const vorhanden = (() => { try { return JSON.parse(fs.readFileSync(path.join(ZIEL, `${t.windowId}.json`), 'utf8')); } catch { return null; } })();
        // Neu gerechnet wird auch, was noch nach der alten Clutch-Regel steht (vor Version 2).
        const mitRoh = fs.existsSync(path.join(DATEN, 'clutch-roh', `${t.windowId}.json`));
        if ((vorhanden && vorhanden.schaden && vorhanden.version >= 2 && mitRoh) || gilt) continue;
        tage.push({ eventId: t.eventId, windowId: t.windowId, datum: t.datum ?? 0 });
      } catch { /* eine kaputte Datei haelt nichts auf */ }
    }
  }
  // Das Neueste zuerst - danach wird geschaut; reihum auf die Rechner verteilt.
  tage.sort((a, b) => b.datum - a.datum);
  const meine = tage.filter((_, i) => i % teilVon === teilNr % teilVon);
  console.log(`Offene Team-Spieltage: ${tage.length}, davon hier ${meine.length}`);
  let fertig = 0; let gross = 0;
  for (const t of meine) {
    // Ein Spieltag mit 250 Matches braucht bis zu einer Stunde - danach keiner mehr.
    if (Date.now() > schluss - 60 * 60_000) break;
    let ids = [];
    try { ids = [...await matchIds(t.eventId, t.windowId, 3)]; } catch (e) { console.log(`  ${t.windowId}: ${e.message}`); continue; }
    if (ids.length > GROSS_MAX) {
      merke(t.windowId, `${ids.length} Matches`); gross += 1;
      console.log(`  ${t.windowId}: ${ids.length} Matches - zu gross, uebersprungen`);
      continue;
    }
    const ok = await tag(t.eventId, t.windowId, ids);
    // Kein einziges Replay lesbar (bei Epic schon geloescht): nicht endlos neu versuchen.
    if (ok === false) { merke(t.windowId, 'nichts zu rechnen (keine Wertung oder kein Replay)'); gross += 1; continue; }
    fertig += 1;
  }
  const offen = meine.length - fertig - gross;
  console.log(`Fertig: ${fertig} gerechnet, ${gross} zu gross, ${offen > 0 ? `noch offen: ${offen}` : 'nichts mehr offen'}`);
} else if (arg[0] === '--lan') {
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
