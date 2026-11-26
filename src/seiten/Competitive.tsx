import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import Kopf from '../teile/Kopf';

/*
 * Competitive (Betreiber, 26.11.2026: "alles, was jetzt drin ist, in einfach 10-mal geiler, animiert, Effekte, angeordnet"). Oben live und als
 * Naechstes, dann die Top-Spieler der Power Rankings, dann alle Werkzeuge. Daten von thecomphub.com (/api/cup-catalog, /api/power-rankings).
 */

interface Fenster { status: string; begin: number; end: number; name?: string; windowId?: string }
interface Cup { id: string; titel: string; bild?: string; farbe?: string; regionen?: Record<string, Fenster[]> }
interface Spieler { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; deltaPlatz: number; bild?: string | null }

const SEITE = 'https://www.thecomphub.com';
const uhr = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`; };
const flagge = (l?: string) => l ? `${SEITE}/flags/${l.toLowerCase()}.png` : '';

function useJetzt() { const [t, setT] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []); return t; }

function LiveLeiste({ cups }: { cups: Cup[] }) {
  const jetzt = useJetzt();
  const { live, naechste } = useMemo(() => {
    const live: Array<{ cup: Cup; region: string; f: Fenster }> = []; const kommt: Array<{ cup: Cup; region: string; f: Fenster }> = [];
    for (const c of cups) for (const [r, ws] of Object.entries(c.regionen ?? {})) for (const f of ws) {
      if (f.begin <= jetzt && f.end >= jetzt) live.push({ cup: c, region: r, f });
      else if (f.begin > jetzt && f.begin - jetzt < 36 * 3600e3) kommt.push({ cup: c, region: r, f });
    }
    kommt.sort((a, b) => a.f.begin - b.f.begin);
    return { live, naechste: kommt.slice(0, 6) };
  }, [cups, jetzt]);
  return (
    <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">Live now</h2>
        </div>
        {live.length === 0 ? <p className="mt-6 text-2xl font-bold text-white/70">No cup running right now.</p> : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {live.slice(0, 4).map(({ cup, region, f }, i) => (
              <motion.a key={cup.id + region} href={`${SEITE}/events/${cup.id}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10">
                {cup.bild && <img src={cup.bild} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 transition duration-700 group-hover:scale-105 group-hover:opacity-60" />}
                <div className="relative bg-gradient-to-t from-black/80 to-transparent p-4 pt-16">
                  <p className="text-xs font-semibold text-sky-300">{region} · ends in {uhr(f.end - jetzt)}</p>
                  <p className="mt-1 text-lg font-bold leading-tight text-white">{cup.titel}</p>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Up next</h2>
        <ul className="mt-4 space-y-2.5">
          {naechste.map(({ cup, region, f }) => (
            <li key={cup.id + region + f.begin} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="w-10 shrink-0 rounded-md bg-white/10 py-1 text-center text-[11px] font-bold text-white/80">{region}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{cup.titel}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-sky-300">{uhr(f.begin - jetzt)}</span>
            </li>
          ))}
          {naechste.length === 0 && <li className="text-sm text-white/50">Nothing in the next 36 hours.</li>}
        </ul>
      </div>
    </section>
  );
}

function TopSpieler({ spieler }: { spieler: Spieler[] }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">Power Rankings</h2>
        <a href={`${SEITE}/power-rankings`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-400 hover:text-sky-300">All 10,000 →</a>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {spieler.slice(0, 10).map((s, i) => (
          <motion.a key={s.id} href={`${SEITE}/player/${s.id}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
            whileHover={{ y: -6 }} className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-sky-500/10 to-white/[0.02]">
            {s.bild && <img src={s.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_15%] transition duration-700 group-hover:scale-105" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/30 to-transparent" />
            <span className={`absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${i === 0 ? 'bg-yellow-300 text-black' : i < 3 ? 'bg-white text-black' : 'bg-black/60 text-white backdrop-blur'}`}>{s.rank}</span>
            {s.deltaPlatz !== 0 && <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.deltaPlatz > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{s.deltaPlatz > 0 ? '▲' : '▼'} {Math.abs(s.deltaPlatz)}</span>}
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className="flex items-center gap-1.5">
                {s.land && <img src={flagge(s.land)} alt="" className="h-3.5 w-5 rounded-sm object-cover" />}
                <p className="truncate text-base font-bold text-white">{s.anzeige || s.name}</p>
              </div>
              <p className="text-xs tabular-nums text-white/60">{s.wertung.toLocaleString('en')} pts</p>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}

const WERKZEUGE = [
  { titel: 'Live leaderboards', text: 'Every cup, every region, live.', pfad: '/events', farbe: '56,189,248' },
  { titel: 'Player stats', text: 'Damage, elims, mats from replays.', pfad: '/statistics', farbe: '45,212,191' },
  { titel: 'Deep stats', text: 'Damage per weapon, third parties, heatmaps.', pfad: '/deep-stats', farbe: '167,139,250' },
  { titel: 'Match finder', text: 'Live match IDs of the pros.', pfad: '/match-finder', farbe: '248,113,113' },
  { titel: 'Replays', text: 'Watch any cup match in 2D.', pfad: '/replays', farbe: '250,204,21' },
  { titel: 'Predictions', text: 'Who qualifies? Pick your winners.', pfad: '/predictions', farbe: '74,222,128' },
];

export default function Competitive() {
  const [cups, setCups] = useState<Cup[]>([]);
  const [spieler, setSpieler] = useState<Spieler[]>([]);
  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups(j.cups ?? [])).catch(() => {});
    fetch('/api/power-rankings?page=1&pageSize=10').then((r) => r.json()).then((j) => setSpieler(j.players ?? [])).catch(() => {});
  }, []);
  return (
    <div className="min-h-screen">
      <Kopf bereich="competitive" />
      <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">Competitive</p>
          <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">The pro scene, live.</h1>
        </motion.div>
        <LiveLeiste cups={cups} />
        <TopSpieler spieler={spieler} />
        <section>
          <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">Tools</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WERKZEUGE.map((w, i) => (
              <motion.a key={w.titel} href={`${SEITE}${w.pfad}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
                whileHover={{ y: -4 }} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60" style={{ background: `rgb(${w.farbe})` }} />
                <p className="relative text-lg font-bold text-white">{w.titel}</p>
                <p className="relative mt-1 text-sm text-white/60">{w.text}</p>
                <p className="relative mt-4 text-sm font-semibold" style={{ color: `rgb(${w.farbe})` }}>Open →</p>
              </motion.a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
