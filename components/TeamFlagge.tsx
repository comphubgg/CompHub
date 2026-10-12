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
  const zwei = pfade.length === 2;
  // Drei Spieler: ein Kreis in drei Stuecken (oben, links unten, rechts unten) wie auf den Tierlist-Kacheln. Sind zwei
  // davon dasselbe Land, bilden sie zusammen die untere Haelfte und das dritte Land liegt darueber.
  const drei = pfade.length >= 3;
  const paar = drei ? (pfade[0] === pfade[1] ? [0, 1] : pfade[0] === pfade[2] ? [0, 2] : pfade[1] === pfade[2] ? [1, 2] : null) : null;
  const allein = paar ? [0, 1, 2].find((i) => !paar.includes(i))! : -1;

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
        <clipPath id={`${eigen}-o`}><polygon points="50,50 -36.6,0 -36.6,-50 136.6,-50 136.6,0" /></clipPath>
        <clipPath id={`${eigen}-l`}><polygon points="50,50 -36.6,0 -36.6,150 50,150" /></clipPath>
        <clipPath id={`${eigen}-r`}><polygon points="50,50 136.6,0 136.6,150 50,150" /></clipPath>
        <clipPath id={`${eigen}-u`}><polygon points="50,50 -36.6,0 -36.6,150 136.6,150 136.6,0" /></clipPath>
      </defs>
      <g clipPath={`url(#${eigen}-k)`}>
        {drei ? (paar ? (
          <>
            {bild(pfade[allein], `${eigen}-o`)}
            {bild(pfade[paar[0]], `${eigen}-u`)}
            <polyline points="-36.6,0 50,50 136.6,0" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="5" />
          </>
        ) : (
          <>
            {bild(pfade[0], `${eigen}-o`)}
            {bild(pfade[1], `${eigen}-l`)}
            {bild(pfade[2], `${eigen}-r`)}
            <polyline points="-36.6,0 50,50 136.6,0" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="5" />
            <line x1="50" y1="50" x2="50" y2="150" stroke="rgba(0,0,0,0.6)" strokeWidth="5" />
          </>
        )) : (
          <>
            {bild(pfade[0], `${eigen}-a`)}
            {zwei && bild(pfade[1], `${eigen}-b`)}
            {zwei && (
              <line x1="100" y1="0" x2="0" y2="100"
                stroke="rgba(0,0,0,0.6)" strokeWidth="5" />
            )}
          </>
        )}
      </g>
      <circle cx="50" cy="50" r="47" fill="none"
        stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
    </svg>
  );
}
