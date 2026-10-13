import { liesJson, schreibJson, ersatzSeit } from '@/lib/ablage';
import { gecacht, holeTop, type CupEintrag } from '@/lib/epicCups';
import { spielerKontext, type SolosFenster, type SolosSpieler, type SolosTeam } from '@/lib/globalsSolos';
import type { MapEintrag } from '@/lib/mapsVerzeichnis';
import { cupBild, type MapTyp } from '@/lib/mapsTyp';
import { GET as bestenliste } from '@/app/api/cup-leaderboard/route';
import { endspielArt, schluesselVon, plaetze } from '@/lib/fncsListe';

/*
 * Die Karten ohne Landepunkte: alle Cups, zu denen Noble Practice nichts fuehrt.
 *
 * Der Betreiber (12.10.2026): "mach zumindest alle Tournament Maps dort rein mit Karte, einfach ohne Spots - ich kann als
 * Admin die Maps bearbeiten, extra Seite nur fuer diese Pages, und selber machen mit Spieler und so, aber sonst einfach
 * leere Map und Leaderboard ... alles nur mit Admin-Haenden machbar, aber die Map zumindest."
 *
 * Drei Quellen, und keine davon ist eine fremde Landepunkt-Datenbank:
 *
 *   1. Der Katalog: jede Saison mit ihren Cups und Spieltagen, 1 zu 1 in der Aufstellung des Vorbilds (Namen und Aufbau sind
 *      oeffentliche Tatsachen). Ohne Datum, wo keins belegt ist - es steht kein erfundenes Datum da, die Reihenfolge kommt aus
 *      der Aufstellung.
 *   2. Epics Archiv (cup-archiv.json): wo es zu einem Spieltag des Katalogs ein Fenster gibt (Chapter 5 Season 3 bis Chapter 6
 *      Season 3), haengt der Katalog Epics Bestenliste daran - also Teams, Spieler, Tierlist und Laender. Zwei Tage eines
 *      Finales (Day 1 und Day 2) sind ein Event mit Tag-Umschalter.
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
  /** Der Name der Karte, wie das Vorbild ihn zeigt ("Duo Cash Cup Finals - Week 8"); fehlt es, gilt "Cup · Spieltag". */
  titel?: string;
  /** Finale an mehreren Tagen: die Fenster der Tage (Day 1, Day 2) - die Bestenliste "gesamt" rechnet sie zusammen. */
  tage?: Array<{ name: string; windowId: string; eventId: string | null }>;
  quelle: 'archiv' | 'katalog' | 'admin';
}

export interface AltForm { id: string; punkte: Array<{ x: number; y: number }>; teamIds: string[] }
export interface AltTeam {
  id: string;
  spieler: Array<{ name: string; epicId?: string; land?: string }>;
  rang?: number | null;
  punkte?: number | null;
  /** Victory Royales und Eliminierungen - fuer die von Hand gepflegte Bestenliste. */
  siege?: number | null;
  elims?: number | null;
}
/** Was der Admin an den Angaben eines Events aendern kann (Titel, Datum, LAN, Kartenbild der Kachel). */
export interface AltMeta { cup?: string; fenster?: string; datum?: number | null; lan?: boolean; bild?: string | null }
export interface AltFensterDaten {
  formen?: AltForm[];
  teams?: AltTeam[];
  versteckt?: boolean;
  /** Epics Bestenliste und Teams anzeigen, solange der Admin noch keine eigenen Teams angelegt hat (Standard: ja). */
  epicAn?: boolean;
  meta?: AltMeta;
}
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

/* ------------------------------------------------------------------ Katalog (alle Saisons bis Chapter 6 Season 3) */

/*
 * Jede Gruppe ist ein Cup einer Saison mit seinen Spieltagen - in der Reihenfolge des Vorbilds (neueste zuerst). Die Namen
 * der Karten stehen so da, wie das Vorbild sie nennt; "Cup" und "Spieltag" werden daraus abgeleitet.
 *
 * Nicht dabei: Chapter 6 Season 4 und alles danach (dafuer fuehrt Noble Practice die Karten), Chapter 4 Season OG und die
 * Mini-Saison Galactic Battle (Betreiber, 13.10.2026: "raus aus den Listen").
 */
interface KatalogGruppe { saison: string; cup: string; titel: string[]; lan?: boolean }

/** "Duo Cash Cup Finals - Week 8" bis "... Week 1" (neueste zuerst). */
const woche = (praefix: string, bis: number, von = 1) =>
  Array.from({ length: bis - von + 1 }, (_, i) => `${praefix} - Week ${bis - i}`);

const FNCS_ENDE = ['FNCS Grand Finals', 'FNCS Semi Finals 3', 'FNCS Semi Finals 2', 'FNCS Semi Finals 1'];
const FNCS_RUNDEN = ['FNCS Grand Finals', 'FNCS Lower Round 3', 'FNCS Upper Round 3', 'FNCS Upper Round 2', 'FNCS Upper Round 1'];
const FNCS_MAJOR = ['FNCS Grand Finals', 'FNCS Last Chance Lobby', 'FNCS Group 3', 'FNCS Group 2', 'FNCS Group 1'];
const PERF = (bis: number) => woche('Performance Evaluation Cup', bis);

const KATALOG: KatalogGruppe[] = [
  // Chapter 1
  { saison: 'S9', cup: 'World Cup', lan: true, titel: ['World Cup Finals - Duo', 'World Cup Finals - Solo'] },
  // Chapter 2
  { saison: 'S14', cup: 'FNCS', titel: ['FNCS Grand Finals'] },
  { saison: 'S15', cup: 'FNCS', titel: ['FNCS Grand Finals'] },
  { saison: 'S16', cup: 'FNCS', titel: ['FNCS Grand Finals'] },
  { saison: 'S17', cup: 'FNCS', titel: ['FNCS Grand Finals', 'FNCS All-Star Showdown'] },
  { saison: 'S18', cup: 'FNCS', titel: ['FNCS Grand Royale', 'FNCS Grand Finals'] },
  // Chapter 3
  { saison: 'S19', cup: 'FNCS', titel: [...FNCS_ENDE, 'FNCS Qualifier 2', 'FNCS Qualifier 1'] },
  { saison: 'S19', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 8) },
  { saison: 'S20', cup: 'FNCS', titel: [...FNCS_ENDE, 'FNCS Qualifier 3', 'FNCS Qualifier 2', 'FNCS Qualifier 1'] },
  { saison: 'S20', cup: 'Solo Cash Cup', titel: woche('Solo Cash Cup Finals', 5) },
  {
    saison: 'S20', cup: 'Duo Cash Cup',
    titel: [...woche('Duo Cash Cup Finals', 8, 5), 'Duo Cash Cup Week 4 Encore', ...woche('Duo Cash Cup Finals', 4)],
  },
  { saison: 'S21', cup: 'FNCS', titel: [...FNCS_ENDE, 'FNCS Qualifier 3', 'FNCS Qualifier 2', 'FNCS Qualifier 1'] },
  { saison: 'S21', cup: 'Gamers8 2022', lan: true, titel: ['Gamers8 2022'] },
  { saison: 'S21', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 9) },
  { saison: 'S21', cup: 'Solo Cash Cup', titel: woche('Solo Cash Cup Finals', 6) },
  { saison: 'S22', cup: 'FNCS Invitational 2022', lan: true, titel: ['FNCS Invitational 2022'] },
  { saison: 'S22', cup: 'Elite Cup', titel: ['Elite Cup Finals - Week 7.1', ...woche('Elite Cup Finals', 7)] },
  // Chapter 4
  { saison: 'S23', cup: 'FNCS', titel: ['FNCS Grand Finals', 'FNCS Surge Week', 'FNCS Week 3 Finals', 'FNCS Week 2 Finals', 'FNCS Week 1 Finals'] },
  {
    saison: 'S23', cup: 'Elite Cup',
    titel: [
      'Elite Cup Finals - Week 5', 'Elite Cup Finals - Week 4', 'Elite Cup Finals - Week 3 Additional', 'Elite Cup Finals - Week 3',
      'Elite Cup Finals - Week 2 Additional', 'Elite Cup Finals - Week 2', 'Elite Cup Finals - Week 1',
    ],
  },
  { saison: 'S24', cup: 'FNCS', titel: ['FNCS Grand Finals', 'FNCS Surge Week', 'FNCS Week 3', 'FNCS Week 2', 'FNCS Week 1'] },
  { saison: 'S24', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 6) },
  { saison: 'S24', cup: 'Console Champions Cup', titel: ['Console Champions Cup'] },
  { saison: 'S24', cup: 'Performance Evaluation Cup', titel: PERF(3) },
  { saison: 'S25', cup: 'FNCS', titel: ['FNCS Grand Finals', 'FNCS Last Chance Finals', 'FNCS Week 3', 'FNCS Week 2', 'FNCS Week 1'] },
  { saison: 'S25', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 8) },
  { saison: 'S25', cup: 'Performance Evaluation Cup', titel: PERF(2) },
  {
    saison: 'S26', cup: 'FNCS Global Championship 2023', lan: true,
    titel: ['FNCS Global Championship 2023 Grand Finals', 'FNCS Global Championship 2023 Lower Bracket', 'FNCS Global Championship 2023 Upper Bracket'],
  },
  { saison: 'S26', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 8) },
  { saison: 'S26', cup: 'Performance Evaluation Cup', titel: PERF(3) },
  // Chapter 5
  { saison: 'S28', cup: 'FNCS', titel: FNCS_RUNDEN },
  { saison: 'S28', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 5) },
  { saison: 'S28', cup: 'Performance Evaluation Cup', titel: PERF(10) },
  { saison: 'S29', cup: 'FNCS', titel: FNCS_RUNDEN },
  { saison: 'S29', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 4) },
  { saison: 'S29', cup: 'Performance Evaluation Cup', titel: PERF(10) },
  { saison: 'S30', cup: 'FNCS', titel: FNCS_RUNDEN },
  { saison: 'S30', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 8) },
  { saison: 'S30', cup: 'Performance Evaluation Cup', titel: PERF(8) },
  { saison: 'S31', cup: 'FNCS Global Championship 2024', lan: true, titel: ['FNCS Global Championship 2024 Grand Finals'] },
  { saison: 'S31', cup: 'Duo Cash Cup', titel: woche('Duo Cash Cup Finals', 4) },
  { saison: 'S31', cup: 'Reload Cup', titel: woche('Reload Cup', 4) },
  { saison: 'S31', cup: 'Performance Evaluation Cup', titel: PERF(9) },
  { saison: 'S32', cup: 'Trio Cash Cup', titel: woche('Trio Cash Cup Finals', 6) },
  { saison: 'S32', cup: 'Performance Evaluation Cup', titel: PERF(5) },
  // Chapter 6
  { saison: 'S33', cup: 'FNCS', titel: FNCS_MAJOR },
  { saison: 'S33', cup: 'Division 1 Cup', titel: woche('Division 1 Cup Finals', 5) },
  { saison: 'S33', cup: 'Performance Evaluation Cup', titel: PERF(9) },
  { saison: 'S34', cup: 'FNCS', titel: FNCS_MAJOR },
  { saison: 'S34', cup: 'Division 1 Cup', titel: woche('Division 1 Cup Finals', 5) },
  { saison: 'S34', cup: 'Performance Evaluation Cup', titel: PERF(9) },
  { saison: 'S36', cup: 'FNCS', titel: FNCS_MAJOR },
  { saison: 'S36', cup: 'FNCS Division 1', titel: woche('FNCS Division 1 Finals', 2) },
  { saison: 'S36', cup: 'Performance Evaluation Cup', titel: PERF(6) },
];

/** Die Epic-Kennungen zu einem Spieltag des Katalogs - nur, wo Epics Archiv ihn wirklich fuehrt. Zwei Kennungen = Day 1 und Day 2. */
const MAJOR_VON_SAISON: Record<string, number> = { S33: 1, S34: 2, S36: 3 };

function epicKennungen(saison: string, titel: string): string[] {
  const nr = Number(saison.slice(1));
  const w = /Week (\d+)/.exec(titel)?.[1];
  if (/^Performance Evaluation Cup/.test(titel) && w && [30, 31, 33, 34, 36].includes(nr)) return [`${saison}_PerformanceEvaluation_Event${w}Round2_EU`];
  if (/^Duo Cash Cup Finals/.test(titel) && w && nr === 30) return [`S30_DuosCashCup_Event${w}Round2_EU`];
  if (/Division 1 (Cup )?Finals - Week/.test(titel) && w && [33, 34, 36].includes(nr)) return [`${saison}_FNCSDivisionalCup_Division1_Week${w}Final_EU`];
  const major = MAJOR_VON_SAISON[saison];
  if (major && titel.startsWith('FNCS ')) {
    if (titel === 'FNCS Grand Finals') return [`${saison}_FNCSMajor${major}_Final_Day1_EU`, `${saison}_FNCSMajor${major}_Final_Day2_EU`];
    if (titel === 'FNCS Last Chance Lobby') return [`${saison}_FNCSMajor${major}_LastChanceLobby_EU`];
    const g = /^FNCS Group (\d)$/.exec(titel);
    if (g) return [`${saison}_FNCSMajor${major}_GroupStage_Group${g[1]}_EU`];
  }
  if (nr === 30 && titel.startsWith('FNCS ')) {
    if (titel === 'FNCS Grand Finals') return ['S30_FNCS_Major3_GrandFinalDay1_EU', 'S30_FNCS_Major3_GrandFinalDay2_EU'];
    const u = /^FNCS Upper Round (\d)$/.exec(titel);
    if (u) return [`S30_FNCS_Major3_UpperSemis_Round${u[1]}_EU`];
    if (titel === 'FNCS Lower Round 3') return ['S30_FNCS_Major3_LowerSemis_Round3_EU'];
  }
  if (titel === 'FNCS Global Championship 2024 Grand Finals') return ['BambiRaptor_Day1', 'BambiRaptor_Day2'];
  return [];
}

interface ArchivEintrag { windowId?: string; eventId?: string; titel?: string; bild?: string; begin?: number; end?: number; region?: string }

const tag = (j: number, m: number, d: number) => Date.UTC(j, m - 1, d, 12);
/**
 * Die Tage der alten Endspiele - oeffentliche Tatsachen (an welchem Tag das Finale gespielt wurde). Wo Epics Archiv ein Fenster
 * fuehrt, gilt dessen Beginn; fuer die uebrigen Spieltage steht kein Datum da.
 */
const DATUM_KATALOG: Record<string, number> = {
  'S14|FNCS Grand Finals': tag(2020, 11, 1),
  'S15|FNCS Grand Finals': tag(2021, 3, 14),
  'S16|FNCS Grand Finals': tag(2021, 5, 30),
  'S17|FNCS All-Star Showdown': tag(2021, 6, 26),
  'S17|FNCS Grand Finals': tag(2021, 9, 5),
  'S18|FNCS Grand Finals': tag(2021, 10, 31),
  'S18|FNCS Grand Royale': tag(2021, 11, 21),
  'S19|FNCS Grand Finals': tag(2022, 3, 6),
  'S20|FNCS Grand Finals': tag(2022, 5, 29),
  'S21|FNCS Grand Finals': tag(2022, 8, 14),
  'S22|FNCS Invitational 2022': tag(2022, 11, 13),
  'S23|FNCS Grand Finals': tag(2023, 3, 4),
  'S24|FNCS Grand Finals': tag(2023, 5, 14),
  'S25|FNCS Grand Finals': tag(2023, 8, 13),
  'S26|FNCS Global Championship 2023 Grand Finals': tag(2023, 10, 16),
  'S28|FNCS Grand Finals': tag(2024, 2, 25),
  'S29|FNCS Grand Finals': tag(2024, 5, 19),
};

/** Der Spieltag aus dem Namen der Karte: alles hinter dem Cup-Namen ("Finals - Week 8"); ohne Rest "Finals". */
function spieltagVon(cup: string, titel: string): string {
  const rest = titel.startsWith(cup) ? titel.slice(cup.length).replace(/^[\s-]+/, '') : titel;
  return rest || 'Finals';
}

function ausKatalog(archiv: ArchivEintrag[], typVon: (n: string) => MapTyp): AltEreignis[] {
  const imArchiv = new Map<string, ArchivEintrag>();
  for (const a of archiv) if (a.windowId && a.region === 'EU') imArchiv.set(a.windowId, a);
  // Je Saison laeuft die Reihenfolge von hinten nach vorn: das Vorbild zeigt die neuesten Spieltage oben.
  const gesamtJe = new Map<string, number>();
  for (const k of KATALOG) gesamtJe.set(k.saison, (gesamtJe.get(k.saison) ?? 0) + k.titel.length);
  const gezaehlt = new Map<string, number>();
  const raus: AltEreignis[] = [];
  for (const k of KATALOG) {
    for (const titel of k.titel) {
      const nr = gezaehlt.get(k.saison) ?? 0;
      gezaehlt.set(k.saison, nr + 1);
      const reihe = (gesamtJe.get(k.saison) ?? 0) - nr;
      const gefunden = epicKennungen(k.saison, titel).map((id) => imArchiv.get(id)).filter((a): a is ArchivEintrag => !!a?.windowId);
      const erste = gefunden[0];
      const wid = erste?.windowId ?? `alt_${k.saison}_${slug(titel)}`;
      // Die Last-Chance-Fenster tragen im Archiv ein Platzhalterdatum - ohne Datum ist ehrlicher.
      const ohneDatum = /LastChanceLobby/.test(wid);
      const eventId = erste?.eventId ?? null;
      const typ = typVon(titel);
      const epicBild = erste?.bild && /^https:\/\//.test(erste.bild) ? erste.bild : null;
      raus.push({
        windowId: wid, turnierId: `${ALT}${k.saison}-${slug(k.cup)}`,
        cup: k.cup, fenster: spieltagVon(k.cup, titel), titel, saison: k.saison, typ,
        datum: ohneDatum ? null : (erste?.begin ?? DATUM_KATALOG[`${k.saison}|${titel}`] ?? null), ende: ohneDatum ? null : (gefunden[gefunden.length - 1]?.end ?? null),
        eventId,
        // Die Grand Finals ab Chapter 5 haben ihr eigenes Vorschaubild (Betreiber, 13.10.2026); aeltere das rote "MAJOR".
        bild: cupBild(titel) ?? cupBild(k.cup) ?? (typ === 'fncs' ? (titel === 'FNCS Grand Finals' && Number(k.saison.slice(1)) >= 28 ? '/cups/fncs-grand-finals.webp' : '/cups/fncs-major.webp') : epicBild),
        lan: k.lan, reihe, quelle: 'katalog',
        tage: gefunden.length > 1
          ? gefunden.map((a, i) => ({ name: `Day ${i + 1}`, windowId: a.windowId as string, eventId: a.eventId ?? null }))
          : undefined,
      });
    }
  }
  return raus;
}

/*
 * Die Insel je Saison - die Karten, die der Betreiber geschickt hat (13.10.2026). Sicher belegt: Chapter 6 Season 3 (der Abgleich
 * mit Noble Practice trifft die Karte auf den Pixel) und Chapter 3 Season 3 (Vergleich mit dem Screenshot vom Vorbild). Die uebrigen
 * Zuordnungen folgen der Inselform und der Reihenfolge der Veraenderungen; Saisons ohne eigene Karte zeigen einen Hinweis statt
 * einer falschen Insel. Der Admin kann jede Insel je Spieltag oder je Saison tauschen (Verwaltung der alten Maps).
 */
export const KEINE_KARTE = '/maps/archiv/keine-karte.png';
const K = (n: number) => `/maps/archiv/karte-${String(n).padStart(2, '0')}.jpg`;
export const INSEL_JE_SAISON: Record<string, string> = {
  S14: K(13), S15: K(15), S16: K(10), S17: K(20), S18: K(18),
  S19: K(8), S20: K(9), S21: K(11), S22: K(14),
  S23: K(19), S24: K(16), S25: K(12), S26: K(17),
  S28: K(7), S29: K(4), S30: K(2), S31: K(6),
  S33: K(1), S34: K(3), S36: K(5),
};
export const inselFuer = (saison: string): string => INSEL_JE_SAISON[saison] ?? KEINE_KARTE;

/* ------------------------------------------------------------------ Verzeichnis */

/** Alle Ereignisse ohne Noble-Karte - auch die versteckten (fuer den Admin). */
export async function alleAlteEreignisse(
  nobleFenster: Set<string>, archiv: ArchivEintrag[], typVon: (n: string) => MapTyp, bildJeTyp: Record<MapTyp, string | null>,
): Promise<AltEreignis[]> {
  const s = await liesAltStore();
  const eigene = (s.ereignisse ?? []).map((e) => ({ ...e, quelle: 'admin' as const }));
  const ids = new Set<string>([...nobleFenster, ...eigene.map((e) => e.windowId)]);
  // Wo Noble Practice die Karte selbst fuehrt (ab Juli 2025), gilt Nobles - der Katalog legt kein zweites Fenster daneben.
  // Nobles Finale traegt beide Tage in einem Fenster (..._Final_EU), das Archiv fuehrt Day 1 und Day 2 getrennt; die Last-Chance-Runde
  // heisst bei Noble "Qualifier", im Archiv "Lobby" - gemeint ist dasselbe Fenster.
  const gleich = (id: string) => id.replace(/_Day\d/, '').replace('LastChanceLobby', 'LastChanceQualifier');
  const nobleGleich = new Set([...nobleFenster].map(gleich));
  const katalog = ausKatalog(archiv, typVon).filter((e) => !ids.has(e.windowId) && !nobleGleich.has(gleich(e.windowId))
    && !(e.tage ?? []).some((t) => ids.has(t.windowId)));
  void bildJeTyp;
  // Was der Admin an einem Event geaendert hat, gilt vor dem, was aus dem Katalog kommt.
  return [...katalog, ...eigene].map((e) => {
    const m = s.fenster?.[e.windowId]?.meta;
    if (!m) return e;
    return {
      ...e,
      ...(m.cup ? { cup: m.cup } : {}),
      ...(m.fenster ? { fenster: m.fenster } : {}),
      ...(m.datum !== undefined ? { datum: m.datum } : {}),
      ...(m.lan !== undefined ? { lan: m.lan } : {}),
      ...(m.bild !== undefined ? { bild: m.bild } : {}),
    };
  });
}

/** Das Bild des Kapitels, wo ein Event kein eigenes hat (die Kapitelbilder der Maps-Seite). */
function kapitelBild(saison: string): string {
  const nr = Number(saison.slice(1));
  if (nr <= 10) return '/saisonbilder/CH1.jpg';
  if (nr <= 18) return '/saisonbilder/Chapter 2 Remix.jpg';
  if (nr <= 22) return '/saisonbilder/CH3.jpg';
  if (nr <= 27) return '/saisonbilder/CH4.jpg';
  if (nr <= 32) return '/saisonbilder/CH5S4.jpg';
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
      titel: e.titel ?? `${e.cup} · ${e.fenster}`, datum: e.datum, saison: e.saison, saisonKurz: '', saisonName: '',
      typ: e.typ, bild: e.bild ?? bildJeTyp[e.typ] ?? kapitelBild(e.saison), eventId: e.eventId, ende: e.ende,
    reihe: e.reihe, lan: e.lan, alt: true, tage: e.tage,
  });
  const weg = (e: AltEreignis) => !!s.fenster?.[e.windowId]?.versteckt;
  return { sichtbar: alle.filter((e) => !weg(e)).map(eintrag), versteckt: alle.filter(weg).map(eintrag) };
}

/* ------------------------------------------------------------------ Das Fenster einer alten Karte */

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

/**
 * Die Teams eines Events: was der Admin angelegt hat. Hat er noch keins angelegt und gibt es zum Event Epics Bestenliste
 * (und hat er sie nicht abgeschaltet), steht vorerst diese da - sobald das erste eigene Team da ist, gilt nur noch seins.
 */
/**
 * Epics Bestenliste zu einer Karte. Ein Finale an zwei Tagen (Day 1, Day 2) kennt drei Ansichten: "gesamt" rechnet beide
 * Tage zusammen (die Bestenliste mit mehreren Fenstern), "1" und "2" zeigen den Tag allein.
 */
async function epicZeilen(e: MapEintrag, tag: string): Promise<CupEintrag[]> {
  const tage = e.tage ?? [];
  const eventId = e.eventId as string;
  if (tage.length > 1) {
    const nr = Number(tag);
    const einer = Number.isInteger(nr) && nr >= 1 && nr <= tage.length ? tage[nr - 1] : null;
    if (einer) {
      return (await gecacht(`alt|top|${einer.windowId}`, 10 * 60_000, () => holeTop(einer.eventId ?? eventId, einer.windowId, 100))).entries;
    }
    return gecacht(`alt|gesamt|${e.windowId}`, 10 * 60_000, async () => {
      const url = `http://localhost/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&windows=${tage.map((t) => encodeURIComponent(t.windowId)).join(',')}&limit=100`;
      const r = await bestenliste(new Request(url));
      const j = await r.json() as { entries?: CupEintrag[] };
      if (!r.ok || !Array.isArray(j.entries)) throw new Error('Epic liefert die Bestenliste gerade nicht.');
      return j.entries;
    });
  }
  return (await gecacht(`alt|top|${e.windowId}`, 10 * 60_000, () => holeTop(eventId, e.windowId, 100))).entries;
}

async function teamsFuer(e: MapEintrag, daten: AltFensterDaten | undefined, tag = 'gesamt'): Promise<SolosTeam[]> {
  const kontext = await spielerKontext();
  const spieler = (id: string, roh: string, land?: string): SolosSpieler => kontext(id, roh, land);
  const eigene = daten?.teams ?? [];
  if (!eigene.length && e.eventId && daten?.epicAn !== false) {
    try {
      return (await epicZeilen(e, tag)).map((en) => ({
        id: en.teamId ?? `r${en.rank}`,
        spieler: en.players.map((p) => spieler(p.id, p.name)),
        rang: en.rank, punkte: en.points ?? null, siege: en.wins ?? null, elims: en.elims ?? null,
      }));
    } catch { return []; }
  }
  // Ein FNCS-Endspiel ohne Epic-Bestenliste (vor Chapter 5 Season 3): die Platzierungsliste der Szene-Quelle - Teams, Spieler, Flaggen.
  if (!eigene.length && !e.eventId && daten?.epicAn !== false) {
    const a = endspielArt(e);
    const liste = a ? await plaetze(schluesselVon(e.saison, a.art)) : [];
    if (liste.length) {
      return liste.map((t) => ({
        id: `l${t.rang}`, spieler: t.spieler.map((s) => spieler(s.id, s.name, s.land ?? undefined)), rang: t.rang, punkte: null, siege: null,
      }));
    }
  }
  return eigene.map((t) => ({
    id: t.id,
    spieler: t.spieler.map((p, i) => spieler(p.epicId || `${t.id}-${i}`, p.name, p.land)),
    rang: t.rang ?? null, punkte: t.punkte ?? null, siege: t.siege ?? null, elims: t.elims ?? null,
  }));
}

/** Zeigt die Seite fuer dieses Event gerade Epics Daten (kein eigenes Team, Epic nicht abgeschaltet)? */
export function zeigtEpic(e: MapEintrag, daten: AltFensterDaten | undefined): boolean {
  return !(daten?.teams?.length) && !!e.eventId && daten?.epicAn !== false;
}

export async function alteFenster(e: MapEintrag, tag = 'gesamt'): Promise<{ turnier: string; fenster: SolosFenster; tage: Array<{ name: string; windowId: string }> }> {
  const s = await liesAltStore();
  const daten = s.fenster?.[e.windowId];
  const teams = await teamsFuer(e, daten, tag);
  const nachId = new Map(teams.map((t) => [t.id, t]));
  const alle = new Map<string, SolosSpieler>();
  for (const t of teams) for (const p of t.spieler) alle.set(p.id, p);
  const formen = (daten?.formen ?? []).map((f) => {
    const dabei = f.teamIds.map((id) => nachId.get(id)).filter((t): t is SolosTeam => !!t);
    return { punkte: f.punkte, spieler: dabei.flatMap((t) => t.spieler.map((p) => p.anzeige)), teams: dabei.length, gruppen: dabei.map((t) => t.spieler.map((p) => p.anzeige)) };
  });
  return {
    turnier: e.cup,
    fenster: {
      windowId: e.windowId, name: e.fenster, art: 'finale', start: iso(e.datum), end: iso(e.ende),
      // Die Insel der Saison (siehe INSEL_JE_SAISON); die Wahl des Admins fuer diese Karte steht auf der Seite darueber.
      spieler: [...alle.values()], teams, bild: inselFuer(e.saison), formen, quelle: zeigtEpic(e, daten) ? 'epic' : 'hand',
    },
    tage: (e.tage ?? []).map((t) => ({ name: t.name, windowId: t.windowId })),
  };
}

/** Fuer den Editor: ausschliesslich das, was der Admin selbst angelegt hat - es wird nichts hineingeladen. */
export async function alteBearbeitung(e: MapEintrag & { quelle?: string }) {
  const s = await liesAltStore();
  const daten = s.fenster?.[e.windowId];
  return {
    teams: daten?.teams ?? [],
    formen: daten?.formen ?? [],
    versteckt: !!daten?.versteckt,
    hatEpic: !!e.eventId,
    epicAn: daten?.epicAn !== false,
    meta: {
      cup: e.cup, fenster: e.fenster, datum: e.datum, lan: !!e.lan, bild: e.bild,
    },
    eigenesEvent: (s.ereignisse ?? []).some((x) => x.windowId === e.windowId),
  };
}

/** Die Uebersicht fuer die Verwaltung: Zahlen je Karte, damit man sieht, wo schon etwas drinsteht. */
export async function alteZahlen(): Promise<Record<string, { formen: number; teams: number; rang: number; versteckt: boolean }>> {
  const s = await liesAltStore();
  const raus: Record<string, { formen: number; teams: number; rang: number; versteckt: boolean }> = {};
  for (const [w, d] of Object.entries(s.fenster ?? {})) {
    raus[w] = { formen: d.formen?.length ?? 0, teams: d.teams?.length ?? 0, rang: (d.teams ?? []).filter((t) => t.rang != null).length, versteckt: !!d.versteckt };
  }
  return raus;
}
