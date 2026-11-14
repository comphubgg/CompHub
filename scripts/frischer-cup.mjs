// Zaehlt Spieltage, die gerade laufen oder vor hoechstens 3 Stunden zu Ende gingen (Katalog der Seite). Fuer den Vorrang in clutch-rechnen.yml.
const url = 'https://www.thecomphub.com/api/cup-catalog?modus=alle';
let n = 0;
try {
  const j = await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).json();
  const grenze = Date.now() - 3 * 3600e3;
  for (const c of j.cups ?? []) for (const l of Object.values(c.regionen ?? {})) for (const w of l) {
    if (w.status === 'live' || (w.status === 'vorbei' && (w.end ?? 0) > grenze)) n += 1;
  }
} catch { /* dann 0 - kein Abbruch */ }
console.log(n);
