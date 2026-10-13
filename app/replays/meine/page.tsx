'use client';

/*
 * Meine Replays: die Cups, in denen das verifizierte Epic-Konto gespielt hat - jeder Cup mit jeder einzelnen Runde, zum Abspielen.
 *
 * Der Betreiber (13.10.2026): "wenn man sich mit Epic verifiziert hat, My Cups sehen ... jeden Cup mit jeder einzelnen Runde von seinen
 * Spielen". Es stehen die Games da, die ausgewertet sind (Epic haelt Replays 31 Tage; die grossen offenen Runden werden nicht gelesen) -
 * nicht jeder Cup, in dem jemand je gespielt hat. Ein Klick oeffnet das Game mit dem eigenen Team markiert.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import EpicMeldung from '@/app/components/EpicMeldung';
import ReplayUmschalter from '../ReplayUmschalter';
import { useZugang } from '@/app/lib/zugang';
import { replayDatum, replayUhrzeit, tagName, schoenerTitel, ohneMarke } from '@/lib/replayNamen';

interface Game { nr: number; id: string; beginn?: string; platz: number | null; kills: number; teamKills: number; mitspieler: string[]; sieger: boolean }
interface Tag { windowId: string; region: string; games: Game[] }
interface Cup { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: Tag[] }
interface Antwort { fertig: boolean; fehlen: number; gesamt: number; cups: Cup[] }

export default function MeineReplays() {
  const zugang = useZugang();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    if (!zugang.epicId) return undefined;
    let weg = false; let uhr: ReturnType<typeof setTimeout> | undefined;
    const holen = () => {
      fetch(`/api/replay?meine=${zugang.epicId}`, { cache: 'no-store' }).then((r) => r.json())
        .then((j: Antwort) => {
          if (weg) return;
          if (!Array.isArray(j?.cups)) { setFehler(true); return; }
          setDaten(j); setFehler(false);
          // Der Aufbau des Verzeichnisses laeuft in Stuecken - solange etwas fehlt, noch einmal fragen.
          if (!j.fertig) uhr = setTimeout(holen, 2500);
        })
        .catch(() => { if (!weg) setFehler(true); });
    };
    holen();
    return () => { weg = true; if (uhr) clearTimeout(uhr); };
  }, [zugang.epicId]);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <ReplayUmschalter aktiv="meine" />
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl"><T>Meine Replays</T></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400"><T>Deine Cups und jede Runde, in der du gespielt hast - zum Abspielen, mit deinem Team markiert.</T></p>

        <div className="mt-4 max-w-xl"><EpicMeldung /></div>

        {zugang.laedt && <div className="mt-6"><LadeSchirm /></div>}

        {!zugang.laedt && !zugang.epicId && (
          <a href="/api/auth/epic/authorize?zurueck=%2Freplays%2Fmeine"
            className="mt-6 flex max-w-xl items-center gap-4 rounded-2xl border border-white/[0.1] bg-zinc-900/60 p-5 transition hover:border-sky-500/70 hover:bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/epic.svg" alt="" className="h-10 w-10 shrink-0" />
            <span>
              <span className="block text-base font-black text-slate-50"><T>Epic-Games-Konto verifizieren</T></span>
              <span className="block text-sm text-slate-400"><T>Melde dich mit Epic Games an, um hier deine eigenen Cups zu sehen.</T></span>
            </span>
          </a>
        )}

        {zugang.epicId && fehler && !daten && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>Die Replays ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
        {zugang.epicId && !daten && !fehler && <div className="mt-6"><LadeSchirm /></div>}

        {daten && !daten.fertig && (
          <div className="mt-6 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-200">
            <T>Die Replays werden gerade nach deinem Konto durchsucht</T> … {daten.gesamt - daten.fehlen} / {daten.gesamt}
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-sky-400 transition-all" style={{ width: `${Math.round(((daten.gesamt - daten.fehlen) / Math.max(1, daten.gesamt)) * 100)}%` }} /></span>
          </div>
        )}

        {daten && daten.cups.length === 0 && daten.fertig && (
          <p className="mt-6 rounded-xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 text-sm text-slate-300">
            <T>In den ausgewerteten Replays steht dein Konto noch nicht. Ausgewertet werden die Finals und die Cups, deren Runden klein genug sind - große offene Runden nicht.</T>
          </p>
        )}

        <div className="mt-6 space-y-4">
          {(daten?.cups ?? []).map((c) => (
            <section key={c.eventId} className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4">
              <p className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[16px] font-bold text-slate-50">{schoenerTitel(c.titel)}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{c.season} · {replayDatum(c.beginn)}</span>
              </p>
              <div className="mt-3 space-y-3">
                {c.tage.map((d, i) => (
                  <div key={d.windowId}>
                    <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{d.region}</span>
                      <Link href={`/replays/${encodeURIComponent(d.windowId)}`} className="text-sky-300 hover:underline">{c.tage.length > 1 ? tagName(d.windowId, i) : replayDatum(d.games[0]?.beginn)}</Link>
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {d.games.map((g) => (
                        <li key={g.id}>
                          <Link href={`/replays/${encodeURIComponent(d.windowId)}/${g.nr}?spieler=${zugang.epicId}`}
                            className="block rounded-xl border border-white/[0.07] bg-zinc-950/50 px-3 py-2.5 transition hover:border-sky-500 hover:bg-zinc-900">
                            <span className="flex items-baseline justify-between">
                              <span className="text-sm font-black uppercase text-slate-50">Game {g.nr}</span>
                              <span className="text-[11px] tabular-nums text-slate-500">{replayUhrzeit(g.beginn)}</span>
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-slate-300">
                              {g.platz !== null && <span className={g.sieger ? 'font-black text-amber-300' : ''}><T>Platz</T> #{g.platz}</span>}
                              <span>{g.kills} Elims{g.teamKills !== g.kills ? ` (Team ${g.teamKills})` : ''}</span>
                            </span>
                            {g.mitspieler.length > 0 && <span className="mt-0.5 block truncate text-[10px] uppercase text-slate-500">+ {g.mitspieler.map(ohneMarke).join(' · ')}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
