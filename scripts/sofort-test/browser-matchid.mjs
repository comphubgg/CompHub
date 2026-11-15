/*
 * Sofort-Test, Match-ID im Browser: /streams?kanal=teststreamer als Admin, XMPP-Status bei der Attrappe -> Match-ID im DOM ([data-match-id]).
 * Dazu: Tab verbergen (Strom zu), Status aendern, Tab zeigen -> wie schnell steht die neue ID da.
 *
 *   node scripts/sofort-test/browser-matchid.mjs <seite> <epic> <cookie> [runden=6]
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
const [SEITE, EPIC, COOKIE, RUNDEN = '6'] = process.argv.slice(2);
const FREUND = '00000000000000000000000000000fff';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zufall = () => [...Array(32)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const u = new URL(SEITE);
await ctx.addCookies([{ name: 'streamer_dashboard_auth', value: COOKIE, domain: u.hostname, path: '/' }]);
const page = await ctx.newPage();
const stroeme = [];
page.on('request', (r) => { if (/match-id/.test(r.url())) stroeme.push(`${Date.now()} ${r.url().replace(SEITE, '')}`); });
await page.goto(`${SEITE}/streams?kanal=teststreamer`, { waitUntil: 'domcontentloaded' });
await warte(6000);
const warteAufId = (sid) => page.evaluate((s) => new Promise((ok) => {
  const da = () => (document.querySelector('[data-match-id]')?.getAttribute('data-match-id') ?? null) === s;
  if (da()) { ok(Date.now()); return; }
  const mo = new MutationObserver(() => { if (da()) { mo.disconnect(); ok(Date.now()); } });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true });
  setTimeout(() => { mo.disconnect(); ok(null); }, 15_000);
}), sid);
const lat = [];
for (let r = 0; r < Number(RUNDEN); r++) {
  const sid = zufall();
  const w = warteAufId(sid);
  const { zeit } = await (await fetch(`${EPIC}/__presence`, { method: 'POST', body: JSON.stringify({ from: FREUND, sessionId: sid }) })).json();
  const t = await w;
  console.log(`Runde ${r}: XMPP-Status -> Match-ID im DOM: ${t ? `${t - zeit} ms` : 'NICHT angekommen'}`);
  if (t) lat.push(t - zeit);
  await warte(800);
}
console.log(`Match-ID XMPP -> DOM: min ${Math.min(...lat)} / max ${Math.max(...lat)} ms`);
// Verborgener Tab: Strom zu; waehrenddessen neue ID; beim Zeigen sofort da?
const setzeSichtbar = (an) => page.evaluate((a) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (a ? 'visible' : 'hidden') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !a });
  document.dispatchEvent(new Event('visibilitychange'));
}, an);
await setzeSichtbar(false);
await warte(1500);
const sid = zufall();
await fetch(`${EPIC}/__presence`, { method: 'POST', body: JSON.stringify({ from: FREUND, sessionId: sid }) });
await warte(3000);
const nochAlt = await page.evaluate(() => document.querySelector('[data-match-id]')?.getAttribute('data-match-id'));
const w = warteAufId(sid);
const t0 = Date.now();
await setzeSichtbar(true);
const t = await w;
console.log(`Verborgen: ID im DOM noch alt (${nochAlt !== sid}); nach dem Zeigen neue ID nach ${t ? t - t0 : 'NIE'} ms`);
console.log('Statuszeile (Admin):', await page.evaluate(() => document.querySelector('[data-xmpp-status]')?.textContent ?? '(keine)'));
if (process.env.START) {
  // Seite neu starten, waehrend der XMPP-Dienst weiterlaeuft: die Match-ID muss sofort wieder da sein (kein Neuverbinden zu Epic noetig).
  const sid2 = zufall();
  await fetch(`${EPIC}/__presence`, { method: 'POST', body: JSON.stringify({ from: FREUND, sessionId: sid2 }) });
  await warteAufId(sid2);
  execSync('pkill -f "[n]ext-server|[n]ext start" || true');
  await warte(1500);
  const sid3 = zufall();
  const zeit3 = Date.now();
  await fetch(`${EPIC}/__presence`, { method: 'POST', body: JSON.stringify({ from: FREUND, sessionId: sid3 }) });
  const w3 = warteAufId(sid3);
  spawn('bash', [process.env.START], { detached: true, stdio: 'ignore' }).unref();
  let bereit = 0;
  while (!bereit) { try { if ((await fetch(`${SEITE}/api/live/status`)).ok) bereit = Date.now(); } catch { await warte(50); } }
  const t3 = await w3;
  console.log(`Seite neu gestartet (Dienst lief weiter): Match-ID, die WAEHREND des Neustarts kam, im DOM ${t3 ? `${t3 - bereit} ms nachdem die Seite wieder antwortet` : 'NIE'} (Wechsel ${bereit - zeit3} ms vor "bereit")`);
}
console.log('Match-ID-Anfragen der Seite:\n  ' + stroeme.map((s) => s.slice(0, 120)).join('\n  '));
await browser.close();
process.exit(0);
