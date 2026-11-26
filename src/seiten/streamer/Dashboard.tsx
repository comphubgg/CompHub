import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useWer } from '../../teile/Anmeldung';
import { Glas } from '../../teile/Glas';
import { Ueberschrift, VIOLETT } from '../community/Teile';
import { LiveKarte } from './LiveJetzt';
import { useLive } from './live';
import { SEITE, istVip } from './zugang';

/*
 * Streamer-Dashboard: Begruessung mit Stufe, die Werkzeuge (kostenlose offen, VIP-Werkzeuge fuer Free-Konten als gesperrte Kacheln mit kurzem
 * Hinweis), wer gerade live ist, und was als Naechstes kommt. Die VIP-Werkzeuge leben auf thecomphub.com (Match Finder im Hub selbst).
 */

interface Werkzeug { titel: string; text: string; ziel: string; extern?: boolean; vip: boolean; zeichen: string }
const WERKZEUGE: Werkzeug[] = [
  { titel: 'Live now', text: 'Every CompHub streamer and pro on air right now.', ziel: '/streamer/live', vip: false, zeichen: '●' },
  { titel: 'Streams', text: 'Watch the competitive streams side by side.', ziel: '/competitive/streams', vip: false, zeichen: '▶' },
  { titel: 'Basic overlays', text: 'Cup timer, offspawn score and a text line for OBS.', ziel: '/streamer/overlays', vip: false, zeichen: '◧' },
  { titel: 'My page', text: 'A preview of your channel on CompHub.', ziel: '/streamer/my-page', vip: false, zeichen: '☺' },
  { titel: 'Match Finder', text: 'Find your exact game in any cup – lobby, placement, replay.', ziel: '/competitive/match-finder', vip: true, zeichen: '⌖' },
  { titel: 'Live cup overlays', text: 'Team banner, leaderboard, qual line and custom scoreboard.', ziel: '/streamer/overlays', vip: true, zeichen: '◩' },
  { titel: 'Streamer page', text: 'Your full CompHub page with schedule, clips and posts.', ziel: '/streamer/my-page', vip: true, zeichen: '★' },
  { titel: 'Twitch bot', text: 'Chat commands with live cup stats – !map, !stats and more.', ziel: `${SEITE}/twitch-bot`, extern: true, vip: true, zeichen: '⌨' },
];

// Was wirklich in Arbeit ist (aus diesem Hub) - keine erfundenen Versprechen.
const BALD = [
  ['Streamer pages for every VIP', 'Your Twitch schedule, clips and posts on your own CompHub page – today it is still in admin testing.'],
  ['Map objects', 'Every chest, ammo box and slurp barrel on the interactive map, exported from the game files.'],
  ['Exact weapon stats', 'Damage, DPS, magazine and reload per rarity – straight from the game files, next to real tournament numbers.'],
];

function Kachel({ w, frei, i }: { w: Werkzeug; frei: boolean; i: number }) {
  const { oeffnen } = useWer();
  const inhalt = (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} whileHover={frei ? { y: -5 } : undefined}
      className={`group relative h-full overflow-hidden rounded-3xl border p-5 backdrop-blur-xl transition ${frei ? 'border-white/10 bg-white/[0.035] hover:border-violet-300/35 hover:bg-white/[0.05]' : 'border-white/5 bg-[#0b0d16]/70'}`}>
      {w.vip && frei && <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-500/25 blur-2xl" />}
      <div className="relative flex items-start justify-between">
        <span className={`grid h-11 w-11 place-items-center rounded-2xl text-lg ${frei ? 'bg-violet-400/15 text-violet-200' : 'bg-white/5 text-white/25'}`}>{w.zeichen}</span>
        {w.vip && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${frei ? 'bg-violet-400 text-[#06080f]' : 'border border-violet-300/30 text-violet-200/70'}`}>{frei ? 'VIP' : '🔒 VIP'}</span>}
      </div>
      <h3 className={`relative mt-4 font-bold ${frei ? 'text-white' : 'text-white/45'}`}>{w.titel}</h3>
      <p className={`relative mt-1 text-sm ${frei ? 'text-white/55' : 'text-white/30'}`}>{w.text}</p>
      {!frei && <button type="button" onClick={() => oeffnen('schluessel')} className="relative mt-3 text-xs font-semibold text-violet-200/80 underline-offset-4 hover:underline">Unlock with an access key</button>}
    </motion.div>
  );
  if (!frei) return inhalt;
  return w.extern ? <a href={w.ziel} target="_blank" rel="noreferrer" className="block">{inhalt}</a> : <Link to={w.ziel} className="block">{inhalt}</Link>;
}

export default function Dashboard() {
  const { wer, oeffnen } = useWer();
  const vip = istVip(wer);
  const { liste } = useLive();
  const live = (liste ?? []).filter((k) => k.isLive).sort((a, b) => b.viewers - a.viewers);
  return (
    <div className="space-y-8">
      <Ueberschrift ueber={vip ? 'Streamer · VIP' : 'Streamer · Free'} titel={`Hey, ${wer?.userName ?? ''}`} farbe={VIOLETT}
        text={vip ? 'Everything is unlocked – live cup overlays, Match Finder, your streamer page and the Twitch bot.' : 'Your free streamer tools are ready. VIP adds live cup overlays, the Match Finder, your full streamer page and the Twitch bot.'}
        rechts={!vip ? <button type="button" onClick={() => oeffnen('schluessel')} className="rounded-full bg-violet-400 px-5 py-2.5 text-sm font-bold text-[#06080f] shadow-[0_10px_40px_rgba(167,139,250,0.3)] transition hover:bg-violet-300">Enter VIP access key</button> : undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {WERKZEUGE.map((w, i) => <Kachel key={w.titel} w={w} frei={!w.vip || vip} i={i} />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">Live right now {liste && <span className="ml-1 text-base font-semibold text-red-400">{live.length}</span>}</h2>
            <Link to="/streamer/live" className="text-sm font-semibold text-violet-300 hover:text-violet-200">See all →</Link>
          </div>
          {!liste ? <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            : live.length ? <div className="grid gap-4 md:grid-cols-2">{live.slice(0, 6).map((k, i) => <LiveKarte key={k.login} k={k} i={i} />)}</div>
            : <Glas className="p-6 text-sm text-white/55">Nobody from the list is live right now.</Glas>}
        </section>
        <Glas className="relative overflow-hidden p-6" verzoegerung={0.2}>
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300">Coming next</p>
          <ul className="relative mt-4 space-y-4">
            {BALD.map(([t, x], i) => (
              <motion.li key={t} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex gap-3">
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-violet-300/30 text-[11px] font-bold text-violet-200">{i + 1}</span>
                <div><p className="font-semibold text-white">{t}</p><p className="text-sm text-white/50">{x}</p></div>
              </motion.li>
            ))}
          </ul>
        </Glas>
      </div>
    </div>
  );
}
