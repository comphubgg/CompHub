/*
 * Die Sperre fuer die alten Spielerfotos (Betreiber, 17.11.2026).
 *
 * Der Inhaber einer fremden Statistikseite hat verlangt, dass die von seiner Seite stammenden Fotos verschwinden. Der Betreiber: alle Spielerfotos
 * sofort weg, an ihrer Stelle der Platzhalter; neue Fotos besorgt er selbst und fuegt sie nach und nach wieder ein.
 *
 * Drei Riegel, eine Datei - fuer die Seite (lib/spielerbildKlein.ts) und fuer scripts/spielerbilder-klein.mjs:
 *
 *   1. NEUANFANG: hochgeladene Fotos (Admin-Werkzeug, Org-Konto; Objektspeicher "spielerfotos/") tragen im Namen ihre Entstehungszeit
 *      ("vico-02c93e45-mi3k2x9a.webp", Date.now() zur Basis 36). Was vor diesem Zeitpunkt hochgeladen wurde, liefert die Seite nicht mehr aus -
 *      geloescht ist es nicht (die Zahl hier zurueckzusetzen, gaebe es wieder frei). Alles danach erscheint wie gewohnt.
 *   2. Die Inhalts-Kennzeichen (die ersten acht Zeichen des SHA-1, wie lib/fotoStand.json) aller entfernten Dateien stehen in lib/fotoGesperrt.json.
 *      scripts/spielerbilder-klein.mjs (laeuft vor jedem Bau) loescht eine solche Datei aus public/spielerbilder, falls sie dort wieder auftaucht
 *      (etwa aus einem alten Vorrat kopiert).
 *   3. BESTAETIGTE_UPLOADS: die vier Fotos, die Spieler selbst hochgeladen haben (Player Center, 26.10.2026). Sie bleiben frei und ersetzen
 *      bei ihrem Konto die alte mitgelieferte Datei (tinka.png war dasselbe Bild; mariuscow.jpg, romero.jpg und zynox.jpg waren es nicht).
 */

/** 17.11.2026, 04:30 UTC - Uploads davor bleiben gesperrt. */
export const NEUANFANG_MS = Date.UTC(2026, 10, 17, 4, 30);

/** Konto-Id -> vom Spieler selbst hochgeladenes Foto (Objektspeicher spielerfotos/). */
export const BESTAETIGTE_UPLOADS = {
  '22cf797239f542caaf597660403c97a6': 'jft-tinka2x-22cf7972-mvotb6qc.webp',
  'f0d8961f20d04631a6b2abda24a17070': 'mariuscow-f0d8961f-mvot7u7j.webp',
  'f899b6ef72c74f03af0aeca85b2bedca': 'romerofdp-f899b6ef-mvotafhj.webp',
  'ebbc1edaa769417eb5821b56d722c3f5': 'zynox-ebbc1eda-mvot84xl.webp',
};
const BESTAETIGT = new Set(Object.values(BESTAETIGTE_UPLOADS));

/**
 * Ist ein hochgeladenes Foto (Name "<name>-<konto8|org>-<zeit36>.webp") nach dem Neuanfang entstanden?
 * null, wenn der Name gar nicht wie ein Upload aussieht.
 */
export function uploadFrei(datei) {
  const name = String(datei).replace(/^spielerfotos\//, '');
  const m = /^[a-z0-9-]+-(?:[0-9a-f]{8}|org)-([0-9a-z]{6,10})\.webp$/.exec(name);
  if (!m) return null;
  if (BESTAETIGT.has(name)) return true;
  const zeit = parseInt(m[1], 36);
  return Number.isFinite(zeit) && zeit >= NEUANFANG_MS;
}
