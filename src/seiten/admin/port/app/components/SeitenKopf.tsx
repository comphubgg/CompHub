import type { ReactNode } from 'react';
import { WerkzeugKopf } from '../../../teile';
import { useRahmen } from '../../kontext';

/* Der Kopf der Dashboard-Seiten auf main - im Hub der Kopf der Admin-Werkzeuge (Gruppe, Titel, Satz, rechts die Knoepfe und "Classic view"). */
export default function SeitenKopf({ marke, titel, text, rechts }: { marke?: ReactNode; titel: ReactNode; text?: ReactNode; rechts?: ReactNode; className?: string }) {
  const { klassisch, gruppe } = useRahmen();
  return <WerkzeugKopf ueber={gruppe ?? marke ?? 'Admin'} titel={titel} text={text} klassisch={klassisch} rechts={rechts} />;
}
