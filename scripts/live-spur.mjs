// Die Live-Spur: die vollen Replays laufender Cups auf dem eigenen Server lesen, Match fuer Match, sobald Epic sie fertig abgelegt hat.
//
// Bisher rechnet nur GitHub (clutch-rechnen.yml / clutch-ablegen.yml): zwischen Spielende und Seite liegen 10 bis 20 Minuten. Hier laeuft dieselbe
// Arbeit je Match (lib/vollMatch.mjs - derselbe Code wie --verteilt) als Dauerlauf im Dienst "live" (deploy/server-compose.yml, Image comphub-web:voll).
//
// SCHATTENBETRIEB (14.11.2026, Phase 2): nichts, was die Seite liest, aendert sich. Geschrieben wird nur unter COMPHUB_LIVE_ORT (Standard /app/live):
//   teil/<w>/<matchId>.json      ein Teilstand je gelesenem Match, Format wie data/clutch-teil (scripts/clutch-zusammen.mjs liest ihn), gestempelt mit
//                                Code-Stand (sha) und Schadensregel (schadenFassung);
//   archiv/<w>/<matchId>.json.gz Teile, deren Match schon im Release steht - fuer den Live-Stand erledigt, fuer scripts/live-abgleich.mjs noch da;
//   clutch/<w>.json, clutch-je/<w>.json
//                                der Live-Stand: das Release plus die Teile, die dort noch fehlen, zusammengefuehrt mit dem unveraenderten
//                                clutch-zusammen.mjs (und clutch-neu-rechnen / clutch-leben wie im Ablauf "ablegen"), mit live: true und basis;
//   ids/<w>.json, zustand.json   was der Lauf fuer einen Neustart braucht.
// Kein Release, keine Ablage, kein Supabase.
//
// Ablauf:
//   - alle 30 s den Cup-Katalog (WERKZEUG_URL/api/cup-catalog?modus=alle): Spieltage, die laufen oder vor hoechstens 6 Stunden endeten - dieselben Regeln
//     wie scripts/replays-schnell-anstossen.mjs (replayRegel / endrunden, keine Arena); Reihenfolge nach cupVorrang;
//   - Match-Ids aus Epics Bestenliste (sessionHistory) wie scripts/replays-live-sammler.mjs: erste Seite alle 15 s (LIVE_SEITE0_MS), alle Seiten, sobald sich updatedTime
//     aendert (spaetestens alle 8 Minuten); bei 429 die verlangte Pause; ein Epic-Zugang fuer den ganzen Lauf (holeNutzerToken);
//   - neue Matches mit vollMatch: hoechstens LIVE_LESER (3) Leser und LIVE_LADEN (6) Downloads zugleich. Noch live oder kuerzer als das Spiel -> nach
//     90 s wieder; kein Replay / Fehler -> spaeter wieder (Hauptregel: nie endgueltig abhaken, solange der Spieltag hier gefuehrt wird);
//   - hoechstens jede Minute je Spieltag mit neuen Teilen den Live-Stand neu bauen; Teile, die das Release schon hat, archivieren;
//   - 36 Stunden nach dem Ende wird ein Spieltag ganz vergessen (dann steht er laengst im Release).
//
//   nice -n 10 node scripts/live-spur.mjs
//
// SOFORTSPUR (17.11.2026, Betreiber: volle Stats 3 bis 6 Minuten nach jedem Match, der Server liest selbst keine Replays mehr). Zwei weitere Arten:
//   LIVE_SENDEN_URL=<Seite>/api/sofort/match + SOFORT_SECRET   (GitHub, .github/workflows/sofortspur.yml)
//       liest wie oben, schickt jeden Teil sofort an die Seite (POST, gzip, Wiederholung bis er angenommen ist) und baut selbst keinen Live-Stand;
//       LIVE_NUR_VORRANG=1: nur Spieltage mit Vorrang 0 (FNCS, Cash, LCQ, Majors - lib/replayRegel cupVorrang); LIVE_LAUFZEIT_MIN: so lange hoechstens,
//       und Schluss, sobald kein Spieltag mehr frisch ist (LIVE_NACH_ENDE_MIN nach dem Ende) und nichts mehr zu senden ist.
//   LIVE_NUR_BAUEN=1   (Server, Dienst "live")
//       liest nichts und fragt Epic nicht; nimmt die Teile, die app/api/sofort/match unter LIVE_EINGANG (Standard <LIVE_ORT>/eingang/<w>/<id>.json)
//       ablegt, und baut daraus wie oben den Live-Stand (alle LIVE_BAUEN_MS, Standard 15 s).
// Den Eingang nehmen beide Server-Arten (mit und ohne LIVE_NUR_BAUEN) an.

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';
import { replayRegel, endrunden, cupVorrang } from '../lib/replayRegel.mjs';
import { GROSS_MAX, SCHADEN_FASSUNG, einarbeiten, leserDienst, neuerTeil, vollMatch, wertungSicher } from '../lib/vollMatch.mjs';
import { LIVE_ORT, archiviere, liesTeil, releaseDatei, schreibeAtomar, teilIds, teilOrdner, archivOrdner, zusammenfuehren } from '../lib/liveAblage.mjs';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEITE = (process.env.WERKZEUG_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const LESER = Math.max(1, Number(process.env.LIVE_LESER) || 3);
const LADEN = Math.max(1, Number(process.env.LIVE_LADEN) || 6);
const KATALOG_MS = 30_000;
// so oft die erste Seite der Bestenliste: 15 s statt der 5 s des Sammlers auf GitHub (replays-live-sammler.mjs fragt mit demselben Epic-Konto) - ein Match
// endet hoechstens alle paar Minuten, Epic legt das Replay ohnehin erst danach ab.
const SEITE0_MS = Math.max(5_000, Number(process.env.LIVE_SEITE0_MS) || 15_000);
const SPAETESTENS_MS = 8 * 60_000;  // auch ohne neuen Stand alle Seiten
// "auto" (deploy/server-compose.yml): nur bauen, sobald SOFORT_SECRET gesetzt ist (dann liefert GitHub die Teile) - vorher liest der Dienst selbst wie bis zum 17.11.
const NUR_BAUEN = process.env.LIVE_NUR_BAUEN === '1' || (process.env.LIVE_NUR_BAUEN === 'auto' && !!(process.env.SOFORT_SECRET || '').trim() && !(process.env.LIVE_SENDEN_URL || '').trim());
const SENDEN_URL = (process.env.LIVE_SENDEN_URL || '').trim();
const SENDEN = !!SENDEN_URL && !NUR_BAUEN;
const SOFORT_SECRET = (process.env.SOFORT_SECRET || '').trim();
const NUR_VORRANG = process.env.LIVE_NUR_VORRANG === '1';
const LAUFZEIT_MS = (Number(process.env.LIVE_LAUFZEIT_MIN) || 0) * 60_000;
// so lange nach dem Ende kommen noch Ids dazu (wie die Schnellspur); die Sofortspur auf GitHub nimmt weniger (LIVE_NACH_ENDE_MIN), danach holt das Release auf
const NACH_ENDE_MS = (Number(process.env.LIVE_NACH_ENDE_MIN) || 360) * 60_000;
const VERGESSEN_MS = 36 * 3600_000; // dann ist der Spieltag laengst im Release
// hoechstens so oft je Spieltag der Live-Stand; nur bauend 15 s (ein kleiner Spieltag braucht dafuer ein paar Sekunden in einem eigenen Prozess)
const BAUEN_MS = Number(process.env.LIVE_BAUEN_MS) || (NUR_BAUEN ? 15_000 : 60_000);
// noch live oder kuerzer als das Spiel: so bald wieder fragen
const SPAETER_MS = Number(process.env.LIVE_SPAETER_MS) || 90_000;
// Noch kein Replay bei Epic (404) oder Fehler: in den ersten FRUEH_FENSTER_MS nach dem ersten Sehen des Matches so oft wieder (0 = wie bisher 2, 4, 6 ... min).
const FRUEH_MS = Number(process.env.LIVE_FRUEH_MS) || 0;
const FRUEH_FENSTER_MS = (Number(process.env.LIVE_FRUEH_MIN) || 15) * 60_000;
const EINGANG = process.env.LIVE_EINGANG || path.join(LIVE_ORT, 'eingang');
const RELEASE_MS = 5 * 60_000;      // auch ohne neue Teile so oft im Release nachsehen (archivieren, Live-Stand nachziehen)
const ZWISCHEN = path.join(LIVE_ORT, 'release');

/*
 * Einmal-Lauf zum Pruefen (.github/workflows/live-test.yml): node scripts/live-spur.mjs --einmal --fenster <windowId> [--event <eventId>]
 * Nur dieser Spieltag, egal ob er laeuft; JEDES Match der Bestenliste wird gelesen, auch was das Release schon hat (sonst gaebe es nichts zu vergleichen);
 * danach einmal den Live-Stand bauen und enden. Rueckgabe 1, wenn Matches offen blieben.
 */
const ARG = process.argv.slice(2);
const wert = (k) => { const i = ARG.indexOf(k); return i >= 0 ? ARG[i + 1] : undefined; };
const EINMAL = ARG.includes('--einmal');
const EINMAL_FENSTER = wert('--fenster');
const EINMAL_EVENT = wert('--event');
if (EINMAL && !EINMAL_FENSTER) { console.log('Aufruf: node scripts/live-spur.mjs --einmal --fenster <windowId> [--event <eventId>]'); process.exit(2); }
/** Ein Match, das das Release schon hat, braucht der Live-Stand nicht - ausser im Einmal-Lauf. */
const imRelease = (f, id) => !EINMAL && f.auth.ids.has(id);
const ZUSTAND = path.join(LIVE_ORT, 'zustand.json');

/** Der Code-Stand fuer den Stempel: aus dem Image (COMPHUB_SHA, Dockerfile.web), sonst aus git, sonst unbekannt. */
const SHA = (() => {
  if (process.env.COMPHUB_SHA) return process.env.COMPHUB_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WURZEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unbekannt'; }
})();

const liesJson = (p, ersatz = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return ersatz; } };
const zeit = () => new Date().toISOString().slice(11, 19);
const log = (...x) => console.log(zeit(), ...x);

/* ------------------------------------------------------------------ Spieltage */

/** windowId -> Zustand. Persistiert (zustand.json) werden nur eventId, Beginn, Ende - der Rest kommt von der Platte und aus der Bestenliste. */
const fenster = new Map();

function neuesFenster({ windowId, eventId, begin, end }) {
  const f = {
    windowId, eventId, begin, end, vorrang: cupVorrang(windowId), aktiv: false,
    ids: new Set(liesJson(path.join(LIVE_ORT, 'ids', `${windowId}.json`), [])), idsGespeichert: 0, zuerst: new Map(),
    stand: null, gelesen: 0, regeln: null, regelnZeit: 0, regelnLaeuft: null,
    offen: [], zurueck: new Map(), laeuft: new Set(), fertig: new Set(),
    auth: { ids: new Set(), zeit: 0, gesamt: 0, summe: '' }, neueTeile: 0, gebaut: 0, offeneTeile: 0,
  };
  // Was schon gelesen ist (offen oder archiviert); Teile mit anderer Schadensregel sind von einem alten Stand und werden neu gelesen.
  for (const [id, art] of teilIds(LIVE_ORT, windowId)) {
    if (art === 'teil' && liesTeil(LIVE_ORT, windowId, id)?.schadenFassung !== SCHADEN_FASSUNG) { fs.rmSync(path.join(teilOrdner(LIVE_ORT, windowId), `${id}.json`), { force: true }); continue; }
    f.fertig.add(id);
    if (art === 'teil') f.neueTeile += 1;
  }
  for (const id of f.ids) if (!f.fertig.has(id)) f.offen.push(id);
  return f;
}

function zustandSchreiben() {
  const z = {};
  for (const f of fenster.values()) z[f.windowId] = { eventId: f.eventId, begin: f.begin, end: f.end };
  schreibeAtomar(ZUSTAND, JSON.stringify(z));
}

function vergessen(f) {
  for (const p of [teilOrdner(LIVE_ORT, f.windowId), archivOrdner(LIVE_ORT, f.windowId)]) fs.rmSync(p, { recursive: true, force: true });
  for (const p of [['ids', f.windowId], ['clutch', f.windowId], ['clutch-je', f.windowId]]) fs.rmSync(path.join(LIVE_ORT, p[0], `${p[1]}.json`), { force: true });
  // Die zwischengespeicherten Release-Dateien des Spieltags (clutch__<w>.json, clutch-je__<w>.json, clutch-roh__<w>.json).
  for (const n of fs.existsSync(ZWISCHEN) ? fs.readdirSync(ZWISCHEN) : []) if (n.endsWith(`__${f.windowId}.json`)) fs.rmSync(path.join(ZWISCHEN, n), { force: true });
  fenster.delete(f.windowId);
  log(`Vergessen: ${f.windowId} (36 h nach dem Ende)`);
}

async function katalog() {
  const r = await fetch(`${SEITE}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (!r?.ok) { log('Katalog nicht erreichbar - es bleibt bei den bekannten Spieltagen.'); return; }
  const k = await r.json().catch(() => null);
  if (!k) return;
  const jetzt = Date.now();
  const gesehen = new Set();
  let neu = false;
  for (const cup of k.cups ?? []) {
    const regel = replayRegel(cup);
    if (regel === 'nichts') continue;
    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      for (const w of liste) {
        if ((finals && !finals.has(w.windowId)) || /Arena/i.test(w.windowId) || !w.eventId) continue;
        // Sofortspur: nur die grossen Cups (FNCS samt LCQ, Cash, Majors) - die uebrigen bleiben bei Schnellspur und Clutch rechnen.
        if (NUR_VORRANG && cupVorrang(w.windowId) !== 0) continue;
        // Wie scripts/replays-schnell-anstossen.mjs: laeuft, oder vor hoechstens sechs Stunden zu Ende.
        const frisch = w.status === 'live' || (w.status === 'vorbei' && jetzt - (w.end ?? 0) < NACH_ENDE_MS)
          // Sofortspur: schon kurz vor dem Beginn bereitstehen (der Lauf auf GitHub endet sonst gleich wieder).
          || (SENDEN && w.status === 'kommt' && typeof w.begin === 'number' && w.begin - jetzt < 20 * 60_000);
        if (!frisch) continue;
        gesehen.add(w.windowId);
        let f = fenster.get(w.windowId);
        if (!f) {
          f = neuesFenster({ windowId: w.windowId, eventId: w.eventId, begin: w.begin, end: w.end ?? w.begin + 4 * 3600_000 });
          fenster.set(w.windowId, f); neu = true;
          log(`Dazu: ${w.windowId} (Vorrang ${f.vorrang}, ${f.ids.size} Ids, ${f.fertig.size} schon gelesen)`);
        }
        if (typeof w.end === 'number' && w.end !== f.end) { f.end = w.end; neu = true; }
        f.aktiv = true;
      }
    }
  }
  for (const f of fenster.values()) {
    if (!gesehen.has(f.windowId)) f.aktiv = false;
    if (f.end + VERGESSEN_MS < jetzt) { vergessen(f); neu = true; }
  }
  if (neu) zustandSchreiben();
}

/* ------------------------------------------------------------- Bestenliste */

let epicPauseBis = 0;
/** Eine Seite der Bestenliste - wie replays-live-sammler.mjs (hole), mit einer Pause fuer alle, wenn Epic 429 sagt. */
async function seite(f, nr, eigene = false) {
  for (let versuch = 0; versuch < 5; versuch++) {
    if (Date.now() < epicPauseBis) await warte(epicPauseBis - Date.now());
    let token; let accountId;
    try { ({ token, accountId } = await holeNutzerToken()); } catch (e) { log(`Epic-Anmeldung: ${e.message}`); await warte(30_000); continue; }
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(f.eventId)}/${encodeURIComponent(f.windowId)}/${accountId}`
      + `?page=${nr}&rank=0&teamAccountIds=${eigene ? accountId : ''}&showLiveSessions=true`, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json().catch(() => null);
    if (r?.status === 401) verwirfNutzerToken();
    if (r?.status === 429) { epicPauseBis = Date.now() + (Number(r.headers.get('retry-after')) || 30) * 1000; log(`Epic: 429 - Pause bis ${new Date(epicPauseBis).toISOString().slice(11, 19)}`); continue; }
    await warte(2000 * (versuch + 1));
  }
  return null;
}

function aufnehmen(f, daten) {
  let neu = 0;
  for (const e of daten?.entries ?? []) {
    for (const s of e.sessionHistory ?? []) {
      const id = s.sessionId;
      if (!id || f.ids.has(id)) continue;
      f.ids.add(id); f.zuerst.set(id, Date.now()); neu += 1;
      if (!f.fertig.has(id) && !imRelease(f, id)) f.offen.push(id);
    }
  }
  return neu;
}

async function runde(f) {
  const erste = await seite(f, 0);
  if (!erste) return;
  const stand = erste.updatedTime ?? '';
  let neu = aufnehmen(f, erste);
  if (stand !== f.stand || Date.now() - f.gelesen > SPAETESTENS_MS) {
    const seiten = Math.min(erste.totalPages ?? 1, 100);
    let naechste = 1;
    await Promise.all(Array.from({ length: 5 }, async () => { while (naechste < seiten) neu += aufnehmen(f, await seite(f, naechste++)); }));
    // Das eigene Konto gibt Epic immer heraus, auch weit hinter Platz 10.000 (replays-live-sammler.mjs).
    neu += aufnehmen(f, await seite(f, 0, true));
    f.stand = stand; f.gelesen = Date.now();
    if (neu) log(`${f.windowId}: ${seiten} Seiten, +${neu}, ${f.ids.size} Matches (Stand ${stand})`);
  }
  if (f.ids.size !== f.idsGespeichert) { schreibeAtomar(path.join(LIVE_ORT, 'ids', `${f.windowId}.json`), JSON.stringify([...f.ids])); f.idsGespeichert = f.ids.size; }
}

async function sammler() {
  for (;;) {
    const beginn = Date.now();
    for (const f of [...fenster.values()].sort(reihenfolge)) {
      if (!f.aktiv || f.begin > Date.now()) continue;
      await runde(f).catch((e) => log(`${f.windowId}: Bestenliste - ${e.message}`));
    }
    await warte(Math.max(500, SEITE0_MS - (Date.now() - beginn)));
  }
}

/* ------------------------------------------------------------------ Lesen */

/** Hoechstens n zugleich (Downloads). */
function schleuse(n) {
  let frei = n; const warten = [];
  return async (fn) => {
    if (frei > 0) frei -= 1; else await new Promise((ok) => warten.push(ok));
    try { return await fn(); } finally { const w = warten.shift(); if (w) w(); else frei += 1; }
  };
}

/** Die Wertungstabelle: aus dem Release-Stand, sonst von Epic (wie der Planer); leer -> nach zehn Minuten noch einmal. */
async function regelnVon(f) {
  if (f.regeln?.length || (f.regeln && Date.now() - f.regelnZeit < 10 * 60_000)) return f.regeln;
  f.regelnLaeuft ??= (async () => {
    let r = f.authRegeln?.length ? f.authRegeln : [];
    if (!r.length) { try { r = await wertungSicher(f.eventId, f.windowId); } catch { r = []; } }
    if (!r.length) log(`${f.windowId}: keine Wertungstabelle - vorerst nur Schaden`);
    f.regeln = r; f.regelnZeit = Date.now(); f.regelnLaeuft = null;
    return r;
  })();
  return f.regelnLaeuft;
}

/*
 * Das naechste Match: Spieltage nach Vorrang, bei gleichem Vorrang der kleinere zuerst (darin erst Neues, dann, was wieder dran ist). Im Dauerlauf
 * gemessen (15.11.2026, Probe-Ablauf): nach Beginn sortiert nahm ein Duos Cash Cup ME mit 3.300 Matches alle Leser, FNCS Heat 2 OCE (8 Matches) blieb
 * zwoelf Minuten bei 0 von 8. Ein Heat oder Finale hat ein paar Dutzend Matches - die sind so immer sofort dran, die grossen Runden bekommen den Rest.
 */
const reihenfolge = (a, b) => a.vorrang - b.vorrang || a.ids.size - b.ids.size || a.begin - b.begin;
function naechstes() {
  const jetzt = Date.now();
  for (const f of [...fenster.values()].sort(reihenfolge)) {
    while (f.offen.length) {
      const id = f.offen.shift();
      if (!f.fertig.has(id) && !f.laeuft.has(id) && !imRelease(f, id) && !f.zurueck.has(id)) return { f, id };
    }
    for (const [id, z] of f.zurueck) {
      if (z.bis > jetzt) continue;
      f.zurueck.delete(id);
      if (!f.fertig.has(id) && !f.laeuft.has(id) && !imRelease(f, id)) return { f, id, versuche: z.versuche };
    }
  }
  return null;
}

const zahl = { gelesen: 0, spaeter: 0, ohne: 0, fehler: 0 };
const dauern = [];
let leser = null;
const laden = schleuse(LADEN);

async function arbeiter() {
  for (;;) {
    const job = naechstes();
    if (!job) { await warte(1000); continue; }
    await einMatch(job);
  }
}

/** Ein Match lesen und als Teil ablegen - oder fuer spaeter vormerken. */
async function einMatch(job) {
  const { f, id } = job;
  const versuche = (job.versuche ?? 0) + 1;
  f.laeuft.add(id);
  try {
    const regeln = await regelnVon(f);
    const uhr = Date.now();
    const r = await vollMatch(id, { leser, regeln, laden, log: (t) => log(`${f.windowId}${t}`) });
    if (r.art === 'gelesen') {
      const gesamt = Math.max(f.ids.size, f.auth.gesamt);
      const teil = neuerTeil({ eventId: f.eventId, windowId: f.windowId, regeln, gesamt });
      teil.neuAnfang = false; teil.fehler = [];
      einarbeiten(teil, r.beitrag, { mitRoh: gesamt <= GROSS_MAX });
      // Der Stempel: mit welchem Code und welcher Schadensregel gelesen (clutch-zusammen.mjs liest diese Felder nicht).
      // sofortZeit (Sofortspur): Spielende laut Epic (Beginn + Laenge) und wann das Replay hier fertig vorlag - fuer die Messung bis zur Seite.
      const ende = Date.parse(r.epic?.start ?? '') + Number(r.epic?.laengeMs ?? NaN);
      const sofortZeit = { matchEnde: Number.isFinite(ende) ? ende : null, bereit: uhr, gelesen: Date.now() };
      Object.assign(teil, { sha: SHA, schadenFassung: SCHADEN_FASSUNG, gelesenAm: new Date().toISOString(), sofortZeit });
      schreibeAtomar(path.join(teilOrdner(LIVE_ORT, f.windowId), `${id}.json`), JSON.stringify(teil));
      f.fertig.add(id); f.neueTeile += 1; zahl.gelesen += 1;
      const z = r.zeiten ?? {};
      const gesamtS = (Date.now() - uhr) / 1000;
      dauern.push(gesamtS);
      log(`${f.windowId} ${id}: gelesen in ${gesamtS.toFixed(1)} s (Laden ${z.laden?.toFixed(1)} s, Lesen ${z.lesen?.toFixed(1)} s, Rechnen ${z.rechnen?.toFixed(1)} s)`
        + (sofortZeit.matchEnde ? `, ${((Date.now() - sofortZeit.matchEnde) / 60_000).toFixed(1)} min nach Spielende` : ''));
      if (SENDEN) void senden(f, id, teil);
    } else if (r.art === 'spaeter') {
      // Noch live bei Epic oder kuerzer als das Spiel: in anderthalb Minuten wieder (Sofortspur: LIVE_SPAETER_MS).
      zahl.spaeter += 1; f.zurueck.set(id, { bis: Date.now() + SPAETER_MS, versuche: 0 });
    } else {
      // Kein Replay (noch nicht abgelegt?) oder Fehler: spaeter wieder, mit wachsendem Abstand bis hoechstens 30 Minuten - nie endgueltig (Hauptregel).
      zahl[r.art === 'ohne' ? 'ohne' : 'fehler'] += 1;
      // Sofortspur: ein eben beendetes Match, dessen Replay Epic noch nicht herausgibt (404, Fehler), in den ersten LIVE_FRUEH_MIN Minuten nach dem ersten
      // Sehen alle LIVE_FRUEH_MS wieder - nicht erst nach 2, 4, 6 Minuten (EU LCQ 17.11.: Spiel 5 wartete so unnoetig, volle Stats erst 20-25 min danach).
      const frueh = FRUEH_MS && Date.now() - (f.zuerst.get(id) ?? 0) < FRUEH_FENSTER_MS;
      f.zurueck.set(id, { bis: Date.now() + (frueh ? FRUEH_MS : Math.min(30, 2 * versuche) * 60_000), versuche: frueh ? 0 : versuche });
      if (versuche >= 3) log(`${f.windowId} ${id}: ${r.art} (${versuche}. Versuch) - ${r.grund ?? ''}`);
    }
  } catch (e) {
    zahl.fehler += 1; f.zurueck.set(id, { bis: Date.now() + 5 * 60_000, versuche });
    log(`${f.windowId} ${id}: ${String(e?.message).slice(0, 120)}`);
  } finally { f.laeuft.delete(id); }
}

/* ------------------------------------------------------------- Sofortspur */

/** Messung je Match: Spielende -> Replay fertig -> gelesen -> von der Seite angenommen (GitHub) bzw. angekommen -> im Live-Stand (Server). */
const sofortMessung = [];
const merkeMessung = (m) => { sofortMessung.push(m); if (sofortMessung.length > 300) sofortMessung.splice(0, sofortMessung.length - 200); };
let sendenOffen = 0;
const sendeZahl = { angenommen: 0, schonDa: 0, fehler: 0 };

/** Einen Teil an die Seite (app/api/sofort/match). Wiederholt mit wachsendem Abstand (hoechstens eine Minute), bis er angenommen ist oder die Seite ihn ablehnt. */
async function senden(f, id, teil) {
  sendenOffen += 1;
  const koerper = zlib.gzipSync(JSON.stringify(teil));
  try {
    for (let versuch = 1; ; versuch += 1) {
      const uhr = Date.now();
      let status = 0; let text = '';
      try {
        const r = await fetch(SENDEN_URL, {
          method: 'POST', body: koerper, signal: AbortSignal.timeout(60_000),
          headers: { Authorization: `Bearer ${SOFORT_SECRET}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'User-Agent': 'comphub-sofortspur' },
        });
        status = r.status; text = (await r.text()).slice(0, 300);
      } catch (e) { text = String(e?.message).slice(0, 160); }
      if (status === 200) {
        let a = {}; try { a = JSON.parse(text); } catch { /* nur Auskunft */ }
        sendeZahl[a.schonDa ? 'schonDa' : 'angenommen'] += 1;
        const z = teil.sofortZeit ?? {};
        const jetzt = Date.now();
        merkeMessung({ w: f.windowId, id, matchEnde: z.matchEnde, bereit: z.bereit, gelesen: z.gelesen, angenommen: jetzt, kb: Math.round(koerper.length / 1024), versuche: versuch });
        log(`${f.windowId} ${id}: an die Seite ${a.schonDa ? '(schon da)' : 'angenommen'} - ${((jetzt - z.bereit) / 1000).toFixed(1)} s nach "Replay fertig"`
          + (z.matchEnde ? `, ${((jetzt - z.matchEnde) / 60_000).toFixed(2)} min nach Spielende` : '') + `, Senden ${((jetzt - uhr) / 1000).toFixed(1)} s, ${Math.round(koerper.length / 1024)} KB gzip, Server ${a.ms ?? '?'} ms`);
        return true;
      }
      // Abgelehnt wegen des Inhalts: Wiederholen hilft nicht (das Release holt das Match ohnehin nach).
      if (status === 400 || status === 413) { sendeZahl.fehler += 1; log(`${f.windowId} ${id}: Seite lehnt ab (${status}) - ${text}`); return false; }
      if (versuch === 1 || versuch % 5 === 0) log(`${f.windowId} ${id}: Seite nicht bereit (${status || 'keine Antwort'}: ${text}) - ${versuch}. Versuch, weiter`);
      await warte(Math.min(60_000, 2000 * 2 ** Math.min(versuch - 1, 5)));
    }
  } finally { sendenOffen -= 1; }
}

/** Sofortspur auf GitHub: welche Matches das Release schon hat (die liest sie nicht) und die Wertungstabelle - ohne einen Live-Stand zu bauen. */
async function releaseStand(f) {
  f.auth.zeit = Date.now();
  const buf = await releaseDatei(`clutch/${f.windowId}.json`, ZWISCHEN).catch((e) => { log(`${f.windowId}: Release nicht lesbar (${e.message})`); return null; });
  if (!buf) return;
  const auth = JSON.parse(buf.toString('utf8'));
  f.auth = { ids: new Set((auth?.matches ?? []).map((m) => m.id)), zeit: Date.now(), gesamt: auth?.gesamt ?? 0, summe: auth?.gerechnet ?? '' };
  f.authRegeln = auth?.regeln;
  f.eventId ??= auth?.eventId;
}

const FENSTER_OK = /^[A-Za-z0-9_-]{1,200}$/;
const eingangGemeldet = new Set();

/*
 * Server: die Teile, die app/api/sofort/match unter EINGANG/<w>/<id>.json abgelegt hat, zu den eigenen Teilen nehmen. Ein Teil mit anderer Schadensregel
 * (Code auf GitHub neuer oder aelter als hier) bleibt liegen, bis beide gleich sind - hoechstens sechs Stunden, dann holt ohnehin das Release auf.
 */
function eingangNehmen() {
  let ordner = [];
  try { ordner = fs.readdirSync(EINGANG); } catch { return; }
  for (const w of ordner) {
    if (!FENSTER_OK.test(w)) continue;
    let namen = [];
    try { namen = fs.readdirSync(path.join(EINGANG, w)).filter((n) => n.endsWith('.json')); } catch { continue; }
    for (const n of namen) {
      const id = n.slice(0, -5);
      const p = path.join(EINGANG, w, n);
      let roh; let teil;
      try { roh = fs.readFileSync(p); teil = JSON.parse(roh.toString('utf8')); } catch { continue; }
      if (teil?.windowId !== w || teil?.matches?.length !== 1 || teil.matches[0]?.id !== id) { fs.rmSync(p, { force: true }); log(`Eingang ${w}/${n}: kein passender Teil - verworfen`); continue; }
      if (teil.schadenFassung !== SCHADEN_FASSUNG) {
        let alt = 0; try { alt = Date.now() - fs.statSync(p).mtimeMs; } catch { /* weiter */ }
        if (alt > 6 * 3600_000) fs.rmSync(p, { force: true });
        else if (!eingangGemeldet.has(p)) { eingangGemeldet.add(p); log(`Eingang ${w} ${id}: Schadensregel ${teil.schadenFassung}, hier ${SCHADEN_FASSUNG} - wartet`); }
        continue;
      }
      let f = fenster.get(w);
      if (!f) {
        f = neuesFenster({ windowId: w, eventId: teil.eventId ?? null, begin: Date.now(), end: Date.now() });
        fenster.set(w, f); zustandSchreiben();
        log(`Dazu (Sofortspur): ${w}`);
      }
      f.end = Math.max(f.end ?? 0, Date.now());
      f.eventId ??= teil.eventId;
      const imArchiv = fs.existsSync(path.join(archivOrdner(LIVE_ORT, w), `${id}.json.gz`));
      if (!imArchiv && !f.auth.ids.has(id)) {
        schreibeAtomar(path.join(teilOrdner(LIVE_ORT, w), `${id}.json`), roh);
        f.fertig.add(id); f.ids.add(id); f.neueTeile += 1;
        const z = teil.sofortZeit ?? {};
        merkeMessung({ w, id, matchEnde: z.matchEnde ?? null, bereit: z.bereit ?? null, gelesen: z.gelesen ?? null, angekommen: Date.now(), gebaut: null });
        log(`Eingang ${w} ${id}: uebernommen${z.matchEnde ? ` (${((Date.now() - z.matchEnde) / 60_000).toFixed(2)} min nach Spielende)` : ''}`);
      }
      fs.rmSync(p, { force: true });
    }
  }
}

/* ------------------------------------------------------------- Live-Stand */

const EPIC_FELDER = ['epicDmg', 'epicZeit', 'epicStrecke', 'epicKopf', 'epicTeamZeit'];

/*
 * Den Live-Stand eines Spieltags bauen: der Stand vom Release plus die Teile, deren Match dort noch fehlt - zusammengefuehrt mit dem unveraenderten
 * scripts/clutch-zusammen.mjs und den Folgeschritten des Ablaufs "ablegen" (lib/liveAblage.mjs, zusammenfuehren). Was schon im Release steht, wird archiviert.
 */
async function bauen(f) {
  const w = f.windowId;
  const beginn = Date.now();
  const authBuf = await releaseDatei(`clutch/${w}.json`, ZWISCHEN);
  // Hatte das Release den Spieltag schon und jetzt nicht (Ersetzen dauert, Abruf scheiterte still): diesmal nichts bauen statt auf leerer Grundlage - in einer Minute wieder.
  if (!authBuf && f.auth.ids.size) { f.auth.zeit = Date.now() - RELEASE_MS + 60_000; f.gebaut = Date.now(); log(`${w}: clutch/${w}.json gerade nicht am Release - Live-Stand bleibt`); return; }
  const auth = authBuf ? JSON.parse(authBuf.toString('utf8')) : null;
  const jeBuf = auth ? await releaseDatei(`clutch-je/${w}.json`, ZWISCHEN) : null;
  f.auth = { ids: new Set((auth?.matches ?? []).map((m) => m.id)), zeit: Date.now(), gesamt: auth?.gesamt ?? 0, summe: auth?.gerechnet ?? '' };
  f.authRegeln = auth?.regeln;
  f.eventId ??= auth?.eventId;
  // Rohdaten (Kill-Feed): nur kleine Spieltage haben sie. Ohne die Rohdaten des Release wuerden clutch-neu-rechnen/clutch-leben aus unseren Teilen allein
  // rechnen und den Stand vom Release ueberschreiben - dann bleiben die Folgeschritte aus.
  const klein = !auth?.ohneRohRechnung && Math.max(auth?.gesamt ?? 0, f.ids.size) <= GROSS_MAX;
  let rohBuf = null; let folge = !auth || !klein;
  if (auth && klein) { try { rohBuf = await releaseDatei(`clutch-roh/${w}.json`, ZWISCHEN); folge = !!rohBuf; } catch (e) { log(`${w}: Rohdaten nicht lesbar (${e.message})`); } }

  // Was das Release schon hat, ist fuer den Live-Stand erledigt.
  let archiviert = 0;
  const ids = [];
  for (const [id, art] of teilIds(LIVE_ORT, w)) {
    if (art !== 'teil') continue;
    if (f.auth.ids.has(id)) { archiviere(LIVE_ORT, w, id); archiviert += 1; } else ids.push(id);
  }
  const lebend = [path.join(LIVE_ORT, 'clutch', `${w}.json`), path.join(LIVE_ORT, 'clutch-je', `${w}.json`)];
  f.neueTeile = 0; f.gebaut = Date.now();
  if (!ids.length) {
    // Nichts, was das Release nicht hat: ein alter Live-Stand waere nur veraltet.
    for (const p of lebend) fs.rmSync(p, { force: true });
    if (archiviert) log(`${w}: ${archiviert} Teile archiviert - das Release ist auf Stand`);
    return;
  }
  if (auth?.schadenFassung != null && auth.schadenFassung !== SCHADEN_FASSUNG) log(`${w}: Achtung - Release mit Schadensregel ${auth.schadenFassung}, Teile mit ${SCHADEN_FASSUNG}`);
  f.offeneTeile = ids.length;
  const teile = ids.map((id) => liesTeil(LIVE_ORT, w, id)).filter(Boolean);
  const { d, je, text } = await zusammenfuehren({ w, basis: auth, basisJe: jeBuf, basisRoh: rohBuf, teile, folge, log });
  if (!d) { log(`${w}: ${text}`); f.neueTeile += ids.length; return; }
  // Epics eigene Werte (epic-schaden-holen.mjs) gelten fuer die Spiele, die das Release kannte: wer jetzt mehr Spiele hat, bekommt sie nicht.
  let ohneEpic = 0;
  for (const feld of EPIC_FELDER) {
    for (const id of Object.keys(d[feld] ?? {})) {
      if ((d.spiele?.[id] ?? 0) !== (auth?.spiele?.[id] ?? 0)) { delete d[feld][id]; ohneEpic += 1; }
    }
  }
  d.live = true;
  d.basis = { gerechnet: auth?.gerechnet ?? null, matches: auth?.matches?.length ?? 0 };
  d.liveStand = { teile: ids.length, sha: SHA, schadenFassung: SCHADEN_FASSUNG, gebaut: new Date().toISOString(), folgeschritte: folge };
  if (je) schreibeAtomar(lebend[1], je);
  schreibeAtomar(lebend[0], JSON.stringify(d));
  log(`${w}: Live-Stand ${d.matches?.length ?? 0} Matches (Release ${d.basis.matches} + ${ids.length} Teile), ${archiviert} archiviert, ${ohneEpic} Epic-Werte entfernt, ${((Date.now() - beginn) / 1000).toFixed(1)} s`);
  // Sofortspur: ab jetzt liest die Seite diese Matches (lib/clutchLive.ts) - die Messung je Match bis hierher.
  const drin = new Set(ids);
  for (const m of sofortMessung) {
    if (m.w !== w || m.gebaut || !drin.has(m.id)) continue;
    m.gebaut = Date.now(); m.bauenMs = m.gebaut - beginn;
    log(`Sofort ${w} ${m.id}: im Live-Stand ${m.matchEnde ? `${((m.gebaut - m.matchEnde) / 60_000).toFixed(2)} min nach Spielende, ` : ''}${((m.gebaut - m.angekommen) / 1000).toFixed(1)} s nach Ankunft (Bauen ${(m.bauenMs / 1000).toFixed(1)} s)`);
  }
}

async function bauer() {
  for (;;) {
    for (const f of [...fenster.values()].sort(reihenfolge)) {
      // Grosse Runden (hunderte Teile, die das Release noch nicht hat) seltener: je 300 offene Teile eine Minute mehr, hoechstens zehn.
      const abstand = BAUEN_MS * Math.min(10, 1 + Math.floor(f.offeneTeile / 300));
      const faellig = (f.neueTeile > 0 && Date.now() - f.gebaut >= abstand) || Date.now() - f.auth.zeit >= RELEASE_MS;
      if (!faellig) continue;
      await bauen(f).catch((e) => { f.auth.zeit = Date.now(); f.gebaut = Date.now(); log(`${f.windowId}: Live-Stand diesmal nicht - ${String(e?.message).slice(0, 160)}`); });
    }
    await warte(5_000);
  }
}

/* ------------------------------------------------------------------- Start */

fs.mkdirSync(LIVE_ORT, { recursive: true });
if (!EINMAL) {
  for (const [windowId, z] of Object.entries(liesJson(ZUSTAND, {}))) {
    if ((z.end ?? 0) + VERGESSEN_MS < Date.now()) continue;
    fenster.set(windowId, neuesFenster({ windowId, ...z }));
  }
}
const ART = SENDEN ? `Sofortspur, sendet an ${SENDEN_URL}${NUR_VORRANG ? ', nur Vorrang 0' : ''}` : NUR_BAUEN ? 'nur bauen, Eingang ' + EINGANG : 'Schatten';
log(`Live-Spur (${ART}${EINMAL ? `, einmal: ${EINMAL_FENSTER}` : ''}): ${NUR_BAUEN ? 'kein Leser' : `${LESER} Leser, ${LADEN} Downloads`}, Ort ${LIVE_ORT}, Code ${SHA.slice(0, 12)}, Schadensregel ${SCHADEN_FASSUNG}, ${fenster.size} Spieltage vom letzten Lauf`);
if (SENDEN && !SOFORT_SECRET) log('Achtung: SOFORT_SECRET fehlt - die Seite wird jeden Teil mit 401/503 ablehnen.');
leser = NUR_BAUEN ? null : leserDienst(LESER);
const ende = (code = 0) => {
  log('Ende.');
  try { if (process.env.SOFORT_MESSUNG && sofortMessung.length) schreibeAtomar(process.env.SOFORT_MESSUNG, JSON.stringify(sofortMessung, null, 1)); } catch { /* nur Auskunft */ }
  try { leser?.ende(); } catch { /* weiter */ }
  process.exit(code);
};
process.on('SIGTERM', () => ende(0));
process.on('SIGINT', () => ende(0));
const START = Date.now();

const messung = () => {
  if (!dauern.length) return 'noch keine Messung';
  const s = [...dauern].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  return `${s.length} Matches, je Match Median ${q(0.5)} s, 90 % ${q(0.9)} s, hoechstens ${s[s.length - 1].toFixed(1)} s`;
};

/** Die Sofortspur in Zahlen: je Match Minuten vom Spielende bis zur Annahme (GitHub) bzw. bis in den Live-Stand (Server). */
const sofortZusammen = () => {
  const bis = (m) => m.angenommen ?? m.gebaut;
  const ab = sofortMessung.filter((m) => bis(m) && m.matchEnde).map((m) => (bis(m) - m.matchEnde) / 60_000).sort((a, b) => a - b);
  const bereit = sofortMessung.filter((m) => m.angenommen && m.bereit).map((m) => (m.angenommen - m.bereit) / 1000).sort((a, b) => a - b);
  if (!ab.length && !bereit.length) return 'Sofortspur: noch keine Messung';
  const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `Sofortspur: ${ab.length} Matches, Spielende -> ${SENDEN ? 'angenommen' : 'Live-Stand'} Median ${q(ab, 0.5)?.toFixed(2)} min, hoechstens ${ab[ab.length - 1]?.toFixed(2)} min`
    + (bereit.length ? `; Replay fertig -> angenommen Median ${q(bereit, 0.5).toFixed(1)} s, hoechstens ${bereit[bereit.length - 1].toFixed(1)} s` : '');
};

/** Auf GitHub: warten, bis alle Teile bei der Seite sind (hoechstens so lange). */
async function sendenAbwarten(ms) {
  const bis = Date.now() + ms;
  while (sendenOffen > 0 && Date.now() < bis) await warte(1000);
  if (sendenOffen > 0) log(`${sendenOffen} Teile nicht bei der Seite angekommen - das Release holt sie nach.`);
}

if (EINMAL) {
  // Der Spieltag allein: eventId aus dem Aufruf, sonst aus dem Release (clutch/<w>.json), sonst aus dem Katalog.
  const f = neuesFenster({ windowId: EINMAL_FENSTER, eventId: EINMAL_EVENT ?? null, begin: 0, end: Date.now() });
  f.aktiv = true;
  fenster.set(f.windowId, f);
  await (SENDEN ? releaseStand(f) : bauen(f));  // laedt den Stand vom Release (Wertungstabelle, eventId)
  if (!f.eventId) {
    const k = await fetch(`${SEITE}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(90_000) }).then((r) => r.json()).catch(() => null);
    for (const cup of k?.cups ?? []) for (const liste of Object.values(cup.regionen ?? {})) for (const w of liste) if (w.windowId === f.windowId) f.eventId = w.eventId;
  }
  if (!f.eventId) { log(`${f.windowId}: keine eventId (weder Aufruf, Release noch Katalog)`); ende(2); }
  // Die Wertungstabelle von Epic (so bekommt sie die Live-Spur, solange das Release den Spieltag noch nicht hat) gegen die des Release.
  if (f.authRegeln?.length) {
    const epic = await wertungSicher(f.eventId, f.windowId).catch(() => []);
    log(`${f.windowId}: Wertungstabelle Epic ${epic.length ? (JSON.stringify(epic) === JSON.stringify(f.authRegeln) ? 'gleich der des Release' : 'ANDERS als die des Release') : 'nicht erhalten'} (${epic.length}/${f.authRegeln.length} Stufen)`);
  }
  const beginn = Date.now();
  await runde(f);
  log(`${f.windowId}: ${f.ids.size} Matches in Epics Bestenliste, ${f.fertig.size} schon gelesen, Release ${f.auth.ids.size}`);
  const arbeiten = Array.from({ length: LADEN }, () => (async () => {
    for (;;) {
      const job = naechstes();
      if (job) { await einMatch(job); continue; }
      // Nur noch Matches, die spaeter wieder dran sind: hoechstens 20 Minuten darauf warten.
      if (!f.laeuft.size && !f.offen.length && (!f.zurueck.size || Date.now() - beginn > 20 * 60_000)) return;
      await warte(1000);
    }
  })());
  await Promise.all(arbeiten);
  if (SENDEN) await sendenAbwarten(10 * 60_000); else await bauen(f);
  const offen = [...f.ids].filter((id) => !f.fertig.has(id));
  log(`${f.windowId}: ${f.fertig.size} von ${f.ids.size} gelesen in ${((Date.now() - beginn) / 1000).toFixed(0)} s, offen: ${offen.join(', ') || 'keins'}`);
  log(`Messung: ${messung()}`);
  log(sofortZusammen());
  if (SENDEN) log(`Gesendet: ${sendeZahl.angenommen} angenommen, ${sendeZahl.schonDa} schon da, ${sendeZahl.fehler} abgelehnt`);
  ende(offen.length || (SENDEN && sendeZahl.angenommen + sendeZahl.schonDa < f.fertig.size) ? 1 : 0);
}

if (!NUR_BAUEN) {
  await katalog();
  setInterval(() => { katalog().catch((e) => log(`Katalog: ${e.message}`)); }, KATALOG_MS);
}
// Je Minute: wie viele Matches gelesen, was wartet.
const taktVerlauf = [];
setInterval(() => {
  const offen = [...fenster.values()].reduce((n, f) => n + f.offen.length + f.zurueck.size, 0);
  const laufend = [...fenster.values()].reduce((n, f) => n + f.laeuft.size, 0);
  const aktiv = [...fenster.values()].filter((f) => f.aktiv).map((f) => `${f.windowId} ${[...f.ids].filter((id) => f.fertig.has(id) || f.auth.ids.has(id)).length}/${f.ids.size} (hier ${f.fertig.size})`).join(', ');
  log(`Takt: ${zahl.gelesen} Matches/min gelesen, ${zahl.spaeter} spaeter, ${zahl.ohne} ohne Replay, ${zahl.fehler} Fehler - ${offen} offen, ${laufend} laufen${aktiv ? ` | ${aktiv}` : ''} | ${messung()} | ${sofortZusammen()}`
    + (SENDEN ? ` | gesendet ${sendeZahl.angenommen}, schon da ${sendeZahl.schonDa}, abgelehnt ${sendeZahl.fehler}, offen ${sendenOffen}` : ''));
  /*
   * Der Takt auch als Datei (16.11.2026): "web" liest ./live mit und zeigt ihn unter /api/stand (live). Ohne Zugang zum Server war nicht zu messen, wie
   * viele Matches je Minute die Live-Spur schafft - die Grundlage, um zu entscheiden, was hier und was auf GitHub gerechnet wird.
   */
  try {
    taktVerlauf.push({ t: new Date().toISOString().slice(0, 16), gelesen: zahl.gelesen, offen, laufend });
    if (taktVerlauf.length > 180) taktVerlauf.splice(0, taktVerlauf.length - 180);
    const fen = [...fenster.values()].filter((f) => f.aktiv || NUR_BAUEN).map((f) => ({ w: f.windowId, ids: f.ids.size, hier: f.fertig.size, release: f.auth.ids.size,
      offen: f.offen.length + f.zurueck.size }));
    // Sofortspur (17.11.2026): je Match Spielende, Replay fertig, gelesen, angekommen, im Live-Stand - die letzten 60.
    schreibeAtomar(path.join(LIVE_ORT, 'takt.json'), JSON.stringify({ zeit: new Date().toISOString(), art: ART, leser: NUR_BAUEN ? 0 : LESER, laden: LADEN, messung: messung(),
      sofort: sofortZusammen(), sofortMatches: sofortMessung.slice(-60), fenster: fen, verlauf: taktVerlauf }));
  } catch { /* nur Auskunft */ }
  zahl.gelesen = 0; zahl.spaeter = 0; zahl.ohne = 0; zahl.fehler = 0;
  if (dauern.length > 2000) dauern.splice(0, dauern.length - 1000);
}, 60_000).unref();

if (SENDEN) {
  // Kein Live-Stand auf GitHub - nur alle fuenf Minuten nachsehen, was das Release schon hat (das braucht hier niemand mehr zu lesen).
  void (async () => {
    for (;;) {
      for (const f of fenster.values()) if (f.aktiv && Date.now() - f.auth.zeit >= RELEASE_MS) await releaseStand(f).catch(() => {});
      await warte(5_000);
    }
  })();
  // Schluss, wenn kein Spieltag mehr frisch ist und alles gesendet ist - oder nach LIVE_LAUFZEIT_MIN (GitHub: hoechstens sechs Stunden je Lauf).
  setInterval(async () => {
    const arbeit = sendenOffen > 0 || [...fenster.values()].some((f) => f.laeuft.size);
    const zuLange = LAUFZEIT_MS && Date.now() - START > LAUFZEIT_MS;
    const nichtsFrisch = ![...fenster.values()].some((f) => f.aktiv) && Date.now() - START > 60_000;
    if ((zuLange || nichtsFrisch) && !arbeit) { log(`${sofortZusammen()} | gesendet ${sendeZahl.angenommen}, schon da ${sendeZahl.schonDa}, abgelehnt ${sendeZahl.fehler}`); log(zuLange ? 'Laufzeit erreicht.' : 'Kein Spieltag mehr frisch.'); ende(0); }
    if (zuLange && Date.now() - START > LAUFZEIT_MS + 10 * 60_000) { await sendenAbwarten(0); ende(0); }
  }, 30_000);
} else {
  // Die Teile von GitHub (app/api/sofort/match) alle drei Sekunden aus dem Eingang nehmen.
  setInterval(() => { try { eingangNehmen(); } catch (e) { log(`Eingang: ${e.message}`); } }, 3_000);
  void bauer();
}
if (NUR_BAUEN) await new Promise(() => {});
void sammler();
await Promise.all(Array.from({ length: LADEN }, arbeiter));
