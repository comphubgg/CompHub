'use client';

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import LaenderListe from '@/app/components/LaenderListe';
import type { SolosDaten } from '@/lib/globalsSolos';
import GlobalsSolosGeruest from '../GlobalsSolosGeruest';

/** Die Länderliste der Solos: je Spieltag (Fast Tracks, Heat 1, Heat 2, Finals) oder alle zusammen. */
function Inhalt({ daten }: { daten: SolosDaten }) {
  const [wahl, setWahl] = useState('alle');
  const spieler = useMemo(() => {
    if (wahl !== 'alle') return daten.fenster.find((f) => f.windowId === wahl)?.spieler ?? [];
    const m = new Map<string, { land: string | null }>();
    for (const f of daten.fenster) for (const s of f.spieler) if (!m.has(s.id)) m.set(s.id, { land: s.land });
    return [...m.values()];
  }, [daten, wahl]);

  const chip = (an: boolean) => `rounded-lg px-3.5 py-2 text-sm transition ${an
    ? 'bg-amber-400/15 font-semibold text-amber-200 ring-1 ring-amber-400/40'
    : 'text-slate-300 hover:bg-white/5 hover:text-amber-200'}`;

  return (
    <section>
      <h2 className="text-lg font-bold text-amber-200"><T>Spieler nach Land</T></h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setWahl('alle')} className={chip(wahl === 'alle')}><T>Alle zusammen</T></button>
        {daten.fenster.map((f) => (
          <button key={f.windowId} type="button" onClick={() => setWahl(f.windowId)} className={chip(wahl === f.windowId)}>
            {f.name} <span className="text-xs text-slate-500">{f.spieler.length}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 max-w-2xl"><LaenderListe spieler={spieler} /></div>
    </section>
  );
}

export default function SolosLaender() {
  return (
    <GlobalsSolosGeruest aktiv="/globals-solos/laender">
      {({ daten }) => <Inhalt daten={daten} />}
    </GlobalsSolosGeruest>
  );
}
