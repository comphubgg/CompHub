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
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';
import { clutchPunkte, clutchAusVoll } from '../lib/clutch.mjs';
import { lebenSumme, lebenJeMatch } from '../lib/clutchLeben.mjs';
import { JE_SPALTEN, jeZeile } from '../lib/jeSpiel.mjs';
import { neueWerte, schadenAus } from '../lib/vollSchaden.mjs';
import { spurenAusReplay, auswerten as positionenAuswerten } from '../lib/replayPositionen.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';

/** Die Wertungsregeln eines Spieltags - wie lib/cupWertung.ts (wertungVon). */
const katalogMerker = new Map();
async function wertung(eventId, windowId) {
  const { token, accountId } = await holeNutzerToken();
  // Die Region des Spieltags zuerst - und jeder Katalog nur einmal je Lauf (der Planer fragt fuer alle offenen Spieltage).
  const eigene = (windowId.match(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i)?.[1] ?? '').toUpperCase();
  for (const region of [...new Set([eigene, 'EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'].filter(Boolean))]) {
    let d = katalogMerker.get(region);
    if (!d) {
      const r = await fetch(`${EVENTS}/api/v1/events/Fortnite/download/${accountId}?region=${region}&platform=Windows&teamAccountIds=${accountId}`,
        { headers: { Authorization: token } });
      if (!r.ok) continue;
      d = await r.json(); katalogMerker.set(region, d);
    }
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

/** wertung mit drei Versuchen bei Fehlern (etwa zu viele Anmeldungen); eine leere Tabelle heisst: Epic fuehrt den Spieltag nicht mehr - kein neuer Versuch. */
async function wertungSicher(eventId, windowId) {
  for (let i = 0; i < 3; i += 1) {
    try { return await wertung(eventId, windowId); } catch (e) { console.log(`  Wertung ${windowId}: ${e.message}`); }
    await new Promise((ok) => setTimeout(ok, 15_000 * (i + 1)));
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
const SCHADEN_LESER = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVollReplayReader.dll');
/** Die volle Ausgabe des eigenen Lesers - oder null, wenn er fehlt oder scheitert. */
function vollAus(datei) {
  if (!fs.existsSync(SCHADEN_LESER)) return null;
  try {
    return JSON.parse(execFileSync('dotnet', [SCHADEN_LESER, datei], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
  } catch (e) { console.log(`    Leser: ${String(e.message).slice(0, 120)}`); return null; }
}

/** Die Werte eines Spielers. Die gebauten Teile (bau*) zaehlt der Leser je Team - zuzuordnen also nur, wo ein Team aus einem Spieler besteht (Solo). */
/*
 * Der Leser im Dauerlauf, je Kern einer (7.11.2026): ein frischer Prozess je Match brauchte das Doppelte, die Zeit ging fuer den Start drauf (tools/replay-voll, --dienst).
 * Stirbt ein Prozess an einem kaputten Replay, scheitert nur dieses Match, und ein neuer rueckt nach.
 */
function leserDienst(anzahl) {
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

/** Bis so viele gelesene Matches wird ein Spieltag nach einer neuen Schadensregel ganz neu gelesen. */
const NEU_LESEN_BIS = 400;

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
    const da = liesDatei(path.join(ZIEL, `${f.windowId}.json`));
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
      || ((da.schadenFassung ?? 0) < 11 && Date.now() - f.datum < 2 * 864e5 && f.ids.size <= 4500));
    const gilt = da && (da.version ?? 0) >= 4 && !neuAnfang;
    const fertig = new Set(gilt ? [...(da.matches ?? []).map((m) => m.id), ...(da.ohne ?? [])] : []);
    const offen = [...f.ids].filter((id) => !fertig.has(id));
    if (!offen.length) continue;
    raus.push({ eventId: f.eventId, windowId: f.windowId, datum: f.datum, eu: /_EU$/i.test(f.windowId), gesamt: f.ids.size, offen, neuAnfang });
  }
  // Was in den letzten zwei Tagen endete zuerst (Europa vor dem Rest, das aelteste zuerst - es hat die naechste Frist), dann der Rest (Europa zuerst,
  // das neueste zuerst).
  const frisch = (t) => Date.now() - t.datum < 2 * 864e5;
  raus.sort((a, b) => (Number(frisch(b)) - Number(frisch(a))) || (cupVorrang(a.windowId) - cupVorrang(b.windowId)) || (Number(b.eu) - Number(a.eu)) || (frisch(a) ? b.datum - a.datum : b.datum - a.datum));
  const offenGesamt = raus.reduce((n, t) => n + t.offen.length, 0);
  // 150 Matches je Rechner: das sind bei rund 40 je Minute keine vier Minuten - je mehr Rechner, desto eher ist ein frischer Cup fertig.
  const rechner = Math.min(Math.max(1, Number(process.env.CLUTCH_RECHNER) || 8), Math.max(1, Math.ceil(offenGesamt / 150)));
  // Die Punktetabelle holt der Planer einmal fuer alle Rechner - acht Rechner, die sie zugleich bei Epic holen, laufen leicht in "zu viele Anmeldungen",
  // und ein Rechner ohne Tabelle rechnete bisher still ohne Clutch-Punkte weiter.
  for (const t of raus) { try { t.regeln = await wertungSicher(t.eventId, t.windowId); } catch { t.regeln = []; } }
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
  const leser = leserDienst(os.cpus().length);
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
  // Ein Download oder Leser, der nicht antwortet, gilt nach dieser Zeit als Fehler (das Match kommt im naechsten Durchgang wieder).
  const mitFrist = (p, ms, was) => Promise.race([p, new Promise((_, nein) => setTimeout(() => nein(new Error(`${was}: keine Antwort nach ${ms / 1000} s`)), ms).unref())]);
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
    const teil = liesDatei(teilDatei) ?? { eventId: t.eventId, windowId: t.windowId, regeln, gesamt: t.gesamt, matches: [], ohne: [], summe: {}, spiele: {}, schaden: {}, solo: {}, leben: {}, plattform: {}, strecke: {}, roh: [] };
    teil.strecke ??= {};
    teil.neuAnfang = !!t.neuAnfang;
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
        const datei = path.join(os.tmpdir(), `voll-${id}.replay`);
        try {
          const puffer = await mitFrist(downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 }), 180_000, 'Download');
          fs.writeFileSync(datei, puffer);
          let voll = null;
          try {
            voll = await mitFrist(leser.lies(datei), 240_000, 'Leser');
          } catch (e) { console.log(`    ${id}: Leser - ${String(e.message).slice(0, 100)}`); }
          // Ein Replay, dessen erster Block schon kaputt ist, liefert Spieler, aber weder Kill-Feed noch Treffer - das waeren lauter Nullen, also wie ein Fehler behandeln.
          if (voll && !(voll.feed?.length) && !(voll.treffer?.length)) { console.log(`    ${id}: Leser - kein Kill-Feed und keine Treffer (Replay kaputt)`); voll = null; }
          if (!voll) { fehler += 1; teil.fehler.push(id); continue; }
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
          const jeHier = new Map();
          for (const [k, v] of Object.entries(schadenAus(voll) ?? {})) {
            const d = teil.schaden[k] ?? neueWerte();
            for (const f of Object.keys(v)) d[f] = (d[f] ?? 0) + (v[f] ?? 0);
            teil.schaden[k] = d;
            jeHier.set(k, v);
          }
          for (const p of voll.spieler ?? []) {
            if (p.bot || !p.epic) continue;
            teil.spiele[p.epic] = (teil.spiele[p.epic] ?? 0) + 1;
            // Die Plattform je Spieler (Feld Platform im Replay) - fuer die Plattform-Statistik.
            if (p.plattform) teil.plattform[p.epic] = String(p.plattform);
            // Der Name aus dem Replay (9.11.2026): Ersatz, wenn Epic die Namensabfrage bremst - sonst stand auf der Seite die gekuerzte Id.
            if (p.name && typeof p.name === 'string') (teil.namen ??= {})[p.epic] = p.name;
          }
          const lebenHier = lebenJeMatch(roh);
          for (const [k, v] of lebenHier) teil.leben[k] = Math.round((teil.leben[k] ?? 0) + v);
          const streckeHier = {};
          /*
           * Laufstrecke und Landeort aus den CharacterSample-Ereignissen derselben Datei (lib/replayPositionen, 31.10.2026) - kein weiterer Abruf.
           * Strecke je Spieler: [zu Fuss, in der Luft] in Metern; der Landeort je Match nur bei kleinen Spieltagen (mit den Rohdaten).
           */
          try {
            const pos = positionenAuswerten(spurenAusReplay(puffer));
            const landung = {};
            for (const [k, v] of Object.entries(pos)) {
              const s = teil.strecke[k] ?? [0, 0];
              teil.strecke[k] = [s[0] + v.fuss, s[1] + v.luft];
              streckeHier[k] = (v.fuss + v.luft) / 0.685;
              if (v.landung) landung[k] = [v.landung.x, v.landung.y, v.landung.t];
            }
            if (Object.keys(landung).length) roh.landung = landung;
          } catch { /* ohne Positionen bleibt der Rest */ }
          if (mitRoh) teil.roh.push(roh);
          // Der Verlauf je Spieler und Match (lib/jeSpiel.mjs) - bei jedem Spieltag, auch den grossen: clutch-zusammen legt ihn in eine eigene Datei.
          teil.jeSpalten = JE_SPALTEN;
          for (const [k, v] of jeHier) (teil.jeSpiel ??= {}, teil.jeSpiel[k] ??= []).push(jeZeile(id, v, lebenHier.get(k), streckeHier[k]));
          gelesen += 1; seitSpeichern += 1;
          if (seitSpeichern >= 200) { speichern(); seitSpeichern = 0; }
        } catch (e) {
          // Kein Replay bei Epic (zu alt, nie abgelegt): merken, damit es nicht jeden Lauf neu versucht wird.
          if (/folder_not_found|not_allowed|404|not ?found|no ?replay/i.test(String(e?.message))) { teil.ohne.push(id); ohneZahl += 1; } else { fehler += 1; teil.fehler.push(id); console.log(`    ${id}: Laden - ${String(e?.message).slice(0, 100)}`); }
        } finally { fs.rmSync(datei, { force: true }); }
      }
    };
    await Promise.all(Array.from({ length: GLEICHZEITIG }, einer));
    speichern();
    const min = (Date.now() - beginn) / 60_000;
    console.log(`    bisher ${gelesen} gelesen (${(gelesen / Math.max(min, 0.1)).toFixed(1)} je Minute), ${ohneZahl} ohne Replay, ${fehler} Fehler`);
  }
  leser.ende();
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
