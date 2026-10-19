/*
 * Titel mit dem, woran man einen Cup sofort erkennt (Betreiber, 19.10.2026): "wenn es irgendwo eine Heat hat oder Zero Build und Build, muss das im Titel
 * stehen, nicht irgendwie als kleine Marke" - und zwei Kacheln mit demselben Namen ("Performance Evaluation Cup" und "Fortnite" am selben Tag) sind
 * nicht auseinanderzuhalten. Hier steht, was dafuer aus den Kennungen und der Playlist gelesen werden kann; nichts davon ist geraten.
 */

export type Groesse = 'Solo' | 'Duos' | 'Trios' | 'Squads';

/** Die Teamgroesse aus einer Playlist oder Kennung ("Playlist_ShowdownTournament_NPM_Duos", "...PerformanceEvaluationTrios_EU"). */
export function groesseAus(...texte: Array<string | undefined | null>): Groesse | null {
  const s = texte.filter(Boolean).join(' ');
  if (/trio/i.test(s)) return 'Trios';
  if (/squad/i.test(s)) return 'Squads';
  if (/duo/i.test(s)) return 'Duos';
  if (/solo/i.test(s)) return 'Solo';
  return null;
}

/** Zero Build laut Playlist oder Fensterkennung ("...NoBuildDuo...", "S42_RankedCupReloadDuos_ZB_Event1_EU") oder schon im Titel. */
export function istZeroBuild(...texte: Array<string | undefined | null>): boolean {
  return /no\s*build|zero\s*build|(^|[_\s(])zb([_\s)]|$)/i.test(texte.filter(Boolean).join(' '));
}

/** "Heat 2", "Last Chance Qualifier" aus einer Fensterkennung - oder nichts. */
export function fensterZusatz(windowId?: string | null): string | null {
  if (!windowId) return null;
  const h = /Heat(\d+)/i.exec(windowId);
  if (h) return `Heat ${h[1]}`;
  if (/LastChance|LCQ/i.test(windowId)) return 'Last Chance Qualifier';
  return null;
}

/**
 * Der Titel eines Spieltags, so, dass man ihn erkennt: bei Heats die Nummer ("FNCS Solos Heats" -> "FNCS Solos Heat 2"), bei Zero Build der Zusatz.
 * Steht beides schon im Titel, bleibt er, wie er ist.
 */
export function titelMit(titel: string, windowId?: string | null, playlist?: string | null): string {
  let t = (titel ?? '').trim();
  if (!t) return t;
  const z = fensterZusatz(windowId);
  if (z) {
    const zahl = /Heat (\d+)/.exec(z)?.[1];
    if (zahl) {
      if (!new RegExp(`heat\\s*${zahl}\\b`, 'i').test(t)) t = /\bHeats?\b/i.test(t) ? t.replace(/\bHeats?\b/i, `Heat ${zahl}`) : `${t} · Heat ${zahl}`;
    } else if (!/last\s*chance|lcq/i.test(t)) {
      t = `${t} · ${z}`;
    }
  }
  if (istZeroBuild(windowId, playlist) && !istZeroBuild(t)) t = `${t} · Zero Build`;
  return t;
}
