/*
 * clutch/<w>.json und clutch-je/<w>.json lesen - vom Release, oder den Live-Stand des Servers, wenn der weiter ist (lib/clutchLiveWahl.mjs, 15.11.2026).
 *
 * Jeder Leser der vollen Replays geht hierueber (app/api/cup-spieler, cup-stats, spieler-detail, szene-stats, lib/ftPostsDaten): die Werte je Match
 * (clutch-je) MUESSEN aus derselben Quelle kommen wie clutch/<w>.json, sonst zeigen die Stuecke ("je.lage") ins Leere. Deshalb liest man clutch-je nur
 * mit dem Objekt, das liesClutch zurueckgab (liesClutchJe / liesClutchJeBereich).
 *
 * Fehlt der Live-Stand, ist er kaputt, aelter oder nicht weiter als das Release: das Release, wie vorher. Ein Fehler hier bricht nie eine Seite.
 */

import { dateiStempel, liesBereich, speicher } from '@/lib/ablage';
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

/*
 * Grosse Dateien (18.11.2026, Betreiber: "die Startseite hing eine Minute"). Der Vorrat in lib/ablageGithub haelt nur Dateien bis 40 MB - die
 * clutch/<w>.json der grossen Cups sind inzwischen 100-340 MB (S42_InoxtagIconCup_EU 344 MB, S43_OnePieceBuggyCup_EU 220 MB). Fuer sie kam bei JEDEM
 * Aufruf ein neuer Buffer, die WeakMap oben griff nie: jedes Mal die ganze Datei von GitHub (bis 20 s), toString und JSON.parse. Gemessen: 197 MB ->
 * 2,0-2,5 s, in denen die Ereignisschleife steht und keine Route antwortet (auch nicht /api/ping); /api/cup-stats liest dieselbe Datei zweimal. Auf dem
 * Server: /api/cup-stats fuer S42_InoxtagIconCup_ZB_EU brauchte 19-22 s, /api/ping stand waehrenddessen zweimal 2,2-3,3 s.
 *
 * Jetzt bleibt das geparste Objekt, solange die Datei am Release dieselbe ist (Stempel aus Tag, Groesse und ETag, lib/ablage dateiStempel - eine Anfrage
 * nach einem Byte, hoechstens alle zwei Minuten). Zugleich wird je Datei nur einmal gelesen (auch die beiden Leser in cup-stats teilen sich das), und
 * grosse Dateien werden nacheinander geparst, nicht mehrere Hundert MB zugleich. Hoechstens GROSS_BUDGET Bytes Quelle bleiben gemerkt (geparst etwa
 * das Dreifache im Heap), die am laengsten unbenutzte faellt zuerst heraus.
 */
const GROSS_AB = 40 * 1024 * 1024;
const GROSS_BUDGET = 450 * 1024 * 1024;
const GROSS_PRUEFEN_MS = 2 * 60_000;
const gross = new Map<string, { d: unknown; stempel: string; bytes: number; geprueft: number }>();
const grossUnterwegs = new Map<string, Promise<unknown>>();
let parseReihe: Promise<unknown> = Promise.resolve();

function parse<T>(roh: Buffer): T | null {
  try { return JSON.parse(fotosImJsonSperren(roh.toString('utf8'))) as T; } catch { return null; }
}

function grossMerken(w: string, eintrag: { d: unknown; stempel: string; bytes: number; geprueft: number }) {
  gross.delete(w);
  if (eintrag.bytes > GROSS_BUDGET) return;
  gross.set(w, eintrag);
  let summe = 0;
  for (const e of gross.values()) summe += e.bytes;
  for (const [k, e] of gross) {
    if (summe <= GROSS_BUDGET) break;
    if (k === w) continue;
    gross.delete(k);
    summe -= e.bytes;
  }
}

async function liesReleaseNeu<T>(w: string): Promise<T | null> {
  const roh = await speicher.lies(`clutch/${w}.json`);
  if (!roh) { gross.delete(w); return null; }
  if (geparst.has(roh)) return geparst.get(roh) as T | null;
  if (roh.length < GROSS_AB) {
    gross.delete(w);
    const d = parse<T>(roh);
    geparst.set(roh, d);
    return d;
  }
  // Grosse Dateien nacheinander parsen: zwei zugleich hiessen ein bis zwei GB Heap auf einmal, schneller fertig wird keiner.
  // Vor jedem Parse einmal zur Ereignisschleife zurueck (setImmediate): sonst liefen mehrere fertig geladene Dateien als Kette von Mikroaufgaben am
  // Stueck - nach dem Neustart am 18.11. 16:56 stand die Schleife so 35 s (Aufwaermen eines Profils: alle grossen Cups des Spielers auf einmal).
  const lauf = parseReihe.then(() => new Promise<void>((r) => { setImmediate(r); })).then(() => parse<T>(roh));
  parseReihe = lauf.catch(() => null);
  const d = await lauf;
  // Der Stand dazu - nur gemerkt, wenn seine Groesse zu den gelesenen Bytes passt (sonst wurde die Datei inzwischen ersetzt: beim naechsten Mal neu).
  const stempel = await dateiStempel(`clutch/${w}.json`).catch(() => null);
  if (d && stempel && stempel.includes(`|${roh.length}|`)) grossMerken(w, { d, stempel, bytes: roh.length, geprueft: Date.now() });
  return d;
}

async function liesRelease<T>(w: string): Promise<T | null> {
  const da = gross.get(w);
  if (da && Date.now() - da.geprueft < GROSS_PRUEFEN_MS) { gross.delete(w); gross.set(w, da); return da.d as T; }
  let l = grossUnterwegs.get(w) as Promise<T | null> | undefined;
  if (!l) {
    l = (async () => {
      if (da) {
        let stempel: string | null = null;
        try { stempel = await dateiStempel(`clutch/${w}.json`); } catch {
          // Stand nicht feststellbar (GitHub antwortet nicht): das Gemerkte gilt weiter, statt hunderte MB auf gut Glueck zu laden.
          da.geprueft = Date.now();
          return da.d as T;
        }
        if (stempel === da.stempel) { da.geprueft = Date.now(); return da.d as T; }
      }
      return liesReleaseNeu<T>(w);
    })().finally(() => { grossUnterwegs.delete(w); });
    grossUnterwegs.set(w, l);
  }
  return l;
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
