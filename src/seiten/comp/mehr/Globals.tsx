import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { istVip } from '../../streamer/zugang';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from './KartenAnsicht';
import { FehlerZeile, Laedt, Leer, SEITE, Suche, TeamFlagge, chip, datumKurz, flaggenPfad, landName, useDaten } from './teile';

/*
 * Globals 2026 im Hub (wie /globals der Seite): FNCS Global Championship, Antwerpen 26.-27.09.2026. Nur fuer VIPs (wie auf der Seite).
 * Overview mit Endstand (/api/globals-endstand) und Spieltagen (Katalog), Teams (/api/globals-teams, Duo-Ansicht mit gemeinsamen Cups ueber
 * /api/globals-duo), Map (Globals-Karte aus /api/turnier-karten), Predictions (eigene Prognose /api/meine-prognose bzw. /api/prognosen),
 * Prize pool (/api/globals-preisgeld). Die Stream-Overlays bleiben im Streamer-Bereich bzw. auf der Seite.
 */

const EVENT = 'epicgames_MannekenPis_Official';
const TAGE_FEST = [
  { windowId: 'MannekenPis_Day1', titel: 'Day 1', begin: 1790373600000 },
  { windowId: 'MannekenPis_Day2', titel: 'Day 2', begin: 1790460000000 },
];
const BILD = '/cups/fncs-global-championship-2026-hd.jpg';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

interface GSpieler { turnierId: string; epicId: string | null; name: string; anzeige: string; land: string | null; x: string | null; bild: string | null }
interface GTeam { rang: number; punkte: number; spiele: number; elims: number; region?: string | null; spieler: GSpieler[] }
interface EndTeam { rang: number; punkte: number; elims: number; siege: number; spiele?: number; spieler: Array<{ id: string; anzeige: string; land: string | null; bild: string | null }> }

function useTage() {
  const [tage, setTage] = useState(TAGE_FEST);
  useEffect(() => {
    let weg = false;
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => {
      if (weg) return;
      const g: typeof TAGE_FEST = [];
      for (const c of j.cups ?? []) for (const l of Object.values(c.regionen ?? {})) for (const w of l as Array<{ eventId: string; windowId: string; begin: number }>) {
        if (w.eventId === EVENT && !g.some((x) => x.windowId === w.windowId)) g.push({ windowId: w.windowId, titel: w.windowId.replace(/^MannekenPis_Day/i, 'Day '), begin: w.begin });
      }
      if (g.length) setTage(g.sort((a, b) => a.begin - b.begin));
    }).catch(() => { /* die bekannten Tage */ });
    return () => { weg = true; };
  }, []);
  return tage;
}

const ordnung = (n: number) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/* ---------------------------------------------------------------- Overview */

function Uebersicht() {
  const [s] = useDaten<{ ok: boolean; teams: EndTeam[] }>('/api/globals-endstand');
  const tage = useTage();
  const teams = s.art === 'ok' && s.d.ok ? s.d.teams : [];
  const [sieger, ...rest] = teams;
  return (
    <div className="space-y-6">
      {s.art === 'laedt' && <Laedt />}
      {s.art === 'fehler' && <FehlerZeile text="The final standings could not be loaded right now." />}
      {sieger && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Glas className="relative overflow-hidden p-6">
            <span aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Champions</p>
            {sieger.spieler.every((p) => p.bild) ? (
              <div className="relative mt-4 grid grid-cols-2 gap-3">
                {sieger.spieler.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1 }}
                    className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-amber-300/30 bg-[#0a0e18]">
                    <img src={p.bild!} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" />
                    <img src={p.bild!} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
                    <p className="absolute inset-x-3 bottom-3 flex items-center gap-2 text-xl font-black uppercase tracking-tight text-white">
                      <TeamFlagge groesse={22} laender={[p.land]} /><span className="truncate">{p.anzeige}</span>
                    </p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="relative mt-5 space-y-3">
                {sieger.spieler.map((p, i) => (
                  <motion.p key={p.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.1 }}
                    className="flex items-center gap-4 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
                    <TeamFlagge groesse={44} laender={[p.land]} /><span className="truncate">{p.anzeige}</span>
                  </motion.p>
                ))}
              </div>
            )}
            <div className="relative mt-5 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4">
              {([['Points', sieger.punkte], ['Eliminations', sieger.elims], ['Wins', sieger.siege]] as Array<[string, number]>).map(([l, v], i) => (
                <div key={l} className={i ? 'px-4' : 'pr-4'}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{l}</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-white">{v}</p>
                </div>
              ))}
            </div>
          </Glas>
          <Glas className="overflow-hidden" verzoegerung={0.1}>
            <p className="border-b border-white/5 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Final standings after both days</p>
            <ol className="max-h-[620px] overflow-y-auto">
              {rest.map((x, i) => (
                <motion.li key={x.rang} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
                  className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5 last:border-b-0 hover:bg-white/[0.03]">
                  <span className={`w-6 text-center text-xs font-black tabular-nums ${x.rang <= 3 ? 'text-amber-300' : 'text-white/40'}`}>{x.rang}</span>
                  <TeamFlagge groesse={26} laender={x.spieler.map((p) => p.land)} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{x.spieler.map((p) => p.anzeige).join(' · ')}</span>
                  <span className="hidden text-[11px] tabular-nums text-white/40 sm:inline">{x.elims} elims</span>
                  <span className="w-12 text-right text-sm font-black tabular-nums text-sky-400">{x.punkte}</span>
                </motion.li>
              ))}
            </ol>
          </Glas>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {UNTER.slice(1).map((u, i) => (
          <motion.div key={u.pfad} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }} whileHover={{ y: -4 }}>
            <NavLink to={`/competitive/globals/${u.pfad}`} className="block h-full rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-sky-400/40">
              <p className="font-bold text-white">{u.titel}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{u.text}</p>
            </NavLink>
          </motion.div>
        ))}
      </div>
      <Glas className="p-5">
        <h2 className="font-bold text-white">Match days</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {tage.map((t) => <span key={t.windowId} className="rounded-xl border border-sky-400/25 bg-sky-400/[0.06] px-3 py-1.5 text-xs font-semibold text-sky-200">{t.titel} · {new Date(t.begin).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' })}</span>)}
        </div>
        <p className="mt-3 text-[11px] text-white/35">The match days come from Epic's tournament catalogue — if Epic adds a third day, it shows up here by itself.</p>
        <p className="mt-2 text-[11px] text-white/35">Stream overlays for the Globals (leaderboard, player banner, custom) live in the Streamer area and on <a className="text-sky-300 hover:underline" href={`${SEITE}/globals/overlays`} target="_blank" rel="noreferrer">thecomphub.com</a>.</p>
      </Glas>
    </div>
  );
}

/* ---------------------------------------------------------------- Teams */

interface DuoZeile { windowId: string; titel: string; season: string; datum: number; platz: number | null; punkte: number | null; elims: number | null; verdienst: number | null }

function DuoAnsicht({ team, zu }: { team: GTeam; zu: () => void }) {
  const [a, b] = team.spieler;
  const [z, setZ] = useState<DuoZeile[] | null | 'fehler'>(null);
  useEffect(() => {
    if (!a?.epicId || !b?.epicId) { setZ([]); return undefined; }
    let weg = false;
    fetch(`/api/globals-duo?a=${encodeURIComponent(a.epicId)}&b=${encodeURIComponent(b.epicId)}`).then(async (r) => {
      const d = await r.json(); if (weg) return;
      if (!r.ok || d.error) setZ('fehler'); else setZ(d.zeilen ?? []);
    }).catch(() => { if (!weg) setZ('fehler'); });
    return () => { weg = true; };
  }, [a, b]);
  useEffect(() => { const t = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); }; window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t); }, [zu]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={zu}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]/95 shadow-2xl backdrop-blur-xl">
        <div className="relative grid grid-cols-2">
          {team.spieler.slice(0, 2).map((s) => (
            <div key={s.turnierId} className="relative aspect-[4/5] overflow-hidden bg-[#06080f]">
              {s.bild ? <img src={s.bild} alt="" className="h-full w-full object-cover object-top" /> : <div className="grid h-full place-items-center text-7xl font-black text-white/10">{s.anzeige.slice(0, 1).toUpperCase()}</div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="flex items-center gap-2 text-xl font-black text-white"><img src={flaggenPfad(s.land)} alt="" className="h-5 w-5 rounded-full object-cover" /><span className="truncate">{s.anzeige}</span></p>
                {s.x && <a href={`https://x.com/${s.x}`} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-sky-300">@{s.x}</a>}
              </div>
            </div>
          ))}
          {team.spiele > 0 && <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-sm font-bold text-sky-300">#{team.rang}</span>}
          <button type="button" onClick={zu} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-lg text-white hover:bg-black">×</button>
        </div>
        <div className="p-5">
          <h3 className="mb-3 text-sm font-bold text-sky-200">Played together — this season</h3>
          {z === null ? <Laedt /> : z === 'fehler' ? <p className="py-6 text-center text-xs text-white/40">The cups could not be loaded right now.</p>
            : !z.length ? <p className="py-6 text-center text-xs text-white/40">{!a?.epicId || !b?.epicId ? 'The tool does not know both accounts of this duo — so no cups.' : 'These two have no recorded cup together this season.'}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead className="text-[10px] uppercase tracking-[0.18em] text-white/40"><tr><th className="py-1.5 pr-2">Cup</th><th className="py-1.5 pr-2">Date</th><th className="py-1.5 pr-2 text-right">Place</th><th className="py-1.5 pr-2 text-right">Points</th><th className="py-1.5 pr-2 text-right">Elims</th><th className="py-1.5 text-right">Earnings</th></tr></thead>
                  <tbody>{z.map((r) => (
                    <tr key={r.windowId} className="border-t border-white/5">
                      <td className="max-w-[260px] truncate py-2 pr-2 text-white/85">{r.titel}</td>
                      <td className="py-2 pr-2 text-white/40">{r.datum ? datumKurz(r.datum) : ''}</td>
                      <td className={`py-2 pr-2 text-right font-semibold ${r.platz && r.platz <= 3 ? 'text-amber-300' : 'text-white'}`}>{r.platz ? `#${r.platz}` : '–'}</td>
                      <td className="py-2 pr-2 text-right text-white/70">{r.punkte ?? '–'}</td>
                      <td className="py-2 pr-2 text-right text-white/70">{r.elims ?? '–'}</td>
                      <td className="py-2 text-right text-emerald-300">{r.verdienst ? `$${r.verdienst.toLocaleString('en-US')}` : '–'}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <p className="mt-2 text-[11px] text-white/30">Elims per player from our replays; a dash where they are missing.</p>
              </div>
            )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Teams() {
  const tage = useTage();
  const [s] = useDaten<{ teams: GTeam[]; zugeordnet?: number; spieler?: number; mitFoto?: number; error?: string }>(`/api/globals-teams?fenster=${encodeURIComponent(tage[0].windowId)}`);
  const [q, setQ] = useState('');
  const [ansicht, setAnsicht] = useState<'spieler' | 'laender' | 'regionen'>('spieler');
  const [offen, setOffen] = useState<GTeam | null>(null);
  const teams = s.art === 'ok' ? s.d.teams ?? [] : [];
  const gezeigt = useMemo(() => {
    const x = q.trim().toLowerCase();
    return x ? teams.filter((t) => t.spieler.some((p) => p.anzeige.toLowerCase().includes(x) || p.name.toLowerCase().includes(x))) : teams;
  }, [teams, q]);
  const laender = useMemo(() => {
    const je = new Map<string, GSpieler[]>();
    for (const t of gezeigt) for (const p of t.spieler) if (p.land) (je.get(p.land) ?? je.set(p.land, []).get(p.land)!).push(p);
    return [...je.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [gezeigt]);
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok') return <FehlerZeile text="The field could not be loaded right now." />;
  if (!teams.length) return <Leer text="Epic has no participant list for this day yet. As soon as it exists, the teams are here — nothing is invented." />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {(['spieler', 'laender', 'regionen'] as const).map((k) => <button key={k} type="button" onClick={() => setAnsicht(k)} className={chip(ansicht === k)}>{k === 'spieler' ? 'Players' : k === 'laender' ? 'Nationalities' : 'Regions'}</button>)}
        <span className="text-xs tabular-nums text-white/40">{teams.length} teams · {s.d.spieler ?? teams.length * 2} players</span>
        <Suche wert={q} setze={setQ} platz="Search a player …" className="ml-auto" />
      </div>
      {ansicht === 'spieler' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {gezeigt.map((t, i) => (
            <motion.button key={t.rang} type="button" onClick={() => setOffen(t)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 16) * 0.03 }} whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] text-left backdrop-blur-xl transition hover:border-sky-400/40">
              {t.spieler.every((p) => p.bild) ? (
                <div className="grid grid-cols-2">
                  {t.spieler.slice(0, 2).map((p) => (
                    <div key={p.turnierId} className="relative aspect-[4/5] overflow-hidden bg-[#0a0e18]">
                      <img src={p.bild!} alt="" loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                      <p className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2.5 text-sm font-bold text-white"><img src={flaggenPfad(p.land)} alt="" className="h-4 w-4 rounded-full object-cover" /><span className="truncate">{p.anzeige}</span></p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative grid aspect-[8/5] grid-cols-2 bg-gradient-to-br from-sky-950/60 via-[#0a0e18] to-[#06080f]">
                  {t.spieler.slice(0, 2).map((p) => (
                    <div key={p.turnierId} className="flex flex-col items-center justify-center gap-3 p-3">
                      <img src={flaggenPfad(p.land)} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/15" />
                      <span className="max-w-full truncate text-base font-black uppercase tracking-wide text-white">{p.anzeige}</span>
                    </div>
                  ))}
                </div>
              )}
              {t.spiele > 0 && <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-xs font-bold tabular-nums text-sky-300">#{t.rang}</span>}
              {t.spiele > 0 && <span className="absolute right-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-xs tabular-nums text-white">{t.punkte} pts</span>}
              {t.region && <span className="absolute bottom-12 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/80">{t.region}</span>}
            </motion.button>
          ))}
        </div>
      )}
      {ansicht === 'laender' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {laender.map(([land, sp], i) => (
            <Glas key={land} className="p-4" verzoegerung={Math.min(i, 12) * 0.03}>
              <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2"><img src={flaggenPfad(land)} alt="" className="h-5 w-5 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{landName(land)}</span><span className="text-xs tabular-nums text-white/40">{sp.length}</span></div>
              <ul className="space-y-1 text-center">{sp.map((p) => <li key={p.turnierId} className="truncate text-sm font-semibold uppercase tracking-wide text-white/80">{p.anzeige}</li>)}</ul>
            </Glas>
          ))}
        </div>
      )}
      {ansicht === 'regionen' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {REGIONEN.map((r) => ({ r, l: gezeigt.filter((t) => t.region === r) })).filter((g) => g.l.length).map((g, i) => (
            <Glas key={g.r} className="p-4" verzoegerung={i * 0.04}>
              <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2"><span className="rounded-md bg-sky-400/15 px-2 py-0.5 text-xs font-black text-sky-200">{g.r}</span><span className="ml-auto text-xs tabular-nums text-white/40">{g.l.length}</span></div>
              <ul>{g.l.map((t) => (
                <li key={t.rang}><button type="button" onClick={() => setOffen(t)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/85 hover:bg-white/5">
                  <TeamFlagge groesse={20} laender={t.spieler.map((p) => p.land)} /><span className="min-w-0 flex-1 truncate font-semibold">{t.spieler.map((p) => p.anzeige).join(' + ')}</span>
                </button></li>
              ))}</ul>
            </Glas>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-white/30">Flag and name for {s.d.zugeordnet ?? 0} of {s.d.spieler ?? 0} accounts, photos for {s.d.mitFoto ?? 0} — Epic creates separate accounts for the LAN; they are matched by name.</p>
      <AnimatePresence>{offen && <DuoAnsicht team={offen} zu={() => setOffen(null)} />}</AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- Map */

interface KTeam { id: string; spieler?: string[]; ids?: string[]; farbe?: string }
interface KSpot { id: string; punkte: Punkt[]; teams: string[]; farbe?: string | null; name?: string }
interface Karte { id: string; titel: string; bildTitel?: string; bildId?: string; eventId?: string; spots?: KSpot[]; teams?: KTeam[]; spiele?: string }

/** Spots und Teams einer gespeicherten Karte in Formen fuer die Kartenansicht (eigene Namen aus dem Feld, wo bekannt). */
export function formenAusKarte(k: { spots?: KSpot[]; teams?: KTeam[] }, name: (t: KTeam) => string[] = (t) => t.spieler ?? []): KartenForm[] {
  const nach = new Map((k.teams ?? []).map((t) => [t.id, t]));
  return (k.spots ?? []).map((sp) => {
    const ts = sp.teams.map((x) => nach.get(x)).filter((t): t is KTeam => Boolean(t));
    const zeilen = ts.length > 1 ? ts.map((t) => name(t).join(' ')) : ts.flatMap((t) => name(t));
    return { punkte: sp.punkte, zeilen, teams: ts.length, farbe: sp.farbe, alle: ts.flatMap((t) => name(t)) };
  });
}

function Karten() {
  const { wer } = useWer();
  const tage = useTage();
  const [s] = useDaten<{ karten: Karte[]; ersatz?: boolean }>('/api/turnier-karten');
  const [f] = useDaten<{ teams: GTeam[] }>(`/api/globals-teams?fenster=${encodeURIComponent(tage[0].windowId)}`);
  const [offen, setOffen] = useState(0);
  const karten = s.art === 'ok' ? (s.d.karten ?? []).filter((k) => k.eventId === EVENT) : [];
  const feld = useMemo(() => {
    const sp = new Map<string, GSpieler>(); const rg = new Map<string, string>();
    for (const t of f.art === 'ok' ? f.d.teams ?? [] : []) for (const p of t.spieler) for (const id of [p.turnierId, p.epicId]) if (id) { sp.set(id, p); if (t.region) rg.set(id, t.region); }
    return { sp, rg };
  }, [f]);
  const k = karten[offen] ?? karten[0] ?? null;
  const name = (t: KTeam) => (t.spieler ?? []).map((n, i) => feld.sp.get(t.ids?.[i] ?? '')?.anzeige || n);
  const formen = k ? formenAusKarte(k, name) : [];
  const gruppen = useMemo(() => {
    if (!k) return [];
    const platziert = new Set((k.spots ?? []).flatMap((sp) => sp.teams));
    const zeilen = (k.teams ?? []).map((t) => ({ t, namen: name(t), laender: (t.ids ?? []).map((id) => feld.sp.get(id)?.land ?? null), region: (t.ids ?? []).map((id) => feld.rg.get(id)).find(Boolean) ?? '', drauf: platziert.has(t.id) }));
    return [...REGIONEN, ''].map((r) => ({ r, z: zeilen.filter((x) => (REGIONEN.includes(x.region) ? x.region : '') === r) })).filter((g) => g.z.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, feld]);
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok') return <FehlerZeile text="The map could not be loaded." />;
  if (!k) return <Leer text={wer?.isAdmin ? 'No Globals map yet — it is drawn in the map tool on thecomphub.com.' : 'As soon as the map is ready, it shows up here.'} />;
  return (
    <div className="space-y-4">
      {s.d.ersatz && <FehlerZeile text="The store is not answering right now — you see the last backup, which may be older." />}
      <div className="flex flex-wrap items-center gap-2">
        {karten.map((x, i) => <button key={x.id} type="button" onClick={() => setOffen(i)} className={chip(i === offen)}>Global Championship (2026){karten.length > 1 && <span className="ml-1.5 opacity-60">{x.bildTitel || x.titel}</span>}</button>)}
        {wer?.isAdmin && <a href={`${SEITE}/maps?id=${encodeURIComponent(k.id)}`} target="_blank" rel="noreferrer" className="ml-auto rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-sky-400/50 hover:text-white">Open in the map tool ↗</a>}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <KartenAnsicht formen={formen} bild={k.bildId ? `/bilder/karten/${encodeURIComponent(k.bildId)}.png` : null} rotAb={2} titel="globals-2026-map" />
        <Glas className="p-4 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          <h2 className="mb-3 flex items-baseline justify-between font-bold text-white">Teams<span className="text-xs font-normal tabular-nums text-white/40">{(k.teams ?? []).length}</span></h2>
          <div className="space-y-3">
            {gruppen.map((g) => (
              <div key={g.r || 'x'}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">{g.r || 'No region'}<span className="ml-1.5 font-normal text-white/30">{g.z.length}</span></p>
                <ul>{g.z.map((z) => (
                  <li key={z.t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] font-semibold uppercase tracking-wide ${z.drauf ? 'text-white/85' : 'text-white/35'}`}>
                    <TeamFlagge groesse={18} laender={z.laender} /><span className="min-w-0 flex-1 truncate">{z.namen.map(kartenName).join(' + ')}</span>
                  </li>
                ))}</ul>
              </div>
            ))}
          </div>
        </Glas>
      </div>
      <p className="text-center text-[11px] text-white/30">Wheel zooms, drag moves, double click zooms in. View only — teams are placed in the map tool.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Predictions */

function Prognose() {
  const { wer } = useWer();
  const url = wer?.isAdmin ? '/api/prognosen' : '/api/meine-prognose';
  const [s] = useDaten<{ prognosen?: Array<Karte & { name?: string; geaendert?: number }> } | Array<Karte>>(url);
  if (s.art === 'laedt') return <Laedt />;
  if (s.art === 'anmelden') return <AnmeldeKarte text="Your own Globals prediction is saved with your VIP account." />;
  if (s.art !== 'ok') return <FehlerZeile text="The prediction could not be loaded." />;
  const liste = Array.isArray(s.d) ? s.d : s.d.prognosen ?? [];
  const p = liste.find((x) => x.eventId === EVENT || !x.eventId) ?? liste[0];
  return (
    <div className="space-y-4">
      <Glas className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-white">{wer?.isAdmin ? 'The CompHub prediction' : 'Your prediction'}</h2>
          <p className="mt-1 text-sm text-white/50">Draw where every duo lands and who wins. {wer?.isAdmin ? '' : 'Only you can see your own prediction.'} The drawing tool (shapes, drag & drop, Noble import) runs on thecomphub.com.</p>
        </div>
        <a href={`${SEITE}/globals/predictions`} target="_blank" rel="noreferrer" className="rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">{p ? 'Edit prediction ↗' : 'Make a prediction ↗'}</a>
      </Glas>
      {p?.spots?.length ? <KartenAnsicht formen={formenAusKarte(p)} bild={p.bildId ? `/bilder/karten/${encodeURIComponent(p.bildId)}.png` : null} rotAb={2} titel="globals-prediction" />
        : <Leer text="No prediction saved yet." />}
    </div>
  );
}

/* ---------------------------------------------------------------- Prize pool */

function Preisgeld() {
  const [s] = useDaten<{ waehrung: string; plaetze: Array<{ platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }>; summe: number; summeProSpieler: number; error?: string }>('/api/globals-preisgeld');
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok' || s.d.error) return <Leer text="Epic is not publishing the payout table for the Globals right now — please reload in a moment." />;
  const d = s.d;
  const podest = [{ r: '#facc15', g: 'from-amber-300/20' }, { r: '#cbd5e1', g: 'from-slate-300/15' }, { r: '#f59e0b', g: 'from-orange-500/15' }];
  return (
    <div className="space-y-6">
      <Glas className="relative overflow-hidden px-6 py-10 text-center">
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(14,71,222,.35), transparent 70%)' }} />
        <p className="relative text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">Prize pool</p>
        <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative mt-2 text-5xl font-black tabular-nums text-amber-300 sm:text-7xl">{usd(d.summe)}</motion.p>
        <p className="relative mt-3 text-sm text-white/55">{d.plaetze.length} paid places · {usd(d.summeProSpieler)} per player side</p>
        <p className="relative mt-1 text-[11px] text-white/30">Source: Epic's payout table. Amounts are per player; a duo gets double.</p>
      </Glas>
      <div className="grid gap-4 md:grid-cols-3">
        {d.plaetze.slice(0, 3).map((p, i) => (
          <Glas key={p.platz} className="relative overflow-hidden p-6" verzoegerung={0.1 + i * 0.05}>
            <div aria-hidden className={`absolute inset-0 bg-gradient-to-b ${podest[i].g} to-transparent`} />
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: podest[i].r }} />
            <p className="relative text-sm font-black uppercase tracking-widest text-white/50">{ordnung(p.platz)}</p>
            <p className="relative mt-2 text-4xl font-black tabular-nums" style={{ color: podest[i].r }}>{usd(p.proTeam)}</p>
            <p className="relative mt-1 text-sm text-white/50">per team · {usd(p.proSpieler)} per player</p>
          </Glas>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {d.plaetze.slice(3).map((p) => (
          <div key={p.platz} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-sky-400/40">
            <span className="grid h-10 w-14 shrink-0 place-items-center rounded-xl bg-black/30 text-sm font-black tabular-nums text-sky-200">{ordnung(p.platz)}</span>
            <span className="min-w-0 flex-1"><span className="block text-lg font-bold tabular-nums text-white">{usd(p.proTeam)}</span><span className="block text-xs text-white/40">{usd(p.proSpieler)} per player</span></span>
            {p.spanne[0] !== p.spanne[1] && <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white/50">{p.spanne[0]}–{p.spanne[1]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Rahmen */

const UNTER = [
  { pfad: '', titel: 'Overview', text: '' },
  { pfad: 'teams', titel: 'Teams', text: 'Who is in the field, and from which country' },
  { pfad: 'map', titel: 'Map', text: 'The tournament map — who lands where' },
  { pfad: 'predictions', titel: 'Predictions', text: 'Your call on the outcome' },
  { pfad: 'prizepool', titel: 'Prize Pool', text: 'Every place with its prize money' },
];

export default function Globals() {
  const { wer } = useWer();
  if (!wer) return <Laedt />;
  const darf = istVip(wer) || wer.rechte?.includes('globals');
  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]">
        <img src={BILD} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
        <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_minmax(0,560px)]">
          <div className="order-2 lg:order-1">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-300">FNCS · Antwerp · 26–27.09.2026</p>
            <h1 className="mt-1 text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl">Globals <span className="text-sky-400">2026</span></h1>
            <p className="mt-3 max-w-xl text-sm text-white/60">The FNCS Global Championship in one place: the field, the map, your prediction and the prize money.</p>
          </div>
          <img src={BILD} alt="FNCS Global Championship 2026" className="order-1 aspect-video w-full rounded-2xl border border-white/10 object-cover shadow-2xl lg:order-2" />
        </div>
      </motion.section>
      {!darf ? <AnmeldeKarte titel="VIPs only" text="The Globals page is for VIPs — sign in with a VIP account or access key." /> : (
        <>
          <div className="max-w-full overflow-x-auto">
            <nav className="inline-flex gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1 backdrop-blur-xl">
              {UNTER.map((u) => (
                <NavLink key={u.pfad} to={`/competitive/globals${u.pfad ? `/${u.pfad}` : ''}`} end
                  className={({ isActive }) => `shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-sky-400 text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{u.titel}</NavLink>
              ))}
            </nav>
          </div>
          <Routes>
            <Route index element={<Uebersicht />} />
            <Route path="teams" element={<Teams />} />
            <Route path="map" element={<Karten />} />
            <Route path="predictions" element={<Prognose />} />
            <Route path="prizepool" element={<Preisgeld />} />
            <Route path="*" element={<Uebersicht />} />
          </Routes>
        </>
      )}
    </div>
  );
}
