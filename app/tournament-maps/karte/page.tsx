'use client';

/*
 * Die Karte eines Cups - mit den Spielern und den Ländern.
 *
 * Der Betreiber (12.10.2026): beim Klick auf einen Cup soll die Karte kommen, dazu "alle Players" und - wie bei den
 * Heats der Solos - eine Länderliste ("Players by Country"). Alles kommt von Noble Practice (/api/maps-karte); die
 * Karte ist im Kartenstil des Werkzeugs gezeichnet (app/globals-solos/Bausteine, app/lib/kartenStil), nicht in Nobles Farben.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import type { SolosFenster } from '@/lib/globalsSolos';
import { Karte, Gesicht } from '@/app/globals-solos/Bausteine';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; saisonKurz: string; saisonName: string; bild: string | null;
}

const DATUM = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

type Reiter = 'karte' | 'spieler' | 'laender';

export default function KartenSeite() {
  const t = useT();
  const [fenster, setFenster] = useState<SolosFenster | null>(null);
  const [meta, setMeta] = useState<Eintrag | null>(null);
  const [turnier, setTurnier] = useState('');
  const [fehler, setFehler] = useState('');
  const [reiter, setReiter] = useState<Reiter>('karte');
  const [suche, setSuche] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const [tid, r, w] = [p.get('t') ?? '', p.get('r') ?? '', p.get('w') ?? ''];
    if (!tid || !r || !w) { setFehler('Diese Karte ist nicht angegeben.'); return undefined; }
    let weg = false;
    fetch(`/api/maps-karte?t=${encodeURIComponent(tid)}&r=${encodeURIComponent(r)}&w=${encodeURIComponent(w)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (weg) return; if (j?.ok) { setFenster(j.fenster); setTurnier(j.turnier ?? ''); } else setFehler(j?.error || 'Die Karte ließ sich nicht laden.'); })
      .catch(() => { if (!weg) setFehler('Die Karte ließ sich nicht laden.'); });
    fetch('/api/maps-liste')
      .then((x) => x.json())
      .then((j) => { if (!weg && j?.ok) setMeta((j.eintraege as Eintrag[]).find((e) => e.windowId === w && e.region === r) ?? null); })
      .catch(() => { /* ohne Kopf bleibt es beim Namen des Fensters */ });
    return () => { weg = true; };
  }, []);

  const spieler = useMemo(() => [...(fenster?.spieler ?? [])].sort((a, b) => a.anzeige.localeCompare(b.anzeige)), [fenster]);
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? spieler.filter((s) => s.anzeige.toLowerCase().includes(q) || (s.land ?? '').toLowerCase() === q) : spieler;
  }, [spieler, suche]);

  const laender = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spieler) { const k = s.land ?? ''; m.set(k, (m.get(k) ?? 0) + 1); }
    let namen: Intl.DisplayNames | null = null;
    try { namen = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* alte Browser: dann der Code */ }
    return [...m.entries()].map(([code, n]) => ({
      code, n, name: code ? (() => { try { return namen?.of(code) ?? code; } catch { return code; } })() : t('Unbekannt'),
    })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [spieler, t]);

  const titel = meta?.titel || (fenster ? `${turnier} · ${fenster.name}` : '');
  const chip = (an: boolean) => `rounded-lg px-4 py-2 text-sm font-semibold transition ${an
    ? 'bg-sky-500 text-white' : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        {meta?.bild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(meta.bild)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/70 to-zinc-950" />
        <div className="relative mx-auto max-w-[1300px] px-4 py-8">
          <Link href="/tournament-maps" className="text-xs text-slate-400 transition hover:text-sky-400">← <T>Alle Maps</T></Link>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {meta?.bild && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={encodeURI(meta.bild)} alt="" className="h-20 w-36 rounded-lg border border-white/10 object-cover shadow-xl" />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-black uppercase tracking-tight sm:text-4xl">{titel || t('Karte')}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {meta?.region && <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-slate-200">{meta.region}</span>}
                {meta?.saisonKurz && <span>{meta.saisonKurz}</span>}
                {(fenster?.start || meta?.datum) && <span>{DATUM.format(new Date(fenster?.start ?? (meta?.datum as number)))}</span>}
                {fenster && <span>{fenster.spieler.length} <T>Spieler</T></span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1300px] px-4 py-6">
        {fehler && !fenster && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!fenster && !fehler && <LadeSchirm />}

        {fenster && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {([['karte', 'Karte'], ['spieler', 'Spieler'], ['laender', 'Länder']] as const).map(([k, tt]) => (
                <button key={k} type="button" onClick={() => setReiter(k)} className={chip(reiter === k)}><T>{tt}</T></button>
              ))}
            </div>

            {reiter === 'karte' && (
              <div className="mt-5">
                {fenster.formen.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500"><T>Zu diesem Spieltag hat Noble noch keine Landepunkte.</T></p>
                ) : <Karte f={fenster} />}
                <p className="mt-2 text-[11px] text-slate-600"><T>Die Landepunkte und wer wo steht, kommen unverändert von Noble Practice.</T></p>
              </div>
            )}

            {reiter === 'spieler' && (
              <div className="mt-5">
                <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
                  className="mb-4 w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                {gefiltert.length === 0 ? (
                  <p className="text-sm text-slate-500"><T>Kein Spieler gefunden.</T></p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {gefiltert.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                        <Gesicht s={s} />
                        <TeamFlagge groesse={16} laender={[s.land ?? undefined]} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{s.anzeige}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {reiter === 'laender' && (
              <div className="mt-5 max-w-2xl">
                <h2 className="mb-3 text-lg font-black uppercase tracking-wide text-slate-100"><T>Spieler nach Land</T></h2>
                <ul className="space-y-1.5">
                  {laender.map((l) => (
                    <li key={l.code || 'x'} className="flex items-center gap-3 text-sm">
                      <span className="flex w-44 shrink-0 items-center gap-2"><TeamFlagge groesse={16} laender={[l.code || undefined]} /><span className="truncate">{l.name}</span></span>
                      <span className="relative h-5 flex-1 overflow-hidden rounded bg-white/[0.05]">
                        <span className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-sky-700 to-sky-400" style={{ width: `${(l.n / (laender[0]?.n || 1)) * 100}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right font-bold tabular-nums text-slate-200">{l.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
