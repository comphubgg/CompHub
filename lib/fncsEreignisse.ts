import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mapsVerzeichnis, type MapEintrag } from '@/lib/mapsVerzeichnis';
import { liesAltStore } from '@/lib/alteMaps';
import { spielerKontext } from '@/lib/globalsSolos';
import { DATEN_ORT } from '@/lib/datenOrt';
import { GET as bestenliste } from '@/app/api/cup-leaderboard/route';
import { GET as globalsEndstand } from '@/app/api/globals-endstand/route';
import { globalsTeams } from '@/lib/globalsTeams';
import { GLOBALS_TAGE } from '@/lib/globalsCup';
import { liesJson } from '@/lib/ablage';
import { kernname, namensSchluessel, ohneZierrat } from '@/lib/homoglyph';
import { FNCS_FAKTEN, faktDatum, type FncsFakt } from '@/lib/fncsFakten';

/*
 * Die Endspiele der FNCS fuer die FNCS-Seite: jede Grand Finals, jede Global Championship, das Invitational und die Summit -
 * ein Eintrag je Event, auch wenn es an zwei Tagen gespielt wurde (Day 1 und Day 2 sind ein Event, die Platzierung ist die
 * Summe beider Tage).
 *
 * Der Betreiber (13.10.2026): die FNCS-Seite soll wie beim Vorbild aussehen - Vorschaubild oben, Flaggen bei den Platzierungen,
 * saubere Namen, die Teamzahl, bei den Globals "Global" statt Europa, und bei jedem Event ein Leaderboard. Woher die Platzierungen
 * kommen, in dieser Reihenfolge:
 *   1. was der Admin fuer das Event von Hand eingetragen hat (alte Maps),
 *   2. Epics Bestenliste - bei zwei Tagen beide zusammengerechnet,
 *   3. bei der Global Championship 2026 der Endstand der Globals-Seite,
 *   4. die Eckdaten in lib/fncsFakten (die ersten fuenf Plaetze samt Preisgeld) - fuer alles, wozu Epic nichts mehr fuehrt.
 * Das Preisgeld je Platz kommt immer aus den Eckdaten, wo sie das Event kennen.
 */

export interface FncsSpitze { rang: number; punkte: number | null; preis?: string; spieler: Array<{ name: string; land: string | null }> }

export interface FncsEreignis {
  key: string;
  saison: string; saisonKurz: string; saisonTitel: string | null;
  /** Grosse Kopfzeile oben auf der Karte: "CH7 S2", "2025", "MAJOR 1". */
  kopf1: string;
  /** Darunter: "GRAND FINALS", "GLOBAL CHAMPIONSHIP", "SUMMIT" ... */
  kopf2: string;
  titel: string;
  datum: number | null;
  lan: boolean;
  ort: string | null;
  /** "Europe" oder "Global" - Globals, Invitational und Summit sind weltweit. */
  region: string;
  preisgeld: string | null;
  bild: string | null;
  /** Die Cup-Seite dieses Events - leer bei Events, zu denen die Maps keine Karte fuehren (vor Chapter 2 Season 4). */
  turnierId: string; windowId: string; kartenRegion: string;
  teams: number | null;
  spitze: FncsSpitze[];
}

/** Ein Name ohne Turniermarke, Orgtag und Fremdalphabet-Zwillinge - wie auf den Kacheln der Tierlist ("[FNCS24] EXD Peterbot" wird "peterbot"). */
const rein = (n: string) => ohneZierrat(kernname(n)).trim() || n;

type Art = 'gf' | 'gc' | 'invitational' | 'summit' | 'royale' | 'allstar';
interface Kandidat { e: MapEintrag; art: Art; jahr?: string }

/** Welches FNCS-Endspiel ist diese Karte - oder keins? */
export function endspielArt(e: MapEintrag): { art: Art; jahr?: string } | null {
  if (e.alt) {
    if (e.titel === 'FNCS Grand Finals') return { art: 'gf' };
    if (e.titel === 'FNCS Grand Royale') return { art: 'royale' };
    if (e.titel === 'FNCS All-Star Showdown') return { art: 'allstar' };
    if (e.titel === 'FNCS Invitational 2022') return { art: 'invitational', jahr: '2022' };
    const gc = /^FNCS Global Championship (\d{4}) Grand Finals$/.exec(e.titel);
    return gc ? { art: 'gc', jahr: gc[1] } : null;
  }
  if (/^S\d+_FNCSMajor\d_Final_EU$/.test(e.windowId)) return { art: 'gf' };
  const gc = /^FNCS_Global_Championship_(\d{4})$/.exec(e.windowId);
  if (gc) return { art: 'gc', jahr: gc[1] };
  return e.windowId === 'FNCS_Major_1_Summit_Final' ? { art: 'summit' } : null;
}

const schluesselVon = (saison: string, art: Art) => `${saison}|${art}`;

function kandidaten(liste: MapEintrag[]): Kandidat[] {
  const raus: Kandidat[] = [];
  for (const e of liste) { const a = endspielArt(e); if (a) raus.push({ e, ...a }); }
  return raus;
}

const KOPF2: Record<Art, string> = {
  gf: 'GRAND FINALS', gc: 'GLOBAL CHAMPIONSHIP', invitational: 'INVITATIONAL', summit: 'SUMMIT', royale: 'GRAND ROYALE', allstar: 'ALL-STAR SOLO',
};
const REGION: Record<Art, string> = { gf: 'Europe', gc: 'Global', invitational: 'Global', summit: 'Global', royale: 'Europe', allstar: 'Europe' };

/* ------------------------------------------------------------------ Laender zu Namen */

/**
 * Das Land zu einem Spielernamen - fuer die Eckdaten, die nur Namen kennen. Quelle ist die Spielerliste der Szene-Quelle; bei
 * gleichen Namen gilt, wer bei den meisten Endspielen dabei war. Kennt sie den Namen nicht, bleibt die Weltkugel: ein Land wird
 * nicht geraten.
 */
let landMerker: { bis: number; karte: Map<string, string> } | null = null;
async function landVonName(): Promise<(name: string) => string | null> {
  if (!landMerker || landMerker.bis < Date.now()) {
    const karte = new Map<string, string>();
    try {
      const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as Array<Record<string, unknown>>;
      const punkte = new Map<string, number>();
      for (const p of roh) {
        const name = String(p.NAME ?? ''); const land = String(p.COUNTRY ?? '');
        if (!name || !/^[A-Za-z]{2}$/.test(land)) continue;
        const k = namensSchluessel(name);
        if (!k) continue;
        const gewicht = Object.entries(p).filter(([key, v]) => /^(CH\d|ALL_STAR|GRAND_ROYALE|INVITATIONAL|GLOBALS)/.test(key) && Number(v) > 0).length;
        if (!karte.has(k) || gewicht > (punkte.get(k) ?? 0)) { karte.set(k, land.toUpperCase()); punkte.set(k, gewicht); }
      }
    } catch { /* ohne Liste bleibt es bei der Weltkugel */ }
    landMerker = { bis: Date.now() + 10 * 60_000, karte };
  }
  const karte = landMerker.karte;
  return (name) => karte.get(namensSchluessel(name)) ?? null;
}

/* ------------------------------------------------------------------ Platzierungen */

interface Zeile { rank: number; points: number; players: Array<{ id: string; name?: string; displayName?: string }> }
interface ArchivEintrag { windowId?: string; eventId?: string }

async function ausBestenliste(url: string): Promise<Zeile[]> {
  const r = await bestenliste(new Request(url));
  const j = await r.json() as { entries?: Zeile[] };
  if (!r.ok || !Array.isArray(j.entries)) throw new Error('Epic liefert die Bestenliste gerade nicht.');
  return j.entries;
}

const preisVon = (f: FncsFakt | undefined, rang: number) => f?.top.find((t) => t.rang === rang)?.preis;

/** Die ersten Plaetze aus den Eckdaten, mit Flaggen. */
async function ausFakten(f: FncsFakt): Promise<FncsSpitze[]> {
  const land = await landVonName();
  return f.top.map((t) => ({ rang: t.rang, punkte: null, preis: t.preis, spieler: t.spieler.map((n) => ({ name: n, land: land(n) })) }));
}

/** Der Endstand der Global Championship 2026 (Globals-Seite): bis zu zehn Teams. */
async function ausGlobals(): Promise<FncsSpitze[]> {
  const r = await globalsEndstand();
  const j = await r.json() as { ok?: boolean; teams?: Array<{ rang: number; punkte: number; spieler: Array<{ anzeige: string; land: string | null }> }> };
  if (!j.ok || !j.teams?.length) return [];
  return j.teams.map((t) => ({ rang: t.rang, punkte: t.punkte, spieler: t.spieler.map((s) => ({ name: rein(s.anzeige), land: s.land })) }));
}

async function spitzeFuer(k: Kandidat, fakt: FncsFakt | undefined, archiv: Map<string, ArchivEintrag>): Promise<{ teams: number | null; spitze: FncsSpitze[] }> {
  const [kontext, landName] = await Promise.all([spielerKontext(), landVonName()]);
  // Das Land: erst das Profil, dann die Spielerliste der Szene-Quelle, dann der Name (LAN-Konten wie "[FNCS24] EXD Peterbot" kennt nur der Name).
  const spieler = (ps: Array<{ id: string; name?: string; displayName?: string }>) => ps.map((p) => {
    const x = kontext(p.id, p.displayName || p.name || '');
    const name = rein(x.anzeige);
    return { name, land: x.land ?? landName(name) };
  });
  const mitPreis = (s: FncsSpitze[]) => s.map((p) => ({ ...p, preis: p.preis ?? preisVon(fakt, p.rang) }));

  // 1. Von Hand eingetragen (alte Maps).
  const store = await liesAltStore();
  const eigene = store.fenster?.[k.e.windowId]?.teams ?? [];
  const hand = eigene.filter((t) => t.rang != null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  if (hand.length) {
    return {
      teams: eigene.length,
      spitze: mitPreis(hand.slice(0, 5).map((t) => ({ rang: t.rang as number, punkte: t.punkte ?? null, spieler: t.spieler.map((s) => ({ name: s.name, land: s.land ?? null })) }))),
    };
  }

  // 3. Die Global Championship 2026: der Endstand der Globals-Seite.
  if (/Global_Championship_2026$/.test(k.e.windowId)) {
    let teams: number | null = null;
    try { teams = (await globalsTeams(GLOBALS_TAGE[0].windowId)).teams.length || null; } catch { /* ohne Teamzahl */ }
    return { teams, spitze: mitPreis((await ausGlobals()).slice(0, 5)) };
  }

  // 2. Epics Bestenliste - bei zwei Tagen zusammengerechnet.
  const tage = k.e.tage ?? [];
  const fenster = tage.length > 1 ? tage.map((t) => t.windowId) : [k.e.windowId];
  const eventId = k.e.eventId ?? archiv.get(fenster[0])?.eventId ?? null;
  if (eventId) {
    try {
      const ziel = fenster.length > 1 ? `windows=${fenster.map(encodeURIComponent).join(',')}` : `window=${encodeURIComponent(fenster[0])}`;
      const zeilen = await ausBestenliste(`http://localhost/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&${ziel}&limit=100`);
      if (zeilen.length) {
        return {
          teams: zeilen.length,
          spitze: mitPreis(zeilen.slice(0, 5).map((z) => ({ rang: z.rank, punkte: z.points, spieler: spieler(z.players) }))),
        };
      }
    } catch { /* dann gelten die Eckdaten */ }
  }

  // 4. Die Eckdaten.
  return { teams: fakt?.teams ?? null, spitze: fakt ? await ausFakten(fakt) : [] };
}

/**
 * Die Platzierungen eines Events fuer die Cup-Seite, wo sonst keine Bestenliste steht: Global Championship 2026 (Globals-Seite)
 * oder die Eckdaten. Leer, wenn die Karte kein FNCS-Endspiel ist oder nichts bekannt ist.
 */
export async function fncsPlatzierungen(e: MapEintrag): Promise<FncsSpitze[]> {
  const a = endspielArt(e);
  if (!a) return [];
  const fakt = FNCS_FAKTEN[schluesselVon(e.saison, a.art)];
  if (/Global_Championship_2026$/.test(e.windowId)) {
    try { const g = await ausGlobals(); if (g.length) return g.map((p) => ({ ...p, preis: p.preis ?? preisVon(fakt, p.rang) })); } catch { /* dann die Eckdaten */ }
  }
  return fakt ? ausFakten(fakt) : [];
}

/* ------------------------------------------------------------------ Die Liste */

let merker: { bis: number; liste: FncsEreignis[] } | null = null;

export async function fncsEreignisse(): Promise<FncsEreignis[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;
  const [liste, archivListe] = await Promise.all([
    mapsVerzeichnis(),
    liesJson<ArchivEintrag[]>('cup-archiv.json', []).catch(() => [] as ArchivEintrag[]),
  ]);
  const archiv = new Map<string, ArchivEintrag>();
  for (const a of archivListe) if (a.windowId) archiv.set(a.windowId, a);

  let fehler = false;
  const raus: FncsEreignis[] = [];
  const gesehen = new Set<string>();

  // Alle Events gleichzeitig - jedes fragt Epic einzeln, nacheinander dauerte der erste Aufruf eine halbe Minute.
  const aus = await Promise.all(kandidaten(liste).map(async (k): Promise<FncsEreignis> => {
    const schluessel = schluesselVon(k.e.saison, k.art);
    const fakt = FNCS_FAKTEN[schluessel];
    let teams: number | null = null; let spitze: FncsSpitze[] = [];
    try { ({ teams, spitze } = await spitzeFuer(k, fakt, archiv)); } catch { fehler = true; }
    const kopf1 = k.art === 'gc' || k.art === 'invitational' ? (k.jahr ?? k.e.saisonKurz) : k.art === 'summit' ? 'MAJOR 1' : k.e.saisonKurz;
    const titel = k.art === 'gc' ? `Global Championship ${k.jahr}` : k.art === 'invitational' ? `Invitational ${k.jahr}`
      : k.art === 'summit' ? 'Major 1 Summit' : (k.e.saisonTitel ? `${k.e.saisonKurz} · ${k.e.saisonTitel}` : k.e.saisonKurz);
    return {
      key: schluessel, saison: k.e.saison, saisonKurz: k.e.saisonKurz, saisonTitel: k.e.saisonTitel ?? null,
      kopf1, kopf2: KOPF2[k.art], titel, datum: k.e.datum ?? (fakt ? faktDatum(fakt.datum) : null),
      lan: !!k.e.lan || !!fakt?.lan || k.art === 'summit' || k.art === 'gc', ort: fakt?.ort ?? null,
      region: REGION[k.art], preisgeld: fakt?.preisgeld ?? null, bild: k.e.bild,
      turnierId: k.e.turnierId, windowId: k.e.windowId, kartenRegion: k.e.region, teams, spitze,
    };
  }));
  for (const e of aus) { gesehen.add(e.key); raus.push(e); }

  // Endspiele, zu denen die Maps keine Karte fuehren (vor Chapter 2 Season 4): nur aus den Eckdaten.
  for (const [schluessel, f] of Object.entries(FNCS_FAKTEN)) {
    if (gesehen.has(schluessel)) continue;
    const [saison, art] = schluessel.split('|') as [string, Art];
    raus.push({
      key: schluessel, saison, saisonKurz: f.kopf1, saisonTitel: null,
      kopf1: f.kopf1, kopf2: f.kopf2, titel: f.titel, datum: faktDatum(f.datum), lan: !!f.lan, ort: f.ort ?? null,
      region: REGION[art], preisgeld: f.preisgeld, bild: '/cups/fncs-major.webp',
      turnierId: '', windowId: '', kartenRegion: 'EU', teams: f.teams, spitze: await ausFakten(f),
    });
  }

  raus.sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0));
  merker = { bis: Date.now() + (fehler ? 60_000 : 15 * 60_000), liste: raus };
  return raus;
}
