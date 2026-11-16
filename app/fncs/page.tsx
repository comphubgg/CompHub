/*
 * FNCS - der Server-Teil der Seite (15.11.2026).
 *
 * Google Search Console meldete /fncs als "Soft 404": die Seite lud alles erst im Browser (fetch auf /api/fncs-ereignisse und /api/fncs-alltime),
 * im Server-HTML standen nur die Ueberschrift und der Ladeschirm. Jetzt holt der Server dieselben Daten - ueber dieselben Handler, also mit
 * derselben Rechnung und demselben Speicher (lib/ueberdauernd: die letzte gute Antwort kommt sofort) - und gibt sie der Seite mit
 * (app/fncs/FncsSeite.tsx). Kommt binnen weniger Sekunden nichts (leerer Speicher nach einem Neustart) oder schlaegt es fehl, zeichnet die
 * Seite wie bisher den Ladeschirm und holt die Daten im Browser.
 */

import FncsSeite, { type AllTime } from './FncsSeite';
import { GET as ereignisseHolen } from '@/app/api/fncs-ereignisse/route';
import { GET as allTimeHolen } from '@/app/api/fncs-alltime/route';
import type { FncsEreignis } from '@/lib/fncsEreignisse';
import { FNCS_FAKTEN, faktDatum } from '@/lib/fncsFakten';
import T from '@/app/components/T';

// Je Aufruf gezeichnet (Sprache aus dem Cookie im Layout); die Daten selbst kommen aus dem Speicher der Handler.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FRIST_MS = 6_000;

async function holen<T>(handler: () => Promise<Response>, nimm: (j: Record<string, unknown>) => T | null): Promise<T | null> {
  try {
    const antwort = await Promise.race([
      handler(),
      new Promise<null>((r) => { setTimeout(() => r(null), FRIST_MS); }),
    ]);
    if (!antwort || !antwort.ok) return null;
    const j = (await antwort.json()) as Record<string, unknown>;
    return j?.ok ? nimm(j) : null;
  } catch {
    return null;
  }
}

export default async function Seite() {
  const [liste, alt] = await Promise.all([
    holen<FncsEreignis[]>(ereignisseHolen, (j) => (Array.isArray(j.ereignisse) ? (j.ereignisse as FncsEreignis[]) : null)),
    holen<AllTime>(allTimeHolen, (j) => j as unknown as AllTime),
  ]);
  return <FncsSeite anfangListe={liste} anfangAlt={alt} ersatz={liste ? null : <Eckdaten />} />;
}

/*
 * Wenn die volle Liste beim Zeichnen nicht rechtzeitig da ist (Backlog C3, 16.11.2026: Search Console meldete /fncs weiter als "Soft 404"): statt
 * des Ladeschirms die Eckdaten aller Endspiele aus lib/fncsFakten - feste, oeffentliche Ergebnisse, also echter Inhalt im Server-HTML, der nie
 * von einem Abruf abhaengt. Kommt die volle Liste im Browser an, tritt sie an diese Stelle.
 */
function Eckdaten() {
  const reihe = Object.values(FNCS_FAKTEN).sort((a, b) => faktDatum(b.datum) - faktDatum(a.datum));
  const datum = (d: string) => new Date(faktDatum(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return (
    <section aria-labelledby="fncs-eckdaten" className="mt-4">
      <h2 id="fncs-eckdaten" className="mb-3 text-sm font-normal text-slate-400"><T>Alle FNCS-Endspiele mit Datum, Ort, Preisgeld und den Siegern.</T></h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reihe.map((f) => {
          const sieger = f.top.find((p) => p.rang === 1);
          return (
            <li key={`${f.nr}-${f.datum}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-400">{f.kopf2}</p>
              <h3 className="mt-0.5 text-lg font-extrabold text-slate-100">{f.titel}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {datum(f.datum)}{f.ort ? ` · ${f.ort}` : ''}{f.lan ? ' · LAN' : ''}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500"><T>Preisgeld</T></dt><dd className="font-bold tabular-nums text-slate-100">{f.preisgeld}</dd></div>
                <div><dt className="text-slate-500"><T>Teams</T></dt><dd className="font-bold tabular-nums text-slate-100">{f.teams}</dd></div>
              </dl>
              {sieger && (
                <p className="mt-3 border-t border-zinc-800 pt-2 text-xs text-slate-300">
                  <span className="text-slate-500"><T>Sieger</T>:</span> {sieger.spieler.join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
