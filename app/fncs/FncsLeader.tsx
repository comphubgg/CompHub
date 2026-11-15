'use client';

/*
 * /fncs, Reiter "Leaders" (Betreiber, 15.11.2026): die Tournament Leaders (app/components/TurnierLeader.tsx) fuer jeden FNCS-Spieltag einer Region -
 * Qualifiers, Heats, Last Chance, Finals, auch vergangene; mehrtaegige Finals zusaetzlich als ganzes Event (Day 1 + Day 2).
 * Die Auswahl kommt aus /api/turnier-leader?fncs=1 (Cup-Archiv), neueste zuerst.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useAdressWert } from '@/app/lib/adressWert';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';
import TurnierLeader from '@/app/components/TurnierLeader';
import RegionVergleich from '@/app/components/RegionVergleich';

interface Fenster { schluessel: string; titel: string; cup: string; event: string; window: string; windows?: string[]; begin: number; region: string }

export default function FncsLeader() {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [region, setRegion] = useAdressWert<string>('lregion', 'EU', REGIONEN_REIHE);
  const [wahl, setWahl] = useAdressWert<string>('spieltag', '');
  const [liste, setListe] = useState<{ region: string; fenster: Fenster[] } | null>(null);

  useEffect(() => {
    let weg = false;
    fetch(`/api/turnier-leader?fncs=1&region=${encodeURIComponent(region)}`).then((r) => r.json())
      .then((j: { fenster?: Fenster[] }) => { if (!weg) setListe({ region, fenster: j.fenster ?? [] }); })
      .catch(() => { if (!weg) setListe({ region, fenster: [] }); });
    return () => { weg = true; };
  }, [region]);

  const fenster = useMemo(() => (liste?.region === region ? liste.fenster : null), [liste, region]);
  const gewaehlt = fenster?.find((f) => f.schluessel === wahl) ?? fenster?.[0] ?? null;
  const datum = (ms: number) => new Intl.DateTimeFormat(ort, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' }).format(new Date(ms));
  const chip = (an: boolean) => `rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an
    ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
          {REGIONEN_REIHE.map((r) => (
            <button key={r} type="button" onClick={() => { setRegion(r); setWahl(''); }} className={chip(region === r)}>{r}</button>
          ))}
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-400 sm:ml-auto sm:max-w-md sm:flex-none">
          <span className="shrink-0"><T>FNCS-Spieltag</T></span>
          <select value={gewaehlt?.schluessel ?? ''} onChange={(e) => setWahl(e.target.value)} disabled={!fenster?.length}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500 sm:w-80">
            {(fenster ?? []).map((f) => <option key={f.schluessel} value={f.schluessel}>{f.titel} · {datum(f.begin)}</option>)}
          </select>
        </label>
      </div>
      {!fenster && <div className="h-72 animate-pulse rounded-2xl bg-zinc-900/70" />}
      {fenster && !gewaehlt && <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegen noch keine Werte je Spieler vor.</T></p>}
      {gewaehlt && (
        <>
          <TurnierLeader key={gewaehlt.schluessel} kompakt eventId={gewaehlt.event} windowId={gewaehlt.window} windows={gewaehlt.windows ?? null}
            titel={`${gewaehlt.titel} · ${gewaehlt.region}`} />
          <RegionVergleich key={`rv-${gewaehlt.schluessel}`} eventId={gewaehlt.event} windowId={gewaehlt.window} windows={gewaehlt.windows ?? null} />
          {gewaehlt.cup && <p className="mt-2 text-right text-xs">
            <Link href={`/events/${encodeURIComponent(gewaehlt.cup)}?region=${encodeURIComponent(gewaehlt.region)}&fenster=${encodeURIComponent(gewaehlt.window)}`} className="text-sky-400 hover:text-sky-300">
              Player Stats →
            </Link>
          </p>}
        </>
      )}
    </div>
  );
}
