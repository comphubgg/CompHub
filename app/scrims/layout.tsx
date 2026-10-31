import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Scrims',
  'Community scrims from servers such as Noble, Manu and Vital, with sessions and filters.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
