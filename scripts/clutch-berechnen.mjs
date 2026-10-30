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
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';
import { clutchPunkte, clutchAusVoll } from '../lib/clutch.mjs';
import { lebenSumme, lebenJeMatch } from '../lib/clutchLeben.mjs';

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
      raus[k] = { dmg: s.gemachtOhneBoden ?? s.gemacht, dmgAlle: s.gemacht, erlitten: s.genommen, treffer: s.treffer, krit: s.krit, sturm: 0, wiederbelebt: 0, rebootet: 0 };
    }
    // Zeit im Sturm, Wiederbelebungen und Reboots (Leser, Feld zusatz; gegen die Szene-Werte an vier Finals geprueft). Nur, wo der Leser sie fuehrt.
    for (const z of roh.zusatz ?? []) {
      const k = epicVon.get(z.id);
      if (!k) continue;
      const d = raus[k] ??= { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
      d.sturm += z.sturmSek ?? 0; d.wiederbelebt += z.wiederbelebt ?? 0; d.rebootet += z.rebootet ?? 0;
    }
    return raus;
  } catch (e) { console.log(`    Schaden: ${String(e.message).slice(0, 120)}`); return null; }
}

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
      const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
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
        const d = schaden[k] ?? { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
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
    return Date.now() - f.datum < 3 * 864e5 && Date.now() - (l.zeit ?? 0) > 60 * 60_000;
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
    const da = liesDatei(path.join(ZIEL, `${f.windowId}.json`));
    const gilt = da && (da.version ?? 0) >= 4;
    const fertig = new Set(gilt ? [...(da.matches ?? []).map((m) => m.id), ...(da.ohne ?? [])] : []);
    const offen = [...f.ids].filter((id) => !fertig.has(id));
    if (!offen.length) continue;
    raus.push({ eventId: f.eventId, windowId: f.windowId, datum: f.datum, eu: /_EU$/i.test(f.windowId), gesamt: f.ids.size, offen });
  }
  // Was in den letzten zwei Tagen endete zuerst (Europa vor dem Rest, das aelteste zuerst - es hat die naechste Frist), dann der Rest (Europa zuerst,
  // das neueste zuerst).
  const frisch = (t) => Date.now() - t.datum < 2 * 864e5;
  raus.sort((a, b) => (Number(frisch(b)) - Number(frisch(a))) || (Number(b.eu) - Number(a.eu)) || (frisch(a) ? a.datum - b.datum : b.datum - a.datum));
  const offenGesamt = raus.reduce((n, t) => n + t.offen.length, 0);
  const rechner = Math.min(Math.max(1, Number(process.env.CLUTCH_RECHNER) || 8), Math.max(1, Math.ceil(offenGesamt / 300)));
  fs.writeFileSync(ziel, JSON.stringify({ erstellt: new Date().toISOString(), fenster: raus }));
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
  const lauf = promisify(execFile);
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

  // Die offenen Spieltage kommen vom Planer (--plan, eigener Schritt) - alle Rechner sehen dieselbe Liste.
  const plan = liesDatei(wert('--aus-plan') ?? path.join(DATEN, 'clutch-plan.json')) ?? { fenster: [] };
  const tage = plan.fenster ?? [];
  const frisch = (t) => Date.now() - t.datum < 2 * 864e5;
  const alleOffen = tage.reduce((n, t) => n + t.offen.filter((id) => hash(id) % teilVon === teilNr % teilVon).length, 0);
  console.log(`Offen fuer diesen Rechner: ${alleOffen} Matches aus ${tage.length} Spieltagen - Rechner ${teilNr + 1} von ${teilVon}, je ${GLEICHZEITIG} zugleich`);

  fs.mkdirSync(TEIL_ORDNER, { recursive: true });
  let gelesen = 0; let ohneZahl = 0; let fehler = 0;
  const beginn = Date.now();
  for (const t of tage) {
    if (Date.now() > schluss) break;
    const meine = t.offen.filter((id) => hash(id) % teilVon === teilNr % teilVon);
    if (!meine.length) continue;
    let regeln = [];
    try { regeln = await wertung(t.eventId, t.windowId); } catch { /* ohne Regeln nur Schaden */ }
    // Rohdaten (Kill-Feed, Figuren) nur bei kleinen Spieltagen - bei 20.000 Matches waeren es Gigabytes; die Ueberlebenszeit wird hier gleich gezaehlt.
    const mitRoh = t.gesamt <= GROSS_MAX;
    const teilDatei = path.join(TEIL_ORDNER, `${t.windowId}__${teilNr}.json`);
    const teil = liesDatei(teilDatei) ?? { eventId: t.eventId, windowId: t.windowId, regeln, gesamt: t.gesamt, matches: [], ohne: [], summe: {}, spiele: {}, schaden: {}, solo: {}, leben: {}, plattform: {}, roh: [] };
    teil.gesamt = Math.max(teil.gesamt ?? 0, t.gesamt);
    const schonDa = new Set([...teil.matches.map((m) => m.id), ...teil.ohne]);
    const liste = meine.filter((id) => !schonDa.has(id));
    console.log(`  ${t.windowId}: ${liste.length} von ${t.offen.length} offenen (${t.gesamt} bekannt)${frisch(t) ? ' - frisch' : ''}`);
    const speichern = () => fs.writeFileSync(teilDatei, JSON.stringify(teil));
    let seitSpeichern = 0;
    let naechstes = 0;
    const einer = async () => {
      while (naechstes < liste.length && Date.now() < schluss) {
        const id = liste[naechstes++];
        const datei = path.join(os.tmpdir(), `voll-${id}.replay`);
        try {
          const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
          fs.writeFileSync(datei, puffer);
          let voll = null;
          try {
            const { stdout } = await lauf('dotnet', [SCHADEN_LESER, datei], { maxBuffer: 512 * 1024 * 1024 });
            voll = JSON.parse(stdout);
          } catch (e) { console.log(`    ${id}: Leser - ${String(e.message).slice(0, 100)}`); }
          if (!voll) { fehler += 1; continue; }
          const roh = {
            id, busAb: voll.busAb ?? null,
            spieler: (voll.spieler ?? []).map((p) => ({ id: p.id, epic: p.epic, name: p.name, team: p.team, platz: p.platz, bot: p.bot })),
            feed: (voll.feed ?? []).map((f) => ({ t: f.t, opfer: f.opfer, taeter: f.taeter, art: f.art })),
            figuren: voll.figuren ?? [],
          };
          const soloMatch = new Map();
          const c = regeln.length ? clutchAusVoll(voll, regeln, { solo: soloMatch }) : new Map();
          teil.matches.push({ id, spieler: Object.fromEntries(c) });
          for (const [k, v] of c) teil.summe[k] = (teil.summe[k] ?? 0) + v;
          for (const [k, v] of soloMatch) teil.solo[k] = (teil.solo[k] ?? 0) + Math.round(v);
          for (const [k, v] of Object.entries(schadenAus(voll) ?? {})) {
            const d = teil.schaden[k] ?? { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
            for (const f of Object.keys(d)) d[f] += v[f] ?? 0;
            teil.schaden[k] = d;
          }
          for (const p of voll.spieler ?? []) {
            if (p.bot || !p.epic) continue;
            teil.spiele[p.epic] = (teil.spiele[p.epic] ?? 0) + 1;
            // Die Plattform je Spieler (Feld Platform im Replay) - fuer die Plattform-Statistik.
            if (p.plattform) teil.plattform[p.epic] = String(p.plattform);
          }
          for (const [k, v] of lebenJeMatch(roh)) teil.leben[k] = Math.round((teil.leben[k] ?? 0) + v);
          if (mitRoh) teil.roh.push(roh);
          gelesen += 1; seitSpeichern += 1;
          if (seitSpeichern >= 200) { speichern(); seitSpeichern = 0; }
        } catch (e) {
          // Kein Replay bei Epic (zu alt, nie abgelegt): merken, damit es nicht jeden Lauf neu versucht wird.
          if (/folder_not_found|not_allowed|404|not ?found|no ?replay/i.test(String(e?.message))) { teil.ohne.push(id); ohneZahl += 1; } else { fehler += 1; }
        } finally { fs.rmSync(datei, { force: true }); }
      }
    };
    await Promise.all(Array.from({ length: GLEICHZEITIG }, einer));
    speichern();
    const min = (Date.now() - beginn) / 60_000;
    console.log(`    bisher ${gelesen} gelesen (${(gelesen / Math.max(min, 0.1)).toFixed(1)} je Minute), ${ohneZahl} ohne Replay, ${fehler} Fehler`);
  }
  const rest = alleOffen - gelesen - ohneZahl;
  console.log(`Fertig: ${gelesen} gelesen, ${ohneZahl} ohne Replay, ${fehler} Fehler, ${rest > 0 ? `noch offen: ${rest}` : 'nichts mehr offen'}`);
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
