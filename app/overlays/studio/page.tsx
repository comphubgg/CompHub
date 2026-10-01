import { redirect } from 'next/navigation';

/*
 * Das Studio gibt es nicht mehr.
 *
 * Der Betreiber (1.10.2026): die Overlay-Seite soll nicht mehr nach Studio
 * aussehen - kein Bildschirm als Vorlage -, sondern drei Arten zur Auswahl,
 * jede mit Vorschau. Wer eine alte Adresse oder ein Lesezeichen hat, landet
 * auf dieser Auswahl.
 */
export default function Studio() {
  redirect('/overlays');
}
