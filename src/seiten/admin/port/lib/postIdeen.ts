/* Nur die Typen aus lib/postIdeen.ts (main) - die Ideen baut der Server. */
export type IdeeArt =
  | 'org-vertretung' | 'org-monat' | 'spieler-woche' | 'laender-woche' | 'meilenstein' | 'pr-aufsteiger' | 'konstanz' | 'zeitplan' | 'promo';
export type Format = '1600x900' | '1500x500';
export interface BildSpieler { id: string | null; name: string; land: string | null }
export interface BildOrg { name: string; logo: string | null; anzahl: number; spieler: BildSpieler[]; erster: boolean }
export interface BildZeile {
  rang: number; titel: string; unter?: string; wert: string; land?: string | null; logo?: string | null; foto?: string | null; hervor?: boolean;
}
export interface PlanTag { tag: string; eintraege: Array<{ titel: string; zeiten: string; finale: boolean }> }

interface Kopf { kicker: string; titel: string; unter: string; fuss: string }
export type IdeeBild =
  | (Kopf & { typ: 'orgs'; orgs: BildOrg[]; frei: BildSpieler[]; gesamt: number; abzeichen: string })
  | (Kopf & { typ: 'liste'; zeilen: BildZeile[]; wertTitel: string })
  | (Kopf & { typ: 'plan'; tage: PlanTag[] })
  | (Kopf & { typ: 'promo'; punkte: string[] });

export interface PostIdee {
  /** Fest je Inhalt (z. B. "org-vertretung:S43_FNCSSoloReload_Final_EU") - fuer Bild-Adresse und Auswahl. */
  id: string;
  art: IdeeArt;
  /** Kurzer Name fuer den Betreiber (deutsch). */
  titel: string;
  /** Warum heute (deutsch) - und was an den Daten offen ist. */
  grund: string;
  /** 0-100: wie gut die Idee heute passt (Termine, frische Daten, Meilensteine). */
  relevanz: number;
  /** Der fertige Text zum Kopieren (englisch). */
  text: string;
  bild: IdeeBild;
  standardFormat: Format;
}

