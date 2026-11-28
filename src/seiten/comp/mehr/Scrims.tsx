import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flaeche, Leer, Marke, Segment, Zaehler } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, SEITE, chip, flaggenPfad, GLOBUS } from './teile';

/*
 * Scrims im Hub (wie /scrims der Seite): die Uebungsrunden der Community-Server - Noble und Poyo aus dem Archiv (/api/scrims?quelle=archiv) und live
 * (quelle=noble, quelle=poyo-heute), dazu Yunite-Server (/api/scrims, ?server=). Kacheln oder Liste, Scrims oder Community Events, Region; die
 * Server mit Discord und Mitgliederzahl (/api/scrims/einladungen). Eine Session oeffnet sich mit Kopf, Event-Info (Punkteverteilung, Summen), Stand
 * (Leaderboard / Spieler / Teams, Suche, Nachladen beim Scrollen), Team-Details mit jeder Runde, den Besten und den Matches. Wie auf der Seite noch
 * nicht fuer alle: nur der Admin sieht die Scrims, sonst "Something Big Is Coming".
 * Die Beispiel-Kacheln der Seite (Platzhalter fuer noch nicht verbundene Server, mit unechten Zahlen) sind hier bewusst weggelassen.
 * Aufbau (Design-System 3.0, 27.11.2026): oben die vier Server als Band (Logo, Mitglieder, online, Join); jede Serie ist eine Karte mit ihrem
 * Logo und den juengsten Sessions gleich sichtbar (kein Aufklappen ueber dem Bild). Eine Session: Kopf mit Logo und allen Sessions als Chips,
 * die Besten als Zahlenreihe, darunter drei Spalten - Event-Info und Lobbies, der Stand, die Details des gewaehlten Teams.
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
      {status === 'live' && <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-red-400" /></span>}
      {status === 'laeuft' && <span className="h-2 w-2 rounded-full border border-white/60" />}
      {status === 'live' ? 'Live' : status === 'laeuft' ? 'Running' : 'Ended'}
    </span>
  );
}
const sitzStatus = (s: Sitzung, jetzt: number) => (s.live ? <span className="text-red-300">Live</span> : s.vorbei ? <span className="text-white/40">Ended</span> : <span className="text-akz">Upcoming · {bald(s.beginn, jetzt)}</span>);

/** Eine Serie als Karte: Logo links, daneben Name, Stand und die juengsten Sessions - ein Klick oeffnet die Session. */
function SerienKarte({ s, offen, umschalten, waehle, i }: { s: Serie; offen: boolean; umschalten: () => void; waehle: (x: Sitzung) => void; i: number }) {
  const st = statusVon(s); const jetzt = Date.now();
  const gezeigt = offen ? s.sitzungen : s.sitzungen.slice(0, 3);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: Math.min(i % 6, 6) * 0.04, duration: 0.45 }}
      className={`fl-fest overflow-hidden ${st === 'live' ? '!border-red-400/40' : ''}`}>
      <div className="flex gap-4 p-3">
        {s.logo && <img src={bild(s.logo)!} alt="" loading="lazy" className={`h-24 w-24 shrink-0 rounded-2xl object-cover ${st === 'vorbei' ? 'opacity-70' : ''}`} />}
        <div className="min-w-0 flex-1 py-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{s.server}</p>
          <h3 className="titel mt-0.5 truncate text-3xl">{s.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {s.inaktiv || s.fehler || s.ruhtSeit ? <Marke>{s.inaktiv || s.ruhtSeit ? 'Inactive' : 'No response'}</Marke> : <StatusMarke status={st} klein />}
            {s.region && <Marke>{s.region}</Marke>}
            <span className="zahl text-[11px] text-white/40">{s.sitzungen.length} sessions</span>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        {!s.sitzungen.length && <p className="px-4 py-3 text-xs text-white/45">{s.inaktiv ? 'This server is inactive right now.' : s.fehler ? 'nobleprac.com is not answering right now.' : s.ruhtSeit ? `No sessions since ${kurz(Date.parse(`${s.ruhtSeit}T12:00:00Z`))}.` : 'No sessions.'}</p>}
        <div className={offen ? 'max-h-80 overflow-y-auto' : ''}>
          {gezeigt.map((x) => (
            <button key={x.id} type="button" onClick={() => waehle(x)} className="flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-2 text-left text-sm transition last:border-b-0 hover:bg-akz/[0.08]">
              <span className={`min-w-0 flex-1 truncate font-semibold ${x.vorbei ? 'text-white/70' : 'text-white'}`}>{x.name}</span>
              {!!x.beginn && <span className="zahl shrink-0 text-[11px] text-white/40">{kurz(x.beginn)}</span>}
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">{sitzStatus(x, jetzt)}</span>
            </button>
          ))}
        </div>
        {s.sitzungen.length > 3 && <button type="button" onClick={umschalten} className="w-full border-t border-white/[0.06] py-2 text-xs font-semibold text-akz transition hover:bg-white/[0.03]">{offen ? 'Show fewer' : `All ${s.sitzungen.length} sessions`}</button>}
      </div>
    </motion.div>
  );
}

/** Die vier Community-Server als Band ueber die Breite: Logo, Mitglieder, gerade online, Discord. */
function ServerBand() {
  const [zahlen, setZahlen] = useState<Record<string, { mitglieder: number; online?: number }>>({});
  useEffect(() => { let weg = false; fetch('/api/scrims/einladungen').then((r) => r.json()).then((d) => { if (!weg) setZahlen(d.zahlen ?? {}); }).catch(() => {}); return () => { weg = true; }; }, []);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SERVER.map((s, i) => (
        <Flaeche key={s.name} fest verz={i * 0.05} className="flex items-center gap-3 overflow-hidden p-2.5">
          <img src={bild(s.logo)!} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-white">{s.name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{s.region}</p>
            {zahlen[s.code] && <p className="mt-0.5 flex items-baseline gap-1.5"><Zaehler wert={zahlen[s.code].mitglieder} className="titel text-2xl !text-akz" /><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">members</span></p>}
            {typeof zahlen[s.code]?.online === 'number' && <p className="zahl flex items-center gap-1.5 text-[11px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{zahlen[s.code].online!.toLocaleString('en')} online</p>}
          </div>
          <a href={`https://discord.com/invite/${s.code}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-[#5865F2] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#4752c4]">Join</a>
        </Flaeche>
      ))}
    </div>
  );
}

function Verteilung({ teams }: { teams: Team[] }) {
  const hoechst = Math.max(1, ...teams.map((t) => t.punkte)); const schritt = Math.ceil((hoechst + 1) / 6);
  const eimer = Array.from({ length: 6 }, (_, i) => ({ von: i * schritt, bis: (i + 1) * schritt - 1, n: teams.filter((t) => t.punkte >= i * schritt && t.punkte < (i + 1) * schritt).length }));
  const max = Math.max(1, ...eimer.map((e) => e.n));
  return (
    <div>
      <div className="flex h-28 items-end gap-2 border-b border-white/10">
        {eimer.map((e, i) => <div key={e.von} className="flex h-full flex-1 flex-col justify-end"><span className="zahl mb-1 text-center text-[10px] font-semibold text-white/50">{e.n || ''}</span><motion.div className="rounded-t-lg bg-akz" initial={{ height: 0 }} animate={{ height: `${(e.n / max) * 80}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} /></div>)}
      </div>
      <div className="zahl mt-1 flex gap-2 text-[9px] text-white/40">{eimer.map((e) => <span key={e.von} className="min-w-0 flex-1 truncate text-center">{e.von}–{e.bis}</span>)}</div>
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
    const l: Array<[string, Team | undefined, (x: Team) => string]> = [['Most points', nach((x) => x.punkte), (x) => `${x.punkte}`], ['Most eliminations', nach((x) => x.elims), (x) => `${x.elims}`], ['Most wins', nach((x) => x.siege), (x) => `${x.siege}`], ['Best average place', nach((x) => x.schnittPlatz, true), (x) => `Ø ${x.schnittPlatz}`],
      ...(teams.some((x) => x.zeitSchnitt > 0) ? [['Longest alive', nach((x) => x.zeitSchnitt), (x: Team) => zeitText(x.zeitSchnitt)] as [string, Team | undefined, (x: Team) => string]] : [])];
    return l.map(([titel, x, w]) => ({ titel, team: x, wert: x ? w(x) : '' }));
  }, [teams]);
  const kopf = (titel: string, zahl?: string | number) => <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3"><span className="h-4 w-1 rounded-full bg-akz" /><h2 className="titel text-xl">{titel}</h2>{zahl != null && <span className="zahl text-xs font-semibold text-white/40">{zahl}</span>}</div>;
  return (
    <div className="-mt-2 space-y-3">
      {/* Kopf: Logo, Titel, Eckdaten, alle Sessions der Serie */}
      <header className="fl-fest overflow-hidden">
        <div className="flex flex-col gap-4 p-3 sm:flex-row">
          {serie.logo && <img src={bild(serie.logo)!} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />}
          <div className="min-w-0 flex-1 sm:py-1">
            <button type="button" onClick={zurueck} className="knopf-leer !text-xs">← All events</button>
            <p className="ueber mt-1.5 truncate !tracking-[0.25em]">{serie.name}</p>
            <h1 className="titel mt-0.5 text-4xl sm:text-5xl">{sitzung.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sitzung.live ? <Marke ton="rot" puls>Live</Marke> : kommt ? <Marke ton="akz">Upcoming · {bald(sitzung.beginn, Date.now())}{sitzung.plaetze ? ` · ${sitzung.spieler ?? 0}/${sitzung.plaetze} players` : ''}</Marke> : <Marke>Ended</Marke>}
              <Marke ton="akz">{sitzung.region ? REGION_NAME[sitzung.region] ?? sitzung.region : 'All regions'}</Marke>
              <Marke>{GROESSE[sitzung.teamGroesse] ?? `${sitzung.teamGroesse}s`}</Marke>
              {sitzung.bauen === 'ZERO_BUILD' && <Marke>Zero Build</Marke>}
              {sitzung.modus && sitzung.modus !== 'Battle Royale' && <Marke>{sitzung.modus}</Marke>}
              {!kommt && <Marke><span className="zahl">{runden.length}</span> {wort}</Marke>}
              <span className="zahl text-xs text-white/50">{uhr(sitzung.beginn)}{sitzung.ende ? ` – ${uhr(sitzung.ende)}` : ''}{sitzung.ende > sitzung.beginn ? ` · ${dauer(sitzung.ende - sitzung.beginn)}` : ''}</span>
            </div>
            {sitzung.beschreibung && <div className="mt-2 max-w-3xl text-sm text-white/55"><p className={`whitespace-pre-line ${mehr ? '' : 'line-clamp-2'}`}>{sitzung.beschreibung}</p><button type="button" onClick={() => setMehr((v) => !v)} className="mt-1 text-xs font-semibold text-white/80 hover:text-akz">{mehr ? 'Less' : 'More'}</button></div>}
          </div>
          {serie.einladung && <a href={serie.einladung} target="_blank" rel="noreferrer" className="self-start rounded-xl bg-[#5865F2] px-4 py-2 text-sm font-bold text-white hover:bg-[#4752c4]">Join server</a>}
        </div>
        <div className="ohne-leiste flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3 py-2.5">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Sessions</span>
          {serie.sitzungen.map((s) => <button key={s.id} type="button" onClick={() => { if (s.id !== sitzung.id) wechsle(s); }} className={chip(s.id === sitzung.id)}>{s.live && <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}{s.name}{s.beginn ? <span className="zahl font-normal text-white/45">{kurz(s.beginn)}</span> : null}</button>)}
        </div>
      </header>
      {!laedt && offeneQuelle && !teams.length && (
        <p className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200/90">
          {kommt ? 'This session has not started yet. The leaderboard appears after the first round.' : sitzung.live ? 'The session is running but has no entries yet — they appear after the first scored round.'
            : nichtDa ? 'The source does not hand out this leaderboard right now. Newer sessions are usually complete.' : 'The source has no entries for this session — apparently nobody played.'} ({quellSeite})
        </p>
      )}
      {laedt ? <Laedt /> : (
        <>
          {/* Die Besten als Zahlenreihe */}
          {beste.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {beste.map((b, i) => (
                <Flaeche key={b.titel} fest verz={i * 0.05} klick className="cursor-pointer p-4">
                  <button type="button" disabled={!b.team} onClick={() => { if (b.team) { setListe('leaderboard'); setGewaehlt(b.team.teamId); } }} className="block w-full text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{b.titel}</p>
                    <p className="titel mt-1 text-5xl !text-akz">{b.wert}</p>
                    <p className="mt-1 truncate text-xs font-bold text-white">{b.team ? <Namen spieler={b.team.spieler} /> : '–'}</p>
                  </button>
                </Flaeche>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_340px] xl:items-start">
            {/* Event-Info und Lobbies */}
            <div className="min-w-0 space-y-3 xl:sticky xl:top-[7.5rem]">
              <Flaeche fest className="overflow-hidden">
                {kopf('Event info')}
                <div className="border-b border-white/[0.06] px-3 py-2.5"><Segment id="scrim-info" klein wert={reiter} onWahl={setReiter} wahl={[{ k: 'uebersicht', titel: 'Overview' }, { k: 'wertung', titel: 'Scoring' }, { k: 'preise', titel: 'Prizes' }, { k: 'streams', titel: 'Streams' }]} /></div>
                {reiter === 'uebersicht' ? (
                  <div className="p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{solo ? 'Player points' : 'Team points'}</p>
                    <Verteilung teams={teams} />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {([...(solo ? [] : [['Teams', teams.length]]), ['Players', teams.reduce((n, x) => n + x.spieler.length, 0)], ['Kills', teams.reduce((n, x) => n + x.elims, 0).toLocaleString('en')], ['Wins', teams.reduce((n, x) => n + x.siege, 0)], [wort, runden.length]] as Array<[string, number | string]>).map(([t, w]) => (
                        <div key={t}><p className="titel zahl text-3xl">{w}</p><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{t}</p></div>
                      ))}
                    </div>
                  </div>
                ) : <p className="p-5 text-center text-sm text-white/40">{offeneQuelle ? 'The source does not name this for this session.' : 'Yunite does not hand this out for this session.'}</p>}
              </Flaeche>
              <Flaeche fest className="overflow-hidden">
                {kopf(wort, runden.length)}
                <div className="max-h-80 overflow-y-auto">
                  {runden.map((r, i) => <div key={r.sessionId} className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-2 text-xs last:border-b-0"><span><span className="block font-semibold text-white/85">{serie.offen ? 'Lobby' : 'Match'} {runden.length - i}</span><span className="zahl text-[10px] text-white/40">{uhr(r.zeitpunkt)}</span></span><span className="text-white/60">{r.ignoriert ? 'not scored' : r.gewertet === 'SCORED' ? `${r.spieler} players` : 'being scored'}</span></div>)}
                  {!runden.length && <p className="py-4 text-center text-xs text-white/40">No round played yet.</p>}
                </div>
              </Flaeche>
            </div>
            {/* Der Stand */}
            <Flaeche fest className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <span className="h-4 w-1 rounded-full bg-akz" /><h2 className="titel text-xl">Session standings</h2><span className="zahl text-xs font-semibold text-white/40">{teams.length} {solo ? 'players' : 'teams'}</span>
                <span className="ml-auto text-[11px] text-white/40">{offeneQuelle ? <a href={quellLink} target="_blank" rel="noreferrer" className="hover:text-akz">Data from {quellSeite}</a> : 'Powered by Yunite'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
                <Segment id="scrim-liste" klein wert={liste} onWahl={setListe} wahl={solo ? [{ k: 'leaderboard', titel: 'Leaderboard' }, { k: 'spieler', titel: 'Players' }] : [{ k: 'leaderboard', titel: 'Leaderboard' }, { k: 'spieler', titel: 'Players' }, { k: 'teams', titel: 'Teams' }]} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" className="eingabe min-w-0 flex-1 !px-3 !py-1.5 !text-xs" />
              </div>
              <div className="overflow-x-auto">
                {liste === 'leaderboard' && (
                  <table className="tabelle zahl"><thead><tr><th className="w-14">Place</th><th>{solo ? 'Player' : 'Team'}</th><th className="!text-right">Points</th><th className="!text-right">Matches</th><th className="!text-right">Wins</th><th className="!text-right">Ø Elims</th></tr></thead>
                    <tbody>{gefiltert.slice(0, zeigen).map((t) => (
                      <tr key={t.teamId} onClick={() => setGewaehlt(t.teamId)} className={`cursor-pointer ${team?.teamId === t.teamId ? '!bg-akz/10' : ''}`}>
                        <td><span className={`titel text-2xl ${t.platz === 1 ? '!text-amber-300' : t.platz <= 3 ? '' : '!text-white/35'}`}>{t.platz}</span></td>
                        <td className="max-w-[340px] font-semibold text-white"><span className="line-clamp-1"><Namen spieler={t.spieler} /></span></td>
                        <td className="text-right font-bold text-white">{t.punkte}</td><td className="text-right text-white/65">{t.matches}</td><td className="text-right text-white/65">{t.siege}</td><td className="text-right text-white/65">{t.elimsJeMatch.toFixed(2)}</td>
                      </tr>))}</tbody></table>
                )}
                {liste === 'spieler' && (
                  <table className="tabelle zahl"><thead><tr><th>Player</th><th className="!text-right">Place</th><th className="!text-right">Points</th><th className="!text-right">Elims</th></tr></thead>
                    <tbody>{gefiltert.slice(0, zeigen).flatMap((t) => t.spieler.map((s) => (
                      <tr key={`${t.teamId}-${s.name}`}><td className="font-semibold text-white"><Namen spieler={[s]} /></td><td className="text-right text-white/65">{t.platz}</td><td className="text-right text-white/65">{t.punkte}</td><td className="text-right text-white/65">{t.elims}</td></tr>)))}</tbody></table>
                )}
                {liste === 'teams' && !solo && (
                  <table className="tabelle zahl"><thead><tr><th>Team</th><th className="!text-right">Elims</th><th className="!text-right">Wins</th><th className="!text-right">Ø Place</th><th className="!text-right">Ø Alive</th></tr></thead>
                    <tbody>{[...gefiltert].sort((a, b) => b.elims - a.elims).slice(0, zeigen).map((t) => (
                      <tr key={t.teamId}><td className="max-w-[340px] font-semibold text-white"><span className="line-clamp-1"><Namen spieler={t.spieler} /></span></td><td className="text-right text-white/65">{t.elims}</td><td className="text-right text-white/65">{t.siege}</td><td className="text-right text-white/65">{t.schnittPlatz}</td><td className="text-right text-white/65">{zeitText(t.zeitSchnitt)}</td></tr>))}</tbody></table>
                )}
                {liste === 'spieler' && <p className="px-4 py-2 text-[11px] text-white/30">Counted per team — every player shows their team's values.</p>}
                {!gefiltert.length && <p className="py-8 text-center text-sm text-white/40">Nobody found.</p>}
                <div ref={ende} aria-hidden className="h-px" />
              </div>
            </Flaeche>
            {/* Details des gewaehlten Teams */}
            {team && (
              <Flaeche fest className="min-w-0 overflow-hidden xl:col-span-2 2xl:sticky 2xl:top-[7.5rem] 2xl:col-span-1">
                {kopf(solo ? 'Player details' : 'Team details', `#${team.platz}`)}
                <div className="space-y-0.5 border-b border-white/[0.06] px-4 py-3">{team.spieler.map((s) => <p key={s.name} className="titel truncate text-3xl"><Namen spieler={[s]} /></p>)}</div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-3 border-b border-white/[0.06] px-4 py-3 2xl:grid-cols-4">
                  {([['Points', team.punkte], ['Matches', team.matches], ['Wins', team.siege], ['Elims', team.elims], ['Ø Elims', team.elimsJeMatch.toFixed(1)], ['Ø Place', team.schnittPlatz], ['Ø Points', team.matches ? (team.punkte / team.matches).toFixed(1) : '–'], ['Ø Alive', zeitText(team.zeitSchnitt)]] as Array<[string, string | number]>).map(([t, w]) => <div key={t} className="min-w-0"><p className="titel zahl truncate text-xl">{w}</p><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{t}</p></div>)}
                </div>
                <div className="grid max-h-[60vh] grid-cols-2 gap-1.5 overflow-y-auto p-3 sm:grid-cols-4 2xl:grid-cols-2">
                  {team.spiele.map((sp, nr) => ({ sp, nr })).reverse().map(({ sp, nr }) => (
                    <div key={nr} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${sp.platz === 1 ? 'border-amber-300/40 bg-amber-300/10' : sp.platz <= 3 ? 'border-white/15 bg-black/40' : 'border-white/[0.06] bg-black/30'} ${sp.zaehlt === false ? 'opacity-50' : ''}`}>
                      <div><p className="zahl text-[10px] text-white/40">{sp.zeitpunkt ? uhr(sp.zeitpunkt, false) : `${serie.offen ? 'Lobby' : 'Match'} ${nr + 1}`}</p><p className="font-bold text-white">{sp.platz}. place</p></div>
                      <div className="text-right"><p className="text-[10px] text-white/40">Elims</p><p className="zahl font-bold text-white">{sp.elims}</p></div>
                    </div>
                  ))}
                </div>
              </Flaeche>
            )}
          </div>
        </>
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start">
        <div className="space-y-4">
          <header><p className="ueber">Community servers</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Scrims</h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/55">Scrims from the community servers — leaderboards, sessions and stats, right on CompHub. Not public yet; the servers are already here.</p></header>
          <ServerBand />
        </div>
        <AnmeldeKarte titel="Admin preview" text="Scrims are not public yet. Admins can sign in to see the preview." />
      </div>
    );
  }
  if (laedt) return <Laedt text="Loading scrims …" />;
  if (offen) return <Session serie={offen.serie} sitzung={offen.sitzung} teams={teams} runden={runden} laedt={laedtCup} nichtDa={nichtDa} zurueck={() => setOffen(null)} wechsle={(s) => { void oeffnen(offen.serie, s); }} />;

  const liveZahl = gezeigt.filter((s) => statusVon(s) === 'live').length;
  const sitzungenZahl = gezeigt.reduce((n, s) => n + s.sitzungen.length, 0);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }}>
          <p className="ueber">Community servers</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">Scrims</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">Leaderboards, sessions and stats from the scrims of the community servers.</p>
        </motion.div>
        <div className="flex gap-7">
          {([['Series', gezeigt.length], ['Sessions', sitzungenZahl], ['Live now', liveZahl]] as Array<[string, number]>).map(([l, v]) => (
            <div key={l} className="text-right"><Zaehler wert={v} className={`titel text-5xl ${l === 'Live now' && v ? '!text-red-400' : '!text-akz'}`} /><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p></div>
          ))}
        </div>
      </header>
      <ServerBand />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <Segment id="scrims-art" wert={art} onWahl={setArt} wahl={[{ k: 'scrims', titel: 'Scrims' }, { k: 'community', titel: 'Community events' }]} />
        <div className="ohne-leiste flex max-w-full items-center gap-1.5 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
          <button type="button" onClick={() => setRegion('alle')} className={chip(region === 'alle')}>All regions</button>
          {regionen.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{REGION_NAME[r] ?? r}</button>)}
        </div>
        <div className="ml-auto"><Segment id="scrims-ansicht" klein wert={ansicht} onWahl={setAnsicht} wahl={[{ k: 'raster', titel: 'Cards' }, { k: 'liste', titel: 'List' }]} /></div>
      </div>
      {hinweis && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200/90">
          {hinweis === 'nicht-eingerichtet' ? 'Yunite is not set up yet — the app key is missing.' : hinweis === 'kein-server' ? 'No Discord server has enabled the app yet. As soon as one does, its scrims show up here.'
            : hinweis === 'kein-premium' ? 'The enabled server has no Yunite Premium — without it Yunite does not hand out its scrims.' : hinweis === 'keine-scrims' ? 'This server has not held any scrims yet.' : <FehlerZeile text="Yunite is not answering right now." />}
          <p className="mt-1 text-[11px] text-amber-200/70">Noble and Poyo are real, from nobleprac.com and scrims.poyocup.com, collected since 21 Sep and updated hourly.</p>
        </div>
      )}
      {!gezeigt.length ? <Leer text={art === 'community' ? 'There are no community events right now.' : 'There are no scrims in this region right now.'} />
        : ansicht === 'raster' ? (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {gezeigt.map((s, i) => <SerienKarte key={s.id} s={s} i={i} offen={offenK === s.id} umschalten={() => setOffenK((v) => (v === s.id ? null : s.id))} waehle={(x) => { void oeffnen(s, x); }} />)}
          </div>
        ) : (
          <Flaeche fest className="overflow-hidden">
            {gezeigt.map((s) => (
              <div key={s.id} className="border-b border-white/[0.05] last:border-0">
                <button type="button" onClick={() => setOffenK((v) => (v === s.id ? null : s.id))} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.035]">
                  {s.logo && <img src={bild(s.logo)!} alt="" className="h-11 w-11 rounded-xl object-cover" />}
                  <span className="min-w-0 flex-1 truncate font-bold text-white">{s.name}</span>
                  {s.region && <Marke>{s.region}</Marke>}
                  <StatusMarke status={statusVon(s)} klein />
                  <span className="zahl w-24 text-right text-xs text-white/40">{s.sitzungen.length} sessions</span>
                </button>
                {offenK === s.id && (
                  <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
                    {s.sitzungen.map((x) => <button key={x.id} type="button" onClick={() => { void oeffnen(s, x); }} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2 text-left text-sm font-semibold text-white/85 transition hover:border-akz/50"><span className="truncate">{x.name}</span><span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">{sitzStatus(x, Date.now())}</span></button>)}
                  </div>
                )}
              </div>
            ))}
          </Flaeche>
        )}
    </div>
  );
}
