'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import Rollzahl from '@/app/components/Rollzahl';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache, useT } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

/*
 * Der Aufmacher der Statistikseite: ein Slider durch die jüngsten Turniere mit dem Besten des Tages, darunter die
 * Zahl der Spieler je Region.
 *
 * Der Betreiber (12.10.2026): rechts eine Karte wie beim Vorbild - Foto links, daneben Abzeichen, Name, ein Satz und drei
 * Werte -, und "es müssen immer mehrere Spieler sein, auch so Slider, und andere Cups". Darunter die Regionen als
 * einzelne Kästchen mit Farbe oben und daneben ein Text. Den FNCS-Kalender hat er herausnehmen lassen: die Plätze
 * stimmten nicht für jeden Spieler, und eine falsche Zahl ist schlimmer als keine.
 * Aufbau und Bewegung wie dort, die Optik die eigene; alle Zahlen aus dem eigenen Archiv.
 */

export interface AufmacherKachel {
  titel: string;
  datumText: string;
  saisonText: string;
  region: string;
  spitze: { epicId: string; anzeige: string; land?: string | null; bild?: string | null; elims: number; damage: number; quote: number };
  stand?: { platz: number; punkte: number } | null;
}

interface Zahlen { ok: boolean; spieler: number | null; regionen?: Array<{ region: string; n: number }> }

const CSS = `
@keyframes sa-rein { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.sa-glas { border: 1px solid rgba(255,255,255,.09); background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 10px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05); }
@media (prefers-reduced-motion: reduce) { .sa-an { animation: none !important; } }
`;

/** Die Farbe oben auf dem Kästchen - dieselbe je Region wie überall im Werkzeug (lib/regionFarbe). */
const OBEN: Record<string, { rand: string; schrift: string }> = {
  EU: { rand: '#38bdf8', schrift: 'text-sky-300' }, NAC: { rand: '#f43f5e', schrift: 'text-rose-300' },
  NAW: { rand: '#fb923c', schrift: 'text-orange-300' }, BR: { rand: '#34d399', schrift: 'text-emerald-300' },
  OCE: { rand: '#6366f1', schrift: 'text-indigo-300' }, ME: { rand: '#3b82f6', schrift: 'text-blue-300' },
  ASIA: { rand: '#fbbf24', schrift: 'text-amber-300' },
};
const REIHE = ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA'];

/** Wird das Element gesehen? Eine Ref-Funktion: der Beobachter hängt sich erst an, wenn das Element da ist. Nach drei Sekunden gilt es als gesehen. */
function useSichtbar<E extends HTMLElement>(): [(el: E | null) => void, boolean] {
  const [el, setEl] = useState<E | null>(null);
  const [drin, setDrin] = useState(false);
  useEffect(() => {
    if (!el || drin) return undefined;
    const spaet = window.setTimeout(() => setDrin(true), 3000);
    if (typeof IntersectionObserver === 'undefined') { setDrin(true); return () => window.clearTimeout(spaet); }
    const b = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDrin(true); b.disconnect(); } }, { rootMargin: '-40px' });
    b.observe(el);
    return () => { b.disconnect(); window.clearTimeout(spaet); };
  }, [el, drin]);
  return [setEl, drin];
}

export default function StatistikAufmacher({ kacheln, zuTurnieren, zuRegionen, zuSpielern, oeffneSpieler }: {
  kacheln: AufmacherKachel[];
  zuTurnieren: () => void;
  zuRegionen: () => void;
  zuSpielern: () => void;
  oeffneSpieler: (id: string, name: string) => void;
}) {
  const { sprache } = useSprache();
  const t = useT();
  const ort = ortVon(sprache);
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [nr, setNr] = useState(0);
  const [halt, setHalt] = useState(false);
  const [heroRef, heroDrin] = useSichtbar<HTMLDivElement>();
  const [regRef, regDrin] = useSichtbar<HTMLElement>();

  useEffect(() => {
    let weg = false;
    fetch('/api/statistik-zahlen', { signal: AbortSignal.timeout(30_000) }).then((r) => r.json())
      .then((j) => { if (!weg && j?.ok) setZahlen(j); }).catch(() => { /* dann fehlen die Kästchen */ });
    return () => { weg = true; };
  }, []);

  // Alle sieben Sekunden zum nächsten Turnier - solange die Maus nicht darauf liegt.
  useEffect(() => {
    if (kacheln.length < 2 || halt) return undefined;
    const id = window.setInterval(() => setNr((n) => (n + 1) % kacheln.length), 7000);
    return () => window.clearInterval(id);
  }, [kacheln.length, halt]);

  const k = kacheln.length ? kacheln[nr % kacheln.length] : null;
  const regionen = zahlen?.regionen ?? [];
  const nachRegion = new Map(regionen.map((r) => [r.region, r.n]));
  const kaestchen = [
    ...REIHE.filter((r) => nachRegion.has(r)).map((r) => ({ kopf: r, n: nachRegion.get(r) ?? 0, unten: 'Spieler' })),
    ...(zahlen?.spieler != null ? [{ kopf: 'ALL', n: zahlen.spieler, unten: 'Weltweit' }] : []),
  ];

  return (
    <div className="mb-12 mt-10 space-y-14">
      <style>{CSS}</style>

      {/* -------------------------------------------- Slider: Turnier und Bester des Tages */}
      {k && (
        <div ref={heroRef} className="grid items-center gap-8 py-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]"
          onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <div key={`l${nr}`} className="sa-an px-1" style={{ animation: heroDrin ? 'sa-rein .5s cubic-bezier(.2,.8,.2,1) both' : undefined }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {nr === 0 ? <T>Letztes Turnier</T> : <T>Turnier</T>}
            </p>
            <h2 className="mt-2 text-3xl font-black leading-[1.05] tracking-tight text-slate-50 sm:text-4xl">{k.titel}</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              <T>Der Endstand, der Beste des Tages und die Werte jedes Spielers.</T>
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={zuTurnieren}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-sky-100">
                <T>Turnier ansehen</T> →
              </button>
              <button type="button" onClick={zuTurnieren}
                className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-500/50">
                <T>Alle Turniere</T>
              </button>
            </div>
            {kacheln.length > 1 && (
              <div className="mt-6 flex items-center gap-1.5" role="tablist" aria-label="Turniere">
                {kacheln.map((_, i) => (
                  <button key={i} type="button" role="tab" aria-selected={i === nr} onClick={() => setNr(i)}
                    className={`h-1 rounded-full transition-all duration-500 ${i === nr ? 'w-8 bg-slate-100' : 'w-4 bg-white/20 hover:bg-white/40'}`} />
                ))}
              </div>
            )}
          </div>

          <button key={`r${nr}`} type="button" onClick={() => oeffneSpieler(k.spitze.epicId, k.spitze.anzeige)}
            className="sa-an sa-glas group flex min-h-[230px] overflow-hidden rounded-2xl text-left"
            style={{ animation: heroDrin ? 'sa-rein .5s .08s cubic-bezier(.2,.8,.2,1) both' : undefined }}>
            <span className="relative block w-[40%] shrink-0 overflow-hidden">
              {k.spitze.bild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={k.spitze.bild} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  style={{ objectPosition: 'center 20%', WebkitMaskImage: 'linear-gradient(to right, #000 62%, transparent)', maskImage: 'linear-gradient(to right, #000 62%, transparent)' }} />
              ) : (
                <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-950 to-zinc-900 text-6xl font-black text-white/15">{k.spitze.anzeige.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-between p-5">
              <span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-950"><T>Tagesbester</T></span>
                  <span className="rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-300">{k.region}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.saisonText}</span>
                </span>
                <span className="mt-3 flex items-center gap-2.5">
                  <TeamFlagge groesse={22} laender={[k.spitze.land ?? undefined]} />
                  <span className="truncate text-3xl font-black uppercase tracking-wide text-slate-50">{k.spitze.anzeige}</span>
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-slate-400">
                  {t('Meiste Eliminierungen in {region} bei {turnier}, {datum}.')
                    .replace('{region}', k.region).replace('{turnier}', k.titel).replace('{datum}', k.datumText)}
                </span>
              </span>
              <span className="mt-4 grid grid-cols-3 divide-x divide-white/[0.09] border-t border-white/[0.07] pt-3">
                {([['Quote', k.spitze.quote.toFixed(2), 'text-emerald-400'], ['Eliminierungen', k.spitze.elims, 'text-slate-50'], ['Schaden', k.spitze.damage, 'text-slate-50']] as Array<[string, number | string, string]>).map(([l, v, farbe], i) => (
                  <span key={l} className={i === 0 ? 'pr-3' : 'px-3'}>
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{l}</T></span>
                    <span className={`mt-1 block text-xl font-black tabular-nums ${farbe}`}><Rollzahl wert={v} los={heroDrin} ort={ort} /></span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* -------------------------------------------- Regionen */}
      {kaestchen.length > 0 && (
        <section ref={regRef} className="grid items-center gap-10 px-1 py-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {kaestchen.map((c, i) => {
              const farbe = OBEN[c.kopf];
              return (
                <div key={c.kopf} className="sa-an sa-glas rounded-xl px-3 py-3.5 text-center"
                  style={{
                    borderTop: `3px solid ${farbe?.rand ?? '#f1f5f9'}`,
                    animation: regDrin ? `sa-rein .5s ${i * 60}ms cubic-bezier(.2,.8,.2,1) both` : undefined,
                    opacity: regDrin ? undefined : 0,
                  }}>
                  <span className={`text-sm font-black tracking-wider ${farbe?.schrift ?? 'text-slate-50'}`}>{c.kopf}</span>
                  <p className="mt-1.5 text-xl font-black text-slate-50"><Rollzahl wert={c.n} los={regDrin} ort={ort} /></p>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{c.unten}</T></p>
                </div>
              );
            })}
          </div>
          <div className="px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"><T>Regionen und Weltweit</T></p>
            <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl"><T>Sieben Regionen.</T></h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              <T>Alle Spieler aus dem Archiv, nach Heimatregion gezählt: die Besten jeder Region, die Bestenlisten der Saison und eine Liste für alle zusammen.</T>
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={zuRegionen}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-sky-100">
                <T>Regionen ansehen</T> →
              </button>
              <button type="button" onClick={zuSpielern}
                className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-500/50">
                <T>Alle Spieler</T>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
