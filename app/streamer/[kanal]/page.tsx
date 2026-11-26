'use client';

/*
 * Streamer-Seite (lib/streamerSeite, app/api/streamer-seite) - vorerst nur fuer den Admin. Kanal, Live-Status, Stream-Plan, Clips, Link aufs
 * CompHub-Spielerprofil und ein Post-Kanal mit Community-Fragen.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Daten {
  login: string; name: string; bio: string; bild: string; banner: string | null;
  live: { titel: string; spiel: string; zuschauer: number; seit: string; vorschau: string } | null;
  titel: string | null; spiel: string | null;
  plan: Array<{ start: string; ende: string | null; titel: string; spiel: string | null }>;
  clips: Array<{ url: string; titel: string; aufrufe: number; datum: string; bild: string; dauer: number }>;
  epicId: string | null;
  posts: Array<{ id: string; art: 'post' | 'frage'; text: string; t: number }>;
}

const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/50 p-5';
const zeit = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function StreamerSeite({ params }: { params: Promise<{ kanal: string }> }) {
  const { kanal } = use(params);
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState('');
  const [text, setText] = useState('');
  const [art, setArt] = useState<'post' | 'frage'>('post');

  const laden = useCallback(() => {
    fetch(`/api/streamer-seite?kanal=${encodeURIComponent(kanal.toLowerCase())}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!j.ok) throw new Error(j.error ?? 'Fehler'); setD(j); })
      .catch((e) => setFehler(e.message));
  }, [kanal]);
  useEffect(() => { laden(); }, [laden]);

  async function senden() {
    if (!text.trim()) return;
    await fetch('/api/streamer-seite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kanal, art, text }) });
    setText(''); laden();
  }
  async function loeschen(id: string) {
    await fetch(`/api/streamer-seite?kanal=${encodeURIComponent(kanal)}&id=${id}`, { method: 'DELETE' }); laden();
  }

  if (fehler) return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-300">{fehler}</main>;
  if (!d) return <main className="grid min-h-screen place-items-center bg-zinc-950 text-slate-400">Loading…</main>;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-sky-900/60 via-zinc-900 to-zinc-950 sm:h-56">
        {d.banner && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.banner} alt="" className="h-full w-full object-cover opacity-50" />}
      </div>
      <div className="mx-auto -mt-14 max-w-5xl px-4 pb-16">
        <header className="flex flex-wrap items-end gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.bild} alt={d.name} className="h-28 w-28 rounded-2xl border-4 border-zinc-950 object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-3xl font-bold">{d.name}</h1>
              {d.live && <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-400">{d.bio}</p>
          </div>
          <div className="flex gap-2">
            <a href={`https://twitch.tv/${d.login}`} target="_blank" rel="noopener" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500">Twitch</a>
            {d.epicId && <Link href={`/player/${d.epicId}`} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400">Comp stats</Link>}
          </div>
        </header>
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">Preview – only visible to the admin.</p>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {d.live ? (
              <a href={`https://twitch.tv/${d.login}`} target="_blank" rel="noopener" className={`${karte} block`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.live.vorschau} alt="" className="w-full rounded-lg" />
                <p className="mt-3 font-semibold">{d.live.titel}</p>
                <p className="text-sm text-slate-400">{d.live.spiel} · {d.live.zuschauer.toLocaleString()} viewers</p>
              </a>
            ) : (
              <div className={karte}><p className="text-xs uppercase tracking-widest text-slate-500">Offline</p><p className="mt-1 font-semibold">{d.titel ?? '—'}</p><p className="text-sm text-slate-400">{d.spiel ?? ''}</p></div>
            )}

            <section className={karte}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Posts & questions</h2>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select value={art} onChange={(e) => setArt(e.target.value as 'post' | 'frage')} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">
                  <option value="post">Post</option><option value="frage">Community question</option>
                </select>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void senden(); }} maxLength={1000}
                  placeholder="Write something for the community…" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder:text-slate-600" />
                <button type="button" onClick={() => void senden()} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950">Post</button>
              </div>
              <ul className="mt-4 space-y-3">
                {d.posts.length === 0 && <li className="text-sm text-slate-500">No posts yet.</li>}
                {d.posts.map((p) => (
                  <li key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {p.art === 'frage' && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-300">Question</span>}
                      <span>{new Date(p.t).toLocaleString()}</span>
                      <button type="button" onClick={() => void loeschen(p.id)} className="ml-auto text-slate-600 hover:text-red-400">Delete</button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{p.text}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className={karte}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Top clips (30 days)</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.clips.length === 0 && <p className="text-sm text-slate-500">No clips.</p>}
                {d.clips.map((c) => (
                  <a key={c.url} href={c.url} target="_blank" rel="noopener" className="group block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.bild} alt="" className="aspect-video w-full rounded-lg object-cover transition group-hover:opacity-80" />
                    <p className="mt-1 line-clamp-2 text-xs font-medium">{c.titel}</p>
                    <p className="text-[11px] text-slate-500">{c.aufrufe.toLocaleString()} views</p>
                  </a>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className={karte}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Stream schedule</h2>
              <ul className="mt-3 space-y-2">
                {d.plan.length === 0 && <li className="text-sm text-slate-500">No schedule set on Twitch.</li>}
                {d.plan.map((s) => (
                  <li key={s.start} className="rounded-lg bg-zinc-950/60 px-3 py-2">
                    <p className="text-sm font-medium">{s.titel || s.spiel || 'Stream'}</p>
                    <p className="text-xs text-slate-500">{zeit(s.start)}{s.spiel ? ` · ${s.spiel}` : ''}</p>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
