'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT } from '@/app/components/SprachProvider';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';

/*
 * Prospects ansehen (Betreiber, 15.11.2026; neu am 16.11.2026). Die Liste rechnet allein scripts/prospects.mjs aus unseren Daten - keine Seed-Liste, keine
 * Aufnahme, kein Stern und kein Platz von Hand mehr. Hier laesst sich ein Konto nur ausblenden (z. B. gesperrt, oder zwei Konten derselben Person) und wieder zeigen.
 * Gespeichert in prospects.json -> ausgeblendet (/api/prospects, POST). Die oeffentliche Seite: /statistics?bereich=prospects.
 */

interface Zeile {
  rang: number; epicId: string; name: string; region: string; score: number; niveau: number; spitze: number; replay: number | null; stern: boolean;
  preisgeld: number; gf: number; ersterGf: number | null; fruehSaisons: number; erstes: number | null; pr: number | null; ausgeblendet: boolean;
  form: number | null; formVorher: number | null;
}
interface Antwort {
  titelJahr: number; liste: Zeile[]; ausgeblendet: Record<string, { name?: string; grund?: string }>;
  kopf: { stand: number; prospects: number } | null;
}

const datum = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const monat = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' });

export default function ProspectsPflege() {
  const t = useT();
  const [d, setD] = useState<Antwort | null>(null);
  const [erlaubt, setErlaubt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [region, setRegion] = useState('');
  const [filter, setFilter] = useState('');
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

  const sichtbar = useMemo(() => (d?.liste ?? []).filter((z) => !z.ausgeblendet && (!region || z.region === region)
    && (!filter.trim() || z.name.toLowerCase().includes(filter.trim().toLowerCase()))).slice(0, 300), [d, region, filter]);
  const aus = Object.entries(d?.ausgeblendet ?? {});
  const knopf = 'rounded-md border border-zinc-700 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-300 disabled:opacity-40';
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-zinc-800 text-slate-400 hover:text-slate-200'}`;

  if (!erlaubt) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-400"><p className="text-sm"><T>Nur für Admins.</T></p></main>;
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-5xl">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<>Prospects {d?.titelJahr ?? ''}</>}
          text={<T>Die Liste rechnet sich alle sechs Stunden allein aus unseren Daten neu (Platzierungen, Finals, Replays, Preisgeld). Reihenfolge und Sterne setzt niemand von Hand; hier lässt sich nur ein Konto ausblenden – etwa wenn es gesperrt ist oder zwei Konten derselben Person gehören.</T>}
          rechts={<Link href="/statistics?bereich=prospects" className="rounded-lg border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/10"><T>Öffentliche Seite</T> ↗</Link>} />

        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}><T>Alle</T></button>
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('In der Liste suchen …')}
            className="ml-auto w-full max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
        </div>
        {d?.kopf && <p className="mb-2 text-[11px] text-slate-500">{t('Stand')}: {datum(d.kopf.stand)} · {d.kopf.prospects} {t('Spieler erfüllen die Bedingungen')}</p>}
        {d && !d.kopf && <p className="mb-2 text-[11px] text-amber-300"><T>Die Liste wird gerade neu gerechnet.</T></p>}

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-2">#</th><th className="px-3 py-2"><T>Spieler</T></th><th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right">Score</th><th className="px-2 py-2 text-right"><T>Niveau</T></th><th className="px-2 py-2 text-right"><T>Spitze</T></th>
                <th className="px-2 py-2 text-right">Replay</th><th className="px-2 py-2 text-right"><T>± Form</T></th><th className="px-2 py-2 text-right">PR</th>
                <th className="px-2 py-2 text-right">$</th><th className="px-2 py-2"><T>1. Grand Final</T></th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {!d && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-500"><T>Wird geladen …</T></td></tr>}
              {sichtbar.map((z) => (
                <tr key={z.epicId} className="border-b border-zinc-800/60">
                  <td className="px-3 py-1.5 text-xs font-bold tabular-nums text-slate-500">{z.rang}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 font-semibold text-slate-100">
                    <a href={`/statistics?spieler=${z.epicId}`} target="_blank" rel="noreferrer" className="hover:text-sky-300">{z.name}</a>{z.stern ? <span className="ml-1 text-sky-300">★</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-400">{z.region || '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums text-slate-200">{z.score.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.niveau.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.spitze.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.replay?.toFixed(2) ?? '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.form != null && z.formVorher != null ? `${z.form - z.formVorher >= 0 ? '+' : ''}${(z.form - z.formVorher).toFixed(2)}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.pr ? `#${z.pr}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-slate-400">{z.preisgeld.toLocaleString('de-DE')}</td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-slate-500">{z.ersterGf ? `${monat(z.ersterGf)}${z.gf > 1 ? ` (${z.gf})` : ''}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" className={knopf} disabled={laeuft === z.epicId} onClick={() => {
                      const grund = window.prompt(t('Warum ausblenden? (z. B. gesperrt, Zweitkonto)'));
                      if (grund !== null) void senden(z.epicId, { ausblenden: true, name: z.name, grund });
                    }}>
                      <T>Ausblenden</T>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {aus.length > 0 && (
          <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-extrabold text-slate-100"><T>Ausgeblendet</T> ({aus.length})</h2>
            <ul className="divide-y divide-zinc-800">
              {aus.map(([id, e]) => (
                <li key={id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-300">{e.name || id} {e.grund ? <span className="text-xs text-slate-500">· {e.grund}</span> : null}</span>
                  <button type="button" className={knopf} disabled={laeuft === id} onClick={() => void senden(id, { ausblenden: false })}><T>Wieder zeigen</T></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
