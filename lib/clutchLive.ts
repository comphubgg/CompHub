/*
 * clutch/<w>.json und clutch-je/<w>.json lesen - vom Release, oder den Live-Stand des Servers, wenn der weiter ist (lib/clutchLiveWahl.mjs, 15.11.2026).
 *
 * Jeder Leser der vollen Replays geht hierueber (app/api/cup-spieler, cup-stats, spieler-detail, szene-stats, lib/ftPostsDaten): die Werte je Match
 * (clutch-je) MUESSEN aus derselben Quelle kommen wie clutch/<w>.json, sonst zeigen die Stuecke ("je.lage") ins Leere. Deshalb liest man clutch-je nur
 * mit dem Objekt, das liesClutch zurueckgab (liesClutchJe / liesClutchJeBereich).
 *
 * Fehlt der Live-Stand, ist er kaputt, aelter oder nicht weiter als das Release: das Release, wie vorher. Ein Fehler hier bricht nie eine Seite.
 */

import { liesBereich, speicher } from '@/lib/ablage';
import { liesLiveStand, nimmLive } from '@/lib/clutchLiveWahl.mjs';
import { fotosImJsonSperren } from '@/lib/spielerbildKlein';

/** Objekte aus dem Live-Stand -> ihre clutch-je-Datei (oder null bei altem Format). */
const ausLive = new WeakMap<object, Buffer | null>();

/*
 * Einmal geparst je Dateistand, nicht je Aufruf (Sofortspur, 17.11.2026). clutch/<w>.json eines grossen Spieltags hat bis 40 MB (LCQ EU 17.11.: 7.577 Matches,
 * JSON.parse 320-370 ms) und app/api/cup-stats liest ihn je Aufruf zweimal - jedes Mal stand die Ereignisschleife. Das Release haelt lib/ablageGithub eine
 * Minute als denselben Buffer vor (vorrat), der Live-Stand ist je Dateistand gemerkt (lib/clutchLiveWahl liesLiveStand) - an beiden haengt das geparste Objekt.
 * Darum bekommen alle Aufrufer DASSELBE Objekt: die Leser (cup-stats, cup-spieler, spieler-detail, szene-stats, cup-preise, lib/ftPostsDaten, lib/ftPosts)
 * lesen es nur (geprueft 17.11.2026). Es darf nicht veraendert werden - wer etwas daran aendern will, kopiert vorher.
 */
const geparst = new WeakMap<Buffer, unknown>();

async function liesRelease<T>(w: string): Promise<T | null> {
  const roh = await speicher.lies(`clutch/${w}.json`);
  if (!roh) return null;
  if (geparst.has(roh)) return geparst.get(roh) as T | null;
  let d: T | null = null;
  try { d = JSON.parse(fotosImJsonSperren(roh.toString('utf8'))) as T; } catch { d = null; }
  geparst.set(roh, d);
  return d;
}

/** clutch/<w>.json: der Live-Stand, wenn er mehr Matches kennt als das Release, sonst das Release; null, wenn es keins gibt. Nur lesen (siehe oben). */
export async function liesClutch<T extends object>(w: string): Promise<T | null> {
  const [release, live] = await Promise.all([
    liesRelease<T>(w).catch(() => null),
    liesLiveStand(w).catch(() => null),
  ]);
  try {
    if (live && nimmLive(live.d, release)) {
      const d = live.d as T;
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
