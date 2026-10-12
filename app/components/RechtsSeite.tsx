'use client';

import Link from 'next/link';
import { useSprache } from '@/app/components/SprachProvider';
import Fusszeile from '@/app/components/Fusszeile';

/*
 * Der Rahmen fuer Datenschutz und Nutzungsbedingungen.
 *
 * Beide Seiten brauchen dasselbe: ein lesbarer Text in beiden Sprachen, eine Gliederung, Stand und Kontakt. Der
 * Text steht je Sprache vollstaendig da (statt Satz fuer Satz uebersetzt) - rechtliche Texte werden als Ganzes
 * gelesen und gepflegt, und ein Satz, der in der anderen Sprache anders klingt, ist dort ein anderer Satz.
 */

export interface RechtsAbschnitt {
  titel: string;
  absaetze?: string[];
  liste?: string[];
}

export interface RechtsText {
  titel: string;
  stand: string;
  einleitung: string;
  abschnitte: RechtsAbschnitt[];
}

export default function RechtsSeite({ de, en, anderer }: {
  de: RechtsText; en: RechtsText;
  /** Der Verweis auf die jeweils andere Seite (Datenschutz <-> Nutzungsbedingungen). */
  anderer: { pfad: string; de: string; en: string };
}) {
  const { sprache } = useSprache();
  const text = sprache === 'de' ? de : en;
  return (
    <>
      <main className="flex-1 bg-zinc-950 px-4 py-12 text-slate-300">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">{text.titel}</h1>
          <p className="mt-2 text-xs text-slate-500">{text.stand}</p>
          <p className="mt-6 text-sm leading-relaxed">{text.einleitung}</p>

          <nav aria-label="Inhalt" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <ol className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {text.abschnitte.map((a, i) => (
                <li key={a.titel}>
                  <a href={`#a${i + 1}`} className="text-slate-400 transition hover:text-sky-400">
                    {i + 1}. {a.titel}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {text.abschnitte.map((a, i) => (
            <section key={a.titel} id={`a${i + 1}`} className="mt-10 scroll-mt-20">
              <h2 className="text-lg font-semibold text-slate-100">{i + 1}. {a.titel}</h2>
              {a.absaetze?.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed">{p}</p>
              ))}
              {a.liste && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-slate-600">
                  {a.liste.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
            </section>
          ))}

          <p className="mt-12 border-t border-zinc-900 pt-6 text-xs text-slate-500">
            <Link href={anderer.pfad} className="text-sky-400 hover:text-sky-300">
              {sprache === 'de' ? anderer.de : anderer.en}
            </Link>
            {' · '}
            <Link href="/" className="text-slate-500 hover:text-sky-400">CompHub</Link>
          </p>
        </article>
      </main>
      <Fusszeile />
    </>
  );
}
