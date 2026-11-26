import { WOERTER } from '../../woerter';

/*
 * Die Sprache der portierten Admin-Werkzeuge. Auf main steht der deutsche Text im Code und app/lib/sprache.ts (+ spracheAdmin.ts) uebersetzt ihn;
 * der Hub ist nur englisch, also immer die englische Fassung (woerter.ts, nur die Texte, die die portierten Werkzeuge brauchen).
 */
// Fehlermeldungen der Schnittstellen - sie kommen deutsch vom Server und laufen oft durch t()/<T>.
const API: Record<string, string> = {
  'Nur für den Admin.': 'Admins only.', 'nur fuer den Admin': 'Admins only.', 'nur Admin': 'Admins only.', 'Nur für Admins.': 'Admins only.', 'Nur fuer Admins': 'Admins only.',
  'nur fuer den Betreiber': 'Admins only.', 'Nur für Admins – bitte (neu) anmelden.': 'Admins only – please sign in (again).', 'Dafür brauchst du Admin-Rechte.': 'You need admin rights for this.',
  'Dafür fehlt dir das Recht.': 'You do not have the right for this.', 'Bitte zuerst anmelden.': 'Please sign in first.', 'Nicht angemeldet.': 'Not signed in.', 'Unbekannte Aktion.': 'Unknown action.',
  'Die Ablage antwortet gerade nicht.': 'The storage is not answering right now.', 'Nur für VIPs.': 'VIPs only.', 'Nur für Profis.': 'Pros only.', 'Discord antwortet nicht.': 'Discord is not answering.',
  'Zu diesem Spieltag gibt es keine ausgewerteten Replays.': 'There are no analysed replays for this match day.', 'Kein JSON': 'Not JSON',
};
const t = (text: string): string => {
  if (!text) return text;
  const n = text.replace(/\s+/g, ' ').trim();
  return WOERTER[text] ?? WOERTER[n] ?? API[n] ?? text;
};
export const apiText = (text: string) => API[text?.trim?.() ?? ''] ?? text;

export type Sprache = 'de' | 'en';
export function useT() { return t; }
export function useSprache() { return { sprache: 'en' as Sprache, setzeSprache: (_s: Sprache) => {}, t }; }
export default function SprachProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
