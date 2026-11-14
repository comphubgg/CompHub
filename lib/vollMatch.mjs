/*
 * Ein Match voll lesen - die Arbeit je Match aus scripts/clutch-berechnen.mjs --verteilt, hierher gezogen (14.11.2026), damit GitHub (Ablauf "Clutch rechnen")
 * und der eigene Server (scripts/live-spur.mjs) genau denselben Code laufen lassen. Zwei Haelften:
 *
 *   vollMatch(id, ...)          laedt das Replay, liest es mit dem eigenen Leser (tools/replay-voll, --dienst) und rechnet den Beitrag des Matches aus -
 *                               ohne einen Teilstand anzufassen;
 *   einarbeiten(teil, beitrag)  traegt diesen Beitrag in einen Teilstand im Format von data/clutch-teil ein (das liest scripts/clutch-zusammen.mjs).
 *
 * Die Reihenfolge der Schritte in einarbeiten ist dieselbe wie vorher im Rumpf der Schleife - auch die Reihenfolge der Schluessel in den Dateien bleibt so gleich.
 *
 * Neu dabei: die Wache gegen halbe Replays. Ein Replay, das Epic noch als live fuehrt, ist nur der Anfang des Spiels (28.10.2026, FNCS Solos Finals: Spiele 2
 * bis 5 mit 11 bis 27 statt rund hundert Eliminierungen - siehe scripts/replays-holen.mjs). Fuer --verteilt war das bisher kaum ein Thema (der Plan nimmt
 * Matches, die schon in der Bestenliste stehen), fuer die Live-Spur auf dem Server ist es der Normalfall. Ein solches Match gilt als "spaeter": kein Fehler,
 * kein "ohne Replay" - es kommt im naechsten Durchgang wieder.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { replayVorhanden } from './replayKern.mjs';
import { clutchAusVoll } from './clutch.mjs';
import { lebenJeMatch } from './clutchLeben.mjs';
import { JE_SPALTEN, jeZeile } from './jeSpiel.mjs';
import { neueWerte, schadenAus } from './vollSchaden.mjs';
import { spurenAusReplay, auswerten as positionenAuswerten } from './replayPositionen.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');

/*
 * Der eigene Leser (tools/replay-voll, SchadenLeser). Neben diesem Ordner, nicht neben dem Arbeitsordner: im Ablauf ist beides die Wurzel des Repos, die
 * Live-Spur ruft clutch-zusammen.mjs aber in einem Arbeitsordner auf. Im Image liegt er unter /app/tools/replay-voll/bin/... (Dockerfile.web, Stufe "leser").
 */
export const SCHADEN_LESER = process.env.SCHADEN_LESER
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVollReplayReader.dll');

/*
 * Die Schadensregel, nach der dieser Leser zaehlt - dieselbe Zahl, die scripts/clutch-zusammen.mjs einem neu angefangenen Spieltag gibt (dort fest
 * eingetragen; beide gemeinsam erhoehen). Die Live-Spur stempelt ihre Teile damit, damit ein Abgleich nie Teile verschiedener Regeln mischt.
 */
export const SCHADEN_FASSUNG = 18;

/** Bis so viele Matches bekommt ein Spieltag Rohdaten (Kill-Feed, Figuren) - wie GROSS_MAX in clutch-berechnen.mjs und clutch-zusammen.mjs. */
export const GROSS_MAX = 250;

/** Wie viele Leser nebeneinander: LIVE_LESER (Server, Live-Spur) oder LESER_ANZAHL, sonst je Kern einer (wie bisher auf GitHub). */
export const leserAnzahl = () => Number(process.env.LIVE_LESER || process.env.LESER_ANZAHL) || os.cpus().length;

/*
 * Der Leser im Dauerlauf, je Kern einer (7.11.2026): ein frischer Prozess je Match brauchte das Doppelte, die Zeit ging fuer den Start drauf (tools/replay-voll, --dienst).
 * Stirbt ein Prozess an einem kaputten Replay, scheitert nur dieses Match, und ein neuer rueckt nach.
 */
export function leserDienst(anzahl = leserAnzahl()) {
  const frei = []; const wartend = []; let zu = false;
  const gib = (p, a) => { p.auftrag = a; p.letzterFehler = ''; p.stdin.write(`${a.datei}\n`); };
  const naechster = (p) => { const a = wartend.shift(); if (a) gib(p, a); else frei.push(p); };
  const starte = () => {
    const p = spawn('dotnet', [SCHADEN_LESER, '--dienst'], { stdio: ['pipe', 'pipe', 'pipe'] });
    p.auftrag = null; p.letzterFehler = '';
    p.stdin.on('error', () => { /* das Ende meldet exit */ });
    p.stderr.on('data', (d) => { p.letzterFehler = (p.letzterFehler + d).slice(-200); });
    readline.createInterface({ input: p.stdout }).on('line', () => { const a = p.auftrag; p.auftrag = null; naechster(p); a?.ja(); });
    p.on('exit', (code) => {
      const a = p.auftrag; p.auftrag = null;
      a?.nein(new Error(`Leser endete mit ${code}: ${p.letzterFehler}`));
      if (!zu) naechster(starte());
    });
    return p;
  };
  for (let i = 0; i < anzahl; i += 1) frei.push(starte());
  return {
    async lies(datei) {
      const ziel = `${datei}.json`;
      try {
        await new Promise((ja, nein) => { const a = { datei, ja, nein }; const p = frei.pop(); if (p) gib(p, a); else wartend.push(a); });
        return JSON.parse(fs.readFileSync(ziel, 'utf8'));
      } finally { fs.rmSync(ziel, { force: true }); }
    },
    ende() { zu = true; for (const p of frei) p.stdin.end(); },
  };
}

/** Ein Download oder Leser, der nicht antwortet, gilt nach dieser Zeit als Fehler (das Match kommt im naechsten Durchgang wieder). */
export const mitFrist = (p, ms, was) => Promise.race([p, new Promise((_, nein) => setTimeout(() => nein(new Error(`${was}: keine Antwort nach ${ms / 1000} s`)), ms).unref())]);

/** Ein leerer Teilstand eines Spieltags - das Format von data/clutch-teil/<w>__<n>.json. */
export function neuerTeil({ eventId, windowId, regeln, gesamt }) {
  return { eventId, windowId, regeln, gesamt, matches: [], ohne: [], summe: {}, spiele: {}, schaden: {}, solo: {}, leben: {}, plattform: {}, strecke: {}, roh: [] };
}

/** Fehlermeldungen beim Laden, die heissen: Epic hat zu diesem Match kein Replay (zu alt, nie abgelegt). */
const OHNE_REPLAY = /folder_not_found|not_allowed|404|not ?found|no ?replay/i;

/** So lange nach dem Start gilt Epics Live-Marke; haengt sie danach noch, wird gelesen, was da ist (wie scripts/replays-holen.mjs). */
const LIVE_MARKE_MS = 6 * 3600_000;

/*
 * Die Wache vor dem Laden: Epics Metadaten zum Match (dieselbe Abfrage wie scripts/replays-holen.mjs, lib/replayKern replayVorhanden).
 * - noch live (bIsLive) und juenger als sechs Stunden: spaeter;
 * - Metadaten nicht lesbar (Fehler, 429, keine Antwort): spaeter - ohne sie liesse sich die Laenge nicht pruefen, und ein halbes Replay waere schlimmer als
 *   ein paar Minuten Warten;
 * - kein Replay laut Metadaten (404): weiter wie bisher, das Laden entscheidet (und meldet "ohne Replay").
 */
async function wacheVorher(id) {
  let antwort;
  try { antwort = await mitFrist(replayVorhanden(id), 30_000, 'Metadaten'); } catch (e) { return { spaeter: `Metadaten nicht lesbar - ${String(e?.message).slice(0, 80)}` }; }
  const meta = antwort?.metadaten ?? null;
  const seitStart = Date.now() - (Date.parse(meta?.Timestamp ?? '') || Date.now());
  if (meta?.bIsLive && seitStart < LIVE_MARKE_MS) return { spaeter: 'Epic fuehrt das Replay noch als live' };
  return { meta, seitStart };
}

/*
 * Ein Match: laden, lesen, rechnen. Ergebnis eins von
 *   { art: 'gelesen', beitrag }   - fuer einarbeiten()
 *   { art: 'ohne', grund }        - Epic hat kein Replay (bisher: teil.ohne)
 *   { art: 'fehler', grund }      - Laden oder Leser gescheitert (bisher: teil.fehler; clutch-zusammen zaehlt die Fehlversuche)
 *   { art: 'spaeter', grund }     - noch live oder kuerzer als das Spiel laut Epic: kein Fehler, im naechsten Durchgang wieder
 *
 * leser: leserDienst(); regeln: Wertungstabelle (leer = nur Schaden); laden: Schleuse um den Download (Live-Spur: hoechstens LIVE_LADEN zugleich).
 */
export async function vollMatch(id, { leser, regeln, laden = (f) => f(), log = console.log, ordner = os.tmpdir() }) {
  const wache = await wacheVorher(id);
  if (wache.spaeter) return { art: 'spaeter', grund: wache.spaeter };
  const datei = path.join(ordner, `voll-${id}.replay`);
  try {
    const puffer = await laden(() => mitFrist(downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 }), 180_000, 'Download'));
    fs.writeFileSync(datei, puffer);
    let voll = null;
    try {
      voll = await mitFrist(leser.lies(datei), 240_000, 'Leser');
    } catch (e) { log(`    ${id}: Leser - ${String(e.message).slice(0, 100)}`); }
    // Ein Replay, dessen erster Block schon kaputt ist, liefert Spieler, aber weder Kill-Feed noch Treffer - das waeren lauter Nullen, also wie ein Fehler behandeln.
    if (voll && !(voll.feed?.length) && !(voll.treffer?.length)) { log(`    ${id}: Leser - kein Kill-Feed und keine Treffer (Replay kaputt)`); voll = null; }
    if (!voll) return { art: 'fehler', grund: 'Leser' };
    // Die Wache nach dem Lesen: ist das Replay kuerzer als das Spiel laut Epic, wurde es geladen, bevor Epic es fertig abgelegt hatte (wie replays-holen.mjs
    // und replay-voll-holen.mjs: Laenge des Replays gegen LengthInMS, Grenze 97 %).
    const sollMs = wache.meta?.LengthInMS;
    if (sollMs && voll.laenge && voll.laenge < 0.97 * sollMs && wache.seitStart < LIVE_MARKE_MS) {
      return { art: 'spaeter', grund: `Replay erst ${Math.round(voll.laenge / 1000)} s von ${Math.round(sollMs / 1000)} s` };
    }

    const roh = {
      id, busAb: voll.busAb ?? null,
      spieler: (voll.spieler ?? []).map((p) => ({ id: p.id, epic: p.epic, name: p.name, team: p.team, platz: p.platz, bot: p.bot })),
      feed: (voll.feed ?? []).map((f) => ({ t: f.t, opfer: f.opfer, taeter: f.taeter, art: f.art })),
      figuren: voll.figuren ?? [],
    };
    const soloMatch = new Map();
    const clutch = regeln?.length ? clutchAusVoll(voll, regeln, { solo: soloMatch }) : new Map();
    const schaden = schadenAus(voll) ?? {};
    const spieler = (voll.spieler ?? []).map((p) => ({ bot: p.bot, epic: p.epic, plattform: p.plattform, name: p.name }));
    const lebenHier = lebenJeMatch(roh);
    /*
     * Laufstrecke und Landeort aus den CharacterSample-Ereignissen derselben Datei (lib/replayPositionen, 31.10.2026) - kein weiterer Abruf.
     * Strecke je Spieler: [zu Fuss, in der Luft] in Metern; der Landeort je Match nur bei kleinen Spieltagen (mit den Rohdaten).
     */
    let positionen = null;
    try { positionen = positionenAuswerten(spurenAusReplay(puffer)); } catch { /* ohne Positionen bleibt der Rest */ }
    return { art: 'gelesen', beitrag: { id, roh, clutch, soloMatch, schaden, spieler, lebenHier, positionen } };
  } catch (e) {
    // Wie bisher: jede Ausnahme (meist beim Laden) - kein Replay bei Epic (zu alt, nie abgelegt) wird gemerkt, damit es nicht jeden Lauf neu versucht wird.
    if (OHNE_REPLAY.test(String(e?.message))) return { art: 'ohne', grund: String(e?.message).slice(0, 100) };
    log(`    ${id}: Laden - ${String(e?.message).slice(0, 100)}`);
    return { art: 'fehler', grund: `Laden - ${String(e?.message).slice(0, 100)}` };
  } finally { fs.rmSync(datei, { force: true }); }
}

/** Den Beitrag eines gelesenen Matches in einen Teilstand eintragen - Schritt fuer Schritt wie bisher im Rumpf von --verteilt. */
export function einarbeiten(teil, beitrag, { mitRoh }) {
  const { id, roh, clutch: c, soloMatch, schaden, spieler, lebenHier, positionen } = beitrag;
  teil.matches.push({ id, spieler: Object.fromEntries(c) });
  for (const [k, v] of c) teil.summe[k] = (teil.summe[k] ?? 0) + v;
  for (const [k, v] of soloMatch) teil.solo[k] = (teil.solo[k] ?? 0) + Math.round(v);
  const jeHier = new Map();
  for (const [k, v] of Object.entries(schaden)) {
    const d = teil.schaden[k] ?? neueWerte();
    for (const f of Object.keys(v)) d[f] = (d[f] ?? 0) + (v[f] ?? 0);
    teil.schaden[k] = d;
    jeHier.set(k, v);
  }
  for (const p of spieler) {
    if (p.bot || !p.epic) continue;
    teil.spiele[p.epic] = (teil.spiele[p.epic] ?? 0) + 1;
    // Die Plattform je Spieler (Feld Platform im Replay) - fuer die Plattform-Statistik.
    if (p.plattform) teil.plattform[p.epic] = String(p.plattform);
    // Der Name aus dem Replay (9.11.2026): Ersatz, wenn Epic die Namensabfrage bremst - sonst stand auf der Seite die gekuerzte Id.
    if (p.name && typeof p.name === 'string') (teil.namen ??= {})[p.epic] = p.name;
  }
  for (const [k, v] of lebenHier) teil.leben[k] = Math.round((teil.leben[k] ?? 0) + v);
  const streckeHier = {};
  if (positionen) {
    const landung = {};
    for (const [k, v] of Object.entries(positionen)) {
      const s = teil.strecke[k] ?? [0, 0];
      teil.strecke[k] = [s[0] + v.fuss, s[1] + v.luft];
      streckeHier[k] = (v.fuss + v.luft) / 0.685;
      if (v.landung) landung[k] = [v.landung.x, v.landung.y, v.landung.t];
    }
    if (Object.keys(landung).length) roh.landung = landung;
  }
  if (mitRoh) teil.roh.push(roh);
  // Der Verlauf je Spieler und Match (lib/jeSpiel.mjs) - bei jedem Spieltag, auch den grossen: clutch-zusammen legt ihn in eine eigene Datei.
  teil.jeSpalten = JE_SPALTEN;
  for (const [k, v] of jeHier) (teil.jeSpiel ??= {}, teil.jeSpiel[k] ??= []).push(jeZeile(id, v, lebenHier.get(k), streckeHier[k]));
}
