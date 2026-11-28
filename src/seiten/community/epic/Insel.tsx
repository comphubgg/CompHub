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
 *   Player count  jetzt (Discover / Epic), Spitze 24 h und 7 Tage, Durchschnitt; Verlauf 1H (10-Minuten-Werte), 1D, 1W (Stundenwerte)
 *   Stundentabelle Spitze, Zuwachs, Durchschnitt (= minutesPlayed / 60), einzelne Spieler und Plays je Stunde
 *   Discover      in welchen Reihen die Insel gerade steht und an welcher Stelle (fn-entdecken?reihen=1) - nur "jetzt", keine Historie
 *   Vergleich     gegen die anderen Inseln derselben Genre-Reihe (Epic-Tageswerte jeder Insel, letzter voller Tag)
 *   Engagement    Unique players, Plays, Favoriten, Empfehlungen, Spielzeit, Session, Retention Tag 1 / Tag 7 - je ein kleines Diagramm
 *   Mehr          mehr vom selben Creator, mehr aus denselben Discover-Reihen (Thumbnails, keine Insel doppelt)
 *
 * Epic bewahrt nur sieben Tage auf (Fortnite Data API) - darum gibt es kein "All time" und keine Monatsansicht. Plattform-Anteile, die
 * Discover-Historie und geschaetzte Einnahmen gibt es oeffentlich nicht (Epic nennt keine Rate je Minute) - sie fehlen bewusst.
 */

const TAG = 864e5;
const STUNDE = 36e5;
const istInselCode = (c: string) => /^\d{4}-\d{4}-\d{4}$/.test(c);
const prozent = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
const minuten = (v: number) => `${v.toFixed(1)} min`;
const stunden = (v: number) => `${kurz(v)} h`;
const zeitStunde = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
type Spanne = '1H' | '1D' | '1W';

export function InselDetail() {
  const { code: roh = '' } = useParams();
  const code = decodeURIComponent(roh);
  const r = useRangliste();
  const info = useInselInfos([code])(code) as (InselInfo & { bildGross?: string | null }) | null;
  const epic = useEpic(code);
  const seite = useSeitenVerlauf(code);
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
      <Spielerzahl code={code} e={e} epic={epic} seite={seite} istEpic={istEpic} />
      {tabelle ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <Stundentabelle epic={epic} seite={seite} />
          <div className="space-y-6">
            <DiscoverKarte reihen={meineReihen} geladen={reihen !== undefined} platz={platz} />
            <Herkunft epic={epic} istEpic={istEpic} seite={seite} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <DiscoverKarte reihen={meineReihen} geladen={reihen !== undefined} platz={platz} />
          <Herkunft epic={epic} istEpic={istEpic} seite={seite} />
        </div>
      )}
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
function Spielerzahl({ code, e, epic, seite, istEpic }: { code: string; e: Eintrag | null; epic: EpicStand; seite: Punkt[] | undefined; istEpic: boolean }) {
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
  const wahl = (['1H', '1D', '1W'] as Spanne[]).filter((k) => reihen[k]);
  const [z, setZ] = useState<Spanne>('1D');
  useEffect(() => { if (wahl.length && !wahl.includes(z)) setZ(wahl.includes('1D') ? '1D' : wahl[0]); }, [wahl.join(','), z]); // eslint-disable-line react-hooks/exhaustive-deps
  const aktiv = reihen[z] ?? reihen[wahl[0]];

  const nun = e?.spieler ?? (epic.min ? aktuell(epic.min) : null) ?? (epic.std ? aktuell(epic.std) : null);
  const max = (l: Punkt[]) => (l.length ? Math.max(...l.map((p) => p.v)) : null);
  const spitze24 = [max(d1min), max(d1std), max(d1site), nun].reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
  const spitze7 = [max(std), max(site), spitze24].reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
  const hatWoche = spanneVon(std) > 30 * STUNDE || spanneVon(site) > 30 * STUNDE;
  const min24 = (epic.std?.minutesPlayed ?? []).filter((p) => p.t >= jetzt - TAG);
  const schnitt = min24.length >= 12 ? min24.reduce((s, p) => s + p.v, 0) / (min24.length * 60) : null;
  const laedt = epic.min === undefined || epic.std === undefined || seite === undefined;

  return (
    <Flaeche className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 border-b border-white/[0.07] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div>
            <p className="ueber flex items-center gap-2">{nun ? <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span> : null}Player count</p>
            <p className="titel mt-2 text-7xl leading-none text-white sm:text-8xl">{nun ? <Zaehler wert={nun} /> : '–'}</p>
            <p className="mt-1 text-xs text-white/50">{nun ? 'playing right now' : laedt ? 'asking Epic …' : epic.fehler === 0 ? "no live number – Epic's Data API isn't answering" : epic.fehler === 404 ? 'not on Discover right now' : 'fewer than 5 players right now (Epic hides smaller numbers)'}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-5">
            {spitze24 !== null && <Zahl label="Peak · 24 h" wert={spitze24} ton="text-akz" />}
            {spitze7 !== null && (hatWoche || spitze7 !== spitze24) && <Zahl label={hatWoche ? 'Peak · 7 days' : 'Peak · recorded'} wert={spitze7} ton="text-violet-300" unter={hatWoche ? 'Epic keeps 7 days' : undefined} />}
            {schnitt !== null && <Zahl label="Avg players · 24 h" wert={schnitt} ton="text-white" unter="minutes played ÷ 1,440" />}
          </div>
        </div>
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="titel text-3xl">{z === '1H' ? 'Last hour' : z === '1W' ? 'Last 7 days' : 'Last 24 hours'}</h2>
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
function Zahl({ label, wert, ton, unter, format = kurz }: { label: string; wert: number | null; ton: string; unter?: string; format?: (n: number) => string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className={`titel mt-1 text-4xl leading-none ${ton}`}>{wert === null ? '–' : <Zaehler wert={wert} format={format} />}</p>
      {unter && <p className="mt-1 hidden text-[11px] text-white/35 sm:block">{unter}</p>}
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
function DiscoverKarte({ reihen, geladen, platz }: { reihen: Array<Reihe & { stelle: number; rang: number; genre: boolean }>; geladen: boolean; platz: number }) {
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
      {geladen && <p className="mt-3 text-[11px] text-white/35">Live from Fortnite's Discover rows – only today's placement, no history.</p>}
    </Flaeche>
  );
}

/** Woher die Zahlen kommen - eine kleine Karte statt Fussnoten unter jedem Teil. */
function Herkunft({ epic, istEpic, seite }: { epic: EpicStand; istEpic: boolean; seite: Punkt[] | undefined }) {
  const stand = epic.min?.stand ?? epic.std?.stand;
  const zeilen: Array<[string, string, string]> = [];
  if (epic.fehler === 0) zeilen.push(['bg-amber-300', "Epic's Data API isn't answering", 'Charts fall back to CompHub\'s own hourly Discover numbers.']);
  else if (epic.fehler === 404) zeilen.push(['bg-white/30', istEpic ? 'Epic mode' : 'Not in Epic\'s Data API', istEpic ? "Epic's public Data API has no stats for its own modes." : 'Epic only publishes stats for public, discoverable islands.']);
  else if (stand) zeilen.push(['bg-emerald-400', "Epic's Fortnite Data API", `Latest value ${zeitStunde(stand)} · 10-minute, hourly and daily values · kept for 7 days`]);
  if (seite?.length) zeilen.push(['bg-akz', "Fortnite's Discover", `Players right now and ${seite.length} hourly peaks recorded by CompHub`]);
  if (!zeilen.length) return null;
  return (
    <Flaeche className="space-y-3 p-5" verz={0.12}>
      {zeilen.map(([farbe, k, v]) => (
        <div key={k} className="flex gap-3"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${farbe}`} /><div><p className="text-sm font-semibold text-white/85">{k}</p><p className="text-xs text-white/45">{v}</p></div></div>
      ))}
    </Flaeche>
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
