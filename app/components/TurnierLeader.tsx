'use client';

/*
 * Tournament Leaders (Betreiber, 15.11.2026): ueber den Player Stats eines Spieltags (bzw. eines mehrtaegigen Events) und auf /fncs je FNCS-Spieltag -
 * links die "Event MVP"-Karte (Foto nur bei nachgewiesener Konto-Zuordnung, sonst Platzhalter; Flagge nur aus unseren Profilen), daneben die besten
 * fuenf in acht Kennzahlen. Daten: /api/turnier-leader (lib/turnierLeader.ts), dieselben Zahlen wie die Player Stats. Eigenes CompHub-Design (blau/dunkel).
 */

import { useEffect, useRef, useState } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { ftGesichtLage } from '@/lib/ftBild';
import type { LeaderAntwort, LeaderMvp, LeaderTafel } from '@/lib/turnierLeader';

export function leaderAdresse(eventId: string, windowId: string, windows?: string[] | null) {
  return `/api/turnier-leader?window=${encodeURIComponent(windowId)}${eventId ? `&event=${encodeURIComponent(eventId)}` : ''}`
    + `${windows && windows.length > 1 ? `&windows=${windows.map(encodeURIComponent).join(',')}` : ''}`;
}

/** Die Daten laden - fuer die Ansicht und das Bild in /admin/tweets. */
export function useLeader(eventId: string | null | undefined, windowId: string | null | undefined, windows?: string[] | null) {
  const [daten, setDaten] = useState<{ schluessel: string; d: LeaderAntwort | null; fehler?: boolean } | null>(null);
  const schluessel = windowId ? leaderAdresse(eventId ?? '', windowId, windows) : '';
  useEffect(() => {
    if (!schluessel) return;
    let weg = false;
    fetch(schluessel).then((r) => r.json()).then((d: LeaderAntwort) => { if (!weg) setDaten({ schluessel, d: d && Array.isArray(d.tafeln) ? d : null }); })
      .catch(() => { if (!weg) setDaten({ schluessel, d: null, fehler: true }); });
    return () => { weg = true; };
  }, [schluessel]);
  const aktuell = daten?.schluessel === schluessel ? daten : null;
  return { laedt: !!schluessel && !aktuell, daten: aktuell?.d ?? null, fehler: !!aktuell?.fehler };
}

/** Ein Foto, das Gesicht gross und mittig (dieselbe Rechnung wie die Bilder, lib/ftBild ftGesichtLage). */
function GesichtFoto({ datei, gesicht, name }: { datei: string; gesicht: [number, number, number] | null; name: string }) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [stil, setStil] = useState<React.CSSProperties | null>(null);
  const [natur, setNatur] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = rahmen.current;
    if (!el || !natur) return;
    const rechne = () => {
      const W = el.clientWidth; const H = el.clientHeight;
      if (!W || !H) return;
      const l = ftGesichtLage(W, H, natur.w, natur.h, gesicht);
      setStil({ position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h, maxWidth: 'none' });
    };
    rechne();
    const ro = new ResizeObserver(rechne);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natur, gesicht]);
  return (
    <div ref={rahmen} className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/spielerbilder/${encodeURIComponent(datei)}`} alt={name} draggable={false}
        onLoad={(e) => setNatur({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={stil ?? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0 }} />
    </div>
  );
}

/** Sekunden als "2h 22m". */
export function zeitText(sek: number) {
  const s = Math.max(0, Math.round(sek)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function Platzhalter() {
  return (
    <div className="absolute inset-0 flex items-end justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,.18),transparent_60%),linear-gradient(180deg,#0f1a2c,#070b14)]">
      <svg viewBox="0 0 100 100" aria-hidden className="h-[78%] w-[78%] fill-slate-500/25">
        <circle cx="50" cy="36" r="17" />
        <path d="M16 100c0-21 15-37 34-37s34 16 34 37z" />
      </svg>
    </div>
  );
}

function MvpKarte({ m, ort }: { m: LeaderMvp; ort: string }) {
  const zahl = (v: number, n = 0) => v.toLocaleString(ort, { minimumFractionDigits: n, maximumFractionDigits: n });
  const werte: Array<[string, string]> = [
    ['Rating', zahl(m.rating, 1)],
    ['Damage Dealt', m.damage != null ? zahl(m.damage) : '–'],
    ['Damage Ratio', m.quote != null ? zahl(m.quote, 2) : '–'],
    ['Hits to Players', m.hits != null ? zahl(m.hits) : '–'],
    ['Headshots', m.headshots != null ? zahl(m.headshots) : '–'],
    ['Placement', m.platz ? `#${m.platz}` : '–'],
  ];
  return (
    <article className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-b from-[#0d1b30] via-[#0a1322] to-[#060a12] shadow-[0_0_40px_rgba(14,165,233,.12)]">
      <div className="relative aspect-[5/4] w-full overflow-hidden sm:aspect-[4/3] lg:aspect-[4/5]">
        {m.datei ? <GesichtFoto datei={m.datei} gesicht={m.gesicht} name={m.name} /> : <Platzhalter />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#060a12] via-[#060a12]/70 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-sky-500 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#04101f] shadow-[0_0_18px_rgba(14,165,233,.6)]">Event MVP</span>
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2.5 px-4 pb-3">
          <TeamFlagge laender={[m.land || null]} groesse={24} />
          <h3 className="truncate text-2xl font-extrabold tracking-tight text-white">{m.name}</h3>
          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{zahl(m.elims)} <T>Elims</T> · {m.spiele} <T>Matches</T></span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-2">
        {werte.map(([k, v], i) => (
          <div key={k} className={`rounded-lg border px-3 py-2 ${i === 0 ? 'border-sky-500/40 bg-sky-500/[0.08]' : 'border-white/[0.06] bg-white/[0.03]'}`}>
            <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{k}</dt>
            <dd className={`mt-0.5 text-lg font-bold tabular-nums ${i === 0 ? 'text-sky-300' : 'text-slate-100'}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function Tafel({ t, ort }: { t: LeaderTafel; ort: string }) {
  const zahl = (v: number) => (t.zeit ? zeitText(v) : v.toLocaleString(ort, { minimumFractionDigits: t.nachkomma, maximumFractionDigits: t.nachkomma }));
  return (
    <section className={`overflow-hidden rounded-xl border bg-zinc-900/80 ${t.schluessel === 'rating' ? 'border-sky-500/40' : 'border-white/[0.08]'}`}>
      <p className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-800/60 px-3 py-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">{t.titel}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-600">Top 5</span>
      </p>
      <ol className="divide-y divide-white/[0.04]">
        {t.zeilen.map((z) => (
          <li key={z.epicId} className="flex items-center gap-2.5 px-3 py-[7px] text-sm">
            <span className={`w-5 shrink-0 text-right text-xs font-bold tabular-nums ${z.rang === 1 ? 'text-sky-400' : 'text-slate-500'}`}>{z.rang}</span>
            <TeamFlagge laender={[z.land || null]} groesse={16} />
            <span className={`min-w-0 flex-1 truncate ${z.rang === 1 ? 'font-semibold text-white' : 'text-slate-300'}`}>{z.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-100">{zahl(z.wert)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Performance Board: jeder gewertete Spieler als Punkt, Eliminierungen gegen Damage Dealt; die besten zehn im Rating beschriftet, der MVP hervorgehoben. */
function PerformanceBoard({ feld, mvp, ort }: { feld: NonNullable<LeaderAntwort['feld']>; mvp: string | null; ort: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 1200; const H = 380; const l = 56; const r = 18; const o = 16; const u = 40;
  const maxE = Math.max(1, ...feld.map((x) => x.elims)); const maxD = Math.max(1, ...feld.map((x) => x.damage));
  const sx = (v: number) => l + (v / (maxE * 1.05)) * (W - l - r);
  const sy = (v: number) => H - u - (v / (maxD * 1.08)) * (H - u - o);
  const schnittE = feld.reduce((a, x) => a + x.elims, 0) / feld.length; const schnittD = feld.reduce((a, x) => a + x.damage, 0) / feld.length;
  const zehn = new Set([...feld].sort((a, b) => b.rating - a.rating).slice(0, 10).map((x) => x.epicId));
  const ticksE = Array.from({ length: 6 }, (_, i) => Math.round((maxE * 1.05 * i) / 5));
  const ticksD = Array.from({ length: 5 }, (_, i) => Math.round((maxD * 1.08 * i) / 4 / 100) * 100);
  const h = feld.find((x) => x.epicId === hover);
  return (
    <section className="rounded-xl border border-white/[0.08] bg-zinc-900/80 p-3">
      <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Performance Board</span>
        <span className="text-[11px] text-slate-500">Eliminations × Damage Dealt · {feld.length} <T>Spieler</T>{h ? ` · ${h.name}: ${h.elims} / ${h.damage.toLocaleString(ort)}` : ''}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Eliminations vs damage dealt">
        {ticksD.map((t) => <g key={`d${t}`}><line x1={l} x2={W - r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,.06)" /><text x={l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t.toLocaleString(ort)}</text></g>)}
        {ticksE.map((t) => <g key={`e${t}`}><line y1={o} y2={H - u} x1={sx(t)} x2={sx(t)} stroke="rgba(255,255,255,.04)" /><text x={sx(t)} y={H - u + 16} textAnchor="middle" fontSize="11" fill="#64748b">{t}</text></g>)}
        <line x1={sx(schnittE)} x2={sx(schnittE)} y1={o} y2={H - u} stroke="rgba(56,189,248,.35)" strokeDasharray="4 4" />
        <line x1={l} x2={W - r} y1={sy(schnittD)} y2={sy(schnittD)} stroke="rgba(56,189,248,.35)" strokeDasharray="4 4" />
        <text x={W - r} y={H - 6} textAnchor="end" fontSize="11" fill="#94a3b8">Eliminations →</text>
        <text x={12} y={o + 4} fontSize="11" fill="#94a3b8" transform={`rotate(-90 12 ${o + 4})`} textAnchor="end">Damage ↑</text>
        {feld.map((x) => {
          const ist = x.epicId === mvp; const an = hover === x.epicId;
          return <circle key={x.epicId} cx={sx(x.elims)} cy={sy(x.damage)} r={ist ? 8 : an ? 7 : zehn.has(x.epicId) ? 5.5 : 4}
            fill={ist ? '#38bdf8' : zehn.has(x.epicId) ? 'rgba(125,211,252,.85)' : 'rgba(148,163,184,.45)'} stroke={ist || an ? '#fff' : 'none'} strokeWidth={1.5}
            onMouseEnter={() => setHover(x.epicId)} onMouseLeave={() => setHover(null)}><title>{`${x.name} · ${x.elims} elims · ${x.damage.toLocaleString(ort)} dmg${x.platz ? ` · #${x.platz}` : ''}`}</title></circle>;
        })}
        {feld.filter((x) => zehn.has(x.epicId)).map((x) => (
          <text key={`t${x.epicId}`} x={sx(x.elims) + (sx(x.elims) > W * 0.82 ? -9 : 9)} textAnchor={sx(x.elims) > W * 0.82 ? 'end' : 'start'} y={sy(x.damage) + 4} fontSize="12" fill={x.epicId === mvp ? '#e0f2fe' : '#cbd5e1'} style={{ pointerEvents: 'none' }}>{x.name.length > 16 ? `${x.name.slice(0, 15)}…` : x.name}</text>
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-slate-600"><T>Gestrichelt: Schnitt der gewerteten Spieler. Beschriftet: die besten zehn im Rating.</T></p>
    </section>
  );
}

const landName = (code: string, ort: string) => { try { return new Intl.DisplayNames([ort], { type: 'region' }).of(code) ?? code; } catch { return code; } };

/** Country Summary: je Land Spieler, mittleres Rating und Summen - Land nur aus unseren Profilen, der Rest als "Unknown". */
function Laender({ laender, ganz, ort }: { laender: NonNullable<LeaderAntwort['laender']>; ganz: boolean; ort: string }) {
  const { t } = useSprache();
  const [alle, setAlle] = useState(false);
  const bekannt = laender.filter((l) => l.land);
  const zahl = (v: number | null, n = 0) => (v == null ? '–' : v.toLocaleString(ort, { minimumFractionDigits: n, maximumFractionDigits: n }));
  const zeilen = alle ? laender : laender.slice(0, 8);
  return (
    <section className="rounded-xl border border-white/[0.08] bg-zinc-900/80 p-3">
      <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Country Summary</span>
        <span className="text-[11px] text-slate-500">{ganz ? t('Alle gewerteten Spieler') : t('Die gewerteten Spitzenspieler')} · <T>Land aus unseren Profilen</T></span>
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[...bekannt].sort((a, b) => b.spieler - a.spieler || b.rating - a.rating).slice(0, 4).map((l) => (
          <div key={l.land} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <TeamFlagge laender={[l.land]} groesse={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{landName(l.land, ort)}</p>
              <p className="text-[11px] text-slate-400">{l.spieler} <T>Spieler</T> · Ø {zahl(l.rating, 1)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>{['Country', 'Players', 'Avg Rating', 'Elims', 'Damage', 'Hits', 'Builds', 'Reboots', 'Highest Rated'].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] tabular-nums text-slate-300">
            {zeilen.map((l) => (
              <tr key={l.land || 'x'}>
                <td className="px-2 py-1.5"><span className="flex items-center gap-2"><TeamFlagge laender={[l.land || null]} groesse={16} /><span className="truncate">{l.land ? landName(l.land, ort) : 'Unknown'}</span></span></td>
                <td className="px-2 py-1.5">{l.spieler}</td>
                <td className="px-2 py-1.5 font-semibold text-sky-300">{zahl(l.rating, 1)}</td>
                <td className="px-2 py-1.5">{zahl(l.elims)}</td>
                <td className="px-2 py-1.5">{zahl(l.damage)}</td>
                <td className="px-2 py-1.5">{zahl(l.hits)}</td>
                <td className="px-2 py-1.5">{zahl(l.builds)}</td>
                <td className="px-2 py-1.5">{zahl(l.reboots)}</td>
                <td className="px-2 py-1.5 text-slate-200">{l.bester ? `${l.bester.name} (${zahl(l.bester.rating, 1)})` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {laender.length > 8 && (
        <button type="button" onClick={() => setAlle((a) => !a)} className="mt-2 text-[11px] font-semibold text-sky-400 hover:text-sky-300">
          {alle ? t('Weniger') : `${t('Alle')} (${laender.length})`}
        </button>
      )}
    </section>
  );
}

export default function TurnierLeader({ eventId, windowId, windows, titel, kompakt = false }: {
  eventId: string; windowId: string; windows?: string[] | null; titel?: string;
  /** Ohne eigene Ueberschrift (z. B. auf /fncs, wo die Auswahl darueber steht). */
  kompakt?: boolean;
}) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const { laedt, daten, fehler } = useLeader(eventId, windowId, windows);
  const [formel, setFormel] = useState(false);

  if (!laedt && (fehler || !daten?.vorhanden)) {
    if (!kompakt) return null;
    return <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Für diesen Spieltag liegen noch keine Werte je Spieler vor.</T></p>;
  }
  return (
    <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5" aria-label="Tournament Leaders">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {daten?.kopf?.bild && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={daten.kopf.bild} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-white/10 object-cover" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-100 sm:text-lg">{titel ?? daten?.kopf?.titel ?? 'Tournament Leaders'}</h2>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-400">
              Tournament Leaders{daten?.kopf?.saison ? ` · ${daten.kopf.saison}` : ''}{daten?.kopf?.region ? ` · ${daten.kopf.region}` : ''}
              {daten?.kopf?.datum ? ` · ${new Intl.DateTimeFormat(ort, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' }).format(new Date(daten.kopf.datum))}` : ''}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setFormel((f) => !f)}
          className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-semibold text-slate-400 transition hover:border-sky-500 hover:text-sky-300">
          <T>So entsteht das Rating</T>
        </button>
      </header>
      {daten?.replayStand && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-200">
          <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
          <span>Replay {daten.replayStand.gelesen}/{daten.replayStand.gesamt} <T>Spiele gelesen – Treffer, Kopftreffer, Bauteile, erlittener Schaden und Ratio nur bei Spielern, deren Spiele alle gelesen sind.</T></span>
        </p>
      )}
      {!laedt && daten?.fehlend && daten.fehlend.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg border border-zinc-700/70 bg-zinc-900/60 px-3 py-2 text-xs text-slate-300">
          {(['laeuft', 'neu', 'fehlt', 'format', 'alt'] as const).map((grund) => {
            const namen = daten.fehlend!.filter((f) => f.grund === grund).map((f) => f.titel);
            if (!namen.length) return null;
            return (
              <p key={grund}>
                {grund === 'laeuft' && <><T>Replay-Auswertung läuft noch</T>{daten.replayAbdeckung ? ` (${daten.replayAbdeckung.gelesen}/${daten.replayAbdeckung.von} ` : ' ('}<T>gewertete Spieler ganz gelesen</T>) – <T>noch nicht gezeigt</T>: </>}
                {grund === 'fehlt' && <><T>Für diesen Spieltag gibt es noch keine volle Replay-Auswertung (sie steht in der Warteschlange)</T> – <T>nicht gezeigt</T>: </>}
                {grund === 'format' && <><T>In diesem Format nicht erfasst</T>: </>}
                {grund === 'neu' && <><T>Wird gerade mit der neuen Auswertung neu gelesen – bis dahin nicht gezeigt</T>: </>}
                {grund === 'alt' && <><T>Für dieses Event nicht verfügbar</T>: </>}
                <span className="text-slate-400">{namen.join(', ')}</span>
              </p>
            );
          })}
        </div>
      )}
      {formel && daten && (
        <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3 text-xs leading-relaxed text-slate-300">
          <p className="font-mono text-[11px] text-sky-200">Rating = 100 × (0.30·Elims/max + 0.25·Damage/max + 0.15·Ratio/max + 0.10·Hits/max + 0.20·Placement)</p>
          {daten.ohneReplay && <p className="mt-1 text-slate-400"><T>Solange die Replays nicht ganz gelesen sind: Rating = 100 × (0.30·Elims + 0.25·Damage + 0.20·Placement) / 0.75.</T></p>}
          {daten.ohneDamage && <p className="mt-1 text-slate-400"><T>Ohne Schaden je Spieler: Rating = 100 × (0.30·Elims + 0.20·Placement) / 0.50.</T></p>}
          {daten.ohnePlatz && <p className="mt-1 text-slate-400"><T>Ohne bekannte Platzierung: Rating = Summe der übrigen Teile / 0,80.</T></p>}
          <p className="mt-1.5 text-slate-400"><T>Placement = max(0, (101 − Platz) / 100). „max“ ist der beste Wert unter den gewerteten Spielern dieses Spieltags. Gewertet wird, wer mindestens die Hälfte der meisten Spiele gespielt hat</T> ({daten.mindestSpiele}/{daten.spieleMax}). <T>Alle Zahlen wie in den Player Stats; Damage Taken nur durch Spieler, ohne Sturm.</T></p>
        </div>
      )}
      {laedt || !daten ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <div className="h-96 animate-pulse rounded-2xl bg-zinc-900/70" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-zinc-900/70" />)}</div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          {daten.mvp && <MvpKarte m={daten.mvp} ort={ort} />}
          <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {daten.tafeln.map((t) => <Tafel key={t.schluessel} t={t} ort={ort} />)}
          </div>
          {(daten.laender?.length ?? 0) > 0 && <div className="lg:col-span-2"><Laender laender={daten.laender!} ganz={!!daten.ganzesFeld} ort={ort} /></div>}
          {(daten.feld?.length ?? 0) >= 5 && <div className="lg:col-span-2"><PerformanceBoard feld={daten.feld!} mvp={daten.mvp?.epicId ?? null} ort={ort} /></div>}
        </div>
      )}
    </section>
  );
}
