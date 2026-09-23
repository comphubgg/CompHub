'use client';

import StandingsBaukasten from '@/app/overlays/standings/Baukasten';

/*
 * Das Leaderboard der Global Championship - eigene Adresse, fester Cup.
 *
 * Derselbe Baukasten wie unter /overlays/standings, nur ohne Cup-Auswahl
 * und von Haus aus im Aussehen des Turniers.
 */
export default function GlobalsStandings() {
  return <StandingsBaukasten globals />;
}
