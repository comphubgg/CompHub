'use client';

import TeamkarteBaukasten from '@/app/overlays/teamkarte/Baukasten';

/*
 * Das Spieler-Banner der Global Championship - eigene Adresse, fester Cup.
 *
 * Derselbe Baukasten wie unter /overlays/teamkarte, nur ohne Cup-Auswahl:
 * zur Wahl stehen die beiden Spieltage des Turniers.
 */
export default function GlobalsTeamkarte() {
  return <TeamkarteBaukasten globals />;
}
