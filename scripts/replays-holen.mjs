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

import { promises as fs, existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  ABLAGE, FRIST_TAGE, ZUSTAND, fensterPfad, ladeMatch, leseMatch, leseMatchTief,
  liesZustand, matchIds, matchPfad, replayVorhanden, schreibeMatch, schreibeZustand,
  warte, zustandAusOrdner,
} from '../lib/replayKern.mjs';
import { replayRegel, endrunden } from '../lib/replayRegel.mjs';

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
    /*
     * Bei einer gesetzten Adresse wird nachgefasst, nicht aufgegeben.
     *
     * Gemessen an der eigenen Seite: der erste Aufruf nach einer neuen
     * Auslieferung lief ueber zwei Minuten ins Leere, der zweite brauchte
     * zehn Sekunden, der dritte anderthalb. Das ist der Kaltstart - die
     * Antwort wird anschliessend fuenf Minuten lang gemerkt.
     *
     * Auf einem Laeufer bei GitHub gibt es keinen Ausweichweg: schlaegt die
     * Pruefung fehl, sucht das Skript auf localhost, findet dort nichts und
     * endet mit "es wurde nichts geholt" - unbemerkt, weil es dabei null
     * zurueckgibt. Ein einzelner Versuch ist dafuer zu wenig.
     */
    for (const versuch of [1, 2, 3]) {
      if (await katalogDa(process.env.WERKZEUG_URL, 60_000)) {
        return process.env.WERKZEUG_URL;
      }
      console.log(`WERKZEUG_URL=${process.env.WERKZEUG_URL} antwortet nicht `
        + `(Versuch ${versuch} von 3).`);
    }
    console.log('Es wird selbst gesucht.');
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

/*
 * Nacharbeiten auf mehreren Rechnern zugleich (siehe
 * .github/workflows/replays-nacharbeiten.yml).
 *
 * Am 25.9.2026 warteten 15884 Matches aus siebzehn Spieltagen; ein
 * stuendlicher Lauf schaffte davon in seinen neunundzwanzig Minuten ein paar
 * hundert, und jeden Tag kamen Tausende dazu. Der Betreiber: "seit fuenf
 * Tagen schaust du dir keine Replays mehr an".
 *
 *   --teil 2/4       dieser Rechner nimmt jeden vierten Spieltag (den dritten)
 *   --minuten 50     danach nichts Neues mehr anfangen, sauber sichern
 *   --ohne-frische 6 Spieltage der letzten sechs Stunden auslassen - die
 *                    holt der Live-Ablauf, und zwei Rechner auf demselben
 *                    Spieltag ueberschrieben einander den Stand
 */
const teilIdx = argumente.indexOf('--teil');
const [teilNr, teilVon] = teilIdx >= 0
  ? String(argumente[teilIdx + 1] ?? '0/1').split('/').map((x) => Math.max(0, Number(x) || 0))
  : [0, 1];
/**
 * Welcher Rechner einen Spieltag nimmt - fest nach seiner Kennung, nicht nach dem Platz in der Liste (28.10.2026): die Liste der offenen Spieltage
 * schrumpft waehrend der Arbeit, und jeder Rechner sieht nur seine eigenen Fortschritte; mit dem Platz fassten bald zwei Rechner denselben Spieltag an
 * und ueberschrieben einander die Auswertung.
 */
const meinTeil = (windowId) => {
  let h = 0;
  for (const c of String(windowId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return teilVon <= 1 || h % teilVon === teilNr % teilVon;
};
/*
 * Vorrang (28.10.2026): Spieltage, die jemand auf der Seite ansieht und die noch keine Auswertung haben, legt die Seite als Anfrage ins Datenarchiv
 * (lib/replayVorrang.ts, replay-vorrang/<Fenster>.json); der Ablauf holt den Ordner vor jedem Durchgang. Diese Spieltage kommen
 * vor allen anderen dran. Anfragen aelter als zwei Tage zaehlen nicht mehr.
 */
const vorrang = (() => {
  const raus = new Set();
  try {
    const ordner = path.join(process.cwd(), 'data', 'replay-vorrang');
    for (const d of existsSync(ordner) ? readdirSync(ordner) : []) {
      if (!d.endsWith('.json')) continue;
      try {
        const v = JSON.parse(readFileSync(path.join(ordner, d), 'utf8'));
        if (v?.windowId && Date.now() - (v.zeit ?? 0) < 2 * 864e5) raus.add(v.windowId);
      } catch { /* kaputte Anfrage */ }
    }
  } catch { /* ohne Vorrang */ }
  return raus;
})();
const vorrangZuerst = (a, b) => (vorrang.has(b.windowId) ? 1 : 0) - (vorrang.has(a.windowId) ? 1 : 0);
const minutenIdx = argumente.indexOf('--minuten');
const minuten = minutenIdx >= 0 ? Math.max(0, Number(argumente[minutenIdx + 1]) || 0) : 0;
const schluss = minuten ? Date.now() + minuten * 60_000 : Infinity;
const frischeIdx = argumente.indexOf('--ohne-frische');
const ohneFrischeStunden = frischeIdx >= 0 ? Math.max(0, Number(argumente[frischeIdx + 1]) || 0) : 0;

/*
 * Schnellspur (29.10.2026, .github/workflows/replays-schnell.yml). Der Betreiber: "ein Cup darf maximal eine halbe Stunde gehen, ein kompletter Cup" - beim
 * Inoxtag Icon Cup EU vom 25.10. stand vier Tage spaeter unter Player Stats noch "The analysis ... has been requested", am Release lag nicht einmal ein Stand.
 * Ein Spieltag gehoerte genau einem der acht Nacharbeits-Rechner, und dessen Gang fuer neue Spieltage fing bei jedem Durchgang beim aeltesten an und wurde
 * nach zwanzig Minuten abgebrochen - neue Cups erreichte er nie. Jetzt verteilt ein Planer die offenen Matches der frischen und angefragten Spieltage auf
 * mehrere Rechner (jeder ein Stueck JEDES Spieltags), und ein Zusammenfuehrer schreibt als Einziger Stand, Auswertung und schlanke Fassung:
 *
 *   --plan-schreiben DATEI [--stunden 36] [fenster ...]   welche Spieltage, welche Matches offen sind; "stuecke=[0,1,...]" nach GITHUB_OUTPUT
 *   --aus-plan DATEI --stueck 2/5 [--minuten 22]          dieser Rechner liest jedes fuenfte offene Match (das dritte); Teilstand nach data/schnell-stueck/
 *   --plan-zusammen DATEI                                  Teilstaende in den Stand vom Release einarbeiten, auswerten, schlank ablegen, hochladen
 */
const MIT_WERT = new Set(['--frisch', '--hoechstens', '--teil', '--minuten', '--ohne-frische', '--plan-schreiben', '--aus-plan', '--plan-zusammen',
  '--stueck', '--stunden']);
const wertVon = (name) => { const i = argumente.indexOf(name); return i >= 0 ? argumente[i + 1] : undefined; };
const planSchreiben = wertVon('--plan-schreiben');
const ausPlan = wertVon('--aus-plan');
const planZusammen = wertVon('--plan-zusammen');
const stueckNr = Math.max(0, Number(String(wertVon('--stueck') ?? '0').split('/')[0]) || 0);
/** So lange nach seinem Ende gehoert ein Spieltag der Schnellspur; die Nacharbeit (mehrere Rechner, --teil) laesst ihn so lange liegen. */
const SCHNELL_STUNDEN = Math.max(1, Number(wertVon('--stunden')) || 36);
const nacharbeit = teilVon > 1;
/** Gehoert der Spieltag gerade der Schnellspur? Frisch zu Ende gegangen oder auf der Seite angefragt. */
const gehoertSchnellspur = (windowId, datum) => vorrang.has(windowId) || (datum ?? 0) > Date.now() - SCHNELL_STUNDEN * 3600_000;

const nurFenster = argumente.filter((a, i) => !a.startsWith('--') && !MIT_WERT.has(argumente[i - 1]));

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

/** Welche Turnierfenster kommen ueberhaupt infrage? */
async function offeneFenster() {
  BASIS = await findeBasis();
  /*
   * Der volle Katalog, nicht die Voreinstellung.
   *
   * Ohne "modus=alle" antwortet die Schnittstelle mit den Standard-Cups -
   * dreizehn Stueck, ohne Mobile, ohne Skin-Cups, ohne Ranked. Genau darin
   * lag der Grund, warum waehrend des laufenden "Override Series: Mega Man
   * Mobile Cup" nichts geholt wurde: der Cup stand gar nicht in der Liste,
   * die dieses Skript zu sehen bekam.
   *
   * Dass hier der volle Katalog hingehoert, steht schon in den Regeln
   * darueber: replayRegel wirft niedrige Divisionen und Ranked Cups eigens
   * hinaus. Gegen die verkuerzte Liste waren diese Regeln wirkungslos - was
   * sie aussortieren sollten, war nie darin.
   */
  const antwort = await fetch(`${BASIS}/api/cup-catalog?modus=alle`);
  if (!antwort.ok) throw new Error(`Cup-Katalog HTTP ${antwort.status}`);
  const katalog = await antwort.json();

  const jetzt = Date.now();
  const grenze = jetzt - FRIST_TAGE * 864e5;
  const fenster = [];
  const zuAlt = [];

  let uebersprungen = 0;
  /*
   * REPLAY_NUR_UEBERSPRUNGENE=1 (30.10.2026, der Betreiber: "von jedem einzelnen Cup ... jede einzelne Runde analysieren"): genau umgekehrt - nur die
   * Spieltage, die die Regeln unten auslassen. Ein eigener Rechner arbeitet sie ab, ohne den anderen einen Spieltag wegzunehmen (ein Schreiber je Spieltag).
   */
  const NUR_UEBERSPRUNGENE = process.env.REPLAY_NUR_UEBERSPRUNGENE === '1';
  // Ist der PC des Betreibers an (Lebenszeichen), gehoeren ihm die Spieltage, die die strengen Regeln auslassen - sonst liest GitHub auch sie.
  const pcAn = NUR_UEBERSPRUNGENE ? true : await pcLeserAktiv();
  if (pcAn && !NUR_UEBERSPRUNGENE) console.log('PC-Leser ist an - die frueher ausgelassenen Spieltage liest er.');
  for (const cup of katalog.cups ?? []) {
    const regel = replayRegel(cup, true);
    if (regel === 'nichts' && pcAn && !NUR_UEBERSPRUNGENE) {
      uebersprungen += Object.values(cup.regionen ?? {}).flat().length;
      continue;
    }
    if (NUR_UEBERSPRUNGENE && regel === 'alles') {
      uebersprungen += Object.values(cup.regionen ?? {}).flat().length;
      continue;
    }

    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      /*
       * Welche Fenster dieser Region die Endrunde sind.
       *
       * Auch dort, wo die Regel "alles" lautet und deshalb nicht gefiltert
       * wird, muss das bekannt sein: die tiefe Auswertung des Replays
       * gehoert an die Endrunde, nicht an jede offene Runde.
       */
      const endrundeHier = endrunden(liste);
      for (const w of liste) {
        // Im Live-Lauf genau umgekehrt: nur, was gerade laeuft.
        if (nurLive ? w.status !== 'live' : w.status !== 'vorbei') continue;
        const imPcBereich = regel === 'nichts' || Boolean(finals && !finals.has(w.windowId));
        if (NUR_UEBERSPRUNGENE ? !imPcBereich : (imPcBereich && pcAn)) { uebersprungen++; continue; }
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
          /** Endrunde? Nur dort wird das Replay tief gelesen. */
          istEndrunde: endrundeHier.has(w.windowId),
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

/*
 * ------------------------------------------------ Zwei Sammler, ein Stand
 *
 * Gesammelt wird an zwei Orten: im Live-Lauf waehrend eines Cups und im
 * stuendlichen Lauf danach. Jeder hat seinen eigenen Ordner mit
 * Match-Dateien; gemeinsam ist ihnen nur, was in der Ablage liegt - der
 * Zustand je Fenster und das Aggregat.
 *
 * Zwei Dinge folgen daraus:
 *
 *   - Fehlt der Zustand eines Fensters hier, wird er aus der Ablage geholt,
 *     bevor irgendetwas angefasst wird. Sonst hielte dieser Lauf das Fenster
 *     fuer unberuehrt und holte viertausend Matches ein zweites Mal.
 *   - "Ausgewertet" im Zustand heisst nicht, dass die Datei hier liegt. Sie
 *     kann beim anderen Sammler liegen - dann ist sie im Aggregat, und das
 *     genuegt. Steht sie aber weder hier noch im Aggregat, ist sie verloren
 *     und wird noch einmal geholt.
 */

/** Den Zustand eines Fensters aus der Ablage holen, wenn er hier fehlt. */
async function zustandNachholen(f) {
  const ordner = fensterPfad(f.season, f.windowId);
  if (existsSync(path.join(ordner, '_zustand.json'))) return;
  // Vom Release - seit dem 22.9.2026 liegen Zustand und Aggregat nur dort
  // (siehe lib/ablageGithub, nurRelease), nicht mehr bei Supabase.
  const r = spawnSync(process.execPath, [
    path.join('scripts', 'ablage-github-holen.mjs'),
    `replays/${f.season}/${f.windowId}/_zustand.json`,
    `replays/${f.season}/${f.windowId}/_aggregat.json`,
  ], { encoding: 'utf8', env: process.env });
  if (r.status === 0 && existsSync(path.join(ordner, '_zustand.json'))) {
    console.log(`  Zustand aus der Ablage geholt (${f.windowId})`);
  }
}

/**
 * Welche Matches das Aggregat schon enthaelt - oder null, wenn es keines
 * gibt. Ein Aggregat ohne Kennungen (aeltere Fassung) zaehlt als
 * "enthaelt alles, was der Zustand als ausgewertet fuehrt".
 */
function imAggregatSync(f) {
  try {
    const roh = JSON.parse(readFileSync(
      path.join(fensterPfad(f.season, f.windowId), '_aggregat.json'), 'utf8'));
    return {
      enthalten: Array.isArray(roh.matchIds) ? new Set(roh.matchIds) : 'alle',
      matches: Number(roh.matches) || 0,
    };
  } catch {
    return null;
  }
}

/*
 * Wann ein "nicht vorhanden" noch einmal gefragt wird.
 *
 * Bis zum 29.9.2026 nur am ersten Tag. Eine Stichprobe an diesem Tag zeigte
 * aber: von sechs Spieltagen mit "NOT_AVAILABLE" lagen bei vier alle
 * geprueften Replays inzwischen bei Epic (Madison Beer ME, Division 1 NAC,
 * Performance Evaluation Event 2, Persona 5 ZB ME) - Epic legt manche erst
 * Tage spaeter ab. Der Betreiber: "es sollen eigentlich gar keine Matches
 * fehlen". Jetzt wird bis zu Epics Frist von 31 Tagen weiter gefragt: am
 * ersten Tag alle zehn Minuten, danach alle zwoelf Stunden.
 */
function nochmalFragen(m) {
  const zuletzt = Date.parse(m.zuletzt ?? '') || 0;
  const erstmals = Date.parse(m.erstmals ?? '') || zuletzt;
  const alter = Date.now() - erstmals;
  if (alter > FRIST_TAGE * 864e5) return false;
  return alter < 24 * 3600_000
    ? Date.now() - zuletzt > 10 * 60_000
    : Date.now() - zuletzt > 12 * 3600_000;
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
      // Kein Fehler: entweder noch nicht abgelegt (dann wird spaeter noch
      // einmal gefragt, siehe oben) oder nach einem Monat weggeraeumt.
      // "erstmals" merkt sich, seit wann es fehlt.
      setze(ZUSTAND.NICHT_VORHANDEN, {
        erstmals: zustand.matches[matchId]?.erstmals ?? new Date().toISOString(),
      });
      return 'nicht_vorhanden';
    }
    /*
     * Ein Replay, das Epic noch als live fuehrt, ist nur der Anfang des Spiels (28.10.2026: in den FNCS Solos Finals standen die Spiele 2 bis 5 mit 11 bis 27 statt
     * rund hundert Eliminierungen in der Auswertung - gelesen zehn Minuten nach dem Start). Dann gilt es als noch nicht da und wird nach zehn Minuten wieder
     * gefragt. Haengt die Live-Marke nach sechs Stunden noch, wird gelesen, was da ist.
     */
    const seitStart = Date.now() - (Date.parse(metadaten?.Timestamp ?? '') || Date.now());
    if (metadaten?.bIsLive && seitStart < 6 * 3600_000) {
      setze(ZUSTAND.NICHT_VORHANDEN, { erstmals: zustand.matches[matchId]?.erstmals ?? new Date().toISOString(), live: true });
      return 'nicht_vorhanden';
    }
    setze(ZUSTAND.VORHANDEN, { zeitpunkt: metadaten.Timestamp ?? null });

    setze(ZUSTAND.LAEDT);
    const puffer = await ladeSchleuse(() => ladeMatch(matchId));
    setze(ZUSTAND.GELADEN, { bytes: puffer.length });

    setze(ZUSTAND.WERTET_AUS);
    const daten = await leseSchleuse(() => leseMatch(matchId, puffer));
    // Dasselbe nach dem Lesen: ist das Replay kuerzer als das Spiel laut Epic, wurde es geladen, bevor Epic es fertig abgelegt hatte.
    if (metadaten?.LengthInMS && daten.dauerMs && daten.dauerMs < 0.97 * metadaten.LengthInMS && seitStart < 6 * 3600_000) {
      setze(ZUSTAND.NICHT_VORHANDEN, { erstmals: zustand.matches[matchId]?.erstmals ?? new Date().toISOString(), teil: true });
      return 'nicht_vorhanden';
    }

    /*
     * Bei einem Finale zusaetzlich die Lobby aus dem Replay lesen.
     *
     * Der C#-Leser gibt die vollstaendige Aufstellung mit echter
     * Platzierung - nachgemessen zwanzig Teams, Plaetze eins bis zwanzig,
     * lueckenlos. Genau das fehlt in Epics Bestenliste immer wieder: dort
     * sind einzelne Matches eines Teams gar nicht eingetragen, und die
     * Aufstellung hatte dann Loecher, die sich anders nicht schliessen
     * liessen.
     *
     * Nur bei Finals, und aus zwei Gruenden. Es kostet: statt achthundert
     * Kilobyte werden einundsechzig Megabyte geladen, und die Auswertung
     * dauert rund vier Sekunden statt zwei Millisekunden - bei einer
     * offenen Runde mit hunderten Lobbys waere das stundenlang. Und es
     * nuetzt dort am wenigsten: eine offene Runde zeigt ohnehin nur, was
     * in den ersten zehntausend Plaetzen der Bestenliste steht.
     *
     * Schlaegt es fehl, bleibt alles beim Alten. Die Ereignisse sind
     * bereits gelesen; die Lobby ist eine Zugabe, kein Fundament.
     */
    /*
     * Jetzt auch in den Opens, nicht nur im Finale.
     *
     * Der Betreiber will im Replay sehen, welches Team welchen Platz hat -
     * das steht nur in der tiefen Auswertung. Die Grenze liegt bei
     * fuenfhundert Matches je Fenster: ein Reload-Open mit viertausend
     * Lobbys bleibt bei den Ereignissen, sonst zoege sich ein Cup ueber
     * Stunden (vier Sekunden und einundsechzig Megabyte je Match).
     */
    let lobby = null;
    /*
     * Seit dem 28.10.2026 wieder nur in der Endrunde. 251 Spieltage der letzten 30 Tage hatten gar keine Auswertung (Inoxtag Icon Cup EU: "No replays
     * analysed") - der Sammler kam nicht hinterher, weil er jede offene Runde bis 500 Matches zusaetzlich tief las (61 MB statt 2 MB je Match, dazu Abstuerze
     * des Lesers). Player Stats brauchen nur die Ereignisse; die Aufstellung mit Platz ist im Finale wichtig, in offenen Runden eine Zugabe.
     */
    if (f.istEndrunde) {
      try {
        lobby = await leseSchleuse(() => leseMatchTief(matchId));
      } catch (e) {
        console.log(`\n  Lobby aus dem Replay nicht lesbar (${matchId}): ${e.message}`);
      }
    }

    await schreibeMatch(f.season, f.windowId, {
      ...daten,
      lobby,
      eventId: f.eventId, windowId: f.windowId,
      region: f.region, season: f.season, titel: f.titel,
    });
    setze(ZUSTAND.FERTIG, {
      elims: daten.elims.length, konten: daten.konten.length,
      lobbyTeams: lobby?.teams?.length ?? 0,
      parserVersion: daten.parserVersion,
      // Nur der Ort, nicht die Datei selbst - so wie gewuenscht.
      pfad: path.relative(process.cwd(), matchPfad(f.season, f.windowId, matchId)),
      fehler: null, live: undefined, teil: undefined,
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
  let listenErgaenzt = 0;
  /*
   * Einmal die ganze Bestenliste (29.10.2026): bis dahin las der Sammler zehn Seiten, und von offenen Runden fehlten die meisten Matches - das
   * Inoxtag-Icon-Cup-Fenster EU hatte 3.577 statt 20.691. Jeder Spieltag der Frist, dessen Liste nie ganz gelesen wurde, bekommt die fehlenden
   * Matches als offen dazu; danach traegt er "idsAlle". Zuerst die aeltesten (Betreiber: "die gerade so bei 30 Tage sind ... als allererstes"),
   * nur der eigene Teil (mehrere Rechner), hoechstens bis zehn Minuten vor Schluss.
   */
  const nachlesen = [];
  for (const season of saisons) {
    let liste = [];
    try { liste = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
    for (const windowId of liste) {
      if (!meinTeil(windowId)) continue;
      const zustand = await liesZustand(season, windowId);
      if (zustand.idsAlle || !zustand.eventId || (zustand.datum ?? 0) < grenze) continue;
      if (nacharbeit && gehoertSchnellspur(windowId, zustand.datum)) continue;
      nachlesen.push({ season, windowId, zustand });
    }
  }
  nachlesen.sort((a, b) => (a.zustand.datum ?? 0) - (b.zustand.datum ?? 0));
  if (nachlesen.length) console.log(`${nachlesen.length} Spieltage ohne ganze Bestenliste - die aeltesten zuerst.`);
  for (const { season, windowId, zustand } of nachlesen) {
    if (Date.now() >= schluss - 10 * 60_000) break;
    try {
      const ids = await matchIds(zustand.eventId, windowId);
      zustand.matches ??= {};
      let neu = 0;
      for (const id of ids) if (!zustand.matches[id]) { zustand.matches[id] = { stand: ZUSTAND.OFFEN }; neu += 1; }
      zustand.idsAlle = new Date().toISOString();
      await schreibeZustand(season, windowId, zustand);
      listenErgaenzt += 1;
      console.log(`  ${windowId}: ganze Bestenliste - ${ids.length} Matches, ${neu} neu dazu`);
    } catch (e) { console.log(`  ${windowId}: Bestenliste - ${e.message}`); }
  }

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
          && (m.stand !== ZUSTAND.NICHT_VORHANDEN || nochmalFragen(m)))
        .map(([id]) => id);
      if (!offen.length) continue;
      // Ausserhalb der Frist gibt es das Replay nicht mehr. Danach zu fragen
      // waere eine Abfrage fuer eine Antwort, die schon feststeht.
      if ((zustand.datum ?? 0) && zustand.datum < grenze) {
        ausserhalb += offen.length; continue;
      }
      // Was eben erst lief, gehoert dem Live-Ablauf.
      if (ohneFrischeStunden && (zustand.datum ?? 0) > Date.now() - ohneFrischeStunden * 3600_000) continue;
      // Was frisch zu Ende ging oder auf der Seite angefragt ist, gehoert der Schnellspur - zwei Schreiber an einem Stand verlieren einander Matches.
      if (nacharbeit && gehoertSchnellspur(windowId, zustand.datum)) continue;
      arbeit.push({ season, windowId, zustand, offen });
    }
  }

  // Das aelteste zuerst: dessen Frist laeuft als naechstes ab.
  arbeit.sort((a, b) => vorrangZuerst(a, b) || (a.zustand.datum ?? 0) - (b.zustand.datum ?? 0));

  // Mehrere Rechner: reihum verteilt. Alle sehen denselben Stand vom
  // Release und sortieren gleich - also nimmt jeder genau seine Spieltage.
  if (teilVon > 1) {
    const meine = arbeit.filter((a) => meinTeil(a.windowId));
    console.log(`Teil ${teilNr % teilVon + 1} von ${teilVon}: ${meine.length} von ${arbeit.length} Spieltagen.`);
    arbeit.splice(0, arbeit.length, ...meine);
  }

  if (listenErgaenzt) console.log(`${listenErgaenzt} Spieltage mit der ganzen Bestenliste ergaenzt.`);
  const gesamt = arbeit.reduce((a, x) => a + x.offen.length, 0);
  console.log(`${arbeit.length} Fenster mit ${gesamt} offenen Matches`
    + (ausserhalb ? `, ${ausserhalb} ausserhalb der Frist (${FRIST_TAGE} Tage)` : ''));
  if (hoechstens) console.log(`Dieser Durchgang fasst hoechstens ${hoechstens} an.`);
  if (!gesamt) {
    await protokoll({ ok: true, fenster: 0, neu: 0, ohneReplay: 0, fehlgeschlagen: 0 });
    return;
  }

  let angefasst = 0; let fertig = 0; let ohne = 0; let fehler = 0; let liegen = 0;

  for (const f of arbeit) {
    if (hoechstens && angefasst >= hoechstens) break;
    if (Date.now() >= schluss) break;
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
    /*
     * Eine Schlange statt alles auf einmal.
     *
     * Vorher liefen alle Matches eines Spieltags gleichzeitig an und
     * warteten erst in den Schleusen - eine Zeitgrenze liess sich so nicht
     * einhalten. Jetzt holt sich jeder Arbeiter das naechste Match und sieht
     * vorher auf die Uhr: ist die Zeit um, bleibt der Rest offen und wird
     * beim naechsten Lauf angefasst, statt mitten im Laden abgewuergt zu
     * werden.
     */
    const ergebnisse = [];
    let naechster = 0;
    const arbeiter = async () => {
      while (naechster < dran.length) {
        const id = dran[naechster++];
        if (Date.now() >= schluss) { liegen += 1; ergebnisse.push('liegen'); continue; }
        const r = await verarbeite(ziel, id, f.zustand);
        ergebnisse.push(r);
        getan += 1; seitSicherung += 1;
        if (getan % 50 === 0 || getan === dran.length) {
          console.log(`    ${getan}/${dran.length} ...`);
        }
        if (seitSicherung >= 200) {
          seitSicherung = 0;
          await schreibeZustand(f.season, f.windowId, f.zustand);
        }
      }
    };
    // Genug gleichzeitig, dass Laden, Pruefen und Lesen nie leerlaufen.
    await Promise.all(Array.from({ length: MAX_LADEN + MAX_LESEN + MAX_PRUEFEN }, arbeiter));
    for (const r of ergebnisse) {
      if (r === 'fertig') fertig++;
      else if (r === 'nicht_vorhanden') ohne++;
      else if (r === 'liegen') { /* naechstes Mal */ }
      else fehler++;
    }
    await schreibeZustand(f.season, f.windowId, f.zustand);
    await warte(500);
  }

  console.log(`
Fertig: ${fertig} nachgeholt, ${ohne} ohne Replay, `
    + `${fehler} wieder fehlgeschlagen${liegen ? `, ${liegen} fuer den naechsten Lauf liegen gelassen` : ''}`);
  await protokoll({
    ok: true, fenster: arbeit.length, neu: fertig,
    ohneReplay: ohne, fehlgeschlagen: fehler,
  });
}

/* ------------------------------------------------------------ Schnellspur */

/** Wie viele offene Matches ein Rechner der Schnellspur etwa bekommt, und wie viele Rechner es hoechstens sind (GitHub laesst 20 Auftraege zugleich laufen). */
const JE_STUECK = 200;
const STUECKE_MAX = Math.max(1, Number(process.env.SCHNELL_STUECKE) || 5);

/** Ein Teilstand: "<Saison>__<Fenster>__<Stueck>.json". */
const STUECK_ORDNER = path.join(process.cwd(), 'data', 'schnell-stueck');
const stueckName = (f, n) => `${f.season}__${f.windowId}__${n}.json`;

/** Dateien vom Release holen (Stand, Auswertung, Teams) - in einem Aufruf, das Verzeichnis jedes Releases wird nur einmal gelesen. */
function vomRelease(namen) {
  if (!namen.length) return;
  const r = spawnSync(process.execPath, [path.join('scripts', 'ablage-github-holen.mjs'), ...namen], { encoding: 'utf8', env: process.env });
  const zeile = String(r.stdout ?? '').trim().split('\n').pop();
  if (zeile) console.log(`  Release: ${zeile}`);
}

async function planSchreibenLauf(datei) {
  BASIS = await findeBasis();
  const antwort = await fetch(`${BASIS}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(120_000) });
  if (!antwort.ok) throw new Error(`Cup-Katalog HTTP ${antwort.status}`);
  const katalog = await antwort.json();
  const jetzt = Date.now();

  // Frisch (laeuft oder seit hoechstens SCHNELL_STUNDEN vorbei) oder angefragt - von der Seite (Vorrang) oder beim Anstossen genannt.
  const kandidaten = [];
  // Den PC-Bereich (frueher ausgelassene Spieltage) nur auslassen, solange der PC des Betreibers an ist.
  const pcAn = await pcLeserAktiv();
  for (const cup of katalog.cups ?? []) {
    const regel = replayRegel(cup, true);
    if (regel === 'nichts' && pcAn) continue;
    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      const endrundeHier = endrunden(liste);
      for (const w of liste) {
        if (w.status !== 'live' && w.status !== 'vorbei') continue;
        if (finals && !finals.has(w.windowId) && pcAn) continue;
        const m = /^(S\d+)_/i.exec(w.windowId);
        if (!m) continue;
        const live = w.status === 'live';
        const ende = live ? jetzt : (w.end ?? w.begin ?? 0);
        if (ende < jetzt - FRIST_TAGE * 864e5) continue;
        const angefragt = vorrang.has(w.windowId) || nurFenster.includes(w.windowId);
        if (!angefragt && ende < jetzt - SCHNELL_STUNDEN * 3600_000) continue;
        kandidaten.push({
          season: m[1].toUpperCase(), windowId: w.windowId, eventId: w.eventId, region: w.region, titel: cup.titel,
          datum: live ? (w.begin ?? jetzt) : ende, live, angefragt, istEndrunde: endrundeHier.has(w.windowId),
        });
      }
    }
  }
  console.log(`${kandidaten.length} Spieltage frisch oder angefragt${vorrang.size ? ` (Vorrang: ${[...vorrang].join(', ')})` : ''}.`);
  vomRelease(kandidaten.map((f) => `replays/${f.season}/${f.windowId}/_zustand.json`));

  // Je Spieltag die offenen Matches. Die Bestenliste wird nur gefragt, solange neue Matches kommen koennen: waehrend des Cups und bis eine halbe Stunde
  // nach seinem Ende (danach steht die Liste der Matches im Stand, "idsStand").
  const plan = [];
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < kandidaten.length) {
      const f = kandidaten[naechster++];
      const zustand = await liesZustand(f.season, f.windowId);
      const bekannt = Object.keys(zustand.matches ?? {});
      let ids = bekannt; let idsStand = null;
      const listeFertig = !f.live && !!zustand.idsAlle && (Date.parse(zustand.idsStand ?? '') || 0) > f.datum + 30 * 60_000;
      if (!listeFertig) {
        try {
          ids = [...new Set([...bekannt, ...await matchIds(f.eventId, f.windowId)])];
          idsStand = new Date().toISOString();
        } catch (e) {
          console.log(`  ${f.windowId}: Bestenliste - ${e.message}`);
          if (!ids.length) continue;
        }
      }
      const offen = ids.filter((id) => {
        const m = zustand.matches?.[id];
        if (!m) return true;
        if (m.stand === ZUSTAND.FERTIG) return false;
        return m.stand !== ZUSTAND.NICHT_VORHANDEN || nochmalFragen(m);
      });
      const neu = ids.filter((id) => !zustand.matches?.[id]);
      if (!offen.length && !neu.length && !idsStand) continue;
      // Die bisherigen Eintraege der offenen Matches (seit wann "nicht da", wie viele Versuche) - die Leser brauchen sie fuer nochmalFragen.
      const vorher = Object.fromEntries(offen.filter((id) => zustand.matches?.[id]).map((id) => [id, zustand.matches[id]]));
      plan.push({ ...f, offen, neu, vorher, idsStand, ...(idsStand ? { idsAlle: idsStand } : {}), alle: ids.length });
    }
  };
  await Promise.all(Array.from({ length: 4 }, arbeiter));

  // Angefragte zuerst, dann was gerade laeuft, dann das zuletzt Beendete.
  plan.sort((a, b) => Number(b.angefragt) - Number(a.angefragt) || Number(b.live) - Number(a.live) || b.datum - a.datum);
  const gesamt = plan.reduce((a, f) => a + f.offen.length, 0);
  const stuecke = gesamt ? Math.min(STUECKE_MAX, Math.max(1, Math.ceil(gesamt / JE_STUECK))) : 0;
  for (const f of plan) {
    console.log(`  ${f.windowId.padEnd(52)} ${String(f.offen.length).padStart(5)} offen von ${f.alle}${f.live ? ' (live)' : ''}${f.angefragt ? ' (angefragt)' : ''}`);
  }
  console.log(`${gesamt} offene Matches aus ${plan.length} Spieltagen - ${stuecke} Rechner.`);
  await fs.mkdir(path.dirname(datei), { recursive: true });
  await fs.writeFile(datei, JSON.stringify({ erstellt: new Date().toISOString(), stuecke, fenster: plan }), 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT,
      `stuecke=${JSON.stringify(Array.from({ length: stuecke }, (_, i) => i))}\narbeit=${plan.length ? 'ja' : 'nein'}\noffen=${gesamt}\n`);
  }
}

async function ausPlanLauf(datei) {
  const plan = JSON.parse(readFileSync(datei, 'utf8'));
  const von = Math.max(1, plan.stuecke || 1);
  const n = stueckNr % von;
  // Reihum ueber alle offenen Matches aller Spieltage: jeder Rechner bekommt von jedem Spieltag gleich viel.
  const fenster = []; const auftraege = [];
  let i = 0;
  for (const f of plan.fenster ?? []) {
    const meine = f.offen.filter(() => (i++ % von) === n);
    if (!meine.length) continue;
    const eintrag = { f, zustand: { matches: { ...(f.vorher ?? {}) } }, meine };
    fenster.push(eintrag);
    for (const id of meine) auftraege.push({ eintrag, id });
  }
  console.log(`Stueck ${n + 1} von ${von}: ${auftraege.length} Matches aus ${fenster.length} Spieltagen; gleichzeitig ${MAX_LADEN} Downloads, ${MAX_LESEN} Auswertungen, ${MAX_PRUEFEN} Abfragen.`);

  const zaehler = { fertig: 0, nicht_vorhanden: 0, fehler: 0, liegen: 0 };
  let naechster = 0; let getan = 0;
  const arbeiter = async () => {
    while (naechster < auftraege.length) {
      const { eintrag, id } = auftraege[naechster++];
      if (Date.now() >= schluss) { zaehler.liegen += 1; continue; }
      const r = await verarbeite(eintrag.f, id, eintrag.zustand);
      zaehler[r] = (zaehler[r] ?? 0) + 1;
      getan += 1;
      if (getan % 100 === 0) console.log(`    ${getan}/${auftraege.length} (${Math.round((Date.now() - beginn) / 1000)} s)`);
    }
  };
  const beginn = Date.now();
  await Promise.all(Array.from({ length: MAX_LADEN + MAX_LESEN + MAX_PRUEFEN }, arbeiter));

  // Nur die Matches, die dieser Rechner wirklich angefasst hat - was liegen blieb, behaelt seinen Eintrag im Stand vom Release.
  await fs.mkdir(STUECK_ORDNER, { recursive: true });
  for (const { f, zustand, meine } of fenster) {
    const teil = {};
    for (const id of meine) if (zustand.matches[id] && zustand.matches[id] !== f.vorher?.[id]) teil[id] = zustand.matches[id];
    await fs.writeFile(path.join(STUECK_ORDNER, stueckName(f, n)), JSON.stringify({ season: f.season, windowId: f.windowId, stueck: n, matches: teil }), 'utf8');
  }
  console.log(`Fertig nach ${Math.round((Date.now() - beginn) / 1000)} s: ${zaehler.fertig} ausgewertet, ${zaehler.nicht_vorhanden} ohne Replay (noch nicht oder nicht mehr), `
    + `${zaehler.fehler} fehlgeschlagen${zaehler.liegen ? `, ${zaehler.liegen} fuer den naechsten Lauf liegen gelassen` : ''}`);
}

async function planZusammenLauf(datei) {
  const plan = JSON.parse(readFileSync(datei, 'utf8'));
  const fenster = plan.fenster ?? [];
  // Der Stand vom Release, nicht der aus dem Plan: dazwischen kann ein Lauf geschrieben haben. Dazu die Auswertung (wird ergaenzt) und die Teams.
  vomRelease(fenster.flatMap((f) => [
    `replays/${f.season}/${f.windowId}/_zustand.json`, `replays/${f.season}/${f.windowId}/_aggregat.json`,
    `epic-spieltage/${f.season}/${f.windowId}.json`, `platzierungen/${f.season}/${f.windowId}.json`,
  ]));
  const teile = existsSync(STUECK_ORDNER) ? readdirSync(STUECK_ORDNER).filter((d) => d.endsWith('.json')) : [];
  const fertigeFenster = [];
  // Was danach noch offen ist (nie angefasst, liegen geblieben, fehlgeschlagen) - dann stoesst der Ablauf gleich den naechsten Lauf an.
  let rest = 0;
  for (const f of fenster) {
    const zustand = await liesZustand(f.season, f.windowId);
    zustand.matches ??= {};
    let angefasst = 0;
    for (const d of teile) {
      const m = /^(.+?)__(.+)__(\d+)\.json$/.exec(d);
      if (!m || m[1] !== f.season || m[2] !== f.windowId) continue;
      try {
        const t = JSON.parse(readFileSync(path.join(STUECK_ORDNER, d), 'utf8'));
        Object.assign(zustand.matches, t.matches ?? {});
        angefasst += Object.keys(t.matches ?? {}).length;
      } catch { /* kaputter Teilstand - dieses Stueck kommt im naechsten Lauf noch einmal */ }
    }
    // Matches, die noch kein Rechner angefasst hat, stehen trotzdem im Stand - so zeigt die Seite "x von y" mit dem richtigen y.
    for (const id of f.neu ?? []) zustand.matches[id] ??= { stand: ZUSTAND.OFFEN, zuletzt: new Date().toISOString() };
    if (!angefasst && !(f.neu ?? []).length && !f.idsStand) continue;
    Object.assign(zustand, {
      season: f.season, windowId: f.windowId, eventId: f.eventId, region: f.region, titel: f.titel, datum: f.datum,
      ...(f.idsStand ? { idsStand: f.idsStand } : {}),
      ...(f.idsAlle ? { idsAlle: f.idsAlle } : {}),
    });
    await schreibeZustand(f.season, f.windowId, zustand);
    fertigeFenster.push(f);
    const werte = Object.values(zustand.matches);
    // Ein Match, das dreimal scheiterte, haelt die Kette nicht am Laufen - es kommt mit dem naechsten Anstoss wieder dran.
    rest += werte.filter((x) => x.stand !== ZUSTAND.FERTIG && x.stand !== ZUSTAND.NICHT_VORHANDEN
      && !(x.stand === ZUSTAND.FEHLGESCHLAGEN && (x.versuche ?? 0) >= 3)).length;
    console.log(`  ${f.windowId.padEnd(52)} ${werte.filter((x) => x.stand === ZUSTAND.FERTIG).length}/${werte.length} ausgewertet (${angefasst} in diesem Lauf)`);
  }
  console.log(`Noch offen: ${rest}`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `rest=${rest}\n`);
  if (!fertigeFenster.length) { console.log('Nichts zusammenzufuehren.'); return; }

  const namen = fertigeFenster.map((f) => f.windowId);
  const schritt = (skript, args) => {
    const r = spawnSync(process.execPath, [path.join('scripts', skript), ...args], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) console.log(`  ${skript}: Code ${r.status}`);
  };
  schritt('replays-aggregieren.mjs', namen);
  schritt('replays-schlank.mjs', namen);
  // Hochladen: Stand und Auswertung je Spieltag, dazu die schlanke Fassung, die die Seite liest.
  schritt('ablage-github.mjs', fertigeFenster.flatMap((f) => [
    '--nur', `replays/${f.season}/${f.windowId}`, '--nur', `replays-schlank/${f.season}/${f.windowId}.json`,
  ]));
}

/*
 * Ist der PC des Betreibers als Leser an? (Betreiber, 30.10.2026: "mein PC kann das schon machen, solange alle Daten nachher trotzdem auf GitHub landen
 * ... wenn ich meinen PC ausschalte, soll alles genauso funktionieren.") Der PC (pc-leser.sh) legt alle fuenf Minuten ein Lebenszeichen an den Release
 * "signale"; ist es hoechstens zwanzig Minuten alt, liest er die frueher ausgelassenen Spieltage und GitHub laesst sie liegen. Fehlt es, liest GitHub
 * alles. Gelesen ohne API ueber den oeffentlichen Download-Link.
 */
let pcLeserMerker = null;
function pcLeserAktiv() {
  pcLeserMerker ??= (async () => {
    try {
      const repo = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
      const r = await fetch(`https://github.com/${repo}/releases/download/signale/pc-leser.json`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return false;
      const s = await r.json();
      return Date.now() - Date.parse(s.zeit) < 20 * 60_000;
    } catch { return false; }
  })();
  return pcLeserMerker;
}

async function main() {
  if (planSchreiben) { await planSchreibenLauf(planSchreiben); return; }
  if (ausPlan) { await ausPlanLauf(ausPlan); return; }
  if (planZusammen) { await planZusammenLauf(planZusammen); return; }
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
    // Mehrere Rechner (--teil n/4) auch hier reihum (28.10.2026): bis dahin legte nur einer neue Spieltage an, 27 Minuten je Lauf - zu wenig fuer 251 offene.
    : fenster.filter((f) => meinTeil(f.windowId)).sort(vorrangZuerst);
  if (vorrang.size) console.log(`Vorrang angefragt: ${[...vorrang].join(', ')}`);

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

  const angefasst = [];
  for (const f of ziel) {
    /*
     * Nacharbeit (mehrere Rechner): frische und angefragte Spieltage gehoeren der Schnellspur, und angelegt wird nur, was noch gar keinen Stand hat - die
     * Luecken bestehender holt --wiederholen nach. Bis zum 29.10.2026 fragte dieser Gang bei jedem Durchgang die Bestenliste jedes Spieltags der letzten 31
     * Tage ab, beim aeltesten beginnend, und wurde nach zwanzig Minuten abgebrochen: neue Spieltage erreichte er nie.
     */
    if (nacharbeit && gehoertSchnellspur(f.windowId, f.datum)) continue;
    await zustandNachholen(f);
    if (nacharbeit && Object.keys((await liesZustand(f.season, f.windowId)).matches ?? {}).length) continue;
    const zustand = await liesZustand(f.season, f.windowId);
    zustand.season = f.season; zustand.windowId = f.windowId;
    zustand.eventId = f.eventId; zustand.region = f.region;
    zustand.titel = f.titel; zustand.datum = f.datum;
    zustand.matches ??= {};

    let ids;
    try { ids = await matchIds(f.eventId, f.windowId); }
    catch (e) { console.warn(`  ${f.windowId}: Bestenliste - ${e.message}`); continue; }

    /*
     * Ein Aggregat aelterer Fassung, das schon alle Matches der Bestenliste
     * traegt, ist fertig - und laesst sich nicht ergaenzen. Dann gibt es
     * hier nichts mehr zu holen, auch wenn der Zustand daneben Luecken hat.
     */
    const agg = imAggregatSync(f);
    if (!neu && agg && agg.enthalten === 'alle' && agg.matches >= ids.length) {
      console.log(`
${f.season} ${f.region.padEnd(4)} ${f.titel}`);
      console.log(`  Aggregat traegt schon alle ${agg.matches} Matches - nichts zu tun.`);
      uebersprungen += ids.length;
      continue;
    }
    const enthalten = agg?.enthalten ?? null;
    let verloren = 0;
    const offen = ids.filter((id) => {
      const m = zustand.matches[id];
      if (neu) return true;
      if (!m) return true;
      /*
       * "Nicht vorhanden" ist erst nach einem Tag endgueltig.
       *
       * Epic legt das Replay ein paar Minuten nach dem Match ab - der
       * Live-Sammler fragt aber, sobald die Kennung in der Bestenliste
       * steht, also oft davor. Die Antwort war dann "nicht da", und das
       * blieb fuer immer stehen: ein Division-1-Open von heute zeigte 134
       * "NOT_AVAILABLE" neben 30 ausgewerteten, obwohl die Replays laengst
       * bei Epic lagen. Der Betreiber: "den Status akzeptiere ich nicht
       * mehr." Jetzt wird ein junges "nicht da" wieder gefragt; nach
       * einem Tag ohne Replay ist es wirklich keins.
       */
      if (m.stand === ZUSTAND.NICHT_VORHANDEN) return nochmalFragen(m);
      if (m.stand !== ZUSTAND.FERTIG) return true;
      // Fertig - und die Datei liegt hier: fertig.
      if (existsSync(matchPfad(f.season, f.windowId, id))) return false;
      // Fertig, aber die Datei liegt woanders: nur fertig, wenn sie im
      // Aggregat steckt. Sonst ist sie verloren - noch einmal holen.
      if (enthalten === 'alle' || (enthalten && enthalten.has(id))) return false;
      verloren += 1;
      return true;
    });
    if (verloren) {
      console.log(`  ${verloren} als ausgewertet gefuehrt, aber weder hier noch im Aggregat - werden neu geholt`);
    }
    angefasst.push(f.windowId);

    console.log(`\n${f.season} ${f.region.padEnd(4)} ${f.titel}`);
    console.log(`  ${ids.length} Matches, ${offen.length} offen`);
    uebersprungen += ids.length - offen.length;
    f.matchAnzahl = ids.length;

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
    // Welche Fenster dieser Lauf angefasst hat - der Live-Sammler rechnet
    // danach nur diese neu, statt jede Minute alle.
    angefasst,
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
