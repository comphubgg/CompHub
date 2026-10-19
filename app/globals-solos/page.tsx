import SolosSeite from './SolosSeite';

/*
 * FNCS Solos - eine Seite fuer alle Regionen (siehe SolosSeite). Die frueheren Unterseiten (/heats, /qualifiziert, /map, /laender) leiten auf die Reiter dieser
 * Seite um; der Link im Dashboard und alte Lesezeichen bleiben damit gueltig.
 */
export default function GlobalsSolos() {
  return <SolosSeite />;
}
