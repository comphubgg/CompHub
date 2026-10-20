/*
 * Wer in welchem ausgewerteten Game gespielt hat - fuer "Meine Replays".
 *
 * Der Betreiber (20.10.2026): "Meine Replays" lud tausendzweihundert Replays und fand keines. Die Seite las bisher jedes Game einzeln vom Release, wenn jemand sie aufrief -
 * bei jedem Neustart des Servers von vorn, und jedes Game im Takt eines Besuchers. Hier entsteht die Liste stattdessen im Ablauf, der die Replays ohnehin auswertet:
 * je Game die Konto-Ids seiner Spieler (ohne Bots), als eine kleine Datei (replay-voll/_spieler.json), die ans Release geht. Die Seite liest nur noch diese eine Datei.
 *
 * Neue Games stehen in data/replay-voll/<Monat>/<Fenster>/<Id>.json und werden von dort gelesen; aeltere, die nicht auf der Platte liegen, kommen ueber die
 * oeffentliche Download-Adresse des Releases (ohne Token) - hoechstens --hoechstens N je Aufruf, der Rest beim naechsten Durchgang.
 *
 *   node scripts/replay-spieler-index.mjs [--hoechstens 400]
 */

import fs from 'node:fs';
import path from 'node:path';
import { tagsFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const INDEX = path.join(DATEN, 'replay-voll', 'index.json');
const ZIEL = path.join(DATEN, 'replay-voll', '_spieler.json');

const argumente = process.argv.slice(2);
const hoechstens = Number(argumente[argumente.indexOf('--hoechstens') + 1]) || 400;
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');

const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };

const index = lies(INDEX, { matches: {} });
const alt = lies(ZIEL, { stand: 0, matches: {} });
const matches = alt.matches ?? {};

/** Die Konto-Ids der Spieler eines gelesenen Games. */
const idsVon = (d) => (Array.isArray(d?.spieler) ? [...new Set(d.spieler.filter((s) => s?.epic && !s.bot).map((s) => String(s.epic).toLowerCase()))] : null);

async function vomRelease(datei) {
  const anhang = encodeURIComponent(anhangName(datei));
  for (const tag of tagsFuer(datei)) {
    try {
      const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${anhang}`, { redirect: 'follow', signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'comphub-ablage' } });
      if (r.ok) return JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8'));
    } catch { /* naechstes Release der Reihe */ }
  }
  return null;
}

const fehlt = Object.entries(index.matches ?? {}).filter(([id]) => !matches[id]);
let neu = 0; let ausRelease = 0; let offen = 0;
const warteschlange = [];
for (const [id, e] of fehlt) {
  const lokal = path.join(DATEN, e.datei);
  if (fs.existsSync(lokal)) {
    const ids = idsVon(lies(lokal, null));
    if (ids) { matches[id] = ids; neu += 1; }
  } else warteschlange.push([id, e]);
}

const jetzt = warteschlange.slice(0, hoechstens);
offen = warteschlange.length - jetzt.length;
let naechster = 0;
const arbeiter = async () => {
  while (naechster < jetzt.length) {
    const [id, e] = jetzt[naechster++];
    const ids = idsVon(await vomRelease(e.datei));
    if (ids) { matches[id] = ids; ausRelease += 1; } else offen += 1;
  }
};
await Promise.all(Array.from({ length: 8 }, arbeiter));

// Was es im Index nicht mehr gibt, faellt weg.
for (const id of Object.keys(matches)) if (!index.matches?.[id]) delete matches[id];

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, JSON.stringify({ stand: Date.now(), matches }));
console.log(`Spielerliste: ${Object.keys(matches).length} Games (${neu} von der Platte, ${ausRelease} vom Release, ${offen} noch offen)`);
