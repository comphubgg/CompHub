// Eine private Kopie von allem auf den PC des Betreibers: der ganze Code und alle Daten an den Releases (rund 33 GB).
//
// Der Betreiber (7.11.2026): "eine Kopie von meinen aktuellen Daten ... wenn meine Seite gesperrt wird, habe ich ja immer noch die Kopie ... du updatest das auch immer." Bewusst kein
// zweites GitHub-Konto (siehe Gedaechtnis keine-zweiten-github-konten): die Kopie liegt auf der eigenen Platte und haengt an keinem Konto.
//
// Laeuft wiederholt: was schon da ist und dieselbe Groesse hat, wird uebersprungen. Solange Fortnite laeuft, wartet die Kopie - sonst laggt das Spiel (Betreiber: "viel Delay").
// Zwei Downloads zugleich, damit die Leitung frei bleibt.
//
//   node --env-file=.env.local scripts/sicherung-holen.mjs [Zielordner]

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ZIEL = process.argv[2] || 'C:\\Users\\jumik\\CompHub-Sicherung';
const REPO = 'comphubgg/CompHub';
const GLEICHZEITIG = 2;
const token = (process.env.GITHUB_TOKEN || '').trim();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function spielLaeuft() {
  try { return /FortniteClient-Win64-Shipping/i.test(execSync('tasklist /FI "IMAGENAME eq FortniteClient-Win64-Shipping.exe"', { encoding: 'utf8' })); } catch { return false; }
}
async function nichtImSpiel() {
  let gemeldet = false;
  while (spielLaeuft()) {
    if (!gemeldet) { console.log(`${new Date().toLocaleTimeString('de-DE')} Fortnite laeuft - die Kopie wartet.`); gemeldet = true; }
    await warte(60_000);
  }
}

async function alleReleases() {
  const raus = [];
  for (let seite = 1; seite < 20; seite += 1) {
    let liste = null;
    for (let versuch = 0; versuch < 5 && !liste; versuch += 1) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30&page=${seite}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }).catch(() => null);
      if (r?.ok) liste = await r.json(); else await warte(5000 * (versuch + 1));
    }
    if (!liste) throw new Error(`Liste der Releases, Seite ${seite}, nicht lesbar`);
    if (!liste.length) break;
    raus.push(...liste);
  }
  return raus;
}

async function hole(url, datei, groesse) {
  const neu = `${datei}.teil`;
  for (let versuch = 0; versuch < 3; versuch += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(neu));
      if (fs.statSync(neu).size !== groesse) throw new Error('falsche Groesse');
      fs.renameSync(neu, datei);
      return true;
    } catch { fs.rmSync(neu, { force: true }); await warte(4000 * (versuch + 1)); }
  }
  return false;
}

fs.mkdirSync(ZIEL, { recursive: true });
// Der Code samt Verlauf in einer Datei.
await nichtImSpiel();
execSync(`git bundle create "${path.join(ZIEL, 'code.bundle')}" --all`, { stdio: 'ignore' });

const releases = await alleReleases();
const aufgaben = releases.flatMap((rel) => rel.assets.map((a) => ({ tag: rel.tag_name, name: a.name, groesse: a.size, url: a.browser_download_url })));
const gesamtMb = Math.round(aufgaben.reduce((s, a) => s + a.groesse, 0) / 1048576);
console.log(`${releases.length} Releases, ${aufgaben.length} Dateien, ${gesamtMb} MB.`);

let naechste = 0; let geholt = 0; let da = 0; let fehler = 0; let mb = 0;
await Promise.all(Array.from({ length: GLEICHZEITIG }, async () => {
  while (naechste < aufgaben.length) {
    const a = aufgaben[naechste++];
    const ordner = path.join(ZIEL, a.tag);
    const datei = path.join(ordner, a.name);
    if (fs.existsSync(datei) && fs.statSync(datei).size === a.groesse) { da += 1; continue; }
    await nichtImSpiel();
    fs.mkdirSync(ordner, { recursive: true });
    if (await hole(a.url, datei, a.groesse)) { geholt += 1; mb += a.groesse / 1048576; } else { fehler += 1; console.log(`  nicht geholt: ${a.tag}/${a.name}`); }
    if ((geholt + fehler) % 200 === 0) console.log(`${new Date().toLocaleTimeString('de-DE')} ${geholt} geholt (${Math.round(mb)} MB), ${da} schon da, ${fehler} Fehler, ${naechste} von ${aufgaben.length}`);
  }
}));
fs.writeFileSync(path.join(ZIEL, 'stand.txt'), `${new Date().toISOString()} ${geholt} geholt, ${da} schon da, ${fehler} Fehler, ${gesamtMb} MB gesamt\n`);
console.log(`Fertig: ${geholt} geholt, ${da} schon da, ${fehler} Fehler.`);
