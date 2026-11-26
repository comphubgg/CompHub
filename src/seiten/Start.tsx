import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/*
 * Der Startbildschirm (wie Fortnites Modus-Auswahl): drei grosse Karten - Community links, Competitive in der Mitte (am groessten), Streamer
 * rechts (mit Zugangsschluessel). Pfeiltasten waehlen, Enter oeffnet. Karten kippen mit der Maus, leuchten beim Ueberfahren.
 */

interface Bereich { id: string; titel: string[]; unter: string; bild: string; farbe: string; pfad: string; schloss?: boolean }
const BEREICHE: Bereich[] = [
  { id: 'community', titel: ['COMMUNITY'], unter: 'Map · Loot · Weapons · Player count', bild: '/bilder/karte-s43.png', farbe: '56,189,248', pfad: '/community' },
  { id: 'competitive', titel: ['COMPETI', 'TIVE'], unter: 'Live cups · Stats · Rankings · Match finder', bild: '/cups/fncs-grand-finals.webp', farbe: '250,204,21', pfad: '/competitive' },
  { id: 'streamer', titel: ['STREAMER'], unter: 'Overlays · Your page · Tools', bild: '/cups/console-champions-cup.webp', farbe: '168,85,247', pfad: '/streamer', schloss: true },
];

function Karte({ b, gross, aktiv, onWahl, onLos, nr }: { b: Bereich; gross: boolean; aktiv: boolean; onWahl: () => void; onLos: () => void; nr: number }) {
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 150, damping: 15 });
  const ry = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 150, damping: 15 });
  const licht = useTransform([mx, my] as never, ([x, y]: number[]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.22), transparent 55%)`);
  return (
    <motion.button type="button"
      initial={{ opacity: 0, y: 80, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: aktiv ? (gross ? 1.04 : 1.03) : 1 }}
      transition={{ delay: 0.25 + nr * 0.12, type: 'spring', stiffness: 120, damping: 16 }}
      onMouseEnter={onWahl} onFocus={onWahl} onClick={onLos}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height); }}
      onMouseLeave={() => { mx.set(0.5); my.set(0.5); }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900, boxShadow: aktiv ? `0 0 0 3px rgba(${b.farbe},0.9), 0 0 60px rgba(${b.farbe},0.45), 0 30px 80px rgba(0,0,0,0.6)` : '0 20px 60px rgba(0,0,0,0.5)' }}
      className={`group relative shrink-0 overflow-hidden rounded-2xl bg-zinc-900 text-left outline-none ${gross ? 'h-[min(66vh,620px)] w-[min(30vw,430px)]' : 'h-[min(56vh,520px)] w-[min(24vw,340px)]'}`}>
      <img src={b.bild} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(${b.farbe},0.10) 0%, rgba(5,7,13,0.15) 35%, rgba(5,7,13,0.92) 100%)` }} />
      <motion.div className="pointer-events-none absolute inset-0" style={{ background: licht }} />
      {/* Glanzstreifen, der beim Ueberfahren durchzieht */}
      <div className="pointer-events-none absolute -inset-y-10 -left-1/2 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
      {b.schloss && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-violet-200 backdrop-blur">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
          Access key
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-6">
        <h2 className={`font-titel leading-[0.85] tracking-wide text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] ${gross ? 'text-[min(8vw,120px)]' : 'text-[min(5.5vw,80px)]'}`}>
          {b.titel.map((z) => <span key={z} className="block">{z}</span>)}
        </h2>
        <p className="mt-3 text-sm font-medium text-slate-300">{b.unter}</p>
        <div className="mt-4 h-1 w-0 rounded-full transition-all duration-500 group-hover:w-24" style={{ background: `rgb(${b.farbe})` }} />
      </div>
    </motion.button>
  );
}

export default function Start() {
  const [aktiv, setAktiv] = useState(1);
  const nav = useNavigate();
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setAktiv((a) => Math.max(0, a - 1));
      if (e.key === 'ArrowRight') setAktiv((a) => Math.min(2, a + 1));
      if (e.key === 'Enter') nav(BEREICHE[aktiv].pfad);
    };
    addEventListener('keydown', t); return () => removeEventListener('keydown', t);
  }, [aktiv, nav]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-10">
      <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center">
        <h1 className="font-titel text-6xl tracking-[0.12em] text-white drop-shadow-[0_0_30px_rgba(56,189,248,0.5)]">COMP<span className="text-sky-400">HUB</span></h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Choose your mode</p>
      </motion.div>
      <div className="flex items-end justify-center gap-6">
        {BEREICHE.map((b, i) => (
          <Karte key={b.id} b={b} nr={i === 1 ? 0 : i === 0 ? 1 : 2} gross={i === 1} aktiv={aktiv === i} onWahl={() => setAktiv(i)} onLos={() => nav(b.pfad)} />
        ))}
      </div>
      <motion.button type="button" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => nav(BEREICHE[aktiv].pfad)}
        className="-skew-x-6 bg-yellow-300 px-16 py-3 font-titel text-4xl tracking-wider text-black shadow-[0_0_40px_rgba(250,204,21,0.45)]">
        <span className="inline-block skew-x-6">EXPLORE</span>
      </motion.button>
    </main>
  );
}
