/*
 * Auswertung unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf; dazu der Start im Bus fuer die Karte.
 * Alles aus dem vollen Replay (tools/replay-voll): orte [Zeit, x, y, z] in Zentimetern, zonen mit Mitte, Radius und Schrumpfzeiten.
 */

import type { RMatch, RZone } from '@/app/replays/ReplayAnsicht';

type Orte = Map<number, number[][]>;

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
export interface ZonenKreis { nr: number; x: number; y: number; r: number; schrumpftAb: number; schrumpftBis: number }
export function zonenKreise(zonen: RZone[]): ZonenKreis[] {
  const raus: ZonenKreis[] = [];
  zonen.forEach((z, k) => {
    if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.radius !== 'number') return;
    raus.push({ nr: k + 1, x: z.x, y: z.y, r: z.radius, schrumpftAb: z.schrumpftAb ?? 0, schrumpftBis: z.schrumpftBis ?? 0 });
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
