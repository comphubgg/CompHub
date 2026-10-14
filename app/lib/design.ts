/*
 * Das neue Design (14.10.2026) - was wo gilt.
 *
 * Zwei unabhaengige Angaben am <html>-Element:
 *   data-design  "neu" (Schrift, Aufbau, Kopfzeile des neuen Auftritts) oder "alt" (die bisherige Optik - nur noch die Streams-Seite, die der
 *                Betreiber ausdruecklich "genau so, wie sie ist" behalten will, dazu die Overlays und POV-Seiten, die auf Streams laufen).
 *   data-modus   "hell" oder "dunkel" - die Farbpalette. Im alten Design immer dunkel.
 *
 * Die Wahl des Besuchers steht im Cookie comphub_modus; Voreinstellung ist hell.
 */

export type Design = 'neu' | 'alt';
export type Modus = 'hell' | 'dunkel';

export const MODUS_COOKIE = 'comphub_modus';

/** Seiten, die in der bisherigen Optik bleiben. */
const ALT = /^\/(streams|overlays|pov|pov-ansicht|live-leaderboard|live-replays)(\/|$)/;

export const designFuerPfad = (pfad: string): Design => (ALT.test(pfad) ? 'alt' : 'neu');

/*
 * Weitere Anzeige-Einstellungen aus dem Zahnrad unten rechts (14.10.2026) - wie der Modus als Cookie, damit der Rahmen sie schon auf dem
 * Server liest und nichts umspringt.
 *   comphub_groesse   "klein" | "gross" (fehlt: normal) - die Grundschrift der ganzen Seite
 *   comphub_bewegung  "aus" (fehlt: an) - schaltet Uebergaenge und Animationen ab
 */
export type Groesse = 'klein' | 'normal' | 'gross';
export const GROESSE_COOKIE = 'comphub_groesse';
export const BEWEGUNG_COOKIE = 'comphub_bewegung';

export const lieseGroesse = (wert: string | undefined | null): Groesse => (wert === 'klein' || wert === 'gross' ? wert : 'normal');
export const lieseBewegung = (wert: string | undefined | null): 'an' | 'aus' => (wert === 'aus' ? 'aus' : 'an');

/** Den Modus aus einem Cookie-Text lesen (Browser: document.cookie). */
export function lieseModus(cookieText: string): Modus {
  const m = new RegExp(`(?:^|;\\s*)${MODUS_COOKIE}=([^;]+)`).exec(cookieText);
  return m && decodeURIComponent(m[1]) === 'dunkel' ? 'dunkel' : 'hell';
}
