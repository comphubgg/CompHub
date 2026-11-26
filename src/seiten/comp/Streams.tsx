import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glas, Titel } from '../../teile/Glas';
import { Fehler, Laedt } from './tools/Gemeinsam';
import TwitchKachel from './tools/TwitchKachel';

/*
 * Streams im Hub - wie /streams der echten Seite: die Ordner des Admins (/api/dashboard: Fortnite Pros EU, NA, Streamer), ihr Live-Stand
 * (POST /api/live-status: isLive, viewers, title, bild), ein Raster der sendenden Profis mit Vorschaubild und Zuschauern, Regionsfilter, und eine
 * Multiview aus Twitch-Playern (Embed-Schnittstelle, parent = localhost). Ton immer nur auf einem Stream.
 */

interface Streamer { twitch: string; twitter?: string; anzeige?: string }
interface Ordner { id: string; name: string; streamers: Streamer[] }
interface Stand { isLive: boolean; viewers: number; title?: string; bild?: string | null; unbekannt?: boolean }
interface Kanal { twitch: string; name: string; ordner: string[]; stand?: Stand }

const SPEICHER_WAND = 'hub:streams-wand';
const MAX_WAND = 9;
const TAKT = 60_000;

/** Kurzer Regionsname fuer die Filter-Chips: "Fortnite Pros EU" -> "EU". */
const kurz = (name: string) => name.replace(/^Fortnite Pros\s*/i, '') || name;
const zahl = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString('en'));

/** Spaltenzahl der Wand je nach Anzahl Streams. */
const spalten = (n: number) => (n <= 1 ? 'grid-cols-1' : n === 2 || n === 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3');

function Zuschauer({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{zahl(n)}
    </span>
  );
}

function StreamKarte({ k, i, takt, aufWand, umschalten }: { k: Kanal; i: number; takt: number; aufWand: boolean; umschalten: () => void }) {
  const [bildFehlt, setBildFehlt] = useState(false);
  return (
    <motion.article layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: Math.min(i, 16) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5 }}
      className={`group overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl transition-colors ${aufWand ? 'border-sky-400/60 shadow-[0_0_30px_-10px_rgba(56,189,248,0.7)]' : 'border-white/10 hover:border-white/20'}`}>
      <button type="button" onClick={umschalten} className="relative block aspect-video w-full overflow-hidden bg-black/40 text-left">
        {!bildFehlt
          ? <img src={`https://static-cdn.jtvnw.net/previews-ttv/live_user_${k.twitch}-640x360.jpg?t=${takt}`} alt="" loading="lazy" onError={() => setBildFehlt(true)}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
          : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-500/20 via-sky-500/10 to-transparent"><span className="text-3xl font-black text-white/20">{k.name}</span></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Live</span>
        <span className="absolute right-3 top-3"><Zuschauer n={k.stand?.viewers ?? 0} /></span>
        <span className={`absolute bottom-3 right-3 rounded-full px-3 py-1 text-[11px] font-bold transition ${aufWand ? 'bg-sky-400 text-[#06080f]' : 'bg-white/15 text-white opacity-0 backdrop-blur group-hover:opacity-100'}`}>
          {aufWand ? '✓ In multiview' : '+ Multiview'}
        </span>
      </button>
      <div className="flex gap-3 p-4">
        {k.stand?.bild ? <img src={k.stand.bild} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-red-500/70" />
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white/50">{k.name.slice(0, 1).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a href={`https://twitch.tv/${k.twitch}`} target="_blank" rel="noreferrer" className="truncate font-bold text-white hover:text-sky-300">{k.name}</a>
            {k.ordner.map((o) => <span key={o} className="shrink-0 rounded-full border border-white/10 px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-white/45">{kurz(o)}</span>)}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/50" title={k.stand?.title}>{k.stand?.title || '—'}</p>
        </div>
      </div>
    </motion.article>
  );
}

export default function Streams() {
  const [ordner, setOrdner] = useState<Ordner[] | null>(null);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [takt, setTakt] = useState(() => Math.floor(Date.now() / TAKT));
  const [fehler, setFehler] = useState('');
  const [region, setRegion] = useState<string>('alle');
  const [suche, setSuche] = useState('');
  const [offlineAuf, setOfflineAuf] = useState(false);
  const [wand, setWand] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(SPEICHER_WAND) || '[]'); } catch { return []; } });
  const [ton, setTon] = useState<string>('');
  const [gross, setGross] = useState<string>('');

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then((j) => setOrdner(Array.isArray(j?.folders) ? j.folders : []))
      .catch(() => { setOrdner([]); setFehler('Could not load the stream folders'); });
  }, []);

  // Alle Kanaele aus allen Ordnern, Doppeltes zusammengelegt (ein Kanal kann in mehreren Ordnern stehen).
  const kanaele = useMemo(() => {
    const m = new Map<string, Kanal>();
    for (const o of ordner ?? []) {
      for (const s of o.streamers ?? []) {
        const t = String(s.twitch || '').trim().toLowerCase();
        if (!t || t === 'darmfn_') continue;
        const k = m.get(t) ?? { twitch: t, name: s.anzeige || t, ordner: [] };
        if (!k.ordner.includes(o.name)) k.ordner.push(o.name);
        m.set(t, k);
      }
    }
    return [...m.values()];
  }, [ordner]);

  const ladeStand = useCallback(() => {
    if (!kanaele.length) return;
    fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: kanaele.map((k) => k.twitch) }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Record<string, Stand>) => {
        // Unbekannt (Twitch nicht erreichbar): den letzten Stand behalten statt "offline" zu raten.
        setStaende((alt) => { const n = { ...alt }; for (const [k, v] of Object.entries(j)) if (!v?.unbekannt) n[k.toLowerCase()] = v; return n; });
        setTakt(Math.floor(Date.now() / TAKT));
      })
      .catch(() => setFehler('Live status is not available right now'));
  }, [kanaele]);
  useEffect(() => { ladeStand(); const id = window.setInterval(ladeStand, TAKT); return () => window.clearInterval(id); }, [ladeStand]);

  useEffect(() => { try { localStorage.setItem(SPEICHER_WAND, JSON.stringify(wand)); } catch { /* egal */ } }, [wand]);
  const umschalten = (t: string) => setWand((w) => (w.includes(t) ? w.filter((x) => x !== t) : w.length >= MAX_WAND ? w : [...w, t]));

  const q = suche.trim().toLowerCase();
  const mitStand = kanaele.map((k) => ({ ...k, stand: staende[k.twitch] }));
  const gefiltert = mitStand.filter((k) => (region === 'alle' || k.ordner.includes(region)) && (!q || k.name.toLowerCase().includes(q) || k.twitch.includes(q) || (k.stand?.title ?? '').toLowerCase().includes(q)));
  const live = gefiltert.filter((k) => k.stand?.isLive).sort((a, b) => (b.stand?.viewers ?? 0) - (a.stand?.viewers ?? 0));
  const offline = gefiltert.filter((k) => !k.stand?.isLive).sort((a, b) => a.name.localeCompare(b.name));
  const zuschauerGesamt = live.reduce((s, k) => s + (k.stand?.viewers ?? 0), 0);
  const geladen = Object.keys(staende).length > 0;
  const wandKanaele = wand.map((t) => mitStand.find((k) => k.twitch === t) ?? { twitch: t, name: t, ordner: [] as string[], stand: undefined });
  const zeigen = gross ? wandKanaele.filter((k) => k.twitch === gross) : wandKanaele;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <Titel ueber="Live now" titel="Pro Streams" text="Every tracked Fortnite pro on Twitch – who's live, how many are watching, and a multiview to follow several POVs at once." />
        {geladen && (
          <div className="ml-auto flex gap-8">
            {[['Live', live.length, 'text-red-400'], ['Watching', zahl(zuschauerGesamt), 'text-white'], ['Tracked', gefiltert.length, 'text-white/60']].map(([t, v, c], i) => (
              <motion.div key={String(t)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
                <p className={`text-3xl font-extrabold tabular-nums ${c}`}>{v}</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{t}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Multiview */}
      <AnimatePresence>
        {wand.length > 0 && (
          <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Glas className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
                <h3 className="font-bold text-white">Multiview</h3>
                <span className="text-xs text-white/40">{wand.length}/{MAX_WAND} · sound on one stream at a time</span>
                {gross && <button type="button" onClick={() => setGross('')} className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70 hover:border-sky-400/60 hover:text-sky-300">Show all {wand.length}</button>}
                <button type="button" onClick={() => { setWand([]); setGross(''); setTon(''); }} className="ml-auto rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-rose-400/60 hover:text-rose-300">Clear</button>
              </div>
              <div className={`grid gap-3 ${spalten(zeigen.length)}`}>
                {zeigen.map((k) => (
                  <motion.div key={k.twitch} layout className={`group relative aspect-video overflow-hidden rounded-2xl border bg-black ${ton === k.twitch ? 'border-sky-400/70' : 'border-white/10'}`}>
                    <TwitchKachel kanal={k.twitch} ton={ton === k.twitch} />
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent p-2.5 opacity-0 transition group-hover:opacity-100">
                      <span className="text-sm font-bold text-white">{k.name}</span>
                      {k.stand?.isLive ? <Zuschauer n={k.stand.viewers} /> : <span className="rounded bg-white/10 px-1.5 text-[10px] text-white/60">offline</span>}
                      <span className="pointer-events-auto ml-auto flex gap-1.5">
                        <button type="button" onClick={() => setTon(ton === k.twitch ? '' : k.twitch)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${ton === k.twitch ? 'bg-sky-400 text-[#06080f]' : 'bg-white/15 text-white hover:bg-white/25'}`}>{ton === k.twitch ? 'Sound on' : 'Sound'}</button>
                        <button type="button" onClick={() => setGross(gross === k.twitch ? '' : k.twitch)} className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25">{gross === k.twitch ? 'Back' : 'Focus'}</button>
                        <button type="button" onClick={() => { umschalten(k.twitch); if (gross === k.twitch) setGross(''); }} className="rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-500">✕</button>
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Glas>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Filter */}
      <Glas className="flex flex-wrap items-center gap-3 p-3" verzoegerung={0.1}>
        <div className="flex flex-wrap rounded-full border border-white/10 bg-black/20 p-1 text-sm font-semibold">
          {[{ id: 'alle', name: 'All regions' }, ...(ordner ?? []).map((o) => ({ id: o.name, name: kurz(o.name) }))].map((r) => (
            <button key={r.id} type="button" onClick={() => setRegion(r.id)} className="relative rounded-full px-4 py-1.5">
              {region === r.id && <motion.span layoutId="st-region" className="absolute inset-0 rounded-full bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className={`relative ${region === r.id ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{r.name}</span>
            </button>
          ))}
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search name or stream title (e.g. “finals”)…"
          className="ml-auto w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-96" />
      </Glas>

      {fehler && <Fehler text={fehler} />}
      {!ordner || (!geladen && !fehler) ? <Laedt text="Checking who's live …" /> : (
        <>
          {live.length === 0
            ? <Glas className="p-12 text-center text-sm text-white/45">Nobody{region !== 'alle' ? ` in ${kurz(region)}` : ''} is live right now{q ? ' for this search' : ''}.</Glas>
            : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <AnimatePresence>
                  {live.map((k, i) => <StreamKarte key={k.twitch} k={k} i={i} takt={takt} aufWand={wand.includes(k.twitch)} umschalten={() => umschalten(k.twitch)} />)}
                </AnimatePresence>
              </div>
            )}

          <Glas className="p-5" verzoegerung={0.2}>
            <button type="button" onClick={() => setOfflineAuf(!offlineAuf)} className="flex w-full items-center gap-3 text-left">
              <h3 className="font-bold text-white">Offline</h3>
              <span className="text-xs text-white/40">{offline.length} channels</span>
              <motion.span animate={{ rotate: offlineAuf ? 180 : 0 }} className="ml-auto text-white/40">▾</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {offlineAuf && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                    {offline.map((k) => (
                      <div key={k.twitch} className="group flex items-center gap-2 rounded-xl border border-white/[0.05] bg-black/20 px-2.5 py-2">
                        {k.stand?.bild ? <img src={k.stand.bild} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover opacity-60 grayscale" />
                          : <span className="h-7 w-7 shrink-0 rounded-full bg-white/10" />}
                        <a href={`https://twitch.tv/${k.twitch}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-white/60 hover:text-white">{k.name}</a>
                        <button type="button" title="Add to multiview anyway" onClick={() => umschalten(k.twitch)}
                          className={`text-xs font-bold ${wand.includes(k.twitch) ? 'text-sky-400' : 'text-white/25 opacity-0 group-hover:opacity-100 hover:text-sky-300'}`}>{wand.includes(k.twitch) ? '✓' : '+'}</button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Glas>
        </>
      )}
    </div>
  );
}
