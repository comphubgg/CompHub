import crypto from 'crypto';
import { holeSeiteFrisch, verwirfAbgeleitete, MAX_PAGES, type CupEintrag } from '@/lib/epicCups';
import { holeKatalog, regionAus } from '@/lib/cupWertung';
import { ganzLesen, ganzSchreiben, ohneDoppelte, imBau } from '@/lib/bestenlisteVorrat';
import { abonniere, melde, hoererZahl } from '@/lib/liveStrom';

/*
 * Eine Quelle je laufendem Spieltag statt einer Abfrage je Zuschauer (Betreiber, 15.11.2026: "When the server has it, I want to see it on the page
 * within 1 second - instant").
 *
 * Solange mindestens ein Datenstrom (app/api/live/stream) an einem Spieltag haengt, fragt EIN Abruf im Serverprozess Epic im festen Takt:
 *   - Seite 0 der Bestenliste alle PROBE_KLEIN_MS (2 s, Feld bis 1.000 Plaetze) bzw. PROBE_MS (3 s, groesseres Feld) - eine Anfrage;
 *   - hat sich etwas getan (Seite 0 anders, oder lange kein voller Abruf), die uebrigen Seiten, gebremst durch einen Eimer von SEITEN_PRO_S Seiten
 *     je Sekunde und Spieltag (und GLOBAL_PRO_S fuer alle zusammen). Kleines Feld (bis 10 Seiten = 1.000 Plaetze): das ganze Feld, so oft der Eimer es
 *     hergibt (3 Seiten: alle 3 s). Grosses Feld: bei jeder Aenderung die ersten TOP_SEITEN Seiten sofort, das ganze Feld, wenn der Eimer voll genug ist
 *     (100 Seiten bei 1/s: alle ~100 s - wie bisher der Vorrat alle ~2 Minuten).
 * Die geholten Seiten landen im Speicher von lib/epicCups (holeSeite), der Vorrat der ganzen Liste (lib/bestenlisteVorrat) wird neu geschrieben, und
 * alles daraus Abgeleitete (Top-Liste, Matches, Quali-Linie) verworfen. Erst DANN geht "stand" an alle Stroeme: jede Seite, die daraufhin fragt, bekommt
 * den neuen Stand aus dem Speicher - ohne eine einzige Anfrage bei Epic.
 *
 * Epic-Last je Spieltag damit hoechstens PROBE (0,5/s klein, 0,33/s gross) + SEITEN_PRO_S (1/s) = ~1,3-1,5 Anfragen je Sekunde (grosses Feld dazu die Spitze: 4 Seiten je 15 s,
 * zusammen ~1,6/s), unabhaengig von der Zahl der Zuschauer, und nur solange sich etwas aendert; Namen
 * nur fuer Konten, die noch nie aufgeloest wurden (lib/epicCups loeseNamenAuf, 100 je Anfrage, mit eigener Bremse bei 429).
 */

const zahl = (n: string | undefined, standard: number) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? x : standard; };
export const PROBE_MS = zahl(process.env.LIVE_PROBE_MS, 3_000);
/** Kleines Feld (Heats, Finals - bis 1.000 Plaetze): Seite 0 alle 2 s (Betreiber, Heat 2: "der schnellste moegliche Weg"). */
export const PROBE_KLEIN_MS = zahl(process.env.LIVE_PROBE_KLEIN_MS, 2_000);
const SEITEN_PRO_S = zahl(process.env.LIVE_SEITEN_PRO_S, 1);
const GLOBAL_PRO_S = zahl(process.env.LIVE_GLOBAL_PRO_S, 4);
const KLEIN_SEITEN = 10;
const TOP_SEITEN = 5;
/** Grosses Feld: die Spitze hoechstens so oft eigens frisch (4 Seiten je 15 s = 0,27 Anfragen/s). */
const TEIL_ABSTAND_MS = 15_000;
const GLEICHZEITIG = 6;
/** Hoechstens so viele Spieltage zugleich (FNCS: alle Regionen einer Runde passen hinein). */
const MAX_FENSTER = zahl(process.env.LIVE_MAX_FENSTER, 8);
/** Ohne Zuschauer laeuft der Abruf noch so lange weiter (Neuladen, Tab-Wechsel). */
const NACHLAUF_MS = 30_000;
/** Vor dem Beginn und nach dem Ende gilt ein Spieltag so lange als "live". */
const VORLAUF_MS = 10 * 60_000;
const NACHSPIEL_MS = 30 * 60_000;

interface Zustand {
  event: string; window: string;
  begin: number; end: number;
  laeuft: boolean;
  uhr: ReturnType<typeof setTimeout> | null;
  stopp: ReturnType<typeof setTimeout> | null;
  /** Stand-Nummer - steigt bei jeder sichtbaren Aenderung. */
  v: number;
  fp: string; fp0: string; fp0Teil: string; letzteTeil: number;
  schmutzig: boolean;
  letzteVoll: number;
  seiten: number;
  eimer: number; eimerZeit: number;
  fehlerInFolge: number;
  updated: string | null;
  geaendert: number | null;
  anfragen: number; seit: number;
}

const g = globalThis as unknown as { __liveFenster?: Map<string, Zustand>; __liveEimer?: { t: number; z: number }; __liveAnfragen?: { n: number; seit: number } };
const fenster: Map<string, Zustand> = (g.__liveFenster ??= new Map());
const globalEimer = (g.__liveEimer ??= { t: GLOBAL_PRO_S * 30, z: Date.now() });
const anfragenGesamt = (g.__liveAnfragen ??= { n: 0, seit: Date.now() });

export const fensterKanal = (window: string) => `fenster:${window}`;
const schluessel = (event: string, window: string) => `${event}|${window}`;

/** Wann der Spieltag laut Epics Katalog laeuft - null, wenn es ihn dort nicht gibt. */
const zeitMerker = new Map<string, { bis: number; wert: { begin: number; end: number } | null }>();
export async function fensterZeit(event: string, window: string): Promise<{ begin: number; end: number } | null> {
  const k = schluessel(event, window);
  const da = zeitMerker.get(k);
  if (da && da.bis > Date.now()) return da.wert;
  const katalog = await holeKatalog(regionAus(window)) as unknown as { events?: Array<{ eventId?: string; eventWindows?: Array<{ eventWindowId?: string; beginTime?: string; endTime?: string }> }> };
  let wert: { begin: number; end: number } | null = null;
  for (const e of katalog.events ?? []) {
    if (e.eventId !== event) continue;
    const w = (e.eventWindows ?? []).find((x) => x.eventWindowId === window);
    if (w) { wert = { begin: Date.parse(w.beginTime ?? '') || 0, end: Date.parse(w.endTime ?? '') || 0 }; break; }
  }
  zeitMerker.set(k, { bis: Date.now() + 60_000, wert });
  if (zeitMerker.size > 100) zeitMerker.delete(zeitMerker.keys().next().value as string);
  return wert;
}

export type Pruefung = { ok: true; begin: number; end: number } | { ok: false; status: number; grund: string };
/** Darf fuer diesen Spieltag ein Live-Abruf laufen? Nur echte, gerade laufende Spieltage - sonst koennte jeder Epic-Abrufe fuer Beliebiges anstossen. */
export async function pruefeFenster(event: string, window: string): Promise<Pruefung> {
  if (!/^[\w.-]{3,120}$/.test(event) || !/^[\w.-]{3,120}$/.test(window)) return { ok: false, status: 400, grund: 'ungueltig' };
  let zeit: { begin: number; end: number } | null;
  try { zeit = await fensterZeit(event, window); } catch { return { ok: false, status: 503, grund: 'katalog-nicht-erreichbar' }; }
  if (!zeit) return { ok: false, status: 404, grund: 'unbekannt' };
  const jetzt = Date.now();
  if (jetzt < zeit.begin - VORLAUF_MS || jetzt > zeit.end + NACHSPIEL_MS) return { ok: false, status: 409, grund: 'nicht-live' };
  if (!fenster.has(schluessel(event, window)) && [...fenster.values()].filter((f) => f.laeuft).length >= MAX_FENSTER) return { ok: false, status: 503, grund: 'zu-viele' };
  return { ok: true, ...zeit };
}

/** Kurzer Fingerabdruck einer Liste: Platz, Punkte, Spiele und letzte Endzeit je Team. */
function fingerabdruck(eintraege: CupEintrag[]): string {
  const h = crypto.createHash('md5');
  for (const e of eintraege) {
    const m = e.matches ?? [];
    h.update(`${e.rank}|${e.points}|${m.length}|${m.length ? (m[m.length - 1] as { endTime?: string }).endTime ?? '' : ''}|${(e.players ?? []).map((p) => p.id).join('+')};`);
  }
  return h.digest('hex');
}

function nachfuellen(f: Zustand) {
  const jetzt = Date.now();
  f.eimer = Math.min(Math.max(f.seiten, KLEIN_SEITEN), f.eimer + ((jetzt - f.eimerZeit) / 1000) * SEITEN_PRO_S);
  f.eimerZeit = jetzt;
  globalEimer.t = Math.min(Math.max(MAX_PAGES + 20, GLOBAL_PRO_S * 30), globalEimer.t + ((jetzt - globalEimer.z) / 1000) * GLOBAL_PRO_S);
  globalEimer.z = jetzt;
}
const genug = (f: Zustand, n: number) => f.eimer >= n && globalEimer.t >= n;
const nimm = (f: Zustand, n: number) => { f.eimer -= n; globalEimer.t -= n; };

/** Seiten von..bis-1 frisch holen, je GLEICHZEITIG nebeneinander. */
async function holeSeiten(f: Zustand, von: number, bis: number, haltbar: number) {
  const raus: CupEintrag[] = [];
  for (let p = von; p < bis; p += GLEICHZEITIG) {
    const stapel = [];
    for (let i = p; i < Math.min(p + GLEICHZEITIG, bis); i++) stapel.push(holeSeiteFrisch(f.event, f.window, i, haltbar));
    f.anfragen += stapel.length; anfragenGesamt.n += stapel.length;
    for (const s of await Promise.all(stapel)) raus.push(...(s.entries as CupEintrag[]));
  }
  return raus;
}

/** Einen Vorrat schreiben, ohne einem gerade laufenden Bau der Schnittstelle in die Quere zu kommen. */
async function mitBausperre<T>(w: string, arbeit: () => Promise<T>): Promise<T> {
  const vorher = imBau.get(w);
  if (vorher) await vorher.catch(() => {});
  let fertig!: () => void;
  const sperre = new Promise<void>((r) => { fertig = r; });
  imBau.set(w, sperre);
  try { return await arbeit(); } finally { fertig(); if (imBau.get(w) === sperre) imBau.delete(w); }
}

async function takt(f: Zustand) {
  f.uhr = null;
  if (!f.laeuft) return;
  const t0 = Date.now();
  let naechster = f.seiten && f.seiten <= KLEIN_SEITEN ? PROBE_KLEIN_MS : PROBE_MS;
  try {
    const jetzt = Date.now();
    if (jetzt > f.end + NACHSPIEL_MS) { halt(f); melde(fensterKanal(f.window), 'ende', { v: f.v }); return; }
    // Vor dem Beginn hat Epic noch keine Liste - nur ab und zu nachsehen.
    if (jetzt < f.begin) naechster = 15_000;
    const klein0 = f.seiten <= KLEIN_SEITEN;
    const haltbar = klein0 ? 20_000 : Math.round((Math.max(f.seiten, KLEIN_SEITEN) / SEITEN_PRO_S) * 1000) + 30_000;
    const erste = await holeSeiteFrisch(f.event, f.window, 0, haltbar);
    f.anfragen += 1; anfragenGesamt.n += 1;
    f.fehlerInFolge = 0;
    const eintraege0 = erste.entries as CupEintrag[];
    f.seiten = Math.min(erste.totalPages || 0, MAX_PAGES);
    if (!eintraege0.length) return;
    const fp0 = `${erste.updated}|${f.seiten}|${fingerabdruck(eintraege0)}`;
    if (fp0 !== f.fp0) { f.fp0 = fp0; f.schmutzig = true; }
    nachfuellen(f);

    const klein = f.seiten <= KLEIN_SEITEN;
    const rest = Math.max(0, f.seiten - 1);
    const alter = Date.now() - f.letzteVoll;
    let neu: CupEintrag[] | null = null;
    let teil = false;
    if (klein) {
      // Kleines Feld: bei jeder Aenderung (oder spaetestens alle 15 s) das ganze Feld.
      if ((f.schmutzig || alter > 15_000) && genug(f, rest)) {
        nimm(f, rest);
        neu = await mitBausperre(f.window, async () => {
          const alle = ohneDoppelte([...eintraege0, ...(await holeSeiten(f, 1, f.seiten, haltbar))]);
          await ganzSchreiben(f.window, { entries: alle, totalPages: erste.totalPages, updated: erste.updated });
          return alle;
        });
        f.letzteVoll = Date.now(); f.schmutzig = false;
      }
    } else if ((f.schmutzig || alter > 120_000) && genug(f, rest)) {
      // Grosses Feld, Eimer voll genug: das ganze Feld.
      nimm(f, rest);
      neu = await mitBausperre(f.window, async () => {
        const alle = ohneDoppelte([...eintraege0, ...(await holeSeiten(f, 1, f.seiten, haltbar))]);
        await ganzSchreiben(f.window, { entries: alle, totalPages: erste.totalPages, updated: erste.updated });
        return alle;
      });
      f.letzteVoll = Date.now(); f.schmutzig = false;
    } else if (fp0 !== f.fp0Teil && Date.now() - f.letzteTeil >= TEIL_ABSTAND_MS && globalEimer.t >= TOP_SEITEN - 1) {
      // Grosses Feld: die Spitze sofort (die ersten TOP_SEITEN Seiten), der Rest des Vorrats bleibt bis zum naechsten vollen Abruf stehen.
      // Eigenes Mass (TEIL_ABSTAND_MS), nicht aus dem Eimer des Spieltags - sonst kaeme der volle Abruf nie an die Reihe.
      globalEimer.t -= TOP_SEITEN - 1;
      f.fp0Teil = fp0; f.letzteTeil = Date.now();
      teil = true;
      neu = await mitBausperre(f.window, async () => {
        const spitze = [...eintraege0, ...(await holeSeiten(f, 1, Math.min(TOP_SEITEN, f.seiten), haltbar))];
        const grenze = Math.max(...spitze.map((e) => e.rank));
        const vorrat = await ganzLesen(f.window);
        const teams = new Set(spitze.map((e) => (e.players ?? []).map((p) => p.id).sort().join('+')));
        const dahinter = ((vorrat?.entries ?? []) as CupEintrag[]).filter((e) => e.rank > grenze && !teams.has((e.players ?? []).map((p) => p.id).sort().join('+')));
        const alle = ohneDoppelte([...spitze, ...dahinter]);
        await ganzSchreiben(f.window, { entries: alle, totalPages: erste.totalPages, updated: erste.updated });
        return alle;
      });
      // Nur die Spitze ist frisch - der volle Abruf bleibt faellig.
    }
    if (neu) {
      verwirfAbgeleitete(f.window);
      const fp = fingerabdruck(neu);
      if (fp !== f.fp) {
        f.fp = fp; f.v += 1; f.updated = erste.updated ?? null; f.geaendert = Date.now();
        melde(fensterKanal(f.window), 'stand', standVon(f, teil));
      }
    }
  } catch (e) {
    f.fehlerInFolge += 1;
    naechster = Math.min(60_000, PROBE_MS * 2 ** Math.min(f.fehlerInFolge, 5));
    if (f.fehlerInFolge === 1 || f.fehlerInFolge % 10 === 0) console.warn(`Live-Abruf ${f.window}: ${(e as Error)?.message ?? e}`);
  } finally {
    if (f.laeuft && !f.uhr) f.uhr = setTimeout(() => { void takt(f); }, Math.max(250, naechster - (Date.now() - t0)));
  }
}

function standVon(f: Zustand, teil = false) {
  return { v: f.v, updated: f.updated, seiten: f.seiten, teil, zeit: f.geaendert };
}

function halt(f: Zustand) {
  f.laeuft = false;
  if (f.uhr) clearTimeout(f.uhr); f.uhr = null;
  if (f.stopp) clearTimeout(f.stopp); f.stopp = null;
  fenster.delete(schluessel(f.event, f.window));
}

/**
 * An einem Spieltag mithoeren: `h` bekommt "stand" ({ v, updated, seiten, teil, zeit }) bei jeder Aenderung und "ende" nach dem Spieltag.
 * Der erste Hoerer startet den Abruf, nach dem letzten laeuft er noch NACHLAUF_MS weiter. Vorher pruefeFenster() aufrufen.
 */
export function abonniereFenster(event: string, window: string, zeit: { begin: number; end: number }, h: (ereignis: string, daten: unknown) => void) {
  const k = schluessel(event, window);
  let f = fenster.get(k);
  if (!f) {
    f = {
      event, window, begin: zeit.begin, end: zeit.end, laeuft: true, uhr: null, stopp: null, v: 0, fp: '', fp0: '', fp0Teil: '', letzteTeil: 0, schmutzig: true, letzteVoll: 0,
      seiten: 0, eimer: KLEIN_SEITEN, eimerZeit: Date.now(), fehlerInFolge: 0, updated: null, geaendert: null, anfragen: 0, seit: Date.now(),
    };
    fenster.set(k, f);
    const neu = f;
    neu.uhr = setTimeout(() => { void takt(neu); }, 0);
  }
  if (f.stopp) { clearTimeout(f.stopp); f.stopp = null; }
  const ab = abonniere(fensterKanal(window), h);
  const zustand = f;
  return {
    stand: () => standVon(zustand),
    weg: () => {
      ab();
      if (hoererZahl(fensterKanal(window)) > 0 || !zustand.laeuft) return;
      if (zustand.stopp) clearTimeout(zustand.stopp);
      zustand.stopp = setTimeout(() => { if (hoererZahl(fensterKanal(window)) === 0) halt(zustand); }, NACHLAUF_MS);
    },
  };
}

/** Fuer die Uebersicht (app/api/live/status): was laeuft, wie viele Anfragen bei Epic. */
export function liveUebersicht() {
  const jetzt = Date.now();
  return {
    probeMs: PROBE_MS, probeKleinMs: PROBE_KLEIN_MS, seitenProS: SEITEN_PRO_S, globalProS: GLOBAL_PRO_S,
    epicAnfragen: anfragenGesamt.n, epicAnfragenSeit: new Date(anfragenGesamt.seit).toISOString(),
    fenster: [...fenster.values()].map((f) => ({
      event: f.event, window: f.window, zuschauer: hoererZahl(fensterKanal(f.window)), seiten: f.seiten, v: f.v, updated: f.updated,
      epicAnfragen: f.anfragen, proSekunde: +(f.anfragen / Math.max(1, (jetzt - f.seit) / 1000)).toFixed(3), fehlerInFolge: f.fehlerInFolge,
    })),
  };
}
