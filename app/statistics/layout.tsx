import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Statistics',
  'Player and team statistics from competitive Fortnite tournaments, with leaderboards and comparisons.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
