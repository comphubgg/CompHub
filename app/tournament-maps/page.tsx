'use client';

/*
 * Tournament Maps - die Karten vergangener Cups.
 *
 * Der Betreiber (1.10.2026): im Dashboard unter dem Schnellzugriff soll es
 * eine Stelle geben, an der man sieht, wo die Teams vor einem Cup gelandet
 * sind. Und danach: "wie bei eucompetitive, mit Thumbnail, einfacher Titel,
 * ganz simpel - nicht einfach Text."
 *
 * Also Kacheln: das Bild, das Epic fuer den Cup verwendet, ein kurzer Titel
 * in Grossbuchstaben, das Datum. Mehr nicht. Gelesen werden die
 * veroeffentlichten Turnierkarten (/api/turnier-karten), die der Betreiber
 * selbst belegt hat; hier wird nichts gelegt und nichts verschoben. Wer ein
 * Epic-Konto verknuepft hat, sieht auf der Kachel, dass sein Team dabei ist.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

interface Karte {
  id: string; titel: string; cupTitel: string | null; region: string | null;
  windowId: string | null; spiele: string | null; bildTitel: string | null;
  teams: number; platziert: number; geaendert: number; datum: number | null;
  bild: string | null;
}
interface MeineKarte {
  id: string; spot: string | null; mitspieler: string[];
}

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "Performance Evaluation Cup · Event 1 · Round 2 · Finals" -> "PERFORMANCE EVALUATION CUP – EVENT 1 – ROUND 2 – FINALS" */
const einfach = (titel: string) => titel.replace(/\s*·\s*/g, ' – ').toUpperCase();

export default function TurnierKarten() {
  const t = useT();
  const [karten, setKarten] = useState<Karte[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [meine, setMeine] = useState<Map<string, MeineKarte>>(new Map());
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/turnier-karten?liste=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!weg) setKarten(Array.isArray(j?.karten) ? j.karten : []); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  // Wo das eigene Team lag - nur mit verknuepftem Epic-Konto.
  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const k = await (await fetch('/api/auth/check-admin', { cache: 'no-store' })).json();
        const id = typeof k?.epicId === 'string' ? k.epicId : '';
        if (!id) return;
        const j = await (await fetch(`/api/turnier-karten?spieler=${encodeURIComponent(id)}`, { cache: 'no-store' })).json();
        if (weg) return;
        setMeine(new Map((j?.karten ?? []).map((x: MeineKarte) => [x.id, x])));
      } catch { /* ohne verknuepftes Konto bleibt es bei der Liste */ }
    })();
    return () => { weg = true; };
  }, []);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (karten ?? []).filter((k) => !q || `${k.titel} ${k.cupTitel ?? ''} ${k.region ?? ''}`.toLowerCase().includes(q));
  }, [karten, suche]);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <Link href="/admin" className="text-xs text-slate-500 transition hover:text-sky-400">
          ← <T>Dashboard</T>
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-100"><T>Tournament Maps</T></h1>
          <input value={suche} onChange={(e) => setSuche(e.target.value)}
            placeholder={t('Cup suchen …')}
            className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2
                       text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
        </div>

        {fehler && (
          <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            <T>Die Karten ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T>
          </p>
        )}

        {karten === null && !fehler && (
          <p className="mt-6 text-sm text-slate-500"><T>Wird geladen …</T></p>
        )}

        {karten && !fehler && sichtbar.length === 0 && (
          <p className="mt-6 text-sm text-slate-500"><T>Keine Karte gefunden.</T></p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sichtbar.map((k) => {
            const ich = meine.get(k.id);
            return (
              <Link key={k.id} href={`/maps?id=${encodeURIComponent(k.id)}`}
                className={`group overflow-hidden rounded-xl border bg-zinc-900/50 transition
                            hover:border-sky-500 hover:bg-zinc-900 ${
                  ich ? 'border-sky-500/60' : 'border-zinc-800'}`}>
                {/* Das Bild, das Epic fuer den Cup verwendet - wie bei eucompetitive. */}
                <div className="relative aspect-video overflow-hidden bg-zinc-900">
                  {k.bild ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={k.bild} alt="" loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950
                                    text-3xl font-black text-sky-500/40">
                      MAP
                    </div>
                  )}
                  {k.region && k.region !== 'GLOBAL' && (
                    <span className="absolute right-2 top-2 rounded border border-white/20 bg-black/55 px-1.5 py-0.5
                                     text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">
                      {k.region}
                    </span>
                  )}
                  {ich && (
                    <span className="absolute left-2 top-2 rounded border border-sky-400/60 bg-sky-500/80 px-1.5 py-0.5
                                     text-[10px] font-bold uppercase tracking-wider text-white">
                      <T>Dein Team</T>
                    </span>
                  )}
                </div>
                <div className="px-3 pb-3 pt-2.5 text-center">
                  <p className="min-h-[2.6em] text-[13px] font-bold leading-snug tracking-wide text-slate-100">
                    {einfach(k.titel)}
                  </p>
                  <p className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[11px] text-slate-500">
                    {k.datum ? DATUM.format(new Date(k.datum)) : ''}
                    {k.datum ? ' · ' : ''}
                    {k.platziert} / {k.teams} <T>Teams gesetzt</T>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
