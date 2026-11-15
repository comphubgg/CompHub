// Echte Aufnahmen der Live-Seite fuer das Video "Introducing: Match Replays" (laeuft im GitHub-Runner, siehe .github/workflows/seite-aufnehmen.yml;
// die Sandbox kommt nicht an thecomphub.com).
//
//   node tools/replays-video/seite-aufnehmen.mjs --format quer|hoch [--basis https://www.thecomphub.com] [--tag FENSTER] [--nr 3] [--aus ordner]
//
// Ablauf wie ein Besucher: /replays -> Spieltag -> ein Game abspielen (Kampf-Orte mit Fenster, Spieler waehlen und wechseln, Zonen, 3D, Kill-Feed,
// Reiter, Kurve, Zonen-Tabelle, Spielerwerte) -> Cup-Seite, Reiter "Matches" mit den REPLAY-Marken.
// Aufgenommen wird Bild fuer Bild mit angehaltener Uhr der Seite (Playwright clock): je Bild 1/30 s weiter, dann ein Screenshot -> seite.mp4 mit echten 30 Bildern/s.
// Dazu marken.json (Bild/Sekunde je Schritt im Video), ein Standbild je Marke und auswahl.json (welcher Cup/Game und warum).
// quer: Ansicht 1920x1280 mit Faktor 1,25 = 2400x1600 Bildpunkte (die Karte passt ganz hinein; Platz zum Hineinzoomen im Schnitt).
// hoch: 540x960 mit Faktor 2 = 1080x1920 (die Handy-Ansicht der Seite).
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
const [VB, VH, DSF] = HOCH ? [540, 960, 2] : [1920, 1280, 1.25];
const [PB, PH] = [Math.round(VB * DSF), Math.round(VH * DSF)];
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

// Die Cup-Seite zum Reiter "Matches": im Katalog den Cup suchen, der einen der Spieltage fuehrt (zuerst den gewaehlten, dann die Kandidaten).
const katalog = await holeJson(`${BASIS}/api/cup-catalog?modus=alle`, 2);
let EVENT = null;
for (const w of [TAG.windowId, ...auswahl.kandidaten.map((k) => k.windowId)]) {
  const c = (katalog?.cups ?? []).find((x) => JSON.stringify(x).includes(`"${w}"`));
  if (c) { EVENT = { id: c.id, windowId: w, region: (tage.find((d) => d.windowId === w)?.region) ?? TAG.region }; break; }
}
auswahl.event = EVENT;
fs.writeFileSync(path.join(AUS, 'auswahl.json'), JSON.stringify(auswahl, null, 1));
log('Cup-Seite:', JSON.stringify(EVENT));

// ------------------------------------------------------------------ Browser
const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const context = await browser.newContext({
  viewport: { width: VB, height: VH }, deviceScaleFactor: DSF, isMobile: HOCH, hasTouch: false, colorScheme: 'dark', locale: 'en-GB',
  userAgent: HOCH
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await context.addCookies([{ name: 'multihub_sprache', value: 'en', domain: new URL(BASIS).hostname, path: '/' }]);
// Ein sichtbarer Mauszeiger (headless zeichnet keinen) - folgt den echten Maus-Ereignissen, ein Klick zeigt einen Ring.
await context.addInitScript(() => {
  const an = () => {
    if (document.getElementById('__zeiger')) return;
    const z = document.createElement('div'); z.id = '__zeiger';
    z.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18 15.2 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(z.style, { position: 'fixed', left: '-100px', top: '-100px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' });
    document.documentElement.appendChild(z);
    addEventListener('mousemove', (e) => { z.style.left = `${e.clientX - 3}px`; z.style.top = `${e.clientY - 2}px`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__ring';
      Object.assign(r.style, { position: 'fixed', left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #38bdf8', zIndex: 2147483646, pointerEvents: 'none' });
      r.dataset.t0 = String(performance.now());
      document.documentElement.appendChild(r);
      const f = () => { const q = Math.min(1, (performance.now() - Number(r.dataset.t0)) / 450); r.style.transform = `scale(${1 + 0.9 * q})`; r.style.opacity = String(1 - q); if (q < 1) requestAnimationFrame(f); else r.remove(); };
      requestAnimationFrame(f);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', an); else an();
});
const page = await context.newPage();
page.on('pageerror', (e) => log('Seitenfehler:', e.message));
page.setDefaultTimeout(20000);
await page.clock.install();

/*
 * Bild fuer Bild: die Uhr der Seite steht; je Bild laeuft sie 1/30 s weiter (requestAnimationFrame, Timer, Date), dann ein Screenshot. So laeuft das Abspielen
 * der Karte im Video fluessig mit 30 Bildern/s, egal wie langsam der Runner ist (ein Screencast schaffte dort nur etwa 10).
 */
let N = 0; let aufnahme = false;
const kanal = () => page.evaluate(() => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }));
async function bild() {
  await page.clock.runFor(1000 / 30);
  await kanal().catch(() => {});
  await page.screenshot({ path: path.join(BILDER, `${String(N).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 90 });
  N += 1;
  if (N % 300 === 0) log(`Bild ${N} (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
}
async function laufe(ms) { for (let i = Math.round(ms * 30 / 1000); i > 0; i -= 1) await bild(); }
async function starte() { const j = await page.evaluate(() => Date.now()); await page.clock.pauseAt(j + 20); aufnahme = true; }
async function halte() { await page.clock.resume(); aufnahme = false; }
const T0 = Date.now();
const marken = []; const fehler = [];
function marke(name, info = {}) {
  marken.push({ name, bild: N, t: +(N / 30).toFixed(3), url: page.url(), ...info });
  log('Marke', name, (N / 30).toFixed(1));
}
async function versuch(name, f) {
  try { await f(); } catch (e) { fehler.push({ name, fehler: e.message.split('\n')[0] }); log('NICHT geklappt:', name, e.message.split('\n')[0]); }
}
/** Bilder aufnehmen, bis das Element sichtbar ist (Laden nach einem Klick). */
async function bisDa(loc, maxS = 60) {
  const ende = Date.now() + maxS * 1000;
  while (Date.now() < ende) { if (await loc.first().isVisible().catch(() => false)) return; await bild(); }
  throw new Error('nicht erschienen');
}

// ------------------------------------------------------------------ Bewegungen wie ein Mensch (je Bild ein Schritt)
let maus = { x: VB * 0.55, y: VH * 0.5 };
const glatt = (q) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
async function zeigerNach(x, y, ms = 700) {
  const n = Math.max(2, Math.round(ms * 30 / 1000)); const a = { ...maus };
  for (let i = 1; i <= n; i += 1) { const e = glatt(i / n); await page.mouse.move(a.x + (x - a.x) * e, a.y + (y - a.y) * e); await bild(); }
  maus = { x, y };
}
async function klick() { await page.mouse.down(); await bild(); await page.mouse.up(); await bild(); }
async function box(loc) { const b = await loc.first().boundingBox(); if (!b) throw new Error('nicht sichtbar'); return b; }
async function mitteVon(loc) { const b = await box(loc); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; }
async function scrolleUm(dy, ms = 1200) {
  const [a, max] = await page.evaluate(() => [scrollY, document.documentElement.scrollHeight - innerHeight]);
  const z = Math.max(0, Math.min(max, a + dy)); const n = Math.max(2, Math.round(ms * 30 / 1000));
  for (let i = 1; i <= n; i += 1) { await page.evaluate((y) => scrollTo(0, y), a + (z - a) * glatt(i / n)); await bild(); }
}
async function scrolleZu(loc, oben = 0.1, ms = 1200) { const b = await box(loc); await scrolleUm(b.y - VH * oben, ms); }
async function insBild(loc) { const b = await box(loc); if (b.y < 70 || b.y + b.height > VH - 30) await scrolleUm(b.y - VH * 0.4, 800); }
async function hin(loc, ms = 700) { await insBild(loc); const { x, y } = await mitteVon(loc); await zeigerNach(x, y, ms); }
async function hinUndKlick(loc, ms = 700, pause = 200) { await hin(loc, ms); await laufe(pause); await klick(); }

// ------------------------------------------------------------------ Drehbuch
const tagUrl = `/replays/${encodeURIComponent(TAG.windowId)}`;
const knopf = (re) => page.locator('button').filter({ hasText: re }).first();
const karte = page.locator('div[style*="perspective"]').first();
const hud = page.locator('div[style*="perspective"] [data-knopf].pointer-events-auto').first();
const hudPlay = page.locator('div[style*="perspective"] button[data-knopf][aria-label="Play"], div[style*="perspective"] button[data-knopf][aria-label="Pause"]').first();
const hudPlus = page.locator('div[style*="perspective"] button[data-knopf][aria-label="+"]').first();
const hudMinus = page.locator('div[style*="perspective"] button[data-knopf][aria-label="-"]').first();
const steuerPlay = page.locator('button.bg-sky-500').filter({ hasText: /Play|Pause/ }).first();
const elimZeichen = page.locator('div[style*="perspective"] button[data-marker][aria-label="Eliminated"]');
const spielerPfeile = page.locator('div[style*="perspective"] button[data-marker]:not([aria-label="Eliminated"]):not([aria-label="Knocked"])');
const play = async () => { if (await hudPlay.isVisible().catch(() => false)) await hinUndKlick(hudPlay, 600); else await hinUndKlick(steuerPlay, 600); };
async function tempo(ziel) {
  // Tempo ueber das HUD in der Karte (1, 4, 16, 64): so oft + oder -, bis es stimmt.
  for (let i = 0; i < 4; i += 1) {
    const t = Number((await hud.innerText().catch(() => '')).match(/(\d+)×/)?.[1] ?? 0);
    if (t === ziel || !t) { if (!t) await hinUndKlick(knopf(new RegExp(`^${ziel}×$`)), 600); return; }
    await hinUndKlick(t < ziel ? hudPlus : hudMinus, i ? 250 : 600, 100);
  }
}
async function karteZeigen(ms = 1200) { await scrolleZu(karte, HOCH ? 0.075 : 0.052, ms); }

// 1) Uebersicht
await page.goto(`${BASIS}/replays`, { waitUntil: 'domcontentloaded' });
await page.locator('section a[href^="/replays/"]').first().waitFor({ timeout: 90000 });
await page.waitForTimeout(1500);
await starte();
await page.mouse.move(maus.x, maus.y);
marke('uebersicht');
await laufe(1200);
await zeigerNach(VB * 0.45, VH * 0.55, 800);
await versuch('uebersicht-scroll', async () => { await scrolleUm(VH * 0.5, 2000); await laufe(500); await scrolleUm(-VH * 0.5, 1400); });
await versuch('uebersicht-region', async () => { await hinUndKlick(page.getByRole('button', { name: new RegExp(`^${TAG.region}$`) }), 800); await laufe(900); });
marke('uebersicht-region');
await versuch('uebersicht-tag', async () => {
  const link = page.locator(`a[href="${tagUrl}"]`).first();
  await hin(link, 900); await laufe(900); marke('uebersicht-hover');
  await klick();
});
if (!page.url().includes(tagUrl)) { await halte(); await page.goto(`${BASIS}${tagUrl}`, { waitUntil: 'domcontentloaded' }); await starte(); }

// 2) Spieltag
await bisDa(page.locator(`a[href^="${tagUrl}/"]`));
await laufe(400);
marke('spieltag');
await laufe(1000);
await versuch('spieltag-game', async () => {
  const kachel = page.locator(`a[href="${tagUrl}/${NR}"]`).first();
  await hin(kachel, 1000); await laufe(900); await klick();
});
if (!page.url().includes(`${tagUrl}/${NR}`)) { await halte(); await page.goto(`${BASIS}${tagUrl}/${NR}`, { waitUntil: 'domcontentloaded' }); await starte(); }

// 3) Das Game
marke('match-laden');
await bisDa(karte, 120);
await laufe(300);
marke('match-kopf');
await laufe(1300);
await versuch('karte-zeigen', async () => { await karteZeigen(1400); await laufe(500); });
marke('karte');

// 3a) Abspielen mit 16x: die Landung, erste Kaempfe
await versuch('abspielen', async () => {
  await tempo(16);
  await play();
  marke('abspielen');
  await zeigerNach(VB * 0.8, VH * 0.35, 900);
  await laufe(8000);
  await play();
  marke('abspielen-ende');
});

// 3b) Ein Kampf: zum dichtesten Eliminierungs-Zeichen zoomen und drueberfahren (Fenster: wer, Platz, Punkte, durch wen, Entfernung)
await versuch('kampf', async () => {
  const kb = await box(karte);
  const n = await elimZeichen.count(); if (!n) throw new Error('keine Eliminierungs-Zeichen');
  const pkte = [];
  for (let i = 0; i < Math.min(n, 150); i += 1) { const b = await elimZeichen.nth(i).boundingBox(); if (b) pkte.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); }
  const innen = pkte.filter((p) => p.x > kb.x + 60 && p.x < kb.x + kb.width - 60 && p.y > Math.max(kb.y, 70) + 60 && p.y < Math.min(kb.y + kb.height, VH) - 140);
  const nachbarn = (p) => innen.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 45).length;
  const ziel = (innen.length ? innen : pkte).sort((a, b) => nachbarn(b) - nachbarn(a))[0];
  await zeigerNach(ziel.x, ziel.y, 1000); await laufe(300);
  marke('kampf-zoom');
  for (let k = 0; k < 9; k += 1) { await page.mouse.wheel(0, -150); await bild(); await bild(); }
  await laufe(500);
  const naechstes = async (ausser = null) => {
    let best = null; const m = await elimZeichen.count();
    for (let i = 0; i < Math.min(m, 200); i += 1) {
      const b = await elimZeichen.nth(i).boundingBox(); if (!b) continue;
      const x = b.x + b.width / 2; const y = b.y + b.height / 2; const d = Math.hypot(x - maus.x, y - maus.y);
      if (x < kb.x + 40 || x > kb.x + kb.width - 40 || y < 120 || y > VH - 120) continue;
      if (ausser && Math.hypot(x - ausser.x, y - ausser.y) < 20) continue;
      if (!best || d < best.d) best = { d, x, y };
    }
    return best;
  };
  // Nur Zeichen, deren Fenster einen echten Spieler nennt (15.11.2026: im Video stand "Bot" - die KI-Gegner der Lobby haben keinen Namen).
  // Unsichtbar pruefen (Maus hin, ohne Bild), erst ein Treffer wird gefilmt.
  const fensterName = () => page.locator('div[style*="perspective"] div.pointer-events-none.absolute.z-30 p').first().innerText().catch(() => '');
  const echtesZeichen = async (ausser = []) => {
    const m = await elimZeichen.count(); const kand = [];
    for (let i = 0; i < Math.min(m, 250); i += 1) {
      const b = await elimZeichen.nth(i).boundingBox(); if (!b) continue;
      const x = b.x + b.width / 2; const y = b.y + b.height / 2;
      if (x < kb.x + 40 || x > kb.x + kb.width - 40 || y < 160 || y > VH - 160) continue;
      if (ausser.some((q) => Math.hypot(x - q.x, y - q.y) < 20)) continue;
      kand.push({ d: Math.hypot(x - maus.x, y - maus.y), x, y });
    }
    kand.sort((p, q) => p.d - q.d);
    for (const k of kand.slice(0, 40)) {
      await page.mouse.move(k.x, k.y); await page.clock.runFor(60).catch(() => {}); await page.waitForTimeout(60);
      const n = (await fensterName()).trim();
      if (n && !/^Bot$/i.test(n) && n !== '?') { await page.mouse.move(maus.x, maus.y); await page.clock.runFor(40).catch(() => {}); log('Zeichen mit Spieler:', n); return k; }
    }
    await page.mouse.move(maus.x, maus.y);
    return null;
  };
  const a = (await echtesZeichen()) ?? await naechstes(); if (!a) throw new Error('kein Zeichen nach dem Zoom');
  await zeigerNach(a.x, a.y, 700); await laufe(400);
  marke('kampf-fenster');
  await laufe(2400);
  const b = await echtesZeichen([a]);
  if (b) { await zeigerNach(b.x, b.y, 800); await laufe(400); marke('kampf-fenster2'); await laufe(2200); }
});

// 3c) Spieler: einen Pfeil auf der Karte anklicken (HUD zeigt Leben, Schild, Inventar), ein Stueck mitlaufen, dann wechseln
await versuch('spieler', async () => {
  await laufe(200);
  const kb = await box(karte);
  const n = await spielerPfeile.count(); if (!n) throw new Error('keine Spielerpfeile');
  const ok = [];
  for (let i = 0; i < Math.min(n, 120); i += 1) { const b = await spielerPfeile.nth(i).boundingBox(); if (b && b.x > kb.x + 60 && b.x < kb.x + kb.width - 80 && b.y > 140 && b.y < VH - 260) ok.push({ i, x: b.x + b.width / 2, y: b.y + b.height / 2 }); }
  if (!ok.length) throw new Error('kein Pfeil im Bild');
  ok.sort((p, q) => Math.hypot(p.x - maus.x, p.y - maus.y) - Math.hypot(q.x - maus.x, q.y - maus.y));
  await zeigerNach(ok[0].x, ok[0].y, 900); await laufe(300); await klick();
  marke('spieler-gewaehlt');
  await laufe(1500);
  await tempo(4); await play();
  await zeigerNach(VB * 0.85, VH * 0.3, 900);
  await laufe(4500);
  marke('spieler-laeuft');
  await play();
  const p2 = ok.find((p, k) => k > 0 && Math.hypot(p.x - ok[0].x, p.y - ok[0].y) > 60) ?? ok[1];
  if (p2) {
    // Position neu lesen (der Pfeil ist gelaufen)
    const b = await spielerPfeile.nth(p2.i).boundingBox();
    if (b) { await zeigerNach(b.x + b.width / 2, b.y + b.height / 2, 900); await laufe(300); await klick(); marke('spieler-wechsel'); await laufe(2200); }
  }
});

// 3d) Zonen: Zoom zuruecksetzen, "Next zone" mehrmals, dann mit 64x die Zone ziehen sehen
await versuch('zonen', async () => {
  const kb = await box(karte);
  await zeigerNach(kb.x + kb.width * 0.5, Math.min(kb.y + kb.height * 0.4, VH * 0.45), 700);
  await page.mouse.dblclick(maus.x, maus.y); await laufe(900);
  const nz = knopf(/^Next zone$/);
  await scrolleZu(nz, HOCH ? 0.55 : 0.8, 1200);
  marke('zonen-knopf');
  for (let k = 0; k < 4; k += 1) { await hinUndKlick(nz, k ? 250 : 800, 150); await laufe(900); }
  marke('zonen');
  await karteZeigen(1000);
  await tempo(64); await play();
  marke('zonen-laufen');
  await zeigerNach(VB * 0.88, VH * 0.25, 900);
  await laufe(8000);
  await play();
  marke('zonen-ende');
});

// 3e) 3D
await versuch('dreid', async () => {
  const d3 = knopf(/^3D$/);
  await scrolleZu(d3, HOCH ? 0.6 : 0.85, 1000);
  await hinUndKlick(d3, 800); await laufe(400);
  await karteZeigen(1100);
  marke('dreid');
  await laufe(2500);
  await hinUndKlick(knopf(/^2D$/), 900); await laufe(800);
});

// 3f) Kill-Feed in der Seitenleiste: Reiter, durchscrollen, Eintrag anklicken (springt dorthin)
await versuch('killfeed', async () => {
  const reiter = knopf(/^Kill feed$/i);
  await scrolleZu(reiter, HOCH ? 0.12 : 0.08, 1500);
  await hinUndKlick(reiter, 800); await laufe(500);
  marke('killfeed');
  const liste = page.locator('aside div.overflow-y-auto').last();
  const { x, b } = await mitteVon(liste);
  await zeigerNach(x, Math.min(b.y + 160, VH * 0.6), 800);
  for (let k = 0; k < 14; k += 1) { await page.mouse.wheel(0, 70); await bild(); await bild(); }
  await laufe(600);
  for (let k = 0; k < 14; k += 1) { await page.mouse.wheel(0, -70); await bild(); }
  await laufe(400);
  const eintrag = liste.locator('li button').nth(3);
  await hin(eintrag, 700); await laufe(700); await klick();
  marke('killfeed-klick');
  await laufe(1500);
});

// 3g) Reiter Hits, Teams, Players
await versuch('reiter', async () => {
  for (const [re, name] of [[/^Hits$/, 'reiter-hits'], [/^Teams$/, 'reiter-teams'], [/^Players$/, 'reiter-spieler']]) {
    const k = knopf(re); if (!(await k.count())) continue;
    await hinUndKlick(k, 700); await laufe(400); marke(name); await laufe(1600);
  }
});

// 3h) Kurve, Zonen-Tabelle, Spielerwerte
await versuch('kurve', async () => {
  const kurve = page.locator('svg.cursor-pointer').first();
  await scrolleZu(kurve, HOCH ? 0.35 : 0.45, 1600);
  const { b } = await mitteVon(kurve);
  marke('kurve');
  await zeigerNach(b.x + b.width * 0.62, b.y + b.height * 0.5, 900); await laufe(300); await klick(); await laufe(1300);
});
await versuch('zonen-tabelle', async () => {
  const kopf = page.locator('p').filter({ hasText: /^Zones$/ }).first();
  await scrolleZu(kopf, 0.08, 1600); marke('zonen-tabelle'); await laufe(2200);
});
await versuch('spielerwerte', async () => {
  const kopf = page.locator('p').filter({ hasText: /Player stats of the match/ }).first();
  await scrolleZu(kopf, 0.06, 1600); marke('spielerwerte'); await laufe(1800);
  const tab = page.locator('section div.max-h-\\[32rem\\]').last();
  const { x, y } = await mitteVon(tab);
  await zeigerNach(x, Math.min(y, VH * 0.6), 800);
  for (let k = 0; k < 16; k += 1) { await page.mouse.wheel(0, 60); await bild(); await bild(); }
  marke('spielerwerte-unten'); await laufe(1200);
});

// 4) Cup-Seite, Reiter Matches mit den REPLAY-Marken
await versuch('event', async () => {
  if (!EVENT) throw new Error('kein Cup im Katalog gefunden');
  await halte();
  const q = new URLSearchParams({ region: EVENT.region, fenster: EVENT.windowId, reiter: 'runden' });
  await page.goto(`${BASIS}/events/${encodeURIComponent(EVENT.id)}?${q}`, { waitUntil: 'domcontentloaded' });
  await page.locator('span').filter({ hasText: /^Replay$/ }).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  await starte();
  await page.mouse.move(VB * 0.5, VH * 0.4); maus = { x: VB * 0.5, y: VH * 0.4 };
  marke('event-matches', { event: EVENT });
  await laufe(1500);
  const erste = page.locator('span').filter({ hasText: /^Replay$/ }).first();
  await scrolleZu(erste, HOCH ? 0.3 : 0.35, 1600);
  await hin(erste, 1000); await laufe(400);
  marke('event-replay-marke');
  await laufe(2000);
  await scrolleUm(VH * 0.3, 1600); await laufe(800);
});
marke('ende');
await laufe(300);

// ------------------------------------------------------------------ Abschluss: Bilder -> MP4 (30 Bilder/s), Standbild je Marke
await context.close(); await browser.close();
for (const [i, m] of marken.entries()) {
  const q = path.join(BILDER, `${String(Math.min(m.bild, N - 1)).padStart(6, '0')}.jpg`);
  if (fs.existsSync(q)) fs.copyFileSync(q, path.join(STILL, `${String(i + 1).padStart(2, '0')}-${m.name}.jpg`));
}
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', path.join(BILDER, '%06d.jpg'), '-c:v', 'libx264', '-crf', '15', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', path.join(AUS, 'seite.mp4')], { stdio: 'inherit' });
fs.rmSync(BILDER, { recursive: true, force: true });
fs.writeFileSync(path.join(AUS, 'marken.json'), JSON.stringify({ format: FORMAT, viewport: [VB, VH, DSF], pixel: [PB, PH], bilder: N, dauer: +(N / 30).toFixed(2), fps: 30, marken, fehler, auswahl: auswahl.gewaehlt, event: EVENT, sekunden: (Date.now() - T0) / 1000 }, null, 1));
log('Fertig:', N, 'Bilder; Fehler:', JSON.stringify(fehler));
