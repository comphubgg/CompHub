import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Power Rankings',
  'Power rankings of competitive Fortnite players.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
