'use client';

import { redirect } from 'next/navigation';

/*
 * Die Overlay-Seite hat jetzt drei Unterseiten.
 *
 * Der Betreiber wollte jede Art fuer sich: "das Leaderboard ist eine eigene
 * Page, die Overlays ist eine eigene Page". Wer die alte Adresse aufruft,
 * landet auf der Team-Karte - das ist die Seite, die er bisher unter
 * /overlays hatte, und die Leiste links fuehrt von dort ueberallhin.
 */
export default function OverlaysSeite() {
  redirect('/overlays/teamkarte');
}
