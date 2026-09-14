import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';
import { liesJson } from '@/lib/ablage';
import { fertigeAntwort } from '@/lib/antwortSpeicher';

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

/* ------------------------------------------ Alle Spieltage einer Saison */

/** Ein ausgewerteter Spieltag mit allen Konten - fuer die Saisonlisten. */
export interface AggregatTag {
  season: string; windowId: string; eventId: string; region: string;
  titel: string; datum: number | null;
  /** Wie viele Matches ausgewertet sind ... */
  ausgewertet: number;
  /** ... und wie viele der Spieltag insgesamt hatte, soweit bekannt. */
  gesamt: number | null;
  spieler: AggregatKonto[];
}

const saisonMerker = new Map<string, { tage: AggregatTag[]; bis: number }>();

/**
 * Alle ausgewerteten Spieltage einer Saison, mit den Werten je Konto.
 *
 * Fuer die Liste "Meiste Eliminierungen": die Szene-Quelle kennt nur
 * Finals, die eigenen Replays kennen jeden Spieltag, den der Sammler
 * eingesammelt hat - Opens eingeschlossen. Der Betreiber: "da hast du
 * mindestens die Eliminierungen, die hast du."
 *
 * Gelesen wird je Fenster das Aggregat und, fuer die Zahl aller Matches,
 * der Zustand des Sammlers; acht Fenster nebeneinander, damit hundert
 * Fenster aus der Ablage nicht hundertmal nacheinander warten. Zehn Minuten
 * gemerkt - die Saisonlisten werden ohnehin nur alle anderthalb Stunden neu
 * gerechnet.
 */
export async function aggregateSaison(season: string): Promise<AggregatTag[]> {
  const gemerkt = saisonMerker.get(season);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.tage;
  /*
   * Ueber die Ablage der fertigen Antworten, damit es ueber Instanzen hinweg
   * haelt: eine frische Server-Instanz liest dann eine Datei statt hundert.
   * Dreissig Minuten - die Replays werden alle zehn Minuten neu ausgewertet,
   * und ein paar Minuten Verzug tun der Saisonliste nichts.
   */
  const tage = await fertigeAntwort(`replays|saison|${season}`,
    () => aggregateLesen(season), 30 * 60_000);
  saisonMerker.set(season, { tage, bis: Date.now() + HALTBAR });
  return tage;
}

async function aggregateLesen(season: string): Promise<AggregatTag[]> {

  let fenster: string[] = [];
  try { fenster = await fs.readdir(path.join(ABLAGE, season)); } catch { fenster = []; }

  /*
   * Wie viele Matches ein Spieltag insgesamt hatte - aus der Uebersicht.
   *
   * Sie lag vorher in jeder Sammler-Datei einzeln; hundert Fenster hiessen
   * hundert weitere Lesevorgaenge aus der Ablage, und auf dem Server lief
   * die Startansicht damit in die Zeitgrenze. Die fertige Uebersicht der
   * Replays traegt dieselbe Zahl je Fenster - ein einziger Lesevorgang.
   */
  const gesamtJe = new Map<string, number>();
  try {
    const u = await liesJson<{ wert?: { fenster?: Array<{ windowId: string; gesamt?: number }> } } | null>(
      'antworten/replays_uebersicht.json', null);
    for (const f of u?.wert?.fenster ?? []) {
      if (typeof f.gesamt === 'number') gesamtJe.set(f.windowId, f.gesamt);
    }
  } catch { /* dann bleibt die Gesamtzahl unbekannt */ }

  const tage: AggregatTag[] = [];
  const GLEICHZEITIG = 16;
  for (let i = 0; i < fenster.length; i += GLEICHZEITIG) {
    const gruppe = fenster.slice(i, i + GLEICHZEITIG);
    const ergebnisse = await Promise.all(gruppe.map(async (w) => {
      try {
        const roh = JSON.parse(await fs.readFile(
          path.join(ABLAGE, season, w, '_aggregat.json'), 'utf8')) as Aggregat & {
            eventId?: string; region?: string; titel?: string; von?: number;
          };
        if (!Array.isArray(roh.spieler) || !roh.spieler.length) return null;
        const gesamt = gesamtJe.get(w) ?? null;
        return {
          season, windowId: w,
          eventId: roh.eventId ?? '', region: roh.region ?? '',
          titel: roh.titel ?? w, datum: typeof roh.von === 'number' ? roh.von : null,
          ausgewertet: roh.matches ?? 0, gesamt,
          spieler: roh.spieler.filter((k) => k.epicId),
        } as AggregatTag;
      } catch { return null; }
    }));
    for (const t of ergebnisse) if (t) tage.push(t);
  }

  return tage;
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
