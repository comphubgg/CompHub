/**
 * Welches Zahlen- und Datumsformat zur eingestellten Sprache gehoert.
 *
 * Vorher stand an mehreren Stellen fest 'de-DE'. Wer auf Englisch gestellt
 * hatte, las auf der Startseite trotzdem "37.004 matches processed" und in
 * den Power Rankings "10.000 Players" - und der PR-Wert "39.240" liest sich
 * fuer einen englischen Besucher als 39,24. Das ist kein Schoenheitsfehler,
 * sondern eine falsche Zahl.
 *
 * Englisch bekommt en-GB und nicht en-US: die Turnierszene liest Tag vor
 * Monat und die Vierundzwanzig-Stunden-Uhr.
 */
export function ortVon(sprache: string): string {
  return sprache === 'en' ? 'en-GB' : 'de-DE';
}
