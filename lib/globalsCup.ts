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

/*
 * Dasselbe Turnier steht im Katalog zweimal: als "Fortnite Global
 * Championship" (Epics Event) und als "FNCS Global Championship" (von Hand
 * angelegt, eventId manuell_...). Der Betreiber (26.9.2026): "Fortnite Global
 * Championship und FNCS Global Championship ist das gleiche." Eine Karte der
 * Globals gilt deshalb fuer beide Eintraege und fuer jeden Tag.
 */
const GLOBALS_GLEICHE = ['manuell_S42_FNCSGlobalChampionship'];

/** Gehoert dieses Event zu den Globals 2026 - unter welchem Eintrag auch immer? */
export function istGlobalsEvent(eventId?: string | null, windowId?: string | null): boolean {
  return eventId === GLOBALS_EVENT || GLOBALS_GLEICHE.includes(eventId ?? '')
    || istGlobalsFenster(windowId ?? '');
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

/*
 * Ein Eintrag statt zwei.
 *
 * Im Katalog standen die Globals doppelt: "Fortnite Global Championship"
 * (Epics Event mit Day 1 und Day 2, Kennung s42_lan) und "FNCS Global
 * Championship" (von Hand angelegt, das Finale beider Tage zusammen). Der
 * Betreiber (29.9.2026): "es soll nur ein Cup dazu geben, nicht zwei ...
 * zwischen kumulativ, Tag 1 oder Tag 2 switchen." Hier werden beide zu einem
 * Eintrag mit drei Spieltagen: Kumulativ, Day 1, Day 2.
 */
export const GLOBALS_CUP_ID = 'fncs-2026-global-championship';
/** Die Kennung, unter der Epic denselben Cup fuehrt - alte Links darauf fuehren zum einen Eintrag. */
export const GLOBALS_CUP_ALIAS = 's42_lan';

interface GruppeFenster { begin: number; status: 'live' | 'kommt' | 'vorbei'; windowId: string; runde?: number; anzeige?: string }
interface Gruppe { id: string; titel: string; regionen: Record<string, GruppeFenster[]>;
  naechsterStart: number | null; letzterStart: number | null; live: boolean; vorbei: boolean }

export function globalsVereint<G extends Gruppe>(cups: G[]): G[] {
  const lan = cups.find((c) => c.id === GLOBALS_CUP_ALIAS);
  const fin = cups.find((c) => c.id === GLOBALS_CUP_ID);
  if (!lan || !fin) return cups;
  const kumuliert = Object.values(fin.regionen).flat().map((f) => ({ ...f, anzeige: 'Kumulativ' }));
  const tage = Object.values(lan.regionen).flat().sort((a, b) => a.begin - b.begin)
    .map((f, i) => ({ ...f, anzeige: `Day ${Number(/Day(\d+)/i.exec(f.windowId)?.[1] ?? i + 1)}` }));
  const fenster = [...kumuliert, ...tage].map((f, i) => ({ ...f, runde: i + 1 }));
  const starts = fenster.map((f) => f.begin);
  const kommend = fenster.filter((f) => f.status === 'kommt').map((f) => f.begin);
  const live = fenster.some((f) => f.status === 'live');
  const vereint: G = {
    // Bild, Untertitel und Art vom Eintrag des Finales, Epics Angaben dahinter.
    ...lan, ...fin,
    id: GLOBALS_CUP_ID, titel: 'FNCS Global Championship',
    // Epics Beschreibung haengt am LAN-Eintrag (s42_lan).
    beschreibung: (fin as { beschreibung?: string }).beschreibung
      ?? (lan as { beschreibung?: string }).beschreibung,
    regionen: { [GLOBALS_REGION]: fenster },
    naechsterStart: kommend.length ? Math.min(...kommend) : null,
    letzterStart: Math.max(...starts),
    live, vorbei: !live && !kommend.length,
  };
  const erst = Math.min(cups.indexOf(lan), cups.indexOf(fin));
  const raus = cups.filter((c) => c !== lan && c !== fin);
  raus.splice(erst, 0, vereint);
  return raus;
}
