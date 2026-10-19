'use client';

/*
 * Der Konfigurator fuer das Stream-Banner.
 *
 * Vorher standen hier vier Overlay-Arten nebeneinander und dazu rund dreissig
 * Stellschrauben: fuenf Farbwaehler, acht Formen, Rundung, Schraege,
 * Innenabstand, Bildausschnitt, Zoom. Der Betreiber hat das abgelehnt - "viel
 * zu viele Optionen beziehungsweise einfach unnoetige Optionen".
 *
 * Jetzt drei Schritte: Cup waehlen, Duo waehlen, Vorlage waehlen. Dazu genau
 * zwei Regler - wie durchsichtig und wie hoch -, eine Vorschau und die Adresse
 * zum Kopieren. Die ausfuehrliche Bestenliste ist ein eigenes Overlay und
 * steht unten, damit sie den Weg nicht verstellt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, { overlayAdresse, useOverlays } from '../OverlayGeruest';
import { CupWahl, Vorschau, type CupInfo } from '../Teile';
import { teamGroesseVon } from '@/lib/overlayCups';
import GlobalsGeruest from '@/app/globals/GlobalsGeruest';
import GlobalsTagWahl from '@/app/globals/GlobalsTage';
import {
  GLOBALS_EVENT, GLOBALS_REGION, GLOBALS_TAGE,
} from '@/lib/globalsCup';
import FotoWahl from './FotoWahl';

interface Spieler { id: string; name: string; img?: string | null }
interface Team { rank: number; spieler: Spieler[] }

/** Muss zu public/overlay/vorlagen.js passen. */
const VORLAGEN = [
  { id: 'nacht', titel: 'Nacht', grund: '#0d1b3a', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'kohle', titel: 'Kohle', grund: '#0b0b0e', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'eis', titel: 'Eis', grund: '#0b3d7a', akzent: '#7dd3fc', schrift: '#ffffff' },
  { id: 'glut', titel: 'Glut', grund: '#2a0f0f', akzent: '#fb923c', schrift: '#ffffff' },
  { id: 'rein', titel: 'Rein', grund: '#f4f6fb', akzent: '#0284c7', schrift: '#111827' },
  /*
   * Die Globals 2026 - Kristall und Gold, mit Epics Banner im Hintergrund.
   * Sie stand nur in vorlagen.js und fehlte hier, war also nicht zu waehlen.
   */
  { id: 'globals', titel: 'FNCS Globals', grund: '#05070f', akzent: '#f5c542', schrift: '#ffd766' },
  // Die Aussehen der anderen Reihen - Farben der Cup-Kacheln, siehe vorlagen.js.
  { id: 'performance', titel: 'Performance Cup', grund: '#14a89b', akzent: '#2ad1cc', schrift: '#ffffff' },
  { id: 'division', titel: 'Division Cup', grund: '#7b2cbf', akzent: '#6ee05a', schrift: '#ffffff' },
  { id: 'cash', titel: 'Cash Cup', grund: '#5b4fe0', akzent: '#e879f9', schrift: '#ffffff' },
  { id: 'reload', titel: 'Reload', grund: '#0b1740', akzent: '#e0b455', schrift: '#ffffff' },
];

/** Drei Plaetze: Duo-Cups nutzen zwei, Trio-Cups alle drei. */
type Drei = [string, string, string];

/*
 * Die Anordnungen fuers Trio-Banner - muss zu public/overlay/banner.html passen.
 *
 * "basis" ist die Hoehe der ganzen Karte bei Massstab 1. Der Betreiber (1.10.2026)
 * wollte die Fotos "viel schmaler, also weniger hoch", damit die Zahlen groesser
 * wirken als die Bilder, und alle Anordnungen waehlbar, mit einer Vorschau, wie
 * jede aussieht. "drei" ist die abgestimmte Fassung der Dreiteilung.
 */
const TRIO_LAYOUTS = [
  { id: 'drei', titel: 'Dreigeteilt', was: 'Drei Fotos nebeneinander, Gesicht mittig, die Zahlen groß darunter.', basis: 282 },
  { id: 'mitte', titel: 'Mitte groß', was: 'Das mittlere Foto größer, die beiden äußeren schmaler.', basis: 302 },
  { id: 'reihe', titel: 'Reihe', was: 'Drei Fotos links, Namen und Zahlen rechts daneben.', basis: 150 },
  { id: 'kompakt', titel: 'Kompakt', was: 'Kleine Fotos und eine knappe Zeile — für wenig Platz.', basis: 96 },
] as const;


/**
 * Der Name, wie er im Banner stehen soll - derselbe Vorschlag wie dort.
 *
 * Eckige Klammern und ein vorangestelltes Teamkuerzel fallen weg, aus
 * "[EWC2026] TWIS Cold" wird "Cold". Ueberschreiben kann man ihn trotzdem;
 * dieser Vorschlag steht nur im Feld, bis jemand etwas anderes hineinschreibt.
 */
function namensVorschlag(roh: string): string {
  let n = String(roh || '').replace(/\[[^\]]*\]/g, ' ').trim();
  n = n.replace(/^[A-Z0-9]{2,5}\s+(?=\S)/, '').trim();
  return n || String(roh || '');
}

/**
 * Die kleine Vorschau einer Trio-Anordnung.
 *
 * Eine verkleinerte Fassung des echten Banners in einem Rahmen - mit den
 * gewaehlten drei Spielern, solange sie da sind. Davor zeigt sie ein klar
 * als Beispiel gekennzeichnetes Trio (probe=1 in banner.html), damit man die
 * Anordnungen vergleichen kann, bevor ein Team feststeht. Das Beispiel traegt
 * erfundene Zahlen; es steht nur in der Vorschau, nie in einer Adresse, die
 * jemand kopiert.
 */
function LayoutVorschau({
  basis, layout, vorlage, klar, abstand, ids, namen, fotos, eventId, windowId,
}: {
  basis: string; layout: string; vorlage: string; klar: number; abstand: number;
  ids: string[]; namen: Drei; fotos: Drei; eventId: string; windowId: string;
}) {
  const echt = ids.length >= 3;
  const adresse = useMemo(() => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (echt) {
      if (eventId) p.set('event', eventId);
      if (windowId) p.set('window', windowId);
      p.set('id', ids.join(','));
      if (namen[0]) p.set('n1', namen[0]);
      if (namen[1]) p.set('n2', namen[1]);
      if (namen[2]) p.set('n3', namen[2]);
      if (fotos[0]) p.set('f1', fotos[0]);
      if (fotos[1]) p.set('f2', fotos[1]);
      if (fotos[2]) p.set('f3', fotos[2]);
    } else {
      p.set('probe', '1');
    }
    p.set('layout', layout);
    p.set('vorlage', vorlage);
    p.set('klar', String(klar));
    if (abstand !== 18) p.set('abstand', String(abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis, echt, eventId, windowId, ids, namen, fotos, layout, vorlage, klar, abstand]);
  // Das Banner ist bis etwa 800 Punkte breit; die Kachel zeigt es auf 0,42.
  const hoehe = Math.round(((TRIO_LAYOUTS.find((x) => x.id === layout)?.basis ?? 282) + 24) * 0.42);
  return (
    <span className="relative block w-full overflow-hidden bg-zinc-950"
      style={{ height: Math.max(hoehe, 56) }}>
      {basis && (
        <iframe src={adresse} title={layout} tabIndex={-1} loading="lazy"
          className="pointer-events-none absolute left-0 top-0 border-0"
          style={{ width: 820, height: 380, transform: 'scale(0.42)', transformOrigin: 'top left' }} />
      )}
      {!echt && (
        <span className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-300">
          <T>Beispiel</T>
        </span>
      )}
    </span>
  );
}

/** Farben zur Schnellwahl fuer den Akzent - wer eine andere will, nimmt den Farbwaehler daneben. */
const AKZENTE = ['#38bdf8', '#4ade80', '#facc15', '#fb923c', '#ff3b6b', '#e879f9', '#a78bfa', '#ffffff'];

/**
 * Die kleine Vorschau einer Form (Karte oder Leiste).
 *
 * Das echte Banner mit klar gekennzeichneten Beispieldaten (probe=1),
 * verkleinert - so sieht man den Unterschied, bevor ein Spieler feststeht.
 * Die Zahlen sind erfunden und stehen nie in einer Adresse zum Kopieren.
 */
function FormVorschau({
  basis, form, vorlage, klar, akzent,
}: {
  basis: string; form: 'karte' | 'leiste'; vorlage: string; klar: number; akzent: string;
}) {
  const adresse = useMemo(() => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    p.set('probe', '1');
    if (form === 'leiste') p.set('form', 'leiste');
    p.set('vorlage', vorlage);
    p.set('klar', String(klar));
    if (akzent) p.set('akzent', akzent.replace('#', ''));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis, form, vorlage, klar, akzent]);
  return (
    <span className="relative block h-16 w-full overflow-hidden bg-zinc-950">
      {basis && (
        <iframe src={adresse} title={form} tabIndex={-1} loading="lazy"
          className="pointer-events-none absolute left-0 top-0 border-0"
          style={{ width: 820, height: 200, transform: 'scale(0.4)', transformOrigin: 'top left' }} />
      )}
      <span className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-300">
        <T>Beispiel</T>
      </span>
    </span>
  );
}

/**
 * Ein Schritt im Baukasten - immer nur einer offen.
 *
 * Der Betreiber wollte es ausdruecklich nacheinander: "dass man nicht auf
 * alles auf einmal anfangen kann, sondern Schritt fuer Schritt." Vorher
 * standen alle drei Bloecke gleichzeitig offen da, und man konnte beim
 * Aussehen anfangen, bevor ueberhaupt ein Cup gewaehlt war.
 *
 * Ein geschlossener Schritt zeigt in einer Zeile, was darin steht - so
 * bleibt sichtbar, was man schon entschieden hat, ohne dass alles offen ist.
 * Gesperrt ist, was ohne den vorigen Schritt keinen Sinn ergibt; er laesst
 * sich dann nicht anklicken.
 */
function Schritt({
  nummer, titel, offen, gesperrt = false, zusammenfassung = '',
  onOeffnen, weiter, weiterText = 'Weiter', children,
}: {
  nummer: number; titel: string; offen: boolean; gesperrt?: boolean;
  zusammenfassung?: string; onOeffnen: () => void; weiter?: () => void;
  weiterText?: string; children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-zinc-900/40 p-4 transition
      ${offen ? 'border-sky-500/40' : 'border-zinc-800'}
      ${gesperrt ? 'opacity-50' : ''}`}>
      <button type="button"
        onClick={() => { if (!gesperrt) onOeffnen(); }}
        disabled={gesperrt}
        className={`flex w-full items-center gap-2 text-left text-sm
                    font-semibold text-slate-100
                    ${gesperrt ? 'cursor-not-allowed' : ''}`}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center
                          rounded-full text-[11px] font-bold text-white
                          ${offen ? 'bg-sky-500' : 'bg-zinc-700'}`}>
          {nummer}
        </span>
        <T>{titel}</T>
        {!offen && zusammenfassung && (
          <span className="ml-2 min-w-0 truncate text-[11px] font-normal
                           text-slate-500">
            {zusammenfassung}
          </span>
        )}
        <span className="ml-auto text-slate-600">{offen ? '−' : '+'}</span>
      </button>

      {offen && <div className="mt-3">{children}</div>}

      {offen && weiter && (
        <button type="button" onClick={weiter}
          className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold
                     text-white transition hover:bg-sky-400">
          <T>{weiterText}</T>
        </button>
      )}
    </section>
  );
}

/**
 * Der Baukasten des Spieler-Banners.
 *
 * Zweimal dieselbe Seite: unter /overlays/teamkarte mit Cup-Auswahl, unter
 * /globals/overlays/teamkarte fest auf die Global Championship gestellt.
 */
export default function TeamkarteBaukasten({ globals = false }: {
  globals?: boolean;
} = {}) {
  const t = useT();

  /*
   * Welcher Schritt gerade offen ist.
   *
   * Beginnt bei eins. Weiter geht es ueber den Knopf am Ende eines Schritts
   * oder durch Anklicken einer Ueberschrift.
   */
  const [schritt, setSchritt] = useState(1);

  const [region, setRegion] = useState(globals ? GLOBALS_REGION : 'EU');
  // In der Globals-Fassung steht der Spieltag schon beim Aufschlagen fest.
  const [cup, setCup] = useState(globals
    ? `${GLOBALS_EVENT}|${GLOBALS_TAGE[0].windowId}` : '');
  /** Der lesbare Name des gewaehlten Spieltags (Cup, Runde, Region) - fuer die eingeklappte Ueberschrift. */
  const [cupName, setCupName] = useState('');
  /** Was die Cup-Auswahl ueber den Spieltag weiss; daraus folgt, ob Solo, Duo oder Trio gespielt wird. */
  const [cupInfo, setCupInfo] = useState<CupInfo | null>(null);
  /** Die Wiedergabeliste eines gespeicherten Overlays - solange die Auswahl nichts Neues gesagt hat. */
  const [playlistGemerkt, setPlaylistGemerkt] = useState('');
  /*
   * Karte oder Leiste.
   *
   * Die Karte zeigt ein bis drei Spieler mit Foto; die Leiste (Betreiber,
   * 19.10.2026, nach einem Vorbild) genau einen, schraeg geschnitten. Sie gilt
   * nur bei einem Spieler - bei Duos und Trios bleibt es die Karte.
   */
  const [form, setForm] = useState<'karte' | 'leiste'>('karte');
  /** Die Akzentfarbe (#rrggbb) - leer heisst: die der Vorlage. */
  const [akzent, setAkzent] = useState('');
  /*
   * Ob die gespeicherte Adresse an diesem Spieltag haengt.
   *
   * Der Betreiber (19.10.2026): eine gespeicherte Adresse soll gueltig
   * bleiben, wenn der Cup nicht mehr laeuft - und dann die letzten Zahlen
   * zeigen. Das tut sie, wenn der Spieltag fest drinsteht. Wer dagegen jede
   * Woche dasselbe Overlay fuer den laufenden Cup will, stellt auf "folgt dem
   * laufenden Cup der Region" um.
   */
  const [fest, setFest] = useState(!globals);

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFuer, setTeamFuer] = useState('');
  const [teamLaedt, setTeamLaedt] = useState(false);
  const [teamSuche, setTeamSuche] = useState('');
  const [duo, setDuo] = useState<Spieler[]>([]);
  /** Ergebnis der Turniersuche - null heisst "es wurde nicht gesucht". */
  const [funde, setFunde] = useState<Team[] | null>(null);
  /*
   * Treffer aus dem Verzeichnis - zum Vormerken vor dem Cup.
   *
   * Vor dem Start ist die Bestenliste leer, und "Nicht dabei" war die
   * einzige Antwort. Der Betreiber: "stell dir vor, in einer Stunde ist ein
   * Cup und ich will einen Spieler hinzufuegen ... dann hab ich alles schon
   * mal, und wenn die Stats kommen, laedt es einfach." Also stehen die
   * Konten aus dem Verzeichnis hier zur Wahl; das Banner zeigt sie mit
   * Nullen und fuellt sich, sobald sie in der Liste auftauchen.
   */
  const [verzeichnisFunde, setVerzeichnisFunde] = useState<Array<{
    epicId: string; anzeige: string; bild: string | null;
  }>>([]);
  const [suchLaeuft, setSuchLaeuft] = useState(false);
  /** Zaehlt die Suchlaeufe - siehe sucheImTurnier(). */
  const laufRef = useRef(0);
  const [suchInfo, setSuchInfo] = useState('');
  const [namen, setNamen] = useState<Drei>(['', '', '']);
  /*
   * Das Foto je Platz - leer heisst: das gepflegte Foto des Kontos.
   *
   * Der Betreiber zu den Globals-Overlays: "bei den Globals Overlay fuer
   * 1v1/2v2 usw soll man auch Profile Picture auswaehlen koennen." Bisher
   * kam das Bild allein aus der Fotozuordnung; wer keines hatte, blieb ohne,
   * und ein anderes liess sich nicht nehmen. Jetzt steht hier, was gelten
   * soll: leer fuer das gepflegte Foto, "-" fuer keines, sonst der Pfad
   * eines Fotos aus dem Archiv.
   */
  const [fotos, setFotos] = useState<Drei>(['', '', '']);
  /*
   * Zwei oder drei Spieler je Team - und bei dreien die Anordnung.
   *
   * Ab 2027 sind Trios der Hauptmodus. Duo-Cups bleiben bei zwei; die Wahl
   * folgt der Teamgroesse, sobald ein Team gewaehlt ist, und laesst sich
   * daneben von Hand umstellen.
   */
  const [teamGroesse, setTeamGroesse] = useState<1 | 2 | 3>(2);
  const [layout, setLayout] = useState<string>('drei');

  /*
   * Gespeicherte Vorlagen.
   *
   * Bewusst ohne Spieltag: eine Vorlage gehoert einem Duo und einem Aussehen.
   * Die Adresse traegt statt Cup und Fenster nur die Region, und das Banner
   * sucht sich den laufenden - oder zuletzt gespielten - Spieltag selbst. So
   * steht dieselbe Adresse in OBS auch beim naechsten Turnier noch richtig.
   */
  interface Gespeichert {
    id: string; titel: string; region: string;
    ids: string[]; namen: string[];
    /** Das gewaehlte Foto je Platz - siehe FotoWahl. */
    fotos?: string[];
    vorlage: string; klar: number; hoehe: number; abstand?: number;
    /** Spieler je Team (2 oder 3) und bei Trios die Anordnung. */
    spieler?: number; layout?: string;
    /** Karte oder Leiste, Akzentfarbe, und ob der Spieltag fest dran haengt (siehe fest). */
    form?: string; akzent?: string; fest?: boolean;
    event?: string; window?: string; cupName?: string; playlist?: string;
    /** Mehrere Duos und ihr Wechseltakt - seit die Adresse fest ist. */
    weitere?: Array<{
      ids: string[]; namen: Drei;
      fotos?: Drei; etikett: string;
    }>;
    wechsel?: number;
  }
  /*
   * Vorlagen liegen dort, wo auch Standings und Qual line liegen.
   *
   * Vorher gingen sie ueber /api/konto in das CompHub-Konto. Wer sich - wie
   * der Betreiber - ueber den alten VIP-Weg anmeldet, hat kein solches
   * Konto: das Speichern lief ins Leere, und nach dem Neuladen war die
   * Vorlage weg. Er hat genau das bemerkt: "unter My Standings ist es
   * gespeichert, aber unter Teamcards nicht."
   *
   * /api/overlay-config kennt beide Anmeldewege und ist derselbe Ort, an dem
   * die anderen Overlays liegen. Damit ist es an einer Stelle richtig statt
   * an zweien verschieden.
   */
  const {
    liste: vorlagenRoh, speichern: vorlageSpeichern, entfernen: vorlageEntfernen,
  } = useOverlays('teamkarte');

  const gespeicherte: Gespeichert[] = useMemo(
    () => (vorlagenRoh ?? []).map((o) => {
      const c = o.config as Partial<Gespeichert>;
      return {
        id: o.id,
        titel: o.name,
        region: c.region ?? 'EU',
        ids: c.ids ?? [],
        namen: c.namen ?? [],
        fotos: c.fotos,
        spieler: c.spieler,
        layout: c.layout,
        vorlage: c.vorlage ?? 'nacht',
        klar: c.klar ?? 92,
        hoehe: c.hoehe ?? 108,
        abstand: c.abstand,
        weitere: c.weitere,
        wechsel: c.wechsel,
        form: c.form, akzent: c.akzent, fest: c.fest,
        event: c.event, window: c.window, cupName: c.cupName, playlist: c.playlist,
      };
    }),
    [vorlagenRoh]);

  const [neuerTitel, setNeuerTitel] = useState('');
  /** Ob das Overlay in diesem Durchgang schon gespeichert wurde. */
  const [abgelegt, setAbgelegt] = useState<string | null>(null);
  /**
   * Die Kennung des Overlays, das gerade bearbeitet wird.
   *
   * Kommt aus der Adresse, wenn man in der Liste auf "Bearbeiten" geht. Ist
   * sie gesetzt, aendert "Speichern" dieses Overlay, statt ein zweites daneben
   * anzulegen.
   */
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [ausAdresseGeladen, setAusAdresseGeladen] = useState(false);

  // In der Globals-Fassung ist das Aussehen des Turniers die Voreinstellung.
  const [vorlage, setVorlage] = useState(globals ? 'globals' : 'nacht');
  const [klar, setKlar] = useState(92);
  const [hoehe, setHoehe] = useState(108);
  /**
   * Wie weit die Fotos vom Text abruecken.
   *
   * Vorher sass der Text fest an den Bildern. Der Betreiber wollte "die
   * Overlays noch ein bisschen auseinanderziehen koennen, dass die Bilder
   * noch ein bisschen weiter weg sind von den Infos, wenn man das will".
   * Achtzehn Punkte sind der bisherige Stand und bleiben die Voreinstellung.
   */
  const [abstand, setAbstand] = useState(18);

  /**
   * Weitere Duos in derselben Quelle.
   *
   * Der Betreiber wollte "mehrere Overlays in ein Overlay packen" - eine
   * Browser-Quelle in OBS, die der Reihe nach durch mehrere Teams wechselt,
   * mit einem Uebergang statt eines harten Schnitts. Das oben gewaehlte Duo
   * ist immer das erste; was hier dazukommt, folgt danach.
   */
  const [weitere, setWeitere] = useState<Array<{
    ids: string[]; namen: Drei;
    /** Das gewaehlte Foto je Platz - siehe FotoWahl. */
    fotos?: Drei;
    etikett: string;
  }>>([]);
  /** Sekunden je Duo. */
  const [wechsel, setWechsel] = useState(8);

  /*
   * Die Bestenliste als zweites Overlay.
   *
   * Vier Farben und ein Bereich - mehr nicht. Der Betreiber wollte es
   * ausdruecklich knapp: "aber auch einfach nicht allzu viele Infos, sonst
   * simpel." Die Voreinstellungen sind die des Overlays selbst, damit ein
   * unangetasteter Regler nichts in die Adresse schreibt.
   */
  const BL_STANDARD = { bg: '#12101c', bg2: '#1c1830', text: '#ffffff', accent: '#38bdf8' };
  const [blFarben, setBlFarben] = useState({ ...BL_STANDARD });
  const [blVon, setBlVon] = useState(1);
  const [blBis, setBlBis] = useState(10);
  const [kopiert, setKopiert] = useState('');

  const [eventId, windowId] = useMemo(() => cup.split('|'), [cup]);

  /*
   * Wie viele Spieler ein Team in diesem Cup hat, und was daraus folgt.
   *
   * Ein Solo-Cup zeigt nur Solo, ein Duo-Cup Duo oder Solo, ein Trio-Cup Trio,
   * Duo oder Solo (Betreiber, 19.10.2026). Wer weniger Spieler zeigt als das
   * Team hat, zeigt trotzdem die Werte des Teams - das steht dann als "Team
   * stats" im Banner.
   */
  const cupGroesse = teamGroesseVon(cupInfo?.playlist ?? playlistGemerkt, windowId);
  const teamHinweis = teamGroesse < cupGroesse;
  /** Die Leiste zeigt genau einen Spieler. */
  const leiste = form === 'leiste' && teamGroesse === 1;
  const vorlageAkzent = VORLAGEN.find((v) => v.id === vorlage)?.akzent ?? '#38bdf8';

  /*
   * Ein gespeichertes Overlay zum Bearbeiten holen.
   *
   * Einmal, sobald die Liste da ist. Danach nicht mehr - sonst spraengen die
   * Regler bei jeder Aenderung auf den gespeicherten Stand zurueck.
   */
  useEffect(() => {
    if (ausAdresseGeladen || !vorlagenRoh) return;
    const wunsch = new URLSearchParams(window.location.search).get('id');
    if (!wunsch) { setAusAdresseGeladen(true); return; }
    const o = gespeicherte.find((x) => x.id === wunsch);
    if (o) {
      setBearbeiteId(o.id);
      setNeuerTitel(o.titel);
      setRegion(o.region);
      setDuo(o.ids.map((id, i) => ({ id, name: o.namen[i] ?? '' })));
      setNamen([o.namen[0] ?? '', o.namen[1] ?? '', o.namen[2] ?? '']);
      setFotos([o.fotos?.[0] ?? '', o.fotos?.[1] ?? '', o.fotos?.[2] ?? '']);
      setTeamGroesse(o.spieler === 1 || o.spieler === 2 || o.spieler === 3
        ? o.spieler : o.ids.length >= 3 ? 3 : o.ids.length === 1 ? 1 : 2);
      setForm(o.form === 'leiste' ? 'leiste' : 'karte');
      setAkzent(o.akzent ?? '');
      setFest(o.fest === true && Boolean(o.event && o.window));
      if (o.event && o.window) {
        setCup(`${o.event}|${o.window}`);
        setCupName(o.cupName ?? '');
        setPlaylistGemerkt(o.playlist ?? '');
      }
      if (o.layout && TRIO_LAYOUTS.some((l) => l.id === o.layout)) setLayout(o.layout);
      setVorlage(o.vorlage);
      setKlar(o.klar);
      setHoehe(o.hoehe);
      if (o.abstand !== undefined) setAbstand(o.abstand);
      if (Array.isArray(o.weitere)) setWeitere(o.weitere);
      if (typeof o.wechsel === 'number') setWechsel(o.wechsel);
      setSchritt(4);
    }
    setAusAdresseGeladen(true);
  }, [vorlagenRoh, gespeicherte, ausAdresseGeladen]);

  /* -------------------------------------------------------- Spieler */

  const ladeTeams = useCallback(async () => {
    if (!eventId || !windowId) return;
    setTeamLaedt(true);
    try {
      const r = await fetch(`/api/cup-roster?event=${encodeURIComponent(eventId)}`
        + `&window=${encodeURIComponent(windowId)}&limit=200`);
      const d = await r.json();
      setTeams(r.ok ? (d.teams ?? []) : []);
      setTeamFuer(cup);
    } catch { setTeams([]); }
    finally { setTeamLaedt(false); }
  }, [eventId, windowId, cup]);

  /*
   * Die geladene Mannschaftsliste gilt nur fuer den Cup, zu dem sie geholt
   * wurde. Beim Wechsel gilt sie damit von selbst als nicht geladen - ohne
   * einen Effekt, der hinterherraeumt und dabei eine Kette von Neuzeichnungen
   * anstoesst.
   */
  const geladen = useMemo(() => (teamFuer === cup ? teams : []), [teamFuer, cup, teams]);

  const treffer = useMemo(() => {
    if (funde) return funde.slice(0, 12);
    const q = teamSuche.trim().toLowerCase();
    if (!q) return geladen.slice(0, 12);
    return geladen.filter((tm) => tm.spieler.some((s) => s.name.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [funde, geladen, teamSuche]);

  /*
   * Einen Spieler im ganzen Turnier suchen - nicht nur in der Spitze.
   *
   * Zwei Wege zugleich, weil keiner allein reicht:
   *
   *   1. Ueber das gepflegte Verzeichnis. Wer im Spiel "big tryonа" heisst, im
   *      Player Center aber als "Vico" gefuehrt wird, ist sonst nicht zu
   *      finden - man kennt ihn ja unter dem gepflegten Namen. Erst werden die
   *      Konten zu diesem Namen geholt, dann wird gefragt, ob eines davon
   *      diesen Spieltag gespielt hat. Nur dann taucht er auf.
   *   2. Ueber die freie Textsuche in der Bestenliste, fuer alle, die im
   *      Verzeichnis nicht stehen.
   *
   * Beide Wege gehen durch die ganze Bestenliste, nicht nur durch die ersten
   * hundert Plaetze - Epic laesst keine Direktsuche zu, also wird Seite fuer
   * Seite gesucht. Das dauert ein paar Sekunden und steht deshalb hinter einem
   * Knopf statt hinter jedem Tastendruck.
   */
  const sucheImTurnier = useCallback(async () => {
    const q = teamSuche.trim();
    if (q.length < 2 || !eventId || !windowId) return;
    /*
     * Welcher Durchgang das ist.
     *
     * Getippt wird schneller, als die Bestenliste antwortet. Ohne diese Zahl
     * ueberschriebe die Antwort auf "pet" die auf "peterbot", und im Feld
     * staende ein Ergebnis, das nicht zur Eingabe passt.
     */
    const meiner = laufRef.current + 1;
    laufRef.current = meiner;
    setSuchLaeuft(true);
    setSuchInfo('');
    setFunde(null);
    const grund = `/api/cup-leaderboard?event=${encodeURIComponent(eventId)}`
      + `&window=${encodeURIComponent(windowId)}`;
    try {
      // 1. Konten zum gepflegten Namen.
      let ids: string[] = [];
      let ausVerzeichnis: Array<{ epicId: string; anzeige: string; bild: string | null }> = [];
      try {
        const k = await (await fetch(
          `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)).json();
        ausVerzeichnis = (k?.spieler ?? [])
          .filter((x: { epicId?: string }) => x.epicId)
          .slice(0, 25)
          .map((x: { epicId: string; anzeige?: string; bild?: string | null }) => ({
            epicId: x.epicId, anzeige: x.anzeige ?? '', bild: x.bild ?? null,
          }));
        ids = ausVerzeichnis.map((x) => x.epicId);
      } catch { /* ohne Verzeichnis bleibt die Textsuche */ }

      /*
       * Erst ueber die Konten, den Text nur, wenn das Verzeichnis nichts kennt.
       *
       * Beides zugleich lief bisher immer durch die ganze Bestenliste, der
       * Textweg sogar mit Namensaufloesung fuer jede Seite - bei grossen Cups
       * eine halbe Minute. Der Betreiber (19.10.2026): "das Suchen dauert
       * extrem lange". Die Konten brauchen keine Namen und sind nach wenigen
       * Sekunden durch; den Text braucht nur, wer im Verzeichnis fehlt.
       */
      let gefunden: Array<{ rank: number; players?: Spieler[] }> = [];
      if (ids.length) {
        const r = await fetch(`${grund}&ids=${encodeURIComponent(ids.join(','))}`).then((x) => x.json());
        gefunden = r.entries ?? [];
      } else {
        const r = await fetch(`${grund}&q=${encodeURIComponent(q)}`).then((x) => x.json());
        gefunden = r.entries ?? [];
      }
      if (laufRef.current !== meiner) return;

      /*
       * Fehlt Epic der Name (die Namensabfrage wird gedrosselt), steht dort die
       * halbe Kennung; dann gilt der gepflegte Name aus dem Verzeichnis.
       */
      const verz = new Map(ausVerzeichnis.map((x) => [x.epicId.toLowerCase(), x.anzeige]));
      const mitName = (p: Spieler): Spieler => {
        const gepflegt = verz.get(p.id.toLowerCase());
        return gepflegt && p.name === p.id.slice(0, 8) ? { ...p, name: gepflegt } : p;
      };

      // Doppelte zusammenlegen: derselbe Platz ist dasselbe Team.
      const nachPlatz = new Map<number, Team>();
      for (const e of gefunden) {
        if (!nachPlatz.has(e.rank)) {
          nachPlatz.set(e.rank, { rank: e.rank, spieler: (e.players ?? []).map(mitName) });
        }
      }
      if (laufRef.current !== meiner) return;
      const liste = [...nachPlatz.values()].sort((a, b) => a.rank - b.rank);
      setFunde(liste);
      setVerzeichnisFunde(liste.length ? [] : ausVerzeichnis.slice(0, 8));
      setSuchInfo(liste.length
        ? ''
        : ausVerzeichnis.length
          ? t('Noch nicht in der Liste. Aus dem Verzeichnis vormerken — die Werte kommen, sobald er spielt.')
          : t('Nicht dabei — dieser Spieler steht in diesem Spieltag nicht in der Liste.'));
    } catch (e) {
      if (laufRef.current === meiner) setSuchInfo((e as Error).message);
    } finally {
      if (laufRef.current === meiner) setSuchLaeuft(false);
    }
  }, [teamSuche, eventId, windowId, t]);

  /*
   * Beim Tippen suchen, nicht auf Knopfdruck.
   *
   * Der Betreiber: "ich soll nicht immer auf search druecken muessen, sondern
   * das soll direkt kommen." Eine kurze Pause bleibt trotzdem stehen - die
   * Suche geht durch die ganze Bestenliste, und bei jedem Tastendruck loszu-
   * laufen hiesse, acht Abfragen fuer ein Wort.
   */
  useEffect(() => {
    if (teamSuche.trim().length < 2 || !eventId || !windowId) return undefined;
    const stift = window.setTimeout(() => { void sucheImTurnier(); }, 350);
    return () => window.clearTimeout(stift);
  }, [teamSuche, eventId, windowId, sucheImTurnier]);

  /** Die Hoehe, bei der eine Form mit dieser Spielerzahl gut aussieht. */
  const standardHoehe = (g: 1 | 2 | 3, f: 'karte' | 'leiste', l: string) =>
    (f === 'leiste' ? 86 : g === 3 ? (TRIO_LAYOUTS.find((x) => x.id === l)?.basis ?? 282) : 108);

  /** Wechselt zwischen einem, zwei und drei Spielern und stellt die Hoehe auf das Mass der Form. */
  const stelleTeamGroesse = (g: 1 | 2 | 3, l: string = layout) => {
    if (g === teamGroesse) return;
    // Die Leiste zeigt nur einen Spieler.
    const f = g === 1 ? form : 'karte';
    if (f !== form) setForm(f);
    setTeamGroesse(g);
    setHoehe(standardHoehe(g, f, l));
    // Wer weniger Plaetze hat, hat auch weniger Namen und Fotos.
    setDuo((alt) => alt.slice(0, g));
    setNamen((alt) => [alt[0], g > 1 ? alt[1] : '', g > 2 ? alt[2] : ''] as Drei);
    setFotos((alt) => [alt[0], g > 1 ? alt[1] : '', g > 2 ? alt[2] : ''] as Drei);
  };

  const waehleForm = (f: 'karte' | 'leiste') => {
    if (f === form) return;
    setForm(f);
    setHoehe(standardHoehe(teamGroesse, f, layout));
  };

  const waehleLayout = (l: string) => {
    setLayout(l);
    setHoehe(TRIO_LAYOUTS.find((x) => x.id === l)?.basis ?? 282);
  };

  /**
   * Den Spieltag uebernehmen, den die Cup-Auswahl meldet.
   *
   * Beim ersten Mal gilt die Teamgroesse des Cups (Trio-Cup: Trio); wer schon
   * gewaehlt hat, behaelt sie, solange sie in den Cup passt.
   */
  const waehleCup = (event: string, window_: string, titel: string, info?: CupInfo) => {
    if (!event || !window_) { setCup(''); setCupName(''); setCupInfo(null); return; }
    const erstes = !cup;
    setCup(`${event}|${window_}`);
    setCupName(titel);
    setCupInfo(info ?? null);
    if (info?.region) setRegion(info.region);
    const g = teamGroesseVon(info?.playlist, window_);
    if (erstes || teamGroesse > g) stelleTeamGroesse(g);
  };

  const waehleTeam = (tm: Team) => {
    // Ein ganzes Team: so viele Spieler, wie es hat - hoechstens so viele, wie der Cup zulaesst.
    const g = Math.max(1, Math.min(3, tm.spieler.length, cupGroesse)) as 1 | 2 | 3;
    const gewaehlt = tm.spieler.slice(0, g);
    setDuo(gewaehlt);
    setNamen([
      namensVorschlag(gewaehlt[0]?.name ?? ''),
      namensVorschlag(gewaehlt[1]?.name ?? ''),
      namensVorschlag(gewaehlt[2]?.name ?? ''),
    ]);
    setFotos(['', '', '']);
    stelleTeamGroesse(g);
  };

  /**
   * Einen einzelnen Spieler eines Teams dazunehmen.
   *
   * Der erste freie Platz; sind alle belegt, ersetzt er den letzten. Wer weniger
   * Spieler zeigt als das Team hat, waehlt so seine Leute aus - die Werte
   * bleiben die des Teams (das Banner findet das Team ueber jeden der Spieler).
   */
  const nimmSpieler = (neu: Spieler) => {
    if (duo.some((x) => x.id === neu.id)) return;
    const platz = teamGroesse;
    const stelle = duo.length < platz ? duo.length : platz - 1;
    setDuo((alt) => (alt.length < platz ? [...alt, neu] : [...alt.slice(0, platz - 1), neu]));
    setNamen((alt) => {
      const kopie: Drei = [alt[0] ?? '', alt[1] ?? '', alt[2] ?? ''];
      kopie[stelle] = namensVorschlag(neu.name);
      return kopie;
    });
    setFotos((alt) => {
      const kopie: Drei = [alt[0] ?? '', alt[1] ?? '', alt[2] ?? ''];
      kopie[stelle] = '';
      return kopie;
    });
  };

  /**
   * Einen Spieler aus dem Verzeichnis vormerken.
   *
   * Das Banner zeigt ihn ab jetzt mit "noch nicht in der Liste"
   * und fuellt die Werte, sobald Epic ihn fuehrt.
   */
  const vormerken = (p: { epicId: string; anzeige: string; bild: string | null }) => {
    nimmSpieler({ id: p.epicId, name: p.anzeige, img: p.bild });
    setTeamSuche('');
    setVerzeichnisFunde([]);
    setSuchInfo('');
  };

  /* ---------------------------------------------------------- Adresse */

  /*
   * Die eigene Adresse - erst nach dem ersten Zeichnen.
   *
   * Vorher stand hier
   *
   *     const basis = typeof window !== 'undefined' ? window.location.origin : '';
   *
   * und damit rechnete der Server mit "" und der Browser sofort mit
   * "http://localhost:3000". Die Vorschau bekam auf beiden Seiten eine
   * andere Adresse, und React meldete beim Uebernehmen einen Unterschied,
   * den es nicht mehr ausbessert ("some attributes ... didn't match").
   *
   * Die Adresse muss vollstaendig sein - sie wird nach OBS kopiert, und
   * dort hilft kein Pfad ohne Server. Also wird sie nachgereicht: der erste
   * Zeichenvorgang im Browser sieht dasselbe wie der Server, gleich danach
   * steht sie.
   */
  const [basis, setBasis] = useState('');
  useEffect(() => { setBasis(window.location.origin); }, []);

  /**
   * Die Adresse fuer OBS.
   *
   * "mit Region" heisst: kein fester Spieltag, das Banner sucht ihn sich. Genau
   * so werden Vorlagen gespeichert - eine Adresse, die naechste Woche noch
   * stimmt. Fuer einen bestimmten vergangenen Spieltag steht daneben die
   * feste Fassung.
   */
  const baueUrl = useCallback((mitRegion: boolean, w: {
    ids: string[]; namen: string[]; vorlage: string; klar: number; hoehe: number;
    abstand?: number;
    region: string; eventId?: string; windowId?: string;
  }) => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (mitRegion) p.set('auto', w.region);
    else {
      if (w.eventId) p.set('event', w.eventId);
      if (w.windowId) p.set('window', w.windowId);
    }
    if (w.ids.length) p.set('id', w.ids.join(','));
    if (w.namen[0]) p.set('n1', w.namen[0]);
    if (w.namen[1]) p.set('n2', w.namen[1]);
    p.set('vorlage', w.vorlage);
    p.set('klar', String(w.klar));
    p.set('hoehe', String(w.hoehe));
    if (w.abstand !== undefined) p.set('abstand', String(w.abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis]);

  const bannerUrl = useMemo(() => {
    const trio = teamGroesse === 3;
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (eventId) p.set('event', eventId);
    if (windowId) p.set('window', windowId);
    const ids = duo.map((s) => s.id).filter(Boolean);
    /*
     * Ein Duo geht ueber "id", mehrere ueber "teams".
     *
     * Getrennt gehalten, damit eine bestehende Adresse in OBS weiter gilt:
     * wer nur ein Duo zeigt, bekommt genau dieselbe Adresse wie bisher.
     */
    if (!leiste && weitere.length && ids.length) {
      /*
       * Das Duo von oben steht nur einmal in der Reihe.
       *
       * Die Liste "mehrere Duos" traegt das gerade bearbeitete als ersten
       * Eintrag mit ("von oben"). Wurde es zusaetzlich vorangestellt, kam es
       * zweimal hintereinander ins Bild - genau das hat der Betreiber
       * gesehen: "dann tut es das Team zweimal hintereinander anzeigen."
       */
      const schluessel = ids.join(',').toLowerCase();
      const ohneDoppel = weitere.filter(
        (w) => w.ids.join(',').toLowerCase() !== schluessel);
      const alle = [{ ids, namen, fotos }, ...ohneDoppel];
      p.set('teams', alle.map((w) => w.ids.join(',')).join(';'));
      p.set('namen', alle.map((w) => `${w.namen[0] ?? ''},${w.namen[1] ?? ''}${trio ? `,${w.namen[2] ?? ''}` : ''}`).join(';'));
      // Dieselbe Reihenfolge wie die Namen - siehe banner.html.
      const gewaehlt = alle.map((w) => {
        const f = (w as { fotos?: string[] }).fotos ?? [];
        return `${f[0] ?? ''},${f[1] ?? ''}${trio ? `,${f[2] ?? ''}` : ''}`;
      });
      if (gewaehlt.some((x) => x.replace(/,/g, '') !== '')) p.set('fotos', gewaehlt.join(';'));
      p.set('wechsel', String(wechsel));
    } else {
      if (ids.length) p.set('id', ids.join(','));
      if (namen[0]) p.set('n1', namen[0]);
      if (namen[1]) p.set('n2', namen[1]);
      if (trio && namen[2]) p.set('n3', namen[2]);
    }
    // Das gewaehlte Foto je Platz - leer heisst: das gepflegte nehmen.
    if (fotos[0]) p.set('f1', fotos[0]);
    if (fotos[1]) p.set('f2', fotos[1]);
    if (trio && fotos[2]) p.set('f3', fotos[2]);
    if (trio) p.set('layout', layout);
    if (leiste) p.set('form', 'leiste');
    if (akzent) p.set('akzent', akzent.replace('#', ''));
    // Ein einzelner Spieler aus einem Team-Cup: die Werte sind die des Teams.
    if (teamHinweis) p.set('team', '1');
    p.set('vorlage', vorlage);
    p.set('klar', String(klar));
    p.set('hoehe', String(hoehe));
    if (abstand !== 18) p.set('abstand', String(abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis, eventId, windowId, duo, namen, fotos, vorlage, klar, hoehe, abstand,
    weitere, wechsel, teamGroesse, layout, leiste, akzent, teamHinweis]);

  /*
   * Die Adresse, die abgelegt wird.
   *
   * Dieselbe wie oben, nur ohne festen Spieltag: "auto" mit der Region, damit
   * sie naechste Woche noch stimmt. Sie steht in der gespeicherten
   * Einstellung; die Adresse in OBS traegt nur die Kennung und bleibt
   * gleich, was auch immer hier umgestellt wird.
   */
  const adresseFuerAblage = useMemo(() => {
    const u = new URL(bannerUrl, 'https://x');
    // Fest: der Spieltag bleibt in der Adresse - sie zeigt auch nach dem Cup seine letzten Zahlen.
    if (!(fest && eventId && windowId)) {
      u.searchParams.delete('event');
      u.searchParams.delete('window');
      u.searchParams.set('auto', region);
    }
    return basis ? `${basis}${u.pathname}?${u.searchParams.toString()}` : '';
  }, [bannerUrl, basis, region, fest, eventId, windowId]);

  /**
   * Die Adresse fuer OBS: nach dem Speichern nur noch die Kennung.
   *
   * Der Betreiber: "es soll eine Adresse geben; wenn ich es editiere, wird
   * das automatisch auch updated." Vor dem Speichern steht die vollstaendige
   * Adresse da - sie taugt zum Ausprobieren, aendert sich aber mit jedem
   * Regler.
   */
  const obsAdresse = bearbeiteId ? overlayAdresse('teamkarte', bearbeiteId) : bannerUrl;

  /*
   * Die Vorschau zeigt Beispieldaten, solange noch kein Spieler gewaehlt ist -
   * so sieht man Form, Vorlage und Farben schon vorher. Die Adresse zum
   * Kopieren bekommt das nie.
   */
  const vorschauUrl = useMemo(
    () => (duo.length ? bannerUrl
      : `${bannerUrl}${bannerUrl.includes('?') ? '&' : '?'}probe=1&spieler=${teamGroesse}`),
    [bannerUrl, duo.length, teamGroesse]);

  const bestenlisteUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (eventId) p.set('event', eventId);
    if (windowId) p.set('window', windowId);
    // "from"/"to" heissen die Felder im Overlay - "top" kannte es nie.
    p.set('from', String(blVon));
    p.set('to', String(blBis));
    // Nur was abweicht, landet in der Adresse; sonst gilt die Vorlage.
    for (const [k, v] of Object.entries(blFarben)) {
      if (v !== (BL_STANDARD as Record<string, string>)[k]) p.set(k, v);
    }
    return `${basis}/overlay/leaderboard.html?${p.toString()}`;
    // BL_STANDARD ist eine Konstante und aendert sich nie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, eventId, windowId, blVon, blBis, blFarben]);

  async function kopiere(was: string) {
    try {
      await navigator.clipboard.writeText(was);
      setKopiert(t('Adresse kopiert — in OBS als Browser-Quelle einfügen.'));
      setTimeout(() => setKopiert(''), 4000);
    } catch {
      setKopiert(t('Bitte den Text markieren und mit Strg+C kopieren.'));
    }
  }

  /* ------------------------------------------------------------ Bild */

  /*
   * Warteschleife und VIP-Sperre stehen jetzt im gemeinsamen Geruest.
   *
   * Sie standen hier eigenstaendig - Wort fuer Wort dasselbe wie auf den
   * beiden anderen Overlay-Seiten. Beim naechsten Satz wuerde eine der drei
   * Fassungen abweichen, ohne dass es jemandem auffaellt. OverlayGeruest
   * entscheidet das an einer Stelle und zeichnet dazu die Leiste links.
   */

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  const inhalt = (
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          {globals ? <T>Spieler-Banner</T> : <T>Team card</T>}
        </h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          {globals
            ? <T>Ein Banner für deinen Stream — Spieltag wählen, Duo wählen,
              fertig. Das Aussehen ist das der Global Championship.</T>
            : <T>Ein Banner für deinen Stream — Cup wählen, Duo wählen, fertig.</T>}
        </p>

        {/* Die Vorschau bekommt die breitere Spalte.
            Vorher waren es 380 Punkte, und das Banner musste darin waagerecht
            gescrollt werden - man sah nie das ganze Bild. Links bleibt trotzdem
            genug: die Cupliste braucht keine 700 Punkte. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(560px,44%)]">
          <div className="space-y-4">

            <Schritt nummer={1} titel="Cup und Spieltag"
              offen={schritt === 1}
              onOeffnen={() => setSchritt(1)}
              zusammenfassung={cup ? (cupName || windowId) : ''}
              weiter={cup ? () => setSchritt(2) : undefined}>
              {globals ? (
                /*
                 * Kein Cup zur Wahl - nur die Spieltage des Turniers.
                 * "Bei Overlay gibt es keine Funktion, verschiedene Cups zu
                 * benutzen, sondern nur die Globals Cups."
                 */
                <GlobalsTagWahl fenster={cup.split('|')[1] ?? ''}
                  onTag={(w) => setCup(`${GLOBALS_EVENT}|${w}`)} />
              ) : (
                /*
                 * Dieselbe Auswahl wie bei Leaderboard und Qual line: nur
                 * laufende Cups, standardmaessig nur FNCS, Cash und
                 * Performance, mit der Runde in der Zeile.
                 */
                <CupWahl event={eventId ?? ''} window={windowId ?? ''} onWahl={waehleCup} />
              )}
            </Schritt>

            <Schritt nummer={2} titel={teamGroesse === 3 ? 'Trio' : teamGroesse === 2 ? 'Duo' : 'Spieler'}
              offen={schritt === 2}
              gesperrt={!cup}
              onOeffnen={() => setSchritt(2)}
              zusammenfassung={duo.length
                ? duo.map((p) => p.name).join(' · ') : ''}
              weiter={duo.length ? () => setSchritt(3) : undefined}>
              <>
                  {/* Solo, Duo oder Trio - nur, was der Cup hergibt. */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-500"><T>Spieler je Team</T></span>
                    {([1, 2, 3] as const).filter((g) => g <= cupGroesse).map((g) => (
                      <button key={g} type="button" onClick={() => stelleTeamGroesse(g)}
                        className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                          teamGroesse === g
                            ? 'border-sky-500 bg-sky-500/10 text-slate-100'
                            : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                        {g === 1 ? <T>Solo</T> : g === 2 ? <T>Duo</T> : <T>Trio</T>}
                      </button>
                    ))}
                  </div>
                  {teamHinweis && (
                    <p className="mb-2 rounded-lg border border-sky-900/60 bg-sky-950/20 px-3 py-2
                                  text-[11px] leading-relaxed text-sky-200/80">
                      <T>In diesem Cup spielen Teams. Das Banner zeigt die Werte des
                      Teams und trägt dafür die Zeile „Team stats“.</T>
                    </p>
                  )}
                  {/* Die Suche steht sofort da und laeuft beim Tippen los -
                      nach einer kurzen Pause, damit nicht jeder Tastendruck
                      die ganze Bestenliste abfragt. */}
                  <div className="mb-2 flex gap-2">
                    <input value={teamSuche}
                      onChange={(e) => setTeamSuche(e.target.value)}
                      placeholder={t('Spieler suchen — auch Platz 12 000')}
                      className={feld} autoFocus />
                    {suchLaeuft && (
                      <span className="shrink-0 self-center text-[11px] text-slate-500">
                        <T>sucht …</T>
                      </span>
                    )}
                  </div>
                  {suchInfo && (
                    <p className="mb-2 text-[11px] text-amber-300">{suchInfo}</p>
                  )}
                  {/* Die Spitze der Liste zum Durchsehen - eine Bequemlichkeit
                      neben der Suche, kein Weg, den man gehen muss. */}
                  {teamFuer !== cup && !funde && (
                    <button onClick={() => void ladeTeams()} disabled={!cup || teamLaedt}
                      className="mb-2 text-[11px] text-slate-500 underline
                                 hover:text-slate-300 disabled:opacity-40">
                      {teamLaedt ? <T>lädt …</T> : <T>oder die Besten dieses Spieltags zeigen</T>}
                    </button>
                  )}

                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {treffer.map((tm) => (tm.spieler.length > teamGroesse ? (
                      /* Weniger Spieler gezeigt als das Team hat: jeder einzeln waehlbar. */
                      <div key={tm.rank}
                        className="flex flex-wrap items-center gap-1.5 rounded-lg border
                                   border-zinc-800 px-3 py-2 text-[13px] text-slate-300">
                        <span className="w-8 shrink-0 text-[11px] text-slate-500">
                          #{tm.rank}
                        </span>
                        {tm.spieler.map((s) => (
                          <button key={s.id} type="button" onClick={() => nimmSpieler(s)}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1
                                        text-[12px] transition hover:border-sky-700 ${
                              duo.some((x) => x.id === s.id)
                                ? 'border-sky-500 bg-sky-500/10 text-slate-100'
                                : 'border-zinc-800'}`}>
                            {s.img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.img} alt="" className="h-5 w-5 shrink-0 rounded object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }} />
                            ) : null}
                            {namensVorschlag(s.name)}
                          </button>
                        ))}
                        {funde && (
                          <span className="ml-auto shrink-0 text-[10px] text-slate-600">
                            <T>gespielt</T>
                          </span>
                        )}
                      </div>
                    ) : (
                      <button key={tm.rank} onClick={() => waehleTeam(tm)}
                        className="flex w-full items-center gap-2 rounded-lg border
                                   border-zinc-800 px-3 py-2 text-left text-[13px]
                                   text-slate-300 transition hover:border-sky-700">
                        <span className="w-8 shrink-0 text-[11px] text-slate-500">
                          #{tm.rank}
                        </span>
                        {/*
                          * Kein Foto heisst kein Bild - kein Ersatzbild.
                          *
                          * Vorher stand hier eine graue Silhouette. Die sagt
                          * nichts, ausser dass etwas fehlt, und sie sah aus
                          * wie ein Spieler ohne Gesicht. Der Betreiber dazu:
                          * "Leute, die kein Profilbild haben, musst Du auch
                          * nicht mit Profilbild hochladen ... das soll nicht
                          * gezeigt werden."
                          */}
                        {tm.spieler.slice(0, 3).map((s) => (s.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={s.id} src={s.img} alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }} />
                        ) : null))}
                        <span className="min-w-0 flex-1 truncate">
                          {tm.spieler.map((s) => namensVorschlag(s.name)).join(' + ')}
                        </span>
                        {funde && (
                          <span className="shrink-0 text-[10px] text-slate-600">
                            <T>gespielt</T>
                          </span>
                        )}
                      </button>
                    )))}
                    {/* Aus dem Verzeichnis, wenn die Bestenliste nichts hat -
                        vor dem Cup, oder weil er noch nicht gespielt hat. */}
                    {!treffer.length && verzeichnisFunde.map((p) => (
                      <button key={p.epicId} type="button" onClick={() => vormerken(p)}
                        className="flex w-full items-center gap-2 rounded-lg border
                                   border-dashed border-zinc-700 px-3 py-2 text-left
                                   text-[13px] text-slate-300 transition
                                   hover:border-sky-700">
                        {p.bild ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.bild} alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover" />
                        ) : <span className="h-6 w-6 shrink-0 rounded bg-zinc-800" />}
                        <span className="min-w-0 flex-1 truncate">{p.anzeige}</span>
                        <span className="shrink-0 text-[10px] text-sky-400">
                          <T>vormerken</T>
                        </span>
                      </button>
                    ))}
                    {!treffer.length && !verzeichnisFunde.length && !suchLaeuft && (
                      <p className="py-3 text-center text-xs text-slate-600">
                        <T>Namen eintippen und suchen.</T>
                      </p>
                    )}
                  </div>
              </>

              {/* Die beiden Namen, wie sie im Banner stehen sollen. */}
              {duo.length > 0 && (
                <div className={`mt-3 grid gap-2 ${duo.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {duo.map((s, i) => (
                    <div key={s.id} className="text-[11px] text-slate-500">
                      <label className="block">
                        <T>Angezeigter Name</T>
                        <span className="ml-1 text-slate-600">({s.name})</span>
                        <input value={namen[i] ?? ''}
                          onChange={(e) => setNamen((a) => {
                            const k: Drei = [a[0], a[1], a[2]];
                            k[i] = e.target.value;
                            return k;
                          })}
                          className={`${feld} mt-1`} />
                      </label>
                      {/* Welches Foto dazu gehoert - siehe FotoWahl. */}
                      <FotoWahl wert={fotos[i] ?? ''} eigenes={s.img}
                        onWahl={(w) => setFotos((a) => {
                          const k: Drei = [a[0], a[1], a[2]];
                          k[i] = w;
                          return k;
                        })} />
                    </div>
                  ))}
                </div>
              )}

              {/*
                * Mehrere Duos in einer einzigen OBS-Quelle.
                *
                * Steht bewusst hier unter dem Duo und nicht als eigener
                * Schritt: es ist dieselbe Entscheidung, nur mehrfach. Das
                * oben gewaehlte Duo ist immer das erste, was hier dazukommt
                * folgt danach - und das Banner wechselt im eingestellten
                * Takt mit einem Uebergang durch.
                */}
              {duo.length > 0 && !leiste && (
                <div className="mt-4 rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      <T>Mehrere Duos in einem Overlay</T>
                    </span>
                    <button
                      onClick={() => setWeitere((a) => (a.some((w) =>
                        w.ids.join() === duo.map((x) => x.id).join())
                        ? a
                        : [...a, {
                          ids: duo.map((x) => x.id),
                          namen: [namen[0] ?? '', namen[1] ?? '', namen[2] ?? ''] as Drei,
                          // Das gewaehlte Foto gehoert zum Duo, nicht zum Platz.
                          fotos: [fotos[0] ?? '', fotos[1] ?? '', fotos[2] ?? ''] as Drei,
                          etikett: duo.map((x, i) => (namen[i] || namensVorschlag(x.name)))
                            .join(' + '),
                        }]))}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium
                                 text-white transition hover:bg-sky-400">
                      <T>Dieses Duo dazunehmen</T>
                    </button>
                  </div>

                  {weitere.length === 0 ? (
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      <T>Noch keins dazugenommen — das Banner zeigt nur das Duo von oben.
                      Nimm weitere dazu, dann wechselt es der Reihe nach durch.</T>
                    </p>
                  ) : (
                    <>
                      <ul className="mb-2 space-y-1">
                        <li className="flex items-center gap-2 rounded border
                                       border-zinc-800 px-2 py-1 text-[11px] text-slate-400">
                          <span className="w-5 text-slate-600">1.</span>
                          <span className="min-w-0 flex-1 truncate text-slate-300">
                            {duo.map((x, i) => (namen[i] || namensVorschlag(x.name))).join(' + ')}
                          </span>
                          <span className="text-slate-600"><T>von oben</T></span>
                        </li>
                        {weitere.map((w, i) => (
                          <li key={w.ids.join()}
                            className="flex items-center gap-2 rounded border
                                       border-zinc-800 px-2 py-1 text-[11px]">
                            <span className="w-5 text-slate-600">{i + 2}.</span>
                            <span className="min-w-0 flex-1 truncate text-slate-300">
                              {w.etikett}
                            </span>
                            <button
                              onClick={() => setWeitere((a) => a.filter((_, j) => j !== i))}
                              className="text-slate-500 transition hover:text-red-400">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label className="block text-[11px] text-slate-500">
                        <T>Sekunden je Duo</T>
                        <span className="ml-2 tabular-nums text-slate-300">{wechsel} s</span>
                        <input type="range" min={3} max={30} value={wechsel}
                          onChange={(e) => setWechsel(Number(e.target.value))}
                          className="mt-1 w-full accent-sky-500" />
                      </label>
                    </>
                  )}
                </div>
              )}
            </Schritt>

            <Schritt nummer={3} titel="Aussehen"
              offen={schritt === 3}
              gesperrt={!cup}
              onOeffnen={() => setSchritt(3)}
              weiter={() => setSchritt(4)}>
              {/*
                * Karte oder Leiste - nur bei einem Spieler.
                *
                * Die Leiste (Betreiber, 19.10.2026, nach einem Vorbild) zeigt
                * genau einen Spieler; bei Duo und Trio gibt es nur die Karte.
                */}
              {teamGroesse === 1 && (
                <div className="mb-5">
                  <p className="mb-2 text-xs font-semibold text-slate-300"><T>Form</T></p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      { id: 'karte', titel: 'Team-Karte', was: 'Foto, Name und Zahlen in einer Karte — wie beim Duo.' },
                      { id: 'leiste', titel: 'Leiste', was: 'Ein Spieler, schräg geschnitten, mit TOP, PTS und GAMES in der Akzentfarbe.' },
                    ] as const).map((f) => (
                      <button key={f.id} type="button" onClick={() => waehleForm(f.id)}
                        className={`overflow-hidden rounded-lg border text-left transition ${
                          form === f.id ? 'border-sky-500 bg-sky-500/5' : 'border-zinc-800 hover:border-zinc-600'}`}>
                        <FormVorschau basis={basis} form={f.id} vorlage={vorlage}
                          klar={klar} akzent={akzent} />
                        <span className="block px-3 pb-2 pt-1.5">
                          <span className="block text-[13px] font-medium text-slate-200">{t(f.titel)}</span>
                          <span className="block text-[11px] leading-snug text-slate-500">{t(f.was)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {teamGroesse === 3 && (
                <div className="mb-5">
                  <p className="mb-2 text-xs font-semibold text-slate-300"><T>Anordnung</T></p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {TRIO_LAYOUTS.map((l) => (
                      <button key={l.id} type="button" onClick={() => waehleLayout(l.id)}
                        className={`overflow-hidden rounded-lg border text-left transition ${
                          layout === l.id ? 'border-sky-500 bg-sky-500/5' : 'border-zinc-800 hover:border-zinc-600'}`}>
                        <LayoutVorschau basis={basis} layout={l.id} vorlage={vorlage}
                          klar={klar} abstand={abstand}
                          ids={duo.length >= 3 ? duo.map((x) => x.id) : []}
                          namen={namen} fotos={fotos}
                          eventId={eventId} windowId={windowId} />
                        <span className="block px-3 pb-2 pt-1.5">
                          <span className="block text-[13px] font-medium text-slate-200">{t(l.titel)}</span>
                          <span className="block text-[11px] leading-snug text-slate-500">{t(l.was)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {duo.length < 3 && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      <T>Die Vorschau zeigt Beispieldaten, bis drei Spieler gewählt sind.</T>
                    </p>
                  )}
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {VORLAGEN.map((v) => (
                  <button key={v.id} onClick={() => setVorlage(v.id)}
                    className={`overflow-hidden rounded-lg border transition ${
                      v.id === vorlage ? 'border-sky-500' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    <span className="flex h-10 items-center justify-center gap-1"
                      style={{ background: v.grund }}>
                      <span className="h-1.5 w-8 rounded"
                        style={{ background: v.schrift, opacity: .85 }} />
                      <span className="h-1.5 w-4 rounded" style={{ background: v.akzent }} />
                    </span>
                    <span className="block py-1 text-[11px] text-slate-400">{t(v.titel)}</span>
                  </button>
                ))}
              </div>

              {/*
                * Die Akzentfarbe in jeder Farbe.
                *
                * Der Betreiber (19.10.2026) zum gruenen Streifen des Vorbilds:
                * "diese gruene Farbe in jede Farbe anpassbar". Sie faerbt die
                * Beschriftungen (TOP, PTS, GAMES), den Rand der Leiste und die
                * hervorgehobene Zahl der Karte.
                */}
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] text-slate-500"><T>Akzentfarbe</T></p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => setAkzent('')}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                      !akzent ? 'border-sky-500 bg-sky-500/10 text-slate-100'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    <T>wie die Vorlage</T>
                  </button>
                  {AKZENTE.map((c) => (
                    <button key={c} type="button" aria-label={c} onClick={() => setAkzent(c)}
                      className={`h-7 w-7 rounded-full border-2 transition ${
                        akzent.toLowerCase() === c ? 'border-white' : 'border-transparent hover:border-zinc-500'}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={akzent || vorlageAkzent}
                    onChange={(e) => setAkzent(e.target.value)}
                    aria-label={t('Eigene Farbe')}
                    className="h-7 w-9 cursor-pointer rounded border border-zinc-700 bg-transparent p-0" />
                </div>
              </div>

              <label className="mb-3 block text-[11px] text-slate-500">
                <T>Wie deckend die Mitte ist</T>
                <span className="ml-2 tabular-nums text-slate-300">{klar}%</span>
                <input type="range" min={0} max={100} value={klar}
                  onChange={(e) => setKlar(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>

              <label className={`mb-3 ${leiste ? 'hidden' : 'block'} text-[11px] text-slate-500`}>
                <T>Abstand zwischen Bild und Text</T>
                <span className="ml-2 tabular-nums text-slate-300">{abstand} px</span>
                {/* Von der Voreinstellung nach oben statt in beide
                    Richtungen: bei 8 bis 64 lag der Ausgangswert 18 fast am
                    linken Anschlag, ein Schubs nach links aenderte drei
                    Punkte und sah aus, als tue der Regler nichts. Jetzt
                    zieht jede Bewegung sichtbar auseinander. */}
                <input type="range" min={18} max={96} value={abstand}
                  onChange={(e) => setAbstand(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>

              <label className="block text-[11px] text-slate-500">
                <T>Höhe</T>
                <span className="ml-2 tabular-nums text-slate-300">{hoehe} px</span>
                {/* Ab achtundvierzig statt erst ab siebzig: seit alle
                    Groessen am Massstab der Hoehe haengen, bleibt auch ein
                    flaches Banner lesbar - vorher wurde dort der Name
                    abgeschnitten, und der Regler durfte gar nicht so weit. */}
                <input type="range" min={32} max={teamGroesse === 3 ? 340 : 220} value={hoehe}
                  onChange={(e) => setHoehe(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>
            </Schritt>

            {/*
              * Schritt vier: ablegen und in OBS einbauen.
              *
              * Hier stand vorher nichts - das Speichern lag in einem Kasten
              * rechts, den ich auf Zuruf entfernt habe, und damit war es ganz
              * weg: der Betreiber drueckte "Fertig" und hatte kein Overlay.
              * Es gehoert an das Ende des Weges, zusammen mit der Adresse und
              * dem, was man damit in OBS tut.
              */}
            <Schritt nummer={4} titel="Speichern und in OBS einbauen"
              offen={schritt === 4}
              gesperrt={!cup || !duo.length}
              onOeffnen={() => setSchritt(4)}>
              {/*
                * Fest an diesem Spieltag oder dem laufenden Cup folgen.
                *
                * Fest ist die Voreinstellung: die Adresse bleibt gueltig, wenn
                * der Cup vorbei ist, und zeigt dann seine letzten Zahlen.
                */}
              {!globals && cup && (
                <div className="mb-3 space-y-1.5 text-[12px] text-slate-300">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="fest" checked={fest} onChange={() => setFest(true)}
                      className="mt-0.5 accent-sky-500" />
                    <span>
                      <T>Dieser Spieltag bleibt fest</T>
                      <span className="block text-[11px] text-slate-500">
                        <T>Die Adresse bleibt gültig, auch wenn der Cup vorbei ist — sie zeigt dann
                        die letzten Zahlen.</T>
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="fest" checked={!fest} onChange={() => setFest(false)}
                      className="mt-0.5 accent-sky-500" />
                    <span>
                      <T>Folgt dem laufenden Cup der Region</T>
                      <span className="block text-[11px] text-slate-500">
                        <T>Für ein Overlay, das du jede Woche weiter benutzt: es springt von selbst auf den
                        nächsten Spieltag.</T>
                      </span>
                    </span>
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input value={neuerTitel}
                  onChange={(e) => setNeuerTitel(e.target.value)}
                  placeholder={t('Name, zum Beispiel „Peterbot & Pxxo“')}
                  className={`${feld} min-w-0 flex-1`} />
                <button
                  onClick={async () => {
                    const titel = neuerTitel.trim()
                      || namen.filter(Boolean).join(' & ')
                      || duo.map((p) => p.name).join(' & ')
                      || t('Team card');
                    const neu = await vorlageSpeichern({
                      ...(bearbeiteId ? { id: bearbeiteId } : {}),
                      name: titel,
                      config: {
                        region,
                        ids: duo.map((p) => p.id),
                        namen: namen.filter(Boolean),
                        fotos,
                        spieler: teamGroesse, layout,
                        vorlage, klar, hoehe, abstand,
                        form, akzent, fest,
                        event: eventId, window: windowId, cupName,
                        playlist: cupInfo?.playlist ?? playlistGemerkt,
                        // Mehrere Duos und der Wechseltakt gehoeren dazu,
                        // sonst zeigt die feste Adresse nur das erste.
                        weitere, wechsel,
                        adresse: adresseFuerAblage,
                      },
                    });
                    if (neu) {
                      setAbgelegt(titel);
                      setBearbeiteId(neu);
                    }
                  }}
                  disabled={!duo.length}
                  className="shrink-0 rounded-lg bg-sky-500 px-5 py-2 text-sm
                             font-semibold text-white transition
                             hover:bg-sky-400 disabled:cursor-not-allowed
                             disabled:opacity-40">
                  {bearbeiteId ? <T>Übernehmen</T> : <T>Speichern</T>}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {fest && !globals
                  ? <T>Gespeichert werden Spieltag, Spieler und Aussehen. Die Adresse
                    bleibt gültig und zeigt nach dem Cup seine letzten Zahlen.</T>
                  : <T>Gespeichert werden Duo und Aussehen, nicht der Spieltag. Die
                    Adresse zeigt immer auf den laufenden Spieltag deiner Region,
                    also steht sie beim nächsten Turnier noch richtig.</T>}
              </p>
              {abgelegt && (
                <p className="mt-2 text-[11px] text-emerald-400">
                  <T>Gespeichert als</T> „{abgelegt}“ — <T>du findest es oben
                  unter „Deine Overlays“.</T>
                </p>
              )}

              {/* ------------------------------------------- Die Adresse */}
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-semibold text-slate-300">
                  <T>Die Adresse für OBS</T>
                </p>
                <div className="flex gap-2">
                  <input readOnly value={obsAdresse}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${feld} font-mono text-[10px]`} />
                  <button onClick={() => void kopiere(obsAdresse)}
                    className="shrink-0 rounded-lg bg-sky-500 px-4 text-sm
                               font-medium text-white transition
                               hover:bg-sky-400">
                    <T>Kopieren</T>
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {bearbeiteId
                    ? <T>Diese Adresse bleibt gleich. Was du hier änderst und
                        übernimmst, ist im Stream nach wenigen Sekunden zu
                        sehen.</T>
                    : <T>Erst speichern — dann bekommst du eine Adresse, die
                        bei jeder späteren Änderung gleich bleibt.</T>}
                </p>
                {kopiert && (
                  <p className="mt-2 text-[11px] text-emerald-400">{kopiert}</p>
                )}

                {/*
                  * Die drei Handgriffe in OBS.
                  *
                  * Ohne Bilder, wie gewuenscht - drei Zeilen genuegen, und sie
                  * altern nicht mit jeder neuen OBS-Fassung.
                  */}
                <ol className="mt-4 space-y-1.5 text-[11px] leading-relaxed
                               text-slate-400">
                  <li>1. <T>In OBS unten bei „Quellen“ auf + drücken.</T></li>
                  <li>2. <T>„Browser“ wählen und einen Namen vergeben.</T></li>
                  <li>3. <T>Die Adresse oben in das Feld „URL“ einfügen,
                    Breite und Höhe nach Geschmack, OK.</T></li>
                </ol>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  <T>Diese Adresse bleibt gültig. Änderst du hier später etwas
                  und speicherst, ist es im Stream nach wenigen Sekunden zu
                  sehen — die Browser-Quelle musst du nicht anfassen.</T>
                </p>
              </div>

              <button
                onClick={() => { window.location.href = window.location.pathname; }}
                className="mt-5 rounded-lg border border-zinc-800 px-4 py-2
                           text-sm text-slate-300 transition
                           hover:border-sky-500 hover:text-sky-300">
                <T>Fertig</T>
              </button>
            </Schritt>
          </div>

          {/* Vorschau und Adresse bleiben beim Scrollen stehen. */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                <T>Vorschau</T>
              </h2>
              {/* Das Banner ist nur so breit wie sein Inhalt und sitzt in
                  der Vorschau mittig - so sieht man es ganz, ohne zu
                  schieben. Die Spalte klebt schon; die Vorschau selbst
                  muss es nicht. */}
              <Vorschau src={vorschauUrl} hoehe={hoehe + 16} klebt={false} />

              <div className="mt-3 flex gap-2">
                <input readOnly value={obsAdresse}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${feld} font-mono text-[10px]`} />
                <button onClick={() => void kopiere(obsAdresse)}
                  className="shrink-0 rounded-lg bg-sky-500 px-4 text-sm font-medium
                             text-white transition hover:bg-sky-400">
                  <T>Kopieren</T>
                </button>
              </div>
              {kopiert && (
                <p className="mt-2 text-[11px] text-emerald-400">{kopiert}</p>
              )}
            </section>


          </div>
        </div>
      </div>
  );

  return globals
    ? <GlobalsGeruest aktiv="/globals/overlays">{inhalt}</GlobalsGeruest>
    : <OverlayGeruest aktiv="teamkarte">{inhalt}</OverlayGeruest>;
}
