'use client';

import { useState } from 'react';
import T from '@/app/components/T';
import type { SolosDaten } from '@/lib/globalsSolos';
import { Karte } from '../Bausteine';
import type { SolosFenster } from '@/lib/globalsSolos';

/** Solos: ab zwei auf einer Stelle rot; bei Teams ab drei. */
const rotFuer = (f: SolosFenster) => ((f.teams ?? []).some((t) => t.spieler.length > 1) ? 3 : 2);

/** Die Karte eines Spieltags; oben die Wahl des Fensters. Standard: das Finale, sonst das erste. */
export default function SolosKarte({ daten }: { daten: SolosDaten }) {
  const [wahl, setWahl] = useState<string>('');
  const fenster = daten.fenster;
  const aktiv = fenster.find((f) => f.windowId === wahl) ?? fenster.find((f) => f.art === 'finale') ?? fenster[0];
  return (
    <section>
      <h2 className="text-lg font-bold text-amber-200"><T>Karte</T></h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {fenster.map((f) => (
          <button key={f.windowId} type="button" onClick={() => setWahl(f.windowId)}
            className={`rounded-lg px-3.5 py-2 text-sm transition ${aktiv?.windowId === f.windowId
              ? 'bg-amber-400/15 font-semibold text-amber-200 ring-1 ring-amber-400/40'
              : 'text-slate-300 hover:bg-white/5 hover:text-amber-200'}`}>
            {f.name}
          </button>
        ))}
      </div>
      <div className="mt-4">{aktiv && <Karte key={aktiv.windowId} f={aktiv} bild={aktiv.bild} rotAb={rotFuer(aktiv)} />}</div>
    </section>
  );
}
