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
  // Grossbuchstaben (siehe app/lib/kartenStil) brauchen gut 0,62 je Zeichen.
  const nachBreite = (breite * 0.92) / Math.max(zeichen * 0.62, 1);
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

/**
 * Eine Beschriftung (alle Namen einer Stelle) fuer {@link beschriftungsVersatz}. Alle Masse in Prozent der Kartenbreite bei Zoom 1.
 * Die Namen einer Stelle bewegen sich nur gemeinsam - untereinander bleiben sie, wie sie sind.
 */
export interface Beschriftung {
  id: string;
  /** Rahmen der Stelle (oben und Hoehe), wie {@link rahmen}. */
  oben: number; hoehe: number;
  /** true: die Zeilen sind ueber die Stelle verteilt (mehrere Teams, justify space-between); false: dicht in der Mitte. */
  verteilt: boolean;
  /** Je Zeile: ihre waagrechte Mitte auf der Karte und die Breite des Textes. */
  zeilen: Array<{ x: number; breite: number }>;
}

/** Die Zoomstufen, auf denen geprueft wird - die Schrift waechst nicht mit (calc(... / var(--z))), die Abstaende der Stellen schon. */
const PRUEF_ZOOM = [1, 1.12, 1.25, 1.4, 1.6, 1.8, 2, 2.4, 2.8, 3.4, 4, 5, 6.5, 8];

/**
 * Wo die Namen verschiedener Stellen einander ueberdecken, werden die Beschriftungen ein Stueck auseinandergeschoben (Betreiber, 15.11.2026:
 * "KING NOVA" und "LXRS" lagen auf zwei benachbarten Stellen genau uebereinander - "ein bisschen auseinander wie bei Noble").
 *
 * Gerechnet wird in Bildschirm-Einheiten (cqw bei Zoom 1): die Schrift ist auf jeder Zoomstufe gleich gross, die Mitten der Stellen liegen
 * z-mal so weit auseinander. Der Versatz gilt ebenfalls in diesen Einheiten (translate: calc(<d>cqw / var(--z))), also wird jede Stufe von
 * 1 bis ZOOM_MAX geprueft. Geschoben wird immer in der Richtung, in der die Stellen ohnehin zueinander liegen - so kehrt sich die Reihenfolge
 * beim Zoomen nie um. Lieber senkrecht (wie bei Noble: ein Name ueber dem anderen), waagrecht nur, wenn das deutlich weniger Weg ist.
 * Die Stelle mit mehr Zeilen bewegt sich weniger. Deterministisch; Stellen ohne Konflikt behalten den Versatz 0.
 *
 * kastenEm: Hoehe des Schriftkastens (Ober- bis Unterlaenge) je Schriftgroesse, in der Kartenschrift gemessen.
 *
 * Zurueck: je Stelle der Versatz { dx, dy } in Prozent der Kartenbreite bei Zoom 1 (nur Stellen mit Versatz).
 */
export function beschriftungsVersatz(
  beschriftungen: Beschriftung[], groesse: number, kastenEm = 1.45, zoomStufen: number[] = PRUEF_ZOOM,
): Record<string, { dx: number; dy: number }> {
  const h = groesse * 1.12; // line-height der .karten-name (bestimmt, wo die Zeilen stehen)
  // Der Kasten der Schrift selbst (Ober- bis Unterlaenge) ist hoeher als die Zeile - er darf den der Nachbarstelle nicht beruehren.
  const kasten = groesse * kastenEm;
  const pad = 0.45; // paddingBlock der Beschriftung (calc(0.45cqw / var(--z)))
  const abstandY = groesse * 0.18, abstandX = groesse * 0.45;
  const liste = beschriftungen.filter((b) => b.zeilen.length);
  /** Mitten der Zeilen auf Zoomstufe z, in Bildschirm-Einheiten (z * Kartenprozent), ohne Versatz. */
  const mitten = liste.map((b) => zoomStufen.map((z) => {
    const n = b.zeilen.length;
    return b.zeilen.map((zl, i) => {
      let y: number;
      if (!b.verteilt || n === 1) y = z * (b.oben + b.hoehe / 2) + (i - (n - 1) / 2) * h;
      else y = z * b.oben + pad + h / 2 + i * (h + Math.max(0, z * b.hoehe - 2 * pad - n * h) / (n - 1));
      return { x: z * zl.x, y, w: zl.breite };
    });
  }));
  const d = liste.map(() => ({ dx: 0, dy: 0 }));
  const basis = mitten.map((m) => m[0]);
  for (let runde = 0; runde < 250; runde++) {
    let bewegt = false;
    for (let a = 0; a < liste.length; a++) for (let b = a + 1; b < liste.length; b++) {
      // Was braucht dieses Paar auf seiner schlimmsten Stufe? Je Achse der noetige Weg; die Richtung kommt aus der Lage ohne Versatz.
      // Je Achse und Richtung getrennt: liegt eine Zeile der einen Stelle zwischen zwei Zeilen der anderen (ein Name neben einer roten Stelle mit
      // Namen oben und unten), geht es senkrecht in keine Richtung - dann waagrecht.
      const yNach = [0, 0], xNach = [0, 0];
      for (let s = 0; s < zoomStufen.length; s++) {
        const za = mitten[a][s], zb = mitten[b][s];
        for (let i = 0; i < za.length; i++) for (let j = 0; j < zb.length; j++) {
          const p = za[i], q = zb[j];
          const ex = (q.x + d[b].dx) - (p.x + d[a].dx), ey = (q.y + d[b].dy) - (p.y + d[a].dy);
          const brauchtX = (p.w + q.w) / 2 + abstandX, brauchtY = kasten + abstandY;
          if (Math.abs(ex) >= brauchtX - 1e-6 || Math.abs(ey) >= brauchtY - 1e-6) continue;
          const bx = basis[b][j].x - basis[a][i].x, by = basis[b][j].y - basis[a][i].y;
          const rx = Math.abs(bx) > 1e-6 ? Math.sign(bx) : 1;
          const ry = Math.abs(by) > 1e-6 ? Math.sign(by) : 1;
          // Weg bis zur Trennung in der festen Richtung (Reihenfolge wie ohne Versatz).
          const wegY = brauchtY - ry * ey, wegX = brauchtX - rx * ex;
          const iy = ry > 0 ? 1 : 0, ix = rx > 0 ? 1 : 0;
          yNach[iy] = Math.max(yNach[iy], wegY);
          xNach[ix] = Math.max(xNach[ix], wegX);
        }
      }
      if (!yNach[0] && !yNach[1] && !xNach[0] && !xNach[1]) continue;
      bewegt = true;
      const yGeht = !(yNach[0] && yNach[1]), xGeht = !(xNach[0] && xNach[1]);
      const sY = yNach[1] ? 1 : -1, nY = Math.max(yNach[0], yNach[1]);
      const sX = xNach[1] ? 1 : -1, nX = Math.max(xNach[0], xNach[1]);
      const ga = liste[a].zeilen.length, gb = liste[b].zeilen.length;
      const anteilA = gb / (ga + gb), anteilB = ga / (ga + gb);
      if (yGeht && (!xGeht || nY <= nX * 2)) {
        const weg = nY * 1.0005 + 1e-4;
        d[a].dy -= sY * weg * anteilA; d[b].dy += sY * weg * anteilB;
      } else {
        const weg = nX * 1.0005 + 1e-4;
        d[a].dx -= sX * weg * anteilA; d[b].dx += sX * weg * anteilB;
      }
    }
    if (!bewegt) break;
  }
  const raus: Record<string, { dx: number; dy: number }> = {};
  liste.forEach((b, i) => { if (d[i].dx || d[i].dy) raus[b.id] = { dx: d[i].dx, dy: d[i].dy }; });
  return raus;
}
