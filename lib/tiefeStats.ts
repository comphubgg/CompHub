import { promises as fsEcht } from 'node:fs';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';
import { DATEN_ORT } from '@/lib/datenOrt';
import { nachSpieltag, replayIndex, type IndexEintrag } from '@/lib/replayVoll';
import { zonenKarte, type Rahmen } from '@/lib/zonenKarte';
import { TIEF_FASSUNG, tiefBeitrag, tiefZusammen, waffenArt } from '@/lib/tiefeWerte.mjs';

/*
 * Deep Stats je Spieltag auf dem Server (Seite /deep-stats, app/api/deep-stats) - zwei Quellen:
 *
 *   1. clutch-tief/<w>.json   die Zusammenfassung aus dem Ablauf, der ohnehin jedes Match eines Cups voll liest (lib/vollMatch.mjs ->
 *                             scripts/clutch-zusammen.mjs). Gibt es fuer jeden Cup, der ab dem 26.11.2026 gelesen wurde - auch offene Runden mit
 *                             Hunderten Matches. Eine Datei von wenigen MB, hier nur gelesen.
 *   2. replay-voll/           die voll abgelegten Replays der Finals (scripts/replay-voll-holen.mjs, 1,6 MB je Match). Fuer Spieltage, die die erste
 *                             Quelle (noch) nicht hat: jedes Match einmal gelesen und sein Beitrag (lib/tiefeWerte, ein paar KB) gemerkt - im Speicher und
 *                             als Datei neben den Daten. Ein Match aendert sich nie, gelesen wird also jedes nur einmal. Das Lesen laeuft in Stuecken
 *                             (hoechstens FRIST je Abruf); die Seite fragt nach, bis alles da ist, und zeigt bis dahin, wie weit es ist.
 *
 * Es gilt die Quelle mit mehr Matches. Gerechnet wird beim Server nur das Zuschneiden fuer die Seite (Ranglisten, Waermebilder).
 */

const FRIST = 20_000;
const GLEICHZEITIG = 4;
const JE_ORDNER = path.join(DATEN_ORT, 'tief-je');
/** So viele Spieler gehen an die Seite (nach Schaden); wer gesucht wird, kommt dazu. */
const SPIELER_SEITE = 400;
/** Raster der Waermebilder (Felder je Seite). */
export const RASTER = 96;

type Beitrag = NonNullable<ReturnType<typeof tiefBeitrag>>;
/** Was tiefZusammen ausgibt (lib/tiefeWerte.mjs, dort beschrieben). */
interface Summe {
  v: number; zelle: number; matches: number; alteLeser?: number;
  waffen: Array<[string, number, number, number, number]>;
  spieler: Array<[string, string, number, number, number, number, number, number, Array<[number, number, number, number]>]>;
  teams: Array<[string[], number, number, number, number]>;
  orte: Record<string, { matches: number; l: Record<string, number>; t: Record<string, number> }>;
}
const zusammen = (b: Beitrag[]) => tiefZusammen(b) as unknown as Summe;
interface Kopf { windowId: string; eventId?: string | null; gesamt?: number | null; ohne?: number; gerechnet?: string; ids?: string[] }

/* ------------------------------------------------------------------ Quelle 1: aus dem Ablauf */

const pipelineMerker = new Map<string, { bis: number; wert: (Kopf & Summe) | null }>();
async function ausPipeline(w: string): Promise<(Kopf & Summe) | null> {
  const m = pipelineMerker.get(w);
  if (m && Date.now() < m.bis) return m.wert;
  const wert = await liesJson<(Kopf & Summe) | null>(`clutch-tief/${w}.json`, null).catch(() => null);
  pipelineMerker.set(w, { bis: Date.now() + 2 * 60_000, wert: wert?.spieler ? wert : null });
  while (pipelineMerker.size > 8) pipelineMerker.delete(pipelineMerker.keys().next().value as string);
  return wert?.spieler ? wert : null;
}

let listeMerker: { bis: number; wert: Record<string, { eventId?: string; gesamt?: number; matches?: number; ohne?: number; gerechnet?: string }> } | null = null;
async function pipelineListe() {
  if (listeMerker && Date.now() < listeMerker.bis) return listeMerker.wert;
  const wert = await liesJson<Record<string, { eventId?: string; gesamt?: number; matches?: number; ohne?: number; gerechnet?: string }>>('clutch-tief/_liste.json', {}).catch(() => ({}));
  listeMerker = { bis: Date.now() + 5 * 60_000, wert: wert ?? {} };
  return listeMerker.wert;
}

/* ------------------------------------------------------------------ Quelle 2: die voll abgelegten Replays */

const beitraege = new Map<string, Beitrag>();
const schluessel = (id: string, e: IndexEintrag) => `${id}|${e.ende ?? ''}|${e.laenge ?? ''}|${TIEF_FASSUNG}`;

async function beitragVon(id: string, e: IndexEintrag): Promise<Beitrag | null> {
  const k = schluessel(id, e);
  const da = beitraege.get(k);
  if (da) return da;
  const datei = path.join(JE_ORDNER, `${id}.json`);
  try {
    const b = JSON.parse(await fsEcht.readFile(datei, 'utf8')) as Beitrag & { k?: string };
    if (b?.k === k) { beitraege.set(k, b); return b; }
  } catch { /* noch nicht gemerkt */ }
  // Ein Lesefehler der Ablage ist meist ein Augenblick - bis zu dreimal, wie app/api/replay.
  let voll: Record<string, unknown> | null = null;
  for (let versuch = 0; versuch < 3 && !voll; versuch += 1) {
    if (versuch) await new Promise((r) => setTimeout(r, 400 * versuch));
    voll = await liesJson<Record<string, unknown> | null>(e.datei, null).catch(() => null);
  }
  if (!voll) return null;
  const b = tiefBeitrag(voll, id);
  voll = null;
  if (!b) return null;
  beitraege.set(k, b);
  try { await fsEcht.mkdir(JE_ORDNER, { recursive: true }); await fsEcht.writeFile(datei, JSON.stringify({ ...b, k })); } catch { /* ohne beschreibbaren Ordner bleibt es im Speicher */ }
  return b;
}

const aufbau = new Map<string, Promise<void>>();
/** Liest fehlende Matches eines Spieltags nach, hoechstens FRIST lang (laeuft ein Aufbau schon, wird auf ihn gewartet). */
async function aufbauen(w: string, matches: Array<[string, IndexEintrag]>): Promise<void> {
  const laeuft = aufbau.get(w);
  if (laeuft) return laeuft;
  const arbeit = (async () => {
    const ende = Date.now() + FRIST;
    const offen = matches.filter(([id, e]) => !beitraege.has(schluessel(id, e)));
    let naechster = 0;
    const arbeiter = async () => {
      while (naechster < offen.length && Date.now() < ende) {
        const [id, e] = offen[naechster++];
        try { await beitragVon(id, e); } catch { /* dieses Match beim naechsten Abruf wieder */ }
      }
    };
    await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));
  })().finally(() => aufbau.delete(w));
  aufbau.set(w, arbeit);
  return arbeit;
}

/* ------------------------------------------------------------------ Fuer die Seite zugeschnitten */

export interface TiefWaffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler?: number }
export interface TiefSpieler { epic: string; name: string; spiele: number; dmg: number; hits: number; krit: number; schuss: number | null; schussSpiele: number; waffen: TiefWaffe[] }
export interface TiefTeam { namen: string[]; spiele: number; kaempfe: number; eingegriffen: number; dazwischen: number }
export interface TiefKarte { bild: string; art: 'br' | 'reload'; rahmen: Rahmen; bildRahmen: Rahmen; matches: number; raster: number; landung: number[]; tode: number[]; nLandung: number; nTode: number }
export interface TiefeAnsicht {
  windowId: string; eventId: string | null; titel: string | null; region: string | null;
  quelle: 'pipeline' | 'replays' | null;
  /** Gelesene Matches; erwartet: so viele hat der Spieltag (soweit bekannt); ohne: Matches ohne lesbares Replay; teilweise: Matches, deren Replay unvollstaendig abgelegt ist. */
  matches: number; erwartet: number | null; ohne: number; teilweise: number;
  /** Ob noch gelesen wird (Quelle 2) - die Seite fragt dann nach. */
  liest: boolean; fertig: boolean; gerechnet: string | null;
  /** Matches, die ein aelterer Leser las (vor Fassung 18: ohne Schaden aus Explosionen und Bolzen, rund 2 % zu wenig). */
  alteLeser: number;
  summe: { dmg: number; hits: number; krit: number };
  waffen: TiefWaffe[];
  arten: Array<{ art: string; dmg: number; hits: number; krit: number }>;
  artBeste: Record<string, Array<{ epic: string; name: string; dmg: number; hits: number; krit: number; spiele: number }>>;
  spieler: TiefSpieler[]; spielerGesamt: number;
  teams: TiefTeam[]; teamGesamt: number;
  karten: TiefKarte[];
}

const leer = (w: string): TiefeAnsicht => ({
  windowId: w, eventId: null, titel: null, region: null, quelle: null, matches: 0, erwartet: null, ohne: 0, teilweise: 0, liest: false, fertig: false, alteLeser: 0,
  gerechnet: null, summe: { dmg: 0, hits: 0, krit: 0 }, waffen: [], arten: [], artBeste: {}, spieler: [], spielerGesamt: 0, teams: [], teamGesamt: 0, karten: [],
});

/** Kurzform eines Namens fuer die Suche (Kleinbuchstaben, ohne Zeichen). */
const kurz = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function zuschneiden(w: string, s: Summe, suche: string): Omit<TiefeAnsicht, 'windowId' | 'eventId' | 'titel' | 'region' | 'quelle' | 'matches' | 'erwartet' | 'ohne' | 'teilweise' | 'liest' | 'fertig' | 'gerechnet'> {
  const waffenRoh = s.waffen;
  const waffe = (nr: number): string => String(waffenRoh[nr]?.[0] ?? '?');
  const summe = { dmg: 0, hits: 0, krit: 0 };
  const arten = new Map<string, { art: string; dmg: number; hits: number; krit: number }>();
  for (const [roh, dmg, hits, krit] of waffenRoh) {
    summe.dmg += dmg; summe.hits += hits; summe.krit += krit;
    const art = waffenArt(String(roh));
    const a = arten.get(art) ?? { art, dmg: 0, hits: 0, krit: 0 };
    a.dmg += dmg; a.hits += hits; a.krit += krit; arten.set(art, a);
  }
  // Je Art die Besten (Summe ueber alle Waffen der Art).
  const jeArt = new Map<string, Array<{ epic: string; name: string; dmg: number; hits: number; krit: number; spiele: number }>>();
  const alle: TiefSpieler[] = s.spieler.map(([epic, name, spiele, dmg, hits, krit, schuss, schussSpiele, w2]) => {
    const waffen = w2.map(([nr, d, h, k]) => ({ roh: waffe(nr), art: waffenArt(waffe(nr)), dmg: d, hits: h, krit: k }));
    const proArt = new Map<string, { dmg: number; hits: number; krit: number }>();
    for (const x of waffen) { const a = proArt.get(x.art) ?? { dmg: 0, hits: 0, krit: 0 }; a.dmg += x.dmg; a.hits += x.hits; a.krit += x.krit; proArt.set(x.art, a); }
    for (const [art, a] of proArt) if (a.dmg > 0) (jeArt.get(art) ?? jeArt.set(art, []).get(art)!).push({ epic: String(epic), name: String(name), spiele: Number(spiele), ...a });
    // Schuesse nur, wenn das Inventar sie in jedem Spiel fuehrte - sonst waere die Quote zu hoch.
    return { epic: String(epic), name: String(name), spiele: Number(spiele), dmg: Number(dmg), hits: Number(hits), krit: Number(krit),
      schuss: Number(schussSpiele) === Number(spiele) && Number(schuss) > 0 ? Number(schuss) : null, schussSpiele: Number(schussSpiele), waffen };
  });
  const artBeste: TiefeAnsicht['artBeste'] = {};
  for (const [art, l] of jeArt) artBeste[art] = l.sort((a, b) => b.dmg - a.dmg).slice(0, 10);
  const q = kurz(suche);
  const spieler = alle.filter((x, i) => i < SPIELER_SEITE || (q && kurz(x.name).includes(q)));

  const namen = new Map(alle.map((x) => [x.epic, x.name]));
  const teams = s.teams
    .map(([m, spiele, kaempfe, eingegriffen, dazwischen]) => ({ namen: m.map((e) => namen.get(e) || e.slice(0, 8)), spiele, kaempfe, eingegriffen, dazwischen }))
    .filter((t) => t.kaempfe > 0)
    .sort((a, b) => b.eingegriffen - a.eingegriffen || a.dazwischen - b.dazwischen);

  // Waermebilder: je Kartenbild (Battle Royale der Saison oder eine Reload-Insel); Playlists ohne geeichtes Bild fallen weg.
  const karten = new Map<string, TiefKarte>();
  for (const [playlist, o] of Object.entries(s.orte ?? {})) {
    const k = zonenKarte(playlist || null, w);
    if (!k.bild) continue;
    const r = k.ausschnitt ?? k.rahmen;
    const m = karten.get(k.bild) ?? { bild: k.bild, art: k.art, rahmen: r, bildRahmen: k.rahmen, matches: 0, raster: RASTER, landung: new Array(RASTER * RASTER).fill(0), tode: new Array(RASTER * RASTER).fill(0), nLandung: 0, nTode: 0 };
    m.matches += o.matches;
    const zelle = s.zelle ?? 1000;
    const zaehle = (quelle: Record<string, number>, ziel: number[]) => {
      let n = 0;
      for (const [schl, zahl] of Object.entries(quelle)) {
        const [cx, cy] = schl.split(',').map(Number);
        const fx = Math.floor((((cx + 0.5) * zelle - r.x0) / r.spanne) * RASTER); const fy = Math.floor((((cy + 0.5) * zelle - r.y0) / r.spanne) * RASTER);
        if (fx < 0 || fy < 0 || fx >= RASTER || fy >= RASTER) continue;
        ziel[fy * RASTER + fx] += zahl; n += zahl;
      }
      return n;
    };
    m.nLandung += zaehle(o.l, m.landung); m.nTode += zaehle(o.t, m.tode);
    karten.set(k.bild, m);
  }

  return {
    summe, alteLeser: s.alteLeser ?? 0,
    waffen: waffenRoh.slice(0, 60).map(([roh, dmg, hits, krit, n]) => ({ roh: String(roh), art: waffenArt(String(roh)), dmg, hits, krit, spieler: n })),
    arten: [...arten.values()].sort((a, b) => b.dmg - a.dmg),
    artBeste, spieler, spielerGesamt: alle.length, teams: teams.slice(0, 150), teamGesamt: teams.length, karten: [...karten.values()],
  };
}

/** Die Ansicht eines Spieltags - aus der Quelle mit mehr Matches; bei den abgelegten Replays wird nachgelesen, was fehlt. */
export async function tiefeAnsicht(w: string, suche = ''): Promise<TiefeAnsicht> {
  const [pipe, index] = await Promise.all([ausPipeline(w), replayIndex().catch(() => ({} as Record<string, IndexEintrag>))]);
  const tag = nachSpieltag(Object.fromEntries(Object.entries(index).filter(([, e]) => e.windowId === w)))[0];
  const ausIndex: Array<[string, IndexEintrag]> = (tag?.matches ?? []).map((m) => [m.id, index[m.id]]);
  const basis = { eventId: tag?.eventId ?? pipe?.eventId ?? null, titel: tag?.titel ?? null, region: tag?.region ?? (/_([A-Z]+)$/.exec(w)?.[1] ?? null) };

  if (pipe && (pipe.matches >= ausIndex.length || !ausIndex.length)) {
    const erwartet = pipe.gesamt ?? null;
    return {
      ...leer(w), ...basis, windowId: w, quelle: 'pipeline', matches: pipe.matches, erwartet, ohne: pipe.ohne ?? 0, teilweise: 0, liest: false,
      fertig: erwartet === null || pipe.matches + (pipe.ohne ?? 0) >= erwartet, gerechnet: pipe.gerechnet ?? null, ...zuschneiden(w, pipe, suche),
    };
  }
  if (!ausIndex.length) return { ...leer(w), ...basis };

  // Quelle 2: was fehlt, nachlesen (hoechstens FRIST), dann aus dem, was da ist.
  const fehlt = () => ausIndex.filter(([id, e]) => !beitraege.has(schluessel(id, e)));
  if (fehlt().length) {
    // Gemerkte Beitraege von der Platte zuerst - das geht schnell und braucht keine Ablage.
    await Promise.all(fehlt().map(async ([id, e]) => {
      try {
        const b = JSON.parse(await fsEcht.readFile(path.join(JE_ORDNER, `${id}.json`), 'utf8')) as Beitrag & { k?: string };
        if (b?.k === schluessel(id, e)) beitraege.set(schluessel(id, e), b);
      } catch { /* nicht gemerkt */ }
    }));
    if (fehlt().length) await aufbauen(w, ausIndex);
  }
  const da = ausIndex.map(([id, e]) => beitraege.get(schluessel(id, e))).filter((b): b is Beitrag => !!b);
  const offen = ausIndex.length - da.length;
  const summe = zusammen(da);
  const teilweise = ausIndex.filter(([, e]) => e.unvollstaendig || e.vollstaendig === false).length;
  return {
    ...leer(w), ...basis, windowId: w, quelle: 'replays', matches: da.length, erwartet: ausIndex.length, ohne: 0, teilweise, liest: offen > 0,
    fertig: offen === 0, gerechnet: null, ...zuschneiden(w, summe, suche),
  };
}

/* ------------------------------------------------------------------ Die Auswahl */

export interface TiefTag { windowId: string; eventId: string; titel: string; region: string; beginn: string; matches: number; quelle: 'pipeline' | 'replays' }
export interface TiefCup { eventId: string; titel: string; season: string; beginn: string; tage: TiefTag[] }

/** Alle Spieltage mit Deep Stats - aus beiden Quellen, nach Cup gruppiert, neueste zuerst. */
export async function tiefeListe(): Promise<TiefCup[]> {
  const [liste, index] = await Promise.all([pipelineListe(), replayIndex().catch(() => ({} as Record<string, IndexEintrag>))]);
  const tage = new Map<string, TiefTag>();
  for (const t of nachSpieltag(index)) {
    tage.set(t.windowId, { windowId: t.windowId, eventId: t.eventId, titel: t.titel, region: t.region, beginn: String(t.matches[0]?.beginn ?? ''), matches: t.matches.length, quelle: 'replays' });
  }
  for (const [w, e] of Object.entries(liste)) {
    const alt = tages(tage, w);
    if (alt && alt.matches > (e.matches ?? 0)) continue;
    tage.set(w, { windowId: w, eventId: e.eventId ?? alt?.eventId ?? w, titel: alt?.titel ?? w, region: alt?.region ?? (/_([A-Z]+)$/.exec(w)?.[1] ?? ''),
      // Ohne Beginn aus dem Index: wann der Ablauf zuletzt rechnete - fuer die Reihenfolge reicht das.
      beginn: alt?.beginn || String(e.gerechnet ?? '').replace(/Z$/, ''), matches: e.matches ?? 0, quelle: 'pipeline' });
  }
  const cups = new Map<string, TiefCup>();
  for (const t of tage.values()) {
    const c = cups.get(t.eventId) ?? { eventId: t.eventId, titel: t.titel, season: /^(S\d+)_/i.exec(t.windowId)?.[1]?.toUpperCase() ?? '', beginn: '', tage: [] };
    if (t.beginn > c.beginn) c.beginn = t.beginn;
    c.tage.push(t);
    cups.set(t.eventId, c);
  }
  const raus = [...cups.values()].sort((a, b) => b.beginn.localeCompare(a.beginn));
  for (const c of raus) c.tage.sort((a, b) => a.beginn.localeCompare(b.beginn));
  return raus;
}
const tages = (m: Map<string, TiefTag>, w: string) => m.get(w) ?? null;
