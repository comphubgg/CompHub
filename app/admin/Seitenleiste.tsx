'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { Zeichen } from './Ebenen';

/*
 * Die Seitenleiste des Dashboards (Betreiber, 29.10.2026): "das Dashboard wird langsam immer voller ... dass man switchen kann ueber das Standard-Dashboard,
 * VIP-Dashboard und Fast Actions ... es soll nicht ein Account und ein Dashboard geben, das soll das gleiche sein ... links eine Pop-out-Bar, wo man zwischen
 * Sachen switchen kann ... fuer den Admin noch Admin-Tools und Statistics".
 *
 * Breit: links eine Leiste mit Zeichen und Namen, auf Wunsch eingeklappt auf die Zeichen (der Browser merkt es sich). Schmal: eine Reihe Kapseln oben.
 * Die Leiste reicht so weit nach unten wie der Inhalt daneben; ganz unten "Einklappen", direkt darueber "Abmelden" (nicht mehr oben im Kopf).
 */

const abmelden = () => { window.location.href = '/api/auth/logout'; };

export type Bereich = 'start' | 'vip' | 'schnell' | 'konto' | 'admin' | 'statistik';
export const BEREICHE: Bereich[] = ['start', 'vip', 'schnell', 'konto', 'admin', 'statistik'];

interface Eintrag { b: Bereich; titel: string; symbol: string; ton?: 'vip' | 'admin' }

export default function Seitenleiste({ bereich, setBereich, vip, admin, manager }: {
  bereich: Bereich; setBereich: (b: Bereich) => void; vip: boolean; admin: boolean; manager: boolean;
}) {
  const [schmal, setSchmal] = useState(false);
  useEffect(() => { try { setSchmal(localStorage.getItem('comphub-leiste-schmal') === '1'); } catch { /* ohne Speicher */ } }, []);
  const umschalten = () => setSchmal((s) => { try { localStorage.setItem('comphub-leiste-schmal', s ? '0' : '1'); } catch { /* egal */ } return !s; });

  const eintraege: Eintrag[] = [
    { b: 'start', titel: 'Übersicht', symbol: 'streams' },
    { b: 'vip', titel: 'VIP', symbol: 'overlay', ton: 'vip' },
    { b: 'schnell', titel: 'Schnellzugriff', symbol: 'rangliste' },
    { b: 'konto', titel: 'Konto', symbol: 'profil' },
    ...((admin || manager) ? [{ b: 'admin' as const, titel: 'Admin-Tools', symbol: 'schloss', ton: 'admin' as const }] : []),
    ...(admin ? [{ b: 'statistik' as const, titel: 'Admin-Statistik', symbol: 'statistik', ton: 'admin' as const }] : []),
  ];
  const farbe = (e: Eintrag, an: boolean) => (an
    ? e.ton === 'vip' ? 'bg-amber-400 text-zinc-950' : e.ton === 'admin' ? 'bg-rose-500 text-white' : 'bg-sky-500 text-white'
    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100');

  return (
    <>
      {/* Schmal: Kapseln oben, waagrecht scrollbar. */}
      <nav aria-label="Dashboard" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {eintraege.map((e) => (
          <button key={e.b} type="button" onClick={() => setBereich(e.b)}
            className={`flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 px-3.5 py-2 text-sm font-semibold transition ${farbe(e, bereich === e.b)}`}>
            <Zeichen name={e.symbol} groesse={16} /><T>{e.titel}</T>
            {e.b === 'vip' && !vip && !admin && <Zeichen name="schloss" groesse={13} />}
          </button>
        ))}
        <button type="button" onClick={abmelden}
          className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 px-3.5 py-2 text-sm font-semibold text-slate-400 transition hover:border-rose-500/60 hover:text-rose-400">
          <T>Abmelden</T>
        </button>
      </nav>

      {/* Breit: Leiste links, so hoch wie der Inhalt daneben; die Eintraege kleben beim Scrollen oben, Abmelden und Einklappen stehen ganz unten. */}
      <nav aria-label="Dashboard"
        className={`hidden shrink-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2 lg:flex ${schmal ? 'w-[60px]' : 'w-[220px]'}`}>
        <div className="sticky top-20 flex flex-col gap-1">
        {eintraege.map((e) => (
          <button key={e.b} type="button" onClick={() => setBereich(e.b)} title={schmal ? e.titel : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${farbe(e, bereich === e.b)}`}>
            <span className="shrink-0"><Zeichen name={e.symbol} groesse={18} /></span>
            {!schmal && <span className="min-w-0 flex-1 truncate"><T>{e.titel}</T></span>}
            {!schmal && e.b === 'vip' && !vip && !admin && <Zeichen name="schloss" groesse={14} />}
          </button>
        ))}
        </div>
        <div className="mt-auto flex flex-col gap-1 border-t border-zinc-800 pt-2">
          <button type="button" onClick={abmelden} title={schmal ? 'Abmelden' : undefined}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400">
            <span className="shrink-0"><Zeichen name="tuer" groesse={18} /></span>
            {!schmal && <span className="min-w-0 flex-1 truncate"><T>Abmelden</T></span>}
          </button>
          <button type="button" onClick={umschalten}
            className="flex items-center justify-center rounded-xl px-3 py-2 text-xs text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
            aria-label={schmal ? 'Leiste aufklappen' : 'Leiste einklappen'}>
            {schmal ? '»' : <><span className="mr-2">«</span><T>Einklappen</T></>}
          </button>
        </div>
      </nav>
    </>
  );
}
