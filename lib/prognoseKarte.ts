/*
 * Geometrie fuer Turnierkarten mit Formen - geteilt zwischen dem
 * Admin-Werkzeug (app/admin/prognosen) und der oeffentlichen Prognoseseite
 * (app/prognosen). Die Formen sind Polygone in Prozent der Kartenbreite
 * und -hoehe; die Beschriftung sitzt in der Form, nicht in ihrem Rahmen.
 */

export interface Punkt { x: number; y: number }

export interface Spot {
  id: string; form: string; punkte: Punkt[]; name?: string; farbe?: string;
}

/** Der umschliessende Rahmen einer Form, in Prozent. */
export function rahmen(punkte: Punkt[]) {
  const xs = punkte.map((q) => q.x), ys = punkte.map((q) => q.y);
  const links = Math.min(...xs), oben = Math.min(...ys);
  return {
    links, oben,
    breite: Math.max(...xs) - links,
    hoehe: Math.max(...ys) - oben,
  };
}

/**
 * Wie breit ist die Form auf einer bestimmten Hoehe, und wo liegt dort ihre
 * Mitte? Bei schraegen Formen ist das je Zeile verschieden - das
 * umschliessende Rechteck wuerde die Beschriftung neben die Flaeche setzen.
 */
export function spanneBei(punkte: Punkt[], y: number): { mitte: number; breite: number } | null {
  const schnitte: number[] = [];
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i], b = punkte[j];
    if ((a.y > y) === (b.y > y)) continue;
    schnitte.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (schnitte.length < 2) return null;
  const links = Math.min(...schnitte), rechts = Math.max(...schnitte);
  return { mitte: (links + rechts) / 2, breite: rechts - links };
}

/**
 * Schriftgroesse, damit die Zeile in die Form passt: begrenzt durch die
 * Hoehe, die einem Team zusteht, und durch die Breite des laengsten Namens.
 * In Prozent der Kartenbreite.
 */
export function schriftgroesse(breite: number, hoehe: number, zeichen: number) {
  const nachHoehe = hoehe * 0.6;
  const nachBreite = (breite * 0.92) / Math.max(zeichen * 0.52, 1);
  return Math.max(0.5, Math.min(nachHoehe, nachBreite, 2.4));
}

/**
 * Eine Schriftgroesse fuer die ganze Karte: nicht die kleinste (die stammt
 * von einer einzigen engen Form), sondern die im unteren Drittel.
 */
export function einheitsGroesse(
  spots: Spot[], aufSpot: Record<string, string[]>,
  zeilenFuer: (key: string, alleine: boolean) => string[],
): number {
  const werte: number[] = [];
  for (const sp of spots) {
    const keys = aufSpot[sp.id] ?? [];
    const r = rahmen(sp.punkte);
    const anzahl = keys.length || 1;
    const hoeheProTeam = r.hoehe / anzahl;
    const saetze: string[][] = keys.length
      ? keys.map((k) => zeilenFuer(k, keys.length === 1))
      : (sp.name ? [[sp.name]] : []);
    for (const texte of saetze) {
      if (!texte.length) continue;
      const laengste = Math.max(...texte.map((t) => t.length), 1);
      werte.push(schriftgroesse(r.breite, hoeheProTeam / texte.length, laengste));
    }
  }
  if (!werte.length) return 1.2;
  werte.sort((a, b) => a - b);
  return Math.max(1.1, Math.min(werte[Math.floor(werte.length / 3)], 2.0));
}
