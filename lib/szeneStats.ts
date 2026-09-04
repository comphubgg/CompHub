// Das gespiegelte Archiv der Einzelwerte - lesen und zusammenrechnen.
//
// Unter data/szene-stats/{REGION}/{SAISON}/ liegt je Spieltag eine Datei mit
// den Werten jedes Teilnehmers (siehe scripts/szene-stats-holen.mjs). Diese
// Datei macht daraus, was eine Oberflaeche braucht: die Summe ueber beliebig
// viele Spieltage je Spieler.
//
// Zwei Dinge bleiben bewusst aussen vor:
//
//   * Das "Rating" der Quelle. Es steht in keiner der offenen Dateien, und
//     die Zahl `damageRatio` darin ist nicht dasselbe: fuer shxrk stehen dort
//     2,7763, waehrend ausgeteilt durch erlitten 1,8772 ergibt und die Seite
//     selbst 2,35 anzeigt. Drei Zahlen, keine Formel - also keine Uebernahme.
//   * Die Spielerfotos. Die sind lizenzierte Pressebilder ("Photo by Michal
//     Konkol") und gehoeren dem Fotografen.
//
// Was hier gerechnet wird, laesst sich dagegen aus den Dateien nachrechnen.

import { promises as fs } from 'fs';
import path from 'path';
import { replayWert } from '@/lib/replayWerte';
import { DATEN_ORT } from './datenOrt';

const ABLAGE = path.join(DATEN_ORT, 'szene-stats');

/**
 * Wie eine Saison heisst.
 *
 * Epic zaehlt seine Saisons durch - S36, S39, S41 -, die Szene spricht in
 * Kapiteln: "CH6 S3". Die Zuordnung ist abgelesen, nicht geraten.
 *
 * Fuer S30 bis S40 steht sie woertlich in den Daten: jede Spieltagsdatei
 * traegt im Feld "name" die Schreibweise der Szene, etwa
 * "CH6S3FNCSDivision1FinalsWeek1". Alle Dateien einer Saison nennen dasselbe
 * Kapitel - bei S39 sind das 158 uebereinstimmende Belege, bei S37 98, bei
 * S30 91; keine einzige Datei weicht ab.
 *
 * S41 und S42 tragen keinen solchen Namen mehr ("Escargo_Day1", "Reload
 * Elite Series 4 - Heat 3"). Fuer sie gelten zwei andere Belege:
 *
 *   * S41 -> CH7 S3 folgt aus der Vergleichsseite der Quelle: dort war CH7 S3
 *     gewaehlt, und die Ereignisliste dazu - Escargo Day1 bis Day4, Reload
 *     Elite Series 4, FNCS Major 2 - ist genau der Inhalt unseres
 *     S41-Ordners.
 *   * S42 ist die laufende Saison und heisst entsprechend CH7 S4.
 *
 * Die fortlaufende Zaehlung passt dazu: S39 -> CH7 S1 und S40 -> CH7 S2 sind
 * aus den Daten belegt, S41 und S42 schliessen daran an.
 *
 * S32, S35 und S38 fehlen - zu ihnen liefert die Quelle keine Dateien.
 */
export const SAISON_NAMEN: Record<string, string> = {
  S30: 'CH5 S3',
  S31: 'CH5 S4',
  S33: 'CH6 S1',
  S34: 'CH6 S2',
  S36: 'CH6 S3',
  S37: 'CH6 S4',
  S39: 'CH7 S1',
  S40: 'CH7 S2',
  S41: 'CH7 S3',
  S42: 'CH7 S4',
};

/** Der Anzeigename einer Saison - unbekannte bleiben, wie sie sind. */
export function saisonName(saison: string) {
  return SAISON_NAMEN[saison] ?? saison;
}

/*
 * Welche Turniere in der Statistik stehen sollen.
 *
 * Der Betreiber wollte dort nur das, was zaehlt: Finale, und davon nur die
 * grossen - Performance Cup, Division 1, FNCS Grand Finals, EWC. Keine
 * Division 2 bis 5, keine Cash Cups, keine Reload Victory Cups. Seine
 * Begruendung ist einleuchtend: die Uebersicht soll die Szene abbilden und
 * nicht jeden offenen Cup, an dem zehntausend Leute teilnehmen.
 *
 * Zwei Fragen, getrennt beantwortet:
 *
 *   Ist es ein grosses Turnier?  -> am Namen
 *   Ist es ein Finale?           -> an Epics Kennzeichen, sonst am Namen
 *
 * Das Kennzeichen gibt es nur bei den Spieltagen, die aus Epics eigener
 * Bestenliste stammen. Beim gespiegelten Archiv der Szene-Quelle steht es
 * nirgends, dort bleibt der Name - und der traegt bei dieser Quelle
 * zuverlaessig "Finals", wenn es eins ist ("FNCS Division 1 Practice -
 * Week 1 - Finals").
 */
export { istGrossesTurnier, istFinaleTag } from '@/lib/turnierArt';

/** Ein Spieltag im Verzeichnis. */
export interface ArchivEintrag {
  region: string;
  season: string;
  datei: string;
  eventId: string;
  windowId: string;
  /** Der Klarname, den die Quelle vergibt - "FNCS Major 2 - Grand Finals Day 2". */
  name: string;
  spieler: number;
  matches: number;
  /** Wann die Quelle die Datei erzeugt hat. */
  datum?: number;
}

/** Die Rohwerte eines Spielers an einem Spieltag. */
export interface RohSpieler {
  username: string; epicId: string;
  eliminations: number; assists: number; rebootsAndRevives: number;
  shots: number; headshots: number; hitsToPlayers: number;
  damageDealt: number; damageTakenFromPlayers: number;
  healthHealed: number; shieldHealed: number;
  stormDamage: number; fallDamage: number;
  woodFarmed: number; stoneFarmed: number; metalFarmed: number;
  woodBuildsPlaced: number; stoneBuildsPlaced: number; metalBuildsPlaced: number;
  distanceOnFoot: number; distanceSkydiving: number;
  timeInStorm: number; timeAlive: number; matchesPlayed: number;
}

interface Datei extends ArchivEintrag { players: RohSpieler[] }

/** Was ein Spieler ueber alle gewaehlten Spieltage zusammen erreicht hat. */
export interface SpielerSumme {
  epicId: string;
  /** Der zuletzt gesehene Name - Pros wechseln ihre Schreibweise staendig. */
  name: string;
  /** Alle Namen, unter denen dieses Konto angetreten ist. */
  namen: string[];
  regionen: string[];
  events: number;
  matches: number;

  elims: number;
  assists: number;
  reboots: number;
  shots: number;
  hits: number;
  headshots: number;
  damage: number;
  damageTaken: number;
  heals: number;
  stormDamage: number;
  fallDamage: number;
  mats: number;
  builds: number;
  distanz: number;
  timeInStorm: number;
  timeAlive: number;

  // Abgeleitet - die Rechnung steht jeweils dabei.
  /** Ausgeteilter geteilt durch erlittenen Schaden. */
  quote: number;
  /** Treffer geteilt durch Schuesse, in Prozent. */
  genauigkeit: number;
  /** Eliminierungen je Match. */
  elimsProMatch: number;
  /** Schaden je Match. */
  damageProMatch: number;
}

/* ------------------------------------------------------------ Verzeichnis */

let verzeichnis: ArchivEintrag[] | null = null;
let verzeichnisBis = 0;

export async function liesVerzeichnis(): Promise<ArchivEintrag[]> {
  if (verzeichnis && Date.now() < verzeichnisBis) return verzeichnis;
  try {
    verzeichnis = JSON.parse(
      await fs.readFile(path.join(ABLAGE, 'index.json'), 'utf8')) as ArchivEintrag[];
  } catch {
    verzeichnis = [];
  }
  verzeichnisBis = Date.now() + 60_000;
  return verzeichnis;
}

/** Welche Saisons und Regionen ueberhaupt im Archiv liegen. */
export async function auswahl() {
  const eintraege = await liesVerzeichnis();
  const kennungen = [...new Set(eintraege.map((e) => e.season))].sort().reverse();
  const regionen = [...new Set(eintraege.map((e) => e.region))].sort();
  return {
    // Kennung fuer die Abfrage, Name fuer die Anzeige.
    saisons: kennungen.map((k) => ({ kennung: k, name: saisonName(k) })),
    regionen,
    spieltage: eintraege.length,
  };
}

/* ------------------------------------------------------------- Einlesen */

const dateiCache = new Map<string, { daten: Datei | null; bis: number }>();
const HALTBAR = 5 * 60_000;

async function liesDatei(e: ArchivEintrag): Promise<Datei | null> {
  const schluessel = `${e.region}|${e.season}|${e.datei}`;
  const gemerkt = dateiCache.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.daten;

  let daten: Datei | null = null;
  try {
    daten = JSON.parse(await fs.readFile(
      path.join(ABLAGE, e.region, e.season, e.datei), 'utf8')) as Datei;
    if (!Array.isArray(daten.players)) daten = null;
  } catch {
    daten = null;
  }
  dateiCache.set(schluessel, { daten, bis: Date.now() + HALTBAR });
  return daten;
}

/* --------------------------------------------------------- Zusammenrechnen */

function leereSumme(epicId: string, name: string): SpielerSumme {
  return {
    epicId, name, namen: [], regionen: [], events: 0, matches: 0,
    elims: 0, assists: 0, reboots: 0, shots: 0, hits: 0, headshots: 0,
    damage: 0, damageTaken: 0, heals: 0, stormDamage: 0, fallDamage: 0,
    mats: 0, builds: 0, distanz: 0, timeInStorm: 0, timeAlive: 0,
    quote: 0, genauigkeit: 0, elimsProMatch: 0, damageProMatch: 0,
  };
}

export interface Filter {
  saison?: string;
  region?: string;
  /** Nur dieser eine Spieltag (windowId oder Dateiname ohne .json). */
  event?: string;
  /** Mehrere Spieltage zusammen - fuer die Summe einer Turnierreihe. */
  events?: string[];
}

/**
 * Alle Spieler ueber die gefilterten Spieltage zusammenrechnen.
 *
 * Gebuendelt wird ueber die Epic-Konto-ID, nicht ueber den Namen: dieselbe
 * Person tritt in einer Saison unter drei Schreibweisen an, und zwei
 * verschiedene Konten tragen gelegentlich denselben Namen.
 */
export async function summen(filter: Filter = {}) {
  const eintraege = (await liesVerzeichnis()).filter((e) =>
    (!filter.saison || e.season === filter.saison)
    && (!filter.region || e.region === filter.region)
    && (!filter.event || e.windowId === filter.event
        || e.datei === `${filter.event}.json`)
    && (!filter.events?.length
        || filter.events.includes(e.windowId)
        || filter.events.includes(e.datei.replace(/\.json$/i, ''))));

  const nachKonto = new Map<string, SpielerSumme>();
  const namen = new Map<string, Set<string>>();
  const regionen = new Map<string, Set<string>>();

  for (const e of eintraege) {
    const datei = await liesDatei(e);
    if (!datei) continue;

    for (const p of datei.players) {
      const id = p.epicId || p.username;
      if (!id) continue;
      const s = nachKonto.get(id) ?? leereSumme(id, p.username);
      s.name = p.username || s.name;
      s.events += 1;
      s.matches += p.matchesPlayed || 0;
      s.elims += p.eliminations || 0;
      s.assists += p.assists || 0;
      s.reboots += p.rebootsAndRevives || 0;
      s.shots += p.shots || 0;
      s.hits += p.hitsToPlayers || 0;
      s.headshots += p.headshots || 0;
      s.damage += p.damageDealt || 0;
      s.damageTaken += p.damageTakenFromPlayers || 0;
      s.heals += (p.healthHealed || 0) + (p.shieldHealed || 0);
      s.stormDamage += p.stormDamage || 0;
      s.fallDamage += p.fallDamage || 0;
      s.mats += (p.woodFarmed || 0) + (p.stoneFarmed || 0) + (p.metalFarmed || 0);
      s.builds += (p.woodBuildsPlaced || 0) + (p.stoneBuildsPlaced || 0)
                + (p.metalBuildsPlaced || 0);
      s.distanz += (p.distanceOnFoot || 0) + (p.distanceSkydiving || 0);
      s.timeInStorm += p.timeInStorm || 0;
      s.timeAlive += p.timeAlive || 0;
      nachKonto.set(id, s);

      if (!namen.has(id)) namen.set(id, new Set());
      namen.get(id)!.add(p.username);
      if (!regionen.has(id)) regionen.set(id, new Set());
      regionen.get(id)!.add(e.region);
    }
  }

  const liste = [...nachKonto.values()].map((s) => {
    s.namen = [...(namen.get(s.epicId) ?? [])];
    s.regionen = [...(regionen.get(s.epicId) ?? [])];
    s.quote = s.damageTaken > 0 ? +(s.damage / s.damageTaken).toFixed(2) : 0;
    s.genauigkeit = s.shots > 0 ? +((s.hits / s.shots) * 100).toFixed(1) : 0;
    s.elimsProMatch = s.matches > 0 ? +(s.elims / s.matches).toFixed(2) : 0;
    s.damageProMatch = s.matches > 0 ? Math.round(s.damage / s.matches) : 0;
    s.damage = Math.round(s.damage);
    s.damageTaken = Math.round(s.damageTaken);
    s.heals = Math.round(s.heals);
    s.stormDamage = Math.round(s.stormDamage);
    s.fallDamage = Math.round(s.fallDamage);
    // Zentimeter in Kilometer - die Quelle zaehlt in Zentimetern.
    s.distanz = +(s.distanz / 100_000).toFixed(1);
    return s;
  });

  const aus = await liesVersteckt();
  return {
    spieler: aus.size ? liste.filter((x) => !aus.has(x.epicId)) : liste,
    spieltage: eintraege.length,
  };
}

/**
 * Alle Spieler ueber das ganze Archiv - einmal gerechnet und gemerkt.
 *
 * Gebraucht wird das fuer Vergleiche: wo steht ein Spieler im Feld? Die
 * gefilterte Auswahl taugt dafuer nicht. Eine Saison mit zwei Spieltagen
 * enthaelt kaum jemanden mit genug Matches, und dann stuende ueberall eine
 * Null. Der Vergleich laeuft deshalb immer gegen das gesamte Archiv,
 * unabhaengig davon, welche Saison oben gewaehlt ist.
 */
let gesamtMerker: { liste: SpielerSumme[]; bis: number } | null = null;

/**
 * Konten, die der Admin aus der Oberflaeche genommen hat.
 *
 * Geloescht wird nichts - die Werte im Archiv bleiben, wo sie sind. Diese
 * Liste sorgt nur dafuer, dass die betreffenden Konten nirgends mehr
 * auftauchen: nicht in Bestenlisten, nicht in der Suche, nicht in der
 * Bilderansicht.
 *
 * Gefiltert wird an genau einer Stelle - am Ende von `summen()`. Alles, was
 * die Oberflaeche zeigt, geht dort hindurch; eine zweite Stelle waere eine
 * Stelle, die man vergisst.
 */
const VERSTECKT = path.join(DATEN_ORT, 'spieler-versteckt.json');
let versteckt: { menge: Set<string>; bis: number } | null = null;

export async function liesVersteckt(): Promise<Set<string>> {
  if (versteckt && Date.now() < versteckt.bis) return versteckt.menge;
  const menge = new Set<string>();
  try {
    const roh = JSON.parse(await fs.readFile(VERSTECKT, 'utf8')) as
      Array<{ id?: string }>;
    for (const e of roh) if (e.id) menge.add(e.id);
  } catch { /* noch niemand versteckt */ }
  // Kurz gemerkt, damit ein Versteckt-Klick sofort greift.
  versteckt = { menge, bis: Date.now() + 5_000 };
  return menge;
}

export async function gesamtSummen(): Promise<SpielerSumme[]> {
  if (gesamtMerker && Date.now() < gesamtMerker.bis) return gesamtMerker.liste;
  const { spieler } = await summen({});
  gesamtMerker = { liste: spieler, bis: Date.now() + HALTBAR };
  return spieler;
}

/**
 * Wer war an einem Spieltag der Staerkste?
 *
 * Das Vorbild fuehrt an dieser Stelle eine Marke "EVENT MVP". Wen sie
 * auszeichnet, entscheidet ihr Rating - das haben wir nicht. Was sich
 * dagegen aus jeder Spieltagsdatei ablesen laesst: wer an diesem Tag die
 * meisten Eliminierungen hatte. Genau das steht hier, und die Marke heisst
 * deshalb auch "Tagesbester" und nicht "MVP".
 *
 * Bei Gleichstand bekommen ihn alle, die oben stehen - eine Stichentscheidung
 * waere geraten.
 */
export interface Tagessieg {
  event: string; windowId: string; region: string; season: string;
  elims: number; damage: number; builds: number; mats: number; matches: number;
}

let tagesMerker: { karte: Map<string, Tagessieg[]>; bis: number } | null = null;

export async function tagesbeste(): Promise<Map<string, Tagessieg[]>> {
  if (tagesMerker && Date.now() < tagesMerker.bis) return tagesMerker.karte;

  const karte = new Map<string, Tagessieg[]>();
  for (const e of await liesVerzeichnis()) {
    const datei = await liesDatei(e);
    if (!datei?.players.length) continue;

    let hoechste = 0;
    for (const p of datei.players) {
      if ((p.eliminations || 0) > hoechste) hoechste = p.eliminations || 0;
    }
    if (hoechste <= 0) continue;

    for (const p of datei.players) {
      if (!p.epicId || (p.eliminations || 0) !== hoechste) continue;
      const liste = karte.get(p.epicId) ?? [];
      liste.push({
        event: e.name, windowId: e.windowId, region: e.region, season: e.season,
        elims: p.eliminations || 0,
        damage: Math.round(p.damageDealt || 0),
        builds: (p.woodBuildsPlaced || 0) + (p.stoneBuildsPlaced || 0)
          + (p.metalBuildsPlaced || 0),
        mats: (p.woodFarmed || 0) + (p.stoneFarmed || 0) + (p.metalFarmed || 0),
        matches: p.matchesPlayed || 0,
      });
      karte.set(p.epicId, liste);
    }
  }

  tagesMerker = { karte, bis: Date.now() + HALTBAR };
  return karte;
}

/**
 * Platzierung und Mitspieler zu einem Spieltag.
 *
 * Die gespiegelten Werte der Quelle enthalten beides nicht - dort steht je
 * Spieler nur, was er getan hat, nicht wo er landete und mit wem er antrat.
 * Beides kommt aus Epics eigener Bestenliste und liegt unter
 * data/platzierungen/ (siehe scripts/platzierungen-holen.mjs).
 *
 * Gespeichert sind dort nur Konto-Ids. Das ist Absicht: Namen wechseln von
 * Turnier zu Turnier, die Id bleibt - und wer gerade wie heisst, steht
 * ohnehin im Archiv.
 */
export interface Platzierung {
  platz: number;
  punkte: number;
  /** Die Konto-Ids der Mitspieler, ohne den Spieler selbst. */
  mitspieler: string[];
}

const PLATZ_ABLAGE = path.join(DATEN_ORT, 'platzierungen');

interface PlatzDatei {
  teams: Array<{ platz: number; punkte: number; spieler: string[] }>;
}

const platzCache = new Map<string, {
  karte: Map<string, Platzierung> | null; bis: number;
}>();

async function platzKarte(season: string, windowId: string) {
  const schluessel = `${season}|${windowId}`;
  const gemerkt = platzCache.get(schluessel);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.karte;

  let karte: Map<string, Platzierung> | null = null;
  try {
    const daten = JSON.parse(await fs.readFile(
      path.join(PLATZ_ABLAGE, season, `${windowId}.json`), 'utf8')) as PlatzDatei;
    karte = new Map();
    for (const team of daten.teams ?? []) {
      for (const id of team.spieler) {
        karte.set(id, {
          platz: team.platz,
          punkte: team.punkte,
          mitspieler: team.spieler.filter((x) => x !== id),
        });
      }
    }
  } catch {
    /*
     * Nichts unter data/platzierungen - dann in den Epic-Spieltagen
     * nachsehen.
     *
     * Anlass: in "Letzte 3 Turniere" stand beim Division-1-Finale ein
     * Strich statt eines Platzes, obwohl der Cup gelaufen war. Zwei
     * Ablagen fuehren dieselbe Angabe, und gefragt wurde nur eine. Die
     * Platzierungen holt ein eigenes Skript, das nicht jedes Fenster
     * erwischt; die Epic-Spieltage kommen stuendlich und hatten den Platz
     * laengst.
     *
     * Dieselben Zahlen aus derselben Quelle - Epics Bestenliste. Nur der
     * Weg dorthin ist ein anderer.
     */
    try {
      const roh = JSON.parse(await fs.readFile(
        path.join(EPIC_ABLAGE, season, `${windowId}.json`), 'utf8')) as {
          teams?: Array<{ platz: number; punkte: number; spieler: string[] }>;
        };
      if (Array.isArray(roh.teams) && roh.teams.length) {
        karte = new Map();
        for (const team of roh.teams) {
          for (const id of team.spieler) {
            karte.set(id, {
              platz: team.platz,
              punkte: team.punkte,
              mitspieler: team.spieler.filter((x) => x !== id),
            });
          }
        }
      } else {
        karte = null;
      }
    } catch {
      // Auch dort nichts - Epic haelt alte Bestenlisten nicht ewig
      // bereit. Dann bleibt die Zeile eben ohne Platz.
      karte = null;
    }
  }
  platzCache.set(schluessel, { karte, bis: Date.now() + HALTBAR });
  return karte;
}

/** Wie viele Spieltage eine Platzierung haben - fuer eine schnelle Kontrolle. */
export async function platzierungenVorhanden(): Promise<number> {
  let n = 0;
  try {
    for (const saison of await fs.readdir(PLATZ_ABLAGE)) {
      try {
        n += (await fs.readdir(path.join(PLATZ_ABLAGE, saison))).length;
      } catch { /* kein Ordner */ }
    }
  } catch { /* noch nichts geholt */ }
  return n;
}

/** Der Verlauf eines einzelnen Kontos, Spieltag fuer Spieltag. */
export async function verlauf(epicId: string, filter: Filter = {}) {
  const eintraege = (await liesVerzeichnis()).filter((e) =>
    (!filter.saison || e.season === filter.saison)
    && (!filter.region || e.region === filter.region));

  const zeilen: Array<{
    event: string; windowId: string; region: string; season: string;
    werte: RohSpieler;
    /** Wann der Spieltag lief - fuer die Sortierung. */
    datum: number;
    /** Aus Epics Bestenliste, wo vorhanden. */
    platz: number | null; punkte: number | null; mitspieler: string[];
  }> = [];

  for (const e of eintraege) {
    const datei = await liesDatei(e);
    if (!datei) continue;
    const p = datei.players.find((x) => x.epicId === epicId);
    if (!p) continue;
    const karte = await platzKarte(e.season, e.windowId);
    const platz = karte?.get(epicId) ?? null;
    zeilen.push({
      event: e.name, windowId: e.windowId, region: e.region, season: e.season, werte: p,
      datum: e.datum ?? 0,
      platz: platz?.platz ?? null,
      punkte: platz?.punkte ?? null,
      mitspieler: platz?.mitspieler ?? [],
    });
  }
  // Der juengste Spieltag zuerst.
  //
  // Das Verzeichnis liegt nach Region und Dateiname sortiert vor, nicht nach
  // Zeit. "Die letzten drei Turniere" zeigte deshalb irgendwelche drei -
  // meist die aus der zuerst gelesenen Region.
  zeilen.sort((a, b) => b.datum - a.datum);
  return zeilen;
}

/* ------------------------------------------------------------ Startseite */

/** Eine Bestenliste: Kennzahl, Titel, wie sie gerechnet wird. */
export const KENNZAHLEN: Array<{
  feld: keyof SpielerSumme; titel: string; nachkomma?: number; einheit?: string;
}> = [
  { feld: 'elims', titel: 'Meiste Eliminierungen' },
  { feld: 'damage', titel: 'Meister Schaden' },
  { feld: 'hits', titel: 'Meiste Treffer' },
  { feld: 'headshots', titel: 'Meiste Kopftreffer' },
  { feld: 'builds', titel: 'Meiste Bauteile' },
  { feld: 'quote', titel: 'Beste Schadensquote', nachkomma: 2 },
];

/**
 * Das Bild zu einem Turnier.
 *
 * Epic vergibt seine Grafiken je Cup, nicht je Spieltag - und im Archiv des
 * Werkzeugs liegen sie unter dem Cupnamen. Zugeordnet wird deshalb ueber
 * Stichworte im Turniernamen: "Reload Elite Series 4 - Heat 3" traegt die
 * Grafik der Reload Elite Series Championship, jede FNCS-Woche die der
 * Division-Cups. Wo nichts passt, bleibt es beim Farbfeld.
 */
const BILD_STICHWORTE: Array<[RegExp, string]> = [
  [/performance/i, 'Fortnite'],
  [/escargo|reload elite/i, 'Reload Elite Series Championship'],
  [/fncs.*(major|last ?chance|grand)/i, 'FNCS Global Championship Last Chance'],
  [/fncs.*division|division/i, 'FNCS Division 1 Practice'],
  [/shadow/i, 'Shadow Cup'],
  [/victory/i, 'Solo Victory Cup'],
  [/cash/i, 'Reload ZB Duos Cash Cup'],
  [/ranked/i, 'Solo Ranked Cup (Battle Royale)'],
];

let bildKatalog: Map<string, string> | null = null;
let bildKatalogBis = 0;

async function katalogBilder(): Promise<Map<string, string>> {
  if (bildKatalog && Date.now() < bildKatalogBis) return bildKatalog;
  const karte = new Map<string, string>();
  try {
    const arch = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'cup-archiv.json'), 'utf8')) as
      Array<{ titel: string; bild?: string }>;
    for (const a of arch) if (a.bild && !karte.has(a.titel)) karte.set(a.titel, a.bild);
  } catch { /* kein Archiv */ }
  bildKatalog = karte;
  bildKatalogBis = Date.now() + 5 * 60_000;
  return karte;
}

export async function bildFuer(name: string): Promise<string | null> {
  const katalog = await katalogBilder();
  for (const [muster, titel] of BILD_STICHWORTE) {
    if (muster.test(name)) {
      const b = katalog.get(titel);
      if (b) return b;
    }
  }
  return null;
}

/**
 * Was auf der Startseite steht.
 *
 * Die juengsten Spieltage mit ihrem jeweils staerksten Spieler - die
 * Oberflaeche wechselt im Takt zwischen ihnen durch -, dazu die Bestenlisten
 * der Saison. Was die Quelle dort "MVP" nennt, richtet sich nach ihrem
 * Rating; das haben wir nicht. Hier fuehrt, wer die meisten Eliminierungen
 * hatte, und die Ueberschrift sagt das auch.
 */
export async function startseite(saison?: string, wieViele = 25, jeTag = 3) {
  const alle = await liesVerzeichnis();
  const gefiltert = saison ? alle.filter((e) => e.season === saison) : alle;
  if (!gefiltert.length) return null;

  const juengste = [...gefiltert]
    .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0))
    .slice(0, wieViele);

  /**
   * Mehrere Spieler je Spieltag.
   *
   * Zuerst stand nur der Erste eines jeden Spieltags im Wechsel. In einer
   * frisch begonnenen Saison mit zwei Spieltagen wechselte die Seite deshalb
   * zwischen genau zwei Gesichtern hin und her. Jetzt kommen die besten drei
   * eines jeden Tages hinein - bei sieben Regionen ergibt das auch am Anfang
   * eine ordentliche Runde.
   */
  const kacheln: Array<{
    turnier: ArchivEintrag & { bild: string | null };
    spitze: SpielerSumme;
    /** Der wievielte dieses Spieltags - eins ist der Beste. */
    platz: number;
  }> = [];
  /*
   * Erst sammeln, dann mischen.
   *
   * Vorher wurden die Kacheln Spieltag fuer Spieltag angehaengt. Weil die
   * Spieltage nach Datum sortiert sind und eine Region ihre Fenster am
   * selben Abend spielt, kam dabei ein Block heraus: erst alle NAC, dann
   * alle EU, dann Asia. Der Betreiber wollte es gemischt - "mach es ein
   * bisschen einen Mixmax".
   *
   * Also zuerst je Spieltag die besten drei einsammeln und danach nach
   * Rang durchgehen: alle Ersten, dann alle Zweiten, dann alle Dritten.
   * Innerhalb einer Runde wird die Reihenfolge um den Rang versetzt, damit
   * nicht bei jedem Durchgang dieselbe Region beginnt.
   *
   * Gemischt wird ohne Zufall. Ein Zufallswert saehe hier harmlos aus,
   * wuerde aber bei jeder Anfrage eine andere Reihenfolge liefern - und
   * das faellt genau dann auf, wenn Server und Browser dieselbe Seite
   * zeichnen sollen.
   */
  const jeSpieltag: Array<Array<{
    turnier: ArchivEintrag & { bild: string | null };
    spitze: SpielerSumme;
    platz: number;
  }>> = [];

  for (const t of juengste) {
    const { spieler: feld } = await summen({
      saison: t.season, region: t.region, event: t.windowId,
    });
    const besten = [...feld].sort((a, b) => b.elims - a.elims).slice(0, jeTag);
    if (!besten.length) continue;
    const bild = await bildFuer(t.name);
    jeSpieltag.push(besten.map((spitze, i) => ({
      turnier: { ...t, bild }, spitze, platz: i + 1,
    })));
  }

  for (let rang = 0; rang < jeTag; rang += 1) {
    const runde = jeSpieltag
      .map((tag) => tag[rang])
      .filter(Boolean);
    // Versetzt beginnen: Runde eins faengt vorne an, Runde zwei einen
    // Spieltag spaeter, und so fort.
    const versatz = runde.length ? rang % runde.length : 0;
    for (let i = 0; i < runde.length; i += 1) {
      kacheln.push(runde[(i + versatz) % runde.length]);
    }
  }

  // Die Bestenlisten der Saison.
  const { spieler: saisonFeld } = await summen({ saison: juengste[0].season });
  /**
   * Wie viele Matches jemand fuer die Quotenliste gespielt haben muss.
   *
   * Bei Quoten braucht es eine Untergrenze, sonst fuehrt jemand mit einem
   * einzigen guten Match die Liste an. Zwanzig Matches waren dafuer die
   * Zahl - nur hat eine frisch begonnene Saison mit zwei Spieltagen
   * niemanden, der so weit kommt, und die Karte blieb leer.
   *
   * Die Grenze richtet sich deshalb nach der Saison selbst: die Haelfte
   * dessen, was der Fleissigste gespielt hat, hoechstens zwanzig und
   * mindestens drei. Die Zahl steht in der Antwort, damit die Oberflaeche
   * sie nennen kann - eine stillschweigend verschobene Huerde waere eine
   * andere Liste, die nur so aussieht wie dieselbe.
   */
  const hoechsteMatches = saisonFeld.reduce((m, s) => Math.max(m, s.matches), 0);
  const mindestMatches = Math.max(3, Math.min(20, Math.round(hoechsteMatches / 2)));

  const listen = KENNZAHLEN.map((k) => ({
    feld: String(k.feld),
    titel: k.titel,
    nachkomma: k.nachkomma ?? 0,
    einheit: k.einheit ?? null,
    /*
     * Die Untergrenze als Zahl, nicht als Satz.
     *
     * Hier stand "ab 8 Matches" - ein deutscher Text mitten in der Antwort,
     * der auf der englischen Seite genauso dastand. Die Oberflaeche kann
     * ihn selbst bauen und uebersetzen; sie braucht nur die Zahl.
     */
    mindestMatches: k.feld === 'quote' ? mindestMatches : null,
    plaetze: [...saisonFeld]
      .filter((s) => (k.feld === 'quote' ? s.matches >= mindestMatches : true))
      .sort((a, b) => Number(b[k.feld]) - Number(a[k.feld]))
      /*
       * Sechzig statt fuenfzehn.
       *
       * Die Kachel zeigt weiterhin nur fuenf. Hinter dem Plus daneben soll
       * aber die ganze Liste stehen - der Betreiber wollte "bis Top
       * fünfzig sozusagen, also nicht nur Top fünf". Sechzig gibt ein wenig
       * Luft, ohne die Antwort aufzublaehen.
       */
      .slice(0, 60),
  }));

  return { kacheln, listen, saison: juengste[0].season };
}

/* --------------------------------------------------------- Heimatregion */

/**
 * In welcher Region ein Konto tatsaechlich zu Hause ist.
 *
 * Die Region einer Datei sagt nur, wo dieser eine Spieltag lief. Filtert man
 * die Seite auf EU, traegt anschliessend jeder Spieler die Marke "EU" - auch
 * peterbot, der in zweiundvierzig NAC-Spieltagen antrat und in zweien in
 * Europa. Deshalb wird die Heimat einmal ueber das ganze Archiv ausgezaehlt:
 * es gilt die Region, in der das Konto am haeufigsten gespielt hat.
 */
let heimat: Map<string, string> | null = null;
let heimatBis = 0;

export async function heimatRegionen(): Promise<Map<string, string>> {
  if (heimat && Date.now() < heimatBis) return heimat;

  const zaehler = new Map<string, Map<string, number>>();
  for (const e of await liesVerzeichnis()) {
    const datei = await liesDatei(e);
    if (!datei) continue;
    for (const p of datei.players) {
      if (!p.epicId) continue;
      const je = zaehler.get(p.epicId) ?? new Map<string, number>();
      je.set(e.region, (je.get(e.region) ?? 0) + 1);
      zaehler.set(p.epicId, je);
    }
  }

  const karte = new Map<string, string>();
  for (const [id, je] of zaehler) {
    const beste = [...je.entries()].sort((a, b) => b[1] - a[1])[0];
    if (beste) karte.set(id, beste[0]);
  }

  /*
   * Eine von Hand gesetzte Region gilt vor der gezaehlten.
   *
   * Gezaehlt wird, wo jemand am haeufigsten angetreten ist - das trifft
   * fast immer zu, aber eben nicht immer. Der Betreiber: "es kann ja sein,
   * dass man jemand in eine andere Region ruft. Zum Beispiel dieser Spieler
   * ist jetzt grad in NAC." Wer wechselt, spielt dort erst wenige Male; die
   * Zaehlung haengt dann noch monatelang an der alten Region.
   *
   * Was er im Profil einträgt, gewinnt deshalb. Trägt er nichts ein, bleibt
   * es bei der Zaehlung - geraten wird nichts.
   */
  try {
    const profile = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; region?: string }>;
    for (const [schluessel, p] of Object.entries(profile)) {
      const id = p.id || schluessel;
      const r = (p.region ?? '').trim().toUpperCase();
      if (r && /^[0-9a-f]{32}$/.test(id)) karte.set(id, r);
    }
  } catch { /* ohne Profile bleibt es bei der Zaehlung */ }

  heimat = karte;
  heimatBis = Date.now() + 10 * 60_000;
  return karte;
}

/* -------------------------------------- Spieltage, die nur Epic kennt */

/**
 * Turniere, zu denen die Szene-Quelle (noch) nichts veroeffentlicht hat.
 *
 * Die Quelle spiegelt jeden Spieltag mit allen Einzelwerten, braucht dafuer
 * aber ein bis zwei Tage - und nicht jeder Cup erscheint dort ueberhaupt.
 * Bis dahin fehlte der Spieltag im Profil vollstaendig, obwohl er gelaufen
 * ist: das Turnier stand im Kalender, in der Laufbahn des Spielers aber
 * nicht.
 *
 * Epic fuehrt diese Fenster weiter und gibt heraus, wer wo stand und mit
 * wem. Genau das - und nur das - steht in data/epic-spieltage.
 *
 * Ausdruecklich NICHT dabei: Schaden, Material, Bauteile, Treffer. Epic
 * kennt sie nicht (nachgeprueft an einem Fenster, das beide Quellen haben:
 * Epic meldet Schaden 0, die Quelle 3550,24 fuer denselben Spieler). Die
 * Eliminierungen im Leaderboard gelten fuers ganze Team und bleiben deshalb
 * aus der Anzeige heraus.
 */
const EPIC_ABLAGE = path.join(DATEN_ORT, 'epic-spieltage');

export interface EpicSpieltag {
  eventId: string; windowId: string; region: string; season: string;
  titel: string; cupId: string;
  runde: number | null; rundenTyp: string | null; istFinale: boolean;
  datum: number | null;
  teams: Array<{
    platz: number; punkte: number; matches: number;
    teamElims: number; spieler: string[];
  }>;
}

let epicListe: EpicSpieltag[] | null = null;
let epicBis = 0;

async function liesEpicSpieltage(): Promise<EpicSpieltag[]> {
  if (epicListe && Date.now() < epicBis) return epicListe;

  const geladen: EpicSpieltag[] = [];
  try {
    for (const saison of await fs.readdir(EPIC_ABLAGE)) {
      const ordner = path.join(EPIC_ABLAGE, saison);
      let dateien: string[] = [];
      try { dateien = await fs.readdir(ordner); } catch { continue; }
      for (const datei of dateien) {
        if (!datei.endsWith('.json')) continue;
        try {
          geladen.push(JSON.parse(
            await fs.readFile(path.join(ordner, datei), 'utf8')) as EpicSpieltag);
        } catch { /* eine unlesbare Datei haelt den Rest nicht auf */ }
      }
    }
  } catch { /* der Ordner muss nicht existieren */ }

  epicListe = geladen;
  epicBis = Date.now() + 10 * 60_000;
  return geladen;
}

/**
 * Die Spieltage, die Epic kennt und die Szene-Quelle (noch) nicht -
 * aufbereitet fuer die Turnieruebersicht.
 *
 * Der Betreiber hatte zu Recht beanstandet, dass ein Cup, der gerade zu
 * Ende war, in der Statistik nicht auftauchte. Der Grund: die Uebersicht
 * las ausschliesslich das Archiv aus der Szene-Quelle, und die
 * veroeffentlicht erst ein bis zwei Tage spaeter. Epic dagegen fuehrt das
 * Fenster sofort.
 *
 * Diese Zeilen tragen deshalb "nurEpic". Was fehlt, fehlt sichtbar: Schaden,
 * Material und Bauteile kennt Epic nicht, und eine Kachel, die das
 * verschweigt, waere schlimmer als eine, die es dazuschreibt.
 */
export async function epicTurniere(filter: Filter = {}): Promise<Array<{
  region: string; season: string; datei: string; windowId: string;
  name: string; spieler: number; matches: number; datum?: number;
  nurEpic: true; istFinale: boolean; eventId: string;
}>> {
  const imArchiv = new Set((await liesVerzeichnis()).map((e) => e.windowId));
  const raus = [];
  for (const tag of await liesEpicSpieltage()) {
    if (imArchiv.has(tag.windowId)) continue;
    if (filter.saison && tag.season !== filter.saison) continue;
    if (filter.region && tag.region !== filter.region) continue;
    raus.push({
      region: tag.region,
      season: tag.season,
      // Es gibt keine Datei in der Szene-Ablage - der Fenstername ist der
      // Schluessel, unter dem die Oberflaeche die Kachel wiederfindet.
      datei: `${tag.windowId}.epic`,
      windowId: tag.windowId,
      eventId: tag.eventId,
      name: tag.titel,
      // Wie viele Konten in diesem Fenster standen. Teams mal Mitglieder -
      // Epic zaehlt Teams, die Uebersicht zeigt Teilnehmer.
      spieler: tag.teams.reduce((n, x) => n + x.spieler.length, 0),
      matches: tag.teams.reduce((n, x) => Math.max(n, x.matches), 0),
      datum: tag.datum ?? undefined,
      nurEpic: true as const,
      istFinale: tag.istFinale,
    });
  }
  return raus;
}

/** Eine Zeile fuer die Turnierliste - ohne Einzelwerte, mit klarer Herkunft. */
export interface EpicZeile {
  event: string; windowId: string; region: string; season: string;
  titel: string; datum: number | null;
  platz: number; punkte: number; matches: number;
  mitspieler: string[];
  /** Immer true - die Anzeige erkennt daran, dass Werte fehlen muessen. */
  nurEpic: true;
  /**
   * Eigene Eliminierungen aus dem Replay, wenn eines ausgewertet ist.
   *
   * Epics Bestenliste zaehlt sie nur je Team; das eigene Replay zaehlt sie
   * je Konto. Wo also ein Replay vorliegt, muss die Zeile nicht leer
   * bleiben. Schaden, Material und Bauteile stehen im Replay nicht - die
   * bleiben leer, denn geraten wird nichts.
   */
  replayElims?: number;
  replayKnocks?: number;
}

export async function epicVerlauf(
  epicId: string, filter: Filter = {},
): Promise<EpicZeile[]> {
  // Was die Quelle inzwischen doch veroeffentlicht hat, gehoert nicht mehr
  // hierher - sonst stuende der Spieltag zweimal in der Liste, einmal mit
  // und einmal ohne Werte.
  const imArchiv = new Set((await liesVerzeichnis()).map((e) => e.windowId));

  const zeilen: EpicZeile[] = [];
  for (const tag of await liesEpicSpieltage()) {
    if (imArchiv.has(tag.windowId)) continue;
    if (filter.saison && tag.season !== filter.saison) continue;
    if (filter.region && tag.region !== filter.region) continue;

    const team = tag.teams.find((t) => t.spieler.includes(epicId));
    if (!team) continue;

    zeilen.push({
      event: tag.windowId, windowId: tag.windowId, region: tag.region,
      season: tag.season, titel: tag.titel, datum: tag.datum,
      platz: team.platz, punkte: team.punkte, matches: team.matches,
      mitspieler: team.spieler.filter((id) => id !== epicId),
      nurEpic: true,
    });
  }
  /*
   * Und dazu, was die eigenen Replays zaehlen.
   *
   * Erst hier, nachdem feststeht, welche Zeilen ueberhaupt bleiben - so
   * wird je Spieltag hoechstens eine Datei angefasst.
   */
  for (const z of zeilen) {
    const w = await replayWert(z.season, z.windowId, epicId);
    if (!w) continue;
    z.replayElims = w.elims;
    z.replayKnocks = w.knocks;
  }

  zeilen.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  return zeilen;
}
