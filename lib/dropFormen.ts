/*
 * Die Formen der eigenen Drop-Karte (lib/dropKarte) - je Stelle ein schlichtes, achsenparalleles Rechteck (Betreiber, 18.11.2026):
 *
 *   "jede Stelle ein einfaches Rechteck, vier Ecken - keine L-Formen, keine Fasen, keine Polygone, keine Blasen. So gross wie der Ort / die
 *    Gebaeude. Die Orte muessen zu den echten Stellen passen (dieselben POIs wie auf den Noble-Karten), aber die Formen sind unsere eigenen."
 *
 * Woher die Groesse eines Ortes kommt: aus den Turnierkarten derselben Insel (turnier-karten.json, gleiches Kartenbild) - jede dort gezeichnete
 * Form steht fuer einen Ort. Von ihr bleibt nur der umschliessende Kasten, auf ein eigenes Raster (RASTER) gerundet; aehnliche Kaesten mehrerer
 * Karten werden zu einem gemittelt. Liegt eine Stelle in keinem Ort, bekommt sie ein Quadrat um ihre Landungen.
 *
 * Danach:
 *   - Gruppen, die im selben Ort landen, werden eine Form (mehrere Teams = umkaempft, die Namen stehen darin untereinander);
 *   - Rechtecke, die sich ueberdecken, werden an der Mitte der Ueberdeckung geteilt - Nachbarn duerfen sich beruehren, nicht ueberlappen.
 *
 * Alles in Prozent des Kartenbildes (wie die Formen der Turnierkarten). Ohne Server-Abhaengigkeiten, damit es sich allein pruefen laesst.
 */

export interface P { x: number; y: number }
export interface Kasten { x0: number; y0: number; x1: number; y1: number }
/** Eine Stelle: ihr Punkt - und, wenn die Ausdehnung schon bekannt ist (Stelle laut Noble), ihr Kasten. */
export interface Stelle { p: P; ort?: Kasten | null; form?: Form | null }

/** Das eigene Raster der Rechtecke (Prozent des Bildes). */
export const RASTER = 0.25;
/** Kleinste Seite eines Rechtecks - darunter passt kein Name mehr hinein. */
const MIN_SEITE = 2.5;
/** Groesste Seite eines Orts-Kastens - groessere Formen sind ganze Landstriche, keine Stelle. */
const MAX_SEITE = 16;

const runde = (v: number) => Math.round(v / RASTER) * RASTER;
const flaeche = (k: Kasten) => Math.max(0, k.x1 - k.x0) * Math.max(0, k.y1 - k.y0);
const schnitt = (a: Kasten, b: Kasten): Kasten => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const iou = (a: Kasten, b: Kasten) => { const s = flaeche(schnitt(a, b)); return s / (flaeche(a) + flaeche(b) - s || 1); };
const enthaelt = (k: Kasten, p: P) => p.x >= k.x0 && p.x <= k.x1 && p.y >= k.y0 && p.y <= k.y1;
const abstand = (k: Kasten, p: P) => Math.hypot(Math.max(k.x0 - p.x, 0, p.x - k.x1), Math.max(k.y0 - p.y, 0, p.y - k.y1));
const vereinigt = (a: Kasten, b: Kasten): Kasten => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** Aus den Formen der Turnierkarten einer Insel die Orte: je Form der umschliessende Kasten, aehnliche gemittelt, auf das Raster gerundet. */
export function orteAus(formen: P[][]): Kasten[] {
  // Je Form das Rechteck, das ihre Flaeche am besten deckt (formUm) - nicht der umschliessende Kasten, der bei L-Formen viel Nachbarschaft schluckt.
  const roh = formen.filter((f) => f.length >= 3).map((f) => formUm(f).kasten).filter((k) => k.x1 - k.x0 <= MAX_SEITE && k.y1 - k.y0 <= MAX_SEITE && k.x1 > k.x0 && k.y1 > k.y0);
  const haufen: Kasten[][] = [];
  for (const k of roh) {
    const h = haufen.find((hs) => iou(hs[0], k) >= 0.5);
    if (h) h.push(k); else haufen.push([k]);
  }
  return haufen.map((h) => ({
    x0: runde(median(h.map((k) => k.x0))), y0: runde(median(h.map((k) => k.y0))),
    x1: runde(median(h.map((k) => k.x1))), y1: runde(median(h.map((k) => k.y1))),
  }));
}

export const gleicherKasten = (a: Kasten, b: Kasten) => a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

/** Der Kasten einer fremden Form (z. B. einer Stelle von Noble), auf das eigene Raster gerundet - nur Lage und Ausdehnung, nicht die Form. */
export function kastenUm(punkte: P[]): Kasten {
  return {
    x0: runde(Math.min(...punkte.map((q) => q.x))), y0: runde(Math.min(...punkte.map((q) => q.y))),
    x1: runde(Math.max(...punkte.map((q) => q.x))), y1: runde(Math.max(...punkte.map((q) => q.y))),
  };
}

/** Liegt der Punkt im Polygon? (Strahlenverfahren) */
function imPolygon(p: P, ecken_: P[]): boolean {
  let drin = false;
  for (let i = 0, j = ecken_.length - 1; i < ecken_.length; j = i++) {
    const a = ecken_[i], b = ecken_[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/**
 * Um eine fremde Stelle (Nobles Polygon) eine eigene Form bauen: nur ihre Flaeche zaehlt, auf unserem Raster abgetastet. Kandidaten sind der
 * umschliessende Kasten, der Kasten ohne eine Ecke (ein sauberes L, lGut) und der Kasten ohne einen Randstreifen; es gilt der mit der besten
 * Deckung (Schnitt durch Vereinigung) - ein L nur, wenn es klar besser deckt. Kleine Zipfel fallen dabei von selbst weg.
 */
export function formUm(poly: P[]): Form {
  const k = kastenUm(poly);
  const nx = Math.max(1, Math.round((k.x1 - k.x0) / RASTER)), ny = Math.max(1, Math.round((k.y1 - k.y0) / RASTER));
  const drin: boolean[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) drin.push(imPolygon({ x: k.x0 + (i + 0.5) * RASTER, y: k.y0 + (j + 0.5) * RASTER }, poly));
  const gesamt = drin.filter(Boolean).length || 1;
  const deckung = (f: Form) => {
    let schnittZahl = 0, formZahl = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = { x: k.x0 + (i + 0.5) * RASTER, y: k.y0 + (j + 0.5) * RASTER };
      const inForm = enthaelt(f.kasten, p) && !(f.ecke && p.x > f.ecke.x0 && p.x < f.ecke.x1 && p.y > f.ecke.y0 && p.y < f.ecke.y1);
      if (inForm) { formZahl++; if (drin[j * nx + i]) schnittZahl++; }
    }
    return schnittZahl / (formZahl + gesamt - schnittZahl || 1);
  };
  const xs = [...new Set(poly.map((q) => runde(q.x)))].filter((x) => x > k.x0 && x < k.x1);
  const ys = [...new Set(poly.map((q) => runde(q.y)))].filter((y) => y > k.y0 && y < k.y1);
  let beste: Form = { kasten: k, ecke: null };
  let besteWert = deckung(beste);
  // Randstreifen abschneiden (ein langer duenner Zipfel an einer Seite).
  for (const x of xs) for (const kk of [{ ...k, x0: x }, { ...k, x1: x }]) {
    if (kk.x1 - kk.x0 < MIN_SEITE) continue;
    const w = deckung({ kasten: kk, ecke: null }); if (w > besteWert) { beste = { kasten: kk, ecke: null }; besteWert = w; }
  }
  for (const y of ys) for (const kk of [{ ...k, y0: y }, { ...k, y1: y }]) {
    if (kk.y1 - kk.y0 < MIN_SEITE) continue;
    const w = deckung({ kasten: kk, ecke: null }); if (w > besteWert) { beste = { kasten: kk, ecke: null }; besteWert = w; }
  }
  // Ein L: nur, wenn es klar besser deckt als das beste Rechteck.
  const rechteckBeste = besteWert;
  for (const px of xs) for (const py of ys) {
    for (const e of [
      { x0: k.x0, y0: k.y0, x1: px, y1: py }, { x0: px, y0: k.y0, x1: k.x1, y1: py },
      { x0: k.x0, y0: py, x1: px, y1: k.y1 }, { x0: px, y0: py, x1: k.x1, y1: k.y1 },
    ]) {
      if (!lGut(k, e)) continue;
      const w = deckung({ kasten: k, ecke: e });
      if (w > besteWert && w >= rechteckBeste + 0.1) { beste = { kasten: { ...k }, ecke: e }; besteWert = w; }
    }
  }
  return beste;
}

/** Der Ort einer Stelle: der kleinste Kasten, der sie enthaelt, sonst der naechste in NAH Prozent - sonst keiner. */
function ortVon(p: P, orte: Kasten[], nah = 1.2): Kasten | null {
  const drin = orte.filter((k) => enthaelt(k, p)).sort((a, b) => flaeche(a) - flaeche(b));
  if (drin.length) return drin[0];
  const naechster = [...orte].sort((a, b) => abstand(a, p) - abstand(b, p))[0];
  return naechster && abstand(naechster, p) <= nah ? naechster : null;
}

/**
 * Eine Form der Karte: ein Rechteck (kasten) - oder ein sauberes L, also das Rechteck ohne eine Ecke (ecke, der fehlende Teil an einer Ecke des
 * Kastens). Betreiber, 18.11.2026 (Skizze): "ein Rechteck, oder ein L aus genau zwei Rechtecken - beide Arme kraeftig. Keine Stufen, keine
 * Kerben, keine kleinen Kaesten daneben."
 */
export interface Form { kasten: Kasten; ecke: Kasten | null }

/** Ein L nur, wenn es klar besser deckt: die fehlende Ecke mindestens so viel vom Kasten. */
const L_MIN_ECKE = 0.2;
/** Jeder Arm mindestens so lang wie dieser Teil der laengeren Seite. */
const L_MIN_ARM = 0.35;

/** Die zwei Rechtecke einer Form (eines beim Rechteck). */
export function teile(f: Form): Kasten[] {
  const k = f.kasten, e = f.ecke;
  if (!e) return [k];
  // Der volle senkrechte Arm neben der Ecke, dazu der Rest unter bzw. ueber der Ecke.
  const eckeLinks = Math.abs(e.x0 - k.x0) < 1e-6;
  const eckeOben = Math.abs(e.y0 - k.y0) < 1e-6;
  const senkrecht: Kasten = eckeLinks ? { x0: e.x1, y0: k.y0, x1: k.x1, y1: k.y1 } : { x0: k.x0, y0: k.y0, x1: e.x0, y1: k.y1 };
  const rest: Kasten = { x0: e.x0, x1: e.x1, y0: eckeOben ? e.y1 : k.y0, y1: eckeOben ? k.y1 : e.y0 };
  return [senkrecht, rest];
}

/** Ist die fehlende Ecke ein sauberes L - beide Arme kraeftig? */
function lGut(k: Kasten, e: Kasten): boolean {
  const w = k.x1 - k.x0, h = k.y1 - k.y0;
  if (flaeche(e) < L_MIN_ECKE * w * h) return false;
  // Die Ecke muss genau an einer Ecke des Kastens sitzen und darf ihn nicht ganz durchschneiden.
  const anX = Math.abs(e.x0 - k.x0) < 1e-6 || Math.abs(e.x1 - k.x1) < 1e-6;
  const anY = Math.abs(e.y0 - k.y0) < 1e-6 || Math.abs(e.y1 - k.y1) < 1e-6;
  if (!anX || !anY) return false;
  const dickeX = w - (e.x1 - e.x0), dickeY = h - (e.y1 - e.y0);
  if (dickeX < MIN_SEITE || dickeY < MIN_SEITE) return false;
  return Math.min(w, h) >= L_MIN_ARM * Math.max(w, h);
}

/** Aus den Orts-Kaesten einer Stelle die Form: ein Kasten -> Rechteck; mehrere -> das beste L, wenn es klar besser deckt, sonst der umschliessende Kasten. */
function formAus(teileRoh: Kasten[]): Form {
  const k = teileRoh.reduce(vereinigt);
  if (teileRoh.length < 2) return { kasten: k, ecke: null };
  let beste: Kasten | null = null;
  const xs = [...new Set(teileRoh.flatMap((t) => [t.x0, t.x1]))];
  const ys = [...new Set(teileRoh.flatMap((t) => [t.y0, t.y1]))];
  for (const px of xs) for (const py of ys) {
    for (const e of [
      { x0: k.x0, y0: k.y0, x1: px, y1: py }, { x0: px, y0: k.y0, x1: k.x1, y1: py },
      { x0: k.x0, y0: py, x1: px, y1: k.y1 }, { x0: px, y0: py, x1: k.x1, y1: k.y1 },
    ]) {
      if (e.x1 - e.x0 <= 0 || e.y1 - e.y0 <= 0) continue;
      if (teileRoh.some((t) => flaeche(schnitt(t, e)) > 1e-6)) continue;
      if (!lGut(k, e)) continue;
      if (!beste || flaeche(e) > flaeche(beste)) beste = e;
    }
  }
  return { kasten: k, ecke: beste };
}

/** Wie viel Flaeche zwei Formen wirklich teilen (L ohne seine Ecke). */
function gemeinsam(a: Form, b: Form): number {
  let s = 0;
  for (const x of teile(a)) for (const y of teile(b)) s += flaeche(schnitt(x, y));
  return s;
}

/** Die Ecken einer Form im Uhrzeigersinn - vier beim Rechteck (so erkennt die Karte es als Rechteck), sechs beim L. */
export function eckenVon(f: Form): P[] {
  const k = f.kasten, e = f.ecke;
  if (!e) return ecken(k);
  const lo = { x: k.x0, y: k.y0 }, ro = { x: k.x1, y: k.y0 }, ru = { x: k.x1, y: k.y1 }, lu = { x: k.x0, y: k.y1 };
  const linksOben = e.x0 <= k.x0 + 1e-6 && e.y0 <= k.y0 + 1e-6;
  const rechtsOben = e.x1 >= k.x1 - 1e-6 && e.y0 <= k.y0 + 1e-6;
  const rechtsUnten = e.x1 >= k.x1 - 1e-6 && e.y1 >= k.y1 - 1e-6;
  if (linksOben) return [{ x: e.x1, y: k.y0 }, ro, ru, lu, { x: k.x0, y: e.y1 }, { x: e.x1, y: e.y1 }];
  if (rechtsOben) return [lo, { x: e.x0, y: k.y0 }, { x: e.x0, y: e.y1 }, { x: k.x1, y: e.y1 }, ru, lu];
  if (rechtsUnten) return [lo, ro, { x: k.x1, y: e.y0 }, { x: e.x0, y: e.y0 }, { x: e.x0, y: k.y1 }, lu];
  return [lo, ro, ru, { x: e.x1, y: k.y1 }, { x: e.x1, y: e.y0 }, { x: k.x0, y: e.y0 }];
}

/**
 * Die Formen der Karte.
 *
 * gruppen: je Gruppe (Teams naeher als ZUSAMMEN, lib/dropKarte) die Stellen ihrer Teams in Prozent (mit Kasten, wo er schon feststeht).
 * halb:    halbe Seite des Ersatz-Quadrats um eine Stelle ohne Ort (Prozent).
 * Ergebnis: je Form ihre Ecken und die Indizes der Gruppen darauf - mehrere, wenn sie im selben Ort landen.
 */
export function rechtecke(gruppen: Stelle[][], orte: Kasten[], halb: number, namen?: string[][][]): Array<{ punkte: P[]; form: Form; gruppen: number[] }> {
  const roh: Array<{ teile: Kasten[]; gruppen: number[]; fest: boolean; vorgabe: Form | null; punkte: P[]; noble: Kasten[]; nobleForm: Form | null }> = [];
  gruppen.forEach((stellen, gi) => {
    const ks: Kasten[] = [];
    for (const { p: s, ort: fest } of stellen) {
      const ort = fest ?? ortVon(s, orte) ?? { x0: runde(s.x - halb), y0: runde(s.y - halb), x1: runde(s.x + halb), y1: runde(s.y + halb) };
      if (!ks.some((k) => iou(k, ort) >= 0.5)) ks.push({ ...ort });
    }
    if (!ks.length) return;
    const u = ks.reduce(vereinigt);
    // Derselbe Ort (oder fast): eine Form, mehrere Gruppen darauf.
    // Stellen mit festem Kasten (Noble) bleiben getrennt, solange Noble sie getrennt fuehrt - nur derselbe Kasten ist dieselbe Stelle.
    const fest = stellen.every((s) => s.ort);
    // Liegt eine Prognose-Stelle im Kasten einer Noble-Stelle, ist es derselbe Ort - in beide Richtungen (Betreiber, 26.11.2026: "ADRIIBOOT" stand als
    // winziges Kaestchen mitten in der Stelle von "QUIX"). Frueher galt das nur, wenn die Noble-Gruppe zuerst kam; kam die Prognose zuerst, bekam sie
    // ein eigenes Quadrat, das beim Entzerren zwischen den Noble-Nachbarn fast verschwand. Zwei Gruppen mit Noble-Stellen werden dagegen nur eins,
    // wenn sie eine Noble-Stelle teilen - Nobles Zuordnung bleibt, auch wenn sich die Kaesten zweier Noble-Stellen ueberschneiden.
    const nobleHier = stellen.filter((s) => s.ort).map((s) => s.ort as Kasten);
    const gleich = roh.find((r) => {
      const ru = r.teile.reduce(vereinigt);
      if (fest && r.fest) return gleicherKasten(ru, u);
      if (nobleHier.length && r.noble.length) return nobleHier.some((k) => r.noble.some((q) => gleicherKasten(k, q)));
      return iou(ru, u) >= 0.5 || stellen.every((s) => enthaelt(ru, s.p)) || (!r.noble.length && r.punkte.every((q) => enthaelt(u, q)));
    });
    if (gleich) {
      for (const k of ks) if (!gleich.teile.some((t) => iou(t, k) >= 0.5)) gleich.teile.push(k);
      gleich.gruppen.push(gi); gleich.punkte.push(...stellen.map((s) => s.p)); gleich.noble.push(...nobleHier);
      gleich.nobleForm ??= stellen.find((s) => s.form)?.form ?? null;
      gleich.fest &&= fest; if (!gleich.fest) gleich.vorgabe = null;
    } else roh.push({ teile: ks, gruppen: [gi], fest, vorgabe: fest && stellen[0].form ? stellen[0].form : null, punkte: stellen.map((s) => s.p), noble: nobleHier, nobleForm: stellen.find((s) => s.form)?.form ?? null });
  });
  const formen = roh.map((r) => {
    // Kleine Stuecke (unter der Mindestgroesse) fallen weg, solange etwas Groesseres bleibt - sie zaehlen nur fuer den Kasten.
    // Eine Stelle von Noble: die eigene Form um ihre Flaeche (formUm), schon fertig.
    // Eine Noble-Stelle, auf der dazu Prognose-Teams stehen (alle in ihrem Kasten): ebenso Nobles Form, nicht der grobe Kasten um alles.
    const eineNoble = r.noble.length && r.noble.every((k) => gleicherKasten(k, r.noble[0])) && r.punkte.every((q) => enthaelt(r.noble[0], q));
    const vorgabe = r.vorgabe ?? (eineNoble ? r.nobleForm : null);
    if (vorgabe) return { kasten: { ...vorgabe.kasten }, ecke: vorgabe.ecke ? { ...vorgabe.ecke } : null };
    const gross = r.teile.filter((t) => t.x1 - t.x0 >= MIN_SEITE && t.y1 - t.y0 >= MIN_SEITE);
    return formAus(gross.length ? gross : r.teile);
  });
  // Mindestgroesse je Form, um die Mitte: so gross, dass ihre Namen hineinpassen (mindestGroesse), wenigstens MIN_SEITE.
  const mins = roh.map((r) => mindestGroesse(namen ? r.gruppen.map((gi) => namen[gi] ?? []) : []));
  formen.forEach((f, i) => {
    const k = f.kasten, mn = mins[i];
    if (k.x1 - k.x0 < mn.b) { const m = (k.x0 + k.x1) / 2; k.x0 = runde(m - mn.b / 2); k.x1 = runde(m + mn.b / 2); f.ecke = null; }
    if (k.y1 - k.y0 < mn.h) { const m = (k.y0 + k.y1) / 2; k.y0 = runde(m - mn.h / 2); k.y1 = runde(m + mn.h / 2); f.ecke = null; }
  });
  entzerre(formen, mins);
  return formen.map((f, i) => ({ punkte: eckenVon(f), form: f, gruppen: roh[i].gruppen }));
}

/*
 * Wie gross eine Form mindestens sein soll, damit ihre Namen hineinpassen (Betreiber, 26.11.2026: "ADRIIBOOT SNOK DORAAQG PB" stand in einem
 * winzigen Kaestchen, die Namen hingen weit heraus). Geschaetzt in Prozent des Kartenbildes fuer das kopierte Kartenbild (Insel fuellt das Bild,
 * Zoom gut 1,6, Schrift gut 1,1 % der Bildbreite): je Zeichen 0,45, je Zeile 1,0, dazu Rand. Nie unter MIN_SEITE, nie ueber MIN_GROSS -
 * lange Namen duerfen eine Stelle nicht zu einem Landstrich aufblasen.
 */
const JE_ZEICHEN = 0.45;
const JE_ZEILE = 1.0;
const MIN_RAND = 0.6;
const MIN_GROSS = 6;

/** Mindestbreite und -hoehe einer Form aus den Teams darauf (je Gruppe die Teams, je Team die Namen). Ein Team: ein Name je Zeile; mehrere: ein Team je Zeile. */
export function mindestGroesse(gruppen: string[][][]): { b: number; h: number } {
  const teams = gruppen.flat().filter((t) => t.length);
  if (!teams.length) return { b: MIN_SEITE, h: MIN_SEITE };
  const zeilen = teams.length === 1 ? teams[0] : teams.map((t) => t.join(' '));
  const zeichen = Math.max(...zeilen.map((z) => Math.min(16 * (teams.length === 1 ? 1 : 3), z.trim().length)));
  const grenze = (v: number) => runde(Math.max(MIN_SEITE, Math.min(MIN_GROSS, v)));
  return { b: grenze(zeichen * JE_ZEICHEN + MIN_RAND), h: grenze(zeilen.length * JE_ZEILE + MIN_RAND) };
}

/**
 * Ueberdeckungen aufloesen: zwei Formen, die sich wirklich ueberlappen (beim L zaehlt die leere Ecke nicht), werden durch eine gerade Linie
 * getrennt. Geprueft werden beide Achsen; die Linie steht zuerst in der Mitte der Ueberdeckung und wird so weit verschoben, dass jede Form ihre
 * Mindestgroesse behaelt (mins, sonst MIN_SEITE) - lieber verliert die grosse Nachbarin ein Stueck mehr, als dass eine Stelle zum Strich wird
 * (Betreiber, 26.11.2026). Unter den Linien, die beide Mindestgroessen halten, gilt die mit dem kleinsten Flaechenverlust; geht keine, die,
 * bei der die schlechter gestellte Form am meisten behaelt. Danach wird die Ecke eines L auf den neuen Kasten zugeschnitten; ist es dann kein
 * sauberes L mehr, wird es ein Rechteck. Wiederholt, bis nichts mehr ueberlappt (oder nach 50 Runden).
 */
export function entzerre(fs: Form[], mins?: Array<{ b: number; h: number }>): void {
  const minVon = (i: number) => mins?.[i] ?? { b: MIN_SEITE, h: MIN_SEITE };
  for (let n = 0; n < 50; n++) {
    let geaendert = false;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      if (gemeinsam(fs[i], fs[j]) <= 1e-6) continue;
      const a = fs[i].kasten, b = fs[j].kasten;
      const s = schnitt(a, b);
      geaendert = true;
      type Wahl = { achse: 'x' | 'y'; m: number; vorn: Kasten; hinten: Kasten; haelt: boolean; verlust: number; rest: number };
      const wahlen: Wahl[] = [];
      for (const achse of ['x', 'y'] as const) {
        const lo = achse === 'x' ? s.x0 : s.y0, hi = achse === 'x' ? s.x1 : s.y1;
        const mitteA = achse === 'x' ? (a.x0 + a.x1) / 2 : (a.y0 + a.y1) / 2, mitteB = achse === 'x' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2;
        const aVorn = mitteA <= mitteB;
        const vorn = aVorn ? a : b, hinten = aVorn ? b : a;
        const minVorn = (aVorn ? minVon(i) : minVon(j))[achse === 'x' ? 'b' : 'h'];
        const minHinten = (aVorn ? minVon(j) : minVon(i))[achse === 'x' ? 'b' : 'h'];
        const v0 = achse === 'x' ? vorn.x0 : vorn.y0, h1 = achse === 'x' ? hinten.x1 : hinten.y1;
        const unten = runde(v0 + minVorn), oben = runde(h1 - minHinten);
        // Die Mitte der Ueberdeckung, in die Spanne geschoben, in der beide ihre Mindestgroesse behalten.
        let m = runde((lo + hi) / 2);
        const haelt = unten <= oben;
        if (haelt) m = Math.min(Math.max(m, unten), oben);
        else m = runde((unten + oben) / 2);
        const neuVorn = achse === 'x' ? { ...vorn, x1: Math.min(vorn.x1, m) } : { ...vorn, y1: Math.min(vorn.y1, m) };
        const neuHinten = achse === 'x' ? { ...hinten, x0: Math.max(hinten.x0, m) } : { ...hinten, y0: Math.max(hinten.y0, m) };
        const verlust = flaeche(vorn) - flaeche(neuVorn) + flaeche(hinten) - flaeche(neuHinten);
        const rest = Math.min(flaeche(neuVorn) / (flaeche(vorn) || 1), flaeche(neuHinten) / (flaeche(hinten) || 1));
        wahlen.push({ achse, m, vorn, hinten, haelt, verlust, rest });
      }
      // Bei gleich gutem Ergebnis die Achse, auf der die Ueberdeckung schmaler ist (wie bisher) - so bleibt eine einfache Kante, wo es keine Rolle spielt.
      const schmal = s.x1 - s.x0 <= s.y1 - s.y0 ? 'x' : 'y';
      wahlen.sort((p, q) => Number(q.haelt) - Number(p.haelt)
        || (p.haelt ? p.verlust - q.verlust : q.rest - p.rest)
        || Number(q.achse === schmal) - Number(p.achse === schmal));
      const w = wahlen[0];
      if (w.achse === 'x') { w.vorn.x1 = Math.min(w.vorn.x1, w.m); w.hinten.x0 = Math.max(w.hinten.x0, w.m); }
      else { w.vorn.y1 = Math.min(w.vorn.y1, w.m); w.hinten.y0 = Math.max(w.hinten.y0, w.m); }
      for (const f of [fs[i], fs[j]]) {
        if (!f.ecke) continue;
        const e = schnitt(f.ecke, f.kasten);
        f.ecke = e.x1 - e.x0 > 0 && e.y1 - e.y0 > 0 && lGut(f.kasten, e) ? e : null;
      }
    }
    if (!geaendert) return;
  }
}

/** Ein Kasten als vier Ecken (im Uhrzeigersinn) - so erkennt die Karte (app/globals-solos/Bausteine) ihn als Rechteck. */
export const ecken = (k: Kasten): P[] => [{ x: k.x0, y: k.y0 }, { x: k.x1, y: k.y0 }, { x: k.x1, y: k.y1 }, { x: k.x0, y: k.y1 }];
