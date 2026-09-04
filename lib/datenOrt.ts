import path from 'path';
import fs from 'fs';
import os from 'os';

/*
 * Wo die Daten liegen - und zwar dort, wo sich auch schreiben laesst.
 *
 * Bisher rechnete jede Stelle im Werkzeug mit `process.cwd()/data`. Im
 * Entwicklungsbetrieb stimmt das: der Projektordner gehoert dem Nutzer. In der
 * fertigen Anwendung liegt derselbe Pfad aber unter
 * `C:\Program Files\CompHub\resources\app\data`, und dort laesst Windows
 * niemanden schreiben. Die Folge war ein
 * "EPERM: operation not permitted, open ... cup-archiv.json" auf der
 * Eventseite - und dasselbe haette jede Karte, jede Prognose und jede
 * Kontoaenderung getroffen, sobald sie gespeichert werden sollte.
 *
 * Deshalb wird hier einmal geprueft, ob der mitgelieferte Ordner beschreibbar
 * ist. Ist er es, bleibt alles wie es war - im Entwicklungsbetrieb aendert
 * sich also nichts, und vorhandene Karten bleiben, wo sie sind. Ist er es
 * nicht, wandert der ganze Ordner einmalig in das Nutzerverzeichnis und wird
 * von dort gelesen und geschrieben.
 */

/** Der Ordner, wie er mit dem Programm ausgeliefert wird. */
const PAKET = path.join(process.cwd(), 'data');

/** Wohin ausgewichen wird, wenn das Programm in einem geschuetzten Ordner liegt. */
const AUSWEICHE = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'CompHub', 'data',
);

/**
 * Wird beim Umziehen ausgelassen.
 *
 * Replays sind hunderte Megabyte gross, und Epic loescht sie ohnehin nach gut
 * einem Monat - sie noch einmal zu kopieren kostet nur Zeit und Platz. Wer sie
 * braucht, holt sie neu.
 */
const NICHT_MITNEHMEN = new Set(['replays']);

function beschreibbar(ordner: string): boolean {
  try {
    fs.mkdirSync(ordner, { recursive: true });
    const probe = path.join(ordner, `.schreibprobe-${process.pid}`);
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** Einmaliges Umziehen. Vorhandenes im Zielordner wird nie ueberschrieben. */
function ziehUm(von: string, nach: string) {
  let eintraege: fs.Dirent[];
  try {
    eintraege = fs.readdirSync(von, { withFileTypes: true });
  } catch {
    return;
  }
  fs.mkdirSync(nach, { recursive: true });
  for (const e of eintraege) {
    if (NICHT_MITNEHMEN.has(e.name)) continue;
    const a = path.join(von, e.name);
    const b = path.join(nach, e.name);
    try {
      if (e.isDirectory()) { ziehUm(a, b); continue; }
      // Was der Nutzer dort schon hat, ist neuer als die Mitlieferung.
      if (fs.existsSync(b)) continue;
      fs.copyFileSync(a, b);
    } catch { /* eine einzelne Datei darf den Start nicht aufhalten */ }
  }
}

function bestimmeOrt(): string {
  /*
   * Ein ausdruecklich gesetzter Ort geht vor - damit laesst sich der
   * Datenordner auf eine andere Platte legen, ohne das Programm anzufassen.
   * Sonst der mitgelieferte, solange sich dort schreiben laesst; erst wenn
   * nicht, wird ins Nutzerverzeichnis ausgewichen.
   */
  const ziel = process.env.COMPHUB_DATEN
    || (beschreibbar(PAKET) ? PAKET : AUSWEICHE);
  if (ziel === PAKET) return ziel;

  /*
   * Beim ersten Start den mitgelieferten Stand hinueberholen.
   *
   * Ohne das staende die Anwendung vor einem leeren Ordner: kein Turnierarchiv,
   * keine Spielernamen, keine Karten. Die Marke sorgt dafuer, dass das genau
   * einmal geschieht - danach gehoert der Ordner dem Nutzer, und was er dort
   * geaendert hat, wird nie ueberschrieben.
   */
  const marke = path.join(ziel, '.umgezogen');
  try {
    fs.mkdirSync(ziel, { recursive: true });
    if (!fs.existsSync(marke)) {
      ziehUm(PAKET, ziel);
      fs.writeFileSync(marke, new Date().toISOString());
    }
  } catch { /* dann bleibt der Ordner leer und fuellt sich beim Betrieb */ }
  return ziel;
}

/**
 * Der Datenordner dieser Installation.
 *
 * Einmal bestimmt und danach unveraendert - eine Pruefung je Anfrage waere
 * ein Dateizugriff fuer eine Antwort, die sich nicht mehr aendert.
 */
export const DATEN_ORT: string = bestimmeOrt();
