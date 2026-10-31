import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Events',
  'Browse competitive Fortnite tournaments and cups, with filters, a calendar view and results.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
