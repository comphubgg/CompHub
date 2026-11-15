/*
 * Vitals Landepunkte gerade ziehen.
 *
 * Der Betreiber (15.11.2026): Vitals Formen sind oft leicht schiefe Vierecke oder Vielecke mit abgeschnittenen Ecken (ENTACHE, 3BO, HEROGOTY, CLDY im
 * Heat 2 in Middle East). Wo eine Form ebenso gut ein sauberes Rechteck sein kann - "von oben nach unten gerade gezogen" -, wird sie eins; wirklich
 * unregelmaessige Formen (ein langer Kuestenstreifen, ein L, eine Raute) bleiben 1:1, wie Vital sie fuehrt.
 *
 * Die Regel (fest, ohne Zufall - dieselben Ecken ergeben immer dasselbe Rechteck):
 *  1. Schon ein achsparalleles Rechteck (4 Ecken, 2 x-Werte, 2 y-Werte): bleibt.
 *  2. Kandidat ist eine Form mit hoechstens MAX_ECKEN Ecken, die fast konvex ist (Flaeche / Flaeche der konvexen Huelle >= MIN_KONVEX).
 *  3. Das Ersatz-Rechteck: achsparallel, mit demselben Schwerpunkt und derselben Flaeche wie die Form; das Seitenverhaeltnis kommt aus der Streuung der
 *     Flaeche in x und in y (beim echten Rechteck sind Breite = Wurzel(12 * Varianz x), Hoehe = Wurzel(12 * Varianz y) genau seine Seiten).
 *  4. Ersetzt wird nur, wenn Form und Rechteck sich decken: Schnitt / Vereinigung (IoU) >= MIN_DECKUNG. Eine Raute (45 Grad gedreht) oder ein langes
 *     schraeges Band erreicht das nicht und bleibt.
 *  5. Ueberdeckungen: das Rechteck darf keine Nachbarform staerker ueberdecken, als die alte Form es tat (Spielraum UEBERLAPP_SPIEL). Sonst wird die Kante,
 *     die in den Nachbarn ragt, zurueckgezogen - die, die am wenigsten Flaeche kostet. Bleibt dabei weniger als MIN_REST der Flaeche uebrig, bleibt die alte Form.
 *
 * Abgestimmt am 15.11.2026 an FNCS Solos Reload Heat 2 in Middle East, Ozeanien und NA Central: die vom Betreiber genannten Formen liegen bei IoU 0,78 bis 0,82,
 * die unregelmaessigen (K3Q, SOMIN, RAZ, AIDEN, FLUID) bei 0,59 bis 0,70.
 */

export interface P { x: number; y: number }

export const MAX_ECKEN = 8;
export const MIN_KONVEX = 0.9;
export const MIN_DECKUNG = 0.75;
export const MIN_REST = 0.6;
/** In Quadratprozent der Karte - nur Rechenungenauigkeit; die Rundung der Ecken auf zwei Nachkommastellen ist in der Pruefung schon enthalten. */
const UEBERLAPP_SPIEL = 1e-4;

export const istRechteck = (p: P[]) => p.length === 4 && new Set(p.map((q) => q.x)).size === 2 && new Set(p.map((q) => q.y)).size === 2;

function flaeche(p: P[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

function huelle(p: P[]): P[] {
  const pts = [...new Map(p.map((q) => [`${q.x},${q.y}`, q])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const kreuz = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const unten: P[] = []; const oben: P[] = [];
  for (const q of pts) { while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 0) unten.pop(); unten.push(q); }
  for (const q of [...pts].reverse()) { while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 0) oben.pop(); oben.push(q); }
  return [...unten.slice(0, -1), ...oben.slice(0, -1)];
}

/** Flaeche, Schwerpunkt und Varianz der Flaeche in x und y (Polygon-Momente). */
function momente(p: P[]) {
  let a = 0, cx = 0, cy = 0, xx = 0, yy = 0;
  for (let i = 0; i < p.length; i++) {
    const { x: x0, y: y0 } = p[i]; const { x: x1, y: y1 } = p[(i + 1) % p.length];
    const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
  }
  a /= 2; cx /= 6 * a; cy /= 6 * a; xx /= 12 * a; yy /= 12 * a;
  return { flaeche: Math.abs(a), cx, cy, vx: xx - cx * cx, vy: yy - cy * cy };
}

interface Kasten { x0: number; y0: number; x1: number; y1: number }

/** Die Flaeche der Form innerhalb eines achsparallelen Kastens (Sutherland-Hodgman - der Kasten ist konvex, die Form darf es nicht sein). */
function schnittMitKasten(p: P[], k: Kasten): number {
  let pts = p;
  const kanten: Array<[(q: P) => boolean, (a: P, b: P) => P]> = [
    [(q) => q.x >= k.x0, (a, b) => ({ x: k.x0, y: a.y + ((k.x0 - a.x) * (b.y - a.y)) / (b.x - a.x) })],
    [(q) => q.x <= k.x1, (a, b) => ({ x: k.x1, y: a.y + ((k.x1 - a.x) * (b.y - a.y)) / (b.x - a.x) })],
    [(q) => q.y >= k.y0, (a, b) => ({ x: a.x + ((k.y0 - a.y) * (b.x - a.x)) / (b.y - a.y), y: k.y0 })],
    [(q) => q.y <= k.y1, (a, b) => ({ x: a.x + ((k.y1 - a.y) * (b.x - a.x)) / (b.y - a.y), y: k.y1 })],
  ];
  for (const [drin, schnitt] of kanten) {
    if (pts.length < 3) return 0;
    const raus: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (drin(b)) { if (!drin(a)) raus.push(schnitt(a, b)); raus.push(b); } else if (drin(a)) raus.push(schnitt(a, b));
    }
    pts = raus;
  }
  return pts.length >= 3 ? flaeche(pts) : 0;
}

const alsPunkte = (k: Kasten): P[] => {
  const r = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
  return [{ x: r(k.x0), y: r(k.y0) }, { x: r(k.x1), y: r(k.y0) }, { x: r(k.x1), y: r(k.y1) }, { x: r(k.x0), y: r(k.y1) }];
};

/** Die Schnittflaeche zweier Formen: genau, wenn eine davon ein achsparalleles Rechteck ist, sonst auf einem feinen Raster. */
function ueberdeckung(a: P[], b: P[]): number {
  if (istRechteck(a)) return schnittMitKasten(b, kastenVon(a));
  if (istRechteck(b)) return schnittMitKasten(a, kastenVon(b));
  return schnittAllgemein(a, b);
}
const kastenVon = (p: P[]): Kasten => ({ x0: Math.min(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), x1: Math.max(...p.map((q) => q.x)), y1: Math.max(...p.map((q) => q.y)) });

/** Schnittflaeche zweier beliebiger Formen, angenaehert auf einem feinen Raster (nur fuer den Bericht "vorher" zwischen zwei schiefen Formen). */
function schnittAllgemein(a: P[], b: P[]): number {
  const ka = kastenVon(a), kb = kastenVon(b);
  const k = { x0: Math.max(ka.x0, kb.x0), y0: Math.max(ka.y0, kb.y0), x1: Math.min(ka.x1, kb.x1), y1: Math.min(ka.y1, kb.y1) };
  if (k.x1 <= k.x0 || k.y1 <= k.y0) return 0;
  const n = 400; const dx = (k.x1 - k.x0) / n, dy = (k.y1 - k.y0) / n;
  let z = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const q = { x: k.x0 + (i + 0.5) * dx, y: k.y0 + (j + 0.5) * dy };
    if (imPolygon(q, a) && imPolygon(q, b)) z++;
  }
  return z * dx * dy;
}
function imPolygon(q: P, p: P[]) {
  let drin = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Das gerade gezogene Rechteck einer Form - oder null, wenn sie keines sein sollte (Regel oben, Schritte 2 bis 4). */
export function geradesRechteck(p: P[]): Kasten | null {
  if (p.length < 3 || p.length > MAX_ECKEN || istRechteck(p)) return null;
  const m = momente(p);
  if (!(m.flaeche > 0) || m.vx <= 0 || m.vy <= 0) return null;
  if (m.flaeche / flaeche(huelle(p)) < MIN_KONVEX) return null;
  let w = Math.sqrt(12 * m.vx), h = Math.sqrt(12 * m.vy);
  const s = Math.sqrt(m.flaeche / (w * h)); w *= s; h *= s;
  const k = { x0: m.cx - w / 2, y0: m.cy - h / 2, x1: m.cx + w / 2, y1: m.cy + h / 2 };
  const schnitt = schnittMitKasten(p, k);
  return schnitt / (2 * m.flaeche - schnitt) >= MIN_DECKUNG ? k : null;
}

export interface GlaettBericht { geaendert: number; zurueckgezogen: number; verworfen: number; neueUeberdeckungen: number }

/**
 * Alle Formen einer Karte gerade ziehen (Regel oben). Die Reihenfolge und die Zahl der Formen bleiben; nur `punkte` aendert sich.
 */
export function formenGlaetten<T extends { punkte: P[] }>(formen: T[]): { formen: T[]; bericht: GlaettBericht } {
  const alt = formen.map((f) => f.punkte);
  const jetzt = alt.map((p) => p);
  const bericht: GlaettBericht = { geaendert: 0, zurueckgezogen: 0, verworfen: 0, neueUeberdeckungen: 0 };
  // Vorher: wie stark ueberdeckte jede Form jede andere? (nur Paare, deren Rahmen sich beruehren)
  const grenze = (i: number, j: number) => ueberdeckung(alt[i], alt[j]) + UEBERLAPP_SPIEL;
  const vorher = new Map<string, number>();
  const erlaubt = (i: number, j: number) => {
    const s = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (!vorher.has(s)) vorher.set(s, grenze(i, j));
    return vorher.get(s)!;
  };
  for (let i = 0; i < alt.length; i++) {
    const k0 = geradesRechteck(alt[i]);
    if (!k0) continue;
    const ziel = flaeche(alt[i]);
    const passt = (k: Kasten) => jetzt.every((q, j) => j === i || ueberdeckung(alsPunkte(k), q) <= erlaubt(i, j));
    let k = k0;
    if (!passt(k)) {
      /*
       * Je Kante: so wenig wie moeglich nach innen ziehen, bis nichts mehr staerker ueberdeckt wird (Halbierung, 30 Schritte - die Ueberdeckung waechst
       * nicht, wenn eine Kante nach innen geht). Gewinnt die Kante, die am meisten Flaeche uebrig laesst. Reicht keine Kante allein, bleibt die alte Form.
       */
      let beste: Kasten | null = null;
      for (const seite of ['x0', 'x1', 'y0', 'y1'] as const) {
        const innen = seite === 'x0' || seite === 'x1' ? (k0.x0 + k0.x1) / 2 : (k0.y0 + k0.y1) / 2;
        const mit = (t: number): Kasten => ({ ...k0, [seite]: k0[seite] + (innen - k0[seite]) * t });
        if (!passt(mit(1))) continue;
        let lo = 0, hi = 1;
        for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (passt(mit(m))) hi = m; else lo = m; }
        const kk = mit(hi);
        if (!beste || (kk.x1 - kk.x0) * (kk.y1 - kk.y0) > (beste.x1 - beste.x0) * (beste.y1 - beste.y0)) beste = kk;
      }
      if (!beste || (beste.x1 - beste.x0) * (beste.y1 - beste.y0) < MIN_REST * ziel) { bericht.verworfen++; continue; }
      k = beste; bericht.zurueckgezogen++;
    }
    jetzt[i] = alsPunkte(k);
    bericht.geaendert++;
  }
  // Pruefung zum Schluss: keine Form ueberdeckt eine andere staerker als vorher.
  for (let i = 0; i < jetzt.length; i++) for (let j = i + 1; j < jetzt.length; j++) {
    if (jetzt[i] === alt[i] && jetzt[j] === alt[j]) continue;
    if (ueberdeckung(jetzt[i], jetzt[j]) > erlaubt(i, j)) bericht.neueUeberdeckungen++;
  }
  return { formen: formen.map((f, i) => (jetzt[i] === alt[i] ? f : { ...f, punkte: jetzt[i] })), bericht };
}
