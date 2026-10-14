'use client';

import Link from 'next/link';
import T from '@/app/components/T';

/*
 * Der Umschalter oben auf den Replay-Seiten: alle Replays oder die eigenen.
 *
 * Der Betreiber (14.10.2026): Replays gehoeren nicht in die Leiste, nur ins Dashboard; "unter Replays kann ich dann My Replays
 * auswaehlen". Beide Ansichten haben dieselbe Kopfzeile, die aktive ist hell hinterlegt - wie die Umschalter sonst im Werkzeug.
 */
export default function ReplayUmschalter({ aktiv }: { aktiv: 'alle' | 'meine' }) {
  const chip = (an: boolean) => `rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">
        ← <T>Dashboard</T>
      </Link>
      <div className="inline-flex gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
        <Link href="/replays" className={chip(aktiv === 'alle')} aria-current={aktiv === 'alle' ? 'page' : undefined}><T>Alle Replays</T></Link>
        <Link href="/replays/meine" className={chip(aktiv === 'meine')} aria-current={aktiv === 'meine' ? 'page' : undefined}><T>Meine Replays</T></Link>
      </div>
    </div>
  );
}
