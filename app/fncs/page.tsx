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
  return <FncsSeite anfangListe={liste} anfangAlt={alt} />;
}
