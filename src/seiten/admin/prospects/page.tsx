import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import { Laedt, NurAdmins } from '../teile';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useT } from '../port/app/components/SprachProvider';
import { REGIONEN_REIHE } from '../port/lib/regionFarbe';

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
      .catch(() => { if (!weg) setFehler(t('List not reachable')); });
    return () => { weg = true; };
  }, [version, t]);

  const senden = useCallback(async (epicId: string, aenderung: Record<string, unknown>) => {
    setLaeuft(epicId); setFehler('');
    try {
      const r = await fetch('/api/prospects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicId, ...aenderung }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setFehler(t(j?.error ?? 'Saving failed'));
      setVersion((v) => v + 1);
    } catch { setFehler(t('Saving failed')); } finally { setLaeuft(null); }
  }, [t]);

  const sichtbar = useMemo(() => (d?.liste ?? []).filter((z) => !z.ausgeblendet && (!region || z.region === region)
    && (!filter.trim() || z.name.toLowerCase().includes(filter.trim().toLowerCase()))).slice(0, 300), [d, region, filter]);
  const aus = Object.entries(d?.ausgeblendet ?? {});
  const knopf = 'rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:border-akz hover:text-akz disabled:opacity-40';
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-akz text-[#04050a]' : 'border border-white/10 text-white/55 hover:text-white/85'}`;

  if (!erlaubt) {
    return <NurAdmins />;
  }

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<>Prospects {d?.titelJahr ?? ''}</>}
          text={<T>The list recomputes itself every six hours from our own data only (placements, finals, replays, prize money). Nobody sets the order or the stars by hand; here you can only hide an account – e.g. when it is banned or two accounts belong to the same person.</T>}
          rechts={<Link href="/statistics?bereich=prospects" className="rounded-lg border border-akz/50 px-3 py-2 text-sm font-semibold text-akz hover:bg-akz/10"><T>Public page</T> ↗</Link>} />

        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}><T>Alle</T></button>
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Search the list …')}
            className="ml-auto w-full max-w-[220px] fl !rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-akz" />
        </div>
        {d?.kopf && <p className="mb-2 text-[11px] text-white/40">{t('Stand')}: {datum(d.kopf.stand)} · {d.kopf.prospects} {t('players meet the conditions')}</p>}
        {d && !d.kopf && <p className="mb-2 text-[11px] text-amber-300"><T>The list is being recomputed right now.</T></p>}

        <div className="overflow-x-auto fl !rounded-xl">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                <th className="px-3 py-2">#</th><th className="px-3 py-2"><T>Spieler</T></th><th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right">Score</th><th className="px-2 py-2 text-right"><T>Level</T></th><th className="px-2 py-2 text-right"><T>Spitze</T></th>
                <th className="px-2 py-2 text-right">Replay</th><th className="px-2 py-2 text-right"><T>± Form</T></th><th className="px-2 py-2 text-right">PR</th>
                <th className="px-2 py-2 text-right">$</th><th className="px-2 py-2"><T>1. Grand Final</T></th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {!d && <tr><td colSpan={12} className="px-3 py-8 text-center text-white/40"><T>Wird geladen …</T></td></tr>}
              {sichtbar.map((z) => (
                <tr key={z.epicId} className="border-b border-white/10">
                  <td className="px-3 py-1.5 text-xs font-bold tabular-nums text-white/40">{z.rang}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 font-semibold text-white">
                    <a href={`/statistics?spieler=${z.epicId}`} target="_blank" rel="noreferrer" className="hover:text-akz">{z.name}</a>{z.stern ? <span className="ml-1 text-akz">★</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-white/55">{z.region || '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums text-white/85">{z.score.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.niveau.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.spitze.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.replay?.toFixed(2) ?? '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.form != null && z.formVorher != null ? `${z.form - z.formVorher >= 0 ? '+' : ''}${(z.form - z.formVorher).toFixed(2)}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.pr ? `#${z.pr}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-white/55">{z.preisgeld.toLocaleString('de-DE')}</td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-white/40">{z.ersterGf ? `${monat(z.ersterGf)}${z.gf > 1 ? ` (${z.gf})` : ''}` : '–'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" className={knopf} disabled={laeuft === z.epicId} onClick={() => {
                      const grund = window.prompt(t('Why hide? (e.g. banned, second account)'));
                      if (grund !== null) void senden(z.epicId, { ausblenden: true, name: z.name, grund });
                    }}>
                      <T>Hide</T>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {aus.length > 0 && (
          <section className="mt-5 fl !rounded-2xl p-4">
            <h2 className="mb-2 text-sm font-extrabold text-white"><T>Hidden</T> ({aus.length})</h2>
            <ul className="divide-y divide-white/10">
              {aus.map(([id, e]) => (
                <li key={id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-white/70">{e.name || id} {e.grund ? <span className="text-xs text-white/40">· {e.grund}</span> : null}</span>
                  <button type="button" className={knopf} disabled={laeuft === id} onClick={() => void senden(id, { ausblenden: false })}><T>Show again</T></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
