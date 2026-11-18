import { gecacht, REGIONEN } from '@/lib/epicCups';
import { liesClutch } from '@/lib/clutchLive';
import { liesJson } from '@/lib/ablage';
import { holeKatalog, wertungVon, type EpicKatalog } from '@/lib/cupWertung';

/*
 * Die Punktetabelle mit Rueckfall (Betreiber, 16.11.2026: jeder Cup zeigt unter About sein Punktesystem). Epic laesst Wertung und Auszahlung mit dem Cup aus
 * dem Katalog fallen - fuer vergangene Spieltage stand dann nichts mehr da. Drei Quellen, in dieser Reihenfolge:
 *   1. Epics Katalog der Region (scoreLocationScoringRuleSets / templates.scoringRules, lib/cupWertung);
 *   2. die Regeln, mit denen die Replay-Auswertung gerechnet hat (clutch/<w>.json, "regeln" - aus Epics Katalog gelesen, solange er den Spieltag fuehrte);
 *   3. Epics Kataloge der anderen Regionen: derselbe Spieltag, sonst dasselbe Fenster in einer anderen Region (gleiche Vorlage, gleiche Wertung).
 * Bleibt alles leer, sagt die Seite "Scoring not published".
 */
export type Regel = ReturnType<typeof wertungVon>[number];
export async function wertungMitRueckfall(epic: EpicKatalog, windowId: string, eventId: string): Promise<{ wertung: Regel[]; wertungQuelle: string | null }> {
  const direkt = wertungVon(epic, windowId, eventId);
  if (direkt.length) return { wertung: direkt, wertungQuelle: 'epic' };
  return gecacht(`wertung-rueck|${windowId}`, 30 * 60_000, async () => {
    // Abgelegt, solange Epic den Spieltag noch fuehrte (scripts/wertung-aus-katalog.mjs): je Regelsatz einmal, je Fenster nur sein Schluessel.
    try {
      const abgelegt = await liesJson<{ saetze?: Record<string, Regel[]>; fenster?: Record<string, string> } | null>('wertung-tabellen.json', null);
      const satz = abgelegt?.fenster?.[windowId];
      const r = satz ? abgelegt?.saetze?.[satz] ?? [] : [];
      if (r.length) return { wertung: r, wertungQuelle: 'archiv' };
    } catch { /* naechste Quelle */ }
    try {
      const c = await liesClutch<{ regeln?: Regel[] }>(windowId);
      const r = (c?.regeln ?? []).filter((x) => x && typeof x.punkte === 'number' && x.punkte > 0);
      if (r.length) return { wertung: r, wertungQuelle: 'replay' };
    } catch { /* naechste Quelle */ }
    const eigen = /_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i.exec(windowId)?.[1]?.toUpperCase() ?? '';
    for (const r of REGIONEN.filter((x) => x !== eigen)) {
      try {
        const k = await holeKatalog(r);
        const gleich = wertungVon(k, windowId, eventId);
        if (gleich.length) return { wertung: gleich, wertungQuelle: 'epic' };
        if (eigen) {
          const w2 = windowId.replace(new RegExp(`_${eigen}$`, 'i'), `_${r}`);
          const e2 = eventId.replace(new RegExp(`_${eigen}$`, 'i'), `_${r}`);
          const andere = wertungVon(k, w2, e2);
          if (andere.length) return { wertung: andere, wertungQuelle: `epic-${r}` };
        }
      } catch { /* naechste Region */ }
    }
    return { wertung: [] as Regel[], wertungQuelle: null };
  });
}
