'use client';

/*
 * Konstanz (Betreiber, 15.11.2026): je Region die konstantesten Spieler (unsere Konstanz-Note, scripts/spieler-kreis.mjs) und je Cup einer Serie ein Punkt - wie sie
 * dort abgeschnitten haben. Oben die Konstantesten jeder Region. Daten: /api/konstanz. Eigene Optik (Blautoene), Punkte nach Platz-Stufen.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';

interface Antwort {
  region: string; serie: string; saison: string; saisons: string[];
  besteJeRegion: Array<{ epicId: string; name: string; region: string; konstanz: number; cups: number }>;
  spalten: Array<{ windowId: string; titel: string; datum: number }>;
  spieler: Array<{ epicId: string; name: string; konstanz: number; cups: number; top100: number; beste: number; plaetze: Record<string, number> }>;
}

const SERIEN: Array<[string, string]> = [['fncs', 'FNCS'], ['cash', 'Cash Cups'], ['victory', 'Victory / Elite / Performance'], ['alle', 'All cups']];
const STUFEN: Array<[number, string, string]> = [[10, 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,.7)]', 'Top 10'], [100, 'bg-sky-500', 'Top 100'], [500, 'bg-sky-800', 'Top 500'], [Infinity, 'bg-slate-600', '500+']];
const stufe = (p: number) => STUFEN.find(([g]) => p <= g)!;

/** Kurzname eines Spieltags fuer die Spalte: Heat 1, R2, Day 1, Final ... */
function kurz(w: string) {
  const heat = /Heat(\d+)/i.exec(w)?.[1]; const tag = /Day(\d+)/i.exec(w)?.[1]; const runde = /Round(\d+)/i.exec(w)?.[1]; const qual = /Qual(\d+)/i.exec(w)?.[1];
  const ev = /Event(\d+)/i.exec(w)?.[1]; const div = /Division(\d+)/i.exec(w)?.[1]; const woche = /Week(\d+)/i.exec(w)?.[1];
  if (heat) return `H${heat}`;
  if (/LastChanceLobby/i.test(w)) return 'LCL';
  if (/LastChance/i.test(w)) return 'LCQ';
  if (/Final/i.test(w) && !woche) return tag ? `F D${tag}` : 'F';
  return [qual && `Q${qual}`, div && `D${div}`, woche && `W${woche}F`, ev && `E${ev}`, runde && `R${runde}`, tag && `d${tag}`].filter(Boolean).join(' ') || '•';
}

export default function Konstanz({ aufSpieler }: { aufSpieler?: (id: string, name: string) => void }) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [region, setRegion] = useState('EU');
  const [serie, setSerie] = useState('fncs');
  const [saison, setSaison] = useState('');
  const [prozent, setProzent] = useState(false);
  const [suche, setSuche] = useState('');
  const [daten, setDaten] = useState<{ schluessel: string; d: Antwort | null } | null>(null);
  const schluessel = `/api/konstanz?region=${region}&serie=${serie}${saison ? `&saison=${saison}` : ''}`;
  useEffect(() => {
    let weg = false;
    fetch(schluessel).then((r) => r.json()).then((d: Antwort) => { if (!weg) setDaten({ schluessel, d: Array.isArray(d?.spieler) ? d : null }); })
      .catch(() => { if (!weg) setDaten({ schluessel, d: null }); });
    return () => { weg = true; };
  }, [schluessel]);
  const d = daten?.schluessel === schluessel ? daten.d : null;
  const laedt = daten?.schluessel !== schluessel;
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;
  const datum = (ms: number) => new Intl.DateTimeFormat(ort, { day: '2-digit', month: 'short', timeZone: 'Europe/Brussels' }).format(new Date(ms));
  const zeilen = (d?.spieler ?? []).filter((s) => !suche.trim() || s.name.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-black tracking-tight text-slate-100"><T>Konstanz</T></h2>
        <p className="mt-1 max-w-3xl text-xs text-slate-500"><T>Je Cup ein Punkt: wie weit vorn der Spieler war. Die Note ist unsere Konstanz-Note aus den letzten zwanzig Cups – jede Platzierung zählt nach der Größe des Feldes, das schlechteste Fünftel fällt weg.</T></p>
      </div>

      {d && d.besteJeRegion.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {[...d.besteJeRegion].sort((a, b) => REGIONEN_REIHE.indexOf(a.region) - REGIONEN_REIHE.indexOf(b.region)).map((b) => (
            <button key={b.region} type="button" onClick={() => aufSpieler?.(b.epicId, b.name)}
              className="rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2 text-left transition hover:border-sky-500/50">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400">{b.region} · <T>Konstantester</T></p>
              <p className="truncate text-sm font-bold text-slate-100">{b.name}</p>
              <p className="text-[11px] tabular-nums text-slate-400">{(b.konstanz * 100).toFixed(1)} · {b.cups} Cups</p>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => { setRegion(r); setSaison(''); }} className={chip(region === r)}>{r}</button>)}
        </div>
        <select value={serie} onChange={(e) => { setSerie(e.target.value); setSaison(''); }} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500">
          {SERIEN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select value={d?.saison ?? saison} onChange={(e) => setSaison(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500">
          {(d?.saisons ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setProzent(false)} className={`rounded-md px-3 py-1 ${!prozent ? 'bg-sky-500 text-white' : 'text-slate-400'}`}><T>Anzahl</T></button>
          <button type="button" onClick={() => setProzent(true)} className={`rounded-md px-3 py-1 ${prozent ? 'bg-sky-500 text-white' : 'text-slate-400'}`}>%</button>
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
          className="ml-auto w-full max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {STUFEN.map(([, k, n]) => <span key={n} className="flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-full ${k}`} /> {n}</span>)}
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-zinc-700" /> <T>nicht gespielt</T></span>
      </p>

      {laedt && <div className="h-80 animate-pulse rounded-xl bg-zinc-900/70" />}
      {!laedt && !d && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>}
      {d && (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="w-10 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left"><T>Spieler</T></th>
                <th className="px-2 py-2 text-right">Rating</th>
                <th className="px-2 py-2 text-right">{prozent ? 'Top 100 %' : 'Top 100'}</th>
                {d.spalten.map((s) => (
                  <th key={s.windowId} className="px-1 py-2 text-center" title={`${s.titel} · ${datum(s.datum)}`}>
                    <span className="whitespace-nowrap normal-case tracking-normal">{kurz(s.windowId)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((s, i) => {
                const gespielt = d.spalten.filter((c) => s.plaetze[c.windowId] !== undefined);
                const t100 = gespielt.filter((c) => s.plaetze[c.windowId] <= 100).length;
                return (
                  <tr key={s.epicId} className="border-b border-white/[0.04] hover:bg-sky-500/[0.05]">
                    <td className="px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{i + 1}</td>
                    <td className="px-3 py-1.5"><button type="button" onClick={() => aufSpieler?.(s.epicId, s.name)} className="max-w-[200px] truncate text-left text-[12px] font-bold text-slate-100 hover:text-sky-300">{s.name}</button></td>
                    <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums text-sky-300">{(s.konstanz * 100).toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-300">
                      {prozent ? (gespielt.length ? `${Math.round((t100 / gespielt.length) * 100)} %` : '–') : `${t100}/${gespielt.length}`}
                    </td>
                    {d.spalten.map((c) => {
                      const p = s.plaetze[c.windowId];
                      return (
                        <td key={c.windowId} className="px-1 py-1.5 text-center">
                          {p === undefined
                            ? <i className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-zinc-700" title={`${c.titel}: –`} />
                            : <i className={`inline-block h-3 w-3 rounded-full ${stufe(p)[1]}`} title={`${c.titel} · ${datum(c.datum)}: #${p.toLocaleString(ort)}`} />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
