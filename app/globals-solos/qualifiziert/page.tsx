'use client';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import GlobalsSolosGeruest from '../GlobalsSolosGeruest';
import { Gesicht } from '../Bausteine';

/** Wer im Finale steht - gruppiert danach, wie er sich qualifiziert hat. */
export default function SolosQualifiziert() {
  const t = useT();
  return (
    <GlobalsSolosGeruest aktiv="/globals-solos/qualifiziert">
      {({ daten }) => {
        const finalZahl = daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0);
        return (
          <section>
            <h2 className="text-lg font-bold text-amber-200">
              <T>Qualifiziert für das Finale</T> <span className="text-sm font-normal text-slate-500">({finalZahl})</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500"><T>Alle, die Noble im Finale führt — gruppiert danach, wie sie sich qualifiziert haben.</T></p>
            {daten.qualifiziert.length === 0 ? (
              <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500">
                <T>Noch hat sich niemand qualifiziert.</T>
              </p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {daten.qualifiziert.map((g) => (
                  <div key={g.windowId ?? g.quelle} className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4">
                    <h3 className="flex items-baseline gap-2 text-sm font-semibold text-slate-100">
                      {g.quelle === 'Other' ? t('Sonstige') : g.quelle}
                      <span className="text-xs font-normal text-slate-500">
                        {g.spieler.length}
                        {g.art === 'qualifier' ? ` · ${t('direkt qualifiziert')}` : g.art === 'heat' ? ` · ${t('über den Heat')}` : ''}
                      </span>
                    </h3>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {g.spieler.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                          <Gesicht s={s} gross />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <TeamFlagge groesse={16} laender={[s.land ?? undefined]} />
                              <span className="truncate text-sm font-semibold text-slate-100">{s.anzeige}</span>
                            </span>
                            {s.rang !== null && (
                              <span className="block text-[11px] tabular-nums text-slate-500">
                                #{s.rang}{s.punkte !== null ? ` · ${s.punkte} ${t('Punkte')}` : ''}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
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
