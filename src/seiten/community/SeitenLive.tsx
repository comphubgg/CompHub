import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Abschnitt, Bild, dauer, Flaeche, Kennzahl, Laedt, Leer, Marke, Segment, SeitenKopf, useJetzt, Zaehler } from '../../ds/Bausteine';
import { cupLink, datum, lageVon, MODUS_NAME, modiVon, REGIONEN, REGION_NAME, stufeName, istRanked, ART_NAME, type Cup, type Fenster, type Modus } from '../comp/events/gemeinsam';
import { CupBild, LiveMarke, RegionMarke, Uhrwerk } from '../comp/events/teile';
import { KalenderKnopf } from './Bausteine';

/*
 * Live-Seiten ohne Inseln (Design-System 3.0, neu komponiert 28.11.2026):
 *   News           oben die wichtigste Spiel-News als Buehne, daneben die uebrigen; darunter das ARCHIV (Epics Blog, Fortnite-Videos, frueher
 *                  gesehene Spiel-News) mit Bildern, Filter und Suche. Quellen: fortnite-api.com/v2/news + /hub-quellen/news-archiv.
 *   Tournaments    der naechste Cup als Buehne mit Banner und Countdown, alle weiteren als Karten MIT Cup-Thumbnail (/api/cup-catalog),
 *                  Startzeit in der gewaehlten Region, Kalender-Knopf; rechts die Woche als Tagesplan.
 *   Player lookup  jeder Epic-Name -> Casual-Profil (/api/fn-spieler: Raenge, Level, Siege, K/D, Matches, Spielzeit, je Modus); dazu der
 *                  Link aufs Competitive-Profil, wenn der Spieler in unserem Verzeichnis steht (/api/spieler-namen).
 *   Notifications  Schalter je Meldung als Kacheln, daneben was als Naechstes ansteht (echte Cup-Termine).
 */

/* ================================================================== News */
interface Motd { id: string; title: string; tabTitle?: string; body: string; image?: string; tileImage?: string; hidden?: boolean }
interface Meldung { id: string; quelle: 'spiel' | 'blog' | 'video'; titel: string; text: string; bild: string | null; zeit: number | null; link: string | null; art?: string }
const REAKTIONEN = ['🔥', '😍', '😐', '🤢', '💩'];
const QUELLE_NAME: Record<Meldung['quelle'], string> = { spiel: 'In-game', blog: 'Epic blog', video: 'Video' };
const tagText = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Reaktionsleiste({ id, meine, reagieren }: { id: string; meine: Record<string, string>; reagieren: (id: string, r: string) => void }) {
  return (
    <div className="flex gap-1">
      {REAKTIONEN.map((r) => <button key={r} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); reagieren(id, r); }} className={`rounded-lg px-2 py-1 text-base transition ${meine[id] === r ? 'bg-akz/20 ring-1 ring-akz/50' : meine[id] ? 'opacity-40 hover:opacity-100' : 'bg-white/[0.04] hover:bg-white/10'}`}>{r}</button>)}
    </div>
  );
}

export function News() {
  const [aktuell, setAktuell] = useState<Meldung[] | null>(null);
  const [archiv, setArchiv] = useState<Meldung[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [offen, setOffen] = useState<Meldung | null>(null);
  const [quelle, setQuelle] = useState<'alle' | Meldung['quelle']>('alle');
  const [q, setQ] = useState(''); const [n, setN] = useState(24);
  const [meine, setMeine] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('hub-news-reaktion') ?? '{}'); } catch { return {}; } });
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/news').then((r) => r.json()).then((j) => {
      const d = (j?.data ?? {}) as Record<string, { motds?: Motd[]; messages?: Motd[] } | null>;
      const l: Meldung[] = [];
      for (const [art, feed] of Object.entries(d)) for (const m of [...(feed?.motds ?? []), ...(feed?.messages ?? [])]) {
        if (m.hidden || !m.title) continue;
        l.push({ id: m.id ?? `${art}-${m.title}`, quelle: 'spiel', art, titel: m.title, text: m.body ?? '', bild: m.image ?? m.tileImage ?? null, zeit: null, link: null });
      }
      setAktuell(l);
    }).catch(() => { setFehler(true); setAktuell([]); });
    fetch('/hub-quellen/news-archiv').then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .then((j) => setArchiv(((j?.eintraege ?? []) as Meldung[]).map((m) => ({ ...m, id: m.id.replace(/^spiel:/, '') })))).catch(() => setArchiv([]));
  }, []);
  function reagieren(id: string, r: string) {
    const neu = { ...meine, [id]: meine[id] === r ? '' : r }; setMeine(neu);
    try { localStorage.setItem('hub-news-reaktion', JSON.stringify(neu)); } catch { /* egal */ }
  }
  const erste = aktuell?.[0]; const weitere = (aktuell ?? []).slice(1);
  const s = q.trim().toLowerCase();
  const alt = useMemo(() => (archiv ?? []).filter((m) => !(aktuell ?? []).some((a) => a.id === m.id)), [archiv, aktuell]);
  const gefiltert = alt.filter((m) => (quelle === 'alle' || m.quelle === quelle) && (!s || `${m.titel} ${m.text}`.toLowerCase().includes(s)));
  const zahlen = { blog: alt.filter((m) => m.quelle === 'blog').length, video: alt.filter((m) => m.quelle === 'video').length, spiel: alt.filter((m) => m.quelle === 'spiel').length };
  const artName = (a?: string) => (a === 'stw' ? 'Save the World' : a === 'creative' ? 'Creative' : 'Battle Royale');
  return (
    <div className="space-y-8">
      {!aktuell ? <><SeitenKopf klein ueber="Live · News" titel="Fortnite news" /><Laedt text="Loading the news" /></> : (
        <>
          {erste ? (
            <header className="fl-fest relative isolate overflow-hidden">
              <Bild src={erste.bild} className="absolute inset-y-0 right-0 -z-10 h-full w-full lg:w-[66%]" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/80 to-fl/5" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-transparent to-transparent" />
              <div className="px-6 pb-7 pt-24 lg:px-10 lg:pb-9 lg:pt-40">
                <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
                  <p className="ueber">Fortnite news · in the game right now</p>
                  <h1 className="titel mt-2 text-5xl lg:text-7xl">{erste.titel}</h1>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/65">{erste.text}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3"><Marke ton="akz">{artName(erste.art)}</Marke><Reaktionsleiste id={erste.id} meine={meine} reagieren={reagieren} /></div>
                </motion.div>
              </div>
            </header>
          ) : <SeitenKopf klein ueber="Live · News" titel="Fortnite news" text={fehler ? "The in-game news feed isn't answering right now." : 'No in-game news at the moment.'} />}

          {weitere.length > 0 && (
            <div className={`grid gap-4 sm:grid-cols-2 ${['', 'xl:grid-cols-2', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4', 'xl:grid-cols-5'][weitere.length] ?? 'xl:grid-cols-4'}`}>
              {weitere.map((m, i) => <NewsKarte key={m.id} m={m} verz={i * 0.05} marke={artName(m.art)} oeffnen={() => setOffen(m)} unten={<div className="mt-3"><Reaktionsleiste id={m.id} meine={meine} reagieren={reagieren} /></div>} />)}
            </div>
          )}
        </>
      )}

      <Abschnitt titel="Archive" ueber="Older news" rechts={<input value={q} onChange={(e) => { setQ(e.target.value); setN(24); }} placeholder="Search the archive" className="eingabe w-40 sm:w-56" />}>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {([['alle', `All ${alt.length}`], ['blog', `Epic blog ${zahlen.blog}`], ['video', `Videos ${zahlen.video}`], ['spiel', `In-game ${zahlen.spiel}`]] as const).map(([k, t]) => <button key={k} type="button" onClick={() => { setQuelle(k); setN(24); }} className={`chip ${quelle === k ? 'chip-an' : ''}`}>{t}</button>)}
        </div>
        {!archiv ? <Laedt text="Opening the archive" /> : gefiltert.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {gefiltert.slice(0, n).map((m, i) => <NewsKarte key={m.id} m={m} verz={Math.min(i % 8, 7) * 0.04} marke={QUELLE_NAME[m.quelle]} oeffnen={() => setOffen(m)} />)}
            </div>
            {gefiltert.length > n && <div className="mt-6 text-center"><button type="button" onClick={() => setN((v) => v + 24)} className="knopf">Show more · {gefiltert.length - n} left</button></div>}
          </>
        ) : <Leer text={alt.length ? 'Nothing in the archive matches.' : "The archive is still empty: Epic's blog and Fortnite's video feed didn't answer from this computer. In-game news is kept here from today on, so older items build up by themselves."} />}
      </Abschnitt>
      <p className="text-xs text-white/35">In-game news: fortnite-api.com · Archive: Epic's public news feed, Fortnite's YouTube channel and the in-game news this hub has seen. Reactions are saved on this device.</p>

      <AnimatePresence>
        {offen && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOffen(null)}>
            <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }} className="fl-fest max-h-[90vh] w-full max-w-3xl overflow-y-auto">
              <div className="relative aspect-video overflow-hidden rounded-t-3xl"><Bild src={offen.bild} className="absolute inset-0 h-full w-full" /><button type="button" onClick={() => setOffen(null)} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/70 text-white/80 backdrop-blur hover:text-white">✕</button></div>
              <div className="p-6">
                <p className="ueber">{QUELLE_NAME[offen.quelle]}{offen.zeit ? ` · ${tagText(offen.zeit)}` : ''}</p>
                <h2 className="titel mt-1 text-4xl">{offen.titel}</h2>
                {offen.text && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-white/65">{offen.text}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Reaktionsleiste id={offen.id} meine={meine} reagieren={reagieren} />
                  {offen.link && <a href={offen.link} target="_blank" rel="noreferrer" className="knopf-prim">{offen.quelle === 'video' ? 'Watch on YouTube ↗' : 'Read on fortnite.com ↗'}</a>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function NewsKarte({ m, verz, marke, oeffnen, unten }: { m: Meldung; verz: number; marke: string; oeffnen: () => void; unten?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ delay: verz, duration: 0.45 }}
      role="button" tabIndex={0} onClick={oeffnen} onKeyDown={(e) => { if (e.key === 'Enter') oeffnen(); }} className="fl-fest fl-klick group flex h-full cursor-pointer flex-col overflow-hidden">
      <div className="relative aspect-video shrink-0 overflow-hidden">
        <Bild src={m.bild} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.06]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
        <div className="absolute left-3 top-3"><Marke>{marke}</Marke></div>
        {m.zeit && <span className="zahl absolute right-3 top-3 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-semibold text-white/80 backdrop-blur">{tagText(m.zeit)}</span>}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-1">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-white">{m.titel}</h3>
        {m.text && <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-white/50">{m.text}</p>}
        <div className="mt-auto">{unten}</div>
      </div>
    </motion.div>
  );
}

/* ================================================================== Tournaments */
const uhr = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const tagName = (ms: number, jetzt: number) => {
  const d = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(jetzt).setHours(0, 0, 0, 0)) / 864e5);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};
const MODUS_WAHL: Array<{ k: 'alle' | Modus; titel: string }> = [{ k: 'alle', titel: 'All modes' }, { k: 'br', titel: 'Battle Royale' }, { k: 'zb', titel: 'Zero Build' }, { k: 'reload', titel: 'Reload' }];
export function Turniere() {
  const [region, setRegion] = useState(() => { try { return localStorage.getItem('hub-region') || 'EU'; } catch { return 'EU'; } });
  const [modus, setModus] = useState<'alle' | Modus>('alle');
  const [ohneRanked, setOhneRanked] = useState(false);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const jetzt = useJetzt();
  useEffect(() => { fetch('/api/cup-catalog?modus=alle-aktuell').then((r) => r.json()).then((j) => setCups((j?.cups ?? []) as Cup[])).catch(() => setCups([])); }, []);
  const waehlen = (r: string) => { setRegion(r); try { localStorage.setItem('hub-region', r); } catch { /* egal */ } };
  const liste = useMemo(() => (cups ?? []).filter((c) => (c.global || c.regionen[region]) && (modus === 'alle' || modiVon(c).has(modus)) && !(ohneRanked && istRanked(c)))
    .map((c) => ({ c, lage: lageVon(c, region, jetzt) })).filter((x) => x.lage.status !== 'vorbei')
    .sort((a, b) => Number(b.lage.status === 'live') - Number(a.lage.status === 'live') || (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0)),
  // jetzt nur minutenweise neu ordnen (der Countdown tickt in den Karten selbst)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [cups, region, modus, ohneRanked, Math.floor(jetzt / 60_000)]);
  // Tagesplan: alle Spieltage der naechsten 7 Tage in der Region
  const plan = useMemo(() => {
    const l: Array<{ c: Cup; f: Fenster }> = [];
    for (const { c } of liste) for (const f of (c.global ? Object.values(c.regionen).flat() : c.regionen[region] ?? [])) if ((f.end ?? f.begin + 3 * 36e5) > jetzt && f.begin < jetzt + 7 * 864e5) l.push({ c, f });
    l.sort((a, b) => a.f.begin - b.f.begin);
    const m = new Map<string, typeof l>();
    for (const x of l) { const k = tagName(x.f.begin, jetzt); m.set(k, [...(m.get(k) ?? []), x]); }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, region, Math.floor(jetzt / 60_000)]);
  const erste = liste[0]; const rest = liste.slice(1);
  const zeitZeile = (x: { c: Cup; lage: ReturnType<typeof lageVon> }) => (x.lage.status === 'live' && x.lage.fenster?.end ? `ends in ${dauer(x.lage.fenster.end - jetzt)}` : x.lage.naechster ? `in ${dauer(x.lage.naechster - jetzt)}` : '');
  const filter = (
    <>
      <Segment klein id="turnier-region" wert={region} wahl={REGIONEN.map((r) => ({ k: r, titel: r }))} onWahl={waehlen} />
      <Link to="/competitive/events" className="knopf-prim">All events & results →</Link>
    </>
  );
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber={`Live · Tournaments · ${REGION_NAME[region] ?? region}`} titel="Next cups" rechts={filter}>
        <div className="flex flex-wrap gap-1.5">
          {MODUS_WAHL.map((m) => <button key={m.k} type="button" onClick={() => setModus(m.k)} className={`chip ${modus === m.k ? 'chip-an' : ''}`}>{m.titel}</button>)}
          <button type="button" onClick={() => setOhneRanked((v) => !v)} className={`chip ${ohneRanked ? 'chip-an' : ''}`}>{ohneRanked ? '✓ ' : ''}Hide Ranked Cups</button>
        </div>
      </SeitenKopf>
      {!cups ? <Laedt text="Loading the cup calendar" /> : !erste ? <Leer text="No upcoming cup matches these filters."><Link to="/competitive/events" className="knopf-leer">See finished cups and results →</Link></Leer> : (
        <>
          <Flaeche fest className="relative isolate overflow-hidden">
            <div className="absolute inset-y-0 right-0 -z-10 w-full lg:w-[62%]"><CupBild c={erste.c} /></div>
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/10" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-transparent to-transparent" />
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 px-6 pb-7 pt-20 lg:px-10 lg:pb-9 lg:pt-32">
              <div className="min-w-0 max-w-2xl">
                <div className="flex flex-wrap gap-1.5">{erste.lage.status === 'live' ? <LiveMarke /> : <Marke ton="akz">Up next</Marke>}<Marke>{ART_NAME[erste.c.art] ?? 'Cup'}</Marke>{[...modiVon(erste.c)].filter((m) => m !== 'br').map((m) => <Marke key={m}>{MODUS_NAME[m]}</Marke>)}</div>
                <h2 className="titel mt-3 text-5xl lg:text-7xl">{erste.c.titel}</h2>
                <p className="mt-2 text-[15px] text-white/60">{erste.lage.fenster ? stufeName(erste.lage.fenster) : ''}{erste.lage.naechster ? ` · ${datum(erste.lage.naechster)} your time` : ''}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link to={cupLink(erste.c, erste.lage.fenster)} className="knopf-prim">{erste.lage.status === 'live' ? 'Live leaderboard →' : 'Open cup →'}</Link>
                  {erste.lage.fenster && erste.lage.status !== 'live' && <KalenderKnopf titel={`${erste.c.titel} (${region})`} start={erste.lage.fenster.begin} ende={erste.lage.fenster.end} />}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50 lg:text-right">{erste.lage.status === 'live' ? 'Ends in' : 'Starts in'}</p>
                <Uhrwerk ms={(erste.lage.status === 'live' ? erste.lage.fenster?.end ?? jetzt : erste.lage.naechster ?? jetzt) - jetzt} ton={erste.lage.status === 'live' ? 'rot' : 'akz'} />
              </div>
            </div>
          </Flaeche>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {rest.map((x, i) => {
                const f = x.lage.fenster;
                return (
                  <motion.div key={x.c.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ delay: Math.min(i % 6, 5) * 0.04, duration: 0.45 }} className="fl-fest fl-klick group flex flex-col overflow-hidden">
                    <Link to={cupLink(x.c, f)} className="relative block aspect-video shrink-0 overflow-hidden">
                      <CupBild c={x.c} className="transition duration-700 group-hover:scale-[1.06]" />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{x.lage.status === 'live' && <LiveMarke />}{[...modiVon(x.c)].filter((m) => m !== 'br').map((m) => <Marke key={m}>{MODUS_NAME[m]}</Marke>)}</div>
                      <span className={`zahl absolute right-3 top-3 rounded-lg bg-black/75 px-2.5 py-1 text-xs font-bold backdrop-blur ${x.lage.status === 'live' ? 'text-red-300' : 'text-akz'}`}>{zeitZeile(x)}</span>
                    </Link>
                    <div className="flex flex-1 flex-col px-4 pb-4 pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-akz/90">{ART_NAME[x.c.art] ?? 'Cup'}</p>
                      <Link to={cupLink(x.c, f)} className="mt-0.5 line-clamp-1 text-[15px] font-bold text-white hover:text-akz">{x.c.titel}</Link>
                      <p className="line-clamp-1 text-xs text-white/45">{f ? stufeName(f) : ''}{f?.matchCap ? ` · ${f.matchCap} matches` : ''}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                        <span className="flex items-center gap-2"><RegionMarke r={region} klein /><span className="zahl text-xs font-semibold text-white/75">{f ? datum(f.begin) : ''}</span></span>
                        {f && x.lage.status !== 'live' && <KalenderKnopf titel={`${x.c.titel} (${region})`} start={f.begin} ende={f.end} text="Calendar" />}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {!rest.length && <div className="sm:col-span-2 2xl:col-span-3"><Leer text="That's the only cup on the calendar for these filters." /></div>}
            </div>
            <Flaeche className="min-w-0 p-5 xl:sticky xl:top-32 xl:self-start" verz={0.05}>
              <h3 className="titel text-2xl">This week in {region}</h3>
              <p className="text-xs text-white/40">Times in your time zone</p>
              <div className="mt-4 max-h-[62vh] space-y-4 overflow-y-auto pr-1">
                {plan.map(([tag, l]) => (
                  <div key={tag}>
                    <p className="ueber !tracking-[0.25em]">{tag}</p>
                    <ul className="mt-1.5">
                      {l.map(({ c, f }) => (
                        <li key={f.windowId + f.region}><Link to={cupLink(c, f)} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]">
                          <span className={`zahl w-11 shrink-0 text-sm font-bold ${f.begin <= jetzt ? 'text-red-300' : 'text-white'}`}>{f.begin <= jetzt ? 'LIVE' : uhr(f.begin)}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/85 group-hover:text-akz">{c.titel}</span><span className="block truncate text-[11px] text-white/40">{stufeName(f)}{c.global ? ` · ${f.region}` : ''}</span></span>
                        </Link></li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!plan.length && <p className="text-sm text-white/40">Nothing in the next seven days.</p>}
              </div>
            </Flaeche>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== Player lookup (Casual-Stats) */
type Verzeichnis = Record<string, { namen: string[]; haupt: string; schluessel: string }>;
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Profil { name: string; id?: string; privat: boolean; level: number | null; raenge: Array<{ modus: string; name: string; fortschritt: number | null; bild: string | null }>; gesamt: Array<[string, number]>; modi: Array<{ name: string; werte: Record<string, number> }> }
const STAT: Array<{ re: RegExp; k: string; titel: string }> = [
  { re: /^(wins?|siege?|placetop1)$/i, k: 'wins', titel: 'Wins' }, { re: /^(kills?|elims?|eliminations?|eliminierungen)$/i, k: 'kills', titel: 'Kills' },
  { re: /^(kd|k_d|kdr)$/i, k: 'kd', titel: 'K/D' }, { re: /^(matches|matchesplayed|spiele|games)$/i, k: 'matches', titel: 'Matches' },
  { re: /^(winrate|win_rate|siegquote)$/i, k: 'winRate', titel: 'Win rate' }, { re: /^(minuten|minutes|minutesplayed|spielzeit|playtime)$/i, k: 'minuten', titel: 'Playtime' },
  { re: /^(top3|placetop3)$/i, k: 'top3', titel: 'Top 3' }, { re: /^(top5|placetop5)$/i, k: 'top5', titel: 'Top 5' }, { re: /^(top6|placetop6)$/i, k: 'top6', titel: 'Top 6' },
  { re: /^(top10|placetop10)$/i, k: 'top10', titel: 'Top 10' }, { re: /^(top12|placetop12)$/i, k: 'top12', titel: 'Top 12' }, { re: /^(top25|placetop25)$/i, k: 'top25', titel: 'Top 25' },
  { re: /^(deaths?|tode)$/i, k: 'deaths', titel: 'Deaths' }, { re: /^(score|punkte)$/i, k: 'score', titel: 'Score' }, { re: /^(playersoutlived|ueberlebt)$/i, k: 'outlived', titel: 'Players outlived' },
];
const REIHENFOLGE = ['wins', 'winRate', 'kd', 'kills', 'matches', 'minuten', 'top3', 'top5', 'top6', 'top10', 'top12', 'top25', 'deaths', 'outlived', 'score'];
const menschlich = (k: string) => k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const MODUS_TITEL: Record<string, string> = { br: 'Battle Royale', zb: 'Zero Build', reload: 'Reload', reloadzb: 'Reload Zero Build', og: 'OG', ogzb: 'OG Zero Build', blitz: 'Blitz Royale', ballistic: 'Ballistic', solo: 'Solo', duo: 'Duos', trio: 'Trios', squad: 'Squads', ltm: 'LTMs', gesamt: 'Overall', alle: 'Overall', all: 'Overall', overall: 'Overall' };
const modusTitel = (k: string) => MODUS_TITEL[k.toLowerCase().replace(/[^a-z]/g, '')] ?? menschlich(k);
function zahlen(o: any): Record<string, number> {
  const r: Record<string, number> = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const s = STAT.find((x) => x.re.test(k)); r[s ? s.k : k] = v;
  }
  if (r.kd === undefined && r.kills !== undefined && r.matches) r.kd = r.kills / Math.max(1, r.deaths ?? r.matches - (r.wins ?? 0));
  if (r.winRate === undefined && r.wins !== undefined && r.matches) r.winRate = (r.wins / r.matches) * 100;
  return r;
}
function profilAus(j: any, gesucht: string): Profil | null {
  if (!j || typeof j !== 'object' || (!j.konto && !j.stats && !j.rang && j.privat === undefined)) return null;
  const rang = j.rang && typeof j.rang === 'object' ? j.rang : {};
  const raenge = ((Array.isArray(rang) ? rang.map((v: any) => [v?.modus ?? v?.mode ?? '', v]) : Object.entries(rang)) as Array<[string, any]>).map(([k, v]) => {
    const name = typeof v === 'string' ? v : v?.name ?? v?.rang ?? v?.titel ?? v?.division ?? '';
    const f = typeof v === 'object' && v ? v.fortschritt ?? v.progress ?? null : null;
    return { modus: modusTitel(String(k)), name: String(name), fortschritt: typeof f === 'number' ? (f > 1 ? f / 100 : f) : null, bild: typeof v?.bild === 'string' ? v.bild : null };
  }).filter((r: { name: string }) => r.name && !/^unranked$/i.test(r.name));
  const st = j.stats && typeof j.stats === 'object' ? j.stats : {};
  let gesamt = zahlen(st.gesamt ?? st.alle ?? st.overall ?? st.all ?? st);
  const modiRoh = st.modi ?? st.modes ?? Object.fromEntries(Object.entries(st).filter(([k, v]) => v && typeof v === 'object' && !/^(gesamt|alle|overall|all)$/i.test(k)));
  const modi = ((Array.isArray(modiRoh) ? modiRoh.map((m: any) => [m?.name ?? m?.modus ?? '', m]) : Object.entries(modiRoh ?? {})) as Array<[string, any]>).map(([k, v]) => ({ name: modusTitel(String(k)), werte: zahlen(v) })).filter((m: { werte: Record<string, number> }) => Object.keys(m.werte).length);
  if (!Object.keys(gesamt).length && modi.length) {
    // Kein Gesamtblock: aus den Modi zusammenzaehlen (nur was sich addieren laesst)
    const sum: Record<string, number> = {};
    for (const m of modi) for (const k of ['wins', 'kills', 'matches', 'minuten', 'deaths']) if (m.werte[k] !== undefined) sum[k] = (sum[k] ?? 0) + m.werte[k];
    gesamt = zahlen(sum);
  }
  const lv = Number(j.level ?? j.konto?.level);
  return { name: String(j.konto?.name ?? gesucht), id: j.konto?.id, privat: !!j.privat, level: Number.isFinite(lv) && lv > 0 ? lv : null, raenge, gesamt: REIHENFOLGE.filter((k) => gesamt[k] !== undefined).map((k) => [k, gesamt[k]]), modi };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
const statTitel = (k: string) => STAT.find((s) => s.k === k)?.titel ?? menschlich(k);
const statText = (k: string, v: number) => (k === 'kd' ? v.toFixed(2) : k === 'winRate' ? `${v.toFixed(1)}%` : k === 'minuten' ? (v >= 6000 ? `${Math.round(v / 60).toLocaleString('en')} h` : `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`) : Math.round(v).toLocaleString('en'));

export function Stats() {
  const [params, setParams] = useSearchParams();
  const name = params.get('name') ?? '';
  const [q, setQ] = useState(name);
  const [verz, setVerz] = useState<Verzeichnis | null>(null);
  const [zuletzt, setZuletzt] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hub-stats-zuletzt') ?? '[]'); } catch { return []; } });
  const [z, setZ] = useState<{ status: 'leer' | 'laedt' | 'da' | 'unbekannt' | 'aus'; p: Profil | null }>({ status: 'leer', p: null });
  useEffect(() => { fetch('/api/spieler-namen').then((r) => r.json()).then((j) => setVerz(j?.verzeichnis ?? {})).catch(() => setVerz({})); }, []);
  useEffect(() => {
    setQ(name);
    if (!name) { setZ({ status: 'leer', p: null }); return undefined; }
    let weg = false; setZ({ status: 'laedt', p: null });
    fetch(`/api/fn-spieler?name=${encodeURIComponent(name)}`).then(async (r) => {
      const json = (r.headers.get('content-type') ?? '').includes('json');
      if (!json) return { status: 'aus' as const, p: null };
      const j = await r.json().catch(() => null);
      const p = r.ok ? profilAus(j, name) : null;
      return p ? { status: 'da' as const, p } : { status: r.status === 404 || r.ok ? 'unbekannt' as const : 'aus' as const, p: null };
    }).catch(() => ({ status: 'aus' as const, p: null })).then((x) => {
      if (weg) return; setZ(x);
      if (x.p) setZuletzt((l) => { const neu = [x.p!.name, ...l.filter((n) => n.toLowerCase() !== x.p!.name.toLowerCase())].slice(0, 8); try { localStorage.setItem('hub-stats-zuletzt', JSON.stringify(neu)); } catch { /* egal */ } return neu; });
    });
    return () => { weg = true; };
  }, [name]);
  const s = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  const treffer = useMemo(() => (!verz || s.length < 2 ? [] : Object.entries(verz).filter(([, v]) => v.schluessel.includes(s) || v.namen.some((n) => n.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b[1].schluessel.startsWith(s)) - Number(a[1].schluessel.startsWith(s)) || a[1].haupt.length - b[1].haupt.length).slice(0, 8)), [verz, s, q]);
  // Steht der gesuchte Spieler in unserem Turnier-Verzeichnis? (ueber die Konto-ID, sonst ueber den Namen)
  const comp = useMemo(() => {
    if (!verz || !name) return null;
    if (z.p?.id && verz[z.p.id]) return z.p.id;
    const n = (z.p?.name ?? name).toLowerCase();
    return Object.entries(verz).find(([, v]) => v.namen.some((x) => x.toLowerCase() === n))?.[0] ?? null;
  }, [verz, name, z.p]);
  const suchen = (n: string) => { const t = n.trim(); if (t) setParams({ name: t }); };
  const p = z.p;
  const spalten = p ? REIHENFOLGE.filter((k) => p.modi.some((m) => m.werte[k] !== undefined)).slice(0, 7) : [];
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Player lookup" titel="Look up any player" text="Type an Epic name to see ranks, level, wins, K/D, matches and playtime – mode by mode.">
        <form onSubmit={(e) => { e.preventDefault(); suchen(q); }} className="flex max-w-3xl flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Epic name" autoFocus className="eingabe min-w-0 flex-1 !px-5 !py-4 !text-xl font-bold" />
          <button type="submit" disabled={!q.trim()} className="knopf-prim !px-8 !text-base">Search</button>
        </form>
        {zuletzt.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-xs text-white/40">Recent</span>{zuletzt.map((n) => <button key={n} type="button" onClick={() => suchen(n)} className="chip">{n}</button>)}</div>}
      </SeitenKopf>

      {z.status === 'laedt' && <Laedt text={`Looking up ${name}`} />}
      {z.status === 'unbekannt' && <Leer text={<>No Epic account is called <b className="text-white">{name}</b>. Check the spelling – it has to be the exact Epic display name.</>} />}
      {z.status === 'aus' && <Leer text={<>Casual stats aren't answering right now, so <b className="text-white">{name}</b> can't be looked up at the moment.</>}>{comp && <Link to={`/competitive/player/${comp}`} className="knopf-prim">Open the competitive profile →</Link>}</Leer>}

      {p && (
        <>
          <Flaeche fest className="overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="flex flex-col justify-between gap-6 p-7 lg:p-9">
                <div>
                  <p className="ueber">Epic account</p>
                  <h2 className="titel mt-2 break-words text-6xl lg:text-7xl">{p.name}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {p.level !== null && <Marke ton="akz">Level {p.level}</Marke>}
                    {p.privat && <Marke ton="gold">Private profile</Marke>}
                    {comp && <Marke ton="gruen">Tournament player</Marke>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {comp ? <Link to={`/competitive/player/${comp}`} className="knopf-prim">Competitive profile →</Link> : <span className="text-xs text-white/40">Not in our tournament directory – no cups played that we track.</span>}
                </div>
              </div>
              <div className="border-t border-white/[0.06] p-7 lg:border-l lg:border-t-0 lg:p-9">
                {p.privat && !p.gesamt.length ? <p className="grid h-full place-items-center text-center text-sm leading-relaxed text-white/55">This player keeps their stats private in Fortnite's settings,<br />so wins, K/D and matches aren't public.</p> : p.gesamt.length ? (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
                    {p.gesamt.slice(0, 6).map(([k, v], i) => <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{statTitel(k)}</p><p className={`titel mt-1 text-5xl ${i === 0 ? 'text-akz' : ''}`}>{k === 'kd' || k === 'winRate' || k === 'minuten' ? statText(k, v) : <Zaehler wert={v} />}</p></div>)}
                  </div>
                ) : <p className="grid h-full place-items-center text-sm text-white/45">No match stats for this account yet.</p>}
              </div>
            </div>
          </Flaeche>

          {p.raenge.length > 0 && (
            <Abschnitt titel="Ranked" ueber="Current rank per mode">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {p.raenge.map((r, i) => (
                  <Flaeche key={r.modus} className="p-5" verz={i * 0.04}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{r.modus}</p>
                    <div className="mt-2 flex items-center gap-3">{r.bild && <img src={r.bild} alt="" className="h-12 w-12 shrink-0 object-contain" />}<p className="titel text-3xl">{r.name}</p></div>
                    {r.fortschritt !== null && <><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-akz" initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, r.fortschritt * 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div><p className="zahl mt-1 text-[11px] text-white/40">{Math.round(r.fortschritt * 100)}% to the next rank</p></>}
                  </Flaeche>
                ))}
              </div>
            </Abschnitt>
          )}

          {p.modi.length > 0 && (
            <Abschnitt titel="Mode by mode">
              <Flaeche fest className="overflow-x-auto">
                <table className="tabelle min-w-[640px]">
                  <thead><tr><th>Mode</th>{spalten.map((k) => <th key={k} className="!text-right">{statTitel(k)}</th>)}</tr></thead>
                  <tbody>{p.modi.map((m) => <tr key={m.name}><td className="font-bold text-white">{m.name}</td>{spalten.map((k) => <td key={k} className="zahl text-right text-white/80">{m.werte[k] === undefined ? '–' : statText(k, m.werte[k])}</td>)}</tr>)}</tbody>
                </table>
              </Flaeche>
            </Abschnitt>
          )}
        </>
      )}

      {/* Solange nichts gesucht ist (oder zur Eingabe passend): Spieler aus unserem Turnier-Verzeichnis */}
      {(z.status === 'leer' || treffer.length > 0) && !p && (
        <Abschnitt titel={treffer.length ? 'Tournament players matching' : 'How it works'}>
          {treffer.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {treffer.map(([id, v]) => (
                <Flaeche key={id} klick className="p-4">
                  <p className="truncate text-base font-bold text-white">{v.haupt}</p>
                  <p className="truncate text-xs text-white/40">{v.namen.filter((n) => n !== v.haupt).slice(0, 2).join(' · ') || 'Tournament player'}</p>
                  <div className="mt-3 flex gap-2"><button type="button" onClick={() => suchen(v.haupt)} className="knopf !px-3 !py-1.5 !text-xs">Casual stats</button><Link to={`/competitive/player/${id}`} className="knopf !px-3 !py-1.5 !text-xs">Competitive →</Link></div>
                </Flaeche>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {[['Any Epic name', 'Not just pros: search your own name or a friend’s. The name must match the Epic display name exactly.'], ['Casual and ranked', 'Ranks per mode, account level, wins, K/D, matches and playtime – split by mode.'], ['Plus competitive', verz ? `${Object.keys(verz).length.toLocaleString('en')} tournament players are linked to their full competitive profile.` : 'Tournament players are linked to their full competitive profile.']].map(([t, x], i) => (
                <Flaeche key={t} className="p-5" verz={i * 0.05}><p className="titel text-2xl">{t}</p><p className="mt-2 text-sm leading-relaxed text-white/55">{x}</p></Flaeche>
              ))}
            </div>
          )}
        </Abschnitt>
      )}
    </div>
  );
}

/* ================================================================== Notifications */
const ARTEN = [
  { k: 'turnier', t: 'Tournament starts', x: '15 minutes before a cup you follow' }, { k: 'rotation', t: 'Map rotation', x: 'When a map you like goes live' },
  { k: 'saison', t: 'Season end & live events', x: 'A day and an hour before' }, { k: 'waffen', t: 'Weapon changes', x: 'When a patch changes the loot pool' },
  { k: 'karte', t: 'New map version', x: 'When the island changes' }, { k: 'news', t: 'News', x: 'New in-game news' },
  { k: 'shop', t: 'Wishlist in the shop', x: 'When something you want is in today’s shop' }, { k: 'creator', t: 'Creators you follow', x: 'When they release a new island' },
];
export function Benachrichtigungen() {
  const [erlaubt, setErlaubt] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const [an, setAn] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('hub-benachrichtigungen') ?? '{}'); } catch { return {}; } });
  const [cups, setCups] = useState<Cup[]>([]);
  const jetzt = useJetzt(30_000);
  useEffect(() => { fetch('/api/cup-catalog?modus=alle-aktuell').then((r) => r.json()).then((j) => setCups((j?.cups ?? []) as Cup[])).catch(() => {}); }, []);
  function setzen(k: string) { const neu = { ...an, [k]: !an[k] }; setAn(neu); try { localStorage.setItem('hub-benachrichtigungen', JSON.stringify(neu)); } catch { /* egal */ } }
  async function anschalten() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission(); setErlaubt(p);
    if (p === 'granted') new Notification('CompHub', { body: 'Notifications are on. You will get the alerts you pick here.' });
  }
  const region = (() => { try { return localStorage.getItem('hub-region') || 'EU'; } catch { return 'EU'; } })();
  const naechste = useMemo(() => cups.filter((c) => c.global || c.regionen[region]).map((c) => ({ c, lage: lageVon(c, region, jetzt) })).filter((x) => x.lage.status === 'kommt' && x.lage.naechster)
    .sort((a, b) => (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0)).slice(0, 5), [cups, region, jetzt]);
  const zahl = ARTEN.filter((a) => an[a.k]).length;
  const status = erlaubt === 'granted' ? 'Allowed on this device' : erlaubt === 'denied' ? 'Blocked – allow them in your browser settings' : erlaubt === 'unsupported' ? 'This browser has no notifications' : 'Not turned on yet';
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Notifications" titel="Pick what you hear about" rechts={<button type="button" disabled={erlaubt === 'granted' || erlaubt === 'unsupported'} onClick={anschalten} className="knopf-prim">{erlaubt === 'granted' ? 'Browser notifications on ✓' : 'Turn on browser notifications'}</button>}>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <Kennzahl label="Alerts picked" wert={zahl} ton="akz" unter={`of ${ARTEN.length}`} />
          <Kennzahl label="Browser" wert={erlaubt === 'granted' ? 'On' : erlaubt === 'denied' ? 'Blocked' : 'Off'} unter={status} />
        </div>
      </SeitenKopf>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2">
          {ARTEN.map((a, i) => (
            <motion.button key={a.k} type="button" onClick={() => setzen(a.k)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`fl fl-klick flex items-center gap-4 p-5 text-left ${an[a.k] ? '!border-akz/50' : ''}`}>
              <span className="min-w-0 flex-1"><span className="titel block text-2xl">{a.t}</span><span className="mt-1 block text-sm text-white/50">{a.x}</span></span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${an[a.k] ? 'bg-akz' : 'bg-white/10'}`}><motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={`absolute top-1 h-5 w-5 rounded-full bg-white ${an[a.k] ? 'right-1' : 'left-1'}`} /></span>
            </motion.button>
          ))}
        </div>
        <div className="min-w-0 space-y-6 xl:sticky xl:top-32 xl:self-start">
          <Flaeche className="p-5" verz={0.05}>
            <h3 className="titel text-2xl">Coming up in {region}</h3>
            <p className="text-xs text-white/40">{an.turnier ? 'You get a heads-up 15 minutes before each start.' : 'Turn on “Tournament starts” to be reminded.'}</p>
            <ul className="mt-3 space-y-1">
              {naechste.map(({ c, lage }) => (
                <li key={c.id}><Link to={cupLink(c, lage.fenster)} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                  <span className="relative h-10 w-[72px] shrink-0 overflow-hidden rounded-lg"><CupBild c={c} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white group-hover:text-akz">{c.titel}</span><span className="block truncate text-[11px] text-white/40">{datum(lage.naechster!)}</span></span>
                  <span className="zahl shrink-0 text-xs font-bold text-akz">{dauer(lage.naechster! - jetzt)}</span>
                </Link></li>
              ))}
              {!naechste.length && <li className="py-3 text-sm text-white/40">No cups on the calendar right now.</li>}
            </ul>
          </Flaeche>
          <Flaeche className="p-5 text-sm leading-relaxed text-white/55" verz={0.1}>
            <p className="font-bold text-white">Good to know</p>
            <p className="mt-2">Your picks are saved on this device. Alerts go out once CompHub's push service is switched on – until then this page remembers what you want to hear about, so nothing is lost.</p>
          </Flaeche>
        </div>
      </div>
    </div>
  );
}
