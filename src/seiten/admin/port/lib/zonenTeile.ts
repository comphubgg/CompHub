/*
 * Welche Spieltage ein Zonen-Bild zusammen zeigt und wie ihre Teile heissen (Betreiber, 16.11.2026: "nie ein generisches Day 1/Day 2").
 *
 * Der Name eines Teils kommt aus der Fenster-Kennung selbst - so, wie Epic sie vergibt:
 *
 *   S43_FNCSSoloReload_HeatsStage_Heat1_EU            -> "Heat 1"
 *   S43_FNCSSoloReloadQualifiers_Qual1Round1Day2_EU   -> "Round 1 · Day 2"
 *   S43_FNCSSoloReloadQualifiers_Qual1Round3_EU       -> "Round 3"
 *   S43_PerformanceEvaluation_Event1Round2_EU         -> "Event 1 · Round 2"
 *   S42_FNCSSolo_Final_Day1_EU                        -> "Day 1"
 *
 * "Day N" steht also nur dort, wo die Kennung wirklich einen Tag nennt.
 *
 * Zusammen gezeigt werden nur die Teile EINER Stufe: Heat 1 + Heat 2 derselben Heats, Day 1 + Day 2 derselben Runde. Bisher hing alles an
 * der eventId - und die teilen sich getrennte Cups (Performance Evaluation Event1Round2 und Event2Round2: epicgames_S43_PerformanceEvaluationTrios_EU,
 * zwei Cups an zwei Tagen). Die Stufe ist deshalb die Kennung ohne die Teil-Nummer (Heat N / Day N): was danach gleich ist, gehoert zusammen.
 */

/** Was einen Teil einer Stufe nummeriert - nur diese beiden werden zusammengelegt. */
const TEIL = /(Heat|Day)_?(\d+)/i;
/** Alle nummerierten Angaben, aus denen der Name entsteht. */
const ANGABEN = /(Event|Qual|Round|Heat|Day|Week|Session)_?(\d+)/gi;
const REGION = /_(NAW|NAC|NAE|NA|BR|EU|ME|ASIA|OCE)(?:_mg)?$/i;

const gross = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** Die Kennung ohne Saison-Vorsatz und Region ("S43_X_Heat1_EU" -> "X_Heat1"). */
function kern(windowId: string): string {
  return windowId.replace(/^S\d{2,3}_/i, '').replace(REGION, '').replace(/_mg(?=_|$)/i, '');
}

/** Die nummerierten Angaben der Kennung, der Reihe nach. "Qual 1" faellt weg, solange es nur die eine Qualifikation gibt. */
function angaben(windowId: string): Array<{ art: string; nr: number }> {
  const raus: Array<{ art: string; nr: number }> = [];
  for (const m of kern(windowId).matchAll(ANGABEN)) {
    const art = gross(m[1]); const nr = Number(m[2]);
    if (art === 'Qual' && nr === 1) continue;
    raus.push({ art, nr });
  }
  return raus;
}

/** Die Kennung ohne Zahlen als lesbarer Name, wenn sie keine nummerierte Angabe hat ("FNCSSolo_LastChanceLobby" -> "Last Chance Lobby"). */
function ersatzName(windowId: string): string {
  const teile = kern(windowId).split('_').filter(Boolean);
  const letzter = teile[teile.length - 1] ?? windowId;
  return letzter.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
}

/** Der Name eines Teils: "Heat 1", "Round 1 · Day 2", "Event 1 · Round 2". */
export function teilName(windowId: string): string {
  const a = angaben(windowId);
  return a.length ? a.map((x) => `${x.art} ${x.nr}`).join(' · ') : ersatzName(windowId);
}

/** Nur das, was den Teil innerhalb seiner Stufe unterscheidet ("Round 1 · Day 2" -> "Day 2") - fuer die Legende des gemeinsamen Bilds. */
export function teilKurz(windowId: string): string {
  const m = TEIL.exec(kern(windowId));
  return m ? `${gross(m[1])} ${Number(m[2])}` : teilName(windowId);
}

/** Was alle Teile der Stufe gemeinsam haben ("Round 1" bei Round 1 Day 1 + Day 2, leer bei Heat 1 + Heat 2). */
export function stufenName(windowId: string): string {
  return angaben(windowId).filter((x) => x.art !== 'Heat' && x.art !== 'Day').map((x) => `${x.art} ${x.nr}`).join(' · ');
}

/** Die Stufe eines Spieltags: seine Kennung ohne die Teil-Nummer. Gleiche Stufe = ein Bild. */
export function stufe(windowId: string): string {
  return windowId.replace(/(Heat|Day)_?\d+/i, '$1#');
}

/** Wie der Reiter fuer alle Teile zusammen heisst - deutscher Quelltext, uebersetzt in app/lib/sprache.ts. */
export function zusammenName(windowIds: string[]): string {
  const arten = new Set(windowIds.map((w) => (TEIL.exec(kern(w))?.[1] ?? '').toLowerCase()));
  if (windowIds.length === 2 && arten.size === 1 && arten.has('heat')) return 'Beide Heats zusammen';
  if (windowIds.length === 2 && arten.size === 1 && arten.has('day')) return 'Beide Tage zusammen';
  return 'Alle Teile zusammen';
}

/** Die Spieltage, die ein Zonen-Bild mit `tag` zusammen zeigt: gleiche eventId (also gleiche Region) und gleiche Stufe, nach Beginn sortiert. */
export function zonenGruppe<T extends { windowId: string; eventId?: string; matches: Array<{ beginn?: string }> }>(liste: T[], tag: T): T[] {
  const s = stufe(tag.windowId);
  // Ohne Heat/Day in der Kennung ist der Spieltag eine Stufe fuer sich (Event1Round2 und Event2Round2 sind zwei Cups).
  if (s === tag.windowId) return [tag];
  return liste.filter((x) => x.windowId === tag.windowId || ((x.eventId ?? '') === (tag.eventId ?? '') && stufe(x.windowId) === s))
    .sort((a, b) => String(a.matches[0]?.beginn ?? '').localeCompare(String(b.matches[0]?.beginn ?? '')));
}
