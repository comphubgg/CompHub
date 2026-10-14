import { redirect } from 'next/navigation';

/*
 * Die Nachrichtenseite gibt es nicht mehr (Betreiber, 14.10.2026: der Chat ist abgeschafft). Alte Lesezeichen und Mails fuehren zum Kontaktformular.
 * Die gespeicherten Gespraeche bleiben in der Ablage liegen; nur die Oberflaeche ist weg.
 */
export default function NachrichtenSeite() {
  redirect('/contact');
}
