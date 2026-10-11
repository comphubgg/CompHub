'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';
import type { HudGroesse } from '@/app/components/PovHud';

/*
 * Die Statistik eines Profis auf seinem POV: Platz, Punkte und Eliminierungen des laufenden Cups.
 *
 * Der Betreiber (11.10.2026): fuer Profis mit verbundenem Konto eine Option "mit Statistik" - wie das Overlay
 * eines Streams, aber ganz schlicht: schwarzer, neutraler, halbdurchsichtiger Grund, weisse Schrift, auf
 * Wunsch mit Profilbild, sonst nur mit Namen; Position oben, Mitte, links oder rechts (dazu unten) und die
 * Groesse stellt der Zuschauer ein (Streams-Seite > Einstellungen oder das Zahnrad auf der Kachel).
 *
 * Die Zahlen kommen alle dreissig Sekunden aus /api/pov/stats. Vor dem ersten gespielten Match steht hier
 * kein Platz (es gibt noch keinen); spielt der Profi gerade in keinem Cup, steht das da.
 */

export type StatsOrt = 'oben' | 'mitte' | 'links' | 'rechts' | 'unten';
export interface StatsEinst { an: boolean; ort: StatsOrt; mitBild: boolean; groesse: HudGroesse }

interface Stand {
  cup: string; platz: number; punkte: number; elims: number; spiele: number; siege: number; beste: number | null;
}

/** Wo die Statistik im Bild sitzt. Teilt sie sich die Stelle mit dem Namensbanner, rutscht sie ein Stueck weg. */
function lage(ort: StatsOrt, versetzt: boolean): string {
  switch (ort) {
    case 'oben': return `left-1/2 -translate-x-1/2 ${versetzt ? 'top-12' : 'top-2'}`;
    case 'unten': return `left-1/2 -translate-x-1/2 ${versetzt ? 'bottom-12' : 'bottom-2'}`;
    case 'mitte': return 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
    case 'links': return `left-3 -translate-y-1/2 ${versetzt ? 'top-[62%]' : 'top-1/2'}`;
    default: return `right-3 -translate-y-1/2 ${versetzt ? 'top-[62%]' : 'top-1/2'}`;
  }
}

const GROESSEN: Record<HudGroesse, { name: string; cup: string; wert: string; etikett: string; bild: string; luft: string }> = {
  klein: { name: 'text-[11px]', cup: 'text-[9px]', wert: 'text-[14px]', etikett: 'text-[8px]', bild: 'h-5 w-5', luft: 'px-2 py-1.5 gap-1' },
  mittel: { name: 'text-[14px]', cup: 'text-[11px]', wert: 'text-[20px]', etikett: 'text-[9px]', bild: 'h-8 w-8', luft: 'px-3 py-2 gap-1.5' },
  gross: { name: 'text-[19px]', cup: 'text-[14px]', wert: 'text-[28px]', etikett: 'text-[11px]', bild: 'h-11 w-11', luft: 'px-4 py-3 gap-2' },
};

export function PovStatsBanner({ pro, schluessel, einst, name, bild, versetzt = false }: {
  pro: string; schluessel?: string; einst: StatsEinst; name: string; bild: string | null;
  /** Das Namensbanner sitzt an derselben Stelle. */
  versetzt?: boolean;
}) {
  const t = useT();
  const [stand, setStand] = useState<Stand | null | undefined>(undefined);

  useEffect(() => {
    if (!einst.an) return undefined;
    let weg = false;
    const holen = () => {
      const s = schluessel ? `&s=${encodeURIComponent(schluessel)}` : '';
      fetch(`/api/pov/stats?pro=${encodeURIComponent(pro)}${s}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (!weg && j?.ok && j.verfuegbar) setStand(j.stand ?? null); })
        .catch(() => undefined); // der letzte Stand bleibt stehen
    };
    holen();
    const uhr = window.setInterval(holen, 30_000);
    return () => { weg = true; window.clearInterval(uhr); };
  }, [einst.an, pro, schluessel]);

  if (!einst.an || stand === undefined) return null;
  const g = GROESSEN[einst.groesse] ?? GROESSEN.mittel;
  const gespielt = stand && stand.spiele > 0;
  const zelle = (wert: string | number, etikett: string) => (
    <div className="text-center leading-tight">
      <div className={`${g.wert} font-bold tabular-nums`}>{wert}</div>
      <div className={`${g.etikett} uppercase tracking-wider text-white/60`}>{etikett}</div>
    </div>
  );

  return (
    <div className={`pointer-events-none absolute z-10 flex max-w-[92%] flex-col rounded-lg bg-black/60 text-white ${g.luft} ${lage(einst.ort, versetzt)}`}>
      <div className="flex items-center gap-2">
        {einst.mitBild && bild
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={bild} alt="" className={`${g.bild} shrink-0 rounded-full object-cover`} /> : null}
        <div className="min-w-0 leading-tight">
          <div className={`${g.name} truncate font-semibold`}>{name}</div>
          {stand && <div className={`${g.cup} truncate text-white/60`}>{stand.cup}</div>}
        </div>
      </div>
      {stand && gespielt ? (
        <div className="flex items-end justify-between gap-4 pt-0.5">
          {zelle(`#${stand.platz}`, t('Platz'))}
          {zelle(stand.punkte, t('Punkte'))}
          {zelle(stand.elims, 'Elims')}
          {zelle(stand.spiele, t('Spiele'))}
        </div>
      ) : (
        <div className={`${g.cup} text-white/70`}>
          {stand ? t('Wartet auf das erste Match') : t('Spielt gerade in keinem Cup')}
        </div>
      )}
    </div>
  );
}
