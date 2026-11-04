// Der Live-Sammler: liest waehrend eines Cups die ganze Bestenliste, sobald Epic sie neu rechnet, und merkt sich jedes Match, das dabei auftaucht.
//
// Der Betreiber (4.11.2026): "die 800 fehlenden Matches ... das musst du irgendwie umgehen". Epic gibt nie mehr als 10.000 Plaetze heraus (getestet: page,
// rank, pageSize, fromIndex, offset - dahinter ist die Liste leer), und ein Match steht nur bei den Spielern in der Liste. Wer aber zwischendurch in den
// Top 10.000 stand, zeigt in dem Moment seine Spiele. Beim Solo Reload Day 1 EU zeigte die Endliste 10.584 Matches, wir hatten 11.019: die 435 extra kamen
// allein aus den Laeufen der Schnellspur waehrend des Cups, und die fragt nur alle zehn bis fuenfzehn Minuten. Osirion hatte 11.848.
//
// Dieser Lauf fragt deshalb jede halbe Minute die erste Seite und liest alles, sobald sich der Stand aendert. Er schreibt nichts in den Stand des Spieltags
// (dort gibt es nur einen Schreiber): die Ids liegen als kleiner Anhang "live-ids-<windowId>.json" am Release "signale", der Planer der Schnellspur holt sie
// ohne API ab. Laeuft auf GitHub, nie auf dem PC des Betreibers.
//
//   node scripts/replays-live-sammler.mjs            bis nichts mehr laeuft
//   node scripts/replays-live-sammler.mjs --probe E/W  eine Runde fuer ein Fenster (eventId/windowId), ohne Hochladen

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';
import { replayRegel, endrunden } from '../lib/replayRegel.mjs';

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const SEITE = (process.env.WERKZEUG_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'live-ids-'));
const TAKT_MS = 30_000;              // so oft wird die erste Seite gefragt
const SPAETESTENS_MS = 8 * 60_000;   // auch ohne neuen Stand alles lesen
const HOCHLADEN_MS = 5 * 60_000;
const VORLAUF_MS = 45 * 60_000;      // so lange vor dem Start wartet der Lauf
const NACHLAUF_MS = 200 * 60_000;    // Osirion fand am 3.11. rund 700 der 829 uns fehlenden Matches erst zwei Stunden nach Cup-Ende: so lange bleibt der Sammler dran und zeigt, ob Epics Liste dann mehr hergibt
const LAUFZEIT_MS = 340 * 60_000;    // GitHub bricht nach sechs Stunden ab
const GLEICHZEITIG = 5;

const fenster = new Map();           // windowId -> { eventId, begin, end, ids, live, ... }

async function hole(f, seite) {
  for (let versuch = 0; versuch < 5; versuch++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(f.eventId)}/${encodeURIComponent(f.windowId)}/${accountId}`
      + `?page=${seite}&rank=0&teamAccountIds=&showLiveSessions=true`, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 401) verwirfNutzerToken();
    // Zu viele Fragen: lieber eine Runde auslassen als Epic veraergern.
    await warte(r?.status === 429 ? (Number(r.headers.get('retry-after')) || 30) * 1000 : 2000 * (versuch + 1));
  }
  return null;
}

/** Laufende Spiele: Epics Feld "liveSessions" hat keine beschriebene Form; bis sie belegt ist, wird nur gezaehlt und nicht ausgewertet. */
function liveWerte(wert, ziel) {
  if (typeof wert === 'string') { if (/^[0-9a-f]{32}$/i.test(wert)) ziel.add(wert); return; }
  if (wert && typeof wert === 'object') for (const v of Object.values(wert)) liveWerte(v, ziel);
}

function aufnehmen(f, daten) {
  let neu = 0;
  for (const e of daten?.entries ?? []) {
    for (const s of e.sessionHistory ?? []) {
      if (s.sessionId && !f.ids.has(s.sessionId)) { f.ids.add(s.sessionId); neu += 1; }
    }
  }
  if (daten?.liveSessions && Object.keys(daten.liveSessions).length) {
    f.liveBeispiel ??= JSON.stringify(daten.liveSessions).slice(0, 300);
    liveWerte(daten.liveSessions, f.live);
  }
  return neu;
}

async function runde(f) {
  const erste = await hole(f, 0);
  if (!erste) return;
  const stand = erste.updatedTime ?? '';
  if (stand === f.stand && Date.now() - f.gelesen < SPAETESTENS_MS) return;
  const seiten = Math.min(erste.totalPages ?? 1, 100);
  let neu = aufnehmen(f, erste);
  let naechste = 1;
  await Promise.all(Array.from({ length: GLEICHZEITIG }, async () => {
    while (naechste < seiten) neu += aufnehmen(f, await hole(f, naechste++));
  }));
  f.stand = stand; f.gelesen = Date.now(); f.runden += 1;
  console.log(`${new Date().toISOString().slice(11, 19)} ${f.windowId}: ${seiten} Seiten, +${neu}, ${f.ids.size} Matches, ${f.live.size} laufend (Stand ${stand})`);
  if (f.liveBeispiel && !f.liveGezeigt) { f.liveGezeigt = true; console.log(`  liveSessions: ${f.liveBeispiel}`); }
}

function ablegen(f) {
  f.hochgeladen = Date.now();
  if (f.ids.size === f.abgelegt) return;
  const datei = path.join(ORDNER, `live-ids-${f.windowId}.json`);
  fs.writeFileSync(datei, JSON.stringify({ windowId: f.windowId, zeit: new Date().toISOString(), runden: f.runden, ids: [...f.ids], laufend: [...f.live] }));
  const r = spawnSync('gh', ['release', 'upload', 'signale', datei, '--clobber', '-R', REPO], { encoding: 'utf8' });
  if (r.status === 0) f.abgelegt = f.ids.size; else console.log(`  Hochladen ging nicht: ${String(r.stderr).trim().slice(0, 200)}`);
}

/** Bei einem Neustart mitten im Cup weiter, wo der vorige Lauf aufhoerte. */
async function bisherige(f) {
  try {
    const r = await fetch(`https://github.com/${REPO}/releases/download/signale/live-ids-${encodeURIComponent(f.windowId)}.json`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return;
    const j = await r.json();
    for (const id of j.ids ?? []) f.ids.add(id);
    f.abgelegt = f.ids.size;
  } catch { /* dann eben von vorn */ }
}

async function fensterAktualisieren() {
  const r = await fetch(`${SEITE}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (!r?.ok) { console.log('Katalog nicht erreichbar, es bleibt bei den bekannten Spieltagen.'); return; }
  const katalog = await r.json();
  const jetzt = Date.now();
  for (const cup of katalog.cups ?? []) {
    const regel = replayRegel(cup);
    if (regel === 'nichts') continue;
    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      for (const w of liste) {
        if ((finals && !finals.has(w.windowId)) || /Arena/i.test(w.windowId) || !w.begin) continue;
        const end = w.end ?? w.begin + 4 * 3600_000;
        if (fenster.has(w.windowId) || w.begin > jetzt + VORLAUF_MS || end + NACHLAUF_MS < jetzt) continue;
        const f = { windowId: w.windowId, eventId: w.eventId, begin: w.begin, end, ids: new Set(), live: new Set(), stand: null, gelesen: 0, runden: 0, abgelegt: 0, hochgeladen: 0 };
        await bisherige(f);
        fenster.set(w.windowId, f);
        console.log(`Dazu: ${w.windowId} (${new Date(w.begin).toISOString()} bis ${new Date(end).toISOString()}, schon ${f.ids.size})`);
      }
    }
  }
}

/** Das Release darf nicht volllaufen (hoechstens 1000 Anhaenge): nach vier Tagen stehen die Ids laengst im Stand des Spieltags. */
function aufraeumen() {
  const r = spawnSync('gh', ['release', 'view', 'signale', '--json', 'assets', '-R', REPO], { encoding: 'utf8' });
  if (r.status !== 0) return;
  for (const a of JSON.parse(r.stdout).assets ?? []) {
    if (a.name.startsWith('live-ids-') && Date.now() - Date.parse(a.updatedAt) > 4 * 864e5) {
      spawnSync('gh', ['release', 'delete-asset', 'signale', a.name, '-y', '-R', REPO]);
    }
  }
}

const probe = process.argv.indexOf('--probe');
if (probe >= 0) {
  const [eventId, windowId] = process.argv[probe + 1].split('/');
  const f = { windowId, eventId, ids: new Set(), live: new Set(), stand: null, gelesen: 0, runden: 0 };
  const beginn = Date.now();
  await runde(f);
  console.log(`Probe: ${Math.round((Date.now() - beginn) / 1000)} s`);
  process.exit(0);
}

const start = Date.now();
aufraeumen();
let katalogZeit = 0;
while (Date.now() - start < LAUFZEIT_MS) {
  if (Date.now() - katalogZeit > 10 * 60_000) { await fensterAktualisieren(); katalogZeit = Date.now(); }
  const jetzt = Date.now();
  for (const f of fenster.values()) {
    if (f.end + NACHLAUF_MS < jetzt) {
      f.stand = null;
      await runde(f).catch(() => {});
      ablegen(f);
      console.log(`Fertig: ${f.windowId} - ${f.ids.size} Matches in ${f.runden} Runden`);
      fenster.delete(f.windowId);
    }
  }
  if (!fenster.size) { console.log('Nichts laeuft mehr.'); break; }
  for (const f of fenster.values()) {
    if (f.begin > jetzt) continue;
    await runde(f).catch((e) => console.log(`${f.windowId}: ${e.message}`));
    if (Date.now() - f.hochgeladen > HOCHLADEN_MS) ablegen(f);
  }
  await warte(TAKT_MS);
}
for (const f of fenster.values()) ablegen(f);
