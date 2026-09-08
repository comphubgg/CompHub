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
  // Dateien noch die Moeglichkeit, ein Skript zu starten. Der Node-Teil liegt
  // deshalb in einer eigenen Datei und wird erst hier geholt.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /*
   * Und nicht dort, wo der Vorgang nach der Antwort wieder einschlaeft.
   *
   * Alles hier drin sind Zeitgeber: um ein Uhr die Rangliste, stuendlich die
   * Replays, alle fuenf Minuten der laufende Cup. Das setzt einen Server
   * voraus, der durchlaeuft. Bei Vercel startet je Anfrage eine Umgebung und
   * endet mit ihr - ein Zeitgeber auf eine Stunde liefe dort nie ab, waehrend
   * jeder Kaltstart erneut versuchte, Kindprozesse zu starten, die es dort
   * gar nicht geben kann. Das kostet bei jeder ersten Anfrage Zeit und
   * schreibt Fehler ins Protokoll, ohne je etwas auszurichten.
   *
   * Wo die Seite so laeuft, erledigt die stuendliche GitHub-Aktion dieselbe
   * Arbeit - siehe .github/workflows/daten-erneuern.yml. Auf einem eigenen
   * Rechner bleibt alles wie bisher.
   *
   * COMPHUB_KEIN_HINTERGRUND schaltet es auch von Hand ab, etwa wenn zwei
   * Fassungen nebeneinander laufen und nur eine die Nachtlaeufe machen soll.
   */
  if (process.env.VERCEL || process.env.COMPHUB_KEIN_HINTERGRUND) {
    console.log(
      'Hintergrundlaeufe aus - hier laeuft kein durchgehender Vorgang. '
      + 'Die Daten erneuert die stuendliche GitHub-Aktion.');
    return;
  }

  const { starteHintergrund } = await import('./instrumentation.node');
  await starteHintergrund();
}
