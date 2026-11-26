import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Glas, Titel, flagge } from '../../teile/Glas';
import { Fehler, Laedt, geld } from './tools/Gemeinsam';

/*
 * FNCS im Hub - wie /fncs der echten Seite: Endspiele (/api/fncs-ereignisse: Grand Finals, Global Championships, Invitational, Summit mit den
 * besten fuenf Teams, Punkten, Siegen, Elims, Preisgeld) und All-Time (/api/fncs-alltime: Titel je Spieler und Land, All-Time-Leaderboard und
 * Rekorde der Grand Finals, Eliminierungen je Grand Final). Das Cup-Bild nur einmal (im Aufmacher) - die Bilder wiederholen sich je Event-Art.
 */

interface SpS { name: string; land: string | null; bild?: string | null }
interface Spitze { rang: number; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null; preis?: string; spieler: SpS[] }
interface Ereignis { key: string; saison: string; saisonKurz: string; saisonTitel: string | null; kopf1: string; kopf2: string; titel: string; datum: number | null; lan: boolean; ort: string | null; region: string; regionCode: string; preisgeld: string | null; bild: string | null; teams?: number; spitze: Spitze[] }
interface Ev { key: string; titel: string; saison: string; saisonKurz: string; saisonName: string }
interface SpA { id: string; name: string; land: string | null; bild: string | null; gesamt: number; je: Record<string, number> }
interface RekordZeile { event: string; wert: number; spieler: Array<{ name: string; land: string | null }> }
interface Rekorde { ab: string; spieler: Array<{ name: string; land: string | null; punkte: number; siege: number; elims: number; finals: number }>; punkte: RekordZeile[]; siege: RekordZeile[]; elims: RekordZeile[]; fehlend?: number }
interface AllTime { events: Ev[]; spieler: SpA[]; ab: string; titel: Array<{ id: string; name: string; land: string | null; titel: number }>; laender: Array<{ land: string; titel: number }>; rekorde: Rekorde | null }

const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];
const landName = (c: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase()) ?? c; } catch { return c; } };
const datum = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** "$400K" / "$1.2M" -> Zahl. */
const betrag = (s?: string | null) => { const m = /\$?([\d.,]+)\s*([KM])?/i.exec(s ?? ''); if (!m) return 0; const n = parseFloat(m[1].replace(/,/g, '')); return n * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1); };
const namen = (sp: SpS[]) => sp.map((s) => s.name).join(' · ');

function Zahl({ wert, format = (n: number) => Math.round(n).toLocaleString('en') }: { wert: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const sicht = useInView(ref, { once: true });
  useEffect(() => {
    if (!sicht || !ref.current) return undefined;
    const c = animate(0, wert, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); } });
    return () => c.stop();
  }, [sicht, wert, format]);
  return <span ref={ref}>{format(0)}</span>;
}

function Flaggen({ sp, gross = false }: { sp: Array<{ land: string | null }>; gross?: boolean }) {
  const l = [...new Set(sp.map((s) => s.land).filter(Boolean))] as string[];
  return <span className="flex shrink-0 -space-x-1">{l.map((x) => <img key={x} src={flagge(x)} alt="" className={`${gross ? 'h-5 w-5' : 'h-4 w-4'} rounded-full object-cover ring-2 ring-[#0b0f19]`} />)}</span>;
}

function Chip({ an, children, onClick }: { an: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-400 text-[#06080f]' : 'border border-white/10 text-white/55 hover:border-sky-400/50 hover:text-white'}`}>{children}</button>
  );
}

/* --- Events --- */

/** Das juengste Endspiel gross: Bild, Treppchen mit Fotos, Plaetze 4-5. */
function Aufmacher({ e }: { e: Ereignis }) {
  const [p1, p2, p3] = e.spitze;
  const stufe = (p: Spitze | undefined, platz: number, hoehe: string, i: number) => p && (
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex min-w-0 flex-1 flex-col items-center">
      {/* Fotos als Hochkant-Rechtecke nebeneinander - nur wenn jeder Spieler des Teams eines hat. */}
      {p.spieler.every((s) => s.bild) ? (
        <div className="flex gap-1.5">
          {p.spieler.map((s) => <img key={s.name} src={s.bild!} alt="" className={`${platz === 1 ? 'h-28 w-20' : 'h-20 w-[3.75rem]'} rounded-lg border-2 object-cover object-top shadow-xl`} style={{ borderColor: MEDAILLE[platz - 1] }} />)}
        </div>
      ) : <div className={platz === 1 ? 'h-28' : 'h-20'} />}
      <p className="mt-3 flex max-w-full items-center gap-1.5 truncate text-center text-sm font-extrabold uppercase text-white"><Flaggen sp={p.spieler} />{namen(p.spieler)}</p>
      <p className="text-xs tabular-nums text-white/50">{p.punkte != null ? `${p.punkte} pts` : ''}{p.elims != null ? ` · ${p.elims} elims` : ''}{p.preis ? ` · ${p.preis}` : ''}</p>
      <div className={`mt-3 w-full rounded-t-2xl border-x border-t border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent ${hoehe} grid place-items-start justify-center pt-3`}>
        <span className="text-4xl font-black" style={{ color: MEDAILLE[platz - 1] }}>{platz}</span>
      </div>
    </motion.div>
  );
  return (
    <Glas className="relative overflow-hidden">
      {e.bild && <img src={e.bild} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06080f] via-[#06080f]/85 to-[#06080f]/40" />
      <div className="relative grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:p-10">
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-400 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#06080f]">Latest final</span>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${e.lan ? 'border-amber-300/40 text-amber-300' : 'border-white/15 text-white/60'}`}>{e.lan ? 'LAN' : 'Online'}</span>
            <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/60">{e.region}</span>
          </div>
          <p className="mt-6 text-6xl font-black tracking-tight text-white">{e.kopf1}</p>
          <p className="text-2xl font-extrabold tracking-[0.12em] text-sky-300">{e.kopf2}</p>
          <p className="mt-2 text-sm text-white/50">{[e.saisonTitel, datum(e.datum), e.ort].filter(Boolean).join(' · ')}</p>
          <div className="mt-auto grid grid-cols-3 gap-4 pt-8">
            {[['Prize pool', e.preisgeld ?? '—'], ['Teams', e.teams ? String(e.teams) : '—'], ['Winner elims', p1?.elims != null ? String(p1.elims) : '—']].map(([t, v]) => (
              <div key={t}><p className="text-3xl font-extrabold tabular-nums text-white">{v}</p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{t}</p></div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-end gap-3">{stufe(p2, 2, 'h-20', 1)}{stufe(p1, 1, 'h-32', 0)}{stufe(p3, 3, 'h-14', 2)}</div>
          <div className="mt-1 space-y-1 rounded-2xl border border-white/10 bg-black/30 p-2">
            {e.spitze.slice(3).map((p) => (
              <div key={p.rang} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm">
                <span className="w-6 font-black tabular-nums text-white/40">{p.rang}</span><Flaggen sp={p.spieler} />
                <span className="min-w-0 flex-1 truncate font-bold uppercase text-white/90">{namen(p.spieler)}</span>
                <span className="tabular-nums text-white/50">{p.punkte != null ? `${p.punkte} pts` : ''}</span>
                <span className="w-16 text-right font-bold tabular-nums text-emerald-300">{p.preis ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Glas>
  );
}

function EventKarte({ e, i }: { e: Ereignis; i: number }) {
  const [auf, setAuf] = useState(false);
  const global = e.regionCode === 'GLOBAL';
  return (
    <motion.article layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden rounded-3xl border bg-white/[0.035] p-5 backdrop-blur-xl ${global ? 'border-amber-300/25' : 'border-white/10'}`}>
      <span aria-hidden className={`pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full blur-3xl transition-opacity group-hover:opacity-100 ${global ? 'bg-amber-400/15 opacity-70' : 'bg-sky-500/15 opacity-50'}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-black tracking-tight text-white">{e.kopf1}</p>
          <p className={`text-xs font-extrabold tracking-[0.18em] ${global ? 'text-amber-300' : 'text-sky-300'}`}>{e.kopf2}</p>
          <p className="mt-1 text-[11px] text-white/40">{[datum(e.datum), e.lan ? 'LAN' : 'Online', e.region].filter(Boolean).join(' · ')}</p>
        </div>
        {e.preisgeld && <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-sm font-extrabold tabular-nums text-emerald-300">{e.preisgeld}</span>}
      </div>
      <ol className="relative mt-4 space-y-1">
        {e.spitze.slice(0, auf ? 5 : 3).map((p) => (
          <li key={p.rang} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${p.rang === 1 ? 'bg-white/[0.05]' : ''}`}>
            <span className="w-5 text-center text-sm font-black" style={{ color: MEDAILLE[p.rang - 1] ?? 'rgba(255,255,255,0.35)' }}>{p.rang}</span>
            <Flaggen sp={p.spieler} />
            <span className={`min-w-0 flex-1 truncate text-[13px] font-bold uppercase ${p.rang === 1 ? 'text-white' : 'text-white/75'}`}>{namen(p.spieler)}</span>
            <span className="text-[11px] tabular-nums text-white/40">{p.punkte != null ? `${p.punkte}` : p.preis ?? ''}</span>
          </li>
        ))}
      </ol>
      {e.spitze.length > 3 && <button type="button" onClick={() => setAuf(!auf)} className="relative mt-2 text-[11px] font-semibold text-sky-300/80 hover:text-sky-300">{auf ? 'Top 3' : `Top ${e.spitze.length}`}</button>}
    </motion.article>
  );
}

/* --- All-Time --- */

function Liste({ titel, unter, children, verz = 0 }: { titel: string; unter?: string; children: React.ReactNode; verz?: number }) {
  return (
    <Glas className="flex max-h-[560px] flex-col overflow-hidden" verzoegerung={verz}>
      <div className="flex items-baseline justify-between border-b border-white/5 px-5 py-4"><h3 className="font-bold text-white">{titel}</h3>{unter && <span className="text-[11px] text-white/40">{unter}</span>}</div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </Glas>
  );
}

function Rekord({ titel, einheit, zeilen }: { titel: string; einheit: string; zeilen: RekordZeile[] }) {
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  return (
    <Glas className="p-5">
      <h3 className="font-bold text-white">{titel}</h3>
      <p className="text-[11px] text-white/40">Best single Grand Final</p>
      <ol className="mt-4 space-y-3">
        {zeilen.slice(0, 6).map((z, i) => (
          <li key={`${z.event}-${i}`}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-sm font-black" style={{ color: MEDAILLE[i] ?? 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
              <Flaggen sp={z.spieler} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{z.spieler.map((s) => s.name).join(' · ')}</span>
              <span className="text-sm font-extrabold tabular-nums text-white">{z.wert.toLocaleString('en')}<span className="ml-1 text-[10px] font-semibold text-white/40">{einheit}</span></span>
            </div>
            <div className="ml-7 mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400" initial={{ width: 0 }} whileInView={{ width: `${(z.wert / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.06 }} /></div>
              <span className="text-[10px] text-white/35">{z.event}</span>
            </div>
          </li>
        ))}
      </ol>
    </Glas>
  );
}

const zellFarbe = (v: number) => (v >= 20 ? 'bg-sky-400 text-[#06080f]' : v >= 12 ? 'bg-sky-600 text-white' : v >= 8 ? 'bg-sky-800 text-sky-50' : v >= 4 ? 'bg-sky-950 text-sky-200 ring-1 ring-inset ring-sky-800/60' : 'bg-white/[0.06] text-white/45');

function AllTimeAnsicht({ alt, liste }: { alt: AllTime; liste: Ereignis[] }) {
  const [suche, setSuche] = useState('');
  const [sort, setSort] = useState('gesamt');
  const [mehr, setMehr] = useState(false);
  const r = alt.rekorde;
  const maxLand = Math.max(1, ...alt.laender.map((l) => l.titel));

  // Preisgeld aus den Top-5-Plaetzen aller Endspiele, je Spieler gleich durch das Team geteilt.
  const geldListe = useMemo(() => {
    const m = new Map<string, { name: string; land: string | null; summe: number; plaetze: number; siege: number }>();
    for (const e of liste) for (const p of e.spitze) {
      const b = betrag(p.preis); if (!b || !p.spieler.length) continue;
      for (const s of p.spieler) {
        const k = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const x = m.get(k) ?? { name: s.name, land: s.land, summe: 0, plaetze: 0, siege: 0 };
        x.summe += b / p.spieler.length; x.plaetze += 1; if (p.rang === 1) x.siege += 1; if (!x.land && s.land) x.land = s.land;
        m.set(k, x);
      }
    }
    return [...m.values()].sort((a, b) => b.summe - a.summe);
  }, [liste]);
  const maxGeld = Math.max(1, geldListe[0]?.summe ?? 1);

  const zeilen = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const best = (s: SpA) => Math.max(0, ...Object.values(s.je));
    return [...alt.spieler]
      .sort(sort === 'gesamt' ? (a, b) => b.gesamt - a.gesamt || best(b) - best(a) : sort === 'best' ? (a, b) => best(b) - best(a) || b.gesamt - a.gesamt : (a, b) => (b.je[sort] ?? -1) - (a.je[sort] ?? -1) || b.gesamt - a.gesamt)
      .map((s, i) => ({ ...s, platz: i + 1 }))
      .filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [alt, sort, suche]);
  const sichtbar = mehr || suche ? zeilen : zeilen.slice(0, 30);
  const [t1, t2, t3] = alt.titel;
  const bildVon = (name: string) => alt.spieler.find((s) => s.name.toLowerCase() === name.toLowerCase())?.bild ?? null;

  return (
    <div className="space-y-8">
      {/* Meiste Titel - Treppchen */}
      {t1 && (
        <div className="grid grid-cols-3 items-end gap-5">
          {[t2, t1, t3].map((t, j) => t && (() => {
            const platz = j === 1 ? 1 : j === 0 ? 2 : 3; const bild = bildVon(t.name);
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: platz === 1 ? 0.1 : 0.25 }} whileHover={{ y: -6 }}
                className={`relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18] ${platz === 1 ? 'h-[330px]' : 'h-[290px]'}`}>
                {bild ? <>{/* Hochkant-Foto rechts in voller Hoehe, links unscharfer Abglanz (Betreiber: Fotos nicht in die Breite ziehen) */}
                  <img src={bild} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" />
                  <img src={bild} alt="" className="absolute inset-y-0 right-0 aspect-[4/5] h-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0a0e18] from-30% via-[#0a0e18]/70 via-50% to-transparent to-75%" /></>
                  : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-transparent"><span className="text-8xl font-black text-white/10">{t.name.slice(0, 1)}</span></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/40 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: MEDAILLE[platz - 1] }} />
                {t.land && <img src={flagge(t.land)} alt="" className="absolute right-5 top-5 h-9 w-9 rounded-full object-cover ring-2 ring-white/30" />}
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">FNCS titles</p>
                  <p className="text-5xl font-black tabular-nums" style={{ color: MEDAILLE[platz - 1] }}><Zahl wert={t.titel} /></p>
                  <p className="mt-1 text-xl font-extrabold uppercase text-white">{t.name}</p>
                </div>
              </motion.div>
            );
          })())}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        <Liste titel="FNCS winners" unter="titles" verz={0.1}>
          <ol>{alt.titel.map((s, i) => (
            <li key={`${s.id}-${i}`} className="flex items-center gap-2.5 border-b border-white/[0.04] px-5 py-2 hover:bg-white/[0.03]">
              <span className="w-6 text-right text-[11px] font-black tabular-nums text-white/35">{i + 1}</span>
              {s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4 rounded-full bg-white/10" />}
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{s.name}</span>
              <span className="text-sm font-black tabular-nums text-amber-300">{s.titel}</span>
            </li>
          ))}</ol>
        </Liste>
        <Liste titel="All-time leaderboard" unter={r ? `since ${r.ab}` : ''} verz={0.15}>
          {r ? (
            <table className="w-full text-sm">
              <thead><tr className="sticky top-0 bg-[#0d121c] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                <th className="w-10 px-4 py-2">#</th><th className="px-2 py-2">Player</th><th className="px-2 py-2 text-right">Pts</th><th className="px-2 py-2 text-right">VR</th><th className="px-4 py-2 text-right">Elims</th></tr></thead>
              <tbody>{r.spieler.map((s, i) => (
                <tr key={`${s.name}-${i}`} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 text-[11px] font-bold tabular-nums text-white/35">{i + 1}</td>
                  <td className="px-2 py-2"><span className="flex items-center gap-2">{s.land && <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" />}<span className="truncate text-[13px] font-bold uppercase text-white">{s.name}</span></span></td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-white">{s.punkte.toLocaleString('en')}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-white/60">{s.siege}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-white/60">{s.elims}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="p-5 text-xs text-white/40">Not available right now.</p>}
        </Liste>
        <Liste titel="Prize money" unter="top-5 finishes · team prize split" verz={0.2}>
          <ol>{geldListe.slice(0, 60).map((s, i) => (
            <li key={`${s.name}-${i}`} className="border-b border-white/[0.04] px-5 py-2 hover:bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <span className="w-6 text-right text-[11px] font-black tabular-nums text-white/35">{i + 1}</span>
                {s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4 rounded-full bg-white/10" />}
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{s.name}</span>
                <span className="text-sm font-black tabular-nums text-emerald-300">{geld(s.summe)}</span>
              </div>
              <div className="ml-[2.1rem] mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full bg-emerald-400/70" initial={{ width: 0 }} whileInView={{ width: `${(s.summe / maxGeld) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div>
            </li>
          ))}</ol>
        </Liste>
        <Liste titel="Nationalities" unter="titles by country" verz={0.25}>
          <ol className="space-y-2.5 p-5">{alt.laender.map((l) => (
            <li key={l.land} className="flex items-center gap-2.5">
              <img src={flagge(l.land)} alt="" className="h-5 w-5 rounded-full object-cover" />
              <span className="w-28 truncate text-sm text-white/80">{landName(l.land)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-amber-300" initial={{ width: 0 }} whileInView={{ width: `${(l.titel / maxLand) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div>
              <span className="w-6 text-right text-sm font-bold tabular-nums text-white">{l.titel}</span>
            </li>
          ))}</ol>
        </Liste>
      </div>

      {r && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">Grand Finals records</p>
          <div className="mt-3 grid gap-5 lg:grid-cols-3">
            <Rekord titel="Most points" einheit="pts" zeilen={r.punkte} />
            <Rekord titel="Most Victory Royales" einheit="VR" zeilen={r.siege} />
            <Rekord titel="Most eliminations" einheit="elims" zeilen={r.elims} />
          </div>
          {(r.fehlend ?? 0) > 0 && <p className="mt-2 text-[11px] text-white/35">{r.fehlend} finals are missing right now (Epic not answering) – sums may be too small.</p>}
        </div>
      )}

      {/* Eliminierungen je Grand Final */}
      <Glas className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-4 border-b border-white/5 p-5">
          <div>
            <h3 className="text-lg font-bold text-white">Eliminations in the Grand Finals</h3>
            <p className="text-xs text-white/45">Europe, both final days combined. Epic counts elims per team – in duos and trios each player shows the team's number. Since {alt.ab}.</p>
          </div>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…"
            className="ml-auto w-64 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
              <th className="w-12 px-4 py-3 text-left">#</th><th className="px-2 py-3 text-left">Player</th>
              <th className="px-2 py-3 text-right"><button type="button" onClick={() => setSort('gesamt')} className={sort === 'gesamt' ? 'text-sky-300' : 'hover:text-white'}>Total</button></th>
              <th className="px-2 py-3 text-right"><button type="button" onClick={() => setSort('best')} className={sort === 'best' ? 'text-sky-300' : 'hover:text-white'}>Best</button></th>
              {alt.events.map((ev) => (
                <th key={ev.key} className="px-1 py-3 text-center"><button type="button" title={ev.saisonName} onClick={() => setSort(ev.key)} className={`whitespace-nowrap ${sort === ev.key ? 'text-sky-300' : 'hover:text-white'}`}>{ev.saisonKurz}</button></th>
              ))}
            </tr></thead>
            <tbody>{sichtbar.map((s) => (
              <tr key={s.id} className="border-t border-white/[0.04] hover:bg-sky-400/[0.05]">
                <td className="px-4 py-1.5 text-[11px] font-bold tabular-nums text-white/35">{s.platz}</td>
                <td className="px-2 py-1.5"><span className="flex items-center gap-2">{s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4 rounded-full bg-white/10" />}<span className="whitespace-nowrap text-[13px] font-bold uppercase text-white">{s.name}</span></span></td>
                <td className="px-2 py-1.5 text-right font-black tabular-nums text-white">{s.gesamt}</td>
                <td className="px-2 py-1.5 text-right text-xs tabular-nums text-sky-300">{Math.max(0, ...Object.values(s.je))}</td>
                {alt.events.map((ev) => {
                  const v = s.je[ev.key];
                  return <td key={ev.key} className="px-1 py-1.5 text-center">{v === undefined ? <span className="text-white/15">–</span> : <span className={`inline-block min-w-[2.2rem] rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${zellFarbe(v)}`}>{v}</span>}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!suche && zeilen.length > 30 && (
          <button type="button" onClick={() => setMehr(!mehr)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-sky-300/80 hover:bg-white/[0.03] hover:text-sky-300">{mehr ? 'Show top 30' : `Show all ${zeilen.length} players`}</button>
        )}
      </Glas>
    </div>
  );
}

export default function Fncs() {
  const [reiter, setReiter] = useState<'events' | 'alltime'>(() => (new URLSearchParams(window.location.search).get('reiter') === 'alltime' ? 'alltime' : 'events'));
  const [liste, setListe] = useState<Ereignis[] | null>(null);
  const [alt, setAlt] = useState<AllTime | null>(null);
  const [fehler, setFehler] = useState('');
  const [art, setArt] = useState<'alle' | 'lan' | 'online'>('alle');
  const [region, setRegion] = useState('');
  useEffect(() => {
    fetch('/api/fncs-ereignisse').then((r) => r.json()).then((j) => { if (j?.ok) setListe(j.ereignisse); else setFehler('The finals could not be loaded right now.'); }).catch(() => setFehler('The finals could not be loaded right now.'));
    fetch('/api/fncs-alltime').then((r) => r.json()).then((j) => { if (j?.ok) setAlt(j); }).catch(() => {});
  }, []);
  const wechsle = (r: 'events' | 'alltime') => {
    setReiter(r);
    const u = new URL(window.location.href);
    if (r === 'alltime') u.searchParams.set('reiter', 'alltime'); else u.searchParams.delete('reiter');
    window.history.replaceState(null, '', u.toString());
  };
  const sichtbar = useMemo(() => [...(liste ?? [])].reverse().filter((e) => (art === 'alle' || (art === 'lan' ? e.lan : !e.lan)) && (!region || e.regionCode === region)), [liste, art, region]);
  const regionen = useMemo(() => [...new Set((liste ?? []).map((e) => e.regionCode))], [liste]);
  const summe = useMemo(() => (liste ?? []).reduce((s, e) => s + betrag(e.preisgeld), 0), [liste]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <Titel ueber="Fortnite Champion Series" titel="FNCS" text="Every final in the archive – Grand Finals, Global Championships, Invitational and Summit – with podiums, prize money and all-time records." />
        {liste && (
          <div className="ml-auto flex gap-8">
            <div><p className="text-3xl font-extrabold tabular-nums text-white"><Zahl wert={liste.length} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Finals</p></div>
            <div><p className="text-3xl font-extrabold tabular-nums text-emerald-300"><Zahl wert={summe} format={geld} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Prize money</p></div>
            <div><p className="text-3xl font-extrabold tabular-nums text-amber-300"><Zahl wert={liste.filter((e) => e.lan).length} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">LAN events</p></div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm font-semibold">
          {([['events', 'Finals'], ['alltime', 'All-time']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => wechsle(k)} className="relative rounded-full px-5 py-2">
              {reiter === k && <motion.span layoutId="fncs-reiter" className="absolute inset-0 rounded-full bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className={`relative ${reiter === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{t}</span>
            </button>
          ))}
        </div>
        {reiter === 'events' && liste && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(['alle', 'lan', 'online'] as const).map((k) => <Chip key={k} an={art === k} onClick={() => setArt(k)}>{k === 'alle' ? 'All' : k === 'lan' ? 'LAN' : 'Online'}</Chip>)}
            <span className="mx-1 w-px bg-white/10" />
            <Chip an={region === ''} onClick={() => setRegion('')}>All regions</Chip>
            {regionen.map((r) => <Chip key={r} an={region === r} onClick={() => setRegion(region === r ? '' : r)}>{r === 'GLOBAL' ? 'Global' : r}</Chip>)}
          </div>
        )}
      </div>

      {fehler && <Fehler text={fehler} />}
      <AnimatePresence mode="wait">
        {reiter === 'events' ? (
          <motion.div key={`ev-${art}-${region}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {!liste && !fehler && <Laedt text="Loading the finals …" />}
            {sichtbar[0] && <Aufmacher e={sichtbar[0]} />}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sichtbar.slice(1).map((e, i) => <EventKarte key={`${e.key}-${i}`} e={e} i={i} />)}
            </div>
            {liste && !sichtbar.length && <Glas className="p-10 text-center text-sm text-white/45">No finals for this filter.</Glas>}
          </motion.div>
        ) : (
          <motion.div key="alltime" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {alt && liste ? <AllTimeAnsicht alt={alt} liste={liste} /> : <Laedt text="Loading all-time stats …" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
