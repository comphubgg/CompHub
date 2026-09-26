'use client';

// Prognosen: das Teilnehmerfeld eines Finales in eine Reihenfolge bringen.
//
// Der Betreiber (22.9.2026): "du sollst das komplett neu machen. Fully neu.
// Wie die Events-Tabs aussehen, da kann ich ein Event auswaehlen. Nur grosse
// Events wie Division 1, Finals, maximal 100 Spieler, 50 Teams oder ein
// grosses LAN-Event, mit Bild. Wenn ich da drauf druecke, laedt es mir kurz
// alle Teams. Die haben sich ja mit vorherigen Cups qualifiziert. Das musst
// du dann irgendwie herausfinden."
//
// Also: zuerst Kacheln der kommenden und laufenden grossen Finals (aus dem
// Cup-Katalog, mit Epics Kachelbild), ein Klick laedt das Feld - und das
// kommt aus Epics Marken: jedes Finale verlangt eine Zugangsmarke, die
// Vorrunde vergibt sie bis zu einem Platz (lib/prognoseFeld). Dann Karte,
// Plaetze und Teams wie im Vorbild des Betreibers. Eine Prognose fuer einen
// vergangenen Cup gibt es nicht mehr: "was gibt es fuer Sinn, eine
// Prediction fuer einen vergangenen Cup" - gespeicherte bleiben lesbar.
//
// Alle Namen und Platzierungen stammen aus Epics Turnierdaten. Erfunden wird
// nichts: nennt Epic die Qualifikation noch nicht, steht das so da.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gefaltet, namensSchluessel } from '@/lib/homoglyph';
import TeamFlagge from '@/components/TeamFlagge';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { MARKE } from '@/lib/marke';
import { inselAusPlaylist } from '@/lib/inseln';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
import { gruppenName } from '@/lib/fensterName';
import type { FeldErgebnis, FeldHinweis } from '@/lib/prognoseFeld';
import { GLOBALS_EVENT } from '@/lib/globalsCup';
import {
  kartenSchrift, kartenName, formFarbe, hebeFormHervor, useEchteNamen,
} from '@/app/lib/kartenStil';
import KartenWasserzeichen from '@/app/components/KartenWasserzeichen';
import { useKartenVollbild } from '@/app/components/kartenVollbild';
interface Fenster {
  status: string; begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string; istFinale: boolean;
  /** Epics Playlist - darin die Reload-Insel, siehe lib/inseln.ts. */
  playlist?: string;
  /** Die Zugangsmarken des Fensters und die Marken, die es vergibt. */
  tokens?: string[];
  marken?: Array<{ token: string; bis: number }>;
}
interface Cup {
  id: string; titel: string; art: string;
  bild?: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  live: boolean; vorbei: boolean;
  naechsterStart: number | null;
}

/**
 * Ein Finale, fuer das eine Prognose moeglich ist.
 *
 * Ein Finale kann mehrere Spieltage haben (Day 1, Day 2) - sie verlangen
 * dieselbe Marke und sind hier eine Kachelzeile. "feld" ist die Zahl der
 * Teams, die laut Epics Auszahlungstabellen die Marke bekommen; null, wenn
 * Epic die Vergabe (noch) nicht nennt, etwa beim LAN.
 */
interface Finale {
  cup: Cup; region: string; fenster: Fenster[]; name: string; tokens: string[];
  feld: number | null; begin: number; live: boolean;
  /** Wie viele der vergebenden Spieltage noch nicht gespielt sind. */
  offen: number; naechsteVorrunde: number | null;
}

/** Marken, die keine Qualifikation bedeuten - dieselbe Regel wie lib/prognoseFeld. */
const KEINE_QUALI = /^RegionLock_|^LANSpectator$|^fake_token$|^GroupIdentity_/i;
const echteMarken = (t?: string[]) => (t ?? []).filter((x) => x && !KEINE_QUALI.test(x));

/** Cups, die nie ein grosses Finale sind. */
const KEINE_FINALS = new Set(['ranked', 'mobile', 'skin', 'sonstige']);

/**
 * Die grossen Finals, die noch bevorstehen oder gerade laufen.
 *
 * Gross heisst: ein Spieltag, in den man sich qualifizieren muss und der
 * niemanden mehr weiterschickt, mit hoechstens hundert Qualifizierten -
 * oder ein LAN mit einer Bestenliste fuer alle Regionen. Die Groesse des
 * Feldes kommt aus den Auszahlungstabellen der Vorrunden ("Platz 1 bis 50
 * bekommen die Marke"); Solo Victory Cups mit viertausend Qualifizierten
 * fallen so heraus, Division-1-Finals mit fuenfzig bleiben.
 */
function finalsAus(cups: Cup[]): Finale[] {
  // Wer vergibt welche Marke bis zu welchem Platz - ueber alle Cups.
  const vergeber = new Map<string, Array<{ f: Fenster; bis: number }>>();
  for (const c of cups) {
    for (const [region, liste] of Object.entries(c.regionen)) {
      for (const f of liste) {
        for (const m of f.marken ?? []) {
          if (m.bis > 0) (vergeber.get(m.token) ?? vergeber.set(m.token, []).get(m.token)!).push({ f: { ...f, region }, bis: m.bis });
        }
      }
    }
  }
  const raus: Finale[] = [];
  for (const c of cups) {
    if (KEINE_FINALS.has(c.art) || /division\s*[2-9]/i.test(c.titel)) continue;
    for (const [region, liste] of Object.entries(c.regionen)) {
      const gruppen = new Map<string, Fenster[]>();
      for (const f of liste) {
        if (f.status === 'vorbei') continue;
        // Von Hand nachgetragene Turniere (ohne Endzeit) haben bei Epic
        // weder Bestenliste noch Qualifikation - der FNCS Global
        // Championship stand sonst zweimal da, einmal aus dem Archiv und
        // einmal von Epic. Es zaehlt Epics Fenster.
        if (typeof f.end !== 'number') continue;
        const tokens = echteMarken(f.tokens);
        const vergibt = (f.marken ?? []).some((m) => m.bis > 0);
        const istFinale = c.global || f.istFinale || (tokens.length > 0 && !vergibt);
        if (!istFinale) continue;
        const key = tokens.length ? tokens.slice().sort().join('|') : f.windowId;
        (gruppen.get(key) ?? gruppen.set(key, []).get(key)!).push({ ...f, region });
      }
      for (const fenster of gruppen.values()) {
        fenster.sort((a, b) => a.begin - b.begin);
        const tokens = echteMarken(fenster[0].tokens);
        const quellen = tokens.flatMap((t) => vergeber.get(t) ?? []);
        const feld = quellen.length ? quellen.reduce((s, q) => s + q.bis, 0) : null;
        const zuGross = feld !== null && feld > 100;
        if (zuGross) continue;
        if (feld === null && !c.global && !fenster[0].istFinale) continue;
        const offen = quellen.filter((q) => q.f.status === 'kommt');
        raus.push({
          cup: c, region, fenster, tokens, feld,
          name: gruppenName(fenster.map((f) => f.windowId)),
          begin: fenster[0].begin,
          live: fenster.some((f) => f.status === 'live'),
          offen: offen.length,
          naechsteVorrunde: offen.length ? Math.min(...offen.map((q) => q.f.begin)) : null,
        });
      }
    }
  }
  return raus.sort((a, b) => a.begin - b.begin);
}
interface Eintrag {
  rank: number; points: number;
  players: Array<{ name: string; id?: string }>;
}
interface Profil {
  land?: string; anzeige?: string; namen?: string[]; name?: string;
  /* Beim Setzen einer Flagge muessen diese Angaben mitgeschickt werden,
     sonst schreibt der Speichervorgang sie weg. */
  x?: string; region?: string;
}
interface Punkt { x: number; y: number }
interface Spot {
  id: string; form: string; punkte: Punkt[]; name?: string;
  /* Muss mitgefuehrt werden, auch wenn diese Seite sie nicht selbst vergibt:
     sonst faellt eine im Karteneditor gesetzte Farbe beim Speichern weg. */
  farbe?: string;
}

/** Wie nah am ersten Punkt schliesst eine freie Form? In Prozent der Karte. */
const SCHLIESS_NAEHE = 2.2;

function rechteckPunkte(a: Punkt, b: Punkt): Punkt[] {
  return [
    { x: a.x, y: a.y }, { x: b.x, y: a.y },
    { x: b.x, y: b.y }, { x: a.x, y: b.y },
  ];
}
interface Kartenbild { id: string; titel: string }

/** Liegt der Punkt in der Flaeche? Strahlenverfahren, fuer das Ablegen. */
function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
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
    if ((a.y > y) === (b.y > y)) continue;
    schnitte.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (schnitte.length < 2) return null;
  const links = Math.min(...schnitte), rechts = Math.max(...schnitte);
  return { mitte: (links + rechts) / 2, breite: rechts - links };
}

/**
 * Schriftgroesse, damit die Zeile in die Form passt: begrenzt einmal durch die
 * Hoehe, die einem Team zusteht, und einmal durch die Breite des laengsten
 * Namens. Der Wert gilt in Prozent der Kartenbreite.
 */
function schriftgroesse(breite: number, hoehe: number, zeichen: number) {
  const nachHoehe = hoehe * 0.6;
  // Grossbuchstaben in Alata brauchen gut sechs Zehntel der Hoehe an Breite
  // je Zeichen. 0,92 heisst: die Zeile darf 92 Prozent der Formbreite nehmen.
  const nachBreite = (breite * 0.92) / Math.max(zeichen * 0.62, 1);
  return Math.max(0.5, Math.min(nachHoehe, nachBreite, 2.4));
}

/** Der umschliessende Rahmen einer Form, in Prozent. */
function rahmen(punkte: Punkt[]) {
  const xs = punkte.map((q) => q.x), ys = punkte.map((q) => q.y);
  const links = Math.min(...xs), oben = Math.min(...ys);
  return {
    links, oben,
    breite: Math.max(...xs) - links,
    hoehe: Math.max(...ys) - oben,
  };
}

/** Ein Team im Feld - zusammengefasst ueber alle herangezogenen Spieltage. */
interface TeamImFeld {
  /** Eindeutiger Schluessel, gebildet aus den Konto-Ids oder Namen. */
  key: string;
  namen: string[];
  ids: string[];
  /** Woher es kommt, fuer die Anzeige: "Tag 1 · #3". */
  herkunft: string[];
  /** Bester Platz ueber alle Quellen - dient als Vorschlagsreihenfolge. */
  besterPlatz: number;
  /** Die Region des Spieltags, aus dem das Team kommt - fuer die Gruppen rechts. */
  region: string;
}

interface Quelle {
  eventId: string; windowId: string; region: string; titel: string;
  topN: number | null;
}

/**
 * Eine Karte innerhalb einer Prognose.
 *
 * Ein Spieltag kann auf mehreren Karten laufen - bei der Reload Elite Series
 * etwa die ersten Runden auf Slurpush und die restlichen auf Stronghold. Die
 * erwartete Reihenfolge ist dabei ein und dieselbe, nur die Karte darunter
 * wechselt. Sie haengt deshalb hier und nicht an der Prognose: die
 * Reihenfolge wird einmal gepflegt, die Karten so oft wie noetig.
 */
interface Karte {
  id: string;
  bildId: string;
  titel: string;
  spots: Spot[];
  aufSpot: Record<string, string[]>;
  /**
   * Steht der Schnappschuss? Dann kein Bildwechsel mehr.
   *
   * Frisch angelegte Karten holen ihre Formen noch aus der Vorlage und
   * lassen sich umstellen. Mit dem Speichern gehoeren sie der Prognose.
   */
  eigen: boolean;
}

/** Das Finale, fuer das eine Prognose gilt - so gespeichert, dass die Kachel es wiederfindet. */
interface Ziel {
  cupId: string; eventId: string; windowId: string; region: string; begin: number; name: string;
}

interface Prognose {
  id: string; titel: string; cupId: string; cupTitel: string;
  gruppe?: string; qualiBis?: number;
  quellen: Quelle[]; plaetze: Array<string | null>;
  /** Der MVP - ein Spielername, frei gewaehlt. */
  mvp?: string;
  /** Das Feld, wie es beim Speichern stand - damit die Prognose auch dann lesbar bleibt, wenn Epic die Vorrunde nicht mehr liefert. */
  feld?: TeamImFeld[];
  ziel?: Ziel;
  /** Die Karten dieser Prognose - Schnappschuesse, keine Verweise. */
  karten?: Array<{
    id: string; bildId: string; titel: string;
    spots: Spot[]; aufSpot: Record<string, string[]>;
  }>;
  /* Aeltere Eintraege haben stattdessen eine einzelne Karte. */
  bildId?: string; kartenTitel?: string;
  spots?: Spot[]; aufSpot?: Record<string, string[]>;
  geaendert: number; oeffentlich: boolean;
}

/** "1st", "2nd", "3rd", "4th" ... "21st" - die Beschriftung der Plaetze. */
function ordnung(n: number): string {
  const rest10 = n % 10; const rest100 = n % 100;
  const endung = rest100 >= 11 && rest100 <= 13 ? 'th'
    : rest10 === 1 ? 'st' : rest10 === 2 ? 'nd' : rest10 === 3 ? 'rd' : 'th';
  return `${n}${endung}`;
}

/** Die Regionen rechts in der Reihenfolge der Seite - Europa zuerst. */
const REGION_REIHE = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'];

/*
 * Der Name im Feld und auf der Karte: aus "[EWC2026] AURA shxrk 7" wird
 * "SHXRK". Komplett gross, wie auf jeder Karte - der Betreiber (24.9.2026):
 * "Mach alle Buchstaben immer komplett gross geschrieben. Alle, alle."
 */
function kurz(name: string) {
  return kartenName(name);
}

function tag(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/**
 * Das Prognose-Werkzeug.
 *
 * Zweimal dieselbe Arbeit: unter /admin/predictions fuer jedes grosse
 * Finale, unter /globals/predictions nur fuer die Global Championship. Der
 * Betreiber dort: "bei Prediction kann man, wieso auch immer, andere Cups
 * auswaehlen ... die Spieler laden nicht ... und ich soll auch nicht die
 * Maps switchen koennen oder Shapes hinzufuegen koennen."
 *
 * In der Globals-Fassung steht deshalb fest:
 *   - der Cup - das Werkzeug waehlt ihn selbst, eine Kachelwahl gibt es nicht;
 *   - das Feld - aus Epics Teilnehmerliste (/api/globals-teams). Epics
 *     Marken helfen beim LAN nicht: welche Runde die Marke "MannekenPis"
 *     vergibt, nennt Epic nicht, und so blieb das Feld leer;
 *   - die Karte - die Formen der Globals-Turnierkarte, die er unter /maps
 *     gezeichnet hat. Kein Kartenwechsel, keine neuen Formen.
 *
 * Und mit "eigen" gehoert die Prognose dem, der sie macht: jeder VIP mit dem
 * Globals-Bereich hat seine eigene (/api/meine-prognose) und sieht die des
 * Admins nicht. Der Betreiber: "als VIP seine eigene Prediction machen kann,
 * nicht die vom Admin zu sehen ist - das einzige, was nur der Admin machen
 * muss, ist die Map." Gespeichert wird von selbst, ohne Knopf; die Stifte
 * zum Pflegen von Flaggen und Namen bleiben dem Admin.
 */
/*
 * Die Wahl des MVP.
 *
 * Vorher ein freies Feld mit den Vorschlaegen des Browsers - nur Namen, und
 * wer sich vertippte, hatte einen MVP, den es nicht gibt. Der Betreiber
 * (24.9.2026): "wenn ich da Leute suche, soll eine Liste kommen mit den
 * Spielern ... von der Liste rechts, mit Flagge vorne dran und welcher
 * Region, dass man die auswaehlen kann." Uebernommen wird nur, was in der
 * Liste angeklickt wird.
 */
interface MvpSpieler { name: string; land?: string | null; region: string; schluessel: string }
function MvpWahl({ wert, setzen, spieler, gross }: {
  wert: string; setzen: (name: string) => void; spieler: MvpSpieler[]; gross: boolean;
}) {
  const uebs = useT();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? spieler.filter((x) => x.name.toLowerCase().includes(q)) : spieler;
  }, [spieler, suche]);
  const waehle = (x: MvpSpieler) => { setzen(x.name); setOffen(false); setSuche(''); };

  return (
    <div className="relative min-w-0 flex-1">
      <input value={offen ? suche : wert}
        onFocus={() => { setOffen(true); setSuche(''); }}
        onChange={(e) => { setSuche(e.target.value); setOffen(true); }}
        onBlur={() => setTimeout(() => setOffen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && treffer[0]) { e.preventDefault(); waehle(treffer[0]); }
          if (e.key === 'Escape') setOffen(false);
        }}
        placeholder={uebs('Spieler suchen …')}
        className="w-full min-w-0 bg-transparent text-slate-100 outline-none placeholder:text-slate-600" />
      {offen && (
        // Nach oben: der MVP steht unten in der Liste, darunter ist kein Platz.
        <ul className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-72 overflow-y-auto rounded-lg
                       border border-zinc-700 bg-zinc-950 py-1 shadow-2xl">
          {treffer.length ? treffer.map((x) => (
            <li key={x.schluessel}>
              <button type="button"
                // Vor dem Verlassen des Feldes waehlen, sonst schliesst die Liste zuerst.
                onMouseDown={(e) => { e.preventDefault(); waehle(x); }}
                className={`flex w-full items-center gap-2 px-2.5 text-left transition hover:bg-zinc-800 ${
                  gross ? 'py-2 text-[15px]' : 'py-1.5 text-[12px]'} ${x.name === wert ? 'bg-amber-500/10' : ''}`}>
                <TeamFlagge laender={[x.land]} groesse={gross ? 22 : 18} />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{x.name}</span>
                {x.region && (
                  <span className="shrink-0 rounded border border-zinc-700 px-1.5 text-[10px] font-semibold
                                   text-slate-400">{x.region}</span>
                )}
              </button>
            </li>
          )) : (
            <li className="px-2.5 py-2 text-[12px] text-slate-500"><T>Kein Spieler gefunden</T></li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function PrognosenWerkzeug({ globals = false, eigen = false }: {
  globals?: boolean;
  eigen?: boolean;
} = {}) {
  const uebs = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [cups, setCups] = useState<Cup[]>([]);
  const [cupsLaden, setCupsLaden] = useState(true);
  const [cupId, setCupId] = useState('');
  /** Das gewaehlte Finale - solange keins gewaehlt ist, stehen die Kacheln. */
  const [ziel, setZiel] = useState<Ziel | null>(null);
  /** Was Epic zum Feld sagt - Herkunft, Pruefung, was noch fehlt. */
  const [feldHinweise, setFeldHinweise] = useState<FeldHinweis[]>([]);
  const [feldGeprueft, setFeldGeprueft] = useState(false);
  const [gruppe, setGruppe] = useState('');
  /** Bis zu welchem Platz gilt "weiter"? 0 blendet die Hervorhebung aus. */
  const [qualiBis, setQualiBis] = useState(0);
  const [titel, setTitel] = useState('Prognose');

  /** Angehakte Spieltage samt Qualifikationsgrenze. */
  const [quellen, setQuellen] = useState<Quelle[]>([]);
  const [feld, setFeld] = useState<TeamImFeld[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [status, setStatus] = useState('');

  const [plaetze, setPlaetze] = useState<Array<string | null>>([]);
  /** Der MVP der Prognose - ein Spielername aus dem Feld, wie im Vorbild. */
  const [mvp, setMvp] = useState('');
  const [profile, setProfile] = useState<Record<string, Profil>>({});

  /** Kartenansicht: welches Bild, welche Formen, wer steht wo. */
  const [bilder, setBilder] = useState<Kartenbild[]>([]);
  /**
   * Welche Insel welches Kartenbild bekommt (data/insel-bilder.json).
   *
   * Der Betreiber: "wenn ein Reload Cup ist, dass du auch die passende
   * Reload Map anzeigst fuer die Finale, nicht eine komische Battle Royale
   * Map." Epic nennt die Insel je Spieltag (Codename in der Playlist); das
   * Bild dazu ordnet der Betreiber einmal je Insel zu, danach steht es bei
   * jedem Cup dieser Insel von selbst.
   */
  const [inseln, setInseln] = useState<Record<string, string>>({});
  /** Hat der Betreiber das Bild fuer diese Karte selbst gewaehlt? Dann bleibt es. */
  const [bildVonHand, setBildVonHand] = useState(false);
  const [bildId, setBildId] = useState('');
  const [spots, setSpots] = useState<Spot[]>([]);
  /** Form-Kennung -> Team-Schluessel, die dort landen. */
  const [aufSpot, setAufSpot] = useState<Record<string, string[]>>({});
  /**
   * Hat diese Prognose ihre eigene Karte?
   *
   * Sobald gespeichert wurde, gehoeren Bild, Formen und Zuordnung zu ihr.
   * Die Auswahl anderer Karten faellt dann weg: eine Prognose gilt fuer ein
   * bestimmtes Turnier auf einer bestimmten Karte, und ein Wechsel wuerde
   * jede Zuordnung entwerten. Benennen und Formen anpassen bleibt moeglich.
   */
  /**
   * Alle Karten dieser Prognose.
   *
   * Die gerade sichtbare liegt zusaetzlich in bildId, spots und aufSpot -
   * dort arbeitet die Oberflaeche. Beim Umschalten wandert der Stand
   * zurueck in die Liste, damit nichts verloren geht.
   */
  const [karten, setKarten] = useState<Karte[]>([]);
  /**
   * Die schon gebauten Turnierkarten - zum Uebernehmen statt Neuzeichnen.
   *
   * Zu einem Cup, fuer den eine Prognose entsteht, gibt es meist laengst
   * eine Karte mit fertig gesetzten Formen. Sie hier noch einmal von Hand
   * nachzubauen ist Arbeit, die schon getan ist.
   */
  const [turnierKarten, setTurnierKarten] = useState<Array<{
    id: string; titel: string; cupId?: string; bildId?: string;
    bildTitel?: string; spots?: Array<Spot & { teams?: string[] }>; eventId?: string;
    teams?: Array<{ id: string; ids?: string[] }>; geaendert?: number;
  }>>([]);
  /** Bei den Globals: LAN-Konto -> Schluessel des Teams im Feld. */
  const [lanZuKey, setLanZuKey] = useState<Record<string, string>>({});
  const [turnierListeOffen, setTurnierListeOffen] = useState(false);
  const [karteNr, setKarteNr] = useState(0);
  const [kartenTitel, setKartenTitel] = useState('');
  const [benenntKarte, setBenenntKarte] = useState(false);

  /** Steht der Schnappschuss der gerade sichtbaren Karte? */
  const eigeneKarte = karten[karteNr]?.eigen ?? false;

  /** Was gerade gezogen wird - der Schluessel des Teams. */
  const [zieht, setZieht] = useState<string | null>(null);
  const [gespeicherte, setGespeicherte] = useState<Prognose[]>([]);
  /*
   * Ob die gespeicherten Prognosen wirklich da sind.
   *
   * Die Globals-Fassung oeffnet ihr Finale von selbst. Taete sie das, bevor
   * die Liste geladen ist, finge sie mit einer leeren Prognose an - und das
   * naechste Speichern ueberschriebe seine fertige Reihenfolge.
   */
  const [gespeicherteDa, setGespeicherteDa] = useState(false);
  /** Antwortet die Ablage nicht, steht das da - nie eine leere Prognose. */
  const [ladeFehler, setLadeFehler] = useState('');
  /** Welche gespeicherte Prognose wird gerade umbenannt? */
  const [benennt, setBenennt] = useState<string | null>(null);
  const [benenntTitel, setBenenntTitel] = useState('');
  const [benenntGruppe, setBenenntGruppe] = useState('');
  /**
   * Welches Löschen wartet auf Bestätigung?
   *
   * Zwei Klicks statt eines Systemdialogs: eine Prognose ist Handarbeit von
   * zwanzig Plätzen, und ein Fehlgriff daneben wäre nicht rückholbar.
   */
  const [loeschtGleich, setLoeschtGleich] = useState<string | null>(null);

  /* --------------------------------------------------------- Karte ansehen */

  /** Karte und Liste lassen sich einzeln gross ziehen, nicht nur zusammen. */
  const [vollbildKarte, setVollbildKarte] = useState(false);
  const kartenBild = useKartenVollbild();
  const [vollbildListe, setVollbildListe] = useState(false);

  /** Die Suche im Feld rechts - nach einem Spielernamen. */
  const [suche, setSuche] = useState('');

  /** Ortsnamen auf der Karte - nur die Fortnite-Insel bringt beide Fassungen mit. */
  // Ortsnamen von Anfang an aus - wie auf jeder Karte (Betreiber, 24.9.2026).
  const [orteSichtbar, setOrteSichtbar] = useState(false);
  /** Die Beschriftungen ausblenden, um die reinen Flaechen zu sehen. */


  /** Der sichtbare Ausschnitt der Karte. */
  const [zoom, setZoom] = useState(1);
  const [mitte, setMitte] = useState<Punkt>({ x: 50, y: 50 });

  /* -------------------------------------------------------- Formen aendern */

  /**
   * Formen bearbeiten - nur auf ausdrueckliches Einschalten.
   *
   * Solange das aus ist, verhaelt sich die Karte wie bisher: ziehen und
   * ablegen. Erst eingeschaltet lassen sich die Flaechen selbst verschieben
   * und ihre Ecken versetzen. Geloescht wird hier nichts - die Formen bleiben
   * liegen, bis sie im Karteneditor bewusst entfernt werden.
   */
  const [formenAn, setFormenAn] = useState(false);
  const [gewaehlteForm, setGewaehlteForm] = useState<string | null>(null);
  const [formenStand, setFormenStand] = useState('');
  /** Welches Zeichenwerkzeug liegt an? */
  const [werkzeug, setWerkzeug] = useState<'rechteck' | 'polygon' | null>(null);
  /** Die bisher gesetzten Ecken einer freien Form. */
  const [rohbau, setRohbau] = useState<Punkt[]>([]);
  /** Wo steht der Zeiger gerade - fuer die Vorschaulinie beim Zeichnen. */
  const [zeiger, setZeiger] = useState<Punkt | null>(null);
  /**
   * Das aufgezogene Rechteck, solange die Taste haelt.
   *
   * Zusaetzlich als Referenz: Druecken und Loslassen koennen im selben
   * Durchlauf liegen, und dann steht im Zustand noch der Stand von vorher -
   * das Rechteck entstuende nie.
   */
  const [gummi, setGummi] = useState<{ von: Punkt; bis: Punkt } | null>(null);
  const gummiRef = useRef<{ von: Punkt; bis: Punkt } | null>(null);

  /* ------------------------------------------------------ Flaggen pflegen */

  /** Die Wettkampfregionen, in die sich jemand rufen laesst. */
  const WETTKAMPFREGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

  /** Die Regionen im Stift-Fenster - leer heisst "wie gezaehlt". */
  const [regionEntwurf, setRegionEntwurf] = useState<string[]>([]);

  /** Die Anzeigenamen im Stift-Fenster - einer je Spieler des Teams. */
  const [namensEntwurf, setNamensEntwurf] = useState<string[]>([]);

  /** Welches Team steht gerade im Stift-Fenster? */
  const [pflegt, setPflegt] = useState<TeamImFeld | null>(null);
  /** Was dort eingestellt ist: je Spieler ein Laenderkuerzel. */
  const [entwurf, setEntwurf] = useState<string[]>([]);
  const [flaggen, setFlaggen] = useState<string[]>([]);
  const [flaggenSuche, setFlaggenSuche] = useState('');
  const [pflegeStand, setPflegeStand] = useState('');

  const flaeche = useRef<HTMLDivElement | null>(null);
  const ebene = useRef<HTMLDivElement | null>(null);
  /** Die Form, ueber der der Zeiger gerade steht. */
  const hoverRef = useRef<string | null>(null);
  const zoomRef = useRef(1);
  const mitteRef = useRef<Punkt>({ x: 50, y: 50 });
  const malUhr = useRef<number | null>(null);
  const naechster = useRef<{ z: number; m: Punkt } | null>(null);

  /** Was die Maus gerade bewegt. */
  const griff = useRef<
    | { art: 'schieben'; px: number; py: number; mitte: Punkt; rahmen: DOMRect }
    | { art: 'form'; id: string; letzt: Punkt }
    // Die gegenueberliegende Ecke wird beim Anfassen einmal festgehalten:
    // ein Rechteck soll beim Ziehen ein Rechteck bleiben, und dafuer muss
    // der ruhende Gegenpunkt bekannt sein.
    | { art: 'ecke'; id: string; nr: number; gegen: Punkt | null }
    | null>(null);

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true)).catch(() => setIstAdmin(false));
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json())
      .then((d) => setCups(d.cups ?? [])).catch(() => {})
      .finally(() => setCupsLaden(false));
    fetch('/api/spieler-profile').then((r) => r.json())
      .then((j) => setProfile(j.profile ?? {})).catch(() => {});
    // Die eigene Prognose kommt aus dem eigenen Fach. Scheitert das Lesen,
    // bleibt "da" aus: sonst finge das Werkzeug mit einer leeren Prognose an,
    // und das Selbstspeichern ueberschriebe die fertige.
    fetch(eigen ? '/api/meine-prognose' : '/api/prognosen').then((r) => r.json())
      .then((d) => {
        if (d.fehler) { setLadeFehler(String(d.fehler)); return; }
        setGespeicherte(d.prognosen ?? []); setGespeicherteDa(true);
      })
      .catch(() => setLadeFehler('Die Ablage antwortet gerade nicht.'));
    fetch('/api/karten-bild').then((r) => r.json())
      .then((d) => { setBilder(d.karten ?? []); setInseln(d.inseln ?? {}); }).catch(() => {});
    fetch('/api/flaggen').then((r) => r.json())
      .then((d) => setFlaggen(d.flaggen ?? [])).catch(() => {});
  }, []);

  // Die Formen zum gewaehlten Kartenbild. Sie kommen aus derselben Ablage wie
  // im Karteneditor - was dort gezeichnet wurde, steht hier sofort bereit.
  //
  // Nicht mehr, sobald die Prognose ihre eigene Karte hat: dann ist der
  // gespeicherte Stand massgeblich. Sonst wuerde eine spaetere Aenderung an
  // der gemeinsamen Vorlage eine abgelegte Prognose stillschweigend umbauen.
  useEffect(() => {
    if (eigeneKarte) return;
    let weg = false;
    fetch(`/api/karten-vorlage?bild=${encodeURIComponent(bildId || 'fortnite-karte')}`)
      .then((r) => r.json())
      .then((d) => { if (!weg) setSpots(d.spots ?? []); })
      .catch(() => { if (!weg) setSpots([]); });
    return () => { weg = true; };
  }, [bildId, eigeneKarte]);

  const findeProfil = useCallback((name: string, id?: string): Profil | undefined => {
    if (id && profile[id]) return profile[id];
    const schluessel = namensSchluessel(name);
    for (const p of Object.values(profile)) {
      if ((p.namen ?? [p.name ?? '']).some((n) => namensSchluessel(n) === schluessel)) return p;
    }
    return undefined;
  }, [profile]);

  /* ====================================================== Kartenausschnitt */

  /**
   * Den Blickpunkt so einfangen, dass der Ausschnitt am Bildrand haelt.
   * Bei voller Ansicht immer die Mitte, sonst rutscht die Karte weg.
   */
  const begrenze = useCallback((z: number, ziel: Punkt): Punkt => {
    if (z <= 1) return { x: 50, y: 50 };
    const sicht = 100 / z;
    return {
      x: Math.min(100 - sicht / 2, Math.max(sicht / 2, ziel.x)),
      y: Math.min(100 - sicht / 2, Math.max(sicht / 2, ziel.y)),
    };
  }, []);

  /**
   * Den Ausschnitt unmittelbar auf das Element schreiben, ohne React.
   *
   * Beim Schieben kommen Mausmeldungen schneller herein, als die Karte mit
   * allen Formen neu gezeichnet werden kann. Gemalt wird darum einmal je
   * Bildaufbau, immer mit dem zuletzt gemeldeten Stand; in den Zustand wandert
   * der Ausschnitt erst beim Loslassen.
   */
  const malAusschnitt = useCallback((z: number, m: Punkt) => {
    naechster.current = { z, m };
    if (malUhr.current !== null) return;
    malUhr.current = requestAnimationFrame(() => {
      malUhr.current = null;
      const n = naechster.current, el = ebene.current;
      if (!n || !el) return;
      el.style.transform =
        `scale(${n.z}) translate(${50 / n.z - n.m.x}%, ${50 / n.z - n.m.y}%)`;
      // Schrift, Raender und Schein rechnen gegen --z (globals.css).
      el.style.setProperty('--z', String(n.z));
    });
  }, []);

  /** Wartet, bis das Rad stillsteht, bevor der Ausschnitt in den Zustand geht. */
  const festUhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setzeAusschnitt = useCallback((z: number, ziel: Punkt) => {
    if (festUhr.current) { clearTimeout(festUhr.current); festUhr.current = null; }
    const zz = Math.max(1, Math.min(6, z));
    const mm = begrenze(zz, ziel);
    zoomRef.current = zz; mitteRef.current = mm;
    setZoom(zz); setMitte(mm);
  }, [begrenze]);

  /*
   * Das Rad zoomt direkt am Element, ohne die Seite neu zu zeichnen - das
   * Neuzeichnen bei jedem Radstoss liess die Karte ruckeln. In den Zustand
   * geht der Ausschnitt erst, wenn das Rad eine Weile stillsteht.
   */
  const zoomeFluessig = useCallback((z: number, ziel: Punkt) => {
    const zz = Math.max(1, Math.min(6, z));
    const mm = begrenze(zz, ziel);
    zoomRef.current = zz; mitteRef.current = mm;
    malAusschnitt(zz, mm);
    if (festUhr.current) clearTimeout(festUhr.current);
    festUhr.current = setTimeout(() => {
      festUhr.current = null;
      setZoom(zoomRef.current); setMitte(mitteRef.current);
    }, 160);
  }, [begrenze, malAusschnitt]);
  useEffect(() => () => { if (festUhr.current) clearTimeout(festUhr.current); }, []);

  /** Der Kartenpunkt unter dem Zeiger, in Prozent. */
  const pos = useCallback((e: { clientX: number; clientY: number }): Punkt => {
    const el = flaeche.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    const z = zoomRef.current, m = mitteRef.current;
    const sicht = 100 / z;
    return {
      x: Math.min(100, Math.max(0,
        m.x - sicht / 2 + ((e.clientX - r.left) / r.width) * sicht)),
      y: Math.min(100, Math.max(0,
        m.y - sicht / 2 + ((e.clientY - r.top) / r.height) * sicht)),
    };
  }, []);

  /**
   * Das Mausrad zoomt und haelt dabei den Punkt unter dem Zeiger fest.
   *
   * Der Zuhoerer haengt am Fenster und in der einfangenden Runde, nicht am
   * Kartenfeld: nur so laesst sich das Mitscrollen der Seite zuverlaessig
   * unterbinden. Ob gezoomt oder gescrollt wird, entscheidet allein, ob der
   * Zeiger ueber der Karte steht.
   */
  useEffect(() => {
    const amRad = (e: WheelEvent) => {
      const el = flaeche.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const drin = e.clientX >= r.left && e.clientX <= r.right
        && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!drin) return;
      e.preventDefault(); e.stopPropagation();

      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const z = zoomRef.current, m = mitteRef.current;
      const sicht = 100 / z;
      const px = m.x - sicht / 2 + fx * sicht;
      const py = m.y - sicht / 2 + fy * sicht;

      // Feinere Stufen, wie im Karten-Werkzeug.
      const z2 = Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const sicht2 = 100 / z2;
      zoomeFluessig(z2, { x: px + sicht2 * (0.5 - fx), y: py + sicht2 * (0.5 - fy) });
    };
    window.addEventListener('wheel', amRad, { passive: false, capture: true });
    return () => window.removeEventListener(
      'wheel', amRad, { capture: true } as EventListenerOptions);
  }, [zoomeFluessig]);

  /**
   * Schieben, Formen versetzen und Ecken ziehen.
   *
   * Alles drei haengt am Fenster: laesst man ausserhalb der Karte los, soll
   * die Bewegung trotzdem sauber enden und nicht kleben bleiben.
   */
  useEffect(() => {
    const bewegt = (e: MouseEvent) => {
      const g = griff.current;
      if (!g) return;
      if (g.art === 'schieben') {
        const sicht = 100 / zoomRef.current;
        const m = begrenze(zoomRef.current, {
          x: g.mitte.x - ((e.clientX - g.px) / g.rahmen.width) * sicht,
          y: g.mitte.y - ((e.clientY - g.py) / g.rahmen.height) * sicht,
        });
        mitteRef.current = m;
        malAusschnitt(zoomRef.current, m);
        return;
      }
      const p = pos(e);
      if (g.art === 'ecke') {
        setSpots((alt) => alt.map((sp) => {
          if (sp.id !== g.id) return sp;
          // Beim Rechteck wandern die beiden Nachbarecken mit, sonst wuerde
          // aus dem Quadrat ein schiefes Viereck. Genau so verhaelt sich die
          // Kartenseite auch.
          if (sp.form === 'rechteck' && sp.punkte.length === 4 && g.gegen) {
            return { ...sp, punkte: rechteckPunkte(p, g.gegen) };
          }
          return { ...sp, punkte: sp.punkte.map((q, i) => (i === g.nr ? p : q)) };
        }));
        return;
      }
      const dx = p.x - g.letzt.x, dy = p.y - g.letzt.y;
      g.letzt = p;
      setSpots((alt) => alt.map((sp) => (sp.id !== g.id ? sp
        : {
          ...sp,
          punkte: sp.punkte.map((q) => ({
            x: Math.min(100, Math.max(0, q.x + dx)),
            y: Math.min(100, Math.max(0, q.y + dy)),
          })),
        })));
    };
    const hoch = () => {
      const g = griff.current;
      griff.current = null;
      if (g?.art === 'schieben') setMitte(mitteRef.current);
    };
    window.addEventListener('mousemove', bewegt);
    window.addEventListener('mouseup', hoch);
    return () => {
      window.removeEventListener('mousemove', bewegt);
      window.removeEventListener('mouseup', hoch);
    };
  }, [begrenze, malAusschnitt, pos]);

  /**
   * Eine neue Form anlegen.
   *
   * Ohne Beschriftung: der Ortsname steht schon auf der Karte, in der Form
   * soll nur stehen, wer dort landet. Benennen laesst sie sich hinterher.
   */
  function neueForm(punkte: Punkt[], form: 'rechteck' | 'polygon') {
    const id = `s${Date.now().toString(36)}`;
    setSpots((alt) => [...alt, { id, form, punkte }]);
    setGewaehlteForm(id);
    setFormenStand(uebs('Neue Form — noch nicht gespeichert'));
  }

  /**
   * Eine Form entfernen.
   *
   * Nur von Hand und nur die ausgewaehlte. Wer dort stand, wandert zurueck
   * ins Feld statt mit der Form zu verschwinden.
   */
  function formLoeschen(id: string) {
    setSpots((alt) => alt.filter((sp) => sp.id !== id));
    setAufSpot((alt) => {
      const neu = { ...alt };
      delete neu[id];
      return neu;
    });
    setGewaehlteForm(null);
    setFormenStand(uebs('Form entfernt — noch nicht gespeichert'));
  }

  /**
   * Die Formen zusaetzlich in die gemeinsame Vorlage schreiben.
   *
   * Der Normalfall ist das nicht: was hier entsteht, gehoert zu dieser
   * Prognose. Wer eine Flaeche aber grundsaetzlich anders haben will - weil
   * sie auf der Karte schlicht falsch lag -, kann sie so auch fuer jede
   * kuenftige Karte festhalten. Eine leere Liste wird nie geschrieben:
   * einmal gezeichnete Formen sollen nicht durch einen Fehlgriff verschwinden.
   */
  async function formenAlsVorlage() {
    if (!spots.length) { setFormenStand(uebs('Nichts zu speichern')); return; }
    const r = await fetch('/api/karten-vorlage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bild: bildId || 'fortnite-karte', spots }),
    });
    setFormenStand(r.ok ? 'Formen gespeichert' : 'Speichern fehlgeschlagen');
  }

  // Escape bricht ab: eine halb gezeichnete Form soll nicht kleben bleiben.
  useEffect(() => {
    const amTaster = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setWerkzeug(null); setRohbau([]); setZeiger(null);
      gummiRef.current = null; setGummi(null);
    };
    window.addEventListener('keydown', amTaster);
    return () => window.removeEventListener('keydown', amTaster);
  }, []);

  /* ======================================================= Flaggen pflegen */

  function pflegeOeffnen(t: TeamImFeld) {
    setPflegt(t);
    setFlaggenSuche(''); setPflegeStand('');
    setEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.land ?? ''));
    /*
     * Der Anzeigename daneben.
     *
     * Vorbelegt mit dem, was schon gepflegt ist - sonst mit dem Namen, den
     * Epic gerade liefert. Wer nichts aendert, aendert nichts: ein leeres
     * Feld heisst weiterhin "kein eigener Name", und dann steht Epics
     * Name da.
     */
    setNamensEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.anzeige ?? ''));
    setRegionEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.region ?? ''));
  }

  /**
   * Die eingestellten Laender festhalten.
   *
   * Gespeichert wird im selben Profil, aus dem auch die Beitragsseite liest -
   * die Flagge steht danach ueberall und ueberlebt das Neuladen. Die uebrigen
   * gepflegten Angaben gehen mit, sonst fielen X-Konto und Anzeigename beim
   * Setzen einer Flagge stillschweigend weg.
   */
  async function pflegeSichern() {
    if (!pflegt) return;
    setPflegeStand('speichert …');
    for (let k = 0; k < pflegt.namen.length; k++) {
      const name = pflegt.namen[k];
      const id = pflegt.ids[k] || undefined;
      const vorher = findeProfil(name, id);
      const land = (entwurf[k] ?? '').trim().toUpperCase();
      const anzeige = (namensEntwurf[k] ?? '').trim();
      const region = (regionEntwurf[k] ?? '').trim().toUpperCase();
      // Nichts geaendert, nichts geschrieben - sonst stuende in der Datei
      // bei jedem Oeffnen des Fensters ein neuer Eintrag.
      if ((vorher?.land ?? '') === land
          && (vorher?.anzeige ?? '') === anzeige
          && (vorher?.region ?? '') === region) continue;
      await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, name, land,
          x: vorher?.x ?? '', region,
          anzeige,
        }),
      });
    }
    const j = await fetch('/api/spieler-profile').then((r) => r.json());
    setProfile(j.profile ?? {});
    setPflegt(null);
  }

  /** Die grossen Finals, die noch kommen oder laufen - je Cup gesammelt fuer die Kacheln. */
  const finals = useMemo(() => finalsAus(cups), [cups]);
  const kacheln = useMemo(() => {
    const jeCup = new Map<string, Finale[]>();
    for (const f of finals) (jeCup.get(f.cup.id) ?? jeCup.set(f.cup.id, []).get(f.cup.id)!).push(f);
    return [...jeCup.values()].sort((a, b) => a[0].begin - b[0].begin);
  }, [finals]);

  /**
   * Die Namen eines Teams, so wie sie auf der Karte stehen.
   *
   * Ein einzelnes Team in einer Form bekommt seine beiden Spieler
   * untereinander; stehen mehrere Teams in derselben Form, teilen sie sich
   * die Hoehe und jedes bekommt nur eine Zeile.
   */
  /*
   * Der echte Name ueber die Konto-Id (siehe /api/echte-namen) - nicht der,
   * den Epic gerade fuehrt ("Idropy281"). Ein von Hand gepflegter Name geht
   * dabei ohnehin vor; der steht in derselben Quelle an erster Stelle.
   */
  const feldKonten = useMemo(() => feld.flatMap((t) => t.ids), [feld]);
  const echteNamen = useEchteNamen(feldKonten, globals ? GLOBALS_EVENT : null);
  const nameVon = useCallback((n: string, id?: string | null) =>
    kurz(echteNamen[id ?? ''] || findeProfil(n, id ?? undefined)?.anzeige || n),
  [echteNamen, findeProfil]);

  const zeilenFuer = useCallback((key: string, alleine: boolean): string[] => {
    const t = feld.find((x) => x.key === key);
    if (!t) return [];
    const namen = t.namen.map((n, k) => nameVon(n, t.ids[k]));
    return alleine && namen.length > 1 ? namen : [namen.join(' ')];
  }, [feld, nameVon]);

  /**
   * Eine Schriftgroesse fuer die ganze Karte.
   *
   * Rechnete jede Form ihre eigene aus, stuende ein Name in einer grossen
   * Flaeche doppelt so gross da wie der direkt daneben in einer schmalen -
   * das sah unruhig aus. Genommen wird deshalb ein gemeinsamer Wert: nicht
   * der kleinste, denn der stammt regelmaessig von einer einzigen engen Form
   * und druckte die ganze Karte klein, sondern der im unteren Drittel.
   */
  const einheitsGroesse = useMemo(() => {
    const werte: number[] = [];
    for (const sp of spots) {
      const keys = aufSpot[sp.id] ?? [];
      const r = rahmen(sp.punkte);
      const anzahl = keys.length || 1;
      const hoeheProTeam = r.hoehe / anzahl;
      const saetze: string[][] = keys.length
        ? keys.map((k) => zeilenFuer(k, keys.length === 1))
        : (sp.name ? [[sp.name]] : []);
      for (const texte of saetze) {
        if (!texte.length) continue;
        const laengste = Math.max(...texte.map((t) => t.length), 1);
        werte.push(schriftgroesse(r.breite, hoeheProTeam / texte.length, laengste));
      }
    }
    if (!werte.length) return 1.2;
    werte.sort((a, b) => a - b);
    return Math.max(1.1, Math.min(werte[Math.floor(werte.length / 3)], 2.0));
  }, [spots, aufSpot, zeilenFuer]);

  /**
   * Karte und Rangliste als ein Bild.
   *
   * Links die Karte mit den Formen und den Namen darin, rechts alle
   * Plaetze von eins bis fuenfzig in Spalten, unten links das Logo. Alles
   * in einem Zug auf eine Leinwand gezeichnet: was hier herauskommt, soll
   * sich ohne Nacharbeit posten lassen.
   */
  const [schnappschussStand, setSchnappschussStand] = useState('');

  async function alsSchnappschuss() {
    if (!plaetze.length) {
      setSchnappschussStand(uebs('Erst ein Feld laden.'));
      return;
    }
    setSchnappschussStand(uebs('wird gezeichnet …'));

    const KARTE = 1200;                       // die Karte ist quadratisch
    const RAND = 40;
    const SPALTE = 330;                       // Breite einer Listenspalte
    const ZEILE = 46;
    const KOPF = 96;

    /*
     * Wie die Liste sich auf Spalten verteilt.
     *
     * Zuerst: wie viele Zeilen passen ueberhaupt neben die Karte. Daraus
     * die Zahl der Spalten - und dann noch einmal zurueckgerechnet, damit
     * sie gleich lang werden. Ohne den zweiten Schritt stuenden bei
     * fuenfzig Plaetzen vierundzwanzig, vierundzwanzig und zwei
     * nebeneinander, und die dritte Spalte saehe aus wie ein Versehen.
     */
    const passen = Math.max(1, Math.floor((KARTE - KOPF) / ZEILE));
    const spalten = Math.max(1, Math.ceil(plaetze.length / passen));
    const proSpalte = Math.ceil(plaetze.length / spalten);

    const B = RAND * 3 + KARTE + spalten * SPALTE;
    const H = RAND * 2 + KARTE;

    const c = document.createElement('canvas');
    c.width = B; c.height = H;
    const g = c.getContext('2d');
    if (!g) { setSchnappschussStand(uebs('Das kann dieser Browser nicht.')); return; }

    g.fillStyle = '#09090b';
    g.fillRect(0, 0, B, H);

    /* ------------------------------------------------------- Die Karte */
    const bildQuelle = bildId
      ? `/api/karten-bild?datei=1&id=${encodeURIComponent(bildId)}`
      : `/api/fortnite-map?bild=${orteSichtbar ? 'poi' : 'leer'}`;

    await new Promise<void>((fertig) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try { g.drawImage(img, RAND, RAND, KARTE, KARTE); } catch { /* dann ohne */ }
        fertig();
      };
      // Ohne Kartenbild wird trotzdem gezeichnet - Formen und Namen sind
      // das Wesentliche, das Bild ist der Hintergrund.
      img.onerror = () => fertig();
      img.src = bildQuelle;
    });

    const zuX = (x: number) => RAND + (x / 100) * KARTE;
    const zuY = (y: number) => RAND + (y / 100) * KARTE;

    for (const sp of spots) {
      const keys = aufSpot[sp.id] ?? [];
      g.beginPath();
      sp.punkte.forEach((p, i) => {
        if (i === 0) g.moveTo(zuX(p.x), zuY(p.y));
        else g.lineTo(zuX(p.x), zuY(p.y));
      });
      g.closePath();
      g.fillStyle = keys.length >= 2 ? 'rgba(220,38,38,0.34)'
        : keys.length === 1 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.14)';
      g.fill();
      g.strokeStyle = keys.length >= 2 ? 'rgb(248,60,60)'
        : keys.length === 1 ? 'rgba(0,0,0,0.95)'
        : sp.farbe ?? 'rgba(0,0,0,0.75)';
      g.lineWidth = 2.5;
      g.stroke();

      // Die Namen in der Form - dieselbe Aufteilung wie auf dem Bildschirm.
      const saetze: string[][] = keys.length
        ? keys.map((k) => zeilenFuer(k, keys.length === 1))
        : (sp.name ? [[sp.name]] : []);
      if (!saetze.length) continue;

      const r = rahmen(sp.punkte);
      const mx = zuX(r.links + r.breite / 2);
      const grad = (einheitsGroesse / 100) * KARTE;
      g.font = `700 ${grad}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      const hoeheProTeam = (r.hoehe / saetze.length / 100) * KARTE;
      saetze.forEach((texte, i) => {
        const oben = zuY(r.oben) + i * hoeheProTeam;
        texte.forEach((text, z) => {
          const y = oben + (hoeheProTeam / (texte.length + 1)) * (z + 1);
          g.lineWidth = Math.max(2, grad * 0.18);
          g.strokeStyle = 'rgba(0,0,0,0.85)';
          g.strokeText(text, mx, y);
          g.fillStyle = '#ffffff';
          g.fillText(text, mx, y);
        });
      });
    }

    /*
     * Das Wasserzeichen - schraeg ueber die ganze Karte.
     *
     * So blass, dass es beim Lesen nicht stoert, aber sichtbar genug, dass
     * man es auf einem weitergereichten Bild noch findet. Beschnitten auf
     * die Karte, damit die Namensliste daneben frei bleibt.
     */
    g.save();
    g.beginPath();
    g.rect(RAND, RAND, KARTE, KARTE);
    g.clip();
    g.translate(RAND + KARTE / 2, RAND + KARTE / 2);
    g.rotate((-22 * Math.PI) / 180);
    g.font = '700 30px Inter, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.085)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    {
      // Weit genug ueber die Karte hinaus, damit die Drehung keine Ecke
      // frei laesst.
      const reichweite = KARTE;
      const abstandX = 300;
      const abstandY = 150;
      for (let y = -reichweite; y <= reichweite; y += abstandY) {
        // Jede zweite Reihe versetzt - sonst entstehen Gassen, in denen
        // gar nichts steht.
        const versatz = (Math.round(y / abstandY) % 2) * (abstandX / 2);
        for (let x = -reichweite; x <= reichweite; x += abstandX) {
          g.fillText(MARKE.name, x + versatz, y);
        }
      }
    }
    g.restore();

    /* ------------------------------------------------------ Die Liste */
    const listeX = RAND * 2 + KARTE;
    g.textAlign = 'left';
    g.textBaseline = 'middle';

    g.font = '700 30px Inter, system-ui, sans-serif';
    g.fillStyle = '#f1f5f9';
    g.fillText(kartenName || uebs('Prognose'), listeX, RAND + 26);

    g.font = '500 18px Inter, system-ui, sans-serif';
    g.fillStyle = '#64748b';
    g.fillText(
      `${uebs('Platz')} 1 ${uebs('bis')} ${plaetze.length}`
      + (qualiBis === 1 ? ` · ${uebs('Sieger markiert')}`
        : qualiBis ? ` · ${uebs('weiter bis Platz')} ${qualiBis}` : ''),
      listeX, RAND + 58);

    plaetze.forEach((key, i) => {
      const t = teamZu(key);
      const spalte = Math.floor(i / proSpalte);
      const zeile = i % proSpalte;
      const x = listeX + spalte * SPALTE;
      const y = RAND + KOPF + zeile * ZEILE + ZEILE / 2;
      const weiter = qualiBis > 0 && i < qualiBis;

      g.font = '700 20px Inter, system-ui, sans-serif';
      g.fillStyle = weiter ? '#fcd34d' : '#64748b';
      g.textAlign = 'right';
      g.fillText(String(i + 1), x + 34, y);

      g.textAlign = 'left';
      g.font = '600 19px Inter, system-ui, sans-serif';
      g.fillStyle = t ? '#e2e8f0' : '#3f3f46';
      const text = t
        ? t.namen.map((n, k) => nameVon(n, t.ids[k]))
          .join(' + ')
        : uebs('offen');
      // Was nicht in die Spalte passt, wird gekuerzt statt in die naechste
      // hineinzulaufen.
      let gekuerzt = text;
      while (g.measureText(gekuerzt).width > SPALTE - 60 && gekuerzt.length > 4) {
        gekuerzt = gekuerzt.slice(0, -2);
      }
      g.fillText(gekuerzt === text ? text : `${gekuerzt}…`, x + 46, y);
    });

    /* ------------------------------------------------------- Das Logo */
    await new Promise<void>((fertig) => {
      const logo = new Image();
      logo.onload = () => {
        /*
         * Freigestellt und oben rechts in der Karte.
         *
         * CompHub-Logo-frei.png ist die einzige Fassung mit Alphakanal -
         * die andere braechte einen dunklen Kasten mit, und genau den
         * wollte der Betreiber nicht.
         */
        const breite = 190;
        const hoehe = Math.round(breite * (logo.height / logo.width || 0.66));
        try {
          g.drawImage(logo,
            RAND + KARTE - breite - 18, RAND + 18, breite, hoehe);
        } catch { /* ohne Logo ist das Bild trotzdem brauchbar */ }
        fertig();
      };
      logo.onerror = () => fertig();
      logo.src = '/logos/CompHub-Logo-frei.png';
    });

    try {
      await speichereLeinwand(
        c, `prognose-${(kartenName || 'karte').replace(/[^a-z0-9]+/gi, '-')}.png`);
    } catch (e) {
      // Sichtbar machen statt auf "wird gezeichnet" stehen zu bleiben.
      setSchnappschussStand(`${uebs('ging nicht')}: ${
        uebs(e instanceof Error ? e.message : String(e))}`);
      return;
    }
    setSchnappschussStand(uebs('gespeichert'));
    setTimeout(() => setSchnappschussStand(''), 2500);
  }

  /** Wie die Karte hier heisst - eigener Name, sonst der des Bildes. */
  const kartenName = kartenTitel
    || bilder.find((b) => b.id === bildId)?.titel
    || 'Battle Royale';

  const cup = cups.find((c) => c.id === cupId);

  /**
   * Die Insel der gewaehlten Spieltage - aus Epics Playlist.
   *
   * Massgeblich ist der erste gewaehlte Spieltag; im Cup selbst spielen alle
   * Spieltage einer Region dieselbe Insel.
   */
  const inselJetzt = useMemo(() => {
    const fensterAlle = cup ? Object.values(cup.regionen).flat() : [];
    // Das Finale selbst zuerst: es wird auf seiner Insel gespielt, nicht auf
    // der der Vorrunde.
    const zielFenster = ziel ? fensterAlle.find((f) => f.windowId === ziel.windowId) : undefined;
    const gewaehlt = quellen
      .map((q) => fensterAlle.find((f) => f.windowId === q.windowId && f.region === q.region))
      .filter((f): f is Fenster => Boolean(f));
    const erstes = (zielFenster?.playlist ? zielFenster : undefined)
      ?? gewaehlt.find((f) => f.playlist) ?? fensterAlle.find((f) => f.playlist);
    return inselAusPlaylist(erstes?.playlist);
  }, [cup, quellen, ziel]);

  /*
   * Das passende Bild von selbst - solange der Betreiber keines gewaehlt
   * hat und die Prognose keine eigene Karte traegt. Battle Royale ist das
   * leere Bild (die grosse Karte), eine Reload-Insel ihr zugeordnetes.
   */
  const inselnUnterwegs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (bildVonHand || eigeneKarte || !inselJetzt.schluessel) return;
    const ziel = inselJetzt.art === 'br' ? (inseln.BR ?? '') : (inseln[inselJetzt.schluessel] ?? null);
    if (ziel === null) {
      // Ohne Bild: aus den Spieldateien holen - Name, Karte, Zuordnung.
      const code = inselJetzt.schluessel;
      if (inselJetzt.art === 'reload' && !inselnUnterwegs.current.has(code)) {
        inselnUnterwegs.current.add(code);
        void fetch(`/api/karten-bild?insel=${encodeURIComponent(code)}`).then((r) => r.json()).then(async (j) => {
          if (!j?.ok || !j.bildId) return;
          const liste = await fetch('/api/karten-bild').then((x) => x.json()).catch(() => null);
          if (liste?.karten) setBilder(liste.karten);
          setInseln((alt) => ({ ...alt, ...(liste?.inseln ?? {}), [code]: j.bildId }));
        }).catch(() => { /* dann von Hand */ });
      }
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBildId((alt) => (alt === ziel ? alt : ziel));
  }, [inselJetzt, inseln, bildVonHand, eigeneKarte]);

  async function inselZuordnen(insel: string, bild: string) {
    setInseln((alt) => { const n = { ...alt }; if (bild) n[insel] = bild; else delete n[insel]; return n; });
    await fetch('/api/karten-bild', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insel, bildId: bild }),
    });
  }

  /**
   * Das Feld eines Finales von Epic holen - siehe lib/prognoseFeld.
   *
   * Kommt mit den Quellen (welche Vorrunde bis zu welchem Platz), den Teams
   * und dem, was noch fehlt. Ohne Erfinden: nennt Epic die Vergabe nicht,
   * steht das als Hinweis da und das Feld bleibt leer.
   */
  const feldLaden = useCallback(async (z: Ziel, plaetzeBehalten = false) => {
    setLaedt(true); setStatus(uebs('lädt das Feld …'));
    try {
      /*
       * Die Globals: das Feld aus Epics Teilnehmerliste, siehe oben.
       *
       * Die Ids sind die der gewoehnlichen Konten, wo der Name eindeutig
       * dorthin fuehrt - dann finden Flagge und gepflegter Name hin -, sonst
       * die des LAN-Kontos. Der Schluessel wird daraus gebildet wie ueberall.
       */
      if (globals) {
        const r = await fetch(`/api/globals-teams?fenster=${encodeURIComponent(z.windowId)}`,
          { signal: AbortSignal.timeout(90_000) });
        const d = await r.json() as {
          error?: string;
          teams?: Array<{ rang: number; region?: string | null; spieler: Array<{
            turnierId: string; epicId: string | null; anzeige: string;
          }> }>;
        };
        if (!r.ok || d.error) throw new Error(d.error ?? 'nicht ladbar');
        const lan: Record<string, string> = {};
        const liste: TeamImFeld[] = (d.teams ?? []).map((t) => {
          const ids = t.spieler.map((s) => s.epicId || s.turnierId);
          for (const s of t.spieler) lan[s.turnierId] = [...ids].sort().join('|');
          return {
            key: [...ids].sort().join('|'),
            namen: t.spieler.map((s) => s.anzeige),
            // Die Region, fuer die das Team spielt (die seiner Qualifikation,
            // siehe /api/globals-teams) - nicht "GLOBAL", das traegt
            // hier jedes Team.
            ids, herkunft: [], besterPlatz: t.rang, region: t.region || '',
          };
        });
        setFeld(liste);
        setLanZuKey(lan);
        setQuellen([]); setFeldHinweise([]); setFeldGeprueft(true);
        setPlaetze((alt) => (plaetzeBehalten && alt.length ? alt
          : Array.from({ length: liste.length }, () => null)));
        setStatus(liste.length ? `${liste.length} ${uebs('Teams im Feld')}` : '');
        return;
      }
      const r = await fetch(`/api/prognose-feld?event=${encodeURIComponent(z.eventId)}`
        + `&window=${encodeURIComponent(z.windowId)}&region=${encodeURIComponent(z.region)}`,
        { signal: AbortSignal.timeout(90_000) });
      const d = await r.json() as FeldErgebnis & { error?: string };
      if (!r.ok) throw new Error(d.error ?? 'nicht ladbar');
      const liste: TeamImFeld[] = d.teams.map((t) => ({
        key: t.key, namen: t.namen, ids: t.ids, herkunft: t.herkunft,
        besterPlatz: t.besterPlatz, region: t.region,
      }));
      setFeld(liste);
      setQuellen(d.quellen);
      setFeldHinweise(d.hinweise ?? []);
      setFeldGeprueft(Boolean(d.geprueft));
      setPlaetze((alt) => (plaetzeBehalten && alt.length ? alt
        : Array.from({ length: liste.length }, () => null)));
      setStatus(liste.length ? `${liste.length} ${uebs('Teams im Feld')}` : '');
    } catch (e) {
      setStatus(uebs('Fehler') + ': ' + (e as Error).message);
    } finally { setLaedt(false); }
  }, [uebs, globals]);

  /**
   * Ein Finale von der Kachel waehlen.
   *
   * Gibt es dazu schon eine gespeicherte Prognose, wird die geoeffnet -
   * mit ihrem Feld und ihren Plaetzen. Sonst kommt das Feld frisch von Epic.
   */
  function zielWaehlen(fin: Finale) {
    const f0 = fin.fenster[0];
    const z: Ziel = {
      cupId: fin.cup.id, eventId: f0.eventId, windowId: f0.windowId,
      region: fin.region, begin: fin.begin, name: fin.name,
    };
    const grp = `${fin.region} ${fin.name}`.trim();
    const gespeichert = gespeicherte.find((p) => p.id === kennung(fin.cup.id, grp));
    if (gespeichert) { laden(gespeichert); return; }
    setCupId(fin.cup.id); setZiel(z);
    setTitel(globals ? 'Global Championship (2026)'
      : `${fin.cup.titel}${fin.name ? ` · ${fin.name}` : ''}${fin.cup.global ? '' : ` · ${fin.region}`}`);
    setGruppe(grp);
    // Ein Finale hat einen Sieger - der leuchtet.
    setQualiBis(1);
    setMvp(''); setPlaetze([]); setAufSpot({});
    setKarten([]); setKarteNr(0); setKartenTitel(''); setBenenntKarte(false);
    setGewaehlteForm(null); setWerkzeug(null); setRohbau([]);
    void feldLaden(z);
  }

  /** Zurueck zu den Kacheln - was auf dem Schirm steht, ist gespeichert oder nicht. */
  function zielAbwaehlen() {
    setZiel(null); setCupId(''); setFeld([]); setPlaetze([]); setQuellen([]);
    setFeldHinweise([]); setStatus('');
  }

  /**
   * Das Feld aus gespeicherten Quellen holen - fuer Prognosen von vor dem
   * Umbau, die noch kein Feld mitgespeichert haben.
   *
   * Ein Team, das an mehreren Tagen dabei war, erscheint nur einmal - erkannt
   * ueber die Epic-Konto-Ids, nicht ueber den Namen: Pros treten oft unter
   * wechselnden Schreibweisen an.
   */
  const feldAusQuellen = useCallback(async (quellenListe: Quelle[]) => {
    if (!quellenListe.length) return;
    setLaedt(true); setStatus(uebs('lädt …'));
    const gefunden = new Map<string, TeamImFeld>();
    try {
      for (const q of quellenListe) {
        const r = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(q.eventId)}`
          + `&window=${encodeURIComponent(q.windowId)}&limit=${q.topN ?? 200}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'nicht ladbar');
        const eintraege: Eintrag[] = (d.entries ?? []).slice(0, q.topN ?? undefined);
        for (const e of eintraege) {
          // Die Ids stehen in derselben Reihenfolge wie die Namen, mit
          // leerem Eintrag wo Epic keine liefert. Nur so gehoert ids[k] auch
          // wirklich zu namen[k] - sonst stuende beim Duo die Flagge des
          // einen vor dem Namen des anderen.
          const ids = e.players.map((pl) => pl.id ?? '');
          const namen = e.players.map((pl) => pl.name);
          // Der Schluessel dagegen muss unabhaengig von der Reihenfolge sein.
          const echte = ids.filter(Boolean).slice().sort();
          const key = echte.length
            ? echte.join('|')
            : namen.map(namensSchluessel).sort().join('|');
          const vorhanden = gefunden.get(key);
          const herkunft = `${q.titel} · #${e.rank}`;
          if (vorhanden) {
            vorhanden.herkunft.push(herkunft);
            vorhanden.besterPlatz = Math.min(vorhanden.besterPlatz, e.rank);
          } else {
            gefunden.set(key, {
              key, namen, ids, herkunft: [herkunft], besterPlatz: e.rank,
              region: q.region,
            });
          }
        }
      }
      const liste = [...gefunden.values()].sort((a, b) => a.besterPlatz - b.besterPlatz);
      setFeld(liste);
      setPlaetze((alt) => (alt.length === liste.length
        ? alt : Array.from({ length: liste.length }, () => null)));
      setStatus(`${liste.length} ${uebs('Teams im Feld')}`);
    } catch (e) {
      setStatus(uebs('Fehler') + ': ' + (e as Error).message);
    } finally { setLaedt(false); }
  }, [uebs]);

  /** Welche Teams sind noch nicht gesetzt? */
  const offen = useMemo(
    () => feld.filter((t) => !plaetze.includes(t.key)), [feld, plaetze]);

  /*
   * Die Suche im Feld.
   *
   * Der Betreiber wollte "eine Suchliste bei Prediction": bei fuenfzig Duos
   * ist ein Name schneller getippt als gefunden. Gesucht wird im gepflegten
   * Namen und im Namen bei Epic, in gefalteter Schreibweise ("vico" findet
   * "Vic0"). Ist ein passendes Team schon gesetzt, steht es mit seinem Platz
   * darunter, statt einfach zu fehlen.
   */
  const passtZurSuche = useCallback((t: TeamImFeld) => {
    const q = gefaltet(namensSchluessel(suche));
    if (!q) return true;
    return t.namen.some((n, k) => [n, findeProfil(n, t.ids[k])?.anzeige ?? '']
      .some((x) => gefaltet(namensSchluessel(x)).includes(q)));
  }, [suche, findeProfil]);

  /**
   * Ein Team auf einen bestimmten Platz legen.
   *
   * Anders als der Klick, der einfach den naechsten freien Platz nimmt: hier
   * bestimmt man die Stelle selbst. Stand dort schon jemand, tauschen die
   * beiden - so laesst sich die Reihenfolge auch nachtraeglich umstellen,
   * ohne erst Plaetze freiraeumen zu muessen.
   */
  function aufPlatz(index: number, key: string) {
    setPlaetze((alt) => {
      const neu = [...alt];
      const vorher = neu.indexOf(key);
      const verdraengt = neu[index];
      neu[index] = key;
      if (vorher >= 0 && vorher !== index) neu[vorher] = verdraengt;
      return neu;
    });
  }

  /** Ein Team auf eine Form der Karte legen. Ein Team steht nur an einem Ort. */
  function aufForm(spotId: string, key: string) {
    // Die Globals-Karte gehoert dem Karten-Werkzeug - hier nur ansehen.
    if (karteFest) { setStatus(uebs('Die Karte wird im Karten-Werkzeug verteilt.')); return; }
    setAufSpot((alt) => {
      const neu: Record<string, string[]> = {};
      for (const [id, keys] of Object.entries(alt)) {
        const rest = keys.filter((k) => k !== key);
        if (rest.length) neu[id] = rest;
      }
      neu[spotId] = [...(neu[spotId] ?? []), key];
      return neu;
    });
  }

  function vonForm(spotId: string, key: string) {
    if (karteFest) return;
    setAufSpot((alt) => {
      const rest = (alt[spotId] ?? []).filter((k) => k !== key);
      const neu = { ...alt };
      if (rest.length) neu[spotId] = rest; else delete neu[spotId];
      return neu;
    });
  }

  function setzen(key: string) {
    setPlaetze((alt) => {
      const i = alt.indexOf(null);
      if (i < 0) return alt;
      const neu = [...alt]; neu[i] = key; return neu;
    });
  }

  function raeumen(index: number) {
    setPlaetze((alt) => { const neu = [...alt]; neu[index] = null; return neu; });
  }

  function alleRaus() {
    setPlaetze((alt) => alt.map(() => null));
  }

  const teamZu = useCallback(
    (key: string | null) => (key ? feld.find((t) => t.key === key) ?? null : null), [feld]);

  /* ==================================================== Mehrere Karten */

  useEffect(() => {
    // Bei den Globals ist die Karte die aus dem Karten-Werkzeug - sie soll
    // hier ankommen, ohne dass jemand neu laedt.
    const holen = () => fetch('/api/turnier-karten')
      .then((r) => r.json())
      .then((d) => setTurnierKarten((alt) =>
        // Die Ersatzkopie (Ablage antwortet nicht) ersetzt keinen echten Stand.
        (d.ersatz && alt.length ? alt : d.karten ?? [])))
      .catch(() => {});
    void holen();
    if (!globals) return;
    const uhr = setInterval(holen, 60_000);
    return () => clearInterval(uhr);
  }, [globals]);

  /** Welche Turnierkarten gehoeren zum gerade gewaehlten Cup? */
  const passendeTurnierKarten = useMemo(
    () => turnierKarten.filter((k) => k.cupId && k.cupId === cupId && k.spots?.length),
    [turnierKarten, cupId]);

  /**
   * Die Formen einer vorhandenen Turnierkarte uebernehmen.
   *
   * Uebernommen werden ausdruecklich nur die Formen, nicht die Belegung:
   * wer auf der Turnierkarte wo steht, ist der tatsaechliche Landeplatz -
   * die Prognose ist die Erwartung davor. Beides zu vermischen waere eine
   * Zuordnung, die niemand getroffen hat. Die Formen bleiben Formen.
   */
  function karteAusTurnier(tk: { titel: string; bildId?: string; spots?: Spot[] }) {
    const liste = mitAktueller();
    const neu: Karte = {
      id: `k${liste.length + 1}-${liste.reduce((n, k) => n + k.id.length, 0)}`,
      bildId: tk.bildId ?? '',
      titel: tk.titel,
      // Ohne Teams: das Feld gibt es auf dieser Seite nicht, und die
      // Belegung der Turnierkarte gehoert nicht in eine Prognose.
      spots: (tk.spots ?? []).map((sp) => ({
        id: sp.id, form: sp.form, punkte: sp.punkte,
        ...(sp.name ? { name: sp.name } : {}),
        ...(sp.farbe ? { farbe: sp.farbe } : {}),
      })),
      aufSpot: {},
      // Ein Schnappschuss: die Formen sollen sich nicht nachtraeglich aus
      // der gemeinsamen Vorlage umbauen.
      eigen: true,
    };
    karteZeigen([...liste, neu], liste.length);
    setTurnierListeOffen(false);
    setStatus(`${uebs('Formen übernommen aus')} „${tk.titel}" — `
      + uebs('die Verteilung setzt du selbst'));
  }

  /**
   * Die Kartenliste mit dem gerade sichtbaren Stand.
   *
   * Gearbeitet wird immer auf bildId, spots und aufSpot. Vor jedem Wechsel
   * und vor dem Speichern muss dieser Stand zurueck in die Liste, sonst
   * faellt die halbe Arbeit beim Umschalten unter den Tisch.
   */
  function mitAktueller(): Karte[] {
    if (!karten.length) {
      return [{
        id: 'k1', bildId, titel: kartenTitel || kartenName,
        spots, aufSpot, eigen: false,
      }];
    }
    return karten.map((k, i) => (i === karteNr
      ? { ...k, bildId, titel: kartenTitel || k.titel, spots, aufSpot }
      : k));
  }

  /** Eine Karte sichtbar machen. */
  function karteZeigen(liste: Karte[], i: number) {
    const k = liste[i];
    if (!k) return;
    setKarten(liste); setKarteNr(i);
    setBildId(k.bildId); setKartenTitel(k.titel);
    setSpots(k.spots); setAufSpot(k.aufSpot);
    setGewaehlteForm(null); setWerkzeug(null); setRohbau([]);
    setBenenntKarte(false); setFormenStand('');
  }

  function karteWechseln(i: number) {
    if (i === karteNr) return;
    karteZeigen(mitAktueller(), i);
  }

  /**
   * Eine weitere Karte anlegen.
   *
   * Sie startet leer und holt ihre Formen aus der Vorlage - die Reihenfolge
   * der Teams bleibt davon unberuehrt, die gilt fuer den ganzen Spieltag.
   */
  function karteAnlegen() {
    const liste = mitAktueller();
    const neu: Karte = {
      id: `k${liste.length + 1}-${liste.reduce((n, k) => n + k.id.length, 0)}`,
      bildId: '', titel: `Karte ${liste.length + 1}`,
      spots: [], aufSpot: {}, eigen: false,
    };
    karteZeigen([...liste, neu], liste.length);
    setStatus(uebs('Neue Karte — Bild wählen, Formen setzen, dann speichern'));
  }

  /**
   * Eine Karte aus dieser Prognose nehmen.
   *
   * Entfernt wird nur der Eintrag hier, nie das Kartenbild selbst - das
   * bleibt in der Sammlung und laesst sich jederzeit wieder hinzufuegen.
   * Die letzte Karte bleibt stehen: ohne eine gibt es nichts zu zeigen.
   */
  function karteEntfernen() {
    if (karten.length < 2) return;
    const liste = mitAktueller().filter((_, i) => i !== karteNr);
    karteZeigen(liste, Math.max(0, karteNr - 1));
    setStatus(uebs('Karte aus dieser Prognose genommen — noch nicht gespeichert'));
  }

  async function speichern() {
    if (!cup) { setStatus(uebs('Erst einen Cup wählen')); return; }
    const id = kennung(cupId, gruppe);
    const liste = mitAktueller();
    const inhalt = {
      id, titel, cupId, cupTitel: cup.titel, gruppe: gruppe || undefined,
      qualiBis, quellen, plaetze, mvp: mvp || undefined, oeffentlich: !eigen,
      // Das Feld als Schnappschuss und das Finale, zu dem es gehoert.
      feld, ziel: ziel ?? undefined,
      // Jede Karte wandert als Kopie mit hinein - Bild, Formen und wer wo
      // steht. Ab jetzt gehoeren sie dieser Prognose.
      // Ohne das Merkzeichen "eigen" - das gilt nur in der Oberflaeche.
      karten: liste.map((k) => ({
        id: k.id, bildId: k.bildId, titel: k.titel,
        spots: k.spots, aufSpot: k.aufSpot,
      })),
    };
    const r = await fetch(eigen ? '/api/meine-prognose' : '/api/prognosen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inhalt),
    });
    if (!r.ok) { setStatus(uebs('Speichern fehlgeschlagen')); return; }
    if (eigen) {
      // Das eigene Fach hat genau eine; keine Liste nachzuladen.
      setGespeicherte([inhalt as unknown as Prognose]);
      if (!karten.every((k) => k.eigen)) setKarten(liste.map((k) => ({ ...k, eigen: true })));
      setStatus(uebs('Automatisch gespeichert'));
      return;
    }
    await listeHolen();
    setKarten(liste.map((k) => ({ ...k, eigen: true })));
    if (!kartenTitel) setKartenTitel(kartenName);
    setFormenStand('');
    setStatus(liste.length > 1
      ? `Gespeichert — ${liste.length} Karten mit ihren Formen und Zuordnungen`
      : 'Gespeichert — Karte, Formen und Zuordnung gehören jetzt dazu');
  }

  /** Die Kennung, unter der eine Prognose abgelegt wird. */
  function kennung(cId: string, grp: string) {
    return `${cId}-${grp || 'gesamt'}`
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function listeHolen() {
    const d = await fetch('/api/prognosen').then((x) => x.json());
    setGespeicherte(d.prognosen ?? []);
  }

  /**
   * Eine gespeicherte Prognose umbenennen.
   *
   * Der Name der Gruppe steckt in der Kennung - wird er geändert, entsteht
   * ein neuer Eintrag und der alte muss weg. Sonst stünde dieselbe Prognose
   * zweimal in der Liste, einmal unter jedem Namen.
   */
  async function umbenennen(p: Prognose) {
    const neuerTitel = benenntTitel.trim() || p.titel;
    const neueGruppe = benenntGruppe.trim();
    const alteId = p.id;
    const neueId = kennung(p.cupId, neueGruppe);

    const r = await fetch('/api/prognosen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...p, id: neueId, titel: neuerTitel, gruppe: neueGruppe || undefined,
      }),
    });
    if (!r.ok) { setStatus(uebs('Umbenennen fehlgeschlagen')); return; }
    if (neueId !== alteId) {
      await fetch(`/api/prognosen?id=${encodeURIComponent(alteId)}`, { method: 'DELETE' });
    }
    await listeHolen();
    setBenennt(null);
    // Steht diese Prognose gerade offen, wandert der neue Name gleich mit.
    if (kennung(cupId, gruppe) === alteId) {
      setTitel(neuerTitel); setGruppe(neueGruppe);
    }
    setStatus('Umbenannt');
  }

  /** Eine gespeicherte Prognose endgültig entfernen. */
  async function prognoseLoeschen(p: Prognose) {
    const r = await fetch(`/api/prognosen?id=${encodeURIComponent(p.id)}`,
      { method: 'DELETE' });
    if (!r.ok) { setStatus(uebs('Löschen fehlgeschlagen')); return; }
    await listeHolen();
    setLoeschtGleich(null);
    // War sie gerade offen, bleibt die Arbeitsfläche stehen - nur der
    // Verweis auf den gelöschten Eintrag verschwindet.
    if (kennung(cupId, gruppe) === p.id) {
      setStatus(uebs('Gelöscht — was auf dem Schirm steht, ist noch da, aber nicht gesichert'));
    } else {
      setStatus(uebs('Gelöscht'));
    }
  }

  function laden(p: Prognose) {
    setCupId(p.cupId); setTitel(p.titel); setGruppe(p.gruppe ?? '');
    setQualiBis(p.qualiBis ?? 0);
    setQuellen(p.quellen ?? []); setPlaetze(p.plaetze ?? []);
    setMvp(p.mvp ?? '');
    setZiel(p.ziel ?? null);
    setFeldHinweise([]); setFeldGeprueft(false);
    // Das gespeicherte Feld; aeltere Prognosen haben keins und holen es
    // aus ihren Quellen.
    setFeld(p.feld ?? []);
    if (!p.feld?.length) {
      if (p.ziel) void feldLaden(p.ziel, true); else void feldAusQuellen(p.quellen ?? []);
    }

    // Die Karten so wiederherstellen, wie sie gespeichert wurden. Eintraege
    // aus der Zeit mit nur einer Karte werden dabei umgerechnet, damit sie
    // sich genauso verhalten wie neue.
    const liste: Karte[] = (p.karten?.length
      ? p.karten.map((k) => ({
        id: k.id, bildId: k.bildId ?? '', titel: k.titel || 'Karte',
        spots: k.spots ?? [], aufSpot: k.aufSpot ?? {}, eigen: true,
      }))
      : [{
        id: 'k1', bildId: p.bildId ?? '', titel: p.kartenTitel || 'Karte',
        spots: p.spots ?? [], aufSpot: p.aufSpot ?? {},
        eigen: !!p.spots?.length,
      }]);
    karteZeigen(liste, 0);

    setStatus(uebs('Geladen'));
  }

  /** Ein Hinweis von lib/prognoseFeld als Satz - in der Sprache der Seite. */
  function hinweisText(h: FeldHinweis): string {
    switch (h.art) {
      case 'vorrunde-offen':
        return uebs('{fenster} ({region}) ist noch nicht gespielt — dort qualifizieren sich am {datum} noch {n} weitere.')
          .replace('{fenster}', h.fenster).replace('{region}', h.region)
          .replace('{datum}', tag(h.datum)).replace('{n}', String(h.n));
      case 'liste-fehlt':
        return uebs('Die Bestenliste von {fenster} ({region}) ist gerade nicht erreichbar.')
          .replace('{fenster}', h.fenster).replace('{region}', h.region);
      case 'weggelassen':
        return uebs('{n} Teams aus der Bestenliste tragen die Marke nicht mehr (abgesagt oder ersetzt) und fehlen deshalb.')
          .replace('{n}', String(h.n));
      case 'marke-unvergeben':
        return uebs('Epic hat die Marke noch an niemanden vergeben — das Feld kommt aus der Bestenliste.');
      case 'pruefung-fehlgeschlagen':
        return uebs('Die Prüfung der Marken bei Epic ist fehlgeschlagen — das Feld kommt aus der Bestenliste.');
      case 'keine-vergabe':
        return uebs('Epic nennt noch nicht, welche Runde die Marke {token} vergibt. Sobald das feststeht, steht das Feld hier von selbst.')
          .replace('{token}', h.token);
      case 'keine-quali':
        return uebs('Epic führt zu dieser Runde keine Qualifikation.');
      default:
        return '';
    }
  }

  /*
   * Die Globals-Fassung oeffnet ihr Finale selbst.
   *
   * Erst wenn Katalog und gespeicherte Prognosen da sind: gibt es schon eine
   * Prognose zu den Globals, wird sie geoeffnet, sonst eine neue angelegt.
   */
  const globalsGeoeffnet = useRef(false);
  useEffect(() => {
    if (!globals || globalsGeoeffnet.current || cupsLaden || !gespeicherteDa || cupId) return;
    const fin = finalsAus(cups).find((f) => f.fenster.some((w) => w.eventId === GLOBALS_EVENT));
    if (!fin) return;
    globalsGeoeffnet.current = true;
    const uhr = setTimeout(() => zielWaehlen(fin), 0);
    return () => clearTimeout(uhr);
    // zielWaehlen liest nur, was hier schon feststeht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globals, cupsLaden, gespeicherteDa, cups, cupId]);

  /*
   * Und nimmt die Formen der Globals-Karte.
   *
   * Die Karte zeichnet der Betreiber unter /maps; hier werden ihre Formen
   * uebernommen, ohne die Belegung - wer wo landet, ist der tatsaechliche
   * Landeplatz, die Prognose ist die Erwartung davor. Nur einmal, und nur,
   * solange die Prognose noch keine eigene Karte hat: eine gespeicherte
   * behaelt ihre.
   */
  /*
   * Die eigene Prognose speichert sich selbst - eine Sekunde nach der
   * letzten Aenderung, ohne Knopf. Erst wenn das eigene Fach gelesen ist und
   * das Feld steht: vorher gaebe es nichts, was sich zu sichern lohnt.
   */
  useEffect(() => {
    if (!eigen || !cupId || !gespeicherteDa || !feld.length) return;
    const uhr = setTimeout(() => { void speichern(); }, 1000);
    return () => clearTimeout(uhr);
    // speichern liest den Stand, der hier die Abhaengigkeiten sind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eigen, cupId, gespeicherteDa, feld.length, plaetze, aufSpot, mvp, qualiBis, titel]);

  /*
   * Bei den Globals ist die Karte DIE Karte aus dem Karten-Werkzeug - mit
   * Formen und Teams, genau wie unter "Map".
   *
   * Der Betreiber (24.9.2026): "diese Map bei Prediction soll eigentlich die
   * Map sein, die man unter Map sieht ... ich als VIP soll ja nicht andere
   * User auf einen anderen Spot tun." Vorher kamen nur die Formen, einmal,
   * ohne Belegung. Jetzt wird die Karte bei jeder Aenderung dort neu
   * uebernommen, und hier laesst sich darauf nichts verschieben.
   */
  const globalsKarte = useMemo(
    () => (globals ? turnierKarten.find((k) => k.eventId === GLOBALS_EVENT && k.spots?.length) ?? null : null),
    [globals, turnierKarten]);
  const karteFest = !!globalsKarte;
  const globalsStand = useRef('');
  useEffect(() => {
    if (!globalsKarte || !cupId) return;
    const stand = `${globalsKarte.id}|${globalsKarte.geaendert ?? 0}|${Object.keys(lanZuKey).length}`;
    if (globalsStand.current === stand) return;
    globalsStand.current = stand;
    const teamKey = new Map((globalsKarte.teams ?? []).map((t) => [
      t.id, (t.ids ?? []).map((id) => lanZuKey[id]).find(Boolean) ?? null,
    ]));
    const aufSpotNeu: Record<string, string[]> = {};
    for (const sp of globalsKarte.spots ?? []) {
      const keys = (sp.teams ?? []).map((t) => teamKey.get(t)).filter((k): k is string => !!k);
      if (keys.length) aufSpotNeu[sp.id] = keys;
    }
    const neu: Karte = {
      id: 'k1', bildId: globalsKarte.bildId ?? '', titel: 'Global Championship (2026)',
      spots: (globalsKarte.spots ?? []).map((sp) => ({
        id: sp.id, form: sp.form, punkte: sp.punkte,
        ...(sp.name ? { name: sp.name } : {}),
        ...(sp.farbe ? { farbe: sp.farbe } : {}),
      })),
      aufSpot: aufSpotNeu, eigen: true,
    };
    const uhr = setTimeout(() => karteZeigen([neu], 0), 0);
    return () => clearTimeout(uhr);
    // karteZeigen setzt nur Zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalsKarte, cupId, lanZuKey]);

  if (istAdmin === false && !eigen) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-10 text-slate-200">
        <p className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-900/40
                      p-6 text-center text-sm text-slate-400">
          <T>Diese Seite ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  // Unter /globals steht das Werkzeug im Geruest der Globals-Seite - dort
  // gibt es die Seitenflaeche schon.
  const Huelle = globals ? 'div' : 'main';

  return (
    <Huelle className={globals ? 'text-slate-200' : 'flex-1 bg-zinc-950 px-2 py-6 text-slate-200 sm:px-3'}>
      <div className="mx-auto w-full">

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">
              {globals ? 'Global Championship (2026)' : 'Predictions'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {cupId
                ? <T>Teams von rechts auf die Plätze ziehen — oder klicken für den nächsten freien.</T>
                : <T>Ein kommendes großes Finale wählen — das Feld kommt aus Epics Qualifikation.</T>}
            </p>
          </div>
          {cupId && !globals && (
            <button onClick={zielAbwaehlen}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-slate-300
                         transition hover:border-sky-500 hover:text-sky-400">
              ← <T>Anderes Event wählen</T>
            </button>
          )}
        </div>

        {/*
          * Die Kacheln - wie im Events-Tab: Bild, Name, und darunter je
          * Finale eine Zeile mit Region, Datum und Feld. Nur, was noch
          * kommt oder gerade laeuft. Der Betreiber: "Nur grosse Events wie
          * Division 1, Finals, maximal 100 Spieler, oder ein grosses
          * LAN-Event, mit Bild."
          */}
        {/* Die Globals waehlen ihr Finale selbst - bis dahin nur warten. */}
        {!cupId && globals && (
          ladeFehler ? (
            <p className="mx-auto max-w-lg rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3
                          text-center text-sm text-amber-300">
              <T>Deine Prognose ist gerade nicht erreichbar - die Ablage antwortet nicht. Nichts ist verloren; bitte gleich noch einmal laden.</T>
            </p>
          ) : (
          <p className="py-10 text-center text-sm text-slate-500">
            {cupsLaden || !gespeicherteDa
              ? <T>lädt …</T>
              : <T>Die Global Championship steht gerade nicht im Turnierkatalog.</T>}
          </p>
          )
        )}
        {!cupId && !globals && (
          cupsLaden ? (
            <p className="py-10 text-center text-sm text-slate-500"><T>lädt …</T></p>
          ) : !kacheln.length ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center
                          text-sm text-slate-500">
              <T>Gerade steht kein großes Finale an.</T>
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {kacheln.map((liste) => {
                const c = liste[0].cup;
                const live = liste.some((f) => f.live);
                return (
                  <article key={c.id}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40
                               transition hover:border-zinc-700">
                    <div className="relative h-32 w-full overflow-hidden bg-zinc-900">
                      {c.bild ? (
                        <img src={c.bild} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center
                                        bg-gradient-to-br from-sky-700 to-sky-950 px-4">
                          <span className="text-center text-sm font-bold uppercase tracking-wide text-white/80">
                            {c.titel}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      <div className="absolute left-2 top-2 flex gap-1.5">
                        {live ? (
                          <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold
                                           uppercase tracking-wider text-white">Live</span>
                        ) : (
                          <span className="rounded bg-sky-500/90 px-2 py-0.5 text-[10px] font-bold
                                           uppercase tracking-wider text-white">
                            {tag(liste[0].begin)}
                          </span>
                        )}
                        {c.global && (
                          <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold
                                           uppercase tracking-wider text-slate-200">LAN</span>
                        )}
                      </div>
                      <h3 className="absolute bottom-2 left-3 right-3 truncate text-sm font-semibold
                                     text-slate-100">{c.titel}</h3>
                    </div>
                    <div className="divide-y divide-zinc-800/80">
                      {liste.map((fin) => {
                        const grp = `${fin.region} ${fin.name}`.trim();
                        const da = gespeicherte.some((p) => p.id === kennung(c.id, grp));
                        const feldText = fin.feld !== null
                          ? `${fin.feld} ${uebs(fin.feld === 1 ? 'Team' : 'Teams')}`
                          : fin.cup.global ? uebs('Feld laut Epic') : '';
                        return (
                          <button key={`${fin.region}|${fin.fenster[0].windowId}`}
                            onClick={() => zielWaehlen(fin)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs
                                       transition hover:bg-zinc-900">
                            <span className="w-10 shrink-0 font-semibold text-sky-400">
                              {c.global ? '' : fin.region}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-slate-200">
                                {fin.name || uebs('Finale')}
                                <span className="ml-1.5 text-slate-500">{tag(fin.begin)}</span>
                              </span>
                              <span className="block truncate text-[11px] text-slate-500">
                                {feldText}
                                {fin.offen > 0 && fin.naechsteVorrunde && (
                                  <> · {uebs('Vorrunde am')} {tag(fin.naechsteVorrunde)}</>
                                )}
                              </span>
                            </span>
                            {da && (
                              <span className="shrink-0 rounded border border-amber-500/50 px-1.5 py-px
                                               text-[9px] font-semibold uppercase text-amber-300">
                                <T>gespeichert</T>
                              </span>
                            )}
                            {fin.live && !da && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        )}

        {/* Gespeicherte Prognosen zu anderen Cups - auch vergangene bleiben lesbar. */}
        {!cupId && gespeicherte.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              <T>Gespeicherte Prognosen</T> <span className="text-slate-500">({gespeicherte.length})</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {gespeicherte.map((p) => (
                <button key={p.id} onClick={() => laden(p)}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-left text-[11px]
                             text-slate-300 transition hover:border-sky-500">
                  {p.titel}
                  {p.ziel && <span className="ml-1.5 text-slate-500">{tag(p.ziel.begin)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reiter: die Prognosen zu diesem Cup - eine je Finale und Region. */}
        {cupId && gespeicherte.some((x) => x.cupId === cupId) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {gespeicherte.filter((x) => x.cupId === cupId).map((x) => {
              const aktiv = (x.gruppe ?? '') === gruppe;
              return (
                <button key={x.id} onClick={() => laden(x)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold
                              uppercase tracking-wider transition ${aktiv
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                  {x.gruppe || x.titel}
                </button>
              );
            })}
          </div>
        )}

        {/*
          * Die Leiste zum gewaehlten Finale: Bild, Name, Datum, woher das
          * Feld kommt, und Speichern. Kein Suchfeld, keine Haken mehr - das
          * Finale ist gewaehlt, der Rest kommt von Epic.
          */}
        {cupId && cup && (
          <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex flex-wrap items-center gap-3">
              {cup.bild && (
                <img src={cup.bild} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <input value={titel} onChange={(e) => setTitel(e.target.value)}
                  title={uebs('Titel')}
                  className="w-full max-w-xl bg-transparent text-base font-semibold text-slate-100
                             outline-none focus:text-sky-300" />
                <p className="truncate text-xs text-slate-500">
                  {ziel && <>{tag(ziel.begin)} · </>}
                  {quellen.length
                    ? quellen.map((q) => `${q.titel}${q.topN ? ` · Top ${q.topN}` : ''}`).join(' + ')
                    : uebs('Feld laut Epic')}
                  {feldGeprueft && <> · <T>Marken bei Epic bestätigt</T></>}
                </p>
              </div>
              <label className="text-[11px] text-slate-500">
                <T>Weiter bis Platz</T>
                <input value={qualiBis || ''} inputMode="numeric"
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setQualiBis(Number.isFinite(n) && n > 0 ? n : 0);
                  }}
                  className="ml-1.5 w-12 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1
                             text-center text-xs text-slate-100 outline-none focus:border-amber-600" />
              </label>
              {ziel && (
                <button onClick={() => feldLaden(ziel, true)} disabled={laedt}
                  title={uebs('Das Feld noch einmal von Epic holen')}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-slate-300
                             transition hover:border-sky-500 disabled:opacity-40">
                  {laedt ? uebs('lädt…') : uebs('Feld neu laden')}
                </button>
              )}
              {eigen ? (
                <span className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-slate-500">
                  <T>Speichert sich von selbst</T>
                </span>
              ) : (
                <button onClick={speichern} disabled={!cup || !feld.length}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white
                             transition hover:bg-sky-400 disabled:opacity-40">
                  <T>Speichern</T>
                </button>
              )}
            </div>
            {feldHinweise.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300/90">
                {feldHinweise.map((h, i) => <li key={i}>{hinweisText(h)}</li>)}
              </ul>
            )}
          </div>
        )}

        {status && cupId && <p className="mb-3 text-xs text-slate-500">{status}</p>}

        {/*
          * Reihenfolge und Feld - drei Spalten wie im Vorbild des Betreibers:
          * links die Karte des Cups, in der Mitte die Plaetze in drei
          * Spalten ("1st" bis "50th"), rechts schmal das Feld nach Regionen.
          * "Mittig sehe ich die Plaetze, links am Rand die Map, die Spieler
          * rechts am Rand, nach Region sortiert."
          *
          * Seit dem 24.9.2026 bekommt die Karte den Loewenanteil: "Man
          * erkennt sehr wenig ... die muss sicher mal doppelt so gross
          * sein." Die Karte ist so gross, wie das Fenster hoch ist, und ihre
          * Spalte genau so breit - was an Breite uebrig bleibt, bekommen die
          * Plaetze. Beide Listen rechts scrollen in der Hoehe der Karte,
          * statt die Zeile hoeher zu machen als sie.
          */}
        {cupId && (
        <div className="grid gap-3
                        lg:grid-cols-[minmax(0,calc(100vh_-_4.9rem))_minmax(260px,1fr)_240px]
                        xl:grid-cols-[minmax(0,calc(100vh_-_4.9rem))_minmax(420px,1fr)_250px]">

          {/* Kartenansicht: dieselben Formen wie im Karteneditor, hier nur zum
              Verteilen. Wer wo landet, hilft beim Aufstellen der Reihenfolge. */}
          <div className={vollbildKarte
            ? 'fixed inset-0 z-50 flex items-center justify-center overflow-hidden'
            : 'min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3'}
            // Im Vollbild geht das Meer bis an den Bildschirmrand (kartenVollbild).
            style={vollbildKarte ? { background: kartenBild.meer } : undefined}>
            {/*
              * Die Kopfzeile ueber der Karte gibt es nur fuer den Admin.
              *
              * Der Betreiber (24.9.2026): "Map ist unnoetig, diese Spots ist
              * unnoetig, dieser Titel ist unnoetig, diese Zoom-Anzeige ist
              * unnoetig" - fuer alle, die nicht als Admin angemeldet sind.
              * Ortsnamen und Vollbild sitzen jetzt als kleine Quadrate auf der
              * Karte selbst, fuer jeden.
              */}
            {/* Im Vollbild nur die Karte - der Betreiber: "diese Zeichen oben
                rechts sollen weg sein". */}
            {istAdmin && !vollbildKarte && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                <T>Karte</T>
                <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                  {spots.length} <T>Spots</T> · {Object.values(aufSpot).flat().length} <T>verteilt</T>
                  {zoom > 1 && ` · ${zoom.toFixed(1)}×`}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {/* Vor dem Speichern waehlt man die Karte aus, danach steht
                    sie fest - benennen laesst sie sich aber jederzeit. */}
                {eigeneKarte ? (
                  benenntKarte ? (
                    <input autoFocus value={kartenTitel}
                      onChange={(e) => setKartenTitel(e.target.value)}
                      onBlur={() => setBenenntKarte(false)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setBenenntKarte(false); }}
                      placeholder={uebs('Name der Karte')}
                      className="w-44 rounded-lg border border-amber-600 bg-zinc-950 px-2
                                 py-1 text-[11px] text-slate-100 outline-none" />
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-lg border
                                     border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px]
                                     text-slate-200">
                      {kartenName}
                      <button onClick={() => setBenenntKarte(true)}
                        title={uebs('Namen der Karte ändern')}
                        className="text-slate-600 hover:text-amber-400">✎</button>
                    </span>
                  )
                ) : globals ? (
                  // Die Globals haben eine Karte - die aus dem Karten-Werkzeug.
                  <span className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1
                                   text-[11px] text-slate-200">
                    {kartenName}
                  </span>
                ) : (
                  <select value={bildId} onChange={(e) => { setBildVonHand(true); setBildId(e.target.value); }}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1
                               text-[11px] text-slate-200 outline-none focus:border-sky-500">
                    <option value="">Battle Royale</option>
                    {bilder.map((b) => (
                      <option key={b.id} value={b.id}>{b.titel}</option>
                    ))}
                  </select>
                )}

                {/*
                  * Die Insel des Spieltags, von Epic - und was ihr als Bild
                  * zugeordnet ist. Fehlt die Zuordnung, laesst sie sich hier
                  * einmal setzen; sie speichert sich sofort.
                  */}
                {inselJetzt.art === 'reload' && inselJetzt.schluessel && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-zinc-800
                                   bg-zinc-950 px-2 py-1 text-[11px] text-slate-300">
                    <span className="text-slate-500"><T>Reload-Insel</T></span>
                    <span className="font-semibold">{inselJetzt.schluessel}</span>
                    <span className="text-slate-600">→</span>
                    <select value={inseln[inselJetzt.schluessel] ?? ''}
                      onChange={(e) => void inselZuordnen(inselJetzt.schluessel as string, e.target.value)}
                      title={uebs('Welches Kartenbild zu dieser Insel gehört')}
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5
                                 text-[11px] text-slate-200 outline-none focus:border-sky-500">
                      <option value="">{uebs('Bild zuordnen …')}</option>
                      {bilder.map((b) => (
                        <option key={b.id} value={b.id}>{b.titel}</option>
                      ))}
                    </select>
                  </span>
                )}

                {/* Vergroessern. Das Mausrad tut dasselbe, aber nicht jeder
                    arbeitet mit einer Maus. */}
                <div className="flex items-center overflow-hidden rounded-lg
                                border border-zinc-800">
                  <button title={uebs('Herauszoomen')}
                    onClick={() => setzeAusschnitt(zoom / 1.4, mitte)}
                    className="px-2 py-1 text-[11px] text-slate-300 hover:bg-zinc-800">
                    −
                  </button>
                  <button title={uebs('Ganze Karte')}
                    onClick={() => setzeAusschnitt(1, { x: 50, y: 50 })}
                    className="border-x border-zinc-800 px-2 py-1 text-[11px]
                               text-slate-400 hover:bg-zinc-800">
                    1:1
                  </button>
                  <button title="Hineinzoomen"
                    onClick={() => setzeAusschnitt(zoom * 1.4, mitte)}
                    className="px-2 py-1 text-[11px] text-slate-300 hover:bg-zinc-800">
                    +
                  </button>
                </div>

                {istAdmin && !globals && (
                  <button onClick={() => { setFormenAn((a) => !a); setFormenStand(''); }}
                    title={uebs('Formen verschieben und ihre Ecken versetzen')}
                    className={`rounded-lg border px-2 py-1 text-[11px] transition ${formenAn
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-zinc-700 text-slate-300 hover:border-amber-500'}`}>
                    ✎ <T>Formen</T>
                  </button>
                )}
                {formenAn && (
                  <>
                    <div className="flex items-center overflow-hidden rounded-lg
                                    border border-zinc-800">
                      <button title={uebs('Rechteck aufziehen')}
                        onClick={() => {
                          setWerkzeug((w) => (w === 'rechteck' ? null : 'rechteck'));
                          setRohbau([]); setGummi(null);
                        }}
                        className={`px-2 py-1 text-[11px] transition ${werkzeug === 'rechteck'
                          ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-zinc-800'}`}>
                        ▭ Rechteck
                      </button>
                      <button title={uebs('Freie Form: Ecken klicken, am ersten Punkt schließen')}
                        onClick={() => {
                          setWerkzeug((w) => (w === 'polygon' ? null : 'polygon'));
                          setRohbau([]); setGummi(null);
                        }}
                        className={`border-l border-zinc-800 px-2 py-1 text-[11px] transition ${
                          werkzeug === 'polygon'
                            ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-zinc-800'}`}>
                        ⬠ Freie Form
                      </button>
                    </div>
                    <button onClick={speichern}
                      title={uebs('Formen, Karte und Zuordnung in dieser Prognose festhalten')}
                      className="rounded-lg border border-emerald-600 px-2 py-1 text-[11px]
                                 text-emerald-300 hover:bg-emerald-950/40">
                      Formen speichern
                    </button>
                    <button onClick={formenAlsVorlage}
                      title={uebs('Die Formen zusätzlich für jede künftige Karte übernehmen')}
                      className="text-[11px] text-slate-500 underline hover:text-slate-300">
                      auch als Vorlage
                    </button>
                  </>
                )}
                {formenStand && (
                  <span className="text-[11px] text-slate-500">{formenStand}</span>
                )}

                {/* Die Globals-Karte wird im Karten-Werkzeug verteilt - der
                    Weg dorthin statt eines Leeren-Knopfes. */}
                {globalsKarte && (
                  <a href={`/maps?id=${encodeURIComponent(globalsKarte.id)}`}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                               text-slate-300 hover:border-sky-500 hover:text-sky-300">
                    <T>Im Karten-Werkzeug öffnen</T>
                  </a>
                )}
                {Object.keys(aufSpot).length > 0 && !eigen && !karteFest && (
                  <button onClick={() => setAufSpot({})}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                               text-slate-300 hover:border-rose-500">
                    Karte leeren
                  </button>
                )}
              </div>
            </div>
            )}

            {/* Die Karten dieses Spieltags.
                Laeuft ein Tag auf zwei Karten - erst Slurpush, dann
                Stronghold -, gehoert beides zu derselben Prognose: die
                Reihenfolge der Teams gilt fuer den ganzen Tag, nur die Karte
                darunter wechselt. Jede hat ihre eigenen Formen und ihre
                eigene Zuordnung. */}
            {!globals && !vollbildKarte && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {(karten.length ? karten : [{ id: 'k1', titel: kartenName }])
                .map((k, i) => (
                  // Der offene Reiter zeigt den lebenden Stand, nicht den
                  // zuletzt abgelegten: sonst stuende dort noch das alte Bild,
                  // waehrend die Karte darunter schon das neue zeigt.
                  <button key={k.id} onClick={() => karteWechseln(i)}
                    title={`${uebs('Bild')}: ${(i === karteNr ? bildId : (k as Karte).bildId)
                      || 'Battle Royale'}`}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                      i === karteNr
                        ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    {(i === karteNr ? kartenName : k.titel) || `Karte ${i + 1}`}
                  </button>
                ))}
              <button onClick={karteAnlegen}
                title={uebs('Eine weitere Karte für denselben Spieltag — gleiche Reihenfolge')}
                className="rounded-lg border border-dashed border-zinc-700 px-2.5 py-1
                           text-[11px] text-slate-500 transition hover:border-sky-500
                           hover:text-sky-400">
                + <T>Karte</T>
              </button>
              {/* Gibt es zu diesem Cup schon eine Turnierkarte, sind ihre
                  Formen einen Klick entfernt - Neuzeichnen waere doppelte
                  Arbeit. Ohne passende Karte erscheint der Knopf nicht. */}
              {passendeTurnierKarten.length > 0 && (
                <div className="relative">
                  <button onClick={() => setTurnierListeOffen((v) => !v)}
                    title={uebs('Formen einer vorhandenen Turnierkarte übernehmen')}
                    className="rounded-lg border border-dashed border-sky-800 px-2.5 py-1
                               text-[11px] text-sky-500 transition hover:border-sky-500
                               hover:text-sky-400">
                    ↳ <T>aus Turnierkarte</T>
                  </button>
                  {turnierListeOffen && (
                    <div className="absolute left-0 top-full z-40 mt-1 max-h-64 w-64
                                    overflow-y-auto rounded-lg border border-zinc-700
                                    bg-zinc-950 shadow-xl">
                      {passendeTurnierKarten.map((tk) => (
                        <button key={tk.id} type="button"
                          onClick={() => karteAusTurnier(tk)}
                          className="block w-full border-b border-zinc-900 px-3 py-2 text-left
                                     text-[11px] text-slate-200 last:border-0
                                     hover:bg-zinc-900">
                          <span className="block">{tk.titel}</span>
                          <span className="block text-[10px] text-slate-500">
                            {tk.bildTitel || 'Battle Royale'} · {tk.spots?.length}{' '}
                            <T>Formen</T>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {karten.length > 1 && (
                <button onClick={karteEntfernen}
                  title={uebs('Diese Karte aus der Prognose nehmen — das Kartenbild bleibt erhalten')}
                  className="text-[11px] text-slate-600 hover:text-rose-400">
                  <T>entfernen</T>
                </button>
              )}
              {karten.length > 1 && (
                <span className="text-[11px] text-slate-600">
                  · gleiche Reihenfolge, eigene Formen je Karte
                </span>
              )}
            </div>
            )}

            {formenAn && (
              <p className="mb-2 text-[11px] leading-snug text-amber-300/80">
                {werkzeug === 'polygon'
                  ? `Freie Form: Ecke für Ecke klicken (${rohbau.length} gesetzt), `
                    + 'zum Schließen wieder auf den ersten Punkt. Esc bricht ab.'
                  : werkzeug === 'rechteck'
                    ? 'Rechteck: auf der Karte aufziehen. Esc bricht ab.'
                    : 'Fläche anklicken und ziehen verschiebt sie, die gelben Punkte '
                      + 'ziehen die Ecke. Neue Formen über die Werkzeuge rechts. '
                      + 'Gespeichert wird erst auf Klick — in dieselbe Ablage wie '
                      + 'im Karteneditor.'}
              </p>
            )}

            <div ref={flaeche}
              className={`${kartenSchrift.variable} relative mx-auto aspect-square w-full
                         ${vollbildKarte ? 'overflow-visible' : 'overflow-hidden rounded-lg bg-zinc-950'}`}
              style={{
                containerType: 'size',
                maxWidth: vollbildKarte ? 'min(100vw, 100vh)' : 'min(100%, calc(100vh - 6.5rem))',
                cursor: formenAn ? 'default' : zoom > 1 ? 'grab' : 'default',
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;

                // Zeichnen geht vor. Eine freie Form entsteht Ecke fuer Ecke
                // und schliesst sich, sobald man wieder am ersten Punkt ist.
                if (formenAn && werkzeug === 'polygon') {
                  const q = pos(e);
                  if (rohbau.length >= 3
                    && Math.hypot(rohbau[0].x - q.x, rohbau[0].y - q.y) < SCHLIESS_NAEHE) {
                    neueForm(rohbau, 'polygon');
                    setRohbau([]); setZeiger(null); setWerkzeug(null);
                    return;
                  }
                  setRohbau((a) => [...a, q]);
                  return;
                }
                if (formenAn && werkzeug === 'rechteck') {
                  const q = pos(e);
                  gummiRef.current = { von: q, bis: q };
                  setGummi(gummiRef.current);
                  return;
                }

                // Sonst: den Ausschnitt schieben, sofern hineingezoomt.
                if (zoomRef.current <= 1) return;
                const el = flaeche.current;
                if (!el) return;
                griff.current = {
                  art: 'schieben', px: e.clientX, py: e.clientY,
                  mitte: { ...mitteRef.current },
                  rahmen: el.getBoundingClientRect(),
                };
              }}
              onMouseMove={(e) => {
                // Die Form unter dem Zeiger hervorheben, wie beim Vorbild -
                // direkt am Element, nicht waehrend eines Zugs.
                if (!griff.current && !werkzeug) {
                  const q = pos(e);
                  const drunter = [...spots].reverse()
                    .find((sp) => imPolygon(q, sp.punkte))?.id ?? null;
                  hebeFormHervor(flaeche.current, hoverRef.current, drunter);
                  hoverRef.current = drunter;
                }
                if (!formenAn || !werkzeug) return;
                const q = pos(e);
                if (werkzeug === 'polygon') { setZeiger(q); return; }
                if (!gummiRef.current) return;
                gummiRef.current = { ...gummiRef.current, bis: q };
                setGummi(gummiRef.current);
              }}
              onMouseUp={(e) => {
                const zug = gummiRef.current;
                if (!zug || werkzeug !== 'rechteck') return;
                const bis = pos(e);
                // Ein blosser Klick soll keine Form von null Groesse anlegen.
                if (Math.abs(bis.x - zug.von.x) > 1
                  && Math.abs(bis.y - zug.von.y) > 1) {
                  neueForm(rechteckPunkte(zug.von, bis), 'rechteck');
                  setWerkzeug(null);
                }
                gummiRef.current = null;
                setGummi(null);
              }}
              onMouseLeave={() => {
                hebeFormHervor(flaeche.current, hoverRef.current, null);
                hoverRef.current = null;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const key = e.dataTransfer.getData('text/team') || zieht;
                if (!key) return;
                // Ueber pos, nicht ueber den Rahmen: im Zoom liegt der
                // abgelegte Punkt sonst an ganz anderer Stelle der Karte.
                const punkt = pos(e);
                const ziel = [...spots].reverse().find((sp) => imPolygon(punkt, sp.punkte));
                if (ziel) aufForm(ziel.id, key);
                else setStatus(uebs('Dort ist keine Form — zieh das Team auf einen Spot'));
              }}>

            {/*
              * Ortsnamen und Vollbild - zwei kleine Quadrate oben rechts auf
              * der Karte, wie im Karten-Werkzeug. "Teams an/aus" gibt es nicht
              * mehr: der Betreiber will ihn "komplett immer loeschen,
              * ueberall" - ohne Teams ist die Karte hier ohne Sinn.
              */}
            {/* Im Vollbild ganz am rechten Bildschirmrand, nicht an der Karte. */}
            <div onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}
              className={`${vollbildKarte ? 'fixed right-4 top-4' : 'absolute right-2 top-2'}
                          z-30 flex flex-col gap-1.5`}>
              {!bildId && (
                <button type="button" onClick={() => setOrteSichtbar((v) => !v)}
                  title={uebs('Ortsnamen auf der Karte ein- und ausblenden')}
                  aria-label={uebs('Ortsnamen auf der Karte ein- und ausblenden')}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${orteSichtbar
                    ? 'border-sky-500 bg-sky-500 text-white'
                    : 'border-zinc-700 bg-zinc-900/90 text-slate-300 hover:border-zinc-500 hover:text-white'}`}>
                  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                    <circle cx="10" cy="10" r="2.6" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => setVollbildKarte((v) => !v)}
                title={vollbildKarte ? uebs('Schließen') : uebs('Vollbild')}
                aria-label={vollbildKarte ? uebs('Schließen') : uebs('Vollbild')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${vollbildKarte
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-zinc-700 bg-zinc-900/90 text-slate-300 hover:border-zinc-500 hover:text-white'}`}>
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 2.5h-5v5" /><path d="M12.5 2.5h5v5" />
                  <path d="M17.5 12.5v5h-5" /><path d="M2.5 12.5v5h5" />
                </svg>
              </button>
            </div>

            <div ref={ebene} className="absolute inset-0 origin-top-left"
              style={{
                transform:
                  `scale(${zoom}) translate(${50 / zoom - mitte.x}%, ${50 / zoom - mitte.y}%)`,
                width: '100%', height: '100%',
                '--z': zoom,
              } as React.CSSProperties}>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={uebs('Karte')} draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                onLoad={kartenBild.beiLaden} style={kartenBild.bildStil(vollbildKarte)}
                src={bildId
                  ? `/api/karten-bild?datei=1&id=${encodeURIComponent(bildId)}`
                  : `/api/fortnite-map?bild=${orteSichtbar ? 'poi' : 'leer'}`} />

              {/* thecomphub.com, wie auf jeder Karte - unter den Formen. */}
              <KartenWasserzeichen />

              <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                className={`absolute inset-0 h-full w-full ${formenAn
                  ? '' : 'pointer-events-none'}`}>
                {spots.map((sp) => {
                  const belegt = (aufSpot[sp.id] ?? []).length;
                  const dran = formenAn && gewaehlteForm === sp.id;
                  // Farben wie beim Vorbild (app/lib/kartenStil); Randstaerke,
                  // Hover und Schein aus globals.css.
                  const f = formFarbe(belegt, belegt ? null : sp.farbe);
                  return (
                    <polygon key={sp.id} data-form={sp.id}
                      className={`karten-form${f.rot ? ' ist-rot' : ''}${dran ? ' ist-gewaehlt' : ''}`}
                      points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                      onMouseDown={formenAn && !werkzeug ? (e) => {
                        e.stopPropagation();
                        setGewaehlteForm(sp.id);
                        griff.current = { art: 'form', id: sp.id, letzt: pos(e) };
                      } : undefined}
                      style={formenAn && !werkzeug ? { cursor: 'move' } : undefined}
                      fill={f.fuellung}
                      stroke={dran ? 'rgb(251,191,36)' : f.rand}
                      vectorEffect="non-scaling-stroke" />
                  );
                })}

                {/* Die Ecken der gewaehlten Form. Sie skalieren gegen den Zoom,
                    damit sie bei starker Vergroesserung nicht die Form
                    verdecken. */}
                {formenAn && !werkzeug
                  && spots.filter((sp) => sp.id === gewaehlteForm).map((sp) =>
                    sp.punkte.map((q, nr) => (
                      <circle key={`${sp.id}-${nr}`} cx={q.x} cy={q.y}
                        r={1.1 / Math.sqrt(zoom)}
                        fill="rgb(251,191,36)" stroke="rgba(0,0,0,0.8)" strokeWidth={0.3}
                        style={{ cursor: 'crosshair' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          griff.current = {
                            art: 'ecke', id: sp.id, nr,
                            gegen: sp.form === 'rechteck' && sp.punkte.length === 4
                              ? sp.punkte[(nr + 2) % 4] : null,
                          };
                        }} />
                    )))}

                {/* Was gerade entsteht. */}
                {!!rohbau.length && (
                  <>
                    <polyline
                      points={[...rohbau, ...(zeiger ? [zeiger] : [])]
                        .map((q) => `${q.x},${q.y}`).join(' ')}
                      fill="none" stroke="rgb(251,191,36)" strokeWidth={2}
                      strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                    {rohbau.map((q, nr) => (
                      <circle key={nr} cx={q.x} cy={q.y} r={1.1 / Math.sqrt(zoom)}
                        fill={nr === 0 ? 'rgb(52,211,153)' : 'rgb(251,191,36)'}
                        stroke="rgba(0,0,0,0.8)" strokeWidth={0.3} />
                    ))}
                  </>
                )}
                {gummi && (
                  <polygon points={rechteckPunkte(gummi.von, gummi.bis)
                    .map((q) => `${q.x},${q.y}`).join(' ')}
                    fill="rgba(251,191,36,0.18)" stroke="rgb(251,191,36)" strokeWidth={2}
                    strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                )}
              </svg>

              {/*
                * Beschriftungen - wie im Karten-Werkzeug: ein Kasten in der
                * Groesse der Form, darin die Teams mittig oder von Rand zu
                * Rand verteilt. Die Schrift rechnet gegen --z und bleibt beim
                * Zoomen auf dem Bildschirm gleich gross, ohne dass die Karte
                * neu gezeichnet werden muss.
                */}
              {spots.map((sp) => {
                const keys = aufSpot[sp.id] ?? [];
                if (!keys.length) return null;
                const r = rahmen(sp.punkte);
                const anzahl = keys.length;
                const mitteX = r.links + r.breite / 2;

                return (
                  <div key={sp.id} data-form={sp.id}
                    className="karten-beschriftung pointer-events-none absolute z-10 flex
                               flex-col items-center text-center"
                    style={{
                      left: `${r.links}%`, top: `${r.oben}%`,
                      width: `${r.breite}%`, height: `${r.hoehe}%`,
                      justifyContent: anzahl === 1 ? 'center' : 'space-between',
                      paddingBlock: 'calc(0.45cqw / var(--z, 1))',
                    }}>
                    {keys.map((k, i) => {
                      const texte = zeilenFuer(k, anzahl === 1);
                      if (!texte.length) return null;
                      // Waagerecht mittig in der Spanne auf der Hoehe der Zeile -
                      // bei einer schraegen Form liegt die anders als die Mitte
                      // des umschliessenden Rechtecks.
                      const yProz = anzahl === 1
                        ? r.oben + r.hoehe / 2
                        : r.oben + r.hoehe * (0.1 + 0.8 * (i / (anzahl - 1)));
                      const spanne = sp.form === 'rechteck' ? null : spanneBei(sp.punkte, yProz);
                      const versatz = spanne && r.breite > 0
                        ? ((spanne.mitte - mitteX) / r.breite) * 100 : 0;
                      return (
                        <div key={k} draggable={!karteFest}
                          onDragStart={(ev) => {
                            ev.dataTransfer.setData('text/team', k); setZieht(k);
                          }}
                          onClick={() => vonForm(sp.id, k)}
                          title={karteFest ? undefined : uebs('Klick entfernt das Team von dieser Form')}
                          className={`relative ${karteFest ? '' : 'pointer-events-auto cursor-pointer'}`}
                          style={versatz ? { left: `${versatz}%` } : undefined}>
                          {texte.map((t, z) => (
                            <p key={z} className="karten-name"
                              style={{ fontSize: `calc(${einheitsGroesse}cqw / var(--z, 1))` }}>
                              {t}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

            </div>

              {!spots.length && (
                <p className="absolute inset-x-0 bottom-3 text-center text-[11px]
                              text-slate-400">
                  <T>Zu diesem Kartenbild sind noch keine Formen gezeichnet.</T>
                </p>
              )}
            </div>

            {/* Die geöffnete Form: benennen, färben, entfernen. */}
            {formenAn && gewaehlteForm && (() => {
              const sp = spots.find((x) => x.id === gewaehlteForm);
              if (!sp) return null;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg
                                border border-amber-800/50 bg-amber-950/10 p-2">
                  <input value={sp.name ?? ''}
                    onChange={(e) => setSpots((alt) => alt.map((x) =>
                      (x.id === sp.id ? { ...x, name: e.target.value } : x)))}
                    placeholder="Beschriftung (optional)"
                    className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950
                               px-2 py-1 text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-amber-600" />
                  <span className="text-[11px] text-slate-500">
                    {sp.punkte.length} Ecken
                  </span>
                  <input type="color" value={sp.farbe ?? '#38bdf8'}
                    title={uebs('Eigene Farbe für diese Form')}
                    onChange={(e) => setSpots((alt) => alt.map((x) =>
                      (x.id === sp.id ? { ...x, farbe: e.target.value } : x)))}
                    className="h-6 w-9 cursor-pointer rounded border border-zinc-700
                               bg-zinc-950 p-0.5" />
                  {sp.farbe && (
                    <button onClick={() => setSpots((alt) => alt.map((x) =>
                      (x.id === sp.id ? { ...x, farbe: undefined } : x)))}
                      className="text-[11px] text-slate-500 underline hover:text-slate-300">
                      automatisch
                    </button>
                  )}
                  <button onClick={() => formLoeschen(sp.id)}
                    className="rounded border border-rose-800/60 px-2 py-1 text-[11px]
                               text-rose-300 hover:border-rose-600">
                    <T>Form löschen</T>
                  </button>
                </div>
              );
            })()}
          </div>

          <div className={vollbildListe
            ? 'fixed inset-0 z-50 flex flex-col overflow-auto bg-zinc-950 p-5'
            : 'flex min-w-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-3'}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                <T>Reihenfolge</T>
                {plaetze.length
                  ? ` — ${uebs('Platz')} 1 ${uebs('bis')} ${plaetze.length}`
                  : ''}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={alleRaus} disabled={!plaetze.some(Boolean)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 hover:border-rose-500 disabled:opacity-40">
                  Reset
                </button>
                {/* Nur die Prognose, gross - wie der Knopf "Predictions" im Vorbild. */}
                <button onClick={() => setVollbildListe((v) => !v)}
                  className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                    vollbildListe
                      ? 'border-zinc-700 text-slate-300 hover:border-sky-500'
                      : 'border-sky-500/60 text-sky-300 hover:bg-sky-500/10'}`}>
                  {vollbildListe ? `✕ ${uebs('Schließen')}` : 'Predictions'}
                </button>
                {/* Karte und alle Plaetze in einem Bild - zum Posten. */}
                <button onClick={alsSchnappschuss} disabled={!plaetze.length}
                  title={uebs('Karte und Rangliste als ein Bild speichern')}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 transition hover:border-sky-500
                             disabled:opacity-40">
                  📷 {uebs('Screenshot')}
                </button>
                {schnappschussStand && (
                  <span className="self-center text-[11px] text-slate-500">
                    {schnappschussStand}
                  </span>
                )}
              </div>
            </div>

            {/* Die Liste scrollt fuer sich - so bestimmt die Karte die Hoehe. */}
            <div className={vollbildListe ? 'flex-1' : 'relative lg:min-h-[320px] lg:flex-1'}>
            <div className={vollbildListe ? '' : `max-h-[70vh] overflow-y-auto pr-1
                            lg:absolute lg:inset-0 lg:max-h-none`}>
            {!plaetze.length ? (
              <p className="py-8 text-center text-xs text-slate-500">
                {laedt ? <T>lädt das Feld …</T> : <T>Noch kein Feld — siehe Hinweis oben.</T>}
              </p>
            ) : (
              /*
               * Auch ausserhalb des Vollbilds mehrspaltig.
               *
               * Vorher stand hier eine einzige Spalte - bei fuenfzig Teams
               * hiess das scrollen, scrollen, scrollen, waehrend die Karte
               * daneben schon lange aus dem Bild war. Der Betreiber wollte
               * beides gleichzeitig sehen: "nicht nur beim Vollscreen, dass
               * man alles sieht, sondern dass man das so kleiner macht und
               * dafür alle fünfzig auf einer Ebene, wo man die Map sieht".
               *
               * Also zwei Spalten, ab einem breiten Fenster drei, und die
               * Zeilen enger.
               */
              <div className={vollbildListe
                ? 'grid flex-1 content-start gap-2 md:grid-cols-2 xl:grid-cols-3'
                : 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 xl:grid-cols-3'}>
                {plaetze.map((key, i) => {
                  const t = teamZu(key);
                  return (
                    <div key={i}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const key = e.dataTransfer.getData('text/team') || zieht;
                        if (key) aufPlatz(i, key);
                      }}
                      draggable={!!t}
                      onDragStart={(e) => {
                        if (!key) return;
                        e.dataTransfer.setData('text/team', key); setZieht(key);
                      }}
                      className={`flex items-center rounded-lg border ${vollbildListe
                        ? 'gap-3 px-3 py-2.5 text-[15px]' : 'gap-2 px-2 py-1 text-[12px]'
                      } ${
                        qualiBis && i < qualiBis
                          ? 'border-amber-500/70 bg-amber-500/10'
                          : t ? 'cursor-grab border-zinc-700 bg-zinc-950/70'
                              : 'border-dashed border-zinc-800'}`}>
                      <span className={`shrink-0 text-right text-[11px] font-bold tabular-nums ${
                        vollbildListe ? 'w-10' : 'w-8'} ${
                        qualiBis && i < qualiBis ? 'text-amber-300' : 'text-slate-400'}`}>
                        {ordnung(i + 1)}
                      </span>
                      {t ? (
                        <>
                          <TeamFlagge groesse={vollbildListe ? 32 : 22}
                            laender={t.namen.map(
                              (n, k) => findeProfil(n, t.ids[k])?.land)} />
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            {t.namen.map((n, k) => (
                              <span key={k} className="truncate font-medium text-slate-100">
                                {nameVon(n, t.ids[k])}
                              </span>
                            ))}
                          </span>
                          {!eigen && (
                            <button onClick={() => pflegeOeffnen(t)}
                              title={uebs('Flaggen dieses Teams von Hand setzen')}
                              className="shrink-0 text-slate-600 hover:text-amber-400">✎</button>
                          )}
                          <button onClick={() => raeumen(i)} title={uebs('Zurück in die Liste')}
                            className="shrink-0 text-slate-600 hover:text-rose-400">×</button>
                        </>
                      ) : (
                        <span className="text-slate-700">–</span>
                      )}
                    </div>
                  );
                })}
                {/*
                  * Der MVP - unten in der Liste, wie im Vorbild. Ein Name aus
                  * dem Feld; die Vorschlaege kommen aus den geladenen Teams.
                  */}
                {feld.length > 0 && (
                  <div className={`flex items-center rounded-lg border border-amber-500/40
                                   bg-amber-500/5 ${vollbildListe
                    ? 'gap-3 px-3 py-2 text-[15px]' : 'gap-2 px-2 py-1 text-[12px]'}`}>
                    <span className={`shrink-0 text-[11px] font-bold text-amber-300 ${
                      vollbildListe ? 'w-10' : 'w-8'}`}>MVP</span>
                    <MvpWahl wert={mvp} setzen={setMvp} gross={vollbildListe}
                      spieler={feld.flatMap((t) => t.namen.map((n, k) => ({
                        name: nameVon(n, t.ids[k]),
                        land: findeProfil(n, t.ids[k])?.land,
                        region: t.region,
                        schluessel: `${t.key}#${k}`,
                      })))} />
                    {mvp && (
                      <button onClick={() => setMvp('')} title={uebs('Leeren')}
                        className="shrink-0 text-slate-600 hover:text-rose-400">×</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Was die Farbe bedeutet - im Vollbild, wo Platz dafuer ist. */}
            {vollbildListe && !!qualiBis && (
              <p className="mt-4 flex items-center justify-center gap-5 text-[11px]
                            uppercase tracking-wider text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  {qualiBis === 1 ? uebs('Siegerteam') : `${uebs('Weiter, Platz 1 bis')} ${qualiBis}`}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
                  <T>Übrige Plätze</T>
                </span>
              </p>
            )}
            </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-3
                            lg:min-h-0 lg:flex-1">
              <div className="mb-2 flex items-center justify-between">
                {/* "List" statt "Field" - der Betreiber wollte es so genannt haben. */}
                <h2 className="text-sm font-semibold text-slate-100"><T>Liste</T></h2>
                <span className="text-xs text-slate-500">
                  {feld.length - offen.length}/{feld.length} <T>gesetzt</T>
                </span>
              </div>
              {feld.length > 0 && (
                <div className="relative mb-2">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setSuche(''); }}
                    placeholder={uebs('Spieler suchen …')} type="text"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-3
                               pr-8 text-[13px] text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  {suche && (
                    <button onClick={() => setSuche('')} title={uebs('Suche leeren')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500
                                 hover:text-slate-200">×</button>
                  )}
                </div>
              )}
              {/*
                * Nach Regionen, die groesste Gruppe zuerst.
                *
                * Der Betreiber: "nach Region sortiert, EU zuerst, dann NAC ...
                * jedoch geht es nicht um die Regionen, sondern um die meisten
                * Spieler in einer Region." Also: die Region mit den meisten
                * Teams oben, bei Gleichstand die Reihenfolge der Seite.
                */}
              <div className="relative lg:min-h-[320px] lg:flex-1">
              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1
                              lg:absolute lg:inset-0 lg:max-h-none">
                {(() => {
                  const gruppen = new Map<string, TeamImFeld[]>();
                  for (const t of offen.filter(passtZurSuche)) {
                    const r = t.region || '?';
                    if (!gruppen.has(r)) gruppen.set(r, []);
                    gruppen.get(r)!.push(t);
                  }
                  const reihe = [...gruppen.entries()].sort((a, b) =>
                    b[1].length - a[1].length
                    || REGION_REIHE.indexOf(a[0]) - REGION_REIHE.indexOf(b[0]));
                  return reihe.map(([region, teams]) => (
                    <div key={region}>
                      {gruppen.size > 1 && (
                        <p className="mb-1 flex items-center gap-2 px-1 text-[10px]
                                      font-semibold uppercase tracking-[0.14em]
                                      text-slate-500">
                          {region} <span className="text-slate-600">{teams.length}</span>
                        </p>
                      )}
                      <div className="space-y-1">
                {teams.map((t) => (
                  <button key={t.key} onClick={() => setzen(t.key)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/team', t.key); setZieht(t.key);
                    }}
                    onDragEnd={() => setZieht(null)}
                    title={`${t.herkunft.join('\n')}\n\nZiehen für einen bestimmten Platz, `
                      + 'Klick für den nächsten freien'}
                    className="flex w-full items-center gap-2.5 rounded-lg border
                               border-zinc-800 px-2.5 py-2 text-left text-[13px]
                               transition hover:border-sky-500 hover:bg-sky-950/20">
                    <TeamFlagge laender={t.namen.map(
                      (n, k) => findeProfil(n, t.ids[k])?.land)} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      {t.namen.map((n, k) => (
                        <span key={k} className="truncate font-medium text-slate-100">
                          {nameVon(n, t.ids[k])}
                        </span>
                      ))}
                    </span>
                    {/* Die Region als kleine Marke, wie im Vorbild. */}
                    <span className="shrink-0 rounded border border-sky-500/40 px-1 py-px
                                     text-[9px] font-semibold uppercase text-sky-300">
                      {t.region || '?'}
                    </span>
                    {!eigen && (
                    <span role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); pflegeOeffnen(t); }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.stopPropagation(); pflegeOeffnen(t);
                      }}
                      title={`${uebs('Flaggen dieses Teams von Hand setzen')} · #${t.besterPlatz}`}
                      className="shrink-0 cursor-pointer text-slate-600
                                 hover:text-amber-400">✎</span>
                    )}
                  </button>
                ))}
                      </div>
                    </div>
                  ));
                })()}
                {/* Schon gesetzt, aber gesucht: mit Platz statt gar nicht. */}
                {suche.trim() && (() => {
                  const gesetzt = plaetze
                    .map((key, i) => ({ t: teamZu(key), i }))
                    .filter((x): x is { t: TeamImFeld; i: number } => !!x.t && passtZurSuche(x.t));
                  if (!gesetzt.length) return null;
                  return (
                    <div>
                      <p className="mb-1 px-1 text-[10px] font-semibold uppercase
                                    tracking-[0.14em] text-slate-500">
                        <T>Bereits gesetzt</T>
                      </p>
                      <div className="space-y-1">
                        {gesetzt.map(({ t, i }) => (
                          <div key={t.key}
                            className="flex items-center gap-2.5 rounded-lg border border-zinc-800/70
                                       px-2.5 py-2 text-[13px] opacity-70">
                            <span className="w-9 shrink-0 text-[11px] font-bold tabular-nums
                                             text-sky-300">{ordnung(i + 1)}</span>
                            <TeamFlagge laender={t.namen.map(
                              (n, k) => findeProfil(n, t.ids[k])?.land)} />
                            <span className="flex min-w-0 flex-1 flex-col leading-tight">
                              {t.namen.map((n, k) => (
                                <span key={k} className="truncate text-slate-300">
                                  {nameVon(n, t.ids[k])}
                                </span>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {suche.trim() && feld.length > 0 && !feld.some(passtZurSuche) && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    <T>Kein Spieler im Feld passt zur Suche.</T>
                  </p>
                )}
                {!offen.length && feld.length > 0 && !suche.trim() && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    <T>Alle Teams sind gesetzt.</T>
                  </p>
                )}
                {!feld.length && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    <T>Noch kein Feld geladen.</T>
                  </p>
                )}
              </div>
              </div>
            </div>

            {/* Unter /globals nicht: dort gibt es nur diese eine Prognose,
                und Prognosen anderer Turniere haben dort nichts zu suchen -
                weder zum Oeffnen noch zum Loeschen. */}
            {!globals && gespeicherte.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <h2 className="mb-2 text-sm font-semibold text-slate-100">
                  Gespeicherte Prognosen ({gespeicherte.length})
                </h2>
                <div className="space-y-1">
                  {gespeicherte.map((p) => (
                    <div key={p.id}
                      className="rounded-lg border border-zinc-800 px-2 py-1.5">
                      {benennt === p.id ? (
                        <div className="space-y-1.5">
                          <input autoFocus value={benenntTitel}
                            onChange={(e) => setBenenntTitel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') umbenennen(p); }}
                            placeholder={uebs('Titel')}
                            className="w-full rounded border border-zinc-800 bg-zinc-950
                                       px-2 py-1 text-xs text-slate-100 outline-none
                                       focus:border-amber-600" />
                          <input value={benenntGruppe}
                            onChange={(e) => setBenenntGruppe(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') umbenennen(p); }}
                            placeholder={uebs('Gruppe oder Karte (frei)')}
                            className="w-full rounded border border-zinc-800 bg-zinc-950
                                       px-2 py-1 text-xs text-slate-100 outline-none
                                       focus:border-amber-600" />
                          <div className="flex gap-2">
                            <button onClick={() => umbenennen(p)}
                              className="rounded bg-amber-600 px-2 py-1 text-[11px]
                                         text-white hover:bg-amber-500">
                              <T>Übernehmen</T>
                            </button>
                            <button onClick={() => setBenennt(null)}
                              className="text-[11px] text-slate-500 hover:text-slate-300">
                              <T>Abbrechen</T>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => laden(p)}
                            className="min-w-0 flex-1 truncate text-left text-xs
                                       text-slate-300 hover:text-sky-400">
                            {p.titel}
                            <span className="ml-1.5 text-[10px] text-slate-500">
                              {p.cupTitel}{p.gruppe ? ` · ${p.gruppe}` : ''}
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              setBenennt(p.id);
                              setBenenntTitel(p.titel);
                              setBenenntGruppe(p.gruppe ?? '');
                              setLoeschtGleich(null);
                            }}
                            title={uebs('Titel und Gruppe ändern')}
                            className="shrink-0 text-slate-600 hover:text-amber-400">✎</button>
                          {loeschtGleich === p.id ? (
                            <>
                              <button onClick={() => prognoseLoeschen(p)}
                                className="shrink-0 rounded bg-rose-700 px-1.5 py-0.5
                                           text-[10px] text-white hover:bg-rose-600">
                                wirklich?
                              </button>
                              <button onClick={() => setLoeschtGleich(null)}
                                className="shrink-0 text-[10px] text-slate-500
                                           hover:text-slate-300"><T>nein</T></button>
                            </>
                          ) : (
                            <button onClick={() => setLoeschtGleich(p.id)}
                              title={uebs('Diese Prognose endgültig entfernen')}
                              className="shrink-0 text-slate-600 hover:text-rose-400">×</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Stift-Fenster: Flaggen von Hand setzen.
          Epic liefert keine Herkunft, und die einzige Rangliste, die welche
          fuehrt, ordnet nachweislich falsch zu. Was hier eingetragen wird,
          steht deshalb im Profil - einmal gesetzt, gilt es ueberall und
          ueberlebt das Neuladen. */}
      {pflegt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center
                        bg-black/70 p-4"
          onClick={() => setPflegt(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-zinc-800
                       bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Flagge, Name und Region
                <span className="ml-2 text-[11px] font-normal text-slate-500">
                  {pflegt.namen.map((n) => kurz(n)).join(' + ')}
                </span>
              </h3>
              <button onClick={() => setPflegt(null)}
                className="text-slate-500 hover:text-slate-200">✕</button>
            </div>

            <input value={flaggenSuche} onChange={(e) => setFlaggenSuche(e.target.value)}
              placeholder={uebs('Kürzel suchen — de, ro, us …')}
              className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950
                         px-3 py-2 text-sm text-slate-100 outline-none
                         placeholder:text-slate-600 focus:border-amber-600" />

            <div className="space-y-4">
              {pflegt.namen.map((n, k) => {
                const pr = findeProfil(n, pflegt.ids[k]);
                const gesetzt = (entwurf[k] ?? '').toLowerCase();
                const q = flaggenSuche.trim().toLowerCase();
                const liste = q ? flaggen.filter((f) => f.includes(q)) : flaggen;
                return (
                  <div key={k} className="rounded-xl border border-zinc-800 p-3">
                    <div className="mb-2 flex items-center gap-2.5">
                      {gesetzt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/flags/${gesetzt}.png`} alt={gesetzt}
                          className="h-7 w-7 shrink-0 rounded-full object-cover
                                     ring-1 ring-white/20" />
                      ) : (
                        <span className="h-7 w-7 shrink-0 rounded-full border
                                         border-zinc-700 bg-zinc-800" />
                      )}
                      {/*
                        * Der Anzeigename, aenderbar.
                        *
                        * Er gilt ueberall, wo dieser Spieler auftaucht -
                        * auf der Karte, im Leaderboard, in der Statistik -,
                        * denn er haengt an der Konto-Id und nicht am
                        * Ingame-Namen.
                        */}
                      <input value={namensEntwurf[k] ?? ''}
                        onChange={(e) => setNamensEntwurf((a) => a.map((v, i) =>
                          (i === k ? e.target.value : v)))}
                        placeholder={kurz(n)}
                        spellCheck={false}
                        title={uebs('Name für die Anzeige — leer heißt: so, wie Epic ihn liefert')}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800
                                   bg-zinc-950 px-2.5 py-1 text-sm text-slate-100
                                   outline-none placeholder:text-slate-600
                                   focus:border-amber-600" />
                      <input value={entwurf[k] ?? ''} maxLength={2}
                        onChange={(e) => setEntwurf((a) => a.map((v, i) =>
                          (i === k ? e.target.value.toUpperCase() : v)))}
                        placeholder="—"
                        className="w-14 rounded-lg border border-zinc-800 bg-zinc-950
                                   px-2 py-1 text-center text-sm uppercase
                                   text-slate-100 outline-none focus:border-amber-600" />
                      {gesetzt && (
                        <button
                          onClick={() => setEntwurf((a) => a.map((v, i) => (i === k ? '' : v)))}
                          className="text-[11px] text-slate-500 hover:text-rose-400">
                          <T>leeren</T>
                        </button>
                      )}
                    </div>

                    {/*
                      * Die Region - leer heisst "so, wie sie gezaehlt wird".
                      *
                      * Gezaehlt wird, wo jemand am haeufigsten angetreten
                      * ist. Wechselt er, stimmt das eine Weile nicht; dann
                      * wird hier eine gesetzt, und sie gilt ueberall.
                      */}
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[10px] uppercase tracking-wider
                                       text-slate-600">
                        <T>Region</T>
                      </span>
                      {WETTKAMPFREGIONEN.map((r) => (
                        <button key={r}
                          onClick={() => setRegionEntwurf((a) => a.map((v, i) =>
                            (i === k ? (v === r ? '' : r) : v)))}
                          className={`rounded-md border px-2 py-0.5 text-[11px]
                                      font-semibold transition ${
                            (regionEntwurf[k] ?? '') === r
                              ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                              : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                          {r}
                        </button>
                      ))}
                      {(regionEntwurf[k] ?? '') && (
                        <button
                          onClick={() => setRegionEntwurf((a) => a.map((v, i) =>
                            (i === k ? '' : v)))}
                          className="ml-1 text-[11px] text-slate-600
                                     transition hover:text-rose-400">
                          <T>wie gezählt</T>
                        </button>
                      )}
                    </div>

                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {liste.map((f) => (
                        <button key={f} title={f.toUpperCase()}
                          onClick={() => setEntwurf((a) => a.map((v, i) =>
                            (i === k ? f.toUpperCase() : v)))}
                          className={`rounded-full p-0.5 transition ${gesetzt === f
                            ? 'ring-2 ring-amber-400' : 'ring-1 ring-zinc-800 hover:ring-sky-500'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/flags/${f}.png`} alt={f}
                            className="h-6 w-6 rounded-full object-cover" />
                        </button>
                      ))}
                      {!liste.length && (
                        <p className="py-2 text-[11px] text-slate-600">
                          Zu „{flaggenSuche}“ liegt keine Flagge im Ordner.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-snug text-slate-600">
                <T>Angeboten wird nur, was als Datei vorliegt —</T> {flaggen.length} Flaggen.
                Ein leeres Flaggenfeld heißt: keine Herkunft bekannt, dann bleibt
                die Hälfte grau. Ein leerer Name heißt: so, wie Epic ihn gerade
                liefert.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {pflegeStand && (
                  <span className="text-[11px] text-slate-500">{pflegeStand}</span>
                )}
                <button onClick={() => setPflegt(null)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs
                             text-slate-300 hover:border-zinc-500">
                  <T>Abbrechen</T>
                </button>
                <button onClick={pflegeSichern}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium
                             text-white transition hover:bg-amber-500">
                  <T>Speichern</T>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Huelle>
  );
}
