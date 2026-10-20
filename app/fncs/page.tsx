'use client';

/*
 * FNCS - alle Endspiele auf einen Blick und, wer in den Grand Finals die meisten Eliminierungen hatte.
 *
 * Der Betreiber (13.10.2026): eine FNCS-Seite wie beim Vorbild, mit zwei Reitern - die Endspiele (Grand Finals, Global
 * Championship, Invitational, Summit) und die "All-Time Stats". Die Endspiele als Karten mit Vorschaubild, Platzierungen mit
 * Flaggen und sauberen Namen; Day 1 und Day 2 sind ein Event. Filter Alle / LAN / Online, Ansicht Board oder Timeline.
 * Alles aus dem eigenen Werkzeug (/api/fncs-ereignisse, /api/fncs-alltime).
 */

import KartenHintergrund, { FNCS_BILDER } from '@/app/components/KartenHintergrund';
import { useEffect, useMemo, useState } from 'react';
import { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import type { FncsEreignis, FncsRekorde } from '@/lib/fncsEreignisse';
import { regionFarbe, REGIONEN_REIHE } from '@/lib/regionFarbe';

interface Ev { key: string; titel: string; saison: string; saisonKurz: string; saisonName: string; tage: string[] }
interface Sp { id: string; name: string; land: string | null; bild: string | null; gesamt: number; je: Record<string, number> }

interface Titel { id: string; name: string; land: string | null; titel: number }
type AllTime = { events: Ev[]; spieler: Sp[]; ab: string; titel: Titel[]; laender: Array<{ land: string; titel: number }>; rekorde: FncsRekorde | null };

const landName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };

/** Eine Tafel der All-Time Stats: Kopfzeile, darunter die Liste (scrollt in sich, ohne Aufklapp-Knopf). */
function Tafel({ titel, unter, children }: { titel: string; unter?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900">
      <p className="border-b border-white/[0.08] bg-zinc-800 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">{titel}</span>
        {unter && <span className="ml-2 text-[10px] text-slate-600">{unter}</span>}
      </p>
      <div className="max-h-[560px] overflow-y-auto">{children}</div>
    </section>
  );
}

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });
const JAHR = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'Europe/Brussels' });

/** Die Farbe des Platzes: Gold, Silber, Bronze. */
const PLATZ_FARBE = ['text-amber-300', 'text-slate-300', 'text-amber-600'];

const kartenLink = (e: FncsEreignis) => (e.turnierId
  ? `/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.kartenRegion)}&w=${encodeURIComponent(e.windowId)}`
  : '');

function Rahmen({ link, klasse, stil, children }: { link: string; klasse: string; stil?: React.CSSProperties; children: React.ReactNode }) {
  return link ? <Link href={link} className={klasse} style={stil}>{children}</Link> : <div className={klasse} style={stil}>{children}</div>;
}

/** Die ersten drei Plaetze eines Events - das ganze Team mit Flagge, Punkte rechts. */
function Spitze({ e }: { e: FncsEreignis }) {
  if (!e.spitze.length) {
    return <p className="mt-3 text-[11px] text-slate-600"><T>Platzierungen werden nachgetragen.</T></p>;
  }
  // Beides, bei jedem Turnier (Betreiber, 13.10.2026: "Punkte sollte es immer geben, Earnings in 90 Prozent"): fehlt ein Wert, steht ein Strich.
  return (
    <ol className="mt-3 space-y-1.5">
      <li className="flex items-center gap-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        <span className="w-4" /><span className="min-w-0 flex-1">Team</span><span className="w-11 text-right">PTS</span><span className="w-14 text-right">Earnings</span>
      </li>
      {e.spitze.map((p, i) => (
        <li key={p.rang} className="flex items-center gap-2.5 text-[11px]">
          <span className={`w-4 text-center font-black tabular-nums ${PLATZ_FARBE[i] ?? 'text-slate-500'}`}>{p.rang}</span>
          <TeamFlagge groesse={p.spieler.length > 1 ? 24 : 18} laender={p.spieler.map((x) => x.land)} />
          <span className="min-w-0 flex-1 truncate font-bold uppercase tracking-wide text-slate-100">{p.spieler.map((x) => x.name).join(' · ')}</span>
          <span className="w-11 text-right tabular-nums text-sky-400">{p.punkte ?? '–'}</span>
          <span className="w-14 text-right font-bold tabular-nums text-emerald-400">{p.preis ?? '–'}</span>
        </li>
      ))}
    </ol>
  );
}

function Fakt({ titel, wert }: { titel: string; wert: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{titel}</dt>
      <dd className="mt-0.5 truncate text-sm font-black text-slate-100">{wert}</dd>
    </div>
  );
}

function Karte({ e, nr, aktuell, i }: { e: FncsEreignis; nr: number; aktuell: boolean; i: number }) {
  const link = kartenLink(e);
  const klasse = `mp-an group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900 transition ${link ? 'hover:-translate-y-0.5 hover:border-sky-500 hover:bg-zinc-800' : ''}`;
  const stil = { animation: `fncs-rein .5s ${Math.min(i, 12) * 45}ms cubic-bezier(.2,.8,.2,1) both` };
  return (
    <Rahmen link={link} klasse={klasse} stil={stil}>
      <div className="foto-dunkel relative aspect-video overflow-hidden bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950">
        {e.bild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(e.bild)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {aktuell && <span className="rounded border border-red-400/50 bg-red-500/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Current</span>}
          {e.lan && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-950">LAN</span>}
          <span className="rounded border border-white/25 bg-black/55 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-100 backdrop-blur-sm">{e.region}</span>
        </div>
        <span className="absolute right-3 top-3 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-slate-100 backdrop-blur-sm">#{nr}</span>
        <div className="absolute inset-x-3 bottom-3">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-300">{e.kopf1}</p>
          <p className="text-2xl font-black uppercase leading-none tracking-tight text-white drop-shadow sm:text-[26px]">{e.kopf2}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold text-slate-100">{e.titel}</span>
          <span className="shrink-0 text-[11px] text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</span>
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-3 border-y border-white/[0.06] py-3">
          <Fakt titel="Prize pool" wert={e.preisgeld ?? '–'} />
          <Fakt titel="Teams" wert={e.teams ? String(e.teams) : '–'} />
          <Fakt titel={e.lan ? 'Location' : 'Type'} wert={e.lan ? (e.ort ?? 'LAN') : 'Online'} />
        </dl>
        <Spitze e={e} />
        {link && <p className="mt-auto pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition group-hover:text-sky-400"><T>Karte und Leaderboard</T> →</p>}
      </div>
    </Rahmen>
  );
}

/** Die Timeline: nach Jahren, links die Linie, je Event eine Zeile mit dem Sieger. */
function Zeitstrahl({ liste, nrVon, aktuellKey }: { liste: FncsEreignis[]; nrVon: Map<string, number>; aktuellKey: string }) {
  const jahre = useMemo(() => {
    const m = new Map<string, FncsEreignis[]>();
    for (const e of liste) {
      const j = e.datum ? JAHR.format(new Date(e.datum)) : '–';
      m.set(j, [...(m.get(j) ?? []), e]);
    }
    return [...m.entries()];
  }, [liste]);
  return (
    <div className="relative">
      <span aria-hidden className="absolute bottom-0 left-[11px] top-2 w-px bg-gradient-to-b from-sky-500/60 via-white/10 to-transparent" />
      {jahre.map(([jahr, evs]) => (
        <section key={jahr} className="relative mb-8 pl-9">
          <h3 className="mb-3 text-sm font-black tracking-[0.2em] text-sky-400">{jahr}</h3>
          <div className="space-y-2">
            {evs.map((e) => {
              const sieger = e.spitze[0];
              const link = kartenLink(e);
              const klasse = `group relative flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.07] bg-zinc-900 px-4 py-3 transition ${link ? 'hover:border-sky-500/60 hover:bg-zinc-800' : ''}`;
              return (
                <Rahmen key={e.key} link={link} klasse={klasse}>
                  <span aria-hidden className={`absolute -left-[28px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-zinc-950 ${e.key === aktuellKey ? 'bg-red-400' : e.lan ? 'bg-amber-400' : 'bg-sky-500'}`} />
                  <span className="w-12 shrink-0 text-xs font-black tabular-nums text-slate-600">#{nrVon.get(e.key)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">{e.kopf1}</span>
                    <span className="block truncate text-sm font-black uppercase tracking-wide text-slate-50">{e.kopf2}</span>
                  </span>
                  {e.lan && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-950">LAN</span>}
                  <span className="w-24 shrink-0 text-right text-[11px] text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</span>
                  <span className="flex min-w-[180px] items-center gap-2 sm:w-[260px]">
                    {sieger ? (
                      <>
                        <TeamFlagge groesse={sieger.spieler.length > 1 ? 24 : 18} laender={sieger.spieler.map((x) => x.land)} />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase text-amber-200">{sieger.spieler.map((x) => x.name).join(' · ')}</span>
                      </>
                    ) : <span className="text-[11px] text-slate-600">–</span>}
                  </span>
                </Rahmen>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function FncsSeite() {
  const t = useT();
  const [tab, setTab] = useState<'events' | 'alltime'>('events');
  const [liste, setListe] = useState<FncsEreignis[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [filter, setFilter] = useState<'alle' | 'lan' | 'online'>('alle');
  /** Die Region, nach der gefiltert wird - leer heisst alle. Ein Knopf steht nur da, wo es Events gibt. */
  const [region, setRegion] = useState('');
  const [ansicht, setAnsicht] = useState<'board' | 'timeline'>('board');
  const [alt, setAlt] = useState<AllTime | null>(null);
  const [altFehler, setAltFehler] = useState(false);
  const [sortNach, setSortNach] = useState('gesamt');
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/fncs-ereignisse').then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setListe(j.ereignisse); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    fetch('/api/fncs-alltime').then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setAlt(j); else setAltFehler(true); } })
      .catch(() => { if (!weg) setAltFehler(true); });
    return () => { weg = true; };
  }, []);

  // Nummer je Event: das aelteste ist #1, wie beim Vorbild; angezeigt wird das neueste zuerst.
  const nrVon = useMemo(() => new Map((liste ?? []).map((e, i) => [e.key, i + 1] as const)), [liste]);
  const aktuellKey = useMemo(() => {
    const neu = (liste ?? [])[(liste?.length ?? 0) - 1];
    // "Current": nur ein Event, das gerade läuft (bis anderthalb Tage nach dem Start) oder noch bevorsteht - nicht ein vergangenes.
    return neu?.datum && Date.now() < neu.datum + 36 * 3600_000 ? neu.key : '';
  }, [liste]);
  const sichtbar = useMemo(() => [...(liste ?? [])].reverse().filter((e) => (filter === 'alle' || (filter === 'lan' ? e.lan : !e.lan)) && (!region || e.regionCode === region)), [liste, filter, region]);
  /** Wie viele Events je Region - Regionen mit null haben keinen Knopf, bis dort ein Event dazukommt. */
  const zahlRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of liste ?? []) m.set(e.regionCode, (m.get(e.regionCode) ?? 0) + 1);
    return m;
  }, [liste]);
  const zahl = (f: 'alle' | 'lan' | 'online') => (liste ?? []).filter((e) => (f === 'alle' || (f === 'lan' ? e.lan : !e.lan)) && (!region || e.regionCode === region)).length;
  const chip = (an: boolean) => `rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an
    ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;
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

  const reiter = (an: boolean) => `rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="relative isolate min-h-screen bg-zinc-950 text-slate-100">
      <KartenHintergrund cups={FNCS_BILDER} />
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-[820px] -translate-x-1/2 rounded-full bg-sky-500/[0.08] blur-[110px]" />
        <div className="relative mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 px-4 py-8">
          <div>
            <h1 className="text-5xl font-black uppercase tracking-tight sm:text-6xl">FNCS</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400"><T>Alle Endspiele der FNCS, die das Archiv kennt - mit Platzierungen und den meisten Eliminierungen.</T></p>
          </div>
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-zinc-950 p-1">
            <button type="button" onClick={() => setTab('events')} className={reiter(tab === 'events')}>Events</button>
            <button type="button" onClick={() => setTab('alltime')} className={reiter(tab === 'alltime')}>All-Time Stats</button>
            {/* FNCS Solos: eine eigene Seite fuer alle Regionen (Heats, Last Chance, Finale, Karte). */}
            <Link href="/globals-solos" className={reiter(false)}>Solos</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 py-8">
        {tab === 'events' && (
          <>
            <style>{`@keyframes fncs-rein { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .mp-an { animation: none !important; } }`}</style>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {([['alle', 'Alle'], ['lan', 'LAN'], ['online', 'Online']] as const).map(([k, titel]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}>
                    {k === 'alle' ? t('Alle') : titel}{liste ? <span className="ml-1.5 opacity-60">{zahl(k)}</span> : null}
                  </button>
                ))}
              </div>
              {/* Die Region: nur, wo es Events gibt - dazu kommt der Knopf von selbst, sobald dort eines ist. */}
              {[...zahlRegion.keys()].length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
                  <button type="button" onClick={() => setRegion('')} className={chip(region === '')}><T>Alle Regionen</T></button>
                  {[...REGIONEN_REIHE, 'GLOBAL'].filter((r) => (zahlRegion.get(r) ?? 0) > 0 || r === region).map((r) => {
                    const farbe = regionFarbe(r);
                    return (
                      <span key={r} className="inline-flex rounded-lg bg-zinc-950"><button type="button" onClick={() => setRegion(region === r ? '' : r)}
                        className={`rounded-lg border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${region === r ? farbe.marke : `bg-zinc-900 ${farbe.ruhig}`}`}>
                        {r === 'GLOBAL' ? 'Global' : r}<span className="ml-1.5 opacity-60">{zahlRegion.get(r) ?? 0}</span>
                      </button></span>
                    );
                  })}
                </div>
              )}
              <div className="ml-auto flex gap-1.5">
                {([['board', 'Board'], ['timeline', 'Timeline']] as const).map(([k, titel]) => (
                  <button key={k} type="button" onClick={() => setAnsicht(k)} className={chip(ansicht === k)}>{titel}</button>
                ))}
              </div>
            </div>
            {fehler && <p className="rounded-xl border border-rose-500/30 bg-rose-950 px-4 py-3 text-sm text-rose-300"><T>Die Endspiele ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
            {!liste && !fehler && <LadeSchirm />}
            {liste && ansicht === 'board' && (
              <div key={`${filter}|${region}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sichtbar.map((e, i) => <Karte key={e.key} e={e} nr={nrVon.get(e.key) ?? 0} aktuell={e.key === aktuellKey} i={i} />)}
              </div>
            )}
            {liste && ansicht === 'timeline' && <Zeitstrahl key={`${filter}|${region}`} liste={sichtbar} nrVon={nrVon} aktuellKey={aktuellKey} />}
            {liste && sichtbar.length === 0 && <p className="text-sm text-slate-500"><T>Noch keine Endspiele.</T></p>}
          </>
        )}

        {tab === 'alltime' && (
          <>
            {/* Wie beim Vorbild: FNCS Winners, All-Time Leaderboard, Nationalities, Rekorde in einem Grand Finals. */}
            <div className="mb-5 rounded-xl border border-sky-500/25 bg-sky-950 px-4 py-3">
              <p className="text-[13px] font-bold text-slate-100"><T>Nur FNCS: diese Zahlen kommen aus den Grand Finals, seit Chapter 5 Season 3.</T></p>
              <p className="mt-0.5 text-[11px] text-slate-400"><T>Die Titel zählen alle FNCS-Endspiele seit Chapter 1.</T></p>
            </div>
            {alt && (
              <div className="mb-10 grid gap-4 lg:grid-cols-3">
                <Tafel titel="FNCS Winners" unter="Titles">
                  <ol>
                    {alt.titel.map((s, i) => (
                      <li key={`${s.id}-${s.name}`} className="flex items-center gap-2.5 border-b border-white/[0.04] px-3 py-1.5 last:border-b-0">
                        <span className="w-6 text-right text-[11px] font-black tabular-nums text-slate-500">{i + 1}</span>
                        <TeamFlagge groesse={16} laender={[s.land ?? undefined]} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase text-slate-100">{s.name}</span>
                        <span className="text-sm font-black tabular-nums text-amber-300">{s.titel}</span>
                      </li>
                    ))}
                  </ol>
                </Tafel>

                <Tafel titel="All-Time Leaderboard" unter={alt.rekorde ? t('Seit {n}').replace('{n}', alt.rekorde.ab) : ''}>
                  {alt.rekorde ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          <th className="w-8 px-3 py-2">#</th><th className="px-3 py-2"><T>Spieler</T></th>
                          <th className="px-2 py-2 text-right">PTS</th><th className="px-2 py-2 text-right">VR</th><th className="px-3 py-2 text-right">Elims</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alt.rekorde.spieler.map((s, i) => (
                          <tr key={`${s.name}-${i}`} className="border-b border-white/[0.04]">
                            <td className="px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{i + 1}</td>
                            <td className="px-3 py-1.5"><span className="flex items-center gap-2"><TeamFlagge groesse={16} laender={[s.land ?? undefined]} /><span className="text-[12px] font-bold uppercase text-slate-100">{s.name}</span></span></td>
                            <td className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-50">{s.punkte.toLocaleString('en-GB')}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{s.siege}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{s.elims.toLocaleString('en-GB')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="px-3 py-4 text-xs text-slate-500"><T>Die Aufstellung ließ sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
                </Tafel>

                <Tafel titel="Nationalities" unter="Titles by country">
                  <ol>
                    {alt.laender.map((l, i) => (
                      <li key={l.land} className="flex items-center gap-2.5 border-b border-white/[0.04] px-3 py-1.5 last:border-b-0">
                        <span className="w-6 text-right text-[11px] font-black tabular-nums text-slate-500">{i + 1}</span>
                        <TeamFlagge groesse={16} laender={[l.land]} />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-100">{landName(l.land)}</span>
                        <span className="text-sm font-black tabular-nums text-amber-300">{l.titel}</span>
                      </li>
                    ))}
                  </ol>
                </Tafel>
              </div>
            )}

            {alt?.rekorde && (
              <div className="mb-10 grid gap-4 lg:grid-cols-3">
                {([['Most points in a single Grand Finals', alt.rekorde.punkte], ['Most Victory Royales in a single Grand Finals', alt.rekorde.siege], ['Most elims in a single Grand Finals', alt.rekorde.elims]] as const).map(([titel, zeilen]) => (
                  <Tafel key={titel} titel={titel} unter={t('Seit {n}').replace('{n}', alt.rekorde?.ab ?? '')}>
                    <ol>
                      {zeilen.map((z, i) => (
                        <li key={`${z.event}-${i}`} className="flex items-center gap-2.5 border-b border-white/[0.04] px-3 py-1.5 last:border-b-0">
                          <span className="w-6 text-right text-[11px] font-black tabular-nums text-slate-500">{i + 1}</span>
                          <TeamFlagge groesse={z.spieler.length > 1 ? 24 : 16} laender={z.spieler.map((x) => x.land)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold uppercase text-slate-100">{z.spieler.map((x) => x.name).join(' · ')}</span>
                            <span className="block text-[10px] text-slate-600">{z.event}</span>
                          </span>
                          <span className="text-sm font-black tabular-nums text-sky-400">{z.wert}</span>
                        </li>
                      ))}
                    </ol>
                  </Tafel>
                ))}
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight"><T>Eliminierungen in den Grand Finals</T></h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  <T>Beide Endspieltage jedes Majors zusammen, Europa. Gezählt wird, was das Archiv führt - ab</T> {alt?.ab || '…'}.
                </p>
              </div>
              <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
                className="w-full max-w-[240px] rounded-lg border border-zinc-800 bg-zinc-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            </div>
            {altFehler && <p className="rounded-xl border border-rose-500/30 bg-rose-950 px-4 py-3 text-sm text-rose-300"><T>Die Aufstellung ließ sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
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
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900">
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
                              : <PlatzhalterRund name={s.name} groesse={28} />}
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
