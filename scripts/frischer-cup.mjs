// Zaehlt Spieltage, die gerade laufen oder vor hoechstens 3 Stunden zu Ende gingen (Katalog der Seite). Fuer den Vorrang in clutch-rechnen.yml.
//
//   node scripts/frischer-cup.mjs                 alle Spieltage (laufend oder bis 3 h vorbei)
//   node scripts/frischer-cup.mjs --gross [--nach 90]
//                                                 nur grosse Cups (FNCS, Cash, Performance Evaluation, Division, LAN ... - wie cupVorrang 0 in
//                                                 lib/replayRegel.mjs), laufend oder bis --nach Minuten vorbei (Standard 90: Matches laufen nach dem Ende
//                                                 noch rund 25 Minuten, danach kommen die letzten Replays). Ranked- und Zero-Build-Cups laufen fast immer
//                                                 irgendwo - sie zaehlen hier nicht, sonst gaebe es nie freie Rechner (15.11.2026).
//   --liste                                       statt der Zahl die windowIds, mit | getrennt
//
// Ohne Import: clutch-rechnen.yml holt dieses Skript auch einzeln von raw.githubusercontent.com. Bei einem Fehler 0 - kein Abbruch.
const url = 'https://www.thecomphub.com/api/cup-catalog?modus=alle';
const arg = process.argv.slice(2);
const gross = arg.includes('--gross');
const i = arg.indexOf('--nach');
const nachMin = i >= 0 ? Number(arg[i + 1]) : (gross ? 90 : 180);
const vorrang0 = (w) => !/(^|_)ZB(_|$)|ZeroBuild|Ranked/i.test(w) && /Cash|FNCS|PerformanceEvaluation|Division|EWC|Elite|LAN|Global/i.test(w);
const treffer = new Set();
try {
  const j = await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).json();
  const grenze = Date.now() - nachMin * 60_000;
  for (const c of j.cups ?? []) for (const l of Object.values(c.regionen ?? {})) for (const w of l) {
    if (gross && !vorrang0(String(w.windowId ?? ''))) continue;
    if (w.status === 'live' || (w.status === 'vorbei' && (w.end ?? 0) > grenze)) treffer.add(`${w.windowId ?? w.name}#${w.begin}`);
  }
} catch { /* dann 0 - kein Abbruch */ }
console.log(arg.includes('--liste') ? [...treffer].map((t) => t.split('#')[0]).join('|') : treffer.size);
