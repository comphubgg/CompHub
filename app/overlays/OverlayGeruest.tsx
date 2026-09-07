'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';

/*
 * Das gemeinsame Geruest der Overlay-Seiten.
 *
 * Der Betreiber wollte jede Art auf einer eigenen Seite: "das Leaderboard ist
 * eine eigene Page, die Overlays ist eine eigene Page". Was sie teilen, ist
 * die Leiste links und der Kasten rechts, in dem die eigenen Overlays stehen -
 * und der Weg, wie eine Einstellung gespeichert wird.
 *
 * Der Kern ist die Kennung: sie steht in der Adresse, die in OBS liegt, und
 * bleibt dieselbe. Alles andere wandert ueber /api/overlay-config und wird
 * vom Overlay im Takt nachgeholt. Wer hier etwas umstellt, sieht es im Stream,
 * ohne die Browserquelle anzufassen.
 */

export interface OverlayEintrag {
  id: string;
  typ: string;
  name: string;
  stand: number;
  geaendert: string;
  config: Record<string, unknown>;
}

/** Die Arten, die es gibt - dieselbe Reihenfolge wie in der Leiste. */
export const ARTEN: Array<{
  schluessel: string; pfad: string; titel: string; datei: string; was: string;
}> = [
  {
    schluessel: 'teamkarte', pfad: '/overlays/teamkarte', titel: 'Team card',
    datei: 'banner.html',
    was: 'Zwei Spieler nebeneinander, mit Foto und Werten',
  },
  {
    schluessel: 'standings', pfad: '/overlays/standings', titel: 'Standings',
    datei: 'standings.html',
    was: 'Die vordersten Plätze des laufenden Spieltags',
  },
  {
    schluessel: 'qual', pfad: '/overlays/qual', titel: 'Qual line',
    datei: 'qual.html',
    was: 'Wie viele Punkte es zum Weiterkommen braucht',
  },
];

/** Die Adresse, die in OBS gehoert. */
export function overlayAdresse(typ: string, id: string): string {
  const datei = ARTEN.find((a) => a.schluessel === typ)?.datei ?? 'standings.html';
  const basis = typeof window === 'undefined' ? '' : window.location.origin;
  return `${basis}/overlay/${datei}?id=${id}`;
}

/**
 * Die eigenen Overlays laden, anlegen, aendern und entfernen.
 *
 * Alles ueber dieselbe Schnittstelle - die Seiten unterscheiden sich nur in
 * dem, was sie einstellen lassen.
 */
export function useOverlays(typ: string) {
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/overlay-config?meine=1',
        { cache: 'no-store' })).json();
      setListe((j.overlays ?? []).filter((o: OverlayEintrag) => o.typ === typ));
    } catch {
      setListe([]);
    }
  }, [typ]);

  useEffect(() => { void laden(); }, [laden]);

  const speichern = useCallback(async (
    eintrag: { id?: string; name: string; config: Record<string, unknown> },
  ) => {
    setFehler('');
    try {
      const r = await fetch('/api/overlay-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eintrag, typ }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(j?.error ?? 'Could not save'); return null; }
      await laden();
      return j.id as string;
    } catch (e) {
      setFehler((e as Error).message);
      return null;
    }
  }, [typ, laden]);

  const entfernen = useCallback(async (id: string) => {
    await fetch('/api/overlay-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, loeschen: true }),
    }).catch(() => {});
    await laden();
  }, [laden]);

  return { liste, fehler, speichern, entfernen, laden };
}

export default function OverlayGeruest({ aktiv, children }: {
  aktiv: string; children: React.ReactNode;
}) {
  const t = useT();
  const zugang = useZugang();

  if (zugang.laedt) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-500">
        <p className="text-sm"><T>Wird geladen …</T></p>
      </main>
    );
  }

  if (!zugang.vip) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Die Overlays sind Teil des VIP-Zugangs. Er wird vergeben, nicht
            freigeschaltet — mit einem gewöhnlichen Konto sind sie nicht
            zugänglich.</T>
          </p>
          <Link href="/anmelden"
            className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5
                       text-sm font-semibold text-white transition
                       hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 lg:flex-row">

        {/* Die Leiste. Sie steht auf jeder Overlay-Seite gleich. */}
        <aside className="w-full shrink-0 lg:w-56">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase
                        tracking-[0.18em] text-slate-600">
            <T>Overlays</T>
          </p>
          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {ARTEN.map((a) => (
              <Link key={a.schluessel} href={a.pfad}
                title={t(a.was)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  aktiv === a.schluessel
                    ? 'bg-zinc-900 font-semibold text-sky-400'
                    : 'text-slate-400 hover:bg-zinc-900/60 hover:text-slate-200'}`}>
                {a.titel}
              </Link>
            ))}
          </nav>

          <p className="mt-6 px-2 text-[11px] leading-relaxed text-slate-600">
            <T>Die Adresse in OBS bleibt immer dieselbe. Was du hier umstellst,
            ist im Stream nach wenigen Sekunden zu sehen — ohne die
            Browserquelle anzufassen.</T>
          </p>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
