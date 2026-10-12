'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import GlobalsSolosGeruest, { FensterChips, SOLOS_SEITEN } from './GlobalsSolosGeruest';

/*
 * FNCS Globals Solos - der Einstieg.
 *
 * Wie /globals: eine Kachel je Bereich, darunter die Spieltage. Die Zahlen auf den Kacheln zeigen, was gerade in
 * jedem Bereich steht - alles kommt von selbst von Noble Practice (lib/globalsSolos).
 */
export default function GlobalsSolos() {
  return (
    <GlobalsSolosGeruest aktiv="/globals-solos">
      {({ daten }) => {
        const finalZahl = daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0);
        const heats = daten.fenster.filter((f) => f.art === 'heat');
        const zahl: Record<string, string> = {
          '/globals-solos/qualifiziert': String(finalZahl),
          '/globals-solos/heats': String(heats.length),
          '/globals-solos/map': String(daten.fenster.length),
          '/globals-solos/laender': String(new Set(daten.fenster.flatMap((f) => f.spieler.map((x) => x.land ?? ''))).size),
        };
        return (
          <>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
              <T>Die Solos der Global Championship an einem Ort — wer im Finale steht, die Heats und die Karte jedes Spieltags.</T>
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SOLOS_SEITEN.map((s) => (
                <Link key={s.pfad} href={s.pfad}
                  className="group rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4 transition hover:border-amber-400/60 hover:bg-amber-500/[0.06]">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-semibold text-amber-200 group-hover:text-amber-100"><T>{s.titel}</T></span>
                    <span className="text-sm tabular-nums text-slate-500">{zahl[s.pfad]}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500"><T>{s.was}</T></p>
                </Link>
              ))}
            </div>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-slate-100"><T>Die Spieltage</T></h2>
              <div className="mt-3"><FensterChips daten={daten} /></div>
            </section>
          </>
        );
      }}
    </GlobalsSolosGeruest>
  );
}
