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
//   node scripts/replay-voll-holen.mjs [--hoechstens 200] [--parallel 4] [--minuten 20]
//   node scripts/replay-voll-holen.mjs <eventId> <windowId>   ein Tag, egal wie alt

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { matchIds } from '../lib/replayKern.mjs';

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
const frist = Date.now() + zahl('--minuten', 20) * 60_000;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(WERKZEUG) && !arg.includes('--liste')) {
  console.log(`Leser fehlt (${WERKZEUG}) - erst: dotnet build tools/replay-voll -c Release`);
  process.exit(0);
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
    try { return await tun(); } catch (e) { letzter = e; if (i < versuche) await warte(2000 * i * i); }
  }
  throw new Error(`${name}: ${String(letzter?.message ?? letzter).slice(0, 160)}`);
}

/** Alle noch fehlenden Matches aller Tage - die zuletzt gescheiterten zuerst, danach nach Tagen, neueste zuerst. */
async function aufgaben() {
  const liste = [];
  for (const tag of await tage()) {
    if (Date.now() > frist) break;
    // Ein Tag, der vor mehr als sechs Stunden begann und vor weniger als einer halben Stunde befragt wurde, hat nichts Neues (Epics Schnittstelle nicht jede Minute belasten).
    if (Date.now() - (tag.datum ?? Date.now()) > 6 * 3600_000 && Date.now() - (index.geprueft[tag.windowId] ?? 0) < 30 * 60_000 && !Object.values(index.fehler).some((x) => x.windowId === tag.windowId)) continue;
    let ids = [];
    try { ids = [...await mitWiederholung(`${tag.windowId} Sitzungen`, () => matchIds(tag.eventId, tag.windowId, 3), 2)]; } catch (e) { console.log(`  ${tag.windowId}: ${e.message}`); continue; }
    index.geprueft[tag.windowId] = Date.now();
    for (const id of ids) if (!index.matches[id]) liste.push({ id, tag });
  }
  // Array.sort ist stabil: innerhalb der Gruppen bleibt die Reihenfolge nach Tagen erhalten.
  return liste.sort((a, b) => (index.fehler[b.id] ? 1 : 0) - (index.fehler[a.id] ? 1 : 0));
}

const speichereIndex = () => { fs.mkdirSync(ZIEL, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(index)); };
let erledigt = 0; let gescheitert = 0;

async function abarbeiten({ id, tag }) {
  const tmp = path.join(os.tmpdir(), `voll-${id}.replay`);
  try {
    const puffer = await mitWiederholung(`${id} herunterladen`, () => downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 }), 3);
    fs.writeFileSync(tmp, puffer);
    const m = await mitWiederholung(`${id} auslesen`, async () => {
      try {
        const { stdout } = await dotnet('dotnet', [WERKZEUG, tmp], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 });
        return JSON.parse(stdout);
      } catch (e) {
        // Der Grund steht am Ende der Fehlerausgabe des Lesers - ohne ihn blieb von "Command failed" nur der Befehl uebrig (14.10.2026).
        const ende = String(e.stderr ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(-2).join(' | ');
        throw new Error(`${e.killed ? 'Zeit abgelaufen' : `Code ${e.code ?? '?'}`}${e.signal ? ` (${e.signal})` : ''}: ${ende || String(e.message).split('\n')[0].slice(-100)}`);
      }
    }, 2);
    const monat = (m.beginn ?? new Date(tag.datum ?? Date.now()).toISOString()).slice(0, 7);
    const rel = path.join('replay-voll', monat, tag.windowId, `${id}.json`);
    fs.mkdirSync(path.dirname(path.join(DATEN, rel)), { recursive: true });
    fs.writeFileSync(path.join(DATEN, rel), JSON.stringify({ ...m, windowId: tag.windowId, eventId: tag.eventId }));
    index.matches[id] = {
      datei: rel.replace(/\\/g, '/'), windowId: tag.windowId, eventId: tag.eventId, titel: tag.titel,
      region: tag.region, season: tag.season, beginn: m.beginn, ende: m.ende,
      sieger: (m.spieler ?? []).filter((p) => !p.bot && p.team === m.sieger).map((p) => p.name),
      spieler: (m.spieler ?? []).filter((p) => !p.bot).length, zonen: (m.zonen ?? []).length,
    };
    delete index.fehler[id];
    speichereIndex();
    erledigt += 1;
    console.log(`  ${tag.windowId} ${id}: ${(puffer.length / 1e6).toFixed(0)} MB, ${index.matches[id].spieler} Spieler, ${index.matches[id].zonen} Zonen`);
  } catch (e) {
    gescheitert += 1;
    index.fehler[id] = { versuche: (index.fehler[id]?.versuche ?? 0) + 1, fehler: String(e.message).slice(0, 200), zeit: new Date().toISOString(), windowId: tag.windowId };
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
console.log(`${alle.length} Matches fehlen noch (${Object.keys(index.fehler).length} davon schon einmal gescheitert); ${gleichzeitig} gleichzeitig, hoechstens ${hoechstens}.`);
let naechster = 0;
const arbeiter = async () => {
  while (naechster < alle.length && erledigt + gescheitert < hoechstens && Date.now() < frist) {
    await abarbeiten(alle[naechster++]);
  }
};
await Promise.all(Array.from({ length: gleichzeitig }, arbeiter));
console.log(`ausgelesen ${erledigt}, gescheitert ${gescheitert}, noch offen ${alle.length - naechster}, im Verzeichnis ${Object.keys(index.matches).length}`);
