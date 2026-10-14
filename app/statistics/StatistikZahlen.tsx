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
    <div ref={halter} className="mb-8">
      {/* Vier einzelne Kacheln statt eines Streifens (Betreiber, 14.10.2026): Beschriftung oben, die rollende Zahl darunter. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {eintraege.map(([titel, wert]) => (
          <div key={titel} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{titel}</T></p>
            <p className="schrift-anzeige mt-2 text-3xl font-extrabold tabular-nums text-slate-100 sm:text-4xl">
              <Rollzahl wert={wert} los={sichtbar && fertig} ort={ort} />
            </p>
            <span aria-hidden className="mt-3 block h-1 w-10 rounded-full bg-sky-500" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        <T>Gezählt werden die Spieler im Archiv: ab 10 Matches oder mit Foto.</T>
      </p>
    </div>
  );
}
