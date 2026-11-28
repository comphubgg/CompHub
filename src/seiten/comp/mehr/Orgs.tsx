import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Bild, Flaeche, Leer, Marke, Segment, Zaehler } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, TeamFlagge, chip, useDaten } from './teile';
import { REGION_FARBE } from '../events/gemeinsam';

/*
 * Orgs im Hub:
 *  - /competitive/orgs: alle Organisationen (/api/orgs) als Rangliste nach Preisgeld - die ersten drei gross mit Logo und den Hochkant-Fotos ihrer
 *    Pros, darunter jede Org als Zeile (Platz, Logo, Region, Kader-Fotos, Preisgeld mit Balken). Suche und Region.
 *  - /competitive/team/:org: die Teamseite (wie /team/[org], /api/team) - Buehne mit Logo und Summen, links der Kader nach Rolle, rechts angedockt
 *    der gewaehlte Spieler mit grossem Foto, allen Werten und den letzten Ergebnissen (statt eines Fensters).
 *  - /competitive/org: "Dein Team" fuer Org-Konten (wie /org, /api/org-konto, /api/org-pov) - Farbe, Spieler hinzufuegen (Suche), Rolle, seit, X,
 *    Foto, entfernen, und die POVs des Teams (Qualitaet, Namensbanner, wer zusehen darf): der Kader als Zeilen zum Bearbeiten, rechts die Werkzeuge.
 * Kein Buchstaben-Ersatz fuer fehlende Logos oder Fotos (Betreiber: "Profilbild oder gar nichts").
 */

type Rolle = 'pro' | 'academy' | 'creator';
const ROLLEN: Array<[Rolle, string]> = [['pro', 'Pro Roster'], ['academy', 'Academy Roster'], ['creator', 'Content Creator']];
const geld = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en')}`);
const zahl = (n: number | null | undefined, s = 0) => (n == null ? '—' : n.toLocaleString('en', { maximumFractionDigits: s, minimumFractionDigits: s }));
const LIQUI = (n: string) => n.replace(/_/g, ' ');
const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];
const kopf2 = (t: string, n?: number | string, farbe?: string) => (
  <div className="mb-3 flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz" style={farbe ? { background: farbe } : undefined} /><h2 className="titel text-3xl">{t}</h2>{n != null && <span className="zahl text-sm font-semibold text-white/35">{n}</span>}<span className="h-px flex-1 bg-white/[0.07]" /></div>
);

/* ---------------------------------------------------------------- Liste */

interface OrgKurz { id: string; name: string; logo: string | null; banner: string | null; farbe: string | null; land: string | null; region: string | null; x: string | null; gesamt?: number; spieler: Array<{ epicId: string | null; name: string; bild: string | null; rolle: Rolle; betrag: number | null; land: string | null }> }

/** Die Hochkant-Fotos der Pros nebeneinander - jeder mit Foto wird gezeigt, wer keines hat, steht als Name daneben. */
function KaderFotos({ o, gross }: { o: OrgKurz; gross?: boolean }) {
  const pros = o.spieler.filter((p) => p.rolle === 'pro');
  // gross (Podest): hoechstens drei - sechs Hochkant-Fotos ragten aus der Karte und lagen auf dem Handy ueber der Summe
  const mit = pros.filter((p) => p.bild).slice(0, gross ? 3 : 5);
  return <span className="flex shrink-0 gap-1">{mit.map((p) => <img key={p.name} src={p.bild!} alt={p.name} title={p.name} loading="lazy" className={`${gross ? 'h-28 w-[84px] rounded-xl' : 'h-11 w-[33px] rounded-lg'} object-cover object-top`} />)}</span>;
}

export function OrgsListe() {
  const [s] = useDaten<{ orgs: OrgKurz[] }>('/api/orgs');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const orgs = useMemo(() => (s.art === 'ok' ? s.d.orgs : []), [s]);
  const regionen = useMemo(() => [...new Set(orgs.map((o) => o.region).filter((r): r is string => !!r))].sort(), [orgs]);
  const sichtbar = useMemo(() => orgs.filter((o) => (!region || o.region === region) && (!q || `${o.name} ${o.spieler.map((p) => p.name).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.gesamt ?? 0) - (a.gesamt ?? 0)), [orgs, q, region]);
  const max = Math.max(1, ...sichtbar.map((o) => o.gesamt ?? 0));
  const podest = !q ? sichtbar.slice(0, 3).filter((o) => o.gesamt) : [];
  const rest = sichtbar.slice(podest.length);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }}>
          <p className="ueber">Teams · ranked by tournament earnings</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">Orgs</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">Every esports organisation in competitive Fortnite — rosters, photos and real tournament earnings.</p>
        </motion.div>
        <div className="flex flex-wrap items-end gap-7">
          {([['Orgs', orgs.length, undefined], ['Players', orgs.reduce((n, o) => n + o.spieler.length, 0), undefined], ['Roster earnings', orgs.reduce((n, o) => n + (o.gesamt ?? 0), 0), geld]] as Array<[string, number, ((n: number) => string) | undefined]>).map(([l, v, f]) => (
            <div key={l} className="text-right"><Zaehler wert={v} format={f} className="titel text-5xl !text-akz" /><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p></div>
          ))}
          <Link to="/competitive/org" className="knopf">Manage your team →</Link>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an org or player …" className="eingabe w-full !py-2 sm:w-72" />
        <div className="ohne-leiste flex max-w-full items-center gap-1.5 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Region</span>
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}>All</button>
          {regionen.map((r) => { const f = REGION_FARBE[r] ?? '#94a3b8'; const an = region === r; return <button key={r} type="button" onClick={() => setRegion(an ? '' : r)} className="chip" style={an ? { background: f, borderColor: f, color: '#04050a' } : { color: f }}>{r}<span className="zahl opacity-60">{orgs.filter((o) => o.region === r).length}</span></button>; })}
        </div>
        <span className="zahl ml-auto text-xs text-white/40">{sichtbar.length} orgs</span>
      </div>
      {s.art === 'laedt' && <Laedt />}
      {s.art === 'fehler' && <FehlerZeile text="The orgs could not be loaded." />}
      {s.art === 'ok' && !sichtbar.length && <Leer text="No org matches the search." />}

      {/* Die ersten drei */}
      {podest.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {podest.map((o, i) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.5 }}>
              <Link to={`/competitive/team/${o.id}`} className="fl-fest fl-klick relative flex h-full flex-col overflow-hidden p-5">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE[i] }} />
                <div className="flex items-start gap-4">
                  <span className="titel text-7xl" style={{ color: MEDAILLE[i] }}>{i + 1}</span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="titel truncate text-4xl">{o.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-white/45">{o.region && <Marke>{o.region}</Marke>}<span>{o.spieler.filter((p) => p.rolle === 'pro').length} pros · {o.spieler.length} on the roster</span></p>
                  </div>
                  {o.logo && <Bild src={o.logo} className="h-16 w-16 shrink-0 rounded-2xl bg-black/40 !object-contain p-1.5" />}
                </div>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                  <div><p className="titel zahl text-5xl !text-emerald-300">{geld(o.gesamt)}</p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Roster earnings</p></div>
                  <KaderFotos o={o} gross />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Alle weiteren als Rangliste */}
      {rest.length > 0 && (
        <Flaeche fest className="overflow-hidden">
          <div className="grid grid-cols-1 2xl:grid-cols-2 2xl:divide-x 2xl:divide-white/[0.06]">
            {[rest.slice(0, Math.ceil(rest.length / 2)), rest.slice(Math.ceil(rest.length / 2))].map((spalte, sp) => (
              <ul key={sp} className="min-w-0">
                {spalte.map((o, j) => {
                  const platz = podest.length + (sp ? Math.ceil(rest.length / 2) : 0) + j + 1;
                  const pros = o.spieler.filter((p) => p.rolle === 'pro');
                  return (
                    <li key={o.id}>
                      <Link to={`/competitive/team/${o.id}`} className="group flex h-[62px] items-center gap-3 border-b border-white/[0.05] px-4 transition hover:bg-akz/[0.07]">
                        <span className="titel w-9 shrink-0 text-2xl !text-white/30">{platz}</span>
                        <span className="grid h-10 w-10 shrink-0 place-items-center">{o.logo && <img src={o.logo} alt="" loading="lazy" className="max-h-10 max-w-10 object-contain" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-white group-hover:text-akz">{o.name}</span>
                          <span className="block truncate text-[11px] text-white/40">{o.region ?? '—'} · {pros.length} pros{o.spieler.length > pros.length ? ` · ${o.spieler.length - pros.length} more` : ''}{!pros.some((p) => p.bild) && pros.length ? ` · ${pros.slice(0, 3).map((p) => p.name).join(', ')}` : ''}</span>
                        </span>
                        <span className="hidden sm:block"><KaderFotos o={o} /></span>
                        <span className="w-28 shrink-0 text-right">
                          <span className={`zahl block text-sm font-bold ${o.gesamt ? 'text-emerald-300' : 'text-white/25'}`}>{o.gesamt ? geld(o.gesamt) : '—'}</span>
                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full bg-emerald-400/70" style={{ width: `${((o.gesamt ?? 0) / max) * 100}%` }} /></span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </Flaeche>
      )}
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
    let weg = false; setD(null); setOffen(null);
    fetch(`/api/team?org=${encodeURIComponent(org)}`).then((r) => r.json()).then((j: TAntwort) => {
      // Nur geratene Epic-Konten: keine Werte zeigen (wie auf der Seite).
      if (j.players) j.players = j.players.map((p) => (p.epicIdConfidence === 'guess' ? { ...p, epicId: null, matches: null, elims: null, damagePerMatch: null, elimsPerMatch: null, earnings: null, powerRank: null, powerPoints: null, recentResults: [] } : p));
      if (!weg) setD(j);
    }).catch(() => { if (!weg) setD({ ok: false, reason: 'down' }); });
    return () => { weg = true; };
  }, [org]);
  const gruppen = useMemo(() => ROLLEN.map(([r, titel]) => ({ titel, liste: (d?.players ?? []).filter((p) => p.role === r).sort((a, b) => (b.earnings ?? -1) - (a.earnings ?? -1) || (a.powerRank ?? 1e9) - (b.powerRank ?? 1e9) || (b.matches ?? -1) - (a.matches ?? -1)) })).filter((g) => g.liste.length), [d]);
  const alle = d?.players ?? [];
  if (!d) return <Laedt text="Loading the team …" />;
  if (!d.ok || !d.org) return <Leer text={d.reason === 'unbekannte Organisation' ? 'This team does not exist on CompHub.' : 'The team cannot be loaded right now.'}><Link to="/competitive/orgs" className="knopf-leer">← All orgs</Link></Leer>;
  const o = d.org; const f = o.colors.primary || 'rgb(var(--akz))';
  const gewaehlt = offen ?? gruppen[0]?.liste[0] ?? null;
  const summe = alle.reduce((n, p) => n + (p.earnings ?? 0), 0);
  const bestePr = Math.min(...alle.map((p) => p.powerRank ?? Infinity));
  const wert = (k: string, v: string) => <div key={k} className="rounded-xl border border-white/[0.06] bg-black/30 px-2 py-2.5 text-center"><dd className="titel zahl text-2xl">{v}</dd><dt className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{k}</dt></div>;
  return (
    <div className="space-y-4">
      {/* Buehne: Logo, Name, Links, Summen */}
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="fl-fest relative isolate overflow-hidden">
        {o.banner && <Bild src={o.banner} className="absolute inset-0 -z-10 h-full w-full opacity-40" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/40" />
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: f }} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5 sm:p-7">
          {o.logo && <img src={o.logo} alt={o.name} className="h-28 w-28 shrink-0 rounded-3xl bg-black/40 object-contain p-2.5" />}
          <div className="min-w-0 flex-1 basis-[280px]">
            <Link to="/competitive/orgs" className="knopf-leer !text-xs">← All orgs</Link>
            <p className="ueber mt-2" style={{ color: f }}>{o.region ?? ''} Team</p>
            <h1 className="titel mt-1 text-6xl sm:text-7xl">{o.name}</h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(o.links).filter(([, v]) => v).map(([k, v]) => <a key={k} href={v!} target="_blank" rel="noreferrer" className="chip capitalize">{k === 'x' ? 'X' : k} ↗</a>)}
            </div>
          </div>
          <div className="flex gap-7">
            {([['Players', String(alle.length)], ['Roster earnings', summe ? geld(summe) : '—'], ['Best PR', Number.isFinite(bestePr) ? `#${zahl(bestePr)}` : '—']] as Array<[string, string]>).map(([l, v]) => (
              <div key={l} className="text-right"><p className="titel zahl text-5xl" style={{ color: l === 'Roster earnings' ? '#6ee7b7' : undefined }}>{v}</p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{l}</p></div>
            ))}
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-start">
        {/* Der Kader nach Rolle */}
        <div className="order-2 min-w-0 space-y-6 xl:order-1">
          {gruppen.map((g) => (
            <section key={g.titel}>
              {kopf2(g.titel, g.liste.length, f)}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {g.liste.map((p, i) => {
                  const an = gewaehlt === p;
                  return (
                    <motion.li key={p.epicId ?? p.name} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: Math.min(i % 6, 6) * 0.04 }}>
                      <button type="button" onClick={() => setOffen(p)} className={`fl-fest fl-klick flex h-[132px] w-full items-stretch gap-3.5 overflow-hidden p-2.5 text-left ${an ? '!border-akz/60' : ''}`} style={an ? { borderColor: f } : undefined}>
                        {p.photo && <img src={p.photo} alt={p.name} loading="lazy" className="h-full w-[84px] shrink-0 rounded-xl object-cover object-top" />}
                        <span className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-1">
                          <span className="flex min-w-0 items-center gap-2"><TeamFlagge groesse={18} laender={[p.country]} /><span className="titel truncate text-3xl">{p.name}</span></span>
                          <span className="grid grid-cols-3 gap-2">
                            {([['Earnings', geld(p.earnings)], ['Matches', zahl(p.matches)], ['PR', p.powerRank ? `#${zahl(p.powerRank)}` : '—']] as Array<[string, string]>).map(([k, v]) => <span key={k} className="min-w-0"><span className="zahl block truncate text-sm font-bold text-white">{v}</span><span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{k}</span></span>)}
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-sm text-white/35">All values from official tournament replays — a dash means no scored games yet.</p>
        </div>

        {/* Der gewaehlte Spieler */}
        {gewaehlt && (
          <motion.aside key={gewaehlt.epicId ?? gewaehlt.name} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="fl-fest order-1 overflow-hidden xl:sticky xl:top-[7.5rem] xl:order-2">
            <div className="flex gap-4 p-4">
              {gewaehlt.photo && <img src={gewaehlt.photo} alt="" className="aspect-[4/5] w-40 shrink-0 rounded-2xl object-cover object-top" />}
              <div className="min-w-0 flex-1 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: f }}>{ROLLEN.find(([r]) => r === gewaehlt.role)?.[1]}{gewaehlt.homeRegion ? ` · ${gewaehlt.homeRegion}` : ''}</p>
                <h3 className="titel mt-1 flex items-center gap-2 text-4xl"><TeamFlagge groesse={24} laender={[gewaehlt.country]} /><span className="truncate">{gewaehlt.name}</span></h3>
                {gewaehlt.since && <p className="zahl mt-1 text-xs text-white/45">with the team since {gewaehlt.since.slice(0, 7)}</p>}
                <p className="titel zahl mt-3 text-4xl !text-emerald-300">{geld(gewaehlt.earnings)}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Earnings</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {gewaehlt.epicId && <Link to={`/competitive/player/${gewaehlt.epicId}`} className="knopf-prim !px-3.5 !py-1.5 !text-xs">Full profile →</Link>}
                  {gewaehlt.x && <a href={`https://x.com/${gewaehlt.x}`} target="_blank" rel="noreferrer" className="chip">X ↗</a>}
                  {gewaehlt.twitch && <a href={`https://twitch.tv/${gewaehlt.twitch}`} target="_blank" rel="noreferrer" className="chip">Twitch ↗</a>}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 border-t border-white/[0.06] p-4">
              {([...(gewaehlt.ftPrPoints != null ? [['FT PR', zahl(gewaehlt.ftPrPoints)], [`FT rank ${gewaehlt.ftPrRegion ?? ''}`.trim(), gewaehlt.ftPrRank ? `#${zahl(gewaehlt.ftPrRank)}` : '—']] : [['Power Ranking', gewaehlt.powerRank ? `#${zahl(gewaehlt.powerRank)}` : '—'], ['PR points', zahl(gewaehlt.powerPoints)]]), ['Matches', zahl(gewaehlt.matches)], ['Elims', zahl(gewaehlt.elims)], ['Elims / match', zahl(gewaehlt.elimsPerMatch, 2)], ['Damage / match', zahl(gewaehlt.damagePerMatch)]] as Array<[string, string]>).map(([k, v]) => wert(k, v))}
            </dl>
            <div className="border-t border-white/[0.06] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Latest results</p>
              {gewaehlt.recentResults?.length ? (
                <ul className="mt-2 text-sm">{gewaehlt.recentResults.slice(0, 5).map((r) => <li key={`${r.date}-${r.event}`} className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-b-0"><span className="min-w-0 truncate text-white/80">{LIQUI(r.event)}</span><span className="zahl shrink-0 text-white/45">{r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''} · <b className="text-emerald-300">{geld(r.prize)}</b></span></li>)}</ul>
              ) : <p className="mt-2 text-sm text-white/40">{gewaehlt.epicId ? 'No results with prize money yet.' : 'Not matched to an Epic account yet — so no stats.'}</p>}
            </div>
          </motion.aside>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Dein Team (Org-Konto) */

interface KSpieler { epicId: string | null; name: string; seit: string | null; rolle: Rolle; x: string | null; bild?: string | null }
interface KOrg { id: string; name: string; logo: string | null; farbe?: string | null; spieler: KSpieler[] }
interface Kanal { ident: string; spieler: string; konto: string; bild: string | null; live: boolean; zuschauer: number; qualitaet: 'max' | 'mittel' | 'niedrig'; hud: { an: boolean; ort: 'oben' | 'unten' | 'links' | 'rechts'; mitBild: boolean; text: string }; erlaubt: string[] }
interface Vip { ident: string; name: string; auch: string[] }
const FARBEN = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#94a3b8'];
const feld = 'eingabe w-full !py-2';
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
    <Flaeche fest className="overflow-hidden">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-3"><span className="h-4 w-1 rounded-full" style={{ background: farbe }} /><h2 className="titel text-xl">Your team's POVs</h2>{kanaele && <span className="zahl text-xs font-semibold text-white/40">{kanaele.filter((k) => k.live).length} live · {kanaele.length}</span>}</div>
        <p className="mt-2 text-xs leading-relaxed text-white/45">Set which VIPs may see your players' POVs — even if they don't stream. Players send from "POV" in the browser, with the CompHub POV Windows app, or automatically when they stream in a Discord voice channel.</p>
        {fehler && <div className="mt-3"><FehlerZeile text={fehler} /></div>}
      </div>
      <ul>
        {(kanaele ?? []).map((k) => {
          const erl = new Set(k.erlaubt); const gw = (v: Vip) => v.auch.some((i) => erl.has(i));
          const um = (v: Vip) => { const n = new Set(erl); if (gw(v)) v.auch.forEach((i) => n.delete(i)); else v.auch.forEach((i) => n.add(i)); void aendere(k.ident, { erlaubt: [...n] }); };
          const auf = offen === k.ident;
          return (
            <li key={k.ident} className="border-b border-white/[0.06] p-4 last:border-b-0">
              <div className="flex items-center gap-3">
                {k.bild && <img src={k.bild} alt="" className="h-12 w-9 rounded-lg object-cover object-top" />}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold uppercase text-white">{k.spieler}</p><p className="truncate text-[11px] text-white/40">{k.konto}</p></div>
                {k.live ? <Marke ton="rot" puls>Live · {k.zuschauer}</Marke> : <Marke>Offline</Marke>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Quality</span>
                  <Segment id={`orgpov-q-${k.ident}`} klein wert={k.qualitaet} onWahl={(w) => void aendere(k.ident, { qualitaet: w })} wahl={[{ k: 'max', titel: 'Max' }, { k: 'mittel', titel: 'Medium' }, { k: 'niedrig', titel: 'Low' }]} /></span>
                <span className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Name banner</span>
                  <button type="button" onClick={() => void aendere(k.ident, { hud: { an: !k.hud.an } })} className={`chip !py-1 ${k.hud.an ? 'chip-an' : ''}`}>{k.hud.an ? 'On' : 'Off'}</button>
                  {k.hud.an && <Segment id={`orgpov-o-${k.ident}`} klein wert={k.hud.ort} onWahl={(w) => void aendere(k.ident, { hud: { ort: w } })} wahl={[{ k: 'unten', titel: 'Bottom' }, { k: 'oben', titel: 'Top' }, { k: 'links', titel: 'Left' }, { k: 'rechts', titel: 'Right' }]} />}</span>
              </div>
              <button type="button" onClick={() => setOffen(auf ? null : k.ident)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs font-bold text-white/85 transition hover:border-akz/50"><span>Who may watch</span><span className="zahl text-white/40">{vips.filter(gw).length} / {vips.length} {auf ? '▴' : '▾'}</span></button>
              {auf && (
                <div className="mt-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a VIP …" className={feld} />
                  <div className="mt-2 flex gap-3 text-[11px]"><button type="button" className="text-white/50 hover:text-akz" onClick={() => void aendere(k.ident, { erlaubt: [...new Set([...k.erlaubt, ...gefiltert.flatMap((v) => v.auch)])] })}>Select all</button><button type="button" className="text-white/50 hover:text-akz" onClick={() => void aendere(k.ident, { erlaubt: [] })}>None</button></div>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">{gefiltert.map((v) => <li key={v.ident}><label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ${gw(v) ? 'border-akz/50 bg-akz/10' : 'border-white/[0.08]'}`}><input type="checkbox" checked={gw(v)} onChange={() => um(v)} className="accent-akz" /><span className="truncate text-white/85">{v.name}</span></label></li>)}</ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {kanaele && !kanaele.length && <p className="px-4 py-5 text-center text-sm text-white/45">No player of your roster has a pro account with a linked Epic account yet. As soon as the admin unlocks one, their POV shows up here.</p>}
      {ohne.length > 0 && <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] text-white/40">Without a pro account (cannot send yet): {ohne.map((o) => o.name).join(', ')}</p>}
    </Flaeche>
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
  if (fehler || !org) return <Leer text={fehler ?? 'This account does not manage an organisation.'}><Link to="/competitive/orgs" className="knopf-leer">All orgs →</Link></Leer>;
  const farbe = org.farbe ?? '#0ea5e9';
  return (
    <div className="-mt-2 space-y-3">
      {/* Kopfband: Logo, Name, Farbe */}
      <header className="fl-fest relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden p-3 pr-5">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: farbe }} />
        {org.logo && <img src={org.logo} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-black/40 object-contain p-2" />}
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="ueber" style={{ color: farbe }}>Your team</p>
          <h1 className="titel mt-0.5 truncate text-5xl">{org.name}</h1>
          <p className="mt-1 text-xs text-white/45"><span className="zahl">{org.spieler.length}</span> players on the roster · <Link to={`/competitive/team/${org.id}`} className="text-akz hover:underline">public team page →</Link></p>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Org colour</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FARBEN.map((f) => <button key={f} type="button" aria-label={f} onClick={() => void senden({ aktion: 'farbe', farbe: f })} className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${farbe.toLowerCase() === f ? 'border-white' : 'border-transparent'}`} style={{ background: f }} />)}
            <input type="color" value={farbe} onChange={(e) => void senden({ aktion: 'farbe', farbe: e.target.value })} className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-black/40 p-0.5" />
          </div>
        </div>
      </header>
      {meldung && <FehlerZeile text={meldung} />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
        {/* Der Kader zum Bearbeiten */}
        <div className="min-w-0 space-y-5">
          {ROLLEN.map(([rolle, titel]) => {
            const reihe = org.spieler.map((s, i) => ({ s, i })).filter((x) => x.s.rolle === rolle);
            if (!reihe.length) return null;
            return (
              <section key={rolle}>
                {kopf2(titel, reihe.length, farbe)}
                <Flaeche fest className="overflow-hidden">
                  <ul>
                    {reihe.map(({ s, i }) => {
                      const bild = (s.epicId && fotos[s.epicId]) || s.bild || null;
                      return (
                        <li key={`${s.epicId ?? s.name}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-white/[0.06] p-3 last:border-b-0">
                          <span className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
                            {bild && <img src={bild} alt="" className="h-16 w-12 shrink-0 rounded-xl object-cover object-top" />}
                            <span className="min-w-0"><span className="titel block truncate text-3xl">{s.name}</span>
                              {s.epicId ? <Link to={`/competitive/player/${s.epicId}`} className="knopf-leer !text-xs">View profile →</Link>
                                : <label className="knopf-leer cursor-pointer !text-xs">Upload photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const d = e.target.files?.[0]; if (d) void fotoHoch(i, s, d); e.target.value = ''; }} /></label>}
                            </span>
                          </span>
                          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Role
                            <span className="normal-case tracking-normal"><Segment id={`org-rolle-${i}`} klein wert={s.rolle} onWahl={(r) => void senden({ aktion: 'spieler-aendern', index: i, name: s.name, rolle: r })} wahl={[{ k: 'pro', titel: 'Pro' }, { k: 'academy', titel: 'Academy' }, { k: 'creator', titel: 'Creator' }]} /></span></label>
                          <label className="grid w-36 gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Since<input type="date" defaultValue={s.seit ?? ''} onBlur={(e) => { if ((e.target.value || null) !== s.seit) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, seit: e.target.value }); }} className={`${feld} !py-1.5 !text-xs normal-case tracking-normal`} /></label>
                          <label className="grid w-40 gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">X account<input defaultValue={s.x ?? ''} placeholder="@name" onBlur={(e) => { if ((e.target.value || null) !== s.x) void senden({ aktion: 'spieler-aendern', index: i, name: s.name, x: e.target.value }); }} className={`${feld} !py-1.5 !text-xs normal-case tracking-normal`} /></label>
                          {frage === i ? <span className="flex items-center gap-2 text-xs"><button type="button" onClick={() => { setFrage(null); void senden({ aktion: 'spieler-weg', index: i, name: s.name }); }} className="rounded-full bg-rose-500 px-3 py-1.5 font-bold text-white">Really remove</button><button type="button" onClick={() => setFrage(null)} className="px-2 py-1.5 font-bold text-white/50">Cancel</button></span>
                            : <button type="button" onClick={() => setFrage(i)} className="rounded-full px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10">Remove</button>}
                        </li>
                      );
                    })}
                  </ul>
                </Flaeche>
              </section>
            );
          })}
          {!org.spieler.length && <Leer text="No player on the roster yet — add the first one on the right." />}
        </div>
        {/* Werkzeuge: Spieler hinzufuegen, POVs */}
        <div className="min-w-0 space-y-3 xl:sticky xl:top-[7.5rem]">
          <Flaeche fest className="p-4">
            <div className="flex items-center gap-3"><span className="h-4 w-1 rounded-full" style={{ background: farbe }} /><h2 className="titel text-xl">Add a player</h2></div>
            <p className="mt-2 text-xs text-white/45">Type the name — the account is looked up for you.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" className={`${feld} mt-3`} />
            {name.trim().length >= 2 && (
              <ul className="mt-3 grid gap-2">
                {treffer.map((x) => <li key={x.epicId}><button type="button" onClick={() => void hinzu({ name: x.anzeige, epicId: x.epicId })} className="flex h-14 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-2 text-left transition hover:border-akz/50">{x.bild && <img src={x.bild} alt="" className="h-10 w-[30px] rounded-md object-cover object-top" />}<span className="min-w-0 flex-1 truncate text-sm font-bold uppercase text-white">{x.anzeige}</span><span className="text-xs font-bold" style={{ color: farbe }}>+ Add</span></button></li>)}
                <li><button type="button" onClick={() => void hinzu({ name: name.trim() })} className="flex h-14 w-full items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 text-left text-sm text-white/70 transition hover:border-akz/50"><span className="truncate">+ Add without account: {name.trim().toUpperCase()}</span></button></li>
              </ul>
            )}
          </Flaeche>
          <OrgPov orgParam={orgParam} farbe={farbe} />
        </div>
      </div>
    </div>
  );
}
