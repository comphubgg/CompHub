'use client';

import Link from 'next/link';
import T from '@/app/components/T';
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

export default function GlobalsStart() {
  return (
    <GlobalsGeruest aktiv="/globals">
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-400">
        <T>Alles zur Global Championship an einem Ort — die Einblendungen für
        deinen Stream, das Feld, die Karte und der Tipp auf den Ausgang. Die
        Overlays kennen nur dieses Turnier; einen Cup auszuwählen gibt es hier
        nicht.</T>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {GLOBALS_SEITEN.map((s) => (
          <Link key={s.pfad} href={s.pfad}
            className="group rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4
                       transition hover:border-amber-400/60 hover:bg-amber-500/[0.06]">
            <p className="text-base font-semibold text-amber-200
                          group-hover:text-amber-100">
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
              className="rounded-lg border border-amber-500/25 bg-zinc-950/60
                         px-3 py-1.5 text-xs text-amber-200/90">
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
