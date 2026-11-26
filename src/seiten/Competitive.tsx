import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../teile/Glas';

/*
 * Competitive-Uebersicht, neu (Betreiber, 26.11.2026: "Top 10 reingeklatscht, Tools, live ... so fuehle ich sie gar nicht"). Aufbau:
 * 1. Buehne ueber die volle Breite: der wichtigste Cup (live, sonst der naechste) mit Banner, Countdown und - wenn live - der Live-Top-5.
 * 2. Zeitleiste der naechsten 24 Stunden ueber alle Regionen.
 * 3. Kachelwand: Nummer 1 der Power Rankings gross, die Verfolger, Aufsteiger/Absteiger, Laender, letzte Sieger.
 * Die Werkzeuge stehen oben in der Unter-Navigation, hier unten nur als Bild-Kacheln zum Weiterklicken.
 */

interface Fenster { status: string; begin: number; end: number; eventId?: string; windowId?: string; region?: string; rundenTyp?: string; istFinale?: boolean }
interface Cup { id: string; titel: string; untertitel?: string; bild?: string; farbe?: string; regionen?: Record<string, Fenster[]> }
interface PR { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; deltaPlatz: number; deltaWertung?: number; bild?: string | null }
interface LbSpieler { id: string; name: string; anzeige?: string; land?: string; img?: string | null }
interface LbEintrag { rank: number; points: number; elims: number; games: number; wins: number; players: LbSpieler[] }
interface Termin { cup: Cup; region: string; f: Fenster }

const uhr = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  // ab 24 Stunden in Tagen (Betreiber: "anstatt 170 Stunden ... Days")
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h ${String(m).padStart(2, '0')}m`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`;
};
const zeit = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
// Wichtigkeit einer Region fuer die Buehne: EU und NAC zuerst (dort sitzt das Publikum)
const GEWICHT: Record<string, number> = { EU: 0, NAC: 1, NAW: 2, BR: 3, ASIA: 4, ME: 5, OCE: 6 };
const gewicht = (r: string) => GEWICHT[r] ?? 9;
const name = (p: { anzeige?: string; name: string }) => p.anzeige || p.name;

function useJetzt() { const [t, setT] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i); }, []); return t; }

function teileAuf(cups: Cup[], jetzt: number) {
  const live: Termin[] = [], kommt: Termin[] = [], vorbei: Termin[] = [];
  for (const c of cups) for (const [r, ws] of Object.entries(c.regionen ?? {})) for (const f of ws) {
    const t = { cup: c, region: r, f };
    if (f.begin <= jetzt && f.end >= jetzt) live.push(t);
    else if (f.begin > jetzt) kommt.push(t);
    else if (jetzt - f.end < 3 * 86400e3) vorbei.push(t);
  }
  live.sort((a, b) => gewicht(a.region) - gewicht(b.region));
  kommt.sort((a, b) => a.f.begin - b.f.begin);
  vorbei.sort((a, b) => b.f.end - a.f.end);
  return { live, kommt, vorbei };
}

/** Live-Top-5 eines laufenden Spieltags, alle 15 Sekunden frisch. */
/** Spielerfoto hochkant (Betreiber: "nicht rund, eher hochkant rechteckig ... kleiner und zu dritt"). */
function Hochkant({ p, gross = false }: { p: LbSpieler; gross?: boolean }) {
  const mass = gross ? 'h-14 w-11' : 'h-12 w-9';
  return (
    <Link to={`/competitive/player/${p.id}`} title={name(p)} className={`group/f relative ${mass} shrink-0 overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10`}>
      {p.img ? <img src={p.img} alt="" className="h-full w-full object-cover object-top transition duration-500 group-hover/f:scale-110" />
        : <span className="grid h-full w-full place-items-center text-sm font-black text-white/30">{name(p).slice(0, 1)}</span>}
      <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
    </Link>
  );
}

function LiveTop({ f }: { f: Fenster }) {
  const [liste, setListe] = useState<LbEintrag[] | null>(null);
  useEffect(() => {
    setListe(null);
    if (!f.eventId || !f.windowId) return;
    let aus = false;
    const holen = () => fetch(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId!)}&window=${encodeURIComponent(f.windowId!)}&limit=5`)
      .then((r) => r.json()).then((j) => { if (!aus) setListe((j.entries ?? []).slice(0, 5)); }).catch(() => { if (!aus) setListe([]); });
    holen(); const i = setInterval(holen, 15000);
    return () => { aus = true; clearInterval(i); };
  }, [f.eventId, f.windowId]);
  if (!liste) return <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.05]" />)}</div>;
  if (!liste.length) return <p className="py-6 text-sm text-white/60">First games are still running – the leaderboard fills after the first results.</p>;
  return (
    <ol className="space-y-2">
      <AnimatePresence initial={false}>
        {liste.map((e) => (
          <motion.li layout key={e.players.map((p) => p.id).join()} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${e.rank === 1 ? 'bg-yellow-300 text-black' : e.rank <= 3 ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>{e.rank}</span>
            <div className="flex gap-1">{e.players.slice(0, 3).map((p) => <Hochkant key={p.id} p={p} />)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {e.players.map((p, i) => <span key={p.id}>{i > 0 && <span className="text-white/30"> · </span>}<Link to={`/competitive/player/${p.id}`} className="hover:text-sky-300">{name(p)}</Link></span>)}
              </p>
              <p className="text-[11px] text-white/50">{e.games} games · {e.elims} elims{e.wins ? ` · ${e.wins} win${e.wins > 1 ? 's' : ''}` : ''}</p>
            </div>
            <span className="shrink-0 text-right"><span className="block font-mono text-lg font-bold tabular-nums text-white">{e.points}</span><span className="text-[10px] uppercase tracking-wider text-white/40">pts</span></span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function Buehne({ live, kommt, jetzt }: { live: Termin[]; kommt: Termin[]; jetzt: number }) {
  const [wahl, setWahl] = useState<string | null>(null);
  const haupt = live.find((t) => t.cup.id + t.region === wahl) ?? live[0] ?? kommt[0];
  if (!haupt) return <div className="h-[56vh] animate-pulse rounded-[2rem] bg-white/[0.03]" />;
  const istLive = live.includes(haupt);
  const regionenLive = live.filter((t) => t.cup.id === haupt.cup.id);
  const andere = live.filter((t) => t.cup.id !== haupt.cup.id);
  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10">
      <AnimatePresence mode="wait">
        <motion.img key={haupt.cup.bild} src={haupt.cup.bild} alt="" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}
          className="absolute inset-0 -z-10 h-full w-full object-cover" />
      </AnimatePresence>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05070d] via-[#05070d]/75 to-[#05070d]/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#05070d] via-transparent to-transparent" />
      <div className="grid min-h-[56vh] gap-8 p-8 lg:grid-cols-[1.3fr_1fr] lg:p-12">
        <div className="flex flex-col justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {istLive ? (
              <span className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-red-300 ring-1 ring-red-400/40">
                <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-red-500" /></span>Live now
              </span>
            ) : <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-sky-300 ring-1 ring-sky-400/40">Up next</span>}
            {haupt.f.rundenTyp && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">{haupt.f.istFinale ? 'Final' : haupt.f.rundenTyp}</span>}
          </div>
          <h1 className="mt-4 max-w-3xl font-['Bebas_Neue'] text-6xl leading-[0.9] tracking-wide text-white drop-shadow-2xl lg:text-8xl">{haupt.cup.titel}</h1>
          <div className="mt-6 flex flex-wrap items-end gap-10">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{istLive ? 'Ends in' : 'Starts in'}</p>
              <p className="font-mono text-5xl font-bold tabular-nums text-white">{uhr((istLive ? haupt.f.end : haupt.f.begin) - jetzt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Window ({haupt.region})</p>
              <p className="text-2xl font-semibold text-white/90">{zeit(haupt.f.begin)} – {zeit(haupt.f.end)}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {istLive && regionenLive.length > 1 && regionenLive.map((t) => (
              <button key={t.region} onClick={() => setWahl(t.cup.id + t.region)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${t === haupt ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>{t.region}</button>
            ))}
            <Link to={`/competitive/events/${haupt.cup.id}`} className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold text-black shadow-lg shadow-sky-500/30 transition hover:bg-sky-400">{istLive ? 'Full live leaderboard →' : 'Event details →'}</Link>
          </div>
        </div>
        <div className="flex flex-col justify-end">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl">
            {istLive ? (
              <>
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Live top 5 · {haupt.region}</p><p className="text-[11px] text-white/40">updates every 15 s</p></div>
                <LiveTop f={haupt.f} />
              </>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Also coming up</p>
                <ul className="space-y-2">{kommt.slice(1, 6).map((t) => (
                  <li key={t.cup.id + t.region + t.f.begin} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2">
                    <span className="w-12 rounded-md bg-white/10 py-1 text-center text-[11px] font-bold text-white/80">{t.region}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{t.cup.titel}</span>
                    <span className="font-mono text-sm tabular-nums text-sky-300">{uhr(t.f.begin - jetzt)}</span>
                  </li>))}</ul>
              </>
            )}
          </div>
        </div>
      </div>
      {andere.length > 0 && (
        <div className="flex gap-3 overflow-x-auto border-t border-white/10 bg-black/40 px-8 py-3 backdrop-blur-xl lg:px-12">
          <span className="shrink-0 self-center text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">Also live</span>
          {andere.map((t) => (
            <button key={t.cup.id + t.region} onClick={() => setWahl(t.cup.id + t.region)} className="flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1.5 text-sm text-white hover:bg-white/15">
              <span className="text-[11px] font-bold text-red-300">{t.region}</span>{t.cup.titel}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Was als Naechstes kommt: eine Karte pro Cup (alle Regionen zusammen), mit Banner, Startzeit und Countdown. */
function DemnaechstLeiste({ kommt, jetzt }: { kommt: Termin[]; jetzt: number }) {
  const karten = useMemo(() => {
    const je = new Map<string, Termin[]>();
    // Betreiber: nur wichtige Cups - keine Ranked Cups, keine Cups nur fuer eine Nebenregion (z.B. Arenas Fight Night nur BR); EU oder NA muss dabei sein
    const wichtig = (c: Cup) => !/ranked/i.test(c.titel) && Object.keys(c.regionen ?? {}).some((r) => r === 'EU' || r === 'NAC' || r === 'NAW');
    for (const t of kommt) {
      if (t.f.begin - jetzt > 14 * 86400e3) break;
      if (!wichtig(t.cup)) continue;
      const k = t.cup.id + Math.floor(t.f.begin / 86400e3); je.set(k, [...(je.get(k) ?? []), t]);
    }
    return [...je.values()].slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kommt]);
  if (!karten.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">Coming up</h2>
        <Link to="/competitive/events" className="text-sm font-semibold text-sky-400 hover:text-sky-300">All events →</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {karten.map((ts, i) => {
          const erst = ts[0];
          return (
            <Kachel key={erst.cup.id + erst.f.begin} delay={i * 0.04} className="group">
              <Link to={`/competitive/events/${erst.cup.id}`} className="block">
                <div className="relative aspect-video overflow-hidden">
                  {erst.cup.bild && <img src={erst.cup.bild} alt="" className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-100" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d16] via-[#0a0d16]/20 to-transparent" />
                  <span className="absolute right-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-sky-300 backdrop-blur">in {uhr(erst.f.begin - jetzt)}</span>
                </div>
                <div className="p-4 pt-1">
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight text-white">{erst.cup.titel}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ts.sort((a, b) => gewicht(a.region) - gewicht(b.region)).map((t) => (
                      <span key={t.region + t.f.begin} className="rounded-md bg-white/[0.07] px-2 py-1 text-[11px] text-white/80"><b className="text-white">{t.region}</b> {zeit(t.f.begin)}</span>
                    ))}
                  </div>
                </div>
              </Link>
            </Kachel>
          );
        })}
        {karten.length < 4 && (
          <Kachel className="grid place-items-center p-6 text-center">
            <div>
              <p className="font-['Bebas_Neue'] text-3xl tracking-wide text-white/80">More cups soon</p>
              <p className="mt-1 text-sm text-white/50">Epic announces cups about a week ahead – new ones show up here automatically.</p>
            </div>
          </Kachel>
        )}
      </div>
    </section>
  );
}

function Kachel({ children, className = '', delay = 0 }: { children?: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay, duration: 0.5 }}
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl ${className}`}>{children}</motion.div>
  );
}

function Spitze({ spitze }: { spitze: PR[] }) {
  const [eins, ...rest] = spitze;
  if (!eins) return <Kachel className="min-h-[28rem] animate-pulse lg:col-span-2 lg:row-span-2" />;
  return (
    <>
      <Kachel className="group min-h-[28rem] lg:col-span-2 lg:row-span-2">
        {eins.bild && <img src={eins.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_20%] transition duration-[2s] group-hover:scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05070d]/70 to-transparent" />
        <Link to={`/competitive/player/${eins.id}`} className="absolute inset-0 flex flex-col justify-between p-7">
          <span className="self-start rounded-full bg-yellow-300 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-black">#1 Power Ranking</span>
          <div>
            <div className="flex items-center gap-3">{eins.land && <img src={flagge(eins.land)} alt="" className="h-6 w-9 rounded object-cover" />}<p className="font-['Bebas_Neue'] text-7xl leading-none tracking-wide text-white">{name(eins)}</p></div>
            <div className="mt-3 flex gap-10">
              <div><p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Points</p><p className="font-mono text-3xl font-bold tabular-nums text-white">{eins.wertung.toLocaleString('en')}</p></div>
              {eins.deltaWertung != null && <div><p className="text-[11px] uppercase tracking-[0.25em] text-white/50">This week</p><p className={`font-mono text-3xl font-bold tabular-nums ${eins.deltaWertung >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{eins.deltaWertung >= 0 ? '+' : ''}{eins.deltaWertung.toLocaleString('en')}</p></div>}
            </div>
          </div>
        </Link>
      </Kachel>
      <Kachel className="p-5 lg:col-span-2" delay={0.05}>
        <div className="mb-3 flex items-end justify-between"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Chasing the top</p><Link to="/competitive/rankings" className="text-xs font-semibold text-sky-400 hover:text-sky-300">All 10,000 →</Link></div>
        <div className="grid grid-cols-5 gap-3">
          {rest.slice(0, 5).map((s) => (
            <Link key={s.id} to={`/competitive/player/${s.id}`} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.04]">
              {s.bild ? <img src={s.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition duration-700 group-hover:scale-110" /> : <span className="absolute inset-0 grid place-items-center text-3xl font-black text-white/20">{name(s).slice(0, 1)}</span>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
              <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 text-xs font-black text-white">{s.rank}</span>
              <p className="absolute inset-x-2 bottom-2 truncate text-sm font-bold text-white">{name(s)}</p>
            </Link>
          ))}
        </div>
      </Kachel>
    </>
  );
}

function Bewegung({ liste, titel, gut }: { liste: PR[]; titel: string; gut: boolean }) {
  return (
    <Kachel className="p-5" delay={0.1}>
      <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.3em] ${gut ? 'text-emerald-300' : 'text-red-300'}`}>{titel}</p>
      <ul className="space-y-1">
        {liste.slice(0, 5).map((s) => (
          <li key={s.id}><Link to={`/competitive/player/${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.05]">
            {s.land ? <img src={flagge(s.land)} alt="" className="h-3 w-[18px] rounded-sm object-cover" /> : <span className="w-[18px]" />}
            <span className="min-w-0 flex-1 truncate text-sm text-white">{name(s)}</span>
            <span className="text-[11px] tabular-nums text-white/40">#{s.rank.toLocaleString('en')}</span>
            <span className={`w-16 text-right font-mono text-sm font-bold tabular-nums ${gut ? 'text-emerald-300' : 'text-red-300'}`}>{gut ? '▲' : '▼'} {Math.abs(s.deltaPlatz).toLocaleString('en')}</span>
          </Link></li>
        ))}
      </ul>
    </Kachel>
  );
}

/** Die Sieger der zuletzt beendeten Spieltage (EU und NAC zuerst, je Cup nur der letzte Tag). */
function LetzteSieger({ vorbei }: { vorbei: Termin[] }) {
  const schluessel = vorbei.map((t) => t.f.windowId).join();
  const auswahl = useMemo(() => {
    const gesehen = new Set<string>(); const out: Termin[] = [];
    for (const t of [...vorbei].sort((a, b) => gewicht(a.region) - gewicht(b.region) || b.f.end - a.f.end)) {
      if (gesehen.has(t.cup.id) || !t.f.eventId || !t.f.windowId) continue;
      gesehen.add(t.cup.id); out.push(t); if (out.length >= 4) break;
    }
    return out.sort((a, b) => b.f.end - a.f.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);
  const [sieger, setSieger] = useState<Record<string, LbEintrag | null>>({});
  useEffect(() => {
    for (const t of auswahl) {
      const k = t.f.windowId!;
      fetch(`/api/cup-leaderboard?event=${encodeURIComponent(t.f.eventId!)}&window=${encodeURIComponent(k)}&limit=1`).then((r) => r.json())
        .then((j) => setSieger((s) => ({ ...s, [k]: j.entries?.[0] ?? null }))).catch(() => setSieger((s) => ({ ...s, [k]: null })));
    }
  }, [auswahl]);
  if (!auswahl.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">Latest winners</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {auswahl.map((t, i) => {
          const s = sieger[t.f.windowId!];
          return (
            <Kachel key={t.f.windowId} delay={i * 0.06} className="group">
              <div>
                <Link to={`/competitive/events/${t.cup.id}`} className="relative block h-36 overflow-hidden">
                  {t.cup.bild && <img src={t.cup.bild} alt="" className="h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d16] to-transparent" />
                  <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">{t.region}</span>
                </Link>
                <div className="p-4 pt-0">
                  <p className="truncate text-xs text-white/50">{t.cup.titel}</p>
                  {s === undefined ? <div className="mt-2 h-10 animate-pulse rounded-lg bg-white/[0.05]" /> : s ? (
                    <div className="mt-2 flex items-center gap-3">
                      {s.players.every((p) => p.img) && <div className="flex gap-1">{s.players.slice(0, 3).map((p) => <Hochkant key={p.id} p={p} gross />)}</div>}
                      <div className="min-w-0"><p className="truncate text-sm font-bold text-white">🏆 {s.players.map(name).join(' · ')}</p><p className="text-[11px] text-white/50">{s.points} pts · {s.elims} elims</p></div>
                    </div>
                  ) : <p className="mt-2 text-sm text-white/40">No leaderboard</p>}
                </div>
              </div>
            </Kachel>
          );
        })}
      </div>
    </section>
  );
}

const WEITER = [
  // Betreiber: Bilder im 16:9-Format, damit nichts abgeschnitten wird; keine Skin-Cups, sondern feste Cups (Cash, Ranked, FNCS)
  { titel: 'Statistics', text: 'Damage, elims and mats of every pro.', pfad: 'statistics', bild: '/slider/eis-trio.webp', lage: 'center 30%' },
  { titel: 'Deep stats', text: 'Damage per weapon, third parties, heatmaps.', pfad: 'deep-stats', bild: 'https://cdn2.unrealengine.com/en-fneco-33-00-competitive-discoverytile-cashcup-1920x1080-1920x1080-30d0287241c3.jpg', lage: 'center' },
  { titel: 'Match finder', text: 'Live match IDs of the pros.', pfad: 'match-finder', bild: 'https://cdn2.unrealengine.com/en-fnce-38-00-competitive-discoverytile-victorycashcup-1980x1020-1920x1080-c8df912735af.jpg', lage: 'center' },
  { titel: 'Replays', text: 'Rewatch any cup match in 2D.', pfad: 'replays', bild: 'https://cdn2.unrealengine.com/en-fnce-42-00-solos-discovertile-1920x1080-1920x1080-456d617381ea.jpg', lage: 'center' },
];

export default function Competitive() {
  const jetzt = useJetzt();
  const [cups, setCups] = useState<Cup[]>([]);
  const [pr, setPr] = useState<{ spitze: PR[]; aufsteiger: PR[]; absteiger: PR[]; laender: Array<{ land: string; n: number }> }>({ spitze: [], aufsteiger: [], absteiger: [], laender: [] });
  useEffect(() => {
    const katalog = () => fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups(j.cups ?? [])).catch(() => {});
    katalog(); const i = setInterval(katalog, 5 * 60e3);
    fetch('/api/power-rankings?uebersicht=1').then((r) => r.json()).then((j) => setPr((v) => ({ spitze: v.spitze.length ? v.spitze : j.spitze ?? [], aufsteiger: j.aufsteiger ?? [], absteiger: j.absteiger ?? [], laender: j.laender ?? [] }))).catch(() => {});
    // die Uebersicht liefert nur die Top 3 - fuer "Chasing the top" braucht es die Top 6
    fetch('/api/power-rankings?page=1&pageSize=6').then((r) => r.json()).then((j) => { if (j.players?.length) setPr((v) => ({ ...v, spitze: j.players.slice(0, 6) })); }).catch(() => {});
    return () => clearInterval(i);
  }, []);
  // Einteilung live/kommt/vorbei nur jede Minute neu, der Countdown tickt trotzdem sekundengenau
  const minute = Math.floor(jetzt / 60000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { live, kommt, vorbei } = useMemo(() => teileAuf(cups, jetzt), [cups, minute]);
  return (
    <div className="space-y-8">
      <Buehne live={live} kommt={kommt} jetzt={jetzt} />
      <DemnaechstLeiste kommt={kommt} jetzt={jetzt} />
      <section>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">Power Rankings this week</h2>
        <div className="grid gap-4 lg:grid-cols-4">
          <Spitze spitze={pr.spitze} />
          <Bewegung liste={pr.aufsteiger} titel="Biggest climbers" gut />
          <Bewegung liste={pr.absteiger} titel="Biggest fallers" gut={false} />
        </div>
      </section>
      <LetzteSieger vorbei={vorbei} />
      <section>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">Go deeper</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {WEITER.map((w, i) => (
            <Kachel key={w.pfad} delay={i * 0.05} className="group aspect-video">
              <img src={w.bild} alt="" style={{ objectPosition: w.lage }} className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-[#05070d]/50 to-transparent" />
              <Link to={`/competitive/${w.pfad}`} className="absolute inset-0 flex flex-col justify-end p-5">
                <p className="font-['Bebas_Neue'] text-4xl tracking-wide text-white">{w.titel}</p>
                <p className="text-sm text-white/70">{w.text}</p>
              </Link>
            </Kachel>
          ))}
        </div>
      </section>
    </div>
  );
}
