import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { Laedt, TEAL, Ueberschrift } from './Teile';
import { kurz, letzter, useModi, useTopInseln } from './epic/daten';
import { MiniVerlauf, Zahl } from './epic/Diagramm';
import { SPIELMODI } from './epic/modi';

/*
 * Community-Uebersicht. Alles aus echten Quellen, nichts geschaetzt ohne es zu sagen:
 *   - Saison: Nummer und Spielversion von fortnite-api.com (/v2/cosmetics/new, "build"), Saisonbeginn = erster Cup der Saison in Deep Stats
 *     (/api/deep-stats), Ende: Epic nennt es nirgends oeffentlich - gezeigt wird, bis wann Epic Cups dieser Saison angesetzt hat (/api/cup-events).
 *   - Spielerzahlen: Epics Fortnite Data API (api.fortnite.com/ecosystem/v1) ueber den Proxy /epic-daten (epic/daten.ts).
 *   - Karte von heute: /api/fortnite-map (fortnite-api.com) mit /bilder/karte-orte.png.
 *   - Reload-Inseln: /api/karten-bild (Bilder aus den Spieldateien, lib/reloadKarten auf main) - "inseln" sind die Inseln, die schon in
 *     Turnier-Replays vorkamen.
 *   - News: fortnite-api.com/v2/news/br (Epics Nachrichten im Spiel).
 */

interface Fenster { status: string; begin: number; end: number; windowId: string; eventId: string; name?: string }
interface Kartenbild { id: string; titel: string; groesse: number }
interface Meldung { id: string; title: string; body: string; tileImage?: string; image?: string; hidden?: boolean }

const zwei = (n: number) => String(n).padStart(2, '0');

function useJetzt(ms = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

// Betreiber (26.11.2026): am 5. Dezember startet das neue Chapter. Uhrzeit ist Epics uebliche Wartung (~09:00 UTC), nicht bestaetigt.
const SAISON_ENDE_43 = Date.UTC(2026, 11, 5, 9, 0);

// Saisonnamen wie auf der Seite (lib/szeneStats.ts auf main): S43 ist die Mini-Season "Treasure Hunters" nach Chapter 7 Season 4.
const SAISON_NAME: Record<number, { name: string; unter: string }> = {
  39: { name: 'Chapter 7 Season 1', unter: 'Chapter 7' }, 40: { name: 'Chapter 7 Season 2', unter: 'Chapter 7' },
  41: { name: 'Chapter 7 Season 3', unter: 'Chapter 7' }, 42: { name: 'Chapter 7 Season 4', unter: 'Chapter 7' },
  43: { name: 'Treasure Hunters', unter: 'Chapter 7 · Mini season' },
};

function Countdown({ bis }: { bis: number }) {
  const jetzt = useJetzt();
  const rest = Math.max(0, bis - jetzt);
  const teile = [
    { n: Math.floor(rest / 864e5), w: 'days' }, { n: Math.floor(rest / 36e5) % 24, w: 'hrs' },
    { n: Math.floor(rest / 6e4) % 60, w: 'min' }, { n: Math.floor(rest / 1e3) % 60, w: 'sec' },
  ];
  return (
    <div className="grid max-w-md grid-cols-4 gap-2 sm:gap-3">
      {teile.map((t) => (
        <div key={t.w} className="min-w-0 rounded-2xl border border-teal-300/20 bg-teal-300/[0.06] px-3 py-3 text-center">
          <p className="text-3xl font-extrabold tabular-nums text-white sm:text-4xl">{t.w === 'days' ? t.n : zwei(t.n)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200/60">{t.w}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Saison */

function Saison() {
  const [build, setBuild] = useState<string | null>(null);
  const [fenster, setFenster] = useState<Fenster[] | null>(null);
  const [beginn, setBeginn] = useState<number | null>(null);
  const [karte, setKarte] = useState<{ stand?: string; anzahlOrte?: number } | null>(null);
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/cosmetics/new').then((r) => r.json()).then((j) => setBuild(j?.data?.build ?? null)).catch(() => {});
    fetch('/api/cup-events?region=EU').then((r) => r.json()).then((j) => setFenster(Array.isArray(j?.windows) ? j.windows : [])).catch(() => setFenster([]));
    fetch('/api/fortnite-map').then((r) => r.json()).then(setKarte).catch(() => {});
  }, []);
  // Version "++Fortnite+Release-43.11-CL-60803671" -> Saison 43, v43.11
  const version = build?.match(/Release-(\d+)\.(\d+)/);
  const saisonAusFenster = useMemo(() => {
    const s = (fenster ?? []).map((w) => Number(/^S(\d+)_/.exec(w.windowId)?.[1] ?? 0)).filter(Boolean);
    return s.length ? Math.max(...s) : null;
  }, [fenster]);
  const saison = version ? Number(version[1]) : saisonAusFenster;
  useEffect(() => {
    if (!saison) return;
    fetch('/api/deep-stats').then((r) => r.json()).then((j: { cups?: Array<{ tage: Array<{ windowId: string; beginn: string }> }> }) => {
      const t = (j.cups ?? []).flatMap((c) => c.tage).filter((x) => x.windowId.startsWith(`S${saison}_`)).map((x) => Date.parse(x.beginn)).filter(Number.isFinite);
      if (t.length) setBeginn(Math.min(...t));
    }).catch(() => {});
  }, [saison]);
  const dieser = (fenster ?? []).filter((w) => saison && w.windowId.startsWith(`S${saison}_`));
  const letzterCup = dieser.length ? Math.max(...dieser.map((w) => w.end)) : null;
  const offen = dieser.filter((w) => w.status !== 'vorbei').length;
  const naechste = fenster?.find((w) => saison && new RegExp(`^S${saison + 1}_`).test(w.windowId));
  const tag = beginn ? Math.floor((Date.now() - beginn) / 864e5) + 1 : null;
  return (
    <Glas className="relative overflow-hidden lg:col-span-2">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" />
      <div className="relative grid gap-6 p-7 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-300">Current season</p>
          <h2 className="mt-1 text-6xl font-black tracking-tight text-white">{saison ? (SAISON_NAME[saison]?.name ?? `Season ${saison}`) : '…'}</h2>
          {saison && <p className="mt-1 text-lg font-semibold text-teal-200/80">{SAISON_NAME[saison]?.unter ?? ''}{SAISON_NAME[saison] ? ' · ' : ''}Season {saison}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {version && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-semibold text-white/80">Game version v{version[1]}.{version[2]}</span>}
            {tag && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-semibold text-white/80">Day {tag} of the season</span>}
            {karte?.stand && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/60">Map updated {new Date(karte.stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
          </div>
          <div className="mt-7">
            {naechste ? (
              <>
                <p className="mb-2 text-sm font-semibold text-white/70">First Season {saison! + 1} cup starts in</p>
                <Countdown bis={naechste.begin} />
              </>
            ) : saison === 43 && Date.now() < SAISON_ENDE_43 ? (
              <>
                <p className="mb-2 text-sm font-semibold text-white/70">New chapter launches Sat 5 Dec</p>
                <Countdown bis={SAISON_ENDE_43} />
                <p className="mt-3 max-w-xl text-xs text-white/40">Counting down to the usual update downtime (about 09:00 UTC) – Epic confirms the exact minute on the day.</p>
              </>
            ) : letzterCup ? (
              <>
                <p className="mb-2 text-sm font-semibold text-white/70">Epic has scheduled Season {saison} cups until {new Date(letzterCup).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <Countdown bis={letzterCup} />
                <p className="mt-3 max-w-xl text-xs text-white/40">
                  Epic doesn't publish the season end in any open source yet, so this counts down to the last tournament currently on Epic's calendar
                  ({offen} still to come in EU). <Link to="/community/season" className="text-teal-200/80 hover:text-white">Season countdown →</Link>
                </p>
              </>
            ) : fenster ? <Link to="/community/season" className="text-sm font-semibold text-teal-200/80 hover:text-white">Season countdown →</Link> : <p className="text-sm text-white/40">Loading the schedule …</p>}
          </div>
        </div>
        <Link to="/community/map" className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-white/10 md:w-[420px]">
          <img src="/bilder/karte-orte.png" alt="Current map" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/90 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
            <div>
              <p className="font-bold text-white">Today's island</p>
              {karte?.anzahlOrte ? <p className="text-xs text-white/60">{karte.anzahlOrte} named locations</p> : null}
            </div>
            <span className="rounded-full bg-teal-300 px-3 py-1 text-xs font-bold text-[#06080f] transition group-hover:bg-teal-200">Open map →</span>
          </div>
        </Link>
      </div>
    </Glas>
  );
}

/* ------------------------------------------------------------------ Spielerzahlen */

/*
 * Spielerzahlen aus Epics Fortnite Data API (dieselben Daten wie die Player-Count-Seite). Epics eigene Modi stehen bisher nicht in der API -
 * sie werden leise weiter gefragt; antwortet keiner, zeigt die Karte die 5 meistgespielten oeffentlichen Inseln (letzte Stunde).
 */
function Spielerzahlen() {
  const { daten } = useModi('1D');
  const da = SPIELMODI.filter((m) => daten[m.k]);
  const r = useTopInseln('1H', true);
  const top = r.liste.slice(0, 5);
  const wartet = !top.length && (r.laedt || !r.fertig);
  return (
    <Glas className="p-6" verzoegerung={0.1}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-white">{da.length ? 'Players right now' : 'Most played islands right now'}</h3>
        <Link to="/community/players" className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/40 hover:text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />Player count →</Link>
      </div>
      <ul className="mt-4 space-y-2">
        {da.length ? da.map((m, i) => {
          const x = daten[m.k]!;
          return (
            <motion.li key={m.k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06 }}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
              <span className="h-2 w-2 rounded-full" style={{ background: m.farbe }} />
              <span className="w-28 text-sm font-medium text-white/80">{m.titel}</span>
              <span className="flex-1"><MiniVerlauf punkte={x.m.peakCCU} farbe={m.farbe} hoehe={22} /></span>
              <span className="w-20 text-right text-lg font-extrabold text-white"><Zahl wert={letzter(x.m.peakCCU)} format={kurz} /></span>
            </motion.li>
          );
        }) : top.map((x, i) => (
          <motion.li key={x.i.code} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
            <Link to={`/community/creative/${encodeURIComponent(x.i.code)}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 transition hover:border-white/15 hover:bg-white/[0.04]">
              <span className="w-4 text-right text-xs font-black tabular-nums text-white/35">{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/85">{x.i.titel}</span><span className="block truncate text-[10px] text-white/35">{x.i.creator || 'unknown'}</span></span>
              <span className="hidden w-24 sm:block"><MiniVerlauf punkte={x.w.serie.filter((p) => p.t >= Date.now() - 864e5)} farbe="#5eead4" hoehe={22} /></span>
              <span className="w-16 text-right text-lg font-extrabold text-white"><Zahl wert={x.v} format={kurz} /></span>
            </Link>
          </motion.li>
        ))}
      </ul>
      {!da.length && !top.length && <div className="py-3"><Laedt farbe={TEAL} text={wartet ? 'Asking Epic for player numbers …' : "Epic's data API isn't answering right now."} /></div>}
      {!da.length && top.length > 0 && <p className="mt-3 text-[11px] text-white/35">Peak players in the latest hour. Epic's own modes (Battle Royale, Zero Build, Reload …) aren't in Epic's public data yet.</p>}
    </Glas>
  );
}

/* ------------------------------------------------------------------ Reload */

function Reload() {
  const [karten, setKarten] = useState<Kartenbild[] | null>(null);
  const [inseln, setInseln] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/karten-bild').then((r) => r.json()).then((j) => { setKarten(j?.karten ?? []); setInseln(j?.inseln ?? {}); }).catch(() => setKarten([]));
  }, []);
  // Je Insel ein Eintrag: das Bild aus den Spieldateien (gross, scharf beim Verkleinern); Varianten ("eigenes Bild", "nah") fallen weg.
  const liste = useMemo(() => {
    const alle = (karten ?? []).filter((k) => k.id.startsWith('reload-') && !/-(png|nah)$/.test(k.id));
    const imTurnier = new Map(Object.entries(inseln).filter(([c]) => !c.startsWith('BR:')).map(([code, id]) => [id, code]));
    return alle.map((k) => ({ ...k, name: k.titel.replace(/^Reload - /, ''), code: imTurnier.get(k.id) ?? null }))
      .sort((a, b) => Number(!!b.code) - Number(!!a.code) || a.name.localeCompare(b.name));
  }, [karten, inseln]);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">Reload islands</h2>
        <p className="text-xs text-white/40">Maps read straight from the game files · <Link to="/community/rotation" className="font-semibold text-teal-200/80 hover:text-white">which one is live now →</Link></p>
      </div>
      {!karten ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-3xl bg-white/[0.04]" />)}</div> : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {liste.map((k, i) => (
            <motion.div key={k.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} whileHover={{ y: -5 }}
              className="group relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-[#0a1a2a]">
              <img src={`/api/karten-bild?id=${encodeURIComponent(k.id)}&datei=1`} alt={k.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="font-bold text-white">{k.name}</p>
                {k.code
                  ? <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-200">Played in tournaments</p>
                  : <p className="mt-1 text-[11px] text-white/45">In the game files</p>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ News */

function Neuigkeiten() {
  const [liste, setListe] = useState<Meldung[] | null>(null);
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/news/br').then((r) => r.json()).then((j) => setListe(((j?.data?.motds ?? []) as Meldung[]).filter((m) => !m.hidden))).catch(() => setListe([]));
  }, []);
  if (liste && !liste.length) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between"><h2 className="text-2xl font-extrabold tracking-tight text-white">In the game right now</h2><span className="text-xs text-white/40">Epic's in-game news</span></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(liste ?? []).slice(0, 4).map((m, i) => (
          <motion.article key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} whileHover={{ y: -4 }}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
            <div className="aspect-video w-full bg-gradient-to-br from-teal-400/15 to-sky-500/5">
              {(m.tileImage || m.image) && <img src={m.tileImage || m.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" />}
            </div>
            <div className="p-5">
              <h3 className="font-bold text-white">{m.title}</h3>
              <p className="mt-1.5 line-clamp-3 text-sm text-white/55">{m.body}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Seite */

const WERKZEUGE = [
  { pfad: '/community/map', titel: 'Interactive map', text: 'Pan, zoom, every named location – object layers for chests, ammo, slurp barrels and more.' },
  { pfad: '/community/weapons', titel: 'Loot pool', text: 'Every weapon of the season by class, with the real damage players dealt with it in tournaments.' },
];

export default function Uebersicht() {
  return (
    <div className="space-y-8">
      <Ueberschrift ueber="Community" titel="Fortnite, right now" farbe={TEAL} text="Season, island, loot and live numbers – straight from Epic and the game files." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Saison />
        <div className="flex flex-col gap-5">
          <Spielerzahlen />
          {WERKZEUGE.map((w, i) => (
            <Link key={w.pfad} to={w.pfad} className="block">
              <Glas className="group p-5 transition hover:border-teal-300/30 hover:bg-white/[0.05]" verzoegerung={0.2 + i * 0.08}>
                <div className="flex items-center justify-between"><h3 className="font-bold text-white">{w.titel}</h3><span className="text-teal-300 transition group-hover:translate-x-1">→</span></div>
                <p className="mt-1 text-sm text-white/50">{w.text}</p>
              </Glas>
            </Link>
          ))}
        </div>
      </div>
      <Reload />
      <Neuigkeiten />
    </div>
  );
}
