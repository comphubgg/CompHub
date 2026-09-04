// Welche Bereiche es gibt und wer sie darf.
//
// Ein Admin darf alles. Ein Manager darf genau das, was ihm der Admin
// angehakt hat - deshalb steht hier eine Liste und keine feste Abstufung:
// jemand kann Karten und Beiträge pflegen, aber nichts mit Replays zu tun
// haben.
//
// Die Kontoverwaltung fehlt in dieser Liste mit Absicht. Wer Rechte
// vergeben darf, kann sich selbst zum Admin machen; das bleibt beim
// Betreiber.

export const BEREICHE = [
  { schluessel: 'karten', pfad: '/karten', titel: 'Karten',
    was: 'Turnierkarten bauen und Landepunkte setzen' },
  { schluessel: 'tweets', pfad: '/admin/tweets', titel: 'Beiträge',
    was: 'Statistik-Posts erstellen' },
  { schluessel: 'prognosen', pfad: '/admin/prognosen', titel: 'Prognosen',
    was: 'Vorhersagen zeichnen' },
  { schluessel: 'replays', pfad: '/admin/replays', titel: 'Replays',
    was: 'Turnier-Replays nachsehen und auswerten' },
  { schluessel: 'spieler', pfad: '/admin/spieler', titel: 'Player Center',
    was: 'Flaggen, Namen und @-Konten pflegen' },
  { schluessel: 'assets', pfad: '/admin/assets', titel: 'Bildvorrat',
    was: 'Logos und Grafiken ablegen' },
  { schluessel: 'kontakt', pfad: '/admin/kontakt', titel: 'Kontakt',
    was: 'Meldungen aus dem Kontaktformular lesen' },
] as const;

export type Bereich = typeof BEREICHE[number]['schluessel'];

export const ALLE_BEREICHE: Bereich[] = BEREICHE.map((b) => b.schluessel);

/**
 * Darf dieses Konto in diesen Bereich?
 *
 * Der Admin darf alles, ohne dass ihm jemand etwas anhaken muss. Ein
 * Manager darf, was in seiner Liste steht. Alle anderen duerfen nichts.
 */
export function darf(
  rolle: 'admin' | 'manager' | 'pro' | null | undefined,
  rechte: string[] | undefined,
  bereich: Bereich,
): boolean {
  if (rolle === 'admin') return true;
  if (rolle === 'manager') return (rechte ?? []).includes(bereich);
  // Ein Profi verwaltet nichts - er traegt sich nur selbst ein.
  return false;
}

/** Zu welchem Bereich gehoert dieser Pfad? */
export function bereichVonPfad(pfad: string): Bereich | null {
  const treffer = BEREICHE.find((b) => pfad === b.pfad || pfad.startsWith(`${b.pfad}/`));
  return treffer ? treffer.schluessel : null;
}
