// Zu welchen Spielern fehlt noch ein Foto?
//
// Beantwortet die Frage, die sich beim Sammeln stellt: wen soll ich als
// Naechstes suchen? Gezaehlt wird ueber das eigene Archiv - wer oft antritt,
// steht oft in den Listen und lohnt zuerst. Ausgegeben wird der Name, unter
// dem die Datei abgelegt werden muss, damit die Zuordnung greift.
//
// Aufruf:  node scripts/spielerbilder-fehlend.mjs [--top 100] [--datei]
//          --datei schreibt die Liste zusaetzlich nach data/fehlende-bilder.txt

import { promises as fs } from 'fs';
import path from 'path';

const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');
const LISTE = path.join(process.cwd(), 'data', 'spielerbilder.json');
const QUELLE = path.join(process.cwd(), 'data', 'szene-quelle', 'spielerliste.json');
const AUSGABE = path.join(process.cwd(), 'data', 'fehlende-bilder.txt');

const argumente = process.argv.slice(2);
const alsDatei = argumente.includes('--datei');
const TOP = (() => {
  const i = argumente.indexOf('--top');
  return i >= 0 ? Math.max(1, parseInt(argumente[i + 1], 10) || 100) : 100;
})();

/**
 * Der Kern eines Namens.
 *
 * Orgtag vorn, Nummern hinten und Zierzeichen fallen weg: aus "BIG Malibuca 7"
 * und "malibuca senpai-" wird beides Mal etwas, das mit "malibuca" beginnt.
 * Gebraucht wird das nur, um zu erkennen, ob zu einem Namen ueberhaupt schon
 * ein Foto vorliegt - zugeordnet wird nach wie vor ueber die Konto-Id.
 */
function kern(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w))
    .filter((w, i, alle) => !(i === 0 && alle.length > 1 && w.length <= 4))
    .join('')
    .toLowerCase();
}

async function main() {
  // Wer hat schon ein echtes Foto?
  const mitFoto = new Set();
  /** Die Kernnamen, zu denen bereits ein Foto vorliegt. */
  const fotoNamen = new Set();
  try {
    for (const e of JSON.parse(await fs.readFile(LISTE, 'utf8'))) {
      if (!e.echtesFoto) continue;
      mitFoto.add(e.epicId);
      fotoNamen.add(kern(e.datei.replace(/\.[^.]+$/, '')));
    }
  } catch { /* noch keine Liste */ }

  // Der Klarname je Konto - danach soll die Datei heissen.
  const klarname = new Map();
  try {
    for (const p of JSON.parse(await fs.readFile(QUELLE, 'utf8'))) {
      if (p.ID && p.NAME) klarname.set(p.ID, p.NAME);
    }
  } catch { /* keine Kopie */ }

  // Ein gepflegtes Profil geht auch hier vor.
  const gepflegt = new Map();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(process.cwd(), 'data', 'spieler-profile.json'), 'utf8'));
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) gepflegt.set(id, pr.anzeige || pr.name);
    }
  } catch { /* keine */ }

  // Wie oft tritt wer an?
  const konten = new Map();
  const verzeichnis = JSON.parse(await fs.readFile(path.join(ARCHIV, 'index.json'), 'utf8'));
  for (const e of verzeichnis) {
    let datei;
    try {
      datei = JSON.parse(await fs.readFile(
        path.join(ARCHIV, e.region, e.season, e.datei), 'utf8'));
    } catch { continue; }
    for (const p of datei.players) {
      if (!p.epicId) continue;
      const k = konten.get(p.epicId)
        ?? { epicId: p.epicId, name: p.username, matches: 0, events: 0,
             elims: 0, regionen: new Set() };
      k.matches += p.matchesPlayed || 0;
      k.events += 1;
      k.elims += p.eliminations || 0;
      k.name = p.username || k.name;
      k.regionen.add(e.region);
      konten.set(p.epicId, k);
    }
  }

  const fehlend = [...konten.values()]
    .filter((k) => !mitFoto.has(k.epicId))
    .map((k) => ({
      ...k,
      // Der Name, unter dem die Datei abgelegt gehoert.
      dateiname: gepflegt.get(k.epicId) || klarname.get(k.epicId) || k.name,
      sicher: Boolean(gepflegt.get(k.epicId) || klarname.get(k.epicId)),
      regionen: [...k.regionen].join('/'),
      // Liegt zu diesem Namen schon ein Foto - nur auf einem anderen Konto?
      // Pros treten ueber die Saisons mit mehreren Konten an; ein erneutes
      // Suchen waere dann vergebliche Muehe.
      andereKonto: fotoNamen.has(kern(
        gepflegt.get(k.epicId) || klarname.get(k.epicId) || k.name)),
    }))
    .sort((a, b) => b.matches - a.matches);

  // Wer schon ein Foto unter demselben Namen hat, steht nicht auf der
  // Einkaufsliste - dort waere er nur Ballast.
  const wirklichOffen = fehlend.filter((k) => !k.andereKonto);
  const nurAnderesKonto = fehlend.length - wirklichOffen.length;

  const zeilen = wirklichOffen.slice(0, TOP).map((k, i) =>
    `${String(i + 1).padStart(3)}. ${k.dateiname.padEnd(24)} ${k.regionen.padEnd(8)}`
    + ` ${String(k.matches).padStart(4)} Matches  ${String(k.elims).padStart(4)} Elims`
    + (k.sicher ? '' : '   (Name nur aus dem Turnier - bitte prüfen)'));

  console.log(`Konten im Archiv: ${konten.size}`);
  console.log(`davon mit Foto: ${mitFoto.size}`);
  console.log(`ohne Foto, aber Name schon abgedeckt (Zweitkonto): ${nurAnderesKonto}`);
  console.log(`wirklich offen: ${wirklichOffen.length}\n`);
  console.log(`Die ${Math.min(TOP, wirklichOffen.length)} mit den meisten Matches:\n`);
  console.log(zeilen.join('\n'));

  if (alsDatei) {
    await fs.writeFile(AUSGABE,
      `Fehlende Spielerfotos - ${wirklichOffen.length} Namen ohne Bild\n`
      + `Datei bitte als <NAME>.jpg in C:\\Users\\jumik\\Desktop\\players ablegen.\n\n`
      + zeilen.join('\n') + '\n', 'utf8');
    console.log(`\nGeschrieben nach ${AUSGABE}`);
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
