'use client';

/*
 * Eine Kennzahl der Player Stats in voller Laenge - als Ansicht auf der Seite, nicht als Fenster daruebergelegt (Betreiber, 29.10.2026, mit
 * Osirions "Damage Ratio - Cumulative Leaderboard" als Vorbild): oben der Weg zurueck zur Uebersicht, links die Tabelle mit Suche und Seiten,
 * rechts alle Werte des gewaehlten Spielers und der Weg zu seinen Details.
 *
 * Geladen wird seitenweise von /api/cup-spieler?kennzahl=... - ueber ALLE Spieler des Spieltags ("bei Open Cups ... alle 10.000 Spieler").
 */

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import type { KachelListe } from '@/app/components/StatKacheln';

type Zeile = Record<string, unknown> & { epicId: string; name: string; land?: string; statRang: number; platz?: number | null; spiele?: number };
interface Antwort { zeilen: Zeile[]; gesamt: number; gefunden: number; seiten: number; seite: number }

/** Welche Spalten neben der Kennzahl stehen - was zu ihr gehoert (wie bei Osirion: Damage Ratio mit Dealt und Taken). */
const DAZU: Record<string, string[]> = {
  quote: ['damage', 'damageTaken'], damage: ['quote', 'hits'], elims: ['knocks', 'elimsJeMatch'], clutch: ['elims', 'quote'],
  timeInStorm: ['timeAlive', 'spiele'], timeAlive: ['timeInStorm', 'spiele'], distanz: ['timeAlive', 'spiele'], hits: ['headshots', 'damage'],
  mats: ['builds', 'spiele'], builds: ['mats', 'spiele'], knocks: ['elims', 'kd'], elimsJeMatch: ['elims', 'spiele'], kd: ['elims', 'tode'],
  headshots: ['hits', 'damage'], reboots: ['timeAlive', 'spiele'], damageTaken: ['damage', 'quote'], assists: ['elims', 'damage'],
};
const NEBEN: Record<string, KachelListe> = {
  spiele: { feld: 'spiele', titel: 'Spiele' }, tode: { feld: 'tode', titel: 'Tode' },
};

function alsZeit(sek: number): string {
  const s = Math.max(0, Math.round(sek));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export default function StatVollansicht({ kachel, alle, quelle, zurueck, zuDetails }: {
  kachel: KachelListe;
  /** Alle Kennzahlen - fuer die Spalten und die Werte des gewaehlten Spielers. */
  alle: KachelListe[];
  /** Die Abfrage der Player Stats dieses Spieltags (/api/cup-spieler?window=...), ohne Kennzahl. */
  quelle: string;
  zurueck: () => void;
  /** Zu den Werten dieses Spielers je Match (Reiter mit der Spieler-Suche). */
  zuDetails?: (s: { id: string; name: string }) => void;
}) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [seite, setSeite] = useState(1);
  const [suche, setSuche] = useState('');
  const [frage, setFrage] = useState('');
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Zeile | null>(null);

  const kennung = useMemo(() => new Map([...alle, ...Object.values(NEBEN)].map((k) => [k.feld, k])), [alle]);
  const spalten = [kachel, ...(DAZU[kachel.feld] ?? ['elims', 'spiele']).map((f) => kennung.get(f)).filter((k): k is KachelListe => !!k)];

  // Die Suche erst nach einer kurzen Pause schicken, nicht bei jedem Buchstaben.
  useEffect(() => {
    const uhr = setTimeout(() => { setFrage(suche.trim()); setSeite(1); }, 350);
    return () => clearTimeout(uhr);
  }, [suche]);

  useEffect(() => {
    let weg = false;
    setLaedt(true); setFehler(false);
    fetch(`${quelle}&kennzahl=${encodeURIComponent(kachel.feld)}&seite=${seite}&pro=50${frage ? `&q=${encodeURIComponent(frage)}` : ''}`)
      .then((r) => r.json())
      .then((j: Antwort) => {
        if (weg) return;
        if (!Array.isArray(j?.zeilen)) { setFehler(true); return; }
        setDaten(j);
        setGewaehlt((alt) => j.zeilen.find((z) => z.epicId === alt?.epicId) ?? j.zeilen[0] ?? null);
      })
      .catch(() => { if (!weg) setFehler(true); })
      .finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [quelle, kachel.feld, seite, frage]);

  // Mit Escape zurueck - wie das Fenster vorher.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zurueck(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zurueck]);

  const zeigen = (k: KachelListe, roh: unknown) => {
    const v = Number(roh);
    if (roh == null || !Number.isFinite(v)) return '—';
    if (k.format === 'zeit') return alsZeit(v);
    if (k.format === 'km') return `${(v / 1000).toLocaleString(ort, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
    return v.toLocaleString(ort, { minimumFractionDigits: k.nachkomma ?? 0, maximumFractionDigits: k.nachkomma ?? 0 });
  };
  const wertVon = (z: Zeile, f: string) => z[f === 'elims' && z.elims == null ? 'kills' : f];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold text-slate-50"><T>{kachel.titel}</T> · <T>Bestenliste</T></h2>
        <button type="button" onClick={zurueck}
          className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-slate-200
                     transition hover:border-sky-500 hover:text-sky-400">
          <span aria-hidden="true">←</span> <T>Zurück zur Übersicht</T>
        </button>
        {daten && (
          <span className="text-sm text-slate-400">{daten.gesamt.toLocaleString(ort)} <T>Spieler mit einem Wert</T></span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
              className="w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
            {laedt && <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" aria-hidden="true" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[13px] font-semibold text-slate-300">
                  <th className="w-14 px-4 py-3 text-center">#</th>
                  <th className="px-2 py-3"><T>Spielername</T></th>
                  {spalten.map((k, i) => (
                    <th key={k.feld} className={`px-3 py-3 text-right ${i === 0 ? 'text-sky-400' : ''}`}><T>{k.titel}</T></th>
                  ))}
                  <th className="px-4 py-3 text-right"><T>Platzierung</T></th>
                </tr>
              </thead>
              <tbody>
                {(daten?.zeilen ?? []).map((z) => (
                  <tr key={z.epicId} onClick={() => setGewaehlt(z)}
                    className={`cursor-pointer border-t border-zinc-900 transition ${gewaehlt?.epicId === z.epicId ? 'bg-sky-500/10' : 'hover:bg-zinc-900/60'}`}>
                    <td className={`px-4 py-3.5 text-center tabular-nums ${z.statRang === 1 ? 'font-bold text-sky-400' : 'text-slate-400'}`}>{z.statRang}</td>
                    <td className="px-2 py-3.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TeamFlagge groesse={22} laender={[z.land || undefined]} />
                        <span className="truncate font-medium text-slate-100">{z.name}</span>
                      </span>
                    </td>
                    {spalten.map((k, i) => (
                      <td key={k.feld} className={`px-3 py-3.5 text-right tabular-nums ${i === 0 ? 'font-bold text-slate-50' : 'text-slate-300'}`}>
                        {zeigen(k, wertVon(z, k.feld))}
                      </td>
                    ))}
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{typeof z.platz === 'number' ? `#${z.platz}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!laedt && !fehler && !daten?.zeilen.length && (
              <p className="px-4 py-10 text-center text-sm text-slate-500"><T>Kein Spieler gefunden.</T></p>
            )}
            {fehler && (
              <p className="px-4 py-10 text-center text-sm text-slate-400"><T>Der Server hat gerade nicht geantwortet (vielleicht startet er neu) - bitte in einer Minute noch einmal.</T></p>
            )}
          </div>
          {daten && daten.seiten > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
              <button type="button" disabled={seite <= 1 || laedt} onClick={() => setSeite((n) => Math.max(1, n - 1))}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 disabled:opacity-40">
                ← <T>Vorherige Seite</T>
              </button>
              <span className="text-sm text-slate-400">
                {t('Seite {a} von {b}').replace('{a}', String(daten.seite)).replace('{b}', daten.seiten.toLocaleString(ort))}
              </span>
              <button type="button" disabled={seite >= daten.seiten || laedt} onClick={() => setSeite((n) => n + 1)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 disabled:opacity-40">
                <T>Nächste Seite</T> →
              </button>
            </div>
          )}
        </div>

        {/* Der gewaehlte Spieler mit allen Werten - wie rechts bei Osirion. */}
        <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-950 p-5 lg:sticky lg:top-24">
          {gewaehlt ? (
            <>
              <p className="text-center text-xl font-extrabold text-slate-50">
                <T>Rang</T> #{gewaehlt.statRang} <span className="font-semibold text-slate-500">/ {daten?.gesamt.toLocaleString(ort)}</span>
              </p>
              <p className="mt-3 flex items-center justify-center gap-2 border-y border-zinc-800 py-3 text-sm font-semibold text-slate-100">
                <TeamFlagge groesse={22} laender={[gewaehlt.land || undefined]} />
                <span className="truncate">{gewaehlt.name}</span>
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                {[NEBEN.spiele, ...alle].filter((k) => wertVon(gewaehlt, k.feld) != null && Number.isFinite(Number(wertVon(gewaehlt, k.feld)))).map((k) => (
                  <div key={k.feld} className="flex items-center justify-between gap-3">
                    <dt className={`font-semibold ${k.feld === kachel.feld ? 'text-sky-400' : 'text-slate-300'}`}><T>{k.titel}</T>:</dt>
                    <dd className="tabular-nums text-slate-100">{zeigen(k, wertVon(gewaehlt, k.feld))}</dd>
                  </div>
                ))}
                {typeof gewaehlt.platz === 'number' && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-semibold text-slate-300"><T>Platzierung</T>:</dt>
                    <dd className="tabular-nums text-slate-100">#{gewaehlt.platz}</dd>
                  </div>
                )}
              </dl>
              {zuDetails && (
                <button type="button" onClick={() => zuDetails({ id: gewaehlt.epicId, name: gewaehlt.name })}
                  className="mt-4 w-full text-center text-sm text-slate-400 underline underline-offset-4 transition hover:text-sky-400">
                  <T>Details in den Spieler-Stats</T>
                </button>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{laedt ? <T>Wird geladen …</T> : <T>Kein Spieler gefunden.</T>}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
