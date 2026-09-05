'use client';

// Turnierkarte: Spots einzeichnen und Teams darauf verteilen.
//
// Das Kartenbild kommt live von der Kartenquelle, die Teams aus dem
// Leaderboard des gewaehlten Cups. Wer nicht als Admin angemeldet ist, sieht
// die fertige Karte und darf sie nur anschauen - Ortsnamen ein, Spieler ein,
// Vollbild. Alles andere bleibt dem Adminkonto vorbehalten.

import {
  Fragment, use, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { MARKE } from '@/lib/marke';
import TeamFlagge, { flaggenPfad } from '@/components/TeamFlagge';
import { gefaltet, kernname, namensSchluessel, ohneZierrat } from '@/lib/homoglyph';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { kartenTitel } from '@/lib/rundenName';
import { istGrossesTurnier } from '@/lib/turnierArt';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
type Form = 'rechteck' | 'polygon';
interface Punkt { x: number; y: number }
interface Spot {
  id: string; form: Form; punkte: Punkt[]; name?: string; teams: string[];
  /** Selbst gewaehlte Farbe. Ohne Angabe faerbt sich die Form nach Belegung. */
  farbe?: string;
}
interface KartenTeam {
  id: string; spieler: string[]; farbe: string;
  /** Epic-Konto-IDs in derselben Reihenfolge wie die Namen. */
  ids?: string[];
}

/**
 * Stabiler Schluessel eines Teams, gebildet aus seinen Epic-Konten.
 *
 * Frueher stand hier die Platzierung ("t18"). Das war falsch: laedt jemand
 * die Teams eines laufenden Cups neu, verschieben sich die Plaetze, und
 * "t18" zeigt danach auf ein anderes Duo - die Formen waren ploetzlich mit
 * den falschen Leuten belegt, ohne dass es jemandem auffiel. Konten aendern
 * sich nie, also haengt der Schluessel an ihnen. Sortiert, damit die
 * Reihenfolge der beiden Spieler keinen Unterschied macht.
 *
 * Ohne jede Konto-ID gibt es nichts Stabiles - dann bleibt nur der Platz,
 * und der Aufrufer setzt seinen eigenen Notnagel ein.
 */
function kontoSchluessel(ids?: Array<string | undefined>): string | null {
  const echte = (ids ?? []).filter((x): x is string => Boolean(x));
  return echte.length ? `k:${[...echte].sort().join('_')}` : null;
}

/**
 * Hebt eine gespeicherte Karte von Platznummern auf stabile Schluessel.
 *
 * Jede gespeicherte Karte fuehrt zu jedem Team die Konto-IDs mit, also
 * laesst sich "t18" eindeutig aufloesen - ohne das Leaderboard erneut zu
 * befragen und ohne dass sich eine Zuordnung verschiebt. Karten, die schon
 * stabil sind, laufen unveraendert durch.
 *
 * Wuerden zwei Teams auf denselben Schluessel fallen (dasselbe Konto in zwei
 * Duos), blieben beide beim alten Namen. Lieber eine alte Kennung behalten
 * als zwei Eintraege stillschweigend zu einem verschmelzen.
 */
function migriereZuordnung(k: { spots?: Spot[]; teams?: KartenTeam[] })
: { spots: Spot[]; teams: KartenTeam[] } {
  const teams = k.teams ?? [];
  const zaehler = new Map<string, number>();
  for (const t of teams) {
    const s = kontoSchluessel(t.ids);
    if (s) zaehler.set(s, (zaehler.get(s) ?? 0) + 1);
  }
  const neu = new Map<string, string>();
  for (const t of teams) {
    const s = kontoSchluessel(t.ids);
    neu.set(t.id, s && zaehler.get(s) === 1 ? s : t.id);
  }
  return {
    teams: teams.map((t) => ({ ...t, id: neu.get(t.id) ?? t.id })),
    spots: (k.spots ?? []).map((s) => ({
      ...s, teams: (s.teams ?? []).map((id) => neu.get(id) ?? id),
    })),
  };
}

interface Ort { id: string; name: string; links: number; oben: number }
interface KartenInfo {
  orte: Ort[]; stand: string | null; tageAlt: number | null;
}

/** Ein selbst hochgeladenes Kartenbild - etwa eine der Reload-Karten. */
interface Kartenbild { id: string; titel: string; hochgeladen: number }

interface Fenster {
  status: string; begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string; istFinale: boolean;
}
interface Cup {
  id: string; titel: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
}
interface GespeicherteKarte {
  id: string; titel: string; spots: Spot[]; teams: KartenTeam[];
  namenSichtbar: boolean; gesperrt?: boolean; geaendert: number;
  bildId?: string;
  /** Name des Kartenbildes - erscheint auf der Events-Seite am Knopf. */
  bildTitel?: string;
  /** Fuer welche Spiele des Spieltags diese Karte gilt, etwa "1-5". */
  spiele?: string;
  /** Turnier und Spieltag - darueber wird eine Karte wiedergefunden. */
  eventId?: string;
  windowId?: string;
  /** Steht die Karte bei den Events fuer alle sichtbar? */
  oeffentlich?: boolean;
  cupTitel?: string;
  /** Zu welchem Cup - fuer den Rueckweg auf dessen Eventseite. */
  cupId?: string;
}

/** Regionen, fuer die ueberhaupt Karten entstehen. */
const KARTEN_REGIONEN = ['EU', 'NAC'];

const FARBEN = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185',
                '#22d3ee', '#f472b6', '#84cc16'];

/**
 * Womit eine neue Karte anfangen soll: mit der Finalrunde.
 *
 * Karten entstehen fuer Finals, Open-Runden kommen so gut wie nie vor - mit
 * der ersten Runde zu starten hiesse, dass fast jedes Mal umgestellt werden
 * muss. Unter mehreren Regionen gewinnt EU, dieselbe Heimatregion, die auch
 * lib/epicCups.ts voreinstellt. Gibt es kein Finale, bleibt die Auswahl leer:
 * lieber nichts als unbemerkt eine Open-Runde.
 */
function finaleFenster(c: Cup | undefined): (Fenster & { region: string }) | null {
  if (!c) return null;
  const alle = Object.entries(c.regionen).flatMap(([region, liste]) =>
    liste.map((f) => ({ ...f, region })));
  const finals = alle.filter((f) => f.istFinale);
  if (!finals.length) return null;
  return finals.find((f) => f.region === 'EU') ?? finals[0];
}

/** Wie nah ein Klick am ersten Punkt liegen muss, damit die Form sich schliesst. */
const SCHLIESS_NAEHE = 2.2;

function rechteckPunkte(a: Punkt, b: Punkt): Punkt[] {
  return [
    { x: a.x, y: a.y }, { x: b.x, y: a.y },
    { x: b.x, y: b.y }, { x: a.x, y: b.y },
  ];
}

function mittelpunkt(p: Punkt[]): Punkt {
  return {
    x: p.reduce((s, q) => s + q.x, 0) / p.length,
    y: p.reduce((s, q) => s + q.y, 0) / p.length,
  };
}

/**
 * Wie breit ist die Form auf einer bestimmten Hoehe, und wo liegt dort ihre
 * Mitte? Bei schraegen oder spitz zulaufenden Formen ist das je Zeile
 * verschieden - das umschliessende Rechteck wuerde die Beschriftung neben
 * die Flaeche setzen.
 */
function spanneBei(punkte: Punkt[], y: number): { mitte: number; breite: number } | null {
  const schnitte: number[] = [];
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i], b = punkte[j];
    // Kante schneidet diese Hoehe?
    if ((a.y > y) === (b.y > y)) continue;
    schnitte.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (schnitte.length < 2) return null;
  const links = Math.min(...schnitte), rechts = Math.max(...schnitte);
  return { mitte: (links + rechts) / 2, breite: rechts - links };
}

/** Das umschliessende Rechteck einer Form - Grundlage fuer die Beschriftung. */
function rahmen(p: Punkt[]) {
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  const links = Math.min(...xs), oben = Math.min(...ys);
  const breite = Math.max(...xs) - links, hoehe = Math.max(...ys) - oben;
  return { links, oben, breite, hoehe };
}

/**
 * Schriftgroesse, damit die Zeile in die Form passt: begrenzt einmal durch die
 * Hoehe, die einem Team zusteht, und einmal durch die Breite des laengsten
 * Namens. Der Wert gilt in Prozent der Kartenbreite.
 *
 * Frueher stand hier eine Untergrenze von 1,35 - damit lief die Zeile bei
 * engen Formen sichtbar ueber den Rand hinaus. Jetzt darf sie klein werden:
 * die Schrift bleibt beim Hineinzoomen gleich gross und waechst dadurch von
 * selbst im Verhaeltnis zur Form. Lieber klein und drinnen als gross und
 * darueber.
 */
function schriftgroesse(breite: number, hoehe: number, zeichen: number) {
  const nachHoehe = hoehe * 0.6;
  // Gemischte Schreibweise braucht gut die halbe Hoehe an Breite je Zeichen.
  // 0,92 heisst: die Zeile darf 92 Prozent der Formbreite einnehmen.
  const nachBreite = (breite * 0.92) / Math.max(zeichen * 0.52, 1);
  return Math.max(0.5, Math.min(nachHoehe, nachBreite, 2.4));
}

/**
 * Wie stark die Schrift der Vergroesserung folgt.
 *
 * Ganz mitwachsen liess sie frueher beim Hineinzoomen den halben Bildschirm
 * fuellen. Gar nicht mitwachsen liess sie in einer weit aufgezogenen Form
 * verloren wirken. Die Wurzel ist der Mittelweg: bei vierfachem Zoom steht
 * sie doppelt so gross auf dem Schirm wie bei einfachem, bei sechsfachem
 * zweieinhalbfach - und weil sie in Kartenmassen dabei nur kleiner wird,
 * kann sie nie ueber den Rand der Form hinauslaufen.
 */
function schriftFaktor(zoom: number) {
  return Math.sqrt(Math.max(1, zoom));
}

/** Liegt der Punkt in der Flaeche? Strahlenverfahren, fuer Drag and Drop. */
function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

function kuerze(name: string) {
  // Gemeinsame Regel mit der Beitragsseite: nur ein echter Orgtag faellt
  // weg, damit "FocusHD yhyh" und "Th0masHD yhyh" unterscheidbar bleiben.
  return grossAnfang(ohneZierrat(kernname(name)).slice(0, 16));
}

/**
 * Den ersten Buchstaben gross schreiben - immer, ohne Schalter.
 *
 * Auf der Karte stehen Namen nebeneinander, die mal klein und mal gross
 * beginnen ("peterbot" neben "Nociff"). Das wirkt unruhig. Geaendert wird
 * ausschliesslich das erste Zeichen: der Rest bleibt so, wie der Spieler
 * sich schreibt, und ein Name, der mit einer Ziffer beginnt ("5aald"),
 * bleibt unangetastet.
 */
function grossAnfang(name: string) {
  return name ? name[0].toUpperCase() + name.slice(1) : name;
}

/* ---------------------------------------------------------------- Symbole */

const Ikone = {
  auge: (
    <><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <circle cx="10" cy="10" r="2.6" /></>
  ),
  vollbild: (
    <><path d="M7.5 2.5h-5v5" /><path d="M12.5 2.5h5v5" />
      <path d="M17.5 12.5v5h-5" /><path d="M2.5 12.5v5h5" /></>
  ),
  spieler: (
    <><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M2.5 12h15" /></>
  ),
  mittig: (
    // Fadenkreuz mit Ring - "wieder auf die ganze Karte".
    <><circle cx="10" cy="10" r="6" /><path d="M10 1.5v3M10 15.5v3" />
      <path d="M1.5 10h3M15.5 10h3" /></>
  ),
  person: (
    <><circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /></>
  ),
  schloss: (
    <><rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>
  ),
  muell: (
    <><path d="M3.5 5.5h13" /><path d="M8 5.5V3.5h4v2" />
      <path d="M5 5.5 6 17h8l1-11.5" /></>
  ),
  polygon: (
    <path d="M10 2.2 16.6 5.4 18.2 12.3 13.8 17.8H6.2L1.8 12.3 3.4 5.4Z" />
  ),
  rechteck: (
    <rect x="3" y="4.5" width="14" height="11" rx="2" />
  ),
  bild: (
    <><rect x="4.5" y="3" width="11" height="15" rx="1.5" />
      <path d="M7.5 3V1.8h5V3" /><path d="M7.5 8.5h5" /><path d="M7.5 12h5" /></>
  ),
};

function Werkzeugknopf({ titel, aktiv, gefahr, onClick, kind }: {
  titel: string; aktiv?: boolean; gefahr?: boolean;
  onClick: () => void; kind: React.ReactNode;
}) {
  const uebs = useT();
  return (
    <button type="button" onClick={onClick} title={uebs(titel)}
      aria-label={uebs(titel)}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        aktiv ? 'border-sky-500 bg-sky-500 text-white'
        : gefahr ? 'border-zinc-700 bg-zinc-900/90 text-rose-300 hover:border-rose-600'
        : 'border-zinc-700 bg-zinc-900/90 text-slate-300 hover:border-zinc-500 hover:text-white'}`}>
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind}
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ Seite */

/** Aus einem Adressteil einen Text machen - Listen und Leeres fallen weg. */
function nurText(wert: string | string[] | undefined): string | null {
  return typeof wert === 'string' && wert ? wert : null;
}

export default function KartenSeite(
  { searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  },
) {
  /*
   * Die Adresse vom Server, nicht aus dem Fenster.
   *
   * Vorher wurde `window.location.search` schon beim ersten Zeichnen gelesen.
   * Auf dem Server gibt es kein `window`: dort kam null heraus und damit die
   * dreispaltige Ansicht, im Browser stand die Kennung sofort da und damit
   * die zweispaltige. React fand zwei verschiedene Baeume vor und warf den
   * vom Server weg - "Hydration failed". Sichtbar wurde das erst auf dem
   * Entwicklungsserver, weil die fertige Fassung diesen Fehler still
   * behebt, statt ihn anzuzeigen.
   *
   * Next gibt die Adresse als Versprechen an die Seite. Ausgepackt ist sie
   * auf beiden Seiten dieselbe, und der Wert steht - wie gebraucht - schon
   * beim ersten Zeichnen fest.
   */
  const suchParameter = use(searchParams);

  // Nicht "t": in dieser Datei steht t schon fuer ein Team.
  const uebs = useT();
  const [istAdmin, setIstAdmin] = useState(false);
  /**
   * Wer schaut hier zu - und haengt an seinem Konto ein Epic-Konto?
   *
   * Damit erkennt die Teamliste das eigene Duo. Ein Pro soll sich selbst
   * finden, ohne fuenfzig Namen durchzugehen, und sich selbst umsetzen
   * duerfen, ohne dass der Betreiber daneben sitzt.
   */
  const [meinEpic, setMeinEpic] = useState<string | null>(null);
  const [meineRolle, setMeineRolle] = useState<string | null>(null);
  const [karte, setKarte] = useState<KartenInfo | null>(null);
  const [gespeicherte, setGespeicherte] = useState<GespeicherteKarte[]>([]);

  const [titel, setTitel] = useState('Neue Turnierkarte');
  /* Der Standardtitel ist sichtbar und gehoert deshalb uebersetzt -
     im Zustand steht der deutsche Quelltext, angezeigt wird die
     Fassung der gewaehlten Sprache. */
  const [spots, setSpots] = useState<Spot[]>([]);
  const [teams, setTeams] = useState<KartenTeam[]>([]);
  const [gesperrt, setGesperrt] = useState(false);

  const [orteSichtbar, setOrteSichtbar] = useState(true);
  const [vollbild, setVollbild] = useState(false);

  const [werkzeug, setWerkzeug] = useState<Form | null>(null);
  const [zieht, setZieht] = useState<{ von: Punkt; bis: Punkt } | null>(null);
  const [rohbau, setRohbau] = useState<Punkt[]>([]);
  const [zeiger, setZeiger] = useState<Punkt | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  // Waehrend gezogen wird, muessen die Werte sofort stimmen - Zustandswerte
  // stehen erst nach dem naechsten Durchlauf bereit.
  type Griff =
    | { art: 'flaeche'; start: Punkt }
    // Die gegenueberliegende Ecke wird beim Anfassen einmal festgehalten:
    // wuerde sie bei jeder Bewegung neu bestimmt, tauschten die Ecken ihre
    // Rollen und das Rechteck faellt in sich zusammen.
    | { art: 'ecke'; index: number; gegen: Punkt | null }
    // Die Karte selbst verschieben, wenn hineingezoomt wurde.
    | { art: 'karte'; start: Punkt; mitte: Punkt };
  const greiftRef = useRef<Griff | null>(null);
  const ziehtRef = useRef<{ von: Punkt; bis: Punkt } | null>(null);
  const gewaehltRef = useRef<string | null>(null);

  const [cups, setCups] = useState<Cup[]>([]);
  /** Ein Direktlink wird genau einmal ausgewertet. */
  const direktGesetzt = useRef(false);
  /* Beide Ladevorgaenge laufen nebeneinander; der Direktlink braucht beide,
     also legen sie ihr Ergebnis auch hier ab und rufen die Pruefung. */
  const cupsRef = useRef<Cup[]>([]);
  const gespeicherteRef = useRef<GespeicherteKarte[]>([]);
  /** Suchfeld ueber der Cup-Auswahl. */
  const [cupSuche, setCupSuche] = useState('');
  /** Welches Kartenbild wird gerade umbenannt? */
  /** Steht die Cup-Liste unter dem Suchfeld offen? */
  const [cupOffen, setCupOffen] = useState(false);
  /** Fuer welche Spiele des Spieltags diese Karte gilt. */
  const [spiele, setSpiele] = useState('');
  /** Gleitet der Ausschnitt gerade weich an sein Ziel? */
  const [benennt, setBenennt] = useState<string | null>(null);
  const [benenntTitel, setBenenntTitel] = useState('');
  const [cupId, setCupId] = useState('');
  const [fensterId, setFensterId] = useState('');
  const [laedtTeams, setLaedtTeams] = useState(false);
  /**
   * Wie viele Teams hoechstens geladen werden.
   *
   * Fuer eine Finalkarte zaehlt nur, wer weitergekommen ist. Bei der
   * Performance Evaluation sind das die besten fuenfzig der Vorrunde - laedt
   * man stattdessen hundert, stehen fuenfzig Teams auf der Karte, die dort
   * gar nicht antreten.
   */
  const [teamGrenze, setTeamGrenze] = useState(50);
  const [status, setStatus] = useState('');
  const [bildStand, setBildStand] = useState(0);   // erzwingt ein Neuladen
  const [bilder, setBilder] = useState<Kartenbild[]>([]);
  /** Leer heisst: die oeffentliche Fortnite-Karte. */
  const [bildId, setBildId] = useState('');
  const [neuerTitel, setNeuerTitel] = useState('');
  /**
   * Zeigt der Editor gerade eine veroeffentlichte Turnierkarte? Dann bleiben
   * die Spieler stehen. Im Vorlagenmodus (Admin -> Karten) sind sie leer,
   * nur die Formen kommen aus der gespeicherten Vorlage.
   */
  const [ausTurnier, setAusTurnier] = useState<string | null>(null);
  /**
   * Die Kennung aus der Adresse, schon beim ersten Zeichnen bekannt.
   *
   * "ausTurnier" wird erst gesetzt, wenn die gespeicherte Karte geladen ist -
   * bis dahin hielt die Formvorlage sich fuer zustaendig, holte die Formen des
   * Standardbildes und ueberschrieb damit die Karte, kaum dass sie da war.
   * Dieser Wert steht sofort fest und haelt die Vorlage so lange zurueck.
   */
  /*
   * Eine fremde Karte als Pause darunterlegen.
   *
   * Der Betreiber wollte den Screenshot einer fremden Landepunkt-Karte
   * einfuegen koennen, damit er nicht bei null anfaengt. Die Namen und
   * Positionen automatisch aus einem Bild zu lesen waere geraten - kleine,
   * stilisierte, teils verdeckte Schrift ergibt Treffer, die dann in seiner
   * Karte stehen. Deshalb dieser Weg: das Bild liegt massstabsgerecht unter
   * der Karte, er zieht seine Duos darueber ab und sieht dabei genau, wo die
   * Vorlage sie hatte. Nichts wird geraten, und es geht trotzdem schnell.
   *
   * Das Bild bleibt im Browser - es wird nirgends gespeichert und ist beim
   * Neuladen wieder fort.
   */
  const [pause, setPause] = useState<string | null>(null);
  const [pauseKlar, setPauseKlar] = useState(55);

  const [linkKarte, setLinkKarte] = useState<string | null>(
    () => nurText(suchParameter.id));
  const vorlageGeladen = useRef(false);
  /**
   * Hat der Admin die Formen gerade selbst angefasst?
   *
   * Nur dann gehoert der neue Stand in die Vorlage. Frueher wurde das an
   * "arbeitet er an einer Turnierkarte?" festgemacht - mit dem Ergebnis, dass
   * die Vorlage nie mitwuchs, weil er praktisch immer an einer Turnierkarte
   * arbeitet. Umgekehrt darf das blosse Oeffnen einer alten Karte die Vorlage
   * nicht auf deren Stand zurueckwerfen. Beides trennt nur ein Merker, den
   * ausschliesslich die Bearbeitungswege setzen.
   */
  const formenVomNutzer = useRef(false);
  /**
   * Hat der Admin am Inhalt der Karte etwas geaendert?
   *
   * Formen, Beschriftungen, Farben und vor allem die Verteilung der Teams.
   * Nur dann schreibt sich die Karte von selbst - ein blosses Laden oder
   * Umschalten darf keinen Schreibvorgang ausloesen.
   */
  const inhaltVomNutzer = useRef(false);
  /** Wann zuletzt von selbst gesichert wurde - fuer die ruhige Zeile. */
  const [selbstGesichert, setSelbstGesichert] = useState<number | null>(null);
  /**
   * Hat der Admin den Titel selbst getippt?
   *
   * Nur ein unberuehrter Titel darf sich beim Wechsel von Cup oder Spieltag
   * neu vorschlagen. Ein selbst gewaehlter Name gehoert ihm.
   */
  const titelVomNutzer = useRef(false);
  /* stelleWiederHer steht weiter unten; ueber ein Ref bleibt sie von hier
     aus erreichbar, ohne auf eine noch nicht deklarierte Bindung zu greifen. */
  const stelleWiederHerRef = useRef<
    ((w: string, b: string, l: GespeicherteKarte[],
      f?: Fenster & { region: string }) => void) | null>(null);

  /**
   * Ein Link von der Events-Seite auf einen bestimmten Spieltag.
   *
   * Gerufen von beiden Ladevorgaengen - Cups und gespeicherte Karten laufen
   * nebeneinander, und wer zuletzt fertig wird, loest aus. Der Merker sorgt
   * dafuer, dass es trotzdem genau einmal passiert.
   */
  function pruefeDirektlink(alleCups: Cup[], liste: GespeicherteKarte[]) {
    if (direktGesetzt.current || !alleCups.length) return;
    // Dieselbe Quelle wie oben - eine Adresse, eine Wahrheit.
    const ev = nurText(suchParameter.event);
    const w = nurText(suchParameter.window);
    if (!ev || !w) return;
    const c = alleCups.find((x) => Object.values(x.regionen)
      .some((l) => l.some((f) => f.eventId === ev && f.windowId === w)));
    if (!c) return;
    direktGesetzt.current = true;
    const f = Object.entries(c.regionen)
      .flatMap(([region, l]) => l.map((x) => ({ ...x, region })))
      .find((x) => x.windowId === w);
    setCupId(c.id);
    setFensterId(w);
    if (!titelVomNutzer.current) setTitel(kartenTitel(c.titel, f, uebs) || 'Neue Turnierkarte');
    if (f) stelleWiederHerRef.current?.(w, bildId, liste, f);
  }
  /**
   * Zu welchem Kartenbild gehoeren die Formen, die gerade im Editor liegen?
   *
   * Ohne diese Angabe konnte das Selbstspeichern die Formen des einen Bildes
   * unter dem anderen ablegen: beim Umschalten laeuft der Zustand dem noch
   * nicht geladenen Bild voraus, und wer schneller schaltet, als die Vorlage
   * geladen wird, ueberschrieb damit die Formen des vorigen Bildes.
   */
  const spotsFuer = useRef<string | null>(null);
  /**
   * Gehoeren die Formen im Editor zu einer gespeicherten Turnierkarte?
   *
   * Eine gespeicherte Karte ist ein Schnappschuss: sie haelt die Formen so
   * fest, wie sie beim Speichern aussahen. Wer spaeter auf einer anderen
   * Karte desselben Kartenbildes etwas umzeichnet, soll den alten Stand nicht
   * mitverbiegen. Solange dieser Wert gesetzt ist, wandert also nichts in die
   * Formvorlage zurueck.
   */
  /** Der Rahmen der Zeichenflaeche, einmal je Ziehbewegung gemessen. */
  const zugRahmen = useRef<DOMRect | null>(null);
  /** Der naechste Ausschnitt, der beim naechsten Bildaufbau gemalt wird. */
  const naechsterAusschnitt = useRef<{ z: number; m: Punkt } | null>(null);
  const malUhr = useRef<number | null>(null);
  /** Rueckmeldung nach dem Speichern: wo die Karte oeffentlich erscheint. */
  const [veroeffentlicht, setVeroeffentlicht] =
    useState<{ id: string; cup: string | null; spieltag: string | null } | null>(null);
  /** Gepflegte Spielerprofile - liefern die Anzeigenamen. */
  /**
   * Die gepflegten Spielerprofile.
   *
   * Nicht nur der Anzeigename: an derselben Stelle haengen Herkunft, X-Konto
   * und Wettkampfregion. Sie muessen hier bekannt sein, weil beim Speichern
   * eines Namens sonst alles Uebrige stillschweigend wegfiele.
   */
  const [profile, setProfile] = useState<Record<string, {
    anzeige?: string; land?: string; x?: string; region?: string;
    name?: string; namen?: string[];
  }>>({});
  /** Welche Flaggen liegen als Datei vor? */
  const [flaggen, setFlaggen] = useState<string[]>([]);
  /** Im Stift-Modus eingestellte Laender, je Spieler des Teams. */
  const [landEntwurf, setLandEntwurf] = useState<string[]>([]);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  /** Suchtext in der Teamliste - bei fuenfzig Duos findet man sonst nichts. */
  const [teamSuche, setTeamSuche] = useState('');
  const [entwurf, setEntwurf] = useState('');

  /** Vergroesserung und Bildausschnitt. Mitte gibt an, worauf gezoomt wird. */
  const [zoom, setZoom] = useState(1);
  const [mitte, setMitte] = useState<Punkt>({ x: 50, y: 50 });

  const flaeche = useRef<HTMLDivElement | null>(null);
  const bildRef = useRef<HTMLImageElement | null>(null);
  /** Die Ebene, die Bild, Formen und Beschriftungen traegt. */
  const ebeneRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const mitteRef = useRef<Punkt>({ x: 50, y: 50 });

  /**
   * Eine veroeffentlichte Turnierkarte ist erst nach einem Klick auf den Stift
   * bearbeitbar - so aendert niemand versehentlich etwas beim Anschauen.
   */
  const [bearbeitenAn, setBearbeitenAn] = useState(false);

  /*
   * Kam man geradewegs von der Eventseite auf diese eine Karte?
   *
   * Dann ist das keine Sitzung im Adminbereich, sondern der Blick auf einen
   * bestimmten Spieltag. Cup und Spieltag stehen fest, die Liste aller Karten
   * braucht niemand, und ein Stift, den man erst druecken muss, ist ein Klick
   * zu viel: wer als Betreiber ueber die Eventseite hierherkommt, will
   * loslegen. Die Seite sieht dann aus wie fuer jeden anderen - nur mit den
   * Werkzeugen rechts an der Karte.
   */
  const direkt = Boolean(linkKarte);

  const darfBauen = istAdmin && !gesperrt && (!ausTurnier || bearbeitenAn || direkt);

  /**
   * Das eigene Duo in der Teamliste - erkannt am verknuepften Epic-Konto.
   *
   * Gesucht wird ueber die Konto-Id, nicht ueber den Namen: Namen aendern
   * sich, und zwei Spieler koennen denselben tragen.
   */
  const meinTeam = useMemo(() => {
    if (!meinEpic) return null;
    return teams.find((t) => (t.ids ?? []).includes(meinEpic)) ?? null;
  }, [teams, meinEpic]);

  /**
   * Darf sich der Betrachter selbst auf der Karte setzen?
   *
   * Entscheidend ist die Rolle, nicht die Verknuepfung: ein Epic-Konto traegt
   * sich jeder selbst ins Profil ein, die Rolle "pro" vergibt der Betreiber.
   * Ein Admin geht ohnehin den normalen Weg und braucht das hier nicht.
   */
  const darfMichSetzen = Boolean(meinTeam) && !gesperrt && !istAdmin
    && (meineRolle === 'pro' || meineRolle === 'manager');

  /*
   * Der Stand wandert mit, ohne dass jemand neu laedt.
   *
   * Alles, was der Betreiber an einer Karte tut, soll bei allen ankommen, die
   * sie offen haben: ein Team umgesetzt oder heruntergenommen, eine Form neu
   * gezeichnet, verschoben oder geloescht, ein Team umbenannt, ein Titel
   * geaendert, die Karte gesperrt. Auch ein Pro, der sich selbst umsetzt,
   * kommt auf diesem Weg bei den anderen an.
   *
   * Uebernommen wird nur, was sich wirklich unterscheidet. Jede Form und jedes
   * Team, das gleich geblieben ist, behaelt sein altes Objekt - React sieht
   * dann keine Aenderung und zeichnet es nicht neu. Bleibt die ganze Karte
   * gleich, kommt dieselbe Liste zurueck und es passiert gar nichts. Ein
   * Leeren und Neubefuellen wuerde die Karte im Takt aufblitzen lassen.
   *
   * Waehrend der Betreiber baut, bleibt der Abgleich aus - sonst kaeme ihm
   * sein eigener, noch nicht gespeicherter Stand abhanden.
   */
  const TAKT_MS = 5_000;
  useEffect(() => {
    if (!ausTurnier || darfBauen) return;
    let lebt = true;
    let letzte = 0;

    /*
     * Einen frischen Stand uebernehmen - egal ob er ueber die offene
     * Verbindung kam oder ueber den Takt.
     *
     * Uebernommen wird nur, was sich wirklich unterscheidet: jede Form und
     * jedes Team, das gleich geblieben ist, behaelt sein altes Objekt, React
     * sieht dann keine Aenderung und zeichnet es nicht neu.
     */
    function uebernimm(j: {
      geaendert?: number; titel?: string; spiele?: string; bildId?: string;
      gesperrt?: boolean; spots?: Spot[]; teams?: KartenTeam[];
    }) {
      if (!j.spots || !j.teams) return;
      letzte = j.geaendert ?? letzte;

      const zusammen = <X extends { id: string }>(alt: X[], frisch: X[]) => {
        const anders = alt.length !== frisch.length;
        const neu = frisch.map((f) => {
          const a = alt.find((x) => x.id === f.id);
          return a && JSON.stringify(a) === JSON.stringify(f) ? a : f;
        });
        return anders || neu.some((x, i) => x !== alt[i]) ? neu : alt;
      };

      setSpots((alt) => zusammen(alt, j.spots!));
      setTeams((alt) => zusammen(alt, j.teams!));
      setTitel((alt) => (j.titel && j.titel !== alt ? j.titel : alt));
      setSpiele((alt) => (j.spiele !== undefined && j.spiele !== alt ? j.spiele : alt));
      setBildId((alt) => (j.bildId !== undefined && j.bildId !== alt ? j.bildId : alt));
      setGesperrt((alt) => (j.gesperrt !== undefined && j.gesperrt !== alt
        ? j.gesperrt : alt));
    }

    async function abgleichen() {
      try {
        const r = await fetch(
          `/api/turnier-karten?id=${encodeURIComponent(ausTurnier!)}`
          + `&nur=stand&seit=${letzte}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as {
          geaendert?: number; unveraendert?: boolean;
          titel?: string; spiele?: string; bildId?: string; gesperrt?: boolean;
          spots?: Spot[]; teams?: KartenTeam[];
        };
        if (!lebt || j.unveraendert || !j.spots || !j.teams) return;
        uebernimm(j);
      } catch { /* Netz weg: beim naechsten Takt wieder. */ }
    }

    /*
     * Die eigentliche Leitung: eine offene Verbindung, ueber die der Server
     * von sich aus schickt, sobald sich die Karte geaendert hat. Damit liegt
     * zwischen "der Betreiber nimmt ein Team von einer Form" und "alle anderen
     * sehen es" weniger als eine Sekunde - der Takt unten ist nur noch das
     * Netz fuer den Fall, dass die Verbindung abreisst.
     */
    let quelle: EventSource | null = null;
    try {
      quelle = new EventSource(
        `/api/turnier-karten/live?id=${encodeURIComponent(ausTurnier)}`);
      quelle.onmessage = (e) => {
        if (!lebt) return;
        try { uebernimm(JSON.parse(e.data)); } catch { /* halbe Nachricht */ }
      };
      // Bei einem Fehler verbindet die Ereignisquelle von selbst neu; bis
      // dahin haelt der Takt unten den Stand aktuell.
      quelle.onerror = () => {};
    } catch { /* kein EventSource: dann bleibt es beim Takt */ }

    void abgleichen();
    const uhr = setInterval(abgleichen, TAKT_MS);
    /*
     * Browser drosseln Zeitgeber in verborgenen Tabs bis auf einen Lauf je
     * Minute. Wer die Karte in einem anderen Fenster liegen hatte, saehe sonst
     * beim Zurueckkommen minutenlang einen alten Stand. Deshalb beim
     * Sichtbarwerden sofort nachfragen, statt den naechsten Takt abzuwarten.
     */
    const beimAnschauen = () => {
      if (document.visibilityState === 'visible') void abgleichen();
    };
    document.addEventListener('visibilitychange', beimAnschauen);
    return () => {
      lebt = false;
      clearInterval(uhr);
      quelle?.close();
      document.removeEventListener('visibilitychange', beimAnschauen);
    };
  }, [ausTurnier, darfBauen]);

  /*
   * Wie hoch ist die Karte gerade?
   *
   * Die Teamliste soll unten mit der Karte abschliessen. Eine feste Angabe in
   * Bildschirmhoehen trifft das nicht: die Karte ist quadratisch und damit so
   * hoch wie ihre Spalte breit ist, und das haengt am Fenster. Also gemessen
   * statt geraten. Unterhalb der breiten Ansicht stehen die Spalten
   * untereinander - dort gilt die Begrenzung nicht.
   */
  /*
   * Die aeusserste Farbe des Kartenbildes.
   *
   * Im Breitbild liegt die Karte in einer viel breiteren Flaeche. Steht dort
   * irgendein Blau, sieht man die Kante der Karte als Absatz. Gemessen wird
   * deshalb der Eckpunkt des tatsaechlich geladenen Bildes - bei der grossen
   * Karte ist das das tiefe Wasser, bei einer Reload-Insel deren eigener
   * Rand. Damit geht die Karte ohne sichtbare Grenze in ihren Grund ueber.
   */
  const [randFarbe, setRandFarbe] = useState('#084687');

  const messeRandFarbe = useCallback(() => {
    const img = bildRef.current;
    if (!img || !img.naturalWidth) return;
    try {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      // Nur der eine Eckpunkt - mehr braucht es nicht, und ein ganzes Bild
      // in den Speicher zu zeichnen waere fuer eine Farbe zu viel.
      g.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
      const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
      setRandFarbe(`rgb(${r}, ${gr}, ${b})`);
    } catch { /* Bild aus fremder Quelle: dann bleibt die Voreinstellung. */ }
  }, []);

  const kartenSpalte = useRef<HTMLDivElement | null>(null);
  const [kartenHoehe, setKartenHoehe] = useState<number | null>(null);

  useEffect(() => {
    const el = kartenSpalte.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const messen = () => {
      const breit = window.matchMedia('(min-width: 1024px)').matches;
      const h = el.getBoundingClientRect().height;
      setKartenHoehe(breit && h > 200 ? Math.round(h) : null);
    };
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    window.addEventListener('resize', messen);
    return () => { beobachter.disconnect(); window.removeEventListener('resize', messen); };
  }, [vollbild]);

  /** Wo das eigene Duo gerade steht - oder nirgends. */
  const meinSpot = useMemo(
    () => (meinTeam ? spots.find((s) => s.teams.includes(meinTeam.id)) ?? null : null),
    [spots, meinTeam]);

  /**
   * Die Karte, die ueber einen Link geoeffnet wurde, und ihre Geschwister.
   *
   * Ein Spieltag kann auf zwei Inseln laufen - dann gehoeren zwei Karten
   * dazu. Wer von der Eventseite kommt, landet auf einer davon und soll von
   * hier aus zur anderen wechseln koennen, ohne den Weg ueber die Eventseite
   * noch einmal zu gehen.
   */
  const offeneKarte = useMemo(
    () => (linkKarte ? gespeicherte.find((k) => k.id === linkKarte) ?? null : null),
    [linkKarte, gespeicherte]);

  const geschwister = useMemo(() => {
    if (!offeneKarte?.windowId) return [];
    return gespeicherte.filter((k) => k.eventId === offeneKarte.eventId
      && k.windowId === offeneKarte.windowId);
  }, [offeneKarte, gespeicherte]);

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json())
      .then((j) => {
        setIstAdmin(j.isAdmin === true);
        setMeinEpic(typeof j.epicId === 'string' ? j.epicId : null);
        setMeineRolle(typeof j.rolle === 'string' ? j.rolle : null);
      }).catch(() => {});
    fetch('/api/fortnite-map').then((r) => r.json()).then(setKarte).catch(() => {});
    // "alle" statt "standard": der Standardfilter laesst nur Reload, Cash
    // Cups, Finals und Divisions durch. Ein Turnier wie die Override Series
    // faellt darunter als "sonstige" heraus und war hier gar nicht waehlbar -
    // fuer eine Karte soll aber jeder Cup infrage kommen.
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json())
      .then((d) => {
        const alle: Cup[] = d.cups ?? [];
        setCups(alle);
        cupsRef.current = alle;
        pruefeDirektlink(alle, gespeicherteRef.current);
      }).catch(() => {});
    fetch('/api/spieler-profile').then((r) => r.json())
      .then((j) => setProfile(j.profile ?? {})).catch(() => {});
    fetch('/api/karten-bild').then((r) => r.json())
      .then((d) => setBilder(d.karten ?? [])).catch(() => {});
    fetch('/api/flaggen').then((r) => r.json())
      .then((j) => setFlaggen(j.flaggen ?? [])).catch(() => {});
    fetch('/api/turnier-karten').then((r) => r.json())
      .then((d) => {
        const liste: GespeicherteKarte[] = d.karten ?? [];
        setGespeicherte(liste);
        gespeicherteRef.current = liste;
        pruefeDirektlink(cupsRef.current, liste);
        // Nur mit Link auf eine bestimmte Karte wird eine Turnierkarte samt
        // Spielern geoeffnet. Ohne Link startet der Editor leer und holt sich
        // gleich die Formvorlage - die Spielerzuordnung faengt jedesmal neu an.
        const gesucht = nurText(suchParameter.id);
        if (!gesucht) { vorlageGeladen.current = false; return; }
        const k = liste.find((x) => x.id === gesucht);
        // Nichts gefunden: dann darf die Vorlage wieder uebernehmen.
        if (!k) { setLinkKarte(null); vorlageGeladen.current = false; return; }
        if (k) {
          const gehoben = migriereZuordnung(k);
          setTitel(k.titel); setSpots(gehoben.spots); setTeams(gehoben.teams);
          setGesperrt(k.gesperrt ?? false);
          setBildId(k.bildId ?? '');
          setSpiele(k.spiele ?? '');
          setAusTurnier(k.id);
          /*
           * Cup und Spieltag mitsetzen - sonst speichert die Karte nicht.
           *
           * Das Selbstspeichern haengt an "fensterId": ohne die weiss es
           * nicht, zu welchem Spieltag der Stand gehoert, und laeuft gar
           * nicht erst an. Gesetzt wurde sie bisher nur beim Weg ueber Cup
           * und Spieltag im Adminbereich. Wer ueber die Eventseite direkt auf
           * eine Karte klickte, konnte also aendern, was er wollte - es kam
           * nie an, und niemand sonst sah etwas davon.
           */
          if (k.windowId) setFensterId(k.windowId);
          if (k.cupId) setCupId(k.cupId);
          // Hier kommen die Formen aus der Turnierkarte, nicht aus der Vorlage.
          vorlageGeladen.current = true;
        }
      }).catch(() => {});
  }, []);

  // Formvorlage zum gewaehlten Kartenbild holen. Jede Karte hat ihre eigenen
  // Spots - auf einer Reload-Insel liegen andere als auf der grossen Karte.
  useEffect(() => {
    // Eine Turnierkarte bringt ihre Formen selbst mit - und wer ueber einen
    // Link kommt, bekommt sie gleich, nicht erst die Vorlage darueber.
    if (ausTurnier || linkKarte) return;
    let weg = false;
    const schluessel = bildId || 'fortnite-karte';
    fetch(`/api/karten-vorlage?bild=${encodeURIComponent(schluessel)}`)
      .then((r) => r.json())
      .then((d) => {
        if (weg) return;
        // Die Vorlage kennt nur die Formen. Eine schon eingetragene Zuordnung
        // bleibt erhalten, sofern es die Form noch gibt - so kann eine spaet
        // eintreffende Vorlage nicht loeschen, was gerade erst gesetzt wurde.
        setSpots((vorher) => {
          const drauf = new Map(vorher.map((sp) => [sp.id, sp.teams]));
          return (d.spots ?? []).map((sp: Spot) => ({
            ...sp, teams: drauf.get(sp.id) ?? [],
          }));
        });
        setGewaehlt(null); gewaehltRef.current = null;
        spotsFuer.current = schluessel;
        vorlageGeladen.current = true;
      })
      .catch(() => { vorlageGeladen.current = true; });
    return () => { weg = true; };
  }, [bildId, ausTurnier, linkKarte]);

  // Aenderungen an den Formen von selbst sichern - kurz abwarten, damit nicht
  // jeder Zwischenschritt einer Bewegung geschrieben wird.
  useEffect(() => {
    if (!istAdmin || !vorlageGeladen.current) return;

    // Nur ein eigener Eingriff darf die Vorlage fortschreiben. Ohne diese
    // Zeile wuerde jedes Oeffnen einer Karte ihre Formen zur neuen Vorlage
    // machen - und der Stand von letzter Woche saesse wieder da.
    if (!formenVomNutzer.current) return;
    const schluessel = bildId || 'fortnite-karte';
    // Nur sichern, wenn die Formen wirklich zu diesem Kartenbild gehoeren.
    // Direkt nach dem Umschalten liegen noch die des vorigen im Editor - die
    // hier zu schreiben, wuerde die Formen des neuen Bildes ausloeschen.
    if (spotsFuer.current !== schluessel) return;

    // Eine leere Liste wird nie gesichert.
    //
    // Ein leerer Zustand entsteht fast immer aus einem Zwischenschritt - eine
    // Vorlage, die noch laedt, eine Karte, die gerade wechselt. Ihn zu
    // schreiben hat schon einmal einen ganzen Satz Formen geloescht. Der Preis
    // ist gering: wer wirklich alles loeschen will, dem bleibt die letzte Form
    // stehen, bis er etwas Neues zeichnet.
    if (!spots.length) return;
    const uhr = setTimeout(() => {
      formenVomNutzer.current = false;
      fetch('/api/karten-vorlage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bild: schluessel, spots }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(uhr);
  }, [spots, bildId, istAdmin]);

  // Breitbild an der Fenstertaste ausrichten und mit Escape verlassen.
  useEffect(() => {
    if (!vollbild) return;
    const zu = (e: KeyboardEvent) => { if (e.key === 'Escape') setVollbild(false); };
    window.addEventListener('keydown', zu);
    return () => window.removeEventListener('keydown', zu);
  }, [vollbild]);

  const cup = cups.find((c) => c.id === cupId);
  /**
   * Die Cups fuer die Auswahl: gesucht, sortiert und mit Datum beschriftet.
   *
   * Ohne Datum am Namen laesst sich ein Turnier nicht wiederfinden - mehrere
   * heissen gleich und unterscheiden sich nur im Zeitraum. Sortiert wird nach
   * dem, was am ehesten gebraucht wird: erst was laeuft, dann was bevorsteht,
   * zuletzt das Vergangene.
   */
  const cupListe = useMemo(() => {
    const tag = (ms: number) => new Date(ms)
      .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

    const aufbereitet = cups.map((c) => {
      const alleFenster = Object.values(c.regionen).flat();
      const termine = alleFenster.map((f) => f.begin).sort((a, b) => a - b);
      const von = termine[0] ?? 0;
      const bis = termine[termine.length - 1] ?? 0;
      // Ob ein Cup laeuft, sagt der Spieltag selbst - die Uhrzeit muss dafuer
      // nicht waehrend des Zeichnens abgefragt werden.
      const laeuft = alleFenster.some((f) => f.status === 'live');
      const vorbei = alleFenster.length > 0 && alleFenster.every((f) => f.status === 'vorbei');
      const zeitraum = !von ? '' : von === bis ? tag(von) : `${tag(von)}–${tag(bis)}`;
      return {
        cup: c,
        laeuft, vorbei, von, bis,
        // Der Punkt vorn zeigt auf einen Blick, was gerade laeuft.
        etikett: `${laeuft ? '● ' : ''}${c.titel}${zeitraum ? ` · ${zeitraum}` : ''}`,
        heu: `${c.titel} ${c.id} ${c.art} ${zeitraum}`.toLowerCase(),
      };
    });

    const q = cupSuche.trim().toLowerCase();
    const gefiltert = q ? aufbereitet.filter((x) => q.split(/\s+/).every(
      (w) => x.heu.includes(w))) : aufbereitet;

    return gefiltert.sort((a, b) => {
      // Laufende zuerst, dann Kommendes nach Naehe, zuletzt Vergangenes.
      const rang = (x: typeof a) => (x.laeuft ? 0 : x.vorbei ? 2 : 1);
      if (rang(a) !== rang(b)) return rang(a) - rang(b);
      return rang(a) === 2 ? b.bis - a.bis : a.von - b.von;
    });
  }, [cups, cupSuche]);

  /** Wie der gewaehlte Cup im Suchfeld steht, solange nicht getippt wird. */
  const gewaehlterCupText = useMemo(
    () => cupListe.find((x) => x.cup.id === cupId)?.etikett
      ?? cups.find((c) => c.id === cupId)?.titel ?? '',
    [cupListe, cups, cupId]);

  const fenster = useMemo(() => {
    if (!cup) return [];
    return Object.entries(cup.regionen).flatMap(([region, liste]) =>
      liste.map((f) => ({ ...f, region })));
  }, [cup]);

  /**
   * Finaltage dieses Cups, zu denen es noch keine Karte gibt.
   *
   * Sie standen bisher nirgends: wer sie anlegen wollte, musste Cup und
   * Spieltag von Hand zusammensuchen. Hier stehen sie neben den fertigen,
   * mit demselben Weg dorthin wie von der Events-Seite.
   *
   * Ein Finale ist, was Epic so kennzeichnet - und sonst die letzte Runde
   * eines Kalendertages. Beim Performance Cup traegt Epic nichts ein,
   * obwohl "Event 4 · Round 2" sehr wohl das Finale ist.
   */
  const offeneFinals = useMemo(() => {
    /*
     * Ueber alle Cups, nicht nur den gerade gewaehlten.
     *
     * Sonst sieht man erst dann, dass eine Karte fehlt, wenn man den Cup
     * ohnehin schon herausgesucht hat - die Uebersicht "was steht an" gibt
     * es damit gar nicht. Gezeigt wird, was noch kommt oder gerade war;
     * Finaltage aus dem letzten Monat brauchen keine Karte mehr.
     */
    const alle = cups
      // Dieselbe Auswahl wie in der Statistik: FNCS Division 1, die
      // Performance Cups und der EWC. Ohne sie stuenden hier neunzig
      // Eintraege, darunter Division 5 und jeder Ranked Cup - Turniere,
      // fuer die ohnehin nie eine Karte entsteht.
      .filter((c) => istGrossesTurnier(c.titel))
      .flatMap((c) => Object.entries(c.regionen)
        .flatMap(([region, liste]) => liste.map((f) => ({ ...f, region,
          cupTitel: c.titel }))));
    // Was vorbei ist, braucht keine Karte mehr. Epics Status statt der
    // eigenen Uhr: waehrend des Zeichnens darf die Zeit nicht abgefragt
    // werden, und "vorbei" sagt genau das Richtige.
    const fenster = alle.filter((f) => f.status !== 'vorbei');
    if (!fenster.length) return [];
    const proTag = new Map<string, typeof fenster>();
    for (const f of fenster) {
      const schluessel = `${f.region}|${new Date(f.begin).toDateString()}`;
      const liste = proTag.get(schluessel);
      if (liste) liste.push(f); else proTag.set(schluessel, [f]);
    }
    const finals: typeof fenster = [];
    for (const liste of proTag.values()) {
      liste.sort((a, b) => a.begin - b.begin);
      liste.forEach((f, i) => {
        if (f.istFinale || (liste.length > 1 && i === liste.length - 1)) finals.push(f);
      });
    }
    const schonDa = new Set(gespeicherte.map((k) => k.windowId ?? ''));
    return finals
      .filter((f) => KARTEN_REGIONEN.includes(f.region) && !schonDa.has(f.windowId))
      .sort((a, b) => a.begin - b.begin);
  }, [cups, gespeicherte]);

  /** Welche gespeicherte Karte zuletzt von selbst geladen wurde. */
  const zuletztGeholt = useRef<string | null>(null);
  /**
   * Passt eine gespeicherte Karte auf die Auswahl, kommt sie samt Spielern
   * zurueck.
   *
   * Ohne das faengt man bei jedem Oeffnen wieder bei null an und muss alle
   * Teams erneut auf die Formen ziehen, obwohl die Zuordnung laengst
   * gespeichert ist. Verglichen werden Turnier, Spieltag und die Spielangabe -
   * stimmen alle drei, ist es dieselbe Karte.
   *
   * Passt keine, faellt die Zuordnung weg: sonst stuenden beim Wechsel auf
   * einen anderen Spieltag noch die Teams des vorigen auf der Insel. Die
   * Formen bleiben dabei stehen, die gehoeren zum Kartenbild.
   *
   * Bewusst von Hand aufgerufen statt in einem Effekt: an einem Effekt haengt
   * ein zweites Zeichnen, und ausgeloest wird es ohnehin nur durch genau drei
   * Bedienschritte.
   */
  function stelleWiederHer(
    windowId: string, bildKennung: string, liste: GespeicherteKarte[],
    // Beim Cupwechsel steht der neue Cup noch nicht im Zustand - dann gehoert
    // "fenster" noch zum vorigen und die Suche ginge ins Leere. Wer das
    // Fenster schon hat, reicht es durch.
    bekannt?: Fenster & { region: string },
  ) {
    if (ausTurnier) return;
    const f = bekannt ?? fenster.find((x) => x.windowId === windowId);
    if (!f) return;

    // Unterschieden wird ueber das Kartenbild: zu einem Spieltag kann es je
    // Insel eine Karte geben, aber keine zwei auf derselben. Die zuletzt
    // geaenderte gewinnt - aeltere Eintraege tragen noch andere Kennungen.
    const treffer = liste
      .filter((k) => k.eventId === f.eventId && k.windowId === f.windowId
        && (k.bildId ?? '') === bildKennung)
      .sort((a, b) => (b.geaendert ?? 0) - (a.geaendert ?? 0))[0];

    if (!treffer) {
      if (zuletztGeholt.current !== null) {
        zuletztGeholt.current = null;
        setSpots((alt) => alt.map((sp) => (sp.teams.length ? { ...sp, teams: [] } : sp)));
        setTeams([]);
        setGewaehlt(null); gewaehltRef.current = null;
      }
      return;
    }
    if (treffer.id === zuletztGeholt.current) return;

    zuletztGeholt.current = treffer.id;

    // Formen und Zuordnung kommen so zurueck, wie sie gespeichert wurden.
    //
    // Die gespeicherte Karte ist ein Schnappschuss jenes Tages. Haette sie nur
    // die Zuordnung mitgebracht und die Formen aus der Vorlage genommen,
    // saehe eine alte Karte ploetzlich anders aus, sobald man auf einer
    // neueren Karte desselben Bildes eine Form verschiebt.
    //
    // Die Formvorlage bleibt davon unberuehrt: sie ist die Startaufstellung
    // fuer neue Karten, nicht der Speicher der alten.
    setGewaehlt(null); gewaehltRef.current = null;
    const gehoben = migriereZuordnung(treffer);
    setSpots(gehoben.spots);
    setTeams(gehoben.teams);
    setStatus(`Gespeicherte Zuordnung von ${new Date(treffer.geaendert)
      .toLocaleString('de-DE', { day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit' })} geladen`);
  }

  /**
   * Die Vorrunde zum gewaehlten Fenster, sofern es eine gibt.
   *
   * Epic nummeriert in der Kennung mit: "…_Event1Round2_EU" ist die zweite
   * Runde desselben Spieltags, "…_Event1Round1_EU" die erste. Wer eine
   * Finalkarte vorbereiten will, braucht das Feld der Vorrunde - das Finale
   * selbst hat vor seinem Beginn noch keine Zeile.
   */
  /**
   * Ein Cup wurde gewaehlt: gleich auf sein Finale stellen.
   *
   * Vorher blieb der Spieltag leer und musste jedes Mal von Hand nachgezogen
   * werden - bei Karten, die ohnehin fast immer fuer ein Finale entstehen,
   * ein Handgriff zu viel. Hat der Cup kein Finale, bleibt es beim leeren
   * Feld, damit niemand unbemerkt auf einer Open-Runde landet.
   */
  function cupGewaehlt(gewaehlt: Cup) {
    setCupId(gewaehlt.id);
    const f = finaleFenster(gewaehlt);
    setFensterId(f?.windowId ?? '');
    if (!titelVomNutzer.current) setTitel(kartenTitel(gewaehlt.titel, f, uebs) || 'Neue Turnierkarte');
    if (f) stelleWiederHer(f.windowId, bildId, gespeicherte, f);
  }

  /**
   * Wie lange nach Cup-Ende noch von selbst nachgeladen wird.
   *
   * Danach steht das Ergebnis fest und jede weitere Abfrage ginge ins Leere.
   * Wer dann doch noch einmal sehen will, nimmt "Teams laden" von Hand.
   */
  const NACHLAUF_MS = 30 * 60 * 1000;
  /** Wie oft nachgeladen wird, solange der Spieltag noch nicht laeuft. */
  const RUHIG_MS = 5 * 60 * 1000;
  /** Waehrend des Spieltags - da wechseln die besten Fuenfzig staendig. */
  const SCHNELL_MS = 30 * 1000;

  useEffect(() => { stelleWiederHerRef.current = stelleWiederHer; });

  /**
   * Die Runde, aus der sich die Teilnehmer dieses Spieltags qualifizieren.
   *
   * Frueher wurde dafuer an der Kennung herumgeschnitten: aus "…Round2"
   * wurde "…Round1". Das traf genau ein Namensschema. Beim Divisional Cup
   * heisst das Finale "…_Week2Final_EU" und seine Vorrunde "…_Event2_EU" -
   * dort fand die Regel nichts, und die Karte blieb leer, obwohl die besten
   * Fuenfzig laengst feststanden.
   *
   * Massgeblich ist deshalb die Zeit statt der Name: die letzte Runde
   * derselben Region, die vor dieser hier begonnen hat. Das stimmt fuer
   * jedes Schema, das Epic benutzt - Event/Round, Week/Final, Qual/Round
   * oder schlicht Day 1 bis 4 -, ohne dass eine Kennung geraten werden muss.
   */
  const vorrundeZu = useCallback((windowId: string) => {
    const dieser = fenster.find((x) => x.windowId === windowId);
    if (!dieser) return null;
    const davor = fenster
      .filter((x) => x.region === dieser.region && x.begin < dieser.begin)
      .sort((a, b) => b.begin - a.begin);
    return davor[0] ?? null;
  }, [fenster]);

  const ladeTeams = useCallback(async () => {
    const f = fenster.find((x) => x.windowId === fensterId);
    if (!f) return;
    setLaedtTeams(true); setStatus('');
    try {
      const grenze = Math.max(1, Math.min(500, teamGrenze));
      const holen = async (ev: string, w: string) => {
        const a = await fetch(
          `/api/cup-leaderboard?event=${encodeURIComponent(ev)}`
          + `&window=${encodeURIComponent(w)}&limit=${grenze}`);
        const b = await a.json();
        if (!a.ok) throw new Error(b.error ?? 'Leaderboard nicht ladbar');
        return (b.entries ?? []) as Array<{
          rank: number; players?: Array<{ name: string; id?: string }>;
        }>;
      };

      let roh = await holen(f.eventId, f.windowId);
      let woher = '';

      // Hat das Finale noch keine eigene Zeile, treten die Qualifizierten der
      // Vorrunde an ihre Stelle - damit laesst sich die Karte vorbereiten,
      // bevor gespielt wird. Sobald Epic echte Finaldaten liefert, gilt nur
      // noch die eigene Zeile; die Vorbelegung faellt dann von selbst weg.
      if (!roh.length) {
        const vor = vorrundeZu(f.windowId);
        if (vor) {
          roh = await holen(vor.eventId, vor.windowId);
          if (roh.length) woher = ` — die besten ${roh.length} der Vorrunde`;
        }
      }
      const liste: KartenTeam[] = roh.map((e, i) => {
        const ids = (e.players ?? []).map((p) => p.id ?? '');
        return {
          // Nicht der Platz - der wandert beim naechsten Laden.
          id: kontoSchluessel(ids) ?? `t${e.rank}`,
          // Gepflegte Anzeigenamen gehen vor dem Turnierauftritt.
          spieler: (e.players ?? []).map((p) => profile[p.id ?? '']?.anzeige || p.name),
          ids,
          farbe: FARBEN[i % FARBEN.length],
        };
      }).filter((t) => t.spieler.length);
      setTeams(liste);
      setStatus(liste.length
        ? `${liste.length} Teams geladen${woher}`
        : uebs('Noch keine Ergebnisse'));
    } catch (e) {
      setStatus((e as Error).message);
    } finally { setLaedtTeams(false); }
  }, [fenster, fensterId, profile, teamGrenze, vorrundeZu]);

  /**
   * Die Teamliste erneuert sich waehrend des Cups von selbst.
   *
   * Solange die Qualifikation laeuft, wechseln die besten Fuenfzig staendig -
   * eine Karte, die beim Stand von vor drei Stunden stehenbleibt, zeigt die
   * falschen Leute. Alle fuenfzehn Minuten wird deshalb nachgeholt, und eine
   * halbe Stunde nach Cup-Ende hoert das auf; ab da aendert sich nichts mehr.
   *
   * Die Zuordnung ueberlebt das: sie haengt an den Epic-Konten, nicht am
   * Platz. Wer aus den besten Fuenfzig faellt, verschwindet mit seiner Form -
   * genau so ist es gewollt.
   *
   * Eine gesperrte Karte bleibt unberuehrt. Das Schloss heisst "hier soll
   * sich nichts mehr ruehren", und das gilt auch fuer diesen Takt.
   */
  const ladeTeamsRef = useRef(ladeTeams);
  // Waehrend des Zeichnens darf kein Ref beschrieben werden - deshalb in
  // einem eigenen Effekt nachgefuehrt.
  useEffect(() => { ladeTeamsRef.current = ladeTeams; }, [ladeTeams]);
  const teamsDa = teams.length > 0;
  useEffect(() => {
    if (!fensterId || gesperrt) return;
    const f = fenster.find((x) => x.windowId === fensterId);
    if (!f) return;
    // Ohne bekannte Endzeit ist der Spieltag ein nachgetragener aus der
    // Vergangenheit - da gibt es nichts mehr nachzuladen.
    if (typeof f.end !== 'number') return;
    const schluss = f.end + NACHLAUF_MS;
    if (Date.now() >= schluss) return;

    // Steht noch nichts in der Liste, sofort einmal holen. Eine Karte, die
    // ueber den Link geoeffnet wird, soll nicht erst nach fuenf Minuten
    // Spieler zeigen.
    if (!teamsDa) ladeTeamsRef.current();

    // Kein fester Takt: vor dem Anpfiff aendert sich die Qualifikation nur
    // langsam, waehrend des Cups im Minutentakt. Gemessen wird am Beginn des
    // Spieltags, nicht an der Wanduhr - dann stimmt es fuer NAC und ME
    // genauso wie fuer EU, ohne dass irgendwo eine Uhrzeit einprogrammiert
    // ist.
    let uhr: ReturnType<typeof setTimeout>;
    const runde = () => {
      const jetzt = Date.now();
      if (jetzt >= schluss) return;
      const abstand = jetzt >= f.begin ? SCHNELL_MS : RUHIG_MS;
      uhr = setTimeout(() => { ladeTeamsRef.current(); runde(); },
        Math.min(abstand, Math.max(1000, schluss - jetzt)));
    };
    runde();
    return () => clearTimeout(uhr);
  }, [fensterId, fenster, gesperrt, teamsDa, NACHLAUF_MS, SCHNELL_MS, RUHIG_MS]);

  /**
   * Ueber einen Link direkt auf einen Spieltag.
   *
   * Von der Events-Seite fuehrt zu jedem Finale ein Weg hierher, auch wenn
   * noch keine Karte gespeichert ist: dann steht die Formvorlage bereit und
   * die Teamliste holt sich selbst. So muss niemand erst eine Karte anlegen,
   * damit sich jemand eintragen kann.
   */

  /**
   * Die Teamliste, gefiltert nach dem Suchtext.
   *
   * Gesucht wird ueber dieselbe Namensnormalisierung wie sonst auch:
   * Schreibweisen mit Ziffern statt Buchstaben, Orgtags davor und
   * Sonderzeichen sollen nicht dazwischenkommen. Wer "zucookies" tippt,
   * findet auch "RiiX ZuCookies!".
   *
   * Die Reihenfolge bleibt, wie sie ist - sie entspricht der Platzierung.
   */
  const sichtbareTeams = useMemo(() => {
    const q = teamSuche.trim();
    if (!q) return teams;
    const teile = q.split(/[\s+]+/).map(namensSchluessel).filter(Boolean);
    if (!teile.length) return teams;
    return teams.filter((t) => {
      const heu = t.spieler.map(namensSchluessel).join(' ');
      const auchGefaltet = gefaltet(heu);
      return teile.every((w) => heu.includes(w) || auchGefaltet.includes(gefaltet(w)));
    });
  }, [teams, teamSuche]);

  /** Mausposition in Prozent auf dem Kartenbild. */
  const pos = useCallback((e: { clientX: number; clientY: number }): Punkt => {
    // Waehrend eines Zuges den gemerkten Rahmen nehmen.
    //
    // getBoundingClientRect zwingt den Browser, das Layout sofort neu zu
    // berechnen. Direkt nach dem Setzen des Ausschnitts gelesen, entsteht
    // bei jeder Mausbewegung ein Lesen-nach-Schreiben - genau das laesst
    // eine Ziehbewegung zittern. Der Rahmen aendert sich waehrend des
    // Ziehens ohnehin nicht, also wird er einmal gemerkt.
    //
    // Aber wirklich nur dann: laeuft gerade kein Zug, wird frisch gemessen.
    // Sonst koennte ein liegengebliebener Rahmen aus einer frueheren
    // Bewegung die Umrechnung verfaelschen - etwa beim Ablegen eines Teams,
    // das gar nicht auf der Karte begonnen hat.
    const imZug = greiftRef.current !== null || ziehtRef.current !== null;
    const r = (imZug && zugRahmen.current) || flaeche.current!.getBoundingClientRect();
    // Der sichtbare Ausschnitt haengt an Vergroesserung und Mittelpunkt -
    // ohne die Umrechnung landeten Klicks im Zoom an der falschen Stelle.
    const z = zoomRef.current, m = mitteRef.current;
    const sichtbar = 100 / z;
    const links = m.x - sichtbar / 2, oben = m.y - sichtbar / 2;
    return {
      x: Math.min(100, Math.max(0, links + ((e.clientX - r.left) / r.width) * sichtbar)),
      y: Math.min(100, Math.max(0, oben + ((e.clientY - r.top) / r.height) * sichtbar)),
    };
  }, []);

  /**
   * Den Blickpunkt so einfangen, dass der Ausschnitt nicht ueber den Bildrand
   * hinauslaeuft. Bei voller Ansicht immer die Mitte, sonst rutscht die Karte weg.
   */
  const begrenze = useCallback((z: number, ziel: Punkt): Punkt => {
    if (z === 1) return { x: 50, y: 50 };
    const sichtbar = 100 / z;
    return {
      x: Math.min(100 - sichtbar / 2, Math.max(sichtbar / 2, ziel.x)),
      y: Math.min(100 - sichtbar / 2, Math.max(sichtbar / 2, ziel.y)),
    };
  }, []);

  /**
   * Den Ausschnitt unmittelbar auf das Element schreiben, ohne React.
   *
   * Beim Ziehen kommen Mausbewegungen schneller herein, als ein Neuzeichnen
   * der ganzen Karte mit allen Formen und Beschriftungen dauert - deshalb
   * wirkte das Verschieben abgehackt. Waehrend des Ziehens wird der Ausschnitt
   * darum direkt gesetzt und erst beim Loslassen in den Zustand uebernommen.
   */
  const malAusschnitt = useCallback((z: number, m: Punkt) => {
    // Die Maus meldet sich oefter als der Bildschirm neu zeichnet. Jede
    // Meldung sofort zu malen bringt nichts und kostet - gemalt wird darum
    // einmal je Bildaufbau, immer mit dem zuletzt gemeldeten Stand.
    naechsterAusschnitt.current = { z, m };
    if (malUhr.current !== null) return;
    malUhr.current = requestAnimationFrame(() => {
      malUhr.current = null;
      const naechst = naechsterAusschnitt.current;
      const el = ebeneRef.current;
      if (!naechst || !el) return;
      // Beim Ziehen darf nichts nachlaufen - der Ausschnitt haengt an der Maus.
      el.style.transition = 'none';
      // Nur fuer die Dauer des Ziehens eine eigene Zeichenschicht.
      //
      // Sie macht das Schieben fluessig, weil der Browser das Fertigbild nur
      // verschiebt. Genau deshalb bleibt sie aber nicht dauerhaft an: ein
      // einmal gerastertes Bild wird beim Hineinzoomen mitvergroessert, und
      // Schrift wie Formkanten werden unscharf. Nach dem Loslassen faellt die
      // Schicht weg und alles wird in voller Schaerfe neu gezeichnet.
      el.style.willChange = 'transform';
      el.style.transform =
        `scale(${naechst.z}) translate(${50 / naechst.z - naechst.m.x}%, `
        + `${50 / naechst.z - naechst.m.y}%)`;
    });
  }, []);

  /** Vergroessern und dabei den Punkt unter dem Zeiger festhalten. */
  const zoomeAuf = useCallback((neuerZoom: number, punkt?: Punkt) => {
    const z = Math.max(1, Math.min(6, neuerZoom));
    const vorher = zoomRef.current;
    zoomRef.current = z;
    // Beim reinen Verschieben aendert sich die Vergroesserung nicht - dann
    // waere ein Zustandswechsel ein Neuzeichnen ohne jeden Anlass.
    if (z !== vorher) setZoom(z);
    const begrenzt = begrenze(z, z === 1 ? { x: 50, y: 50 } : (punkt ?? mitteRef.current));
    mitteRef.current = begrenzt;
    setMitte(begrenzt);
  }, [begrenze]);

  /**
   * Zoomen und dabei den Punkt unter dem Zeiger festhalten.
   *
   * Bisher wurde der Punkt unter dem Zeiger in die Bildmitte gezogen. Dadurch
   * wanderte die Karte bei jedem Radstoss unter der Maus weg und man landete
   * nie dort, wo man hinwollte. Jetzt bleibt der angepeilte Ort genau unter
   * dem Zeiger stehen, wie bei einer Landkarte.
   */
  const zoomeAmZeiger = useCallback((faktor: number, e: { clientX: number; clientY: number }) => {
    const el = flaeche.current;
    if (!el) return;
    const kasten = el.getBoundingClientRect();
    // Wo im Fenster sitzt der Zeiger, von 0 bis 1?
    const fx = (e.clientX - kasten.left) / kasten.width;
    const fy = (e.clientY - kasten.top) / kasten.height;

    const z = zoomRef.current;
    const sicht = 100 / z;
    const m = mitteRef.current;
    // Der Kartenpunkt, der gerade unter dem Zeiger liegt
    const px = m.x - sicht / 2 + fx * sicht;
    const py = m.y - sicht / 2 + fy * sicht;

    const z2 = Math.max(1, Math.min(6, z * faktor));
    const sicht2 = 100 / z2;

    // Bildmitte, bei der derselbe Punkt exakt unter dem Zeiger bleibt.
    const anker = {
      x: px + sicht2 * (0.5 - fx),
      y: py + sicht2 * (0.5 - fy),
    };

    // Bewusst ohne zusaetzliches Ziehen zur Bildmitte.
    //
    // Naheliegend waere, den angepeilten Ort mit jeder Rastung ein Stueck
    // zur Mitte zu holen. Durchgerechnet laeuft das aber aus dem Bild:
    // eine solche Bildmitte liegt ausserhalb dessen, was die Karte hergibt,
    // der Ausschnitt landet am Anschlag, und der Punkt rutscht ueber die
    // Mitte hinaus zum gegenueberliegenden Rand. Nur der reine Anker bleibt
    // stabil - der Ort unter dem Zeiger bleibt genau dort stehen.
    //
    // Wer eine Form mittig und gross sehen will, haelt sie gedrueckt.
    zoomeAuf(z2, anker);
  }, [zoomeAuf]);

  /**
   * Das Mausrad ueber der Karte zoomt - und die Seite scrollt dabei nicht mit.
   *
   * React haengt Rad-Ereignisse als "passiv" ein. Dort bleibt preventDefault
   * wirkungslos, und es wurde gleichzeitig gezoomt und gescrollt. Deshalb
   * wird der Zuhoerer von Hand und ausdruecklich nicht passiv angemeldet.
   *
   * Er haengt bewusst am Fenster und nicht an der Zeichenflaeche: die
   * Zeichenflaeche entsteht beim Umschalten auf Vollbild und beim Aufbau der
   * Adminleiste neu. Ein Zuhoerer, der an der alten haengt, bekommt dann
   * nichts mehr mit - und genau dann scrollte die Seite wieder mit. Am
   * Fenster kann das nicht passieren; ob das Rad ueber der Karte steht, wird
   * bei jedem Ereignis frisch geprueft.
   */
  useEffect(() => {
    const amRad = (e: WheelEvent) => {
      const el = flaeche.current;
      if (!el) return;

      // Entschieden wird ueber die Zeigerposition, nicht ueber das Element
      // unter dem Zeiger.
      //
      // Ein Treffertest ueber e.target scheitert, sobald dort etwas anderes
      // obenauf liegt - eine Beschriftung, die Werkzeugleiste, ein Ziehpunkt.
      // Dann galt das Rad als "ausserhalb" und die Seite scrollte doch mit.
      // Der Rahmen und clientX/clientY beziehen sich beide auf das sichtbare
      // Fenster, also stimmt der Vergleich in jeder Scrollstellung.
      const r = el.getBoundingClientRect();
      const drin = e.clientX >= r.left && e.clientX <= r.right
        && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!drin) return;

      e.preventDefault();
      e.stopPropagation();
      // Feinere Stufen als vorher: 1,18 pro Rastung sprang zu weit, um eine
      // bestimmte Stelle sauber anzufahren.
      zoomeAmZeiger(e.deltaY < 0 ? 1.12 : 1 / 1.12, e);
    };
    // In der Abfangphase: so kommt das Ereignis hier an, bevor irgendetwas
    // anderes es behandeln oder verschlucken koennte.
    window.addEventListener('wheel', amRad, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', amRad, { capture: true });
  }, [zoomeAmZeiger]);

  /**
   * Zu einer Stelle gleiten, auf geradem Weg.
   *
   * Vorher lag darauf ein CSS-Uebergang. Der blendet aber Massstab und
   * Verschiebung getrennt ueber, und weil die Verschiebung in Prozent vom
   * Massstab abhaengt, lief die Bildmitte einen Bogen: von 50 erst hinauf
   * auf 43 und dann hinunter auf 70. Genau das sah man als Ausflug an den
   * oberen Kartenrand, bevor es zur gesuchten Form ging.
   *
   * Deshalb rechnen wir jede Bildfolge selbst: Massstab und Mitte wandern
   * gemeinsam, die Mitte also auf gerader Strecke. Geschrieben wird direkt
   * auf die Ebene, ohne Zustandswechsel - sonst zeichnete die Seite
   * sechzigmal je Sekunde alle Formen neu.
   */
  const bewegung = useRef<number | null>(null);

  const bewegungStoppen = useCallback(() => {
    if (bewegung.current !== null) {
      cancelAnimationFrame(bewegung.current);
      bewegung.current = null;
    }
  }, []);

  const gleiteZu = useCallback((zielZoom: number, zielMitte: Punkt, dauer = 650) => {
    const el = ebeneRef.current;
    const zielZ = Math.max(1, Math.min(6, zielZoom));
    const zielM = begrenze(zielZ, zielZ === 1 ? { x: 50, y: 50 } : zielMitte);
    bewegungStoppen();
    if (!el) { zoomeAuf(zielZ, zielM); return; }

    const vonZ = zoomRef.current;
    const vonM = { ...mitteRef.current };
    // Steht es schon dort, gibt es nichts zu zeigen.
    if (Math.abs(vonZ - zielZ) < 0.01
      && Math.abs(vonM.x - zielM.x) < 0.01 && Math.abs(vonM.y - zielM.y) < 0.01) return;

    /*
     * In einem verborgenen Fenster halten Browser die Bildfolge an. Eine
     * Bewegung bliebe dann auf halbem Weg stehen, bis jemand zurueckkommt -
     * und mit ihr der Zustand, aus dem Ziehen und Rad weiterrechnen. Wo
     * niemand zusieht, ist ein Sprung ohnehin dasselbe wie eine Bewegung.
     */
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      zoomeAuf(zielZ, zielM);
      return;
    }

    const start = performance.now();
    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - start) / dauer);
      // Weich anfahren, weich ankommen - ohne Ueberschwingen.
      const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      const z = vonZ + (zielZ - vonZ) * e;
      const mx = vonM.x + (zielM.x - vonM.x) * e;
      const my = vonM.y + (zielM.y - vonM.y) * e;
      el.style.transform =
        `scale(${z}) translate(${50 / z - mx}%, ${50 / z - my}%)`;
      if (t < 1) { bewegung.current = requestAnimationFrame(schritt); return; }
      // Am Ziel den Zustand nachziehen, damit Ziehen und Rad weiterrechnen.
      bewegung.current = null;
      zoomRef.current = zielZ;
      mitteRef.current = zielM;
      setZoom(zielZ);
      setMitte(zielM);
    };
    bewegung.current = requestAnimationFrame(schritt);
  }, [begrenze, zoomeAuf, bewegungStoppen]);

  // Beim Verlassen der Seite keine Bildfolge stehen lassen.
  useEffect(() => bewegungStoppen, [bewegungStoppen]);

  /** Zu einer Form gleiten - beim Klick auf ein Team und beim Doppelklick. */
  const zeigeSpot = useCallback((spot: Spot) => {
    const r = rahmen(spot.punkte);
    const groesse = Math.max(r.breite, r.hoehe, 4);
    gleiteZu(Math.min(6, 55 / groesse),
      { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 });
  }, [gleiteZu]);

  /**
   * Lange auf eine Form druecken faehrt sie an.
   *
   * Gedacht fuer genaues Anpeilen: das Rad ist gut zum Umsehen, aber wer eine
   * bestimmte Form gross sehen will, haelt sie einfach gedrueckt. Bewegt sich
   * der Zeiger dabei, war es ein Ziehen und nichts passiert.
   */
  const halteUhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const halteStart = useRef<Punkt | null>(null);

  const halteAbbrechen = useCallback(() => {
    if (halteUhr.current) { clearTimeout(halteUhr.current); halteUhr.current = null; }
    halteStart.current = null;
  }, []);

  function neuerSpot(punkte: Punkt[], form: Form) {
    // Bewusst ohne Beschriftung: der Ortsname steht schon auf der Karte, in
    // der Form soll nur stehen, wer dort landet.
    const id = `s${Date.now().toString(36)}`;
    formenVomNutzer.current = true; inhaltVomNutzer.current = true;
    setSpots((alt) => [...alt, { id, form, punkte, teams: [] }]);
    setGewaehlt(id);
    gewaehltRef.current = id;
  }

  /* --------------------------------------------------- Zeichnen und Ziehen */

  function aufFlaecheRunter(e: React.MouseEvent) {
    // Wer selbst anfasst, will keine nachlaufende Bewegung mehr.
    bewegungStoppen();
    // Einmal messen und fuer den ganzen Zug behalten - siehe pos().
    zugRahmen.current = flaeche.current?.getBoundingClientRect() ?? null;
    const p = pos(e);

    // Gedrueckt halten faehrt die Form unter dem Zeiger an - egal ob man
    // die Karte bearbeiten darf, denn es ist reines Anschauen.
    if (!werkzeug) {
      const drunter = [...spots].reverse().find((sp) => imPolygon(p, sp.punkte));
      if (drunter) {
        halteStart.current = p;
        halteUhr.current = setTimeout(() => {
          halteUhr.current = null;
          halteStart.current = null;
          // Ein begonnenes Ziehen des Ausschnitts faellt damit weg.
          greiftRef.current = null;
          zeigeSpot(drunter);
        }, 420);
      }
    }

    // Den Ausschnitt zu verschieben ist reines Anschauen und deshalb auch
    // ohne Bearbeitungsrecht erlaubt. Vorher brach diese Funktion hier ab:
    // hineinzoomen ging, den Ausschnitt bewegen nicht - die Karte klebte
    // fest, sobald man vergroessert hatte. Das betraf jeden Besucher und
    // auch den Admin, solange eine veroeffentlichte Karte nur betrachtet wird.
    if (!darfBauen) {
      if (zoomRef.current > 1) {
        greiftRef.current = { art: 'karte', start: p, mitte: mitteRef.current };
      }
      return;
    }

    if (werkzeug === 'polygon') {
      // Beim ersten Punkt schliesst sich die Form.
      if (rohbau.length >= 3 && Math.hypot(rohbau[0].x - p.x, rohbau[0].y - p.y) < SCHLIESS_NAEHE) {
        neuerSpot(rohbau, 'polygon');
        setRohbau([]); setWerkzeug(null);
        return;
      }
      setRohbau((a) => [...a, p]);
      return;
    }
    if (werkzeug === 'rechteck') {
      ziehtRef.current = { von: p, bis: p };
      setZieht(ziehtRef.current);
      return;
    }

    // Ohne Werkzeug: eine Form laesst sich erst anfassen, wenn sie per
    // Doppelklick geoeffnet wurde.
    //
    // Vorher genuegte ein einzelner Klick, und die kleinste Handbewegung
    // danach verschob den Spot - beim blossen Anschauen der Karte war das
    // viel zu leicht ausgeloest. Jetzt gilt: einmal klicken tut nichts,
    // zweimal klicken oeffnet die Form zum Bearbeiten.
    const treffer = darfBauen
      ? [...spots].reverse().find((s) => imPolygon(p, s.punkte))
      : undefined;

    if (treffer && treffer.id === gewaehltRef.current) {
      greiftRef.current = { art: 'flaeche', start: p };
      return;
    }

    // Auf freie Flaeche geklickt: die geoeffnete Form wieder schliessen.
    // Ein Klick auf eine andere Form laesst die Auswahl bewusst stehen -
    // er soll ja nichts bewirken.
    if (!treffer) {
      setGewaehlt(null);
      gewaehltRef.current = null;
    }
    // Hineingezoomt: dann zieht man stattdessen den Ausschnitt.
    if (zoomRef.current > 1) {
      greiftRef.current = { art: 'karte', start: p, mitte: mitteRef.current };
    }
  }

  /** Doppelklick oeffnet die Form unter dem Zeiger zum Bearbeiten. */
  function aufFlaecheDoppelt(e: React.MouseEvent) {
    if (werkzeug) return;
    const p = pos(e);
    const treffer = [...spots].reverse().find((sp) => imPolygon(p, sp.punkte));
    if (!treffer) return;
    // Das Ziehen des Ausschnitts, das der erste Klick begonnen hat, faellt
    // damit weg - sonst rutschte die Karte beim Doppelklick mit.
    greiftRef.current = null;
    halteAbbrechen();
    // Anfahren wie beim Klick auf ein Team in der Liste. Das ist reines
    // Anschauen und deshalb auch ohne Bearbeitungsrecht erlaubt.
    zeigeSpot(treffer);
    if (!darfBauen) return;
    setGewaehlt(treffer.id);
    gewaehltRef.current = treffer.id;
  }

  function aufFlaecheBewegt(e: React.MouseEvent) {
    const p = pos(e);

    // Wer den Zeiger merklich bewegt, wollte ziehen und nicht halten.
    const halt = halteStart.current;
    if (halt && Math.hypot(p.x - halt.x, p.y - halt.y) > 0.8) halteAbbrechen();
    if (werkzeug === 'polygon' && rohbau.length) setZeiger(p);

    if (ziehtRef.current) {
      ziehtRef.current = { ...ziehtRef.current, bis: p };
      setZieht(ziehtRef.current);
      return;
    }

    // Zieh-Zustand aus Refs lesen: bei einer zuegigen Bewegung liegen
    // Druecken und Ziehen im selben Durchlauf, ein Zustandswert waere dann
    // noch der alte.
    const greift = greiftRef.current;
    if (greift?.art === 'karte') {
      // Der Punkt unter dem Zeiger soll dort bleiben, wo er angefasst wurde.
      const z = zoomRef.current;
      const m = begrenze(z, {
        x: greift.mitte.x - (p.x - greift.start.x),
        y: greift.mitte.y - (p.y - greift.start.y),
      });
      mitteRef.current = m;
      malAusschnitt(z, m);
      return;
    }
    const id = gewaehltRef.current;
    if (!greift || !id) return;

    formenVomNutzer.current = true; inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => {
      if (s.id !== id) return s;
      if (greift.art === 'flaeche') {
        const dx = p.x - greift.start.x, dy = p.y - greift.start.y;
        return { ...s, punkte: s.punkte.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
      }
      // Eine Ecke ziehen. Beim Rechteck wandern die Nachbarn mit, damit es
      // rechtwinklig bleibt.
      if (s.form === 'rechteck' && s.punkte.length === 4 && greift.gegen) {
        return { ...s, punkte: rechteckPunkte(p, greift.gegen) };
      }
      return { ...s, punkte: s.punkte.map((q, i) => (i === greift.index ? p : q)) };
    }));
    if (greift.art === 'flaeche') greiftRef.current = { art: 'flaeche', start: p };
  }

  function aufFlaecheHoch(e: React.MouseEvent) {
    const zug = ziehtRef.current;
    if (zug && werkzeug === 'rechteck') {
      const bis = pos(e);
      if (Math.abs(bis.x - zug.von.x) > 1 && Math.abs(bis.y - zug.von.y) > 1) {
        neuerSpot(rechteckPunkte(zug.von, bis), 'rechteck');
        setWerkzeug(null);
      }
    }
    halteAbbrechen();
    zugRahmen.current = null;
    // Zeichenschicht aufloesen, damit Schrift und Kanten scharf werden.
    if (ebeneRef.current) ebeneRef.current.style.willChange = 'auto';
    // Ein noch wartender Bildaufbau wuerde nach dem Zustandswechsel malen und
    // damit den soeben uebernommenen Stand wieder ueberschreiben.
    if (malUhr.current !== null) { cancelAnimationFrame(malUhr.current); malUhr.current = null; }
    naechsterAusschnitt.current = null;
    // Wurde die Karte verschoben, wandert der Ausschnitt jetzt in den
    // Zustand - waehrend des Ziehens stand er nur am Element.
    if (greiftRef.current?.art === 'karte') setMitte(mitteRef.current);
    ziehtRef.current = null;
    setZieht(null);
    greiftRef.current = null;
  }

  /* ------------------------------------------------------ Teams zuordnen */

  function teamAufSpot(teamId: string, spotId: string) {
    inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => {
      if (s.id === spotId) {
        return s.teams.includes(teamId) ? s : { ...s, teams: [...s.teams, teamId] };
      }
      // Ein Team steht nur an einem Ort.
      return s.teams.includes(teamId) ? { ...s, teams: s.teams.filter((t) => t !== teamId) } : s;
    }));
  }

  function teamAbziehen(teamId: string) {
    inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => ({ ...s, teams: s.teams.filter((t) => t !== teamId) })));
  }

  /**
   * Sich selbst auf eine Form setzen - oder wieder herunternehmen.
   *
   * Anders als beim Betreiber wird hier nicht die ganze Karte gespeichert,
   * sondern nur gemeldet, wohin. Wen es betrifft, sucht der Server selbst
   * aus dem verknuepften Epic-Konto - so kann diese Bewegung niemanden sonst
   * verschieben und keine Form veraendern.
   */
  async function michSetzen(spotId: string | null) {
    if (!meinTeam || !ausTurnier) return;
    // Sofort zeigen, was gleich gespeichert wird; ein Nein raeumt es weg.
    const vorher = spots;
    setSpots((alt) => alt.map((s) => {
      const ohne = s.teams.filter((t) => t !== meinTeam.id);
      return { ...s, teams: s.id === spotId ? [...ohne, meinTeam.id] : ohne };
    }));
    try {
      const r = await fetch('/api/turnier-karten/mich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ karte: ausTurnier, spot: spotId }),
      });
      const j = await r.json();
      if (!r.ok) { setSpots(vorher); setStatus(j?.error ?? uebs('Nicht gespeichert')); return; }
      setStatus(spotId ? uebs('Dein Platz ist gespeichert')
        : uebs('Du stehst nicht mehr auf der Karte'));
    } catch {
      setSpots(vorher); setStatus(uebs('Nicht gespeichert'));
    }
  }

  function aufFlaecheAbgelegt(e: React.DragEvent) {
    e.preventDefault();
    // Ein Pro darf genau eine Kachel bewegen: seine eigene.
    if (!darfBauen) {
      if (!darfMichSetzen) return;
      const meins = e.dataTransfer.getData('text/team');
      if (!meins || meins !== meinTeam?.id) return;
      const ziel = [...spots].reverse().find((sp) => imPolygon(pos(e), sp.punkte));
      if (ziel) void michSetzen(ziel.id);
      return;
    }
    const teamId = e.dataTransfer.getData('text/team');
    if (!teamId) { setStatus(uebs('Beim Ablegen kam kein Team an')); return; }
    const p = pos(e);
    const ziel = [...spots].reverse().find((s) => imPolygon(p, s.punkte));
    if (ziel) { teamAufSpot(teamId, ziel.id); setStatus(''); return; }
    // Mit Zahlen: so laesst sich unterscheiden, ob daneben abgelegt wurde
    // oder ob die Umrechnung nicht stimmt.
    setStatus(`Dort ist keine Form — abgelegt bei ${p.x.toFixed(1)} / ${p.y.toFixed(1)}`
      + ` (${spots.length} Formen vorhanden)`);
  }

  /* --------------------------------------------------------- Aktionen */

  function alleSpielerLoeschen() {
    // Ausdruecklich nur die Zuordnungen. Die Formen bleiben stehen.
    inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => ({ ...s, teams: [] })));
    setStatus(uebs('Alle Spieler entfernt, Formen bleiben'));
  }

  function spotLoeschen(id: string) {
    formenVomNutzer.current = true; inhaltVomNutzer.current = true;
    setSpots((alt) => alt.filter((s) => s.id !== id));
    if (gewaehlt === id) setGewaehlt(null);
  }

  async function speichern(still = false) {
    const f = fenster.find((x) => x.windowId === fensterId);
    const bildName = bilder.find((b) => b.id === bildId)?.titel ?? 'Battle Royale';

    /*
     * Eine schon vorhandene Karte behaelt ihre Kennung.
     *
     * Frueher wurde sie jedes Mal aus dem Titel gebildet. Beim Umbenennen
     * entstand dadurch eine zweite Karte zum selben Spieltag, waehrend die
     * Arbeit unter der alten Kennung liegenblieb. Gesucht wird deshalb
     * zuerst die geladene Karte, dann eine zu Turnier, Spieltag und Insel -
     * und nur wenn es keine gibt, entsteht eine neue Kennung.
     */
    const vorhanden = ausTurnier
      ?? gespeicherte.find((k) => k.eventId === f?.eventId
        && k.windowId === f?.windowId && (k.bildId ?? '') === bildId)?.id;
    const roh = `${titel} ${f?.windowId ?? ''} ${bildId || 'br'}`.trim();
    const id = vorhanden
      ?? (roh.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'karte');

    // Zu einem Spieltag darf jede Insel nur einmal vorkommen. Sonst stuenden
    // auf der Events-Seite zwei Knoepfe mit demselben Namen und niemand
    // wuesste, welcher welcher ist.
    const schonDa = gespeicherte.find((k) => k.id !== id
      && k.eventId === f?.eventId && k.windowId === f?.windowId
      && (k.bildId ?? '') === bildId);
    if (schonDa) {
      if (!still) {
        setStatus(`Zu diesem Spieltag gibt es bereits eine Karte auf "${bildName}"`
          + ` ("${schonDa.titel}"). Waehle ein anderes Kartenbild oder oeffne die vorhandene.`);
      }
      return;
    }
    const r = await fetch('/api/turnier-karten', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, titel, spots, teams, gesperrt,
        namenSichtbar: orteSichtbar, cupId, cupTitel: cup?.titel,
        // Darueber findet die Events-Seite die Karte wieder.
        eventId: f?.eventId, windowId: f?.windowId, region: f?.region, bildId,
        bildTitel: bildName,
        spiele: spiele.trim() || undefined,
        oeffentlich: true,
      }),
    });
    if (!r.ok) {
      // Den Grund vom Server durchreichen. "Speichern fehlgeschlagen" allein
      // sagt nichts; meist ist es ein fehlendes Schreibrecht, und das steht
      // dann auch da. Auch beim stillen Sichern: ein Fehlschlag, den niemand
      // sieht, ist von einem stillen Verlieren nicht zu unterscheiden.
      const grund = await r.json().catch(() => null);
      setStatus(grund?.error
        ? String(grund.error) : uebs('Speichern fehlgeschlagen'));
      if (!still) setVeroeffentlicht(null);
      return;
    }

    if (still) { setSelbstGesichert(Date.now()); return; }

    const d = await fetch('/api/turnier-karten').then((x) => x.json());
    setGespeicherte(d.karten ?? []);

    // Ruecken melden, wo die Karte jetzt oeffentlich auftaucht. Ohne Cup und
    // Spieltag fehlt die Verknuepfung - dann sieht sie ausser uns niemand.
    setVeroeffentlicht({
      id,
      cup: cup?.titel ?? null,
      spieltag: f ? new Date(f.begin).toLocaleDateString('de-DE',
        { day: '2-digit', month: '2-digit' }) : null,
    });
    setStatus('');
  }

  /* speichern wird bei jedem Zeichnen neu gebildet; ueber ein Ref bleibt der
     Takt unten davon unberuehrt und laeuft nicht bei jedem Tastendruck neu. */
  const speichernRef = useRef(speichern);
  useEffect(() => { speichernRef.current = speichern; });

  /**
   * Die Karte schreibt sich von selbst.
   *
   * Fuenfzig Duos zu verteilen ist eine halbe Stunde Arbeit, und sie war
   * weg, sobald jemand die Seite neu lud, ohne auf Speichern gedrueckt zu
   * haben. Deshalb wird eine halbe Sekunde nach der letzten Aenderung
   * geschrieben - lange genug, dass nicht jeder Zwischenschritt einer
   * Bewegung eine Anfrage ausloest, kurz genug, dass nichts verloren geht.
   *
   * Drei Bedingungen halten das sauber:
   *   - nur nach einem eigenen Eingriff, damit blosses Laden nichts schreibt,
   *   - nur mit gewaehltem Spieltag, sonst entstuende eine Karte ohne Bezug,
   *   - nie mit leerer Formenliste: dieser Moment tritt beim Umschalten auf
   *     und wuerde einen fertigen Stand ueberschreiben.
   * Eine gesperrte Karte bleibt unberuehrt - das Schloss heisst "hier soll
   * sich nichts mehr ruehren".
   */
  useEffect(() => {
    if (!istAdmin || gesperrt || !fensterId) return;
    if (!inhaltVomNutzer.current || !spots.length) return;
    /*
     * 200 statt 500 Millisekunden.
     *
     * Zwischen einer Aenderung des Betreibers und dem Bild bei allen anderen
     * liegen zwei Wartezeiten: dieses Abwarten hier und der Blick des Servers
     * auf die Datei. Zusammen sollen sie unter einer Sekunde bleiben. Ganz
     * ohne Abwarten ginge auch, wuerde beim Ziehen einer Form aber fuer jede
     * Mausbewegung einmal die ganze Karte schreiben.
     */
    const uhr = setTimeout(() => {
      inhaltVomNutzer.current = false;
      void speichernRef.current(true);
    }, 200);
    return () => clearTimeout(uhr);
  }, [spots, teams, titel, spiele, bildId, fensterId, istAdmin, gesperrt]);

  /**
   * Einen von Hand geaenderten Namen dauerhaft sichern. Geschluesselt wird
   * ueber die Epic-Konto-ID, damit derselbe Spieler beim naechsten Turnier
   * wiedererkannt wird - auch wenn er dort anders heisst.
   */
  /**
   * Das gepflegte Profil eines Spielers dieses Teams.
   *
   * Gesucht wird ueber die Epic-Konto-Id, denn Namen sind nicht eindeutig.
   * Erst wenn keine vorliegt, zaehlen die beobachteten Namen.
   */
  const profilVon = useCallback((team: KartenTeam, i: number) => {
    const id = (team.ids ?? [])[i];
    if (id && profile[id]) return profile[id];
    const schluessel = namensSchluessel(team.spieler[i] ?? '');
    if (!schluessel) return undefined;
    for (const pr of Object.values(profile)) {
      if ((pr.namen ?? [pr.name ?? '']).some((n) => namensSchluessel(n) === schluessel)) {
        return pr;
      }
    }
    return undefined;
  }, [profile]);

  /** Die Laender eines Teams, in der Reihenfolge der Namen. */
  const laenderVon = useCallback(
    (team: KartenTeam) => team.spieler.map((_, i) => profilVon(team, i)?.land),
    [profilVon]);

  /**
   * Die eingestellten Flaggen festhalten.
   *
   * Wie beim Namen ueber die Konto-Id, damit die Flagge in jedem Cup wieder
   * steht. Die uebrigen gepflegten Angaben gehen mit - sonst schriebe das
   * Speichern einer Flagge den Anzeigenamen weg.
   */
  async function flaggenMerken(team: KartenTeam, laender: string[]) {
    if (!istAdmin) return 0;
    const ids = team.ids ?? [];
    let gesichert = 0;
    for (let i = 0; i < team.spieler.length; i++) {
      const id = ids[i];
      const land = (laender[i] ?? '').trim().toUpperCase();
      const vorher = profilVon(team, i);
      if ((vorher?.land ?? '') === land) continue;
      const r = await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id || undefined, name: team.spieler[i], land,
          x: vorher?.x ?? '', region: vorher?.region ?? '',
          anzeige: vorher?.anzeige ?? '',
        }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.profile) setProfile((alt) => ({ ...alt, [j.schluessel]: j.profile }));
        gesichert++;
      }
    }
    return gesichert;
  }

  async function namenMerken(team: KartenTeam, neueNamen: string[]) {
    if (!istAdmin) return;
    const ids = team.ids ?? [];
    let gesichert = 0;
    for (let i = 0; i < neueNamen.length; i++) {
      const id = ids[i];
      const name = neueNamen[i];
      if (!id || !name) continue;
      // Nur speichern, was sich wirklich geaendert hat.
      if (team.spieler[i] === name) continue;
      const r = await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Herkunft, X-Konto und Region gehen mit: die Ablage ersetzt den
        // ganzen Eintrag, und ohne sie fiele die gepflegte Flagge weg.
        body: JSON.stringify({
          id, name: team.spieler[i] ?? name, anzeige: name,
          land: profilVon(team, i)?.land ?? '',
          x: profilVon(team, i)?.x ?? '',
          region: profilVon(team, i)?.region ?? '',
        }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.profile) setProfile((alt) => ({ ...alt, [j.schluessel]: j.profile }));
        gesichert++;
      }
    }
    setStatus(gesichert
      ? `Name gemerkt — gilt ab jetzt in jedem Cup`
      : 'Ohne Konto-ID lässt sich der Name nicht dauerhaft merken');
  }

  /** Ein weiteres Kartenbild hinterlegen, etwa eine Reload-Karte. */
  async function bildHochladen(datei: File, wieHeisst: string) {
    const daten = new FormData();
    daten.append('bild', datei);
    daten.append('titel', wieHeisst);
    setStatus(uebs('Bild wird hochgeladen…'));
    const r = await fetch('/api/karten-bild', { method: 'POST', body: daten });
    const j = await r.json();
    if (!r.ok) { setStatus(j.error ?? 'Hochladen fehlgeschlagen'); return; }
    const liste = await fetch('/api/karten-bild').then((x) => x.json());
    setBilder(liste.karten ?? []);
    setBildId(j.karte.id);
    setBildStand(Date.now());
    setNeuerTitel('');
    setStatus(`"${j.karte.titel}" ist hinterlegt`);
  }

  /**
   * Eine Turnierkarte oeffentlich zeigen oder verstecken.
   *
   * Verstecken loescht nichts: Formen und Zuordnung bleiben, die Karte
   * verschwindet nur von der Events-Seite und steht hier weiter in der Liste.
   */
  /**
   * Eine Karte endgueltig entfernen.
   *
   * Das Kreuz daneben blendet nur aus - Formen und Verteilung bleiben
   * erhalten und lassen sich zurueckholen. Hier ist es wirklich weg, samt
   * einer halben Stunde Verteilarbeit. Deshalb wird gefragt, und zwar mit
   * dem Namen der Karte im Text: "wirklich loeschen?" allein hat schon
   * manchen die falsche erwischen lassen.
   */
  async function karteLoeschen(id: string, name: string) {
    const sicher = window.confirm(
      `${uebs('Diese Karte endgültig löschen?')}

${name}

`
      + uebs('Formen und Verteilung sind dann weg — das lässt sich nicht rückgängig machen.'));
    if (!sicher) return;
    const r = await fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' });
    if (!r.ok) {
      const grund = await r.json().catch(() => null);
      setStatus(grund?.error ? String(grund.error) : uebs('Löschen fehlgeschlagen'));
      return;
    }
    const d = await fetch('/api/turnier-karten').then((x) => x.json());
    setGespeicherte(d.karten ?? []);
    setStatus(`${uebs('Karte gelöscht')}: ${name}`);
  }

  async function sichtbarkeit(id: string, oeffentlich: boolean) {
    const r = await fetch('/api/turnier-karten', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, oeffentlich }),
    });
    if (!r.ok) { setStatus(uebs('Umschalten fehlgeschlagen')); return; }
    const d = await fetch('/api/turnier-karten').then((x) => x.json());
    setGespeicherte(d.karten ?? []);
    setStatus(oeffentlich ? 'Karte ist wieder öffentlich' : 'Karte ist ausgeblendet');
  }

  async function bildUmbenennen(id: string, wieHeisst: string) {
    const name = wieHeisst.trim();
    if (!name) return;
    const r = await fetch('/api/karten-bild', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, titel: name }),
    });
    const j = await r.json();
    if (!r.ok) { setStatus(j.error ?? 'Umbenennen fehlgeschlagen'); return; }
    const liste = await fetch('/api/karten-bild').then((x) => x.json());
    setBilder(liste.karten ?? []);
    setBenennt(null);
    setStatus(`heisst jetzt "${name}"`);
  }

  // Zum Loeschen eines Kartenbildes gibt es hier bewusst keinen Weg mehr.
  // Ein Fehlklick hat schon eine Karte gekostet, und die Bilder lassen sich
  // nirgends kostenlos wiederbeschaffen. Die Route kann es weiterhin, aber
  // nur auf ausdruecklichen Zuruf.

  /** Karte als Bild: Kartenbild, Formen und Namen auf eine Leinwand. */
  async function alsBild() {
    const img = bildRef.current;
    if (!img) return;
    const G = 1400;
    const c = document.createElement('canvas');
    c.width = G; c.height = G;
    const g = c.getContext('2d');
    if (!g) return;

    g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, G, G);
    try { g.drawImage(img, 0, 0, G, G); } catch { /* Bild noch nicht bereit */ }

    for (const s of spots) {
      const f = spotFarbe(s);
      g.beginPath();
      s.punkte.forEach((p, i) => {
        const x = (p.x / 100) * G, y = (p.y / 100) * G;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.closePath();
      g.fillStyle = f.fuellung;
      g.fill();
      g.strokeStyle = f.rand;
      g.lineWidth = 3; g.stroke();

      // Dieselbe Aufteilung wie auf dem Bildschirm: die Namen fuellen die
      // Form aus und verteilen sich gleichmaessig ueber ihre Hoehe.
      const belegt = s.teams.map((id) => teams.find((x) => x.id === id))
        .filter(Boolean) as KartenTeam[];
      const r = rahmen(s.punkte);
      const mx = (r.links + r.breite / 2) / 100 * G;
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (!belegt.length) {
        if (!s.name) continue;
        const px = schriftgroesse(r.breite, r.hoehe, s.name.length) / 100 * G;
        g.font = `600 ${px}px Segoe UI, system-ui, sans-serif`;
        const y = (r.oben + r.hoehe / 2) / 100 * G;
        g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = px * 0.22;
        g.strokeText(s.name, mx, y);
        g.fillStyle = 'rgba(255,255,255,0.78)';
        g.fillText(s.name, mx, y);
        continue;
      }

      const hoeheProTeam = r.hoehe / belegt.length;
      belegt.forEach((t, i) => {
        const namen = t.spieler.map(kuerze);
        const allein = belegt.length === 1 && namen.length > 1;
        const zeilen = allein ? namen : [namen.join(' ')];

        // Wie auf dem Bildschirm: die Zeile sitzt in der Spanne, die die Form
        // auf dieser Hoehe wirklich hat.
        const bandMitte = r.oben + hoeheProTeam * (i + 0.5);
        // Dieselbe Groesse fuer alle Formen wie auf dem Bildschirm.
        const groesseProz = einheitsGroesse;
        const px = groesseProz / 100 * G;

        // Wie auf dem Bildschirm an den Rand geruecken.
        const hoch = zeilen.length * groesseProz * 1.15;
        const obenY = r.oben + hoch * 0.62;
        const untenY = r.oben + r.hoehe - hoch * 0.62;
        const platzY = untenY - obenY;
        const yProz = (belegt.length === 1 || platzY <= 0)
          ? bandMitte
          : obenY + platzY * (i / (belegt.length - 1));
        const spanne = spanneBei(s.punkte, yProz)
          ?? { mitte: r.links + r.breite / 2, breite: r.breite };
        g.font = `600 ${px}px Segoe UI, system-ui, sans-serif`;

        const zx = (spanne.mitte / 100) * G;
        const mitte = (yProz / 100) * G;
        zeilen.forEach((zeile, j) => {
          const y = mitte + (j - (zeilen.length - 1) / 2) * px * 1.05;
          // Gemischte Schreibweise wie auf dem Bildschirm - Grossbuchstaben
          // brauchen mehr Platz und liefen bei engen Formen heraus.
          g.strokeStyle = 'rgba(0,0,0,1)'; g.lineWidth = px * 0.24;
          g.strokeText(zeile, zx, y);
          g.fillStyle = '#ffffff';
          g.fillText(zeile, zx, y);
        });
      });
      g.textBaseline = 'alphabetic';
    }

    // Kein Kopf mehr oben links.
    //
    // Dort standen Kartentitel und Seitenname. Auf einem Bild, das geteilt
    // wird, lenkt beides von der Karte ab - der Titel steht ohnehin im
    // Beitrag daneben. Geblieben ist allein das Zeichen unten rechts.
    const logo = await new Promise<HTMLImageElement | null>((fertig) => {
      const b = new Image();
      b.onload = () => fertig(b);
      b.onerror = () => fertig(null);
      // Die freigestellte Fassung: auf einer Karte soll die Marke nicht in
      // einem schwarzen Kasten sitzen.
      b.src = MARKE.logoFrei;
    });

    if (logo && logo.naturalWidth) {
      // Feste Breite, Hoehe aus dem Seitenverhaeltnis - sonst zieht sich das
      // Zeichen in die Breite, sobald die Datei einmal anders zugeschnitten
      // ist.
      const breite = Math.round(G * 0.155);
      const hoehe = Math.round(breite * (logo.naturalHeight / logo.naturalWidth));
      const rand = Math.round(G * 0.022);
      g.save();
      // Ein Hauch Schatten, damit das Zeichen auch ueber einem hellen Stueck
      // Karte stehen bleibt.
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 12;
      g.globalAlpha = 0.95;
      g.drawImage(logo, G - rand - breite, G - rand - hoehe, breite, hoehe);
      g.restore();
    }

    try {
      await speichereLeinwand(
        c, `${titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
    } catch (e) {
      setStatus(`${uebs('ging nicht')}: ${
        uebs(e instanceof Error ? e.message : String(e))}`);
      return;
    }
    setStatus(uebs('Bild gespeichert'));
  }

  /* -------------------------------------------------------------- Anzeige */

  const vorschau = zieht && werkzeug === 'rechteck'
    ? rechteckPunkte(zieht.von, zieht.bis) : null;
  const gewaehlterSpot = spots.find((s) => s.id === gewaehlt) ?? null;

  function spotFarbe(s: Spot) {
    // Eine selbst gesetzte Farbe hat immer Vorrang, auch wenn Teams drin stehen.
    if (s.farbe) {
      const r = parseInt(s.farbe.slice(1, 3), 16);
      const g = parseInt(s.farbe.slice(3, 5), 16);
      const b = parseInt(s.farbe.slice(5, 7), 16);
      return { fuellung: `rgba(${r},${g},${b},0.45)`, rand: s.farbe };
    }
    // Kraeftiger als frueher. Die alten Werte liessen die Karte zwar schoen
    // durchscheinen, aber gerade die roten Formen wirkten ausgewaschen und
    // waren auf orangem Untergrund kaum vom Boden zu unterscheiden. Der Rand
    // ist jetzt deckend, die Fuellung etwas dichter.
    const belegt = s.teams?.length ?? 0;
    if (belegt >= 2) return { fuellung: 'rgba(220,38,38,0.34)', rand: 'rgb(248,60,60)' };
    if (belegt === 1) return { fuellung: 'rgba(0,0,0,0.42)', rand: 'rgba(0,0,0,0.95)' };
    return { fuellung: 'rgba(0,0,0,0.14)', rand: 'rgba(0,0,0,0.75)' };
  }

  /**
   * Eine Schriftgroesse fuer die ganze Karte.
   *
   * Bisher rechnete jede Form ihre eigene aus: eine grosse Flaeche bekam
   * grosse Schrift, eine schmale kleine. Nebeneinander sah das unruhig aus -
   * "Moda Rew" stand doppelt so gross da wie "Mshary 5AALD" direkt daneben.
   *
   * Jetzt gilt ein Wert fuer alle. Genommen wird der kleinste, den die Formen
   * zulassen, aber nach unten begrenzt: sonst zwaenge eine einzige enge Form
   * die ganze Karte in Kleinschrift. Die wenigen Beschriftungen, die dadurch
   * etwas ueber ihre Form hinausragen, sind der Preis fuer ein ruhiges Bild.
   */
  const einheitsGroesse = ((): number => {
    const werte: number[] = [];
    for (const s of spots) {
      const belegt = s.teams.map((id) => teams.find((t) => t.id === id)).filter(Boolean) as KartenTeam[];
      const r = rahmen(s.punkte);
      const anzahl = belegt.length || 1;
      const hoeheProTeam = r.hoehe / anzahl;
      const zeilenSaetze: string[][] = belegt.length
        ? belegt.map((t) => {
            const namen = t.spieler.map(kuerze);
            return belegt.length === 1 && namen.length > 1 ? namen : [namen.join(' ')];
          })
        : (s.name ? [[s.name]] : []);
      for (const texte of zeilenSaetze) {
        const laengste = Math.max(...texte.map((t) => t.length), 1);
        werte.push(schriftgroesse(r.breite, hoeheProTeam / texte.length, laengste));
      }
    }
    if (!werte.length) return 1.2;
    // Nicht der kleinste Wert, sondern der im unteren Drittel.
    //
    // Der kleinste stammt regelmaessig von einer einzigen engen Form und
    // druckt die ganze Karte in Kleinschrift. Beim unteren Drittel passt die
    // Mehrheit der Beschriftungen sauber hinein, und die wenigen aus sehr
    // schmalen Formen ragen ein Stueck darueber hinaus - das faellt weniger
    // auf als eine durchgehend zu kleine Schrift.
    werte.sort((a, b) => a - b);
    const gewaehlt = werte[Math.floor(werte.length / 3)];
    return Math.max(1.1, Math.min(gewaehlt, 2.0));
  })();

  /*
   * Strg+V nimmt ein Bild aus der Zwischenablage entgegen.
   *
   * Nur fuer den Admin und nur, wenn gerade kein Textfeld den Fokus hat -
   * sonst kaeme das Einfuegen eines Namens hier an.
   */
  useEffect(() => {
    if (!istAdmin) return;
    const rein = (e: ClipboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && /^(INPUT|TEXTAREA)$/.test(ziel.tagName)) return;
      const datei = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (!datei) return;
      e.preventDefault();
      const leser = new FileReader();
      leser.onload = () => setPause(String(leser.result));
      leser.readAsDataURL(datei);
    };
    window.addEventListener('paste', rein);
    return () => window.removeEventListener('paste', rein);
  }, [istAdmin]);

  const kartenFlaeche = (
    <div
      ref={flaeche}
      onMouseDown={aufFlaecheRunter}
      onMouseMove={aufFlaecheBewegt}
      onMouseUp={aufFlaecheHoch}
      onDoubleClick={aufFlaecheDoppelt}
      onMouseLeave={() => {
        halteAbbrechen();
        zugRahmen.current = null;
        if (ebeneRef.current) ebeneRef.current.style.willChange = 'auto';
        ziehtRef.current = null; setZieht(null); greiftRef.current = null;
      }}
      onDragOver={(e) => { if (darfBauen || darfMichSetzen) e.preventDefault(); }}
      onDrop={aufFlaecheAbgelegt}
      className={`relative mx-auto aspect-square w-full overflow-hidden rounded-lg
                  bg-zinc-950 select-none lg:w-auto ${
                    werkzeug ? 'cursor-crosshair' : zoom > 1 ? 'cursor-grab' : ''}`}
      style={{
        containerType: 'size',
        // An die Fensterhoehe gebunden: die Karte ist quadratisch, ohne Grenze
        // waere sie so breit wie die Spalte und reichte unten aus dem Bild.
        // 68 Prozent der Fensterhoehe lassen oben und unten Luft, sodass sie
        // beim Scrollen auf einen Blick dasteht.
        // Eine feste Breite statt einer Obergrenze: die mittlere Spalte
        // richtet sich danach, und die Listen ruecken damit direkt an die
        // Karte heran. 92 Prozent der Fensterhoehe nutzen die Hoehe fast ganz
        // aus; die Begrenzung auf 66 Prozent der Fensterbreite greift nur auf
        // schmalen Bildschirmen, damit nichts herauslaeuft.
        width: 'min(92vh, 66vw)',
        maxWidth: '100%',
        // Kein Weiterreichen des Radlaufs an die Seite, falls der Browser
        // eine begonnene Scrollbewegung fortsetzen will.
        overscrollBehavior: 'contain',
        ...(vollbild ? { height: '100%', width: 'auto', maxWidth: 'none', aspectRatio: '1 / 1' } : {}),
      }}>

      {/* Alles Gezeichnete sitzt in dieser Ebene, damit Bild, Formen und
          Beschriftungen beim Zoomen zusammenbleiben. */}
      <div ref={ebeneRef} className="absolute inset-0 origin-top-left"
        style={{
          transform: `scale(${zoom}) translate(${50 / zoom - mitte.x}%, ${50 / zoom - mitte.y}%)`,
          width: '100%', height: '100%',
        }}>

      <img ref={bildRef}
        src={(bildId
          ? `/api/karten-bild?datei=1&id=${encodeURIComponent(bildId)}`
          : `/api/fortnite-map?bild=${orteSichtbar ? 'poi' : 'leer'}`)
          + (bildStand ? `&v=${bildStand}` : '')}
        alt={uebs('Fortnite-Karte')} draggable={false} crossOrigin="anonymous"
        onLoad={messeRandFarbe}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover" />

      {/* Die eingefuegte Vorlage - ueber der Karte, unter den Formen, damit
          man beim Zeichnen sieht, was man abpaust. */}
      {pause && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={pause} alt="" draggable={false}
          style={{ opacity: pauseKlar / 100 }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      )}

      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full">
        {spots.map((s) => {
          const f = spotFarbe(s);
          return (
            <polygon key={s.id}
              points={s.punkte.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={f.fuellung} stroke={f.rand}
              strokeWidth={gewaehlt === s.id ? 3.5 : 2}
              vectorEffect="non-scaling-stroke" />
          );
        })}
        {vorschau && (
          <polygon points={vorschau.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth={2}
            strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        )}
        {rohbau.length > 0 && (
          <polyline
            points={[...rohbau, ...(zeiger ? [zeiger] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(52,211,153,0.14)" stroke="#34d399" strokeWidth={2}
            vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* Ziehpunkte der gewaehlten Form */}
      {darfBauen && gewaehlterSpot && !werkzeug && gewaehlterSpot.punkte.map((p, i) => (
        <button key={i} type="button"
          onMouseDown={(e) => {
            e.stopPropagation();
            greiftRef.current = {
              art: 'ecke', index: i,
              gegen: gewaehlterSpot.form === 'rechteck' && gewaehlterSpot.punkte.length === 4
                ? gewaehlterSpot.punkte[(i + 2) % 4] : null,
            };
            gewaehltRef.current = gewaehlterSpot.id;
          }}
          style={{ left: `${p.x}%`, top: `${p.y}%`,
                   transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
          title="Ecke ziehen"
          className="absolute z-20 flex h-6 w-6 cursor-grab items-center justify-center">
          {/* Die Schaltflaeche ist bewusst groesser als der sichtbare Punkt,
              damit man sie auch schnell trifft. */}
          <span className="h-3 w-3 rounded-sm border-2 border-sky-400 bg-zinc-950" />
        </button>
      ))}

      {/* Erster Punkt der offenen Form - hier schliesst sie sich */}
      {rohbau.length >= 3 && (
        <span style={{ left: `${rohbau[0].x}%`, top: `${rohbau[0].y}%` }}
          className="pointer-events-none absolute z-20 h-3.5 w-3.5 -translate-x-1/2
                     -translate-y-1/2 rounded-full border-2 border-emerald-400 bg-emerald-950" />
      )}

      {/* Beschriftungen. Jede Zeile sitzt in der Spanne, die die Form auf
          ihrer Hoehe wirklich hat - bei schraegen Formen wandert sie damit
          mit, statt am umschliessenden Rechteck zu kleben. */}
      {spots.map((s) => {
        const belegt = s.teams.map((id) => teams.find((t) => t.id === id))
          .filter(Boolean) as KartenTeam[];
        if (!belegt.length && !s.name) return null;

        const r = rahmen(s.punkte);
        const anzahl = belegt.length || 1;
        const hoeheProTeam = r.hoehe / anzahl;

        /** Zeile setzen: waagerecht mittig in ihrer Spanne, senkrecht am Rand. */
        const zeile = (
          schluessel: string, texte: string[], i: number, fett: boolean,
        ) => {
          const bandMitte = r.oben + hoeheProTeam * (i + 0.5);
          // Eine Groesse fuer die ganze Karte - siehe einheitsGroesse.
          const groesse = einheitsGroesse;

          // Zweiter Durchgang: die Zeile an den Rand ruecken.
          //
          // Bei mehreren Teams gehoert das erste an den oberen, das letzte an
          // den unteren Rand der Form. In der Mitte ihres Bandes zu sitzen
          // laesst die Flaeche dazwischen leer und macht schlechter kenntlich,
          // welcher Teil zu wem gehoert.
          //
          // Die Texthoehe zaehlt in Kartenprozent, nicht in Bildschirmpunkten:
          // die Schrift ist ja gegen die Vergroesserung gerechnet und wird auf
          // der Karte kleiner, je weiter man hineinzoomt.
          const hoch = texte.length * (groesse / schriftFaktor(zoom)) * 1.15;
          const obenY = r.oben + hoch * 0.62;
          const untenY = r.oben + r.hoehe - hoch * 0.62;
          const platz = untenY - obenY;
          const y = (anzahl === 1 || platz <= 0)
            ? bandMitte
            : obenY + platz * (i / (anzahl - 1));

          const spanne = spanneBei(s.punkte, y)
            ?? { mitte: r.links + r.breite / 2, breite: r.breite };
          return (
            <div key={schluessel}
              style={{ left: `${spanne.mitte}%`, top: `${y}%`,
                       transform: 'translate(-50%, -50%)' }}
              className="pointer-events-none absolute z-10 text-center leading-none">
              {texte.map((t, k) => (
                // Geteilt durch die Vergroesserung: dadurch bleibt die Schrift
                // auf dem Bildschirm immer gleich gross. Beim Hineinzoomen
                // waechst die Form unter ihr, die Zeile nicht - genau so, wie
                // man es von einer Karte erwartet.
                <p key={k} style={{ fontSize: `${groesse / schriftFaktor(zoom)}cqw` }}
                  className={`whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                    fett ? 'font-semibold text-white'
                         : 'font-medium tracking-wide text-white/75'}`}>
                  {t}
                </p>
              ))}
            </div>
          );
        };

        return (
          <Fragment key={s.id}>
            {s.name && !belegt.length && zeile(`${s.id}-n`, [s.name], 0, false)}
            {belegt.map((t, i) => {
              // Steht ein Team allein, bekommt jeder Name eine eigene Zeile und
              // damit mehr Groesse. Bei mehreren Teams passt nur eine Zeile.
              const namen = t.spieler.map(kuerze);
              const allein = belegt.length === 1 && namen.length > 1;
              return zeile(t.id, allein ? namen : [namen.join(' ')], i, true);
            })}
          </Fragment>
        );
      })}

      </div>{/* Ende der Zoom-Ebene - die Leiste unten bleibt an ihrem Platz */}

      {/* Werkzeugleiste rechts in der Karte. Die Leiste liegt ueber der
          Zeichenflaeche - ohne das Abfangen wuerde jeder Knopfdruck zugleich
          einen Punkt setzen. */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="absolute right-2 top-2 z-30 flex flex-col gap-1.5">
        <Werkzeugknopf titel="Ortsnamen" kind={Ikone.auge} aktiv={orteSichtbar}
          onClick={() => setOrteSichtbar((v) => !v)} />
        <Werkzeugknopf titel={vollbild ? 'Breitbild verlassen' : 'Breitbild'} kind={Ikone.vollbild}
          aktiv={vollbild} onClick={() => setVollbild((v) => !v)} />
        {/* Zurueck auf die ganze Karte - nach dem Hineinzoomen der Knopf,
            den man zuerst sucht. Ein Schalter fuer die Spielernamen stand hier
            einmal daneben; die Karte ohne Namen zu zeigen ist aber genau das,
            wofuer niemand herkommt. */}
        <Werkzeugknopf titel="Ansicht zurücksetzen — wieder mittig, ohne Zoom"
          kind={Ikone.mittig}
          onClick={() => gleiteZu(1, { x: 50, y: 50 })} />

        {istAdmin && (
          <>
            <span className="my-1 h-px bg-zinc-700" />
            <Werkzeugknopf titel={gesperrt ? 'Karte entsperren' : 'Karte sperren'}
              kind={Ikone.schloss} aktiv={gesperrt} onClick={() => setGesperrt((v) => !v)} />
            <Werkzeugknopf titel="Alle Spieler entfernen (Formen bleiben)" kind={Ikone.muell}
              gefahr onClick={alleSpielerLoeschen} />
            <Werkzeugknopf titel="Freie Form zeichnen" kind={Ikone.polygon}
              aktiv={werkzeug === 'polygon'}
              onClick={() => { setWerkzeug(werkzeug === 'polygon' ? null : 'polygon'); setRohbau([]); }} />
            <Werkzeugknopf titel="Rechteck zeichnen" kind={Ikone.rechteck}
              aktiv={werkzeug === 'rechteck'}
              onClick={() => { setWerkzeug(werkzeug === 'rechteck' ? null : 'rechteck'); setRohbau([]); }} />
            <span className="my-1 h-px bg-zinc-700" />
            <Werkzeugknopf titel="Als Bild speichern" kind={Ikone.bild} onClick={alsBild} />
          </>
        )}
      </div>

      {zoom > 1.02 && (
        <button onClick={() => zoomeAuf(1)}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute bottom-2 left-2 z-30 rounded-md bg-black/75 px-2.5 py-1
                     text-[11px] text-slate-200 hover:bg-black/90">
          {zoom.toFixed(1)}<T>× · zurücksetzen</T>
        </button>
      )}

      {werkzeug === 'polygon' && (
        <p className="pointer-events-none absolute bottom-2 left-2 z-30 rounded-md
                      bg-black/75 px-2.5 py-1 text-[11px] text-emerald-300">
          <T>Punkte setzen — zum Schließen den ersten Punkt anklicken</T>
        </p>
      )}
      {gesperrt && istAdmin && (
        <p className="pointer-events-none absolute bottom-2 right-2 z-30 rounded-md
                      bg-black/75 px-2.5 py-1 text-[11px] text-amber-300"><T>Karte gesperrt</T></p>
      )}
      {/* Ohne Hinweis waere nicht zu erraten, dass es den Doppelklick braucht. */}
      {darfBauen && !werkzeug && !gewaehlterSpot && spots.length > 0 && (
        <p className="pointer-events-none absolute bottom-2 right-2 z-30 rounded-md
                      bg-black/75 px-2.5 py-1 text-[11px] text-slate-300">
          <T>Doppelklick auf eine Form, um sie zu bearbeiten</T>
        </p>
      )}
    </div>
  );

  /*
   * Breitbild: nicht die Seite verlassen, sondern alles daneben weglassen.
   *
   * Vorher legte sich ein schwarzes Feld ueber das ganze Fenster. Das nimmt
   * einem die Kopfzeile und fuehlt sich an wie ein anderes Programm. Gemeint
   * war etwas Einfacheres: die Listen verschwinden, die Karte zieht sich ueber
   * die volle Breite und steht mittig darin.
   */
  if (vollbild) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-4 text-slate-200">
        {/* Rundherum genau die Farbe, die das Bild an seinem Rand hat.
            Ein eigener, dunklerer Ton - auch ein feiner Verlauf - zieht eine
            sichtbare Kante um die Karte. Nimmt man den gemessenen Eckpunkt
            unveraendert, verschwindet die Grenze und die Karte sitzt in ihrem
            eigenen Wasser. */}
        <div className="relative mx-auto max-w-[1900px] overflow-hidden rounded-xl
                        border border-sky-800/70"
          style={{ background: randFarbe }}>
          <div className="flex items-center justify-center"
            style={{ height: 'calc(100vh - 9rem)' }}>
            {kartenFlaeche}
          </div>
          {/* Hinaus wie hinein: der Knopf oben schaltet auch zurueck, aber
              nach dem Breitziehen sucht man ihn unten an der Kante. */}
          <button onClick={() => setVollbild(false)} title={uebs('Breitbild verlassen')}
            className="absolute bottom-4 right-4 z-40 flex h-9 w-9 items-center
                       justify-center rounded-full border border-zinc-700
                       bg-zinc-900/80 text-slate-300 transition
                       hover:border-sky-500 hover:text-sky-300">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      {/* Bis 1900 statt 1500: auf einem breiten Bildschirm blieben sonst
          links und rechts mehrere hundert Punkte ungenutzt. */}
      <div className="mx-auto max-w-[1900px]">

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">
              {/* Beide Faelle gehoeren durch die Uebersetzung: die feste
                  Ueberschrift ebenso wie der Standardtitel, solange ihn
                  niemand ueberschrieben hat. */}
              {istAdmin && !direkt ? uebs('Turnierkarte') : uebs(titel)}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {!istAdmin || direkt
                ? uebs('Wer wo landet. Ortsnamen und Breitbild lassen sich rechts umschalten.')
                : ausTurnier
                ? (bearbeitenAn
                    ? 'Veröffentlichte Turnierkarte — Bearbeiten ist an.'
                    : 'Veröffentlichte Turnierkarte — nur Ansicht. '
                      + 'Zum Ändern unten auf „Diese Karte bearbeiten“ klicken.')
                : 'Formen bleiben je Kartenbild gespeichert, Spieler startest du jedes Mal neu.'}
            </p>
            {istAdmin && ausTurnier && !direkt && (
              <button onClick={() => setBearbeitenAn((v) => !v)}
                className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5
                            py-1 text-xs transition ${bearbeitenAn
                  ? 'border-sky-500 bg-sky-950/40 text-sky-200'
                  : 'border-zinc-700 text-slate-300 hover:border-zinc-500'}`}>
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
                </svg>
                {bearbeitenAn ? 'Bearbeiten beenden' : 'Diese Karte bearbeiten'}
              </button>
            )}
          </div>
          <div className="text-right text-xs text-slate-500">
            {bildId ? (
              <p className="text-emerald-400">
                {bilder.find((b) => b.id === bildId)?.titel ?? "Eigenes Kartenbild"}
              </p>
            ) : karte?.stand ? (
              <p>
                <T>Fortnite-Karte vom</T>{" "}
                <span className="text-slate-300">
                  {new Date(karte.stand).toLocaleDateString("de-DE",
                    { day: "2-digit", month: "long", year: "numeric" })}
                </span>
                {karte.tageAlt !== null && karte.tageAlt > 3 && (
                  <span className="text-amber-400"> · {karte.tageAlt} {uebs('Tage alt')}</span>
                )}
              </p>
            ) : null}
            <p>{spots.length} <T>Spots</T> · {teams.length} <T>Teams</T></p>
          </div>
        </div>

        {/* Kam man ueber einen Link von der Eventseite, gehoert der Rueckweg
            sichtbar hierher - und die zweite Karte desselben Spieltags gleich
            daneben. */}
        {offeneKarte && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <a href={offeneKarte.cupId
              ? `/events/${encodeURIComponent(offeneKarte.cupId)}`
              : '/events'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700
                         px-3 py-1.5 text-xs text-slate-300 transition
                         hover:border-sky-500 hover:text-sky-400">
              <T>← Zurück</T>{offeneKarte.cupTitel
                ? ` ${uebs('zu')} ${offeneKarte.cupTitel}` : ` ${uebs('zum Event')}`}
            </a>

            {geschwister.length > 1 && (
              <>
                <span className="text-[11px] text-slate-600">
                  {geschwister.length} <T>Karten zu diesem Spieltag:</T>
                </span>
                {geschwister.map((k) => (
                  <a key={k.id} href={`/karten?id=${encodeURIComponent(k.id)}`}
                    title={k.spiele ? `Gilt für ${k.spiele}` : undefined}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      k.id === offeneKarte.id
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                    {k.bildTitel ?? k.titel}
                    {k.spiele && (
                      <span className="ml-1.5 text-[10px] text-slate-500">{k.spiele}</span>
                    )}
                  </a>
                ))}
              </>
            )}
          </div>
        )}

        {istAdmin && !direkt && (
          <div className="mb-3 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3
                          sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs text-slate-400">
              Titel
              <input value={titel}
                onChange={(e) => { titelVomNutzer.current = true; setTitel(e.target.value); }}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none focus:border-sky-500" />
            </label>
            {/* Suchen und Auswaehlen in einem Feld. Vorher standen Suchfeld,
                Klappliste und Zaehlung untereinander - diese Spalte war dadurch
                dreimal so hoch wie die anderen und die ganze Leiste sass schief. */}
            <div className="relative text-xs text-slate-400">
              Cup <span className="text-slate-600">({cups.length})</span>
              <input
                value={cupOffen ? cupSuche : gewaehlterCupText}
                onChange={(e) => { setCupSuche(e.target.value); setCupOffen(true); }}
                onFocus={() => { setCupSuche(''); setCupOffen(true); }}
                onBlur={() => setCupOffen(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCupOffen(false);
                  if (e.key === 'Enter' && cupListe[0]) {
                    e.preventDefault();
                    cupGewaehlt(cupListe[0].cup); setCupOffen(false);
                  }
                }}
                placeholder={uebs('suchen — Name, Datum, Art')}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none placeholder:text-slate-600
                           focus:border-sky-500" />
              {cupOffen && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72
                                overflow-y-auto rounded-lg border border-zinc-700
                                bg-zinc-950 shadow-xl">
                  {cupListe.length ? cupListe.map((x) => (
                    // onMouseDown statt onClick: sonst schliesst der Fokusverlust
                    // die Liste, bevor der Klick ankommt.
                    <button key={x.cup.id} type="button"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        cupGewaehlt(x.cup); setCupOffen(false);
                      }}
                      className={`block w-full border-b border-zinc-900 px-3 py-1.5
                                  text-left text-[11px] last:border-0 hover:bg-zinc-900 ${
                        cupId === x.cup.id ? 'text-sky-400' : 'text-slate-200'}`}>
                      {x.etikett}
                    </button>
                  )) : (
                    <p className="px-3 py-2 text-[11px] text-slate-500">
                      <T>kein Cup passt zur Suche</T>
                    </p>
                  )}
                </div>
              )}
            </div>
            <label className="text-xs text-slate-400">
              <T>Spieltag</T>
              <select value={fensterId}
                onChange={(e) => {
                  setFensterId(e.target.value);
                  const f = fenster.find((x) => x.windowId === e.target.value);
                  if (!titelVomNutzer.current) setTitel(kartenTitel(cup?.titel, f, uebs) || 'Neue Turnierkarte');
                  stelleWiederHer(e.target.value, bildId, gespeicherte);
                }}
                disabled={!fenster.length}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none focus:border-sky-500
                           disabled:opacity-40">
                <option value="">— auswählen —</option>
                {fenster.map((f) => (
                  <option key={f.windowId} value={f.windowId}>
                    {f.region} · {new Date(f.begin).toLocaleDateString('de-DE',
                      { day: '2-digit', month: '2-digit' })}{f.istFinale ? ' · Finale' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Spiele
              {/* Freitext, weil Epic nicht mitteilt, welche Runde auf welcher
                  Insel laeuft. Leer heisst: gilt fuer den ganzen Spieltag. */}
              <input value={spiele}
                onChange={(e) => {
                  setSpiele(e.target.value);
                }}
                placeholder="z. B. 1–5"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none placeholder:text-slate-600
                           focus:border-sky-500" />
            </label>
            <label className="text-xs text-slate-400">
              <T>Nur die besten</T>
              <input value={teamGrenze} inputMode="numeric"
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setTeamGrenze(Number.isFinite(n) ? n : 0);
                }}
                title={uebs('Wie viele Teams geladen werden. Für eine Finalkarte zählt '
            + 'nur, wer weitergekommen ist.')}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none focus:border-sky-500" />
            </label>
            <button onClick={ladeTeams} disabled={!fensterId || laedtTeams}
              title={fensterId && vorrundeZu(fensterId)
                ? 'Hat das Finale noch keine eigenen Ergebnisse, kommen die '
                  + 'Qualifizierten der Vorrunde'
                : undefined}
              className="self-end rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium
                         text-slate-100 transition hover:bg-zinc-700 disabled:opacity-40">
              {laedtTeams ? 'lädt…' : 'Teams laden'}
            </button>
            <label className="text-xs text-slate-400">
              Kartenbild
              <select value={bildId}
                onChange={(e) => {
                  setBildId(e.target.value); setBildStand(Date.now());
                  // Zu jeder Insel gehoert eine eigene Zuordnung.
                  stelleWiederHer(fensterId, e.target.value, gespeicherte);
                }}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                           text-sm text-slate-100 outline-none focus:border-sky-500">
                {/* Die Karte, die live von der Kartenquelle kommt. Es ist die
                    einzige, die es dort gibt - Reload-Karten liefert sie nicht. */}
                <option value="">Battle Royale</option>
                {bilder.map((b) => (
                  <option key={b.id} value={b.id}>{b.titel}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col items-stretch justify-end gap-1">
              <button onClick={() => speichern()}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white
                           transition hover:bg-sky-400">
                <T>Speichern</T>
              </button>
              {/* Ohne diese Zeile waere ein stilles Speichern von einem
                  stillen Verlieren nicht zu unterscheiden. */}
              {selbstGesichert && (
                <span className="text-center text-[10px] text-emerald-500">
                  <T>von selbst gesichert</T>{' '}
                  {new Date(selbstGesichert).toLocaleTimeString('de-DE')}
                </span>
              )}
            </div>

            {/*
              * Eine fremde Karte als Pause darunterlegen.
              *
              * Strg+V genuegt; der Knopf ist fuer alle, bei denen die
              * Zwischenablage nicht mitspielt. Das Bild bleibt im Browser -
              * es wird nirgends hochgeladen und ist beim Neuladen fort.
              */}
            {istAdmin && (
              <div className="flex flex-col items-stretch justify-end gap-1">
                {!pause ? (
                  <label className="cursor-pointer rounded-lg border border-dashed
                                    border-zinc-700 px-4 py-2 text-center text-[11px]
                                    text-slate-400 transition hover:border-sky-600
                                    hover:text-sky-400">
                    <T>Fremde Karte einfügen (Strg+V)</T>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const d = e.target.files?.[0];
                        if (!d) return;
                        const leser = new FileReader();
                        leser.onload = () => setPause(String(leser.result));
                        leser.readAsDataURL(d);
                      }} />
                  </label>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="range" min={10} max={100} value={pauseKlar}
                        onChange={(e) => setPauseKlar(Number(e.target.value))}
                        className="w-28 accent-sky-500" />
                      <button onClick={() => setPause(null)}
                        className="rounded-lg border border-zinc-700 px-2 py-1
                                   text-[11px] text-slate-400 transition
                                   hover:border-red-500 hover:text-red-400">
                        <T>Vorlage weg</T>
                      </button>
                    </div>
                    <span className="text-center text-[10px] text-slate-500">
                      <T>Vorlage liegt darunter — zeichne deine Formen darüber.</T>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Kartenbilder waehlen und hochladen gehoert in den Adminbereich.
            Wer ueber die Eventseite auf einen bestimmten Spieltag kommt, hat
            sein Bild schon - er will Formen und Spieler anfassen, nicht die
            Insel wechseln. */}
        {istAdmin && !direkt && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border
                          border-zinc-800 bg-zinc-900/40 px-3 py-1.5">
            <span className="text-xs text-slate-400"><T>Eigene Karten:</T></span>
            {bilder.map((b) => (
              <span key={b.id}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                  bildId === b.id ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                                  : "border-zinc-800 text-slate-300"}`}>
                {benennt === b.id ? (
                  <>
                    {/* Umbenennen statt neu hochladen: die Datei bleibt, nur
                        der Name aendert sich - so behalten schon gespeicherte
                        Turnierkarten ihr Bild. */}
                    <input autoFocus value={benenntTitel}
                      onChange={(e) => setBenenntTitel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') bildUmbenennen(b.id, benenntTitel);
                        if (e.key === 'Escape') setBenennt(null);
                      }}
                      list="kartenvorlagen"
                      className="w-44 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5
                                 text-[11px] text-slate-100 outline-none focus:border-sky-500" />
                    <button onClick={() => bildUmbenennen(b.id, benenntTitel)}
                      title={uebs('Übernehmen')} className="text-emerald-400 hover:text-emerald-300">✓</button>
                    <button onClick={() => setBenennt(null)}
                      title={uebs('Abbrechen')} className="text-slate-500 hover:text-slate-300">×</button>
                  </>
                ) : (
                  <>
                    {b.titel}
                    {/* Bewusst ohne Loeschknopf: ein Fehlklick hat hier schon
                        eine Karte gekostet, und die Bilder sind nicht wieder
                        zu beschaffen. Umbenennen genuegt zum Aufraeumen. */}
                    <button onClick={() => { setBenennt(b.id); setBenenntTitel(b.titel); }}
                      title="Umbenennen"
                      className="text-slate-500 hover:text-sky-400">✎</button>
                  </>
                )}
              </span>
            ))}
            <input value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)}
              placeholder={uebs('Name der neuen Karte')}
              list="kartenvorlagen"
              className="w-52 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1
                         text-[11px] text-slate-100 outline-none focus:border-sky-500" />
            <datalist id="kartenvorlagen">
              <option value="Battle Royale - CH7 S4" />
              <option value="Battle Royale - CH7 S3" />
              <option value="Reload - Slurpush" />
              <option value="Reload - Elite Stronghold" />
            </datalist>
            <label className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] ${
              neuerTitel.trim() ? "border-sky-500 bg-sky-950/40 text-sky-400"
                                : "border-zinc-800 text-slate-600"}`}>
              PNG hochladen
              <input type="file" accept="image/*" className="hidden"
                disabled={!neuerTitel.trim()}
                onChange={(e) => {
                  const d = e.target.files?.[0];
                  if (d) bildHochladen(d, neuerTitel.trim());
                  e.target.value = "";
                }} />
            </label>
            <span className="text-[10px] text-slate-600">
              <T>erst benennen, dann Datei wählen</T>
            </span>
          </div>
        )}

        {veroeffentlicht && (
          <div className={`mb-4 rounded-xl border p-3 text-xs ${
            veroeffentlicht.cup && veroeffentlicht.spieltag
              ? 'border-emerald-700/60 bg-emerald-950/25'
              : 'border-amber-700/60 bg-amber-950/25'}`}>
            {veroeffentlicht.cup && veroeffentlicht.spieltag ? (
              <>
                <p className="font-semibold text-emerald-300">
                  <T>Gespeichert und öffentlich sichtbar</T>
                </p>
                <p className="mt-1 text-slate-300">
                  Jeder findet die Karte jetzt unter{' '}
                  <span className="text-slate-100">Events → {veroeffentlicht.cup} → Spieltag
                  {' '}{veroeffentlicht.spieltag}</span> über den Knopf „Karte öffnen“.
                  {' '}Bestehende Seiten aktualisieren sich binnen 20 Sekunden von selbst.
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <a href={`/events/${cupId}`} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-emerald-700 px-2 py-1
                               text-emerald-200 hover:border-emerald-500">
                    <T>Eventseite öffnen</T>
                  </a>
                  <a href={`/karten?id=${encodeURIComponent(veroeffentlicht.id)}`}
                    target="_blank" rel="noreferrer"
                    className="rounded-lg border border-zinc-700 px-2 py-1
                               text-slate-300 hover:border-zinc-500">
                    So sehen es Besucher
                  </a>
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-amber-300">
                  <T>Gespeichert — aber noch nicht öffentlich</T>
                </p>
                <p className="mt-1 text-slate-300">
                  Ohne <span className="text-slate-100">Cup</span> <T>und</T>
                  {' '}<span className="text-slate-100"><T>Spieltag</T></span> fehlt die Zuordnung,
                  deshalb taucht die Karte bei den Events nicht auf. Beides oben auswählen
                  und noch einmal speichern.
                </p>
              </>
            )}
          </div>
        )}

        {status && <p className="mb-3 text-xs text-slate-500">{status}</p>}

        {/* Drei Spalten: links die Turnierkarten, in der Mitte die Karte,
            rechts die Teams. Die Karte steht damit mittig im Bild, statt an
            den linken Rand gedrueckt zu sein. */}
        {/* Das Raster nimmt nur so viel Breite, wie sein Inhalt braucht, und
            sitzt mittig. Vorher spannte es sich ueber die ganze Seite: die
            Karte stand dann mittig in ihrer Spalte, die Listen klebten aussen
            am Rand, und dazwischen blieben je gut zweihundert Punkte leer.
            Jetzt liegt der freie Platz aussen, wo er nicht stoert. */}
        <div className={`grid gap-4 lg:mx-auto lg:w-fit ${direkt
          ? 'lg:grid-cols-[auto_360px]' : 'lg:grid-cols-[224px_auto_360px]'}`}>

          {/* Die linke Spalte faellt beim direkten Weg ganz weg - eine leere
              Spalte wuerde die Karte trotzdem aus der Mitte schieben. */}
          {!direkt && (
          <div className="flex flex-col gap-3">
          {/* Alle Turnierkarten - auch die ausgeblendeten */}
          {istAdmin && !direkt && (gespeicherte.length > 0 || offeneFinals.length > 0) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h2 className="mb-1 text-sm font-semibold text-slate-100">
                Turnierkarten ({gespeicherte.length})
              </h2>
              <p className="mb-2 text-[11px] text-slate-500">
                <T>Ausgeblendete Karten bleiben hier stehen — nichts geht verloren.</T>
              </p>
              <div className="space-y-1">
                {gespeicherte.map((k) => {
                  const sichtbar = k.oeffentlich !== false;
                  return (
                    <div key={k.id}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5
                                  text-xs transition ${k.titel === titel
                        ? 'border-sky-500 bg-sky-950/30'
                        : 'border-zinc-800 hover:border-zinc-700'}`}>
                      <a href={`/karten?id=${encodeURIComponent(k.id)}`}
                        className="min-w-0 flex-1 truncate text-left text-slate-300
                                   hover:text-sky-400">
                        {k.titel}
                        <span className="ml-1.5 text-[10px] text-slate-500">
                          {k.bildTitel ?? 'Battle Royale'}
                          {k.cupTitel ? ` · ${k.cupTitel}` : ''}
                        </span>
                      </a>
                      {!sichtbar && (
                        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5
                                         text-[10px] text-slate-400">versteckt</span>
                      )}
                      <button onClick={() => sichtbarkeit(k.id, !sichtbar)}
                        title={sichtbar
                          ? 'Öffentlich ausblenden — die Karte bleibt erhalten'
                          : 'Wieder öffentlich zeigen'}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none
                                    transition ${sichtbar
                          ? 'text-rose-400 hover:bg-rose-950 hover:text-rose-200'
                          : 'text-emerald-400 hover:bg-emerald-950 hover:text-emerald-200'}`}>
                        {sichtbar ? '×' : '↩'}
                      </button>
                      {/* Endgueltig - im Unterschied zum Kreuz daneben. */}
                      <button onClick={() => karteLoeschen(k.id, k.titel)}
                        title={uebs('Endgültig löschen — Formen und Verteilung sind dann weg')}
                        className="shrink-0 rounded px-1 py-0.5 text-[11px] leading-none
                                   text-slate-600 transition hover:bg-rose-950
                                   hover:text-rose-300">
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Finaltage ohne Karte - ein Klick legt sie an. */}
              {offeneFinals.length > 0 && (
                <>
                  <h3 className="mb-1 mt-3 text-[11px] font-semibold uppercase
                                 tracking-wide text-slate-500">
                    <T>Finale ohne Karte</T> ({offeneFinals.length})
                  </h3>
                  <div className="space-y-1">
                    {offeneFinals.map((f) => (
                      <a key={f.windowId}
                        href={`/karten?event=${encodeURIComponent(f.eventId)}`
                          + `&window=${encodeURIComponent(f.windowId)}`}
                        className="flex items-center gap-1 rounded-lg border border-dashed
                                   border-zinc-800 px-2 py-1.5 text-xs text-slate-400
                                   transition hover:border-sky-700 hover:text-sky-400">
                        <span className="min-w-0 flex-1 truncate">
                          {kartenTitel(f.cupTitel, f, uebs) || f.windowId}
                          <span className="ml-1.5 text-[10px] text-slate-600">
                            {f.region} · {new Date(f.begin).toLocaleDateString('de-DE',
                              { day: '2-digit', month: '2-digit' })}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          </div>
          )}

          {/* Ohne Rahmen und Polsterung: beides kostete Hoehe, ohne etwas
              beizutragen - die Karte bringt ihre eigene Kante schon mit. */}
          <div ref={kartenSpalte}>
            {kartenFlaeche}
          </div>

          {/* Genauso hoch wie die Karte daneben. Vorher lief die Teamliste
              unten darueber hinaus und die Seite bekam eine zweite Laenge,
              die nur aus Namen bestand. */}
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden"
            style={kartenHoehe ? { maxHeight: kartenHoehe } : undefined}>

            {/* Gewaehlte Form */}
            {darfBauen && gewaehlterSpot && (
              <div className="rounded-xl border border-sky-800/60 bg-sky-950/20 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={gewaehlterSpot.name ?? ''}
                    onChange={(e) => { formenVomNutzer.current = true; inhaltVomNutzer.current = true;
                      setSpots((alt) => alt.map((s) =>
                        s.id === gewaehlterSpot.id ? { ...s, name: e.target.value } : s)); }}
                    placeholder="Beschriftung (optional)"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1
                               text-xs text-slate-100 outline-none focus:border-sky-500" />
                  <button onClick={() => spotLoeschen(gewaehlterSpot.id)}
                    className="shrink-0 rounded border border-rose-800/60 px-2 py-1 text-[11px]
                               text-rose-300 hover:border-rose-600">
                    <T>Form löschen</T>
                  </button>
                </div>

                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400"><T>Farbe</T></span>
                  <input type="color" value={gewaehlterSpot.farbe ?? '#38bdf8'}
                    onChange={(e) => { formenVomNutzer.current = true; inhaltVomNutzer.current = true;
                      setSpots((alt) => alt.map((s) =>
                        s.id === gewaehlterSpot.id ? { ...s, farbe: e.target.value } : s)); }}
                    title={uebs('Eigene Farbe für diese Form')}
                    className="h-6 w-10 cursor-pointer rounded border border-zinc-700
                               bg-zinc-950 p-0.5" />
                  {gewaehlterSpot.farbe && (
                    <button
                      onClick={() => { formenVomNutzer.current = true; inhaltVomNutzer.current = true;
                        setSpots((alt) => alt.map((s) =>
                          s.id === gewaehlterSpot.id ? { ...s, farbe: undefined } : s)); }}
                      className="text-[11px] text-slate-400 underline hover:text-slate-200">
                      <T>automatisch</T>
                    </button>
                  )}
                  <span className="ml-auto text-[10px] text-slate-500">
                    <T>ohne eigene Farbe: schwarz bei einem, rot bei zwei Teams</T>
                  </span>
                </div>
                {gewaehlterSpot.teams.length ? (
                  <div className="flex flex-wrap gap-1">
                    {gewaehlterSpot.teams.map((tid) => {
                      const t = teams.find((x) => x.id === tid);
                      if (!t) return null;
                      return (
                        <button key={tid} onClick={() => teamAbziehen(tid)}
                          title={uebs('Aus der Form entfernen')}
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5
                                     text-[11px] text-slate-200 hover:border-rose-600">
                          {t.spieler.map(kuerze).join(' + ')} ×
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    <T>Team aus der Liste auf die Form ziehen.</T>
                  </p>
                )}
              </div>
            )}

            {/* Teamliste */}
            <div className="flex min-h-0 flex-col rounded-xl border border-zinc-800
                            bg-zinc-900/40 p-3">

              {/* Das eigene Duo, angeheftet.
                  Wer sich in einer Liste mit fuenfzig Namen suchen muss, um zu
                  sehen, ob er ueberhaupt drinsteht, sucht zu lange. Bewusst
                  dieselbe Zeile wie unten in der Liste, nur blau: eine eigens
                  gestaltete Kachel mit Ueberschrift und Erklaerzeilen faellt
                  aus der Reihe und braucht mehr Platz, als sie wert ist. */}
              {meinTeam && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-100">
                      <T>Dein Team</T>
                    </h2>
                  </div>
                  <div
                    draggable={darfMichSetzen || darfBauen}
                    onDragStart={(e) => e.dataTransfer.setData('text/team', meinTeam.id)}
                    onClick={() => { if (!meinSpot) return;
                      setGewaehlt(meinSpot.id); gewaehltRef.current = meinSpot.id;
                      zeigeSpot(meinSpot); }}
                    title={meinSpot ? uebs('Auf der Karte zeigen') : undefined}
                    className={`mb-3 flex items-center gap-2.5 rounded-lg border
                                border-sky-700 bg-sky-950/40 px-3 py-2.5 text-[13px]
                                transition hover:border-sky-500 ${meinSpot ? 'cursor-zoom-in'
                      : darfMichSetzen || darfBauen ? 'cursor-grab' : ''}`}>
                    <TeamFlagge groesse={24} laender={laenderVon(meinTeam)} />
                    <span className="truncate text-sky-100">
                      {meinTeam.spieler.map(kuerze).join(' + ')}
                    </span>
                    {meinSpot && (
                      <span className="ml-auto shrink-0 text-[10px] text-sky-400/80">
                        {meinSpot.name ?? uebs('gesetzt')}
                      </span>
                    )}
                    {/* Herunternehmen mit demselben Zeichen wie beim Betreiber.
                        Als Admin geht das ueber den gewohnten Weg samt
                        Selbstspeichern, als Pro ueber die eigene Schnittstelle. */}
                    {meinSpot && (darfMichSetzen || darfBauen) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (darfBauen) teamAbziehen(meinTeam.id);
                          else void michSetzen(null);
                        }}
                        title={uebs('Von der Karte nehmen')}
                        className="shrink-0 text-slate-500 transition hover:text-rose-400">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M5 5l10 10M15 5L5 15" />
                        </svg>
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Teams</h2>
                <span className="text-xs text-slate-500">
                  {spots.reduce((n, s) => n + s.teams.length, 0)}/{teams.length} <T>verteilt</T>
                </span>
              </div>

              {/* Bei fuenfzig Duos ist Scrollen kein Suchen. */}
              {teams.length > 8 && (
                <div className="relative mb-2">
                  <input value={teamSuche}
                    onChange={(e) => setTeamSuche(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setTeamSuche(''); }}
                    placeholder={uebs('Spieler suchen …')}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                               pr-16 text-[13px] text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  {!!teamSuche && (
                    <span className="absolute right-2 top-1/2 flex -translate-y-1/2
                                     items-center gap-1.5">
                      <span className="text-[10px] tabular-nums text-slate-500">
                        {sichtbareTeams.length}
                      </span>
                      <button onClick={() => setTeamSuche('')}
                        title={uebs('Suche leeren')}
                        className="text-slate-500 hover:text-slate-200">×</button>
                    </span>
                  )}
                </div>
              )}
              {/* Ohne diesen Hinweis sieht es aus, als waere das Ziehen kaputt:
                  die Kacheln lassen sich mit der Maus bewegen, aber die Karte
                  nimmt sie nicht an. */}
              {istAdmin && !darfBauen && (
                <p className="mb-2 rounded-lg border border-amber-800/60 bg-amber-950/30
                              px-2 py-1.5 text-[11px] text-amber-200">
                  {gesperrt
                    ? uebs('Die Karte ist gesperrt — zum Verteilen erst das Schloss öffnen.')
                    : uebs('Nur Ansicht — zum Verteilen oben auf „Diese Karte bearbeiten“ klicken.')}
                </p>
              )}
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
                {!sichtbareTeams.length && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    {teams.length
                      ? `${uebs('Kein Team gefunden für')} „${teamSuche}“.`
                      : uebs('Noch keine Teams geladen.')}
                  </p>
                )}
                {sichtbareTeams.map((t) => {
                  const spot = spots.find((s) => s.teams.includes(t.id));
                  const inBearbeitung = bearbeite === t.id;
                  return (
                    <div key={t.id}
                      draggable={darfBauen && !inBearbeitung}
                      onDragStart={(e) => e.dataTransfer.setData('text/team', t.id)}
                      onClick={() => {
                        // Ein Klick springt zur Form dieses Teams - dafuer muss
                        // niemand die Karte absuchen.
                        if (inBearbeitung || !spot) return;
                        setGewaehlt(spot.id); gewaehltRef.current = spot.id;
                        zeigeSpot(spot);
                      }}
                      title={spot ? uebs('Auf der Karte zeigen') : undefined}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5
                                  text-[13px] transition ${spot ? 'cursor-zoom-in' : darfBauen && !inBearbeitung ? 'cursor-grab' : ''} ${
                        spot ? 'border-zinc-700 bg-zinc-950/70 hover:border-sky-700'
                             : 'border-zinc-800 hover:border-zinc-700'}`}>
                      {/* Nur die Flagge. Der bunte Strich davor sagte nichts
                          und stoerte die Reihe - die Herkunft sagt etwas, und
                          wo keine gepflegt ist, laedt die Weltkugel zum
                          Nachtragen ein. */}
                      <TeamFlagge groesse={24} laender={laenderVon(t)} />

                      {inBearbeitung ? (
                        <div className="min-w-0 flex-1 space-y-1.5"
                          onClick={(e) => e.stopPropagation()}>
                          <input value={entwurf} onChange={(e) => setEntwurf(e.target.value)}
                            placeholder={uebs('Name + Name')}
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5
                                       py-1 text-xs text-slate-100 outline-none
                                       focus:border-sky-500" />

                          {/* Je Spieler die Herkunft. Zwei Zeichen genuegen,
                              und die kleine Reihe daneben spart das Tippen -
                              angeboten wird nur, was als Datei vorliegt. */}
                          {t.spieler.map((sp, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={flaggenPfad(landEntwurf[i] || undefined)} alt=""
                                className="h-5 w-5 shrink-0 rounded-full object-cover
                                           ring-1 ring-white/20" />
                              <span className="min-w-0 flex-1 truncate text-[11px]
                                               text-slate-400">
                                {kuerze(sp)}
                              </span>
                              <input value={landEntwurf[i] ?? ''} maxLength={2}
                                onChange={(e) => setLandEntwurf((a) => a.map((v, k) =>
                                  (k === i ? e.target.value.toUpperCase() : v)))}
                                placeholder="—"
                                className="w-11 rounded border border-zinc-700 bg-zinc-900
                                           px-1 py-0.5 text-center text-[11px] uppercase
                                           text-slate-100 outline-none focus:border-amber-600" />
                            </div>
                          ))}
                          <div className="flex max-h-16 flex-wrap gap-0.5 overflow-y-auto">
                            {flaggen.map((f) => (
                              <button key={f} title={f.toUpperCase()}
                                onClick={() => setLandEntwurf((a) => {
                                  // Auf den ersten Spieler ohne Herkunft setzen -
                                  // meist ist genau der gemeint.
                                  const offen = a.findIndex((v) => !v);
                                  const ziel = offen >= 0 ? offen : 0;
                                  return a.map((v, k) => (k === ziel ? f.toUpperCase() : v));
                                })}
                                className="rounded-full p-px ring-1 ring-zinc-800
                                           hover:ring-sky-500">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/flags/${f}.png`} alt={f}
                                  className="h-4 w-4 rounded-full object-cover" />
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                const neu = entwurf.split('+').map((x) => x.trim())
                                  .filter(Boolean);
                                setTeams((alt) => alt.map((x) => x.id === t.id
                                  ? { ...x, spieler: neu } : x));
                                setBearbeite(null);
                                // Dauerhaft merken, damit Name und Flagge beim
                                // naechsten Cup wieder stehen - je Spieler,
                                // ueber die Konto-ID.
                                await flaggenMerken(t, landEntwurf);
                                namenMerken(t, neu);
                              }}
                              className="rounded bg-sky-500 px-2 py-0.5 text-[11px] text-white">
                              ok
                            </button>
                            <button onClick={() => setBearbeite(null)}
                              className="text-[11px] text-slate-500 hover:text-slate-300">
                              abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="truncate text-slate-200">
                            {t.spieler.map(kuerze).join(' + ')}
                          </span>
                          {spot && (
                            <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                              {spot.name ?? uebs('gesetzt')}
                            </span>
                          )}
                          {istAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setBearbeite(t.id);
                                setEntwurf(t.spieler.join(' + '));
                                // Die gepflegte Herkunft vorbelegen, damit man
                                // nur ergaenzt, was noch fehlt.
                                setLandEntwurf(t.spieler.map((_, i) =>
                                  profilVon(t, i)?.land ?? ''));
                              }}
                              title={uebs('Namen und Flaggen bearbeiten')}
                              className={`shrink-0 text-slate-500 hover:text-sky-400 ${spot ? '' : 'ml-auto'}`}>
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none"
                                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                                <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
                              </svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {!teams.length && (
                  <p className="py-6 text-center text-xs text-slate-600">
                    {uebs(istAdmin ? 'Oben einen Cup und Spieltag wählen.' : 'Noch keine Teams eingetragen.')}
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
