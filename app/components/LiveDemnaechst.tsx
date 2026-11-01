'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die Leiste "Live und demnächst" im Kopf der Startseite.
 *
 * Die Cups kommen aus dem Katalog (/api/cup-catalog, Voreinstellung "aktuell": nur laufend und kommend). Jeder Cup hat je Region eine Liste von
 * Fenstern mit begin/end in Millisekunden. Ob ein Cup laeuft oder wann er beginnt, wird hier aus diesen Zeiten neu abgelesen (wie die Route selbst
 * in zustaendeJetzt), nicht aus dem abgelegten "status" - der Katalog kann einige Minuten alt sein. Schlaegt das Holen fehl oder gibt es nichts,
 * steht gar nichts da: keine leere Leiste, keine Platzhalter.
 */

interface Fenster { begin: number; end?: number | null }
interface Cup {
  id: string;
  titel: string;
  bild?: string;
  regionen?: Record<string, Fenster[]>;
}
interface Eintrag { cup: Cup; live: boolean; start: number | null; regionen: string[] }

function eintragVon(cup: Cup, jetzt: number): Eintrag | null {
  let live = false;
  let start: number | null = null;
  const liveRegionen = new Set<string>();
  const kommtRegionen = new Set<string>();
  for (const [r, liste] of Object.entries(cup.regionen ?? {})) {
    for (const w of liste ?? []) {
      if (typeof w.begin !== 'number') continue;
      if (typeof w.end === 'number' && jetzt >= w.begin && jetzt <= w.end) { live = true; liveRegionen.add(r); }
      else if (jetzt < w.begin) { kommtRegionen.add(r); if (start === null || w.begin < start) start = w.begin; }
    }
  }
  if (!live && start === null) return null;
  // EU zuerst, dann nach Groesse der Szene - nie alphabetisch (Betreiber).
  const reihe = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
  const rang = (r: string) => (reihe.indexOf(r) === -1 ? reihe.length : reihe.indexOf(r));
  return { cup, live, start, regionen: [...(live ? liveRegionen : kommtRegionen)].sort((x, y) => rang(x) - rang(y)) };
}

/**
 * "Beginnt in 3 Tagen" - dieselbe Rechnung und dieselben Worte wie startText auf der Event-Seite (app/events/[id]/page.tsx); der Satz steht mit {n}
 * als Schluessel im Woerterbuch, so wie "vor {n} Minuten" (PowerRankingsTable).
 */
function startText(ms: number, jetzt: number, t: (s: string) => string) {
  const mit = (satz: string, n: number) => t(satz).replace('{n}', String(n));
  const min = Math.max(0, Math.round((ms - jetzt) / 60_000));
  const h = Math.round(min / 60);
  const d = Math.round(h / 24);
  if (min < 60) return mit(min === 1 ? 'Beginnt in {n} Minute' : 'Beginnt in {n} Minuten', min);
  if (h < 48) return mit(h === 1 ? 'Beginnt in {n} Stunde' : 'Beginnt in {n} Stunden', h);
  return mit('Beginnt in {n} Tagen', d);
}

export default function LiveDemnaechst() {
  const t = useT();
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [jetzt, setJetzt] = useState(0);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch('/api/cup-catalog', { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((j: { cups?: Cup[] }) => {
        if (weg) return;
        if (!Array.isArray(j?.cups)) { setFehler(true); return; }
        setFehler(false);
        setCups(j.cups);
        setJetzt(Date.now());
      })
      .catch(() => { if (!weg) setFehler(true); });
    // Der Text zaehlt mit: jede Minute neu ablesen.
    const id = window.setInterval(() => setJetzt(Date.now()), 60_000);
    return () => { weg = true; window.clearInterval(id); };
  }, []);

  if (fehler && !cups) {
    return (
      <div className="mt-6">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Live und demnächst</T></p>
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/85 p-3 text-center text-sm text-slate-400">
          {t('{bereich} ist gerade nicht erreichbar.').replace('{bereich}', t('Live und demnächst'))}
        </p>
      </div>
    );
  }
  if (!cups || !jetzt) return null;
  const eintraege = cups.map((c) => eintragVon(c, jetzt)).filter((e): e is Eintrag => e !== null)
    .sort((a, b) => (a.live === b.live ? (a.start ?? 0) - (b.start ?? 0) : a.live ? -1 : 1))
    .slice(0, 3);
  if (!eintraege.length) return null;

  return (
    <div className="mt-6">
      <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Live und demnächst</T></p>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {eintraege.map(({ cup, live, start, regionen }) => (
          <Link key={cup.id} href={`/events/${encodeURIComponent(cup.id)}`}
            className="flex min-w-[17rem] shrink-0 snap-start items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/85 p-3 text-left backdrop-blur transition hover:border-sky-500/70 sm:min-w-0">
            {cup.bild && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cup.bild} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-bold text-slate-100">{cup.titel}</p>
              {regionen.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-400">{regionen.join(' · ')}</p>}
              {live ? (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /><T>Live</T>
                </span>
              ) : start !== null && (
                <p className="mt-1 text-xs font-semibold text-sky-500">{startText(start, jetzt, t)}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
