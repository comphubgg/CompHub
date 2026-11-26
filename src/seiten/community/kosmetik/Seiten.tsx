import { useLocation } from 'react-router-dom';
import { Kosmetik, KosmetikDetail } from './Kosmetik';
import { GratisKosmetik, JamTracks, KosmetikStats, MeistGenutzt, NeuInDateien } from './Listen';

/*
 * Verteiler fuer die Kosmetik- und Mehr-Seiten (ein Chunk). src/seiten/community/Seiten.tsx haengt die Pfade ein; hier wird nach der Adresse
 * gewaehlt, weil verschachtelte <Routes> unter einem Pfad mit Parameter (cosmetics/:id) sonst relativ zu dessen Adresse suchen.
 */
export default function Seiten() {
  const p = useLocation().pathname.replace(/^\/community\/?/, '').replace(/\/$/, '');
  const [kopf] = p.split('/');
  if (kopf === 'cosmetics') return p.includes('/') ? <KosmetikDetail /> : <Kosmetik />;
  const seiten: Record<string, () => JSX.Element> = {
    new: NeuInDateien, free: GratisKosmetik, 'jam-tracks': JamTracks, 'cosmetic-stats': KosmetikStats, 'most-used': MeistGenutzt,
  };
  const S = seiten[kopf] ?? Kosmetik;
  return <S />;
}
