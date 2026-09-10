'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import MeineOverlays from './MeineOverlays';
import { ARTEN } from './OverlayGeruest';
import {
  overlayCupErlaubt, overlayCupRang, overlayRegionRang, overlayZeitraumWeit,
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

export default function Startansicht() {
  const t = useT();
  const router = useRouter();
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [neu, setNeu] = useState(false);
  const [alle, setAlle] = useState(false);
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
  const kacheln = useMemo(() => {
    const { von, bis } = overlayZeitraumWeit();
    const raus: Wahl[] = [];
    for (const c of cups ?? []) {
      const erlaubt = overlayCupErlaubt(c.titel);
      if (!alle && !erlaubt) continue;
      for (const liste of Object.values(c.regionen ?? {})) {
        for (const w of liste) {
          if (w.begin < von || w.begin > bis) continue;
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region: w.region,
            titel: c.titel, istFinale: w.istFinale, begin: w.begin,
            live: w.status === 'live', erlaubt,
          });
        }
      }
    }
    const jetzt = Date.now();
    return raus.sort((a, b) => Number(b.live) - Number(a.live)
      || Number(b.erlaubt) - Number(a.erlaubt)
      || overlayCupRang(a.titel) - overlayCupRang(b.titel)
      || overlayRegionRang(a.region) - overlayRegionRang(b.region)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt));
  }, [cups, alle]);

  function los(art: string) {
    if (!gewaehlt) return;
    const p = new URLSearchParams({
      event: gewaehlt.eventId, fenster: gewaehlt.windowId, bauen: '1',
    });
    router.push(`/overlays/${art}?${p.toString()}`);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------ Schritt 1 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-slate-100">
            <T>Deine Overlays</T>
          </h1>
          <button onClick={() => { setNeu((v) => !v); setGewaehlt(null); }}
            className="ml-auto rounded-lg bg-sky-500 px-4 py-2 text-sm
                       font-semibold text-white transition hover:bg-sky-400">
            {neu ? <T>Abbrechen</T> : <T>Neues Overlay</T>}
          </button>
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
            <button onClick={() => setAlle((v) => !v)}
              className="ml-auto text-[11px] text-slate-500 transition
                         hover:text-sky-400">
              {alle ? <T>nur die üblichen</T> : <T>andere Cups anzeigen</T>}
            </button>
          </div>

          {!cups && (
            <p className="text-sm text-slate-600"><T>Wird geladen …</T></p>
          )}
          {cups && !kacheln.length && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>In diesen Tagen läuft kein passender Cup. Mit „andere Cups
              anzeigen“ siehst du auch Ranked, Reload, Mobile und Arenas.</T>
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

      {/* ------------------------------------------------ Schritt 3 */}
      {neu && gewaehlt && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em]
                         text-slate-400">
            <T>Welche Art?</T>
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {ARTEN.map((a) => (
              <button key={a.schluessel} onClick={() => los(a.schluessel)}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40
                           px-4 py-3 text-left transition hover:border-sky-500">
                <span className="block text-sm font-semibold text-slate-100">
                  {a.titel}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed
                                 text-slate-500">
                  <T>{a.was}</T>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
