/*
 * Mehrtaegige Finals: Day 1 und Day 2 gehoeren zusammen (Betreiber, 28.10.2026: "bei den FNCS Solos Finals gibt es Day 1 und Day 2, und beide Tage zusammen ergeben das
 * kumulative Turnier-Leaderboard - der gewinnt, nicht der Erste eines Tages").
 *
 * Ein Tag ist Teil einer solchen Gruppe, wenn seine Kennung "Day<N>" traegt, ein Finale ist und es in derselben Region mindestens einen weiteren Tag mit sonst gleicher Kennung gibt.
 * Die Globals haben ihre eigene Kachel (anzeige "Kumulativ", lib/globalsCup) und gehoeren nicht dazu.
 */

export interface TagFenster { windowId: string; status?: string; istFinale?: boolean; anzeige?: string }

/** Die Nummer des Tages aus der Kennung ("..._Day2_EU" -> 2), 0 ohne. */
export const tagNummer = (windowId: string): number => Number(/Day(\d+)/i.exec(windowId)?.[1] ?? 0);

/** Die Tage der groessten mehrtaegigen Final-Gruppe, nach Tagesnummer geordnet - leer, wo es keine gibt. */
export function kumulativeTage<T extends TagFenster>(fenster: T[]): T[] {
  if (fenster.some((x) => x.anzeige === 'Kumulativ')) return [];
  const gruppen = new Map<string, T[]>();
  for (const x of fenster) {
    if (!/Day\d+/i.test(x.windowId) || !(x.istFinale || /final/i.test(x.windowId))) continue;
    const k = x.windowId.replace(/Day\d+/i, 'Day#');
    gruppen.set(k, [...(gruppen.get(k) ?? []), x]);
  }
  const wahl = [...gruppen.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length)[0];
  return wahl ? [...wahl].sort((a, b) => tagNummer(a.windowId) - tagNummer(b.windowId)) : [];
}
