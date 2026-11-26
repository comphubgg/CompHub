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
 *   GET /freunde?alle=1 -> dazu "liste" (die Freunde des Bot-Kontos laut Epics Freundesliste, auch wer offline ist) und "verlauf" (siehe unten)
 *   GET/POST /freigaben -> { ids } - die Epic-Ids, deren Freundschaftsanfragen an das Bot-Konto angenommen werden (POST { ids } setzt sie, von der Seite)
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
import { annahmeDurchgang, freigabenAus } from '../lib/freundAnnahme.mjs';

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
    /** Alle Freunde laut Epics Freundesliste (auch offline) - Haupt-Konto alle 10 min, Bot-Konto alle 2 min (siehe listeHolen), ein Abruf, nicht je Freund. */
    liste: new Set(), listeZeit: 0, listeGeladen: false,
    /** Neuaufbau der Sitzung fuer neue Freunde (siehe freundeNeuAufnehmen). */
    neuaufbauUhr: null, letzterNeuaufbau: 0, rest: null, restZeit: 0, restLaeuft: null,
    /** Welche Match-ID ein Freund aus der Sitzungssuche hat (nicht aus seinem Status) - siehe sitzungenSuchen. */
    sitzungVonSuche: new Map(), sitzungVonRest: new Map(), onlineVonRest: new Set(),
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

/*
 * Schluessel fuer die REST-Abrufe (Freundesliste, Annahme, Sitzungssuche). Epics Zugangsschluessel laeuft nach 8 h ab; die XMPP-Verbindung bleibt
 * trotzdem stehen, die Abrufe bekamen aber nur noch HTTP 401 (26.11.2026: 12 780 Fehler in der Sitzungssuche). Darum ein eigener Schluessel, der alle
 * 3 h und sofort bei 401 erneuert wird - der Schluessel der Live-Verbindung wird dabei nie geschlossen.
 */
const REST_MS = 3 * 60 * 60_000;
async function restToken(k, erzwingen = false) {
  if (!erzwingen && k.rest && Date.now() - k.restZeit < REST_MS) return k.rest;
  if (k.restLaeuft) return k.restLaeuft;
  k.restLaeuft = (async () => {
    const a = await zugangVon(k.name);
    if (!a) throw new Error('kein Zugang');
    const z = await anmelden(a);
    const alt = k.rest;
    k.rest = z.token; k.restZeit = Date.now(); k.konto = k.konto ?? z.accountId;
    if (alt && alt !== k.token) sitzungZu(alt);
    log(`[${k.name}] REST-Schluessel erneuert${erzwingen ? ' (nach 401)' : ''}`);
    return z.token;
  })().finally(() => { k.restLaeuft = null; });
  return k.restLaeuft;
}
/** fetch mit REST-Schluessel; bei 401 einmal neu anmelden und wiederholen. */
async function epicAbruf(k, url, opt = {}) {
  const mit = (t) => fetch(url, { ...opt, headers: { ...(opt.headers ?? {}), Authorization: `bearer ${t}` } });
  const r = await mit(await restToken(k));
  if (r.status !== 401) return r;
  return mit(await restToken(k, true));
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
  // Der REST-Schluessel haengt am alten Live-Schluessel, wenn er noch nie erneuert wurde - dann bekommt er den neuen mit.
  const restAlt = k.rest === k.token || !k.rest;
  sitzungZu(k.token);
  k.token = zugang.token; k.konto = zugang.accountId;
  if (restAlt) { k.rest = zugang.token; k.restZeit = Date.now(); }
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
    presenceMerken(k, von, s);
    if (s.attrs.type === 'unavailable') {
      const alt = k.freunde.get(von);
      if (alt) {
        if (alt.sessionId) log(`[${k.name}] SessionId ${von}: ${alt.sessionId} -> - (abgemeldet)`);
        k.freunde.set(von, { ...alt, sessionId: null, seit: null, zeile: '', online: false, zuletzt: new Date().toISOString() }); wechsel(von, alt);
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

/* ------------------------------------------------------------------ Diagnose */

/*
 * Was beim Bot-Konto ankommt (Betreiber, 25.11.2026: Rax war Freund des Bots und im offiziellen Client - eingeloggt als comphub. - online und einladbar,
 * der Dienst bekam aber keinen Status von ihm, in einer Stunde nur von einem einzigen Freund). Die letzten 400 Presences des Bot-Kontos mit Absender-App
 * (Resource, etwa "V2:Fortnite:WIN"), Typ, show, Statuszeile und dem Anfang der SessionId - und GET /diagnose?id=<epicId> legt Epics Sicht daneben
 * (Freundschaft, "zuletzt online" aus dem Presence-Dienst) und schickt eine Status-Abfrage (probe) an das Konto; die Antwort steht beim naechsten Aufruf
 * im Protokoll. Keine Schluessel in der Antwort.
 */
const presenceLog = [];
function presenceMerken(k, von, s) {
  if (k.name !== 'bot') return;
  let j = {};
  try { j = JSON.parse(s.getChildText('status') ?? '{}'); } catch { /* keine JSON-Zeile */ }
  const res = String(s.attrs.from ?? '').split('/')[1] ?? '';
  presenceLog.push({
    t: new Date().toISOString(), id: von, app: res.split(':').slice(0, 3).join(':') || '-', typ: s.attrs.type ?? 'available',
    show: s.getChildText('show') ?? null, zeile: String(j.Status ?? ''), session: j.SessionId ? String(j.SessionId).slice(0, 8) : null,
  });
  if (presenceLog.length > 400) presenceLog.splice(0, presenceLog.length - 400);
}
/*
 * Versuch (Betreiber, 25.11.2026): Bei der Bot-Sitzung kam von KEINEM echten Spieler ein Status an - nur das Echo des eigenen Haupt-Kontos. Welche
 * Anmeldeart bekommt Status? GET /diagnose?id=..&versuch=1 startet drei zusaetzliche Sitzungen des Bot-Kontos nebeneinander (je 45 s): wie der Dienst
 * (Fortnite, "away"), als Epic-Launcher ("away"), und als Fortnite ohne "away" (online). Jede zaehlt, von wem Status kommt. Der Live-Betrieb laeuft
 * unveraendert weiter; die Sitzungen werden danach bei Epic geschlossen. Das Ergebnis steht in jedem weiteren /diagnose unter "versuch".
 */
let versuch = null;
async function versuchStarten() {
  if (versuch?.laeuft) return;
  const a = await zugangVon('bot').catch(() => null);
  if (!a) { versuch = { laeuft: false, fehler: 'kein Bot-Zugang' }; return; }
  const varianten = [
    { name: 'fortnite-away (wie Dienst)', resource: 'V2:Fortnite:WIN::', show: 'away' },
    { name: 'launcher-away', resource: 'V2:launcher:WIN::', show: 'away' },
    { name: 'fortnite-online', resource: 'V2:Fortnite:WIN::', show: null },
  ];
  versuch = { laeuft: true, start: new Date().toISOString(), ergebnisse: {} };
  await Promise.all(varianten.map(async (v) => {
    const erg = versuch.ergebnisse[v.name] = { verbunden: false, presences: 0, vonFreunden: {}, beispiele: [], fehler: null };
    let zugang = null; let x = null;
    try {
      zugang = await anmelden(a);
      x = client({ service: XMPP_URL, domain: 'prod.ol.epicgames.com', resource: `${v.resource}${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`, username: zugang.accountId, password: zugang.token });
      try { x.reconnect?.stop?.(); } catch { /* egal */ }
      x.on('error', (e) => { erg.fehler = e?.message ?? String(e); });
      x.on('stanza', (st) => {
        if (!st.is('presence')) return;
        const id = String(st.attrs.from ?? '').split('@')[0].toLowerCase();
        if (!HEX32.test(id) || id === zugang.accountId) return;
        erg.presences += 1; erg.vonFreunden[id.slice(0, 8)] = (erg.vonFreunden[id.slice(0, 8)] ?? 0) + 1;
        if (erg.beispiele.length < 6) {
          let j = {}; try { j = JSON.parse(st.getChildText('status') ?? '{}'); } catch { /* egal */ }
          erg.beispiele.push({ id: id.slice(0, 8), app: (String(st.attrs.from ?? '').split('/')[1] ?? '').split(':').slice(0, 3).join(':'), typ: st.attrs.type ?? 'available', zeile: String(j.Status ?? '') });
        }
      });
      x.on('online', async () => {
        erg.verbunden = true;
        const kinder = [xml('status', {}, JSON.stringify({ Status: '', bIsPlaying: false, bIsJoinable: false, bHasVoiceSupport: false, SessionId: '', Properties: {} }))];
        if (v.show) kinder.push(xml('show', {}, v.show));
        await x.send(xml('presence', {}, ...kinder)).catch(() => {});
      });
      await x.start();
      await new Promise((r) => setTimeout(r, 45_000));
    } catch (e) { erg.fehler = e?.message ?? String(e); }
    finally {
      try { x?.removeAllListeners?.(); x?.on?.('error', () => {}); await x?.stop?.(); } catch { /* egal */ }
      if (zugang) sitzungZu(zugang.token);
    }
  }));
  versuch.laeuft = false; versuch.ende = new Date().toISOString();
  log(`Versuch fertig: ${Object.entries(versuch.ergebnisse).map(([n, e]) => `${n}: ${e.presences} Status von ${Object.keys(e.vonFreunden).length} Freunden`).join(' | ')}`);
}

async function diagnose(id) {
  const k = konten.bot;
  const zeitlich = (u) => epicAbruf(k, u, { signal: AbortSignal.timeout(1_500) })
    .then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 4000) })).catch((e) => ({ status: 0, text: e.message }));
  const bindestriche = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  const [fr, lo] = await Promise.all([
    zeitlich(`${FRIENDS}/friends/api/v1/${k.konto}/friends/${id}`),
    zeitlich(`https://presence-public-service-prod.ol.epicgames.com/presence/api/v1/_/${k.konto}/last-online`),
  ]);
  let zuletztOnline = null;
  try { const j = JSON.parse(lo.text); zuletztOnline = j?.[id] ?? j?.[bindestriche] ?? `nicht dabei (${Object.keys(j ?? {}).length} Eintraege)`; } catch { zuletztOnline = `HTTP ${lo.status}: ${lo.text.slice(0, 200)}`; }
  /*
   * Epics Sitzungssuche (matchmaking/session/findPlayer): fuer Fremde leer (Clix, 7.11.2026) - aber gilt das auch fuer FREUNDE? Rax ist Freund des
   * Bots, nicht des Haupt-Kontos (Betreiber, 25.11.2026: Twitch-Sub, damit er comphub. addet). Darum beide Logins nebeneinander.
   */
  const FINDE = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
  const finde = (tok) => fetch(FINDE + id, { headers: { Authorization: `bearer ${tok}` }, signal: AbortSignal.timeout(1_500) })
    .then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 1500) })).catch((e) => ({ status: 0, text: e.message }));
  const tokenOder = (kk) => (kk.token ? restToken(kk).catch(() => null) : null);
  const [tb, th] = await Promise.all([tokenOder(k), tokenOder(konten.haupt)]);
  const [findeBot, findeHaupt] = await Promise.all([tb ? finde(tb) : null, th ? finde(th) : null]);
  let probe = 'keine Verbindung';
  if (k.xmpp && k.verbunden) { probe = new Date().toISOString(); k.xmpp.send(xml('presence', { type: 'probe', to: `${id}@prod.ol.epicgames.com` })).catch(() => {}); }
  const jeAbsender = {};
  for (const p of presenceLog) jeAbsender[p.id.slice(0, 8)] = (jeAbsender[p.id.slice(0, 8)] ?? 0) + 1;
  return {
    bot: { verbunden: k.verbunden, seit: k.seit, presences: k.presencesGesamt, freundeMitStatus: k.freunde.size, freundesliste: k.liste.size, inListe: k.liste.has(id) },
    freundschaft: { status: fr.status, text: fr.text.slice(0, 400) },
    zuletztOnline,
    statusImDienst: k.freunde.get(id) ?? null,
    presencesVomZiel: presenceLog.filter((p) => p.id === id).slice(-15),
    presencesJeAbsender: jeAbsender,
    letztePresences: presenceLog.slice(-15).map((p) => ({ ...p, id: p.id.slice(0, 8) })),
    probeGeschickt: probe,
    sitzungssucheBot: findeBot,
    sitzungssuche,
    restPresence: { ...restPresence, jeId: undefined, ziel: restPresence.jeId.get(id) ?? null, freundeImAbruf: restPresence.jeId.size },
    sitzungssucheHaupt: findeHaupt,
    versuch,
  };
}

/*
 * Sitzungssuche fuer die Freunde des Bots (Betreiber, 25.11.2026: "finde einen anderen Weg, wie du die Match-ID schneller findest"). Rax war Freund des Bots,
 * sein Status kam aber nie an (sehr wahrscheinlich "Offline erscheinen"). Epics Sitzungssuche (matchmaking/session/findPlayer) nennt die Sitzung, in der ein
 * Konto gerade ist - auch vor dem ersten Kill; fuer Fremde ist sie leer (Clix, 7.11.2026), ob sie es fuer FREUNDE ist, war offen. Darum fragt der Dienst
 * mit dem Bot-Login alle 30 s fuer jeden Freund des Bots. Findet sie etwas, steht der Freund als LIVE mit Match-ID im Finder; ein Status aus XMPP hat
 * Vorrang und wird nie ueberschrieben. Liefert Epic nichts, aendert sich nichts. Jeder Fund steht im Protokoll und in /diagnose (sitzungssuche).
 */
const FINDE_URL = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
const SITZUNG_MS = Number(process.env.XMPP_SITZUNG_S || 30) * 1000;
const sitzungssuche = { abfragen: 0, leer: 0, funde: 0, fehler: 0, letzterFehler: null, letzteRunde: null, protokoll: [] };
let sucheLaeuft = false;
async function sitzungenSuchen() {
  const k = konten.bot;
  if (sucheLaeuft || !k.verbunden || !k.token || !k.liste.size) return;
  sucheLaeuft = true;
  try {
    for (const id of k.liste) {
      let sid = null; let playlist = null;
      try {
        sitzungssuche.abfragen += 1;
        const r = await epicAbruf(k, FINDE_URL + id, { signal: AbortSignal.timeout(5_000) });
        if (!r.ok) { sitzungssuche.fehler += 1; sitzungssuche.letzterFehler = `HTTP ${r.status}`; continue; }
        const j = await r.json();
        const sitz = Array.isArray(j) ? j.find((x) => HEX32.test(String(x?.id ?? '').toLowerCase())) : null;
        if (sitz) { sid = String(sitz.id).toLowerCase(); playlist = sitz.attributes?.PLAYLISTNAME_s ?? null; } else sitzungssuche.leer += 1;
      } catch (e) { sitzungssuche.fehler += 1; sitzungssuche.letzterFehler = e?.message ?? String(e); continue; }
      const alt = k.freunde.get(id);
      const vonSuche = k.sitzungVonSuche.get(id) ?? null;
      const jetzt = new Date().toISOString();
      if (sid) {
        // Eine Match-ID aus dem XMPP-Status geht vor.
        if (alt?.sessionId && alt.sessionId !== vonSuche) continue;
        if (vonSuche !== sid) {
          sitzungssuche.funde += 1;
          sitzungssuche.protokoll.push({ t: jetzt, id: id.slice(0, 8), sitzung: sid.slice(0, 8), playlist });
          if (sitzungssuche.protokoll.length > 50) sitzungssuche.protokoll.shift();
          log(`[bot] Sitzungssuche ${id}: ${vonSuche ?? '-'} -> ${sid} (${playlist ?? '-'})`);
        }
        k.freunde.set(id, {
          sessionId: sid, zeile: alt?.zeile || 'Im Match', playlist: playlist ?? alt?.playlist ?? null, kills: alt?.kills ?? null,
          seit: alt?.sessionId === sid ? alt.seit : jetzt, zuletzt: jetzt, online: true,
        });
        k.sitzungVonSuche.set(id, sid);
        wechsel(id);
      } else if (vonSuche) {
        k.sitzungVonSuche.delete(id);
        if (alt?.sessionId === vonSuche) { k.freunde.set(id, { ...alt, sessionId: null, seit: null, zuletzt: jetzt }); wechsel(id); }
      }
    }
    sitzungssuche.letzteRunde = new Date().toISOString();
  } finally { sucheLaeuft = false; }
}
setInterval(() => { void sitzungenSuchen(); }, SITZUNG_MS);

/*
 * Epics neuer Status-Dienst (EOS-Presence, REST) fuer die Freunde des Bots (Betreiber, 26.11.2026: "Rax ist gruen, also muss er online sein" - per XMPP
 * kam von ihm aber nie ein Status). Fortnite meldet den Status inzwischen ueber EOS (fnbr.js 5.0 liest Freundes-Status nur noch dort, Nov. 2026);
 * presence/api/v1/_/{bot}/presence?circle=friends liefert je Freund SessionIdAttributeKey ("s" + Match-ID), Playlist und Kills. Alle 15 s.
 * Ein Status aus XMPP geht vor und wird nie ueberschrieben; alles steht in /diagnose (restPresence).
 */
const PRESENCE_MS = Number(process.env.XMPP_PRESENCE_S || 15) * 1000;
const restPresence = { abrufe: 0, fehler: 0, letzterFehler: null, letzteRunde: null, mitSitzung: 0, funde: 0, protokoll: [], jeId: new Map() };
let restLaeuft = false;
function propsLesen(props) {
  let sid = String(props?.SessionIdAttributeKey ?? '').toLowerCase();
  if (sid.startsWith('s')) sid = sid.slice(1);
  let stats = {};
  try { const g = String(props?.FortGameplayStats ?? ''); if (g.startsWith('m')) stats = JSON.parse(g.slice(1)); } catch { /* leer */ }
  return {
    sid: HEX32.test(sid) ? sid : null,
    playlist: stats.playlist && stats.playlist !== 'None' ? String(stats.playlist) : null,
    kills: Number.isFinite(stats.numKills) ? stats.numKills : null,
  };
}
async function restPresenceHolen() {
  const k = konten.bot;
  if (restLaeuft || !k.verbunden || !k.konto) return;
  restLaeuft = true;
  try {
    restPresence.abrufe += 1;
    const r = await epicAbruf(k, `https://presence-public-service-prod.ol.epicgames.com/presence/api/v1/_/${k.konto}/presence?circle=friends`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) { restPresence.fehler += 1; restPresence.letzterFehler = `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`; return; }
    const j = await r.json();
    const liste = (Array.isArray(j) ? j : []).filter((c) => c?.circle === 'friends').flatMap((c) => c.presences ?? []);
    const jetzt = new Date().toISOString();
    const gesehen = new Set();
    let mit = 0;
    for (const p of liste) {
      const id = String(p?.accountId ?? '').replace(/-/g, '').toLowerCase();
      if (!HEX32.test(id)) continue;
      const ns = (p.perNs ?? []).find((n) => n?.props?.SessionIdAttributeKey !== undefined) ?? (p.perNs ?? []).find((n) => n?.productId === 'prod-fn') ?? p.perNs?.[0];
      const { sid, playlist, kills } = propsLesen(ns?.props);
      const zeile = String(ns?.activity?.value ?? '');
      const status = String(p.status ?? ns?.status ?? '');
      if (status === 'offline') continue;
      gesehen.add(id);
      restPresence.jeId.set(id, { t: jetzt, status, sid, playlist, kills, zeile, props: Object.keys(ns?.props ?? {}).length });
      const alt = k.freunde.get(id);
      const vonRest = k.sitzungVonRest.get(id) ?? null;
      if (sid) {
        mit += 1;
        // Eine Match-ID aus XMPP (oder der Sitzungssuche) geht vor.
        if (alt?.sessionId && alt.sessionId !== vonRest) continue;
        if (vonRest !== sid) {
          restPresence.funde += 1;
          restPresence.protokoll.push({ t: jetzt, id: id.slice(0, 8), sitzung: sid.slice(0, 8), playlist });
          if (restPresence.protokoll.length > 50) restPresence.protokoll.shift();
          log(`[bot] EOS-Status ${id}: ${vonRest ?? '-'} -> ${sid} (${playlist ?? '-'})`);
        }
        k.freunde.set(id, {
          sessionId: sid, zeile: zeile || alt?.zeile || 'Im Match', playlist: playlist ?? alt?.playlist ?? null, kills: kills ?? alt?.kills ?? null,
          seit: alt?.sessionId === sid ? alt.seit : jetzt, zuletzt: jetzt, online: true,
        });
        k.sitzungVonRest.set(id, sid); k.onlineVonRest.add(id);
        wechsel(id);
      } else {
        if (vonRest) k.sitzungVonRest.delete(id);
        const offenVonRest = vonRest && alt?.sessionId === vonRest;
        if (offenVonRest || !alt || alt.online === false || k.onlineVonRest.has(id)) {
          if (offenVonRest || !alt || alt.zeile !== zeile || !alt.online) {
            k.freunde.set(id, { ...(alt ?? {}), sessionId: offenVonRest ? null : alt?.sessionId ?? null, seit: offenVonRest ? null : alt?.seit ?? null, zeile, playlist, kills, zuletzt: jetzt, online: true });
            wechsel(id);
          }
          k.onlineVonRest.add(id);
        }
      }
    }
    // Nicht mehr in der Liste: was dieser Weg gesetzt hat, zuruecknehmen.
    for (const id of [...k.onlineVonRest]) {
      if (gesehen.has(id)) continue;
      k.onlineVonRest.delete(id);
      const vonRest = k.sitzungVonRest.get(id);
      k.sitzungVonRest.delete(id);
      const alt = k.freunde.get(id);
      if (alt && (alt.sessionId === vonRest || !alt.sessionId)) { k.freunde.set(id, { ...alt, sessionId: alt.sessionId === vonRest ? null : alt.sessionId, seit: null, online: false, zuletzt: jetzt }); wechsel(id); }
    }
    restPresence.mitSitzung = mit;
    restPresence.letzteRunde = jetzt;
  } catch (e) { restPresence.fehler += 1; restPresence.letzterFehler = e?.message ?? String(e); } finally { restLaeuft = false; }
}
setInterval(() => { void restPresenceHolen(); }, PRESENCE_MS);

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
    // online: Epic schickt einen Status nur, solange er eingeloggt ist - "unavailable" (oben) setzt es zurueck. zeile = was er gerade macht,
    // genau wie in Fortnites Freundesliste ("Battle Royale Lobby - 1 / 4", "1v1 Buildfights" ...), auch ohne Match-ID (Betreiber, 25.11.2026).
    sessionId: id, zeile: String(j.Status ?? ''), online: true,
    playlist: stats?.playlist && stats.playlist !== 'None' ? stats.playlist : null,
    kills: typeof stats?.numKills === 'number' ? stats.numKills : null,
    seit: id ? (alt?.sessionId === id ? alt.seit : jetzt) : null,
    zuletzt: jetzt,
  });
  wechsel(von, alt);
}

/*
 * Nur das Bot-Konto "comphub." (Betreiber, 23.11.2026): der Match-ID-Finder zeigt ausschliesslich die Freunde des Bot-Kontos - NICHT die des persoenlichen
 * Kontos des Betreibers ("haupt"), das er nicht mit hineingemischt haben will. Das Haupt-Konto bleibt verbunden (Statuszeile, Reserve), seine Freunde und
 * deren Match-IDs gehen aber nicht in den Finder.
 */
function botFreund(id) {
  return konten.bot.freunde.get(id) ?? null;
}
function alleFreunde() {
  const raus = {};
  for (const [id, f] of konten.bot.freunde) raus[id] = f;
  return raus;
}
const zuletztGemeldet = new Map();
function wechsel(id) {
  const f = botFreund(id);
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

/*
 * Neue Freunde des Bot-Kontos aufnehmen (Betreiber, 25.11.2026: Rax hatte "comphub." geaddet und war live im Game, stand aber 20+ Minuten nur
 * "gefunden ueber Standings" da). Epic schickt einer LAUFENDEN XMPP-Sitzung den Status eines neu hinzugekommenen Freundes nicht - erst eine neue
 * Sitzung bekommt ihn (beim Verbinden fragt der Server alle Freunde ab). Die Stille-Wache greift im vollen Cup nie, dort kommt dauernd Status-Verkehr.
 * Darum: erscheint in Epics Freundesliste (Bot-Konto alle 2 min, sofort nach jeder Annahme) eine neue Id, wird die Sitzung einmal frisch aufgebaut -
 * 1 s Pause, die bekannten Status bleiben im Speicher. Hoechstens alle 2 Minuten, damit mehrere Annahmen hintereinander nur einen Neuaufbau kosten.
 */
const LISTE_MS = { haupt: 9 * 60_000, bot: 110_000 };
const NEUAUFBAU_ABSTAND_MS = 2 * 60_000;
function freundeNeuAufnehmen(k, neu) {
  log(`[${k.name}] neue Freunde in Epics Liste: ${neu.map((i) => i.slice(0, 8)).join(', ')}`);
  if (k.neuaufbauUhr) return;
  const warte = Math.max(3_000, k.letzterNeuaufbau + NEUAUFBAU_ABSTAND_MS - Date.now());
  k.neuaufbauUhr = setTimeout(() => {
    k.neuaufbauUhr = null;
    // Ist die Sitzung inzwischen ohnehin getrennt, holt die naechste die neuen Freunde von selbst.
    if (!k.verbunden || k.aus) return;
    k.letzterNeuaufbau = Date.now();
    log(`[${k.name}] Sitzung neu aufbauen, damit Epic die Status der neuen Freunde schickt`);
    getrennt(k, 'neue Freunde');
  }, warte);
}

/** Epics Freundesliste des Kontos (ein Abruf) - damit der Admin auch die Freunde sieht, die gerade offline sind, und neue Freunde auffallen. */
async function listeHolen(k, erzwingen = false) {
  const abstand = LISTE_MS[k.name] ?? 9 * 60_000;
  if (!k.token || !k.konto || (!erzwingen && Date.now() - k.listeZeit < abstand)) return;
  k.listeZeit = Date.now();
  try {
    const r = await epicAbruf(k, `${FRIENDS}/friends/api/v1/${k.konto}/summary`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const ids = (j.friends ?? []).map((f) => String(f.accountId ?? '').replace(/-/g, '').toLowerCase()).filter((x) => HEX32.test(x));
    if (ids.length !== k.liste.size) log(`[${k.name}] Freundesliste: ${ids.length} Freunde`);
    // Der erste Abruf nach dem Start ist die Grundlage - die laufende Sitzung kennt diese Freunde schon.
    const neu = k.listeGeladen ? ids.filter((id) => !k.liste.has(id)) : [];
    k.liste = new Set(ids);
    k.listeGeladen = true;
    if (neu.length && k.name === 'bot') freundeNeuAufnehmen(k, neu);
  } catch (e) { log(`[${k.name}] Freundesliste nicht lesbar: ${e.message}`); k.listeZeit = Date.now() - abstand + 60_000; }
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
  if (u.pathname === '/diagnose') {
    const id = String(u.searchParams.get('id') ?? '').replace(/-/g, '').toLowerCase();
    if (!HEX32.test(id)) { res.writeHead(400).end(); return; }
    if (u.searchParams.get('versuch') === '1') void versuchStarten();
    void diagnose(id).then((d) => res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(d)))
      .catch((e) => res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ fehler: e?.message ?? String(e) })));
    return;
  }
  if (u.pathname === '/freunde') {
    const alle = u.searchParams.get('alle') === '1';
    // Nur die Freundesliste des Bot-Kontos "comphub." - nicht die des persoenlichen Kontos des Betreibers (bot-only, 23.11.2026).
    const extra = alle ? { liste: [...konten.bot.liste], verlauf: verlaufAls() } : {};
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ status: status(), freunde: alleFreunde(), ...extra }));
    return;
  }
  if (u.pathname === '/verlauf') {
    const ids = (u.searchParams.get('ids') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => HEX32.test(x));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ verlauf: verlaufAls(ids.length ? ids : null) }));
    return;
  }
  if (u.pathname === '/freigaben') {
    if (req.method === 'POST') {
      let roh = '';
      req.on('data', (c) => { roh += c; if (roh.length > 200_000) req.destroy(); });
      req.on('end', () => {
        let j;
        try { j = JSON.parse(roh || '{}'); } catch { res.writeHead(400).end(); return; }
        void freigabenSetzen(j).then(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, anzahl: freigaben.size })));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ids: [...freigaben] }));
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
  for (const k of Object.values(konten)) { k.aus = true; aufraeumen(k); sitzungZu(k.token); if (k.rest !== k.token) sitzungZu(k.rest); }
  for (const res of leser) { try { res.end(); } catch { /* egal */ } }
  // Den Verlauf noch sichern (sonst fehlt nach dem Neustart bis zu einer Minute).
  if (verlaufGeaendert) void fs.mkdir(DATEN, { recursive: true }).then(() => fs.writeFile(VERLAUF_DATEI, JSON.stringify(Object.fromEntries(verlauf)))).catch(() => {});
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGTERM', () => ende('SIGTERM'));
process.on('SIGINT', () => ende('SIGINT'));

await verlaufLaden();

/*
 * Anfragen annehmen, die ein Streamer/Pro SELBST an das Bot-Konto geschickt hat (lib/freundAnnahme.mjs) - nur fuer freigegebene Epic-Ids.
 * Die Liste fuehrt der Admin im Match-ID-Finder (lib/matchIdFreigaben, Ablage matchid-freigaben.json); die Seite schickt sie bei jedem Aendern und bei
 * jedem Verbinden mit dem Strom hierher (POST /freigaben) - hier liegt sie im Speicher und in <daten>/matchid-freigaben.json (fuer einen Neustart).
 * Leere Liste: nichts wird angenommen. Der Bot schickt weiterhin niemandem eine Anfrage (#21).
 */
const ANNAHME_MS = Number(process.env.FREUND_ANNAHME_S || 120) * 1000;
const FREIGABEN_DATEI = path.join(DATEN, 'matchid-freigaben.json');
let freigaben = new Set();
try { freigaben = freigabenAus(JSON.parse(await fs.readFile(FREIGABEN_DATEI, 'utf8'))); log(`Freigaben geladen: ${freigaben.size}`); } catch { /* noch keine */ }
async function freigabenSetzen(roh) {
  freigaben = freigabenAus(roh);
  await fs.mkdir(DATEN, { recursive: true }).then(() => fs.writeFile(FREIGABEN_DATEI, JSON.stringify({ ids: [...freigaben] }))).catch((e) => log(`Freigaben nicht geschrieben: ${e.message}`));
  log(`Freigaben gesetzt: ${freigaben.size}`);
  void annahme();
}
let annahmeLaeuft = false;
async function annahme() {
  const k = konten.bot;
  if (annahmeLaeuft || !freigaben.size || !k.verbunden || !k.token || !k.konto) return;
  annahmeLaeuft = true;
  try {
    const r = await annahmeDurchgang({ konto: k.konto, token: await restToken(k), freigaben, basis: `${FRIENDS}/friends/api/v1` });
    if (String(r.fehler ?? '').includes('401')) void restToken(k, true).catch(() => {});
    if (r.angenommen.length || r.fehler) log(`[bot] Anfragen: ${r.angenommen.length} angenommen (${r.angenommen.join(', ')}), ${r.liegen} liegen${r.fehler ? `, Fehler: ${r.fehler}` : ''}`);
    // Neu angenommen: gleich die Liste nachziehen - die neuen Freunde fuehren dann zum Neuaufbau der Sitzung (freundeNeuAufnehmen).
    if (r.angenommen.length) void listeHolen(k, true);
  } catch (e) { log(`[bot] Annahme: ${e?.message ?? e}`); } finally { annahmeLaeuft = false; }
}
setInterval(() => { void annahme(); }, ANNAHME_MS);

for (const k of Object.values(konten)) void verbinde(k);
