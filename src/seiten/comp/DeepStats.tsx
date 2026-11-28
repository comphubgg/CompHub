import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Laedt, Leer, Marke, Segment, SeitenKopf, Zaehler } from '../../ds/Bausteine';
import { Balken, Chip, Klein, prozent, zahl } from './stats/teile';
import { Waffe, waffenName } from './stats/waffen';

/*
 * Deep Stats im Hub - dieselben Zahlen wie thecomphub.com/deep-stats (/api/deep-stats, gerechnet auf dem Server aus den voll gelesenen Replays):
 *   GET                  -> die Cups mit ihren Spieltagen
 *   GET ?window=W&suche= -> ein Spieltag: Schaden je Waffe, Treffer, Third Partys, Lande- und Todeskarten. liest: true = es wird noch gelesen,
 *                           dann alle 2,5 s noch einmal fragen.
 * Der gewaehlte Spieltag steht in der Adresse (?window=), die Ansicht in ?view=.
 *
 * Aufbau (Design-System 3.0; Betreiber: "ein bisschen lange" -> ueberschaubar): oben die Auswahl und EINE Zeile Zusammenfassung - vier Felder,
 * die je eine Frage beantworten (staerkste Waffe, Kopfschussquote, Third Partys, Karten) und zugleich in ihre Ansicht fuehren. Darunter ein
 * Umschalter Weapons / Accuracy / Third parties / Heatmaps; es ist immer nur EINE Ansicht zu sehen statt einer endlosen Seite.
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

type Ansichten = 'waffen' | 'treffer' | 'dritte' | 'karten';
const ANSICHTEN: Array<{ k: Ansichten; titel: string }> = [{ k: 'waffen', titel: 'Weapons' }, { k: 'treffer', titel: 'Accuracy' }, { k: 'dritte', titel: 'Third\u00a0parties' }, { k: 'karten', titel: 'Heatmaps' }];

/** Kopf eines Blocks innerhalb einer Ansicht. */
function BlockKopf({ ueber, titel, rechts }: { ueber: string; titel: string; rechts?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="ueber">{ueber}</p><h2 className="titel mt-1 text-3xl">{titel}</h2></div>
      {rechts}
    </div>
  );
}

/* ------------------------------------------------------------------ Weapons */

/** Die Waffen als Wand aus Karten mit dem Original-Symbol: die staerkste gross, die naechsten als Raster. */
function WaffenWand({ a }: { a: Ansicht }) {
  const [alle, setAlle] = useState(false);
  const voll = a.waffen.filter((w) => w.dmg > 0);
  const liste = voll.slice(0, alle ? 60 : 13);
  const max = liste[0]?.dmg ?? 1;
  const [erste, ...rest] = liste;
  return (
    <Flaeche className="p-5 lg:p-6">
      <BlockKopf ueber="Total damage" titel="The arsenal" rechts={voll.length > 13 && <button type="button" onClick={() => setAlle(!alle)} className="knopf-leer">{alle ? 'Show the top 13' : `Show all ${voll.length} weapons`}</button>} />
      {erste && (
        <div className="relative isolate flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/35 p-4 sm:p-5">
          <span aria-hidden className="absolute inset-y-0 left-0 -z-10 w-2/3" style={{ background: `radial-gradient(90% 120% at 0% 50%, ${art(erste.art).farbe}30, transparent 70%)` }} />
          <Waffe roh={erste.roh} gross={104} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: art(erste.art).farbe }}>#1 · {art(erste.art).name}</p>
            <p className="titel mt-1 line-clamp-2 text-3xl sm:text-4xl">{waffenName(erste.roh)}</p>
            <p className="zahl mt-1.5 text-xs text-white/50">{zahl(erste.hits)} hits · {prozent(erste.krit, erste.hits)} headshots{typeof erste.spieler === 'number' ? ` · ${zahl(erste.spieler)} players` : ''}</p>
          </div>
          <div className="text-right">
            <p className="titel zahl text-5xl">{zahl(erste.dmg)}</p>
            <p className="text-xs text-white/45"><b className="text-white/80">{prozent(erste.dmg, a.summe.dmg)}</b> of all damage</p>
          </div>
        </div>
      )}
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rest.map((w, i) => (
          <motion.li key={w.roh} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/25 p-2.5">
            <span className="zahl w-5 shrink-0 text-center font-titel text-lg text-white/30">{i + 2}</span>
            <Waffe roh={w.roh} gross={52} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold text-white">{waffenName(w.roh)}</span>
                <span className="zahl shrink-0 text-sm font-extrabold text-white">{zahl(w.dmg)}</span>
              </p>
              <div className="mt-1"><Balken wert={w.dmg} max={max} farbe={art(w.art).farbe} hoehe="h-1" verzoegerung={0.1 + 0.03 * i} /></div>
              <p className="zahl mt-1 truncate text-[11px] text-white/40"><span style={{ color: art(w.art).farbe }}>{art(w.art).name}</span> · {prozent(w.dmg, a.summe.dmg)} · {zahl(w.hits)} hits · {prozent(w.krit, w.hits)} HS{typeof w.spieler === 'number' ? ` · ${zahl(w.spieler)} players` : ''}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </Flaeche>
  );
}

/** Schaden je Waffenklasse: ein gestapelter Balken, die Klassen zum Anwaehlen, darunter die besten Spieler der Klasse. */
function Klassen({ a }: { a: Ansicht }) {
  const arten = a.arten.filter((x) => x.dmg > 0 && x.art !== '?' && a.artBeste[x.art]?.length);
  const [wahl, setWahl] = useState<string>('');
  const gewaehlt = arten.some((x) => x.art === wahl) ? wahl : arten[0]?.art ?? '?';
  const liste = a.artBeste[gewaehlt] ?? [];
  const max = liste[0]?.dmg ?? 1;
  const gesamt = a.arten.reduce((s, x) => s + x.dmg, 0);
  return (
    <Flaeche className="flex flex-col p-5 lg:p-6" verz={0.06}>
      <BlockKopf ueber="By weapon class" titel="Who deals it with what" />
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {a.arten.filter((x) => x.dmg > 0).map((x, i) => (
          <motion.span key={x.art} title={`${art(x.art).name} ${prozent(x.dmg, gesamt)}`} style={{ background: art(x.art).farbe }}
            initial={{ width: 0 }} animate={{ width: `${(x.dmg / Math.max(1, gesamt)) * 100}%` }} transition={{ duration: 0.9, delay: 0.08 * i }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {a.arten.filter((x) => x.dmg > 0 && x.art !== '?' && x.dmg / Math.max(1, gesamt) >= 0.0005).map((x) => (
          <button key={x.art} type="button" onClick={() => setWahl(x.art)}
            className={`rounded-xl border px-3 py-2 text-left transition ${x.art === gewaehlt ? 'border-akz/50 bg-akz/10' : 'border-white/[0.06] bg-black/25 hover:border-white/20'}`}>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/55"><span className="h-2 w-2 rounded-full" style={{ background: art(x.art).farbe }} />{art(x.art).name}</p>
            <p className="zahl mt-0.5 flex items-baseline gap-2"><span className="font-titel text-2xl text-white">{prozent(x.dmg, gesamt)}</span><span className="text-[10px] text-white/35">{prozent(x.krit, x.hits)} HS</span></p>
          </button>
        ))}
      </div>
      <Klein className="mt-5">Most damage with {art(gewaehlt).name}</Klein>
      <AnimatePresence mode="wait">
        <motion.ol key={gewaehlt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 space-y-0.5">
          {liste.slice(0, 8).map((s, i) => (
            <li key={s.epic} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-1 py-1.5 transition hover:bg-white/[0.04]">
              <span className={`zahl text-right text-xs font-black ${i === 0 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</span>
              <div className="min-w-0">
                <Link to={`/competitive/player/${s.epic}`} className="block truncate text-sm font-semibold text-white hover:text-akz">{s.name || s.epic.slice(0, 8)}</Link>
                <div className="mt-1"><Balken wert={s.dmg} max={max} farbe={art(gewaehlt).farbe} hoehe="h-1" /></div>
              </div>
              <span className="zahl text-right"><span className="block text-sm font-bold text-white">{zahl(s.dmg)}</span><span className="block text-[10px] text-white/35">{zahl(s.hits)} hits · {s.spiele} games</span></span>
            </li>
          ))}
        </motion.ol>
      </AnimatePresence>
    </Flaeche>
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
    <li className={`rounded-2xl border transition ${offen ? 'border-akz/30 bg-black/40' : 'border-white/[0.06] bg-black/25 hover:border-white/15'}`}>
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} className="grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left">
        <span className="zahl text-right text-xs font-bold text-white/35">{rang}</span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2"><span className="truncate text-sm font-semibold text-white">{s.name || s.epic.slice(0, 8)}</span><span className="zahl shrink-0 text-[10px] text-white/35">{s.spiele} games · {zahl(s.hits)} hits</span></span>
          <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" style={{ width: `${Math.max(4, (s.dmg / Math.max(1, max)) * 100)}%` }}>
            {jeArt.map(([k, d]) => <span key={k} style={{ width: `${(d / Math.max(1, s.dmg)) * 100}%`, background: art(k).farbe }} />)}
          </span>
        </span>
        <span className="flex items-center gap-2"><span className="zahl text-sm font-black text-white">{zahl(s.dmg)}</span>
          <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 text-white/35 transition ${offen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg></span>
      </button>
      <AnimatePresence>
        {offen && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden border-t border-white/[0.06] px-3 py-3 sm:pl-12">
            {s.waffen.filter((w) => w.dmg > 0 || w.hits > 0).map((w) => (
              <li key={w.roh} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3">
                <Waffe roh={w.roh} gross={32} />
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-semibold text-white/85">{waffenName(w.roh)}</span><span className="zahl shrink-0 text-white/35">{zahl(w.hits)} hits · {prozent(w.krit, w.hits)} HS</span></span>
                  <span className="mt-1 block"><Balken wert={w.dmg} max={wMax} farbe={art(w.art).farbe} hoehe="h-1" /></span>
                </span>
                <span className="zahl w-14 text-right text-xs font-bold text-white">{zahl(w.dmg)}</span>
              </li>
            ))}
            <li className="pt-1"><Link to={`/competitive/player/${s.epic}`} className="knopf-leer !text-xs">Player profile <span aria-hidden>→</span></Link></li>
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

function JeSpieler({ a, suche, setSuche }: { a: Ansicht; suche: string; setSuche: (s: string) => void }) {
  const [n, setN] = useState(16);
  const q = suche.trim().toLowerCase();
  const liste = useMemo(() => {
    const mit = a.spieler.map((s, i) => ({ s, rang: i + 1 }));
    return q ? mit.filter(({ s }) => s.name.toLowerCase().includes(q)) : mit;
  }, [a.spieler, q]);
  const max = a.spieler[0]?.dmg ?? 1;
  const halb = Math.ceil(Math.min(n, liste.length) / 2);
  const zeigen = liste.slice(0, n);
  return (
    <Flaeche fest className="p-5 lg:p-6" verz={0.1}>
      <BlockKopf ueber="Per player" titel="Damage split by weapon class"
        rechts={<input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…" className="eingabe w-full !py-2 sm:w-72" />} />
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(ARTEN).filter(([k]) => k !== '?').map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-white/45"><span className="h-2 w-2 rounded-full" style={{ background: v.farbe }} />{v.name}</span>)}
        <span className="ml-auto text-[11px] text-white/35">Click a player for every weapon</span>
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 xl:grid-cols-2">
        <ul className="space-y-1.5">{zeigen.slice(0, halb).map(({ s, rang }) => <SpielerZeile key={s.epic} s={s} rang={rang} max={max} />)}</ul>
        <ul className="space-y-1.5">{zeigen.slice(halb).map(({ s, rang }) => <SpielerZeile key={s.epic} s={s} rang={rang} max={max} />)}</ul>
      </div>
      {!liste.length && <p className="mt-3 text-sm text-white/40">No player found.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {liste.length > n && <button type="button" onClick={() => setN(n + 40)} className="knopf">Show more <span className="text-white/40">({liste.length - n} left)</span></button>}
        {a.spielerGesamt > a.spieler.length && !q && <p className="text-[11px] text-white/35">Top {a.spieler.length} of {zahl(a.spielerGesamt)} players by damage – search to find anyone else.</p>}
      </div>
    </Flaeche>
  );
}

/* ------------------------------------------------------------------ Accuracy */

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
    <th className="!text-right"><button type="button" onClick={() => setSort(k)} className={`uppercase tracking-[0.2em] transition ${sort === k ? 'text-akz' : 'hover:text-white'}`}>{text}{sort === k ? ' ▾' : ''}</button></th>
  );
  const kacheln: Array<[string, ReactNode, string]> = [
    ['Hits on players', <Zaehler key="h" wert={a.summe.hits} />, 'every hit on an enemy, knocked players included'],
    ['Headshots', <Zaehler key="k" wert={a.summe.krit} />, 'critical hits'],
    ['Headshot rate', prozent(a.summe.krit, a.summe.hits), 'headshots per hit'],
    ['Damage per hit', a.summe.hits ? (a.summe.dmg / a.summe.hits).toFixed(1) : '–', 'effective damage'],
  ];
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Flaeche className="grid h-fit grid-cols-2 xl:grid-cols-1 xl:divide-y xl:divide-white/[0.06]">
        {kacheln.map(([k, v, u]) => (
          <div key={k} className="px-5 py-4">
            <Klein>{k}</Klein>
            <p className="titel zahl mt-1 text-4xl sm:text-5xl">{v}</p>
            <p className="mt-1 text-[11px] text-white/35">{u}</p>
          </div>
        ))}
      </Flaeche>
      <Flaeche fest className="overflow-hidden" verz={0.08}>
        <div className="px-5 pt-5 lg:px-6"><BlockKopf ueber="Top 20 · click a column to sort" titel="The sharpest players" /></div>
        <div className="overflow-x-auto">
          <table className="tabelle min-w-[640px]">
            <thead><tr>
              <th className="w-10 !pl-5">#</th><th>Player</th>
              {kopf('dmg', 'Damage')}{kopf('hits', 'Hits')}{kopf('krit', 'Headshots')}{kopf('kopfQuote', 'HS %')}{mitSchuss && kopf('genau', 'Accuracy')}
            </tr></thead>
            <tbody>
              {zeilen.map((s, i) => (
                <tr key={s.epic}>
                  <td className={`zahl !pl-5 text-xs font-bold ${i < 3 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</td>
                  <td><Link to={`/competitive/player/${s.epic}`} className="font-semibold text-white hover:text-akz">{s.name || s.epic.slice(0, 8)}</Link>
                    <span className="mt-1 block w-40"><Balken wert={wert(s)} max={max} hoehe="h-0.5" /></span></td>
                  <td className={`zahl text-right ${sort === 'dmg' ? 'font-bold text-white' : 'text-white/65'}`}>{zahl(s.dmg)}</td>
                  <td className={`zahl text-right ${sort === 'hits' ? 'font-bold text-white' : 'text-white/65'}`}>{zahl(s.hits)}</td>
                  <td className={`zahl text-right ${sort === 'krit' ? 'font-bold text-white' : 'text-white/65'}`}>{zahl(s.krit)}</td>
                  <td className={`zahl text-right ${sort === 'kopfQuote' ? 'font-bold text-white' : 'text-white/65'}`}>{prozent(s.krit, s.hits)}</td>
                  {mitSchuss && <td className={`zahl text-right ${sort === 'genau' ? 'font-bold text-white' : 'text-white/65'}`}>{s.schuss ? <>{prozent(s.hits, s.schuss)} <span className="text-[10px] text-white/30">/ {zahl(s.schuss)}</span></> : '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-white/[0.06] px-5 py-3 text-[11px] leading-relaxed text-white/35">
          Rates only from 50 hits.{' '}
          {mitSchuss ? 'Accuracy is hits divided by shots fired from the ammo the replay records (from 150 shots).' : 'Shots fired are not recorded for this match day, so there is no accuracy.'}
        </p>
      </Flaeche>
    </div>
  );
}

/* ------------------------------------------------------------------ Third parties */

function ThirdPartys({ a }: { a: Ansicht }) {
  const [wie, setWie] = useState<'ein' | 'dazw'>('ein');
  const liste = useMemo(() => [...a.teams].sort((x, y) => (wie === 'ein' ? y.eingegriffen - x.eingegriffen || x.dazwischen - y.dazwischen : y.dazwischen - x.dazwischen || y.eingegriffen - x.eingegriffen)).slice(0, 16), [a.teams, wie]);
  const summe = a.teams.reduce((s, x) => s + x.eingegriffen, 0);
  const kaempfe = a.teams.reduce((s, x) => s + x.kaempfe, 0) / 2;
  const max = Math.max(1, ...liste.map((x) => Math.max(x.eingegriffen, x.dazwischen)));
  const halb = Math.ceil(liste.length / 2);
  const zeile = (x: TTeam, i: number) => (
    <li key={x.namen.join('|') + i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2">
      <span className={`zahl text-right text-xs font-black ${i === 0 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{x.namen.join(' · ')}</span>
        <span className="mt-1.5 grid grid-cols-2 gap-2"><Balken wert={x.eingegriffen} max={max} hoehe="h-1" /><Balken wert={x.dazwischen} max={max} farbe="#f43f5e" hoehe="h-1" /></span>
      </span>
      <span className="zahl text-right text-[11px] leading-tight text-white/45">
        <span className="block"><b className="text-sm text-akz">{x.eingegriffen}</b> made</span>
        <span className="block"><b className="text-rose-300">{x.dazwischen}</b> suffered · {x.kaempfe} fights</span>
      </span>
    </li>
  );
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Flaeche className="h-fit p-5 lg:p-6">
        <Klein>Third parties</Klein>
        <p className="titel zahl mt-1 text-6xl text-akz"><Zaehler wert={summe} /></p>
        <p className="zahl mt-1 text-xs text-white/45">in {zahl(a.matches)} games{kaempfe > 0 ? ` · about ${zahl(Math.round(kaempfe))} fights` : ''}</p>
        <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-white/50">
          <p><b className="text-white/80">A fight</b> is two teams trading damage – hits both ways, no pause over 15 s.</p>
          <p><b className="text-white/80">A third party</b> is another team that starts hitting either of them during the fight or within 10 s after, without having hit them in the 15 s before.</p>
        </div>
      </Flaeche>
      <Flaeche fest className="p-5 lg:p-6" verz={0.06}>
        <BlockKopf ueber="Top 16 teams" titel={wie === 'ein' ? 'They crash every fight' : 'They always get crashed'}
          rechts={<Segment id="ds-dritte" klein wert={wie} onWahl={setWie} wahl={[{ k: 'ein', titel: 'Third-partied others' }, { k: 'dazw', titel: 'Got third-partied' }]} />} />
        {liste.length === 0 ? <Leer text="No third parties counted on this match day." /> : (
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 xl:grid-cols-2">
            <ol className="space-y-1.5">{liste.slice(0, halb).map((x, i) => zeile(x, i))}</ol>
            <ol className="space-y-1.5">{liste.slice(halb).map((x, i) => zeile(x, i + halb))}</ol>
          </div>
        )}
      </Flaeche>
    </div>
  );
}

/* ------------------------------------------------------------------ Heatmaps */

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
  return <canvas ref={ref} className="block aspect-square w-full" />;
}


/** Landungen und Tode NEBENEINANDER (der Vergleich ist die Aussage); die Karten sind so gross, wie die Bildschirmhoehe erlaubt. */
function Karten({ a }: { a: Ansicht }) {
  const [nr, setNr] = useState(0);
  const k = a.karten[Math.min(nr, a.karten.length - 1)];
  if (!k) return <Leer text="No calibrated map for this match day." />;
  const bilder: Array<{ wie: 'landung' | 'tode'; titel: string; n: number; text: string }> = [];
  if (k.nLandung > 0) bilder.push({ wie: 'landung', titel: 'Landings', n: k.nLandung, text: 'Where each player first touched the ground after bus, glide and parachute – every player of every game.' });
  bilder.push({ wie: 'tode', titel: 'Deaths', n: k.nTode, text: 'Where players were eliminated (revived knocks do not count; in Reload every elimination counts).' });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {a.karten.length > 1 && <Segment id="ds-karte" klein wert={String(Math.min(nr, a.karten.length - 1))} onWahl={(x) => setNr(Number(x))} wahl={a.karten.map((x, i) => ({ k: String(i), titel: `${x.art === 'reload' ? 'Reload' : 'Battle Royale'} · ${x.matches} games` }))} />}
        <span className="zahl text-xs text-white/45">{zahl(k.matches)} games on this map</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-white/45"><span>few</span><span className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg,#38bdf8,#facc15,#ef4444)' }} /><span>many</span></span>
      </div>
      <div className="flex flex-col items-start justify-center gap-5 lg:flex-row">
        {bilder.map((b, i) => (
          <Flaeche key={b.wie + nr} fest className="w-full overflow-hidden lg:w-[min(calc(50%-0.625rem),calc(100vh-11rem))]" verz={0.06 * i}>
            <div className="relative">
              <Waermebild k={k} wie={b.wie} />
              <div className="absolute left-3 top-3 flex items-center gap-2"><Marke ton="akz">{b.titel}</Marke><Marke>{zahl(b.n)}</Marke></div>
            </div>
            <p className="px-4 py-3 text-[12px] leading-relaxed text-white/45">{b.text}</p>
          </Flaeche>
        ))}
      </div>
      {!k.nLandung && <p className="mt-3 text-[12px] text-white/40">These replays were read before landing spots were recorded, so there is no landing map.</p>}
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
        if (w) setAdresse((alt) => { const n = new URLSearchParams(alt); n.set('window', w); return n; }, { replace: true });
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

  const ansichtWahl = (['waffen', 'treffer', 'dritte', 'karten'] as const).find((x) => x === adresse.get('view')) ?? 'waffen';
  const setzeAdresse = (w: string | null, v: Ansichten, ersetzen = false) => setAdresse({ ...(w ? { window: w } : {}), ...(v !== 'waffen' ? { view: v } : {}) }, { replace: ersetzen });
  const waehle = (w: string) => { setAnsicht(null); setSuche(''); setFehler(false); setzeAdresse(w, ansichtWahl); };
  const zeige = (v: Ansichten) => setzeAdresse(fenster, v, true);
  const cup = useMemo(() => cups?.find((c) => c.tage.some((d) => d.windowId === fenster)) ?? null, [cups, fenster]);
  const a = ansicht && ansicht.windowId === fenster ? ansicht : null;
  const tp = a ? a.teams.reduce((s, x) => s + x.eingegriffen, 0) : 0;
  const staerkste = a?.waffen.find((w) => w.dmg > 0) ?? null;
  const fleissig = a ? [...a.teams].sort((x, y) => y.eingegriffen - x.eingegriffen)[0] : null;
  const karte = a?.karten[0] ?? null;
  const tagIndex = cup ? cup.tage.findIndex((d) => d.windowId === fenster) : 0;

  /** Ein Feld der Zusammenfassung: beantwortet eine Frage und fuehrt in seine Ansicht. */
  const feld = (v: Ansichten, ueber: string, innen: ReactNode, i: number) => (
    <motion.button key={v} type="button" onClick={() => zeige(v)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`fl fl-klick group relative flex min-h-[7.5rem] flex-col overflow-hidden p-4 text-left ${ansichtWahl === v ? '!border-akz/60' : ''}`}>
      <span className="flex items-center justify-between gap-2"><Klein className={ansichtWahl === v ? '!text-akz' : ''}>{ueber}</Klein>
        <span aria-hidden className={`text-sm transition group-hover:translate-x-0.5 ${ansichtWahl === v ? 'text-akz' : 'text-white/30'}`}>→</span></span>
      {innen}
      {ansichtWahl === v && <motion.span layoutId="ds-feld" className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full bg-akz shadow-[0_0_16px_rgb(var(--akz)/0.9)]" />}
    </motion.button>
  );

  return (
    <div className="space-y-5">
      <SeitenKopf klein ueber="From the server replays" titel="Deep Stats"
        text="What only a fully read replay can tell: damage per weapon, hits and headshots, third parties, and where the lobby landed and died."
        rechts={(
          <label className="relative block w-full sm:w-[36rem]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Cup</span>
            <select value={cup?.eventId ?? ''} onChange={(e) => { const c = cups?.find((x) => x.eventId === e.target.value); const d = c?.tage.find((x) => x.region === 'EU') ?? c?.tage[0]; if (d) waehle(d.windowId); }}
              className="eingabe w-full cursor-pointer appearance-none !pl-14 !pr-9 font-semibold">
              {!cup && <option value="">Choose a cup…</option>}
              {(cups ?? []).map((c) => <option key={c.eventId} value={c.eventId} className="bg-fl">{schoen(c.titel)} · {c.season} · {/_([A-Z]+)$/.exec(c.eventId)?.[1] ?? ''} · {datum(c.beginn)}</option>)}
            </select>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
            {cups && <span className="absolute -bottom-5 right-1 text-[11px] text-white/35">{cups.length} cups analysed</span>}
          </label>
        )}>
        {cup && cup.tage.length > 1 && (
          <div className="ohne-leiste -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {cup.tage.map((d, i) => (
              <Chip key={d.windowId} an={d.windowId === fenster} onClick={() => waehle(d.windowId)}>
                {d.region} · {tagName(d.windowId, i)} <span className="zahl font-normal opacity-60">{d.matches} games</span>
              </Chip>
            ))}
          </div>
        )}
      </SeitenKopf>

      {fehler && <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">Deep Stats could not be loaded right now. Please try again in a moment.</p>}
      {!fehler && (!cups || (fenster && !a)) && <Laedt text="Reading the replays" />}
      {cups && !cups.length && <Leer text="No match day has been analysed yet." />}

      {a && (
        <>
          {/* Zusammenfassung: links der Spieltag mit seinem Stand, daneben vier Antworten, die in ihre Ansicht fuehren */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
            <Flaeche className="flex flex-col p-4 md:col-span-2 xl:col-span-1">
              <div className="flex flex-wrap items-center gap-2">
                {a.region && <Marke ton="akz">{a.region}</Marke>}<Marke>{tagName(a.windowId, Math.max(0, tagIndex))}</Marke>
                {a.fertig ? <Marke ton="gruen">All {zahl(a.matches)} games read</Marke> : <Marke ton="gold" puls={a.liest}>{zahl(a.matches)} of {a.erwartet ?? '?'} games read</Marke>}
              </div>
              <p className="titel mt-2 line-clamp-2 text-3xl">{schoen(a.titel ?? a.windowId)}</p>
              <div className="zahl mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-3">
                {([['Total damage', a.summe.dmg], ['Games', a.matches], ['Players', a.spielerGesamt]] as const).map(([k, v]) => (
                  <div key={k}><Klein>{k}</Klein><p className="text-xl font-extrabold leading-tight text-white"><Zaehler wert={v} /></p></div>
                ))}
              </div>
              {(!a.fertig || a.ohne > 0) && <p className="mt-2 text-[11px] text-white/40">{!a.fertig && 'Numbers grow as the rest is read. '}{a.ohne > 0 && `${a.ohne} without readable replay.`}</p>}
            </Flaeche>
            {feld('waffen', 'Deadliest weapon', staerkste ? (
              <span className="mt-2 flex items-center gap-3">
                <Waffe roh={staerkste.roh} gross={56} />
                <span className="min-w-0"><span className="block truncate text-[15px] font-extrabold leading-tight text-white">{waffenName(staerkste.roh)}</span>
                  <span className="zahl block text-xs text-white/50"><b className="text-white/85">{prozent(staerkste.dmg, a.summe.dmg)}</b> of all damage</span></span>
              </span>
            ) : <span className="mt-2 text-sm text-white/40">No weapon damage yet</span>, 1)}
            {feld('treffer', 'Headshot rate', (
              <><span className="titel zahl mt-1 text-5xl">{prozent(a.summe.krit, a.summe.hits)}</span>
                <span className="zahl mt-auto text-xs text-white/50">{zahl(a.summe.hits)} hits · {a.summe.hits ? (a.summe.dmg / a.summe.hits).toFixed(1) : '–'} dmg per hit</span></>
            ), 2)}
            {feld('dritte', 'Third parties', (
              <><span className="titel zahl mt-1 text-5xl">{zahl(tp)}</span>
                <span className="mt-auto truncate text-xs text-white/50">{fleissig && fleissig.eingegriffen > 0 ? <>most: <b className="text-white/85">{fleissig.namen.join(' · ')}</b> ({fleissig.eingegriffen})</> : 'none counted'}</span></>
            ), 3)}
            {feld('karten', 'Heatmaps', karte ? (
              <>
                <Bild src={karte.bild} className="absolute inset-0 -z-10 h-full w-full opacity-35 transition duration-700 group-hover:scale-105" />
                <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/60 to-fl/20" />
                <span className="titel zahl mt-1 text-5xl">{zahl(karte.nLandung || karte.nTode)}</span>
                <span className="zahl mt-auto text-xs text-white/60">{karte.nLandung ? `landings · ${zahl(karte.nTode)} deaths mapped` : 'deaths mapped'}</span>
              </>
            ) : <span className="mt-2 text-sm text-white/40">No calibrated map</span>, 4)}
          </div>

          {a.matches === 0 ? <Leer text="No game of this match day has been read yet." /> : (
            <>
              <div className="ohne-leiste -mx-1 overflow-x-auto px-1"><Segment id="ds-ansicht" wert={ansichtWahl} onWahl={zeige} wahl={ANSICHTEN} /></div>
              <AnimatePresence mode="wait">
                <motion.div key={ansichtWahl} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  {ansichtWahl === 'waffen' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"><WaffenWand a={a} /><Klassen a={a} /></div>
                      <JeSpieler a={a} suche={suche} setSuche={setSuche} />
                      <p className="text-[11px] leading-relaxed text-white/35">Newer replays name the weapon behind every hit; for older ones each hit goes to the weapon in hand when it landed. Effective damage as in Player Stats, nothing on knocked players.{a.weg[0] > 0 && ` Here ${((a.weg[0] / (a.weg[0] + a.weg[1])) * 100).toFixed(0)}% of hits carry the weapon from the replay.`}</p>
                    </div>
                  )}
                  {ansichtWahl === 'treffer' && <Treffer a={a} />}
                  {ansichtWahl === 'dritte' && <ThirdPartys a={a} />}
                  {ansichtWahl === 'karten' && <Karten a={a} />}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </>
      )}
    </div>
  );
}
