'use client';

// Eigene Seite je Cup: Spieltage oben, Eventinfos, darunter das
// Leaderboard mit Suche und aufklappbaren Team-Details.
// Bewusst schlank gehalten - keine Power Rankings, keine Match-Listen,
// keine Streams.

import { Fragment, use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TeamFlagge, { flaggenPfad } from '@/components/TeamFlagge';
import { namensSchluessel } from '@/lib/homoglyph';

import T from '@/app/components/T';
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

  /** Was es zu gewinnen gibt - aus Epics Auszahlungstabelle. */
  const [preise, setPreise] = useState<{
    vorhanden: boolean; waehrung: string | null; gesamt: number | null;
    geld: Array<{ art: string; schwelle: number; betrag: number }>;
    gegenstaende: Array<{ art: string; schwelle: number; name: string }>;
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
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
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
  const profilVon = useCallback((sp: Spieler): Profil | undefined => {
    if (sp.id && profile[sp.id]) return profile[sp.id];
    const schluessel = namensSchluessel(sp.name);
    for (const pr of Object.values(profile)) {
      if ((pr.namen ?? [pr.name ?? '']).some((n) => namensSchluessel(n) === schluessel)) {
        return pr;
      }
    }
    return undefined;
  }, [profile]);

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

  function flaggenOeffnen(e: Eintrag) {
    setFlaggenTeam(e);
    setFlaggenSuche(''); setFlaggenStand('');
    setFlaggenEntwurf(e.players.map((sp) => profilVon(sp)?.land ?? ''));
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
      if ((vorher?.land ?? '') === land) continue;
      await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sp.id || undefined, name: sp.name, land,
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
    try {
      const r = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}` +
        `&window=${encodeURIComponent(f.windowId)}&limit=${MAX_PLAETZE}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'nicht ladbar');
      setTabelle(d.entries ?? []);
      // Ohne die Zahl - die steht daneben, mit dem passenden Wort. Zweimal
      // dieselbe Groesse, einmal gerundet und einmal genau, war die
      // haeufigste Nachfrage zu dieser Seite.
      setStand(d.entries?.length
        ? `${t('Stand')} ${new Date(d.updated).toLocaleTimeString(ort)}`
        : 'Noch keine Ergebnisse');
    } catch (e) { setStand(t('Fehler') + ': ' + (e as Error).message); setTabelle([]); }
    finally { setLaedt(false); }
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

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
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
  }, [tabelle, suche, namenVon]);

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
  const soloCup = useMemo(
    () => tabelle.length > 0 && tabelle.every((e) => e.players.length === 1),
    [tabelle]);

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
              <button key={r} onClick={() => setRegion(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  region === r ? 'bg-sky-500 text-white'
                               : 'border border-zinc-800 bg-zinc-900/60 text-slate-400 hover:text-slate-200'}`}>
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
        {tage.length > 0 && (
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
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
            {/* Zwei Reiter wie beim Vorbild: was es gibt, und wie gepunktet
                wird. Sie erscheinen nur, wenn beide Seiten etwas zu zeigen
                haben - ein leerer Reiter ist ein Versprechen ohne Inhalt. */}
            {(preise.wertung?.length ?? 0) > 0 && preise.geld.length > 0 && (
              <div className="mb-3 inline-flex gap-1 rounded-lg border border-zinc-800 p-1">
                {([['preis', 'Preisgeld'], ['wertung', 'Wertung']] as const)
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
              <h2 className="text-sm font-semibold text-slate-100"><T>Preisgeld</T></h2>
              {preise.gesamt !== null && (
                <span className="text-sm font-bold text-emerald-400">
                  {preise.gesamt.toLocaleString(ort)} {preise.waehrung ?? 'USD'}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                    <T>je Region</T>
                  </span>
                </span>
              )}
              {preise.proPerson && (
                <span className="text-[11px] text-slate-500"><T>je Person</T></span>
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
                      {g.art === 'rank' ? <><T>Platz</T> {g.schwelle}</>
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
              <div className="mt-3">
                <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">
                  <T>Gegenstände</T>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {preise.gegenstaende.map((g) => (
                    <span key={`${g.art}-${g.schwelle}-${g.name}`}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5
                                 py-1 text-[11px] text-slate-300">
                      {g.art === 'percentile'
                        ? `${(g.schwelle * 100).toFixed(0)} %` : `#${g.schwelle}`}
                      <span className="ml-1.5 text-slate-500">{g.name}</span>
                    </span>
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

        {/* Leaderboard */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b
                             border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-100"><T>Leaderboard</T></h2>
            <div className="flex items-center gap-3">
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
                            <div className="flex -space-x-2">
                              {e.players.filter((p) => p.img).slice(0, 2).map((p) => (
                                <img key={p.id} src={p.img!} alt="" loading="lazy"
                                  className="h-7 w-7 rounded-full border border-zinc-800
                                             object-cover object-top" />
                              ))}
                            </div>
                            <span className="truncate text-slate-200">
                              {e.players.map(namenVon).join('  +  ')}
                            </span>
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
                                  ? 'Doppelklick: Flaggen dieses Duos setzen' : undefined}
                                className={istAdmin ? 'cursor-pointer' : undefined}>
                                {istAdmin && (
                                  <p className="mb-1.5 text-[10px] uppercase tracking-wider
                                                text-slate-600">
                                    <T>Doppelklick setzt die Flaggen</T>
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
              {suche ? `Kein Team gefunden für „${suche}“.` : stand || 'Keine Daten.'}
            </p>
          )}
        </section>

        {/* Turnierstatistik - nur unter einem Finale */}
        {statistik.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-slate-100">
                <T>Turnierstatistik</T>
              </h2>
              {/*
                * Bei einem laufenden Cup gehoert dazugesagt, dass es ein
                * Zwischenstand ist - und nach welcher Runde.
                */}
              {laeuftGerade && (
                <span className="inline-flex items-center gap-1.5 rounded-full
                                 border border-rose-500/50 bg-rose-500/10 px-2.5
                                 py-0.5 text-[10px] font-semibold uppercase
                                 tracking-wider text-rose-300">
                  <span aria-hidden
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                  {gespielteRunden > 0
                    ? t('Stand nach Runde {n}').replace('{n}', String(gespielteRunden))
                    : t('läuft gerade')}
                </span>
              )}
              <span className="text-[11px] text-slate-500">
                <T>Werte je</T> {soloCup ? t('Spieler') : 'Duo'}<T>, direkt von Epic — nur was dieses Turnier mitschickt</T>
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
                        onClick={() => { setOffeneListe(b); setListenTiefe(50); }}
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
                  {' '}{soloCup ? 'Spieler' : 'Teams'}
                </span>

                <div className="ml-auto flex items-center gap-1">
                  {([50, 100, 0] as const).map((n) => (
                    <button key={n} type="button" onClick={() => setListenTiefe(n)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        listenTiefe === n
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                          : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                      {n === 0 ? 'Alle' : `Top ${n}`}
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
                {(listenTiefe ? offeneListe.alle.slice(0, listenTiefe) : offeneListe.alle)
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
                Flaggen setzen
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

