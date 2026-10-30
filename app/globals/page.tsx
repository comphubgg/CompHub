'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import GlobalsGeruest, { GLOBALS_SEITEN } from './GlobalsGeruest';
import { GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Die Globals-Seite - der Einstieg in die vier Funktionen.
 *
 * Mehr als vier Kacheln braucht es hier nicht: der Betreiber wollte im
 * VIP-Dashboard einen einzigen Knopf, der hierher fuehrt, und von hier aus
 * "die drei, vier verschiedenen Funktionen benutzen".
 */

/** Der 26. und der 27. September, wie sie auf der Seite stehen sollen. */
function tagText(begin: number): string {
  /*
   * Der Spieltag beginnt am Vorabend nach UTC (25.9. um 22 Uhr), hier zaehlt
   * aber der Tag, an dem er stattfindet. Gerechnet wird deshalb in der Zeit
   * des Turniers - Antwerpen, also Mitteleuropa.
   */
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    timeZone: 'Europe/Brussels',
  }).format(new Date(begin));
}

interface EndTeam { rang: number; punkte: number; elims: number; siege: number; spiele?: number; spieler: Array<{ id: string; anzeige: string; land: string | null; bild: string | null }> }

/**
 * Der Endstand - nach beiden Tagen zusammen, alle Teams. Das Siegerteam gross, der Rest als Tabelle.
 * Betreiber (13.10.2026): die Globals-Seite war "zu simpel" - nur Kacheln. Jetzt steht das Ergebnis oben.
 */
function Endstand() {
  const [teams, setTeams] = useState<EndTeam[] | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let weg = false;
    fetch('/api/globals-endstand').then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setTeams(j.teams); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);
  if (fehler) return <p className="mb-6 text-xs text-slate-600"><T>Der Endstand ließ sich gerade nicht laden.</T></p>;
  if (!teams?.length) return null;
  const [sieger, ...rest] = teams;
  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-400/[0.14] via-zinc-900/60 to-zinc-950 p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-300/90"><T>Sieger</T></p>
        {/* Die Sieger mit Foto (Betreiber, 30.10.2026: "Ich LIEBE Bilder") - ohne Foto die Silhouette, Name und Flagge darunter. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {sieger.spieler.map((p) => (
            <div key={p.id} className="min-w-0">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-sky-400/30 bg-zinc-900">
                {p.bild
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.bild} alt="" className="h-full w-full object-cover object-top" />
                  : <SpielerPlatzhalter name={p.anzeige} />}
              </div>
              <p className="mt-2 flex items-center gap-2 text-xl font-black uppercase leading-tight tracking-tight text-sky-100">
                <TeamFlagge groesse={20} laender={[p.land ?? undefined]} /><span className="truncate">{p.anzeige}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-4">
          {([['Punkte', sieger.punkte], ['Eliminierungen', sieger.elims], ['Siege', sieger.siege]] as Array<[string, number]>).map(([l, v], i) => (
            <div key={l} className={i === 0 ? 'pr-4' : 'px-4'}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{l}</T></p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-50">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40">
        <p className="border-b border-white/[0.08] bg-zinc-900/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400"><T>Endstand nach beiden Tagen</T></p>
        <ol className="max-h-[640px] overflow-y-auto">
          {rest.map((x) => (
            <li key={x.rang} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 last:border-b-0">
              <span className="w-5 text-center text-xs font-black tabular-nums text-slate-500">{x.rang}</span>
              <TeamFlagge groesse={26} laender={x.spieler.map((p) => p.land ?? undefined)} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase text-slate-100">{x.spieler.map((p) => p.anzeige).join(' · ')}</span>
              <span className="text-[11px] tabular-nums text-slate-500">{x.elims} <T>Elims</T></span>
              <span className="w-12 text-right text-sm font-black tabular-nums text-sky-400">{x.punkte}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function GlobalsStart() {
  return (
    <GlobalsGeruest aktiv="/globals">
      {/* Die Beschreibung steht schon im Seitenkopf (GlobalsGeruest). */}
      <Endstand />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {GLOBALS_SEITEN.map((s) => (
          <Link key={s.pfad} href={s.pfad}
            className="group rounded-xl border border-sky-500/20 bg-zinc-900/40 p-4
                       transition hover:border-sky-400/60 hover:bg-sky-500/[0.06]">
            <p className="text-base font-semibold text-sky-200
                          group-hover:text-sky-100">
              <T>{s.titel}</T>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <T>{s.was}</T>
            </p>
          </Link>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100"><T>Die Spieltage</T></h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GLOBALS_TAGE.map((tag) => (
            <span key={tag.windowId}
              className="rounded-lg border border-sky-500/25 bg-zinc-950/60
                         px-3 py-1.5 text-xs text-sky-200/90">
              {tag.titel} · {tagText(tag.begin)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          <T>Welche Spieltage es wirklich gibt, holt jede Seite aus Epics
          Turnierkatalog. Kommt dort ein dritter Tag dazu, steht er
          überall von selbst mit drin.</T>
        </p>
      </section>
    </GlobalsGeruest>
  );
}
