// Freundschaftsanfragen vom Bot-Konto der Seite ("comphub.", data/epic-auth-bot.json) an die Pros des Tools - und der Stand, wer angenommen hat.
//
// Warum: Epic gibt die laufende Match-ID eines Spielers nur an seine Freunde heraus (getestet 7.11.2026: Sitzungssuche leer, liveSessions leer,
// Turnier-Verlauf 403 "profile:<id>:commands READ"). Der Betreiber (7.11.2026): "Schick an alle Pros, die du kennst von meinem Tool ... jeden einzelnen
// Anfrage ... und mal gucken, wie viel annehmen ... auf Discord eine Liste".
//
// Gedrosselt (eine Anfrage alle 4 Sekunden, bei 429 eine Minute Pause): viele Anfragen in kurzer Zeit wertet Epic sonst als Spam.
// Der Stand liegt in data/bot-freunde.json: je Konto { name, status, zeit, grund }.
//
//   node scripts/bot-freunde.mjs --senden          an alle, die noch keine Anfrage bekommen haben
//   node scripts/bot-freunde.mjs --stand           wer angenommen hat, wer offen ist, wer abgelehnt hat oder keine Anfragen annimmt

import fs from 'node:fs';
import path from 'node:path';

const DATEN = path.join(process.cwd(), 'data');
const AUTH = path.join(DATEN, 'epic-auth-bot.json');
const STAND = path.join(DATEN, 'bot-freunde.json');
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const FREUNDE = 'https://friends-public-service-prod.ol.epicgames.com/friends/api/v1';
const BASIC = 'basic ' + Buffer.from('3f69e56c7649492c8cc29f1af08a8a12:b51ee9cb12234f50a69efa67ef53812e').toString('base64');
const warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
const liesDatei = (p, ersatz) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return ersatz; } };

const auth = liesDatei(AUTH, null);
if (!auth?.accountId) { console.log('Kein Bot-Konto - erst epic-bot-anmelden.cmd ausfuehren.'); process.exit(1); }

let token = null;
async function anmelden() {
  const r = await fetch(`${ACCOUNT}/account/api/oauth/token`, {
    method: 'POST', headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'device_auth', account_id: auth.accountId, device_id: auth.deviceId, secret: auth.secret }),
  });
  if (!r.ok) throw new Error(`Anmeldung des Bots: HTTP ${r.status}`);
  token = (await r.json()).access_token;
}
async function abmelden() {
  if (!token) return;
  await fetch(`${ACCOUNT}/account/api/oauth/sessions/kill/${token}`, { method: 'DELETE', headers: { Authorization: `bearer ${token}` } }).catch(() => {});
  token = null;
}

/** Die Pros des Tools mit Epic-Konto (spieler-profile.json vom Release) - dazu, wer dort fehlt, aber bekannt ist. */
async function pros() {
  const r = await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-profile.json', { redirect: 'follow' });
  const p = r.ok ? await r.json() : liesDatei(path.join(DATEN, 'spieler-profile.json'), {});
  const raus = new Map();
  for (const [k, v] of Object.entries(p)) {
    const id = /^[0-9a-f]{32}$/.test(k) ? k : String(v?.id ?? v?.epicId ?? '');
    if (/^[0-9a-f]{32}$/.test(id)) raus.set(id, String(v.anzeige || v.name || id));
  }
  // Clix steht nicht in den Profilen, ist aber Favorit im Match-Finder (Konto aus lan-preisgelder.json).
  raus.set('3736de3c0eb043649fac15ec1025ff08', 'Clix');
  return raus;
}

const stand = liesDatei(STAND, {});
const speichern = () => fs.writeFileSync(STAND, JSON.stringify(stand, null, 1));

if (process.argv.includes('--senden')) {
  const liste = await pros();
  await anmelden();
  try {
    let n = 0;
    const hoechstens = Number(process.argv[process.argv.indexOf("--hoechstens") + 1]) || Infinity;
    for (const [id, name] of liste) {
      if (stand[id]?.status && stand[id].status !== "fehler") continue;
      if (n >= hoechstens) break;
      for (let versuch = 0; versuch < 3; versuch += 1) {
        const r = await fetch(`${FREUNDE}/${auth.accountId}/friends/${id}`, { method: 'POST', headers: { Authorization: `bearer ${token}` } });
        if (r.status === 429) { console.log('  429 - eine Minute Pause'); await warte(60_000); continue; }
        if (r.status === 401) { await anmelden(); continue; }
        const j = r.status === 204 ? null : await r.json().catch(() => null);
        const code = String(j?.errorCode ?? '');
        const status = r.ok ? 'gesendet'
          : /already_sent|duplicate/i.test(code) ? 'gesendet'
          : /already_friends|friendship_exists/i.test(code) ? 'freund'
          : /target_settings|not_accepting|restricted|privacy/i.test(code) ? 'nimmt nicht an'
          : 'fehler';
        stand[id] = { name, status, zeit: new Date().toISOString(), ...(status === 'fehler' || status === 'nimmt nicht an' ? { grund: code || `HTTP ${r.status}` } : {}) };
        break;
      }
      n += 1;
      if (n % 10 === 0) { speichern(); console.log(`  ${n} / ${liste.size}`); }
      await warte(4000);
    }
    speichern();
  } finally { await abmelden(); }
}

if (process.argv.includes('--stand') || process.argv.includes('--senden')) {
  await anmelden();
  try {
    const r = await fetch(`${FREUNDE}/${auth.accountId}/summary`, { headers: { Authorization: `bearer ${token}` } });
    const s = await r.json();
    const freunde = new Set((s.friends ?? []).map((f) => f.accountId));
    const offen = new Set((s.outgoing ?? []).map((f) => f.accountId));
    for (const [id, e] of Object.entries(stand)) {
      if (freunde.has(id)) e.status = 'freund';
      else if (e.status === 'gesendet' && !offen.has(id)) e.status = 'abgelehnt';
    }
    speichern();
    const zaehl = {};
    for (const e of Object.values(stand)) zaehl[e.status] = (zaehl[e.status] ?? 0) + 1;
    console.log(JSON.stringify(zaehl));
  } finally { await abmelden(); }
}
