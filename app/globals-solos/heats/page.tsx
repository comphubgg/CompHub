'use client';

import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import GlobalsSolosGeruest from '../GlobalsSolosGeruest';
import { datum, uhr } from '../Bausteine';

/** Die Heats mit ihren Spielern. */
export default function SolosHeats() {
  return (
    <GlobalsSolosGeruest aktiv="/globals-solos/heats">
      {({ daten }) => {
        const heats = daten.fenster.filter((f) => f.art === 'heat');
        return (
          <section>
            <h2 className="text-lg font-bold text-amber-200"><T>Heats</T></h2>
            {heats.length === 0 ? (
              <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500">
                <T>Noch keine Heats eingeteilt.</T>
              </p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {heats.map((h) => (
                  <div key={h.windowId} className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4">
                    <h3 className="flex items-baseline gap-2 text-sm font-semibold text-slate-100">
                      {h.name}
                      <span className="text-xs font-normal text-slate-500">{datum(h.start)} {uhr(h.start)} · {h.spieler.length} <T>Spieler</T></span>
                    </h3>
                    {h.spieler.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>
                    ) : (
                      <ol className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {h.spieler.map((s, i) => {
                          const platz = h.teams?.find((x) => x.spieler.some((p) => p.id === s.id));
                          return (
                            <li key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                              <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-slate-600">{platz?.rang ?? i + 1}</span>
                              <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />
                              <span className="min-w-0 flex-1 truncate text-slate-200">{s.anzeige}</span>
                              {platz?.punkte != null && <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{platz.punkte}</span>}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      }}
    </GlobalsSolosGeruest>
  );
}
