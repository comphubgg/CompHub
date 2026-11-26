import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Glas } from '../../teile/Glas';

/*
 * Wiederkehrende Bausteine des Community-Bereichs (Spezifikation 26.11.2026, "einmal bauen, ueberall nutzen"): Zeit-Chips, Countdown mit
 * laufenden Ziffern, Modus-Umschalter (BR / Reload / Blitz / OG / Creative mit Build / Zero Build), Link kopieren, Zum Kalender hinzufuegen
 * und die ehrliche "Daten fehlen noch"-Karte. Eigenes Design im Teal des Bereichs.
 */

/* ---------------------------------------------- Zeit-Chips */
export const ZEITRAEUME = ['1H', '1D', '1W', '1M', '1Y', 'ALL'] as const;
export function ZeitChips({ wert, setzen, optionen = ZEITRAEUME as unknown as string[] }: { wert: string; setzen: (w: string) => void; optionen?: string[] }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5">
      {optionen.map((o) => (
        <button key={o} type="button" onClick={() => setzen(o)} className="relative rounded-lg px-3 py-1 text-xs font-bold tabular-nums transition">
          {wert === o && <motion.span layoutId="zeitchip" className="absolute inset-0 rounded-lg bg-teal-300/20 ring-1 ring-teal-300/40" />}
          <span className={`relative ${wert === o ? 'text-white' : 'text-white/45 hover:text-white'}`}>{o}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Countdown */
function Ziffer({ z }: { z: string }) {
  return (
    <span className="relative inline-block w-[0.62em] overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={z} initial={{ y: '-100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="inline-block">{z}</motion.span>
      </AnimatePresence>
    </span>
  );
}
export function useJetzt(ms = 1000) {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setJetzt(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return jetzt;
}
export function teile(rest: number) {
  const s = Math.max(0, Math.floor(rest / 1000));
  return { t: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
/** Kurz als Text - ab 24 h mit Tagen ("7d 2h 04m"), darunter mit Sekunden. */
export function restText(rest: number) {
  const { t, h, m, s } = teile(rest);
  if (rest <= 0) return 'now';
  if (t > 0) return `${t}d ${h}h ${String(m).padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function Countdown({ ziel, groesse = 'gross', farbe = '#5eead4' }: { ziel: number; groesse?: 'gross' | 'mittel'; farbe?: string }) {
  const jetzt = useJetzt();
  const { t, h, m, s } = teile(ziel - jetzt);
  const felder: Array<[string, number]> = [['days', t], ['hours', h], ['minutes', m], ['seconds', s]];
  const gross = groesse === 'gross';
  return (
    <div className={`flex items-start ${gross ? 'gap-3 md:gap-5' : 'gap-2'}`}>
      {felder.map(([k, v], i) => (
        <div key={k} className="flex items-start">
          <div className="text-center">
            <div className={`font-black tabular-nums tracking-tight ${gross ? 'text-6xl md:text-8xl' : 'text-3xl'}`} style={{ color: i === 0 ? farbe : 'white' }}>
              {String(v).padStart(2, '0').split('').map((z, j) => <Ziffer key={j} z={z} />)}
            </div>
            <p className={`mt-1 font-semibold uppercase tracking-[0.25em] text-white/40 ${gross ? 'text-[11px]' : 'text-[9px]'}`}>{k}</p>
          </div>
          {i < 3 && <span className={`font-black text-white/20 ${gross ? 'ml-3 text-6xl md:ml-5 md:text-8xl' : 'ml-2 text-3xl'}`}>:</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Modus-Umschalter */
export const MODI = [
  { k: 'br', titel: 'Battle Royale' }, { k: 'reload', titel: 'Reload' }, { k: 'blitz', titel: 'Blitz' }, { k: 'og', titel: 'OG' }, { k: 'creative', titel: 'Creative' },
];
export function ModusUmschalter({ modus, setzen, bauen, setBauen, ranked, setRanked, verfuegbar }: {
  modus: string; setzen: (m: string) => void; bauen?: 'build' | 'zb'; setBauen?: (b: 'build' | 'zb') => void;
  ranked?: boolean; setRanked?: (r: boolean) => void; verfuegbar?: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-black/30 p-1">
        {MODI.map((m) => {
          const da = !verfuegbar || verfuegbar.includes(m.k);
          return (
            <button key={m.k} type="button" disabled={!da} onClick={() => setzen(m.k)} title={da ? m.titel : `${m.titel} – no data yet`}
              className={`relative rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${da ? '' : 'cursor-not-allowed opacity-30'}`}>
              {modus === m.k && <motion.span layoutId="modus" className="absolute inset-0 rounded-xl bg-teal-300 shadow-[0_0_20px_rgba(45,212,191,0.35)]" />}
              <span className={`relative ${modus === m.k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{m.titel}</span>
            </button>
          );
        })}
      </div>
      {setRanked && <Zweier links="Casual" rechts="Ranked" rechtsAn={!!ranked} setzen={setRanked} />}
      {setBauen && <Zweier links="Build" rechts="Zero Build" rechtsAn={bauen === 'zb'} setzen={(r) => setBauen(r ? 'zb' : 'build')} />}
    </div>
  );
}
function Zweier({ links, rechts, rechtsAn, setzen }: { links: string; rechts: string; rechtsAn: boolean; setzen: (r: boolean) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
      {[[links, false], [rechts, true]].map(([t, r]) => (
        <button key={t as string} type="button" onClick={() => setzen(r as boolean)}
          className={`rounded-lg px-3 py-1 transition ${rechtsAn === r ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{t as string}</button>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Teilen */
export function LinkKopieren({ text = 'Copy link', url }: { text?: string; url?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(url ?? window.location.href).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => {}); }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-white/75 transition hover:border-teal-300/40 hover:text-white">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
      {ok ? 'Copied ✓' : text}
    </button>
  );
}

/** Termin als .ics-Datei (jeder Kalender) - und als Google-Kalender-Link. */
export function KalenderKnopf({ titel, start, ende, text = 'Add to calendar', beschreibung = '' }: { titel: string; start: number; ende?: number; text?: string; beschreibung?: string }) {
  const [offen, setOffen] = useState(false);
  const f = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const bis = ende ?? start + 60 * 60_000;
  function ics() {
    const inhalt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CompHub//Hub//EN', 'BEGIN:VEVENT', `UID:${start}-${titel.replace(/\W/g, '')}@thecomphub.com`,
      `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(start)}`, `DTEND:${f(bis)}`, `SUMMARY:${titel}`, `DESCRIPTION:${beschreibung}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([inhalt], { type: 'text/calendar' })); a.download = `${titel.replace(/[^\w]+/g, '-')}.ics`; a.click();
    setOffen(false);
  }
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titel)}&dates=${f(start)}/${f(bis)}&details=${encodeURIComponent(beschreibung)}`;
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOffen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-300 px-3.5 py-1.5 text-sm font-bold text-[#06080f] transition hover:bg-teal-200">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>{text}
      </button>
      <AnimatePresence>
        {offen && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] text-sm shadow-2xl">
            <button type="button" onClick={ics} className="block w-full px-3 py-2 text-left text-white/80 hover:bg-white/5">Apple / Outlook (.ics)</button>
            <a href={google} target="_blank" rel="noreferrer" onClick={() => setOffen(false)} className="block px-3 py-2 text-white/80 hover:bg-white/5">Google Calendar</a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------- Ehrlich: Daten fehlen noch */
export function DatenFehlen({ titel, text, braucht, kinder }: { titel: string; text: ReactNode; braucht?: string[]; kinder?: ReactNode }) {
  return (
    <Glas className="relative overflow-hidden border-teal-300/20 p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">Data pending</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">{titel}</h2>
      <div className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">{text}</div>
      {braucht && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {braucht.map((k) => <span key={k} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/50">{k}</span>)}
        </div>
      )}
      {kinder}
    </Glas>
  );
}

/** Kleines Ladefeld fuer JSON aus /hub-daten (Vite liefert fuer fehlende Dateien index.html - nur echtes JSON zaehlt). */
export function useHubDatei<T>(name: string): { daten: T | null; status: 'laedt' | 'fehlt' | 'da' } {
  const [z, setZ] = useState<{ daten: T | null; status: 'laedt' | 'fehlt' | 'da' }>({ daten: null, status: 'laedt' });
  useEffect(() => {
    let weg = false;
    fetch(`/hub-daten/${name}`, { cache: 'no-store' }).then((r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('fehlt');
      return r.json();
    }).then((j) => { if (!weg) setZ({ daten: j as T, status: 'da' }); }).catch(() => { if (!weg) setZ({ daten: null, status: 'fehlt' }); });
    return () => { weg = true; };
  }, [name]);
  return z;
}
