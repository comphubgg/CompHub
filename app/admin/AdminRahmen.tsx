'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';

/*
 * Der Rahmen um alle Admin-Seiten (Betreiber, 14.10.2026: "du hast fuer den Admin gar nichts geaendert ... Posts, Maps ... alles anpassen, auch fuer den
 * Admin"). Zwei Dinge fuer jede Seite unter /admin: oben eine Leiste mit allen Werkzeugen als Kapseln - man springt von einem zum anderen, ohne ueber das
 * Dashboard zu gehen, und sieht, wo man ist - und die gemeinsame Feinarbeit in design.css (.admin-neu: Eingabefelder, Knoepfe, Tafeln, Hintergrund).
 *
 * Die Leiste sieht nur der Admin; ein Manager oder Besucher bekommt die Seite ohne sie (ein gesperrter Bereich taucht fuer andere nicht auf).
 */

const WERKZEUGE: Array<[string, string]> = [
  ['/admin', 'Dashboard'],
  ['/admin/tweets', 'Beiträge'],
  ['/posts', 'Tagesposts'],
  ['/admin/tiktok', 'TikTok'],
  ['/admin/plakate', 'Plakate'],
  ['/maps', 'Karten'],
  ['/admin/alte-maps', 'Alte Maps'],
  ['/admin/predictions', 'Prognosen'],
  ['/admin/replays', 'Replays'],
  ['/admin/replay', 'Zonen & Games'],
  ['/admin/players', 'Player Center'],
  ['/admin/orgs', 'E-Sports-Teams'],
  ['/admin/vips', 'VIPs'],
  ['/admin/vip-access', 'VIP-Zugänge'],
  ['/admin/accounts', 'Konten'],
  ['/admin/contact', 'Kontakt'],
  ['/admin/archive', 'Archiv'],
  ['/admin/assets', 'Bildvorrat'],
  ['/admin/live', 'Live'],
];

export default function AdminRahmen({ children }: { children: ReactNode }) {
  const pfad = usePathname() ?? '';
  const zugang = useZugang();
  const t = useT();
  const aktiv = (href: string) => (href === '/admin' ? pfad === '/admin' : pfad === href || pfad.startsWith(`${href}/`));

  return (
    <div className="admin-neu">
      {!zugang.laedt && zugang.admin && (
        <div className="mx-auto max-w-[1400px] px-4 pt-4">
          <nav aria-label={t('Admin-Werkzeuge')}
            className="admin-leiste flex gap-1 overflow-x-auto rounded-full border border-zinc-800 bg-zinc-900 p-1.5 shadow-[0_6px_20px_rgba(15,23,42,.14)]">
            {WERKZEUGE.map(([href, titel]) => (
              <Link key={href} href={href} prefetch={false} aria-current={aktiv(href) ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  aktiv(href) ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:bg-zinc-800 hover:text-slate-100'}`}>
                <T>{titel}</T>
              </Link>
            ))}
          </nav>
        </div>
      )}
      {children}
    </div>
  );
}
