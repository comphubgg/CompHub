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
  /** Rahmen der Stelle (oben, Hoehe, Breite), wie {@link rahmen}. */
  oben: number; hoehe: number; breite: number;
  /** true: die Zeilen sind ueber die Stelle verteilt (mehrere Teams, justify space-between); false: dicht in der Mitte. */
  verteilt: boolean;
  /** Je Zeile: ihre waagrechte Mitte auf der Karte und die Breite des Textes. */
  zeilen: Array<{ x: number; breite: number }>;
}

/**
 * Der Versatz einer Beschriftung: mx/my fest auf der Karte (translate in cqw - waechst mit dem Zoom mit), dx/dy in Bildschirmmass
 * (translate in cqw / var(--z) - bleibt auf jeder Zoomstufe gleich gross, wie die Schrift). Alles in Prozent der Kartenbreite bei Zoom 1.
 */
export interface Versatz { mx: number; my: number; dx: number; dy: number }

/** Die Zoomstufen, auf denen geprueft wird - die Schrift waechst nicht mit (calc(... / var(--z))), die Abstaende der Stellen schon. */
const PRUEF_ZOOM = [1, 1.12, 1.25, 1.4, 1.6, 1.8, 2, 2.4, 2.8, 3.4, 4, 5, 6.5, 8];

/**
 * Die Mitten der Zeilen einer Beschriftung auf Zoomstufe z, in Bildschirm-Einheiten (z * Kartenprozent), ohne Versatz - wie die Karte sie setzt
 * (line-height 1.12, paddingBlock 0.45cqw / var(--z)). Geteilt zwischen dem Loeser und dem kopierten Kartenbild (Bausteine.Karte, alsBild).
 */
export function zeilenMitten(b: Beschriftung, groesse: number, z: number): Array<{ x: number; y: number; w: number }> {
  const h = groesse * 1.12, pad = 0.45;
  const n = b.zeilen.length;
  return b.zeilen.map((zl, i) => {
    let y: number;
    if (!b.verteilt || n === 1) y = z * (b.oben + b.hoehe / 2) + (i - (n - 1) / 2) * h;
    else y = z * b.oben + pad + h / 2 + i * (h + Math.max(0, z * b.hoehe - 2 * pad - n * h) / (n - 1));
    return { x: z * zl.x, y, w: zl.breite };
  });
}

/** Wie viele Paare von Namenskaesten (Mitte x/y, Breite w, Hoehe hk) verschiedener Stellen sich ueberdecken - zum Pruefen des Kartenbilds. */
export function ueberdeckungen(kaesten: Array<{ id: string; x: number; y: number; w: number; hk: number }>): Array<[string, string]> {
  const raus: Array<[string, string]> = [];
  for (let a = 0; a < kaesten.length; a++) for (let b = a + 1; b < kaesten.length; b++) {
    const p = kaesten[a], q = kaesten[b];
    if (p.id === q.id) continue;
    if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.hk + q.hk) / 2) raus.push([p.id, q.id]);
  }
  return raus;
}

/**
 * Wo die Namen verschiedener Stellen einander ueberdecken, werden die Beschriftungen auseinandergesetzt (Betreiber, 15.11.2026: "KING NOVA" und
 * "LXRS" lagen auf zwei benachbarten Stellen genau uebereinander - "ein bisschen auseinander wie bei Noble"; danach zu T3ENY / CHICO: "da koennen
 * die Spieler schon nebeneinander sein. Mittig. Das sieht sogar clean aus" - also nicht schraeg versetzt).
 *
 * 1. Gruppen: Stellen mit nur einer Zeile, deren Namen sich ueberdecken, werden zu einer Gruppe zusammengefasst und mittig auf die Mitte ihrer
 *    Mitten gesetzt - nebeneinander auf einer Linie, mit kleinem Abstand, in der Reihenfolge, in der die Stellen liegen. Nur wenn die Reihe
 *    andere Namen trifft oder zu breit wird (ueber das Doppelte der breitesten Stelle), stehen sie untereinander, ebenfalls mittig (nie schraeg).
 *    Dieser Versatz ist fest auf der Karte: beim Zoomen bleibt die Gruppe ausgerichtet, die Schrift wird relativ kleiner, die Luecken groesser.
 * 2. Was dann noch kollidiert (etwa ein Name neben einer roten Stelle mit mehreren Zeilen), wird in Bildschirmmass auseinandergeschoben:
 *    gerechnet in cqw bei Zoom 1 - die Schrift ist auf jeder Zoomstufe gleich gross, die Stellen liegen z-mal so weit auseinander -, geprueft
 *    auf jeder Stufe von 1 bis ZOOM_MAX, immer in der Richtung, in der die Namen ohnehin zueinander liegen (die Reihenfolge kehrt sich nie um).
 *    Liegt eine Zeile zwischen zwei Zeilen der anderen Stelle, geht es waagrecht. Die Stelle mit mehr Zeilen bewegt sich weniger.
 * Deterministisch; Stellen ohne Konflikt bleiben, wo sie sind.
 *
 * kastenEm: Hoehe des Schriftkastens (Ober- bis Unterlaenge) je Schriftgroesse, in der Kartenschrift gemessen.
 *
 * Zurueck: je Stelle mit Versatz der {@link Versatz}.
 */
export function beschriftungsVersatz(
  beschriftungen: Beschriftung[], groesse: number, kastenEm = 1.45, zoomStufen: number[] = PRUEF_ZOOM,
): Record<string, Versatz> {

  // Der Kasten der Schrift selbst (Ober- bis Unterlaenge) ist hoeher als die Zeile - er darf den der Nachbarstelle nicht beruehren.
  const kasten = groesse * kastenEm;
  const abstandY = groesse * 0.18, abstandX = groesse * 0.45;
  const brauchtY = kasten + abstandY;
  const liste = beschriftungen.filter((b) => b.zeilen.length);
  /** Mitten der Zeilen auf Zoomstufe z, in Bildschirm-Einheiten (z * Kartenprozent), ohne Versatz. */
  const mitten = liste.map((b) => zoomStufen.map((z) => zeilenMitten(b, groesse, z)));
  const fest = liste.map(() => ({ x: 0, y: 0 }));
  const d = liste.map(() => ({ dx: 0, dy: 0 }));
  const trifft = (p: { x: number; y: number; w: number }, q: { x: number; y: number; w: number }) =>
    Math.abs(q.x - p.x) < (p.w + q.w) / 2 + abstandX - 1e-6 && Math.abs(q.y - p.y) < brauchtY - 1e-6;

  // 1. Gruppen aus Stellen mit einer Zeile (bei Zoom 1, wo es am engsten ist).
  const z1 = mitten.map((m) => m[0]);
  const einzeln = liste.map((b, i) => i).filter((i) => liste[i].zeilen.length === 1);
  const wurzel = liste.map((_, i) => i);
  const finde = (i: number): number => (wurzel[i] === i ? i : (wurzel[i] = finde(wurzel[i])));
  for (const a of einzeln) for (const b of einzeln) {
    if (b > a && trifft(z1[a][0], z1[b][0])) wurzel[Math.max(finde(a), finde(b))] = Math.min(finde(a), finde(b));
  }
  const gruppen = new Map<number, number[]>();
  for (const i of einzeln) { const r = finde(i); gruppen.set(r, [...(gruppen.get(r) ?? []), i]); }
  const lage = (i: number) => z1[i].map((p) => ({ x: p.x + fest[i].x, y: p.y + fest[i].y, w: p.w }));
  for (const glieder of gruppen.values()) {
    if (glieder.length < 2 || glieder.length > 5) continue;
    const mx = glieder.reduce((s, i) => s + z1[i][0].x, 0) / glieder.length;
    const my = glieder.reduce((s, i) => s + z1[i][0].y, 0) / glieder.length;
    /** Wie viele Zeilen anderer Stellen eine Anordnung trifft. */
    const stoert = (ziel: Map<number, { x: number; y: number }>) => liste.reduce((n, _, k) => (ziel.has(k) ? n
      : n + lage(k).filter((q) => [...ziel].some(([i, p]) => trifft({ ...p, w: z1[i][0].w }, q))).length), 0);
    // Nebeneinander, in der Reihenfolge von links nach rechts.
    const quer = [...glieder].sort((a, b) => z1[a][0].x - z1[b][0].x || z1[a][0].y - z1[b][0].y || a - b);
    const gesamt = quer.reduce((s, i) => s + z1[i][0].w, 0) + abstandX * (quer.length - 1) + 1e-3;
    const nebeneinander = new Map<number, { x: number; y: number }>();
    let links = mx - gesamt / 2;
    for (const i of quer) { const w = z1[i][0].w + 1e-3 / quer.length; nebeneinander.set(i, { x: links + w / 2, y: my }); links += w + abstandX; }
    // Zu breit ist die Reihe erst, wenn sie ueber anderthalbmal so breit wird wie die Stellen der Gruppe zusammen (von der linken bis zur rechten).
    const spanne = Math.max(...glieder.map((i) => z1[i][0].x + liste[i].breite / 2)) - Math.min(...glieder.map((i) => z1[i][0].x - liste[i].breite / 2));
    const zuBreit = gesamt > 1.5 * spanne;
    let wahl = nebeneinander;
    const querStoert = stoert(nebeneinander);
    if (zuBreit || querStoert) {
      // Untereinander, in der Reihenfolge von oben nach unten, mittig.
      const hoch = [...glieder].sort((a, b) => z1[a][0].y - z1[b][0].y || z1[a][0].x - z1[b][0].x || a - b);
      const untereinander = new Map<number, { x: number; y: number }>();
      hoch.forEach((i, k) => untereinander.set(i, { x: mx, y: my + (k - (hoch.length - 1) / 2) * (brauchtY + 1e-3) }));
      if (zuBreit || stoert(untereinander) < querStoert) wahl = untereinander;
    }
    for (const [i, p] of wahl) fest[i] = { x: p.x - z1[i][0].x, y: p.y - z1[i][0].y };
  }

  // 2. Was noch kollidiert, in Bildschirmmass auseinanderschieben (auf jeder Zoomstufe).
  const pos = mitten.map((m, i) => m.map((zeilen, s) => zeilen.map((p) => ({
    x: p.x + zoomStufen[s] * fest[i].x, y: p.y + zoomStufen[s] * fest[i].y, w: p.w,
  }))));
  const basis = pos.map((m) => m[0]);
  for (let runde = 0; runde < 250; runde++) {
    let bewegt = false;
    for (let a = 0; a < liste.length; a++) for (let b = a + 1; b < liste.length; b++) {
      // Was braucht dieses Paar auf seiner schlimmsten Stufe? Je Achse und Richtung der noetige Weg; die Richtung kommt aus der Lage ohne
      // diesen Versatz. Liegt eine Zeile der einen Stelle zwischen zwei Zeilen der anderen, geht es senkrecht in keine Richtung - dann waagrecht.
      const yNach = [0, 0], xNach = [0, 0];
      // Liegen Zeilen der anderen Stelle, die waagrecht im Weg sind, ober- UND unterhalb (auch wenn gerade nur eine trifft), fuehrt senkrechtes
      // Schieben nur hin und her - dann gilt die Achse als versperrt. Ebenso waagrecht.
      const ySeiten = [false, false], xSeiten = [false, false];
      for (let s = 0; s < zoomStufen.length; s++) {
        const za = pos[a][s], zb = pos[b][s];
        for (let i = 0; i < za.length; i++) for (let j = 0; j < zb.length; j++) {
          const p = za[i], q = zb[j];
          const ex = (q.x + d[b].dx) - (p.x + d[a].dx), ey = (q.y + d[b].dy) - (p.y + d[a].dy);
          const brauchtX = (p.w + q.w) / 2 + abstandX;
          const by = basis[b][j].y - basis[a][i].y, bx = basis[b][j].x - basis[a][i].x;
          if (Math.abs(ex) < brauchtX && Math.abs(ey) < 3 * brauchtY) ySeiten[by > 1e-6 ? 1 : by < -1e-6 ? 0 : 1] = true;
          if (Math.abs(ey) < brauchtY && Math.abs(ex) < 3 * brauchtX) xSeiten[bx > 1e-6 ? 1 : bx < -1e-6 ? 0 : 1] = true;
        }
      }
      for (let s = 0; s < zoomStufen.length; s++) {
        const za = pos[a][s], zb = pos[b][s];
        for (let i = 0; i < za.length; i++) for (let j = 0; j < zb.length; j++) {
          const p = za[i], q = zb[j];
          const ex = (q.x + d[b].dx) - (p.x + d[a].dx), ey = (q.y + d[b].dy) - (p.y + d[a].dy);
          const brauchtX = (p.w + q.w) / 2 + abstandX;
          if (Math.abs(ex) >= brauchtX - 1e-6 || Math.abs(ey) >= brauchtY - 1e-6) continue;
          const bx = basis[b][j].x - basis[a][i].x, by = basis[b][j].y - basis[a][i].y;
          const rx = Math.abs(bx) > 1e-6 ? Math.sign(bx) : 1;
          const ry = Math.abs(by) > 1e-6 ? Math.sign(by) : 1;
          const wegY = brauchtY - ry * ey, wegX = brauchtX - rx * ex;
          const iy = ry > 0 ? 1 : 0, ix = rx > 0 ? 1 : 0;
          yNach[iy] = Math.max(yNach[iy], wegY);
          xNach[ix] = Math.max(xNach[ix], wegX);
        }
      }
      if (!yNach[0] && !yNach[1] && !xNach[0] && !xNach[1]) continue;
      bewegt = true;
      const yGeht = !(yNach[0] && yNach[1]) && !(ySeiten[0] && ySeiten[1]);
      const xGeht = !(xNach[0] && xNach[1]) && !(xSeiten[0] && xSeiten[1]);
      const sY = yNach[1] ? 1 : -1, nY = Math.max(yNach[0], yNach[1]);
      const sX = xNach[1] ? 1 : -1, nX = Math.max(xNach[0], xNach[1]);
      const ga = liste[a].zeilen.length, gb = liste[b].zeilen.length;
      const anteilA = gb / (ga + gb), anteilB = ga / (ga + gb);
      // Kommt es nach vielen Runden nicht zur Ruhe (zwei Nachbarn schieben waagrecht gegeneinander), wird senkrecht getrennt, wo es geht.
      if (yGeht && (!xGeht || nY <= nX * 2 || runde >= 80)) {
        const weg = nY * 1.0005 + 1e-4;
        d[a].dy -= sY * weg * anteilA; d[b].dy += sY * weg * anteilB;
      } else {
        const weg = nX * 1.0005 + 1e-4;
        d[a].dx -= sX * weg * anteilA; d[b].dx += sX * weg * anteilB;
      }
    }
    if (!bewegt) break;
  }
  const raus: Record<string, Versatz> = {};
  liste.forEach((b, i) => {
    if (fest[i].x || fest[i].y || d[i].dx || d[i].dy) raus[b.id] = { mx: fest[i].x, my: fest[i].y, dx: d[i].dx, dy: d[i].dy };
  });
  return raus;
}
