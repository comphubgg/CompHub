import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glas, Titel } from '../../teile/Glas';
import { Fehler, Laedt } from './tools/Gemeinsam';
import MvSeite from '../streamer/mv/Seite';
import { SCHLUESSEL_SEITE, SCHLUESSEL_STAND } from '../streamer/mv/mvTypen';

/*
 * Live Streams (Betreiber, 26.11.2026: Profis UND Streamer/Watch-Partys, daher nicht mehr "Pro Streams").
 * Oben bleibt die Hub-Uebersicht; die Multiview ist die der echten Seite (app/streams/**, portiert nach src/seiten/streamer/mv):
 * Seitenleiste links (Strg + B) mit "Add stream", Liste zum Ziehen, Ordnern, Titelfiltern, Qualitaet, Steuerung, Einstellungen und
 * Einzelansicht - die Wand liegt fest unter dem Kopf, man muss nie scrollen. "+ Multiview" auf einer Karte legt den Kanal in die
 * gespeicherte Wand (multihub_mv_v2) und oeffnet sie.
 *
 * Streams im Hub - wie /streams der echten Seite: die Ordner des Admins (/api/dashboard: Fortnite Pros EU, NA, Streamer), ihr Live-Stand
 * (POST /api/live-status: isLive, viewers, title, bild), ein Raster der sendenden Profis mit Vorschaubild und Zuschauern, Regionsfilter, und eine
 * Multiview aus Twitch-Playern (Embed-Schnittstelle, parent = localhost). Ton immer nur auf einem Stream.
 */

interface Streamer { twitch: string; twitter?: string; anzeige?: string }
interface Ordner { id: string; name: string; streamers: Streamer[] }
interface Stand { isLive: boolean; viewers: number; title?: string; bild?: string | null; unbekannt?: boolean }
interface Kanal { twitch: string; name: string; ordner: string[]; stand?: Stand }

const TAKT = 60_000;

/** Kurzer Regionsname fuer die Filter-Chips: "Fortnite Pros EU" -> "EU". */
const kurz = (name: string) => name.replace(/^Fortnite Pros\s*/i, '') || name;
const zahl = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString('en'));

/** Die Kanaele der gespeicherten Wand (Multiview der echten Seite, localStorage). */
function wandLesen(): string[] {
  try { const j = JSON.parse(localStorage.getItem(SCHLUESSEL_STAND) || 'null'); return Array.isArray(j?.streams) ? j.streams.filter((x: { pov?: string }) => !x.pov).map((x: { kanal: string }) => String(x.kanal).toLowerCase()) : []; } catch { return []; }
}
/** Einen Kanal in die gespeicherte Wand legen (oder herausnehmen) und die Multiview mit offener Seitenleiste vormerken. */
function wandSetzen(kanal: string, rein: boolean) {
  try {
    const j = JSON.parse(localStorage.getItem(SCHLUESSEL_STAND) || 'null') ?? { streams: [], qualitaet: 'auto' };
    const liste: Array<Record<string, unknown>> = Array.isArray(j.streams) ? j.streams : [];
    const da = liste.some((x) => String(x.kanal).toLowerCase() === kanal);
    if (rein && !da) liste.push({ id: Math.random().toString(36).slice(2, 10), nr: Date.now(), kanal, versteckt: false, zeigeOffline: false, einmalig: false, fest: false, qualitaet: '' });
    j.streams = rein ? liste : liste.filter((x) => String(x.kanal).toLowerCase() !== kanal);
    localStorage.setItem(SCHLUESSEL_STAND, JSON.stringify(j));
    localStorage.setItem('multihub_mehrfach', 'true');
    localStorage.setItem(SCHLUESSEL_SEITE, 'true');
  } catch { /* ohne Speicher bleibt die Wand, wie sie ist */ }
}

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
  const [wand, setWand] = useState<string[]>(wandLesen);
  const [mvOffen, setMvOffen] = useState(false);

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

  // Karte "+ Multiview": hinein und die Wand oeffnen; steht er schon drin, nur oeffnen.
  const umschalten = (t: string) => { wandSetzen(t, true); setWand(wandLesen()); setMvOffen(true); };
  // Zurueck aus der Multiview: die Wand kann sich dort geaendert haben.
  useEffect(() => { if (!mvOffen) setWand(wandLesen()); }, [mvOffen]);
  // Escape schliesst nicht (die Multiview braucht es selbst) - zurueck geht es ueber den Knopf.

  const q = suche.trim().toLowerCase();
  const mitStand = kanaele.map((k) => ({ ...k, stand: staende[k.twitch] }));
  const gefiltert = mitStand.filter((k) => (region === 'alle' || k.ordner.includes(region)) && (!q || k.name.toLowerCase().includes(q) || k.twitch.includes(q) || (k.stand?.title ?? '').toLowerCase().includes(q)));
  const live = gefiltert.filter((k) => k.stand?.isLive).sort((a, b) => (b.stand?.viewers ?? 0) - (a.stand?.viewers ?? 0));
  const offline = gefiltert.filter((k) => !k.stand?.isLive).sort((a, b) => a.name.localeCompare(b.name));
  const zuschauerGesamt = live.reduce((s, k) => s + (k.stand?.viewers ?? 0), 0);
  const geladen = Object.keys(staende).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <Titel ueber="Live now" titel="Live Streams" text="Pros, streamers and watch parties on Twitch – who's live, how many are watching, and the full multiview to follow several streams at once." />
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

      {/* Multiview: die der echten Seite, fest unter dem Kopf */}
      <Glas className="flex flex-wrap items-center gap-4 p-4" verzoegerung={0.05}>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 text-lg text-sky-300">▦</span>
        <div className="min-w-0">
          <h3 className="font-bold text-white">Multiview</h3>
          <p className="text-xs text-white/45">{wand.length ? `${wand.length} stream${wand.length === 1 ? '' : 's'} on your wall` : 'Your wall is empty – add streams from the cards or in the side panel'} · side panel with folders, filters and quality · <kbd className="rounded border border-white/15 px-1 font-mono">Ctrl</kbd>+<kbd className="rounded border border-white/15 px-1 font-mono">B</kbd></p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => { try { localStorage.setItem('multihub_mehrfach', 'false'); } catch { /* egal */ } setMvOffen(true); }} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:border-sky-400/60 hover:text-white">Single view</button>
          <button type="button" onClick={() => { try { localStorage.setItem('multihub_mehrfach', 'true'); localStorage.setItem(SCHLUESSEL_SEITE, 'true'); } catch { /* egal */ } setMvOffen(true); }} className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#06080f] shadow-[0_10px_30px_-10px_rgba(56,189,248,0.8)] transition hover:-translate-y-0.5 hover:bg-sky-300">Open multiview →</button>
        </div>
      </Glas>
      {mvOffen && (
        <>
          <MvSeite />
          <button type="button" onClick={() => setMvOffen(false)}
            className="fixed bottom-4 right-4 z-[400] rounded-full border border-white/15 bg-[#06080f]/85 px-4 py-1.5 text-xs font-bold text-white shadow-xl backdrop-blur transition hover:border-sky-400/60 hover:text-sky-300">✕ Back to Live Streams</button>
        </>
      )}

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
