import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Kennzahl, Laedt, Leer, Marke, Segment, SeitenKopf } from '../../ds/Bausteine';
import { Klein } from './stats/teile';
import ReplayPlayer, { type RMatch, type Rahmen } from './stats/ReplayPlayer';

/*
 * Replays im Hub - wie thecomphub.com/replays: alle Cups mit ausgewerteten Server-Replays, je Spieltag die Games, je Game die 2D-Wiedergabe.
 *   /api/replay?uebersicht=1   -> Cups mit Spieltagen (Sieger, Zahl der Games)
 *   /api/replay?tag=<Fenster>  -> die Games eines Spieltags (+ Geschwister-Tage)
 *   /api/replay?match=<id>&v=4 -> ein Game: Spieler, Orte, Feed, Zonen, Bus
 *   /api/cup-catalog?modus=alle -> nur fuer die Banner der Cups (ueber die Event-Kennung)
 * Die Auswahl steht in der Adresse: /competitive/replays?tag=<Fenster>&game=<Nr>.
 *
 * Aufbau (Design-System 3.0, neu komponiert):
 *   1. Uebersicht - ein Cup = EINE Karte mit Banner (frueher je Region eine Textkarte), die Regionen als Knoepfe darauf; oben der juengste Spieltag.
 *   2. Spieltag   - "Foyer": links der Aufmacher mit Banner und grossem Abspielknopf, rechts die Games als Spielliste.
 *   3. Game       - "Theater": die Karte fuellt den Bildschirm, Steuerung angedockt, Kopf/Kill-Feed/Teams in der Seitentafel (ReplayPlayer).
 */

interface TagKurz { windowId: string; region: string; beginn: string; games: number; sieger: string[] }
interface CupKurz { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: TagKurz[] }
interface Game { id: string; nr: number; beginn?: string; sieger?: string[]; spieler?: number; zonen?: number }
interface Tag { windowId: string; eventId: string; titel: string; region: string; season: string; matches: Game[] }

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ME', 'ASIA', 'OCE'];
const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const UHR = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const datum = (iso?: string) => { const d = Date.parse(`${iso ?? ''}Z`); return Number.isFinite(d) ? DATUM.format(new Date(d)) : ''; };
const uhrzeit = (iso?: string) => { const d = Date.parse(`${iso ?? ''}Z`); return Number.isFinite(d) ? UHR.format(new Date(d)) : ''; };
const ohneMarke = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '').trim() || '?';
function tagName(w: string, i: number) {
  for (const [re, n] of [[/Day\s*_?(\d+)/i, 'Day'], [/Week\s*_?(\d+)/i, 'Week'], [/Heat\s*_?(\d+)/i, 'Heat'], [/Round\s*_?(\d+)/i, 'Round']] as Array<[RegExp, string]>) {
    const m = re.exec(w); if (m) { const ev = /Event\s*_?(\d+)/i.exec(w); return `${ev ? `Event ${ev[1]} · ` : ''}${n} ${m[1]}`; }
  }
  return `#${i + 1}`;
}
const schoen = (t: string) => (!/^S\d+_/.test(t) ? t : t.replace(/^S\d+_/, '').replace(/_(NAW|NAC|BR|EU|ME|ASIA|OCE)$/, '').split('_')
  .map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')).join(' · '));

/* Karte je Saison (lib/zonenKarte, lib/bildAdressen auf der Seite): gemessene Rahmen fuer S42/S43, sonst die alte Annahme. */
const BR_RAHMEN: Record<number, Rahmen> = { 43: { x0: -142_800, y0: -146_000, spanne: 301_500 }, 42: { x0: -142_300, y0: -150_000, spanne: 300_500 } };
const BR_STANDARD: Rahmen = { x0: -135_000, y0: -135_000, spanne: 270_000 };
function karteFuer(windowId: string, m: RMatch): { bild: string | null; rahmen: Rahmen; ausschnitt: Rahmen | null } {
  if (/^Athena_Empty/i.test(m.karte ?? '')) {
    // Reload-Inseln: nur Nitemare Island (SourSpawn) ist geeicht (app/replays/inselKarten).
    if (/SourSpawn/i.test(m.playlist ?? '')) return { bild: '/api/karten-bild?id=reload-nitemare-island&datei=1', rahmen: { x0: -90_900, y0: -86_800, spanne: 174_000 }, ausschnitt: { x0: -62_000, y0: -68_500, spanne: 144_100 } };
    return { bild: null, rahmen: BR_STANDARD, ausschnitt: null };
  }
  const s = /(?:^|_)S(\d{2,3})_/i.exec(windowId);
  const n = s ? Number(s[1]) : 43;
  return { bild: `/bilder/karte-s${n}.png`, rahmen: BR_RAHMEN[n] ?? BR_STANDARD, ausschnitt: null };
}

/* Banner der Cups aus dem Katalog, einmal geladen und geteilt: Event-Kennung (epicgames_S43_..._EU) -> Bild. */
let BANNER: Map<string, string> | null = null;
let bannerLaedt: Promise<void> | null = null;
function useBanner(): Map<string, string> | null {
  const [, neu] = useState(0);
  useEffect(() => {
    if (BANNER) return;
    bannerLaedt ??= fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j: { cups?: Array<{ bild?: string; regionen?: Record<string, Array<{ eventId?: string }>> }> }) => {
      const m = new Map<string, string>();
      for (const c of j.cups ?? []) if (c.bild) for (const fs of Object.values(c.regionen ?? {})) for (const f of fs) if (f.eventId && !m.has(f.eventId)) m.set(f.eventId, c.bild);
      BANNER = m;
    }).catch(() => { BANNER = new Map(); });
    void bannerLaedt.then(() => neu((n) => n + 1));
  }, []);
  return BANNER;
}

const Abspielen = ({ gross = false }: { gross?: boolean }) => (
  <span className={`grid shrink-0 place-items-center rounded-full bg-akz text-[#04050a] shadow-[0_0_30px_rgb(var(--akz)/0.55)] transition group-hover:scale-110 ${gross ? 'h-20 w-20' : 'h-9 w-9'}`}>
    <svg viewBox="0 0 16 16" className={gross ? 'h-8 w-8' : 'h-3.5 w-3.5'}><path d="M4.5 2.5v11l9-5.5z" fill="currentColor" /></svg>
  </span>
);

/* ------------------------------------------------------------------ 1. Alle Cups */

interface CupGruppe { key: string; titel: string; season: string; beginn: string; bild: string | null; games: number; regionen: Array<{ region: string; tage: TagKurz[] }> }

function Uebersicht({ oeffne }: { oeffne: (tag: string) => void }) {
  const [cups, setCups] = useState<CupKurz[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [region, setRegion] = useState('');
  const banner = useBanner();
  useEffect(() => {
    fetch('/api/replay?uebersicht=1').then((r) => r.json()).then((j) => { if (Array.isArray(j?.cups)) setCups(j.cups); else setFehler(true); }).catch(() => setFehler(true));
  }, []);
  // Derselbe Cup kommt je Region einzeln vom Server - hier zu EINER Karte zusammengelegt (Kennung ohne die Region am Ende).
  const gruppen = useMemo(() => {
    const m = new Map<string, CupGruppe>();
    for (const c of cups ?? []) {
      const key = `${c.kurz.replace(/_(naw|nac|br|eu|me|asia|oce)$/i, '')}|${c.titel}`;
      let g = m.get(key);
      if (!g) { g = { key, titel: schoen(c.titel), season: c.season, beginn: c.beginn, bild: null, games: 0, regionen: [] }; m.set(key, g); }
      if (c.beginn > g.beginn) g.beginn = c.beginn;
      g.bild ??= banner?.get(c.eventId) ?? null;
      for (const d of c.tage) {
        g.games += d.games;
        let r = g.regionen.find((x) => x.region === d.region);
        if (!r) { r = { region: d.region, tage: [] }; g.regionen.push(r); }
        r.tage.push(d);
      }
    }
    for (const g of m.values()) {
      g.regionen.sort((x, y) => REGIONEN.indexOf(x.region) - REGIONEN.indexOf(y.region));
      for (const r of g.regionen) r.tage.sort((x, y) => (x.beginn < y.beginn ? 1 : -1));
    }
    return [...m.values()].sort((x, y) => (x.beginn < y.beginn ? 1 : -1));
  }, [cups, banner]);
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return gruppen.map((g) => ({ ...g, regionen: g.regionen.filter((r) => !region || r.region === region) }))
      .filter((g) => g.regionen.length && (!q || `${g.titel} ${g.season}`.toLowerCase().includes(q)));
  }, [gruppen, suche, region]);
  const regionen = REGIONEN.filter((r) => (cups ?? []).some((c) => c.tage.some((d) => d.region === r)));
  const games = (cups ?? []).reduce((s, c) => s + c.tage.reduce((x, d) => x + d.games, 0), 0);
  const tage = (cups ?? []).reduce((s, c) => s + c.tage.length, 0);
  // Der juengste Spieltag fuer den Aufmacher - Europa zuerst, wenn der Cup dort gespielt wurde.
  const neu = gruppen[0];
  const neuTag = neu ? (neu.regionen.find((r) => r.region === 'EU') ?? neu.regionen[0])?.tage[0] : undefined;

  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Server replays" titel="Replays" bild={neu?.bild}
        text="Every game of an analysed cup on the map: players from the bus on, storm circles, knocks and eliminations – to play back."
        rechts={cups && <div className="flex gap-8"><Kennzahl label="Cups" wert={gruppen.length} /><Kennzahl label="Match days" wert={tage} /><Kennzahl label="Games" wert={games} ton="akz" /></div>}>
        {neu && neuTag && (
          <button type="button" onClick={() => oeffne(neuTag.windowId)} className="group flex max-w-full items-center gap-4 rounded-2xl border border-white/10 bg-black/45 py-2.5 pl-2.5 pr-5 text-left backdrop-blur transition hover:border-akz/50">
            <Abspielen />
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-akz">Latest match day · {neuTag.region} · {datum(neuTag.beginn)}</span>
              <span className="block truncate text-[15px] font-bold text-white">{neu.titel}</span>
              <span className="block truncate text-xs text-white/50">{neuTag.games} games{neuTag.sieger.length ? <> · won by <span className="text-amber-300/90">{neuTag.sieger.map(ohneMarke).join(' · ')}</span></> : ''}</span>
            </span>
          </button>
        )}
      </SeitenKopf>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="ohne-leiste -mx-1 min-w-0 overflow-x-auto whitespace-nowrap px-1">
          <Segment id="rp-region" klein wert={region} onWahl={setRegion} wahl={[{ k: '', titel: 'All regions' }, ...regionen.map((r) => ({ k: r, titel: r }))]} />
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a cup…" className="eingabe w-full !py-2 lg:ml-auto lg:w-72" />
      </div>

      {fehler && <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">The replays could not be loaded right now. Please try again in a moment.</p>}
      {!cups && !fehler && <Laedt />}
      {cups && sichtbar.length === 0 && <Leer text="No replays in this selection." />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sichtbar.slice(0, 48).map((g, i) => {
          const erste = g.regionen[0]; const erster = erste.tage[0];
          return (
            <motion.article key={g.key} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: (i % 4) * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="fl-fest fl-klick group flex flex-col overflow-hidden">
              <button type="button" onClick={() => oeffne(erster.windowId)} className="relative block aspect-video w-full overflow-hidden text-left" aria-label={`Watch ${g.titel}`}>
                <Bild src={g.bild} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.06]" />
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
                <span className="absolute left-3 top-3 flex gap-1.5">{g.season && <Marke>{g.season}</Marke>}<Marke>{g.games.toLocaleString('en')} games</Marke></span>
                <span className="absolute bottom-3 right-3 opacity-0 transition group-hover:opacity-100"><Abspielen /></span>
              </button>
              <div className="flex flex-1 flex-col px-4 pb-4 pt-1">
                <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-white">{g.titel}</h3>
                <p className="mt-0.5 truncate text-xs text-white/50">{[datum(g.beginn), erster.sieger.length ? erste.region : ''].filter(Boolean).join(' · ')}{erster.sieger.length ? <> won by <span className="text-amber-300/85">{erster.sieger.map(ohneMarke).join(' · ')}</span></> : ''}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  {g.regionen.map((r) => (
                    <button key={r.region} type="button" onClick={() => oeffne(r.tage[0].windowId)} title={`${r.region}: ${r.tage.length} match day${r.tage.length > 1 ? 's' : ''}${r.tage[0].sieger.length ? ` · latest winner ${r.tage[0].sieger.map(ohneMarke).join(' · ')}` : ''}`}
                      className="chip !px-2.5 !py-1 hover:!border-akz/50">{r.region}{r.tage.length > 1 && <span className="zahl font-normal text-white/40">{r.tage.length} days</span>}</button>
                  ))}
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
      {sichtbar.length > 48 && <p className="text-center text-xs text-white/35">Showing 48 of {sichtbar.length} cups – search to narrow down.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Ein Spieltag: das Foyer */

function useTag(tagId: string) {
  const [tag, setTag] = useState<Tag | null>(null);
  const [geschwister, setGeschwister] = useState<Array<{ windowId: string; matches: number }>>([]);
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    let weg = false;
    setTag(null); setFehler('');
    fetch(`/api/replay?tag=${encodeURIComponent(tagId)}`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
      .then(({ ok, j }) => { if (weg) return; if (ok && j?.tag) { setTag(j.tag); setGeschwister(j.geschwister ?? []); } else setFehler(j?.error ?? 'The replays could not be loaded right now.'); })
      .catch(() => { if (!weg) setFehler('The replays could not be loaded right now.'); });
    return () => { weg = true; };
  }, [tagId]);
  return { tag, geschwister, fehler };
}

function Spieltag({ tagId, zurueck, oeffneTag, oeffneGame }: { tagId: string; zurueck: () => void; oeffneTag: (t: string) => void; oeffneGame: (n: number) => void }) {
  const { tag, geschwister, fehler } = useTag(tagId);
  const banner = useBanner();
  const erstes = tag?.matches[0];
  return (
    <div className="space-y-5">
      <button type="button" onClick={zurueck} className="knopf">← All replays</button>
      {fehler && <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{fehler}</p>}
      {!tag && !fehler && <Laedt />}
      {tag && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Aufmacher: Banner des Cups, Titel, grosser Abspielknopf fuer das erste Game */}
          <Flaeche fest className="relative isolate flex min-h-[340px] flex-col overflow-hidden xl:min-h-[440px]">
            <Bild src={banner?.get(tag.eventId)} className="absolute inset-0 -z-10 h-full w-full" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/70 to-fl/10" />
            <div className="flex flex-wrap gap-1.5 p-5"><Marke ton="akz">{tag.region}</Marke><Marke>{tag.season}</Marke><Marke>{datum(erstes?.beginn)}</Marke></div>
            {erstes && (
              <button type="button" onClick={() => oeffneGame(erstes.nr)} className="group mx-auto my-auto flex flex-col items-center gap-3" aria-label={`Watch game ${erstes.nr}`}>
                <Abspielen gross /><span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Watch from game {erstes.nr}</span>
              </button>
            )}
            <div className="p-5 lg:p-7">
              <p className="ueber">Match day</p>
              <h1 className="titel mt-1 text-5xl lg:text-6xl">{schoen(tag.titel)}</h1>
              <p className="mt-2 text-sm text-white/55">{tag.matches.length} games – pick one to play it back on the map.</p>
              {geschwister.length > 1 && (
                <div className="ohne-leiste -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1">
                  {geschwister.map((g, i) => <button key={g.windowId} type="button" onClick={() => oeffneTag(g.windowId)} className={`chip ${g.windowId === tag.windowId ? 'chip-an' : ''}`}>{tagName(g.windowId, i)}<span className="zahl font-normal text-white/40">{g.matches} games</span></button>)}
                </div>
              )}
            </div>
          </Flaeche>

          {/* Spielliste */}
          <Flaeche fest className="overflow-hidden" verz={0.06}>
            <div className="flex items-end justify-between px-5 pb-3 pt-5"><div><p className="ueber">Playlist</p><h2 className="titel mt-1 text-3xl">{tag.matches.length} games</h2></div><span className="text-[11px] text-white/35">local time</span></div>
            <ol>
              {tag.matches.map((m, i) => (
                <motion.li key={m.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.03 }}>
                  <button type="button" onClick={() => oeffneGame(m.nr)} className="group flex w-full items-center gap-4 border-t border-white/[0.06] px-5 py-3 text-left transition hover:bg-white/[0.04]">
                    <span className="zahl w-10 shrink-0 text-center font-titel text-4xl leading-none text-white/25 transition group-hover:text-akz">{m.nr}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2"><span className="whitespace-nowrap text-[15px] font-bold text-white">Game {m.nr}</span><span className="zahl text-[11px] text-white/40">{uhrzeit(m.beginn)} · {m.spieler ?? '–'} players · {m.zonen ?? '–'} zones</span></span>
                      <span className="mt-0.5 block truncate text-[13px] text-white/50">{(m.sieger ?? []).length ? <>Victory Royale <span className="font-semibold text-amber-300">{(m.sieger ?? []).map(ohneMarke).join(' · ')}</span></> : 'Winner not recorded'}</span>
                    </span>
                    <Abspielen />
                  </button>
                </motion.li>
              ))}
            </ol>
          </Flaeche>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Ein Game: das Theater */

function GameAnsicht({ tagId, nr, zurueck, oeffneGame }: { tagId: string; nr: number; zurueck: () => void; oeffneGame: (n: number) => void }) {
  const { tag, fehler: tagFehler } = useTag(tagId);
  const [match, setMatch] = useState<RMatch | null>(null);
  const [fehler, setFehler] = useState('');
  const game = tag?.matches.find((m) => m.nr === nr) ?? null;
  useEffect(() => {
    if (!tag) return undefined;
    if (!game) { setFehler('This game does not exist.'); return undefined; }
    let weg = false;
    setMatch(null); setFehler('');
    (async () => {
      // Ein Fehler der Ablage ist meist ein Augenblick: bis zu viermal fragen.
      for (let v = 0; v < 4; v += 1) {
        if (v) await new Promise((ok) => setTimeout(ok, 1500 * v));
        if (weg) return;
        const r = await fetch(`/api/replay?match=${encodeURIComponent(game.id)}&v=4`).catch(() => null);
        const j = r ? await r.json().catch(() => null) : null;
        if (weg) return;
        if (r?.ok && j) { setMatch(j); return; }
        if (r?.status === 404) { setFehler(j?.error ?? 'This game has not been analysed.'); return; }
        if (r?.status === 401 || r?.status === 403) { setFehler('Sign in to see this replay.'); return; }
      }
      if (!weg) setFehler('The analysis is not readable right now.');
    })();
    return () => { weg = true; };
  }, [tag, game]);
  const karte = useMemo(() => (match ? karteFuer(tagId, match) : null), [match, tagId]);
  const meldung = tagFehler || fehler;

  // Kopf der Seitentafel: zurueck, Game, Sieger, die anderen Games des Spieltags.
  const kopf: ReactNode = (
    <div className="fl-fest shrink-0 p-4">
      <button type="button" onClick={zurueck} className="knopf-leer max-w-full !text-xs"><span aria-hidden>←</span><span className="truncate">{tag ? schoen(tag.titel) : 'Match day'}</span></button>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <h1 className="titel text-5xl">Game {nr}</h1>
        {tag && game && <p className="zahl pb-1 text-right text-[11px] leading-tight text-white/45">{tag.region} · {tag.season}<br />{datum(game.beginn)} {uhrzeit(game.beginn)}</p>}
      </div>
      {(game?.sieger ?? []).length > 0 && <div className="mt-2"><Klein>Victory Royale</Klein><p className="truncate text-sm font-extrabold text-amber-300">{(game?.sieger ?? []).map(ohneMarke).join(' · ')}</p></div>}
      {tag && tag.matches.length > 1 && (
        <div className="ohne-leiste -mx-1 mt-3 flex gap-1 overflow-x-auto px-1">
          {tag.matches.map((m) => <button key={m.id} type="button" onClick={() => oeffneGame(m.nr)} aria-label={`Game ${m.nr}`} className={`zahl grid h-8 min-w-8 shrink-0 place-items-center rounded-lg border px-2 text-xs font-bold transition ${m.nr === nr ? 'border-akz bg-akz text-[#04050a]' : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-akz/50 hover:text-white'}`}>{m.nr}</button>)}
        </div>
      )}
    </div>
  );

  return (
    <div className="-mb-5">
      {match && karte ? <ReplayPlayer key={game?.id} match={match} kartenBild={karte.bild} bildRahmen={karte.rahmen} ausschnitt={karte.ausschnitt} kopf={kopf} /> : (
        <div className="flex flex-col gap-3 xl:h-[calc(100vh-8.5rem)] xl:min-h-[540px] xl:flex-row">
          <div className="fl-fest grid min-h-[50vh] flex-1 place-items-center p-6">
            {meldung ? <p className="max-w-md text-center text-sm text-rose-300">{meldung}</p> : <Laedt text="Loading the replay (a few MB)" />}
          </div>
          <aside className="w-full shrink-0 xl:w-[380px]">{kopf}</aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function Replays() {
  const [p, setP] = useSearchParams();
  const tag = p.get('tag');
  const game = Number(p.get('game'));
  const oben = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  if (tag && Number.isInteger(game) && game > 0) {
    return <GameAnsicht key={tag} tagId={tag} nr={game} zurueck={() => setP({ tag })} oeffneGame={(n) => setP({ tag, game: String(n) })} />;
  }
  if (tag) return <Spieltag key={tag} tagId={tag} zurueck={() => setP({})} oeffneTag={(t) => setP({ tag: t })} oeffneGame={(n) => { setP({ tag, game: String(n) }); oben(); }} />;
  return <Uebersicht oeffne={(t) => { setP({ tag: t }); oben(); }} />;
}
