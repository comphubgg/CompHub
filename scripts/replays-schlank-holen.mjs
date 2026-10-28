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
//   node scripts/replays-schlank-holen.mjs [--hoechstens 60] [--saison S42]

import { spawnSync } from 'node:child_process';

const arg = process.argv.slice(2);
const wert = (name, standard) => { const i = arg.indexOf(name); return i >= 0 && arg[i + 1] ? arg[i + 1] : standard; };
const HOECHSTENS = Number(wert('--hoechstens', 40));
const SAISON = String(wert('--saison', 'S42')).toUpperCase();
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const nr = SAISON.replace(/\D/g, '');

async function manifest(tag) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' }, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Verzeichnis ${tag}: HTTP ${r.status}`);
  return r.json();
}

// Die Auswertungen liegen im Saison-Release und in den Ueberlauf-Releases (-b, -c, siehe lib/releaseTags.mjs); gilt die juengste Fassung.
const aggregate = {};
for (const tag of [`daten-replays-s${nr}`, `daten-replays-s${nr}-b`, `daten-replays-s${nr}-c`]) {
  const m = await manifest(tag).catch((e) => { if (tag.endsWith(`s${nr}`)) throw e; return {}; });
  for (const [k, v] of Object.entries(m)) if (!aggregate[k] || (Date.parse(v.zeit ?? '') || 0) > (Date.parse(aggregate[k].zeit ?? '') || 0)) aggregate[k] = v;
}
const schlank = await manifest(`daten-replays-schlank-s${nr}`).catch(() => ({}));

// Schlanke Fassungen von vor diesem Stand zaehlten Selbst-Eliminierungen als Kill (siehe replays-schlank.mjs, v2) - sie werden einmal alle neu gebaut.
const SCHLANK_STAND = Date.parse('2026-10-28T19:15:00Z');
// Davon hoechstens zehn je Durchgang: jede neue Fassung ist ein Hochladen, und das Schreibkontingent der Ablaeufe ist knapp (Aufgabe 144).
const STAND_JE_DURCHGANG = 10;
const noetig = [];
for (const [anhang, m] of Object.entries(aggregate)) {
  const t = /^replays__(S\d+)__(.+)___aggregat\.json$/i.exec(anhang);
  if (!t || t[1].toUpperCase() !== SAISON) continue;
  const s = schlank[`replays-schlank__${t[1]}__${t[2]}.json`];
  const agg = Date.parse(m.zeit ?? '') || 0;
  const sl = Date.parse(s?.zeit ?? '') || 0;
  // Eine vorhandene schlanke Fassung gilt als veraltet, wenn die Auswertung mehr als drei Stunden juenger ist (laufende Cups bekommen sie in der Live-Schleife)
  const veraltet = !s || agg - sl > 3 * 3600_000;
  if (veraltet || sl < SCHLANK_STAND) noetig.push({ fenster: t[2], saison: t[1], agg, fehlt: !s, nurStand: !veraltet });
}
// Frisches zuerst; was ganz fehlt, vor dem, was nur veraltet ist.
noetig.sort((a, b) => (b.fehlt - a.fehlt) || (b.agg - a.agg));
console.log(`${noetig.length} Spieltage mit fehlender oder veralteter schlanker Fassung (${noetig.filter((x) => x.fehlt).length} ganz ohne, ${noetig.filter((x) => x.nurStand).length} nur wegen Fassung v2 - davon ${STAND_JE_DURCHGANG} je Durchgang).`);

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
