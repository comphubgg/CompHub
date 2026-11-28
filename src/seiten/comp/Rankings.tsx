import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flaeche } from '../../ds/Bausteine';
import { flagge } from '../../teile/Glas';
import { Treppchen, type PodestDaten } from '../../teile/Podest';

/*
 * Power Rankings im Hub, neu komponiert (Design-System 3.0, 28.11.2026). Wofuer die Seite da ist: die Liste. Darum
 *   links    das Podest (Hochkant-Fotokarten) und direkt darunter die ganze Liste - dicht, Name + Flagge (keine Fotos in Zeilen, Betreiber
 *            28.11.: "todeshaesslich, viel zu viel"), Platz, Veraenderung, PR-Wertung, Wertungs-Sprung, Bestwert;
 *            Suche ueber alle 10.000, 50/100/200 je Seite, Blaettern und Sprung auf eine Seite
 *   rechts   klebend: Stand der Liste, Aufsteiger und Absteiger (je 8, mit Foto wenn vorhanden - sonst nichts), Laender der Top 100
 * Daten: /api/power-rankings?uebersicht=1 (Spitze, Aufsteiger, Absteiger, Laender) und ?page=&pageSize=&q= (Liste).
 */

interface S { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; bestwert?: number; deltaPlatz: number; deltaWertung?: number; bild?: string | null }
interface Uebersicht { spitze: S[]; aufsteiger: S[]; absteiger: S[]; laender: Array<{ land: string; n: number }>; total?: number; fetchedAt?: number }
interface Seite { players: S[]; totalPages: number; matched: number; total: number; fetchedAt?: number; ersterPlatz?: number; fehlend?: number }

const name = (s: S) => s.anzeige || s.name;
const z = (n: number) => n.toLocaleString('en');
const landName = (l: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(l.toUpperCase()) ?? l.toUpperCase(); } catch { return l.toUpperCase(); } };
const seit = (ms?: number) => {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

function Pfeil({ d, klein = false }: { d: number; klein?: boolean }) {
  if (!d) return <span className="text-white/20">–</span>;
  return <span className={`zahl font-bold ${klein ? 'text-[11px]' : 'text-xs'} ${d > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d > 0 ? '▲' : '▼'}{z(Math.abs(d))}</span>;
}

/** Aufsteiger oder Absteiger: Foto hochkant nur, wenn es eins gibt (sonst bleibt der Platz leer, nie Buchstaben). */
function Bewegung({ titel, liste, hoch }: { titel: string; liste: S[]; hoch: boolean }) {
  // die Fotospalte nur, wenn wenigstens einer ein Foto hat - sonst stuende dort eine leere Spalte
  const mitFotos = liste.slice(0, 8).some((s) => s.bild);
  return (
    <Flaeche fest className="overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-white/[0.06] px-5 py-3">
        <h2 className={`titel text-2xl ${hoch ? '!text-emerald-300' : '!text-red-300'}`}>{titel}</h2>
        <span className="text-[11px] text-white/40">since the last update</span>
      </div>
      <ul>
        {liste.slice(0, 8).map((s, i) => (
          <motion.li key={s.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.03 }}>
            <Link to={`/competitive/player/${s.id}`} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2 transition hover:bg-white/[0.03]">
              {mitFotos && <span className="flex h-10 w-[30px] shrink-0">{s.bild && <img src={s.bild} alt="" loading="lazy" className="h-10 w-[30px] rounded-md object-cover object-top ring-1 ring-white/10" />}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">{s.land && <img src={flagge(s.land)} alt="" className="h-3 w-[18px] rounded-[2px] object-cover" />}<span className="truncate text-[13px] font-semibold text-white">{name(s)}</span></span>
                <span className="zahl block text-[11px] text-white/40">now #{z(s.rank)} · {z(s.wertung)} pts</span>
              </span>
              <span className={`zahl titel text-2xl ${hoch ? '!text-emerald-400' : '!text-red-400'}`}>{hoch ? '+' : '−'}{z(Math.abs(s.deltaPlatz))}</span>
            </Link>
          </motion.li>
        ))}
        {!liste.length && <li className="px-5 py-4 text-sm text-white/45">No movement since the last update.</li>}
      </ul>
    </Flaeche>
  );
}

export default function Rankings() {
  const [ue, setUe] = useState<Uebersicht | null>(null);
  const [daten, setDaten] = useState<Seite | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [seite, setSeite] = useState(1);
  const [pro, setPro] = useState(100);
  const [q, setQ] = useState('');
  const [sprung, setSprung] = useState('');

  useEffect(() => { fetch('/api/power-rankings?uebersicht=1').then((r) => r.json()).then(setUe).catch(() => {}); }, []);
  useEffect(() => {
    let weg = false;
    setLaedt(true);
    const t = setTimeout(() => {
      fetch(`/api/power-rankings?page=${seite}&pageSize=${pro}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`).then((r) => r.json())
        .then((j) => { if (!weg) setDaten(j); }).catch(() => {}).finally(() => { if (!weg) setLaedt(false); });
    }, q ? 250 : 0);
    return () => { weg = true; clearTimeout(t); };
  }, [seite, pro, q]);

  const maxLand = Math.max(1, ...(ue?.laender ?? []).map((l) => l.n));
  const liste = daten?.players ?? [];
  const seiten = daten?.totalPages ?? 1;
  const springen = () => { const n = Math.round(Number(sprung)); if (n >= 1) { setSeite(Math.min(seiten, n)); setSprung(''); } };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}>
          <p className="ueber">Standings</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">Power Rankings</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-white/55">Epic's single worldwide ranking of competitive players – the top {z(ue?.total ?? daten?.total ?? 10000)}, refreshed daily.</p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
          {(ue?.fetchedAt || daten?.fetchedAt) && <span className="chip zahl">updated {seit(ue?.fetchedAt ?? daten?.fetchedAt)}</span>}
          <span className="chip zahl">{z(ue?.total ?? daten?.total ?? 0)} players</span>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------ Podest */}
          {ue && ue.spitze.length >= 3 && (
            <Treppchen plaetze={ue.spitze.slice(0, 3).map((s, i): PodestDaten => ({
              platz: (i + 1) as 1 | 2 | 3, bild: s.bild, land: s.land, name: name(s), unter: s.name !== name(s) ? s.name : undefined, label: 'PR score', wert: z(s.wertung),
              link: `/competitive/player/${s.id}`, rechts: s.deltaPlatz ? <Pfeil d={s.deltaPlatz} /> : undefined,
              extra: s.deltaWertung ? `${s.deltaWertung > 0 ? '+' : ''}${z(s.deltaWertung)} pts since the last update` : undefined,
            }))} />
          )}

          {/* ------------------------------------------------ Die ganze Liste */}
          <Flaeche fest className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <h2 className="titel text-3xl">All players</h2>
              <span className="zahl text-xs text-white/40">{q.trim() && daten ? `${z(daten.matched)} matches` : daten ? `#${z((seite - 1) * pro + 1)}–${z(Math.min(seite * pro, daten.matched))}` : ''}</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex gap-1">{[50, 100, 200].map((n) => <button key={n} type="button" onClick={() => { setPro(n); setSeite(1); }} className={`chip zahl !py-1 !text-xs ${pro === n ? 'chip-an' : ''}`}>{n}</button>)}</div>
                <input value={q} onChange={(e) => { setQ(e.target.value); setSeite(1); }} placeholder="Search all players…" className="eingabe w-full !py-1.5 sm:w-60" />
              </div>
            </div>
            {!!daten?.fehlend && <p className="border-b border-white/[0.06] px-5 py-2 text-xs text-amber-300/90">Epic only returned places {z(daten.ersterPlatz ?? 1)}+ this time – {z(daten.fehlend)} places are missing.</p>}
            <div className={`transition-opacity ${laedt && daten ? 'opacity-60' : ''}`}>
              <div className="grid grid-cols-[52px_44px_minmax(0,1fr)_86px] items-center gap-2 border-b border-white/[0.07] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:grid-cols-[64px_56px_minmax(0,1fr)_90px_70px_76px] sm:gap-3 sm:px-5">
                <span>Rank</span><span>Δ</span><span>Player</span><span className="text-right">PR score</span><span className="hidden text-right sm:block">Δ pts</span><span className="hidden text-right sm:block">Best</span>
              </div>
              {liste.map((s) => (
                <Link key={s.id || s.rank} to={s.id ? `/competitive/player/${s.id}` : '#'} className="group grid grid-cols-[52px_44px_minmax(0,1fr)_86px] items-center gap-2 border-b border-white/[0.04] px-4 py-1.5 transition hover:bg-white/[0.035] sm:grid-cols-[64px_56px_minmax(0,1fr)_90px_70px_76px] sm:gap-3 sm:px-5">
                  <span className={`titel zahl text-xl ${s.rank === 1 ? '!text-amber-300' : s.rank <= 3 ? '!text-akz' : s.rank <= 10 ? '' : '!text-white/60'}`}>{z(s.rank)}</span>
                  <Pfeil d={s.deltaPlatz} klein />
                  <span className="flex min-w-0 items-center gap-2">
                    {s.land ? <img src={flagge(s.land)} alt="" className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover" /> : <span className="w-[18px] shrink-0" />}
                    <span className="truncate text-[13px] font-semibold text-white transition group-hover:text-akz">{name(s)}</span>
                    {s.anzeige && s.anzeige !== s.name && <span className="hidden truncate text-[11px] text-white/30 md:inline">{s.name}</span>}
                  </span>
                  <span className="flex items-center justify-end gap-2.5">
                    <span className="zahl text-right text-[13px] font-bold text-white">{z(s.wertung)}</span>
                  </span>
                  <span className={`zahl hidden text-right text-xs sm:block ${(s.deltaWertung ?? 0) > 0 ? 'text-emerald-400' : (s.deltaWertung ?? 0) < 0 ? 'text-red-400' : 'text-white/25'}`}>{s.deltaWertung ? `${s.deltaWertung > 0 ? '+' : '−'}${z(Math.abs(s.deltaWertung))}` : '–'}</span>
                  <span className="zahl hidden text-right text-xs text-white/45 sm:block">{s.bestwert ? z(s.bestwert) : '–'}</span>
                </Link>
              ))}
              {!liste.length && <p className="p-10 text-center text-sm text-white/45">{laedt ? 'Loading the ranking …' : q ? `No player found for "${q}".` : 'The ranking is being fetched from Epic – try again in a minute.'}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.06] p-3 text-sm">
              <button type="button" disabled={seite <= 1} onClick={() => setSeite(1)} className="knopf !px-3 !py-1.5">«</button>
              <button type="button" disabled={seite <= 1} onClick={() => setSeite((x) => x - 1)} className="knopf !px-3 !py-1.5">← Prev</button>
              <span className="zahl px-2 text-white/55">Page {z(seite)} / {z(seiten)}</span>
              <button type="button" disabled={seite >= seiten} onClick={() => setSeite((x) => x + 1)} className="knopf !px-3 !py-1.5">Next →</button>
              <form onSubmit={(e) => { e.preventDefault(); springen(); }} className="flex items-center gap-1.5">
                <input value={sprung} onChange={(e) => setSprung(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Page" className="eingabe zahl w-20 !py-1.5 text-center" />
                <button type="submit" className="knopf !px-3 !py-1.5">Go</button>
              </form>
            </div>
          </Flaeche>
        </div>

        {/* ------------------------------------------------ Rand: klebt */}
        <aside className="space-y-6 xl:sticky xl:top-[112px] xl:self-start">
          {ue ? (
            <>
              <Bewegung titel="Climbers" liste={ue.aufsteiger} hoch />
              <Bewegung titel="Fallers" liste={ue.absteiger} hoch={false} />
              {ue.laender.length > 0 && (
                <Flaeche fest className="overflow-hidden">
                  <div className="border-b border-white/[0.06] px-5 py-3"><h2 className="titel text-2xl">Top 100 by country</h2></div>
                  <ul className="space-y-2 px-5 py-4">
                    {ue.laender.map((l, i) => (
                      <li key={l.land} className="grid grid-cols-[18px_110px_minmax(0,1fr)_24px] items-center gap-2.5">
                        <img src={flagge(l.land)} alt="" className="h-3 w-[18px] rounded-[2px] object-cover" />
                        <span className="truncate text-[13px] text-white/80">{landName(l.land)}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/10"><motion.span className="block h-full rounded-full bg-akz" initial={{ width: 0 }} animate={{ width: `${(l.n / maxLand) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.04 }} /></span>
                        <span className="zahl text-right text-sm font-bold text-white">{l.n}</span>
                      </li>
                    ))}
                  </ul>
                </Flaeche>
              )}
            </>
          ) : <div className="fl-fest h-[420px] animate-pulse" />}
        </aside>
      </div>
    </div>
  );
}
