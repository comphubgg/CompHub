import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Bild, Flaeche, Leer, Marke, SeitenKopf, Segment, Zaehler } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import { istVip } from '../../streamer/zugang';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from './KartenAnsicht';
import PrognoseWerkzeug from './zeichnen/PrognoseWerkzeug';
import { Dock, KopfBand, Werkbank } from './Werkbank';
import { FehlerZeile, Laedt, SEITE, TeamFlagge, TeamFotos, datumKurz, flaggenPfad, landName, useDaten } from './teile';

/*
 * Globals 2026 im Hub (wie /globals der Seite): FNCS Global Championship, Antwerpen 26.-27.09.2026. Nur fuer VIPs (wie auf der Seite).
 * Aufbau (Design-System 3.0, 27.11.2026): oben die Buehne mit dem Turnierbild und den Unterseiten als sichtbarer Umschalter (auf Map und
 * Predictions nur ein schmales Kopfband, damit die Karte die Hoehe bekommt).
 *   Overview     - die Sieger gross im Hochkant-Foto, Platz 2 und 3 daneben, der Endstand als Tabelle mit Fotos (/api/globals-endstand, Fotos
 *                  aus /api/globals-teams), Spieltage aus dem Katalog
 *   Teams        - Duos als Fotokarten, nach Region gegliedert; Nationalities, Regions; Klick = gemeinsame Cups (/api/globals-duo)
 *   Map          - Werkbank: Teams nach Region links, Karte in der Mitte, belegte Stellen rechts (/api/turnier-karten)
 *   Predictions  - das Prognose-Werkzeug (zeichnen/PrognoseWerkzeug: eigene Prognose /api/meine-prognose bzw. fuer den Admin /api/prognosen)
 *   Prize pool   - Summe, Treppchen der ersten drei, alle Plaetze als Balken (/api/globals-preisgeld)
 * Die Stream-Overlays bleiben im Streamer-Bereich bzw. auf der Seite.
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
const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];

/** Der Endstand - Fotos kommen aus dem Feld (/api/globals-teams), weil der Endstand selbst keine fuehrt. */
function useEndstand() {
  const tage = useTage();
  const [s] = useDaten<{ ok: boolean; teams: EndTeam[] }>('/api/globals-endstand');
  const [f] = useDaten<{ teams: GTeam[] }>(`/api/globals-teams?fenster=${encodeURIComponent(tage[0].windowId)}`);
  const teams = useMemo(() => {
    const roh = s.art === 'ok' && s.d.ok ? s.d.teams : [];
    const foto = new Map<string, string>();
    for (const t of f.art === 'ok' ? f.d.teams ?? [] : []) for (const p of t.spieler) if (p.bild) { if (p.epicId) foto.set(p.epicId, p.bild); foto.set(p.anzeige.toLowerCase(), p.bild); }
    return roh.map((t) => ({ ...t, spieler: t.spieler.map((p) => ({ ...p, bild: p.bild ?? foto.get(p.id) ?? foto.get(p.anzeige.toLowerCase()) ?? null })) }));
  }, [s, f]);
  return { stand: s, teams, tage };
}

/* ---------------------------------------------------------------- Overview */

/** Ein Spieler gross im Hochkant-Foto (4:5), Name unten links - ohne Foto dieselbe Karte nur mit Flagge und Name. */
function Hochformat({ p, farbe, verz = 0 }: { p: EndTeam['spieler'][number]; farbe: string; verz?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verz, duration: 0.5 }} className="group relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-2xl bg-black/50">
      {p.bild && <img src={p.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition duration-700 group-hover:scale-105" />}
      <div className="absolute inset-0 bg-gradient-to-t from-fl via-fl/10 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: farbe }} />
      <Link to={`/competitive/player/${p.id}`} className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 sm:p-4">
        <TeamFlagge groesse={22} laender={[p.land]} /><span className="titel truncate text-2xl sm:text-4xl">{p.anzeige}</span>
      </Link>
    </motion.div>
  );
}

function Uebersicht() {
  const { stand: s, teams, tage } = useEndstand();
  const [sieger, zweiter, dritter, ...rest] = teams;
  return (
    <div className="space-y-4">
      {s.art === 'laedt' && <Laedt />}
      {s.art === 'fehler' && <FehlerZeile text="The final standings could not be loaded right now." />}
      {sieger && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 grid-cols-1 content-start gap-4">
            {/* Die Sieger */}
            <Flaeche fest className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><p className="ueber !text-amber-300">Global Champions 2026</p><h2 className="titel mt-1 text-4xl sm:text-5xl">{sieger.spieler.map((p) => p.anzeige).join(' & ')}</h2></div>
                <div className="flex gap-6">
                  {([['Points', sieger.punkte], ['Elims', sieger.elims], ['Wins', sieger.siege]] as Array<[string, number]>).map(([l, v]) => (
                    <div key={l} className="text-right"><Zaehler wert={v} className="titel text-4xl !text-amber-300" /><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p></div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">{sieger.spieler.map((p, i) => <Hochformat key={p.id} p={p} farbe={MEDAILLE[0]} verz={0.1 + i * 0.1} />)}</div>
            </Flaeche>
            {/* Platz 2 und 3 */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[zweiter, dritter].filter(Boolean).map((t, i) => (
                <Flaeche key={t.rang} fest verz={0.15 + i * 0.08} className="relative overflow-hidden p-4">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE[i + 1] }} />
                  <div className="flex items-center gap-3">
                    <span className="titel text-6xl" style={{ color: MEDAILLE[i + 1] }}>{t.rang}</span>
                    <div className="min-w-0 flex-1">
                      {t.spieler.map((p) => <Link key={p.id} to={`/competitive/player/${p.id}`} className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-tight text-white hover:text-akz"><TeamFlagge groesse={18} laender={[p.land]} /><span className="truncate">{p.anzeige}</span></Link>)}
                      <p className="zahl mt-1 text-xs text-white/50"><b className="text-white">{t.punkte}</b> pts · {t.elims} elims · {t.siege} {t.siege === 1 ? 'win' : 'wins'}</p>
                    </div>
                    {t.spieler.every((p) => p.bild) && <span className="flex shrink-0 gap-1.5">{t.spieler.map((p) => <img key={p.id} src={p.bild!} alt="" className="h-24 w-[72px] rounded-xl object-cover object-top" />)}</span>}
                  </div>
                </Flaeche>
              ))}
            </div>
            {/* Spieltage */}
            <Flaeche fest verz={0.25} className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div><p className="ueber">Antwerp · Belgium</p><p className="titel mt-1 text-2xl">Match days</p></div>
              <div className="flex flex-wrap gap-2">
                {tage.map((t) => <span key={t.windowId} className="rounded-xl border border-akz/25 bg-akz/[0.08] px-3 py-1.5 text-xs font-semibold text-white">{t.titel} <span className="zahl font-normal text-white/55">{new Date(t.begin).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' })}</span></span>)}
              </div>
              <p className="basis-full text-[11px] leading-relaxed text-white/40">The match days come from Epic's tournament catalogue — if Epic adds a third day, it shows up here by itself. Stream overlays for the Globals (leaderboard, team card, custom) live in the <NavLink className="text-akz hover:underline" to="/streamer/overlays/globals">Streamer area → Globals overlays</NavLink>.</p>
            </Flaeche>
          </div>
          {/* Der Endstand ab Platz 4 */}
          <div className="relative min-h-[520px] min-w-0">
            <Dock titel="Final standings" zahl={`${teams.length} teams · both days`} className="xl:absolute xl:inset-0">
              <table className="tabelle">
                <thead><tr><th className="w-10">#</th><th>Team</th><th className="hidden w-14 !text-right sm:table-cell">Wins</th><th className="w-14 !text-right">Elims</th><th className="w-16 !text-right">Points</th></tr></thead>
                <tbody>
                  {rest.map((x) => (
                    <tr key={x.rang}>
                      <td className="zahl text-xs font-black text-white/40">{x.rang}</td>
                      <td><span className="flex items-center gap-2.5">
                        <TeamFlagge groesse={26} laender={x.spieler.map((p) => p.land)} /><TeamFotos klein spieler={x.spieler} />
                        <span className="flex min-w-0 flex-col text-[12px] font-bold uppercase leading-[1.3] tracking-wide text-white">{x.spieler.map((p) => <Link key={p.id} to={`/competitive/player/${p.id}`} className="truncate hover:text-akz">{p.anzeige}</Link>)}</span>
                      </span></td>
                      <td className="zahl hidden text-right text-white/60 sm:table-cell">{x.siege}</td>
                      <td className="zahl text-right text-white/60">{x.elims}</td>
                      <td className="zahl text-right font-black text-akz">{x.punkte}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Dock>
          </div>
        </div>
      )}
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
  const mitFotos = team.spieler.slice(0, 2).every((s) => s.bild);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={zu}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20 }} onClick={(e) => e.stopPropagation()}
        className="fl-fest grid w-full max-w-5xl overflow-hidden shadow-2xl md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Links das Duo, rechts die gemeinsamen Cups */}
        <div className="relative border-b border-white/[0.06] p-4 md:border-b-0 md:border-r">
          <p className="ueber">{team.region || 'Global Championship'}{team.spiele > 0 ? ` · #${team.rang} · ${team.punkte} pts` : ''}</p>
          <div className="mt-3 flex gap-2.5">
            {team.spieler.slice(0, 2).map((s) => (
              <div key={s.turnierId} className="min-w-0 flex-1">
                {mitFotos && <img src={s.bild!} alt="" className="mb-2.5 aspect-[4/5] w-full rounded-2xl object-cover object-top" />}
                <p className="flex items-center gap-2"><img src={flaggenPfad(s.land)} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" /><span className="titel truncate text-2xl">{s.anzeige}</span></p>
                {s.x && <a href={`https://x.com/${s.x}`} target="_blank" rel="noreferrer" className="text-xs text-white/50 hover:text-akz">@{s.x}</a>}
                {s.epicId && <Link to={`/competitive/player/${s.epicId}`} className="knopf-leer mt-1 !text-xs">Player profile →</Link>}
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-w-0 p-5">
          <button type="button" onClick={zu} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-akz hover:text-white">×</button>
          <h3 className="titel mb-3 pr-10 text-2xl">Played together — this season</h3>
          {z === null ? <Laedt /> : z === 'fehler' ? <p className="py-6 text-center text-xs text-white/40">The cups could not be loaded right now.</p>
            : !z.length ? <p className="py-6 text-center text-xs text-white/40">{!a?.epicId || !b?.epicId ? 'The tool does not know both accounts of this duo — so no cups.' : 'These two have no recorded cup together this season.'}</p> : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="tabelle zahl !text-xs">
                  <thead><tr><th>Cup</th><th>Date</th><th className="!text-right">Place</th><th className="!text-right">Points</th><th className="!text-right">Elims</th><th className="!text-right">Earnings</th></tr></thead>
                  <tbody>{z.map((r) => (
                    <tr key={r.windowId}>
                      <td className="max-w-[260px] truncate text-white/85">{r.titel}</td>
                      <td className="text-white/40">{r.datum ? datumKurz(r.datum) : ''}</td>
                      <td className={`text-right font-semibold ${r.platz && r.platz <= 3 ? 'text-amber-300' : 'text-white'}`}>{r.platz ? `#${r.platz}` : '–'}</td>
                      <td className="text-right text-white/70">{r.punkte ?? '–'}</td>
                      <td className="text-right text-white/70">{r.elims ?? '–'}</td>
                      <td className="text-right text-emerald-300">{r.verdienst ? `$${r.verdienst.toLocaleString('en-US')}` : '–'}</td>
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

/** Ein Duo als Karte: oben die zwei Hochkant-Fotos nebeneinander, unten der feste dunkle Teil mit Namen, Region, Platz. */
function DuoKarte({ t, i, auf }: { t: GTeam; i: number; auf: () => void }) {
  return (
    <motion.button type="button" onClick={auf} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: Math.min(i % 6, 6) * 0.04, duration: 0.45 }}
      className="fl-fest fl-klick group overflow-hidden text-left">
      <div className="relative grid grid-cols-2 gap-px bg-black">
        {t.spieler.slice(0, 2).map((p) => (
          <div key={p.turnierId} className="relative aspect-[4/5] overflow-hidden bg-black/60">
            <img src={p.bild!} alt="" loading="lazy" className="h-full w-full object-cover object-top transition duration-700 group-hover:scale-[1.06]" />
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl to-transparent" />
        {t.spiele > 0 && <span className="absolute left-2.5 top-2.5"><Marke ton={t.rang <= 3 ? 'gold' : 'still'}>#{t.rang}</Marke></span>}
        {t.region && <span className="absolute right-2.5 top-2.5"><Marke>{t.region}</Marke></span>}
      </div>
      <div className="grid grid-cols-2 gap-px px-1 pb-3 pt-1">
        {t.spieler.slice(0, 2).map((p) => <p key={p.turnierId} className="flex min-w-0 items-center gap-1.5 px-2 text-sm font-bold text-white"><img src={flaggenPfad(p.land)} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /><span className="truncate">{p.anzeige}</span></p>)}
        {t.spiele > 0 && <p className="zahl col-span-2 px-2 pt-1 text-[11px] text-white/45">{t.punkte} pts · {t.elims} elims · {t.spiele} games</p>}
      </div>
    </motion.button>
  );
}

/** Dasselbe Duo ohne Fotostreifen (nicht jeder hat ein Foto) - gleich grosse Zeilenkachel. */
function DuoZeileKarte({ t, auf }: { t: GTeam; auf: () => void }) {
  return (
    <button type="button" onClick={auf} className="fl-fest fl-klick flex h-[68px] items-center gap-3 px-3.5 text-left">
      <TeamFlagge groesse={30} laender={t.spieler.map((p) => p.land)} />
      <span className="flex min-w-0 flex-1 flex-col text-[13px] font-bold uppercase leading-snug tracking-wide text-white">{t.spieler.slice(0, 2).map((p) => <span key={p.turnierId} className="truncate">{p.anzeige}</span>)}</span>
      {t.region && <Marke>{t.region}</Marke>}
      {t.spiele > 0 && <span className="zahl w-9 text-right text-xs font-black text-white/50">#{t.rang}</span>}
    </button>
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
  const mitFoto = gezeigt.filter((t) => t.spieler.length > 0 && t.spieler.every((p) => p.bild));
  const ohneFoto = gezeigt.filter((t) => !(t.spieler.length > 0 && t.spieler.every((p) => p.bild)));
  const regionen = REGIONEN.map((r) => ({ r, l: gezeigt.filter((t) => t.region === r) })).filter((g) => g.l.length);
  return (
    <div className="space-y-5">
      <div className="fl-fest flex flex-wrap items-center gap-x-5 gap-y-3 !rounded-2xl px-4 py-3">
        <Segment id="globals-teams" wert={ansicht} onWahl={setAnsicht} wahl={[{ k: 'spieler', titel: 'Players' }, { k: 'laender', titel: 'Nationalities' }, { k: 'regionen', titel: 'Regions' }]} />
        <div className="flex gap-5">
          {([['Teams', teams.length], ['Players', s.d.spieler ?? teams.length * 2], ['Countries', laender.length]] as Array<[string, number]>).map(([l, v]) => (
            <p key={l} className="flex items-baseline gap-1.5"><span className="titel text-3xl !text-akz">{v}</span><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{l}</span></p>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player …" className="eingabe ml-auto w-full !py-2 sm:w-64" />
      </div>
      {!gezeigt.length && <Leer text="No player found." />}
      {ansicht === 'spieler' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {mitFoto.map((t, i) => <DuoKarte key={t.rang} t={t} i={i} auf={() => setOffen(t)} />)}
          </div>
          {ohneFoto.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-3"><span className="h-5 w-1 rounded-full bg-akz" /><h3 className="titel text-2xl">More teams</h3><span className="zahl text-sm font-semibold text-white/35">{ohneFoto.length}</span><span className="h-px flex-1 bg-white/[0.07]" /></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{ohneFoto.map((t) => <DuoZeileKarte key={t.rang} t={t} auf={() => setOffen(t)} />)}</div>
            </section>
          )}
        </>
      )}
      {ansicht === 'laender' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {laender.map(([land, sp], i) => (
            <Flaeche key={land} fest className="p-4" verz={Math.min(i, 12) * 0.03}>
              <div className="mb-3 flex items-center gap-2.5 border-b border-white/[0.06] pb-2.5"><img src={flaggenPfad(land)} alt="" className="h-6 w-6 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{landName(land)}</span><span className="titel text-2xl !text-akz">{sp.length}</span></div>
              <ul className="space-y-1.5">{sp.map((p) => (
                <li key={p.turnierId} className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-white/85">
                  {p.bild && <img src={p.bild} alt="" loading="lazy" className="h-9 w-[27px] shrink-0 rounded-md object-cover object-top" />}<span className="truncate">{p.anzeige}</span>
                </li>
              ))}</ul>
            </Flaeche>
          ))}
        </div>
      )}
      {ansicht === 'regionen' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {regionen.map((g, i) => (
            <Flaeche key={g.r} fest className="overflow-hidden" verz={i * 0.04}>
              <div className="flex items-end justify-between border-b border-white/[0.06] px-4 py-3"><h3 className="titel text-4xl">{g.r}</h3><span className="zahl text-xs font-semibold text-white/45">{g.l.length} teams</span></div>
              <ul>{g.l.map((t) => (
                <li key={t.rang}><button type="button" onClick={() => setOffen(t)} className="flex w-full items-center gap-2.5 border-b border-white/[0.05] px-4 py-2 text-left transition last:border-b-0 hover:bg-akz/[0.08]">
                  <TeamFlagge groesse={24} laender={t.spieler.map((p) => p.land)} />
                  <span className="flex min-w-0 flex-1 flex-col text-[12px] font-bold uppercase leading-snug tracking-wide text-white">{t.spieler.map((p) => <span key={p.turnierId} className="truncate">{p.anzeige}</span>)}</span>
                  <TeamFotos klein spieler={t.spieler} />
                </button></li>
              ))}</ul>
            </Flaeche>
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
  const [zeige, setZeige] = useState<{ namen: string[]; n: number } | null>(null);
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
    const zeilen = (k.teams ?? []).map((t) => ({ t, namen: name(t), laender: (t.ids ?? []).map((id) => feld.sp.get(id)?.land ?? null), bilder: (t.ids ?? []).map((id) => ({ bild: feld.sp.get(id)?.bild })), region: (t.ids ?? []).map((id) => feld.rg.get(id)).find(Boolean) ?? '', drauf: platziert.has(t.id) }));
    return [...REGIONEN, ''].map((r) => ({ r, z: zeilen.filter((x) => (REGIONEN.includes(x.region) ? x.region : '') === r) })).filter((g) => g.z.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, feld]);
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok') return <FehlerZeile text="The map could not be loaded." />;
  if (!k) return <Leer text={wer?.isAdmin ? 'No Globals map yet — draw it in the map tool (choose the Global Championship as cup).' : 'As soon as the map is ready, it shows up here.'}>
    {wer?.isAdmin ? <Link to="/competitive/maps/view?edit=1" className="knopf-prim !bg-amber-400">Open the map tool</Link> : undefined}</Leer>;
  const springe = (namen: string[]) => setZeige((alt) => ({ namen, n: (alt?.n ?? 0) + 1 }));
  const nach = new Map((k.teams ?? []).map((t) => [t.id, t]));
  const belegt = (k.spots ?? []).filter((sp) => sp.teams.length).sort((a, b) => b.teams.length - a.teams.length);
  return (
    <div className="space-y-3">
      {s.d.ersatz && <FehlerZeile text="The store is not answering right now — you see the last backup, which may be older." />}
      <div className="ohne-leiste flex items-center gap-2 overflow-x-auto">
        {karten.map((x, i) => <button key={x.id} type="button" onClick={() => setOffen(i)} className={`chip ${i === offen ? 'chip-an' : ''}`}>Global Championship (2026){karten.length > 1 && <span className="text-white/55">{x.bildTitel || x.titel}</span>}</button>)}
        {k.spiele && <Marke>Games {k.spiele}</Marke>}
        {wer?.isAdmin && <Link to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}&edit=1`} className="chip ml-auto !border-amber-400/40 !text-amber-200">Open in the map tool</Link>}
        <a href={`${SEITE}/globals/map`} target="_blank" rel="noreferrer" className={`${wer?.isAdmin ? '' : 'ml-auto '}knopf-leer shrink-0 !text-xs !text-white/45 hover:!text-white`}>Classic view ↗</a>
      </div>
      <Werkbank
        links={(
          <Dock titel="Teams" zahl={(k.teams ?? []).length} fuss="Click a team to fly to its drop spot. View only — teams are placed in the map tool.">
            {gruppen.map((g) => (
              <div key={g.r || 'x'}>
                <p className="sticky top-0 z-[1] flex items-center justify-between border-b border-white/[0.06] bg-fl px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-akz">{g.r || 'No region'}<span className="zahl text-white/35">{g.z.length}</span></p>
                <ul>{g.z.map((z) => (
                  <li key={z.t.id}>
                    <button type="button" disabled={!z.drauf} onClick={() => springe(z.namen)} className={`flex w-full items-center gap-2.5 border-b border-white/[0.05] px-3 py-1.5 text-left transition ${z.drauf ? 'hover:bg-akz/[0.08]' : 'opacity-40'}`}>
                      <TeamFlagge groesse={22} laender={z.laender} />
                      <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{z.namen.map((n, i) => <span key={i} className="truncate">{kartenName(n)}</span>)}</span>
                      <TeamFotos klein spieler={z.bilder} />
                    </button>
                  </li>
                ))}</ul>
              </div>
            ))}
          </Dock>
        )}
        rechts={(
          <Dock titel="Spots" zahl={`${belegt.filter((sp) => sp.teams.length > 1).length} contested`} fuss="Wheel zooms, drag moves, double click zooms in.">
            <ul>
              {belegt.map((sp) => {
                const ts = sp.teams.map((t) => nach.get(t)).filter((t): t is KTeam => Boolean(t));
                return (
                  <li key={sp.id}>
                    <button type="button" onClick={() => springe(ts.flatMap((t) => name(t)))} className={`flex w-full items-start gap-3 border-b border-white/[0.05] px-3 py-2.5 text-left transition ${ts.length > 1 ? 'hover:bg-red-500/[0.08]' : 'hover:bg-akz/[0.08]'}`}>
                      <span className={`titel w-7 shrink-0 text-center text-3xl ${ts.length > 1 ? '!text-red-400' : '!text-white/30'}`}>{ts.length}</span>
                      <span className="min-w-0 flex-1">
                        {sp.name?.trim() && <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{sp.name}</span>}
                        {ts.map((t) => <span key={t.id} className="block truncate text-[11px] font-bold uppercase tracking-wide text-white">{name(t).map(kartenName).join(' · ')}</span>)}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!belegt.length && <li className="px-4 py-6 text-center text-sm text-white/45">No team is placed yet.</li>}
            </ul>
          </Dock>
        )}>
        <KartenAnsicht formen={formen} bild={k.bildId ? `/bilder/karten/${encodeURIComponent(k.bildId)}.png` : null} rotAb={2} deckel="none" zeige={zeige} titel="globals-2026-map" />
      </Werkbank>
    </div>
  );
}

/* ---------------------------------------------------------------- Predictions */

/** Die Prognose: dasselbe Werkzeug wie auf /globals/predictions - der Admin die CompHub-Prognose, jeder VIP seine eigene. */
function Prognose() {
  return <PrognoseWerkzeug />;
}

/* ---------------------------------------------------------------- Prize pool */

function Preisgeld() {
  const [s] = useDaten<{ waehrung: string; plaetze: Array<{ platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }>; summe: number; summeProSpieler: number; error?: string }>('/api/globals-preisgeld');
  const { teams } = useEndstand();
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok' || s.d.error) {
    // Ohne Auszahlungstabelle: ein Satz dazu - und der Endstand, um den es beim Preisgeld geht (keine leere Seite).
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-3 text-sm text-white/50">Epic is not publishing the payout table for the Globals right now — the amounts appear here as soon as it is back. Until then: the final standings the prize money follows.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {teams.slice(0, 16).map((t, i) => (
            <Flaeche key={t.rang} fest verz={Math.min(i, 10) * 0.03} className="flex h-[76px] items-center gap-3 px-4">
              <span className="titel w-10 text-4xl" style={{ color: MEDAILLE[t.rang - 1] ?? 'rgba(255,255,255,.3)' }}>{t.rang}</span>
              <TeamFlagge groesse={28} laender={t.spieler.map((p) => p.land)} />
              <span className="flex min-w-0 flex-1 flex-col text-[13px] font-bold uppercase leading-snug tracking-wide text-white">{t.spieler.map((p) => <span key={p.id} className="truncate">{p.anzeige}</span>)}</span>
              <TeamFotos spieler={t.spieler} />
              <span className="zahl text-right text-sm font-black text-akz">{t.punkte}</span>
            </Flaeche>
          ))}
        </div>
      </div>
    );
  }
  const d = s.d;
  const max = Math.max(1, ...d.plaetze.map((p) => p.proTeam));
  const [eins, zwei, drei] = d.plaetze;
  const stufe = (p: typeof eins | undefined, i: number, hoehe: string) => p && (
    <motion.div key={p.platz} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }} className="flex min-w-0 flex-1 flex-col justify-end">
      <p className="zahl truncate text-center text-xl font-extrabold text-white sm:text-3xl">{usd(p.proTeam)}</p>
      <p className="zahl mb-2 truncate text-center text-[11px] text-white/45">{usd(p.proSpieler)} per player</p>
      <div className={`relative overflow-hidden rounded-t-2xl bg-gradient-to-b from-white/[0.07] to-transparent ${hoehe}`}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE[i] }} />
        <p className="titel pt-3 text-center text-6xl sm:text-7xl" style={{ color: MEDAILLE[i] }}>{p.platz}</p>
      </div>
    </motion.div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
      <div className="space-y-4 xl:sticky xl:top-[7.5rem]">
        <Flaeche fest className="p-6">
          <p className="ueber">Prize pool · {d.waehrung || 'USD'}</p>
          <p className="titel mt-2 text-7xl !text-amber-300 sm:text-8xl"><Zaehler wert={d.summe} format={usd} /></p>
          <p className="zahl mt-2 text-sm text-white/55">{d.plaetze.length} paid places · {usd(d.summeProSpieler)} per player side</p>
          <p className="mt-1 text-[11px] text-white/30">Source: Epic's payout table. Amounts are per player; a duo gets double.</p>
        </Flaeche>
        <Flaeche fest verz={0.08} className="px-5 pt-5">
          <div className="flex items-end gap-3">{stufe(zwei, 1, 'h-28')}{stufe(eins, 0, 'h-40')}{stufe(drei, 2, 'h-20')}</div>
        </Flaeche>
      </div>
      <Flaeche fest verz={0.12} className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3"><span className="h-4 w-1 rounded-full bg-akz" /><h2 className="titel text-xl">Every paid place</h2></div>
        <ul>
          {d.plaetze.map((p, i) => (
            <li key={p.platz} className="flex items-center gap-4 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0">
              <span className="titel w-16 shrink-0 text-2xl" style={{ color: MEDAILLE[i] ?? 'rgba(255,255,255,.45)' }}>{p.spanne[0] !== p.spanne[1] ? `${p.spanne[0]}–${p.spanne[1]}` : ordnung(p.platz)}</span>
              <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: MEDAILLE[i] ?? 'rgb(var(--akz))' }} initial={{ width: 0 }} whileInView={{ width: `${(p.proTeam / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: Math.min(i, 12) * 0.03 }} />
              </span>
              <span className="w-28 shrink-0 text-right"><span className="zahl block text-base font-bold text-white">{usd(p.proTeam)}</span><span className="zahl block text-[11px] text-white/40">{usd(p.proSpieler)} per player</span></span>
            </li>
          ))}
        </ul>
      </Flaeche>
    </div>
  );
}

/* ---------------------------------------------------------------- Rahmen */

const UNTER = [
  { pfad: '', titel: 'Overview' },
  { pfad: 'teams', titel: 'Teams' },
  { pfad: 'map', titel: 'Map' },
  { pfad: 'predictions', titel: 'Predictions' },
  { pfad: 'prizepool', titel: 'Prize Pool' },
];

/** Die Unterseiten als sichtbarer Umschalter (Links mit gleitender Pille) - kein Ausklappen. */
function UnterNav({ aktiv }: { aktiv: string }) {
  return (
    <nav className="ohne-leiste inline-flex max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-1">
      {UNTER.map((u) => (
        <NavLink key={u.pfad} to={`/competitive/globals${u.pfad ? `/${u.pfad}` : ''}`} end
          className={`relative shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${aktiv === u.pfad ? 'text-[#04050a]' : 'text-white/60 hover:text-white'}`}>
          {aktiv === u.pfad && <motion.span layoutId="globals-unter" className="absolute inset-0 rounded-lg bg-akz shadow-[0_6px_18px_-6px_rgb(var(--akz)/0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative">{u.titel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Globals() {
  const { wer } = useWer();
  const ort = useLocation();
  if (!wer) return <Laedt />;
  const darf = istVip(wer) || wer.rechte?.includes('globals');
  const teil = ort.pathname.replace(/\/$/, '').split('/')[3] ?? '';
  const aktiv = UNTER.some((u) => u.pfad === teil) ? teil : '';
  // Die grosse Buehne nur auf der Uebersicht - auf den Unterseiten ein schmales Kopfband, damit der Inhalt (Karte, Feld) gleich oben beginnt.
  const werkzeug = darf && aktiv !== '';
  return (
    <div className={werkzeug ? '-mt-2 space-y-3' : ''}>
      {werkzeug ? (
        <KopfBand zurueck="/competitive/globals" zurueckTitel="Globals overview" bild={<Bild src={BILD} className="hidden aspect-video h-[72px] shrink-0 rounded-2xl sm:block" />}
          ueber="FNCS · Antwerp · 26–27.09.2026" titel={<>Globals <span className="text-akz">2026</span></>} rechts={<UnterNav aktiv={aktiv} />} />
      ) : (
        <SeitenKopf bild={BILD} ueber="FNCS · Antwerp · 26–27.09.2026" titel={<>Globals <span className="text-akz">2026</span></>}
          text="The FNCS Global Championship in one place: the field, the map, your prediction and the prize money.">
          {darf && <UnterNav aktiv={aktiv} />}
        </SeitenKopf>
      )}
      {!darf ? <AnmeldeKarte titel="VIPs only" text="The Globals page is for VIPs — sign in with a VIP account or access key." /> : (
        <Routes>
          <Route index element={<Uebersicht />} />
          <Route path="teams" element={<Teams />} />
          <Route path="map" element={<Karten />} />
          <Route path="predictions" element={<Prognose />} />
          <Route path="prizepool" element={<Preisgeld />} />
          <Route path="*" element={<Uebersicht />} />
        </Routes>
      )}
    </div>
  );
}
