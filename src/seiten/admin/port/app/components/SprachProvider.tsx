import { WOERTER } from '../../woerter';

/*
 * Die Sprache der portierten Admin-Werkzeuge. Auf main steht der deutsche Text im Code und app/lib/sprache.ts (+ spracheAdmin.ts) uebersetzt ihn;
 * der Hub ist nur englisch, also immer die englische Fassung (woerter.ts, nur die Texte, die die portierten Werkzeuge brauchen).
 */
const t = (text: string): string => (text ? WOERTER[text] ?? WOERTER[text.replace(/\s+/g, ' ').trim()] ?? text : text);

export type Sprache = 'de' | 'en';
export function useT() { return t; }
export function useSprache() { return { sprache: 'en' as Sprache, setzeSprache: (_s: Sprache) => {}, t }; }
export default function SprachProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
