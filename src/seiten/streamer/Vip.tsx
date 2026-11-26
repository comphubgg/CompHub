import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWer } from '../../teile/Anmeldung';
import { Glas } from '../../teile/Glas';
import { Laedt, Ueberschrift, VIOLETT } from '../community/Teile';
import MeinArchiv from './ov/MeinArchiv';
import { MARKE } from './ov/ort';
import { useZugang } from './ov/zugang';

/*
 * VIP (main: /vip = das Dashboard nach dem Anmelden, app/admin/page.tsx, und der VIP-Vorhang app/overlays/VipVorhang): die eigene Stufe,
 * welche VIP-Werkzeuge freigeschaltet sind (lib/rechte VIP_BEREICHE - Overlays und Globals hat jeder VIP, der Rest wird je VIP angehakt),
 * wann der Zugang ablaeuft und - wo der Admin es erlaubt - einen neuen Zugangsschluessel (GET/POST /api/vip-schluessel), dazu "Mein Archiv"
 * mit allen gespeicherten Overlays, Tierlists und der Globals-Prognose. Ohne VIP: was VIP bringt und wie man ihn bekommt (Discord, X, Schluessel).
 */

const WERKZEUGE: Array<{ recht: string | null; titel: string; was: string; ziel?: string; extern?: string }> = [
  { recht: null, titel: 'Live cup overlays', was: 'Team Banner, Leaderboard, Qual line and the Custom scoreboard', ziel: '/streamer/overlays' },
  { recht: null, titel: 'Overlays (Globals 2026)', was: 'Leaderboard, player banner and free overlay in the look of the Global Championship', ziel: '/streamer/overlays/globals' },
  { recht: 'twitchbot', titel: 'Twitch bot', was: 'Commands and rules for your own chat', ziel: '/streamer/twitch-bot' },
  { recht: 'twitchstatistik', titel: 'Twitch statistics', was: 'Peak with and without raids, followers, chatters per day, week, month, year', ziel: '/streamer/twitch-stats' },
  { recht: 'matchfinder', titel: 'Match-ID finder', was: 'Save favourites and see the running match ID to watch', ziel: '/competitive/match-finder' },
  { recht: 'replays', titel: 'Replays', was: 'Every game of a cup in 2D and 3D: zones, kill feed, teams', ziel: '/competitive/replays' },
  { recht: 'propov', titel: 'Pro POVs', was: 'Sign pros up by link, watch their POV, live alerts on your own Discord', extern: '/pov' },
];

function Schluessel() {
  const [stand, setStand] = useState<{ darf: boolean; bis: number | null } | null>(null);
  const [wunsch, setWunsch] = useState('');
  const [neu, setNeu] = useState('');
  const [meldung, setMeldung] = useState('');
  useEffect(() => {
    fetch('/api/vip-schluessel', { cache: 'no-store' }).then((r) => r.json()).then((j) => setStand({ darf: Boolean(j?.darf), bis: typeof j?.bis === 'number' ? j.bis : null })).catch(() => setStand({ darf: false, bis: null }));
  }, []);
  if (!stand || (!stand.darf && !stand.bis)) return null;
  const tage = stand.bis ? Math.max(0, Math.ceil((stand.bis - Date.now()) / 86_400_000)) : null;
  async function wechseln() {
    setMeldung('Saving …');
    try {
      const r = await fetch('/api/vip-schluessel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wunsch.trim() ? { schluessel: wunsch.trim() } : {}) });
      const j = await r.json();
      if (!r.ok) { setMeldung(j?.fehler === 'Diesen Schlüssel hat schon jemand anderes.' ? 'Someone else already has this key.' : j?.fehler ?? 'That did not work.'); return; }
      setNeu(j.schluessel); setWunsch('');
      setMeldung(j.discord === 'gesendet' ? 'New key – it is also in your Discord channel.' : 'New key set.');
    } catch (e) { setMeldung((e as Error).message); }
  }
  return (
    <Glas className="p-6" verzoegerung={0.1}>
      <h2 className="text-lg font-bold text-white">Your access key</h2>
      {tage !== null && <p className="mt-1 text-sm text-white/55">VIP access expires in <b className="text-white">{tage} {tage === 1 ? 'day' : 'days'}</b>.</p>}
      {stand.darf && (
        <>
          <p className="mt-2 text-sm text-white/55">Showed your key on stream by accident? Set a new one – leave the field empty for a random key.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={wunsch} onChange={(e) => setWunsch(e.target.value)} placeholder="New key (optional)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-300/60" />
            <button type="button" onClick={() => void wechseln()} className="rounded-xl bg-violet-400 px-5 py-2 text-sm font-bold text-[#06080f] transition hover:bg-violet-300">New key</button>
          </div>
          {neu && <p className="mt-3 rounded-xl border border-violet-300/30 bg-violet-400/10 px-3 py-2 font-mono text-sm text-violet-100">{neu}</p>}
          {meldung && <p className="mt-2 text-xs text-white/55">{meldung}</p>}
        </>
      )}
    </Glas>
  );
}

export default function Vip() {
  const z = useZugang();
  const { oeffnen } = useWer();
  useEffect(() => {
    if (z.laedt || window.location.hash !== '#archiv') return;
    window.setTimeout(() => document.getElementById('archiv')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [z.laedt]);
  if (z.laedt) return <Laedt farbe={VIOLETT} text="Checking your access …" />;
  const stufe = z.admin ? 'Admin' : z.manager ? 'Manager' : z.pro ? 'Pro' : z.vip ? 'VIP' : 'Free';
  const hat = (recht: string | null) => z.admin || (z.vip && (recht === null || z.rechte.includes(recht)));

  return (
    <div className="space-y-8">
      <Ueberschrift ueber="Streamer · VIP" titel={z.vip ? `VIP · ${z.name}` : 'CompHub VIP'} farbe={VIOLETT}
        text={z.vip ? 'Everything your access unlocks, your access key and every overlay and list you saved.' : 'Live cup data on your stream: leaderboards, team banners, cup timers and more – plus the Twitch bot and statistics.'}
        rechts={<span className={`rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider ${z.vip ? 'bg-violet-400 text-[#06080f]' : 'border border-white/15 text-white/70'}`}>{stufe}</span>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Glas className="p-6">
          <h2 className="text-lg font-bold text-white">VIP tools</h2>
          <p className="mt-1 text-sm text-white/50">Overlays and Globals come with every VIP. The other tools are switched on per streamer by CompHub.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {WERKZEUGE.map((w, i) => {
              const an = hat(w.recht);
              const inhalt = (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} whileHover={an ? { y: -3 } : undefined}
                  className={`flex h-full gap-3 rounded-2xl border p-4 transition ${an ? 'border-violet-300/25 bg-violet-400/[0.06] hover:border-violet-300/45' : 'border-white/5 bg-white/[0.02]'}`}>
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${an ? 'bg-violet-400 text-[#06080f]' : 'border border-white/15 text-white/30'}`}>{an ? '✓' : '·'}</span>
                  <div className="min-w-0">
                    <p className={`font-semibold ${an ? 'text-white' : 'text-white/45'}`}>{w.titel}</p>
                    <p className={`text-xs ${an ? 'text-white/55' : 'text-white/30'}`}>{w.was}</p>
                    {!an && z.vip && w.recht && <p className="mt-1 text-[11px] text-violet-200/60">Not switched on for your account yet – ask us on Discord.</p>}
                  </div>
                </motion.div>
              );
              if (!an) return <li key={w.titel}>{inhalt}</li>;
              return <li key={w.titel}>{w.extern ? <a href={`https://www.thecomphub.com${w.extern}`} target="_blank" rel="noreferrer" className="block h-full">{inhalt}</a> : <Link to={w.ziel!} className="block h-full">{inhalt}</Link>}</li>;
            })}
          </ul>
        </Glas>

        <div className="space-y-5">
          {z.vip ? <Schluessel /> : null}
          <Glas className="relative overflow-hidden p-6" verzoegerung={0.15}>
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
            <h2 className="relative text-lg font-bold text-white">{z.vip ? 'Need another tool?' : 'Want VIP access?'}</h2>
            <p className="relative mt-1 text-sm text-white/55">Join our Discord or write us on X.</p>
            <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
              <a href={MARKE.discord} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-400 px-4 py-2.5 text-sm font-bold text-[#06080f] transition hover:bg-violet-300">Join our Discord</a>
              <a href={`https://x.com/${MARKE.x}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300/50">Write on X</a>
            </div>
            {!z.vip && <button type="button" onClick={() => oeffnen('schluessel')} className="relative mt-4 text-sm font-semibold text-violet-200 underline-offset-4 hover:underline">Already have an access key? Enter it →</button>}
          </Glas>
        </div>
      </div>

      <section id="archiv" className="scroll-mt-32">
        <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-white">My archive</h2>
        <MeinArchiv />
      </section>
    </div>
  );
}
