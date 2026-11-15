/*
 * Der Ergebnis-Post binnen einer Minute nach dem Ende eines Spieltags (Betreiber, 15.11.2026) - der Dienst "ergebnis" in deploy/server-compose.yml.
 *
 * Fragt /api/cron/ergebnis-sofort bei "web" (lib/ergebnisSofort.ts entscheidet, ob ein Spieltag fertig ist, und baut den Text) - alle 15 Sekunden,
 * solange ein Spieltag laeuft oder gerade endete, sonst jede Minute. Ist einer fertig:
 *   1. das Bild (lib/ftBild.ts, derselbe Stil wie die Results-Karte in /admin/tweets) im kopflosen Chromium zeichnen,
 *   2. nach #admin-posts: 🔔-Ping an den Betreiber (ERGEBNIS_PING_DISCORD_ID), darunter der fertige Text samt Bild zum Kopieren nach X,
 *   3. nach #results: die ersten zehn als Einbettung mit dem Bild (Fuss "result:<windowId>" - so ueberspringt scripts/ergebnisse-discord.mjs ihn),
 *   4. zurueckmelden (POST) - der Spieltag steht in ergebnis-sofort.json und kommt nie wieder.
 * Nie nach X.
 *
 *   node scripts/ergebnis-sofort.mjs [http://127.0.0.1:3100] --anwenden          Dauerlauf (Dienst)
 *   node scripts/ergebnis-sofort.mjs --einmal                                     ein Lauf, nur zeigen
 *   node scripts/ergebnis-sofort.mjs --probe <windowId> [--bild datei.png]        Trockenlauf fuer einen Spieltag (fertig oder nicht), nichts gepostet
 *
 * Kanaele werden ueber den Namen gefunden (ohne Emoji vorne, wie scripts/discord-tweets.mjs): admin-posts und results.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const WEB = (process.argv.find((a) => /^https?:\/\//.test(a)) || U.WERKZEUG_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SCHLUESSEL = (U.CRON_SECRET || U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
const PING = (U.ERGEBNIS_PING_DISCORD_ID || '').trim();
const ANWENDEN = process.argv.includes('--anwenden');
const EINMAL = process.argv.includes('--einmal');
const PROBE = arg('--probe');
const BILD_DATEI = arg('--bild');
const API = 'https://discord.com/api/v10';
const SEITE = 'https://www.thecomphub.com';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zeit = () => new Date().toISOString().slice(11, 19);

async function ruf(weg, methode = 'GET', koerper, dateien) {
  for (let versuch = 0; versuch < 6; versuch += 1) {
    let body; const headers = { Authorization: `Bot ${TOKEN}` };
    if (dateien?.length) {
      body = new FormData();
      body.append('payload_json', JSON.stringify(koerper ?? {}));
      dateien.forEach((d, i) => body.append(`files[${i}]`, new Blob([d.daten], { type: 'image/png' }), d.name));
    } else if (koerper) { body = JSON.stringify(koerper); headers['Content-Type'] = 'application/json'; }
    const r = await fetch(`${API}${weg}`, { method: methode, headers, body });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await warte(Math.ceil((j.retry_after ?? 2) * 1000) + 250); continue; }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${methode} ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error(`${methode} ${weg}: zu oft gedrosselt`);
}

async function frage(weg, init = {}) {
  const r = await fetch(`${WEB}${weg}`, {
    ...init, headers: { Authorization: `Bearer ${SCHLUESSEL}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${weg}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

/* ------------------------------------------------------------------ Das Bild: lib/ftBild.ts im kopflosen Chromium, Bilder von "web" (dieselbe Herkunft). */
let browser = null; let ftBildJs = null; let ohneBild = false;
async function bildZeichnen(spieler) {
  if (ohneBild || !spieler?.length) return null;
  try {
    if (!ftBildJs) {
      const ts = (await import('typescript')).default;
      ftBildJs = ts.transpileModule(fs.readFileSync(path.join(PROJEKT, 'lib/ftBild.ts'), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    }
    if (!browser) { const { chromium } = await import('playwright'); browser = await chromium.launch({ args: ['--no-sandbox'] }); }
    const seite = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Inter:wght@500;700;900&display=block">
</head><body style="margin:0;background:#000;font-family:Inter,Arial,sans-serif"><canvas id="c"></canvas>
<script type="module">
import { ftBildZeichnen } from '/__ergebnis/ftBild.js';
const spieler = ${JSON.stringify(spieler)};
const c = document.getElementById('c');
ftBildZeichnen(c, spieler, { schrift: "Inter, Arial, sans-serif", anzeige: "'Bricolage Grotesque', Inter, Arial, sans-serif" })
  .then(() => { window.__fertig = c.toDataURL('image/png'); }).catch((e) => { window.__fehler = String(e); });
</script></body></html>`;
      await seite.route(`${WEB}/__ergebnis/**`, (r) => {
        const u = r.request().url();
        if (u.endsWith('/ftBild.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: ftBildJs });
        return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      });
      await seite.goto(`${WEB}/__ergebnis/bild`, { waitUntil: 'load', timeout: 30_000 });
      await seite.waitForFunction(() => window.__fertig || window.__fehler, null, { timeout: 30_000 });
      const fehler = await seite.evaluate(() => window.__fehler);
      if (fehler) throw new Error(fehler);
      const url = await seite.evaluate(() => window.__fertig);
      return Buffer.from(String(url).split(',')[1], 'base64');
    } finally { await seite.close().catch(() => {}); }
  } catch (e) {
    console.log(zeit(), 'Bild nicht gezeichnet:', e.message.split('\n')[0]);
    if (/Executable doesn't exist|Cannot find (module|package)|browserType.launch/i.test(e.message)) ohneBild = true;
    return null;
  }
}

/* ------------------------------------------------------------------ Discord */
const kern = (s) => { const k = String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim(); return k === 'comphub-updates' ? 'updates' : k; };
let kanalVorrat = null;
async function kanaele() {
  if (kanalVorrat && Date.now() - kanalVorrat.zeit < 30 * 60_000) return kanalVorrat;
  const liste = await ruf(`/guilds/${SERVER}/channels`);
  const finde = (n) => liste.find((k) => (k.type === 0 || k.type === 5) && kern(k.name) === n);
  kanalVorrat = { zeit: Date.now(), admin: finde('admin-posts'), results: finde('results') };
  return kanalVorrat;
}

/** Nie doppelt, auch wenn die Ablage einmal nicht schreibt: was in den letzten 50 Nachrichten von #results schon steht, kommt nicht noch einmal. */
async function schonImKanal(kanalId, windowId) {
  const n = await ruf(`/channels/${kanalId}/messages?limit=50`).catch(() => []);
  return n.some((m) => (m.embeds ?? []).some((e) => e.footer?.text === `result:${windowId}`));
}

async function posten(p, bild) {
  const k = await kanaele();
  if (!k.admin) throw new Error('#admin-posts fehlt');
  const datei = bild ? [{ name: `${p.windowId}.png`, daten: bild }] : [];
  // 1. Der Ping - eine eigene Nachricht, damit der Text darunter ohne Erwaehnung kopiert werden kann.
  await ruf(`/channels/${k.admin.id}/messages`, 'POST', {
    content: `🔔 ${PING ? `<@${PING}> ` : ''}**Results ready** – ${p.titel.replace(/^🏆\s*/, '')} (${p.grund})\nCopy the text below to X 👇`,
    allowed_mentions: { users: PING ? [PING] : [] },
  });
  // 2. Der Text genau so, wie er nach X geht (Discord-Grenze 2000 Zeichen - laenger wird an Leerzeilen geteilt), das Bild an der ersten Nachricht.
  const teile = [];
  let rest = p.text;
  while (rest.length > 1990) { const i = rest.lastIndexOf('\n\n', 1990); const schnitt = i > 200 ? i : 1990; teile.push(rest.slice(0, schnitt)); rest = rest.slice(schnitt).replace(/^\n+/, ''); }
  teile.push(rest);
  for (let i = 0; i < teile.length; i += 1) {
    await ruf(`/channels/${k.admin.id}/messages`, 'POST', { content: teile[i], allowed_mentions: { parse: [] }, flags: 4 }, i === 0 ? datei : []);
  }
  // 3. #results - oeffentlich.
  if (k.results && !(await schonImKanal(k.results.id, p.windowId))) {
    const zeile = p.text.split('\n');
    const kopf = zeile[0].replace(/^🏆\s*/, '');
    const qualiTeil = /Qualified for the/.test(zeile[0]) ? zeile.slice(2).filter((z) => z && !/^Full results/.test(z)).join('\n') : p.zeilen.join('\n');
    await ruf(`/channels/${k.results.id}/messages`, 'POST', {
      embeds: [{
        title: `🏆 ${kopf}`.slice(0, 256),
        url: `${SEITE}/events/${encodeURIComponent(p.cupId)}?region=${encodeURIComponent(p.region)}`,
        description: `${qualiTeil}\n\nFull results on [CompHub](${SEITE}/events/${encodeURIComponent(p.cupId)}?region=${encodeURIComponent(p.region)})`.slice(0, 4000),
        color: 0x0ea5e9,
        footer: { text: `result:${p.windowId}` },
        ...(p.end ? { timestamp: new Date(Math.min(p.end, Date.now())).toISOString() } : {}),
        ...(bild ? { image: { url: `attachment://${p.windowId}.png` } } : {}),
      }],
      allowed_mentions: { parse: [] },
    }, datei);
  }
}

/* ------------------------------------------------------------------ Lauf */
async function lauf() {
  if (PROBE) {
    // --datei: die Antwort aus scripts/ergebnis-sofort-probe.mjs --json (ohne laufende Seite, z. B. im GitHub-Ablauf).
    const j = arg('--datei') ? JSON.parse(fs.readFileSync(arg('--datei'), 'utf8')) : await frage(`/api/cron/ergebnis-sofort?probe=${encodeURIComponent(PROBE)}`);
    for (const p of j.posts ?? []) {
      console.log(`--- ${p.windowId} (${p.region}) · ${p.bild?.length ?? 0} Fotos\n${p.text}\n`);
      if (BILD_DATEI) { const b = await bildZeichnen(p.bild); if (b) { fs.writeFileSync(BILD_DATEI, b); console.log('Bild:', BILD_DATEI, b.length, 'Bytes'); } }
    }
    if (!(j.posts ?? []).length) console.log('Kein Post gebaut (Spieltag nicht im Katalog oder Bestenliste leer).', JSON.stringify(j.beobachtet));
    return 0;
  }
  const j = await frage('/api/cron/ergebnis-sofort');
  for (const b of j.beobachtet ?? []) if (!b.grund) console.log(zeit(), 'laeuft', b.windowId, `${b.spiele}/${b.cap || '?'} Spiele`);
  for (const p of j.posts ?? []) {
    console.log(zeit(), ANWENDEN ? 'POSTE' : '[nur zeigen]', p.windowId, p.grund, `\n${p.text}`);
    if (!ANWENDEN) continue;
    const bild = await bildZeichnen(p.bild);
    try {
      await posten(p, bild);
      await frage('/api/cron/ergebnis-sofort', { method: 'POST', body: JSON.stringify({ schluessel: p.schluessel, grund: p.grund, text: p.text }) });
      console.log(zeit(), 'gepostet', p.windowId, bild ? 'mit Bild' : 'ohne Bild');
    } catch (e) { console.log(zeit(), 'Fehler beim Posten', p.windowId, e.message); }
  }
  return j.eng ? 15_000 : 60_000;
}

if (ANWENDEN && !TOKEN) { console.error('DISCORD_BOT_TOKEN fehlt.'); process.exit(1); }
if (!SCHLUESSEL && !arg('--datei')) { console.error('CRON_SECRET / DISCORD_BOT_TOKEN fehlt.'); process.exit(1); }
if (PROBE || EINMAL) {
  await lauf().catch((e) => { console.error(e.message); process.exitCode = 1; });
  await browser?.close().catch(() => {});
} else {
  console.log(zeit(), `Ergebnis-Dienst gegen ${WEB}${ANWENDEN ? '' : ' (nur zeigen)'}${PING ? ' · Ping an Betreiber' : ' · ohne Ping (ERGEBNIS_PING_DISCORD_ID fehlt)'}`);
  for (;;) {
    let pause = 30_000;
    try { pause = await lauf(); } catch (e) { console.log(zeit(), 'Lauf fehlgeschlagen:', e.message); }
    await warte(pause);
  }
}
