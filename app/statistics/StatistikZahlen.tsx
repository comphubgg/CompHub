'use client';

import { useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import Rollzahl from '@/app/components/Rollzahl';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { holeStatistikZahlen } from './statistikZahlenAbruf';

/*
 * Die großen Zahlen oben auf der Statistikseite - rollen beim Erscheinen hoch.
 *
 * Aus /api/statistik-zahlen; fehlt eine, steht an ihrer Stelle ein Strich (eine Null waere eine Behauptung).
 */

interface Zahlen { ok: boolean; spieler: number | null; spieltage: number | null; elims: number | null; schaden: number | null }

export default function StatistikZahlen() {
  const { sprache } = useSprache();
  const [z, setZ] = useState<Zahlen | null>(null);
  const [fertig, setFertig] = useState(false);
  const [sichtbar, setSichtbar] = useState(false);
  /** Die Zahlen waren nicht zu holen: Hinweis statt stiller Striche, neuer Versuch nach zehn Sekunden. */
  const [fehlt, setFehlt] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const halter = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let weg = false;
    let nochmal: ReturnType<typeof setTimeout> | null = null;
    /*
     * Die Spieltage wie auf der Startseite: das Groessere aus dem Szene-Verzeichnis und der Liste "alle Zeit" (dort zaehlen auch Epics
     * Bestenlisten). Vorher stand hier nur das Verzeichnis (982), die Startseite zeigte fuer dasselbe "Spieltage im Archiv" 4.733.
     */
    const alleZeit = fetch('/api/szene-stats?ansicht=jahr&jahr=alle&kurz=1', { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json()).catch(() => null) as Promise<{ success?: boolean; spieltage?: number } | null>;
    holeStatistikZahlen()
      .then(async (j) => {
        if (!j?.ok) throw new Error('keine Zahlen');
        const a = await alleZeit;
        const tage = Math.max(a?.success && typeof a.spieltage === 'number' ? a.spieltage : 0,
          typeof j.spieltage === 'number' ? j.spieltage : 0) || null;
        if (!weg) { setZ({ ...j, spieltage: tage }); setFehlt(false); }
      })
      .catch(() => {
        // Ein Ausfall soll nicht wie "keine Zahlen" aussehen: Hinweis zeigen und gleich noch einmal fragen.
        if (weg) return;
        setFehlt(true);
        nochmal = setTimeout(() => { if (!weg) setVersuch((n) => n + 1); }, 10_000);
      })
      .finally(() => { if (!weg) setFertig(true); });
    return () => { weg = true; if (nochmal) clearTimeout(nochmal); };
  }, [versuch]);

  useEffect(() => {
    const el = halter.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { void Promise.resolve().then(() => setSichtbar(true)); return undefined; }
    const b = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSichtbar(true); b.disconnect(); } });
    b.observe(el);
    return () => b.disconnect();
  }, []);

  const ort = ortVon(sprache);
  const eintraege: Array<[string, number | null]> = [
    ['Spieler', z?.spieler ?? null],
    ['Spieltage', z?.spieltage ?? null],
    ['Eliminierungen', z?.elims ?? null],
    ['Schaden', z?.schaden ?? null],
  ];

  return (
    <div ref={halter} className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] px-4 py-6 shadow-[0_10px_40px_rgba(0,0,0,.3)] backdrop-blur-xl">
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 h-40 w-[520px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[80px]" />
      <div className="relative grid grid-cols-2 gap-y-6 text-center lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]">
        {eintraege.map(([titel, wert]) => (
          <div key={titel} className="px-2">
            <p className="text-3xl font-black text-slate-50 sm:text-4xl 2xl:text-5xl">
              {fertig ? <Rollzahl wert={wert} los={sichtbar} ort={ort} />
                : <span aria-hidden className="mx-auto block h-[1em] w-24 animate-pulse rounded-md bg-white/[0.08]" />}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"><T>{titel}</T></p>
          </div>
        ))}
      </div>
      {fehlt && !z && (
        <p className="relative mt-5 text-center text-xs text-slate-500">
          <T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T>
        </p>
      )}
      <p className="relative mt-5 text-center text-[10px] text-slate-600">
        <T>Gezählt werden die Spieler im Archiv: ab 10 Matches oder mit Foto.</T>
      </p>
    </div>
  );
}
