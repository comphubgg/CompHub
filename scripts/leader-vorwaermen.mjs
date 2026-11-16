// Tournament Leaders der juengsten Spieltage auf der Seite vorrechnen lassen (16.11.2026).
//
// app/api/turnier-leader hebt jede Antwort auf (lib/antwortSpeicher) und liefert sie danach sofort aus; ein beendeter Spieltag bleibt zwoelf Stunden frisch.
// Damit niemand die erste Rechnung abwarten muss und neue Replay-Werte gleich in den Leaders stehen, fragt dieser Schritt nach dem Ablegen neuer
// Clutch-Dateien die FNCS-Spieltage der letzten drei Tage einmal mit ?neu=1 ab (neu gerechnet nur, wenn die aufgehobene Antwort aelter als 5 Minuten ist).
//
//   node scripts/leader-vorwaermen.mjs https://www.thecomphub.com [--tage 3]

const SEITE = (process.argv[2] || 'https://www.thecomphub.com').replace(/\/+$/, '');
const arg = process.argv.slice(3);
const TAGE = Number(arg[arg.indexOf('--tage') + 1]) || 3;
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

async function json(pfad, ms = 90_000) {
  const r = await fetch(SEITE + pfad, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'comphub-vorwaermen' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const grenze = Date.now() - TAGE * 864e5;
const auftraege = [];
for (const region of REGIONEN) {
  try {
    const { fenster = [] } = await json(`/api/turnier-leader?fncs=1&region=${region}`, 30_000);
    for (const f of fenster) {
      if ((f.begin ?? 0) < grenze || (f.begin ?? 0) > Date.now()) continue;
      auftraege.push(`/api/turnier-leader?window=${encodeURIComponent(f.window)}&event=${encodeURIComponent(f.event)}`
        + `${f.windows?.length > 1 ? `&windows=${f.windows.map(encodeURIComponent).join(',')}` : ''}&neu=1`);
    }
  } catch (e) { console.log(`  ${region}: Liste nicht erreichbar (${e.message})`); }
}
let k = 0; let gut = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (k < auftraege.length) {
    const a = auftraege[k++];
    const t0 = Date.now();
    try {
      const d = await json(a);
      gut += 1;
      console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${decodeURIComponent(a.split('window=')[1].split('&')[0])}${d.fehlend?.length ? ` (ohne: ${d.fehlend.map((x) => x.schluessel).join(', ')})` : ''}`);
    } catch (e) { console.log(`  !  ${a}: ${e.message}`); }
  }
}));
console.log(`Leaders vorgewaermt: ${gut} von ${auftraege.length}`);
