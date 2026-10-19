import { alleTurniere, detail } from '@/lib/nobleKarte';
import { liesJson } from '@/lib/ablage';
import { saisonName, SAISON_NAMEN } from '@/lib/szeneStats';
import { typVon, cupBild, SAISON_TITEL, SAISON_OHNE_MAPS, type MapTyp } from '@/lib/mapsTyp';
import { titelMit } from '@/lib/cupTitel';
import { alteEintraege } from '@/lib/alteMaps';
import { istVitalRegion, regionAusKennung, vitalTurniere } from '@/lib/vitalScrims';

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
  /** Die Kennung des Turniers bei Vital Scrims - dort kommen die Landepunkte der Regionen her, die Noble nicht fuehrt (NA Central, NA West, Middle East, Ozeanien). */
  vitalId?: string;
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

interface ArchivEintrag { id?: string; windowId?: string; eventId?: string; titel?: string; bild?: string; begin?: number; end?: number; region?: string }

/** Der Name eines Vital-Turniers ohne die Region am Ende ("Solo FNCS Heats (NAC)" -> "Solo FNCS Heats"). */
const ohneRegion = (n: string) => n.replace(/\s*\((?:NAC|NAW|NA-?West|NA-?Central|ME|OCE|BR|ASIA|EU)\)\s*$/i, '').trim();

/** Wie ein Spieltag heisst, wo nur Epics Kennung ihn nennt. */
function stufeAus(windowId: string): string {
  let m = /Heat(\d+)/i.exec(windowId); if (m) return `Heat ${m[1]}`;
  if (/FastTrack/i.test(windowId)) return 'Fast Tracks';
  if (/LastChance|LCQ/i.test(windowId)) return 'LCQ';
  if (/Final/i.test(windowId)) return 'Finals';
  m = /Round(d)/i.exec(windowId); if (m) return m[1] === '1' ? 'Open' : 'Finals';
  return '';
}

/**
 * Die Karten der Regionen, die Noble nicht fuehrt - von Vital Scrims (lib/vitalScrims). Zu jedem Turnier dort gehoert, wo Epics Archiv einen Spieltag derselben
 * Region zur selben Zeit kennt, genau dieser Spieltag (damit Bestenliste und Spielerwerte dranhaengen); wo nicht, steht das Turnier allein.
 * Hat Noble zu dem Spieltag ein europaeisches Gegenstueck, gehoert die Karte zum selben Cup (Fast Tracks, Heats, Finals ... zusammen).
 */
async function vitalEintraege(noble: MapEintrag[], archiv: ArchivEintrag[]): Promise<MapEintrag[]> {
  const turniere = await vitalTurniere();
  if (!turniere.length) return [];
  const nobleNach = new Map(noble.map((e) => [e.windowId, e]));
  // Epics Archiv fuehrt dasselbe Fenster mehrfach, mit leicht verschobenen Zeiten (NA Central und NA West teilen sich manche) - jede Zeit zaehlt.
  const epic = new Map<string, ArchivEintrag>();
  const zeiten = new Map<string, number[]>();
  for (const a of archiv) {
    const w = a.windowId ?? '';
    if (!w || !a.begin || !istVitalRegion(regionAusKennung(w)) || /Qualifiers_/.test(w)) continue;
    if (!epic.has(w)) epic.set(w, a);
    zeiten.set(w, [...(zeiten.get(w) ?? []), a.begin]);
  }
  const raus: MapEintrag[] = [];
  const benutzt = new Set<string>();

  const eintrag = (v: (typeof turniere)[number], a: ArchivEintrag | null, d2: ArchivEintrag | null): MapEintrag => {
    const synthetisch = !a;
    const wid = a ? (d2 ? (a.windowId as string).replace('_Day1_', '_') : (a.windowId as string)) : `vital_${v.id}`;
    const euId = wid.replace(/_[A-Z]{2,4}$/, '_EU');
    // Die Last-Chance-Runde heisst bei Noble "Qualifier", im Archiv "Lobby" - dasselbe Fenster.
    const eu = a ? (nobleNach.get(euId) ?? nobleNach.get(euId.replace('LastChanceLobby', 'LastChanceQualifier'))) : undefined;
    // Epic nennt manche Cups nur "Fortnite" - dann gilt der Name, den Vital fuehrt.
    const epicTitel = a?.titel && !/^fortnite$/i.test(a.titel.trim()) ? a.titel : '';
    const cup = eu?.cup ?? ohneRegion(epicTitel || v.name);
    const titel = titelMit(epicTitel || ohneRegion(v.name), a ? wid : '');
    const typ = typVon(`${cup} ${a?.titel ?? ''} ${v.name}`);
    const saison = (wid.match(/^(S\d+)_/) ?? [])[1] ?? '';
    return {
      turnierId: eu?.turnierId ?? `vital-${synthetisch ? v.id : (a?.id ?? v.id)}`,
      region: v.region, windowId: wid, vitalId: v.id,
      cup, fenster: eu?.fenster ?? (stufeAus(wid) || 'Cup'), titel,
      datum: a?.begin ?? v.start, saison, saisonKurz: '', saisonName: '', typ,
      bild: cupBild(`${cup} ${a?.titel ?? ''}`) ?? a?.bild ?? v.bild ?? BILD_JE_TYP[typ],
      eventId: a?.eventId ?? null, ende: d2?.end ?? a?.end ?? v.ende,
      tage: d2 && a ? [a, d2].map((x, i) => ({ name: `Day ${i + 1}`, windowId: x.windowId as string, eventId: x.eventId ?? null })) : undefined,
    };
  };

  /*
   * Zu einem Vital-Turnier gehoert der Spieltag, der zur selben Zeit laeuft UND denselben Namen traegt: parallel laufen oft mehrere Cups (Reload, Street Fighter,
   * Ranked ...), die Zeit allein ordnet also falsch zu. Verglichen werden die bedeutungstragenden Woerter des Vital-Namens mit Epics Titel und Kennung.
   */
  const sauber = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const STOPP = new Set(['cup', 'the', 'of', 'and', 'nac', 'naw', 'me', 'oce', 'na', 'central', 'west', 'series', 'practice', 'battle', 'royale', 'br', 'zero', 'build']);
  const woerter = (n: string) => sauber(n).split(' ').filter((t) => t.length > 1 && !STOPP.has(t)).map((t) => t.replace(/s$/, ''));
  const heuhaufen = (x: ArchivEintrag) => sauber(`${x.titel ?? ''} ${(x.windowId ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')}`).replace(/ /g, '');
  const wertung = (v: (typeof turniere)[number], x: ArchivEintrag) => {
    const w = woerter(v.name);
    const h = heuhaufen(x);
    return { treffer: w.filter((t) => h.includes(t)).length, von: w.length };
  };

  for (const v of turniere) {
    if (!istVitalRegion(v.region)) continue;
    const imZeitraum = [...epic.values()].filter((x) => regionAusKennung(x.windowId as string) === v.region
      && (zeiten.get(x.windowId as string) ?? []).some((z) => z >= v.start - 1_800_000 && z <= v.ende + 1_800_000) && !benutzt.has(x.windowId as string));
    const bewertet = imZeitraum.map((x) => ({ x, ...wertung(v, x), abstand: Math.abs((x.begin as number) - v.start) }))
      .filter((k) => k.treffer >= 2 && k.treffer >= k.von / 2)
      .sort((p, q) => q.treffer - p.treffer || p.abstand - q.abstand);
    const beste = bewertet[0];
    if (!beste) { raus.push(eintrag(v, null, null)); continue; }
    // Finale an zwei Tagen: Day 1 und Day 2 sind ein Eintrag; trifft der zweite Tag allein, steht er fuer sich.
    let a = beste.x;
    const w = a.windowId as string;
    if (/_Day2_/.test(w) && epic.has(w.replace('_Day2_', '_Day1_')) && !benutzt.has(w.replace('_Day2_', '_Day1_'))) a = epic.get(w.replace('_Day2_', '_Day1_')) as ArchivEintrag;
    const wid = a.windowId as string;
    benutzt.add(wid);
    const d2 = /_Day1_/.test(wid) ? (epic.get(wid.replace('_Day1_', '_Day2_')) ?? null) : null;
    if (d2) benutzt.add(d2.windowId as string);
    raus.push(eintrag(v, a, d2));
  }
  return raus;
}

let merker: { bis: number; liste: MapEintrag[]; versteckt: MapEintrag[] } | null = null;

/** Nach einer Aenderung der alten Karten: das Verzeichnis beim naechsten Abruf neu bauen. */
export function vergissVerzeichnis() { merker = null; }

/** Die vom Admin versteckten alten Karten - damit sie sich zurueckholen lassen. */
export async function versteckteKarten(): Promise<MapEintrag[]> {
  await mapsVerzeichnis();
  return merker?.versteckt ?? [];
}

let bauLaeuft: Promise<MapEintrag[]> | null = null;

/**
 * Alle Fenster aller Noble-Turniere und der Vital-Regionen, neueste zuerst. Fuenfzehn Minuten im Speicher - und danach nicht mehr mit Wartezeit: ist der Stand
 * abgelaufen, bekommt der Besucher sofort den alten, waehrend im Hintergrund der neue entsteht (das Verzeichnis braucht ueber eine halbe Minute zum Bauen).
 */
export async function mapsVerzeichnis(): Promise<MapEintrag[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;
  if (!bauLaeuft) bauLaeuft = baueVerzeichnis().finally(() => { bauLaeuft = null; });
  if (merker) { bauLaeuft.catch(() => undefined); return merker.liste; }
  return bauLaeuft;
}

async function baueVerzeichnis(): Promise<MapEintrag[]> {
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

  // NA Central, NA West, Middle East und Ozeanien: die Landepunkte kommen von Vital Scrims.
  try { liste.push(...await vitalEintraege(liste, archiv)); } catch { /* ohne Vital bleibt es bei Noble */ }

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
