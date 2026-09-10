'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import MeineOverlays from './MeineOverlays';
import { useZugang } from '@/app/lib/zugang';
import {
  managerDarfCup, overlayCupErlaubt, overlayCupRang, overlayRegionRang,
  overlayZeitraumWeit,
} from '@/lib/overlayCups';

/*
 * Die Startseite der Overlays.
 *
 * Der Betreiber wollte nicht mehr mitten im Baukasten landen: "wenn man
 * draufkommt, sieht man alle seine gespeicherten. Die kann man auswaehlen,
 * neuen Cup auswaehlen ... wenn man ein neues will, muss man draufdruecken."
 *
 * Also drei Schritte statt einem Formular:
 *
 *   1. Was schon da ist - die eigenen Overlays, gross und als Erstes.
 *   2. Ein neues: welcher Cup? Nach Wichtigkeit geordnet, mit einem Knopf
 *      "andere" fuer Ranked, Reload, Mobile und Arenas.
 *   3. Welche Art? Team-Karte, Standings oder Qual-Linie.
 *
 * Danach geht es in den Baukasten der gewaehlten Art, mit dem Cup schon
 * eingestellt - die Adresse traegt ihn mit, und die Cup-Auswahl dort liest
 * ihn beim Aufgehen.
 */

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number; istFinale: boolean;
}
interface Cup {
  id: string; titel: string;
  regionen?: Record<string, Fenster[]>;
}

interface Wahl {
  eventId: string; windowId: string; region: string; titel: string;
  istFinale: boolean; live: boolean; begin: number; erlaubt: boolean;
  /** Faengt dieser Spieltag heute an? Danach richtet sich die erste Stufe. */
  heute: boolean;
}

/** "läuft", "heute", "morgen", "gestern" - oder das Datum. */
function wann(status: string, begin: number): string {
  if (status === 'live') return 'läuft';
  const tag = new Date(begin); tag.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const abstand = Math.round((tag.getTime() - heute.getTime()) / 86_400_000);
  if (abstand === 0) return 'heute';
  if (abstand === -1) return 'gestern';
  if (abstand === 1) return 'morgen';
  return new Date(begin).toLocaleDateString('de-DE',
    { day: '2-digit', month: '2-digit' });
}

/**
 * Die Startseite einer Overlay-Art.
 *
 * @param onWeiter Wird mit dem gewaehlten Spieltag gerufen, wenn es in den
 *   Baukasten gehen soll. Die Art steht nicht zur Wahl: wer auf der Seite
 *   "Team card" ist, will eine Team-Karte. Der Betreiber: "wenn ich auf Team
 *   cards bin, ist obvious, dass ich Team cards will."
 */
export default function Startansicht({ onWeiter }: {
  onWeiter: (eventId: string, windowId: string) => void;
}) {
  const t = useT();
  const zugang = useZugang();
  /*
   * Ist das ein Manager-Zugang?
   *
   * Dann steht nur zur Wahl, was gerade laeuft oder gleich anfaengt. Alles
   * andere waere waehrend eines Streams ein Fehlgriff mit Folgen: das Overlay
   * zeigte auf einmal ein Turnier von naechster Woche.
   */
  const nurLaufende = Boolean(zugang.verwaltet);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [neu, setNeu] = useState(false);
  /*
   * Wie viel von der Cup-Liste offen ist.
   *
   * 0 - was laeuft, und was heute in Europa ist
   * 1 - dazu alles von heute, aus allen Regionen
   * 2 - dazu alles Uebrige aus dem Zeitraum
   *
   * Der Betreiber wollte nicht scrollen muessen, bis er ganz unten ankommt:
   * "zuerst mal alle live, dann die, wo heute sind, und dann nur Europa. Dann
   * kann man auf show more gehen."
   */
  const [stufe, setStufe] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<Wahl | null>(null);

  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Jedes Fenster als eigene Kachel.
   *
   * Was ueblicherweise gebraucht wird, steht vorn; alles andere erst, wenn
   * "andere" gedrueckt ist. Der Betreiber wollte die Ausnahme ausdruecklich
   * moeglich haben - "falls man mal ausnahmsweise Standings fuer jemand
   * anderen will" -, aber nicht im Weg.
   */
  const alleKacheln = useMemo(() => {
    const { von, bis } = overlayZeitraumWeit();
    const heuteVon = new Date(); heuteVon.setHours(0, 0, 0, 0);
    const heuteBis = new Date(); heuteBis.setHours(23, 59, 59, 999);
    const raus: Wahl[] = [];
    for (const c of cups ?? []) {
      const erlaubt = overlayCupErlaubt(c.titel);
      for (const liste of Object.values(c.regionen ?? {})) {
        for (const w of liste) {
          if (w.begin < von || w.begin > bis) continue;
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region: w.region,
            titel: c.titel, istFinale: w.istFinale, begin: w.begin,
            live: w.status === 'live', erlaubt,
            heute: w.begin >= heuteVon.getTime() && w.begin <= heuteBis.getTime(),
          });
        }
      }
    }
    const jetzt = Date.now();
    return raus.sort((a, b) => Number(b.live) - Number(a.live)
      || Number(b.heute) - Number(a.heute)
      || overlayRegionRang(a.region) - overlayRegionRang(b.region)
      || Number(b.erlaubt) - Number(a.erlaubt)
      || overlayCupRang(a.titel) - overlayCupRang(b.titel)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt));
  }, [cups]);

  /*
   * Was auf dieser Stufe zu sehen ist.
   *
   * Laufendes immer. Danach oeffnet jede Stufe einen Ring weiter, damit die
   * erste Ansicht kurz bleibt: sechs Kacheln statt sechzig.
   */
  const kacheln = useMemo(() => alleKacheln.filter((k) => {
    if (nurLaufende && !managerDarfCup(k.begin, k.region, k.live)) return false;
    if (k.live) return true;
    if (stufe === 0) return k.heute && k.erlaubt && k.region === 'EU';
    if (stufe === 1) return k.heute && k.erlaubt;
    return true;
  }), [alleKacheln, stufe, nurLaufende]);

  const nochDa = alleKacheln.length - kacheln.length;

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------ Schritt 1 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-slate-100">
            <T>Deine Overlays</T>
          </h1>
          {!neu && (
            <button onClick={() => setNeu(true)}
              className="ml-auto rounded-lg bg-sky-500 px-4 py-2 text-sm
                         font-semibold text-white transition hover:bg-sky-400">
              <T>Neues Overlay</T>
            </button>
          )}
        </div>

        {!neu && <MeineOverlays />}
      </section>

      {/* ------------------------------------------------ Schritt 2 */}
      {neu && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]
                           text-slate-400">
              <T>Für welchen Cup?</T>
            </h2>
            {nochDa > 0 && (
              <button onClick={() => setStufe((v) => Math.min(2, v + 1))}
                className="ml-auto text-[11px] text-slate-500 transition
                           hover:text-sky-400">
                <T>mehr anzeigen</T> ({nochDa})
              </button>
            )}
            {stufe > 0 && (
              <button onClick={() => setStufe(0)}
                className={`text-[11px] text-slate-600 transition
                           hover:text-slate-300 ${nochDa > 0 ? '' : 'ml-auto'}`}>
                <T>weniger</T>
              </button>
            )}
          </div>

          {!cups && (
            <p className="text-sm text-slate-600"><T>Wird geladen …</T></p>
          )}
          {nurLaufende && (
            <p className="mb-3 text-[11px] leading-relaxed text-sky-400/80">
              <T>Als Manager wählst du den Spieltag, um den es gerade geht:
              was läuft, was heute schon lief, und was gleich anfängt — in
              Europa ab 15 Minuten vorher, in den anderen Regionen ab zwei
              Stunden vorher.</T>
            </p>
          )}

          {cups && !kacheln.length && nurLaufende && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>Gerade läuft kein Spieltag und keiner fängt gleich an. Sobald
              einer ansteht, erscheint er hier von selbst.</T>
            </p>
          )}
          {cups && !kacheln.length && !nurLaufende && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>Gerade läuft kein Cup. Mit „mehr anzeigen“ siehst du auch die
              übrigen Regionen, die kommenden Tage sowie Ranked, Reload, Mobile
              und Arenas.</T>
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kacheln.map((k) => {
              const ist = gewaehlt?.windowId === k.windowId;
              return (
                <button key={k.windowId} onClick={() => setGewaehlt(k)}
                  className={`rounded-xl border px-4 py-3 text-left transition
                    ${ist
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'}`}>
                  <span className="flex items-center gap-2">
                    {k.live && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    )}
                    <span className="truncate text-sm font-semibold text-slate-100">
                      {k.titel}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {k.region}
                    {k.istFinale ? ` · ${t('Finale')}` : ''}
                    {` · ${t(wann(k.live ? 'live' : '', k.begin))}`}
                    {!k.erlaubt ? ` · ${t('sonstiger Cup')}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/*
        * Weiter oder abbrechen.
        *
        * Links das Zurueck, rechts das Weiter - so wie der Betreiber es
        * beschrieben hat. Die Art steht nicht mehr zur Wahl: sie ergibt sich
        * aus der Seite, auf der man ist.
        */}
      {neu && (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3
                        border-t border-zinc-800 bg-zinc-950/95 px-4 py-3
                        backdrop-blur">
          <button onClick={() => { setNeu(false); setGewaehlt(null); }}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm
                       text-slate-400 transition hover:border-zinc-700
                       hover:text-slate-200">
            <T>Abbrechen</T>
          </button>
          <span className="min-w-0 truncate text-[11px] text-slate-500">
            {gewaehlt ? `${gewaehlt.titel} · ${gewaehlt.region}` : ''}
          </span>
          <button
            onClick={() => gewaehlt && onWeiter(gewaehlt.eventId, gewaehlt.windowId)}
            disabled={!gewaehlt}
            className="ml-auto rounded-lg bg-sky-500 px-5 py-2 text-sm
                       font-semibold text-white transition hover:bg-sky-400
                       disabled:cursor-not-allowed disabled:opacity-40">
            <T>Weiter</T>
          </button>
        </div>
      )}
    </div>
  );
}
