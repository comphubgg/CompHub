'use client';

/*
 * Anleitung zur Replay-Ansicht (Betreiber, 15.11.2026): ein kurzer Artikel ueber die Zone (Abstaende, Zug, Totzone, Zonen-Glueck) und der Rundgang
 * durch die Oberflaeche. Eigene Worte; Zahlen aus unseren ausgewerteten Replays.
 */

import Link from 'next/link';
import T from '@/app/components/T';
import { SCHRITTE } from '../Rundgang';
import { FORMEL_GLUECK, FORMEL_SCHAETZUNG } from '../analyse';

const ABSCHNITTE: Array<[string, string]> = [
  ['Zone sizes', 'Every game runs through a fixed list of circles. On the Reload islands they shrink from 1,000 m to 600, 425, 320, 265, 200, 100, 50 and 25 m before the last small circles; the radius of each circle is in the Zones table under every replay.'],
  ['Distance to the zone', 'What matters is not the distance to the centre of the next circle but to its edge: a player standing inside the new circle is already safe, however far he is from its middle. Our zone luck therefore measures the distance to the edge.'],
  ['How far a zone can pull', 'In the early circles the next circle lies completely inside the current one, so its centre can move at most "current radius − new radius". In our Reload replays the first pulls used about a quarter of that room. From the mid game on Reload circles move: the new circle can leave the old one, and the pull can be several times the shrink.'],
  ['Pulled back and centre', 'A circle that lands close to the old centre ("centre zone") keeps everyone in the game; a circle pulled to one side favours whoever already stands there and forces everyone else to rotate through the lobby.'],
  ['Dead side', 'The part of the old circle that the new circle does not cover is the dead side. Players standing there have to move first and usually through other players.'],
  ['Holding the edge', 'Staying at the edge of the zone and taking a few storm ticks on purpose (tanking) can be the safer route. The storm time of every player is in the player table under each replay.'],
  ['Where the next zone can appear', 'Think of every circle the game could have drawn at the same distance from the old centre - in every direction. Our zone luck compares the real circle with all of them.'],
  ['Zone luck compared', FORMEL_GLUECK],
  ['Performance against the estimate', FORMEL_SCHAETZUNG],
];

export default function Anleitung() {
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <Link href="/replays" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">← <T>All replays</T></Link>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl"><T>Replay guide</T></h1>
        <p className="mt-2 text-sm text-slate-400"><T>How the zone works, how we measure zone luck, and a tour of the replay view.</T></p>

        <h2 className="mt-8 text-xl font-black"><T>The zone</T></h2>
        <div className="mt-3 space-y-3">
          {ABSCHNITTE.map(([t, x]) => (
            <section key={t} className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4">
              <h3 className="text-[15px] font-bold text-sky-200"><T>{t}</T></h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300"><T>{x}</T></p>
            </section>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-black"><T>Tour of the replay view</T></h2>
        <ol className="mt-3 space-y-2">
          {SCHRITTE.map(([t, x], i) => (
            <li key={t} className="flex gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500 text-[12px] font-black text-white">{i + 1}</span>
              <span><b className="text-[14px] text-slate-50"><T>{t}</T></b><span className="mt-1 block text-[13px] leading-relaxed text-slate-300"><T>{x}</T></span></span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
