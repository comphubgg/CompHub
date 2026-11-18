import { promises as fsp } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { speicher, liesJson } from '@/lib/ablage';
import { gecacht, holeTop, type CupFensterDetail } from '@/lib/epicCups';
import { alleFenster, bestimmeFeld, echteMarken } from '@/lib/prognoseFeld';
import { inselAusPlaylist, saisonVon } from '@/lib/inseln';
import { zonenKarte, type Rahmen } from '@/lib/zonenKarte';
import { anzeigenamen } from '@/lib/anzeigenamen';
import { liveOrt } from '@/lib/clutchLiveWahl.mjs';
import { releaseDatei } from '@/lib/liveAblage.mjs';
import { orteAus, rechtecke, type Kasten, type P, type Stelle, type Form, kastenUm, gleicherKasten, formUm } from '@/lib/dropFormen';
import { nobleKarte } from '@/lib/nobleKarte';

/*
 * Drop-Karten aus den eigenen Replays (Betreiber, 18.11.2026): "fuer jeden Cup, der eine einzelne Lobby ist" - Trios-Finale bis 33 Teams, Duos bis 50,
 * Solos bis 100 Spieler, Reload 40 - die Karte der Landepunkte automatisch. Nur fuer Admins, bis der Betreiber sie freigibt.
 * Stellen: ab Spiel 1 die echten Landungen; davor Noble Practice, wenn Noble eine Karte zum Fenster hat (nur Lage und Zuordnung), sonst die Prognose.
 * Die Formen sind immer unsere eigenen (lib/dropFormen).
 *
 * Der Landepunkt je Spieler und Match steht in den Rohdaten der vollen Replays (clutch-roh/<Fenster>.json, matches[].landung: { epicId: [x, y, t] }) -
 * die erste Positionsprobe am Boden nach dem Flug (lib/replayPositionen, CharacterSample, 10-s-Takt; Gegenprobe gegen den Netzwerkstrom mit
 * scripts/landung-pruefen.mjs). Rohdaten gibt es fuer jeden Spieltag mit hoechstens 250 Matches (lib/vollMatch GROSS_MAX), also fuer jede einzelne
 * Lobby und die meisten kleinen Cups; waehrend ein Spieltag laeuft, kommen die Matches aus den Teilen der Live-Spur auf dem Server.
 *
 *   vorher    die Aufstellung (Epics Bestenliste, sonst das Feld aus den Vorrunden wie die Prognoseseite - lib/prognoseFeld -, sonst die abgelegten
 *             Bestenlisten der Vorrunden) und je Team der "uebliche" Landeplatz aus seinen letzten Matches auf derselben Insel: die Punkte werden
 *             gehaeuft (Radius RADIUS), es gilt die groesste Haeufung;
 *   waehrend  dazu die Landungen der schon gespielten Spiele dieses Spieltags - wer hier schon gelandet ist, steht dort (groesste Haeufung seiner
 *   nachher   Landungen in diesem Spieltag), alle anderen weiter mit der Prognose.
 *
 * Teams, deren Stellen naeher als ZUSAMMEN beieinander liegen, teilen sich eine Form - die Karte faerbt sie rot (umkaempft).
 */

/** Wie viele Teams hoechstens in einer Lobby sind - die Grenzen des Betreibers. */
export function lobbyGroesse(playlist?: string | null): number | null {
  const insel = inselAusPlaylist(playlist);
  if (insel.art === 'reload') return 40;
  const n = teamGroesse(playlist);
  if (n === 1) return 100;
  if (n === 2) return 50;
  if (n === 3) return 33;
  if (n === 4) return 25;
  return null;
}

export function teamGroesse(playlist?: string | null): number | null {
  const p = (playlist ?? '').toLowerCase();
  if (/solo/.test(p)) return 1;
  if (/duo/.test(p)) return 2;
  if (/trio/.test(p)) return 3;
  if (/squad/.test(p)) return 4;
  return null;
}

/** Radius einer Haeufung (Weltmass, cm): 70 m - ein Ort wie ein Hof oder ein Haeuserblock. */
const RADIUS = 7_000;
/** Zwei Teams, deren Stellen naeher als 60 m liegen, teilen sich eine Form (umkaempft) - so nah, dass sie sich am Boden sofort treffen. */
const ZUSAMMEN = 6_000;
/** Halbe Seite des Quadrats um eine Stelle, die in keinem bekannten Ort liegt (lib/dropFormen). */
const FORM_RADIUS = 3_800;
/** So viele Matches je Team fliessen hoechstens in die Prognose. */
const MATCHES_JE_TEAM = 20;
/** So weit zurueck werden Spieltage derselben Insel gelesen. */
const VERLAUF_TAGE = 35;
const VERLAUF_FENSTER = 14;

type Fenster = CupFensterDetail & { cupId: string; cupTitel: string };
interface RohSpieler { epic?: string; name?: string; team?: number; bot?: boolean }
interface RohMatch { id: string; spieler?: RohSpieler[]; landung?: Record<string, number[]> }
interface Punkt { x: number; y: number }

export interface DropTeam {
  ids: string[];
  namen: string[];
  /** Index der Form, auf der das Team steht - null: keine Landung bekannt. */
  form: number | null;
  /** echt: aus Spielen dieses Spieltags; noble: Stelle laut Noble Practice; prognose: aus frueheren Matches auf derselben Insel. */
  art: 'echt' | 'noble' | 'prognose' | null;
  /** Wie viele Matches (Landungen) zugrunde liegen, und wie viele davon in der gewaehlten Haeufung. */
  matches: number;
  treffer: number;
  umkaempft: boolean;
}

export interface DropKarte {
  windowId: string; region: string; titel: string;
  einzel: true;
  phase: 'vorher' | 'live' | 'nachher';
  bild: string;
  formen: Array<{ punkte: Punkt[]; spieler: string[]; teams: number; gruppen: string[][] }>;
  teams: DropTeam[];
  /** Wie viele Spiele dieses Spieltags schon Landungen haben. */
  spiele: number;
  /** Woher die Aufstellung kommt. */
  aufstellung: 'replay' | 'bestenliste' | 'feld' | 'ablage' | 'keine';
  /** Die Spieltage, aus denen die Prognose stammt. */
  verlauf: string[];
  stand: number;
}

export type DropAntwort = DropKarte | { einzel: false; grund: string; windowId: string };

/* ------------------------------------------------------------ Rohdaten lesen */

async function rohVomRelease(w: string): Promise<RohMatch[]> {
  return gecacht(`drop-roh|${w}`, 15 * 60_000, async () => {
    // clutch-roh liegt nur am Release (nicht in der Ablage der Seite) - direkt von dort, wie die Live-Spur (lib/liveAblage releaseDatei).
    const b = await (releaseDatei(`clutch-roh/${w}.json`) as Promise<Buffer | null>).catch(() => null);
    if (!b) return [];
    try { return (JSON.parse(b.toString('utf8')).matches ?? []) as RohMatch[]; } catch { return []; }
  });
}

/** Die Matches der Live-Spur (Server): teil/<w>/<id>.json und archiv/<w>/<id>.json.gz - jedes mit roh[] samt Landungen (scripts/live-spur.mjs). */
async function rohLive(w: string): Promise<RohMatch[]> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(w)) return [];
  const ort = liveOrt();
  const raus: RohMatch[] = [];
  for (const [ordner, gz] of [[path.join(ort, 'teil', w), false], [path.join(ort, 'archiv', w), true]] as const) {
    let namen: string[] = [];
    try { namen = await fsp.readdir(ordner); } catch { continue; }
    for (const n of namen) {
      if (!n.endsWith(gz ? '.json.gz' : '.json')) continue;
      try {
        let b = await fsp.readFile(path.join(ordner, n));
        if (gz) b = zlib.gunzipSync(b);
        const teil = JSON.parse(b.toString('utf8')) as { roh?: RohMatch[] };
        for (const m of teil.roh ?? []) raus.push(m);
      } catch { /* ein halber Teil fehlt eben */ }
    }
  }
  return raus;
}

async function matchesDiesesTags(w: string): Promise<RohMatch[]> {
  const [rel, live] = await Promise.all([rohVomRelease(w), rohLive(w).catch(() => [])]);
  const da = new Map<string, RohMatch>();
  for (const m of [...rel, ...live]) if (m?.id && !da.has(m.id)) da.set(m.id, m);
  return [...da.values()];
}

/* ------------------------------------------------------------ Einzelne Lobby? */

/** Wie viele Teams die Marken eines Spieltags vergeben: je Vergabe-Fenster die Plaetze bis zur Schwelle, abzueglich der Plaetze davor mit einer anderen Marke. */
export function feldGroesse(f: Fenster, alle: Fenster[]): number {
  const marken = echteMarken(f.tokens);
  if (!marken.length) return 0;
  let n = 0;
  for (const g of alle) {
    if (g.region !== f.region && !g.windowId.endsWith(`_${f.region}`)) continue;
    let vorher = 0;
    for (const m of [...(g.marken ?? [])].sort((a, b) => a.bis - b.bis)) {
      if (marken.includes(m.token)) n += Math.max(0, m.bis - vorher);
      vorher = Math.max(vorher, m.bis);
    }
  }
  return n;
}

function einzelGrund(f: Fenster, alle: Fenster[], gespielt: RohMatch[]): string | null {
  const grenze = lobbyGroesse(f.playlist);
  if (!grenze) return 'unbekannte Lobbygroesse';
  // Gespielt: eine Lobby heisst ein Match je Spiel - nie mehr Matches als Spiele.
  if (gespielt.length && f.matchCap) return gespielt.length <= f.matchCap ? null : `${gespielt.length} Matches bei ${f.matchCap} Spielen`;
  const feld = feldGroesse(f, alle);
  if (!feld) return 'Feldgroesse unbekannt';
  return feld <= grenze ? null : `Feld ${feld} > ${grenze}`;
}

/* ------------------------------------------------------------ Aufstellung */

interface Aufstellung { teams: Array<{ ids: string[]; namen: string[] }>; quelle: DropKarte['aufstellung'] }

function teamsAusReplays(matches: RohMatch[]): Array<{ ids: string[]; namen: string[] }> {
  // Wer in irgendeinem Match im selben Team spielte, gehoert zusammen (Union-Find ueber die Konten).
  const eltern = new Map<string, string>();
  const finde = (a: string): string => { let x = a; while (eltern.get(x) !== x) x = eltern.get(x) ?? x; eltern.set(a, x); return x; };
  const namen = new Map<string, string>();
  for (const m of matches) {
    const jeTeam = new Map<number, string[]>();
    for (const s of m.spieler ?? []) {
      if (s.bot || !s.epic) continue;
      const e = s.epic.toLowerCase();
      if (!eltern.has(e)) eltern.set(e, e);
      if (s.name) namen.set(e, s.name);
      const t = s.team ?? -1;
      (jeTeam.get(t) ?? jeTeam.set(t, []).get(t)!).push(e);
    }
    for (const [t, ids] of jeTeam) if (t >= 0) for (const e of ids.slice(1)) eltern.set(finde(e), finde(ids[0]));
  }
  const gruppen = new Map<string, string[]>();
  for (const e of eltern.keys()) { const r = finde(e); (gruppen.get(r) ?? gruppen.set(r, []).get(r)!).push(e); }
  return [...gruppen.values()].map((ids) => ({ ids: ids.sort(), namen: ids.map((e) => namen.get(e) ?? '') }));
}

/** Die abgelegten Bestenlisten der Vorrunden (epic-spieltage/<Saison>/<Fenster>.json) - ohne Epic, fuer die Plaetze der Marken. */
async function feldAusAblage(f: Fenster, alle: Fenster[]): Promise<Array<{ ids: string[]; namen: string[] }>> {
  const marken = echteMarken(f.tokens);
  const raus: Array<{ ids: string[]; namen: string[] }> = [];
  const gesehen = new Set<string>();
  for (const g of alle) {
    let vorher = 0;
    const bereiche: Array<[number, number]> = [];
    for (const m of [...(g.marken ?? [])].sort((a, b) => a.bis - b.bis)) {
      if (marken.includes(m.token)) bereiche.push([vorher, m.bis]);
      vorher = Math.max(vorher, m.bis);
    }
    if (!bereiche.length) continue;
    const s = saisonVon(g.windowId);
    const b = await speicher.lies(`epic-spieltage/S${s}/${g.windowId}.json`).catch(() => null);
    if (!b) continue;
    let d: { teams?: Array<{ platz: number; spieler: string[] }> } = {};
    try { d = JSON.parse(b.toString('utf8')); } catch { continue; }
    for (const t of d.teams ?? []) {
      if (!bereiche.some(([a, z]) => t.platz > a && t.platz <= z)) continue;
      const ids = (t.spieler ?? []).map((x) => String(x).toLowerCase()).sort();
      const k = ids.join('|');
      if (!ids.length || gesehen.has(k)) continue;
      gesehen.add(k);
      raus.push({ ids, namen: ids.map(() => '') });
    }
  }
  return raus;
}

async function aufstellung(f: Fenster, alle: Fenster[], gespielt: RohMatch[]): Promise<Aufstellung> {
  if (gespielt.length) return { teams: teamsAusReplays(gespielt), quelle: 'replay' };
  const mitFrist = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, nein) => setTimeout(() => nein(new Error('Frist')), ms))]);
  try {
    const lb = await mitFrist(holeTop(f.eventId, f.windowId, 120), 15_000);
    const teams = (lb.entries ?? []).map((e) => ({ ids: e.players.map((p) => String(p.id ?? '').toLowerCase()).filter(Boolean), namen: e.players.map((p) => p.name ?? '') }))
      .filter((t) => t.ids.length);
    if (teams.length) return { teams, quelle: 'bestenliste' };
  } catch { /* weiter mit dem Feld */ }
  try {
    const feld = await mitFrist(gecacht(`prognose-feld|${f.eventId}|${f.windowId}|${f.region}`, 120_000,
      () => bestimmeFeld({ eventId: f.eventId, windowId: f.windowId, region: f.region })), 30_000);
    const teams = feld.teams.map((t) => ({ ids: t.ids.map((x) => x.toLowerCase()).filter(Boolean), namen: t.namen })).filter((t) => t.ids.length);
    if (teams.length) return { teams, quelle: 'feld' };
  } catch { /* weiter mit der Ablage */ }
  const abgelegt = await feldAusAblage(f, alle).catch(() => []);
  return abgelegt.length ? { teams: abgelegt, quelle: 'ablage' } : { teams: [], quelle: 'keine' };
}

/* ------------------------------------------------------------ Haeufen */

/** Je Match die Mitte der gelandeten Teammitglieder (ein Duo, das zusammen landet, zaehlt einmal). */
function teamPunkte(matches: RohMatch[], ids: string[]): Punkt[] {
  const raus: Punkt[] = [];
  for (const m of matches) {
    const p = ids.map((e) => m.landung?.[e]).filter((l): l is number[] => Array.isArray(l) && l.length >= 2);
    if (!p.length) continue;
    raus.push({ x: p.reduce((a, l) => a + l[0], 0) / p.length, y: p.reduce((a, l) => a + l[1], 0) / p.length });
  }
  return raus;
}

/** Die groesste Haeufung: der Punkt mit den meisten Nachbarn im RADIUS (bei Gleichstand der fruehere in der Liste = der neuere), deren Mitte. */
export function haeufung(punkte: Punkt[]): { mitte: Punkt; treffer: number } | null {
  if (!punkte.length) return null;
  let best: Punkt[] = [];
  for (const p of punkte) {
    const n = punkte.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= RADIUS);
    if (n.length > best.length) best = n;
  }
  return { mitte: { x: best.reduce((a, q) => a + q.x, 0) / best.length, y: best.reduce((a, q) => a + q.y, 0) / best.length }, treffer: best.length };
}

/** Weltpunkt -> Prozent des Kartenbildes. */
const inProzent = (q: Punkt, r: Rahmen): P => ({ x: ((q.x - r.x0) / r.spanne) * 100, y: ((q.y - r.y0) / r.spanne) * 100 });

/**
 * Die Orte der Insel (lib/dropFormen orteAus): die Formen aller Turnierkarten mit demselben Kartenbild - nur fuer Groesse und Lage der Rechtecke,
 * keine Form wird uebernommen. Ohne Turnierkarten: keine Orte, jede Stelle bekommt ihr Quadrat.
 */
async function orteDerInsel(bild: string): Promise<Kasten[]> {
  const id = (() => { try { return new URL(bild, 'http://x').searchParams.get('id'); } catch { return null; } })();
  if (!id) return [];
  const karten = await liesJson<Array<{ bildId?: string; spots?: Array<{ punkte?: P[] }> }>>('turnier-karten.json', []).catch(() => []);
  return orteAus(karten.filter((k) => k.bildId === id).flatMap((k) => (k.spots ?? []).map((sp) => sp.punkte ?? [])));
}

/**
 * Aus den Stellen der Teams (Weltmass, null: keine Landung) die Formen der Karte: Stellen naeher als ZUSAMMEN bilden eine Gruppe (einfache
 * Verkettung), je Gruppe ein Rechteck in der Groesse ihres Ortes (lib/dropFormen); Gruppen im selben Ort teilen sich eines.
 * Ohne Ablage und Netz - so laesst es sich auch allein pruefen (Kartenprobe).
 */
export function formenAusStellen(stellen: Array<Stelle | null>, namenVon: (i: number) => string[], rahmen: Rahmen, orte: Kasten[]):
  { formen: DropKarte['formen']; formVon: Map<number, number> } {
  const zusammen = (ZUSAMMEN / rahmen.spanne) * 100;
  const mit = stellen.map((m, i) => ({ m, i })).filter((x): x is { m: Stelle; i: number } => x.m !== null);
  const gruppeVon = new Map<number, number>();
  const gruppen: number[][] = [];
  for (const a of mit) {
    // Stellen von Noble (mit Kasten) gehoeren nur zusammen, wenn Noble sie auf dieselbe Stelle setzt - Nobles Zuordnung bleibt.
    const nahDran = (b: Stelle) => (a.m.ort && b.ort ? gleicherKasten(a.m.ort, b.ort) : Math.hypot(b.p.x - a.m.p.x, b.p.y - a.m.p.y) <= zusammen);
    const nah = [...new Set(mit.filter((b) => b.i !== a.i && gruppeVon.has(b.i) && nahDran(b.m))
      .map((b) => gruppeVon.get(b.i)!))];
    if (!nah.length) { gruppeVon.set(a.i, gruppen.length); gruppen.push([a.i]); continue; }
    const ziel = nah[0];
    gruppen[ziel].push(a.i); gruppeVon.set(a.i, ziel);
    for (const n of nah.slice(1)) { for (const j of gruppen[n]) { gruppen[ziel].push(j); gruppeVon.set(j, ziel); } gruppen[n] = []; }
  }
  const voll = gruppen.filter((x) => x.length);
  const halb = (FORM_RADIUS / rahmen.spanne) * 100;
  const formen: DropKarte['formen'] = [];
  const formVon = new Map<number, number>();
  for (const r of rechtecke(voll.map((g) => g.map((i) => stellen[i]!)), orte, halb)) {
    const g = r.gruppen.flatMap((gi) => voll[gi]);
    const gruppenNamen = g.map((i) => namenVon(i));
    for (const i of g) formVon.set(i, formen.length);
    formen.push({ punkte: r.punkte, spieler: gruppenNamen.flat(), teams: g.length, gruppen: gruppenNamen });
  }
  return { formen, formVon };
}

/**
 * Je Team seine Stelle: echte Landungen dieses Spieltags, sonst Noble, sonst die Prognose aus jeKonto (Matches je Konto auf derselben Insel).
 * Teams, die nur Noble kennt, kommen dazu. Ohne Ablage und Netz (Kartenprobe).
 */
export function stellenFuer(feld: Array<{ ids: string[]; namen: string[] }>, gespielt: RohMatch[], noble: NobleStelle[], jeKonto: Map<string, RohMatch[]>, rahmen: Rahmen) {
  const vonNoble = new Map<string, NobleStelle>();
  for (const n of noble) for (const id of n.ids) vonNoble.set(id, n);
  const imFeld = new Set(feld.flatMap((t) => t.ids));
  const alleTeams = [...feld, ...noble.filter((n) => !n.ids.some((id) => imFeld.has(id))).map((n) => ({ ids: n.ids, namen: n.namen }))];
  return alleTeams.map((t) => {
    const echt = teamPunkte(gespielt, t.ids);
    if (echt.length) {
      const h = haeufung(echt);
      return { t, art: 'echt' as const, stelle: h ? { p: inProzent(h.mitte, rahmen) } : null, matches: echt.length, treffer: h?.treffer ?? 0 };
    }
    const n = t.ids.map((id) => vonNoble.get(id)).find(Boolean);
    if (n) return { t, art: 'noble' as const, stelle: { p: n.mitte, ort: n.kasten, form: n.form }, matches: 0, treffer: 0 };
    const ms = [...new Set(t.ids.flatMap((e) => jeKonto.get(e) ?? []))].slice(0, MATCHES_JE_TEAM);
    const p = teamPunkte(ms, t.ids);
    const h = haeufung(p);
    return { t, art: h ? 'prognose' as const : null, stelle: h ? { p: inProzent(h.mitte, rahmen) } : null, matches: p.length, treffer: h?.treffer ?? 0 };
  });
}

/** Eine Stelle laut Noble Practice: wer dort steht, Mitte und Kasten (Prozent, auf unser Raster gerundet) - Nobles Polygon selbst bleibt draussen. */
export interface NobleStelle { ids: string[]; namen: string[]; mitte: P; kasten: Kasten; form: Form }

/** Die Stellen von Noble fuer dieses Fenster - leer, wenn Noble keine Karte dazu hat oder nicht antwortet (dann gilt die eigene Prognose). */
export async function nobleStellen(windowId: string): Promise<NobleStelle[]> {
  try {
    const k = await Promise.race([
      nobleKarte(windowId),
      new Promise<null>((fertig) => { setTimeout(() => fertig(null), 20_000); }),
    ]);
    if (!k) return [];
    return k.formen.filter((fo) => fo.teams.length && fo.punkte.length >= 3).flatMap((fo) => {
      // Nur Lage und Ausdehnung: um Nobles Flaeche eine eigene Form (Rechteck oder ein sauberes L, lib/dropFormen formUm).
      const form = formUm(fo.punkte);
      const kasten = kastenUm(fo.punkte);
      const mitte = { x: (form.kasten.x0 + form.kasten.x1) / 2, y: (form.kasten.y0 + form.kasten.y1) / 2 };
      return fo.teams.map((t) => ({ ids: t.ids.map((id) => id.toLowerCase()), namen: t.namen, mitte, kasten, form }));
    });
  } catch { return []; }
}

/* ------------------------------------------------------------ Verlauf */

/** Die frueheren Spieltage auf derselben Insel, mit derselben Teamgroesse, in derselben Region - die neuesten zuerst. */
function verlaufsFenster(f: Fenster, alle: Fenster[]): Fenster[] {
  const insel = inselAusPlaylist(f.playlist);
  const schluessel = insel.art === 'reload' ? insel.schluessel : insel.art === 'br' ? `BR${saisonVon(f.windowId) ?? ''}` : null;
  if (!schluessel) return [];
  const groesse = teamGroesse(f.playlist);
  const ab = Math.min(Date.now(), f.begin) - VERLAUF_TAGE * 86_400_000;
  const gesehen = new Set<string>();
  return alle
    .filter((g) => {
      if (g.windowId === f.windowId || g.region !== f.region || g.status !== 'vorbei' || g.begin < ab || g.begin >= Math.max(f.begin, 0) + 1) return false;
      const gi = inselAusPlaylist(g.playlist);
      const gs = gi.art === 'reload' ? gi.schluessel : gi.art === 'br' ? `BR${saisonVon(g.windowId) ?? ''}` : null;
      return gs === schluessel && teamGroesse(g.playlist) === groesse;
    })
    .sort((a, b) => b.begin - a.begin)
    .filter((g) => (gesehen.has(g.windowId) ? false : (gesehen.add(g.windowId), true)))
    .slice(0, VERLAUF_FENSTER);
}

/* ------------------------------------------------------------ Bauen */

async function namenJe(): Promise<{ anzeige: Map<string, string>; profile: Record<string, { anzeige?: string }> }> {
  const [anzeige, profile] = await Promise.all([
    anzeigenamen().catch(() => new Map<string, string>()),
    liesJson<Record<string, { anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({})),
  ]);
  return { anzeige, profile };
}

export async function baueDropKarte(windowId: string, region?: string | null): Promise<DropAntwort> {
  const alle = (await alleFenster()) as Fenster[];
  const f = alle.find((x) => x.windowId === windowId && (!region || x.region === region)) ?? alle.find((x) => x.windowId === windowId);
  if (!f) return { einzel: false, grund: 'Spieltag unbekannt', windowId };
  const zk = zonenKarte(f.playlist, f.windowId);
  if (!zk.bild) return { einzel: false, grund: 'Insel ohne geeichte Karte', windowId };
  const jetzt = Date.now();
  const gespielt = f.begin <= jetzt ? (await matchesDiesesTags(f.windowId)).filter((m) => m.landung && Object.keys(m.landung).length) : [];
  const grund = einzelGrund(f, alle, gespielt);
  if (grund) return { einzel: false, grund, windowId };

  const [auf, namen] = await Promise.all([aufstellung(f, alle, gespielt), namenJe()]);

  // Verlauf: je Konto die Matches (neueste Spieltage zuerst), nur fuer die Konten der Aufstellung.
  const konten = new Set(auf.teams.flatMap((t) => t.ids));
  const verlaufGelesen: string[] = [];
  const jeKonto = new Map<string, RohMatch[]>();
  const rohNamen = new Map<string, string>();
  for (const g of verlaufsFenster(f, alle)) {
    const ms = await rohVomRelease(g.windowId);
    if (!ms.length) continue;
    let genutzt = false;
    for (const m of ms) {
      for (const s of m.spieler ?? []) if (s.epic && s.name && konten.has(s.epic.toLowerCase())) rohNamen.set(s.epic.toLowerCase(), s.name);
      for (const e of Object.keys(m.landung ?? {})) {
        if (!konten.has(e)) continue;
        const l = jeKonto.get(e) ?? jeKonto.set(e, []).get(e)!;
        if (l.length < MATCHES_JE_TEAM * 2 && !l.includes(m)) { l.push(m); genutzt = true; }
      }
    }
    if (genutzt) verlaufGelesen.push(g.windowId);
  }
  for (const m of gespielt) for (const s of m.spieler ?? []) if (s.epic && s.name) rohNamen.set(s.epic.toLowerCase(), s.name);

  const anzeigeVon = (id: string, roh: string) =>
    namen.anzeige.get(id) || namen.profile[id]?.anzeige || roh || rohNamen.get(id) || id.slice(0, 8);

  /*
   * Je Team die Stelle (Betreiber, 18.11.2026): wer in diesem Spieltag schon gelandet ist, steht dort (echte Landungen ab Spiel 1). Sonst gilt Noble
   * Practice, wenn Noble fuer dieses Fenster eine Karte hat - von Noble nur Lage, Ausdehnung und wer dort steht, die Form ist unsere (lib/dropFormen).
   * Ohne Noble die Prognose aus den letzten Matches.
   */
  const noble = await nobleStellen(f.windowId);
  const stellen = stellenFuer(auf.teams, gespielt, noble, jeKonto, zk.rahmen);

  const orte = await orteDerInsel(zk.bild);
  const { formen, formVon } = formenAusStellen(stellen.map((st) => st.stelle), (i) => stellen[i].t.ids.map((id, k) => anzeigeVon(id, stellen[i].t.namen[k] ?? '')), zk.rahmen, orte);
  const teams: DropTeam[] = stellen.map((s, i) => ({
    ids: s.t.ids,
    namen: s.t.ids.map((id, k) => anzeigeVon(id, s.t.namen[k] ?? '')),
    form: formVon.get(i) ?? null,
    art: s.art,
    matches: s.matches,
    treffer: s.treffer,
    umkaempft: formVon.has(i) ? formen[formVon.get(i)!].teams > 1 : false,
  }));
  const phase: DropKarte['phase'] = jetzt < f.begin ? 'vorher' : (jetzt <= (f.end ?? f.begin + 4 * 3_600_000) || f.status === 'live') ? 'live' : 'nachher';
  return {
    windowId: f.windowId, region: f.region, titel: f.cupTitel,
    einzel: true, phase, bild: zk.bild, formen, teams,
    spiele: gespielt.length, aufstellung: auf.quelle, verlauf: verlaufGelesen, stand: jetzt,
  };
}

/** Mit Vorrat: waehrend des Spieltags eine Minute, sonst zehn. */
export async function dropKarte(windowId: string, region?: string | null): Promise<DropAntwort> {
  return gecacht(`drop-karte|${windowId}|${region ?? ''}`, 60_000, async () => {
    const d = await baueDropKarte(windowId, region);
    return d;
  });
}
