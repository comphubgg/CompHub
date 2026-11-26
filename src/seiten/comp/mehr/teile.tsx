import { motion } from 'framer-motion';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Glas } from '../../../teile/Glas';

/*
 * Gemeinsame Bausteine der "More"-Seiten (Maps, Globals, Predictions, Awards, Scrims, POV, Posts, Orgs, Match, How it works).
 * Alles im Glas-Stil des Hubs; Daten immer ueber den Proxy (/api ...) von thecomphub.com.
 */

export const SEITE = 'https://www.thecomphub.com';

/* ---------------------------------------------------------------- Laden */

export type Stand<T> = { art: 'laedt' } | { art: 'ok'; d: T } | { art: 'anmelden' } | { art: 'fehler'; text: string };

/** JSON holen - 401/403 wird zu "anmelden", damit die Seite die Glas-Anmeldekarte zeigen kann. */
export async function holen<T>(url: string, init?: RequestInit): Promise<Stand<T>> {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'include', ...init });
    if (r.status === 401 || r.status === 403) return { art: 'anmelden' };
    const j = await r.json().catch(() => null);
    if (!r.ok) return { art: 'fehler', text: (j && (j.error || j.fehler)) || `Error ${r.status}` };
    return { art: 'ok', d: j as T };
  } catch {
    return { art: 'fehler', text: 'Could not reach thecomphub.com.' };
  }
}

/** Haken fuer eine Adresse; laedt neu, wenn sie sich aendert (und alle `takt` ms, falls gesetzt). */
export function useDaten<T>(url: string | null, takt = 0): [Stand<T>, () => void] {
  const [s, setS] = useState<Stand<T>>({ art: 'laedt' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    let weg = false;
    setS((alt) => (alt.art === 'ok' ? alt : { art: 'laedt' }));
    const los = () => holen<T>(url).then((x) => { if (!weg) setS((alt) => (x.art !== 'ok' && alt.art === 'ok' ? alt : x)); });
    void los();
    const i = takt ? setInterval(() => { if (document.visibilityState === 'visible') void los(); }, takt) : null;
    return () => { weg = true; if (i) clearInterval(i); };
  }, [url, takt, n]);
  return [s, () => setN((x) => x + 1)];
}

/* ---------------------------------------------------------------- Kleinteile */

export function Laedt({ text = 'Loading …' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-white/40">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-400" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function Leer({ text, kind }: { text: string; kind?: ReactNode }) {
  return (
    <Glas className="px-6 py-14 text-center">
      <p className="text-sm text-white/50">{text}</p>
      {kind}
    </Glas>
  );
}

export function FehlerZeile({ text }: { text: string }) {
  return <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{text}</p>;
}

/** Runder Umschaltknopf (Filter, Reiter). */
export const chip = (an: boolean) => `shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${an
  ? 'bg-sky-400 text-[#06080f] shadow shadow-sky-500/30' : 'border border-white/10 bg-white/[0.03] text-white/65 hover:border-sky-400/40 hover:text-white'}`;

/** Reiterleiste in einer Glas-Pille - scrollt auf dem Handy waagerecht. */
export function Reiter<K extends string>({ liste, wert, setze, klein }: { liste: Array<[K, string]>; wert: K; setze: (k: K) => void; klein?: boolean }) {
  const id = useId();
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1 backdrop-blur-xl">
        {liste.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setze(k)}
            className={`relative shrink-0 rounded-xl ${klein ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-semibold transition ${wert === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>
            {wert === k && <motion.span layoutId={`reiter-${id}`} className="absolute inset-0 rounded-xl bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Suche({ wert, setze, platz = 'Search …', className = '' }: { wert: string; setze: (s: string) => void; platz?: string; className?: string }) {
  return (
    <input value={wert} onChange={(e) => setze(e.target.value)} placeholder={platz}
      className={`w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-64 ${className}`} />
  );
}

/** Grosse Kennzahl in einer kleinen Glas-Kachel. */
export function Kennzahl({ wert, titel, farbe = '#38bdf8', verzoegerung = 0 }: { wert: ReactNode; titel: string; farbe?: string; verzoegerung?: number }) {
  return (
    <Glas className="px-5 py-4" verzoegerung={verzoegerung}>
      <p className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: farbe }}>{wert}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{titel}</p>
    </Glas>
  );
}

/** Kopf einer Unterseite: Ueberzeile, Titel, Text, rechts Platz fuer Kennzahlen/Knoepfe. */
export function SeitenKopf({ ueber, titel, text, rechts }: { ueber: string; titel: ReactNode; text?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">{ueber}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{titel}</h1>
        {text && <p className="mt-2 max-w-2xl text-white/55">{text}</p>}
      </motion.div>
      {rechts && <div className="flex flex-wrap items-center gap-3">{rechts}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Zeit */

export function useJetzt(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
/** Countdown - ab 24 h mit Tagen ("7d 2h 04m"). */
export function rest(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  const z = (n: number) => String(n).padStart(2, '0');
  if (d) return `${d}d ${h}h ${z(m)}m`;
  if (h) return `${h}h ${z(m)}m ${z(sek)}s`;
  return `${m}m ${z(sek)}s`;
}
export const datumLang = (ms: number | string) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });
export const datumKurz = (ms: number | string) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/Brussels' });
export const uhrzeit = (ms: number | string) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
export const zahl = (n: number | null | undefined, stellen = 0) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('en', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) : '—');
export const geld = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en')}` : '—');

/* ---------------------------------------------------------------- Flaggen */

const VORHANDEN = new Set(('ae al ar at au ba be bg bh br by ca ch cn co cz de dk ee eg es fi fr gb gr hr hu ie il in ir is it jp kr kw lb lt lv '
  + 'mc md mk mx ng nl no nz om pe pl pt ro rs ru sa se si sk sy tr ua us ve ye').split(' '));
export const GLOBUS = '/flags/flag-GLOBE.png';
export function flaggenPfad(land?: string | null) {
  const k = land && /^[A-Za-z]{2}$/.test(land) ? land.toLowerCase() : null;
  return k && VORHANDEN.has(k) ? `/flags/${k}.png` : GLOBUS;
}

let laenderNamen: Intl.DisplayNames | null = null;
export function landName(code?: string | null): string {
  if (!code) return 'Unknown';
  try { laenderNamen ??= new Intl.DisplayNames(['en'], { type: 'region' }); return laenderNamen.of(code.toUpperCase()) ?? code; } catch { return code; }
}

/** Eine runde Flagge je Team: bei Duos diagonal geteilt, bei Trios in drei Stuecken (wie auf der Seite). */
export function TeamFlagge({ laender, groesse = 26 }: { laender: Array<string | null | undefined>; groesse?: number }) {
  const eigen = useId().replace(/[^a-zA-Z0-9]/g, '');
  const alle = (laender.length ? laender : [undefined]).map(flaggenPfad);
  const pfade = alle.length > 1 && alle.every((f) => f === alle[0]) ? [alle[0]] : alle.slice(0, 3);
  // Ein Land: ganze Flaeche; zwei: diagonal geteilt; drei: oben ein Keil, links unten, rechts unten.
  const drei = pfade.length === 1 ? ['M0 0H100V100H0Z'] : pfade.length === 2 ? ['M0 0H100L0 100Z', 'M100 0V100H0Z']
    : ['M50 50L0 0H100Z', 'M50 50L0 0V100H50Z', 'M50 50L100 0V100H50Z'];
  return (
    <svg viewBox="0 0 100 100" width={groesse} height={groesse} className="shrink-0 rounded-full ring-1 ring-white/20" aria-hidden>
      <defs>
        <clipPath id={`k${eigen}`}><circle cx="50" cy="50" r="50" /></clipPath>
        {drei.map((d, i) => <clipPath key={d} id={`c${eigen}${i}`}><path d={d} /></clipPath>)}
      </defs>
      <g clipPath={`url(#k${eigen})`}>
        <rect width="100" height="100" fill="#1e293b" />
        {pfade.map((p, i) => (
          <g key={`${p}${i}`} clipPath={`url(#c${eigen}${i})`}><image href={p} x="-20" y="0" width="140" height="100" preserveAspectRatio="xMidYMid slice" /></g>
        ))}
      </g>
    </svg>
  );
}

/** Spieler nach Land - Flagge, Name, Balken, Zahl. */
export function LaenderListe({ spieler }: { spieler: Array<{ land?: string | null }> }) {
  const liste = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spieler) { const k = (s.land ?? '').toUpperCase(); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([code, n]) => ({ code, n, name: code ? landName(code) : 'Unknown' })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [spieler]);
  if (!liste.length) return <p className="text-sm text-white/45">No players yet.</p>;
  const max = liste[0].n || 1;
  return (
    <ul className="space-y-2">
      {liste.map((l, i) => (
        <motion.li key={l.code || 'x'} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }} className="flex items-center gap-3 text-sm">
          <span className="flex w-44 shrink-0 items-center gap-2"><TeamFlagge groesse={18} laender={[l.code || undefined]} /><span className="truncate text-white/80">{l.name}</span></span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-600 to-sky-400" initial={{ width: 0 }} animate={{ width: `${(l.n / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 + Math.min(i, 20) * 0.02 }} />
          </span>
          <span className="w-8 shrink-0 text-right font-bold tabular-nums text-white">{l.n}</span>
        </motion.li>
      ))}
    </ul>
  );
}

/** Hochkant-Foto eines Spielers (h-12 w-9) - Betreiber: Rechtecke nebeneinander, keine Kreise. */
export function Hochkant({ bild, klein }: { bild?: string | null; klein?: boolean }) {
  if (!bild) return null;
  return <img src={bild} alt="" loading="lazy" className={`${klein ? 'h-10 w-[30px]' : 'h-12 w-9'} shrink-0 rounded-lg object-cover object-top ring-1 ring-white/15`} />;
}

/** Die Fotos eines Teams - nur wenn jeder Spieler eines hat (Betreiber-Regel). */
export function TeamFotos({ spieler, klein }: { spieler: Array<{ bild?: string | null }>; klein?: boolean }) {
  if (!spieler.length || spieler.some((s) => !s.bild)) return null;
  return <span className="flex shrink-0 gap-1">{spieler.map((s, i) => <Hochkant key={i} bild={s.bild} klein={klein} />)}</span>;
}

/** Podest-/Fotokarte wie in den Rankings: verschwommener Hintergrund, rechts das Foto in 4:5 ungeschnitten. */
export function FotoKarte({ bild, kopf, kind, farbe = '#38bdf8', hoehe = 'h-[300px]', href }: {
  bild?: string | null; kopf?: ReactNode; kind: ReactNode; farbe?: string; hoehe?: string; href?: string;
}) {
  const Wurzel = href ? motion.a : motion.div;
  return (
    <Wurzel href={href} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -5 }}
      className={`group relative block overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18] ${hoehe}`}>
      {bild && <>
        <img src={bild} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" />
        <img src={bild} alt="" className="absolute inset-y-0 right-0 aspect-[4/5] h-full object-cover object-top transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0e18] from-30% via-[#0a0e18]/70 via-50% to-transparent to-75%" />
      </>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/85 via-transparent to-transparent" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: farbe }} />
      {kopf}
      <div className="absolute inset-x-0 bottom-0 p-5">{kind}</div>
    </Wurzel>
  );
}
