import { vorOrt } from './ort';
import { OV } from './ort';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import T from './T';
import { useT } from './sprache';

/*
 * Building blocks of the redesigned overlay pages (11/2026).
 *
 * The operator: "die komplette Overlay-Seite neu und cleaner und besser
 * erklaert". These pieces are shared by the overview and the configurators so
 * every page speaks the same visual language: a 16:9 stage that shows the
 * overlay exactly as OBS will (1920 x 1080, scaled down), a copy field, the
 * three steps in OBS and a few calm form controls.
 */

/** Checkerboard: an overlay is transparent - this shows where. */
export const KARO: React.CSSProperties = {
  backgroundColor: '#0d1017',
  backgroundImage:
    'linear-gradient(45deg,#161b25 25%,transparent 25%),'
    + 'linear-gradient(-45deg,#161b25 25%,transparent 25%),'
    + 'linear-gradient(45deg,transparent 75%,#161b25 75%),'
    + 'linear-gradient(-45deg,transparent 75%,#161b25 75%)',
  backgroundSize: '22px 22px',
  backgroundPosition: '0 0,0 11px,11px -11px,-11px 0',
};

/**
 * A 1920 x 1080 stage scaled to the width of its box - the overlay at the
 * exact size and position it will have in OBS.
 *
 * @param szene a dim gameplay-like backdrop instead of the checkerboard
 * @param breite / hoehe a smaller stage (e.g. 960 x 540) shows corner overlays larger
 */
export interface OverlayGroesse { x: number; y: number; w: number; h: number }

/** Room around the overlay for its shadow - part of the recommended OBS size. */
const RAND_SCHATTEN = 16;

/**
 * The OBS browser-source size for an overlay of this size and place.
 * In the top-left corner: just its own box (plus shadow room). Placed
 * elsewhere on the canvas (centred, bottom ...): the full 1920 x 1080.
 */
export function obsGroesse(g: OverlayGroesse | null): { b: number; h: number; voll: boolean } {
  if (!g) return { b: 1920, h: 1080, voll: true };
  if (g.x > 120 || g.y > 120) return { b: 1920, h: 1080, voll: true };
  const rund = (n: number) => Math.min(1920, Math.ceil(n / 10) * 10);
  return { b: rund(g.x + g.w + RAND_SCHATTEN), h: rund(g.y + g.h + RAND_SCHATTEN), voll: false };
}

/**
 * The overlay preview, cropped to the overlay itself.
 *
 * The overlay page reports where its box sits and how big it is
 * (look.js groesseMelden). Until then - or for overlays that do not report -
 * the whole canvas is shown, scaled to the width. Operator, 11/2026: "show
 * only the overlay itself at the size it needs", not a 1920 x 1080 canvas.
 */
export function Buehne({ src, titel = 'Preview', szene = false, breite = 1920, hoehe = 1080, onFrame, kopf, onGroesse, ersatz, maxMass = 1 }: {
  src: string;
  titel?: string;
  szene?: boolean;
  breite?: number;
  hoehe?: number;
  onFrame?: (f: HTMLIFrameElement | null) => void;
  kopf?: ReactNode;
  /** Called with the overlay's box on the canvas, whenever it changes. */
  onGroesse?: (g: OverlayGroesse) => void;
  /**
   * Hub: der Ausschnitt, solange das Overlay seine Groesse nicht meldet. Es liegt auf thecomphub.com und darf localhost nichts schicken
   * (look.js schickt nur an die eigene Herkunft) - ohne Angabe zeigt die Buehne dann die ganze Flaeche, so wie OBS sie sieht.
   */
  ersatz?: OverlayGroesse;
  /** Hub-Uebersicht: kleine Overlays duerfen groesser als echt erscheinen (HTML bleibt scharf). */
  maxMass?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rahmen = useRef<HTMLIFrameElement | null>(null);
  const [platz, setPlatz] = useState(600);
  const [g, setG] = useState<OverlayGroesse | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const messen = () => setPlatz(el.clientWidth);
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const an = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== rahmen.current?.contentWindow) return;
      const d = e.data as { comphub?: string } & Partial<OverlayGroesse>;
      if (d?.comphub !== 'overlay-groesse' || !d.w || !d.h) return;
      const neu = { x: d.x ?? 0, y: d.y ?? 0, w: d.w, h: d.h };
      setG((alt) => (alt && alt.x === neu.x && alt.y === neu.y && alt.w === neu.w && alt.h === neu.h ? alt : neu));
      onGroesse?.(neu);
    };
    window.addEventListener('message', an);
    return () => window.removeEventListener('message', an);
  }, [onGroesse]);

  // The crop: the overlay's box plus a little room for its shadow.
  const aus = g
    ? { x: Math.max(0, g.x - RAND_SCHATTEN), y: Math.max(0, g.y - RAND_SCHATTEN), w: g.w + 2 * RAND_SCHATTEN, h: g.h + 2 * RAND_SCHATTEN }
    : ersatz ?? { x: 0, y: 0, w: breite, h: hoehe };
  // Never larger than real size: a 400 px overlay stays 400 px wide.
  const mass = Math.min(maxMass, platz / aus.w);
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0e14] shadow-[0_20px_60px_-30px_rgba(0,0,0,.8)]">
      {kopf && <figcaption className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] text-white/55">{kopf}</figcaption>}
      <div ref={box} className="flex w-full justify-center" style={szene ? SZENE : KARO}>
        <div className="relative overflow-hidden" style={{ width: aus.w * mass, height: aus.h * mass }}>
          <iframe ref={(f) => { rahmen.current = f; onFrame?.(f); }} title={titel} src={vorOrt(src)} scrolling="no" tabIndex={-1}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: breite, height: hoehe, transform: `scale(${mass}) translate(${-aus.x}px, ${-aus.y}px)`, background: 'transparent' }} />
        </div>
      </div>
    </figure>
  );
}

/** A calm stand-in for gameplay behind the preview. */
const SZENE: React.CSSProperties = {
  backgroundColor: '#1a2233',
  backgroundImage:
    'radial-gradient(ellipse at 30% 110%, rgba(56,189,248,.20), transparent 55%),'
    + 'radial-gradient(ellipse at 80% -10%, rgba(129,140,248,.22), transparent 50%),'
    + 'linear-gradient(180deg,#273349 0%,#151b27 100%)',
};

/** Copy a text with feedback. */
export function KopierFeld({ wert, knopf = 'Copy OBS URL', klein = false }: { wert: string; knopf?: string; klein?: boolean }) {
  const t = useT();
  const [ok, setOk] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(wert);
      setOk(true);
      window.setTimeout(() => setOk(false), 1600);
    } catch { /* select by hand */ }
  };
  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <input readOnly value={wert} onFocus={(e) => e.currentTarget.select()}
        className={`min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 font-mono text-white/70 outline-none focus:border-violet-400/60 ${klein ? 'py-1.5 text-[11px]' : 'py-2 text-xs'}`} />
      <button type="button" onClick={kopieren}
        className={`shrink-0 rounded-lg font-bold transition ${ok ? 'bg-violet-300 text-[#06080f]' : 'bg-violet-500 text-white hover:bg-violet-400'} ${klein ? 'px-3 text-[11px]' : 'px-4 text-xs'}`}>
        {ok ? t('Copied') : t(knopf)}
      </button>
    </div>
  );
}

/** The three steps in OBS, with the recommended size of this overlay. */
export function ObsSchritte({ breite, hoehe, kompakt = false }: { breite: number; hoehe: number; kompakt?: boolean }) {
  const schritte: Array<[string, ReactNode]> = [
    ['Add a Browser source', <T key="a">In OBS, click + under Sources and pick “Browser”. Give it a name.</T>],
    ['Paste the URL and size', <span key="b"><T>Paste the copied URL. Set width and height to</T> <b className="font-mono text-white/85">{breite} × {hoehe}</b>.</span>],
    ['Leave it, don’t stretch it', <T key="c">Keep the background transparent and don’t scale the source in the scene — move it instead. Changes you make here appear within seconds.</T>],
  ];
  return (
    <ol className={`grid gap-3 ${kompakt ? '' : 'sm:grid-cols-3'}`}>
      {schritte.map(([titel, text], i) => (
        <li key={titel} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/15 font-mono text-xs font-bold text-violet-300">{i + 1}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white"><T>{titel}</T></span>
            <span className="mt-0.5 block text-xs leading-relaxed text-white/55">{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A titled group of controls. */
export function Gruppe({ titel, text, children, rechts }: { titel: string; text?: string; children: ReactNode; rechts?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-white"><T>{titel}</T></h3>
          {text && <p className="mt-0.5 text-xs leading-relaxed text-white/45"><T>{text}</T></p>}
        </div>
        {rechts}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export const FELD = 'rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400/70';

export function Text({ titel, wert, setzen, platzhalter, max = 40 }: {
  titel: string; wert: string; setzen: (v: string) => void; platzhalter?: string; max?: number;
}) {
  const t = useT();
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>{titel}</T></span>
      <input value={wert} maxLength={max} onChange={(e) => setzen(e.target.value)}
        placeholder={platzhalter ? t(platzhalter) : undefined} className={`${FELD} w-full`} />
    </label>
  );
}

/** Segmented choice. */
export function Segmente<W extends string | number>({ titel, wert, optionen, setzen }: {
  titel: string; wert: W; optionen: Array<{ wert: W; titel: string }>; setzen: (w: W) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>{titel}</T></span>
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.06] bg-black/30 p-1">
        {optionen.map((o) => (
          <button key={String(o.wert)} type="button" onClick={() => setzen(o.wert)} aria-pressed={wert === o.wert}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${wert === o.wert
              ? 'bg-violet-500 text-white shadow' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'}`}>
            <T>{o.titel}</T>
          </button>
        ))}
      </div>
    </div>
  );
}

/** On / off. */
export function Schalter({ titel, an, setzen }: { titel: string; an: boolean; setzen: (b: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={an} onClick={() => setzen(!an)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-xs font-medium text-white/70 transition hover:border-white/[0.12]">
      <T>{titel}</T>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${an ? 'bg-violet-500' : 'bg-white/[0.12]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${an ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** Colour with swatches and a free picker. */
export function Farbe({ titel, wert, setzen, vorschlaege = [] }: {
  titel: string; wert: string; setzen: (v: string) => void; vorschlaege?: string[];
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>{titel}</T></span>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/20" style={{ background: wert }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(wert) ? wert : '#000000'} onChange={(e) => setzen(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0" aria-label={titel} />
        </label>
        {vorschlaege.map((v) => (
          <button key={v} type="button" onClick={() => setzen(v)} aria-label={v}
            className={`h-6 w-6 rounded-md border transition ${wert.toLowerCase() === v.toLowerCase() ? 'border-white ring-2 ring-violet-400/60' : 'border-white/15 hover:border-white/50'}`}
            style={{ background: v }} />
        ))}
      </div>
    </div>
  );
}

/** Slider with the value. */
export function Schieber({ titel, wert, von, bis, schritt = 1, einheit = '', setzen, anzeige }: {
  titel: string; wert: number; von: number; bis: number; schritt?: number; einheit?: string;
  setzen: (n: number) => void; anzeige?: (n: number) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wider text-white/45">
        <T>{titel}</T>
        <span className="font-mono normal-case tracking-normal text-white/70">{anzeige ? anzeige(wert) : `${wert}${einheit}`}</span>
      </span>
      <input type="range" min={von} max={bis} step={schritt} value={wert}
        onChange={(e) => setzen(Number(e.target.value))} className="w-full accent-violet-500" />
    </label>
  );
}

/* ------------------------------------------------------------------ shared design (look.js) */

/** The design settings every redesigned overlay understands (public/overlay/look.js). */
export const LOOK_STANDARD = {
  look: 'clean' as 'clean' | 'glass' | 'kante' | 'mono' | 'klassisch',
  lookAkzent: '',
  schriftArt: '' as '' | 'inter' | 'oswald' | 'barlow' | 'bebas' | 'rajdhani' | 'anton',
  animation: 'gleiten' as 'gleiten' | 'blende' | 'ruhig' | 'aus',
  vert: '' as '' | 'top' | 'middle' | 'bottom',
  horiz: '' as '' | 'left' | 'center' | 'right',
  rand: 0,
};
export type LookConfig = typeof LOOK_STANDARD;

export const LOOKS: Array<{ wert: LookConfig['look']; titel: string; text: string }> = [
  { wert: 'clean', titel: 'Clean', text: 'Semi-transparent black, white text, hardly any colour. The house style.' },
  { wert: 'glass', titel: 'Glass', text: 'Frosted and lighter — the game shines through.' },
  { wert: 'kante', titel: 'Edge', text: 'Sharp corners, condensed capitals, a bold accent edge.' },
  { wert: 'mono', titel: 'Mono', text: 'Black and white only.' },
  { wert: 'klassisch', titel: 'Classic', text: 'The previous design, unchanged.' },
];

/**
 * Look, accent, font, motion and position - the same block on every configurator.
 * Position empty = top left without margin, exactly where older sources sit.
 */
export function DesignGruppe<C extends LookConfig>({ cfg, setz, akzentStandard = '#ffffff' }: {
  cfg: C;
  setz: (k: keyof LookConfig, v: LookConfig[keyof LookConfig]) => void;
  akzentStandard?: string;
}) {
  const t = useT();
  const aktiv = LOOKS.find((l) => l.wert === cfg.look) ?? LOOKS[0];
  return (
    <Gruppe titel="Design" text="Clean is the house style: transparent black, white text. Classic keeps the previous design.">
      <div>
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>Look</T></span>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {LOOKS.map((l) => (
            <button key={l.wert} type="button" onClick={() => setz('look', l.wert)} aria-pressed={cfg.look === l.wert}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${cfg.look === l.wert
                ? 'border-violet-400 bg-violet-500/15 text-violet-200' : 'border-white/[0.08] text-white/55 hover:border-white/25 hover:text-white/85'}`}>
              <T>{l.titel}</T>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-white/45"><T>{aktiv.text}</T></p>
      </div>
      {cfg.look !== 'klassisch' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Farbe titel="Accent" wert={cfg.lookAkzent || akzentStandard} setzen={(v) => setz('lookAkzent', v)}
            vorschlaege={['#ffffff', '#38bdf8', '#818cf8', '#f472b6', '#f97316']} />
          <div>
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>Font</T></span>
            <select value={cfg.schriftArt} onChange={(e) => setz('schriftArt', e.target.value as LookConfig['schriftArt'])}
              className={`${FELD} w-full`}>
              <option value="">{t('Look default')}</option>
              <option value="inter">Inter</option>
              <option value="oswald">Oswald</option>
              <option value="barlow">Barlow Condensed</option>
              <option value="bebas">Bebas Neue</option>
              <option value="rajdhani">Rajdhani</option>
              <option value="anton">Anton</option>
            </select>
          </div>
        </div>
      )}
      <Segmente titel="Animation" wert={cfg.animation} setzen={(v) => setz('animation', v)}
        optionen={[{ wert: 'gleiten', titel: 'Slide in' }, { wert: 'blende', titel: 'Fade' }, { wert: 'ruhig', titel: 'Subtle' }, { wert: 'aus', titel: 'Off' }]} />
      <Segmente titel="Vertical position" wert={cfg.vert} setzen={(v) => setz('vert', v)}
        optionen={[{ wert: '', titel: 'Free' }, { wert: 'top', titel: 'Top' }, { wert: 'middle', titel: 'Middle' }, { wert: 'bottom', titel: 'Bottom' }]} />
      <Segmente titel="Horizontal position" wert={cfg.horiz} setzen={(v) => setz('horiz', v)}
        optionen={[{ wert: '', titel: 'Free' }, { wert: 'left', titel: 'Left' }, { wert: 'center', titel: 'Centre' }, { wert: 'right', titel: 'Right' }]} />
      {(cfg.vert || cfg.horiz) && (
        <Schieber titel="Distance from the edge" wert={cfg.rand} von={0} bis={200} schritt={4} einheit=" px" setzen={(n) => setz('rand', n)} />
      )}
      <p className="text-[11px] text-white/45"><T>“Free” keeps the overlay in the top-left corner of its source, so you move it in OBS. With a position, add the source at 1920 × 1080 and it places itself.</T></p>
    </Gruppe>
  );
}

/* ------------------------------------------------------------------ house frame (look.js Look.rahmen) */

/** The CompHub house frame settings (rotating border, background, logo, watermark). */
export const HAUS_STANDARD = {
  rahmen: true,
  rahmenTempo: 4,
  rahmenBreite: 2.5,
  hintergrund: 'hero' as 'hero' | 'fotos' | 'eigen' | 'aus',
  hintergrundUrl: '',
  heroDeck: 0.1,
  wasserzeichen: 'rechts' as 'rechts' | 'links' | 'kopf' | 'aus',
  chLogo: true,
};
export type HausConfig = typeof HAUS_STANDARD;

/** Frame, background, logo and watermark - the same block on every configurator. */
export function HausGruppe<C extends HausConfig>({ cfg, setz, fotos = false }: {
  cfg: C;
  setz: (k: keyof HausConfig, v: HausConfig[keyof HausConfig]) => void;
  /** Offer "player photos" (overlays that know their players). */
  fotos?: boolean;
}) {
  const t = useT();
  const modi: Array<{ wert: HausConfig['hintergrund']; titel: string }> = [
    { wert: 'hero', titel: 'CompHub animation' },
    ...(fotos ? [{ wert: 'fotos' as const, titel: 'Player photos' }] : []),
    { wert: 'eigen', titel: 'Own image / video' },
    { wert: 'aus', titel: 'Off' },
  ];
  return (
    <Gruppe titel="Frame and background" text="A thin blue/white light circles the box; behind the text a faint background. Box opacity is set separately.">
      <div className="grid grid-cols-2 gap-2">
        <Schalter titel="Animated border" an={cfg.rahmen} setzen={(b) => setz('rahmen', b)} />
        <Schalter titel="CompHub logo" an={cfg.chLogo} setzen={(b) => setz('chLogo', b)} />
      </div>
      {cfg.rahmen && (
        <div className="grid grid-cols-2 gap-3">
          <Schieber titel="One round takes" wert={cfg.rahmenTempo} von={1} bis={15} schritt={0.5} einheit=" s" setzen={(n) => setz('rahmenTempo', n)} />
          <Schieber titel="Border width" wert={cfg.rahmenBreite} von={1} bis={6} schritt={0.5} einheit=" px" setzen={(n) => setz('rahmenBreite', n)} />
        </div>
      )}
      <Segmente titel="Background" wert={cfg.hintergrund} setzen={(v) => setz('hintergrund', v)} optionen={modi} />
      {cfg.hintergrund === 'eigen' && (
        <Text titel="Image or video URL (.mp4 / .webm plays muted in a loop)" wert={cfg.hintergrundUrl} setzen={(v) => setz('hintergrundUrl', v.trim())} platzhalter="https://…" max={500} />
      )}
      {cfg.hintergrund !== 'aus' && (
        <Schieber titel="Background opacity" wert={Math.round(cfg.heroDeck * 100)} von={0} bis={100} einheit=" %"
          setzen={(n) => setz('heroDeck', n / 100)} anzeige={(n) => (n ? `${n} %` : t('off'))} />
      )}
      <Segmente titel="thecomphub.com watermark" wert={cfg.wasserzeichen} setzen={(v) => setz('wasserzeichen', v)}
        optionen={[{ wert: 'rechts', titel: 'Bottom right' }, { wert: 'links', titel: 'Bottom left' }, { wert: 'kopf', titel: 'Next to the logo' }, { wert: 'aus', titel: 'Off' }]} />
    </Gruppe>
  );
}
