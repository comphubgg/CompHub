'use client';

/*
 * Region MVPs und Regionenvergleich (Betreiber, 15.11.2026): derselbe Spieltag in allen sieben Regionen - je Region der Event MVP (unser Rating, je Spieltag
 * normiert) und je Kennzahl die besten fuenf ueber alle Regionen (rohe Werte). Daten: /api/turnier-leader?regionen=1. Erst auf Knopfdruck geladen (7 Spieltage).
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { regionFarbe } from '@/lib/regionFarbe';
import { zeitText } from '@/app/components/TurnierLeader';
import type { LeaderMvp } from '@/lib/turnierLeader';

interface Antwort {
  regionen: Array<{ region: string; window: string; vorhanden: boolean; mvp: LeaderMvp | null; gewertet: number; replayStand: { gelesen: number; gesamt: number } | null }>;
  vergleich: Array<{ schluessel: string; titel: string; nachkomma: number; zeit: boolean; zeilen: Array<{ epicId: string; name: string; land: string; wert: number; rang: number; region: string }> }>;
}

export default function RegionVergleich({ eventId, windowId, windows }: { eventId: string; windowId: string; windows?: string[] | null }) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [an, setAn] = useState(false);
  const adresse = `/api/turnier-leader?regionen=1&window=${encodeURIComponent(windowId)}&event=${encodeURIComponent(eventId)}${windows && windows.length > 1 ? `&windows=${windows.map(encodeURIComponent).join(',')}` : ''}`;
  const [daten, setDaten] = useState<{ a: string; d: Antwort | null } | null>(null);
  useEffect(() => {
    if (!an) return;
    let weg = false;
    fetch(adresse).then((r) => r.json()).then((d: Antwort) => { if (!weg) setDaten({ a: adresse, d: Array.isArray(d?.regionen) ? d : null }); })
      .catch(() => { if (!weg) setDaten({ a: adresse, d: null }); });
    return () => { weg = true; };
  }, [an, adresse]);
  const d = daten?.a === adresse ? daten.d : null;
  const laedt = an && daten?.a !== adresse;
  const zahl = (v: number, n = 0) => v.toLocaleString(ort, { minimumFractionDigits: n, maximumFractionDigits: n });

  return (
    <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-400">Region MVPs · Region Comparison</p>
          <p className="text-xs text-slate-500"><T>Derselbe Spieltag in allen Regionen – je Region der beste im Rating, je Kennzahl die besten fünf weltweit.</T></p>
        </div>
        {!an && (
          <button type="button" onClick={() => setAn(true)} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400">
            <T>Alle Regionen vergleichen</T>
          </button>
        )}
      </header>
      {laedt && <div className="mt-4 h-48 animate-pulse rounded-xl bg-zinc-900/70" />}
      {an && !laedt && !d && <p className="mt-4 text-sm text-slate-500"><T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>}
      {d && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {d.regionen.map((r) => {
              const f = regionFarbe(r.region);
              return (
                <div key={r.region} className="rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2">
                  <p className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${f.marke}`}>{r.region}</p>
                  {r.mvp ? (
                    <>
                      <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm font-bold text-slate-100"><TeamFlagge laender={[r.mvp.land || null]} groesse={14} /><span className="truncate">{r.mvp.name}</span></p>
                      <p className="text-[11px] tabular-nums text-sky-300">Rating {zahl(r.mvp.rating, 1)}</p>
                      <p className="text-[11px] tabular-nums text-slate-400">{r.mvp.elims} elims · {r.mvp.damage != null ? zahl(r.mvp.damage) : '–'} dmg{r.mvp.quote != null ? ` · ${zahl(r.mvp.quote, 2)}` : ''}</p>
                      <p className="text-[11px] tabular-nums text-slate-500">{r.mvp.headshots ?? '–'} HS · {r.mvp.hits ?? '–'} hits · {r.mvp.builds != null ? zahl(r.mvp.builds) : '–'} builds</p>
                    </>
                  ) : <p className="mt-1.5 text-xs text-slate-600"><T>Noch keine Werte je Spieler.</T></p>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.vergleich.map((t) => (
              <section key={t.schluessel} className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/80">
                <p className="border-b border-white/[0.06] bg-zinc-800/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{t.titel}</p>
                <ol className="divide-y divide-white/[0.04]">
                  {t.zeilen.map((z) => (
                    <li key={`${z.region}-${z.epicId}`} className="flex items-center gap-2 px-3 py-[7px] text-sm">
                      <span className={`w-5 shrink-0 text-right text-xs font-bold tabular-nums ${z.rang === 1 ? 'text-sky-400' : 'text-slate-500'}`}>{z.rang}</span>
                      <span className={`shrink-0 rounded border px-1 text-[9px] font-bold ${regionFarbe(z.region).marke}`}>{z.region}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-200">{z.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-100">{t.zeit ? zeitText(z.wert) : zahl(z.wert, t.nachkomma)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
