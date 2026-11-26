import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { LinkKopieren } from './Bausteine';
import { Laedt, TEAL, Ueberschrift } from './Teile';

/*
 * Map Evolution (Betreiber, 26.11.2026: Wunsch Nummer eins). Zwei Kartenstaende nebeneinander oder per Schieberegler uebereinander, Zoom und
 * Verschieben fuer beide gleich. Daten wie auf der Seite: /api/karten-updates (jede Kartenversion je Patch mit Kapitel/Saison, lib/kartenUpdates.ts
 * auf main), Bilder ueber /api/maps-bild?u=<Adresse>&b=<Breite> (verkleinert die Seite selbst). Das Turnier-Kartenarchiv liegt unter
 * /competitive/maps (anderer Helfer) - hier nur verlinkt, nichts doppelt.
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
const gruppe = (u: Stand) => (u.kapitel ? `Chapter ${u.kapitel} · ${u.saison}` : 'Newest · not sorted yet');

export default function Entwicklung() {
  const [liste, setListe] = useState<Stand[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useSearchParams();
  const [modus, setModus] = useState<'swipe' | 'nebeneinander'>(() => (suche.get('m') === 'side' ? 'nebeneinander' : 'swipe'));

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
    setSuche({ a: k(na), b: k(nb), ...(m === 'nebeneinander' ? { m: 'side' } : {}) }, { replace: true });
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
  const kapitelB = B?.kapitel;
  const leiste = alle.map((u, i) => ({ u, i })).filter(({ u }) => u.kapitel === kapitelB);

  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Map Evolution" titel="How the island changed" farbe={TEAL}
        text={<>{alle.length} map versions from Chapter 1 to today. Drag the divider, zoom in, step through patches with ← →  (Shift for the left map).</>}
        rechts={<div className="flex flex-wrap items-center gap-2"><LinkKopieren /><Link to="/competitive/maps" className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white">Tournament map archive →</Link></div>} />

      <Glas className="flex flex-wrap items-end gap-x-6 gap-y-4 p-4" verzoegerung={0.08}>
        <Wahl titel="Left · before" alle={alle} i={a} setzen={(i) => setzen(i, b)} farbe="#fbbf24" />
        <button type="button" onClick={() => setzen(b, a)} title="Swap" className="mb-1 grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/60 hover:text-white">⇄</button>
        <Wahl titel="Right · after" alle={alle} i={b} setzen={(i) => setzen(a, i)} farbe={`rgb(${TEAL})`} />
        <div className="ml-auto inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
          {([['swipe', 'Swipe'], ['nebeneinander', 'Side by side']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => { setModus(k); setzen(a, b, k); }} className={`rounded-lg px-3.5 py-1.5 transition ${modus === k ? 'bg-teal-300 text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{t}</button>
          ))}
        </div>
      </Glas>

      {A && B && <Vergleich A={A} B={B} modus={modus} />}

      {/* Zeitleiste des Kapitels der rechten Karte */}
      <Glas className="p-4" verzoegerung={0.12}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">{kapitelB ? `Chapter ${kapitelB}` : 'Newest'} · every patch</p>
          <p className="text-[11px] text-white/35">click = right map · Shift+click = left map</p>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {leiste.map(({ u, i }, k) => {
            const neueSaison = k === 0 || leiste[k - 1].u.saison !== u.saison;
            return (
              <div key={u.patch} className="flex shrink-0 items-end gap-1.5">
                {neueSaison && k > 0 && <span className="mx-1 h-8 w-px bg-white/10" />}
                <button type="button" onClick={(e) => (e.shiftKey ? setzen(i, b) : setzen(a, i))}
                  className={`rounded-xl border px-2.5 py-1.5 text-left transition ${i === b ? 'border-teal-300/60 bg-teal-300/15' : i === a ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 hover:bg-white/5'}`}>
                  {neueSaison && <span className="block text-[9px] font-semibold uppercase tracking-wider text-white/40">{u.saison}</span>}
                  <span className="text-sm font-bold tabular-nums text-white">{u.patch}</span>
                </button>
              </div>
            );
          })}
        </div>
      </Glas>
      <p className="text-xs text-white/35">Map images per patch from the site's map archive. Swipe and side-by-side use the same framing, so both islands line up.</p>
    </div>
  );
}

function Wahl({ titel, alle, i, setzen, farbe }: { titel: string; alle: Stand[]; i: number; setzen: (i: number) => void; farbe: string }) {
  const u = alle[i];
  const gruppen = useMemo(() => { const m: string[] = []; for (const x of alle) if (!m.includes(gruppe(x))) m.push(gruppe(x)); return m; }, [alle]);
  const inGruppe = alle.map((x, k) => ({ x, k })).filter(({ x }) => gruppe(x) === gruppe(u));
  const pfeil = 'grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/60 transition hover:border-white/30 hover:text-white disabled:opacity-25';
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45"><span className="h-2 w-2 rounded-full" style={{ background: farbe }} />{titel}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={pfeil} disabled={i <= 0} onClick={() => setzen(i - 1)} title="Older patch">‹</button>
        <select value={gruppe(u)} onChange={(e) => { const k = alle.findIndex((x) => gruppe(x) === e.target.value); if (k >= 0) setzen(k); }}
          className="rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2 text-sm font-semibold text-white focus:border-teal-300/60 focus:outline-none">
          {gruppen.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={i} onChange={(e) => setzen(Number(e.target.value))} className="rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2 text-sm font-semibold tabular-nums text-white focus:border-teal-300/60 focus:outline-none">
          {inGruppe.map(({ x, k }) => <option key={x.patch} value={k}>v{x.patch}</option>)}
        </select>
        <button type="button" className={pfeil} disabled={i >= alle.length - 1} onClick={() => setzen(i + 1)} title="Newer patch">›</button>
      </div>
    </div>
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
        className={`relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-3xl border border-white/10 bg-[rgb(13,40,80)] active:cursor-grabbing ${modus === 'swipe' ? 'aspect-square max-h-[calc(100vh-180px)] max-w-[calc(100vh-180px)]' : 'grid aspect-[2/1] max-h-[calc(100vh-180px)] grid-cols-2 gap-3 bg-transparent'}`}>
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
