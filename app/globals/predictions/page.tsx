'use client';

import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { useZugang } from '@/app/lib/zugang';
import PrognosenWerkzeug from '@/app/admin/predictions/Werkzeug';

/*
 * Der Tipp auf den Ausgang der Global Championship.
 *
 * Bis zum 24.9.2026 bekamen VIPs hier nur zu sehen, was der Admin getippt
 * hatte. Gemeint war es anders - der Betreiber in #admin-todo: "Unter der
 * Globals-Seite unter Predictions ist gemeint, dass man als VIP seine eigene
 * Prediction machen kann, nicht die vom Admin zu sehen ist - das einzige,
 * was nur der Admin machen muss, ist die Map."
 *
 * Also bekommt jeder dasselbe Werkzeug:
 *   - der Admin seine Prognose wie bisher (/api/prognosen);
 *   - jeder VIP mit dem Globals-Bereich seine eigene (/api/meine-prognose),
 *     die niemand sonst sieht, mit der Karte, die der Admin gezeichnet hat.
 * Wer hier hereindarf, entscheidet das Geruest (Admin oder Bereich "globals").
 */
export default function GlobalsPredictions() {
  const zugang = useZugang();
  if (zugang.laedt) {
    return <GlobalsGeruest aktiv="/globals/predictions"><LadeSchirm /></GlobalsGeruest>;
  }
  return (
    <GlobalsGeruest aktiv="/globals/predictions" breit>
      {zugang.admin ? <PrognosenWerkzeug globals /> : <PrognosenWerkzeug globals eigen />}
    </GlobalsGeruest>
  );
}
