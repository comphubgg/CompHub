/*
 * Auswertungen unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf, Zonen-Glueck, Glueck gegen Leistung.
 * Alles aus dem vollen Replay (tools/replay-voll): orte [Zeit, x, y, z] in Zentimetern, zonen mit Mitte, Radius und Schrumpfzeiten.
 */

import type { RMatch, RZone } from '@/app/replays/ReplayAnsicht';
import { ortBei } from '@/app/replays/SpielerEbene';

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
/** Kreise unter 20 m Radius zaehlen nicht mehr (dort ist jeder Meter ein Vielfaches des Radius); d wird bei 2 Radien gekappt. */
export const MIN_RADIUS = 2_000;
export const D_MAX = 2;

export interface ZonenZug {
  /** der neue Kreis (1-basiert) */
  nr: number; zeit: number;
  alt: ZonenKreis; neu: ZonenKreis;
  /** Abstand zur neuen Mitte geteilt durch den Radius des Kreises, in dem man steht - je Spieler */
  wert: Map<number, number>;
  orte: Map<number, { x: number; y: number }>;
  schnitt: number;
}
export interface ZonenGlueck { zuege: ZonenZug[]; je: Map<number, { score: number; zonen: number; einzeln: Array<{ nr: number; diff: number; d: number }> }> }

/*
 * Formel (auch im Info-Fenster der Seite):
 *   Fuer jeden Kreis k ab Kreis 3: im Augenblick, in dem Kreis k erscheint (der vorige ist fertig geschrumpft), d = Abstand des Spielers zur Mitte von Kreis k,
 *   geteilt durch den Radius des Kreises k-1, in dem er steht (hoechstens 2; Kreise unter 20 m zaehlen nicht). Lobby = Median von d ueber alle Lebenden mit bekanntem Ort.
 *   Glueck je Kreis = (Lobby-Median - d) x 100. Score = Mittel ueber alle Kreise, die der Spieler erlebt hat. Positiv = die Zone kam naeher als fuer die Lobby.
 */
export function zonenGlueck(m: RMatch, orte: Orte): ZonenGlueck {
  const kreise = zonenKreise(m.zonen);
  const echte = m.spieler.filter((s) => !s.bot && orte.has(s.id));
  const zuege: ZonenZug[] = [];
  for (let k = GLUECK_AB_KREIS - 1; k < kreise.length; k += 1) {
    const neu = kreise[k]; const alt = kreise[k - 1];
    if (!alt || alt.r < MIN_RADIUS) continue;
    if (Math.hypot(neu.x - alt.x, neu.y - alt.y) < 1 && neu.r === alt.r) continue;
    const zeit = neu.sichtbarAb;
    const wert = new Map<number, number>(); const os = new Map<number, { x: number; y: number }>();
    for (const s of echte) {
      if (typeof s.tod === 'number' && s.tod <= zeit) continue;
      // Ort zwischen zwei bekannten Punkten geradlinig; nur, wenn einer davon hoechstens 30 s entfernt liegt.
      const o = ortBei(orte.get(s.id), zeit);
      if (!o || o.alt > 30) continue;
      wert.set(s.id, Math.min(D_MAX, Math.hypot(o.x - neu.x, o.y - neu.y) / alt.r));
      os.set(s.id, { x: o.x, y: o.y });
    }
    if (wert.size < 3) continue;
    const sortiert = [...wert.values()].sort((a, b) => a - b);
    const schnitt = sortiert.length % 2 ? sortiert[(sortiert.length - 1) / 2] : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2;
    zuege.push({ nr: neu.nr, zeit, alt, neu, wert, orte: os, schnitt });
  }
  const je = new Map<number, { score: number; zonen: number; einzeln: Array<{ nr: number; diff: number; d: number }> }>();
  for (const s of echte) {
    const einzeln = zuege.filter((z) => z.wert.has(s.id)).map((z) => ({ nr: z.nr, d: z.wert.get(s.id)!, diff: (z.schnitt - z.wert.get(s.id)!) * 100 }));
    if (!einzeln.length) continue;
    je.set(s.id, { score: einzeln.reduce((a, e) => a + e.diff, 0) / einzeln.length, zonen: einzeln.length, einzeln });
  }
  return { zuege, je };
}
