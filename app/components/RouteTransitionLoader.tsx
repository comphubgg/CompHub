'use client';

import T from '@/app/components/T';

// Der Ladebildschirm zwischen zwei Seiten.
//
// Er deckte vorher alles mit schwarz zu, sodass waehrend des Wartens gar
// nichts zu sehen war. Der Nutzer wollte das anders: die Seite soll
// durchscheinen, nur eben ohne die Zahlen, die noch nicht da sind. So sieht
// man, dass etwas passiert, statt vor einer schwarzen Flaeche zu sitzen.
//
// Deshalb ein leichter Schleier statt einer Wand, das Blau der Startseite
// statt des alten Cyan, und ein Balken, der laeuft - ein Kreis, der sich
// dreht, sagt nichts darueber, ob es vorangeht.

export default function RouteTransitionLoader() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end
                    justify-center bg-zinc-950/45 p-6 backdrop-blur-[2px]">
      {/*
        * Unten statt in der Mitte: der Inhalt darueber bleibt lesbar, und
        * das Auge muss nicht ueber einen Kasten hinweg suchen, wo die Seite
        * gerade aufbaut.
        */}
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden
                      rounded-2xl border border-zinc-800 bg-zinc-950/95
                      shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping
                             rounded-full bg-sky-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full
                             bg-sky-500" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100">
              <T>Wird geladen …</T>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              <T>Die Zahlen kommen gleich — der Rest der Seite steht schon.</T>
            </p>
          </div>
        </div>

        {/*
          * Ein durchlaufender Balken, kein Fortschritt: wie lange es dauert,
          * weiss niemand, und ein Balken, der bei 90 Prozent stehen bleibt,
          * ist schlimmer als gar keiner.
          */}
        <div className="h-0.5 w-full overflow-hidden bg-zinc-900">
          <div className="h-full w-1/3 animate-[comphub-lauf_1.1s_ease-in-out_infinite]
                          bg-sky-500" />
        </div>
      </div>

    </div>
  );
}
