import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/*
 * Bausteine des Design-Systems 3.0 (27.11.2026). Jede Seite des Hubs setzt sich aus diesen Teilen zusammen - die Klassen dazu (.fl, .knopf,
 * .chip, .eingabe, .tabelle, .ueber, .titel) stehen in src/index.css, die Farben (akz, grund, fl) in tailwind.config.js.
 *
 *   <SeitenKopf>   grosser Seitenanfang: Zeile darueber, Titel in Bebas Neue, Text, rechts Aktionen; optional mit Bild dahinter
 *   <Flaeche>      Karte, blendet beim Erscheinen ein
 *   <MedienKarte>  Bild oben, dunkler fester Teil unten (Betreiber: "das finde ich geil") - fuer alles mit Thumbnail
 *   <Abschnitt>    Ueberschrift eines Seitenteils mit Link rechts
 *   <Kennzahl>     grosse Zahl mit Beschriftung, zaehlt hoch
 *   <Segment>      Umschalter (z. B. 1H / 1D / 1W)
 *   <Bild>         <img>, das bei einem Ladefehler sauber auf einen Ersatz faellt (nie ein kaputtes Bild-Symbol)
 *   <Leer>         leerer Zustand in einem Satz
 */

const SANFT = [0.22, 1, 0.36, 1] as const;

/** Karte. `verz` staffelt das Einblenden (Sekunden), `klick` hebt sie beim Ueberfahren. */
export function Flaeche({ children, className = '', verz = 0, klick = false, fest = false }: { children?: ReactNode; className?: string; verz?: number; klick?: boolean; fest?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: verz, duration: 0.5, ease: SANFT }}
      className={`${fest ? 'fl-fest' : 'fl'} ${klick ? 'fl-klick' : ''} ${className}`}>
      {children}
    </motion.div>
  );
}

/**
 * Bild mit Ersatz: faellt das Bild aus (oder fehlt es), steht dort eine ruhige dunkle Flaeche - nie das kaputte-Bild-Symbol und NIE Buchstaben
 * (Betreiber, 27.11.2026: "diese Buchstaben ... das machen nur KIs. Profilbild oder gar nichts").
 */
export function Bild({ src, alt = '', className = '', lage }: { src?: string | null; alt?: string; className?: string; ersatz?: string; lage?: string }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [src]);
  if (!src || kaputt) return <div className={`bg-gradient-to-br from-akz/15 via-fl to-grund ${className}`} aria-hidden />;
  return <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setKaputt(true)} style={lage ? { objectPosition: lage } : undefined} className={`object-cover ${className}`} />;
}

/**
 * Bild oben (16:9, nichts wird abgeschnitten, was wichtig ist), darunter ein fester dunkler Teil mit Titel und Zeilen. `marke` steht oben links
 * auf dem Bild, `ecke` oben rechts (z. B. ein Countdown). Mit `zu` ist die ganze Karte ein Link.
 */
export function MedienKarte({ bild, titel, unter, marke, ecke, zu, children, verz = 0, format = 'aspect-video', lage, className = '' }: {
  bild?: string | null; titel: ReactNode; unter?: ReactNode; marke?: ReactNode; ecke?: ReactNode; zu?: string; children?: ReactNode; verz?: number; format?: string; lage?: string; className?: string;
}) {
  const innen = (
    <>
      <div className={`relative overflow-hidden ${format}`}>
        <Bild src={bild} ersatz={typeof titel === 'string' ? titel : undefined} lage={lage} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.06]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
        {marke && <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{marke}</div>}
        {ecke && <div className="absolute right-3 top-3">{ecke}</div>}
      </div>
      <div className="relative px-4 pb-4 pt-1">
        <p className="line-clamp-2 text-[15px] font-bold leading-snug text-white">{titel}</p>
        {unter && <p className="mt-0.5 truncate text-xs text-white/50">{unter}</p>}
        {children}
      </div>
    </>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: verz, duration: 0.5, ease: SANFT }}
      className={`fl-fest fl-klick group overflow-hidden ${className}`}>
      {zu ? <Link to={zu} className="block">{innen}</Link> : innen}
    </motion.div>
  );
}

/** Kleine Marke auf Bildern und in Listen (LIVE, Region, VIP ...). `ton`: akz | rot | gruen | still. */
export function Marke({ children, ton = 'still', puls = false }: { children: ReactNode; ton?: 'akz' | 'rot' | 'gruen' | 'gold' | 'still'; puls?: boolean }) {
  const farbe = { akz: 'bg-akz/20 text-akz ring-akz/40', rot: 'bg-red-500/20 text-red-300 ring-red-400/40', gruen: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40', gold: 'bg-amber-400/20 text-amber-200 ring-amber-300/40', still: 'bg-black/60 text-white/85 ring-white/10' }[ton];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 backdrop-blur ${farbe}`}>
      {puls && <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-70" /><span className="relative h-1.5 w-1.5 rounded-full bg-current" /></span>}
      {children}
    </span>
  );
}

/**
 * Seitenanfang. Ohne Bild: Zeile, grosser Titel, Text - links, Aktionen rechts. Mit `bild`: eine Buehne ueber die volle Breite, das Bild rechts
 * auslaufend hinter dem Text (kein leerer Raum, Betreiber: "links und rechts 10 Kilometer frei").
 */
export function SeitenKopf({ ueber, titel, text, rechts, bild, children, klein = false }: { ueber?: string; titel: ReactNode; text?: ReactNode; rechts?: ReactNode; bild?: string | null; children?: ReactNode; klein?: boolean }) {
  const kopf = (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: SANFT }} className="min-w-0">
        {ueber && <p className="ueber">{ueber}</p>}
        <h1 className={`titel mt-1 ${klein ? 'text-5xl' : 'text-6xl lg:text-7xl'}`}>{titel}</h1>
        {text && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">{text}</p>}
      </motion.div>
      {rechts && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex flex-wrap items-center gap-2">{rechts}</motion.div>}
    </div>
  );
  if (!bild) return <header className="mb-7">{kopf}{children && <div className="mt-5">{children}</div>}</header>;
  return (
    <header className="fl-fest relative isolate mb-7 overflow-hidden">
      <Bild src={bild} className="absolute inset-y-0 right-0 -z-10 h-full w-full lg:w-[62%]" />
      {/* unter lg liegt das Bild unter dem ganzen Text - dort staerker abdunkeln, sonst ist Text auf hellen Bannern (Globals) kaum lesbar */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl/90 via-fl/70 to-fl/40 lg:from-fl lg:via-fl/85 lg:to-fl/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-transparent to-transparent" />
      <div className="px-7 pb-7 pt-16 lg:px-10 lg:pt-24">{kopf}{children && <div className="mt-6">{children}</div>}</div>
    </header>
  );
}

/** Ueberschrift eines Seitenteils. */
export function Abschnitt({ titel, ueber, zu, zuText = 'See all', rechts, children, className = '' }: { titel: ReactNode; ueber?: string; zu?: string; zuText?: string; rechts?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" />
          <div>{ueber && <p className="ueber !tracking-[0.25em]">{ueber}</p>}<h2 className="titel text-3xl">{titel}</h2></div>
        </div>
        {rechts ?? (zu && <Link to={zu} className="knopf-leer">{zuText} <span aria-hidden>→</span></Link>)}
      </div>
      {children}
    </section>
  );
}

/** Zahl, die beim Erscheinen hochzaehlt. */
export function Zaehler({ wert, format = (n: number) => Math.round(n).toLocaleString('en'), className = '' }: { wert: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const sichtbar = useInView(ref, { once: true });
  const ruhig = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    if (!sichtbar || ruhig || !Number.isFinite(wert)) { el.textContent = Number.isFinite(wert) ? format(wert) : '–'; return undefined; }
    const lauf = animate(0, wert, { duration: 1.1, ease: 'easeOut', onUpdate: (v) => { el.textContent = format(v); } });
    return () => lauf.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert, sichtbar, ruhig]);
  return <span ref={ref} className={`zahl ${className}`}>{Number.isFinite(wert) ? format(wert) : '–'}</span>;
}

/** Grosse Kennzahl mit Beschriftung; `wert` als Zahl zaehlt hoch, als Text steht er einfach da. */
export function Kennzahl({ label, wert, format, unter, ton = 'weiss', className = '' }: { label: string; wert: number | string | null | undefined; format?: (n: number) => string; unter?: ReactNode; ton?: 'weiss' | 'akz' | 'gruen' | 'rot'; className?: string }) {
  const farbe = { weiss: 'text-white', akz: 'text-akz', gruen: 'text-emerald-300', rot: 'text-red-300' }[ton];
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{label}</p>
      <p className={`mt-0.5 text-3xl font-extrabold leading-none tracking-tight ${farbe}`}>
        {typeof wert === 'number' ? <Zaehler wert={wert} format={format} /> : <span className="zahl">{wert ?? '–'}</span>}
      </p>
      {unter && <p className="mt-1 text-xs text-white/45">{unter}</p>}
    </div>
  );
}

/** Umschalter mit gleitender Pille. `id` muss je Umschalter auf einer Seite eindeutig sein. */
export function Segment<T extends string>({ id, wert, wahl, onWahl, klein = false }: { id: string; wert: T; wahl: Array<{ k: T; titel: ReactNode }>; onWahl: (k: T) => void; klein?: boolean }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
      {wahl.map((w) => (
        <button key={w.k} type="button" onClick={() => onWahl(w.k)} className={`relative rounded-lg font-semibold transition ${klein ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${wert === w.k ? 'text-[#04050a]' : 'text-white/60 hover:text-white'}`}>
          {wert === w.k && <motion.span layoutId={`segment-${id}`} className="absolute inset-0 rounded-lg bg-akz shadow-[0_6px_18px_-6px_rgb(var(--akz)/0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative">{w.titel}</span>
        </button>
      ))}
    </div>
  );
}

/** Leerer Zustand: ein Satz, optional ein Knopf - nie eine ganze "kommt bald"-Seite. */
export function Leer({ text, children }: { text: ReactNode; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">{text}{children && <div className="mt-3">{children}</div>}</div>;
}

/** Ladezustand, der nicht wie Daten aussieht. */
export function Laedt({ text = 'Loading' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-white/45">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-akz" />{text} …
    </div>
  );
}

/** Countdown in Worten: ab 24 Stunden mit Tagen (Betreiber: "anstatt 170 Stunden ... Days"). */
export function dauer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)); const t = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  if (t) return `${t}d ${h}h ${String(m).padStart(2, '0')}m`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`;
}

/** Tickt jede Sekunde - fuer Countdowns. */
export function useJetzt(ms = 1000): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
