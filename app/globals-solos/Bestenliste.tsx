'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import { sichtbarerTakt } from '@/app/lib/takt';
import { useZugang } from '@/app/lib/zugang';
import { kernname, orgtagVon } from '@/lib/homoglyph';
import type { SolosFenster, SolosSpieler, SolosStufe } from '@/lib/globalsSolos';

/*
 * Die Bestenliste eines Spieltags als echte Tabelle (Betreiber, 15.11.2026: "der Leaderboard-Reiter soll eine richtige Tabelle sein, keine Foto-Kacheln"):
 * # · Flagge und Name (Orgtag klein) · Punkte · Matches · Siege · Elims, jede Zeile anklickbar; rechts (am Handy darunter) der gewaehlte Spieler mit seinen Matches.
 *
 * Die Zahlen kommen aus derselben Quelle wie auf der Event-Seite (/api/cup-leaderboard), waehrend der Heat laeuft alle 30 Sekunden - und nie zurueck auf einen
 * aelteren Stand (dieselbe Regel wie dort: eine Antwort, deren "updated" aelter ist als das, was schon dasteht, wird verworfen).
 * Die Qualifikationslinien kommen aus Epics Auszahlungstabelle (Stufe: qualifiziert und marken) - genau wie die Linien der Event-Seite.
 * Vor dem Start steht die Startliste (die Spieler des Spieltags) in derselben Tabelle, mit "Noch nicht gestartet" statt Punkten.
 * Die Flaggen sind immer unsere (Profil-Land, lib/globalsSolos spielerKontext), nie Epics Flagge aus dem Spiel.
 */

interface Match { sessionId?: string; placement?: number; elims?: number; endTime?: string }
interface Eintrag {
  rank: number; points: number; elims: number; games: number; wins: number;
  players: Array<{ id: string; name: string }>; matches?: Match[];
}

interface Zeile {
  key: string;
  rang: number;
  spieler: SolosSpieler;
  tag: string | null;
  punkte: number | null;
  spiele: number | null;
  siege: number | null;
  elims: number | null;
  matches: Match[];
}

const zahl = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-US') : '–');

export default function Bestenliste({ f, stufe, region, zielText, lcqText }: {
  f: SolosFenster;
  /** Epics Stufe zu diesem Spieltag (Event, Fenster, Status, Schwellen) - fehlt sie, bleibt es bei den Daten des Spieltags. */
  stufe?: SolosStufe;
  region: string;
  /** Wohin die Top N kommen ("FNCS Solos Reload Grand Finals"). */
  zielText?: string;
  /** Wohin die Plaetze dahinter kommen ("Last Chance Qualifier"). */
  lcqText?: string;
}) {
  const t = useT();
  const { sprache } = useSprache();
  const ort = sprache === 'de' ? 'de-DE' : 'en-GB';
  const zugang = useZugang();
  const darfReplay = zugang.admin || (zugang.vip && zugang.rechte.includes('replays'));

  /* -------------------------------------------------- Laeuft der Spieltag? (alle 30 s neu bewertet - ein Heat beginnt ja, waehrend die Seite offen ist) */
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => sichtbarerTakt(() => setJetzt(Date.now()), 30_000), []);
  const beginn = stufe?.begin ?? (Date.parse(f.start ?? '') || 0);
  const ende = stufe?.end ?? (Date.parse(f.end ?? '') || (beginn ? beginn + 5 * 3_600_000 : 0));
  const laeuft = stufe?.status === 'live' || (!!beginn && jetzt >= beginn && jetzt < ende + 15 * 60_000);
  const abrufbar = !!stufe?.eventId && (stufe.status !== 'kommt' || laeuft);

  /* -------------------------------------------------- Die Bestenliste von Epic (dieselbe Schnittstelle wie die Event-Seite) */
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [stand, setStand] = useState<number>(0);
  const neuester = useRef<{ w: string; zeit: number }>({ w: '', zeit: 0 });
  useEffect(() => {
    if (!abrufbar || !stufe) return undefined;
    let weg = false;
    if (neuester.current.w !== stufe.windowId) { neuester.current = { w: stufe.windowId, zeit: 0 }; setEintraege(null); setStand(0); }
    const holen = async () => {
      try {
        const r = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(stufe.eventId)}&window=${encodeURIComponent(stufe.windowId)}&limit=100`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json() as { entries?: Eintrag[]; updated?: string };
        if (weg || !d.entries?.length) return;
        // Nie rueckwaerts (wie die Event-Seite, Betreiber 14.11.2026): ein aelterer Stand aus einem Zwischenspeicher ersetzt nie den neueren.
        const zeit = Date.parse(d.updated ?? '') || 0;
        if (zeit && zeit < neuester.current.zeit) return;
        if (zeit) neuester.current.zeit = zeit;
        setEintraege(d.entries);
        setStand(zeit || Date.now());
      } catch { /* bei einem Fehler bleibt stehen, was da ist */ }
    };
    void holen();
    const ende2 = laeuft ? sichtbarerTakt(() => { void holen(); }, 5_000) : undefined;
    return () => { weg = true; if (ende2) ende2(); };
  }, [abrufbar, laeuft, stufe]);

  /* -------------------------------------------------- Welche Matches eine eigene Replay-Seite haben (nur fuer die, die sie oeffnen duerfen) */
  const rundenZahl = useMemo(() => Math.max(0, ...(eintraege ?? []).map((e) => e.games ?? 0)), [eintraege]);
  const [replays, setReplays] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!darfReplay || !stufe || !rundenZahl) return undefined;
    let weg = false;
    fetch(`/api/replay?fenster=${encodeURIComponent(stufe.windowId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { matches?: Record<string, number> } | null) => { if (!weg) setReplays(j?.matches ?? {}); })
      .catch(() => {});
    return () => { weg = true; };
  }, [darfReplay, stufe, rundenZahl]);

  /* -------------------------------------------------- Die Zeilen: Epics Liste, sonst die Ergebnisse des Spieltags, sonst die Startliste */
  const unsere = useMemo(() => {
    const m = new Map<string, SolosSpieler>();
    for (const s of f.spieler) m.set(s.id, s);
    for (const tm of f.teams ?? []) for (const s of tm.spieler) if (!m.has(s.id)) m.set(s.id, s);
    return m;
  }, [f]);
  const { zeilen, gesetzt } = useMemo((): { zeilen: Zeile[]; gesetzt: boolean } => {
    if (eintraege?.length) {
      return {
        gesetzt: false,
        zeilen: eintraege.filter((e) => e.players?.length).map((e) => {
          const p = e.players[0];
          const s = unsere.get(p.id) ?? { id: p.id, name: p.name, anzeige: kernname(p.name ?? '') || p.name, land: null, bild: null };
          return {
            key: `${e.rank}-${p.id}`, rang: e.rank, spieler: s, tag: orgtagVon(p.name ?? s.name ?? ''),
            punkte: e.points ?? null, spiele: e.games ?? null, siege: e.wins ?? null, elims: e.elims ?? null,
            matches: [...(e.matches ?? [])].sort((a, b) => String(a.endTime ?? '').localeCompare(String(b.endTime ?? ''))),
          };
        }),
      };
    }
    const gewertet = (f.teams ?? []).filter((x) => x.rang !== null && x.spieler.length).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
    if (gewertet.length) {
      return {
        gesetzt: false,
        zeilen: gewertet.map((x) => ({
          key: `${x.rang}-${x.spieler[0].id}`, rang: x.rang as number, spieler: x.spieler[0], tag: orgtagVon(x.spieler[0].name ?? ''),
          punkte: x.punkte, spiele: x.spiele ?? null, siege: x.siege, elims: x.elims ?? null, matches: [],
        })),
      };
    }
    return {
      gesetzt: true,
      zeilen: f.spieler.map((s, i) => ({ key: s.id, rang: i + 1, spieler: s, tag: orgtagVon(s.name ?? ''), punkte: null, spiele: null, siege: null, elims: null, matches: [] })),
    };
  }, [eintraege, f, unsere]);

  /* -------------------------------------------------- Der gewaehlte Spieler (zuerst Platz 1) */
  const [gewaehlt, setGewaehlt] = useState<string>('');
  const auswahl = zeilen.find((z) => z.spieler.id === gewaehlt) ?? zeilen[0];
  const panelRef = useRef<HTMLDivElement>(null);
  const waehle = (z: Zeile) => {
    setGewaehlt(z.spieler.id);
    // Am Handy steht das Fenster unter der Tabelle - dorthin scrollen, sonst sieht man nicht, dass etwas passiert ist.
    try { if (window.matchMedia('(max-width: 1023px)').matches) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ohne */ }
  };

  /* -------------------------------------------------- Qualifikationslinien (wie app/events/[id]: qualifiziert und die Last-Chance-Marke dahinter) */
  const q = stufe?.qualifiziert ?? 0;
  const lc = (stufe?.marken ?? []).find((m) => /lastchance/i.test(m.token) && m.bis > q);
  const zurueck = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/globals-solos';
  const details = stufe?.cupId ? `/events/${encodeURIComponent(stufe.cupId)}?region=${encodeURIComponent(region)}&fenster=${encodeURIComponent(stufe.windowId)}` : null;
  const datum = beginn ? new Date(beginn).toLocaleString(ort, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const linie = (art: 'gold' | 'blau', text: string) => (
    <tr aria-hidden={false}>
      <td colSpan={6} className="p-0">
        <div className={`flex items-center gap-3 border-y px-3 py-1.5 ${art === 'gold' ? 'border-amber-500/40 bg-amber-500/10' : 'border-sky-500/35 bg-sky-500/[0.07]'}`}>
          <span aria-hidden className={`h-px flex-1 ${art === 'gold' ? 'bg-amber-500/30' : 'bg-sky-500/25'}`} />
          <span className={`text-center text-[10px] font-bold uppercase tracking-[0.14em] ${art === 'gold' ? 'text-amber-400' : 'text-sky-300'}`}>↑ {text} ↑</span>
          <span aria-hidden className={`h-px flex-1 ${art === 'gold' ? 'bg-amber-500/30' : 'bg-sky-500/25'}`} />
        </div>
      </td>
    </tr>
  );

  if (!zeilen.length) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>
      </section>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------------------------------ Tabelle */}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-800 px-4 py-3">
          <h3 className="text-base font-extrabold text-slate-100">{f.name}</h3>
          <span className="text-[11px] tabular-nums text-slate-500">{datum}{datum ? ' · ' : ''}{gesetzt ? f.spieler.length : zeilen.length} <T>Spieler</T></span>
          {laeuft && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /><T>Live</T>
            </span>
          )}
          {!!stand && !gesetzt && <span className="ml-auto text-[11px] tabular-nums text-slate-500"><T>Stand</T> {new Date(stand).toLocaleTimeString(ort, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-900 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-[0_1px_0_rgb(39_39_42)]">
              <tr>
                <th className="w-9 py-2 pl-3 text-left sm:w-14">#</th>
                <th className="px-1.5 py-2 text-left sm:px-2"><T>Name</T></th>
                <th className={`${gesetzt ? 'w-36 sm:w-40' : 'w-14 sm:w-20'} px-1.5 py-2 text-right sm:px-2`}><T>Punkte</T></th>
                {!gesetzt && <>
                  <th className="w-9 px-1.5 py-2 text-right sm:w-20 sm:px-2" title="Matches"><span className="sm:hidden">M</span><span className="hidden sm:inline"><T>Matches</T></span></th>
                  <th className="w-9 px-1.5 py-2 text-right sm:w-16 sm:px-2"><span className="sm:hidden">W</span><span className="hidden sm:inline"><T>Siege</T></span></th>
                  <th className="w-11 py-2 pl-1.5 pr-3 text-right sm:w-16"><span className="sm:hidden">E</span><span className="hidden sm:inline"><T>Elims</T></span></th>
                </>}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => {
                const aktiv = auswahl?.key === z.key;
                return (
                  <Fragment key={z.key}>
                    <tr onClick={() => waehle(z)} tabIndex={0} role="button" aria-pressed={aktiv}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); waehle(z); } }}
                      className={`cursor-pointer border-t border-zinc-800/70 transition focus:outline-none focus-visible:bg-sky-500/10 ${aktiv ? 'bg-sky-500/10 shadow-[inset_3px_0_0_rgb(14_165_233)]' : 'hover:bg-white/[0.03]'}`}>
                      <td className={`py-2 pl-3 text-sm font-black tabular-nums ${z.rang <= 3 && !gesetzt ? 'text-slate-100' : 'text-slate-500'}`}>{z.rang}</td>
                      <td className="px-1.5 py-2 sm:px-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <TeamFlagge groesse={16} laender={[z.spieler.land ?? undefined]} />
                          <span className="min-w-0 truncate font-bold text-slate-100">{z.spieler.anzeige}</span>
                          {z.tag && <span className="hidden shrink-0 rounded border border-zinc-700 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:inline">{z.tag}</span>}
                        </span>
                      </td>
                      {gesetzt
                        ? <td className="py-2 pl-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]"><T>Noch nicht gestartet</T></td>
                        : <>
                          <td className="px-1.5 py-2 text-right font-extrabold tabular-nums text-slate-100 sm:px-2">{zahl(z.punkte)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-400 sm:px-2">{zahl(z.spiele)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums text-slate-400 sm:px-2">{zahl(z.siege)}</td>
                          <td className="py-2 pl-1.5 pr-3 text-right tabular-nums text-slate-400">{zahl(z.elims)}</td>
                        </>}
                    </tr>
                    {!gesetzt && q > 0 && z.rang === q && linie('gold', t('Top {n} qualifizieren sich für die {ziel}').replace('{n}', String(q)).replace('{ziel}', zielText || t('nächste Runde')))}
                    {!gesetzt && q > 0 && lc && z.rang === lc.bis && linie('blau', t('Top {n} qualifizieren sich für den {ziel}').replace('{n}', String(lc.bis)).replace('{ziel}', lcqText || 'Last Chance Qualifier'))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------ Der gewaehlte Spieler */}
      {auswahl && (
        <aside ref={panelRef} className="scroll-mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 lg:sticky lg:top-4">
          <div className="border-b border-zinc-800 p-5">
            <p className="text-3xl font-black tabular-nums text-sky-400">#{auswahl.rang}</p>
            <p className="mt-2 flex min-w-0 items-center gap-2.5">
              <TeamFlagge groesse={22} laender={[auswahl.spieler.land ?? undefined]} />
              <span className="min-w-0 truncate text-xl font-extrabold text-slate-100">{auswahl.spieler.anzeige}</span>
              {auswahl.tag && <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-slate-500">{auswahl.tag}</span>}
            </p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-slate-400">
              {gesetzt ? <T>Noch nicht gestartet</T> : <>
                {zahl(auswahl.punkte)} {t('Punkte')} · {t(auswahl.siege === 1 ? '{n} Sieg' : '{n} Siege').replace('{n}', zahl(auswahl.siege))} · {zahl(auswahl.elims)} Elims
              </>}
            </p>
            {details && (
              <Link href={details} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-400 transition hover:text-sky-300 hover:underline">
                <T>Details ansehen</T> →
              </Link>
            )}
          </div>
          <div className="max-h-[50vh] overflow-y-auto lg:max-h-[52vh]">
            {auswahl.matches.length ? (
              <ol>
                {auswahl.matches.map((m, i) => {
                  const nr = m.sessionId ? replays[m.sessionId] : undefined;
                  const inhalt = (
                    <>
                      <span className="w-8 shrink-0 font-black tabular-nums text-slate-500">#{i + 1}</span>
                      <span className="flex-1 tabular-nums text-slate-300">
                        <T>Platzierung</T>: <span className={`font-bold ${m.placement === 1 ? 'text-amber-400' : 'text-slate-100'}`}>{m.placement ?? '–'}</span>
                        <span className="mx-1.5 text-slate-600">·</span>
                        Elims: <span className="font-bold text-slate-100">{m.elims ?? '–'}</span>
                      </span>
                      {nr && <span className="shrink-0 text-[11px] font-bold text-sky-400">Replay →</span>}
                    </>
                  );
                  return (
                    <li key={m.sessionId ?? i} className="border-t border-zinc-800/70 first:border-t-0">
                      {nr && stufe
                        ? <Link href={`/match/${encodeURIComponent(stufe.windowId)}/${nr}?zurueck=${encodeURIComponent(zurueck)}`} className="flex items-center gap-2 px-5 py-2.5 text-sm transition hover:bg-sky-500/[0.06]">{inhalt}</Link>
                        : <div className="flex items-center gap-2 px-5 py-2.5 text-sm">{inhalt}</div>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="px-5 py-6 text-center text-xs text-slate-500">
                {gesetzt ? <T>Die Matches erscheinen hier, sobald gespielt wird.</T> : <T>Noch keine Matches.</T>}
              </p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
