'use client';

/*
 * Ein Spieltag mit seinen Games: /replays/<Fenster-Kennung>. Die Adresse bleibt dauerhaft gleich; die Games sind in der Reihenfolge ihres
 * Beginns nummeriert, ein gespieltes Game behaelt seine Nummer.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { replayDatum, replayUhrzeit, tagName, ohneMarke, schoenerTitel } from '@/lib/replayNamen';

interface Game { id: string; nr: number; beginn?: string; ende?: number; sieger?: string[]; spieler?: number; zonen?: number }
interface Tag { windowId: string; eventId: string; titel: string; region: string; season: string; matches: Game[] }
interface Geschwister { windowId: string; matches: number }

export default function SpieltagSeite() {
  const params = useParams<{ tag: string }>();
  const tagId = decodeURIComponent(String(params?.tag ?? ''));
  const [tag, setTag] = useState<Tag | null>(null);
  const [geschwister, setGeschwister] = useState<Geschwister[]>([]);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!tagId) return undefined;
    let weg = false;
    setTag(null); setFehler('');
    fetch(`/api/replay?tag=${encodeURIComponent(tagId)}`).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
      .then(({ ok, j }) => { if (weg) return; if (ok && j?.tag) { setTag(j.tag); setGeschwister(j.geschwister ?? []); } else setFehler(j?.error ?? 'Die Replays ließen sich gerade nicht laden.'); })
      .catch(() => { if (!weg) setFehler('Die Replays ließen sich gerade nicht laden.'); });
    return () => { weg = true; };
  }, [tagId]);

  const chip = (an: boolean) => `rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <Link href="/replays" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">
          ← <T>Alle Replays</T>
        </Link>
        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!tag && !fehler && <div className="mt-6"><LadeSchirm /></div>}
        {tag && (
          <>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{schoenerTitel(tag.titel)}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{tag.region}</span>
              <span>{tag.season}</span>
              <span>{replayDatum(tag.matches[0]?.beginn)}</span>
              <span>{tag.matches.length} <T>Games</T></span>
            </p>

            {geschwister.length > 1 && (
              <div className="mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
                {geschwister.map((g, i) => (
                  <Link key={g.windowId} href={`/replays/${encodeURIComponent(g.windowId)}`} className={chip(g.windowId === tag.windowId)}>{tagName(g.windowId, i)}</Link>
                ))}
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tag.matches.map((m) => (
                <Link key={m.id} href={`/replays/${encodeURIComponent(tag.windowId)}/${m.nr}`}
                  className="group rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4 transition hover:-translate-y-0.5 hover:border-sky-500 hover:bg-zinc-900">
                  <p className="flex items-baseline justify-between">
                    <span className="text-xl font-black uppercase tracking-tight text-slate-50">Game {m.nr}</span>
                    <span className="text-[11px] tabular-nums text-slate-500">{replayUhrzeit(m.beginn)}</span>
                  </p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Sieger</T></p>
                  <p className="mt-0.5 min-h-[2.4em] text-[12px] font-bold uppercase leading-snug text-amber-300">{(m.sieger ?? []).map(ohneMarke).join(' · ') || '–'}</p>
                  <p className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{m.spieler ?? '–'} <T>Spieler</T> · {m.zonen ?? '–'} <T>Zonen</T></span>
                    <span className="font-bold text-sky-300 transition group-hover:translate-x-0.5"><T>Abspielen</T> →</span>
                  </p>
                </Link>
              ))}
            </div>
            <p className="mt-8 text-[11px] text-slate-600"><T>Diese Adresse bleibt dauerhaft gleich.</T> <code className="text-slate-500">/replays/{tag.windowId}</code></p>
          </>
        )}
      </div>
    </main>
  );
}
