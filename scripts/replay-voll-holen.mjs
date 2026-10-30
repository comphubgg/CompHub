// Server-Replays der Finals und LANs vollstaendig auslesen und fuer immer ablegen.
//
// Der Betreiber (26./28.9.2026): eine Seite /admin/replay "wie eine echte
// Seite zu jedem Match ... Spieler Stats, Team Stats, Zone Stats", und "alles
// speichern, dass alles fuer immer bleibt" - Epic loescht ein Replay nach 31
// Tagen. Dieser Lauf holt jedes Match eines Finaltags (Epics Bestenliste
// nennt die Sitzungen), liest es mit tools/replay-voll (Zonen, Kill-Feed
// mit Ort und Zeit, Spieler) aus und legt das Ergebnis ab:
//
//   data/replay-voll/<JJJJ-MM>/<windowId>/<matchId>.json   je Match
//   data/replay-voll/index.json                            was es gibt
//
// Beides geht mit scripts/ablage-github.mjs ans Release (je Monat ein eigenes,
// ein Release fasst hoechstens tausend Dateien).
//
// Am 14.10.2026 schneller und ausfallsicher (Betreiber: "eine halbe Stunde
// nach dem Ende eines Cups soll jede Runde analysiert sein ... kein Replay
// darf nicht funktionieren, nicht 99 Prozent, 100"):
//   - mehrere Matches gleichzeitig (--parallel, Standard 4): Herunterladen
//     und Auslesen ueberlappen, statt hintereinander zu laufen
//   - Herunterladen und Auslesen werden wiederholt (Pause waechst), bevor
//     ein Match als gescheitert gilt
//   - was trotzdem scheitert, steht in index.fehler (Versuche, letzter
//     Fehler, Zeit) und kommt im naechsten Lauf als Erstes wieder dran
//   - ein Zeitrahmen (--minuten) statt einer festen Zahl: gelesen wird,
//     solange Zeit ist; --hoechstens ist nur noch ein Deckel
//
// Am 26.10.2026 gegen das Festfahren (Betreiber: "es soll innerhalb einer Stunde nach dem Cup alles analysiert sein"): bis dahin kamen die
// gescheiterten Matches in jedem Durchgang ZUERST dran - 73 Stueck, einzelne mit 318 Versuchen. Drei Ursachen blockierten die vier Arbeiter:
//   - der Leser hing bei einzelnen Replays endlos (zehn Minuten Frist, zwei Versuche, je Match zwanzig Minuten Arbeiter weg)
//   - Replays, die Epic nach 31 Tagen geloescht hat ("folder_not_found"), wurden hunderte Male neu angefragt
//   - Leser-Abstuerze der Bibliothek (IndexOutOfRange) sind bei jedem Versuch dieselben
// Jetzt: frische Matches zuerst; jeder Fehler hat eine Art (weg / leser / zeitweise) und einen Zeitpunkt, vor dem er nicht wiederholt wird.
//
//
// Am 28.10.2026 gegen halbe Matches (Betreiber: "Zone 6 hat es nicht analysiert in beiden Tagen"): wer ein Replay herunterlaedt, waehrend das Spiel noch laeuft, bekommt nur den
// Anfang - das letzte Spiel jedes Finaltags stand mit 2 von 13 Zonen und einem Fuenftel der Kills im Index und galt als fertig. Jetzt fragt der Lauf vorher Epics Metadaten
// (bIsLive, LengthInMS) und vergleicht danach die Laenge des gelesenen Replays damit; ein Teil-Match gilt als nicht gelesen (Art "teil", kurze Pause) und wird wiederholt.
// Bereits abgelegte Teil-Matches (ohne Ende, ohne Pruefmarke) werden an Ort und Stelle neu gelesen, solange Epic sie noch hat.
//
//   node scripts/replay-voll-holen.mjs [--hoechstens 200] [--parallel 4] [--minuten 20]
//   node scripts/replay-voll-holen.mjs <eventId> <windowId>   ein Tag, egal wie alt

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { matchIds, replayVorhanden } from '../lib/replayKern.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const dotnet = promisify(execFile);
const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'replay-voll');
const INDEX = path.join(ZIEL, 'index.json');
const WERKZEUG = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');

const liesJson = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
const arg = process.argv.slice(2);
const zahl = (name, standard) => { const i = arg.indexOf(name); const v = i >= 0 ? Number(arg[i + 1]) : NaN; return Number.isFinite(v) && v > 0 ? v : standard; };
const hoechstens = zahl('--hoechstens', 200);
const gleichzeitig = zahl('--parallel', 4);
const START = Date.now();
const frist = START + zahl('--minuten', 20) * 60_000;
/*
 * Das Auflisten (Sitzungen je Spieltag bei Epic) hat seine eigene, halbe Frist (28.10.2026): vorher teilte es sich die Frist mit dem Lesen. Seit 03:43 dauerte
 * das Auflisten aller rund 400 Spieltage laenger als die sechs Minuten eines Durchgangs - danach begann kein Arbeiter mehr, nichts wurde gespeichert, auch
 * nicht der Pruefstand (index.geprueft), und der naechste Durchgang listete wieder alles auf. Jetzt wird nach dem Auflisten gespeichert.
 */
const listenFrist = START + Math.max(2, zahl('--minuten', 20) / 2) * 60_000;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
/** Hoch setzen, wenn der Leser sich aendert (neue Bibliothek, behobener Fehler): Leser-Fehler werden dann einmal neu versucht. */
const LESER_STAND = '2026-10-26';
const LESER_SEKUNDEN = 150;
const STUNDE = 3600_000;

/** Welcher Art ein Fehler ist - davon haengt ab, ob und wann es sich lohnt, das Match noch einmal anzufassen. */
function fehlerArt(text) {
  if (/^Unvollstaendig/i.test(text)) return 'teil';
  if (/folder_not_found|not_allowed|NotFound|HTTP 404/i.test(text)) return 'weg';
  if (/IndexOutOfRange|Zeitlimit|Zeit abgelaufen|SIGTERM|Code 3|NullReference|ArgumentOutOfRange|InvalidOperation|OutOfMemory|KeyNotFound|Code 1:/i.test(text)) return 'leser';
  return 'zeitweise';
}

/**
 * Wann ein gescheitertes Match wieder dran ist (null = nie mehr).
 *   weg:       Epic hat das Replay (noch) nicht - frisch kann es noch kommen (10 Min, 30 Min, 1,5 h, dann alle 6 h), nach dem Ablauf der 31 Tage nie
 *   leser:     Absturz oder Haenger der Bibliothek - bei gleichem Leser immer wieder derselbe; zwei Wiederholungen im Abstand von 12 und 24 Stunden, danach nur
 *              noch, wenn LESER_STAND steigt
 *   zeitweise: Netz, Epic ueberlastet - 5 Minuten, wachsend bis 2 Stunden, ohne Ende
 *   teil:      das Replay war beim Laden noch nicht ganz (Spiel laeuft, Epic laedt noch hoch) - 4, 8, 16 Minuten, dann alle 30; nach sechs Versuchen und sechs Stunden
 *              nimmt abarbeiten() es, wie es ist (Pruefmarke unvollstaendig), damit ein Spiel, das Epic nie vollstaendig meldet, nicht ewig wartet
 */
function naechsterVersuch(f, datum) {
  const letzter = Date.parse(f.zeit) || Date.now();
  const n = f.versuche ?? 1;
  const alt = datum ? Date.now() - datum : 0;
  if (f.art === 'weg') {
    if (alt > 31 * 864e5 - 2 * STUNDE || n > 14) return null;
    return letzter + Math.min(6 * STUNDE, 10 * 60_000 * 3 ** Math.min(n - 1, 4));
  }
  if (f.art === 'teil') return letzter + Math.min(30 * 60_000, 4 * 60_000 * 2 ** Math.min(n - 1, 4));
  if (f.art === 'leser') {
    // Ein Eintrag aus einer frueheren Leserfassung wird einmal neu versucht - ausser er ist aus der Zeit vor dieser Regel (ohne Stand) und hat schon dutzende Versuche hinter sich.
    if (f.stand && f.stand !== LESER_STAND) return letzter;
    if (n >= 3) return null;
    return letzter + 12 * STUNDE * n;
  }
  return letzter + Math.min(2 * STUNDE, 5 * 60_000 * 2 ** Math.min(n - 1, 6));
}

if (!fs.existsSync(WERKZEUG) && !arg.includes('--liste')) {
  console.log(`Leser fehlt (${WERKZEUG}) - erst: dotnet build tools/replay-voll -c Release`);
  process.exit(0);
}

/**
 * Ist dieser abgelegte Match nur ein Anfang? Teil-Matches haben kein Ende (MatchEndTime fehlt, solange das Spiel laeuft); Eintraege, die der Lauf selbst auf
 * Vollstaendigkeit geprueft hat (vollstaendig / unvollstaendig), sind entschieden. Was Epic nicht mehr hat (ab 29 Tagen), ist nicht mehr zu retten; die Massen-Qualifier
 * liest dieser Leser gar nicht.
 */
const MASSEN = /LastChanceQualifier|FNCSSoloQualifiers_/i;
/**
 * Seit 28.10.2026 gibt der Leser jeden Treffer aus ("wer hat wen angeschossen" in der Replay-Ansicht). Abgelegte Spiele ohne diese Liste werden einmal neu
 * gelesen, solange Epic sie hat.
 */
// mitTreffer 2 (28.10.2026, nachts): Spiele, die bis dahin "mit Treffer" gelesen wurden, deren Datei aber wegen "--neuer-als 20" nie ans Release kam, werden einmal neu gelesen.
const ohneTreffer = (m, datum) => Boolean(m) && m.mitTreffer !== 2 && !MASSEN.test(m.windowId ?? '')
  && Date.now() - (Date.parse(m.beginn ?? '') || datum || 0) < 29 * 864e5;
// mitBus (29.10.2026): der Leser gibt die Busroute aus (Betreiber: "wo der Bus durchgeflogen ist") - abgelegte Spiele ohne sie werden einmal neu gelesen.
const ohneBus = (m, datum) => Boolean(m) && m.mitBus !== 1 && !MASSEN.test(m.windowId ?? '')
  && Date.now() - (Date.parse(m.beginn ?? '') || datum || 0) < 29 * 864e5;
// mitOrten (30.10.2026): der Leser gibt Orte, Lebenspunkte, Schuesse und Loot je Spieler aus (2D-Ansicht wie bei Osirion) - abgelegte Spiele ohne sie
// werden einmal neu gelesen, solange Epic sie hat.
const ohneOrte = (m, datum) => Boolean(m) && m.mitOrten !== 2 && !MASSEN.test(m.windowId ?? '')
  && Date.now() - (Date.parse(m.beginn ?? '') || datum || 0) < 29 * 864e5;
const teilgelesen = (m, datum) => Boolean(m) && m.ende == null && !m.vollstaendig && !m.unvollstaendig && !MASSEN.test(m.windowId ?? '')
  && Date.now() - (Date.parse(m.beginn ?? '') || datum || 0) < 29 * 864e5;
/**
 * Warum das gelesene Replay nicht das ganze Match ist - null, wenn es vollstaendig ist. Mit Epics Metadaten: Laenge des Replays gegen LengthInMS (ein Teil-Match kam
 * mit 420 s statt 1436 s). Ohne Metadaten: ein Ende oder die Zonen eines ganzen Matches (zwolf und mehr).
 */
function unvollstaendigGrund(m, meta) {
  if (meta?.LengthInMS && m.laenge) {
    return m.laenge >= 0.97 * meta.LengthInMS ? null : `${Math.round(m.laenge / 1000)} s von ${Math.round(meta.LengthInMS / 1000)} s`;
  }
  return m.ende != null || (m.zonen ?? []).length >= 8 ? null : 'ohne Ende, wenige Zonen';
}

const index = liesJson(INDEX, { matches: {} });
index.fehler ??= {};
/** Wann ein Fenster zuletzt nach neuen Matches abgefragt wurde - abgeschlossene Tage muessen nicht in jedem Durchgang der Schleife befragt werden. */
index.geprueft ??= {};

/**
 * Die Fenster der letzten 31 Tage aus dem Live-Katalog der Seite.
 *
 * Betreiber (19.10.2026): von jedem kuenftigen Cup sollen die Zonen da sein. Die gespeicherten Spieltage (epic-spieltage) hinken aber
 * hinterher - der stuendliche Lauf holt sie nur, wenn sein Schritt "Spieltage holen" in den fuenfzehn Minuten fertig wird, und der
 * brach seit dem 3.10. jede Stunde ab. Der Katalog kennt jedes Fenster sofort; was dort als Finale gilt, wird ohne Umweg gelesen.
 */
async function katalogFenster(grenze) {
  const basis = (process.env.WERKZEUG_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
  try {
    const r = await fetch(`${basis}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': 'comphub-replays' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const k = await r.json();
    const raus = [];
    for (const cup of k.cups ?? []) {
      for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
        for (const w of fenster) {
          if (w.status !== 'vorbei' || !w.windowId || !w.eventId || String(w.eventId).startsWith('manuell_')) continue;
          const beginn = Number(w.begin ?? w.end ?? 0);
          if (!beginn || beginn < grenze) continue;
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region, datum: beginn, titel: cup.titel, cupId: cup.id,
            season: /^(S\d+)_/i.exec(w.windowId)?.[1]?.toUpperCase() ?? '', istFinale: Boolean(w.istFinale) || Boolean(cup.global),
          });
        }
      }
    }
    return raus;
  } catch (e) {
    console.log(`Katalog nicht erreichbar (${String(e?.message ?? e).slice(0, 80)}) - es gelten die gespeicherten Spieltage.`);
    return [];
  }
}

/** Welche Tage: Finals und LANs der letzten 31 Tage, aus den gespeicherten Spieltagen und dem Live-Katalog. */
async function tage() {
  if (arg.length >= 2 && !arg[0].startsWith('--')) return [{ eventId: arg[0], windowId: arg[1], datum: Date.now(), titel: arg[1] }];
  const grenze = Date.now() - 31 * 864e5;
  const alle = [];
  const ordner = path.join(DATEN, 'epic-spieltage');
  for (const s of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    const o = path.join(ordner, s);
    if (!fs.statSync(o).isDirectory()) continue;
    for (const f of fs.readdirSync(o).filter((x) => x.endsWith('.json'))) {
      const t = liesJson(path.join(o, f), null);
      if (!t?.windowId || (t.datum ?? 0) < grenze) continue;
      alle.push(t);
    }
  }
  // Ein Fenster zaehlt einmal (die Kennung nennt die Region mit); die Angaben des Katalogs gelten, Datum und Finale-Merkmal bleiben, wenn der gespeicherte Tag sie kennt.
  const nachFenster = new Map(alle.map((t) => [t.windowId, t]));
  for (const t of await katalogFenster(grenze)) {
    const alt = nachFenster.get(t.windowId);
    nachFenster.set(t.windowId, alt ? { ...alt, ...t, datum: alt.datum ?? t.datum, istFinale: Boolean(alt.istFinale || t.istFinale) } : t);
  }
  alle.length = 0;
  alle.push(...nachFenster.values());
  // Die letzte Runde eines Abends (EventNRoundM mit dem hoechsten M ueber 1) ist das Finale dieses Cups, auch wenn Epic sie nicht "Final" nennt.
  const hoechste = new Map();
  const rundeVon = (w) => /^(.*?Event\d+)Round(\d+)/i.exec(w);
  for (const t of alle) {
    const m = rundeVon(t.windowId);
    if (!m) continue;
    const k = `${t.eventId}|${t.region}|${m[1]}`;
    hoechste.set(k, Math.max(hoechste.get(k) ?? 0, +m[2]));
  }
  const letzteRunde = (t) => {
    const m = rundeVon(t.windowId);
    return !!m && +m[2] > 1 && +m[2] === hoechste.get(`${t.eventId}|${t.region}|${m[1]}`);
  };
  const raus = [];
  for (const t of alle) {
    // Offene Qualifier mit tausenden Lobbys (Last Chance Qualifier, FNCS Solo Qualifiers) liest dieser Leser nicht mehr: 160 MB je Lobby, und die Release-Anhaenge
    // (tausend je Release) und das Hochladen (rund fuenfhundert je Stunde) reichten nie - im Oktober 2026 fuellten sie das Release und verdraengten die Finals. Ihre
    // Spielerwerte kommen aus dem schlanken Sammler (replays-holen.mjs, Kills, Knocks, Tode je Spieler fuer alle Lobbys).
    if (/LastChanceQualifier|FNCSSoloQualifiers_/i.test(t.windowId)) continue;
    // Dazu die FNCS Solos mit Heats, Fast Track und Last Chance (nicht die Qualifier mit zehntausenden Spielern): der Betreiber (20.10.2026) vermisste sie in den Replays.
    if (!(t.istFinale || letzteRunde(t) || /MannekenPis|Global|LAN|Escargo|FNCSSolo(?!Qualifiers)/i.test(`${t.windowId} ${t.cupId} ${t.titel}`))) continue;
    raus.push({ eventId: t.eventId, windowId: t.windowId, datum: t.datum, titel: t.titel, region: t.region, season: t.season });
  }
  // Die juengsten zuerst: dort schaut man zuerst hin; die aeltesten folgen in den naechsten Laeufen. Die Qualifier der FNCS Solos (tausende Lobbys) kommen nach allem anderen:
  // der Betreiber (20.10.2026) vermisste zuerst Performance Cups und Solo Cups, und die liegen sonst hinter hunderten Qualifier-Lobbys.
  const spaet = (t) => (/Qualifiers_/i.test(t.windowId) ? 1 : 0);
  return raus.sort((a, b) => spaet(a) - spaet(b) || (b.datum ?? 0) - (a.datum ?? 0));
}

/** Eine Aufgabe mehrmals versuchen, mit wachsender Pause - Epic und das Netz sind nicht immer sofort bereit. */
async function mitWiederholung(name, tun, versuche = 3) {
  let letzter;
  for (let i = 1; i <= versuche; i += 1) {
    try { return await tun(); } catch (e) { letzter = e; if (e?.dauerhaft) break; if (i < versuche) await warte(2000 * i * i); }
  }
  throw new Error(`${name}: ${String(letzter?.message ?? letzter).slice(0, 160)}`);
}

let aufgegeben = 0; let wartend = 0;
/** Hat dieser Tag einen gescheiterten Match, der jetzt wieder dran ist? Nur dann lohnt die Abfrage trotz einer frischen Pruefung. */
const faelligerFehler = (tag) => Object.values(index.matches).some((m) => m.windowId === tag.windowId && teilgelesen(m, tag.datum)) || Object.values(index.fehler).some((x) => {
  if (x.windowId !== tag.windowId) return false;
  x.art ??= fehlerArt(x.fehler ?? '');
  const w = naechsterVersuch(x, tag.datum);
  return w !== null && w <= Date.now();
});
/** Alle noch fehlenden und faelligen Matches aller Tage - frische zuerst (nach Tagen, neueste zuerst), danach die wiederholbaren Fehlschlaege. */
async function aufgaben() {
  const liste = [];
  for (const tag of await tage()) {
    if (Date.now() > listenFrist) break;
    // Ein Tag, der vor mehr als sechs Stunden begann und vor weniger als einer halben Stunde befragt wurde, hat nichts Neues (Epics Schnittstelle nicht jede Minute belasten).
    if (Date.now() - (tag.datum ?? Date.now()) > 6 * 3600_000 && Date.now() - (index.geprueft[tag.windowId] ?? 0) < 30 * 60_000 && !faelligerFehler(tag)) continue;
    let ids = [];
    try { ids = [...await mitWiederholung(`${tag.windowId} Sitzungen`, () => matchIds(tag.eventId, tag.windowId, 3), 2)]; } catch (e) { console.log(`  ${tag.windowId}: ${e.message}`); continue; }
    index.geprueft[tag.windowId] = Date.now();
    for (const id of ids) {
      if (index.matches[id] && !teilgelesen(index.matches[id], tag.datum) && !ohneTreffer(index.matches[id], tag.datum) && !ohneBus(index.matches[id], tag.datum) && !ohneOrte(index.matches[id], tag.datum)) continue;
      const f = index.fehler[id];
      if (f) {
        f.art ??= fehlerArt(f.fehler ?? '');
        const wann = naechsterVersuch(f, tag.datum);
        if (wann === null) { aufgegeben += 1; continue; }
        if (wann > Date.now()) { wartend += 1; continue; }
      }
      liste.push({ id, tag });
    }
  }
  // Frische Matches vor den wiederholten (Betreiber, 26.10.2026: der Cup soll binnen einer Stunde ausgewertet sein); Array.sort ist stabil, die Reihenfolge nach Tagen bleibt.
  return liste.sort((a, b) => (index.fehler[a.id] ? 1 : 0) - (index.fehler[b.id] ? 1 : 0));
}

const speichereIndex = () => { fs.mkdirSync(ZIEL, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(index)); };
let erledigt = 0; let gescheitert = 0;

async function abarbeiten({ id, tag }) {
  const tmp = path.join(os.tmpdir(), `voll-${id}.replay`);
  try {
    // Epics Metadaten vorab: laeuft das Spiel noch (bIsLive), waere das Replay nur der Anfang - dann gar nicht erst 200 MB laden. Sind die Metadaten nicht erreichbar, gilt die Pruefung am Ende ohne sie.
    let meta = null;
    try { meta = (await replayVorhanden(id)).metadaten; } catch { meta = null; }
    const vorher = index.fehler[id];
    const geduldAus = (vorher?.art === 'teil' ? vorher.versuche : 0) >= 6 && Date.now() - (tag.datum ?? Date.now()) > 6 * STUNDE;
    if (meta?.bIsLive && !geduldAus) throw new Error('Unvollstaendig: Epic fuehrt das Replay noch als live');
    const puffer = await mitWiederholung(`${id} herunterladen`, async () => {
      try { return await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 }); }
      catch (e) { if (fehlerArt(String(e?.message ?? e)) === 'weg') e.dauerhaft = true; throw e; }
    }, 3);
    fs.writeFileSync(tmp, puffer);
    const m = await mitWiederholung(`${id} auslesen`, async () => {
      try {
        const { stdout } = await dotnet('dotnet', [WERKZEUG, tmp], { maxBuffer: 256 * 1024 * 1024, timeout: (LESER_SEKUNDEN + 45) * 1000, env: { ...process.env, REPLAY_SEKUNDEN: String(LESER_SEKUNDEN) } });
        return JSON.parse(stdout);
      } catch (e) {
        // Der Grund steht am Ende der Fehlerausgabe des Lesers - ohne ihn blieb von "Command failed" nur der Befehl uebrig (14.10.2026).
        const ende = String(e.stderr ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(-2).join(' | ');
        const fehler = new Error(`${e.killed ? 'Zeit abgelaufen' : `Code ${e.code ?? '?'}`}${e.signal ? ` (${e.signal})` : ''}: ${ende || String(e.message).split('\n')[0].slice(-100)}`);
        // Haenger und Abstuerze der Bibliothek sind bei jedem Versuch dieselben - nicht sofort noch einmal.
        fehler.dauerhaft = e.killed || e.code === 3 || /IndexOutOfRange|NullReference|ArgumentOutOfRange|KeyNotFound/.test(ende);
        throw fehler;
      }
    }, 2);
    const grund = unvollstaendigGrund(m, meta);
    if (grund && !geduldAus) throw new Error(`Unvollstaendig: ${grund}`);
    const monat = (m.beginn ?? new Date(tag.datum ?? Date.now()).toISOString()).slice(0, 7);
    const rel = path.join('replay-voll', monat, tag.windowId, `${id}.json`);
    fs.mkdirSync(path.dirname(path.join(DATEN, rel)), { recursive: true });
    fs.writeFileSync(path.join(DATEN, rel), JSON.stringify({ ...m, windowId: tag.windowId, eventId: tag.eventId }));
    index.matches[id] = {
      datei: rel.replace(/\\/g, '/'), windowId: tag.windowId, eventId: tag.eventId, titel: tag.titel,
      region: tag.region, season: tag.season, beginn: m.beginn, ende: m.ende,
      sieger: (m.spieler ?? []).filter((p) => !p.bot && p.team === m.sieger).map((p) => p.name),
      spieler: (m.spieler ?? []).filter((p) => !p.bot).length, zonen: (m.zonen ?? []).length,
      // Pruefmarke (28.10.2026): vollstaendig = Laenge gegen Epics Metadaten geprueft; unvollstaendig = Epic hat es nie ganz geliefert, genommen, wie es ist.
      laenge: m.laenge ?? null, ...(grund ? { unvollstaendig: true } : { vollstaendig: true }),
      ...(Array.isArray(m.treffer) ? { mitTreffer: 2 } : {}),
      // Auch ohne Bus im Replay gilt es als mit dem neuen Leser gelesen - sonst wuerde es endlos neu gelesen.
      mitBus: 1,
      ...(m.orte ? { mitOrten: m.hand ? 2 : 1 } : {}),
    };
    delete index.fehler[id];
    speichereIndex();
    erledigt += 1;
    console.log(`  ${tag.windowId} ${id}: ${(puffer.length / 1e6).toFixed(0)} MB, ${index.matches[id].spieler} Spieler, ${index.matches[id].zonen} Zonen`);
  } catch (e) {
    gescheitert += 1;
    const text = String(e.message).slice(0, 200);
    index.fehler[id] = { versuche: (index.fehler[id]?.versuche ?? 0) + 1, fehler: text, art: fehlerArt(text), stand: LESER_STAND, zeit: new Date().toISOString(), windowId: tag.windowId };
    speichereIndex();
    console.log(`  ${tag.windowId} ${id}: GESCHEITERT (Versuch ${index.fehler[id].versuche}) ${String(e.message).slice(0, 160)}`);
  } finally { fs.rmSync(tmp, { force: true }); }
}

// --liste: nur zeigen, welche Tage gelesen wuerden (zum Pruefen der Auswahl).
if (arg.includes('--liste')) {
  const t = await tage();
  for (const x of t) console.log(`${new Date(x.datum ?? 0).toISOString().slice(0, 16)} ${String(x.region ?? '').padEnd(4)} ${x.windowId}`);
  console.log(`${t.length} Tage`);
  process.exit(0);
}
const alle = await aufgaben();
speichereIndex();
console.log(`Aufgelistet in ${Math.round((Date.now() - START) / 1000)} s. ${alle.length} Matches fehlen noch und sind dran (${alle.filter((x) => index.fehler[x.id]).length} davon Wiederholungen); ${wartend} Fehlschlaege warten auf ihre Zeit, ${aufgegeben} aufgegeben; ${gleichzeitig} gleichzeitig, hoechstens ${hoechstens}.`);
let naechster = 0;
const arbeiter = async () => {
  while (naechster < alle.length && erledigt + gescheitert < hoechstens && Date.now() < frist) {
    await abarbeiten(alle[naechster++]);
  }
};
await Promise.all(Array.from({ length: gleichzeitig }, arbeiter));
console.log(`ausgelesen ${erledigt}, gescheitert ${gescheitert}, noch offen ${alle.length - naechster}, im Verzeichnis ${Object.keys(index.matches).length}`);
