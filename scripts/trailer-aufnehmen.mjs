// Die Aufnahmen fuer den Trailer.
//
// Faehrt jede Seite des Werkzeugs an, wartet, bis wirklich etwas dasteht, und
// legt einen Screenshot ab. Aufgenommen wird groesser als das spaetere Video
// (1920x1080 gegen 1280x720), damit sich im Film hinein- und herausfahren
// laesst, ohne dass es unscharf wird.
//
// Aufruf:  node scripts/trailer-aufnehmen.mjs
// Ergebnis: dist/trailer/*.png

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const WURZEL = path.join(path.dirname(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1'), '..');
const ZIEL = path.join(WURZEL, 'dist', 'trailer');
const SERVER = process.env.COMPHUB_SERVER || 'http://localhost:3000';

mkdirSync(ZIEL, { recursive: true });

/**
 * Die Szenen des Films.
 *
 * "warten" ist die Zahl der Millisekunden nach dem Laden - die Seiten holen
 * ihre Daten erst im Browser, und ein zu frueher Schnappschuss zeigt leere
 * Kaesten. "tun" darf vorher noch klicken oder scrollen.
 */
const SZENEN = [
  { name: '01-home', pfad: '/', titel: 'CompHub',
    unter: 'Everything about competitive Fortnite in one place', warten: 4000 },
  { name: '02-streams', pfad: '/streams', titel: 'Streams',
    unter: 'Who is live right now — sorted into your own folders', warten: 5000 },
  { name: '03-rankings', pfad: '/power-rankings', titel: 'Power Rankings',
    unter: 'Ten thousand players, refreshed every night', warten: 6000 },
  { name: '04-events', pfad: '/events', titel: 'Events',
    unter: '269 tournaments straight from Epic', warten: 6000 },
  { name: '05-event', pfad: '/events/s39_perfeval', titel: 'Every match day',
    unter: 'Leaderboard, prize pool — and the points it takes to qualify',
    warten: 8000 },
  { name: '06-statistik', pfad: '/statistiken', titel: 'Statistics',
    unter: 'Damage, mats, builds — numbers Epic never publishes',
    warten: 7000 },
  { name: '07-turniere', pfad: '/statistiken', titel: 'Every past final',
    unter: 'Kept and searchable, season after season', warten: 7000,
    tun: async (s) => { await klick(s, 'Tournaments', 'Turniere'); await s.waitForTimeout(4000); } },
  { name: '08-regionen', pfad: '/statistiken', titel: 'Seven regions',
    unter: 'EU, NAC, NAW, BR, ASIA, ME, OCE — each on its own', warten: 7000,
    tun: async (s) => { await klick(s, 'Regions', 'Regionen'); await s.waitForTimeout(4000); } },
  { name: '09-spieler', pfad: '/statistiken', titel: 'Player profiles',
    unter: 'Form, history and career bests per account', warten: 7000,
    tun: async (s) => { await klick(s, 'Players', 'Spieler'); await s.waitForTimeout(4000); } },
  { name: '10-tierlist', pfad: '/tierlist', titel: 'Tierlist',
    unter: 'Rank the duos — ordered by real standing, not the alphabet',
    warten: 9000 },
  { name: '11-karten', pfad: '/karten', titel: 'Drop maps',
    unter: 'Assign landing spots and share them as one image', warten: 8000 },
  { name: '12-vip', pfad: '/overlays', titel: 'VIP access',
    unter: 'The overlays are part of VIP — granted, not unlocked', warten: 4000 },
  { name: '13-anmelden', pfad: '/anmelden', titel: 'Sign up',
    unter: 'Two fields and you are in', warten: 3000 },
];

/** Klickt einen Knopf, egal ob die Seite deutsch oder englisch steht. */
async function klick(seite, en, de) {
  for (const text of [en, de]) {
    const k = seite.getByRole('button', { name: text, exact: true }).first();
    if (await k.count().catch(() => 0)) {
      try { await k.click({ timeout: 3000 }); return true; } catch { /* weiter */ }
    }
  }
  return false;
}

const browser = await chromium.launch();
const kontext = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  // Englisch, weil der Trailer international laufen soll.
  extraHTTPHeaders: { 'Accept-Language': 'en' },
});
await kontext.addCookies([{
  name: 'multihub_sprache', value: 'en', url: SERVER,
}]);

const seite = await kontext.newPage();
const gemacht = [];

for (const s of SZENEN) {
  process.stdout.write(`${s.name} … `);
  try {
    await seite.goto(SERVER + s.pfad, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await seite.waitForTimeout(s.warten);
    if (s.tun) await s.tun(seite);
    // Bewegte Bilder anhalten, damit kein halber Uebergang im Bild steht.
    await seite.addStyleTag({ content:
      '*,*::before,*::after{animation-play-state:paused!important;'
      + 'transition:none!important}' }).catch(() => {});
    await seite.screenshot({ path: path.join(ZIEL, `${s.name}.png`) });
    gemacht.push({ ...s, datei: `${s.name}.png` });
    console.log('ok');
  } catch (e) {
    console.log('fehlgeschlagen:', e.message.split('\n')[0]);
  }
}

/* Die Overlays selbst - sie sind oeffentlich und zeigen, was in OBS landet. */
const OVERLAYS = [
  { name: '14-banner', titel: 'Overlays for OBS',
    unter: 'A banner that finds its own match day',
    pfad: '/overlay/banner.html?server=' + encodeURIComponent(SERVER)
      + '&auto=EU&vorlage=nacht&hoehe=140',
    breite: 1000, hoehe: 220 },
  { name: '15-bestenliste', titel: 'And the full table',
    unter: 'A second source, in your colours',
    pfad: '/overlay/leaderboard.html?server=' + encodeURIComponent(SERVER)
      + '&auto=EU&from=1&to=10',
    breite: 900, hoehe: 620 },
];

for (const o of OVERLAYS) {
  process.stdout.write(`${o.name} … `);
  try {
    const p2 = await kontext.newPage();
    await p2.setViewportSize({ width: o.breite, height: o.hoehe });
    await p2.goto(SERVER + o.pfad, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p2.waitForTimeout(9000);
    await p2.screenshot({ path: path.join(ZIEL, `${o.name}.png`), omitBackground: true });
    await p2.close();
    gemacht.push({ ...o, datei: `${o.name}.png` });
    console.log('ok');
  } catch (e) {
    console.log('fehlgeschlagen:', e.message.split('\n')[0]);
  }
}

await browser.close();

const { writeFileSync } = await import('fs');
writeFileSync(path.join(ZIEL, 'szenen.json'),
  JSON.stringify(gemacht.map(({ name, titel, unter, datei }) =>
    ({ name, titel, unter, datei })), null, 2));
console.log(`\n${gemacht.length} Aufnahmen in dist/trailer`);
