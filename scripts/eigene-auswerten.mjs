// Die bestellten Auswertungen der eigenen Lobbys abarbeiten (lib/eigeneAuswertung).
//
// Wer sich mit Epic verifiziert hat und seine Stats in einem Cup ansieht, bestellt damit die Replays SEINER Lobbys (eine Datei je Fenster und
// Konto unter eigene-anfragen/). Dieses Skript liest sie mit tools/replay-voll, zaehlt je Spieler seines Teams Schaden, Treffer, Kopftreffer,
// Eliminierungen, Knocks und Tode und legt das Ergebnis unter eigene-stats/<Fenster>/<Konto>.json ab - unter dem Konto jedes
// Teammitglieds, gleicher Inhalt.
//
//   node scripts/eigene-auswerten.mjs --pruefen            nur zaehlen, was offen ist (schreibt "offen=N" nach GITHUB_OUTPUT)
//   node scripts/eigene-auswerten.mjs [--minuten 40] [--parallel 3]
//
// Kein Replay wird erfunden: was sich nicht lesen laesst, steht in "fehlend", und die Seite sagt, wie viele Spiele ausgewertet sind.
// Ein Ergebnis ohne ein einziges gelesenes Replay wird erst nach zwei Stunden geschrieben - bis dahin gilt ein Aussetzer bei Epic und es
// wird beim naechsten Lauf noch einmal versucht.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const DATEN = process.env.COMPHUB_DATEN || path.join(process.cwd(), 'data');
const ANFRAGEN = path.join(DATEN, 'eigene-anfragen');
const STATS = path.join(DATEN, 'eigene-stats');
const WERKZEUG = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');
const FRIST_MS = 31 * 864e5;

const arg = process.argv.slice(2);
const zahl = (name, standard) => { const i = arg.indexOf(name); const v = i >= 0 ? Number(arg[i + 1]) : NaN; return Number.isFinite(v) && v > 0 ? v : standard; };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const liesJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** Alle Bestellungen, zu denen es noch kein Ergebnis gibt und deren Replays bei Epic noch liegen koennen - die aeltesten zuerst. */
function offene() {
  const raus = [];
  for (const f of fs.existsSync(ANFRAGEN) ? fs.readdirSync(ANFRAGEN) : []) {
    if (!f.endsWith('.json')) continue;
    const a = liesJson(path.join(ANFRAGEN, f));
    if (!a?.windowId || !/^[0-9a-f]{32}$/.test(a.epicId ?? '') || !Array.isArray(a.sitzungen) || !a.sitzungen.length) continue;
    if (Date.now() - (a.zeit ?? 0) > FRIST_MS) continue;
    if (fs.existsSync(path.join(STATS, a.windowId, `${a.epicId}.json`))) continue;
    raus.push(a);
  }
  return raus.sort((x, y) => (x.zeit ?? 0) - (y.zeit ?? 0));
}

if (arg.includes('--pruefen')) {
  const n = offene().length;
  console.log(`offen=${n}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `offen=${n}\n`);
  process.exit(0);
}

if (!fs.existsSync(WERKZEUG)) {
  console.log(`Leser fehlt (${WERKZEUG}) - erst: dotnet build tools/replay-voll -c Release`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const dotnet = promisify(execFile);

/** Eine Aufgabe mehrmals versuchen, mit wachsender Pause. */
async function mitWiederholung(tun, versuche = 3) {
  let letzter;
  for (let i = 1; i <= versuche; i += 1) {
    try { return await tun(); } catch (e) { letzter = e; if (i < versuche) await warte(2000 * i * i); }
  }
  throw letzter;
}

/** Ein Replay lesen: die volle Ausgabe des eigenen Lesers (Spieler, Kill-Feed, Schaden) - oder null. */
async function leseSitzung(id) {
  const tmp = path.join(os.tmpdir(), `eigene-${id}.replay`);
  try {
    const puffer = await mitWiederholung(() => downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 }), 3);
    fs.writeFileSync(tmp, puffer);
    return await mitWiederholung(async () => {
      try {
        const { stdout } = await dotnet('dotnet', [WERKZEUG, tmp], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 });
        return JSON.parse(stdout);
      } catch (e) {
        const ende = String(e.stderr ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(-2).join(' | ');
        throw new Error(`${e.killed ? 'Zeit abgelaufen' : `Code ${e.code ?? '?'}`}${e.signal ? ` (${e.signal})` : ''}: ${ende || String(e.message).split('\n')[0].slice(-100)}`);
      }
    }, 2);
  } catch (e) {
    console.log(`    ${id}: ${String(e?.message ?? e).slice(0, 140)}`);
    return null;
  } finally { fs.rmSync(tmp, { force: true }); }
}

/** Die Werte der Teammitglieder aus einem gelesenen Match zu den Summen addieren. */
function zaehle(m, team, summen) {
  const feed = m.feed ?? [];
  for (const konto of team) {
    const p = (m.spieler ?? []).find((x) => !x.bot && String(x.epic ?? '').toLowerCase() === konto);
    if (!p) continue;
    const s = summen[konto] ??= { name: p.name, spiele: 0, kills: 0, knocks: 0, tode: 0, dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, schild: 0 };
    s.spiele += 1;
    s.kills += p.kills ?? 0;
    s.knocks += feed.filter((f) => f.art === 'unten' && f.taeter === p.id).length;
    const gestorben = feed.some((f) => f.art === 'tot' && f.opfer === p.id) || (typeof p.platz === 'number' && p.platz > 1 && p.platz < 999);
    if (gestorben) s.tode += 1;
    const d = (m.schaden ?? []).find((x) => x.id === p.id);
    if (d) {
      s.dmg += d.gemachtOhneBoden ?? d.gemacht ?? 0; s.dmgAlle += d.gemacht ?? 0; s.erlitten += d.genommen ?? 0;
      s.treffer += d.treffer ?? 0; s.krit += d.krit ?? 0; s.schild += d.schild ?? 0;
    }
  }
}

const frist = Date.now() + zahl('--minuten', 40) * 60_000;
const gleichzeitig = zahl('--parallel', 3);
const todo = offene();
console.log(`${todo.length} Bestellungen offen; ${gleichzeitig} Replays gleichzeitig.`);
let fertig = 0; let spaeter = 0;

for (const a of todo) {
  if (Date.now() > frist) { console.log('Zeit um - der Rest im naechsten Lauf.'); break; }
  console.log(`  ${a.windowId} ${a.epicId.slice(0, 8)}: ${a.sitzungen.length} Lobbys, Team ${a.team?.length ?? 1}`);
  const team = [...new Set([...(a.team ?? []), a.epicId])].map((x) => String(x).toLowerCase());
  const summen = {}; const fehlend = [];
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < a.sitzungen.length) {
      const id = a.sitzungen[naechster++];
      const m = await leseSitzung(id);
      if (m) zaehle(m, team, summen); else fehlend.push(id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(gleichzeitig, a.sitzungen.length) }, arbeiter));
  const gelesen = a.sitzungen.length - fehlend.length;
  // Nichts gelesen: ein Aussetzer bei Epic kann nach einer Stunde wieder gut sein - erst nach zwei Stunden gilt es als "nicht abrufbar".
  if (gelesen === 0 && Date.now() - (a.zeit ?? 0) < 2 * 3600_000) { spaeter += 1; console.log('    nichts lesbar - spaeter noch einmal'); continue; }
  const ergebnis = {
    version: 1, eventId: a.eventId, windowId: a.windowId, gerechnet: new Date().toISOString(),
    sitzungen: a.sitzungen.length, gelesen,
    ...(fehlend.length ? { fehlend } : {}),
    ...(gelesen === 0 ? { grund: 'Die Replays dieses Cups lassen sich bei Epic nicht mehr abrufen.' } : {}),
    spieler: summen,
  };
  for (const konto of team) {
    const ziel = path.join(STATS, a.windowId, `${konto}.json`);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, JSON.stringify(ergebnis));
  }
  fertig += 1;
  console.log(`    fertig: ${gelesen}/${a.sitzungen.length} Lobbys, ${Object.keys(summen).length} Spieler`);
}
console.log(`ausgewertet ${fertig}, spaeter ${spaeter}, offen ${offene().length}`);
