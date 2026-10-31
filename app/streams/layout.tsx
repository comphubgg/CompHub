import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';

export const metadata: Metadata = bereichsMeta(
  'Streams',
  'Watch competitive Fortnite streams, with a multiview to follow several at once.',
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
