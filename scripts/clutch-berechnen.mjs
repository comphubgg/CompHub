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

import { cupVorrang } from '../lib/replayRegel.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';
import { clutchPunkte, clutchAusVoll } from '../lib/clutch.mjs';
import { lebenSumme } from '../lib/clutchLeben.mjs';
import { neueWerte, schadenAus } from '../lib/vollSchaden.mjs';
import { SCHADEN_LESER, leserDienst, leserAnzahl, neuerTeil, vollMatch, einarbeiten, wertung as wertungLesen, wertungSicher as wertungLesenSicher } from '../lib/vollMatch.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';

/** Die Wertungsregeln eines Spieltags (lib/vollMatch.mjs, dort auch fuer den Server) - jeder Katalog nur einmal je Lauf. */
const katalogMerker = new Map();
const wertung = (eventId, windowId) => wertungLesen(eventId, windowId, katalogMerker);
const wertungSicher = (eventId, windowId) => wertungLesenSicher(eventId, windowId, katalogMerker);

// Bis 250 Matches: Finals, Division 1 bis 4 und Cash-Cup-Finals (mehrere
// Lobbys). Offene Runden mit 400 bis 2000 Lobbys bleiben aussen vor.
const GROSS_MAX = 250;
/*
 * Grosse Spieltage (offene Runden mit Tausenden Lobbys, 29.10.2026): statt sie zu ueberspringen, alle Matches der besten Teams - so viele Teams, wie in
 * TOP_MAX volle Replays passen (rund eine Stunde Rechenzeit). Fuer diese Spieler sind Schaden, Treffer und Clutch-Punkte vollstaendig.
 */
const TOP_MAX = 240;

/** Die Matches der besten Teams eines Spieltags, Team fuer Team in Platzierungsfolge, bis `max` erreicht ist. */
async function topIds(eventId, windowId, max) {
  const { token, accountId } = await holeNutzerToken();
  const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=0&rank=0&teamAccountIds=`,
    { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`Bestenliste HTTP ${r.status}`);
  const d = await r.json();
  const ids = new Set();
  let teams = 0;
  for (const e of [...(d.entries ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))) {
    const neu = [...new Set((e.sessionHistory ?? []).map((m) => m.sessionId).filter((x) => x && !ids.has(x)))];
    if (ids.size + neu.length > max) break;
    for (const x of neu) ids.add(x);
    teams += 1;
  }
  return { ids: [...ids], teams };
}

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
// Der Pfad steht in lib/vollMatch.mjs (dort auch fuer den Dauerlauf und den Server) - im Ablauf derselbe wie frueher: tools/replay-voll/bin/Release/net10.0.
/** Die volle Ausgabe des eigenen Lesers - oder null, wenn er fehlt oder scheitert. */
function vollAus(datei) {
  if (!fs.existsSync(SCHADEN_LESER)) return null;
  try {
    return JSON.parse(execFileSync('dotnet', [SCHADEN_LESER, datei], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
  } catch (e) { console.log(`    Leser: ${String(e.message).slice(0, 120)}`); return null; }
}

/*
 * Der Leser im Dauerlauf (leserDienst) und die Arbeit je Match stehen seit dem 14.11.2026 in lib/vollMatch.mjs - dort laeuft derselbe Code auch auf dem
 * eigenen Server (scripts/live-spur.mjs).
 */

/** Bis so viele gelesene Matches wird ein Spieltag nach einer neuen Schadensregel ganz neu gelesen. */
const NEU_LESEN_BIS = 400;
/*
 * Einzelne Spieltage einmal ganz neu lesen (ueber den Umbau: die veroeffentlichte Datei bleibt bis zum Ende), weil ihre Datei nachweislich nicht stimmt -
 * Fenster -> Zeitpunkt. Gilt, bis ein Stand dieses Spieltags nach dem Zeitpunkt leer angefangen hat (clutch-zusammen.mjs schreibt "angefangen").
 *   Performance Evaluation Cup Round 1 EU (16.11.2026): 207 Matches gelistet, bei 11 fehlen Spiele, Schaden und Treffer (Rohdaten aus einem fremden Stand,
 *   siehe clutch-neu-rechnen.mjs) - 726 Spieler mit zu wenig Spielen, die Leaders ohne Builds und mit falschem Kreis.
 */
const NEU_LESEN = { S43_PerformanceEvaluation_Event2Round1_EU: '2026-11-16T15:30:00Z' };

async function tag(eventId, windowId, idsVorab = null, teilweise = null) {
  const regeln = await wertung(eventId, windowId);
  // Ohne Wertungstabelle keine Clutch-Punkte - der Schaden zaehlt trotzdem.
  if (!regeln.length) console.log(`  ${windowId}: keine Wertungstabelle - nur Schaden`);
  const ids = idsVorab ?? [...await matchIds(eventId, windowId, 3)];
  console.log(`  ${windowId}: ${ids.length} Matches, ${regeln.length} Regeln`);
  const matches = []; const summe = {}; const spiele = {}; const schaden = {}; const solo = {};
  // Die Rohdaten je Match, kompakt (Teams, Kill-Feed, neue Figuren, Endplaetze):
  // damit laesst sich die Clutch-Regel spaeter neu rechnen, ohne ein Replay
  // erneut zu laden (scripts/clutch-neu-rechnen.mjs).
  const rohMatches = [];
  for (const id of ids) {
    const datei = path.join(os.tmpdir(), `clutch-${id}.replay`);
    try {
      const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 });
      fs.writeFileSync(datei, puffer);
      const roh = await leseReplay(datei);
      // Clutch nach der Regel des Betreibers aus dem eigenen Leser (Reboots
      // inklusive); nur wenn der fehlt, die alte Rechnung.
      const voll = vollAus(datei);
      if (voll) {
        rohMatches.push({
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
      const soloMatch = new Map();
      const c = !regeln.length ? new Map() : voll ? clutchAusVoll(voll, regeln, { solo: soloMatch }) : clutchPunkte(roh, regeln);
      for (const [k, v] of soloMatch) solo[k] = (solo[k] ?? 0) + Math.round(v);
      const sch = schadenAus(voll);
      for (const [k, v] of Object.entries(sch ?? {})) {
        const d = schaden[k] ?? neueWerte();
        // Alle Felder von v, nicht nur die aus neueWerte: sonst gehen Edits, Heilung, Schuesse und Team-Bauten hier verloren.
        for (const f of Object.keys(v)) d[f] = (d[f] ?? 0) + (v[f] ?? 0);
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
  if (rohMatches.length) {
    const rohOrdner = path.join(DATEN, 'clutch-roh');
    fs.mkdirSync(rohOrdner, { recursive: true });
    fs.writeFileSync(path.join(rohOrdner, `${windowId}.json`), JSON.stringify({ eventId, windowId, regeln, matches: rohMatches }));
  }
  fs.writeFileSync(path.join(ZIEL, `${windowId}.json`), JSON.stringify({
    version: 4, eventId, windowId, gerechnet: new Date().toISOString(), regeln, matches, summe, spiele,
    // Nur die Matches der besten Teams gelesen (grosser Spieltag): gezeigt wird ein Wert nur bei Spielern, deren Spiele alle gelesen sind.
    ...(teilweise ? { teilweise } : {}),
    ...(Object.keys(solo).length ? { solo } : {}),
    ...(Object.keys(schaden).length ? { schaden } : {}),
    // Ueberlebenszeit je Spieler (Time Alive) aus Bus, Kill-Feed und Reboots - lib/clutchLeben.mjs.
    ...(rohMatches.length ? { leben: lebenSumme(rohMatches) } : {}),
  }, null, 1));
}

const arg = process.argv.slice(2);
const wert = (name) => { const i = arg.indexOf(name); return i >= 0 ? arg[i + 1] : null; };

/*
 * --verteilt --teil n/N --minuten M: JEDES Match jedes Spieltags voll lesen (Betreiber, 30.10.2026: "jede einzelne Runde analysieren ... alle 100
 * Spieler ... egal wie viele Dateien das frisst ... spaetestens, wenn der Cup um 20 Uhr geendet hat, am naechsten Tag um 13 Uhr").
 *
 * Bis dahin gehoerte ein Spieltag einem Rechner, der ein Replay nach dem anderen las (rund 15 s je Match) - ein offener Cup mit 20.000 Matches waeren
 * 80 Stunden gewesen, deshalb nur die besten Teams (TOP_MAX). Jetzt:
 *   - verteilt nach MATCH, nicht nach Spieltag: jeder Rechner nimmt von jedem offenen Spieltag jedes N-te Match (fest nach der Match-Id) - ein grosser
 *     Cup ist so auf alle Rechner zugleich verteilt;
 *   - mehrere Matches zugleich je Rechner (CLUTCH_GLEICHZEITIG, Standard 4): Laden wartet auf Epic, der Leser braucht einen Kern;
 *   - die Matches kennt der Replay-Stand der Schnellspur (replays/<S>/<w>/_zustand.json - mit allem, was waehrend des Cups in der Bestenliste stand),
 *     keine eigene Abfrage der Bestenliste;
 *   - Reihenfolge: was in den letzten zwei Tagen endete (Europa zuerst, das aelteste zuerst - es hat die naechste Frist), danach der Rest (Europa zuerst,
 *     das neueste zuerst);
 *   - jeder Rechner schreibt nur Teilstaende (data/clutch-teil/<w>__<n>.json, zwischendurch alle 200 Matches); zusammengefuehrt wird an einer Stelle
 *     (scripts/clutch-zusammen.mjs, Schritt "ablegen") - ein Schreiber je Spieltag.
 * Ein Spieltag ist fertig, wenn jedes bekannte Match gelesen ist oder kein Replay hat (Feld "ohne"); bis dahin steht "teilweise" in der Datei, und die
 * Seite zeigt Werte nur bei Spielern, deren Spiele alle gelesen sind.
 */
if (arg[0] === '--plan') {
  /*
   * Der Planer fuer --verteilt: welche Spieltage der letzten 31 Tage offen sind und welche Matches darin.
   * Die Match-Liste eines Spieltags: was der Replay-Stand kennt (auch Lobbys, die nur waehrend des Cups in den Top 10.000 standen) plus Epics ganze
   * Bestenliste. Einmal geholt, steht sie in clutch/_listen.json; neu gefragt wird nur in den ersten drei Tagen nach dem Ende (stuendlich) - danach
   * aendert sich eine Bestenliste nicht mehr.
   */
  const ziel = arg[1] ?? path.join(DATEN, 'clutch-plan.json');
  const grenze = Date.now() - 31 * 864e5;
  const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const LISTEN = path.join(ZIEL, '_listen.json');
  const VORRANG = process.env.CLUTCH_VORRANG === '1';
  let zurueck = 0;
  /*
   * --im-flug <ordner>: Teile juengerer Runden, die noch nicht abgelegt sind (scripts/clutch-teile-holen.mjs). Seit die naechste Runde nicht mehr auf die
   * Ablage wartet (16.11.2026), stuenden ihre Matches sonst noch einmal im Plan - und ein Teil mit schon vorhandenen Matches wird beim Einarbeiten ganz
   * uebersprungen.
   */
  const imFlug = new Map(); const imFlugNeu = new Set(); let imFlugZahl = 0;
  const flugOrdner = wert('--im-flug');
  for (const n of flugOrdner && fs.existsSync(flugOrdner) ? fs.readdirSync(flugOrdner).filter((x) => /__\d+\.json$/.test(x)) : []) {
    const t = liesDatei(path.join(flugOrdner, n));
    if (!t?.windowId) continue;
    if (t.neuAnfang) imFlugNeu.add(t.windowId);
    const s = imFlug.get(t.windowId) ?? imFlug.set(t.windowId, new Set()).get(t.windowId);
    for (const id of [...(t.matches ?? []).map((m) => m.id), ...(t.ohne ?? [])]) { if (!s.has(id)) imFlugZahl += 1; s.add(id); }
  }
  const listen = liesDatei(LISTEN) ?? {};
  const fenster = new Map();
  const epicOrdner = path.join(DATEN, 'epic-spieltage');
  for (const s of fs.existsSync(epicOrdner) ? fs.readdirSync(epicOrdner) : []) {
    const o = path.join(epicOrdner, s);
    if (!fs.statSync(o).isDirectory()) continue;
    for (const f of fs.readdirSync(o).filter((x) => x.endsWith('.json'))) {
      const t = liesDatei(path.join(o, f));
      if (!t?.eventId || !t.windowId || (t.datum ?? 0) < grenze || (t.datum ?? 0) > Date.now()) continue;
      fenster.set(t.windowId, { eventId: t.eventId, windowId: t.windowId, datum: t.datum, ids: new Set() });
    }
  }
  // Was der Replay-Stand kennt - auch Spieltage, die (noch) nicht unter den Epic-Spieltagen stehen.
  const REPLAYS = path.join(DATEN, 'replays');
  for (const s of fs.existsSync(REPLAYS) ? fs.readdirSync(REPLAYS) : []) {
    const so = path.join(REPLAYS, s);
    if (!/^S\d+$/.test(s) || !fs.statSync(so).isDirectory()) continue;
    for (const w of fs.readdirSync(so)) {
      const z = liesDatei(path.join(so, w, '_zustand.json'));
      if (!z?.eventId || (z.datum ?? 0) < grenze || (z.datum ?? 0) > Date.now()) continue;
      const f = fenster.get(w) ?? { eventId: z.eventId, windowId: w, datum: z.datum, ids: new Set() };
      for (const [id, m] of Object.entries(z.matches ?? {})) if ((m?.stand ?? m) !== 'NOT_AVAILABLE') f.ids.add(id);
      fenster.set(w, f);
    }
  }
  // Epics Bestenliste - acht Spieltage zugleich, die gemerkten nur in den ersten drei Tagen erneut.
  const zuHolen = [...fenster.values()].filter((f) => {
    const l = listen[f.windowId];
    if (!l) return true;
    // Ein junger Spieltag wird oft neu gefragt: waehrend und kurz nach dem Cup kommen laufend Matches dazu.
    const frist = Date.now() - f.datum < 6 * 3600_000 ? 10 * 60_000 : 60 * 60_000;
    return Date.now() - f.datum < 3 * 864e5 && Date.now() - (l.zeit ?? 0) > frist;
  });
  console.log(`${fenster.size} Spieltage in der Frist, ${zuHolen.length} Bestenlisten zu holen`);
  let k = 0;
  const planEnde = Date.now() + Number(wert('--minuten') ?? 40) * 60_000;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (k < zuHolen.length && Date.now() < planEnde) {
      const f = zuHolen[k++];
      try {
        const ids = [...await matchIds(f.eventId, f.windowId)];
        listen[f.windowId] = { zeit: Date.now(), ids: [...new Set([...(listen[f.windowId]?.ids ?? []), ...ids])] };
      } catch (e) { console.log(`  ${f.windowId}: Bestenliste - ${String(e.message).slice(0, 80)}`); }
    }
  }));
  for (const w of Object.keys(listen)) if (!fenster.has(w)) delete listen[w];
  fs.mkdirSync(ZIEL, { recursive: true });
  fs.writeFileSync(LISTEN, JSON.stringify(listen));
  const raus = [];
  for (const f of fenster.values()) {
    for (const id of listen[f.windowId]?.ids ?? []) f.ids.add(id);
    if (!f.ids.size) continue;
    // Arena-Matches legt Epic nicht als Server-Replay ab (folder_not_found_or_not_allowed) - zehntausende vergebliche Versuche je Spieltag.
    if (/Arena/i.test(f.windowId)) continue;
    /*
     * Laeuft ein Neu-Lesen (scripts/clutch-zusammen.mjs, UMBAU), zaehlt sein Stand daneben (clutch-umbau/<w>.json) - die veroeffentlichte Datei bleibt bis zum
     * Ende die alte. Ist er nicht lesbar, gilt die veroeffentlichte: dann faengt das Neu-Lesen eben noch einmal an.
     */
    const veroeffentlicht = liesDatei(path.join(ZIEL, `${f.windowId}.json`));
    const umbau = veroeffentlicht?.umbau?.seit ? liesDatei(path.join(DATEN, 'clutch-umbau', `${f.windowId}.json`)) : null;
    const da = umbau && umbau.umbauSeit === veroeffentlicht.umbau.seit ? umbau : veroeffentlicht;
    /*
     * Kleine Team-Spieltage der letzten Woche einmal neu lesen: bis zum 6.11.2026 zaehlte der Leser den Schuss, der umhaut, nicht als Schaden (tools/replay-voll). Grosse offene Runden
     * nicht: die sind zehntausend Matches, Solo aendert sich nicht.
     */
    /*
     * Dazu die FNCS-Spieltage der letzten zwei Tage, egal wie gross (Fassung 9, 7.11.2026): die Solo-Qualifier waren noch mit dem alten Leser gelesen - ohne
     * Heilung, Mats, Shots und echte Tode, und ohne die Werte je Match. Der Betreiber vergleicht genau diese Spieltage mit Osirion.
     */
    const neuAnfang = !!da && Date.now() - f.datum < 7 * 864e5 && (((da.schadenFassung ?? 0) < 8 && (da.matches?.length ?? 0) <= NEU_LESEN_BIS)
      // Fassung 10 (8.11.2026): Leben im Reload - Tod und Rueckkehr sind keine Heilung, im Solo gibt es kein Umhauen.
      || ((da.schadenFassung ?? 0) < 10 && /FNCS/i.test(f.windowId) && Date.now() - f.datum < 2 * 864e5)
      // Fassung 11 (8.11.2026, abends): Damage wie Osirion (Knock-/Kill-Schuss gekappt, Overshield gelesen), Heilung ohne Siphon, Mats-Fenster 2 s - die Spieltage der
      // letzten zwei Tage bis 4.500 Matches neu (die grossen offenen Runden nicht: dort waeren es zehntausende).
      || ((da.schadenFassung ?? 0) < 11 && Date.now() - f.datum < 2 * 864e5 && f.ids.size <= 4500)
      // Fassung 12 (10.11.2026): Steinschleuder-Treffer zaehlen (Projektil statt Treffer-Ereignis; MrSavage 2.074 statt 4.687 bei Osirion, mit Fassung 12: 4.521) -
      // alle Spieltage der letzten zwei Tage bis 9.000 Matches neu.
      || ((da.schadenFassung ?? 0) < 12 && Date.now() - f.datum < 2 * 864e5 && f.ids.size <= 9000)
      // Fassung 13 (10.11.2026): Steinschleuder-Knock zaehlt das Rest-Leben (Knocker laut Kill-Feed), Verlustfenster endet vor einem Knock.
      || ((da.schadenFassung ?? 0) < 14 && Date.now() - f.datum < 2 * 864e5 && f.ids.size <= 9000)
      // Fassung 14 (10.11.2026): Treffer auf schon Umgehauene zaehlen nicht, der Knock gehoert nur einem Treffer davor.
      // Fassung 15 (10.11.2026): Endlosschleife der Lese-Bibliothek abgefangen - ganze Matches (zyfos drittes Spiel) oder einzelne Datenbloecke fehlten still.
      // Deshalb die ganze Woche neu (alle Spieltage bis 9.000 Matches).
      || ((da.schadenFassung ?? 0) < 15 && f.ids.size <= 1500)
      // Fassung 16 (10.11.2026): wie 15 - zwischendurch lief eine nicht bewiesene FirePetal-Zuordnung mit, deshalb noch einmal sauber.
      // Zuerst nur Spieltage bis 1.500 Matches (Finals, Victory Cups, FNCS): die grossen Ranked-Cups mit tausenden Matches hielten die Neuauswertung stundenlang auf.
      || ((da.schadenFassung ?? 0) < 16 && f.ids.size <= 1500)
      // Fassung 17 (10.11.2026, abends): Elims - der Kill-Zaehler kommt verspaetet an (zyfos Team 11 statt 17), verpasste Updates aus dem Kill-Feed.
      || ((da.schadenFassung ?? 0) < 17 && f.ids.size <= 1500)
      // Fassung 18 (14.11.2026): Builds - der Spieler mit WorldPlayerId 0 bekam keine Bauteile (je Match einer, z. B. HvK SwizzY 0 statt 72 Holz).
      || ((da.schadenFassung ?? 0) < 18 && f.ids.size <= 3000 && Date.now() > Date.UTC(2026, 10, 14, 23))  // erst nach Heat 1, damit die Live-Auswertung nicht wartet
      // Fassung 19 (15.11.2026): Elims nur aus dem Kill-Zaehler, am Aus des Teams nach dessen eigenen Zeitstempeln geschnitten - kein Auffuellen aus dem Kill-Feed
      // mehr (Bot-Kills, Kills nach dem Aus; gegen Epics TEAM_ELIMS geprueft, lib/vollSchaden.mjs). Der Zaehler steht nicht in den Rohdaten, deshalb neu lesen:
      // die Spieltage der Woche bis 3.000 Matches, erst nach FNCS Heat 2 (bis 21:00 UTC) und ihrer Auswertung.
      || ((da.schadenFassung ?? 0) < 19 && f.ids.size <= 3000 && Date.now() > Date.UTC(2026, 10, 15, 21, 25))
      // Fassung 20 (15.11.2026): Mats Farmed exakt (nur Spitzhacke; Aufheben mit der Menge des Pickups getrennt, vorher rund 13 % zu viel), Mats Collected je Quelle,
      // Strecke am Boden wie Epic (vorher Proben alle 10 s, hochgerechnet: Median 12 % daneben). Spieltage der letzten 14 Tage bis 3.000 Matches neu.
      || ((da.schadenFassung ?? 0) < 20 && f.ids.size <= 3000 && Date.now() - f.datum < 14 * 864e5)
      // Fassung 21 (16.11.2026): Damage auch aus Gameplay-Effekten (LoudKiwi-Explosion, MoonFlax-Bolzen, Rakete) und vom Jagdgewehr-Geschoss - vorher je Spieler
      // rund 1,3-2,2 % zu wenig gegen Epics DamageDealt. Im Team-Modus gibt es nur den Replay-Wert, deshalb neu lesen: Spieltage der letzten 14 Tage bis 3.000
      // Matches, erst nach der EU LCQ vom 16.11. (18:00-20:30 UTC) und ihrer Auswertung. Die veroeffentlichte Datei bleibt bis zum Ende stehen (clutch-umbau).
      || ((da.schadenFassung ?? 0) < 21 && f.ids.size <= 3000 && Date.now() - f.datum < 14 * 864e5 && Date.now() > Date.UTC(2026, 10, 16, 21, 30))
      // Einzeln angeordnet (NEU_LESEN oben).
      || (!!NEU_LESEN[f.windowId] && !(String(da.angefangen ?? '') > NEU_LESEN[f.windowId])));
    /*
     * Werte je Match verloren (15.11.2026): "Clutch ablegen" lud clutch-je/ nicht hoch, der naechste Lauf verwarf die Zeilen des vorigen (scripts/clutch-je-abgleich.mjs zaehlt
     * sie als jeFehlt). Solche Spieltage einmal ganz neu lesen - nur die der letzten 14 Tage (Epic haelt Replays 31 Tage, mit Abstand) bis 3.000 Matches, nicht, wenn sie
     * nach dem Fix schon frisch gelesen sind (jeFrisch), und erst nach der FNCS-Heat vom 15.11. (17:30-21:30 UTC), damit die Live-Auswertung nicht wartet.
     */
    const jeNeu = !!da && !neuAnfang && (da.jeFehlt ?? 0) > 0 && !da.jeFrisch && Date.now() - f.datum < 14 * 864e5 && f.ids.size <= 3000
      && Date.now() > Date.UTC(2026, 10, 15, 21, 25);
    if (jeNeu) console.log(`  ${f.windowId}: ${da.jeFehlt} Matches ohne Werte je Match - ganz neu lesen`);
    /*
     * Haengengebliebene kleine Spieltage (15.11.2026): mit Fassung 3 fing clutch-zusammen.mjs bei jeder Sofort-Ablage leer an, behielt aber die Rohdaten - und
     * clutch-neu-rechnen.mjs schrieb die Matches aus ALLEN Rohdaten zurueck. Seit es die Fassung 4 behaelt (ce35d8ce), bleibt ein solcher Zwischenstand stehen:
     * alle Matches da (der Plan sieht nichts Offenes), Spiele/Schaden nur von einem Rechner, "teilweise" mit weniger Matches als die Datei hat (am Release:
     * FNCS Solos Reload Heat 1 EU, 8 Matches, teilweise 6, Spiele 223 statt 291). Seit clutch-zusammen.mjs dann auch die Rohdaten verwirft, entsteht er nicht
     * mehr; die schon haengenden einmal ganz neu lesen. Frische (2 Tage) sofort - sie sind klein -, aeltere nach der Heat.
     */
    const haengt = !!da && !neuAnfang && !jeNeu && !da.ohneRohRechnung && (da.matches?.length ?? 0) > (da.teilweise?.matches ?? Infinity)
      && Date.now() - f.datum < 14 * 864e5 && (Date.now() - f.datum < 2 * 864e5 || Date.now() > Date.UTC(2026, 10, 15, 21, 25));
    if (haengt) console.log(`  ${f.windowId}: ${da.matches.length} Matches, aber teilweise ${da.teilweise.matches} - Zwischenstand haengt, ganz neu lesen`);
    const gilt = da && (da.version ?? 0) >= 4 && !neuAnfang && !jeNeu && !haengt;
    /*
     * "Ohne Replay" ist kein Endurteil (Betreiber, 10.11.2026: zyfos Match galt als ohne Replay und liess sich am Morgen problemlos laden). In den ersten drei Tagen
     * wird ein solches Match alle zwei Stunden noch einmal versucht.
     */
    const ohneNochmal = Date.now() - f.datum < 3 * 864e5 && Date.now() - Date.parse(da?.ohneVersucht ?? da?.gerechnet ?? 0) > 2 * 3600_000;
    const fertig = new Set(gilt ? [...(da.matches ?? []).map((m) => m.id), ...(ohneNochmal ? [] : (da.ohne ?? []))] : []);
    // Unterwegs (gelesen, noch nicht abgelegt) - nicht ein zweites Mal planen. Ein Neuanfang plant alles neu - ausser er ist schon unterwegs (Teile mit
    // neuAnfang im Flug): dann gehoeren deren Matches zum neuen Stand.
    if ((!neuAnfang && !jeNeu && !haengt) || imFlugNeu.has(f.windowId)) for (const id of imFlug.get(f.windowId) ?? []) fertig.add(id);
    const offen = [...f.ids].filter((id) => !fertig.has(id));
    if (!offen.length) continue;
    /*
     * Vorrang fuer einen grossen Cup (CLUTCH_VORRANG=1, 16.11.2026): solange einer laeuft oder vor kurzem endete (scripts/frischer-cup.mjs --gross), nur
     * Spieltage der letzten zwei Tage, kein Neu-Lesen aelterer - die Runde ist dann in Minuten durch und die naechste holt die neuen Matches.
     */
    if (VORRANG && (Date.now() - f.datum > 2 * 864e5 || ((neuAnfang || jeNeu || haengt) && Date.now() - f.datum > 6 * 3600_000))) { zurueck += offen.length; continue; }
    raus.push({ eventId: f.eventId, windowId: f.windowId, datum: f.datum, eu: /_EU$/i.test(f.windowId), gesamt: f.ids.size, offen, neuAnfang: neuAnfang || jeNeu || haengt });
  }
  if (zurueck) console.log(`Vorrang fuer einen grossen Cup: ${zurueck} offene Matches aelterer Spieltage und Neu-Lesen warten`);
  if (imFlugZahl) console.log(`Unterwegs (gelesen, noch nicht abgelegt): ${imFlugZahl} Matches - nicht neu geplant`);
  // Was in den letzten zwei Tagen endete zuerst (Europa vor dem Rest, das aelteste zuerst - es hat die naechste Frist), dann der Rest (Europa zuerst,
  // das neueste zuerst).
  const frisch = (t) => Date.now() - t.datum < 2 * 864e5;
  /*
   * Kleine Spieltage (bis 300 Matches: Finals, Heats, Runde 2 eines Cups) vor den grossen offenen Runden (16.11.2026). Jeder Rechner geht die Liste der Reihe
   * nach durch; stand ein Spieltag mit vier Matches hinter offenen Runden mit 20.000, kam er nie an die Reihe - Plan 06:56 UTC: 843.900 offene Matches aus
   * 489 Spieltagen, jeder Rechner schaffte rund 1.200 je Durchgang ("noch offen: 41.343"), der Performance Evaluation Cup Event 2 Round 2 EU (4 Matches)
   * stand nach zehn Tagen noch ohne Schaden da. Frisch Beendetes bleibt vorn.
   */
  const klein = (t) => t.gesamt <= 300;
  // Bei Vorrang zuerst die grossen Cups selbst (cupVorrang 0), dann erst die kleinen - sonst kamen Ranked-Spieltage mit 220 Matches vor die laufende LCQ.
  raus.sort((a, b) => (Number(frisch(b)) - Number(frisch(a))) || (VORRANG ? cupVorrang(a.windowId) - cupVorrang(b.windowId) : 0) || (Number(klein(b)) - Number(klein(a))) || (cupVorrang(a.windowId) - cupVorrang(b.windowId)) || (Number(b.eu) - Number(a.eu)) || (frisch(a) ? b.datum - a.datum : b.datum - a.datum));
  const offenGesamt = raus.reduce((n, t) => n + t.offen.length, 0);
  // 150 Matches je Rechner: das sind bei rund 40 je Minute keine vier Minuten - je mehr Rechner, desto eher ist ein frischer Cup fertig.
  const rechner = Math.min(Math.max(1, Number(process.env.CLUTCH_RECHNER) || 8), Math.max(1, Math.ceil(offenGesamt / (VORRANG ? 60 : 150))));
  // Die Punktetabelle holt der Planer einmal fuer alle Rechner - acht Rechner, die sie zugleich bei Epic holen, laufen leicht in "zu viele Anmeldungen",
  // und ein Rechner ohne Tabelle rechnete bisher still ohne Clutch-Punkte weiter.
  for (const t of raus) { try { t.regeln = await wertungSicher(t.eventId, t.windowId); } catch { t.regeln = []; } }
  // stand: wann der Stand vom Release geholt wurde (CLUTCH_STAND_ZEIT, clutch-rechnen.yml) - danach richtet sich, ob ein verlangter Neuanfang noch gilt
  // (scripts/clutch-zusammen.mjs).
  fs.writeFileSync(ziel, JSON.stringify({ erstellt: new Date().toISOString(), stand: process.env.CLUTCH_STAND_ZEIT || null, fenster: raus }));
  for (const t of raus.slice(0, 15)) console.log(`  ${t.windowId.padEnd(52)} ${String(t.offen.length).padStart(6)} offen von ${t.gesamt}`);
  console.log(`Plan: ${offenGesamt} offene Matches aus ${raus.length} Spieltagen - ${offenGesamt ? rechner : 0} Rechner`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `rechner=${JSON.stringify(offenGesamt ? Array.from({ length: rechner }, (_, i) => i) : [])}\nanzahl=${rechner}\noffen=${offenGesamt}\n`);
  }
} else if (arg[0] === '--verteilt') {
  const [teilNr, teilVon] = (wert('--teil') ?? '0/1').split('/').map(Number);
  const schluss = Date.now() + Number(wert('--minuten') ?? 50) * 60_000;
  const GLEICHZEITIG = Math.max(1, Number(process.env.CLUTCH_GLEICHZEITIG) || 4);
  const grenze = Date.now() - 31 * 864e5;
  const TEIL_ORDNER = path.join(DATEN, 'clutch-teil');
  const REPLAYS = path.join(DATEN, 'replays');
  // Wie viele Leser nebeneinander: LIVE_LESER / LESER_ANZAHL, sonst je Kern einer (lib/vollMatch.mjs leserAnzahl).
  const leser = leserDienst(leserAnzahl());
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

  // Die offenen Spieltage kommen vom Planer (--plan, eigener Schritt) - alle Rechner sehen dieselbe Liste.
  const plan = liesDatei(wert('--aus-plan') ?? path.join(DATEN, 'clutch-plan.json')) ?? { fenster: [] };
  const tage = plan.fenster ?? [];
  const frisch = (t) => Date.now() - t.datum < 2 * 864e5;
  const alleOffen = tage.reduce((n, t) => n + t.offen.filter((id) => hash(id) % teilVon === teilNr % teilVon).length, 0);
  console.log(`Offen fuer diesen Rechner: ${alleOffen} Matches aus ${tage.length} Spieltagen - Rechner ${teilNr + 1} von ${teilVon}, je ${GLEICHZEITIG} zugleich`);

  fs.mkdirSync(TEIL_ORDNER, { recursive: true });
  let gelesen = 0; let ohneZahl = 0; let fehler = 0; let spaeterZahl = 0;
  const beginn = Date.now();
  /*
   * Notbremse (8.11.2026): ein Rechner hing fuenf Stunden an einem Match fest, und solange er lief, kam kein neuer Durchgang dran. Drei Minuten nach der
   * Frist wird der Stand gesichert und beendet - was bis dahin gelesen ist, geht weiter wie sonst.
   */
  let aktuellSpeichern = null;
  setTimeout(() => {
    console.log('Notbremse: Frist um drei Minuten ueberschritten - Stand sichern und beenden');
    try { aktuellSpeichern?.(); } catch { /* weiter */ }
    process.exit(0);
  }, Math.max(0, schluss - Date.now()) + 3 * 60_000).unref();
  // Download und Leser haben ihre Fristen in lib/vollMatch.mjs (mitFrist).
  for (const t of tage) {
    if (Date.now() > schluss) break;
    const meine = t.offen.filter((id) => hash(id) % teilVon === teilNr % teilVon);
    if (!meine.length) continue;
    // Die Tabelle aus dem Plan; fehlt sie dort, selbst holen (mit Wiederholung).
    let regeln = Array.isArray(t.regeln) && t.regeln.length ? t.regeln : [];
    if (!regeln.length) { try { regeln = await wertungSicher(t.eventId, t.windowId); } catch { /* ohne Regeln nur Schaden */ } }
    // Rohdaten (Kill-Feed, Figuren) nur bei kleinen Spieltagen - bei 20.000 Matches waeren es Gigabytes; die Ueberlebenszeit wird hier gleich gezaehlt.
    const mitRoh = t.gesamt <= GROSS_MAX;
    const teilDatei = path.join(TEIL_ORDNER, `${t.windowId}__${teilNr}.json`);
    const teil = liesDatei(teilDatei) ?? neuerTeil({ eventId: t.eventId, windowId: t.windowId, regeln, gesamt: t.gesamt });
    teil.strecke ??= {};
    teil.neuAnfang = !!t.neuAnfang;
    // Wann der Plan entstand - clutch-zusammen.mjs beachtet neuAnfang nur, wenn der jetzige Stand vorher anfing (ein Teil kann mehrmals vorbeikommen).
    teil.geplant = plan.stand || plan.erstellt || null;
    // Matches, die in diesem Lauf scheiterten (Download oder Leser) - clutch-zusammen.mjs zaehlt die Fehlversuche ueber die Laeufe.
    teil.fehler ??= [];
    teil.gesamt = Math.max(teil.gesamt ?? 0, t.gesamt);
    const schonDa = new Set([...teil.matches.map((m) => m.id), ...teil.ohne]);
    const liste = meine.filter((id) => !schonDa.has(id));
    console.log(`  ${t.windowId}: ${liste.length} von ${t.offen.length} offenen (${t.gesamt} bekannt)${frisch(t) ? ' - frisch' : ''}`);
    const speichern = () => fs.writeFileSync(teilDatei, JSON.stringify(teil));
    aktuellSpeichern = speichern;
    let seitSpeichern = 0;
    let naechstes = 0;
    const einer = async () => {
      while (naechstes < liste.length && Date.now() < schluss) {
        const id = liste[naechstes++];
        // Laden, lesen, rechnen: lib/vollMatch.mjs (derselbe Code wie auf dem Server). Eingetragen wird hier, Schritt fuer Schritt wie bisher.
        const r = await vollMatch(id, { leser, regeln });
        if (r.art === 'gelesen') {
          einarbeiten(teil, r.beitrag, { mitRoh });
          gelesen += 1; seitSpeichern += 1;
          if (seitSpeichern >= 200) { speichern(); seitSpeichern = 0; }
        } else if (r.art === 'ohne') { teil.ohne.push(id); ohneZahl += 1; }
        // Noch live bei Epic oder kuerzer als das Spiel: kein Fehler - bleibt offen und kommt mit dem naechsten Plan wieder.
        else if (r.art === 'spaeter') { spaeterZahl += 1; console.log(`    ${id}: spaeter - ${r.grund}`); }
        else { fehler += 1; teil.fehler.push(id); }
      }
    };
    await Promise.all(Array.from({ length: GLEICHZEITIG }, einer));
    speichern();
    const min = (Date.now() - beginn) / 60_000;
    console.log(`    bisher ${gelesen} gelesen (${(gelesen / Math.max(min, 0.1)).toFixed(1)} je Minute), ${ohneZahl} ohne Replay, ${fehler} Fehler${spaeterZahl ? `, ${spaeterZahl} spaeter (noch live)` : ''}`);
  }
  leser.ende();
  const rest = alleOffen - gelesen - ohneZahl;
  console.log(`Fertig: ${gelesen} gelesen, ${ohneZahl} ohne Replay, ${fehler} Fehler, ${spaeterZahl} spaeter, ${rest > 0 ? `noch offen: ${rest}` : 'nichts mehr offen'}`);
} else if (arg[0] === '--alle') {
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
        // "Nichts zu rechnen" vom 29./30.9.2026 zaehlt nicht: da scheiterte
        // jedes Match an einem Fehler im Skript ("roh.push is not a function").
        const FEHLER_BIS = Date.parse('2026-09-30T16:30:00Z');
        // Seit dem 29.10.2026 wird auch ein grosser Spieltag gerechnet (die Matches der besten Teams) - "N Matches" haelt ihn nicht mehr auf.
        const gilt = weg && !zahlText && (weg.zeit ?? 0) > Math.max(Date.now() - 864e5, FEHLER_BIS);
        // Schon gerechnet - es sei denn, der Schaden fehlt noch (Dateien von vor dem 29.9.2026).
        const vorhanden = (() => { try { return JSON.parse(fs.readFileSync(path.join(ZIEL, `${t.windowId}.json`), 'utf8')); } catch { return null; } })();
        // Neu gerechnet wird auch, was noch nach der alten Clutch-Regel steht (vor Version 2) oder ohne Sturmzeit, Wiederbelebungen und Reboots (vor Version 3).
        const mitRoh = fs.existsSync(path.join(DATEN, 'clutch-roh', `${t.windowId}.json`));
        // Version 4 (28.10.2026): der Leser ordnet Treffer auf Figuren, deren Kanal gerade zu ist, ueber die Kennung der Figur zu - Damage im Median 97,7 % statt
        // 90,9 % von Epics Wert (FNCS Solos Day 2 EU). Aeltere Ergebnisse werden einmal neu gerechnet, die neuesten zuerst.
        if ((vorhanden && vorhanden.schaden && vorhanden.version >= 4 && mitRoh) || gilt) continue;
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
    let teilweise = null;
    if (ids.length > GROSS_MAX) {
      try {
        const top = await topIds(t.eventId, t.windowId, TOP_MAX);
        if (top.ids.length) {
          teilweise = { teams: top.teams, matches: top.ids.length, vonMindestens: ids.length };
          console.log(`  ${t.windowId}: ${ids.length}+ Matches - gelesen werden alle ${top.ids.length} Matches der besten ${top.teams} Teams`);
          ids = top.ids;
        }
      } catch (e) { console.log(`  ${t.windowId}: beste Teams nicht ladbar (${e.message})`); }
      if (!teilweise) {
        merke(t.windowId, `grosser Spieltag ohne Bestenliste (${ids.length} Matches)`); gross += 1;
        continue;
      }
    }
    const ok = await tag(t.eventId, t.windowId, ids, teilweise);
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
        // Clutch gibt es im Team aus zwei bis vier: der letzte Lebende allein (Duo, Trio, Squad).
        const teamGroesse = t.teams?.[0]?.spieler?.length ?? 0;
        if (teamGroesse < 2 || teamGroesse > 4) continue;
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
