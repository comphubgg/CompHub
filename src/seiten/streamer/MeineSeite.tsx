import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWer } from '../../teile/Anmeldung';
import { Glas } from '../../teile/Glas';
import { Bald, Ueberschrift, VIOLETT } from '../community/Teile';
import { istVip } from './zugang';

/*
 * Die eigene Seite. Fuer jedes Konto eine einfache Vorschau: Profilbild, live oder nicht, Titel (POST /api/live-status). Die volle Streamer-Seite
 * (Twitch-Daten, Stream-Plan, Clips, Posts - GET /api/streamer-seite?kanal=) gibt der Server vorerst nur dem Admin; VIPs bekommen den Link.
 */

interface Stand { isLive: boolean; viewers: number; title?: string; bild?: string | null }
interface Voll {
  name: string; bio?: string; bild?: string; banner?: string | null; titel?: string | null; spiel?: string | null;
  live?: { titel: string; zuschauer: number; vorschau: string } | null;
  plan?: Array<{ start: string; ende: string; titel: string; spiel: string | null }>; clips?: Array<{ url: string; titel: string; aufrufe: number; bild: string }>;
}

const MERKER = 'hub-streamer-kanal';
const lies = () => { try { return localStorage.getItem(MERKER) ?? ''; } catch { return ''; } };
const merke = (k: string) => { try { localStorage.setItem(MERKER, k); } catch { /* egal */ } };

export default function MeineSeite() {
  const { wer } = useWer();
  const vip = istVip(wer);
  const [eingabe, setEingabe] = useState(() => lies() || (wer?.userName ?? '').toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const [kanal, setKanal] = useState(eingabe);
  const [stand, setStand] = useState<Stand | null | undefined>(undefined);
  const [voll, setVoll] = useState<Voll | null>(null);
  useEffect(() => {
    if (!kanal) return;
    merke(kanal); setStand(undefined); setVoll(null);
    fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [kanal] }) })
      .then((r) => r.json()).then((j: Record<string, Stand>) => setStand(j[kanal] ?? null)).catch(() => setStand(null));
    if (wer?.isAdmin) fetch(`/api/streamer-seite?kanal=${encodeURIComponent(kanal)}`).then((r) => (r.ok ? r.json() : null)).then((j) => setVoll(j?.ok ? j : null)).catch(() => {});
  }, [kanal, wer?.isAdmin]);

  return (
    <div className="space-y-8">
      <Ueberschrift ueber="Streamer · My page" titel="Your channel on CompHub" farbe={VIOLETT} text="How your stream shows up for CompHub's viewers." />
      <form onSubmit={(e) => { e.preventDefault(); setKanal(eingabe.trim().toLowerCase()); }} className="flex max-w-xl gap-2">
        <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-black/30 pl-3 focus-within:border-violet-300/60">
          <span className="text-sm text-white/35">twitch.tv/</span>
          <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} placeholder="your channel" className="w-full bg-transparent px-1 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
        </div>
        <button className="rounded-xl bg-violet-400 px-5 text-sm font-bold text-[#06080f] transition hover:bg-violet-300">Preview</button>
      </form>

      {kanal && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Glas className="relative overflow-hidden">
            <div className="relative h-44 bg-gradient-to-br from-violet-500/40 via-fuchsia-500/20 to-transparent">
              {voll?.banner && <img src={voll.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d16] to-transparent" />
            </div>
            <div className="relative -mt-14 px-7 pb-7">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative inline-block">
                {stand?.bild || voll?.bild
                  ? <img src={(voll?.bild || stand?.bild)!} alt="" referrerPolicy="no-referrer" className={`h-28 w-28 rounded-3xl object-cover ring-4 ${stand?.isLive ? 'ring-red-500' : 'ring-[#0b0d16]'}`} />
                  : <span className="grid h-28 w-28 place-items-center rounded-3xl bg-violet-400/20 text-4xl font-black uppercase text-violet-200 ring-4 ring-[#0b0d16]">{kanal[0]}</span>}
                {stand?.isLive && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">Live</span>}
              </motion.div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white">{voll?.name || kanal}</h2>
              {stand === undefined ? <p className="mt-1 text-sm text-white/40">Asking Twitch …</p> : stand === null ? <p className="mt-1 text-sm text-white/40">Twitch didn't answer for this channel.</p> : (
                <p className="mt-1 text-sm text-white/60">{stand.isLive ? <><span className="font-bold text-red-400">{stand.viewers.toLocaleString('en')} watching</span> · {stand.title}</> : 'Offline right now'}</p>
              )}
              {voll?.bio && <p className="mt-4 max-w-2xl text-sm text-white/55">{voll.bio}</p>}
              <div className="mt-6 flex flex-wrap gap-2">
                <a href={`https://twitch.tv/${kanal}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5">Open on Twitch</a>
                {vip
                  ? <Link to={`/streamer/page/${kanal}`} className="rounded-full bg-violet-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-violet-300">Full streamer page →</Link>
                  : <span className="rounded-full border border-violet-300/30 px-4 py-2 text-sm font-semibold text-violet-200/70">Full streamer page · VIP</span>}
              </div>
            </div>
          </Glas>

          <div className="space-y-5">
            <Glas className="p-6" verzoegerung={0.1}>
              <h3 className="font-bold text-white">Stream schedule</h3>
              {voll?.plan?.length ? (
                <ul className="mt-3 space-y-2">
                  {voll.plan.slice(0, 5).map((p) => (
                    <li key={p.start} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                      <span className="truncate text-white/80">{p.titel || p.spiel || 'Stream'}</span>
                      <span className="shrink-0 tabular-nums text-white/45">{new Date(p.start).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-white/45">{wer?.isAdmin ? 'No schedule on Twitch.' : <>Your Twitch schedule, clips and posts on your page <Bald /></>}</p>}
            </Glas>
            {voll?.clips?.length ? (
              <Glas className="p-6" verzoegerung={0.15}>
                <h3 className="font-bold text-white">Top clips</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {voll.clips.slice(0, 4).map((c) => (
                    <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10">
                      <img src={c.bild} alt="" className="aspect-video w-full object-cover transition group-hover:scale-105" />
                      <p className="truncate px-2 py-1.5 text-xs text-white/70">{c.titel}</p>
                    </a>
                  ))}
                </div>
              </Glas>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
