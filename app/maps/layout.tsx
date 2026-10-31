import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Tournament Map',
  'Tournament map view showing the drop spots and how teams are distributed across the map.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
