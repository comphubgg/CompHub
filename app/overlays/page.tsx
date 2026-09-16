'use client';

import { redirect } from 'next/navigation';

/*
 * Die Overlay-Seite ist das Studio.
 *
 * Der Betreiber: "Es ist wirklich einfach ein OBS von der Ansicht - eine
 * Preview vom Stream, links oben drei Striche." Die Seiten je Art gibt es
 * weiter; das Studio oeffnet sie als Einstellungen zu einem Element.
 */
export default function OverlaysSeite() {
  redirect('/overlays/studio');
}
