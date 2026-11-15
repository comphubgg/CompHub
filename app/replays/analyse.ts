/*
 * Auswertungen unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf, Zonen-Glueck, Glueck gegen Leistung.
 * Alles aus dem vollen Replay (tools/replay-voll): orte [Zeit, x, y, z] in Zentimetern, zonen mit Mitte, Radius und Schrumpfzeiten.
 */

import type { RMatch, RZone } from '@/app/replays/ReplayAnsicht';

type Orte = Map<number, number[][]>;

/** Wo ein Spieler zur Zeit t stand (geradlinig zwischen zwei bekannten Orten), mit dem Abstand zum naechsten bekannten Ort in Sekunden. */
export function ortZwischen(liste: number[][] | undefined, t: number): { x: number; y: number; alt: number } | null {
  if (!liste?.length) return null;
  let lo = 0; let hi = liste.length - 1; let r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0) return null;
  const a = liste[r]; const b = liste[r + 1];
  if (!b) return { x: a[1], y: a[2], alt: t - a[0] };
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, alt: Math.min(t - a[0], b[0] - t) };
}
/** Der letzte Wert [Zeit, Wert] bis t. */
function wertBis(liste: number[][] | undefined, t: number): number | null {
  if (!liste?.length) return null;
  let lo = 0; let hi = liste.length - 1; let r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : liste[r][1];
}
/** Listen je Spieler nach Zeit sortiert (die Replays bringen sie nach Lesereihenfolge). */
export function sortiertJe(r?: Record<string, number[][]>): Map<number, number[][]> {
  return new Map(Object.entries(r ?? {}).map(([k, v]) => [Number(k), [...v].sort((a, b) => a[0] - b[0])]));
}

/** Der letzte Ort bis t (sortierte Liste) - mit dem Alter des Eintrags in Sekunden. */
export function letzterOrt(liste: number[][] | undefined, t: number): { x: number; y: number; z: number | null; alter: number } | null {
  if (!liste?.length) return null;
  let lo = 0; let hi = liste.length - 1; let r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (liste[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0) return null;
  const a = liste[r];
  return { x: a[1], y: a[2], z: typeof a[3] === 'number' ? a[3] : null, alter: t - a[0] };
}

/** Die Kreise der Zone: Kreis k (0-basiert) hat Mitte zonen[k].x/y und Radius zonen[k].radius. */
export interface ZonenKreis { nr: number; x: number; y: number; r: number; sichtbarAb: number; schrumpftAb: number; schrumpftBis: number }
export function zonenKreise(zonen: RZone[]): ZonenKreis[] {
  const raus: ZonenKreis[] = [];
  zonen.forEach((z, k) => {
    if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.radius !== 'number') return;
    // Ein Kreis ist zu sehen, sobald der vorige fertig geschrumpft ist (so zeigt Fortnite den naechsten Kreis); der erste ab kurz vor seinem Schrumpfen.
    const vor = zonen[k - 1];
    const sichtbarAb = k === 0 ? (z.schrumpftAb ?? 0) - 60 : (zonen[k - 2]?.schrumpftBis ?? (vor?.schrumpftAb ?? 0) - 60);
    raus.push({ nr: k + 1, x: z.x, y: z.y, r: z.radius, sichtbarAb, schrumpftAb: z.schrumpftAb ?? 0, schrumpftBis: z.schrumpftBis ?? 0 });
  });
  return raus;
}

/* ------------------------------------------------------------------ Hoehenverlauf */

export interface HoehenVerlauf {
  ab: number; bis: number; schritt: number;
  /** je Spieler die Hoehe in Metern je Schritt (null = unbekannt oder tot) */
  linien: Map<number, Array<number | null>>;
  /** je Zonen-Abschnitt: wer am laengsten der Hoechste war und wie lange (Sekunden) */
  abschnitte: Array<{ nr: number; von: number; bis: number; wer: number | null; sek: number }>;
  /** je Schritt der Hoechste */
  hoechster: Array<number | null>;
  maxM: number; minM: number;
}

export function hoehenVerlauf(m: RMatch, orte: Orte, ab: number, bis: number): HoehenVerlauf {
  const schritt = Math.max(1, Math.round((bis - ab) / 600));
  const linien = new Map<number, Array<number | null>>();
  const hoechster: Array<number | null> = [];
  let maxM = 0; let minM = 0;
  const echte = m.spieler.filter((s) => !s.bot && orte.has(s.id));
  const n = Math.floor((bis - ab) / schritt) + 1;
  for (const s of echte) linien.set(s.id, new Array(n).fill(null));
  for (let i = 0; i < n; i += 1) {
    const t = ab + i * schritt;
    let best: number | null = null; let bestZ = -Infinity;
    for (const s of echte) {
      if (typeof s.tod === 'number' && s.tod <= t) continue;
      const o = letzterOrt(orte.get(s.id), t);
      if (!o || o.z === null || o.alter > 20) continue;
      const mz = o.z / 100;
      linien.get(s.id)![i] = mz;
      if (mz > maxM) maxM = mz; if (mz < minM) minM = mz;
      if (mz > bestZ) { bestZ = mz; best = s.id; }
    }
    hoechster.push(best);
  }
  const kreise = zonenKreise(m.zonen);
  const grenzen = kreise.map((k) => k.schrumpftAb).filter((t) => t > ab && t < bis);
  const stuecke = [ab, ...grenzen, bis];
  const abschnitte = stuecke.slice(0, -1).map((von, k) => {
    const bisT = stuecke[k + 1];
    const zaehl = new Map<number, number>();
    for (let i = 0; i < n; i += 1) {
      const t = ab + i * schritt;
      if (t < von || t >= bisT) continue;
      const w = hoechster[i];
      if (w !== null) zaehl.set(w, (zaehl.get(w) ?? 0) + schritt);
    }
    let wer: number | null = null; let sek = 0;
    for (const [id, s] of zaehl) if (s > sek) { sek = s; wer = id; }
    return { nr: kreise.filter((x) => x.schrumpftAb <= von).length, von, bis: bisT, wer, sek };
  });
  return { ab, bis, schritt, linien, abschnitte, hoechster, maxM, minM };
}

/* ------------------------------------------------------------------ Zonen-Glueck */

/** Ab welchem Kreis gezaehlt wird: die ersten beiden Kreise entscheidet fast nur der Landeplatz. */
export const GLUECK_AB_KREIS = 3;
/** Kreise unter 20 m Radius zaehlen nicht mehr. */
export const MIN_RADIUS = 2_000;
/** So viele gleich weit verschobene Kreise in alle Richtungen werden verglichen. */
export const RICHTUNGEN = 36;

export interface ZonenZug {
  /** der neue Kreis (1-basiert) */
  nr: number; zeit: number;
  alt: ZonenKreis; neu: ZonenKreis;
  /** Glueck je Spieler in diesem Zug (Punkte, siehe Formel) */
  wert: Map<number, number>;
  /** Abstand zum Rand des neuen Kreises in Radien des alten (0 = schon drin) */
  abstand: Map<number, number>;
  orte: Map<number, { x: number; y: number }>;
}
export interface GlueckJe { summe: number; schnitt: number; zonen: number; drin: number; einzeln: Array<{ nr: number; diff: number; d: number }> }
export interface ZonenGlueck { zuege: ZonenZug[]; je: Map<number, GlueckJe> }

export const FORMEL_GLUECK = `For every zone from zone ${GLUECK_AB_KREIS} on, at the moment the new circle appears: d = distance from the player to the EDGE of the new circle (0 if he is already inside) ÷ radius of the circle he is standing in. The same new circle is then moved around the previous centre in ${RICHTUNGEN} directions at the same distance (every zone the game could have drawn there). Luck = (average d over those ${RICHTUNGEN} alternatives − d of the real zone) × 100. Total = sum over all zones the player was alive for; positive = the real zone was kinder than an average draw. Circles under ${MIN_RADIUS / 100} m are skipped.`;

export function zonenGlueck(m: RMatch, orte: Orte): ZonenGlueck {
  const kreise = zonenKreise(m.zonen);
  const echte = m.spieler.filter((s) => !s.bot && orte.has(s.id));
  const zuege: ZonenZug[] = [];
  for (let k = GLUECK_AB_KREIS - 1; k < kreise.length; k += 1) {
    const neu = kreise[k]; const alt = kreise[k - 1];
    if (!alt || alt.r < MIN_RADIUS) continue;
    const zeit = neu.sichtbarAb;
    const ox = neu.x - alt.x; const oy = neu.y - alt.y; const versatz = Math.hypot(ox, oy); const w0 = Math.atan2(oy, ox);
    const mitten = Array.from({ length: RICHTUNGEN }, (_, i) => { const w = w0 + (i * 2 * Math.PI) / RICHTUNGEN; return { x: alt.x + Math.cos(w) * versatz, y: alt.y + Math.sin(w) * versatz }; });
    const dVon = (p: { x: number; y: number }, c: { x: number; y: number }) => Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - neu.r) / alt.r;
    const wert = new Map<number, number>(); const abstand = new Map<number, number>(); const os = new Map<number, { x: number; y: number }>();
    for (const s of echte) {
      if (typeof s.tod === 'number' && s.tod <= zeit) continue;
      const o = ortZwischen(orte.get(s.id), zeit);
      if (!o || o.alt > 30) continue;
      const d = dVon(o, neu);
      const schnitt = mitten.reduce((a, c) => a + dVon(o, c), 0) / RICHTUNGEN;
      wert.set(s.id, (schnitt - d) * 100); abstand.set(s.id, d); os.set(s.id, { x: o.x, y: o.y });
    }
    if (!wert.size) continue;
    zuege.push({ nr: neu.nr, zeit, alt, neu, wert, abstand, orte: os });
  }
  const je = new Map<number, GlueckJe>();
  for (const s of echte) {
    const einzeln = zuege.filter((z) => z.wert.has(s.id)).map((z) => ({ nr: z.nr, d: z.abstand.get(s.id)!, diff: z.wert.get(s.id)! }));
    if (!einzeln.length) continue;
    const summe = einzeln.reduce((a, e) => a + e.diff, 0);
    je.set(s.id, { summe, schnitt: summe / einzeln.length, zonen: einzeln.length, drin: einzeln.filter((e) => e.d === 0).length, einzeln });
  }
  return { zuege, je };
}

/** Wort zum Glueck eines Games (Summe): wie die Werte sich auf echten Lobbys verteilen. */
export function glueckWort(summe: number): string {
  if (summe >= 60) return 'Great';
  if (summe >= 15) return 'Good';
  if (summe > -15) return 'Average';
  if (summe > -60) return 'Bad';
  return 'Terrible';
}

/* ------------------------------------------------------------------ Schaetzung: was der Spielstand erwarten liess */

/*
 * Ein einfaches, offenes Modell (kein maschinelles Lernen): zu jedem Kreis ab Kreis 3 bekommt jeder Lebende einen Wert aus seinem Stand -
 *   Leben + Schild (0-200), Eliminierungen bis dahin, Waffen und Heilung im Inventar (aufgehoben minus fallen gelassen), Abstand zum Rand der neuen Zone.
 * Jeder Teil wird ueber die Lebenden standardisiert (z-Wert) und gewichtet: 35 % Leben+Schild, 25 % Elims, 15 % Waffen, 10 % Heilung, 15 % Abstand (negativ).
 * Nach diesem Wert sortiert ergibt sich der erwartete Platz unter den Lebenden. "Gegen die Erwartung" = erwarteter Platz - echter Platz
 * (positiv = besser abgeschnitten als der Stand erwarten liess); mit Punkten des Cups dieselbe Rechnung in Punkten.
 */
export const GEWICHTE = { leben: 0.35, elims: 0.25, waffen: 0.15, heilung: 0.1, abstand: 0.15 };
export const FORMEL_SCHAETZUNG = 'Estimate at each zone from zone 3 on: every living player gets a score from his state - health + shield (35 %), elims so far (25 %), weapons (15 %) and heals (10 %) in his inventory, distance to the edge of the next zone (15 %, negative) - each standardised across the living players. Sorting by that score gives an expected placement. "vs estimate" = expected placement − real placement at the first measured zone (positive = did better than his state promised). Swing = biggest jump up in the expected placement from one zone to the next; Throw = biggest gap between an expected placement and the final one.';

const WAFFE = /^(WID|WMID)_(?!Paprika|Athena_(Flopper|Apple|Pepper|CandyCorn|WitchBroom|HappyGhost|FloppingRabbit)|DuckSnacks|GrappleKnife|DemonMask)/i;
const HEILUNG = /Shield|Medkit|MedBox|Bandage|Chug|Flopper|SlapShot|TeaCake|Berry/i;

export interface Schaetzung { zone: number; platz: number }
export interface SchaetzungJe { verlauf: Schaetzung[]; ersterPlatz: number | null; gegen: number | null; swing: { wert: number; zone: number } | null; throw: { wert: number; zone: number } | null }

export function schaetzung(m: RMatch & { leben?: Record<string, number[][]>; schild?: Record<string, number[][]>; loot?: number[][]; lootNamen?: string[] }, orte: Orte): Map<number, SchaetzungJe> {
  const leben = sortiertJe(m.leben); const schild = sortiertJe(m.schild);
  const loot = [...(m.loot ?? [])].sort((a, b) => a[0] - b[0]); const namen = m.lootNamen ?? [];
  const kreise = zonenKreise(m.zonen);
  const echte = m.spieler.filter((s) => !s.bot && orte.has(s.id));
  const feed = [...m.feed].sort((a, b) => a.t - b.t);
  const verlauf = new Map<number, Schaetzung[]>();
  for (let k = GLUECK_AB_KREIS - 1; k < kreise.length; k += 1) {
    const neu = kreise[k]; const alt = kreise[k - 1];
    if (!alt || alt.r < MIN_RADIUS) continue;
    const t = neu.sichtbarAb;
    const lebend = echte.filter((s) => !(typeof s.tod === 'number' && s.tod <= t));
    if (lebend.length < 3) continue;
    const elims = new Map<number, number>();
    for (const e of feed) { if (e.t > t) break; if (e.art === 'tot' && e.taeter !== undefined && e.taeter !== e.opfer) elims.set(e.taeter, (elims.get(e.taeter) ?? 0) + 1); }
    const inv = new Map<number, { w: Map<string, number>; h: Map<string, number> }>();
    for (const l of loot) {
      if (l[0] > t) break;
      const roh = namen[l[2]] ?? '';
      const art = WAFFE.test(roh) ? 'w' : HEILUNG.test(roh) ? 'h' : null;
      if (!art) continue;
      const x = inv.get(l[1]) ?? { w: new Map(), h: new Map() };
      x[art].set(roh, (x[art].get(roh) ?? 0) + (l[5] === 1 ? 1 : -1));
      inv.set(l[1], x);
    }
    const roh = lebend.map((s) => {
      const o = ortZwischen(orte.get(s.id), t);
      const i = inv.get(s.id);
      return {
        id: s.id,
        leben: (wertBis(leben.get(s.id), t) ?? 100) + Math.max(0, Math.min(100, wertBis(schild.get(s.id), t) ?? 0)),
        elims: elims.get(s.id) ?? 0,
        waffen: i ? Math.min(5, [...i.w.values()].filter((n) => n > 0).length) : 0,
        heilung: i ? Math.min(6, [...i.h.values()].reduce((a, n) => a + Math.max(0, n), 0)) : 0,
        abstand: o ? Math.max(0, Math.hypot(o.x - neu.x, o.y - neu.y) - neu.r) / alt.r : 1,
      };
    });
    const z = (k2: 'leben' | 'elims' | 'waffen' | 'heilung' | 'abstand') => {
      const w = roh.map((r) => r[k2]); const mw = w.reduce((a, b) => a + b, 0) / w.length;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mw) ** 2, 0) / w.length) || 1;
      return new Map(roh.map((r) => [r.id, (r[k2] - mw) / sd]));
    };
    const zl = z('leben'); const ze = z('elims'); const zw = z('waffen'); const zh = z('heilung'); const za = z('abstand');
    const wert = roh.map((r) => ({ id: r.id, s: GEWICHTE.leben * zl.get(r.id)! + GEWICHTE.elims * ze.get(r.id)! + GEWICHTE.waffen * zw.get(r.id)! + GEWICHTE.heilung * zh.get(r.id)! - GEWICHTE.abstand * za.get(r.id)! }))
      .sort((a, b) => b.s - a.s);
    wert.forEach((w, i) => { const l = verlauf.get(w.id) ?? []; l.push({ zone: neu.nr, platz: i + 1 }); verlauf.set(w.id, l); });
  }
  const raus = new Map<number, SchaetzungJe>();
  for (const s of echte) {
    const v = verlauf.get(s.id) ?? [];
    const echt = s.platz && s.platz < 999 ? s.platz : null;
    let swing: SchaetzungJe['swing'] = null; let wurf: SchaetzungJe['throw'] = null;
    for (let i = 1; i < v.length; i += 1) { const d = v[i - 1].platz - v[i].platz; if (d > 0 && (!swing || d > swing.wert)) swing = { wert: d, zone: v[i].zone }; }
    if (echt !== null) for (const x of v) { const d = echt - x.platz; if (d > 0 && (!wurf || d > wurf.wert)) wurf = { wert: d, zone: x.zone }; }
    raus.set(s.id, { verlauf: v, ersterPlatz: v[0]?.platz ?? null, gegen: v[0] && echt !== null ? v[0].platz - echt : null, swing, throw: wurf });
  }
  return raus;
}

/* ------------------------------------------------------------------ Start im Bus */

/**
 * Orte ab dem Bus (Betreiber, 15.11.2026): was vor dem Abflug liegt (Startinsel), faellt weg. Jeder Spieler beginnt am Bus im Augenblick seines Absprungs -
 * aus "figuren" (die neue Figur nach dem Abflug ist der Absprung), sonst der Punkt der Route, der seinem ersten Ort am naechsten liegt (im Absprungfenster).
 * Vom Absprung gleitet er geradlinig bis zu seinem ersten Ort am Boden.
 */
export function mitBusStart<T extends RMatch>(m: T): T {
  const roh = (m as { orte?: Record<string, number[][]> }).orte;
  const bus = m.bus?.[0]; const ab = m.busAb;
  if (!roh || !bus || typeof ab !== 'number' || typeof bus.x !== 'number' || typeof bus.y !== 'number' || typeof bus.yaw !== 'number' || !bus.tempo) return m;
  const rad = (bus.yaw * Math.PI) / 180; const c = Math.cos(rad); const sn = Math.sin(rad);
  const bei = (s: number) => ({ x: bus.x! + c * bus.tempo! * s, y: bus.y! + sn * bus.tempo! * s });
  const figuren = ((m as { figuren?: Array<{ id: number; t: number }> }).figuren ?? []);
  const vonS = (bus.sprungAb ?? 0) - 2; const bisS = (bus.flugBis ?? 60) + 2;
  const orte: Record<string, number[][]> = {};
  for (const [k, l] of Object.entries(roh)) {
    const id = Number(k);
    const nach = [...l].sort((a, b) => a[0] - b[0]).filter((o) => o[0] >= ab);
    if (!nach.length) { orte[k] = []; continue; }
    const erst = nach[0];
    const fig = figuren.find((f) => f.id === id && f.t - ab >= vonS && f.t - ab <= bisS);
    let s: number;
    if (fig && fig.t < erst[0]) s = fig.t - ab;
    else {
      const proj = ((erst[1] - bus.x) * c + (erst[2] - bus.y) * sn) / bus.tempo;
      s = Math.min(Math.max(proj, bus.sprungAb ?? 0), Math.min(bus.sprungBis ?? proj, erst[0] - ab - 3));
    }
    if (!(s >= 0) || ab + s >= erst[0]) { orte[k] = nach; continue; }
    const b = bei(s);
    orte[k] = [[ab + s, b.x, b.y, typeof erst[3] === 'number' ? erst[3] : 0], ...nach];
  }
  return { ...m, orte };
}
