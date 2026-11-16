// Die schlanken Replay-Werte nachholen, die die Seite braucht - fuer jeden Spieltag, dessen Auswertung neuer ist als seine schlanke Fassung.
//
// Der Betreiber (26.10.2026): "No replays analysed" bei einem Cup vom 22.10., obwohl die Replays laengst da sind. Ursache: die Seite liest je Spieltag
// nur die schlanke Fassung (replays-schlank/<S>/<window>.json, siehe lib/replaySchlank.ts) - und die entstand allein im stuendlichen Gesamtlauf und kam am
// Ende seines gedeckelten Hochladens kaum je an. Am Release stand die jüngste schlanke Datei auf dem 11.10.2026, waehrend die Auswertungen selbst
// (replays/<S>/<window>/_aggregat.json) minutenfrisch waren.
//
// Dieses Skript laeuft eigenstaendig (.github/workflows/replays-schlank.yml): es vergleicht die beiden Verzeichnisse der Releases, holt nur die
// Auswertungen (+ Staende), deren schlanke Fassung fehlt oder aelter ist, und legt daraus die schlanken Dateien an. Hochgeladen wird danach vom Ablauf.
//
//   node scripts/replays-schlank-holen.mjs [--hoechstens 60] [--saison S43[,S44]]
//
// Ohne --saison alle Saisons ab S42, die am Release Auswertungen haben (16.11.2026). Vorher galt S42 fest: der Ablauf rief das Skript ohne --saison auf,
// und keine schlanke Fassung von S43 entstand hier. Fehlte sie, weil die Auswertung aus "Replays nacharbeiten" kam (laedt nur replays/ hoch), blieb die
// Seite leer - Performance Evaluation Cup Event 2 Round 1 NAC: Auswertung seit 14.11. 14:08 am Release, schlanke Fassung erst am 16.11. 11:54 (durch
// eine Vorrang-Anfrage der Seite), dazwischen "keine Spieler" in den Player Stats, Event MVP, Countries und Leaders. Ausserdem warf das Skript, wenn das
// Saison-Release selbst kein Verzeichnis hat (daten-replays-s43: 0 Anhaenge, alles liegt in -b und -c).

import { spawnSync } from 'node:child_process';
import { ERSTE_GETEILTE_SAISON, LETZTE_SAISON } from '../lib/releaseTags.mjs';

const arg = process.argv.slice(2);
const wert = (name, standard) => { const i = arg.indexOf(name); return i >= 0 && arg[i + 1] ? arg[i + 1] : standard; };
const HOECHSTENS = Number(wert('--hoechstens', 40));
const SAISON_WAHL = String(wert('--saison', '')).toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';

/** Das Verzeichnis eines Releases; null, wenn es keins gibt (404) - jeder andere Fehler bricht ab, damit ein Netzfehler nicht als "leer" gilt. */
async function manifest(tag) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' }, signal: AbortSignal.timeout(120_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Verzeichnis ${tag}: HTTP ${r.status}`);
  return r.json();
}

// Die Auswertungen liegen im Saison-Release und in den Ueberlauf-Releases (-b, -c, siehe lib/releaseTags.mjs); gilt die juengste Fassung.
const aggregate = {};
const schlank = {};
const kandidaten = SAISON_WAHL.length ? SAISON_WAHL.map((s) => s.replace(/\D/g, '')) : [];
if (!kandidaten.length) for (let n = ERSTE_GETEILTE_SAISON; n <= LETZTE_SAISON; n += 1) kandidaten.push(String(n));
/** Die Saisons, die wirklich Auswertungen am Release haben. */
const saisons = [];
for (const nr of kandidaten) {
  let da = false;
  for (const tag of [`daten-replays-s${nr}`, `daten-replays-s${nr}-b`, `daten-replays-s${nr}-c`]) {
    const m = await manifest(tag);
    if (!m) continue;
    da = true;
    for (const [k, v] of Object.entries(m)) if (!aggregate[k] || (Date.parse(v.zeit ?? '') || 0) > (Date.parse(aggregate[k].zeit ?? '') || 0)) aggregate[k] = v;
  }
  // Ohne --saison: die erste Saison ohne jedes Replay-Release beendet die Suche (die naechste hat erst recht keins).
  if (!da) { if (!SAISON_WAHL.length && Number(nr) > ERSTE_GETEILTE_SAISON) break; continue; }
  saisons.push(nr);
  Object.assign(schlank, (await manifest(`daten-replays-schlank-s${nr}`)) ?? {});
}

// Schlanke Fassungen von vor diesem Stand zaehlten Selbst-Eliminierungen als Kill (siehe replays-schlank.mjs, v2) - sie werden einmal alle neu gebaut.
const SCHLANK_STAND = Date.parse('2026-10-28T19:15:00Z');
// Davon hoechstens zehn je Durchgang: jede neue Fassung ist ein Hochladen, und das Schreibkontingent der Ablaeufe ist knapp (Aufgabe 144).
const STAND_JE_DURCHGANG = 10;
const noetig = [];
for (const [anhang, m] of Object.entries(aggregate)) {
  const t = /^replays__(S\d+)__(.+)___aggregat\.json$/i.exec(anhang);
  if (!t || !saisons.includes(t[1].replace(/\D/g, ''))) continue;
  const s = schlank[`replays-schlank__${t[1]}__${t[2]}.json`];
  const agg = Date.parse(m.zeit ?? '') || 0;
  const sl = Date.parse(s?.zeit ?? '') || 0;
  // Eine vorhandene schlanke Fassung gilt als veraltet, wenn die Auswertung mehr als drei Stunden juenger ist (laufende Cups bekommen sie in der Live-Schleife)
  const veraltet = !s || agg - sl > 3 * 3600_000;
  if (veraltet || sl < SCHLANK_STAND) noetig.push({ fenster: t[2], saison: t[1], agg, fehlt: !s, nurStand: !veraltet });
}
// Frisches zuerst; was ganz fehlt, vor dem, was nur veraltet ist.
noetig.sort((a, b) => (b.fehlt - a.fehlt) || (b.agg - a.agg));
console.log(`S${saisons.join('/S')}: ${noetig.length} Spieltage mit fehlender oder veralteter schlanker Fassung (${noetig.filter((x) => x.fehlt).length} ganz ohne, ${noetig.filter((x) => x.nurStand).length} nur wegen Fassung v2 - davon ${STAND_JE_DURCHGANG} je Durchgang).`);

let standDran = 0;
const heute = noetig.filter((x) => !x.nurStand || (standDran += 1) <= STAND_JE_DURCHGANG).slice(0, HOECHSTENS);
const namen = heute.flatMap((x) => [`replays/${x.saison}/${x.fenster}/_aggregat.json`, `replays/${x.saison}/${x.fenster}/_zustand.json`]);
for (let i = 0; i < namen.length; i += 30) {
  const r = spawnSync(process.execPath, ['scripts/ablage-github-holen.mjs', ...namen.slice(i, i + 30)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const zeilen = String(r.stdout ?? '').split('\n').filter((z) => /Fertig:|!  /.test(z));
  console.log(`  geholt ${Math.min(i + 30, namen.length)}/${namen.length}: ${zeilen.join(' | ') || 'ok'}`);
}
const s = spawnSync(process.execPath, ['scripts/replays-schlank.mjs'], { stdio: 'inherit' });
process.exit(s.status ?? 0);
