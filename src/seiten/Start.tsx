import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { dauer, useJetzt } from '../ds/Bausteine';
import { sucheOeffnen } from '../ds/Suche';
import { useWer } from '../teile/Anmeldung';
import { useLive } from './streamer/live';

/*
 * Der Startbildschirm, neu (Betreiber, 27.11.2026: "du kannst wirklich ultimativ viel Besseres daraus machen ... ich will nichts 1:1 gleich
 * sehen"). Statt dreier Tafeln in der Mitte gehoert der GANZE Bildschirm den drei Bereichen: drei schraege Felder von Rand zu Rand, das gewaehlte
 * wird breit und zeigt, was dort gerade los ist (laufender Cup und Top 3, Countdown zum neuen Chapter, wer live ist). Ein Klick oeffnet den
 * Bereich - das Feld faehrt dabei ueber den ganzen Schirm. Pfeiltasten waehlen, Enter oeffnet. Am Handy stehen die Felder untereinander.
 */
const NEIGUNG = 8; // Grad
/* Nur Bilder, die randlos gut aussehen - vom Betreiber ausgesucht (26.11.2026). */
const COMP_BILDER = ['/slider/victory-cup.webp', '/cups/elite-cup.webp', '/slider/eis-trio.webp', '/cups/fncs-grand-finals.webp', '/slider/hase.webp', '/cups/console-champions-cup.webp', '/slider/disco.webp', '/slider/hoodie.webp'];
// Betreiber (26.11.2026): am 5. Dezember startet das neue Chapter; Uhrzeit = Epics uebliche Wartung (~09:00 UTC), nicht bestaetigt.
const NEUES_CHAPTER = Date.UTC(2026, 11, 5, 9, 0);
const STREAMER_FEST = ['gripey', 'amar', 'faxuty', 'coachboop', 'katoo', 'aussieantics', 'leothecrack', 'wazz', 'nikof', 'velofps', 'vadeal', 'eomzo'];

interface Fenster { begin: number; end: number }
interface Cup { id: string; titel: string; regionen?: Record<string, Fenster[]> }
interface PR { rank: number; id: string; name: string; anzeige?: string; bild?: string | null }
interface Termin { c: Cup; r: string; f: Fenster }

/** Der wichtigste Cup: einer, der laeuft (EU zuerst), sonst der naechste, der keine Ranked-Runde ist. */
function useCup(jetzt: number): { live: Termin | null; kommt: Termin | null } {
  const [cups, setCups] = useState<Cup[]>([]);
  useEffect(() => { fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups(j.cups ?? [])).catch(() => {}); }, []);
  const minute = Math.floor(jetzt / 60000);
  return useMemo(() => {
    const alle: Termin[] = [];
    for (const c of cups) for (const [r, ws] of Object.entries(c.regionen ?? {})) for (const f of ws) alle.push({ c, r, f });
    const gewicht = (r: string) => ['EU', 'NAC', 'NAW'].indexOf(r) + 1 || 9;
    const live = alle.filter((t) => t.f.begin <= jetzt && t.f.end >= jetzt).sort((a, b) => gewicht(a.r) - gewicht(b.r))[0] ?? null;
    const kommt = alle.filter((t) => t.f.begin > jetzt && !/ranked/i.test(t.c.titel)).sort((a, b) => a.f.begin - b.f.begin)[0] ?? null;
    return { live, kommt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cups, minute]);
}

/** Bilder im Wechsel, weich ueberblendet und langsam naeher kommend. */
function BildWechsel({ bilder, laeuft }: { bilder: string[]; laeuft: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (!laeuft || bilder.length < 2) return undefined; const t = setInterval(() => setI((x) => (x + 1) % bilder.length), 6500); return () => clearInterval(t); }, [laeuft, bilder.length]);
  return (
    <AnimatePresence initial={false}>
      <motion.img key={bilder[i]} src={bilder[i]} alt="" draggable={false} initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
        transition={{ opacity: { duration: 1.4 }, scale: { duration: 8, ease: 'linear' } }} className="absolute inset-0 h-full w-full object-cover" />
    </AnimatePresence>
  );
}

/** Wand aus Streamer-Bildern: wer live ist zuerst (roter Rand), sonst die feste Liste. */
function StreamerWand({ kanaele }: { kanaele: Array<{ login: string; bild?: string | null; live: boolean }> }) {
  return (
    <div className="absolute left-1/2 top-[16%] grid w-[min(52%,62vh)] -translate-x-1/2 grid-cols-4 gap-3">
      {kanaele.slice(0, 12).map((k, i) => (
        <motion.div key={k.login} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, y: [0, i % 2 ? -6 : 6, 0] }}
          transition={{ opacity: { delay: 0.3 + i * 0.05 }, scale: { delay: 0.3 + i * 0.05 }, y: { duration: 5 + (i % 4), repeat: Infinity, ease: 'easeInOut' } }} className="relative aspect-square rounded-2xl bg-white/[0.06]">
          <img src={k.bild || `https://unavatar.io/twitch/${k.login}`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            className={`h-full w-full rounded-2xl object-cover shadow-[0_12px_30px_rgba(0,0,0,0.6)] ${k.live ? 'ring-2 ring-red-500' : 'ring-1 ring-white/10'}`} />
          {k.live && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#04050a]" style={{ animation: 'atmen 1.6s ease-in-out infinite' }} />}
        </motion.div>
      ))}
    </div>
  );
}

function Uhr({ bis, jetzt }: { bis: number; jetzt: number }) {
  const s = Math.max(0, Math.floor((bis - jetzt) / 1000));
  const teile: Array<[number, string]> = [[Math.floor(s / 86400), 'days'], [Math.floor((s % 86400) / 3600), 'hrs'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 'sec']];
  return (
    <div className="flex gap-2">
      {teile.map(([n, l]) => (
        <div key={l} className="w-16 rounded-2xl border border-white/10 bg-black/50 py-2 text-center backdrop-blur">
          <p className="zahl font-titel text-4xl leading-none text-white">{String(n).padStart(2, '0')}</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p>
        </div>
      ))}
    </div>
  );
}

/** Zeile oben im Feld: was dort gerade los ist. */
function Stand({ children, farbe, puls = false }: { children: ReactNode; farbe: string; puls?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border bg-black/55 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] backdrop-blur" style={{ borderColor: `rgb(${farbe} / 0.45)`, color: `rgb(${farbe})` }}>
      {puls && <span className="relative flex h-2 w-2 shrink-0"><span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-70" /><span className="relative h-2 w-2 rounded-full bg-current" /></span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

interface Feld { id: 'community' | 'competitive' | 'streamer'; titel: string; zeile: string; satz: string; farbe: string; pfad: string; punkte: string[] }
const FELDER: Feld[] = [
  { id: 'community', titel: 'Community', zeile: 'The island · Loot · Shop', satz: 'Every chest on the map, every weapon ever, today’s shop and the season at a glance.', farbe: '45 212 191', pfad: '/community', punkte: ['Map', 'Weapons', 'Item Shop', 'Map Evolution'] },
  { id: 'competitive', titel: 'Competitive', zeile: 'Live · Stats · Rankings', satz: 'Live leaderboards, replays, deep stats and the Power Rankings of the whole scene.', farbe: '56 189 248', pfad: '/competitive', punkte: ['Live cups', 'Rankings', 'Deep stats', 'Replays', 'Match finder'] },
  { id: 'streamer', titel: 'Streamer', zeile: 'Watch · Overlays · Tools', satz: 'See who is live, watch several POVs at once and put live cup data into your stream.', farbe: '167 139 250', pfad: '/streamer', punkte: ['Multiview', 'OBS overlays', 'Twitch bot', 'Free + VIP'] },
];

export default function Start() {
  const [aktiv, setAktiv] = useState(1);
  const [ziel, setZiel] = useState<number | null>(null);
  const [breit, setBreit] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const jetzt = useJetzt();
  const { live, kommt } = useCup(jetzt);
  const [spitze, setSpitze] = useState<PR[]>([]);
  const { liste } = useLive();
  const { wer, oeffnen } = useWer();
  const nav = useNavigate();

  useEffect(() => { fetch('/api/power-rankings?uebersicht=1').then((r) => r.json()).then((j) => setSpitze((j.spitze ?? []).slice(0, 3))).catch(() => {}); }, []);
  useEffect(() => { const m = () => setBreit(window.innerWidth >= 768); addEventListener('resize', m); return () => removeEventListener('resize', m); }, []);
  const los = (i: number) => { if (ziel !== null) return; setAktiv(i); setZiel(i); setTimeout(() => nav(FELDER[i].pfad), 560); };
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (e.key === 'ArrowLeft') setAktiv((a) => Math.max(0, a - 1));
      if (e.key === 'ArrowRight') setAktiv((a) => Math.min(2, a + 1));
      if (e.key === 'Enter') los(aktiv);
    };
    addEventListener('keydown', t); return () => removeEventListener('keydown', t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, ziel]);

  const kanaele = useMemo(() => {
    const an = (liste ?? []).filter((k) => k.isLive).sort((a, b) => b.viewers - a.viewers).map((k) => ({ login: k.login, bild: k.bild, live: true }));
    const rest = STREAMER_FEST.filter((l) => !an.some((k) => k.login === l)).map((l) => ({ login: l, bild: (liste ?? []).find((k) => k.login === l)?.bild, live: false }));
    return [...an, ...rest];
  }, [liste]);
  const liveZahl = (liste ?? []).filter((k) => k.isLive).length;
  const zuschauer = (liste ?? []).reduce((s, k) => s + (k.isLive ? k.viewers : 0), 0);

  // Oben im Feld: was dort gerade los ist
  const oben: Record<Feld['id'], ReactNode> = {
    competitive: live
      ? <Stand farbe="248 113 113" puls>Live now · {live.c.titel} · {live.r}</Stand>
      : kommt ? <Stand farbe="56 189 248">Next · {kommt.c.titel} · in {dauer(kommt.f.begin - jetzt)}</Stand> : null,
    community: <Stand farbe="45 212 191">Treasure Hunters · Chapter 7</Stand>,
    streamer: liveZahl ? <Stand farbe="248 113 113" puls>{liveZahl} live now · {zuschauer.toLocaleString('en')} watching</Stand> : <Stand farbe="167 139 250">Free tools · VIP extras</Stand>,
  };
  // Im gewaehlten Feld: der Blick hinein
  const innen: Record<Feld['id'], ReactNode> = {
    competitive: (spitze.length === 3 || live) ? (
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {spitze.length === 3 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Power Rankings · top 3</p>
            <div className="flex gap-2">
              {spitze.map((s) => (
                <div key={s.id} className="relative h-28 w-[5.2rem] overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/15">
                  {s.bild && <img src={s.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                  <span className={`absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md text-[11px] font-black ${s.rank === 1 ? 'bg-yellow-300 text-black' : 'bg-white text-black'}`}>{s.rank}</span>
                  <p className="absolute inset-x-1.5 bottom-1 truncate text-xs font-bold text-white">{s.anzeige || s.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {live && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Cup ends in</p>
            <p className="zahl font-titel text-6xl leading-none text-white">{dauer(live.f.end - jetzt)}</p>
          </div>
        )}
      </div>
    ) : null,
    community: jetzt < NEUES_CHAPTER ? (
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">New chapter launches in</p>
        <Uhr bis={NEUES_CHAPTER} jetzt={jetzt} />
      </div>
    ) : null,
    streamer: null,
  };

  return (
    <main className="relative h-screen min-h-[620px] overflow-hidden bg-grund">
      <div className="absolute inset-0 flex flex-col gap-[3px] md:-left-[8vw] md:-right-[8vw] md:flex-row" style={breit ? { transform: `skewX(-${NEIGUNG}deg)` } : undefined}>
        {FELDER.map((f, i) => {
          const an = aktiv === i; const weg = ziel !== null && ziel !== i; const voll = ziel === i;
          const gerade = breit ? { transform: `skewX(${NEIGUNG}deg)` } : undefined;
          return (
            <motion.button key={f.id} type="button" onMouseEnter={() => ziel === null && setAktiv(i)} onFocus={() => ziel === null && setAktiv(i)} onClick={() => los(i)}
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: weg ? 0 : 1, y: 0, flexGrow: voll ? 60 : weg ? 0.0001 : an ? 2.1 : 1 }}
              transition={{ flexGrow: { type: 'spring', stiffness: 170, damping: 26 }, opacity: { duration: 0.4, delay: ziel === null ? 0.1 + i * 0.1 : 0 }, y: { duration: 0.7, delay: 0.1 + i * 0.1, ease: [0.22, 1, 0.36, 1] } }}
              style={{ flexBasis: 0 }}
              className={`group relative min-h-0 min-w-0 overflow-hidden text-left outline-none ${i === 1 ? 'order-first md:order-none' : ''}`}>
              {/* Bild: gegen die Neigung gestellt und breiter als das Feld, damit die schraegen Kanten gefuellt sind */}
              <div className="absolute inset-y-0 -inset-x-[22%]" style={gerade}>
                {f.id === 'competitive' && <BildWechsel bilder={COMP_BILDER} laeuft={an} />}
                {f.id === 'community' && (
                  // Die Karte fuellt das ganze Feld (ihr Meer laeuft bis an die Kanten) und kommt beim Waehlen langsam naeher
                  <motion.img src="/bilder/karte-leer.png" alt="" draggable={false} animate={{ scale: an ? 1.02 : 1.25 }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 h-full w-full object-cover object-[center_30%]" />
                )}
                {f.id === 'streamer' && <div className="absolute inset-0 bg-[radial-gradient(100%_70%_at_50%_20%,#5b21b6_0%,#1e1b4b_45%,#04050a_100%)]"><StreamerWand kanaele={kanaele} /></div>}
              </div>
              {/* Schleier: unten dunkel fuer die Schrift, nicht gewaehlte Felder treten zurueck */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#04050a] via-[#04050a]/60 to-[#04050a]/10" />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#04050a]/80 via-transparent to-transparent" />
              <motion.div className="absolute inset-0 bg-[#04050a]" animate={{ opacity: an ? 0 : 0.58 }} transition={{ duration: 0.5 }} />
              <motion.div className="absolute inset-x-0 bottom-0 h-2/3" animate={{ opacity: an ? 1 : 0 }} transition={{ duration: 0.6 }} style={{ background: `radial-gradient(80% 70% at 30% 110%, rgb(${f.farbe} / 0.38), transparent 65%)` }} />
              <motion.span className="absolute inset-x-0 top-0 h-[3px]" animate={{ opacity: an ? 1 : 0, scaleX: an ? 1 : 0.2 }} style={{ background: `rgb(${f.farbe})`, boxShadow: `0 0 24px rgb(${f.farbe})` }} />

              {/* Inhalt, aufrecht. Die Randfelder ragen aus dem Schirm - dort mehr Abstand nach aussen. */}
              <div data-bereich={f.id} className={`absolute inset-0 flex flex-col justify-between p-5 md:py-10 ${i === 0 ? 'md:pl-[calc(8vw+2.5rem)] md:pr-10' : i === 2 ? 'md:pl-12 md:pr-[calc(8vw+2rem)]' : 'md:px-12'}`} style={gerade}>
                <motion.div animate={{ opacity: ziel !== null ? 0 : 1 }} className="hidden pl-16 pt-16 md:block">{oben[f.id]}</motion.div>
                <motion.div animate={{ opacity: ziel !== null ? 0 : 1, y: ziel !== null ? 20 : 0 }} transition={{ duration: 0.25 }} className="mt-auto min-w-0">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="h-px w-8 shrink-0" style={{ background: `rgb(${f.farbe})` }} />
                    <span className="truncate text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: `rgb(${f.farbe})` }}>{f.zeile}</span>
                  </div>
                  <motion.h2 animate={{ scale: an || !breit ? 1 : 0.5 }} transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                    className="titel origin-bottom-left whitespace-nowrap text-[clamp(3.2rem,6.6vw,8rem)] drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)]">{f.titel}</motion.h2>
                  <AnimatePresence initial={false}>
                    {an && breit && (
                      <motion.div key="innen" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/70">{f.satz}</p>
                        {innen[f.id] && <div className="mt-5">{innen[f.id]}</div>}
                        <div className="mt-6 flex flex-wrap items-center gap-2 pb-2">
                          <span className="knopf-prim !rounded-full !px-6 !py-3 !text-[13px] uppercase tracking-[0.2em]">Enter {f.titel} <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span></span>
                          {f.punkte.map((p) => <span key={p} className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/75 backdrop-blur">{p}</span>)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!breit && <p className="mt-1 text-sm text-white/60">{f.punkte.slice(0, 3).join(' · ')}</p>}
                </motion.div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Kopf ueber allem: Logo links, rechts Suche und Konto */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: ziel !== null ? 0 : 1, y: 0 }} transition={{ duration: 0.6 }} className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-[#04050a]/85 to-transparent px-5 pb-10 pt-4 lg:px-8">
        <div className="flex items-center gap-2.5">
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-10 w-auto drop-shadow-[0_0_22px_rgba(56,189,248,0.6)]" />
          <span className="text-2xl font-extrabold tracking-tight text-white">Comp<span className="text-sky-400">Hub</span></span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={sucheOeffnen} className="hidden h-9 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 text-sm text-white/60 backdrop-blur transition hover:text-white sm:flex">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>Search <kbd className="rounded border border-white/15 px-1 text-[10px] text-white/45">Ctrl K</kbd>
          </button>
          {wer?.userName
            ? <span className="flex h-9 items-center rounded-full border border-white/15 bg-black/40 px-4 text-sm font-semibold text-white backdrop-blur">{wer.userName}</span>
            : <button type="button" onClick={() => oeffnen('konto')} className="h-9 rounded-full bg-white px-5 text-sm font-bold text-black transition hover:bg-sky-300">Sign in</button>}
        </div>
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: ziel !== null ? 0 : 1 }} transition={{ delay: 1 }} className="pointer-events-none absolute inset-x-0 bottom-3 hidden text-center text-[11px] uppercase tracking-[0.3em] text-white/35 md:block">
        ← → choose · Enter open
      </motion.p>
    </main>
  );
}
