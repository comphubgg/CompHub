'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';
import { useZugang } from '@/app/lib/zugang';
import { rahmen, spanneBei, einheitsGroesse, type Punkt, type Spot } from '@/lib/prognoseKarte';
import { flaggenPfad } from '@/components/TeamFlagge';
import { kartenSchrift, kartenName, formFarbe, hebeFormHervor } from '@/app/lib/kartenStil';
import { REGION_DER_QUALI } from '@/lib/globalsRegionen';
import KartenWasserzeichen from '@/app/components/KartenWasserzeichen';
import { useKartenVollbild } from '@/app/components/kartenVollbild';

/*
 * Eine Form der Turnierkarte.
 *
 * Dieselbe Form wie in der Prognose, nur traegt sie dort die Teams in einer
 * eigenen Zuordnung und hier bei sich selbst.
 */
type KartenSpot = Spot & { teams?: string[] };

/*
 * Die Karte der Global Championship.
 *
 * Der Betreiber wollte sie unter /globals mitsehen koennen. Angelegt wird
 * sie weiterhin unter /maps - dort zieht er die Teams selbst auf die Formen,
 * und das ist seine Arbeit: hier wird nichts verteilt, nichts vorbelegt und
 * nichts veraendert.
 *
 * Deshalb steht hier auch kein Rahmen mit dem Karten-Werkzeug darin: jene
 * Seite schreibt ihren Stand zum Server zurueck, und schon ihr Aufruf kann
 * eine Einteilung veraendern. Diese Seite zeichnet die Karte selbst, aus den
 * gespeicherten Formen - gelesen wird, geschrieben nichts.
 */

interface KartenTeam { id: string; spieler?: string[]; ids?: string[]; farbe?: string }
interface Karte {
  id: string; titel: string; bildTitel?: string; bildId?: string;
  eventId?: string; windowId?: string;
  /**
   * Heisst so, meint aber die Ortsnamen: das Karten-Werkzeug speichert hier
   * seinen Schalter "Ortsnamen". Diese Seite las es frueher als
   * "Spielernamen zeigen" - hatte der Betreiber die Ortsnamen aus, standen
   * die Formen hier leer da, obwohl alle Teams zugeordnet waren.
   */
  namenSichtbar?: boolean;
  geaendert?: number; oeffentlich?: boolean;
  teams?: KartenTeam[]; spots?: KartenSpot[];
}

/** Ein Spieler aus dem Feld der Globals (siehe /api/globals-teams). */
interface FeldSpieler { turnierId: string; anzeige: string; land: string | null }
interface FeldTeam { rang: number; region?: string | null; spieler: FeldSpieler[] }

/** Wie die Karte hier heisst - eine Karte fuer beide Tage. */
const KARTEN_NAME = 'Global Championship (2026)';

/** Die Regionen in der Reihenfolge der Seite - Europa zuerst. */
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/** Liegt der Punkt in der Flaeche? Strahlenverfahren. */
function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Den Blickpunkt so einfangen, dass der Ausschnitt am Bildrand haelt. */
function begrenze(z: number, m: Punkt): Punkt {
  if (z <= 1) return { x: 50, y: 50 };
  const sicht = 100 / z;
  return {
    x: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.x)),
    y: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.y)),
  };
}

function Flagge({ land }: { land: string | null }) {
  if (!land) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={flaggenPfad(land)} alt={land} title={land}
      className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-black/40" />
  );
}

/**
 * Eine gespeicherte Karte zeichnen - wie im Karten-Werkzeug und nach dem
 * Vorbild von eucompetitive.com (siehe app/lib/kartenStil): Rot, wo zwei
 * Teams landen, Alata mit schwarzer Kontur, beim Ueberfahren waechst die
 * Form ein wenig. Mit dem Rad wird gezoomt, gezogen wird mit der Maus - und
 * weil beides direkt am Element geschieht, ohne die Seite neu zu zeichnen,
 * laeuft es fluessig.
 */
function KartenBild({ karte, namenZu, markiert, zeige }: {
  karte: Karte;
  namenZu: (team: KartenTeam) => string[];
  /** Die Form, die die Teamliste gerade hervorhebt. */
  markiert: string | null;
  /** Hierhin gleiten (Klick in der Teamliste). */
  zeige: { id: string; mal: number } | null;
}) {
  const t = useT();
  const teams = useMemo(() => new Map((karte.teams ?? []).map((x) => [x.id, x])), [karte.teams]);
  const spots = useMemo(() => karte.spots ?? [], [karte.spots]);

  const flaeche = useRef<HTMLDivElement | null>(null);
  const ebene = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const mitteRef = useRef<Punkt>({ x: 50, y: 50 });
  const hoverRef = useRef<string | null>(null);
  const malUhr = useRef<number | null>(null);
  const bewegung = useRef<number | null>(null);
  const zug = useRef<{ sx: number; sy: number; mitte: Punkt; kasten: DOMRect } | null>(null);
  const [gezoomt, setGezoomt] = useState(false);
  /*
   * Vollbild - ein Quadrat oben rechts auf der Karte, wie bei den
   * Predictions. Der Betreiber (25.9.2026): "bei der Map auch dieses
   * Fullscreen-Zeichen haben, oben rechts ... wie bei Prediction ... nur
   * Fullscreen, das andere nicht." Die Ortsnamen folgen hier dem Schalter
   * im Karten-Werkzeug, einen eigenen gibt es deshalb nicht.
   */
  const [vollbild, setVollbild] = useState(false);
  const kartenBild = useKartenVollbild();

  // Escape schliesst das Vollbild, wie ueberall.
  useEffect(() => {
    if (!vollbild) return;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setVollbild(false); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [vollbild]);

  const zeilen = useCallback((key: string, alleine: boolean) => {
    const tm = teams.get(key);
    if (!tm) return [];
    const namen = namenZu(tm);
    return alleine && namen.length > 1 ? namen : [namen.join(' ')];
  }, [teams, namenZu]);
  const aufSpot = useMemo(
    () => Object.fromEntries(spots.map((sp) => [sp.id, sp.teams ?? []])), [spots]);
  const groesse = useMemo(
    () => einheitsGroesse(spots, aufSpot, zeilen), [spots, aufSpot, zeilen]);

  /** Den Ausschnitt direkt ans Element schreiben, einmal je Bildaufbau. */
  const male = useCallback(() => {
    if (malUhr.current !== null) return;
    malUhr.current = requestAnimationFrame(() => {
      malUhr.current = null;
      const el = ebene.current;
      if (!el) return;
      const z = zoomRef.current, m = mitteRef.current;
      el.style.transform = `scale(${z}) translate(${50 / z - m.x}%, ${50 / z - m.y}%)`;
      // Schrift, Raender und Schein rechnen gegen --z (globals.css).
      el.style.setProperty('--z', String(z));
      setGezoomt(z > 1.02);
    });
  }, []);

  const stopp = useCallback(() => {
    if (bewegung.current !== null) { cancelAnimationFrame(bewegung.current); bewegung.current = null; }
  }, []);

  /** Zu einem Ausschnitt gleiten - Massstab und Mitte gemeinsam, auf geradem Weg. */
  const gleite = useCallback((zielZ: number, zielM: Punkt) => {
    stopp();
    const z1 = Math.max(1, Math.min(6, zielZ));
    const m1 = begrenze(z1, zielM);
    const z0 = zoomRef.current, m0 = { ...mitteRef.current };
    const start = performance.now();
    const schritt = (jetzt: number) => {
      const f = Math.min(1, (jetzt - start) / 600);
      const e = f < 0.5 ? 2 * f * f : 1 - ((-2 * f + 2) ** 2) / 2;
      zoomRef.current = z0 + (z1 - z0) * e;
      mitteRef.current = { x: m0.x + (m1.x - m0.x) * e, y: m0.y + (m1.y - m0.y) * e };
      male();
      bewegung.current = f < 1 ? requestAnimationFrame(schritt) : null;
    };
    bewegung.current = requestAnimationFrame(schritt);
  }, [male, stopp]);

  /** Eine Form gross in die Mitte holen. */
  const fahreAn = useCallback((sp: KartenSpot) => {
    const r = rahmen(sp.punkte);
    gleite(Math.min(4, 45 / Math.max(r.breite, r.hoehe, 4)),
      { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 });
  }, [gleite]);

  // Klick in der Teamliste: zur Form gleiten.
  useEffect(() => {
    if (!zeige) return;
    const sp = spots.find((x) => x.id === zeige.id);
    if (sp) fahreAn(sp);
  }, [zeige, spots, fahreAn]);

  // Die Teamliste hebt eine Form hervor, wie beim Ueberfahren.
  useEffect(() => {
    hebeFormHervor(flaeche.current, hoverRef.current, markiert);
    hoverRef.current = markiert;
  }, [markiert]);

  /** Der Kartenpunkt unter dem Zeiger, in Prozent. */
  const punktBei = (e: { clientX: number; clientY: number }): Punkt | null => {
    const el = flaeche.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const z = zoomRef.current, m = mitteRef.current, sicht = 100 / z;
    return {
      x: m.x - sicht / 2 + ((e.clientX - r.left) / r.width) * sicht,
      y: m.y - sicht / 2 + ((e.clientY - r.top) / r.height) * sicht,
    };
  };
  const formBei = (e: { clientX: number; clientY: number }) => {
    const p = punktBei(e);
    return p ? [...spots].reverse().find((sp) => imPolygon(p, sp.punkte)) : undefined;
  };

  // Das Rad zoomt, und die Seite scrollt dabei nicht mit. Am Fenster und
  // nicht passiv - sonst bliebe preventDefault wirkungslos.
  useEffect(() => {
    const amRad = (e: WheelEvent) => {
      const el = flaeche.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right
        || e.clientY < r.top || e.clientY > r.bottom) return;
      e.preventDefault();
      stopp();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const z = zoomRef.current, m = mitteRef.current, sicht = 100 / z;
      const px = m.x - sicht / 2 + fx * sicht, py = m.y - sicht / 2 + fy * sicht;
      const z2 = Math.max(1, Math.min(6, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const sicht2 = 100 / z2;
      zoomRef.current = z2;
      // Der Ort unter dem Zeiger bleibt, wo er ist.
      mitteRef.current = begrenze(z2, { x: px + sicht2 * (0.5 - fx), y: py + sicht2 * (0.5 - fy) });
      male();
    };
    window.addEventListener('wheel', amRad, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', amRad, { capture: true } as EventListenerOptions);
  }, [male, stopp]);

  // Ziehen: ueber die Bildschirmstrecke seit dem Anfassen gerechnet, nicht
  // ueber den Kartenpunkt unter dem Zeiger - der haengt selbst am Ausschnitt,
  // und die Karte sprang dabei hin und her.
  useEffect(() => {
    const bewegt = (e: MouseEvent) => {
      const g = zug.current;
      if (!g) return;
      const sicht = 100 / zoomRef.current;
      mitteRef.current = begrenze(zoomRef.current, {
        x: g.mitte.x - ((e.clientX - g.sx) / g.kasten.width) * sicht,
        y: g.mitte.y - ((e.clientY - g.sy) / g.kasten.height) * sicht,
      });
      male();
    };
    const los = () => { zug.current = null; };
    window.addEventListener('mousemove', bewegt);
    window.addEventListener('mouseup', los);
    return () => {
      window.removeEventListener('mousemove', bewegt);
      window.removeEventListener('mouseup', los);
    };
  }, [male]);

  useEffect(() => () => {
    if (malUhr.current !== null) cancelAnimationFrame(malUhr.current);
    if (bewegung.current !== null) cancelAnimationFrame(bewegung.current);
  }, []);

  return (
    <div className={vollbild
      ? 'fixed inset-0 z-50 flex items-center justify-center overflow-hidden'
      : ''}
      // Im Vollbild geht das Meer bis an den Bildschirmrand (kartenVollbild).
      style={vollbild ? { background: kartenBild.meer } : undefined}>
    <div ref={flaeche}
      className={`${kartenSchrift.variable} relative mx-auto aspect-square w-full select-none
                  ${vollbild ? 'overflow-visible' : 'overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950'}
                  ${gezoomt ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        containerType: 'inline-size',
        maxWidth: vollbild ? 'min(100vw, 100vh)' : 'min(100%, calc(100vh - 7rem))',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || zoomRef.current <= 1 || !flaeche.current) return;
        stopp();
        zug.current = {
          sx: e.clientX, sy: e.clientY, mitte: { ...mitteRef.current },
          kasten: flaeche.current.getBoundingClientRect(),
        };
      }}
      onMouseMove={(e) => {
        if (zug.current) return;
        const drunter = formBei(e)?.id ?? null;
        hebeFormHervor(flaeche.current, hoverRef.current, drunter);
        hoverRef.current = drunter;
      }}
      onMouseLeave={() => {
        hebeFormHervor(flaeche.current, hoverRef.current, markiert);
        hoverRef.current = markiert;
      }}
      onDoubleClick={(e) => {
        // Doppelklick auf eine Form faehrt sie an - hier wird nur geschaut.
        const sp = formBei(e);
        if (sp) fahreAn(sp);
      }}>

      <div ref={ebene} className="absolute inset-0 origin-top-left"
        style={{ '--z': 1 } as React.CSSProperties}>
        {/*
          * Das Kartenbild. Ohne eigenes Bild ist es die Fortnite-Karte des
          * Tages - mit Ortsnamen nur, wenn der Betreiber sie im Werkzeug
          * eingeschaltet hat.
          */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={t('Karte')} draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          onLoad={kartenBild.beiLaden} style={kartenBild.bildStil(vollbild)}
          src={karte.bildId
            ? `/api/karten-bild?datei=1&id=${encodeURIComponent(karte.bildId)}`
            : `/api/fortnite-map?bild=${karte.namenSichtbar ? 'poi' : 'leer'}`} />

        {/* thecomphub.com, wie auf jeder Karte - unter den Formen. */}
        <KartenWasserzeichen />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full">
          {spots.map((sp) => {
            const n = (sp.teams ?? []).length;
            const f = formFarbe(n, n ? null : sp.farbe);
            return (
              <polygon key={sp.id} data-form={sp.id}
                className={`karten-form${f.rot ? ' ist-rot' : ''}`}
                points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                fill={f.fuellung} stroke={f.rand} vectorEffect="non-scaling-stroke" />
            );
          })}
        </svg>

        {spots.map((sp) => {
          const drauf = (sp.teams ?? []).filter((k) => teams.has(k));
          if (!drauf.length) return null;
          const r = rahmen(sp.punkte);
          const anzahl = drauf.length;
          const mitteX = r.links + r.breite / 2;
          return (
            <div key={sp.id} data-form={sp.id}
              className="karten-beschriftung pointer-events-none absolute z-10 flex flex-col
                         items-center text-center"
              style={{
                left: `${r.links}%`, top: `${r.oben}%`,
                width: `${r.breite}%`, height: `${r.hoehe}%`,
                justifyContent: anzahl === 1 ? 'center' : 'space-between',
                paddingBlock: 'calc(0.45cqw / var(--z, 1))',
              }}>
              {drauf.map((key, i) => {
                const texte = zeilen(key, anzahl === 1);
                const yProz = anzahl === 1
                  ? r.oben + r.hoehe / 2
                  : r.oben + r.hoehe * (0.1 + 0.8 * (i / (anzahl - 1)));
                const spanne = sp.form === 'rechteck' ? null : spanneBei(sp.punkte, yProz);
                const versatz = spanne && r.breite > 0
                  ? ((spanne.mitte - mitteX) / r.breite) * 100 : 0;
                return (
                  <div key={key} className="relative"
                    style={versatz ? { left: `${versatz}%` } : undefined}>
                    {texte.map((tx, z) => (
                      <p key={z} className="karten-name"
                        style={{ fontSize: `calc(${groesse}cqw / var(--z, 1))` }}>
                        {tx}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {gezoomt && (
        <button type="button" onMouseDown={(e) => e.stopPropagation()}
          onClick={() => gleite(1, { x: 50, y: 50 })}
          className="absolute bottom-2 left-2 z-30 rounded-md bg-black/75 px-2.5 py-1
                     text-[11px] text-slate-200 transition hover:bg-black/90">
          <T>Ganze Karte</T>
        </button>
      )}

      {/* Das Vollbild-Quadrat - gleich gebaut wie bei den Predictions. */}
      <button type="button" onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => setVollbild((v) => !v)}
        title={vollbild ? t('Schließen') : t('Vollbild')}
        aria-label={vollbild ? t('Schließen') : t('Vollbild')}
        className={`${vollbild ? 'fixed right-4 top-4' : 'absolute right-2 top-2'} z-30 flex h-9 w-9 items-center justify-center
                    rounded-lg border transition ${vollbild
          ? 'border-sky-500 bg-sky-500 text-white'
          : 'border-zinc-700 bg-zinc-900/90 text-slate-300 hover:border-zinc-500 hover:text-white'}`}>
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 2.5h-5v5" /><path d="M12.5 2.5h5v5" />
          <path d="M17.5 12.5v5h-5" /><path d="M2.5 12.5v5h5" />
        </svg>
      </button>
    </div>
    </div>
  );
}

export default function GlobalsMap() {
  /*
   * Anlegen und bearbeiten darf nur der Admin. Der Betreiber: "ich hoffe,
   * das geht nur fuer den Admin, dass er sie erstellen kann." Das
   * Karten-Werkzeug laesst ohnehin nur ihn bauen - hier steht fuer alle
   * anderen deshalb auch kein Knopf dorthin.
   */
  const zugang = useZugang();
  const t = useT();
  const [karten, setKarten] = useState<Karte[] | null>(null);
  const [offen, setOffen] = useState(0);
  const [fehler, setFehler] = useState('');
  /** Das Feld der Globals - fuer echte Namen, Flaggen und Regionen. */
  const [feld, setFeld] = useState<FeldTeam[]>([]);
  const [markiert, setMarkiert] = useState<string | null>(null);
  const [zeige, setZeige] = useState<{ id: string; mal: number } | null>(null);
  /** Kam die Karte aus der Ersatzkopie? Dann sagen wir es dazu. */
  const [ausErsatz, setAusErsatz] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch('/api/turnier-karten', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const alle: Karte[] = Array.isArray(j) ? j : (j?.karten ?? []);
        setAusErsatz(!!j?.ersatz);
        setKarten(alle.filter((k) => k.eventId === GLOBALS_EVENT));
      })
      .catch((e) => { if (!weg) { setFehler((e as Error).message); setKarten([]); } });
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(GLOBALS_TAGE[0].windowId)}`)
      .then((r) => r.json())
      .then((j) => { if (!weg && Array.isArray(j?.teams)) setFeld(j.teams); })
      .catch(() => { /* dann die Namen, wie die Karte sie gespeichert hat */ });
    return () => { weg = true; };
  }, []);

  /** LAN-Konto -> Spieler und Region aus dem Feld. */
  const ausFeld = useMemo(() => {
    const spieler = new Map<string, FeldSpieler>();
    const region = new Map<string, string>();
    for (const tm of feld) {
      for (const s of tm.spieler) {
        spieler.set(s.turnierId, s);
        if (tm.region) region.set(s.turnierId, tm.region);
      }
    }
    return { spieler, region };
  }, [feld]);

  /*
   * Der Name auf der Karte: der echte Name aus dem Feld (ueber das LAN-Konto
   * zum gewoehnlichen Konto, siehe lib/globalsTeams), komplett gross. Nur
   * ohne Feld der gespeicherte Name, ohne Turniermarke und Orgtag.
   */
  const namenZu = useCallback((tm: KartenTeam) =>
    (tm.spieler ?? []).map((n, k) =>
      kartenName(ausFeld.spieler.get(tm.ids?.[k] ?? '')?.anzeige || n)),
  [ausFeld]);

  const karte = karten?.[offen] ?? karten?.[0] ?? null;

  /*
   * Die Teams neben der Karte, nach Region. Der Betreiber: "Spielerliste
   * rechts oder links neben der Map." Ueberfahren hebt ihre Form hervor, ein
   * Klick faehrt sie an.
   */
  const liste = useMemo(() => {
    if (!karte) return [];
    const formVon = new Map<string, string>();
    for (const sp of karte.spots ?? []) for (const k of sp.teams ?? []) formVon.set(k, sp.id);
    const zeilen = (karte.teams ?? []).map((tm) => ({
      tm,
      namen: namenZu(tm),
      laender: (tm.ids ?? []).map((id) => ausFeld.spieler.get(id)?.land ?? null),
      // Die feste Qualifikationsregion zuerst - sie haengt weder an Epic noch
      // an der Ablage und steht deshalb auch waehrend eines Ausfalls da.
      region: (tm.ids ?? []).map((id) => REGION_DER_QUALI[id] ?? ausFeld.region.get(id)).find(Boolean) ?? '',
      form: formVon.get(tm.id) ?? null,
    }));
    return [...REGIONEN, ''].map((reg) => ({
      region: reg,
      zeilen: zeilen.filter((z) => (REGIONEN.includes(z.region) ? z.region : '') === reg),
    })).filter((g) => g.zeilen.length);
  }, [karte, namenZu, ausFeld]);

  const neuAdresse = `/maps?event=${encodeURIComponent(GLOBALS_EVENT)}`
    + `&window=${encodeURIComponent(GLOBALS_TAGE[0].windowId)}`;

  return (
    <GlobalsGeruest aktiv="/globals/map">
      {karten === null ? (
        <LadeSchirm />
      ) : fehler ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3
                      text-sm text-amber-300">{fehler}</p>
      ) : !karte ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold text-slate-100">
            <T>Noch keine Karte für die Globals</T>
          </h2>
          {zugang.admin ? (
            <>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                <T>Die Karte entsteht im Karten-Werkzeug: Formen setzen, Teams
                darauf ziehen. Hier wird nichts von selbst verteilt — wer wo
                landet, entscheidest du.</T>
              </p>
              <Link href={neuAdresse}
                className="mt-4 inline-block rounded-lg border border-amber-500/40
                           bg-amber-400/10 px-4 py-2 text-sm font-semibold
                           text-amber-200 transition hover:bg-amber-400/20">
                <T>Karte anlegen</T>
              </Link>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              <T>Sobald die Karte steht, ist sie hier zu sehen.</T>
            </p>
          )}
        </div>
      ) : (
        <>
          {ausErsatz && (
            <p className="mb-4 rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-3
                          text-sm text-amber-200">
              <T>Die Ablage antwortet gerade nicht. Du siehst die letzte Sicherung, und die kann älter sein. Die Karte ist nicht verloren und steht gleich wieder aktuell da.</T>
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {karten.map((k, i) => (
              <button key={k.id} type="button" onClick={() => setOffen(i)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  i === offen
                    ? 'border-amber-400/60 bg-amber-400/15 font-semibold text-amber-200'
                    : 'border-zinc-800 text-slate-300 hover:border-zinc-700'}`}>
                {/*
                  * Kein "Battle Royale · Day 1": die Karte ist fuer beide
                  * Tage dieselbe. Der Betreiber wollte hier "Global
                  * Championship (2026)" stehen haben, ohne Tag. Nur wenn es
                  * mehrere Karten gibt, steht das Bild dahinter.
                  */}
                {KARTEN_NAME}
                {karten.length > 1 && (
                  <span className="ml-2 text-[11px] text-slate-500">
                    {k.bildTitel || k.titel}
                  </span>
                )}
              </button>
            ))}
            {zugang.admin && (
              <Link href={`/maps?id=${encodeURIComponent(karte.id)}`}
                className="ml-auto rounded-lg border border-zinc-800 px-3 py-2
                           text-xs text-slate-400 transition
                           hover:border-amber-400/60 hover:text-amber-200">
                <T>Im Karten-Werkzeug öffnen</T>
              </Link>
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <KartenBild key={karte.id} karte={karte} namenZu={namenZu}
                markiert={markiert} zeige={zeige} />
              <p className="mt-3 text-center text-[11px] text-slate-600">
                <T>Mausrad zoomt, ziehen verschiebt, Doppelklick fährt eine Form an. Nur zum Ansehen — verteilt wird im Karten-Werkzeug.</T>
              </p>
            </div>

            <aside className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3
                              lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold
                             text-slate-100">
                <T>Teams</T>
                <span className="text-xs font-normal tabular-nums text-slate-500">
                  {(karte.teams ?? []).length}
                </span>
              </h2>
              <div className="space-y-3">
                {liste.map((g) => (
                  <div key={g.region || 'ohne'}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider
                                  text-amber-300/80">
                      {g.region || <T>Ohne Region</T>}
                      <span className="ml-1.5 font-normal text-slate-600">{g.zeilen.length}</span>
                    </p>
                    <ul>
                      {g.zeilen.map((z) => (
                        <li key={z.tm.id}>
                          <button type="button" disabled={!z.form}
                            onMouseEnter={() => setMarkiert(z.form)}
                            onMouseLeave={() => setMarkiert(null)}
                            onClick={() => { if (z.form) setZeige({ id: z.form, mal: Date.now() }); }}
                            title={z.form ? undefined : t('Noch keiner Form zugeordnet')}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left
                                       transition hover:bg-zinc-800/70 disabled:cursor-default
                                       disabled:opacity-50 disabled:hover:bg-transparent">
                            <span className="flex shrink-0 -space-x-1">
                              {z.laender.map((l, k) => <Flagge key={k} land={l} />)}
                            </span>
                            <span className={`${kartenSchrift.className} min-w-0 flex-1 truncate
                                              text-[13px] tracking-wide text-slate-200`}>
                              {z.namen.join(' + ')}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}
    </GlobalsGeruest>
  );
}
