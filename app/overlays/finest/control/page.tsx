import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ichDarfFinest } from '@/lib/finestZugang';
import FcSteuerung from './Steuerung';

/*
 * Control page of a Finest Creative scoreboard - PRIVATE (lib/finestZugang).
 * Server-side check: without the tick a plain 404. The score itself is only
 * taken with the tick AND the control key (app/api/overlay-config).
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overlays', robots: { index: false, follow: false } };

export default async function FcSteuerungSeite() {
  if (!(await ichDarfFinest()).length) notFound();
  return <FcSteuerung />;
}
