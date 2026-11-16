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

/** Der Formverlauf gross, als Flaeche mit Verlauf - das Bild der Top-3-Karten. */
function Flaeche({ werte, ab }: { werte: number[]; ab?: boolean }) {
  const breit = 400; const hoch = 120;
  if (werte.length < 2) return null;
  const klein = Math.min(...werte); const gross = Math.max(...werte);
  const spanne = Math.max(gross - klein, 0.05);
  const pt = werte.map((w, i) => [(i / (werte.length - 1)) * breit, hoch - 10 - ((w - klein) / spanne) * (hoch - 28)]);
  const linie = pt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const farbe = ab ? '#fb7185' : '#38bdf8';
  const id = `fl-${ab ? 'ab' : 'auf'}`;
  const [ex, ey] = pt[pt.length - 1];
  return (
    <svg viewBox={`0 0 ${breit} ${hoch}`} preserveAspectRatio="none" className="block h-32 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={farbe} stopOpacity=".35" />
          <stop offset="1" stopColor={farbe} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${hoch} ${linie} ${breit},${hoch}`} fill={`url(#${id})`} />
      <polyline points={linie} fill="none" stroke={farbe} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex - 4} cy={ey} r="4" fill={farbe} />
    </svg>
  );
}

function Foto({ bild, name, gross }: { bild?: string | null; name: string; gross?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  /*
   * Mit und ohne Foto genau gleich gross (Backlog C2, 16.11.2026): vorher war die grosse Kachel mit Foto ein Quadrat und ohne Foto nur 6rem hoch, die drei
   * Karten nebeneinander standen dann ungleich. Jetzt ein festes 4:3 fuer beide - flacher als das Quadrat, also auch ohne Foto kein riesiger leerer Kasten.
   */
  const rahmen = gross ? 'aspect-[4/3] w-full rounded-xl' : 'h-12 w-12 shrink-0 rounded-lg';
  if (!bild || kaputt) {
    return <span className={`${rahmen} flex items-center justify-center bg-zinc-800 font-extrabold text-slate-400 ${gross ? 'text-4xl' : 'text-lg'}`}>{name.slice(0, 1).toUpperCase()}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={bild} alt="" loading="lazy" onError={() => setKaputt(true)} className={`${rahmen} block object-cover object-top`} />;
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
  const knopf = (an: boolean) => `rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${an ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`;

  /** Die Note (0-10) als Balken: hell der alte Stand, kraeftig der neue - so sieht man den Sprung, ohne zu rechnen. */
  const Balken = ({ x }: { x: Zeile }) => {
    const a = Math.max(0, Math.min(1, x.vorher)) * 100; const b = Math.max(0, Math.min(1, x.jetzt)) * 100;
    const auf = b >= a;
    return (
      <span className="relative block h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <span className="absolute inset-y-0 left-0 rounded-full bg-slate-600/60" style={{ width: `${Math.max(a, b)}%` }} />
        <span className={`absolute inset-y-0 left-0 rounded-full ${auf ? 'bg-gradient-to-r from-sky-600 to-sky-400' : 'bg-gradient-to-r from-rose-700 to-rose-500'}`} style={{ width: `${auf ? b : b}%` }} />
      </span>
    );
  };
  const farbe = ansicht === 'auf' ? 'text-sky-400' : 'text-rose-400';

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
      {/* Kopf: links Titel, rechts alle Schalter in einer Reihe (2.0: die drei Zahlenkacheln darunter wiederholten nur Platz 1). */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-500">Form</p>
          <h2 className="schrift-anzeige mt-1 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">{ansicht === 'auf' ? <T>Aufsteiger</T> : <T>Absteiger</T>}</h2>
          <p className="mt-1 text-sm text-slate-400"><T>Die letzten zehn Cups gegen die zehn davor. Ein einzelner guter Cup reicht nicht.</T></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/60 p-1">
            {(['auf', 'ab'] as Ansicht[]).map((a) => (
              <button key={a} type="button" onClick={() => setAnsicht(a)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${ansicht === a ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {a === 'auf' ? <T>Aufsteiger</T> : <T>Absteiger</T>}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/60 p-1">
            {(['sprung', 'note'] as Sortierung[]).map((a) => (
              <button key={a} type="button" onClick={() => setSortierung(a)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${sortierung === a ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {a === 'sprung' ? <T>Größter Sprung</T> : <T>Höchste Note</T>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {REGIONEN.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={knopf(region === r)}>{r}</button>)}
      </div>

      {liste === null ? <p className="py-10 text-center text-sm text-slate-500"><T>Wird geladen …</T></p>
        : !zeilen.length ? <p className="py-10 text-center text-sm text-slate-500">{ansicht === 'auf' ? <T>Noch keine Aufsteiger in dieser Region.</T> : <T>Noch keine Absteiger in dieser Region.</T>}</p>
          : (
            <>
              {/* Die drei groessten: der Formverlauf ist das Bild - mit Foto daneben, ohne Foto bleibt die Kurve allein und nichts steht leer. */}
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {spitze.map((x, i) => (
                  <button key={x.epicId} type="button" onClick={() => aufSpieler(x.epicId, x.name)}
                    className={`group relative overflow-hidden rounded-2xl border bg-zinc-950/70 text-left transition hover:-translate-y-0.5 hover:border-sky-500/70 ${i === 0 ? 'border-sky-500/40 shadow-[0_0_40px_rgba(14,165,233,.12)]' : 'border-zinc-800'}`}>
                    <div className="relative h-40">
                      <span aria-hidden className="schrift-anzeige absolute -right-2 -top-6 text-[8rem] font-black leading-none text-white/[0.04]">{i + 1}</span>
                      <div className="absolute inset-x-0 bottom-0 px-1"><Flaeche werte={verlaufVon(x)} ab={ansicht === 'ab'} /></div>
                      <span className="absolute left-4 top-4 rounded-full border border-white/10 bg-zinc-900/80 px-2.5 py-0.5 text-xs font-bold text-slate-300 backdrop-blur">#{i + 1}</span>
                    </div>
                    <div className="flex items-center gap-3 border-t border-zinc-800/80 p-4">
                      <Foto bild={fotos[x.name]} name={x.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold text-slate-100">{x.name}</p>
                        <p className="text-xs tabular-nums text-slate-500">{x.cups} {t('Cups')}{x.beste ? ` · ${t('Bester Platz')} ${x.beste}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black tabular-nums ${farbe}`}>{wert(x)}</p>
                        <p className="text-xs tabular-nums text-slate-400">{(x.vorher * 10).toFixed(1)} → <span className="font-bold text-slate-200">{(x.jetzt * 10).toFixed(1)}</span></p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-zinc-800">
                <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_9rem_12rem_4.5rem] items-center gap-4 bg-zinc-950/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 md:grid">
                  <span>#</span><span><T>Spieler</T></span><span><T>Verlauf</T></span><span><T>Note</T></span><span className="text-right"><T>Sprung</T></span>
                </div>
                <ol className="divide-y divide-zinc-800/80">
                  {zeilen.slice(3).map((x, i) => (
                    <li key={x.epicId}>
                      <button type="button" onClick={() => aufSpieler(x.epicId, x.name)}
                        className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-4 px-4 py-2.5 text-left transition hover:bg-zinc-800/40 md:grid-cols-[2.5rem_minmax(0,1fr)_9rem_12rem_4.5rem]">
                        <span className="text-sm font-bold tabular-nums text-slate-500">{i + 4}</span>
                        <span className="flex min-w-0 items-center gap-3">
                          <Foto bild={fotos[x.name]} name={x.name} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-100">{x.name}</span>
                            <span className="block text-xs tabular-nums text-slate-500">{x.cups} {t('Cups')}{x.beste ? ` · ${t('Bester Platz')} ${x.beste}` : ''}</span>
                          </span>
                        </span>
                        <span className="hidden md:block"><Linie werte={verlaufVon(x)} breit={140} hoch={30} /></span>
                        <span className="hidden md:block">
                          <Balken x={x} />
                          <span className="mt-1 block text-[11px] tabular-nums text-slate-500">{(x.vorher * 10).toFixed(1)} → <span className="font-semibold text-slate-300">{(x.jetzt * 10).toFixed(1)}</span></span>
                        </span>
                        <span className={`text-right text-base font-extrabold tabular-nums ${farbe}`}>{wert(x)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
    </section>
  );
}
