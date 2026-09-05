'use client';

/*
 * Dasselbe Dashboard unter der Adresse, die dazu passt.
 *
 * Der Betreiber: "beim Admin heisst das Dashboard /admin, aber bei den VIPs
 * soll die URL /vip sein." Das ist mehr als Kosmetik - wer sich mit einem
 * Zugangsschluessel anmeldet und auf "/admin" landet, haelt sich fuer einen
 * Administrator oder fuer falsch abgebogen. Beides ist unschoen.
 *
 * Es bleibt eine einzige Seite. Sie hier ein zweites Mal zu schreiben hiesse,
 * sie ab morgen zweimal zu pflegen; welche Werkzeuge jemand sieht, entscheidet
 * ohnehin seine Rolle und nicht die Adresse, unter der er hereinkommt.
 */
export { default } from '../admin/page';
