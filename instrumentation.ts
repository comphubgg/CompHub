// Was beim Hochfahren des Servers einmal angestossen wird.
//
// Bisher wurden die Power Rankings nur erneuert, wenn jemand die Seite
// aufrief. Das genuegt nicht: ruft an einem Tag niemand die Rangliste auf,
// bleibt der Stand von vorgestern stehen, und der Naechste sieht alte Zahlen,
// ohne es zu merken. Deshalb laeuft die Erneuerung jetzt von selbst - einmal
// taeglich um ein Uhr nachts, wo niemand zusieht und Epic seine Fortschreibung
// laengst geschrieben hat.
//
// Der Aufruf beim Start faengt den Fall ab, dass der Rechner um ein Uhr aus
// war: ist der Stand aelter als der letzte Termin, wird sofort geholt.
//
// Zum selben Termin werden die Einzelwerte der Szene-Quelle nachgeholt -
// dieselbe Ueberlegung, andere Quelle. Danach zwei kleinere Laeufe: die
// Spieltage, zu denen die Quelle noch nichts hat (dort steht wenigstens Platz
// und Mitspieler), und das echte Turnierdatum zu allem Neuen.
//
// Die Turnier-Replays laufen aus der Reihe: stuendlich statt taeglich. Epic
// haelt sie nur einunddreissig Tage vor, und die Cups enden ueber alle
// Zeitzonen verteilt - ein fester Termin traefe immer nur eine Region frisch.
//
// Aus demselben Grund wird stuendlich nach neuen Turnieren gesehen. Ein
// Finale, das am Abend zu Ende ging, stand bis dahin am naechsten Morgen
// noch nicht in der Statistik; jetzt ist es binnen einer Stunde da - erst
// mit Platz und Punkten von Epic, spaeter mit den Einzelwerten der
// Szene-Quelle, sobald die sie veroeffentlicht.

export async function register() {
  // Nur im Node-Prozess, nicht in der Edge-Laufzeit: dort gibt es weder
  // Dateien noch die Moeglichkeit, ein Skript zu starten.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { LISTE, erneuereImHintergrund, istAlt, lies, TERMIN_STUNDE } =
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
    ziel.setHours(TERMIN_STUNDE, 0, 0, 0);
    if (ziel.getTime() <= Date.now()) ziel.setDate(ziel.getDate() + 1);
    const warten = ziel.getTime() - Date.now();

    setTimeout(() => {
      erneuereImHintergrund(LISTE);
      void szeneStatsHolen();
      void replaysHolen();
      naechsterTermin();
    }, warten).unref?.();

    console.log('Power Rankings: naechste Erneuerung '
      + ziel.toLocaleString('de-DE'));
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
