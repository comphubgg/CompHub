'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { HINWEISE, SEKTIONEN, type Staende, type Zustand } from '@/lib/sektionen';

/*
 * Die Bereiche schalten.
 *
 * Sieben Zeilen, je eine Ampel. Der Betreiber wollte einen Bereich zumachen
 * koennen, ohne ihn auszubauen - etwa um in Ruhe daran weiterzuarbeiten,
 * waehrend niemand sonst ihn sieht.
 *
 *   online   - alles wie immer
 *   standby  - sichtbar, aber gesperrt; dahinter steht ein Hinweis
 *   offline  - fuer alle ausser ihm verschwunden, auch aus der Kopfzeile
 *
 * Fuer ihn selbst aendert sich nie etwas. Deshalb steht neben jeder Zeile,
 * was die anderen sehen - sonst vergisst man, dass ein Bereich noch zu ist,
 * weil er einem selbst ja offensteht.
 */

const ZUSTAENDE: Array<{ wert: Zustand; punkt: string; titel: string; was: string }> = [
  { wert: 'online', punkt: 'bg-emerald-500', titel: 'Online',
    was: 'für alle sichtbar und nutzbar' },
  { wert: 'standby', punkt: 'bg-amber-400', titel: 'Standby',
    was: 'sichtbar, aber gesperrt — mit Hinweis' },
  { wert: 'offline', punkt: 'bg-rose-500', titel: 'Offline',
    was: 'für alle außer dir ausgeblendet' },
];

export default function SektionenSeite() {
  const t = useT();
  const [staende, setStaende] = useState<Staende>({});
  const [erlaubt, setErlaubt] = useState(true);
  const [laedt, setLaedt] = useState(true);
  const [stand, setStand] = useState('');
  /** Welche Zeile gerade aufgeklappt ist - der Text gehoert nicht dauernd hin. */
  const [offen, setOffen] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const j = await (await fetch('/api/sektionen', { cache: 'no-store' })).json();
      if (!j?.admin) { setErlaubt(false); return; }
      setStaende(j.staende ?? {});
    } catch { setErlaubt(false); }
    finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    let weg = false;
    void Promise.resolve().then(() => { if (!weg) return holen(); });
    return () => { weg = true; };
  }, [holen]);

  async function setzen(schluessel: string, aenderung: Partial<{
    zustand: Zustand; hinweis: string; eigenerTitel: string; eigenerText: string;
  }>) {
    const jetzt = staende[schluessel];
    setStand(t('speichert …'));
    try {
      const r = await fetch('/api/sektionen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schluessel,
          zustand: aenderung.zustand ?? jetzt?.zustand ?? 'online',
          ...aenderung,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setStand(j?.fehler ?? t('nicht gespeichert')); return; }
      setStaende(j.staende ?? staende);
      setStand(t('gespeichert'));
      setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  if (laedt) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-sm text-slate-500">
        <T>Wird geladen …</T>
      </main>
    );
  }

  if (!erlaubt) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6
                      text-sm text-slate-400">
          <T>Diese Seite ist dem Admin vorbehalten.</T>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-slate-100"><T>Sections</T></h1>
        <span className="text-xs text-slate-600">
          {SEKTIONEN.length} <T>Bereiche</T>
        </span>
        <Link href="/admin" className="ml-auto text-xs text-slate-500 transition
                                       hover:text-sky-400">
          ← <T>zum Verwaltungsbereich</T>
        </Link>
      </div>

      <p className="mb-6 text-[11px] leading-relaxed text-slate-600">
        <T>Du selbst kommst in jeden Bereich, egal was hier steht — auch in
        einen, der auf Offline steht. Genau dafür ist es gedacht: in Ruhe
        weiterbauen, während ihn sonst niemand sieht.</T>
      </p>

      <div className="space-y-3">
        {SEKTIONEN.map((s) => {
          const e = staende[s.schluessel] ?? { zustand: 'online' as Zustand,
            hinweis: 'ueberarbeitung' };
          const z = ZUSTAENDE.find((x) => x.wert === e.zustand) ?? ZUSTAENDE[0];
          const aufgeklappt = offen === s.schluessel;

          return (
            <div key={s.schluessel}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${z.punkt}`} />
                <span className="text-sm font-semibold text-slate-100">
                  <T>{s.titel}</T>
                </span>
                <code className="font-mono text-[10px] text-slate-700">
                  {s.pfad}
                </code>

                <span className="ml-auto flex flex-wrap items-center gap-1
                                 rounded-lg border border-zinc-800 p-1">
                  {ZUSTAENDE.map((x) => (
                    <button key={x.wert}
                      onClick={() => setzen(s.schluessel, { zustand: x.wert })}
                      title={t(x.was)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5
                                  text-xs font-semibold transition ${
                        e.zustand === x.wert
                          ? 'bg-zinc-800 text-slate-100'
                          : 'text-slate-500 hover:text-slate-300'}`}>
                      <span aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${x.punkt}`} />
                      <T>{x.titel}</T>
                    </button>
                  ))}
                </span>
              </div>

              <p className="mt-2 text-[11px] text-slate-600">
                <T>{z.was}</T>
              </p>

              {/*
                * Der Text erscheint nur, wenn er gebraucht wird.
                *
                * Bei Online gibt es nichts zu schreiben, und bei Offline
                * steht ohnehin ein fester Satz - dort ist der Bereich fuer
                * die anderen gar nicht da.
                */}
              {e.zustand === 'standby' && (
                <div className="mt-4 border-t border-zinc-800/70 pt-4">
                  <button onClick={() => setOffen(aufgeklappt ? null : s.schluessel)}
                    className="mb-3 flex w-full items-center gap-2 text-left">
                    <span className="text-[10px] font-semibold uppercase
                                     tracking-[0.16em] text-slate-500">
                      <T>Was auf der Sperrseite steht</T>
                    </span>
                    <span className="ml-auto text-slate-600">
                      {aufgeklappt ? '−' : '+'}
                    </span>
                  </button>

                  {aufgeklappt && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {HINWEISE.map((h) => (
                          <button key={h.schluessel}
                            onClick={() => setzen(s.schluessel, {
                              zustand: 'standby', hinweis: h.schluessel,
                            })}
                            className={`rounded-lg border p-3 text-left transition ${
                              e.hinweis === h.schluessel
                                ? 'border-sky-500 bg-sky-500/10'
                                : 'border-zinc-800 hover:border-zinc-700'}`}>
                            <span className="block text-xs font-semibold
                                             text-slate-100">
                              <T>{h.name}</T>
                            </span>
                            <span className="mt-1 block text-[11px] leading-snug
                                             text-slate-500">
                              {t(h.titel).replace('{bereich}', t(s.titel))}
                            </span>
                          </button>
                        ))}
                      </div>

                      <p className="mt-4 mb-2 text-[10px] font-semibold uppercase
                                    tracking-[0.16em] text-slate-600">
                        <T>oder ein eigener Text</T>
                      </p>
                      <input defaultValue={e.eigenerTitel ?? ''}
                        onBlur={(ev) => setzen(s.schluessel, {
                          zustand: 'standby', eigenerTitel: ev.target.value,
                        })}
                        placeholder={t('Überschrift — leer lassen für die Auswahl oben')}
                        className={`${feld} mb-2`} />
                      <textarea defaultValue={e.eigenerText ?? ''} rows={3}
                        onBlur={(ev) => setzen(s.schluessel, {
                          zustand: 'standby', eigenerText: ev.target.value,
                        })}
                        placeholder={t('Text darunter — leer lassen für die Auswahl oben')}
                        className={`${feld} resize-y`} />

                      <Link href={s.pfad} target="_blank"
                        className="mt-3 inline-block text-[11px] text-slate-500
                                   transition hover:text-sky-400">
                        <T>Sperrseite ansehen</T> →
                      </Link>
                      <p className="mt-1 text-[10px] text-slate-700">
                        <T>Als Admin siehst du dort den Bereich selbst — die
                        Sperrseite zeigt sich nur den anderen.</T>
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stand && <p className="mt-6 text-xs text-slate-500">{stand}</p>}
    </main>
  );
}
