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
//   node scripts/replays-holen.mjs --wiederholen  -> nur die Fehlversuche
//   node scripts/replays-holen.mjs --wiederholen --hoechstens 400
//
// --wiederholen geht die schon angelegten Fenster durch und fasst genau die
// Matches noch einmal an, die nicht fertig geworden sind - fehlgeschlagene,
// haengengebliebene und nie begonnene. Es fragt dafuer weder den Cup-Katalog
// noch Epics Bestenliste; es steht alles im Zustand des Fensters. Damit
// laesst sich nachholen, was ein abgebrochener Lauf liegengelassen hat,
// ohne dafuer jedes Turnier von vorn abzuklopfen.
//
// Einstellbar ueber die Umgebung:
//
//   MAX_REPLAY_DOWNLOADS  gleichzeitige Downloads      (Standard 3)
//   MAX_REPLAY_PARSERS    gleichzeitige Auswertungen   (Standard 2)
//   MAX_REPLAY_CHECKS     gleichzeitige Verfuegbarkeitsfragen (Standard 8)
//   REPLAY_STORAGE        local                        (Standard local)
//
// Jeder Schritt merkt sich seinen Zustand je Match. Schlaegt ein Download
// fehl, wird beim naechsten Lauf genau dieser Download wiederholt - nicht
// das Turnier von vorn.

import { promises as fs } from 'fs';
import path from 'path';
import {
  ABLAGE, FRIST_TAGE, ZUSTAND, ladeMatch, leseMatch, liesZustand, matchIds,
  matchPfad, replayVorhanden, schreibeMatch, schreibeZustand, warte,
  zustandAusOrdner,
} from '../lib/replayKern.mjs';

/*
 * Wo antwortet das Werkzeug?
 *
 * Hier stand fest "localhost:3000". Das ging still schief, sobald der Server
 * woanders lief: `next dev` weicht auf 3001 aus, und die fertige Anwendung
 * sucht sich den ersten freien Port. Der Lauf fragte dann ins Leere, bekam
 * keinen Cup-Katalog - und brach mit dem nackten "fetch failed" ab, an dem
 * niemand erkennen konnte, dass es am Port lag.
 *
 * Jetzt wird gesucht: erst die ueblichen Ports, dann alles, was auf diesem
 * Rechner im Bereich 3000 bis 3999 wirklich horcht. WERKZEUG_URL schlaegt
 * das - wird aber ebenfalls geprueft, statt blind genommen zu werden.
 */
const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3211];

/** Welche Ports auf diesem Rechner ueberhaupt jemand offen hat. */
async function offenePorts() {
  try {
    const { execSync } = await import('child_process');
    const roh = execSync('netstat -an -p TCP', { encoding: 'utf8', timeout: 8000 });
    const gefunden = new Set();
    for (const zeile of roh.split(/\r?\n/)) {
      if (!/LISTENING|ABH/i.test(zeile)) continue;
      const m = /:(\d{4,5})\s/.exec(zeile);
      const p = m ? Number(m[1]) : 0;
      if (p >= 3000 && p <= 3999) gefunden.add(p);
    }
    return [...gefunden].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * Antwortet dort der Cup-Katalog des Werkzeugs?
 *
 * Die Frist ist zweigeteilt. Beim Absuchen der eigenen Ports muss sie kurz
 * sein - dort wird siebenmal angeklopft, und hinter einem geschlossenen Port
 * steckt niemand, auf den sich warten liesse. Eine ausdruecklich gesetzte
 * Adresse ist etwas anderes: sie zeigt auf einen richtigen Server, und der
 * braucht fuer den vollstaendigen Katalog gemessen sieben Sekunden, wenn er
 * gerade erst hochgefahren ist.
 *
 * Mit den alten fuenf Sekunden fuer beides fiel WERKZEUG_URL jedes Mal
 * durch, das Skript suchte danach vergeblich auf localhost und endete mit
 * "es wurde nichts geholt" - und zwar mit Rueckgabewert null, also
 * unbemerkt. In der stuendlichen Aktion hiess das: Replays wurden nie
 * geholt, und auf der Seite stand waehrend jedes Cups, es seien noch keine
 * Matches ausgewertet worden.
 */
async function katalogDa(url, frist = 5000) {
  try {
    const r = await fetch(`${url}/api/cup-catalog`,
      { signal: AbortSignal.timeout(frist) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.cups) && j.cups.length > 0;
  } catch {
    return false;
  }
}

async function findeBasis() {
  if (process.env.WERKZEUG_URL) {
    if (await katalogDa(process.env.WERKZEUG_URL, 30_000)) return process.env.WERKZEUG_URL;
    console.log(`WERKZEUG_URL=${process.env.WERKZEUG_URL} antwortet nicht `
      + '- es wird selbst gesucht.');
  }

  const kandidaten = [...new Set([...PORTS, ...await offenePorts()])];
  for (const port of kandidaten) {
    const url = `http://localhost:${port}`;
    if (await katalogDa(url)) {
      if (port !== 3000) console.log(`Werkzeug antwortet auf Port ${port}.`);
      return url;
    }
  }

  throw new Error(
    'Das Werkzeug antwortet auf keinem Port (geprueft: '
    + kandidaten.join(', ') + ').\n'
    + '  Ohne den Cup-Katalog ist nicht zu erfahren, welche Spieltage es gibt\n'
    + '  - es wurde nichts geholt. Starte das Werkzeug (laptop-start.bat oder\n'
    + '  streamer-dashboard.bat) und fuehre diesen Lauf danach noch einmal aus.');
}

let BASIS = process.env.WERKZEUG_URL || 'http://localhost:3000';
const MAX_LADEN = Math.max(1, Number(process.env.MAX_REPLAY_DOWNLOADS) || 3);
const MAX_LESEN = Math.max(1, Number(process.env.MAX_REPLAY_PARSERS) || 2);
const MAX_PRUEFEN = Math.max(1, Number(process.env.MAX_REPLAY_CHECKS) || 8);
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
/**
 * Nur die Fehlversuche noch einmal anfassen.
 *
 * Im Archiv lagen 1892 Matches eines einzigen Spieltags als FAILED, alle mit
 * demselben nackten "fetch failed" - und die Replays dazu gab es bei Epic
 * noch. Sie warteten trotzdem auf den naechsten vollen Durchgang, der sich
 * erst durch zwanzig andere Fenster arbeiten muss.
 *
 * Dieser Lauf tut nur das eine: die vorhandenen Zustaende durchsehen und
 * genau die offenen Matches nachholen.
 */
const nurWiederholen = argumente.includes('--wiederholen');

/** Wie viele Matches ein Durchgang hoechstens anfasst - 0 heisst alle. */
const hoechstensIdx = argumente.indexOf('--hoechstens');
const hoechstens = hoechstensIdx >= 0
  ? Math.max(0, Number(argumente[hoechstensIdx + 1]) || 0) : 0;

const nurFenster = argumente.filter((a, i) =>
  !a.startsWith('--')
  && !(frischIdx >= 0 && i === frischIdx + 1)
  && !(hoechstensIdx >= 0 && i === hoechstensIdx + 1));

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
    /*
     * Der Platz wird uebergeben, nicht neu vergeben.
     *
     * Vorher stand hier `if (frei <= 0) await …; frei--;`. Zwischen dem
     * Wecken eines Wartenden und seinem `frei--` liegt ein Zug der
     * Ereignisschleife, und wer in dieser Luecke ankam, sah den Platz noch
     * als frei an. Beide gingen durch, und die Schleuse liess von da an
     * dauerhaft einen mehr hindurch, als sie sollte.
     *
     * Jetzt zaehlt nur herunter, wer wirklich einen freien Platz vorfindet;
     * wer wartet, bekommt beim Aufwecken den Platz des Fertigen direkt in
     * die Hand. Zwischen Pruefung und Zaehlen liegt kein `await` - dazwischen
     * kann also niemand dazwischenkommen.
     */
    if (frei > 0) frei--;
    else await new Promise((r) => warteschlange.push(r));
    try { return await arbeit(); }
    finally {
      const naechster = warteschlange.shift();
      if (naechster) naechster(); else frei++;
    }
  };
}

const ladeSchleuse = schleuse(MAX_LADEN);
const leseSchleuse = schleuse(MAX_LESEN);
/*
 * Auch das Nachfragen braucht eine Schleuse.
 *
 * Der Download war von Anfang an begrenzt, die Frage "gibt es dieses Replay
 * ueberhaupt noch?" nicht - und sie steht am Anfang jedes Matches. Bei einem
 * Fenster mit 4441 Matches gingen damit 4441 Anfragen gleichzeitig zu Epic
 * hinaus, weil `Promise.all` sie alle auf einmal startet. Dabei bleibt kein
 * Verbindungsspeicher uebrig; genau daher kommen die 1892 Fehlversuche mit
 * dem nackten "fetch failed", waehrend die Replays selbst bei Epic noch
 * liegen. Die Anfrage ist billiger als ein Download, deshalb ein groesseres
 * Fenster - aber eben eines.
 */
const pruefSchleuse = schleuse(MAX_PRUEFEN);

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

  /*
   * Victory Cups vollstaendig, nicht nur die Endrunde.
   *
   * Der Betreiber: "Es sind ja nicht nur drei Games beim Solo-Cup, sondern
   * es hat mehrere gegeben, weil es ein Open Cup ist, kein Final. Es hat
   * jeden einzelnen Drecksmatch zu durchsuchen."
   *
   * Das kostet: die Endrunde eines Solo Victory Cup EU sind 119 Matches und
   * vier Megabyte; eine offene Runde desselben Cups hat ein Vielfaches
   * davon. Heruntergeladen wird je Match ein Replay von rund drei Megabyte,
   * gespeichert bleiben nur die ausgewerteten Zahlen.
   */
  if (/victory/.test(t)) return 'alles';

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
  BASIS = await findeBasis();
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
    const { vorhanden, metadaten } = await pruefSchleuse(() => replayVorhanden(matchId));
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

/**
 * Verlorene Verwaltungsdateien wiederherstellen.
 *
 * Im Archiv lagen zwei Fenster mit 290 und 604 fertigen Auswertungen, aber
 * ohne _zustand.json. Die Uebersicht ueberging sie stillschweigend, und ein
 * Lauf haette dieselben neunhundert Matches noch einmal geholt - Epic
 * gegenueber unhoeflich und fuer nichts. Die Auswertungen selbst tragen
 * alles Noetige; daraus laesst sich der Zustand ohne eine einzige Abfrage
 * zurueckschreiben.
 */
async function repariereZustaende() {
  let saisons = [];
  try { saisons = await fs.readdir(ABLAGE); } catch { return 0; }
  let geheilt = 0;

  for (const season of saisons) {
    let liste = [];
    try { liste = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
    for (const windowId of liste) {
      const vorhanden = await liesZustand(season, windowId);
      if (Object.keys(vorhanden.matches ?? {}).length) continue;
      const erschlossen = await zustandAusOrdner(season, windowId, true);
      if (!erschlossen) continue;
      await schreibeZustand(season, windowId, erschlossen);
      geheilt++;
      console.log(`  ${windowId}: Zustand aus `
        + `${Object.keys(erschlossen.matches).length} Auswertungen wiederhergestellt`);
    }
  }
  return geheilt;
}

/**
 * Nur nachholen, was liegengeblieben ist.
 *
 * Weder Cup-Katalog noch Bestenliste werden dafuer gebraucht: was offen ist,
 * steht im Zustand des Fensters. Damit laeuft dieser Durchgang auch dann,
 * wenn das Werkzeug selbst gerade nicht antwortet - und er arbeitet sich
 * durch die Fehlversuche, ohne sich vorher durch zwanzig fertige Turniere
 * zu graben.
 */
async function wiederholen() {
  const geheilt = await repariereZustaende();
  if (geheilt) console.log(`${geheilt} Verwaltungsdatei(en) wiederhergestellt.
`);

  const grenze = Date.now() - FRIST_TAGE * 864e5;
  const arbeit = [];
  let ausserhalb = 0;

  let saisons = [];
  try { saisons = await fs.readdir(ABLAGE); } catch { /* nichts da */ }
  for (const season of saisons) {
    let liste = [];
    try { liste = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
    for (const windowId of liste) {
      const zustand = await liesZustand(season, windowId);
      const offen = Object.entries(zustand.matches ?? {})
        // Fertig ist fertig, und was Epic nicht mehr hat, bekommt es nicht
        // zurueck. Alles andere - fehlgeschlagen, haengengeblieben, nie
        // begonnen - wird noch einmal angefasst.
        .filter(([, m]) => m.stand !== ZUSTAND.FERTIG
          && m.stand !== ZUSTAND.NICHT_VORHANDEN)
        .map(([id]) => id);
      if (!offen.length) continue;
      // Ausserhalb der Frist gibt es das Replay nicht mehr. Danach zu fragen
      // waere eine Abfrage fuer eine Antwort, die schon feststeht.
      if ((zustand.datum ?? 0) && zustand.datum < grenze) {
        ausserhalb += offen.length; continue;
      }
      arbeit.push({ season, windowId, zustand, offen });
    }
  }

  // Das aelteste zuerst: dessen Frist laeuft als naechstes ab.
  arbeit.sort((a, b) => (a.zustand.datum ?? 0) - (b.zustand.datum ?? 0));

  const gesamt = arbeit.reduce((a, x) => a + x.offen.length, 0);
  console.log(`${arbeit.length} Fenster mit ${gesamt} offenen Matches`
    + (ausserhalb ? `, ${ausserhalb} ausserhalb der Frist (${FRIST_TAGE} Tage)` : ''));
  if (hoechstens) console.log(`Dieser Durchgang fasst hoechstens ${hoechstens} an.`);
  if (!gesamt) {
    await protokoll({ ok: true, fenster: 0, neu: 0, ohneReplay: 0, fehlgeschlagen: 0 });
    return;
  }

  let angefasst = 0; let fertig = 0; let ohne = 0; let fehler = 0;

  for (const f of arbeit) {
    if (hoechstens && angefasst >= hoechstens) break;
    const dran = hoechstens ? f.offen.slice(0, hoechstens - angefasst) : f.offen;
    angefasst += dran.length;

    console.log(`
${f.season} ${(f.zustand.region ?? '?').padEnd(4)} `
      + `${f.zustand.titel ?? f.windowId}`);
    console.log(`  ${dran.length} von ${f.offen.length} offenen`);

    const ziel = {
      season: f.season, windowId: f.windowId, eventId: f.zustand.eventId,
      region: f.zustand.region, titel: f.zustand.titel,
    };

    let getan = 0; let seitSicherung = 0;
    const ergebnisse = await Promise.all(dran.map(async (id) => {
      const r = await verarbeite(ziel, id, f.zustand);
      getan += 1; seitSicherung += 1;
      if (getan % 50 === 0 || getan === dran.length) {
        console.log(`    ${getan}/${dran.length} ...`);
      }
      if (seitSicherung >= 200) {
        seitSicherung = 0;
        await schreibeZustand(f.season, f.windowId, f.zustand);
      }
      return r;
    }));
    for (const r of ergebnisse) {
      if (r === 'fertig') fertig++;
      else if (r === 'nicht_vorhanden') ohne++;
      else fehler++;
    }
    await schreibeZustand(f.season, f.windowId, f.zustand);
    await warte(500);
  }

  console.log(`
Fertig: ${fertig} nachgeholt, ${ohne} ohne Replay, `
    + `${fehler} wieder fehlgeschlagen`);
  await protokoll({
    ok: true, fenster: arbeit.length, neu: fertig,
    ohneReplay: ohne, fehlgeschlagen: fehler,
  });
}

async function main() {
  if (SPEICHER !== 'local') {
    console.log(`REPLAY_STORAGE=${SPEICHER} ist noch nicht gebaut - es wird lokal abgelegt.`);
  }
  // Nicht "Schleusen": das las sich wie eine Anzahl gefundener Matches.
  console.log(`Gleichzeitig: ${MAX_LADEN} Downloads, ${MAX_LESEN} Auswertungen, `
    + `${MAX_PRUEFEN} Abfragen`);

  if (nurWiederholen) { await wiederholen(); return; }

  /*
   * Vor allem anderen die verlorenen Verwaltungsdateien wiederherstellen.
   *
   * Ohne sie sieht ein Lauf ein Fenster als voellig unbearbeitet an und
   * laedt neunhundert Replays ein zweites Mal - obwohl die Auswertungen
   * daneben liegen. Der volle Durchgang macht das mit; der stuendliche und
   * der Live-Lauf nicht, sie sollen kurz bleiben.
   */
  if (!nurLive && frischStunden <= 0) {
    const geheilt = await repariereZustaende();
    if (geheilt) console.log(`${geheilt} Verwaltungsdatei(en) wiederhergestellt.`);
  }

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

    /*
     * Die Matches eines Fensters laufen nebeneinander; die Schleusen
     * begrenzen, wie viele davon wirklich gleichzeitig arbeiten.
     *
     * Zwei Dinge waehrenddessen, beide wegen der grossen Fenster: eine
     * offene Runde eines Reload Duos Victory Cup hat viertausend Matches,
     * und die brauchen ihre Zeit.
     *
     *   - Alle fuenfzig fertigen Matches eine Zeile. Vorher kam bis zum
     *     Ende des Fensters kein einziges Zeichen, und ein Lauf, der eine
     *     Stunde arbeitet, sah aus wie einer, der haengt.
     *   - Alle zweihundert wird der Zustand geschrieben. Vorher stand er
     *     erst am Ende in der Datei - wer den Lauf vorher abbrach, verlor
     *     jeden einzelnen Download.
     */
    let getan = 0;
    let seitSicherung = 0;
    const ergebnisse = await Promise.all(offen.map(async (id) => {
      const r = await verarbeite(f, id, zustand);
      getan += 1; seitSicherung += 1;
      if (getan % 50 === 0 || getan === offen.length) {
        console.log(`    ${getan}/${offen.length} ...`);
      }
      if (seitSicherung >= 200) {
        seitSicherung = 0;
        await schreibeZustand(f.season, f.windowId, zustand);
      }
      return r;
    }));
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
      art: nurWiederholen ? 'wiederholen'
        : nurLive ? 'live'
        : frischStunden > 0 ? `frisch ${frischStunden}h` : 'voll',
      ...daten,
    }, null, 2), 'utf8');
  } catch { /* dann eben ohne Protokoll */ }
}

main().catch(async (e) => {
  console.error('Fehlgeschlagen:', e.message);
  await protokoll({ ok: false, fehler: e.message });
  process.exit(1);
});
