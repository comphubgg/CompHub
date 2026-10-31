import stand from './fotoStand.json';

/*
 * Die kleine Fassung eines Spielerfotos (scripts/spielerbilder-klein.mjs, 480 Pixel breit, WebP).
 *
 * Listen und Karten zeigen ein Foto hoechstens 300 Pixel breit; das Original (bis 1600 x 2300 Pixel,
 * 600 KB) zog bei 300 Spielern 25 MB und liess die Seite endlos laden (Betreiber, 11.10.2026).
 * Nur mitgelieferte JPG/PNG-Fotos haben eine kleine Fassung; hochgeladene (spielerfotos/...webp)
 * sind schon klein und bleiben, wie sie sind.
 *
 * Jede Adresse traegt das Kennzeichen des Foto-Inhalts ("?v=", lib/fotoStand.json): Browser behalten Fotos vier Stunden, und ein neu
 * zugeschnittenes Foto unter altem Namen kaeme sonst erst Stunden spaeter an (31.10.2026).
 */
const STAND = stand as Record<string, string>;
const mitStand = (url: string, datei: string) => (STAND[datei] ? `${url}?v=${STAND[datei]}` : url);

export function spielerbildKlein(datei: string): string {
  const m = /^([A-Za-z0-9._-]+)\.(?:jpe?g|png)$/i.exec(datei);
  return m
    ? mitStand(`/spielerbilder-klein/${encodeURIComponent(m[1])}.webp`, datei)
    : spielerbildGross(datei);
}

/** Das Original eines Spielerfotos (Profilseiten, Plakate) - mit demselben Kennzeichen. */
export function spielerbildGross(datei: string): string {
  return mitStand(`/spielerbilder/${encodeURIComponent(datei)}`, datei);
}

/** Das Kennzeichen zu einer fertigen Foto-Adresse nachtragen (aeltere, abgelegte Antworten). */
export function standAnhaengen(url: string): string {
  const m = /^\/spielerbilder(-klein)?\/([^?]+)$/.exec(url);
  if (!m) return url;
  let datei = m[2];
  try { datei = decodeURIComponent(datei); } catch { /* bleibt */ }
  if (m[1]) {
    const name = datei.replace(/\.webp$/i, '');
    const original = Object.keys(STAND).find((d) => d.replace(/\.(jpe?g|png|webp)$/i, '') === name);
    return original ? mitStand(url, original) : url;
  }
  return mitStand(url, datei);
}
