'use client';

/*
 * Tournament Maps - die Karten vergangener Cups.
 *
 * Der Betreiber (1.10.2026): im Dashboard unter dem Schnellzugriff soll es
 * eine Stelle geben, an der man sieht, wo die Teams vor einem Cup gelandet
 * sind - "Maps, Tournament Maps oder so". Nicht im Spielerprofil der
 * Statistik, wo der erste Entwurf stand.
 *
 * Gelesen werden die veroeffentlichten Turnierkarten (/api/turnier-karten),
 * die der Betreiber selbst belegt hat. Hier wird nichts gelegt und nichts
 * verschoben. Wer ein Epic-Konto verknuepft hat, sieht oben, wo das eigene
 * Team lag.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

interface Karte {
  id: string; titel: string; cupTitel: string | null; region: string | null;
  windowId: string | null; spiele: string | null; bildTitel: string | null;
  teams: number; platziert: number; geaendert: number; datum: number | null;
}
interface MeineKarte {
  id: string; spot: string | null; mitspieler: string[];
}

const DATUM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <Link href="/admin" className="text-xs text-slate-500 transition hover:text-sky-400">
          ← <T>Dashboard</T>
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100"><T>Tournament Maps</T></h1>
        <p className="mt-1 text-sm text-slate-400">
          <T>Wo die Teams vor jedem Cup gelandet sind. Karte öffnen, Namen und Breitbild lassen sich dort umschalten.</T>
        </p>

        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Cup suchen …')}
          className="mt-4 w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5
                     text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />

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

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {sichtbar.map((k) => {
            const ich = meine.get(k.id);
            return (
              <Link key={k.id} href={`/maps?id=${encodeURIComponent(k.id)}`}
                className={`group rounded-xl border px-4 py-3.5 transition hover:border-sky-500 hover:bg-zinc-900/70 ${
                  ich ? 'border-sky-500/50 bg-sky-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-100 group-hover:text-sky-400">{k.titel}</span>
                  {k.region && k.region !== 'GLOBAL' && (
                    <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-slate-400">{k.region}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {k.platziert} / {k.teams} <T>Teams gesetzt</T>
                  {k.spiele ? <> · {k.spiele}</> : null}
                  {k.bildTitel ? <> · {k.bildTitel}</> : null}
                  {k.datum ? <> · {DATUM.format(new Date(k.datum))}</> : null}
                </p>
                {ich && (
                  <p className="mt-2 text-xs font-semibold text-sky-400">
                    <T>Dein Team</T>: {ich.mitspieler.join(' + ')}{ich.spot ? <> · {ich.spot}</> : null}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
