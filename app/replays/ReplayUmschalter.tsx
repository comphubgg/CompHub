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
  const chip = (an: boolean) => `rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">
        ← <T>Dashboard</T>
      </Link>
      <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
        <Link href="/replays" className={chip(aktiv === 'alle')} aria-current={aktiv === 'alle' ? 'page' : undefined}><T>Alle Replays</T></Link>
        <Link href="/replays/meine" className={chip(aktiv === 'meine')} aria-current={aktiv === 'meine' ? 'page' : undefined}><T>Meine Replays</T></Link>
      </div>
    </div>
  );
}
