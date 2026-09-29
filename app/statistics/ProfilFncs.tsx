'use client';

/*
 * Die Reiter "FNCS" und "Erfolge" im Spielerprofil (Daten: lib/profilTafeln).
 *
 * Nach dem Vorbild eucompetitive, in der eigenen Optik: jedes FNCS-Finale seit
 * CH1 SX als Tafel oder Liste, DNQ (nicht qualifiziert) blass, mit den
 * Mitspielern; darueber Anzahl, bester, schlechtester, Schnitt und LAN-Schnitt.
 * Ein Rating gibt es nicht - das rechnet nur das Vorbild nach eigener Formel.
 */

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';

export interface Mitspieler { epicId: string; name: string; land: string | null }
export interface TafelZeile { saison: string; platz: number; typ: 'LAN' | 'ONLINE'; mitspieler: Mitspieler[]; datum: number | null }
export interface Erfolg { titel: string; season: string; saisonName?: string; platz: number; typ: 'LAN' | 'ONLINE'; mitspieler: Mitspieler[]; datum: number | null }

/** "1st", "2nd" - im Deutschen "1.", "2.". */
function platzText(p: number, en: boolean) {
  if (!en) return `${p}.`;
  const r = p % 100;
  const e = r >= 11 && r <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[p % 10] ?? 'th';
  return `${p}${e}`;
}

/** Gold, Silber, Bronze, sonst grau. */
function platzFarbe(p: number) {
  return p === 1 ? 'border-amber-400/70 bg-amber-400/15 text-amber-300'
    : p === 2 ? 'border-slate-300/60 bg-slate-300/10 text-slate-200'
      : p === 3 ? 'border-orange-400/60 bg-orange-400/10 text-orange-300'
        : 'border-zinc-700 bg-zinc-900 text-slate-300';
}

function Typ({ typ }: { typ: 'LAN' | 'ONLINE' }) {
  return (
    <span className={`rounded border px-1.5 py-px text-[9px] font-bold tracking-wider ${typ === 'LAN'
      ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-slate-500'}`}>{typ}</span>
  );
}

function Team({ mitspieler }: { mitspieler: Mitspieler[] }) {
  if (!mitspieler.length) return <span className="text-slate-600">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {mitspieler.map((m) => (
        <span key={m.epicId} className="inline-flex items-center gap-1.5 text-[12px] text-slate-300">
          <TeamFlagge groesse={14} laender={[m.land || undefined]} />
          {m.name}
        </span>
      ))}
    </span>
  );
}

export function FncsReiter({ tafel, name }: { tafel: TafelZeile[]; name: string }) {
  const { sprache } = useSprache();
  const en = sprache === 'en';
  const [ansicht, setAnsicht] = useState<'tafel' | 'liste'>('tafel');
  const [ohneDnq, setOhneDnq] = useState(false);

  const kopf = useMemo(() => {
    const dabei = tafel.filter((z) => z.platz > 0);
    const lan = dabei.filter((z) => z.typ === 'LAN');
    const schnitt = (l: TafelZeile[]) => (l.length ? Math.round(l.reduce((a, z) => a + z.platz, 0) / l.length) : null);
    return {
      grands: dabei.length,
      best: dabei.length ? Math.min(...dabei.map((z) => z.platz)) : null,
      worst: dabei.length ? Math.max(...dabei.map((z) => z.platz)) : null,
      schnitt: schnitt(dabei), lanSchnitt: schnitt(lan),
    };
  }, [tafel]);

  if (!tafel.length) {
    return <p className="py-6 text-center text-xs text-slate-600"><T>Zu diesem Spieler liegen keine FNCS-Ergebnisse vor.</T></p>;
  }
  // Neueste zuerst in der Liste, aelteste zuerst auf der Tafel - wie beim Vorbild.
  const zeilen = ohneDnq ? tafel.filter((z) => z.platz > 0) : tafel;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">FNCS Grand Finals</h3>
        <div className="ml-auto flex gap-1.5">
          {([['tafel', 'Tafel'], ['liste', 'Liste']] as const).map(([w, t2]) => (
            <button key={w} type="button" onClick={() => setAnsicht(w)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${ansicht === w
                ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
              <T>{t2}</T>
            </button>
          ))}
          <button type="button" onClick={() => setOhneDnq((x) => !x)}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${ohneDnq
              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
            <T>DNQ ausblenden</T>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <span className="text-lg font-black uppercase tracking-wide text-slate-50">{name}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {([
            [String(kopf.grands), 'Grand Finals', 'text-amber-300'],
            [kopf.best ? platzText(kopf.best, en) : '—', 'Bester', 'text-emerald-400'],
            [kopf.worst ? platzText(kopf.worst, en) : '—', 'Schlechtester', 'text-rose-400'],
            [kopf.schnitt ? platzText(kopf.schnitt, en) : '—', 'Schnitt', 'text-sky-400'],
            [kopf.lanSchnitt ? platzText(kopf.lanSchnitt, en) : '—', 'LAN-Schnitt', 'text-violet-300'],
          ] as Array<[string, string, string]>).map(([w, l, f]) => (
            <div key={l} className="min-w-[4.5rem] rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-center">
              <p className={`text-base font-black tabular-nums ${f}`}>{w}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500"><T>{l}</T></p>
            </div>
          ))}
        </div>
      </div>

      {ansicht === 'tafel' ? (
        <div className="grid gap-2.5 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {zeilen.map((z) => (
            <div key={z.saison} className={`rounded-lg border px-3 py-2.5 ${z.platz
              ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-900 bg-zinc-950/40 opacity-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-[13px] font-bold leading-tight text-slate-100">{z.saison}</span>
                <span className={`rounded border px-2 py-0.5 text-[11px] font-bold tabular-nums ${z.platz ? platzFarbe(z.platz) : 'border-zinc-800 text-slate-600'}`}>
                  {z.platz ? platzText(z.platz, en) : 'DNQ'}
                </span>
              </div>
              {z.platz > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Team mitspieler={z.mitspieler} />
                  <Typ typ={z.typ} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left font-medium"><T>Saison</T></th>
                <th className="px-3 py-2 text-center font-medium"><T>Platz</T></th>
                <th className="px-3 py-2 text-center font-medium"><T>Art</T></th>
                <th className="px-3 py-2 text-left font-medium"><T>Mitspieler</T></th>
                <th className="px-3 py-2 text-right font-medium">Format</th>
              </tr>
            </thead>
            <tbody>
              {[...zeilen].reverse().map((z) => (
                <tr key={z.saison} className={`border-b border-zinc-900/70 ${z.platz ? '' : 'opacity-40'}`}>
                  <td className="px-3 py-2 font-semibold text-slate-100">{z.saison}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-200">{z.platz ? platzText(z.platz, en) : 'DNQ'}</td>
                  <td className="px-3 py-2 text-center"><Typ typ={z.typ} /></td>
                  <td className="px-3 py-2"><Team mitspieler={z.mitspieler} /></td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">
                    {z.platz ? (['Solo', 'Duo', 'Trio', 'Squad'][z.mitspieler.length] ?? '') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ErfolgeReiter({ tafel, erfolge }: { tafel: TafelZeile[]; erfolge: Erfolg[] }) {
  const { sprache } = useSprache();
  const en = sprache === 'en';
  const [wahl, setWahl] = useState<'fncs' | 'andere'>('fncs');
  const fncs = tafel.filter((z) => z.platz > 0).sort((a, b) => a.platz - b.platz || (b.datum ?? 0) - (a.datum ?? 0));
  const cashSiege = erfolge.filter((e) => e.platz === 1 && /cash cup/i.test(e.titel)).length;

  const Zeile = ({ platz, titel, unter, typ, mitspieler }: { platz: number; titel: string; unter?: string; typ: 'LAN' | 'ONLINE'; mitspieler: Mitspieler[] }) => (
    <div className="flex items-center gap-4 border-b border-zinc-900 px-4 py-3">
      <span className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${platzFarbe(platz)}`}>
        {platzText(platz, en)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-100">{titel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {unter && <span>{unter}</span>}
          <Typ typ={typ} />
        </div>
        <div className="mt-1.5"><Team mitspieler={mitspieler} /></div>
      </div>
    </div>
  );

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
        {([['fncs', 'FNCS'], ['andere', 'Weitere']] as const).map(([w, t2]) => (
          <button key={w} type="button" onClick={() => setWahl(w)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${wahl === w
              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
            {w === 'fncs' ? t2 : <T>{t2}</T>}
          </button>
        ))}
        {cashSiege > 0 && (
          <span className="ml-auto rounded-md border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
            {cashSiege}× Cash Cup <T>Sieger</T>
          </span>
        )}
      </div>
      {wahl === 'fncs' ? (
        fncs.length ? fncs.map((z) => (
          <Zeile key={z.saison} platz={z.platz} titel={z.saison} typ={z.typ} mitspieler={z.mitspieler} />
        )) : <p className="px-4 py-6 text-center text-xs text-slate-600"><T>Noch kein FNCS-Finale.</T></p>
      ) : (
        erfolge.length ? erfolge.map((e, i) => (
          <Zeile key={`${e.titel}-${e.season}-${i}`} platz={e.platz} titel={e.titel} unter={e.saisonName ?? e.season} typ={e.typ} mitspieler={e.mitspieler} />
        )) : <p className="px-4 py-6 text-center text-xs text-slate-600"><T>Keine Top-3-Platzierung außerhalb der FNCS.</T></p>
      )}
    </section>
  );
}

/** Die drei besten FNCS-Platzierungen - "Career Best" beim Vorbild, fuer die Uebersicht. */
export function KarriereBest({ tafel }: { tafel: TafelZeile[] }) {
  const { sprache } = useSprache();
  const en = sprache === 'en';
  const beste = tafel.filter((z) => z.platz > 0).sort((a, b) => a.platz - b.platz || (b.datum ?? 0) - (a.datum ?? 0)).slice(0, 3);
  if (!beste.length) return null;
  return (
    <section>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Karriere-Bestwerte</T></p>
      <div className="grid gap-2 sm:grid-cols-3">
        {beste.map((z) => (
          <div key={z.saison} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
            <span className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border text-sm font-black ${platzFarbe(z.platz)}`}>
              {platzText(z.platz, en)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-100">{z.saison} <Typ typ={z.typ} /></p>
              <div className="mt-1"><Team mitspieler={z.mitspieler} /></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
