import { alleTurniere, detail } from '@/lib/nobleKarte';
import { liesJson } from '@/lib/ablage';
import { saisonName, SAISON_NAMEN } from '@/lib/szeneStats';
import { typVon, cupBild, SAISON_TITEL, SAISON_OHNE_MAPS, type MapTyp } from '@/lib/mapsTyp';
import { titelMit } from '@/lib/cupTitel';
import { alteEintraege } from '@/lib/alteMaps';

export { typVon };
export type { MapTyp };

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
  /** Der Name der Saison ("Vibin'"), wo es einen gibt. */
  saisonTitel?: string;
  typ: MapTyp;
  bild: string | null;
  /** Epics Ereignis-Kennung - fuer die Bestenliste (leer, wo das Cup-Archiv das Fenster nicht kennt). */
  eventId: string | null;
  /** Ende des Spieltags (ms), wo bekannt. */
  ende: number | null;
  /** Reihenfolge innerhalb eines Cups, wo das Datum fehlt (ältere Events: Week 1, Week 2 ...). */
  reihe?: number;
  /** Ein LAN-Event. */
  lan?: boolean;
  /** Eine Karte ohne Landepunkte aus dem Archiv - der Admin zeichnet sie von Hand ein (lib/alteMaps). */
  alt?: boolean;
  /** Das Fenster, unter dem Epic die Bestenliste fuehrt, wenn es anders heisst als das von Noble. */
  epicFenster?: string;
  /** Ein Finale an zwei Tagen (Day 1, Day 2): die Fenster der Tage. Die Karte ist eine, die Bestenliste hat einen Tag-Umschalter. */
  tage?: Array<{ name: string; windowId: string; eventId: string | null }>;
}

/** "Chapter 7 Season 4" -> "CH7 S4"; Namen wie "The Simpsons" bleiben, wie sie sind. */
function kurzName(name: string): string {
  const m = name.match(/^Chapter\s*(\d+)\s*Season\s*(\S+)$/i);
  return m ? `CH${m[1]} S${m[2]}` : name;
}

/** Ein eigenes Bild je Art, wo Epics Bild fehlt - nur Bilder, die im Werkzeug liegen. */
const BILD_JE_TYP: Record<MapTyp, string | null> = {
  performance: '/tournaments/Fortnite Performance Evaluation.jpg',
  division: '/tournaments/FNCS Division 1.jpg',
  fncs: '/cups/fncs-global-championship-2026-hd.jpg',
  reload: '/cups/reload-road-to-ewc.webp',
  sonst: null,
};

interface ArchivEintrag { windowId?: string; eventId?: string; titel?: string; bild?: string; begin?: number; end?: number; region?: string }

let merker: { bis: number; liste: MapEintrag[]; versteckt: MapEintrag[] } | null = null;

/** Nach einer Aenderung der alten Karten: das Verzeichnis beim naechsten Abruf neu bauen. */
export function vergissVerzeichnis() { merker = null; }

/** Die vom Admin versteckten alten Karten - damit sie sich zurueckholen lassen. */
export async function versteckteKarten(): Promise<MapEintrag[]> {
  await mapsVerzeichnis();
  return merker?.versteckt ?? [];
}

/** Alle Fenster aller Noble-Turniere, neueste zuerst. Fuenfzehn Minuten im Speicher. */
export async function mapsVerzeichnis(): Promise<MapEintrag[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;

  const [turniere, archiv] = await Promise.all([
    alleTurniere(),
    liesJson<ArchivEintrag[]>('cup-archiv.json', []).catch(() => [] as ArchivEintrag[]),
  ]);
  const imArchiv = new Map<string, ArchivEintrag>();
  for (const a of archiv) if (a.windowId) imArchiv.set(a.windowId, a);

  /**
   * Nobles Finale traegt beide Tage in einem Fenster (..._Final_EU, auch die Solo Series); Epics Archiv fuehrt Day 1 und Day 2 -
   * daraus kommen Bestenliste und Tag-Umschalter.
   */
  const tageVon = (wid: string) => {
    const m = /^(.+)_EU$/.exec(wid);
    if (!m || /_Day\d$/.test(m[1])) return null;
    const t1 = imArchiv.get(`${m[1]}_Day1_EU`);
    const t2 = imArchiv.get(`${m[1]}_Day2_EU`);
    if (!t1?.eventId || !t1.windowId || !t2?.windowId) return null;
    return { eventId: t1.eventId, begin: t1.begin, end: t2.end, tage: [t1, t2].map((x, i) => ({ name: `Day ${i + 1}`, windowId: x.windowId as string, eventId: x.eventId ?? null })) };
  };

  const liste: MapEintrag[] = [];
  let versteckt: MapEintrag[] = [];
  await Promise.all(turniere.flatMap((t) => (t.regions ?? []).map(async (r) => {
    try {
      const d = await detail(t.id, r.code);
      for (const w of d.tournamentData?.windows ?? []) {
        // Die Last-Chance-Runde heisst bei Noble "Qualifier", im Archiv "Lobby" - dasselbe Fenster.
        const a = imArchiv.get(w.windowId) ?? imArchiv.get(w.windowId.replace('LastChanceQualifier', 'LastChanceLobby'));
        const tv = a ? null : tageVon(w.windowId);
        const typ = typVon(`${t.tournamentName} ${a?.titel ?? ''}`);
        const saison = (w.windowId.match(/^(S\d+)_/) ?? [])[1] ?? '';
        const datum = w.startDate ? Date.parse(w.startDate) : (a?.begin ?? null);
        liste.push({
          turnierId: t.id, region: r.code, windowId: w.windowId,
          cup: t.tournamentName, fenster: w.name, titel: titelMit(a?.titel || `${t.tournamentName} · ${w.name}`, w.windowId),
          datum: Number.isFinite(datum as number) ? datum : null,
          saison, saisonKurz: '', saisonName: '',
          typ, bild: /^S\d+_FNCSMajor\d_Final_EU$/.test(w.windowId) ? '/cups/fncs-grand-finals.webp' : (cupBild(`${t.tournamentName} ${a?.titel ?? ''}`) ?? a?.bild ?? BILD_JE_TYP[typ]),
          eventId: a?.eventId ?? tv?.eventId ?? null, ende: w.endDate ? Date.parse(w.endDate) : (a?.end ?? tv?.end ?? null),
          tage: tv?.tage,
          epicFenster: a?.windowId && a.windowId !== w.windowId ? a.windowId : undefined,
        });
      }
    } catch { /* dieses Turnier ueberspringen */ }
  })));

  /*
   * Die Karten ohne Landepunkte: Events aus Epics Archiv, zu denen Noble nichts fuehrt (vor Juli 2025), und die alten
   * Events von Chapter 1 bis 4. Sie stehen in der Liste wie alle anderen; der Admin zeichnet die Landepunkte selbst ein.
   */
  try {
    const alte = await alteEintraege(new Set(liste.map((e) => e.windowId)), archiv, typVon, BILD_JE_TYP);
    liste.push(...alte.sichtbar);
    versteckt = alte.versteckt;
  } catch { /* ohne die alten Karten bleibt es bei denen von Noble */ }

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
    if (e.saison) { e.saisonName = saisonName(e.saison); e.saisonKurz = kurzName(e.saisonName); e.saisonTitel = SAISON_TITEL[e.saison]; }
  }

  /*
   * Reihenfolge: die neueste Saison zuerst; darin nach Datum - und in Saisons, die ganz aus dem Katalog kommen (kein Datum
   * belegt), in der Aufstellung des Vorbilds (reihe). Chapter 4 Season OG und Galactic Battle gibt es hier nicht.
   */
  const nr = (e: MapEintrag) => Number(e.saison.slice(1)) || 0;
  const mitNoble = new Set(liste.filter((e) => !e.alt).map((e) => e.saison));
  const sichtbar = liste.filter((e) => !SAISON_OHNE_MAPS.has(e.saison));
  sichtbar.sort((a, b) => nr(b) - nr(a)
    || (mitNoble.has(a.saison) ? (b.datum ?? 0) - (a.datum ?? 0) : 0)
    || (b.reihe ?? 0) - (a.reihe ?? 0) || (b.datum ?? 0) - (a.datum ?? 0));
  merker = { bis: Date.now() + 15 * 60_000, liste: sichtbar, versteckt };
  return sichtbar;
}

/* ------------------------------------------------------------------ Kapitel und Saisons */

export interface SaisonInfo { kennung: string; nr: number; name: string; kurz: string; kapitel: number; titel?: string }

/** Zu welchem Kapitel eine Saison gehoert - nach Epics Zaehlung (S8 bis S42). */
function kapitelVon(nr: number): number {
  if (nr <= 10) return 1;
  if (nr <= 18) return 2;
  if (nr <= 22) return 3;
  if (nr <= 27) return 4;
  if (nr <= 32) return 5; // Chapter 2 Remix steht beim Vorbild unter Chapter 5
  if (nr <= 38) return 6;
  return 7;
}

/** Alle Saisons von Chapter 1 bis heute, geordnet - auch die ohne Karten (die Seite zeigt sie grau). */
export function alleSaisons(): SaisonInfo[] {
  return Object.keys(SAISON_NAMEN).filter((k) => !SAISON_OHNE_MAPS.has(k)).map((k) => {
    const nr = Number(k.slice(1));
    const name = SAISON_NAMEN[k];
    return { kennung: k, nr, name, kurz: kurzName(name), kapitel: kapitelVon(nr), titel: SAISON_TITEL[k] };
  }).sort((a, b) => a.nr - b.nr);
}
