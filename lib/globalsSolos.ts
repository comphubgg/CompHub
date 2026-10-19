/*
 * FNCS Globals Solos - wer sich wie qualifiziert hat, wer in welchem Heat steht, und die Karten.
 *
 * Der Betreiber (11.10.2026): "eine neue VIP-Page fuer Globals Solos. Da tust du automatisch immer die
 * eintragen, die sich direkt qualifiziert haben ... Dann kommt noch irgendwann Last Chance Qualifier ...
 * Und nachher zu den Heats: welche Spieler in welchem Heat sind. Dann natuerlich die Map."
 *
 * Alles kommt von Noble Practice (tournaments.nobleprac.com): je Fenster die Spieler und ihre Formen.
 * Die Finalisten sind die Spieler des Fensters "Finals" - sie stehen dort, sobald sie sich qualifiziert
 * haben. Wie sie das getan haben, ergibt sich aus den anderen Fenstern: wer in einem Heat steht, kam
 * ueber diesen Heat; sonst ueber das Qualifier-Fenster, in dessen Ergebnissen er auftaucht (Rang und
 * Punkte aus Epics Bestenliste). Eine feste Zahl wie "die ersten acht" steht hier nicht: es zaehlt, wen
 * Noble im Finale fuehrt.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';
import { DATEN_ORT } from '@/lib/datenOrt';
import { gecacht, holeTop, listeCups } from '@/lib/epicCups';
import { detail, jungeTurniere, formenAus, namenRepariert, type RohDetail } from '@/lib/nobleKarte';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { kernname } from '@/lib/homoglyph';
import { istVitalRegion, vitalFormen, vitalFuer, vitalKarte, vitalTurniere } from '@/lib/vitalScrims';

/** Das Turnier bei Noble: "FNCS Solos" der laufenden Saison. */
const TURNIER_NAME = /^FNCS Solos$/i;
const REGION = 'EU';

export { SOLOS_REGIONEN, type SolosRegion } from '@/lib/solosRegionen';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';

export interface SolosSpieler {
  id: string;
  name: string;
  anzeige: string;
  land: string | null;
  bild: string | null;
}

export type FensterArt = 'qualifier' | 'heat' | 'finale' | 'sonst';

export interface SolosFenster {
  windowId: string;
  name: string;
  art: FensterArt;
  start: string | null;
  end: string | null;
  spieler: SolosSpieler[];
  /** Die Teams des Spieltags (bei Solos je ein Spieler) - mit Platz und Punkten, wo es sie schon gibt. */
  teams?: SolosTeam[];
  /** Das Kartenbild zu diesem Spieltag (die Karte der Spielversion, bei Reload die Reload-Karte). */
  bild?: string | null;
  /** Nur bei den alten Karten (lib/alteMaps): kommen die Teams von Epics Bestenliste oder hat der Admin sie angelegt? */
  quelle?: 'epic' | 'hand';
  /** Die Landepunkte, mit den Anzeigenamen der Spieler darauf - Ecken in Prozent des Kartenbildes. */
  formen: Array<{
    punkte: Array<{ x: number; y: number }>; spieler: string[];
    /** Wie viele Teams auf dieser Stelle stehen. */ teams?: number;
    /** Die Spieler je Team - damit ein Duo oder Trio auf der Karte nebeneinander steht, wenn mehrere Teams auf einer Stelle sind. */
    gruppen?: string[][];
  }>;
}

export interface SolosTeam {
  id: string;
  spieler: SolosSpieler[];
  rang: number | null;
  punkte: number | null;
  siege: number | null;
  /** Nur bei von Hand gepflegten und archivierten Bestenlisten (lib/alteMaps, lib/fncsBestenlisten). */
  elims?: number | null;
  /** Gespielte Matches - nur bei archivierten Bestenlisten. */
  spiele?: number | null;
}

export interface SolosGruppe {
  /** "Fast Tracks", "Heat 1" ... - woher diese Spieler kommen. */
  quelle: string;
  windowId: string | null;
  art: FensterArt;
  spieler: Array<SolosSpieler & { rang: number | null; punkte: number | null }>;
}

export interface SolosDaten {
  /** Die Region, fuer die diese Daten gelten. */
  region: string;
  /** Woher die Spieler stammen: Noble Practice (Europa, mit Landepunkten) oder Epics Bestenlisten (alle anderen Regionen). */
  quelle: 'noble' | 'epic';
  turnier: { id: string; name: string };
  stand: string;
  fenster: SolosFenster[];
  /** Die Finalisten, nach Herkunft gruppiert. */
  qualifiziert: SolosGruppe[];
}

interface Profil { anzeige?: string; name?: string; land?: string }
interface Bildeintrag { datei: string; epicId: string; echtesFoto?: boolean }

function artVon(name: string): FensterArt {
  if (/final/i.test(name)) return 'finale';
  if (/heat/i.test(name)) return 'heat';
  if (/fast track|last chance|qualif/i.test(name)) return 'qualifier';
  return 'sonst';
}

/** Epics Ereignis-Kennung zu einer Fenster-Kennung - aus Epics eigenem Katalog. */
async function eventZu(windowId: string, region: string = REGION): Promise<string | null> {
  try {
    const k = await gecacht(`solos|katalog|${region}`, 10 * 60_000, () => listeCups(region));
    return k.windows.find((w) => w.windowId === windowId)?.eventId ?? null;
  } catch { return null; }
}

async function ergebnisse(windowId: string, region: string = REGION): Promise<Map<string, { rang: number; punkte: number }>> {
  const karte = new Map<string, { rang: number; punkte: number }>();
  const event = await eventZu(windowId, region);
  if (!event) return karte;
  try {
    const roh = await gecacht(`solos|top|${windowId}`, 2 * 60_000, () => holeTop(event, windowId, 100, true));
    for (const e of (roh as { entries?: Array<{ rank: number; points?: number; players?: Array<{ id: string }> }> }).entries ?? []) {
      for (const p of e.players ?? []) karte.set(p.id, { rang: e.rank, punkte: e.points ?? 0 });
    }
  } catch { /* ohne Ergebnisse bleibt die Gruppe ohne Rang */ }
  return karte;
}

export type SpielerVon = (id: string, roh: string, land?: string) => SolosSpieler;

/**
 * Die Heimatlaender aus der Spielerliste der Szene-Quelle (Konto-Id -> Laenderkuerzel).
 *
 * Der Betreiber (12.10.2026): auf den Karten standen bei den meisten Spielern Weltkugeln statt Flaggen, "weil dazu ja jeder
 * Spieler eigentlich in der Liste steht". Die Liste kennt das Land zu rund 2.100 der im Archiv gefuehrten Konten - sie ist
 * dieselbe Grundlage, die auch die Statistikseite nimmt. Ein gepflegtes Profil schlaegt sie, Nobles Angabe auch; nur wo beide
 * nichts wissen, springt sie ein. Wo auch sie nichts kennt, bleibt die Weltkugel: ein Land wird nicht geraten.
 */
/*
 * Dieselbe Liste kennt auch den Namen, unter dem ein Spieler in der Szene gefuehrt wird ("T3ENY", "VICO") - ohne Orgtag, ohne Startnummer, ohne den
 * Namen, den er gerade traegt. Betreiber (14.10.2026): auf den Karten und Bestenlisten alter Cups sollen die Spieler stehen, wie sie heissen
 * und nicht wie sie sich gerade nennen ("HVK TJINO 1!" - gemeint ist Tjino); ein echter Name, "weil du ja nicht weisst, wie sie damals hiessen".
 */
let szeneListe: { bis: number; land: Map<string, string>; name: Map<string, string> } | null = null;
async function szeneAngaben(): Promise<{ land: Map<string, string>; name: Map<string, string> }> {
  if (szeneListe && szeneListe.bis > Date.now()) return szeneListe;
  const land = new Map<string, string>();
  const name = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as Array<{ ID?: string; NAME?: string; COUNTRY?: string }>;
    for (const p of roh) {
      if (!p.ID) continue;
      if (/^[A-Za-z]{2}$/.test(p.COUNTRY ?? '')) land.set(p.ID, (p.COUNTRY as string).toUpperCase());
      const n = String(p.NAME ?? '').trim();
      // Bei einigen Konten steht in der Liste nur die Konto-Id statt eines Namens (376 von ueber 4000) - das ist kein Name.
      if (n && !/^[0-9a-f]{32}$/i.test(n)) name.set(p.ID, n);
    }
  } catch { /* ohne Liste bleibt es bei Profil und Noble */ }
  szeneListe = { bis: Date.now() + 10 * 60_000, land, name };
  return szeneListe;
}

/** Wie ein Spieler aus Noble zu unserem Anzeigenamen, Land und Foto kommt (Profile und Spielerbilder des Werkzeugs). */
export async function spielerKontext(): Promise<SpielerVon> {
  const [profile, bilder, szene] = await Promise.all([
    liesJson<Record<string, Profil>>('spieler-profile.json', {}),
    liesJson<Bildeintrag[]>('spielerbilder.json', []),
    szeneAngaben(),
  ]);
  const bildZu = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.echtesFoto) bildZu.set(b.epicId, spielerbildKlein(b.datei));
  return (id, roh, land) => {
    const pr = profile[id];
    const name = namenRepariert(roh);
    const nobleLand = land && land !== 'global' ? land.toUpperCase() : null;
    return {
      id, name,
      // Ein gepflegtes Profil zuerst, dann der Name der Szene-Liste; wo beide fehlen, der Epic-Name ohne Orgtag und Startnummer (nie der rohe).
      anzeige: pr?.anzeige || szene.name.get(id) || kernname(pr?.name || name) || name,
      land: (pr?.land || nobleLand || szene.land.get(id) || '').toUpperCase() || null,
      bild: bildZu.get(id) ?? null,
    };
  };
}

/** Aus einem Fenster von Noble (Teams, Spieler, Formen) unser Fenster mit Spielern und Landeformen. */
function fensterAus(w: { windowId: string; name: string; startDate?: string; endDate?: string }, d: RohDetail | null, spielerVon: SpielerVon): SolosFenster {
  const teams = d?.windowData?.teams ?? [];
  const spieler: SolosSpieler[] = [];
  const bekannt = new Set<string>();
  for (const t of teams) {
    for (const p of t.players ?? []) {
      if (!p.accountId || bekannt.has(p.accountId)) continue;
      bekannt.add(p.accountId);
      spieler.push(spielerVon(p.accountId, p.username ?? '', (p as { country?: string }).country));
    }
  }
  const nachId = new Map(spieler.map((s) => [s.id, s]));
  const { formen } = d ? formenAus(d) : { formen: [] };
  const teamListe: SolosTeam[] = [];
  for (const t of teams) {
    const mitglieder = (t.players ?? []).filter((p) => p.accountId).map((p) => nachId.get(p.accountId)).filter((x): x is SolosSpieler => !!x);
    if (!mitglieder.length) continue;
    teamListe.push({
      id: t.teamId, spieler: mitglieder,
      rang: typeof t.rank === 'number' ? t.rank : null, punkte: typeof t.points === 'number' ? t.points : null,
      siege: typeof t.wins === 'number' ? t.wins : null,
    });
  }
  return {
    windowId: w.windowId, name: w.name, art: artVon(w.name),
    start: w.startDate ?? null, end: w.endDate ?? null,
    spieler,
    teams: teamListe,
    bild: saubereKarte(d?.windowData?.map?.withoutPOINames),
    formen: formen.map((f) => ({
      punkte: f.punkte,
      spieler: f.teams.flatMap((t) => t.ids.map((id) => nachId.get(id)?.anzeige ?? '')).filter(Boolean),
      teams: f.teams.length,
      gruppen: f.teams.map((t) => t.ids.map((id) => nachId.get(id)?.anzeige ?? '').filter(Boolean)),
    })),
  };
}

/**
 * Das Kartenbild ohne fremdes Logo.
 *
 * Der Betreiber (13.10.2026): "bei der Global Championship ist die Map von Noble drin, mit dem Noble-Logo und allem. Mein Logo muss
 * dort sein, nicht Noble. Es darf nirgendwo ein Noble-Logo drin sein." Das Bild, das Noble je Fenster nennt (map-10.png), traegt
 * ihr Logo und ein Wasserzeichen quer ueber die Insel. Die Karte der Spielversion selbst liegt daneben als map.png - ohne beides.
 * Das Wasserzeichen der Seite ("thecomphub.com") legt die Kartenansicht darueber.
 */
export function saubereKarte(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/map-\d+\.png$/i, '/map.png');
}

/** Das Fenster irgendeines Noble-Turniers - fuer die Maps-Seiten (jeder Cup, jede Karte). */
export async function fensterFuer(turnierId: string, region: string, windowId: string): Promise<{ turnier: string; fenster: SolosFenster } | null> {
  const uebersicht = await detail(turnierId, region);
  const w = (uebersicht.tournamentData?.windows ?? []).find((x) => x.windowId === windowId);
  if (!w) return null;
  const [d, spielerVon] = await Promise.all([detail(turnierId, region, windowId), spielerKontext()]);
  return { turnier: uebersicht.tournamentData?.tournamentName ?? '', fenster: fensterAus(w, d, spielerVon) };
}

/** Das saubere Kartenbild, das Noble zu dieser Zeit fuehrt - das Fenster eines europaeischen Turniers, das dem Datum am naechsten liegt (hoechstens 25 Tage entfernt). */
async function nobleKartenbildNahe(datum: number): Promise<string | null> {
  try {
    const turniere = await jungeTurniere(14);
    const kandidaten: Array<{ abstand: number; t: string; w: string }> = [];
    await Promise.all(turniere.map(async (t) => {
      try {
        const d = await detail(t.id, 'EU');
        for (const w of d.tournamentData?.windows ?? []) {
          const s = w.startDate ? Date.parse(w.startDate) : NaN;
          if (Number.isFinite(s)) kandidaten.push({ abstand: Math.abs(s - datum), t: t.id, w: w.windowId });
        }
      } catch { /* dieses Turnier ueberspringen */ }
    }));
    kandidaten.sort((a, b) => a.abstand - b.abstand);
    const nah = kandidaten[0];
    if (!nah || nah.abstand > 25 * 86_400_000) return null;
    const d = await detail(nah.t, 'EU', nah.w);
    return saubereKarte(d.windowData?.map?.withoutPOINames);
  } catch { return null; }
}

/**
 * Das Fenster einer Region, die Noble nicht fuehrt (NA Central, NA West, Middle East, Ozeanien): die Landepunkte von Vital Scrims (lib/vitalScrims), die Spieler
 * mit Land und Foto wie bei Noble. Das Kartenbild ist das saubere von Noble zur selben Zeit - Vitals eigenes traegt ein Wasserzeichen.
 */
export async function vitalFenster(o: { windowId: string; name: string; region: string; begin: number; ende?: number | null; vitalId?: string }): Promise<{ turnier: string; fenster: SolosFenster } | null> {
  const liste = await vitalTurniere();
  const v = o.vitalId ? (liste.find((t) => t.id === o.vitalId) ?? null) : await vitalFuer(o.region, o.begin, o.ende);
  if (!v) return null;
  const karte = await vitalKarte(v.id, v.ende < Date.now());
  if (!karte) return null;
  const spielerVon = await spielerKontext();
  const sp = (s: { id: string; name: string }) => spielerVon(s.id, s.name);
  const { formen } = vitalFormen(karte, (id, roh) => sp({ id, name: roh }).anzeige);
  const spieler: SolosSpieler[] = [];
  const bekannt = new Set<string>();
  const teams: SolosTeam[] = [];
  for (const t of karte.teams) {
    const m = t.spieler.map(sp);
    for (const s of m) if (!bekannt.has(s.id)) { bekannt.add(s.id); spieler.push(s); }
    teams.push({ id: t.id, spieler: m, rang: null, punkte: null, siege: null });
  }
  return {
    turnier: v.name,
    fenster: {
      windowId: o.windowId, name: o.name, art: artVon(o.name),
      start: new Date(v.start).toISOString(), end: new Date(v.ende).toISOString(),
      spieler, teams, bild: await nobleKartenbildNahe(o.begin),
      formen: formen.map((fo) => ({ punkte: fo.punkte, spieler: fo.teams.flatMap((t) => t.namen), teams: fo.teams.length, gruppen: fo.teams.map((t) => t.namen) })),
    },
  };
}

/** Wer im Finale steht und wie er dorthin kam: ueber einen Heat, ueber ein Qualifier-Fenster (Fast Tracks, Last Chance) oder sonst. */
async function herkunftAus(fenster: SolosFenster[], region: string): Promise<SolosGruppe[]> {
  /* ------------------------------------------------------ Wer kam woher */
  // Das Finale kann an zwei Tagen laufen - jeder Spieler zaehlt einmal.
  const finale = [...new Map(fenster.filter((f) => f.art === 'finale').flatMap((f) => f.spieler).map((s) => [s.id, s])).values()];
  const heats = fenster.filter((f) => f.art === 'heat');
  const qualis = fenster.filter((f) => f.art === 'qualifier');
  const ergebnisseJe = new Map<string, Map<string, { rang: number; punkte: number }>>();
  await Promise.all(qualis.map(async (q) => { ergebnisseJe.set(q.windowId, await ergebnisse(q.windowId, region)); }));

  const gruppen = new Map<string, SolosGruppe>();
  const zu = (kopf: { quelle: string; windowId: string | null; art: FensterArt }) => {
    const k = kopf.windowId ?? kopf.quelle;
    if (!gruppen.has(k)) gruppen.set(k, { ...kopf, spieler: [] });
    return gruppen.get(k)!;
  };
  for (const sp of finale) {
    // Heat zuerst: wer dort steht, hat den Weg ueber den Heat genommen.
    const heat = heats.find((h) => h.spieler.some((x) => x.id === sp.id));
    if (heat) { zu({ quelle: heat.name, windowId: heat.windowId, art: 'heat' }).spieler.push({ ...sp, rang: null, punkte: null }); continue; }
    const quali = qualis.find((q) => ergebnisseJe.get(q.windowId)?.has(sp.id));
    if (quali) {
      const e = ergebnisseJe.get(quali.windowId)!.get(sp.id)!;
      zu({ quelle: quali.name, windowId: quali.windowId, art: 'qualifier' }).spieler.push({ ...sp, rang: e.rang, punkte: e.punkte });
      continue;
    }
    zu({ quelle: 'Other', windowId: null, art: 'sonst' }).spieler.push({ ...sp, rang: null, punkte: null });
  }
  const qualifiziert = [...gruppen.values()].map((g) => ({
    ...g,
    spieler: [...g.spieler].sort((a, b) => (a.rang ?? 9999) - (b.rang ?? 9999)),
  })).sort((a, b) => {
    const reihenfolge = (g: SolosGruppe) => (g.art === 'qualifier' ? 0 : g.art === 'heat' ? 1 : 2);
    return reihenfolge(a) - reihenfolge(b);
  });


  return qualifiziert;
}

export async function globalsSolos(region: string = REGION): Promise<SolosDaten | null> {
  if (region !== REGION) return globalsSolosEpic(region);
  const turniere = await jungeTurniere(12);
  const turnier = turniere.find((t) => TURNIER_NAME.test(t.tournamentName));
  if (!turnier) return null;

  const uebersicht = await detail(turnier.id, REGION);
  const fensterListe = uebersicht.tournamentData?.windows ?? [];
  const einzeln = await Promise.all(fensterListe.map(async (w) => {
    try { return { w, d: await detail(turnier.id, REGION, w.windowId) as RohDetail }; }
    catch { return { w, d: null }; }
  }));

  const spielerVon = await spielerKontext();

  const fenster: SolosFenster[] = einzeln.map(({ w, d }) => fensterAus(w, d, spielerVon))
    .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));

  const qualifiziert = await herkunftAus(fenster, REGION);

  return {
    region: REGION, quelle: 'noble',
    turnier: { id: turnier.id, name: turnier.tournamentName },
    stand: new Date().toISOString(),
    fenster,
    qualifiziert,
  };
}

/* ------------------------------------------------------------------ Andere Regionen */

/** Wie ein Fenster auf der Seite heisst - aus Epics Kennung ("S42_FNCSSolo_HeatsStage_Heat2_NAC" -> "Heat 2"). */
function fensterName(windowId: string): string | null {
  let m = /Heat(\d+)/i.exec(windowId); if (m) return `Heat ${m[1]}`;
  if (/FastTracks/i.test(windowId)) return 'Fast Tracks';
  if (/LastChanceQualifier/i.test(windowId)) return 'Last Chance Qualifier';
  if (/LastChanceLobby/i.test(windowId)) return 'Last Chance Finals';
  m = /Final_Day(\d)/i.exec(windowId); if (m) return `Finals Day ${m[1]}`;
  return null;
}

/**
 * FNCS Solos einer anderen Region: Noble fuehrt nur Europa, hier kommen die Spieler jedes Heats, der Fast Tracks, der Last Chance und der Finals aus Epics
 * eigenen Bestenlisten (Betreiber, 19.10.2026: "bei den Heats eine Region waehlen koennen"). Wer in einem Heat steht, ist dort gestartet - ein Heat, der noch nicht
 * gespielt wurde, hat deshalb noch keine Spieler. Landepunkte gibt es hier keine (die kennt nur Noble).
 */
async function globalsSolosEpic(region: string): Promise<SolosDaten | null> {
  if (!(SOLOS_REGIONEN as readonly string[]).includes(region)) return null;
  const katalog = await gecacht(`solos|katalog|${region}`, 10 * 60_000, () => listeCups(region));
  const ende = new RegExp(`_${region}$`);
  const fenster0 = katalog.windows
    .filter((w) => /FNCSSolo/i.test(w.windowId) && ende.test(w.windowId) && fensterName(w.windowId))
    .sort((a, b) => a.begin - b.begin);
  if (!fenster0.length) return null;
  const spielerVon = await spielerKontext();

  const fenster = await Promise.all(fenster0.map(async (w): Promise<SolosFenster> => {
    const name = fensterName(w.windowId) as string;
    const art = artVon(name);
    let eintraege: Array<{ rank: number; points?: number; wins?: number; players?: Array<{ id: string; name?: string; displayName?: string }> }> = [];
    if (w.status !== 'kommt') {
      try {
        const roh = await gecacht(`solos|spieler|${w.windowId}`, w.status === 'vorbei' ? 20 * 60_000 : 2 * 60_000, () => holeTop(w.eventId, w.windowId, 200, false));
        eintraege = (roh as { entries?: typeof eintraege }).entries ?? [];
      } catch { /* ohne Bestenliste bleibt das Fenster ohne Spieler */ }
    }
    const spieler: SolosSpieler[] = [];
    const teams: SolosTeam[] = [];
    const bekannt = new Set<string>();
    for (const e of eintraege) {
      const sp: SolosSpieler[] = [];
      for (const p of e.players ?? []) {
        if (!p.id) continue;
        const s = spielerVon(p.id, p.displayName || p.name || '');
        sp.push(s);
        if (!bekannt.has(p.id)) { bekannt.add(p.id); spieler.push(s); }
      }
      if (sp.length) teams.push({ id: String(e.rank), spieler: sp, rang: e.rank, punkte: e.points ?? null, siege: e.wins ?? null });
    }
    return {
      windowId: w.windowId, name, art,
      start: new Date(w.begin).toISOString(), end: w.end ? new Date(w.end).toISOString() : null,
      spieler, teams, formen: [],
    };
  }));

  // Landepunkte: Noble fuehrt nur Europa - die anderen Regionen kommen von Vital Scrims.
  if (istVitalRegion(region)) {
    await Promise.all(fenster.map(async (f, i) => {
      try {
        const v = await vitalFenster({ windowId: f.windowId, name: f.name, region, begin: fenster0[i].begin, ende: fenster0[i].end });
        if (!v) return;
        f.formen = v.fenster.formen;
        f.bild = v.fenster.bild;
        // Ein Fenster, das Epic noch nicht fuehrt (der Heat laeuft noch nicht), zeigt trotzdem die Spieler, die Vital schon eingeteilt hat.
        if (!f.spieler.length) { f.spieler = v.fenster.spieler; f.teams = v.fenster.teams; }
      } catch { /* ohne Vital bleibt das Fenster ohne Landepunkte */ }
    }));
  }

  const qualifiziert = await herkunftAus(fenster, region);
  return {
    region, quelle: 'epic',
    turnier: { id: 'S42-FNCSSolos', name: 'FNCS Solos' },
    stand: new Date().toISOString(),
    fenster, qualifiziert,
  };
}
