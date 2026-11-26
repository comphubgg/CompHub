import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Glas } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, Reiter, SEITE, SeitenKopf, Suche, chip, flaggenPfad, GLOBUS } from './teile';

/*
 * Scrims im Hub (wie /scrims der Seite): die Uebungsrunden der Community-Server - Noble und Poyo aus dem Archiv (/api/scrims?quelle=archiv) und live
 * (quelle=noble, quelle=poyo-heute), dazu Yunite-Server (/api/scrims, ?server=). Kacheln oder Liste, Scrims oder Community Events, Region; rechts die
 * Server mit Discord und Mitgliederzahl (/api/scrims/einladungen). Ein Klick auf eine Kachel zeigt die Sessions, eine Session oeffnet sich mit Kopf,
 * Event-Info (Punkteverteilung, Summen), Stand (Leaderboard / Spieler / Teams, Suche, Nachladen beim Scrollen), Team-Details mit jeder Runde, den Besten und
 * den Matches. Wie auf der Seite noch nicht fuer alle: nur der Admin sieht die Scrims, sonst "Something Big Is Coming".
 * Die Beispiel-Kacheln der Seite (Platzhalter fuer noch nicht verbundene Server, mit unechten Zahlen) sind hier bewusst weggelassen.
 */

interface Sitzung { id: string; name: string; beschreibung?: string; bild?: string; teamGroesse: number; region: string; beginn: number; ende: number; art: string; bauen?: string | null; modus?: string | null; live: boolean; vorbei: boolean; guildId?: string; archiv?: boolean; spieler?: number; plaetze?: number }
interface Team { teamId: string; spieler: Array<{ name: string; epicId?: string; land?: string | null }>; platz: number; punkte: number; elims: number; matches: number; siege: number; elimsJeMatch: number; schnittPlatz: number; zeitSchnitt: number; spiele: Array<{ platz: number; elims: number; punkte: number; zeitpunkt: number; zaehlt: boolean }> }
interface Runde { sessionId: string; zeitpunkt: number; gastgeber: string | null; spieler: number; gewertet: string; ignoriert: boolean }
interface Serie { id: string; name: string; region: string; logo: string | null; server: string; sitzungen: Sitzung[]; offen?: boolean; quelle?: 'noble' | 'poyo' | 'yunite'; inaktiv?: boolean; ruhtSeit?: string | null; einladung?: string | null; fehler?: boolean }

const GROESSE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad' };
const REGION_NAME: Record<string, string> = { EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', NAE: 'NA East', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };
const SERVER = [
  { name: 'Noble Scrims', region: 'Europe', code: 'eu', logo: '/scrims/noble-gelb.jpg' },
  { name: 'Manu Scrims', region: 'NA Central', code: 'manua12', logo: '/scrims/manu.jpg' },
  { name: 'Vital Scrims', region: 'NA Central', code: 'vitalscrims', logo: '/scrims/vital-gruen.jpg' },
  { name: 'Poyo No Zone Rules', region: 'Europe', code: 'nzr', logo: '/scrims/poyo-nzr.jpg' },
];
const bild = (p: string | null) => (p && p.startsWith('/scrims/') ? `${SEITE}${p}` : p);

function logoFuer(name: string, eigenes?: string | null): string | null {
  const n = name.toLowerCase();
  if (/noble/.test(n)) return /pro/.test(n) ? '/scrims/noble-gold.jpg' : /division\s*1|div\s*1/.test(n) ? '/scrims/noble-gruen.jpg' : /division\s*2|div\s*2/.test(n) ? '/scrims/noble-lachs.jpg'
    : /division\s*3|div\s*3/.test(n) ? '/scrims/noble-blau.jpg' : /zero|zb/.test(n) ? '/scrims/noble-pink.jpg' : /reload/.test(n) ? '/scrims/noble-rot.jpg' : '/scrims/noble-gelb.jpg';
  if (/vital/.test(n)) return /pro|elite/.test(n) ? '/scrims/vital-gelb.jpg' : /zero|zb|reload/.test(n) ? '/scrims/vital-rot.jpg' : '/scrims/vital-gruen.jpg';
  if (/manu/.test(n)) return '/scrims/manu.jpg';
  if (/poyo/.test(n)) return /solo/.test(n) ? '/scrims/poyo-solo.jpg' : /master/.test(n) ? '/scrims/poyo-master.jpg' : /legend/.test(n) ? '/scrims/poyo-legends.jpg' : /closed/.test(n) ? '/scrims/poyo-closed.jpg' : /prestige/.test(n) ? '/scrims/poyo-prestige.jpg' : '/scrims/poyo-nzr.jpg';
  return eigenes ?? null;
}
const statusVon = (s: Serie) => (s.sitzungen.some((x) => x.live) ? 'live' : s.sitzungen.some((x) => !x.vorbei) ? 'laeuft' : 'vorbei');
const RANG = { live: 0, laeuft: 1, vorbei: 2 } as const;
const uhr = (ms: number, mitDatum = true) => (ms ? new Date(ms).toLocaleString('en-GB', mitDatum ? { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }) : '');
const kurz = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dauer = (ms: number) => (ms <= 0 ? '' : `${Math.floor(ms / 3600_000)}h ${String(Math.round((ms % 3600_000) / 60_000)).padStart(2, '0')}m`);
const zeitText = (s: number) => (s ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : '–');
function bald(ms: number, jetzt: number) {
  const min = Math.max(0, Math.round((ms - jetzt) / 60_000));
  if (min < 24 * 60) return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `in ${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

function Namen({ spieler }: { spieler: Team['spieler'] }) {
  return <>{spieler.map((s, i) => { const f = s.land ? flaggenPfad(s.land.toUpperCase() === 'UK' ? 'GB' : s.land) : null; return (
    <span key={`${s.name}-${i}`}>{i > 0 && ' + '}{f && f !== GLOBUS && <img src={f} alt="" className="mr-1.5 inline-block h-3.5 w-3.5 rounded-full object-cover align-[-2px]" />}{s.name}</span>); })}</>;
}
function StatusMarke({ status, klein }: { status: 'live' | 'laeuft' | 'vorbei'; klein?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/65 font-bold uppercase tracking-wider ring-1 ring-white/15 backdrop-blur ${klein ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} ${status === 'vorbei' ? 'text-white/50' : 'text-white'}`}>
      {status === 'live' && <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-sky-400" /></span>}
      {status === 'laeuft' && <span className="h-2 w-2 rounded-full border border-white/60" />}
      {status === 'live' ? 'Live' : status === 'laeuft' ? 'Running' : 'Ended'}
    </span>
  );
}
const sitzStatus = (s: Sitzung, jetzt: number) => (s.live ? <span className="text-sky-300">Live</span> : s.vorbei ? <span className="text-white/40">Ended</span> : <span className="text-violet-300">Upcoming · {bald(s.beginn, jetzt)}</span>);

function Kachel({ s, offen, umschalten, waehle, i }: { s: Serie; offen: boolean; umschalten: () => void; waehle: (x: Sitzung) => void; i: number }) {
  const st = statusVon(s); const jetzt = Date.now();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }} whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]">
      <div role="button" tabIndex={0} onClick={umschalten} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') umschalten(); }} className="relative block aspect-square w-full cursor-pointer overflow-hidden">
        {s.logo ? <img src={bild(s.logo)!} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${st === 'vorbei' ? 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0' : ''}`} />
          : <div className="h-full w-full bg-gradient-to-br from-sky-900/60 to-[#06080f]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <h3 className="absolute inset-x-0 bottom-0 p-4 text-2xl font-black leading-tight tracking-tight text-white drop-shadow">{s.name}</h3>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {s.inaktiv || s.fehler || s.ruhtSeit ? <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold uppercase text-white/50 ring-1 ring-white/15">{s.inaktiv || s.ruhtSeit ? 'Inactive' : 'No response'}</span> : <StatusMarke status={st} />}
          {s.region && <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold uppercase text-white/85 ring-1 ring-white/15">{s.region}</span>}
        </div>
        <AnimatePresence>
          {offen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 overflow-y-auto bg-[#06080f]/92 p-2 backdrop-blur" onClick={(e) => e.stopPropagation()}>
              {!s.sitzungen.length && <p className="p-3 text-center text-xs text-white/45">{s.inaktiv ? 'This server is inactive right now.' : s.fehler ? 'nobleprac.com is not answering right now.' : s.ruhtSeit ? `No sessions since ${kurz(Date.parse(`${s.ruhtSeit}T12:00:00Z`))}.` : 'No sessions.'}</p>}
              {s.sitzungen.map((x) => (
                <button key={x.id} type="button" onClick={() => waehle(x)} className={`mb-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${x.vorbei ? 'bg-white/[0.03] text-white/55 hover:bg-white/[0.07]' : 'bg-white/[0.07] text-white hover:bg-white/[0.12]'}`}>
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  {!!x.beginn && <span className="shrink-0 text-[11px] tabular-nums text-white/40">{kurz(x.beginn)}</span>}
                  <span className="shrink-0 text-[11px] font-bold uppercase">{sitzStatus(x, jetzt)}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ServerRand() {
  const [zahlen, setZahlen] = useState<Record<string, { mitglieder: number }>>({});
  useEffect(() => { let weg = false; fetch('/api/scrims/einladungen').then((r) => r.json()).then((d) => { if (!weg) setZahlen(d.zahlen ?? {}); }).catch(() => {}); return () => { weg = true; }; }, []);
  return (
    <aside className="space-y-3">
      <h2 className="text-lg font-extrabold text-white">Servers</h2>
      {SERVER.map((s, i) => (
        <motion.div key={s.name} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
          className="flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] pr-3 backdrop-blur-xl">
          <img src={bild(s.logo)!} alt="" className="min-h-16 w-16 shrink-0 self-stretch object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-white">{s.name}</p>
            <p className="text-[11px] text-white/40">{s.region}</p>
            {zahlen[s.code] && <p className="flex items-center gap-1.5 text-[11px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{zahlen[s.code].mitglieder.toLocaleString('en')} members</p>}
          </div>
          <a href={`https://discord.com/invite/${s.code}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-[#5865F2] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#4752c4]">Join</a>
        </motion.div>
      ))}
    </aside>
  );
}

function Verteilung({ teams }: { teams: Team[] }) {
  const hoechst = Math.max(1, ...teams.map((t) => t.punkte)); const schritt = Math.ceil((hoechst + 1) / 6);
  const eimer = Array.from({ length: 6 }, (_, i) => ({ von: i * schritt, bis: (i + 1) * schritt - 1, n: teams.filter((t) => t.punkte >= i * schritt && t.punkte < (i + 1) * schritt).length }));
  const max = Math.max(1, ...eimer.map((e) => e.n));
  return (
    <div>
      <div className="flex h-28 items-end gap-2 border-b border-l border-white/10 pl-2">
        {eimer.map((e, i) => <motion.div key={e.von} title={`${e.n}`} className="flex-1 rounded-t-lg bg-gradient-to-t from-sky-600 to-sky-400" initial={{ height: 0 }} animate={{ height: `${(e.n / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />)}
      </div>
      <div className="mt-1 flex gap-2 pl-2 text-[10px] tabular-nums text-white/40">{eimer.map((e) => <span key={e.von} className="flex-1 text-center">{e.von}-{e.bis}</span>)}</div>
    </div>
  );
}

function Session({ serie, sitzung, teams, runden, laedt, nichtDa, zurueck, wechsle }: { serie: Serie; sitzung: Sitzung; teams: Team[]; runden: Runde[]; laedt: boolean; nichtDa: boolean; zurueck: () => void; wechsle: (s: Sitzung) => void }) {
  const wort = serie.offen ? 'Lobbies' : 'Matches';
  const solo = sitzung.teamGroesse === 1;
  const kommt = !sitzung.live && !sitzung.vorbei;
  const offeneQuelle = serie.quelle === 'noble' || serie.quelle === 'poyo';
  const quellSeite = serie.quelle === 'poyo' ? 'scrims.poyocup.com' : 'nobleprac.com';
  const quellLink = serie.quelle === 'poyo' ? `https://scrims.poyocup.com/servers/${encodeURIComponent(sitzung.guildId ?? '')}/${encodeURIComponent(sitzung.id)}/leaderboard` : `https://nobleprac.com/leaderboards/${encodeURIComponent(sitzung.id)}`;
  const [reiter, setReiter] = useState<'uebersicht' | 'wertung' | 'preise' | 'streams'>('uebersicht');
  const [liste, setListe] = useState<'leaderboard' | 'spieler' | 'teams'>('leaderboard');
  const [q, setQ] = useState('');
  const [mehr, setMehr] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(60);
  const ende = useRef<HTMLDivElement | null>(null);
  const gefiltert = useMemo(() => (q.trim() ? teams.filter((t) => t.spieler.some((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()))) : teams), [teams, q]);
  useEffect(() => { setZeigen(60); }, [liste, q, teams.length]);
  useEffect(() => {
    const el = ende.current; if (!el) return undefined;
    const b = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setZeigen((z) => z + 60); }, { rootMargin: '400px' });
    b.observe(el); return () => b.disconnect();
  }, [zeigen, liste]);
  const team = teams.find((t) => t.teamId === gewaehlt) ?? teams[0] ?? null;
  const beste = useMemo(() => {
    if (!teams.length) return [];
    const nach = (f: (x: Team) => number, auf = false) => [...teams].filter((x) => x.matches > 0).sort((a, b) => (auf ? f(a) - f(b) : f(b) - f(a)))[0];
    const l: Array<[string, Team | undefined, (x: Team) => string]> = [['Most points', nach((x) => x.punkte), (x) => `${x.punkte} points`], ['Most eliminations', nach((x) => x.elims), (x) => `${x.elims} elims`], ['Most wins', nach((x) => x.siege), (x) => `${x.siege} wins`], ['Best average place', nach((x) => x.schnittPlatz, true), (x) => `Ø ${x.schnittPlatz}`],
      ...(teams.some((x) => x.zeitSchnitt > 0) ? [['Longest alive', nach((x) => x.zeitSchnitt), (x: Team) => zeitText(x.zeitSchnitt)] as [string, Team | undefined, (x: Team) => string]] : [])];
    return l.map(([titel, x, w]) => ({ titel, team: x, wert: x ? w(x) : '' }));
  }, [teams]);
  const zeile = 'border-t border-white/[0.04]';
  const th = 'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40';
  return (
    <div className="space-y-6">
      <button type="button" onClick={zurueck} className="text-sm font-semibold text-sky-400 hover:text-sky-300">← All events</button>
      <Glas className="overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {serie.logo && <img src={bild(serie.logo)!} alt="" className="aspect-square w-full shrink-0 object-cover sm:w-56" />}
          <div className="min-w-0 flex-1 p-5">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">{serie.name}: {sitzung.name}</h1>
            {sitzung.beschreibung && <div className="mt-2 max-w-3xl text-sm text-white/55"><p className={`whitespace-pre-line ${mehr ? '' : 'line-clamp-3'}`}>{sitzung.beschreibung}</p><button type="button" onClick={() => setMehr((v) => !v)} className="mt-1 text-xs font-semibold text-white/80 hover:text-sky-300">{mehr ? 'Less' : 'More'}</button></div>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-sky-400 px-3 py-1.5 text-xs font-bold text-[#06080f]">{sitzung.region ? REGION_NAME[sitzung.region] ?? sitzung.region : 'All regions'}</span>
              <select value={sitzung.id} onChange={(e) => { const s = serie.sitzungen.find((x) => x.id === e.target.value); if (s) wechsle(s); }} className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-bold text-white focus:outline-none">
                {serie.sitzungen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.beginn ? ` · ${kurz(s.beginn)}` : ''}</option>)}
              </select>
              {serie.einladung && <a href={serie.einladung} target="_blank" rel="noreferrer" className="rounded-xl bg-[#5865F2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4752c4]">Join server</a>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm font-semibold text-white/80">
              <span>{uhr(sitzung.beginn)}{sitzung.ende ? ` – ${uhr(sitzung.ende)}` : ''}</span>
              {sitzung.ende > sitzung.beginn && <span>{dauer(sitzung.ende - sitzung.beginn)}</span>}
              <span>{GROESSE[sitzung.teamGroesse] ?? `${sitzung.teamGroesse}s`}</span>
              {kommt ? <span className="text-violet-300">Upcoming · {bald(sitzung.beginn, Date.now())}{sitzung.plaetze ? ` · ${sitzung.spieler ?? 0}/${sitzung.plaetze} players` : ''}</span> : <span>{runden.length} {wort}</span>}
              {sitzung.bauen === 'ZERO_BUILD' && <span>Zero Build</span>}
              {sitzung.modus && sitzung.modus !== 'Battle Royale' && <span>{sitzung.modus}</span>}
            </div>
          </div>
        </div>
      </Glas>
      {!laedt && offeneQuelle && !teams.length && (
        <p className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200/90">
          {kommt ? 'This session has not started yet. The leaderboard appears after the first round.' : sitzung.live ? 'The session is running but has no entries yet — they appear after the first scored round.'
            : nichtDa ? 'The source does not hand out this leaderboard right now. Newer sessions are usually complete.' : 'The source has no entries for this session — apparently nobody played.'} ({quellSeite})
        </p>
      )}
      {laedt ? <Laedt /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <section>
              <h2 className="mb-2 text-lg font-extrabold text-white">Event info</h2>
              <Glas className="overflow-hidden">
                <div className="grid grid-cols-4 border-b border-white/5 text-center text-sm font-semibold">
                  {([['uebersicht', 'Overview'], ['wertung', 'Scoring'], ['preise', 'Prizes'], ['streams', 'Streams']] as const).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setReiter(k)} className={`py-3 transition ${reiter === k ? 'border-b-2 border-sky-400 text-white' : 'text-white/40 hover:text-white/75'}`}>{t}</button>
                  ))}
                </div>
                {reiter === 'uebersicht' ? (
                  <div className="p-5">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/70">{solo ? 'Player points' : 'Team points'}</p>
                    <Verteilung teams={teams} />
                    <p className="mt-5 text-sm font-semibold text-white/80">Total <span className="text-xs text-white/40">{runden.length} {wort}</span></p>
                    <div className={`mt-2 grid grid-cols-2 gap-4 ${solo ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                      {([...(solo ? [] : [['Teams', teams.length]]), ['Players', teams.reduce((n, x) => n + x.spieler.length, 0)], ['Kills', teams.reduce((n, x) => n + x.elims, 0).toLocaleString('en')], ['Wins', teams.reduce((n, x) => n + x.siege, 0)]] as Array<[string, number | string]>).map(([t, w]) => (
                        <div key={t}><p className="text-xs text-white/40">{t}</p><p className="text-2xl font-extrabold tabular-nums text-white">{w}</p></div>
                      ))}
                    </div>
                  </div>
                ) : <p className="p-6 text-center text-sm text-white/40">{offeneQuelle ? 'The source does not name this for this session.' : 'Yunite does not hand this out for this session.'}</p>}
              </Glas>
            </section>
            <section>
              <h2 className="mb-2 text-lg font-extrabold text-white">Session standings</h2>
              <div className="mb-3"><Reiter wert={liste} setze={setListe} klein liste={solo ? [['leaderboard', 'Leaderboard'], ['spieler', 'Players']] : [['leaderboard', 'Leaderboard'], ['spieler', 'Players'], ['teams', 'Teams']]} /></div>
              <Glas className="overflow-hidden">
                <p className="border-b border-white/5 px-4 py-2.5 text-center text-xs text-white/45">
                  {offeneQuelle ? <a href={quellLink} target="_blank" rel="noreferrer" className="hover:text-sky-300">Data from {quellSeite}</a> : 'Powered by Yunite'} // {teams.length} {solo ? 'players' : 'teams'}
                </p>
                <div className="border-b border-white/5 px-4 py-2"><Suche wert={q} setze={setQ} platz="Find a player" className="sm:w-full" /></div>
                <div className={liste === 'leaderboard' ? 'grid lg:grid-cols-[minmax(0,1fr)_280px]' : ''}>
                  <div className="overflow-x-auto">
                    {liste === 'leaderboard' && (
                      <table className="w-full text-left text-sm"><thead><tr><th className={`${th} px-4`}>Place</th><th className={th}>{solo ? 'Player' : 'Team'}</th><th className={`${th} text-right`}>Points</th><th className={`${th} text-right`}>Matches</th><th className={`${th} text-right`}>Wins</th><th className={`${th} px-4 text-right`}>Ø Elims</th></tr></thead>
                        <tbody className="tabular-nums">{gefiltert.slice(0, zeigen).map((t) => (
                          <tr key={t.teamId} onClick={() => setGewaehlt(t.teamId)} className={`${zeile} cursor-pointer transition ${team?.teamId === t.teamId ? 'bg-sky-400/10' : 'hover:bg-white/[0.03]'}`}>
                            <td className="px-4 py-2.5"><span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-black ${t.platz === 1 ? 'bg-amber-300/20 text-amber-300' : t.platz <= 3 ? 'bg-white/10 text-white' : 'text-white/45'}`}>{t.platz}</span></td>
                            <td className="max-w-[340px] px-3 py-2.5 font-semibold text-white"><span className="line-clamp-1"><Namen spieler={t.spieler} /></span></td>
                            <td className="px-3 py-2.5 text-right font-bold text-white">{t.punkte}</td><td className="px-3 py-2.5 text-right text-white/65">{t.matches}</td><td className="px-3 py-2.5 text-right text-white/65">{t.siege}</td><td className="px-4 py-2.5 text-right text-white/65">{t.elimsJeMatch.toFixed(2)}</td>
                          </tr>))}</tbody></table>
                    )}
                    {liste === 'spieler' && (
                      <table className="w-full text-left text-sm"><thead><tr><th className={`${th} px-4`}>Player</th><th className={`${th} text-right`}>Place</th><th className={`${th} text-right`}>Points</th><th className={`${th} px-4 text-right`}>Elims</th></tr></thead>
                        <tbody className="tabular-nums">{gefiltert.slice(0, zeigen).flatMap((t) => t.spieler.map((s) => (
                          <tr key={`${t.teamId}-${s.name}`} className={zeile}><td className="px-4 py-2 font-semibold text-white"><Namen spieler={[s]} /></td><td className="px-3 py-2 text-right text-white/65">{t.platz}</td><td className="px-3 py-2 text-right text-white/65">{t.punkte}</td><td className="px-4 py-2 text-right text-white/65">{t.elims}</td></tr>)))}</tbody></table>
                    )}
                    {liste === 'teams' && !solo && (
                      <table className="w-full text-left text-sm"><thead><tr><th className={`${th} px-4`}>Team</th><th className={`${th} text-right`}>Elims</th><th className={`${th} text-right`}>Wins</th><th className={`${th} text-right`}>Ø Place</th><th className={`${th} px-4 text-right`}>Ø Alive</th></tr></thead>
                        <tbody className="tabular-nums">{[...gefiltert].sort((a, b) => b.elims - a.elims).slice(0, zeigen).map((t) => (
                          <tr key={t.teamId} className={zeile}><td className="max-w-[340px] px-4 py-2 font-semibold text-white"><span className="line-clamp-1"><Namen spieler={t.spieler} /></span></td><td className="px-3 py-2 text-right text-white/65">{t.elims}</td><td className="px-3 py-2 text-right text-white/65">{t.siege}</td><td className="px-3 py-2 text-right text-white/65">{t.schnittPlatz}</td><td className="px-4 py-2 text-right text-white/65">{zeitText(t.zeitSchnitt)}</td></tr>))}</tbody></table>
                    )}
                    {liste === 'spieler' && <p className="px-4 py-2 text-[11px] text-white/30">Counted per team — every player shows their team's values.</p>}
                    {!gefiltert.length && <p className="py-8 text-center text-sm text-white/40">Nobody found.</p>}
                    <div ref={ende} aria-hidden className="h-px" />
                  </div>
                  {liste === 'leaderboard' && team && (
                    <div className="border-t border-white/5 lg:border-l lg:border-t-0">
                      <p className="border-b border-white/5 px-4 py-2 text-xs font-semibold text-white/45">#{team.platz} {solo ? 'Player details' : 'Team details'}</p>
                      <div className="space-y-1 border-b border-white/5 px-4 py-3">{team.spieler.map((s) => <p key={s.name} className="truncate text-lg font-black text-white"><Namen spieler={[s]} /></p>)}</div>
                      <div className="grid grid-cols-3 gap-3 border-b border-white/5 px-4 py-3 text-xs tabular-nums">
                        {([['Points', team.punkte], ['Matches', team.matches], ['Wins', team.siege], ['Elims', team.elims], ['Ø Elims', team.elimsJeMatch.toFixed(1)], ['Ø Place', team.schnittPlatz], ['Ø Points', team.matches ? (team.punkte / team.matches).toFixed(1) : '–'], ['Ø Alive', zeitText(team.zeitSchnitt)]] as Array<[string, string | number]>).map(([t, w]) => <div key={t}><p className="text-white/40">{t}</p><p className="font-bold text-white">{w}</p></div>)}
                      </div>
                      <div className={`space-y-1.5 p-3 ${team.spiele.length > 40 ? 'max-h-[80vh] overflow-y-auto' : ''}`}>
                        {team.spiele.map((sp, nr) => ({ sp, nr })).reverse().map(({ sp, nr }) => (
                          <div key={nr} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${sp.platz === 1 ? 'border-amber-300/40 bg-amber-300/10' : sp.platz <= 3 ? 'border-white/15 bg-white/[0.05]' : 'border-white/5 bg-white/[0.02]'} ${sp.zaehlt === false ? 'opacity-50' : ''}`}>
                            <div><p className="text-[10px] text-white/40">{sp.zeitpunkt ? uhr(sp.zeitpunkt, false) : `${serie.offen ? 'Lobby' : 'Match'} ${nr + 1}`}</p><p className="font-bold text-white">{sp.platz}. place</p></div>
                            <div className="text-right"><p className="text-[10px] text-white/40">Elims</p><p className="font-bold tabular-nums text-white">{sp.elims}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Glas>
            </section>
          </div>
          <aside className="space-y-6">
            <section>
              <h2 className="mb-2 text-lg font-extrabold text-white">The best</h2>
              <Glas className="overflow-hidden border-sky-400/30">
                {beste.map((b) => <div key={b.titel} className="border-b border-white/[0.04] px-4 py-3 last:border-0"><p className="text-[11px] font-semibold text-sky-300">{b.titel}</p><p className="truncate text-sm font-bold text-white">{b.team ? <Namen spieler={b.team.spieler} /> : '–'}</p><p className="text-[11px] text-white/40">{b.wert}</p></div>)}
                {!beste.length && <p className="p-4 text-xs text-white/40">No results yet.</p>}
              </Glas>
            </section>
            <section>
              <h2 className="mb-2 text-lg font-extrabold text-white">{wort} <span className="text-xs font-normal text-white/40">{runden.length}</span></h2>
              <Glas className="max-h-96 space-y-1.5 overflow-y-auto p-3">
                {runden.map((r, i) => <div key={r.sessionId} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"><p className="text-[10px] text-white/40">{uhr(r.zeitpunkt)} // {serie.offen ? 'Lobby' : 'Match'} {runden.length - i}</p><p className="font-semibold text-white/85">{r.ignoriert ? 'not scored' : r.gewertet === 'SCORED' ? `${r.spieler} players` : 'being scored'}</p></div>)}
                {!runden.length && <p className="py-4 text-center text-xs text-white/40">No round played yet.</p>}
              </Glas>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function Scrims() {
  const { wer } = useWer();
  const darf = !!wer?.isAdmin;
  const [serien, setSerien] = useState<Serie[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [hinweis, setHinweis] = useState('');
  const [offenK, setOffenK] = useState<string | null>(null);
  const [offen, setOffen] = useState<{ serie: Serie; sitzung: Sitzung } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [runden, setRunden] = useState<Runde[]>([]);
  const [laedtCup, setLaedtCup] = useState(false);
  const [nichtDa, setNichtDa] = useState(false);
  const [art, setArt] = useState<'scrims' | 'community'>('scrims');
  const [ansicht, setAnsicht] = useState<'raster' | 'liste'>('raster');
  const [region, setRegion] = useState('alle');

  const holen = useCallback(async () => {
    setHinweis('');
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [archiv, live] = await Promise.all([j('/api/scrims?quelle=archiv'), j('/api/scrims?quelle=noble')]);
    const poyo = (archiv?.server ?? []).filter((s: { quelle: string }) => s.quelle === 'poyo').map((s: { guildId: string }) => s.guildId);
    const heute = poyo.length ? (await j(`/api/scrims?quelle=poyo-heute&server=${poyo.join(',')}`))?.heute ?? {} : {};
    const liveNoble = new Map<string, { guildId: string; name: string; logo: string; offen?: boolean; inaktiv?: boolean; fehler?: boolean; sitzungen: Sitzung[]; einladung?: string | null }>((live?.serien ?? []).map((x: { guildId: string }) => [x.guildId, x]));
    const server: Array<{ quelle: 'noble' | 'poyo'; guildId: string; name: string; bild?: string | null; inaktiv?: boolean; einladung?: string | null; letzterTag?: string | null }> = [...(archiv?.server ?? [])];
    for (const x of liveNoble.values()) if (!server.some((s) => s.quelle === 'noble' && s.guildId === x.guildId)) server.push({ quelle: 'noble', guildId: x.guildId, name: x.name, inaktiv: x.inaktiv });
    const echte: Serie[] = server.map((sv) => {
      const ausArchiv: Sitzung[] = (archiv?.sitzungen ?? []).filter((s: { quelle: string; guildId: string }) => s.quelle === sv.quelle && s.guildId === sv.guildId)
        .map((s: { id: string; name: string; teamGroesse: number; beginn: number; ende: number; modus?: string | null; guildId: string; nichtDa?: boolean }) => ({ id: s.id, name: s.name, teamGroesse: s.teamGroesse, region: 'EU', beginn: s.beginn, ende: s.ende, art: 'SCRIM', modus: s.modus ?? null, live: false, vorbei: true, guildId: s.guildId, archiv: !s.nichtDa }));
      const nl = sv.quelle === 'noble' ? liveNoble.get(sv.guildId) : undefined;
      const bekannt = new Set(ausArchiv.filter((s) => s.archiv).map((s) => s.id));
      const dazu: Sitzung[] = [...(nl?.sitzungen ?? []), ...((heute[sv.guildId] ?? []) as Array<Sitzung>).map((h) => ({ ...h, region: 'EU', ende: 0, art: 'SCRIM', vorbei: false, live: h.live || h.beginn <= Date.now() }))].filter((s) => !bekannt.has(s.id));
      const sitzungen = [...ausArchiv.filter((s) => s.archiv || !dazu.some((d) => d.id === s.id)), ...dazu].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.beginn - a.beginn);
      return { id: `${sv.quelle}-${sv.guildId}`, name: sv.name, region: 'EU', server: sv.quelle === 'noble' ? 'Noble Scrims' : 'Poyo Scrims', logo: nl?.logo ?? logoFuer(sv.name, sv.bild ?? null), offen: nl?.offen, inaktiv: sv.inaktiv || nl?.inaktiv, fehler: !sitzungen.length && nl?.fehler, ruhtSeit: sv.quelle === 'poyo' && !sitzungen.length ? sv.letzterTag ?? null : null, einladung: nl?.einladung ?? sv.einladung ?? null, quelle: sv.quelle, sitzungen };
    });
    try {
      const d = await j('/api/scrims');
      if (!d || d.error === 'nicht-eingerichtet' || d.eingerichtet === false) { setHinweis('nicht-eingerichtet'); setSerien(echte); return; }
      const neu: Serie[] = []; let ohnePremium = 0;
      for (const s of (d.server ?? []) as Array<{ guildId: string; name: string; bild: string | null }>) {
        const e = await j(`/api/scrims?server=${encodeURIComponent(s.guildId)}`);
        if (e?.error === 'kein-premium') { ohnePremium++; continue; }
        const sitzungen: Sitzung[] = ((e?.turniere ?? []) as Sitzung[]).map((x) => ({ ...x, guildId: s.guildId })).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.beginn - a.beginn);
        if (!sitzungen.length) continue;
        const rs = [...new Set(sitzungen.map((x) => x.region).filter(Boolean))];
        neu.push({ id: s.guildId, name: s.name, server: s.name, region: rs.length === 1 ? rs[0] : '', logo: logoFuer(s.name, s.bild ?? sitzungen[0]?.bild ?? null), sitzungen, quelle: 'yunite' });
      }
      if (!neu.length) setHinweis(!(d.server ?? []).length ? 'kein-server' : ohnePremium ? 'kein-premium' : 'keine-scrims');
      setSerien([...echte, ...neu]);
    } catch { setHinweis('fehler'); setSerien(echte); } finally { setLaedt(false); }
  }, []);
  useEffect(() => { if (darf) void holen(); }, [darf, holen]);

  const oeffnen = useCallback(async (serie: Serie, sitzung: Sitzung) => {
    setOffen({ serie, sitzung }); setTeams([]); setRunden([]); setNichtDa(false); setOffenK(null); window.scrollTo({ top: 0 });
    const url = sitzung.archiv ? `/api/scrims?quelle=archiv&turnier=${encodeURIComponent(sitzung.id)}`
      : serie.quelle === 'poyo' ? (!sitzung.live && !sitzung.vorbei ? '' : `/api/scrims?quelle=poyo&server=${encodeURIComponent(sitzung.guildId ?? '')}&turnier=${encodeURIComponent(sitzung.id)}`)
        : serie.quelle === 'noble' ? `/api/scrims?quelle=noble&turnier=${encodeURIComponent(sitzung.id)}`
          : `/api/scrims?server=${encodeURIComponent(sitzung.guildId ?? serie.id)}&turnier=${encodeURIComponent(sitzung.id)}`;
    if (!url) return;
    setLaedtCup(true);
    try {
      const d = await fetch(url).then((r) => r.json());
      setTeams(d.teams ?? []); setRunden(d.runden ?? []);
      setNichtDa(!!d.nichtDa || (!!sitzung.archiv && !d.teams));
      if (d.turnier && (sitzung.archiv || serie.quelle === 'noble')) setOffen({ serie, sitzung: { ...sitzung, ...d.turnier, archiv: sitzung.archiv } });
    } catch { setNichtDa(true); } finally { setLaedtCup(false); }
  }, []);

  const regionen = useMemo(() => [...new Set(serien.map((x) => x.region).filter(Boolean))].sort(), [serien]);
  const gezeigt = useMemo(() => serien.map((s) => ({ ...s, sitzungen: s.sitzungen.filter((x) => (art === 'scrims' ? x.art === 'SCRIM' : x.art !== 'SCRIM')) }))
    .filter((s) => s.sitzungen.length || (art === 'scrims' && (s.inaktiv || s.fehler || s.ruhtSeit)))
    .filter((s) => region === 'alle' || s.region === region)
    .sort((a, b) => RANG[statusVon(a)] - RANG[statusVon(b)]), [serien, art, region]);

  if (!wer) return <Laedt />;
  if (!darf) {
    return (
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="relative"><div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-sky-500/25 blur-3xl" /><img src="/logos/CompHub-Logo-frei.png" alt="" className="h-24 w-auto" /></div>
        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Something Big Is Coming</h1>
        <p className="mt-4 max-w-xl text-white/55">Scrims from the community servers — leaderboards, sessions and stats, right on CompHub.</p>
        <div className="mt-8"><AnmeldeKarte titel="Admin preview" text="Scrims are not public yet. Admins can sign in to see the preview." /></div>
      </div>
    );
  }
  if (laedt) return <Laedt text="Loading scrims …" />;
  if (offen) return <Session serie={offen.serie} sitzung={offen.sitzung} teams={teams} runden={runden} laedt={laedtCup} nichtDa={nichtDa} zurueck={() => setOffen(null)} wechsle={(s) => { void oeffnen(offen.serie, s); }} />;

  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Community servers" titel="Scrims" text="Leaderboards, sessions and stats from the scrims of the community servers." />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setArt('scrims')} className={chip(art === 'scrims')}>Scrims</button>
        <button type="button" onClick={() => setArt('community')} className={chip(art === 'community')}>Community events</button>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <button type="button" onClick={() => setAnsicht('raster')} className={chip(ansicht === 'raster')}>Grid</button>
        <button type="button" onClick={() => setAnsicht('liste')} className={chip(ansicht === 'liste')}>List</button>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none">
          <option value="alle">All regions</option>{regionen.map((r) => <option key={r} value={r}>{REGION_NAME[r] ?? r}</option>)}
        </select>
      </div>
      {hinweis && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200/90">
          {hinweis === 'nicht-eingerichtet' ? 'Yunite is not set up yet — the app key is missing.' : hinweis === 'kein-server' ? 'No Discord server has enabled the app yet. As soon as one does, its scrims show up here.'
            : hinweis === 'kein-premium' ? 'The enabled server has no Yunite Premium — without it Yunite does not hand out its scrims.' : hinweis === 'keine-scrims' ? 'This server has not held any scrims yet.' : <FehlerZeile text="Yunite is not answering right now." />}
          <p className="mt-1 text-[11px] text-amber-200/70">Noble and Poyo are real, from nobleprac.com and scrims.poyocup.com, collected since 21 Sep and updated hourly.</p>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {!gezeigt.length ? <Glas className="p-8 text-center text-sm text-white/45">{art === 'community' ? 'There are no community events right now.' : 'There are no scrims in this region right now.'}</Glas>
            : ansicht === 'raster' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {gezeigt.map((s, i) => <Kachel key={s.id} s={s} i={i} offen={offenK === s.id} umschalten={() => setOffenK((v) => (v === s.id ? null : s.id))} waehle={(x) => { void oeffnen(s, x); }} />)}
              </div>
            ) : (
              <Glas className="overflow-hidden">
                {gezeigt.map((s) => (
                  <div key={s.id} className="border-b border-white/[0.04] last:border-0">
                    <button type="button" onClick={() => setOffenK((v) => (v === s.id ? null : s.id))} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.03]">
                      {s.logo && <img src={bild(s.logo)!} alt="" className="h-11 w-11 rounded-xl object-cover" />}
                      <span className="min-w-0 flex-1 truncate font-bold text-white">{s.name}</span>
                      {s.region && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold text-white/70">{s.region}</span>}
                      <StatusMarke status={statusVon(s)} klein />
                      <span className="w-24 text-right text-xs text-white/40">{s.sitzungen.length} sessions</span>
                    </button>
                    {offenK === s.id && (
                      <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                        {s.sitzungen.map((x) => <button key={x.id} type="button" onClick={() => { void oeffnen(s, x); }} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm font-semibold text-white/85 hover:bg-white/[0.08]"><span className="truncate">{x.name}</span><span className="text-[11px] font-bold uppercase">{sitzStatus(x, Date.now())}</span></button>)}
                      </div>
                    )}
                  </div>
                ))}
              </Glas>
            )}
        </div>
        <ServerRand />
      </div>
    </div>
  );
}
