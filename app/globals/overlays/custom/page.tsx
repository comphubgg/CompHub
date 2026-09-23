'use client';

import OffspawnBaukasten from '@/app/overlays/offspawn/Baukasten';

/*
 * Das freie Overlay der Global Championship - 1v1s, 2v2s, alles von Hand.
 *
 * Derselbe Baukasten wie unter /overlays/offspawn, nur von Haus aus im
 * Aussehen des Turniers.
 */
export default function GlobalsCustom() {
  return <OffspawnBaukasten globals />;
}
