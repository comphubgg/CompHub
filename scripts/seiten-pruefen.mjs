/*
 * Die Seitenpruefung: antwortet die Seite - und mit dem Richtigen?
 *
 * Der Betreiber (1.10.2026): "alles verbessern, neue Ideen suchen und testen".
 * Eine Seite, die auf einem kleinen Server laeuft, ist nicht immer da: ein
 * Aufspielen, ein Absturz, eine Ablage, die nicht antwortet. Bisher bemerkte
 * er das, wenn er selbst draufschaute. Jetzt fragt ein Ablauf alle halbe
 * Stunde die wichtigen Seiten und Schnittstellen und meldet sich nur, wenn
 * etwas nicht stimmt.
 *
 * Geprueft wird dreierlei: Antwortet sie (HTTP 200)? Ist die Antwort das, was
 * sie sein soll (eine Schnittstelle liefert JSON mit success, eine Seite
 * HTML)? Und ist sie schnell genug (ueber zehn Sekunden zaehlt als Fehler,
 * ueber fuenf als Warnung)?
 *
 * Ein Aufspielen dauert gut eine Minute und liefert dabei 502. Deshalb gilt
 * eine Adresse erst als gestoert, wenn sie auch nach vier Versuchen im
 * Abstand von 25 Sekunden nicht stimmt.
 *
 *   node scripts/seiten-pruefen.mjs            Ergebnis ausgeben, Exit 1 bei Fehlern
 *   BASIS=https://... node scripts/seiten-pruefen.mjs
 */

import fs from 'node:fs';

const BASIS = (process.env.BASIS || 'https://www.thecomphub.com').replace(/\/+$/, '');
const VERSUCHE = 4;
const PAUSE_MS = 25_000;
const FEHLER_AB_MS = 10_000;
const WARNUNG_AB_MS = 5_000;

/** Seiten (HTML) und Schnittstellen (JSON), die jeder Besucher braucht. */
const PRUEFUNGEN = [
  { pfad: '/', titel: 'Startseite', art: 'html' },
  { pfad: '/statistics', titel: 'Statistik', art: 'html' },
  { pfad: '/events', titel: 'Events', art: 'html' },
  { pfad: '/power-rankings', titel: 'Rankings', art: 'html' },
  { pfad: '/tierlist', titel: 'Tierlist', art: 'html' },
  { pfad: '/tournament-maps', titel: 'Tournament Maps', art: 'html' },
  { pfad: '/overlay/standings.html', titel: 'Overlay Leaderboard', art: 'html' },
  { pfad: '/overlay/banner.html', titel: 'Overlay Team Banner', art: 'html' },
  { pfad: '/overlay/offspawn.html', titel: 'Overlay Custom', art: 'html' },
  { pfad: '/api/szene-stats?ansicht=start&saison=S42', titel: 'Statistik-Startansicht', art: 'json', erwarte: (j) => j?.success === true && Array.isArray(j.listen) && j.listen.length > 0 },
  { pfad: '/api/replays', titel: 'Replay-Uebersicht', art: 'json', erwarte: (j) => j?.success === true && Array.isArray(j.fenster) && j.fenster.length > 0 },
  { pfad: '/api/orgs', titel: 'Organisationen', art: 'json', erwarte: (j) => Array.isArray(j?.orgs) && j.orgs.length > 10 },
  { pfad: '/api/turnier-karten?liste=1', titel: 'Turnierkarten', art: 'json', erwarte: (j) => Array.isArray(j?.karten) },
  { pfad: '/api/globals-teams?fenster=MannekenPis_Day1', titel: 'Globals-Teams', art: 'json', erwarte: (j) => Array.isArray(j?.teams) && j.teams.length > 0 },
];

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function einmal(p) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASIS + p.pfad, { redirect: 'follow', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'comphub-seitenpruefung' } });
    const ms = Date.now() - t0;
    if (r.status !== 200) return { ok: false, ms, grund: `HTTP ${r.status}` };
    if (p.art === 'json') {
      let j;
      try { j = await r.json(); } catch { return { ok: false, ms, grund: 'Antwort ist kein JSON' }; }
      if (p.erwarte && !p.erwarte(j)) return { ok: false, ms, grund: 'Antwort hat nicht den erwarteten Inhalt' };
    } else {
      const text = await r.text();
      if (!/<html/i.test(text)) return { ok: false, ms, grund: 'Antwort ist keine Seite' };
    }
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, grund: `keine Antwort (${(e instanceof Error ? e.message : String(e)).slice(0, 60)})` };
  }
}

async function pruefe(p) {
  let letzter = null;
  for (let v = 1; v <= VERSUCHE; v++) {
    letzter = await einmal(p);
    if (letzter.ok && letzter.ms <= FEHLER_AB_MS) return { ...p, ...letzter, versuche: v };
    if (v < VERSUCHE) await warte(PAUSE_MS);
  }
  if (letzter.ok) return { ...p, ...letzter, ok: false, grund: `zu langsam (${(letzter.ms / 1000).toFixed(1)} s)`, versuche: VERSUCHE };
  return { ...p, ...letzter, versuche: VERSUCHE };
}

// Nacheinander: der kleine Server beantwortet vierzehn gleichzeitige Fragen langsam,
// und eine Pruefung, die ihn belastet, misst nicht mehr, wie er im Alltag antwortet.
const ergebnisse = [];
for (const p of PRUEFUNGEN) ergebnisse.push(await pruefe(p));
const fehler = ergebnisse.filter((e) => !e.ok);
const langsam = ergebnisse.filter((e) => e.ok && e.ms > WARNUNG_AB_MS);

for (const e of ergebnisse) {
  console.log(`${e.ok ? 'OK    ' : 'FEHLER'} ${String(e.titel).padEnd(26)} ${String(e.ms).padStart(6)} ms${e.ok ? '' : '  ' + e.grund}${e.versuche > 1 ? `  (Versuch ${e.versuche})` : ''}`);
}
console.log(`\n${ergebnisse.length - fehler.length} von ${ergebnisse.length} in Ordnung, ${fehler.length} gestoert, ${langsam.length} langsam.`);

// Fuer den Ablauf: der Text fuer die Meldung.
const text = [
  ...fehler.map((e) => `**${e.titel}** (${e.pfad}): ${e.grund}`),
  ...langsam.map((e) => `${e.titel} antwortet langsam: ${(e.ms / 1000).toFixed(1)} s`),
].join('\n');
fs.writeFileSync('seitenpruefung.txt', text);
process.exitCode = fehler.length ? 1 : 0;
