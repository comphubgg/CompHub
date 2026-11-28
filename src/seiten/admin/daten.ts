import { useCallback, useEffect, useState } from 'react';

/*
 * Gemeinsame Abrufe des Admin-Bereichs (Design-System 3.0, 28.11.2026). Nur lesend, nur Endpunkte, die die Werkzeuge ohnehin fragen:
 *   /api/admin/zentrale   Laeufe (GitHub Actions), offene Meldungen, offene Auftraege, Ladezeiten
 *   /api/replays          Fenster mit Zaehlern je Zustand -> was in der Frist noch offen ist
 */

export interface Lauf { status: string; conclusion: string | null; zeit: string; url: string }
export interface Job { schluessel: string; name: string; was: string; aktiv: Lauf | null; letzter: Lauf | null; ampel: 'ok' | 'warnung' | 'fehler' | 'unbekannt'; hinweis: string }
export interface Auftrag { id: number; titel: string; hinweis: string; seit: string }
export interface LadeZeile { titel: string; jetzt: number; median: number; verlauf: number[] }
export interface Zentrale { jobs: Job[]; kontaktOffen: number | null; auftraege: Auftrag[] | null; ladezeiten: LadeZeile[] | null; stand: number }
export interface ReplayStand { gesamt: number; ausgewertet: number; offenInFrist: number; imFristGesamt: number }

/** Abruf mit Zustand: Daten, 'recht' bei 401/403, 'netz' bei Fehler. `neu(true)` holt frisch (haengt ?frisch=1 an, wo es das gibt). */
export function useAbruf<T>(url: string | null, takt = 0) {
  const [daten, setDaten] = useState<T | null>(null);
  const [fehler, setFehler] = useState<'' | 'recht' | 'netz'>('');
  const [laedt, setLaedt] = useState(false);
  const neu = useCallback(async (frisch = false) => {
    if (!url) return;
    setLaedt(true);
    try {
      const r = await fetch(frisch ? `${url}${url.includes('?') ? '&' : '?'}frisch=1` : url, { cache: 'no-store' });
      if (r.status === 401 || r.status === 403) { setFehler('recht'); return; }
      if (!r.ok) { setFehler('netz'); return; }
      setDaten(await r.json() as T); setFehler('');
    } catch { setFehler('netz'); } finally { setLaedt(false); }
  }, [url]);
  useEffect(() => {
    void neu();
    if (!takt) return undefined;
    const t = window.setInterval(() => void neu(), takt);
    return () => window.clearInterval(t);
  }, [neu, takt]);
  return { daten, fehler, laedt, neu };
}

/** Replays: wie viele in der 31-Tage-Frist noch offen sind (Arena-Spieltage ohne Server-Replays zaehlen nicht - sie kommen nie). */
export function replayStand(j: { fenster?: Array<{ datum?: number; zaehler?: Record<string, number> }> } | null): ReplayStand | null {
  if (!j?.fenster) return null;
  const grenze = Date.now() - 31 * 864e5;
  let gesamt = 0; let ausgewertet = 0; let offenInFrist = 0; let imFristGesamt = 0;
  for (const f of j.fenster) {
    const z = f.zaehler ?? {};
    const nieDa = !(z.PARSED > 0) && Object.keys(z).every((k) => k === 'NOT_AVAILABLE');
    for (const [stand, n] of Object.entries(z)) {
      gesamt += n;
      if (stand === 'PARSED') ausgewertet += n;
      if ((f.datum ?? 0) > grenze) imFristGesamt += n;
      if (stand !== 'PARSED' && stand !== 'ABGELAUFEN' && (f.datum ?? 0) > grenze && !nieDa) offenInFrist += n;
    }
  }
  return { gesamt, ausgewertet, offenInFrist, imFristGesamt };
}
/** Ab wann offene Replays wirklich auffallen (sonst rauscht jede Kleinigkeit). */
export const replaysAuffaellig = (r: ReplayStand) => r.offenInFrist > Math.max(50, r.imFristGesamt * 0.005);

// Namen und Hinweise der Laeufe kommen deutsch von /api/admin/zentrale - die englischen Fassungen.
const LAEUFE: Record<string, string> = {
  Datenlauf: 'Data run', Replays: 'Replays', 'Solo Clutch': 'Solo Clutch', 'Org-Kader': 'Org rosters', 'Team-Verlauf': 'Team history', 'Seitenprüfung': 'Site check',
  Sicherung: 'Backup', 'Live-Replays': 'Live replays', 'Replays (voll)': 'Replays (full)', Spielerwerte: 'Player stats', Sofortspur: 'Fast lane',
  'Statistiken, Profile, Startseite': 'Statistics, profiles, start page', 'Rückstand abarbeiten': 'Work off the backlog', 'Punkte je Spieltag': 'Points per match day',
  'Abgleich mit Liquipedia': 'Sync with Liquipedia', 'Antworten alle Seiten?': 'Do all pages respond?', 'Tägliche Kopie der gepflegten Dateien': 'Daily copy of the maintained files',
  'Laufende Cups einsammeln': 'Collect running cups', 'Zonen, Kill-Feed, Spieler je Match': 'Zones, kill feed, players per match', 'Replay-Werte für die Event-Seiten': 'Replay stats for the event pages',
  'Volle Cup-Werte Minuten nach jedem Match': 'Full cup stats minutes after each match', 'noch kein Lauf': 'no run yet', 'der letzte Lauf ist gescheitert': 'the last run failed',
  'länger nichts gelaufen als üblich': 'nothing ran for longer than usual', unbekannt: 'unknown',
};
export const laufText = (s: string) => LAEUFE[s] ?? s;

/** "5 min ago", "3 h ago", "2 days ago" */
export function vor(zeit: string | number): string {
  const m = Math.max(0, Math.round((Date.now() - (typeof zeit === 'number' ? zeit : Date.parse(zeit))) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
/** Zustand eines Laufs in einem Satz. */
export function laufZeile(j: Job): string {
  if (j.aktiv) return `${j.aktiv.status === 'queued' || j.aktiv.status === 'pending' ? 'Waiting' : 'Running'} · ${vor(j.aktiv.zeit)}`;
  if (j.letzter) return `${j.letzter.conclusion === 'success' ? 'OK' : 'Failed'} · ${vor(j.letzter.zeit)}`;
  return laufText(j.hinweis || 'unbekannt');
}
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
export const langsam = (z: LadeZeile) => z.jetzt > Math.max(3000, 2.5 * z.median);
