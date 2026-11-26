import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Deep Stats',
  'Damage per weapon, hits, third parties and landing and death heatmaps for every analysed competitive Fortnite cup, from the server replays.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
