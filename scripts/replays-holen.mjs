// Die Turnier-Replays der letzten Wochen einsammeln.
//
// Dieser Lauf gehoert nicht auf einen Knopf. Epic haelt ein Replay 31 Tage
// vor - was in dieser Zeit niemand holt, ist danach fuer immer fort. Ein
// Werkzeug, das nur sammelt, wenn jemand daran denkt, sammelt zwangslaeufig
// Luecken. Deshalb laeuft er planmaessig (siehe instrumentation.ts); von
// Hand aufgerufen wird er nur zum Nachsehen.
//
//   node scripts/replays-holen.mjs                -> alles Offene
//   node scripts/replays-holen.mjs S42_FNCS…_EU   -> nur dieses Fenster
//   node scripts/replays-holen.mjs --neu          -> auch schon Ausgewertetes
//   node scripts/replays-holen.mjs --frisch 48    -> nur die letzten 48 Stunden
//   node scripts/replays-holen.mjs --live         -> nur, was gerade laeuft
//
// Einstellbar ueber die Umgebung:
//
//   MAX_REPLAY_DOWNLOADS  gleichzeitige Downloads      (Standard 3)
//   MAX_REPLAY_PARSERS    gleichzeitige Auswertungen   (Standard 2)
//   REPLAY_STORAGE        local                        (Standard local)
//
// Jeder Schritt merkt sich seinen Zustand je Match. Schlaegt ein Download
// fehl, wird beim naechsten Lauf genau dieser Download wiederholt - nicht
// das Turnier von vorn.

import { promises as fs } from 'fs';
import path from 'path';
import {
  FRIST_TAGE, ZUSTAND, ladeMatch, leseMatch, liesZustand, matchIds,
  matchPfad, replayVorhanden, schreibeMatch, schreibeZustand, warte,
} from '../lib/replayKern.mjs';

const BASIS = process.env.WERKZEUG_URL || 'http://localhost:3000';
const MAX_LADEN = Math.max(1, Number(process.env.MAX_REPLAY_DOWNLOADS) || 3);
const MAX_LESEN = Math.max(1, Number(process.env.MAX_REPLAY_PARSERS) || 2);
const SPEICHER = process.env.REPLAY_STORAGE || 'local';

const argumente = process.argv.slice(2);
const neu = argumente.includes('--neu');

/**
 * Nur laufende Fenster.
 *
 * Fuer die Auswertung waehrend eines Cups. Epic gibt die Match-Kennungen
 * eines Fensters heraus, sobald die erste Runde gespielt ist - man muss
 * nicht warten, bis der Spieltag zu Ende ist.
 */
const nurLive = argumente.includes('--live');

/**
 * Nur die juengsten Fenster ansehen.
 *
 * Der stuendliche Lauf soll fangen, was gerade zu Ende gegangen ist - dafuer
 * muss er nicht jedes Mal alle Turniere der letzten einunddreissig Tage
 * abklopfen. Das waere bei jedem Durchgang ein Vielfaches an Abfragen bei
 * Epic, ohne dass dabei je etwas Neues herauskaeme: was einmal ausgewertet
 * ist, bleibt es.
 *
 * Der volle Durchgang laeuft weiter einmal taeglich und holt alles nach, was
 * ein stuendlicher Lauf verpasst hat - etwa weil der Rechner aus war.
 */
const frischIdx = argumente.indexOf('--frisch');
const frischStunden = frischIdx >= 0 ? Number(argumente[frischIdx + 1]) : 0;
const nurFenster = argumente.filter((a, i) =>
  !a.startsWith('--') && !(frischIdx >= 0 && i === frischIdx + 1));

/**
 * Eine Schleuse.
 *
 * Ein Replay sind drei Megabyte und zwei Sekunden; hundert gleichzeitig
 * waeren weder der Leitung noch Epic gegenueber vernuenftig. Zwei getrennte
 * Schleusen, weil Laden an der Leitung haengt und Auswerten am Speicher.
 */
function schleuse(groesse) {
  let frei = groesse;
  const warteschlange = [];
  return async (arbeit) => {
    if (frei <= 0) await new Promise((r) => warteschlange.push(r));
    frei--;
    try { return await arbeit(); }
    finally { frei++; warteschlange.shift()?.(); }
  };
}

const ladeSchleuse = schleuse(MAX_LADEN);
const leseSchleuse = schleuse(MAX_LESEN);

/**
 * Welche Cups es wert sind, ihre Replays zu holen.
 *
 * Nicht jeder Cup verdient tausend Downloads. Ein Division-5-Spieltag hat
 * 6800 Teams und keinen einzigen Profi darin; ein Skin-Cup laeuft eine
 * Stunde und wird nie wieder erwaehnt. Beides fuellt nur die Platte und
 * haelt die Cups auf, auf die es ankommt - und die Frist von einunddreissig
 * Tagen laeuft waehrenddessen weiter.
 *
 * WICHTIG: Das gilt NUR fuer die Replays. Die uebrigen Statistiken - Epics
 * Bestenlisten und die Einzelwerte der Szene-Quelle - werden weiterhin von
 * jedem Cup geholt. Hier faellt nichts aus der Oberflaeche heraus, es wird
 * nur nicht jedes Match nachgelesen.
 *
 * Die Regeln, in dieser Reihenfolge:
 *
 *   'alles'     -> Opens und Finals
 *   'nurFinals' -> nur die Endrunde
 *   'nichts'    -> gar nicht
 */
function replayRegel(cup) {
  const t = (cup.titel ?? '').toLowerCase();
  const id = (cup.id ?? '').toLowerCase();

  // Zuerst die Divisionen - "FNCS Division 3 Practice" enthaelt auch "fncs"
  // und liefe sonst in die Regel darunter.
  if (/division/.test(t) || /division/.test(id)) {
    return (/division\s*1\b/.test(t) || /division1/.test(id)) ? 'alles' : 'nichts';
  }

  // Die Cups, in denen die Szene wirklich spielt.
  if (/performance/.test(t)) return 'alles';
  if (/fncs/.test(t) || /elite\s*series/.test(t)) return 'alles';

  // Ranked Cups fallen ganz weg. Dort spielt die halbe Welt um Ranglisten-
  // punkte, nicht um einen Titel; die Replays davon waeren reine Menge.
  if (/ranked/.test(t) || /ranked/.test(id)) return 'nichts';

  // Alles Uebrige nur, wenn es um etwas geht.
  return 'nurFinals';
}

/**
 * Welche Fenster eines Cups die Endrunde sind.
 *
 * Epics Kennzeichen "istFinale" taugt dafuer allein nicht: der Reload Duos
 * Victory Cup setzt es auf Round 2, der Solo Victory Cup nicht - obwohl dort
 * dieselbe Runde ueber alles entscheidet. Deshalb zusaetzlich ueber den
 * Namen: was "Final" heisst, ist eins, und sonst gilt die hoechste Runde,
 * die dieser Cup ueberhaupt hat.
 */
function endrunden(liste) {
  const rundeVon = (w) => {
    const m = /round\s*_?(\d+)/i.exec(w.windowId ?? '');
    return m ? Number(m[1]) : null;
  };
  const runden = liste.map(rundeVon).filter((n) => n !== null);
  const hoechste = runden.length ? Math.max(...runden) : 0;

  return new Set(liste.filter((w) => w.istFinale
    || /final/i.test(w.windowId ?? '')
    || (hoechste > 0 && rundeVon(w) === hoechste)).map((w) => w.windowId));
}

/** Welche Turnierfenster kommen ueberhaupt infrage? */
async function offeneFenster() {
  const antwort = await fetch(`${BASIS}/api/cup-catalog`);
  if (!antwort.ok) throw new Error(`Cup-Katalog HTTP ${antwort.status}`);
  const katalog = await antwort.json();

  const jetzt = Date.now();
  const grenze = jetzt - FRIST_TAGE * 864e5;
  const fenster = [];
  const zuAlt = [];

  let uebersprungen = 0;
  for (const cup of katalog.cups ?? []) {
    const regel = replayRegel(cup);
    if (regel === 'nichts') {
      uebersprungen += Object.values(cup.regionen ?? {}).flat().length;
      continue;
    }

    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      for (const w of liste) {
        // Im Live-Lauf genau umgekehrt: nur, was gerade laeuft.
        if (nurLive ? w.status !== 'live' : w.status !== 'vorbei') continue;
        if (finals && !finals.has(w.windowId)) { uebersprungen++; continue; }
        /*
         * Bei einem laufenden Fenster gibt es noch kein Ende - dann zaehlt
         * der Beginn. Sonst faellt es durch die Fristpruefung, weil ein
         * Ende in der Zukunft aussieht wie ein Datum ausserhalb der Frist.
         */
        const ende = nurLive ? (w.begin ?? 0) : (w.end ?? w.begin ?? 0);
        const m = /^(S\d+)_/i.exec(w.windowId);
        if (!m) continue;
        const eintrag = {
          season: m[1].toUpperCase(), windowId: w.windowId,
          eventId: w.eventId, region: w.region,
          titel: cup.titel, datum: ende,
        };
        // Aelter als die Frist: Epic hat das Replay nicht mehr. Das ist kein
        // Fehler, sondern der Normalfall - es wird nur gezaehlt, damit
        // sichtbar bleibt, wie viel ausserhalb unserer Reichweite liegt.
        if (ende < grenze) { zuAlt.push(eintrag); continue; }
        // Beim frischen Lauf faellt alles heraus, was laenger zurueckliegt.
        // Im Live-Lauf gilt das nicht - dort ist ohnehin alles von heute.
        if (!nurLive && frischStunden > 0
            && ende < jetzt - frischStunden * 3600_000) continue;
        fenster.push(eintrag);
      }
    }
  }
  /*
   * Das aelteste zuerst.
   *
   * Zuerst stand hier das juengste - die Gewohnheit, Neues oben zu zeigen.
   * Fuer diesen Lauf ist das genau verkehrt: die Frist laeuft vom Spieltag
   * an, also ist das aelteste Fenster in der Liste dasjenige, das als
   * naechstes verfaellt. Bricht ein Lauf ab, sollen die Turniere gesichert
   * sein, die man nicht noch einmal bekommt.
   */
  fenster.sort((a, b) => a.datum - b.datum);
  return { fenster, zuAlt, uebersprungen };
}

/** Ein einzelnes Match durch die Kette schicken. */
async function verarbeite(f, matchId, zustand) {
  const setze = (stand, zusatz = {}) => {
    zustand.matches[matchId] = {
      ...(zustand.matches[matchId] ?? {}), stand,
      zuletzt: new Date().toISOString(), ...zusatz,
    };
  };

  try {
    setze(ZUSTAND.PRUEFT);
    const { vorhanden, metadaten } = await replayVorhanden(matchId);
    if (!vorhanden) {
      // Kein Fehler: Epic hat es nach einem Monat weggeraeumt.
      setze(ZUSTAND.NICHT_VORHANDEN);
      return 'nicht_vorhanden';
    }
    setze(ZUSTAND.VORHANDEN, { zeitpunkt: metadaten.Timestamp ?? null });

    setze(ZUSTAND.LAEDT);
    const puffer = await ladeSchleuse(() => ladeMatch(matchId));
    setze(ZUSTAND.GELADEN, { bytes: puffer.length });

    setze(ZUSTAND.WERTET_AUS);
    const daten = await leseSchleuse(() => leseMatch(matchId, puffer));

    await schreibeMatch(f.season, f.windowId, {
      ...daten,
      eventId: f.eventId, windowId: f.windowId,
      region: f.region, season: f.season, titel: f.titel,
    });
    setze(ZUSTAND.FERTIG, {
      elims: daten.elims.length, konten: daten.konten.length,
      parserVersion: daten.parserVersion,
      // Nur der Ort, nicht die Datei selbst - so wie gewuenscht.
      pfad: path.relative(process.cwd(), matchPfad(f.season, f.windowId, matchId)),
      fehler: null,
    });
    return 'fertig';
  } catch (e) {
    const bisher = zustand.matches[matchId]?.versuche ?? 0;
    setze(ZUSTAND.FEHLGESCHLAGEN, { fehler: e.message, versuche: bisher + 1 });
    return 'fehler';
  }
}

async function main() {
  if (SPEICHER !== 'local') {
    console.log(`REPLAY_STORAGE=${SPEICHER} ist noch nicht gebaut - es wird lokal abgelegt.`);
  }
  console.log(`Schleusen: ${MAX_LADEN} Downloads, ${MAX_LESEN} Auswertungen`);

  const { fenster, zuAlt, uebersprungen: nichtWuerdig } = await offeneFenster();
  const ziel = nurFenster.length
    ? fenster.filter((f) => nurFenster.includes(f.windowId))
    : fenster;

  console.log(nurLive
    ? `${fenster.length} Fenster laufen gerade`
    : frischStunden > 0
    ? `${fenster.length} Fenster aus den letzten ${frischStunden} Stunden`
    : `${fenster.length} Fenster in der Frist (${FRIST_TAGE} Tage), `
      + `${zuAlt.length} ausserhalb - deren Replays gibt es nicht mehr.`);
  console.log(`${nichtWuerdig} Fenster uebersprungen `
    + '(niedrige Divisionen, Opens unwichtiger Cups) - '
    + 'ihre Statistiken kommen weiterhin, nur keine Replays.');
  if (nurFenster.length) {
    console.log(`Auswahl: ${ziel.length} davon (${nurFenster.join(', ')})`);
    if (!ziel.length) {
      console.log('Nichts getroffen. Vorhandene Fenster:');
      for (const f of fenster.slice(0, 12)) console.log('   ', f.windowId);
    }
  }

  let fertig = 0; let uebersprungen = 0; let ohne = 0; let fehler = 0;

  for (const f of ziel) {
    const zustand = await liesZustand(f.season, f.windowId);
    zustand.season = f.season; zustand.windowId = f.windowId;
    zustand.eventId = f.eventId; zustand.region = f.region;
    zustand.titel = f.titel; zustand.datum = f.datum;
    zustand.matches ??= {};

    let ids;
    try { ids = await matchIds(f.eventId, f.windowId); }
    catch (e) { console.warn(`  ${f.windowId}: Bestenliste - ${e.message}`); continue; }

    const offen = ids.filter((id) => {
      const m = zustand.matches[id];
      if (neu) return true;
      // Fertig ist fertig; nicht vorhanden bleibt nicht vorhanden (Epic
      // legt es nicht nachtraeglich wieder hin). Alles andere - auch ein
      // fehlgeschlagener Versuch - wird noch einmal angefasst.
      return !m || (m.stand !== ZUSTAND.FERTIG && m.stand !== ZUSTAND.NICHT_VORHANDEN);
    });

    console.log(`\n${f.season} ${f.region.padEnd(4)} ${f.titel}`);
    console.log(`  ${ids.length} Matches, ${offen.length} offen`);
    uebersprungen += ids.length - offen.length;

    // Die Matches eines Fensters laufen nebeneinander; die Schleusen
    // begrenzen, wie viele davon wirklich gleichzeitig arbeiten.
    const ergebnisse = await Promise.all(
      offen.map((id) => verarbeite(f, id, zustand)));
    for (const r of ergebnisse) {
      if (r === 'fertig') fertig++;
      else if (r === 'nicht_vorhanden') ohne++;
      else fehler++;
    }

    await schreibeZustand(f.season, f.windowId, zustand);
    const stand = Object.values(zustand.matches);
    console.log(`  ausgewertet ${stand.filter((m) => m.stand === ZUSTAND.FERTIG).length}`
      + `/${ids.length}`);
    await warte(500);
  }

  console.log(`\nFertig: ${fertig} neu ausgewertet, ${uebersprungen} lagen schon vor, `
    + `${ohne} ohne Replay, ${fehler} fehlgeschlagen`);

  await protokoll({
    ok: true, fenster: ziel.length, neu: fertig, lagenVor: uebersprungen,
    ohneReplay: ohne, fehlgeschlagen: fehler, basis: BASIS,
  });
}

/*
 * Was dieser Lauf getan hat, in einer Datei.
 *
 * Ein Sammler, der still nichts tut, ist schlimmer als einer, der abbricht:
 * in der Oberflaeche stand "noch keine Replays ausgewertet, die kommen
 * planmaessig" - und das stimmte eben nicht, sie kamen nie, weil der Lauf
 * auf dem falschen Port ins Leere fragte. Seit es dieses Protokoll gibt,
 * kann die Oberflaeche sagen, wann zuletzt gesammelt wurde und woran es lag.
 */
async function protokoll(daten) {
  try {
    const ort = path.join(process.cwd(), 'data', 'replays', '_lauf.json');
    await fs.writeFile(ort, JSON.stringify({
      zeitpunkt: new Date().toISOString(),
      art: nurLive ? 'live' : frischStunden > 0 ? `frisch ${frischStunden}h` : 'voll',
      ...daten,
    }, null, 2), 'utf8');
  } catch { /* dann eben ohne Protokoll */ }
}

main().catch(async (e) => {
  console.error('Fehlgeschlagen:', e.message);
  await protokoll({ ok: false, fehler: e.message });
  process.exit(1);
});
