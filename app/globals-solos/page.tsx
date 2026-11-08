import type { Metadata } from 'next';
import SolosSeite from './SolosSeite';

/*
 * FNCS Solos - eine Seite fuer alle Regionen (siehe SolosSeite). Die frueheren Unterseiten (/heats, /qualifiziert, /map, /laender) leiten auf die Reiter dieser
 * Seite um; der Link im Dashboard und alte Lesezeichen bleiben damit gueltig.
 *
 * Mit eigenem Vorschaubild fuer geteilte Links (app/api/link-bild): unter einem Post auf X steht dann das Bild, ein Klick fuehrt hierher (Betreiber, 8.11.2026).
 */
const BILD = '/api/link-bild?seite=solos&region=EU';
export const metadata: Metadata = {
  title: 'FNCS Solos Reload — Heats, Map & Stats',
  description: 'Who plays in which heat, the drop map and every stat of FNCS Solos Reload — straight from Epic.',
  openGraph: { title: 'FNCS Solos Reload — Heats, Map & Stats', description: 'Who plays in which heat, the drop map and every stat.', images: [{ url: BILD, width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', site: '@CompHub_gg', title: 'FNCS Solos Reload — Heats, Map & Stats', description: 'Who plays in which heat, the drop map and every stat.', images: [BILD] },
};

export default function GlobalsSolos() {
  return <SolosSeite />;
}
