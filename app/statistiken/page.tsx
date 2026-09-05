'use client';

// Der Statistikbereich.
//
// Aufgebaut wie das Vorbild aus der Szene: links eine feste Leiste mit den
// Bereichen und darunter die laufende Bestenliste, rechts der Inhalt. Oben in
// der Uebersicht der juengste Spieltag als grosse Karte, darunter die
// Bestenlisten der Saison in einem Raster.
//
// Zwei Unterschiede sind Absicht, nicht Nachlaessigkeit:
//
//   * Die Akzentfarbe ist das Blau der Startseite, nicht das Gold des
//     Vorbilds - im Werkzeug gilt durchgehend eine Farbe.
//   * Es gibt kein "Rating". Es steht in keiner offenen Datei der Quelle, und
//     eine geratene Formel waere eine erfundene Zahl. Wo dort das Rating die
//     Kopfzahl ist, stehen hier Eliminierungen - und die Ueberschrift sagt es.
//
// Ebenso fehlen die Spielerfotos: das sind lizenzierte Pressebilder.

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import { ohneZierrat } from '@/lib/homoglyph';

import T from '@/app/components/T';
import { useSprache, useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
/**
 * In welcher Reihenfolge die Regionen stehen.
 *
 * Der Betreiber sitzt in Europa und schaut dort zuerst hin; alphabetisch
 * sortiert stuende ASIA vorn und EU an dritter Stelle. Was hier nicht
 * aufgezaehlt ist, folgt dahinter in der Reihenfolge der Quelle.
 */
const REGION_REIHE = ['EU', 'NAC', 'NAW'];

function nachRegionReihe(regionen: string[]): string[] {
  const rang = (r: string) => {
    const i = REGION_REIHE.indexOf(r);
    return i === -1 ? REGION_REIHE.length : i;
  };
  return [...regionen].sort((a, b) => rang(a) - rang(b));
}

type Bereich = 'start' | 'turniere' | 'regional' | 'spieler' | 'vergleich' | 'bilder';
type SpielerReiter = 'uebersicht' | 'leistung' | 'werte' | 'turniere';

interface Spieler {
  epicId: string; name: string; anzeige: string; namen: string[];
  land: string | null; x: string | null; regionen: string[];
  /** Die Region, in der dieses Konto am haeufigsten gespielt hat. */
  heimat: string;
  /** Wurde der Name von Hand gesetzt? Dann gilt er woertlich. */
  gepflegt?: boolean;
  /** Ein wirkliches Foto - oder nur die Silhouette? */
  echtesFoto?: boolean;
  /** Der Pfad zum Spielerbild - Platzhalter, bis ein echtes Foto daliegt. */
  bild: string | null;
  events: number; matches: number;
  elims: number; assists: number; reboots: number; shots: number; hits: number;
  headshots: number; damage: number; damageTaken: number; heals: number;
  stormDamage: number; fallDamage: number; mats: number; builds: number;
  distanz: number; timeInStorm: number; timeAlive: number;
  quote: number; genauigkeit: number; elimsProMatch: number; damageProMatch: number;
}

interface Turnier {
  region: string; season: string; datei: string; windowId: string;
  name: string; spieler: number; matches: number; datum?: number;
  /** Epics eigene Grafik zum Cup, sofern eine passt. */
  bild?: string | null;
  /** "CH7 S3" statt "S41". */
  saisonName?: string;
  /*
   * Nur Epic kennt diesen Spieltag - die Szene-Quelle hat ihn noch nicht.
   *
   * Dann gibt es Platz, Punkte und Matches, aber keinen Schaden, kein
   * Material und keine Bauteile. Die Kachel schreibt das dazu, statt eine
   * Luecke wie eine Null aussehen zu lassen.
   */
  nurEpic?: boolean;
  istFinale?: boolean;
  eventId?: string;
}

/** Ein Spieltag samt einem seiner besten Spieler - eine Kachel des Wechslers. */
interface Kachel { turnier: Turnier; spitze: Spieler; platz?: number }

interface Liste {
  /** Nur bei der Quotenliste: wie viele Matches jemand haben muss. */
  mindestMatches?: number | null;
  feld: string; titel: string; nachkomma: number; einheit: string | null;
  plaetze: Spieler[];
}

interface Perzentile {
  elims: number; damage: number; headshots: number; mats: number; builds: number;
  timeAlive: number; reboots: number; quote: number; genauigkeit: number;
  feldgroesse: number;
}

interface FncsSieg {
  saison: string; turnier?: string;
  mitspieler?: Mitspieler[];
  elims?: number; damage?: number; builds?: number; mats?: number;
}

interface Profilgruppe { region: string; spieler: Spieler[] }
interface Duell { links: Spieler; rechts: Spieler }
interface PowerZeile {
  rank: number; name: string; land: string; wertung: number;
  deltaPlatz?: number; deltaWertung?: number;
}

interface Tagessieg {
  event: string; windowId: string; region: string; season: string;
  saisonName: string;
  elims: number; damage: number; builds: number; mats: number; matches: number;
}

interface Rang {
  global: number; globalVon: number;
  regional: number | null; regionalVon: number; region: string;
}

interface Fncs {
  titel: number;
  saisons: Array<{ saison: string; platz: number }>;
}

interface Mitspieler { epicId: string; name: string; land: string | null }

interface VerlaufZeile {
  event: string; windowId: string; region: string; season: string;
  werte: {
    eliminations: number; damageDealt: number; damageTakenFromPlayers: number;
    headshots: number; hitsToPlayers: number; shots: number;
    assists: number; matchesPlayed: number; timeAlive: number;
    woodFarmed?: number; stoneFarmed?: number; metalFarmed?: number;
    woodBuildsPlaced?: number; stoneBuildsPlaced?: number;
    metalBuildsPlaced?: number;
  };
  /** Wann der Spieltag lief, als Zeitstempel. */
  datum?: number;
  /**
   * Diese Zeile stammt allein aus Epics Bestenliste.
   *
   * Platz, Mitspieler und Matchzahl sind echt; Schaden, Material, Bauteile
   * und Eliminierungen gibt Epic je Spieler nicht heraus. Die Spalten
   * bleiben deshalb leer, statt eine Null oder einen Teamwert zu zeigen.
   */
  nurEpic?: boolean;
  /**
   * Eigene Eliminierungen aus dem ausgewerteten Replay.
   *
   * Nur bei Epic-Zeilen von Belang: dort ist die Spalte sonst leer, weil
   * Epic die Eliminierungen nur je Team fuehrt. Das Replay zaehlt sie je
   * Konto und schliesst damit genau diese Luecke.
   */
  replayElims?: number;
  /** Aus Epics Bestenliste - fehlt, wo Epic das Fenster nicht mehr vorhaelt. */
  platz: number | null;
  punkte: number | null;
  mitspieler: Mitspieler[];
}

const BEREICHE: Array<[Bereich, string]> = [
  ['start', 'Übersicht'],
  ['turniere', 'Turniere'],
  ['regional', 'Regionen'],
  ['spieler', 'Spieler'],
];

/**
 * Bereiche, die den VIPs vorbehalten sind.
 *
 * Der Vergleich ist keine Anzeige, sondern ein Werkzeug: zwei Spieler frei
 * waehlen und gegeneinanderstellen. Die fertigen Uebersichten - auch die
 * Kopf-an-Kopf-Zahlen darin - sieht jeder.
 */
const VIP_BEREICHE: Array<[Bereich, string]> = [
  ['vergleich', 'Vergleich'],
];

/**
 * Bereiche, die nur der Admin sieht.
 *
 * Die Bilderuebersicht ist ein Werkzeug zum Pflegen, kein Inhalt fuer
 * Zuschauer: dort steht, von wem ein Foto vorliegt und von wem nicht. Die
 * Fotos selbst sieht jeder - nur eben dort, wo sie hingehoeren, bei den
 * Spielern.
 */
const ADMIN_BEREICHE: Array<[Bereich, string]> = [
  ['bilder', 'Bilder'],
];

/**
 * Die Zeichen der Leiste.
 *
 * Gezeichnete Striche statt Emoji: 🏆 und 👤 kommen aus der Schriftart des
 * Systems und werden bunt dargestellt - mitten in einer sonst grauen Leiste
 * ein Farbtupfer, den niemand bestellt hat. Diese hier nehmen die Farbe des
 * Textes an und bleiben damit immer so ruhig wie ihre Umgebung.
 */
function Zeichen({ art }: { art: Bereich }) {
  const pfade: Record<Bereich, string> = {
    start: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    turniere: 'M6 4h12v3a6 6 0 0 1-12 0zM6 6H3v1a4 4 0 0 0 4 4M18 6h3v1a4 4 0 0 1-4 4'
      + 'M12 13v4M9 21h6M10 17h4',
    regional: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 10.5a1.5 1.5 0 1 0 0-3'
      + 'a1.5 1.5 0 0 0 0 3z',
    spieler: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
    bilder: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
    vergleich: 'M12 3v18 M7 8l-4 4 4 4 M17 8l4 4-4 4',
  };
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
      className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={pfade[art]} />
    </svg>
  );
}

/**
 * Die Bestenlisten einer Cup-Seite.
 *
 * Dieselbe Auswahl wie im Vorbild, soweit die Daten sie hergeben. Wo dort
 * "Highest Rated" und "Lowest Rated" stehen, steht hier die Schadensquote -
 * die laesst sich aus den Dateien nachrechnen, das Rating nicht.
 */
const CUP_LISTEN: Array<{
  feld: keyof Spieler; titel: string; nachkomma?: number; einheit?: string;
  kleinBesser?: boolean;
}> = [
  { feld: 'elims', titel: 'Meiste Eliminierungen' },
  { feld: 'damage', titel: 'Meister Schaden' },
  { feld: 'hits', titel: 'Meiste Treffer' },
  { feld: 'quote', titel: 'Beste Schadensquote', nachkomma: 2 },
  { feld: 'quote', titel: 'Schlechteste Schadensquote', nachkomma: 2, kleinBesser: true },
  { feld: 'damageTaken', titel: 'Meister Schaden erlitten' },
  { feld: 'headshots', titel: 'Meiste Kopftreffer' },
  { feld: 'assists', titel: 'Meiste Assists' },
  { feld: 'mats', titel: 'Meistes Material' },
  { feld: 'builds', titel: 'Meiste Bauteile' },
  { feld: 'genauigkeit', titel: 'Beste Trefferquote', nachkomma: 1, einheit: ' %' },
  { feld: 'reboots', titel: 'Meiste Wiederbelebungen' },
];

const SORTIERUNG: Array<[string, string]> = [
  ['elims', 'Meiste Eliminierungen'],
  ['damage', 'Meister Schaden'],
  ['elimsProMatch', 'Elims je Match'],
  ['damageProMatch', 'Schaden je Match'],
  ['quote', 'Beste Schadensquote'],
  ['genauigkeit', 'Beste Trefferquote'],
  ['headshots', 'Meiste Kopftreffer'],
  ['assists', 'Meiste Assists'],
  ['mats', 'Meistes Material'],
  ['builds', 'Meiste Bauteile'],
  ['matches', 'Meiste Matches'],
];

/**
 * Die Art eines Turniers aus seinem Namen.
 *
 * Epic liefert zu den aelteren Spieltagen kein Bild mehr - von 402 haben nur
 * 13 noch eines im Katalog. Statt leerer Kacheln bekommt jede Karte deshalb
 * eine Flaeche in der Farbe ihrer Turnierart mit dem Namen darauf. Das ist
 * Gestaltung, keine Behauptung ueber die Daten.
 */
function turnierArt(name: string): { wort: string; farbe: string } {
  const n = name.toLowerCase();
  if (n.includes('fncs')) return { wort: 'FNCS', farbe: 'from-violet-600/70 to-violet-900/40' };
  if (n.includes('division')) return { wort: 'DIVISION', farbe: 'from-indigo-600/70 to-indigo-900/40' };
  if (n.includes('reload')) return { wort: 'RELOAD', farbe: 'from-emerald-600/70 to-emerald-900/40' };
  if (n.includes('performance')) return { wort: 'PERFORMANCE', farbe: 'from-teal-600/70 to-teal-900/40' };
  if (n.includes('escargo')) return { wort: 'ESCARGO', farbe: 'from-amber-600/70 to-amber-900/40' };
  return { wort: 'CUP', farbe: 'from-sky-600/70 to-sky-900/40' };
}

/**
 * Der Name, wie er angezeigt wird.
 *
 * Durchgehend Grossbuchstaben - so haelt es das Vorbild, und in einer Liste
 * aus Kuerzeln, Orgtags und Zierzeichen beruhigt es das Bild erheblich.
 *
 * Bei einem Turniernamen fallen angehaengte Zierzeichen vorher weg. Bei einem
 * von Hand gesetzten Namen nicht: was der Nutzer eingetippt hat, steht so da.
 * Sonst koennte er einen Namen wie "demuś" gar nicht festhalten - das "ś"
 * gehoert zum Namen, sieht fuer eine Maschine aber aus wie Zierrat.
 */
function grossName(name: string, gepflegt = false) {
  return (gepflegt ? (name || '') : ohneZierrat(name || '')).toUpperCase();
}

/**
 * Zu welcher Reihe ein Spieltag gehoert.
 *
 * Die Quelle gliedert eine Saison nach Turnierreihen - FNCS, Division 1,
 * Performance Cup, Reload Elite Series und deren Championship. Die Namen der
 * Spieltage tragen das mit sich ("FNCS Major 2 - Heat 1", "Escargo Day3"),
 * also wird die Reihe daraus gelesen statt eine Liste zu pflegen, die bei
 * jedem neuen Cup nachgezogen werden muesste.
 */
function reiheVon(name: string): string {
  const n = name.toLowerCase();
  if (/reload elite championship|escargo/.test(n)) return 'RES Championship';
  if (/reload elite/.test(n)) return 'Reload Elite Series';
  if (/division/.test(n)) return 'FNCS Division 1';
  if (/fncs/.test(n)) return 'FNCS';
  if (/performance/.test(n)) return 'Performance Cup';
  return 'Weitere';
}

/** Die Kurzform eines Spieltagsnamens - fuer die Reiter einer Reihe. */
function kurzTurnier(name: string) {
  const teile = name.split(' - ');
  return (teile.length > 1 ? teile.slice(1).join(' · ') : name)
    .replace(/^Reload Elite Championship\s*/i, '')
    .trim() || name;
}

/**
 * Grosse Zahlen kurz - fuer die schmalen Spalten auf den Profilkarten.
 *
 * Dort stehen drei Werte nebeneinander in einer Karte von knapp zweihundert
 * Punkten Breite; "264.372" passt da nicht und wurde abgeschnitten, was
 * schlimmer ist als eine gerundete Angabe. Ab zehntausend wird deshalb in
 * Tausendern gezaehlt, ab einer Million in Millionen - erkennbar gekuerzt,
 * nicht heimlich beschnitten. Die vollen Zahlen stehen im Profil.
 */
function kurzZahl(n: number, sprache: 'de' | 'en' = 'de') {
  if (!Number.isFinite(n)) return '0';
  const mio = sprache === 'en' ? 'M' : 'Mio';
  const tsd = sprache === 'en' ? 'k' : 'Tsd';
  if (Math.abs(n) >= 1_000_000) return `${zahl(n / 1_000_000, 1, sprache)} ${mio}`;
  if (Math.abs(n) >= 10_000) return `${zahl(Math.round(n / 1000), 0, sprache)} ${tsd}`;
  return zahl(n, 0, sprache);
}

/*
 * Eine Zahl in der Schreibweise der eingestellten Sprache.
 *
 * Deutsch trennt Tausender mit dem Punkt, Englisch mit dem Komma - aus
 * "3.934 Players" wird sonst mitten auf einer englischen Seite eine Zahl,
 * die dort wie 3,934 aussieht und falsch gelesen wird. Der Ort wird
 * uebergeben statt global gesetzt: die Seite wird auch auf dem Server
 * gezeichnet, und ein gemeinsamer Zustand ueber Anfragen hinweg waere dort
 * eine Falle.
 */
function zahl(n: number, nachkomma = 0, sprache: 'de' | 'en' = 'de') {
  return (n ?? 0).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE', {
    minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma,
  });
}

function datumText(ms?: number, sprache: 'de' | 'en' = 'de') {
  if (!ms) return '';
  // Im Deutschen "24. August 2026", im Englischen "August 24, 2026" - das
  // macht Intl von selbst richtig, sobald es die Sprache kennt.
  return new Date(ms).toLocaleDateString(sprache === 'en' ? 'en-US' : 'de-DE',
    { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Das Kuerzel der Region als kleine Marke - wie im Vorbild. */
function RegionMarke({ region }: { region: string }) {
  return (
    <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px]
                     font-semibold tracking-wider text-slate-400">
      {region}
    </span>
  );
}

/** Der Verlauf eines Spielers - dieselbe Tabelle in mehreren Reitern. */
/**
 * Turniernamen lesbar machen.
 *
 * Die Quelle schreibt aeltere Turniere in einem Wort:
 * "CH6S2FNCSGrandFinalsDay1". Das Kapitel steht in der Zeile daneben schon,
 * und die zusammengezogenen Woerter lassen sich an den Grossbuchstaben und
 * Ziffern trennen. Neuere Namen bringen ihre Leerzeichen selbst mit und
 * gehen unveraendert durch - deshalb setzt die letzte Regel kein zweites
 * "-", wo schon eines steht.
 *
 * Geaendert wird nur die Schreibweise fuer die Anzeige; gespeichert bleibt
 * der Name der Quelle.
 */
function turnierName(roh: string) {
  if (!roh) return roh;
  let t = roh.replace(/^CH\d+S\d+/i, '').replace(/_/g, ' ');
  t = t.replace(/([A-Za-z])(\d)/g, '$1 $2');
  t = t.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  t = t.replace(/(FNCS|LCL|ZB|BR)([A-Z])/g, '$1 $2');
  if (!t.includes(' - ')) t = t.replace(/\s+(Day \d+)$/i, ' - $1');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || roh;
}

/**
 * Die Reihenfolge der Saisons.
 *
 * Gebuendelt wird nach Saison, sortiert wurde bisher nach dem Datum der
 * Spieltage darin. Das ging schief, solange im Verzeichnis der Abrufzeitpunkt
 * statt des Turniertags stand: 768 Spieltage aus acht Saisons trugen alle den
 * 12. Juli 2026, und bei gleichem Wert entscheidet die Lesereihenfolge. So
 * stand Chapter 7 Season 1 zwischen Chapter 5 und Chapter 6.
 *
 * Die Kennung selbst ist eindeutig - S42 kommt nach S41 - und bleibt richtig,
 * auch wenn zu einem Spieltag einmal kein Datum zu holen ist.
 */
function saisonRang(kennung: string) {
  const m = /^S(\d+)$/i.exec(kennung.trim());
  return m ? Number(m[1]) : -1;
}

/**
 * "CH7 S3" ausgeschrieben.
 *
 * Ueber der Turnierliste steht die Saison in voller Laenge, so wie es die
 * Szene ausspricht - in der Tabelle daneben bleibt die kurze Form.
 */
function kapitelName(kurz: string) {
  const m = /^CH(\d+)\s*S(\d+)$/i.exec(kurz.trim());
  return m ? `CHAPTER ${m[1]} SEASON ${m[2]}` : kurz.toUpperCase();
}

/**
 * Eine Zeile im Duell: links ein Wert, rechts ein Wert, dazwischen der Name.
 *
 * Gemessen wird am jeweils groesseren der beiden Werte: der Bessere fuellt
 * seinen Balken ganz aus, der andere genau so weit, wie sein Wert reicht.
 *
 * Zuerst teilten sich die beiden die Breite nach ihrem Anteil an der Summe.
 * Das sah bei 406 zu 399 aus wie zwei halbleere Balken, obwohl die beiden
 * fast gleichauf liegen. So dagegen steht daneben ein voller und ein zu
 * achtundneunzig Prozent gefuellter Balken - man sieht auf einen Blick, wie
 * knapp es ist.
 */
function Duellzeile({ titel, links, rechts, nachkomma = 0, einheit = '' }: {
  titel: string; links: number; rechts: number;
  nachkomma?: number; einheit?: string;
}) {
  const { sprache } = useSprache();
  const groesser = Math.max(links, rechts);
  const anteilLinks = groesser > 0 ? (links / groesser) * 100 : 0;
  const anteilRechts = groesser > 0 ? (rechts / groesser) * 100 : 0;
  const linksVorn = links > rechts;
  const rechtsVorn = rechts > links;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`w-20 shrink-0 text-right text-xs font-semibold tabular-nums
                        ${linksVorn ? 'text-sky-400' : 'text-slate-400'}`}>
        {zahl(links, nachkomma, sprache)}{einheit}
      </span>
      {/* Die Bahn bleibt sichtbar, damit man erkennt, wie weit ein Balken
          von voll entfernt ist. */}
      <span className="flex min-w-0 flex-1 justify-end overflow-hidden rounded-full
                       bg-zinc-900">
        <span className={`h-1.5 rounded-full ${linksVorn ? 'bg-sky-400' : 'bg-zinc-600'}`}
          style={{ width: `${anteilLinks}%` }} />
      </span>
      <span className="w-36 shrink-0 text-center text-[10px] font-semibold uppercase
                       tracking-[0.12em] text-slate-500"><T>{titel}</T></span>
      <span className="flex min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-900">
        <span className={`h-1.5 rounded-full ${rechtsVorn ? 'bg-sky-400' : 'bg-zinc-600'}`}
          style={{ width: `${anteilRechts}%` }} />
      </span>
      <span className={`w-20 shrink-0 text-xs font-semibold tabular-nums
                        ${rechtsVorn ? 'text-sky-400' : 'text-slate-400'}`}>
        {zahl(rechts, nachkomma, sprache)}{einheit}
      </span>
    </div>
  );
}

/** Welche Werte im Duell gegenuebergestellt werden. */
const DUELL_WERTE: Array<[string, keyof Spieler, number, string]> = [
  ['Eliminierungen', 'elims', 0, ''],
  ['Elims je Match', 'elimsProMatch', 2, ''],
  ['Schaden', 'damage', 0, ''],
  ['Schadensquote', 'quote', 2, ''],
  ['Treffer', 'hits', 0, ''],
  ['Kopftreffer', 'headshots', 0, ''],
  ['Trefferquote', 'genauigkeit', 1, ' %'],
  ['Assists', 'assists', 0, ''],
  ['Bauteile', 'builds', 0, ''],
  ['Material', 'mats', 0, ''],
  ['Matches', 'matches', 0, ''],
];

/**
 * Zwei Spieler nebeneinander.
 *
 * Dieselbe Ansicht auf der Startseite und im Vergleich - dort wechselt sie
 * von selbst durch, hier waehlt man beide Seiten selbst aus.
 */
function DuellTafel({ links, rechts, zeitraum, aufKlick, gross = false }: {
  links: Spieler; rechts: Spieler;
  /** Woher die Zahlen stammen - Saison oder Zeitraum, steht ueber der Tafel. */
  zeitraum: string;
  aufKlick?: (s: Spieler) => void;
  gross?: boolean;
}) {
  // Das Bild fuellt die ganze Hoehe der Tafel.
  //
  // Vorher hatte es ein festes Seitenverhaeltnis, und weil die Werteliste in
  // der Mitte hoeher ist, blieb ueber und unter dem Bild ein schwarzer
  // Streifen stehen. Jetzt spannt sich die Spalte ueber die volle Hoehe und
  // das Bild wird darin beschnitten - oben ausgerichtet, damit der Kopf
  // stehen bleibt.
  const seite = (s: Spieler, rechtsRum: boolean) => (
    <button onClick={() => aufKlick?.(s)} disabled={!aufKlick}
      className={`group relative w-[136px] shrink-0 self-stretch overflow-hidden
                  bg-zinc-900 ${gross ? 'sm:w-[210px]' : ''}
                  ${aufKlick ? 'cursor-pointer' : ''}`}>
      {s.bild ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.bild} alt=""
          className="absolute inset-0 h-full w-full object-cover object-top
                     transition duration-300 group-hover:scale-105" />
      ) : (
        <div className="flex h-full items-center justify-center text-3xl
                        text-zinc-700">?</div>
      )}
      <div className={`absolute bottom-0 w-full bg-gradient-to-t from-black/90
                       to-transparent px-2.5 pb-2 pt-6
                       ${rechtsRum ? 'text-right' : 'text-left'}`}>
        <span className={`flex items-center gap-1.5 ${rechtsRum
          ? 'justify-end' : ''}`}>
          <TeamFlagge groesse={15} laender={[s.land ?? undefined]} />
          <span className="min-w-0 truncate text-[11px] font-bold uppercase
                           tracking-wide text-slate-50">
            {grossName(s.anzeige, s.gepflegt)}
          </span>
        </span>
      </div>
    </button>
  );

  return (
    <div className="flex items-stretch gap-4 overflow-hidden rounded-xl border
                    border-zinc-800 bg-zinc-950/60">
      {seite(links, false)}
      <div className="min-w-0 flex-1 py-5">
        {/* Ueber der Tafel steht, woher die Zahlen kommen.
            Vorher standen dort die Matchzahlen - die sagen nichts darueber,
            welchen Zeitraum man gerade vergleicht, und genau das ist die
            erste Frage. Die Matches stehen jetzt als eigene Zeile unten. */}
        <p className="mb-2 text-center text-[10px] font-semibold uppercase
                      tracking-[0.2em] text-slate-600">
          {zeitraum}
        </p>
        {DUELL_WERTE.map(([titel, feld, nk, einheit]) => (
          <Duellzeile key={feld as string} titel={titel} nachkomma={nk} einheit={einheit}
            links={Number(links[feld] ?? 0)} rechts={Number(rechts[feld] ?? 0)} />
        ))}
      </div>
      {seite(rechts, true)}
    </div>
  );
}

/**
 * Das Netzdiagramm zweier Spieler.
 *
 * Jede Achse wird an dem groesseren der beiden Werte gemessen - der Bessere
 * beruehrt also immer den Rand. Damit zeigt die Form, wo jemand seine
 * Staerken hat, nicht wie gross die Zahlen sind; ein gemeinsamer absoluter
 * Massstab wuerde bei "Material" jede andere Achse platt druecken.
 */
function Netz({ links, rechts, namen }: {
  links: Spieler; rechts: Spieler; namen: [string, string];
}) {
  // Die Achsen stehen als Text im SVG - dort hilft kein <T>, also die
  // Uebersetzung direkt.
  const t = useT();
  const { sprache } = useSprache();
  const [zeigt, setZeigt] = useState<number | null>(null);

  const ACHSEN: Array<[string, keyof Spieler, number, string]> = [
    ['Eliminierungen', 'elims', 0, ''],
    ['Schaden', 'damage', 0, ''],
    ['Schadensquote', 'quote', 2, ''],
    ['Treffer', 'hits', 0, ''],
    ['Kopftreffer', 'headshots', 0, ''],
    ['Trefferquote', 'genauigkeit', 1, ' %'],
    ['Assists', 'assists', 0, ''],
    ['Bauteile', 'builds', 0, ''],
    ['Material', 'mats', 0, ''],
    ['Matches', 'matches', 0, ''],
  ];
  const M = 460, mitte = M / 2, radius = M / 2 - 74, RAND = 96;
  const punkt = (i: number, anteil: number) => {
    const winkel = (i / ACHSEN.length) * Math.PI * 2 - Math.PI / 2;
    return [mitte + Math.cos(winkel) * radius * anteil,
      mitte + Math.sin(winkel) * radius * anteil];
  };
  const anteilVon = (wer: Spieler, f: keyof Spieler) => {
    const groesser = Math.max(Number(links[f] ?? 0), Number(rechts[f] ?? 0)) || 1;
    // Nicht ganz bis an den Rand: sonst klebt der Bessere auf der
    // aeussersten Linie und die Form verliert ihre Kontur.
    return 0.08 + (Number(wer[f] ?? 0) / groesser) * 0.92;
  };
  const bahn = (wer: Spieler) => ACHSEN
    .map(([, f], i) => punkt(i, anteilVon(wer, f)).join(',')).join(' ');

  return (
    <div className="relative">
      {zeigt !== null && (() => {
        const [titel, feld, nk, einheit] = ACHSEN[zeigt];
        const [px, py] = punkt(zeigt, Math.max(
          anteilVon(links, feld), anteilVon(rechts, feld)));
        const linksProzent = ((px + RAND) / (M + RAND * 2)) * 100;
        return (
          <div className="pointer-events-none absolute z-20 whitespace-nowrap
                          rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2
                          shadow-xl"
            style={{
              left: `${linksProzent}%`,
              top: `${(py / M) * 100}%`,
              transform: `translate(${linksProzent < 22 ? '0'
                : linksProzent > 78 ? '-100%' : '-50%'}, calc(-100% - 12px))`,
            }}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]
                          text-slate-500"><T>{titel}</T></p>
            <p className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-200" />
              {grossName(namen[0])}
              <span className="font-semibold tabular-nums text-slate-100">
                {zahl(Number(links[feld] ?? 0), nk, sprache)}{einheit}
              </span>
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              {grossName(namen[1])}
              <span className="font-semibold tabular-nums text-slate-100">
                {zahl(Number(rechts[feld] ?? 0), nk, sprache)}{einheit}
              </span>
            </p>
          </div>
        );
      })()}

      <svg viewBox={`${-RAND} 0 ${M + RAND * 2} ${M}`}
        className="mx-auto block h-auto w-full max-w-[720px]"
        role="img" aria-label={t('Netzdiagramm der beiden Spieler')}>
        {/* Ein feines Netz aus acht Ringen statt vier dicken - so wirkt es
            leicht und die beiden Formen liegen darauf, statt dagegen
            anzukaempfen. */}
        {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((r) => (
          <polygon key={r} fill="none" stroke="currentColor" strokeWidth="0.6"
            className="text-zinc-800/70"
            points={ACHSEN.map((_, i) => punkt(i, r).join(',')).join(' ')} />
        ))}
        {ACHSEN.map((_, i) => {
          const [x, y] = punkt(i, 1);
          return <line key={i} x1={mitte} y1={mitte} x2={x} y2={y}
            stroke="currentColor" strokeWidth="0.6" className="text-zinc-800/70" />;
        })}

        <polygon points={bahn(links)} fill="currentColor" fillOpacity="0.07"
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          className="text-slate-200" />
        <polygon points={bahn(rechts)} fill="currentColor" fillOpacity="0.07"
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          className="text-sky-400" />

        {ACHSEN.map(([, f], i) => {
          const [lx, ly] = punkt(i, anteilVon(links, f));
          const [rx, ry] = punkt(i, anteilVon(rechts, f));
          return (
            <g key={i}>
              <circle cx={lx} cy={ly} r={zeigt === i ? 5.5 : 4}
                className="fill-slate-200" stroke="#09090b" strokeWidth="1.2" />
              <circle cx={rx} cy={ry} r={zeigt === i ? 5.5 : 4}
                className="fill-sky-400" stroke="#09090b" strokeWidth="1.2" />
            </g>
          );
        })}

        {/* Je Achse ein Tortenstueck als Trefferflaeche. */}
        {ACHSEN.map((_, i) => {
          const schritt = (Math.PI * 2) / ACHSEN.length;
          const a0 = (i / ACHSEN.length) * Math.PI * 2 - Math.PI / 2 - schritt / 2;
          const a1 = a0 + schritt;
          const R = radius * 1.12;
          const px0 = mitte + Math.cos(a0) * R, py0 = mitte + Math.sin(a0) * R;
          const px1 = mitte + Math.cos(a1) * R, py1 = mitte + Math.sin(a1) * R;
          return (
            <path key={`griff-${i}`} fill="transparent"
              d={`M ${mitte} ${mitte} L ${px0} ${py0}`
                + ` A ${R} ${R} 0 0 1 ${px1} ${py1} Z`}
              onMouseEnter={() => setZeigt(i)}
              onMouseLeave={() => setZeigt(null)} />
          );
        })}

        {ACHSEN.map(([titel], i) => {
          const [x, y] = punkt(i, 1.16);
          return (
            <text key={titel} x={x} y={y} fontSize="11.5" letterSpacing="0.9"
              className={zeigt === i ? 'fill-slate-50' : 'fill-slate-300'}
              fontWeight={700}
              textAnchor={x < mitte - 4 ? 'end' : x > mitte + 4 ? 'start' : 'middle'}
              dominantBaseline="middle">{t(titel).toUpperCase()}</text>
          );
        })}
      </svg>

      {/* Die Zuordnung der Farben steht unten in der Mitte, wie beim
          Vorbild - dort sucht das Auge sie nach dem Bild, nicht davor. */}
      <div className="mt-2 flex items-center justify-center gap-6">
        {([[namen[0], 'bg-slate-200'], [namen[1], 'bg-sky-400']] as
          Array<[string, string]>).map(([n, f]) => (
          <span key={n} className="flex items-center gap-2 text-[11px]
                                   font-semibold uppercase tracking-[0.12em]
                                   text-slate-400">
            <span className={`h-2 w-2 rounded-full ${f}`} />
            {grossName(n)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Zwei Verlaeufe in einem Bild.
 *
 * Die Spieltage der beiden sind nicht dieselben - jeder tritt woanders an.
 * Gezeichnet wird deshalb ueber die Position im eigenen Verlauf, von links
 * nach rechts, und die Beschriftung nennt die Zahl der Spieltage. Ein
 * gemeinsamer Zeitstrahl waere hier eine Behauptung.
 */
/**
 * Aus Punkten eine runde Linie.
 *
 * Eine Polylinie knickt an jedem Punkt - bei sechzehn Spieltagen sieht das aus
 * wie ein Saegeblatt. Hier laufen kubische Bezierkurven durch die Punkte
 * (Catmull-Rom): die Steigung an einem Punkt ergibt sich aus seinen beiden
 * Nachbarn. Die Linie geht weiterhin genau durch jeden Messwert - geglaettet
 * wird nur der Weg dazwischen, nicht die Zahl.
 */
function rund(punkte: Array<[number, number]>) {
  if (punkte.length < 2) return '';
  let d = `M ${punkte[0][0]} ${punkte[0][1]}`;
  for (let i = 0; i < punkte.length - 1; i++) {
    const p0 = punkte[i - 1] ?? punkte[i];
    const p1 = punkte[i];
    const p2 = punkte[i + 1];
    const p3 = punkte[i + 2] ?? p2;
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6},`
      + ` ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6},`
      + ` ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function DoppelLinie({ links, rechts, namen, marken, beschriftung }: {
  links: number[]; rechts: number[]; namen: [string, string];
  /** Der Turniername je Punkt, beide Seiten getrennt. */
  marken: [string[], string[]];
  beschriftung: string;
}) {
  const [zeigt, setZeigt] = useState<[0 | 1, number] | null>(null);
  if (links.length < 2 && rechts.length < 2) return null;

  const B = 1000, H = 280, obenRand = 22, untenRand = 24;
  const linksRand = 46, rechtsRand = 18;
  const alle = [...links, ...rechts];
  const hoch = Math.max(...alle), tief = Math.min(...alle);
  const luft = Math.max(1, Math.round((hoch - tief) * 0.14));
  const oben = hoch + luft, unten = Math.max(0, tief - luft);
  const spanne = oben - unten || 1;

  const x = (werte: number[], i: number) => linksRand
    + (werte.length < 2 ? 0.5 : i / (werte.length - 1)) * (B - linksRand - rechtsRand);
  const y = (v: number) => obenRand
    + (1 - (v - unten) / spanne) * (H - obenRand - untenRand);

  const marken_ = [0, 1, 2, 3, 4].map((k) => Math.round(unten + (spanne * k) / 4));

  const stellen = (werte: number[]): Array<[number, number]> =>
    werte.map((v, i) => [x(werte, i), y(v)]);

  const reihen: Array<[0 | 1, number[], string, string]> = [
    [0, links, 'text-slate-200', 'fill-slate-200'],
    [1, rechts, 'text-sky-400', 'fill-sky-400'],
  ];

  return (
    <div className="relative">
      {/* Die Zuordnung der Farben oben rechts. */}
      <div className="mb-2 flex items-center justify-end gap-5">
        {([[namen[0], 'bg-slate-200'], [namen[1], 'bg-sky-400']] as
          Array<[string, string]>).map(([n, f]) => (
          <span key={n} className="flex items-center gap-2 text-[11px]
                                   font-semibold uppercase tracking-[0.12em]
                                   text-slate-400">
            <span className={`h-2 w-2 rounded-full ${f}`} />
            {grossName(n)}
          </span>
        ))}
      </div>

      {zeigt !== null && (() => {
        const [welche, i] = zeigt;
        const werte = welche === 0 ? links : rechts;
        const px = (x(werte, i) / B) * 100;
        return (
          <div className="pointer-events-none absolute z-20 max-w-[280px]
                          rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2
                          shadow-xl"
            style={{
              left: `${px}%`, top: `${(y(werte[i]) / H) * 100}%`,
              transform: `translate(${px < 16 ? '0' : px > 84 ? '-100%' : '-50%'},
                          calc(-100% - 14px))`,
            }}>
            {/* Der Turniername statt einer Nummer - "Spieltag 4 von 16" sagt
                niemandem, welcher Cup das war. */}
            <p className="mb-1 text-[11px] font-semibold text-slate-100">
              {marken[welche][i] ?? beschriftung}
            </p>
            <p className="flex items-center gap-2 whitespace-nowrap text-[11px]
                          text-slate-400">
              <span className={`h-2 w-2 rounded-full ${welche === 0
                ? 'bg-slate-200' : 'bg-sky-400'}`} />
              {grossName(namen[welche])}
              <span className="font-semibold tabular-nums text-slate-100">
                {werte[i]}
              </span>
            </p>
          </div>
        );
      })()}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${B} ${H}`} className="block h-auto w-full min-w-[560px]"
          role="img" aria-label={beschriftung}>
          {marken_.map((m) => (
            <g key={m}>
              <line x1={linksRand} x2={B - rechtsRand} y1={y(m)} y2={y(m)}
                stroke="currentColor" strokeWidth="0.7" className="text-zinc-900" />
              <text x={linksRand - 10} y={y(m)} fontSize="10" textAnchor="end"
                dominantBaseline="middle" className="fill-slate-600">{m}</text>
            </g>
          ))}
          {/* Senkrechte Hilfslinien, an der laengeren der beiden Reihen. */}
          {(links.length >= rechts.length ? links : rechts).map((_, i, feld) => (
            i % Math.max(1, Math.round(feld.length / 12)) === 0 ? (
              <line key={i} x1={x(feld, i)} x2={x(feld, i)} y1={obenRand}
                y2={H - untenRand} stroke="currentColor" strokeWidth="0.7"
                className="text-zinc-900" />
            ) : null
          ))}

          {reihen.map(([welche, werte, farbe, fuellung]) => werte.length > 1 && (
            <g key={welche}>
              <path d={`${rund(stellen(werte))} L ${B - rechtsRand} ${H - untenRand}`
                + ` L ${linksRand} ${H - untenRand} Z`}
                fill="currentColor" fillOpacity="0.08" className={farbe} />
              <path d={rund(stellen(werte))} fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" className={farbe} />
              {werte.map((v, i) => (
                <circle key={i} cx={x(werte, i)} cy={y(v)}
                  r={zeigt?.[0] === welche && zeigt[1] === i ? 5.5 : 3.6}
                  className={fuellung} stroke="#09090b" strokeWidth="1.2" />
              ))}
              {werte.map((v, i) => (
                <circle key={`griff-${i}`} cx={x(werte, i)} cy={y(v)} r="15"
                  fill="transparent"
                  onMouseEnter={() => setZeigt([welche, i])}
                  onMouseLeave={() => setZeigt(null)} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/**
 * Wie sich die Spieltage nach Art trennen lassen.
 *
 * Die Quelle vergibt keine Kennung fuer die Turnierart - sie steckt nur im
 * Namen. Die Muster hier sind an den Namen im Archiv geprueft; was auf
 * keines passt, bleibt trotzdem unter "Alle" sichtbar.
 */
const TURNIER_ARTEN: Array<[string, RegExp | null]> = [
  ['Alle', null],
  ['Division', /division/i],
  ['Performance', /performance/i],
  ['FNCS Finals', /grand\s*final/i],
  ['FNCS Major', /major|heat|last\s*chance/i],
  ['Reload', /reload|escargo/i],
];

/**
 * Die Spieltage eines Spielers als Liste.
 *
 * Nachgebaut nach dem Vorbild: oben der Name mit Flagge und Region, daneben
 * drei Kennzahlen, darunter Zeile fuer Zeile die Spieltage. Wo dort die
 * Platzierung steht, stehen hier die Eliminierungen - Platzierungen liefern
 * die gespiegelten Dateien nicht.
 */
function TurnierListe({ wer, zeilen, farbe }: {
  wer: Spieler; zeilen: VerlaufZeile[]; farbe: 'hell' | 'blau';
}) {
  const { sprache } = useSprache();
  const elims = zeilen.map((z) => z.werte.eliminations);
  const schnitt = elims.length
    ? elims.reduce((a, b) => a + b, 0) / elims.length : 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${farbe === 'hell'
          ? 'bg-slate-300' : 'bg-sky-400'}`} />
        <TeamFlagge groesse={20} laender={[wer.land ?? undefined]} />
        <span className="text-base font-bold uppercase tracking-wide text-slate-50">
          {grossName(wer.anzeige, wer.gepflegt)}
        </span>
        {wer.heimat && <RegionMarke region={wer.heimat} />}
        <div className="ml-auto flex gap-2">
          {/*
            * Alle drei beziehen sich auf die Eliminierungen, nicht auf die
            * Platzierung - die liefern die gespiegelten Dateien nicht. Bei
            * Eliminierungen ist mehr besser, deshalb ist der hoechste Wert
            * der beste. Stuenden hier Plaetze, waere es umgekehrt; genau
            * das laesst sich ohne Beschriftung verwechseln.
            */}
          {([['Schnitt Elims', zahl(schnitt, 1, sprache)],
             ['Meiste Elims', String(Math.max(0, ...elims))],
             ['Wenigste Elims', String(elims.length ? Math.min(...elims) : 0)]] as
            Array<[string, string]>).map(([l, v]) => (
            <div key={l} className="min-w-[64px] rounded-lg border border-zinc-800
                                    bg-zinc-900/50 px-3 py-1.5 text-center">
              <p className="text-sm font-bold tabular-nums text-slate-100">{v}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase
                            tracking-[0.12em] text-slate-600"><T>{l}</T></p>
            </div>
          ))}
        </div>
      </div>

      {zeilen.length > 0 && (
        <div className="mb-1.5 flex items-center gap-3 px-3 text-[9px]
                        font-semibold uppercase tracking-[0.14em] text-slate-600">
          <span className="w-10 shrink-0 text-center"><T>Elims</T></span>
          <span className="min-w-0 flex-1"><T>Spieltag</T></span>
          <span className="shrink-0"><T>Schaden</T></span>
        </div>
      )}

      {!zeilen.length ? (
        <p className="py-6 text-center text-xs text-slate-600">
          <T>Keine Spieltage dieser Art.</T>
        </p>
      ) : (
        <div className="space-y-1.5">
          {zeilen.map((z) => (
            <div key={z.windowId + z.region}
              className="flex items-center gap-3 rounded-lg border border-zinc-900
                         bg-zinc-900/30 px-3 py-2.5">
              <span className="w-10 shrink-0 rounded bg-zinc-900 py-1 text-center
                               text-xs font-bold tabular-nums text-sky-400">
                {z.werte.eliminations}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
                {turnierName(z.event)}
                <span className="ml-1.5 text-[10px] text-slate-600">{z.region}</span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                {zahl(Math.round(z.werte.damageDealt), 0, sprache)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Ein Pokal - fuer die Marke der FNCS-Siege. */
function Pokal({ groesse = 13 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h2a2 2 0 0 1 0 4h-2M7 5H5a2 2 0 0 0 0 4h2" />
    </svg>
  );
}

/** Ein Stern - fuer die Marke der Tagessiege. */
function Stern({ groesse = 11 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="currentColor"
      aria-hidden>
      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
    </svg>
  );
}

function VerlaufTabelle({ zeilen, fuss }: {
  zeilen: VerlaufZeile[];
  /** Die Zusammenfassung unter der Liste - dieselben Spalten. */
  fuss?: boolean;
}) {
  const { sprache, t } = useSprache();

  /**
   * Der Spieltag als kurzes Datum neben dem Turniernamen.
   *
   * "FNCS Grand Finals - Day 1" sagt nicht, aus welchem Jahr es stammt; in
   * der Liste eines Spielers stehen mehrere Saisons untereinander. Die Zahl
   * kommt aus Epics Bestenliste, aus der fruehesten Match-Endzeit des Tages.
   * Fehlt sie, steht dort nichts - lieber keine Angabe als eine geratene.
   */
  const kurzDatum = (t?: number) => (t
    ? new Date(t).toLocaleDateString(sprache === 'en' ? 'en-GB' : 'de-DE',
      { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null);

  const mats = (w: VerlaufZeile['werte']) =>
    (w.woodFarmed ?? 0) + (w.stoneFarmed ?? 0) + (w.metalFarmed ?? 0);
  const builds = (w: VerlaufZeile['werte']) =>
    (w.woodBuildsPlaced ?? 0) + (w.stoneBuildsPlaced ?? 0)
    + (w.metalBuildsPlaced ?? 0);
  const quote = (w: VerlaufZeile['werte']) =>
    w.damageTakenFromPlayers > 0 ? w.damageDealt / w.damageTakenFromPlayers : 0;

  const platzFarbe = (p: number | null) => (p === null ? 'text-slate-700'
    : p === 1 ? 'text-amber-400' : p <= 3 ? 'text-sky-400' : 'text-slate-300');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-[10px] uppercase
                         tracking-wider text-slate-500">
            <th className="px-2 py-2 text-left font-medium"><T>Turnier</T></th>
            <th className="px-2 py-2 text-center font-medium"><T>Region</T></th>
            <th className="px-2 py-2 text-center font-medium"><T>Platz</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Matches</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Elims</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Schaden</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Quote</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Material</T></th>
            <th className="px-2 py-2 text-right font-medium"><T>Bauteile</T></th>
            <th className="px-2 py-2 text-left font-medium"><T>Mitspieler</T></th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.windowId + z.region} className="border-b border-zinc-900">
              <td className="px-2 py-2 text-slate-300">
                {turnierName(z.event)}
                {kurzDatum(z.datum) && (
                  <span className="ml-2 whitespace-nowrap text-[10px] tabular-nums
                                   text-slate-600">
                    {kurzDatum(z.datum)}
                  </span>
                )}
                {/* Woher die Zeile stammt.
                    Ohne diese Marke stuenden in einer Zeile vier Striche und
                    niemand wuesste, ob der Spieler nichts erreicht hat oder
                    ob die Zahlen fehlen. */}
              </td>
              <td className="px-2 py-2 text-center">
                <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px]
                                 font-semibold tracking-wider text-slate-400">
                  {z.region}
                </span>
              </td>
              {/* Der Platz kommt aus Epics Bestenliste. Wo Epic das Fenster
                  nicht mehr vorhaelt, steht ein Strich statt einer Zahl. */}
              <td className={`px-2 py-2 text-center font-bold tabular-nums
                              ${platzFarbe(z.platz)}`}>
                {z.platz !== null ? `${z.platz}.` : '—'}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                {z.werte.matchesPlayed || '—'}
              </td>
              {/* Bei einer Epic-Zeile bleiben die Einzelwerte leer.
                  Epic kennt sie nicht: im selben Turnierfenster, das beide
                  Quellen fuehren, meldet Epic Schaden 0, wo die Quelle
                  3550,24 fuer denselben Spieler hat. Und die
                  Eliminierungen dort gelten fuers ganze Team. */}
              <td className="px-2 py-2 text-right font-semibold tabular-nums
                             text-sky-400">
                {/*
                  * Bei einer Epic-Zeile bleibt die Spalte leer - es sei
                  * denn, das eigene Replay hat die Eliminierungen gezaehlt.
                  * Dann steht die Zahl da, gepunktet unterstrichen, damit
                  * man sieht, dass sie aus einer anderen Quelle stammt als
                  * die Zahlen der Zeilen darueber.
                  */}
                {!z.nurEpic ? z.werte.eliminations
                  : typeof z.replayElims === 'number' ? (
                    <span
                      title={t('Aus dem eigenen Replay dieses Spieltags '
                        + 'gezählt — Epic gibt Eliminierungen nur je Team '
                        + 'heraus. Schaden, Material und Bauteile stehen im '
                        + 'Replay nicht.')}
                      className="cursor-help underline decoration-dotted
                                 underline-offset-2 decoration-sky-400/50">
                      {z.replayElims}
                    </span>
                  ) : <span className="text-slate-700">—</span>}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                {z.nurEpic ? <span className="text-slate-700">—</span>
                  : zahl(Math.round(z.werte.damageDealt), 0, sprache)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                {z.nurEpic ? <span className="text-slate-700">—</span>
                  : zahl(quote(z.werte), 2, sprache)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                {z.nurEpic || !mats(z.werte)
                  ? <span className="text-slate-700">—</span>
                  : zahl(mats(z.werte), 0, sprache)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                {z.nurEpic || !builds(z.werte)
                  ? <span className="text-slate-700">—</span>
                  : zahl(builds(z.werte), 0, sprache)}
              </td>
              <td className="px-2 py-2">
                {z.mitspieler.length ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {z.mitspieler.map((m) => (
                      <span key={m.epicId} className="flex items-center gap-1">
                        <TeamFlagge groesse={13} laender={[m.land ?? undefined]} />
                        <span className="text-[11px] text-slate-300">
                          {grossName(m.name)}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : <span className="text-slate-700">—</span>}
              </td>
            </tr>
          ))}
        </tbody>

        {/* Die Zusammenfassung.
            Der Durchschnittsplatz zaehlt nur die Zeilen mit, zu denen es
            wirklich einen Platz gibt - sonst zoege ein fehlendes Fenster den
            Schnitt nach unten, ohne dass jemand schlechter gespielt haette. */}
        {fuss && zeilen.length > 0 && (() => {
          /* Summiert wird nur ueber Zeilen, die wirklich Werte haben.
             Eine Epic-Zeile traegt lauter Nullen; sie mitzuzaehlen liesse
             den Schnitt sinken, ohne dass jemand schlechter gespielt hat.
             Platz und Matches sind dort echt und zaehlen mit. */
          const mitWerten = zeilen.filter((z) => !z.nurEpic);
          const n = (holen: (z: VerlaufZeile) => number) =>
            mitWerten.reduce((summe, z) => summe + holen(z), 0);
          const alleN = (holen: (z: VerlaufZeile) => number) =>
            zeilen.reduce((summe, z) => summe + holen(z), 0);
          const schaden = n((z) => z.werte.damageDealt);
          const erlitten = n((z) => z.werte.damageTakenFromPlayers);
          const mitPlatz = zeilen.filter((z) => z.platz !== null);
          const schnittPlatz = mitPlatz.length
            ? mitPlatz.reduce((sum, z) => sum + (z.platz ?? 0), 0) / mitPlatz.length
            : null;
          return (
            <tfoot>
              <tr className="border-t-2 border-zinc-700 bg-zinc-900/60
                             text-[11px] font-semibold">
                <td className="px-2 py-3 text-left uppercase tracking-[0.12em]
                               text-slate-400">
                  <T>Zusammenfassung</T>
                  <span className="ml-1.5 font-normal normal-case tracking-normal
                                   text-slate-600">
                    {zeilen.length}{' '}
                    <T>{zeilen.length === 1 ? 'Spieltag' : 'Spieltage'}</T>
                  </span>
                </td>
                <td />
                <td className="px-2 py-3 text-center tabular-nums text-slate-300">
                  {schnittPlatz !== null ? `Ø ${zahl(schnittPlatz, 1, sprache)}` : '—'}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                  {zahl(alleN((z) => z.werte.matchesPlayed), 0, sprache)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-sky-400">
                  {zahl(n((z) => z.werte.eliminations), 0, sprache)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                  {zahl(Math.round(schaden), 0, sprache)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                  {zahl(erlitten > 0 ? schaden / erlitten : 0, 2, sprache)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                  {zahl(n((z) => mats(z.werte)), 0, sprache)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                  {zahl(n((z) => builds(z.werte)), 0, sprache)}
                </td>
                <td />
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

/**
 * Ein Balken von null bis hundert.
 *
 * Die Zahl ist der Rang im Feld: wie viele Mitspieler liegen unter diesem
 * Spieler. Achtundneunzig heisst also, dass er achtundneunzig Prozent des
 * Feldes hinter sich laesst - keine erfundene Bewertung, sondern eine
 * Abzaehlung.
 */
function Balken({ wert, klein = false }: { wert: number; klein?: boolean }) {
  const farbe = wert >= 85 ? 'bg-sky-400' : wert >= 60 ? 'bg-sky-500/70' : 'bg-slate-600';
  return (
    <div className={`overflow-hidden rounded-full bg-zinc-800 ${klein ? 'h-1' : 'h-1.5'}`}>
      <div className={`h-full rounded-full ${farbe}`} style={{ width: `${wert}%` }} />
    </div>
  );
}

/**
 * Der Verlauf als Linie.
 *
 * Von Hand gezeichnetes SVG statt einer Diagrammbibliothek: es ist eine
 * Linie mit Punkten, dafuer lohnt keine Abhaengigkeit, und so passt sie sich
 * ohne Umwege der Farbe des Werkzeugs an.
 */
function Verlaufslinie({ werte, beschriftung, marken }: {
  werte: number[]; beschriftung: string;
  /** Woher der Punkt stammt - eine Beschriftung je Wert. */
  marken?: string[];
}) {
  const { sprache } = useSprache();
  const [zeigt, setZeigt] = useState<number | null>(null);
  if (werte.length < 2) return null;
  const B = 900, H = 190, rand = 28;
  const hoch = Math.max(...werte);
  const tief = Math.min(...werte);
  const spanne = hoch - tief || 1;
  const x = (i: number) => rand + (i / (werte.length - 1)) * (B - rand * 2);
  const y = (v: number) => H - rand - ((v - tief) / spanne) * (H - rand * 2);
  const stellen: Array<[number, number]> = werte.map((v, i) => [x(i), y(v)]);
  const bahn = rund(stellen);
  const flaeche = `${bahn} L ${B - rand} ${H - rand} L ${rand} ${H - rand} Z`;
  const schnitt = werte.reduce((a, b) => a + b, 0) / werte.length;

  /**
   * Wo der Kasten steht.
   *
   * Ueber dem Punkt, solange dort Platz ist. Liegt der Punkt im oberen
   * Drittel - und das tut der hoechste Wert immer -, klappt der Kasten nach
   * unten, sonst ragte er aus dem Bild heraus und war nicht zu lesen. Am
   * linken und rechten Rand rueckt er entsprechend nach innen.
   */
  const kasten = (i: number) => {
    const px = (x(i) / B) * 100;
    const py = (y(werte[i]) / H) * 100;
    const unten = py < 38;
    const waagerecht = px < 18 ? '0' : px > 82 ? '-100%' : '-50%';
    return {
      left: `${px}%`,
      top: `${py}%`,
      transform: `translate(${waagerecht}, ${unten ? '14px' : 'calc(-100% - 14px)'})`,
    };
  };

  return (
    /* overflow-visible, damit der Kasten nicht am Rand des Kastens
       abgeschnitten wird - der Rollbalken sitzt eine Ebene tiefer. */
    <div className="relative">
      {/* Woher der Punkt stammt.
          Genau die Frage, die man beim Ansehen einer Linie zuerst hat: welcher
          Spieltag war das? Der Kasten zeigt neben dem Wert auch den
          Durchschnitt, damit die Hoehe etwas bedeutet. */}
      {zeigt !== null && (
        <div className="pointer-events-none absolute z-20 whitespace-nowrap
                        rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2
                        shadow-xl"
          style={kasten(zeigt)}>
          {marken?.[zeigt] && (
            <p className="mb-1 text-[11px] font-semibold text-slate-200">
              {marken[zeigt]}
            </p>
          )}
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-sm bg-sky-400" />
            {beschriftung.replace(/ je Spieltag$/, '')}
            <span className="font-semibold tabular-nums text-slate-100">
              {werte[zeigt]}
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-sm bg-zinc-600" />
            <T>Durchschnitt</T>
            <span className="tabular-nums">{zahl(schnitt, 1, sprache)}</span>
          </p>
        </div>
      )}
      {/* Kein festes Hoehenmass: sonst behaelt das SVG sein Seitenverhaeltnis
          und steht als schmaler Streifen mitten im Kasten. So folgt die Hoehe
          der Breite und die Linie laeuft ueber die ganze Flaeche. */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${B} ${H}`} className="block h-auto w-full min-w-[420px]"
        role="img" aria-label={beschriftung}>
        <path d={flaeche} fill="currentColor" className="text-sky-500/10" />
        {/* Der Durchschnitt als gestrichelte Linie - erst dadurch sagt ein
            Punkt etwas aus. */}
        <line x1={rand} x2={B - rand} y1={y(schnitt)} y2={y(schnitt)}
          stroke="currentColor" strokeDasharray="4 4" strokeWidth="1"
          className="text-zinc-700" />
        <path d={bahn} fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" className="text-sky-400" />
        {werte.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={zeigt === i ? 5.5 : 3.5}
            className="fill-sky-400" />
        ))}
        {/* Unsichtbare Flaechen darueber: ein Punkt von dreieinhalb Einheiten
            ist mit der Maus kaum zu treffen. */}
        {werte.map((v, i) => (
          <circle key={`griff-${i}`} cx={x(i)} cy={y(v)} r="16" fill="transparent"
            onMouseEnter={() => setZeigt(i)} onMouseLeave={() => setZeigt(null)} />
        ))}
        <text x={rand} y={12} className="fill-slate-600" fontSize="10">{hoch}</text>
        <text x={rand} y={H - 6} className="fill-slate-600" fontSize="10">{tief}</text>
      </svg>
      </div>
    </div>
  );
}

/** Eine Bestenliste als Karte - Kopf, Pluszeichen, die besten fuenf. */
function ListenKarte({ liste, aufVoll, aufSpieler }: {
  liste: { titel: string; feld: keyof Spieler; nachkomma?: number; einheit?: string;
           zeilen: Spieler[] };
  aufVoll: () => void;
  aufSpieler: (s: Spieler) => void;
}) {
  const t = useT();
  const { sprache } = useSprache();
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
      <p className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/40
                    px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]
                    text-slate-400">
        <T>{liste.titel}</T>
        {liste.zeilen.length > 5 && (
          <button onClick={aufVoll}
            title={t('Alle {n} anzeigen').replace('{n}', String(liste.zeilen.length))}
            className="ml-auto rounded border border-zinc-700 px-1.5 text-[11px]
                       leading-4 text-slate-400 transition hover:border-sky-500
                       hover:text-sky-400">
            +
          </button>
        )}
      </p>
      <div className="divide-y divide-zinc-900">
        {liste.zeilen.slice(0, 5).map((sp, i) => (
          <Platz key={sp.epicId} nr={i + 1} s={sp}
            wert={zahl(Number(sp[liste.feld]), liste.nachkomma ?? 0, sprache) + (liste.einheit ?? '')}
            aufKlick={() => aufSpieler(sp)} />
        ))}
      </div>
    </div>
  );
}

/** Eine Zeile in einer Bestenliste. */
function Platz({ nr, s, wert, aufKlick }: {
  nr: number; s: Spieler; wert: string; aufKlick?: () => void;
}) {
  return (
    <button onClick={aufKlick} disabled={!aufKlick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition
                  ${aufKlick ? 'hover:bg-zinc-900/60' : ''}`}>
      <span className={`w-4 shrink-0 text-[11px] font-bold tabular-nums ${
        nr === 1 ? 'text-amber-400' : 'text-slate-600'}`}>{nr}</span>
      <TeamFlagge groesse={18} laender={[s.land ?? undefined]} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-200">
        {grossName(s.anzeige, s.gepflegt)}
      </span>
      <RegionMarke region={s.heimat || s.regionen[0] || ''} />
      <span className="shrink-0 text-[12px] font-bold tabular-nums text-sky-400">
        {wert}
      </span>
    </button>
  );
}

export default function StatistikSeite() {
  // Fuer Beschriftungen, die in einem Attribut stehen - dort hilft kein
  // eingewickelter Text. Die Sprache selbst wird fuer das Datum gebraucht.
  const { sprache, t } = useSprache();
  const [bereich, setBereich] = useState<Bereich>('start');
  const [saisons, setSaisons] = useState<Array<{ kennung: string; name: string }>>([]);
  const [regionen, setRegionen] = useState<string[]>([]);

  const [saison, setSaison] = useState('');
  const [region, setRegion] = useState('');
  const [sort, setSort] = useState('elims');
  const [suche, setSuche] = useState('');

  // Startansicht - mehrere Spieltage, die im Takt durchwechseln
  const [kacheln, setKacheln] = useState<Kachel[]>([]);
  const [kachelNr, setKachelNr] = useState(0);
  const [listen, setListen] = useState<Liste[]>([]);
  const [profile, setProfile] = useState<Profilgruppe[]>([]);
  const [profilNr, setProfilNr] = useState(0);
  const [duelle, setDuelle] = useState<Duell[]>([]);
  const [duellNr, setDuellNr] = useState(0);
  const [power, setPower] = useState<PowerZeile[]>([]);

  /* Der Vergleich: zwei selbst gewaehlte Spieler samt ihren Verlaeufen. */
  const [vglLinks, setVglLinks] = useState<Spieler | null>(null);
  const [vglRechts, setVglRechts] = useState<Spieler | null>(null);
  const [vglVerlaufLinks, setVglVerlaufLinks] = useState<VerlaufZeile[]>([]);
  const [vglVerlaufRechts, setVglVerlaufRechts] = useState<VerlaufZeile[]>([]);
  const [suchLinks, setSuchLinks] = useState('');
  const [suchRechts, setSuchRechts] = useState('');
  const [trefferLinks, setTrefferLinks] = useState<Spieler[]>([]);
  const [trefferRechts, setTrefferRechts] = useState<Spieler[]>([]);
  /** Filter ueber beiden Turnierlisten im Vergleich. */
  const [vglArt, setVglArt] = useState('Alle');
  const [vglWieViele, setVglWieViele] = useState<number>(5);
  /** Merker, wenn ein Gewaehlter in der Saison gar nicht angetreten ist. */
  const [vglLeer, setVglLeer] = useState<[boolean, boolean]>([false, false]);

  // Ob der Nutzer bearbeiten darf
  const [istAdmin, setIstAdmin] = useState(false);
  const zugang = useZugang();
  const [pflegeName, setPflegeName] = useState('');
  const [pflegeLand, setPflegeLand] = useState('');
  const [pflegeStand, setPflegeStand] = useState('');
  /** Sicherheitsfrage vor dem Ausblenden eines Spielers. */
  const [entfernenFrage, setEntfernenFrage] = useState(false);
  /** In der Turnierliste auch fremde Regionen zeigen? */
  const [alleRegionen, setAlleRegionen] = useState(false);

  // Spielerliste
  const [spieler, setSpieler] = useState<Spieler[]>([]);
  const [gesamt, setGesamt] = useState(0);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');

  // Turnierliste und Regionen
  const [turniere, setTurniere] = useState<Turnier[]>([]);

  /**
   * Finale, die gerade laufen oder eben zu Ende gingen.
   *
   * Warum es das braucht: die Einzelwerte hier stammen von eucompetitive,
   * und die veroeffentlicht sie erst ein bis zwei Tage nach einem Cup. Ein
   * Finale von gestern Abend fehlt deshalb in dieser Liste - fuer den
   * Betreiber sah es so aus, als haette ich es schlicht vergessen. Epic
   * selbst fuehrt das Fenster dagegen sofort. Beide Quellen
   * nebeneinandergelegt laesst sich sagen, was noch fehlt und warum, statt
   * es stillschweigend auszulassen.
   */
  const [laufende, setLaufende] = useState<Array<{
    titel: string; region: string; windowId: string; live: boolean;
  }>>([]);
  /*
   * Nur die grossen Finale - so ist es voreingestellt.
   *
   * Der Betreiber wollte hier Performance Cups, Division-1-Finale, FNCS
   * Grand Finals und EWC sehen und sonst nichts. Ein Schalter bleibt
   * trotzdem: die uebrigen Cups liegen im Archiv, sie stehen nur nicht im
   * Weg. Nichts wird verworfen, nur nicht angezeigt.
   */
  const [nurGrosse, setNurGrosse] = useState(true);
  // Regionenseite
  const [regionFeld, setRegionFeld] = useState<Spieler[]>([]);
  const [regionLaedt, setRegionLaedt] = useState(false);
  /** Je Turnierreihe der gewaehlte Spieltag - leer heisst: die ganze Reihe. */
  const [reihenWahl, setReihenWahl] = useState<Record<string, string>>({});
  const [reihenFeld, setReihenFeld] = useState<Record<string, Spieler[]>>({});

  // Ein einzelner Cup, aufgeschlagen
  const [cup, setCup] = useState<Turnier | null>(null);
  const [cupFeld, setCupFeld] = useState<Spieler[]>([]);
  /*
   * Wer im Aufmacher eines Cups steht.
   *
   * Vorher war das fest der Erste des Spieltags - "da ist nur Charyy
   * die ganze Zeit". Jetzt gehen die besten fuenf der Reihe nach durch,
   * im selben Zehn-Sekunden-Takt wie der Wechsel auf der Uebersicht.
   */
  const [cupNr, setCupNr] = useState(0);
  const [cupLaedt, setCupLaedt] = useState(false);
  /** Welche Kennzahl in voller Laenge offen ist. */
  const [volleListe, setVolleListe] = useState<{
    /** Der Kennzahlname - wird uebersetzt. */
    titel: string;
    /** Woher die Liste stammt (Saison oder Region) - bleibt, wie es ist. */
    zusatz?: string;
    zeilen: Spieler[];
    feld: keyof Spieler; nachkomma: number; einheit: string } | null>(null);
  const [listenTiefe, setListenTiefe] = useState(50);

  /** Karten oder Zeilen - wie im Vorbild umschaltbar. */
  const [tafel, setTafel] = useState(true);
  const [turnierSuche, setTurnierSuche] = useState('');

  // Die Galerie aller Spieler mit Foto
  const [galerie, setGalerie] = useState<Spieler[]>([]);
  const [galerieSuche, setGalerieSuche] = useState('');
  /** In der Bilderansicht: mit Foto, ohne Foto oder alle. */
  const [galerieFilter, setGalerieFilter] = useState<'mit' | 'ohne' | 'alle'>('mit');
  /** Wie viele Karten in der Bilderansicht gerade gezeigt werden. */
  const [galerieMenge, setGalerieMenge] = useState(400);

  /* Die Suche in der Kopfzeile - findet jeden Spieler im Archiv. */
  const [kopfSuche, setKopfSuche] = useState('');
  const [kopfTreffer, setKopfTreffer] = useState<Spieler[]>([]);
  const [kopfOffen, setKopfOffen] = useState(false);

  /**
   * Den Bereich wechseln und dabei aufraeumen.
   *
   * Beim Wechsel bleibt kein alter Suchtext stehen - sonst filtert die
   * Bilderansicht nach etwas, das man drei Klicks zuvor getippt hat.
   * Bewusst hier und nicht in einem Effekt: das Aufraeumen gehoert zu der
   * Handlung, die es ausloest, nicht zu einer Beobachtung hinterher.
   */
  const wechsleBereich = useCallback((w: Bereich) => {
    setBereich(w);
    setKopfSuche(''); setGalerieSuche(''); setKopfOffen(false);
  }, []);
  const [offen, setOffen] = useState<Spieler | null>(null);
  const [verlauf, setVerlauf] = useState<VerlaufZeile[]>([]);
  /** Laeuft gerade eine Abfrage fuer das offene Profil? */
  const [profilLaedt, setProfilLaedt] = useState(false);
  const [spielerReiter, setSpielerReiter] = useState<SpielerReiter>('uebersicht');
  const [perzentile, setPerzentile] = useState<Perzentile | null>(null);
  const [fncs, setFncs] = useState<Fncs | null>(null);
  const [tagesbest, setTagesbest] = useState<Tagessieg[]>([]);
  const [fncsSiege, setFncsSiege] = useState<FncsSieg[]>([]);
  const [rang, setRang] = useState<Rang | null>(null);
  /**
   * Welchen Zeitraum das offene Profil zeigt.
   *
   * Unabhaengig von der Auswahl der Seite: wer ein Profil oeffnet, will oft
   * die ganze Laufbahn sehen und nicht nur die laufende Saison. 'alle' steht
   * fuer das ganze Archiv.
   */
  const [profilSaison, setProfilSaison] = useState<string>('alle');
  const [saisonBilder, setSaisonBilder] = useState<Record<string, string | null>>({});
  const [saisonNamen, setSaisonNamen] = useState<Record<string, string>>({});
  /** Spieltage, zu denen nur Epic etwas hat - ohne Einzelwerte. */
  const [epicZeilen, setEpicZeilen] = useState<VerlaufZeile[]>([]);
  /** Welche Marke gerade aufgeklappt ist. */
  const [marke, setMarke] = useState<'fncs' | 'tage' | null>(null);

  /* -------------------------------------------------- Grunddaten einmalig */
  useEffect(() => {
    fetch('/api/szene-stats')
      .then((r) => r.json())
      .then((j) => {
        setSaisons(j.saisons ?? []);
        const regionen: string[] = nachRegionReihe(j.regionen ?? []);
        setRegionen(regionen);
        // Voreingestellt die Heimatregion statt "alle" - danach sucht er
        // ohnehin als Erstes, und die Liste ist damit gleich brauchbar.
        if (regionen.length) setRegion(regionen.includes('EU') ? 'EU' : regionen[0]);
        if (j.saisons?.length) setSaison(j.saisons[0].kennung);
      })
      .catch(() => setFehler(t('Archiv nicht lesbar')));

    fetch('/api/auth/check-admin', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setIstAdmin(j?.isAdmin === true))
      .catch(() => setIstAdmin(false));
  }, []);

  /* ----------------------------------------------------------- Startseite */
  useEffect(() => {
    if (!saison) return;
    fetch(`/api/szene-stats?ansicht=start&saison=${saison}`)
      .then((r) => r.json())
      .then((j) => {
        setKacheln(j.kacheln ?? []);
        setKachelNr(0);
        setListen(j.listen ?? []);
        setProfile(j.profile ?? []);
        setDuelle(j.duelle ?? []);
        setProfilNr(0); setDuellNr(0);
      })
      .catch(() => {});
  }, [saison]);

  /**
   * Der Wechsel im Kopf.
   *
   * Alle zehn Sekunden ein anderer Spieltag mit einem anderen Spieler - so
   * bleibt die Seite in Bewegung und man sieht mehr als immer denselben
   * Namen. Gezeigt wird nur, wozu es auch Zahlen gibt.
   */
  useEffect(() => {
    if (kacheln.length < 2 || bereich !== 'start') return;
    const uhr = window.setInterval(
      () => setKachelNr((n) => (n + 1) % kacheln.length), 10_000);
    return () => window.clearInterval(uhr);
  }, [kacheln.length, bereich]);

  /* Die Profilkarten wandern regionweise weiter, die Duelle einzeln - beide
     im selben Zehn-Sekunden-Takt wie der Aufmacher. */
  useEffect(() => {
    if (profile.length < 2 || bereich !== 'start') return;
    const t = setInterval(
      () => setProfilNr((n) => (n + 1) % profile.length), 10_000);
    return () => clearInterval(t);
  }, [profile.length, bereich]);

  useEffect(() => {
    if (duelle.length < 2 || bereich !== 'start') return;
    const t = setInterval(
      () => setDuellNr((n) => (n + 1) % duelle.length), 10_000);
    return () => clearInterval(t);
  }, [duelle.length, bereich]);

  /* Und derselbe Takt fuer den Aufmacher einer Cup-Seite. */
  const cupWechsel = Math.min(5, cupFeld.length);
  useEffect(() => {
    if (cupWechsel < 2 || bereich !== 'turniere') return;
    const t = setInterval(
      () => setCupNr((n) => (n + 1) % cupWechsel), 10_000);
    return () => clearInterval(t);
  }, [cupWechsel, bereich]);

  /* Ein anderer Cup faengt wieder beim Besten an. */
  const cupKennung = cup?.windowId ?? '';
  useEffect(() => { setCupNr(0); }, [cupKennung]);

  /* Die Power Rankings fuehrt das Werkzeug schon - hier stehen die besten
     zehn, alles Weitere auf der eigenen Seite. */
  useEffect(() => {
    if (bereich !== 'start' || power.length) return;
    fetch('/api/power-rankings?page=1&pageSize=15')
      .then((r) => r.json())
      .then((j) => setPower(j.players ?? []))
      .catch(() => setPower([]));
  }, [bereich, power.length]);

  /* -------------------------------------------------------- Spielerliste */
  const holeSpieler = useCallback(async () => {
    if (!saison) return;
    setLaedt(true); setFehler('');
    try {
      const p = new URLSearchParams({ saison, sort, limit: '300' });
      if (region) p.set('region', region);
      if (suche.trim()) p.set('q', suche.trim());
      const j = await (await fetch(`/api/szene-stats?${p}`)).json();
      if (!j.success) throw new Error(j.error ?? 'nicht ladbar');
      setSpieler(j.spieler ?? []);
      setGesamt(j.gesamt ?? 0);
    } catch (e) {
      setFehler((e as Error).message); setSpieler([]);
    } finally { setLaedt(false); }
  }, [saison, region, sort, suche]);

  useEffect(() => {
    if (bereich !== 'spieler') return;
    const uhr = window.setTimeout(holeSpieler, suche ? 300 : 0);
    return () => window.clearTimeout(uhr);
  }, [bereich, holeSpieler, suche]);

  /**
   * Die Suche in der Kopfzeile.
   *
   * Kurz abgewartet, statt bei jedem Tastendruck zu fragen: wer "peterbot"
   * tippt, loeste sonst neun Abfragen aus, von denen acht schon veraltet
   * sind, bevor die Antwort da ist.
   */
  useEffect(() => {
    const q = kopfSuche.trim();
    let weg = false;
    // Auch das Leeren laeuft ueber den Zeitgeber, nicht sofort im Rumpf des
    // Effekts: so gibt es nur einen Weg, auf dem sich die Trefferliste
    // aendert, und React bekommt keine Zustandsaenderung mitten im Zeichnen.
    const t = setTimeout(async () => {
      if (q.length < 2) { if (!weg) setKopfTreffer([]); return; }
      try {
        const r = await fetch(`/api/szene-stats?ansicht=suche`
          + `&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!weg) setKopfTreffer(j.spieler ?? []);
      } catch { if (!weg) setKopfTreffer([]); }
    }, 250);
    return () => { weg = true; clearTimeout(t); };
  }, [kopfSuche]);

  /* ----------------------------------------------------------- Vergleich */

  /**
   * Die Suche im Vergleich.
   *
   * Gesucht wird in der oben gewaehlten Saison - dieselbe Auswahl, aus der
   * auch die Zahlen stammen. Wer in dieser Saison nicht angetreten ist,
   * taucht nicht auf; dafuer meint jede Zahl dasselbe.
   */
  const suchen = useCallback(async (text: string, wohin: (t: Spieler[]) => void) => {
    const q = text.trim();
    if (q.length < 2) { wohin([]); return; }
    try {
      const r = await fetch(`/api/szene-stats?saison=${saison}`
        + `&q=${encodeURIComponent(q)}&limit=8`);
      const j = await r.json();
      wohin(j.spieler ?? []);
    } catch { wohin([]); }
  }, [saison]);

  /** Zu einem gewaehlten Spieler den Verlauf nachladen. */
  const vglLaden = useCallback(async (sp: Spieler,
    wohin: (z: VerlaufZeile[]) => void) => {
    try {
      const r = await fetch(`/api/szene-stats?spieler=${sp.epicId}&saison=${saison}`);
      const j = await r.json();
      wohin(j.verlauf ?? []);
    } catch { wohin([]); }
  }, [saison]);

  /**
   * Die Saison umschalten nimmt den Vergleich mit.
   *
   * Vorher blieben die Zahlen der beiden stehen, waehrend oben eine andere
   * Saison gewaehlt war - die Ueberschrift log dann. Jetzt werden beide
   * Seiten neu geholt, sobald sich die Saison aendert.
   *
   * Wer in der neuen Saison gar nicht angetreten ist, bleibt gewaehlt; statt
   * seiner alten Zahlen steht dann ein Hinweis. Ihn stillschweigend
   * hinauszuwerfen waere aergerlich, seine alten Zahlen stehen zu lassen
   * waere falsch.
   */
  useEffect(() => {
    let weg = false;
    const holen = async (
      sp: Spieler | null,
      setzeWer: (s: Spieler | null) => void,
      setzeVerlauf: (z: VerlaufZeile[]) => void,
      seite: 0 | 1,
    ) => {
      if (!sp) return;
      try {
        const r = await fetch(`/api/szene-stats?spieler=${sp.epicId}`
          + `&saison=${saison}`);
        const j = await r.json();
        if (weg) return;
        setzeVerlauf(j.verlauf ?? []);
        if (j.spieler) {
          setzeWer({ ...sp, ...j.spieler });
          setVglLeer((alt) => (seite === 0
            ? [false, alt[1]] : [alt[0], false]));
        } else {
          setVglLeer((alt) => (seite === 0 ? [true, alt[1]] : [alt[0], true]));
        }
      } catch { /* der alte Stand bleibt stehen */ }
    };
    void holen(vglLinks, setVglLinks, setVglVerlaufLinks, 0);
    void holen(vglRechts, setVglRechts, setVglVerlaufRechts, 1);
    return () => { weg = true; };
    // Bewusst nur an der Saison haengend: die beiden Spieler stehen hier
    // schon, und sie in die Abhaengigkeiten zu nehmen liesse den Effekt nach
    // jedem eigenen Setzen erneut laufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saison]);

  /* ------------------------------------------------------------- Galerie */
  useEffect(() => {
    if (bereich !== 'bilder' || !istAdmin || galerie.length) return;
    fetch('/api/szene-stats?ansicht=bilder')
      .then((r) => r.json())
      .then((j) => setGalerie(j.spieler ?? []))
      .catch(() => setGalerie([]));
  }, [bereich, istAdmin, galerie.length]);

  /* ------------------------------------------------------------ Turniere */
  useEffect(() => {
    if (bereich !== 'turniere' || !saison) return;
    fetch('/api/szene-stats')
      .then((r) => r.json())
      .then(() => fetch(`/api/szene-stats?ansicht=turniere&saison=${saison}`
        + (nurGrosse ? '' : '&alle=1')))
      .then((r) => r.json())
      .then((j) => setTurniere(j.turniere ?? []))
      .catch(() => setTurniere([]));
  }, [bereich, saison, nurGrosse]);

  /*
   * Was Epic schon fuehrt, die Szene-Quelle aber noch nicht.
   *
   * Nur Finale, und nur die der letzten drei Tage - was laenger her ist und
   * immer noch fehlt, ist kein Ladeproblem mehr, sondern eine Luecke, und
   * die gehoert nicht als "kommt gleich" ausgegeben.
   */
  useEffect(() => {
    if (bereich !== 'turniere') return;
    let weg = false;
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const drei = Date.now() - 3 * 24 * 3600 * 1000;
        const raus: Array<{ titel: string; region: string; windowId: string; live: boolean }> = [];
        for (const c of (j.cups ?? [])) {
          for (const [region, fenster] of Object.entries(c.regionen ?? {})) {
            for (const f of (fenster as Array<Record<string, unknown>>)) {
              /*
               * "istFinale" allein genuegt nicht: beim Performance
               * Evaluation Cup steht es auf false, obwohl die zweite Runde
               * das Finale ist - die Eventseite nennt sie auch so. Ohne
               * diesen Zusatz fiel genau der Cup durch, um den es ging.
               */
              const finalrunde = f.istFinale
                || /round2/i.test(String(f.windowId ?? ''));
              if (!finalrunde || f.status === 'kommt') continue;
              const begin = Number(f.begin ?? 0);
              if (begin < drei) continue;
              raus.push({
                titel: String(c.titel ?? ''), region,
                windowId: String(f.windowId ?? ''),
                live: f.status === 'laeuft' || f.status === 'live',
              });
            }
          }
        }
        setLaufende(raus);
      })
      .catch(() => { if (!weg) setLaufende([]); });
    return () => { weg = true; };
  }, [bereich]);

  /* ------------------------------------------------------------ Regionen */

  /** Die gewaehlte Region - ohne Wahl die erste mit Daten. */
  const regionAktiv = region || regionen[0] || '';

  useEffect(() => {
    if (bereich !== 'regional' || !saison || !regionAktiv) return;
    let weg = false;
    setRegionLaedt(true);
    setReihenWahl({}); setReihenFeld({});
    fetch(`/api/szene-stats?saison=${saison}&region=${regionAktiv}&sort=elims&limit=500`)
      .then((r) => r.json())
      .then((j) => { if (!weg) setRegionFeld(j.spieler ?? []); })
      .catch(() => { if (!weg) setRegionFeld([]); })
      .finally(() => { if (!weg) setRegionLaedt(false); });
    return () => { weg = true; };
  }, [bereich, saison, regionAktiv]);

  /** Die Turnierreihen dieser Region, aus den Spieltagen gebuendelt. */
  const reihen = useMemo(() => {
    const gruppen = new Map<string, Turnier[]>();
    for (const t of turniere) {
      if (t.region !== regionAktiv) continue;
      const r = reiheVon(t.name);
      (gruppen.get(r) ?? gruppen.set(r, []).get(r)!).push(t);
    }
    return [...gruppen.entries()]
      .map(([name, tage]) => ({
        name, tage: tage.sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0)),
      }))
      .sort((a, b) => b.tage.length - a.tage.length);
  }, [turniere, regionAktiv]);

  /** Das Turnierverzeichnis auch fuer die Regionenseite holen. */
  useEffect(() => {
    if (bereich !== 'regional' || !saison) return;
    fetch(`/api/szene-stats?ansicht=turniere&saison=${saison}`
        + (nurGrosse ? '' : '&alle=1'))
      .then((r) => r.json())
      .then((j) => setTurniere(j.turniere ?? []))
      .catch(() => {});
  }, [bereich, saison, nurGrosse]);

  /** Eine Reihe (oder einen ihrer Spieltage) nachladen. */
  const ladeReihe = useCallback(async (name: string, tage: Turnier[], wahl: string) => {
    const p = new URLSearchParams({ saison, region: regionAktiv, sort: 'elims', limit: '500' });
    if (wahl) p.set('event', wahl);
    else p.set('events', tage.map((t) => t.windowId).join(','));
    try {
      const j = await (await fetch(`/api/szene-stats?${p}`)).json();
      setReihenFeld((alt) => ({ ...alt, [name]: j.spieler ?? [] }));
    } catch {
      setReihenFeld((alt) => ({ ...alt, [name]: [] }));
    }
  }, [saison, regionAktiv]);

  // Beim Aufschlagen jede Reihe einmal als Ganzes laden.
  useEffect(() => {
    if (bereich !== 'regional') return;
    for (const r of reihen) {
      if (!reihenFeld[r.name]) void ladeReihe(r.name, r.tage, '');
    }
    // reihenFeld absichtlich nicht in den Abhaengigkeiten: sonst liefe der
    // Effekt nach jedem Nachladen erneut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bereich, reihen, ladeReihe]);

  /** Aus einem Feld die zwoelf Bestenlisten rechnen. */
  const listenAus = useCallback((feld: Spieler[]) => CUP_LISTEN.map((k) => {
    const zeilen = feld
      .filter((sp) => Number(sp[k.feld]) > 0)
      .sort((a, b) => (k.kleinBesser
        ? Number(a[k.feld]) - Number(b[k.feld])
        : Number(b[k.feld]) - Number(a[k.feld])));
    return { ...k, zeilen };
  }).filter((l) => l.zeilen.length), []);

  /**
   * Das Feld eines einzelnen Spieltags.
   *
   * Eine einzige Abfrage genuegt: sie liefert jeden Teilnehmer mit allen
   * Werten dieses Tages. Die zwoelf Bestenlisten entstehen daraus im Browser,
   * statt zwoelfmal dasselbe zu holen.
   */
  useEffect(() => {
    if (!cup) { setCupFeld([]); return; }
    let weg = false;
    setCupLaedt(true);
    const p = new URLSearchParams({
      saison: cup.season, region: cup.region, event: cup.windowId,
      sort: 'elims', limit: '500',
    });
    fetch(`/api/szene-stats?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!weg) setCupFeld(j.spieler ?? []); })
      .catch(() => { if (!weg) setCupFeld([]); })
      .finally(() => { if (!weg) setCupLaedt(false); });
    return () => { weg = true; };
  }, [cup]);

  /** Die Bestenlisten dieses Spieltags, aus dem geladenen Feld gerechnet. */
  const cupListen = useMemo(() => CUP_LISTEN.map((k) => {
    const zeilen = cupFeld
      .filter((sp) => Number(sp[k.feld]) > 0)
      .sort((a, b) => (k.kleinBesser
        ? Number(a[k.feld]) - Number(b[k.feld])
        : Number(b[k.feld]) - Number(a[k.feld])));
    return { ...k, zeilen };
  }).filter((l) => l.zeilen.length), [cupFeld]);

  /* -------------------------------------------------------- Spielerkarte */
  /**
   * Die Werte eines Profils fuer einen Zeitraum holen.
   *
   * Getrennt vom Oeffnen, weil derselbe Aufruf auch gebraucht wird, wenn im
   * Profil die Saison umgeschaltet wird - dann bleibt das Fenster offen und
   * nur die Zahlen wechseln.
   */
  const profilLaden = useCallback(async (s: Spieler, zeitraum: string) => {
    setProfilLaedt(true);
    setVerlauf([]); setEpicZeilen([]);
    setPerzentile(null); setFncs(null); setTagesbest([]); setFncsSiege([]);
    setRang(null);

    // Aus der Galerie kommt nur das Noetigste - Name, Flagge, Bild. Die
    // Werte und der Verlauf werden hier nachgeholt und daruebergelegt, damit
    // die Karte in beiden Faellen dasselbe zeigt.
    const p = new URLSearchParams({ spieler: s.epicId });
    if (zeitraum !== 'alle') p.set('saison', zeitraum);
    try {
      const j = await (await fetch(`/api/szene-stats?${p}`)).json();
      setVerlauf(j.verlauf ?? []);
      setPerzentile(j.perzentile ?? null);
      setFncs(j.fncs ?? null);
      setTagesbest(j.tagesbest ?? []);
      setFncsSiege(j.fncsSiege ?? []);
      setRang(j.rang ?? null);
      setSaisonBilder(j.saisonBilder ?? {});
      setSaisonNamen(j.saisonNamen ?? {});
      /* Aus Epics Bestenliste wird eine Zeile derselben Form - mit einer
         Marke, an der die Tabelle erkennt, dass die Werte fehlen muessen.
         Die Matchzahl ist keine Schaetzung: bei Duos und Trios spielen alle
         Mitglieder dieselben Matches. */
      setEpicZeilen((j.epicZeilen ?? []).map((z: {
        titel: string; windowId: string; region: string; season: string;
        datum: number | null; platz: number; punkte: number; matches: number;
        mitspieler: Mitspieler[];
        replayElims?: number;
      }) => ({
        event: z.titel || z.windowId,
        windowId: z.windowId, region: z.region, season: z.season,
        datum: z.datum ?? undefined,
        werte: {
          eliminations: 0, damageDealt: 0, damageTakenFromPlayers: 0,
          headshots: 0, hitsToPlayers: 0, shots: 0, assists: 0,
          matchesPlayed: z.matches, timeAlive: 0,
        },
        platz: z.platz, punkte: z.punkte, mitspieler: z.mitspieler,
        nurEpic: true,
        replayElims: z.replayElims,
      })));
      // Wer im gewaehlten Zeitraum nicht angetreten ist, bekommt Nullen -
      // nicht die Zahlen des vorigen Zeitraums. Sonst stand im Kopf "0
      // Spieltage" und daneben trotzdem 737 Matches, und das war schlicht
      // falsch.
      setOffen((alt) => {
        if (alt?.epicId !== s.epicId) return alt;
        if (j.spieler) {
          return { ...j.spieler, ...alt, ...j.spieler,
            bild: alt.bild ?? j.spieler.bild };
        }
        const leer: Record<string, number> = {};
        for (const feld of ['events', 'matches', 'elims', 'assists', 'reboots',
          'shots', 'hits', 'headshots', 'damage', 'damageTaken', 'heals',
          'stormDamage', 'fallDamage', 'mats', 'builds', 'distanz',
          'timeInStorm', 'timeAlive', 'quote', 'genauigkeit', 'elimsProMatch',
          'damageProMatch']) leer[feld] = 0;
        return { ...alt, ...leer } as Spieler;
      });
    } catch {
      setVerlauf([]); setPerzentile(null); setFncs(null); setTagesbest([]);
      setFncsSiege([]); setRang(null);
      setSaisonBilder({}); setSaisonNamen({});
    } finally {
      setProfilLaedt(false);
    }
  }, []);

  const oeffne = useCallback((s: Spieler) => {
    setOffen(s);
    setPflegeName(s.anzeige); setPflegeLand(s.land ?? ''); setPflegeStand('');
    setSpielerReiter('uebersicht');
    setMarke(null); setEntfernenFrage(false); setAlleRegionen(false);
    // Ein frisch geoeffnetes Profil zeigt die ganze Laufbahn - das ist die
    // Frage, die man beim Aufschlagen eines Profils zuerst hat.
    setProfilSaison('alle');
    void profilLaden(s, 'alle');
  }, [profilLaden]);

  /*
   * Der geoeffnete Spieler steht in der Adresse.
   *
   * Vorher war ein Profil ein reiner Bildschirmzustand: wer die Seite neu
   * lud, landete wieder ganz oben in der Liste, und ein Profil liess sich
   * niemandem schicken. Der Betreiber dazu: "Wenn ich die Seite neu lade,
   * bin ich nicht mehr auf diesem Statistik-Tool."
   *
   * Deshalb wandert der Name in die Adresse - lesbar, nicht als Konto-Id:
   * "/statistiken?spieler=MrSavage" sagt einem Menschen, worauf er klickt,
   * und laesst sich weitergeben. Geschrieben wird mit replaceState, nicht
   * mit push: sonst entstuende fuer jedes angesehene Profil ein eigener
   * Schritt im Verlauf, und der Zurueck-Knopf braeuchte zehn Klicks, um die
   * Seite zu verlassen.
   */
  /*
   * Hat der Tiefenlink schon seine Chance gehabt?
   *
   * Der Merker steht hier oben, weil er beide Effekte betrifft. Ohne ihn
   * lief es so: der Adress-Effekt kam als erster dran, sah "kein Profil
   * offen" und loeschte ?spieler=PXMP aus der Adresse - eine Wimper, bevor
   * der Effekt darunter sie lesen konnte. Neu laden landete deshalb immer
   * wieder in der Liste, obwohl beide Haelften fuer sich richtig waren.
   */
  const ausAdresseGeholt = useRef(false);

  /*
   * Das Profil zumachen.
   *
   * Ueber den Verlauf, wenn es ueber den Verlauf aufgegangen ist: sonst
   * bliebe der Schritt stehen, und ein Druck auf Zurueck oeffnete es gleich
   * wieder. Wer direkt mit einem Link hereinkam, hat keinen Schritt hinter
   * sich - dann wird schlicht geschlossen.
   */
  const profilSchliessen = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.spieler) {
      window.history.back();
      return;
    }
    setOffen(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Solange der Tiefenlink noch nicht dran war, wird nichts geschrieben.
    if (!ausAdresseGeholt.current) return;

    const p = new URLSearchParams(window.location.search);
    const ist = p.get('spieler');
    const soll = offen ? (offen.anzeige || offen.name) : null;
    if ((soll ?? null) === (ist ?? null)) return;
    if (soll) p.set('spieler', soll); else p.delete('spieler');
    const rest = p.toString();
    const adresse = window.location.pathname + (rest ? `?${rest}` : '');

    /*
     * Ein Profil zu oeffnen ist ein Schritt, den man zurueckgehen kann.
     *
     * Deshalb push statt replace, sobald eines aufgeht: der Zurueck-Knopf
     * schliesst es dann wieder, statt die ganze Seite zu verlassen. Beim
     * Wechsel von einem Profil zum naechsten und beim Schliessen wird
     * ersetzt - sonst saeumten zehn angesehene Spieler den Weg zurueck.
     */
    if (!ist && soll) window.history.pushState({ spieler: soll }, '', adresse);
    else window.history.replaceState(null, '', adresse);
  }, [offen]);

  /*
   * Der Zurueck-Knopf schliesst das Profil.
   *
   * Ohne das fuehrte er aus der Statistik heraus, obwohl auf dem Schirm nur
   * ein Fenster darueber lag - und genau das erwartet niemand.
   */
  useEffect(() => {
    const zurueck = () => {
      const gesucht = new URLSearchParams(window.location.search).get('spieler');
      if (!gesucht) { setOffen(null); return; }
      const treffer = spieler.find((x) =>
        x.epicId === gesucht || (x.anzeige || x.name) === gesucht);
      if (treffer) oeffne(treffer);
    };
    window.addEventListener('popstate', zurueck);
    return () => window.removeEventListener('popstate', zurueck);
  }, [spieler, oeffne]);

  /*
   * Und zurueck: beim Aufruf mit ?spieler=... dieses Profil oeffnen.
   *
   * Zuerst in der geladenen Liste nachsehen - meistens steht er dort. Wenn
   * nicht, wird gezielt danach gesucht: die Liste zeigt nur die ersten
   * dreihundert eines Zeitraums, und ein weitergegebener Link soll auch
   * dann aufgehen, wenn der Betreffende gerade nicht darunter ist.
   */
  useEffect(() => {
    if (ausAdresseGeholt.current || typeof window === 'undefined') return;
    const gesucht = new URLSearchParams(window.location.search).get('spieler');
    if (!gesucht) { ausAdresseGeholt.current = true; return; }
    ausAdresseGeholt.current = true;

    /*
     * Nicht auf die Liste warten, sondern gezielt suchen.
     *
     * Die Spielerliste wird erst geladen, wenn der Reiter "Players" offen
     * ist - auf der Startansicht bleibt sie leer. Wer den Effekt darauf
     * warten liess, wartete ewig: neu laden landete deshalb immer wieder in
     * der Uebersicht, obwohl die Adresse stimmte.
     *
     * Der Reiter wird gleich mit umgestellt: hinter dem Profil soll die
     * Liste liegen, aus der es kommt, nicht die Startansicht.
     */
    setBereich('spieler');

    const schluessel = (x: string) => String(x).trim().toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const gesuchtK = schluessel(gesucht);
    const passt = (x: Spieler) => x.epicId === gesucht
      || schluessel(x.anzeige || '') === gesuchtK
      || schluessel(x.name || '') === gesuchtK;

    void (async () => {
      let treffer = spieler.find(passt);
      if (!treffer) {
        /*
         * Ueber die Suche, nicht ueber die Bestenliste.
         *
         * Die Bestenliste filtert mit "q" den rohen Epic-Namen. Bei einem
         * gepflegten Anzeigenamen ist das ein anderer: PXMP heisst dort
         * "еlite рxmp", und die Suche nach "PXMP" ging ins Leere. Die
         * Suchansicht kennt beide Namen und liefert dieselben Felder.
         */
        try {
          const j = await (await fetch(
            `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(gesucht)}`)).json();
          const liste: Spieler[] = j.spieler ?? [];
          treffer = liste.find(passt) ?? liste[0];
        } catch { /* dann bleibt es bei der Liste */ }
      }
      if (treffer) oeffne(treffer);
    })();
  }, [spieler, oeffne]);

  /** Im offenen Profil den Zeitraum wechseln. */
  const profilZeitraum = useCallback((zeitraum: string) => {
    setProfilSaison(zeitraum);
    if (offen) void profilLaden(offen, zeitraum);
  }, [offen, profilLaden]);

  /**
   * Namen und Flagge eines Spielers festhalten.
   *
   * Geschrieben wird ins gemeinsame Spielerprofil, unter der Konto-Id. Damit
   * gilt die Aenderung ueberall - im Leaderboard, auf den Turnierkarten, in
   * den Beitraegen - und sie bleibt, auch wenn der Spieler beim naechsten
   * Turnier wieder anders heisst.
   */
  const pflegeSpeichern = useCallback(async () => {
    if (!offen) return;
    setPflegeStand('speichert …');
    try {
      const r = await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: offen.epicId,
          name: offen.name,
          anzeige: pflegeName.trim(),
          land: pflegeLand.trim().toUpperCase(),
          x: offen.x ?? '',
        }),
      });
      if (!r.ok) throw new Error(t('fehlgeschlagen'));
      const j = await r.json();
      const neu = {
        ...offen,
        anzeige: j.profile?.anzeige || j.profile?.name || offen.anzeige,
        land: j.profile?.land ?? null,
      };
      setOffen(neu);
      // Auch in den offenen Listen sofort nachziehen, damit man die Wirkung
      // sieht, ohne die Seite neu zu laden.
      const ersetzen = (x: Spieler) => (x.epicId === neu.epicId ? { ...x, ...neu } : x);
      setSpieler((alt) => alt.map(ersetzen));
      setKacheln((alt) => alt.map((k) => ({ ...k, spitze: ersetzen(k.spitze) })));
      setListen((alt) => alt.map((l) => ({ ...l, plaetze: l.plaetze.map(ersetzen) })));
      setGalerie((alt) => alt.map(ersetzen));
      setProfile((alt) => alt.map((g) => ({ ...g, spieler: g.spieler.map(ersetzen) })));
      setDuelle((alt) => alt.map((d) => ({
        links: ersetzen(d.links), rechts: ersetzen(d.rechts) })));
      setVglLinks((alt) => (alt ? ersetzen(alt) : alt));
      setVglRechts((alt) => (alt ? ersetzen(alt) : alt));
      setPflegeStand(t('gespeichert'));
    } catch {
      setPflegeStand(t('nicht gespeichert'));
    }
  }, [offen, pflegeName, pflegeLand]);

  /**
   * Einen Spieler aus der Oberflaeche nehmen.
   *
   * Seine Werte im Archiv bleiben unangetastet - er verschwindet nur aus
   * Listen, Suche und Bilderansicht. Ruecknehmen laesst sich das jederzeit
   * ueber data/spieler-versteckt.json.
   */
  const spielerVerstecken = useCallback(async () => {
    if (!offen) return;
    setPflegeStand('speichert …');
    try {
      const r = await fetch('/api/spieler-verstecken', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: offen.epicId, name: offen.anzeige }),
      });
      if (!r.ok) throw new Error('abgelehnt');
      // Aus allen offenen Listen sofort herausnehmen, damit man die Wirkung
      // sieht, ohne die Seite neu zu laden.
      const weg = (x: Spieler) => x.epicId !== offen.epicId;
      setSpieler((alt) => alt.filter(weg));
      setGalerie((alt) => alt.filter(weg));
      setListen((alt) => alt.map((l) => ({ ...l, plaetze: l.plaetze.filter(weg) })));
      setProfile((alt) => alt.map((g) => ({ ...g, spieler: g.spieler.filter(weg) })));
      setEntfernenFrage(false);
      setOffen(null);
    } catch {
      setPflegeStand(t('nicht gespeichert'));
    }
  }, [offen]);

  const gezeigteSpieler = spieler;

  /** Wie die gewaehlte Saison heisst - "CH7 S3" statt "S41". */
  /**
   * Wie der ganze Zeitraum heisst.
   *
   * Wo ueber alle Spieltage gerechnet wird, soll nicht "alle" stehen, sondern
   * welche Saisons das sind - die Liste kommt aus dem Archiv selbst, damit die
   * Angabe mitwaechst, sobald eine Saison dazukommt.
   */
  const archivTitel = useMemo(() => {
    if (!saisons.length) return t('alle erfassten Spieltage');
    const namen = [...saisons].map((x) => x.name);
    const erste = namen[namen.length - 1], letzte = namen[0];
    return erste === letzte ? erste : `${erste} ${t('bis')} ${letzte}`;
  }, [saisons, t]);

  const saisonTitel = useMemo(
    () => saisons.find((x) => x.kennung === saison)?.name ?? saison,
    [saisons, saison]);

  /* ------------------------------------------------ Region im Profil */

  /**
   * Die Heimatregion des offenen Spielers.
   *
   * Sie steht im Abzug und ist ueber das ganze Archiv ausgezaehlt: es gilt
   * die Region, in der das Konto am haeufigsten angetreten ist. Ein Europaeer
   * bleibt damit Europaeer, auch wenn er zweimal in NAC gespielt hat.
   */
  const heimatRegion = offen?.heimat || offen?.regionen?.[0] || '';

  /**
   * Der Verlauf, auf die Heimatregion beschraenkt.
   *
   * Warum ueberhaupt: Wenn Vico einmal mit Scoll in NAC antritt, ist das ein
   * Ausreisser und kein Teil seiner Form. In "Die letzten drei Turniere"
   * verdraengt so ein Ausflug sonst einen echten EU-Spieltag, und wer die
   * drei Zeilen ueberfliegt, liest die falsche Region als seine.
   *
   * Unter "Turniere" liegt der Fall anders - dort will man die ganze
   * Laufbahn sehen, deshalb laesst sich das dort aufklappen.
   */
  const verlaufHeimat = useMemo(
    () => (heimatRegion ? verlauf.filter((z) => z.region === heimatRegion) : verlauf),
    [verlauf, heimatRegion]);

  /**
   * Die drei juengsten Turniere der Heimatregion.
   *
   * Auch die, zu denen bisher nur Epic etwas hat. Sonst stuende hier ein
   * Spieltag von vorletzter Woche, waehrend der Cup von gestern schon
   * gelaufen und gewertet ist - das Profil sieht dann veraltet aus, obwohl
   * Platz und Mitspieler feststehen.
   */
  const letzteDrei = useMemo(() => {
    const heimatEpic = heimatRegion
      ? epicZeilen.filter((z) => z.region === heimatRegion) : epicZeilen;
    return [...verlaufHeimat, ...heimatEpic]
      .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0))
      .slice(0, 3);
  }, [verlaufHeimat, epicZeilen, heimatRegion]);

  /** Wie viele Spieltage ausserhalb der Heimat liegen - fuer den Knopf. */
  const fremdeSpieltage = (verlauf.length - verlaufHeimat.length)
    + epicZeilen.filter((z) => heimatRegion && z.region !== heimatRegion).length;

  /**
   * Was die Turnierliste zeigt.
   *
   * Zu den Spieltagen der Quelle kommen die, zu denen bisher nur Epic etwas
   * hat - sonst fehlte ein gelaufener Cup im Profil ganz, obwohl Platz und
   * Mitspieler feststehen. Sortiert wird ueber beide hinweg nach Datum,
   * damit sie sich nicht am Ende sammeln.
   */
  const turnierZeilen = useMemo(() => {
    const heimatEpic = heimatRegion
      ? epicZeilen.filter((z) => z.region === heimatRegion) : epicZeilen;
    const zusammen = alleRegionen
      ? [...verlauf, ...epicZeilen]
      : [...verlaufHeimat, ...heimatEpic];
    return zusammen.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  }, [verlauf, verlaufHeimat, epicZeilen, alleRegionen, heimatRegion]);

  /** Die laufende Bestenliste in der Leiste. */
  const seitenliste = useMemo(() => listen.find((l) => l.feld === 'elims'), [listen]);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px] gap-5 px-4 py-6">

        {/* ---------------------------------------------- linke Leiste */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="space-y-0.5">
            {[...BEREICHE, ...(zugang.vip ? VIP_BEREICHE : []),
              ...(istAdmin ? ADMIN_BEREICHE : [])].map(([wert, titel]) => (
              <button key={wert} onClick={() => wechsleBereich(wert)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5
                            text-sm transition ${bereich === wert
                              ? 'bg-zinc-900/80 font-medium text-slate-100'
                              : 'text-slate-400 hover:bg-zinc-900/40 hover:text-slate-200'}`}>
                <span className={bereich === wert ? 'text-slate-300' : 'text-slate-600'}>
                  <Zeichen art={wert} />
                </span>
                <T>{titel}</T>
              </button>
            ))}
          </nav>

          {/* Die laufende Bestenliste - ohne Kasten, direkt in der Leiste */}
          {seitenliste && (
            <div className="mt-7 border-t border-zinc-900 pt-4">
              <p className="px-3 text-[10px] font-semibold uppercase
                            tracking-[0.16em] text-slate-500">
                <T>Meiste Eliminierungen</T>
              </p>
              <p className="mb-2 px-3 text-[10px] text-slate-600">
                {saisonTitel} <T>· alle Regionen</T>
              </p>
              <div>
                {seitenliste.plaetze.slice(0, 15).map((sp, i) => (
                  <button key={sp.epicId} onClick={() => oeffne(sp)}
                    className="flex w-full items-center gap-2 rounded px-3 py-[5px]
                               text-left transition hover:bg-zinc-900/50">
                    <span className="w-4 shrink-0 text-right text-[11px] tabular-nums
                                     text-slate-600">{i + 1}</span>
                    <TeamFlagge groesse={14} laender={[sp.land ?? undefined]} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium
                                     text-slate-300">
                      {grossName(sp.anzeige, sp.gepflegt)}
                    </span>
                    <RegionMarke region={sp.heimat || sp.regionen[0] || ''} />
                    <span className="w-6 shrink-0 text-right text-[11px] font-bold
                                     tabular-nums text-slate-200">
                      {zahl(sp.elims, 0, sprache)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ---------------------------------------------- rechter Inhalt */}
        <div className="min-w-0 flex-1">

          {/* Kopf mit Saison und Bereichen fuer schmale Schirme */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-100"><T>Statistiken</T></h1>
            <select value={saison} onChange={(e) => setSaison(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5
                         text-sm text-slate-200 outline-none focus:border-sky-500">
              {saisons.map((s) => (
                <option key={s.kennung} value={s.kennung}>{s.name}</option>
              ))}
            </select>
            {/* Die Suche.
                Sie sucht ueber das ganze Archiv, nicht nur ueber die Saison
                daneben - ein Name soll gefunden werden, ohne dass man vorher
                weiss, wann derjenige zuletzt gespielt hat. Ein Klick auf
                einen Treffer oeffnet direkt sein Profil. */}
            <div className="relative ml-auto w-56 sm:w-72">
              <input value={kopfSuche}
                onChange={(e) => {
                  setKopfSuche(e.target.value);
                  // In der Bilderansicht ist dasselbe Feld der Filter fuer
                  // das Raster - zwei Suchfelder nebeneinander waren eines
                  // zu viel.
                  if (bereich === 'bilder') {
                    setGalerieSuche(e.target.value);
                    setGalerieMenge(400);
                  } else {
                    setKopfOffen(true);
                  }
                }}
                onFocus={() => setKopfOffen(bereich !== 'bilder')}
                onBlur={() => setTimeout(() => setKopfOffen(false), 150)}
                onKeyDown={(e) => {
                  // Eingabetaste oeffnet den ersten Treffer - schneller als
                  // zur Maus zu greifen.
                  if (e.key === 'Enter' && kopfTreffer[0]) {
                    oeffne(kopfTreffer[0]);
                    setKopfSuche(''); setKopfOffen(false);
                  }
                  if (e.key === 'Escape') { setKopfSuche(''); setKopfOffen(false); }
                }}
                placeholder={bereich === 'bilder'
                  ? t('Name suchen — oder DE, FR, GB') : t('Spieler suchen …')}
                title={bereich === 'bilder'
                  ? t('Klein geschrieben sucht im Namen, groß geschrieben '
                    + 'nach Ländern: DE,FR,GB') : undefined}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                           py-1.5 text-sm text-slate-100 outline-none
                           placeholder:text-slate-600 focus:border-sky-500" />

              {kopfOffen && bereich !== 'bilder' && kopfTreffer.length > 0 && (
                <div className="absolute right-0 z-40 mt-1 w-full overflow-hidden
                                rounded-lg border border-zinc-700 bg-zinc-950
                                shadow-2xl">
                  {kopfTreffer.map((sp) => (
                    <button key={sp.epicId}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        oeffne(sp); setKopfSuche(''); setKopfOffen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left
                                 transition hover:bg-zinc-900">
                      {sp.bild ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={sp.bild} alt="" loading="lazy"
                          className="h-8 w-8 shrink-0 rounded object-cover
                                     object-top" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center
                                         justify-center rounded bg-zinc-900
                                         text-xs text-zinc-700">?</span>
                      )}
                      <TeamFlagge groesse={16} laender={[sp.land ?? undefined]} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold
                                       uppercase tracking-wide text-slate-100">
                        {grossName(sp.anzeige, sp.gepflegt)}
                      </span>
                      {sp.heimat && <RegionMarke region={sp.heimat} />}
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {zahl(sp.matches, 0, sprache)} <T>Matches</T>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-1 lg:hidden">
              {[...BEREICHE, ...(zugang.vip ? VIP_BEREICHE : []),
              ...(istAdmin ? ADMIN_BEREICHE : [])].map(([wert, titel]) => (
                <button key={wert} onClick={() => wechsleBereich(wert)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    bereich === wert
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-zinc-800 text-slate-400'}`}>
                  <T>{titel}</T>
                </button>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------- Übersicht */}
          {bereich === 'start' && (
            <>
              {kacheln[kachelNr] && (() => {
                const k = kacheln[kachelNr];
                return (
                  <>
                    <p className="mb-2 text-[10px] font-semibold uppercase
                                  tracking-[0.18em] text-slate-500">
                      <T>Letzte Turniere</T>
                    </p>

                    <section className="relative mb-6 overflow-hidden rounded-xl border
                                        border-zinc-800 bg-zinc-950/60">
                      {/* Die Linie liegt auf der Karte, nicht ueber ihr.
                          Sie laeuft in zehn Sekunden von links nach rechts;
                          ist sie durch, kommt der naechste Spieltag.
                          Frueher stand sie als eigene Zeile ueber dem Inhalt -
                          dadurch begann das Bild drei Pixel tiefer, mitten im
                          Rundungsbogen der Ecke, und dort blieb ein dunkler
                          Keil stehen. Jetzt schwebt sie darueber, und die Ecke
                          bleibt eine saubere Rundung. */}
                      {/* Nur der gefuellte Teil ist zu sehen.
                          Vorher lag darunter eine dunkle Bahn ueber die ganze
                          Breite - die sah aus wie ein schwarzer Streifen, der
                          sich vor das Bild schiebt. Ohne Bahn bleibt eine
                          Linie, die einfach nach rechts waechst. */}
                      <div className="absolute inset-x-0 top-0 z-10 h-[2px]">
                        <div key={kachelNr} className="h-full bg-sky-500 animate-fuellen" />
                      </div>

                      <div className="grid lg:grid-cols-[260px_1fr]">
                        {/* Der Spieler links, wie im Vorbild */}
                        {/* Das Bild fuellt die Karte ueber die volle Hoehe.
                            Mit self-start endete es dort, wo sein Verhaeltnis
                            von vier zu fuenf aufhoert - darunter blieb ein
                            dunkler Rest der Karte stehen. */}
                        <button onClick={() => oeffne(k.spitze)}
                          className="group relative overflow-hidden bg-zinc-900
                                     text-left">
                          {/* Alle Bilder liegen uebereinander und werden nur
                              ein- und ausgeblendet.
                              Vorher wurde beim Wechsel die Adresse des einen
                              Bildes ausgetauscht - dabei ist das alte sofort
                              weg, und bis das neue geladen und gezeichnet ist,
                              steht dort ein schwarzes Feld. Wenn alle Bilder
                              von Anfang an im Dokument haengen, ist keines
                              mehr zu laden und der Wechsel ist ein reines
                              Ueberblenden. */}
                          {/* Hochkant, nicht quadratisch.
                              Vorher richtete sich die Hoehe nach der Spalte
                              daneben - bei 260 Pixeln Breite kam damit ein
                              nahezu quadratischer Ausschnitt heraus, in dem
                              vom Spieler wenig und vom Hintergrund viel zu
                              sehen war. Ein festes Verhaeltnis von vier zu
                              fuenf haelt den Rahmen immer gleich, egal wie
                              hoch der Inhalt daneben ausfaellt. */}
                          <div className="relative h-full min-h-[300px] w-full">
                            {kacheln.map((kk, i) => (
                              kk.spitze.bild ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img key={kk.spitze.epicId + i} src={kk.spitze.bild} alt=""
                                  aria-hidden={i !== kachelNr}
                                  style={{ objectPosition: 'center 25%' }}
                                  className={`absolute inset-0 h-full w-full object-cover
                                              transition-opacity duration-500
                                              group-hover:scale-105 ${i === kachelNr
                                    ? 'opacity-100' : 'opacity-0'}`} />
                              ) : null
                            ))}
                            {!k.spitze.bild && (
                              <div className="flex h-full items-center justify-center
                                              text-4xl text-zinc-700">?</div>
                            )}
                          </div>
                          {/* Bei mehreren Spielern je Spieltag sagt die Marke,
                              der wievielte es ist - "TOP" waere bei Platz drei
                              schlicht falsch. */}
                          <span className={`absolute right-3 top-3 rounded px-2 py-0.5
                                            text-[10px] font-bold tracking-wider
                                            text-white ${(k.platz ?? 1) === 1
                              ? 'bg-sky-500' : 'bg-zinc-700'}`}>
                            {(k.platz ?? 1) === 1 ? 'TOP' : `#${k.platz}`}
                          </span>
                          <span className="absolute bottom-3 left-3 flex items-center gap-2">
                            <TeamFlagge groesse={22}
                              laender={[k.spitze.land ?? undefined]} />
                            <span className="text-base font-bold tracking-wide text-white">
                              {grossName(k.spitze.anzeige, k.spitze.gepflegt)}
                            </span>
                          </span>
                        </button>

                        <div>
                          <div className="border-b border-zinc-800 px-5 py-4">
                            <p className="text-[10px] font-semibold uppercase
                                          tracking-[0.18em] text-slate-500">
                              <T>Turnier</T>
                            </p>
                            <h2 className="mt-0.5 text-xl font-bold text-slate-50">
                              {k.turnier.name}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {[saisonTitel, datumText(k.turnier.datum, sprache),
                                k.turnier.region]
                                .filter(Boolean).map((t) => (
                                  <span key={t} className="rounded border border-zinc-800
                                                           bg-zinc-900/60 px-2 py-0.5
                                                           text-[11px] text-slate-400">
                                    <T>{t}</T>
                                  </span>
                                ))}
                            </div>
                          </div>

                          <div className="grid gap-px bg-zinc-800/60 sm:grid-cols-3">
                            {/* Dieselben sechs Felder in derselben Anordnung
                                wie im Vorbild. An erster Stelle steht dort
                                das Rating; hier steht die Schadensquote, die
                                ihm am naechsten kommt und sich nachrechnen
                                laesst. */}
                            {([
                              ['Schadensquote', zahl(k.spitze.quote, 2, sprache)],
                              ['Eliminierungen', zahl(k.spitze.elims, 0, sprache)],
                              ['Schaden', zahl(k.spitze.damage, 0, sprache)],
                              ['Kopftreffer', zahl(k.spitze.headshots, 0, sprache)],
                              ['Treffer', zahl(k.spitze.hits, 0, sprache)],
                              ['Bauteile', zahl(k.spitze.builds, 0, sprache)],
                            ] as Array<[string, string]>).map(([l, v]) => (
                              // Feste Hoehe und kein Umbruch: der Betreiber
                              // wollte, dass die Karte "immer gleich" hoch
                              // ist. Eine laengere Beschriftung - auf
                              // Deutsch etwa "Schadensquote" - darf die
                              // Reihe nicht auseinanderziehen.
                              <div key={l} className="h-[78px] bg-zinc-950 px-5 py-3.5">
                                <p className="truncate text-[10px] font-semibold
                                              uppercase tracking-[0.14em]
                                              text-slate-500"><T>{l}</T></p>
                                <p className="mt-0.5 truncate text-2xl font-bold
                                              tabular-nums text-slate-50">{v}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                  </>
                );
              })()}

              <p className="mb-2 text-[10px] font-semibold uppercase
                            tracking-[0.18em] text-slate-500">
                <T>Bestenlisten der Saison</T> {saisonTitel}
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {listen.map((l) => (
                  <div key={l.feld}
                    className="overflow-hidden rounded-xl border border-zinc-800
                               bg-zinc-950/60">
                    <p className="flex items-baseline gap-2 border-b border-zinc-800
                                  bg-zinc-900/40 px-3 py-2 text-[10px] font-semibold
                                  uppercase tracking-[0.14em] text-slate-400">
                      <T>{l.titel}</T>
                      {/*
                        * Die Untergrenze der Quotenliste - aus der Zahl
                        * gebaut, damit sie in beiden Sprachen stimmt.
                        * Vorher kam hier ein fertiger deutscher Satz vom
                        * Server ("ab 8 Matches") und stand so auch auf der
                        * englischen Seite.
                        */}
                      {!!l.mindestMatches && (
                        <span className="ml-auto font-normal normal-case
                                         tracking-normal text-slate-600">
                          {t('ab {n} Matches')
                            .replace('{n}', String(l.mindestMatches))}
                        </span>
                      )}
                      {/*
                        * Und das Plus: dieselbe Liste in voller Laenge, wie
                        * auf der Cup-Seite und in den Regionen. Fuenf
                        * Plaetze sind ein Blick, fuenfzig sind die Antwort.
                        */}
                      <button type="button"
                        onClick={() => {
                          setVolleListe({
                            titel: l.titel, zusatz: saisonTitel,
                            zeilen: l.plaetze,
                            feld: l.feld as keyof Spieler,
                            nachkomma: l.nachkomma ?? 0,
                            einheit: l.einheit ?? '',
                          });
                          setListenTiefe(50);
                        }}
                        title={t('Alle anzeigen')}
                        className={`${l.mindestMatches ? '' : 'ml-auto '}rounded border
                                    border-zinc-700 px-1.5 text-[11px] leading-4
                                    text-slate-400 transition hover:border-sky-500
                                    hover:text-sky-400`}>
                        +
                      </button>
                    </p>
                    <div className="divide-y divide-zinc-900">
                      {/* Fuenf je Karte wie im Vorbild - die lange Fassung
                          steht in der Leiste. */}
                      {l.plaetze.slice(0, 5).map((s, i) => (
                        <Platz key={s.epicId} nr={i + 1} s={s}
                          wert={zahl(Number((s as unknown as Record<string, number>)[l.feld]),
                            l.nachkomma, sprache) + (l.einheit ?? '')}
                          aufKlick={() => oeffne(s)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* --------------------------------------- Spielerprofile */}
              {profile.length > 0 && (() => {
                const g = profile[profilNr % profile.length];
                return (
                  <section className="mt-7">
                    <div className="mb-2 flex flex-wrap items-baseline gap-3">
                      <p className="text-[10px] font-semibold uppercase
                                    tracking-[0.18em] text-slate-500">
                        <T>Spielerprofile</T>
                      </p>
                      <RegionMarke region={g.region} />
                      <span className="text-[10px] text-slate-600">
                        <T>über alle erfassten Spieltage</T>
                      </span>
                      <button onClick={() => wechsleBereich('spieler')}
                        className="ml-auto text-[10px] font-semibold uppercase
                                   tracking-[0.14em] text-slate-500 transition
                                   hover:text-sky-400">
                        <T>Alle anzeigen →</T>
                      </button>
                    </div>
                    {/* Der Streifen laeuft von links nach rechts voll, dann
                        springt die Ansicht zur naechsten Region. */}
                    <div className="mb-3 h-px w-full overflow-hidden bg-zinc-900">
                      <div key={profilNr} className="h-full w-full bg-sky-500
                                                     animate-fuellen" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {g.spieler.map((sp) => (
                        <button key={sp.epicId} onClick={() => oeffne(sp)}
                          className="group relative aspect-[3/4] overflow-hidden
                                     rounded-xl border border-zinc-800 bg-zinc-900
                                     text-left transition hover:border-sky-500">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={sp.bild ?? ''} alt="" loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover
                                       object-top transition duration-300
                                       group-hover:scale-105" />
                          <span className="absolute left-2 top-2">
                            <RegionMarke region={sp.heimat || g.region} />
                          </span>

                          {/* Name und Werte liegen auf dem Bild, nicht darunter.
                              Der dunkle Verlauf laesst das Foto durchscheinen -
                              die Karte bleibt ein Bild und wird nicht zur
                              Tabelle mit Kopfzeile. */}
                          <span className="absolute bottom-0 w-full
                                           bg-gradient-to-t from-black/95
                                           via-black/70 to-transparent px-3 pb-2.5
                                           pt-10">
                            <span className="flex items-center gap-1.5">
                              <TeamFlagge groesse={16}
                                laender={[sp.land ?? undefined]} />
                              <span className="min-w-0 truncate text-sm font-bold
                                               uppercase tracking-wide text-slate-50">
                                {grossName(sp.anzeige, sp.gepflegt)}
                              </span>
                            </span>
                            <span className="mt-1.5 flex divide-x divide-white/10
                                             rounded-lg bg-black/45
                                             backdrop-blur-sm">
                              {/* Quote steht zuerst und farbig: sie ist die
                                  Zahl, die dem Rating der Quelle am naechsten
                                  kommt - ausgeteilter zu erlittenem Schaden. */}
                              {([['Quote', zahl(sp.quote, 2, sprache), true],
                                 ['Elims', kurzZahl(sp.elims, sprache), false],
                                 ['Schaden', kurzZahl(sp.damage, sprache), false]] as
                                Array<[string, string, boolean]>).map(
                                ([l, v, farbig]) => (
                                  <span key={l} className="min-w-0 flex-1 px-1.5 py-1.5
                                                          text-center">
                                    <span className="block truncate text-[9px]
                                                     font-semibold uppercase
                                                     text-slate-400"><T>{l}</T></span>
                                    <span className={`mt-0.5 block truncate text-[13px]
                                                      font-bold tabular-nums ${farbig
                                      ? 'text-sky-400' : 'text-slate-100'}`}>{v}</span>
                                  </span>
                                ))}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Punkte zum Umschalten - der Wechsel laeuft von selbst
                        weiter, aber wer eine bestimmte Region sehen will,
                        soll nicht warten muessen. */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      {profile.map((gr, i) => (
                        <button key={gr.region} onClick={() => setProfilNr(i)}
                          title={gr.region}
                          aria-label={`Region ${gr.region} zeigen`}
                          className={`h-2 rounded-full transition-all ${i === profilNr
                            ? 'w-6 bg-sky-400' : 'w-2 bg-zinc-700 hover:bg-zinc-600'}`} />
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* --------------------------------------------- Duelle */}
              {duelle.length > 0 && (
                <section className="mt-7">
                  <div className="mb-2 flex flex-wrap items-baseline gap-3">
                    <p className="text-[10px] font-semibold uppercase
                                  tracking-[0.18em] text-slate-500">
                      <T>Kopf an Kopf</T>
                    </p>
                    <span className="text-[10px] text-slate-600">
                      {duellNr + 1} <T>von</T> {duelle.length}
                    </span>
                    <button onClick={() => wechsleBereich('vergleich')}
                      className="ml-auto text-[10px] font-semibold uppercase
                                 tracking-[0.14em] text-slate-500 transition
                                 hover:text-sky-400">
                      <T>Selbst vergleichen →</T>
                    </button>
                  </div>
                  <div className="mb-3 h-px w-full overflow-hidden bg-zinc-900">
                    <div key={duellNr} className="h-full w-full bg-sky-500
                                                  animate-fuellen" />
                  </div>
                  <DuellTafel links={duelle[duellNr % duelle.length].links}
                    rechts={duelle[duellNr % duelle.length].rechts}
                    zeitraum={archivTitel}
                    aufKlick={oeffne} gross />
                </section>
              )}

              {/* --------------------------------------- Power Ranking */}
              {power.length > 0 && (
                <section className="mt-7">
                  <div className="mb-2 flex flex-wrap items-baseline gap-3">
                    <p className="text-[10px] font-semibold uppercase
                                  tracking-[0.18em] text-slate-500">
                      <T>Power Ranking</T>
                    </p>
                    <span className="text-[10px] text-slate-600">
                      <T>Epics weltweite Liste</T>
                    </span>
                    <a href="/power-rankings"
                      className="ml-auto text-[10px] font-semibold uppercase
                                 tracking-[0.14em] text-slate-500 transition
                                 hover:text-sky-400">
                      <T>Alle Ranglisten →</T>
                    </a>
                  </div>
                  {/* Eine Tabelle statt zweier Spalten: Platz, Spieler,
                      Wertung und die Veraenderung - so wie beim Vorbild. Eine
                      Regionsspalte fehlt bewusst, denn die weltweite Liste
                      fuehrt zu einem Spieler nur sein Land, keine Region. */}
                  <div className="overflow-hidden rounded-xl border border-zinc-800
                                  bg-zinc-950/60">
                    <div className="flex items-center gap-3 border-b border-zinc-800
                                    bg-zinc-900/40 px-4 py-2 text-[10px] font-semibold
                                    uppercase tracking-[0.14em] text-slate-500">
                      <span className="w-9 shrink-0 text-right">#</span>
                      <span className="w-5 shrink-0" />
                      <span className="min-w-0 flex-1"><T>Spieler</T></span>
                      <span className="w-24 shrink-0 text-right"><T>PR-Wertung</T></span>
                      <span className="w-20 shrink-0 text-right"><T>Plätze</T></span>
                    </div>
                    {power.slice(0, 15).map((z) => {
                      // Die Veraenderung des Platzes, nicht der Wertung: eine
                      // Punktdifferenz fuehrt die Liste nicht mit, dort steht
                      // ueberall null. Wer sie als "Δ PR" ausgaebe, zeigte
                      // eine Zahl, die es nicht gibt.
                      const d = z.deltaPlatz ?? 0;
                      return (
                        <div key={z.rank}
                          className="flex items-center gap-3 border-b border-zinc-900
                                     px-4 py-2.5 last:border-b-0
                                     hover:bg-zinc-900/40">
                          <span className={`w-9 shrink-0 text-right text-xs font-bold
                                            tabular-nums ${z.rank === 1
                            ? 'text-amber-400' : z.rank <= 3
                              ? 'text-sky-400' : 'text-slate-600'}`}>
                            #{z.rank}
                          </span>
                          <span className="w-5 shrink-0">
                            <TeamFlagge groesse={18} laender={[z.land || undefined]} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold
                                           uppercase tracking-wide text-slate-100">
                            {grossName(z.name)}
                          </span>
                          <span className="w-24 shrink-0 text-right text-xs font-bold
                                           tabular-nums text-slate-100">
                            {zahl(z.wertung, 0, sprache)}
                          </span>
                          <span className={`flex w-20 shrink-0 items-center
                                            justify-end gap-1 text-[11px] font-semibold
                                            tabular-nums ${d > 0 ? 'text-emerald-400'
                            : d < 0 ? 'text-rose-400' : 'text-slate-700'}`}>
                            {d !== 0 && (
                              <svg width="8" height="8" viewBox="0 0 10 10"
                                aria-hidden className="shrink-0">
                                <path d={d > 0 ? 'M5 1 L9 8 L1 8 Z' : 'M5 9 L1 2 L9 2 Z'}
                                  fill="currentColor" />
                              </svg>
                            )}
                            {d === 0 ? '—' : zahl(Math.abs(d), 0, sprache)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {/* -------------------------------------------------- Turniere */}
          {/* ------------------------------------------- ein einzelner Cup */}
          {bereich === 'turniere' && cup && (
            <>
              <button onClick={() => { setCup(null); setVolleListe(null); }}
                className="mb-3 text-xs text-slate-400 transition hover:text-sky-400">
                <T>← Zurück zu den Turnieren</T>
              </button>


              {cupLaedt && !cupFeld.length ? (
                <div className="h-64 animate-pulse rounded-xl bg-zinc-900/60" />
              ) : !cupFeld.length ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                              text-center text-sm text-slate-500">
                  <T>Zu diesem Spieltag liegen keine Einzelwerte vor.</T>
                </p>
              ) : (
                <>
                  {/*
                    * Der Aufmacher des Spieltags.
                    *
                    * Er wechselt durch die besten fuenf, statt immer
                    * denselben zu zeigen - der Betreiber hatte zu Recht
                    * bemaengelt, dass dort "nur Charyy die ganze Zeit"
                    * stand.
                    */}
                  {(() => { const cupKopf = cupFeld[cupNr % Math.max(1, cupWechsel)];
                    return cupKopf && (
                    <section className="relative mb-6 overflow-hidden rounded-xl
                                        border border-zinc-800 bg-zinc-950/60">
                      {/*
                        * Der wachsende Streifen ueber dem Aufmacher.
                        *
                        * Auf der Uebersicht gibt es ihn seit jeher, hier
                        * fehlte er - der Aufmacher wechselte alle zehn
                        * Sekunden den Spieler, ohne dass man es kommen sah.
                        * Der Betreiber hat genau das vermisst. Derselbe
                        * Streifen, dieselbe Dauer; der Schluessel setzt ihn
                        * bei jedem Wechsel wieder auf null.
                        */}
                      {cupWechsel > 1 && (
                        <div className="absolute inset-x-0 top-0 z-10 h-[2px]">
                          <div key={cupNr} className="h-full bg-sky-500 animate-fuellen" />
                        </div>
                      )}
                      <div className="grid lg:grid-cols-[240px_1fr]">
                        {/*
                          * Das Foto liegt absolut in seiner Zelle.
                          *
                          * Vorher stand am Bild "h-full min-h-[230px]". Bei
                          * einem ersetzten Element loest sich height:100%
                          * in einer Zelle mit automatischer Hoehe zu "auto"
                          * auf - dann gilt das Seitenverhaeltnis des Fotos.
                          * Ein Bild von 580x868 wurde bei 240 Punkten
                          * Breite 359 hoch und zog die ganze Karte mit.
                          * Genau das hat der Betreiber gesehen: "viel zu
                          * stark nach unten gezogen".
                          *
                          * Mir war es entgangen, weil ich an einem Spieler
                          * ohne Foto gemessen hatte - der Platzhalter hat
                          * kein Seitenverhaeltnis.
                          *
                          * Absolut gesetzt zaehlt das Bild nicht mehr zur
                          * Hoehe; die Karte ist so hoch wie ihr Inhalt.
                          */}
                        <button onClick={() => oeffne(cupKopf)}
                          className="group relative min-h-[230px] overflow-hidden
                                     bg-zinc-900 text-left">
                          {cupKopf.bild ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={cupKopf.bild} alt=""
                              /*
                               * Nicht ganz oben, sondern ein Viertel tiefer.
                               *
                               * Der Betreiber wollte die Leute "einfach
                               * mittig ungefaehr". Ich habe drei Ansaetze an
                               * sechs echten Fotos nebeneinandergelegt: ganz
                               * oben schneidet bei vieren die Haare an, ganz
                               * mittig bei vieren den Scheitel. Bei einem
                               * Viertel sass bei allen sechs der Kopf frei
                               * im Bild.
                               */
                              style={{ objectPosition: 'center 25%' }}
                              className="absolute inset-0 h-full w-full object-cover
                                         transition group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full min-h-[230px] items-center
                                            justify-center text-4xl text-zinc-700">?</div>
                          )}
                          <span className="absolute right-3 top-3 rounded bg-sky-500 px-2
                                           py-0.5 text-[10px] font-bold tracking-wider
                                           text-white"><T>TOP</T></span>
                          <span className="absolute bottom-3 left-3 flex items-center gap-2">
                            <TeamFlagge groesse={22}
                              laender={[cupKopf.land ?? undefined]} />
                            <span className="text-base font-bold tracking-wide text-white">
                              {grossName(cupKopf.anzeige, cupKopf.gepflegt)}
                            </span>
                          </span>
                        </button>

                        {/*
                          * Dieselben sechs Werte in derselben Anordnung wie
                          * auf der Uebersicht.
                          *
                          * Vorher standen hier neun, also drei Reihen - die
                          * Karte wurde dadurch halb so hoch wie der
                          * Bildschirm und zog das Foto lang. Der Betreiber
                          * hat es genau so beschrieben: "unter Statistik,
                          * Tournament und nachher 'n Tournament ist es so
                          * langgezogen. Und wenn ich über Overview gehe,
                          * dann sieht's gut aus."
                          *
                          * Verloren geht nichts: Assists, Material und
                          * Matches stehen als schmale Zeile darunter.
                          */}
                        <div>
                          {/*
                            * Derselbe Kopf wie auf der Uebersichtskarte.
                            *
                            * Er stand vorher ueber der Karte; damit war die
                            * Cup-Karte siebzig Punkte flacher als die auf
                            * der Uebersicht und sah anders aus. Jetzt sind
                            * beide gleich gebaut.
                            */}
                          <div className="border-b border-zinc-800 px-5 py-4">
                            <p className="text-[10px] font-semibold uppercase
                                          tracking-[0.18em] text-slate-500">
                              <T>Turnier</T>
                            </p>
                            <h2 className="mt-0.5 text-xl font-bold text-slate-50">
                              {cup.name}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {[cup.region, saisonTitel,
                                datumText(cup.datum, sprache),
                                `${zahl(cup.spieler, 0, sprache)} ${t('Spieler')}`,
                                `${zahl(cup.matches, 0, sprache)} ${t('Matches')}`]
                                .filter(Boolean).map((x) => (
                                  <span key={x} className="rounded border border-zinc-800
                                                           bg-zinc-900/60 px-2 py-0.5
                                                           text-[11px] text-slate-400">
                                    {x}
                                  </span>
                                ))}
                            </div>
                          </div>

                          <div className="grid gap-px bg-zinc-800/60 sm:grid-cols-3">
                            {([
                              ['Schadensquote', zahl(cupKopf.quote, 2, sprache)],
                              ['Eliminierungen', zahl(cupKopf.elims, 0, sprache)],
                              ['Schaden', zahl(cupKopf.damage, 0, sprache)],
                              ['Kopftreffer', zahl(cupKopf.headshots, 0, sprache)],
                              ['Treffer', zahl(cupKopf.hits, 0, sprache)],
                              ['Bauteile', zahl(cupKopf.builds, 0, sprache)],
                            ] as Array<[string, string]>).map(([l, v]) => (
                              // Feste Hoehe und kein Umbruch: der Betreiber
                              // wollte, dass die Karte "immer gleich" hoch
                              // ist. Eine laengere Beschriftung - auf
                              // Deutsch etwa "Schadensquote" - darf die
                              // Reihe nicht auseinanderziehen.
                              <div key={l} className="h-[78px] bg-zinc-950 px-5 py-3.5">
                                <p className="truncate text-[10px] font-semibold
                                              uppercase tracking-[0.14em]
                                              text-slate-500"><T>{l}</T></p>
                                <p className="mt-0.5 truncate text-2xl font-bold
                                              tabular-nums text-slate-50">{v}</p>
                              </div>
                            ))}
                          </div>

                        </div>
                      </div>
                    </section>
                  ); })()}

                  <p className="mb-2 text-[10px] font-semibold uppercase
                                tracking-[0.18em] text-slate-500">
                    <T>Bestenlisten dieses Spieltags</T>
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cupListen.map((l) => (
                      <div key={l.titel}
                        className="overflow-hidden rounded-xl border border-zinc-800
                                   bg-zinc-950/60">
                        <p className="flex items-center gap-2 border-b border-zinc-800
                                      bg-zinc-900/40 px-3 py-2 text-[10px] font-semibold
                                      uppercase tracking-[0.14em] text-slate-400">
                          <T>{l.titel}</T>
                          {/* Dahinter das ganze Feld, nicht nur die Spitze. */}
                          {l.zeilen.length > 5 && (
                            <button onClick={() => {
                              setVolleListe({
                                titel: l.titel, zeilen: l.zeilen, feld: l.feld,
                                nachkomma: l.nachkomma ?? 0, einheit: l.einheit ?? '',
                              });
                              setListenTiefe(50);
                            }}
                              title={`Alle ${l.zeilen.length} anzeigen`}
                              className="ml-auto rounded border border-zinc-700 px-1.5
                                         text-[11px] leading-4 text-slate-400 transition
                                         hover:border-sky-500 hover:text-sky-400">
                              +
                            </button>
                          )}
                        </p>
                        <div className="divide-y divide-zinc-900">
                          {l.zeilen.slice(0, 5).map((sp, i) => (
                            <Platz key={sp.epicId} nr={i + 1} s={sp}
                              wert={zahl(Number(sp[l.feld]), l.nachkomma ?? 0, sprache)
                                    + (l.einheit ?? '')}
                              aufKlick={() => oeffne(sp)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {bereich === 'turniere' && !cup && (() => {
            const gefiltert = turniere.filter((t) =>
              (!region || t.region === region)
              && (!turnierSuche.trim()
                  || t.name.toLowerCase().includes(turnierSuche.trim().toLowerCase())));
            return (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input value={turnierSuche} onChange={(e) => setTurnierSuche(e.target.value)}
                    placeholder={t('Turnier suchen …')}
                    className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                               py-1.5 text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  {regionen.map((r) => (
                    <button key={r} onClick={() => setRegion(r)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${region === r
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                      {r}
                    </button>
                  ))}
                  {/* "Alle" steht hinten: es ist der Sonderfall, nicht der
                      Einstieg. Vorn stuende es jedes Mal im Weg. */}
                  <button onClick={() => setRegion('')}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${!region
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                    <T>Alle</T>
                  </button>
                  {/*
                    * Voreingestellt stehen hier nur die grossen Finale.
                    * Wer alles sehen will, schaltet um - weggeworfen wird
                    * nichts.
                    */}
                  <button onClick={() => setNurGrosse((v) => !v)}
                    title={t(nurGrosse
                      ? 'Zeigt Performance Cups, Division-1-Finale, FNCS Grand Finals und EWC'
                      : 'Zeigt jeden Spieltag, auch Cash Cups und Division 2 bis 5')}
                    className={`ml-auto rounded-lg border px-2.5 py-1.5 text-xs
                                transition ${nurGrosse
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                    {nurGrosse ? <T>nur große Finale</T> : <T>alle Spieltage</T>}
                  </button>

                  <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
                    <button onClick={() => setTafel(true)}
                      className={`rounded px-2.5 py-1 text-xs transition ${tafel
                        ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500'}`}><T>Kacheln</T></button>
                    <button onClick={() => setTafel(false)}
                      className={`rounded px-2.5 py-1 text-xs transition ${!tafel
                        ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500'}`}><T>Liste</T></button>
                  </div>
                </div>

                {/*
                  * Was noch fehlt, und warum.
                  *
                  * Ohne diesen Hinweis fehlte ein Finale von gestern Abend
                  * einfach - ohne Erklaerung, obwohl es auf der Eventseite
                  * laengst stand. Der Grund liegt nicht hier, sondern an der
                  * Quelle: Epic fuehrt das Fenster sofort, die Einzelwerte
                  * kommen ein bis zwei Tage spaeter nach.
                  */}
                {(() => {
                  const bekannt = new Set(turniere.map((x) => x.windowId));
                  const fehlend = laufende.filter((f) => !bekannt.has(f.windowId)
                    && (!region || f.region === region));
                  if (!fehlend.length) return null;
                  const namen = [...new Set(fehlend.map((f) => f.titel))];
                  const laeuftNoch = fehlend.some((f) => f.live);
                  return (
                    <p className="mb-3 rounded-xl border border-sky-500/40 bg-sky-500/5
                                  px-4 py-3 text-xs leading-relaxed text-slate-300">
                      <span className="font-semibold text-sky-400">
                        {namen.join(' · ')}
                      </span>
                      {' — '}
                      {laeuftNoch
                        ? t('läuft gerade. Die Einzelwerte kommen erst, wenn der Cup '
                          + 'zu Ende ist — Platz und Punkte stehen so lange unter Events.')
                        : t('ist zu Ende, die Einzelwerte fehlen aber noch. Die Quelle '
                          + 'veröffentlicht sie ein bis zwei Tage später; danach steht '
                          + 'der Cup hier von selbst.')}
                    </p>
                  );
                })()}

                {!gefiltert.length ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                                text-center text-sm text-slate-500">
                    {turniere.length ? t('Nichts gefunden.') : t('Wird geladen …')}
                  </p>
                ) : tafel ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {gefiltert.map((t) => {
                      const art = turnierArt(t.name);
                      return (
                        <button key={t.region + t.datei} onClick={() => setCup(t)}
                          className="overflow-hidden rounded-xl border border-zinc-800
                                     bg-zinc-950/60 text-left transition
                                     hover:border-sky-500">
                          {/* Epics eigene Grafik, wo eine zum Cup passt -
                              sonst die Farbflaeche mit der Turnierart. */}
                          {t.bild ? (
                            <div className="relative h-28 overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={t.bild} alt="" loading="lazy"
                                className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className={`flex h-28 items-center justify-center
                                             bg-gradient-to-br ${art.farbe}`}>
                              <span className="px-3 text-center text-lg font-black
                                               tracking-wide text-white/90">
                                {art.wort}
                              </span>
                            </div>
                          )}
                          <div className="p-3">
                            <div className="mb-2 flex flex-wrap gap-1">
                              <RegionMarke region={t.region} />
                              <RegionMarke region={t.saisonName ?? t.season} />
                            </div>
                            <p className="text-sm font-semibold leading-snug text-slate-100">
                              {t.name}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {datumText(t.datum, sprache)}{' '}
                              · {zahl(t.spieler, 0, sprache)} <T>Spieler</T>
                              {' '}· {zahl(t.matches, 0, sprache)} <T>Matches</T>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-800
                                  bg-zinc-950/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] uppercase
                                       tracking-wider text-slate-500">
                          <th className="px-4 py-3 text-left font-medium"><T>Turnier</T></th>
                          <th className="px-3 py-3 text-left font-medium"><T>Region</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Spieler</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Matches</T></th>
                          <th className="px-4 py-3 text-right font-medium"><T>Datum</T></th>
                        </tr>
                      </thead>
                      <tbody>
                        {gefiltert.map((t) => (
                          <tr key={t.region + t.datei} onClick={() => setCup(t)}
                            className="cursor-pointer border-b border-zinc-900 transition
                                       hover:bg-zinc-900/60">
                            <td className="px-4 py-2.5 text-slate-200">
                              {t.name}
                              {t.nurEpic && (
                                <span className="ml-2 rounded border
                                                 border-amber-700/50 px-1.5
                                                 text-[9px] uppercase
                                                 tracking-wider text-amber-500/80">
                                  <T>nur Epic</T>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5"><RegionMarke region={t.region} /></td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                              {zahl(t.spieler, 0, sprache)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                              {zahl(t.matches, 0, sprache)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                              {datumText(t.datum, sprache)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}

          {/* -------------------------------------------------- Regionen */}
          {bereich === 'regional' && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {regionen.map((r) => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      regionAktiv === r
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                    {r}
                  </button>
                ))}
              </div>

              {regionLaedt && !regionFeld.length ? (
                <div className="h-64 animate-pulse rounded-xl bg-zinc-900/60" />
              ) : !regionFeld.length ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                              text-center text-sm text-slate-500">
                  Für {regionAktiv} liegen in {saisonTitel} <T>keine Einzelwerte vor.</T>
                </p>
              ) : (
                <>
                  {/* Die fuenf staerksten der Saison - mit Bild wie im Vorbild */}
                  <p className="mb-2 text-[10px] font-semibold uppercase
                                tracking-[0.18em] text-slate-500">
                    <T>Die stärksten der Saison</T>
                    <span className="ml-2 font-normal normal-case tracking-normal
                                     text-slate-600"><T>nach Eliminierungen</T></span>
                  </p>
                  <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3
                                  xl:grid-cols-5">
                    {regionFeld.slice(0, 5).map((sp) => (
                      <button key={sp.epicId} onClick={() => oeffne(sp)}
                        className="group overflow-hidden rounded-xl border border-zinc-800
                                   bg-zinc-950/60 text-left transition hover:border-sky-500">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <TeamFlagge groesse={18} laender={[sp.land ?? undefined]} />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold
                                           uppercase tracking-wide text-slate-100">
                            {grossName(sp.anzeige, sp.gepflegt)}
                          </span>
                          <RegionMarke region={regionAktiv} />
                        </div>
                        <div className="relative aspect-[4/5] overflow-hidden bg-zinc-900">
                          {sp.bild ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sp.bild} alt="" loading="lazy"
                              className="h-full w-full object-cover object-top
                                         transition group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full items-center justify-center
                                            text-3xl text-zinc-700">?</div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-zinc-800/60">
                          {([
                            ['Elims', zahl(sp.elims, 0, sprache)],
                            ['Schaden', zahl(sp.damage, 0, sprache)],
                            ['Quote', zahl(sp.quote, 2, sprache)],
                            ['Kopftreffer', zahl(sp.headshots, 0, sprache)],
                            ['Material', zahl(sp.mats, 0, sprache)],
                            ['Bauteile', zahl(sp.builds, 0, sprache)],
                            ['Treffer', zahl(sp.hits, 0, sprache)],
                            ['Spieltage', zahl(sp.events, 0, sprache)],
                          ] as Array<[string, string]>).map(([l, v]) => (
                            <div key={l} className="bg-zinc-950 px-2.5 py-1.5">
                              <p className="text-[8px] uppercase tracking-wider
                                            text-slate-600"><T>{l}</T></p>
                              <p className="text-xs font-bold tabular-nums
                                            text-sky-400">{v}</p>
                            </div>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Die Saison als Ganzes */}
                  <p className="mb-2 text-[10px] font-semibold uppercase
                                tracking-[0.18em] text-slate-500">
                    <T>Saison</T> {saisonTitel} — {regionAktiv}
                  </p>
                  <div className="mb-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {listenAus(regionFeld).map((l) => (
                      <ListenKarte key={l.titel} liste={l}
                        aufVoll={() => {
                          setVolleListe({
                            titel: l.titel, zusatz: regionAktiv, zeilen: l.zeilen,
                            feld: l.feld, nachkomma: l.nachkomma ?? 0,
                            einheit: l.einheit ?? '',
                          });
                          setListenTiefe(50);
                        }}
                        aufSpieler={oeffne} />
                    ))}
                  </div>

                  {/* Je Turnierreihe ein eigener Block mit seinen Spieltagen */}
                  {reihen.map((r) => {
                    const wahl = reihenWahl[r.name] ?? '';
                    const feld = reihenFeld[r.name] ?? [];
                    return (
                      <section key={r.name} className="mb-7">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-semibold uppercase
                                        tracking-[0.18em] text-slate-400">
                            {r.name}
                          </p>
                          <div className="ml-auto flex flex-wrap gap-1">
                            {r.tage.map((t) => (
                              <button key={t.windowId}
                                onClick={() => {
                                  setReihenWahl((a) => ({ ...a, [r.name]: t.windowId }));
                                  void ladeReihe(r.name, r.tage, t.windowId);
                                }}
                                className={`rounded-md border px-2 py-1 text-[11px]
                                            transition ${wahl === t.windowId
                                  ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                                  : 'border-zinc-800 text-slate-500 hover:border-zinc-700'}`}>
                                {kurzTurnier(t.name)}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                setReihenWahl((a) => ({ ...a, [r.name]: '' }));
                                void ladeReihe(r.name, r.tage, '');
                              }}
                              className={`rounded-md border px-2 py-1 text-[11px]
                                          transition ${!wahl
                                ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                                : 'border-zinc-800 text-slate-500 hover:border-zinc-700'}`}>
                              <T>Gesamt</T>
                            </button>
                          </div>
                        </div>

                        {!feld.length ? (
                          <div className="h-24 animate-pulse rounded-xl bg-zinc-900/40" />
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {listenAus(feld).slice(0, 6).map((l) => (
                              <ListenKarte key={r.name + l.titel} liste={l}
                                aufVoll={() => {
                                  setVolleListe({
                                    titel: l.titel, zusatz: r.name, zeilen: l.zeilen,
                                    feld: l.feld, nachkomma: l.nachkomma ?? 0,
                                    einheit: l.einheit ?? '',
                                  });
                                  setListenTiefe(50);
                                }}
                                aufSpieler={oeffne} />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </>
              )}
            </>
          )}


          {/* ------------------------------------------------ Vergleich */}
          {bereich === 'vergleich' && (() => {
            /** Ein Waehler - Feld, Trefferliste, gewaehlter Spieler. */
            const waehler = (
              wer: Spieler | null, setWer: (s: Spieler | null) => void,
              text: string, setText: (t: string) => void,
              treffer: Spieler[], setTreffer: (t: Spieler[]) => void,
              setVerlauf_: (z: VerlaufZeile[]) => void,
              rechtsRum: boolean,
            ) => (
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-3 rounded-lg border
                                 border-zinc-800 bg-zinc-900/40 px-4 py-3
                                 ${rechtsRum ? 'flex-row-reverse text-right' : ''}`}>
                  {wer ? (
                    <>
                      <TeamFlagge groesse={22} laender={[wer.land ?? undefined]} />
                      <span className="min-w-0 flex-1 truncate text-base font-bold
                                       uppercase tracking-wide text-slate-50">
                        {grossName(wer.anzeige, wer.gepflegt)}
                      </span>
                      {wer.heimat && <RegionMarke region={wer.heimat} />}
                      <button onClick={() => { setWer(null); setVerlauf_([]); }}
                        className="shrink-0 text-[11px] text-slate-600 transition
                                   hover:text-rose-400"><T>entfernen</T></button>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-slate-600">
                      <T>Noch niemand gewählt</T>
                    </span>
                  )}
                </div>
                <div className="relative mt-2">
                  <input value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      void suchen(e.target.value, setTreffer);
                    }}
                    placeholder={t('Spieler suchen …')}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80
                               px-3 py-2 text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  {treffer.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden
                                    rounded-lg border border-zinc-700 bg-zinc-950
                                    shadow-xl">
                      {treffer.map((t) => (
                        <button key={t.epicId}
                          onClick={() => {
                            setWer(t); setText(''); setTreffer([]);
                            setVglLeer((a) => (rechtsRum
                              ? [a[0], false] : [false, a[1]]));
                            void vglLaden(t, setVerlauf_);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left
                                     transition hover:bg-zinc-900">
                          <TeamFlagge groesse={16} laender={[t.land ?? undefined]} />
                          <span className="min-w-0 flex-1 truncate text-xs
                                           text-slate-200">
                            {grossName(t.anzeige, t.gepflegt)}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-600">
                            {zahl(t.matches, 0, sprache)} <T>Matches</T>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <>
                <div className="mb-5 rounded-xl border border-zinc-800
                                bg-zinc-950/60 p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    {waehler(vglLinks, setVglLinks, suchLinks, setSuchLinks,
                      trefferLinks, setTrefferLinks, setVglVerlaufLinks, false)}
                    <span className="mt-3 shrink-0 text-xs font-bold uppercase
                                     tracking-[0.2em] text-slate-600"><T>gegen</T></span>
                    {waehler(vglRechts, setVglRechts, suchRechts, setSuchRechts,
                      trefferRechts, setTrefferRechts, setVglVerlaufRechts, true)}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-600">
                    <T>Alle Zahlen aus der Saison</T> {saisonTitel}<T>. Oben umschalten vergleicht dieselben beiden in einer anderen Saison.</T>
                  </p>
                </div>

                {vglLinks && vglRechts && (vglLeer[0] || vglLeer[1]) ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60
                                  px-6 py-14 text-center">
                    {(() => {
                      const fehlen = [vglLeer[0] && vglLinks, vglLeer[1] && vglRechts]
                        .filter(Boolean) as Spieler[];
                      return (
                        <p className="text-sm text-slate-400">
                          {fehlen.map((x) => grossName(x.anzeige, x.gepflegt))
                            .join(` ${t('und')} `)}
                          {fehlen.length > 1 ? ` ${t('sind')} ` : ` ${t('ist')} `}
                          <T>in der Saison</T> {saisonTitel} <T>nicht angetreten.</T>
                        </p>
                      );
                    })()}
                    <p className="mt-1 text-[11px] text-slate-600">
                      <T>Oben eine andere Saison wählen oder jemand anderen suchen.</T>
                    </p>
                  </div>
                ) : vglLinks && vglRechts ? (
                  <div className="space-y-5">
                    <DuellTafel links={vglLinks} rechts={vglRechts}
                      zeitraum={t('Saison {n}').replace('{n}', saisonTitel)}
                      aufKlick={oeffne} gross />

                    <section className="rounded-xl border border-zinc-800
                                        bg-zinc-950/60 p-5">
                      <div className="mb-2 flex flex-wrap items-baseline gap-4">
                        <p className="text-[10px] font-semibold uppercase
                                      tracking-[0.18em] text-slate-500">
                          <T>Stärkenprofil</T>
                        </p>
                        <span className="flex items-center gap-1.5 text-[11px]
                                         text-slate-400">
                          <span className="h-2 w-2 rounded-sm bg-slate-300" />
                          {grossName(vglLinks.anzeige, vglLinks.gepflegt)}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px]
                                         text-slate-400">
                          <span className="h-2 w-2 rounded-sm bg-sky-400" />
                          {grossName(vglRechts.anzeige, vglRechts.gepflegt)}
                        </span>
                        <span className="ml-auto text-[10px] text-slate-600">
                          <T>jede Achse am jeweils höheren Wert gemessen</T>
                        </span>
                      </div>
                      <Netz links={vglLinks} rechts={vglRechts}
                        namen={[vglLinks.anzeige, vglRechts.anzeige]} />
                    </section>

                    {/* Die Spieltage einzeln, nebeneinander.
                        Oben die Art des Turniers, rechts wie viele Zeilen -
                        beides wirkt auf beide Listen zugleich, sonst
                        vergliche man Verschiedenes. */}
                    {(() => {
                      const muster = TURNIER_ARTEN.find(([t]) => t === vglArt)?.[1];
                      const sieben = (zeilen: VerlaufZeile[]) => {
                        const gefiltert = muster
                          ? zeilen.filter((z) => muster.test(z.event)) : zeilen;
                        return vglWieViele === 0
                          ? gefiltert : gefiltert.slice(0, vglWieViele);
                      };
                      return (
                        <>
                          <div className="flex flex-wrap items-center gap-3 rounded-xl
                                          border border-zinc-800 bg-zinc-950/60 px-4
                                          py-3">
                            <span className="text-[10px] font-semibold uppercase
                                             tracking-[0.14em] text-slate-600"><T>Art</T></span>
                            <div className="flex flex-wrap gap-1">
                              {TURNIER_ARTEN.map(([titel]) => (
                                <button key={titel} onClick={() => setVglArt(titel)}
                                  className={`rounded-lg px-2.5 py-1 text-[11px]
                                              font-semibold transition ${vglArt === titel
                                    ? 'bg-sky-500/15 text-sky-400'
                                    : 'text-slate-500 hover:text-slate-300'}`}>
                                  {titel}
                                </button>
                              ))}
                            </div>
                            <span className="ml-auto text-[10px] font-semibold uppercase
                                             tracking-[0.14em] text-slate-600">
                              <T>Zeigen</T>
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {([['Letzte 5', 5], ['Letzte 10', 10],
                                 ['Letzte 20', 20], ['Alle', 0]] as
                                Array<[string, number]>).map(([titel, n]) => (
                                <button key={titel} onClick={() => setVglWieViele(n)}
                                  className={`rounded-lg px-2.5 py-1 text-[11px]
                                              font-semibold transition
                                              ${vglWieViele === n
                                    ? 'bg-sky-500/15 text-sky-400'
                                    : 'text-slate-500 hover:text-slate-300'}`}>
                                  {titel}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-5 lg:grid-cols-2">
                            <TurnierListe wer={vglLinks} farbe="hell"
                              zeilen={sieben(vglVerlaufLinks)} />
                            <TurnierListe wer={vglRechts} farbe="blau"
                              zeilen={sieben(vglVerlaufRechts)} />
                          </div>

                          {/* Der Verlauf steht unter den Listen und folgt
                              denselben beiden Filtern: wer oben "Letzte 10"
                              waehlt, sieht hier zehn Punkte. Sonst zeigte das
                              Bild etwas anderes als die Liste darueber. */}
                          {(() => {
                            const lz = [...sieben(vglVerlaufLinks)].reverse();
                            const rz = [...sieben(vglVerlaufRechts)].reverse();
                            if (lz.length < 2 && rz.length < 2) return null;
                            return (
                              <section className="rounded-xl border border-zinc-800
                                                  bg-zinc-950/60 p-5">
                                <div className="mb-1 flex flex-wrap items-baseline
                                                gap-3">
                                  <p className="text-[10px] font-semibold uppercase
                                                tracking-[0.18em] text-slate-500">
                                    <T>Eliminierungen je Spieltag</T>
                                  </p>
                                  <span className="text-[10px] text-slate-600">
                                    {lz.length} <T>gegen</T> {rz.length} <T>Spieltage, ältester links</T>
                                  </span>
                                </div>
                                <DoppelLinie
                                  beschriftung="Eliminierungen je Spieltag"
                                  links={lz.map((z) => z.werte.eliminations)}
                                  rechts={rz.map((z) => z.werte.eliminations)}
                                  marken={[
                            lz.map((z) => `${turnierName(z.event)} · ${z.region}`),
                            rz.map((z) => `${turnierName(z.event)} · ${z.region}`)]}
                                  namen={[vglLinks.anzeige, vglRechts.anzeige]} />
                              </section>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60
                                  px-6 py-16 text-center">
                    <p className="text-sm text-slate-500">
                      <T>Zwei Spieler wählen, um sie zu vergleichen.</T>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      <T>Hier sind alle Spieler der Saison wählbar, nicht nur die mit Foto.</T>
                    </p>
                  </div>
                )}
              </>
            );
          })()}

          {/* --------------------------------------------------- Bilder */}
          {bereich === 'bilder' && istAdmin && (() => {
            const eingabe = galerieSuche.trim();
            const mitFoto = galerie.filter((sp) => sp.echtesFoto);
            const ohneFoto = galerie.filter((sp) => !sp.echtesFoto);
            const grundmenge = galerieFilter === 'mit' ? mitFoto
              : galerieFilter === 'ohne' ? ohneFoto : galerie;

            /**
             * Gross geschrieben sucht nach Laendern, klein nach Namen.
             *
             * "DE,FR,GB" liefert alle aus Deutschland, Frankreich und
             * Grossbritannien. "de" dagegen sucht im Namen - und findet
             * DEMUS, DECKZEE, DEYMO. Die Unterscheidung an der
             * Grossschreibung festzumachen klingt zunaechst eigen, ist beim
             * Tippen aber der kuerzeste Weg: kein zweites Feld, kein
             * Umschalter, und Laenderkuerzel schreibt man ohnehin gross.
             */
            const laenderMuster = /^[A-Z]{2}(\s*,\s*[A-Z]{2})*$/;
            const nachLand = laenderMuster.test(eingabe);
            const laender = nachLand
              ? eingabe.split(',').map((x) => x.trim().toLowerCase())
              : [];
            const q = eingabe.toLowerCase();

            const zeigen = !eingabe ? grundmenge
              : nachLand
                ? grundmenge.filter((sp) =>
                  laender.includes((sp.land ?? '').toLowerCase()))
                : grundmenge.filter((sp) => sp.anzeige.toLowerCase().includes(q));
            return (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  {/* Beide Gruppen sind nach Eliminierungen ueber das ganze
                      Archiv sortiert: wer oben steht, fehlt am meisten. */}
                  <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
                    {([['mit', t('mit Bild · {n}')
                          .replace('{n}', zahl(mitFoto.length, 0, sprache))],
                       ['ohne', t('ohne Bild · {n}')
                          .replace('{n}', zahl(ohneFoto.length, 0, sprache))],
                       ['alle', t('alle · {n}')
                          .replace('{n}', zahl(galerie.length, 0, sprache))]] as
                      Array<['mit' | 'ohne' | 'alle', string]>).map(([w, t]) => (
                      <button key={w}
                        onClick={() => { setGalerieFilter(w); setGalerieMenge(400); }}
                        className={`rounded px-2.5 py-1 text-xs transition
                                    ${galerieFilter === w
                          ? 'bg-sky-500/15 text-sky-400'
                          : 'text-slate-500 hover:text-slate-300'}`}>
                        <T>{t}</T>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {nachLand
                      ? <><T>Länder</T>{' '}{laender.map((x) => x.toUpperCase()).join(', ')}</>
                      : <T>nach Eliminierungen über alle erfassten Spieltage, ab 20 Matches</T>}
                    {eingabe && zeigen.length !== grundmenge.length
                      && <> · {zahl(zeigen.length, 0, sprache)} <T>Treffer</T></>}
                  </p>
                  {/* Kein eigenes Suchfeld mehr: das oben in der Kopfzeile
                      filtert hier das Raster. */}
                </div>

                {!galerie.length ? (
                  <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {[...Array(16)].map((_, i) =>
                      <div key={i} className="aspect-[4/5] animate-pulse rounded-xl
                                              bg-zinc-900/60" />)}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {zeigen.slice(0, galerieMenge).map((sp, i) => (
                      <button key={sp.epicId} onClick={() => oeffne(sp)}
                        className="group overflow-hidden rounded-xl border border-zinc-800
                                   bg-zinc-950/60 text-left transition
                                   hover:border-sky-500">
                        <div className="relative aspect-[4/5] overflow-hidden
                                        bg-zinc-900">
                          {sp.bild ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sp.bild} alt="" loading="lazy"
                              className="h-full w-full object-cover object-top
                                         transition group-hover:scale-105" />
                          ) : (
                            /* Ohne Foto: kein leerer Kasten, sondern die Zahl,
                               die sagt, warum dieser Spieler hier oben steht. */
                            <div className="flex h-full flex-col items-center
                                            justify-center gap-1">
                              <span className="text-2xl font-bold tabular-nums
                                               text-zinc-700">
                                {zahl(sp.elims, 0, sprache)}
                              </span>
                              <span className="text-[9px] font-semibold uppercase
                                               tracking-[0.14em] text-zinc-800">
                                <T>Elims</T>
                              </span>
                            </div>
                          )}
                          <span className="absolute left-1.5 top-1.5 rounded
                                           bg-black/70 px-1.5 py-0.5 text-[9px]
                                           font-bold tabular-nums text-slate-400">
                            {i + 1}
                          </span>
                          {sp.heimat && (
                            <span className="absolute right-1.5 top-1.5 rounded
                                             bg-black/70 px-1.5 py-0.5 text-[9px]
                                             font-semibold tracking-wider
                                             text-slate-300">
                              {sp.heimat}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-2">
                          <TeamFlagge groesse={16} laender={[sp.land ?? undefined]} />
                          <span className="min-w-0 flex-1 truncate text-[11px]
                                           font-bold uppercase tracking-wide
                                           text-slate-100">
                            {grossName(sp.anzeige, sp.gepflegt)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {zeigen.length > galerieMenge && (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button onClick={() => setGalerieMenge((n) => n + 400)}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4
                                 py-2 text-xs font-semibold text-slate-300 transition
                                 hover:border-sky-500 hover:text-sky-400">
                      <T>Mehr laden</T>
                    </button>
                    <button onClick={() => setGalerieMenge(zeigen.length)}
                      className="text-xs text-slate-600 transition hover:text-slate-300">
                      <T>Alle zeigen</T>
                    </button>
                    <span className="text-[11px] text-slate-600">
                      {zahl(galerieMenge, 0, sprache)} <T>von</T> {zahl(zeigen.length, 0, sprache)}
                    </span>
                  </div>
                )}
              </>
            );
          })()}

          {/* --------------------------------------------------- Spieler */}
          {bereich === 'spieler' && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button onClick={() => setRegion('')}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${!region
                    ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                    : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                  <T>Alle</T>
                </button>
                {regionen.map((r) => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${region === r
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                    {r}
                  </button>
                ))}
                <select value={sort} onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5
                             text-xs text-slate-200 outline-none focus:border-sky-500">
                  {SORTIERUNG.map(([w, bez]) =>
                    <option key={w} value={w}>{t(bez)}</option>)}
                </select>
                <input value={suche} onChange={(e) => setSuche(e.target.value)}
                  placeholder={t('Spieler suchen …')}
                  className="ml-auto w-52 rounded-lg border border-zinc-800 bg-zinc-900/80
                             px-3 py-1.5 text-xs text-slate-100 outline-none
                             placeholder:text-slate-600 focus:border-sky-500" />
                <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
                  <button onClick={() => setTafel(true)}
                    className={`rounded px-2.5 py-1 text-xs transition ${tafel
                      ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500'}`}><T>Kacheln</T></button>
                  <button onClick={() => setTafel(false)}
                    className={`rounded px-2.5 py-1 text-xs transition ${!tafel
                      ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500'}`}><T>Liste</T></button>
                </div>
              </div>

              {fehler ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                              text-center text-sm text-rose-400">{fehler}</p>
              ) : laedt && !spieler.length ? (
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {[...Array(12)].map((_, i) =>
                    <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-900/60" />)}
                </div>
              ) : !gezeigteSpieler.length ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                              text-center text-sm text-slate-500">
                  {suche
                    ? t('Kein Spieler gefunden für „{q}“.').replace('{q}', suche)
                    : t('Keine Daten.')}
                </p>
              ) : tafel ? (
                /* Kartenraster wie im Vorbild: Bild, Regionsmarke darauf,
                   darunter Flagge und Name, ganz unten drei Kennzahlen. */
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {gezeigteSpieler.map((sp) => (
                    <button key={sp.epicId} onClick={() => oeffne(sp)}
                      className="group overflow-hidden rounded-xl border border-zinc-800
                                 bg-zinc-950/60 text-left transition
                                 hover:border-sky-500">
                      <div className="relative aspect-[4/5] overflow-hidden bg-zinc-900">
                        {sp.bild ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={sp.bild} alt="" loading="lazy"
                            className="h-full w-full object-cover object-top
                                       transition group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full items-center justify-center
                                          text-3xl text-zinc-700">?</div>
                        )}
                        <span className="absolute bottom-2 left-2 rounded bg-black/70
                                         px-1.5 py-0.5 text-[9px] font-semibold
                                         tracking-wider text-slate-300">
                          {sp.heimat || sp.regionen[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <TeamFlagge groesse={18} laender={[sp.land ?? undefined]} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold
                                         uppercase tracking-wide text-slate-100">
                          {grossName(sp.anzeige, sp.gepflegt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-px border-t border-zinc-800/60
                                      bg-zinc-800/60">
                        {([['Elims', zahl(sp.elims, 0, sprache)], ['Schaden', zahl(sp.damage, 0, sprache)],
                           ['Quote', zahl(sp.quote, 2, sprache)]] as Array<[string, string]>)
                          .map(([l, v]) => (
                            <div key={l} className="bg-zinc-950 px-2 py-1.5">
                              <p className="text-[8px] uppercase tracking-wider text-slate-600">
                                <T>{l}</T>
                              </p>
                              <p className="text-xs font-bold tabular-nums text-sky-400">{v}</p>
                            </div>
                          ))}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-800
                                bg-zinc-950/60">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] uppercase
                                       tracking-wider text-slate-500">
                          <th className="w-12 px-4 py-3 text-right font-medium">#</th>
                          <th className="px-3 py-3 text-left font-medium"><T>Spieler</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Matches</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Elims</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Schaden</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Quote</T></th>
                          <th className="px-3 py-3 text-right font-medium"><T>Kopftreffer</T></th>
                          <th className="px-4 py-3 text-right font-medium"><T>Treffer %</T></th>
                        </tr>
                      </thead>
                      <tbody>
                        {gezeigteSpieler.map((sp, i) => (
                          <tr key={sp.epicId} onClick={() => oeffne(sp)}
                            className="cursor-pointer border-b border-zinc-900 transition
                                       hover:bg-zinc-900/60">
                            <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                              i < 3 ? 'text-amber-400' : 'text-slate-600'}`}>{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <TeamFlagge groesse={20} laender={[sp.land ?? undefined]} />
                                <span className="truncate font-medium text-slate-200">
                                  {grossName(sp.anzeige, sp.gepflegt)}
                                </span>
                                <RegionMarke region={sp.heimat || sp.regionen.join('/')} />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                              {zahl(sp.matches, 0, sprache)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold tabular-nums
                                           text-sky-400">{zahl(sp.elims, 0, sprache)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                              {zahl(sp.damage, 0, sprache)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                              {zahl(sp.quote, 2, sprache)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                              {zahl(sp.headshots, 0, sprache)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                              {zahl(sp.genauigkeit, 1, sprache)} %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {gesamt > gezeigteSpieler.length && (
                <p className="mt-2 text-xs text-slate-600">
                  {zahl(gezeigteSpieler.length, 0, sprache)} <T>von</T> {zahl(gesamt, 0, sprache)} Spielern gezeigt.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Eine Kennzahl in voller Laenge - hinter dem Pluszeichen */}
      {volleListe && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70
                        p-4 sm:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) setVolleListe(null); }}>
          <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden
                          rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800
                               px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">
                <T>{volleListe.titel}</T>
                {volleListe.zusatz && (
                  <span className="ml-2 font-normal text-slate-500">
                    {volleListe.zusatz}
                  </span>
                )}
              </h3>
              <span className="text-xs text-slate-500">
                {zahl(volleListe.zeilen.length, 0, sprache)} <T>Spieler</T>
              </span>
              <div className="ml-auto flex items-center gap-1">
                {([50, 100, 0] as const).map((n) => (
                  <button key={n} onClick={() => setListenTiefe(n)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${
                      listenTiefe === n
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    {n === 0 ? 'Alle' : `Top ${n}`}
                  </button>
                ))}
                <button onClick={() => setVolleListe(null)}
                  className="ml-1 rounded-md border border-zinc-800 px-2.5 py-1 text-xs
                             text-slate-400 transition hover:border-rose-500/60
                             hover:text-rose-400">×</button>
              </div>
            </header>
            <div className="divide-y divide-zinc-900 overflow-y-auto">
              {(listenTiefe ? volleListe.zeilen.slice(0, listenTiefe) : volleListe.zeilen)
                .map((sp, i) => (
                  <Platz key={sp.epicId} nr={i + 1} s={sp}
                    wert={zahl(Number(sp[volleListe.feld]), volleListe.nachkomma, sprache)
                          + volleListe.einheit}
                    aufKlick={() => { setVolleListe(null); oeffne(sp); }} />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- Spielerseite */}
      {offen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) profilSchliessen(); }}>
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-xl
                          border border-zinc-800 bg-zinc-950 shadow-2xl">

            {/* Kopf */}
            <div className="flex flex-wrap items-center gap-3 px-7 pt-7">
              <TeamFlagge groesse={40} laender={[offen.land ?? undefined]} />
              <h2 className="text-3xl font-bold tracking-wide text-slate-50">
                {grossName(offen.anzeige, offen.gepflegt)}
              </h2>
              {(offen.heimat || offen.regionen?.[0]) && (
                <RegionMarke region={offen.heimat || offen.regionen[0]} />
              )}
              {offen.x && (
                <a href={`https://x.com/${offen.x}`} target="_blank" rel="noreferrer"
                  className="text-xs text-slate-500 transition hover:text-sky-400">
                  @{offen.x}
                </a>
              )}
              {/* Die Marken.
                  Sie erscheinen nur, wenn es sie zu diesem Spieler wirklich
                  gibt - wer nie eine FNCS gewonnen hat, bekommt hier auch
                  keinen leeren Kasten. Ein Druck darauf oeffnet die Liste
                  dahinter. */}
              <div className="ml-auto flex flex-wrap items-stretch gap-2">
                {(fncs?.titel ?? 0) > 0 && (
                  <button onClick={() => setMarke('fncs')}
                    className="rounded-lg border border-amber-500/50 bg-amber-500/10
                               px-3 py-2 text-center transition
                               hover:border-amber-400 hover:bg-amber-500/20">
                    <span className="flex items-center justify-center gap-0.5
                                     text-amber-400">
                      {[...Array(Math.min(fncs!.titel, 8))].map((_, i) =>
                        <Pokal key={i} />)}
                      {fncs!.titel > 8 && (
                        <span className="ml-1 text-[11px] font-bold">
                          ×{fncs!.titel}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[9px] font-semibold uppercase
                                     tracking-[0.16em] text-amber-400/90">
                      <T>FNCS-Sieger</T>
                    </span>
                  </button>
                )}

                {tagesbest.length > 0 && (
                  <button onClick={() => setMarke('tage')}
                    className="rounded-lg border border-sky-500/50 bg-sky-500/10
                               px-3 py-2 text-center transition
                               hover:border-sky-400 hover:bg-sky-500/20">
                    <span className="flex max-w-[132px] flex-wrap items-center
                                     justify-center gap-0.5 text-sky-400">
                      {[...Array(Math.min(tagesbest.length, 12))].map((_, i) =>
                        <Stern key={i} />)}
                      {tagesbest.length > 12 && (
                        <span className="ml-1 text-[11px] font-bold">
                          ×{tagesbest.length}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[9px] font-semibold uppercase
                                     tracking-[0.16em] text-sky-400/90">
                      <T>Tagesbester</T>
                    </span>
                  </button>
                )}

                {/* Hier stand die Karte "Bester Spieltag".
                    Sie ist weggefallen: direkt daneben zeigt die Marke
                    "Tagesbester" schon, an wie vielen Spieltagen niemand
                    mehr Eliminierungen hatte, und die Bestmarke selbst
                    steht weiter unten bei den Rekorden. Zweimal dieselbe
                    Aussage nebeneinander macht die Kopfzeile nur voller. */}
              </div>
              <button onClick={profilSchliessen}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs
                           text-slate-400 transition hover:border-sky-500/60
                           hover:text-sky-400">
                ← <T>Zurück</T>
              </button>
            </div>

            {/* Pflege - nur fuer den Admin */}
            {istAdmin && (
              <div className="mx-7 mt-4 flex flex-wrap items-center gap-2 rounded-lg
                              border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]
                                 text-slate-500"><T>Pflege</T></span>
                <input value={pflegeName}
                  onChange={(e) => { setPflegeName(e.target.value); setPflegeStand(''); }}
                  placeholder={t('Anzeigename')}
                  className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                             py-1.5 text-xs text-slate-100 outline-none
                             placeholder:text-slate-600 focus:border-sky-500" />
                <input value={pflegeLand}
                  onChange={(e) => { setPflegeLand(e.target.value); setPflegeStand(''); }}
                  placeholder={t('DE')} maxLength={2}
                  className="w-14 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                             py-1.5 text-xs uppercase text-slate-100 outline-none
                             placeholder:text-slate-600 focus:border-sky-500" />
                <button onClick={pflegeSpeichern}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold
                             text-white transition hover:bg-sky-400"><T>Speichern</T></button>
                {pflegeStand && (
                  <span className={`text-xs ${pflegeStand === 'gespeichert'
                    ? 'text-sky-400' : pflegeStand === 'nicht gespeichert'
                      ? 'text-rose-400' : 'text-slate-500'}`}>{pflegeStand}</span>
                )}
                {/* Nur ausblenden, nicht anlegen.
                    Werte, Platzierungen und Mitspieler kommen aus Epic und
                    der Quelle - von Hand eingetragene Zahlen koennte niemand
                    nachpruefen. Herausnehmen dagegen ist eine Entscheidung,
                    die nur der Admin treffen kann. */}
                {entfernenFrage ? (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      <T>Wirklich aus allen Listen nehmen?</T>
                    </span>
                    <button onClick={spielerVerstecken}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs
                                 font-semibold text-white transition
                                 hover:bg-rose-500">
                      <T>Ja, ausblenden</T>
                    </button>
                    <button onClick={() => setEntfernenFrage(false)}
                      className="text-xs text-slate-500 transition
                                 hover:text-slate-300">
                      <T>Abbrechen</T>
                    </button>
                  </span>
                ) : (
                  <>
                    <button onClick={() => setEntfernenFrage(true)}
                      title={t('Der Spieler verschwindet aus Listen, Suche und '
                        + 'Bildern. Seine Werte im Archiv bleiben erhalten.')}
                      className="ml-auto rounded-lg border border-zinc-800 px-3 py-1.5
                                 text-xs text-slate-500 transition
                                 hover:border-rose-500/60 hover:text-rose-400">
                      <T>Ausblenden</T>
                    </button>
                    <span className="text-[10px] text-slate-600">
                      <T>Konto</T> {offen.epicId.slice(0, 8)}…
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Bild und die grossen Zahlen.
                Die Zahlen stehen nebeneinander, getrennt durch senkrechte
                Linien statt in einem dichten Raster - so hat jede Zahl Luft
                um sich und die Reihe liest sich in einem Zug. */}
            <div className="flex flex-wrap gap-7 px-7 py-6">
              <div className="w-[215px] shrink-0">
                <div className="aspect-[4/5] overflow-hidden rounded-lg border
                                border-zinc-800 bg-zinc-900">
                  {offen.bild ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={offen.bild} alt=""
                      className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl
                                    text-zinc-700">?</div>
                  )}
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-600">
                  {offen.events
                    ? `${zahl(offen.events, 0, sprache)} ${t('Spieltage')}`
                      + ` · ${zahl(offen.matches, 0, sprache)} ${t('Matches')}`
                    : t('Werte werden geladen …')}
                </p>
              </div>

              {/* Die Kennzahlen des ganzen Zeitraums, nicht die eines Cups.
                  Das Vorbild fuehrt hier Rating, Power Ranking, Regional und
                  Global Ranking, Eliminierungen, Schaden und FNCS Grand
                  Finals. Drei davon gibt es hier nicht und stehen deshalb
                  auch nicht da: Rating und Power Ranking sind fremde
                  Berechnungen. An ihrer Stelle steht die Schadensquote, die
                  sich nachrechnen laesst. Die beiden Raenge sind abgezaehlt -
                  aus derselben Liste, die die Seite ohnehin fuehrt. */}
              <div className="flex min-w-0 flex-1 flex-wrap items-stretch">
                {([
                  /*
                   * Die Unterzeilen werden hier zusammengesetzt und muessen
                   * deshalb selbst uebersetzt werden - ein fertiger Satz
                   * geht an <T> vorbei. Genau daran lag es, dass hier noch
                   * "besser als 89 %", "von 1.705 in EU" und "2 Titel"
                   * standen, obwohl oben Englisch eingestellt war.
                   */
                  ['Schadensquote', zahl(offen.quote, 2, sprache),
                    perzentile
                      ? t('besser als {n} %').replace('{n}', String(perzentile.quote))
                      : t('ausgeteilt zu erlitten')],
                  ['Regionaler Rang', rang?.regional ? `#${rang.regional}` : '—',
                    rang?.regional
                      ? t('von {n} in {region}')
                        .replace('{n}', zahl(rang.regionalVon, 0, sprache))
                        .replace('{region}', rang.region)
                      : ''],
                  ['Globaler Rang', rang ? `#${rang.global}` : '—',
                    rang
                      ? t('von {n} Spielern').replace('{n}', zahl(rang.globalVon, 0, sprache))
                      : ''],
                  ['Eliminierungen', zahl(offen.elims, 0, sprache),
                    `${zahl(offen.elimsProMatch, 2, sprache)} ${t('je Match')}`],
                  ['Schaden', zahl(offen.damage, 0, sprache),
                    `${zahl(offen.damageProMatch, 0, sprache)} ${t('je Match')}`],
                  ['FNCS Grand Finals',
                    fncs ? String(fncs.saisons.filter((x) => x.platz > 0).length) : '—',
                    fncs && fncs.titel > 0
                      ? t('{n} Titel').replace('{n}', String(fncs.titel)) : ''],
                ] as Array<[string, string, string]>).map(([l, v, unten], i) => (
                  // Schmal genug, dass die Reihe in einer Zeile bleibt: bricht
                  // sie um, steht die letzte Zahl allein neben einer leeren
                  // Flaeche, und genau das sollte hier weg.
                  <div key={l}
                    className={`min-w-[112px] flex-1 basis-0 px-4 py-3 ${i > 0
                      ? 'border-l border-zinc-800' : ''}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]
                                  text-slate-500"><T>{l}</T></p>
                    <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-50">{v}</p>
                    {unten && (
                      <p className="mt-1 text-[10px] text-slate-600">{unten}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reiter, rechts daneben der Zeitraum.
                Dort steht beim Vorbild "Season" mit einem Waehler - genau
                dort sucht man ihn, weil die Zahlen darunter davon abhaengen. */}
            <div className="flex flex-wrap items-center gap-6 border-b border-zinc-800
                            px-7">
              {([['uebersicht', 'Übersicht'], ['leistung', 'Leistung'],
                 ['werte', 'Alle Werte'],
                 ['turniere', 'Turniere']] as Array<[SpielerReiter, string]>).map(([w, t]) => (
                <button key={w} onClick={() => setSpielerReiter(w)}
                  className={`-mb-px border-b-2 py-3 text-xs font-semibold uppercase
                              tracking-[0.12em] transition ${spielerReiter === w
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                  <T>{t}</T>
                </button>
              ))}

              <label className="ml-auto flex items-center gap-2 py-2">
                <span className="text-[10px] font-semibold uppercase
                                 tracking-[0.14em] text-slate-600">
                  <T>Zeitraum</T>
                </span>
                <select value={profilSaison}
                  onChange={(e) => profilZeitraum(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                             py-1.5 text-xs text-slate-100 outline-none
                             focus:border-sky-500">
                  <option value="alle">{t('Alle Saisons')}</option>
                  {saisons.map((x) => (
                    <option key={x.kennung} value={x.kennung}>{x.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="px-7 py-6">
              {/* Leise ueber allem: worueber wird hier gerechnet.
                  Nicht zum Lesen gedacht, sondern zum Nachsehen - wer sich
                  fragt, ob eine Zahl fuer eine Saison oder fuers ganze
                  Archiv gilt, findet die Antwort ohne zu suchen. */}
              <p className="mb-4 text-center text-[10px] tracking-[0.14em]
                            text-slate-700">
                {spielerReiter === 'leistung'
                  ? `${t('Vergleich über alle erfassten Spieltage')} · ${archivTitel}`
                  : `${profilSaison === 'alle' ? archivTitel
                    : (saisons.find((x) => x.kennung === profilSaison)?.name
                      ?? profilSaison)}`
                    + ` · ${zahl(verlauf.length, 0, sprache)} `
                    + `${t(verlauf.length === 1 ? 'Spieltag' : 'Spieltage')}`
                    + `${offen.matches ? ` · ${zahl(offen.matches, 0, sprache)} ${t('Matches')}` : ''}`}
              </p>
              {/* "Keine Zeilen" ist nicht dasselbe wie "wird noch geholt".
                  Vorher stand bei einem Spieler, der in dieser Saison gar
                  nicht angetreten ist, fuer immer "Wird geladen …" - und man
                  wartete auf etwas, das nie kommt. */}
              {profilLaedt ? (
                <p className="text-xs text-slate-600"><T>Wird geladen …</T></p>
              ) : !verlauf.length ? (
                <p className="py-6 text-center text-xs text-slate-600">
                  <T>In diesem Zeitraum ist dieser Spieler nicht angetreten.</T>
                </p>
              ) : spielerReiter === 'uebersicht' ? (
                <div className="space-y-7">
                  <section>
                    <p className="mb-3 text-[10px] font-semibold uppercase
                                  tracking-[0.18em] text-slate-500">
                      <T>Die letzten drei Turniere</T>
                      {heimatRegion && (
                        <span className="ml-2 font-normal tracking-normal
                                         text-slate-600">
                          {heimatRegion}
                        </span>
                      )}
                    </p>
                    {letzteDrei.length ? (
                      <VerlaufTabelle zeilen={letzteDrei} />
                    ) : (
                      /* Nur Ausfluege in fremde Regionen im Zeitraum. Sie
                         hier zu zeigen waere irrefuehrend - der Hinweis
                         sagt, wo sie stehen. */
                      <p className="py-4 text-xs text-slate-600">
                        <T>In der Heimatregion ist dieser Spieler hier nicht
                        angetreten — seine Spieltage in anderen Regionen stehen
                        unter „Turniere“.</T>
                      </p>
                    )}
                  </section>

                  {/* Die Werte als Zeilen in drei Spalten - dieselbe Form wie
                      im Vorbild, ruhiger als ein Raster aus Kaesten. */}
                  <section>
                    <div className="mb-3 flex items-baseline gap-3">
                      <p className="text-[10px] font-semibold uppercase
                                    tracking-[0.18em] text-slate-500"><T>Werte</T></p>
                      <span className="ml-auto text-[10px] text-slate-600">
                        über {zahl(offen.events, 0, sprache)} <T>Spieltage</T>
                      </span>
                    </div>
                    <div className="grid gap-x-8 rounded-lg border border-zinc-800
                                    bg-zinc-900/30 p-5 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        ['Eliminierungen', zahl(offen.elims, 0, sprache)],
                        ['Schaden', zahl(offen.damage, 0, sprache)],
                        ['Schaden erlitten', zahl(offen.damageTaken, 0, sprache)],
                        ['Schadensquote', zahl(offen.quote, 2, sprache)],
                        ['Treffer', zahl(offen.hits, 0, sprache)],
                        ['Schüsse', zahl(offen.shots, 0, sprache)],
                        ['Trefferquote', `${zahl(offen.genauigkeit, 1, sprache)} %`],
                        ['Kopftreffer', zahl(offen.headshots, 0, sprache)],
                        ['Assists', zahl(offen.assists, 0, sprache)],
                        ['Wiederbelebungen', zahl(offen.reboots, 0, sprache)],
                        ['Material', zahl(offen.mats, 0, sprache)],
                        ['Bauteile', zahl(offen.builds, 0, sprache)],
                        ['Heilung', zahl(offen.heals, 0, sprache)],
                        ['Sturmschaden', zahl(offen.stormDamage, 0, sprache)],
                        ['Matches', zahl(offen.matches, 0, sprache)],
                      ] as Array<[string, string]>).map(([l, v]) => (
                        <div key={l} className="flex items-baseline justify-between gap-4
                                                border-b border-zinc-900 py-2.5">
                          <span className="text-[11px] uppercase tracking-wider
                                           text-slate-500"><T>{l}</T></span>
                          <span className="text-sm font-semibold tabular-nums
                                           text-slate-100">{v}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <p className="mb-3 text-[10px] font-semibold uppercase
                                  tracking-[0.18em] text-slate-500">
                      <T>Beste Spieltage</T>
                      <span className="ml-2 font-normal normal-case tracking-normal
                                       text-slate-600"><T>nach Eliminierungen</T></span>
                    </p>
                    <div className="space-y-2">
                      {[...verlauf]
                        .sort((a, b) => b.werte.eliminations - a.werte.eliminations)
                        .slice(0, 3)
                        .map((z) => (
                          <div key={`best-${z.windowId}-${z.region}`}
                            className="flex items-center gap-4 rounded-lg border
                                       border-zinc-800 bg-zinc-900/30 px-5 py-3.5">
                            <span className="w-12 shrink-0 text-center text-2xl font-bold
                                             tabular-nums text-sky-400">
                              {z.werte.eliminations}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-slate-200">
                                {turnierName(z.event)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {z.season} · {z.region} · {z.werte.matchesPlayed} <T>Matches</T>
                              </p>
                            </div>
                            <span className="shrink-0 text-sm tabular-nums text-slate-400">
                              {zahl(Math.round(z.werte.damageDealt), 0, sprache)} <T>Schaden</T>
                            </span>
                          </div>
                        ))}
                    </div>
                  </section>
                </div>
              ) : spielerReiter === 'leistung' ? (
                <div className="space-y-7">
                  {/* Die drei Staerkefelder.
                      Der Wert eines Feldes ist der Schnitt seiner Raenge - und
                      darunter steht, woraus er entsteht. Nichts daran ist
                      gewichtet oder geheim. */}
                  {perzentile && (
                    <section>
                      <div className="mb-3 flex flex-wrap items-baseline gap-3">
                        <p className="text-[10px] font-semibold uppercase
                                      tracking-[0.18em] text-slate-500"><T>Stärkefelder</T></p>
                        <span className="ml-auto text-[10px] text-slate-600">
                          <T>Rang je Match unter</T> {zahl(perzentile.feldgroesse, 0, sprache)} <T>Spielern mit mindestens zehn Matches, über alle erfassten Spieltage</T>
                        </span>
                      </div>
                      <div className="grid gap-px overflow-hidden rounded-lg border
                                      border-zinc-800 bg-zinc-800/60 md:grid-cols-3">
                        {([
                          ['Feuerkraft', [['Eliminierungen', perzentile.elims],
                            ['Schaden', perzentile.damage],
                            ['Kopftreffer', perzentile.headshots],
                            ['Trefferquote', perzentile.genauigkeit]]],
                          ['Aufbau', [['Material', perzentile.mats],
                            ['Bauteile', perzentile.builds]]],
                          ['Überleben', [['Zeit am Leben', perzentile.timeAlive],
                            ['Schadensquote', perzentile.quote],
                            ['Wiederbelebungen', perzentile.reboots]]],
                        ] as Array<[string, Array<[string, number]>]>).map(([titel, teile]) => {
                          const schnitt = Math.round(
                            teile.reduce((n, t) => n + t[1], 0) / teile.length);
                          return (
                            <div key={titel} className="bg-zinc-950 p-5">
                              <p className="text-[10px] font-semibold uppercase
                                            tracking-[0.16em] text-slate-500"><T>{titel}</T></p>
                              <p className="mt-2 flex flex-wrap items-baseline gap-2">
                                <span className="text-4xl font-bold tabular-nums
                                                 text-sky-400">{schnitt}</span>
                                <span className="text-xs text-slate-600">/100</span>
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                <T>besser als</T> {schnitt} <T>Prozent des Feldes</T>
                              </p>
                              <div className="mt-3"><Balken wert={schnitt} /></div>
                              <div className="mt-4 space-y-2">
                                {teile.map((t) => (
                                  <div key={t[0]} className="flex items-center gap-3">
                                    <span className="w-28 shrink-0 text-[11px]
                                                     text-slate-500">{t[0]}</span>
                                    <span className="min-w-0 flex-1">
                                      <Balken wert={t[1]} klein />
                                    </span>
                                    <span className="w-7 shrink-0 text-right text-[11px]
                                                     font-semibold tabular-nums
                                                     text-slate-300">{t[1]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Der Verlauf ueber die Spieltage */}
                  {verlauf.length > 1 && (
                    <section>
                      <div className="mb-3 flex flex-wrap items-baseline gap-3">
                        <p className="text-[10px] font-semibold uppercase
                                      tracking-[0.18em] text-slate-500">
                          <T>Eliminierungen je Spieltag</T>
                        </p>
                        <span className="text-[11px] text-slate-500">
                          <T>höchstens</T> {Math.max(...verlauf.map((z) => z.werte.eliminations))}
                          {', mindestens '}
                          {Math.min(...verlauf.map((z) => z.werte.eliminations))}
                        </span>
                        <span className="ml-auto text-[10px] text-slate-600">
                          {verlauf.length} <T>Spieltage, ältester links</T>
                        </span>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                        <Verlaufslinie beschriftung="Eliminierungen je Spieltag"
                          werte={[...verlauf].reverse().map((z) => z.werte.eliminations)}
                          marken={[...verlauf].reverse().map((z) =>
                            `${turnierName(z.event)} · ${z.region}`)} />
                      </div>
                    </section>
                  )}

                  {/* Die Grand Finals */}
                  {fncs && fncs.saisons.some((x) => x.platz > 0) && (
                    <section>
                      <div className="mb-3 flex flex-wrap items-baseline gap-3">
                        <p className="text-[10px] font-semibold uppercase
                                      tracking-[0.18em] text-slate-500">
                          <T>FNCS Grand Finals</T>
                        </p>
                        {fncs.titel > 0 && (
                          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[11px]
                                           font-semibold text-amber-400">
                            {fncs.titel} Titel
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-slate-600">
                          <T>Platzierungen laut Quelle</T>
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {fncs.saisons.filter((x) => x.platz > 0).map((x) => (
                          <div key={x.saison}
                            className="flex items-center justify-between gap-3 rounded-lg
                                       border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
                            <span className="truncate text-[11px] text-slate-400">
                              {x.saison}
                            </span>
                            <span className={`shrink-0 text-sm font-bold tabular-nums ${
                              x.platz === 1 ? 'text-amber-400'
                                : x.platz <= 3 ? 'text-sky-400' : 'text-slate-300'}`}>
                              {x.platz}.
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Auszeichnungen.
                      Jede Zeile ist eine Abzaehlung aus den Daten, keine
                      vergebene Ehrung: darum steht unter jeder Zahl, woher
                      sie kommt. */}
                  {(() => {
                    const finals = fncs?.saisons.filter((x) => x.platz > 0) ?? [];
                    const besteElims = verlauf.length
                      ? Math.max(...verlauf.map((z) => z.werte.eliminations)) : 0;
                    const besterSchaden = verlauf.length
                      ? Math.max(...verlauf.map((z) => z.werte.damageDealt)) : 0;

                    const zeilen: Array<[string, string, string]> = [];
                    if (fncs && fncs.titel > 0) zeilen.push(
                      ['FNCS-Titel', String(fncs.titel), 'Siege in den Grand Finals']);
                    if (finals.length) zeilen.push(
                      ['Grand Finals', String(finals.length), 'erreichte Endrunden']);
                    const topZehn = finals.filter((x) => x.platz <= 10).length;
                    if (topZehn) zeilen.push(
                      ['Top 10 im Finale', String(topZehn), 'von ' + finals.length + ' Endrunden']);
                    if (besteElims) zeilen.push(
                      ['Bester Spieltag', String(besteElims), 'Eliminierungen an einem Tag']);
                    if (besterSchaden) zeilen.push(
                      ['Höchster Schaden', zahl(Math.round(besterSchaden), 0, sprache),
                        'an einem Spieltag']);
                    const meisteMatches = verlauf.length
                      ? Math.max(...verlauf.map((z) => z.werte.matchesPlayed)) : 0;
                    if (meisteMatches) zeilen.push(
                      ['Längster Spieltag', String(meisteMatches), 'Matches an einem Tag']);
                    if (!zeilen.length) return null;

                    return (
                      <section>
                        <div className="mb-3 flex flex-wrap items-baseline gap-3">
                          <p className="text-[10px] font-semibold uppercase
                                        tracking-[0.18em] text-slate-500">
                            <T>Auszeichnungen</T>
                          </p>
                          <span className="ml-auto text-[10px] text-slate-600">
                            <T>aus den Daten gezählt, nicht vergeben</T>
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {zeilen.map(([titel, wert, unten]) => (
                            <div key={titel}
                              className="rounded-lg border border-zinc-800
                                         bg-zinc-900/30 px-5 py-4">
                              <p className="text-[10px] font-semibold uppercase
                                            tracking-[0.16em] text-slate-500"><T>{titel}</T></p>
                              <p className="mt-1.5 text-2xl font-bold tabular-nums
                                            text-slate-50">{wert}</p>
                              <p className="mt-1 text-[10px] text-slate-600">{unten}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })()}

                  {!perzentile && !fncs && (
                    <p className="text-xs text-slate-600">
                      <T>Zu diesem Spieler liegen keine Vergleichswerte vor.</T>
                    </p>
                  )}
                </div>
              ) : spielerReiter === 'werte' ? (
                <div className="grid gap-x-8 rounded-lg border border-zinc-800
                                bg-zinc-900/30 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ['Eliminierungen', zahl(offen.elims, 0, sprache)],
                    ['Elims je Match', zahl(offen.elimsProMatch, 2, sprache)],
                    ['Assists', zahl(offen.assists, 0, sprache)],
                    ['Wiederbelebungen', zahl(offen.reboots, 0, sprache)],
                    ['Schaden', zahl(offen.damage, 0, sprache)],
                    ['Schaden je Match', zahl(offen.damageProMatch, 0, sprache)],
                    ['Schaden erlitten', zahl(offen.damageTaken, 0, sprache)],
                    ['Schadensquote', zahl(offen.quote, 2, sprache)],
                    ['Schüsse', zahl(offen.shots, 0, sprache)],
                    ['Treffer', zahl(offen.hits, 0, sprache)],
                    ['Trefferquote', `${zahl(offen.genauigkeit, 1, sprache)} %`],
                    ['Kopftreffer', zahl(offen.headshots, 0, sprache)],
                    ['Material', zahl(offen.mats, 0, sprache)],
                    ['Bauteile', zahl(offen.builds, 0, sprache)],
                    ['Heilung', zahl(offen.heals, 0, sprache)],
                    ['Sturmschaden', zahl(offen.stormDamage, 0, sprache)],
                    ['Fallschaden', zahl(offen.fallDamage, 0, sprache)],
                    ['Strecke', `${zahl(offen.distanz, 1, sprache)} km`],
                    ['Spieltage', zahl(offen.events, 0, sprache)],
                    ['Matches', zahl(offen.matches, 0, sprache)],
                  ] as Array<[string, string]>).map(([l, v]) => (
                    <div key={l} className="flex items-baseline justify-between gap-4
                                            border-b border-zinc-900 py-2.5">
                      <span className="text-[11px] uppercase tracking-wider
                                       text-slate-500"><T>{l}</T></span>
                      <span className="text-sm font-semibold tabular-nums
                                       text-slate-100">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Nach Saison gebuendelt, mit Banner darueber und der
                   Zusammenfassung darunter - so wie es das Vorbild fuehrt. */
                <div className="space-y-7">
                  {/* Der Umschalter fuer die Region.
                      Standard ist die Heimatregion - das ist die Laufbahn,
                      nach der jemand beurteilt wird. Wer einmal woanders
                      angetreten ist, findet das hinter dem Plus; steht dort
                      nichts, erscheint der Knopf gar nicht erst. */}
                  {heimatRegion && fremdeSpieltage > 0 && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setAlleRegionen(false)}
                        className={`rounded-lg border px-3 py-1.5 text-xs
                                    font-semibold transition ${!alleRegionen
                          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                          : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                        <T>Nur</T> {heimatRegion}
                      </button>
                      <button onClick={() => setAlleRegionen(true)}
                        className={`rounded-lg border px-3 py-1.5 text-xs
                                    font-semibold transition ${alleRegionen
                          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                          : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                        + <T>Alle Regionen</T>
                        <span className="ml-1.5 font-normal text-slate-600">
                          {fremdeSpieltage}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Nach Saison absteigend - Chapter 7 Season 4 zuerst,
                      dann rueckwaerts bis zur aeltesten im Archiv. */}
                  {[...new Set(turnierZeilen.map((z) => z.season))]
                    .sort((a, b) => saisonRang(b) - saisonRang(a))
                    .map((sn) => {
                    const zeilen = turnierZeilen.filter((z) => z.season === sn);
                    const bild = saisonBilder[sn];
                    const regionen = [...new Set(zeilen.map((z) => z.region))];
                    return (
                      <section key={sn}>
                        {/* Das Banner.
                            Das Bild kommt aus public/saisonbilder/ - liegt zu
                            der Saison keins da, steht dort ihre kurze
                            Schreibweise statt einer fremden Cup-Grafik. */}
                        <div className="mb-3 flex items-stretch gap-3 overflow-hidden
                                        rounded-lg border border-zinc-800
                                        bg-zinc-900/40">
                          {bild ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={bild} alt="" className="h-16 w-28 shrink-0
                                                              object-cover" />
                          ) : (
                            <div className="flex h-16 w-20 shrink-0 items-center
                                            justify-center border-r border-zinc-800
                                            bg-zinc-900/60 text-xs font-bold
                                            tracking-widest text-slate-600">
                              {saisonNamen[sn] ?? sn}
                            </div>
                          )}
                          <div className="min-w-0 flex-1 self-center py-2 pr-4">
                            <p className="truncate text-sm font-bold uppercase
                                          tracking-[0.14em] text-slate-100">
                              {kapitelName(saisonNamen[sn] ?? sn)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {zeilen.length} {zeilen.length === 1
                                ? 'Spieltag' : 'Spieltage'}
                              {' · '}{regionen.join(' · ')}
                            </p>
                          </div>
                        </div>
                        <VerlaufTabelle zeilen={zeilen} fuss />
                      </section>
                    );
                  })}
                </div>
              )}

              {(offen.namen?.length ?? 0) > 1 && (
                <p className="mt-7 border-t border-zinc-900 pt-4 text-[11px] text-slate-600">
                  <T>Trat an als</T> {offen.namen.slice(0, 6).map((n) => grossName(n)).join(' · ')}
                  {offen.namen.length > 6 && ` und ${offen.namen.length - 6} weiteren`}
                </p>
              )}
            </div>

            {/* Was hinter einer Marke steht.
                Ein eigenes Fenster ueber dem Profil, so wie beim Vorbild: die
                Liste der Siege, mit dem, was die jeweilige Quelle dazu
                hergibt. */}
            {marke && (
              <div className="fixed inset-0 z-[60] flex items-start justify-center
                              overflow-y-auto bg-black/80 p-4 sm:p-10"
                onClick={() => setMarke(null)}>
                <div className="w-full max-w-3xl rounded-xl border border-zinc-700
                                bg-zinc-950 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start gap-3 border-b border-zinc-800 px-6
                                  py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold uppercase tracking-[0.16em]
                                    text-slate-100">
                        {marke === 'fncs' ? 'FNCS-Siege' : 'Tagesbester'}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs
                                    text-slate-500">
                        <TeamFlagge groesse={16} laender={[offen.land ?? undefined]} />
                        {grossName(offen.anzeige, offen.gepflegt)}
                      </p>
                    </div>
                    <button onClick={() => setMarke(null)}
                      className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs
                                 text-slate-400 transition hover:border-rose-500/60
                                 hover:text-rose-400"><T>Schließen</T></button>
                  </div>

                  <div className="px-6 py-5">
                    {marke === 'fncs' ? (
                      <>
                        {/* Dieselben Spalten wie beim Vorbild. Gefuellt ist,
                            was das eigene Archiv hergibt - das reicht bis
                            CH7 S1 zurueck. Alles davor bleibt ein Strich,
                            statt eine Zahl zu erfinden. */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-zinc-800 text-[10px]
                                             uppercase tracking-wider text-slate-500">
                                <th className="px-2 py-2 text-left font-medium">
                                  <T>Saison</T>
                                </th>
                                <th className="px-2 py-2 text-left font-medium">
                                  <T>Turnier</T>
                                </th>
                                <th className="px-2 py-2 text-left font-medium">
                                  <T>Mitspieler</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Elims</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Schaden</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Bauteile</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Material</T>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {fncsSiege.map((x) => {
                                const strich = (
                                  <span className="text-slate-700">—</span>);
                                return (
                                  <tr key={x.saison}
                                    className="border-b border-zinc-900">
                                    <td className="whitespace-nowrap px-2 py-2.5">
                                      <span className="font-semibold text-slate-200">
                                        {x.saison}
                                      </span>
                                      <span className="ml-2 text-[10px]
                                                       font-bold text-amber-400">
                                        1.
                                      </span>
                                    </td>
                                    <td className="px-2 py-2.5 text-slate-300">
                                      {x.turnier ? turnierName(x.turnier) : strich}
                                    </td>
                                    <td className="px-2 py-2.5">
                                      {x.mitspieler?.length ? (
                                        <span className="flex flex-wrap items-center
                                                         gap-x-2 gap-y-1">
                                          {x.mitspieler.map((m) => (
                                            <span key={m.epicId}
                                              className="flex items-center gap-1">
                                              <TeamFlagge groesse={13}
                                                laender={[m.land ?? undefined]} />
                                              <span className="text-[11px]
                                                               text-slate-300">
                                                {grossName(m.name)}
                                              </span>
                                            </span>
                                          ))}
                                        </span>
                                      ) : strich}
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-bold
                                                   tabular-nums text-sky-400">
                                      {x.elims != null ? zahl(x.elims, 0, sprache) : strich}
                                    </td>
                                    <td className="px-2 py-2.5 text-right tabular-nums
                                                   text-slate-400">
                                      {x.damage != null ? zahl(x.damage, 0, sprache) : strich}
                                    </td>
                                    <td className="px-2 py-2.5 text-right tabular-nums
                                                   text-slate-400">
                                      {x.builds != null ? zahl(x.builds, 0, sprache) : strich}
                                    </td>
                                    <td className="px-2 py-2.5 text-right tabular-nums
                                                   text-slate-400">
                                      {x.mats != null ? zahl(x.mats, 0, sprache) : strich}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-4 border-t border-zinc-900 pt-3 text-[11px]
                                      text-slate-600">
                          <T>Saison und Platz stammen aus der offenen Spielerliste. Die Werte daneben kommen aus dem eigenen Archiv und gibt es nur ab CH7 S1 — ältere Titel bleiben deshalb leer. Ein Rating und die Mitspieler stehen in keiner der beiden Quellen.</T>
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-zinc-800 text-[10px]
                                             uppercase tracking-wider text-slate-500">
                                <th className="px-2 py-2 text-left font-medium">
                                  <T>Saison</T>
                                </th>
                                <th className="px-2 py-2 text-left font-medium">
                                  <T>Turnier</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Elims</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Schaden</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Bauteile</T>
                                </th>
                                <th className="px-2 py-2 text-right font-medium">
                                  <T>Material</T>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {tagesbest.map((t) => (
                                <tr key={t.windowId + t.region}
                                  className="border-b border-zinc-900">
                                  <td className="whitespace-nowrap px-2 py-2.5
                                                 text-slate-500">
                                    {t.saisonName}
                                    <span className="ml-1.5 text-[10px]
                                                     text-slate-600">{t.region}</span>
                                  </td>
                                  <td className="px-2 py-2.5 font-semibold
                                                 text-slate-200">
                                    {turnierName(t.event)}
                                  </td>
                                  <td className="px-2 py-2.5 text-right font-bold
                                                 tabular-nums text-sky-400">
                                    {t.elims}
                                  </td>
                                  <td className="px-2 py-2.5 text-right tabular-nums
                                                 text-slate-400">
                                    {zahl(t.damage, 0, sprache)}
                                  </td>
                                  <td className="px-2 py-2.5 text-right tabular-nums
                                                 text-slate-400">
                                    {zahl(t.builds, 0, sprache)}
                                  </td>
                                  <td className="px-2 py-2.5 text-right tabular-nums
                                                 text-slate-400">
                                    {zahl(t.mats, 0, sprache)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-4 border-t border-zinc-900 pt-3 text-[11px]
                                      text-slate-600">
                          <T>Spieltage, an denen niemand mehr Eliminierungen hatte — gezählt über alle</T> {zahl(tagesbest.length, 0, sprache)} <T>Treffer im eigenen Archiv. Bei Gleichstand zählt es für alle, die oben stehen.</T>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </main>
  );
}
