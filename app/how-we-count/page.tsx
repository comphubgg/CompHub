import type { Metadata } from 'next';
import ZaehlSeite from './ZaehlSeite';

/*
 * "How we count" - woher jede Zahl der Player Stats kommt und wie sie gerechnet ist.
 *
 * Der Betreiber (15.11.2026): nur bewiesene Tatsachen aus dem Code, keine Vergleiche mit anderen Seiten. Was eine Kennzahl hier sagt, steht so im
 * Code (Quellen je Abschnitt in ZaehlSeite.tsx). Aendert sich eine Rechnung, wird der Text dort mitgeaendert - sonst luegt die Seite.
 */

export const metadata: Metadata = {
  title: 'How we count',
  description: 'Where every CompHub stat comes from: Epic\'s official leaderboard or the match replays, and exactly what each number counts.',
  alternates: { canonical: '/how-we-count' },
};

export default function SoZaehlenWir() {
  return <ZaehlSeite />;
}
