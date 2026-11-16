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

export interface VereinfachtErgebnis { punkte: Pt[]; art: 'rechteck' | 'zwei' | 'vieleck' | 'original'; iou: number }

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

    let wahl: VereinfachtErgebnis | null = null;
    const k1 = besterKasten(eigen, fremd, xs, ys, (k) => iouVon(k.drin, k.groesse));
    const iou1 = k1 ? iouVon(k1.drin, k1.groesse) : 0;
    if (k1 && iou1 >= IOU_MIN) {
      wahl = { punkte: [{ x: k1.c0 * R, y: k1.r0 * R }, { x: k1.c1 * R, y: k1.r0 * R }, { x: k1.c1 * R, y: k1.r1 * R }, { x: k1.c0 * R, y: k1.r1 * R }], art: 'rechteck', iou: iou1 };
    }
    if (!wahl) {
      // Zwei Rechtecke, an einer senkrechten oder (gespiegelt gedacht) waagrechten Linie aneinander.
      let best: { iou: number; punkte: Pt[] } | null = null;
      const gut = (k: Kasten) => 2 * k.drin - k.groesse;
      for (const s of xs.slice(1, -1)) {
        const a = besterKasten(eigen, fremd, xs, ys, gut, { c1: s }), b = besterKasten(eigen, fremd, xs, ys, gut, { c0: s });
        if (!a || !b || Math.min(a.r1, b.r1) <= Math.max(a.r0, b.r0)) continue;
        const iou = (a.drin + b.drin) / (A + a.groesse + b.groesse - a.drin - b.drin);
        if (!best || iou > best.iou) best = { iou, punkte: lUmriss(a, b) };
      }
      for (const s of ys.slice(1, -1)) {
        const a = besterKasten(eigen, fremd, xs, ys, gut, { r1: s }), b = besterKasten(eigen, fremd, xs, ys, gut, { r0: s });
        if (!a || !b || Math.min(a.c1, b.c1) <= Math.max(a.c0, b.c0)) continue;
        const iou = (a.drin + b.drin) / (A + a.groesse + b.groesse - a.drin - b.drin);
        // gespiegelt: oben a, unten b -> Umriss ueber vertauschte Achsen
        const t = (k: Kasten): Kasten => ({ c0: k.r0, c1: k.r1, r0: k.c0, r1: k.c1, drin: k.drin, groesse: k.groesse });
        const p = lUmriss(t(a), t(b)).map((q) => ({ x: q.y, y: q.x })).reverse();
        if (!best || iou > best.iou) best = { iou, punkte: p };
      }
      if (best && best.iou >= IOU_MIN && best.iou > iou1 + 0.03) wahl = { punkte: best.punkte, art: 'zwei', iou: best.iou };
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
        wahl = { punkte: p, art: 'vieleck', iou: drin / (A + n - drin) };
        break;
      }
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
