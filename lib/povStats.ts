import { gecacht, listeCups, findeSpieler, REGIONEN, type CupEintrag, type CupFenster } from '@/lib/epicCups';
import { cupNameAusKennung, rundenName } from '@/lib/rundenName';

/*
 * Die Statistik eines Profis fuer sein POV: wo steht er gerade im laufenden Cup.
 *
 * Der Betreiber (11.10.2026): fuer Profis mit verbundenem Konto soll das POV auf Wunsch seine Werte zeigen -
 * wie das Overlay eines Streams, aber schlicht. Die Zahlen sind dieselben wie im Banner-Overlay: Epics
 * Bestenliste des laufenden Fensters, gefunden ueber die Konto-Id. Laeuft gerade nichts, zeigt das POV
 * nichts - es gibt keinen Platz, den man erfinden koennte (keine Platzierung vor dem ersten Match).
 */

export interface PovStand {
  /** Lesbarer Cup- und Rundenname. */
  cup: string;
  platz: number;
  punkte: number;
  elims: number;
  spiele: number;
  siege: number;
  /** Beste Platzierung eines Matches, falls es schon eines gab. */
  beste: number | null;
  aktualisiert: string;
}

const FENSTER_TTL = 3 * 60_000;
const STAND_TTL = 30_000;

/** Alle Fenster, die gerade laufen - ueber alle Regionen, ohne Doppelte. */
async function laufendeFenster(): Promise<{ fenster: CupFenster[]; alleListenFehlt: boolean }> {
  const nach = new Map<string, CupFenster>();
  const listen = await Promise.all(REGIONEN.map((r) =>
    gecacht(`events|${r}`, FENSTER_TTL, () => listeCups(r)).catch(() => null)));
  for (const l of listen) {
    for (const w of l?.windows ?? []) if (w.status === 'live') nach.set(w.windowId, w);
  }
  return { fenster: [...nach.values()], alleListenFehlt: listen.every((l) => l === null) };
}

/** Epic ist nicht erreichbar (kein Cup-Stand ermittelbar). Die Route antwortet dann mit 424. */
export class EpicAusfall extends Error {
  constructor() { super('Epic antwortet nicht.'); this.name = 'EpicAusfall'; }
}

/**
 * Der Stand dieses Spielers im laufenden Cup - oder null, wenn er in keinem laufenden spielt.
 *
 * Gesucht wird nur in den ersten Seiten der Bestenliste: ein Profi spielt vorne mit, und jede weitere Seite
 * waere eine Abfrage bei Epic, die fuer alle Zuschauer gleich anfaellt. Das Ergebnis haelt dreissig Sekunden.
 */
export async function standFuer(epicId: string): Promise<PovStand | null> {
  const id = epicId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  return gecacht(`povstand|${id}`, STAND_TTL, async () => {
    const { fenster: alle, alleListenFehlt } = await laufendeFenster();
    const fenster = alle.slice(0, 12);
    let fehlgeschlagen = 0;
    let beste: { w: CupFenster; e: CupEintrag; stand: string } | null = null;
    // Alle laufenden Fenster gleichzeitig, aber nur die ersten Seiten - zehn Fenster sind der Ausnahmefall.
    const treffer = await Promise.all(fenster.map(async (w) => {
      try {
        const d = await findeSpieler(w.eventId, w.windowId, [], [id], 8);
        const e = (d.entries as CupEintrag[] | undefined)?.find((x) => x.players.some((p) => p.id === id));
        return e ? { w, e, stand: String((d as { updated?: string }).updated ?? new Date().toISOString()) } : null;
      } catch { fehlgeschlagen++; return null; }
    }));
    // Mehrere Treffer (Qualifikation und Cup am selben Abend): das Fenster mit den meisten gespielten Matches.
    for (const t of treffer) if (t && (!beste || t.e.games > beste.e.games)) beste = t;
    if (!beste) {
      // Kein Treffer ist nur dann "spielt nirgends", wenn Epic uns auch antworten konnte. Ein einzelnes
      // wackliges Fenster eines fremden Cups zaehlt nicht: erst wenn alle Regionslisten fehlen oder mehr
      // als die Haelfte der Fenster-Abfragen scheiterte, ist es ein Ausfall (nicht gecacht, Route: 424).
      if (alleListenFehlt || fehlgeschlagen * 2 > fenster.length) throw new EpicAusfall();
      return null;
    }
    const { w, e } = beste;
    const runde = rundenName(w.windowId, /Final/i.test(w.windowId));
    const cup = [cupNameAusKennung(w.windowId), runde].filter(Boolean).join(' · ');
    return {
      cup, platz: e.rank, punkte: e.points, elims: e.elims, spiele: e.games, siege: e.wins,
      beste: e.bestPlace ?? null, aktualisiert: beste.stand,
    } satisfies PovStand;
  });
}
