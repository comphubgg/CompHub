/*
 * Der Stand der Schnellspur (scripts/replays-holen.mjs --plan-schreiben, .github/workflows/replays-schnell.yml) fuer den Admin und die Nacharbeiter (#12).
 *
 * 1. Quelle nicht erreichbar. Vom 14.11.2026 01:47 bis 11:25 UTC antwortete www.thecomphub.com dem Planen nicht. Es gab keinen Cup-Katalog und also keinen
 *    Plan, und der Lauf meldete trotzdem Erfolg: der Fehler ging in "| tail" unter, und niemand sah ihn (lib/replayNachzuegler.mjs). Jetzt schreibt jeder
 *    Plan "schnell-status.json" an den Release "signale": ok oder nicht, seit wann nicht, die Fehlermeldung. /admin/replays zeigt das an
 *    (app/api/replays?live=1), und der Lauf endet rot.
 *
 * 2. Aelter als 36 Stunden. Bis hierher liess die Schnellspur einen Spieltag 36 Stunden nach seinem Ende fallen, ganz gleich, ob dort noch etwas offen war.
 *    Danach gehoerte er den Nacharbeitern, und die halten an, solange die Schnellspur viel offen meldet. An einem Cup-Wochenende ist das stundenlang.
 *    Jetzt behaelt die Schnellspur einen Spieltag, der bei ihr noch offen ist, bis zu HALTEN_TAGE Tage lang und fragt weiter nach (Fehlversuche und
 *    "noch nicht bei Epic" nach nochmalFragen). Welche das sind, steht in "schnell-halten.json" am Release "signale". Die Nacharbeiter lesen dieselbe
 *    Datei und lassen diese Spieltage liegen, denn ein Spieltag hat nur einen Schreiber. Abgegeben wird erst, wenn nichts mehr offen ist, nach
 *    HALTEN_TAGE Tagen, oder wenn mehr als HALTEN_TEUER_MAX Matches wirklich neu zu laden sind (das schaffen die Nacharbeiter besser, und die Schnellspur
 *    nimmt neben frischen Cups nur so viele mit, lib/replayNachzuegler.mjs). Jede Abgabe steht im Protokoll und im Status.
 *    Ist die Datei aelter als HALTEN_FRISCH_MS, plant die Schnellspur nicht mehr (Quelle weg, Lauf haengt): dann gilt sie nicht, und die Nacharbeiter
 *    uebernehmen. Nichts bleibt liegen, weil gerade niemand plant.
 */

export const HALTEN_TAGE = 7;
export const HALTEN_TEUER_MAX = 120;
export const HALTEN_FRISCH_MS = 6 * 3600_000;
const FRIST_MS = 31 * 864e5;

/** Was an einem Match noch zu tun ist: 'fertig' | 'teuer' (laden und lesen) | 'fragen' (nur noch einmal nach dem Replay fragen). */
export function matchArbeit(m, jetzt) {
  if (!m) return 'teuer';
  if (m.stand === 'PARSED') return 'fertig';
  if (m.stand === 'NOT_AVAILABLE') {
    const erstmals = Date.parse(m.erstmals ?? m.zuletzt ?? '') || jetzt;
    return jetzt - erstmals > FRIST_MS ? 'fertig' : 'fragen';
  }
  return 'teuer';
}

/**
 * Die gehaltenen Spieltage aus dem Signal - oder null, wenn das Signal nicht gilt (fehlt, ist alt, ist kaputt).
 * @param {unknown} signal  der Inhalt von schnell-halten.json
 * @returns {Map<string, {datum: number}> | null}
 */
export function gehaltenAus(signal, jetzt) {
  const s = /** @type {{zeit?: string, fenster?: Record<string, {datum?: number}>}} */ (signal ?? null);
  if (!s || typeof s !== 'object' || !s.fenster || typeof s.fenster !== 'object') return null;
  const zeit = Date.parse(s.zeit ?? '');
  if (!Number.isFinite(zeit) || jetzt - zeit > HALTEN_FRISCH_MS) return null;
  const raus = new Map();
  for (const [w, x] of Object.entries(s.fenster)) {
    const datum = Number(x?.datum) || 0;
    if (datum > jetzt - HALTEN_TAGE * 864e5) raus.set(w, { datum });
  }
  return raus;
}

/**
 * Welche Spieltage die Schnellspur nach diesem Plan behaelt und welche sie abgibt.
 * @param {Array<{windowId: string, season?: string, datum: number, matches: Record<string, {stand?: string, erstmals?: string, zuletzt?: string}>}>} fenster
 *   alle Spieltage des Plans mit ihrem Stand
 * @param {number} jetzt
 * @param {{stunden?: number}} [opt]  wie lange ein Spieltag ohnehin der Schnellspur gehoert (--stunden, 36)
 */
export function haltenBerechnen(fenster, jetzt, opt = {}) {
  const frischBis = jetzt - (opt.stunden ?? 36) * 3600_000;
  const halten = {};
  const abgegeben = [];
  for (const f of fenster) {
    let teuer = 0; let fragen = 0;
    for (const m of Object.values(f.matches ?? {})) {
      const a = matchArbeit(m, jetzt);
      if (a === 'teuer') teuer += 1; else if (a === 'fragen') fragen += 1;
    }
    if (!teuer && !fragen) continue;
    const frisch = f.datum > frischBis;
    const zuAlt = f.datum <= jetzt - HALTEN_TAGE * 864e5;
    if (frisch || (!zuAlt && teuer <= HALTEN_TEUER_MAX)) {
      halten[f.windowId] = { datum: f.datum, teuer, fragen };
    } else {
      abgegeben.push({ windowId: f.windowId, datum: f.datum, teuer, fragen, grund: zuAlt ? `aelter als ${HALTEN_TAGE} Tage` : `${teuer} Matches zu laden (mehr als ${HALTEN_TEUER_MAX})` });
    }
  }
  return { halten, abgegeben };
}
