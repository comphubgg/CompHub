'use client';

import { useMemo } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';

/*
 * Spieler nach Land - die Liste "Players by Country".
 *
 * Der Betreiber (12.10.2026): zu jedem Cup eine Länderliste, auch für die Solos und alle künftigen Cups. Eine Zeile je
 * Land mit Flagge, Namen, einem Balken und der Zahl der Spieler. Die Länder kommen aus den Profilen des Werkzeugs
 * (sonst aus Noble); wo keines bekannt ist, steht "Unbekannt" - es wird nichts geraten.
 */
export default function LaenderListe({ spieler }: { spieler: Array<{ land: string | null }> }) {
  const t = useT();
  const laender = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spieler) { const k = s.land ?? ''; m.set(k, (m.get(k) ?? 0) + 1); }
    let namen: Intl.DisplayNames | null = null;
    try { namen = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* alte Browser: dann der Code */ }
    return [...m.entries()].map(([code, n]) => ({
      code, n, name: code ? (() => { try { return namen?.of(code) ?? code; } catch { return code; } })() : t('Unbekannt'),
    })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [spieler, t]);

  if (!laender.length) return <p className="text-sm text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>;
  return (
    <ul className="space-y-1.5">
      {laender.map((l) => (
        <li key={l.code || 'x'} className="flex items-center gap-3 text-sm">
          <span className="flex w-44 shrink-0 items-center gap-2"><TeamFlagge groesse={16} laender={[l.code || undefined]} /><span className="truncate">{l.name}</span></span>
          <span className="relative h-5 flex-1 overflow-hidden rounded bg-white/[0.05]">
            <span className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-sky-700 to-sky-400" style={{ width: `${(l.n / (laender[0]?.n || 1)) * 100}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right font-bold tabular-nums text-slate-200">{l.n}</span>
        </li>
      ))}
    </ul>
  );
}
