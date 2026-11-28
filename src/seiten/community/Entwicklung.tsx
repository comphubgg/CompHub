import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Laedt, Leer, Segment } from '../../ds/Bausteine';
import { Kopieren, useResthoehe } from './teileA';

/*
 * Map Evolution (Betreiber, 26.11.2026: Wunsch Nummer eins). Zwei Kartenstaende nebeneinander oder per Schieberegler uebereinander, Zoom und
 * Verschieben fuer beide gleich. Daten wie auf der Seite: /api/karten-updates (jede Kartenversion je Patch mit Kapitel/Saison, lib/kartenUpdates.ts
 * auf main), Bilder ueber /api/maps-bild?u=<Adresse>&b=<Breite> (verkleinert die Seite selbst). Das Turnier-Kartenarchiv liegt unter
 * /competitive/maps (anderer Helfer).
 *
 * Aufbau seit dem Design-System 3.0 (27.11.2026; Betreiber: "nur das Wichtigste ... grosse Karten"): die Seite fuellt den Bildschirm. Oben EINE
 * Zeile - Titel, die zwei Versionswahlen (mit Pfeilen einen Patch zurueck/vor), Umschalter Side by side / Swipe, Copy link - darunter die Karten
 * bis an den unteren Rand; jede Karte traegt ihre Version gross in der Ecke.
 * Tasten: Pfeil links/rechts = rechte Karte einen Patch zurueck/vor, mit Umschalt die linke. Auswahl und Modus stehen in der Adresse (?a=&b=&m=).
 */

interface Stand { patch: string; kapitel: number; saison: string; img: string; url: string; neu?: boolean }
// Quellen der Reihe nach (26.11.2026): der Server der Seite bekommt von fortnite.gg keine Bilder mehr (403/404 seit 16.11.), daher danach
// direkt im Browser des Betreibers laden und zuletzt die eigene Kopie im Archiv (/maps/archiv/gg, je Saison eine).
const QUELLEN = [
  (u: Stand, b: number) => `/api/maps-bild?u=${encodeURIComponent(u.url)}&b=${b}`,
  (u: Stand) => u.url,
  (u: Stand) => `https://www.thecomphub.com/maps/archiv/gg/gg-${u.patch}.webp`,
];
const gruppe = (u: Stand) => (u.kapitel ? `Chapter ${u.kapitel} · ${u.saison}` : 'Latest patches');
type Modus = 'swipe' | 'nebeneinander';
// Vorher = Bernstein, Nachher = Akzent des Bereichs
const TON = { a: { punkt: 'bg-amber-300', text: 'text-amber-300', rand: 'focus:border-amber-300/60' }, b: { punkt: 'bg-akz', text: 'text-akz', rand: 'focus:border-akz/60' } } as const;

export default function Entwicklung() {
  const [liste, setListe] = useState<Stand[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useSearchParams();
  // Betreiber 27.11.2026: Standard nebeneinander, Swipe als Umschalter.
  const [modus, setModus] = useState<Modus>(() => (suche.get('m') === 'swipe' ? 'swipe' : 'nebeneinander'));
  const { ref, stil } = useResthoehe<HTMLDivElement>();

  useEffect(() => {
    fetch('/api/karten-updates').then((r) => r.json()).then((j) => setListe((j?.updates ?? []) as Stand[])).catch(() => setFehler(true));
  }, []);
  // Aelteste zuerst - so laeuft die Reihe von links nach rechts.
  const alle = useMemo(() => [...(liste ?? [])].reverse(), [liste]);
  const idx = (p: string | null, ersatz: number) => { const i = alle.findIndex((u) => u.patch === p); return i >= 0 ? i : ersatz; };
  const b = idx(suche.get('b'), alle.length - 1);
  const a = idx(suche.get('a'), Math.max(0, alle.length - 2));
  const setzen = useCallback((na: number, nb: number, m = modus) => {
    if (!alle.length) return;
    const k = (i: number) => alle[Math.max(0, Math.min(alle.length - 1, i))].patch;
    setSuche({ a: k(na), b: k(nb), ...(m === 'swipe' ? { m: 'swipe' } : {}) }, { replace: true });
  }, [alle, modus, setSuche]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) setzen(a + d, b); else setzen(a, b + d);
    };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, [a, b, setzen]);

  const A = alle[a]; const B = alle[b];
  return (
    <div ref={ref} style={stil} className="flex flex-col xl:h-[calc(100dvh-var(--oben))] xl:min-h-[560px]">
      {/* Eine Zeile: Titel, zwei Versionswahlen, Umschalter, Link */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-white/[0.07] bg-fl px-4 py-3 lg:px-8">
        <div className="mr-auto">
          <p className="ueber">Community · Map Evolution</p>
          <h1 className="titel mt-1 text-4xl">How the island changed</h1>
        </div>
        {alle.length > 0 && <>
          <Wahl titel="Before" seite="a" alle={alle} i={a} setzen={(i) => setzen(i, b)} />
          <Wahl titel="After" seite="b" alle={alle} i={b} setzen={(i) => setzen(a, i)} />
          <Segment id="evo-modus" wert={modus} wahl={[{ k: 'nebeneinander', titel: 'Side by side' }, { k: 'swipe', titel: 'Swipe' }]} onWahl={(m) => { setModus(m); setzen(a, b, m); }} />
          <Kopieren />
        </>}
      </div>
      <div className="relative min-h-0 flex-1">
        {fehler ? <div className="p-6"><Leer text="The map archive isn't answering right now – try again in a moment." /></div>
          : !liste ? <Laedt text="Loading every map version" />
            : A && B ? <Vergleich A={A} B={B} modus={modus} /> : <div className="p-6"><Leer text="No map versions found." /></div>}
      </div>
    </div>
  );
}

function Wahl({ titel, seite, alle, i, setzen }: { titel: string; seite: 'a' | 'b'; alle: Stand[]; i: number; setzen: (i: number) => void }) {
  // Eine Auswahl je Seite, nach Kapitel/Saison gruppiert (neueste oben); die Pfeile gehen einen Patch zurueck / vor
  const gruppen = useMemo(() => {
    const m = new Map<string, Array<{ x: Stand; k: number }>>();
    alle.forEach((x, k) => { const g = gruppe(x); m.set(g, [...(m.get(g) ?? []), { x, k }]); });
    return [...m.entries()].reverse();
  }, [alle]);
  const pfeil = (d: number) => (
    <button type="button" aria-label={d < 0 ? 'One patch back' : 'One patch forward'} title={d < 0 ? 'One patch back' : 'One patch forward'} disabled={i + d < 0 || i + d >= alle.length} onClick={() => setzen(i + d)}
      className="grid h-[42px] w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/40 text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-25">
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d < 0 ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} /></svg>
    </button>
  );
  return (
    <div className="w-full sm:w-auto">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45"><span className={`h-2 w-2 rounded-full ${TON[seite].punkt}`} />{titel}</p>
      <div className="flex gap-1">
        {pfeil(-1)}
        <select value={i} onChange={(e) => setzen(Number(e.target.value))} aria-label={`${titel} version`} className={`eingabe zahl min-w-0 flex-1 !bg-[#080a11] font-semibold sm:w-[250px] sm:flex-none ${TON[seite].rand}`}>
          {gruppen.map(([g, l]) => <optgroup key={g} label={g}>{[...l].reverse().map(({ x, k }) => <option key={x.patch} value={k}>{g} · v{x.patch}</option>)}</optgroup>)}
        </select>
        {pfeil(1)}
      </div>
    </div>
  );
}

/* ---------------------------------------------- Vergleichsflaeche: gemeinsamer Zoom, Schieberegler oder nebeneinander */
function Vergleich({ A, B, modus }: { A: Stand; B: Stand; modus: Modus }) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [sicht, setSicht] = useState({ s: 1, tx: 0, ty: 0 });
  const [teiler, setTeiler] = useState(50);
  const [kaputt, setKaputt] = useState<Record<string, number>>({});
  const ziehen = useRef<{ art: 'karte' | 'teiler'; x: number; y: number; tx: number; ty: number } | null>(null);
  const breite = sicht.s > 2 ? 2400 : 1600;

  const zoomen = useCallback((f: number, mx: number, my: number) => setSicht((v) => {
    const s = Math.min(8, Math.max(1, v.s * f));
    return { s, tx: mx - (mx - v.tx) * (s / v.s), ty: my - (my - v.ty) * (s / v.s) };
  }), []);
  // Nebeneinander: Mausposition auf das jeweilige Halbbild umrechnen, damit beide Karten um denselben Punkt zoomen.
  const feldVon = useCallback((x: number, w: number) => (modus === 'nebeneinander' && w > 700 ? (x > w / 2 ? x - w / 2 : x) : x), [modus]);
  useEffect(() => {
    const el = rahmen.current; if (!el) return undefined;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomen(e.deltaY < 0 ? 1.2 : 1 / 1.2, feldVon(e.clientX - r.left, r.width), e.clientY - r.top);
    };
    el.addEventListener('wheel', rad, { passive: false }); return () => el.removeEventListener('wheel', rad);
  }, [zoomen, feldVon]);

  function runter(e: React.PointerEvent, art: 'karte' | 'teiler') {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    ziehen.current = { art, x: e.clientX, y: e.clientY, tx: sicht.tx, ty: sicht.ty };
  }
  function bewegen(e: React.PointerEvent) {
    const z = ziehen.current; if (!z) return;
    if (z.art === 'teiler') { const r = rahmen.current!.getBoundingClientRect(); setTeiler(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))); return; }
    setSicht((v) => ({ ...v, tx: z.tx + e.clientX - z.x, ty: z.ty + e.clientY - z.y }));
  }
  const ebene = (u: Stand) => (
    <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${sicht.tx}px, ${sicht.ty}px) scale(${sicht.s})` }}>
      {(kaputt[u.patch] ?? 0) >= QUELLEN.length
        ? <div className="grid h-full w-full place-items-center px-6 text-center text-sm text-white/45"><p>The map image of v{u.patch} isn't available right now.</p></div>
        : <img key={kaputt[u.patch] ?? 0} src={QUELLEN[kaputt[u.patch] ?? 0](u, breite)} alt={`Map v${u.patch}`} draggable={false} referrerPolicy="no-referrer" onError={() => setKaputt((k) => ({ ...k, [u.patch]: (k[u.patch] ?? 0) + 1 }))} className="h-full w-full select-none object-contain" />}
    </div>
  );
  // Version gross in der Ecke: Vorher links, Nachher rechts
  const marke = (u: Stand, seite: 'a' | 'b', rechts?: boolean) => (
    <motion.div key={u.patch} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className={`pointer-events-none absolute top-3 z-10 rounded-2xl border border-white/10 bg-fl/90 px-3.5 py-2 backdrop-blur ${rechts ? 'right-3 text-right' : 'left-3'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${TON[seite].text}`}>{seite === 'a' ? 'Before' : 'After'}</p>
      <p className="titel zahl text-3xl">v{u.patch}</p>
      <p className="text-[11px] text-white/50">{gruppe(u)}</p>
    </motion.div>
  );
  const knopf = 'grid h-9 w-9 place-items-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white';
  const mitte = () => { const r = rahmen.current!.getBoundingClientRect(); return { x: (modus === 'swipe' || r.width <= 700 ? r.width : r.width / 2) / 2, y: (modus === 'swipe' || r.width > 700 ? r.height : r.height / 2) / 2 }; };
  return (
    <div ref={rahmen} onPointerDown={(e) => runter(e, 'karte')} onPointerMove={bewegen} onPointerUp={() => { ziehen.current = null; }} onDoubleClick={() => setSicht({ s: 1, tx: 0, ty: 0 })}
      className="relative h-[150vw] cursor-grab touch-none select-none overflow-hidden bg-[#070b14] active:cursor-grabbing md:h-[70vw] xl:h-full">
      {modus === 'swipe' ? (
        <>
          {ebene(B)}
          <div className="absolute inset-0 bg-[#070b14]" style={{ clipPath: `inset(0 ${100 - teiler}% 0 0)` }}>{ebene(A)}</div>
          {marke(A, 'a')}{marke(B, 'b', true)}
          <div className="absolute inset-y-0 z-20 w-10 -translate-x-1/2 cursor-ew-resize" style={{ left: `${teiler}%` }} onPointerDown={(e) => runter(e, 'teiler')}>
            <div className="mx-auto h-full w-[2px] bg-white shadow-[0_0_14px_rgba(0,0,0,0.9)]" />
            <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#04050a] shadow-[0_10px_30px_rgba(0,0,0,0.7)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-5 6 5 6M15 6l5 6-5 6" /></svg>
            </div>
          </div>
        </>
      ) : (
        <div className="grid h-full grid-rows-2 gap-px bg-white/10 md:grid-cols-2 md:grid-rows-1">
          {([[A, 'a'], [B, 'b']] as const).map(([u, seite]) => (
            <div key={seite} className="relative overflow-hidden bg-[#070b14]">{ebene(u)}{marke(u, seite)}</div>
          ))}
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-20 flex items-center rounded-2xl border border-white/10 bg-fl/90 p-1 backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <span className="zahl px-2.5 text-[11px] font-semibold text-white/55">{Math.round(sicht.s * 100)} %</span>
        {([['Zoom in', 'M12 5v14M5 12h14', 1.4], ['Zoom out', 'M5 12h14', 1 / 1.4]] as const).map(([t, d, f]) => (
          <button key={t} type="button" title={t} aria-label={t} className={knopf} onClick={() => { const m = mitte(); zoomen(f, m.x, m.y); }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={d} /></svg>
          </button>
        ))}
        <button type="button" title="Reset view" aria-label="Reset view" className={knopf} onClick={() => setSicht({ s: 1, tx: 0, ty: 0 })}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12 2.5M18.5 9a7 7 0 0 0-12-2.5" /></svg>
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-xl border border-white/10 bg-fl/85 px-3 py-1.5 text-[11px] text-white/50 backdrop-blur lg:block">Scroll to zoom · drag to move · ← → steps the right map, Shift + ← → the left</p>
    </div>
  );
}
