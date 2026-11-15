'use client';

/*
 * Zonen-Glueck und "gegen die Erwartung" ueber alle Games eines oder mehrerer Spieltage (/api/replay-auswertung) - auf der Seite eines
 * Spieltags ("Alle Games analysieren"), fuer mehrere gewaehlte Cups zusammen und als Highlights auf /replays.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { Flagge } from '@/app/replays/Werkzeuge';
import { GlueckTafel, Info, type TafelZeile } from '@/app/replays/Analysen';
import { FORMEL_GLUECK, glueckWort } from '@/app/replays/analyse';

interface GameZeile { tag: string; nr: number; match: string; glueck: number; zonen: number; drin: number; abstand: number | null; gegen: number | null; platz: number | null; punkte: number | null; swing: { wert: number; zone: number } | null; throw: { wert: number; zone: number } | null }
export interface AuswertungSpieler { epic: string; name: string; land?: string; games: GameZeile[] }
export interface Auswertung { tage: Array<{ windowId: string; titel: string; region: string; games: number }>; spieler: AuswertungSpieler[] }

export function useAuswertung(tage: string[]) {
  const [d, setD] = useState<Auswertung | null>(null);
  const [fehler, setFehler] = useState(false);
  const schluessel = tage.join(',');
  useEffect(() => {
    if (!schluessel) return undefined;
    let weg = false;
    setD(null); setFehler(false);
    fetch(`/api/replay-auswertung?tage=${encodeURIComponent(schluessel)}`).then((r) => r.json())
      .then((j) => { if (!weg) { if (Array.isArray(j?.spieler)) setD(j); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [schluessel]);
  return { d, fehler };
}

/** Summen je Spieler ueber seine Games. */
export function zusammen(s: AuswertungSpieler) {
  const g = s.games;
  const glueck = g.reduce((a, x) => a + x.glueck, 0);
  const mitGegen = g.filter((x) => x.gegen !== null);
  const gegen = mitGegen.length ? mitGegen.reduce((a, x) => a + (x.gegen ?? 0), 0) : null;
  const plaetze = g.filter((x) => x.platz !== null);
  const platz = plaetze.length ? plaetze.reduce((a, x) => a + (x.platz ?? 0), 0) / plaetze.length : null;
  const mitPunkten = g.filter((x) => x.punkte !== null);
  const punkte = mitPunkten.length ? mitPunkten.reduce((a, x) => a + (x.punkte ?? 0), 0) : null;
  let swing: string | null = null; let sw = 0; let wurf: string | null = null; let wu = 0;
  for (const x of g) {
    if (x.swing && x.swing.wert > sw) { sw = x.swing.wert; swing = `+${x.swing.wert} · G${x.nr} Z${x.swing.zone}`; }
    if (x.throw && x.throw.wert > wu) { wu = x.throw.wert; wurf = `−${x.throw.wert} · G${x.nr} Z${x.throw.zone}`; }
  }
  const mitAbstand = g.filter((x) => x.abstand !== null);
  return { glueck, gegen, platz, punkte, swing, wurf, zonen: g.reduce((a, x) => a + x.zonen, 0), drin: g.reduce((a, x) => a + x.drin, 0),
    abstand: mitAbstand.length ? mitAbstand.reduce((a, x) => a + (x.abstand ?? 0), 0) / mitAbstand.length : null };
}

export default function TagesAuswertung({ tage }: { tage: string[] }) {
  const { d, fehler } = useAuswertung(tage);
  const [reiter, setReiter] = useState<'glueck' | 'vergleich'>('glueck');
  if (fehler) return <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>The analysis could not be loaded right now.</T></p>;
  if (!d) return <p className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-4 py-6 text-sm text-slate-500"><T>Analysing all games …</T></p>;
  const reihen = d.spieler.map((s) => ({ s, z: zusammen(s) })).filter((x) => x.s.games.length);
  if (!reihen.length) return <p className="text-sm text-slate-500"><T>These replays carry no player positions.</T></p>;
  const zeilen: TafelZeile[] = reihen.map(({ s, z }) => ({
    schluessel: s.epic, name: s.name, land: s.land, glueck: z.glueck, gegen: z.gegen, platz: z.platz, punkte: z.punkte, sieger: s.games.some((g) => g.platz === 1),
    games: s.games.length, swing: z.swing, wurf: z.wurf,
  }));
  const liste = [...reihen].sort((a, b) => b.z.glueck - a.z.glueck);
  const max = Math.max(1, ...liste.map((x) => Math.abs(x.z.glueck)));
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] p-1.5">
        {([['glueck', 'Zone luck'], ['vergleich', 'Luck vs performance']] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setReiter(k)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{n}</T></button>
        ))}
        <span className="ml-auto pr-2 text-[11px] text-slate-500">{d.tage.map((t) => `${t.region} · ${t.games} G`).join(' + ')}</span>
      </div>
      <div className="p-3">
        {reiter === 'glueck' ? (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-[12px] text-slate-400"><T>Zone luck summed over all games of the selection.</T><Info text={FORMEL_GLUECK} /></p>
            <ul className="max-h-[560px] overflow-y-auto">
              {liste.map(({ s, z }, i) => (
                <li key={s.epic} className="grid grid-cols-[24px_1fr_70px_90px_54px] items-center gap-2 border-b border-white/[0.04] px-1.5 py-1 text-[12px]"
                  title={s.games.map((g) => `Game ${g.nr}: ${g.glueck >= 0 ? '+' : ''}${g.glueck.toFixed(0)} (${g.zonen} zones)`).join('\n')}>
                  <span className="text-right text-[10px] tabular-nums text-slate-500">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5"><Flagge land={s.land} klein /><span className="truncate font-semibold text-slate-100">{s.name}</span><span className="shrink-0 text-[10px] text-slate-500">{s.games.length} G</span></span>
                  <span className="rounded bg-white/[0.06] px-1.5 py-px text-center text-[9px] font-bold uppercase tracking-wider text-slate-300"><T>{glueckWort(z.glueck / Math.max(1, s.games.length))}</T></span>
                  <span className="relative h-2 rounded bg-white/5"><span className="absolute top-0 h-full rounded" style={{ left: z.glueck >= 0 ? '50%' : `${50 - (Math.abs(z.glueck) / max) * 50}%`, width: `${(Math.abs(z.glueck) / max) * 50}%`, background: z.glueck >= 0 ? '#34d399' : '#f43f5e' }} /></span>
                  <span className={`text-right font-bold tabular-nums ${z.glueck >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{z.glueck >= 0 ? '+' : ''}{z.glueck.toFixed(0)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <GlueckTafel zeilen={zeilen} />}
      </div>
    </section>
  );
}
