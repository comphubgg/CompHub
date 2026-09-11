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
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, { useOverlays } from '../OverlayGeruest';
import { Vorschau } from '../Teile';
import { overlayCupErlaubt, overlayZeitraum } from '@/lib/overlayCups';
import { rundenName } from '@/lib/rundenName';

interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number; name: string; eventId: string; windowId: string;
}
interface Spieler { id: string; name: string; img?: string | null }
interface Team { rank: number; spieler: Spieler[] }

/** Muss zu public/overlay/vorlagen.js passen. */
const VORLAGEN = [
  { id: 'nacht', titel: 'Nacht', grund: '#0d1b3a', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'kohle', titel: 'Kohle', grund: '#0b0b0e', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'eis', titel: 'Eis', grund: '#0b3d7a', akzent: '#7dd3fc', schrift: '#ffffff' },
  { id: 'glut', titel: 'Glut', grund: '#2a0f0f', akzent: '#fb923c', schrift: '#ffffff' },
  { id: 'rein', titel: 'Rein', grund: '#f4f6fb', akzent: '#0284c7', schrift: '#111827' },
];

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];


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

export default function OverlaySeite() {
  const t = useT();

  /*
   * Welcher Schritt gerade offen ist.
   *
   * Beginnt bei eins. Weiter geht es ueber den Knopf am Ende eines Schritts
   * oder durch Anklicken einer Ueberschrift.
   */
  const [schritt, setSchritt] = useState(1);

  const [region, setRegion] = useState('EU');
  const [fenster, setFenster] = useState<Fenster[]>([]);
  const [cup, setCup] = useState('');
  const [cupSuche, setCupSuche] = useState('');
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [loginNoetig, setLoginNoetig] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFuer, setTeamFuer] = useState('');
  const [teamLaedt, setTeamLaedt] = useState(false);
  const [teamSuche, setTeamSuche] = useState('');
  const [duo, setDuo] = useState<Spieler[]>([]);
  /** Ergebnis der Turniersuche - null heisst "es wurde nicht gesucht". */
  const [funde, setFunde] = useState<Team[] | null>(null);
  const [suchLaeuft, setSuchLaeuft] = useState(false);
  /** Zaehlt die Suchlaeufe - siehe sucheImTurnier(). */
  const laufRef = useRef(0);
  const [suchInfo, setSuchInfo] = useState('');
  const [namen, setNamen] = useState<[string, string]>(['', '']);

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
    vorlage: string; klar: number; hoehe: number; abstand?: number;
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
        vorlage: c.vorlage ?? 'nacht',
        klar: c.klar ?? 92,
        hoehe: c.hoehe ?? 108,
        abstand: c.abstand,
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

  const [vorlage, setVorlage] = useState('nacht');
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
    ids: string[]; namen: [string, string]; etikett: string;
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
   * Lesbare Cupnamen.
   *
   * Epic gibt nur Kennungen heraus - "s42_reload_duos_victory". Der Katalog
   * kennt zu jedem Spielfenster den richtigen Titel; die Runde kommt aus
   * derselben Stelle wie auf den Event- und Kartenseiten, damit ueberall
   * dasselbe steht.
   */
  const [katalog, setKatalog] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((d: { cups?: Array<{
        titel?: string;
        regionen?: Record<string, Array<{ windowId: string }>>;
      }> }) => {
        const karte: Record<string, string> = {};
        for (const c of d.cups ?? []) {
          for (const liste of Object.values(c.regionen ?? {})) {
            for (const w of liste ?? []) karte[w.windowId] = c.titel ?? '';
          }
        }
        setKatalog(karte);
      })
      .catch(() => {});
  }, []);

  const lesbarerName = useCallback((w: Fenster) => {
    const cupName = (katalog[w.windowId] ?? '').split('·')[0].trim();
    const runde = rundenName(w.windowId, /Final/i.test(w.windowId), t);
    if (cupName) return [cupName, runde].filter(Boolean).join(' · ');
    // Kennt der Katalog den Spieltag nicht, wenigstens die Kennung entzerren.
    return w.name.replace(/[_]+/g, ' ').trim();
  }, [katalog, t]);

  /* ---------------------------------------------------------- Cups */

  useEffect(() => {
    let weg = false;
    void (async () => {
      setLadeFehler(null);
      try {
        const r = await fetch(`/api/cup-events?region=${region}`);
        const d = await r.json();
        if (weg) return;
        if (!r.ok) {
          setLoginNoetig(Boolean(d.needsLogin));
          setLadeFehler(d.error ?? 'Cups nicht ladbar');
          setFenster([]);
          return;
        }
        setLoginNoetig(false);
        const liste: Fenster[] = d.windows ?? [];
        setFenster(liste);
        /*
         * Vorgewaehlt wird nichts mehr.
         *
         * Frueher stand hier der erste laufende Spieltag - und das war
         * irgendeiner, oft ein Ranked-Fenster, das gar nicht zur Wahl gehoert.
         * Welcher passt, entscheidet die gefilterte Liste; sie waehlt weiter
         * unten selbst den ersten aus, sobald der Katalog da ist.
         */
        setCup('');
      } catch (e) {
        if (!weg) setLadeFehler((e as Error).message);
      }
    })();
    return () => { weg = true; };
  }, [region]);

  /*
   * Welche Spieltage zur Wahl stehen.
   *
   * Nur Vergangenes und Laufendes - zu einem Cup naechste Woche gibt es keine
   * Zahlen, und die Liste war mit hundert leeren Terminen zugestellt. Gezeigt
   * werden acht; wer weiter zurueck will, sucht oder klappt auf. Genau das
   * hatte der Betreiber verlangt: "es waer geil, wenn man alles sehen koennte.
   * Aber das ist wie viel zu unuebersichtlich."
   */
  const auswahl = useMemo(() => {
    const q = cupSuche.trim().toLowerCase();
    const { von, bis } = overlayZeitraum();

    /*
     * Nur die Cups, die der Betreiber wirklich baut - und nur die von heute
     * und morgen.
     *
     * Welche Cups das sind, steht in lib/overlayCups.ts, zusammen mit seinem
     * Wortlaut. Hier bleibt nur die Anwendung: erst die Art, dann der
     * Zeitraum, dann die Suche.
     */
    const infrage = fenster
      .filter((w) => overlayCupErlaubt(katalog[w.windowId]))
      .filter((w) => !q || lesbarerName(w).toLowerCase().includes(q)
        || w.name.toLowerCase().includes(q))
      .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1)
        || b.begin - a.begin);

    const jetzt = infrage.filter((w) => w.begin >= von && w.begin <= bis);
    /*
     * Der Weg zurueck bleibt offen: wer ein Banner fuer den gestrigen Final
     * braucht, klappt auf oder sucht. Dann faellt die Tagesgrenze weg - die
     * Art des Cups bleibt aber auch dann gefiltert.
     */
    return {
      alle: infrage,
      heute: jetzt,
      zeig: q || alleZeigen ? infrage : jetzt,
    };
  }, [fenster, cupSuche, alleZeigen, lesbarerName, katalog]);

  /*
   * Der erste passende Spieltag, sobald die Liste steht.
   *
   * Erst mit dem Katalog laesst sich sagen, welches Fenster ueberhaupt ein
   * Division-1-, Performance- oder Global-Cup ist. Deshalb faellt die Wahl
   * hier und nicht schon beim Laden der Fenster.
   */
  useEffect(() => {
    if (cup) return;
    /*
     * Kommt der Spieltag aus der Adresse?
     *
     * Die Startansicht schickt ihn mit. Ohne diesen Griff stand hier der
     * erste Cup der Liste statt des gewaehlten - der Betreiber sah in der
     * eingeklappten Ueberschrift nur "· EU" und im Banner einen Spieltag,
     * den er gar nicht ausgesucht hatte.
     */
    const p = new URLSearchParams(window.location.search);
    const wunsch = p.get('fenster');
    if (wunsch) {
      const treffer = auswahl.alle.find((f) => f.windowId === wunsch);
      if (treffer) { setCup(`${treffer.eventId}|${treffer.windowId}`); return; }
    }
    const erster = auswahl.zeig[0] ?? auswahl.alle[0];
    if (erster) setCup(`${erster.eventId}|${erster.windowId}`);
  }, [cup, auswahl]);

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
      setNamen([o.namen[0] ?? '', o.namen[1] ?? '']);
      setVorlage(o.vorlage);
      setKlar(o.klar);
      setHoehe(o.hoehe);
      if (o.abstand !== undefined) setAbstand(o.abstand);
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
      try {
        const k = await (await fetch(
          `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)).json();
        ids = (k?.spieler ?? []).map((x: { epicId: string }) => x.epicId)
          .filter(Boolean).slice(0, 25);
      } catch { /* ohne Verzeichnis bleibt die Textsuche */ }

      const [ueberId, ueberText] = await Promise.all([
        ids.length
          ? fetch(`${grund}&ids=${encodeURIComponent(ids.join(','))}`).then((r) => r.json())
          : Promise.resolve({ entries: [] }),
        fetch(`${grund}&q=${encodeURIComponent(q)}`).then((r) => r.json()),
      ]);

      // Doppelte zusammenlegen: derselbe Platz ist dasselbe Team.
      const nachPlatz = new Map<number, Team>();
      for (const e of [...(ueberId.entries ?? []), ...(ueberText.entries ?? [])]) {
        if (!nachPlatz.has(e.rank)) {
          nachPlatz.set(e.rank, { rank: e.rank, spieler: e.players ?? [] });
        }
      }
      if (laufRef.current !== meiner) return;
      const liste = [...nachPlatz.values()].sort((a, b) => a.rank - b.rank);
      setFunde(liste);
      setSuchInfo(liste.length
        ? ''
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

  const waehleTeam = (tm: Team) => {
    const zwei = tm.spieler.slice(0, 2);
    setDuo(zwei);
    setNamen([
      namensVorschlag(zwei[0]?.name ?? ''),
      namensVorschlag(zwei[1]?.name ?? ''),
    ]);
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
    if (weitere.length && ids.length) {
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
      const alle = [{ ids, namen }, ...ohneDoppel];
      p.set('teams', alle.map((w) => w.ids.join(',')).join(';'));
      p.set('namen', alle.map((w) => `${w.namen[0] ?? ''},${w.namen[1] ?? ''}`).join(';'));
      p.set('wechsel', String(wechsel));
    } else {
      if (ids.length) p.set('id', ids.join(','));
      if (namen[0]) p.set('n1', namen[0]);
      if (namen[1]) p.set('n2', namen[1]);
    }
    p.set('vorlage', vorlage);
    p.set('klar', String(klar));
    p.set('hoehe', String(hoehe));
    if (abstand !== 18) p.set('abstand', String(abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis, eventId, windowId, duo, namen, vorlage, klar, hoehe, abstand,
    weitere, wechsel]);

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

  return (
    <OverlayGeruest aktiv="teamkarte">
      <div>
        <h1 className="text-xl font-semibold text-slate-100"><T>Team card</T></h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          <T>Ein Banner für deinen Stream — Cup wählen, Duo wählen, fertig.</T>
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
              zusammenfassung={cup
                ? `${fenster.find((f) => f.windowId === cup)?.name ?? ''} · ${region}`
                : ''}
              weiter={cup ? () => setSchritt(2) : undefined}>
              <div className="mb-3 flex flex-wrap gap-1">
                {REGIONEN.map((r) => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium
                                transition ${r === region
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    {r}
                  </button>
                ))}
              </div>

              <input value={cupSuche} onChange={(e) => setCupSuche(e.target.value)}
                placeholder={t('Cup suchen — auch vergangene')}
                className={`${feld} mb-2`} />

              {ladeFehler && (
                <p className="rounded-lg border border-amber-800 bg-amber-950/30
                              px-3 py-2 text-xs text-amber-300">
                  {ladeFehler}
                  {loginNoetig && (
                    <> — <Link href="/admin" className="underline"><T>Epic-Anmeldung</T></Link></>
                  )}
                </p>
              )}

              <div className="space-y-1">
                {auswahl.zeig.map((w) => {
                  const wert = `${w.eventId}|${w.windowId}`;
                  return (
                    <button key={wert} onClick={() => setCup(wert)}
                      className={`flex w-full items-center gap-2 rounded-lg border
                                  px-3 py-2 text-left text-[13px] transition ${wert === cup
                        ? 'border-sky-500 bg-sky-500/10 text-slate-100'
                        : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                      {w.status === 'live' && (
                        <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px]
                                         font-bold uppercase text-white">live</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{lesbarerName(w)}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {new Date(w.begin).toLocaleDateString(undefined,
                          { day: '2-digit', month: '2-digit' })}
                      </span>
                    </button>
                  );
                })}
                {!auswahl.zeig.length && !ladeFehler && (
                  <p className="py-3 text-center text-xs text-slate-600">
                    {alleZeigen || cupSuche
                      ? <T>Kein Spieltag gefunden.</T>
                      : <T>Heute und morgen läuft kein passender Cup.</T>}
                  </p>
                )}
              </div>

              {!cupSuche && auswahl.alle.length > auswahl.heute.length && (
                <button onClick={() => setAlleZeigen((v) => !v)}
                  className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-300">
                  {alleZeigen ? <T>nur heute zeigen</T>
                    : <><T>frühere Spieltage zeigen</T>
                      {' '}({auswahl.alle.length - auswahl.heute.length})</>}
                </button>
              )}
            </Schritt>

            <Schritt nummer={2} titel="Duo"
              offen={schritt === 2}
              gesperrt={!cup}
              onOeffnen={() => setSchritt(2)}
              zusammenfassung={duo.length
                ? duo.map((p) => p.name).join(' · ') : ''}
              weiter={duo.length ? () => setSchritt(3) : undefined}>
              <>
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
                    {treffer.map((tm) => (
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
                        {tm.spieler.slice(0, 2).map((s) => (s.img ? (
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
                    ))}
                    {!treffer.length && !suchLaeuft && (
                      <p className="py-3 text-center text-xs text-slate-600">
                        <T>Namen eintippen und suchen.</T>
                      </p>
                    )}
                  </div>
              </>

              {/* Die beiden Namen, wie sie im Banner stehen sollen. */}
              {duo.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {duo.map((s, i) => (
                    <label key={s.id} className="text-[11px] text-slate-500">
                      <T>Angezeigter Name</T>
                      <span className="ml-1 text-slate-600">({s.name})</span>
                      <input value={namen[i] ?? ''}
                        onChange={(e) => setNamen((a) => (i === 0
                          ? [e.target.value, a[1]] : [a[0], e.target.value]))}
                        className={`${feld} mt-1`} />
                    </label>
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
              {duo.length > 0 && (
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
                          namen: [namen[0] ?? '', namen[1] ?? ''] as [string, string],
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

              <label className="mb-3 block text-[11px] text-slate-500">
                <T>Wie deckend die Mitte ist</T>
                <span className="ml-2 tabular-nums text-slate-300">{klar}%</span>
                <input type="range" min={0} max={100} value={klar}
                  onChange={(e) => setKlar(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>

              <label className="mb-3 block text-[11px] text-slate-500">
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
                <input type="range" min={48} max={220} value={hoehe}
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
                        vorlage, klar, hoehe, abstand,
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
                <T>Gespeichert werden Duo und Aussehen, nicht der Spieltag. Die
                Adresse zeigt immer auf den laufenden Spieltag deiner Region,
                also steht sie beim nächsten Turnier noch richtig.</T>
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
                  <input readOnly value={bannerUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${feld} font-mono text-[10px]`} />
                  <button onClick={() => void kopiere(bannerUrl)}
                    className="shrink-0 rounded-lg bg-sky-500 px-4 text-sm
                               font-medium text-white transition
                               hover:bg-sky-400">
                    <T>Kopieren</T>
                  </button>
                </div>
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
              <Vorschau src={bannerUrl} hoehe={hoehe + 16} klebt={false} />

              <div className="mt-3 flex gap-2">
                <input readOnly value={bannerUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${feld} font-mono text-[10px]`} />
                <button onClick={() => void kopiere(bannerUrl)}
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
    </OverlayGeruest>
  );
}
