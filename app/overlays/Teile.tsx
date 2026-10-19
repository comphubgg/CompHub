'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ARTEN, overlayAdresse, type OverlayEintrag } from './OverlayGeruest';
import { useZugang } from '@/app/lib/zugang';
import {
  managerDarfCup, overlayCupErlaubt, overlayCupRang, overlayRegionRang,
  overlayZeitraumWeit, rundenBeschriftung,
} from '@/lib/overlayCups';

/*
 * Die Bausteine, die sich alle Overlay-Seiten teilen: die Cup-Auswahl, die
 * Liste der eigenen Overlays und ein paar Regler, die sonst auf jeder Seite
 * noch einmal geschrieben werden muessten.
 */

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number; end?: number; istFinale: boolean; playlist?: string;
}
interface Cup {
  id: string; titel: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
}

/** Was die Cup-Auswahl ueber den gewaehlten Spieltag weiss - fuer Baukaesten, die mehr brauchen als die Kennung. */
export interface CupInfo {
  /** Die Region des Spieltags (EU, NAC ...). */
  region: string;
  /** Epics Wiedergabeliste - daraus folgt, ob Solo, Duo oder Trio gespielt wird. */
  playlist: string;
  istFinale: boolean;
  live: boolean;
  begin: number;
  /** Cup-Titel und Runde einzeln, ohne Region. */
  cup: string;
  stufe: string;
}

/*
 * Welche Cups zur Auswahl stehen, steht in lib/overlayCups.ts - dieselbe
 * Regel wie auf der Team-Karte. Hier war frueher eine zweite, etwas andere
 * Fassung; sie liess unter anderem jeden globalen Cup durch.
 *
 * Was der Schalter darunter aufhebt, ist nur die inhaltliche Einschraenkung
 * (FNCS, Cash, Performance). Der Zeitraum ist eigen: nur was jetzt laeuft.
 */

/** Wie eine Zeile beschriftet wird - "läuft", "gestern", "morgen". */
function zeitwort(status: string, begin: number, end?: number): string {
  if (status === 'live') return 'läuft';
  // Gerade zu Ende gegangen: noch eine halbe Stunde in der Liste (die Idee hat gripey.stream - sein Overlay bleibt nach dem Cup noch dreissig Minuten stehen).
  if (end && Date.now() > end && Date.now() - end <= 30 * 60_000) return 'gerade vorbei';
  const bis = begin - Date.now();
  if (bis > 0 && bis <= 30 * 60_000) return 'gleich';
  const tag = new Date(begin); tag.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const abstand = Math.round((tag.getTime() - heute.getTime()) / 86_400_000);
  if (abstand === 0) return 'heute';
  if (abstand === -1) return 'gestern';
  if (abstand === 1) return 'morgen';
  return '';
}

interface Zeile {
  eventId: string; windowId: string; region: string;
  cup: string; stufe: string; titel: string; playlist: string;
  istFinale: boolean; wann: string; live: boolean; begin: number;
}

/**
 * Die Cup-Auswahl der Overlays.
 *
 * Der Betreiber (19.10.2026): zur Wahl stehen nur Cups, die gerade laufen -
 * keine kommenden -, und nur FNCS, Cash und Performance; fuer Ranked und
 * Co. schaltet man den Filter aus. Die Runden sind auseinanderzuhalten
 * ("Last Chance Qualifier" und sein Finale, "Runde 2"). Eine gespeicherte
 * Adresse bleibt dagegen gueltig, wenn der Cup vorbei ist: sie traegt den
 * Spieltag fest und zeigt dann die letzten Zahlen.
 */
export function CupWahl({ event, window: fenster, onWahl, nurKommende = false }: {
  event: string; window: string;
  onWahl: (event: string, window: string, titel: string, info?: CupInfo) => void;
  /**
   * Nur Spieltage, die noch nicht angefangen haben - und die gerade laufen.
   *
   * Fuer den Timer: auf einen Spieltag von gestern laesst sich nicht
   * zaehlen. Der Betreiber wollte das gar nicht erst anbieten - "man soll
   * keine vergangenen Cups auswaehlen koennen" - statt hinterher zu
   * erklaeren, warum die Vorschau leer bleibt. Was schon laeuft, bleibt
   * waehlbar: der Timer zaehlt dann die Zeit seit dem Start.
   */
  nurKommende?: boolean;
}) {
  const t = useT();
  const zugang = useZugang();
  // Ein Manager waehlt nur, was gerade dran ist - siehe managerDarfCup().
  const nurLaufende = Boolean(zugang.verwaltet);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [alle, setAlle] = useState(false);
  const [frueher, setFrueher] = useState(false);

  useEffect(() => {
    // "alle", damit auch der gestrige Spieltag mitkommt: die Voreinstellung
    // "aktuell" gibt nur Laufendes und Kommendes heraus.
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Alle Spieltage, die der Cup-Art nach zur Wahl stehen können - mit ihrer Runde.
   *
   * Noch ohne Zeitfilter: den gewaehlten Spieltag soll die Auswahl auch dann
   * kennen, wenn er nicht mehr laeuft (gespeichertes Overlay, Adresse).
   */
  const pool = useMemo(() => {
    const raus: Zeile[] = [];
    // NA Central und NA West teilen sich Fenster: dasselbe windowId steht in beiden Regionen der Liste - es soll nur einmal zur Wahl stehen (und mit seiner eigenen Region).
    const gesehen = new Set<string>();
    for (const c of cups ?? []) {
      if (!alle && !overlayCupErlaubt(c.titel)) continue;
      for (const liste of Object.values(c.regionen ?? {})) {
        const frisch = (liste ?? []).filter((w) => !gesehen.has(w.windowId));
        const stufen = rundenBeschriftung(frisch, t);
        for (const w of frisch) {
          gesehen.add(w.windowId);
          const region = /_([A-Z]{2,4})$/.exec(w.windowId)?.[1] ?? w.region;
          const stufe = stufen.get(w.windowId) ?? '';
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region,
            cup: c.titel, stufe,
            titel: [c.titel, stufe, region].filter(Boolean).join(' · '),
            playlist: w.playlist ?? '', istFinale: w.istFinale,
            wann: zeitwort(w.status, w.begin, w.end), live: w.status === 'live',
            begin: w.begin,
          });
        }
      }
    }
    return raus;
  }, [cups, alle, t]);

  /*
   * Was in der Liste steht.
   *
   * Nur Laufendes - auf Wunsch dazu die letzte Woche. Kommendes nie (ausser
   * beim Countdown, der nur Kommendes braucht). Laufendes steht oben, dann der
   * naechste zuerst; unter gleich Nahem Europa vor dem Rest.
   */
  const laufend = useMemo(() => {
    const { von, bis } = overlayZeitraumWeit();
    const jetzt = Date.now();
    const sicht = pool.filter((w) => {
      // Der Countdown braucht Kommendes - und Laufendes, damit er danach die Zeit seit dem Start zaehlen kann.
      if (nurKommende) return (w.begin > jetzt || w.live) && w.begin <= bis;
      if (nurLaufende && !managerDarfCup(w.begin, w.region, w.live)) return false;
      if (w.live || w.wann === 'gleich' || w.wann === 'gerade vorbei') return true;
      return frueher && w.begin < jetzt && w.begin >= von;
    });
    return sicht.sort((a, b) => Number(b.live) - Number(a.live)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt)
      || overlayRegionRang(a.region) - overlayRegionRang(b.region)
      || overlayCupRang(a.cup) - overlayCupRang(b.cup)
      || a.titel.localeCompare(b.titel));
  }, [pool, frueher, nurLaufende, nurKommende]);

  /** Der gewaehlte Spieltag steht oben, auch wenn er nicht mehr in der Liste waere. */
  const angezeigt = useMemo(() => {
    const da = fenster ? pool.find((w) => w.windowId === fenster) : undefined;
    return da && !laufend.some((w) => w.windowId === da.windowId) ? [da, ...laufend] : laufend;
  }, [laufend, pool, fenster]);

  const waehle = useCallback((w: Zeile) => {
    onWahl(w.eventId, w.windowId, w.titel, {
      region: w.region, playlist: w.playlist, istFinale: w.istFinale,
      live: w.live, begin: w.begin, cup: w.cup, stufe: w.stufe,
    });
  }, [onWahl]);

  /*
   * Kommt der Cup schon aus der Adresse?
   *
   * Die Startseite schickt ihn mit: /overlays/standings?event=…&fenster=…
   * Ohne diesen Griff muesste man ihn im Baukasten ein zweites Mal suchen,
   * und das war genau der Weg, den der Betreiber loswerden wollte.
   *
   * Nur einmal und nur, solange nichts gewaehlt ist - sonst spraenge die
   * Auswahl bei jeder Aenderung wieder zurueck.
   */
  const [ausAdresse, setAusAdresse] = useState(false);
  useEffect(() => {
    if (ausAdresse || fenster || !pool.length) return;
    const p = new URLSearchParams(window.location.search);
    const w = p.get('fenster');
    if (!w) return;
    const treffer = pool.find((x) => x.windowId === w);
    if (treffer) {
      waehle(treffer);
      setAusAdresse(true);
    } else if (cups && cups.length && !alle) {
      // Ein sonstiger Cup (Ranked, Reload ...): der Filter hielt ihn zurueck, also aus.
      setAlle(true);
    }
  }, [pool, fenster, ausAdresse, waehle, cups, alle]);

  return (
    <div>
      <p className="text-xs text-slate-400">
        {nurKommende ? <T>Cup — die nächsten Spieltage</T> : <T>Cup — was gerade läuft</T>}
      </p>

      <div className="mt-1 max-h-72 space-y-1 overflow-y-auto">
        {angezeigt.map((w) => (
          <button key={w.windowId} type="button" onClick={() => waehle(w)}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2
                        text-left text-[13px] transition ${w.windowId === fenster
              ? 'border-sky-500 bg-sky-500/10 text-slate-100'
              : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
            {w.live && (
              <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold
                               uppercase text-white">live</span>
            )}
            <span className="min-w-0 flex-1 truncate">
              {[w.cup, w.stufe].filter(Boolean).join(' · ')}
            </span>
            <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px]
                             font-medium text-slate-300">{w.region}</span>
            <span className="shrink-0 text-[11px] text-slate-500">
              {new Date(w.begin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              {w.wann && !w.live ? ` · ${t(w.wann)}` : ''}
            </span>
          </button>
        ))}
      </div>

      {/*
        * Eine leere Liste braucht eine Begruendung.
        *
        * Ausserhalb der Cup-Zeiten laeuft nichts, und ein leeres Auswahlfeld
        * sieht aus wie ein Fehler im Werkzeug.
        */}
      {cups && !angezeigt.length && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-500/80">
          {nurKommende
            ? <T>In den nächsten Tagen steht kein passender Cup an.</T>
            : <T>Gerade läuft kein passender Cup. Die Liste füllt sich von selbst,
              sobald einer startet — das Overlay in OBS musst du dafür nicht
              anfassen.</T>}
        </p>
      )}

      <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <input type="checkbox" checked={!alle}
          onChange={(e) => setAlle(!e.target.checked)}
          className="accent-sky-500" />
        <T>nur FNCS, Cash Cups und Performance Cups</T>
      </label>
      {!nurKommende && (
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
          <input type="checkbox" checked={frueher}
            onChange={(e) => setFrueher(e.target.checked)}
            className="accent-sky-500" />
          <T>auch Spieltage der letzten sieben Tage</T>
        </label>
      )}
      {event && (
        <p className="mt-1 truncate font-mono text-[10px] text-slate-700">
          {fenster}
        </p>
      )}
    </div>
  );
}

/** Ein Regler mit Beschriftung und Wert - auf jeder Seite dieselbe Form. */
export function Regler({ titel, wert, von, bis, schritt = 1, einheit, setzen }: {
  titel: string; wert: number; von: number; bis: number;
  schritt?: number; einheit?: string; setzen: (n: number) => void;
}) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="flex items-baseline justify-between gap-2">
        <T>{titel}</T>
        <span className="tabular-nums text-slate-300">
          {wert}{einheit ? ` ${einheit}` : ''}
        </span>
      </span>
      <input type="range" min={von} max={bis} step={schritt} value={wert}
        onChange={(e) => setzen(Number(e.target.value))}
        className="mt-1 w-full accent-sky-500" />
    </label>
  );
}

/** Eine Reihe Knoepfe, von denen genau einer gilt. */
export function Wahlreihe<W extends string | number>({ titel, wert, optionen, setzen }: {
  titel: string; wert: W;
  optionen: Array<{ wert: W; titel: string }>;
  setzen: (w: W) => void;
}) {
  return (
    <div className="text-xs text-slate-400">
      <T>{titel}</T>
      <div className="mt-1 flex flex-wrap gap-1">
        {optionen.map((o) => (
          <button key={String(o.wert)} type="button" onClick={() => setzen(o.wert)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              wert === o.wert
                ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
            <T>{o.titel}</T>
          </button>
        ))}
      </div>
    </div>
  );
}

/*
 * Das Schachbrett hinter jeder Vorschau.
 *
 * Ein Overlay ist durchsichtig; auf schwarzem Grund sieht man nicht, wie
 * viel davon durchscheint.
 */
const KARO: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#27272a 25%,transparent 25%),'
    + 'linear-gradient(-45deg,#27272a 25%,transparent 25%),'
    + 'linear-gradient(45deg,transparent 75%,#27272a 75%),'
    + 'linear-gradient(-45deg,transparent 75%,#27272a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

/** Die Buehne im Vollbild: so gross wie ein Stream. */
const BUEHNE = { breite: 1920, hoehe: 1080 };

/**
 * Die Vorschau - gross, und auf Wunsch bildschirmfuellend.
 *
 * Der Betreiber: "mach die Preview groesser, und mach, dass man Fullscreen
 * machen kann und auch wieder leaven kann." Sie war ein schmaler Streifen in
 * der rechten Spalte, in dem ein Offspawn mit Fotos schon nicht mehr ganz
 * Platz hatte.
 *
 * Jetzt liegt sie ueber der ganzen Breite und klebt beim Scrollen unter der
 * Kopfzeile fest - wer unten an einem Regler dreht, sieht oben, was er tut.
 *
 * Das Vollbild ist eine Buehne von 1920 x 1080, auf den Bildschirm
 * eingepasst: auf einem 1080p-Monitor ist das Overlay dann genau so gross
 * wie in OBS. Eine ehrliche Vorschau, keine aufgeblasene. Verlassen mit dem
 * Knopf oder mit Escape.
 *
 * @param klebt Ob die Vorschau beim Scrollen oben stehen bleibt. Aus, wo
 *   sie ohnehin in einer klebenden Spalte sitzt.
 */
export function Vorschau({ src, hoehe = 220, klebt = true, leer }: {
  src: string | null;
  hoehe?: number;
  klebt?: boolean;
  leer?: React.ReactNode;
}) {
  const [voll, setVoll] = useState(false);
  const schliessen = useCallback(() => setVoll(false), []);

  /*
   * Wie hoch die Kopfzeile ist.
   *
   * Sie klebt selbst oben; die Vorschau muss darunter anhalten und nicht
   * dahinter verschwinden. Ihre Hoehe steht nirgends fest - sie wird
   * gemessen.
   */
  const [oben, setOben] = useState(0);
  useEffect(() => {
    if (!klebt) return undefined;
    const kopf = document.querySelector('header');
    const messen = () => setOben(
      kopf ? Math.round(kopf.getBoundingClientRect().height) : 0);
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [klebt]);

  return (
    <>
      <div
        className={klebt
          ? 'sticky z-30 mb-5 bg-zinc-950 pb-3 pt-2'
          : 'mb-3'}
        style={klebt ? { top: oben } : undefined}>
        <div className="relative overflow-hidden rounded-xl border border-zinc-800"
          style={{ ...KARO, height: hoehe }}>
          {src ? (
            <iframe key={src} src={src} title="Vorschau" scrolling="no"
              className="block h-full w-full border-0" />
          ) : (
            <div className="grid h-full place-items-center px-4 text-center
                            text-[11px] text-slate-500">
              {leer}
            </div>
          )}
          {/* Unten rechts: Overlays sitzen oben links, da kommt nichts
              in die Quere. */}
          {src && (
            <button type="button" onClick={() => setVoll(true)}
              className="absolute bottom-2 right-2 rounded-lg border border-zinc-700
                         bg-zinc-950/85 px-3 py-1.5 text-[11px] font-medium
                         text-slate-300 backdrop-blur transition
                         hover:border-sky-500 hover:text-sky-400">
              ⛶ <T>Vollbild</T>
            </button>
          )}
        </div>
      </div>
      {voll && src && <VollbildVorschau src={src} schliessen={schliessen} />}
    </>
  );
}

/** Die bildschirmfuellende Vorschau - siehe Vorschau. */
function VollbildVorschau({ src, schliessen }: {
  src: string; schliessen: () => void;
}) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [mass, setMass] = useState(1);

  useEffect(() => {
    const passen = () => setMass(Math.min(
      window.innerWidth / BUEHNE.breite, window.innerHeight / BUEHNE.hoehe));
    passen();
    window.addEventListener('resize', passen);

    /*
     * Echtes Vollbild, wenn der Browser es erlaubt.
     *
     * Erlaubt er es nicht, bleibt die feste Flaeche ueber der Seite - das
     * sieht fast gleich aus. Verlaesst jemand das Vollbild ueber Escape,
     * meldet der Browser das, und die Flaeche geht mit zu.
     */
    const el = rahmen.current;
    el?.requestFullscreen?.().catch(() => {});
    const beiWechsel = () => { if (!document.fullscreenElement) schliessen(); };
    document.addEventListener('fullscreenchange', beiWechsel);
    const beiTaste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    window.addEventListener('keydown', beiTaste);

    return () => {
      window.removeEventListener('resize', passen);
      document.removeEventListener('fullscreenchange', beiWechsel);
      window.removeEventListener('keydown', beiTaste);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [schliessen]);

  /* Erst aus dem Vollbild, dann zu - sonst bleibt der Bildschirm schwarz. */
  function verlassen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {}).finally(schliessen);
    } else {
      schliessen();
    }
  }

  // Ueber allem, auch ueber dem Sprachschalter unten rechts (z-100).
  return (
    <div ref={rahmen} className="fixed inset-0 z-[200] bg-black">
      <div className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{
          ...KARO,
          width: BUEHNE.breite, height: BUEHNE.hoehe,
          transform: `translate(-50%, -50%) scale(${mass})`,
        }}>
        <iframe src={src} title="Vorschau" scrolling="no"
          className="block border-0"
          style={{ width: BUEHNE.breite, height: BUEHNE.hoehe }} />
      </div>
      <button type="button" onClick={verlassen}
        className="absolute right-4 top-4 z-10 rounded-lg border border-zinc-700
                   bg-zinc-950/85 px-4 py-2 text-sm font-medium text-slate-200
                   backdrop-blur transition hover:border-sky-500
                   hover:text-sky-400">
        ✕ <T>Vollbild verlassen</T>
      </button>
      <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap
                    rounded-lg bg-zinc-950/70 px-3 py-1.5 text-[11px]
                    text-slate-400 backdrop-blur">
        <T>So groß wie im Stream (1920 × 1080). Escape zum Verlassen.</T>
      </p>
    </div>
  );
}

/**
 * Die eigenen Overlays dieser Art.
 *
 * Jede Zeile traegt die Adresse, die in OBS gehoert - kopieren, einfuegen,
 * fertig. Sie aendert sich nie wieder.
 */
export function MeineListe({ liste, typ, offen, waehlen, entfernen }: {
  liste: OverlayEintrag[] | null;
  typ: string;
  offen: string | null;
  waehlen: (o: OverlayEintrag) => void;
  entfernen: (id: string) => void;
}) {
  const t = useT();
  const [kopiert, setKopiert] = useState<string | null>(null);

  const kopieren = async (id: string) => {
    try {
      await navigator.clipboard.writeText(overlayAdresse(typ, id));
      setKopiert(id);
      setTimeout(() => setKopiert(null), 1800);
    } catch { /* dann von Hand markieren */ }
  };

  if (!liste) {
    return <div className="h-20 animate-pulse rounded-xl bg-zinc-900/60" />;
  }

  if (!liste.length) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6
                    text-center text-[11px] text-slate-600">
        <T>Noch keins angelegt. Links einstellen und speichern.</T>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {liste.map((o) => (
        <div key={o.id}
          className={`rounded-xl border px-3 py-2.5 transition ${o.id === offen
            ? 'border-sky-600 bg-sky-950/20' : 'border-zinc-800 bg-zinc-950/60'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => waehlen(o)}
              className="min-w-0 flex-1 truncate text-left text-sm font-semibold
                         text-slate-200 hover:text-sky-400">
              {o.name}
            </button>
            <button onClick={() => kopieren(o.id)}
              className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-medium
                         text-white transition hover:bg-sky-400">
              {kopiert === o.id ? t('kopiert') : t('Adresse kopieren')}
            </button>
            <button onClick={() => entfernen(o.id)}
              title={t('entfernen')}
              className="rounded-lg border border-zinc-800 px-2 py-1 text-[11px]
                         text-slate-500 transition hover:border-rose-500/60
                         hover:text-rose-400">
              ×
            </button>
          </div>
          <code className="mt-1 block truncate text-[10px] text-slate-600">
            /overlay/{ARTEN.find((a) => a.schluessel === typ)?.datei}?id={o.id}
          </code>
        </div>
      ))}
    </div>
  );
}
