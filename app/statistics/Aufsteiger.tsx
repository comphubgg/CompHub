'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { spielerbildKlein } from '@/lib/spielerbildKlein';

/*
 * Die Climbers (Betreiber, 4.11.2026: wer gerade konstant stark wird; 6.11.2026: "die Seite ist mir so simpel"). Verglichen werden die letzten zehn Cups mit den zehn davor, gerechnet
 * in scripts/spieler-kreis.mjs. In der Liste steht nur, wer im letzten Monat gespielt hat und schon jetzt eine gute Note hat - ein einzelner guter Cup reicht nicht.
 * Oben die drei groessten mit grossem Foto, darunter die Liste mit dem Verlauf der letzten zwanzig Cups. "Fallers" ist dieselbe Rechnung andersherum.
 */

interface Zeile {
  epicId: string; name: string; region: string; jetzt: number; vorher: number; delta: number; cups: number;
  /** Die Noten der letzten zwanzig Cups, die aelteste zuerst. Fehlt bei Listen von vor dem 6.11.2026. */
  verlauf?: number[];
  /** Bester Platz der letzten zehn Cups. */
  beste?: number;
}
type Ansicht = 'auf' | 'ab';
type Sortierung = 'sprung' | 'note';
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA'];

/** Die Noten der letzten Cups als kleine Linie. */
function Linie({ werte, breit = 132, hoch = 34 }: { werte: number[]; breit?: number; hoch?: number }) {
  if (werte.length < 2) return null;
  const klein = Math.min(...werte); const gross = Math.max(...werte);
  const spanne = Math.max(gross - klein, 0.05);
  const punkt = (w: number, i: number) => [(i / (werte.length - 1)) * (breit - 6) + 3, hoch - 4 - ((w - klein) / spanne) * (hoch - 8)];
  const pfad = werte.map((w, i) => punkt(w, i).map((v) => v.toFixed(1)).join(',')).join(' ');
  const [ex, ey] = punkt(werte[werte.length - 1], werte.length - 1);
  return (
    <svg viewBox={`0 0 ${breit} ${hoch}`} width={breit} height={hoch} aria-hidden className="shrink-0">
      <polyline points={pfad} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="3" fill="#38bdf8" />
    </svg>
  );
}

function Foto({ bild, name, gross }: { bild?: string | null; name: string; gross?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const rahmen = gross ? 'aspect-square w-full rounded-xl' : 'h-12 w-12 shrink-0 rounded-lg';
  if (!bild || kaputt) {
    return <span className={`${rahmen} flex items-center justify-center bg-zinc-800 font-extrabold text-slate-400 ${gross ? 'text-5xl' : 'text-lg'}`}>{name.slice(0, 1).toUpperCase()}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={bild} alt="" loading="lazy" onError={() => setKaputt(true)} className={`${rahmen} object-cover`} />;
}

export default function Aufsteiger({ aufSpieler }: { aufSpieler: (id: string, name: string) => void }) {
  const t = useT();
  const [listen, setListen] = useState<Record<Ansicht, Zeile[] | null>>({ auf: null, ab: null });
  const [ansicht, setAnsicht] = useState<Ansicht>('auf');
  const [region, setRegion] = useState('EU');
  const [sortierung, setSortierung] = useState<Sortierung>('sprung');
  const [fotos, setFotos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let weg = false;
    const hole = (k: Ansicht, liste: string) => fetch(`/api/spieler-rating?liste=${liste}`).then((r) => r.json())
      .then((j) => { if (!weg) setListen((a) => ({ ...a, [k]: j?.liste ?? [] })); }).catch(() => { if (!weg) setListen((a) => ({ ...a, [k]: [] })); });
    void hole('auf', 'aufsteiger');
    void hole('ab', 'absteiger');
    return () => { weg = true; };
  }, []);

  const liste = listen[ansicht];
  const zeilen = useMemo(() => {
    const auswahl = (liste ?? []).filter((x) => x.region === region && x.name);
    return [...auswahl].sort((a, b) => (sortierung === 'note' ? b.jetzt - a.jetzt : Math.abs(b.delta) - Math.abs(a.delta))).slice(0, 50);
  }, [liste, region, sortierung]);

  // Die Fotos der gezeigten Spieler in einer Abfrage.
  useEffect(() => {
    const namen = zeilen.map((x) => x.name).filter((n) => !(n in fotos));
    if (!namen.length) return undefined;
    let weg = false;
    fetch('/api/spielerbild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen }) })
      .then((r) => r.json() as Promise<{ bilder?: Record<string, string | null> }>)
      .then((j) => {
        if (weg) return;
        const neu: Record<string, string | null> = {};
        for (const n of namen) {
          let datei = (j.bilder?.[n] ?? '').split('?')[0].replace(/^\/spielerbilder\//, '');
          try { datei = decodeURIComponent(datei); } catch { /* bleibt */ }
          neu[n] = datei ? spielerbildKlein(datei) : null;
        }
        setFotos((a) => ({ ...a, ...neu }));
      }).catch(() => {});
    return () => { weg = true; };
  }, [zeilen, fotos]);

  const wert = (x: Zeile) => `${x.delta > 0 ? '+' : ''}${x.delta.toFixed(2)}`;
  const verlaufVon = (x: Zeile) => (x.verlauf?.length ? x.verlauf : [x.vorher, x.jetzt]);
  const spitze = zeilen.slice(0, 3);
  const groesster = zeilen.length ? [...zeilen].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] : null;
  const staerkste = zeilen.length ? [...zeilen].sort((a, b) => b.jetzt - a.jetzt)[0] : null;
  const knopf = (an: boolean) => `rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${an ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100">{ansicht === 'auf' ? <T>Aufsteiger</T> : <T>Absteiger</T>}</h2>
          <p className="mt-0.5 text-sm text-slate-400"><T>Die letzten zehn Cups gegen die zehn davor. Ein einzelner guter Cup reicht nicht.</T></p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAnsicht('auf')} className={knopf(ansicht === 'auf')}><T>Aufsteiger</T></button>
          <button type="button" onClick={() => setAnsicht('ab')} className={knopf(ansicht === 'ab')}><T>Absteiger</T></button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {REGIONEN.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={knopf(region === r)}>{r}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSortierung('sprung')} className={knopf(sortierung === 'sprung')}><T>Größter Sprung</T></button>
          <button type="button" onClick={() => setSortierung('note')} className={knopf(sortierung === 'note')}><T>Höchste Note</T></button>
        </div>
      </div>

      {liste === null ? <p className="py-10 text-center text-sm text-slate-500"><T>Wird geladen …</T></p>
        : !zeilen.length ? <p className="py-10 text-center text-sm text-slate-500">{ansicht === 'auf' ? <T>Noch keine Aufsteiger in dieser Region.</T> : <T>Noch keine Absteiger in dieser Region.</T>}</p>
          : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-xs font-semibold text-slate-400"><T>Spieler in der Liste</T></p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-100">{zeilen.length}</p>
                </div>
                {groesster && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs font-semibold text-slate-400"><T>Größter Sprung</T></p>
                    <p className="mt-1 truncate text-lg font-extrabold text-slate-100">{groesster.name}</p>
                    <p className="text-sm font-bold tabular-nums text-sky-400">{wert(groesster)}</p>
                  </div>
                )}
                {staerkste && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs font-semibold text-slate-400"><T>Stärkste Form</T></p>
                    <p className="mt-1 truncate text-lg font-extrabold text-slate-100">{staerkste.name}</p>
                    <p className="text-sm font-bold tabular-nums text-sky-400">{(staerkste.jetzt * 10).toFixed(1)} / 10</p>
                  </div>
                )}
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {spitze.map((x, i) => (
                  <button key={x.epicId} type="button" onClick={() => aufSpieler(x.epicId, x.name)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-left transition hover:border-sky-500">
                    <Foto bild={fotos[x.name]} name={x.name} gross />
                    <p className="mt-2 truncate text-base font-extrabold text-slate-100"><span className="text-slate-500">{i + 1}.</span> {x.name}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-lg font-extrabold tabular-nums text-sky-400">{wert(x)}</span>
                      <Linie werte={verlaufVon(x)} breit={110} hoch={30} />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-slate-400">{(x.vorher * 10).toFixed(1)} → {(x.jetzt * 10).toFixed(1)} · {x.cups} {t('Cups')}{x.beste ? ` · ${t('Bester Platz')} ${x.beste}` : ''}</p>
                  </button>
                ))}
              </div>

              <ol className="divide-y divide-zinc-800">
                {zeilen.slice(3).map((x, i) => (
                  <li key={x.epicId}>
                    <button type="button" onClick={() => aufSpieler(x.epicId, x.name)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-zinc-800/50">
                      <span className="w-7 shrink-0 text-right text-sm tabular-nums text-slate-500">{i + 4}</span>
                      <Foto bild={fotos[x.name]} name={x.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-slate-100">{x.name}</span>
                        <span className="block text-xs tabular-nums text-slate-500">{x.cups} {t('Cups')}{x.beste ? ` · ${t('Bester Platz')} ${x.beste}` : ''}</span>
                      </span>
                      <span className="hidden sm:block"><Linie werte={verlaufVon(x)} /></span>
                      <span className="hidden text-sm tabular-nums text-slate-400 md:block">{(x.vorher * 10).toFixed(1)} → {(x.jetzt * 10).toFixed(1)}</span>
                      <span className="w-16 text-right text-base font-bold tabular-nums text-sky-400">{wert(x)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
    </section>
  );
}
