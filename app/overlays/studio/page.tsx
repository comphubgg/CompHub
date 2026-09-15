'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import { ARTEN, type OverlayEintrag } from '../OverlayGeruest';

/*
 * Das Studio: ein Stream-Bild, auf dem die Overlays liegen.
 *
 * Der Betreiber wollte die Overlay-Seite "komplett neu": "Es ist wirklich
 * einfach ein OBS von der Ansicht - eine Preview vom Stream. Links oben
 * drei Striche, dann kommt eine Leiste von links: Team Card, Standings, Cup
 * Timer, Offspawn, Custom Text, Qual Line. Dann kann ich einstellen, wo
 * was ist, mehrere Sachen reinziehen, wo meine Cam ist, wo mein Gameplay
 * ist, wo eine Werbung ist. Dann Save, dann sehe ich die Preview."
 *
 * Genau das:
 *
 *   - Die Buehne ist 1920 x 1080, verkleinert auf den Schirm. Alles, was
 *     darauf liegt, wird mit der Maus verschoben und an der Ecke gezogen.
 *   - Aus der Leiste kommen die gespeicherten Overlays jeder Art (dieselben,
 *     die die Einzelseiten anlegen) und drei Platzhalter: Cam, Gameplay,
 *     Werbung. Die Platzhalter sind nur Hilfslinien - in OBS erscheinen sie
 *     nicht, sie zeigen hier, wo etwas frei bleiben muss.
 *   - Ein Klick auf ein Element oeffnet seine Einstellungen (die bekannte
 *     Seite der Art, mit genau diesem Overlay), oder entfernt es.
 *   - "Speichern" legt die Szene ab wie ein Overlay; ihre eine Adresse
 *     gehoert in OBS, und was hier umgestellt wird, ist dort nach wenigen
 *     Sekunden zu sehen.
 */

const BREITE = 1920;
const HOEHE = 1080;

interface Element {
  kennung: string;
  /** Eine Overlay-Art aus ARTEN - oder 'hilfe' fuer Cam, Gameplay, Werbung. */
  art: string;
  /** Das gespeicherte Overlay dieser Art. */
  overlayId?: string;
  name: string;
  x: number; y: number; w: number; h: number;
}

interface Szene { elemente: Element[] }

const PLATZHALTER: Array<{ name: string; w: number; h: number }> = [
  { name: 'Cam', w: 480, h: 270 },
  { name: 'Gameplay', w: 1280, h: 720 },
  { name: 'Werbung', w: 400, h: 120 },
];

/** Die Standardgroesse je Art - so gross, wie das Overlay gebaut ist. */
const GROESSE: Record<string, [number, number]> = {
  teamkarte: [1920, 260], standings: [420, 620], timer: [520, 140],
  offspawn: [900, 200], text: [900, 120], qual: [700, 110],
};

function neueKennung() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Studio() {
  const t = useT();
  const zugang = useZugang();
  const [leiste, setLeiste] = useState(true);
  const [meine, setMeine] = useState<OverlayEintrag[] | null>(null);
  const [szene, setSzene] = useState<Szene>({ elemente: [] });
  const [szeneId, setSzeneId] = useState<string | null>(null);
  const [szeneName, setSzeneName] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [offeneArt, setOffeneArt] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState('');
  const [laedt, setLaedt] = useState(true);
  const buehne = useRef<HTMLDivElement>(null);
  const [massstab, setMassstab] = useState(0.5);

  /* ------------------------------------------------- Meine Overlays und Szenen */
  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/overlay-config?meine=1', { cache: 'no-store' })).json();
      setMeine(j.overlays ?? []);
    } catch { setMeine([]); }
    finally { setLaedt(false); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const szenen = useMemo(() => (meine ?? []).filter((o) => o.typ === 'szene'), [meine]);
  const overlaysDerArt = useCallback((art: string) =>
    (meine ?? []).filter((o) => o.typ === art), [meine]);

  /* ------------------------------------------------- Die Buehne verkleinern */
  useEffect(() => {
    const messen = () => {
      const el = buehne.current?.parentElement;
      if (!el) return;
      const frei = el.clientWidth - 24;
      setMassstab(Math.min(frei / BREITE, (window.innerHeight - 140) / HOEHE));
    };
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [leiste]);

  /* ------------------------------------------------- Elemente */
  const hinzufuegen = (art: string, o?: OverlayEintrag, platzhalter?: { name: string; w: number; h: number }) => {
    const [w, h] = platzhalter ? [platzhalter.w, platzhalter.h] : (GROESSE[art] ?? [600, 200]);
    const n = szene.elemente.length;
    const el: Element = {
      kennung: neueKennung(), art: platzhalter ? 'hilfe' : art,
      overlayId: o?.id, name: platzhalter ? platzhalter.name : (o?.name ?? art),
      x: Math.min(60 + n * 30, BREITE - w), y: Math.min(60 + n * 30, HOEHE - h), w, h,
    };
    setSzene((s) => ({ elemente: [...s.elemente, el] }));
    setGewaehlt(el.kennung);
    setLeiste(false);
  };
  const entfernen = (kennung: string) => {
    setSzene((s) => ({ elemente: s.elemente.filter((e) => e.kennung !== kennung) }));
    setGewaehlt(null);
  };
  const nachVorn = (kennung: string) => {
    setSzene((s) => {
      const e = s.elemente.find((x) => x.kennung === kennung);
      if (!e) return s;
      return { elemente: [...s.elemente.filter((x) => x.kennung !== kennung), e] };
    });
  };

  /* ------------------------------------------------- Ziehen und Groesse */
  const zug = useRef<{ kennung: string; art: 'schieben' | 'ziehen'; x0: number; y0: number;
    start: Element } | null>(null);
  const beginne = (e: React.PointerEvent, el: Element, art: 'schieben' | 'ziehen') => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    zug.current = { kennung: el.kennung, art, x0: e.clientX, y0: e.clientY, start: { ...el } };
    setGewaehlt(el.kennung);
  };
  const bewege = (e: React.PointerEvent) => {
    const z = zug.current;
    if (!z) return;
    const dx = (e.clientX - z.x0) / massstab;
    const dy = (e.clientY - z.y0) / massstab;
    setSzene((s) => ({
      elemente: s.elemente.map((el) => {
        if (el.kennung !== z.kennung) return el;
        if (z.art === 'schieben') {
          return {
            ...el,
            x: Math.round(Math.max(0, Math.min(BREITE - el.w, z.start.x + dx))),
            y: Math.round(Math.max(0, Math.min(HOEHE - el.h, z.start.y + dy))),
          };
        }
        return {
          ...el,
          w: Math.round(Math.max(80, Math.min(BREITE - el.x, z.start.w + dx))),
          h: Math.round(Math.max(40, Math.min(HOEHE - el.y, z.start.h + dy))),
        };
      }),
    }));
  };
  const beende = () => { zug.current = null; };

  /* ------------------------------------------------- Speichern und Laden */
  const speichern = async () => {
    const name = szeneName.trim() || t('Meine Szene');
    setGespeichert('');
    const r = await fetch('/api/overlay-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: szeneId ?? undefined, typ: 'szene', name, config: szene }),
    });
    const j = await r.json();
    if (!r.ok) { setGespeichert(j?.error ?? t('Konnte nicht speichern')); return; }
    setSzeneId(j.id); setSzeneName(name);
    setGespeichert('ok');
    await laden();
  };
  const oeffneSzene = (o: OverlayEintrag) => {
    const cfg = o.config as unknown as Szene;
    setSzene({ elemente: Array.isArray(cfg?.elemente) ? cfg.elemente : [] });
    setSzeneId(o.id); setSzeneName(o.name); setGewaehlt(null); setLeiste(false);
  };
  const neueSzene = () => {
    setSzene({ elemente: [] }); setSzeneId(null); setSzeneName(''); setGewaehlt(null);
  };

  const obsAdresse = szeneId && typeof window !== 'undefined'
    ? `${window.location.origin}/overlay/szene.html?id=${szeneId}` : '';

  const datei = (art: string) => ARTEN.find((a) => a.schluessel === art)?.datei ?? '';
  const seite = (art: string) => ARTEN.find((a) => a.schluessel === art)?.pfad ?? '/overlays';
  const ausgewaehlt = szene.elemente.find((e) => e.kennung === gewaehlt) ?? null;

  if (!zugang.vip) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-16 text-center text-slate-300">
        <p className="text-sm"><T>Die Overlays sind Teil des VIP-Zugangs.</T></p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-zinc-950 text-slate-200"
      onPointerMove={bewege} onPointerUp={beende}>
      {laedt && <LadeSchirm />}

      {/* Kopf: drei Striche, Name, Speichern, Adresse */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-900 px-4 py-2">
        <button onClick={() => setLeiste((l) => !l)} title={t('Overlays')}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-lg
                     border border-zinc-800 transition hover:border-sky-500">
          <span className="h-0.5 w-4 bg-slate-300" /><span className="h-0.5 w-4 bg-slate-300" />
          <span className="h-0.5 w-4 bg-slate-300" />
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <T>Studio</T>
        </span>
        <input value={szeneName} onChange={(e) => setSzeneName(e.target.value)}
          placeholder={t('Name der Szene')}
          className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm
                     text-slate-100 outline-none focus:border-sky-500" />
        <button onClick={speichern}
          className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white
                     transition hover:bg-sky-400">
          <T>Speichern</T>
        </button>
        {gespeichert === 'ok' && <span className="text-xs text-emerald-400"><T>Gespeichert</T></span>}
        {gespeichert && gespeichert !== 'ok' && <span className="text-xs text-rose-400">{gespeichert}</span>}
        {obsAdresse && (
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline"><T>OBS-Adresse</T>:</span>
            <code className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-slate-300">{obsAdresse}</code>
            <button onClick={() => { void navigator.clipboard?.writeText(obsAdresse); }}
              className="rounded border border-zinc-800 px-2 py-1 text-[11px] transition hover:border-sky-500">
              <T>Kopieren</T>
            </button>
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-600">
          {szene.elemente.length} <T>Elemente</T> · {Math.round(massstab * 100)} %
        </span>
      </div>

      <div className="flex">
        {/* Die Leiste von links */}
        <aside className={`shrink-0 overflow-y-auto border-r border-zinc-900 bg-zinc-950 transition-all
                           ${leiste ? 'w-72 px-3 py-3' : 'w-0 overflow-hidden'}`}
          style={{ maxHeight: 'calc(100vh - 56px)' }}>
          {leiste && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <T>Meine Szenen</T>
                </p>
                <button onClick={neueSzene}
                  className="mb-1 w-full rounded-lg border border-dashed border-zinc-700 px-3 py-1.5
                             text-left text-xs text-slate-400 transition hover:border-sky-500">
                  + <T>Neue Szene</T>
                </button>
                {szenen.map((o) => (
                  <button key={o.id} onClick={() => oeffneSzene(o)}
                    className={`block w-full truncate rounded-lg px-3 py-1.5 text-left text-xs transition ${
                      o.id === szeneId ? 'bg-zinc-900 text-sky-400' : 'text-slate-300 hover:bg-zinc-900/60'}`}>
                    {o.name}
                  </button>
                ))}
              </div>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <T>Overlays</T>
                </p>
                {ARTEN.map((a) => {
                  const liste = overlaysDerArt(a.schluessel);
                  const offen = offeneArt === a.schluessel;
                  return (
                    <div key={a.schluessel} className="mb-1">
                      <button onClick={() => setOffeneArt(offen ? null : a.schluessel)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm
                                    transition ${offen ? 'bg-zinc-900 text-sky-400' : 'text-slate-200 hover:bg-zinc-900/60'}`}>
                        <span>{a.titel}</span>
                        <span className="text-[11px] text-slate-600">{liste.length}</span>
                      </button>
                      {offen && (
                        <div className="ml-2 mt-1 space-y-0.5 border-l border-zinc-800 pl-2">
                          {liste.map((o) => (
                            <button key={o.id} onClick={() => hinzufuegen(a.schluessel, o)}
                              className="block w-full truncate rounded px-2 py-1 text-left text-xs
                                         text-slate-300 transition hover:bg-zinc-900 hover:text-sky-400">
                              + {o.name}
                            </button>
                          ))}
                          <Link href={a.pfad} target="_blank"
                            className="block px-2 py-1 text-xs text-slate-500 transition hover:text-sky-400">
                            <T>Neues anlegen</T> ↗
                          </Link>
                          {!liste.length && (
                            <p className="px-2 py-1 text-[11px] text-slate-600">
                              <T>Noch keins gespeichert.</T>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <T>Platzhalter</T>
                </p>
                <p className="mb-1 px-1 text-[11px] leading-snug text-slate-600">
                  <T>Nur hier sichtbar, nicht in OBS: wo Cam, Gameplay und Werbung liegen.</T>
                </p>
                {PLATZHALTER.map((p) => (
                  <button key={p.name} onClick={() => hinzufuegen('hilfe', undefined, p)}
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-slate-300
                               transition hover:bg-zinc-900/60 hover:text-sky-400">
                    + <T>{p.name}</T>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Die Buehne */}
        <div className="min-w-0 flex-1 p-3" onPointerDown={() => setGewaehlt(null)}>
          <div ref={buehne}
            className="relative mx-auto overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
            style={{
              width: BREITE * massstab, height: HOEHE * massstab,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: `${120 * massstab}px ${120 * massstab}px`,
            }}>
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase
                             tracking-[0.2em] text-zinc-700">1920 × 1080</span>

            {szene.elemente.map((el) => {
              const aktiv = el.kennung === gewaehlt;
              return (
                <div key={el.kennung}
                  onPointerDown={(e) => beginne(e, el, 'schieben')}
                  className={`absolute cursor-move select-none rounded-sm ${
                    aktiv ? 'ring-2 ring-sky-500' : 'ring-1 ring-white/10 hover:ring-sky-500/60'}`}
                  style={{ left: el.x * massstab, top: el.y * massstab, width: el.w * massstab, height: el.h * massstab }}>
                  {el.art === 'hilfe' ? (
                    <div className="flex h-full w-full items-center justify-center border border-dashed
                                    border-amber-500/50 bg-amber-500/5 text-xs font-semibold uppercase
                                    tracking-[0.2em] text-amber-400/80">
                      <T>{el.name}</T>
                    </div>
                  ) : (
                    <>
                      {/* Das Overlay selbst, verkleinert - ohne Mauszugriff, sonst laesst es sich nicht ziehen. */}
                      <iframe title={el.name}
                        src={`/overlay/${datei(el.art)}?id=${el.overlayId ?? ''}`}
                        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                        style={{ width: el.w, height: el.h, transform: `scale(${massstab})` }} />
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]
                                       text-slate-300">{el.name}</span>
                    </>
                  )}
                  {aktiv && (
                    <>
                      <div onPointerDown={(e) => beginne(e, el, 'ziehen')}
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm
                                   bg-sky-500" />
                      <div className="absolute -top-8 left-0 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                        {el.art !== 'hilfe' && el.overlayId && (
                          <Link href={`${seite(el.art)}?id=${el.overlayId}`} target="_blank"
                            className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-slate-200 transition hover:text-sky-400">
                            <T>Einstellungen</T> ↗
                          </Link>
                        )}
                        <button onClick={() => nachVorn(el.kennung)}
                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-slate-200 transition hover:text-sky-400">
                          <T>Nach vorn</T>
                        </button>
                        <button onClick={() => entfernen(el.kennung)}
                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-rose-400 transition hover:text-rose-300">
                          <T>Entfernen</T>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {!szene.elemente.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="max-w-md text-center text-sm text-slate-600">
                  <T>Links oben die drei Striche: von dort kommen Team card, Standings, Cup timer, Offspawn, Custom text und Qual line auf das Bild. Ziehen zum Verschieben, die Ecke zum Vergrößern.</T>
                </p>
              </div>
            )}
          </div>

          {ausgewaehlt && (
            <p className="mt-2 text-center text-[11px] tabular-nums text-slate-600">
              {ausgewaehlt.name} · x {ausgewaehlt.x} · y {ausgewaehlt.y} · {ausgewaehlt.w} × {ausgewaehlt.h}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
