import { liesJson, schreibJson, ersatzSeit } from '@/lib/ablage';
import { gecacht, holeTop } from '@/lib/epicCups';
import { spielerKontext, type SolosFenster, type SolosSpieler, type SolosTeam } from '@/lib/globalsSolos';
import type { MapEintrag } from '@/lib/mapsVerzeichnis';
import type { MapTyp } from '@/lib/mapsTyp';

/*
 * Die Karten ohne Landepunkte: alle Cups, zu denen Noble Practice nichts fuehrt.
 *
 * Der Betreiber (12.10.2026): "mach zumindest alle Tournament Maps dort rein mit Karte, einfach ohne Spots - ich kann als
 * Admin die Maps bearbeiten, extra Seite nur fuer diese Pages, und selber machen mit Spieler und so, aber sonst einfach
 * leere Map und Leaderboard ... alles nur mit Admin-Haenden machbar, aber die Map zumindest."
 *
 * Drei Quellen, und keine davon ist eine fremde Landepunkt-Datenbank:
 *
 *   1. Epics Archiv (cup-archiv.json): die europaeischen Endspiele der Saisons S30 bis S37 - Performance Cups, Division
 *      Finals, Majors, Cash Cups. Dazu gibt es Epics Bestenliste mit den Teams, also auch Spieler, Tierlist und Laender.
 *   2. Ein kleiner Katalog der aelteren Events (Chapter 1 bis 4 und Remix): nur Namen, die es wirklich gab. Ohne Datum -
 *      es steht kein erfundenes Datum da, die Reihenfolge kommt aus der Woche.
 *   3. Was der Admin selbst anlegt.
 *
 * Die Landepunkte (Formen) und - wo es keine Epic-Bestenliste gibt - die Teams zeichnet und tippt der Admin ein; sie
 * liegen in alte-maps.json. Ein Event ohne Formen zeigt die leere Karte.
 */

export const ALT = 'alt-';

export interface AltEreignis {
  windowId: string;
  turnierId: string;
  cup: string;
  fenster: string;
  saison: string;
  typ: MapTyp;
  datum: number | null;
  ende: number | null;
  eventId: string | null;
  bild: string | null;
  lan?: boolean;
  reihe: number;
  quelle: 'archiv' | 'katalog' | 'admin';
}

export interface AltForm { id: string; punkte: Array<{ x: number; y: number }>; teamIds: string[] }
export interface AltTeam {
  id: string;
  spieler: Array<{ name: string; epicId?: string; land?: string }>;
  rang?: number | null;
  punkte?: number | null;
}
export interface AltFensterDaten { formen?: AltForm[]; teams?: AltTeam[]; versteckt?: boolean }
export interface AltStore { ereignisse: AltEreignis[]; fenster: Record<string, AltFensterDaten> }

const DATEI = 'alte-maps.json';
const LEER = (): AltStore => ({ ereignisse: [], fenster: {} });

export const liesAltStore = () => liesJson<AltStore>(DATEI, LEER());

/**
 * Speichern - aber nie auf Grundlage einer Ersatzkopie: antwortet die Ablage nicht, haette ein Speichern sonst den ganzen
 * Stand durch den letzten gesicherten ersetzt (dieselbe Regel wie bei den Turnierkarten).
 */
export async function aendereAltStore(aendere: (s: AltStore) => void): Promise<{ ok: true } | { ok: false; grund: string }> {
  const s = await liesAltStore();
  if (ersatzSeit(DATEI) !== null) return { ok: false, grund: 'Die Ablage antwortet gerade nicht - es wurde nichts gespeichert. Gleich noch einmal versuchen.' };
  const neu: AltStore = { ereignisse: s.ereignisse ?? [], fenster: s.fenster ?? {} };
  aendere(neu);
  await schreibJson(DATEI, neu);
  return { ok: true };
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ Katalog (Chapter 1 bis 4, Remix) */

interface KatalogCup { saison: string; cup: string; fenster: string[]; lan?: boolean }

const wochen = (n: number, nach = 'Finals') => Array.from({ length: n }, (_, i) => `Week ${i + 1} - ${nach}`);

const KATALOG: KatalogCup[] = [
  { saison: 'S9', cup: 'World Cup Finals', fenster: ['Duo', 'Solo'], lan: true },
  { saison: 'S18', cup: 'FNCS', fenster: ['Grand Royale', 'Grand Finals'] },
  { saison: 'S22', cup: 'FNCS Invitational 2022', fenster: ['Finals'], lan: true },
  { saison: 'S22', cup: 'Elite Cup', fenster: [...wochen(7), 'Week 7.1 - Finals'] },
  { saison: 'S26', cup: 'FNCS Global Championship 2023', fenster: ['Upper Bracket', 'Lower Bracket', 'Grand Finals'], lan: true },
  { saison: 'S26', cup: 'Duo Cash Cup', fenster: wochen(8) },
  { saison: 'S26', cup: 'Performance Evaluation', fenster: wochen(3) },
  { saison: 'S32', cup: 'Trio Cash Cup', fenster: wochen(6) },
  { saison: 'S32', cup: 'Performance Evaluation', fenster: wochen(5) },
];

function ausKatalog(typVon: (n: string) => MapTyp): AltEreignis[] {
  const raus: AltEreignis[] = [];
  for (const k of KATALOG) {
    k.fenster.forEach((f, i) => {
      raus.push({
        windowId: `alt_${k.saison}_${slug(k.cup)}_${slug(f)}`, turnierId: `${ALT}${k.saison}-${slug(k.cup)}`,
        cup: k.cup, fenster: f, saison: k.saison, typ: typVon(`${k.cup} ${f}`),
        datum: null, ende: null, eventId: null, bild: null, lan: k.lan, reihe: i + 1, quelle: 'katalog',
      });
    });
  }
  return raus;
}

/* ------------------------------------------------------------------ Epics Archiv (S30 bis S37) */

interface ArchivEintrag { windowId?: string; eventId?: string; titel?: string; bild?: string; begin?: number; end?: number; region?: string }

const ENDSPIEL = /Round2|Final|Day\d/;
const KEIN_ENDSPIEL = /GroupStage|Lobby|Round1|Qualif/;

/** Cup, Spieltag und Reihenfolge aus Epics Fenster-Kennung - nur Epics eigene Bestandteile, nichts dazuerfunden. */
function benenne(w: string, titel: string): { cup: string; fenster: string; reihe: number } {
  let cup = titel || 'Cup';
  const major = /FNCS_?Major(\d)/i.exec(w);
  const div = /(Duos|Trios)?DivisionalCup_Division(\d)/i.exec(w);
  if (major) cup = `FNCS Major ${major[1]}`;
  else if (div) cup = `${div[1] ? `${div[1][0].toUpperCase()}${div[1].slice(1).toLowerCase()}` : 'FNCS'} Division ${div[2]}`;
  else if (/PerformanceEvaluationDuos/i.test(w)) cup = 'Performance Evaluation Duos';
  else if (/PerformanceEvaluation/i.test(w)) cup = 'Performance Evaluation';
  else if (/DuosCashCup/i.test(w)) cup = 'Duos Cash Cup';
  else if (/SoloSeriesCup/i.test(w)) cup = 'Solo Series';

  const woche = /Event(\d+)Round2/i.exec(w) ?? /Week(\d+)Final/i.exec(w);
  if (woche) return { cup, fenster: `Week ${woche[1]} - Finals`, reihe: Number(woche[1]) };
  const tag = /(?:GrandFinalDay|Final_?Day)(\d)/i.exec(w);
  if (tag) return { cup, fenster: `Grand Finals - Day ${tag[1]}`, reihe: Number(tag[1]) };
  if (/UpperSemis/i.test(w)) return { cup, fenster: 'Upper Semifinals', reihe: 0 };
  return { cup, fenster: 'Finals', reihe: 1 };
}

function ausArchiv(archiv: ArchivEintrag[], schonDa: Set<string>, typVon: (n: string) => MapTyp, bildJeTyp: Record<MapTyp, string | null>): AltEreignis[] {
  const jetzt = Date.now();
  const raus: AltEreignis[] = [];
  for (const a of archiv) {
    const w = a.windowId;
    if (!w || a.region !== 'EU' || !a.eventId || schonDa.has(w)) continue;
    const m = /^S(\d+)_/.exec(w);
    const nr = m ? Number(m[1]) : 0;
    if (nr < 30 || nr > 37 || !ENDSPIEL.test(w) || KEIN_ENDSPIEL.test(w)) continue;
    if (a.begin && a.begin > jetzt) continue;
    const { cup, fenster, reihe } = benenne(w, a.titel ?? '');
    const typ = typVon(`${cup} ${fenster}`);
    raus.push({
      windowId: w, turnierId: `${ALT}S${nr}-${slug(cup)}`, cup, fenster, saison: `S${nr}`, typ,
      datum: a.begin ?? null, ende: a.end ?? null, eventId: a.eventId,
      bild: a.bild && /^https:\/\//.test(a.bild) ? a.bild : bildJeTyp[typ], reihe, quelle: 'archiv',
    });
  }
  return raus;
}

/* ------------------------------------------------------------------ Verzeichnis */

/** Alle Ereignisse ohne Noble-Karte - auch die versteckten (fuer den Admin). */
export async function alleAlteEreignisse(
  nobleFenster: Set<string>, archiv: ArchivEintrag[], typVon: (n: string) => MapTyp, bildJeTyp: Record<MapTyp, string | null>,
): Promise<AltEreignis[]> {
  const s = await liesAltStore();
  const eigene = (s.ereignisse ?? []).map((e) => ({ ...e, quelle: 'admin' as const }));
  const ids = new Set<string>([...nobleFenster, ...eigene.map((e) => e.windowId)]);
  const katalog = ausKatalog(typVon).filter((e) => !ids.has(e.windowId));
  const aus = ausArchiv(archiv, ids, typVon, bildJeTyp);
  return [...aus, ...katalog, ...eigene];
}

/** Das Bild des Kapitels, wo ein Event kein eigenes hat (die Kapitelbilder der Maps-Seite). */
function kapitelBild(saison: string): string {
  const nr = Number(saison.slice(1));
  if (nr <= 10) return '/saisonbilder/CH1.jpg';
  if (nr <= 18 || nr === 32) return '/saisonbilder/Chapter 2 Remix.jpg';
  if (nr <= 22) return '/saisonbilder/CH3.jpg';
  if (nr <= 27) return '/saisonbilder/CH4.jpg';
  if (nr <= 31) return '/saisonbilder/CH5S4.jpg';
  if (nr <= 38) return '/saisonbilder/CH6S4.webp';
  return '/saisonbilder/CH7S4.jpg';
}

/** Die Eintraege fuers Verzeichnis (lib/mapsVerzeichnis): die sichtbaren, und getrennt die vom Admin versteckten. */
export async function alteEintraege(
  nobleFenster: Set<string>, archiv: ArchivEintrag[], typVon: (n: string) => MapTyp, bildJeTyp: Record<MapTyp, string | null>,
): Promise<{ sichtbar: MapEintrag[]; versteckt: MapEintrag[] }> {
  const [alle, s] = await Promise.all([alleAlteEreignisse(nobleFenster, archiv, typVon, bildJeTyp), liesAltStore()]);
  const eintrag = (e: AltEreignis): MapEintrag => ({
      turnierId: e.turnierId, region: 'EU', windowId: e.windowId, cup: e.cup, fenster: e.fenster,
      titel: `${e.cup} · ${e.fenster}`, datum: e.datum, saison: e.saison, saisonKurz: '', saisonName: '',
      typ: e.typ, bild: e.bild ?? bildJeTyp[e.typ] ?? kapitelBild(e.saison), eventId: e.eventId, ende: e.ende,
    reihe: e.reihe, lan: e.lan, alt: true,
  });
  const weg = (e: AltEreignis) => !!s.fenster?.[e.windowId]?.versteckt;
  return { sichtbar: alle.filter((e) => !weg(e)).map(eintrag), versteckt: alle.filter(weg).map(eintrag) };
}

/* ------------------------------------------------------------------ Das Fenster einer alten Karte */

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

/** Die Teams eines Events: aus Epics Bestenliste, wo es eine gibt, sonst aus dem, was der Admin eingetippt hat. */
async function teamsFuer(e: MapEintrag, daten: AltFensterDaten | undefined): Promise<SolosTeam[]> {
  const kontext = await spielerKontext();
  const spieler = (id: string, roh: string, land?: string): SolosSpieler => kontext(id, roh, land);
  if (e.eventId) {
    try {
      const top = await gecacht(`alt|top|${e.windowId}`, 10 * 60_000, () => holeTop(e.eventId as string, e.windowId, 100));
      return top.entries.map((en) => ({
        id: en.teamId ?? `r${en.rank}`,
        spieler: en.players.map((p) => spieler(p.id, p.name)),
        rang: en.rank, punkte: en.points ?? null, siege: en.wins ?? null,
      }));
    } catch { return []; }
  }
  return (daten?.teams ?? []).map((t) => ({
    id: t.id,
    spieler: t.spieler.map((p, i) => spieler(p.epicId || `${t.id}-${i}`, p.name, p.land)),
    rang: t.rang ?? null, punkte: t.punkte ?? null, siege: null,
  }));
}

export async function alteFenster(e: MapEintrag): Promise<{ turnier: string; fenster: SolosFenster }> {
  const s = await liesAltStore();
  const daten = s.fenster?.[e.windowId];
  const teams = await teamsFuer(e, daten);
  const nachId = new Map(teams.map((t) => [t.id, t]));
  const alle = new Map<string, SolosSpieler>();
  for (const t of teams) for (const p of t.spieler) alle.set(p.id, p);
  const formen = (daten?.formen ?? []).map((f) => {
    const dabei = f.teamIds.map((id) => nachId.get(id)).filter((t): t is SolosTeam => !!t);
    return { punkte: f.punkte, spieler: dabei.flatMap((t) => t.spieler.map((p) => p.anzeige)), teams: dabei.length };
  });
  return {
    turnier: e.cup,
    fenster: {
      windowId: e.windowId, name: e.fenster, art: 'finale', start: iso(e.datum), end: iso(e.ende),
      spieler: [...alle.values()], teams, bild: null, formen,
    },
  };
}

/** Fuer den Editor: Teams (fertig aufgeloest), gespeicherte Formen und ob die Teams von Hand kommen. */
export async function alteBearbeitung(e: MapEintrag) {
  const s = await liesAltStore();
  const daten = s.fenster?.[e.windowId];
  const teams = await teamsFuer(e, daten);
  return {
    manuell: !e.eventId,
    teams: teams.map((t) => ({ id: t.id, spieler: t.spieler.map((p) => ({ name: p.anzeige, epicId: p.id, land: p.land })), rang: t.rang, punkte: t.punkte })),
    rohTeams: daten?.teams ?? [],
    formen: daten?.formen ?? [],
    versteckt: !!daten?.versteckt,
  };
}
