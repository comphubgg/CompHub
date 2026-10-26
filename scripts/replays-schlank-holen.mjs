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
const HOECHSTENS = Number(wert('--hoechstens', 60));
const SAISON = String(wert('--saison', 'S42')).toUpperCase();
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const nr = SAISON.replace(/\D/g, '');

async function manifest(tag) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' }, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Verzeichnis ${tag}: HTTP ${r.status}`);
  return r.json();
}

const aggregate = await manifest(`daten-replays-s${nr}`);
const schlank = await manifest(`daten-replays-schlank-s${nr}`).catch(() => ({}));

const noetig = [];
for (const [anhang, m] of Object.entries(aggregate)) {
  const t = /^replays__(S\d+)__(.+)___aggregat\.json$/i.exec(anhang);
  if (!t || t[1].toUpperCase() !== SAISON) continue;
  const s = schlank[`replays-schlank__${t[1]}__${t[2]}.json`];
  const agg = Date.parse(m.zeit ?? '') || 0;
  const sl = Date.parse(s?.zeit ?? '') || 0;
  if (!s || agg - sl > 10 * 60_000) noetig.push({ fenster: t[2], saison: t[1], agg, fehlt: !s });
}
// Frisches zuerst; was ganz fehlt, vor dem, was nur veraltet ist.
noetig.sort((a, b) => (b.fehlt - a.fehlt) || (b.agg - a.agg));
console.log(`${noetig.length} Spieltage mit fehlender oder veralteter schlanker Fassung (${noetig.filter((x) => x.fehlt).length} ganz ohne); heute dran: ${Math.min(HOECHSTENS, noetig.length)}.`);

const heute = noetig.slice(0, HOECHSTENS);
const namen = heute.flatMap((x) => [`replays/${x.saison}/${x.fenster}/_aggregat.json`, `replays/${x.saison}/${x.fenster}/_zustand.json`]);
for (let i = 0; i < namen.length; i += 30) {
  const r = spawnSync(process.execPath, ['scripts/ablage-github-holen.mjs', ...namen.slice(i, i + 30)], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const zeilen = String(r.stdout ?? '').split('\n').filter((z) => /Fertig:|!  /.test(z));
  console.log(`  geholt ${Math.min(i + 30, namen.length)}/${namen.length}: ${zeilen.join(' | ') || 'ok'}`);
}
const s = spawnSync(process.execPath, ['scripts/replays-schlank.mjs'], { stdio: 'inherit' });
process.exit(s.status ?? 0);
