/*
 * Noble-Formen beim Zeichnen leicht vereinfachen (Noble Practice, 16.11.2026, ueber den Betreiber: die Landepunkte nicht 1:1 abbilden,
 * sondern leicht angepasst - Wasserzeichen und Hinweis bleiben). Nur fuer die Anzeige: die gespeicherten Daten bleiben unberuehrt.
 *
 * Je Form, in dieser Reihenfolge:
 *   1. ein achsenparalleles Rechteck, wenn eines die Form gut deckt (IoU >= 0.85)
 *   2. sonst zwei aneinanderliegende Rechtecke (L-Form, Stufe), als ein Umriss, wenn sie gut decken (IoU >= 0.85)
 *   3. sonst ein vereinfachtes Vieleck: Douglas-Peucker, fast waagrechte/senkrechte Kanten gerade gezogen, kleine Zacken und Stufen weg;
 *      eine klare Schraege (Kuestenschnitt) darf bleiben.
 * Nachbarn duerfen sich danach nicht ueberlappen: die Rechtecke werden auf einem Raster gegen die Flaechen der anderen Formen gesucht
 * (hoechstens 1 % fremde Flaeche), und Kanten, die nach dem Vereinfachen knapp nebeneinander liegen, werden auf eine Linie gezogen (keine
 * sichtbaren Spalte). Ein Vieleck, das doch in einen Nachbarn ragt, faellt auf die weniger stark vereinfachte Fassung zurueck.
 *
 * Koordinaten in Prozent des (quadratischen) Kartenbildes, wie ueberall. Ohne Abhaengigkeiten (Browser und Server).
 */

export interface Pt { x: number; y: number }

const R = 0.2;                 // Rasterweite in Prozent (500 x 500 Zellen)
const N = Math.round(100 / R);
const IOU_MIN = 0.85;
const FREMD_MAX = 0.01;


/** Die Zellen einer Form (Zeilen-Abtastung an den Zellmitten) - ruft `setze(index)` je Zelle. */
function rastere(p: Pt[], setze: (i: number) => void) {
  const ys = p.map((q) => q.y);
  const r0 = Math.max(0, Math.floor(Math.min(...ys) / R)), r1 = Math.min(N - 1, Math.ceil(Math.max(...ys) / R));
  for (let r = r0; r <= r1; r++) {
    const y = (r + 0.5) * R; const xs: number[] = [];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i], b = p[j];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / R - 0.5)), c1 = Math.min(N - 1, Math.floor(xs[k + 1] / R - 0.5));
      for (let c = c0; c <= c1; c++) setze(r * N + c);
    }
  }
}

/** Summenflaeche (N+1)^2 fuer schnelle Rechtecksummen. */
function summen(maske: (i: number) => number): Int32Array {
  const S = new Int32Array((N + 1) * (N + 1));
  for (let r = 0; r < N; r++) { let z = 0; for (let c = 0; c < N; c++) { z += maske(r * N + c); S[(r + 1) * (N + 1) + c + 1] = S[r * (N + 1) + c + 1] + z; } }
  return S;
}
const summe = (S: Int32Array, c0: number, r0: number, c1: number, r1: number) =>
  S[r1 * (N + 1) + c1] - S[r0 * (N + 1) + c1] - S[r1 * (N + 1) + c0] + S[r0 * (N + 1) + c0];

/** Kandidaten fuer Kanten (Zellgrenzen): die Ecken der Form, hoechstens 22 je Achse. */
function kandidaten(werte: number[]): number[] {
  const z = [...new Set(werte.map((v) => Math.max(0, Math.min(N, Math.round(v / R)))))].sort((a, b) => a - b);
  if (z.length <= 22) return z;
  const raus = new Set<number>([z[0], z[z.length - 1]]);
  for (let i = 1; i < 21; i++) raus.add(z[Math.round((i * (z.length - 1)) / 21)]);
  return [...raus].sort((a, b) => a - b);
}

interface Kasten { c0: number; r0: number; c1: number; r1: number; drin: number; groesse: number }

function besterKasten(eigen: Int32Array, fremd: Int32Array, xs: number[], ys: number[], wert: (k: Kasten) => number,
  fest?: { c0?: number; c1?: number; r0?: number; r1?: number }): Kasten | null {
  let best: Kasten | null = null, bw = -Infinity;
  const X0 = fest?.c0 !== undefined ? [fest.c0] : xs, X1 = fest?.c1 !== undefined ? [fest.c1] : xs;
  const Y0 = fest?.r0 !== undefined ? [fest.r0] : ys, Y1 = fest?.r1 !== undefined ? [fest.r1] : ys;
  for (const c0 of X0) for (const c1 of X1) {
    if (c1 <= c0) continue;
    for (const r0 of Y0) for (const r1 of Y1) {
      if (r1 <= r0) continue;
      const groesse = (c1 - c0) * (r1 - r0);
      if (summe(fremd, c0, r0, c1, r1) > FREMD_MAX * groesse) continue;
      const k = { c0, r0, c1, r1, drin: summe(eigen, c0, r0, c1, r1), groesse };
      const w = wert(k);
      if (w > bw) { bw = w; best = k; }
    }
  }
  return best;
}

const ohneDoppelte = (p: Pt[]) => {
  const q = p.filter((a, i) => { const b = p[(i + p.length - 1) % p.length]; return Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9; });
  // Punkte auf einer Geraden zwischen ihren Nachbarn
  return q.filter((b, i) => {
    const a = q[(i + q.length - 1) % q.length], c = q[(i + 1) % q.length];
    return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 1e-9;
  });
};

/** Umriss zweier Rechtecke, die an x = s (senkrecht) aneinanderliegen; ys muessen sich ueberlappen. */
function lUmriss(a: Kasten, b: Kasten): Pt[] {
  const s = a.c1; // a links, b rechts
  const P = (c: number, r: number) => ({ x: c * R, y: r * R });
  return ohneDoppelte([P(a.c0, a.r0), P(s, a.r0), P(s, b.r0), P(b.c1, b.r0), P(b.c1, b.r1), P(s, b.r1), P(s, a.r1), P(a.c0, a.r1)]);
}

function dp(p: Pt[], eps: number): Pt[] {
  if (p.length < 4) return p;
  // geschlossen: an den zwei am weitesten auseinanderliegenden Punkten teilen
  let i0 = 0, i1 = 0, d = -1;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { const e = (p[i].x - p[j].x) ** 2 + (p[i].y - p[j].y) ** 2; if (e > d) { d = e; i0 = i; i1 = j; } }
  const linie = (q: Pt[]): Pt[] => {
    if (q.length < 3) return q;
    const a = q[0], b = q[q.length - 1]; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
    let m = 0, k = 0;
    for (let i = 1; i < q.length - 1; i++) { const e = Math.abs((b.x - a.x) * (a.y - q[i].y) - (a.x - q[i].x) * (b.y - a.y)) / L; if (e > m) { m = e; k = i; } }
    if (m <= eps) return [a, b];
    const l = linie(q.slice(0, k + 1)), r = linie(q.slice(k));
    return [...l.slice(0, -1), ...r];
  };
  const hin = linie(p.slice(i0, i1 + 1)), zur = linie([...p.slice(i1), ...p.slice(0, i0 + 1)]);
  return [...hin.slice(0, -1), ...zur.slice(0, -1)];
}

/** Fast waagrechte/senkrechte Kanten gerade ziehen, sehr kurze Kanten (Zacken, kleine Stufen) entfernen. */
function begradigen(p: Pt[], kurz: number): Pt[] {
  let q = p.map((a) => ({ ...a }));
  const TAN = Math.tan((14 * Math.PI) / 180);
  for (let runde = 0; runde < 3; runde++) {
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      if (dy <= TAN * dx) { const m = (a.y + b.y) / 2; a.y = m; b.y = m; } else if (dx <= TAN * dy) { const m = (a.x + b.x) / 2; a.x = m; b.x = m; }
    }
    q = ohneDoppelte(q);
    // kurze Kanten: die zwei Endpunkte zu einem verschmelzen
    let weg = true;
    while (weg && q.length > 4) {
      weg = false;
      for (let i = 0; i < q.length; i++) {
        const a = q[i], b = q[(i + 1) % q.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < kurz) { q.splice((i + 1) % q.length, 1); weg = true; break; }
      }
    }
    q = ohneDoppelte(q);
  }
  return q.length >= 3 ? q : p;
}

/**
 * Eine Stufe in einem achsenparallelen Umriss: zwei gleichgerichtete, parallele Kanten mit einer kurzen Querkante dazwischen. Sie wird
 * eingeebnet (beide Richtungen werden probiert: nach aussen und nach innen), danach darf eine der Ecken an der eingeebneten Kante schraeg
 * abgeschnitten werden. Zurueck kommt der beste Umriss nach `bewerte` (IoU, null = nimmt Nachbarn Flaeche) - oder null ohne Stufe.
 */
function ohneStufe(p: Pt[], bewerte: (q: Pt[]) => number | null): { punkte: Pt[]; iou: number } | null {
  const n = p.length;
  const L = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  let best: { punkte: Pt[]; iou: number } | null = null;
  const probiere = (q: Pt[]) => {
    q = ohneDoppelte(q);
    if (q.length < 3) return;
    const v = bewerte(q);
    if (v !== null && (!best || v > best.iou)) best = { punkte: q, iou: v };
  };
  for (let i = 0; i < n; i++) {
    const A = p[i], B = p[(i + 1) % n], C = p[(i + 2) % n], D = p[(i + 3) % n];
    const ab = { x: B.x - A.x, y: B.y - A.y }, cd = { x: D.x - C.x, y: D.y - C.y };
    const parallel = (ab.y === 0 && cd.y === 0 && Math.sign(ab.x) === Math.sign(cd.x)) || (ab.x === 0 && cd.x === 0 && Math.sign(ab.y) === Math.sign(cd.y));
    if (!parallel || L(B, C) > 0.35 * Math.min(L(A, B), L(C, D))) continue;
    const waag = ab.y === 0;
    for (const ebene of [waag ? A.y : A.x, waag ? D.y : D.x]) {
      // B und C auf eine Linie: die Stufe verschwindet, die Kante laeuft durch.
      const q = p.map((pt) => ({ ...pt }));
      // Alle Punkte der beiden Kanten auf dieselbe Ebene (A..B und C..D bilden danach eine Kante).
      for (const k of [i, (i + 1) % n, (i + 2) % n, (i + 3) % n]) { if (waag) q[k].y = ebene; else q[k].x = ebene; }
      // Die Querkanten vor A und nach D bleiben achsenparallel, sie werden nur laenger oder kuerzer.
      const glatt = ohneDoppelte(q);
      probiere(glatt);
      // Dazu je Ecke der eingeebneten Kante ein schraeger Schnitt.
      for (let k = 0; k < glatt.length; k++) {
        const P0 = glatt[(k + glatt.length - 1) % glatt.length], P1 = glatt[k], P2 = glatt[(k + 1) % glatt.length];
        const aufKante = waag ? P1.y === ebene : P1.x === ebene;
        if (!aufKante) continue;
        for (const f1 of [0.15, 0.3, 0.45, 0.6]) for (const f2 of [0.15, 0.3, 0.45, 0.6]) {
          const u = { x: P1.x + (P0.x - P1.x) * f1, y: P1.y + (P0.y - P1.y) * f1 };
          const w = { x: P1.x + (P2.x - P1.x) * f2, y: P1.y + (P2.y - P1.y) * f2 };
          // nur aussen liegende (konvexe) Ecken abschneiden
          const kreuz = (P1.x - P0.x) * (P2.y - P1.y) - (P1.y - P0.y) * (P2.x - P1.x);
          const flaecheVorzeichen = glatt.reduce((s, a, j) => { const b = glatt[(j + 1) % glatt.length]; return s + (a.x * b.y - b.x * a.y); }, 0);
          if (Math.sign(kreuz) !== Math.sign(flaecheVorzeichen)) continue;
          probiere([...glatt.slice(0, k), u, w, ...glatt.slice(k + 1)]);
        }
      }
    }
  }
  return best;
}

export interface VereinfachtErgebnis { punkte: Pt[]; art: 'rechteck' | 'fase' | 'zwei' | 'vieleck' | 'original'; iou: number }

/**
 * Alle Formen einer Karte. `istNoble(i)` sagt, welche vereinfacht werden; die anderen bleiben, zaehlen aber als Nachbarn.
 * Gibt je Form die anzuzeigenden Ecken zurueck (gleiche Reihenfolge).
 */
export function vereinfacheFormen(formen: Array<{ punkte: Pt[] }>, istNoble: (i: number) => boolean): VereinfachtErgebnis[] {
  const besitzer = new Int16Array(N * N).fill(-1);
  formen.forEach((f, i) => { if (f.punkte.length >= 3) rastere(f.punkte, (z) => { besitzer[z] = i; }); });
  const raus: VereinfachtErgebnis[] = formen.map((f) => ({ punkte: f.punkte, art: 'original', iou: 1 }));
  // Fuer die Pruefung auf Ueberlappung zaehlen die angezeigten Fassungen der schon bearbeiteten Nachbarn.
  const belegt = new Int16Array(N * N).fill(-1);
  formen.forEach((f, i) => { if (f.punkte.length >= 3 && !istNoble(i)) rastere(f.punkte, (z) => { belegt[z] = i; }); });

  formen.forEach((f, i) => {
    if (!istNoble(i) || f.punkte.length < 3) return;
    // Die eigene Flaeche (auch dort, wo das Original schon mit einem Nachbarn ueberlappt - diese Ueberlappung stammt aus der Quelle und darf
    // bleiben); fremd ist nur, was ausserhalb des eigenen Originals einem Nachbarn gehoert.
    const meins = new Uint8Array(N * N); let A = 0;
    rastere(f.punkte, (z) => { if (!meins[z]) { meins[z] = 1; A++; } });
    if (A < 4) return;
    const eigen = summen((z) => meins[z]);
    const fremd = summen((z) => (!meins[z] && ((besitzer[z] >= 0 && besitzer[z] !== i) || (belegt[z] >= 0 && belegt[z] !== i)) ? 1 : 0));
    const xs = kandidaten(f.punkte.map((q) => q.x)), ys = kandidaten(f.punkte.map((q) => q.y));
    const iouVon = (drin: number, groesse: number) => drin / (A + groesse - drin);
    /** IoU eines Vielecks gegen die eigene Flaeche - null, wenn es mehr als 1 % fremde Flaeche nimmt. */
    const bewerte = (q: Pt[]): number | null => {
      let drin = 0, fremdN = 0, n = 0;
      rastere(q, (z) => { n++; if (meins[z]) drin++; else if (besitzer[z] >= 0 || belegt[z] >= 0) fremdN++; });
      return n && fremdN <= FREMD_MAX * n ? drin / (A + n - drin) : null;
    };

    let wahl: VereinfachtErgebnis | null = null;
    const ecken = (k: Kasten): Pt[] => [{ x: k.c0 * R, y: k.r0 * R }, { x: k.c1 * R, y: k.r0 * R }, { x: k.c1 * R, y: k.r1 * R }, { x: k.c0 * R, y: k.r1 * R }];
    const k1 = besterKasten(eigen, fremd, xs, ys, (k) => iouVon(k.drin, k.groesse));
    const iou1 = k1 ? iouVon(k1.drin, k1.groesse) : 0;
    if (k1 && iou1 >= IOU_MIN) wahl = { punkte: ecken(k1), art: 'rechteck', iou: iou1 };

    /*
     * Rechteck mit einer schraegen Ecke (Betreiber, 16.11.2026: "eine diagonale Ecke ist in Ordnung und sieht besser aus" - statt einer kleinen
     * Stufe). Grundlage: das beste Rechteck und der enge Rahmen der Form; je Ecke werden Schnitte von 10 bis 70 % der Seiten probiert. Gezaehlt
     * wird zeilenweise ueber die Summenflaechen, ohne die Form neu zu rastern.
     */
    let fase: { iou: number; punkte: Pt[] } | null = null;
    if (!wahl) {
      const rahmenK: Kasten = { c0: xs[0], c1: xs[xs.length - 1], r0: ys[0], r1: ys[ys.length - 1], drin: 0, groesse: 0 };
      rahmenK.drin = summe(eigen, rahmenK.c0, rahmenK.r0, rahmenK.c1, rahmenK.r1); rahmenK.groesse = (rahmenK.c1 - rahmenK.c0) * (rahmenK.r1 - rahmenK.r0);
      const fremdIn = (k: Kasten) => summe(fremd, k.c0, k.r0, k.c1, k.r1);
      for (const k of [k1, rahmenK]) {
        if (!k) continue;
        const B = k.c1 - k.c0, H = k.r1 - k.r0;
        if (B < 3 || H < 3) continue;
        for (const ecke of [0, 1, 2, 3]) { // 0 oben links, 1 oben rechts, 2 unten rechts, 3 unten links
          for (const fa of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) for (const fb of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
            const a = Math.max(1, Math.round(B * fa)), b = Math.max(1, Math.round(H * fb));
            // Dreieck in der Ecke: Zeile fuer Zeile die abgeschnittenen Zellen
            let wegE = 0, wegF = 0, wegN = 0;
            for (let t = 0; t < b; t++) {
              const w = Math.floor(a * (1 - (t + 0.5) / b) + 0.5);
              if (w <= 0) continue;
              const r = ecke < 2 ? k.r0 + t : k.r1 - 1 - t;
              const [c0, c1] = ecke === 0 || ecke === 3 ? [k.c0, k.c0 + w] : [k.c1 - w, k.c1];
              wegE += summe(eigen, c0, r, c1, r + 1); wegF += summe(fremd, c0, r, c1, r + 1); wegN += w;
            }
            const groesse = k.groesse - wegN, drin = k.drin - wegE;
            if (fremdIn(k) - wegF > FREMD_MAX * groesse) continue;
            const iou = iouVon(drin, groesse);
            if (fase && iou <= fase.iou) continue;
            const X0 = k.c0 * R, X1 = k.c1 * R, Y0 = k.r0 * R, Y1 = k.r1 * R, aa = a * R, bb = b * R;
            const p = ecke === 0 ? [{ x: X0 + aa, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }, { x: X0, y: Y0 + bb }]
              : ecke === 1 ? [{ x: X0, y: Y0 }, { x: X1 - aa, y: Y0 }, { x: X1, y: Y0 + bb }, { x: X1, y: Y1 }, { x: X0, y: Y1 }]
                : ecke === 2 ? [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 - bb }, { x: X1 - aa, y: Y1 }, { x: X0, y: Y1 }]
                  : [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0 + aa, y: Y1 }, { x: X0, y: Y1 - bb }];
            fase = { iou, punkte: p };
          }
        }
      }
    }

    /*
     * Zwei Rechtecke, an einer senkrechten oder waagrechten Linie aneinander, immer als EIN Umriss. Ist das kleinere Rechteck klein (unter 30 %
     * des groesseren) oder schmal, gilt es nicht (Betreiber, 16.11.2026: sonst sah es aus wie ein eigener Spot) - dann ein Rechteck.
     */
    let zwei: { iou: number; punkte: Pt[] } | null = null;
    let kleinVerworfen = false;
    if (!wahl) {
      const gut = (k: Kasten) => 2 * k.drin - k.groesse;
      const taugt = (a: Kasten, b: Kasten) => {
        const [g, kl] = a.groesse >= b.groesse ? [a, b] : [b, a];
        const schmal = Math.min(kl.c1 - kl.c0, kl.r1 - kl.r0) < Math.max(Math.round(1.5 / R), 0.35 * Math.min(g.c1 - g.c0, g.r1 - g.r0));
        return kl.groesse >= 0.3 * g.groesse && !schmal;
      };
      const pruefe = (a: Kasten | null, b: Kasten | null, umriss: (a: Kasten, b: Kasten) => Pt[]) => {
        if (!a || !b) return;
        const iou = (a.drin + b.drin) / (A + a.groesse + b.groesse - a.drin - b.drin);
        if (!taugt(a, b)) { if (iou >= IOU_MIN) kleinVerworfen = true; return; }
        if (!zwei || iou > zwei.iou) zwei = { iou, punkte: umriss(a, b) };
      };
      for (const s of xs.slice(1, -1)) {
        const a = besterKasten(eigen, fremd, xs, ys, gut, { c1: s }), b = besterKasten(eigen, fremd, xs, ys, gut, { c0: s });
        if (a && b && Math.min(a.r1, b.r1) > Math.max(a.r0, b.r0)) pruefe(a, b, lUmriss);
      }
      const t = (k: Kasten): Kasten => ({ c0: k.r0, c1: k.r1, r0: k.c0, r1: k.c1, drin: k.drin, groesse: k.groesse });
      for (const s of ys.slice(1, -1)) {
        const a = besterKasten(eigen, fremd, xs, ys, gut, { r1: s }), b = besterKasten(eigen, fremd, xs, ys, gut, { r0: s });
        // gespiegelt: oben a, unten b -> Umriss ueber vertauschte Achsen
        if (a && b && Math.min(a.c1, b.c1) > Math.max(a.c0, b.c0)) pruefe(a, b, (u, v) => lUmriss(t(u), t(v)).map((q) => ({ x: q.y, y: q.x })).reverse());
      }
    }
    if (!wahl) {
      const z = zwei as { iou: number; punkte: Pt[] } | null, fa = fase as { iou: number; punkte: Pt[] } | null;
      const zOk = z && z.iou >= IOU_MIN && z.iou > iou1 + 0.03 ? z : null;
      // Hat das Original eine klare Schraege (eine Kante zwischen 20 und 70 Grad, mindestens 15 % der kuerzeren Seite lang), ersetzt eine
      // schraege Ecke lieber die Stufe (Betreiber, 16.11.2026: Jakebuca, Heat 1) - auch wenn sie etwas weniger genau deckt.
      const bw = Math.max(...f.punkte.map((q) => q.x)) - Math.min(...f.punkte.map((q) => q.x));
      const bh = Math.max(...f.punkte.map((q) => q.y)) - Math.min(...f.punkte.map((q) => q.y));
      const schraegImOriginal = f.punkte.some((q, k) => {
        const r = f.punkte[(k + 1) % f.punkte.length]; const dx = Math.abs(r.x - q.x), dy = Math.abs(r.y - q.y);
        const winkel = (Math.atan2(dy, dx) * 180) / Math.PI;
        return winkel >= 20 && winkel <= 70 && Math.hypot(dx, dy) >= 0.15 * Math.min(bw, bh);
      });
      const fOk = fa && fa.iou > iou1 + 0.02 && (fa.iou >= IOU_MIN || (schraegImOriginal && fa.iou >= 0.8)) ? fa : null;
      // Die schraege Ecke geht vor, wenn sie fast so gut deckt wie die Stufe aus zwei Rechtecken.
      if (fOk && (!zOk || fOk.iou >= zOk.iou - (schraegImOriginal ? 0.08 : 0.02))) wahl = { punkte: fOk.punkte, art: 'fase', iou: fOk.iou };
      else if (zOk) {
        wahl = { punkte: zOk.punkte, art: 'zwei', iou: zOk.iou };
        /*
         * Eine kleine Stufe im Umriss (Betreiber, 16.11.2026: Jakebuca, Heat 1 - "oben wurde es eine Stufe") wird zu einer geraden Kante,
         * und die Ecke daneben darf schraeg abgeschnitten sein - wenn das die Form fast so gut deckt.
         */
        const glatt = ohneStufe(zOk.punkte, (q) => bewerte(q));
        if (glatt && glatt.iou >= zOk.iou - 0.06 && glatt.iou >= 0.8) wahl = { punkte: glatt.punkte, art: 'fase', iou: glatt.iou };
      }
      else if (kleinVerworfen && k1 && iou1 >= 0.7) wahl = { punkte: ecken(k1), art: 'rechteck', iou: iou1 };
    }
    if (!wahl) {
      const w = Math.max(...f.punkte.map((q) => q.x)) - Math.min(...f.punkte.map((q) => q.x));
      const h = Math.max(...f.punkte.map((q) => q.y)) - Math.min(...f.punkte.map((q) => q.y));
      const gr = Math.min(w, h);
      // Versuche von stark nach schwach; zuletzt leicht zur Mitte geschrumpft, damit nichts in einen Nachbarn ragt.
      const mx = f.punkte.reduce((u, q) => u + q.x, 0) / f.punkte.length, my = f.punkte.reduce((u, q) => u + q.y, 0) / f.punkte.length;
      const schrumpf = (p: Pt[], z: number) => p.map((q) => ({ x: mx + (q.x - mx) * z, y: my + (q.y - my) * z }));
      const versuche = [
        () => begradigen(dp(f.punkte, Math.max(0.25, 0.06 * gr)), Math.max(0.3, 0.08 * gr)),
        () => begradigen(dp(f.punkte, Math.max(0.15, 0.03 * gr)), Math.max(0.2, 0.04 * gr)),
        () => schrumpf(begradigen(dp(f.punkte, Math.max(0.25, 0.06 * gr)), Math.max(0.3, 0.08 * gr)), 0.95),
        () => schrumpf(dp(f.punkte, Math.max(0.15, 0.03 * gr)), 0.95),
      ];
      for (const versuch of versuche) {
        const p = versuch();
        if (p.length < 3) continue;
        let drin = 0, fremdN = 0, n = 0;
        rastere(p, (z) => { n++; if (meins[z]) drin++; else if (besitzer[z] >= 0 || belegt[z] >= 0) fremdN++; });
        if (fremdN > FREMD_MAX * n) continue;
        // Hoechstens zwei schraege Kanten je Form (Betreiber, 16.11.2026) - mehr sieht nach dem Original aus, nicht nach einer Vereinfachung.
        const schraeg = p.filter((q, k) => { const r = p[(k + 1) % p.length]; return Math.abs(r.x - q.x) > 1e-6 && Math.abs(r.y - q.y) > 1e-6; }).length;
        if (schraeg > 2) continue;
        wahl = { punkte: p, art: 'vieleck', iou: drin / (A + n - drin) };
        break;
      }
    }
    if (!wahl) {
      // Kein Vieleck mit hoechstens zwei Schraegen: die beste der einfachen Formen, auch unter der Schwelle.
      const z = zwei as { iou: number; punkte: Pt[] } | null, fa = fase as { iou: number; punkte: Pt[] } | null;
      const kandid: VereinfachtErgebnis[] = [];
      if (k1) kandid.push({ punkte: ecken(k1), art: 'rechteck', iou: iou1 });
      if (fa) kandid.push({ punkte: fa.punkte, art: 'fase', iou: fa.iou });
      if (z) kandid.push({ punkte: z.punkte, art: 'zwei', iou: z.iou });
      const bester = kandid.sort((u, v) => v.iou - u.iou)[0];
      if (bester && bester.iou >= 0.6) wahl = bester;
    }
    if (!wahl) return;
    raus[i] = wahl;
    rastere(wahl.punkte, (z) => { if (belegt[z] < 0) belegt[z] = i; });
  });

  // Kanten, die knapp nebeneinander liegen, auf eine Linie ziehen (keine Spalte, keine Haarlinien-Ueberlappung).
  const T = 0.45;
  for (const achse of ['x', 'y'] as const) {
    const werte = raus.flatMap((r, i) => (istNoble(i) ? r.punkte.map((q) => q[achse]) : formen[i].punkte.map((q) => q[achse]))).sort((a, b) => a - b);
    const gruppen: number[][] = [];
    for (const v of werte) { const g = gruppen[gruppen.length - 1]; if (g && v - g[g.length - 1] <= T) g.push(v); else gruppen.push([v]); }
    const ziel = new Map<number, number>();
    for (const g of gruppen) { if (g[g.length - 1] - g[0] > T) continue; const m = g[Math.floor(g.length / 2)]; for (const v of g) ziel.set(v, m); }
    raus.forEach((r, i) => { if (istNoble(i) && r.art !== 'original') r.punkte = ohneDoppelte(r.punkte.map((q) => ({ ...q, [achse]: ziel.get(q[achse]) ?? q[achse] }))); });
  }
  return raus;
}

/** Bequem: nur die neuen Ecken. Merkt sich das letzte Ergebnis je Eingabe (gleiche Karte wird oft neu gezeichnet). */
const merker = new Map<string, Pt[][]>();
export function nobleAnzeige(formen: Array<{ punkte: Pt[] }>, istNoble: (i: number) => boolean): Pt[][] {
  const schluessel = JSON.stringify(formen.map((f, i) => [istNoble(i) ? 1 : 0, f.punkte]));
  const da = merker.get(schluessel);
  if (da) return da;
  const r = vereinfacheFormen(formen, istNoble).map((x) => x.punkte);
  if (merker.size > 30) merker.clear();
  merker.set(schluessel, r);
  return r;
}
