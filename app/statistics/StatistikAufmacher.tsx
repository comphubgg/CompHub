'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import Rollzahl from '@/app/components/Rollzahl';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { regionFarbe } from '@/lib/regionFarbe';

/*
 * Der Aufmacher der Statistikseite: das letzte Turnier mit seinem Tagesbesten, darunter der FNCS-Kalender und die Zahl
 * der Spieler je Region.
 *
 * Der Betreiber (12.10.2026): "dieses Last Tournament kannst du rauslöschen und so machen wie bei Dings" - links der Titel
 * des Turniers mit dem Weg zur Seite, rechts der Beste des Tages; darunter "so eine Art Kalender": jeder FNCS seit Chapter 5
 * Season 3, welchen Platz jemand belegt hat - mit anderen Spielern als beim Vorbild; dann "wie viele Spieler von welcher
 * Region". Aufbau und Bewegung wie dort, die Optik die eigene; alle Zahlen aus dem eigenen Archiv.
 */

interface KachelDaten {
  turnier: { name: string; datum?: number | null; region: string };
  spitze: { epicId: string; anzeige: string; gepflegt?: boolean; land?: string | null; bild?: string | null; elims: number; damage: number; quote: number; hits?: number; builds?: number };
  stand?: { platz: number; punkte: number } | null;
}

interface Kalender { ok: boolean; spalten: string[]; zeilen: Array<{ id: string; name: string; land: string | null; bild: string | null; zellen: Array<number | null> }> }
interface Zahlen { ok: boolean; spieler: number | null; regionen?: Array<{ region: string; n: number }> }

const CSS = `
@keyframes sa-rein { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.sa-glas { border: 1px solid rgba(255,255,255,.09); background: linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 10px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05); }
@media (prefers-reduced-motion: reduce) { .sa-an { animation: none !important; } }
`;

/**
 * Wird das Element gesehen? Gibt eine Ref-Funktion zurueck: sie haengt den Beobachter erst an, wenn das Element
 * wirklich da ist (die Kacheln erscheinen erst, wenn ihre Daten geladen sind). Nach drei Sekunden gilt es als gesehen,
 * damit nichts unsichtbar bleibt.
 */
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

const platzFarbe = (p: number | null) => {
  if (p === null) return 'text-slate-700';
  if (p === 0) return 'text-slate-600';
  if (p === 1) return 'font-black text-amber-300';
  if (p <= 3) return 'font-bold text-sky-300';
  if (p <= 10) return 'font-semibold text-slate-200';
  return 'text-slate-500';
};

export default function StatistikAufmacher({ kachel, titel, meta, zuTurnieren, oeffneSpieler }: {
  kachel: KachelDaten | null;
  titel: string;
  meta: string[];
  zuTurnieren: () => void;
  oeffneSpieler: (id: string, name: string) => void;
}) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [kal, setKal] = useState<Kalender | null>(null);
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [kalFertig, setKalFertig] = useState(false);
  const [heroRef, heroDrin] = useSichtbar<HTMLDivElement>();
  const [kalRef, kalDrin] = useSichtbar<HTMLDivElement>();
  const [regRef, regDrin] = useSichtbar<HTMLDivElement>();

  useEffect(() => {
    let weg = false;
    fetch('/api/fncs-kalender', { signal: AbortSignal.timeout(30_000) }).then((r) => r.json())
      .then((j) => { if (!weg && j?.ok) setKal(j); }).catch(() => { /* dann fehlt der Kalender */ })
      .finally(() => { if (!weg) setKalFertig(true); });
    fetch('/api/statistik-zahlen', { signal: AbortSignal.timeout(30_000) }).then((r) => r.json())
      .then((j) => { if (!weg && j?.ok) setZahlen(j); }).catch(() => { /* dann fehlt die Liste */ });
    return () => { weg = true; };
  }, []);

  const k = kachel;
  const gross = (s: string) => s.toUpperCase();

  return (
    <div className="mb-8 space-y-6">
      <style>{CSS}</style>

      {/* ------------------------------------------------ Das letzte Turnier */}
      {k && (
        <div ref={heroRef} className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="sa-glas sa-an flex flex-col justify-between rounded-3xl p-6 sm:p-8" style={{ animation: heroDrin ? 'sa-rein .6s cubic-bezier(.2,.8,.2,1) both' : undefined }}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"><T>Letztes Turnier</T></p>
              <h2 className="mt-3 text-4xl font-black leading-[1.02] tracking-tight text-slate-50 sm:text-6xl">{titel}</h2>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {meta.filter(Boolean).map((m) => (
                  <span key={m} className="rounded border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">{m}</span>
                ))}
                {k.stand && <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300"><T>Sein Team</T>: {k.stand.platz}. · {k.stand.punkte} Pts</span>}
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">
                <T>Der jüngste Spieltag im Archiv: der Endstand, der Beste des Tages und die Werte jedes Spielers.</T>
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={zuTurnieren}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-sky-100">
                <T>Turnier ansehen</T> →
              </button>
              <button type="button" onClick={zuTurnieren} className="text-sm font-semibold text-slate-400 transition hover:text-sky-400">
                <T>Alle Turniere</T>
              </button>
            </div>
          </div>

          <button type="button" onClick={() => oeffneSpieler(k.spitze.epicId, k.spitze.anzeige)}
            className="sa-an group relative min-h-[380px] overflow-hidden rounded-3xl border border-white/[0.09] bg-zinc-900 text-left"
            style={{ animation: heroDrin ? 'sa-rein .6s .12s cubic-bezier(.2,.8,.2,1) both' : undefined }}>
            {k.spitze.bild ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={k.spitze.bild} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" style={{ objectPosition: 'center 22%' }} />
            ) : <span className="absolute inset-0 bg-gradient-to-br from-sky-950 to-zinc-900" />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
            <span className="absolute left-4 top-4 flex items-center gap-2">
              <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-950"><T>Tagesbester</T></span>
              <span className="rounded border border-white/25 bg-black/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white backdrop-blur-sm">{k.turnier.region}</span>
            </span>
            <span className="absolute inset-x-0 bottom-0 p-5">
              <span className="flex items-center gap-3">
                <TeamFlagge groesse={24} laender={[k.spitze.land ?? undefined]} />
                <span className="text-3xl font-black tracking-wide text-white sm:text-4xl">{gross(k.spitze.anzeige)}</span>
              </span>
              <span className="mt-1 block text-xs text-slate-300"><T>Die meisten Eliminierungen dieses Spieltags.</T></span>
              <span className="mt-4 grid grid-cols-3 gap-2">
                {([['Eliminierungen', k.spitze.elims], ['Schaden', k.spitze.damage], ['Quote', k.spitze.quote.toFixed(2)]] as Array<[string, number | string]>).map(([l, v]) => (
                  <span key={l} className="rounded-xl border border-white/15 bg-black/45 px-3 py-2.5 backdrop-blur-sm">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400"><T>{l}</T></span>
                    <span className="mt-0.5 block text-xl font-black tabular-nums text-white sm:text-2xl"><Rollzahl wert={v} los={heroDrin} ort={ort} /></span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- FNCS-Kalender */}
      <section ref={kalRef} className="sa-glas rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">FNCS</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-50 sm:text-2xl"><T>Platz in jedem FNCS-Finale</T></h3>
          </div>
          <p className="text-[11px] text-slate-500"><T>seit Chapter 5 Season 3 · – = nicht qualifiziert</T></p>
        </div>
        {!kal ? (
          <p className="py-6 text-center text-xs text-slate-600">{kalFertig ? <T>Gerade nicht erreichbar.</T> : <T>Wird geladen …</T>}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <th className="sticky left-0 bg-zinc-950/90 py-2 pr-4 text-left"><T>Spieler</T></th>
                  {kal.spalten.map((s) => <th key={s} className="px-2 py-2 text-center">{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {kal.zeilen.map((z, i) => (
                  <tr key={z.id} className="sa-an border-t border-white/[0.06] transition hover:bg-sky-500/[0.05]"
                    style={{ animation: kalDrin ? `sa-rein .5s ${i * 70}ms cubic-bezier(.2,.8,.2,1) both` : undefined, opacity: kalDrin ? undefined : 0 }}>
                    <td className="sticky left-0 bg-zinc-950/90 py-2 pr-4">
                      <button type="button" onClick={() => oeffneSpieler(z.id, z.name)} className="flex items-center gap-2 text-left transition hover:text-sky-300">
                        {z.bild
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={z.bild} alt="" loading="lazy" className="h-7 w-7 rounded-full border border-white/15 object-cover object-top" />
                          : <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-[10px] font-bold text-slate-500">{z.name.slice(0, 1).toUpperCase()}</span>}
                        <TeamFlagge groesse={13} laender={[z.land ?? undefined]} />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-100">{z.name}</span>
                      </button>
                    </td>
                    {z.zellen.map((p, k2) => (
                      <td key={k2} className={`px-2 py-2 text-center tabular-nums ${platzFarbe(p)}`}>{p === null || p === 0 ? '–' : p}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- Regionen */}
      {zahlen?.regionen && zahlen.regionen.length > 0 && (
        <section ref={regRef} className="sa-glas rounded-3xl p-5 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"><T>Regionen</T></p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-50 sm:text-2xl"><T>Spieler je Region</T></h3>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {zahlen.regionen.map((r, i) => (
              <div key={r.region} className="sa-an rounded-2xl border border-white/[0.08] bg-black/25 px-3 py-4 text-center"
                style={{ animation: regDrin ? `sa-rein .5s ${i * 70}ms cubic-bezier(.2,.8,.2,1) both` : undefined, opacity: regDrin ? undefined : 0 }}>
                <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${regionFarbe(r.region).marke}`}>{r.region}</span>
                <p className="mt-2 text-2xl font-black text-slate-50"><Rollzahl wert={r.n} los={regDrin} ort={ort} /></p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Spieler</T></p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
