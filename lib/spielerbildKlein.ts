/*
 * Die kleine Fassung eines Spielerfotos (scripts/spielerbilder-klein.mjs, 480 Pixel breit, WebP).
 *
 * Listen und Karten zeigen ein Foto hoechstens 300 Pixel breit; das Original (bis 1600 x 2300 Pixel,
 * 600 KB) zog bei 300 Spielern 25 MB und liess die Seite endlos laden (Betreiber, 11.10.2026).
 * Nur mitgelieferte JPG/PNG-Fotos haben eine kleine Fassung; hochgeladene (spielerfotos/...webp)
 * sind schon klein und bleiben, wie sie sind.
 */
export function spielerbildKlein(datei: string): string {
  const m = /^([A-Za-z0-9._-]+)\.(?:jpe?g|png)$/i.exec(datei);
  return m
    ? `/spielerbilder-klein/${encodeURIComponent(m[1])}.webp`
    : `/spielerbilder/${encodeURIComponent(datei)}`;
}
