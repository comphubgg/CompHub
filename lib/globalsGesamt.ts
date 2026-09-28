/*
 * Das Finale der Globals: Day 1 und Day 2 zusammengerechnet.
 *
 * Der Katalogeintrag "FNCS Global Championship" hat bei Epic keine eigene
 * Bestenliste - gespielt wurde an zwei Tagen unter "Fortnite Global
 * Championship". Die Bestenliste des Finales rechnet beide Tage schon
 * zusammen (app/api/cup-leaderboard); der Betreiber (28.9.2026) wollte die
 * Team-Stats und die Matches genauso: "einfach alles zusammengerechnet ...
 * und die Matches ... einfach alle von beiden Tagen".
 *
 * Abgesagte Runden sind je Tag abgezogen, wie in der Bestenliste.
 */

import { gecacht, holeTop, type CupEintrag } from '@/lib/epicCups';
import { abgesagtFuer, ohneAbgesagte } from '@/lib/abgesagt';
import { holeKatalog, regionAus, wertungVon, type WertungsRegel } from '@/lib/cupWertung';
import { GLOBALS_EVENT, GLOBALS_TAGE, istGlobalsEvent, istGlobalsFenster } from '@/lib/globalsCup';

/** Ist das der Eintrag des Finales (nicht einer der beiden Tage)? */
export function istGlobalsFinale(event: string | null, windowId: string | null): boolean {
  return istGlobalsEvent(event, windowId) && !istGlobalsFenster(windowId ?? '');
}

/** Wann Epic die Bestenlisten der Globals zuletzt fortgeschrieben hat (der spaetere Tag). */
export async function globalsStand(limit: number): Promise<string> {
  const staende = await Promise.all(GLOBALS_TAGE.map((t) => gecacht(`stats|${GLOBALS_EVENT}|${t.windowId}|${limit}`, 60_000,
    () => holeTop(GLOBALS_EVENT, t.windowId, limit)).then((d) => d.updated ?? '').catch(() => '')));
  return staende.sort().pop() ?? '';
}

/** Die Bestenlisten beider Tage, abgesagte Runden abgezogen. */
export async function globalsTage(limit: number): Promise<CupEintrag[][]> {
  return Promise.all(GLOBALS_TAGE.map(async (t) => {
    const d = await gecacht(`stats|${GLOBALS_EVENT}|${t.windowId}|${limit}`, 60_000,
      () => holeTop(GLOBALS_EVENT, t.windowId, limit));
    const eintraege = d.entries as CupEintrag[];
    const abgesagt = await abgesagtFuer(t.windowId);
    if (!abgesagt.size) return eintraege;
    let wertung: WertungsRegel[] = [];
    try { wertung = wertungVon(await holeKatalog(regionAus(t.windowId)), t.windowId, GLOBALS_EVENT); } catch { /* ohne Tabelle */ }
    return ohneAbgesagte(eintraege, abgesagt, wertung, true).eintraege;
  }));
}

/** Die Zahlen, die sich ueber die Tage einfach addieren. */
const SUMMEN = [
  'points', 'elims', 'games', 'wins', 'damage', 'damageTaken', 'headshots', 'timeAlive',
  'damageSquad', 'matsGefarmt', 'matsVerbaut', 'strecke', 'kisten', 'heilung', 'schild',
] as const;

/**
 * Je Team ueber alle Tage: Summen addiert, Durchschnitte neu gerechnet, der
 * Platz aus der Gesamtpunktzahl. Ein Team erkennt sich an seinen Konten.
 */
export function summiereTage(tage: CupEintrag[][]): CupEintrag[] {
  const nach = new Map<string, CupEintrag>();
  for (const tag of tage) {
    for (const e of tag) {
      const k = e.players.map((p) => p.id).sort().join('|');
      const da = nach.get(k);
      if (!da) { nach.set(k, { ...e, matches: [...e.matches], players: [...e.players] }); continue; }
      for (const f of SUMMEN) da[f] = (da[f] ?? 0) + (e[f] ?? 0);
      da.matches.push(...e.matches);
      if (e.bestPlace !== null && (da.bestPlace === null || e.bestPlace < da.bestPlace)) da.bestPlace = e.bestPlace;
    }
  }
  const raus = [...nach.values()].map((e) => {
    const spiele = Math.max(1, e.games);
    const plaetze = e.matches.map((m) => m.placement).filter((x): x is number => typeof x === 'number');
    return {
      ...e,
      avgPoints: e.points / spiele, avgElims: e.elims / spiele, avgTimeAlive: e.timeAlive / spiele,
      avgPlace: plaetze.length ? +(plaetze.reduce((a, b) => a + b, 0) / plaetze.length).toFixed(2) : e.avgPlace,
      kd: e.games - e.wins > 0 ? +(e.elims / (e.games - e.wins)).toFixed(2) : e.elims,
    };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.avgElims - a.avgElims || a.avgPlace - b.avgPlace);
  raus.forEach((e, i) => { e.rank = i + 1; });
  return raus;
}
