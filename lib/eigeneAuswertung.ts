import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Die Auswertung der eigenen Lobbys - fuer Spieler, die sich mit Epic verifiziert haben.
 *
 * Der Betreiber (14.10.2026): in "Player Stats" eines normalen Cups standen nur Eliminierungen, K/D und Ueberlebenszeit, "drei Stats von
 * zwanzig". Epic nennt zu einem offenen Cup nicht mehr; Schaden, Treffer und Kopftreffer stehen nur im Server-Replay der Lobby - und die
 * grossen offenen Runden haben tausende Lobbys, die sich nicht alle auslesen lassen (scripts/clutch-berechnen.mjs, GROSS_MAX).
 *
 * Deshalb: wer seine Stats ansieht, bestellt damit die Auswertung SEINER Lobbys in diesem Cup - ein paar Replays statt tausend.
 *
 *   Server (app/api/eigene-auswertung)  schreibt eine kleine Bestellung   eigene-anfragen/<Fenster>__<Konto>.json
 *   Ablauf (.github/workflows/eigene-auswerten.yml, alle 10 Minuten)  liest die Replays der bestellten Lobbys mit tools/replay-voll und
 *                                       legt das Ergebnis ab              eigene-stats/<Fenster>/<Konto>.json
 *   Seite (app/api/spieler-detail)      zeigt, was dort steht
 *
 * Wer sich einmal mit Epic verifiziert hat, steht ausserdem in eigene-konten/<Konto>.json: fuer diese Konten bestellt der Ablauf SELBST
 * jeden Cup der letzten 31 Tage, in dem sie in Epics Bestenliste stehen (scripts/eigene-bestellen.mjs) - der Betreiber (14.10.2026): "jeden
 * einzelnen Cup gleich wichtig, fuer jeden einzelnen Account", nicht nur die Cups, die jemand gerade offen hat.
 *
 * Beides liegt im privaten Datenarchiv (wie Konten und Karten) und wird mit scripts/daten-sync.mjs abgeglichen: je Bestellung und je
 * Ergebnis eine eigene Datei, geschrieben von genau einer Stelle - so gibt es keine Konflikte. Das Ergebnis liegt unter dem Konto JEDES
 * Teammitglieds (gleicher Inhalt): wer sich das Team ansieht, bekommt die Werte der ganzen Lobby-Gruppe.
 */

export interface Anfrage {
  eventId: string; windowId: string; epicId: string;
  /** Die Sitzungen (= Replays) dieses Spielers in diesem Fenster, aus Epics Bestenliste. */
  sitzungen: string[];
  /** Die Konten seines Teams in diesem Fenster (er selbst inbegriffen). */
  team: string[];
  zeit: number;
  /** Wann das juengste dieser Spiele endete (Millisekunden) - ab dann gelten die zwei Stunden, in denen ein noch nicht lesbares Replay abgewartet wird. */
  ende?: number;
}

export interface SpielerErgebnis {
  name?: string; spiele: number; kills: number; knocks: number; tode: number;
  dmg: number; dmgAlle: number; erlitten: number; treffer: number; krit: number; schild: number;
  /** Sekunden im Sturm (ab Version 3). */
  sturm?: number;
  /** Wie oft er vom Boden wiederbelebt wurde, und wie oft per Reboot zurueckgeholt (ab Version 4). */
  wiederbelebt?: number; rebootet?: number;
}

export interface Ergebnis {
  version: number; eventId: string; windowId: string; gerechnet: string;
  /** Wie viele Sitzungen bestellt waren und wie viele sich lesen liessen. */
  sitzungen: number; gelesen: number; fehlend?: string[]; grund?: string;
  spieler: Record<string, SpielerErgebnis>;
}

/** Fenster und Konto kommen in Dateinamen - nur das Uebliche (Buchstaben, Ziffern, Unter- und Bindestrich, Punkt). */
export const fensterOk = (w: string) => /^[\w.-]{3,120}$/.test(w);
export const kontoOk = (id: string) => /^[0-9a-f]{32}$/.test(id);

export const anfrageName = (w: string, id: string) => `eigene-anfragen/${w}__${id}.json`;
export const kontoName = (id: string) => `eigene-konten/${id}.json`;
export const ergebnisName = (w: string, id: string) => `eigene-stats/${w}/${id}.json`;

export const leseErgebnis = (w: string, id: string) => liesJson<Ergebnis | null>(ergebnisName(w, id), null).catch(() => null);
export const leseAnfrage = (w: string, id: string) => liesJson<Anfrage | null>(anfrageName(w, id), null).catch(() => null);
export const schreibeAnfrage = (a: Anfrage) => schreibJson(anfrageName(a.windowId, a.epicId), a);

/**
 * Ein verifiziertes Konto fuer die automatische Auswertung vormerken (einmal; weiter passiert nichts). Gelingt das Schreiben nicht, bleibt es beim
 * Bestellen je angesehenem Cup - die Verifizierung selbst scheitert daran nie.
 */
export async function merkeKonto(id: string): Promise<void> {
  if (!kontoOk(id)) return;
  try {
    if (await liesJson<{ id?: string } | null>(kontoName(id), null)) return;
    await schreibJson(kontoName(id), { id, zeit: Date.now() });
  } catch { /* dann eben nur je angesehenem Cup */ }
}

/** Das Replay hebt Epic 31 Tage auf; danach gibt es nichts mehr auszuwerten. */
export const FRIST_MS = 31 * 864e5;
