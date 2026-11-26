import { motion } from 'framer-motion';
import { useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Laedt, Ueberschrift, VIOLETT } from '../community/Teile';
import { GRUPPEN, useLive, type Kanal } from './live';

/* Wer gerade live ist - alle Kanaele der CompHub-Streamerliste, live zuerst nach Zuschauern (/api/streamers + /api/live-status). */

export function LiveKarte({ k, i }: { k: Kanal; i: number }) {
  const [kaputt, setKaputt] = useState(false);
  return (
    <motion.a href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.5, i * 0.04) }}
      whileHover={{ y: -4 }} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl transition hover:border-violet-300/30">
      <div className="relative shrink-0">
        {k.bild && !kaputt
          ? <img src={k.bild} alt="" referrerPolicy="no-referrer" onError={() => setKaputt(true)} className="h-14 w-14 rounded-2xl object-cover ring-2 ring-red-500/80" />
          : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-400/15 text-lg font-black uppercase text-violet-200 ring-2 ring-red-500/80">{k.login[0]}</span>}
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1.5 text-[9px] font-black uppercase tracking-wider text-white">Live</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-bold text-white">{k.anzeige || k.login}</p>
          <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white/45">{GRUPPEN[k.gruppe] ?? k.gruppe}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-white/50">{k.title || '—'}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-extrabold tabular-nums text-white">{k.viewers.toLocaleString('en')}</p>
        <p className="text-[10px] uppercase tracking-wider text-white/40">viewers</p>
      </div>
    </motion.a>
  );
}

export default function LiveJetzt() {
  const { liste, fehler } = useLive();
  const [gruppe, setGruppe] = useState('alle');
  const live = (liste ?? []).filter((k) => k.isLive && (gruppe === 'alle' || k.gruppe === gruppe)).sort((a, b) => b.viewers - a.viewers);
  const offline = (liste ?? []).filter((k) => !k.isLive && (gruppe === 'alle' || k.gruppe === gruppe));
  const zuschauer = live.reduce((s, k) => s + k.viewers, 0);
  return (
    <div className="space-y-8">
      <Ueberschrift ueber="Streamer · Live now" titel="Who's on air" farbe={VIOLETT} text="Every channel on CompHub's streamer list, refreshed every minute."
        rechts={liste ? (
          <div className="flex gap-3">
            {[['Live', String(live.length)], ['Watching', zuschauer.toLocaleString('en')], ['Channels', String(liste.length)]].map(([k, v]) => (
              <Glas key={k} className="min-w-[120px] px-5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p><p className="text-2xl font-extrabold tabular-nums text-white">{v}</p></Glas>
            ))}
          </div>
        ) : undefined} />
      <div className="flex flex-wrap gap-2">
        {[['alle', 'All'], ...Object.entries(GRUPPEN)].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setGruppe(k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${gruppe === k ? 'border-violet-300/50 bg-violet-400/15 text-white' : 'border-white/10 text-white/55 hover:bg-white/5 hover:text-white'}`}>{t}</button>
        ))}
      </div>
      {fehler && <Glas className="p-5 text-sm text-white/60">Twitch isn't answering right now – the list refreshes by itself.</Glas>}
      {!liste ? <Laedt farbe={VIOLETT} text="Asking Twitch who's live …" /> : (
        <>
          {live.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{live.map((k, i) => <LiveKarte key={k.login} k={k} i={i} />)}</div>
          ) : <Glas className="p-8 text-center text-white/55">Nobody from this list is live right now.</Glas>}
          <Glas className="p-5" verzoegerung={0.2}>
            <h3 className="font-bold text-white">Offline <span className="ml-1 text-sm font-normal text-white/40">{offline.length}</span></h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {offline.map((k) => (
                <a key={k.login} href={`https://twitch.tv/${k.login}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55 transition hover:border-violet-300/30 hover:text-white">{k.anzeige || k.login}</a>
              ))}
            </div>
          </Glas>
        </>
      )}
    </div>
  );
}
