/*
 * Alles, was beim Hochfahren im Node-Prozess passiert.
 *
 * Warum eine eigene Datei: instrumentation.ts wird von Next auch fuer die
 * Edge-Laufzeit uebersetzt, und dort gibt es weder Dateien noch die
 * Moeglichkeit, ein Skript zu starten. Die Laufzeitpruefung darin genuegte
 * dem Uebersetzer nicht - er sah `child_process` und `process.cwd()` im
 * Quelltext und schrieb bei jedem Start "Ecmascript file had an error" ins
 * Protokoll. Gelaufen ist es trotzdem, aber die Warnung verdeckte echte
 * Fehler.
 *
 * Jetzt liegt der Node-Teil hier, und instrumentation.ts holt ihn erst,
 * nachdem feststeht, dass es der Node-Prozess ist.
 */
export async function starteHintergrund() {
  const { LISTE, erneuereImHintergrund, istAlt, lies, TERMIN_STUNDEN } =
    await import('./lib/powerRankings');

  /** Beim Start nachsehen, ob der letzte Termin verpasst wurde. */
  const nachsehen = async () => {
    try {
      const stand = await lies(LISTE);
      if (istAlt(stand)) {
        console.log('Power Rankings: Stand veraltet, wird geholt');
        erneuereImHintergrund(LISTE);
      }
    } catch (e) {
      console.warn('Power Rankings: Pruefung fehlgeschlagen:', (e as Error).message);
    }
  };

  /**
   * Die Einzelwerte der Szene-Quelle nachholen.
   *
   * Dort kommen laufend Spieltage dazu, und ihr Verzeichnis sagt, welche.
   * Der Lauf ueberspringt alles, was schon im eigenen Archiv liegt, holt also
   * nur das Neue - und laeuft losgeloest, damit er den Server nicht aufhaelt.
   */
  const starte = async (name: string, argumente: string[] = []) => {
    try {
      const { spawn } = await import('child_process');
      const pfad = await import('path');
      const skript = pfad.join(process.cwd(), 'scripts', name);
      const lauf = spawn(process.execPath, [skript, ...argumente], {
        cwd: process.cwd(), detached: true, stdio: 'ignore',
      });
      lauf.unref();
    } catch (e) {
      console.warn(`${name} nicht startbar:`, (e as Error).message);
    }
  };

  /**
   * Der naechtliche Nachlauf, in dieser Reihenfolge.
   *
   * 1. Die Einzelwerte der Szene-Quelle - Schaden, Material, Bauteile. Das
   *    ist die einzige kostenlose Quelle dafuer; Epic gibt sie nicht heraus.
   * 2. Spieltage, zu denen die Quelle nichts hat. Erst danach, damit ein
   *    Cup, den sie ueber Nacht veroeffentlicht hat, nicht zusaetzlich als
   *    magere Epic-Zeile erscheint.
   * 3. Die echten Turnierdaten zu allem, was neu dazugekommen ist.
   *
   * Nacheinander statt gleichzeitig: Epic drosselt. Beim ersten grossen Lauf
   * kamen 84 von 894 Abrufen als HTTP 500 zurueck, weil zwei Skripte
   * parallel abfragten.
   */
  const szeneStatsHolen = async () => {
    await starte('szene-stats-holen.mjs');
    setTimeout(() => { void starte('epic-spieltage-holen.mjs'); }, 15 * 60_000)
      .unref?.();
    setTimeout(() => { void starte('spieltag-datum-nachtragen.mjs'); },
      30 * 60_000).unref?.();
  };

  /**
   * Der Stundenlauf fuer die Turniere.
   *
   * Anlass: ein Finale, das am Abend zu Ende ging, stand am naechsten
   * Morgen noch nicht in der Statistik. Der Grund war der Takt - einmal
   * taeglich um ein Uhr - und die Quelle: eucompetitive veroeffentlicht
   * ihre Einzelwerte erst ein bis zwei Tage spaeter.
   *
   * Cups enden ueber alle Zeitzonen verteilt: die europaeischen gegen
   * Mitternacht, die amerikanischen in der Nacht, Asien und Ozeanien am
   * Vormittag. Ein fester Termin trifft immer nur eine Region frisch -
   * dieselbe Erkenntnis wie bei den Replays.
   *
   * Deshalb stuendlich, und in dieser Reihenfolge:
   *
   *   1. Die Szene-Quelle, aber nur die laufende Saison ("--neueste"):
   *      sieben Verzeichnisabfragen, und geladen wird nur, was fehlt.
   *   2. Fuenf Minuten spaeter Epics eigene Spieltage. Das ist der Lauf,
   *      der den frisch beendeten Cup in die Statistik bringt - Epic
   *      fuehrt das Fenster sofort, mit Platz, Punkten und Matches.
   *   3. Zehn Minuten spaeter das echte Turnierdatum dazu.
   *
   * Was schon da ist, wird uebersprungen; ein Lauf ohne neue Cups kostet
   * eine Handvoll Abfragen und sonst nichts.
   */
  const turniereNachfassen = async () => {
    await starte('szene-stats-holen.mjs', ['--neueste']);
    setTimeout(() => { void starte('epic-spieltage-holen.mjs'); }, 5 * 60_000)
      .unref?.();
    setTimeout(() => { void starte('spieltag-datum-nachtragen.mjs'); },
      10 * 60_000).unref?.();
  };

  /**
   * Die Turnier-Replays einsammeln.
   *
   * Der einzige Lauf hier, bei dem Saeumnis unwiederbringlich ist: Epic haelt
   * ein Replay einunddreissig Tage vor, danach ist es fort - tagesgenau
   * nachgemessen. Alles andere liesse sich spaeter nachholen, das hier nicht.
   *
   * Deshalb stuendlich. Zuerst standen hier zwei feste Termine, ein Uhr und
   * dreizehn Uhr - das ging an der Wirklichkeit vorbei: die europaeischen
   * Opens und Finals enden gegen zweiundzwanzig Uhr und um Mitternacht, die
   * amerikanischen mitten in der Nacht, die asiatischen am Vormittag. Jeder
   * feste Termin trifft eine Region frisch und laesst die anderen warten.
   *
   * Stuendlich sieht dagegen nur nach, was in den letzten achtundvierzig
   * Stunden zu Ende ging. Was schon ausgewertet ist, wird uebersprungen -
   * ein Lauf ohne neue Cups kostet ein paar Abfragen und sonst nichts.
   *
   * Der volle Durchgang ueber alle einunddreissig Tage bleibt einmal
   * taeglich; er holt nach, was ein stuendlicher Lauf verpasst hat, etwa
   * weil der Rechner aus war.
   *
   * Das Aggregieren haengt hinten dran und rechnet nur, was neu ist.
   */
  const replaysHolen = async (nurFrisch = false) => {
    await starte('replays-holen.mjs', nurFrisch ? ['--frisch', '48'] : []);

    /*
     * Danach die Fehlversuche nachholen.
     *
     * Im Archiv lagen 1892 Matches eines einzigen Spieltags als FAILED, alle
     * mit demselben nackten "fetch failed" - und die Replays dazu gab es bei
     * Epic noch. Der volle Durchgang haette sie mitgenommen, aber erst
     * nachdem er sich durch zwanzig andere Fenster gearbeitet hat, und
     * jeder Abbruch warf ihn wieder an den Anfang.
     *
     * Dieser Durchgang tut nur das eine und braucht dafuer weder Katalog
     * noch Bestenliste. Er ist gedeckelt, damit er den Takt nicht sprengt:
     * ein paar hundert je Stunde arbeiten einen Rueckstand von zweitausend
     * in einer Nacht ab, ohne dass je ein Lauf stundenlang blockiert.
     */
    await starte('replays-holen.mjs',
      ['--wiederholen', '--hoechstens', nurFrisch ? '300' : '1500']);

    setTimeout(() => { void starte('replays-aggregieren.mjs'); },
      (nurFrisch ? 8 : 45) * 60_000).unref?.();
  };

  /**
   * Die Auswertung waehrend eines laufenden Cups.
   *
   * Der lang gehegte Wunsch des Betreibers: die Werte sollen schon
   * mitlaufen, nicht erst am naechsten Tag dastehen.
   *
   * Dass es geht, war lange nicht klar - er vermutete, man muesse sich die
   * Match-Kennungen von Fortnite Tracker holen. Muss man nicht: Epics
   * eigene Bestenliste fuehrt zu jedem Eintrag eine "sessionHistory" mit
   * den Kennungen aller bereits gespielten Runden, und die Replays dazu
   * liegen binnen Minuten bereit. Nachgemessen an einem Fenster, das
   * gerade lief: 42 Matches, 41 davon sofort auswertbar.
   *
   * Alle fuenf Minuten. Laeuft nichts, sieht der Lauf einmal in den
   * Katalog und ist nach ein paar Sekunden wieder fertig; laeuft etwas,
   * holt er genau die Matches, die seit dem letzten Mal dazugekommen sind
   * - der Zustand wird je Match gefuehrt, nicht je Spieltag.
   */
  const liveAuswerten = async () => {
    await starte('replays-holen.mjs', ['--live']);
    // Anderthalb Minuten spaeter rechnen. Das Herunterladen und Lesen der
    // neuen Matches braucht ungefaehr so lange; wer frueher rechnet,
    // rechnet dasselbe gleich noch einmal.
    setTimeout(() => { void starte('replays-aggregieren.mjs'); }, 90_000)
      .unref?.();
  };

  /**
   * Den naechsten Termin legen.
   *
   * Gerechnet wird jedes Mal neu bis zum naechsten Ein-Uhr-Zeitpunkt, statt
   * einen Vierundzwanzig-Stunden-Takt zu setzen. Sonst verschoebe sich der
   * Termin mit jeder Sommerzeitumstellung und mit jeder Ungenauigkeit des
   * Zeitgebers immer weiter in den Tag hinein.
   */
  const naechsterTermin = () => {
    const ziel = new Date();
    ziel.setHours(TERMIN_STUNDEN[0], 0, 0, 0);
    if (ziel.getTime() <= Date.now()) ziel.setDate(ziel.getDate() + 1);
    const warten = ziel.getTime() - Date.now();

    setTimeout(() => {
      void szeneStatsHolen();
      void replaysHolen();
      naechsterTermin();
    }, warten).unref?.();

    console.log('Naechster Nachtlauf: ' + ziel.toLocaleString('de-DE'));
  };

  /*
   * Die Rangliste dreimal taeglich.
   *
   * Nicht wegen der Wertung - die schreibt Epic in Abstaenden fort, dafuer
   * genuegte einmal. Es geht um die Namen: Profis benennen sich im Spiel um,
   * wann sie wollen, und in der Ranglistendatei steht zu keinem Eintrag eine
   * Konto-Id, ueber die sich ein Name nachtraeglich richtigstellen liesse.
   * Einen billigeren Weg als den ganzen Abruf gibt es deshalb nicht.
   *
   * Der Betreiber wollte das ausdruecklich im Hintergrund, ohne dass die
   * Seite anders aussieht - die Zeile "Stand von vor drei Tagen" bleibt, sie
   * wird nur oefter jung.
   */
  const naechsteRangliste = () => {
    const jetzt = Date.now();
    const kommende = TERMIN_STUNDEN.map((h) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      if (d.getTime() <= jetzt) d.setDate(d.getDate() + 1);
      return d.getTime();
    });
    const ziel = Math.min(...kommende);

    setTimeout(() => {
      erneuereImHintergrund(LISTE);
      naechsteRangliste();
    }, ziel - jetzt).unref?.();

    console.log('Power Rankings: naechste Erneuerung '
      + new Date(ziel).toLocaleString('de-DE'));
  };

  /**
   * Der Stundentakt fuer die Replays.
   *
   * Zur vollen Stunde statt alle sechzig Minuten ab Start: so liegen die
   * Laeufe an nachvollziehbaren Zeitpunkten, und ein Neustart des Servers
   * verschiebt den Takt nicht.
   */
  /** Der Fuenf-Minuten-Takt fuer laufende Cups. */
  const LIVE_TAKT = 5 * 60_000;

  const naechsterReplayTermin = () => {
    const ziel = new Date();
    ziel.setMinutes(0, 0, 0);
    ziel.setHours(ziel.getHours() + 1);

    setTimeout(() => {
      void replaysHolen(true);
      // Zur selben Stunde, aber zwanzig Minuten versetzt: die Replays
      // fragen Epic ebenfalls ab, und gleichzeitig hat Epic schon einmal
      // mit 500 geantwortet.
      setTimeout(() => { void turniereNachfassen(); }, 20 * 60_000).unref?.();
      naechsterReplayTermin();
    }, ziel.getTime() - Date.now()).unref?.();
  };

  await nachsehen();
  naechsterTermin();
  naechsteRangliste();
  naechsterReplayTermin();

  /*
   * Waehrend eines Cups alle fuenf Minuten nachsehen.
   *
   * Ein fester Takt statt eines Termins: Cups laufen ueber alle Zeitzonen
   * verteilt, und waehrend einer laeuft, zaehlt jede Runde.
   */
  const liveUhr = setInterval(() => { void liveAuswerten(); }, LIVE_TAKT);
  liveUhr.unref?.();

  /**
   * Beim Hochfahren einmal nachsehen, ob Replays offen sind.
   *
   * Anders als bei den uebrigen Quellen ist Saeumnis hier endgueltig: was
   * laenger als einunddreissig Tage her ist, gibt Epic nicht mehr heraus.
   * Stand der Rechner ueber Nacht aus, waere das Warten bis zum naechsten
   * Termin ein vermeidbares Risiko. Der Lauf ueberspringt alles, was schon
   * ausgewertet ist, und kostet dann nur ein paar Abfragen.
   *
   * Zwei Minuten Vorlauf, damit der Server erst einmal steht - das Skript
   * fragt seine eigene Schnittstelle nach dem Cup-Katalog.
   */
  setTimeout(() => { void replaysHolen(); }, 2 * 60_000).unref?.();

  /*
   * Und einmal gleich nach dem Start nach neuen Turnieren sehen.
   *
   * Wer das Fensterprogramm oeffnet, weil gerade ein Cup gelaufen ist, soll
   * ihn dort finden - und nicht bis zur naechsten vollen Stunde warten.
   * Drei Minuten Vorlauf, damit der Server steht: epic-spieltage-holen
   * fragt die eigene Schnittstelle nach dem Cup-Katalog.
   */
  setTimeout(() => { void turniereNachfassen(); }, 3 * 60_000).unref?.();
}
