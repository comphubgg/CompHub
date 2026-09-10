'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ARTEN, overlayAdresse, type OverlayEintrag } from './OverlayGeruest';
import { useZugang } from '@/app/lib/zugang';
import {
  overlayCupErlaubt, overlayCupRang, overlayRegionRang, overlayZeitraumWeit,
} from '@/lib/overlayCups';

/*
 * Alle eigenen Overlays an einer Stelle.
 *
 * Bisher sah jede Seite nur ihre eigene Art: auf der Standings-Seite die
 * Standings, auf der Qual-Seite die Qual-Linien. Wer wissen wollte, was er
 * ueberhaupt angelegt hat, musste drei Seiten durchgehen.
 *
 * Der Betreiber wollte einen eigenen Abschnitt darunter, mit etwas mehr Luft
 * als sonst - und darin genau drei Handgriffe, mehr nicht: umbenennen, den Cup
 * wechseln, loeschen. Dazu die Adresse fuer OBS, die sich nie aendert.
 *
 * Was hier bewusst NICHT steht: Farben, Groessen, Anordnung. Dafuer gibt es
 * die Seite der jeweiligen Art. Hier geht es um das Verwalten, nicht um das
 * Aussehen - "mehr kann ich eigentlich da nicht switchen, ausser loeschen und
 * umbenennen".
 */

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number; istFinale: boolean;
}
interface Cup {
  id: string; titel: string;
  regionen?: Record<string, Fenster[]>;
}

export default function MeineOverlays() {
  const t = useT();
  const zugang = useZugang();
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kopiert, setKopiert] = useState<string | null>(null);
  /** Bei welchem Overlay die Cup-Liste gerade offen steht. */
  const [cupOffen, setCupOffen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState('');

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/overlay-config?meine=1',
        { cache: 'no-store' })).json();
      setListe(j.overlays ?? []);
    } catch {
      setListe([]);
    }
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Zur Wahl stehen dieselben Cups wie ueberall in den Overlays - Division 1,
   * die grossen Finals, Solo-FNCS, Cash und Victory Cups, Performance. Die
   * Regel steht in lib/overlayCups.ts, der Zeitraum reicht eine Woche zurueck
   * und zwei nach vorn: ein gespeichertes Overlay wird oft Tage vor dem
   * Spieltag auf den naechsten Cup gestellt.
   */
  const cupWahl = useMemo(() => {
    /*
     * Zwei Tage zurueck, der Rest nach vorn.
     *
     * Der Betreiber wollte vergangene Spieltage waehlen koennen, aber nicht
     * beliebig weit: "maximal zwei Tage vergangen, und die sollen dann eher
     * unten sein." Ein Overlay auf einen Cup von letzter Woche zu stellen
     * hat keinen Zweck - die Tabelle steht dann fest.
     */
    const { bis } = overlayZeitraumWeit();
    const von = Date.now() - 2 * 86_400_000;
    const raus: Array<{
      wert: string; titel: string; live: boolean;
      rang: number; region: number; begin: number; vorbei: boolean;
    }> = [];
    for (const c of cups ?? []) {
      if (!overlayCupErlaubt(c.titel)) continue;
      for (const fenster of Object.values(c.regionen ?? {})) {
        for (const w of fenster) {
          if (w.begin < von || w.begin > bis) continue;
          raus.push({
            wert: `${w.eventId}|${w.windowId}`,
            titel: `${c.titel} · ${w.region}${w.istFinale ? ' · Finale' : ''}`,
            live: w.status === 'live',
            rang: overlayCupRang(c.titel),
            region: overlayRegionRang(w.region),
            begin: w.begin,
            vorbei: w.begin < Date.now(),
          });
        }
      }
    }
    /*
     * Laufendes zuerst, dann nach Wichtigkeit - wie in der Cup-Auswahl.
     * Alphabetisch waere hier ein Arena-Testcup vor den Grand Finals gelandet.
     */
    /*
     * Laufendes oben, Vergangenes unten, dazwischen nach Datum.
     *
     * Was schon gelaufen ist, braucht man selten - es steht deshalb hinter
     * allem, was noch kommt, statt sich zwischen die kommenden Spieltage zu
     * mischen.
     */
    const jetzt = Date.now();
    return raus.sort((a, b) => Number(b.live) - Number(a.live)
      || Number(a.vorbei) - Number(b.vorbei)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt)
      || a.region - b.region
      || a.titel.localeCompare(b.titel));
  }, [cups]);

  /** Eine Einstellung aendern, ohne die uebrigen anzufassen. */
  const aendern = useCallback(async (
    o: OverlayEintrag,
    neuerName: string,
    zusatz: Record<string, unknown> = {},
  ) => {
    setMeldung('');
    const r = await fetch('/api/overlay-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: o.id, typ: o.typ, name: neuerName,
        config: { ...o.config, ...zusatz },
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMeldung(j?.error ?? t('Nicht gespeichert.'));
      return;
    }
    setOffen(null);
    await laden();
  }, [laden, t]);

  const entfernen = useCallback(async (id: string) => {
    await fetch('/api/overlay-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, loeschen: true }),
    }).catch(() => {});
    await laden();
  }, [laden]);

  const kopieren = async (o: OverlayEintrag) => {
    try {
      await navigator.clipboard.writeText(overlayAdresse(o.typ, o.id));
      setKopiert(o.id);
      setTimeout(() => setKopiert(null), 1800);
    } catch { /* dann von Hand markieren */ }
  };

  /** Wie die Art heisst, wie sie in der Leiste steht. */
  const artName = (typ: string) =>
    ARTEN.find((a) => a.schluessel === typ)?.titel ?? typ;

  /**
   * Wer im Overlay steht.
   *
   * Bei der Team-Karte sind das die eingetragenen Anzeigenamen - genau die,
   * die der Betreiber von Hand gesetzt hat. Damit erkennt er die Zeile
   * wieder, ohne sie zu oeffnen.
   */
  const wer = (o: OverlayEintrag): string => {
    const c = o.config as { namen?: string[]; ids?: string[] };
    const namen = (c.namen ?? []).filter(Boolean);
    if (namen.length) return namen.join(' + ');
    if (c.ids?.length) return `${c.ids.length} ${t('Spieler')}`;
    return '';
  };

  /** Welcher Cup gerade eingestellt ist. */
  const cupVon = (o: OverlayEintrag): string => {
    const c = o.config as { event?: string; window?: string };
    if (!c.window) return '';
    const treffer = cupWahl.find((x) => x.wert === `${c.event}|${c.window}`);
    return treffer ? treffer.titel : c.window;
  };

  if (!liste) {
    return <div className="mt-10 h-24 animate-pulse rounded-xl bg-zinc-900/60" />;
  }

  return (
    /*
     * Der groessere Abstand nach oben ist Absicht: das hier ist ein eigener
     * Abschnitt, keine Fortsetzung der Leiste darueber.
     */
    <section className="mt-12 border-t border-zinc-800 pt-8">
      {/*
        * Bei einem Manager gehoeren sie nicht ihm.
        *
        * "Meine Overlays" waere dort schlicht falsch: es sind die des
        * Streamers, den er betreut. Der Betreiber wollte den Namen dort
        * sehen - "nicht my overlays, sondern groupay overlays".
        */}
      <h2 className="text-sm font-semibold text-slate-100">
        {zugang.verwaltet
          ? `${zugang.verwaltet} Overlays` : <T>Meine Overlays</T>}
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        <T>Alles, was du angelegt hast — über alle Arten hinweg. Hier lässt
        sich umbenennen, der Cup wechseln und löschen. Wie es aussieht,
        stellst du auf der Seite der jeweiligen Art ein.</T>
      </p>

      {meldung && (
        <p className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30
                      px-3 py-2 text-[11px] text-amber-300">{meldung}</p>
      )}

      {!liste.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-800
                      px-4 py-8 text-center text-[11px] text-slate-600">
          <T>Noch nichts angelegt.</T>
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {liste.map((o) => (
            <div key={o.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">

              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md border border-zinc-800 px-2 py-0.5
                                 text-[10px] uppercase tracking-wide text-slate-500">
                  {artName(o.typ)}
                </span>

                {offen === o.id ? (
                  <input value={name} autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name.trim()) void aendern(o, name.trim());
                      if (e.key === 'Escape') setOffen(null);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-sky-600
                               bg-zinc-950 px-3 py-1.5 text-sm text-slate-100
                               outline-none" />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold
                                   text-slate-100">
                    {o.name}
                    {/*
                      * Wer es zuletzt angefasst hat.
                      *
                      * Steht nur da, wenn ein Manager-Zugang am Werk war -
                      * bei einem Zugang, den nur eine Person hat, waere es
                      * eine Zeile, die immer denselben Namen zeigt.
                      */}
                    {(o.geaendertVon || o.angelegtVon) && (
                      <span className="ml-2 font-normal text-[11px] text-slate-500">
                        <T>von</T> {o.geaendertVon || o.angelegtVon}
                      </span>
                    )}
                  </span>
                )}

                {offen === o.id ? (
                  <>
                    <button onClick={() => name.trim() && void aendern(o, name.trim())}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-[11px]
                                 font-medium text-white hover:bg-sky-400">
                      <T>Übernehmen</T>
                    </button>
                    <button onClick={() => setOffen(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-300">
                      <T>Abbrechen</T>
                    </button>
                  </>
                ) : (
                  <>
                    {/*
                      * Bearbeiten heisst: mit diesem Overlay in den Baukasten.
                      *
                      * Bisher gab es hier nur Umbenennen, Cup wechseln und
                      * Loeschen - wer das Aussehen aendern oder einen Spieler
                      * herausnehmen wollte, musste ein neues anlegen. Der
                      * Betreiber wollte beides koennen, als VIP wie als
                      * Manager: "man soll das ganze optische Aussehen aendern
                      * koennen, Spieler removen und so weiter."
                      */}
                    <a href={`${ARTEN.find((a) => a.schluessel === o.typ)?.pfad
                      ?? '/overlays'}?id=${encodeURIComponent(o.id)}&bauen=1`}
                      className="text-[11px] font-medium text-sky-400
                                 underline hover:text-sky-300">
                      <T>Bearbeiten</T>
                    </a>
                    <button onClick={() => { setOffen(o.id); setName(o.name); }}
                      className="text-[11px] text-slate-400 underline
                                 hover:text-slate-200">
                      <T>Umbenennen</T>
                    </button>
                    <button onClick={() => void kopieren(o)}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-[11px]
                                 font-medium text-white hover:bg-sky-400">
                      {kopiert === o.id ? <T>Kopiert</T> : <T>Adresse</T>}
                    </button>
                    <button onClick={() => void entfernen(o.id)}
                      title={t('Löschen')}
                      className="text-slate-600 transition hover:text-rose-400">
                      ×
                    </button>
                  </>
                )}
              </div>

              {/* Wer drin steht - nur wo es etwas zu zeigen gibt. */}
              {wer(o) && (
                <p className="mt-1.5 truncate text-[11px] text-slate-500">{wer(o)}</p>
              )}

              {/*
                * Der Cup. Das ist die einzige Einstellung, die hier
                * umgeschaltet werden kann - und die einzige, die man
                * waehrend eines Streams wirklich wechseln will.
                */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-600"><T>Cup</T></span>
                {/*
                  * Eine eigene Liste statt eines Auswahlfelds.
                  *
                  * Ein natives <select> kann keine Spalte rechts fuehren und
                  * keine Zwischenueberschrift setzen - der Betreiber wollte
                  * beides: "das Datum ganz rechts", und die vergangenen Cups
                  * unter einer eigenen fetten Ueberschrift ganz unten.
                  */}
                <div className="relative min-w-0 flex-1">
                  <button type="button"
                    onClick={() => setCupOffen(cupOffen === o.id ? null : o.id)}
                    className="flex w-full items-center gap-2 rounded-lg border
                               border-zinc-800 bg-zinc-950 px-2 py-1 text-left
                               text-[11px] text-slate-300 transition
                               hover:border-zinc-700">
                    <span className="min-w-0 flex-1 truncate">
                      {cupVon(o) || t('— keiner —')}
                    </span>
                    <span className="shrink-0 text-slate-600">▾</span>
                  </button>

                  {cupOffen === o.id && (
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-72
                                    overflow-y-auto rounded-lg border
                                    border-zinc-700 bg-zinc-950 py-1 shadow-xl">
                      <button type="button"
                        onClick={() => {
                          void aendern(o, o.name, { event: '', window: '' });
                          setCupOffen(null);
                        }}
                        className="flex w-full items-center px-3 py-1.5
                                   text-left text-[11px] text-slate-500
                                   hover:bg-zinc-900">
                        {t('— keiner —')}
                      </button>

                      {cupWahl.filter((c) => !c.vorbei).map((c) => (
                        <button key={c.wert} type="button"
                          onClick={() => {
                            const [event, fenster] = c.wert.split('|');
                            void aendern(o, o.name, { event, window: fenster });
                            setCupOffen(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5
                                     text-left text-[11px] text-slate-300
                                     hover:bg-zinc-900">
                          {c.live && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full
                                             bg-rose-500" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{c.titel}</span>
                          <span className="shrink-0 tabular-nums text-slate-600">
                            {new Date(c.begin).toLocaleDateString('de-DE',
                              { day: '2-digit', month: '2-digit' })}
                          </span>
                        </button>
                      ))}

                      {/*
                        * Die vergangenen, unter einer eigenen Ueberschrift.
                        *
                        * Sie stehen ganz unten, weil man sie selten braucht -
                        * aber sie stehen da, denn eine Tabelle von gestern
                        * will man im Stream auch mal zeigen.
                        */}
                      {cupWahl.some((c) => c.vorbei) && (
                        <p className="mt-1 border-t border-zinc-800 px-3 pb-1
                                      pt-2 text-[10px] font-bold uppercase
                                      tracking-wider text-slate-500">
                          <T>Vergangene Cups</T>
                        </p>
                      )}
                      {cupWahl.filter((c) => c.vorbei).map((c) => (
                        <button key={c.wert} type="button"
                          onClick={() => {
                            const [event, fenster] = c.wert.split('|');
                            void aendern(o, o.name, { event, window: fenster });
                            setCupOffen(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5
                                     text-left text-[11px] text-slate-500
                                     hover:bg-zinc-900">
                          <span className="min-w-0 flex-1 truncate">{c.titel}</span>
                          <span className="shrink-0 tabular-nums text-slate-600">
                            {new Date(c.begin).toLocaleDateString('de-DE',
                              { day: '2-digit', month: '2-digit' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {cupVon(o) && (
                  <span className="text-[11px] text-slate-600">{cupVon(o)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
