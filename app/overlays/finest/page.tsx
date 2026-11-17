import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ichDarfFinest } from '@/lib/finestZugang';
import FinestBaukasten from './Baukasten';

/*
 * Finest Creative configurator - PRIVATE (lib/finestZugang).
 *
 * Checked on the server: without the "finest" tick (or as the operator/admin)
 * this address is a plain 404, so nothing of it reaches the browser.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overlays', robots: { index: false, follow: false } };

export default async function FinestSeite() {
  if (!(await ichDarfFinest()).length) notFound();
  return <FinestBaukasten />;
}
