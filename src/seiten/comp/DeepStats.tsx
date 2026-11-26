import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas, Titel } from '../../teile/Glas';
import { Balken, Chip, Kopfzeile, Laedt, prozent, zahl } from './stats/teile';
import { Waffe, waffenName } from './stats/waffen';

/*
 * Deep Stats im Hub - dieselben Zahlen wie thecomphub.com/deep-stats (/api/deep-stats, gerechnet auf dem Server aus den voll gelesenen Replays):
 *   GET                  -> die Cups mit ihren Spieltagen
 *   GET ?window=W&suche= -> ein Spieltag: Schaden je Waffe, Treffer, Third Partys, Lande- und Todeskarten. liest: true = es wird noch gelesen,
 *                           dann alle 2,5 s noch einmal fragen.
 * Der gewaehlte Spieltag steht in der Adresse (?window=).
 */

interface Rahmen { x0: number; y0: number; spanne: number }
interface TWaffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler?: number }
interface TSpieler { epic: string; name: string; spiele: number; dmg: number; hits: number; krit: number; schuss: number | null; schussSpiele: number; waffen: TWaffe[] }
interface TTeam { namen: string[]; spiele: number; kaempfe: number; eingegriffen: number; dazwischen: number }
interface TKarte { bild: string; art: 'br' | 'reload'; rahmen: Rahmen; bildRahmen: Rahmen; matches: number; raster: number; landung: number[]; tode: number[]; nLandung: number; nTode: number }
interface Ansicht {
  windowId: string; titel: string | null; region: string | null; matches: number; erwartet: number | null; ohne: number; teilweise: number;
  liest: boolean; fertig: boolean; alteLeser: number; weg: [number, number]; summe: { dmg: number; hits: number; krit: number };
  waffen: TWaffe[]; arten: Array<{ art: string; dmg: number; hits: number; krit: number }>;
  artBeste: Record<string, Array<{ epic: string; name: string; dmg: number; hits: number; krit: number; spiele: number }>>;
  spieler: TSpieler[]; spielerGesamt: number; teams: TTeam[]; teamGesamt: number; karten: TKarte[];
}
interface Tag { windowId: string; titel: string; region: string; beginn: string; matches: number }
interface Cup { eventId: string; titel: string; season: string; beginn: string; tage: Tag[] }

const ARTEN: Record<string, { name: string; farbe: string }> = {
  shotgun: { name: 'Shotguns', farbe: '#f97316' }, ar: { name: 'Assault Rifles', farbe: '#38bdf8' }, smg: { name: 'SMGs', farbe: '#a78bfa' },
  pistol: { name: 'Pistols', farbe: '#facc15' }, sniper: { name: 'Snipers', farbe: '#34d399' }, hacke: { name: 'Pickaxe', farbe: '#94a3b8' },
  sonst: { name: 'Other', farbe: '#f472b6' }, '?': { name: 'Unknown', farbe: '#475569' },
};
const art = (a: string) => ARTEN[a] ?? ARTEN['?'];

/* Namen wie auf der Seite (lib/replayNamen). */
const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const datum = (iso?: string) => { const d = Date.parse(`${iso ?? ''}Z`); return Number.isFinite(d) ? DATUM.format(new Date(d)) : ''; };
function tagName(w: string, i: number) {
  for (const [re, n] of [[/Day\s*_?(\d+)/i, 'Day'], [/Week\s*_?(\d+)/i, 'Week'], [/Heat\s*_?(\d+)/i, 'Heat'], [/Round\s*_?(\d+)/i, 'Round']] as Array<[RegExp, string]>) {
    const m = re.exec(w); if (m) { const ev = /Event\s*_?(\d+)/i.exec(w); return `${ev ? `E${ev[1]} · ` : ''}${n} ${m[1]}`; }
  }
  return `#${i + 1}`;
}
const schoen = (t: string) => (!/^S\d+_/.test(t) ? t : t.replace(/^S\d+_/, '').replace(/_(NAW|NAC|BR|EU|ME|ASIA|OCE)$/, '').split('_')
  .map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')).join(' · '));

function Abschnitt({ nr, titel, text, rechts, children, v = 0 }: { nr: number; titel: string; text?: ReactNode; rechts?: ReactNode; children: ReactNode; v?: number }) {
  return (
    <Glas className="p-6 lg:p-7" verzoegerung={v}>
      <Kopfzeile nr={String(nr).padStart(2, '0')} titel={titel} text={text} rechts={rechts} />
      <div className="mt-6">{children}</div>
    </Glas>
  );
}

/* ------------------------------------------------------------------ 1. Schaden je Waffe */

function Waffenliste({ a }: { a: Ansicht }) {
  const [alle, setAlle] = useState(false);
  const voll = a.waffen.filter((w) => w.dmg > 0);
  const liste = voll.slice(0, alle ? 60 : 10);
  const max = liste[0]?.dmg ?? 1;
  const [erste, ...rest] = liste;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Top weapons by total damage</h3>
      {erste && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mt-3 overflow-hidden rounded-2xl border border-white/10 p-5"
          style={{ background: `radial-gradient(120% 140% at 100% 0%, ${art(erste.art).farbe}33, transparent 60%), rgba(255,255,255,.02)` }}>
          <div className="flex items-center gap-5">
            <Waffe roh={erste.roh} gross={84} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: art(erste.art).farbe }}>#1 · {art(erste.art).name}</p>
              <p className="truncate text-2xl font-extrabold text-white">{waffenName(erste.roh)}</p>
              <p className="mt-1 text-xs text-white/50">{zahl(erste.hits)} hits · {prozent(erste.krit, erste.hits)} headshots{typeof erste.spieler === 'number' ? ` · ${erste.spieler} players` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tabular-nums text-white">{zahl(erste.dmg)}</p>
              <p className="text-xs text-white/45">{prozent(erste.dmg, a.summe.dmg)} of all damage</p>
            </div>
          </div>
        </motion.div>
      )}
      <ul className="mt-3 space-y-1.5">
        {rest.map((w, i) => (
          <motion.li key={w.roh} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}
            className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-white/[0.04]">
            <span className="w-5 text-right text-xs font-bold tabular-nums text-white/35">{i + 2}</span>
            <Waffe roh={w.roh} gross={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white">{waffenName(w.roh)}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-white">{zahl(w.dmg)}</span>
              </p>
              <div className="mt-1"><Balken wert={w.dmg} max={max} farbe={art(w.art).farbe} verzoegerung={0.1 + 0.03 * i} /></div>
              <p className="mt-1 text-[11px] text-white/40"><span style={{ color: art(w.art).farbe }}>{art(w.art).name}</span> · {zahl(w.hits)} hits · {prozent(w.krit, w.hits)} HS · {prozent(w.dmg, a.summe.dmg)}{typeof w.spieler === 'number' ? ` · ${w.spieler} players` : ''}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      {voll.length > 10 && <button type="button" onClick={() => setAlle(!alle)} className="mt-3 text-xs font-semibold text-sky-300 hover:underline">{alle ? 'Show fewer' : `Show all ${voll.length} weapons`}</button>}
    </div>
  );
}

function Klassen({ a }: { a: Ansicht }) {
  const arten = a.arten.filter((x) => x.dmg > 0 && x.art !== '?' && a.artBeste[x.art]?.length);
  const [wahl, setWahl] = useState<string>('');
  const gewaehlt = arten.some((x) => x.art === wahl) ? wahl : arten[0]?.art ?? '?';
  const liste = a.artBeste[gewaehlt] ?? [];
  const max = liste[0]?.dmg ?? 1;
  const gesamt = a.arten.reduce((s, x) => s + x.dmg, 0);
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Damage by weapon class</h3>
      <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {a.arten.filter((x) => x.dmg > 0).map((x, i) => (
          <motion.span key={x.art} title={`${art(x.art).name} ${prozent(x.dmg, gesamt)}`} style={{ background: art(x.art).farbe }}
            initial={{ width: 0 }} animate={{ width: `${(x.dmg / Math.max(1, gesamt)) * 100}%` }} transition={{ duration: 0.9, delay: 0.1 * i }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {a.arten.filter((x) => x.dmg > 0 && x.art !== '?').map((x) => (
          <button key={x.art} type="button" onClick={() => setWahl(x.art)}
            className={`rounded-2xl border px-3 py-2.5 text-left transition ${x.art === gewaehlt ? 'border-white/25 bg-white/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'}`}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/50"><span className="h-2 w-2 rounded-full" style={{ background: art(x.art).farbe }} />{art(x.art).name}</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-white">{prozent(x.dmg, gesamt)}</p>
            <p className="text-[10px] text-white/35">{zahl(x.dmg)} dmg · {prozent(x.krit, x.hits)} HS</p>
          </button>
        ))}
      </div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Most damage with {art(gewaehlt).name}</p>
      <AnimatePresence mode="wait">
        <motion.ol key={gewaehlt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 space-y-1">
          {liste.slice(0, 10).map((s, i) => (
            <li key={s.epic} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
              <span className={`text-right text-xs font-black tabular-nums ${i === 0 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</span>
              <div className="min-w-0">
                <Link to={`/competitive/player/${s.epic}`} className="block truncate text-sm font-semibold text-white hover:text-sky-300">{s.name || s.epic.slice(0, 8)}</Link>
                <div className="mt-1"><Balken wert={s.dmg} max={max} farbe={art(gewaehlt).farbe} hoehe="h-1" /></div>
              </div>
              <span className="text-right"><span className="block text-sm font-bold tabular-nums text-white">{zahl(s.dmg)}</span><span className="block text-[10px] text-white/35">{zahl(s.hits)} hits · {s.spiele} games</span></span>
            </li>
          ))}
        </motion.ol>
      </AnimatePresence>
    </div>
  );
}

function SpielerZeile({ s, rang, max }: { s: TSpieler; rang: number; max: number }) {
  const [offen, setOffen] = useState(false);
  const jeArt = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of s.waffen) m.set(w.art, (m.get(w.art) ?? 0) + w.dmg);
    return [...m.entries()].filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]);
  }, [s.waffen]);
  const wMax = Math.max(1, ...s.waffen.map((w) => w.dmg));
  return (
    <li className={`rounded-2xl border transition ${offen ? 'border-white/15 bg-white/[0.04]' : 'border-white/[0.05] bg-white/[0.015] hover:border-white/12'}`}>
      <button type="button" onClick={() => setOffen(!offen)} className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-left">
        <span className="text-right text-xs font-bold tabular-nums text-white/35">{rang}</span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2"><span className="truncate text-sm font-semibold text-white">{s.name || s.epic.slice(0, 8)}</span><span className="shrink-0 text-[10px] text-white/35">{s.spiele} games · {zahl(s.hits)} hits</span></span>
          <span className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-white/[0.06]" style={{ width: `${Math.max(4, (s.dmg / Math.max(1, max)) * 100)}%` }}>
            {jeArt.map(([k, d]) => <span key={k} style={{ width: `${(d / Math.max(1, s.dmg)) * 100}%`, background: art(k).farbe }} />)}
          </span>
        </span>
        <span className="flex items-center gap-2"><span className="text-sm font-black tabular-nums text-white">{zahl(s.dmg)}</span><span className={`text-xs text-white/40 transition ${offen ? 'rotate-180' : ''}`}>▾</span></span>
      </button>
      <AnimatePresence>
        {offen && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden border-t border-white/5 px-3 py-3 sm:pl-14">
            {s.waffen.filter((w) => w.dmg > 0 || w.hits > 0).map((w) => (
              <li key={w.roh} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3">
                <Waffe roh={w.roh} gross={32} />
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-semibold text-white/85">{waffenName(w.roh)}</span><span className="shrink-0 text-white/35">{zahl(w.hits)} hits · {prozent(w.krit, w.hits)} HS</span></span>
                  <span className="mt-1 block"><Balken wert={w.dmg} max={wMax} farbe={art(w.art).farbe} hoehe="h-1" /></span>
                </span>
                <span className="w-14 text-right text-xs font-bold tabular-nums text-white">{zahl(w.dmg)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function JeSpieler({ a, suche, setSuche }: { a: Ansicht; suche: string; setSuche: (s: string) => void }) {
  const [n, setN] = useState(30);
  const q = suche.trim().toLowerCase();
  const liste = useMemo(() => {
    const mit = a.spieler.map((s, i) => ({ s, rang: i + 1 }));
    return q ? mit.filter(({ s }) => s.name.toLowerCase().includes(q)) : mit;
  }, [a.spieler, q]);
  const max = a.spieler[0]?.dmg ?? 1;
  const halb = Math.ceil(Math.min(n, liste.length) / 2);
  const zeigen = liste.slice(0, n);
  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Per player · damage split by weapon class (click to open)</h3>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-72" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(ARTEN).filter(([k]) => k !== '?').map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-white/45"><span className="h-2 w-2 rounded-full" style={{ background: v.farbe }} />{v.name}</span>)}
      </div>
      <div className="mt-4 grid gap-x-5 gap-y-1.5 xl:grid-cols-2">
        <ul className="space-y-1.5">{zeigen.slice(0, halb).map(({ s, rang }) => <SpielerZeile key={s.epic} s={s} rang={rang} max={max} />)}</ul>
        <ul className="space-y-1.5">{zeigen.slice(halb).map(({ s, rang }) => <SpielerZeile key={s.epic} s={s} rang={rang} max={max} />)}</ul>
      </div>
      {!liste.length && <p className="mt-3 text-sm text-white/40">No player found.</p>}
      {liste.length > n && <button type="button" onClick={() => setN(n + 40)} className="mt-3 text-xs font-semibold text-sky-300 hover:underline">Show more ({liste.length - n})</button>}
      {a.spielerGesamt > a.spieler.length && !q && <p className="mt-2 text-[11px] text-white/35">Top {a.spieler.length} of {zahl(a.spielerGesamt)} players by damage – search to find anyone else.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Treffer */

type Sort = 'hits' | 'krit' | 'kopfQuote' | 'genau' | 'dmg';
function Treffer({ a }: { a: Ansicht }) {
  const [sort, setSort] = useState<Sort>('dmg');
  const mitSchuss = a.spieler.some((s) => s.schuss);
  // Quoten erst ab 50 Treffern bzw. 150 Schuessen.
  const wert = (s: TSpieler) => (sort === 'hits' ? s.hits : sort === 'krit' ? s.krit : sort === 'dmg' ? s.dmg
    : sort === 'kopfQuote' ? (s.hits >= 50 ? s.krit / s.hits : -1) : (s.schuss && s.schuss >= 150 ? s.hits / s.schuss : -1));
  const zeilen = [...a.spieler].filter((s) => wert(s) >= 0).sort((x, y) => wert(y) - wert(x)).slice(0, 20);
  const max = zeilen[0] ? wert(zeilen[0]) : 1;
  const kopf = (k: Sort, text: string) => (
    <th className="px-3 py-3 text-right"><button type="button" onClick={() => setSort(k)} className={`text-[10px] font-bold uppercase tracking-[0.15em] ${sort === k ? 'text-sky-400' : 'text-white/40 hover:text-white'}`}>{text}{sort === k ? ' ▾' : ''}</button></th>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Hits on players', zahl(a.summe.hits)], ['Headshots', zahl(a.summe.krit)], ['Headshot rate', prozent(a.summe.krit, a.summe.hits)], ['Damage per hit', a.summe.hits ? (a.summe.dmg / a.summe.hits).toFixed(1) : '–']] as const).map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{k}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-white">{v}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-white/5"><tr>
            <th className="w-10 px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">#</th>
            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Player</th>
            {kopf('dmg', 'Damage')}{kopf('hits', 'Hits')}{kopf('krit', 'Headshots')}{kopf('kopfQuote', 'HS %')}{mitSchuss && kopf('genau', 'Accuracy')}
          </tr></thead>
          <tbody>
            {zeilen.map((s, i) => (
              <tr key={s.epic} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="px-3 py-2 text-xs font-bold tabular-nums text-white/35">{i + 1}</td>
                <td className="px-3 py-2"><Link to={`/competitive/player/${s.epic}`} className="font-semibold text-white hover:text-sky-300">{s.name || s.epic.slice(0, 8)}</Link>
                  <span className="mt-1 block w-40"><Balken wert={wert(s)} max={max} hoehe="h-0.5" /></span></td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{zahl(s.dmg)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{zahl(s.hits)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{zahl(s.krit)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{prozent(s.krit, s.hits)}</td>
                {mitSchuss && <td className="px-3 py-2 text-right tabular-nums text-white/70">{s.schuss ? <>{prozent(s.hits, s.schuss)} <span className="text-[10px] text-white/30">/ {zahl(s.schuss)}</span></> : '–'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        Hits count every hit on an enemy player, including knocked players. Rates only from 50 hits.{' '}
        {mitSchuss ? 'Accuracy is hits divided by shots fired from the ammo the replay records (from 150 shots).' : 'Shots fired are not recorded for this match day, so there is no accuracy.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Third Partys */

function ThirdPartys({ a }: { a: Ansicht }) {
  const [wie, setWie] = useState<'ein' | 'dazw'>('ein');
  const liste = useMemo(() => [...a.teams].sort((x, y) => (wie === 'ein' ? y.eingegriffen - x.eingegriffen || x.dazwischen - y.dazwischen : y.dazwischen - x.dazwischen || y.eingegriffen - x.eingegriffen)).slice(0, 16), [a.teams, wie]);
  const summe = a.teams.reduce((s, x) => s + x.eingegriffen, 0);
  const max = Math.max(1, ...liste.map((x) => Math.max(x.eingegriffen, x.dazwischen)));
  const halb = Math.ceil(liste.length / 2);
  const zeile = (x: TTeam, i: number) => (
    <li key={x.namen.join('|') + i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]">
      <span className={`text-right text-xs font-black tabular-nums ${i === 0 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{x.namen.join(' · ')}</span>
        <span className="mt-1.5 grid grid-cols-2 gap-2"><Balken wert={x.eingegriffen} max={max} farbe="#38bdf8" hoehe="h-1" /><Balken wert={x.dazwischen} max={max} farbe="#f43f5e" hoehe="h-1" /></span>
      </span>
      <span className="text-right text-[11px] leading-tight text-white/45">
        <span className="block"><b className="text-sm tabular-nums text-sky-300">{x.eingegriffen}</b> made</span>
        <span className="block"><b className="tabular-nums text-rose-300">{x.dazwischen}</b> suffered · {x.kaempfe} fights</span>
      </span>
    </li>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip an={wie === 'ein'} onClick={() => setWie('ein')}>Third-partied others</Chip>
        <Chip an={wie === 'dazw'} onClick={() => setWie('dazw')}>Got third-partied</Chip>
        <span className="ml-auto text-xs text-white/40">{zahl(summe)} third parties in {a.matches} games</span>
      </div>
      <div className="mt-4 grid gap-x-6 xl:grid-cols-2">
        <ol className="space-y-1">{liste.slice(0, halb).map((x, i) => zeile(x, i))}</ol>
        <ol className="space-y-1">{liste.slice(halb).map((x, i) => zeile(x, i + halb))}</ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 4. Waermebilder */

function Waermebild({ k, wie }: { k: TKarte; wie: 'landung' | 'tode' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bild, setBild] = useState<HTMLImageElement | null>(null);
  useEffect(() => { const b = new Image(); b.onload = () => setBild(b); b.src = k.bild; }, [k.bild]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const N = 1100; c.width = N; c.height = N;
    const g = c.getContext('2d'); if (!g) return;
    g.fillStyle = '#070b14'; g.fillRect(0, 0, N, N);
    const r = k.rahmen; const br = k.bildRahmen;
    if (bild) {
      const w = bild.naturalWidth; const h = bild.naturalHeight;
      g.globalAlpha = 0.8;
      g.drawImage(bild, ((r.x0 - br.x0) / br.spanne) * w, ((r.y0 - br.y0) / br.spanne) * h, (r.spanne / br.spanne) * w, (r.spanne / br.spanne) * h, 0, 0, N, N);
      g.globalAlpha = 1; g.fillStyle = 'rgba(2,6,23,.4)'; g.fillRect(0, 0, N, N);
    }
    // Das Raster auf ein kleines Bild, weich hochgezogen.
    const werte = wie === 'landung' ? k.landung : k.tode;
    const max = Math.max(1, ...werte);
    const klein = document.createElement('canvas'); klein.width = k.raster; klein.height = k.raster;
    const kg = klein.getContext('2d'); if (!kg) return;
    const d = kg.createImageData(k.raster, k.raster);
    const farbe = (f: number): [number, number, number] => (f < 0.5 ? [56 + (250 - 56) * f * 2, 189 + (204 - 189) * f * 2, 248 - (248 - 21) * f * 2] : [250 - (250 - 239) * (f - 0.5) * 2, 204 - (204 - 68) * (f - 0.5) * 2, 21 + (68 - 21) * (f - 0.5) * 2]);
    for (let i = 0; i < werte.length; i += 1) {
      if (!werte[i]) continue;
      const f = Math.sqrt(werte[i] / max); const [rr, gg, bb] = farbe(f);
      d.data[i * 4] = rr; d.data[i * 4 + 1] = gg; d.data[i * 4 + 2] = bb; d.data[i * 4 + 3] = Math.round(170 + 85 * f);
    }
    kg.putImageData(d, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.filter = 'blur(12px)'; g.drawImage(klein, 0, 0, N, N); g.drawImage(klein, 0, 0, N, N);
    g.filter = 'blur(2px)'; g.globalAlpha = 0.85; g.drawImage(klein, 0, 0, N, N);
    g.filter = 'none'; g.globalAlpha = 1;
  }, [k, wie, bild]);
  return <canvas ref={ref} className="aspect-square w-full rounded-2xl border border-white/10" />;
}

function Karten({ a }: { a: Ansicht }) {
  const [wie, setWie] = useState<'landung' | 'tode'>('landung');
  const [nr, setNr] = useState(0);
  const k = a.karten[Math.min(nr, a.karten.length - 1)];
  if (!k) return <p className="text-sm text-white/40">No calibrated map for this match day.</p>;
  const zeige = wie === 'landung' && !k.nLandung && k.nTode ? 'tode' : wie;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,820px)_minmax(0,1fr)]">
      <motion.div key={zeige + nr} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}><Waermebild k={k} wie={zeige} /></motion.div>
      <div>
        <div className="flex flex-wrap gap-2">
          {k.nLandung > 0 && <Chip an={zeige === 'landung'} onClick={() => setWie('landung')}>Landings</Chip>}
          <Chip an={zeige === 'tode'} onClick={() => setWie('tode')}>Deaths</Chip>
        </div>
        {a.karten.length > 1 && <div className="mt-3 flex flex-wrap gap-2">{a.karten.map((x, i) => <Chip key={x.bild} an={i === nr} onClick={() => setNr(i)}>{x.art === 'reload' ? 'Reload' : 'Battle Royale'} · {x.matches}</Chip>)}</div>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {[['Games', zahl(k.matches)], [zeige === 'landung' ? 'Landings' : 'Deaths', zahl(zeige === 'landung' ? k.nLandung : k.nTode)]].map(([x, v]) => (
            <div key={x} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{x}</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{v}</p></div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 text-[11px] text-white/45"><span>few</span><span className="h-2 w-48 rounded-full" style={{ background: 'linear-gradient(90deg,#38bdf8,#facc15,#ef4444)' }} /><span>many</span></div>
        <p className="mt-4 max-w-md text-[12px] leading-relaxed text-white/40">
          {!k.nLandung && 'These replays were read before landing spots were recorded, so there is no landing map. '}
          {zeige === 'landung' ? 'Where each player first touched the ground after bus, glide and parachute – every player of every game.' : 'Where players were eliminated (revived knocks do not count; in Reload every elimination counts).'}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function DeepStats() {
  const [adresse, setAdresse] = useSearchParams();
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [ansicht, setAnsicht] = useState<Ansicht | null>(null);
  const [suche, setSuche] = useState('');
  const [sucheServer, setSucheServer] = useState('');
  const fenster = adresse.get('window');

  useEffect(() => {
    fetch('/api/deep-stats').then((r) => r.json()).then((j) => {
      if (!Array.isArray(j?.cups)) { setFehler(true); return; }
      setCups(j.cups);
      if (!new URLSearchParams(window.location.search).get('window')) {
        const erster = (j.cups as Cup[])[0];
        const w = erster?.tage.find((d) => d.region === 'EU')?.windowId ?? erster?.tage[0]?.windowId;
        if (w) setAdresse({ window: w }, { replace: true });
      }
    }).catch(() => setFehler(true));
  }, [setAdresse]);

  useEffect(() => { const z = setTimeout(() => setSucheServer(suche.trim()), 400); return () => clearTimeout(z); }, [suche]);

  // Laden - solange der Server noch liest, alle 2,5 s noch einmal.
  useEffect(() => {
    if (!fenster) return undefined;
    const sig = { weg: false };
    (async () => {
      try {
        for (let runde = 0; runde < 200 && !sig.weg; runde += 1) {
          const r = await fetch(`/api/deep-stats?window=${encodeURIComponent(fenster)}${sucheServer ? `&suche=${encodeURIComponent(sucheServer)}` : ''}`);
          const j = await r.json() as Ansicht & { error?: string };
          if (sig.weg) return;
          if (!r.ok || j.error) { setFehler(true); return; }
          setFehler(false); setAnsicht(j);
          if (!j.liest) return;
          await new Promise((ok) => setTimeout(ok, 2500));
        }
      } catch { if (!sig.weg) setFehler(true); }
    })();
    return () => { sig.weg = true; };
  }, [fenster, sucheServer]);

  const waehle = (w: string) => { setAnsicht(null); setSuche(''); setFehler(false); setAdresse({ window: w }); };
  const cup = useMemo(() => cups?.find((c) => c.tage.some((d) => d.windowId === fenster)) ?? null, [cups, fenster]);
  const a = ansicht && ansicht.windowId === fenster ? ansicht : null;
  const tp = a ? a.teams.reduce((s, x) => s + x.eingegriffen, 0) : 0;

  return (
    <div className="space-y-8">
      <Titel ueber="From the server replays" titel="Deep Stats" text="What only a fully read replay can tell: damage per weapon, hits and headshots, third parties, and where the lobby landed and died." />

      {/* Auswahl: Cup, dann Spieltag */}
      <Glas className="p-5" verzoegerung={0.05}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">Cup</span>
          <select value={cup?.eventId ?? ''} onChange={(e) => { const c = cups?.find((x) => x.eventId === e.target.value); const d = c?.tage.find((x) => x.region === 'EU') ?? c?.tage[0]; if (d) waehle(d.windowId); }}
            className="min-w-0 max-w-full flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm font-semibold text-white focus:border-sky-400/60 focus:outline-none sm:max-w-xl">
            {!cup && <option value="">Choose a cup…</option>}
            {(cups ?? []).map((c) => <option key={c.eventId} value={c.eventId} className="bg-[#0b0f19]">{schoen(c.titel)} · {c.season} · {/_([A-Z]+)$/.exec(c.eventId)?.[1] ?? ''} · {datum(c.beginn)}</option>)}
          </select>
          {cups && <span className="text-xs text-white/35">{cups.length} cups analysed</span>}
        </div>
        {cup && (
          <div className="mt-4 flex flex-wrap gap-2">
            {cup.tage.map((d, i) => (
              <Chip key={d.windowId} an={d.windowId === fenster} onClick={() => waehle(d.windowId)}>
                {d.region} · {tagName(d.windowId, i)} <span className="font-semibold normal-case tracking-normal opacity-70">{d.matches} games</span>
              </Chip>
            ))}
          </div>
        )}
      </Glas>

      {fehler && <Glas className="border-rose-500/30 p-5 text-sm text-rose-300">Deep Stats could not be loaded right now. Please try again in a moment.</Glas>}
      {!fehler && (!cups || (fenster && !a)) && <Laedt text="Reading the replays…" />}
      {cups && !cups.length && <Glas className="p-6 text-sm text-white/45">No match day has been analysed yet.</Glas>}

      {a && (
        <>
          {/* Kopf: Stand und Kennzahlen */}
          <Glas className="overflow-hidden" verzoegerung={0.1}>
            <div className="grid gap-px bg-white/[0.04] md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
              <div className="bg-[#080c16]/60 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">{a.region ?? ''} · {tagName(a.windowId, 0)}</p>
                <p className="mt-1 text-xl font-extrabold text-white">{schoen(a.titel ?? a.windowId)}</p>
                <p className={`mt-2 flex items-center gap-2 text-xs ${a.fertig ? 'text-emerald-300/80' : 'text-amber-300/90'}`}>
                  {a.liest && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />}
                  {a.fertig ? `All ${a.matches} games read from the replays.` : `${a.matches} of ${a.erwartet ?? '?'} games read so far – numbers grow as the rest is read.`}
                  {a.ohne > 0 && ` ${a.ohne} without readable replay.`}
                </p>
              </div>
              {([['Total damage', zahl(a.summe.dmg)], ['Games', zahl(a.matches)], ['Players', zahl(a.spielerGesamt)], ['Third parties', zahl(tp)]] as const).map(([k, v]) => (
                <div key={k} className="bg-[#080c16]/60 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{v}</p></div>
              ))}
            </div>
          </Glas>

          {a.matches === 0 ? <Glas className="p-6 text-sm text-white/45">No game of this match day has been read yet.</Glas> : (
            <>
              <Abschnitt nr={1} titel="Damage per weapon" v={0.15}
                text={<>Newer replays name the weapon behind every hit; for older ones each hit goes to the weapon in hand when it landed. Effective damage as in Player Stats, nothing on knocked players.{a.weg[0] > 0 && ` Here ${((a.weg[0] / (a.weg[0] + a.weg[1])) * 100).toFixed(0)}% of hits carry the weapon from the replay.`}</>}>
                <div className="grid gap-10 xl:grid-cols-2">
                  <Waffenliste a={a} />
                  <Klassen a={a} />
                </div>
                <JeSpieler a={a} suche={suche} setSuche={setSuche} />
              </Abschnitt>
              <Abschnitt nr={2} titel="Hits & accuracy"><Treffer a={a} /></Abschnitt>
              <Abschnitt nr={3} titel="Third parties"
                text="A fight is two teams trading damage (hits both ways, no pause over 15 s); a third party is another team that starts hitting either of them during the fight or within 10 s after, without having hit them in the 15 s before.">
                <ThirdPartys a={a} />
              </Abschnitt>
              <Abschnitt nr={4} titel="Landing & death heatmaps"><Karten a={a} /></Abschnitt>
            </>
          )}
        </>
      )}
    </div>
  );
}
