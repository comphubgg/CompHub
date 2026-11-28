import { motion } from 'framer-motion';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bild, Laedt, Leer, Marke } from '../../../ds/Bausteine';
import { Kanalbild, LiveMarke, Zeichen, Zuschauer } from '../Teile';
import { vorschaubild } from '../live';

/*
 * Streamer-Seite (main: app/streamer/[kanal], lib/streamerSeite, /api/streamer-seite) - im Hub unter /streamer/page/:kanal und als Herz von
 * "My page". Neu gebaut auf dem Design-System 3.0 (28.11.2026):
 *   Buehne      Banner des Kanals ueber die volle Breite, Profilbild, Name, Bio, Twitch / Comp stats - laeuft der Stream, steht rechts das
 *               Live-Bild mit Zuschauern
 *   links       Top-Clips als Bildkarten (16:9), darunter Posts und Community-Fragen
 *   rechts      Stream-Plan als Zeitleiste
 * Die Schnittstelle gibt die volle Seite vorerst nur dem Admin (403 sonst) - dann steht hier, was Twitch ueber den Kanal sagt
 * (POST /api/live-status: live, Zuschauer, Titel, Profilbild), mit dem Live-Bild, wenn er sendet.
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
const SANFT = [0.22, 1, 0.36, 1] as const;

/** Die Buehne oben: Banner, Bild, Name, Text, Knoepfe - rechts das Live-Bild, wenn er sendet. */
function KanalBuehne({ login, name, bild, banner, text, live, unter, knoepfe, takt = 0 }: {
  login: string; name: string; bild?: string | null; banner?: string | null; text?: ReactNode; unter?: ReactNode; knoepfe?: ReactNode;
  live: { titel: string; zuschauer: number; vorschau?: string } | null; takt?: number;
}) {
  return (
    <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: SANFT }}
      className={`fl-fest relative isolate overflow-hidden ${live ? '!border-red-500/30' : ''}`}>
      {banner && <Bild src={banner} className="absolute inset-0 -z-10 h-full w-full opacity-45" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/90 to-fl/40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-transparent to-transparent" />
      <div className={`grid items-end gap-6 p-6 sm:p-8 ${live ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]' : ''}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-5">
            <Kanalbild src={bild} className={`h-28 w-28 rounded-2xl ring-4 sm:h-32 sm:w-32 ${live ? 'ring-red-500' : 'ring-black/60'}`} />
            <div className="min-w-0">
              <p className="ueber">Streamer page</p>
              <h1 className="titel mt-1 truncate text-6xl lg:text-7xl">{name}</h1>
              {unter && <div className="mt-1 text-sm text-white/60">{unter}</div>}
            </div>
          </div>
          {text && <p className="mt-4 line-clamp-3 max-w-3xl text-[15px] leading-relaxed text-white/60">{text}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`https://twitch.tv/${login}`} target="_blank" rel="noreferrer" className="knopf-prim"><Zeichen name="aussen" className="h-4 w-4" />Open on Twitch</a>
            {knoepfe}
          </div>
        </div>
        {live && (
          <a href={`https://twitch.tv/${login}`} target="_blank" rel="noreferrer" className="group relative block aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            <Bild src={live.vorschau || vorschaubild(login, takt, 1280, 720)} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.04]" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
            <span className="absolute left-3 top-3"><LiveMarke /></span>
            <span className="absolute right-3 top-3"><Zuschauer n={live.zuschauer} /></span>
            <span className="absolute inset-x-4 bottom-3 line-clamp-2 text-sm font-semibold text-white">{live.titel}</span>
          </a>
        )}
      </div>
    </motion.header>
  );
}

/** Ohne Admin: was Twitch ueber den Kanal sagt - Bild, live oder nicht, Titel, Live-Bild. */
function NurVorschau({ kanal, grund, knoepfe }: { kanal: string; grund: string; knoepfe?: ReactNode }) {
  const [s, setS] = useState<Stand | null | undefined>(undefined);
  const [takt] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    setS(undefined);
    fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [kanal] }) })
      .then((r) => r.json()).then((j: Record<string, Stand>) => setS(j[kanal] ?? null)).catch(() => setS(null));
  }, [kanal]);
  return (
    <div className="space-y-3">
      <KanalBuehne login={kanal} name={kanal} bild={s?.bild} takt={takt} knoepfe={knoepfe}
        live={s?.isLive ? { titel: s.title || 'Live on Twitch', zuschauer: s.viewers } : null}
        unter={s === undefined ? 'Asking Twitch …' : s === null ? 'Twitch didn’t answer for this channel.' : s.isLive ? <><span className="zahl font-bold text-red-300">{s.viewers.toLocaleString('en')} watching</span> · {s.title}</> : 'Offline right now'} />
      <p className="px-1 text-xs text-white/40">{grund}</p>
    </div>
  );
}

/** Die ganze Seite eines Kanals - fuer /streamer/page/:kanal und fuer "My page". `knoepfe` stehen neben "Open on Twitch". */
export function KanalAnsicht({ kanal, knoepfe, grund = 'Schedule, top clips and posts are only visible to the admin for now.' }: { kanal: string; knoepfe?: ReactNode; grund?: string }) {
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

  // 403 (oder die Meldung "Nur für den Admin." ohne Status, z. B. hinter einem Proxy): nur die Twitch-Vorschau
  if (fehler && (fehler.status === 403 || fehler.status === 401 || /admin/i.test(fehler.text))) return <NurVorschau kanal={k} grund={grund} knoepfe={knoepfe} />;
  if (fehler) return <Leer text={fehler.status === 404 ? `There is no Twitch channel called “${k}”.` : fehler.text === 'Ungültiger Kanal' ? 'That is not a valid Twitch name.' : fehler.text} />;
  if (!d) return <Laedt text="Loading the streamer page" />;

  return (
    <div className="space-y-5">
      <KanalBuehne login={d.login} name={d.name} bild={d.bild} banner={d.banner} text={d.bio}
        live={d.live ? { titel: d.live.titel, zuschauer: d.live.zuschauer, vorschau: d.live.vorschau } : null}
        unter={d.live ? <><span className="zahl font-bold text-red-300">{d.live.zuschauer.toLocaleString('en')} watching</span> · {d.live.spiel} · since {zeit(d.live.seit)}</> : <>Offline · last stream: {d.titel ?? '—'}{d.spiel ? ` · ${d.spiel}` : ''}</>}
        knoepfe={<>{d.epicId && <Link to={`/competitive/player/${d.epicId}`} className="knopf">Comp stats</Link>}{knoepfe}</>} />
      <p className="px-1 text-xs text-amber-200/80">Preview – only visible to the admin.</p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {/* Top-Clips als Bildkarten */}
          <section>
            <div className="mb-3 flex items-baseline gap-3"><h2 className="titel text-3xl">Top clips</h2><span className="text-xs text-white/40">last 30 days</span></div>
            {d.clips.length === 0 ? <Leer text="No clips in the last 30 days." /> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {d.clips.map((c, i) => (
                  <motion.a key={c.url} href={c.url} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.4 }}
                    className="fl-fest fl-klick group block overflow-hidden">
                    <span className="relative block aspect-video overflow-hidden bg-black">
                      <Bild src={c.bild} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.05]" />
                      <span className="zahl absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white">{Math.round(c.dauer)} s</span>
                    </span>
                    <span className="block px-4 pb-4 pt-3">
                      <span className="line-clamp-2 text-sm font-bold text-white">{c.titel}</span>
                      <span className="zahl mt-0.5 block text-xs text-white/45">{c.aufrufe.toLocaleString('en')} views · {new Date(c.datum).toLocaleDateString('en-GB')}</span>
                    </span>
                  </motion.a>
                ))}
              </div>
            )}
          </section>

          {/* Posts und Community-Fragen */}
          <section className="fl-fest p-5 sm:p-6">
            <h2 className="titel text-3xl">Posts &amp; questions</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-black/40 p-1">
                {([['post', 'Post'], ['frage', 'Question']] as const).map(([w, t]) => (
                  <button key={w} type="button" onClick={() => setArt(w)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${art === w ? 'bg-akz text-[#04050a]' : 'text-white/60 hover:text-white'}`}>{t}</button>
                ))}
              </div>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void senden(); }} maxLength={1000}
                placeholder={art === 'frage' ? 'Ask your community something…' : 'Write something for the community…'} className="eingabe min-w-0 flex-1" />
              <button type="button" onClick={() => void senden()} className="knopf-prim">Post</button>
            </div>
            <ul className="mt-4 divide-y divide-white/[0.05]">
              {d.posts.length === 0 && <li className="py-3 text-sm text-white/45">No posts yet.</li>}
              {d.posts.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="py-3">
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    {p.art === 'frage' && <Marke ton="akz">Question</Marke>}
                    <span>{new Date(p.t).toLocaleString('en-GB')}</span>
                    <button type="button" onClick={() => void loeschen(p.id)} className="ml-auto text-white/35 hover:text-red-400">Delete</button>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-white/85">{p.text}</p>
                </motion.li>
              ))}
            </ul>
          </section>
        </div>

        {/* Stream-Plan als Zeitleiste */}
        <aside className="fl-fest h-fit p-5 sm:p-6 xl:sticky xl:top-[7.5rem]">
          <h2 className="titel text-3xl">Schedule</h2>
          {d.plan.length === 0 ? <p className="mt-2 text-sm text-white/45">No schedule set on Twitch.</p> : (
            <ol className="relative mt-4 space-y-4 border-l border-white/10 pl-5">
              {d.plan.map((s, i) => (
                <li key={s.start} className="relative">
                  <span className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-fl ${i === 0 ? 'bg-akz' : 'bg-white/25'}`} />
                  <p className="zahl text-xs font-semibold text-akz">{zeit(s.start)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{s.titel || s.spiel || 'Stream'}</p>
                  {s.spiel && <p className="text-xs text-white/45">{s.spiel}</p>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function StreamerSeite() {
  const { kanal = '' } = useParams();
  return <KanalAnsicht kanal={kanal} grund="Schedule, top clips and posts of streamer pages are only visible to the admin for now." />;
}
