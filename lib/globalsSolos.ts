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

/** Das Turnier bei Noble: "FNCS Solos" der laufenden Saison. */
const TURNIER_NAME = /^FNCS Solos$/i;
const REGION = 'EU';

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
  formen: Array<{ punkte: Array<{ x: number; y: number }>; spieler: string[]; /** Wie viele Teams auf dieser Stelle stehen. */ teams?: number }>;
}

export interface SolosTeam {
  id: string;
  spieler: SolosSpieler[];
  rang: number | null;
  punkte: number | null;
  siege: number | null;
  /** Nur bei von Hand gepflegten Bestenlisten (lib/alteMaps). */
  elims?: number | null;
}

export interface SolosGruppe {
  /** "Fast Tracks", "Heat 1" ... - woher diese Spieler kommen. */
  quelle: string;
  windowId: string | null;
  art: FensterArt;
  spieler: Array<SolosSpieler & { rang: number | null; punkte: number | null }>;
}

export interface SolosDaten {
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
async function eventZu(windowId: string): Promise<string | null> {
  try {
    const k = await gecacht('solos|katalog', 10 * 60_000, () => listeCups(REGION));
    return k.windows.find((w) => w.windowId === windowId)?.eventId ?? null;
  } catch { return null; }
}

async function ergebnisse(windowId: string): Promise<Map<string, { rang: number; punkte: number }>> {
  const karte = new Map<string, { rang: number; punkte: number }>();
  const event = await eventZu(windowId);
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
let szeneLaender: { bis: number; karte: Map<string, string> } | null = null;
async function szeneLand(): Promise<Map<string, string>> {
  if (szeneLaender && szeneLaender.bis > Date.now()) return szeneLaender.karte;
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as Array<{ ID?: string; COUNTRY?: string }>;
    for (const p of roh) if (p.ID && /^[A-Za-z]{2}$/.test(p.COUNTRY ?? '')) karte.set(p.ID, (p.COUNTRY as string).toUpperCase());
  } catch { /* ohne Liste bleibt es bei Profil und Noble */ }
  szeneLaender = { bis: Date.now() + 10 * 60_000, karte };
  return karte;
}

/** Wie ein Spieler aus Noble zu unserem Anzeigenamen, Land und Foto kommt (Profile und Spielerbilder des Werkzeugs). */
export async function spielerKontext(): Promise<SpielerVon> {
  const [profile, bilder, szene] = await Promise.all([
    liesJson<Record<string, Profil>>('spieler-profile.json', {}),
    liesJson<Bildeintrag[]>('spielerbilder.json', []),
    szeneLand(),
  ]);
  const bildZu = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.echtesFoto) bildZu.set(b.epicId, spielerbildKlein(b.datei));
  return (id, roh, land) => {
    const pr = profile[id];
    const name = namenRepariert(roh);
    const nobleLand = land && land !== 'global' ? land.toUpperCase() : null;
    return {
      id, name,
      anzeige: pr?.anzeige || pr?.name || name,
      land: (pr?.land || nobleLand || szene.get(id) || '').toUpperCase() || null,
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
    bild: d?.windowData?.map?.withoutPOINames ?? null,
    formen: formen.map((f) => ({
      punkte: f.punkte,
      spieler: f.teams.flatMap((t) => t.ids.map((id) => nachId.get(id)?.anzeige ?? '')).filter(Boolean),
      teams: f.teams.length,
    })),
  };
}

/** Das Fenster irgendeines Noble-Turniers - fuer die Maps-Seiten (jeder Cup, jede Karte). */
export async function fensterFuer(turnierId: string, region: string, windowId: string): Promise<{ turnier: string; fenster: SolosFenster } | null> {
  const uebersicht = await detail(turnierId, region);
  const w = (uebersicht.tournamentData?.windows ?? []).find((x) => x.windowId === windowId);
  if (!w) return null;
  const [d, spielerVon] = await Promise.all([detail(turnierId, region, windowId), spielerKontext()]);
  return { turnier: uebersicht.tournamentData?.tournamentName ?? '', fenster: fensterAus(w, d, spielerVon) };
}

export async function globalsSolos(): Promise<SolosDaten | null> {
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

  /* ------------------------------------------------------ Wer kam woher */
  const finale = fenster.filter((f) => f.art === 'finale').flatMap((f) => f.spieler);
  const heats = fenster.filter((f) => f.art === 'heat');
  const qualis = fenster.filter((f) => f.art === 'qualifier');
  const ergebnisseJe = new Map<string, Map<string, { rang: number; punkte: number }>>();
  await Promise.all(qualis.map(async (q) => { ergebnisseJe.set(q.windowId, await ergebnisse(q.windowId)); }));

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

  return {
    turnier: { id: turnier.id, name: turnier.tournamentName },
    stand: new Date().toISOString(),
    fenster,
    qualifiziert,
  };
}
