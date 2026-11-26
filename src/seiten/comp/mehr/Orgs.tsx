import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, Leer, SeitenKopf, Suche, TeamFlagge, chip, useDaten } from './teile';
import { REGION_FARBE } from '../events/gemeinsam';

/*
 * Orgs im Hub:
 *  - /competitive/orgs: alle Organisationen (/api/orgs) mit Logo, Region, Kader und Preisgeld - Suche und Region.
 *  - /competitive/team/:org: die Teamseite (wie /team/[org], /api/team) - Kader nach Rolle mit Foto, Flagge, Earnings, Matches, PR; Klick oeffnet das
 *    kleine Fenster mit allen Werten und den letzten Ergebnissen.
 *  - /competitive/org: "Dein Team" fuer Org-Konten (wie /org, /api/org-konto, /api/org-pov) - Farbe, Spieler hinzufuegen (Suche), Rolle, seit, X,
 *    Foto, entfernen, und die POVs des Teams (Qualitaet, Namensbanner, wer zusehen darf).
 */

type Rolle = 'pro' | 'academy' | 'creator';
const ROLLEN: Array<[Rolle, string]> = [['pro', 'Pro Roster'], ['academy', 'Academy Roster'], ['creator', 'Content Creator']];
const geld = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en')}`);
const zahl = (n: number | null | undefined, s = 0) => (n == null ? '—' : n.toLocaleString('en', { maximumFractionDigits: s, minimumFractionDigits: s }));
const LIQUI = (n: string) => n.replace(/_/g, ' ');

/* ---------------------------------------------------------------- Liste */

interface OrgKurz { id: string; name: string; logo: string | null; banner: string | null; farbe: string | null; land: string | null; region: string | null; x: string | null; gesamt?: number; spieler: Array<{ epicId: string | null; name: string; bild: string | null; rolle: Rolle; betrag: number | null; land: string | null }> }

export function OrgsListe() {
  const [s] = useDaten<{ orgs: OrgKurz[] }>('/api/orgs');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const orgs = useMemo(() => (s.art === 'ok' ? s.d.orgs : []), [s]);
  const regionen = useMemo(() => [...new Set(orgs.map((o) => o.region).filter((r): r is string => !!r))].sort(), [orgs]);
  const sichtbar = useMemo(() => orgs.filter((o) => (!region || o.region === region) && (!q || `${o.name} ${o.spieler.map((p) => p.name).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.gesamt ?? 0) - (a.gesamt ?? 0)), [orgs, q, region]);
  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Teams" titel="Orgs" text="Every esports organisation in competitive Fortnite — rosters, photos and real tournament earnings."
        rechts={<Link to="/competitive/org" className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-white/80 backdrop-blur-xl hover:border-sky-400/50">Manage your team →</Link>} />
      <div className="flex flex-wrap items-center gap-2">
        <Suche wert={q} setze={setQ} platz="Search an org or player …" />
        <button type="button" onClick={() => setRegion('')} className={chip(!region)}>All</button>
        {regionen.map((r) => <button key={r} type="button" onClick={() => setRegion(region === r ? '' : r)} className={chip(region === r)}>{r}</button>)}
        <span className="ml-auto text-xs text-white/40">{sichtbar.length} orgs</span>
      </div>
      {s.art === 'laedt' && <Laedt />}
      {s.art === 'fehler' && <FehlerZeile text="The orgs could not be loaded." />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {sichtbar.map((o, i) => {
          const f = o.farbe || REGION_FARBE[o.region ?? ''] || '#38bdf8';
          const pros = o.spieler.filter((p) => p.rolle === 'pro');
          const mitFoto = pros.length > 0 && pros.slice(0, 4).every((p) => p.bild);
          return (
            <motion.div key={o.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 16) * 0.025 }} whileHover={{ y: -4 }}>
              <Link to={`/competitive/team/${o.id}`} className="group relative block h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-white/25">
                <span aria-hidden className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-25 blur-3xl transition group-hover:opacity-45" style={{ background: f }} />
                <div className="relative flex items-center gap-4">
                  {o.logo ? <img src={o.logo} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl bg-black/30 object-contain p-1.5" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl font-black text-white" style={{ background: f }}>{o.name.slice(0, 1)}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-extrabold text-white">{o.name}</p>
                    <p className="text-xs text-white/45">{o.region ?? '—'} · {pros.length} pros{o.spieler.length > pros.length ? ` · ${o.spieler.length - pros.length} more` : ''}</p>
                  </div>
                  {o.gesamt ? <span className="text-right text-sm font-bold tabular-nums text-emerald-300">{geld(o.gesamt)}</span> : null}
                </div>
                <div className="relative mt-4 flex items-center gap-1.5">
                  {mitFoto ? pros.slice(0, 4).map((p) => <img key={p.name} src={p.bild!} alt="" loading="lazy" className="h-12 w-9 rounded-lg object-cover object-top ring-1 ring-white/15" />)
                    : <span className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold uppercase text-white/60">{pros.slice(0, 5).map((p) => <span key={p.name} className="flex items-center gap-1"><TeamFlagge groesse={12} laender={[p.land]} />{p.name}</span>)}</span>}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Teamseite */

interface TSpieler { epicId: string | null; epicIdConfidence?: 'confirmed' | 'guess' | null; name: string; role: Rolle; country: string | null; homeRegion: string | null; matches: number | null; elims: number | null; damagePerMatch: number | null; elimsPerMatch: number | null; earnings: number | null; photo: string | null; x: string | null; twitch: string | null; since: string | null; recentResults: Array<{ date: string | null; event: string; prize: number }>; powerRank: number | null; powerPoints: number | null; ftPrPoints?: number | null; ftPrRank?: number | null; ftPrRegion?: string | null }
interface TAntwort { ok: boolean; reason?: string; org?: { slug: string; name: string; logo: string | null; banner: string | null; colors: { primary: string | null }; region: string | null; links: Record<string, string | null> }; players?: TSpieler[] }

export function TeamSeite() {
  const { org = '' } = useParams();
  const [d, setD] = useState<TAntwort | null>(null);
  const [offen, setOffen] = useState<TSpieler | null>(null);
  useEffect(() => {
    let weg = false; setD(null);
    fetch(`/api/team?org=${encodeURIComponent(org)}`).then((r) => r.json()).then((j: TAntwort) => {
      // Nur geratene Epic-Konten: keine Werte zeigen (wie auf der Seite).
      if (j.players) j.players = j.players.map((p) => (p.epicIdConfidence === 'guess' ? { ...p, epicId: null, matches: null, elims: null, damagePerMatch: null, elimsPerMatch: null, earnings: null, powerRank: null, powerPoints: null, recentResults: [] } : p));
      if (!weg) setD(j);
    }).catch(() => { if (!weg) setD({ ok: false, reason: 'down' }); });
    return () => { weg = true; };
  }, [org]);
  useEffect(() => { if (!offen) return undefined; const t = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(null); }; document.addEventListener('keydown', t); return () => document.removeEventListener('keydown', t); }, [offen]);
  const gruppen = useMemo(() => ROLLEN.map(([r, titel]) => ({ titel, liste: (d?.players ?? []).filter((p) => p.role === r).sort((a, b) => (b.earnings ?? -1) - (a.earnings ?? -1) || (a.powerRank ?? 1e9) - (b.powerRank ?? 1e9) || (b.matches ?? -1) - (a.matches ?? -1)) })).filter((g) => g.liste.length), [d]);
  if (!d) return <Laedt text="Loading the team …" />;
  if (!d.ok || !d.org) return <Leer text={d.reason === 'unbekannte Organisation' ? 'This team does not exist on CompHub.' : 'The team cannot be loaded right now.'} kind={<Link to="/competitive/orgs" className="mt-4 inline-block text-sm font-semibold text-sky-300">← All orgs</Link>} />;
  const o = d.org; const f = o.colors.primary || '#38bdf8';
  return (
    <div className="space-y-10">
      <Link to="/competitive/orgs" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-1.5 text-xs font-semibold text-white/70 hover:border-sky-400/50 hover:text-white">← All orgs</Link>
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]">
        {o.banner && <img src={o.banner} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />}
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full opacity-30 blur-3xl" style={{ background: f }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-[#06080f]" />
        <div className="flex flex-wrap items-end gap-6 p-6 pt-16 sm:p-10 sm:pt-24">
          {o.logo && <img src={o.logo} alt={o.name} className="h-28 w-28 rounded-3xl border-2 bg-black/30 object-contain p-2 shadow-2xl" style={{ borderColor: f }} />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: f }}>{o.region ?? ''} Team</p>
            <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">{o.name}</h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {Object.entries(o.links).filter(([, v]) => v).map(([k, v]) => <a key={k} href={v!} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 bg-black/30 px-4 py-1.5 font-semibold capitalize text-white/85 hover:border-white/40">{k === 'x' ? 'X' : k} ↗</a>)}
            </div>
          </div>
        </div>
      </motion.section>
      {gruppen.map((g) => (
        <section key={g.titel}>
          <h2 className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: f }}>{g.titel} <span className="text-white/35">· {g.liste.length}</span></h2>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {g.liste.map((p, i) => (
              <motion.li key={p.epicId ?? p.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }} whileHover={{ y: -4 }}>
                <button type="button" onClick={() => setOffen(p)} className="block w-full rounded-3xl border border-white/10 bg-white/[0.035] p-3 text-left backdrop-blur-xl transition hover:border-white/30">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#0a0e18]">
                    {p.photo ? <img src={p.photo} alt={p.name} loading="lazy" className="h-full w-full object-cover object-top" /> : <div className="grid h-full place-items-center bg-gradient-to-br from-white/5 to-transparent"><TeamFlagge groesse={52} laender={[p.country]} /></div>}
                  </div>
                  <p className="mt-3 flex min-w-0 items-center gap-2 text-lg font-extrabold uppercase text-white"><TeamFlagge groesse={18} laender={[p.country]} /><span className="truncate">{p.name}</span></p>
                  <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                    {([['Earnings', geld(p.earnings)], ['Matches', zahl(p.matches)], ['PR', p.powerRank ? `#${zahl(p.powerRank)}` : '—']] as Array<[string, string]>).map(([k, v]) => <div key={k} className="rounded-xl bg-black/30 px-1 py-2"><dt className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{k}</dt><dd className="text-xs font-bold tabular-nums text-white">{v}</dd></div>)}
                  </dl>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
      <AnimatePresence>
        {offen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog">
            <button type="button" aria-label="Close" onClick={() => setOffen(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]/95 shadow-2xl backdrop-blur-xl sm:flex-row">
              <div className="relative aspect-[4/5] w-full shrink-0 bg-[#06080f] sm:w-56">
                {offen.photo ? <img src={offen.photo} alt="" className="h-full w-full object-cover object-top" /> : <div className="grid h-full place-items-center"><TeamFlagge groesse={64} laender={[offen.country]} /></div>}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto p-6">
                <button type="button" onClick={() => setOffen(null)} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white/70 hover:text-white">✕</button>
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: f }}>{ROLLEN.find(([r]) => r === offen.role)?.[1]}{offen.homeRegion ? ` · ${offen.homeRegion}` : ''}{offen.since ? ` · since ${offen.since.slice(0, 7)}` : ''}</p>
                <h3 className="mt-1 flex items-center gap-2 text-3xl font-extrabold uppercase text-white"><TeamFlagge groesse={24} laender={[offen.country]} /><span className="truncate">{offen.name}</span></h3>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {([['Earnings', geld(offen.earnings)], ...(offen.ftPrPoints != null ? [['FT PR', zahl(offen.ftPrPoints)], [`FT rank ${offen.ftPrRegion ?? ''}`.trim(), offen.ftPrRank ? `#${zahl(offen.ftPrRank)}` : '—']] : [['Power Ranking', offen.powerRank ? `#${zahl(offen.powerRank)}` : '—'], ['PR points', zahl(offen.powerPoints)]]), ['Matches', zahl(offen.matches)], ['Elims / match', zahl(offen.elimsPerMatch, 2)], ['Damage / match', zahl(offen.damagePerMatch)]] as Array<[string, string]>).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/[0.05] px-1 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{k}</dt><dd className="text-base font-bold tabular-nums text-white">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/40">Latest results</p>
                {offen.recentResults?.length ? (
                  <ul className="mt-2 grid gap-1.5 text-sm">{offen.recentResults.slice(0, 5).map((r) => <li key={`${r.date}-${r.event}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-1.5"><span className="min-w-0 truncate text-white/80">{LIQUI(r.event)}</span><span className="shrink-0 tabular-nums text-white/45">{r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''} · <b className="text-emerald-300">{geld(r.prize)}</b></span></li>)}</ul>
                ) : <p className="mt-2 text-sm text-white/40">{offen.epicId ? 'No results with prize money yet.' : 'Not matched to an Epic account yet — so no stats.'}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  {offen.epicId && <Link to={`/competitive/player/${offen.epicId}`} className="rounded-full px-5 py-2 text-sm font-bold text-[#06080f]" style={{ background: f }}>Full profile →</Link>}
                  {offen.x && <a href={`https://x.com/${offen.x}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/85">X ↗</a>}
                  {offen.twitch && <a href={`https://twitch.tv/${offen.twitch}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/85">Twitch ↗</a>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-center text-sm text-white/35">All values from official tournament replays — a dash means no scored games yet.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Dein Team (Org-Konto) */

interface KSpieler { epicId: string | null; name: string; seit: string | null; rolle: Rolle; x: string | null; bild?: string | null }
interface KOrg { id: string; name: string; logo: string | null; farbe?: string | null; spieler: KSpieler[] }
interface Kanal { ident: string; spieler: string; konto: string; bild: string | null; live: boolean; zuschauer: number; qualitaet: 'max' | 'mittel' | 'niedrig'; hud: { an: boolean; ort: 'oben' | 'unten' | 'links' | 'rechts'; mitBild: boolean; text: string }; erlaubt: string[] }
interface Vip { ident: string; name: string; auch: string[] }
const FARBEN = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#94a3b8'];
const feld = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none';
/** Die Seite antwortet auf Deutsch - kurz uebersetzen, was oft kommt. */
const en = (s: string) => (/verwaltet keine/i.test(s) ? 'This account does not manage an organisation.' : /ablage/i.test(s) ? 'The store is not answering right now.' : /[äöüß]|nicht/i.test(s) ? 'That did not work.' : s);

function OrgPov({ orgParam, farbe }: { orgParam: string; farbe: string }) {
  const [kanaele, setKanaele] = useState<Kanal[] | null>(null);
  const [ohne, setOhne] = useState<Array<{ name: string }>>([]);
  const [vips, setVips] = useState<Vip[]>([]);
  const [fehler, setFehler] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const nimm = useCallback((j: { ok?: boolean; error?: string; kanaele?: Kanal[]; ohneKonto?: Array<{ name: string }>; vips?: Vip[] }) => {
    if (!j.ok) { setFehler(en(j.error ?? '')); return; }
    setFehler(''); setKanaele(j.kanaele ?? []); setOhne(j.ohneKonto ?? []); if (j.vips) setVips(j.vips);
  }, []);
  useEffect(() => { let weg = false; fetch(`/api/org-pov${orgParam ? `?org=${encodeURIComponent(orgParam)}` : ''}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!weg) nimm(j); }).catch(() => { if (!weg) setFehler('The store is not answering right now.'); }); return () => { weg = true; }; }, [orgParam, nimm]);
  const aendere = async (ident: string, teil: Record<string, unknown>) => { try { nimm(await (await fetch('/api/org-pov', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org: orgParam || undefined, ident, teil }) })).json()); } catch { setFehler('The store is not answering right now.'); } };
  const gefiltert = useMemo(() => (q.trim() ? vips.filter((v) => v.name.toLowerCase().includes(q.trim().toLowerCase())) : vips), [vips, q]);
  if (kanaele === null && !fehler) return null;
  return (
    <Glas className="p-5">
      <h2 className="text-lg font-bold text-white">Your team's POVs</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/45">Set which VIPs may see your players' POVs — even if they don't stream. Players send from "POV" in the browser, with the CompHub POV Windows app, or automatically when they stream in a Discord voice channel.</p>
      {fehler && <div className="mt-3"><FehlerZeile text={fehler} /></div>}
      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {(kanaele ?? []).map((k) => {
          const erl = new Set(k.erlaubt); const gw = (v: Vip) => v.auch.some((i) => erl.has(i));
          const um = (v: Vip) => { const n = new Set(erl); if (gw(v)) v.auch.forEach((i) => n.delete(i)); else v.auch.forEach((i) => n.add(i)); void aendere(k.ident, { erlaubt: [...n] }); };
          const auf = offen === k.ident;
          return (
            <li key={k.ident} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-3">
                {k.bild ? <img src={k.bild} alt="" className="h-12 w-9 rounded-lg object-cover object-top" /> : <span className="grid h-12 w-9 place-items-center rounded-lg bg-white/5 text-lg font-bold text-white/40">{k.spieler.slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold uppercase text-white">{k.spieler}</p><p className="truncate text-[11px] text-white/40">{k.konto}</p></div>
                {k.live ? <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-bold uppercase text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live · {k.zuschauer}</span> : <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase text-white/40">Offline</span>}
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Quality</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">{([['max', 'Max'], ['mittel', 'Medium'], ['niedrig', 'Low']] as const).map(([w, n]) => <button key={w} type="button" onClick={() => void aendere(k.ident, { qualitaet: w })} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${k.qualitaet === w ? 'text-white' : 'border-white/10 text-white/50'}`} style={k.qualitaet === w ? { borderColor: farbe, background: `${farbe}22` } : undefined}>{n}</button>)}</div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Name banner</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void aendere(k.ident, { hud: { an: !k.hud.an } })} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${k.hud.an ? 'border-sky-400 bg-sky-400/10 text-sky-300' : 'border-white/10 text-white/50'}`}>{k.hud.an ? 'On' : 'Off'}</button>
                <select value={k.hud.ort} disabled={!k.hud.an} onChange={(e) => void aendere(k.ident, { hud: { ort: e.target.value } })} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white disabled:opacity-40">{([['unten', 'Bottom'], ['oben', 'Top'], ['links', 'Left'], ['rechts', 'Right']] as const).map(([o, n]) => <option key={o} value={o}>{n}</option>)}</select>
              </div>
              <button type="button" onClick={() => setOffen(auf ? null : k.ident)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/85 hover:border-sky-400/50"><span>Who may watch</span><span className="tabular-nums text-white/40">{vips.filter(gw).length} / {vips.length} {auf ? '▴' : '▾'}</span></button>
              {auf && (
                <div className="mt-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a VIP …" className={feld} />
                  <div className="mt-2 flex gap-3 text-[11px]"><button type="button" className="text-white/50 hover:text-sky-300" onClick={() => void aendere(k.ident, { erlaubt: [...new Set([...k.erlaubt, ...gefiltert.flatMap((v) => v.auch)])] })}>Select all</button><button type="button" className="text-white/50 hover:text-sky-300" onClick={() => void aendere(k.ident, { erlaubt: [] })}>None</button></div>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">{gefiltert.map((v) => <li key={v.ident}><label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ${gw(v) ? 'border-sky-400/50 bg-sky-400/10' : 'border-white/10'}`}><input type="checkbox" checked={gw(v)} onChange={() => um(v)} className="accent-sky-400" /><span className="truncate text-white/85">{v.name}</span></label></li>)}</ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {kanaele && !kanaele.length && <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-white/45">No player of your roster has a pro account with a linked Epic account yet. As soon as the admin unlocks one, their POV shows up here.</p>}
      {ohne.length > 0 && <p className="mt-4 text-[11px] text-white/40">Without a pro account (cannot send yet): {ohne.map((o) => o.name).join(', ')}</p>}
    </Glas>
  );
}

export function OrgKonto() {
  const { wer } = useWer();
  const [adresse] = useSearchParams();
  const orgParam = adresse.get('org') ?? '';
  const [org, setOrg] = useState<KOrg | null>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [frage, setFrage] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [treffer, setTreffer] = useState<Array<{ epicId: string; anzeige: string; bild: string | null }>>([]);
  const antwort = useCallback((j: { ok?: boolean; error?: string; org?: KOrg; fotos?: Record<string, string> }) => {
    if (j.ok && j.org) { setOrg(j.org); setFotos(j.fotos ?? {}); setFehler(null); return true; }
    setMeldung(en(j.error ?? 'That did not work.')); return false;
  }, []);
  useEffect(() => {
    if (!wer?.userName) { setLaedt(false); return undefined; }
    let weg = false;
    fetch(`/api/org-konto${orgParam ? `?org=${encodeURIComponent(orgParam)}` : ''}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (weg) return; if (j.ok) antwort(j); else setFehler(en(j.error ?? 'That did not work.')); }).catch(() => { if (!weg) setFehler('The store is not answering right now.'); }).finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [orgParam, antwort, wer?.userName]);
  useEffect(() => {
    const q = name.trim().toLowerCase(); if (q.length < 2) { setTreffer([]); return undefined; }
    let weg = false;
    const u = setTimeout(() => { fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => { if (!weg) setTreffer(Array.isArray(j?.spieler) ? j.spieler : []); }).catch(() => { if (!weg) setTreffer([]); }); }, 300);
    return () => { weg = true; clearTimeout(u); };
  }, [name]);
  const senden = async (k: Record<string, unknown>) => { setMeldung(null); try { return antwort(await (await fetch('/api/org-konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...k, org: orgParam || undefined }) })).json()); } catch { setMeldung('The store is not answering right now.'); return false; } };
  const hinzu = async (p: { name: string; epicId?: string }) => { if (await senden({ aktion: 'spieler-neu', name: p.name, epicId: p.epicId })) { setName(''); setTreffer([]); } };
  const fotoHoch = async (index: number, s: KSpieler, datei: File) => {
    const form = new FormData(); form.set('datei', datei); form.set('name', s.name); if (orgParam) form.set('org', orgParam);
    try { const j = await (await fetch('/api/org-konto', { method: 'POST', body: form })).json(); if (!j.ok) { setMeldung(en(j.error ?? 'The photo did not work.')); return; } await senden({ aktion: 'spieler-aendern', index, name: s.name, bild: j.bild }); } catch { setMeldung('The store is not answering right now.'); }
  };
  if (!wer) return <Laedt />;
  if (!wer.userName) return <AnmeldeKarte titel="Your team" text="Sign in with the account that manages your organisation." />;
  if (laedt) return <Laedt />;
  if (fehler || !org) return <Leer text={fehler ?? 'This account does not manage an organisation.'} kind={<Link to="/competitive/orgs" className="mt-4 inline-block text-sm font-semibold text-sky-300">All orgs →</Link>} />;
  const farbe = org.farbe ?? '#0ea5e9';
  return (
    <div className="space-y-6">
      <Glas className="relative overflow-hidden p-6 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: farbe }} />
        <div className="relative flex flex-wrap items-center gap-5">
          {org.logo ? <img src={org.logo} alt="" className="h-20 w-20 rounded-2xl bg-black/30 object-contain p-2" /> : <span className="grid h-20 w-20 place-items-center rounded-2xl text-3xl font-black text-white" style={{ background: farbe }}>{org.name.slice(0, 1)}</span>}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: farbe }}>Your team</p>
            <h1 className="truncate text-4xl font-extrabold text-white">{org.name}</h1>
            <p className="mt-1 text-sm text-white/45">{org.spieler.length} players on the roster · <Link to={`/competitive/team/${org.id}`} className="text-sky-300 hover:underline">public team page →</Link></p>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Org colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {FARBEN.map((f) => <button key={f} type="button" aria-label={f} onClick={() => void senden({ aktion: 'farbe', farbe: f })} className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${farbe.toLowerCase() === f ? 'border-white' : 'border-transparent'}`} style={{ background: f }} />)}
              <input type="color" value={farbe} onChange={(e) => void senden({ aktion: 'farbe', farbe: e.target.value })} className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-black/40 p-0.5" />
            </div>
          </div>
        </div>
      </Glas>
      {meldung && <FehlerZeile text={meldung} />}
      <OrgPov orgParam={orgParam} farbe={farbe} />
      <Glas className="p-5">
        <h2 className="text-lg font-bold text-white">Add a player</h2>
        <p className="mt-1 text-xs text-white/45">Type the name — the account is looked up for you.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" className={`${feld} mt-3`} />
        {name.trim().length >= 2 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {treffer.map((x) => <li key={x.epicId}><button type="button" onClick={() => void hinzu({ name: x.anzeige, epicId: x.epicId })} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-2 text-left hover:border-sky-400/50">{x.bild ? <img src={x.bild} alt="" className="h-10 w-[30px] rounded-md object-cover object-top" /> : <span className="h-10 w-[30px] rounded-md bg-white/5" />}<span className="min-w-0 flex-1 truncate text-sm font-bold uppercase text-white">{x.anzeige}</span><span className="text-xs font-bold" style={{ color: farbe }}>+ Add</span></button></li>)}
            <li><button type="button" onClick={() => void hinzu({ name: name.trim() })} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-2 text-left text-sm text-white/70 hover:border-sky-400/50"><span className="grid h-10 w-[30px] place-items-center rounded-md bg-white/5 font-bold">+</span><span className="truncate">Add without account: {name.trim().toUpperCase()}</span></button></li>
          </ul>
        )}
      </Glas>
      {ROLLEN.map(([rolle, titel]) => {
        const reihe = org.spieler.map((s, i) => ({ s, i })).filter((x) => x.s.rolle === rolle);
        if (!reihe.length) return null;
        return (
          <section key={rolle}>
            <h2 className="mb-3 flex items-center gap-3 text-xl font-extrabold text-white"><span className="h-5 w-1 rounded-full" style={{ background: farbe }} />{titel}<span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">{reihe.length}</span></h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {reihe.map(({ s, i }) => {
                const bild = (s.epicId && fotos[s.epicId]) || s.bild || null;
                return (
                  <li key={`${s.epicId ?? s.name}-${i}`} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
                    <div className="relative h-56 bg-[#0a0e18]">
                      {bild ? <><img src={bild} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" /><img src={bild} alt="" className="absolute inset-y-0 right-0 aspect-[4/5] h-full object-cover object-top" /></> : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-4 right-4 truncate text-xl font-extrabold uppercase text-white drop-shadow">{s.name}</span>
                    </div>
                    <div className="grid gap-3 p-4 text-xs">
                      <label className="grid gap-1 text-white/45">Role<select value={s.rolle} onChange={(e) => void senden({ aktion: 'spieler-aendern', index: i, name: s.name, rolle: e.target.value })} className={feld}>{ROLLEN.map(([r, n]) => <option key={r} value={r}>{n}</option>)}</select></label>
                      <label className="grid gap-1 text-white/45">Since<input type="date" defaultValue={s.seit ?? ''} onBlur={(e) => { if ((e.target.value || null) !== s.seit) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, seit: e.target.value }); }} className={feld} /></label>
                      <label className="grid gap-1 text-white/45">X account<input defaultValue={s.x ?? ''} placeholder="@name" onBlur={(e) => { if ((e.target.value || null) !== s.x) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, x: e.target.value }); }} className={feld} /></label>
                      <div className="flex flex-wrap items-center gap-2">
                        {!s.epicId && <label className="cursor-pointer rounded-full border border-white/10 px-3 py-1.5 font-bold text-white/75 hover:border-sky-400/50">Upload photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const d = e.target.files?.[0]; if (d) void fotoHoch(i, s, d); e.target.value = ''; }} /></label>}
                        {s.epicId && <Link to={`/competitive/player/${s.epicId}`} className="rounded-full border border-white/10 px-3 py-1.5 font-bold text-white/75 hover:border-sky-400/50">View profile</Link>}
                        <span className="flex-1" />
                        {frage === i ? <span className="flex items-center gap-2"><button type="button" onClick={() => { setFrage(null); void senden({ aktion: 'spieler-weg', index: i, name: s.name }); }} className="rounded-full bg-rose-500 px-3 py-1.5 font-bold text-white">Really remove</button><button type="button" onClick={() => setFrage(null)} className="px-2 py-1.5 font-bold text-white/50">Cancel</button></span>
                          : <button type="button" onClick={() => setFrage(i)} className="rounded-full px-3 py-1.5 font-bold text-rose-400 hover:bg-rose-500/10">Remove</button>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
