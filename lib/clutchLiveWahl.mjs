/*
 * Welcher Stand der vollen Replays eines Spieltags gilt (15.11.2026, Live-Spur Phase 2): der massgebliche vom Release (clutch/<w>.json, clutch-je/<w>.json,
 * GitHub "Clutch rechnen") oder der Live-Stand des Dienstes "live" auf dem Server (scripts/live-spur.mjs, gleiches Format, unter COMPHUB_LIVE_ORT
 * clutch/<w>.json + clutch-je/<w>.json, mit live: true und basis).
 *
 * Der Live-Stand gilt nur, wenn er live: true traegt, sich lesen laesst, seine Werte je Match (je.lage) genau zur clutch-je-Datei daneben passen und er
 * MEHR Matches kennt als das Release. Sonst - fehlt, kaputt, halb geschrieben, aelter oder gleich weit - immer das Release. Nie eine Ausnahme.
 *
 * Ohne Next-Aliase, damit es sich mit node allein pruefen laesst (scripts/clutch-live-test.mjs). Die Seite nutzt es ueber lib/clutchLive.ts.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const liveOrt = () => process.env.COMPHUB_LIVE_ORT || '/app/live';

const FENSTER_OK = /^[A-Za-z0-9_-]{1,200}$/;

/** Je Spieltag der zuletzt gelesene Live-Stand (roh) - neu gelesen nur, wenn sich Groesse oder Zeit einer der beiden Dateien aendert. */
const merker = new Map();
const MERKER_MAX = 12;

const angaben = async (p) => { try { const s = await fs.stat(p); return `${s.size}:${s.mtimeMs}`; } catch { return null; } };

/** Passen die Stuecke aus clutch/<w>.json "je.lage" genau zur clutch-je-Datei? (lib/jeSpiel.mjs: Stuecke hintereinander, je mit Zeilenende.) */
export function jePasst(d, je) {
  const lage = d?.je?.lage;
  if (!Array.isArray(lage) || !lage.length) return true; // altes Format (jeSpiel in der Datei) oder ohne Werte je Match
  if (!je) return false;
  const letzt = lage[lage.length - 1];
  return Array.isArray(letzt) && letzt[0] + letzt[1] + 1 === je.length;
}

/**
 * Der Live-Stand eines Spieltags: { roh, d, je } oder null (fehlt, unlesbar, nicht live, Werte je Match passen nicht).
 * roh ist der unveraenderte Inhalt - jeder Aufrufer bekommt so wie beim Release ein frisch gelesenes Objekt (liesLiveObjekt).
 */
export async function liesLiveStand(w, ort = liveOrt()) {
  if (!FENSTER_OK.test(w)) return null;
  const pD = path.join(ort, 'clutch', `${w}.json`);
  const pJe = path.join(ort, 'clutch-je', `${w}.json`);
  // Zweimal versuchen: live-spur schreibt erst clutch-je, dann clutch (je atomar umbenannt) - wer genau dazwischen liest, sieht ein Paar, das nicht passt.
  for (let v = 0; v < 2; v += 1) {
    const aD = await angaben(pD);
    if (!aD) { merker.delete(w); return null; }
    const aJe = await angaben(pJe);
    const schluessel = `${aD}|${aJe}`;
    const da = merker.get(w);
    if (da?.schluessel === schluessel) return da.stand;
    let stand = null;
    try {
      const roh = await fs.readFile(pD);
      const d = JSON.parse(roh.toString('utf8'));
      const je = aJe ? await fs.readFile(pJe).catch(() => null) : null;
      if (d && typeof d === 'object' && d.live === true && Array.isArray(d.matches) && jePasst(d, je)) stand = { roh, d, je };
    } catch { stand = null; }
    // Hat sich waehrenddessen etwas geaendert, noch einmal von vorn.
    if ((await angaben(pD)) !== aD || (await angaben(pJe)) !== aJe) continue;
    merker.set(w, { schluessel, stand });
    while (merker.size > MERKER_MAX) merker.delete(merker.keys().next().value);
    return stand;
  }
  return null;
}

/** Gilt der Live-Stand statt des Release? Nur mit mehr Matches - ist das Release gleich weit oder weiter, gilt es (es ist massgeblich). */
export function nimmLive(live, release) {
  if (!live || live.live !== true || !Array.isArray(live.matches)) return false;
  const rel = Array.isArray(release?.matches) ? release.matches.length : 0;
  return live.matches.length > rel;
}
