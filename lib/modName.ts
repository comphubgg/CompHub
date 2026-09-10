/**
 * Das Namensschild eines Managers - pruefen und zurechtstutzen.
 *
 * Steht in einer eigenen Datei, weil eine Next-Route nur ihre Handler
 * ausfuehren darf: jede zusaetzliche Ausfuhr daraus laesst den Bau scheitern.
 * Gebraucht wird es an zwei Stellen - beim Anmelden und ueberall dort, wo
 * eine Aenderung jemandem zugeschrieben wird.
 *
 * Erlaubt sind Buchstaben aus jeder Schrift, Ziffern, Punkt, Bindestrich,
 * Unterstrich und Leerzeichen, zwei bis vierundzwanzig Zeichen. Alles andere
 * kommt als leerer Text zurueck - und leer heisst: kein Schild.
 */
export function modName(roh: string | undefined | null): string {
  const s = String(roh ?? '').trim().slice(0, 24);
  return /^[\p{L}\p{N}_.\- ]{2,24}$/u.test(s) ? s : '';
}
