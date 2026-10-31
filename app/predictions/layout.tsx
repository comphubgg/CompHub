import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Predictions',
  'Predictions for competitive Fortnite cups: duos, map, leaderboard, regions, nationalities and prize pool.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
