import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { kurz, type Punkt } from './daten';

/*
 * Diagramme und Zahlen fuer die Live-Seiten: Verlauf (Flaechen-/Liniendiagramm mit Fadenkreuz und Tooltip, Linie zeichnet sich ein),
 * Mini-Verlauf (Sparkline in Karten) und Zahl (zaehlt beim Erscheinen hoch). Alles respektiert "weniger Bewegung".
 */
export interface Serie { name: string; farbe: string; punkte: Punkt[] }

const zeitText = (t: number, spanne: number) => new Date(t).toLocaleString('en-GB', spanne > 2 * 864e5 ? { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });

/** `format` (optional) schreibt Achse und Tooltip, z. B. Prozent oder Minuten - ohne: ganze Zahlen. */
export function Verlauf({ serien, hoehe = 280, flaeche = true, gestapelt = false, format }: { serien: Serie[]; hoehe?: number; flaeche?: boolean; gestapelt?: boolean; format?: (n: number) => string }) {
  const ruhig = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const B = 1000; const H = hoehe;
  const { zeiten, min, max, y, pfade } = useMemo(() => {
    const zeiten = [...new Set(serien.flatMap((s) => s.punkte.map((p) => p.t)))].sort((a, b) => a - b);
    const wert = (s: Serie, t: number) => s.punkte.find((p) => p.t === t)?.v;
    // gestapelt: Werte je Zeitpunkt aufsummieren (Reihenfolge der Serien = von unten nach oben)
    const stapel = serien.map((s, i) => zeiten.map((t) => (gestapelt ? serien.slice(0, i + 1).reduce((a, x) => a + (wert(x, t) ?? 0), 0) : wert(s, t))));
    const alle = stapel.flat().filter((v): v is number => v !== undefined);
    const max = Math.max(1, ...alle) * 1.08; const min = 0;
    const x = (t: number) => (zeiten.length > 1 ? ((t - zeiten[0]) / (zeiten.at(-1)! - zeiten[0])) * B : B / 2);
    const y = (v: number) => H - 8 - ((v - min) / (max - min)) * (H - 24);
    const pfade = stapel.map((reihe) => {
      const pk = zeiten.map((t, i) => [x(t), reihe[i]] as const).filter((p): p is readonly [number, number] => p[1] !== undefined);
      const linie = pk.map(([px, v], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      return { linie, flaeche: pk.length ? `${linie} L${pk.at(-1)![0].toFixed(1)} ${H} L${pk[0][0].toFixed(1)} ${H} Z` : '' };
    });
    return { zeiten, min, max, y, pfade, x };
  }, [serien, gestapelt, H]);
  if (zeiten.length < 2) return <div className="grid place-items-center text-sm text-white/40" style={{ height: hoehe }}>Not enough data points for a chart yet.</div>;
  const spanne = zeiten.at(-1)! - zeiten[0];
  const hi = hover !== null ? zeiten[hover] : null;
  const hx = hi !== null ? ((hi - zeiten[0]) / spanne) * 100 : 0;
  function bewegen(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const anteil = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const t = zeiten[0] + anteil * spanne;
    let best = 0; for (let i = 1; i < zeiten.length; i++) if (Math.abs(zeiten[i] - t) < Math.abs(zeiten[best] - t)) best = i;
    setHover(best);
  }
  const id = `vl-${serien.map((s) => s.name).join('-').replace(/\W/g, '')}`;
  return (
    <div ref={box} className="relative touch-none select-none" style={{ height: hoehe }} onPointerMove={bewegen} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>{serien.map((s, i) => <linearGradient key={i} id={`${id}-${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.farbe} stopOpacity={gestapelt ? 0.5 : 0.32} /><stop offset="1" stopColor={s.farbe} stopOpacity={gestapelt ? 0.15 : 0} /></linearGradient>)}</defs>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1="0" x2={B} y1={y(min + (max - min) * g / 1.08)} y2={y(min + (max - min) * g / 1.08)} stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />)}
        {/* Linie zeichnet sich von links nach rechts ein (Maske), Flaeche blendet ein */}
        <clipPath id={`${id}-clip`}><motion.rect x="0" y="-20" height={H + 40} initial={{ width: ruhig ? B : 0 }} animate={{ width: B }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} /></clipPath>
        <g clipPath={`url(#${id}-clip)`}>
          {[...pfade].map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
            <g key={serien[i].name}>
              {(flaeche || gestapelt) && <path d={p.flaeche} fill={`url(#${id}-${i})`} />}
              <path d={p.linie} fill="none" stroke={serien[i].farbe} strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      </svg>
      {/* Achsen-Beschriftung */}
      <div className="pointer-events-none absolute right-0 top-0 text-[10px] tabular-nums text-white/30">{(format ?? kurz)(max / 1.08)}</div>
      <div className="pointer-events-none absolute inset-x-0 -bottom-5 flex justify-between text-[10px] tabular-nums text-white/30"><span>{zeitText(zeiten[0], spanne)}</span><span>{zeitText(zeiten.at(-1)!, spanne)}</span></div>
      {hi !== null && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: `${hx}%` }} />
          <div className={`pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-xl border border-white/10 bg-[#0b1220]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur ${hx > 60 ? '-translate-x-[calc(100%+10px)]' : 'translate-x-[10px]'}`} style={{ left: `${hx}%` }}>
            <p className="mb-1 font-semibold text-white/50">{new Date(hi).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            {serien.map((s) => { const v = s.punkte.find((p) => p.t === hi)?.v; return v === undefined ? null : <p key={s.name} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-white/70"><span className="h-2 w-2 rounded-full" style={{ background: s.farbe }} />{s.name}</span><span className="font-bold tabular-nums text-white">{format ? format(v) : Math.round(v).toLocaleString('en')}</span></p>; })}
          </div>
        </>
      )}
    </div>
  );
}

export function MiniVerlauf({ punkte, farbe, hoehe = 40 }: { punkte: Punkt[]; farbe: string; hoehe?: number }) {
  const ruhig = useReducedMotion();
  if (punkte.length < 2) return <div style={{ height: hoehe }} />;
  const t0 = punkte[0].t; const t1 = punkte.at(-1)!.t; const max = Math.max(1, ...punkte.map((p) => p.v));
  const d = punkte.map((p, i) => `${i ? 'L' : 'M'}${(((p.t - t0) / (t1 - t0 || 1)) * 200).toFixed(1)} ${(hoehe - 2 - (p.v / max) * (hoehe - 6)).toFixed(1)}`).join(' ');
  return (
    <motion.svg viewBox={`0 0 200 ${hoehe}`} preserveAspectRatio="none" className="w-full" style={{ height: hoehe }} initial={ruhig ? false : { opacity: 0, clipPath: 'inset(0 100% 0 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.9 }}>
      <path d={`${d} L200 ${hoehe} L0 ${hoehe} Z`} fill={farbe} opacity="0.12" />
      <path d={d} fill="none" stroke={farbe} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </motion.svg>
  );
}

/** Zaehlt beim Erscheinen von 0 (bzw. dem alten Wert) auf den neuen hoch. */
export function Zahl({ wert, format = (n: number) => Math.round(n).toLocaleString('en'), className = '' }: { wert: number | null | undefined; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const sicht = useInView(ref, { once: true });
  const ruhig = useReducedMotion();
  const alt = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || wert === null || wert === undefined || !Number.isFinite(wert)) return;
    if (ruhig) { el.textContent = format(wert); alt.current = wert; return; }
    if (!sicht) return;
    const st = animate(alt.current, wert, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = format(v); } });
    alt.current = wert;
    return () => st.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert, sicht, ruhig]);
  return <span ref={ref} className={`tabular-nums ${className}`}>{wert === null || wert === undefined || !Number.isFinite(wert) ? '—' : format(0)}</span>;
}
