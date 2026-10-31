import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Tier List',
  'Build and share your own tier lists for competitive Fortnite.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
