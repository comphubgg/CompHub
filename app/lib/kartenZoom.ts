import type { Punkt } from '@/lib/prognoseKarte';

/*
 * Der Doppelklick auf einer Turnierkarte - in Stufen immer naeher heran.
 *
 * Der Betreiber (11.10.2026), wie bei Noble Practice: "wenn ich doppelt drauf druecke, zoome ich ein
 * bisschen mehr an die Form, zweimal noch mehr, viermal richtig nah - und immer mittig. Ich kann mehrmals
 * doppelt draufdruecken." Jeder Doppelklick auf dieselbe Form ist eine Stufe weiter; nach der vierten
 * steht die Form gross in der Mitte. Gleiten tut jede Seite selbst (weich, auf geradem Weg) - hier steht nur,
 * wohin.
 */

/** So weit darf in jeder Karte hineingezoomt werden (Rad und Doppelklick). */
export const ZOOM_MAX = 8;

/** Wie viele Doppelklicks bis ganz nah. */
export const ZOOM_STUFEN = 4;

/** Anteil des Ausschnitts, den die Form auf der letzten Stufe fuellt. */
const ANTEIL = 0.72;

interface FormRahmen { links: number; oben: number; breite: number; hoehe: number }

/** Der Massstab, bei dem die Form den Ausschnitt ausfuellt (letzte Stufe). */
function formZoom(r: FormRahmen): number {
  const gross = Math.max(r.breite, r.hoehe, 3);
  return Math.min(ZOOM_MAX, Math.max(3, (ANTEIL * 100) / gross));
}

/** Der Massstab der n-ten Stufe - gleichmaessig im Verhaeltnis, jede Stufe gleich viel naeher. */
function stufenZoom(ziel: number, n: number): number {
  return ziel ** (Math.min(n, ZOOM_STUFEN) / ZOOM_STUFEN);
}

/**
 * Wohin ein Doppelklick fuehrt.
 *
 * @param form    Rahmen der Form unter dem Zeiger, sonst null.
 * @param punkt   Der Kartenpunkt unter dem Zeiger, in Prozent.
 * @param aktuell Der Massstab, bei dem die Ansicht steht - oder gerade ankommt, wenn noch gegleitet wird.
 *
 * Auf einer Form: die naechste Stufe, deren Massstab ueber dem jetzigen liegt, mit der Form in der Mitte.
 * Ist die letzte Stufe erreicht, bleibt es dabei (nur die Mitte wird nachgefuehrt). Ohne Form: ein Schritt
 * naeher an die Stelle, wie bei jeder Landkarte.
 */
export function doppelKlickZiel(
  form: FormRahmen | null, punkt: Punkt, aktuell: number,
): { zoom: number; mitte: Punkt } {
  if (!form) {
    return { zoom: Math.min(ZOOM_MAX, Math.max(1.8, aktuell * 1.8)), mitte: punkt };
  }
  const mitte = { x: form.links + form.breite / 2, y: form.oben + form.hoehe / 2 };
  const ziel = formZoom(form);
  for (let n = 1; n <= ZOOM_STUFEN; n++) {
    const z = stufenZoom(ziel, n);
    if (z > aktuell * 1.06) return { zoom: z, mitte };
  }
  // Schon naeher als die letzte Stufe: nicht wieder herauszoomen, nur zentrieren.
  return { zoom: Math.max(ziel, aktuell), mitte };
}
