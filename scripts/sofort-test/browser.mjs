/*
 * Sofort-Test, Teil Browser: echte Seite in Chrome (Playwright), Zeit von "Server hat den neuen Stand" bis zur Zahl im DOM.
 *
 *   node scripts/sofort-test/browser.mjs <seite> <epic> <pfad=/events/S99_TestCup> [runden=8] [modus=strom|fallback]
 *
 * modus=matches oeffnet den Matches-Reiter und misst Server-Stand -> fertige Antwort von /api/cup-matches (danach zeichnet React im selben Takt).
 * modus=neustart: zwischen den Runden wird der Server neu gestartet (Skript-Argument 6: Befehl) - die Seite muss von selbst wieder anhaengen.
 * modus=fallback sperrt /api/live/stream im Browser (Fehler) - dann muss die Seite mit dem alten Takt weiterlaufen.
 */
import { chromium } from 'playwright';
import http from 'http';
import { execSync, spawn } from 'child_process';

const [SEITE, EPIC, PFAD = '/events/S99_TestCup', RUNDEN = '8', MODUS = 'strom'] = process.argv.slice(2);
const fertig = [];
const EVENT = 'S99_TestCup_EU', WINDOW = 'S99_TestCup_Heat1_EU';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, min: s[0], p50: s[Math.floor(s.length / 2)], max: s[s.length - 1], mittel: Math.round(s.reduce((a, b) => a + b, 0) / (s.length || 1)) }; };

// Ein Mithoerer auf demselben Strom: wann der Server den Stand hatte (stand.zeit).
const staende = new Map();
http.get(`${SEITE}/api/live/stream?event=${EVENT}&window=${WINDOW}&what=leaderboard`, (res) => {
  let p = '';
  res.setEncoding('utf8');
  res.on('data', (c) => { p += c; let i; while ((i = p.indexOf('\n\n')) >= 0) { const b = p.slice(0, i); p = p.slice(i + 2); const d = /data: (.*)/.exec(b)?.[1]; if (/event: leaderboard/.test(b) && d) { const j = JSON.parse(d); staende.set(j.v, j.zeit); } } });
});

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (process.env.ALLE_ANFRAGEN) console.log('KONSOLE', Date.now(), m.text().slice(0, 200)); });
const anfragen = [];
page.on('requestfinished', (r) => { if (/\/api\/cup-matches/.test(r.url())) fertig.push({ t: Date.now(), u: r.url() }); });
page.on('request', (r) => { const u = r.url(); if (/\/api\/(cup-leaderboard|cup-matches|qualifikation|cup-schwellen|live\/stream)/.test(u)) anfragen.push({ t: Date.now(), u: u.replace(SEITE, '') }); });
if (MODUS === 'fallback') await page.route('**/api/live/stream**', (r) => r.abort());
await page.goto(`${SEITE}${PFAD}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /Spieler_00/.test(document.body.innerText), null, { timeout: 60_000 });
console.log(`Seite geladen (${MODUS}); Tabelle steht.`);
if (MODUS === 'matches') { await page.getByRole('button', { name: /^Matches$/ }).first().click().catch(async () => { await page.getByText('Matches', { exact: true }).first().click(); }); await warte(3000); }
await warte(5000);

if (MODUS === 'neustart') {
  // Server weg, waehrenddessen aendert sich der Stand bei Epic, Server wieder da (process.env.START = Startbefehl): wann steht die Zahl im DOM?
  const punkte = 4321;
  const gesehen = page.evaluate(() => new Promise((ok) => {
    const re = /(4321|4[.,\u202f\u00a0]321)/;
    const mo = new MutationObserver(() => { if (re.test(document.body.innerText)) { mo.disconnect(); ok(Date.now()); } });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { mo.disconnect(); ok(null); }, 90_000);
  }));
  execSync('pkill -f "[n]ext-server|[n]ext start" || true');
  const aus = Date.now();
  await warte(1000);
  await fetch(`${EPIC}/__setze?team=150&punkte=${punkte}`, { method: 'POST' });
  await warte(3000);
  spawn('bash', [process.env.START], { detached: true, stdio: 'ignore' }).unref();
  const an = Date.now();
  let bereit = 0;
  while (!bereit) { try { if ((await fetch(`${SEITE}/api/live/status`)).ok) bereit = Date.now(); } catch { await warte(50); } }
  const t = await gesehen;
  console.log(`Neustart: Server ${an - aus} ms weg, antwortet ${bereit - an} ms nach dem Start; Zahl im DOM ${t ? `${t - bereit} ms nachdem der Server wieder antwortet` : 'NIE (90 s)'}`);
  const ls = anfragen.filter((a) => a.t >= aus);
  console.log('Anfragen danach:\n  ' + ls.slice(0, 10).map((a) => `+${a.t - aus}ms ${a.u.slice(0, 100)}`).join('\n  '));
  await browser.close();
  process.exit(0);
}
const dom = [], push = [], gesamt = [];
for (let k = 0; k < Number(RUNDEN); k++) {
  const punkte = 5000 + k * 111 + Math.floor(Math.random() * 50);
  const text = String(punkte);
  const muster = `(${text}|${text.slice(0, 1)}[.,\\u202f\\u00a0]${text.slice(1)})`;
  // Im Browser: der Augenblick, in dem die Zahl im DOM steht (MutationObserver, Zeit als Epoch-ms).
  const gesehen = page.evaluate((m) => new Promise((ok) => {
    const re = new RegExp(m);
    const pruef = () => re.test(document.body.innerText);
    if (pruef()) { ok(Date.now()); return; }
    const mo = new MutationObserver(() => { if (pruef()) { mo.disconnect(); ok(Date.now()); } });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { mo.disconnect(); ok(null); }, 70_000);
  }), muster);
  const vorV = Math.max(0, ...staende.keys());
  const r = await fetch(`${EPIC}/__setze?team=${200 + k}&punkte=${punkte}`, { method: 'POST' }).then((x) => x.json());
  if (MODUS === 'matches') {
    const ab = Date.now();
    while (Date.now() - ab < 30_000 && !fertig.some((f) => f.t > r.zeit && /sv=/.test(f.u))) await warte(10);
    const f = fertig.find((x) => x.t > r.zeit && /sv=/.test(x.u));
    const v0 = [...staende.keys()].filter((x) => x > vorV).sort((a, b) => a - b)[0];
    if (f && v0) { push.push(f.t - staende.get(v0)); console.log(`Runde ${k}: Server-Stand -> cup-matches-Antwort da: ${f.t - staende.get(v0)} ms`); }
  }
  if (MODUS === 'matches') { await warte(1500); continue; }
  const t = await gesehen;
  if (!t) { console.log(`Runde ${k} (${r.zeit}): nicht im DOM`); continue; }
  const v = [...staende.keys()].filter((x) => x > vorV).sort((a, b) => a - b)[0];
  gesamt.push(t - r.zeit);
  if (v) { push.push(t - staende.get(v)); }
  console.log(`Runde ${k}: Epic->DOM ${t - r.zeit} ms${v ? `, Server-Stand->DOM ${t - staende.get(v)} ms` : ''}`);
  await warte(1500 + Math.random() * 2000);
}
console.log('Epic-Aenderung -> DOM (ms):', JSON.stringify(stats(gesamt)));
if (push.length) console.log('Server hat Stand -> DOM (ms):', JSON.stringify(stats(push)));
const t0 = anfragen.length ? anfragen[0].t : Date.now();
console.log('Anfragen der Seite:', anfragen.map((a) => `+${a.t - t0}ms ${a.u.slice(0, 110)}`).slice(-14).join('\n  '));
if (process.env.ALLE_ANFRAGEN) console.log('ALLE:\n' + anfragen.map((a) => `${a.t} ${a.u.slice(0, 120)}`).join('\n'));
await browser.close();
process.exit(0);
