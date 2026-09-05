'use client';

// Eine runde Flagge je Team.
//
// Ein Duo bekommt keine zwei Flaggen nebeneinander, sondern eine einzige
// runde, diagonal geteilt: oben links die eine Herkunft, unten rechts die
// andere. Zwei kleine Rechtecke nebeneinander zerfasern die Zeile, ein Kreis
// liest sich als ein Zeichen fuer ein Team.
//
// Fehlt eine Herkunft, steht dort der Globus. Eine graue Flaeche sah aus wie
// ein Fehler; der Globus sagt dagegen klar "Herkunft nicht bekannt" und haelt
// die Zeile ruhig. Erfunden wird damit weiterhin nichts.

import { useId } from 'react';

/** Der Platzhalter, wenn zu einem Spieler kein Land hinterlegt ist. */
export const GLOBUS = '/flags/flag-GLOBE.png';

/** Aus "RO" wird "ro"; alles andere gilt als unbekannt. */
function kuerzel(land: string | undefined | null) {
  return land && /^[A-Za-z]{2}$/.test(land) ? land.toLowerCase() : null;
}

/*
 * Welche Flaggen wirklich als Datei vorliegen.
 *
 * Der Pfad wurde vorher blind aus dem Laenderkuerzel gebaut. Zu Uruguay,
 * Panama, Kuba und "en" gibt es aber keine Datei - im Browser standen
 * deshalb 404er und an der Stelle ein leeres Feld. Wo die Datei fehlt,
 * steht jetzt der Globus: das ist zwar nicht die Herkunft, aber es sieht
 * nicht kaputt aus und behauptet nichts Falsches.
 *
 * Kommt eine Flagge dazu, gehoert ihr Kuerzel hier hinein. Die Liste einmal
 * neu erzeugen:
 *   ls public/flags/*.png | xargs -n1 basename | sed 's/.png//'
 */
const VORHANDEN = new Set([
  'ae',, 'al',, 'ar',, 'at',, 'au',, 'ba',, 'be',, 'bg',
  'bh',, 'br',, 'by',, 'ca',, 'ch',, 'cn',, 'co',, 'cz',
  'de',, 'dk',, 'ee',, 'eg',, 'es',, 'fi',, 'flag-GLOBE',, 'fr',
  'gb',, 'gr',, 'hr',, 'hu',, 'ie',, 'il',, 'in',, 'ir',
  'is',, 'it',, 'jp',, 'kr',, 'kw',, 'lb',, 'lt',, 'lv',
  'mc',, 'md',, 'mk',, 'mx',, 'ng',, 'nl',, 'no',, 'nz',
  'om',, 'pe',, 'pl',, 'pt',, 'ro',, 'rs',, 'ru',, 'sa',
  'se',, 'si',, 'sk',, 'sy',, 'tr',, 'ua',, 'us',, 've',
  'ye',
]);

/** Der Bildpfad zu einem Land - oder der Globus. */
export function flaggenPfad(land: string | undefined | null) {
  const k = kuerzel(land);
  return k && VORHANDEN.has(k) ? `/flags/${k}.png` : GLOBUS;
}

export default function TeamFlagge({ laender, groesse = 26 }: {
  /** Ein Eintrag je Spieler, in der Reihenfolge der Namen. */
  laender: Array<string | undefined | null>;
  groesse?: number;
}) {
  // Die Schnittmasken brauchen im ganzen Dokument eindeutige Namen: auf einer
  // Seite stehen hunderte dieser Flaggen, und gleiche Namen wuerden dazu
  // fuehren, dass alle dieselbe Maske benutzen.
  const eigen = useId().replace(/[^a-zA-Z0-9]/g, '');
  const alle = (laender.length ? laender : [undefined]).map(flaggenPfad);
  // Kommen beide aus demselben Land, wird daraus eine ganze Flagge statt
  // zweier identischer Haelften: eine diagonal geteilte polnische Flagge
  // neben einer polnischen sieht aus wie ein Fehler, nicht wie eine Aussage.
  // Ist nur eine Herkunft bekannt, bleibt es bei der Teilung - der Globus
  // auf der anderen Haelfte sagt ja etwas anderes als die Flagge.
  const einig = alle.length > 1 && alle.every((f) => f === alle[0]);
  const pfade = einig ? [alle[0]] : alle;
  const zwei = pfade.length > 1;

  const bild = (quelle: string, clip: string) => (
    <image href={quelle} x="0" y="0" width="100" height="100"
      preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
  );

  return (
    <svg viewBox="0 0 100 100" width={groesse} height={groesse}
      className="shrink-0" aria-hidden>
      <defs>
        <clipPath id={`${eigen}-k`}><circle cx="50" cy="50" r="50" /></clipPath>
        <clipPath id={`${eigen}-a`}>
          <polygon points={zwei ? '0,0 100,0 0,100' : '0,0 100,0 100,100 0,100'} />
        </clipPath>
        <clipPath id={`${eigen}-b`}><polygon points="100,0 100,100 0,100" /></clipPath>
      </defs>
      <g clipPath={`url(#${eigen}-k)`}>
        {bild(pfade[0], `${eigen}-a`)}
        {zwei && bild(pfade[1], `${eigen}-b`)}
        {zwei && (
          <line x1="100" y1="0" x2="0" y2="100"
            stroke="rgba(0,0,0,0.6)" strokeWidth="5" />
        )}
      </g>
      <circle cx="50" cy="50" r="47" fill="none"
        stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
    </svg>
  );
}
