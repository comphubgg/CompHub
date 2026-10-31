import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Replays',
  'Replays of competitive Fortnite cups and games, analyzed from the server replays.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
