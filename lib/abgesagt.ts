import { liesJson, schreibJson } from '@/lib/ablage';
import type { CupEintrag } from '@/lib/epicCups';
import { punkteFuerRunde, type WertungsRegel } from '@/lib/cupWertung';

/*
 * Abgesagte Matches.
 *
 * Bei den Globals 2026 ist in Runde 4 von Day 1 der Server fuer alle
 * abgestuerzt - das Match dauerte achtundvierzig Sekunden, und Epic fuehrt
 * trotzdem Punkte dafuer. Der Betreiber (28.9.2026): "mach ein Button fuer
 * den Admin um das Match zu cancellen manuell, dann werden die Punkte aus
 * dem Leaderboard geloescht ... also mach kein automatisch Cancel, sondern
 * nur wenn es der Admin macht." Das Match bleibt sichtbar, mit "Match
 * cancelled" - es gab es ja.
 *
 * Gespeichert je Spieltag die Kennungen der abgesagten Runden (Epics
 * sessionId), in der Ablage - der Admin schreibt es auf der Seite.
 */

export const ABGESAGT_DATEI = 'abgesagte-matches.json';

export type Abgesagt = Record<string, string[]>;

export async function liesAbgesagt(): Promise<Abgesagt> {
  return liesJson<Abgesagt>(ABGESAGT_DATEI, {});
}

/** Die abgesagten Runden eines Spieltags. */
export async function abgesagtFuer(windowId: string): Promise<Set<string>> {
  try { return new Set((await liesAbgesagt())[windowId] ?? []); } catch { return new Set(); }
}

export async function setzeAbgesagt(windowId: string, sessionId: string, abgesagt: boolean): Promise<Abgesagt> {
  const alles = await liesAbgesagt();
  const da = new Set(alles[windowId] ?? []);
  if (abgesagt) da.add(sessionId); else da.delete(sessionId);
  if (da.size) alles[windowId] = [...da]; else delete alles[windowId];
  await schreibJson(ABGESAGT_DATEI, alles);
  return alles;
}

/**
 * Die Bestenliste ohne die abgesagten Runden.
 *
 * Abgezogen wird, was die Runde nach Epics Wertungstabelle eingebracht hat
 * (Platz und Elims, siehe lib/cupWertung), dazu die Elims, das Spiel und
 * ein Sieg. Ohne Wertungstabelle laesst sich nicht sagen, wie viele Punkte
 * die Runde brachte - dann bleiben die Punkte, wie Epic sie fuehrt, und
 * "punkteUnsicher" sagt es.
 *
 * Neu geordnet wird nur, wenn die ganze Liste vorliegt (ganzeListe) - in
 * einem Ausschnitt einer langen Bestenliste liesse sich kein Rang vergeben.
 */
export function ohneAbgesagte(
  eintraege: CupEintrag[], abgesagt: Set<string>, wertung: WertungsRegel[], ganzeListe: boolean,
): { eintraege: CupEintrag[]; punkteUnsicher: boolean } {
  if (!abgesagt.size) return { eintraege, punkteUnsicher: false };
  let unsicher = false;
  const raus = eintraege.map((e) => {
    const weg = e.matches.filter((m) => m.sessionId && abgesagt.has(m.sessionId));
    if (!weg.length) return e;
    const n = { ...e, matches: e.matches.filter((m) => !(m.sessionId && abgesagt.has(m.sessionId))) };
    for (const m of weg) {
      const platz = typeof m.placement === 'number' ? m.placement : null;
      const p = punkteFuerRunde(wertung, platz, m.elims ?? 0);
      if (p === null) unsicher = true; else n.points -= p;
      n.elims -= m.elims ?? 0;
      n.games = Math.max(0, n.games - 1);
      if ((m.wins ?? 0) > 0 || platz === 1) n.wins = Math.max(0, n.wins - 1);
      n.damage -= m.damage ?? 0;
      n.damageTaken -= m.damageTaken ?? 0;
      n.headshots -= m.headshots ?? 0;
      // Auch die uebrigen Summen der Kacheln (Ueberlebenszeit, Strecke, Heilung ...): vorher zaehlte die abgesagte Runde dort weiter mit.
      n.timeAlive -= m.timeAlive ?? 0;
      n.damageSquad -= m.damageSquad ?? 0;
      n.strecke -= m.strecke ?? 0;
      n.kisten -= m.kisten ?? 0;
      n.heilung -= m.heilung ?? 0;
      n.schild -= m.schild ?? 0;
      n.matsGefarmt -= (m.holzGefarmt ?? 0) + (m.steinGefarmt ?? 0) + (m.metallGefarmt ?? 0) + (m.zutatGefarmt ?? 0);
      n.matsVerbaut -= (m.holzVerbaut ?? 0) + (m.steinVerbaut ?? 0) + (m.metallVerbaut ?? 0) + (m.zutatVerbaut ?? 0);
      // Die Aufteilung der Punkte (Platz / Elims) bleibt mit den Punkten im Einklang.
      if (n.punktePlatz !== undefined && typeof m.punktePlatz === 'number') n.punktePlatz = +(n.punktePlatz - m.punktePlatz).toFixed(2);
      if (n.punkteElims !== undefined && typeof m.punkteElim === 'number') n.punkteElims = +(n.punkteElims - m.punkteElim).toFixed(2);
    }
    const spiele = Math.max(1, n.games);
    // Gleiche Rundung und gleiche Formeln wie lib/epicCups (formeEintrag) - sonst blieben K/D und Zeit je Spiel auf dem Stand vor der Absage.
    n.avgPoints = n.games ? +(n.points / spiele).toFixed(2) : 0;
    n.avgElims = n.games ? +(n.elims / spiele).toFixed(2) : 0;
    n.avgTimeAlive = n.games ? Math.round(n.timeAlive / spiele) : 0;
    n.kd = n.games - n.wins > 0 ? +(n.elims / (n.games - n.wins)).toFixed(2) : n.elims;
    const plaetze = n.matches.map((m) => m.placement).filter((x): x is number => typeof x === 'number');
    n.avgPlace = plaetze.length ? +(plaetze.reduce((a, b) => a + b, 0) / plaetze.length).toFixed(2) : n.avgPlace;
    n.bestPlace = plaetze.length ? Math.min(...plaetze) : n.bestPlace;
    return n;
  });
  if (ganzeListe) {
    // Epics Reihenfolge bei Gleichstand: Punkte, Siege, Elims je Spiel, Platz je Spiel.
    const je = (e: CupEintrag, x: number) => x / Math.max(1, e.games);
    const platzSchnitt = (e: CupEintrag) => { const p = e.matches.map((m) => m.placement).filter((x): x is number => typeof x === 'number'); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : e.avgPlace; };
    raus.sort((a, b) => b.points - a.points || b.wins - a.wins
      || je(b, b.elims) - je(a, a.elims) || platzSchnitt(a) - platzSchnitt(b));
    raus.forEach((e, i) => { e.rank = i + 1; });
  }
  return { eintraege: raus, punkteUnsicher: unsicher };
}
