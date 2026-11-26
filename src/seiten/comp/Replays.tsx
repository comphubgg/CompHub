import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Glas, Titel } from '../../teile/Glas';
import { Chip, Laedt } from './stats/teile';
import ReplayPlayer, { type RMatch, type Rahmen } from './stats/ReplayPlayer';

/*
 * Replays im Hub - wie thecomphub.com/replays: alle Cups mit ausgewerteten Server-Replays, je Spieltag die Games, je Game die 2D-Wiedergabe.
 *   /api/replay?uebersicht=1   -> Cups mit Spieltagen (Sieger, Zahl der Games)
 *   /api/replay?tag=<Fenster>  -> die Games eines Spieltags (+ Geschwister-Tage)
 *   /api/replay?match=<id>&v=4 -> ein Game: Spieler, Orte, Feed, Zonen, Bus
 * Die Auswahl steht in der Adresse: /competitive/replays?tag=<Fenster>&game=<Nr>.
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

const zurueckKnopf = 'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-white/70 transition hover:border-sky-400/50 hover:text-white';

/* ------------------------------------------------------------------ 1. Alle Cups */

function Uebersicht({ oeffne }: { oeffne: (tag: string) => void }) {
  const [cups, setCups] = useState<CupKurz[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [region, setRegion] = useState('');
  useEffect(() => {
    fetch('/api/replay?uebersicht=1').then((r) => r.json()).then((j) => { if (Array.isArray(j?.cups)) setCups(j.cups); else setFehler(true); }).catch(() => setFehler(true));
  }, []);
  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (cups ?? []).map((c) => ({ ...c, tage: c.tage.filter((d) => !region || d.region === region) }))
      .filter((c) => c.tage.length && (!q || `${schoen(c.titel)} ${c.season} ${c.eventId}`.toLowerCase().includes(q)));
  }, [cups, suche, region]);
  const regionen = REGIONEN.filter((r) => (cups ?? []).some((c) => c.tage.some((d) => d.region === r)));
  const games = (cups ?? []).reduce((s, c) => s + c.tage.reduce((x, d) => x + d.games, 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Titel ueber="Server replays" titel="Replays" text="Every game of an analysed cup on the map: players from the bus on, storm circles, knocks and eliminations – to play back." />
        {cups && (
          <div className="flex gap-3">
            {[['Cups', cups.length], ['Games', games]].map(([k, v]) => (
              <Glas key={String(k)} className="px-5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p><p className="text-2xl font-extrabold tabular-nums text-white">{Number(v).toLocaleString('en')}</p></Glas>
            ))}
          </div>
        )}
      </div>
      <Glas className="flex flex-wrap items-center gap-2 p-4" verzoegerung={0.05}>
        <Chip an={!region} onClick={() => setRegion('')}>All regions</Chip>
        {regionen.map((r) => <Chip key={r} an={region === r} onClick={() => setRegion(r)}>{r}</Chip>)}
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a cup…"
          className="ml-auto w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-72" />
      </Glas>
      {fehler && <Glas className="p-5 text-sm text-rose-300">The replays could not be loaded right now. Please try again in a moment.</Glas>}
      {!cups && !fehler && <Laedt />}
      {cups && sichtbar.length === 0 && <Glas className="p-6 text-sm text-white/45">No replays in this selection.</Glas>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {sichtbar.slice(0, 60).map((c, i) => (
          <motion.section key={c.eventId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}
            className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400">{c.season} · {datum(c.beginn)}</p>
            <h3 className="mt-1 line-clamp-2 text-lg font-extrabold leading-tight text-white">{schoen(c.titel)}</h3>
            <ul className="mt-4 space-y-1.5">
              {c.tage.map((d, k) => (
                <li key={d.windowId}>
                  <button type="button" onClick={() => oeffne(d.windowId)}
                    className="group flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-[12px] transition hover:border-sky-400/50 hover:bg-white/[0.05]">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/80">{d.region}</span>
                    <span className="shrink-0 font-semibold text-white/85">{c.tage.filter((x) => x.region === d.region).length > 1 ? tagName(d.windowId, k) : datum(d.beginn)}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-amber-300/70">{d.sieger.map(ohneMarke).join(' · ')}</span>
                    <span className="shrink-0 tabular-nums text-white/45">{d.games} games</span>
                    <span className="text-sky-300 opacity-0 transition group-hover:opacity-100">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        ))}
      </div>
      {sichtbar.length > 60 && <p className="text-center text-xs text-white/35">Showing 60 of {sichtbar.length} cups – search to narrow down.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Ein Spieltag */

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
  return (
    <div className="space-y-6">
      <button type="button" onClick={zurueck} className={zurueckKnopf}>← All replays</button>
      {fehler && <Glas className="p-5 text-sm text-rose-300">{fehler}</Glas>}
      {!tag && !fehler && <Laedt />}
      {tag && (
        <>
          <Titel ueber={`${tag.region} · ${tag.season} · ${datum(tag.matches[0]?.beginn)}`} titel={schoen(tag.titel)} text={`${tag.matches.length} games – pick one to play it back.`} />
          {geschwister.length > 1 && (
            <div className="flex flex-wrap gap-2">{geschwister.map((g, i) => <Chip key={g.windowId} an={g.windowId === tag.windowId} onClick={() => oeffneTag(g.windowId)}>{tagName(g.windowId, i)}</Chip>)}</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tag.matches.map((m, i) => (
              <motion.button key={m.id} type="button" onClick={() => oeffneGame(m.nr)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -4 }}
                className="group rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left backdrop-blur-xl transition hover:border-sky-400/50">
                <p className="flex items-baseline justify-between"><span className="text-2xl font-black tracking-tight text-white">Game {m.nr}</span><span className="text-[11px] tabular-nums text-white/40">{uhrzeit(m.beginn)}</span></p>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Winner</p>
                <p className="mt-0.5 min-h-[2.4em] text-[13px] font-bold leading-snug text-amber-300">{(m.sieger ?? []).map(ohneMarke).join(' · ') || '–'}</p>
                <p className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                  <span>{m.spieler ?? '–'} players · {m.zonen ?? '–'} zones</span>
                  <span className="font-bold text-sky-300 transition group-hover:translate-x-1">Play →</span>
                </p>
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Ein Game */

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={zurueck} className={zurueckKnopf}>← {tag ? schoen(tag.titel) : 'Match day'}</button>
        {tag && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            {tag.matches.map((m) => <Chip key={m.id} an={m.nr === nr} onClick={() => oeffneGame(m.nr)}>Game {m.nr}</Chip>)}
          </div>
        )}
      </div>
      {(tagFehler || fehler) && <Glas className="p-5 text-sm text-rose-300">{tagFehler || fehler}</Glas>}
      {tag && game && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Titel ueber={`${tag.region} · ${tag.season} · ${datum(game.beginn)} ${uhrzeit(game.beginn)}`} titel={`${schoen(tag.titel)} · Game ${game.nr}`} />
          {(game.sieger ?? []).length > 0 && (
            <Glas className="px-5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Victory Royale</p><p className="text-base font-extrabold text-amber-300">{(game.sieger ?? []).map(ohneMarke).join(' · ')}</p></Glas>
          )}
        </div>
      )}
      {!fehler && !tagFehler && (!match || !karte) && <Laedt text="Loading the replay (a few MB)…" />}
      {match && karte && <ReplayPlayer key={game?.id} match={match} kartenBild={karte.bild} bildRahmen={karte.rahmen} ausschnitt={karte.ausschnitt} />}
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
