import { motion } from 'framer-motion';
import { useWer } from '../../teile/Anmeldung';

/* Das Tor vor dem Streamer-Bereich: was es hier gibt, kostenlos vs. VIP, und die drei Wege hinein. */

const FREI = [
  ['Who is live', 'Every CompHub streamer and pro who is on air right now, with viewers and title.'],
  ['Basic overlays', 'Cup timer, offspawn score and a text line – ready for OBS in a minute.'],
  ['Your own page', 'A simple preview of how your channel shows up on CompHub.'],
];
const VIP = [
  ['Match Finder', 'Find your exact game in any cup and jump to the replay.'],
  ['Advanced overlays', 'Live team banner, leaderboard, qual line and a full custom scoreboard.'],
  ['Streamer page & Twitch bot', 'Your full CompHub page and a chat bot with live cup stats.'],
];

export default function Tor() {
  const { oeffnen } = useWer();
  return (
    <div className="relative grid min-h-[calc(100vh-140px)] place-items-center">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[min(820px,100%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[120px]" />
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#0b0d16]/75 p-8 backdrop-blur-2xl md:p-12">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">Streamer</p>
        <h1 className="mt-2 text-5xl font-extrabold tracking-tight text-white md:text-6xl">Your stream, <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">powered by CompHub</span></h1>
        <p className="mt-3 max-w-2xl text-white/60">Live cup data on your stream, overlays that update themselves and tools made for competitive Fortnite. Free for every streamer – more with VIP.</p>

        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {[{ titel: 'Free account', liste: FREI, vip: false }, { titel: 'VIP', liste: VIP, vip: true }].map((s, i) => (
            <motion.div key={s.titel} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
              className={`rounded-3xl border p-6 ${s.vip ? 'border-violet-300/30 bg-violet-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{s.titel}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.vip ? 'bg-violet-400 text-[#06080f]' : 'bg-white/10 text-white/70'}`}>{s.vip ? 'Access key' : 'Free'}</span>
              </div>
              <ul className="mt-4 space-y-3">
                {s.liste.map(([t, x]) => (
                  <li key={t} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.vip ? 'bg-violet-300' : 'bg-white/50'}`} />
                    <div><p className="text-sm font-semibold text-white">{t}</p><p className="text-sm text-white/50">{x}</p></div>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => oeffnen('konto')} className="rounded-full bg-violet-400 px-7 py-3 text-sm font-bold text-[#06080f] shadow-[0_10px_40px_rgba(167,139,250,0.35)] transition hover:-translate-y-0.5 hover:bg-violet-300">Sign in</button>
          <button type="button" onClick={() => oeffnen('registrieren')} className="rounded-full border border-violet-300/40 bg-white/[0.03] px-7 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-violet-400/10">Create account</button>
          <button type="button" onClick={() => oeffnen('schluessel')} className="ml-auto text-sm text-white/50 underline-offset-4 transition hover:text-violet-200 hover:underline">Have a VIP access key?</button>
        </div>
      </motion.div>
    </div>
  );
}
