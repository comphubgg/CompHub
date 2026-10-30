// Hat die Schnellspur gerade Vorrang? Code 0 = ja (die Nacharbeiter machen ihre Rechner frei), 1 = nein.
//
// Der Betreiber (30.10.2026): nach grossen Cups pausiert die Nacharbeit, damit die Schnellspur zehn Rechner bekommt - spaetestens eine Stunde nach
// Cup-Ende soll alles ausgewertet sein. GitHub laesst hoechstens zwanzig Auftraege zugleich laufen.
//
// Das Signal schreibt die Schnellspur nach jedem Lauf an den Release "signale" (replays-schnell.yml); gelesen wird ohne API ueber den oeffentlichen
// Download-Link, das gemeinsame Kontingent bleibt unberuehrt. Fehlt es oder ist es alt, hat niemand Vorrang.

const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const AB_OFFEN = Number(process.env.VORRANG_AB || 400);
const FRISCH_MIN = 45;

try {
  const r = await fetch(`https://github.com/${REPO}/releases/download/signale/schnell-last.json`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error('kein Signal');
  const s = await r.json();
  const alter = (Date.now() - Date.parse(s.zeit)) / 60_000;
  const offen = Math.max(Number(s.offen) || 0, Number(s.rest) || 0);
  const vorrang = alter < FRISCH_MIN && offen >= AB_OFFEN;
  console.log(`Schnellspur: ${offen} offen, Signal ${Math.round(alter)} min alt - ${vorrang ? 'hat Vorrang' : 'kein Vorrang'}`);
  process.exitCode = vorrang ? 0 : 1;
} catch {
  process.exitCode = 1;
}
