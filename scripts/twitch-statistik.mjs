// Die Twitch-Statistik der VIPs sammeln - als Dauerlauf in einem GitHub-Auftrag (.github/workflows/twitch-statistik.yml).
//
// Der Betreiber (27.10.2026): "eine Art Twitch daily/weekly/month/year/all time Recap - wie seine Stats waren, bester Peak mit/ohne Raid, wie viele neue
// Follower, Chatter usw., einfach Statistics fuer VIPs, wenn ich denen das gebe". Welche Kanaele, legt der Admin auf /twitch-statistik fest
// (twitch-kanaele.json im privaten Datenarchiv, geschrieben nur von der Seite).
//
// Alles ohne Anmeldung des Streamers:
//   - Zuschauer, Titel, Spiel: Twitch Helix /streams, jede Minute (App-Zugang)
//   - Follower gesamt: Helix /channels/followers (nur die Summe), alle zehn Minuten - neue Follower = Unterschied der Tagesstaende
//   - Chatter und Raids: der Chat, anonym gelesen (IRC als "justinfan"): wer schreibt (eindeutige Konten je Stream), eingehende Raids mit Zuschauerzahl
// Gezaehlt wird ab dem Tag, an dem ein Kanal eingetragen wurde - Twitch gibt keine Vergangenheit heraus.
//
// Je Kanal eine Datei twitch-statistik/<Twitch-Id>.json, geschrieben nur von diesem Lauf und alle zehn Minuten ins Archiv geladen. Ein Stream, der ueber
// das Ende eines Auftrags hinaus laeuft, wird vom naechsten fortgesetzt (gleiche Stream-Kennung).
//
//   node scripts/twitch-statistik.mjs [--minuten 330]
//   node scripts/twitch-statistik.mjs --probe <login> --minuten 3     nur dieser Kanal, ohne Archiv, Dateien im Temp-Ordner (zum Pruefen)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const arg = process.argv.slice(2);
const PROBE = arg.includes('--probe') ? String(arg[arg.indexOf('--probe') + 1] ?? '').toLowerCase() : '';
const PROJEKT = process.cwd();
const DATEN = PROBE ? path.join(os.tmpdir(), 'twitch-statistik-probe') : path.join(PROJEKT, 'data');
const ORDNER = path.join(DATEN, 'twitch-statistik');
const KANAELE = path.join(DATEN, 'twitch-kanaele.json');
if (PROBE) { fs.mkdirSync(DATEN, { recursive: true }); fs.writeFileSync(KANAELE, JSON.stringify({ kanaele: [{ login: PROBE, vips: [], vipName: 'Probe', seit: Date.now() }] })); }
const MINUTEN = Number(arg[arg.indexOf('--minuten') + 1]) || 330;
const TAKT_MS = 60_000;
const ENDE = Date.now() + MINUTEN * 60_000;

const U = (() => {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_0-9]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* nur Umgebung */ }
  return { ...raus, ...process.env };
})();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const sync = (...args) => {
  if (PROBE) return;
  const r = spawnSync(process.execPath, [path.join('scripts', 'daten-sync.mjs'), ...args], { encoding: 'utf8', env: process.env });
  const zeile = String(r.stdout ?? '').trim().split('\n').pop();
  if (zeile) console.log(`  Archiv: ${zeile}`);
};

/* ------------------------------------------------------------------ Twitch Helix */

let appToken = '';
async function helix(weg) {
  for (let versuch = 0; versuch < 2; versuch += 1) {
    if (!appToken) {
      const t = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: U.TWITCH_CLIENT_ID ?? '', client_secret: U.TWITCH_CLIENT_SECRET ?? '', grant_type: 'client_credentials' }),
      }).then((r) => r.json()).catch(() => null);
      appToken = t?.access_token ?? '';
      if (!appToken) throw new Error('Twitch: kein App-Zugang');
    }
    const r = await fetch(`https://api.twitch.tv/helix/${weg}`, {
      headers: { 'Client-ID': U.TWITCH_CLIENT_ID ?? '', Authorization: `Bearer ${appToken}` }, signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) { appToken = ''; continue; }
    if (!r.ok) throw new Error(`Twitch ${weg.split('?')[0]}: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error('Twitch: Zugang abgelehnt');
}

/* ------------------------------------------------------------------ Dateien */

const dateiVon = (id) => path.join(ORDNER, `${id}.json`);
const stand = new Map();
function lies(k) {
  if (stand.has(k.id)) return stand.get(k.id);
  let d = null;
  try { d = JSON.parse(fs.readFileSync(dateiVon(k.id), 'utf8')); } catch { /* neu */ }
  d ??= { id: k.id, login: k.login, name: k.name ?? k.login, follower: [], streams: [] };
  d.login = k.login;
  stand.set(k.id, d);
  return d;
}
function schreibeAlle() {
  fs.mkdirSync(ORDNER, { recursive: true });
  for (const d of stand.values()) {
    // Die Chatter-Kennungen nur fuer laufende Streams (damit der naechste Auftrag weiterzaehlen kann); beendete tragen nur die Zahl.
    const kopie = { ...d, streams: d.streams.slice(-400).map((s) => (s.ende ? s : { ...s, chatterIds: [...(chatter.get(s.id) ?? new Set(s.chatterIds ?? []))] })) };
    fs.writeFileSync(dateiVon(d.id), JSON.stringify(kopie));
  }
}

/* ------------------------------------------------------------------ Chat (anonym) */

const chatter = new Map(); // Stream-Kennung -> Set der Konten, die geschrieben haben
const kanalStream = new Map(); // Login -> laufender Stream (Objekt in der Datei)
let ws = null; let verbunden = false;
const beigetreten = new Set();

function chatVerbinden() {
  if (typeof WebSocket === 'undefined') { console.log('  Chat: kein WebSocket in dieser Node-Fassung'); return; }
  ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  ws.addEventListener('open', () => {
    verbunden = true; beigetreten.clear();
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ws.send('PASS SCHMOOPIIE');
    ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
    for (const login of kanalStream.keys()) beitreten(login);
  });
  ws.addEventListener('message', (ev) => {
    for (const zeile of String(ev.data).split('\r\n')) {
      if (!zeile) continue;
      if (zeile.startsWith('PING')) { ws.send(zeile.replace('PING', 'PONG')); continue; }
      const m = /^(?:@(\S+) )?:\S+ (PRIVMSG|USERNOTICE) #(\w+)/.exec(zeile);
      if (!m) continue;
      const tags = Object.fromEntries((m[1] ?? '').split(';').map((t) => { const i = t.indexOf('='); return [t.slice(0, i), t.slice(i + 1)]; }));
      const s = kanalStream.get(m[3].toLowerCase());
      if (!s) continue;
      if (m[2] === 'PRIVMSG') {
        const wer = tags['user-id'];
        if (wer) { let set = chatter.get(s.id); if (!set) { set = new Set(s.chatterIds ?? []); chatter.set(s.id, set); } set.add(wer); }
        s.nachrichten = (s.nachrichten ?? 0) + 1;
      } else if (tags['msg-id'] === 'raid') {
        s.raids ??= [];
        s.raids.push({ von: (tags['msg-param-displayName'] ?? tags['msg-param-login'] ?? '').replace(/\\s/g, ' '), zuschauer: Number(tags['msg-param-viewerCount']) || 0, zeit: new Date().toISOString() });
        console.log(`  Raid auf ${m[3]}: ${tags['msg-param-viewerCount']} von ${tags['msg-param-login']}`);
      }
    }
  });
  ws.addEventListener('close', () => { verbunden = false; ws = null; setTimeout(() => { if (Date.now() < ENDE) chatVerbinden(); }, 5_000); });
  ws.addEventListener('error', () => { /* close folgt */ });
}
function beitreten(login) { if (verbunden && !beigetreten.has(login)) { ws.send(`JOIN #${login}`); beigetreten.add(login); } }
function verlassen(login) { if (verbunden && beigetreten.has(login)) { ws.send(`PART #${login}`); beigetreten.delete(login); } }

/* ------------------------------------------------------------------ Lauf */

function liesKanaele() {
  try { return (JSON.parse(fs.readFileSync(KANAELE, 'utf8')).kanaele ?? []).filter((k) => /^[a-z0-9_]{3,25}$/i.test(k.login ?? '')); } catch { return []; }
}

async function durchgang(n) {
  if (n % 10 === 0) sync('--herunterladen', '--nur', 'twitch-kanaele.json');
  const kanaele = liesKanaele();
  if (!kanaele.length) { if (n % 10 === 0) console.log('  Keine Kanaele eingetragen.'); return; }
  // Kennungen nachschlagen, wo der Admin nur den Namen eingetragen hat.
  const ohneId = kanaele.filter((k) => !k.id);
  for (let i = 0; i < ohneId.length; i += 100) {
    const j = await helix(`users?${ohneId.slice(i, i + 100).map((k) => `login=${encodeURIComponent(k.login)}`).join('&')}`);
    for (const u of j.data ?? []) for (const k of ohneId) if (k.login.toLowerCase() === u.login) { k.id = u.id; k.name = u.display_name; }
  }
  const mitId = kanaele.filter((k) => k.id);
  const live = new Map();
  for (let i = 0; i < mitId.length; i += 100) {
    const j = await helix(`streams?first=100&${mitId.slice(i, i + 100).map((k) => `user_id=${k.id}`).join('&')}`);
    for (const s of j.data ?? []) live.set(s.user_id, s);
  }
  const jetzt = Date.now();
  for (const k of mitId) {
    const d = lies(k);
    const s = live.get(k.id);
    const offen = d.streams.find((x) => !x.ende);
    if (offen && (!s || s.id !== offen.id)) {
      // Zu Ende: die Chatter auf ihre Zahl verdichten.
      offen.ende = offen.verlauf?.length ? new Date(Date.parse(offen.start) + offen.verlauf[offen.verlauf.length - 1][0] * 60_000).toISOString() : new Date().toISOString();
      offen.chatter = (chatter.get(offen.id) ?? new Set(offen.chatterIds ?? [])).size;
      delete offen.chatterIds; chatter.delete(offen.id);
      kanalStream.delete(k.login.toLowerCase()); verlassen(k.login.toLowerCase());
      console.log(`  ${k.login}: Stream zu Ende (${offen.verlauf?.length ?? 0} Minuten, ${offen.chatter} Chatter)`);
    }
    if (s) {
      let st = d.streams.find((x) => x.id === s.id);
      if (!st) { st = { id: s.id, start: s.started_at, ende: null, titel: s.title, spiel: s.game_name, verlauf: [], raids: [], nachrichten: 0 }; d.streams.push(st); console.log(`  ${k.login}: live`); }
      st.ende = null; st.titel = s.title; st.spiel = s.game_name;
      const minute = Math.max(0, Math.round((jetzt - Date.parse(s.started_at)) / 60_000));
      const letzte = st.verlauf[st.verlauf.length - 1];
      if (!letzte || letzte[0] !== minute) st.verlauf.push([minute, s.viewer_count]);
      kanalStream.set(k.login.toLowerCase(), st); beitreten(k.login.toLowerCase());
    }
  }
  // Alle zehn Minuten: Follower-Summe (Tagesstand) und alles ins Archiv.
  if (n % (PROBE ? 2 : 10) === 0) {
    const tag = new Date().toISOString().slice(0, 10);
    for (const k of mitId) {
      try {
        const j = await helix(`channels/followers?broadcaster_id=${k.id}&first=1`);
        if (typeof j.total !== 'number') continue;
        const d = lies(k);
        const i = d.follower.findIndex((f) => f[0] === tag);
        if (i >= 0) d.follower[i] = [tag, j.total]; else d.follower.push([tag, j.total]);
      } catch (e) { console.log(`  Follower ${k.login}: ${e.message}`); }
    }
    schreibeAlle();
    sync('--nur', 'twitch-statistik');
  }
}

if (!U.TWITCH_CLIENT_ID || !U.TWITCH_CLIENT_SECRET) { console.log('TWITCH_CLIENT_ID/SECRET fehlen.'); process.exit(0); }
// Ohne eingetragene Kanaele gleich wieder aus: der Auftrag belegte sonst stundenlang einen der zwanzig Plaetze, die GitHub gleichzeitig laufen laesst.
// Der Ablauf stoesst dann keinen naechsten an; das Eintragen auf der Seite startet ihn wieder (app/api/twitch-statistik).
sync('--herunterladen', '--nur', 'twitch-kanaele.json');
const anfangs = liesKanaele().length;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `kanaele=${anfangs}\n`);
if (!anfangs) { console.log('Keine Kanaele eingetragen - nichts zu sammeln.'); process.exit(0); }
sync('--herunterladen', '--nur', 'twitch-statistik');
chatVerbinden();
let n = 0;
while (Date.now() < ENDE) {
  const t0 = Date.now();
  try { await durchgang(n); } catch (e) { console.log(`  Durchgang ${n + 1}: ${e.message}`); }
  n += 1;
  await warte(Math.max(1_000, TAKT_MS - (Date.now() - t0)));
}
schreibeAlle();
sync('--nur', 'twitch-statistik');
try { ws?.close(); } catch { /* egal */ }
console.log(`Ende nach ${n} Durchgaengen.`);
process.exit(0);
