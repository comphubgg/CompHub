// Die Einzelwerte der Szene-Quelle einsammeln und bei uns ablegen.
//
// Warum ueberhaupt spiegeln?
//
// Epic gibt je Turniereintrag nur Platzierung, Eliminierungen, Ueberlebenszeit
// und Punkte heraus - und das auch nur je Team. Alles Feinere (Schaden,
// Schuesse, Treffer, Material, Bauteile, Strecken, Assists, Wiederbelebungen)
// stammt aus Replay-Auswertungen. eucompetitive.com veroeffentlicht die als
// offene JSON-Dateien, ohne Schluessel und ohne Anmeldung.
//
// Bisher hat das Werkzeug jede Datei erst dann geholt, wenn jemand den
// passenden Spieltag oeffnete - und nur die, deren Namen es erraten konnte.
// Es gibt aber ein Verzeichnis:
//
//   /APISYSTEMV2/list_stats_json.php?region=EU&season=S41
//     -> ["Escargo_Day1.json", "S41_FNCSMajor2_Final_Day1_EU.json", …]
//   /APISYSTEMV2/DATA/EU/S41/stats/Escargo_Day1.json
//     -> die Datei selbst
//
// Damit laesst sich alles einsammeln, was dort liegt. Was einmal hier ist,
// bleibt hier: aendert die andere Seite ihre Pfade oder macht sie dicht,
// steht das Archiv trotzdem.
//
// Aufruf:  node scripts/szene-stats-holen.mjs [S39 S40 …] [--alles]
//          --alles laedt auch Dateien neu, die schon liegen.

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = 'https://eucompetitive.com';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const SEASONS_STANDARD = ['S39', 'S40', 'S41', 'S42'];
const ABLAGE = path.join(process.cwd(), 'data', 'szene-stats');

/** Ohne Browserkennung antwortet der Anbieter nicht zuverlaessig. */
const KOPF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const argumente = process.argv.slice(2);
const alles = argumente.includes('--alles');
/*
 * "--neueste" sieht nur in der laufenden Saison nach.
 *
 * Fuer den stuendlichen Lauf. Ein voller Durchgang fragt vier Saisons mal
 * sieben Regionen ab, also achtundzwanzig Verzeichnisse - jede Stunde waere
 * das unhoeflich gegenueber einer Quelle, die uns umsonst beliefert. Neue
 * Spieltage kommen ohnehin nur in der laufenden Saison dazu; die alten
 * bleiben dem taeglichen Lauf ueberlassen.
 */
const nurNeueste = argumente.includes('--neueste');
const seasons = argumente.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());
const ZIEL = seasons.length ? seasons
  : nurNeueste ? SEASONS_STANDARD.slice(-1) : SEASONS_STANDARD;

/**
 * Kurz durchatmen zwischen den Abrufen - wir sind zu Gast.
 *
 * Nach dem ersten grossen Lauf (vierhundert Dateien) hat der Anbieter mit 403
 * geantwortet. Das Archiv stand da schon, aber die Lehre bleibt: lieber
 * langsam nachfassen als vor die Tuer gesetzt werden. Deshalb eine gute halbe
 * Sekunde zwischen zwei Dateien - beim taeglichen Nachholen sind es ohnehin
 * nur eine Handvoll.
 */
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function holeJson(url) {
  const r = await fetch(url, { headers: KOPF });
  if (!r.ok) return null;
  const text = await r.text();
  // Bei unbekannten Pfaden liefert der Server eine HTML-Fehlerseite mit 200.
  if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function main() {
  await fs.mkdir(ABLAGE, { recursive: true });

  let geholt = 0, uebersprungen = 0, fehlgeschlagen = 0;
  const verzeichnis = [];

  for (const season of ZIEL) {
    for (const region of REGIONEN) {
      const liste = await holeJson(
        `${BASIS}/APISYSTEMV2/list_stats_json.php?region=${region}&season=${season}`);
      if (!Array.isArray(liste) || !liste.length) continue;

      const ordner = path.join(ABLAGE, region, season);
      await fs.mkdir(ordner, { recursive: true });
      console.log(`${region} ${season}: ${liste.length} Dateien im Verzeichnis`);

      for (const name of liste) {
        const ziel = path.join(ordner, name);
        if (!alles) {
          try { await fs.access(ziel); uebersprungen++; continue; } catch { /* noch nicht da */ }
        }

        const daten = await holeJson(
          `${BASIS}/APISYSTEMV2/DATA/${region}/${season}/stats/${encodeURIComponent(name)}`);
        if (!daten || !Array.isArray(daten.players) || !daten.players.length) {
          fehlgeschlagen++;
          console.warn(`  ${name}: keine Spielerdaten`);
          await warte(600);
          continue;
        }

        await fs.writeFile(ziel, JSON.stringify(daten), 'utf8');
        geholt++;
        verzeichnis.push({
          region, season, datei: name,
          eventId: daten.eventId ?? '',
          windowId: daten.windowId ?? '',
          name: daten.name ?? name.replace(/\.json$/i, ''),
          spieler: daten.players.length,
          matches: daten.matches ?? 0,
          // Wann die Quelle die Datei erzeugt hat - danach laesst sich der
          // juengste Spieltag finden, ohne jede Datei zu oeffnen.
          datum: daten.generatedAt ? Date.parse(daten.generatedAt) || 0 : 0,
        });
        await warte(600);
      }
    }
  }

  // Das Verzeichnis der eigenen Ablage - damit die Oberflaeche weiss, was da
  // ist, ohne den Ordner durchsuchen zu muessen. Beim naechsten Lauf wird es
  // um die neuen Eintraege ergaenzt, nicht ersetzt.
  const indexDatei = path.join(ABLAGE, 'index.json');
  let vorher = [];
  try { vorher = JSON.parse(await fs.readFile(indexDatei, 'utf8')); } catch { /* erster Lauf */ }
  const zusammen = new Map();
  for (const e of vorher) {
    zusammen.set(`${e.region}|${e.season}|${e.datei}`, e);
  }
  for (const e of verzeichnis) {
    const schluessel = `${e.region}|${e.season}|${e.datei}`;
    const alt = zusammen.get(schluessel);
    // Das echte Turnierdatum nicht ueberschreiben.
    //
    // Was hier als "datum" entsteht, ist der Zeitpunkt, zu dem die Quelle
    // ihre Datei erzeugt hat - nicht der Tag, an dem gespielt wurde. Der
    // richtige Wert kommt aus Epics Bestenliste und traegt die Marke
    // datumQuelle: 'epic' (siehe scripts/spieltag-datum-nachtragen.mjs).
    // Bei einem Lauf mit --alles stuenden sonst wieder 768 Spieltage aus
    // acht Saisons auf demselben Tag.
    zusammen.set(schluessel, alt?.datumQuelle === 'epic'
      ? { ...e, datum: alt.datum, datumQuelle: 'epic' }
      : e);
  }
  await fs.writeFile(indexDatei,
    JSON.stringify([...zusammen.values()].sort((a, b) =>
      (a.season + a.region + a.datei).localeCompare(b.season + b.region + b.datei)), null, 1),
    'utf8');

  console.log(`\nFertig: ${geholt} neu geholt, ${uebersprungen} lagen schon vor, `
    + `${fehlgeschlagen} ohne Daten. Verzeichnis: ${zusammen.size} Spieltage.`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
