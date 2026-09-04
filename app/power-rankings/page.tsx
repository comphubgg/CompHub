'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PowerRankingsTable from '@/app/components/PowerRankingsTable';

import T from '@/app/components/T';
export default function PowerRankingsPage() {
  const searchParams = useSearchParams();
  const previewMode = searchParams.get('preview') === '1';
  const tourMode = searchParams.get('tour') === '1';

  if (previewMode && !tourMode) {
    return (
      <div className="min-h-screen bg-zinc-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl rounded-3xl border border-slate-700 bg-slate-950/90 p-8 text-center">
          <h1 className="text-2xl font-bold mb-4"><T>Preview tour ended</T></h1>
          <p className="text-sm text-slate-400 mb-6">
            <T>Power rankings preview is only available during the guided dashboard tour. Please log in to continue.</T>
          </p>
          <Link
            href="/anmelden"
            className="inline-flex items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-400"
          >
            <T>Go to VIP benefits</T>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <section className="mx-auto max-w-[1400px] px-4 py-8">
        {previewMode && (
          <div className="mb-6 rounded-3xl border border-slate-700 bg-slate-950/90 p-4 text-sm text-slate-300 shadow-xl shadow-black/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-100"><T>Preview mode enabled</T></p>
                <p className="mt-1"><T>This ranking preview is read-only. You can browse scores and use filters, but no account changes are made.</T></p>
              </div>
              {tourMode && (
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  <T>Finish tour</T>
                </Link>
              )}
            </div>
          </div>
        )}
        {/* Die Fuehrung durch die Vorschau sucht diese Marke. */}
        <div className="mb-5" data-tour="rankingsHeader">
          <h1 className="text-xl font-semibold text-slate-100"><T>Power Rankings</T></h1>
          <p className="mt-1 text-sm text-slate-500">
            <T>Die weltweite Rangliste von Epic — zehntausend Plätze, täglich erneuert.</T>
          </p>
        </div>

        <PowerRankingsTable />
      </section>
    </main>
  );
}
