import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWer } from '../../teile/Anmeldung';
import { vorOrt } from './ov/ort';
import type { OverlayEintrag } from './ov/OverlayGeruest';
import type { Probe } from './ov/proben';
import { GRUPPEN, kurzZahl, vorschaubild, type Kanal } from './live';

/*
 * Gemeinsame Teile des Streamer-Bereichs (Design-System 3.0, 27.11.2026):
 *   <Kanalbild>     Twitch-Profilbild - laedt es nicht, steht dort NICHTS (Betreiber: "Profilbild oder gar nichts", keine Buchstaben)
 *   <StreamBild>    das 16:9-Vorschaubild eines laufenden Streams mit LIVE-Marke und Zuschauern
 *   <StreamKarte>   Karte eines laufenden Streams: Bild oben, fester dunkler Teil unten
 *   <ProbeBuehne>   ein Overlay auf einer Stream-Flaeche, auf die Breite des Kastens gebracht (zugeschnitten auf das Overlay)
 *   <StufenMarke>   Free / VIP - VIP ist Gold (Bedeutungsfarbe), die Bereichsfarbe bleibt Violett
 *   <Zeichen>       die Linien-Symbole der Werkzeuge
 *   <Kopieren>      Knopf, der einen Text kopiert und es kurz bestaetigt
 */

/** Twitch-Profilbild. Ohne Bild (oder wenn es nicht laedt) wird nichts gezeichnet - der Platz bleibt nur, wenn `platz` gesetzt ist. */
export function Kanalbild({ src, className = 'h-10 w-10 rounded-xl', platz = false }: { src?: string | null; className?: string; platz?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [src]);
  if (!src || kaputt) return platz ? <span className={`shrink-0 ${className}`} aria-hidden /> : null;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setKaputt(true)} className={`shrink-0 object-cover ${className}`} />;
}

/** Zuschauerzahl als kleine Pille auf einem Bild. */
export function Zuschauer({ n }: { n: number }) {
  return (
    <span className="zahl inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/10 backdrop-blur">
      <svg viewBox="0 0 20 20" className="h-3 w-3 text-white/60" fill="currentColor"><path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-7 7a7 7 0 0 1 14 0z" /></svg>
      {kurzZahl(n)}
    </span>
  );
}

export function LiveMarke({ klein = false }: { klein?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-red-600 font-extrabold uppercase tracking-[0.16em] text-white shadow-[0_6px_18px_-6px_rgba(220,38,38,0.9)] ${klein ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
      <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-70" /><span className="relative h-1.5 w-1.5 rounded-full bg-white" /></span>
      Live
    </span>
  );
}

/**
 * Das Vorschaubild eines laufenden Streams. Laedt Twitchs Bild nicht (Kanal gerade offline gegangen, Netz), bleibt die ruhige dunkle Flaeche -
 * Marke und Zuschauer stehen trotzdem.
 */
export function StreamBild({ k, takt, gross = false, className = '', children }: { k: Kanal; takt: number; gross?: boolean; className?: string; children?: ReactNode }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [k.login]);
  return (
    <div className={`relative aspect-video overflow-hidden bg-black ${className}`}>
      {!kaputt
        ? <img src={vorschaubild(k.login, takt, gross ? 1280 : 640, gross ? 720 : 360)} alt="" loading="lazy" draggable={false} onError={() => setKaputt(true)}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" />
        : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_120%,rgb(var(--akz)/0.28),transparent_60%),linear-gradient(180deg,#141722,#07080d)]" aria-hidden />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute left-3 top-3"><LiveMarke klein={!gross} /></div>
      <div className="absolute right-3 top-3"><Zuschauer n={k.viewers} /></div>
      {children}
    </div>
  );
}

/** Karte eines laufenden Streams (Bild oben 16:9, fester dunkler Teil unten). `unten` sind die Knoepfe der Seite, `aufBild` liegt auf dem Bild. */
export function StreamKarte({ k, takt, an = false, onBild, aufBild, unten, titelBild = 'Open on Twitch' }: {
  k: Kanal; takt: number; an?: boolean; onBild?: () => void; aufBild?: ReactNode; unten?: ReactNode; titelBild?: string;
}) {
  const bild = <StreamBild k={k} takt={takt}>{aufBild}</StreamBild>;
  return (
    <article className={`fl-fest fl-klick group flex h-full flex-col overflow-hidden ${an ? '!border-akz/60 shadow-[0_0_34px_-12px_rgb(var(--akz)/0.9)]' : ''}`}>
      {onBild
        ? <button type="button" onClick={onBild} title={titelBild} className="block w-full text-left">{bild}</button>
        : <a href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" title={titelBild} className="block">{bild}</a>}
      <div className="flex flex-1 items-start gap-3 px-4 pb-4 pt-3">
        <Kanalbild src={k.bild} className="h-10 w-10 rounded-xl ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" className="truncate text-[15px] font-bold text-white transition hover:text-akz">{k.anzeige || k.login}</a>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{GRUPPEN[k.gruppe] ?? k.gruppe}</span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-white/50" title={k.title}>{k.title || 'Live on Twitch'}</p>
        </div>
        {unten}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ Overlays */

/** Die Stream-Flaeche hinter einem Overlay: dunkel mit einem Hauch der Bereichsfarbe und feinem Raster - sieht nach Bild aus, ohne ein Foto vorzutaeuschen. */
export const FLAECHE: React.CSSProperties = {
  backgroundColor: '#0b0d14',
  backgroundImage:
    'radial-gradient(ellipse at 20% 120%, rgb(var(--akz) / 0.22), transparent 55%),'
    + 'radial-gradient(ellipse at 90% -20%, rgba(56,189,248,.12), transparent 50%),'
    + 'linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),'
    + 'linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)',
  backgroundSize: 'auto, auto, 32px 32px, 32px 32px',
};

/**
 * Ein Overlay in einem Kasten fester Form: die echte Overlay-Datei laeuft in einem Rahmen, zugeschnitten auf das Overlay und so gross, wie der
 * Kasten es zulaesst (hoechstens `maxMass`-fach). Das Overlay meldet seine Groesse selbst (gleiche Herkunft ueber den Proxy) - bis dahin gilt `aus`.
 */
export function ProbeBuehne({ probe, titel, maxMass = 1.6, className = 'aspect-video', nackt = false }: { probe: Probe | null; titel: string; maxMass?: number; className?: string; nackt?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const rahmen = useRef<HTMLIFrameElement | null>(null);
  const [platz, setPlatz] = useState({ b: 0, h: 0 });
  const [g, setG] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Das Overlay laeuft nur, solange der Kasten im Bild (oder knapp davor) ist - eine Seite mit vielen Vorschauen haelt so nur wenige Rahmen am Leben
  const [nah, setNah] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const messen = () => setPlatz({ b: el.clientWidth, h: el.clientHeight });
    messen();
    const ro = new ResizeObserver(messen); ro.observe(el);
    const io = new IntersectionObserver((e) => setNah(e[e.length - 1].isIntersecting), { rootMargin: '500px 0px' }); io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  useEffect(() => {
    const an = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== rahmen.current?.contentWindow) return;
      const d = e.data as { comphub?: string; x?: number; y?: number; w?: number; h?: number };
      if (d?.comphub !== 'overlay-groesse' || !d.w || !d.h) return;
      setG((alt) => (alt && alt.w === d.w && alt.h === d.h && alt.x === (d.x ?? 0) && alt.y === (d.y ?? 0) ? alt : { x: d.x ?? 0, y: d.y ?? 0, w: d.w!, h: d.h! }));
    };
    window.addEventListener('message', an);
    return () => window.removeEventListener('message', an);
  }, []);
  useEffect(() => setG(null), [probe?.src]);
  const rand = 16;
  const aus = g ? { x: Math.max(0, g.x - rand), y: Math.max(0, g.y - rand), w: g.w + 2 * rand, h: g.h + 2 * rand } : probe?.aus ?? { x: 0, y: 0, w: 1920, h: 1080 };
  const mass = platz.b ? Math.min(maxMass, (platz.b * 0.9) / aus.w, (platz.h * 0.86) / aus.h) : 0;
  return (
    <div ref={box} className={`relative flex items-center justify-center overflow-hidden ${className}`} style={nackt ? undefined : FLAECHE}>
      {probe && nah && mass > 0 && (
        <div className="relative overflow-hidden" style={{ width: aus.w * mass, height: aus.h * mass }}>
          <iframe ref={rahmen} title={titel} src={vorOrt(probe.src)} scrolling="no" tabIndex={-1} loading="lazy"
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: probe.b, height: probe.h, transform: `scale(${mass}) translate(${-aus.x}px, ${-aus.y}px)`, background: 'transparent' }} />
        </div>
      )}
    </div>
  );
}

/** Die eigenen gespeicherten Overlays aller Arten - eine Anfrage (GET /api/overlay-config?meine=1). null = laedt. */
export function useMeineOverlays(an: boolean): OverlayEintrag[] | null {
  const { wer } = useWer();
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  useEffect(() => {
    if (!an) { setListe([]); return; }
    let weg = false;
    fetch('/api/overlay-config?meine=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { overlays: [] }))
      .then((j) => { if (!weg) setListe(j.overlays ?? []); }).catch(() => { if (!weg) setListe([]); });
    return () => { weg = true; };
  }, [an, wer?.userName]);
  return liste;
}

/* ------------------------------------------------------------------ Kleinteile */

/** Free oder VIP. VIP ist Gold (Bedeutungsfarbe); `zu` zeigt das Schloss fuer ein Werkzeug, das dieses Konto noch nicht hat. */
export function StufenMarke({ vip, zu = false }: { vip: boolean; zu?: boolean }) {
  if (!vip) return <span className="inline-flex items-center rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 ring-1 ring-white/10">Free</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] ring-1 ${zu ? 'bg-amber-400/10 text-amber-200/80 ring-amber-300/25' : 'bg-amber-400 text-black ring-amber-300'}`}>
      {zu && <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>}
      VIP
    </span>
  );
}

const PFADE: Record<string, string> = {
  wand: 'M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z',
  overlay: 'M3 5h18v14H3zM6 8h6v3H6zM14 14h4',
  bot: 'M12 3v3M7 6h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM9 12h.01M15 12h.01M9 16h6',
  kurve: 'M3 19h18M5 15l4-5 4 3 6-8',
  seite: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  finder: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5M11 8v6M8 11h6',
  replay: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M10 9l5 3-5 3z',
  pov: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  pokal: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  schluessel: 'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 11v9M12 16h3M12 20h3',
  archiv: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  uhr: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  pfeil: 'M5 12h14M13 6l6 6-6 6',
  schloss: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  haken: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  auge: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  kopie: 'M9 9h11v11H9zM5 15H4V4h11v1',
  aussen: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};
/** Linien-Symbol eines Werkzeugs. */
export function Zeichen({ name, className = 'h-5 w-5' }: { name: keyof typeof PFADE | string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PFADE[name] ?? PFADE.pfeil} /></svg>;
}

/** Kopieren mit kurzer Bestaetigung. */
export function Kopieren({ wert, text = 'Copy OBS URL', className = 'knopf', klein = false }: { wert: string; text?: string; className?: string; klein?: boolean }) {
  const [ok, setOk] = useState(false);
  const los = async () => { try { await navigator.clipboard.writeText(wert); setOk(true); window.setTimeout(() => setOk(false), 1600); } catch { /* dann von Hand */ } };
  return (
    <button type="button" onClick={() => void los()} title={wert} className={`${className} ${klein ? '!px-3 !py-1.5 !text-xs' : ''} ${ok ? '!border-emerald-400/50 !text-emerald-300' : ''}`}>
      <Zeichen name={ok ? 'haken' : 'kopie'} className="h-4 w-4" />{ok ? 'Copied' : text}
    </button>
  );
}
