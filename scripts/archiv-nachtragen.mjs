// Die Vergangenheit vor dem ersten Archivlauf nachtragen.
//
// Epics Ereignisliste ist ein rollendes Fenster; das eigene Cup-Archiv
// beginnt deshalb an dem Tag, an dem es zum ersten Mal lief. Alles davor
// fehlte im Katalog - obwohl die Spieltage laengst im Haus liegen: die
// gespiegelten Bestenlisten unter data/szene-stats/index.json reichen bis
// Mai 2024 zurueck und tragen Epics eigene Datumsangaben.
//
// Was von dort kommt, ist weniger als bei einem frisch gesehenen Cup:
//
//   - KEIN Kachelbild. Epic liefert es nur, solange das Turnier laeuft.
//   - KEINE Endzeit. Die Bestenliste kennt nur den Beginn; eine Endzeit
//     zu erfinden hiesse, eine Uhrzeit zu behaupten, die niemand gemessen
//     hat. Die Anzeige schreibt dort "—".
//
// Der Lauf ist wiederholbar: schon vorhandene Spieltage bleiben unberuehrt,
// nachgetragen wird nur, was fehlt.
//
//   node scripts/archiv-nachtragen.mjs           -> nachtragen
//   node scripts/archiv-nachtragen.mjs --probe   -> nur zeigen, nichts schreiben

import { promises as fs } from 'fs';
import path from 'path';

const nurProbe = process.argv.includes('--probe');
const ARCHIV = path.join(process.cwd(), 'data', 'cup-archiv.json');
const INDEX = path.join(process.cwd(), 'data', 'szene-stats', 'index.json');

/** Die grobe Einteilung aus dem Turniernamen - dieselben Arten wie im Katalog. */
function artVon(name) {
  const n = (name ?? '').toLowerCase();
  if (/division/.test(n)) return 'division';
  if (/major|global|championship|elite|last chance|semis|performance/.test(n)) return 'championship';
  if (/cash/.test(n)) return 'cash';
  if (/victory/.test(n)) return 'victory';
  if (/ranked/.test(n)) return 'ranked';
  if (/mobile/.test(n)) return 'mobile';
  if (/reload/.test(n)) return 'reload';
  if (/final/.test(n)) return 'finals';
  return 'sonstige';
}

/**
 * Aus Epics Kennung einen lesbaren Namen machen.
 *
 * Aeltere Spieltage tragen den blanken Bezeichner: "CH5S3PerformanceCupWeek3".
 * Getrennt wird nur an den Grossbuchstaben und vor Zahlen - erfunden wird
 * nichts, es sind dieselben Woerter, die Epic selbst geschrieben hat.
 */
function lesbar(name) {
  const roh = (name ?? '').trim();
  if (/\s/.test(roh)) return roh;              // steht schon mit Leerzeichen da
  // "CH5S3" ist Epics Kuerzel fuer Kapitel und Season und bleibt zusammen.
  const m = roh.match(/^(CH\d+S\d+)(.*)$/i);
  const kopf = m ? m[1].toUpperCase() : '';
  const rest = m ? m[2] : roh;
  const geteilt = rest
    // "FNCSUpper" -> "FNCS Upper": vor einem Wort, das gross anfaengt und
    // klein weitergeht, endet die Abkuerzung davor.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return [kopf, geteilt].filter(Boolean).join(' ');
}

/** Der Turniername ohne Runde, Tag und Gruppe - das buendelt die Spieltage. */
function turnierName(name) {
  let t = lesbar(name ?? '')
    .replace(/\s*[-\u2013]\s*(Week|Round|Event|Day|Session|Heat|Group|Gruppe)\b.*$/i, '');
  /*
   * Die Rundenangabe faellt samt ihrer Zahl weg - sonst bliebe ein nacktes
   * "Week" stehen. Die Wortgrenzen sind hier keine Feinheit: ohne sie traf
   * das einzelne "R" das Schluss-r von "Major" und machte daraus "Majo".
   */
  for (let i = 0; i < 3; i++) {
    const vorher = t;
    t = t.replace(/\s*\b(Week|Round|Event|Day|Session|Heat|Group|Gruppe|R)\b\s*\d*\s*$/i, '');
    if (t === vorher) break;
  }
  return t.trim() || 'Turnier';
}

/** Das Kapitel-und-Season-Kuerzel, falls der Name eines traegt. */
function kapitelVon(name) {
  const m = (name ?? '').trim().match(/^(CH\d+S\d+)/i);
  return m ? m[1].toUpperCase() : '';
}

/** Der Titel ohne das Kuerzel - das steht als eigene Marke auf der Kachel. */
function ohneKapitel(titel) {
  return (titel ?? '').replace(/^CH\d+S\d+\s*/i, '').trim();
}

const kennung = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'cup';

const archiv = JSON.parse(await fs.readFile(ARCHIV, 'utf8'));
const index = JSON.parse(await fs.readFile(INDEX, 'utf8'));

/*
 * Frueher Nachgetragenes wird aufgefrischt, nicht uebersprungen: Titel und
 * Art entstehen hier aus Regeln, und die verbessern sich. Was Epic selbst
 * geliefert hat, bleibt unangetastet - dort ist der Titel echt.
 */
const originalName = new Map(index.map((e) => [e.windowId, e.name]));

/*
 * Kachelbilder aus gleichnamigen Cups.
 *
 * Epic liefert das Bild nur, solange ein Turnier laeuft - nachgetragene
 * Spieltage haetten deshalb eine leere Kachel. Ein "Performance Cup" von
 * 2024 sieht aber aus wie der von heute, und dessen Bild liegt im Archiv.
 * Uebernommen wird nur bei gleichem Namen; erfunden wird nichts.
 */
const schluesselVon = (t) => (t ?? '').toLowerCase()
  .replace(/^ch\d+s\d+\s*/i, '').replace(/[^a-z0-9]+/g, '');

/** Die aussagekraeftigen Woerter eines Titels - "Cup" sagt nichts. */
const ALLERWELT = new Set(['cup', 'cups', 'series', 'the', 'fncs', 'practice',
  'official', 'tournament', 'season', 'chapter']);
const woerterVon = (t) => new Set((t ?? '').toLowerCase()
  .replace(/^ch\d+s\d+\s*/i, '').split(/[^a-z0-9]+/)
  .filter((w) => w.length > 2 && !ALLERWELT.has(w)));

/**
 * Die Turnierkennung ohne Season und Region.
 *
 * "epicgames_S42_PerformanceEvaluation_EU" und
 * "epicgames_S30_PerformanceEvaluation_NAC" sind dasselbe Turnier in
 * verschiedenen Jahren und Regionen. Der Titel aendert sich ueber die
 * Seasons - Epic nannte den Performance Cup im Archiv sogar schlicht
 * "Fortnite" -, die Kennung bleibt. Sie ist deshalb der bessere Schluessel.
 */
function turnierKern(eventId) {
  return (eventId ?? '')
    .replace(/^epicgames_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/^(CH\d+S\d+|S\d+)_?/i, '');
}

/** Bilder der von Epic gesehenen Cups - nach Kennung und nach Titel. */
const bilder = [];
const bildNachKern = new Map();
for (const e of archiv) {
  if (!e.bild || e.nachgetragen) continue;
  const k = turnierKern(e.eventId).toLowerCase();
  if (k && !bildNachKern.has(k)) bildNachKern.set(k, e.bild);
  bilder.push({ art: e.art,
    worte: woerterVon(`${e.titel} ${lesbar(turnierKern(e.eventId))}`),
    schluessel: schluesselVon(e.titel), bild: e.bild,
    fncs: /fncs/i.test(`${e.titel} ${e.eventId}`) });
}

/**
 * Das Bild eines gleichartigen Cups mit demselben Kernwort.
 *
 * Zuerst der genaue Name, dann - bei gleicher Art - der Cup mit den meisten
 * gemeinsamen Kernwoertern. "Performance Cup" trifft so den "Performance
 * Evaluation Cup", ohne dass ein Cash Cup das Bild eines Finales bekaeme.
 * Ohne Treffer bleibt es leer; die Kachel faellt dann auf ihre Farbe zurueck.
 */
function bildFuer(titel, art, eventId) {
  // Zuerst dieselbe Turnierkennung - das ist derselbe Cup, nur aelter.
  const kern = bildNachKern.get(turnierKern(eventId).toLowerCase());
  if (kern) return kern;
  const k = schluesselVon(titel);
  const genau = bilder.find((b) => b.schluessel === k);
  if (genau) return genau.bild;
  const worte = woerterVon(`${titel} ${lesbar(turnierKern(eventId))}`);
  if (!worte.size) return '';
  let besterWert = 0; let bestes = '';
  let fremdWert = 0; let fremdBestes = '';
  for (const b of bilder) {
    let treffer = 0;
    for (const w of worte) if (b.worte.has(w)) treffer++;
    if (!treffer) continue;
    if (b.art === art) {
      if (treffer > besterWert) { besterWert = treffer; bestes = b.bild; }
    } else if (treffer > fremdWert) { fremdWert = treffer; fremdBestes = b.bild; }
  }
  if (besterWert > 0) return bestes;
  /*
   * Auch ueber die Art hinweg, wenn sich mindestens zwei Kernwoerter
   * decken. Epic fuehrt denselben Cup nicht immer unter derselben Art -
   * der Performance Evaluation Cup steht im Archiv als "sonstige", waehrend
   * der aeltere "Performance Evaluation Duos" als championship gilt. Zwei
   * gemeinsame Woerter sind Beleg genug, dass es dasselbe Turnier ist;
   * eines waere es nicht ("Solo" teilen sich zu viele).
   */
  if (fremdWert >= 2) return fremdBestes;

  /*
   * Letzte Stufe: das Bild irgendeines FNCS-Turniers.
   *
   * Major, Grand Finals, Upper Semis und Divisional Cup tragen bei Epic
   * dieselbe Bildsprache - der Betreiber hat das ausdruecklich bestaetigt.
   * Ein FNCS-Bild auf einem FNCS-Turnier behauptet also nichts Falsches.
   * Fuer alles ausserhalb der FNCS bleibt es bei der Farbflaeche.
   */
  if (/fncs/i.test(`${titel ?? ''} ${eventId ?? ''}`)) {
    const fncs = bilder.find((b2) => b2.art === art && b2.fncs)
      ?? bilder.find((b2) => b2.fncs);
    if (fncs) return fncs.bild;
  }
  return '';
}

let aufgefrischt = 0;
for (const e of archiv) {
  if (e.nachgetragen !== 'szene-stats') continue;
  // Vom Originalnamen ausgehen, nicht vom schon verarbeiteten Titel -
  // sonst liessen sich fruehere Fehler nie mehr beheben.
  const roh = originalName.get(e.windowId) ?? e.titel;
  const t = ohneKapitel(turnierName(roh));
  const a = artVon(roh);
  const k = kapitelVon(roh);
  const b = bildFuer(t, a, e.eventId);
  if (t !== e.titel || a !== e.art || k !== (e.kapitel ?? '')
      || (b && b !== e.bild)) {
    e.titel = t; e.art = a;
    if (k) e.kapitel = k;
    if (b) e.bild = b;
    aufgefrischt++;
  }
}

const schonDa = new Set(archiv.map((e) => e.windowId));
const jetzt = new Date().toISOString();
const neu = [];

for (const e of index) {
  if (!e.windowId || !e.eventId || !e.region) continue;
  if (schonDa.has(e.windowId)) continue;
  if (typeof e.datum !== 'number') continue;   // ohne Datum kein Platz auf der Zeitachse
  const titel = ohneKapitel(turnierName(e.name));
  const kapitel = kapitelVon(e.name);
  const bild = bildFuer(titel, artVon(e.name), e.eventId);
  neu.push({
    id: kennung(`${e.season ?? ''} ${titel}`),
    titel,
    ...(kapitel ? { kapitel } : {}),
    ...(bild ? { bild } : {}),
    art: artVon(e.name),
    global: false,
    eventId: e.eventId,
    windowId: e.windowId,
    region: e.region,
    begin: e.datum,
    // end bleibt weg - siehe Kopf.
    istFinale: /final/i.test(`${e.name ?? ''} ${e.windowId}`),
    gesehen: jetzt,
    // Damit spaeter erkennbar ist, woher der Eintrag stammt.
    nachgetragen: 'szene-stats',
  });
  schonDa.add(e.windowId);
}

console.log(`Archiv: ${archiv.length} Eintraege | Index: ${index.length}`
  + ` | neu: ${neu.length} | aufgefrischt: ${aufgefrischt}`);
const arten = {};
for (const n of neu) arten[n.art] = (arten[n.art] ?? 0) + 1;
console.log('  nach Art:', JSON.stringify(arten));
if (neu.length) {
  const d = neu.map((n) => n.begin).sort((a, b) => a - b);
  console.log(`  Zeitraum: ${new Date(d[0]).toLocaleDateString('de-DE')}`
    + ` bis ${new Date(d[d.length - 1]).toLocaleDateString('de-DE')}`);
}
if (nurProbe) { console.log('  (Probe - nichts geschrieben)'); process.exit(0); }
if (!neu.length && !aufgefrischt) { console.log('  nichts zu tun'); process.exit(0); }

await fs.writeFile(ARCHIV, JSON.stringify([...archiv, ...neu], null, 2), 'utf8');
console.log(`  geschrieben: ${archiv.length + neu.length} Eintraege`);
