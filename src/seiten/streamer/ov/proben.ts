import { useEffect, useState } from 'react';
import type { OverlayGroesse } from './Bausteine';
import { STANDARD as CUSTOM_STANDARD } from './custom/Baukasten';
import { GLOBALS_EVENT, GLOBALS_TAGE } from './lib/globalsCup';
import { OV } from './ort';

/*
 * Die Beispiel-Overlays: je Art die echte Overlay-Datei von thecomphub.com mit Beispielwerten - fuer die Galerie, das Studio und die Seite vor
 * dem Anmelden. `aus` ist der Ausschnitt, in dem das Overlay auf seiner Flaeche sitzt, solange es seine Groesse nicht selbst meldet.
 * `ort` setzt das Overlay an eine Stelle der 1920 x 1080-Flaeche (look.js) - so liegen mehrere auf einem Stream-Bild, ohne sich zu decken.
 */
const TAG1 = GLOBALS_TAGE[0].windowId;
const json = (o: unknown) => encodeURIComponent(JSON.stringify(o));

export interface Probe { src: string; b: number; h: number; aus: OverlayGroesse }
export interface ProbeOrt { vert: 'top' | 'middle' | 'bottom'; horiz: 'left' | 'center' | 'right'; rand: number }

/** Was die Beispiele an echten Daten brauchen: ein Duo der Globals (Team Banner) und einen Cup mit Qualifikations-Schaetzung (Qual line). */
export interface ProbeDaten { duo: string; qual: { event: string; window: string } | null }

export function probeVon(schluessel: string, daten: ProbeDaten, start: number, ort?: ProbeOrt): Probe | null {
  const { duo, qual } = daten;
  const lage = ort ? { look: 'clean', ...ort } : {};
  switch (schluessel) {
    case 'custom':
      return { src: `${OV}/overlay/custom.html?vorschau=${json({ ...CUSTOM_STANDARD, punkte1: 2, punkte2: 1, ...(ort ?? {}) })}`, b: 1920, h: 1080, aus: { x: 360, y: 0, w: 1200, h: 675 } };
    case 'teamkarte':
      return { src: `${OV}/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190${duo ? `&id=${encodeURIComponent(duo)}` : '&probe=1&spieler=2'}`, b: 1280, h: 720, aus: { x: 160, y: 0, w: 960, h: 540 } };
    case 'standings':
      return {
        src: `${OV}/overlay/standings.html?vorschau=${json({
          event: GLOBALS_EVENT, window: TAG1, fenster: [], titel: 'LEADERBOARD', kopfrechts: 'POINTS', thema: '', ecken: 10, marke: 0, von: 1, bis: 5, takt: 15,
          grund: '11 17 32', deckkraft: 0.85, akzent: '#a78bfa', schrift: 16, breite: 420, bilder: false, gold: 1, pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8, ...lage,
        })}`, b: ort ? 1920 : 960, h: ort ? 1080 : 540, aus: { x: 0, y: 0, w: 480, h: 270 },
      };
    case 'timer':
      return {
        src: `${OV}/overlay/timer.html?vorschau=${json({ event: '', window: '', beginn: start, cup: 'FNCS Global Championship', wort: 'STARTS IN', cupZeigen: true, grund: '0 0 0', deckkraft: 0.72, akzent: '#a78bfa', schrift: 34, abStunden: 12, anordnung: 'zwei', immer: true, ...lage })}`,
        b: ort ? 1920 : 960, h: ort ? 1080 : 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    case 'qual':
      return {
        src: `${OV}/overlay/qual.html?vorschau=${json({ event: qual?.event ?? GLOBALS_EVENT, window: qual?.window ?? TAG1, schwelle: qual ? 0 : 50, wort: 'QUAL ~', takt: 15, grund: '0 0 0', deckkraft: 0.72, akzent: '#a78bfa', schrift: 18, pausiert: 0, sichtbar: 15, anordnung: 'zwei', ...lage })}`,
        b: ort ? 1920 : 960, h: ort ? 1080 : 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    case 'offspawn':
      return {
        src: `${OV}/overlay/offspawn.html?vorschau=${json({ kopf: 'OFFSPAWN', kopfZeigen: true, name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 2, punkte2: 1, farbe1: '#ffffff', farbe2: '#ffffff', breite: 0, massstab: 1, bilder1: [], bilder2: [], bild1: '', bild2: '', grund: '0 0 0', deckkraft: 0.72, schrift: 30, thema: '', ecken: 12, ...lage })}`,
        b: ort ? 1920 : 960, h: ort ? 1080 : 540, aus: { x: 0, y: 0, w: 400, h: 225 },
      };
    default:
      return null;
  }
}

/** Die Reihenfolge der Arten in Galerie und Studio: erst die kostenlosen. */
export const REIHENFOLGE = ['timer', 'offspawn', 'custom', 'teamkarte', 'standings', 'qual'];

/*
 * Die echten Daten der Beispiele, einmal je Seite geholt:
 *   duo  - ein echtes Duo der Global Championship fuer das Team Banner (leer, bis es geladen ist - dann zeigt das Banner Probe-Spieler)
 *   qual - der juengste Cash-Cup-Spieltag (EU) aus dem Cup-Katalog: Cash Cups haben fruehere Ausgaben, daraus rechnet die Seite die Schaetzung
 */
let katalog: Promise<ProbeDaten['qual']> | null = null;
function qualCup(): Promise<ProbeDaten['qual']> {
  katalog ??= fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j: { cups?: Array<{ art?: string; regionen?: Record<string, Array<{ status?: string; begin?: number; eventId?: string; windowId?: string }>> }> }) => {
    let best: { begin: number; event: string; window: string } | null = null;
    for (const c of j.cups ?? []) {
      if (c.art !== 'cash') continue;
      for (const w of c.regionen?.EU ?? []) {
        if (w.status === 'kommt' || !w.eventId || !w.windowId || !w.begin) continue;
        if (!best || w.begin > best.begin) best = { begin: w.begin, event: w.eventId, window: w.windowId };
      }
    }
    return best ? { event: best.event, window: best.window } : null;
  }).catch(() => null);
  return katalog;
}

export function useProbeDaten(): ProbeDaten {
  const [d, setD] = useState<ProbeDaten>({ duo: '', qual: null });
  useEffect(() => {
    let weg = false;
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(TAG1)}`).then((r) => r.json())
      .then((j) => { if (weg) return; const ids = ((j?.teams ?? [])[0]?.spieler ?? []).map((s: { turnierId: string }) => s.turnierId).filter(Boolean); if (ids.length) setD((alt) => ({ ...alt, duo: ids.join(',') })); })
      .catch(() => {});
    void qualCup().then((q) => { if (!weg && q) setD((alt) => ({ ...alt, qual: q })); });
    return () => { weg = true; };
  }, []);
  return d;
}
