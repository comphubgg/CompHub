'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT } from '@/app/components/SprachProvider';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';

/*
 * Prospects pflegen (Betreiber, 15.11.2026). Die Liste rechnet scripts/spieler-kreis.mjs; hier wird sie von Hand nachgezogen:
 *   - Spieler aufnehmen (Suche nach Name oder Epic-Konto-Id) oder entfernen,
 *   - Stern setzen oder wegnehmen (sonst: die ersten elf),
 *   - einen festen Platz vergeben - er geht der Rechnung vor.
 * Gespeichert in prospects.json (/api/prospects, POST). Die oeffentliche Seite: /statistics?bereich=prospects.
 */

interface Zeile {
  rang: number; epicId: string; name: string; region: string; land: string | null; rating: number; stern: boolean;
  events: number | null; trend: number | null; manuell: boolean; platzFest: number | null; sternFest: boolean | null; entfernt?: boolean;
  erstes: { datum: number; windowId: string; titel: string; platz: number; art: 'fncs' | 'cup' } | null;
}
interface Antwort { titelJahr: number; liste: Zeile[]; regeln: { stand: number; kandidaten: number; referenz: number } | null }
interface Treffer { epicId: string; anzeige?: string; name?: string; regionen?: string[] }

const datum = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

export default function ProspectsPflege() {
  const t = useT();
  const [d, setD] = useState<Antwort | null>(null);
  const [erlaubt, setErlaubt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [region, setRegion] = useState('');
  const [filter, setFilter] = useState('');
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let weg = false;
    fetch('/api/prospects?verwaltung=1', { cache: 'no-store' })
      .then(async (r) => {
        if (weg) return;
        if (r.status === 403) { setErlaubt(false); return; }
        const j = await r.json() as Antwort;
        if (!weg) setD(j);
      })
      .catch(() => { if (!weg) setFehler(t('Liste nicht erreichbar')); });
    return () => { weg = true; };
  }, [version, t]);

  const senden = useCallback(async (epicId: string, aenderung: Record<string, unknown>) => {
    setLaeuft(epicId); setFehler('');
    try {
      const r = await fetch('/api/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicId, ...aenderung }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setFehler(t(j?.error ?? 'Speichern fehlgeschlagen'));
      setVersion((v) => v + 1);
    } catch { setFehler(t('Speichern fehlgeschlagen')); } finally { setLaeuft(null); }
  }, [t]);

  // Suche nach Name oder Konto-Id (dieselbe Suche wie oben auf der Statistikseite).
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) return undefined;
    let weg = false;
    const zeit = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((j) => { if (!weg) setTreffer(((Array.isArray(j?.spieler) ? j.spieler : []) as Treffer[]).filter((x) => /^[0-9a-f]{32}$/.test(x.epicId)).slice(0, 8)); })
        .catch(() => { if (!weg) setTreffer([]); });
    }, 300);
    return () => { weg = true; clearTimeout(zeit); };
  }, [suche]);

  const rohId = suche.trim().replace(/-/g, '').toLowerCase();
  const sichtbar = useMemo(() => (d?.liste ?? []).filter((z) => !z.entfernt && (!region || z.region === region)
    && (!filter.trim() || z.name.toLowerCase().includes(filter.trim().toLowerCase()))).slice(0, 250), [d, region, filter]);
  const entfernt = (d?.liste ?? []).filter((z) => z.entfernt);
  const knopf = 'rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-300 disabled:opacity-40';
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-zinc-800 text-slate-400 hover:text-slate-200'}`;

  if (!erlaubt) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-400"><p className="text-sm"><T>Nur für Admins.</T></p></main>;
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-5xl">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<>Prospects {d?.titelJahr ?? ''}</>}
          text={<T>Die Liste rechnet sich alle sechs Stunden selbst. Hier nimmst du Spieler auf oder heraus, setzt Sterne und legst Plätze fest – ein fester Platz geht der Rechnung vor.</T>}
          rechts={<Link href="/statistics?bereich=prospects" className="rounded-lg border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/10"><T>Öffentliche Seite</T> ↗</Link>} />

        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-extrabold text-slate-100"><T>Spieler aufnehmen</T></h2>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Name oder Epic-Konto-Id')}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
          <ul className="mt-2 divide-y divide-zinc-800">
            {/^[0-9a-f]{32}$/.test(rohId) && !treffer.some((x) => x.epicId === rohId) && (
              <li className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">{rohId}</span>
                <button type="button" className={knopf} disabled={laeuft === rohId} onClick={() => { void senden(rohId, { aktion: 'add' }); setSuche(''); }}><T>Aufnehmen</T></button>
              </li>
            )}
            {(suche.trim().length >= 2 ? treffer : []).map((x) => {
              const drin = d?.liste.find((z) => z.epicId === x.epicId);
              const name = x.anzeige || x.name || x.epicId.slice(0, 8);
              return (
                <li key={x.epicId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{name} <span className="text-xs font-normal text-slate-500">{(x.regionen ?? []).join(', ')}</span></span>
                  {drin && !drin.entfernt ? <span className="text-xs text-slate-500">#{drin.rang} <T>schon in der Liste</T></span> : (
                    <button type="button" className={knopf} disabled={laeuft === x.epicId}
                      onClick={() => { void senden(x.epicId, { aktion: drin?.entfernt ? null : 'add', name, ...(x.regionen?.length === 1 ? { region: x.regionen[0] } : {}) }); setSuche(''); }}>
                      {drin?.entfernt ? <T>Wieder aufnehmen</T> : <T>Aufnehmen</T>}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}><T>Alle</T></button>
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('In der Liste suchen …')}
            className="ml-auto w-full max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
        </div>
        {d?.regeln && <p className="mb-2 text-[11px] text-slate-500">{t('Stand')}: {datum(d.regeln.stand)} · {d.regeln.kandidaten} {t('Kandidaten')} · {t('Referenz')} {d.regeln.referenz}</p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-2">#</th><th className="px-3 py-2"><T>Spieler</T></th><th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right">Rating</th><th className="px-2 py-2 text-right">Events</th><th className="px-3 py-2"><T>Erster Auftritt</T></th>
                <th className="px-2 py-2 text-center"><T>Stern</T></th><th className="px-2 py-2"><T>Fester Platz</T></th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {!d && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500"><T>Wird geladen …</T></td></tr>}
              {sichtbar.map((z) => (
                <tr key={z.epicId} className={`border-b border-zinc-800/60 ${z.manuell ? 'bg-emerald-500/[0.04]' : ''}`}>
                  <td className="px-3 py-1.5 text-xs font-bold tabular-nums text-slate-500">{z.rang}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 font-semibold text-slate-100">
                    <a href={`/statistics?spieler=${z.epicId}`} target="_blank" rel="noreferrer" className="hover:text-sky-300">{z.name}</a>
                    {z.manuell && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-bold text-emerald-300"><T>von Hand</T></span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-400">{z.region || '–'}</td>
                  <td className={`px-2 py-1.5 text-right text-xs font-bold tabular-nums ${z.rating > 1 ? 'text-emerald-400' : 'text-slate-300'}`}>{z.rating.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.events ?? '–'}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 text-[11px] text-slate-500" title={z.erstes?.windowId}>{z.erstes ? `${datum(z.erstes.datum)} · ${z.erstes.titel || z.erstes.windowId} · #${z.erstes.platz}` : '–'}</td>
                  <td className="px-2 py-1.5 text-center">
                    {/* Ein Klick schaltet weiter: automatisch -> Stern -> kein Stern -> automatisch. */}
                    <button type="button" disabled={laeuft === z.epicId} onClick={() => void senden(z.epicId, { stern: z.sternFest === null ? true : z.sternFest ? false : null })}
                      title={z.sternFest === null ? t('automatisch (erste elf)') : z.sternFest ? t('Stern von Hand') : t('kein Stern von Hand')}
                      className={`rounded-md px-2 py-0.5 text-sm ${z.stern ? 'text-sky-300' : 'text-slate-600'} ${z.sternFest !== null ? 'ring-1 ring-sky-500/60' : ''}`}>
                      {z.stern ? '★' : '☆'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <input key={`${z.epicId}-${z.platzFest ?? ''}`} defaultValue={z.platzFest ?? ''} inputMode="numeric" placeholder="–" aria-label={t('Fester Platz')}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(z.platzFest ?? '')) void senden(z.epicId, { platz: v ? Number(v) : null }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-14 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs tabular-nums text-slate-100 outline-none focus:border-sky-500" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" className={knopf} disabled={laeuft === z.epicId} onClick={() => void senden(z.epicId, { aktion: z.manuell ? null : 'remove' })}>
                      <T>Entfernen</T>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {entfernt.length > 0 && (
          <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-extrabold text-slate-100"><T>Von Hand entfernt</T> ({entfernt.length})</h2>
            <ul className="divide-y divide-zinc-800">
              {entfernt.map((z) => (
                <li key={z.epicId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-300">{z.name || z.epicId} <span className="text-xs text-slate-500">{z.region} · {z.rating.toFixed(2)}</span></span>
                  <button type="button" className={knopf} disabled={laeuft === z.epicId} onClick={() => void senden(z.epicId, { aktion: null })}><T>Wieder aufnehmen</T></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
