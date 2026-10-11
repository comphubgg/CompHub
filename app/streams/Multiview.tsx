'use client';

import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { sichtbarerTakt } from '@/app/lib/takt';
import MvPlayer, { type MvPlayerHandle } from './MvPlayer';
import Seitenleiste, { type MvOrdner } from './MvSeitenleiste';
import { EinstellungenFenster, KanalAendernFenster, KuerzelFenster } from './MvDialoge';
import {
  EINSTELLUNGEN_STANDARD, KUERZEL_STANDARD, SCHLUESSEL_EINSTELLUNGEN, SCHLUESSEL_KUERZEL,
  SCHLUESSEL_SEITE, SCHLUESSEL_STAND, kanalAusEingabe, ladeJson, passtKuerzel, speichereJson,
  type Kuerzel, type KuerzelName, type LiveStand, type MvAktionen, type MvEinstellungen, type MvStream,
} from './mvTypen';

/*
 * Die Multiview - eine Wand aus Twitch-Playern, nach dem Vorbild von viewington.com/watch.
 *
 * Der Betreiber (11.10.2026): "Du baust die Stream-Seite komplett um, eins zu eins wie bei Viewington,
 * optisch und funktional, nur in den Farben von CompHub." Gemeint ist:
 *
 *   - Die Wand fuellt den ganzen Bildschirm (Stream-Modus: ohne Kopfzeile der Seite). Die Kacheln
 *     ordnen sich selbst so, dass sie moeglichst gross werden; die letzte Reihe steht mittig.
 *   - Jede Kachel traegt beim Darueberfahren einen Ziehgriff (links), den Namen auf einer schwarzen
 *     Marke (mittig), und Knoepfe: anheften, neu laden, Kanal aendern, ausblenden, entfernen.
 *   - Links die Seitenleiste (Strg + B): Stream hinzufuegen, Liste, Ordner, Qualitaet, Steuerung.
 *   - POV-Streams (Ordner "Pro POV" und "Discord POV") tragen einen blauen Rand.
 *
 * Die Reihenfolge der Kacheln ist die Reihenfolge im Feld "streams". Die Player selbst werden aber
 * in fester Reihenfolge gezeichnet und nur per Position verschoben: ein Element im DOM umzuhaengen
 * laedt ein iframe neu, und der Betreiber will, dass "der Stream immer weiterlaeuft".
 */

const LUECKE = 2;

interface Raster {
  w: number; h: number; spalten: number; pos: Array<{ x: number; y: number }>;
}

/*
 * Wie die Kacheln liegen.
 *
 * Gesucht ist die Spaltenzahl, bei der eine Kachel am groessten wird - bei sechzehn zu neun und dem
 * Platz, der wirklich da ist. Die Reihen sind vollzaehlig, die letzte steht mittig, und das Ganze
 * sitzt mittig auf der Wand.
 */
function rastern(n: number, breite: number, hoehe: number): Raster {
  if (!n || breite <= 0 || hoehe <= 0) return { w: 0, h: 0, spalten: 1, pos: [] };
  let beste = 0;
  let spalten = 1;
  for (let k = 1; k <= n; k += 1) {
    const reihen = Math.ceil(n / k);
    const w = Math.min((breite - (k - 1) * LUECKE) / k, (((hoehe - (reihen - 1) * LUECKE) / reihen) * 16) / 9);
    if (w > beste + 0.5) { beste = w; spalten = k; }
  }
  const w = Math.max(40, Math.floor(beste));
  const h = Math.floor((w * 9) / 16);
  const reihen = Math.ceil(n / spalten);
  const y0 = Math.max(0, (hoehe - (reihen * h + (reihen - 1) * LUECKE)) / 2);
  const pos: Raster['pos'] = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / spalten);
    const inReihe = r === reihen - 1 ? n - spalten * (reihen - 1) : spalten;
    const reiheBreite = inReihe * w + (inReihe - 1) * LUECKE;
    pos.push({ x: (breite - reiheBreite) / 2 + (i - r * spalten) * (w + LUECKE), y: y0 + r * (h + LUECKE) });
  }
  return { w, h, spalten, pos };
}

const neueId = () => Math.random().toString(36).slice(2, 10);
let zaehler = Date.now();
const neuerStream = (kanal: string): MvStream => ({ id: neueId(), nr: ++zaehler, kanal, versteckt: false, fest: false, qualitaet: '' });

/** Angeheftete zuerst, sonst die Reihenfolge behalten. */
const festeVor = (liste: MvStream[]) => [...liste.filter((s) => s.fest), ...liste.filter((s) => !s.fest)];

const CSS = `
@layer components {
  .mv-root{--mv-bg:#09090b;--mv-panel:#111113;--mv-rand:#27272a;--mv-text:#f4f4f5;--mv-mute:#a1a1aa;--mv-hover:#1f1f23;background:var(--mv-bg);color:var(--mv-text)}
  .mv-root.mv-hell{--mv-bg:#f4f4f5;--mv-panel:#ffffff;--mv-rand:#e4e4e7;--mv-text:#18181b;--mv-mute:#52525b;--mv-hover:#f4f4f5}
  .mv-fl{background:var(--mv-panel);color:var(--mv-text);border-color:var(--mv-rand)}
  input.mv-fl,select.mv-fl{background:var(--mv-bg)}
  .mv-rand{border-color:var(--mv-rand)}
  .mv-mute{color:var(--mv-mute)}
  .mv-hover:hover{background:var(--mv-hover)}
  .mv-ziehen iframe{pointer-events:none}
}`;

interface KachelProps {
  s: MvStream;
  x: number; y: number; w: number; h: number;
  /** Der Platz liegt nicht auf der Wand (ausgeblendet) - dann wird die Kachel gar nicht gezeichnet. */
  host: string;
  qualitaet: string;
  pov?: 'pro' | 'discord';
  abgerundet: boolean;
  tooltips: boolean;
  qualitaetJeStream: boolean;
  ziehenUeberall: boolean;
  ziehend: boolean;
  neu: number;
  aktionen: MvAktionen;
  griff: (id: string, h: MvPlayerHandle | null) => void;
  ziehen: (e: React.PointerEvent, id: string) => void;
}

const Kachel = memo(function Kachel(p: KachelProps) {
  const t = useT();
  const { s, aktionen: a } = p;
  const tip = (text: string) => (p.tooltips ? t(text) : undefined);
  const knopf = 'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-black/90';
  const ikon = (d: string, extra = '') => (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 ${extra}`} fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
  return (
    <div data-mv-id={s.id}
      style={{
        position: 'absolute', left: 0, top: 0, width: p.w, height: p.h,
        transform: `translate(${p.x}px, ${p.y}px)`,
        transition: p.ziehend ? 'none' : 'transform 200ms ease, width 200ms ease, height 200ms ease',
        zIndex: p.ziehend ? 25 : 1,
      }}
      className="group">
      <div className={`h-full w-full overflow-hidden bg-black ${p.abgerundet ? 'rounded-lg' : ''}
        ${p.ziehend ? 'shadow-2xl ring-2 ring-sky-400' : ''}`}>
        <MvPlayer key={`${s.kanal}#${p.neu}`} ref={(h) => p.griff(s.id, h)} kanal={s.kanal} host={p.host}
          qualitaet={p.qualitaet} />
      </div>

      {/* POV: ein blauer Rand, damit die POVs der Seite zwischen den Streams auffallen. */}
      {p.pov && (
        <div aria-hidden
          className={`pointer-events-none absolute inset-0 border-2 border-sky-400/70
            shadow-[0_0_14px_rgba(56,189,248,0.25)] ${p.abgerundet ? 'rounded-lg' : ''}`} />
      )}

      {/* Ziehen von ueberall: eine durchsichtige Flaeche ueber dem Player. */}
      {p.ziehenUeberall && !s.fest && (
        <div onPointerDown={(e) => p.ziehen(e, s.id)} className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing" />
      )}

      <div className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <div onPointerDown={(e) => { if (!s.fest) p.ziehen(e, s.id); }} title={tip(s.fest ? 'Angeheftet' : 'Zum Verschieben ziehen')}
          className={`pointer-events-auto absolute left-2 top-2 touch-none rounded-md bg-black/70 p-1.5 text-white transition hover:bg-black/90
            ${s.fest ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'}`}>
          <svg viewBox="0 0 8 14" className="h-3.5 w-2" fill="currentColor">
            {[2, 7, 12].flatMap((cy) => [1.5, 6.5].map((cx) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.1" />))}
          </svg>
        </div>

        <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-medium text-white">
          {s.kanal}
          {p.pov && (
            <span className="rounded border border-sky-400/60 px-1 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
              {p.pov === 'discord' ? 'Discord POV' : 'POV'}
            </span>
          )}
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {p.qualitaetJeStream && (
            <select value={s.qualitaet} onChange={(e) => a.qualitaetWaehlen(s.id, e.target.value)} title={tip('Qualität dieses Streams')}
              className="pointer-events-auto h-7 rounded-md bg-black/70 px-1 text-[11px] text-white outline-none hover:bg-black/90">
              <option value="">{t('Wie alle')}</option>
              {['auto', 'chunked', '1080p60', '720p60', '480p', '360p', '160p'].map((q) => (
                <option key={q} value={q}>{q === 'chunked' ? 'Source' : q === 'auto' ? 'Auto' : q}</option>
              ))}
            </select>
          )}
          <button type="button" className={`${knopf} ${s.fest ? 'text-sky-300' : ''}`} title={tip(s.fest ? 'Lösen' : 'Anheften')}
            aria-label={t(s.fest ? 'Lösen' : 'Anheften')} onClick={() => a.festmachen(s.id)}>
            {ikon('M7 3h6l-1 5 3 3H5l3-3zM10 11v6')}
          </button>
          <button type="button" className={knopf} title={tip('Neu laden')} aria-label={t('Neu laden')} onClick={() => a.neuLaden(s.id)}>
            {ikon('M16 10a6 6 0 1 1-1.8-4.3M16 3v3.2h-3.2')}
          </button>
          <button type="button" className={knopf} title={tip('Kanal ändern')} aria-label={t('Kanal ändern')} onClick={() => a.kanalAendern(s.id, '')}>
            {ikon('M3 17l1-4L14 3l3 3L7 16zM12 5l3 3')}
          </button>
          <button type="button" className={knopf} title={tip('Ausblenden')} aria-label={t('Ausblenden')} onClick={() => a.verstecken(s.id)}>
            {ikon('M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8.5 5.5 8.5 5.5a14 14 0 0 1-2.4 3M5.2 6.6A14 14 0 0 0 1.5 10S5 15.5 10 15.5a8 8 0 0 0 3-.6')}
          </button>
          <button type="button" className={knopf} title={tip('Entfernen')} aria-label={t('Entfernen')} onClick={() => a.entfernen(s.id)}>
            {ikon('M5.5 5.5l9 9M14.5 5.5l-9 9')}
          </button>
        </div>
      </div>
    </div>
  );
});

export interface MultiviewProps {
  /** Die Seite, auf der die Player liegen - Twitch verlangt sie. */
  host: string;
  /** Womit die Wand beim allerersten Oeffnen beginnt (danach gilt, was gespeichert ist). */
  start: string[];
  ordner: MvOrdner[];
  /** Wer in den Ordnern gerade sendet - fuer die Zaehler dort. */
  ordnerLive: Record<string, boolean>;
  /** VIP oder Admin: darf Ordner anlegen und Streamer hineinlegen. */
  darfOrdner: boolean;
  ordnerSpeichern: (name: string, kanaele: string[]) => void;
  zuOrdner: (ordnerId: string, kanal: string) => void;
  zurEinzelansicht: () => void;
}

export default function Multiview(props: MultiviewProps) {
  const t = useT();

  /* ------------------------------------------------------------------- Zustand */
  const [streams, setStreams] = useState<MvStream[]>(() => {
    const gespeichert = ladeJson<{ streams?: MvStream[] } | null>(SCHLUESSEL_STAND, null);
    if (gespeichert && Array.isArray(gespeichert.streams)) {
      return gespeichert.streams
        .filter((s) => s && typeof s.kanal === 'string' && kanalAusEingabe(s.kanal))
        .map((s) => ({
          id: s.id || neueId(), nr: typeof s.nr === 'number' ? s.nr : ++zaehler,
          kanal: s.kanal, versteckt: !!s.versteckt, fest: !!s.fest, qualitaet: s.qualitaet || '',
        }));
    }
    return props.start.map(neuerStream);
  });
  const [qualitaetAlle, setQualitaetAlle] = useState<string>(
    () => ladeJson<{ qualitaet?: string } | null>(SCHLUESSEL_STAND, null)?.qualitaet || 'auto');
  const [einst, setEinst] = useState<MvEinstellungen>(
    () => ({ ...EINSTELLUNGEN_STANDARD, ...ladeJson<Partial<MvEinstellungen>>(SCHLUESSEL_EINSTELLUNGEN, {}) }));
  const [kuerzel, setKuerzel] = useState<Record<KuerzelName, Kuerzel>>(
    () => ({ ...KUERZEL_STANDARD, ...ladeJson<Partial<Record<KuerzelName, Kuerzel>>>(SCHLUESSEL_KUERZEL, {}) }));
  const [seite, setSeite] = useState<boolean>(() => {
    const gemerkt = ladeJson<boolean | null>(SCHLUESSEL_SEITE, null);
    return gemerkt === null ? streams.length === 0 : gemerkt;
  });
  const [neu, setNeu] = useState<Record<string, number>>({});
  const [live, setLive] = useState<LiveStand>({});
  const [dialog, setDialog] = useState<null | 'einstellungen' | 'kuerzel'>(null);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [rueck, setRueck] = useState<null | { text: string; stand: MvStream[] }>(null);
  const [zieh, setZieh] = useState<null | { id: string; x: number; y: number }>(null);
  const [flaeche, setFlaeche] = useState({ b: 0, h: 0 });
  const [oben, setOben] = useState(0);

  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  const griffe = useRef(new Map<string, MvPlayerHandle>());
  const wand = useRef<HTMLDivElement | null>(null);
  const rueckUhr = useRef<number | null>(null);
  const qualitaetRef = useRef(qualitaetAlle);
  qualitaetRef.current = qualitaetAlle;
  const einstRef = useRef(einst);
  einstRef.current = einst;

  /* ------------------------------------------------------------------ Speichern */
  useEffect(() => { speichereJson(SCHLUESSEL_STAND, { streams, qualitaet: qualitaetAlle }); }, [streams, qualitaetAlle]);
  useEffect(() => { speichereJson(SCHLUESSEL_SEITE, seite); }, [seite]);

  // Mehrere Tabs: ein Tab schreibt, die anderen uebernehmen (Einstellung "Tabs synchron halten").
  useEffect(() => {
    if (!einst.tabSync) return undefined;
    const beiAenderung = (e: StorageEvent) => {
      if (e.key !== SCHLUESSEL_STAND || !e.newValue) return;
      try {
        const j = JSON.parse(e.newValue) as { streams?: MvStream[]; qualitaet?: string };
        if (Array.isArray(j.streams)) setStreams(j.streams);
        if (j.qualitaet) setQualitaetAlle(j.qualitaet);
      } catch { /* kaputt gespeichert - ignorieren */ }
    };
    window.addEventListener('storage', beiAenderung);
    return () => window.removeEventListener('storage', beiAenderung);
  }, [einst.tabSync]);

  const aendereEinst = useCallback((teil: Partial<MvEinstellungen>) => {
    setEinst((alt) => { const n = { ...alt, ...teil }; speichereJson(SCHLUESSEL_EINSTELLUNGEN, n); return n; });
  }, []);
  const setzeKuerzel = useCallback((name: KuerzelName, k: Kuerzel) => {
    setKuerzel((alt) => { const n = { ...alt, [name]: k }; speichereJson(SCHLUESSEL_KUERZEL, n); return n; });
  }, []);

  /* ---------------------------------------------------------------- Rueckgaengig */
  const merkeRueck = useCallback((text: string, stand: MvStream[]) => {
    setRueck({ text, stand });
    if (rueckUhr.current) window.clearTimeout(rueckUhr.current);
    rueckUhr.current = window.setTimeout(() => setRueck(null), 12_000);
  }, []);
  useEffect(() => () => { if (rueckUhr.current) window.clearTimeout(rueckUhr.current); }, []);

  /* --------------------------------------------------------------------- Aktionen */
  const verschiebeVor = useCallback((id: string, zielId: string) => {
    setStreams((alt) => {
      const von = alt.findIndex((s) => s.id === id);
      const nach = alt.findIndex((s) => s.id === zielId);
      if (von < 0 || nach < 0 || von === nach || alt[von].fest || alt[nach].fest) return alt;
      const liste = [...alt];
      const [x] = liste.splice(von, 1);
      liste.splice(nach, 0, x);
      return liste;
    });
  }, []);

  const aktionen = useMemo<MvAktionen>(() => ({
    hinzufuegen: (eingabe) => {
      const k = kanalAusEingabe(eingabe);
      if (!k) return false;
      setStreams((alt) => (alt.some((s) => s.kanal === k)
        ? alt.map((s) => (s.kanal === k ? { ...s, versteckt: false } : s))
        : [...alt, neuerStream(k)]));
      return true;
    },
    entfernen: (id) => {
      const alt = streamsRef.current;
      const s = alt.find((x) => x.id === id);
      if (!s) return;
      merkeRueck(`${s.kanal}`, alt);
      setStreams(alt.filter((x) => x.id !== id));
    },
    verstecken: (id) => setStreams((alt) => alt.map((s) => (s.id === id ? { ...s, versteckt: !s.versteckt } : s))),
    festmachen: (id) => setStreams((alt) => festeVor(alt.map((s) => (s.id === id ? { ...s, fest: !s.fest } : s)))),
    neuLaden: (id) => setNeu((alt) => ({ ...alt, [id]: (alt[id] ?? 0) + 1 })),
    kanalAendern: (id, kanal) => {
      if (!kanal) { setBearbeiteId(id); return; }
      const k = kanalAusEingabe(kanal);
      if (k) setStreams((alt) => alt.map((s) => (s.id === id ? { ...s, kanal: k } : s)));
    },
    qualitaetWaehlen: (id, q) => setStreams((alt) => alt.map((s) => (s.id === id ? { ...s, qualitaet: q } : s))),
    alleVerstecken: () => setStreams((alt) => alt.map((s) => (s.fest ? s : { ...s, versteckt: true }))),
    alleZeigen: () => setStreams((alt) => alt.map((s) => ({ ...s, versteckt: false }))),
    alleEntfernen: () => {
      const alt = streamsRef.current;
      const weg = alt.filter((s) => !s.fest).length;
      if (!weg) return;
      merkeRueck(`${weg} Streams`, alt);
      setStreams(alt.filter((s) => s.fest));
    },
    alleAbspielen: () => griffe.current.forEach((g) => g.abspielen()),
    allePausieren: () => griffe.current.forEach((g) => g.pausieren()),
    alleStumm: () => griffe.current.forEach((g) => g.stumm(true)),
    alleNeuLaden: () => setNeu((alt) => {
      const n = { ...alt };
      for (const s of streamsRef.current) n[s.id] = (n[s.id] ?? 0) + 1;
      return n;
    }),
    alleQualitaet: (q) => {
      setQualitaetAlle(q);
      setStreams((alt) => alt.map((s) => (s.qualitaet ? { ...s, qualitaet: '' } : s)));
    },
    ordnerLaden: (kanaele, ersetzen) => {
      const gueltig = [...new Set(kanaele.map((k) => kanalAusEingabe(k)).filter((k): k is string => !!k))];
      const alt = streamsRef.current;
      if (ersetzen) {
        if (alt.some((s) => !s.fest)) merkeRueck('Wand', alt);
        const fest = alt.filter((s) => s.fest);
        setStreams([...fest, ...gueltig.filter((k) => !fest.some((f) => f.kanal === k)).map(neuerStream)]);
      } else {
        setStreams([...alt.map((s) => (gueltig.includes(s.kanal) ? { ...s, versteckt: false } : s)),
          ...gueltig.filter((k) => !alt.some((s) => s.kanal === k)).map(neuerStream)]);
      }
    },
  }), [merkeRueck]);

  const griff = useCallback((id: string, g: MvPlayerHandle | null) => {
    if (g) griffe.current.set(id, g); else griffe.current.delete(id);
  }, []);

  /* ------------------------------------------------------------------------ Wand */
  useLayoutEffect(() => {
    const el = wand.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const messen = () => setFlaeche({ b: el.clientWidth, h: el.clientHeight });
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    messen();
    return () => beobachter.disconnect();
  }, []);

  // Ohne Stream-Modus bleibt die Kopfzeile der Seite stehen; die Wand beginnt darunter.
  useLayoutEffect(() => {
    if (einst.streamModus) { setOben(0); return undefined; }
    const messen = () => setOben(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0);
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [einst.streamModus]);

  // Die Seite dahinter scrollt nicht mit.
  useEffect(() => {
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = vorher; };
  }, []);

  const sichtbar = useMemo(() => streams.filter((s) => !s.versteckt), [streams]);
  const raster = useMemo(() => rastern(sichtbar.length, flaeche.b, flaeche.h), [sichtbar.length, flaeche]);
  const sichtbarRef = useRef(sichtbar);
  sichtbarRef.current = sichtbar;
  const rasterRef = useRef(raster);
  rasterRef.current = raster;

  // Feste Zeichenreihenfolge: wer zuerst da war, steht zuerst im DOM - egal wie sortiert wird.
  const zeichenReihe = useMemo(() => [...streams].sort((x, y) => x.nr - y.nr), [streams]);
  const platz = new Map(sichtbar.map((s, i) => [s.id, i]));

  const pov = useMemo(() => {
    const karte: Record<string, 'pro' | 'discord'> = {};
    for (const o of props.ordner) {
      if (!/\bpov\b/i.test(o.name)) continue;
      const art = /discord/i.test(o.name) ? 'discord' : 'pro';
      for (const x of o.streamers) if (!karte[x.twitch] || art === 'pro') karte[x.twitch] = art;
    }
    return karte;
  }, [props.ordner]);

  /* ---------------------------------------------------------------- Ziehen (Wand) */
  const ziehen = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const feld = wand.current;
    if (!feld) return;
    const griffEl = e.currentTarget as HTMLElement;
    griffEl.setPointerCapture?.(e.pointerId);
    const r = feld.getBoundingClientRect();
    const i = sichtbarRef.current.findIndex((s) => s.id === id);
    const start = rasterRef.current.pos[i];
    if (!start) return;
    const ox = e.clientX - r.left - start.x;
    const oy = e.clientY - r.top - start.y;
    setZieh({ id, x: start.x, y: start.y });
    const bewegt = (ev: PointerEvent) => {
      const x = ev.clientX - r.left - ox;
      const y = ev.clientY - r.top - oy;
      setZieh({ id, x, y });
      const g = rasterRef.current;
      const mx = x + g.w / 2;
      const my = y + g.h / 2;
      const j = g.pos.findIndex((q) => mx >= q.x && mx <= q.x + g.w && my >= q.y && my <= q.y + g.h);
      const ziel = j >= 0 ? sichtbarRef.current[j] : undefined;
      if (ziel && ziel.id !== id) verschiebeVor(id, ziel.id);
    };
    const ende = () => {
      window.removeEventListener('pointermove', bewegt);
      window.removeEventListener('pointerup', ende);
      window.removeEventListener('pointercancel', ende);
      setZieh(null);
    };
    window.addEventListener('pointermove', bewegt);
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
  }, [verschiebeVor]);

  /* ------------------------------------------------------------------ Live-Status */
  const kanaele = streams.map((s) => s.kanal).join(',');
  useEffect(() => {
    if (!einst.liveAbfrage || !kanaele) return undefined;
    let weg = false;
    const holen = async () => {
      try {
        const r = await fetch('/api/live-status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: kanaele.split(',') }),
        });
        if (!r.ok || weg) return;
        const j = await r.json() as Record<string, { isLive?: boolean; viewers?: number }>;
        const neuer: LiveStand = {};
        for (const k of kanaele.split(',')) neuer[k] = { isLive: !!j[k]?.isLive, viewers: j[k]?.viewers ?? 0 };
        if (!weg) setLive((alt) => ({ ...alt, ...neuer }));
      } catch { /* beim naechsten Takt wieder */ }
    };
    void holen();
    const ab = sichtbarerTakt(() => { void holen(); }, Math.max(15, einst.liveTakt) * 1000);
    return () => { weg = true; ab(); };
  }, [einst.liveAbfrage, einst.liveTakt, kanaele]);

  // Ordner-Zaehler: was die Seite ueber die Ordner schon weiss, ohne es hier nochmal zu erfragen.
  const liveAlle = useMemo<LiveStand>(() => {
    const aus: LiveStand = {};
    for (const [k, v] of Object.entries(props.ordnerLive)) aus[k.toLowerCase()] = { isLive: v, viewers: 0 };
    return { ...aus, ...live };
  }, [props.ordnerLive, live]);

  /* -------------------------------------------------------------------- Vollbild */
  useEffect(() => {
    let vorher: { id: string; qualitaet: string } | null = null;
    const beiVollbild = () => {
      const el = document.fullscreenElement as HTMLElement | null;
      const e = einstRef.current;
      if (el) {
        const id = el.closest?.('[data-mv-id]')?.getAttribute('data-mv-id');
        if (!id) return;
        if (e.vollbildAndereStumm) griffe.current.forEach((g, gid) => { if (gid !== id) g.stumm(true); });
        if (e.vollbildQuelle) {
          const s = streamsRef.current.find((x) => x.id === id);
          vorher = { id, qualitaet: s?.qualitaet || qualitaetRef.current };
          griffe.current.get(id)?.qualitaet('chunked');
        }
      } else if (vorher || e.vollbildStummBeimVerlassen) {
        const id = vorher?.id;
        if (vorher && e.vollbildZurueck && id) griffe.current.get(id)?.qualitaet(vorher.qualitaet);
        if (e.vollbildStummBeimVerlassen && id) griffe.current.get(id)?.stumm(true);
        vorher = null;
      }
    };
    document.addEventListener('fullscreenchange', beiVollbild);
    return () => document.removeEventListener('fullscreenchange', beiVollbild);
  }, []);

  /* ---------------------------------------------------------------- Tastenkuerzel */
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyB') { e.preventDefault(); setSeite((x) => !x); return; }
      const ziel = e.target as HTMLElement | null;
      if (ziel && (['INPUT', 'TEXTAREA', 'SELECT'].includes(ziel.tagName) || ziel.isContentEditable)) return;
      if (dialog || bearbeiteId) return;
      for (const [name, k] of Object.entries(kuerzel) as Array<[KuerzelName, Kuerzel]>) {
        if (!passtKuerzel(e, k)) continue;
        e.preventDefault();
        if (name === 'alleStumm') aktionen.alleStumm();
        else if (name === 'q360') aktionen.alleQualitaet('360p');
        else if (name === 'qAuto') aktionen.alleQualitaet('auto');
        else if (name === 'ziehenUmschalten') aendereEinst({ ziehenUeberall: !einstRef.current.ziehenUeberall });
        else if (name === 'alleNeuLaden') aktionen.alleNeuLaden();
        return;
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [kuerzel, dialog, bearbeiteId, aktionen, aendereEinst]);

  /* ------------------------------------------------------------------------ Bild */
  const bearbeite = bearbeiteId ? streams.find((s) => s.id === bearbeiteId) : undefined;

  return (
    <div className={`mv-root fixed bottom-0 left-0 right-0 z-[300] overflow-hidden ${einst.dunkel ? '' : 'mv-hell'}
      ${zieh ? 'mv-ziehen select-none' : ''}`}
      style={{ top: oben }}>
      <style>{CSS}</style>

      {/* Die Wand */}
      <div ref={wand} className="absolute inset-0">
        {zeichenReihe.map((s) => {
          const id = s.id;
          const i = platz.get(id);
          if (i === undefined) return null;
          const ziehend = zieh?.id === id;
          const p = raster.pos[i] ?? { x: 0, y: 0 };
          return (
            <Kachel key={id} s={s}
              x={ziehend ? zieh.x : p.x} y={ziehend ? zieh.y : p.y} w={raster.w} h={raster.h}
              host={props.host} qualitaet={s.qualitaet || qualitaetAlle} pov={pov[s.kanal]}
              abgerundet={einst.abgerundet} tooltips={einst.tooltips} qualitaetJeStream={einst.qualitaetJeStream}
              ziehenUeberall={einst.ziehenUeberall} ziehend={ziehend} neu={neu[id] ?? 0}
              aktionen={aktionen} griff={griff} ziehen={ziehen} />
          );
        })}

        {sichtbar.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-sky-400" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></svg>
            <h1 className="text-xl font-semibold text-sky-400">CompHub Multiview</h1>
            <p className="mv-mute max-w-xs text-sm">
              {streams.length
                ? <T>Alle Streams sind ausgeblendet. Die Seitenleiste blendet sie wieder ein.</T>
                : <T>Mehrere Twitch-Streams gleichzeitig, mit automatisch passender Anordnung. Öffne die Seitenleiste, um Streams hinzuzufügen.</T>}
            </p>
            <p className="mv-mute flex items-center gap-1.5 text-xs">
              <kbd className="mv-fl rounded border px-1.5 py-0.5 font-mono">Ctrl</kbd>+
              <kbd className="mv-fl rounded border px-1.5 py-0.5 font-mono">B</kbd>
              <T>zum Umschalten der Seitenleiste</T>
            </p>
          </div>
        )}
      </div>

      {/* Der Schalter links oben - wie bei Viewington ein kleines Symbol auf der Wand. */}
      {!seite && (
        <button type="button" onClick={() => setSeite(true)} title={t('Seitenleiste öffnen (Strg + B)')}
          aria-label={t('Seitenleiste öffnen')}
          className="absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/85">
          <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><line x1="8" y1="3.5" x2="8" y2="16.5" /></svg>
        </button>
      )}

      <Seitenleiste offen={seite} zu={() => setSeite(false)} streams={streams} live={liveAlle} pov={pov}
        aktionen={aktionen} qualitaetAlle={qualitaetAlle} ordner={props.ordner} darfOrdner={props.darfOrdner}
        ordnerSpeichern={props.ordnerSpeichern} zuOrdner={props.zuOrdner} verschiebeVor={verschiebeVor}
        einzelAnsicht={props.zurEinzelansicht} einstellungen={() => setDialog('einstellungen')} />

      {/* Rueckgaengig nach dem Entfernen */}
      {rueck && (
        <div className="mv-fl absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 text-xs shadow-2xl">
          <span>{rueck.text} <T>entfernt</T></span>
          <button type="button" onClick={() => { setStreams(rueck.stand); setRueck(null); }}
            className="font-semibold text-sky-400 transition hover:text-sky-300">
            <T>Rückgängig</T>
          </button>
          <button type="button" aria-label="Close" onClick={() => setRueck(null)} className="mv-mute transition hover:text-sky-400">×</button>
        </div>
      )}

      {dialog === 'einstellungen' && (
        <EinstellungenFenster einst={einst} aendern={aendereEinst} kuerzel={() => setDialog('kuerzel')} zu={() => setDialog(null)} />
      )}
      {dialog === 'kuerzel' && (
        <KuerzelFenster kuerzel={kuerzel} setzen={setzeKuerzel}
          zurueck={() => { setKuerzel(KUERZEL_STANDARD); speichereJson(SCHLUESSEL_KUERZEL, KUERZEL_STANDARD); }}
          zu={() => setDialog('einstellungen')} />
      )}
      {bearbeite && (
        <KanalAendernFenster kanal={bearbeite.kanal} speichern={(k) => aktionen.kanalAendern(bearbeite.id, k)}
          zu={() => setBearbeiteId(null)} />
      )}
    </div>
  );
}
