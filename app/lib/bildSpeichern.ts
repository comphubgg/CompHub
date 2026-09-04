/*
 * Eine Leinwand als Bild herunterladen.
 *
 * Warum das an einer Stelle steht und nicht drei Mal einzeln:
 *
 * Die Screenshot-Knoepfe auf Karten, Prognosen und Beitraegen machten es
 * bisher so:
 *
 *     const a = document.createElement('a');
 *     a.href = c.toDataURL('image/png');
 *     a.click();
 *
 * Zwei Dinge daran gehen schief, und beide fallen erst bei grossen Bildern
 * auf - genau da, wo die Karten liegen:
 *
 * 1. `toDataURL` macht aus einem 1200er Bild eine Zeichenkette von mehreren
 *    Megabyte und haengt sie in ein Attribut. Im Fensterprogramm passiert
 *    dabei regelmaessig gar nichts: kein Bild, keine Meldung.
 * 2. Der Link haengt nicht im Dokument. Ein loser Link wird je nach Lage
 *    ignoriert. Der JSON-Export der Tierlist macht es deshalb schon lange
 *    richtig - er haengt ihn ein, klickt und raeumt hinterher auf.
 *
 * Hier wird beides zusammengefuehrt: ein Blob statt einer Zeichenkette, ein
 * eingehaengter Link, und ein Fehler, der gemeldet wird statt zu verschwinden.
 * Ohne den letzten Punkt blieb die Anzeige fuer immer auf "wird gezeichnet",
 * und es war von aussen nicht zu unterscheiden, ob das Zeichnen haengt oder
 * das Speichern.
 */

/** Aus einer Leinwand ein Blob machen - `toBlob` ohne Rueckruf-Verrenkung. */
function alsBlob(leinwand: HTMLCanvasElement): Promise<Blob> {
  return new Promise((fertig, schief) => {
    try {
      leinwand.toBlob((blob) => {
        if (blob) fertig(blob);
        // Ein leeres Ergebnis heisst fast immer: die Leinwand ist
        // "verunreinigt", weil ein Bild von einem fremden Server darauf
        // gezeichnet wurde. Dann darf der Browser sie nicht auslesen.
        else schief(new Error('Das Bild ließ sich nicht auslesen.'));
      }, 'image/png');
    } catch (e) {
      schief(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Die Leinwand unter diesem Namen speichern.
 *
 * Wirft, wenn es nicht geht - der Aufrufer soll den Grund anzeigen koennen,
 * statt still stehen zu bleiben.
 */
export async function speichereLeinwand(
  leinwand: HTMLCanvasElement,
  dateiname: string,
): Promise<void> {
  const blob = await alsBlob(leinwand);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname.endsWith('.png') ? dateiname : `${dateiname}.png`;
  // Eingehaengt, weil ein loser Link nicht ueberall klickbar ist.
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Erst nach dem Klick freigeben, sonst ist die Adresse schon wieder weg,
    // wenn der Browser sie holen will.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * Eine fertige Adresse speichern - fuer Bilder, die schon als Blob vorliegen.
 *
 * Die Adresse wird hier nicht freigegeben: sie gehoert dem Aufrufer, der sie
 * meist noch zum Anzeigen braucht.
 */
export function speichereAdresse(url: string, dateiname: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname.endsWith('.png') ? dateiname : `${dateiname}.png`;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
  }
}

/** Aus einem Titel einen brauchbaren Dateinamen machen. */
export function dateinameAus(titel: string, ersatz = 'bild'): string {
  const rein = titel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${rein || ersatz}.png`;
}
