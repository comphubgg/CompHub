import type { Metadata } from 'next';
import SoFunktioniertEs from './SoFunktioniertEs';
import { verfuegbareMedien } from '@/lib/hiwMedien';

/*
 * "How it works" - wie CompHub zu seinen Zahlen kommt und was jede Seite zeigt (Betreiber, 15.11.2026). Der fruehere Abschnitt /how-we-count ist hier
 * der Abschnitt #how-we-count; die alte Adresse leitet dauerhaft dorthin um (next.config.ts).
 *
 * Nur bewiesene Tatsachen aus dem Code, keine Vergleiche mit anderen Seiten. Die Quellen je Abschnitt stehen in SoFunktioniertEs.tsx.
 *
 * Die Videos liegen am Release "medien" (lib/hiwMedien). Welche schon da sind, wird hier gefragt - fehlt eins, steht an seiner Stelle nichts.
 */

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'How it works',
  description: 'How CompHub gets, analyses and counts every stat - from Epic\'s official leaderboard and the match replays - and what each page shows.',
  alternates: { canonical: '/how-it-works' },
};

export default async function SoGehtEs() {
  const videos = await verfuegbareMedien(['hiw-stats-agent', 'hiw-match-replays', 'hiw-prediction']);
  return <SoFunktioniertEs videos={videos} />;
}
