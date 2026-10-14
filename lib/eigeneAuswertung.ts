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
}

export interface SpielerErgebnis {
  name?: string; spiele: number; kills: number; knocks: number; tode: number;
  dmg: number; dmgAlle: number; erlitten: number; treffer: number; krit: number; schild: number;
}

export interface Ergebnis {
  version: 1; eventId: string; windowId: string; gerechnet: string;
  /** Wie viele Sitzungen bestellt waren und wie viele sich lesen liessen. */
  sitzungen: number; gelesen: number; fehlend?: string[]; grund?: string;
  spieler: Record<string, SpielerErgebnis>;
}

/** Fenster und Konto kommen in Dateinamen - nur das Uebliche (Buchstaben, Ziffern, Unter- und Bindestrich, Punkt). */
export const fensterOk = (w: string) => /^[\w.-]{3,120}$/.test(w);
export const kontoOk = (id: string) => /^[0-9a-f]{32}$/.test(id);

export const anfrageName = (w: string, id: string) => `eigene-anfragen/${w}__${id}.json`;
export const ergebnisName = (w: string, id: string) => `eigene-stats/${w}/${id}.json`;

export const leseErgebnis = (w: string, id: string) => liesJson<Ergebnis | null>(ergebnisName(w, id), null).catch(() => null);
export const leseAnfrage = (w: string, id: string) => liesJson<Anfrage | null>(anfrageName(w, id), null).catch(() => null);
export const schreibeAnfrage = (a: Anfrage) => schreibJson(anfrageName(a.windowId, a.epicId), a);

/** Das Replay hebt Epic 31 Tage auf; danach gibt es nichts mehr auszuwerten. */
export const FRIST_MS = 31 * 864e5;
