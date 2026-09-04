/*
 * Der Zustand der sieben Hauptbereiche.
 *
 * Der Betreiber wollte jeden davon einzeln schalten koennen, ohne etwas
 * auszubauen oder zu loeschen:
 *
 *   online   - alles wie immer
 *   standby  - sichtbar, aber gesperrt; wer hingeht, liest einen Hinweis
 *   offline  - fuer alle ausser dem Admin verschwunden, auch aus der
 *              Kopfzeile, und ein direkter Aufruf der Adresse laeuft ins
 *              Leere
 *
 * Fuer ihn selbst aendert sich nichts: der Admin kommt in jedem Zustand
 * ueberall hin. Genau darum geht es - er will einen Bereich im Hintergrund
 * weiterbauen koennen, waehrend niemand sonst ihn sieht.
 *
 * Nichts wird dabei abgeschaltet oder entfernt. Ein Bereich auf "offline"
 * laeuft weiter wie zuvor, es sieht ihn nur keiner; ein Klick genuegt, und
 * er ist wieder da.
 */

export type Zustand = 'online' | 'standby' | 'offline';

export interface Sektion {
  /** Der Schluessel, unter dem der Zustand gespeichert wird. */
  schluessel: string;
  /** Die Adresse, an der dieser Bereich liegt. */
  pfad: string;
  /** Wie er in der Kopfzeile heisst. */
  titel: string;
}

/**
 * Die Bereiche, die sich schalten lassen - dieselben sieben wie in der
 * Kopfzeile, in derselben Reihenfolge.
 *
 * Bewusst keine Unterseiten: wer "Events" sperrt, sperrt auch die Seite
 * eines einzelnen Cups. Alles andere waere ein Loch, durch das jeder
 * hindurchginge, der einen Link hat.
 */
export const SEKTIONEN: Sektion[] = [
  { schluessel: 'home', pfad: '/', titel: 'Home' },
  { schluessel: 'streams', pfad: '/streams', titel: 'Streams' },
  { schluessel: 'rankings', pfad: '/power-rankings', titel: 'Rankings' },
  { schluessel: 'events', pfad: '/events', titel: 'Events' },
  { schluessel: 'statistiken', pfad: '/statistiken', titel: 'Statistics' },
  { schluessel: 'tierlist', pfad: '/tierlist', titel: 'Tierlist' },
  { schluessel: 'overlays', pfad: '/overlays', titel: 'Overlays' },
];

/**
 * Was auf der Sperrseite steht.
 *
 * Der Betreiber wollte auswaehlen koennen statt jedes Mal zu tippen. Vier
 * Anlaesse decken ab, weshalb ein Bereich zumacht - und sie sagen
 * Verschiedenes: "wird gebaut" ist etwas anderes als "ist gerade gestoert",
 * und wer wartet, moechte wissen, worauf.
 *
 * Ein eigener Text bleibt trotzdem moeglich; er hat Vorrang, wenn einer
 * hinterlegt ist.
 */
export const HINWEISE = [
  {
    schluessel: 'ueberarbeitung',
    name: 'Wird überarbeitet',
    titel: '{bereich} wird gerade überarbeitet.',
    text: 'Diese Section befindet sich momentan in Bearbeitung. Der '
      + 'Administrator arbeitet gerade an Updates und Verbesserungen. '
      + 'Schau bald wieder vorbei!',
  },
  {
    schluessel: 'bald',
    name: 'Kommt bald',
    titel: '{bereich} kommt bald.',
    text: 'An dieser Section wird gerade gebaut. Sie geht in Kürze online — '
      + 'es lohnt sich, später noch einmal vorbeizuschauen.',
  },
  {
    schluessel: 'wartung',
    name: 'Kurze Wartung',
    titel: '{bereich} ist kurz in Wartung.',
    text: 'Hier werden gerade Daten erneuert. Das dauert meist nur ein paar '
      + 'Minuten, danach steht wieder alles zur Verfügung.',
  },
  {
    schluessel: 'stoerung',
    name: 'Quelle antwortet nicht',
    titel: '{bereich} ist gerade nicht erreichbar.',
    text: 'Eine Datenquelle antwortet im Moment nicht. Lieber nichts zeigen '
      + 'als falsche Zahlen — sobald sie wieder da ist, geht es hier weiter.',
  },
] as const;

export type HinweisSchluessel = typeof HINWEISE[number]['schluessel'];

export interface SektionStand {
  zustand: Zustand;
  /** Welcher der vier Texte auf der Sperrseite steht. */
  hinweis: string;
  /** Ein eigener Text - hat Vorrang vor der Auswahl. */
  eigenerTitel?: string;
  eigenerText?: string;
  /** Wann zuletzt umgeschaltet wurde. */
  geaendert?: number;
}

export type Staende = Record<string, SektionStand>;

/** Der Zustand, solange nichts anderes hinterlegt ist. */
export const STANDARD: SektionStand = {
  zustand: 'online', hinweis: 'ueberarbeitung',
};

/**
 * Zu welchem Bereich gehoert diese Adresse?
 *
 * Home nur genau auf "/" - als Praefix passte es auf jede Seite und haette
 * beim Sperren das ganze Werkzeug mitgenommen. Alle anderen gelten auch
 * fuer ihre Unterseiten: wer Events sperrt, sperrt auch /events/s42_xyz.
 */
export function sektionVonPfad(pfad: string): Sektion | null {
  const rein = (pfad || '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (rein === '/') return SEKTIONEN[0];
  return SEKTIONEN.find(
    (s) => s.pfad !== '/' && (rein === s.pfad || rein.startsWith(`${s.pfad}/`)),
  ) ?? null;
}
