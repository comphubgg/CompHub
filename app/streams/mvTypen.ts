/*
 * Gemeinsame Typen und Grundwerte der Multiview (app/streams/Multiview.tsx).
 *
 * Der Betreiber (11.10.2026): die Streams-Seite soll wie viewington.com/watch aussehen und sich so
 * bedienen - eine Wand aus Twitch-Playern, links eine Seitenleiste, Einstellungen und Tastenkuerzel.
 * In den Farben von CompHub, ohne Farbwahl, ohne Import/Export; die Ordner (Profile) bleiben.
 */

import type { HudOrt } from '@/lib/pov';
import type { HudGroesse } from '@/app/components/PovHud';
import type { StatsOrt } from '@/app/components/PovStatsBanner';

/** Ein Stream auf der Wand. Die Reihenfolge im Feld ist die Reihenfolge auf der Wand. */
export interface MvStream {
  id: string;
  /** Kennung eines Pro-POVs (privat ueber CompHub, nicht Twitch) - dann ist "kanal" nur der Anzeigename. */
  pov?: string;
  /** Wann der Stream dazukam - bestimmt die feste Zeichenreihenfolge der Player (nicht die Sortierung). */
  nr: number;
  kanal: string;
  versteckt: boolean;
  /** Auch zeigen, wenn der Kanal gerade offline ist (der Betreiber weiss, dass er gleich kommt). */
  zeigeOffline: boolean;
  /** Nur fuer diese Sitzung: nach dem Neuladen der Seite weg (nicht in einem Ordner gespeichert). */
  einmalig: boolean;
  /** Angeheftet: bleibt vorn und laesst sich nicht verschieben oder mit "Alle entfernen" wegnehmen. */
  fest: boolean;
  /** Eigene Qualitaet dieses Streams; leer = die gemeinsame. */
  qualitaet: string;
}

/** title: der Titel des laufenden Streams - danach laesst sich filtern, wer wirklich einen bestimmten Cup spielt. */
export type LiveStand = Record<string, { isLive: boolean; viewers: number; title?: string }>;

export interface MvEinstellungen {
  ziehenUeberall: boolean;
  qualitaetJeStream: boolean;
  abgerundet: boolean;
  tooltips: boolean;
  tabSync: boolean;
  vollbildAndereStumm: boolean;
  vollbildQuelle: boolean;
  vollbildZurueck: boolean;
  vollbildStummBeimVerlassen: boolean;
  liveAbfrage: boolean;
  /** Sekunden zwischen zwei Abfragen. */
  liveTakt: number;
  /** Alle Kanaele zeigen, auch die offline sind. */
  offlineAlle: boolean;
  dunkel: boolean;
  /** Die Kopfzeile der Seite ausblenden - die Wand fuellt den ganzen Bildschirm. */
  streamModus: boolean;
  /**
   * Das Namensbanner auf Pro-POVs. Der Betreiber (11.10.2026): nicht der Profi stellt es ein, sondern wer
   * zuschaut - jeder VIP in seinen eigenen Einstellungen (Position, mit/ohne Profilbild).
   */
  povBanner: boolean;
  povBannerOrt: HudOrt;
  povBannerBild: boolean;
  povBannerGroesse: HudGroesse;
  /**
   * Die Statistik auf Pro-POVs (nur bei Profis mit verbundenem Epic-Konto): Platz, Punkte, Elims des laufenden
   * Cups - schlicht, schwarz und halbdurchsichtig. Position, Groesse und Profilbild stellt der Zuschauer ein.
   */
  povStats: boolean;
  povStatsOrt: StatsOrt;
  povStatsBild: boolean;
  povStatsGroesse: HudGroesse;
}

export const EINSTELLUNGEN_STANDARD: MvEinstellungen = {
  ziehenUeberall: false,
  qualitaetJeStream: false,
  abgerundet: true,
  tooltips: true,
  tabSync: false,
  vollbildAndereStumm: false,
  vollbildQuelle: false,
  vollbildZurueck: false,
  vollbildStummBeimVerlassen: false,
  liveAbfrage: true,
  liveTakt: 120,
  offlineAlle: false,
  dunkel: true,
  streamModus: false,
  povBanner: true,
  povBannerOrt: 'unten',
  povBannerBild: true,
  povBannerGroesse: 'mittel',
  povStats: false,
  povStatsOrt: 'oben',
  povStatsBild: true,
  povStatsGroesse: 'mittel',
};

export const LIVE_TAKTE = [30, 60, 120, 300];

export const QUALITAETEN: Array<{ wert: string; name: string }> = [
  { wert: 'auto', name: 'Auto' },
  { wert: 'chunked', name: 'Source' },
  { wert: '1080p60', name: '1080p60' },
  { wert: '720p60', name: '720p60' },
  { wert: '480p', name: '480p' },
  { wert: '360p', name: '360p' },
  { wert: '160p', name: '160p' },
];

export interface Kuerzel { code: string; ctrl: boolean; shift: boolean; alt: boolean }
export type KuerzelName = 'alleStumm' | 'q360' | 'qAuto' | 'ziehenUmschalten' | 'alleNeuLaden';

export const KUERZEL_STANDARD: Record<KuerzelName, Kuerzel> = {
  alleStumm: { code: 'KeyP', ctrl: false, shift: true, alt: false },
  q360: { code: 'Digit1', ctrl: false, shift: true, alt: false },
  qAuto: { code: 'Digit2', ctrl: false, shift: true, alt: false },
  ziehenUmschalten: { code: 'KeyM', ctrl: false, shift: true, alt: false },
  alleNeuLaden: { code: 'KeyR', ctrl: false, shift: true, alt: false },
};

/** "Shift + P" - fuer die Anzeige. */
export function kuerzelText(k: Kuerzel): string {
  const teile: string[] = [];
  if (k.ctrl) teile.push('Ctrl');
  if (k.alt) teile.push('Alt');
  if (k.shift) teile.push('Shift');
  teile.push(k.code.replace(/^Key/, '').replace(/^Digit/, ''));
  return teile.join(' + ');
}

export function passtKuerzel(e: KeyboardEvent, k: Kuerzel): boolean {
  return e.code === k.code && e.ctrlKey === k.ctrl && e.shiftKey === k.shift && e.altKey === k.alt;
}

/** Aus einer Eingabe ("twitch.tv/name", "@name", "Name") den Kanalnamen - oder null. */
export function kanalAusEingabe(eingabe: string): string | null {
  const name = eingabe.trim().toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@/, '');
  return /^[a-z0-9_]{3,25}$/.test(name) ? name : null;
}

export function ladeJson<T>(schluessel: string, rueckfall: T): T {
  try {
    const roh = window.localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : rueckfall;
  } catch { return rueckfall; }
}

export function speichereJson(schluessel: string, wert: unknown): void {
  try { window.localStorage.setItem(schluessel, JSON.stringify(wert)); } catch { /* voll oder gesperrt */ }
}

export const SCHLUESSEL_STAND = 'multihub_mv_v2';
export const SCHLUESSEL_EINSTELLUNGEN = 'multihub_mv_einstellungen_v1';
export const SCHLUESSEL_KUERZEL = 'multihub_mv_kuerzel_v1';
export const SCHLUESSEL_SEITE = 'multihub_mv_seite_v1';

/** Was die Seitenleiste und die Kacheln an der Wand ausloesen koennen. */
export interface MvAktionen {
  /** Mit Ordner: der Kanal wird dort gespeichert; ohne: nur fuer diese Sitzung. */
  hinzufuegen: (eingabe: string, ordnerId?: string) => boolean;
  zeigeOfflineUmschalten: (id: string) => void;
  offlineAlleUmschalten: () => void;
  entfernen: (id: string) => void;
  verstecken: (id: string) => void;
  festmachen: (id: string) => void;
  neuLaden: (id: string) => void;
  kanalAendern: (id: string, kanal: string) => void;
  qualitaetWaehlen: (id: string, qualitaet: string) => void;
  alleVerstecken: () => void;
  alleZeigen: () => void;
  alleEntfernen: () => void;
  alleAbspielen: () => void;
  allePausieren: () => void;
  alleStumm: () => void;
  alleNeuLaden: () => void;
  alleQualitaet: (qualitaet: string) => void;
  /** 'live': die Wand durch die Sendenden ersetzen. 'alle': jeden hinzufuegen, auch Offline. */
  ordnerLaden: (kanaele: string[], art: 'live' | 'alle' | 'dazu') => void;
  /** Einen einzelnen Kanal aus einem Ordner auf die Wand holen (auch offline). */
  kanalZeigen: (kanal: string) => void;
  /** Ein Pro-POV auf die Wand holen. */
  povZeigen: (ident: string, name: string) => void;
}
