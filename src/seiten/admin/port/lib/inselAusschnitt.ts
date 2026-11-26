/*
 * Wo auf einem Kartenbild die Insel liegt (Betreiber, 5. und 6.11.2026: "zu viel blauer Rand"). Die Insel der Season 43 fuellt nur gut die Haelfte des Bildes, darum wird sie gemessen
 * statt fest eingestellt: alles, was nicht Wasser oder Wolke ist, zaehlt zur Insel. Zurueck kommt ein quadratischer Ausschnitt in Anteilen des Bildes (0 bis 1).
 * Liegt die Insel schon fast bildfuellend da, bleibt das ganze Bild.
 */

export interface Ausschnitt { x: number; y: number; seite: number }

export const GANZES_BILD: Ausschnitt = { x: 0, y: 0, seite: 1 };

export function inselAusschnitt(bild: HTMLImageElement, rand = 0.05): Ausschnitt {
  try {
    const n = 96;
    const leinwand = document.createElement('canvas');
    leinwand.width = n; leinwand.height = n;
    const stift = leinwand.getContext('2d', { willReadFrequently: true });
    if (!stift) return GANZES_BILD;
    stift.drawImage(bild, 0, 0, n, n);
    const px = stift.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (r > 215 && g > 215 && b > 215) continue; // Wolken
        if (r > 110 || g > b + 12) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
    }
    if (x1 < 0) return GANZES_BILD;
    const seite = Math.min(1, Math.max(x1 - x0 + 1, y1 - y0 + 1) / n + rand * 2);
    if (seite > 0.87) return GANZES_BILD;
    const mitte = (a: number, b: number) => (a + b + 1) / 2 / n;
    const inBild = (m: number) => Math.min(Math.max(m - seite / 2, 0), 1 - seite);
    return { x: inBild(mitte(x0, x1)), y: inBild(mitte(y0, y1)), seite };
  } catch {
    // Ein Bild aus fremder Quelle laesst sich nicht auslesen: dann eben die ganze Karte.
    return GANZES_BILD;
  }
}
