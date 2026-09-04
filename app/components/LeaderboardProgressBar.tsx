'use client';

import { useEffect, useState } from 'react';

import T from '@/app/components/T';
interface ProgressState {
  loaded: number;
  total: number;
  percent: number;
  updatedAt: number;
}

const DEFAULT_PROGRESS: ProgressState = {
  loaded: 0,
  total: 0,
  percent: 0,
  updatedAt: 0,
};

function parseStoredProgress(): ProgressState {
  if (typeof window === 'undefined') {
    return DEFAULT_PROGRESS;
  }

  try {
    const raw = window.localStorage.getItem('leaderboardPrefetchProgress');
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as ProgressState;
    return {
      loaded: typeof parsed.loaded === 'number' ? parsed.loaded : 0,
      total: typeof parsed.total === 'number' ? parsed.total : 0,
      percent: typeof parsed.percent === 'number' ? parsed.percent : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export default function LeaderboardProgressBar() {
  const [progress, setProgress] = useState<ProgressState>(parseStoredProgress);

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail as ProgressState;
      if (!detail || typeof detail.loaded !== 'number' || typeof detail.total !== 'number') {
        return;
      }
      setProgress(detail);
    };

    window.addEventListener('leaderboard-prefetch-progress', handleProgress);
    return () => {
      window.removeEventListener('leaderboard-prefetch-progress', handleProgress);
    };
  }, []);

  if (progress.total === 0) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mt-3 rounded-3xl border border-slate-800 bg-slate-950/90 p-3 text-sm text-slate-200 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-slate-100"><T>Leaderboard cache</T></span>
            <span className="ml-2 text-slate-400">{progress.loaded} / {progress.total} tournaments ready</span>
          </div>
          <div className="text-slate-400">
            {progress.percent}% loaded
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-cyan-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
