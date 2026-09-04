'use client';

// Prognosen: das Teilnehmerfeld eines Cups in eine Reihenfolge bringen.
//
// Der Ablauf folgt dem, wie ein Finalfeld tatsaechlich entsteht: man waehlt
// einen Cup, hakt die Spieltage an, aus denen die Teilnehmer kommen, und sagt
// je Spieltag, wie weit die Qualifikation reichte ("die besten sieben").
// Daraus entsteht die Liste der Teams - und die bringt man dann von Platz 1
// abwaerts in die erwartete Reihenfolge.
//
// Alle Namen und Platzierungen stammen aus Epics Turnierdaten. Erfunden wird
// nichts: steht ein Spieltag noch aus, taucht er hier gar nicht erst auf.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kernname, namensSchluessel } from '@/lib/homoglyph';
import TeamFlagge from '@/components/TeamFlagge';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { MARKE } from '@/lib/marke';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
interface Fenster {
  status: string; begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string; istFinale: boolean;
}
interface Cup {
  id: string; titel: string; art: string;
  regionen: Record<string, Fenster[]>;
  live: boolean; vorbei: boolean;
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
  // Gemischte Schreibweise braucht gut die halbe Hoehe an Breite je Zeichen.
  // 0,92 heisst: die Zeile darf 92 Prozent der Formbreite einnehmen.
  const nachBreite = (breite * 0.92) / Math.max(zeichen * 0.52, 1);
  return Math.max(0.5, Math.min(nachHoehe, nachBreite, 2.4));
}

/**
 * Wie stark die Schrift der Vergroesserung folgt.
 *
 * Die Wurzel ist der Mittelweg zwischen "waechst voll mit" und "bleibt
 * starr": bei vierfachem Zoom steht sie doppelt so gross auf dem Schirm,
 * in Kartenmassen wird sie dabei kleiner und kann nie ueber den Rand der
 * Form hinauslaufen.
 */
function schriftFaktor(zoom: number) {
  return Math.sqrt(Math.max(1, zoom));
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

interface Prognose {
  id: string; titel: string; cupId: string; cupTitel: string;
  gruppe?: string; qualiBis?: number;
  quellen: Quelle[]; plaetze: Array<string | null>;
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

/** Aus "[EWC2026] AURA shxrk 7" wird "Shxrk". */
function kurz(name: string) {
  const k = kernname(name).slice(0, 16);
  return k ? k[0].toUpperCase() + k.slice(1) : k;
}

function tag(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export default function PrognosenSeite() {
  const uebs = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [cups, setCups] = useState<Cup[]>([]);
  const [cupSuche, setCupSuche] = useState('');
  const [cupOffen, setCupOffen] = useState(false);
  const [cupId, setCupId] = useState('');
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
  const [profile, setProfile] = useState<Record<string, Profil>>({});

  /** Kartenansicht: welches Bild, welche Formen, wer steht wo. */
  const [bilder, setBilder] = useState<Kartenbild[]>([]);
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
    bildTitel?: string; spots?: Spot[];
  }>>([]);
  const [turnierListeOffen, setTurnierListeOffen] = useState(false);
  const [karteNr, setKarteNr] = useState(0);
  const [kartenTitel, setKartenTitel] = useState('');
  const [benenntKarte, setBenenntKarte] = useState(false);

  /** Steht der Schnappschuss der gerade sichtbaren Karte? */
  const eigeneKarte = karten[karteNr]?.eigen ?? false;

  /** Was gerade gezogen wird - der Schluessel des Teams. */
  const [zieht, setZieht] = useState<string | null>(null);
  const [gespeicherte, setGespeicherte] = useState<Prognose[]>([]);
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
  const [vollbildListe, setVollbildListe] = useState(false);

  /** Ortsnamen auf der Karte - nur die Fortnite-Insel bringt beide Fassungen mit. */
  const [orteSichtbar, setOrteSichtbar] = useState(true);
  /** Die Beschriftungen ausblenden, um die reinen Flaechen zu sehen. */
  const [spielerSichtbar, setSpielerSichtbar] = useState(true);

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
      .then((d) => setCups(d.cups ?? [])).catch(() => {});
    fetch('/api/spieler-profile').then((r) => r.json())
      .then((j) => setProfile(j.profile ?? {})).catch(() => {});
    fetch('/api/prognosen').then((r) => r.json())
      .then((d) => setGespeicherte(d.prognosen ?? [])).catch(() => {});
    fetch('/api/karten-bild').then((r) => r.json())
      .then((d) => setBilder(d.karten ?? [])).catch(() => {});
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
    });
  }, []);

  const setzeAusschnitt = useCallback((z: number, ziel: Punkt) => {
    const zz = Math.max(1, Math.min(6, z));
    const mm = begrenze(zz, ziel);
    zoomRef.current = zz; mitteRef.current = mm;
    setZoom(zz); setMitte(mm);
  }, [begrenze]);

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

      const z2 = Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const sicht2 = 100 / z2;
      setzeAusschnitt(z2, { x: px + sicht2 * (0.5 - fx), y: py + sicht2 * (0.5 - fy) });
    };
    window.addEventListener('wheel', amRad, { passive: false, capture: true });
    return () => window.removeEventListener(
      'wheel', amRad, { capture: true } as EventListenerOptions);
  }, [setzeAusschnitt]);

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

  /**
   * Nur Cups, die laufen oder vorbei sind.
   *
   * Zu einem Turnier, das noch nicht begonnen hat, gibt es kein Teilnehmerfeld -
   * eine Prognose darauf waere geraten, nicht aufgestellt.
   */
  const cupListe = useMemo(() => {
    const aufbereitet = cups
      .filter((c) => c.live || c.vorbei
        || Object.values(c.regionen).flat().some((f) => f.status !== 'kommt'))
      .map((c) => {
        const alle = Object.values(c.regionen).flat();
        const termine = alle.map((f) => f.begin).sort((a, b) => a - b);
        const von = termine[0] ?? 0;
        const bis = termine[termine.length - 1] ?? 0;
        const laeuft = alle.some((f) => f.status === 'live');
        const zeit = !von ? '' : von === bis ? tag(von) : `${tag(von)}–${tag(bis)}`;
        return {
          cup: c, laeuft, bis,
          etikett: `${laeuft ? '● ' : ''}${c.titel}${zeit ? ` · ${zeit}` : ''}`,
          heu: `${c.titel} ${c.id} ${c.art} ${zeit}`.toLowerCase(),
        };
      });
    const q = cupSuche.trim().toLowerCase();
    const gefiltert = q
      ? aufbereitet.filter((x) => q.split(/\s+/).every((w) => x.heu.includes(w)))
      : aufbereitet;
    return gefiltert.sort((a, b) =>
      (a.laeuft === b.laeuft ? b.bis - a.bis : a.laeuft ? -1 : 1));
  }, [cups, cupSuche]);

  /**
   * Die Namen eines Teams, so wie sie auf der Karte stehen.
   *
   * Ein einzelnes Team in einer Form bekommt seine beiden Spieler
   * untereinander; stehen mehrere Teams in derselben Form, teilen sie sich
   * die Hoehe und jedes bekommt nur eine Zeile.
   */
  const zeilenFuer = useCallback((key: string, alleine: boolean): string[] => {
    const t = feld.find((x) => x.key === key);
    if (!t) return [];
    const namen = t.namen.map((n, k) => kurz(findeProfil(n, t.ids[k])?.anzeige || n));
    return alleine && namen.length > 1 ? namen : [namen.join(' ')];
  }, [feld, findeProfil]);

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
      + (qualiBis ? ` · ${uebs('weiter bis Platz')} ${qualiBis}` : ''),
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
        ? t.namen.map((n, k) => kurz(findeProfil(n, t.ids[k])?.anzeige || n))
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
  const gewaehlterCupText = cupListe.find((x) => x.cup.id === cupId)?.etikett
    ?? cup?.titel ?? '';

  /** Die Spieltage dieses Cups, die schon gelaufen sind oder gerade laufen. */
  const spieltage = useMemo(() => {
    if (!cup) return [] as Array<Fenster & { titel: string }>;
    return Object.entries(cup.regionen)
      .flatMap(([region, liste]) => liste.map((f) => ({ ...f, region })))
      .filter((f) => f.status !== 'kommt')
      .sort((a, b) => a.begin - b.begin)
      .map((f, i) => ({
        ...f,
        titel: `${f.istFinale ? 'Finale' : `Tag ${i + 1}`} · ${tag(f.begin)}`
          + (Object.keys(cup.regionen).length > 1 ? ` · ${f.region}` : ''),
      }));
  }, [cup]);

  function quelleAn(f: Fenster & { titel: string }) {
    setQuellen((alt) => {
      const drin = alt.find((q) => q.windowId === f.windowId && q.region === f.region);
      if (drin) return alt.filter((q) => q !== drin);
      return [...alt, {
        eventId: f.eventId, windowId: f.windowId, region: f.region,
        titel: f.titel, topN: null,
      }];
    });
  }

  function grenzeSetzen(windowId: string, region: string, wert: string) {
    const n = parseInt(wert, 10);
    setQuellen((alt) => alt.map((q) => (q.windowId === windowId && q.region === region
      ? { ...q, topN: Number.isFinite(n) && n > 0 ? n : null } : q)));
  }

  /**
   * Das Feld aus den angehakten Spieltagen zusammentragen.
   *
   * Ein Team, das an mehreren Tagen dabei war, erscheint nur einmal - erkannt
   * ueber die Epic-Konto-Ids, nicht ueber den Namen: Pros treten oft unter
   * wechselnden Schreibweisen an.
   */
  const feldHolen = useCallback(async () => {
    if (!quellen.length) { setStatus(uebs('Erst Spieltage anhaken')); return; }
    setLaedt(true); setStatus(uebs('lädt …'));
    const gefunden = new Map<string, TeamImFeld>();
    try {
      for (const q of quellen) {
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
            });
          }
        }
      }
      const liste = [...gefunden.values()].sort((a, b) => a.besterPlatz - b.besterPlatz);
      setFeld(liste);
      setPlaetze((alt) => (alt.length === liste.length
        ? alt : Array.from({ length: liste.length }, () => null)));
      setStatus(`${liste.length} Teams im Feld`);
    } catch (e) {
      setStatus(uebs('Fehler') + ': ' + (e as Error).message);
    } finally { setLaedt(false); }
  }, [quellen]);

  /** Welche Teams sind noch nicht gesetzt? */
  const offen = useMemo(
    () => feld.filter((t) => !plaetze.includes(t.key)), [feld, plaetze]);

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

  /** Die Reihenfolge aus den bisherigen Platzierungen vorschlagen. */
  function ausErgebnis() {
    setPlaetze(feld.map((t) => t.key));
    setStatus('Nach bisheriger Platzierung vorbelegt — jetzt anpassen');
  }

  const teamZu = useCallback(
    (key: string | null) => (key ? feld.find((t) => t.key === key) ?? null : null), [feld]);

  /* ==================================================== Mehrere Karten */

  useEffect(() => {
    fetch('/api/turnier-karten')
      .then((r) => r.json())
      .then((d) => setTurnierKarten(d.karten ?? []))
      .catch(() => {});
  }, []);

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
    const r = await fetch('/api/prognosen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, titel, cupId, cupTitel: cup.titel, gruppe: gruppe || undefined,
        qualiBis, quellen, plaetze, oeffentlich: true,
        // Jede Karte wandert als Kopie mit hinein - Bild, Formen und wer wo
        // steht. Ab jetzt gehoeren sie dieser Prognose.
        // Ohne das Merkzeichen "eigen" - das gilt nur in der Oberflaeche.
        karten: liste.map((k) => ({
          id: k.id, bildId: k.bildId, titel: k.titel,
          spots: k.spots, aufSpot: k.aufSpot,
        })),
      }),
    });
    if (!r.ok) { setStatus(uebs('Speichern fehlgeschlagen')); return; }
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
    setFeld([]);

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

    setStatus(uebs('Geladen — auf „Feld laden“ klicken, um die Teams zu holen'));
  }

  if (istAdmin === false) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-10 text-slate-200">
        <p className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-900/40
                      p-6 text-center text-sm text-slate-400">
          <T>Diese Seite ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1900px]">

        <div className="mb-3">
          <h1 className="text-xl font-semibold text-slate-100">Prognosen</h1>
          <p className="mt-1 text-sm text-slate-500">
            <T>Cup wählen, Spieltage anhaken, Feld laden — dann die Reihenfolge setzen.</T>
            <T>Nur laufende und vergangene Cups, denn zu einem kommenden gibt es noch kein Teilnehmerfeld.</T>
          </p>
        </div>

        {/* Reiter: alle Prognosen zu diesem Cup.
            Eine je Gruppe und Karte - "Group A · Slurpush", "Finals · Stronghold".
            Der Reiter ganz rechts legt eine weitere an. */}
        {cupId && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {gespeicherte.filter((x) => x.cupId === cupId).map((x) => {
              const aktiv = (x.gruppe ?? '') === gruppe && x.titel === titel;
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
            <button
              onClick={() => {
                setGruppe(''); setTitel('Prognose'); setQualiBis(0);
                setPlaetze((alt) => alt.map(() => null)); setAufSpot({});
                // Eine neue Prognose faengt wieder bei der Kartenauswahl an.
                setKarten([]); setKarteNr(0);
                setKartenTitel(''); setBenenntKarte(false);
                setGewaehlteForm(null); setWerkzeug(null); setRohbau([]);
              }}
              title={uebs('Eine weitere Prognose zu diesem Cup anlegen')}
              className="rounded-lg border border-dashed border-zinc-700 px-3 py-1.5
                         text-[11px] text-slate-500 transition hover:border-sky-500
                         hover:text-sky-400">
              + neu
            </button>
          </div>
        )}

        {/* Auswahl */}
        <div className="mb-3 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40
                        p-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-400">
            <T>Titel</T>
            <input value={titel} onChange={(e) => setTitel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none focus:border-sky-500" />
          </label>

          <div className="relative text-xs text-slate-400">
            Cup <span className="text-slate-600">({cupListe.length})</span>
            <input
              value={cupOffen ? cupSuche : gewaehlterCupText}
              onChange={(e) => { setCupSuche(e.target.value); setCupOffen(true); }}
              onFocus={() => { setCupSuche(''); setCupOffen(true); }}
              onBlur={() => setCupOffen(false)}
              placeholder={uebs('suchen — Name, Datum, Art')}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-sky-500" />
            {cupOffen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72
                              overflow-y-auto rounded-lg border border-zinc-700
                              bg-zinc-950 shadow-xl">
                {cupListe.length ? cupListe.map((x) => (
                  <button key={x.cup.id} type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      setCupId(x.cup.id); setQuellen([]); setFeld([]); setPlaetze([]);
                      setCupOffen(false);
                    }}
                    className={`block w-full border-b border-zinc-900 px-3 py-1.5 text-left
                                text-[11px] last:border-0 hover:bg-zinc-900 ${
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
            <T>Weiter bis Platz</T>
            <input value={qualiBis || ''} inputMode="numeric"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setQualiBis(Number.isFinite(n) && n > 0 ? n : 0);
              }}
              placeholder="z. B. 6 — beim Finale 1"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-amber-600" />
          </label>

          <label className="text-xs text-slate-400">
            <T>Gruppe oder Karte</T> <span className="text-slate-600">(<T>frei</T>)</span>
            <input value={gruppe} onChange={(e) => setGruppe(e.target.value)}
              placeholder="z. B. Group A · Slurpush"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                         text-sm text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-sky-500" />
          </label>

          <div className="flex items-end gap-2">
            <button onClick={feldHolen} disabled={!quellen.length || laedt}
              className="flex-1 rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium
                         text-white transition hover:bg-sky-400 disabled:opacity-40">
              {laedt ? uebs('lädt…') : uebs('Feld laden')}
            </button>
            <button onClick={speichern} disabled={!cup || !feld.length}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-slate-200
                         transition hover:border-sky-500 disabled:opacity-40">
              <T>Speichern</T>
            </button>
          </div>
        </div>

        {/* Spieltage */}
        {cup && (
          <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="mb-2 text-xs text-slate-400">
              Spieltage, aus denen das Feld kommt — mehrere sind erlaubt.
              Die Zahl daneben begrenzt auf die Qualifizierten
              („die besten 7“); leer heißt: alle.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {spieltage.map((f) => {
                const q = quellen.find((x) => x.windowId === f.windowId && x.region === f.region);
                return (
                  <div key={`${f.windowId}|${f.region}`}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5
                                text-xs transition ${q
                      ? 'border-sky-500 bg-sky-950/30' : 'border-zinc-800'}`}>
                    <button onClick={() => quelleAn(f)}
                      className="min-w-0 flex-1 truncate text-left text-slate-200">
                      <span className={q ? 'text-sky-400' : 'text-slate-500'}>
                        {q ? '☑' : '☐'}
                      </span>{' '}
                      {f.titel}
                      {f.status === 'live' && (
                        <span className="ml-1 text-[10px] text-rose-400">live</span>
                      )}
                    </button>
                    {q && (
                      <input value={q.topN ?? ''} inputMode="numeric"
                        onChange={(e) => grenzeSetzen(f.windowId, f.region, e.target.value)}
                        placeholder={uebs('alle')} title={uebs('Nur die besten N übernehmen')}
                        className="w-14 shrink-0 rounded border border-zinc-700 bg-zinc-950
                                   px-1.5 py-0.5 text-center text-[11px] text-slate-100
                                   outline-none placeholder:text-slate-600" />
                    )}
                  </div>
                );
              })}
              {!spieltage.length && (
                <p className="text-xs text-slate-500">
                  <T>Dieser Cup hat noch keinen gelaufenen Spieltag.</T>
                </p>
              )}
            </div>
          </div>
        )}

        {status && <p className="mb-3 text-xs text-slate-500">{status}</p>}

        {/* Reihenfolge und Feld */}
        <div className="grid gap-4
                        lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.85fr)_250px]">

          {/* Kartenansicht: dieselben Formen wie im Karteneditor, hier nur zum
              Verteilen. Wer wo landet, hilft beim Aufstellen der Reihenfolge. */}
          <div className={vollbildKarte
            ? 'fixed inset-0 z-50 flex flex-col overflow-auto bg-zinc-950 p-4'
            : 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3'}>
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
                ) : (
                  <select value={bildId} onChange={(e) => setBildId(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1
                               text-[11px] text-slate-200 outline-none focus:border-sky-500">
                    <option value="">Battle Royale</option>
                    {bilder.map((b) => (
                      <option key={b.id} value={b.id}>{b.titel}</option>
                    ))}
                  </select>
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

                {istAdmin && (
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

                {Object.keys(aufSpot).length > 0 && (
                  <button onClick={() => setAufSpot({})}
                    className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                               text-slate-300 hover:border-rose-500">
                    Karte leeren
                  </button>
                )}
                {/* Ansicht: dieselben Schalter wie im Karteneditor. */}
                {!bildId && (
                  <button onClick={() => setOrteSichtbar((v) => !v)}
                    title={uebs('Ortsnamen auf der Karte ein- und ausblenden')}
                    className={`rounded-lg border px-2 py-1 text-[11px] transition ${orteSichtbar
                      ? 'border-zinc-700 text-slate-300 hover:border-sky-500'
                      : 'border-sky-500 bg-sky-950/30 text-sky-400'}`}>
                    {orteSichtbar ? 'Orte an' : 'Orte aus'}
                  </button>
                )}
                <button onClick={() => setSpielerSichtbar((v) => !v)}
                  title={uebs('Die eingetragenen Teams ein- und ausblenden')}
                  className={`rounded-lg border px-2 py-1 text-[11px] transition ${spielerSichtbar
                    ? 'border-zinc-700 text-slate-300 hover:border-sky-500'
                    : 'border-sky-500 bg-sky-950/30 text-sky-400'}`}>
                  {spielerSichtbar ? 'Teams an' : 'Teams aus'}
                </button>
                <button onClick={() => setVollbildKarte((v) => !v)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 hover:border-sky-500">
                  {vollbildKarte ? `✕ ${uebs('Schließen')}` : `⛶ ${uebs('Vollbild')}`}
                </button>
              </div>
            </div>

            {/* Die Karten dieses Spieltags.
                Laeuft ein Tag auf zwei Karten - erst Slurpush, dann
                Stronghold -, gehoert beides zu derselben Prognose: die
                Reihenfolge der Teams gilt fuer den ganzen Tag, nur die Karte
                darunter wechselt. Jede hat ihre eigenen Formen und ihre
                eigene Zuordnung. */}
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
              className="relative mx-auto aspect-square w-full overflow-hidden
                         rounded-lg bg-zinc-950"
              style={{
                containerType: 'size',
                maxWidth: vollbildKarte ? 'min(100%, 84vh)' : 'min(100%, 70vh)',
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

            <div ref={ebene} className="absolute inset-0 origin-top-left"
              style={{
                transform:
                  `scale(${zoom}) translate(${50 / zoom - mitte.x}%, ${50 / zoom - mitte.y}%)`,
                width: '100%', height: '100%',
              }}>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={uebs('Karte')} draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                src={bildId
                  ? `/api/karten-bild?datei=1&id=${encodeURIComponent(bildId)}`
                  : `/api/fortnite-map?bild=${orteSichtbar ? 'poi' : 'leer'}`} />

              <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                className={`absolute inset-0 h-full w-full ${formenAn
                  ? '' : 'pointer-events-none'}`}>
                {spots.map((sp) => {
                  const belegt = (aufSpot[sp.id] ?? []).length;
                  const dran = formenAn && gewaehlteForm === sp.id;
                  return (
                    <polygon key={sp.id}
                      points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                      onMouseDown={formenAn && !werkzeug ? (e) => {
                        e.stopPropagation();
                        setGewaehlteForm(sp.id);
                        griff.current = { art: 'form', id: sp.id, letzt: pos(e) };
                      } : undefined}
                      style={formenAn && !werkzeug ? { cursor: 'move' } : undefined}
                      fill={belegt >= 2 ? 'rgba(220,38,38,0.34)'
                        : belegt === 1 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.14)'}
                      stroke={dran ? 'rgb(251,191,36)'
                        : belegt >= 2 ? 'rgb(248,60,60)'
                        : belegt === 1 ? 'rgba(0,0,0,0.95)'
                        : sp.farbe ?? 'rgba(0,0,0,0.75)'}
                      strokeWidth={dran ? 3.5 : 2} vectorEffect="non-scaling-stroke" />
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

              {spielerSichtbar && spots.map((sp) => {
                const keys = aufSpot[sp.id] ?? [];
                if (!keys.length) return null;
                const r = rahmen(sp.punkte);
                const anzahl = keys.length;

                return keys.map((k, i) => {
                  const texte = zeilenFuer(k, anzahl === 1);
                  if (!texte.length) return null;

                  // Das erste Team an den oberen Rand der Form, das letzte an
                  // den unteren. Mittig in ihrem Band zu sitzen liesse die
                  // Flaeche dazwischen leer und machte schlechter kenntlich,
                  // welcher Teil der Form zu wem gehoert.
                  const bandMitte = r.oben + (r.hoehe / anzahl) * (i + 0.5);
                  const hoch = texte.length * (einheitsGroesse / schriftFaktor(zoom)) * 1.15;
                  const obenY = r.oben + hoch * 0.62;
                  const untenY = r.oben + r.hoehe - hoch * 0.62;
                  const platz = untenY - obenY;
                  const y = (anzahl === 1 || platz <= 0)
                    ? bandMitte
                    : obenY + platz * (i / (anzahl - 1));

                  // Waagerecht mittig in der Spanne auf genau dieser Hoehe -
                  // bei einer schraegen Form liegt die anders als die Mitte
                  // des umschliessenden Rechtecks.
                  const spanne = spanneBei(sp.punkte, y)
                    ?? { mitte: r.links + r.breite / 2, breite: r.breite };

                  return (
                    <div key={k} draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/team', k); setZieht(k);
                      }}
                      onClick={() => vonForm(sp.id, k)}
                      title={uebs('Klick entfernt das Team von dieser Form')}
                      style={{ left: `${spanne.mitte}%`, top: `${y}%`,
                               transform: 'translate(-50%, -50%)' }}
                      className="absolute z-10 cursor-pointer text-center leading-none">
                      {texte.map((t, z) => (
                        // Geteilt durch die Vergroesserung: die Schrift bleibt
                        // auf dem Bildschirm gleich gross, waehrend die Form
                        // unter ihr waechst - so kennt man es von einer Karte.
                        <p key={z}
                          style={{ fontSize: `${einheitsGroesse / schriftFaktor(zoom)}cqw` }}
                          className="whitespace-nowrap font-semibold text-white
                                     drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                          {t}
                        </p>
                      ))}
                    </div>
                  );
                });
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
            : 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3'}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                <T>Reihenfolge</T>
                {plaetze.length
                  ? ` — ${uebs('Platz')} 1 ${uebs('bis')} ${plaetze.length}`
                  : ''}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={ausErgebnis} disabled={!feld.length}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 hover:border-sky-500 disabled:opacity-40">
                  Nach Ergebnis vorbelegen
                </button>
                <button onClick={alleRaus} disabled={!plaetze.some(Boolean)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 hover:border-rose-500 disabled:opacity-40">
                  Leeren
                </button>
                <button onClick={() => setVollbildListe((v) => !v)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px]
                             text-slate-300 hover:border-sky-500">
                  {vollbildListe ? `✕ ${uebs('Schließen')}` : `⛶ ${uebs('Vollbild')}`}
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

            {!plaetze.length ? (
              <p className="py-8 text-center text-xs text-slate-500">
                <T>Spieltage anhaken und auf „Feld laden“ klicken.</T>
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
                ? 'grid flex-1 content-start gap-2 md:grid-cols-2 2xl:grid-cols-3'
                : 'grid gap-1 sm:grid-cols-2 2xl:grid-cols-3'}>
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
                      <span className={`shrink-0 text-right text-sm font-bold tabular-nums ${
                        vollbildListe ? 'w-9' : 'w-7'} ${
                        qualiBis && i < qualiBis ? 'text-amber-300' : 'text-slate-500'}`}>
                        #{i + 1}
                      </span>
                      {t ? (
                        <>
                          <TeamFlagge groesse={vollbildListe ? 32 : 22}
                            laender={t.namen.map(
                              (n, k) => findeProfil(n, t.ids[k])?.land)} />
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            {t.namen.map((n, k) => (
                              <span key={k} className="truncate font-medium text-slate-100">
                                {kurz(findeProfil(n, t.ids[k])?.anzeige || n)}
                              </span>
                            ))}
                          </span>
                          <button onClick={() => pflegeOeffnen(t)}
                            title={uebs('Flaggen dieses Teams von Hand setzen')}
                            className="shrink-0 text-slate-600 hover:text-amber-400">✎</button>
                          <button onClick={() => raeumen(i)} title={uebs('Zurück in die Liste')}
                            className="shrink-0 text-slate-600 hover:text-rose-400">×</button>
                        </>
                      ) : (
                        <span className="text-slate-700">offen</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Was die Farbe bedeutet - im Vollbild, wo Platz dafuer ist. */}
            {vollbildListe && !!qualiBis && (
              <p className="mt-4 flex items-center justify-center gap-5 text-[11px]
                            uppercase tracking-wider text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  {qualiBis === 1 ? 'Sieger' : `Weiter — Platz 1 bis ${qualiBis}`}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
                  <T>Übrige Plätze</T>
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100"><T>Feld</T></h2>
                <span className="text-xs text-slate-500">
                  {feld.length - offen.length}/{feld.length} <T>gesetzt</T>
                </span>
              </div>
              <div className="max-h-[520px] space-y-1 overflow-y-auto">
                {offen.map((t) => (
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
                          {kurz(findeProfil(n, t.ids[k])?.anzeige || n)}
                        </span>
                      ))}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-600">
                      #{t.besterPlatz}
                    </span>
                    <span role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); pflegeOeffnen(t); }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.stopPropagation(); pflegeOeffnen(t);
                      }}
                      title={uebs('Flaggen dieses Teams von Hand setzen')}
                      className="shrink-0 cursor-pointer text-slate-600
                                 hover:text-amber-400">✎</span>
                  </button>
                ))}
                {!offen.length && feld.length > 0 && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    Alle Teams sind gesetzt.
                  </p>
                )}
                {!feld.length && (
                  <p className="py-4 text-center text-[11px] text-slate-500">
                    <T>Noch kein Feld geladen.</T>
                  </p>
                )}
              </div>
            </div>

            {gespeicherte.length > 0 && (
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
    </main>
  );
}
