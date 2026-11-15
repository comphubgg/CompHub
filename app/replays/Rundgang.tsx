'use client';

/*
 * Rundgang durch die Replay-Ansicht (Betreiber, 15.11.2026): elf Schritte, je ein Bereich der Seite - als Fenster mit Zurueck/Weiter
 * (auf der Game-Seite) und als Liste auf /replays/anleitung.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

export const SCHRITTE: Array<[string, string]> = [
  ['Load a replay', 'The blue button opens every analysed cup: pick a season, filter by region, open the games of a cup day or analyse the whole day. Tick up to four days to analyse them together.'],
  ['The map', 'The map shows the main island. Drag to move, scroll or use + / − to zoom, double-click to reset. The violet area is the storm, the white ring the zone, the dashed ring the next zone.'],
  ['Players', 'Every player is an arrow in his colour pointing where he looks, with his name and his shield (blue) and health (green) above. Click a player to select him.'],
  ['The bus', 'Everyone starts on the bus. The arrows show its route (yellow where you may jump); each player appears at the moment he jumped and glides to his landing spot.'],
  ['Playback', 'Play/pause (also with the space bar), speed − / +, and the time bar. "Next elimination" and "Next zone" jump straight there.'],
  ['Kill feed', 'Knocks and eliminations appear top left with flags, the weapon type and fade after a few seconds. The eye button hides the feed and the player bar.'],
  ['Settings', 'The gear button switches names, health bars, view direction, trails, bullet traces, damage numbers, elimination marks, place names, gray map, the bus route, the inventory bar, follow and focus. Your choice is remembered in this browser.'],
  ['Drawing', 'Settings → Draw: pen, arrow or circle in four colours. Ctrl+Z undoes the last stroke; Clear removes everything.'],
  ['Players and kill feed panel', 'On the right: every player with elims and damage so far, alive (green), knocked (amber) or out (red). The Killfeed tab lists every knock and elimination with the weapon held and the distance.'],
  ['One player', 'Click a player: placement, elims and damage at the current time, his timeline (landing, loot with source, damage, knocks, heals, storm, zone separators) and his weapon breakdown. A click on a row jumps there and zooms in.'],
  ['Analysis', 'Below the map: the height timeline (who held the highest ground in each zone), zone luck (how kind each zone was compared with every other possible draw) and luck vs performance.'],
];

export default function Rundgang({ offen, schliessen }: { offen: boolean; schliessen: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (offen) setI(0); }, [offen]);
  useEffect(() => {
    if (!offen) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); if (e.key === 'ArrowRight') setI((x) => Math.min(SCHRITTE.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [offen, schliessen]);
  if (!offen) return null;
  const [titel, text] = SCHRITTE[i];
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3" onClick={schliessen} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-sky-500/40 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/80"><T>Tour</T> · {i + 1}/{SCHRITTE.length}</p>
        <h2 className="mt-1 text-xl font-black text-slate-50"><T>{titel}</T></h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300"><T>{text}</T></p>
        <div className="mt-4 flex gap-1">{SCHRITTE.map((_, k) => <span key={k} className={`h-1 flex-1 rounded ${k <= i ? 'bg-sky-500' : 'bg-white/10'}`} />)}</div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={schliessen} className="text-[12px] text-slate-400 hover:text-slate-100"><T>Close</T></button>
          <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-slate-200 disabled:opacity-40">← <T>Back</T></button>
          {i < SCHRITTE.length - 1
            ? <button type="button" onClick={() => setI(i + 1)} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-sky-400"><T>Next</T> →</button>
            : <button type="button" onClick={schliessen} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-sky-400"><T>Done</T></button>}
        </div>
      </div>
    </div>
  );
}
