import { WOERTER as OV_W } from './woerter';
import { WOERTER as MV_W } from '../mv/woerter';

const WOERTER: Record<string, string> = { ...MV_W, ...OV_W };

/*
 * Die Sprache der portierten Seiten. Auf main steht der deutsche Text im Code und app/lib/sprache.ts uebersetzt ihn; der Hub ist englisch,
 * also immer die englische Fassung (woerter.ts). Was fehlt, bleibt wie im Code - fast alle neueren Texte stehen dort schon englisch.
 */
// Fehlermeldungen der Schnittstellen (twitch-bot, twitch-statistik, streamer-seite) - sie kommen deutsch vom Server.
const API: Record<string, string> = {
  'Team gegen Team mit Stand - für Customs, Tokens und Showmatches': 'Team vs team with a score - for customs, tokens and showmatches',
  'Als Manager wählst du den Spieltag, um den es gerade geht: was läuft, was heute schon lief, und was gleich anfängt — in Europa ab 15 Minuten vorher, in den anderen Regionen ab zwei Stunden vorher.': 'As a manager you pick the match day that matters right now: what is running, what already ran today and what starts soon — in Europe from 15 minutes before, in the other regions from two hours before.',
  'Gerade läuft kein Spieltag und keiner fängt gleich an. Sobald einer ansteht, erscheint er hier von selbst.': 'No match day is running or about to start. As soon as one is coming up, it appears here by itself.',
  'Zwei Teams, ein Stand von Hand. Epic weiß davon nichts — was hier steht, steht im Stream.': 'Two teams, a score kept by hand. Epic knows nothing about it — what you set here is what the stream shows.',
  'Trag die Browser-Quelle in OBS mit der doppelten Breite und Höhe ein und zieh sie in der Szene auf 50 % — dann wird nichts hochgerechnet und alles ist scharf.': 'Add the browser source in OBS at double width and height and scale it to 50 % in the scene — then nothing gets upscaled and everything stays sharp.',
  'Unscharf in OBS? Zieh die Quelle in der Szene nie größer, als sie eingetragen ist. Mit „Schärfe: Doppelt“ wird alles doppelt so groß gezeichnet — Quelle doppelt so groß eintragen, in der Szene auf 50 %.': 'Blurry in OBS? Never stretch the source in the scene beyond its set size. With “Sharpness: Double” everything is drawn twice as large — set the source to double size and scale it to 50 % in the scene.',
  'Breit und große Schrift.': 'Wide, with large text.',
  'Groß': 'Large',
  'Gespeichert werden Duo und Aussehen, nicht der Spieltag. Die Adresse zeigt immer auf den laufenden Spieltag deiner Region, also steht sie beim nächsten Turnier noch richtig.': 'What is saved is the duo and the look, not the match day. The URL always points to the running match day of your region, so it is still right at the next tournament.',
  'Diese Adresse bleibt gleich. Was du hier änderst und übernimmst, ist im Stream nach wenigen Sekunden zu sehen.': 'This URL stays the same. Whatever you change and apply here shows up on stream within seconds.',
  'Erst speichern — dann bekommst du eine Adresse, die bei jeder späteren Änderung gleich bleibt.': 'Save first — then you get a URL that stays the same through every later change.',
  'Die Adresse oben in das Feld „URL“ einfügen, Breite und Höhe nach Geschmack, OK.': 'Paste the URL above into the “URL” field, set width and height to taste, OK.',
  'Diese Adresse bleibt gültig. Änderst du hier später etwas und speicherst, ist es im Stream nach wenigen Sekunden zu sehen — die Browser-Quelle musst du nicht anfassen.': 'This URL stays valid. If you change something here later and save, it shows up on stream within seconds — no need to touch the browser source.',
  'Ungültiger Kanal': 'Invalid channel',
  'kein Link': 'No link',
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
