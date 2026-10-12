'use client';

import GlobalsSolosGeruest from '../GlobalsSolosGeruest';
import SolosKarte from './SolosKarte';

/** Die Karte der Solos. */
export default function SolosMap() {
  return (
    <GlobalsSolosGeruest aktiv="/globals-solos/map">
      {({ daten }) => <SolosKarte daten={daten} />}
    </GlobalsSolosGeruest>
  );
}
