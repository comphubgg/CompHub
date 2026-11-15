// Echte Aufnahmen der Live-Seite fuer das Video "Introducing: Match Replays" (laeuft im GitHub-Runner, siehe .github/workflows/seite-aufnehmen.yml;
// die Sandbox kommt nicht an thecomphub.com).
//
//   node tools/replays-video/seite-aufnehmen.mjs --format quer|hoch [--basis https://www.thecomphub.com] [--tag FENSTER] [--nr 3] [--aus ordner]
//
// Ablauf wie ein Besucher: /replays -> Spieltag -> ein Game abspielen (Kill-Feed, Kampf-Orte mit Fenster, Zonen, Spieler wechseln, 3D, Kurve,
// Zonen-Tabelle, Spielerwerte) -> Cup-Seite, Reiter "Matches" mit den REPLAY-Marken.
// Aufgenommen wird doppelt: CDP-Screencast (JPEG-Bilder mit Zeitstempel -> seite.mp4, scharf) und Playwrights recordVideo (webm, Rueckfall).
// Dazu marken.json (Sekunde je Schritt im Video), Standbilder je Schritt und auswahl.json (welcher Cup/Game und warum).
// quer: Ansicht 1440x810 mit Faktor 4/3 = 1920x1080 Bildpunkte. hoch: 540x960 mit Faktor 2 = 1080x1920 (die Handy-Ansicht der Seite).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] !== undefined && process.argv[i + 1] !== '' ? process.argv[i + 1] : d; };
const FORMAT = arg('--format', 'quer');
const HOCH = FORMAT === 'hoch';
const BASIS = arg('--basis', 'https://www.thecomphub.com').replace(/\/$/, '');
const AUS = path.resolve(arg('--aus', `aufnahme-${FORMAT}`));
const TAG_WUNSCH = arg('--tag', '');
const NR_WUNSCH = Number(arg('--nr', '0')) || 0;
const [VB, VH, DSF] = HOCH ? [540, 960, 2] : [1440, 810, 4 / 3];
const [PB, PH] = HOCH ? [1080, 1920] : [1920, 1080];
fs.rmSync(AUS, { recursive: true, force: true });
const BILDER = path.join(AUS, 'bilder'); const STILL = path.join(AUS, 'standbilder');
for (const d of [AUS, BILDER, STILL]) fs.mkdirSync(d, { recursive: true });
const log = (...a) => console.log(`[${FORMAT}]`, ...a);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Auswahl: welcher Cup, welches Game
async function holeJson(url, versuche = 4) {
  for (let v = 0; v < versuche; v += 1) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 CompHub-Aufnahme' }, signal: AbortSignal.timeout(90000) }); if (r.ok) return await r.json(); log('HTTP', r.status, url); } catch (e) { log('Fehler', url, e.message); }
    if (v < versuche - 1) await warte(1500 * (v + 1));
  }
  return null;
}
const ueb = await holeJson(`${BASIS}/api/replay?uebersicht=1`);
if (!ueb?.cups) throw new Error('Uebersicht nicht lesbar');
const auswahl = { basis: BASIS, format: FORMAT, kandidaten: [] };
const tage = ueb.cups.flatMap((c) => c.tage.map((d) => ({ ...d, eventId: c.eventId, titel: c.titel, season: c.season })));
const punkte = (d) => {
  const n = `${d.titel} ${d.windowId}`;
  let p = 0;
  if (/fncs/i.test(n)) p += 40;
  if (/reload/i.test(n) && /solo/i.test(n)) p += 30;
  if (/heat\s*_?1(?!\d)/i.test(n)) p += 45;
  if (/major|final/i.test(n) && !/qualif/i.test(n)) p += 35;
  if (/qualif/i.test(n)) p -= 90;   // Qualifikationen haben hunderte Lobbys - gesucht ist ein Finale/Heat
  if (d.games > 30) p -= 60;
  if (d.region === 'EU') p += 20;
  p += Math.min(d.games, 12);
  return p;
};
auswahl.kandidaten = tage.map((d) => ({ windowId: d.windowId, titel: d.titel, region: d.region, beginn: d.beginn, games: d.games, punkte: punkte(d) }))
  .sort((a, b) => b.punkte - a.punkte || String(b.beginn).localeCompare(String(a.beginn))).slice(0, 60);
// Spieltage der Reihe nach pruefen, bis einer ein lesbares Game hat (eine 424 der Ablage ist oft nur ein Augenblick - je Game zwei Versuche).
const reihe = [...new Set([TAG_WUNSCH, ...auswahl.kandidaten.slice(0, 6).map((k) => k.windowId)].filter(Boolean))];
let TAG = null;
auswahl.games = [];
for (const tagId of reihe) {
  const tagJ = await holeJson(`${BASIS}/api/replay?tag=${encodeURIComponent(tagId)}`);
  if (!tagJ?.tag) { log('Spieltag nicht lesbar:', tagId); continue; }
  // Hoechstens 12 Games pruefen (ein Finale/Heat hat 6-12); mit --nr nur dieses eine.
  const zuPruefen = NR_WUNSCH && tagId === TAG_WUNSCH ? tagJ.tag.matches.filter((m) => m.nr === NR_WUNSCH) : tagJ.tag.matches.slice(-12);
  for (const m of zuPruefen) {
    const j = await holeJson(`${BASIS}/api/replay?match=${encodeURIComponent(m.id)}&v=4`, 2);
    if (!j) { auswahl.games.push({ tag: tagId, nr: m.nr, id: m.id, lesbar: false }); continue; }
    const echte = (j.spieler ?? []).filter((s) => !s.bot);
    const g = {
      tag: tagId, nr: m.nr, id: m.id, lesbar: true, spieler: echte.length, bots: (j.spieler ?? []).length - echte.length,
      elims: (j.feed ?? []).filter((e) => e.art === 'tot').length, knocks: (j.feed ?? []).filter((e) => e.art === 'unten').length,
      zonen: (j.zonen ?? []).length, orte: j.orte ? Object.keys(j.orte).length : 0, treffer: (j.treffer ?? []).length,
      schaden: (j.schaden ?? []).length, zusatz: (j.zusatz ?? []).length, karte: j.karte ?? null, playlist: j.playlist ?? null,
      sieger: m.sieger ?? [], beginn: m.beginn ?? null, wertung: !!j.wertung,
    };
    g.wert = (g.orte ? 1000 : 0) + g.elims * 3 + g.knocks + g.zonen * 5 + (g.treffer ? 50 : 0);
    auswahl.games.push(g);
  }
  if (auswahl.games.some((g) => g.tag === tagId && g.lesbar)) { TAG = tagJ.tag; break; }
  log('Kein Game lesbar in', tagId, '- naechster Spieltag');
}
if (!TAG) { fs.writeFileSync(path.join(AUS, 'auswahl.json'), JSON.stringify(auswahl, null, 1)); throw new Error('kein lesbares Game'); }
const besteGames = auswahl.games.filter((g) => g.lesbar && g.tag === TAG.windowId).sort((a, b) => b.wert - a.wert);
const NR = NR_WUNSCH || besteGames[0]?.nr || 1;
auswahl.gewaehlt = { windowId: TAG.windowId, eventId: TAG.eventId, titel: TAG.titel, region: TAG.region, season: TAG.season, nr: NR, games: TAG.matches.length };
fs.writeFileSync(path.join(AUS, 'auswahl.json'), JSON.stringify(auswahl, null, 1));
log('Auswahl:', JSON.stringify(auswahl.gewaehlt), JSON.stringify(auswahl.games.find((g) => g.nr === NR)));

// ------------------------------------------------------------------ Browser, Screencast
const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const context = await browser.newContext({
  viewport: { width: VB, height: VH }, deviceScaleFactor: DSF, isMobile: HOCH, hasTouch: false, colorScheme: 'dark', locale: 'en-GB',
  recordVideo: { dir: path.join(AUS, 'webm'), size: { width: PB, height: PH } },
  userAgent: HOCH
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const domain = new URL(BASIS).hostname;
await context.addCookies([{ name: 'multihub_sprache', value: 'en', domain, path: '/' }]);
// Ein sichtbarer Mauszeiger (headless zeichnet keinen) - folgt den echten Maus-Ereignissen, Klick als Ring.
await context.addInitScript(() => {
  const an = () => {
    if (document.getElementById('__zeiger')) return;
    const z = document.createElement('div'); z.id = '__zeiger';
    z.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18 15.2 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(z.style, { position: 'fixed', left: '-100px', top: '-100px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))', transition: 'transform .08s' });
    document.documentElement.appendChild(z);
    addEventListener('mousemove', (e) => { z.style.left = `${e.clientX - 3}px`; z.style.top = `${e.clientY - 2}px`; }, true);
    addEventListener('mousedown', (e) => {
      z.style.transform = 'scale(.85)';
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #38bdf8', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out', opacity: '1' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.9)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => { z.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', an); else an();
});
const page = await context.newPage();
page.on('pageerror', (e) => log('Seitenfehler:', e.message));

const cdp = await context.newCDPSession(page);
const bilder = []; let t0Wand = null;
cdp.on('Page.screencastFrame', async (f) => {
  const n = bilder.length;
  fs.writeFileSync(path.join(BILDER, `${String(n).padStart(6, '0')}.jpg`), Buffer.from(f.data, 'base64'));
  bilder.push(f.metadata.timestamp ?? Date.now() / 1000);
  if (t0Wand === null) t0Wand = f.metadata.timestamp ?? Date.now() / 1000;
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* Seite wechselt */ }
});
const starteCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: PB, maxHeight: PH, everyNthFrame: 1 });

const marken = []; const tStart = Date.now();
const jetzt = () => (t0Wand === null ? 0 : Date.now() / 1000 - t0Wand);
const fehler = [];
let schritt = 0;
async function marke(name, info = {}) {
  schritt += 1;
  marken.push({ name, t: +jetzt().toFixed(2), url: page.url(), ...info });
  try { await page.screenshot({ path: path.join(STILL, `${String(schritt).padStart(2, '0')}-${name}.png`) }); } catch (e) { log('Standbild', name, e.message); }
  log('Marke', name, jetzt().toFixed(1));
}
async function versuch(name, f) {
  try { await f(); } catch (e) { fehler.push({ name, fehler: e.message.split('\n')[0] }); log('NICHT geklappt:', name, e.message.split('\n')[0]); }
}

// ------------------------------------------------------------------ Bewegungen wie ein Mensch
let maus = { x: VB / 2, y: VH / 2 };
async function zeigerNach(x, y, ms = 700) {
  const n = Math.max(8, Math.round(ms / 16));
  const a = { ...maus };
  for (let i = 1; i <= n; i += 1) {
    const q = i / n; const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
    await page.mouse.move(a.x + (x - a.x) * e, a.y + (y - a.y) * e);
    await warte(ms / n);
  }
  maus = { x, y };
}
async function mitte(loc) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('nicht sichtbar');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}
async function hinUndKlick(loc, { ms = 700, pause = 250 } = {}) {
  await sichtbarMachen(loc);
  const { x, y } = await mitte(loc);
  await zeigerNach(x, y, ms); await warte(pause);
  await page.mouse.down(); await warte(70); await page.mouse.up();
}
async function hin(loc, ms = 700) { await sichtbarMachen(loc); const { x, y } = await mitte(loc); await zeigerNach(x, y, ms); }
/** Weich scrollen, bis das Element bei "oben" (Anteil der Hoehe) steht. */
async function scrolleZu(loc, oben = 0.12, ms = 1400) {
  const b = await loc.boundingBox(); if (!b) throw new Error('kein Ziel zum Scrollen');
  await scrolleUm(b.y - VH * oben, ms);
}
async function scrolleUm(dy, ms = 1400) {
  await page.evaluate(([dy, ms]) => new Promise((ok) => {
    const a = scrollY; const z = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, a + dy)); const t0 = performance.now();
    const f = (n) => { const q = Math.min(1, (n - t0) / ms); const e = q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2; scrollTo(0, a + (z - a) * e); if (q < 1) requestAnimationFrame(f); else ok(); };
    requestAnimationFrame(f);
  }), [dy, ms]);
}
async function sichtbarMachen(loc) {
  const b = await loc.boundingBox(); if (!b) throw new Error('Element ohne Box');
  if (b.y < 40 || b.y + b.height > VH - 40) await scrolleUm(b.y - VH * 0.35, 900);
}

// ------------------------------------------------------------------ Drehbuch
await starteCast();
const tagUrl = `/replays/${encodeURIComponent(TAG.windowId)}`;

// 1) Uebersicht
await page.goto(`${BASIS}/replays`, { waitUntil: 'domcontentloaded' });
await versuch('cookie-banner', async () => { const b = page.getByRole('button', { name: /^(accept|accept all|ok|got it|agree)$/i }).first(); if (await b.isVisible({ timeout: 2500 })) await b.click(); });
await page.locator('section a[href^="/replays/"]').first().waitFor({ timeout: 60000 });
await warte(1800);
await marke('uebersicht');
await zeigerNach(VB * 0.5, VH * 0.45, 900);
await versuch('uebersicht-scroll', async () => { await scrolleUm(VH * 0.45, 2200); await warte(900); await scrolleUm(-VH * 0.45, 1600); });
await versuch('uebersicht-region', async () => {
  const eu = page.getByRole('button', { name: new RegExp(`^${TAG.region}$`) }).first();
  await hinUndKlick(eu); await warte(1500);
});
await marke('uebersicht-region');
await versuch('uebersicht-tag', async () => {
  const link = page.locator(`a[href="${tagUrl}"]`).first();
  await hin(link, 900); await warte(1100); await marke('uebersicht-hover');
  await hinUndKlick(link, { ms: 200 });
});
if (!page.url().includes(tagUrl)) await page.goto(`${BASIS}${tagUrl}`, { waitUntil: 'domcontentloaded' });

// 2) Spieltag
await page.locator(`a[href^="${tagUrl}/"]`).first().waitFor({ timeout: 60000 });
await warte(1600);
await marke('spieltag');
await versuch('spieltag-game', async () => {
  const kachel = page.locator(`a[href="${tagUrl}/${NR}"]`).first();
  await hin(kachel, 1000); await warte(1200);
  await hinUndKlick(kachel, { ms: 200 });
});
if (!page.url().includes(`${tagUrl}/${NR}`)) await page.goto(`${BASIS}${tagUrl}/${NR}`, { waitUntil: 'domcontentloaded' });

// 3) Das Game
const karte = page.locator('div[style*="perspective"]').first();
await karte.waitFor({ timeout: 90000 });
await page.locator('h1').first().waitFor();
await warte(2500);
await marke('match-kopf');
const knopf = (re) => page.locator('button').filter({ hasText: re }).first();
const steuerPlay = page.locator('button.bg-sky-500').filter({ hasText: /Play|Pause|▶|❚❚/ }).first();
await versuch('karte-zeigen', async () => { await scrolleZu(karte, HOCH ? 0.06 : 0.04, 1600); await warte(1200); });
await marke('karte');

// 3a) Abspielen: die ersten Kaempfe nach der Landung, Feed fuellt sich
await versuch('abspielen', async () => {
  await hinUndKlick(knopf(/^16×$/), { ms: 900 }); await warte(300);
  await hinUndKlick(steuerPlay, { ms: 600 });
  await marke('abspielen');
  await warte(9000);
  await hinUndKlick(steuerPlay, { ms: 500 });
});
await marke('nach-abspielen');

// 3b) Ein Kampf auf der Karte: zum dichtesten Eliminierungs-Zeichen zoomen und drueberfahren
await versuch('kampf-hover', async () => {
  if (HOCH) await scrolleZu(karte, 0.06, 600);
  const xs = page.locator('div[style*="perspective"] button[data-marker][aria-label="Eliminated"], div[style*="perspective"] button[data-marker][aria-label="Eliminiert"]');
  const n = await xs.count(); if (!n) throw new Error('keine Eliminierungs-Zeichen');
  // das Zeichen mit den meisten Nachbarn (ein Kampf)
  const boxen = []; for (let i = 0; i < Math.min(n, 120); i += 1) { const b = await xs.nth(i).boundingBox(); if (b) boxen.push({ i, x: b.x + b.width / 2, y: b.y + b.height / 2 }); }
  const kb = (await karte.boundingBox());
  const innen = boxen.filter((p) => p.x > kb.x + 40 && p.x < kb.x + kb.width - 40 && p.y > kb.y + 60 && p.y < kb.y + kb.height - 120);
  const nach = (p) => innen.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 50).length;
  const ziel = (innen.length ? innen : boxen).sort((a, b) => nach(b) - nach(a))[0];
  await zeigerNach(ziel.x, ziel.y, 1000); await warte(400);
  for (let k = 0; k < 7; k += 1) { await page.mouse.wheel(0, -160); await warte(160); }
  await warte(900);
  await marke('kampf-zoom');
  // nach dem Zoom das naechste Zeichen am Zeiger suchen
  let best = null;
  const n2 = await xs.count();
  for (let i = 0; i < Math.min(n2, 160); i += 1) { const b = await xs.nth(i).boundingBox(); if (!b) continue; const d = Math.hypot(b.x + b.width / 2 - maus.x, b.y + b.height / 2 - maus.y); if (b.x > kb.x && b.x < kb.x + kb.width && b.y > kb.y && b.y < kb.y + kb.height && (!best || d < best.d)) best = { d, x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  if (best) { await zeigerNach(best.x, best.y, 800); await warte(2600); await marke('kampf-fenster'); }
  // ein zweites Zeichen in der Naehe
  let zweit = null;
  for (let i = 0; i < Math.min(n2, 160); i += 1) { const b = await xs.nth(i).boundingBox(); if (!b) continue; const x = b.x + b.width / 2; const y = b.y + b.height / 2; const d = Math.hypot(x - maus.x, y - maus.y); if (d > 30 && x > kb.x + 30 && x < kb.x + kb.width - 30 && y > kb.y + 60 && y < kb.y + kb.height - 60 && (!zweit || d < zweit.d)) zweit = { d, x, y }; }
  if (zweit) { await zeigerNach(zweit.x, zweit.y, 900); await warte(2400); }
});

// 3c) Kill-Feed: durchscrollen, einen Eintrag anklicken (springt zu diesem Moment)
await versuch('killfeed', async () => {
  const reiterFeed = knopf(/^Kill feed$|^Kill-Feed$/i);
  await scrolleZu(reiterFeed, HOCH ? 0.1 : 0.06, 1400);
  await hinUndKlick(reiterFeed, { ms: 700 });
  await warte(600);
  await marke('killfeed');
  const liste = page.locator('aside div.overflow-y-auto').last();
  const { x, y } = await mitte(liste);
  await zeigerNach(x, Math.min(y, VH * 0.7), 800);
  for (let k = 0; k < 10; k += 1) { await page.mouse.wheel(0, 90); await warte(110); }
  await warte(700);
  for (let k = 0; k < 6; k += 1) { await page.mouse.wheel(0, -90); await warte(110); }
  await warte(500);
  const eintrag = liste.locator('li button').nth(2);
  await hin(eintrag, 700); await warte(900);
  await hinUndKlick(eintrag, { ms: 150 });
  await warte(1500);
  await marke('killfeed-klick');
});

// 3d) Spieler wechseln (wo das Replay die Orte fuehrt)
await versuch('spieler', async () => {
  const zu = page.locator('aside button[aria-label="Close"]').first();
  if (!(await zu.count())) throw new Error('kein Spieler-Fenster (Replay ohne Orte?)');
  await scrolleZu(page.locator('aside').first(), HOCH ? 0.08 : 0.03, 1200);
  await marke('spieler-fenster');
  await hinUndKlick(zu, { ms: 800 }); await warte(1000);
  const knoepfe = page.locator('aside div.grid button');
  await knoepfe.first().waitFor({ timeout: 6000 }).catch(() => {});
  const n = await knoepfe.count(); if (!n) throw new Error('keine Spielerliste');
  await marke('spieler-liste');
  await hinUndKlick(knoepfe.nth(Math.min(3, n - 1)), { ms: 800 }); await warte(1800);
  await marke('spieler-gewaehlt');
  // auf der Karte zeigen, wo er steht; ein Stueck abspielen
  if (HOCH) await scrolleZu(karte, 0.06, 1200); else await scrolleZu(karte, 0.04, 900);
  await hinUndKlick(knopf(/^4×$/), { ms: 700 }).catch(() => {});
  await hinUndKlick(steuerPlay, { ms: 600 }).catch(async () => { await hinUndKlick(page.locator('button[aria-label="Play"]').first()); });
  await warte(6000);
  await marke('spieler-laeuft');
  await hinUndKlick(steuerPlay, { ms: 500 }).catch(() => {});
});

// 3e) Zonen: Zoom zuruecksetzen, "Next zone" mehrmals, dann schnell abspielen
await versuch('zonen', async () => {
  await scrolleZu(karte, HOCH ? 0.06 : 0.04, 900);
  const kb = await karte.boundingBox();
  await zeigerNach(kb.x + kb.width * 0.5, kb.y + kb.height * 0.45, 700);
  await page.mouse.dblclick(kb.x + kb.width * 0.5, kb.y + kb.height * 0.45); await warte(900);
  const naechsteZone = knopf(/^Next zone$|^Nächste Zone$/);
  for (let k = 0; k < 4; k += 1) { await hinUndKlick(naechsteZone, { ms: k ? 250 : 900 }); await warte(1300); }
  await marke('zonen');
  await hinUndKlick(knopf(/^64×$/), { ms: 700 });
  await hinUndKlick(steuerPlay, { ms: 600 });
  await warte(9000);
  await marke('zonen-ende');
  await hinUndKlick(steuerPlay, { ms: 500 }).catch(() => {});
});

// 3f) 3D
await versuch('dreid', async () => {
  await hinUndKlick(knopf(/^3D$/), { ms: 800 }); await warte(2600);
  await marke('dreid');
  await hinUndKlick(knopf(/^2D$/), { ms: 700 }); await warte(1200);
});

// 3g) Kurve "Players alive", Zonen-Tabelle, Spielerwerte
await versuch('kurve', async () => {
  const kurve = page.locator('svg.cursor-pointer').first();
  await scrolleZu(kurve, HOCH ? 0.35 : 0.4, 1600);
  const { b } = await mitte(kurve);
  await zeigerNach(b.x + b.width * 0.25, b.y + b.height * 0.5, 900); await warte(400);
  await page.mouse.down(); await page.mouse.up(); await warte(1400);
  await marke('kurve');
});
await versuch('zonen-tabelle', async () => {
  const kopf = page.locator('p').filter({ hasText: /^Zones$|^Zonen$/ }).first();
  await scrolleZu(kopf, 0.08, 1800); await warte(1800);
  await marke('zonen-tabelle');
});
await versuch('spielerwerte', async () => {
  const kopf = page.locator('p').filter({ hasText: /Player stats of the match|Spielerwerte des Matches/ }).first();
  await scrolleZu(kopf, 0.06, 1800); await warte(1500);
  await marke('spielerwerte');
  await scrolleUm(VH * 0.5, 2600); await warte(1200);
  await marke('spielerwerte-unten');
});
// 3h) Reiter der Seitenleiste: Hits, Teams, Players
await versuch('reiter', async () => {
  const hits = knopf(/^Hits$|^Treffer$/);
  await scrolleZu(hits, HOCH ? 0.1 : 0.05, 2000);
  if (await hits.count()) { await hinUndKlick(hits, { ms: 700 }); await warte(1800); await marke('reiter-hits'); }
  await hinUndKlick(knopf(/^Teams$/), { ms: 700 }); await warte(1800); await marke('reiter-teams');
  await hinUndKlick(knopf(/^Players$|^Spieler$/), { ms: 700 }); await warte(1800); await marke('reiter-spieler');
});

// 4) Cup-Seite, Reiter Matches
await versuch('event', async () => {
  const q = new URLSearchParams({ region: TAG.region, fenster: TAG.windowId, reiter: 'runden' });
  await page.goto(`${BASIS}/events/${encodeURIComponent(TAG.eventId)}?${q}`, { waitUntil: 'domcontentloaded' });
  await warte(4000);
  await marke('event-geladen');
  await page.locator('span').filter({ hasText: /^Replay$/ }).first().waitFor({ timeout: 90000 });
  await warte(2000);
  await marke('event-matches');
  const marken2 = page.locator('span').filter({ hasText: /^Replay$/ });
  const erste = marken2.first();
  await scrolleZu(erste, HOCH ? 0.3 : 0.35, 1600); await warte(600);
  await hin(erste, 1000); await warte(1500);
  await marke('event-replay-marke');
  await scrolleUm(VH * 0.35, 1800); await warte(1200);
});
await warte(800);
await marke('ende');

// ------------------------------------------------------------------ Abschluss
await cdp.send('Page.stopScreencast').catch(() => {});
await warte(500);
const video = page.video();
await context.close(); await browser.close();
if (video) { try { fs.renameSync(await video.path(), path.join(AUS, 'seite.webm')); } catch (e) { log('webm', e.message); } }
fs.rmSync(path.join(AUS, 'webm'), { recursive: true, force: true });

// Screencast -> MP4 mit festen 30 Bildern/s (jedes Bild so lange, bis das naechste kam)
const liste = bilder.map((ts, i) => `file 'bilder/${String(i).padStart(6, '0')}.jpg'\nduration ${Math.max(0.001, ((bilder[i + 1] ?? ts + 0.5) - ts)).toFixed(4)}`).join('\n')
  + `\nfile 'bilder/${String(bilder.length - 1).padStart(6, '0')}.jpg'\n`;
fs.writeFileSync(path.join(AUS, 'bilder.txt'), liste);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'bilder.txt', '-vf', `scale=${PB}:${PH}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-crf', '15', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', 'seite.mp4'], { cwd: AUS, stdio: 'inherit' });
fs.rmSync(BILDER, { recursive: true, force: true }); fs.rmSync(path.join(AUS, 'bilder.txt'));
const dauer = bilder.length ? bilder[bilder.length - 1] - bilder[0] : 0;
fs.writeFileSync(path.join(AUS, 'marken.json'), JSON.stringify({ format: FORMAT, viewport: [VB, VH, DSF], bilder: bilder.length, dauer: +dauer.toFixed(2), fps: +(bilder.length / Math.max(1, dauer)).toFixed(1), marken, fehler, sekunden: (Date.now() - tStart) / 1000 }, null, 1));
log('Fertig:', bilder.length, 'Bilder in', dauer.toFixed(1), 's; Fehler:', JSON.stringify(fehler));
