import type { AbstimmungsArt, Phase } from '@/lib/awards';

/* Beschriftungen der Awards-Seiten (englisch, wie die oeffentliche Seite). */

export const ART_TEXT: Record<AbstimmungsArt, string> = {
  community: 'Community vote',
  panel: 'Community vote',
  beide: 'Community vote',
};

export const PHASE_TEXT: Record<Phase, string> = {
  vorher: 'Coming soon',
  nominierung: 'Nominations',
  zwischen: 'Nominations closed',
  abstimmung: 'Voting open',
  auswertung: 'Counting votes',
  ergebnis: 'Winners',
};

const DATUM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const datum = (s: string | null | undefined) => (s && Number.isFinite(Date.parse(s)) ? DATUM.format(new Date(s)) : 'TBA');
export const zeitraum = (a: string | null, b: string | null) => (a || b ? `${datum(a)} – ${datum(b)}` : 'TBA');
