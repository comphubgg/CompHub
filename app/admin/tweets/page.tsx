'use client';

// Beitragsvorlagen fuer X/Twitter: Cup waehlen, Vorlage waehlen, fertigen
// Text kopieren und die passende Grafik als PNG herunterladen.
//
// Alle Zahlen stammen aus Epics Turnierdaten. Kennzahlen, die Epic zu einem
// Turnier nicht mitschickt, tauchen hier gar nicht erst auf - es wird nichts
// geschaetzt und nichts ergaenzt.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MARKE } from '@/lib/marke';
import { kernname, namensSchluessel } from '@/lib/homoglyph';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { speichereAdresse, speichereLeinwand } from '@/app/lib/bildSpeichern';
interface Fenster {
  status: string; begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string; istFinale: boolean;
}
interface Cup {
  id: string; titel: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  live: boolean; vorbei: boolean;
  naechsterStart: number | null; letzterStart: number | null;
}
interface Platz {
  rank: number; spieler: string[]; wert: number; roh: number;
  /** Epic-Konto-IDs in derselben Reihenfolge wie die Namen. */
  ids?: string[];
}
interface Bestenliste {
  schluessel: string; titel: string; symbol: string;
  einheit: string | null;
  /** Die Spitze - das, was auf der Kachel steht. */
  plaetze: Platz[];
  /** Das ganze Feld in derselben Sortierung. Fuellt die Vollansicht. */
  alle?: Platz[];
}
interface Stats {
  teams: number; spiele: number;
  bestenlisten: Bestenliste[]; geliefert: string[];
}
interface Eintrag {
  rank: number; points: number; elims: number; games: number;
  /**
   * Gewonnene Runden.
   *
   * Kommt direkt von Epic: gezaehlt werden die Spiele mit Platz eins, dazu
   * Epics eigener Sieg-Zaehler. Nichts daran ist gerechnet oder geschaetzt.
   */
  wins: number;
  /**
   * Die einzelnen Runden dieses Spieltags.
   *
   * Gebraucht fuer die Frage, in welchem Spiel ein Sieg gefallen ist. Die
   * Kennung der Runde ist bei allen Teams dieselbe - darueber laesst sich
   * eine lobbyweite Nummer bilden, statt jedem Team eine eigene zu geben.
   */
  matches?: Array<{ sessionId?: string; endTime?: string; placement?: number }>;
  /** Die beste Platzierung des Tages. Null, wenn Epic keine mitschickt. */
  bestPlace?: number | null;
  players: Array<{ name: string; id?: string }>;

  // Die uebrigen Werte, die Epic je Eintrag mitschickt. Bei einem Duo sind es
  // Teamsummen; bei einem Solo-Cup besteht der Eintrag aus einem Spieler,
  // dann sind es dessen eigene Zahlen. Genau das nutzt der Rueckfall weiter
  // unten aus.
  damage?: number;
  damageTaken?: number;
  headshots?: number;
  timeAlive?: number;
  matsGefarmt?: number;
  matsVerbaut?: number;
  /** Zu Fuss zurueckgelegte Strecke in Zentimetern. */
  strecke?: number;
  kisten?: number;
  heilung?: number;
  schild?: number;
  kd?: number;
  avgPlace?: number;
}

interface SpielerWert {
  name: string; epicId: string;
  elims: number; assists: number; reboots: number; headshots: number; hits: number;
  damage: number; damageTaken: number; quote: number; heals: number;
  genauigkeit: number; distanzGesamt: number; shots: number;
  stormDamage: number; fallDamage: number; mats: number; builds: number;
  distanz: number; timeInStorm: number; timeAlive: number; matches: number;

  // Diese fuehrt nur Epic, nicht die Szene-Quelle: Punkte, Siege, K/D und
  // Durchschnittsplatz ergeben sich aus der Wertung des Turniers, nicht aus
  // dem Verlauf eines Matches. Sie bleiben deshalb wahlfrei - wo sie fehlen,
  // faellt die zugehoerige Liste aus der Auswahl heraus.
  points?: number; wins?: number; kd?: number; avgPlace?: number;
  kisten?: number; matsVerbaut?: number;

  // Diese beiden stehen nur im Verlauf eines Matches und kommen deshalb aus
  // den eigenen Replays, nicht von der Szene-Quelle. Wo keine Aufzeichnung
  // vorliegt, bleiben sie leer und ihre Listen fallen aus der Auswahl.
  knocks?: number; gestorben?: number;
}
interface SpielerDaten {
  vorhanden: boolean; quelle: string; turnier?: string;
  region?: string; matches?: number; spieler: SpielerWert[]; hinweis?: string;
  /** Zu welchem Spieltag diese Antwort gehoert. */
  fuer?: string;
}

/** Kennzahlen der Einzelwertung - dieselbe Auswahl wie in den Szene-Beitraegen. */
const SPIELER_KENNZAHLEN: Array<{
  schluessel: keyof SpielerWert | 'quoteNiedrig'; titel: string; symbol: string;
  einheit?: string; nachkomma?: number;
  /** Bei "Lowest Rated" gewinnt der kleinste Wert. */
  kleinBesser?: boolean;
}> = [
  // Selbst gerechnet: ausgeteilter geteilt durch erlittenen Schaden - beide
  // Werte stehen so in der Quelldatei. Der Titel sagt die Rechnung ausdruecklich
  // dazu, denn eucompetitive zeigt auf der eigenen Seite unter "Rated" eine
  // andere Zahl: deren Bewertung folgt einer eigenen, nicht veroeffentlichten
  // Formel und steht in keiner der offenen Dateien. Gleicher Name fuer zwei
  // verschiedene Rechnungen waere irrefuehrend.
  // Zuerst das, was den Cup entscheidet. Bei einem Solo-Cup ist Epics
  // Eintrag ein Spieler, also gelten Punkte, Siege, K/D und Durchschnittsplatz
  // hier genauso wie in der Teamwertung. Bei der Szene-Quelle fehlen sie -
  // dann bleiben diese Listen einfach leer.
  { schluessel: 'points',      titel: 'Most Points',         symbol: '🏆' },
  { schluessel: 'wins',        titel: 'Most Victory Royales', symbol: '👑' },
  { schluessel: 'kd',          titel: 'Best K/D',            symbol: '⚔️', nachkomma: 2 },
  { schluessel: 'avgPlace',    titel: 'Best Average Placement', symbol: '📍',
    nachkomma: 1, kleinBesser: true },
  { schluessel: 'quote',       titel: 'Best Damage Ratio',   symbol: '🟢', nachkomma: 2 },
  { schluessel: 'quoteNiedrig', titel: 'Lowest Damage Ratio', symbol: '🔻', nachkomma: 2,
    kleinBesser: true },
  { schluessel: 'elims',       titel: 'Most Eliminations',   symbol: '🎯' },
  // Nur aus Replays - siehe SpielerWert.
  { schluessel: 'knocks',      titel: 'Most Knocks',         symbol: '🥊' },
  { schluessel: 'gestorben',   titel: 'Most Deaths',         symbol: '⚰️' },
  { schluessel: 'headshots',   titel: 'Most Headshots',      symbol: '💀' },
  { schluessel: 'hits',        titel: 'Most Hits to Players', symbol: '🔫' },
  { schluessel: 'damage',      titel: 'Most Damage Dealt',   symbol: '📈' },
  { schluessel: 'damageTaken', titel: 'Most Damage Taken',   symbol: '📉' },
  { schluessel: 'assists',     titel: 'Most Assists',        symbol: '🤝' },
  { schluessel: 'reboots',     titel: 'Most Reboots & Revives', symbol: '🚑' },
  { schluessel: 'fallDamage',  titel: 'Most Fall Damage',    symbol: '🪂' },
  { schluessel: 'mats',        titel: 'Most Mats Farmed',    symbol: '🧱' },
  // Verbautes Material und gesetzte Bauteile sind zweierlei und stammen aus
  // zwei verschiedenen Quellen - deshalb zwei getrennte Zeilen mit zwei
  // verschiedenen Namen.
  { schluessel: 'matsVerbaut', titel: 'Most Mats Used',      symbol: '🪚' },
  { schluessel: 'builds',      titel: 'Most Builds Placed',  symbol: '🔨' },
  { schluessel: 'kisten',      titel: 'Most Chests Opened',  symbol: '📦' },
  { schluessel: 'heals',       titel: 'Most Healing Done',   symbol: '💊' },
  { schluessel: 'distanz',     titel: 'Most Distance on Foot', symbol: '🏃', einheit: 'km', nachkomma: 1 },
  { schluessel: 'timeInStorm', titel: 'Most Time in Storm',  symbol: '🌪️', einheit: 'min' },
  { schluessel: 'timeAlive',   titel: 'Most Time Alive',     symbol: '⏱️', einheit: 'min' },
  { schluessel: 'stormDamage', titel: 'Most Storm Damage',   symbol: '⛈️' },
  { schluessel: 'genauigkeit', titel: 'Best Accuracy',       symbol: '🔎', einheit: '%',
    nachkomma: 1 },
  // Zu Fuss plus Gleiter - die Quelle fuehrt beide Strecken getrennt.
  { schluessel: 'distanzGesamt', titel: 'Most Distance (Foot + Air)', symbol: '🧭',
    einheit: 'km', nachkomma: 1 },
];

type Vorlage = 'rueckblick' | 'qualifiziert' | 'endstand' | 'spieler'
  | 'bestenliste' | 'spielerkarte' | 'auswahl'
  /* Ohne Cup: freier Titel, Spieler von Hand. */
  | 'eigene';

/**
 * Was eine Auswahl ausser dem einzelnen Team noch braucht.
 *
 * Manche Fragen lassen sich nur im Vergleich beantworten - "wer hat jede
 * Runde gespielt?" haengt davon ab, wie viele Runden es ueberhaupt gab.
 * Alles hier kommt aus den Turnierdaten des Spieltags.
 */
interface AuswahlHilfe {
  /** Das ganze Feld dieses Spieltags. */
  feld: Eintrag[];
  /** Die gewonnenen Runden eines Teams, etwa "Game 3" oder "Games 2 + 7". */
  siegRunden: (e: Eintrag) => string;
  /** Die Nummer der Runde, in der dieses Spiel endete. */
  rundeVon: (m: { sessionId?: string; endTime?: string }) => number | undefined;
  /**
   * Der Schaden dieses Teams - summiert ueber seine Spieler.
   *
   * Kommt aus den Einzelwerten der Szene-Quelle, die Epics Turnierdaten nicht
   * fuehren. Null, wo zu keinem Spieler des Teams etwas vorliegt.
   */
  schadenVon: (e: Eintrag) => number | null;
}

/**
 * Eine Auswahl von Teams, die auf eine Bedingung passen.
 *
 * Anders als der Endstand, der einfach die ersten N Plaetze nimmt, greift
 * hier eine Frage ans Feld heraus: "wer hat ueberhaupt mal gewonnen?", "wer
 * steht ueber zweihundert Punkten?". Herausgesucht wird immer aus den
 * echten Turnierdaten, und es wird nichts abgeschnitten - wer die Bedingung
 * erfuellt, steht drin.
 */
interface Auswahl {
  /** Ueberschrift des Beitrags, ohne die Anzahl. */
  titel: string;
  /** Gehoert dieses Team dazu? */
  passt: (e: Eintrag, h: AuswahlHilfe) => boolean;
  /** Was hinter dem Team steht. */
  wert: (e: Eintrag, h: AuswahlHilfe) => string;
  /** Wonach absteigend sortiert wird. Gleichstand entscheidet der Platz. */
  nach: (e: Eintrag, h: AuswahlHilfe) => number;
  /**
   * Hoechstens so viele Zeilen.
   *
   * Die meisten Auswahlen fragen "wer erfuellt das?" und wollen jeden
   * Treffer sehen - dort bleibt das Feld leer. "top 10 elims" fragt aber
   * nach den zehn Besten, nicht nach allen mit zehn oder mehr; ohne diese
   * Grenze standen dort hundert Zeilen.
   */
  grenze?: number;
  /**
   * Eine Bestenliste einzelner Spieler statt der Duos.
   *
   * Bei einer Frage wie "top 10 elims" ist der einzelne Spieler gemeint, nie
   * das Duo - eine Bestenliste, in der zwei Namen einen Wert teilen, sagt
   * ueber keinen der beiden etwas aus. Steht hier ein Feld, wird die Liste
   * aus den Einzelwerten gebaut und nicht aus der Teamwertung.
   */
  soloFeld?: keyof SpielerWert;
  /** Was in Klammern dahinter steht - meist der Schaden. */
  soloKlammer?: keyof SpielerWert;
  /** Wie die Klammer in der Ueberschrift heisst. */
  soloKlammerTitel?: string;
  /** Die Einheit des Hauptwerts, wo es eine gibt. */
  soloEinheit?: string;
  soloNachkomma?: number;
}

/** Die groesste Rundenzahl im Feld - so viele Runden gab es an diesem Tag. */
function rundenZahl(feld: Eintrag[]) {
  return feld.reduce((n, e) => Math.max(n, e.games), 0);
}

/** Die erste Zahl im Befehl, sonst der Standardwert. */
function zahlIm(text: string, standard: number) {
  const m = text.match(/\b(\d{1,4})\b/);
  return m ? +m[1] : standard;
}

/**
 * Die Kurzbefehle, die eine solche Auswahl beschreiben.
 *
 * Bewusst als Tabelle: so steht an einer Stelle, was es gibt, ein weiterer
 * Befehl ist eine Zeile mehr, und die Befehlsuebersicht kann sie einfach
 * aufzaehlen. Die Reihenfolge zaehlt - "no wins" enthaelt das Wort "wins"
 * und muss deshalb vorher geprueft werden.
 */
const AUSWAHLBEFEHLE: Array<{
  beispiel: string;
  erklaerung: string;
  deute: (text: string) => Auswahl | null;
}> = [
  /*
   * Ein Befehl je Groesse, Varianten ueber Zahl und Verneinung.
   *
   * Vorher standen hier fuenfzehn Zeilen, von denen mehrere dasselbe in
   * anderen Worten taten: "no elims" war die Schwelle null, "zero points"
   * dasselbe bei den Punkten, und "played all games" und "missed games"
   * waren die zwei Seiten derselben Muenze. Jetzt traegt jede Groesse genau
   * einen Namen, und ob null, ab zwanzig oder verneint entscheidet der
   * Zusatz.
   *
   * Die Reihenfolge zaehlt weiterhin: was enger gefasst ist, muss vorher
   * geprueft werden, sonst verschluckt der allgemeine Befehl den engeren.
   */

  /* --------------------------------------------- die einzelne Runde */
  {
    beispiel: 'game 3 winner',
    erklaerung: 'eine bestimmte Runde — "game 3 winner" oder "game 3 top 5"',
    deute: (t) => {
      const m = t.match(/\b(?:game|runde|spiel)\s*(\d{1,2})\b/);
      if (!m) return null;
      const n = +m[1];
      const bis = t.match(/\btop\s*(\d{1,3})\b/);
      const sieg = /\b(winner|sieger|won|gewonnen)\b/.test(t);
      if (!sieg && !bis) return null;

      // "game 3 top 5" ist dieselbe Frage mit weiterer Schwelle - deshalb
      // ein Befehl mit zwei Auspraegungen statt zweier Befehle.
      const grenze = sieg && !bis ? 1 : Math.max(1, Math.min(100, +bis![1]));
      return {
        titel: grenze === 1 ? `Game ${n} — the win` : `Game ${n} — top ${grenze}`,
        passt: (e, h) => (e.matches ?? []).some(
          (x) => (x.placement ?? 999) <= grenze && h.rundeVon(x) === n),
        wert: (e) => `${e.points} pts overall`,
        nach: (e) => -e.rank,
      };
    },
  },
  {
    beispiel: 'game by game',
    erklaerung: 'alle Sieger, geordnet nach der Runde ihres ersten Siegs',
    deute: (t) => (/\b(game\s*by\s*game|runde\s*fuer\s*runde|jede\s+runde)\b/.test(t)
      ? {
        titel: 'Who won which game',
        passt: (e) => e.wins > 0,
        wert: (e, h) => h.siegRunden(e) || `${e.wins} VR`,
        // Negativ, weil absteigend sortiert wird: so steht Runde eins oben.
        nach: (e, h) => -Math.min(...(e.matches ?? [])
          .filter((m) => m.placement === 1)
          .map((m) => h.rundeVon(m) ?? 99), 99),
      } : null),
  },

  /* ------------------------------------------- Verlauf ueber den Tag */
  {
    beispiel: 'strong finish',
    erklaerung: 'wer in der zweiten Tageshälfte deutlich besser lief — "slow start" für das Gegenteil',
    deute: (t) => {
      const stark = /\b(strong\s*finish|starkes?\s*ende|aufholjagd|comeback)\b/.test(t);
      const schwach = /\b(slow\s*start|schwacher?\s*start|eingebrochen|drop\s*off)\b/.test(t);
      if (!stark && !schwach) return null;

      /*
       * Der Vergleich laeuft ueber die Platzierungen: erste Haelfte des Tages
       * gegen zweite. Eine Verbesserung um mindestens drei Plaetze im Schnitt
       * gilt als Aufholjagd - darunter ist es Rauschen.
       *
       * Gerechnet wird nur, wo mindestens vier Runden vorliegen. Bei zwei
       * Spielen waere "erste gegen zweite Haelfte" ein einzelnes Spiel
       * gegen ein einzelnes, und ein Ausreisser entschiede alles.
       */
      const halften = (e: Eintrag) => {
        const p = (e.matches ?? [])
          .map((m) => m.placement)
          .filter((x): x is number => typeof x === 'number');
        if (p.length < 4) return null;
        const mitte = Math.floor(p.length / 2);
        const schnitt = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
        return schnitt(p.slice(0, mitte)) - schnitt(p.slice(mitte));
      };

      return {
        titel: stark ? 'Woke up in the back half' : 'Faded after a strong start',
        passt: (e) => {
          const d = halften(e);
          if (d === null) return false;
          return stark ? d >= 3 : d <= -3;
        },
        wert: (e) => {
          const d = halften(e) ?? 0;
          const z = Math.abs(Math.round(d * 10) / 10);
          return `${z} places ${stark ? 'better' : 'worse'}`;
        },
        nach: (e) => (stark ? 1 : -1) * (halften(e) ?? 0),
      };
    },
  },
  {
    beispiel: 'consistent',
    erklaerung: 'wer nie unter eine Platzierung fiel — "consistent top 20"',
    deute: (t) => {
      if (!/\b(consistent|konstant|nie\s+schlechter|never\s+below)\b/.test(t)) return null;
      const m = t.match(/\b(?:top\s*)?(\d{1,3})\b/);
      const grenze = m ? Math.max(1, Math.min(100, +m[1])) : 20;
      return {
        titel: `Never dropped out of the top ${grenze}`,
        passt: (e) => {
          const p = (e.matches ?? [])
            .map((x) => x.placement)
            .filter((x): x is number => typeof x === 'number');
          // Ohne Rundendaten laesst sich nichts belegen - dann faellt der
          // Eintrag heraus, statt als "konstant" durchzugehen.
          return p.length >= 3 && p.every((x) => x <= grenze);
        },
        wert: (e) => `worst ${Math.max(...(e.matches ?? [])
          .map((x) => x.placement ?? 0))}`,
        nach: (e) => -Math.max(...(e.matches ?? []).map((x) => x.placement ?? 0)),
      };
    },
  },

  /* ------------------------------------------------ die Bestenliste */
  {
    beispiel: 'best 10 elims',
    erklaerung: 'die besten N einzelnen Spieler — nach Elims, Schaden, Material, Waffe …',
    deute: (t) => {
      /*
       * "best 10 elims" heisst: die zehn besten SPIELER.
       *
       * Frueher hiess dieser Befehl "top 10 elims" - und damit bedeutete
       * "top 10" zweierlei: hier eine Bestenliste, im Befehl darunter eine
       * Platzierung. Zwei Bedeutungen fuer dasselbe Wort sind eine Falle,
       * deshalb heisst die Bestenliste jetzt "best".
       */
      const m = t.match(/\b(?:best|beste[nr]?)\s*(\d{1,3})\b/);
      if (!m) return null;

      const n = Math.max(1, Math.min(100, +m[1]));
      const felder: Array<{
        r: RegExp; feld: keyof SpielerWert; titel: string;
        einheit?: string; nachkomma?: number;
      }> = [
        { r: /\b(elims?|eliminations?|kills?)\b/, feld: 'elims', titel: 'Most Eliminations' },
        { r: /\b(damage|schaden|dmg)\b/, feld: 'damage', titel: 'Most Damage' },
        { r: /\b(headshots?|kopftreffer)\b/, feld: 'headshots', titel: 'Most Headshots' },
        { r: /\b(mats|material)\b/, feld: 'mats', titel: 'Most Mats Farmed' },
        { r: /\b(builds?|bauteile)\b/, feld: 'builds', titel: 'Most Builds Placed' },
        { r: /\b(assists?)\b/, feld: 'assists', titel: 'Most Assists' },
        { r: /\b(hits?|treffer)\b/, feld: 'hits', titel: 'Most Hits' },
        { r: /\b(distance|strecke)\b/, feld: 'distanzGesamt',
          titel: 'Most Distance', einheit: 'km', nachkomma: 1 },
        { r: /\b(accuracy|genauigkeit|trefferquote)\b/, feld: 'genauigkeit',
          titel: 'Best Accuracy', einheit: '%', nachkomma: 1 },
        { r: /\b(points?|punkte|pts)\b/, feld: 'points', titel: 'Most Points' },
      ];
      const gewaehlt = felder.find((f) => f.r.test(t));
      if (!gewaehlt) return null;

      return {
        titel: gewaehlt.titel,
        passt: () => true,
        wert: () => '',
        nach: () => 0,
        grenze: n,
        soloFeld: gewaehlt.feld,
        soloKlammer: gewaehlt.feld === 'damage' ? 'elims' : 'damage',
        soloKlammerTitel: gewaehlt.feld === 'damage' ? 'Elims' : 'Damage',
        soloEinheit: gewaehlt.einheit,
        soloNachkomma: gewaehlt.nachkomma,
      };
    },
  },

  /* -------------------------------------------------- Platzierungen */
  {
    beispiel: 'top 10',
    erklaerung: 'wer eine Platzierung erreicht hat — "never top 10" für das Gegenteil',
    deute: (t) => {
      const m = t.match(/\btop\s*(\d{1,3})\b/);
      if (!m) return null;
      /*
       * "game 3 top 5" und "consistent top 20" gehoeren den Befehlen weiter
       * oben. Ohne diesen Ausschluss traefe dieselbe Eingabe zwei Befehle -
       * die Reihenfolge rettete es zwar, aber darauf soll sich nichts
       * verlassen muessen.
       */
      if (/\b(game|runde|spiel)\s*\d/.test(t)) return null;
      if (/\b(consistent|konstant|nie\s+schlechter|never\s+below)\b/.test(t)) return null;
      const n = Math.max(1, Math.min(100, +m[1]));
      const nie = /\b(never|nie|kein\w*|no)\b/.test(t);
      return {
        titel: nie ? `Never reached the top ${n}` : `Reached the top ${n}`,
        passt: (e) => {
          const traf = (e.matches ?? [])
            .some((x) => (x.placement ?? 999) <= n);
          return nie ? !traf : traf;
        },
        wert: (e) => `${e.points} pts`,
        nach: (e) => e.points,
      };
    },
  },

  /* ------------------------------------------------- die Kennzahlen */
  {
    beispiel: '4 elims per game',
    erklaerung: 'ein Schnitt je Runde — aus der Gesamtzahl geteilt durch die Runden',
    deute: (t) => {
      if (!/\b(per\s*game|je\s*runde|pro\s*spiel|average|schnitt)\b/.test(t)) return null;
      const m = t.match(/(\d+(?:[.,]\d+)?)/);
      if (!m) return null;
      const schwelle = parseFloat(m[1].replace(',', '.'));
      const schaden = /\b(damage|schaden|dmg)\b/.test(t);
      return {
        titel: schaden
          ? `${schwelle}+ damage per game`
          : `${schwelle}+ eliminations per game`,
        passt: (e, h) => {
          if (!e.games) return false;
          const wert = schaden ? (e.damage ?? h.schadenVon(e) ?? 0) : e.elims;
          return wert / e.games >= schwelle;
        },
        wert: (e, h) => {
          const wert = schaden ? (e.damage ?? h.schadenVon(e) ?? 0) : e.elims;
          return `${(wert / Math.max(1, e.games)).toFixed(1)} per game`;
        },
        nach: (e, h) => {
          const wert = schaden ? (e.damage ?? h.schadenVon(e) ?? 0) : e.elims;
          return wert / Math.max(1, e.games);
        },
      };
    },
  },
  {
    beispiel: '20 elims',
    erklaerung: 'ab dieser Zahl an Eliminierungen — "no elims" für null',
    deute: (t) => {
      if (!/\b(elims?|eliminations?|kills?)\b/.test(t)) return null;
      if (/\b(per\s*game|je\s*runde|best|beste[nr]?)\b/.test(t)) return null;
      const nichts = /\b(no|zero|keine?|ohne|null)\s+(elims?|eliminations?|kills?)\b/.test(t);
      const m = t.match(/\b(\d{1,3})\b/);
      if (!nichts && !m) return null;
      const schwelle = nichts ? 0 : +m![1];
      return {
        titel: nichts ? 'Not a single elimination' : `${schwelle}+ eliminations`,
        passt: (e) => (nichts ? e.elims === 0 : e.elims >= schwelle),
        wert: (e) => (nichts ? `${e.points} pts` : `${e.elims} elims`),
        nach: (e) => (nichts ? e.points : e.elims),
      };
    },
  },
  {
    beispiel: '200 points',
    erklaerung: 'ab dieser Punktzahl — "no points" für punktlos',
    deute: (t) => {
      if (!/\b(points?|punkte|pts)\b/.test(t)) return null;
      if (/\b(best|beste[nr]?)\b/.test(t)) return null;
      const nichts = /\b(no|zero|keine?|null)\s+(points?|punkte|pts)\b/.test(t);
      const m = t.match(/\b(\d{1,4})\b/);
      if (!nichts && !m) return null;
      const schwelle = nichts ? 0 : +m![1];
      return {
        titel: nichts ? 'Left with zero points' : `${schwelle}+ points`,
        passt: (e) => (nichts ? e.points === 0 : e.points >= schwelle),
        wert: (e) => (nichts ? `${e.games} games` : `${e.points} pts`),
        nach: (e) => (nichts ? e.games : e.points),
      };
    },
  },
  {
    beispiel: 'all winners',
    erklaerung: 'wer gewonnen hat — "2 wins" für zwei und mehr, "no wins" für keinen',
    deute: (t) => {
      // Bewusst ohne "victory royales": das liest sich wie die Kennzahl und
      // gehoert zur Bestenliste.
      if (!/\b(wins?|winners?|sieg\w*|gewonnen|winless)\b/.test(t)) return null;
      if (/\b(game|runde|spiel)\s*\d/.test(t)) return null;
      if (/\bgame\s*by\s*game\b/.test(t)) return null;

      const nichts = /\b(no\s+wins?|winless|ohne\s+sieg\w*|keine?\s+siege?)\b/.test(t);
      const m = t.match(/\b(\d{1,2})\b/);
      const schwelle = nichts ? 0 : (m ? +m[1] : 1);
      return {
        titel: nichts
          ? 'Still without a Victory Royale'
          : schwelle > 1 ? `${schwelle}+ Victory Royales` : 'Everyone with a win',
        passt: (e) => (nichts ? e.wins === 0 : e.wins >= schwelle),
        wert: (e, h) => (nichts ? `${e.points} pts` : h.siegRunden(e) || `${e.wins} VR`),
        nach: (e) => (nichts ? e.points : e.wins),
      };
    },
  },
  {
    beispiel: 'all games',
    erklaerung: 'wer jede Runde gespielt hat — "missed games" für das Gegenteil',
    deute: (t) => {
      const alle = /\b(all\s*games|played\s*all|jede\s+runde\s+gespielt|voll)\b/.test(t);
      const verpasst = /\b(missed|verpasst|nicht\s+alle|fehlt\w*)\b/.test(t);
      if (!alle && !verpasst) return null;
      return {
        titel: alle ? 'Played every single game' : 'Did not play the full day',
        passt: (e, h) => {
          const meiste = Math.max(...h.feld.map((x) => x.games), 0);
          return alle ? e.games >= meiste : e.games < meiste;
        },
        wert: (e) => `${e.games} games`,
        nach: (e) => (alle ? e.points : -e.games),
      };
    },
  },
  {
    beispiel: 'all teams',
    erklaerung: 'das ganze Feld, so wie es steht',
    deute: (t) => (/\b(all\s*(teams?|duos?|players?)|ganzes?\s*feld|alle)\b/.test(t)
      ? {
        titel: 'The full field',
        passt: () => true,
        wert: (e) => `${e.points} pts`,
        nach: (e) => e.points,
      } : null),
  },
];

/** Welcher Auswahlbefehl steckt in dieser Eingabe? */
function deuteAuswahl(eingabe: string): Auswahl | null {
  const t = eingabe.trim().toLowerCase();
  if (!t) return null;
  for (const b of AUSWAHLBEFEHLE) {
    const a = b.deute(t);
    if (a) return a;
  }
  return null;
}


/** Die Ordner der Beitragsseite - jeder buendelt seine eigenen Vorlagen. */
type Ordner = 'competitive' | 'live' | 'playerstats' | 'news' | 'updates'
  /* Ohne Cup: freier Titel, Spieler von Hand. */
  | 'eigene';

const ORDNER: Array<{
  wert: Ordner; titel: string; hinweis: string; symbol: string;
  /** Welche Vorlagen gehoeren hierher? */
  vorlagen: Vorlage[];
  /** Nur laufende Cups zur Auswahl anbieten? */
  nurLive?: boolean;
  /** Auf Einzelwerte umschalten? */
  ebene?: 'team' | 'spieler';
}> = [
  {
    wert: 'competitive', titel: 'Competitive', symbol: '🏆',
    hinweis: 'FNCS, Cash Cups und Finals — Endstand und Qualifikation',
    vorlagen: ['endstand', 'qualifiziert', 'rueckblick', 'spieler'],
    ebene: 'team',
  },
  {
    wert: 'live', titel: 'Live-Cup', symbol: '🔴',
    hinweis: 'Nur was gerade läuft — alle Vorlagen, Team- und Einzelwerte',
    // Waehrend eines Cups will man alles zeigen koennen, nicht nur den Stand.
    vorlagen: ['endstand', 'qualifiziert', 'rueckblick', 'spieler'],
    nurLive: true,
  },
  {
    wert: 'playerstats', titel: 'Player Stats', symbol: '📊',
    hinweis: 'Einzelwerte je Spieler aus dem letzten Spieltag',
    vorlagen: ['rueckblick', 'spieler'],
    ebene: 'spieler',
  },
  {
    /*
     * Der einzige Ordner mit einer Vorlage, aber ohne Turnier.
     *
     * Fuer alles, was zu keinem einzelnen Cup gehoert - Saison- oder
     * Kapitelwerte, eine Frage an die Szene, eine Liste, die der Betreiber
     * selbst zusammenstellt.
     */
    wert: 'eigene', titel: 'Own list', symbol: '📝',
    hinweis: 'Ohne Cup — freier Titel, Spieler von Hand ausgewählt',
    vorlagen: ['eigene'],
  },
];

/**
 * Vorschlaege fuer den News-Ordner. Sie werden aus echten Turnierdaten
 * gebaut - bei jedem Klick eine andere Variante, damit nicht immer derselbe
 * Text erscheint. Was sich nicht belegen laesst, taucht gar nicht erst auf.
 */
const NEWS_ARTEN: Array<{ art: string; titel: string }> = [
  { art: 'ankuendigung', titel: 'Cup-Ankündigung' },
  { art: 'qualifiziert', titel: 'Sieger des Spieltags' },
  { art: 'rennen',       titel: 'Rennen um die Qualifikation' },
  { art: 'highlight',    titel: 'Stats-Highlights' },
];

/** Geruest fuer Beitraege ueber die eigene Seite - hier gibt es keine Daten. */
const UPDATE_BAUSTEINE: Array<{ titel: string; text: string }> = [
  {
    titel: 'Neue Funktion',
    text: `Neu auf ${MARKE.seite}:

[Was ist neu]

Schau vorbei: ${MARKE.seite}`,
  },
  {
    titel: 'Turnierkarte veröffentlicht',
    text: `Drop-Karte für [Turnier] ist online.

Wer wo landet, auf einen Blick: ${MARKE.seite}/events`,
  },
  {
    titel: 'Wartung',
    text: `Kurze Wartung auf ${MARKE.seite} am [Datum].

[Was betroffen ist]`,
  },
];

/**
 * Die Vorlagen, die zur Wahl stehen.
 *
 * Es waren sieben; drei sind gegangen, weil sie dasselbe noch einmal taten:
 *
 *   Top-Liste    - eine Kennzahl mit mehreren Plaetzen. Genau das macht
 *                  Standings auch, nur besser.
 *   Player Card  - alle Werte eines Spielers, wie Team Spotlight fuer ein Team.
 *   Auswahl      - nie von Hand gewaehlt: sie schaltet sich selbst ein, sobald
 *                  im Kurzbefehl-Feld etwas steht. Als Knopf war sie ein
 *                  Angebot, das ins Leere fuehrte.
 *
 * "auswahl" bleibt im Typ und im Textbau erhalten - nur aus dieser Liste ist
 * sie heraus. Der Kurzbefehl funktioniert unveraendert.
 */
const VORLAGEN: Array<{ wert: Vorlage; titel: string; hinweis: string }> = [
  { wert: 'rueckblick',   titel: 'Stats Recap',   hinweis: 'Spitzenwert je Kennzahl' },
  { wert: 'endstand',     titel: 'Standings',     hinweis: 'Die vordersten Plätze' },
  { wert: 'qualifiziert', titel: 'Qualified',     hinweis: 'Top-N samt Länderverteilung' },
  { wert: 'spieler',      titel: 'Team Spotlight', hinweis: 'Alle Werte eines Teams' },
  // Die einzige Vorlage, die keinen Cup braucht.
  { wert: 'eigene',       titel: 'Own list',      hinweis: 'Freier Titel, Spieler von Hand' },
];

interface Profil {
  id?: string; name: string; namen?: string[];
  land?: string; x?: string; region?: string; anzeige?: string;
}

/** Alle Namen, unter denen ein Epic-Konto schon angetreten ist. */
interface NamensEintrag { namen: string[]; haupt: string; schluessel?: string }

/** Die sieben Wettkampfregionen samt Flaggenkuerzel fuer die Anzeige. */
const REGIONEN: Array<{ code: string; flagge: string }> = [
  { code: 'EU',   flagge: 'eu' },
  { code: 'NAC',  flagge: 'us' },
  { code: 'NAW',  flagge: 'us' },
  { code: 'BR',   flagge: 'br' },
  { code: 'ASIA', flagge: 'jp' },
  { code: 'ME',   flagge: 'sa' },
  { code: 'OCE',  flagge: 'au' },
];

/**
 * Von welchem Land in welche Region. Bei den USA ist die Zuordnung nicht
 * eindeutig - NA Central und NA West teilen sich das Land. Deshalb faellt
 * die Voreinstellung auf NAC, und im Spielerprofil laesst sie sich je
 * Spieler ueberschreiben.
 */
const LAND_REGION: Record<string, string> = {
  DE:'EU', AT:'EU', CH:'EU', FR:'EU', GB:'EU', IE:'EU', NL:'EU', BE:'EU', LU:'EU',
  ES:'EU', PT:'EU', IT:'EU', DK:'EU', SE:'EU', NO:'EU', FI:'EU', IS:'EU', PL:'EU',
  CZ:'EU', SK:'EU', HU:'EU', RO:'EU', BG:'EU', GR:'EU', HR:'EU', RS:'EU', SI:'EU',
  UA:'EU', RU:'EU', LT:'EU', LV:'EU', EE:'EU', MT:'EU', CY:'EU', AL:'EU', MK:'EU',
  BA:'EU', ME:'EU', MD:'EU', BY:'EU', MC:'EU', TR:'EU',
  US:'NAC', CA:'NAC', MX:'NAC',
  BR:'BR', AR:'BR', CL:'BR', CO:'BR', PE:'BR', UY:'BR', VE:'BR', EC:'BR', BO:'BR', PY:'BR',
  JP:'ASIA', KR:'ASIA', CN:'ASIA', TW:'ASIA', HK:'ASIA', SG:'ASIA', TH:'ASIA',
  VN:'ASIA', PH:'ASIA', ID:'ASIA', MY:'ASIA', IN:'ASIA',
  AU:'OCE', NZ:'OCE',
  SA:'ME', AE:'ME', QA:'ME', KW:'ME', BH:'ME', OM:'ME', IL:'ME', JO:'ME',
  LB:'ME', EG:'ME', IQ:'ME', IR:'ME', SY:'ME', YE:'ME',
};

/**
 * Fuer den Beitragstext: das Flaggenzeichen zum Laenderkuerzel. Windows stellt
 * diese Zeichen zwar nicht dar, X und die meisten anderen Systeme schon - im
 * fertigen Beitrag sieht die Flagge also richtig aus.
 */
function flagge(land?: string) {
  if (!land || !/^[A-Za-z]{2}$/.test(land)) return '';
  return String.fromCodePoint(...[...land.toUpperCase()]
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Fuer die Anzeige auf dem Bildschirm: das Flaggenbild aus dem eigenen Ordner.
 * Windows hat keine Flaggenschrift, deshalb waeren Zeichen hier nur Buchstaben.
 */
function Flagge({ land, groesse = 14 }: { land?: string; groesse?: number }) {
  if (!land || !/^[A-Za-z]{2}$/.test(land)) return null;
  return (
    <img src={`/flags/${land.toLowerCase()}.png`} alt={land.toUpperCase()}
      title={land.toUpperCase()} loading="lazy"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      style={{ height: groesse, width: groesse * 1.5, objectFit: 'cover' }}
      className="shrink-0 rounded-[2px] border border-black/40" />
  );
}



function kurzName(name: string) {
  return kernname(name).slice(0, 18);
}

/**
 * Der Kachelname als Spaltenkopf. "Most Damage Dealt" wird zu "Damage Dealt" -
 * in einer Tabelle mit zwanzig Spalten steht das Wort "Most" ohnehin ueberall.
 */
function spaltenName(titel: string) {
  return titel.replace(/^(Most|Best|Lowest|Highest)\s+/i, '');
}

/**
 * Wie viele Zeichen muessten geaendert werden, um aus a b zu machen?
 * Damit findet der Kurzbefehl einen Spieler auch bei Vertippern oder wenn ein
 * Name diktiert wurde - "shark" statt "shxrk". Der Abstand bleibt eng
 * begrenzt, damit nicht zwei verschiedene Spieler zusammenfallen.
 */
function abstand(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let vorige = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const zeile = [i];
    for (let j = 1; j <= b.length; j++) {
      zeile[j] = Math.min(
        zeile[j - 1] + 1,
        vorige[j] + 1,
        vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vorige = zeile;
  }
  return vorige[b.length];
}

/**
 * Kurzbefehle statt Klickerei: "top5", "damage", "elims 10", "mats".
 * Rein regelbasiert - kein fremder Dienst, keine Kosten.
 */
function deuteBefehl(eingabe: string, listen: Bestenliste[]) {
  const text = eingabe.trim().toLowerCase();
  if (!text) return null;

  // Eine Zahl irgendwo im Befehl gibt die Anzahl vor.
  const zahl = text.match(/\b(\d{1,2})\b/);
  const anzahl = zahl ? Math.max(1, Math.min(25, +zahl[1])) : null;

  // Zuerst nach Kennzahlen suchen: "top 5 mats farmed" nennt beides, gemeint
  // ist dann die Kennzahl mit fuenf Plaetzen und nicht der Endstand.
  const fuellwoerter = /^(top|die|der|das|von|mit|nach|show|zeig|beste|meiste|most)$/;
  const woerter = text.split(/[\s,+]+/)
    // Ab zwei Zeichen, damit kurze Kuerzel wie "kd" nicht durchfallen.
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w))
    .filter((w) => !fuellwoerter.test(w));
  const passt = (b: Bestenliste, alle: boolean) => {
    const heu = (b.titel + ' ' + b.schluessel).toLowerCase();
    return alle ? woerter.every((w) => heu.includes(w))
                : woerter.some((w) => heu.includes(w));
  };
  // Zuerst die Kennzahlen, auf die *alle* Suchwoerter passen. "mats farmed"
  // trifft damit nur "Most Mats Farmed" und nicht auch "Most Mats Used".
  const genau = woerter.length ? listen.filter((b) => passt(b, true)) : [];
  const treffer = genau.length ? genau : listen.filter((b) => passt(b, false));

  // Genau eine Kennzahl: als Liste mit mehreren Plaetzen ausgeben.
  if (treffer.length === 1) {
    return {
      vorlage: 'bestenliste' as const,
      anzahl: anzahl ?? 5,
      listen: treffer.map((b) => b.schluessel),
    };
  }
  // Mehrere Kennzahlen: je Kennzahl der Spitzenwert.
  if (treffer.length > 1) {
    return {
      vorlage: 'rueckblick' as const,
      anzahl: anzahl ?? 7,
      listen: treffer.map((b) => b.schluessel),
    };
  }

  // Keine Kennzahl erkannt - dann entscheiden die Schlagworte.
  if (/\b(quali|qualif|region|land|country)/.test(text)) {
    return { vorlage: 'qualifiziert' as const, anzahl: anzahl ?? 7, listen: null };
  }
  if (/\b(top|standing|endstand|platz|rank)/.test(text)) {
    return { vorlage: 'endstand' as const, anzahl: anzahl ?? 5, listen: null };
  }
  return null;
}

/**
 * Ein Fenster ueber der Seite.
 *
 * Fuer Werkzeuge, die man selten braucht, aber dann in voller Groesse: die
 * Zuordnungsliste mit zweihundert Kacheln, die Turnierstatistik mit allen
 * Bestenlisten. Untereinander auf der Seite machten sie das Beitragsschreiben
 * zu einem Scrollen durch Dinge, die gerade niemanden interessieren.
 *
 * Geschlossen wird mit dem Kreuz, mit einem Klick auf den Hintergrund oder
 * mit Escape - drei Wege, weil ein Fenster, aus dem man nicht sofort
 * herausfindet, schlimmer ist als kein Fenster.
 *
 * Solange es zu ist, wird der Inhalt gar nicht erst gebaut. Bei zweihundert
 * Kacheln ist das der Unterschied zwischen einer traegen und einer flinken
 * Seite.
 */
function Fenster({ offen, schliessen, titel, children }: {
  offen: boolean; schliessen: () => void; titel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    window.addEventListener('keydown', taste);
    // Die Seite darunter soll nicht mitscrollen.
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', taste);
      document.body.style.overflow = vorher;
    };
  }, [offen, schliessen]);

  if (!offen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center
                    overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={schliessen}>
      <div onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-[1400px] rounded-2xl border border-zinc-800
                   bg-zinc-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-t-2xl
                        border-b border-zinc-800 bg-zinc-950/95 px-5 py-3
                        backdrop-blur">
          <h2 className="text-sm font-semibold text-slate-100"><T>{titel}</T></h2>
          <button onClick={schliessen}
            className="ml-auto rounded-lg border border-zinc-800 px-3 py-1 text-xs
                       text-slate-400 transition hover:border-rose-500/60
                       hover:text-rose-400">
            <T>schließen</T>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function TweetSeite() {
  const t = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [cups, setCups] = useState<Cup[]>([]);
  const [cupId, setCupId] = useState('');
  const [fensterId, setFensterId] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [vorlage, setVorlage] = useState<Vorlage>('rueckblick');
  const [anzahl, setAnzahl] = useState(7);
  const [gewaehlteListen, setGewaehlteListen] = useState<string[]>([]);
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  const [pflegeName, setPflegeName] = useState<string | null>(null);
  const [pflegeLand, setPflegeLand] = useState('');
  const [pflegeX, setPflegeX] = useState('');
  /** Rueckmeldung zum Speichern - ohne sie sah jeder Ausgang gleich aus. */
  const [pflegeStand, setPflegeStand] = useState('');
  const [pflegeRegion, setPflegeRegion] = useState('');
  const [pflegeAnzeige, setPflegeAnzeige] = useState('');
  const [kopiert, setKopiert] = useState(false);

  /* Die beiden Werkzeugfenster - zu, bis jemand sie braucht. */
  const [zuordnungOffen, setZuordnungOffen] = useState(false);
  const [statistikOffen, setStatistikOffen] = useState(false);

  /* Die Turniergrafik auf Epics eigener Vorlage. */
  const vorlagenLeinwand = useRef<HTMLCanvasElement | null>(null);
  const [vorlagenTitel, setVorlagenTitel] = useState('');

  /* ------------------------------------------- Eigene Liste ohne Cup */
  /** Die Ueberschrift, die der Betreiber selbst schreibt. */
  const [eigenerKopf, setEigenerKopf] = useState('');
  /** Wen er dafuer ausgewaehlt hat - in der Reihenfolge der Auswahl. */
  const [eigeneWahl, setEigeneWahl] = useState<Array<{
    epicId: string; anzeige: string; land: string | null; bild: string | null;
  }>>([]);
  /** Woraus er waehlt: eine Region, oder das Ergebnis einer Suche. */
  const [eigeneRegion, setEigeneRegion] = useState('EU');
  const [eigeneSuche, setEigeneSuche] = useState('');
  const [eigeneListe, setEigeneListe] = useState<Array<{
    epicId: string; anzeige: string; land: string | null; bild: string | null;
  }>>([]);
  /** Ob die Nummerierung im Text stehen soll - bei einer Frage nicht. */
  const [eigeneNummern, setEigeneNummern] = useState(true);
  const [schriftDa, setSchriftDa] = useState(false);
  const [vorlagenKopiert, setVorlagenKopiert] = useState(false);
  /** Warum das Speichern nicht ging - sonst bliebe der Knopf stumm. */
  const [vorlagenFehler, setVorlagenFehler] = useState('');

  /* Suche und Filter fuer die Zuordnungsliste. Bei zweihundert Kacheln ist
     Scrollen keine Bedienung mehr. */
  const [zuordnenSuche, setZuordnenSuche] = useState('');
  const [zuordnenFilter, setZuordnenFilter] =
    useState<'alle' | 'offen' | 'ohneFlagge' | 'ohneKonto' | 'gepflegt'>('alle');

  /**
   * Herkunftslaender aus der Szene-Quelle, nach Konto-ID.
   *
   * Dieselben, die die Statistikseite zeigt. Sie treten nur dort an, wo kein
   * gepflegtes Profil steht - was von Hand eingetragen wurde, gilt weiter.
   */
  const [szeneLaender, setSzeneLaender] = useState<Record<string, string>>({});

  /* Das Fotomosaik unter dem Beitrag - drei bis fuenf Portraits nebeneinander. */
  const [mosaikAnzahl, setMosaikAnzahl] = useState(5);
  const [mosaikUrl, setMosaikUrl] = useState<string | null>(null);
  const [mosaikNamen, setMosaikNamen] = useState('');
  const [mosaikLaedt, setMosaikLaedt] = useState(false);
  const [mosaikFehler, setMosaikFehler] = useState('');
  const [mosaikKopiert, setMosaikKopiert] = useState(false);
  const [beschreibung, setBeschreibung] = useState('');
  /** Selbst geschriebener Text. Solange null, gilt der aus der Vorlage. */
  const [eigenerText, setEigenerText] = useState<string | null>(null);

  /* ------------------------------------------------ Fremdbeitrag holen */
  /**
   * Ein Beitrag von X, eins zu eins uebernommen.
   *
   * X gibt seine Beitraege nur noch ueber eine kostenpflichtige
   * Schnittstelle mit Schluessel heraus; FixTweet spiegelt oeffentliche
   * Beitraege dagegen als offenes JSON. Geholt werden Text und Bilder -
   * mehr braucht es nicht, um daraus einen eigenen Beitrag zu bauen.
   */
  const [quellLink, setQuellLink] = useState('');
  const [quellLaedt, setQuellLaedt] = useState(false);
  const [quellFehler, setQuellFehler] = useState('');
  const [quelle, setQuelle] = useState<{
    text: string; autor: string | null; konto: string | null;
    datum: string | null; url: string; bilder: string[]; videos: string[];
  } | null>(null);
  /* ------------------------------ Eigene Fassung des uebernommenen Bildes */
  /**
   * Dasselbe Bild, andere Gesichter.
   *
   * Das uebernommene Bild bleibt stehen; darunter entsteht die eigene
   * Fassung aus den Fotos, die das Werkzeug fuehrt. Neun ergeben bei
   * /api/beitrag-bild ein 3x3-Raster - dieselbe Anordnung wie in den
   * Vorlagen, die auf X kursieren.
   */
  const [eigenAnzahl, setEigenAnzahl] = useState(9);
  const [eigenIds, setEigenIds] = useState<string[]>([]);
  const [eigenBild, setEigenBild] = useState<string | null>(null);
  const [eigenLaedt, setEigenLaedt] = useState(false);
  const [eigenRegel, setEigenRegel] = useState('');
  const [eigenNamen, setEigenNamen] = useState('');
  /** Das Bild als Blob - fuer die Zwischenablage, ohne Umweg ueber die Platte. */
  const [eigenBlob, setEigenBlob] = useState<Blob | null>(null);
  const [eigenKopiert, setEigenKopiert] = useState(false);

  /**
   * Das Bild in die Zwischenablage legen.
   *
   * Herunterladen, wiederfinden, hochladen, hinterher aufraeumen - fuer ein
   * Bild, das einmal in einen Beitrag soll, sind das vier Schritte zu viel.
   * Der Browser kann PNG unmittelbar in die Ablage schreiben.
   */
  async function eigenKopieren() {
    if (!eigenBlob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': eigenBlob }),
      ]);
      setEigenKopiert(true);
      setTimeout(() => setEigenKopiert(false), 2000);
    } catch {
      // Ohne Erlaubnis oder in einem alten Browser geht es nicht - dann
      // bleibt der Weg ueber das Speichern, und das steht daneben.
      setEigenKopiert(false);
    }
  }

  /**
   * Gesetzte Spieler - die sollen auf jeden Fall ins Bild.
   *
   * Der Vorschlag fuellt nur auf, was danach noch frei ist. So laesst sich
   * ein Beitrag um zwei, drei Namen herum bauen, die feststehen, ohne die
   * uebrigen von Hand zusammensuchen zu muessen.
   */
  interface Waehlbar {
    epicId: string; anzeige: string; bild: string | null; foto: boolean;
  }
  const [fest, setFest] = useState<Waehlbar[]>([]);
  const [festSuche, setFestSuche] = useState('');
  const [festRegion, setFestRegion] = useState('EU');
  const [festListe, setFestListe] = useState<Waehlbar[]>([]);

  useEffect(() => {
    let weg = false;
    const q = festSuche.trim();
    const uhr = setTimeout(() => {
      // Bei einer Suche gilt der Text, sonst die gewaehlte Region.
      const pfad = q.length >= 2
        ? `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`
        : `/api/szene-stats?region=${festRegion}&sort=elims&limit=80`;
      fetch(pfad).then((r) => r.json())
        .then((j) => {
          if (weg) return;
          const roh = Array.isArray(j?.spieler) ? j.spieler : [];
          setFestListe(roh.map((x: {
            epicId: string; anzeige?: string; name?: string;
            bild?: string | null; echtesFoto?: boolean | string;
          }) => ({
            epicId: x.epicId,
            anzeige: x.anzeige || x.name || x.epicId,
            bild: x.bild ?? null,
            foto: String(x.echtesFoto).toLowerCase() === 'true',
          })).filter((x: Waehlbar) => /^[0-9a-f]{32}$/i.test(x.epicId)));
        })
        .catch(() => {});
    }, 300);
    return () => { weg = true; clearTimeout(uhr); };
  }, [festSuche, festRegion]);

  /** Spieler nach einer offenen Regel vorschlagen lassen. */
  async function eigenVorschlagen(art: 'underrated' | 'topelims') {
    setEigenLaedt(true); setEigenRegel('');
    try {
      const r = await fetch(`/api/spieler-vorschlag?art=${art}&anzahl=${eigenAnzahl}`);
      const j = await r.json();
      if (!r.ok) { setEigenRegel(j?.error ?? 'kein Vorschlag'); return; }
      setEigenIds((j.spieler ?? []).map((x: { epicId: string }) => x.epicId));
      setEigenRegel(j.regel ?? '');
    } catch (e) { setEigenRegel((e as Error).message); }
    finally { setEigenLaedt(false); }
  }

  /** Aus den gewaehlten Konten das Bild bauen. */
  useEffect(() => {
    let weg = false;
    let alte: string | null = null;
    // Ohne Konten nichts zu bauen. Der Zustand wird trotzdem ueber dieselbe
    // Kette zurueckgesetzt, damit im Effekt nichts unmittelbar gesetzt wird.
    // Zuerst die gesetzten, dann der Vorschlag - doppelte fallen weg.
    const zusammen = [...new Set([...fest.map((x) => x.epicId), ...eigenIds])]
      .slice(0, Math.max(eigenAnzahl, 1) + 6);

    const holen = zusammen.length
      ? fetch(`/api/beitrag-bild?ids=${zusammen.join(',')}&anzahl=${eigenAnzahl}`,
        { cache: 'no-store' })
        .then(async (r) => {
          if (!r.ok) return null;
          const namen = decodeURIComponent(r.headers.get('X-Spieler') ?? '');
          return { blob: await r.blob(), namen };
        })
      : Promise.resolve(null);

    holen.then((erg) => {
      if (weg) return;
      if (!erg) {
        setEigenBild((v) => { if (v) URL.revokeObjectURL(v); return null; });
        return;
      }
      setEigenNamen(erg.namen);
      setEigenBlob(erg.blob);
      alte = URL.createObjectURL(erg.blob);
      setEigenBild((v) => { if (v) URL.revokeObjectURL(v); return alte; });
    }).catch(() => {});
    return () => { weg = true; if (alte) URL.revokeObjectURL(alte); };
  }, [eigenIds, eigenAnzahl, fest]);

  /** Selbst hochgeladene Bilder - bleiben im Browser, nichts wird gesendet. */
  const [eigeneBilder, setEigeneBilder] = useState<string[]>([]);

  async function quelleHolen() {
    const link = quellLink.trim();
    if (!link) return;
    setQuellLaedt(true); setQuellFehler(''); setQuelle(null);
    try {
      const r = await fetch(`/api/tweet-holen?url=${encodeURIComponent(link)}`);
      const j = await r.json();
      if (!r.ok) { setQuellFehler(j?.error ?? `Fehler ${r.status}`); return; }
      setQuelle(j);
      // Der Text geht gleich in den Editor - genau das ist der Zweck.
      setEigenerText(j.text ?? '');
    } catch (e) {
      setQuellFehler((e as Error).message);
    } finally { setQuellLaedt(false); }
  }

  function bilderWaehlen(dateien: FileList | null) {
    for (const d of Array.from(dateien ?? [])) {
      if (!d.type.startsWith('image/')) continue;
      const leser = new FileReader();
      leser.onload = () => setEigeneBilder((alt) =>
        [...alt, String(leser.result)]);
      leser.readAsDataURL(d);
    }
  }
  const [spotlight, setSpotlight] = useState<number | null>(null);
  /** Die zuletzt per Kurzbefehl gestellte Frage ans Feld. */
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  /** Steht die Befehlsübersicht offen? */
  const [befehleOffen, setBefehleOffen] = useState(false);
  const [befehlSuche, setBefehlSuche] = useState('');
  /** Team-Summen von Epic oder Einzelwerte aus der Szene-Quelle. */
  const [ebene, setEbene] = useState<'team' | 'spieler'>('team');
  const [ordner, setOrdner] = useState<Ordner>('competitive');
  const [freierText, setFreierText] = useState('');
  /** Welche Variante wurde je Art zuletzt gezeigt? */
  const [vorschlagNr, setVorschlagNr] = useState<Record<string, number>>({});
  const [laedtVorschlag, setLaedtVorschlag] = useState<string | null>(null);
  const [vorschlagHinweis, setVorschlagHinweis] = useState('');
  const [spielerDaten, setSpielerDaten] = useState<SpielerDaten | null>(null);
  /** Konto-ID auf bekannte Namen - loest Turnier-Tarnnamen auf. */
  const [namen, setNamen] = useState<Record<string, NamensEintrag>>({});
  const [zaehlung, setZaehlung] = useState<'land' | 'region'>('land');
  const [befehl, setBefehl] = useState('');
  const [befehlEcho, setBefehlEcho] = useState('');

  /* --------------------------------------------------- Screenshot einlesen */

  /*
   * Hier lagen die Zustaende der Screenshot-Erkennung: eingefuegtes Bild,
   * erkannter Text, Fortschritt. Die Erkennung ist entfallen - sie las
   * Namen aus fremden Bildschirmfotos, was die Zuordnung ueber die Konto-Id
   * ohnehin besser kann, und kostete eine ganze Bibliothek dafuer.
   */
  /**
   * Welche Kennzahl steht gerade in voller Laenge offen? Der Schluessel der
   * Bestenliste, oder 'alle' fuer die Gesamttabelle. Null heisst zu.
   */
  const [vollansicht, setVollansicht] = useState<string | null>(null);
  /** Suchfeld der Vollansicht - filtert nach Name, Land und Region. */
  const [vollSuche, setVollSuche] = useState('');
  /** Wessen Werte zeigt die Player Card? Konto-ID, sonst der Name. */
  const [karteSpieler, setKarteSpieler] =
    useState<{ name: string; id?: string } | null>(null);

  const leinwand = useRef<HTMLCanvasElement | null>(null);
  /** Vorgeladene Flaggenbilder fuer die Leinwand, nach Laenderkuerzel. */
  const flaggenBilder = useRef<Record<string, HTMLImageElement>>({});
  /**
   * Die Schrift fuer die Turniergrafik.
   *
   * Fortnite setzt "Burbank Big Condensed Black" - die ist lizenzpflichtig
   * und liegt hier nicht. Anton kommt ihr am naechsten: schmal, sehr fett,
   * dieselbe Anmutung, und unter der Open Font License frei verwendbar.
   * Die Schraeglage macht die Zeichnung selbst, so wie in der Vorlage.
   *
   * Laedt sie nicht, faellt die Grafik auf eine Systemschrift zurueck. Sie
   * sieht dann anders aus, aber sie entsteht.
   */
  useEffect(() => {
    const schrift = new FontFace('AntonBeitrag', "url('/fonts/anton-latin.woff2')");
    schrift.load()
      .then((geladen) => { document.fonts.add(geladen); setSchriftDa(true); })
      .catch(() => setSchriftDa(false));
  }, []);

  /** Das eigene Logo fuer die Fusszeile der Grafik. */
  const logoBild = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/check-admin')
      .then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true))
      .catch(() => setIstAdmin(false));

    // Die Herkunftslaender der Szene-Quelle - dieselben, die auf der
    // Statistikseite stehen. Ohne sie traegt jeder Ungepflegte eine
    // Weltkugel, obwohl sein Land laengst bekannt ist.
    fetch('/api/spieler-laender').then((r) => r.json())
      .then((d) => setSzeneLaender(d?.laender ?? {})).catch(() => {});

    fetch('/api/cup-catalog?modus=alle').then((r) => r.json())
      .then((d) => setCups(d.cups ?? [])).catch(() => {});

    fetch('/api/spieler-namen').then((r) => r.json())
      .then((j) => setNamen(j.verzeichnis ?? {})).catch(() => {});

    const logo = new Image();
    logo.src = MARKE.logo;
    logo.onload = () => { logoBild.current = logo; zeichnenRef.current?.(); };

    // Herkunftsland und X-Konto kommen aus der selbst gepflegten Liste.
    // Wer dort fehlt, erscheint ohne Flagge - erfunden wird nichts.
    fetch('/api/spieler-profile').then((r) => r.json())
      .then((j) => {
        const p = (j.profile ?? {}) as Record<string, Profil>;
        setProfile(p);
        for (const eintrag of Object.values(p)) {
          const code = eintrag.land?.toLowerCase();
          if (!code || flaggenBilder.current[code]) continue;
          const bild = new Image();
          bild.src = `/flags/${code}.png`;
          bild.onload = () => zeichnenRef.current?.();
          flaggenBilder.current[code] = bild;
        }
      }).catch(() => {});
  }, []);

  const aktiverOrdner = ORDNER.find((o) => o.wert === ordner)!;

  // Beim Ordnerwechsel Vorlage und Ebene passend setzen.
  useEffect(() => {
    const o = ORDNER.find((x) => x.wert === ordner);
    if (!o) return;
    if (o.ebene) setEbene(o.ebene);
    if (o.vorlagen.length) setVorlage((v) => (o.vorlagen.includes(v) ? v : o.vorlagen[0]));
  }, [ordner]);

  const cup = cups.find((c) => c.id === cupId);
  const fenster = useMemo(() => {
    if (!cup) return [];
    return Object.entries(cup.regionen).flatMap(([region, liste]) =>
      liste.map((f) => ({ ...f, region })));
  }, [cup]);
  const aktuellesFenster = fenster.find((f) => f.windowId === fensterId);

  /**
   * Was zur Auswahl steht. Ueber ein Turnier, das noch nicht begonnen hat,
   * gibt es nichts zu berichten - deshalb erscheinen nur laufende und
   * bereits gelaufene Cups, die laufenden zuerst.
   */
  const sichtbareCups = useMemo(() => {
    const laeuft = (c: Cup) => c.live
      || Object.values(c.regionen).some((l) => l.some((f) => f.status === 'live'));
    const gelaufen = (c: Cup) => !laeuft(c)
      && Object.values(c.regionen).some((l) => l.some((f) => f.status === 'vorbei'));

    const live = cups.filter(laeuft);
    if (aktiverOrdner.nurLive) return { live, vorbei: [] as Cup[] };

    const vorbei = cups.filter(gelaufen)
      // Zuletzt gelaufene zuerst - danach sucht man am haeufigsten.
      .sort((a, b) => (b.letzterStart ?? 0) - (a.letzterStart ?? 0));
    return { live, vorbei };
  }, [cups, aktiverOrdner]);

  /** Wann lief dieser Cup zuletzt? Fuer die Beschriftung in der Liste. */
  const wann = (c: Cup) => {
    const zeiten = Object.values(c.regionen).flat().map((f) => f.begin);
    if (!zeiten.length) return '';
    return new Date(Math.max(...zeiten))
      .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  const laden = useCallback(async () => {
    if (!aktuellesFenster) return;
    // Alles zuruecksetzen: sonst stehen die Spieler des vorigen Cups noch
    // in der Liste, bis die neue Antwort eintrifft.
    setLaedt(true); setFehler(''); setStats(null); setEintraege([]);
    setSpielerDaten(null);
    // Auch die Player Card: sonst zeigt sie nach dem Cup-Wechsel weiter den
    // Spieler des vorigen Turniers, der hier gar nicht angetreten ist.
    setKarteSpieler(null); setVollansicht(null);
    try {
      const p = `event=${encodeURIComponent(aktuellesFenster.eventId)}` +
                `&window=${encodeURIComponent(aktuellesFenster.windowId)}`;
      const [rs, rl] = await Promise.all([
        fetch(`/api/cup-stats?${p}&top=5`),
        fetch(`/api/cup-leaderboard?${p}&limit=100`),
      ]);
      const [ds, dl] = await Promise.all([rs.json(), rl.json()]);
      if (!rs.ok) throw new Error(ds.error ?? 'Statistik nicht ladbar');
      setStats(ds);
      setEintraege(dl.entries ?? []);
      setGewaehlteListen((ds.bestenlisten as Bestenliste[]).slice(0, 6).map((b) => b.schluessel));

      // Einzelwerte nebenher holen - sie liegen bei einer anderen Quelle und
      // sind nicht zu jedem Spieltag vorhanden.
      // Region mitgeben: dieselbe Spieltagskennung kann in mehreren
      // Regionen vorkommen, sonst kaemen die Werte der falschen.
      fetch(`/api/spieler-stats?window=${encodeURIComponent(aktuellesFenster.windowId)}`
          + (aktuellesFenster.region && aktuellesFenster.region !== 'GLOBAL'
             ? `&region=${aktuellesFenster.region}` : ''))
        .then((r) => r.json())
        .then((d: SpielerDaten) => {
          // Eine verspaetete Antwort zu einem anderen Spieltag darf die
          // aktuelle Auswahl nicht ueberschreiben.
          if (d.fuer && d.fuer !== aktuellesFenster.windowId) return;
          setSpielerDaten(d);
        })
        .catch(() => setSpielerDaten(null));
    } catch (e) {
      setFehler((e as Error).message);
    } finally { setLaedt(false); }
  }, [aktuellesFenster]);

  /**
   * Ist das ein Solo-Cup?
   *
   * Epic fuehrt sein Leaderboard je Eintrag, nicht je Spieler. Bei einem Duo
   * stehen dort Teamsummen, die sich nicht auf zwei Koepfe aufteilen lassen.
   * Besteht ein Eintrag aber nur aus einem Spieler, dann *ist* die Teamzeile
   * bereits die Spielerzeile - und die Einzelwerte liegen von der ersten
   * Sekunde an vor, ohne fremde Quelle.
   */
  const soloCup = useMemo(
    () => eintraege.length > 0 && eintraege.every((e) => e.players.length === 1),
    [eintraege]);

  /**
   * Einzelwerte aus Epics eigenen Zahlen - nur bei Solo-Cups.
   *
   * Uebernommen wird ausschliesslich, was Epic tatsaechlich mitschickt.
   * Schuesse, Treffer, Assists, Wiederbelebungen, Sturm- und Fallschaden
   * stehen dort nicht; sie bleiben auf null und fallen dadurch aus der
   * Auswahl heraus, statt mit einer erfundenen Zahl zu erscheinen. Ebenso
   * "Builds Placed": Epic zaehlt verbautes Material, nicht gesetzte Bauteile -
   * das ist nicht dasselbe und wird deshalb nicht als solches ausgegeben.
   */
  const epicEinzelwerte = useMemo<SpielerWert[]>(() => {
    if (!soloCup) return [];
    return eintraege.map((e) => {
      const spieler = e.players[0];
      const damage = Math.round(e.damage ?? 0);
      const damageTaken = Math.round(e.damageTaken ?? 0);
      return {
        name: spieler.name,
        epicId: spieler.id ?? '',
        elims: e.elims ?? 0,
        headshots: e.headshots ?? 0,
        damage,
        damageTaken,
        quote: damageTaken > 0 ? +(damage / damageTaken).toFixed(2) : 0,
        heals: Math.round((e.heilung ?? 0) + (e.schild ?? 0)),
        mats: e.matsGefarmt ?? 0,
        // Zentimeter in Kilometer, wie bei der anderen Quelle auch.
        distanz: +(((e.strecke ?? 0) / 100_000)).toFixed(2),
        timeAlive: e.timeAlive ?? 0,
        matches: e.games ?? 0,
        // Die Wertung des Turniers - bei einem Solo-Cup die des Spielers.
        points: e.points ?? 0,
        wins: e.wins ?? 0,
        kd: e.kd ?? 0,
        avgPlace: e.avgPlace ?? 0,
        kisten: e.kisten ?? 0,
        matsVerbaut: e.matsVerbaut ?? 0,
        // Von Epic nicht geliefert:
        assists: 0, reboots: 0, hits: 0, shots: 0, genauigkeit: 0,
        stormDamage: 0, fallDamage: 0, builds: 0, timeInStorm: 0,
        distanzGesamt: 0,
      };
    });
  }, [soloCup, eintraege]);

  /**
   * Welche Einzelwerte gelten - und woher sie stammen.
   *
   * Zuerst die Szene-Quelle: sie fuehrt mehr Kennzahlen. Fehlt der Spieltag
   * dort, springt bei einem Solo-Cup Epic ein.
   */
  const einzelwerte = useMemo<SpielerWert[]>(
    () => (spielerDaten?.spieler.length ? spielerDaten.spieler : epicEinzelwerte),
    [spielerDaten, epicEinzelwerte]);
  /** Die Einzelwerte nach Konto - fuer den Zweitwert hinter jeder Zeile. */
  const einzelwerteNachId = useMemo(
    () => new Map(einzelwerte.map((p) => [p.epicId, p])), [einzelwerte]);

  const einzelQuelle = spielerDaten?.spieler.length
    ? (spielerDaten.quelle ?? null)
    : (epicEinzelwerte.length ? 'Epic' : null);

  /**
   * Die Einzelwerte in dieselbe Form bringen wie die Teamwerte. Dadurch
   * arbeiten Textbau, Grafik und Anzeige unveraendert weiter.
   */
  const spielerListen = useMemo<Bestenliste[]>(() => {
    const roh = einzelwerte;
    if (!roh.length) return [];
    return SPIELER_KENNZAHLEN.map((k) => {
      // "Lowest Damage Ratio" greift auf dasselbe Feld zu, sortiert nur andersherum.
      const feld = (k.schluessel === 'quoteNiedrig' ? 'quote' : k.schluessel) as keyof SpielerWert;
      const wertVon = (p: SpielerWert) => Number(p[feld]);
      const sortiert = [...roh]
        .filter((p) => wertVon(p) > 0)
        .sort((a, b) => (k.kleinBesser ? wertVon(a) - wertVon(b) : wertVon(b) - wertVon(a)));
      if (!sortiert.length) return null;
      // Einmal das ganze Feld aufbereiten. Die Kachel nimmt sich die ersten
      // fuenf, die Vollansicht hinter dem Pluszeichen bekommt den Rest.
      const alle = sortiert.map((p, i) => {
        const roher = wertVon(p);
        // Sekunden in Minuten, wo die Einheit es verlangt.
        const wert = k.einheit === 'min' ? Math.round(roher / 60) : roher;
        return {
          rank: i + 1,
          spieler: [p.name],
          ids: [p.epicId],
          wert: +wert.toFixed(k.nachkomma ?? 0),
          roh: roher,
        };
      });
      return {
        schluessel: String(k.schluessel),
        titel: k.titel,
        symbol: k.symbol,
        einheit: k.einheit ?? null,
        plaetze: alle.slice(0, 5),
        alle,
      };
    }).filter(Boolean) as Bestenliste[];
  }, [einzelwerte]);

  /**
   * Dieselben Kennzahlen, aber je Team.
   *
   * Epics Turnierwertung kennt sechs Groessen: Punkte, Eliminierungen, Siege,
   * K/D, Durchschnittsplatz, Ueberlebenszeit. Alles Feinere - Material,
   * Bauteile, Strecke, Kopftreffer, Trefferquote - hat nur die Szene-Quelle,
   * und dort steht es je Spieler.
   *
   * Hier werden diese Werte je Duo zusammengefasst. Das ist keine Schaetzung:
   * was zwei Spieler eines Teams gefarmt haben, hat das Team gefarmt.
   *
   * Zwei Dinge muessen dabei getrennt behandelt werden:
   *
   *   - Summen (Material, Strecke, Schaden) lassen sich addieren.
   *   - Verhaeltnisse (Schadensquote, Trefferquote) NICHT. Der Mittelwert
   *     zweier Quoten ist nicht die Quote des Teams; sie werden deshalb aus
   *     den aufsummierten Bestandteilen neu gerechnet.
   *
   * Was Epic ohnehin schon fuehrt - Punkte, Siege, K/D, Platz - bleibt bei
   * Epic. Zwei Wege zur selben Zahl waeren eine Quelle zu viel.
   */
  const teamListenAusEinzelwerten = useMemo<Bestenliste[]>(() => {
    if (!einzelwerte.length || !eintraege.length) return [];

    const jeKonto = new Map(einzelwerte.map((p) => [p.epicId, p]));

    /** Wird schon von Epic gefuehrt - hier nicht noch einmal. */
    const beiEpic = new Set(['points', 'wins', 'kd', 'avgPlace', 'timeAlive', 'elims']);
    /** Aus Bestandteilen zu rechnen, nicht zu addieren. */
    const quotient: Record<string, [keyof SpielerWert, keyof SpielerWert, number]> = {
      quote: ['damage', 'damageTaken', 1],
      quoteNiedrig: ['damage', 'damageTaken', 1],
      genauigkeit: ['hits', 'shots', 100],
    };

    return SPIELER_KENNZAHLEN.map((k) => {
      const sch = String(k.schluessel);
      if (beiEpic.has(sch)) return null;

      const zeilen = eintraege.map((e) => {
        const teil = e.players
          .map((sp) => (sp.id ? jeKonto.get(sp.id) : undefined))
          .filter(Boolean) as SpielerWert[];
        // Kein einziger Spieler des Teams in den Einzelwerten? Dann gibt es
        // zu diesem Team nichts zu sagen - keine Null, keine Zeile.
        if (!teil.length) return null;

        let roh: number;
        const q = quotient[sch];
        if (q) {
          const [oben, unten, faktor] = q;
          const summeUnten = teil.reduce((n, p) => n + Number(p[unten] ?? 0), 0);
          if (summeUnten <= 0) return null;
          roh = (teil.reduce((n, p) => n + Number(p[oben] ?? 0), 0) / summeUnten) * faktor;
        } else {
          roh = teil.reduce((n, p) => n + Number(p[k.schluessel as keyof SpielerWert] ?? 0), 0);
        }
        if (!(roh > 0)) return null;

        return {
          e, roh,
          spieler: e.players.map((sp) => sp.name),
          ids: e.players.map((sp) => sp.id ?? ''),
        };
      }).filter(Boolean) as Array<{
        e: Eintrag; roh: number; spieler: string[]; ids: string[];
      }>;

      if (!zeilen.length) return null;
      zeilen.sort((a, b) => (k.kleinBesser ? a.roh - b.roh : b.roh - a.roh)
        || (a.e.rank - b.e.rank));

      const alle = zeilen.map((z, i) => {
        const wert = k.einheit === 'min' ? Math.round(z.roh / 60) : z.roh;
        return {
          rank: i + 1, spieler: z.spieler, ids: z.ids,
          wert: +wert.toFixed(k.nachkomma ?? 0), roh: z.roh,
        };
      });

      return {
        schluessel: String(k.schluessel),
        titel: k.titel, symbol: k.symbol,
        einheit: k.einheit ?? null,
        plaetze: alle.slice(0, 5), alle,
      };
    }).filter(Boolean) as Bestenliste[];
  }, [einzelwerte, eintraege]);

  /**
   * Welche Ebene tatsaechlich gilt.
   *
   * Bei einem Solo-Cup gibt es keine Teams, also auch keine zwei Ebenen: die
   * Zeile eines Eintrags ist die Zeile eines Spielers. Die Umschaltung
   * verschwindet dort, und es gilt immer die Spielerebene - unabhaengig
   * davon, was eine Vorlage sonst vorgibt.
   */
  const ebeneEffektiv: 'team' | 'spieler' = soloCup ? 'spieler' : ebene;

  /** Was gerade gilt: Teamwerte von Epic oder Einzelwerte. */
  // Gemerkt statt bei jedem Rendern neu: an dieser Liste haengen inzwischen
  // mehrere Berechnungen, die sonst jedes Mal von vorn anfingen.
  const aktiveListen = useMemo(
    () => (ebeneEffektiv === 'spieler'
      ? spielerListen
      // Epics sechs zuerst - sie entscheiden den Cup. Danach das Feinere aus
      // der Szene-Quelle, je Team zusammengefasst.
      : [...(stats?.bestenlisten ?? []), ...teamListenAusEinzelwerten]),
    [ebeneEffektiv, spielerListen, stats, teamListenAusEinzelwerten]);

  /** Die gepflegten Profile, nachgeschlagen ueber die Konto-ID. */
  const profilNachId = useMemo(() => {
    const karte = new Map<string, Profil>();
    for (const [schluessel, p] of Object.entries(profile)) {
      const id = p.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) karte.set(id, p);
    }
    return karte;
  }, [profile]);

  /**
   * Das Profil zu einem Spieler.
   *
   * Ueber die Konto-ID und sonst gar nicht. Ein Profi ist genau ein Epic-Konto
   * - der Name ist es nicht: er laesst sich nachbauen, und genau das passiert
   * dauernd. "Peterbot 來" ist nicht peterbot, aber nach dem Abschleifen der
   * Zierzeichen sieht der Name gleich aus. Wer nach dem Namen zuordnet,
   * heftet dem Nachahmer die Flagge und das X-Konto des Profis an.
   *
   * Deshalb: bringt ein Spieler eine Konto-ID mit, entscheidet allein sie.
   * Findet sich dazu kein gepflegtes Profil, bleibt er ohne Flagge - so, wie
   * jeder, der kein Profi ist.
   *
   * Nur wo gar keine ID vorliegt - etwa bei einem aus einem Bild gelesenen
   * Namen - bleibt der Weg ueber den Namen. Und auch dort nur, wenn er
   * eindeutig auf ein einziges Profil zeigt.
   */
  const findeProfil = useCallback((name: string, id?: string): Profil | undefined => {
    if (id) return profile[id] ?? profilNachId.get(id);

    const schluessel = namensSchluessel(name);
    const treffer = Object.values(profile).filter((p) =>
      (p.namen ?? [p.name]).some((n) => namensSchluessel(n) === schluessel));
    return treffer.length === 1 ? treffer[0] : undefined;
  }, [profile, profilNachId]);

  /**
   * Ein Altprofil, das zu diesem Namen passen koennte.
   *
   * Frueher lagen Profile unter dem Namen statt unter der Konto-ID. Seit die
   * Zuordnung allein ueber die ID geht, greifen sie nicht mehr - der Spieler
   * stuende ohne Flagge da, obwohl seine Angaben laengst gepflegt sind.
   *
   * Aufgeloest wird das nicht von selbst: welches Konto der echte Profi ist,
   * kann das Werkzeug nicht wissen, und genau dieses Raten hat dem Nachahmer
   * die Flagge verschafft. Stattdessen wird der Fund nur vorgeschlagen und
   * bleibt bis zur Bestaetigung folgenlos. Ein Vorschlag entsteht ausserdem
   * nur, wenn genau ein Altprofil in Frage kommt.
   */
  const altprofilVorschlag = useCallback((name: string, id?: string): Profil | undefined => {
    if (!id || findeProfil(name, id)) return undefined;
    const schluessel = namensSchluessel(name);
    const treffer = Object.entries(profile)
      .filter(([k, pr]) => !pr.id && !/^[0-9a-f]{32}$/i.test(k))
      .map(([, pr]) => pr)
      .filter((pr) => (pr.namen ?? [pr.name]).some((n) => namensSchluessel(n) === schluessel));
    return treffer.length === 1 ? treffer[0] : undefined;
  }, [profile, findeProfil]);

  const echterName = useCallback((name: string, id?: string) => {
    // Bewusst ohne Automatik: die Konto-IDs beider Quellen stimmen nicht
    // ueberein, und ein Abgleich ueber den Namen trifft regelmaessig mehrere
    // Konten. Ein falsch aufgeloester Name waere schlimmer als der Tarnname,
    // deshalb gilt nur, was von Hand bestaetigt wurde.
    return findeProfil(name, id)?.anzeige || name;
  }, [findeProfil]);

  /**
   * Ein Bild annehmen - aus der Zwischenablage, per Ziehen oder ueber Auswahl.
   */



  /**
   * Den Text aus dem Bild lesen.
   *
   * Die Erkennung laeuft im Browser - kein fremder Dienst, kein Schluessel,
   * keine Kosten. Das Sprachpaket holt der Browser beim ersten Mal einmalig
   * und behaelt es danach.
   *
   * Was hier herauskommt, ist ausdruecklich nur der abgelesene Text. Zahlen
   * daraus wandern nicht in einen Beitrag: was in einem fremden Screenshot
   * steht, ist nicht geprueft. Gebraucht wird der Text, um die Namen zu
   * finden - die Werte dazu kommen anschliessend aus den Turnierdaten.
   */

  /* ------------------------------------------------------- Spielersuche */

  /**
   * Einen getippten Namen einem Teilnehmer dieses Spieltags zuordnen.
   *
   * Gesucht wird ausschliesslich unter denen, die hier tatsaechlich gespielt
   * haben - ein Name, der nicht im Feld steht, bleibt ohne Treffer, statt
   * irgendeinen aehnlichen Spieler unterzuschieben. Verglichen wird ueber
   * saemtliche bekannten Schreibweisen eines Kontos, damit auch der
   * Turnier-Tarnname greift.
   *
   * Die Stufen werden der Reihe nach probiert und bei der ersten, die etwas
   * findet, wird abgebrochen. Bleiben dort mehrere Spieler uebrig, gilt die
   * Eingabe als mehrdeutig - dann wird nachgefragt statt geraten.
   */
  /**
   * Alle Schreibweisen, unter denen ein Spieler auffindbar sein soll:
   * der Turniername, der gepflegte Anzeigename und jeder Name, unter dem
   * dieses Epic-Konto schon einmal angetreten ist.
   */
  const schluesselFuer = useCallback((name: string, id?: string) => {
    const alle = new Set<string>([name]);
    const pr = findeProfil(name, id);
    if (pr?.anzeige) alle.add(pr.anzeige);
    // Das X-Konto gehoert dazu.
    //
    // Auf einer Statistikkarte steht selten der Turniername, sondern das
    // Konto - "@shxrkFNBR" statt "shxrk". Ohne diesen Schluessel findet der
    // Abgleich in so einem Screenshot niemanden, obwohl jeder Name dasteht.
    if (pr?.x) alle.add(pr.x);
    for (const n of pr?.namen ?? []) alle.add(n);
    if (id) for (const n of namen[id]?.namen ?? []) alle.add(n);
    return [...alle].map(namensSchluessel).filter((k) => k.length > 1);
  }, [findeProfil, namen]);

  /**
   * Die Stufen der Namenssuche, von streng nach nachsichtig. Es gewinnt die
   * erste Stufe, die ueberhaupt etwas findet - so schlaegt ein genauer Treffer
   * immer eine blosse Aehnlichkeit.
   */
  const suchStufen = useCallback((q: string): Array<(k: string) => boolean> => [
    (k) => k === q,
    (k) => k.startsWith(q) || q.startsWith(k),
    (k) => k.includes(q) || q.includes(k),
    // Zuletzt Vertipper und Diktierfehler, aber nur bei laengeren Eingaben:
    // bei drei Zeichen waeren zwei Abweichungen schon ein anderer Name.
    (k) => q.length >= 4 && abstand(k, q) <= (q.length >= 6 ? 2 : 1),
  ], []);

  const findeTeilnehmer = useCallback((eingabe: string) => {
    const q = namensSchluessel(eingabe);
    const roh = einzelwerte;
    if (q.length < 2 || !roh.length) return { treffer: [], namen: [] as string[] };

    const kandidaten = roh.map((sp) => ({
      spieler: { name: findeProfil(sp.name, sp.epicId)?.anzeige || sp.name, id: sp.epicId },
      schluessel: schluesselFuer(sp.name, sp.epicId),
    }));

    for (const passt of suchStufen(q)) {
      const gefunden = kandidaten.filter((c) => c.schluessel.some(passt));
      if (gefunden.length) {
        return {
          treffer: gefunden.map((c) => c.spieler),
          namen: gefunden.map((c) => c.spieler.name),
        };
      }
    }
    return { treffer: [], namen: [] as string[] };
  }, [einzelwerte, findeProfil, schluesselFuer, suchStufen]);

  /**
   * Dasselbe eine Ebene hoeher: welches Team gehoert zu diesem Namen?
   *
   * Bei den Teamwerten fuehrt Epic keine Einzelspieler - dort gehoeren beide
   * Namen zu einer Zeile. Wer im Team-Modus "Cringe" tippt, meint deshalb das
   * Duo mitsamt Partner, nicht einen einzelnen Spieler.
   */
  const findeTeam = useCallback((eingabe: string) => {
    const q = namensSchluessel(eingabe);
    if (q.length < 2 || !eintraege.length) return { treffer: [] as Eintrag[], namen: [] as string[] };

    const kandidaten = eintraege.map((e) => ({
      eintrag: e,
      schluessel: e.players.flatMap((sp) => schluesselFuer(sp.name, sp.id)),
    }));

    for (const passt of suchStufen(q)) {
      const gefunden = kandidaten.filter((c) => c.schluessel.some(passt));
      if (gefunden.length) {
        return {
          treffer: gefunden.map((c) => c.eintrag),
          namen: gefunden.map((c) => c.eintrag.players
            .map((sp) => kurzName(echterName(sp.name, sp.id))).join(' + ')),
        };
      }
    }
    return { treffer: [] as Eintrag[], namen: [] as string[] };
  }, [eintraege, schluesselFuer, suchStufen, echterName]);

  /* ------------------------------------------------ Vollansicht je Kennzahl */

  /** Die Bestenliste, die gerade in voller Laenge offen steht. */
  const offeneListe = useMemo(
    () => aktiveListen.find((b) => b.schluessel === vollansicht) ?? null,
    [aktiveListen, vollansicht]);

  /**
   * Alle Teilnehmer mit allen Kennzahlen nebeneinander. Die Tabelle entsteht
   * aus den Bestenlisten selbst - jede fuehrt ohnehin das ganze Feld, hier
   * werden sie nur quer gestellt: eine Zeile je Spieler, eine Spalte je
   * Kennzahl. Dadurch stimmt jede Zahl in der Tabelle mit der Kachel ueberein,
   * ohne dass irgendwo ein zweiter Rechenweg entsteht.
   */
  const gesamtTabelle = useMemo(() => {
    const zeilen = new Map<string,
      { spieler: string[]; ids?: string[]; werte: Record<string, number> }>();
    for (const b of aktiveListen) {
      for (const pl of b.alle ?? b.plaetze) {
        // Die Konto-ID identifiziert eindeutig, der Name ist die Rueckfallebene.
        const k = pl.ids?.filter(Boolean).join('|') || pl.spieler.join('|');
        if (!k) continue;
        if (!zeilen.has(k)) zeilen.set(k, { spieler: pl.spieler, ids: pl.ids, werte: {} });
        zeilen.get(k)!.werte[b.schluessel] = pl.wert;
      }
    }
    return [...zeilen.values()];
  }, [aktiveListen]);

  /**
   * Welche Spalten die Gesamttabelle bekommt. "Lowest Damage Ratio"
   * ist dieselbe Kennzahl wie "Best Damage Ratio", nur andersherum
   * sortiert - nebeneinander waeren das zwei wortgleiche Spalten. Deshalb
   * faellt jede Liste weg, deren Werte sich Zeile fuer Zeile mit einer
   * frueheren decken.
   */
  const tabellenSpalten = useMemo(() => {
    if (!gesamtTabelle.length) return aktiveListen;
    const behalten: Bestenliste[] = [];
    for (const b of aktiveListen) {
      const doppelt = behalten.some((a) => gesamtTabelle.every(
        (z) => z.werte[a.schluessel] === z.werte[b.schluessel]));
      if (!doppelt) behalten.push(b);
    }
    return behalten;
  }, [aktiveListen, gesamtTabelle]);

  /**
   * Alle Werte eines Spielers, nach seiner Platzierung sortiert. Die Zahlen
   * kommen aus denselben Bestenlisten wie die Kacheln - es wird nichts neu
   * gerechnet, nur herausgesucht, wo dieser Spieler jeweils steht.
   *
   * Gezaehlt wird ueber die entdoppelten Spalten: auf einer Spielerkarte waere
   * "Lowest Damage Ratio" dieselbe Zahl ein zweites Mal, nur mit dem Platz
   * von hinten gezaehlt.
   */
  const karteWerte = useMemo(() => {
    if (!karteSpieler) return [];
    return tabellenSpalten.map((b) => {
      const feld = b.alle ?? b.plaetze;
      const i = feld.findIndex((pl) => (
        karteSpieler.id && pl.ids?.[0]
          ? pl.ids[0] === karteSpieler.id
          : namensSchluessel(pl.spieler[0] ?? '') === namensSchluessel(karteSpieler.name)));
      if (i < 0) return null;
      return { liste: b, platz: i + 1, wert: feld[i].wert, von: feld.length };
    }).filter(Boolean).sort((a, b) => a!.platz - b!.platz) as Array<{
      liste: Bestenliste; platz: number; wert: number; von: number;
    }>;
  }, [tabellenSpalten, karteSpieler]);

  /** Sucht in Name, gepflegtem Anzeigenamen, frueheren Namen, Land und Region. */
  const suchTreffer = useCallback((spieler: string[], ids?: string[]) => {
    const q = vollSuche.trim().toLowerCase();
    if (!q) return true;
    return spieler.some((n, i) => {
      const pr = findeProfil(n, ids?.[i]);
      return [n, pr?.anzeige, pr?.land, pr?.region, ...(pr?.namen ?? [])]
        .some((t) => !!t && t.toLowerCase().includes(q));
    });
  }, [vollSuche, findeProfil]);

  // Mit Escape wieder zu - wie bei jedem Fenster, das sich ueberlegt.
  useEffect(() => {
    if (!vollansicht) return;
    const zu = (e: KeyboardEvent) => { if (e.key === 'Escape') setVollansicht(null); };
    window.addEventListener('keydown', zu);
    return () => window.removeEventListener('keydown', zu);
  }, [vollansicht]);

  /** Unter welchen Namen ist dieser Spieler sonst schon angetreten? */
  const namensVorschlaege = useCallback((name: string) => {
    // Ueber den vergleichbaren Kernnamen: "tryonа" mit kyrillischem a und
    // "tryona" sind damit derselbe Schluessel.
    const kern = namensSchluessel(name);
    if (!kern) return [];
    const treffer: string[] = [];
    for (const eintrag of Object.values(namen)) {
      if (!eintrag.namen.some((n) => namensSchluessel(n) === kern)) continue;
      // Erst die Namen mit anderem Kern - das sind die eigentlich gesuchten.
      for (const n of eintrag.namen) {
        if (namensSchluessel(n) !== kern && !treffer.includes(n)) treffer.push(n);
      }
      for (const n of eintrag.namen) {
        if (!treffer.includes(n) && n !== name) treffer.push(n);
      }
    }
    return treffer.slice(0, 8);
  }, [namen]);

  /** Name samt X-Konto, sofern eines hinterlegt ist. */
  const mitKonto = useCallback((name: string, id?: string) => {
    const p = findeProfil(name, id);
    return p?.x ? `@${p.x}` : kurzName(p?.anzeige || name);
  }, [findeProfil]);

  /**
   * Das Herkunftsland eines Spielers.
   *
   * Zwei Quellen, in dieser Reihenfolge:
   *
   *   1. Das gepflegte Profil. Was von Hand eingetragen wurde, gilt - es ist
   *      die einzige Angabe, die jemand geprueft hat.
   *   2. Die Spielerliste der Szene-Quelle, ueber die Konto-ID. Dort haben
   *      3538 von 4071 Konten ein Land hinterlegt; es sind dieselben Flaggen,
   *      die auf der Statistikseite stehen.
   *
   * Ueber die Konto-ID und sonst gar nicht. Nach dem Namen zu suchen hiesse,
   * einem Nachahmer die Herkunft des Profis anzuheften - genau der Fehler,
   * wegen dem die Zuordnung ueberhaupt auf die ID umgestellt wurde.
   */
  const landFuer = useCallback((name: string, id?: string): string => {
    const p = findeProfil(name, id);
    if (p?.land) return p.land;
    return (id && szeneLaender[id]) || '';
  }, [findeProfil, szeneLaender]);

  /**
   * Der Zweitwert hinter einer Zeile.
   *
   * In einer Liste "die meisten Eliminierungen" sagt die Punktzahl nichts -
   * sie gehoert zur Turnierwertung, nicht zu dieser Frage. Der Schaden
   * dagegen ordnet die Eliminierungen ein: dreizehn Elims mit 3550 Schaden
   * sind etwas anderes als dreizehn mit 2100.
   *
   * Summiert ueber die genannten Konten - bei einem Duo also ueber beide.
   * Gibt null zurueck, wenn zu keinem davon Einzelwerte vorliegen; dann
   * bleibt die Klammer weg, statt eine Null hinzuschreiben.
   */
  const zweitwertVon = useCallback(
    (ids: Array<string | undefined>, feld: keyof SpielerWert): number | null => {
      let summe = 0;
      let gefunden = false;
      for (const id of ids) {
        if (!id) continue;
        const sp = einzelwerteNachId.get(id);
        if (!sp) continue;
        summe += Number(sp[feld] ?? 0);
        gefunden = true;
      }
      return gefunden ? summe : null;
    }, [einzelwerteNachId]);

  /**
   * Ein Spieler mit eigener Flagge davor. In einem Duo hat jeder seine
   * eigene Herkunft - eine Flagge fuer beide waere schlicht falsch.
   */
  const mitFlagge = useCallback((name: string, id?: string) => {
    const p = findeProfil(name, id);
    // Ohne hinterlegtes Land die Weltkugel - so steht in jeder Zeile ein
    // Zeichen und der Name rutscht nicht aus der Reihe.
    const f = flagge(landFuer(name, id)) || String.fromCodePoint(0x1f310);
    return `${f} ${p?.x ? `@${p.x}` : kurzName(p?.anzeige || name)}`.trim();
  }, [findeProfil, landFuer]);


  /**
   * Welche Spieler des Spieltags stecken im erkannten Text?
   *
   * Gesucht wird von den Teilnehmern aus, nicht von den Woertern aus, und ein
   * Name zaehlt nur bei genauer Uebereinstimmung. Die nachsichtigen Stufen der
   * Spielersuche waeren hier fehl am Platz: wer selbst tippt, meint einen
   * bestimmten Namen und darf sich vertippen - ein Fliesstext dagegen enthaelt
   * hunderte Woerter, von denen keines gemeint ist. So wurde aus dem Wort
   * "Championship" schon einmal der Spieler "pxmp".
   *
   * Verglichen wird ausserdem nur gegen dieses Teilnehmerfeld. Ein Name, der
   * im Bild steht, hier aber nicht antritt, wird bewusst nicht angeboten.
   */

  /**
   * Welche Runde des Spieltags ist welche?
   *
   * Die Nummer soll fuer die ganze Lobby gelten, nicht je Team gezaehlt
   * werden: sonst hiesse dieselbe Runde beim einen "Game 2" und beim
   * anderen "Game 1", nur weil eines der Teams frueher ausgestiegen ist.
   * Epic gibt jeder Runde eine eigene Kennung, die bei allen Teams gleich
   * ist - danach wird sortiert, und zwar nach dem Ende der Runde.
   */
  const rundenNummern = useMemo(() => {
    const ende = new Map<string, number>();
    for (const e of eintraege) {
      for (const m of e.matches ?? []) {
        const id = m.sessionId || m.endTime;
        if (!id) continue;
        const t = m.endTime ? new Date(m.endTime).getTime() : 0;
        const bisher = ende.get(id);
        if (bisher === undefined || t < bisher) ende.set(id, t);
      }
    }
    const nummer = new Map<string, number>();
    [...ende.entries()].sort((a, b) => a[1] - b[1])
      .forEach(([id], i) => nummer.set(id, i + 1));
    return nummer;
  }, [eintraege]);

  /**
   * In welchen Runden hat dieses Team gewonnen?
   *
   * Leer, wenn sich keine Runde zuordnen laesst - dann steht im Beitrag die
   * Zahl der Siege statt einer erfundenen Rundennummer.
   */
  const siegRunden = useCallback((e: Eintrag) => {
    const nrn = (e.matches ?? [])
      .filter((m) => m.placement === 1)
      .map((m) => rundenNummern.get(m.sessionId || m.endTime || ''))
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);
    if (!nrn.length) return '';
    return nrn.length === 1
      ? `Game ${nrn[0]}`
      : `Games ${nrn.join(' + ')}`;
  }, [rundenNummern]);

  /** Alles, was eine Auswahl ausser dem einzelnen Team braucht. */
  const auswahlHilfe = useMemo<AuswahlHilfe>(() => ({
    feld: eintraege,
    siegRunden,
    rundeVon: (m) => rundenNummern.get(m.sessionId || m.endTime || ''),
    schadenVon: (e) => zweitwertVon(e.players.map((p) => p.id), 'damage'),
  }), [eintraege, siegRunden, rundenNummern, zweitwertVon]);

  /**
   * Alles, was das Kurzbefehl-Feld gerade versteht.
   *
   * Bewusst aus den geladenen Daten gebaut und nicht als feste Liste
   * hingeschrieben: so steht hier nur, was zu diesem Cup auch wirklich geht.
   * Fuehrt ein Spieltag keine Einzelwerte, fehlt der Abschnitt - und die
   * Zahl unten stimmt trotzdem.
   */
  const befehlsGruppen = useMemo(() => {
    const gruppen: Array<{
      titel: string; hinweis: string;
      befehle: Array<{ b: string; e: string }>;
    }> = [];

    gruppen.push({
      titel: 'Fragen ans Feld',
      hinweis: 'Sucht heraus, wer eine Bedingung erfüllt. Die Zahl darin ist frei — '
        + '„3 wins“, „150 points“, „30 elims“ gehen genauso.',
      befehle: AUSWAHLBEFEHLE.map((x) => ({ b: x.beispiel, e: x.erklaerung })),
    });

    const runden = rundenZahl(eintraege);
    if (runden) {
      gruppen.push({
        titel: 'Runde für Runde',
        hinweis: `Dieser Spieltag hatte ${runden} Runden — je eine Frage pro Runde.`,
        befehle: Array.from({ length: runden }, (_, i) => ({
          b: `game ${i + 1} winner`,
          e: `wer Runde ${i + 1} gewonnen hat`,
        })),
      });
    }

    /** Je Kennzahl zwei Befehle: die Spitze und eine laengere Liste. */
    const ausKennzahlen = (liste: Bestenliste[]) => liste.flatMap((k) => {
      const name = spaltenName(k.titel).toLowerCase();
      return [
        { b: name, e: `${k.titel} — die besten fünf` },
        { b: `top 10 ${name}`, e: `${k.titel} — die besten zehn` },
      ];
    });

    const teamListen = stats?.bestenlisten ?? [];
    if (teamListen.length) {
      gruppen.push({
        titel: 'Team-Kennzahlen',
        hinweis: 'Werte je Duo, direkt von Epic. Eine Zahl im Befehl setzt die Länge.',
        befehle: ausKennzahlen(teamListen),
      });
    }

    if (spielerListen.length) {
      gruppen.push({
        titel: 'Einzelwerte',
        hinweis: `Werte je Spieler von ${einzelQuelle ?? 'der Szene-Quelle'} — `
          + 'nur bei „Player Stats“.',
        befehle: ausKennzahlen(spielerListen),
      });
    }

    gruppen.push({
      titel: 'Reihenfolge und Vorlagen',
      hinweis: 'Der Endstand und die fertigen Beitragsformen.',
      befehle: [
        { b: 'top 5', e: 'Endstand, die besten fünf' },
        { b: 'top 10', e: 'Endstand, die besten zehn' },
        { b: 'top 20', e: 'Endstand, die besten zwanzig' },
        { b: 'standings', e: 'Endstand in voller Länge' },
        { b: 'endstand', e: 'dasselbe auf Deutsch getippt' },
        { b: 'qualified', e: 'Herkunft der Qualifizierten, nach Ländern' },
        { b: 'quali 10', e: 'dasselbe für die besten zehn' },
        { b: 'region', e: 'Herkunft nach Wettkampfregionen' },
        { b: 'country', e: 'Herkunft nach Ländern' },
        { b: 'rank 3', e: 'Endstand ab dem dritten Platz gezählt' },
      ],
    });

    // Jeder Teilnehmer ist selbst ein Befehl - auf Team Stats das ganze Duo,
    // auf Player Stats der einzelne Spieler.
    const namen = [...new Set(eintraege.flatMap((e) => e.players.map((sp) => sp.name)))]
      .map((n) => kurzName(n))
      .filter((n) => n.length > 1)
      .sort((a, b) => a.localeCompare(b));
    if (namen.length) {
      gruppen.push({
        titel: 'Namen aus diesem Spieltag',
        hinweis: 'Ein Name genügt: bei Team Stats kommt das Duo samt Partner, '
          + 'bei Player Stats die Spielerkarte. Tippfehler verzeiht die Suche.',
        befehle: namen.map((n) => ({ b: n, e: 'alle Werte dazu' })),
      });
    }

    return gruppen;
  }, [eintraege, stats, spielerListen, einzelQuelle]);

  const befehlsZahl = useMemo(
    () => befehlsGruppen.reduce((n, g) => n + g.befehle.length, 0), [befehlsGruppen]);

  /*
   * Woraus fuer die eigene Liste gewaehlt wird.
   *
   * Ohne Suchtext die Spieler einer Region, nach Eliminierungen sortiert -
   * das sind die, "die man kennt". Mit Suchtext das Ergebnis der Suche,
   * damit auch jemand aus einer anderen Region hineinkommt.
   *
   * Beides ueber dieselbe Schnittstelle wie die Statistikseite; der
   * angezeigte Name ist schon der gepflegte, nicht der Ingame-Name von
   * heute.
   */
  useEffect(() => {
    if (vorlage !== 'eigene') return;
    let weg = false;
    const q = eigeneSuche.trim();

    const uhr = setTimeout(() => {
      void (async () => {
        try {
          const pfad = q.length >= 2
            ? `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`
            : `/api/szene-stats?region=${eigeneRegion}&sort=elims&limit=60`;
          const j = await (await fetch(pfad)).json();
          if (weg) return;
          const roh = Array.isArray(j?.spieler) ? j.spieler : [];
          setEigeneListe(roh.map((x: {
            epicId: string; anzeige?: string; name?: string;
            land?: string | null; bild?: string | null;
          }) => ({
            epicId: x.epicId,
            anzeige: x.anzeige || x.name || x.epicId,
            land: x.land ?? null,
            bild: x.bild ?? null,
          })));
        } catch { if (!weg) setEigeneListe([]); }
      })();
    }, q ? 300 : 0);

    return () => { weg = true; clearTimeout(uhr); };
  }, [vorlage, eigeneRegion, eigeneSuche]);

  const cupName = cup?.titel ?? '';
  const tagName = aktuellesFenster
    ? (aktuellesFenster.istFinale ? 'Finale' : new Date(aktuellesFenster.begin)
        .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }))
    : '';

  /** Der Vorschlag zur gewaehlten Vorlage - englisch, wie die Beitraege. */
  const vorlagenText = useMemo(() => {
    /*
     * Die eigene Liste steht vor allem anderen.
     *
     * Sie braucht keinen Cup und darf deshalb nicht an der Pruefung
     * darunter scheitern - die verlangt geladene Turnierwerte.
     */
    if (vorlage === 'eigene') {
      const NL = '\n';
      const kopfZeile = eigenerKopf.trim();
      const nachsatz = beschreibung.trim();

      if (!eigeneWahl.length) {
        return [kopfZeile, nachsatz].filter(Boolean).join(NL + NL)
          || 'Titel schreiben und rechts Spieler auswählen.';
      }

      const zeilen = eigeneWahl.map((sp, i) => {
        const marke = eigeneNummern
          ? (['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`)
          : '•';
        return `${marke} ${mitFlagge(sp.anzeige, sp.epicId)}`.replace(/\s+/g, ' ');
      });

      return [kopfZeile, nachsatz, zeilen.join(NL)]
        .filter(Boolean).join(NL + NL);
    }

    if (!stats) return '';
    const kopf = `${cupName}${tagName ? ` — ${tagName}` : ''}`;
    const NL = '\n';
    const zusatz = beschreibung.trim() ? NL + beschreibung.trim() : '';

    if (vorlage === 'spielerkarte') {
      if (!karteSpieler) {
        return `${kopf}${zusatz}${NL}${NL}`
          + 'Namen ins Kurzbefehl-Feld tippen oder unten auswählen.';
      }
      if (!karteWerte.length) {
        // Kein erfundener Ersatz: liegt zu diesem Spieler nichts vor, sagt der
        // Text genau das.
        return `${kopf}${zusatz}${NL}${NL}`
          + `Zu ${kurzName(karteSpieler.name)} liegen in diesem Spieltag keine `
          + 'Einzelwerte vor.';
      }
      // Nach Platzierung sortiert: was der Spieler am besten kann, steht oben.
      //
      // Ohne "Most" und "Best": auf einer Karte ueber einen einzelnen Spieler
      // liest sich "Most Eliminations: 43" so, als fuehre er die Wertung an -
      // der Platz dahinter sagt ohnehin genauer, wo er steht.
      const zeilen = karteWerte.map((k) => {
        const wert = k.liste.einheit
          ? `${k.wert} ${k.liste.einheit}`
          : k.wert.toLocaleString('en-US');
        return `${k.liste.symbol} ${spaltenName(k.liste.titel)}: ${wert} (#${k.platz})`;
      });
      return `${mitFlagge(karteSpieler.name, karteSpieler.id)} — ${kopf}${zusatz}`.trim()
        + NL + NL + zeilen.join(NL);
    }

    if (vorlage === 'bestenliste') {
      // Eine einzelne Kennzahl mit mehreren Plaetzen - das Gegenstueck zum
      // Rueckblick, der je Kennzahl nur den Spitzenwert zeigt.
      const liste = aktiveListen.find((b) => gewaehlteListen.includes(b.schluessel))
        ?? aktiveListen[0];
      if (!liste) return kopf + zusatz;

      /*
       * Was in der Klammer am Ende steht.
       *
       * Zuerst stand dort der Wert selbst noch einmal - "1. Twi (13)" - und
       * in den Auswahllisten die Punktzahl. Beides sagt zu einer Frage wie
       * "die meisten Eliminierungen" nichts: der Wert steht schon davor, und
       * die Punkte gehoeren zur Turnierwertung.
       *
       * Der Schaden dagegen ordnet die Zahl ein. Bei einer Schadensliste
       * waere er die Wiederholung des Hauptwerts, dort treten die
       * Eliminierungen an seine Stelle.
       */
      const zweitFeld: keyof SpielerWert =
        liste.schluessel === 'damage' ? 'elims' : 'damage';
      const zweitTitel = zweitFeld === 'elims' ? 'Elims' : 'Damage';

      const roh = liste.plaetze.slice(0, anzahl).map((pl, i) => ({
        pl, i, zweit: zweitwertVon(pl.ids ?? [], zweitFeld),
      }));
      // Nur ankuendigen, was auch dasteht.
      const mitKlammer = roh.some((x) => (x.zweit ?? 0) > 0);

      const zeilen = roh.map(({ pl, i, zweit }) => {
        // Bei den Einzelwerten steht die Konto-ID im Platz mit drin.
        const namen = pl.spieler.map((n, k) => mitFlagge(n, pl.ids?.[k])).join(' + ');
        const wert = liste.einheit
          ? `${pl.wert} ${liste.einheit}`
          : pl.wert.toLocaleString('en-US');
        const marke = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
        const klammer = mitKlammer && zweit
          ? ` (${Math.round(zweit).toLocaleString('en-US')})` : '';
        return `${marke} ${namen}: ${wert}${klammer}`.replace(/\s+/g, ' ');
      });

      const region = aktuellesFenster?.region && aktuellesFenster.region !== 'GLOBAL'
        ? ` (${aktuellesFenster.region})` : '';
      return `🏆 ${cupName}${region}${tagName ? ` — ${tagName}` : ''}`
        + NL + `${liste.symbol} ${liste.titel}`
        + (mitKlammer ? ` (${zweitTitel})` : '')
        + zusatz + NL + NL + zeilen.join(NL);
    }

    if (vorlage === 'spieler') {
      const e = eintraege.find((x) => x.rank === spotlight);
      if (!e) return `${kopf}${zusatz}${NL}${NL}Wähle unten ein Team aus.`;
      const namen = e.players.map((p) => mitFlagge(p.name, p.id)).join(' + ');
      // Ueber das ganze Feld statt nur ueber die Top 5: sonst bleibt die Karte
      // eines Teams aus dem Mittelfeld leer, obwohl seine Werte vorliegen.
      // Der Platz steht dabei mit dabei, damit die Zahl einzuordnen ist.
      const zeilen = tabellenSpalten
        .filter((b) => gewaehlteListen.includes(b.schluessel))
        .map((b) => {
          const feld = b.alle ?? b.plaetze;
          const i = feld.findIndex((pl) => pl.rank === e.rank);
          if (i < 0) return null;
          const wert = b.einheit
            ? `${feld[i].wert} ${b.einheit}`
            : feld[i].wert.toLocaleString('en-US');
          // Ohne den Rang in Klammern: die Zeilen stehen ohnehin nach ihm
          // sortiert, "Eliminierungen: 21 (#1)" sagt also zweimal dasselbe.
          return { text: `${b.symbol} ${spaltenName(b.titel)}: ${wert}`,
            platz: i + 1 };
        }).filter(Boolean)
        .sort((a, b) => a!.platz - b!.platz)
        .map((x) => x!.text);
      return `${namen} — ${kopf}${zusatz}`.trim() + NL + NL
        + `Finished #${e.rank} with ${e.points} points` + NL
        + zeilen.join(NL);
    }

    if (vorlage === 'rueckblick') {
      const zeilen = aktiveListen
        .filter((b) => gewaehlteListen.includes(b.schluessel))
        .map((b) => {
          const p = b.plaetze[0];
          if (!p) return null;
          const namen = p.spieler.map((n, k) => mitFlagge(n, p.ids?.[k])).join(' + ');
          const wert = b.einheit ? `${p.wert} ${b.einheit}` : p.wert.toLocaleString('en-US');
          return `${b.symbol} ${b.titel}: ${namen} (${wert})`.replace(/\s+/g, ' ');
        }).filter(Boolean);
      return `${kopf} — Stats Recap${zusatz}${NL}${NL}${zeilen.join(NL)}`;
    }

    if (vorlage === 'qualifiziert') {
      // Jeder Spieler zaehlt einzeln: in einem Duo koennen zwei Laender
      // stecken, eine Zaehlung je Team wuerde eines davon verschlucken.
      const top = eintraege.slice(0, anzahl);
      const zaehler: Record<string, number> = {};
      let ohne = 0;
      for (const e of top) {
        for (const sp of e.players) {
          const pr = findeProfil(sp.name, sp.id);
          // Dasselbe Land wie ueberall sonst: gepflegtes Profil zuerst,
          // sonst die Szene-Quelle. Sonst zaehlte diese Statistik nur die
          // von Hand gepflegten Spieler und meldete alle uebrigen als
          // "ohne Angabe", obwohl ihr Land bekannt ist.
          const land = landFuer(sp.name, sp.id);
          const schluessel = zaehlung === 'region'
            ? (pr?.region ?? (land ? LAND_REGION[land.toUpperCase()] : undefined))
            : land;
          if (schluessel) zaehler[schluessel] = (zaehler[schluessel] ?? 0) + 1;
          else ohne++;
        }
      }

      let zeilen: string[];
      if (zaehlung === 'region') {
        // Alle Wettkampfregionen mit Treffern, danach der Rest als eine Zeile.
        zeilen = REGIONEN
          .filter((r) => zaehler[r.code])
          .sort((a, b) => zaehler[b.code] - zaehler[a.code])
          .map((r) => `${flagge(r.flagge)} ${r.code}: ${zaehler[r.code]}`);
        const uebrig = Object.entries(zaehler)
          .filter(([k]) => !REGIONEN.some((r) => r.code === k))
          .reduce((a, [, n]) => a + n, 0);
        zeilen.push(`Other regions: ${uebrig + ohne}`);
      } else {
        zeilen = Object.entries(zaehler)
          .sort((a, b) => b[1] - a[1])
          .map(([l, n]) => `${flagge(l)} ${l}: ${n}`);
        if (ohne) zeilen.push(`Unassigned: ${ohne}`);
      }

      return `Top ${anzahl} after ${stats.spiele} games — ${kopf}${zusatz}`
        + NL + NL + zeilen.join(NL);
    }

    if (vorlage === 'auswahl') {
      if (!auswahl) {
        return `${kopf}${zusatz}${NL}${NL}`
          + 'Frage ins Kurzbefehl-Feld tippen, etwa „all winners“ '
          + 'oder „200 points“.';
      }
      /*
       * Eine Bestenliste einzelner Spieler.
       *
       * Getrennt vom Rest, weil hier nichts aus der Teamwertung kommt: die
       * Zeilen sind einzelne Spieler, die Nummer ist ihr Platz in DIESER
       * Liste - nicht der Platz, den ihr Duo im Turnier belegt hat. Eine
       * Liste "die zehn meisten Eliminierungen", die mit "#63" anfaengt,
       * liest sich wie ein Fehler.
       */
      if (auswahl.soloFeld) {
        const feld = auswahl.soloFeld;
        const klammer = auswahl.soloKlammer;
        const roh = einzelwerte
          .map((sp) => ({ sp, wert: Number(sp[feld] ?? 0) }))
          .filter((x) => x.wert > 0)
          .sort((a, b) => b.wert - a.wert)
          .slice(0, auswahl.grenze ?? 10);

        if (!roh.length) {
          return `${auswahl.titel} — ${kopf}${zusatz}${NL}${NL}`
            + 'Zu diesem Spieltag liegen keine Einzelwerte vor.';
        }

        // Nur ankuendigen, was auch dasteht: fehlt der Zweitwert im ganzen
        // Feld, gehoert er auch nicht in die Ueberschrift.
        const mitKlammer = Boolean(klammer)
          && roh.some((x) => Number(x.sp[klammer!] ?? 0) > 0);

        const zeilen = roh.map((x, i) => {
          const marke = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
          const wert = auswahl.soloEinheit
            ? `${x.wert.toFixed(auswahl.soloNachkomma ?? 0)} ${auswahl.soloEinheit}`
            : Math.round(x.wert).toLocaleString('en-US');
          const zweit = mitKlammer
            ? ` (${Math.round(Number(x.sp[klammer!] ?? 0)).toLocaleString('en-US')})`
            : '';
          return `${marke} ${mitFlagge(x.sp.name, x.sp.epicId)}: ${wert}${zweit}`
            .replace(/\s+/g, ' ');
        });

        const region = aktuellesFenster?.region && aktuellesFenster.region !== 'GLOBAL'
          ? ` (${aktuellesFenster.region})` : '';
        return `🏆 ${cupName}${region}${tagName ? ` — ${tagName}` : ''}`
          + NL + `📊 ${auswahl.titel}`
          + (mitKlammer && auswahl.soloKlammerTitel ? ` (${auswahl.soloKlammerTitel})` : '')
          + zusatz + NL + NL + zeilen.join(NL);
      }

      /*
       * Ohne Begrenzung, wo nach einer Bedingung gefragt wurde: "wer hat
       * ueberhaupt gewonnen?" will jeden Treffer sehen, nicht die ersten
       * paar. Wird der Beitrag zu lang, zeigt die Zeichenzahl darunter das an.
       *
       * Nennt der Befehl dagegen eine Anzahl, ist sie gemeint.
       */
      const treffer = eintraege.filter((e) => auswahl.passt(e, auswahlHilfe))
        .sort((a, b) => (auswahl.nach(b, auswahlHilfe) - auswahl.nach(a, auswahlHilfe))
          || (a.rank - b.rank))
        .slice(0, auswahl.grenze ?? Infinity);
      if (!treffer.length) {
        return `${auswahl.titel} — ${kopf}${zusatz}${NL}${NL}`
          + 'Nobody in this field matches.';
      }
      const zeilen = treffer.map((e) => {
        const namen = e.players.map((p) => mitFlagge(p.name, p.id)).join(' + ');
        return `#${e.rank} ${namen} — ${auswahl.wert(e, auswahlHilfe)}`
          .replace(/\s+/g, ' ');
      });
      return `${auswahl.titel} (${treffer.length}) — ${kopf}${zusatz}`
        + NL + NL + zeilen.join(NL);
    }

    /*
     * Medaillen fuer die ersten drei, danach die Tastenfeld-Ziffern.
     * Ab elf gibt es kein Zeichen mehr - dort steht wieder die blosse Zahl,
     * statt etwas Aehnliches zu erfinden.
     */
    const PLATZZEICHEN = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const zeilen = eintraege.slice(0, anzahl).map((e, i) => {
      const namen = e.players.map((p) => mitFlagge(p.name, p.id)).join(' + ');
      const marke = PLATZZEICHEN[i] ?? `${i + 1}.`;
      return `${marke} ${namen} — ${e.points} pts`.replace(/\s+/g, ' ');
    });
    return `${kopf} — Standings after ${stats.spiele} games${zusatz}`
      + NL + NL + zeilen.join(NL);
  }, [stats, eintraege, vorlage, anzahl, gewaehlteListen, cupName, tagName,
      mitKonto, mitFlagge, beschreibung, spotlight, aktiveListen,
      profile, zaehlung, karteSpieler, karteWerte, tabellenSpalten, auswahl,
      auswahlHilfe,
      // Die eigene Liste - ohne diese drei bliebe der Text stehen, waehrend
      // rechts schon jemand angeklickt ist.
      eigenerKopf, eigeneWahl, eigeneNummern]);

  // In Ordnern ohne Vorlage zaehlt allein der frei geschriebene Text.
  const ohneVorlage = aktiverOrdner.vorlagen.length === 0;
  /*
   * Dieser Ordner braucht keinen Cup.
   *
   * Ohne diese Ausnahme bliebe der ganze Bereich verborgen, solange keine
   * Turnierwerte geladen sind - und genau das ist hier ja der Punkt.
   */
  const ohneCup = aktiverOrdner.wert === 'eigene';
  const text = ohneVorlage ? freierText : (eigenerText ?? vorlagenText);

  // Wechselt die Vorlage oder die Auswahl, gilt wieder der Vorschlag.
  useEffect(() => { setEigenerText(null); },
    [vorlage, anzahl, spotlight, cupId, fensterId, ebeneEffektiv]);

  // Wechselt die Ebene, passen die vorher gewaehlten Kennzahlen nicht mehr.
  useEffect(() => {
    if (ebeneEffektiv === 'spieler' && spielerListen.length) {
      setGewaehlteListen(spielerListen.slice(0, 6).map((b) => b.schluessel));
    } else if (ebeneEffektiv === 'team' && stats) {
      setGewaehlteListen(stats.bestenlisten.slice(0, 6).map((b) => b.schluessel));
    }
  }, [ebeneEffektiv, spielerListen, stats]);

  /* ------------------------------------------- Grafik auf Epics Vorlage */

  /**
   * Die Masse der Vorlage, ausgemessen an public/assets/TEAM STATS.jpg.
   *
   * Die beiden Balken sind Teil des Hintergrundbildes, nicht gezeichnet -
   * deshalb muss der Text genau dorthin, wo sie liegen. Gemessen wurde
   * zeilenweise ueber die laengste Strecke gleicher Farbe:
   *
   *   tuerkiser Balken   y 480..578, x 411..933 (nach unten leicht versetzt)
   *   weisser Balken     y 590..662, x 277..1083
   *
   * Der tuerkise Balken laeuft schraeg - dreizehn Pixel auf vierundachtzig
   * Hoehe, also gut neun Grad. Genau diese Neigung bekommt auch der Titel,
   * sonst steht die Schrift schief im Balken statt mit ihm.
   */
  const VORLAGE = {
    // "groesse" ist der Startwert, "hoechstens" der Deckel. Der Deckel kommt
    // aus der Hoehe des Balkens, nicht aus dem Geschmack: der tuerkise ist
    // 98 Pixel hoch, der weisse 72. Anton hat eine Versalhoehe von etwa 0,73
    // der Schriftgroesse - 74 beziehungsweise 52 Pixel fuellen den Balken
    // also gut aus, ohne oben und unten anzustossen.
    titel: { x: 672, y: 530, breite: 455, groesse: 74, hoechstens: 74,
      neigung: -0.155 },
    namen: { x: 680, y: 626, breite: 750, groesse: 46, hoechstens: 52 },
    logo: { x: 1128, y: 30, groesse: 156 },
  };

  /** Ein Bild laden und auf das Ergebnis warten. */
  const bildLaden = (pfad: string) => new Promise<HTMLImageElement>((fertig, fehler) => {
    const b = new Image();
    b.onload = () => fertig(b);
    b.onerror = () => fehler(new Error(pfad));
    b.src = pfad;
  });

  /**
   * Text so gross wie moeglich, aber nicht breiter als der Balken.
   *
   * "CHAMPIONS" und "TWIS ACORN + TWIS BOLTZZEROO" sind verschieden lang;
   * eine feste Schriftgroesse liesse das eine verloren aussehen und das
   * andere ueber den Rand laufen.
   *
   * Der Wert waechst auch nach oben. Zuerst wurde nur verkleinert - dann
   * stand "AZATGO + KOS UPL" klein und verloren in einem Balken, der auf
   * einen doppelt so langen Namen ausgelegt ist. Die Obergrenze verhindert,
   * dass ein kurzer Titel wie "#4" den Balken sprengt.
   */
  const passendeGroesse = (g: CanvasRenderingContext2D, text: string,
                           start: number, maxBreite: number, deckel: number) => {
    const setze = (n: number) => {
      g.font = `${n}px AntonBeitrag, "Arial Black", sans-serif`;
      return g.measureText(text).width;
    };
    let groesse = Math.min(start, deckel);
    if (setze(groesse) > maxBreite) {
      while (groesse > 14 && setze(groesse) > maxBreite) groesse -= 1;
    } else {
      while (groesse < deckel && setze(groesse + 1) <= maxBreite) groesse += 1;
      setze(groesse);
    }
    return groesse;
  };

  /**
   * Die Turniergrafik zeichnen.
   *
   * Hintergrund, Titel, die beiden Namen - und oben rechts das FNCS-Zeichen,
   * aber nur bei einem FNCS-Turnier. Ein Logo auf einem Ranked Cup waere
   * eine Behauptung ueber den Cup, die nicht stimmt.
   */
  const zeichneVorlage = useCallback(async () => {
    const c = vorlagenLeinwand.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;

    let hintergrund: HTMLImageElement;
    try { hintergrund = await bildLaden('/assets/TEAM STATS.jpg'); }
    catch { return; }

    c.width = hintergrund.width;
    c.height = hintergrund.height;
    g.drawImage(hintergrund, 0, 0);

    const e = eintraege.find((x) => x.rank === spotlight);
    const namen = e
      ? e.players.map((sp) => (findeProfil(sp.name, sp.id)?.anzeige || sp.name).toUpperCase())
        .join(' + ')
      : '';
    // Ohne eigene Eingabe der Platz als Titel - "CHAMPIONS" nur, wo es
    // wirklich der erste ist.
    const titel = (vorlagenTitel.trim()
      || (e?.rank === 1 ? 'CHAMPIONS' : e ? `#${e.rank}` : '')).toUpperCase();

    // ------------------------------------------------------- Der Titel
    if (titel) {
      g.save();
      g.translate(VORLAGE.titel.x, VORLAGE.titel.y);
      g.transform(1, 0, VORLAGE.titel.neigung, 1, 0, 0);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      passendeGroesse(g, titel, VORLAGE.titel.groesse, VORLAGE.titel.breite,
        VORLAGE.titel.hoechstens);
      g.fillStyle = '#ffffff';
      g.fillText(titel, 0, 0);
      g.restore();
    }

    // -------------------------------------------------------- Die Namen
    if (namen) {
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      passendeGroesse(g, namen, VORLAGE.namen.groesse, VORLAGE.namen.breite,
        VORLAGE.namen.hoechstens);
      g.fillStyle = '#15161a';
      g.fillText(namen, VORLAGE.namen.x, VORLAGE.namen.y);
      g.restore();
    }

    // --------------------------------------------------- Das FNCS-Zeichen
    if (/fncs/i.test(cupName)) {
      try {
        const logo = await bildLaden('/assets/fncs-logo.png');
        const { x, y, groesse } = VORLAGE.logo;
        g.drawImage(logo, x, y, groesse, groesse);
      } catch { /* ohne Logo ist die Grafik trotzdem brauchbar */ }
    }
  }, [eintraege, spotlight, findeProfil, vorlagenTitel, cupName]);

  useEffect(() => { void zeichneVorlage(); }, [zeichneVorlage, schriftDa]);

  async function vorlageKopieren() {
    const c = vorlagenLeinwand.current;
    if (!c) return;
    await new Promise<void>((fertig) => c.toBlob(async (blob) => {
      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setVorlagenKopiert(true);
          setTimeout(() => setVorlagenKopiert(false), 1800);
        } catch { /* der Browser gibt die Zwischenablage nicht frei */ }
      }
      fertig();
    }, 'image/png'));
  }

  async function vorlageSpeichern() {
    const c = vorlagenLeinwand.current;
    if (!c) return;
    setVorlagenFehler('');
    try {
      await speichereLeinwand(
        c,
        `${(cupName || 'cup').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-team.png`,
      );
    } catch (e) {
      setVorlagenFehler(t(e instanceof Error ? e.message : String(e)));
    }
  }

  /** Die Grafik zum Beitrag. Alles wird direkt gezeichnet, ohne Fremdcode. */
  const zeichnen = useCallback(() => {
    const c = leinwand.current;
    if (!c || !stats) return;
    const B = 1200;
    const zeilen = text.split('\n').filter((z, i) => i > 1 || z);
    const H = Math.max(675, 260 + zeilen.length * 62);
    c.width = B; c.height = H;
    const g = c.getContext('2d');
    if (!g) return;

    // Hintergrund: dunkler Verlauf mit einem Lichtschein oben links, damit
    // die Flaeche nicht wie ein leeres Rechteck wirkt.
    const verlauf = g.createLinearGradient(0, 0, B, H);
    verlauf.addColorStop(0, '#0b0f16');
    verlauf.addColorStop(0.55, '#0d1420');
    verlauf.addColorStop(1, '#0a0d13');
    g.fillStyle = verlauf;
    g.fillRect(0, 0, B, H);

    const schein = g.createRadialGradient(120, 40, 0, 120, 40, 720);
    schein.addColorStop(0, 'rgba(56,189,248,0.16)');
    schein.addColorStop(1, 'rgba(56,189,248,0)');
    g.fillStyle = schein;
    g.fillRect(0, 0, B, H);

    // Feines Raster, das sich zum unteren Rand hin verliert
    g.strokeStyle = 'rgba(148,163,184,0.05)';
    g.lineWidth = 1;
    for (let x = 60; x < B; x += 60) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }

    // Farbiger Streifen an der linken Kante als Wiedererkennung
    const kante = g.createLinearGradient(0, 0, 0, H);
    kante.addColorStop(0, '#38bdf8');
    kante.addColorStop(1, '#0369a1');
    g.fillStyle = kante;
    g.fillRect(0, 0, 8, H);

    const [titelZeile, ...rest] = text.split('\n');
    // Name der Seite als kleine Zeile ueber dem Titel - so traegt jedes
    // heruntergeladene Bild seine Herkunft.
    g.font = '600 19px Segoe UI, system-ui, sans-serif';
    g.fillStyle = '#38bdf8';
    g.fillText(MARKE.name.toUpperCase(), 64, 62);

    g.fillStyle = '#f4f4f5';
    // Der Titel wird so weit verkleinert, bis er in die Breite passt -
    // Turniernamen sind manchmal sehr lang.
    let titelGroesse = 46;
    do {
      titelGroesse -= 2;
      g.font = `bold ${titelGroesse}px Segoe UI, Segoe UI Emoji, Apple Color Emoji, system-ui, sans-serif`;
    } while (g.measureText(titelZeile).width > B - 128 && titelGroesse > 22);
    g.fillText(titelZeile, 64, 118);

    g.strokeStyle = '#0284c7'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 146); g.lineTo(240, 146); g.stroke();

    let y = 222;
    for (const z of rest) {
      if (!z.trim()) { y += 20; continue; }
      // Der Wert in Klammern wird abgesetzt, damit er ins Auge faellt.
      const treffer = z.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const links = treffer ? treffer[1] : z;
      const wert = treffer ? treffer[2] : '';

      // Die Zeile stueckweise zeichnen: jedes Flaggenzeichen wird durch das
      // passende Bild ersetzt, weil Windows die Zeichen nicht darstellt. So
      // bekommt in einem Duo auch jeder Spieler seine eigene Flagge.
      g.font = '32px Segoe UI, Segoe UI Emoji, Apple Color Emoji, system-ui, sans-serif';
      g.fillStyle = '#e4e4e7';
      let x = 64;
      for (const teil of links.split(/([\u{1F1E6}-\u{1F1FF}]{2})/u)) {
        if (!teil) continue;
        if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(teil)) {
          const code = [...teil]
            .map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 97)).join('');
          const bild = flaggenBilder.current[code];
          if (bild?.complete && bild.naturalWidth) {
            g.drawImage(bild, x, y - 22, 36, 24);
            x += 42;
          }
        } else {
          g.fillText(teil, x, y);
          x += g.measureText(teil).width;
        }
      }

      if (wert) {
        g.font = 'bold 34px Segoe UI, Segoe UI Emoji, Apple Color Emoji, system-ui, sans-serif';
        g.fillStyle = '#38bdf8';
        const breite = g.measureText(wert).width;
        g.fillText(wert, B - 64 - breite, y);
      }
      y += 62;
    }

    g.strokeStyle = 'rgba(148,163,184,0.14)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(64, H - 84); g.lineTo(B - 64, H - 84); g.stroke();

    g.font = '21px Segoe UI, Segoe UI Emoji, Apple Color Emoji, system-ui, sans-serif';
    g.fillStyle = '#64748b';
    g.fillText(`${stats.teams} Teams · ${stats.spiele} Spiele`, 64, H - 48);

    // Unten rechts die eigene Kennung: Logo und Adresse.
    g.textAlign = 'right';
    g.font = '600 22px Segoe UI, system-ui, sans-serif';
    g.fillStyle = '#94a3b8';
    const kennung = MARKE.hinweis();
    g.fillText(kennung, B - 64, H - 46);
    const logo = logoBild.current;
    if (logo?.complete && logo.naturalWidth) {
      const seite = 40;
      const lx = B - 64 - g.measureText(kennung).width - 12 - seite;
      g.save();
      g.beginPath();
      g.roundRect(lx, H - 46 - seite + 10, seite, seite, 7);
      g.clip();
      g.drawImage(logo, lx, H - 46 - seite + 10, seite, seite);
      g.restore();
    }
    g.textAlign = 'left';
  }, [stats, text, ebeneEffektiv]);

  const zeichnenRef = useRef<(() => void) | null>(null);
  useEffect(() => { zeichnenRef.current = zeichnen; zeichnen(); }, [zeichnen]);

  /**
   * Einen Vorschlag aus echten Turnierdaten holen. Jeder Klick zaehlt eine
   * Variante weiter, damit nicht zweimal derselbe Text erscheint.
   */
  async function vorschlagHolen(art: string) {
    setLaedtVorschlag(art);
    setVorschlagHinweis('');
    const nr = (vorschlagNr[art] ?? -1) + 1;
    try {
      const r = await fetch(`/api/beitrag-vorschlag?art=${art}&nr=${nr}`);
      const j = await r.json();
      if (j.text) {
        setFreierText(j.text);
        // Am Ende der Varianten wieder von vorne beginnen.
        setVorschlagNr((alt) => ({ ...alt, [art]: j.varianten ? nr % j.varianten : 0 }));
      } else {
        setVorschlagHinweis(j.hinweis ?? 'Dazu liegen gerade keine Daten vor.');
      }
    } catch {
      setVorschlagHinweis(t('Vorschlag nicht abrufbar.'));
    } finally {
      setLaedtVorschlag(null);
    }
  }

  /** Alle Spieler der angezeigten Plaetze, ohne Doppelte. */
  const spielerListe = useMemo(() => {
    // Jeder Spieler einzeln, geschluesselt ueber die Konto-ID. Der blosse
    // Name taugt nicht: zwei Spieler koennen auf dasselbe Wort enden.
    const gefunden = new Map<string, { voll: string; id?: string }>();
    // Beide Datenquellen fuehren eigene Konto-IDs. Ohne Gegenprobe ueber den
    // Namen stuende jeder Spieler zweimal in der Liste - einmal je Quelle.
    const schonDa = new Set<string>();
    const merken = (voll: string, id?: string) => {
      const nk = namensSchluessel(voll);
      if (nk && schonDa.has(nk)) return;
      const k = id || nk;
      if (!k) return;
      gefunden.set(k, { voll, id });
      if (nk) schonDa.add(nk);
    };
    // Alle geladenen Teams, nicht nur die vordersten: wer auf Platz 14 steht,
    // kann trotzdem in einer Kennzahl vorne liegen und braucht sein Profil.
    for (const e of eintraege) {
      for (const p of e.players) merken(p.name, p.id);
    }
    // Dazu jeden, der irgendwo in einer Bestenliste auftaucht.
    for (const b of aktiveListen) {
      for (const pl of b.plaetze) {
        pl.spieler.forEach((n, i) => merken(n, pl.ids?.[i]));
      }
    }
    // Und bei den Einzelwerten wirklich jeden Spieler des Spieltags.
    for (const sp of einzelwerte) merken(sp.name, sp.epicId);
    return [...gefunden.entries()].map(([k, v]) => ({ schluessel: k, ...v }));
  }, [eintraege, aktiveListen, einzelwerte]);

  /**
   * Wer ins Mosaik kommt - und in welcher Reihenfolge.
   *
   * Dieselbe Rangfolge wie im Beitrag: Platz eins steht links. Genommen wird
   * die erste gewaehlte Bestenliste, sonst die Teamwertung des Spieltags.
   *
   * Geschickt werden mehr Konten als Streifen gebraucht werden. Nicht zu
   * jedem Spieler liegt ein Foto, und wer keins hat, soll nicht als
   * Silhouette danebenstehen - die Schnittstelle ueberspringt ihn und nimmt
   * den naechsten. Ohne Vorrat blieben sonst zwei Streifen uebrig, wo fuenf
   * stehen sollten.
   */
  const mosaikIds = useMemo(() => {
    /*
     * Bei der eigenen Liste zaehlt genau, wer angeklickt wurde.
     *
     * "Also einfach die Spieler, die da ausgewählt werden, werden dann auch
     * als Bild da angezeigt." Also keine Ergaenzung aus dem Turnierfeld -
     * wer nicht in der Liste steht, gehoert nicht ins Bild.
     */
    if (vorlage === 'eigene') {
      return eigeneWahl.map((x) => x.epicId).slice(0, 10);
    }

    const raus: string[] = [];
    const dazu = (id?: string) => {
      if (id && /^[0-9a-f]{32}$/i.test(id) && !raus.includes(id)) raus.push(id);
    };

    const erste = aktiveListen.find((b) => gewaehlteListen.includes(b.schluessel))
      ?? aktiveListen[0];
    if (erste) for (const pl of erste.plaetze) pl.ids?.forEach(dazu);
    if (raus.length < 12) for (const e of eintraege) e.players.forEach((x) => dazu(x.id));

    return raus.slice(0, 20);
  }, [aktiveListen, gewaehlteListen, eintraege, vorlage, eigeneWahl]);

  /**
   * Das Mosaik holen, sobald sich die Auswahl aendert.
   *
   * Erzeugt wird serverseitig - dort liegen die Fotos, und dort laesst sich
   * sauber zuschneiden. Zurueck kommt ein PNG, das hier nur noch angezeigt
   * und in die Zwischenablage gelegt wird.
   */
  useEffect(() => {
    let weg = false;
    let alteUrl: string | null = null;

    const lauf = async () => {
      if (!mosaikIds.length) {
        setMosaikUrl((vorher) => { if (vorher) URL.revokeObjectURL(vorher); return null; });
        setMosaikFehler(''); setMosaikLaedt(false);
        return;
      }
      setMosaikLaedt(true); setMosaikFehler('');
      try {
        const r = await fetch(`/api/beitrag-bild?ids=${mosaikIds.join(',')}`
          + `&anzahl=${mosaikAnzahl}`, { cache: 'no-store' });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          if (!weg) { setMosaikUrl(null); setMosaikFehler(j?.hinweis ?? j?.error ?? 'kein Bild'); }
          return;
        }
        const namen = decodeURIComponent(r.headers.get('X-Spieler') ?? '');
        const blob = await r.blob();
        if (weg) return;
        alteUrl = URL.createObjectURL(blob);
        setMosaikUrl((vorher) => { if (vorher) URL.revokeObjectURL(vorher); return alteUrl; });
        setMosaikNamen(namen);
      } catch (e) {
        if (!weg) setMosaikFehler((e as Error).message);
      } finally {
        if (!weg) setMosaikLaedt(false);
      }
    };

    /* Einen Mikrotask spaeter.
       Ein Effekt, der noch im selben Durchlauf Zustand setzt, loest eine
       zweite Renderrunde aus, bevor die erste fertig ist - React warnt zu
       Recht davor. Der Abruf ist ohnehin asynchron; ihn eine Warteschlange
       spaeter zu starten kostet nichts und raeumt das aus. */
    void Promise.resolve().then(lauf);

    return () => { weg = true; };
  }, [mosaikIds, mosaikAnzahl]);

  /**
   * Das Bild in die Zwischenablage legen.
   *
   * So laesst es sich auf X direkt einfuegen, ohne den Umweg ueber eine
   * gespeicherte Datei. Der Browser gibt das nur her, wenn die Seite als
   * sicher gilt - localhost zaehlt dazu. Klappt es nicht, bleibt der Knopf
   * zum Speichern daneben.
   */
  async function mosaikKopieren() {
    if (!mosaikUrl) return;
    try {
      const blob = await (await fetch(mosaikUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setMosaikKopiert(true);
      setTimeout(() => setMosaikKopiert(false), 1800);
    } catch {
      setMosaikFehler(t('Der Browser gibt die Zwischenablage nicht frei — '
        + 'bitte das Bild speichern.'));
    }
  }

  function mosaikSpeichern() {
    if (!mosaikUrl) return;
    speichereAdresse(
      mosaikUrl,
      `${(cupName || 'cup').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-spieler.png`,
    );
  }

  /**
   * Die Kacheln, die tatsaechlich zu sehen sind.
   *
   * Zweihundert Spieler in einem Raster sind eine Wand, keine Liste - wer
   * einen bestimmten sucht, liest sie von oben nach unten durch. Deshalb
   * zwei Wege hinein:
   *
   *   - Die Suche geht ueber ALLE Namen eines Kontos, nicht nur den, der
   *     gerade auf der Kachel steht. Wer "scroll" tippt, findet ihn auch,
   *     wenn er an diesem Tag als "AG Scroll 10!" antrat - und ueber das
   *     X-Konto ebenso. Dieselbe nachsichtige Suche wie im Kurzbefehl-Feld:
   *     erst genau, dann Anfang, dann enthalten, zuletzt Vertipper.
   *
   *   - Die Filter zeigen die Arbeit, die noch ansteht. "Ohne Flagge" und
   *     "ohne @-Konto" sind dabei getrennt: die meisten Spieler haben
   *     inzwischen ein Land aus der Szene-Quelle, aber kein X-Konto - eine
   *     gemeinsame Zaehlung "ungepflegt" verstuende die beiden Faelle.
   */
  // Bewusst ohne useMemo: es sind zweihundert Eintraege, das rechnet sich
  // schneller, als ein Vergleich der Abhaengigkeiten dauert. Der
  // React-Compiler merkt sich das Ergebnis von selbst, wo es sich lohnt.
  const zuordnenFrage = namensSchluessel(zuordnenSuche);

  const zuordnenPasst = (sp: { voll: string; id?: string }) => {
    const pr = findeProfil(sp.voll, sp.id);
    if (zuordnenFilter === 'gepflegt') return Boolean(pr);
    if (zuordnenFilter === 'ohneFlagge') return !landFuer(sp.voll, sp.id);
    if (zuordnenFilter === 'ohneKonto') return !pr?.x;
    return !pr;                           // 'offen'
  };

  const zuordnenGefiltert = zuordnenFilter === 'alle'
    ? spielerListe : spielerListe.filter(zuordnenPasst);

  const zuordnenTreffer = zuordnenFrage.length < 2 ? null : suchStufen(zuordnenFrage)
    .map((passt) => zuordnenGefiltert
      .filter((sp) => schluesselFuer(sp.voll, sp.id).some(passt)))
    .find((gefunden) => gefunden.length) ?? [];

  const gezeigteZuordnung = zuordnenTreffer ?? zuordnenGefiltert;

  /**
   * Eine Kachel zum Bearbeiten aufklappen.
   *
   * Als eigene Funktion, weil es zwei Wege dorthin gibt: den Klick auf die
   * Kachel und die Eingabetaste im Suchfeld. Beide muessen dieselben Felder
   * vorbelegen, sonst stuende beim einen Weg ein Land da und beim anderen
   * nicht.
   */
  const zuordnungOeffnen = useCallback(
    (sp: { schluessel: string; voll: string; id?: string }) => {
      const pr = findeProfil(sp.voll, sp.id);
      const quelle = pr ?? altprofilVorschlag(sp.voll, sp.id);
      setPflegeName(sp.schluessel);
      setPflegeStand('');
      // Ohne gepflegtes Land das aus der Szene-Quelle: sonst muesste man eine
      // Flagge abtippen, die daneben schon steht.
      setPflegeLand(quelle?.land ?? landFuer(sp.voll, sp.id) ?? '');
      setPflegeX(quelle?.x ?? '');
      setPflegeRegion(quelle?.region ?? '');
      setPflegeAnzeige(quelle?.anzeige ?? '');
    }, [findeProfil, altprofilVorschlag, landFuer]);

  /**
   * Eingabetaste speichert, Escape bricht ab.
   *
   * Alle Kacheln teilen sich dieselben vier Eingabefelder. Wer tippt und
   * dann eine andere Kachel anklickt, verliert seine Eingabe deshalb
   * stillschweigend - die Eingabetaste ist der kuerzeste Weg, das zu
   * vermeiden.
   */
  function pflegeTaste(
    e: React.KeyboardEvent<HTMLInputElement>,
    sp: { voll: string; id?: string },
  ) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void profilSpeichern(sp.voll, pflegeLand, pflegeX,
        pflegeRegion, pflegeAnzeige, sp.id);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setPflegeName(null); setPflegeStand('');
    }
  }

  async function profilSpeichern(name: string, land: string, x: string,
                                 region = '', anzeige = '', id?: string) {
    setPflegeStand('speichert …');
    try {
      const r = await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, land, x, region, anzeige }),
      });
      const j = await r.json().catch(() => null);

      // Fehler nicht verschlucken. Vorher endete der Weg hier stumm, und am
      // Bildschirm sah das genauso aus wie ein geglueckter Speichervorgang.
      if (!r.ok) {
        setPflegeStand(j?.error ? String(j.error) : t('nicht gespeichert'));
        return;
      }

      setProfile((alt) => {
        const neu = { ...alt };
        if (j.profile) neu[j.schluessel] = j.profile;
        else delete neu[j.schluessel];

        /*
         * Denselben Zusammenschluss nachvollziehen, den der Server macht.
         *
         * Wird mit einer Konto-Id gespeichert, fuehrt er ein altes, nur
         * ueber den Namen gefuehrtes Profil mit hinein und loescht es.
         * Blieb es hier stehen, gab es den Spieler doppelt - und die
         * Namenssuche in findeProfil, die genau einen Treffer verlangt,
         * fand danach gar keinen mehr.
         */
        if (id) {
          const nk = namensSchluessel(name);
          if (nk && nk !== j.schluessel && neu[nk] && !neu[nk].id) delete neu[nk];
        }
        return neu;
      });

      setPflegeName(null); setPflegeLand(''); setPflegeX('');
      setPflegeRegion(''); setPflegeAnzeige('');
      // Was gespeichert wurde, steht kurz da - der Knopf allein sagt es nicht.
      setPflegeStand(x
        ? `${t('gespeichert')} — @${x.replace(/^@/, '')}`
        : t('gespeichert — ohne @-Konto'));
      window.setTimeout(() => setPflegeStand(''), 3000);
    } catch (e) {
      setPflegeStand((e as Error).message);
    }
  }


  async function kopieren() {
    await navigator.clipboard.writeText(text);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 1800);
  }

  if (istAdmin === false) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-16 text-center text-slate-400">
        <p className="text-sm"><T>Dieser Bereich ist dem Adminkonto vorbehalten.</T></p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1500px]">

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-100"><T>Beitrag erstellen</T></h1>
            <p className="mt-1 text-sm text-slate-500">
              <T>Cup wählen, Vorlage wählen — Text und Grafik entstehen aus den Turnierdaten von Epic.</T>
            </p>
          </div>
          <button onClick={() => setBefehleOffen(true)}
            title={t('Alles, was das Kurzbefehl-Feld versteht')}
            className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs
                       text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
            ⌘ Befehle
            <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5
                             text-[10px] font-semibold text-slate-400">
              {befehlsZahl}
            </span>
          </button>
        </div>

        {/* Ordner - gliedert die Beitragsarten */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-800
                          bg-zinc-900/60 p-1">
            {ORDNER.map((o) => (
              <button key={o.wert} onClick={() => {
                  setOrdner(o.wert);
                  /*
                   * Gleich eine Vorlage nehmen, die es hier gibt.
                   *
                   * Sonst bliebe die aus dem vorigen Ordner ausgewaehlt
                   * stehen, obwohl sie hier nicht angeboten wird - und der
                   * Beitragstext bliebe leer, ohne dass man sieht, warum.
                   */
                  if (o.vorlagen.length && !o.vorlagen.includes(vorlage)) {
                    setVorlage(o.vorlagen[0]);
                  }
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs
                            font-medium transition ${
                  ordner === o.wert ? 'bg-sky-500 text-white'
                                    : 'text-slate-400 hover:text-slate-200'}`}>
                <span className="not-italic">{o.symbol}</span>{o.titel}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            <T>{aktiverOrdner.hinweis}</T></span>
        </div>

        {/* Auswahl - in den freien Ordnern nicht noetig, und in der
            eigenen Liste erst recht nicht: die haengt an keinem Turnier. */}
        {!ohneVorlage && !ohneCup && (
        <div className="mb-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4
                        sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-400">
            Cup
            <select value={cupId} onChange={(e) => { setCupId(e.target.value); setFensterId(''); }}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none focus:border-sky-500">
              <option value="">{t('— auswählen —')}</option>
              {sichtbareCups.live.length > 0 && (
                <optgroup label="Läuft gerade">
                  {sichtbareCups.live.map((c) => (
                    <option key={c.id} value={c.id}>{c.titel}</option>
                  ))}
                </optgroup>
              )}
              {sichtbareCups.vorbei.length > 0 && (
                <optgroup label="Gelaufen">
                  {sichtbareCups.vorbei.map((c) => (
                    <option key={c.id} value={c.id}>{c.titel} · {wann(c)}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            <T>Spieltag</T>
            <select value={fensterId} onChange={(e) => setFensterId(e.target.value)}
              disabled={!fenster.length}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none focus:border-sky-500
                         disabled:opacity-40">
              <option value="">{t('— auswählen —')}</option>
              {/* Auch hier nur, was laeuft oder gelaufen ist - ueber einen
                  Spieltag, der noch bevorsteht, gibt es nichts zu berichten. */}
              {fenster.filter((f) => f.status === 'live').length > 0 && (
                <optgroup label="Läuft gerade">
                  {fenster.filter((f) => f.status === 'live').map((f) => (
                    <option key={f.windowId} value={f.windowId}>
                      {f.region} · {new Date(f.begin).toLocaleDateString('de-DE',
                        { day: '2-digit', month: '2-digit' })}
                      {f.istFinale ? ' · Finale' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {fenster.filter((f) => f.status === 'vorbei').length > 0 && (
                <optgroup label="Gelaufen">
                  {fenster.filter((f) => f.status === 'vorbei')
                    .sort((a, b) => b.begin - a.begin).map((f) => (
                    <option key={f.windowId} value={f.windowId}>
                      {f.region} · {new Date(f.begin).toLocaleDateString('de-DE',
                        { day: '2-digit', month: '2-digit' })}
                      {f.istFinale ? ' · Finale' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            <T>Plätze im Beitrag</T>
            <input type="number" min={3} max={25} value={anzahl}
              onChange={(e) => setAnzahl(Math.max(3, Math.min(25, +e.target.value || 7)))}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none focus:border-sky-500" />
          </label>
          <button onClick={laden} disabled={!fensterId || laedt}
            className="self-end rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white
                       transition hover:bg-sky-400 disabled:opacity-40">
            {t(laedt ? 'lädt…' : 'Daten laden')}
          </button>
        </div>
        )}


        {stats && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              <T>Kurzbefehl — Enter drückt ab</T>
              <input value={befehl}
                onChange={(e) => setBefehl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;

                  // Ein Name geht vor: wer genau einen Teilnehmer tippt,
                  // meint ihn und keine Kennzahl, die zufällig dieselben
                  // Buchstaben enthält.
                  //
                  // Welche Ebene gerade eingestellt ist, entscheidet dabei,
                  // was herauskommt: bei Team Stats das ganze Duo samt Partner,
                  // bei Player Stats der einzelne Spieler.
                  if (ebeneEffektiv === 'team') {
                    const t = findeTeam(befehl);
                    if (t.treffer.length === 1) {
                      setSpotlight(t.treffer[0].rank);
                      setVorlage('spieler');
                      // Alle Kennzahlen an, sonst bliebe die Karte leer.
                      setGewaehlteListen(aktiveListen.map((b) => b.schluessel));
                      setBefehlEcho(`${t.namen[0]} — alle Werte`);
                      setBefehl('');
                      return;
                    }
                    if (t.treffer.length > 1) {
                      setBefehlEcho(`mehrdeutig: ${t.namen.slice(0, 3).join(' / ')}`);
                      return;
                    }
                  } else {
                    const sp = findeTeilnehmer(befehl);
                    if (sp.treffer.length === 1) {
                      setKarteSpieler(sp.treffer[0]);
                      setVorlage('spielerkarte');
                      setBefehlEcho(`${kurzName(sp.treffer[0].name)} — alle Werte`);
                      setBefehl('');
                      return;
                    }
                    if (sp.treffer.length > 1) {
                      // Lieber nachfragen als den Falschen nehmen.
                      setBefehlEcho(`mehrdeutig: ${sp.namen.slice(0, 4)
                        .map(kurzName).join(', ')}`);
                      return;
                    }
                  }

                  // Eine Frage ans Feld geht vor der Kennzahlsuche: "all
                  // winners" nennt zwar das Wort "wins", gemeint ist aber
                  // die Liste der Sieger und nicht die Kennzahl.
                  const a = deuteAuswahl(befehl);
                  if (a) {
                    setAuswahl(a);
                    setVorlage('auswahl');
                    setEbene('team');
                    const n = eintraege.filter((x) => a.passt(x, auswahlHilfe)).length;
                    setBefehlEcho(`${a.titel} — ${n} Team${n === 1 ? '' : 's'}`);
                    setBefehl('');
                    return;
                  }

                  const d = deuteBefehl(befehl, aktiveListen);
                  if (!d) {
                    setBefehlEcho(spielerDaten && !einzelwerte.length
                      ? 'nicht verstanden — zu diesem Spieltag gibt es keine Einzelwerte'
                      : 'nicht verstanden');
                    return;
                  }
                  setVorlage(d.vorlage);
                  setAnzahl(d.anzahl);
                  if (d.listen) setGewaehlteListen(d.listen);
                  setBefehlEcho(
                    d.listen
                      ? `${d.listen.length} Kennzahl${d.listen.length > 1 ? 'en' : ''} gesetzt`
                      : `${VORLAGEN.find((v) => v.wert === d.vorlage)?.titel}, ${d.anzahl} Plätze`);
                  setBefehl('');
                }}
                placeholder="top 5 · damage · elims 10 · mats · shxrk"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           font-mono text-sm text-slate-100 outline-none focus:border-sky-500" />
              {befehlEcho && (
                <span className="mt-1 block text-[11px] text-sky-400">{befehlEcho}</span>
              )}
              {/* Was das Feld versteht. Ohne diese Zeile muss man raten. */}
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]
                               text-slate-600">
                {AUSWAHLBEFEHLE.map((b) => (
                  <button key={b.beispiel} type="button" title={b.erklaerung}
                    onClick={() => setBefehl(b.beispiel)}
                    className="font-mono text-slate-500 underline decoration-dotted
                               underline-offset-2 hover:text-sky-400">
                    {b.beispiel}
                  </button>
                ))}
                <span>· dazu Kennzahlen wie <span className="font-mono">damage</span>,
                  <T>Plätze wie</T> <span className="font-mono">top 5</span> <T>und jeder Name</T></span>
              </span>
            </label>
            <label className="block text-xs text-slate-400">
              Eigene Zeile im Beitrag (optional)
              <input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)}
                placeholder="z. B. What a run from the EU squads"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none focus:border-sky-500" />
            </label>
          </div>
        )}

        {fehler && <p className="mb-4 text-sm text-rose-400">{fehler}</p>}

        {ohneVorlage && (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                {ordner === 'news' ? 'Vorschläge' : 'Bausteine'}
              </h2>
              <p className="mb-2 text-[11px] text-slate-500">
                {ordner === 'news'
                  ? 'Aus echten Turnierdaten gebaut. Jeder Klick zeigt einen '
                    + 'anderen Cup — nichts davon ist erfunden.'
                  : 'Gerüst für Beiträge über die eigene Seite. Was in eckigen '
                    + 'Klammern steht, trägst du ein.'}
              </p>
              <div className="space-y-1">
                {ordner === 'news' ? NEWS_ARTEN.map((n) => (
                  <button key={n.art} onClick={() => vorschlagHolen(n.art)}
                    disabled={laedtVorschlag === n.art}
                    className="flex w-full items-center justify-between gap-2 rounded-lg
                               border border-zinc-800 px-2.5 py-1.5 text-left text-xs
                               text-slate-300 transition hover:border-sky-700
                               hover:text-sky-200 disabled:opacity-50">
                    {n.titel}
                    <span className="text-[10px] text-slate-600">
                      {laedtVorschlag === n.art ? '…' : (vorschlagNr[n.art] ?? 0) + 1}
                    </span>
                  </button>
                )) : UPDATE_BAUSTEINE.map((b) => (
                  <button key={b.titel} onClick={() => setFreierText(b.text)}
                    className="w-full rounded-lg border border-zinc-800 px-2.5 py-1.5
                               text-left text-xs text-slate-300 transition
                               hover:border-sky-700 hover:text-sky-200">
                    {b.titel}
                  </button>
                ))}
              </div>
              {ordner === 'news' && vorschlagHinweis && (
                <p className="mt-2 text-[11px] text-amber-400">{vorschlagHinweis}</p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Beitrag</h2>
                <button onClick={kopieren}
                  className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white
                             transition hover:bg-sky-400">
                  {kopiert ? 'kopiert' : 'kopieren'}
                </button>
              </div>
              <textarea value={freierText} rows={14}
                onChange={(e) => setFreierText(e.target.value)}
                placeholder={t('Beitrag schreiben oder links einen Baustein wählen…')}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950
                           p-3 font-mono text-xs leading-relaxed text-slate-200
                           outline-none focus:border-sky-500" />
              <p className="mt-2 text-[11px] text-slate-500">
                {freierText.length} Zeichen. Bilder fügst du beim Posten selbst hinzu —
                Aufnahmen aus Streams kann diese Seite nicht erstellen.
              </p>
            </div>
          </div>
        )}

        {(stats || ohneCup) && !ohneVorlage && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
                {VORLAGEN.filter((v) => aktiverOrdner.vorlagen.includes(v.wert)).map((v) => (
                  <button key={v.wert} onClick={() => setVorlage(v.wert)} title={v.hinweis}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                      vorlage === v.wert ? 'bg-sky-500 text-white'
                                         : 'text-slate-400 hover:text-slate-200'}`}>
                    {v.titel}
                  </button>
                ))}
              </div>
              {/* Bei einem Solo-Cup gibt es nichts umzuschalten: kein Team,
                  also nur eine Ebene. Statt zweier Knoepfe, von denen einer
                  ohne Sinn waere, steht dort schlicht "Stats".

                  Bei der eigenen Liste gibt es gar keine Ebene - dort
                  stehen einzelne Spieler, die niemand einem Team
                  zuordnet. */}
              {ohneCup ? null : soloCup ? (
                <span className="rounded-lg border border-zinc-800 bg-zinc-900/60
                                 px-3 py-1.5 text-xs font-medium text-slate-300"
                  title={t('Solo-Cup — jeder Eintrag ist ein Spieler')}>
                  Stats
                </span>
              ) : (
                <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
                  <button onClick={() => setEbene('team')}
                    title={t('Werte je Team, direkt von Epic')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      ebene === 'team' ? 'bg-sky-500 text-white'
                                       : 'text-slate-400 hover:text-slate-200'}`}>
                    Team Stats
                  </button>
                  <button onClick={() => setEbene('spieler')}
                    disabled={!spielerListen.length}
                    title={spielerListen.length
                      ? 'Werte je einzelnem Spieler'
                      : 'Für diesen Spieltag liegen keine Einzelwerte vor'}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      ebene === 'spieler' ? 'bg-sky-500 text-white'
                                          : 'text-slate-400 hover:text-slate-200'
                    } disabled:cursor-not-allowed disabled:opacity-40`}>
                    Player Stats
                  </button>
                </div>
              )}
              <span className="text-xs text-slate-500">
                {VORLAGEN.find((v) => v.wert === vorlage)?.hinweis}
                {ebeneEffektiv === 'spieler' && einzelQuelle && (
                  <> · Einzelwerte von {einzelQuelle}</>
                )}
              </span>

              {/* Warum Player Stats gesperrt ist, gehoert sichtbar hin.
                  Im Mouseover einer ausgegrauten Schaltflaeche findet es
                  niemand - dort steht nur ein durchgestrichener Zeiger. */}
              {!spielerListen.length && !ohneCup && (
                <span className="text-xs text-amber-500/80">
                  Player Stats gesperrt: Einzelwerte kommen von
                  {' '}{spielerDaten?.quelle ?? 'eucompetitive.com'}, und dort
                  ist dieser Spieltag nicht geführt. Epic selbst liefert je
                  Eintrag — bei einem Duo also Teamsummen, die sich nicht auf
                  zwei Köpfe aufteilen lassen.
                </span>
              )}

              {/* Beim Solo-Cup ohne Szene-Quelle springt Epic ein. Dass dann
                  weniger Kennzahlen dastehen, gehoert dazugesagt: sonst wirkt
                  die halbe Auswahl wie ein Fehler. */}
              {einzelQuelle === 'Epic' && (
                <span className="text-xs text-slate-500">
                  Solo-Cup: die Einzelwerte kommen direkt von Epic, weil jeder
                  Eintrag aus einem Spieler besteht. Schüsse, Treffer, Assists,
                  Wiederbelebungen sowie Sturm- und Fallschaden führt Epic
                  nicht — diese Listen fehlen deshalb.
                </span>
              )}
            </div>

            {/*
              * Die eigene Liste - der einzige Bereich, der ohne Cup auskommt.
              *
              * Links die Ueberschrift, rechts alle Spieler einer Region zum
              * Anklicken. Was angeklickt ist, steht in der Reihenfolge der
              * Auswahl im Beitrag und kommt ins Bild.
              */}
            {vorlage === 'eigene' && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">

                {/* ------------------------------------------ Was dasteht */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase
                                tracking-[0.16em] text-slate-500">
                    <T>Überschrift</T>
                  </p>
                  <input value={eigenerKopf}
                    onChange={(e) => setEigenerKopf(e.target.value)}
                    placeholder={t('z. B. „Who is the most UNDERRATED player right now?“ oder „EU“')}
                    spellCheck={false}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                               px-3 py-2 text-sm text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />

                  <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={eigeneNummern}
                      onChange={(e) => setEigeneNummern(e.target.checked)}
                      className="accent-sky-500" />
                    <T>Nummeriert (1., 2., 3.) — sonst Punkte</T>
                  </label>

                  <p className="mb-2 mt-4 flex items-baseline gap-2 text-[10px]
                                font-semibold uppercase tracking-[0.16em]
                                text-slate-500">
                    <T>Ausgewählt</T>
                    <span className="tabular-nums text-slate-600">
                      {eigeneWahl.length}
                    </span>
                    {eigeneWahl.length > 0 && (
                      <button onClick={() => setEigeneWahl([])}
                        className="ml-auto font-normal normal-case tracking-normal
                                   text-slate-600 transition hover:text-rose-400">
                        <T>alle entfernen</T>
                      </button>
                    )}
                  </p>

                  {eigeneWahl.length ? (
                    <ol className="space-y-1">
                      {eigeneWahl.map((sp, i) => (
                        <li key={sp.epicId}
                          className="flex items-center gap-2 rounded-lg border
                                     border-zinc-900 bg-zinc-950/60 px-2.5 py-1.5">
                          <span className="w-5 shrink-0 text-right text-[11px]
                                           font-bold tabular-nums text-sky-400">
                            {i + 1}
                          </span>
                          <Flagge land={sp.land ?? undefined} groesse={14} />
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                            {sp.anzeige}
                          </span>
                          {!sp.bild && (
                            <span className="shrink-0 text-[9px] uppercase
                                             tracking-wider text-amber-600/80"
                              title={t('Ohne Foto — kommt nicht ins Bild')}>
                              <T>kein Foto</T>
                            </span>
                          )}
                          {/* Hoch und runter statt Ziehen: die Reihenfolge
                              ist die Reihenfolge im Beitrag, und sie muss
                              genau stimmen. */}
                          <button disabled={i === 0}
                            onClick={() => setEigeneWahl((v) => {
                              const n = [...v];
                              [n[i - 1], n[i]] = [n[i], n[i - 1]];
                              return n;
                            })}
                            className="shrink-0 px-1 text-slate-600 transition
                                       hover:text-sky-400 disabled:opacity-20"
                            title={t('nach oben')}>↑</button>
                          <button disabled={i === eigeneWahl.length - 1}
                            onClick={() => setEigeneWahl((v) => {
                              const n = [...v];
                              [n[i + 1], n[i]] = [n[i], n[i + 1]];
                              return n;
                            })}
                            className="shrink-0 px-1 text-slate-600 transition
                                       hover:text-sky-400 disabled:opacity-20"
                            title={t('nach unten')}>↓</button>
                          <button
                            onClick={() => setEigeneWahl(
                              (v) => v.filter((x) => x.epicId !== sp.epicId))}
                            className="shrink-0 px-1 text-slate-600 transition
                                       hover:text-rose-400"
                            title={t('entfernen')}>×</button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="rounded-lg border border-dashed border-zinc-800
                                  px-3 py-6 text-center text-[11px] text-slate-600">
                      <T>Rechts jemanden anklicken.</T>
                    </p>
                  )}
                </div>

                {/* -------------------------------------- Woraus gewaehlt wird */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {REGIONEN.map((r) => (
                      <button key={r.code}
                        onClick={() => { setEigeneRegion(r.code); setEigeneSuche(''); }}
                        className={`rounded-md border px-2 py-0.5 text-[11px]
                                    font-semibold transition ${
                          !eigeneSuche.trim() && eigeneRegion === r.code
                            ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                            : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                        {r.code}
                      </button>
                    ))}
                  </div>

                  <input value={eigeneSuche}
                    onChange={(e) => setEigeneSuche(e.target.value)}
                    placeholder={t('oder nach einem Namen suchen …')}
                    spellCheck={false}
                    className="mb-2 w-full rounded-lg border border-zinc-800
                               bg-zinc-950 px-3 py-2 text-sm text-slate-100
                               outline-none placeholder:text-slate-600
                               focus:border-sky-500" />

                  <div className="max-h-[420px] space-y-1 overflow-y-auto">
                    {eigeneListe.length ? eigeneListe.map((sp) => {
                      const drin = eigeneWahl.some((x) => x.epicId === sp.epicId);
                      return (
                        <button key={sp.epicId}
                          onClick={() => setEigeneWahl((v) => (
                            v.some((x) => x.epicId === sp.epicId)
                              ? v.filter((x) => x.epicId !== sp.epicId)
                              : [...v, sp]))}
                          className={`flex w-full items-center gap-2 rounded-lg
                                      border px-2.5 py-1.5 text-left transition ${drin
                            ? 'border-sky-500/60 bg-sky-500/10'
                            : 'border-zinc-900 bg-zinc-950/40 hover:border-zinc-700'}`}>
                          <Flagge land={sp.land ?? undefined} groesse={14} />
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                            {sp.anzeige}
                          </span>
                          {sp.bild && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sp.bild} alt="" loading="lazy"
                              className="h-6 w-6 shrink-0 rounded-full border
                                         border-zinc-800 object-cover object-top" />
                          )}
                          <span className={`shrink-0 text-sm ${drin
                            ? 'text-sky-400' : 'text-slate-700'}`}>
                            {drin ? '−' : '+'}
                          </span>
                        </button>
                      );
                    }) : (
                      <p className="px-3 py-6 text-center text-[11px] text-slate-600">
                        <T>Wird geladen …</T>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {vorlage === 'qualifiziert' && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
                  {([['land', 'Nach Ländern'], ['region', 'Nach Regionen']] as const)
                    .map(([w, l]) => (
                    <button key={w} onClick={() => setZaehlung(w)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        zaehlung === w ? 'bg-sky-500 text-white'
                                       : 'text-slate-400 hover:text-slate-200'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-500">
                  Gezählt wird jeder Spieler einzeln — ein Duo kann zwei Länder haben.
                </span>
              </div>
            )}

            {vorlage === 'spielerkarte' && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Spieler auswählen — oder den Namen oben ins Kurzbefehl-Feld tippen
                  {' '}({einzelwerte.length} im Feld):
                </p>
                {!einzelwerte.length ? (
                  <p className="text-[11px] text-slate-500">
                    {spielerDaten?.hinweis
                      ?? 'Zu diesem Spieltag liegen keine Einzelwerte vor.'}
                  </p>
                ) : (
                  <div className="grid max-h-48 gap-1.5 overflow-y-auto
                                  sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {einzelwerte.map((sp) => {
                      const pr = findeProfil(sp.name, sp.epicId);
                      const an = karteSpieler?.id
                        ? karteSpieler.id === sp.epicId
                        : karteSpieler?.name === sp.name;
                      return (
                        <button key={sp.epicId || sp.name}
                          onClick={() => setKarteSpieler({
                            name: pr?.anzeige || sp.name, id: sp.epicId })}
                          className={`flex items-center gap-1.5 overflow-hidden rounded-lg
                                      border px-2 py-1.5 text-left text-[11px] transition ${
                            an ? 'border-sky-500 bg-sky-950/40 text-sky-400'
                               : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                          <Flagge land={landFuer(sp.name, sp.epicId)} groesse={11} />
                          <span className="truncate">
                            {kurzName(pr?.anzeige || sp.name)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {vorlage === 'spieler' && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Team auswählen — die Werte kommen aus dem Endstand dieses Spieltags:
                </p>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto
                                sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {eintraege.slice(0, 30).map((e) => (
                    <button key={e.rank} onClick={() => setSpotlight(e.rank)}
                      className={`flex items-center gap-1.5 overflow-hidden rounded-lg
                                  border px-2 py-1.5 text-left text-[11px] transition ${
                        spotlight === e.rank ? 'border-sky-500 bg-sky-950/40 text-sky-400'
                                             : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                      <span className="w-6 shrink-0 tabular-nums text-slate-500">#{e.rank}</span>
                      <span className="truncate">
                        {e.players.map((p) => kurzName(echterName(p.name, p.id))).join(' + ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(vorlage === 'rueckblick' || vorlage === 'spieler') && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Kennzahlen im Beitrag — nur was dieser Cup wirklich liefert
                  ({aktiveListen.length} verfügbar):
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {aktiveListen.map((b) => {
                    const an = gewaehlteListen.includes(b.schluessel);
                    return (
                      <button key={b.schluessel}
                        onClick={() => setGewaehlteListen((alt) => an
                          ? alt.filter((x) => x !== b.schluessel)
                          : [...alt, b.schluessel])}
                        className={`flex items-center gap-1.5 overflow-hidden rounded-lg
                                    border px-2 py-1.5 text-left text-[11px] transition ${
                          an ? 'border-sky-500 bg-sky-950/40 text-sky-400'
                             : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                        <span className="not-italic">{b.symbol}</span>
                        <span className="truncate">{b.titel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fremden Beitrag uebernehmen und eigene Bilder dazulegen. */}
            <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">
                <T>Beitrag übernehmen</T>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input value={quellLink}
                  onChange={(e) => setQuellLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void quelleHolen(); }}
                  placeholder="https://x.com/… "
                  className="min-w-[260px] flex-1 rounded-lg border border-zinc-800
                             bg-zinc-950 px-3 py-2 text-xs text-slate-100 outline-none
                             placeholder:text-slate-600 focus:border-sky-500" />
                <button onClick={() => void quelleHolen()} disabled={quellLaedt}
                  className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-white
                             transition hover:bg-sky-400 disabled:opacity-40">
                  {quellLaedt ? <T>holt …</T> : <T>Text holen</T>}
                </button>
                <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2
                                  text-xs text-slate-300 transition hover:border-sky-500
                                  hover:text-sky-400">
                  <T>Eigenes Bild</T>
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => bilderWaehlen(e.target.files)} />
                </label>
              </div>

              {quellFehler && (
                <p className="mt-2 text-[11px] text-amber-500">{quellFehler}</p>
              )}

              {quelle && (
                <div className="mt-2 text-[11px] text-slate-500">
                  <T>Übernommen von</T>{' '}
                  <a href={quelle.url} target="_blank" rel="noreferrer"
                    className="text-sky-400 underline">
                    {quelle.autor ?? 'X'}{quelle.konto ? ` @${quelle.konto}` : ''}
                  </a>
                  {quelle.datum ? ` · ${quelle.datum}` : ''}
                  {' · '}<T>der Text steht jetzt im Feld unten</T>
                </div>
              )}

              {(quelle?.bilder.length || eigeneBilder.length) ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(quelle?.bilder ?? []).map((b) => (
                    // Fremde Bilder liegen auf X. Herunterladen kann der
                    // Browser sie von hier aus nicht, deshalb oeffnen sie
                    // sich in einem Tab - dort ein Rechtsklick, fertig.
                    <a key={b} href={b} target="_blank" rel="noreferrer"
                      title={t('In neuem Tab öffnen')}
                      className="block h-20 w-20 overflow-hidden rounded-lg border
                                 border-zinc-800 transition hover:border-sky-500">
                      <img src={b} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                  {eigeneBilder.map((b, i) => (
                    <span key={`eigen-${i}`} className="relative block h-20 w-20
                                 overflow-hidden rounded-lg border border-sky-800">
                      <img src={b} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setEigeneBilder((alt) =>
                          alt.filter((_, j) => j !== i))}
                        title={t('Entfernen')}
                        className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1
                                   text-[10px] leading-tight text-rose-300">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {/*
                * Dieselbe Bildsprache mit den eigenen Spielern.
                *
                * Das uebernommene Bild bleibt oben stehen, wie es ist. Hier
                * darunter entsteht die eigene Fassung aus den Fotos, die das
                * Werkzeug ohnehin fuehrt - gebaut von /api/beitrag-bild,
                * derselben Stelle, die auch die Grafik unten fuellt. Wer
                * kein Foto hat, faellt weg statt als Silhouette zu stehen.
                */}
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider
                                 text-slate-500">
                    <T>Spielerbilder</T>
                  </h3>
                  <select value={eigenAnzahl}
                    onChange={(e) => setEigenAnzahl(Number(e.target.value))}
                    className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1
                               text-[11px] text-slate-200 outline-none">
                    {[5, 6, 9, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button onClick={() => void eigenVorschlagen('underrated')}
                    disabled={eigenLaedt}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px]
                               text-slate-300 transition hover:border-sky-500
                               hover:text-sky-400 disabled:opacity-40">
                    <T>Unterschätzte vorschlagen</T>
                  </button>
                  <button onClick={() => void eigenVorschlagen('topelims')}
                    disabled={eigenLaedt}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px]
                               text-slate-300 transition hover:border-sky-500
                               hover:text-sky-400 disabled:opacity-40">
                    <T>Meiste Elims je Match</T>
                  </button>
                  {eigenBild && (
                    <>
                      <button onClick={() => void eigenKopieren()}
                        className="rounded bg-sky-500 px-2 py-1 text-[11px] font-medium
                                   text-white transition hover:bg-sky-400">
                        {eigenKopiert ? <T>kopiert</T> : <T>Bild kopieren</T>}
                      </button>
                      <a href={eigenBild} download="spielerbilder.png"
                        className="text-[11px] text-slate-400 underline
                                   hover:text-slate-200">
                        <T>als PNG speichern</T>
                      </a>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    {eigenBild ? (
                      <>
                        <img src={eigenBild} alt=""
                          className="max-h-48 rounded-lg border border-zinc-800" />
                        {eigenNamen && (
                          <p className="mt-1 text-[10px] text-slate-500">{eigenNamen}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        {eigenLaedt ? <T>baut …</T>
                          : <T>Wähle unten Spieler aus — daraus entsteht hier dasselbe Bild mit deinen Leuten.</T>}
                      </p>
                    )}
                    {/* Warum diese Namen - die Regel gehoert sichtbar dazu,
                        sonst steht dort eine Rangliste, die niemand
                        nachpruefen kann. */}
                    {eigenRegel && (
                      <p className="mt-1 text-[10px] text-amber-600/80">{eigenRegel}</p>
                    )}
                  </div>

                  {/* Rechts der freie Platz: suchen, anklicken, wieder
                      rausnehmen. Bewusst schmal - es ist eine Beigabe zum
                      Vorschlag, keine zweite Verwaltungsseite. */}
                  <div className="w-[26rem] shrink-0">
                    {/* Region ueber der Suche - das Werkzeug ist in Europa
                        zu Hause, deshalb steht EU vorn. */}
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'].map((r) => (
                        <button key={r} onClick={() => setFestRegion(r)}
                          className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                            festRegion === r
                              ? 'bg-sky-500/15 text-sky-400'
                              : 'text-slate-500 hover:text-slate-300'}`}>
                          {r}
                        </button>
                      ))}
                    </div>

                    <input value={festSuche}
                      onChange={(e) => setFestSuche(e.target.value)}
                      placeholder={t('Spieler suchen …')}
                      className="mb-1.5 w-full rounded border border-zinc-800 bg-zinc-950
                                 px-2 py-1 text-[11px] text-slate-100 outline-none
                                 placeholder:text-slate-600 focus:border-sky-500" />

                    {fest.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {fest.map((x) => (
                          <button key={x.epicId}
                            onClick={() => setFest((v) =>
                              v.filter((y) => y.epicId !== x.epicId))}
                            title={`${x.anzeige} — ${t('Entfernen')}`}
                            className="relative aspect-square w-12 overflow-hidden rounded
                                       border border-sky-600 hover:border-rose-500">
                            {x.bild
                              ? <img src={x.bild} alt={x.anzeige}
                                  className="h-full w-full object-cover" />
                              : <span className="flex h-full w-full items-center
                                                 justify-center text-[9px] text-slate-400">
                                  {x.anzeige.slice(0, 3)}
                                </span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/*
                      * Gesichter statt Namen.
                      *
                      * Der Betreiber waehlt nach dem Bild aus - "putt einfach
                      * die Bilder hin". Wer kein Foto hat, steht trotzdem da,
                      * nur blass und mit Namenskuerzel: er faellt im Mosaik
                      * ohnehin weg, und das soll man vorher sehen.
                      */}
                    <div className="grid max-h-72 grid-cols-7 gap-1 overflow-y-auto
                                    rounded border border-zinc-800 p-1">
                      {festListe
                        .filter((x) => !fest.some((y) => y.epicId === x.epicId))
                        .map((x) => (
                          <button key={x.epicId}
                            onClick={() => setFest((v) => [...v, x])}
                            title={x.anzeige + (x.foto ? '' : ` — ${t('kein Foto')}`)}
                            className={`aspect-square w-full overflow-hidden rounded
                                        border transition hover:border-sky-500 ${x.foto
                              ? 'border-zinc-800' : 'border-zinc-900 opacity-40'}`}>
                            {x.bild
                              ? <img src={x.bild} alt={x.anzeige} loading="lazy"
                                  className="h-full w-full object-cover" />
                              : <span className="flex h-full w-full items-center
                                                 justify-center text-[9px] text-slate-500">
                                  {x.anzeige.slice(0, 3)}
                                </span>}
                          </button>
                        ))}
                      {!festListe.length && (
                        <p className="col-span-7 px-1 py-1.5 text-[10px] text-slate-600">
                          <T>nichts gefunden</T>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-100">Text</h2>
                  <button onClick={kopieren}
                    className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white
                               transition hover:bg-sky-400">
                    {kopiert ? 'kopiert' : 'kopieren'}
                  </button>
                </div>
                <textarea value={text} rows={16}
                  onChange={(e) => setEigenerText(e.target.value)}
                  className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950
                             p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none
                             focus:border-sky-500" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500">
                    {text.length} Zeichen{eigenerText !== null && ' · selbst bearbeitet'}
                  </p>
                  {eigenerText !== null && (
                    <button onClick={() => setEigenerText(null)}
                      className="shrink-0 text-[11px] text-slate-400 underline hover:text-slate-200">
                      Vorlage wiederherstellen
                    </button>
                  )}
                </div>
              </div>

              {/* Die Turniergrafik auf Epics eigener Vorlage.
                  Nur beim Team Spotlight - sie zeigt genau ein Team, und
                  ohne ausgewaehltes Team stuenden die Balken leer da. */}
              {vorlage === 'spieler' && (
                <div className="mt-4 rounded-xl border border-zinc-800
                                bg-zinc-900/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-100">
                      <T>Turniergrafik</T>
                    </h2>
                    <input value={vorlagenTitel}
                      onChange={(e) => setVorlagenTitel(e.target.value)}
                      placeholder={t('Titel — leer: Champions bzw. der Platz')}
                      spellCheck={false}
                      className="w-64 max-w-full rounded-lg border border-zinc-800
                                 bg-zinc-950 px-3 py-1 text-xs text-slate-100
                                 outline-none placeholder:text-slate-600
                                 focus:border-sky-500" />
                    <span className="flex items-center gap-1">
                      {['CHAMPIONS', 'GAME WINNER', 'VICTORY ROYALE'].map((v) => (
                        <button key={v} onClick={() => setVorlagenTitel(v)}
                          className="rounded-md border border-zinc-800 px-2 py-0.5
                                     text-[10px] text-slate-500 transition
                                     hover:border-sky-500/60 hover:text-sky-400">
                          {v}
                        </button>
                      ))}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <button onClick={vorlageKopieren}
                        className="rounded-lg bg-sky-500 px-3 py-1 text-xs
                                   font-medium text-white transition
                                   hover:bg-sky-400">
                        {vorlagenKopiert ? <T>kopiert</T> : <T>Bild kopieren</T>}
                      </button>
                      <button onClick={() => void vorlageSpeichern()}
                        className="rounded-lg border border-zinc-800 px-3 py-1
                                   text-xs text-slate-400 transition
                                   hover:border-sky-500/60 hover:text-sky-400">
                        <T>speichern</T>
                      </button>
                      {vorlagenFehler && (
                        <span className="text-[11px] text-red-400">
                          {vorlagenFehler}
                        </span>
                      )}
                    </span>
                  </div>
                  <canvas ref={vorlagenLeinwand}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950" />
                  {!schriftDa && (
                    <p className="mt-2 text-[11px] text-amber-400/90">
                      <T>Die Schrift lädt noch — die Grafik nutzt solange eine
                      Ersatzschrift.</T>
                    </p>
                  )}
                </div>
              )}

              {/* Das Fotomosaik.
                  Auf X steht unter so einer Liste ueblicherweise ein breites
                  Bild mit den Genannten nebeneinander. Es entsteht aus den
                  Fotos, die ohnehin schon im Werkzeug liegen - wer keins hat,
                  wird uebersprungen statt durch eine Silhouette ersetzt. */}
              <div className="mt-4 rounded-xl border border-zinc-800
                              bg-zinc-900/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold text-slate-100">
                    <T>Spielerbild</T>
                  </h2>

                  {/*
                    * Wie viele Gesichter ins Bild.
                    *
                    * Bis fuenf stehen sie nebeneinander, darueber wird
                    * umgebrochen: sechs ergeben drei mal zwei, neun drei mal
                    * drei, zehn fuenf mal zwei - so, wie der Betreiber es
                    * fuer seine eigenen Beitraege wollte.
                    */}
                  <span className="flex flex-wrap items-center gap-1">
                    {[3, 4, 5, 6, 9, 10].map((n) => (
                      <button key={n} onClick={() => setMosaikAnzahl(n)}
                        className={`rounded-md border px-2 py-0.5 text-[11px]
                                    font-semibold transition ${mosaikAnzahl === n
                          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                          : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                        {n}
                      </button>
                    ))}
                  </span>

                  <span className="ml-auto flex items-center gap-2">
                    <button onClick={mosaikKopieren} disabled={!mosaikUrl}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium
                                 text-white transition hover:bg-sky-400
                                 disabled:cursor-not-allowed disabled:opacity-40">
                      {mosaikKopiert ? <T>kopiert</T> : <T>Bild kopieren</T>}
                    </button>
                    <button onClick={mosaikSpeichern} disabled={!mosaikUrl}
                      className="rounded-lg border border-zinc-800 px-3 py-1 text-xs
                                 text-slate-400 transition hover:border-sky-500/60
                                 hover:text-sky-400 disabled:opacity-40">
                      <T>speichern</T>
                    </button>
                  </span>
                </div>

                {mosaikLaedt && !mosaikUrl ? (
                  <p className="py-6 text-center text-xs text-slate-600">
                    <T>Bild wird gebaut …</T>
                  </p>
                ) : mosaikUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mosaikUrl} alt=""
                      className="w-full rounded-lg border border-zinc-800" />
                    <p className="mt-2 text-[11px] text-slate-500">
                      {mosaikNamen}
                    </p>
                  </>
                ) : (
                  <p className="py-6 text-center text-xs text-slate-600">
                    {mosaikFehler || t('Zu diesen Spielern liegen keine Fotos vor.')}
                  </p>
                )}

                {mosaikUrl && mosaikFehler && (
                  <p className="mt-2 text-[11px] text-amber-400/90">{mosaikFehler}</p>
                )}
              </div>
            </div>

            {/* Zwei Werkzeuge, die selten gebraucht werden.

                Beide standen bisher untereinander auf der Seite und
                machten sie doppelt so lang, wie sie sein muesste: die
                Zuordnungsliste mit zweihundert Kacheln und die
                Turnierstatistik mit allen Bestenlisten. Wer einen Beitrag
                schreibt, braucht keins von beidem staendig - aber wenn er
                es braucht, dann ganz.

                Deshalb hinter zwei Knoepfen, und dahinter jeweils in voller
                Groesse. Nichts ist weggefallen. */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setZuordnungOffen(true)}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                           text-slate-400 transition hover:border-sky-500/60
                           hover:text-sky-400">
                <T>Spieler zuordnen</T>
                <span className="ml-2 tabular-nums text-slate-600">
                  {spielerListe.filter((sp) => findeProfil(sp.voll, sp.id)).length}
                  /{spielerListe.length}
                </span>
              </button>
              <button type="button" onClick={() => setStatistikOffen(true)}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                           text-slate-400 transition hover:border-sky-500/60
                           hover:text-sky-400">
                <T>Turnierstatistik</T>
                <span className="ml-2 tabular-nums text-slate-600">
                  {aktiveListen.length}
                </span>
              </button>
            </div>

            <Fenster offen={zuordnungOffen} schliessen={() => setZuordnungOffen(false)}
              titel="Spieler zuordnen">
              {/* Herkunft und X-Konto pflegen */}
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-100"><T>Spieler zuordnen</T></h2>
                  <span className="text-xs text-slate-500">
                    {spielerListe.filter((sp) => findeProfil(sp.voll, sp.id)).length} <T>von</T>{' '}
                    {spielerListe.length} gepflegt — Flagge und @-Konto erscheinen nur hier
                  </span>
                  {/*
                    * Die Rueckmeldung gehoert hierher, nicht in die Kachel.
                    *
                    * Die Kachel klappt beim Speichern zu - eine Meldung
                    * darin waere im selben Augenblick wieder fort, und
                    * genau so sah es vorher aus: man drueckt, und nichts
                    * scheint zu passieren.
                    */}
                  {pflegeStand && (
                    <span className={`ml-auto text-xs ${
                      /nicht|Fehler|error|not saved/i.test(pflegeStand)
                        ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {pflegeStand}
                    </span>
                  )}
                </div>

                {/* Suche und Filter.
                    Ohne sie ist die Liste eine Wand aus zweihundert Kacheln,
                    durch die man sich von oben nach unten liest. */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input value={zuordnenSuche}
                    onChange={(e) => setZuordnenSuche(e.target.value)}
                    onKeyDown={(e) => {
                      // Eingabetaste klappt den ersten Treffer auf. Wer einen
                      // bestimmten Spieler sucht, will ihn bearbeiten - nicht
                      // erst noch eine Kachel treffen.
                      if (e.key !== 'Enter' || !gezeigteZuordnung.length) return;
                      e.preventDefault();
                      zuordnungOeffnen(gezeigteZuordnung[0]);
                    }}
                    placeholder={t('Spieler suchen — auch alte Namen und @-Konten')}
                    spellCheck={false}
                    className="w-72 max-w-full rounded-lg border border-zinc-800
                               bg-zinc-950 px-3 py-1.5 text-xs text-slate-100
                               outline-none placeholder:text-slate-600
                               focus:border-sky-500" />
                  {zuordnenSuche && (
                    <button onClick={() => setZuordnenSuche('')}
                      className="text-[11px] text-slate-500 underline
                                 transition hover:text-slate-300">
                      <T>zurücksetzen</T>
                    </button>
                  )}

                  <span className="flex flex-wrap items-center gap-1">
                    {([
                      ['alle', 'alle'],
                      ['offen', 'ohne Profil'],
                      ['ohneFlagge', 'ohne Flagge'],
                      ['ohneKonto', 'ohne @-Konto'],
                      ['gepflegt', 'gepflegt'],
                    ] as Array<[typeof zuordnenFilter, string]>).map(([w, titel]) => (
                      <button key={w} onClick={() => setZuordnenFilter(w)}
                        className={`rounded-md border px-2 py-0.5 text-[11px]
                                    transition ${zuordnenFilter === w
                          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                          : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                        <T>{titel}</T>
                      </button>
                    ))}
                  </span>

                  <span className="ml-auto text-[11px] tabular-nums text-slate-600">
                    {gezeigteZuordnung.length} <T>von</T> {spielerListe.length}
                  </span>
                </div>

                {/* Festes Raster statt frei fliessender Kacheln - so steht
                    jeder Spieler an seinem Platz und die Liste bleibt lesbar. */}
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {!gezeigteZuordnung.length && (
                    <p className="col-span-full py-6 text-center text-xs text-slate-600">
                      <T>Niemand passt dazu.</T>
                    </p>
                  )}
                  {gezeigteZuordnung.map((sp) => {
                    const pr = findeProfil(sp.voll, sp.id);
                    const offen = pflegeName === sp.schluessel;
                    if (offen) {
                      const vorschlaege = namensVorschlaege(sp.voll);
                      return (
                        <div key={sp.schluessel}
                          className="col-span-full flex flex-col gap-1.5 rounded-lg
                                     border border-sky-500 bg-zinc-950 px-2.5 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] text-slate-300"
                            title={sp.id ? `Konto ${sp.id.slice(0, 8)}…` : 'ohne Konto-ID'}>
                            {kurzName(sp.voll)}
                          </span>
                          <input value={pflegeAnzeige}
                            onChange={(e) => setPflegeAnzeige(e.target.value)}
                            onKeyDown={(e) => pflegeTaste(e, sp)}
                            placeholder={t('Anzeigename')}
                            title={t('Wie der Spieler wirklich heisst - gilt dann ueberall')}
                            className="w-32 rounded border border-zinc-800 bg-zinc-900 px-1.5
                                       py-0.5 text-[11px] text-slate-100 outline-none" />
                          <input value={pflegeLand} onChange={(e) => setPflegeLand(e.target.value)}
                            onKeyDown={(e) => pflegeTaste(e, sp)}
                            placeholder="RO" maxLength={2}
                            className="w-11 rounded border border-zinc-800 bg-zinc-900 px-1.5
                                       py-0.5 text-[11px] uppercase text-slate-100 outline-none" />
                          <input value={pflegeX} onChange={(e) => setPflegeX(e.target.value)}
                            onKeyDown={(e) => pflegeTaste(e, sp)}
                            placeholder="@konto"
                            className="w-24 rounded border border-zinc-800 bg-zinc-900 px-1.5
                                       py-0.5 text-[11px] text-slate-100 outline-none" />
                          <select value={pflegeRegion}
                            onChange={(e) => setPflegeRegion(e.target.value)}
                            title={t('Region — nur nötig, wenn das Land nicht eindeutig ist (etwa NAC/NAW)')}
                            className="rounded border border-zinc-800 bg-zinc-900 px-1
                                       py-0.5 text-[11px] text-slate-100 outline-none">
                            <option value="">auto</option>
                            {REGIONEN.map((r) => (
                              <option key={r.code} value={r.code}>{r.code}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => profilSpeichern(sp.voll, pflegeLand, pflegeX,
                              pflegeRegion, pflegeAnzeige, sp.id)}
                            title={t('Speichern — die Eingabetaste tut dasselbe')}
                            className="rounded bg-sky-500 px-2 py-0.5 text-[11px] text-white">
                            ok
                          </button>
                        </div>

                        {/* Unter welchen Namen ist dieses Konto sonst aufgetreten?
                            Ein Klick uebernimmt den Namen dauerhaft. */}
                        {vorschlaege.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-slate-500">bekannt als:</span>
                            {vorschlaege.map((v) => (
                              <button key={v} onClick={() => setPflegeAnzeige(v)}
                                className="rounded border border-zinc-700 px-1.5 py-0.5
                                           text-[10px] text-slate-300 hover:border-sky-500
                                           hover:text-sky-400">
                                {v}
                              </button>
                            ))}
                          </div>
                        )}
                        </div>
                      );
                    }
                    // Kein Profil, aber ein Altprofil gleichen Namens? Dann
                    // wird es vorgeschlagen - angewandt wird nichts. Die Kachel
                    // faerbt sich bernstein und traegt die Angaben schon
                    // vorausgefuellt, sobald sie geoeffnet wird.
                    const vorschlag = pr ? undefined : altprofilVorschlag(sp.voll, sp.id);
                    return (
                      <button key={sp.schluessel}
                        onClick={() => zuordnungOeffnen(sp)}
                        title={vorschlag
                          ? `${sp.voll} — altes Profil „${vorschlag.name}" ohne Konto-ID.`
                            + ' Öffnen und speichern verknüpft es mit diesem Konto.'
                          : sp.voll}
                        className={`flex items-center gap-1.5 overflow-hidden rounded-lg border
                                    px-2 py-1.5 text-left text-[11px] transition ${
                          pr ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-200'
                             : vorschlag
                               ? 'border-amber-700/60 bg-amber-950/20 text-amber-200/90'
                               : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                        {/* Die Flagge auch dann, wenn kein Profil gepflegt
                            ist: das Land steht in der Szene-Quelle und ist
                            dasselbe, das die Statistikseite zeigt. Die
                            gruene Umrandung bleibt der Pflege vorbehalten -
                            so ist weiter erkennbar, wo noch etwas fehlt. */}
                        <Flagge land={landFuer(sp.voll, sp.id)} groesse={11} />
                        <span className="truncate">
                          {pr?.anzeige || kurzName(sp.voll)}
                        </span>
                        {/* Nicht die Flagge und nicht das Land, sondern der
                            Name des Altprofils: so steht da, was vorgeschlagen
                            wird, und nicht eine Behauptung ueber diesen
                            Spieler. Bei einem Nachahmer sieht man sofort, dass
                            hier das Profil eines anderen angeboten wird. */}
                        {vorschlag && (
                          <span className="ml-auto shrink-0 text-[10px] text-amber-400/80">
                            {kurzName(vorschlag.name)}?
                          </span>
                        )}
                        {pr?.x && (
                          <span className="ml-auto shrink-0 text-[10px] text-emerald-400/70">
                            @{pr.x}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Fenster>

            <Fenster offen={statistikOffen} schliessen={() => setStatistikOffen(false)}
              titel="Turnierstatistik">
              {/* Alle Bestenlisten zum Nachschlagen */}
              <div className="mt-6 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold text-slate-100">
                  Turnierstatistik — {stats?.teams ?? 0} Teams, {stats?.spiele ?? 0} Spiele
                </h2>
                <span className="text-[11px] text-slate-500">
                  {ebeneEffektiv === 'spieler'
                    ? `Einzelwerte je Spieler — Quelle: ${einzelQuelle ?? '—'}`
                    : 'Werte je Team, direkt von Epic. Für Einzelwerte oben auf Player Stats umschalten.'}
                </span>
                {gesamtTabelle.length > 0 && (
                  <button type="button"
                    onClick={() => { setVollSuche(''); setVollansicht('alle'); }}
                    className="ml-auto rounded-md border border-zinc-700 px-2 py-1
                               text-[11px] text-slate-300 hover:border-sky-500/60
                               hover:bg-zinc-800 hover:text-sky-400">
                    Alle Werte ({gesamtTabelle.length})
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {aktiveListen.map((b) => (
                  <div key={b.schluessel}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
                    <p className="flex items-center gap-1.5 border-b border-zinc-800
                                  bg-zinc-900/60 px-3 py-2 text-[11px] font-semibold
                                  uppercase tracking-wider text-slate-300">
                      <span className="not-italic">{b.symbol}</span>{b.titel}
                      {/* Die Kachel zeigt fuenf. Dahinter steht das ganze Feld. */}
                      {(b.alle?.length ?? 0) > b.plaetze.length && (
                        <button type="button"
                          onClick={() => { setVollSuche(''); setVollansicht(b.schluessel); }}
                          title={`Alle ${b.alle!.length} anzeigen`}
                          aria-label={`${b.titel}: alle ${b.alle!.length} anzeigen`}
                          className="ml-auto shrink-0 rounded border border-zinc-700
                                     px-1.5 pb-px leading-none text-sm text-slate-500
                                     hover:border-sky-500/60 hover:bg-zinc-800
                                     hover:text-sky-400">
                          +
                        </button>
                      )}
                    </p>
                    <table className="w-full table-fixed text-xs">
                      <tbody>
                        {b.plaetze.map((p, i) => (
                          <tr key={p.rank}
                            className="border-b border-zinc-900/80 last:border-0
                                       hover:bg-zinc-900/40">
                            <td className="w-7 py-1.5 pl-3 align-middle text-slate-600
                                           tabular-nums">{i + 1}</td>
                            <td className="py-1.5 align-middle">
                              {/* Jeder Spieler mit eigener Flagge - in einem Duo
                                  haben die beiden verschiedene Herkunft. */}
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                {p.spieler.map((n, k) => (
                                  <span key={k} className="flex items-center gap-1">
                                    {k > 0 && <span className="text-slate-600">+</span>}
                                    <Flagge land={landFuer(n, p.ids?.[k])} groesse={11} />
                                    <span className="text-slate-200">
                                      {kurzName(findeProfil(n, p.ids?.[k])?.anzeige || n)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="w-20 py-1.5 pr-3 text-right align-middle
                                           font-semibold tabular-nums text-sky-400">
                              {p.wert.toLocaleString('de-DE')}
                              {b.einheit && <span className="ml-0.5 text-[10px]
                                                   font-normal text-slate-500">{b.einheit}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Fenster>
          </>
        )}
      </div>

      {/* ------------------------------------------------------ Vollansicht.
          Entweder eine einzelne Kennzahl mit dem ganzen Teilnehmerfeld, oder
          alle Kennzahlen nebeneinander. Beide Ansichten zeigen ausschliesslich
          Zahlen, die schon auf den Kacheln stehen - hier eben ungekuerzt. */}
      {vollansicht && (
        <div role="dialog" aria-modal="true"
          onClick={() => setVollansicht(null)}
          className="fixed inset-0 z-50 flex items-start justify-center
                     bg-black/75 p-3 sm:p-8">
          <div onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full flex-col overflow-hidden rounded-xl
                       border border-zinc-700 bg-zinc-950 shadow-2xl
                       sm:max-w-[min(72rem,100%)]">

            <div className="flex items-start gap-3 border-b border-zinc-800 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold
                              uppercase tracking-wider text-slate-100">
                  {vollansicht === 'alle' ? 'Alle Werte' : (
                    <>
                      <span className="not-italic">{offeneListe?.symbol}</span>
                      {offeneListe?.titel}
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {vollansicht === 'alle'
                    ? gesamtTabelle.length
                    : (offeneListe?.alle?.length ?? 0)}
                  {' '}{ebeneEffektiv === 'spieler' ? 'Spieler' : 'Teams'}
                  {' — Quelle: '}
                  {ebeneEffektiv === 'spieler' ? (einzelQuelle ?? '—') : 'Epic'}
                </p>
              </div>
              <button type="button" onClick={() => setVollansicht(null)}
                aria-label={t('Schließen')}
                className="ml-auto shrink-0 rounded-md border border-zinc-700
                           px-2 py-0.5 text-lg leading-6 text-slate-400
                           hover:border-zinc-500 hover:text-slate-100">
                ×
              </button>
            </div>

            <div className="border-b border-zinc-800 px-4 py-2">
              <input value={vollSuche} onChange={(e) => setVollSuche(e.target.value)}
                placeholder={t('Spieler, Land oder Region suchen…')}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900
                           px-3 py-1.5 text-xs text-slate-200
                           placeholder:text-slate-600 focus:border-sky-500/60
                           focus:outline-none" />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {vollansicht === 'alle' ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800
                                   text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="sticky left-0 top-0 z-20 bg-zinc-900 px-3 py-2
                                     text-left font-medium"><T>Spieler</T></th>
                      {tabellenSpalten.map((b) => (
                        <th key={b.schluessel}
                          className="sticky top-0 z-10 whitespace-nowrap bg-zinc-900
                                     px-2.5 py-2 text-right font-medium"
                          title={b.titel}>
                          {spaltenName(b.titel)}
                          {/* Einheit einmal in den Kopf statt vierzigmal in
                              die Spalte - sonst steht in jeder Zeile "km". */}
                          {b.einheit && (
                            <span className="ml-1 font-normal text-slate-600">
                              ({b.einheit})
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gesamtTabelle
                      .filter((z) => suchTreffer(z.spieler, z.ids))
                      .map((z, i) => (
                        <tr key={z.ids?.join('|') || z.spieler.join('|') || i}
                          className="group border-b border-zinc-900/80 last:border-0
                                     hover:bg-zinc-900/40">
                          <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-1.5
                                         group-hover:bg-zinc-900">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              {z.spieler.map((n, k) => (
                                <span key={k} className="flex items-center gap-1">
                                  {k > 0 && <span className="text-slate-600">+</span>}
                                  <Flagge land={landFuer(n, z.ids?.[k])} groesse={11} />
                                  <span className="whitespace-nowrap text-slate-200">
                                    {kurzName(findeProfil(n, z.ids?.[k])?.anzeige || n)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          {tabellenSpalten.map((b) => {
                            const w = z.werte[b.schluessel];
                            return (
                              <td key={b.schluessel}
                                className="whitespace-nowrap px-2.5 py-1.5 text-right
                                           tabular-nums text-slate-300">
                                {/* Bei den Einzelwerten fuehrt die Quelle jedes
                                    Feld fuer jeden Spieler. Wer in einer
                                    Wertung fehlt, hat dort also tatsaechlich
                                    null - peterbot etwa nahm keinen Fallschaden.
                                    Bei den Teamwerten von Epic ist das anders:
                                    dort kann ein Feld schlicht nicht gemeldet
                                    sein, und dann bleibt ein Strich stehen,
                                    statt eine Null zu behaupten. */}
                                {w !== undefined
                                  ? w.toLocaleString('de-DE')
                                  : ebeneEffektiv === 'spieler'
                                    ? <span className="text-slate-600">0</span>
                                    : <span className="text-slate-700"
                                        title={t('Dieses Turnier meldet den Wert nicht')}>
                                        —
                                      </span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {(offeneListe?.alle ?? [])
                      .map((pl, i) => ({ pl, pos: i + 1 }))
                      .filter(({ pl }) => suchTreffer(pl.spieler, pl.ids))
                      .map(({ pl, pos }) => (
                        <tr key={pl.ids?.join('|') || pl.spieler.join('|') || pos}
                          className="border-b border-zinc-900/80 last:border-0
                                     hover:bg-zinc-900/40">
                          <td className="w-10 py-2 pl-4 align-middle text-slate-600
                                         tabular-nums">{pos}</td>
                          <td className="py-2 align-middle">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              {pl.spieler.map((n, k) => (
                                <span key={k} className="flex items-center gap-1">
                                  {k > 0 && <span className="text-slate-600">+</span>}
                                  <Flagge land={landFuer(n, pl.ids?.[k])} groesse={11} />
                                  <span className="text-slate-200">
                                    {kurzName(findeProfil(n, pl.ids?.[k])?.anzeige || n)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="w-24 py-2 pr-4 text-right align-middle
                                         font-semibold tabular-nums text-sky-400">
                            {pl.wert.toLocaleString('de-DE')}
                            {offeneListe?.einheit && (
                              <span className="ml-0.5 text-[10px] font-normal
                                               text-slate-500">
                                {offeneListe.einheit}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Die Befehlsübersicht.
          Gebaut aus dem, was gerade geladen ist - was hier steht, geht auch.
          Ein Klick setzt den Befehl ins Feld, Enter drückt ihn ab. */}
      {befehleOffen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center
                        overflow-y-auto bg-black/70 p-4 sm:p-8"
          onClick={() => setBefehleOffen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900
                       p-5 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Befehle
                <span className="ml-2 text-[11px] font-normal text-slate-500">
                  {befehlsZahl} Möglichkeiten
                  {stats ? '' : ' — mit geladenem Cup werden es deutlich mehr'}
                </span>
              </h3>
              <button onClick={() => setBefehleOffen(false)}
                className="text-slate-500 hover:text-slate-200">✕</button>
            </div>

            <input value={befehlSuche} onChange={(e) => setBefehlSuche(e.target.value)}
              placeholder="durchsuchen — damage, wins, elims …"
              className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-sky-500" />

            <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
              {befehlsGruppen.map((g) => {
                const q = befehlSuche.trim().toLowerCase();
                const treffer = q
                  ? g.befehle.filter((x) =>
                    x.b.toLowerCase().includes(q) || x.e.toLowerCase().includes(q))
                  : g.befehle;
                if (!treffer.length) return null;
                return (
                  <div key={g.titel}>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider
                                   text-sky-400">
                      {g.titel}
                      <span className="ml-1.5 font-normal text-slate-600">
                        ({treffer.length})
                      </span>
                    </h4>
                    <p className="mb-2 text-[11px] leading-snug text-slate-500">
                      {g.hinweis}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {treffer.map((x) => (
                        <button key={g.titel + x.b}
                          onClick={() => {
                            setBefehl(x.b); setBefehleOffen(false);
                          }}
                          title={x.e}
                          className="flex flex-col rounded-lg border border-zinc-800
                                     px-2.5 py-1.5 text-left transition
                                     hover:border-sky-500 hover:bg-sky-950/20">
                          <span className="truncate font-mono text-[12px] text-slate-200">
                            {x.b}
                          </span>
                          <span className="truncate text-[10px] text-slate-500">
                            {x.e}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] leading-snug text-slate-600">
              Diese Liste entsteht aus dem geladenen Spieltag — was hier steht,
              lässt sich auch abschicken. Zahlen in einem Befehl sind frei
              wählbar, und ein Name schlägt immer eine Kennzahl mit denselben
              Buchstaben.
            </p>
          </div>
        </div>
      )}

    </main>
  );
}
