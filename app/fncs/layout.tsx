import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'FNCS',
  'FNCS finals at a glance, plus all-time elimination stats from the Grand Finals.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
