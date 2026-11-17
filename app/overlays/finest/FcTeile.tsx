'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';

/*
 * Shared bits of the private Finest Creative tab (11/2026).
 *
 * Only accounts with the "finest" tick (Admin -> Accounts -> VIP areas) or
 * the operator see anything here; the server checks the same before it even
 * renders these pages, on save, on the control page, for the partner's files
 * and every time the OBS source fetches its settings (lib/finestZugang).
 */

export const FC_GOLD = '#f5b82e';
/** From the private archive, only with access (app/api/finest/datei). */
export const FC_LOGO = '/api/finest/datei/logo.png';
export const FC_CLIP = '/api/finest/datei/bg.mp4';
export const FC_THUMB = '/api/finest/datei/thumb.jpg';

/** The overlay page with its secret view key - for OBS or a full-screen browser tab. */
export function fcOverlayUrl(basis: string, id: string, sicht: string): string {
  return `${basis}/overlays/finest/live?id=${encodeURIComponent(id)}&k=${encodeURIComponent(sicht)}`;
}

export function useFinest(): { laedt: boolean; darf: boolean } {
  const z = useZugang();
  return { laedt: z.laedt, darf: Boolean(z.admin || z.rechte.includes('finest')) };
}

/** Their map (the operator: Finest has one relevant map). Title, search and code stay editable. */
export const FC_KARTEN: Array<{ karte: string; suche: string; code: string }> = [
  { karte: '1V1-4V4 REALISTICS', suche: 'FINEST', code: '9854-1829-8735' },
];

export type FcVariante = 'leiste' | 'stapel' | 'seite' | 'kompakt' | 'liste' | 'spalten';

export const FC_VARIANTEN: Array<{ wert: FcVariante; titel: string; text: string }> = [
  { wert: 'leiste', titel: '1v1 top bar', text: 'One line: both names, the score in the middle, a status line below.' },
  { wert: 'stapel', titel: '3v3 stacked', text: 'Players stacked on both sides, round and first-to around the score.' },
  { wert: 'seite', titel: '4v4 sidebar', text: 'A narrow card for the side of the screen: team, players, score.' },
  { wert: 'kompakt', titel: '2v2 compact', text: 'Smallest: names, scores and a dot per round won.' },
  { wert: 'liste', titel: 'Teams list', text: '3–4 teams, one row each with its players and score; the leader gets a gold dot.' },
  { wert: 'spalten', titel: 'Teams columns', text: '3–4 teams side by side, one column each; the leader’s score is gold.' },
];
/** With more than two teams the two-sided variants turn into these (same rule as the overlay, lib/finest/fcSeite). */
export function fcVarianteFuer(v: FcVariante, teams: number): FcVariante {
  if (teams <= 2 || v === 'liste' || v === 'spalten') return v;
  return v === 'leiste' || v === 'kompakt' ? 'spalten' : 'liste';
}

export function FcRahmen({ titel, text, children }: { titel: string; text?: string; children: ReactNode }) {
  const { laedt, darf } = useFinest();
  if (laedt) return <LadeSchirm />;
  if (!darf) {
    return (
      <main className="grid flex-1 place-items-center bg-[#07090d] px-4 py-16 text-center text-slate-300">
        <div className="max-w-sm">
          <p className="text-lg font-bold text-white"><T>No access</T></p>
          <p className="mt-2 text-sm text-slate-400"><T>This section is only available to invited accounts.</T></p>
          <Link href="/overlays" className="mt-5 inline-block rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white">← <T>Overlays</T></Link>
        </div>
      </main>
    );
  }
  return (
    <main className="flex-1 bg-[#07090d] px-4 pb-16 pt-6 text-slate-200">
      <div className="mx-auto max-w-[1400px]">
        <header className="relative mb-5 overflow-hidden rounded-3xl border border-[#f5b82e]/20 bg-[#0d0d10]">
          <div className="h-2 w-full" style={{ background: `repeating-linear-gradient(-45deg,#111 0 10px,${FC_GOLD} 10px 20px)` }} />
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
            <div className="flex min-w-0 items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FC_LOGO} alt="" className="h-12 w-auto shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]" style={{ color: FC_GOLD }}><T>Partner · invited accounts only</T></p>
                <h1 className="text-3xl font-black tracking-tight" style={{ color: FC_GOLD }}>Finest Creative</h1>
                <p className="mt-0.5 text-sm text-slate-400"><T>{titel}</T>{text ? <> — <T>{text}</T></> : null}</p>
              </div>
            </div>
            <Link href="/overlays" className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white">← <T>All overlays</T></Link>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
