import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Abschnitt, Bild, Flaeche, Marke, Segment, Zaehler } from '../../../ds/Bausteine';
import { LinkKopieren } from '../Bausteine';
import { useAblage } from '../kosmetik/daten';
import { aktuell, EpicFehler, inselHolen, inselLink, kurz, leer, metriken, type Insel, type Metriken, type Punkt } from './daten';
import { Verlauf } from './Diagramm';
import { useInselInfos, useRangliste, type Eintrag, type InselInfo } from './fn';
import { InselKarte } from './Teile';

/*
 * Insel-Detail (/community/creative/:code), neu gebaut 28.11.2026 nach dem Vorbild der Inselseite von fortnite.gg - eigene Komposition im
 * Design-System 3.0, nur mit Zahlen, die es wirklich gibt:
 *
 *   Kopf          grosses 16:9-Bild (fn-inseln bildGross), Titel, Code zum Kopieren, Creator, Tags (Epic Data API), Beschreibung (fn-inseln tagline)
 *   Player count  jetzt (Discover / Epic), Spitze 24 h, 7 Tage und "all time" seit Beginn der eigenen Aufzeichnung, Durchschnitt; Verlauf 1H
 *                 (10-Minuten-Werte), 1D, 1W (Stundenwerte), 1M und ALL aus der eigenen Aufzeichnung (sobald sie so weit reicht)
 *   Stundentabelle Spitze, Zuwachs, Durchschnitt (= minutesPlayed / 60), einzelne Spieler und Plays je Stunde
 *   Discover      in welchen Reihen die Insel gerade steht und an welcher Stelle (fn-entdecken?reihen=1); darunter die Zeitleiste: je Reihe
 *                 eine Bahn ueber die Zeit, Farbe = bester Platz der Stunde (fn-verlauf) - erst, wenn es mehr als eine Stunde Verlauf gibt
 *   Vergleich     gegen die anderen Inseln derselben Genre-Reihe (Epic-Tageswerte jeder Insel, letzter voller Tag)
 *   Engagement    Unique players, Plays, Favoriten, Empfehlungen, Spielzeit, Session, Retention Tag 1 / Tag 7 - je ein kleines Diagramm
 *   Mehr          mehr vom selben Creator, mehr aus denselben Discover-Reihen (Thumbnails, keine Insel doppelt)
 *
 * Epic bewahrt nur sieben Tage auf (Fortnite Data API). Alles Laengere zeichnet CompHub seit dem 28.11.2026 selbst auf (alle fuenf Minuten aus
 * Fortnites Discover, /api/fn-verlauf: Stundenspitzen, Hoechststand, Reihen und Plaetze je Stunde) - und sagt immer dazu, seit wann. Solange es
 * dort nichts gibt, zeigt die Seite nichts davon (kein "bald"). Plattform-Anteile und geschaetzte Einnahmen gibt es oeffentlich nicht (Epic
 * nennt keine Rate je Minute) - sie fehlen bewusst.
 */

const TAG = 864e5;
const STUNDE = 36e5;
const istInselCode = (c: string) => /^\d{4}-\d{4}-\d{4}$/.test(c);
const prozent = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
const minuten = (v: number) => `${v.toFixed(1)} min`;
const stunden = (v: number) => `${kurz(v)} h`;
const zeitStunde = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const datum = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** Retention kommt als Anteil (0.23) oder schon als Prozent (23) - immer Prozent zurueck. */
const alsProzent = (v: number) => (v <= 1 ? v * 100 : v);

/* ================================================================== Daten */

/** Erster Versuch, der Daten liefert. 0 (nicht erreichbar) und 404 (Epic kennt den Code nicht) brechen sofort ab. */
async function erste(versuche: Array<() => Promise<Metriken>>): Promise<Metriken | null> {
  let fehler: unknown = null;
  for (const v of versuche) {
    try { const m = await v(); if (!leer(m) || m.retention.length) return m; } catch (x) { fehler = x; if (x instanceof EpicFehler && (x.status === 0 || x.status === 404)) throw x; }
  }
  if (fehler) throw fehler;
  return null;
}

interface EpicStand {
  insel: Insel | null | undefined;
  /** 10-Minuten-Werte (Epic-Intervall "minute"), moeglichst 24 h */
  min: Metriken | null | undefined;
  /** Stundenwerte, 7 Tage */
  std: Metriken | null | undefined;
  /** Tageswerte, 7 Tage (nur hier gibt es Retention) */
  tag: Metriken | null | undefined;
  /** 0 = Epic nicht erreichbar, 404 = Epic fuehrt die Insel nicht */
  fehler: 0 | 404 | null;
}
function useEpic(code: string): EpicStand {
  const [s, setS] = useState<EpicStand>({ insel: undefined, min: undefined, std: undefined, tag: undefined, fehler: null });
  useEffect(() => {
    let weg = false;
    if (!istInselCode(code)) { setS({ insel: null, min: null, std: null, tag: null, fehler: 404 }); return undefined; }
    setS({ insel: undefined, min: undefined, std: undefined, tag: undefined, fehler: null });
    const setzen = (k: 'min' | 'std' | 'tag', p: Promise<Metriken | null>) => p
      .then((m) => { if (!weg) setS((v) => ({ ...v, [k]: m })); })
      .catch((x) => { if (!weg) setS((v) => ({ ...v, [k]: null, fehler: x instanceof EpicFehler && (x.status === 0 || x.status === 404) ? (v.fehler ?? x.status as 0 | 404) : v.fehler })); });
    inselHolen(code).then((i) => { if (!weg) setS((v) => ({ ...v, insel: i })); }).catch(() => { if (!weg) setS((v) => ({ ...v, insel: null })); });
    setzen('std', erste([() => metriken(code, 'hour', 7 * TAG), () => metriken(code, 'hour', TAG), () => metriken(code, 'hour')]));
    setzen('min', erste([() => metriken(code, 'minute', TAG), () => metriken(code, 'minute', 6 * STUNDE), () => metriken(code, 'minute', STUNDE), () => metriken(code, 'minute')]));
    setzen('tag', erste([() => metriken(code, 'day', 7 * TAG), () => metriken(code, 'day')]));
    return () => { weg = true; };
  }, [code]);
  return s;
}

/** Stundenverlauf der Seite selbst (fn-entdecken?verlauf=1, hoechster Stand je Stunde) - fuer Epics Modi und wenn Epics Data API schweigt. */
const seitenCache = new Map<string, Promise<Punkt[]>>();
function seitenVerlauf(code: string): Promise<Punkt[]> {
  if (!seitenCache.has(code)) {
    seitenCache.set(code, fetch(`/api/fn-entdecken?verlauf=1&tage=7&codes=${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { verlauf?: Record<string, unknown> } | null) => {
        const roh = j?.verlauf?.[code];
        return (Array.isArray(roh) ? roh : []).map((p) => ({ t: Number((p as number[])[0]), v: Number((p as number[])[1]) }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
      }).catch(() => []));
  }
  return seitenCache.get(code)!;
}
function useSeitenVerlauf(code: string): Punkt[] | undefined {
  const [p, setP] = useState<Punkt[] | undefined>(undefined);
  useEffect(() => { let weg = false; setP(undefined); seitenVerlauf(code).then((x) => { if (!weg) setP(x); }); return () => { weg = true; }; }, [code]);
  return p;
}

/**
 * Die eigene Aufzeichnung der Seite (fn-verlauf, seit 28.11.2026): Stundenspitzen ohne Ende, Hoechststand seit Beginn, Discover-Reihen je Stunde.
 * null = nicht erreichbar oder noch nichts aufgezeichnet (start fehlt) - dann zeigt die Seite nichts davon.
 */
interface Lang { start: number; seit: number | null; stunden: Punkt[]; peak: { wert: number; t: number } | null; discover: Array<{ t: number; reihe: string; platz: number }>; reihen: Record<string, string> }
const langCache = new Map<string, { zeit: number; p: Promise<Lang | null> }>();
function langerVerlauf(code: string): Promise<Lang | null> {
  const c = langCache.get(code);
  if (c && Date.now() - c.zeit < 5 * 60_000) return c.p;
  const p = fetch(`/api/fn-verlauf?code=${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
    .then((j: { start?: unknown; seit?: unknown; stunden?: unknown; peak?: { wert?: unknown; t?: unknown } | null; discover?: unknown; reihen?: unknown } | null) => {
      const start = Number(j?.start);
      if (!j || !(start > 0)) return null;
      const stunden = (Array.isArray(j.stunden) ? j.stunden : []).map((x) => ({ t: Number((x as number[])[0]), v: Number((x as number[])[1]) }))
        .filter((x) => Number.isFinite(x.t) && x.v > 0).sort((a, b) => a.t - b.t);
      const discover = (Array.isArray(j.discover) ? j.discover : []).map((x) => ({ t: Number((x as unknown[])[0]), reihe: String((x as unknown[])[1] ?? ''), platz: Number((x as unknown[])[2]) }))
        .filter((x) => Number.isFinite(x.t) && x.reihe && x.platz >= 1);
      const peak = j.peak && Number(j.peak.wert) > 0 ? { wert: Number(j.peak.wert), t: Number(j.peak.t) } : null;
      const reihen = j.reihen && typeof j.reihen === 'object' ? Object.fromEntries(Object.entries(j.reihen as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])) : {};
      return { start, seit: Number(j.seit) > 0 ? Number(j.seit) : null, stunden, peak, discover, reihen };
    }).catch(() => null);
  langCache.set(code, { zeit: Date.now(), p });
  return p;
}
function useLangerVerlauf(code: string): Lang | null | undefined {
  const [l, setL] = useState<Lang | null | undefined>(undefined);
  useEffect(() => { let weg = false; setL(undefined); langerVerlauf(code).then((x) => { if (!weg) setL(x); }); return () => { weg = true; }; }, [code]);
  return l;
}

/** Die Reihen von Fortnites Discover in Epics Reihenfolge (fn-entdecken?reihen=1), einmal je Minute. */
interface Reihe { name: string; titel: string; codes: string[] }
let reihenZeit = 0; let reihenP: Promise<Reihe[]> | null = null;
function useReihen(): Reihe[] | undefined {
  const [r, setR] = useState<Reihe[] | undefined>(undefined);
  useEffect(() => {
    let weg = false;
    if (!reihenP || Date.now() - reihenZeit > 60_000) {
      reihenZeit = Date.now();
      reihenP = fetch('/api/fn-entdecken?reihen=1', { headers: { Accept: 'application/json' } }).then((x) => (x.ok ? x.json() : null))
        .then((j: { reihen?: Array<{ name?: string; titel?: string | null; codes?: string[] }> } | null) => (j?.reihen ?? [])
          .map((x) => ({ name: String(x.name ?? ''), titel: String(x.titel ?? x.name ?? ''), codes: Array.isArray(x.codes) ? x.codes.map(String) : [] })).filter((x) => x.codes.length))
        .catch(() => []);
    }
    reihenP.then((x) => { if (!weg) setR(x); });
    return () => { weg = true; };
  }, []);
  return r;
}

/* ---------------------------------------------- Tageswerte (Vergleich, Engagement) */
const heuteUtc = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
/** Zeitpunkte der vollen Tage (der laufende Tag zaehlt nicht), aufsteigend. */
function volleTage(m: Metriken): number[] {
  const ab = heuteUtc();
  const t = [...new Set([...m.uniquePlayers, ...m.plays, ...m.peakCCU].map((p) => p.t).concat(m.retention.map((r) => r.t)))].sort((a, b) => a - b);
  return t.filter((x) => x < ab);
}
const wertBei = (r: Punkt[], t: number) => r.find((p) => p.t === t)?.v ?? null;
const teilen = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : a / b);

/* ================================================================== Seite */
interface Sammlung { id: string; name: string; inseln: Array<{ code: string; name?: string }> }
type Spanne = '1H' | '1D' | '1W' | '1M' | 'ALL';

export function InselDetail() {
  const { code: roh = '' } = useParams();
  const code = decodeURIComponent(roh);
  const r = useRangliste();
  const info = useInselInfos([code])(code) as (InselInfo & { bildGross?: string | null }) | null;
  const epic = useEpic(code);
  const seite = useSeitenVerlauf(code);
  const lang = useLangerVerlauf(code);
  const reihen = useReihen();
  const sammlungen = useAblage<Sammlung[]>('sammlungen', [{ id: 'favoriten', name: 'Favorites', inseln: [] }]);

  const platz = r.liste.findIndex((x) => x.code === code);
  const e = platz >= 0 ? r.liste[platz] : null;
  const titel = e?.titel ?? info?.titel ?? epic.insel?.titel ?? code;
  const creator = e?.creator || info?.creator || epic.insel?.creator || '';
  const istEpic = e?.epic ?? (epic.insel?.epic || !istInselCode(code) || creator.toLowerCase() === 'epic');
  const bild = info?.bildGross ?? e?.bild ?? info?.bild ?? epic.insel?.bild ?? null;
  const text = info?.tagline ?? epic.insel?.text ?? null;

  const gemerkt = sammlungen.wert.some((s) => s.id === 'favoriten' && s.inseln.some((i) => i.code === code));
  const merken = () => sammlungen.setzen((l) => {
    const basis = l.some((s) => s.id === 'favoriten') ? l : [{ id: 'favoriten', name: 'Favorites', inseln: [] }, ...l];
    return basis.map((s) => (s.id !== 'favoriten' ? s : { ...s, inseln: gemerkt ? s.inseln.filter((i) => i.code !== code) : [...s.inseln, { code, name: titel }] }));
  });

  // Discover-Reihen mit dieser Insel (gleiche Titel nur einmal - Epic fuehrt manche Genres doppelt)
  const meineReihen = useMemo(() => {
    const spieler = new Map(r.liste.map((x) => [x.code, x.spieler]));
    const gesehen = new Set<string>();
    return (reihen ?? []).filter((x) => x.codes.includes(code)).filter((x) => { const k = x.titel.toLowerCase(); if (gesehen.has(k)) return false; gesehen.add(k); return true; })
      .map((x) => {
        const nach = [...x.codes].sort((a, b) => (spieler.get(b) ?? 0) - (spieler.get(a) ?? 0));
        return { ...x, stelle: x.codes.indexOf(code) + 1, rang: nach.indexOf(code) + 1, genre: x.name.startsWith('Browse') };
      });
  }, [reihen, r.liste, code]);
  // Die Stundentabelle braucht Stundenwerte (Epic) oder die Stunden der Seite; solange beides laedt, bleibt ihr Platz reserviert
  const tabelle = epic.std === undefined || seite === undefined || !!epic.std?.peakCCU.length || (seite?.length ?? 0) > 1;
  const genre = meineReihen.find((x) => x.genre && x.codes.length >= 4) ?? meineReihen.find((x) => x.genre) ?? null;

  return (
    <div className="space-y-7">
      <Kopf code={code} titel={titel} creator={creator} istEpic={istEpic} bild={bild} text={text} insel={epic.insel} typ={info?.typ} platz={platz} gemerkt={gemerkt} merken={merken} genre={genre?.titel ?? null} />
      <Spielerzahl code={code} e={e} epic={epic} seite={seite} lang={lang} istEpic={istEpic} />
      {tabelle ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <Stundentabelle epic={epic} seite={seite} />
          <div className="space-y-6">
            <DiscoverKarte reihen={meineReihen} geladen={reihen !== undefined} platz={platz} verlauf={discoverVerlaufDa(lang)} />
            <Herkunft epic={epic} istEpic={istEpic} seite={seite} lang={lang} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <DiscoverKarte reihen={meineReihen} geladen={reihen !== undefined} platz={platz} verlauf={discoverVerlaufDa(lang)} />
          <Herkunft epic={epic} istEpic={istEpic} seite={seite} lang={lang} />
        </div>
      )}
      {lang && discoverVerlaufDa(lang) && <DiscoverVerlauf code={code} lang={lang} />}
      {genre && !istEpic && <Vergleich code={code} reihe={genre} eigen={epic.tag} liste={r.liste} />}
      {(epic.std || epic.tag) && <Engagement epic={epic} />}
      <Mehr code={code} creator={creator} istEpic={istEpic} liste={r.liste} reihen={meineReihen} />
    </div>
  );
}

/* ================================================================== Kopf */
const MACHART: Record<string, string> = { 'valkyrie:application': 'UEFN', 'creative:island': 'Creative', 'br:playlist': 'Epic playlist', modeset: 'Epic mode' };
function Kopf({ code, titel, creator, istEpic, bild, text, insel, typ, platz, gemerkt, merken, genre }: {
  code: string; titel: string; creator: string; istEpic: boolean; bild: string | null; text: string | null; insel: Insel | null | undefined; typ?: string; platz: number;
  gemerkt: boolean; merken: () => void; genre: string | null;
}) {
  const [offen, setOffen] = useState(false);
  const lang = (text?.length ?? 0) > 320;
  // Epics eigene Modi fuehrt der Links-Dienst ebenfalls als "valkyrie:application" - dort waere "UEFN" falsch
  const gemacht = istEpic ? 'Epic mode' : insel?.erstelltIn ?? (typ ? MACHART[typ.toLowerCase()] ?? null : null);
  const tags = [...new Set((insel?.tags ?? []).map((t) => t.toLowerCase()))];
  const fakten: Array<[string, ReactNode]> = [
    ['Creator', istEpic ? 'Epic Games' : creator ? <Link to={`/community/creators?c=${encodeURIComponent(creator)}`} className="hover:text-akz">@{creator}</Link> : '—'],
    ['Made in', gemacht ?? '—'],
    ['Genre row', genre ?? '—'],
    ['On Discover', platz >= 0 ? `#${platz + 1} right now` : 'not listed now'],
  ];
  return (
    <header className="fl-fest relative isolate overflow-hidden">
      {/* Leichter Akzent-Schein statt eines zweiten (unscharfen) Bildes - dasselbe Bild nie doppelt als Deko */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgb(var(--akz)/0.14),transparent_60%)]" />
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-9 xl:p-7">
        <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative aspect-video self-start overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
          <Bild src={bild} alt={titel} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {platz >= 0 && <Marke ton={platz < 3 ? 'gold' : 'akz'}>#{platz + 1} on Discover</Marke>}
            {istEpic && <Marke>Epic Games</Marke>}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="flex min-w-0 flex-col">
          <Link to="/community/creative" className="knopf-leer !text-xs">← All islands</Link>
          <h1 className="titel mt-3 break-words text-5xl leading-[0.95] sm:text-6xl 2xl:text-7xl">{titel}</h1>
          <p className="mt-2 text-sm text-white/55">{istEpic ? 'An Epic Games mode' : creator ? <>by <Link to={`/community/creators?c=${encodeURIComponent(creator)}`} className="font-semibold text-white/85 hover:text-akz">@{creator}</Link></> : 'Island'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {istInselCode(code) && <LinkKopieren text={code} url={code} />}
            <a href={inselLink({ code, creator })} target="_blank" rel="noreferrer" className="knopf-prim">Play on fortnite.com ↗</a>
            {istInselCode(code) && <button type="button" onClick={merken} className={`knopf ${gemerkt ? '!border-akz/50 !text-akz' : ''}`}>{gemerkt ? '★ Saved' : '☆ Save'}</button>}
          </div>
          {tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="chip capitalize">{t}</span>)}</div>}
          {text && (
            <div className="mt-4">
              <p className={`whitespace-pre-line text-[14px] leading-relaxed text-white/60 ${offen || !lang ? '' : 'line-clamp-5'}`}>{text.replace(/\r/g, '')}</p>
              {lang && <button type="button" onClick={() => setOffen((x) => !x)} className="knopf-leer mt-1 !text-xs">{offen ? 'Show less' : 'Show more'}</button>}
            </div>
          )}
          <dl className="mt-5 grid grid-cols-2 xl:mt-auto gap-x-5 gap-y-3 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
            {fakten.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{k}</dt><dd className="mt-0.5 truncate text-sm font-semibold text-white/85">{v}</dd></div>)}
          </dl>
        </motion.div>
      </div>
    </header>
  );
}

/* ================================================================== Player count */
function Spielerzahl({ code, e, epic, seite, lang, istEpic }: { code: string; e: Eintrag | null; epic: EpicStand; seite: Punkt[] | undefined; lang: Lang | null | undefined; istEpic: boolean }) {
  const jetzt = Date.now();
  const min = epic.min?.peakCCU ?? [];
  const std = epic.std?.peakCCU ?? [];
  const site = seite ?? [];
  const spanneVon = (r: Punkt[]) => (r.length > 1 ? r.at(-1)!.t - r[0].t : 0);
  // Je Zeitraum die feinste Quelle, die ihn wirklich abdeckt
  const reihen: Partial<Record<Spanne, { punkte: Punkt[]; text: string }>> = {};
  const h1 = min.filter((p) => p.t >= jetzt - 1.2 * STUNDE);
  if (h1.length > 2) reihen['1H'] = { punkte: h1, text: '10-minute values from Epic' };
  const d1min = min.filter((p) => p.t >= jetzt - TAG);
  const d1std = std.filter((p) => p.t >= jetzt - TAG);
  const d1site = site.filter((p) => p.t >= jetzt - TAG);
  if (spanneVon(d1min) > 3 * STUNDE) reihen['1D'] = { punkte: d1min, text: '10-minute values from Epic' };
  else if (d1std.length > 2) reihen['1D'] = { punkte: d1std, text: 'Hourly peaks from Epic' };
  else if (d1site.length > 2) reihen['1D'] = { punkte: d1site, text: "Hourly peaks recorded by CompHub from Fortnite's Discover" };
  if (spanneVon(std) > 30 * STUNDE) reihen['1W'] = { punkte: std, text: 'Hourly peaks from Epic · Epic keeps 7 days' };
  else if (spanneVon(site) > 30 * STUNDE) reihen['1W'] = { punkte: site, text: "Hourly peaks recorded by CompHub from Fortnite's Discover" };
  // Laenger als Epics sieben Tage: nur aus der eigenen Aufzeichnung, und erst, wenn sie den Zeitraum wirklich abdeckt (ALL: mehr als eine Woche,
  // 1M: vier Wochen). Immer mit dem Datum, seit dem aufgezeichnet wird.
  const lst = lang?.stunden ?? [];
  const seitText = lang ? ` since ${datum(lang.start)}` : '';
  if (spanneVon(lst) >= 28 * TAG) reihen['1M'] = { punkte: lst.filter((p) => p.t >= jetzt - 30 * TAG), text: `Hourly peaks recorded by CompHub from Fortnite's Discover · recording${seitText}` };
  if (spanneVon(lst) > 8 * TAG) reihen.ALL = { punkte: lst, text: `Hourly peaks recorded by CompHub from Fortnite's Discover · everything${seitText}` };
  const wahl = (['1H', '1D', '1W', '1M', 'ALL'] as Spanne[]).filter((k) => reihen[k]);
  const [z, setZ] = useState<Spanne>('1D');
  useEffect(() => { if (wahl.length && !wahl.includes(z)) setZ(wahl.includes('1D') ? '1D' : wahl[0]); }, [wahl.join(','), z]); // eslint-disable-line react-hooks/exhaustive-deps
  const aktiv = reihen[z] ?? reihen[wahl[0]];

  const nun = e?.spieler ?? (epic.min ? aktuell(epic.min) : null) ?? (epic.std ? aktuell(epic.std) : null);
  const max = (l: Punkt[]) => (l.length ? Math.max(...l.map((p) => p.v)) : null);
  const spitze24 = [max(d1min), max(d1std), max(d1site), nun].reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
  const spitze7 = [max(std), max(site), spitze24].reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
  const hatWoche = spanneVon(std) > 30 * STUNDE || spanneVon(site) > 30 * STUNDE;
  // Hoechststand aller Zeiten = das Hoechste, was es gibt: die eigene Aufzeichnung (seit ihrem Beginn) und Epics sieben Tage, wenn sie weiter
  // zurueckreichen. "since" nennt den fruehesten Zeitpunkt, den diese Zahlen abdecken.
  const allzeit = lang?.peak ? Math.max(lang.peak.wert, spitze7 ?? 0) : null;
  const allzeitSeit = lang ? Math.min(lang.start, std.length ? std[0].t : Infinity) : null;
  const min24 = (epic.std?.minutesPlayed ?? []).filter((p) => p.t >= jetzt - TAG);
  const schnitt = min24.length >= 12 ? min24.reduce((s, p) => s + p.v, 0) / (min24.length * 60) : null;
  const laedt = epic.min === undefined || epic.std === undefined || seite === undefined;

  return (
    <Flaeche className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 border-b border-white/[0.07] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div>
            <p className="ueber flex items-center gap-2">{nun ? <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span> : null}Player count</p>
            <p className="titel mt-2 text-6xl leading-none text-white sm:text-8xl lg:text-6xl 2xl:text-7xl">{nun ? <Zaehler wert={nun} /> : '–'}</p>
            <p className="mt-1 text-xs text-white/50">{nun ? 'playing right now' : laedt ? 'asking Epic …' : epic.fehler === 0 ? "no live number – Epic's Data API isn't answering" : epic.fehler === 404 ? 'not on Discover right now' : 'fewer than 5 players right now (Epic hides smaller numbers)'}</p>
          </div>
          <div className={`grid gap-4 lg:grid-cols-1 lg:gap-5 ${allzeit !== null ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
            {spitze24 !== null && <Zahl label="Peak · 24 h" wert={spitze24} ton="text-akz" />}
            {spitze7 !== null && (hatWoche || spitze7 !== spitze24) && <Zahl label={hatWoche ? 'Peak · 7 days' : 'Peak · recorded'} wert={spitze7} ton="text-violet-300" unter={hatWoche ? 'Epic keeps 7 days' : undefined} />}
            {allzeit !== null && allzeitSeit !== null && <Zahl label="All-time peak" wert={allzeit} ton="text-amber-300" unter={`since ${datum(allzeitSeit)}${lang?.peak && lang.peak.wert >= allzeit ? ` · reached ${datum(lang.peak.t)}` : ''}`} immer />}
            {schnitt !== null && <Zahl label="Avg players · 24 h" wert={schnitt} ton="text-white" unter="minutes played ÷ 1,440" />}
          </div>
        </div>
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="titel text-3xl">{z === '1H' ? 'Last hour' : z === '1W' ? 'Last 7 days' : z === '1M' ? 'Last 30 days' : z === 'ALL' && lang ? `Since ${datum(lang.start)}` : 'Last 24 hours'}</h2>
            {wahl.length > 1 && <Segment klein id={`insel-zahl-${code}`} wert={z} wahl={wahl.map((k) => ({ k, titel: k }))} onWahl={setZ} />}
          </div>
          <div className="mt-4 pb-6">
            {aktiv ? (
              <AnimatePresence mode="wait"><motion.div key={z} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Verlauf hoehe={300} serien={[{ name: 'Players', farbe: 'rgb(var(--akz))', punkte: aktiv.punkte }]} />
              </motion.div></AnimatePresence>
            ) : laedt ? <div className="h-[300px] animate-pulse rounded-2xl bg-white/[0.03]" />
              : <p className="grid h-[220px] place-items-center px-6 text-center text-sm text-white/45">{epic.fehler === 0 ? "No history right now – Epic's Data API isn't answering, and CompHub hasn't recorded this island on Discover." : istEpic ? "Epic doesn't publish a history for its own modes, and CompHub hasn't recorded enough hours yet." : 'No history yet – Epic only publishes numbers above 5 players, for public islands.'}</p>}
          </div>
          {aktiv && <p className="text-xs text-white/35">{aktiv.text}</p>}
        </div>
      </div>
    </Flaeche>
  );
}
function Zahl({ label, wert, ton, unter, format = kurz, immer = false }: { label: string; wert: number | null; ton: string; unter?: string; format?: (n: number) => string; immer?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className={`titel mt-1 text-4xl leading-none ${ton}`}>{wert === null ? '–' : <Zaehler wert={wert} format={format} />}</p>
      {unter && <p className={`mt-1 text-[11px] text-white/35 ${immer ? '' : 'hidden sm:block'}`}>{unter}</p>}
    </div>
  );
}

/* ================================================================== Stundentabelle */
function Stundentabelle({ epic, seite }: { epic: EpicStand; seite: Punkt[] | undefined }) {
  const [alle, setAlle] = useState(false);
  const zeilen = useMemo(() => {
    const ab = Date.now() - TAG - 2 * STUNDE;
    const quelle = epic.std?.peakCCU.length ? epic.std.peakCCU : seite ?? [];
    const l = quelle.filter((p) => p.t >= ab);
    const minuten = new Map((epic.std?.minutesPlayed ?? []).map((p) => [p.t, p.v]));
    const einzel = new Map((epic.std?.uniquePlayers ?? []).map((p) => [p.t, p.v]));
    const plays = new Map((epic.std?.plays ?? []).map((p) => [p.t, p.v]));
    return l.map((p, i) => {
      const vor = i ? l[i - 1] : null;
      const schnitt = minuten.has(p.t) ? minuten.get(p.t)! / 60 : null;
      const schnittVor = vor && minuten.has(vor.t) ? minuten.get(vor.t)! / 60 : null;
      return { t: p.t, spitze: p.v, plus: vor ? p.v - vor.v : null, proz: vor && vor.v ? ((p.v - vor.v) / vor.v) * 100 : null, schnitt, schnittPlus: schnitt !== null && schnittVor !== null ? schnitt - schnittVor : null,
        einzel: einzel.get(p.t) ?? null, plays: plays.get(p.t) ?? null };
    }).slice(1).slice(-24).reverse();
  }, [epic.std, seite]);
  const mitEpic = !!epic.std?.minutesPlayed.length;
  if (!zeilen.length) {
    if (epic.std === undefined || seite === undefined) return <Flaeche className="h-[420px] animate-pulse" />;
    return null;
  }
  const sicht = alle ? zeilen : zeilen.slice(0, 12);
  const pm = (v: number | null, f: (n: number) => string) => (v === null ? <span className="text-white/25">–</span> : <span className={v > 0 ? 'text-emerald-300' : v < 0 ? 'text-red-300' : 'text-white/50'}>{v > 0 ? '+' : ''}{f(v)}</span>);
  const ganz = (n: number) => Math.round(n).toLocaleString('en');
  return (
    <Flaeche className="min-w-0 p-5 sm:p-6" verz={0.05}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="ueber">Hour by hour</p><h2 className="titel mt-1 text-3xl">The last 24 hours</h2></div>
        <p className="text-xs text-white/40">{mitEpic ? 'Avg players = minutes played in the hour ÷ 60' : "Hourly peaks recorded by CompHub from Fortnite's Discover"}</p>
      </div>
      <div className="ohne-leiste -mx-2 mt-4 overflow-x-auto">
        <table className="tabelle min-w-[640px]">
          <thead><tr>
            <th>Hour</th><th className="!text-right">Peak</th><th className="!text-right">Gain</th><th className="!text-right">% Gain</th>
            {mitEpic && <><th className="!text-right">Avg players</th><th className="!text-right">Avg gain</th><th className="!text-right">Unique players</th><th className="!text-right">Plays</th></>}
          </tr></thead>
          <tbody className="zahl">
            {sicht.map((z) => (
              <tr key={z.t}>
                <td className="whitespace-nowrap text-white/60">{zeitStunde(z.t)} – {zeitStunde(z.t + STUNDE)}</td>
                <td className="text-right font-bold text-white">{ganz(z.spitze)}</td>
                <td className="text-right">{pm(z.plus, ganz)}</td>
                <td className="text-right">{pm(z.proz, (n) => `${n.toFixed(1)}%`)}</td>
                {mitEpic && <>
                  <td className="text-right text-white/85">{z.schnitt === null ? '–' : ganz(z.schnitt)}</td>
                  <td className="text-right">{pm(z.schnittPlus, ganz)}</td>
                  <td className="text-right text-white/70">{z.einzel === null ? '–' : kurz(z.einzel)}</td>
                  <td className="text-right text-white/70">{z.plays === null ? '–' : kurz(z.plays)}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {zeilen.length > 12 && <button type="button" onClick={() => setAlle((x) => !x)} className="knopf-leer mt-3 !text-xs">{alle ? 'Show 12 hours' : `Show all ${zeilen.length} hours`}</button>}
    </Flaeche>
  );
}

/* ================================================================== Discover jetzt */
function DiscoverKarte({ reihen, geladen, platz, verlauf }: { reihen: Array<Reihe & { stelle: number; rang: number; genre: boolean }>; geladen: boolean; platz: number; verlauf: boolean }) {
  return (
    <Flaeche className="p-5 sm:p-6" verz={0.08}>
      <p className="ueber">On Discover right now</p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="titel text-5xl leading-none text-akz">{platz >= 0 ? `#${platz + 1}` : '–'}</p>
        <p className="text-sm text-white/55">{platz >= 0 ? 'by players, across everything Discover lists' : 'not on a Discover row at the moment'}</p>
      </div>
      {!geladen ? <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/[0.03]" /> : reihen.length > 0 && (
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {reihen.slice(0, 8).map((x, i) => (
            <motion.li key={x.name} initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 py-2.5">
              <span className={`titel w-10 shrink-0 text-2xl leading-none ${x.rang === 1 ? 'text-amber-300' : 'text-white/80'}`}>#{x.rang}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{x.titel}</p>
                <p className="text-[11px] text-white/40">of {x.codes.length} by players · tile {x.stelle} in the row</p>
              </div>
              <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-akz" initial={{ width: 0 }} whileInView={{ width: `${Math.max(8, 100 - ((x.rang - 1) / Math.max(1, x.codes.length - 1)) * 92)}%` }} viewport={{ once: true }} transition={{ duration: 0.7 }} /></div>
            </motion.li>
          ))}
        </ul>
      )}
      {geladen && <p className="mt-3 text-[11px] text-white/35">{verlauf ? "Live from Fortnite's Discover rows · history below." : "Live from Fortnite's Discover rows – right now."}</p>}
    </Flaeche>
  );
}

/** Woher die Zahlen kommen - eine kleine Karte statt Fussnoten unter jedem Teil. */
function Herkunft({ epic, istEpic, seite, lang }: { epic: EpicStand; istEpic: boolean; seite: Punkt[] | undefined; lang: Lang | null | undefined }) {
  const stand = epic.min?.stand ?? epic.std?.stand;
  const zeilen: Array<[string, string, string]> = [];
  if (epic.fehler === 0) zeilen.push(['bg-amber-300', "Epic's Data API isn't answering", 'Charts fall back to CompHub\'s own hourly Discover numbers.']);
  else if (epic.fehler === 404) zeilen.push(['bg-white/30', istEpic ? 'Epic mode' : 'Not in Epic\'s Data API', istEpic ? "Epic's public Data API has no stats for its own modes." : 'Epic only publishes stats for public, discoverable islands.']);
  else if (stand) zeilen.push(['bg-emerald-400', "Epic's Fortnite Data API", `Latest value ${zeitStunde(stand)} · 10-minute, hourly and daily values · kept for 7 days`]);
  if (lang?.stunden.length) zeilen.push(['bg-akz', "Fortnite's Discover", `Players right now · CompHub has recorded ${lang.stunden.length.toLocaleString('en')} hourly peaks${lang.discover.length ? ' and Discover rows' : ''} since ${datum(lang.start)}`]);
  else if (seite?.length) zeilen.push(['bg-akz', "Fortnite's Discover", `Players right now and ${seite.length} hourly peaks recorded by CompHub`]);
  if (!zeilen.length) return null;
  return (
    <Flaeche className="space-y-3 p-5" verz={0.12}>
      {zeilen.map(([farbe, k, v]) => (
        <div key={k} className="flex gap-3"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${farbe}`} /><div><p className="text-sm font-semibold text-white/85">{k}</p><p className="text-xs text-white/45">{v}</p></div></div>
      ))}
    </Flaeche>
  );
}

/* ================================================================== Discover-Verlauf (eigene Aufzeichnung) */
/** Gibt es Discover-Verlauf, der mehr ist als "jetzt"? Mindestens zwei Stunden mit einem Platz in einer Reihe. */
function discoverVerlaufDa(l: Lang | null | undefined): boolean {
  if (!l?.discover.length) return false;
  const erste = l.discover[0].t;
  return l.discover.some((d) => d.t !== erste);
}
type DSpanne = '1D' | '1W' | '1M' | 'ALL';
const D_SPANNE: Record<Exclude<DSpanne, 'ALL'>, number> = { '1D': TAG, '1W': 7 * TAG, '1M': 30 * TAG };
/** Farbe einer Kachel nach Platz: vorne kraeftig, weit hinten blass (wie fortnite.gg, eigene Stufen). */
const platzStufe = (p: number) => (p <= 3 ? 1 : p <= 10 ? 0.72 : p <= 20 ? 0.48 : 0.28);
const zeitAchse = (t: number, spanne: number) => new Date(t).toLocaleString('en-GB', spanne > 2 * TAG ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' });

function DiscoverVerlauf({ code, lang }: { code: string; lang: Lang }) {
  const erste = lang.discover.reduce((m, d) => Math.min(m, d.t), Infinity);
  const jetzt = Date.now();
  const abgedeckt = jetzt - erste;
  // Nur Zeitraeume, die die Aufzeichnung wirklich abdeckt (wie bei der Spielerzahl)
  const wahl = (['1D', '1W', '1M', 'ALL'] as DSpanne[]).filter((k) => k === '1D' || (k === '1W' ? abgedeckt > 1.5 * TAG : k === '1M' ? abgedeckt >= 28 * TAG : abgedeckt > 8 * TAG));
  const [z, setZ] = useState<DSpanne>(abgedeckt > 1.5 * TAG ? '1W' : '1D');
  const aktiv: DSpanne = wahl.includes(z) ? z : wahl.at(-1)!;
  const bis = Math.floor(jetzt / STUNDE) * STUNDE + STUNDE;
  const von = Math.floor(Math.max(erste, aktiv === 'ALL' ? lang.start : jetzt - D_SPANNE[aktiv]) / STUNDE) * STUNDE;
  const spanne = Math.max(STUNDE, bis - von);
  const [hover, setHover] = useState<number | null>(null);
  const [alle, setAlle] = useState(false);

  // Je Reihe (gleiche Titel zusammen - Epic fuehrt manche Genres doppelt) der beste Platz je Stunde, als zusammenhaengende Stuecke
  const bahnen = useMemo(() => {
    const je = new Map<string, Map<number, number>>();
    for (const d of lang.discover) {
      if (d.t < von) continue;
      const titel = lang.reihen[d.reihe] || d.reihe;
      let m = je.get(titel); if (!m) { m = new Map(); je.set(titel, m); }
      const p = m.get(d.t); if (p === undefined || d.platz < p) m.set(d.t, d.platz);
    }
    return [...je].map(([titel, m]) => {
      const zeiten = [...m.keys()].sort((a, b) => a - b);
      const stuecke: Array<{ von: number; bis: number; platz: number }> = [];
      for (const t of zeiten) {
        const p = m.get(t)!; const letzt = stuecke.at(-1);
        if (letzt && letzt.bis === t && letzt.platz === p) letzt.bis = t + STUNDE; else stuecke.push({ von: t, bis: t + STUNDE, platz: p });
      }
      return { titel, m, stunden: zeiten.length, best: Math.min(...m.values()), stuecke };
    }).sort((a, b) => b.stunden - a.stunden || a.best - b.best || a.titel.localeCompare(b.titel));
  }, [lang, von]);
  if (!bahnen.length) return null;
  const sicht = alle ? bahnen : bahnen.slice(0, 10);
  const x = (t: number) => ((t - von) / spanne) * 100;
  const hi = hover === null ? null : Math.floor((von + hover * spanne) / STUNDE) * STUNDE;
  const bewegen = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width))); };

  return (
    <Abschnitt ueber={`Discover history · since ${datum(lang.start)}`} titel="Where it showed up on Discover"
      rechts={wahl.length > 1 ? <Segment klein id={`insel-discover-${code}`} wert={aktiv} wahl={wahl.map((k) => ({ k, titel: k }))} onWahl={setZ} /> : undefined}>
      <Flaeche className="p-4 sm:p-6">
        <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-x-5">
          <div />
          <div className="relative mb-2 h-4 text-[10px] tabular-nums text-white/35">
            {[0, 0.25, 0.5, 0.75, 1].map((a) => <span key={a} className={`absolute top-0 whitespace-nowrap ${a === 0 ? '' : a === 1 ? '-translate-x-full' : '-translate-x-1/2'} ${a === 0.25 || a === 0.75 ? 'hidden sm:block' : ''}`} style={{ left: `${a * 100}%` }}>{zeitAchse(von + a * spanne, spanne)}</span>)}
          </div>
          {sicht.map((b, i) => (
            <div key={b.titel} className="contents">
              <div className="flex min-w-0 flex-col justify-center border-t border-white/[0.05] py-1.5">
                <p className="truncate text-[13px] font-semibold text-white/85">{b.titel}</p>
                <p className="text-[10px] text-white/40">best #{b.best} · {b.stunden} h</p>
              </div>
              <div className="relative border-t border-white/[0.05] py-1.5">
                <div className="relative h-6 overflow-hidden rounded-md bg-white/[0.03]">
                  {b.stuecke.map((s) => (
                    <motion.div key={s.von} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: Math.min(0.4, i * 0.03) }}
                      className="absolute inset-y-0 bg-akz" style={{ left: `${x(s.von)}%`, width: `max(2px, ${x(s.bis) - x(s.von)}%)`, opacity: platzStufe(s.platz) }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Fadenkreuz ueber allen Bahnen: welche Reihe, welcher Platz in dieser Stunde */}
        <div className="pointer-events-none relative -mt-px grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-x-5">
          <div />
          <div className="relative h-0">
            <div className="pointer-events-auto absolute inset-x-0 touch-none" style={{ bottom: 0, height: `${sicht.length * 41 + 4}px` }} onPointerMove={bewegen} onPointerLeave={() => setHover(null)}>
              {hi !== null && (
                <>
                  <div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${x(hi + STUNDE / 2)}%` }} />
                  <div className={`absolute bottom-full z-10 mb-2 min-w-[170px] rounded-xl border border-white/10 bg-[#0b1220]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur ${x(hi) > 60 ? '-translate-x-full' : ''}`} style={{ left: `${x(hi + STUNDE / 2)}%` }}>
                    <p className="mb-1 font-semibold text-white/50">{new Date(hi).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    {(() => {
                      const da = sicht.map((b) => ({ titel: b.titel, p: b.m.get(hi) })).filter((x): x is { titel: string; p: number } => x.p !== undefined);
                      return da.length ? da.map((d) => <p key={d.titel} className="flex justify-between gap-4"><span className="text-white/70">{d.titel}</span><span className="font-bold tabular-nums text-white">#{d.p}</span></p>)
                        : <p className="text-white/45">Not in any of these rows</p>;
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40">
            {[[1, 'tile 1–3'], [0.72, '4–10'], [0.48, '11–20'], [0.28, 'further back']].map(([o, t]) => <span key={String(t)} className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-akz" style={{ opacity: Number(o) }} />{t}</span>)}
          </div>
          {bahnen.length > 10 && <button type="button" onClick={() => setAlle((v) => !v)} className="knopf-leer !text-xs">{alle ? 'Show 10 rows' : `Show all ${bahnen.length} rows`}</button>}
        </div>
        <p className="mt-2 text-[11px] text-white/35">Best tile per hour in each Discover row, from CompHub's own check of Fortnite's Discover every 5 minutes. Nothing before {datum(lang.start)} – recording started then.</p>
      </Flaeche>
    </Abschnitt>
  );
}

/* ================================================================== Vergleich mit dem Genre */
type VK = 'einzel' | 'spitze' | 'stunden' | 'minSpieler' | 'session' | 'playsSpieler' | 'fav' | 'emp' | 'd1' | 'd7';
const VERGLEICH: Array<{ k: VK; titel: string; format: (n: number) => string; log?: boolean; hilfe?: string }> = [
  { k: 'einzel', titel: 'Unique players', format: kurz, log: true }, { k: 'spitze', titel: 'Peak players', format: kurz, log: true },
  { k: 'stunden', titel: 'Total playtime', format: stunden, log: true }, { k: 'minSpieler', titel: 'Playtime per player', format: minuten },
  { k: 'session', titel: 'Session length', format: minuten, hilfe: 'minutes played ÷ plays' }, { k: 'playsSpieler', titel: 'Plays per player', format: (n) => n.toFixed(2) },
  { k: 'fav', titel: 'Favorites per 100 players', format: (n) => n.toFixed(2) }, { k: 'emp', titel: 'Recommends per 100 players', format: (n) => n.toFixed(2) },
  { k: 'd1', titel: 'Day 1 retention', format: prozent }, { k: 'd7', titel: 'Day 7 retention', format: prozent },
];
/** Kennwerte des letzten vollen Tages einer Insel. */
function kennwerte(m: Metriken | null | undefined): Partial<Record<VK, number>> | null {
  if (!m) return null;
  const t = volleTage(m).at(-1); if (t === undefined) return null;
  const ein = wertBei(m.uniquePlayers, t); const pl = wertBei(m.plays, t); const mp = wertBei(m.minutesPlayed, t);
  const ret = m.retention.find((r) => r.t === t);
  const w: Partial<Record<VK, number | null>> = {
    einzel: ein, spitze: wertBei(m.peakCCU, t), stunden: mp === null ? null : mp / 60, minSpieler: wertBei(m.averageMinutesPerPlayer, t) ?? teilen(mp, ein),
    session: teilen(mp, pl), playsSpieler: teilen(pl, ein), fav: (() => { const f = teilen(wertBei(m.favorites, t), ein); return f === null ? null : f * 100; })(),
    emp: (() => { const f = teilen(wertBei(m.recommendations, t), ein); return f === null ? null : f * 100; })(),
    d1: ret?.d1 !== undefined && ret.d1 !== null ? alsProzent(ret.d1) : null, d7: ret?.d7 !== undefined && ret.d7 !== null ? alsProzent(ret.d7) : null,
  };
  return Object.fromEntries(Object.entries(w).filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v))) as Partial<Record<VK, number>>;
}
function useGenreWerte(codes: string[]) {
  const [w, setW] = useState<Record<string, Partial<Record<VK, number>> | null>>({});
  const k = codes.join(',');
  useEffect(() => {
    let weg = false; setW({});
    for (const c of codes) {
      metriken(c, 'day', 7 * TAG).catch(() => metriken(c, 'day')).then((m) => kennwerte(m)).catch(() => null)
        .then((x) => { if (!weg) setW((v) => ({ ...v, [c]: x })); });
    }
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return w;
}
function Vergleich({ code, reihe, eigen, liste }: { code: string; reihe: Reihe; eigen: Metriken | null | undefined; liste: Eintrag[] }) {
  const andere = useMemo(() => reihe.codes.filter((c) => c !== code && istInselCode(c)).slice(0, 14), [reihe.codes, code]);
  const werte = useGenreWerte(andere);
  const meine = kennwerte(eigen);
  const fertig = andere.every((c) => c in werte);
  const namen = new Map(liste.map((x) => [x.code, x.titel]));
  if (eigen === undefined) return null;
  if (!meine) return null;
  const karten = VERGLEICH.map((v) => {
    const mein = meine[v.k];
    const fremd = andere.map((c) => ({ c, v: werte[c]?.[v.k] })).filter((x): x is { c: string; v: number } => typeof x.v === 'number');
    return { ...v, mein, fremd };
  }).filter((x) => x.mein !== undefined && x.fremd.length >= 2);
  if (!karten.length) return fertig ? null : <Flaeche className="h-40 animate-pulse" />;
  return (
    <Abschnitt ueber={`Against ${andere.length} islands in the same Discover row`} titel={<>Benchmarks · <span className="text-akz">{reihe.titel}</span></>}
      rechts={<p className="hidden text-right text-xs text-white/40 md:block">Last full day, Epic's Data API · dots = other islands, line = median{fertig ? '' : ' · loading …'}</p>}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        {karten.map((x, i) => <VergleichKarte key={x.k} {...x} mein={x.mein!} namen={namen} verz={i * 0.03} />)}
      </div>
    </Abschnitt>
  );
}
function VergleichKarte({ titel, format, log, hilfe, mein, fremd, namen, verz }: { titel: string; format: (n: number) => string; log?: boolean; hilfe?: string; mein: number; fremd: Array<{ c: string; v: number }>; namen: Map<string, string>; verz: number }) {
  const alle = [mein, ...fremd.map((x) => x.v)];
  const sortiert = fremd.map((x) => x.v).sort((a, b) => a - b);
  const median = sortiert.length % 2 ? sortiert[(sortiert.length - 1) / 2] : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2;
  const rang = alle.filter((v) => v > mein).length + 1;
  const tief = Math.min(...alle); const hoch = Math.max(...alle);
  const nutzLog = log && tief > 0;
  const lage = (v: number) => { if (hoch === tief) return 50; const a = nutzLog ? (Math.log(v) - Math.log(tief)) / (Math.log(hoch) - Math.log(tief)) : (v - tief) / (hoch - tief); return 4 + a * 92; };
  const besser = mein >= median;
  return (
    <Flaeche className="p-3.5 sm:p-4" verz={verz}>
      <div className="flex flex-col-reverse items-start justify-between gap-1.5 sm:flex-row sm:gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 sm:tracking-[0.2em]" title={hilfe}>{titel}</p>
        <span className={`zahl shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${rang === 1 ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-white/60'}`}>#{rang} of {alle.length}</span>
      </div>
      <p className="mt-1.5 text-xl font-extrabold tracking-tight text-white sm:text-2xl"><span className="zahl">{format(mein)}</span></p>
      <p className={`text-[11px] ${besser ? 'text-emerald-300/85' : 'text-red-300/80'}`}>{besser ? '▲' : '▼'} median {format(median)}</p>
      <div className="relative mt-4 h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <div className="absolute top-0.5 h-5 w-px bg-white/45" style={{ left: `${lage(median)}%` }} />
        {fremd.map((x) => <span key={x.c} title={`${namen.get(x.c) ?? x.c}: ${format(x.v)}`} className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" style={{ left: `${lage(x.v)}%` }} />)}
        <motion.span initial={{ left: `${lage(median)}%`, opacity: 0 }} whileInView={{ left: `${lage(mein)}%`, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: verz }}
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fl bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.9)]" />
      </div>
    </Flaeche>
  );
}

/* ================================================================== Engagement */
type EK = 'einzel' | 'plays' | 'fav' | 'emp' | 'minSpieler' | 'stunden' | 'session' | 'd1' | 'd7';
interface EKarte { k: EK; titel: string; farbe: string; format: (n: number) => string; reihe: (m: Metriken) => Punkt[]; woche: 'summe' | 'schnitt' | 'quote'; nurTag?: boolean; text: string }
const quote = (a: Punkt[], b: Punkt[], f = 1) => { const n = new Map(b.map((p) => [p.t, p.v])); return a.filter((p) => n.get(p.t)).map((p) => ({ t: p.t, v: (p.v / n.get(p.t)!) * f })); };
const ENGAGEMENT: EKarte[] = [
  { k: 'einzel', titel: 'Unique players', farbe: '#c4b5fd', format: kurz, reihe: (m) => m.uniquePlayers, woche: 'schnitt', text: 'Different players' },
  { k: 'plays', titel: 'Plays', farbe: '#fde047', format: kurz, reihe: (m) => m.plays, woche: 'summe', text: 'Sessions started' },
  { k: 'fav', titel: 'Favorites', farbe: '#f9a8d4', format: kurz, reihe: (m) => m.favorites, woche: 'summe', text: 'Times added to favorites' },
  { k: 'emp', titel: 'Recommendations', farbe: '#86efac', format: kurz, reihe: (m) => m.recommendations, woche: 'summe', text: 'Times recommended' },
  { k: 'minSpieler', titel: 'Playtime per player', farbe: '#fdba74', format: minuten, reihe: (m) => (m.averageMinutesPerPlayer.length ? m.averageMinutesPerPlayer : quote(m.minutesPlayed, m.uniquePlayers)), woche: 'schnitt', text: 'Average minutes per player' },
  { k: 'stunden', titel: 'Total playtime', farbe: '#7dd3fc', format: stunden, reihe: (m) => m.minutesPlayed.map((p) => ({ t: p.t, v: p.v / 60 })), woche: 'summe', text: 'Hours played by everyone' },
  { k: 'session', titel: 'Session length', farbe: '#5eead4', format: minuten, reihe: (m) => quote(m.minutesPlayed, m.plays), woche: 'quote', text: 'Minutes played ÷ plays' },
  { k: 'd1', titel: 'Day 1 retention', farbe: '#38bdf8', format: prozent, reihe: (m) => m.retention.filter((r) => typeof r.d1 === 'number').map((r) => ({ t: r.t, v: alsProzent(r.d1!) })), woche: 'schnitt', nurTag: true, text: 'Players who come back the next day' },
  { k: 'd7', titel: 'Day 7 retention', farbe: '#a78bfa', format: prozent, reihe: (m) => m.retention.filter((r) => typeof r.d7 === 'number').map((r) => ({ t: r.t, v: alsProzent(r.d7!) })), woche: 'schnitt', nurTag: true, text: 'Players who come back a week later' },
];
function Engagement({ epic }: { epic: EpicStand }) {
  const wahl = ([['1D', !!epic.std], ['1W', !!epic.tag]] as const).filter(([, ok]) => ok).map(([k]) => k as '1D' | '1W');
  const [z, setZ] = useState<'1D' | '1W'>('1D');
  const spanne = wahl.includes(z) ? z : wahl[0];
  const karten = ENGAGEMENT.map((k) => {
    // Diagramm: 1D = Stundenwerte der letzten 24 h, 1W = Tageswerte (Retention gibt es nur je Tag)
    const quelle = k.nurTag || spanne === '1W' ? epic.tag : epic.std;
    const punkte = quelle ? k.reihe(quelle).filter((p) => (k.nurTag || spanne === '1W' ? true : p.t >= Date.now() - TAG)) : [];
    // Kopfzahl: letzter voller Tag (Tageswerte), Vergleich mit dem Tag davor
    const tage = epic.tag ? volleTage(epic.tag) : [];
    const tagReihe = epic.tag ? k.reihe(epic.tag) : [];
    const wert = tage.length ? wertBei(tagReihe, tage.at(-1)!) : null;
    const vorher = tage.length > 1 ? wertBei(tagReihe, tage.at(-2)!) : null;
    const tw = tagReihe.filter((p) => tage.includes(p.t));
    let woche: number | null = null;
    if (tw.length >= 2) {
      if (k.woche === 'summe') woche = tw.reduce((s, p) => s + p.v, 0);
      else if (k.woche === 'schnitt') woche = tw.reduce((s, p) => s + p.v, 0) / tw.length;
      else if (epic.tag) { const mp = epic.tag.minutesPlayed.filter((p) => tage.includes(p.t)).reduce((s, p) => s + p.v, 0); const pl = epic.tag.plays.filter((p) => tage.includes(p.t)).reduce((s, p) => s + p.v, 0); woche = pl ? mp / pl : null; }
    }
    return { ...k, punkte, wert, vorher, woche, wocheText: k.woche === 'summe' ? `${tw.length}-day total` : `${tw.length}-day average` };
  }).filter((k) => k.punkte.length > 1 || k.wert !== null);
  if (!karten.length) return null;
  return (
    <Abschnitt ueber="Engagement · Epic's Data API" titel="How people play it" rechts={wahl.length > 1 ? <Segment klein id="insel-engagement" wert={spanne} wahl={wahl.map((k) => ({ k, titel: k === '1D' ? '24 h' : '7 days' }))} onWahl={setZ} /> : undefined}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {karten.map((k, i) => {
          const d = k.wert !== null && k.vorher ? ((k.wert - k.vorher) / k.vorher) * 100 : null;
          return (
            <Flaeche key={k.k} className="p-5" verz={i * 0.03}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45"><span className="h-1.5 w-1.5 rounded-full" style={{ background: k.farbe }} />{k.titel}</p>
                  <p className="mt-1.5 flex items-baseline gap-2">
                    <span className="zahl text-3xl font-extrabold tracking-tight text-white">{k.wert === null ? '–' : k.format(k.wert)}</span>
                    {d !== null && Number.isFinite(d) && <span className={`zahl text-xs font-bold ${d >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>}
                  </p>
                  <p className="text-[11px] text-white/40">{k.wert === null ? k.text : 'last full day'}{d !== null ? ' · vs. day before' : ''}</p>
                </div>
                {k.woche !== null && <div className="shrink-0 text-right"><p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{k.wocheText}</p><p className="zahl text-sm font-bold text-white/80">{k.format(k.woche)}</p></div>}
              </div>
              <div className="mt-4 pb-5">
                <AnimatePresence mode="wait"><motion.div key={spanne + k.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Verlauf hoehe={120} format={k.format} serien={[{ name: k.titel, farbe: k.farbe, punkte: k.punkte }]} />
                </motion.div></AnimatePresence>
              </div>
              {k.nurTag && spanne === '1D' && <p className="-mt-1 text-[10px] text-white/30">Daily values – Epic has no hourly retention</p>}
            </Flaeche>
          );
        })}
      </div>
    </Abschnitt>
  );
}

/* ================================================================== Mehr */
function Mehr({ code, creator, istEpic, liste, reihen }: { code: string; creator: string; istEpic: boolean; liste: Eintrag[]; reihen: Reihe[] }) {
  const gruppen = useMemo(() => {
    const nach = new Map(liste.map((x) => [x.code, x]));
    const gesehen = new Set([code]);
    const aus: Array<{ titel: string; zu?: string; inseln: Eintrag[] }> = [];
    const von = liste.filter((x) => x.code !== code && (istEpic ? x.epic : !!creator && x.creator.toLowerCase() === creator.toLowerCase())).slice(0, 8);
    von.forEach((x) => gesehen.add(x.code));
    if (von.length) aus.push({ titel: istEpic ? "More of Epic's modes" : `More by @${creator}`, zu: istEpic ? '/community/players' : `/community/creators?c=${encodeURIComponent(creator)}`, inseln: von });
    // Jede Insel nur einmal auf der Seite (kein Thumbnail doppelt)
    for (const r of reihen) {
      if (aus.length >= 4) break;
      const l = r.codes.map((c) => nach.get(c)).filter((x): x is Eintrag => !!x && !gesehen.has(x.code)).slice(0, 8);
      if (l.length < 3) continue;
      l.forEach((x) => gesehen.add(x.code));
      aus.push({ titel: `More ${r.titel} maps`, inseln: l });
    }
    return aus;
  }, [liste, reihen, code, creator, istEpic]);
  if (!gruppen.length) return null;
  return (
    <div className="space-y-8 pt-2">
      {gruppen.map((g) => (
        <Abschnitt key={g.titel} titel={g.titel} zu={g.zu}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 2xl:grid-cols-8">{g.inseln.map((x, k) => <InselKarte key={x.code} e={x} klein verz={k * 0.03} />)}</div>
        </Abschnitt>
      ))}
    </div>
  );
}
