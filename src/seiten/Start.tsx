import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/*
 * Der Startbildschirm im eigenen CompHub-Stil (Betreiber, 26.11.2026: "nicht wie Fortnite, eigener Style, aber das Prinzip ... bei Competitive
 * Slider, wo mehrere Bilder kommen"). Drei Glas-Tafeln: Community links, Competitive in der Mitte (am groessten, mit Bild-Slider), Streamer
 * rechts (Zugangsschluessel). Pfeiltasten waehlen, Enter oeffnet.
 */

interface Bereich { id: string; titel: string; zeile: string; punkte: string[]; bilder: string[]; farbe: string; pfad: string; schloss?: boolean }
const CUP_BILDER = ['/cups/fncs-grand-finals.webp', '/cups/fncs-major.webp', '/cups/elite-cup.webp'];
/* Die Streamer der Tafel: die Streamer-Liste der Seite (/api/streamers, Gruppe "streamer") - keine Pros (Betreiber, 26.11.2026). */
const STREAMER_FALLBACK = ['gripey', 'amar', 'faxuty', 'coachboop', 'katoo', 'aussieantics', 'leothecrack', 'wazz', 'nikof'];

/** Die Streamer-Tafel: eine Wand aus Profilbildern (Twitch, ueber unavatar.io) - kleine Bilder bleiben klein und scharf. */
function StreamerWand({ logins }: { logins: string[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,rgba(167,139,250,0.35),rgba(6,8,15,0.9)_70%)]">
      <div className="absolute inset-x-6 top-14 grid grid-cols-3 gap-4">
        {logins.slice(0, 6).map((l, i) => (
          <motion.div key={l} className="flex flex-col items-center gap-1.5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: [0, -4, 0] }}
            transition={{ opacity: { delay: 0.4 + i * 0.06 }, y: { duration: 4 + (i % 3), repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 } }}>
            <img src={`https://unavatar.io/twitch/${l}`} alt="" className="aspect-square w-full rounded-2xl border border-white/15 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.5)]" />
            <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-wider text-white/60">{l}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Slider({ bilder, farbe }: { bilder: string[]; farbe: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (bilder.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % bilder.length), 3800); return () => clearInterval(t); }, [bilder.length]);
  return (
    <>
      <AnimatePresence initial={false}>
        <motion.img key={bilder[i]} src={bilder[i]} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.1 }}
          className="absolute inset-0 h-full w-full object-cover" style={{ animation: 'kenburns 8s ease-out forwards' }} />
      </AnimatePresence>
      {bilder.length > 1 && (
        <div className="absolute left-5 top-5 z-10 flex gap-1.5">
          {bilder.map((b, k) => (
            <span key={b} className="h-1 overflow-hidden rounded-full bg-white/20" style={{ width: k === i ? 28 : 10, transition: 'width .4s' }}>
              {k === i && <motion.span key={`f${i}`} className="block h-full" style={{ background: `rgb(${farbe})` }} initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 3.8, ease: 'linear' }} />}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function Tafel({ b, gross, aktiv, onWahl, onLos, nr }: { b: Bereich; gross: boolean; aktiv: boolean; onWahl: () => void; onLos: () => void; nr: number }) {
  const mx = useMotionValue(0.5), my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [4, -4]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-5, 5]), { stiffness: 120, damping: 18 });
  return (
    <motion.button type="button"
      initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }} animate={{ opacity: aktiv ? 1 : 0.82, y: 0, filter: 'blur(0px)', scale: aktiv ? 1.02 : 1 }}
      transition={{ delay: 0.15 + nr * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={onWahl} onFocus={onWahl} onClick={onLos}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height); }}
      onMouseLeave={() => { mx.set(0.5); my.set(0.5); }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      className={`group relative shrink-0 overflow-hidden rounded-[28px] border text-left outline-none backdrop-blur-xl transition-colors duration-500 ${aktiv ? 'border-white/25' : 'border-white/10'} ${gross ? 'h-[min(68vh,640px)] w-[min(36vw,560px)]' : 'h-[min(58vh,540px)] w-[min(23vw,340px)]'}`}>
      {b.id === 'streamer' ? <StreamerWand logins={b.bilder} /> : <Slider bilder={b.bilder} farbe={b.farbe} />}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,8,15,0) 30%, rgba(6,8,15,0.75) 65%, rgba(6,8,15,0.97) 100%)' }} />
      <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: `radial-gradient(120% 60% at 50% 110%, rgba(${b.farbe},0.35), transparent 60%)` }} />
      {b.schloss && (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
          Key
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-7">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-6" style={{ background: `rgb(${b.farbe})` }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${b.farbe})` }}>{b.zeile}</span>
        </div>
        <h2 className={`font-text font-extrabold uppercase leading-none tracking-tight text-white ${gross ? 'text-[min(4.4vw,64px)]' : 'text-[min(2.6vw,36px)]'}`}>{b.titel}</h2>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {b.punkte.map((p) => <span key={p} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/75">{p}</span>)}
        </div>
      </div>
    </motion.button>
  );
}

export default function Start() {
  const [aktiv, setAktiv] = useState(1);
  const [banner, setBanner] = useState<string[]>([]);
  const [streamer, setStreamer] = useState<string[]>(STREAMER_FALLBACK);
  const nav = useNavigate();
  useEffect(() => {
    // Epics Banner in voller Aufloesung (1920x1080 und groesser) - die kleinen Kopien waren verpixelt.
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => {
      const alle = (j.cups ?? []).map((c: { bild?: string }) => c.bild).filter((x: unknown): x is string => typeof x === 'string' && x.startsWith('https://cdn2.unrealengine.com'));
      setBanner([...new Set<string>(alle)].slice(0, 8));
    }).catch(() => {});
    fetch('/api/streamers').then((r) => r.json()).then((j) => {
      const l = (j.streamers?.streamer ?? []).map((s: { twitch?: string }) => s.twitch).filter((x: unknown): x is string => typeof x === 'string' && x !== 'fortnite');
      if (l.length) setStreamer(l);
    }).catch(() => {});
  }, []);
  const BEREICHE: Bereich[] = [
    { id: 'community', titel: 'Community', zeile: 'Explore the island', punkte: ['Map', 'Loot', 'Weapons', 'Player count'], bilder: ['/bilder/karte-orte.png'], farbe: '45,212,191', pfad: '/community' },
    { id: 'competitive', titel: 'Competitive', zeile: 'Live · Stats · Rankings', punkte: ['Live cups', 'Player stats', 'Power rankings', 'Match finder', 'Deep stats'], bilder: [...CUP_BILDER.slice(0, 1), ...banner, ...CUP_BILDER.slice(1)], farbe: '56,189,248', pfad: '/competitive' },
    { id: 'streamer', titel: 'Streamer', zeile: 'For creators', punkte: ['Overlays', 'Your page', 'Tools'], bilder: streamer, farbe: '167,139,250', pfad: '/streamer', schloss: true },
  ];
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setAktiv((a) => Math.max(0, a - 1));
      if (e.key === 'ArrowRight') setAktiv((a) => Math.min(2, a + 1));
      if (e.key === 'Enter') nav(['/community', '/competitive', '/streamer'][aktiv]);
    };
    addEventListener('keydown', t); return () => removeEventListener('keydown', t);
  }, [aktiv, nav]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 px-6 py-10">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="flex items-center gap-3">
        <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-14 w-auto drop-shadow-[0_0_24px_rgba(56,189,248,0.55)]" />
        <span className="text-3xl font-extrabold tracking-tight text-white">Comp<span className="text-sky-400">Hub</span></span>
      </motion.div>
      <div className="flex items-center justify-center gap-5">
        {BEREICHE.map((b, i) => (
          <Tafel key={b.id} b={b} nr={i === 1 ? 0 : i === 0 ? 1 : 2} gross={i === 1} aktiv={aktiv === i} onWahl={() => setAktiv(i)} onLos={() => nav(b.pfad)} />
        ))}
      </div>
      <motion.button type="button" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={() => nav(BEREICHE[aktiv].pfad)}
        className="group flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.06] py-3 pl-7 pr-3 text-sm font-semibold uppercase tracking-[0.25em] text-white backdrop-blur-xl hover:bg-white/10">
        Enter {BEREICHE[aktiv].titel}
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-400 text-[#06080f] transition-transform group-hover:translate-x-1">→</span>
      </motion.button>
    </main>
  );
}
