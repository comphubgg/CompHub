'use client';

import { useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import Rollzahl from '@/app/components/Rollzahl';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

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
  const halter = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let weg = false;
    fetch('/api/statistik-zahlen', { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json())
      .then((j) => { if (!weg && j?.ok) setZ(j); })
      .catch(() => { /* dann bleiben die Striche */ })
      .finally(() => { if (!weg) setFertig(true); });
    return () => { weg = true; };
  }, []);

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
              <Rollzahl wert={wert} los={sichtbar && fertig} ort={ort} />
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"><T>{titel}</T></p>
          </div>
        ))}
      </div>
      <p className="relative mt-5 text-center text-[10px] text-slate-600">
        <T>Gezählt werden die Spieler im Archiv: ab 10 Matches oder mit Foto.</T>
      </p>
    </div>
  );
}
