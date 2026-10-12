import { alleTurniere, detail } from '@/lib/nobleKarte';
import { liesJson } from '@/lib/ablage';
import { saisonName, SAISON_NAMEN } from '@/lib/szeneStats';

/*
 * Das Verzeichnis der Maps: jeder Cup, zu dem es eine Karte gibt.
 *
 * Der Betreiber (12.10.2026): unter "Maps" soll man jede Saison und jeden Cup finden - mit Bild, Datum, Region, Tag -,
 * nach FNCS, Performance, Division und Reload sortierbar, als Kacheln oder Liste, und "zu jeder einzelnen" Map eine
 * Karte. Die Karten kommen von Noble Practice (lib/nobleKarte): je Fenster (Fast Tracks, Heat 1, Finals, Tag 2 ...) die
 * Landepunkte der Teams. Noble fuehrt die europaeischen Turniere seit Juli 2025; fuer aeltere Cups gibt es dort nichts,
 * und das steht auf der Seite auch so. Epics Cup-Archiv (cup-archiv.json) liefert zu jedem Fenster Titel, Bild und
 * Beginn - was dort fehlt, bleibt leer, statt geraten zu werden.
 */

export type MapTyp = 'fncs' | 'performance' | 'division' | 'reload' | 'sonst';

export interface MapEintrag {
  turnierId: string;
  region: string;
  windowId: string;
  /** Der Cup, wie Noble ihn nennt. */
  cup: string;
  /** Das Fenster darin ("Finals", "Heat 1" ...). */
  fenster: string;
  /** Epics Titel des Spieltags, wo das Cup-Archiv ihn kennt. */
  titel: string;
  datum: number | null;
  saison: string;
  /** "CH7 S4" */
  saisonKurz: string;
  saisonName: string;
  typ: MapTyp;
  bild: string | null;
  /** Epics Ereignis-Kennung - fuer die Bestenliste (leer, wo das Cup-Archiv das Fenster nicht kennt). */
  eventId: string | null;
  /** Ende des Spieltags (ms), wo bekannt. */
  ende: number | null;
}

/** "Chapter 7 Season 4" -> "CH7 S4"; Namen wie "The Simpsons" bleiben, wie sie sind. */
function kurzName(name: string): string {
  const m = name.match(/^Chapter\s*(\d+)\s*Season\s*(\S+)$/i);
  return m ? `CH${m[1]} S${m[2]}` : name;
}

export function typVon(name: string): MapTyp {
  const n = name.toLowerCase();
  if (/reload/.test(n)) return 'reload';
  if (/division/.test(n)) return 'division';
  if (/performance/.test(n)) return 'performance';
  if (/fncs|global championship|major|last chance|solos/.test(n)) return 'fncs';
  return 'sonst';
}

/** Ein eigenes Bild je Art, wo Epics Bild fehlt - nur Bilder, die im Werkzeug liegen. */
const BILD_JE_TYP: Record<MapTyp, string | null> = {
  performance: '/tournaments/Fortnite Performance Evaluation.jpg',
  division: '/tournaments/FNCS Division 1.jpg',
  fncs: '/cups/fncs-global-championship-2026.jpg',
  reload: '/tournaments/Reload Elite Series Finals.jpg',
  sonst: null,
};

interface ArchivEintrag { windowId?: string; eventId?: string; titel?: string; bild?: string; begin?: number; end?: number }

let merker: { bis: number; liste: MapEintrag[] } | null = null;

/** Alle Fenster aller Noble-Turniere, neueste zuerst. Fuenfzehn Minuten im Speicher. */
export async function mapsVerzeichnis(): Promise<MapEintrag[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;

  const [turniere, archiv] = await Promise.all([
    alleTurniere(),
    liesJson<ArchivEintrag[]>('cup-archiv.json', []).catch(() => [] as ArchivEintrag[]),
  ]);
  const imArchiv = new Map<string, ArchivEintrag>();
  for (const a of archiv) if (a.windowId) imArchiv.set(a.windowId, a);

  const liste: MapEintrag[] = [];
  await Promise.all(turniere.flatMap((t) => (t.regions ?? []).map(async (r) => {
    try {
      const d = await detail(t.id, r.code);
      for (const w of d.tournamentData?.windows ?? []) {
        const a = imArchiv.get(w.windowId);
        const typ = typVon(`${t.tournamentName} ${a?.titel ?? ''}`);
        const saison = (w.windowId.match(/^(S\d+)_/) ?? [])[1] ?? '';
        const datum = w.startDate ? Date.parse(w.startDate) : (a?.begin ?? null);
        liste.push({
          turnierId: t.id, region: r.code, windowId: w.windowId,
          cup: t.tournamentName, fenster: w.name, titel: a?.titel || `${t.tournamentName} · ${w.name}`,
          datum: Number.isFinite(datum as number) ? datum : null,
          saison, saisonKurz: '', saisonName: '',
          typ, bild: a?.bild ?? BILD_JE_TYP[typ],
          eventId: a?.eventId ?? null, ende: w.endDate ? Date.parse(w.endDate) : (a?.end ?? null),
        });
      }
    } catch { /* dieses Turnier ueberspringen */ }
  })));

  /*
   * Fenster ohne Saison in ihrer Kennung (EWC_..., FNCS_Major_1_Summit_..., Erazer_LAN) bekommen die Saison, in der ihr
   * Datum liegt: die letzte, deren erstes bekanntes Fenster nicht nach ihnen liegt. Die Grenzen kommen aus den Fenstern,
   * die ihre Saison selbst tragen - nichts ist von Hand eingetragen.
   */
  const beginnJe = new Map<string, number>();
  for (const e of liste) if (e.saison && e.datum) beginnJe.set(e.saison, Math.min(beginnJe.get(e.saison) ?? Infinity, e.datum));
  const folge = [...beginnJe.entries()].sort((a, b) => a[1] - b[1]);
  for (const e of liste) {
    if (!e.saison && e.datum) {
      const dran = [...folge].reverse().find(([, b]) => b <= (e.datum as number));
      if (dran) e.saison = dran[0];
    }
    if (e.saison) { e.saisonName = saisonName(e.saison); e.saisonKurz = kurzName(e.saisonName); }
  }

  liste.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  merker = { bis: Date.now() + 15 * 60_000, liste };
  return liste;
}

/* ------------------------------------------------------------------ Kapitel und Saisons */

export interface SaisonInfo { kennung: string; nr: number; name: string; kurz: string; kapitel: number }

/** Zu welchem Kapitel eine Saison gehoert - nach Epics Zaehlung (S8 bis S42). */
function kapitelVon(nr: number): number {
  if (nr <= 10) return 1;
  if (nr <= 18) return 2;
  if (nr <= 22) return 3;
  if (nr <= 27) return 4;
  if (nr <= 31) return 5;
  if (nr === 32) return 2; // Chapter 2 Remix
  if (nr <= 38) return 6;
  return 7;
}

/** Alle Saisons von Chapter 1 bis heute, geordnet - auch die ohne Karten (die Seite zeigt sie grau). */
export function alleSaisons(): SaisonInfo[] {
  return Object.keys(SAISON_NAMEN).map((k) => {
    const nr = Number(k.slice(1));
    const name = SAISON_NAMEN[k];
    return { kennung: k, nr, name, kurz: kurzName(name), kapitel: kapitelVon(nr) };
  }).sort((a, b) => a.nr - b.nr);
}
