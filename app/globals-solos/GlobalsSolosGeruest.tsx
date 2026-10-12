'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { sichtbarerTakt } from '@/app/lib/takt';
import type { SolosDaten } from '@/lib/globalsSolos';
import { BLAU, datum, uhr } from './Bausteine';

/*
 * Das Geruest der Globals-Solos-Seiten.
 *
 * Der Betreiber (12.10.2026): die Solos-Seite soll "wie bei Globals normal mehrere Seiten" haben - nicht mehr
 * alles untereinander auf einer. Dasselbe Prinzip wie app/globals/GlobalsGeruest.tsx: eine Kopfzeile mit dem
 * Turnierbild und der Leiste, darunter je Bereich eine eigene Adresse. Die Daten holt das Geruest einmal und
 * reicht sie an die Seite weiter; sie kommen weiter von selbst von Noble Practice (lib/globalsSolos), hier wird
 * nichts eingetragen und nichts gespeichert. Die Seite erneuert sich alle zwei Minuten.
 */

/** Was es unter /globals-solos gibt - dieselbe Reihenfolge wie in der Leiste. */
export const SOLOS_SEITEN: Array<{ pfad: string; titel: string; was: string }> = [
  { pfad: '/globals-solos/qualifiziert', titel: 'Qualifiziert', was: 'Wer im Finale steht, und wie er sich qualifiziert hat' },
  { pfad: '/globals-solos/heats', titel: 'Heats', was: 'Die Spieler jedes Heats' },
  { pfad: '/globals-solos/map', titel: 'Map', was: 'Die Karte jedes Spieltags - wer wo landet' },
  { pfad: '/globals-solos/laender', titel: 'Länder', was: 'Spieler nach Land — je Spieltag' },
];

export default function GlobalsSolosGeruest({ aktiv, children }: {
  /** Der Pfad des aktiven Bereichs, etwa "/globals-solos/heats"; leer fuer die Uebersicht. */
  aktiv?: string;
  children: (d: { daten: SolosDaten; laedt: boolean }) => ReactNode;
}) {
  const t = useT();
  const zugang = useZugang();
  const [daten, setDaten] = useState<SolosDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);

  const holen = useCallback(async (frisch: boolean) => {
    setLaedt(true);
    try {
      const r = await fetch(`/api/globals-solos${frisch ? '?frisch=1' : ''}`, { cache: 'no-store' });
      const j = await r.json() as ({ ok: true } & SolosDaten) | { ok: false; error?: string };
      if (!r.ok || !j.ok) throw new Error(('error' in j && j.error) || 'nicht ladbar');
      setDaten(j); setFehler('');
    } catch (e) {
      setFehler((e as Error).message);
    } finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    void holen(false);
    return sichtbarerTakt(() => { void holen(false); }, 120_000);
  }, [holen]);

  /*
   * Fuer alle offen.
   *
   * Der Betreiber (12.10.2026): die Solos-Seite darf "oeffentlich" sein, "als goldene Extra". Die Daten waren ohnehin ohne
   * Anmeldung abrufbar (/api/globals-solos); jetzt steht auch die Seite jedem offen. Den Knopf "Aktualisieren" hat nur der Admin.
   */
  const hier = aktiv ?? '/globals-solos';

  return (
    <main className="flex-1 bg-zinc-950 text-slate-200">
      <div className="relative overflow-hidden border-b border-amber-500/25">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url('/overlay/globals/fncs-breit.jpg')" }} />
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${BLAU}55, transparent 55%), rgba(0,0,0,.72)` }} />
        <div className="relative mx-auto max-w-[1500px] px-4 py-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">
            FNCS Solos · EU
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: '#ffd766' }}>
            FNCS Globals Solos 2026
          </h1>

          <nav className="mt-4 flex flex-wrap gap-1.5">
            {[{ pfad: '/globals-solos', titel: 'Übersicht', was: 'Alles auf einen Blick' }, ...SOLOS_SEITEN].map((s) => {
              const an = s.pfad === '/globals-solos' ? hier === s.pfad : hier === s.pfad || hier.startsWith(`${s.pfad}/`);
              return (
                <Link key={s.pfad} href={s.pfad} title={t(s.was)}
                  className={`rounded-lg px-3.5 py-2 text-sm transition ${an
                    ? 'bg-amber-400/15 font-semibold text-amber-200 ring-1 ring-amber-400/40'
                    : 'text-slate-300 hover:bg-white/5 hover:text-amber-200'}`}>
                  <T>{s.titel}</T>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-8 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            <T>Die Seite erneuert sich alle zwei Minuten.</T>
            {daten && <> · <T>Stand</T> {uhr(daten.stand)}</>}
          </span>
          <button type="button" onClick={() => void holen(zugang.admin)} disabled={laedt}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
            {laedt ? <T>Wird geladen …</T> : <T>Aktualisieren</T>}
          </button>
        </div>

        {!daten && laedt && <LadeSchirm />}
        {fehler && !daten && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{fehler}</p>
        )}

        {daten && children({ daten, laedt })}
      </div>
    </main>
  );
}

/** Die Fenster eines Spieltags als Chips - fuer die Uebersicht. */
export function FensterChips({ daten }: { daten: SolosDaten }) {
  return (
    <div className="flex flex-wrap gap-2">
      {daten.fenster.map((f) => (
        <span key={f.windowId} className="rounded-lg border border-amber-500/25 bg-zinc-950/60 px-3 py-1.5 text-xs text-amber-200/90">
          {f.name} · {datum(f.start)} {uhr(f.start)}
        </span>
      ))}
    </div>
  );
}
