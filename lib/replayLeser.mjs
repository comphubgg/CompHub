// Den C#-Leser aufrufen - ohne dass ein Fenster aufgeht.
//
// -------------------------------------------------------------- Warum das
//
// fortnite-replay-analysis bringt einen eigenstaendigen Leser als
// Binaerdatei mit und ruft ihn ueber execFile auf - allerdings ohne
// "windowsHide". Unter Windows heisst das: bei jedem einzelnen Replay
// springt ein Konsolenfenster auf und wieder zu. Bei vierundsechzig
// Replays hintereinander ist der Rechner damit unbenutzbar, und genau das
// ist dem Betreiber passiert, waehrend er nebenher arbeiten wollte:
// "es oeffnet immer wieder Neue und schliesst immer wieder Alte."
//
// Deshalb wird die Binaerdatei hier direkt aufgerufen. Es ist derselbe
// Leser, dasselbe Ergebnis - nur ohne Fenster und ohne dass die
// Pfadsuche des Wrappers ueber INIT_CWD raten muss, wo das Projekt liegt.
//
// Zusaetzlich gibt es eine Zeitgrenze. Bleibt der Leser einmal haengen,
// soll er nicht als vergessener Prozess weiterlaufen; im Fehlerfall
// standen fuenfundzwanzig davon gleichzeitig auf dem Rechner.

import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** Wo die Binaerdatei des Lesers liegt - je nach Betriebssystem. */
function leserPfad() {
  const wurzel = path.dirname(
    require.resolve('fortnite-replay-analysis/package.json'));
  const basis = path.join(wurzel, 'CSproj', 'bin', 'Release', 'net10.0');
  if (os.platform() === 'win32') {
    return path.join(basis, 'win-x64', 'publish', 'FortniteReplayAnalysis.exe');
  }
  if (os.platform() === 'linux') {
    return path.join(basis, 'linux-x64', 'publish', 'FortniteReplayAnalysis');
  }
  throw new Error(`Kein Leser fuer ${os.platform()}`);
}

/**
 * Ein Replay auslesen.
 *
 * Zurueck kommt, was die Binaerdatei ausgibt - flach, mit den Schluesseln
 * Header, Info, GameData, PlayerData, TeamData, KillFeed, MapData,
 * Eliminations, Stats und TeamStats.
 *
 * Der Javascript-Wrapper des Pakets verpackt dasselbe noch einmal unter
 * "rawReplayData" und rechnet Platzierungen aus dem KillFeed nach. Das
 * wird hier nicht gebraucht: die Platzierung steht bereits an jedem
 * Spieler, und die Gruppierung zu Teams ebenfalls (TeamIndex).
 *
 * @param datei  Pfad zu einer .replay-Datei.
 * @param frist  Zeitgrenze in Millisekunden.
 */
export function leseReplay(datei, frist = 120_000) {
  return new Promise((fertig, daneben) => {
    execFile(
      leserPfad(),
      [datei],
      {
        // Zweihundert Megabyte: die Ausgabe eines vollen Matches ist gross,
        // und mit der Vorgabe von einem Megabyte bricht der Aufruf ab.
        maxBuffer: 200 * 1024 * 1024,
        // Der Grund fuer diese Datei.
        windowsHide: true,
        timeout: frist,
        killSignal: 'SIGKILL',
      },
      (fehler, ausgabe) => {
        if (fehler) { daneben(new Error(`Leser: ${fehler.message}`)); return; }
        try {
          fertig(JSON.parse(ausgabe));
        } catch (e) {
          daneben(new Error(`Antwort des Lesers unlesbar: ${e.message}`));
        }
      },
    );
  });
}
