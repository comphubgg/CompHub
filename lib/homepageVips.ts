import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Wer auf der Startseite gezeigt wird.
 *
 * Der Betreiber wollte ausdruecklich zwei getrennte Dinge:
 *
 *   VIP sein          - ein Recht am Konto, vergeben in der Kontoverwaltung
 *   auf der Startseite stehen - eine Auswahl, die er von Hand trifft
 *
 * "Nicht jeder VIP-User wird automatisch auf der Homepage angezeigt." Und
 * umgekehrt: "Dabei bleibt ein VIP-User weiterhin VIP, auch wenn er nicht
 * für die Homepage ausgewählt wurde." Deshalb eine eigene Liste statt eines
 * Hakens am Konto - wer hier heraus faellt, verliert nichts.
 *
 * Die Liste ist bewusst schlank. Sie fuehrt nur, was auf der Karte steht:
 * ein Bild, ein Name, ein Twitch-Konto. Alles andere - ob jemand noch VIP
 * ist, wann das ablaeuft - steht dort, wo es hingehoert.
 */

const DATEI = path.join(DATEN_ORT, 'homepage-vips.json');

export interface HomepageVip {
  /** Eigene Kennung dieses Eintrags - unabhaengig vom Konto. */
  id: string;
  /**
   * Das Konto, zu dem er gehoert.
   *
   * Nur zur Erinnerung, woher der Eintrag stammt; die Anzeige haengt nicht
   * daran. Wer keinen Zugang (mehr) hat, kann trotzdem auf der Startseite
   * stehen - ein Kooperationspartner braucht kein Konto im Werkzeug.
   */
  konto?: string;
  /** Der Name auf der Karte. */
  name: string;
  /*
   * Die Konten, jeweils ohne @ und ohne Adresse - "vadeal", nicht die URL.
   *
   * Alle drei sind freiwillig und unabhaengig voneinander. Der Betreiber
   * wollte "bei Interesse TikTok oder X/Twitter als Social angeben" koennen
   * - nicht jeder Partner streamt, und wer nur auf X unterwegs ist, soll
   * genauso auf die Karte kommen.
   */
  twitch?: string;
  x?: string;
  tiktok?: string;
  /** Pfad zum Bild unter public, etwa "/vips/vadeal.png". */
  bild?: string;
  /** Steht er gerade auf der Startseite? */
  aktiv: boolean;
  /** Kleiner heisst weiter vorn. */
  reihenfolge: number;
}

export async function liesVips(): Promise<HomepageVip[]> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as HomepageVip[];
    if (!Array.isArray(roh)) return [];
    return roh
      .filter((v) => v && typeof v.id === 'string' && v.name)
      .map((v, i) => ({
        id: v.id,
        konto: v.konto || undefined,
        name: String(v.name),
        twitch: v.twitch || undefined,
        x: v.x || undefined,
        tiktok: v.tiktok || undefined,
        bild: v.bild || undefined,
        aktiv: v.aktiv !== false,
        reihenfolge: typeof v.reihenfolge === 'number' ? v.reihenfolge : i,
      }))
      .sort((a, b) => a.reihenfolge - b.reihenfolge);
  } catch {
    // Noch nie jemanden ausgewaehlt - dann ist die Liste leer, und der
    // Bereich auf der Startseite erscheint gar nicht erst.
    return [];
  }
}

export async function schreibeVips(liste: HomepageVip[]): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  /*
   * Beim Schreiben durchnummerieren.
   *
   * Sonst entstehen mit der Zeit Luecken und Doppelungen in der
   * Reihenfolge, und ein Verschieben um einen Platz waere nicht mehr
   * eindeutig.
   */
  const sortiert = [...liste]
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .map((v, i) => ({ ...v, reihenfolge: i }));
  await fs.writeFile(DATEI, JSON.stringify(sortiert, null, 2), 'utf8');
}

/** Wo ein Konto zu finden ist - und woran man seine Adresse erkennt. */
export const NETZE = {
  twitch: { titel: 'Twitch', adresse: 'https://twitch.tv/', wirt: /twitch\.tv/ },
  x: { titel: 'X', adresse: 'https://x.com/', wirt: /(x|twitter)\.com/ },
  tiktok: { titel: 'TikTok', adresse: 'https://tiktok.com/@', wirt: /tiktok\.com/ },
} as const;

export type Netz = keyof typeof NETZE;

/**
 * Ein Konto auf seinen blossen Namen bringen.
 *
 * Der Betreiber tippt mal "vadeal", mal "@vadeal", mal die ganze Adresse.
 * Gespeichert wird immer nur der Name - die Adresse baut die Karte selbst,
 * und so kann sie nie doppelt oder falsch zusammengesetzt werden.
 *
 * Bei TikTok steht in der Adresse ein "@" vor dem Namen; auch das faellt
 * weg, sonst stuende es spaeter zweimal da.
 */
export function kontoName(eingabe: string): string {
  return (eingabe ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(twitch\.tv|x\.com|twitter\.com|tiktok\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .slice(0, 40);
}

/** Die vollstaendige Adresse zu einem Konto. */
export function kontoAdresse(netz: Netz, name: string): string {
  return `${NETZE[netz].adresse}${name}`;
}
