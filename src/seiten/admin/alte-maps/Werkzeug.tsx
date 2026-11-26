import { useLocation } from 'react-router-dom';
import AlteMapsVerwaltung from './page';
import AlteMapBearbeiten from './bearbeiten/page';

/* Alte Maps im Hub: /admin/alte-maps ist die Liste, /admin/alte-maps/bearbeiten?t=..&r=..&w=.. der Editor (wie auf main). */
export default function AlteMaps() {
  const ort = useLocation();
  return /\/bearbeiten\/?$/.test(ort.pathname) ? <AlteMapBearbeiten key={ort.search} /> : <AlteMapsVerwaltung />;
}
