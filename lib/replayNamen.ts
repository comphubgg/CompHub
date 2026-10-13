/* Namen und Datum fuer die Replay-Seiten - reine Funktionen, auch im Browser nutzbar (lib/replayVoll liest Dateien und gehoert nur auf den Server). */

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });
const UHRZEIT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });

/** Replay-Zeitstempel ("2026-09-27T14:51:16.252", UTC ohne Zone) als Datum. */
export const replayDatum = (iso?: string) => { const d = Date.parse(`${iso ?? ''}Z`); return Number.isFinite(d) ? DATUM.format(new Date(d)) : ''; };
export const replayUhrzeit = (iso?: string) => { const d = Date.parse(`${iso ?? ''}Z`); return Number.isFinite(d) ? UHRZEIT.format(new Date(d)) : ''; };

/** "MannekenPis_Day2" -> "Day 2", "..._Week4Final_EU" -> "Week 4"; sonst die Nummer in der Reihe. */
export function tagName(windowId: string, i: number): string {
  const tag = /Day\s*_?(\d+)/i.exec(windowId);
  if (tag) return `Day ${tag[1]}`;
  const woche = /Week\s*_?(\d+)/i.exec(windowId);
  if (woche) return `Week ${woche[1]}`;
  return `#${i + 1}`;
}

/** Name ohne Turniermarke wie "[FNCS26] ". */
export const ohneMarke = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '').trim() || '?';

/**
 * Epics rohe Kennung als lesbarer Titel: "S42_ReloadDuosVictoryCup_Event3_Round2_EU" -> "Reload Duos Victory Cup · Event 3 · Round 2".
 * Titel, die schon Namen sind ("Fortnite Global Championship"), bleiben, wie sie sind.
 */
export function schoenerTitel(titel: string): string {
  if (!/^S\d+_/.test(titel)) return titel;
  return titel.replace(/^S\d+_/, '').replace(/_(NAW|NAC|BR|EU|ME|ASIA|OCE)$/, '').split('_')
    .map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')).join(' · ');
}
