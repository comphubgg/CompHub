import { useEffect, useState } from 'react';
import { istEpicCode, SPIELMODI, type Spielmodus } from './modi';

/*
 * Epics offizielle Fortnite Data API (frei, oeffentlich, ohne Schluessel) - https://api.fortnite.com/ecosystem/v1
 *   GET /islands?size=&after=                     Inseln seitenweise (code, creatorCode, title, category, createdIn, tags)
 *   GET /islands/{code}                           eine Insel
 *   GET /islands/{code}/metrics/{interval}        minute | hour | day, optional from / to (ISO) - peakCCU, uniquePlayers, plays,
 *                                                 minutesPlayed, averageMinutesPerPlayer, favorites, recommendations, retention (d1/d7)
 * Der Browser fragt ueber den Vite-Proxy /epic-daten (vite.config.ts), damit es keine CORS-Probleme gibt.
 * Die Antworten werden tolerant gelesen (Feldnamen und Formen variieren je nach Version) und kurz im sessionStorage gemerkt.
 * Gleichzeitig laufen hoechstens 6 Abfragen (Warteschlange), damit Epic uns nicht drosselt.
 */
export const EPIC = '/epic-daten/ecosystem/v1';

/* ---------------------------------------------- Erreichbarkeit (fuer den kleinen Hinweis auf den Seiten) */
type Erreichbar = 'unbekannt' | 'ok' | 'aus';
let erreichbar: Erreichbar = 'unbekannt';
const erreichbarHoerer = new Set<() => void>();
function setErreichbar(e: Erreichbar) { if (erreichbar !== e && !(erreichbar === 'ok' && e === 'aus')) { erreichbar = e; erreichbarHoerer.forEach((h) => h()); } }
export function useEpicErreichbar(): Erreichbar {
  const [, neu] = useState(0);
  useEffect(() => { const h = () => neu((n) => n + 1); erreichbarHoerer.add(h); return () => { erreichbarHoerer.delete(h); }; }, []);
  return erreichbar;
}

/* ---------------------------------------------- Warteschlange + Cache */
export class EpicFehler extends Error { constructor(public status: number, text: string) { super(text); } }
const MAX = 6;
let laufend = 0;
const warten: Array<() => void> = [];
function platz(): Promise<void> {
  if (laufend < MAX) { laufend += 1; return Promise.resolve(); }
  return new Promise((r) => warten.push(() => { laufend += 1; r(); }));
}
function frei() { laufend -= 1; warten.shift()?.(); }

const cache = new Map<string, Promise<unknown>>();
const ss = { lesen(k: string, ttl: number) { try { const r = sessionStorage.getItem(k); if (!r) return null; const x = JSON.parse(r); return Date.now() - x.t < ttl ? x.j : null; } catch { return null; } },
  schreiben(k: string, j: unknown) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j })); } catch { /* voll */ } } };

/** Rohabfrage mit Cache (ttl in ms). 4xx -> EpicFehler mit Status; Netz/Proxy-Fehler -> EpicFehler 0. */
export function epicHolen<T = unknown>(pfad: string, ttl = 5 * 60_000): Promise<T> {
  const url = `${EPIC}${pfad}`;
  if (cache.has(url)) return cache.get(url) as Promise<T>;
  const gemerkt = ss.lesen(`epic:${url}`, ttl);
  if (gemerkt) { setErreichbar('ok'); const p = Promise.resolve(gemerkt as T); cache.set(url, p); return p; }
  const p = (async () => {
    await platz();
    try {
      let r: Response;
      try { r = await fetch(url, { headers: { Accept: 'application/json' } }); } catch { setErreichbar('aus'); throw new EpicFehler(0, 'Epic API not reachable'); }
      const typ = r.headers.get('content-type') ?? '';
      if (r.status >= 500 || (r.ok && !typ.includes('json'))) { setErreichbar('aus'); throw new EpicFehler(r.status || 0, `Epic API ${r.status}`); }
      setErreichbar('ok');
      if (!r.ok) throw new EpicFehler(r.status, `Epic API ${r.status}`);
      const j = await r.json();
      ss.schreiben(`epic:${url}`, j);
      return j as T;
    } finally { frei(); }
  })();
  p.catch(() => setTimeout(() => cache.delete(url), 30_000));
  cache.set(url, p);
  return p;
}

/* ---------------------------------------------- Inseln */
export interface Insel { code: string; titel: string; creator: string; kategorie?: string; erstelltIn?: string; tags: string[]; bild?: string; text?: string; epic: boolean }
/* eslint-disable @typescript-eslint/no-explicit-any */
export function inselAus(x: any): Insel | null {
  if (!x || typeof x !== 'object') return null;
  const code = String(x.code ?? x.islandCode ?? x.mnemonic ?? x.linkCode ?? '').trim();
  if (!code) return null;
  const creator = String(x.creatorCode ?? x.creator ?? x.creatorName ?? x.creator_code ?? x.accountName ?? (istEpicCode(code) ? 'epic' : '')).trim();
  const tags = (x.tags ?? x.descriptionTags ?? x.categories ?? []) as unknown[];
  const bild = x.imageUrl ?? x.image ?? x.thumbnail ?? x.thumbnailUrl ?? x.images?.[0]?.url ?? x.images?.thumbnail ?? x.media?.image ?? undefined;
  return {
    code, titel: String(x.title ?? x.displayName ?? x.name ?? code).trim(), creator, kategorie: x.category ?? x.type ?? undefined, erstelltIn: x.createdIn ?? x.engine ?? undefined,
    tags: tags.map((t) => String(typeof t === 'object' && t ? (t as any).name ?? (t as any).tag ?? '' : t)).filter(Boolean), bild: typeof bild === 'string' ? bild : undefined,
    text: x.introduction ?? x.description ?? undefined, epic: istEpicCode(code) || creator.toLowerCase() === 'epic' || creator.toLowerCase() === 'epic games',
  };
}
function weiterAus(j: any): string | undefined {
  const c = j?.meta?.page?.nextCursor ?? j?.meta?.nextCursor ?? j?.nextCursor ?? j?.page?.nextCursor ?? j?.cursor?.next;
  if (c) return String(c);
  const l = j?.links?.next ?? j?.next;
  if (typeof l === 'string') { const m = /[?&]after=([^&]+)/.exec(l); if (m) return decodeURIComponent(m[1]); }
  return undefined;
}
export async function inselnSeite(after?: string, size = 100): Promise<{ inseln: Insel[]; weiter?: string }> {
  const j = await epicHolen<any>(`/islands?size=${size}${after ? `&after=${encodeURIComponent(after)}` : ''}`, 30 * 60_000);
  const liste = (Array.isArray(j) ? j : j?.data ?? j?.islands ?? j?.results ?? []) as unknown[];
  return { inseln: liste.map(inselAus).filter(Boolean) as Insel[], weiter: weiterAus(j) };
}
export async function inselHolen(code: string): Promise<Insel | null> {
  const j = await epicHolen<any>(`/islands/${encodeURIComponent(code)}`, 30 * 60_000);
  return inselAus(j?.data ?? j);
}

/* ---------------------------------------------- Metriken */
export interface Punkt { t: number; v: number }
export interface Metriken {
  peakCCU: Punkt[]; uniquePlayers: Punkt[]; plays: Punkt[]; minutesPlayed: Punkt[]; averageMinutesPerPlayer: Punkt[]; favorites: Punkt[]; recommendations: Punkt[];
  retention: Array<{ t: number; d1?: number; d7?: number }>;
}
export const METRIK_NAMEN: Record<Exclude<keyof Metriken, 'retention'>, { titel: string; text: string }> = {
  peakCCU: { titel: 'Peak players', text: 'Most players at the same time' }, uniquePlayers: { titel: 'Unique players', text: 'Different players in the interval' },
  plays: { titel: 'Plays', text: 'Matches / sessions started' }, minutesPlayed: { titel: 'Minutes played', text: 'Total playtime' },
  averageMinutesPerPlayer: { titel: 'Avg. minutes per player', text: 'Playtime per player' }, favorites: { titel: 'Favorites', text: 'Times added to favorites' },
  recommendations: { titel: 'Recommendations', text: 'Times recommended' },
};
const ALIAS: Record<keyof Metriken, string[]> = {
  peakCCU: ['peakCCU', 'peakCcu', 'peak_ccu', 'peak-ccu', 'ccu'], uniquePlayers: ['uniquePlayers', 'unique_players', 'unique-players'], plays: ['plays'],
  minutesPlayed: ['minutesPlayed', 'minutes_played', 'minutes-played'], averageMinutesPerPlayer: ['averageMinutesPerPlayer', 'average_minutes_per_player', 'averageMinutes'],
  favorites: ['favorites'], recommendations: ['recommendations'], retention: ['retention'],
};
const zeitVon = (x: any) => Date.parse(x?.timestamp ?? x?.time ?? x?.date ?? x?.t ?? '');
function reihe(roh: any): Punkt[] {
  const l = Array.isArray(roh) ? roh : Array.isArray(roh?.intervals) ? roh.intervals : Array.isArray(roh?.data) ? roh.data : Array.isArray(roh?.values) ? roh.values : [];
  return (l as any[]).map((x) => (Array.isArray(x) ? { t: Date.parse(x[0]), v: Number(x[1]) } : { t: zeitVon(x), v: x?.value === null || x?.value === undefined ? NaN : Number(x.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
}
export function metrikenAus(j: any): Metriken {
  const q = j?.data ?? j ?? {};
  const feld = (k: keyof Metriken) => { for (const a of ALIAS[k]) if (q[a] !== undefined) return q[a]; return undefined; };
  const ret = (Array.isArray(feld('retention')) ? feld('retention') : []) as any[];
  return {
    peakCCU: reihe(feld('peakCCU')), uniquePlayers: reihe(feld('uniquePlayers')), plays: reihe(feld('plays')), minutesPlayed: reihe(feld('minutesPlayed')),
    averageMinutesPerPlayer: reihe(feld('averageMinutesPerPlayer')), favorites: reihe(feld('favorites')), recommendations: reihe(feld('recommendations')),
    retention: ret.map((x) => ({ t: zeitVon(x), d1: x?.d1 ?? x?.day1 ?? undefined, d7: x?.d7 ?? x?.day7 ?? undefined })).filter((x) => Number.isFinite(x.t)),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
export const leer = (m: Metriken | null | undefined) => !m || (!m.peakCCU.length && !m.uniquePlayers.length && !m.plays.length);

export type Intervall = 'minute' | 'hour' | 'day';
export type Zeitraum = '1H' | '1D' | '1W';
/** Welche Abfragen fuer einen Zeitraum probiert werden (erste, die Daten liefert, gewinnt). */
const VERSUCHE: Record<Zeitraum, Array<{ iv: Intervall; ms?: number }>> = {
  '1H': [{ iv: 'minute', ms: 36e5 }, { iv: 'minute' }, { iv: 'hour', ms: 3 * 36e5 }],
  '1D': [{ iv: 'hour', ms: 864e5 }, { iv: 'hour' }],
  '1W': [{ iv: 'hour', ms: 7 * 864e5 }, { iv: 'day', ms: 7 * 864e5 }, { iv: 'day' }],
};
const runden = (t: number, schritt: number) => Math.floor(t / schritt) * schritt;
const TTL: Record<Intervall, number> = { minute: 4 * 60_000, hour: 15 * 60_000, day: 60 * 60_000 };

/** Metriken einer Insel fuer einen Intervall (mit optionalem Zeitfenster). Kleinschreibung als zweiter Versuch, falls Epic sie so fuehrt. */
export async function metriken(code: string, iv: Intervall, ms?: number): Promise<Metriken> {
  const bis = runden(Date.now(), iv === 'minute' ? 5 * 60_000 : 30 * 60_000);
  const q = ms ? `?from=${new Date(bis - ms).toISOString()}&to=${new Date(bis).toISOString()}` : '';
  const pfad = (c: string) => `/islands/${encodeURIComponent(c)}/metrics/${iv}${q}`;
  try { return metrikenAus(await epicHolen(pfad(code), TTL[iv])); } catch (e) {
    if (e instanceof EpicFehler && e.status === 404 && code !== code.toLowerCase()) return metrikenAus(await epicHolen(pfad(code.toLowerCase()), TTL[iv]));
    throw e;
  }
}
/** Nur die Punkte im Zeitraum behalten (falls Epic mehr liefert, z. B. ohne from/to). Tageswerte duerfen bis 7 Tage zurueck. */
const FENSTER: Record<Zeitraum, number> = { '1H': 36e5, '1D': 864e5, '1W': 7 * 864e5 };
function zuschneiden(m: Metriken, z: Zeitraum, iv: Intervall): Metriken {
  const ab = Date.now() - FENSTER[z] - (iv === 'day' ? 864e5 : iv === 'hour' ? 36e5 : 10 * 60_000);
  const f = (r: Punkt[]) => { const l = r.filter((p) => p.t >= ab); return l.length >= 2 || !r.length ? l : r.slice(-2); };
  return { peakCCU: f(m.peakCCU), uniquePlayers: f(m.uniquePlayers), plays: f(m.plays), minutesPlayed: f(m.minutesPlayed), averageMinutesPerPlayer: f(m.averageMinutesPerPlayer),
    favorites: f(m.favorites), recommendations: f(m.recommendations), retention: m.retention.filter((r) => r.t >= ab) };
}
/** Metriken fuer einen Zeitraum - probiert die Varianten aus VERSUCHE der Reihe nach. */
export async function metrikenZeitraum(code: string, z: Zeitraum): Promise<Metriken & { iv: Intervall }> {
  let letzter: unknown = null;
  for (const v of VERSUCHE[z]) {
    try { const m = zuschneiden(await metriken(code, v.iv, v.ms), z, v.iv); if (!leer(m)) return { ...m, iv: v.iv }; } catch (e) { letzter = e; if (e instanceof EpicFehler && (e.status === 0 || e.status === 404)) break; }
  }
  if (letzter) throw letzter;
  return { ...metrikenAus({}), iv: VERSUCHE[z][0].iv };
}

/** Mehrere Reihen zeitgleich addieren (Playlists eines Modus). */
export function summe(reihen: Punkt[][]): Punkt[] {
  const m = new Map<number, number>();
  for (const r of reihen) for (const p of r) m.set(p.t, (m.get(p.t) ?? 0) + p.v);
  return [...m.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
}
function summeMetriken(l: Metriken[]): Metriken {
  const k = (f: Exclude<keyof Metriken, 'retention'>) => summe(l.map((m) => m[f]));
  return { peakCCU: k('peakCCU'), uniquePlayers: k('uniquePlayers'), plays: k('plays'), minutesPlayed: k('minutesPlayed'), averageMinutesPerPlayer: [], favorites: k('favorites'), recommendations: k('recommendations'), retention: [] };
}

/* ---------------------------------------------- Spielmodi (Epics eigene "Inseln") */
export interface ModusDaten { m: Metriken; iv: Intervall; quelle: string[]; set: boolean }
const modusCache = new Map<string, Promise<ModusDaten | null>>();
/** Erst die Sammel-Codes, dann alle Playlists addiert. null = nichts gefunden (Codes in modi.ts pruefen). */
export function modusMetriken(modus: Spielmodus, z: Zeitraum): Promise<ModusDaten | null> {
  const k = `${modus.k}:${z}:${runden(Date.now(), 5 * 60_000)}`;
  if (!modusCache.has(k)) {
    modusCache.set(k, (async () => {
      for (const s of modus.sets) {
        try { const m = await metrikenZeitraum(s, z); if (!leer(m)) return { m, iv: m.iv, quelle: [s], set: true }; } catch (e) { if (e instanceof EpicFehler && e.status === 0) throw e; }
      }
      const r = await Promise.allSettled(modus.playlists.map((p) => metrikenZeitraum(p, z).then((m) => ({ p, m }))));
      const ok = r.flatMap((x) => (x.status === 'fulfilled' && !leer(x.value.m) ? [x.value] : []));
      if (!ok.length) { if (r.some((x) => x.status === 'rejected' && x.reason instanceof EpicFehler && x.reason.status === 0)) throw new EpicFehler(0, 'offline'); return null; }
      return { m: summeMetriken(ok.map((x) => x.m)), iv: ok[0].m.iv, quelle: ok.map((x) => x.p), set: false };
    })());
    modusCache.get(k)!.catch(() => modusCache.delete(k));
  }
  return modusCache.get(k)!;
}
/** Hook: Daten aller (oder bestimmter) Modi fuer einen Zeitraum. */
export function useModi(z: Zeitraum, modi: Spielmodus[] = SPIELMODI) {
  const [z2, setZ] = useState<{ daten: Record<string, ModusDaten | null>; laedt: boolean; offline: boolean }>({ daten: {}, laedt: true, offline: false });
  const schluessel = modi.map((m) => m.k).join(',');
  useEffect(() => {
    let weg = false;
    setZ((v) => ({ ...v, laedt: true }));
    let offen = modi.length;
    for (const m of modi) {
      modusMetriken(m, z).then((d) => { if (!weg) setZ((v) => ({ ...v, daten: { ...v.daten, [m.k]: d } })); })
        .catch((e) => { if (!weg) setZ((v) => ({ ...v, daten: { ...v.daten, [m.k]: null }, offline: v.offline || (e instanceof EpicFehler && e.status === 0) })); })
        .finally(() => { offen -= 1; if (!offen && !weg) setZ((v) => ({ ...v, laedt: false })); });
    }
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z, schluessel]);
  return z2;
}

/* ---------------------------------------------- Kennzahlen aus einer Reihe */
export const letzter = (r: Punkt[]) => r.at(-1)?.v ?? null;
export const spitze = (r: Punkt[], ab = 0) => { const l = r.filter((p) => p.t >= ab); return l.length ? Math.max(...l.map((p) => p.v)) : null; };
export const gesamt = (r: Punkt[], ab = 0) => { const l = r.filter((p) => p.t >= ab); return l.length ? l.reduce((s, p) => s + p.v, 0) : null; };

/* ---------------------------------------------- Insel-Pool (Discover, Creators, Creative) */
/**
 * Die ersten Seiten der Inselliste + Spitzenwerte je Insel aus EINER Abfrage (Stunden-Intervall, letzte 7 Tage): daraus ergeben sich
 * "jetzt" (letzte Stunde), 24 h und 7 Tage. Der Pool laedt einmal pro Sitzung und waechst sichtbar (Rangliste sortiert sich live um).
 */
export interface InselWerte { jetzt: number | null; tag: number | null; woche: number | null; spieler1d: number | null; plays1d: number | null; serie: Punkt[] }
interface Pool { inseln: Map<string, Insel>; werte: Map<string, InselWerte>; seiten: number; weiter?: string; laedt: boolean; fertig: boolean; offline: boolean; geprueft: number }
export const POOL_SEITEN = 4;
const pool: Pool = { inseln: new Map(), werte: new Map(), seiten: 0, laedt: false, fertig: false, offline: false, geprueft: 0 };
const poolHoerer = new Set<() => void>();
let poolTakt: ReturnType<typeof setTimeout> | null = null;
const poolMelden = (sofort = false) => {
  if (sofort) { poolHoerer.forEach((h) => h()); return; }
  if (poolTakt) return;
  poolTakt = setTimeout(() => { poolTakt = null; poolHoerer.forEach((h) => h()); }, 350);
};
function werteAus(m: Metriken): InselWerte {
  const jetzt = Date.now();
  return { jetzt: letzter(m.peakCCU), tag: spitze(m.peakCCU, jetzt - 864e5), woche: spitze(m.peakCCU), spieler1d: gesamt(m.uniquePlayers, jetzt - 864e5), plays1d: gesamt(m.plays, jetzt - 864e5), serie: m.peakCCU };
}
async function werteLaden(i: Insel) {
  try { pool.werte.set(i.code, werteAus(await metrikenZeitraum(i.code, '1W'))); } catch (e) { if (e instanceof EpicFehler && e.status === 0) pool.offline = true; }
  pool.geprueft += 1; poolMelden();
}
export async function poolLaden(mehrSeiten = 0) {
  if (pool.laedt) return;
  pool.laedt = true; poolMelden(true);
  const ziel = Math.max(POOL_SEITEN, pool.seiten + mehrSeiten);
  try {
    if (pool.seiten === 0) {
      // Epics eigene Modi als "Inseln" dazu (mit dem Code, der antwortet)
      for (const m of SPIELMODI) {
        modusMetriken(m, '1W').then((d) => {
          if (!d) return;
          const code = d.set ? d.quelle[0] : `modus:${m.k}`;
          pool.inseln.set(code, { code, titel: m.titel, creator: 'epic', kategorie: 'Epic mode', tags: ['epic'], epic: true });
          pool.werte.set(code, werteAus(d.m)); poolMelden();
        }).catch(() => {});
      }
    }
    while (pool.seiten < ziel && (pool.seiten === 0 || pool.weiter)) {
      const s = await inselnSeite(pool.weiter);
      pool.seiten += 1; pool.weiter = s.weiter;
      const neu = s.inseln.filter((i) => !pool.inseln.has(i.code));
      neu.forEach((i) => pool.inseln.set(i.code, i));
      poolMelden(true);
      await Promise.all(neu.map(werteLaden));
      if (!s.weiter) break;
    }
  } catch (e) { if (e instanceof EpicFehler && e.status === 0) pool.offline = true; } finally { pool.laedt = false; pool.fertig = true; poolMelden(true); }
}
export function useInselPool() {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = () => neu((n) => n + 1); poolHoerer.add(h);
    if (!pool.seiten && !pool.laedt) poolLaden();
    return () => { poolHoerer.delete(h); };
  }, []);
  return { inseln: [...pool.inseln.values()], werte: pool.werte, laedt: pool.laedt, fertig: pool.fertig, offline: pool.offline, seiten: pool.seiten, mehr: pool.weiter ? () => poolLaden(2) : null, geprueft: pool.geprueft };
}
/** Wert einer Insel fuer einen Zeitraum-Chip. */
export const wertFuer = (w: InselWerte | undefined, z: Zeitraum) => (!w ? null : z === '1H' ? w.jetzt : z === '1D' ? w.tag : w.woche);

/** Zahl kurz: 1.2M, 34.5K. */
export function kurz(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString('en');
}
/** Link zur Insel auf fortnite.com. */
export const inselLink = (i: Pick<Insel, 'code' | 'creator'>) => (istEpicCode(i.code) || i.code.startsWith('modus:') ? 'https://www.fortnite.com/' : `https://www.fortnite.com/@${encodeURIComponent(i.creator || 'epic')}/${i.code}`);
