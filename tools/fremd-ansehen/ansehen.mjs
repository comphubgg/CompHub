// Vergleichsrecherche (Betreiber, 15.11.2026): eine fremde Statistikseite wie ein Besucher im echten Browser ansehen -
// ganze Seite als Bild, jeden Reiter/Filter einmal anklicken, alle JSON-/XHR-Antworten mitschneiden. Nur zum Lesen,
// nichts davon geht auf die eigene Seite. Bleibt die Seite an einer Bot-Pruefung haengen, wird der Wayback-Stand genommen.
//   node tools/fremd-ansehen/ansehen.mjs --aus <ordner> --start "<url> <url> ..."
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const AUS = arg('aus', 'fremd');
const START = arg('start', '').split(/\s+/).filter(Boolean);
const MAX_SEITEN = +arg('max', '30');
const MAX_KLICKS = +arg('klicks', '25');
fs.mkdirSync(AUS, { recursive: true });

const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  locale: 'en-GB',
});
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

const protokoll = [];
let antwortNr = 0;
const datei = (s) => s.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 120);

async function antwortenMitschneiden(page, kennung) {
  page.on('response', async (r) => {
    try {
      const typ = r.headers()['content-type'] ?? '';
      const u = r.url();
      if (!/json|javascript\b.*php|text\/plain/.test(typ) && !/\.php|\/api\/|\.json/.test(u)) return;
      if (/google|recaptcha|gstatic|cloudflare|archive\.org\/_static/.test(u)) return;
      const body = await r.body().catch(() => null);
      if (!body) return;
      const n = ++antwortNr;
      const name = `xhr-${String(n).padStart(3, '0')}-${datei(u)}`.slice(0, 150) + '.txt';
      fs.writeFileSync(path.join(AUS, name), body);
      protokoll.push({ art: 'xhr', seite: kennung, url: u, status: r.status(), typ, bytes: body.length, datei: name });
    } catch { /* weiter */ }
  });
}

async function istBotSeite(page) {
  const t = await page.title().catch(() => '');
  const txt = await page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? '').catch(() => '');
  return /Bot Verification|not a robot|403 Forbidden/i.test(t + ' ' + txt);
}

async function oeffnen(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  for (let i = 0; i < 12 && (await istBotSeite(page)); i++) await page.waitForTimeout(2500);
  if (!(await istBotSeite(page))) return { quelle: 'live', url };
  // Wayback (letzter Stand) - mit "if_" ohne Werkzeugleiste
  const wb = `https://web.archive.org/web/2026if_/${url}`;
  await page.goto(wb, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
  return { quelle: (await istBotSeite(page)) ? 'gesperrt' : 'wayback', url: wb };
}

const besucht = new Set();
const warteschlange = [...START];
let seitenNr = 0;
while (warteschlange.length && seitenNr < MAX_SEITEN) {
  const url = warteschlange.shift();
  const schluessel = url.replace(/[#?].*$/, '').replace(/\/$/, '');
  if (besucht.has(schluessel)) continue;
  besucht.add(schluessel);
  const nr = String(++seitenNr).padStart(2, '0');
  const kennung = `${nr}-${datei(url)}`;
  const page = await ctx.newPage();
  await antwortenMitschneiden(page, kennung);
  const o = await oeffnen(page, url);
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(AUS, `${kennung}.png`), fullPage: true }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  fs.writeFileSync(path.join(AUS, `${kennung}.txt`), text);
  fs.writeFileSync(path.join(AUS, `${kennung}.html`), await page.content().catch(() => ''));
  protokoll.push({ art: 'seite', kennung, ...o, titel: await page.title().catch(() => '') });
  console.log(`Seite ${kennung}: ${o.quelle} ${text.length} Zeichen`);

  // Links derselben Seite unter /stats, /gametool, / (Startseite) einsammeln
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)).catch(() => []);
  for (const l of links) {
    const echt = l.replace(/^https?:\/\/web\.archive\.org\/web\/[^/]+\//, '');
    if (/^https?:\/\/(www\.)?eucompetitive\.com\/(stats|gametool)/.test(echt) && !besucht.has(echt.replace(/[#?].*$/, '').replace(/\/$/, ''))) warteschlange.push(echt.replace(/#.*$/, ''));
  }

  // Bedienelemente: Reiter, Knoepfe, Auswahllisten - jedes einmal
  const ziele = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role=tab], .tab, .tabs > *, .filter, .chip, .pill, [data-tab], [data-filter], [onclick]')];
    const sicht = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && (e.innerText ?? '').trim().length < 40; });
    return sicht.map((e, i) => { e.setAttribute('data-fremd-ziel', String(i)); return { i, text: (e.innerText ?? '').trim(), tag: e.tagName }; });
  }).catch(() => []);
  const selects = await page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => { s.setAttribute('data-fremd-sel', String(i)); return { i, name: s.name || s.id, optionen: [...s.options].map((o) => o.text) }; })).catch(() => []);
  protokoll.push({ art: 'bedienung', kennung, knoepfe: ziele.map((z) => z.text), auswahl: selects });
  let k = 0;
  for (const z of ziele) {
    if (k >= MAX_KLICKS) break;
    if (!z.text || /login|sign|discord|twitter|twitch|cookie|accept/i.test(z.text)) continue;
    k++;
    await page.click(`[data-fremd-ziel="${z.i}"]`, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const kn = `${kennung}-klick${String(k).padStart(2, '0')}-${datei(z.text).slice(0, 30)}`;
    await page.screenshot({ path: path.join(AUS, `${kn}.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(AUS, `${kn}.txt`), await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
    if (!page.url().includes(schluessel.replace(/^https?:\/\//, '').split('/').pop() ?? '')) { await page.goBack().catch(() => {}); await page.waitForTimeout(2000); }
  }
  for (const s of selects.slice(0, 4)) {
    for (const opt of s.optionen.slice(0, 6)) {
      await page.selectOption(`[data-fremd-sel="${s.i}"]`, { label: opt }, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const kn = `${kennung}-sel${s.i}-${datei(opt).slice(0, 30)}`;
      await page.screenshot({ path: path.join(AUS, `${kn}.png`), fullPage: false }).catch(() => {});
      fs.writeFileSync(path.join(AUS, `${kn}.txt`), await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
    }
  }
  // Handy-Ansicht
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(AUS, `${kennung}-390.png`), fullPage: true }).catch(() => {});
  await page.close();
}
fs.writeFileSync(path.join(AUS, 'protokoll.json'), JSON.stringify(protokoll, null, 1));
await browser.close();
console.log(`fertig: ${seitenNr} Seiten, ${antwortNr} Antworten`);
