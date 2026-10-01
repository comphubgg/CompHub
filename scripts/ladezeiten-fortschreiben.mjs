/*
 * Der Ladezeiten-Verlauf der Seitenpruefung.
 *
 * Der Betreiber (1.10.2026) hat den Vorschlag freigegeben: "Ladezeiten-Verlauf
 * der Seiten". Render ist im Gratis-Tarif manchmal zaeh; mit einem einzelnen
 * Messwert sieht man nicht, ob es ein Ausrutscher war oder ein Dauerzustand.
 *
 * Die Seitenpruefung (scripts/seiten-pruefen.mjs) schreibt je Lauf
 * ladezeiten-neu.json. Dieses Skript haengt den Lauf an den Verlauf am Release
 * "daten-ladezeiten" an (die letzten 400 Laeufe, rund acht Tage), und meldet
 * eine Seite, die ueber drei Laeufe hinweg deutlich langsamer ist als sonst:
 * mehr als das Dreifache ihres Medians der letzten 24 Stunden und mehr als
 * drei Sekunden. Je Seite hoechstens eine Meldung in zwoelf Stunden.
 *
 *   node scripts/ladezeiten-fortschreiben.mjs
 *   Schreibt ladezeiten.json (zum Hochladen) und ladezeiten-alarm.txt (leer, wenn nichts zu melden ist).
 */

import fs from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const BEHALTEN = 400;
const FENSTER = 48; // Laeufe = 24 Stunden
const MINDEST_MS = 3000;
const FAKTOR = 3;
const RUHE_MS = 12 * 60 * 60_000;

const neu = JSON.parse(fs.readFileSync('ladezeiten-neu.json', 'utf8'));
let alt = { verlauf: [], alarmiert: {} };
try {
  const r = await fetch(`https://github.com/${REPO}/releases/download/daten-ladezeiten/ladezeiten.json`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (r.ok) alt = await r.json();
} catch { /* noch kein Verlauf - dann beginnt er hier */ }

const verlauf = [...(alt.verlauf ?? []), { t: neu.zeit, w: neu.werte }].slice(-BEHALTEN);
const alarmiert = { ...(alt.alarmiert ?? {}) };
const jetzt = Date.parse(neu.zeit);
const median = (z) => { const s = [...z].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const meldungen = [];
for (const titel of Object.keys(neu.werte)) {
  const reihe = verlauf.map((e) => e.w?.[titel]).filter((x) => typeof x === 'number');
  if (reihe.length < 15) continue; // zu wenig, um "sonst" zu kennen
  const letzte3 = reihe.slice(-3);
  const frueher = reihe.slice(-(FENSTER + 3), -3);
  const med = median(frueher);
  const schwelle = Math.max(MINDEST_MS, FAKTOR * med);
  if (letzte3.length === 3 && letzte3.every((x) => x > schwelle)) {
    if (jetzt - (alarmiert[titel] ?? 0) > RUHE_MS) {
      alarmiert[titel] = jetzt;
      meldungen.push(`**${titel}** antwortet seit drei Pruefungen langsam: ${letzte3.map((x) => (x / 1000).toFixed(1)).join(' / ')} s (sonst etwa ${(med / 1000).toFixed(1)} s).`);
    }
  } else if (letzte3[2] <= Math.max(1500, 1.5 * med)) {
    delete alarmiert[titel]; // wieder normal: die naechste Verlangsamung darf wieder melden
  }
}

fs.writeFileSync('ladezeiten.json', JSON.stringify({ verlauf, alarmiert }));
fs.writeFileSync('ladezeiten-alarm.txt', meldungen.join('\n'));
console.log(`Verlauf: ${verlauf.length} Laeufe; Meldungen: ${meldungen.length}`);
