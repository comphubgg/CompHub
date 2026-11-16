/*
 * Welche aelteren Spieltage die Schnellspur trotz "Frisches geht vor" mitnimmt (scripts/replays-holen.mjs, planSchreibenLauf).
 *
 * Gefunden am 15.11.2026: One Piece Buggy Cup NAC (BR und ZB) und Reload ZB Duos Cash Cup Event 1 Round 2 NAC standen 34 Stunden mit 6, 3 und 1 FAILED
 * ("request failed") und 358 bzw. 219 Matches, die Epic beim letzten Fragen noch als live fuehrte. Angefasst wurden sie zuletzt am 14.11. um 01:21 UTC:
 *   - von 01:47 bis 11:25 UTC antwortete www.thecomphub.com dem Planen nicht (kein Cup-Katalog, also kein Plan - der Lauf meldete trotzdem Erfolg),
 *   - danach war der Cup aelter als vier Stunden, und an einem Cup-Wochenende laeuft immer irgendwo ein frischer: "21 aeltere Spieltage warten" in jedem
 *     Plan bis heute,
 *   - die Nacharbeiter fassen Spieltage juenger als 36 Stunden nicht an (gehoertSchnellspur) und halten ohnehin an, solange die Schnellspur viel offen hat.
 * Ein Fehlversuch wurde so nie wiederholt, obwohl die Regel "erneut versuchen, bis ausgewertet oder bewiesen nicht vorhanden" gilt.
 *
 * Jetzt nimmt jeder Lauf daneben aeltere Spieltage der Schnellspur mit, solange es wenig ist: hoechstens TEUER_MAX Matches, die wirklich zu laden sind
 * (fehlgeschlagen, nie begonnen, haengengeblieben), und hoechstens GESAMT_MAX einschliesslich der Matches, die nur noch einmal nach dem Replay gefragt werden
 * (NOT_AVAILABLE - eine Abfrage der Metadaten, Sekunden). Nur Spieltage, die noch der Schnellspur gehoeren (Ende juenger als die Frist der Schnellspur
 * abzueglich einer Stunde), ausdruecklich angefragte oder gehaltene (schnell-halten.json) - sonst schrieben Nacharbeiter und Schnellspur denselben Stand.
 */

export const NACHZUEGLER_TEUER_MAX = 120;
export const NACHZUEGLER_GESAMT_MAX = 450;

/**
 * @param {Array<{windowId: string, offen: string[], vorher?: Record<string, {stand?: string}>, datum?: number, standDatum?: number|null, angefragt?: boolean, gehalten?: boolean}>} spaeter
 *   die aelteren Spieltage mit offenen Matches, in der Reihenfolge des Plans
 * @param {number} jetzt
 * @param {{ stunden?: number, teuerMax?: number, gesamtMax?: number }} [opt]
 */
export function nachzuegler(spaeter, jetzt, opt = {}) {
  const stunden = opt.stunden ?? 36;
  const teuerMax = opt.teuerMax ?? NACHZUEGLER_TEUER_MAX;
  const gesamtMax = opt.gesamtMax ?? NACHZUEGLER_GESAMT_MAX;
  const grenze = jetzt - Math.max(1, stunden - 1) * 3600_000;
  let teuer = 0; let gesamt = 0;
  const mit = [];
  for (const f of spaeter) {
    if (!f?.offen?.length) continue;
    /*
     * Massgeblich ist das Ende laut Katalog (f.datum). Der Stand kann noch den Beginn tragen, wenn sein letzter Zusammenschluss waehrend des Cups lief
     * (so bei den drei NAC-Spieltagen: Stand 00:00, Ende rund 03:00) - der Zusammenschluss hier schreibt dann das Ende hinein, und ab da sehen
     * Nacharbeiter und Schnellspur denselben Zeitpunkt. Bis dahin koennte ein Nacharbeiter denselben Spieltag lesen; schlimmstenfalls bleibt ein Teil
     * der Matches in seinem alten Zustand und kommt beim naechsten Lauf wieder dran - nichts geht verloren, was Epic noch hat.
     */
    // Gehalten (#12, lib/replaySchnellStand.mjs): aelter als die Frist, aber noch offen - die Nacharbeiter lassen ihn liegen, also ist er hier.
    const eigen = f.angefragt || f.gehalten || (f.datum ?? 0) > grenze;
    if (!eigen) continue;
    const t = f.offen.filter((id) => f.vorher?.[id]?.stand !== 'NOT_AVAILABLE').length;
    if (teuer + t > teuerMax || gesamt + f.offen.length > gesamtMax) continue;
    teuer += t; gesamt += f.offen.length;
    mit.push(f);
  }
  return mit;
}
