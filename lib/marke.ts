// Name, Adresse und Logo der Seite - an einer Stelle, damit ein spaeterer
// Namenswechsel nicht durch das halbe Projekt gesucht werden muss.
//
// Verwendet wird das hier vor allem beim Herunterladen von Bildern: die
// Karte und die Beitragsgrafik tragen dann Name und Logo, damit man ihnen
// ansieht, wo sie herkommen. Auf dem Bildschirm bleibt beides unsichtbar.

export const MARKE = {
  /** Kurzer Name, erscheint oben links auf heruntergeladenen Bildern. */
  name: 'CompHub',
  /** Adresse, erscheint unten rechts neben dem Logo. */
  seite: 'comphub.gg',
  /** Pfad zum Logo im oeffentlichen Ordner - quadratisch, mit Untergrund. */
  logo: '/logos/CompHub-Logo.png',
  /** Das eigene Konto auf X - die einzige Social des Werkzeugs. */
  x: 'CompHub_gg',
  /**
   * Dasselbe Zeichen ohne Untergrund.
   *
   * Auf einer Karte soll die Marke nicht in einem schwarzen Kasten sitzen,
   * sondern frei auf dem Bild stehen. Freigestellt aus der quadratischen
   * Fassung: der Untergrund dort ist neutral grau, das Zeichen hat einen
   * klaren Blaustich - daran liess es sich sauber trennen.
   */
  logoFrei: '/logos/CompHub-Logo-frei.png',
  /** Zeile am unteren Rand. */
  hinweis(): string {
    return `from ${this.seite}`;
  },
} as const;
