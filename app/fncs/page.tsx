'use client';

/*
 * FNCS - alle Endspiele auf einen Blick und, wer in den Grand Finals die meisten Eliminierungen hatte.
 *
 * Der Betreiber (13.10.2026): eine FNCS-Seite wie beim Vorbild, mit zwei Reitern - die Endspiele (Grand Finals, Global
 * Championship) und die "All-Time Stats". Alles aus dem eigenen Werkzeug: die Endspiele aus dem Maps-Verzeichnis, die
 * Platzierungen aus Epics Bestenliste, die Eliminierungen aus dem Archiv (/api/fncs-alltime).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import { kernname, ohneZierrat } from '@/lib/homoglyph';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; saison: string; saisonKurz: string; typ: string; bild: string | null; eventId: string | null; lan?: boolean; reihe?: number;
}
interface Ev { key: string; titel: string; saison: string; saisonKurz: string; saisonName: string; tage: string[] }
interface Sp { id: string; name: string; land: string | null; bild: string | null; gesamt: number; je: Record<string, number> }
interface Platz { rank: number; points: number; players: Array<{ id: string; name?: string; displayName?: string }> }

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

/** Ein Endspiel, wie das Vorbild sie auflistet: Grand Finals, Global Championship, Finals der Summits. Heats, Last Chance und Gruppen nicht. */
function istEndspiel(e: Eintrag): boolean {
  if (e.typ !== 'fncs') return false;
  const n = e.titel;
  if (/last chance|lcl|lcq|scq|heat|fast track|group|semi|bracket|practice/i.test(n)) return false;
  return /grand|final|global championship|invitational/i.test(n);
}

interface Gruppe { key: string; titel: string; saison: string; saisonKurz: string; lan: boolean; eintraege: Eintrag[] }

function gruppiere(liste: Eintrag[]): Gruppe[] {
  const m = new Map<string, Gruppe>();
  for (const e of liste.filter(istEndspiel)) {
    const titel = e.titel.replace(/\s+[–·-]\s+.*$/, '').trim();
    const k = `${e.saison}|${titel}`;
    const g = m.get(k) ?? { key: k, titel, saison: e.saison, saisonKurz: e.saisonKurz, lan: false, eintraege: [] };
    g.eintraege.push(e); g.lan = g.lan || !!e.lan;
    m.set(k, g);
  }
  const raus = [...m.values()];
  for (const g of raus) {
    // Gibt es die Endspiele nach Tag, ist der zusammenfassende Eintrag ("Grands") doppelt.
    if (g.eintraege.some((e) => /day \d/i.test(e.titel))) g.eintraege = g.eintraege.filter((e) => !/grands?$/i.test(e.titel.trim()));
    g.eintraege.sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0) || (a.reihe ?? 0) - (b.reihe ?? 0));
  }
  return raus.sort((a, b) => Number(b.saison.replace(/\D/g, '')) - Number(a.saison.replace(/\D/g, '')) || (b.eintraege[0]?.datum ?? 0) - (a.eintraege[0]?.datum ?? 0));
}

/** Ein Name ohne Turniermarke und Orgtag - wie auf den Kacheln der Tierlist ("BIG Vicobuca" wird "vicobuca"). */
const rein = (n: string) => ohneZierrat(kernname(n)).trim() || n;

/** Die ersten drei Plaetze des letzten Tages - von Epics Bestenliste, wo es eine gibt. */
function Spitze({ e }: { e: Eintrag }) {
  const [top, setTop] = useState<Platz[] | null>(null);
  const halter = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!e.eventId) return undefined;
    const el = halter.current; if (!el) return undefined;
    let weg = false;
    const laden = () => fetch(`/api/cup-leaderboard?event=${encodeURIComponent(e.eventId as string)}&window=${encodeURIComponent(e.windowId)}&limit=3`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (!weg && Array.isArray(j?.entries)) setTop(j.entries.slice(0, 3)); }).catch(() => { /* ohne Platzierungen bleibt die Karte schlicht */ });
    if (typeof IntersectionObserver === 'undefined') { void laden(); return () => { weg = true; }; }
    const b = new IntersectionObserver(([x]) => { if (x.isIntersecting) { void laden(); b.disconnect(); } }, { rootMargin: '200px' });
    b.observe(el);
    return () => { weg = true; b.disconnect(); };
  }, [e.eventId, e.windowId]);
  if (!e.eventId) return null;
  return (
    <div ref={halter} className="mt-3 min-h-[3.2rem] space-y-1.5">
      {top?.map((p) => (
        <p key={p.rank} className="flex items-center gap-2 text-[11px]">
          <span className={`w-4 text-center font-black tabular-nums ${p.rank === 1 ? 'text-amber-300' : 'text-slate-500'}`}>{p.rank}</span>
          <span className="min-w-0 flex-1 truncate font-bold uppercase text-slate-200">{p.players.map((x) => rein(x.displayName || x.name || '—')).join(' · ')}</span>
          <span className="tabular-nums text-sky-400">{p.points}</span>
        </p>
      ))}
    </div>
  );
}

export default function FncsSeite() {
  const t = useT();
  const [tab, setTab] = useState<'events' | 'alltime'>('events');
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [alt, setAlt] = useState<{ events: Ev[]; spieler: Sp[]; ab: string } | null>(null);
  const [altFehler, setAltFehler] = useState(false);
  const [sortNach, setSortNach] = useState('gesamt');
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste').then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setListe(j.eintraege); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    fetch('/api/fncs-alltime').then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setAlt(j); else setAltFehler(true); } })
      .catch(() => { if (!weg) setAltFehler(true); });
    return () => { weg = true; };
  }, []);

  const gruppen = useMemo(() => (liste ? gruppiere(liste) : []), [liste]);
  const zeilen = useMemo(() => {
    if (!alt) return [];
    const q = suche.trim().toLowerCase();
    return [...alt.spieler]
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => (sortNach === 'gesamt' ? b.gesamt - a.gesamt : (b.je[sortNach] ?? -1) - (a.je[sortNach] ?? -1) || b.gesamt - a.gesamt));
  }, [alt, sortNach, suche]);
  /**
   * Die Farbe einer Zelle - wie auf dem Vorbild: je Major in vier Stufen, rot (wenige Eliminierungen) bis dunkelgruen (viele).
   * Die Grenzen sind die Viertel der Werte dieses Majors, nicht feste Zahlen: ein Major mit kurzen Finals faerbt sich
   * genauso aussagekraeftig wie einer mit langen.
   */
  const grenzen = useMemo(() => {
    const m: Record<string, [number, number, number]> = {};
    for (const ev of alt?.events ?? []) {
      const w = (alt?.spieler ?? []).map((s) => s.je[ev.key]).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
      const q = (p: number) => w[Math.min(w.length - 1, Math.floor(w.length * p))] ?? 0;
      m[ev.key] = [q(0.25), q(0.5), q(0.75)];
    }
    return m;
  }, [alt]);
  const zellFarbe = (key: string, v: number) => {
    const [a, b, c] = grenzen[key] ?? [0, 0, 0];
    return v >= c ? 'bg-emerald-800 text-white' : v >= b ? 'bg-emerald-500/80 text-white' : v >= a ? 'bg-amber-400/90 text-zinc-950' : 'bg-rose-500/80 text-white';
  };

  const reiter = (an: boolean) => `rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-[820px] -translate-x-1/2 rounded-full bg-sky-500/[0.08] blur-[110px]" />
        <div className="relative mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 px-4 py-8">
          <div>
            <h1 className="text-5xl font-black uppercase tracking-tight sm:text-6xl">FNCS</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400"><T>Alle Endspiele der FNCS, die das Archiv kennt - mit Platzierungen und den meisten Eliminierungen.</T></p>
          </div>
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
            <button type="button" onClick={() => setTab('events')} className={reiter(tab === 'events')}>Events</button>
            <button type="button" onClick={() => setTab('alltime')} className={reiter(tab === 'alltime')}>All-Time Stats</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 py-8">
        {tab === 'events' && (
          <>
            {fehler && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>Die Endspiele ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
            {!liste && !fehler && <LadeSchirm />}
            <div className="space-y-10">
              {gruppen.map((g) => {
                return (
                  <section key={g.key}>
                    <div className="mb-3 flex flex-wrap items-baseline gap-3">
                      <h2 className="text-2xl font-black tracking-tight">{g.titel}</h2>
                      {g.lan && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black uppercase text-zinc-950">LAN</span>}
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{g.saisonKurz}</span>
                      {g.eintraege[0]?.datum && <span className="text-xs text-slate-500">{DATUM.format(new Date(g.eintraege[0].datum))}</span>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {g.eintraege.map((e) => (
                        <Link key={e.windowId} href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
                          className="group rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4 transition hover:-translate-y-0.5 hover:border-sky-500 hover:bg-zinc-900">
                          <p className="flex items-center justify-between gap-2 text-[13px] font-bold uppercase tracking-wide text-slate-100">
                            <span>{/^grands?$/i.test(e.fenster) ? 'Grand Finals' : /^globals$/i.test(e.fenster) ? 'Finals' : (e.fenster || e.titel)}</span>
                            <span className="text-slate-600 transition group-hover:text-sky-400">→</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</p>
                          <Spitze e={e} />
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
              {liste && gruppen.length === 0 && <p className="text-sm text-slate-500"><T>Noch keine Endspiele.</T></p>}
            </div>
          </>
        )}

        {tab === 'alltime' && (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight"><T>Eliminierungen in den Grand Finals</T></h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  <T>Beide Endspieltage jedes Majors zusammen, Europa. Gezählt wird, was das Archiv führt - ab</T> {alt?.ab || '…'}.
                </p>
              </div>
              <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
                className="w-full max-w-[240px] rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            </div>
            {altFehler && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>Die Aufstellung ließ sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
            {!alt && !altFehler && <LadeSchirm />}
            {alt && (
              <p className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-rose-500/80" /> <T>wenige</T></span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-amber-400/90" /></span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-emerald-500/80" /></span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-emerald-800" /> <T>viele</T></span>
                <span className="text-slate-600"><T>(je Major in Vierteln)</T></span>
              </p>
            )}
            {alt && (
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900/40">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="w-12 px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left"><T>Spieler</T></th>
                      <th className="px-3 py-2 text-right"><button type="button" onClick={() => setSortNach('gesamt')} className={sortNach === 'gesamt' ? 'text-sky-400' : 'hover:text-slate-200'}>Total</button></th>
                      {alt.events.map((ev) => (
                        <th key={ev.key} className="px-2 py-2 text-center">
                          <button type="button" onClick={() => setSortNach(ev.key)} title={ev.saisonName} className={`whitespace-nowrap ${sortNach === ev.key ? 'text-sky-400' : 'hover:text-slate-200'}`}>
                            {ev.titel.replace('FNCS ', '')}<span className="block text-[9px] font-medium normal-case tracking-normal text-slate-600">{ev.saisonKurz}</span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((s, i) => (
                      <tr key={s.id} className="border-b border-white/[0.04] transition hover:bg-sky-500/[0.05]">
                        <td className="px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2.5">
                            {s.bild
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={s.bild} alt="" loading="lazy" className="h-7 w-7 rounded-full border border-white/15 object-cover object-top" />
                              : <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-[10px] font-bold text-slate-500">{s.name.slice(0, 1).toUpperCase()}</span>}
                            <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />
                            <span className="text-[12px] font-bold uppercase tracking-wide text-slate-100">{s.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-sm font-black tabular-nums text-slate-50">{s.gesamt}</td>
                        {alt.events.map((ev) => {
                          const v = s.je[ev.key];
                          return (
                            <td key={ev.key} className="px-1.5 py-1.5 text-center">
                              {v === undefined ? <span className="text-slate-700">–</span> : (
                                <span className={`inline-block min-w-[2.4rem] rounded-md px-1.5 py-1 text-xs font-bold tabular-nums ${zellFarbe(ev.key, v)}`}>{v}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
