/*
 * Woher die Formen (Landepunkte) einer Turnierkarte stammen - und ob die Karte deshalb Noble Practice nennt (Betreiber, 16.11.2026: jede Karte, deren
 * Landepunkte von Noble kommen, nennt sie sichtbar, auf der Seite und im Bild - wie /globals-solos).
 *
 * Genannt wird NUR Noble. Vital Scrims (NA Central, NA West, Middle East, Ozeanien) wird nicht genannt, bis es eine Vereinbarung gibt.
 *
 * Seit diesem Tag traegt jede Form ihre Quelle selbst (`quelle`): die Automatik (lib/kartenAutomatik) und "Generate map" schreiben sie hinein, von Hand
 * gezeichnete Formen haben keine. Aeltere Karten wissen das nicht; fuer sie gilt: eine Form mit der Kennung "noble-..." kam aus der Automatik oder aus
 * "Generate map" - in Europa ist das Noble (Noble fuehrt nur Europa), sonst Vital.
 *
 * Wird eine Karte danach von Hand bearbeitet, bleibt der Hinweis, solange noch mindestens eine Form von Noble darauf steht (auch verschoben oder
 * umbenannt - gezeichnet hat sie Noble). Erst wenn alle Formen von Hand ersetzt sind, verschwindet er.
 *
 * Ohne Abhaengigkeiten, damit Server und Browser dasselbe rechnen.
 */

export type SpotQuelle = 'noble' | 'vital';


interface KartenKopf { id?: string; region?: string | null; windowId?: string | null; automatisch?: { quelle?: string } | null }
interface SpotKopf { id: string; quelle?: string }

const regionVon = (k: KartenKopf) => (k.region || /_([A-Z]{2,4})$/.exec(k.windowId ?? '')?.[1] || '').toUpperCase();

/** Die Quelle einer Form - gespeichert oder, bei aelteren Karten, hergeleitet. Von Hand gezeichnet: undefined. */
export function spotQuelle(k: KartenKopf, sp: SpotKopf): SpotQuelle | undefined {
  if (sp.quelle === 'noble' || sp.quelle === 'vital') return sp.quelle;
  if (sp.quelle) return undefined;
  // Als Ganzes von Noble uebernommene Karten (Kennung "noble-<windowId>", frueher scripts/karte-speichern): jede Form ohne eigene Quelle ist Nobles.
  if (k.id?.startsWith('noble-')) return 'noble';
  if (!sp.id.startsWith('noble-')) return undefined;
  const auto = k.automatisch?.quelle;
  if (auto === 'noble' || auto === 'vital') return auto;
  // Vital fuehrte nur NA Central, NA West, Middle East und Ozeanien - alles andere (Europa, Global Championship ...) kam von Noble (16.11.2026:
  // die Karte der Global Championship stand vorher faelschlich ohne Noble-Hinweis da).
  return ['NAC', 'NAW', 'ME', 'OCE'].includes(regionVon(k)) ? 'vital' : 'noble';
}

/** Die Karte mit der Quelle an jeder Form, die eine hat - so speichert der Editor sie beim naechsten Mal mit. */
export function mitSpotQuelle<S extends SpotKopf, K extends KartenKopf & { spots: S[] }>(k: K): K {
  let anders = false;
  const spots = k.spots.map((sp) => {
    const q = spotQuelle(k, sp);
    if (!q || sp.quelle === q) return sp;
    anders = true;
    return { ...sp, quelle: q };
  });
  return anders ? { ...k, spots } : k;
}

/** Steht mindestens eine Form von Noble auf der Karte? Nur Formen mit gespeicherter Quelle zaehlen - vorher mitSpotQuelle. */
export const hatNobleFormen = (spots: ReadonlyArray<{ quelle?: string; punkte?: ReadonlyArray<unknown> }>) =>
  spots.some((sp) => sp.quelle === 'noble' && (sp.punkte?.length ?? 3) >= 3);

/*
 * Stammen Landepunkte dieser Karte von Vital Scrims? Ja, sobald eine Form (gespeichert oder hergeleitet) von Vital kommt oder die Automatik/"Generate map"
 * Vital als Quelle eingetragen hat. Solche Karten zeigt die Seite nicht, solange Vital nicht zugestimmt hat (lib/vitalScrims VITAL_AUS, Betreiber 16.11.2026).
 */
export const istVitalKarte = (k: KartenKopf & { spots?: ReadonlyArray<SpotKopf> }) =>
  k.automatisch?.quelle === 'vital' || (k.spots ?? []).some((sp) => spotQuelle(k, sp) === 'vital');

/** Wie hatNobleFormen, aber mit Herleitung fuer Formen ohne gespeicherte Quelle (z. B. Prognose-Karten). */
export const zeigtNoble = (k: KartenKopf, spots: ReadonlyArray<SpotKopf & { punkte?: ReadonlyArray<unknown> }>) =>
  spots.some((sp) => spotQuelle(k, sp) === 'noble' && (sp.punkte?.length ?? 3) >= 3);
