'use client';

import { useCallback, useState, type CSSProperties, type SyntheticEvent } from 'react';

/*
 * Das Vollbild einer Karte - bis an den Rand blau statt eines Quadrats.
 *
 * Der Betreiber (26.9.2026) zur Globals-Karte im Vollbild: "wieso auch immer
 * der blaue Rand weg ist. Eigentlich sollte es nicht quadratisch sein,
 * sondern mehr blau rein." Das Inselbild der Globals ist breiter als hoch;
 * die Karte ist ein Quadrat und schneidet es mit object-cover links und
 * rechts ab - samt dem Meer am Rand.
 *
 * Im Vollbild wird das Bild deshalb in voller Breite gezeigt, im selben
 * Massstab und um dieselbe Mitte wie im Quadrat: der mittlere Teil liegt
 * genau dort, wo er vorher lag, die Formen (Prozent des Quadrats) bleiben
 * also an ihrem Platz. Was ausserhalb des Bildes bleibt, bekommt die Farbe
 * seines Rands - das Meer geht bis an den Bildschirmrand weiter.
 */

/** Meer, falls das Bild seine Farbe nicht verraet. */
const MEER = '#0b4a9c';

export function useKartenVollbild() {
  /** Breite durch Hoehe des Bildes - null, solange es nicht geladen ist. */
  const [verhaeltnis, setVerhaeltnis] = useState<number | null>(null);
  const [meer, setMeer] = useState(MEER);

  /*
   * Messen auch, wenn das Bild schon aus dem Zwischenspeicher kam (30.10.2026): dann feuert onLoad oft, bevor React zuhoert, das Meer blieb beim
   * Standard-Blau, und um die Karte stand ein sichtbar anderes Blau. messen() wird deshalb zusaetzlich beim Einhaengen des Bildes aufgerufen.
   */
  const messen = useCallback((img: HTMLImageElement) => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    setVerhaeltnis(w / h);
    // Die vier Ecken gemittelt - dort ist bei jeder Fortnite-Karte Meer.
    try {
      const c = document.createElement('canvas');
      c.width = 2; c.height = 2;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      const s = Math.max(4, Math.round(Math.min(w, h) * 0.01));
      g.drawImage(img, 0, 0, s, s, 0, 0, 1, 1);
      g.drawImage(img, w - s, 0, s, s, 1, 0, 1, 1);
      g.drawImage(img, 0, h - s, s, s, 0, 1, 1, 1);
      g.drawImage(img, w - s, h - s, s, s, 1, 1, 1, 1);
      const d = g.getImageData(0, 0, 2, 2).data;
      const mittel = (k: number) => Math.round((d[k] + d[k + 4] + d[k + 8] + d[k + 12]) / 4);
      const [r, g2, b] = [mittel(0), mittel(1), mittel(2)];
      // Sind die Ecken des Bildes schwarz oder grau (manche Karten haben dunkle Raender), bleibt das uebliche Blau: der Hintergrund soll wie ueberall blau sein (Betreiber, 20.10.2026).
      const blau = b > r + 25 && b > g2 + 10 && b > 70;
      if (blau) setMeer(`rgb(${r}, ${g2}, ${b})`);
    } catch { /* dann bleibt das Standard-Blau */ }
  }, []);
  const beiLaden = useCallback((e: SyntheticEvent<HTMLImageElement>) => messen(e.currentTarget), [messen]);

  /** Die Lage des Bildes im Quadrat - im Vollbild in voller Groesse. */
  const bildStil = useCallback((vollbild: boolean): CSSProperties | undefined => {
    if (!vollbild || !verhaeltnis || Math.abs(verhaeltnis - 1) < 0.005) return undefined;
    return verhaeltnis > 1
      ? { top: 0, height: '100%', left: `${(1 - verhaeltnis) * 50}%`, width: `${verhaeltnis * 100}%`, maxWidth: 'none' }
      : { left: 0, width: '100%', top: `${(1 - 1 / verhaeltnis) * 50}%`, height: `${100 / verhaeltnis}%`, maxHeight: 'none' };
  }, [verhaeltnis]);

  return { meer, beiLaden, bildStil, messen };
}
