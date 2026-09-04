'use client';

import { useEffect, useState } from 'react';

import T from '@/app/components/T';
interface Props {
  slug: string;
  status?: 'completed' | 'upcoming' | 'live';
}

const MAX_CONCURRENT_LEADERBOARD_STATUS_FETCHES = 4;
const leaderboardStatusFetchQueue: Array<() => void> = [];
let activeLeaderboardStatusFetches = 0;

function processLeaderboardStatusQueue() {
  if (activeLeaderboardStatusFetches >= MAX_CONCURRENT_LEADERBOARD_STATUS_FETCHES) {
    return;
  }
  const next = leaderboardStatusFetchQueue.shift();
  if (next) {
    next();
  }
}

function scheduleLeaderboardStatusFetch(task: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const run = () => {
      activeLeaderboardStatusFetches += 1;
      task().finally(() => {
        activeLeaderboardStatusFetches -= 1;
        resolve();
        processLeaderboardStatusQueue();
      });
    };

    if (activeLeaderboardStatusFetches < MAX_CONCURRENT_LEADERBOARD_STATUS_FETCHES) {
      run();
    } else {
      leaderboardStatusFetchQueue.push(run);
    }
  });
}

export default function TournamentScrapeStatus({ slug, status }: Props) {
  const [isScraping, setIsScraping] = useState(false);
  const [exists, setExists] = useState(false);
  const [lastScraped, setLastScraped] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (status === 'upcoming') {
      setIsScraping(false);
      setExists(false);
      setLastScraped(null);
      return () => {
        cancelled = true;
      };
    }

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/tournaments/leaderboard?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setIsScraping(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setIsScraping(Boolean(data.isScraping));
        const lb = data.leaderboard;
        if (lb && lb.rowCount) {
          setExists(true);
          setLastScraped(lb.scrapedAt || null);
        } else {
          setExists(false);
          setLastScraped(null);
        }
      } catch (e) {
        // ignore
      }
    };

    void scheduleLeaderboardStatusFetch(fetchStatus);
    return () => {
      cancelled = true;
    };
  }, [slug, status]);

  // Render
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      {isScraping ? (
        <div className="flex items-center gap-2 text-amber-300">
          <span className="animate-spin inline-block h-3 w-3 rounded-full border-2 border-amber-300 border-t-transparent" />
          <span><T>Updating…</T></span>
        </div>
      ) : exists ? (
        <div className="flex items-center gap-2 text-emerald-300">
          <span>✓</span>
          <span>{lastScraped ? `Saved ${new Date(lastScraped).toLocaleTimeString()}` : 'Saved'}</span>
        </div>
      ) : status === 'completed' ? (
        <div className="flex items-center gap-2 text-yellow-300">
          <span>⌛</span>
          <span><T>Will load once…</T></span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-zinc-400">
          <span>—</span>
          <span><T>idle</T></span>
        </div>
      )}
    </div>
  );
}
