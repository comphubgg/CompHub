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
 *   GET /freunde?alle=1 -> dazu "liste" (alle Freunde beider Konten laut Epics Freundesliste, auch wer offline ist) und "verlauf" (siehe unten)
 *   GET /verlauf[?ids=a,b] -> { verlauf: { <epicId>: [{ matchId, von, bis, playlist, zeile }] } } - jede Sitzung, die ein Freund hatte (neueste zuletzt)
 *
 * Verlauf (Betreiber, 17.11.2026: "wenn ich das Match verlasse, ist die ID sofort weg - als Verlauf darunter behalten"): je Freund die letzten 50
 * Sitzungen der letzten 14 Tage, im Speicher und alle 60 s (nur wenn sich etwas tat) in <daten>/xmpp-verlauf.json - so ueberlebt er einen Neustart
 * des Dienstes. Die Seite (lib/matchVerlauf) holt ihn ab und legt ihn dauerhaft in ihre Ablage. Jeder Wechsel einer SessionId steht im Protokoll
 * ("SessionId <id>: alt -> neu"), mit Zeitstempel - zum Messen.
 * Nur im Compose-Netz erreichbar (kein Port nach aussen). Ist XMPP_DIENST_GEHEIM gesetzt, muss es als "Authorization: Bearer ..." mitkommen.
 *
 * Wache: kommt 20 s nach dem Start einer Verbindung kein "online", oder XMPP_STILLE_S (150 s) lang keine einzige Stanza (ein Ping geht alle 55 s
 * hinaus, seine Antwort ist eine Stanza), wird neu verbunden - mit frischem Schluessel, Pause 1 s, dann 5 s, 10 s, 20 s ... hoechstens 60 s.
 * Protokoll: Verbinden, online, Trennen, Fehler, Wache, und jede Minute je Konto: Status empfangen, Freunde mit Status, davon im Game, Leser.
 *
 *   node scripts/xmpp-dienst.mjs
 *   Umgebung: XMPP_DIENST_PORT (3210), XMPP_DIENST_HOST (0.0.0.0), COMPHUB_DATEN (data/), EPIC_DEVICE_AUTH (sonst <daten>/epic-auth.json),
 *             <daten>/epic-auth-bot.json fuer das Bot-Konto; nur fuer den Test: EPIC_ACCOUNT_URL, EPIC_XMPP_URL, EPIC_FRIENDS_URL.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { client, xml } from '@xmpp/client';

const PORT = Number(process.env.XMPP_DIENST_PORT || 3210);
const HOST = process.env.XMPP_DIENST_HOST || '0.0.0.0';
const GEHEIM = (process.env.XMPP_DIENST_GEHEIM || '').trim();
const DATEN = process.env.COMPHUB_DATEN || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const ACCOUNT = process.env.EPIC_ACCOUNT_URL || 'https://account-public-service-prod.ol.epicgames.com';
const XMPP_URL = process.env.EPIC_XMPP_URL || 'wss://xmpp-service-prod.ol.epicgames.com';
const FRIENDS = process.env.EPIC_FRIENDS_URL || 'https://friends-public-service-prod.ol.epicgames.com';
const STILLE_MS = Number(process.env.XMPP_STILLE_S || 150) * 1000;
const ONLINE_MS = Number(process.env.XMPP_ONLINE_S || 20) * 1000;
const BASIC = 'basic ' + Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64');
const HEX32 = /^[0-9a-f]{32}$/;

const log = (...t) => console.log(new Date().toISOString(), ...t);
const VERLAUF_DATEI = path.join(DATEN, 'xmpp-verlauf.json');
const VERLAUF_JE = 50;
const VERLAUF_TAGE_MS = 14 * 86_400_000;

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
    /** Alle Freunde laut Epics Freundesliste (auch offline) - alle 10 min neu, zwei Abrufe insgesamt, nicht je Freund. */
    liste: new Set(), listeZeit: 0,
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
      if (alt) {
        if (alt.sessionId) log(`[${k.name}] SessionId ${von}: ${alt.sessionId} -> - (abgemeldet)`);
        k.freunde.set(von, { ...alt, sessionId: null, seit: null, zeile: '', zuletzt: new Date().toISOString() }); wechsel(von, alt);
      }
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
    void listeHolen(k);
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
  if ((alt?.sessionId ?? null) !== id) log(`[${k.name}] SessionId ${von}: ${alt?.sessionId ?? '-'} -> ${id ?? '-'} (${stats?.playlist ?? '-'}, "${String(j.Status ?? '')}")`);
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
  verlaufMerken(id, f);
  const k = f ? `${f.sessionId}|${f.zeile}|${f.playlist}|${f.kills}` : '';
  if (zuletztGemeldet.get(id) === k) return;
  zuletztGemeldet.set(id, k);
  sende('freund', { id, status: f });
}

/* ------------------------------------------------------------------ Verlauf */

/** epicId -> [{ matchId, von, bis, playlist, zeile }] (aelteste zuerst). */
const verlauf = new Map();
/** epicId -> die Sitzung, die zuletzt offen war (um ihr Ende festzuhalten). */
const offeneSitzung = new Map();
let verlaufGeaendert = false;

function verlaufMerken(id, f) {
  const jetzt = new Date().toISOString();
  const sid = f?.sessionId ?? null;
  const liste = verlauf.get(id) ?? [];
  const vorher = offeneSitzung.get(id) ?? null;
  // Die vorige Sitzung ist vorbei: bis jetzt gesehen.
  if (vorher && vorher !== sid) {
    const e = liste.findLast((x) => x.matchId === vorher);
    if (e) { e.bis = jetzt; verlaufGeaendert = true; }
  }
  if (sid) {
    let e = liste.findLast((x) => x.matchId === sid);
    if (!e) {
      e = { matchId: sid, von: f.seit ?? jetzt, bis: jetzt, playlist: f.playlist ?? null, zeile: f.zeile || '' };
      liste.push(e);
      if (liste.length > VERLAUF_JE) liste.splice(0, liste.length - VERLAUF_JE);
      verlauf.set(id, liste);
    } else {
      e.bis = jetzt;
      if (!e.playlist && f.playlist) e.playlist = f.playlist;
      if (f.zeile) e.zeile = f.zeile;
    }
    verlaufGeaendert = true;
    offeneSitzung.set(id, sid);
  } else offeneSitzung.delete(id);
}

function verlaufAls(ids) {
  const raus = {};
  for (const id of ids ?? verlauf.keys()) { const l = verlauf.get(id); if (l?.length) raus[id] = l; }
  return raus;
}

async function verlaufLaden() {
  try {
    const d = JSON.parse(await fs.readFile(VERLAUF_DATEI, 'utf8'));
    for (const [id, l] of Object.entries(d ?? {})) if (HEX32.test(id) && Array.isArray(l)) verlauf.set(id, l.filter((e) => e && HEX32.test(String(e.matchId))));
    log(`Verlauf geladen: ${verlauf.size} Freunde, ${[...verlauf.values()].reduce((n, l) => n + l.length, 0)} Sitzungen`);
  } catch (e) { if (e?.code !== 'ENOENT') log(`Verlauf nicht lesbar: ${e.message}`); }
}

/** Hoechstens alle 60 s, und nur wenn sich etwas tat: alte Eintraege weg, Datei schreiben. */
setInterval(async () => {
  if (!verlaufGeaendert) return;
  verlaufGeaendert = false;
  const grenze = Date.now() - VERLAUF_TAGE_MS;
  for (const [id, l] of verlauf) {
    const rest = l.filter((e) => Date.parse(e.bis) >= grenze);
    if (rest.length) verlauf.set(id, rest); else verlauf.delete(id);
  }
  try {
    await fs.mkdir(DATEN, { recursive: true });
    await fs.writeFile(VERLAUF_DATEI + '.neu', JSON.stringify(Object.fromEntries(verlauf)));
    await fs.rename(VERLAUF_DATEI + '.neu', VERLAUF_DATEI);
  } catch (e) { log(`Verlauf nicht geschrieben: ${e.message}`); verlaufGeaendert = true; }
}, 60_000);

/** Epics Freundesliste des Kontos (ein Abruf) - damit der Admin auch die Freunde sieht, die gerade offline sind. */
async function listeHolen(k) {
  if (!k.token || !k.konto || Date.now() - k.listeZeit < 9 * 60_000) return;
  k.listeZeit = Date.now();
  try {
    const r = await fetch(`${FRIENDS}/friends/api/v1/${k.konto}/summary`, { headers: { Authorization: `bearer ${k.token}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const ids = (j.friends ?? []).map((f) => String(f.accountId ?? '').replace(/-/g, '').toLowerCase()).filter((x) => HEX32.test(x));
    if (ids.length !== k.liste.size) log(`[${k.name}] Freundesliste: ${ids.length} Freunde`);
    k.liste = new Set(ids);
  } catch (e) { log(`[${k.name}] Freundesliste nicht lesbar: ${e.message}`); k.listeZeit = Date.now() - 8 * 60_000; }
}
setInterval(() => { for (const k of Object.values(konten)) if (k.verbunden) void listeHolen(k); }, 60_000);

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
  if (u.pathname === '/freunde') {
    const alle = u.searchParams.get('alle') === '1';
    const extra = alle ? { liste: [...new Set([...konten.haupt.liste, ...konten.bot.liste])], verlauf: verlaufAls() } : {};
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ status: status(), freunde: alleFreunde(), ...extra }));
    return;
  }
  if (u.pathname === '/verlauf') {
    const ids = (u.searchParams.get('ids') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => HEX32.test(x));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ verlauf: verlaufAls(ids.length ? ids : null) }));
    return;
  }
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
  // Den Verlauf noch sichern (sonst fehlt nach dem Neustart bis zu einer Minute).
  if (verlaufGeaendert) void fs.mkdir(DATEN, { recursive: true }).then(() => fs.writeFile(VERLAUF_DATEI, JSON.stringify(Object.fromEntries(verlauf)))).catch(() => {});
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGTERM', () => ende('SIGTERM'));
process.on('SIGINT', () => ende('SIGINT'));

await verlaufLaden();
for (const k of Object.values(konten)) void verbinde(k);
