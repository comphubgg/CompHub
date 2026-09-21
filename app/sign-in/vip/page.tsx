'use client';

import Anmelden from '../page';

/*
 * Die Anmeldung fuer Zugangsschluessel, unter einer eigenen Adresse.
 *
 * Es ist dieselbe Seite - nur mit dem VIP-Reiter offen. Der Betreiber hatte
 * gemerkt, dass der Link aus Discord auf dem E-Mail-Formular landete: die
 * alte Adresse /login/vip leitete auf /anmelden weiter, und dort steht
 * "Anmelden" vorn. Wer aus seinem Schluesselkanal kommt, hat aber keine
 * E-Mail-Adresse, sondern einen Namen und einen Schluessel.
 *
 * Eine zweite Fassung der Seite waere der falsche Weg: sie ab morgen zweimal
 * zu pflegen, weil sich ein Reiter unterscheidet.
 */
export default function VipAnmeldung() {
  return <Anmelden start="vip" />;
}
