#!/usr/bin/env node
/*
 * Der XMPP-Dienst: der Online-Status der Epic-Freunde des CompHub-Kontos (und des Bot-Kontos "comphub.") als eigener, dauerhaft laufender Vorgang.
 *
 * Warum eigen (Betreiber, Heat 2 am 15.11.2026): die Verbindung lebte im Prozess der Seite ("web") - jedes Update startet "web" neu, die Verbindung war
 * weg, und der Match-ID-Finder zeigte minutenlang nichts. Protokoll gab es keins. Dieser Dienst laeuft im Compose-Dienst "xmpp" mit eigenem, kleinem
 * Image (Dockerfile.xmpp, .github/workflows/xmpp-image.yml) - es wird nur neu gebaut, wenn sich DIESE Datei aendert; ein Update der Seite laesst ihn in Ruhe.
 *
 * Die Seite liest von hier (lib/epicFreundeStatus, XMPP_DIENST_URL=http://xmpp:3210):
 *   GET /freunde   -> { status, freunde: { <epicId>: FreundStatus } }
 *   GET /strom     -> Server-Sent Events: "hallo" { status, freunde } beim Verbinden, "freund" { id, status } bei jedem Wechsel,
 *                     "status" bei jedem Verbinden/Trennen, Lebenszeichen alle 15 s
 *   GET /status    -> { status }
 * Nur im Compose-Netz erreichbar (kein Port nach aussen). Ist XMPP_DIENST_GEHEIM gesetzt, muss es als "Authorization: Bearer ..." mitkommen.
 *
 * Wache: kommt 20 s nach dem Start einer Verbindung kein "online", oder XMPP_STILLE_S (150 s) lang keine einzige Stanza (ein Ping geht alle 55 s
 * hinaus, seine Antwort ist eine Stanza), wird neu verbunden - mit frischem Schluessel, Pause 1 s, dann 5 s, 10 s, 20 s ... hoechstens 60 s.
 * Protokoll: Verbinden, online, Trennen, Fehler, Wache, und jede Minute je Konto: Status empfangen, Freunde mit Status, davon im Game, Leser.
 *
 *   node scripts/xmpp-dienst.mjs
 *   Umgebung: XMPP_DIENST_PORT (3210), XMPP_DIENST_HOST (0.0.0.0), COMPHUB_DATEN (data/), EPIC_DEVICE_AUTH (sonst <daten>/epic-auth.json),
 *             <daten>/epic-auth-bot.json fuer das Bot-Konto; nur fuer den Test: EPIC_ACCOUNT_URL, EPIC_XMPP_URL.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { client, xml } from '@xmpp/client';
import { annahmeDurchgang, freigabenAus } from '../lib/freundAnnahme.mjs';

const PORT = Number(process.env.XMPP_DIENST_PORT || 3210);
const HOST = process.env.XMPP_DIENST_HOST || '0.0.0.0';
const GEHEIM = (process.env.XMPP_DIENST_GEHEIM || '').trim();
const DATEN = process.env.COMPHUB_DATEN || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const ACCOUNT = process.env.EPIC_ACCOUNT_URL || 'https://account-public-service-prod.ol.epicgames.com';
const XMPP_URL = process.env.EPIC_XMPP_URL || 'wss://xmpp-service-prod.ol.epicgames.com';
const STILLE_MS = Number(process.env.XMPP_STILLE_S || 150) * 1000;
const ONLINE_MS = Number(process.env.XMPP_ONLINE_S || 20) * 1000;
const BASIC = 'basic ' + Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64');
const HEX32 = /^[0-9a-f]{32}$/;

const log = (...t) => console.log(new Date().toISOString(), ...t);

/** Je Konto der Zustand. */
const konten = {
  haupt: neu('haupt'),
  bot: neu('bot'),
};
function neu(name) {
  return {
    name, freunde: new Map(), verbunden: false, seit: null, fehler: null, konto: null,
    versuche: 0, verbindungen: 0, presencesGesamt: 0, presencesMinute: 0, letzteStanza: 0, gen: 0,
    xmpp: null, ping: null, onlineUhr: null, neuUhr: null, token: null, aus: false,
  };
}

/* ------------------------------------------------------------------ Anmeldung */

async function zugangVon(name) {
  let a = null;
  if (name === 'haupt' && process.env.EPIC_DEVICE_AUTH) a = JSON.parse(process.env.EPIC_DEVICE_AUTH);
  else {
    const datei = path.join(DATEN, name === 'bot' ? 'epic-auth-bot.json' : 'epic-auth.json');
    const roh = await fs.readFile(datei, 'utf8').catch(() => null);
    if (!roh) return null;
    a = JSON.parse(roh);
  }
  if (!a?.accountId || !a?.deviceId || !a?.secret) return null;
  return a;
}

async function anmelden(a) {
  const r = await fetch(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'device_auth', account_id: a.accountId, device_id: a.deviceId, secret: a.secret }),
  });
  if (!r.ok) throw new Error(`Anmeldung HTTP ${r.status}`);
  const j = await r.json();
  return { token: j.access_token, accountId: String(j.account_id).toLowerCase() };
}

/** Die alte Sitzung bei Epic schliessen (sonst sammeln sich Sitzungen: "too many sessions", 7.11.2026). */
function sitzungZu(token) {
  if (!token) return;
  fetch(`${ACCOUNT}/account/api/oauth/sessions/kill/${token}`, { method: 'DELETE', headers: { Authorization: `bearer ${token}` }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}

/* ------------------------------------------------------------------ Verbindung */

function aufraeumen(k) {
  if (k.ping) clearInterval(k.ping); k.ping = null;
  if (k.onlineUhr) clearTimeout(k.onlineUhr); k.onlineUhr = null;
  const alt = k.xmpp; k.xmpp = null;
  if (alt) { try { alt.removeAllListeners?.(); } catch { /* egal */ } alt.on?.('error', () => {}); alt.stop?.().catch(() => {}); }
}

function spaeterNeu(k, grund) {
  if (k.aus) return;
  if (k.neuUhr) return;
  // Erst nach 1 s (eine einzelne Trennung soll kaum auffallen), dann 5, 10, 20, 40, hoechstens 60 s.
  const warte = k.versuche === 0 ? 1_000 : Math.min(60_000, 5_000 * 2 ** Math.min(k.versuche - 1, 4));
  k.versuche += 1;
  log(`[${k.name}] neu verbinden in ${warte / 1000} s (${grund})`);
  k.neuUhr = setTimeout(() => { k.neuUhr = null; void verbinde(k); }, warte);
}

function getrennt(k, grund) {
  const war = k.verbunden;
  k.verbunden = false;
  aufraeumen(k);
  if (war) { log(`[${k.name}] getrennt: ${grund} (war verbunden seit ${k.seit})`); sendeStatus(); }
  k.seit = null;
  spaeterNeu(k, grund);
}

async function verbinde(k) {
  aufraeumen(k);
  const gen = ++k.gen;
  let a;
  try { a = await zugangVon(k.name); } catch (e) { k.fehler = `Zugang unlesbar: ${e.message}`; log(`[${k.name}] ${k.fehler}`); spaeterNeu(k, 'Zugang'); return; }
  if (!a) {
    k.fehler = 'kein Zugang';
    // Ohne Datei kein Konto - spaeter noch einmal nachsehen (die Datei kann nachgeladen werden).
    if (k.versuche === 0) log(`[${k.name}] kein Geraete-Zugang gefunden - nachgesehen wird alle 60 s`);
    k.versuche = 5; spaeterNeu(k, 'kein Zugang'); return;
  }
  let zugang;
  try { zugang = await anmelden(a); } catch (e) { k.fehler = e.message; log(`[${k.name}] ${e.message}`); spaeterNeu(k, 'Anmeldung'); return; }
  if (gen !== k.gen) return;
  sitzungZu(k.token);
  k.token = zugang.token; k.konto = zugang.accountId;
  k.verbindungen += 1;
  log(`[${k.name}] verbinde (Versuch ${k.versuche + 1}, Verbindung Nr. ${k.verbindungen}) als ${zugang.accountId.slice(0, 6)}...`);
  const x = client({
    service: XMPP_URL, domain: 'prod.ol.epicgames.com',
    resource: `V2:Fortnite:WIN::${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`,
    username: zugang.accountId, password: zugang.token,
  });
  k.xmpp = x;
  // Das eingebaute Wiederverbinden von @xmpp/client aus: es nimmt den alten Schluessel und meldet nichts. Hier wird jede Trennung protokolliert und mit
  // frischem Schluessel neu verbunden (getrennt -> spaeterNeu).
  try { x.reconnect?.stop?.(); } catch { /* egal */ }
  const meins = () => k.xmpp === x && gen === k.gen;
  x.on('disconnect', (e) => { if (meins()) getrennt(k, `Verbindung zu (${e?.clean === false ? 'abgerissen' : 'geschlossen'})`); });
  x.on('error', (e) => { if (!meins()) return; k.fehler = e?.message ?? String(e); log(`[${k.name}] Fehler: ${k.fehler}`); });
  x.on('stanza', (s) => {
    if (!meins()) return;
    k.letzteStanza = Date.now();
    if (!s.is('presence')) return;
    const von = String(s.attrs.from ?? '').split('@')[0].toLowerCase();
    if (!HEX32.test(von) || von === k.konto) return;
    k.presencesGesamt += 1; k.presencesMinute += 1;
    if (s.attrs.type === 'unavailable') {
      const alt = k.freunde.get(von);
      if (alt) { k.freunde.set(von, { ...alt, sessionId: null, seit: null, zeile: '', zuletzt: new Date().toISOString() }); wechsel(von, alt); }
      return;
    }
    const status = s.getChildText('status');
    if (status) lies(k, von, status);
  });
  x.on('online', async () => {
    if (!meins()) return;
    if (k.onlineUhr) clearTimeout(k.onlineUhr); k.onlineUhr = null;
    k.verbunden = true; k.fehler = null; k.versuche = 0; k.seit = new Date().toISOString(); k.letzteStanza = Date.now();
    log(`[${k.name}] online`);
    k.ping = setInterval(() => {
      if (!meins()) return;
      x.send(xml('iq', { type: 'get', id: crypto.randomUUID(), to: 'prod.ol.epicgames.com' }, xml('ping', { xmlns: 'urn:xmpp:ping' }))).catch(() => {});
    }, 55_000);
    // "abwesend" melden - noetig, damit Epic die Status der Freunde schickt.
    await x.send(xml('presence', {}, xml('status', {}, JSON.stringify({ Status: '', bIsPlaying: false, bIsJoinable: false, bHasVoiceSupport: false, SessionId: '', Properties: {} })), xml('show', {}, 'away'))).catch(() => {});
    sendeStatus();
  });
  x.on('offline', () => { if (meins()) getrennt(k, 'offline'); });
  // Wache 1: online muss in ONLINE_MS da sein.
  k.onlineUhr = setTimeout(() => { if (meins() && !k.verbunden) { log(`[${k.name}] Wache: nach ${ONLINE_MS / 1000} s nicht online`); getrennt(k, 'kein online'); } }, ONLINE_MS);
  try { await x.start(); } catch (e) { if (meins()) { k.fehler = e?.message || e?.name || 'ohne Meldung (Zeitueberschreitung beim Oeffnen?)'; log(`[${k.name}] Start fehlgeschlagen: ${k.fehler}`); getrennt(k, 'Start'); } }
}

// Wache 2: Stille.
setInterval(() => {
  for (const k of Object.values(konten)) {
    if (k.verbunden && Date.now() - k.letzteStanza > STILLE_MS) { log(`[${k.name}] Wache: ${Math.round((Date.now() - k.letzteStanza) / 1000)} s keine Stanza`); getrennt(k, 'Stille'); }
  }
}, 10_000);

/* ------------------------------------------------------------------ Status der Freunde */

function lies(k, von, roh) {
  let j = {};
  try { j = JSON.parse(roh); } catch { return; }
  const props = j.Properties ?? {};
  const stats = props.FortGameplayStats_j ?? null;
  const id = HEX32.test(String(j.SessionId ?? '').toLowerCase()) ? String(j.SessionId).toLowerCase() : null;
  const alt = k.freunde.get(von);
  const jetzt = new Date().toISOString();
  k.freunde.set(von, {
    sessionId: id, zeile: String(j.Status ?? ''),
    playlist: stats?.playlist && stats.playlist !== 'None' ? stats.playlist : null,
    kills: typeof stats?.numKills === 'number' ? stats.numKills : null,
    seit: id ? (alt?.sessionId === id ? alt.seit : jetzt) : null,
    zuletzt: jetzt,
  });
  wechsel(von, alt);
}

/** Ueber beide Konten: wer bei einem Konto in einem Game ist, zaehlt. */
function gemischt(id) {
  const a = konten.haupt.freunde.get(id);
  const b = konten.bot.freunde.get(id);
  if (!a) return b ?? null;
  if (b && !a.sessionId && b.sessionId) return b;
  return a;
}
function alleFreunde() {
  const raus = {};
  for (const id of new Set([...konten.haupt.freunde.keys(), ...konten.bot.freunde.keys()])) raus[id] = gemischt(id);
  return raus;
}
const zuletztGemeldet = new Map();
function wechsel(id) {
  const f = gemischt(id);
  const k = f ? `${f.sessionId}|${f.zeile}|${f.playlist}|${f.kills}` : '';
  if (zuletztGemeldet.get(id) === k) return;
  zuletztGemeldet.set(id, k);
  sende('freund', { id, status: f });
}

function status() {
  const je = {};
  let verbunden = false;
  for (const k of Object.values(konten)) {
    const freunde = [...k.freunde.values()];
    je[k.name] = {
      verbunden: k.verbunden, seit: k.seit, fehler: k.fehler, verbindungen: k.verbindungen,
      freunde: freunde.length, imGame: freunde.filter((f) => f.sessionId).length,
      presences: k.presencesGesamt, letzteStanza: k.letzteStanza ? new Date(k.letzteStanza).toISOString() : null,
    };
    verbunden ||= k.verbunden;
  }
  const alle = Object.values(alleFreunde());
  return { dienst: true, gestartet: START, verbunden, freunde: alle.length, imGame: alle.filter((f) => f?.sessionId).length, konten: je, leser: leser.size };
}

/* ------------------------------------------------------------------ HTTP + Strom */

const START = new Date().toISOString();
const leser = new Set();
function sende(ereignis, daten) {
  const text = `event: ${ereignis}\ndata: ${JSON.stringify(daten)}\n\n`;
  for (const res of leser) { try { res.write(text); } catch { /* geht beim close weg */ } }
}
let statusZuletzt = '';
function sendeStatus() {
  const s = status();
  const k = JSON.stringify({ v: s.verbunden, h: s.konten.haupt.seit, b: s.konten.bot.seit });
  if (k === statusZuletzt) return;
  statusZuletzt = k;
  sende('status', s);
}
setInterval(() => { for (const res of leser) { try { res.write(`: hb\nevent: hb\ndata: ${Date.now()}\n\n`); } catch { /* egal */ } } }, 15_000);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (GEHEIM && req.headers.authorization !== `Bearer ${GEHEIM}`) { res.writeHead(401).end(); return; }
  if (u.pathname === '/status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ status: status() })); return; }
  if (u.pathname === '/freunde') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ status: status(), freunde: alleFreunde() })); return; }
  if (u.pathname === '/strom') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 1000\nevent: hallo\ndata: ${JSON.stringify({ status: status(), freunde: alleFreunde() })}\n\n`);
    leser.add(res);
    log(`Leser verbunden (${leser.size})`);
    req.on('close', () => { leser.delete(res); log(`Leser weg (${leser.size})`); });
    return;
  }
  res.writeHead(404).end();
});
server.keepAliveTimeout = 5_000;
server.listen(PORT, HOST, () => log(`XMPP-Dienst auf ${HOST}:${PORT}, Daten ${DATEN}, Stille ${STILLE_MS / 1000} s, online in ${ONLINE_MS / 1000} s`));

// Jede Minute ein Lagebericht (nur Zahlen).
setInterval(() => {
  const s = status();
  log(`Lage: ${Object.values(konten).map((k) => `${k.name} ${k.verbunden ? 'verbunden' : 'GETRENNT'}${k.seit ? ` seit ${k.seit.slice(11, 19)}` : ''}, Status/min ${k.presencesMinute}, Freunde ${s.konten[k.name].freunde}, im Game ${s.konten[k.name].imGame}`).join(' | ')} | Leser ${leser.size}`);
  for (const k of Object.values(konten)) k.presencesMinute = 0;
}, 60_000);

const ende = (sig) => {
  log(`${sig} - Ende`);
  for (const k of Object.values(konten)) { k.aus = true; aufraeumen(k); sitzungZu(k.token); }
  for (const res of leser) { try { res.end(); } catch { /* egal */ } }
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGTERM', () => ende('SIGTERM'));
process.on('SIGINT', () => ende('SIGINT'));

/*
 * Anfragen annehmen, die ein Streamer/Pro SELBST an das Bot-Konto geschickt hat (lib/freundAnnahme.mjs) - nur fuer Epic-Ids in
 * <daten>/matchid-freigaben.json. Ohne Datei: nichts. Der Bot schickt weiterhin niemandem eine Anfrage (#21).
 */
const ANNAHME_MS = Number(process.env.FREUND_ANNAHME_S || 120) * 1000;
async function annahme() {
  const k = konten.bot;
  if (!k.verbunden || !k.token || !k.konto) return;
  // Erst der eigene Datenordner, dann der der Seite (im Compose-Dienst nur lesend unter /app/daten-hintergrund eingehaengt).
  let roh = null;
  for (const ort of [DATEN, process.env.FREIGABEN_ORT || '/app/daten-hintergrund']) {
    roh = await fs.readFile(path.join(ort, 'matchid-freigaben.json'), 'utf8').catch(() => null);
    if (roh) break;
  }
  if (!roh) return;
  let freigaben;
  try { freigaben = freigabenAus(JSON.parse(roh)); } catch { log('[bot] matchid-freigaben.json unlesbar'); return; }
  if (!freigaben.size) return;
  try {
    const r = await annahmeDurchgang({ konto: k.konto, token: k.token, freigaben });
    if (r.angenommen.length || r.fehler) log(`[bot] Anfragen: ${r.angenommen.length} angenommen (${r.angenommen.map((x) => x.slice(0, 6)).join(', ')}), ${r.liegen} liegen${r.fehler ? `, Fehler: ${r.fehler}` : ''}`);
  } catch (e) { log(`[bot] Annahme: ${e?.message ?? e}`); }
}
setInterval(() => { void annahme(); }, ANNAHME_MS);

for (const k of Object.values(konten)) void verbinde(k);
