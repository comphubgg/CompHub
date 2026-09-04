import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Die Einzelwerte aus den eigenen Replay-Auswertungen.
 *
 * Anlass: in "Letzte Turniere" standen bei manchen Spieltagen nur Striche.
 * Der Grund war richtig - die Szene-Quelle hatte zu diesem Tag nichts
 * veroeffentlicht, und Epics Bestenliste fuehrt Eliminierungen nur je Team,
 * nicht je Spieler. Eine Teamzahl in einer Spielerspalte waere falsch.
 *
 * Es gibt aber eine dritte Quelle, und sie liegt hier im Haus: die
 * Turnier-Replays. Sie werden ohnehin eingesammelt und ausgewertet, und
 * darin steht je Konto, wie oft es jemanden ausgeschaltet hat - gezaehlt
 * aus dem Spielverlauf, nicht geschaetzt.
 *
 * Beispiel, nachgesehen: im Fenster S42_FNCSDivisionalCup_Division1_Event1_EU
 * steht in der Zeile eines Spielers ein Strich, waehrend das Replay
 * fuenfzig Eliminierungen aus elf Matches zaehlt.
 *
 * Was hier NICHT herkommt: Schaden, Material, Bauteile. Der Replay-Leser
 * erfasst sie nicht. Sie bleiben leer - lieber eine Luecke als eine Zahl,
 * die niemand nachrechnen kann.
 */

const ABLAGE = path.join(DATEN_ORT, 'replays');

interface AggregatKonto {
  epicId: string;
  matches: number;
  kills: number;
  knocks: number;
}

interface Aggregat {
  season: string;
  windowId: string;
  matches: number;
  spieler: AggregatKonto[];
}

/** Was ein Replay zu einem Spieler an einem Spieltag weiss. */
export interface ReplayWert {
  /** Eigene Eliminierungen, aus dem Spielverlauf gezaehlt. */
  elims: number;
  /** Wie oft er jemanden umgehauen hat. */
  knocks: number;
  /** In wie vielen Matches er auftaucht. */
  matches: number;
}

/*
 * Ein Zwischenspeicher je Fenster.
 *
 * Eine Aggregatdatei hat bis zu vierzehnhundert Konten; sie fuer jede Zeile
 * einer Verlaufstabelle neu zu lesen waere Unfug. Zehn Minuten reichen -
 * waehrend eines laufenden Cups wird sie ohnehin alle paar Minuten neu
 * geschrieben.
 */
const merker = new Map<string, { karte: Map<string, ReplayWert>; bis: number }>();
const HALTBAR = 10 * 60_000;

async function fensterKarte(
  season: string, windowId: string,
): Promise<Map<string, ReplayWert>> {
  const schluessel = `${season}|${windowId}`;
  const gemerkt = merker.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.karte;

  const karte = new Map<string, ReplayWert>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(ABLAGE, season, windowId, '_aggregat.json'), 'utf8')) as Aggregat;
    for (const k of roh.spieler ?? []) {
      if (!k.epicId) continue;
      karte.set(k.epicId, {
        elims: k.kills ?? 0,
        knocks: k.knocks ?? 0,
        matches: k.matches ?? 0,
      });
    }
  } catch {
    // Zu diesem Fenster liegt kein ausgewertetes Replay - der Normalfall
    // bei allem, was aelter als einunddreissig Tage ist.
  }

  merker.set(schluessel, { karte, bis: Date.now() + HALTBAR });
  return karte;
}

/**
 * Was die Replays zu diesem Spieler an diesem Spieltag zaehlen.
 *
 * Gibt nichts zurueck, wenn kein Replay ausgewertet ist oder der Spieler
 * darin nicht vorkommt.
 */
export async function replayWert(
  season: string, windowId: string, epicId: string,
): Promise<ReplayWert | null> {
  if (!season || !windowId || !epicId) return null;
  return (await fensterKarte(season, windowId)).get(epicId) ?? null;
}
