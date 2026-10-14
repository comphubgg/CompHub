// Die bestellten Auswertungen der eigenen Lobbys abarbeiten (lib/eigeneAuswertung).
//
// Bestellungen kommen von zwei Seiten (je eine Datei unter eigene-anfragen/, Fenster und Konto im Namen):
//   - von der Seite: wer seine Stats in einem Cup ansieht, bestellt die Replays seiner Lobbys (mit Sitzungen und Team aus Epics Bestenliste);
//   - von scripts/eigene-bestellen.mjs: fuer jedes verifizierte Konto jeder Cup der letzten 31 Tage, in dem es steht (ohne Sitzungen -
//     sie werden hier bei Epic nachgeschlagen).
// Gelesen wird mit tools/replay-voll; je Spieler des Teams werden Schaden, Treffer, Kopftreffer, Eliminierungen, Knocks und Tode gezaehlt und
// unter eigene-stats/<Fenster>/<Konto>.json abgelegt - unter dem Konto jedes Teammitglieds, gleicher Inhalt.
//
//   node scripts/eigene-auswerten.mjs --pruefen            nur zaehlen, was offen ist (schreibt "offen=N" nach GITHUB_OUTPUT)
//   node scripts/eigene-auswerten.mjs [--minuten 40] [--parallel 4]
//
// Kein Replay wird erfunden: was sich nicht lesen laesst, steht in "fehlend", und die Seite sagt, wie viele Spiele ausgewertet sind.
// Ein Ergebnis ohne ein einziges gelesenes Replay wird erst zwei Stunden nach dem letzten Spiel geschrieben - bis dahin gilt ein Aussetzer
// bei Epic (die Replays erscheinen erst einige Minuten nach einer Runde) und es wird beim naechsten Durchgang noch einmal versucht.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const DATEN = process.env.COMPHUB_DATEN || path.join(process.cwd(), 'data');
const ANFRAGEN = path.join(DATEN, 'eigene-anfragen');
const STATS = path.join(DATEN, 'eigene-stats');
// Zum Pruefen auf einem Rechner mit anderem Aufbau: REPLAYVOLL_DLL und DOTNET_BIN (im Ablauf nicht gesetzt).
const WERKZEUG = process.env.REPLAYVOLL_DLL || path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');
const DOTNET = process.env.DOTNET_BIN || 'dotnet';
const FRIST_MS = 31 * 864e5;
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
/** Fassung der Zaehlweise: ein Ergebnis mit niedrigerer Fassung wird neu gerechnet (2: Tode = Spiele ohne Sieg, wie Epic sie fuer K/D zaehlt; 3: dazu die Zeit im Sturm; 4: dazu Wiederbelebungen und Reboots). */
const VERSION = 4;

const arg = process.argv.slice(2);
const zahl = (name, standard) => { const i = arg.indexOf(name); const v = i >= 0 ? Number(arg[i + 1]) : NaN; return Number.isFinite(v) && v > 0 ? v : standard; };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const liesJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const norm = (s) => String(s ?? '').replace(/-/g, '').toLowerCase();
const ergebnisDatei = (w, id) => path.join(STATS, w, `${id}.json`);
/** Gibt es ein Ergebnis in der heutigen Fassung? */
const fertigDa = (w, id) => (liesJson(ergebnisDatei(w, id))?.version ?? 0) >= VERSION;

/**
 * Alle Bestellungen, zu denen es noch kein Ergebnis gibt und deren Replays bei Epic noch liegen koennen.
 * Zuerst die von der Seite (jemand schaut gerade hin), dann die selbst bestellten - die juengsten Cups zuerst.
 */
function offene() {
  const raus = [];
  for (const f of fs.existsSync(ANFRAGEN) ? fs.readdirSync(ANFRAGEN) : []) {
    if (!f.endsWith('.json')) continue;
    const a = liesJson(path.join(ANFRAGEN, f));
    if (!a?.windowId || !a?.eventId || !/^[0-9a-f]{32}$/.test(a.epicId ?? '')) continue;
    if (!(Array.isArray(a.sitzungen) && a.sitzungen.length) && !a.auto) continue;
    if (Date.now() - Math.max(a.zeit ?? 0, a.datum ?? 0) > FRIST_MS) continue;
    if (fertigDa(a.windowId, a.epicId)) continue;
    raus.push(a);
  }
  const wann = (a) => a.datum ?? a.zeit ?? 0;
  return raus.sort((x, y) => (x.auto ? 1 : 0) - (y.auto ? 1 : 0) || (x.auto ? wann(y) - wann(x) : wann(x) - wann(y)));
}

if (arg.includes('--pruefen')) {
  const n = offene().length;
  console.log(`offen=${n}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `offen=${n}\n`);
  process.exit(0);
}

// Nur nachschlagen, ohne zu lesen: welche Sitzungen und welches Team Epic zu den offenen Bestellungen nennt (zum Pruefen).
if (arg.includes('--sitzungen')) {
  for (const a of offene()) {
    try {
      const r = await sitzungenVon(a);
      console.log(`${a.windowId} ${a.epicId.slice(0, 8)}: ${r.sitzungen.length} Sitzungen, Team ${r.team.length}, letztes Spiel ${r.ende ? new Date(r.ende).toISOString() : '?'}`);
    } catch (e) { console.log(`${a.windowId} ${a.epicId.slice(0, 8)}: ${e.message}`); }
  }
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

/**
 * Die Sitzungen und das Team eines Kontos in einem Fenster - aus Epics Bestenliste (wie die Seite sie beim Bestellen holt).
 * Zuerst die Seite, auf der der Platz liegen muss (100 Eintraege je Seite), dann die Nachbarn, zuletzt alle.
 */
async function sitzungenVon(a) {
  const { holeNutzerToken, verwirfNutzerToken } = await import('../lib/replayKern.mjs');
  let { token, accountId } = await holeNutzerToken();
  const seite = async (p) => {
    const url = `${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(a.eventId)}/${encodeURIComponent(a.windowId)}/${accountId}?page=${p}&rank=0&teamAccountIds=`;
    let r = await mitWiederholung(() => fetch(url, { headers: { Authorization: token } }), 2);
    if (r.status === 401) { verwirfNutzerToken(); ({ token, accountId } = await holeNutzerToken()); r = await fetch(url, { headers: { Authorization: token } }); }
    if (!r.ok) throw new Error(`Bestenliste HTTP ${r.status}`);
    return r.json();
  };
  const suche = (d) => (d.entries ?? []).find((e) => (e.teamAccountIds ?? []).some((x) => norm(x) === a.epicId));
  const erste = a.platz ? Math.max(0, Math.floor((a.platz - 1) / 100)) : 0;
  const probiert = new Set();
  let gefunden = null; let seiten = 1;
  for (const p of [erste, erste - 1, erste + 1]) {
    if (p < 0 || probiert.has(p) || gefunden) continue;
    probiert.add(p);
    let d;
    try { d = await seite(p); } catch (e) { if (p === erste) throw e; continue; }
    seiten = d.totalPages ?? seiten;
    gefunden = suche(d);
  }
  for (let p = 0; !gefunden && p < Math.min(seiten, 120); p += 1) {
    if (probiert.has(p)) continue;
    gefunden = suche(await seite(p));
    await warte(250);
  }
  if (!gefunden) { const e = new Error('nicht in der Bestenliste'); e.endgueltig = true; throw e; }
  const hist = gefunden.sessionHistory ?? [];
  return {
    sitzungen: [...new Set(hist.map((m) => m.sessionId).filter(Boolean))],
    team: (gefunden.teamAccountIds ?? []).map(norm),
    ende: Math.max(0, ...hist.map((m) => (m.endTime ? Date.parse(m.endTime) || 0 : 0))),
  };
}

/** Ein Replay lesen: die volle Ausgabe des eigenen Lesers (Spieler, Kill-Feed, Schaden) - oder null. */
async function leseSitzung(id) {
  const tmp = path.join(os.tmpdir(), `eigene-${id}.replay`);
  try {
    const puffer = await mitWiederholung(() => downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 }), 3);
    fs.writeFileSync(tmp, puffer);
    return await mitWiederholung(async () => {
      try {
        const { stdout } = await dotnet(DOTNET, [WERKZEUG, tmp], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 });
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
    const p = (m.spieler ?? []).find((x) => !x.bot && norm(x.epic) === konto);
    if (!p) continue;
    const s = summen[konto] ??= { name: p.name, spiele: 0, kills: 0, knocks: 0, tode: 0, dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, schild: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
    s.spiele += 1;
    s.kills += p.kills ?? 0;
    s.knocks += feed.filter((f) => f.art === 'unten' && f.taeter === p.id).length;
    // Tode = Spiele ohne Sieg: so zaehlt Epic fuer K/D (Eliminierungen durch Spiele minus Siege). Wer gewonnen hat, ist nicht gestorben.
    const gewonnen = p.platz === 1 || (m.sieger != null && p.team === m.sieger);
    if (!gewonnen) s.tode += 1;
    const d = (m.schaden ?? []).find((x) => x.id === p.id);
    if (d) {
      s.dmg += d.gemachtOhneBoden ?? d.gemacht ?? 0; s.dmgAlle += d.gemacht ?? 0; s.erlitten += d.genommen ?? 0;
      s.treffer += d.treffer ?? 0; s.krit += d.krit ?? 0; s.schild += d.schild ?? 0;
    }
    // Zeit im Sturm in Sekunden (Leser, Feld zusatz; gegen die Szene-Werte eines Finals geprueft).
    const zu = (m.zusatz ?? []).find((x) => x.id === p.id);
    s.sturm += zu?.sturmSek ?? 0;
    // Wie oft er vom Boden wiederbelebt (gegen "rebootsAndRevives" der Szene-Quelle an drei Finals geprueft) und per Reboot zurueckgeholt wurde (Kill-Feed).
    s.wiederbelebt += zu?.wiederbelebt ?? 0;
    s.rebootet += zu?.rebootet ?? 0;
  }
}

/** Das Ergebnis fuer jedes Teammitglied ablegen (gleicher Inhalt). */
function lege(a, team, ergebnis) {
  for (const konto of new Set([...team, a.epicId])) {
    const ziel = ergebnisDatei(a.windowId, konto);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, JSON.stringify(ergebnis));
  }
}

const frist = Date.now() + zahl('--minuten', 40) * 60_000;
const gleichzeitig = zahl('--parallel', 4);
const todo = offene();
console.log(`${todo.length} Bestellungen offen; ${gleichzeitig} Replays gleichzeitig.`);
let fertig = 0; let spaeter = 0;

for (const a of todo) {
  if (Date.now() > frist) { console.log('Zeit um - der Rest im naechsten Durchgang.'); break; }
  console.log(`  ${a.windowId} ${a.epicId.slice(0, 8)}${a.auto ? ' (selbst bestellt)' : ''}`);

  // Selbst bestellte Cups kennen ihre Sitzungen noch nicht: bei Epic nachschlagen.
  let sitzungen = a.sitzungen ?? []; let team = (a.team ?? []).map(norm); let ende = a.ende ?? a.zeit ?? 0;
  if (!sitzungen.length) {
    try {
      const r = await sitzungenVon(a);
      sitzungen = r.sitzungen; team = r.team; ende = r.ende || ende;
    } catch (e) {
      console.log(`    Sitzungen: ${String(e.message).slice(0, 120)}`);
      // Nur "steht nicht in der Bestenliste" ist endgueltig (die Liste war gekappt); alles andere kann ein Aussetzer sein.
      if (e.endgueltig) {
        lege(a, [a.epicId], { version: VERSION, eventId: a.eventId, windowId: a.windowId, gerechnet: new Date().toISOString(), sitzungen: 0, gelesen: 0, grund: 'Dieses Konto steht in Epics Bestenliste dieses Cups nicht.', spieler: {} });
        fertig += 1;
      } else spaeter += 1;
      continue;
    }
  }
  if (!sitzungen.length) { spaeter += 1; console.log('    Epic nennt keine Lobbys'); continue; }
  if (!team.includes(a.epicId)) team.push(a.epicId);
  // Aelter als 31 Tage: das Replay ist bei Epic weg.
  if (ende && Date.now() - ende > FRIST_MS) {
    lege(a, team, { version: VERSION, eventId: a.eventId, windowId: a.windowId, gerechnet: new Date().toISOString(), sitzungen: sitzungen.length, gelesen: 0, grund: 'Die Replays dieses Cups sind bei Epic schon gelöscht.', spieler: {} });
    fertig += 1; console.log('    Replays bei Epic gelöscht'); continue;
  }

  const summen = {}; const fehlend = [];
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < sitzungen.length) {
      const id = sitzungen[naechster++];
      const m = await leseSitzung(id);
      if (m) zaehle(m, team, summen); else fehlend.push(id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(gleichzeitig, sitzungen.length) }, arbeiter));
  const gelesen = sitzungen.length - fehlend.length;
  // Nichts gelesen: die Replays erscheinen erst einige Minuten nach der Runde - erst zwei Stunden nach dem letzten Spiel gilt es als "nicht abrufbar".
  if (gelesen === 0 && Date.now() - ende < 2 * 3600_000) { spaeter += 1; console.log('    nichts lesbar - spaeter noch einmal'); continue; }
  lege(a, team, {
    version: VERSION, eventId: a.eventId, windowId: a.windowId, gerechnet: new Date().toISOString(),
    sitzungen: sitzungen.length, gelesen,
    ...(fehlend.length ? { fehlend } : {}),
    ...(gelesen === 0 ? { grund: 'Die Replays dieses Cups lassen sich bei Epic nicht mehr abrufen.' } : {}),
    spieler: summen,
  });
  fertig += 1;
  console.log(`    fertig: ${gelesen}/${sitzungen.length} Lobbys, ${Object.keys(summen).length} Spieler`);
}
console.log(`ausgewertet ${fertig}, spaeter ${spaeter}, offen ${offene().length}`);
