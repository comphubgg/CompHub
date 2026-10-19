/*
 * Vitals Koordinaten auf unsere Karte.
 *
 * Vital zeichnet auf dem Quadrat 0..256 (Leaflet "Simple"): lat laeuft von 0 (oben) bis -256 (unten), lng von 0 (links) bis 256 (rechts). Abgeglichen am
 * 19.10.2026 gegen Nobles Kartenbild (nobleprac.com/maps/42.30/map.png, dasselbe Bild, auf das auch Nobles Formen gezeichnet werden): die Inselflaechen beider
 * Bilder decken sich zu 94,5 % bei Massstab 1,00 und ohne Versatz - Vitals Quadrat ist also genau das Kartenbild. Darum genuegt die Umrechnung in Prozent.
 */
export function inProzentVital([lat, lng]: [number, number]): { x: number; y: number } {
  const rund = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
  return { x: rund((lng / 256) * 100), y: rund((-lat / 256) * 100) };
}
