// Diagnose (23.11.2026): Warum fehlt der aktuell live laufende PlayStation Cup im Katalog?
//
// CompHub fragt Epics events/download nur mit platform=Windows und platform=Android ab
// (lib/epicCups.ts: rohEventsFuer). PlayStation-Cups sind konsolen-exklusiv - diese
// Diagnose prueft, unter welcher (Region, Plattform)-Kombination Epic das live laufende
// PlayStation-Fenster ueberhaupt ausliefert, und was der heutige Fetch (Windows/Android)
// deshalb verfehlt. Epic ist in der Sandbox gesperrt, darum laeuft das hier auf dem Runner.
//   node scripts/abgleich-playstation.mjs            (Argument wird ignoriert)
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
// Windows+Android = heutiger Fetch. Der Rest ist der Vergleich: Konsole/Mobile-Varianten.
const PLATTFORMEN = ['Windows', 'Android', 'PS4', 'PS5', 'XSX', 'XboxOne', 'Switch', 'Switch2'];
const JETZT = Date.now();

const istPS = (s) => /playstation|_ps_|_ps$|consolecup|console_cup/i.test(String(s || ''));
const z = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);

async function holeEvents(region, platform) {
  for (let v = 0; v < 3; v++) {
    const { token, accountId } = await holeNutzerToken();
    const teil = region ? `region=${encodeURIComponent(region)}&` : '';
    const plat = platform ? `platform=${encodeURIComponent(platform)}&` : '';
    const url = `${EVENTS}/api/v1/events/Fortnite/download/${accountId}?${teil}${plat}teamAccountIds=${accountId}`;
    let r = null;
    try { r = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }); }
    catch { await warte(1200); continue; }
    if (r.ok) return r.json();
    if (r.status === 401) { verwirfNutzerToken(); await warte(800); continue; }
    if (r.status === 404) return { events: [] };
    await warte(1200);
  }
  return { events: [], _fehler: true };
}

// eventId -> gesammelte Infos ueber alle (Region, Plattform)-Abrufe hinweg.
const events = new Map();
const plattformKennungen = new Set();
const gesehenProRegion = {}; // "region/platform" -> Anzahl Events (fuer die Rohuebersicht)

function merke(region, platform, j) {
  const liste = j?.events ?? [];
  gesehenProRegion[`${region || '-'}/${platform || '-'}`] = liste.length;
  for (const ev of liste) {
    for (const p of ev.platforms ?? []) plattformKennungen.add(p);
    let e = events.get(ev.eventId);
    if (!e) {
      e = { eventId: ev.eventId, displayDataId: ev.displayDataId, regions: ev.regions ?? [],
            platforms: ev.platforms ?? [], fenster: new Map(), kombis: new Set() };
      events.set(ev.eventId, e);
    }
    e.kombis.add(`${region || 'ALLE'}/${platform || 'ALLE'}`);
    for (const w of ev.eventWindows ?? []) {
      if (!e.fenster.has(w.eventWindowId)) {
        const begin = Date.parse(w.beginTime), end = Date.parse(w.endTime);
        e.fenster.set(w.eventWindowId, {
          windowId: w.eventWindowId, begin, end,
          live: JETZT >= begin && JETZT <= end,
          vorbei: JETZT > end, kommt: JETZT < begin,
          tokens: [...(w.requireAllTokens ?? []), ...(w.requireAnyTokens ?? [])].filter((t) => t && t !== 'fake_token'),
          kombis: new Set(),
        });
      }
      e.fenster.get(w.eventWindowId).kombis.add(`${region || 'ALLE'}/${platform || 'ALLE'}`);
    }
  }
}

console.log(`=== PlayStation-Cup-Diagnose  jetzt=${z(JETZT)} UTC ===`);

// 1) Rohliste: ohne Region, einmal je Plattform - zeigt alles, was Epic grundsaetzlich fuehrt.
for (const p of ['Windows', 'PS5', 'Android']) merke(null, p, await holeEvents(null, p));
// 2) ohne Region UND ohne Plattform.
merke(null, null, await holeEvents(null, null));
// 3) Die Matrix: jede Region x jede Plattform.
for (const region of REGIONEN) {
  for (const platform of PLATTFORMEN) { merke(region, platform, await holeEvents(region, platform)); await warte(250); }
}

console.log('\n--- Von Epic verwendete Plattform-Kennungen (ueber alle Events) ---');
console.log([...plattformKennungen].sort().join(', ') || '(keine)');

console.log('\n--- Rohuebersicht: Anzahl Events je (Region/Plattform) ---');
for (const [k, n] of Object.entries(gesehenProRegion)) if (n) console.log(`  ${k}: ${n}`);

const psEvents = [...events.values()].filter((e) => istPS(e.eventId) || istPS(e.displayDataId)
  || (e.platforms.length && e.platforms.every((p) => /^PS\d/i.test(p))));

console.log(`\n=== PlayStation-/Konsolen-Events gefunden: ${psEvents.length} ===`);
for (const e of psEvents) {
  console.log(`\nEVENT ${e.eventId}`);
  console.log(`  displayDataId: ${e.displayDataId}`);
  console.log(`  regions:   [${e.regions.join(', ')}]`);
  console.log(`  platforms: [${e.platforms.join(', ')}]`);
  console.log(`  sichtbar unter: ${[...e.kombis].sort().join('  ')}`);
  for (const w of e.fenster.values()) {
    const st = w.live ? 'LIVE' : w.kommt ? 'kommt' : 'vorbei';
    console.log(`    FENSTER ${w.windowId}`);
    console.log(`       ${st}  ${z(w.begin)} -> ${z(w.end)}  tokens=[${w.tokens.join(',')}]`);
    console.log(`       sichtbar unter: ${[...w.kombis].sort().join('  ')}`);
  }
}

// Kernfrage: Gibt es ein LIVE PlayStation-Fenster, das der heutige Fetch (Windows/Android
// ueber REGIONEN) NICHT sieht? Ein Fenster gilt als "heute sichtbar", wenn es unter
// irgendeiner Region mit Windows oder Android auftaucht.
const heutigeKombi = (k) => {
  const [, p] = k.split('/');
  return p === 'Windows' || p === 'Android';
};
console.log('\n=== KERN: live PlayStation-Fenster und ob der heutige Fetch sie faengt ===');
let verpasst = 0;
for (const e of psEvents) {
  for (const w of e.fenster.values()) {
    if (!w.live) continue;
    const vomHeutigenFetch = [...w.kombis].some(heutigeKombi);
    const nurUnter = [...w.kombis].sort().join(', ');
    console.log(`  ${w.live ? 'LIVE' : ''} ${w.windowId}  (event ${e.eventId})`);
    console.log(`     heutiger Fetch (Windows/Android) faengt es: ${vomHeutigenFetch ? 'JA' : 'NEIN'}`);
    console.log(`     sichtbar nur unter: ${nurUnter}`);
    if (!vomHeutigenFetch) verpasst++;
  }
}
console.log(`\n=== ERGEBNIS: ${verpasst} live PlayStation-Fenster werden vom heutigen Fetch verpasst. ===`);
if (verpasst === 0 && !psEvents.some((e) => [...e.fenster.values()].some((w) => w.live))) {
  console.log('(Kein live PlayStation-Fenster ueber IRGENDEINEN Endpoint gefunden - entweder gerade keins live oder Epic liefert es nicht.)');
}
