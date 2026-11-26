/*
 * Noble-Formen fuer die Anzeige leicht vereinfacht (lib/formVereinfachen) - an einer Stelle fuer alle Ansichten, Bilder und Plakate.
 * Gilt fuer jede Karte mit Landepunkten von Noble Practice, alte wie kuenftige, ohne Handarbeit; die gespeicherten Daten bleiben unberuehrt.
 */
import { nobleAnzeige, type Pt } from './formVereinfachen';

/** Ein Spieltag (SolosFenster und Verwandte): sind die Formen von Noble, kommen sie vereinfacht zurueck. */
export function nobleFensterAnzeige<F extends { kartenQuelle?: string; formen: Array<{ punkte: Pt[] }> }>(f: F): F {
  if (f.kartenQuelle !== 'noble' || !f.formen?.length) return f;
  const neu = nobleAnzeige(f.formen, () => true);
  return { ...f, formen: f.formen.map((fo, i) => ({ ...fo, punkte: neu[i] })) };
}

/** Formen einer Turnierkarte (Spots mit Quelle): nur die von Noble werden vereinfacht, die anderen bleiben und zaehlen als Nachbarn. */
export function nobleSpotsAnzeige<S extends { punkte: Pt[] }>(spots: S[], istNoble: (s: S) => boolean): S[] {
  if (!spots.some(istNoble)) return spots;
  const neu = nobleAnzeige(spots, (i) => istNoble(spots[i]));
  return spots.map((s, i) => (neu[i] === s.punkte ? s : { ...s, punkte: neu[i] }));
}
