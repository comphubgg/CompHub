/*
 * clutch/<w>.json und clutch-je/<w>.json lesen - vom Release, oder den Live-Stand des Servers, wenn der weiter ist (lib/clutchLiveWahl.mjs, 15.11.2026).
 *
 * Jeder Leser der vollen Replays geht hierueber (app/api/cup-spieler, cup-stats, spieler-detail, szene-stats, lib/ftPostsDaten): die Werte je Match
 * (clutch-je) MUESSEN aus derselben Quelle kommen wie clutch/<w>.json, sonst zeigen die Stuecke ("je.lage") ins Leere. Deshalb liest man clutch-je nur
 * mit dem Objekt, das liesClutch zurueckgab (liesClutchJe / liesClutchJeBereich).
 *
 * Fehlt der Live-Stand, ist er kaputt, aelter oder nicht weiter als das Release: das Release, wie vorher. Ein Fehler hier bricht nie eine Seite.
 */

import { liesJson, liesBereich, speicher } from '@/lib/ablage';
import { liesLiveStand, nimmLive } from '@/lib/clutchLiveWahl.mjs';

/** Objekte aus dem Live-Stand -> ihre clutch-je-Datei (oder null bei altem Format). */
const ausLive = new WeakMap<object, Buffer | null>();

/** clutch/<w>.json: der Live-Stand, wenn er mehr Matches kennt als das Release, sonst das Release; null, wenn es keins gibt. */
export async function liesClutch<T extends object>(w: string): Promise<T | null> {
  const [release, live] = await Promise.all([
    liesJson<T | null>(`clutch/${w}.json`, null).catch(() => null),
    liesLiveStand(w).catch(() => null),
  ]);
  try {
    if (live && nimmLive(live.d, release)) {
      // Frisch geparst wie beim Release - Aufrufer duerfen das Objekt veraendern, ohne den gemerkten Stand zu treffen.
      const d = JSON.parse(live.roh.toString('utf8')) as T;
      ausLive.set(d, live.je ?? null);
      return d;
    }
  } catch { /* dann das Release */ }
  return release;
}

/** Stammt dieses Objekt aus dem Live-Stand (vorlaeufig, GitHub hat es noch nicht bestaetigt)? */
export function istLive(c: unknown): boolean {
  return !!c && typeof c === 'object' && ausLive.has(c);
}

/** Ein Stueck von clutch-je/<w>.json passend zu c (dem Ergebnis von liesClutch). */
export async function liesClutchJeBereich(w: string, c: unknown, start: number, laenge: number): Promise<Buffer | null> {
  if (istLive(c)) { const je = ausLive.get(c as object); return je ? je.subarray(start, start + laenge) : null; }
  return liesBereich(`clutch-je/${w}.json`, start, laenge);
}

/** Die ganze clutch-je/<w>.json passend zu c (dem Ergebnis von liesClutch). */
export async function liesClutchJe(w: string, c: unknown): Promise<Buffer | null> {
  if (istLive(c)) return ausLive.get(c as object) ?? null;
  return speicher.lies(`clutch-je/${w}.json`);
}
