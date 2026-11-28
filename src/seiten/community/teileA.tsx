import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { useJetzt } from '../../ds/Bausteine';

/*
 * Kleine Bausteine der neu gebauten Community-Seiten (Design-System 3.0, 27.11.2026): Uebersicht, Karte, Map Evolution, Rotation, Waffen,
 * Asset Studio und die Saison-Seiten teilen sich diese Teile. Alles in der Akzentfarbe des Bereichs (text-akz / bg-akz), nichts fest tuerkis.
 *   <Uhr>        Countdown als vier Bloecke in Bebas Neue (Tage / Stunden / Minuten / Sekunden), Ziffern rollen
 *   <Kipp>       Schalter (an/aus) mit Beschriftung
 *   <Regler>     Schieberegler mit Beschriftung und Wert
 *   <Kopieren>   "Copy link"-Knopf
 *   <Stand>      Fortschrittsleiste mit Beschriftung
 *   <Symbol>     Bild, das nie groesser als seine echte Groesse gezeigt wird; fehlt es, steht dort nichts (Betreiber: "Bild oder gar nichts")
 */

function Ziffer({ z }: { z: string }) {
  return (
    <span className="relative inline-block w-[0.5em] overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={z} initial={{ y: '-60%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '60%', opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="inline-block">{z}</motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Countdown in vier Bloecken. `gross`: Buehne (riesig), sonst Kartenmass. Der erste Block (Tage) traegt die Akzentfarbe. */
export function Uhr({ ziel, gross = false, className = '' }: { ziel: number; gross?: boolean; className?: string }) {
  const jetzt = useJetzt();
  const s = Math.max(0, Math.floor((ziel - jetzt) / 1000));
  const felder: Array<[string, number]> = [['Days', Math.floor(s / 86400)], ['Hours', Math.floor((s % 86400) / 3600)], ['Min', Math.floor((s % 3600) / 60)], ['Sec', s % 60]];
  return (
    <div className={`flex items-stretch ${gross ? 'gap-2 sm:gap-3' : 'gap-1.5'} ${className}`}>
      {felder.map(([k, v], i) => (
        <div key={k} className={`rounded-2xl border border-white/[0.07] bg-black/55 text-center backdrop-blur ${gross ? 'min-w-0 flex-1 px-1 py-3 sm:min-w-[6.5rem] sm:flex-none sm:px-5 sm:py-4' : 'min-w-[3.4rem] px-2.5 py-2'}`}>
          <p className={`zahl whitespace-nowrap font-titel leading-none tracking-wide ${i === 0 ? 'text-akz' : 'text-white'} ${gross ? 'text-5xl sm:text-7xl' : 'text-3xl'}`}>
            {String(v).padStart(2, '0').split('').map((z, j) => <Ziffer key={j} z={z} />)}
          </p>
          <p className={`font-semibold uppercase text-white/40 ${gross ? 'mt-1.5 text-[10px] tracking-[0.3em]' : 'mt-1 text-[9px] tracking-[0.22em]'}`}>{k}</p>
        </div>
      ))}
    </div>
  );
}

/** Schalter mit Beschriftung; `links` (z. B. ein Symbol) steht davor, `zahl` rechts vor dem Schalter. */
export function Kipp({ titel, an, umschalten, links, zahl, unter }: { titel: ReactNode; an: boolean; umschalten: () => void; links?: ReactNode; zahl?: ReactNode; unter?: ReactNode }) {
  return (
    <button type="button" onClick={umschalten} aria-pressed={an} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-white/[0.05]">
      {links}
      <span className="min-w-0 flex-1"><span className="block truncate text-white/85">{titel}</span>{unter && <span className="block truncate text-[11px] text-white/40">{unter}</span>}</span>
      {zahl !== undefined && <span className="zahl text-xs text-white/40">{zahl}</span>}
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${an ? 'bg-akz' : 'bg-white/10'}`}>
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 36 }} className={`absolute top-0.5 h-4 w-4 rounded-full ${an ? 'right-0.5 bg-[#04050a]' : 'left-0.5 bg-white/70'}`} />
      </span>
    </button>
  );
}

/** Schieberegler. Doppelklick setzt auf `start` zurueck (wenn angegeben). */
export function Regler({ titel, wert, min, max, schritt = 1, einheit = '', setzen, start, aus = false }: { titel: ReactNode; wert: number; min: number; max: number; schritt?: number; einheit?: string; setzen: (n: number) => void; start?: number; aus?: boolean }) {
  return (
    <label className="block px-2.5 py-1 text-xs text-white/60">
      <span className="flex items-baseline justify-between gap-2"><span>{titel}</span><span className="zahl font-semibold text-white/80">{wert}{einheit}</span></span>
      <input type="range" min={min} max={max} step={schritt} value={wert} disabled={aus} onChange={(e) => setzen(Number(e.target.value))} onDoubleClick={() => { if (start !== undefined) setzen(start); }}
        className="mt-1 w-full disabled:opacity-30" style={{ accentColor: 'rgb(var(--akz))' }} />
    </label>
  );
}

/** Adresse der Seite (oder `url`) in die Zwischenablage. */
export function Kopieren({ text = 'Copy link', url, klasse = 'knopf' }: { text?: string; url?: string | (() => string); klasse?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={klasse} onClick={() => { navigator.clipboard?.writeText(typeof url === 'function' ? url() : url ?? window.location.href).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => {}); }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
      {ok ? 'Copied' : text}
    </button>
  );
}

/** Fortschritt: Beschriftung links, Stand rechts, darunter die Leiste in der Akzentfarbe. */
export function Stand({ titel, hab, von, text }: { titel: ReactNode; hab: number; von: number; text?: ReactNode }) {
  const p = von ? Math.min(100, (hab / von) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs"><span className="font-semibold uppercase tracking-[0.2em] text-white/45">{titel}</span><span className="zahl font-bold text-white">{text ?? `${hab} / ${von}`}</span></div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-akz shadow-[0_0_12px_rgb(var(--akz)/0.7)]" initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} /></div>
    </div>
  );
}

/**
 * Freigestelltes Bild (Waffe, Gegenstand): passt sich in seinen Kasten ein, wird aber nie ueber seine echte Groesse hinaus vergroessert
 * (160-px-Symbole bleiben scharf). Laedt es nicht, bleibt der Platz leer - kein Fragezeichen, keine Buchstaben.
 */
export function Symbol({ src, alt = '', className = '', schatten = true }: { src?: string | null; alt?: string; className?: string; schatten?: boolean }) {
  const [kaputt, setKaputt] = useState<string | null>(null);
  const [mass, setMass] = useState<{ b: number; h: number } | null>(null);
  if (!src || kaputt === src) return <span className={`block ${className}`} aria-hidden />;
  return (
    <span className={`grid place-items-center ${className}`}>
      <img src={src} alt={alt} loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setKaputt(src)}
        onLoad={(e) => setMass({ b: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={mass ? { maxWidth: `min(100%, ${mass.b}px)`, maxHeight: `min(100%, ${mass.h}px)` } : { maxWidth: '100%', maxHeight: '100%' }}
        className={`object-contain ${schatten ? 'drop-shadow-[0_14px_22px_rgba(0,0,0,0.65)]' : ''}`} />
    </span>
  );
}
