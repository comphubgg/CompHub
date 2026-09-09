'use client';

// Eigene Seite je Cup: Spieltage oben, Eventinfos, darunter das
// Leaderboard mit Suche und aufklappbaren Team-Details.
// Bewusst schlank gehalten - keine Power Rankings, keine Match-Listen,
// keine Streams.

import {
  Fragment, memo, use, useCallback, useEffect, useDeferredValue, useMemo,
  useRef, useState, type Dispatch, type SetStateAction,
} from 'react';
import Link from 'next/link';
import TeamFlagge, { flaggenPfad } from '@/components/TeamFlagge';
import { namensSchluessel } from '@/lib/homoglyph';

import T from '@/app/components/T';
import { regionFarbe } from '@/lib/regionFarbe';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { kartenTitel } from '@/lib/rundenName';
/**
 * Regionen, fuer die von selbst eine Karte bereitsteht.
 *
 * Karten entstehen nur fuer Europa und NA Central - anderswo waeren es
 * Knoepfe, hinter denen nie jemand etwas eintraegt.
 */
const KARTEN_REGIONEN = ['EU', 'NAC'];

interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string;
  region: string; runde: number;
  istFinale: boolean; tokens: string[];
  /** Wie viele Teams sich qualifizieren - aus Epics Auszahlungstabelle. */
  qualifiziert?: number;
  matchCap?: number;
}
/**
 * Eine Zeile in der Aufstellung einer Runde - so liefert sie
 * /api/cup-matches.
 */
interface SpielZeile {
  platz: number | null;
  /** Der Platz am Ende des ganzen Spieltags, zum Wiedererkennen. */
  tagesPlatz: number;
  teamId: string | null;
  spieler: Array<{ id: string; name: string }>;
  elims: number;
  wins: number;
  timeAlive: number;
  damage: number;
  /** Wann dieses Team ausgeschieden ist. */
  ende?: string | null;
  /** Aus Epics Punktetabelle gerechnet - null, wenn es keine gibt. */
  punkte?: number | null;
}

/** Eine einzelne Runde des Spieltags. */
interface Spiel {
  id: string;
  nummer: number;
  ende: string | null;
  laengsteLebenszeit: number;
  sieger: string[];
  teams: SpielZeile[];
  /** Laufen die Platznummern lueckenlos von eins durch? */
  vollstaendig?: boolean;
  /** Wie viele Plaetze bis zum hoechsten gesehenen fehlen. */
  fehlend?: number;
  /** Laeuft diese Lobby gerade noch? */
  live?: boolean;
  /** Beginn der Runde - hergeleitet aus Endzeit minus Lebenszeit. */
  beginn?: string | null;
  /** Dauer in Sekunden, zum Zeitpunkt der Antwort. */
  dauer?: number | null;
  /** Der hoechste vergebene Platz - so gross war die Lobby. */
  lobby?: number | null;
  /** Wie viele Teams noch im Spiel sind. */
  verbleibend?: number;
  /** Wie viele Teams wir zu dieser Runde ueberhaupt sehen. */
  gesehen?: number;
}

/** "18m 13s" - so steht die Dauer auch beim Vorbild. */
function dauerText(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Ein Platz in einer Bestenliste. */
interface StatPlatz { rank: number; spieler: string[]; ids: string[]; wert: number }

/** Eine Kennzahl mit ihren Plaetzen - so liefert sie /api/cup-stats. */
interface Bestenliste {
  schluessel: string;
  titel: string;
  symbol: string;
  einheit: string | null;
  /** Wie viele Nachkommastellen die Werte dieser Liste haben. */
  nachkomma?: number;
  /** Die Spitze fuer die Kachel. */
  plaetze: StatPlatz[];
  /** Das ganze Feld - dahinter steht das Pluszeichen. */
  alle: StatPlatz[];
}

interface Cup {
  id: string; titel: string; untertitel?: string;
  bild?: string; farbe?: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  live: boolean;
}
interface Spieler { id: string; name: string; img?: string | null; logo?: string | null }
/** Von Hand gepflegte Angaben zu einem Spieler - hier zaehlt nur das Land. */
interface Profil {
  land?: string; namen?: string[]; name?: string;
  /* Beim Setzen einer Flagge muessen diese Angaben mitgeschickt werden,
     sonst schreibt der Speichervorgang sie weg. */
  x?: string; region?: string; anzeige?: string;
  /** Twitch-Kanal, von Hand gepflegt - siehe app/api/spieler-profile. */
  twitch?: string;
}
interface Match {
  placement?: number; elims?: number; timeAlive?: number; endTime?: string;
}
interface Eintrag {
  rank: number; points: number; elims: number; games: number; wins: number;
  avgPlace: number; avgPoints: number; avgElims: number; kd: number;
  bestPlace: number | null; timeAlive: number; damage: number;
  players: Spieler[]; matches: Match[];
}

/**
 * Eine Kachel der Rundenliste - bewusst ein eigenes, gemerktes Bauteil.
 *
 * Ein Spieltag hat ueber zwanzigtausend davon. Standen sie unmittelbar in
 * der Ausgabe, liess jede Zustandsaenderung React alle noch einmal
 * durchgehen: das Oeffnen einer Lobby brauchte gemessen 1.667
 * Millisekunden, und waehrend die Liste weiterwuchs, geschah das alle
 * hundertzwanzig Millisekunden erneut. Genau daran scheiterten Klicks auf
 * die unteren Kacheln - der Betreiber: "ich konnte irgendwie nicht darauf
 * druecken unten."
 *
 * Mit memo prueft React nur noch, ob sich die Angaben dieser einen Kachel
 * geaendert haben, und ueberspringt sie sonst. Deshalb bekommt sie nur
 * Werte, die sich nicht bei jedem Durchlauf neu ergeben: "offen" statt der
 * geoeffneten Kennung, die fertige Dauer statt der Uhr, und mit "oeffnen"
 * die Zustandsfunktion selbst, die ueber die ganze Lebensdauer dieselbe
 * bleibt.
 */
const SpielKachel = memo(function SpielKachel({
  sp, offen, eineLobby, ort, dauer, namenVon, oeffnen,
}: {
  sp: Spiel;
  offen: boolean;
  eineLobby: boolean;
  ort: string;
  dauer: number;
  namenVon: (spieler: Spieler) => string;
  oeffnen: Dispatch<SetStateAction<string | null>>;
}) {
  return (
    <button
      onClick={() => oeffnen((v) => (v === sp.id ? null : sp.id))}
      className={`rounded-lg border px-3 py-2.5 text-left
                  transition ${offen
        ? 'border-sky-600 bg-sky-950/20'
        : sp.live
          ? 'border-rose-900/60 bg-zinc-900/40 hover:border-rose-700'
          : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'}`}>
      {/* Erste Zeile: was es ist, und wann es anfing. */}
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {sp.live && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full
                               animate-ping rounded-full bg-rose-500
                               opacity-75" />
              <span className="relative inline-flex h-2 w-2
                               rounded-full bg-rose-500" />
            </span>
          )}
          {/*
            * "Match ended" statt "Lobby".
            *
            * Der Betreiber: "Es soll nie Lobby heissen. Es
            * soll eigentlich wie bei Fortnite Tracker sein -
            * match ended oder match live." Bei einem Finale,
            * in dem alle in derselben Lobby spielen, bleibt
            * die Rundennummer davor: dort meint "Runde 3"
            * fuer jeden dasselbe Spiel.
            */}
          <span className={`text-xs font-semibold uppercase
                            tracking-wide ${sp.live
            ? 'text-rose-400' : 'text-slate-300'}`}>
            {sp.live ? <T>Match läuft</T>
              : eineLobby ? <><T>Runde</T> {sp.nummer}</>
              : <T>Match beendet</T>}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xs font-semibold
                           tabular-nums text-slate-200">
            {(sp.live ? sp.beginn : sp.ende)
              ? new Date((sp.live ? sp.beginn : sp.ende)!)
                .toLocaleTimeString(ort,
                  { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
          <span className="block text-[10px] text-slate-600">
            {(sp.live ? sp.beginn : sp.ende)
              ? new Date((sp.live ? sp.beginn : sp.ende)!)
                .toLocaleDateString(ort,
                  { day: 'numeric', month: 'short' })
              : ''}
          </span>
        </span>
      </div>

      {/* Zweite Zeile: wie lange sie laeuft. */}
      <p className="mt-0.5 text-[11px] text-slate-500">
        <T>Dauer</T> {dauerText(dauer)}
      </p>

      {/* Dritte Zeile: wer noch drin ist - oder wer gewann. */}
      <div className="mt-2 border-t border-zinc-800/80 pt-2">
        {sp.live ? (
          <span className="flex items-center justify-between gap-2
                           text-[11px]">
            <span className="text-slate-400">
              <T>Teams noch im Spiel</T>
            </span>
            <span className="font-semibold tabular-nums
                             text-amber-400">
              {sp.verbleibend ?? 0}
              <span className="text-slate-600"> / {sp.lobby ?? '—'}</span>
            </span>
          </span>
        ) : sp.sieger.length > 0 ? (
          /* Wie beim Vorbild: ein Pokal, das Wort "Winners"
             und dahinter das Duo. */
          <span className="flex items-baseline gap-1.5
                           text-[11px] text-amber-400">
            <span className="not-italic">🏆</span>
            <span className="shrink-0 text-slate-500">
              <T>Sieger</T>:
            </span>
            <span className="min-w-0 truncate">
              {sp.sieger.map((n, k) => namenVon({
                name: n,
                id: sp.teams.find((x) => x.platz === 1)
                  ?.spieler[k]?.id ?? '',
              })).join(', ')}
            </span>
          </span>
        ) : (
          /*
           * Kein Sieger heisst nicht "kein Sieger".
           *
           * Hier stand nur eine Zahl - "1 Teams" -, und der Betreiber
           * fragte zu Recht: wieso nur eins? Der Grund ist immer derselbe:
           * die Aufstellung entsteht aus der Bestenliste, und die reicht
           * bis Platz zehntausend. Wer diese Lobby gewonnen hat, liegt am
           * Tag weiter hinten und kommt in keiner Zeile vor. Das gehoert
           * dazugesagt statt einer nackten Zahl.
           */
          <span className="text-[11px] text-slate-600">
            {sp.gesehen ?? sp.teams.length}{' '}
            <T>von dieser Lobby im Leaderboard</T>
          </span>
        )}
      </div>
    </button>
  );
});

const REGION_TEXT: Record<string, string> = {
  GLOBAL: 'Alle Regionen', EU: 'Europe', NAC: 'NA Central', NAW: 'NA West',
  BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

/*
 * Datum, Uhrzeit und Zahlen richten sich nach der eingestellten Sprache.
 *
 * Vorher stand ueberall fest 'de-DE'. Wer auf Englisch gestellt hatte, las
 * trotzdem "Di., 25. Aug." und "1.476" - mitten in einer sonst englischen
 * Seite. Englisch bekommt en-GB und nicht en-US, weil die Turnierszene hier
 * Tag vor Monat und die 24-Stunden-Uhr liest.
 */
function ortVon(sprache: string) {
  return sprache === 'en' ? 'en-GB' : 'de-DE';
}
function tag(ms: number, ort = 'de-DE') {
  return new Date(ms).toLocaleDateString(ort,
    { weekday: 'short', day: '2-digit', month: 'short' });
}
function uhr(ms: number, ort = 'de-DE') {
  return new Date(ms).toLocaleTimeString(ort, { hour: '2-digit', minute: '2-digit' });
}
/**
 * Eine Durchschnittszahl mit fester Nachkommastelle.
 *
 * Der Betreiber: "mach die Folgezahlen bei Statistik, zum Beispiel average
 * placement, vier Punkt null anstatt vier."
 *
 * Der Grund fuer das Fehlen: die Zahl wird als Zahl gerechnet, und 17.00
 * ist als Zahl schlicht 17. In einer Spalte, in der darueber 15,09 und
 * 17,55 stehen, sieht die eine ganze Zahl aus wie ein anderes Mass.
 * Zwei Stellen, immer - dann steht die Spalte gerade.
 */
function schnitt(wert: number, ort = 'de-DE', stellen = 2) {
  if (!Number.isFinite(wert) || wert === 0) return '–';
  return wert.toLocaleString(ort, {
    minimumFractionDigits: stellen, maximumFractionDigits: stellen,
  });
}

function dauer(sek: number) {
  if (!sek) return '–';
  const m = Math.floor(sek / 60);
  return m < 1 ? `${Math.round(sek)}s` : `${m}m ${String(Math.round(sek % 60)).padStart(2, '0')}s`;
}

/** Wie viele Plaetze hoechstens geholt werden. Darueber wird die Tabelle
 *  unbrauchbar, und Epic gibt ohnehin nicht mehr Seiten heraus. */
const MAX_PLAETZE = 10_000;
/**
 * Wie viele Plaetze zuerst geholt werden.
 *
 * Fuenfhundert sind fuenf Seiten bei Epic und in wenigen Sekunden da. Sie
 * decken ab, was jemand beim Oeffnen sieht und was er als Erstes durchblaettert;
 * der Rest kommt nach, ohne dass er darauf wartet.
 */
/**
 * Wie die Bestenliste geholt wird: in Stuecken, nicht am Stueck.
 *
 * Epic gibt hundert Plaetze je Seite und hoechstens hundert Seiten heraus -
 * die zehntausend, die der Betreiber sehen will. Alles auf einmal zu
 * verlangen geht nicht: gemessen ueber hundert Sekunden, und jede Zeitgrenze
 * eines kostenlosen Tarifs liegt darunter. Die Anfrage kam schlicht nie an,
 * und in der Tabelle blieben die ersten fuenfhundert stehen.
 *
 * Deshalb Stueck fuer Stueck. Die ersten fuenf Seiten stehen nach wenigen
 * Sekunden da; danach kommen Zehnerpakete dazu, jedes wenige Sekunden, und
 * die Liste waechst waehrend des Lesens weiter bis ans Ende des Feldes.
 * Teuer ist dabei nicht das Blaettern, sondern das Aufloesen der Namen - und
 * die sind ab dem zweiten Paket zum grossen Teil schon gemerkt.
 */
const ERSTE_SEITEN = 5;
const STUECK_SEITEN = 10;

/**
 * Wie viele Runden zuerst gezeichnet werden und wie viele danach je Schritt
 * dazukommen.
 *
 * Eine Runde ist eine Kachel mit Uhrzeit, Dauer und Siegern. Bei einer
 * Qualifikation sind es mehrere hundert; alle auf einmal zu zeichnen legt
 * die Seite fuer einen Moment lahm. Dreissig stehen sofort da, der Rest
 * kommt in Schritten nach, ohne dass jemand etwas anklicken muss.
 */
const ERSTE_SPIELE = 30;

/**
 * Wie schnell die Rundenliste weiterwaechst - bis zum Ende, ohne Deckel.
 *
 * Hier stand einmal eine Obergrenze von dreihundert: darueber hinaus wuchs
 * die Liste nur noch beim Scrollen, aus Sorge, zwanzigtausend Kacheln
 * koennten den Browser belasten. Der Betreiber hat das zurueckgewiesen -
 * "wieso bleibt es nur so wenig? Es soll alle laden, alle
 * zwanzigtausendsechshundertzweiundvierzig". Die Entscheidung gehoert ihm,
 * die Grenze ist deshalb weg.
 *
 * Geblieben ist die Schrittweite. Fuenfzig Kacheln alle hundertzwanzig
 * Millisekunden sind rund vierhundert je Sekunde: ein voller Spieltag steht
 * damit in etwa einer Minute vollstaendig da, und dazwischen bleibt die
 * Seite bedienbar, weil zwischen den Schritten gezeichnet werden kann.
 *
 * Wer scrollt, wartet nicht auf diesen Takt: das Ende der Liste zieht beim
 * Erscheinen sofort einen groesseren Schwung nach.
 */
const SPIELE_SCHRITT = 50;
const SPIELE_TAKT = 120;
const SPIELE_SPRUNG = 400;

/**
 * Wie gross ein Schritt ist - er waechst mit der Liste mit.
 *
 * Mit fester Schrittweite wird das Fuellen immer langsamer, statt gleich
 * schnell zu bleiben: jeder Schritt laesst React die gesamte bisherige
 * Liste noch einmal durchgehen, und die ist beim zehntausendsten Eintrag
 * eben zehntausend lang. Gemessen mit festen fuenfzig: von 5.930 auf 8.180
 * in vierzig Sekunden - hochgerechnet ueber vier Minuten fuer einen
 * Spieltag, mit fallender Tendenz.
 *
 * Ein Schritt von rund einem Drittel des schon Gezeigten haelt die Zahl der
 * Durchlaeufe klein und damit die Gesamtzeit kurz. Nach oben ist er
 * gedeckelt, damit am Ende nicht ein einziger Sprung ueber Tausende von
 * Kacheln entsteht, der die Seite fuer einen Moment stehen laesst.
 */
function naechsterSchritt(gezeigt: number): number {
  return Math.min(Math.max(SPIELE_SCHRITT, Math.round(gezeigt * 0.35)), 1_200);
}

/**
 * Wie eine Stufe der Auszahlungstabelle heisst.
 *
 * Epic kennt drei Arten, und sie bedeuten voellig Verschiedenes:
 *
 *   rank        die Platzierung   -> "Top #500"
 *   value       erspielte Punkte  -> "8 Points"
 *   percentile  der obere Anteil  -> "Top 5 %"
 *
 * Hier stand fuer alle drei dasselbe: eine Raute und die Zahl. Bei einem
 * Skin-Cup, wo es den Gegenstand fuer acht Punkte gibt, las sich das als
 * "Platz 8" - der Betreiber hat darauf hingewiesen: "da steht Hashtag acht
 * bei mir, nicht acht Points, das macht schon einen grossen Unterschied."
 * Es ist auch keine Kleinigkeit: die eine Angabe ist fuer fast jeden
 * erreichbar, die andere fuer acht Teams weltweit.
 */
function schwellenText(art: string, schwelle: number): string {
  if (art === 'percentile') return `Top ${(schwelle * 100).toFixed(0)} %`;
  if (art === 'value') return `${schwelle} Points`;
  return `Top #${schwelle}`;
}

/** Wie viele Zeilen je Schritt im Dokument stehen. */
/**
 * Wie viele Zeilen auf eine Seite duerfen.
 *
 * Zehntausend Plaetze auf einmal zu zeichnen laesst den Browser haengen -
 * jede Zeile ist aufklappbar und bringt ihr eigenes Innenleben mit. Mehr als
 * hundert steht deshalb bewusst nicht zur Wahl; darueber blaettert man.
 */
const ZEILEN_PRO_SEITE = [50, 100] as const;

/** Der Knopf zur Turnierkarte. Steht ueber und unter dem Leaderboard,
 *  damit man ihn nicht suchen muss. */
function KartenKnopf({ karte, aufVerstecken }: {
  karte: { id: string; titel: string; spiele?: string; bildTitel?: string;
    /** Eigenes Ziel - fuer die Karte, die es noch gar nicht gibt. */
    href?: string };
  /** Nur fuer Admins gesetzt - blendet die Karte oeffentlich aus. */
  aufVerstecken?: (id: string) => void;
}) {
  const t = useT();
  return (
    <span className="relative inline-flex">
    <a href={karte.href ?? `/karten?id=${encodeURIComponent(karte.id)}`}
      className="mb-5 inline-flex items-center gap-2 rounded-xl border border-sky-500
                 bg-sky-950/40 px-4 py-2.5 text-sm font-medium text-sky-200
                 transition hover:border-sky-400 hover:bg-sky-900/50">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 5.5 7.5 3l5 2.5L17.5 3v11.5L12.5 17l-5-2.5L2.5 17z" />
        <path d="M7.5 3v11.5M12.5 5.5V17" />
      </svg>
      {/* Der Name der Insel steht vorn - danach unterscheiden sich zwei
          Karten eines Spieltags. Die Spielangabe ist ein Zusatz. */}
      {karte.bildTitel ?? 'Karte öffnen'}
      <span className="text-xs text-sky-400/80">
        {karte.spiele ? `Spiele ${karte.spiele}` : karte.titel}
      </span>
    </a>
    {aufVerstecken && (
      // Verstecken, nicht loeschen: Formen und Zuordnung bleiben erhalten und
      // die Karte laesst sich im Editor jederzeit wieder hervorholen.
      <button type="button" onClick={() => aufVerstecken(karte.id)}
        title={t('Öffentlich ausblenden — die Karte bleibt erhalten')}
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center
                   rounded-full border border-rose-700 bg-zinc-950 text-[11px]
                   leading-none text-rose-400 transition hover:bg-rose-950
                   hover:text-rose-200">
        ×
      </button>
    )}
    </span>
  );
}

export default function CupSeite({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  // In dieser Next-Version sind Routen-Parameter ein Promise.
  const { id } = use(params);

  const [cup, setCup] = useState<Cup | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('');
  const [fenster, setFenster] = useState<Fenster | null>(null);

  const [tabelle, setTabelle] = useState<Eintrag[]>([]);
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [stand, setStand] = useState('');
  /** Die Turnierstatistik - nur zu einem Finale. */
  const [statistik, setStatistik] = useState<Bestenliste[]>([]);
  /**
   * Spieltage, zu denen bewusst keine Karte angeboten wird.
   *
   * Bei dreihundert Duos im Finale ergibt eine Karte keinen Sinn mehr -
   * der Admin nimmt das Angebot dort weg. Gespeichert wird nur die
   * Fenster-Kennung; zurueckholen laesst es sich jederzeit.
   */
  const [ohneKarte, setOhneKarte] = useState<string[]>([]);

  /*
   * Die einzelnen Runden des Spieltags.
   *
   * Der Betreiber wollte "Matches, dass man da draufdruecken kann, dann
   * sieht man, welcher Platz welcher Spieler in welchem Game wurde - plus
   * man kann die Match ID kopieren". Genau das steht hier.
   *
   * Geladen wird erst auf Verlangen: dafuer muss die ganze Bestenliste
   * geholt werden, weil Epic die Rundenlisten an die Teams haengt und nicht
   * an die Runden. Das jedes Mal beim Oeffnen einer Eventseite zu tun,
   * waere Arbeit fuer nichts.
   */
  const [spiele, setSpiele] = useState<Spiel[] | null>(null);
  const [spieleLaedt, setSpieleLaedt] = useState(false);
  const [offenesSpiel, setOffenesSpiel] = useState<string | null>(null);
  /**
   * Wie viele Runden gerade gezeigt werden.
   *
   * An einem Qualifikationstag sind es hunderte. Frueher standen sechzig da
   * und darunter ein Knopf "alle anzeigen" - der Betreiber wollte keinen
   * Knopf, sondern dass die Liste von allein weiterwaechst. Sie tut das
   * jetzt in kleinen Schritten, damit das Zeichnen die Seite nicht
   * blockiert, waehrend man schon liest.
   */
  const [sichtbareSpiele, setSichtbareSpiele] = useState(ERSTE_SPIELE);
  /** Wie gross die Bestenliste war, als die Runden geholt wurden. */
  const [spieleBasis, setSpieleBasis] = useState(0);
  /**
   * Stiess die Bestenliste an ihre Grenze, als die Runden gebaut wurden?
   *
   * Dann fehlen in jeder Aufstellung die Teams, die im Tagesranking hinter
   * den zehntausend liegen - auch dort, wo keine Luecke zu sehen ist.
   */
  const [spieleFeldGrenze, setSpieleFeldGrenze] = useState(false);
  /** Suche innerhalb der Runden - Sieger oder irgendein Mitspieler. */
  const [spielSuche, setSpielSuche] = useState('');
  /** Der Fuss der Rundenliste - daran haengt das Nachladen beim Scrollen. */
  const mehrRef = useRef<HTMLDivElement | null>(null);
  /** Alle Lobbys, nur die laufenden oder nur die beendeten. */
  const [spielFilter, setSpielFilter] = useState<'alle' | 'live' | 'fertig'>('alle');
  /*
   * Ein Sekundentakt fuer die laufenden Lobbys.
   *
   * Die Dauer wird nicht aus der Antwort uebernommen, sondern aus dem
   * hergeleiteten Beginn gerechnet - sonst stuende dort eine Zahl, die beim
   * Laden der Seite stimmte und danach stehenblieb.
   */
  const [jetzt, setJetzt] = useState(() => Date.now());

  /*
   * Was gerade zu sehen ist.
   *
   * Vorher stand alles untereinander: Bestenliste, Runden und
   * Turnierstatistik auf einer sehr langen Seite. Der Betreiber wollte es
   * wie bei der Quelle, die er sonst benutzt - eine Leiste, in der man
   * auswaehlt, statt alles gleichzeitig zu sehen.
   */
  const [reiter, setReiter] =
    useState<'liste' | 'runden' | 'spieler' | 'teams' | 'streams'>('liste');

  /*
   * Wer aus diesem Cup gerade sendet.
   *
   * Gefragt wird nur nach Kanaelen, die im Spielerprofil stehen - geraten
   * wird keiner. Aus einem Turniernamen den passenden Twitch-Kanal zu
   * erschliessen geht regelmaessig daneben, und ein fremder Stream unter
   * dem Namen eines Profis waere ein Fehler, den niemand bemerkt.
   */
  const [live, setLive] = useState<Record<string,
    { isLive: boolean; viewers: number }> | null>(null);
  const [liveLaedt, setLiveLaedt] = useState(false);

  /*
   * Die Ordner der Multiview.
   *
   * Es sind dieselben, die auf der Startseite die Streams nebeneinander
   * legen (/api/dashboard). Wer hier auf das Plus drueckt, legt den Stream
   * genau dort ab - und findet ihn beim naechsten Aufruf der Multiview
   * wieder, ohne ihn noch einmal zu suchen.
   */
  const [ordner, setOrdner] = useState<Array<{
    id: string; name: string; streamers: Array<{ twitch: string; twitter: string }>;
  }> | null>(null);
  /** Zu welchem Kanal steht die Ordnerauswahl gerade offen? */
  const [ordnerFuer, setOrdnerFuer] = useState<string | null>(null);
  const [neuerOrdner, setNeuerOrdner] = useState('');
  const [ordnerStand, setOrdnerStand] = useState('');

  /** Der Titel am Plus - einmal uebersetzt statt in jeder Kachel. */
  const uebsOrdner = t('Zu einem Multiview-Ordner hinzufügen');

  /** Twitch-Kanaele je Spieler im Bearbeiten-Fenster. */
  const [twitchEntwurf, setTwitchEntwurf] = useState<string[]>([]);
  const [twitchVorschlag, setTwitchVorschlag] = useState<Record<number, Array<{
    login: string; name: string; live: boolean; bild: string; spiel: string;
  }>>>({});
  /** Was Twitch zur Suche gemeldet hat - meist nichts, sonst ein Grund. */
  const [twitchHinweis, setTwitchHinweis] = useState('');

  /*
   * Werte je einzelnem Spieler.
   *
   * Kommen aus den Replays, nicht aus dem Leaderboard - Epic zaehlt dort je
   * Team, und bei einem Duo waere nicht zu erkennen, wer die Elims geholt
   * hat. Auch das wird erst auf Verlangen geladen.
   */
  const [spielerWerte, setSpielerWerte] = useState<{
    vorhanden: boolean; runden: number;
    /** Wie viele Runden dieser Spieltag insgesamt hat. */
    rundenGesamt?: number | null;
    /** Wann der Replay-Sammler zuletzt lief - siehe app/api/cup-spieler. */
    lauf?: { zeitpunkt?: string; art?: string; ok?: boolean; fehler?: string } | null;
    spieler: Array<{
      epicId: string; name: string; land: string; spiele: number;
      kills: number; knocks: number; tode: number; umgehauen: number;
      platz: number | null; partner: string[];
    }>;
  } | null>(null);
  const [spielerLaedt, setSpielerLaedt] = useState(false);
  const [spielerSuche, setSpielerSuche] = useState('');
  const [kopiert, setKopiert] = useState<string | null>(null);

  /** Was es zu gewinnen gibt - aus Epics Auszahlungstabelle. */
  const [preise, setPreise] = useState<{
    vorhanden: boolean; waehrung: string | null; gesamt: number | null;
    /*
     * Jede Stufe deckt eine Spanne von Plaetzen ab, nicht einen einzelnen.
     * "von" ist der erste, "schwelle" der letzte - siehe mitPlaetzen in
     * app/api/cup-preise.
     */
    geld: Array<{ art: string; schwelle: number; betrag: number;
      von?: number; plaetze?: number }>;
    gegenstaende: Array<{
      art: string; schwelle: number; name: string;
      kennung?: string; bild?: string | null; sorte?: string | null;
    }>;
    /** Wahr, wenn die Zahlen aus der gepflegten Datei stammen, nicht von Epic. */
    gepflegt?: boolean; quelle?: string | null; proPerson?: boolean;
    erlaeuterung?: string | null;
    wertung?: Array<{ was: string; schwelle: number; regel: string;
      punkte: number; jeStueck: boolean }>;
  } | null>(null);
  /**
   * Wie viele Punkte es voraussichtlich braucht.
   *
   * Epic nennt nur die Rangschwelle ("Top 300"). Die Punktzahl dazu kommt
   * aus den frueheren Ausgaben desselben Cups - gerechnet, nicht geraten.
   */
  const [qual, setQual] = useState<{
    schnitt: number | null; grundlage: number; schwelle?: number;
    /** Was dieser Spieltag wirklich gekostet hat - nur wenn er vorbei ist. */
    tatsaechlich?: number | null;
    /** Wahr, wenn die Schwelle aus dem Finalfeld gezaehlt wurde. */
    hergeleitet?: boolean;
    ausgaben: Array<{ windowId: string; datum: number; punkte: number | null }>;
  } | null>(null);

  useEffect(() => {
    let weg = false;
    /*
     * Auch ohne Epics Rangschwelle fragen.
     *
     * Vorher lief das nur, wenn "qualifiziert" gesetzt war - und das steht
     * bei den wenigsten Cups in Epics Auszahlungstabelle. Bei allen anderen
     * gab es gar keine Auskunft, obwohl sie sich herleiten laesst: wer in
     * der naechsten Runde antritt, ist der Kreis, der weitergekommen ist.
     * Die Schnittstelle zaehlt das selbst, wenn keine Schwelle mitkommt.
     */
    const holen = fenster
      ? fetch(`/api/qualifikation?window=${encodeURIComponent(fenster.windowId)}`
        + `&region=${encodeURIComponent(fenster.region)}`
        + (fenster.qualifiziert ? `&schwelle=${fenster.qualifiziert}` : ''))
        .then((r) => r.json())
        .then((j) => (j?.vorhanden ? j : null))
      : Promise.resolve(null);
    holen.then((v) => { if (!weg) setQual(v); }).catch(() => {});
    return () => { weg = true; };
  }, [fenster]);

  /** Welcher Reiter im Preis-Block offen ist. */
  const [preisReiter, setPreisReiter] = useState<'preis' | 'wertung'>('preis');
  /** Welche Kennzahl in voller Laenge offen ist. */
  const [offeneListe, setOffeneListe] = useState<Bestenliste | null>(null);
  const [listenTiefe, setListenTiefe] = useState(50);
  /** Suchfeld der geoeffneten Kennzahl - bei tausenden Zeilen unverzichtbar. */
  const [listenSuche, setListenSuche] = useState('');
  const [listeLaedt, setListeLaedt] = useState(false);

  /**
   * Eine Kennzahl oeffnen und dabei das ganze Feld nachladen.
   *
   * In der Uebersicht steckt je Kennzahl nur die Spitze - alle fuenfzehn in
   * voller Laenge mitzuschicken waeren bei einem grossen Cup mehrere
   * Megabyte bei jedem Aufruf. Beim Oeffnen wird deshalb genau diese eine
   * nachgeholt. Vorher standen dort hundert Zeilen, auch wenn "Alle"
   * gewaehlt war, und bei einem Cup mit zehntausend Teilnehmern sah das aus
   * wie ein Fehler.
   */
  const listeOeffnen = useCallback((b: Bestenliste) => {
    setOffeneListe(b); setListenTiefe(50); setListenSuche('');
    if (!fenster) return;
    setListeLaedt(true);
    fetch(`/api/cup-stats?event=${encodeURIComponent(fenster.eventId)}`
      + `&window=${encodeURIComponent(fenster.windowId)}`
      + `&liste=${encodeURIComponent(b.schluessel)}&limit=10000&top=5`)
      .then((r) => r.json())
      .then((d) => {
        const voll = (d.bestenlisten ?? [])[0];
        if (voll?.alle?.length) {
          setOffeneListe((jetzt) => (jetzt && jetzt.schluessel === b.schluessel
            ? { ...jetzt, alle: voll.alle } : jetzt));
        }
      })
      .catch(() => { /* dann bleibt die kurze Liste stehen */ })
      .finally(() => setListeLaedt(false));
  }, [fenster]);
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  /** Laeuft gerade eine tiefere Stufe der Bestenliste? */
  const [vertieft, setVertieft] = useState(false);
  /*
   * Laufende Nummer des Ladevorgangs.
   *
   * Sie entscheidet, wessen Ergebnis noch geschrieben werden darf - siehe
   * die Erklaerung im Ladevorgang selbst.
   */
  const laufNr = useRef(0);
  /**
   * Die gepflegten Spielerprofile.
   *
   * Epic liefert keine Herkunft, und die einzige Rangliste, die welche fuehrt,
   * ordnet nachweislich falsch zu. Die Flagge kommt deshalb allein aus dem,
   * was von Hand eingetragen wurde - alles andere zeigt den Globus.
   */
  const [profile, setProfile] = useState<Record<string, Profil>>({});

  /* ------------------------------------------------------ Flaggen pflegen */

  /**
   * Welches Team steht gerade im Flaggenfenster?
   *
   * Epic liefert keine Herkunft, und die einzige Rangliste, die welche fuehrt,
   * ordnet nachweislich falsch zu. Wer sie kennt, traegt sie hier von Hand
   * ein - gespeichert wird zur Epic-Konto-Id, damit gleiche Namen nicht
   * durcheinandergeraten. Nur Flaggen: Namen bleiben, wie Epic sie fuehrt.
   */
  const [flaggenTeam, setFlaggenTeam] = useState<Eintrag | null>(null);
  const [flaggenEntwurf, setFlaggenEntwurf] = useState<string[]>([]);
  const [flaggen, setFlaggen] = useState<string[]>([]);
  const [flaggenSuche, setFlaggenSuche] = useState('');
  const [flaggenStand, setFlaggenStand] = useState('');
  const [offen, setOffen] = useState<number | null>(null);
  /** Karten je Spieltag, sofern der Admin welche hinterlegt hat. */
  /** Je Spieltag koennen mehrere Karten liegen - eine je Spielhaelfte. */
  const [istAdmin, setIstAdmin] = useState(false);
  const [karten, setKarten] = useState<Record<string,
    Array<{ id: string; titel: string; spiele?: string; bildTitel?: string }>>>({});

  // ---- Cup finden ----------------------------------------------------
  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        // Der Parameter heisst "modus", nicht "umfang". Mit dem falschen Namen
        // fiel die Abfrage auf "aktuell" zurueck und lieferte nur laufende und
        // kommende Cups - jeder beendete Cup galt dann als verschwunden.
        const r = await fetch('/api/cup-catalog?modus=alle');
        const d = await r.json();
        if (weg) return;
        if (!r.ok) throw new Error(d.error ?? 'nicht ladbar');
        const c = (d.cups as Cup[]).find((x) => x.id === id);
        if (!c) {
          // Epic haelt vergangene Turniere nur wenige Tage vor. Der Satz nennt
          // deshalb nur, was sicher ist: hier liegt nichts vor.
          setFehler(t('Zu diesem Cup liegen keine Daten mehr vor.'));
          return;
        }
        setCup(c);
        const regionen = Object.keys(c.regionen);
        // Region mit laufendem Fenster bevorzugen, sonst die erste.
        const mitLive = regionen.find((r2) => c.regionen[r2].some((f) => f.status === 'live'));
        setRegion(mitLive ?? regionen[0] ?? '');
      } catch (e) { if (!weg) setFehler((e as Error).message); }
    })();
    return () => { weg = true; };
  }, [id]);

  // ---- Spieltag waehlen ----------------------------------------------
  // Welche Spieltage haben eine Karte? Wird regelmaessig nachgeschaut, damit
  // eine frisch veroeffentlichte Karte ohne Neuladen der Seite auftaucht.
  useEffect(() => {
    if (!cup) return;
    let weg = false;
    const holen = () => {
      fetch('/api/auth/check-admin').then((r) => r.json())
        .then((j) => { if (!weg) setIstAdmin(j.isAdmin === true); }).catch(() => {});
      fetch('/api/turnier-karten')
        .then((r) => r.json())
        .then((d) => {
          if (weg) return;
          const nach: Record<string,
            Array<{ id: string; titel: string; spiele?: string; bildTitel?: string }>> = {};
          for (const k of d.karten ?? []) {
            if (!k.windowId || !k.oeffentlich) continue;
            (nach[k.windowId] ??= []).push({
              id: k.id, titel: k.titel, spiele: k.spiele, bildTitel: k.bildTitel,
            });
          }
          // Nach dem Inselnamen sortieren, damit die Reihenfolge bleibt.
          for (const liste of Object.values(nach)) {
            liste.sort((a, b) => (a.bildTitel ?? a.titel)
              .localeCompare(b.bildTitel ?? b.titel, 'de', { numeric: true }));
          }
          setKarten(nach);
        })
        .catch(() => {});
    };
    holen();
    const uhr = setInterval(holen, 20_000);
    return () => { weg = true; clearInterval(uhr); };
  }, [cup]);

  const kartenHier = (fenster ? karten[fenster.windowId] : undefined) ?? [];


  /**
   * Eine Karte oeffentlich ausblenden.
   *
   * Sie wird nicht geloescht - Formen und Zuordnung bleiben erhalten. Im
   * Karteneditor steht sie weiter in der Liste und laesst sich dort wieder
   * sichtbar schalten.
   */
  const verstecke = useCallback((id: string) => {
    fetch('/api/turnier-karten', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, oeffentlich: false }),
    }).then(() => {
      setKarten((alt) => {
        const nach: typeof alt = {};
        for (const [w, liste] of Object.entries(alt)) {
          const rest = liste.filter((k) => k.id !== id);
          if (rest.length) nach[w] = rest;
        }
        return nach;
      });
    }).catch(() => {});
  }, []);

  const tage = useMemo(
    () => (cup && region ? cup.regionen[region] ?? [] : []),
    [cup, region]);

  /**
   * Wie heisst welches Spielfenster?
   *
   * "Tag 1, Tag 2, Tag 3" durchzuzaehlen war falsch: bei der Performance
   * Evaluation liegen zwei Fenster am selben Abend - von 18 bis 20 Uhr die
   * Vorrunde und von 21 bis 23 Uhr das Finale desselben Spieltags. Als
   * "Tag 1" und "Tag 2" gelesen sah das aus wie zwei Turniertage.
   *
   * Epic sagt die Gliederung selbst, sie steht in der Kennung des Fensters:
   * "S42_PerformanceEvaluation_Event1Round2_EU" ist Event 1, Runde 2. Wo das
   * fehlt, wird nach Kalendertag gruppiert - zwei Fenster am selben Tag sind
   * zwei Runden dieses Tages, nicht zwei Tage.
   */
  const fensterNamen = useMemo(() => {
    const ausKennung = (w: string) => {
      const m = w.match(/Event(\d+)Round(\d+)/i);
      return m ? { tag: +m[1], runde: +m[2] } : null;
    };

    const gelesen = tage.map((f) => ausKennung(f.windowId));
    const gliederung: Array<{ tag: number; runde: number }> = gelesen.every(Boolean)
      ? gelesen as Array<{ tag: number; runde: number }>
      : (() => {
        // Ohne Kennung: nach Kalendertag buendeln.
        const tagNr = new Map<string, number>();
        return tage.map((f) => {
          const schluessel = new Date(f.begin).toDateString();
          if (!tagNr.has(schluessel)) tagNr.set(schluessel, tagNr.size + 1);
          const tagIndex = tagNr.get(schluessel)!;
          const runde = tage.filter((g) =>
            new Date(g.begin).toDateString() === schluessel && g.begin <= f.begin).length;
          return { tag: tagIndex, runde };
        });
      })();

    /** Wie viele Runden hat dieser Tag insgesamt? */
    const rundenJeTag = new Map<number, number>();
    for (const g of gliederung) {
      rundenJeTag.set(g.tag, Math.max(rundenJeTag.get(g.tag) ?? 0, g.runde));
    }

    return tage.map((f, i) => {
      const g = gliederung[i];
      const gesamt = rundenJeTag.get(g.tag) ?? 1;
      // Die letzte Runde eines Tages ist dessen Finale - so ist die
      // Performance Evaluation aufgebaut, und Epics eigenes Kennzeichen
      // steht bei diesen Fenstern nicht. Hat ein Tag nur eine Runde, gibt
      // es nichts zu unterscheiden und die Zeile bleibt leer.
      const finale = f.istFinale || (gesamt > 1 && g.runde === gesamt);
      return {
        finale,
        // Bei einem einzigen Spieltag steht dort nur "Spieltag" - ein Wort,
        // das nichts sagt. Dann bleibt die Zeile leer und das Datum spricht
        // fuer sich.
        haupt: rundenJeTag.size > 1
          ? `${t('Tag')} ${g.tag}` : (tage.length > 1 ? t('Spieltag') : ''),
        neben: gesamt > 1
          ? `${t('Runde')} ${g.runde}${finale ? ` · ${t('Finale')}` : ''}`
          : (f.istFinale ? t('Finale') : ''),
      };
    });
  }, [tage, t]);

  /**
   * Zu jedem Finale steht eine Karte bereit - auch wenn keine gespeichert ist.
   *
   * Sonst muesste der Admin erst eine anlegen, bevor sich ueberhaupt jemand
   * eintragen kann, und bis dahin sieht niemand etwas. Der Weg fuehrt in den
   * Editor auf genau diesen Spieltag; dort liegt die Formvorlage bereit und
   * die Teamliste holt sich selbst, sobald Epic die ersten Qualifizierten
   * kennt. Gespeichert wird erst, wenn wirklich jemand etwas verteilt.
   *
   * Nur fuer die Regionen, fuer die auch Karten gemacht werden - anderswo
   * waere es ein Knopf, hinter dem nie jemand etwas eintraegt.
   */
  const kartenZumZeigen: Array<{ id: string; titel: string; spiele?: string;
    bildTitel?: string; href?: string }> = useMemo(() => {
    if (kartenHier.length || !fenster) return kartenHier;
    if (!KARTEN_REGIONEN.includes(fenster.region)) return kartenHier;

    /*
     * Massgeblich ist dasselbe Kennzeichen, das auch die Beschriftung des
     * Spieltags benutzt - nicht Epics Feld allein. Beim Performance Cup und
     * bei den Reload-Cups steht dort naemlich nichts, obwohl die letzte
     * Runde des Tages sehr wohl das Finale ist; nur der Divisional Cup
     * traegt es selbst ein. An Epics Feld allein haette die Karte deshalb
     * genau bei einem einzigen Turnier gestanden.
     */
    // Hat der Admin das Angebot fuer diesen Spieltag weggenommen, bleibt es weg.
    if (ohneKarte.includes(fenster.windowId)) return kartenHier;
    // Ohne Bestenliste gibt es keine Teams zum Verteilen - eine Karte waere
    // ein leeres Versprechen.
    if (fenster.eventId.startsWith('manuell_')) return kartenHier;

    const i = tage.findIndex((x) => x.windowId === fenster.windowId);
    const istFinale = i >= 0 ? fensterNamen[i]?.finale : fenster.istFinale;
    if (!istFinale) return kartenHier;

    return [{
      id: `bereit:${fenster.windowId}`,
      titel: '',
      // Der echte Name des Spieltags statt eines allgemeinen "Karte oeffnen":
      // "FNCS Division 1 Practice · Week 1 · Finals".
      bildTitel: kartenTitel(cup?.titel, { ...fenster, istFinale }, t)
        || t('Karte öffnen'),
      href: `/karten?event=${encodeURIComponent(fenster.eventId)}`
        + `&window=${encodeURIComponent(fenster.windowId)}`,
    }];
  }, [kartenHier, fenster, tage, fensterNamen, cup, ohneKarte, t]);

  /**
   * Lohnt sich die Statistik zu diesem Spieltag?
   *
   * Zuerst hing sie am Wort "Finale". Das war zu eng: die Reload Elite Series
   * Championship - der Cup mit Abstand den meisten Kennzahlen, fuenfzehn
   * Stueck - heisst bei Epic schlicht "Escargo_Day1" bis "Day4" und traegt
   * nirgends ein Finalkennzeichen. Dort waere nie eine Statistik erschienen.
   *
   * Massgeblich ist deshalb nur noch, ob es ueberhaupt Zahlen geben kann: der
   * Spieltag laeuft oder ist vorbei. Vor dem Anpfiff bleibt der Block weg -
   * eine leere Bestenliste sagt nichts.
   */
  const zeigeStatistik = useMemo(
    () => !!fenster && fenster.status !== 'kommt', [fenster]);

  /**
   * Wie viele Runden bereits gespielt sind.
   *
   * Aus der Bestenliste selbst: die groesste Matchzahl aller Teams. Wer
   * fruehzeitig ausgeschieden ist, hat weniger; die Spitze hat alle.
   * Waehrend eines laufenden Fensters ist das genau die Zahl, die der
   * Betreiber sehen wollte - "standings after game five".
   */
  const gespielteRunden = useMemo(() => {
    let hoechste = 0;
    for (const e of tabelle) hoechste = Math.max(hoechste, e.games ?? 0);
    return hoechste;
  }, [tabelle]);

  /** Laeuft dieses Fenster gerade? */
  useEffect(() => {
    let weg = false;
    fetch('/api/karten-ausblenden').then((r) => r.json())
      .then((j) => { if (!weg) setOhneKarte(j.fenster ?? []); })
      .catch(() => {});
    return () => { weg = true; };
  }, []);

  /** Das Kartenangebot zu diesem Spieltag wegnehmen oder zurueckholen. */
  async function kartenAngebot(windowId: string, aus: boolean) {
    const r = await fetch('/api/karten-ausblenden', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowId, aus }),
    });
    if (!r.ok) return;
    const j = await r.json();
    setOhneKarte(j.fenster ?? []);
  }

  /** Ist der gewaehlte Spieltag ein Finale? Dieselbe Regel wie die Kachel. */
  const finaleJetzt = useMemo(() => {
    if (!fenster) return false;
    const i = tage.findIndex((x) => x.windowId === fenster.windowId);
    return i >= 0 ? Boolean(fensterNamen[i]?.finale) : Boolean(fenster.istFinale);
  }, [fenster, tage, fensterNamen]);

  useEffect(() => {
    let weg = false;
    // Ohne Spieltag nichts zu holen - der Zustand wird trotzdem ueber
    // dieselbe Kette zurueckgesetzt, damit im Effekt kein Zustand
    // unmittelbar gesetzt wird und beim Wechsel keine alten Preise stehen
    // bleiben.
    const holen = fenster
      ? fetch(`/api/cup-preise?window=${encodeURIComponent(fenster.windowId)}`
        + `&region=${encodeURIComponent(fenster.region)}`
        + `&event=${encodeURIComponent(fenster.eventId)}`
        // Die gepflegten Preisgelder gelten meist nur fuer das Finale.
        // Nicht Epics Feld, sondern dieselbe Erkennung wie die Kachel:
        // beim Performance Cup traegt Epic kein Finalkennzeichen, obwohl
        // die letzte Runde des Tages sehr wohl das Finale ist.
        + `&finale=${finaleJetzt ? '1' : '0'}`)
        .then((r) => r.json())
        .then((j) => (j?.error ? null : j))
      : Promise.resolve(null);
    holen.then((v) => { if (!weg) setPreise(v); })
      .catch(() => { if (!weg) setPreise(null); });
    return () => { weg = true; };
  }, [fenster, finaleJetzt]);

  const laeuftGerade = fenster?.status === 'live';

  /**
   * Die Turnierstatistik zum Finale.
   *
   * Dieselben Bestenlisten, die im Beitrags-Werkzeug entstehen - Most Points,
   * Most Eliminations, Most Damage und was das Turnier sonst mitschickt.
   * Bewusst nur je Team. Werte je einzelnem Spieler liegen bei einer
   * fremden Quelle, die nicht zu jedem Spieltag etwas hat - eine Ansicht, die
   * mal da ist und mal nicht, ist schlechter als eine, auf die man sich
   * verlassen kann.
   */
  useEffect(() => {
    if (!fenster || !zeigeStatistik) { setStatistik([]); return; }
    let weg = false;
    fetch(`/api/cup-stats?event=${encodeURIComponent(fenster.eventId)}`
        + `&window=${encodeURIComponent(fenster.windowId)}&top=5`)
      .then((r) => r.json())
      .then((d) => { if (!weg) setStatistik(d.bestenlisten ?? []); })
      .catch(() => { if (!weg) setStatistik([]); });
    return () => { weg = true; };
  }, [fenster, zeigeStatistik]);

  // Die Profile einmal holen - sie aendern sich waehrend eines Cups nicht.
  useEffect(() => {
    fetch('/api/spieler-profile').then((r) => r.json())
      .then((j) => setProfile(j.profile ?? {})).catch(() => {});
    fetch('/api/flaggen').then((r) => r.json())
      .then((j) => setFlaggen(j.flaggen ?? [])).catch(() => {});
  }, []);

  /**
   * Das Land eines Spielers.
   *
   * Gesucht wird zuerst ueber die Epic-Konto-Id, denn Namen sind nicht
   * eindeutig. Erst wenn dort nichts steht, zaehlen die beobachteten Namen.
   */
  /**
   * Die gepflegten Namen einmal nachschlagbar machen.
   *
   * Vorher suchte profilVon je Spieler linear durch alle Profile und
   * normalisierte dabei jeden dort hinterlegten Namen neu. Das ist bei
   * einem einzelnen Spieler unauffaellig und bei einer vollen Bestenliste
   * verheerend: die Suche ruft namenVon fuer zwanzigtausend Spieler auf,
   * mal der Zahl der Profile mal deren Namen - gemessen dreieinhalb bis
   * vier Sekunden Blockade je Tastendruck, obwohl das Filtern selbst
   * Millisekunden braucht. Der Betreiber hat es als "es laedt sehr, sehr
   * lange, bis es das macht, zu lange, dafuer dass nur Text eingegeben
   * wird" beschrieben.
   *
   * Die Zuordnung haengt aber gar nicht am Spieler, sondern nur an den
   * Profilen. Sie wird deshalb einmal gebaut und danach in einem Schritt
   * abgefragt. Die Reihenfolge bleibt dieselbe: der erste Treffer gewinnt,
   * ein spaeteres Profil ueberschreibt einen schon belegten Namen nicht.
   */
  const profilNachName = useMemo(() => {
    const karte = new Map<string, Profil>();
    for (const pr of Object.values(profile)) {
      for (const n of (pr.namen ?? [pr.name ?? ''])) {
        const k = namensSchluessel(n);
        if (k && !karte.has(k)) karte.set(k, pr);
      }
    }
    return karte;
  }, [profile]);

  const profilVon = useCallback((sp: Spieler): Profil | undefined => {
    if (sp.id && profile[sp.id]) return profile[sp.id];
    return profilNachName.get(namensSchluessel(sp.name));
  }, [profile, profilNachName]);

  const landVon = useCallback(
    (sp: Spieler): string | undefined => profilVon(sp)?.land, [profilVon]);

  /**
   * Wie dieser Spieler hier heisst.
   *
   * Der gepflegte Anzeigename gilt vor dem, was Epic gerade ausliefert.
   * Grund: ein Profi aendert seinen Ingame-Namen, wann er will - mal steht
   * ein Teamkuerzel davor, mal ein Turniertag, mal ein Zeichen, das kein
   * Mensch tippen kann. Die Zuordnung haengt an der Konto-Id, und die
   * aendert sich nie. Was der Betreiber einmal eingetragen hat, bleibt
   * deshalb stehen, auch wenn Epic morgen etwas anderes meldet.
   *
   * Ist nichts gepflegt, bleibt Epics Name - erfunden wird hier nichts.
   */
  const namenVon = useCallback(
    (sp: Spieler): string => profilVon(sp)?.anzeige || sp.name, [profilVon]);

  /*
   * Partner und Tagesplatz notfalls aus der Bestenliste.
   *
   * Das Aggregat der Replays kennt die Aufstellung nur, wenn Epics
   * Bestenliste zu diesem Spieltag schon gespiegelt ist - bei einem Cup von
   * gestern Abend ist sie das oft noch nicht, und dann stuende neben jedem
   * Namen weder Partner noch Platz. Die Bestenliste liegt in dieser Ansicht
   * aber ohnehin geladen vor; sie fuellt die Luecke, ohne eine einzige
   * zusaetzliche Abfrage.
   */
  /*
   * Fuer alles, was ueber das ganze Feld laeuft, eine nachlaufende Tabelle.
   *
   * Die Bestenliste kommt in Paketen herein; jedes davon setzt tabelle neu.
   * Haengt eine Berechnung ueber zwanzigtausend Spieler direkt daran, wird
   * sie zehnmal ausgefuehrt, und zwar vorrangig - waehrenddessen nimmt die
   * Seite keinen Klick und keinen Tastendruck an. Genau das hat der
   * Betreiber gemeldet: "es hat immer noch ein ziemlich grosses Delay, bis
   * ich zum Beispiel den Text anklicken kann."
   *
   * Mit dem nachlaufenden Wert bleibt die Bedienung vorn: React zeichnet
   * erst das, was jemand gerade anfasst, und arbeitet diese Karten danach
   * ab.
   */
  const tabelleTraege = useDeferredValue(tabelle);

  const teamAusListe = useMemo(() => {
    const karte = new Map<string, { platz: number; partner: string[] }>();
    // Gebraucht wird sie nur unter "Spieler-Stats". Sie trotzdem bei jedem
    // Paket ueber das ganze Feld zu bauen, ist Arbeit fuer einen Reiter,
    // den niemand offen hat.
    if (reiter !== 'spieler') return karte;
    for (const e of tabelleTraege) {
      for (const sp of e.players) {
        if (!sp.id) continue;
        karte.set(sp.id, {
          platz: e.rank,
          partner: e.players.filter((x) => x.id !== sp.id).map(namenVon),
        });
      }
    }
    return karte;
  }, [reiter, tabelleTraege, namenVon]);

  function flaggenOeffnen(e: Eintrag) {
    setFlaggenTeam(e);
    setFlaggenSuche(''); setFlaggenStand('');
    setFlaggenEntwurf(e.players.map((sp) => profilVon(sp)?.land ?? ''));
    setTwitchEntwurf(e.players.map((sp) => profilVon(sp)?.twitch ?? ''));
    setTwitchVorschlag({});
  }

  /**
   * Twitch-Kanaele zu einem Namen vorschlagen lassen.
   *
   * Gesucht wird mit dem Namen, unter dem der Spieler bekannt ist. Was
   * zurueckkommt, ist ein Vorschlag und nichts weiter - erst ein Klick
   * traegt ihn ein.
   */
  async function twitchSuchen(k: number, begriff: string) {
    if (begriff.trim().length < 2) return;
    try {
      const j = await (await fetch(
        `/api/twitch-suche?q=${encodeURIComponent(begriff.trim())}`)).json();
      setTwitchVorschlag((a) => ({ ...a, [k]: j.kanaele ?? [] }));
      setTwitchHinweis(j.hinweis ?? '');
    } catch { /* dann eben ohne Vorschlag */ }
  }

  /**
   * Die eingestellten Laender festhalten.
   *
   * Die uebrigen gepflegten Angaben gehen mit, sonst fielen X-Konto und
   * Anzeigename beim Setzen einer Flagge stillschweigend weg.
   */
  async function flaggenSichern() {
    if (!flaggenTeam) return;
    setFlaggenStand('speichert …');
    for (let k = 0; k < flaggenTeam.players.length; k++) {
      const sp = flaggenTeam.players[k];
      const vorher = profilVon(sp);
      const land = (flaggenEntwurf[k] ?? '').trim().toUpperCase();
      const twitch = (twitchEntwurf[k] ?? '').trim();
      // Nur schreiben, wenn sich wirklich etwas geaendert hat - sonst
      // schriebe jedes Oeffnen des Fensters die Datei neu.
      if ((vorher?.land ?? '') === land && (vorher?.twitch ?? '') === twitch) continue;
      await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sp.id || undefined, name: sp.name, land, twitch,
          x: vorher?.x ?? '', region: vorher?.region ?? '',
          anzeige: vorher?.anzeige ?? '',
        }),
      });
    }
    const j = await fetch('/api/spieler-profile').then((r) => r.json());
    setProfile(j.profile ?? {});
    setFlaggenTeam(null);
  }

  useEffect(() => {
    if (!tage.length) { setFenster(null); return; }
    setFenster(tage.find((f) => f.status === 'live')
      ?? tage.find((f) => f.status === 'vorbei')
      ?? tage[0]);
  }, [tage]);

  /*
   * Beim Wechsel des Spieltags alles Alte wegwerfen.
   *
   * Sonst stuenden nach einem Klick auf einen anderen Tag noch die Runden
   * des vorigen da - und zwar ohne dass etwas darauf hinweist.
   */
  useEffect(() => {
    setSpiele(null); setOffenesSpiel(null); setKopiert(null);
    setSichtbareSpiele(ERSTE_SPIELE); setSpielSuche(''); setSpieleBasis(0);
    setSpieleFeldGrenze(false);
    setSpielerWerte(null); setLive(null);
  }, [fenster]);

  /*
   * Die Runden werden geholt, sobald der Bereich offen ist - ohne Knopf.
   *
   * Vorher stand dort "Runden anzeigen" und man musste erst klicken. Der
   * Betreiber: "bei den Matches soll ich nicht immer Kollaps oder Show
   * Rounds machen, sondern es wird von alleine gezeigt."
   *
   * Geholt wird zweimal. Zuerst mit der Bestenliste, die gerade dasteht -
   * das sind die ersten Seiten, und die Runden sind damit in wenigen
   * Sekunden sichtbar. Sobald die Bestenliste fertig vertieft ist, noch
   * einmal mit dem vollen Feld: eine einzelne Lobby verteilt sich ueber die
   * ganze Liste, und erst dann ist sie vollstaendig.
   */
  useEffect(() => {
    if (reiter !== 'runden' || !fenster || !tabelle.length) return;
    // Schon geholt, und der Unterbau ist seither nicht groesser geworden.
    if (spiele && (vertieft || tabelle.length <= spieleBasis)) return;
    let weg = false;
    setSpieleLaedt(true);
    setSpieleBasis(tabelle.length);
    fetch(`/api/cup-matches?event=${encodeURIComponent(fenster.eventId)}`
      /*
       * So viel wie das Feld hergibt, nicht mehr.
       *
       * Eine einzelne Lobby verteilt sich ueber die ganze Bestenliste - in
       * einer Runde standen Teams auf Tagesplatz 4 und auf 574 nebeneinander.
       * Mit einer festen Obergrenze fehlte deshalb die halbe Lobby.
       *
       * Wie gross das Feld ist, steht hier aber schon: die Bestenliste ist
       * geladen. Danach richtet sich die Anfrage, statt bei jedem kleinen
       * Finale zehntausend Plaetze zu verlangen.
       */
      + `&window=${encodeURIComponent(fenster.windowId)}`
      + `&limit=${Math.min(MAX_PLAETZE, Math.max(500, tabelle.length))}`)
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        setSpiele(j?.spiele ?? []);
        setSpieleFeldGrenze(Boolean(j?.feldGrenze));
      })
      .catch(() => { if (!weg) setSpiele([]); })
      .finally(() => { if (!weg) setSpieleLaedt(false); });
    return () => { weg = true; };
  }, [reiter, fenster, spiele, tabelle.length, vertieft, spieleBasis]);

  /** Wie viele Lobbys gerade laufen. */
  const laufende = useMemo(
    () => (spiele ?? []).filter((x) => x.live).length, [spiele]);

  /*
   * Welche Runden gezeigt werden - Filter und Suche zusammen.
   *
   * Das stand frueher mitten in der Ausgabe. Es gehoert hierher, weil das
   * Nachwachsen der Liste wissen muss, wie viele es ueberhaupt sind.
   *
   * Gesucht wird im Sieger und in jedem Mitspieler jeder Runde: der
   * Betreiber will nachsehen koennen, in welchen Lobbys ein bestimmter Name
   * vorkam, und die Frage faengt fast immer beim Sieger an.
   */
  const spielSucheTraege = useDeferredValue(spielSuche);

  /*
   * Der durchsuchbare Text einer Runde - einmal gebaut, danach nachgeschlagen.
   *
   * Vorher verglich die Suche bei jedem Tastendruck jeden Namen einzeln:
   * zwanzigtausend Runden mal bis zu fuenfzig Teams mal zwei Spieler, jeder
   * davon mit einem frischen toLowerCase. Das sind rund zwei Millionen
   * Zeichenketten je Buchstabe - gemessen zwei bis vier Sekunden, sobald ein
   * Spieltag vollstaendig geladen war.
   *
   * Der Text aendert sich aber nicht, waehrend jemand tippt. Er wird deshalb
   * je Runde einmal zusammengesetzt und gemerkt; danach kostet ein
   * Tastendruck einen einzigen Vergleich je Runde.
   */
  const suchIndex = useRef<{ quelle: Spiel[] | null; karte: Map<string, string> }>(
    { quelle: null, karte: new Map() });

  const suchtextVon = useCallback((x: Spiel): string => {
    // Neue Runden - alles Gemerkte gehoert zur alten Liste.
    if (suchIndex.current.quelle !== spiele) {
      suchIndex.current = { quelle: spiele, karte: new Map() };
    }
    const karte = suchIndex.current.karte;
    const da = karte.get(x.id);
    if (da !== undefined) return da;
    const teile: string[] = [...(x.sieger ?? [])];
    for (const tm of x.teams) for (const p of tm.spieler) teile.push(p.name);
    const wert = teile.join(' ').toLowerCase();
    karte.set(x.id, wert);
    return wert;
  }, [spiele]);

  /*
   * Und der Text wird schon vorbereitet, bevor jemand tippt.
   *
   * In Haeppchen mit Pausen dazwischen, damit die Seite waehrenddessen
   * bedienbar bleibt. Wer erst spaeter sucht, wartet dann auf gar nichts
   * mehr; wer sofort tippt, baut den Rest eben beim Suchen mit auf.
   */
  useEffect(() => {
    if (reiter !== 'runden' || !spiele?.length) return undefined;
    let i = 0;
    let uhr: ReturnType<typeof setTimeout>;
    let weg = false;
    const schritt = () => {
      if (weg) return;
      const bis = Math.min(i + 500, spiele.length);
      for (; i < bis; i += 1) suchtextVon(spiele[i]);
      if (i < spiele.length) uhr = setTimeout(schritt, 60);
    };
    uhr = setTimeout(schritt, 500);
    return () => { weg = true; clearTimeout(uhr); };
  }, [reiter, spiele, suchtextVon]);

  const spieleGefiltert = useMemo(() => {
    const q = spielSucheTraege.trim().toLowerCase();
    return (spiele ?? []).filter((x) => {
      if (spielFilter === 'live' && !x.live) return false;
      if (spielFilter === 'fertig' && x.live) return false;
      if (!q) return true;
      return suchtextVon(x).includes(q);
    });
  }, [spiele, spielFilter, spielSucheTraege, suchtextVon]);

  /*
   * Die Liste waechst von allein weiter.
   *
   * Ein Schritt je Zeichnung, mit einer kurzen Pause dazwischen: so bleibt
   * die Seite bedienbar, waehrend hinten weiter aufgefuellt wird. Ohne die
   * Pause waere es ein einziger grosser Zeichenvorgang und damit genau das,
   * was vermieden werden soll.
   */
  useEffect(() => {
    if (reiter !== 'runden') return undefined;
    if (sichtbareSpiele >= spieleGefiltert.length) return undefined;
    const uhr = setTimeout(
      () => setSichtbareSpiele((n) => n + naechsterSchritt(n)), SPIELE_TAKT);
    return () => clearTimeout(uhr);
  }, [reiter, sichtbareSpiele, spieleGefiltert.length]);

  /*
   * Und darueber hinaus, sobald das Ende der Liste in Sicht kommt.
   *
   * Der Fuss der Liste wird beobachtet; taucht er auf, kommen weitere
   * Runden dazu. Der Vorlauf von sechshundert Pixeln sorgt dafuer, dass
   * schon nachgelegt ist, bevor man unten ankommt - man scrollt also
   * durch, ohne je auf etwas zu warten oder etwas anzuklicken.
   */
  useEffect(() => {
    if (reiter !== 'runden') return undefined;
    const fuss = mehrRef.current;
    if (!fuss) return undefined;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          setSichtbareSpiele((n) => n + SPIELE_SPRUNG);
        }
      },
      { rootMargin: '600px' });
    beobachter.observe(fuss);
    return () => beobachter.disconnect();
  }, [reiter, sichtbareSpiele, spieleGefiltert.length]);

  /*
   * Ein neuer Filter oder Suchbegriff faengt wieder vorn an - noch waehrend
   * gezeichnet wird, nicht erst danach.
   *
   * Als das ein Effekt war, lief die Reihenfolge falsch herum: erst wurde
   * mit der alten, moeglicherweise zwanzigtausend Eintraege langen Anzahl
   * gezeichnet, und erst hinterher auf dreissig zurueckgesetzt. Der teure
   * Durchlauf fand also jedes Mal statt - gemessen zwei bis vier Sekunden
   * je Tastendruck, solange die Liste vollstaendig geladen war.
   *
   * Ein Zustandswechsel waehrend des Zeichnens ist genau fuer diesen Fall
   * vorgesehen: React verwirft den angefangenen Durchlauf und beginnt ihn
   * sofort mit dem neuen Wert neu, ohne den teuren dazwischen auszugeben.
   */
  const [suchStand, setSuchStand] = useState('');
  const suchMarke = `${spielFilter}|${spielSucheTraege}`;
  if (suchStand !== suchMarke) {
    setSuchStand(suchMarke);
    setSichtbareSpiele(ERSTE_SPIELE);
  }

  /*
   * Die Uhr laeuft nur, solange sie gebraucht wird.
   *
   * Ein Sekundentakt ueber der ganzen Seite waere Unfug; er laeuft deshalb
   * nur, wenn der Matches-Bereich offen ist und wirklich eine Lobby laeuft.
   */
  useEffect(() => {
    if (reiter !== 'runden' || !laufende) return;
    const uhr = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(uhr);
  }, [reiter, laufende]);

  /*
   * Und alle sechzig Sekunden die Zahlen selbst nachholen.
   *
   * Die Dauer laeuft von allein weiter, aber wie viele Teams noch im Spiel
   * sind, weiss nur Epic. Die Schnittstelle merkt sich ihre Antwort ohnehin
   * eine Minute - oefter zu fragen brächte nichts.
   */
  useEffect(() => {
    if (reiter !== 'runden' || !laufende || !fenster) return;
    const uhr = setInterval(() => { setSpiele(null); setSpieleBasis(0); }, 60_000);
    return () => clearInterval(uhr);
  }, [reiter, laufende, fenster]);

  /*
   * Ist das ein einzelner Spielraum oder ein ganzer Qualifikationstag?
   *
   * In einem Finale spielen alle in derselben Lobby: sechs Spiele heissen
   * sechs Sitzungen, und "Runde 3" meint fuer jeden dasselbe Spiel. An einem
   * Qualifikationstag laufen dagegen hunderte Lobbys nebeneinander - dort
   * sind es hundertachtundvierzig Sitzungen, obwohl jedes Team elf Spiele
   * hat. Dann ist eine Kachel eine Lobby und keine gemeinsame Runde, und sie
   * darf auch nicht so heissen.
   *
   * Erkennbar ist das an der Zahl: mehr Sitzungen als Spiele je Team heisst
   * mehrere Lobbys.
   */
  const eineLobby = useMemo(
    () => !!spiele && gespielteRunden > 0 && spiele.length <= gespielteRunden + 1,
    [spiele, gespielteRunden]);

  useEffect(() => {
    if (reiter !== 'spieler' || !fenster || spielerWerte) return;
    let weg = false;
    setSpielerLaedt(true);
    fetch(`/api/cup-spieler?window=${encodeURIComponent(fenster.windowId)}`)
      .then((r) => r.json())
      .then((j) => { if (!weg) setSpielerWerte(j?.error ? null : j); })
      .catch(() => { if (!weg) setSpielerWerte(null); })
      .finally(() => { if (!weg) setSpielerLaedt(false); });
    return () => { weg = true; };
  }, [reiter, fenster, spielerWerte]);

  /*
   * Zu jedem Team dieses Spieltags der gepflegte Twitch-Kanal.
   *
   * Wer keinen hinterlegt hat, kommt hier nicht vor - und taucht deshalb
   * auch in der Streamliste nicht auf. Das ist gewollt: lieber eine kurze,
   * richtige Liste als eine lange mit falschen Kanaelen.
   */
  const mitTwitch = useMemo(() => {
    const raus: Array<{
      kanal: string; name: string; rang: number; punkte: number;
    }> = [];
    // Wie oben: nur unter "Streams" gebraucht.
    if (reiter !== 'streams') return raus;
    /*
     * Doppelte ueber eine Menge aussortieren, nicht ueber die Liste selbst.
     *
     * Vorher stand hier ein raus.some(...) je Spieler - also ein Durchlauf
     * durch alles schon Gefundene, zwanzigtausendmal. Das waechst im
     * Quadrat und war bei einem vollen Feld die teuerste Stelle der ganzen
     * Seite. Eine Menge beantwortet dieselbe Frage in einem Schritt.
     */
    const gesehen = new Set<string>();
    for (const e of tabelleTraege) {
      for (const sp of e.players) {
        const kanal = profilVon(sp)?.twitch?.trim();
        if (!kanal) continue;
        const schluessel = kanal.toLowerCase();
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        raus.push({ kanal, name: namenVon(sp), rang: e.rank, punkte: e.points });
      }
    }
    return raus;
  }, [reiter, tabelleTraege, profilVon, namenVon]);

  useEffect(() => {
    if (reiter !== 'streams' || !mitTwitch.length || live) return;
    let weg = false;
    setLiveLaedt(true);
    fetch('/api/live-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: mitTwitch.map((x) => x.kanal) }),
    })
      .then((r) => r.json())
      .then((j) => { if (!weg) setLive(j ?? {}); })
      .catch(() => { if (!weg) setLive({}); })
      .finally(() => { if (!weg) setLiveLaedt(false); });
    return () => { weg = true; };
  }, [reiter, mitTwitch, live]);

  useEffect(() => {
    if (reiter !== 'streams' || ordner) return;
    let weg = false;
    fetch('/api/dashboard').then((r) => r.json())
      .then((j) => { if (!weg) setOrdner(j?.folders ?? []); })
      .catch(() => { if (!weg) setOrdner([]); });
    return () => { weg = true; };
  }, [reiter, ordner]);

  /**
   * Einen Kanal in einen Ordner legen.
   *
   * Die Schnittstelle nimmt immer die ganze Liste entgegen, also wird sie
   * hier vollstaendig zurueckgeschrieben - mit genau einer Aenderung. Ein
   * Kanal, der schon drin ist, wird nicht doppelt eingetragen.
   */
  const inOrdner = useCallback(async (kanal: string, ziel: string, name?: string) => {
    const liste = ordner ?? [];
    const eintrag = { twitch: kanal.toLowerCase(), twitter: kanal.toLowerCase() };

    const neu = ziel === 'neu'
      ? [...liste, {
        id: `ordner-${Date.now().toString(36)}`,
        name: (name ?? '').trim() || 'Neuer Ordner',
        streamers: [eintrag],
      }]
      : liste.map((o) => (o.id === ziel && !o.streamers.some((x) =>
        x.twitch.toLowerCase() === eintrag.twitch)
        ? { ...o, streamers: [...o.streamers, eintrag] } : o));

    setOrdnerStand(t('speichert …'));
    try {
      const r = await fetch('/api/dashboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders: neu }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setOrdner(j?.data?.folders ?? neu);
      const wohin = ziel === 'neu'
        ? ((name ?? '').trim() || 'Neuer Ordner')
        : (liste.find((o) => o.id === ziel)?.name ?? '');
      setOrdnerStand(`${kanal} → ${wohin}`);
      setOrdnerFuer(null); setNeuerOrdner('');
    } catch {
      setOrdnerStand(t('Konnte nicht gespeichert werden.'));
    }
  }, [ordner, t]);

  /** Die Match-Id in die Zwischenablage - mit sichtbarer Rueckmeldung. */
  const idKopieren = useCallback((id: string) => {
    void navigator.clipboard.writeText(id)
      .then(() => { setKopiert(id); setTimeout(() => setKopiert(null), 1500); })
      .catch(() => setKopiert(null));
  }, []);

  // ---- Leaderboard ---------------------------------------------------
  const laden = useCallback(async (f: Fenster) => {
    setLaedt(true); setOffen(null);
    /*
     * Von Hand nachgetragene Turniere haben keine Bestenliste.
     *
     * Der FNCS Global Championship wird auf einer LAN gespielt; Epic legt
     * dafuer kein Leaderboard-Fenster an. Ohne diese Abkuerzung fragt die
     * Seite trotzdem und schreibt Epics rohe 404-Meldung samt Adresse in
     * die Anzeige - fuer Besucher unverstaendlich und haesslich dazu.
     */
    if (f.eventId.startsWith('manuell_')) {
      setTabelle([]);
      setStand(t('Keine Bestenliste — dieses Turnier wird auf einer LAN gespielt.'));
      setLaedt(false);
      return;
    }
    /*
     * Erst der Anfang, dann Stufe um Stufe tiefer.
     *
     * Vorher holte diese Seite beim Oeffnen alle zehntausend Plaetze auf
     * einmal. Das sind bei Epic hundert Seiten und zwanzigtausend
     * aufzuloesende Namen; die Anfrage lief in Vercels Zeitgrenze und kam
     * gar nicht an. Angezeigt blieben die ersten fuenfhundert - und weil im
     * Geladenen gesucht wird, war jeder Spieler dahinter unauffindbar.
     *
     * Jetzt wird gestaffelt geladen: fuenfhundert stehen nach wenigen
     * Sekunden da, danach werden es zweitausend, fuenftausend, zehntausend.
     * Jede Stufe ersetzt die Tabelle, sobald sie da ist. Bricht eine ab,
     * bleibt die vorige stehen.
     */
    const holeStueck = async (von: number, seiten: number) => {
      const r = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}`
        + `&window=${encodeURIComponent(f.windowId)}&von=${von}&seiten=${seiten}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'nicht ladbar');
      return d as { entries?: Eintrag[]; updated?: string; totalPages?: number };
    };

    /*
     * Wer gerade laedt, darf schreiben - und nur der.
     *
     * Die Bestenliste wird waehrend eines laufenden Cups im Minutentakt
     * nachgefasst, und ein Spieltagwechsel startet sie ohnehin neu. Ohne
     * diese Marke koennte eine langsame tiefe Stufe eines alten Aufrufs
     * die frische Tabelle eines neuen ueberschreiben - sichtbar als
     * Bestenliste des falschen Tages.
     */
    laufNr.current += 1;
    const meiner = laufNr.current;
    const nochMeins = () => laufNr.current === meiner;

    try {
      const erste = await holeStueck(0, ERSTE_SEITEN);
      if (!nochMeins()) return;
      const anfang = erste.entries ?? [];
      setTabelle(anfang);
      // Ohne die Zahl - die steht daneben, mit dem passenden Wort. Zweimal
      // dieselbe Groesse, einmal gerundet und einmal genau, war die
      // haeufigste Nachfrage zu dieser Seite.
      setStand(anfang.length
        ? `${t('Stand')} ${new Date(erste.updated ?? Date.now()).toLocaleTimeString(ort)}`
        : t('Noch keine Ergebnisse'));
      setLaedt(false);

      /*
       * Der Rest des Feldes, ohne dass jemand darauf wartet.
       *
       * Gezaehlt wird in Seiten, nicht in Plaetzen: wie viele Eintraege auf
       * eine Seite gehen, entscheidet Epic, und bei einem kleinen Finale ist
       * die erste Seite schon die letzte. Schluss ist, wenn Epic keine
       * weitere Seite mehr nennt oder die zehntausend voll sind - mehr gibt
       * es dort nicht.
       */
      const seitenGesamt = erste.totalPages ?? 0;
      if (anfang.length && seitenGesamt > ERSTE_SEITEN) {
        void (async () => {
          setVertieft(true);
          let alle = anfang;
          let von = ERSTE_SEITEN;
          let ende = seitenGesamt;

          while (von < ende && alle.length < MAX_PLAETZE && nochMeins()) {
            let stueck;
            try {
              stueck = await holeStueck(von, STUECK_SEITEN);
            } catch {
              break; // dann bleibt stehen, was bis hierher angekommen ist
            }
            if (!nochMeins()) return;
            const neu = stueck.entries ?? [];
            if (!neu.length) break;
            alle = alle.concat(neu);
            setTabelle(alle);
            if (stueck.totalPages) ende = stueck.totalPages;
            von += STUECK_SEITEN;
          }
          if (nochMeins()) setVertieft(false);
        })();
      }
    } catch (e) {
      if (!nochMeins()) return;
      setStand(t('Fehler') + ': ' + (e as Error).message);
      setTabelle([]);
      setLaedt(false);
    }
  }, []);

  /*
   * Waehrend eines laufenden Fensters die Bestenliste nachfassen.
   *
   * Eine Minute ist der richtige Takt: eine Runde dauert etwa zwoelf, und
   * Epic schreibt seine Bestenliste kurz nach jeder Runde fort. Haeufiger
   * waere Last ohne Gewinn, seltener saehe man das Ende einer Runde erst
   * mit Verspaetung.
   */
  useEffect(() => {
    if (!laeuftGerade || !fenster) return undefined;
    const uhr = setInterval(() => { void laden(fenster); }, 60_000);
    return () => clearInterval(uhr);
  }, [laeuftGerade, fenster, laden]);

  useEffect(() => { if (fenster) laden(fenster); }, [fenster, laden]);

  useEffect(() => {
    if (!fenster || fenster.status !== 'live') return;
    // Ein kleines Feld ist in einem Wimpernschlag geholt, zehntausend
    // Plaetze brauchen hundert Abfragen bei Epic. Deshalb wird ein grosses
    // Leaderboard seltener aufgefrischt, statt die Quelle im Minutentakt
    // mit hundert Anfragen zu belegen.
    const takt = tabelle.length > 1000 ? 180_000 : 45_000;
    const t = setInterval(() => laden(fenster), takt);
    return () => clearInterval(t);
  }, [fenster, laden, tabelle.length]);

  /*
   * Getippt wird sofort, gefiltert eine Spur spaeter.
   *
   * Bei zehntausend Zeilen kostet jeder Tastendruck einen vollstaendigen
   * Durchlauf durch das ganze Feld. React arbeitet den zuerst ab und zeichnet
   * das Eingabefeld erst danach neu - der Betreiber sah seinen eigenen Text
   * dadurch erst nach rund zehn Sekunden.
   *
   * useDeferredValue dreht die Reihenfolge um: das Eingabefeld haengt am
   * sofortigen Wert und steht ohne Verzoegerung da, die Tabelle am
   * nachlaufenden. Solange beide auseinanderliegen, wird gerade gefiltert -
   * daran haengt der Kringel neben dem Feld.
   */
  const sucheTraege = useDeferredValue(suche);
  const suchtGerade = suche !== sucheTraege;

  const gefiltert = useMemo(() => {
    const q = sucheTraege.trim().toLowerCase();
    if (!q) return tabelle;
    /*
     * Gesucht wird in beiden Namen.
     *
     * Wer "vico" tippt, meint den Spieler - ob Epic ihn gerade als
     * "VicO" oder als "[EWC2026] FaZe VicO" fuehrt, ist ihm gleich. Und
     * wer den vollen Turniernamen kennt, soll ihn auch eingeben duerfen.
     */
    return tabelle.filter((e) => e.players.some((p) =>
      p.name.toLowerCase().includes(q)
      || namenVon(p).toLowerCase().includes(q)));
  }, [tabelle, sucheTraege, namenVon]);

  /**
   * Seitenweise blaettern statt endlos nachladen.
   *
   * Gesucht wird trotzdem im ganzen Feld und nicht nur auf der offenen
   * Seite - sonst faende man einen Spieler auf Platz 4000 nie.
   */
  const [proSeite, setProSeite] = useState<number>(ZEILEN_PRO_SEITE[0]);
  const [seite, setSeite] = useState(1);
  // Zurueckgesetzt wird dort, wo Suche oder Spieltag wechseln - ein Effekt
  // dafuer wuerde nur ein zweites Zeichnen hinterherschicken.

  const seitenZahl = Math.max(1, Math.ceil(gefiltert.length / proSeite));
  /**
   * Die tatsaechlich gezeigte Seite.
   *
   * Abgeleitet statt im Zustand gehalten: filtert eine Suche das Feld auf
   * zwei Treffer, waehrend Seite 12 offen ist, stuende sonst eine leere
   * Tabelle da, bis ein Effekt hinterherkorrigiert.
   */
  const seiteJetzt = Math.min(Math.max(1, seite), seitenZahl);
  const zeilen = useMemo(
    () => gefiltert.slice((seiteJetzt - 1) * proSeite, seiteJetzt * proSeite),
    [gefiltert, seiteJetzt, proSeite]);

  /**
   * Das Finale, in das sich aus diesem Fenster qualifiziert wird.
   *
   * Gesucht wird in derselben Region und derselben Runde ein Fenster mit
   * Finalkennzeichen. Findet sich keins, bleibt der Verweis weg - dann
   * steht nur die Zahl da.
   */
  const zielFinale = useMemo(() => {
    if (!fenster?.qualifiziert) return null;
    return tage.find((f) => f.istFinale
      && f.region === fenster.region
      && f.runde === fenster.runde
      && f.windowId !== fenster.windowId) ?? null;
  }, [tage, fenster]);

  /**
   * Welche Seitenzahlen stehen unter der Tabelle?
   *
   * Bei zweihundert Seiten kann nicht jede dastehen. Gezeigt werden Anfang,
   * Ende und die Umgebung der offenen Seite; dazwischen steht ein Zeichen
   * fuer die Luecke.
   */
  const seitenLeiste = useMemo(() => {
    const raus: Array<number | 'luecke'> = [];
    const nah = (n: number) => Math.abs(n - seiteJetzt) <= 1;
    for (let i = 1; i <= seitenZahl; i++) {
      if (i === 1 || i === seitenZahl || nah(i)) raus.push(i);
      else if (raus[raus.length - 1] !== 'luecke') raus.push('luecke');
    }
    return raus;
  }, [seitenZahl, seiteJetzt]);

  /** Ein Cup, in dem jeder allein antritt - dann zaehlt man Spieler, nicht Teams. */
  /*
   * Ist das ein Solo-Cup?
   *
   * Am sichersten an der Bestenliste: steht dort ueberall genau ein Spieler,
   * ist es einer. Solange sie noch nicht geladen ist - und beim ersten
   * Aufruf ist sie das nie -, half das aber nicht: dann stand bei einem
   * Solo-Cup weiterhin "Team-Stats" da, mitsamt einem zweiten, leeren
   * Reiter. Deshalb zusaetzlich der Name des Cups; "Solo Victory Cup" sagt
   * es ja bereits.
   */
  const soloCup = useMemo(() => {
    if (tabelle.length > 0) return tabelle.every((e) => e.players.length === 1);
    const woran = `${cup?.titel ?? ''} ${cup?.untertitel ?? ''} ${id}`.toLowerCase();
    return /solo/.test(woran);
  }, [tabelle, cup, id]);

  /*
   * Bei einem Solo-Cup gibt es den Reiter "Spieler-Stats" aus den Replays
   * nicht - dort sind die Kacheln bereits Spielerwerte. Wer von einem
   * Duo-Cup kommt und dort auf diesem Reiter stand, landete sonst auf einer
   * leeren Seite ohne Knopf zurueck.
   */
  useEffect(() => {
    if (soloCup && reiter === 'spieler') setReiter('teams');
  }, [soloCup, reiter]);

  if (fehler) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-10 text-slate-200">
        <div className="mx-auto max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-sm text-slate-400">{fehler}</p>
          <Link href="/events"
            className="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm
                       font-semibold text-white hover:bg-sky-400">
            <T>Zurück zur Übersicht</T>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 text-slate-200">
      {/* Kopf mit Turnierbild */}
      <div className="relative border-b border-zinc-800">
        {cup?.bild && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={cup.bild} alt="" className="h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-950/40" />
          </div>
        )}
        <div className="relative mx-auto max-w-[1400px] px-4 py-6">
          <Link href="/events"
            className="text-xs text-slate-400 transition hover:text-sky-400">
            <T>← Alle Events</T>
          </Link>

          <h1 className="mt-2 text-2xl font-bold text-slate-50">
            {cup?.titel ?? id}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            {cup?.untertitel && <span>{cup.untertitel}</span>}
            {cup?.live && (
              <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold
                               uppercase tracking-wider text-white"><T>Live</T></span>
            )}
            {fenster?.istFinale && (
              <span className="rounded bg-amber-950/70 px-2 py-0.5 text-[10px] font-semibold
                               uppercase tracking-wider text-amber-300"><T>Finale</T></span>
            )}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-5">

        {/* Region - entfaellt bei Events mit gemeinsamem Leaderboard */}
        {cup && Object.keys(cup.regionen).length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.keys(cup.regionen).map((r) => (
              // Jede Region in ihrer Farbe - dieselbe wie in der Statistik.
              <button key={r} onClick={() => setRegion(r)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  region === r ? regionFarbe(r).marke
                    : `bg-zinc-900/60 hover:brightness-125 ${regionFarbe(r).ruhig}`}`}>
                {REGION_TEXT[r] ?? r}
              </button>
            ))}
          </div>
        )}
        {cup?.global && (
          <p className="mb-4 text-xs text-slate-500">
            <T>Gemeinsames Leaderboard über alle Regionen — dieses Turnier wird nicht regional getrennt gewertet.</T>
          </p>
        )}

        {/* Spieltage
            Eine Reihe grosser Kacheln, waagerecht scrollbar. Der Versuch, das
            auf Datums-Chips und eine zweite Reihe fuer die Runden einzudampfen,
            war ein Rueckschritt: die Kachel traegt Tag, Runde, Finale, Datum,
            Uhrzeit und Spielzahl auf einen Blick, und genau das soll sie. Der
            stoerende weisse Rollbalken darunter war nie die Kachel, sondern der
            Balken selbst - der ist jetzt grau (siehe globals.css). */}
        {/*
          * Der Weg zur Karte - auf Hoehe der Spieltage, ganz rechts.
          *
          * Ausdruecklich hier und nicht oben beim Turniernamen: "auf dieser
          * Linie, wo auch der Tag steht, aber ganz rechts". Er gehoert zum
          * gewaehlten Spieltag, und genau der steht in dieser Reihe.
          *
          * Klein und rund, mit "Karte bauen" im Mouseover. Der Kartenbau
          * stellt sich ueber event und window selbst ein - anders als frueher
          * muss das Turnier nicht mehr aus einer Liste herausgesucht werden.
          */}
        {tage.length > 0 && (
          <div className="mb-5 flex items-stretch gap-2">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
            {tage.map((f, i) => {
              const aktiv = fenster?.windowId === f.windowId;
              return (
                <button key={f.windowId}
                  onClick={() => { setFenster(f); setSeite(1); }}
                  className={`min-w-[132px] shrink-0 rounded-xl border px-3 py-2.5 text-left
                              transition ${aktiv
                                ? 'border-sky-500 bg-sky-950/40'
                                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100">
                      {fensterNamen[i]?.haupt ?? `${t('Tag')} ${i + 1}`}
                    </span>
                    {f.status === 'live' &&
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                    {!!karten[f.windowId]?.length && (
                      <span title={`${t('Karten zu diesem Spieltag')}: ${karten[f.windowId].length}`}
                        className="text-[10px] text-sky-400">◆</span>
                    )}
                  </div>
                  {!!fensterNamen[i]?.neben && (
                    <div className="mt-0.5 text-[11px] font-medium text-sky-400/80">
                      {fensterNamen[i].neben}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {tag(f.begin, ort)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {uhr(f.begin, ort)}
                    {f.matchCap ? ` · ${f.matchCap} ${t('Spiele')}` : ''}
                  </div>
                </button>
              );
            })}
            </div>

            {istAdmin && fenster?.eventId && fenster?.windowId && (
              <Link
                href={`/karten?event=${encodeURIComponent(fenster.eventId)}`
                  + `&window=${encodeURIComponent(fenster.windowId)}`}
                prefetch={false}
                title={t('Karte bauen')}
                aria-label={t('Karte bauen')}
                className="grid h-9 w-9 shrink-0 self-center place-items-center
                           rounded-full border border-zinc-700 bg-zinc-950/80
                           text-slate-400 transition hover:border-sky-500
                           hover:text-sky-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            )}
          </div>
        )}

        {/* Karte zum Spieltag - erscheint nur, wenn eine hinterlegt ist */}
        {kartenZumZeigen.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {kartenZumZeigen.map((k) => (
              <KartenKnopf key={k.id} karte={k}
                aufVerstecken={!istAdmin ? undefined
                  // Eine gespeicherte Karte wird ausgeblendet, ein blosses
                  // Angebot ganz weggenommen - es gibt ja noch nichts.
                  : k.href ? () => kartenAngebot(fenster?.windowId ?? '', true)
                    : verstecke} />
            ))}
          </div>
        )}

        {/* Eventinfos */}
        {fenster && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              [t('Beginn'), `${tag(fenster.begin, ort)}, ${uhr(fenster.begin, ort)}`],
              [t('Ende'), typeof fenster.end === 'number'
                ? `${tag(fenster.end, ort)}, ${uhr(fenster.end, ort)}` : '—'],
              [t('Spiele'), fenster.matchCap
                ? String(fenster.matchCap) : t('unbegrenzt')],
              // Die genaue Zahl, nicht die gerundete: dieselbe Groesse steht
              // im Kopf des Leaderboards, und dort stand 1476, waehrend hier
              // "1.000" behauptet wurde.
              /*
               * Wie viele weiterkommen, nicht wie viele mitspielen.
               *
               * Der Betreiber: "unter Teams kannst Du einfach immer
               * anzeigen, wenn's 'n Open Cup ist, wie viele Teams sich
               * qualifizieren für diesen Cup." Die Zahl steht in Epics
               * Auszahlungstabelle und ist je Cup verschieden - Top 50 bei
               * Division 1, Top 100 bei Division 3, Top 20 beim Cash Cup.
               *
               * Wo es nichts zu qualifizieren gibt - in einem Finale -,
               * steht weiterhin die Teilnehmerzahl. Eine erfundene Schwelle
               * waere schlimmer als gar keine.
               */
              /*
               * Epics Zahl geht vor; sonst die aus dem Finalfeld gezaehlte.
               *
               * Beides ist belegbar, keines geschaetzt - die eine steht in
               * der Auszahlungstabelle, die andere ist schlicht die Groesse
               * des Feldes in der naechsten Runde. Nur wo auch das fehlt,
               * bleibt es bei der Teilnehmerzahl.
               */
              (fenster.qualifiziert || qual?.schwelle)
                ? [t('Qualifizieren sich'),
                  `${t('Top')} ${(fenster.qualifiziert
                    ?? qual?.schwelle ?? 0).toLocaleString(ort)}`
                  /*
                   * Ist der Spieltag vorbei, steht hier die Zahl, die es
                   * wirklich gekostet hat - ohne "etwa". Ein Durchschnitt
                   * frueherer Ausgaben waere dann die schlechtere Auskunft,
                   * weil das Ergebnis ja vorliegt.
                   */
                  + (typeof qual?.tatsaechlich === 'number'
                    ? ` · ${qual.tatsaechlich.toLocaleString(ort)} ${t('Punkte')}`
                    : qual?.schnitt
                      ? ` · ${t('etwa')} ${qual.schnitt.toLocaleString(ort)} ${t('Punkte')}`
                      : '')]
                : [soloCup ? t('Spieler') : t('Teams'),
                  tabelle.length ? tabelle.length.toLocaleString(ort) : '–'],
            ] as Array<[string, string]>).map(([l, v]) => (
              <div key={l} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-100">{v}</div>
              </div>
            ))}
          </div>
        )}

        {istAdmin && fenster && ohneKarte.includes(fenster.windowId) && (
          <button onClick={() => kartenAngebot(fenster.windowId, false)}
            className="mb-5 rounded-lg border border-dashed border-zinc-700 px-3 py-1.5
                       text-[11px] text-slate-500 transition hover:border-sky-600
                       hover:text-sky-400">
            <T>Für diesen Spieltag wieder eine Karte anbieten</T>
          </button>
        )}

        {/* Was es zu gewinnen gibt.
            Steht nur da, wenn Epic zu diesem Spieltag wirklich eine
            Auszahlungstabelle fuehrt - bei Practice-Cups gibt es keine, und
            eine leere Ueberschrift waere ein falsches Versprechen. */}
        {preise?.vorhanden
          && (preise.geld.length > 0 || preise.gegenstaende.length > 0) && (
          <section className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            {/*
              * Zwei Reiter: was es gibt, und wie gepunktet wird.
              *
              * Bisher erschienen sie nur bei Preisgeld. Bei einem Skin-Cup
              * gibt es kein Geld, sondern Gegenstaende - dort blieben die
              * Punkte deshalb unsichtbar, obwohl es sie gibt. Der Betreiber:
              * "weil man will ja die Points auch sehen." Jetzt zaehlt jede
              * Art von Preis, nicht nur die mit Waehrung.
              *
              * Ein leerer Reiter entsteht dabei nicht: beide Seiten muessen
              * etwas zu zeigen haben.
              */}
            {(preise.wertung?.length ?? 0) > 0
              && (preise.geld.length > 0 || preise.gegenstaende.length > 0) && (
              <div className="mb-3 inline-flex gap-1 rounded-lg border border-zinc-800 p-1">
                {([['preis', 'Preispool'], ['wertung', 'Punkte']] as const)
                  .map(([wert, name]) => (
                    <button key={wert} onClick={() => setPreisReiter(wert)}
                      className={`rounded px-3 py-1 text-xs transition ${
                        preisReiter === wert
                          ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500'}`}>
                      <T>{name}</T>
                    </button>
                  ))}
              </div>
            )}

            {preisReiter === 'wertung' && (preise.wertung?.length ?? 0) > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(preise.wertung ?? []).map((w, i) => (
                  <div key={`${w.was}-${w.schwelle}-${i}`}
                    className="flex items-center justify-between rounded-lg border
                               border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <span className="text-xs text-slate-400">
                      {w.was === 'Placement' && w.regel === 'lte'
                        ? (w.schwelle === 1 ? <T>Sieg</T>
                          : <><T>Platz</T> {w.schwelle}</>)
                        : w.was === 'Elimination' ? <T>je Elimination</T> : w.was}
                    </span>
                    <span className="text-sm font-semibold text-sky-400">+{w.punkte}</span>
                  </div>
                ))}
              </div>
            ) : (
            <>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* "Preisgeld" nur, wenn es welches gibt. Ein Skin-Cup zahlt
                  nichts aus; dort stuende sonst eine Ueberschrift ueber
                  einem leeren Bereich. */}
              <h2 className="text-sm font-semibold text-slate-100">
                {preise.geld.length > 0 ? <T>Preisgeld</T> : <T>Preispool</T>}
              </h2>
              {/* Die Summe ueber alle Plaetze, nicht ueber die Zeilen der
                  Tabelle - eine Stufe wie "Platz 21-40" wird zwanzigmal
                  ausgezahlt. Und der Zusatz gehoert genau einmal daneben:
                  "je Region" und "je Person" nebeneinander widersprachen
                  sich. */}
              {preise.gesamt !== null && (
                <span className="text-sm font-bold text-emerald-400">
                  {preise.gesamt.toLocaleString(ort)} {preise.waehrung ?? 'USD'}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                    {preise.proPerson ? <T>je Person</T> : <T>je Region</T>}
                  </span>
                </span>
              )}
            </div>
            {preise.erlaeuterung && (
              <p className="mb-2 text-[11px] text-slate-500">{preise.erlaeuterung}</p>
            )}

            {preise.geld.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {preise.geld.map((g) => (
                  <div key={`${g.art}-${g.schwelle}`}
                    className="flex items-center justify-between rounded-lg border
                               border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <span className="text-xs text-slate-400">
                      {/*
                        * "Top 7" statt "Platz 6-7".
                        *
                        * Eine Stufe gilt fuer alle Plaetze bis zu ihrer
                        * Schwelle - der Sechste bekommt dasselbe wie der
                        * Siebte. Geschrieben wird trotzdem nur die Schwelle,
                        * so wie Epic sie ankuendigt und wie es jeder liest.
                        * Die Spanne steckt in der Summe oben, nicht in der
                        * Zeile.
                        */}
                      {g.art === 'rank' ? <>Top {g.schwelle}</>
                        : g.art === 'percentile'
                          ? <><T>beste</T> {(g.schwelle * 100).toFixed(0)} %</>
                          : <>{g.schwelle.toLocaleString(ort)} <T>Punkte</T></>}
                    </span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {g.betrag.toLocaleString(ort)} {preise.waehrung ?? 'USD'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {preise.gegenstaende.length > 0 && (
              <div className={preise.geld.length > 0 ? 'mt-3' : ''}>
                {/* Die Ueberschrift nur, wenn darueber schon Geld steht -
                    sonst ist sie eine zweite Ueberschrift ueber demselben. */}
                {preise.geld.length > 0 && (
                  <h3 className="mb-1.5 text-[11px] uppercase tracking-wider
                                 text-slate-500">
                    <T>Gegenstände</T>
                  </h3>
                )}
                {/*
                  * Kacheln statt einer Zeile aus Pillen.
                  *
                  * Bei einem Skin-Cup gewinnt man keinen Betrag, sondern
                  * genau diese Gegenstaende - und was man gewinnt, erkennt
                  * man am Bild, nicht am Namen. Das Bild war achtundzwanzig
                  * Pixel gross und damit ein Fleck. Der Betreiber: "dass man
                  * dieses Profilbild, also der Skin, 'n bisschen erkennt".
                  *
                  * Zwei je Reihe, das Bild links und gross, rechts daneben
                  * Stufe, Name und Art untereinander - dasselbe Raster wie
                  * die Preisgeld-Kacheln darueber, damit beides zusammen
                  * eine Flaeche bleibt.
                  */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {preise.gegenstaende.map((g) => (
                    <div key={`${g.art}-${g.schwelle}-${g.name}`}
                      className="flex items-center gap-3 rounded-lg border
                                 border-zinc-800 bg-zinc-950/60 p-2">
                      {g.bild && (
                        <img src={g.bild} alt="" width={56} height={56} loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-md bg-zinc-900/80
                                     object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-sky-400">
                          {schwellenText(g.art, g.schwelle)}
                        </div>
                        <div className="truncate text-sm font-medium text-slate-200">
                          {g.name}
                        </div>
                        {g.sorte && (
                          <div className="text-[11px] text-slate-500">{g.sorte}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </section>
        )}

        {/* Der Block "Wer durfte mitspielen?" ist bewusst entfernt.
            Epic fuehrt in den Zugangskennungen eines Fensters regelmaessig
            Marken aus fremden Turnieren und alten Saisons - bei der
            Performance Evaluation etwa Division-Kennungen aus S40. Was dort
            stand, war nachweislich falsch, und eine falsche Angabe ist
            schlechter als gar keine. */}

        {/*
          * Die Auswahlleiste.
          *
          * Ein Reiter, der nichts zu zeigen hat, bleibt trotzdem stehen und
          * sagt es beim Anklicken. Ihn zu verstecken hiesse, dass die Leiste
          * je nach Spieltag anders aussieht - und dass man sich fragt, ob es
          * die Ansicht ueberhaupt gibt.
          */}
        <div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto
                        rounded-xl border border-zinc-800 bg-zinc-900/40 px-2 py-1.5">
          {/*
            * Bei einem Solo-Cup gibt es keine Teams.
            *
            * Epics Bestenliste ist dort schon je Spieler - die Kacheln unter
            * "Team-Stats" sind also in Wahrheit Spielerwerte. Sie deshalb
            * "Team-Stats" zu nennen und daneben eine zweite, magere
            * Spielerliste zu stellen, war doppelt falsch. Der Betreiber:
            * "Bei einem Solo Victory Cup gibt es keine Team-Stats, da gibt
            * es nur Player Stats. Die Team-Stats kannst du optisch lassen,
            * wie sie sind, einfach auf Player Stats machen."
            *
            * Bei Duos bleibt beides: die Kacheln zeigen das Team, die Liste
            * aus den Replays zeigt, wer davon die Elims geholt hat.
            */}
          {(soloCup
            ? [
              ['liste', 'Leaderboard'],
              ['runden', 'Matches'],
              ['teams', 'Spieler-Stats'],
              ['streams', 'Streams'],
            ]
            : [
              ['liste', 'Leaderboard'],
              ['runden', 'Matches'],
              ['spieler', 'Spieler-Stats'],
              ['teams', 'Team-Stats'],
              ['streams', 'Streams'],
            ]).map(([id, name]) => (
            <button key={id}
              onClick={() => setReiter(id as typeof reiter)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                reiter === id
                  ? 'bg-sky-500/10 text-sky-400'
                  : 'text-slate-400 hover:text-slate-200'}`}>
              {name === 'Matches' || name === 'Streams'
                ? name : <T>{name}</T>}
            </button>
          ))}
        </div>

        {/* Leaderboard */}
        {reiter === 'liste' && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b
                             border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-100"><T>Leaderboard</T></h2>
            <div className="flex items-center gap-3">
              {/* Ohne Ladezeichen im Feld. Der Betreiber wollte es gross
                  auf der Bestenliste sehen, nicht klein an der Eingabe -
                  dort verdeckt es beim Tippen ohnehin den Cursor. */}
              <input value={suche}
                onChange={(e) => { setSuche(e.target.value); setSeite(1); }}
                placeholder={t('Spieler suchen …')}
                className="w-52 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5
                           text-xs text-slate-100 outline-none focus:border-sky-500" />
              {/* Wie viele Zeilen je Seite - mehr als hundert gibt es nicht. */}
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <T>Zeilen</T>
                <select value={proSeite}
                  onChange={(e) => { setProSeite(+e.target.value); setSeite(1); }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1
                             text-xs text-slate-200 outline-none focus:border-sky-500">
                  {ZEILEN_PRO_SEITE.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-slate-500">
                {stand}
                {tabelle.length > 0 && (
                  <> · {tabelle.length.toLocaleString(ort)}{' '}
                    {soloCup ? <T>Spieler</T> : <T>Teams</T>}</>
                )}
              </span>
            </div>
          </header>

          {/*
            * Das Ladezeichen der Bestenliste.
            *
            * Es stand klein im Suchfeld; der Betreiber wollte es gross an
            * der Liste sehen. Hier ist es auch die ehrlichere Stelle: es
            * gilt der Tabelle darunter, nicht der Eingabe. Es liegt als
            * Band ueber der Tabelle statt als Schleier darauf - die
            * Bestenliste soll waehrenddessen lesbar bleiben.
            */}
          {!laedt && (vertieft || suchtGerade) && (
            <div className="flex items-center justify-center gap-3 border-b
                            border-zinc-800/70 bg-zinc-900/40 px-4 py-2.5">
              <span className="block h-5 w-5 shrink-0 animate-spin rounded-full
                               border-2 border-zinc-700 border-t-sky-400" />
              <span className="text-xs text-slate-400">
                {suchtGerade ? <T>Wird durchsucht …</T> : (
                  <>
                    <T>lädt weitere …</T>{' '}
                    <span className="tabular-nums text-slate-500">
                      {tabelle.length.toLocaleString(ort)}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          {laedt ? (
            <div className="space-y-1 p-4">
              {[...Array(12)].map((_, i) =>
                <div key={i} className="h-9 animate-pulse rounded bg-zinc-900/60" />)}
            </div>
          ) : gefiltert.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase
                                 tracking-wider text-slate-500">
                    <th className="px-4 py-2 text-right font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Team</th>
                    <th className="px-3 py-2 text-right font-medium"><T>Punkte</T></th>
                    <th className="px-3 py-2 text-right font-medium"><T>Elims</T></th>
                    <th className="px-3 py-2 text-right font-medium"><T>Siege</T></th>
                    <th className="px-3 py-2 text-right font-medium"><T>Ø Platz</T></th>
                    <th className="px-4 py-2 text-right font-medium"><T>Spiele</T></th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((e) => (
                    <Fragment key={e.rank}>
                      <tr onClick={() => setOffen(offen === e.rank ? null : e.rank)}
                        className={`cursor-pointer border-b border-zinc-900 transition
                                    hover:bg-zinc-900/60 ${offen === e.rank ? 'bg-zinc-900/70' : ''}`}>
                        <td className={`px-4 py-2 text-right font-bold tabular-nums ${
                          e.rank <= 3 ? 'text-amber-400' : 'text-sky-400'}`}>{e.rank}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {/* Eine runde Flagge fuers Duo, diagonal geteilt.
                                Wo keine Herkunft gepflegt ist, steht der
                                Globus - eine leere Stelle sah nach Fehler aus. */}
                            <TeamFlagge groesse={26}
                              laender={e.players.map(landVon)} />
                            {/*
                              * Hier standen die Profilbilder der Spieler.
                              *
                              * Sie sind auf Wunsch des Betreibers entfallen.
                              * Sie hingen an einer Zuordnung ueber den
                              * Dateinamen und lagen deshalb regelmaessig
                              * daneben; und wo kein Foto vorlag, blieb die
                              * Zeile leer - die Liste sah dadurch von Zeile
                              * zu Zeile anders aus. Flagge und Teamlogo
                              * bleiben, die stimmen.
                              */}
                            <span className="truncate text-slate-200">
                              {e.players.map(namenVon).join('  +  ')}
                            </span>
                            {/*
                              * Hier stand einmal ein Play-Zeichen je Spieler
                              * mit hinterlegtem Twitch-Kanal.
                              *
                              * Es ist wieder weg. Der Betreiber: "Im
                              * Leaderboard muss dieses Twitch-Zeichen, dieses
                              * Play-Zeichen, nicht sein" - die Bestenliste ist
                              * eine Tabelle mit Zahlen, und wer gerade sendet,
                              * gehoert unter Streams. Dort steht es ohnehin,
                              * und zwar richtig: mit der Frage an Twitch, wer
                              * in diesem Moment live ist.
                              */}
                            {e.players.find((p) => p.logo) && (
                              <img src={e.players.find((p) => p.logo)!.logo!} alt=""
                                className="ml-1 h-4 w-auto max-w-10 object-contain opacity-80" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-100">
                          {e.points}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{e.elims}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">{e.wins}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                          {schnitt(e.avgPlace, ort)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-400">{e.games}</td>
                      </tr>

                      {/* Team-Details - klappt unter der Zeile auf */}
                      {offen === e.rank && (
                        <tr className="border-b border-zinc-900 bg-zinc-950">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                              <div
                                onDoubleClick={istAdmin ? () => flaggenOeffnen(e) : undefined}
                                title={istAdmin
                                  ? 'Doppelklick: Flaggen und Twitch-Kanal dieses Duos'
                                  : undefined}
                                className={istAdmin ? 'cursor-pointer' : undefined}>
                                {istAdmin && (
                                  <p className="mb-1.5 text-[10px] uppercase tracking-wider
                                                text-slate-600">
                                    <T>Doppelklick: Flaggen und Twitch</T>
                                  </p>
                                )}
                                {e.players.map((p) => (
                                  <div key={p.id} className="mb-2 flex items-center gap-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={flaggenPfad(landVon(p))} alt=""
                                      title={landVon(p) ?? 'Herkunft nicht hinterlegt'}
                                      className="h-5 w-5 shrink-0 rounded-full object-cover
                                                 ring-1 ring-white/20" />
                                    {p.img && <img src={p.img} alt=""
                                      className="h-9 w-9 rounded-lg object-cover object-top" />}
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-slate-100">
                                        {p.name}
                                      </div>
                                      {p.logo && <img src={p.logo} alt=""
                                        className="mt-0.5 h-3.5 w-auto max-w-16 object-contain opacity-70" />}
                                    </div>
                                  </div>
                                ))}
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {([
                                    // Auch hier die Nachkommastelle behalten -
                                    // dieselbe Ueberlegung wie in der Spalte
                                    // "Ø Platz".
                                    ['Ø Punkte', schnitt(e.avgPoints, ort)],
                                    ['Ø Elims', schnitt(e.avgElims, ort)],
                                    ['K/D', schnitt(e.kd, ort)],
                                    ['Bester Platz', e.bestPlace ?? '–'],
                                  ] as Array<[string, string | number]>).map(([l, v]) => (
                                    <div key={l} className="rounded-lg bg-zinc-900/70 px-2.5 py-1.5">
                                      <div className="text-[9px] uppercase tracking-wider text-slate-500"><T>{l}</T></div>
                                      <div className="text-sm font-semibold text-slate-100">{v}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                                  <T>Spielverlauf</T>
                                </div>
                                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                                  {[...e.matches].reverse().map((m, i) => (
                                    <div key={i}
                                      className={`flex items-center justify-between rounded-lg px-2.5
                                                  py-1.5 text-xs ${m.placement === 1
                                                    ? 'bg-amber-950/40 text-amber-200'
                                                    : 'bg-zinc-900/70 text-slate-300'}`}>
                                      <span className="font-semibold">
                                        {m.placement ? `Platz ${m.placement}` : '–'}
                                      </span>
                                      <span className="text-slate-500">
                                        {m.elims ?? 0} Elims · {dauer(m.timeAlive ?? 0)}
                                      </span>
                                    </div>
                                  ))}
                                  {!e.matches.length && (
                                    <p className="text-xs text-slate-600"><T>Keine Matchdaten.</T></p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/*
                        * Die Qualifikationslinie - genau einmal, unter dem
                        * letzten Platz, der es schafft.
                        */}
                      {fenster?.qualifiziert === e.rank && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <div className="flex items-center gap-3 border-y
                                            border-amber-500/40 bg-amber-500/10
                                            px-4 py-1">
                              <span aria-hidden className="h-px flex-1
                                                           bg-amber-500/30" />
                              <span className="shrink-0 text-[10px] font-semibold
                                               uppercase tracking-[0.14em]
                                               text-amber-400">
                                <T>Top</T> {e.rank}{' '}
                                {zielFinale ? (
                                  <button type="button"
                                    onClick={() => { setFenster(zielFinale); setSeite(1); }}
                                    className="underline decoration-dotted
                                               underline-offset-2 transition
                                               hover:text-amber-300">
                                    <T>qualifizieren sich für das Finale</T>
                                  </button>
                                ) : <T>qualifizieren sich</T>}
                              </span>
                              <span aria-hidden className="h-px flex-1
                                                           bg-amber-500/30" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {seitenZahl > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3
                                border-t border-zinc-900 px-3 py-3">
                  <span className="text-xs text-slate-500">
                    <T>Platz</T> {((seiteJetzt - 1) * proSeite + 1).toLocaleString(ort)}
                    {' '}<T>bis</T>{' '}
                    {Math.min(seiteJetzt * proSeite, gefiltert.length).toLocaleString(ort)}
                    {' '}<T>von</T> {gefiltert.length.toLocaleString(ort)}
                  </span>

                  <div className="flex flex-wrap items-center gap-1">
                    <button onClick={() => setSeite(seiteJetzt - 1)}
                      disabled={seiteJetzt <= 1}
                      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs
                                 text-slate-300 transition hover:border-sky-500
                                 disabled:cursor-not-allowed disabled:opacity-30">
                      ‹
                    </button>
                    {seitenLeiste.map((n, i) => (n === 'luecke' ? (
                      <span key={`l${i}`} className="px-1 text-xs text-slate-600">…</span>
                    ) : (
                      <button key={n} onClick={() => setSeite(n)}
                        className={`min-w-8 rounded-lg border px-2.5 py-1 text-xs
                                    tabular-nums transition ${n === seiteJetzt
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                        {n}
                      </button>
                    )))}
                    <button onClick={() => setSeite(seiteJetzt + 1)}
                      disabled={seiteJetzt >= seitenZahl}
                      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs
                                 text-slate-300 transition hover:border-sky-500
                                 disabled:cursor-not-allowed disabled:opacity-30">
                      ›
                    </button>
                  </div>

                  {/* Bei vielen Seiten waere Klicken bis Seite 80 muehsam. */}
                  {seitenZahl > 5 && (
                    <form className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const wert = new FormData(e.currentTarget).get('zuSeite');
                        const n = parseInt(String(wert ?? ''), 10);
                        if (Number.isFinite(n)) setSeite(Math.min(Math.max(1, n), seitenZahl));
                      }}>
                      <span className="text-xs text-slate-500"><T>Zu Seite</T></span>
                      <input name="zuSeite" inputMode="numeric"
                        placeholder={String(seiteJetzt)}
                        className="w-14 rounded-lg border border-zinc-800 bg-zinc-900/80
                                   px-2 py-1 text-center text-xs text-slate-100 outline-none
                                   placeholder:text-slate-600 focus:border-sky-500" />
                      <button type="submit"
                        className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs
                                   text-slate-300 transition hover:border-sky-500">
                        <T>Los</T>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">
              {/*
                * Kein Treffer heisst nicht immer "nicht dabei".
                *
                * Gesucht wird in dem, was geladen ist. Solange noch tiefer
                * geladen wird, ist die richtige Auskunft "noch nicht
                * gefunden" - und nicht "gibt es nicht".
                */}
              {sucheTraege
                ? `${t('Kein Treffer für')} „${sucheTraege}“${vertieft
                    ? ' — ' + t('die Liste wird noch tiefer geladen …') : '.'}`
                : stand || t('Keine Daten.')}
            </p>
          )}
        </section>
        )}

        {/*
          * Die einzelnen Runden.
          *
          * Die Bestenliste beantwortet "wie stand das Team am Ende des
          * Tages". Diese Liste beantwortet die andere Frage: "wer wurde in
          * diesem einen Spiel welcher". Beides nebeneinander ist genau der
          * Blick, den man beim Auswerten braucht.
          */}
        {reiter === 'runden' && (!fenster || fenster.status === 'kommt') && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                        text-center text-sm text-slate-500">
            <T>Dieser Spieltag hat noch nicht stattgefunden.</T>
          </p>
        )}

        {reiter === 'runden' && fenster && fenster.status !== 'kommt' && (() => {
          /*
           * Der Matches-Bereich.
           *
           * Vorbild ist die Ansicht, die der Betreiber kennt: eine laufende
           * Lobby nennt oben die Uhrzeit ihres Beginns samt Datum, darunter
           * wie lange sie schon laeuft, und daneben, wie viele Teams noch im
           * Spiel sind. Ein Klick oeffnet die Aufstellung - alle, die bisher
           * ausgeschieden sind, mit Platz, Punkten, Eliminierungen und
           * Spielzeit.
           *
           * Alle drei Groessen stehen so nicht in Epics Antwort; sie werden
           * in /api/cup-matches aus Epics eigenen Zahlen hergeleitet, und
           * die Herleitung steht dort beschrieben.
           */
          const gefiltert = spieleGefiltert;
          const gezeigt = gefiltert.slice(0, sichtbareSpiele);

          /*
           * Die Aufstellung einer Runde.
           *
           * Sie stand frueher unter dem ganzen Raster: wer auf die dritte
           * Kachel klickte, musste an neunundfuenfzig weiteren vorbeiscrollen,
           * um sie zu sehen. Der Betreiber: "dass ich sozusagen immer nach
           * unten scrollen muss, um das Leaderboard zu sehen von der Runde."
           *
           * Jetzt wird sie im Raster selbst ausgegeben, unmittelbar hinter der
           * geoeffneten Kachel und ueber die volle Breite. Wie viele Spalten
           * das Raster gerade hat, muss dafuer niemand wissen: eine Zelle, die
           * alle Spalten ueberspannt, rutscht von selbst in die naechste Reihe.
           */
          const aufstellung = (sp: Spiel) => {
            const mitPunkten = sp.teams.some((t) => typeof t.punkte === 'number');
            const mitSchaden = sp.teams.some((t) => t.damage > 0);
            return (
                    <div className="mt-3 rounded-lg border border-zinc-800
                                    bg-zinc-950/80">
                      <div className="flex flex-wrap items-center justify-between gap-3
                                      border-b border-zinc-800 px-3 py-2">
                        <span className="flex flex-wrap items-baseline gap-2">
                          {sp.live && (
                            <span className="flex items-center gap-1.5 text-xs
                                             font-semibold uppercase text-rose-400">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full
                                                 animate-ping rounded-full bg-rose-500
                                                 opacity-75" />
                                <span className="relative inline-flex h-2 w-2
                                                 rounded-full bg-rose-500" />
                              </span>
                              Live {dauerText(dauerVon(sp))}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-200">
                            {eineLobby ? <><T>Runde</T> {sp.nummer}</>
                              : sp.live ? <T>Match läuft</T> : <T>Match beendet</T>}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {sp.beginn
                              ? new Date(sp.beginn).toLocaleString(ort)
                              : sp.ende ? new Date(sp.ende).toLocaleString(ort) : ''}
                          </span>
                          {sp.live && (
                            <span className="text-[11px] text-amber-400">
                              {sp.verbleibend ?? 0} / {sp.lobby ?? '—'}{' '}
                              <T>Teams noch im Spiel</T>
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Die Sitzungskennung von Epic - anderswo heisst
                              sie Match ID. Sie ist zum Weiterreichen da,
                              deshalb ein Knopf statt einer Zeile zum
                              Markieren. */}
                          <code className="rounded bg-zinc-900 px-2 py-1 text-[10px]
                                           text-slate-400">{sp.id}</code>
                          <button onClick={() => idKopieren(sp.id)}
                            className="rounded-lg border border-zinc-800 px-2.5 py-1
                                       text-[11px] text-slate-300 transition
                                       hover:border-sky-500 hover:text-sky-400">
                            {kopiert === sp.id ? <T>kopiert</T> : <T>Match-ID kopieren</T>}
                          </button>
                        </div>
                      </div>

                      {/*
                        * Fehlende Plaetze stehen ueber der Tabelle, nicht
                        * statt ihrer.
                        *
                        * Frueher blieb die Aufstellung ganz verborgen, sobald
                        * ein Platz fehlte - gemessen betraf das
                        * vierundneunzig von sechsundneunzig beendeten Lobbys,
                        * und der Betreiber sah nie eine. Der Grundsatz bleibt
                        * trotzdem gewahrt: ein Ausschnitt darf nur dann
                        * dastehen, wenn danebensteht, dass es einer ist.
                        */}
                      {sp.fehlend ? (
                        <p className="border-b border-zinc-900 px-3 py-2 text-[11px]
                                      leading-relaxed text-amber-500/80">
                          <T>Von dieser Lobby fehlen</T> {sp.fehlend}{' '}
                          <T>Plätze — Epic gibt aus der Bestenliste nur die ersten
                          zehntausend heraus. Die Match-ID oben ist vollständig.</T>
                        </p>
                      ) : spieleFeldGrenze && !sp.live ? (
                        /*
                         * Eine Aufstellung, die glatt endet, ist deshalb noch
                         * nicht vollstaendig.
                         *
                         * Sie wird aus den Teams der Bestenliste gebaut, und
                         * die reicht nur bis Platz zehntausend. Wer in seiner
                         * Lobby Neunter wurde, am Tag aber Zwoelftausendster
                         * ist, steht in keiner Zeile - und weil dann kein
                         * Platz uebersprungen wird, sah es bisher aus wie
                         * eine geschlossene Liste. Genau das hat der
                         * Betreiber gemeldet.
                         */
                        <p className="border-b border-zinc-900 px-3 py-2 text-[11px]
                                      leading-relaxed text-amber-500/80">
                          <T>Hier stehen nur die Teams dieser Lobby, die im Tagesranking
                          unter den ersten zehntausend liegen — weiter hinten platzierte
                          gibt Epic nicht heraus. Die Match-ID oben ist vollständig.</T>
                        </p>
                      ) : null}

                      <div className="max-h-96 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-zinc-950">
                            <tr className="border-b border-zinc-800 text-[11px]
                                           uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Platz</T>
                              </th>
                              <th className="px-3 py-2 text-left font-medium">Team</th>
                              {mitPunkten && (
                                <th className="px-3 py-2 text-right font-medium">
                                  <T>Punkte</T>
                                </th>
                              )}
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Elims</T>
                              </th>
                              {mitSchaden && (
                                <th className="px-3 py-2 text-right font-medium">
                                  <T>Schaden</T>
                                </th>
                              )}
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Spielzeit</T>
                              </th>
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Tagesplatz</T>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sp.teams.map((t, i) => (
                              // Zwei Zeilen koennen dieselbe Team-Id tragen:
                              // in einer Qualifikation spielt ein Konto an
                              // einem Tag in mehreren Lobbys, und Epic
                              // vergibt die Id je Team, nicht je Sitzung.
                              // Ohne den Zusatz warf React Zeilen weg und
                              // brachte die Reihenfolge durcheinander.
                              <tr key={`${t.teamId ?? 'x'}-${i}`}
                                className="border-b border-zinc-900/70 last:border-0">
                                <td className={`px-3 py-1.5 text-right font-semibold
                                                tabular-nums ${t.platz === 1
                                  ? 'text-amber-400' : 'text-slate-400'}`}>
                                  {t.platz ?? '—'}
                                </td>
                                <td className="px-3 py-1.5 text-slate-200">
                                  {t.spieler.map(namenVon).join('  +  ')}
                                </td>
                                {mitPunkten && (
                                  <td className="px-3 py-1.5 text-right font-semibold
                                                 tabular-nums text-sky-400">
                                    {t.punkte ?? '—'}
                                  </td>
                                )}
                                <td className="px-3 py-1.5 text-right tabular-nums
                                               text-slate-300">
                                  {t.elims}
                                </td>
                                {mitSchaden && (
                                  <td className="px-3 py-1.5 text-right tabular-nums
                                                 text-slate-300">
                                    {t.damage.toLocaleString(ort)}
                                  </td>
                                )}
                                <td className="px-3 py-1.5 text-right tabular-nums
                                               text-slate-400">
                                  {Math.floor(t.timeAlive / 60)}:
                                  {String(t.timeAlive % 60).padStart(2, '0')}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums
                                               text-slate-600">
                                  {t.tagesPlatz}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="border-t border-zinc-900 px-3 py-2 text-[11px]
                                    text-slate-600">
                        {mitPunkten ? (
                          <T>Die Werte gelten je Team, so wie Epic sie meldet. Die
                          Punkte einer Runde nennt Epic nicht — sie sind aus Platz,
                          Eliminierungen und Epics eigener Punktetabelle dieses
                          Spieltags gerechnet.</T>
                        ) : (
                          <T>Die Werte gelten je Team, so wie Epic sie meldet. Punkte
                          einer einzelnen Runde gibt Epic nicht heraus — sie stehen
                          nur als Tagessumme in der Bestenliste.</T>
                        )}
                      </p>
                    </div>
            );
          };

          /** Wie lange eine Runde laeuft - laufend aus dem Beginn gerechnet. */
          const dauerVon = (sp: Spiel) => {
            if (sp.live && sp.beginn) {
              return Math.max(0, (jetzt - Date.parse(sp.beginn)) / 1000);
            }
            return sp.dauer ?? sp.laengsteLebenszeit;
          };

          return (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <header className="flex flex-wrap items-center justify-between gap-3
                               border-b border-zinc-800 px-4 py-3">
              {/* Bewusst ohne Uebersetzung: "Matches" heisst in beiden
                  Sprachen so, und die Tabelle uebersetzt es kleingeschrieben
                  als Kennzahl ("matches played") - das ergaebe hier eine
                  kleingeschriebene Ueberschrift. */}
              <h2 className="text-sm font-semibold text-slate-100">Matches</h2>
              <div className="flex flex-wrap items-center gap-3">
                {/* Der Filter, den der Betreiber wollte: laufend oder nicht. */}
                {spiele && spiele.length > 0 && (
                  <div className="flex gap-1 rounded-lg border border-zinc-800
                                  bg-zinc-900/60 p-1">
                    {([
                      ['alle', t('Alle'), spiele.length],
                      ['live', t('Live'), laufende],
                      ['fertig', t('Beendet'), spiele.length - laufende],
                    ] as const).map(([wert, titel, zahl]) => (
                      <button key={wert}
                        onClick={() => setSpielFilter(wert)}
                        disabled={zahl === 0}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1
                                    text-xs font-medium transition
                                    disabled:cursor-not-allowed disabled:opacity-40 ${
                          spielFilter === wert ? 'bg-sky-500 text-white'
                                               : 'text-slate-400 hover:text-slate-200'}`}>
                        {wert === 'live' && zahl > 0 && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full
                                             animate-ping rounded-full bg-rose-500
                                             opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5
                                             rounded-full bg-rose-500" />
                          </span>
                        )}
                        {titel}
                        <span className="tabular-nums opacity-60">{zahl}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Suche in den Runden. Sie steht dort, wo im Leaderboard
                    dasselbe Feld steht, und verhaelt sich genauso: der Text
                    erscheint sofort, gefiltert wird eine Spur spaeter. */}
                <div className="relative">
                  <input value={spielSuche}
                    onChange={(e) => setSpielSuche(e.target.value)}
                    placeholder={t('Sieger oder Spieler suchen …')}
                    className="w-52 rounded-lg border border-zinc-800 bg-zinc-900/80
                               px-3 py-1.5 pr-8 text-xs text-slate-100 outline-none
                               focus:border-sky-500" />
                  {spielSuche !== spielSucheTraege && (
                    <span className="pointer-events-none absolute right-2.5 top-1/2
                                     -translate-y-1/2">
                      <span className="block h-3 w-3 animate-spin rounded-full
                                       border border-slate-600 border-t-sky-400" />
                    </span>
                  )}
                </div>
              </div>
            </header>

            {(
              <div className="p-3">
                {spieleLaedt && !spiele && (
                  <div className="space-y-1">
                    {[...Array(3)].map((unbenutzt, i) =>
                      <div key={i} className="h-14 animate-pulse rounded bg-zinc-900/60" />)}
                    {/* Bei einer Qualifikation mit zehntausend Teilnehmern
                        dauert das ein bis zwei Minuten - ohne diesen Satz
                        sieht es aus, als haenge es. */}
                    <p className="pt-2 text-center text-[11px] text-slate-600">
                      <T>Bei einem großen Cup dauert das ein bis zwei Minuten.</T>
                    </p>
                  </div>
                )}

                {spiele && !spiele.length && (
                  <p className="p-4 text-center text-sm text-slate-500">
                    <T>Zu diesem Spieltag liefert Epic keine einzelnen Runden.</T>
                  </p>
                )}

                {spiele && spiele.length > 0 && !eineLobby && (
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                    <T>An diesem Spieltag laufen viele Lobbys gleichzeitig. Jede
                    Kachel ist deshalb eine eigene Lobby und keine gemeinsame
                    Runde — geordnet nach dem Zeitpunkt, an dem sie zu Ende
                    war.</T>
                  </p>
                )}

                {spiele && spiele.length > 0 && !gefiltert.length && (
                  <p className="p-4 text-center text-sm text-slate-500">
                    <T>Gerade läuft keine Lobby.</T>
                  </p>
                )}

                {gezeigt.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {gezeigt.map((sp) => (
                      <Fragment key={sp.id}>
                      <SpielKachel sp={sp} offen={sp.id === offenesSpiel}
                        eineLobby={eineLobby} ort={ort} dauer={dauerVon(sp)}
                        namenVon={namenVon} oeffnen={setOffenesSpiel} />
                      {sp.id === offenesSpiel && (
                        <div className="sm:col-span-2 lg:col-span-3">
                          {aufstellung(sp)}
                        </div>
                      )}
                      </Fragment>
                    ))}
                  </div>
                )}

                {/*
                  * Der Fuss der Liste: Kringel, Text und ein Balken.
                  *
                  * Kein Knopf - angeklickt werden muss nichts. Der Balken
                  * zeigt, wie weit es ist; ohne ihn sieht ein Stand von
                  * tausend bei zwanzigtausend genauso aus wie einer von
                  * neunzehntausend. An diesem Absatz haengt ausserdem das
                  * Nachladen beim Scrollen.
                  */}
                {gezeigt.length < gefiltert.length && (
                  <div ref={mehrRef} className="mt-3 px-1 pb-1">
                    <div className="flex items-center justify-center gap-2
                                    text-[11px] text-slate-400">
                      <span className="block h-3.5 w-3.5 shrink-0 animate-spin
                                       rounded-full border-2 border-zinc-700
                                       border-t-sky-400" />
                      <T>Weitere Matches werden geladen …</T>
                      <span className="tabular-nums text-slate-500">
                        {gezeigt.length.toLocaleString(ort)} <T>von</T>{' '}
                        {gefiltert.length.toLocaleString(ort)}
                      </span>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full
                                    bg-zinc-800">
                      <div className="h-full rounded-full bg-sky-500 transition-all
                                      duration-200"
                        style={{ width: `${Math.min(100, Math.round(
                          (gezeigt.length / Math.max(1, gefiltert.length)) * 100))}%` }} />
                    </div>
                  </div>
                )}

              </div>
            )}
          </section>
          );
        })()}

        {/*
          * Werte je einzelnem Spieler.
          *
          * Das ist die Ansicht, die aus dem Leaderboard grundsaetzlich nicht
          * zu bauen ist: Epic zaehlt je Team. Hier steht, wer von einem Duo
          * die Elims geholt hat - gezaehlt aus den Replays, die das Werkzeug
          * ohnehin einsammelt.
          */}
        {reiter === 'spieler' && !soloCup && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <header className="flex flex-wrap items-center justify-between gap-3
                               border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-100">
                <T>Spieler-Stats</T>
              </h2>
              <div className="flex items-center gap-3">
                <input value={spielerSuche}
                  onChange={(e) => setSpielerSuche(e.target.value)}
                  placeholder={t('Spieler suchen …')}
                  className="w-52 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                             py-1.5 text-xs text-slate-100 outline-none
                             focus:border-sky-500" />
                {spielerWerte?.vorhanden && (
                  <span className="text-xs text-slate-500">
                    {spielerWerte.spieler.length} <T>Spieler</T>
                    {' · '}
                    {/*
                      * Wie viele Runden ausgewertet sind - und wie viele es
                      * gibt.
                      *
                      * Der Betreiber sah "46 Rounds" und einen Spitzenreiter
                      * mit fuenf Eliminierungen und hielt die Zahlen fuer
                      * falsch. Sie waren nicht falsch, sie waren
                      * unvollstaendig - und das stand nirgends.
                      */}
                    {spielerWerte.rundenGesamt
                      && spielerWerte.rundenGesamt > spielerWerte.runden ? (
                      <span className="text-amber-500/90">
                        {spielerWerte.runden} <T>von</T>{' '}
                        {spielerWerte.rundenGesamt} <T>Runden ausgewertet</T>
                      </span>
                    ) : (
                      <>{spielerWerte.runden} <T>Runden</T></>
                    )}
                  </span>
                )}
              </div>
            </header>

            {spielerLaedt && !spielerWerte && (
              <div className="space-y-1 p-4">
                {[...Array(8)].map((unbenutzt, i) =>
                  <div key={i} className="h-8 animate-pulse rounded bg-zinc-900/60" />)}
              </div>
            )}

            {spielerWerte && !spielerWerte.vorhanden && (
              <div className="p-8 text-center text-sm leading-relaxed text-slate-500">
                <p>
                  <T>Zu diesem Spieltag sind noch keine Replays ausgewertet. Erst
                  daraus lässt sich zählen, wer von einem Duo welche Elim geholt
                  hat — Epic liefert die Werte nur je Team.</T>
                </p>
                {/*
                  * Wann der Sammler zuletzt lief.
                  *
                  * Ohne das riet die Seite zum Warten, auch wenn gar nichts
                  * mehr kam - der Sammler war stehengeblieben, und niemand
                  * konnte es sehen. Die Match-Ids stehen ja im Reiter
                  * daneben, das Replay dazu ist trotzdem nicht geholt.
                  */}
                {spielerWerte.lauf ? (
                  <p className={`mt-2 text-[11px] ${spielerWerte.lauf.ok
                    ? 'text-slate-600' : 'text-amber-500'}`}>
                    <T>Der Replay-Sammler lief zuletzt</T>{' '}
                    {spielerWerte.lauf.zeitpunkt
                      ? new Date(spielerWerte.lauf.zeitpunkt).toLocaleString(ort)
                      : '—'}
                    {spielerWerte.lauf.ok === false && spielerWerte.lauf.fehler
                      ? ` — ${spielerWerte.lauf.fehler}` : ''}
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-600">
                    <T>Die Replays werden planmäßig eingesammelt und stehen
                    meist am Tag danach bereit.</T>
                  </p>
                )}
              </div>
            )}

            {spielerWerte?.vorhanden && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] uppercase
                                   tracking-wider text-slate-500">
                      <th className="px-4 py-2 text-right font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium"><T>Spieler</T></th>
                      <th className="px-3 py-2 text-right font-medium"><T>Elims</T></th>
                      <th className="px-3 py-2 text-right font-medium"><T>Knocks</T></th>
                      <th className="px-3 py-2 text-right font-medium"><T>Tode</T></th>
                      <th className="px-3 py-2 text-right font-medium"><T>Ø je Runde</T></th>
                      <th className="px-4 py-2 text-right font-medium"><T>Runden</T></th>
                    </tr>
                  </thead>
                  <tbody>
                    {spielerWerte.spieler
                      .filter((sp) => {
                        const q = spielerSuche.trim().toLowerCase();
                        if (!q) return true;
                        return sp.name.toLowerCase().includes(q)
                          || sp.partner.some((x) => x.toLowerCase().includes(q));
                      })
                      .map((sp0, i) => {
                        const aus = teamAusListe.get(sp0.epicId);
                        const sp = sp0.platz === null && aus
                          ? { ...sp0, platz: aus.platz, partner: aus.partner }
                          : sp0;
                        return (
                        <tr key={sp.epicId}
                          className="border-b border-zinc-900/70 last:border-0">
                          <td className="px-4 py-1.5 text-right tabular-nums
                                         text-slate-500">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-2">
                              {sp.land && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/flags/${sp.land.toLowerCase()}.png`} alt=""
                                  className="h-3.5 w-5 rounded-[2px] object-cover" />
                              )}
                              <span className="text-slate-200">{sp.name}</span>
                              {sp.partner.length > 0 && (
                                <span className="text-[11px] text-slate-600">
                                  <T>mit</T> {sp.partner.join(', ')}
                                  {sp.platz ? ` · #${sp.platz}` : ''}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums
                                         font-semibold text-slate-100">{sp.kills}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums
                                         text-slate-400">{sp.knocks}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums
                                         text-slate-500">{sp.tode}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums
                                         text-slate-400">
                            {sp.spiele ? (sp.kills / sp.spiele).toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums
                                         text-slate-500">{sp.spiele}</td>
                        </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="border-t border-zinc-900 px-4 py-2 text-[11px]
                              text-slate-600">
                  <T>Aus den Replays dieses Spieltags gezählt, je Spieler. Ein Knock
                  ist das Umhauen, eine Elim das endgültige Ausschalten — beides
                  zusammen zu zählen ergäbe fast doppelt so viele Elims, wie das
                  Turnier kennt.</T>
                </p>
              </div>
            )}
          </section>
        )}

        {/*
          * Wer aus diesem Cup gerade sendet.
          *
          * Nur hinterlegte Kanaele, nur echte Live-Zustaende von Twitch.
          * Wer keinen Kanal gepflegt hat, fehlt - und die Zeile darunter
          * sagt, wie viele das sind, damit die Luecke nicht wie ein Fehler
          * aussieht.
          */}
        {reiter === 'streams' && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <header className="flex flex-wrap items-center justify-between gap-3
                               border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-100">Streams</h2>
              <span className="text-xs text-slate-500">
                {mitTwitch.length} <T>hinterlegte Kanäle</T>
              </span>
            </header>

            {!mitTwitch.length ? (
              <p className="p-8 text-center text-sm leading-relaxed text-slate-500">
                <T>Zu keinem Spieler dieses Spieltags ist ein Twitch-Kanal
                hinterlegt. Klapp im Leaderboard ein Team auf und klick doppelt
                auf die Flaggen — dort schlägt Twitch passende Kanäle vor.
                Geraten wird keiner: „Sky“ gibt es auf Twitch hundertmal.</T>
              </p>
            ) : (
              <div className="p-3">
                {liveLaedt && !live && (
                  <p className="p-4 text-center text-sm text-slate-500">
                    <T>Wird geladen …</T>
                  </p>
                )}

                {live && (() => {
                  const sendet = mitTwitch.filter((x) =>
                    live[x.kanal.toLowerCase()]?.isLive);
                  if (!sendet.length) {
                    return (
                      <p className="p-4 text-center text-sm text-slate-500">
                        <T>Gerade sendet niemand von ihnen.</T>
                      </p>
                    );
                  }
                  return (
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sendet
                        .sort((a, b) =>
                          (live[b.kanal.toLowerCase()]?.viewers ?? 0)
                          - (live[a.kanal.toLowerCase()]?.viewers ?? 0))
                        .map((x) => (
                          <li key={x.kanal} className="relative">
                            {/*
                              * Das Plus.
                              *
                              * Es legt den Stream in einen Ordner der
                              * Multiview - deshalb sitzt es auf der Kachel
                              * und nicht daneben: der Griff und das Ziel
                              * gehoeren zusammen.
                              */}
                            <button type="button"
                              onClick={() => { setOrdnerStand('');
                                setOrdnerFuer(ordnerFuer === x.kanal ? null : x.kanal); }}
                              title={uebsOrdner}
                              className="absolute right-2 top-2 z-10 grid h-6 w-6
                                         place-items-center rounded-full border
                                         border-zinc-700 bg-zinc-950 text-sm
                                         text-slate-400 transition
                                         hover:border-purple-500 hover:text-purple-300">
                              +
                            </button>

                            {ordnerFuer === x.kanal && (
                              <div className="absolute right-2 top-9 z-20 w-56 overflow-hidden
                                              rounded-lg border border-zinc-700 bg-zinc-950
                                              shadow-lg shadow-black/60">
                                <p className="border-b border-zinc-800 px-3 py-1.5
                                              text-[10px] uppercase tracking-wider
                                              text-slate-500">
                                  <T>In welchen Ordner?</T>
                                </p>
                                <ul className="max-h-40 overflow-y-auto">
                                  {(ordner ?? []).map((o) => (
                                    <li key={o.id}>
                                      <button type="button"
                                        onClick={() => void inOrdner(x.kanal, o.id)}
                                        className="flex w-full items-center justify-between
                                                   gap-2 px-3 py-1.5 text-left text-xs
                                                   text-slate-300 transition
                                                   hover:bg-zinc-900">
                                        <span className="truncate">{o.name}</span>
                                        <span className="shrink-0 text-[10px] text-slate-600">
                                          {o.streamers.length}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                                <div className="flex items-center gap-1 border-t
                                                border-zinc-800 p-2">
                                  <input value={neuerOrdner}
                                    onChange={(ev) => setNeuerOrdner(ev.target.value)}
                                    onKeyDown={(ev) => { if (ev.key === 'Enter') {
                                      void inOrdner(x.kanal, 'neu', neuerOrdner); } }}
                                    placeholder={t('Neuer Ordner …')}
                                    className="min-w-0 flex-1 rounded border border-zinc-800
                                               bg-zinc-900 px-2 py-1 text-[11px]
                                               text-slate-100 outline-none
                                               focus:border-purple-600" />
                                  <button type="button"
                                    disabled={!neuerOrdner.trim()}
                                    onClick={() => void inOrdner(x.kanal, 'neu', neuerOrdner)}
                                    className="rounded border border-zinc-700 px-2 py-1
                                               text-[11px] text-slate-300 transition
                                               hover:border-purple-500
                                               disabled:opacity-40">
                                    +
                                  </button>
                                </div>
                              </div>
                            )}

                            {/*
                              * Auf die eigene Streamerseite, nicht nach
                              * Twitch hinaus. Dort laeuft der Stream im
                              * Werkzeug, mit Chat und den Ordnern daneben.
                              */}
                            <a href={`/streams?kanal=${encodeURIComponent(x.kanal)}`}
                              className="flex items-center gap-3 rounded-lg border
                                         border-zinc-800 bg-zinc-950/60 px-3 py-2.5
                                         transition hover:border-purple-600">
                              <span aria-hidden
                                className="h-2 w-2 shrink-0 animate-pulse rounded-full
                                           bg-rose-500" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-slate-100">
                                  {x.name}
                                </span>
                                <span className="block truncate text-[11px] text-slate-500">
                                  twitch.tv/{x.kanal}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-[11px] text-slate-400">
                                  #{x.rang}
                                </span>
                                {/* Die Zuschauerzahl kommt nur ueber Twitchs
                                    Schnittstelle. Faellt die aus, wird der
                                    Live-Zustand von der oeffentlichen Seite
                                    gelesen - dort steht keine Zahl, und dann
                                    steht hier auch keine statt einer Null. */}
                                {(live[x.kanal.toLowerCase()]?.viewers ?? 0) > 0 && (
                                  <span className="block text-[11px] text-slate-600">
                                    {(live[x.kanal.toLowerCase()]?.viewers ?? 0)
                                      .toLocaleString(ort)}{' '}
                                    <T>Zuschauer</T>
                                  </span>
                                )}
                              </span>
                            </a>
                          </li>
                        ))}
                    </ul>
                  );
                })()}

                {ordnerStand && (
                  <p className="mt-3 text-[11px] text-emerald-400">{ordnerStand}</p>
                )}

                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                  <T>Das Plus legt einen Stream in einen Ordner der Multiview —
                  dieselben Ordner wie auf der Startseite. Beim nächsten Aufruf
                  der Multiview liegen sie dort nebeneinander.</T>
                </p>

                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  <T>Gezeigt werden nur Spieler, zu denen ein Twitch-Kanal
                  hinterlegt ist. Weitere trägst du nach, indem du im
                  Leaderboard ein Team aufklappst und doppelt auf die Flaggen
                  klickst.</T>
                </p>
              </div>
            )}
          </section>
        )}

        {reiter === 'teams' && !statistik.length && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                        text-center text-sm text-slate-500">
            <T>Zu diesem Spieltag liegen noch keine Teamwerte vor.</T>
          </p>
        )}

        {/* Turnierstatistik - nur unter einem Finale */}
        {reiter === 'teams' && statistik.length > 0 && (
          <section>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-slate-100">
                {soloCup ? <T>Spieler-Stats</T> : <T>Turnierstatistik</T>}
              </h2>
              {/*
                * Hier stand ein roter Balken "Stand nach Runde 3".
                *
                * Der Betreiber hat ihn abgeraeumt: dass ein laufender Cup
                * noch nicht fertig ist, weiss ohnehin jeder, der ihn
                * anschaut - und die Rundenzahl war bei einem Open-Cup, in
                * dem jede Lobby anders weit ist, ohnehin nur die des
                * Spitzenreiters.
                */}
              <span className="text-[11px] text-slate-500">
                <T>Werte je</T> {soloCup ? t('Spieler (Einzahl)') : 'Duo'}<T>, direkt von Epic — nur was dieses Turnier mitschickt</T>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {statistik.map((b) => (
                <div key={b.schluessel}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <p className="flex items-center gap-1.5 border-b border-zinc-800
                                bg-zinc-900/60 px-3 py-2 text-[11px] font-semibold
                                uppercase tracking-wider text-slate-300">
                    <span className="not-italic">{b.symbol}</span>{b.titel}
                    {/* Die Kachel zeigt fuenf. Dahinter steht das ganze Feld -
                        dieselbe Sortierung, nur ungekuerzt. */}
                    {b.alle.length > b.plaetze.length && (
                      <button type="button"
                        onClick={() => listeOeffnen(b)}
                        title={`${t('Alle anzeigen')} (${b.alle.length})`}
                        className="ml-auto rounded border border-zinc-700 px-1.5
                                   text-[11px] leading-4 text-slate-400 transition
                                   hover:border-sky-500 hover:text-sky-400">
                        +
                      </button>
                    )}
                  </p>
                  <ol className="divide-y divide-zinc-900">
                    {b.plaetze.map((pl, i) => (
                      <li key={`${b.schluessel}-${pl.rank}-${i}`}
                        className="flex items-center gap-2 px-3 py-2">
                        <span className={`w-4 shrink-0 text-right text-[11px] font-bold
                                          tabular-nums ${i === 0 ? 'text-amber-400'
                                                                 : 'text-slate-600'}`}>
                          {i + 1}
                        </span>
                        <TeamFlagge groesse={20}
                          laender={pl.spieler.map((n, k) =>
                            landVon({ name: n, id: pl.ids?.[k] }))} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">
                          {/* Auch hier der gepflegte Name - sonst stuende in
                              der Turnierstatistik ein anderer als eine Zeile
                              darueber im Leaderboard. */}
                          {pl.spieler
                            .map((n, k) => namenVon({ name: n, id: pl.ids?.[k] ?? '' }))
                            .join('  +  ')}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums
                                         text-slate-100">
                          {pl.wert.toLocaleString(ort, {
                            minimumFractionDigits: b.nachkomma ?? 0,
                            maximumFractionDigits: b.nachkomma ?? 0,
                          })}
                          {b.einheit && <span className="ml-0.5 text-[10px]
                                                        font-normal text-slate-500">
                            {b.einheit}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Eine Kennzahl in voller Laenge.
            Als Ueberlagerung statt als aufklappende Kachel: das Feld hat bei
            einem Finale ueber tausend Zeilen, und die haetten die Kachelreihe
            auseinandergerissen. */}
        {offeneListe && (
          <div className="fixed inset-0 z-50 flex items-start justify-center
                          bg-black/70 p-4 sm:p-8"
            onClick={(e) => { if (e.target === e.currentTarget) setOffeneListe(null); }}>
            <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden
                            rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
              <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800
                                 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <span className="not-italic">{offeneListe.symbol}</span>
                  {offeneListe.titel}
                </h3>
                <span className="text-xs text-slate-500">
                  {offeneListe.alle.length.toLocaleString(ort)}
                  {' '}{soloCup ? <T>Spieler</T> : <T>Teams</T>}
                  {listeLaedt ? ' …' : ''}
                </span>

                <input value={listenSuche}
                  onChange={(e) => setListenSuche(e.target.value)}
                  placeholder={t('Spieler suchen …')}
                  className="w-44 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3
                             py-1 text-xs text-slate-100 outline-none
                             focus:border-sky-500" />

                <div className="ml-auto flex items-center gap-1">
                  {([50, 100, 0] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setListenTiefe(n)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        listenTiefe === n
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                      {n === 0 ? <T>Alle</T> : `Top ${n}`}
                    </button>
                  ))}
                  <button type="button" onClick={() => setOffeneListe(null)}
                    className="ml-1 rounded-md border border-zinc-800 px-2.5 py-1 text-xs
                               text-slate-400 transition hover:border-rose-500/60
                               hover:text-rose-400">
                    ×
                  </button>
                </div>
              </header>

              <ol className="divide-y divide-zinc-900 overflow-y-auto">
                {/*
                  * Wird gesucht, gilt die Tiefe nicht.
                  *
                  * Wer einen Namen eintippt, meint das ganze Feld - sonst
                  * faende er ihn nur, wenn er zufaellig unter den ersten
                  * fuenfzig steht.
                  */}
                {(listenSuche.trim()
                  ? offeneListe.alle.filter((pl) => pl.spieler.some((n, k) =>
                    namenVon({ name: n, id: pl.ids?.[k] ?? '' }).toLowerCase()
                      .includes(listenSuche.trim().toLowerCase())
                    || n.toLowerCase().includes(listenSuche.trim().toLowerCase())))
                  : listenTiefe ? offeneListe.alle.slice(0, listenTiefe) : offeneListe.alle)
                  .map((pl, i) => (
                    <li key={`${pl.rank}-${i}`} className="flex items-center gap-2.5 px-4 py-2">
                      <span className={`w-8 shrink-0 text-right text-xs font-bold tabular-nums ${
                        i === 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                        {i + 1}
                      </span>
                      <TeamFlagge groesse={22}
                        laender={pl.spieler.map((n, k) =>
                          landVon({ name: n, id: pl.ids?.[k] }))} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                        {pl.spieler
                          .map((n, k) => namenVon({ name: n, id: pl.ids?.[k] ?? '' }))
                          .join('  +  ')}
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums
                                       text-slate-100">
                        {pl.wert.toLocaleString(ort, {
                          minimumFractionDigits: offeneListe.nachkomma ?? 0,
                          maximumFractionDigits: offeneListe.nachkomma ?? 0,
                        })}
                        {offeneListe.einheit && (
                          <span className="ml-0.5 text-[10px] font-normal text-slate-500">
                            {offeneListe.einheit}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        )}

      </div>
      {/* Flaggen von Hand setzen - nur Flaggen, keine Namen.
          Gespeichert wird zur Epic-Konto-Id im selben Profil, aus dem auch
          die Beitragsseite liest. Die Flagge steht danach überall und
          überlebt das Neuladen. */}
      {flaggenTeam && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setFlaggenTeam(null)}>
          <div onClick={(ev) => ev.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900
                       p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                <T>Flaggen und Twitch</T>
                <span className="ml-2 text-[11px] font-normal text-slate-500">
                  {flaggenTeam.players.map(namenVon).join('  +  ')}
                </span>
              </h3>
              <button onClick={() => setFlaggenTeam(null)}
                className="text-slate-500 hover:text-slate-200">✕</button>
            </div>

            <input value={flaggenSuche} onChange={(ev) => setFlaggenSuche(ev.target.value)}
              placeholder={t('Kürzel suchen — de, ro, us …')}
              className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-amber-600" />

            <div className="space-y-4">
              {flaggenTeam.players.map((sp, k) => {
                const gesetzt = (flaggenEntwurf[k] ?? '').toLowerCase();
                const q = flaggenSuche.trim().toLowerCase();
                const liste = q ? flaggen.filter((f) => f.includes(q)) : flaggen;
                return (
                  <div key={sp.id || sp.name}
                    className="rounded-xl border border-zinc-800 p-3">
                    <div className="mb-2 flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={flaggenPfad(gesetzt || undefined)} alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover
                                   ring-1 ring-white/20" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                        {sp.name}
                      </span>
                      <input value={flaggenEntwurf[k] ?? ''} maxLength={2}
                        onChange={(ev) => setFlaggenEntwurf((a) => a.map((v, i) =>
                          (i === k ? ev.target.value.toUpperCase() : v)))}
                        placeholder="—"
                        className="w-14 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1
                                   text-center text-sm uppercase text-slate-100 outline-none
                                   focus:border-amber-600" />
                      {gesetzt && (
                        <button onClick={() => setFlaggenEntwurf((a) =>
                          a.map((v, i) => (i === k ? '' : v)))}
                          className="text-[11px] text-slate-500 hover:text-rose-400">
                          <T>leeren</T>
                        </button>
                      )}
                    </div>
                    {/*
                      * Der Twitch-Kanal.
                      *
                      * Steht hier, weil dieses Fenster ohnehin das ist, in
                      * dem der Betreiber einen Spieler pflegt. Der Knopf
                      * daneben fragt Twitchs eigene Kanalsuche - damit ist
                      * der richtige Kanal in zwei Klicks eingetragen, statt
                      * ihn abzutippen.
                      */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-500">twitch.tv/</span>
                      <input value={twitchEntwurf[k] ?? ''}
                        onChange={(ev) => setTwitchEntwurf((a) => a.map((v, i) =>
                          (i === k ? ev.target.value : v)))}
                        placeholder="—"
                        className="w-40 rounded-lg border border-zinc-800 bg-zinc-950
                                   px-2 py-1 text-sm text-slate-100 outline-none
                                   focus:border-purple-600" />
                      <button type="button"
                        onClick={() => void twitchSuchen(k, sp.name)}
                        className="rounded-lg border border-zinc-700 px-2 py-1
                                   text-[11px] text-slate-400 transition
                                   hover:border-purple-500 hover:text-purple-300">
                        <T>Kanal suchen</T>
                      </button>
                      {(twitchEntwurf[k] ?? '') && (
                        <button onClick={() => setTwitchEntwurf((a) =>
                          a.map((v, i) => (i === k ? '' : v)))}
                          className="text-[11px] text-slate-500 hover:text-rose-400">
                          <T>leeren</T>
                        </button>
                      )}
                    </div>
                    {twitchHinweis && !(twitchVorschlag[k] ?? []).length && (
                      <p className="mb-2 text-[11px] text-amber-500">{twitchHinweis}</p>
                    )}
                    {(twitchVorschlag[k] ?? []).length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {(twitchVorschlag[k] ?? []).map((v) => (
                          <button key={v.login} type="button"
                            onClick={() => setTwitchEntwurf((a) => a.map((w, i) =>
                              (i === k ? v.login : w)))}
                            title={v.spiel || undefined}
                            className="flex items-center gap-1.5 rounded-lg border
                                       border-zinc-800 px-2 py-1 text-[11px]
                                       text-slate-300 transition
                                       hover:border-purple-500">
                            {v.bild && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={v.bild} alt=""
                                className="h-5 w-5 rounded-full object-cover" />
                            )}
                            <span>{v.name}</span>
                            {v.live && (
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {liste.map((f) => (
                        <button key={f} title={f.toUpperCase()}
                          onClick={() => setFlaggenEntwurf((a) => a.map((v, i) =>
                            (i === k ? f.toUpperCase() : v)))}
                          className={`rounded-full p-0.5 transition ${gesetzt === f
                            ? 'ring-2 ring-amber-400'
                            : 'ring-1 ring-zinc-800 hover:ring-sky-500'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/flags/${f}.png`} alt={f}
                            className="h-6 w-6 rounded-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-snug text-slate-600">
                <T>Angeboten wird nur, was als Datei vorliegt —</T> {flaggen.length} <T>Flaggen. Leer heißt: Herkunft nicht bekannt, dann steht dort der Globus.</T>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {flaggenStand && (
                  <span className="text-[11px] text-slate-500">{flaggenStand}</span>
                )}
                <button onClick={() => setFlaggenTeam(null)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs
                             text-slate-300 hover:border-zinc-500">
                  <T>Abbrechen</T>
                </button>
                <button onClick={flaggenSichern}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium
                             text-white transition hover:bg-amber-500">
                  <T>Speichern</T>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

