'use client';

// Der Umschalter zwischen Deutsch und Englisch.
//
// Er sitzt fest unten rechts, damit er auf jeder Seite an derselben Stelle
// ist und beim Scrollen nicht verschwindet. Beide Sprachen stehen
// nebeneinander statt hinter einem Menue: so sieht man ohne Klick, welche
// gerade gilt, und ein einziger Klick wechselt.

import { SPRACHEN } from '@/app/lib/sprache';
import { useSprache } from './SprachProvider';

export default function Sprachschalter() {
  const { sprache, setzeSprache } = useSprache();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-0.5
                    rounded-full border border-zinc-700 bg-zinc-950/90 p-1
                    shadow-lg backdrop-blur">
      {SPRACHEN.map((s) => (
        <button key={s.kennung} onClick={() => setzeSprache(s.kennung)}
          title={s.name} aria-label={s.name}
          aria-pressed={sprache === s.kennung}
          className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide
                      transition ${sprache === s.kennung
            ? 'bg-sky-500 text-white'
            : 'text-slate-400 hover:text-slate-200'}`}>
          {s.kurz}
        </button>
      ))}
    </div>
  );
}
