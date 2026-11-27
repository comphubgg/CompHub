import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { LinkKopieren } from './Bausteine';
import { Laedt, TEAL } from './Teile';

/*
 * Map Evolution (Betreiber, 26.11.2026: Wunsch Nummer eins). Zwei Kartenstaende nebeneinander oder per Schieberegler uebereinander, Zoom und
 * Verschieben fuer beide gleich. Daten wie auf der Seite: /api/karten-updates (jede Kartenversion je Patch mit Kapitel/Saison, lib/kartenUpdates.ts
 * auf main), Bilder ueber /api/maps-bild?u=<Adresse>&b=<Breite> (verkleinert die Seite selbst). Das Turnier-Kartenarchiv liegt unter
 * /competitive/maps (anderer Helfer). Betreiber 27.11.2026: nur das Wichtigste - zwei Versionswahlen, nebeneinander/Swipe, Link kopieren.
 * Tasten: Pfeil links/rechts = rechte Karte einen Patch zurueck/vor, mit Umschalt die linke.
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

export default function Entwicklung() {
  const [liste, setListe] = useState<Stand[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useSearchParams();
  // Betreiber 27.11.2026: "nur das Wichtigste" - Standard nebeneinander, Swipe nur als kleiner Schalter.
  const [modus, setModus] = useState<'swipe' | 'nebeneinander'>(() => (suche.get('m') === 'swipe' ? 'swipe' : 'nebeneinander'));

  useEffect(() => {
    fetch('/api/karten-updates').then((r) => r.json()).then((j) => setListe((j?.updates ?? []) as Stand[])).catch(() => setFehler(true));
  }, []);
  // Aelteste zuerst - so laeuft die Zeitleiste von links nach rechts.
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

  if (fehler) return <Glas className="p-6 text-sm text-white/60">The map archive isn't answering right now – try again in a moment.</Glas>;
  if (!liste) return <Laedt farbe={TEAL} text="Loading every map version …" />;
  const A = alle[a]; const B = alle[b];

  // Nur das Wichtigste (Betreiber 27.11.2026): zwei Versionswahlen, Side by side (Swipe als kleiner Schalter), Copy link - und grosse Karten.
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${TEAL})` }}>Community · Map Evolution</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">How the island changed</h1>
        </div>
        <Wahl titel="Before" alle={alle} i={a} setzen={(i) => setzen(i, b)} farbe="#fbbf24" />
        <Wahl titel="After" alle={alle} i={b} setzen={(i) => setzen(a, i)} farbe={`rgb(${TEAL})`} />
        <button type="button" onClick={() => { const m = modus === 'swipe' ? 'nebeneinander' : 'swipe'; setModus(m); setzen(a, b, m); }} title="Switch between side by side and swipe"
          className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${modus === 'swipe' ? 'border-teal-300/50 bg-teal-300/15 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}>
          {modus === 'swipe' ? '⇆ Swipe on' : '⇆ Swipe'}
        </button>
        <LinkKopieren />
      </div>
      {A && B && <Vergleich A={A} B={B} modus={modus} />}
    </div>
  );
}

function Wahl({ titel, alle, i, setzen, farbe }: { titel: string; alle: Stand[]; i: number; setzen: (i: number) => void; farbe: string }) {
  // Eine Auswahl je Seite, nach Kapitel/Saison gruppiert (neueste oben)
  const gruppen = useMemo(() => {
    const m = new Map<string, Array<{ x: Stand; k: number }>>();
    alle.forEach((x, k) => { const g = gruppe(x); m.set(g, [...(m.get(g) ?? []), { x, k }]); });
    return [...m.entries()].reverse();
  }, [alle]);
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45"><span className="h-2 w-2 rounded-full" style={{ background: farbe }} />{titel}</span>
      <select value={i} onChange={(e) => setzen(Number(e.target.value))}
        className="min-w-[230px] rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2 text-sm font-semibold tabular-nums text-white focus:border-teal-300/60 focus:outline-none">
        {gruppen.map(([g, l]) => <optgroup key={g} label={g}>{[...l].reverse().map(({ x, k }) => <option key={x.patch} value={k}>{g} · v{x.patch}</option>)}</optgroup>)}
      </select>
    </label>
  );
}

/* ---------------------------------------------- Vergleichsflaeche: gemeinsamer Zoom, Schieberegler oder nebeneinander */
function Vergleich({ A, B, modus }: { A: Stand; B: Stand; modus: 'swipe' | 'nebeneinander' }) {
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
  useEffect(() => {
    const el = rahmen.current; if (!el) return undefined;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const feld = feldVon(e.clientX - r.left, r.width);
      zoomen(e.deltaY < 0 ? 1.2 : 1 / 1.2, feld.x, e.clientY - r.top);
    };
    el.addEventListener('wheel', rad, { passive: false }); return () => el.removeEventListener('wheel', rad);
  }, [zoomen, modus]);
  // Nebeneinander: Mausposition auf das jeweilige Halbbild umrechnen, damit beide Karten um denselben Punkt zoomen.
  const feldVon = (x: number, w: number) => (modus === 'nebeneinander' ? { x: x > w / 2 ? x - w / 2 - 6 : x } : { x });

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
        ? <div className="grid h-full w-full place-items-center text-center text-sm text-white/45"><div><p className="text-3xl font-black text-white/15">v{u.patch}</p><p className="mt-1">Map image not available right now</p></div></div>
        : <img key={kaputt[u.patch] ?? 0} src={QUELLEN[kaputt[u.patch] ?? 0](u, breite)} alt={`Map v${u.patch}`} draggable={false} referrerPolicy="no-referrer" onError={() => setKaputt((k) => ({ ...k, [u.patch]: (k[u.patch] ?? 0) + 1 }))} className="h-full w-full select-none object-contain" />}
    </div>
  );
  const marke = (u: Stand, farbe: string, rechts?: boolean) => (
    <span className={`pointer-events-none absolute top-3 z-10 rounded-lg bg-[#06080f]/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur ${rechts ? 'right-3' : 'left-3'}`}>
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: farbe }} />{gruppe(u)} · v{u.patch}
    </span>
  );
  const knopf = 'grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#06080f]/75 text-lg font-bold text-white backdrop-blur transition hover:border-teal-300/40';
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative">
      <div ref={rahmen} onPointerDown={(e) => runter(e, 'karte')} onPointerMove={bewegen} onPointerUp={() => { ziehen.current = null; }} onDoubleClick={() => setSicht({ s: 1, tx: 0, ty: 0 })}
        className={`relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-3xl border border-white/10 bg-[rgb(13,40,80)] active:cursor-grabbing ${modus === 'swipe' ? 'aspect-square max-h-[calc(100vh-235px)] max-w-[calc(100vh-235px)]' : 'grid aspect-[2/1] max-h-[calc(100vh-235px)] max-w-[calc((100vh-235px)*2)] grid-cols-2 gap-3 bg-transparent'}`}>
        {modus === 'swipe' ? (
          <>
            {ebene(B)}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - teiler}% 0 0)` }}>{ebene(A)}</div>
            {marke(A, '#fbbf24')}{marke(B, `rgb(${TEAL})`, true)}
            <div className="absolute inset-y-0 z-20 w-8 -translate-x-1/2 cursor-ew-resize" style={{ left: `${teiler}%` }} onPointerDown={(e) => runter(e, 'teiler')}>
              <div className="mx-auto h-full w-[3px] bg-white shadow-[0_0_14px_rgba(0,0,0,0.8)]" />
              <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-[#06080f]/85 text-sm font-black text-white shadow-xl">‹ ›</div>
            </div>
          </>
        ) : (
          [A, B].map((u, i) => (
            <div key={i} className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgb(13,40,80)]">
              {ebene(u)}{marke(u, i ? `rgb(${TEAL})` : '#fbbf24')}
            </div>
          ))
        )}
        <div className="absolute bottom-4 right-4 z-20 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {[['+', 1.4], ['−', 1 / 1.4]].map(([t, f]) => <button key={t as string} type="button" className={knopf} onClick={() => { const r = rahmen.current!.getBoundingClientRect(); zoomen(f as number, (modus === 'swipe' ? r.width : r.width / 2) / 2, r.height / 2); }}>{t as string}</button>)}
          <button type="button" className={knopf} onClick={() => setSicht({ s: 1, tx: 0, ty: 0 })}>⟲</button>
        </div>
      </div>
    </motion.div>
  );
}
