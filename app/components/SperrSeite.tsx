'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { HINWEISE, type Zustand } from '@/lib/sektionen';

/*
 * Was statt eines gesperrten Bereichs dasteht.
 *
 * Nur die Darstellung - wer sie zeigt, entscheiden zwei andere Stellen: der
 * Rahmen auf dem Server (damit der Inhalt gar nicht erst ausgeliefert wird)
 * und die Sperre im Browser (damit ein Umschalten binnen Sekunden greift,
 * ohne dass jemand neu laedt). Beide sollen dasselbe zeigen, also steht es
 * hier einmal.
 */

export interface SperrAngaben {
  zustand: Exclude<Zustand, 'online'>;
  /** Wie der Bereich heisst - fuer die Ueberschrift. */
  name: string;
  hinweis: string;
  eigenerTitel?: string;
  eigenerText?: string;
  /** Wohin man stattdessen gehen kann - nur, was wirklich offen ist. */
  andere: Array<{ schluessel: string; pfad: string; titel: string }>;
}

export default function SperrSeite({ angaben }: { angaben: SperrAngaben }) {
  const t = useT();
  const { zustand, name, andere } = angaben;

  const vorlage = HINWEISE.find((h) => h.schluessel === angaben.hinweis)
    ?? HINWEISE[0];

  const titel = zustand === 'offline'
    ? t('{bereich} ist gerade nicht verfügbar.').replace('{bereich}', t(name))
    : (angaben.eigenerTitel
      || t(vorlage.titel).replace('{bereich}', t(name)));

  const text = zustand === 'offline'
    ? t('Dieser Bereich ist momentan nicht Teil der Seite. Er kommt wieder — '
      + 'in der Zwischenzeit findest du alles Übrige oben in der Leiste.')
    : (angaben.eigenerText || t(vorlage.text));

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-xl text-center">

        {/* Das Logo, ruhig atmend, mit einem Schein in der Hausfarbe. */}
        <div className="relative mx-auto mb-10 grid h-40 w-40 place-items-center">
          <span aria-hidden
            className="sperre-schein absolute inset-0 rounded-full bg-sky-500/30
                       blur-2xl" />
          <span aria-hidden
            className="sperre-ring absolute inset-2 rounded-full border
                       border-dashed border-sky-500/25" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo.png" alt="CompHub"
            className="sperre-logo relative h-24 w-24 rounded-2xl object-contain" />
        </div>

        <p className="mb-5 inline-flex items-center gap-2 rounded-full border
                      border-sky-500/40 bg-sky-500/10 px-4 py-1.5 text-xs
                      font-semibold uppercase tracking-[0.18em] text-sky-400">
          <span aria-hidden className={`h-2 w-2 rounded-full ${zustand === 'standby'
            ? 'bg-amber-400' : 'bg-rose-500'}`} />
          {zustand === 'standby' ? <T>in Bearbeitung</T> : <T>nicht verfügbar</T>}
        </p>

        <h1 className="text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">
          {titel}
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-400">
          {text}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/"
            className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold
                       text-white transition hover:bg-sky-400">
            <T>zur Startseite</T>
          </Link>
        </div>

        {/*
          * Was es sonst noch gibt.
          *
          * Wer vor einer zugesperrten Tuer steht, soll nicht raten muessen,
          * wohin sonst. Gesperrte und ausgeblendete Bereiche stehen hier
          * natuerlich nicht.
          */}
        {andere.length > 0 && (
          <div className="mt-12 border-t border-zinc-900 pt-6">
            <p className="mb-3 text-[11px] uppercase tracking-[0.16em]
                          text-slate-600">
              <T>Weiter geht es hier</T>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {andere.map((s) => (
                <Link key={s.schluessel} href={s.pfad}
                  className="rounded-lg border border-zinc-800 px-4 py-2 text-sm
                             text-slate-400 transition hover:border-sky-500/60
                             hover:text-sky-400">
                  <T>{s.titel}</T>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
