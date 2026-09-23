/*
 * Die FNCS Global Championship 2026 - der eine Cup, um den es hier geht.
 *
 * Der Betreiber zu den Globals-Seiten: "bei Overlay gibt es keine Funktion,
 * verschiedene Cups zu benutzen, sondern nur die Globals Cups, also am 26.9
 * + 27.9." Deshalb steht der Cup hier fest und nicht in einer Auswahl.
 *
 * Fest steht allerdings nur das Turnier selbst (Epics Kennung
 * "MannekenPis" - Epic benennt seine Turniere nach Wahrzeichen der
 * Austragungsorte, und die Globals 2026 laufen in Antwerpen). Welche
 * Spieltage es traegt und wann sie beginnen, holt die Seite aus dem
 * Cup-Katalog; die beiden Tage hier sind nur der Rueckfall, falls der
 * Katalog gerade nicht antwortet. So steht nie eine geratene Uhrzeit da,
 * und ein dritter Tag - Epic schiebt gelegentlich einen nach - kaeme von
 * selbst dazu.
 */

/** Epics Kennung des Turniers. */
export const GLOBALS_EVENT = 'epicgames_MannekenPis_Official';

/** Die Globals sind ein LAN: eine Region, alle Teams in einem Feld. */
export const GLOBALS_REGION = 'GLOBAL';

export const GLOBALS_TITEL = 'FNCS Global Championship 2026';

export interface GlobalsTag {
  windowId: string;
  /** "Day 1" - kurz, wie es im Overlay steht. */
  titel: string;
  /** Beginn in Millisekunden, aus dem Katalog. */
  begin: number;
}

/**
 * Die beiden Spieltage, wie sie im Katalog stehen - als Rueckfall.
 *
 * Nachgemessen am 23.9.2026: MannekenPis_Day1 beginnt am 25.9. um 22 Uhr
 * UTC, also am 26.9. hiesiger Zeit, Day 2 einen Tag spaeter.
 */
export const GLOBALS_TAGE: GlobalsTag[] = [
  { windowId: 'MannekenPis_Day1', titel: 'Day 1', begin: 1790373600000 },
  { windowId: 'MannekenPis_Day2', titel: 'Day 2', begin: 1790460000000 },
];

/** Gehoert dieser Spieltag zu den Globals? */
export function istGlobalsFenster(windowId: string): boolean {
  return /^MannekenPis_/i.test(windowId);
}

/**
 * "Day 1" aus einer Fensterkennung.
 *
 * Epic haengt die Nummer hinten an; steht dort etwas anderes, bleibt die
 * Kennung stehen, statt eine Nummer zu erfinden.
 */
export function tagTitel(windowId: string): string {
  const m = windowId.match(/Day\s*(\d+)/i);
  return m ? `Day ${m[1]}` : windowId;
}
