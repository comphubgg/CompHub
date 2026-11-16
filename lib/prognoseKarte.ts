/*
 * Geometrie fuer Turnierkarten mit Formen - geteilt zwischen dem
 * Admin-Werkzeug (app/admin/prognosen) und der oeffentlichen Prognoseseite
 * (app/prognosen). Die Formen sind Polygone in Prozent der Kartenbreite
 * und -hoehe; die Beschriftung sitzt in der Form, nicht in ihrem Rahmen.
 */

export interface Punkt { x: number; y: number }

export interface Spot {
  id: string; form: string; punkte: Punkt[]; name?: string; farbe?: string;
  /** Woher die Form stammt - siehe lib/kartenQuelle (Noble wird genannt, Vital nicht). */
  quelle?: string;
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


/** Liegt der Punkt in der Form? (Strahlprobe) */
export function imPolygon(p: Punkt, ecken: Punkt[]): boolean {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Abstand eines Punkts zum Rand der Form. */
function randAbstand(p: Punkt, ecken: Punkt[]): number {
  let min = Infinity;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[j], b = ecken[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return min;
}

/** Ist die Form ein achsenparalleles Rechteck (vier Ecken, zwei x- und zwei y-Werte)? */
export function istRechteck(punkte: Punkt[]): boolean {
  return punkte.length === 4 && new Set(punkte.map((q) => q.x)).size === 2 && new Set(punkte.map((q) => q.y)).size === 2;
}

/**
 * Die sichtbare Mitte einer Stelle - dort steht ihr Name, wenn nichts im Weg ist (Betreiber, 15.11.2026: "CHAP" stand unten links in seinem
 * Rechteck, "KAAN" am rechten Rand seiner L-Form; bei der Referenz steht jeder Name genau mittig in seiner Stelle, auf jeder Zoomstufe).
 * Rechteck: genau die Mitte. Sonst der Schwerpunkt der Flaeche, wenn er gut innen liegt (mindestens 70 % des groesstmoeglichen Randabstands),
 * sonst der Punkt mit dem groessten Abstand zum Rand (bei L-Formen und schmalen Haken liegt der Schwerpunkt am Rand oder ausserhalb).
 * Die Mitte des umschliessenden Rahmens taugt dafuer nicht: bei einer L-Form liegt sie in der Ecke.
 */
export function anker(punkte: Punkt[]): Punkt {
  const r = rahmen(punkte);
  if (!punkte.length) return { x: 50, y: 50 };
  if (istRechteck(punkte) || r.breite <= 0 || r.hoehe <= 0) return { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 };
  // Groesster Randabstand auf einem Raster. Bei langen Formen gibt es davon eine ganze Linie (die Mittelachse) - genommen wird deren Mitte:
  // der Durchschnitt aller Punkte, die fast so weit vom Rand weg sind wie der beste (mindestens 92 %).
  const N = 64;
  const punkteD: Array<{ p: Punkt; d: number }> = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = { x: r.links + (r.breite * i) / N, y: r.oben + (r.hoehe * j) / N };
    if (imPolygon(p, punkte)) punkteD.push({ p, d: randAbstand(p, punkte) });
  }
  const bestD = Math.max(-1, ...punkteD.map((q) => q.d));
  let best: Punkt | null = null;
  if (bestD > 0) {
    const nah = punkteD.filter((q) => q.d >= 0.92 * bestD);
    const m = { x: nah.reduce((s, q) => s + q.p.x, 0) / nah.length, y: nah.reduce((s, q) => s + q.p.y, 0) / nah.length };
    // Liegt die Mitte der Achse selbst gut innen (bei einem Bogen nicht), dann sie, sonst der naechste Punkt der Achse.
    best = imPolygon(m, punkte) && randAbstand(m, punkte) >= 0.85 * bestD ? m
      : nah.reduce((x, q) => (Math.hypot(q.p.x - m.x, q.p.y - m.y) < Math.hypot(x.p.x - m.x, x.p.y - m.y) ? q : x)).p;
  }
  // Schwerpunkt der Flaeche (Gauss'sche Trapezformel).
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const p = punkte[j], q = punkte[i], k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  const schwer = Math.abs(a) > 1e-9 ? { x: cx / (3 * a), y: cy / (3 * a) } : null;
  if (!best) return schwer ?? { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 };
  if (schwer && imPolygon(schwer, punkte) && randAbstand(schwer, punkte) >= 0.7 * bestD) return schwer;
  return best;
}

/**
 * Eine Beschriftung (alle Namen einer Stelle) fuer den Loeser ({@link versatzBei}, {@link versatzTabelle}). Alle Masse in Prozent der
 * Kartenbreite bei Zoom 1. Die Namen einer Stelle bewegen sich nur gemeinsam - untereinander bleiben sie, wie sie sind.
 */
export interface Beschriftung {
  id: string;
  /** Rahmen der Stelle (oben, Hoehe, Breite), wie {@link rahmen}. */
  oben: number; hoehe: number; breite: number;
  /** Die sichtbare Mitte der Stelle ({@link anker}) - dort steht der Block, wenn die Zeilen nicht verteilt sind. */
  ax: number; ay: number;
  /** true: die Zeilen sind ueber die Stelle verteilt (mehrere Teams, justify space-between); false: dicht um die Mitte. */
  verteilt: boolean;
  /** Je Zeile: ihre waagrechte Mitte auf der Karte und die Breite des Textes (Bildschirmmass, wie die Schrift). */
  zeilen: Array<{ x: number; breite: number }>;
  /** Die Form selbst - ein ausweichender Name bleibt in ihr, wo es geht. */
  punkte?: Punkt[];
}

/** Ein Versatz in Bildschirmmass (Prozent der Kartenbreite bei Zoom 1; auf der Karte translate: x cqw / var(--z)). */
export interface Versatz { x: number; y: number }

/**
 * Die Mitten der Zeilen einer Beschriftung auf Zoomstufe z, in Bildschirm-Einheiten (z * Kartenprozent), ohne Versatz - wie die Karte sie setzt
 * (line-height 1.12, paddingBlock 0.45cqw / var(--z)). Geteilt zwischen dem Loeser und dem kopierten Kartenbild (Bausteine.Karte, alsBild).
 */
export function zeilenMitten(b: Beschriftung, groesse: number, z: number): Array<{ x: number; y: number; w: number }> {
  const h = groesse * 1.12, pad = 0.45;
  const n = b.zeilen.length;
  return b.zeilen.map((zl, i) => {
    let y: number;
    if (!b.verteilt || n === 1) y = z * b.ay + (i - (n - 1) / 2) * h;
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
 * Wo die Namen verschiedener Stellen einander auf DIESER Zoomstufe ueberdecken, werden die Beschriftungen auseinandergesetzt - sonst steht jeder
 * Name genau auf der Mitte seiner Stelle (Betreiber, 15.11.2026: "KING NOVA" / "LXRS" ineinander - "ein bisschen auseinander wie bei Noble";
 * T3ENY / CHICO "nebeneinander, mittig"; danach: gezoomt muessen die Namen wieder genau mittig stehen, wie bei der Referenz - "CHAP" und "KAAN"
 * blieben auch weit hineingezoomt verschoben, weil der Versatz fuer die engste Stufe berechnet und auf jeder Stufe gleich gross angewandt wurde).
 *
 * Gerechnet in Bildschirm-Einheiten auf Stufe z: die Schrift ist auf jeder Stufe gleich gross, die Stellen liegen z-mal so weit auseinander.
 * 1. Gruppen: Stellen mit einer Zeile, deren Namen sich hier ueberdecken, stehen nebeneinander (in ihrer Reihenfolge von links nach rechts), nur
 *    so weit auseinander, wie noetig, und - je enger es ist, desto mehr - auf einer gemeinsamen Hoehe. Untereinander nur, wenn die Reihe andere
 *    Namen trifft oder zu breit wird. Lassen die Stellen genug Platz, ist der Versatz 0.
 * 2. Was dann noch kollidiert (etwa ein Name neben einer roten Stelle mit mehreren Zeilen), wird auseinandergeschoben, in der Richtung, in der die
 *    Namen ohnehin zueinander liegen (die Reihenfolge kehrt sich nie um). Die Stelle mit mehr Zeilen bewegt sich weniger.
 * 3. Ein verschobener Name bleibt in seiner Stelle, wo es geht: liegt seine Mitte ausserhalb, rueckt er so weit zur Mitte zurueck, wie es ohne neue
 *    Ueberdeckung geht.
 * Deterministisch; Stellen ohne Konflikt bleiben, wo sie sind.
 *
 * kastenEm: Hoehe des Schriftkastens (Ober- bis Unterlaenge) je Schriftgroesse, in der Kartenschrift gemessen.
 */
export function versatzBei(beschriftungen: Beschriftung[], groesse: number, kastenEm: number, z: number): Record<string, Versatz> {
  // Der Kasten der Schrift selbst (Ober- bis Unterlaenge) ist hoeher als die Zeile - er darf den der Nachbarstelle nicht beruehren.
  const kasten = groesse * kastenEm;
  const abstandY = groesse * 0.18, abstandX = groesse * 0.45;
  const brauchtY = kasten + abstandY;
  const liste = beschriftungen.filter((b) => b.zeilen.length);
  const basis = liste.map((b) => zeilenMitten(b, groesse, z));
  const o = liste.map(() => ({ x: 0, y: 0 }));
  const lage = (i: number, v = o[i]) => basis[i].map((p) => ({ x: p.x + v.x, y: p.y + v.y, w: p.w }));
  const trifft = (p: { x: number; y: number; w: number }, q: { x: number; y: number; w: number }) =>
    Math.abs(q.x - p.x) < (p.w + q.w) / 2 + abstandX - 1e-6 && Math.abs(q.y - p.y) < brauchtY - 1e-6;

  // 1. Gruppen aus Stellen mit einer Zeile, die sich auf dieser Stufe ueberdecken.
  const einzeln = liste.map((_, i) => i).filter((i) => liste[i].zeilen.length === 1);
  const wurzel = liste.map((_, i) => i);
  const finde = (i: number): number => (wurzel[i] === i ? i : (wurzel[i] = finde(wurzel[i])));
  for (const a of einzeln) for (const b of einzeln) {
    if (b > a && trifft(basis[a][0], basis[b][0])) wurzel[Math.max(finde(a), finde(b))] = Math.min(finde(a), finde(b));
  }
  const gruppen = new Map<number, number[]>();
  for (const i of einzeln) { const r = finde(i); gruppen.set(r, [...(gruppen.get(r) ?? []), i]); }
  for (const glieder of gruppen.values()) {
    if (glieder.length < 2 || glieder.length > 5) continue;
    const p0 = (i: number) => basis[i][0];
    const mx = glieder.reduce((s, i) => s + p0(i).x, 0) / glieder.length;
    const my = glieder.reduce((s, i) => s + p0(i).y, 0) / glieder.length;
    /** Wie viele Zeilen anderer Stellen eine Anordnung trifft. */
    const stoert = (ziel: Map<number, Versatz>) => liste.reduce((n, _, k) => (ziel.has(k) ? n
      : n + lage(k).filter((q) => [...ziel].some(([i, v]) => trifft({ x: p0(i).x + v.x, y: p0(i).y + v.y, w: p0(i).w }, q))).length), 0);
    /**
     * Auf einer Achse der Reihe nach so weit auseinander, wie noetig (nie naeher zusammen, als sie ohnehin liegen), dann alle gemeinsam
     * zurueck, damit sich die Gruppe im Mittel nicht verschiebt. Quer dazu ruecken sie auf eine Linie, je mehr, je enger es ist:
     * stehen sie fast schon frei, bleiben sie fast, wo sie sind - so waechst der Versatz beim Zoomen stetig auf 0 zu.
     */
    const reihe = (achse: 'x' | 'y') => {
      const quer = achse === 'x' ? 'y' : 'x';
      const folge = [...glieder].sort((a, b) => p0(a)[achse] - p0(b)[achse] || p0(a)[quer] - p0(b)[quer] || a - b);
      const noetig = (a: number, b: number) => (achse === 'x' ? (p0(a).w + p0(b).w) / 2 + abstandX : brauchtY) + 1e-3;
      const neu = new Map<number, number>();
      let enge = 0;
      folge.forEach((i, k) => {
        if (!k) { neu.set(i, p0(i)[achse]); return; }
        const vor = folge[k - 1], n = noetig(vor, i);
        enge = Math.max(enge, (n - (p0(i)[achse] - p0(vor)[achse])) / n);
        neu.set(i, Math.max(p0(i)[achse], neu.get(vor)! + n));
      });
      const schub = folge.reduce((s, i) => s + neu.get(i)! - p0(i)[achse], 0) / folge.length;
      const ausrichten = Math.max(0, Math.min(1, enge / 0.35));
      const mq = achse === 'x' ? my : mx;
      const raus = new Map<number, Versatz>();
      for (const i of folge) {
        const d = neu.get(i)! - schub - p0(i)[achse], dq = ausrichten * (mq - p0(i)[quer]);
        raus.set(i, achse === 'x' ? { x: d, y: dq } : { x: dq, y: d });
      }
      return raus;
    };
    const nebeneinander = reihe('x');
    // Zu breit ist die Reihe erst, wenn sie ueber anderthalbmal so breit wird wie die Stellen der Gruppe zusammen (von der linken bis zur rechten).
    const links = Math.min(...glieder.map((i) => p0(i).x + nebeneinander.get(i)!.x - p0(i).w / 2));
    const rechts = Math.max(...glieder.map((i) => p0(i).x + nebeneinander.get(i)!.x + p0(i).w / 2));
    const spanne = Math.max(...glieder.map((i) => p0(i).x + (z * liste[i].breite) / 2)) - Math.min(...glieder.map((i) => p0(i).x - (z * liste[i].breite) / 2));
    const zuBreit = rechts - links > 1.5 * spanne;
    let wahl = nebeneinander;
    const querStoert = stoert(nebeneinander);
    if (zuBreit || querStoert) {
      const untereinander = reihe('y');
      if (zuBreit || stoert(untereinander) < querStoert) wahl = untereinander;
    }
    for (const [i, v] of wahl) o[i] = { ...v };
  }

  // 2. Was noch kollidiert, auseinanderschieben. Die Richtung kommt aus der Lage ohne Versatz.
  for (let runde = 0; runde < 250; runde++) {
    let bewegt = false;
    for (let a = 0; a < liste.length; a++) for (let b = a + 1; b < liste.length; b++) {
      const za = lage(a), zb = lage(b);
      const yNach = [0, 0], xNach = [0, 0];
      // Liegen Zeilen der anderen Stelle, die waagrecht im Weg sind, ober- UND unterhalb, fuehrt senkrechtes Schieben nur hin und her - dann
      // gilt die Achse als versperrt. Ebenso waagrecht.
      const ySeiten = [false, false], xSeiten = [false, false];
      for (let i = 0; i < za.length; i++) for (let j = 0; j < zb.length; j++) {
        const p = za[i], q = zb[j];
        const ex = q.x - p.x, ey = q.y - p.y;
        const brauchtX = (p.w + q.w) / 2 + abstandX;
        const by = basis[b][j].y - basis[a][i].y, bx = basis[b][j].x - basis[a][i].x;
        if (Math.abs(ex) < brauchtX && Math.abs(ey) < 3 * brauchtY) ySeiten[by > 1e-6 ? 1 : by < -1e-6 ? 0 : 1] = true;
        if (Math.abs(ey) < brauchtY && Math.abs(ex) < 3 * brauchtX) xSeiten[bx > 1e-6 ? 1 : bx < -1e-6 ? 0 : 1] = true;
        if (Math.abs(ex) >= brauchtX - 1e-6 || Math.abs(ey) >= brauchtY - 1e-6) continue;
        const rx = Math.abs(bx) > 1e-6 ? Math.sign(bx) : 1;
        const ry = Math.abs(by) > 1e-6 ? Math.sign(by) : 1;
        yNach[ry > 0 ? 1 : 0] = Math.max(yNach[ry > 0 ? 1 : 0], brauchtY - ry * ey);
        xNach[rx > 0 ? 1 : 0] = Math.max(xNach[rx > 0 ? 1 : 0], brauchtX - rx * ex);
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
        o[a].y -= sY * weg * anteilA; o[b].y += sY * weg * anteilB;
      } else {
        const weg = nX * 1.0005 + 1e-4;
        o[a].x -= sX * weg * anteilA; o[b].x += sX * weg * anteilB;
      }
    }
    if (!bewegt) break;
  }

  // 3. In der eigenen Stelle bleiben, wo es geht.
  const frei = (i: number, v: Versatz) => {
    const meine = lage(i, v);
    return liste.every((_, k) => k === i || !lage(k).some((q) => meine.some((p) => trifft(p, q))));
  };
  liste.forEach((b, i) => {
    if (!b.punkte || (!o[i].x && !o[i].y)) return;
    const mitte = (v: Versatz) => {
      const ps = lage(i, v);
      return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length / z, y: ps.reduce((s, p) => s + p.y, 0) / ps.length / z };
    };
    if (imPolygon(mitte(o[i]), b.punkte)) return;
    for (let s = 0.95; s > 0.001; s -= 0.05) {
      const v = { x: o[i].x * s, y: o[i].y * s };
      if (imPolygon(mitte(v), b.punkte) && frei(i, v)) { o[i] = v; return; }
    }
  });

  const raus: Record<string, Versatz> = {};
  liste.forEach((b, i) => { if (Math.abs(o[i].x) > 1e-6 || Math.abs(o[i].y) > 1e-6) raus[b.id] = { x: o[i].x, y: o[i].y }; });
  return raus;
}

/** Der Versatz je Stelle auf einer Reihe von Zoomstufen - die Karte setzt beim Zoomen den Wert der aktuellen Stufe ({@link versatzFuer}). */
export interface VersatzTabelle { stufen: number[]; je: Record<string, Versatz[]> }

/** Ueberdecken sich Namen, wenn auf Stufe z der Versatz v gilt? */
function ueberdecktBei(liste: Beschriftung[], groesse: number, kastenEm: number, z: number, v: (id: string) => Versatz): boolean {
  const brauchtY = groesse * kastenEm + groesse * 0.18 * 0.5, abstandX = groesse * 0.45 * 0.5;
  const ks = liste.flatMap((b) => { const d = v(b.id); return zeilenMitten(b, groesse, z).map((p) => ({ id: b.id, x: p.x + d.x, y: p.y + d.y, w: p.w })); });
  for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) {
    const p = ks[a], q = ks[b];
    if (p.id !== q.id && Math.abs(p.x - q.x) < (p.w + q.w) / 2 + abstandX && Math.abs(p.y - q.y) < brauchtY) return true;
  }
  return false;
}

/**
 * Den Versatz fuer alle Zoomstufen von 1 bis zmax vorrechnen: auf einem dichten Raster (je 5 % naeher) jede Stufe fuer sich geloest, dazwischen wird
 * gleitend uebergeblendet. Wo das Ueberblenden zwischen zwei Stufen Namen ueberdecken wuerde, wird dazwischen noch eine Stufe geloest.
 */
export function versatzTabelle(beschriftungen: Beschriftung[], groesse: number, kastenEm = 1.45, zmax = 8): VersatzTabelle {
  const liste = beschriftungen.filter((b) => b.zeilen.length);
  const loesung = new Map<number, Record<string, Versatz>>();
  const loese = (z: number) => { let r = loesung.get(z); if (!r) { r = versatzBei(liste, groesse, kastenEm, z); loesung.set(z, r); } return r; };
  const raster: number[] = [];
  for (let z = 1; z < zmax - 1e-9; z *= 1.05) raster.push(z);
  raster.push(zmax);
  raster.forEach(loese);
  const nichts: Versatz = { x: 0, y: 0 };
  const verfeinere = (za: number, zb: number, tiefe: number) => {
    const zm = Math.sqrt(za * zb);
    const a = loese(za), b = loese(zb);
    const t = Math.log(zm / za) / Math.log(zb / za);
    const mix = (id: string) => { const p = a[id] ?? nichts, q = b[id] ?? nichts; return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };
    if (!ueberdecktBei(liste, groesse, kastenEm, zm, mix) || tiefe >= 4) return;
    loese(zm);
    verfeinere(za, zm, tiefe + 1); verfeinere(zm, zb, tiefe + 1);
  };
  for (let k = 1; k < raster.length; k++) verfeinere(raster[k - 1], raster[k], 0);
  const stufen = [...loesung.keys()].sort((p, q) => p - q);
  const je: Record<string, Versatz[]> = {};
  for (const b of liste) {
    const reihe = stufen.map((z) => loesung.get(z)![b.id] ?? nichts);
    if (reihe.some((v) => v.x || v.y)) je[b.id] = reihe;
  }
  return { stufen, je };
}

/** Der Versatz einer Stelle auf Zoomstufe z - zwischen zwei Stufen der Tabelle gleitend (im Verhaeltnis der Zoomstufen). */
export function versatzFuer(t: VersatzTabelle, id: string, z: number): Versatz {
  const reihe = t.je[id];
  if (!reihe) return { x: 0, y: 0 };
  const s = t.stufen;
  if (z <= s[0]) return reihe[0];
  if (z >= s[s.length - 1]) return reihe[s.length - 1];
  let k = 1;
  while (k < s.length - 1 && s[k] < z) k++;
  const u = Math.log(z / s[k - 1]) / Math.log(s[k] / s[k - 1]);
  const p = reihe[k - 1], q = reihe[k];
  return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
}
