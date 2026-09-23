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
  { schluessel: 'karten', pfad: '/maps', titel: 'Karten',
    was: 'Turnierkarten bauen und Landepunkte setzen' },
  { schluessel: 'tweets', pfad: '/admin/tweets', titel: 'Beiträge',
    was: 'Statistik-Posts erstellen' },
  { schluessel: 'prognosen', pfad: '/admin/predictions', titel: 'Prognosen',
    was: 'Vorhersagen zeichnen' },
  { schluessel: 'replays', pfad: '/admin/replays', titel: 'Replays',
    was: 'Turnier-Replays nachsehen und auswerten' },
  { schluessel: 'spieler', pfad: '/admin/players', titel: 'Player Center',
    was: 'Flaggen, Namen und @-Konten pflegen' },
  { schluessel: 'assets', pfad: '/admin/assets', titel: 'Bildvorrat',
    was: 'Logos und Grafiken ablegen' },
  { schluessel: 'kontakt', pfad: '/admin/contact', titel: 'Kontakt',
    was: 'Meldungen aus dem Kontaktformular lesen' },
] as const;

export type Bereich = typeof BEREICHE[number]['schluessel'];

/*
 * Zusaetzliche Bereiche, die ein VIP bekommen kann - nicht nur ein Manager.
 *
 * Anlass: die FNCS Global Championship 2026. Der Betreiber wollte einem
 * Streamer die dafuer gebauten Overlays geben, ohne ihn zum Manager zu
 * machen: "dann kann ich sozusagen einstellen, welche Streamer von was
 * Zugriff haben ... er sieht das fuer sich selber nur im Dashboard." Der
 * Schluessel steht wie ein Recht in der Liste des Zugangs; wer ihn hat,
 * sieht im Dashboard den VIP-Block.
 */
export const VIP_BEREICHE = [
  {
    schluessel: 'globals',
    titel: 'Overlays (Globals 2026)',
    was: 'Leaderboard, Spieler-Banner und freies Overlay im Aussehen der Global Championship',
  },
] as const;

export type VipBereich = typeof VIP_BEREICHE[number]['schluessel'];

/** Hat dieser Zugang einen der zusaetzlichen VIP-Bereiche? */
export function darfVip(
  rolle: 'admin' | 'manager' | 'pro' | null | undefined,
  rechte: string[] | undefined,
  bereich: VipBereich,
): boolean {
  if (rolle === 'admin') return true;
  return (rechte ?? []).includes(bereich);
}

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
