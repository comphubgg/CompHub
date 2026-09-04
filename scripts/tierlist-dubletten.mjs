// Dubletten in der Tierlist zusammenfuehren.
//
// Das Problem: die Tierlist fuehrt ihre Eintraege ueber den rohen Namen.
// Derselbe Spieler steht darin mehrfach, sobald sein Turniername einmal
// einen Orgtag oder eine Startnummer trug:
//
//     "Sky + Scroll"              (Stufe C, dk/dk)
//     "AG Sky. + AG Scroll 10ǃ"   (ungesetzt, ohne Flaggen)
//
// Fuer Epic sind das dieselben zwei Konten. Der Betreiber hat es so
// beschrieben: "die Spieler haben ein paar mal ein Zeichen vorne dran oder
// hinten dran und nachher sind das die gleichen Spieler - die kannst du
// sozusagen nur wegen der Orgnahme linken."
//
// Genau dafuer gibt es `namensSchluessel` in lib/homoglyph.ts: Orgtag,
// Turniermarkierung und angehaengte Nummer fallen weg, Fremdalphabet-
// Zwillinge werden auf Latein zurueckgefuehrt. Zusammen mit `gefaltet`
// (Ziffern, die als Buchstaben gemeint sind) ergibt das den Schluessel, unter
// dem hier gruppiert wird.
//
// WAS DIESES SKRIPT NICHT TUT
//
// Es aendert keine einzige Einstufung. Die Zuordnung von Spielern zu Stufen
// ist die Arbeit des Betreibers, und eine verschobene Stufe faellt kaum auf,
// laesst sich aber nicht zurueckholen. Deshalb:
//
//   * Ein Eintrag mit Stufe wird nie geloescht.
//   * Stehen in einer Gruppe zwei verschiedene Stufen, bleibt die Gruppe
//     unangetastet und wird nur gemeldet - das ist seine Entscheidung.
//   * Geloescht werden ausschliesslich ungesetzte Eintraege, und nur, wenn
//     dieselbe Person in derselben Gruppe schon anderswo steht.
//
// Was von einer Gruppe uebrig bleibt, bekommt die Flaggen der Geschwister
// mit, falls es selbst keine hatte - die Angabe ist ja dieselbe Person.
//
// Aufruf:
//   node scripts/tierlist-dubletten.mjs            (nur zeigen)
//   node scripts/tierlist-dubletten.mjs --schreiben (anwenden)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';

const WURZEL = path.join(path.dirname(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1'), '..');
/*
 * Welcher Datenbestand aufgeraeumt wird.
 *
 * Die fertige Anwendung fuehrt ihre Daten nicht im Projektordner: liegt sie
 * unter "Program Files", darf sie dort nicht schreiben und zieht nach
 * %APPDATA%\CompHub\data um (siehe lib/datenOrt.ts). Ein Lauf ueber den
 * Projektordner erreicht diesen Bestand nie. Mit COMPHUB_DATEN laesst sich
 * der Lauf deshalb dorthin richten - dieselbe Stellschraube, die auch das
 * Programm selbst kennt.
 */
const DATEN = process.env.COMPHUB_DATEN || path.join(WURZEL, 'data');
const DATEI = path.join(DATEN, 'tierlists.json');
const SICHERUNG = path.join(DATEN, '_sicherung');
const schreiben = process.argv.includes('--schreiben');

/* ------------------------------------------------- Namen vergleichbar machen

   Nachgebaut statt eingebunden: lib/homoglyph.ts ist TypeScript, und dieses
   Skript laeuft als reines JavaScript ueber node. Die Regeln sind dieselben -
   wer sie dort aendert, muss sie hier mitaendern. */

const orgRoh = readFileSync(path.join(WURZEL, 'lib', 'orgtags.ts'), 'utf8');
const orgBlock = orgRoh.slice(orgRoh.indexOf('new Set(['), orgRoh.indexOf('])'));
const ORGTAGS = new Set([...orgBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));

const ZWILLINGE = { 'ǃ': '!', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'Ø': 'O', '０': '0' };
const vergleichbar = (t) => [...t.normalize('NFKC')]
  .map((z) => ZWILLINGE[z] ?? z).join('').toLowerCase();

function istOrgtag(wort) {
  const rein = wort.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rein.length < 2 || rein.length > 8) return false;
  if (ORGTAGS.has(rein)) return true;
  return /^[A-Z0-9]{2,6}[.!]?$/.test(wort);
}

function kernname(name) {
  let teile = String(name ?? '').trim().split(/\s+/)
    .filter((t) => !/^\[.*\]$/.test(t))
    .filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  if (!teile.length) return String(name ?? '').trim();
  if (teile.length > 1 && istOrgtag(teile[0])) teile = teile.slice(1);
  return teile.join(' ');
}

const ZIFFERN = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

/** Der Schluessel, unter dem zwei Schreibweisen als eine Person gelten. */
function schluessel(name) {
  const rein = vergleichbar(kernname(name)).replace(/[^a-z0-9]/g, '');
  return rein.replace(/[013457]/g, (z) => ZIFFERN[z] ?? z);
}

/** Ein Duo unabhaengig von der Reihenfolge der beiden. */
const duoSchluessel = (e) => [
  schluessel(e.data?.player1?.name), schluessel(e.data?.player2?.name),
].sort().join('+');

const eintragSchluessel = (e) => (e.isDuo
  ? duoSchluessel(e) : schluessel(e.data?.name));

const rohName = (e) => (e.isDuo
  ? `${e.data?.player1?.name} + ${e.data?.player2?.name}`
  : String(e.data?.name ?? ''));

/* ------------------------------------------------------------- Auswaehlen */

const flaggen = (e) => (e.isDuo
  ? [e.data?.player1?.countryCode, e.data?.player2?.countryCode]
  : [e.data?.countryCode]).filter(Boolean).length;

/**
 * Welcher Eintrag einer Gruppe bleibt?
 *
 * Zuerst der mit Stufe - der ist gesetzt und wird ohnehin nie geloescht.
 * Sonst der mit den meisten Flaggen, weil dort mehr gepflegt ist. Bei
 * Gleichstand der mit dem kuerzesten Rohnamen: das ist die Fassung ohne
 * Orgtag und Startnummer, also die, die der Betreiber lesen will.
 */
function besserer(a, b) {
  if (Boolean(a.tier) !== Boolean(b.tier)) return a.tier ? a : b;
  if (flaggen(a) !== flaggen(b)) return flaggen(a) > flaggen(b) ? a : b;
  return rohName(a).length <= rohName(b).length ? a : b;
}

/** Fehlende Flaggen von den Geschwistern uebernehmen - dieselbe Person. */
function ergaenzeFlaggen(behalten, gruppe) {
  const setz = (ziel, welcher) => {
    if (!ziel || ziel.countryCode) return;
    for (const e of gruppe) {
      const quelle = e.isDuo ? e.data?.[welcher] : e.data;
      if (quelle?.countryCode) { ziel.countryCode = quelle.countryCode; return; }
    }
  };
  if (behalten.isDuo) {
    setz(behalten.data?.player1, 'player1');
    setz(behalten.data?.player2, 'player2');
  } else {
    setz(behalten.data, 'data');
  }
}

/* ----------------------------------------------------------------- Lauf */

const d = JSON.parse(readFileSync(DATEI, 'utf8'));
let entferntGesamt = 0;
let strittigGesamt = 0;

for (const [listenId, liste] of Object.entries(d.lists ?? {})) {
  const feld = Array.isArray(liste.entries) ? 'entries'
    : Array.isArray(liste.items) ? 'items' : null;
  if (!feld) continue;

  const gruppen = new Map();
  for (const e of liste[feld]) {
    // Eigene Eintraege eines Nutzers bleiben unberuehrt: die gehoeren ihm.
    if (e.localOnly) continue;
    const k = `${e.isDuo ? 'duo' : 'solo'}:${eintragSchluessel(e)}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(e);
  }

  const raus = new Set();
  for (const [k, gruppe] of gruppen) {
    if (gruppe.length < 2) continue;

    const gesetzt = gruppe.filter((e) => e.tier);
    const stufen = new Set(gesetzt.map((e) => e.tier));
    if (stufen.size > 1) {
      // Zwei verschiedene Stufen fuer dieselbe Person: das entscheidet er.
      strittigGesamt += 1;
      console.log(`  ! strittig [${k}]`);
      for (const e of gruppe) console.log(`      Stufe ${e.tier ?? '-'}  "${rohName(e)}"`);
      continue;
    }

    const behalten = gruppe.reduce(besserer);
    ergaenzeFlaggen(behalten, gruppe);
    for (const e of gruppe) {
      if (e === behalten) continue;
      // Sicherheitsnetz: ein gesetzter Eintrag verschwindet nie.
      if (e.tier) continue;
      raus.add(e.id);
    }
  }

  if (raus.size) {
    console.log(`\nListe ${listenId}: ${liste[feld].length} Eintraege, `
      + `${raus.size} ungesetzte Dubletten fallen weg`);
    liste[feld] = liste[feld].filter((e) => !raus.has(e.id));
    entferntGesamt += raus.size;
  }
}

console.log(`\nZusammen: ${entferntGesamt} Eintraege weniger, `
  + `${strittigGesamt} Gruppen bleiben zur Entscheidung liegen.`);

if (!schreiben) {
  console.log('Nur gezeigt. Mit --schreiben wird es angewendet.');
} else if (entferntGesamt) {
  mkdirSync(SICHERUNG, { recursive: true });
  const marke = new Date().toISOString().replace(/[:.]/g, '-');
  const ziel = path.join(SICHERUNG, `tierlists-vor-dubletten-${marke}.json`);
  copyFileSync(DATEI, ziel);
  writeFileSync(DATEI, `${JSON.stringify(d, null, 2)}\n`, 'utf8');
  console.log(`Gesichert nach ${path.basename(ziel)} und geschrieben.`);
} else {
  console.log('Nichts zu tun.');
}
