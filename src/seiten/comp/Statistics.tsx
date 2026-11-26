import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas, SEITE, Titel, flagge } from '../../teile/Glas';
import { Balken, Chip, Kopfzeile, Laedt, Rund, zahl } from './stats/teile';

/*
 * Statistics im Hub - dieselben Zahlen wie thecomphub.com/statistics (/api/szene-stats):
 *   ohne Angaben            -> Saisons und Regionen fuer die Filter
 *   ?saison&region&sort&q   -> die sortierbare Spielertabelle (Epics Turnierdaten + eigene Replay-Auswertung)
 *   ?ansicht=jahr&jahr&saison&region -> die Bestenlisten (Preisgeld, Team-Elims, Elims, Schaden, Treffer, Bauteile, Quote)
 *   ?ansicht=start&saison   -> die juengsten Spieltage mit ihrem besten Spieler
 */

interface Saison { kennung: string; name: string }
interface Spieler {
  epicId: string; name: string; anzeige?: string; land?: string | null; bild?: string | null; echtesFoto?: boolean; heimat?: string; regionen?: string[];
  events: number; matches: number; elims: number; damage: number; damageTaken?: number; hits: number; builds: number; headshots?: number; assists?: number; mats?: number;
  quote: number; genauigkeit: number; elimsProMatch: number; damageProMatch: number; verdienst?: number; teamElims?: number;
}
interface Liste { feld: string; titel: string; nachkomma: number; einheit: string | null; mindestMatches: number | null; plaetze: Spieler[] }
interface Kachel { turnier: { name: string; region: string; windowId: string; spieler: number; matches: number; datum: number }; spitze: Spieler; platz: number; stand?: { platz: number; punkte: number } }

const anzeige = (s: { anzeige?: string; name: string }) => s.anzeige || s.name;
/** Nur echte Fotos; die kleinen Bilder (/spielerbilder-klein) laufen nicht ueber den Proxy, also direkt von der Seite. */
const foto = (s: Spieler) => (s.echtesFoto !== false && s.bild ? (s.bild.startsWith('/spielerbilder-klein') ? SEITE + s.bild : s.bild) : null);
/** Saison -> Jahr fuer die Jahresansicht (Chapter 7 = 2026). */
const jahrVon = (saison: string) => { const n = Number(saison.replace(/\D/g, '')); return n >= 39 ? 2026 : n >= 32 ? 2025 : 2024; };

/* Die Spalten der Tabelle - die meisten sortiert der Server. */
const SPALTEN: Array<{ feld: keyof Spieler; titel: string; kurz: string; nachkomma?: number; sortierbar?: boolean }> = [
  { feld: 'events', kurz: 'Events', titel: 'Events' },
  { feld: 'matches', kurz: 'Games', titel: 'Most games', sortierbar: true },
  { feld: 'elims', kurz: 'Elims', titel: 'Most eliminations', sortierbar: true },
  { feld: 'elimsProMatch', kurz: 'Elims/G', titel: 'Elims per game', nachkomma: 2, sortierbar: true },
  { feld: 'damage', kurz: 'Damage', titel: 'Most damage', sortierbar: true },
  { feld: 'damageProMatch', kurz: 'Dmg/G', titel: 'Damage per game', sortierbar: true },
  { feld: 'quote', kurz: 'Dmg ratio', titel: 'Best damage ratio', nachkomma: 2, sortierbar: true },
  { feld: 'hits', kurz: 'Hits', titel: 'Most hits', sortierbar: true },
  { feld: 'builds', kurz: 'Builds', titel: 'Most builds', sortierbar: true },
];
const BRETT: Record<string, { titel: string; farbe: string }> = {
  verdienst: { titel: 'Prize money', farbe: '#facc15' },
  elims: { titel: 'Eliminations', farbe: '#38bdf8' },
  damage: { titel: 'Damage', farbe: '#f472b6' },
  teamElims: { titel: 'Team eliminations', farbe: '#2dd4bf' },
  hits: { titel: 'Hits', farbe: '#a78bfa' },
  builds: { titel: 'Builds', farbe: '#fb923c' },
  quote: { titel: 'Damage ratio', farbe: '#34d399' },
};

const feldWert = (s: Spieler, feld: string) => Number((s as unknown as Record<string, number>)[feld] ?? 0);
function wert(s: Spieler, feld: string, nachkomma = 0) {
  const v = feldWert(s, feld);
  return feld === 'verdienst' ? `$${zahl(v)}` : zahl(v, nachkomma);
}

/* ------------------------------------------------------------------ Podest der aktuellen Sortierung */

function Spitze({ s, platz, feld, nachkomma }: { s: Spieler; platz: number; feld: string; nachkomma: number }) {
  const farbe = platz === 1 ? '#facc15' : platz === 2 ? '#cbd5e1' : '#f59e0b';
  const f = foto(s);
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + platz * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -6 }}
      className={platz === 1 ? '' : 'md:mt-8'}>
      <Link to={`/competitive/player/${s.epicId}`} className={`group relative block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] ${platz === 1 ? 'h-[340px]' : 'h-[300px]'}`}>
        {f ? <img src={f} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_20%] transition duration-700 group-hover:scale-105" />
          : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-400/15 via-transparent to-violet-500/10"><span className="text-8xl font-black text-white/10">{anzeige(s).slice(0, 2).toUpperCase()}</span></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/45 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: farbe }} />
        <span className="absolute left-5 top-4 text-6xl font-black" style={{ color: farbe }}>{platz}</span>
        {s.land && <img src={flagge(s.land)} alt="" className="absolute right-5 top-5 h-9 w-9 rounded-full object-cover ring-2 ring-white/30" />}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="truncate text-xl font-bold text-white">{anzeige(s)}</p>
          <p className="truncate text-xs text-white/50">{s.name}{s.heimat ? ` · ${s.heimat}` : ''}</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">{SPALTEN.find((x) => x.feld === feld)?.kurz ?? feld}</p>
              <p className="text-3xl font-extrabold tabular-nums text-white">{wert(s, feld, nachkomma)}</p>
            </div>
            <p className="text-right text-xs leading-relaxed text-white/50">{zahl(s.matches)} games<br />{zahl(s.elims)} elims · {zahl(s.damage)} dmg</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Eine Bestenliste */

function Brett({ l, i, fotos, gross }: { l: Liste; i: number; fotos: Map<string, string | null>; gross?: boolean }) {
  const info = BRETT[l.feld] ?? { titel: l.titel, farbe: '#38bdf8' };
  const zeilen = l.plaetze.slice(0, gross ? 11 : 5);
  const max = zeilen[0] ? feldWert(zeilen[0], l.feld) : 1;
  return (
    <Glas className={`flex flex-col p-5 ${gross ? 'xl:row-span-2' : ''}`} verzoegerung={0.05 * i}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-white"><span className="h-2.5 w-2.5 rounded-full" style={{ background: info.farbe }} />{info.titel}</h3>
        {l.mindestMatches ? <span className="text-[10px] text-white/35">min. {l.mindestMatches} games</span> : null}
      </div>
      <ol className="mt-4 space-y-2.5">
        {zeilen.map((s, k) => {
          const f = fotos.get(`${l.feld}:${s.epicId}`) ?? null;
          return (
            <li key={s.epicId}>
              <Link to={`/competitive/player/${s.epicId}`} className="group flex items-center gap-2.5">
                <span className={`w-4 text-right text-xs font-black tabular-nums ${k === 0 ? 'text-amber-300' : 'text-white/35'}`}>{k + 1}</span>
                <Rund bild={f} name={anzeige(s)} gross={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {s.land && <img src={flagge(s.land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}
                      <span className="truncate text-sm font-medium text-white group-hover:text-sky-300">{anzeige(s)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-white">{wert(s, l.feld, l.nachkomma)}</span>
                  </span>
                  <span className="mt-1 block"><Balken wert={feldWert(s, l.feld)} max={max} farbe={info.farbe} hoehe="h-1" verzoegerung={0.2 + k * 0.05} /></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Glas>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function Statistics() {
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [regionen, setRegionen] = useState<string[]>([]);
  const [spieltage, setSpieltage] = useState<number | null>(null);
  const [saison, setSaison] = useState('');
  const [region, setRegion] = useState('');
  const [sort, setSort] = useState<keyof Spieler>('elims');
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<Spieler[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [mindest, setMindest] = useState<number | null>(null);
  const [fehler, setFehler] = useState(false);
  const [bretter, setBretter] = useState<Liste[] | null>(null);
  const [kacheln, setKacheln] = useState<Kachel[]>([]);
  const [zeigen, setZeigen] = useState(50);
  const nr = useRef(0);

  // Filter: Saisons und Regionen.
  useEffect(() => {
    fetch('/api/szene-stats').then((r) => r.json()).then((j) => {
      setSaisons(j.saisons ?? []); setRegionen(j.regionen ?? []); setSpieltage(j.spieltage ?? null);
      setSaison((alt) => alt || j.saisons?.[0]?.kennung || 'alle');
    }).catch(() => { setFehler(true); setSaison('alle'); });
  }, []);

  // Die Tabelle - der Server sortiert und sucht.
  useEffect(() => {
    if (!saison) return undefined;
    const meine = ++nr.current;
    const z = setTimeout(() => {
      const p = new URLSearchParams({ saison, sort: String(sort), limit: '300' });
      if (region) p.set('region', region);
      if (q.trim()) p.set('q', q.trim());
      setListe(null);
      fetch(`/api/szene-stats?${p}`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()).then((j) => {
        if (meine !== nr.current) return;
        if (!Array.isArray(j.spieler)) throw new Error('keine Liste');
        setListe(j.spieler); setGesamt(j.gesamt ?? 0); setMindest(typeof j.mindestMatches === 'number' ? j.mindestMatches : null); setFehler(false); setZeigen(50);
      }).catch(() => { if (meine === nr.current) { setListe([]); setFehler(true); } });
    }, q ? 300 : 0);
    return () => clearTimeout(z);
  }, [saison, region, sort, q]);

  // Bestenlisten aus der Jahresansicht (mit Saison und Region).
  useEffect(() => {
    if (!saison) return;
    setBretter(null);
    const p = new URLSearchParams({ ansicht: 'jahr', jahr: String(saison === 'alle' ? 2026 : jahrVon(saison)) });
    if (saison !== 'alle') p.set('saison', saison);
    if (region) p.set('region', region);
    fetch(`/api/szene-stats?${p}`).then((r) => r.json()).then((j) => setBretter(((j.listen ?? []) as Liste[]).filter((l) => l.plaetze?.length))).catch(() => setBretter([]));
  }, [saison, region]);

  // Die juengsten Spieltage der Saison - je Spieltag der Spieler mit den meisten Elims.
  useEffect(() => {
    if (!saison || saison === 'alle') { setKacheln([]); return; }
    fetch(`/api/szene-stats?ansicht=start&saison=${encodeURIComponent(saison)}`).then((r) => r.json())
      .then((j) => setKacheln(((j.kacheln ?? []) as Kachel[]).filter((k) => k.platz === 1))).catch(() => setKacheln([]));
  }, [saison]);

  const spalte = SPALTEN.find((s) => s.feld === sort) ?? SPALTEN[2];
  const regionenSichtbar = useMemo(() => ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'].filter((r) => regionen.includes(r)), [regionen]);
  const saisonName = saison === 'alle' ? 'All seasons' : saisons.find((s) => s.kennung === saison)?.name ?? saison;
  const spitze = useMemo(() => (!q && liste && liste.length >= 3 ? liste.slice(0, 3) : null), [q, liste]);
  /*
   * Jedes Foto nur einmal auf der Seite: Podest zuerst, dann die Bestenlisten, dann die Spieltage - wer schon zu sehen ist, steht danach mit
   * seinen Anfangsbuchstaben da. Vorab gerechnet (nicht beim Zeichnen), damit es auch bei doppeltem Rendern stimmt.
   */
  const fotos = useMemo(() => {
    const gesehen = new Set<string>((spitze ?? []).map(foto).filter(Boolean) as string[]);
    const m = new Map<string, string | null>();
    const nimm = (schluessel: string, s: Spieler) => { const f = foto(s); m.set(schluessel, f && !gesehen.has(f) ? f : null); if (f) gesehen.add(f); };
    (bretter ?? []).forEach((l, i) => l.plaetze.slice(0, i === 0 ? 11 : 5).forEach((s) => nimm(`${l.feld}:${s.epicId}`, s)));
    kacheln.slice(0, 10).forEach((k) => nimm(`tag:${k.turnier.windowId}:${k.spitze.epicId}`, k.spitze));
    return m;
  }, [spitze, bretter, kacheln]);
  const maxSort = liste?.[0] ? feldWert(liste[0], String(sort)) : 1;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Titel ueber="Player statistics" titel="Statistics" text="Every competitive player, every stat – from Epic's tournament data and CompHub's own replay analysis." />
        <div className="flex gap-3">
          {([['Match days', spieltage], ['Players', gesamt || null]] as Array<[string, number | null]>).map(([k, v]) => (
            <Glas key={k} className="px-5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p><p className="text-2xl font-extrabold tabular-nums text-white">{v === null ? '–' : zahl(v)}</p></Glas>
          ))}
        </div>
      </div>

      {/* Filter */}
      <Glas className="space-y-3 p-4" verzoegerung={0.05}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">Season</span>
          {saisons.map((s) => <Chip key={s.kennung} an={saison === s.kennung} onClick={() => setSaison(s.kennung)}>{s.name}</Chip>)}
          <Chip an={saison === 'alle'} onClick={() => setSaison('alle')}>All seasons</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">Region</span>
          <Chip an={!region} onClick={() => setRegion('')}>Global</Chip>
          {regionenSichtbar.map((r) => <Chip key={r} an={region === r} onClick={() => setRegion(r)}>{r}</Chip>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…"
            className="ml-auto w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-72" />
        </div>
      </Glas>

      {/* Podest der Sortierung */}
      {spitze && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">{spalte.titel} · {saisonName}{region ? ` · ${region}` : ''}</p>
          <div className="grid items-start gap-5 md:grid-cols-3">
            <div className="order-2 md:order-1"><Spitze s={spitze[1]} platz={2} feld={String(sort)} nachkomma={spalte.nachkomma ?? 0} /></div>
            <div className="order-1 md:order-2"><Spitze s={spitze[0]} platz={1} feld={String(sort)} nachkomma={spalte.nachkomma ?? 0} /></div>
            <div className="order-3"><Spitze s={spitze[2]} platz={3} feld={String(sort)} nachkomma={spalte.nachkomma ?? 0} /></div>
          </div>
        </div>
      )}

      {/* Bestenlisten */}
      <section className="space-y-4">
        <Kopfzeile nr="Leaderboards" titel={`${saisonName}${region ? ` · ${region}` : ' · all regions'}`} text={saison === 'alle' ? 'The year 2026 so far.' : undefined} />
        {!bretter ? <Laedt /> : bretter.length === 0 ? <Glas className="p-6 text-sm text-white/45">No leaderboards for this selection.</Glas> : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {bretter.map((l, i) => <Brett key={l.feld} l={l} i={i} fotos={fotos} gross={i === 0 && bretter.length === 7} />)}
          </div>
        )}
      </section>

      {/* Juengste Spieltage */}
      {kacheln.length > 0 && (
        <section className="space-y-4">
          <Kopfzeile nr="Latest match days" titel="Top fragger of every match day" />
          <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {kacheln.slice(0, 10).map((k, i) => {
              const f = fotos.get(`tag:${k.turnier.windowId}:${k.spitze.epicId}`) ?? null;
              return (
                <motion.div key={k.turnier.windowId + k.spitze.epicId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} whileHover={{ y: -4 }} className="w-[280px] shrink-0">
                  <Link to={`/competitive/player/${k.spitze.epicId}`} className="block h-full rounded-3xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl transition hover:border-sky-400/40">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">{k.turnier.region}</span>
                      <span>{new Date(k.turnier.datum).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      <span className="ml-auto">{k.turnier.matches} games</span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-white/85">{k.turnier.name.replace(/Runde/g, 'Round')}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <Rund bild={f} name={anzeige(k.spitze)} gross={44} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-bold text-white">{k.spitze.land && <img src={flagge(k.spitze.land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}{anzeige(k.spitze)}</p>
                        <p className="text-xs text-white/45">{k.spitze.elims} elims · {zahl(k.spitze.damage)} dmg{k.stand ? ` · team #${k.stand.platz}` : ''}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Die ganze Tabelle */}
      <Glas className="overflow-hidden" verzoegerung={0.15}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <h3 className="font-bold text-white">All players</h3>
          <span className="text-xs text-white/40">{zahl(gesamt)} players · sorted by {spalte.titel.toLowerCase()}{mindest ? ` · min. ${mindest} games` : ''}</span>
          <span className="ml-auto text-[11px] text-white/35">Click a column to sort</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                <th className="w-14 px-4 py-3 text-left">#</th>
                <th className="px-2 py-3 text-left">Player</th>
                <th className="px-2 py-3 text-left">Region</th>
                {SPALTEN.map((s) => (
                  <th key={String(s.feld)} className="px-3 py-3 text-right">
                    {s.sortierbar ? (
                      <button type="button" onClick={() => setSort(s.feld)} className={`uppercase tracking-[0.15em] transition ${sort === s.feld ? 'text-sky-400' : 'hover:text-white'}`}>{s.kurz}{sort === s.feld ? ' ▾' : ''}</button>
                    ) : s.kurz}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {(liste ?? []).slice(0, zeigen).map((s, i) => (
                  <motion.tr key={s.epicId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className="border-b border-white/[0.04] transition hover:bg-white/[0.04]">
                    <td className="px-4 py-2 text-sm font-bold tabular-nums text-white/45">{i + 1}</td>
                    <td className="px-2 py-2">
                      <Link to={`/competitive/player/${s.epicId}`} className="group flex items-center gap-2.5">
                        <Rund bild={i < 3 && spitze ? null : foto(s)} name={anzeige(s)} gross={30} />
                        {s.land && <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" />}
                        <span className="max-w-[220px] truncate font-medium text-white group-hover:text-sky-300">{anzeige(s)}</span>
                        {s.anzeige && s.anzeige !== s.name && <span className="hidden max-w-[160px] truncate text-xs text-white/30 xl:inline">{s.name}</span>}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold text-white/50">{s.heimat || s.regionen?.[0] || '–'}</td>
                    {SPALTEN.map((c) => (
                      <td key={String(c.feld)} className={`px-3 py-2 text-right tabular-nums ${sort === c.feld ? 'font-bold text-white' : 'text-white/65'}`}>
                        {sort === c.feld ? (
                          <span className="inline-flex w-full flex-col items-end gap-1">
                            {zahl(feldWert(s, String(c.feld)), c.nachkomma ?? 0)}
                            <span className="w-16"><Balken wert={feldWert(s, String(c.feld))} max={maxSort} hoehe="h-0.5" /></span>
                          </span>
                        ) : zahl(feldWert(s, String(c.feld)), c.nachkomma ?? 0)}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {!liste && <Laedt />}
        {liste && liste.length === 0 && <p className="p-8 text-center text-sm text-white/40">{fehler ? 'The stats could not be loaded right now – try again in a moment.' : 'No player found.'}</p>}
        {liste && liste.length > zeigen && (
          <div className="border-t border-white/5 p-3 text-center">
            <button type="button" onClick={() => setZeigen((z) => z + 50)} className="rounded-lg px-4 py-1.5 text-sm text-sky-300 hover:bg-white/5">Show more ({liste.length - zeigen})</button>
          </div>
        )}
      </Glas>
    </div>
  );
}
