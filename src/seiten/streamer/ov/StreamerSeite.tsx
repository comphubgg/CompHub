import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { Laedt, VIOLETT } from '../../community/Teile';

/*
 * Streamer-Seite (main: app/streamer/[kanal], lib/streamerSeite, /api/streamer-seite) - im Hub unter /streamer/page/:kanal.
 * Kanal, Live-Status, Stream-Plan, Clips, Link aufs CompHub-Spielerprofil und ein Post-Kanal mit Community-Fragen.
 * Die Schnittstelle gibt die Seite vorerst nur dem Admin (403 sonst) - dann steht hier, was Twitch ueber den Kanal sagt (POST /api/live-status).
 */

interface Daten {
  login: string; name: string; bio: string; bild: string; banner: string | null;
  live: { titel: string; spiel: string; zuschauer: number; seit: string; vorschau: string } | null;
  titel: string | null; spiel: string | null;
  plan: Array<{ start: string; ende: string | null; titel: string; spiel: string | null }>;
  clips: Array<{ url: string; titel: string; aufrufe: number; datum: string; bild: string; dauer: number }>;
  epicId: string | null;
  posts: Array<{ id: string; art: 'post' | 'frage'; text: string; t: number }>;
}
interface Stand { isLive: boolean; viewers: number; title?: string; bild?: string | null }

const zeit = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const feld = 'rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-akz/60';

/** Ohne Admin: nur, was Twitch ueber den Kanal sagt. */
function NurVorschau({ kanal, grund }: { kanal: string; grund: string }) {
  const [s, setS] = useState<Stand | null | undefined>(undefined);
  useEffect(() => {
    fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [kanal] }) })
      .then((r) => r.json()).then((j: Record<string, Stand>) => setS(j[kanal] ?? null)).catch(() => setS(null));
  }, [kanal]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Glas className="relative overflow-hidden p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-akz/25 blur-3xl" />
        <div className="relative flex items-center gap-5">
          {s?.bild
            ? <img src={s.bild} alt="" referrerPolicy="no-referrer" className={`h-24 w-24 rounded-3xl object-cover ring-4 ${s.isLive ? 'ring-red-500' : 'ring-white/10'}`} />
            : <span className="grid h-24 w-24 place-items-center rounded-3xl bg-akz/20 text-4xl font-black uppercase text-akz">{kanal[0]}</span>}
          <div className="min-w-0">
            <h1 className="truncate text-4xl font-extrabold tracking-tight text-white">{kanal}</h1>
            <p className="mt-1 text-sm text-white/55">
              {s === undefined ? 'Asking Twitch …' : s === null ? 'Twitch didn\'t answer for this channel.' : s.isLive ? <><span className="font-bold text-red-400">{s.viewers.toLocaleString('en')} watching</span> · {s.title}</> : 'Offline right now'}
            </p>
          </div>
        </div>
        <a href={`https://twitch.tv/${kanal}`} target="_blank" rel="noreferrer" className="relative mt-6 inline-flex rounded-full bg-akz px-5 py-2.5 text-sm font-bold text-[#06080f] transition hover:brightness-110">Open on Twitch</a>
      </Glas>
      <Glas className="p-7" verzoegerung={0.1}>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-akz">Streamer page</p>
        <h2 className="mt-2 text-xl font-bold text-white">The full page is still in admin testing</h2>
        <p className="mt-2 text-sm text-white/55">Schedule, top clips, posts and community questions show up here as soon as CompHub opens streamer pages for everyone.</p>
        <p className="mt-3 text-xs text-white/35">{grund}</p>
      </Glas>
    </div>
  );
}

export default function StreamerSeite() {
  const { kanal = '' } = useParams();
  const k = kanal.toLowerCase();
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState<{ text: string; status: number } | null>(null);
  const [text, setText] = useState('');
  const [art, setArt] = useState<'post' | 'frage'>('post');

  const laden = useCallback(() => {
    fetch(`/api/streamer-seite?kanal=${encodeURIComponent(k)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!j.ok) { setFehler({ text: j.error ?? 'Error', status: r.status }); return; } setD(j); setFehler(null); })
      .catch((e) => setFehler({ text: (e as Error).message, status: 0 }));
  }, [k]);
  useEffect(() => { setD(null); setFehler(null); laden(); }, [laden]);

  async function senden() {
    if (!text.trim()) return;
    await fetch('/api/streamer-seite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kanal: k, art, text }) });
    setText(''); laden();
  }
  async function loeschen(id: string) {
    await fetch(`/api/streamer-seite?kanal=${encodeURIComponent(k)}&id=${id}`, { method: 'DELETE' }); laden();
  }

  if (fehler?.status === 403) return <NurVorschau kanal={k} grund="Only the admin sees full streamer pages for now." />;
  if (fehler) return <Glas className="p-8 text-white/70">{fehler.status === 404 ? `There is no Twitch channel called “${k}”.` : fehler.text === 'Ungültiger Kanal' ? 'That is not a valid Twitch name.' : fehler.text}</Glas>;
  if (!d) return <Laedt farbe={VIOLETT} text="Loading the streamer page …" />;

  return (
    <div className="space-y-6">
      <Glas className="relative overflow-hidden">
        <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-akz/40 via-fuchsia-500/15 to-transparent sm:h-60">
          {d.banner && <img src={d.banner} alt="" className="h-full w-full object-cover opacity-60" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d16] via-[#0b0d16]/30 to-transparent" />
        </div>
        <div className="relative -mt-16 flex flex-wrap items-end gap-5 px-7 pb-7">
          <motion.img initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={d.bild} alt={d.name}
            className={`h-32 w-32 rounded-3xl object-cover ring-4 ${d.live ? 'ring-red-500' : 'ring-[#0b0d16]'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-5xl font-extrabold tracking-tight text-white">{d.name}</h1>
              {d.live && <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-black text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>}
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-white/55">{d.bio}</p>
          </div>
          <div className="flex gap-2">
            <a href={`https://twitch.tv/${d.login}`} target="_blank" rel="noreferrer" className="rounded-full bg-akz px-5 py-2.5 text-sm font-bold text-[#06080f] transition hover:brightness-110">Twitch</a>
            {d.epicId && <Link to={`/competitive/player/${d.epicId}`} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/5">Comp stats</Link>}
          </div>
        </div>
      </Glas>
      <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">Preview – only visible to the admin.</p>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {d.live ? (
            <a href={`https://twitch.tv/${d.login}`} target="_blank" rel="noreferrer" className="block">
              <Glas className="overflow-hidden p-4 transition hover:border-akz/30">
                <img src={d.live.vorschau} alt="" className="aspect-video w-full rounded-2xl object-cover" />
                <p className="mt-3 font-semibold text-white">{d.live.titel}</p>
                <p className="text-sm text-white/55">{d.live.spiel} · <span className="font-bold text-red-400">{d.live.zuschauer.toLocaleString('en')} viewers</span> · since {zeit(d.live.seit)}</p>
              </Glas>
            </a>
          ) : (
            <Glas className="p-6"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">Offline</p><p className="mt-1 text-lg font-bold text-white">{d.titel ?? '—'}</p><p className="text-sm text-white/55">{d.spiel ?? ''}</p></Glas>
          )}

          <Glas className="p-6" verzoegerung={0.05}>
            <h2 className="text-lg font-bold text-white">Posts &amp; questions</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select value={art} onChange={(e) => setArt(e.target.value as 'post' | 'frage')} className={feld}>
                <option value="post">Post</option><option value="frage">Community question</option>
              </select>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void senden(); }} maxLength={1000}
                placeholder="Write something for the community…" className={`${feld} min-w-0 flex-1`} />
              <button type="button" onClick={() => void senden()} className="rounded-xl bg-akz px-5 py-2 text-sm font-bold text-[#06080f] transition hover:brightness-110">Post</button>
            </div>
            <ul className="mt-4 space-y-3">
              {d.posts.length === 0 && <li className="text-sm text-white/45">No posts yet.</li>}
              {d.posts.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    {p.art === 'frage' && <span className="rounded-full bg-akz/15 px-2 py-0.5 font-semibold text-akz">Question</span>}
                    <span>{new Date(p.t).toLocaleString('en-GB')}</span>
                    <button type="button" onClick={() => void loeschen(p.id)} className="ml-auto text-white/35 hover:text-red-400">Delete</button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-white/85">{p.text}</p>
                </motion.li>
              ))}
            </ul>
          </Glas>

          <Glas className="p-6" verzoegerung={0.1}>
            <h2 className="text-lg font-bold text-white">Top clips <span className="text-sm font-normal text-white/40">30 days</span></h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {d.clips.length === 0 && <p className="text-sm text-white/45">No clips.</p>}
              {d.clips.map((c) => (
                <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="group block">
                  <div className="aspect-video overflow-hidden rounded-xl border border-white/10"><img src={c.bild} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium text-white/85">{c.titel}</p>
                  <p className="text-[11px] text-white/45">{c.aufrufe.toLocaleString('en')} views · {Math.round(c.dauer)} s</p>
                </a>
              ))}
            </div>
          </Glas>
        </div>

        <Glas className="h-fit p-6" verzoegerung={0.15}>
          <h2 className="text-lg font-bold text-white">Stream schedule</h2>
          <ul className="mt-3 space-y-2">
            {d.plan.length === 0 && <li className="text-sm text-white/45">No schedule set on Twitch.</li>}
            {d.plan.map((s) => (
              <li key={s.start} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <p className="text-sm font-medium text-white">{s.titel || s.spiel || 'Stream'}</p>
                <p className="text-xs text-white/45">{zeit(s.start)}{s.spiel ? ` · ${s.spiel}` : ''}</p>
              </li>
            ))}
          </ul>
        </Glas>
      </div>
    </div>
  );
}
