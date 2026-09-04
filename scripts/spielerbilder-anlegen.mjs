// Platzhalter-Bilder fuer die Spieler anlegen.
//
// Die Statistikseite zeigt je Spieler ein Bild. Eigene Fotos gibt es noch
// keine - und die des Vorbilds sind lizenzierte Pressebilder, die uns nicht
// gehoeren. Damit trotzdem sichtbar ist, fuer wen ueberhaupt ein Bild
// gebraucht wird, legt dieses Skript je Spieler eine leere Datei an:
//
//   public/spielerbilder/peterbot.png
//
// Die traegt nur die dunkle Silhouette, wie sie das Vorbild bei fehlenden
// Fotos zeigt. Wer ein echtes Bild hat, ersetzt die Datei einfach - der
// Dateiname bleibt.
//
// WICHTIG: Vorhandene Dateien werden nie ueberschrieben. Ein einmal
// eingesetztes Foto ueberlebt jeden weiteren Lauf.
//
// Neben den Bildern entsteht eine Liste, die Datei und Epic-Konto verbindet:
// der Dateiname folgt dem Namen, die Zuordnung aber der Konto-Id - sonst
// bekaeme ein Namensvetter das Bild des Profis.
//
// Aufruf:  node scripts/spielerbilder-anlegen.mjs [--top 300] [--alle]

import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';

const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');
const BILDER = path.join(process.cwd(), 'public', 'spielerbilder');
const LISTE = path.join(process.cwd(), 'data', 'spielerbilder.json');

const argumente = process.argv.slice(2);
const alle = argumente.includes('--alle');
const TOP = (() => {
  const i = argumente.indexOf('--top');
  return i >= 0 ? Math.max(1, parseInt(argumente[i + 1], 10) || 300) : 300;
})();

/* ------------------------------------------------------------------ PNG */

const BREITE = 400;
const HOEHE = 500;
const GRUND = [24, 24, 27];      // zinc-900, wie die Karten
const FIGUR = [63, 63, 70];      // zinc-700, die Silhouette

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function abschnitt(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const koerper = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(koerper));
  return Buffer.concat([laenge, koerper, pruef]);
}

/**
 * Die Silhouette zeichnen: Kopf als Kreis, Schultern als Halbellipse.
 *
 * Von Hand gerechnet statt mit einer Bibliothek - fuer zwei Formen lohnt
 * keine Abhaengigkeit, und so bleibt das Skript ohne Installation lauffaehig.
 */
function silhouettePng() {
  const zeilen = [];
  const kopfX = BREITE / 2, kopfY = 195, kopfR = 78;
  const schulterX = BREITE / 2, schulterY = 500, schulterRx = 145, schulterRy = 135;

  for (let y = 0; y < HOEHE; y++) {
    const zeile = Buffer.alloc(1 + BREITE * 3);
    zeile[0] = 0; // Filter "keiner"
    for (let x = 0; x < BREITE; x++) {
      const imKopf = ((x - kopfX) ** 2) / (kopfR ** 2) + ((y - kopfY) ** 2) / (kopfR ** 2) <= 1;
      const inSchulter =
        ((x - schulterX) ** 2) / (schulterRx ** 2)
        + ((y - schulterY) ** 2) / (schulterRy ** 2) <= 1 && y > 330;
      const farbe = imKopf || inSchulter ? FIGUR : GRUND;
      const o = 1 + x * 3;
      zeile[o] = farbe[0]; zeile[o + 1] = farbe[1]; zeile[o + 2] = farbe[2];
    }
    zeilen.push(zeile);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(BREITE, 0);
  ihdr.writeUInt32BE(HOEHE, 4);
  ihdr[8] = 8;   // acht Bit je Kanal
  ihdr[9] = 2;   // Echtfarbe ohne Alpha
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    abschnitt('IHDR', ihdr),
    abschnitt('IDAT', zlib.deflateSync(Buffer.concat(zeilen), { level: 9 })),
    abschnitt('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ Dateiname */

/**
 * Aus einem Turniernamen einen brauchbaren Dateinamen machen.
 *
 * Orgtags und Zierzeichen fliegen raus, damit aus "AURA shxrk" und
 * "aurora fv" nicht zwei voellig verschiedene Dateien werden - was
 * uebrigbleibt, ist der Kern des Namens in Kleinbuchstaben.
 */
function dateiname(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .join('-')
    .toLowerCase() || 'unbenannt';
}

/* ---------------------------------------------------------------- Lauf */

async function main() {
  const verzeichnis = JSON.parse(
    await fs.readFile(path.join(ARCHIV, 'index.json'), 'utf8'));

  // Wer taucht wie oft auf? Danach richtet sich, fuer wen ein Bild lohnt.
  const konten = new Map();
  for (const e of verzeichnis) {
    let datei;
    try {
      datei = JSON.parse(await fs.readFile(
        path.join(ARCHIV, e.region, e.season, e.datei), 'utf8'));
    } catch { continue; }
    for (const p of datei.players) {
      if (!p.epicId) continue;
      const k = konten.get(p.epicId)
        ?? { epicId: p.epicId, name: p.username, matches: 0, events: 0, elims: 0, regionen: new Set() };
      k.matches += p.matchesPlayed || 0;
      k.events += 1;
      k.elims += p.eliminations || 0;
      k.name = p.username || k.name;
      k.regionen.add(e.region);
      konten.set(p.epicId, k);
    }
  }

  // Ein gepflegtes Profil geht vor: der Anzeigename ist der, den der Nutzer
  // sehen will, und danach soll auch die Datei heissen.
  let profile = {};
  try {
    profile = JSON.parse(await fs.readFile(
      path.join(process.cwd(), 'data', 'spieler-profile.json'), 'utf8'));
  } catch { /* noch keine gepflegt */ }
  const nachId = new Map();
  for (const [schluessel, pr] of Object.entries(profile)) {
    const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
    if (id) nachId.set(id, pr);
  }

  const sortiert = [...konten.values()].sort((a, b) => b.matches - a.matches);
  const auswahl = alle ? sortiert : sortiert.slice(0, TOP);

  await fs.mkdir(BILDER, { recursive: true });
  const png = silhouettePng();

  const liste = [];
  const vergeben = new Map();
  let angelegt = 0, vorhanden = 0;

  for (const k of auswahl) {
    const profil = nachId.get(k.epicId);
    const anzeige = profil?.anzeige || profil?.name || k.name;
    let basis = dateiname(anzeige);

    // Zwei Spieler mit demselben Namen bekommen nicht dieselbe Datei.
    if (vergeben.has(basis) && vergeben.get(basis) !== k.epicId) {
      basis = `${basis}-${k.epicId.slice(0, 6)}`;
    }
    vergeben.set(basis, k.epicId);

    const datei = `${basis}.png`;
    const ziel = path.join(BILDER, datei);
    try {
      await fs.access(ziel);
      vorhanden++;               // schon da - niemals ueberschreiben
    } catch {
      await fs.writeFile(ziel, png);
      angelegt++;
    }

    liste.push({
      datei, epicId: k.epicId, name: anzeige,
      turniername: k.name,
      regionen: [...k.regionen], matches: k.matches, events: k.events, elims: k.elims,
    });
  }

  await fs.writeFile(LISTE, JSON.stringify(liste, null, 1), 'utf8');
  console.log(`${angelegt} Platzhalter angelegt, ${vorhanden} lagen schon vor.`);
  console.log(`Liste: ${liste.length} Spieler in data/spielerbilder.json`);
  console.log(`Bilder liegen in public/spielerbilder/ - einfach ersetzen.`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
