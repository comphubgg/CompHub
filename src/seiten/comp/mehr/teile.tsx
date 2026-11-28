import { motion } from 'framer-motion';
import { useEffect, useId, useMemo, useState } from 'react';

/*
 * Gemeinsame Bausteine der Scene-Seiten (Maps, Globals, Predictions, Awards, Scrims, POV, Posts, Orgs, Match, How it works): Laden (holen,
 * useDaten), Zeit und Zahlen, Flaggen, Hochkant-Fotos. Seit dem Design-System 3.0 (27.11.2026) nur noch Daten-Helfer und Kleinteile in den
 * Klassen des Systems (.chip, .eingabe, Akzentfarbe) - Flaechen, Koepfe und Karten kommen aus src/ds/Bausteine.tsx.
 * Daten immer ueber den Proxy (/api ...) von thecomphub.com.
 */

export const SEITE = 'https://www.thecomphub.com';

/* ---------------------------------------------------------------- Laden */

export type Stand<T> = { art: 'laedt' } | { art: 'ok'; d: T } | { art: 'anmelden' } | { art: 'fehler'; text: string };

/** JSON holen - 401/403 wird zu "anmelden", damit die Seite die Anmeldekarte zeigen kann. */
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
    <div className="flex items-center justify-center gap-3 py-16 text-white/40">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-akz" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function FehlerZeile({ text }: { text: string }) {
  return <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{text}</p>;
}

/** Runder Umschaltknopf (Filter) - die .chip-Klassen des Design-Systems. */
export const chip = (an: boolean) => `chip ${an ? 'chip-an' : ''}`;

/** Umschalter mit gleitender Pille (wie Segment aus dem Design-System) - rollt auf dem Handy waagerecht. */
export function Reiter<K extends string>({ liste, wert, setze, klein }: { liste: Array<[K, string]>; wert: K; setze: (k: K) => void; klein?: boolean }) {
  const id = useId();
  return (
    <div className="ohne-leiste max-w-full overflow-x-auto">
      <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
        {liste.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setze(k)}
            className={`relative shrink-0 whitespace-nowrap rounded-lg ${klein ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} font-semibold transition ${wert === k ? 'text-[#04050a]' : 'text-white/60 hover:text-white'}`}>
            {wert === k && <motion.span layoutId={`reiter-${id}`} className="absolute inset-0 rounded-lg bg-akz shadow-[0_6px_18px_-6px_rgb(var(--akz)/0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
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
      className={`eingabe w-full !py-2 sm:w-64 ${className}`} />
  );
}

/* ---------------------------------------------------------------- Zeit */

export function useJetzt(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
export const datumLang = (ms: number | string) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });
export const datumKurz = (ms: number | string) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/Brussels' });
/* ---------------------------------------------------------------- Flaggen */

const VORHANDEN = new Set(('ae al ar at au ba be bg bh br by ca ch cn co cz de dk ee eg es fi fr gb gr hr hu ie il in ir is it jp kr kw lb lt lv '
  + 'mc md mk mx ng nl no nz om pe pl pt ro rs ru sa se si sk sy tr ua us ve ye').split(' '));
export const GLOBUS = '/flags/flag-GLOBE.png';
export function flaggenPfad(land?: string | null) {
  // EN/WAL/SC (England, Wales, Schottland bei Epic) -> britische Flagge statt Globus
  const roh = land?.toLowerCase() ?? '';
  const k = ['en', 'eng', 'wal', 'sc', 'sco', 'nir'].includes(roh) ? 'gb' : /^[a-z]{2}$/.test(roh) ? roh : null;
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
            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-akz" initial={{ width: 0 }} animate={{ width: `${(l.n / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 + Math.min(i, 20) * 0.02 }} />
          </span>
          <span className="w-8 shrink-0 text-right font-bold tabular-nums text-white">{l.n}</span>
        </motion.li>
      ))}
    </ul>
  );
}

/** Hochkant-Foto eines Spielers (h-12 w-9) - Betreiber: Rechtecke nebeneinander, keine Kreise. Laedt das Bild nicht, steht dort nichts (kein Ersatzbild). */
export function Hochkant({ bild, klein }: { bild?: string | null; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  if (!bild || kaputt) return null;
  return <img src={bild} alt="" loading="lazy" onError={() => setKaputt(true)} className={`${klein ? 'h-10 w-[30px]' : 'h-12 w-9'} shrink-0 rounded-lg object-cover object-top ring-1 ring-white/10`} />;
}

/** Die Fotos eines Teams - nur wenn jeder Spieler eines hat (Betreiber-Regel). */
export function TeamFotos({ spieler, klein }: { spieler: Array<{ bild?: string | null }>; klein?: boolean }) {
  if (!spieler.length || spieler.some((s) => !s.bild)) return null;
  return <span className="flex shrink-0 gap-1">{spieler.map((s, i) => <Hochkant key={i} bild={s.bild} klein={klein} />)}</span>;
}
