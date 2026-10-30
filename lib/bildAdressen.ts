/*
 * Oeffentliche Adressen fuer Bilder, die eine API-Route ausliefert.
 *
 * Cloudflare legt nur zwischen, was nach einer Datei aussieht - entschieden
 * wird an der Endung der Adresse. "/api/fortnite-map?bild=leer" (zwei
 * Megabyte) lief deshalb bei jedem Besuch ueber Render, und Render gratis
 * erlaubt fuenf Gigabyte Datenverkehr im Monat. Unter "/bilder/....png"
 * (app/bilder: reicht an die jeweilige Route weiter) liefert Cloudflare das
 * Bild aus seinem Speicher.
 */

/** Epics aktuelle Karte - mit oder ohne Ortsnamen (app/api/fortnite-map). */
export const fortniteKarte = (mitOrten: boolean) => `/bilder/karte-${mitOrten ? 'orte' : 'leer'}.png`;

/** Die Insel der Saison eines Spieltags ("S42_..." -> /bilder/karte-s42.png, lib/saisonKarte) - ohne Saison in der Kennung die Karte von heute. */
export const saisonKarte = (kennung?: string | null) => {
  const m = /(?:^|_)S(\d{2,3})_/i.exec(kennung ?? '');
  return m ? `/bilder/karte-s${m[1]}.png` : fortniteKarte(false);
};

/** Ein hochgeladenes Kartenbild (app/api/karten-bild). */
export const eigeneKarte = (id: string) => `/bilder/karten/${encodeURIComponent(id)}.png`;

/** Logo oder Banner einer Org (app/api/orgs/logo) - aus dem Dateinamen im Objektspeicher. */
export const orgBild = (datei: string) => `/bilder/org/${datei.replace(/^org-logos\//, '')}`;
