'use client';

/*
 * Der Verlauf eines Spielers ueber seine Turniere - nach dem Vorbild der
 * "Rating Progression" bei eucompetitive, mit denselben Schaltern: die
 * letzten zwoelf oder alle, und "grosse Events" dazu oder nicht (beides
 * zugleich waehlbar). Beim Oeffnen zeichnet sich die Linie von links nach
 * rechts, wie beim Vorbild.
 *
 * Ein Rating gibt es hier nicht - das rechnet nur das Vorbild nach eigener
 * Formel. Gezeigt wird die Damage Ratio je Turnier (ausgeteilt durch von
 * Spielern erlitten), eine Zahl aus der Quelle selbst.
 */

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

export interface VerlaufPunkt { event: string; datum?: number | null; werte: { damageDealt?: number; damageTakenFromPlayers?: number } }

const GROSS = /FNCS.*(Final|Major|Grand)|Global|Summit|Reload Elite Series|Championship|Invitational|Grand Royale/i;

export default function ProfilVerlauf({ zeilen }: { zeilen: VerlaufPunkt[] }) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [zeitraum, setZeitraum] = useState<'letzte' | 'alle'>('letzte');
  const [gross, setGross] = useState(false);
  /** Der Punkt unter der Maus - zeigt sofort Event, Tag und Werte (frueher nur der traege Browser-Hinweis am Punkt). */
  const [aktiv, setAktiv] = useState<number | null>(null);

  const punkte = useMemo(() => {
    const alle = zeilen
      .filter((z) => (z.werte.damageTakenFromPlayers ?? 0) > 0)
      .map((z) => ({ event: z.event, datum: z.datum ?? 0, wert: (z.werte.damageDealt ?? 0) / (z.werte.damageTakenFromPlayers ?? 1), dealt: z.werte.damageDealt ?? 0, taken: z.werte.damageTakenFromPlayers ?? 0 }))
      .sort((a, b) => a.datum - b.datum);
    const auswahl = gross ? alle.filter((p) => GROSS.test(p.event)) : alle;
    return zeitraum === 'letzte' ? auswahl.slice(-12) : auswahl;
  }, [zeilen, zeitraum, gross]);

  const B = 800; const H = 260; const RAND = { l: 40, r: 16, o: 16, u: 26 };
  const werte = punkte.map((p) => p.wert);
  const min = werte.length ? Math.min(...werte) : 0;
  const max = werte.length ? Math.max(...werte) : 1;
  const unten = Math.max(0, Math.floor((min - 0.15) * 10) / 10);
  const oben = Math.ceil((max + 0.15) * 10) / 10;
  const schnitt = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;
  const x = (i: number) => RAND.l + (punkte.length > 1 ? (i / (punkte.length - 1)) * (B - RAND.l - RAND.r) : (B - RAND.l - RAND.r) / 2);
  const y = (v: number) => RAND.o + (1 - (v - unten) / Math.max(0.0001, oben - unten)) * (H - RAND.o - RAND.u);

  // Weiche Kurve (Catmull-Rom als kubische Bezier).
  const pfad = punkte.map((p, i) => {
    if (i === 0) return `M${x(0)},${y(p.wert)}`;
    const p0 = punkte[i - 2] ?? punkte[i - 1]; const p1 = punkte[i - 1]; const p3 = punkte[i + 1] ?? p;
    const c1x = x(i - 1) + (x(i) - x(Math.max(0, i - 2))) / 6; const c1y = y(p1.wert) + (y(p.wert) - y(p0.wert)) / 6;
    const c2x = x(i) - (x(Math.min(punkte.length - 1, i + 1)) - x(i - 1)) / 6; const c2y = y(p.wert) - (y(p3.wert) - y(p1.wert)) / 6;
    return `C${c1x},${c1y} ${c2x},${c2y} ${x(i)},${y(p.wert)}`;
  }).join(' ');
  const flaeche = punkte.length ? `${pfad} L${x(punkte.length - 1)},${H - RAND.u} L${x(0)},${H - RAND.u} Z` : '';
  const stufen = Array.from({ length: 5 }, (_, i) => unten + ((oben - unten) * i) / 4);
  const zahl = (v: number) => v.toLocaleString(ort, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Neu zeichnen, wenn sich die Auswahl aendert.
  const schluessel = `${zeitraum}-${gross}-${punkte.length}`;
  const ganz = (v: number) => v.toLocaleString(ort, { maximumFractionDigits: 0 });
  const tag = (ms: number) => (ms ? new Date(ms).toLocaleDateString(ort, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const a = aktiv !== null ? punkte[aktiv] : null;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,.10)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300"><T>Verlauf der Damage Ratio</T></h3>
        {werte.length > 0 && (
          <span className="text-[11px] text-slate-500">
            <T>Bester</T> <b className="text-emerald-400">{zahl(max)}</b> · <T>Schlechtester</T> <b className="text-rose-400">{zahl(min)}</b> · {punkte.length} Events
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          {([['letzte', 'Letzte 12'], ['alle', 'Alle Zeit']] as const).map(([w, l]) => (
            <button key={w} type="button" onClick={() => setZeitraum(w)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${zeitraum === w
                ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
              <T>{l}</T>
            </button>
          ))}
          <button type="button" onClick={() => setGross((g) => !g)}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${gross
              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
            <T>Große Events</T>
          </button>
        </div>
      </div>
      {punkte.length < 2 ? (
        <p className="px-4 py-8 text-center text-xs text-slate-600"><T>Zu wenige Turniere mit Werten für einen Verlauf.</T></p>
      ) : (
        <div className="overflow-x-auto p-3">
          <div className="relative min-w-[560px]" onMouseLeave={() => setAktiv(null)}>
          {/* Das Fenster zum Punkt: Event, Datum, Ratio und die beiden Schadenszahlen, ueber dem Punkt. */}
          {a && aktiv !== null && (
            <div className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-2xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 shadow-xl"
              style={{ left: `${Math.min(88, Math.max(12, (x(aktiv) / B) * 100))}%`, top: `${(y(a.wert) / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 14px))' }}>
              <p className="truncate text-xs font-bold text-slate-100">{a.event}</p>
              {a.datum > 0 && <p className="mt-0.5 text-[10px] text-slate-500">{tag(a.datum)}</p>}
              <p className="mt-1.5 flex items-baseline gap-2"><span className="text-lg font-extrabold tabular-nums text-sky-500">{zahl(a.wert)}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><T>Damage Ratio</T></span></p>
              <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{ganz(a.dealt)} <T>ausgeteilt</T> · {ganz(a.taken)} <T>erlitten</T></p>
            </div>
          )}
          <svg key={schluessel} viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img"
            aria-label="Damage Ratio">
            <defs>
              <linearGradient id="verlauf-flaeche" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {stufen.map((v) => (
              <g key={v}>
                <line x1={RAND.l} x2={B - RAND.r} y1={y(v)} y2={y(v)} stroke="var(--color-zinc-800)" strokeWidth={1} />
                <text x={RAND.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--color-slate-500)">{zahl(v)}</text>
              </g>
            ))}
            <line x1={RAND.l} x2={B - RAND.r} y1={y(schnitt)} y2={y(schnitt)} stroke="#64748b" strokeDasharray="5 5" strokeWidth={1} />
            <path d={flaeche} fill="url(#verlauf-flaeche)" className="verlauf-einblenden" />
            <path d={pfad} fill="none" stroke="#38bdf8" strokeWidth={2.5} pathLength={1} className="verlauf-zeichnen" />
            {aktiv !== null && <line x1={x(aktiv)} x2={x(aktiv)} y1={RAND.o} y2={H - RAND.u} stroke="#38bdf8" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 4" />}
            {punkte.map((p, i) => (
              <g key={i} onMouseEnter={() => setAktiv(i)} onFocus={() => setAktiv(i)} onBlur={() => setAktiv(null)} tabIndex={0} aria-label={`${p.event}: ${zahl(p.wert)}`} className="outline-none">
                {/* Die unsichtbare, groessere Flaeche: der Punkt ist klein, die Maus muss ihn nicht genau treffen. */}
                <circle cx={x(i)} cy={y(p.wert)} r={16} fill="transparent" />
                <circle cx={x(i)} cy={y(p.wert)} r={aktiv === i ? 8 : 5} fill={p.wert >= schnitt ? '#22c55e' : '#64748b'}
                  stroke="var(--color-zinc-950)" strokeWidth={2} className="verlauf-einblenden transition-all duration-150" />
              </g>
            ))}
          </svg>
          </div>
        </div>
      )}
    </section>
  );
}
