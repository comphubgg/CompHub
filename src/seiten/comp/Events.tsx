import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas, Titel } from '../../teile/Glas';
import {
  ART_NAME, MODI, MODUS_NAME, REGIONEN, REGION_NAME, cupLink, datum, dekoBild, dauer, istRanked, lageVon, modiVon, stufeName, tagKurz, useJetzt,
  type Cup, type Lage, type Modus,
} from './events/gemeinsam';
import { LiveMarke, RegionMarke, knopf } from './events/teile';

/*
 * Alle Cups im Hub (/api/cup-catalog): oben der laufende Cup gross mit Banner, Regionen und Countdown bis zum Ende, darunter Filter
 * (Region, Modus, Suche, Ranked ein/aus) und die Abschnitte Live, Demnaechst und Beendet. Zuerst nur Live/Demnaechst (modus=alle-aktuell, klein),
 * der ganze Katalog mit den beendeten Cups kommt im Hintergrund nach (modus=alle).
 */

/** Nach Wichtigkeit wie auf der Seite: FNCS, Globals, Division, Majors zuerst - Arena, Test, Mobile zuletzt. */
const gewicht = (c: Cup) => (/FNCS|Global|Championship|Division|Major|LAN|Elite/i.test(c.titel) ? 0 : /Arena|Test|Fight Night|Mobile/i.test(c.titel) ? 2 : 1);

/** Ersatz fuer ein fehlendes oder schon gezeigtes Bild: Verlauf in der Farbe des Cups mit seiner Art. */
function Ersatzbild({ c }: { c: Cup }) {
  const farbe = c.farbe || '#38bdf8';
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `radial-gradient(120% 120% at 0% 0%, ${farbe}55, transparent 60%), linear-gradient(135deg, #0b1220, #070a12)` }}>
      <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
      <span className="absolute -bottom-3 right-3 select-none text-[72px] font-black uppercase leading-none tracking-tighter text-white/[0.07]">{(ART_NAME[c.art] ?? 'Cup').split(' ')[0]}</span>
    </div>
  );
}

function Kachel({ c, lage, mitBild, jetzt, i }: { c: Cup; lage: Lage; mitBild: boolean; jetzt: number; i: number }) {
  const modi = modiVon(c);
  const f = lage.fenster;
  const regionen = Object.keys(c.regionen);
  const [kaputt, setKaputt] = useState(false);
  const zeigRegionen = lage.wo.length ? lage.wo : regionen;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.4 }}>
      <Link to={cupLink(c, f)} className="group block h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:shadow-2xl hover:shadow-sky-500/10">
        <div className="relative aspect-video overflow-hidden">
          {mitBild && dekoBild(c) && !kaputt ? <img src={dekoBild(c)} alt="" loading="lazy" onError={() => setKaputt(true)} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <Ersatzbild c={c} />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070a12] via-[#070a12]/20 to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {lage.status === 'live' && <LiveMarke />}
            {[...modi].filter((m) => m !== 'br').map((m) => <span key={m} className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/85 backdrop-blur">{MODUS_NAME[m]}</span>)}
          </div>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur">{ART_NAME[c.art] ?? c.art}</span>
        </div>
        <div className="space-y-2.5 p-4">
          <div>
            <h3 className="line-clamp-1 font-bold tracking-tight text-white">{c.titel}</h3>
            <p className="line-clamp-1 text-xs text-white/45">{f ? stufeName(f) : c.untertitel ?? '—'}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {zeigRegionen.length >= 6 ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">All {zeigRegionen.length} regions</span>
              : zeigRegionen.map((r) => <RegionMarke key={r} r={r} klein />)}
          </div>
          <div className="flex items-baseline justify-between border-t border-white/5 pt-2.5 text-xs">
            {lage.status === 'live' && f?.end ? <><span className="text-white/45">ends in</span><span className="font-bold tabular-nums text-rose-300">{dauer(f.end - jetzt)}</span></>
              : lage.status === 'kommt' && lage.naechster ? <><span className="text-white/45">{datum(lage.naechster)}</span><span className="font-bold tabular-nums text-sky-300">in {dauer(lage.naechster - jetzt)}</span></>
                : <><span className="text-white/45">Finished</span><span className="font-semibold tabular-nums text-white/60">{lage.letzter ? tagKurz(lage.letzter) : '—'}</span></>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/** Der Kopf: der wichtigste laufende Cup gross - sonst der naechste. */
function Held({ c, lage, jetzt }: { c: Cup; lage: Lage; jetzt: number }) {
  const f = lage.fenster;
  const live = lage.status === 'live';
  const ziel = live ? f?.end ?? null : lage.naechster;
  const anteil = live && f?.end ? Math.min(1, Math.max(0, (jetzt - f.begin) / (f.end - f.begin))) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
      {dekoBild(c) ? <motion.img src={dekoBild(c)} alt="" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: 'easeOut' }} className="absolute inset-0 h-full w-full object-cover object-center" /> : <Ersatzbild c={c} />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06080f] via-[#06080f]/80 to-[#06080f]/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/90 via-transparent to-transparent" />
      <div className="relative grid min-h-[380px] gap-8 p-8 lg:grid-cols-[1fr_auto] lg:p-12">
        <div className="flex max-w-3xl flex-col justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {live ? <LiveMarke /> : <span className="rounded-full bg-sky-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Up next</span>}
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 backdrop-blur">{ART_NAME[c.art] ?? c.art}</span>
          </div>
          <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-white lg:text-6xl">{c.titel}</h2>
          {f && <p className="mt-2 text-lg font-medium text-white/70">{stufeName(f)}{f.matchCap ? <span className="text-white/40"> · {f.matchCap} matches</span> : null}</p>}
          {c.beschreibung && <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/50">{c.beschreibung}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {(lage.wo.length ? lage.wo : Object.keys(c.regionen)).map((r) => <RegionMarke key={r} r={r} />)}
          </div>
          <div className="mt-6"><Link to={cupLink(c, f)} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-[#06080f] shadow-lg shadow-sky-500/25 transition hover:-translate-y-0.5 hover:bg-sky-300">{live ? 'Open live leaderboard' : 'Open event'} →</Link></div>
        </div>
        {ziel && (
          <div className="self-end rounded-3xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl lg:min-w-[300px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{live ? 'Ends in' : 'Starts in'}</p>
            <p className={`mt-1 text-5xl font-black tabular-nums tracking-tight ${live ? 'text-rose-300' : 'text-sky-300'}`}>{dauer(ziel - jetzt)}</p>
            <p className="mt-1 text-xs text-white/45">{datum(ziel)}</p>
            {live && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300" initial={{ width: 0 }} animate={{ width: `${anteil * 100}%` }} transition={{ duration: 1 }} /></div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Abschnitt({ titel, zahl: n, children, rechts }: { titel: string; zahl: number; children: React.ReactNode; rechts?: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="flex items-baseline gap-3 text-2xl font-extrabold tracking-tight text-white">{titel}<span className="text-sm font-semibold text-white/35">{n}</span></h2>
        {rechts}
      </div>
      {children}
    </section>
  );
}


export default function Events() {
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [ganz, setGanz] = useState(false);
  const [fehler, setFehler] = useState(false);
  const [region, setRegion] = useState('alle');
  const [modus, setModus] = useState<'alle' | Modus>('alle');
  const [ranked, setRanked] = useState(false);
  const [suche, setSuche] = useState('');
  const [mehr, setMehr] = useState(12);
  const jetzt = useJetzt();

  useEffect(() => {
    let weg = false;
    fetch('/api/cup-catalog?modus=alle-aktuell').then((r) => r.json()).then((d) => { if (!weg && d.cups) setCups((alt) => alt ?? d.cups); }).catch(() => {});
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((d) => { if (!weg && d.cups) { setCups(d.cups); setGanz(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  // Die Lage aendert sich nur im Minutentakt merklich - die Einteilung wird darum nicht jede Sekunde neu gerechnet.
  const minute = Math.floor(jetzt / 60_000);
  const ein = useMemo(() => {
    const t = Date.now();
    const q = suche.trim().toLowerCase();
    const liste = (cups ?? []).filter((c) => (region === 'alle' || c.global || c.regionen[region])
      && (modus === 'alle' || modiVon(c).has(modus))
      && (ranked || q || !istRanked(c))
      && (!q || `${c.titel} ${c.untertitel ?? ''} ${c.art}`.toLowerCase().includes(q)))
      .map((c) => ({ c, lage: lageVon(c, region, t) }));
    const live = liste.filter((x) => x.lage.status === 'live').sort((a, b) => gewicht(a.c) - gewicht(b.c));
    const kommt = liste.filter((x) => x.lage.status === 'kommt').sort((a, b) => (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0));
    const vorbei = liste.filter((x) => x.lage.status === 'vorbei' && x.lage.letzter).sort((a, b) => (b.lage.letzter ?? 0) - (a.lage.letzter ?? 0));
    // Der Kopf nimmt keinen Ranked Cup, wenn es etwas anderes gibt.
    const kopfWahl = [...live, ...[...kommt].sort((a, b) => gewicht(a.c) - gewicht(b.c) || (a.lage.naechster ?? 0) - (b.lage.naechster ?? 0))];
    const kopf = kopfWahl.find((x) => dekoBild(x.c)) ?? kopfWahl.find((x) => !istRanked(x.c)) ?? kopfWahl[0] ?? null;
    return { live, kommt, vorbei, kopf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cups, region, modus, ranked, suche, minute]);

    const mitBild = useMemo(() => {
    const gesehen = new Set<string>();
    const raus = new Map<string, boolean>();
    // Thumbnails duerfen sich hier wiederholen (Betreiber: "mir fehlen ziemlich viele Thumbnails") - jeder Cup zeigt sein Bild.
    const merke = (id: string, b?: string) => { if (b) gesehen.add(b); raus.set(id, true); };
    const kb = ein.kopf ? dekoBild(ein.kopf.c) : undefined;
    if (kb) gesehen.add(kb);
    [...ein.live, ...ein.kommt, ...ein.vorbei.slice(0, mehr)].forEach((x) => { if (x.c.id !== ein.kopf?.c.id) merke(x.c.id, dekoBild(x.c)); });
    return raus;
  }, [ein, mehr]);

  const ohneKopf = <T extends { c: Cup }>(l: T[]) => l.filter((x) => x.c.id !== ein.kopf?.c.id);
  const lebende = ohneKopf(ein.live);
  const kommende = ohneKopf(ein.kommt);
  const raster = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';
  return (
    <div className="space-y-8">
      <Titel ueber="Tournaments" titel="Events" text="Every Fortnite competitive cup — live, upcoming and finished, straight from Epic's tournament data." />

      {!cups && !fehler && <div className="h-[380px] animate-pulse rounded-[2rem] border border-white/5 bg-white/[0.03]" />}
      {fehler && !cups && <Glas className="p-10 text-center text-white/60">The event catalogue isn't reachable right now. Try again in a moment.</Glas>}
      {ein.kopf && <Held c={ein.kopf.c} lage={ein.kopf.lage} jetzt={jetzt} />}

      {cups && (
        <Glas className="sticky top-2 z-20 flex flex-wrap items-center gap-3 !bg-[#0a0e18]/80 p-3" verzoegerung={0.1}>
          <div className="relative">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a cup…" className="w-60 rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-white/35" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </div>
          <div className="flex flex-wrap rounded-full border border-white/10 bg-black/20 p-1">
            <button type="button" className={knopf(region === 'alle')} onClick={() => setRegion('alle')}>All regions</button>
            {REGIONEN.map((r) => <button key={r} type="button" title={REGION_NAME[r]} className={knopf(region === r)} onClick={() => setRegion(r)}>{r}</button>)}
          </div>
          <div className="flex flex-wrap rounded-full border border-white/10 bg-black/20 p-1">
            <button type="button" className={knopf(modus === 'alle')} onClick={() => setModus('alle')}>All modes</button>
            {MODI.filter((m) => m !== 'sonst' || (cups ?? []).some((c) => modiVon(c).has('sonst'))).map((m) => <button key={m} type="button" className={knopf(modus === m)} onClick={() => setModus(m)}>{MODUS_NAME[m]}</button>)}
          </div>
          <button type="button" onClick={() => setRanked((x) => !x)} className="ml-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white">
            <span className={`relative h-4 w-7 rounded-full transition ${ranked ? 'bg-sky-400' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${ranked ? 'left-3.5' : 'left-0.5'}`} /></span>
            Show ranked cups
          </button>
        </Glas>
      )}

      {lebende.length > 0 && (
        <Abschnitt titel="Live now" zahl={ein.live.length}>
          <div className={raster}><AnimatePresence>{lebende.map((x, i) => <Kachel key={x.c.id} c={x.c} lage={x.lage} mitBild={!!mitBild.get(x.c.id)} jetzt={jetzt} i={i} />)}</AnimatePresence></div>
        </Abschnitt>
      )}
      {cups && (
        <Abschnitt titel="Upcoming" zahl={ein.kommt.length}>
          {kommende.length ? <div className={raster}><AnimatePresence>{kommende.map((x, i) => <Kachel key={x.c.id} c={x.c} lage={x.lage} mitBild={!!mitBild.get(x.c.id)} jetzt={jetzt} i={i} />)}</AnimatePresence></div>
            : <Glas className="p-8 text-center text-sm text-white/45">No {ein.kommt.length ? 'other ' : ''}upcoming cups match these filters.</Glas>}
        </Abschnitt>
      )}
      {cups && (
        <Abschnitt titel="Recently finished" zahl={ein.vorbei.length} rechts={!ganz && <span className="text-xs text-white/40">loading the full archive…</span>}>
          {ein.vorbei.length ? (
            <>
              <div className={raster}><AnimatePresence>{ein.vorbei.slice(0, mehr).map((x, i) => <Kachel key={x.c.id} c={x.c} lage={x.lage} mitBild={!!mitBild.get(x.c.id)} jetzt={jetzt} i={i} />)}</AnimatePresence></div>
              {ein.vorbei.length > mehr && <div className="flex justify-center"><button type="button" onClick={() => setMehr((m) => m + 12)} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:border-sky-400/40 hover:text-white">Show more ({ein.vorbei.length - mehr})</button></div>}
            </>
          ) : ganz && <Glas className="p-8 text-center text-sm text-white/45">No finished cups match these filters.</Glas>}
        </Abschnitt>
      )}
    </div>
  );
}
