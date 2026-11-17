/*
 * Ab wann Gerechnetes nur noch aus eigenen Daten stammt (17.11.2026, 05:00 UTC - der Stand, ab dem die Statistik nur noch Epics Turnierdaten und
 * unsere eigene Replay-Auswertung liest). Fertige Antworten der Statistik und Akten, die davor gerechnet wurden, enthalten noch Werte einer
 * Quelle, deren Betreiber jede Nutzung untersagt hat: sie werden nicht mehr ausgeliefert, sondern gelten als nicht vorhanden, bis der
 * Stundenlauf sie neu gerechnet hat (scripts/fremdquellen-sperre.mjs, scripts/fremdquelle-loeschen.mjs).
 */
export const FREMD_GRENZE = Date.parse('2026-11-17T05:00:00Z');

/** Antworten, die aus der Statistik gerechnet sind (Schluessel als Ablagename "antworten/..."). */
export const istStatistikAntwort = (name: string) =>
  /^antworten\/(szene_|center_|laender_|tierlist_trios_auto|fncs)/.test(name);
