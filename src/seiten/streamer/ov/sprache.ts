import { WOERTER } from './woerter';

/*
 * Die Sprache der portierten Seiten. Auf main steht der deutsche Text im Code und app/lib/sprache.ts uebersetzt ihn; der Hub ist englisch,
 * also immer die englische Fassung (woerter.ts). Was fehlt, bleibt wie im Code - fast alle neueren Texte stehen dort schon englisch.
 */
const t = (text: string): string => (text ? WOERTER[text.replace(/\s+/g, ' ').trim()] ?? WOERTER[text] ?? text : text);

export function useT() { return t; }
export function useSprache() { return { sprache: 'en' as 'en' | 'de', setzeSprache: (_s: 'en' | 'de') => {}, t }; }
