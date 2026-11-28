import { useEffect, useMemo, useState } from 'react';
import { poolAbo, poolLaden, poolStand, type Punkt } from './daten';

/*
 * Die Live-Daten der Community-Seiten kommen von der Seite selbst (ueber den /api-Proxy, Betreiber 27.11.2026: "Most played" war viel zu
 * klein, weil Epics oeffentliche Inselliste unsortiert ist und Epics eigene Modi gar nicht enthaelt):
 *
 *   GET /api/fn-entdecken[?verlauf=1]   { stand, eintraege:[{ code, titel, bild, creator, spieler, epic }] } - nach Spielern JETZT sortiert,
 *                                       MIT Epics eigenen Modi (Battle Royale, Reload ...); mit verlauf=1 Stundenwerte je Code
 *   GET /api/fn-inseln?codes=a,b,c      { inseln:{ [code]: { titel, bild, creator, tagline, typ } | null } } - Thumbnails (hoechstens 100 je Abruf)
 *   GET /api/fn-spieler?name=...        Casual-Profil eines Spielers (siehe SeitenLive.tsx, Player lookup)
 *
 * Antwortet /api/fn-entdecken (noch) nicht, zeigen die Seiten ersatzweise eine STICHPROBE aus Epics oeffentlicher Data API (epic/daten.ts) -
 * klar so beschriftet, nie als "die meistgespielten". Epics Data API bleibt die Quelle fuer die Diagramme und die Retention einer Insel.
 */

export interface Eintrag { code: string; titel: string; bild: string | null; creator: string; spieler: number; epic: boolean; serie: Punkt[]; tags: string[] }
export interface Rangliste {
  liste: Eintrag[]; quelle: 'seite' | 'stichprobe' | null; stand: number | null; laedt: boolean;
  /** Nur bei der Stichprobe: wie viele Inseln der Liste schon gefragt sind. */
  geprueft?: number; von?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Verlauf tolerant lesen: [[t,v]], [{t,v}], [{zeit,spieler}], [{timestamp,value}] - Zeit als ms, s oder ISO. */
function serieAus(roh: any): Punkt[] {
  if (!Array.isArray(roh)) return [];
  const zeit = (x: any) => { const n = typeof x === 'number' ? (x < 1e11 ? x * 1000 : x) : Date.parse(String(x ?? '')); return Number.isFinite(n) ? n : NaN; };
  return roh.map((p) => (Array.isArray(p) ? { t: zeit(p[0]), v: Number(p[1]) } : { t: zeit(p?.t ?? p?.zeit ?? p?.stunde ?? p?.timestamp ?? p?.time), v: Number(p?.v ?? p?.spieler ?? p?.value ?? p?.players) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
}
function eintraegeAus(j: any): Eintrag[] {
  const l = Array.isArray(j?.eintraege) ? j.eintraege : [];
  const verlauf = j?.verlauf && typeof j.verlauf === 'object' ? j.verlauf : {};
  return l.map((x: any): Eintrag | null => {
    const code = String(x?.code ?? '').trim(); if (!code) return null;
    return { code, titel: String(x.titel ?? x.title ?? code).trim(), bild: typeof x.bild === 'string' && x.bild ? x.bild : null, creator: String(x.creator ?? '').trim(),
      spieler: Number(x.spieler) || 0, epic: !!x.epic, serie: serieAus(x.verlauf ?? verlauf[code]), tags: Array.isArray(x.tags) ? x.tags.map(String) : [] };
  }).filter((x: Eintrag | null): x is Eintrag => !!x && x.spieler > 0).sort((a: Eintrag, b: Eintrag) => b.spieler - a.spieler);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function jsonHolen(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    return await r.json();
  } catch { return null; }
}

/* ---------------------------------------------- /api/fn-entdecken (ein gemeinsamer Stand fuer alle Seiten, alle 60 s neu) */
const entdecken: { daten: Eintrag[] | null; stand: number | null; status: 'neu' | 'laedt' | 'da' | 'fehlt'; zeit: number; hoerer: Set<() => void> } = { daten: null, stand: null, status: 'neu', zeit: 0, hoerer: new Set() };
async function entdeckenLaden() {
  if (entdecken.status === 'laedt') return;
  const erst = entdecken.status === 'neu'; if (erst) entdecken.status = 'laedt';
  entdecken.zeit = Date.now();
  // Liste und Stundenverlauf kommen getrennt (?verlauf=1 liefert nur { stand, verlauf }) - beides parallel holen und zusammenlegen
  const [liste, verl] = (await Promise.all([jsonHolen('/api/fn-entdecken'), jsonHolen('/api/fn-entdecken?verlauf=1')])) as Array<{ stand?: number | string; eintraege?: unknown[]; verlauf?: unknown } | null>;
  const j = liste?.eintraege?.length ? { ...liste, verlauf: liste.verlauf ?? verl?.verlauf } : verl;
  const l = j ? eintraegeAus(j) : [];
  if (l.length) { entdecken.daten = l; entdecken.stand = typeof j?.stand === 'number' ? j.stand : Date.parse(String(j?.stand ?? '')) || Date.now(); entdecken.status = 'da'; }
  else if (!entdecken.daten) entdecken.status = 'fehlt';
  entdecken.hoerer.forEach((h) => h());
}
function useEntdecken() {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = () => neu((n) => n + 1); entdecken.hoerer.add(h);
    if (Date.now() - entdecken.zeit > 55_000) void entdeckenLaden();
    const takt = setInterval(() => { if (!document.hidden) void entdeckenLaden(); }, 60_000);
    return () => { entdecken.hoerer.delete(h); clearInterval(takt); };
  }, []);
  return entdecken;
}

/** Die Rangliste "wer spielt gerade was" - von der Seite, ersatzweise die Stichprobe aus Epics Inselliste (wird nur dann geladen). */
export function useRangliste(): Rangliste {
  const e = useEntdecken();
  const ersatz = e.status === 'fehlt';
  const [takt, neu] = useState(0);
  useEffect(() => {
    if (!ersatz) return undefined;
    const ab = poolAbo(() => neu((n) => n + 1));
    if (!poolStand().gestartet) void poolLaden();
    return ab;
  }, [ersatz]);
  return useMemo(() => {
    if (e.daten) return { liste: e.daten, quelle: 'seite', stand: e.stand, laedt: false };
    if (!ersatz) return { liste: [], quelle: null, stand: null, laedt: true };
    const pool = poolStand();
    const liste = pool.inseln.filter((i) => !i.code.startsWith('modus:')).map((i): Eintrag | null => {
      const w = pool.werte.get(i.code); if (!w?.jetzt) return null;
      return { code: i.code, titel: i.titel, bild: i.bild ?? null, creator: i.creator, spieler: w.jetzt, epic: i.epic, serie: w.serie.filter((p) => p.t > Date.now() - 864e5), tags: i.tags };
    }).filter((x): x is Eintrag => !!x).sort((a, b) => b.spieler - a.spieler);
    return { liste, quelle: 'stichprobe', stand: Date.now(), laedt: pool.laedt && !liste.length, geprueft: pool.geprueft, von: pool.inseln.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.daten, e.stand, ersatz, takt]);
}

/* ---------------------------------------------- /api/fn-inseln (Thumbnails; gebuendelt, gemerkt) */
export interface InselInfo { titel?: string; bild?: string | null; creator?: string; tagline?: string; typ?: string }
const INFO_TTL = 24 * 3_600_000;
const infos = new Map<string, { i: InselInfo | null; t: number }>();
try { const r = JSON.parse(localStorage.getItem('hub-fn-inseln') ?? '{}') as Record<string, { i: InselInfo | null; t: number }>; for (const [k, v] of Object.entries(r)) if (Date.now() - v.t < INFO_TTL) infos.set(k, v); } catch { /* leer */ }
const infoHoerer = new Set<() => void>();
const offen = new Set<string>(); const unterwegs = new Set<string>();
let infoTakt: ReturnType<typeof setTimeout> | null = null; let infoPause = 0;
function infosMerken() {
  try { localStorage.setItem('hub-fn-inseln', JSON.stringify(Object.fromEntries([...infos].filter(([, v]) => v.i).slice(-1500)))); } catch { /* voll */ }
}
async function infosHolen() {
  infoTakt = null;
  const codes = [...offen].slice(0, 100); codes.forEach((c) => { offen.delete(c); unterwegs.add(c); });
  if (offen.size) infoTakt = setTimeout(infosHolen, 150);
  const j = (await jsonHolen(`/api/fn-inseln?codes=${codes.map(encodeURIComponent).join(',')}`)) as { inseln?: Record<string, InselInfo | null> } | null;
  codes.forEach((c) => unterwegs.delete(c));
  if (!j?.inseln) { infoPause = Date.now() + 60_000; return; } // Route antwortet (noch) nicht - in einer Minute wieder
  for (const c of codes) infos.set(c, { i: j.inseln[c] ?? null, t: Date.now() });
  infosMerken(); infoHoerer.forEach((h) => h());
}
function infosAnfragen(codes: string[]) {
  if (Date.now() < infoPause) return;
  let neu = false;
  for (const c of codes) if (c && !infos.has(c) && !unterwegs.has(c) && !offen.has(c) && !c.startsWith('modus:')) { offen.add(c); neu = true; }
  if (neu && !infoTakt) infoTakt = setTimeout(infosHolen, 40);
}
/** Infos (v. a. das Thumbnail) zu den genannten Codes - laedt nur, was noch fehlt. */
export function useInselInfos(codes: string[]): (code: string) => InselInfo | null {
  const [, neu] = useState(0);
  const schluessel = codes.join(',');
  useEffect(() => { const h = () => neu((n) => n + 1); infoHoerer.add(h); return () => { infoHoerer.delete(h); }; }, []);
  useEffect(() => { infosAnfragen(schluessel ? schluessel.split(',') : []); }, [schluessel]);
  return (code) => infos.get(code)?.i ?? null;
}

/* ---------------------------------------------- Creators aus der Rangliste */
export interface Creator { name: string; epic: boolean; spieler: number; inseln: Eintrag[] }
export function creatorsAus(liste: Eintrag[]): Creator[] {
  const m = new Map<string, Creator>();
  for (const x of liste) {
    const name = x.epic ? 'Epic Games' : x.creator || 'unknown';
    const c = m.get(name) ?? { name, epic: x.epic, spieler: 0, inseln: [] };
    c.spieler += x.spieler; c.inseln.push(x); m.set(name, c);
  }
  return [...m.values()].sort((a, b) => b.spieler - a.spieler);
}
