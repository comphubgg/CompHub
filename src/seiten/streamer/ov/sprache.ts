import { WOERTER as OV_W } from './woerter';
import { WOERTER as MV_W } from '../mv/woerter';

const WOERTER: Record<string, string> = { ...MV_W, ...OV_W };

/*
 * Die Sprache der portierten Seiten. Auf main steht der deutsche Text im Code und app/lib/sprache.ts uebersetzt ihn; der Hub ist englisch,
 * also immer die englische Fassung (woerter.ts). Was fehlt, bleibt wie im Code - fast alle neueren Texte stehen dort schon englisch.
 */
// Fehlermeldungen der Schnittstellen (twitch-bot, twitch-statistik, streamer-seite) - sie kommen deutsch vom Server.
const API: Record<string, string> = {
  'Nur für VIPs.': 'VIPs only – sign in with your VIP account or access key.',
  'Für dein Konto nicht freigeschaltet.': 'Not switched on for your account yet.',
  'Diesen Kanal darfst du nicht einstellen.': 'You may not change this channel.',
  'Unbekannte Aktion.': 'Unknown action.',
  'Nur für den Admin.': 'Admin only.',
  'Das ist kein Twitch-Name.': 'That is not a Twitch name.',
  'Diesen VIP gibt es nicht.': 'This VIP does not exist.',
  'Diesen Twitch-Kanal gibt es nicht.': 'This Twitch channel does not exist.',
  'Null Stunden heißt: immer sichtbar. Sonst bleibt der Timer verborgen, bis es so weit ist — ein Countdown über zwei Tage ist keine Information, sondern eine Uhr im Bild.': 'Zero hours means always visible. Otherwise the timer stays hidden until it is time — a countdown over two days is not information, just a clock on screen.',
};
const t = (text: string): string => (text ? WOERTER[text.replace(/\s+/g, ' ').trim()] ?? WOERTER[text] ?? API[text.replace(/\s+/g, ' ').trim()] ?? text : text);

export function useT() { return t; }
export function useSprache() { return { sprache: 'en' as 'en' | 'de', setzeSprache: (_s: 'en' | 'de') => {}, t }; }
