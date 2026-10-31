import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Tournament Maps',
  'The maps of competitive Fortnite cups, sorted by chapter and season.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
