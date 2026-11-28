import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Laedt } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import MeinArchiv from './ov/MeinArchiv';
import { MARKE } from './ov/ort';
import { useZugang } from './ov/zugang';
import { StufenMarke, Zeichen } from './Teile';

/*
 * VIP - neu gebaut auf dem Design-System 3.0 (28.11.2026). Zugangsprinzip des Bereichs: oeffentliche Landung, kostenloses Konto = die
 * Standard-Werkzeuge, VIP = die Extras, Admin = alles.
 *   links   der Pass: Stufe, Name, wie lange der Zugang noch laeuft, der Zugangsschluessel (GET/POST /api/vip-schluessel - neuer Schluessel,
 *           wo der Admin es erlaubt), Discord und X; ohne VIP der Weg hinein
 *   rechts  was der Zugang freischaltet - eine Liste mit Haken oder Schloss (lib/rechte VIP_BEREICHE: Overlays und Globals hat jeder VIP,
 *           der Rest wird je VIP angehakt), dazu was jedes kostenlose Konto hat
 *   unten   Mein Archiv: alle gespeicherten Overlays, Tierlists und die Globals-Prognose
 */

const FREI: Array<{ titel: string; zu: string }> = [
  { titel: 'Live Streams and the multiview', zu: '/streamer/streams' },
  { titel: 'Cup timer and offspawn overlays', zu: '/streamer/overlays' },
  { titel: 'My page', zu: '/streamer/my-page' },
];
const WERKZEUGE: Array<{ recht: string | null; z: string; titel: string; was: string; ziel?: string; extern?: string }> = [
  { recht: null, z: 'overlay', titel: 'Live cup overlays', was: 'Team Banner, Leaderboard, Qual line and the Custom scoreboard', ziel: '/streamer/overlays' },
  { recht: null, z: 'pokal', titel: 'Overlays (Globals 2026)', was: 'Leaderboard, player banner and free overlay in the Global Championship look', ziel: '/streamer/overlays/globals' },
  { recht: 'twitchbot', z: 'bot', titel: 'Twitch bot', was: 'Commands and rules for your own chat', ziel: '/streamer/twitch-bot' },
  { recht: 'twitchstatistik', z: 'kurve', titel: 'Twitch statistics', was: 'Peak with and without raids, followers, chatters per day, week, month, year', ziel: '/streamer/twitch-stats' },
  { recht: 'matchfinder', z: 'finder', titel: 'Match-ID finder', was: 'Save favourites and see the running match ID to watch', ziel: '/competitive/match-finder' },
  { recht: 'replays', z: 'replay', titel: 'Replays', was: 'Every game of a cup in 2D and 3D: zones, kill feed, teams', ziel: '/competitive/replays' },
  { recht: 'propov', z: 'pov', titel: 'Pro POVs', was: 'Sign pros up by link, watch their POV, live alerts on your own Discord', extern: '/pov' },
];

/** Der Zugangsschluessel: Restlaufzeit und - wo erlaubt - einen neuen setzen. */
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
    <div className="border-t border-white/[0.06] pt-5">
      {tage !== null && (
        <div className="flex items-end gap-3">
          <span className="titel text-6xl leading-none text-amber-200">{tage}</span>
          <span className="pb-1 text-sm text-white/55">{tage === 1 ? 'day' : 'days'} of VIP access left</span>
        </div>
      )}
      {stand.darf && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Your access key</p>
          <p className="mt-1 text-xs text-white/50">Showed your key on stream by accident? Set a new one – leave the field empty for a random key.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={wunsch} onChange={(e) => setWunsch(e.target.value)} placeholder="New key (optional)" className="eingabe min-w-0 flex-1 !py-2" />
            <button type="button" onClick={() => void wechseln()} className="knopf">New key</button>
          </div>
          {neu && <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 font-mono text-sm text-amber-100">{neu}</p>}
          {meldung && <p className="mt-2 text-xs text-white/55">{meldung}</p>}
        </div>
      )}
    </div>
  );
}

export default function Vip() {
  const z = useZugang();
  const { oeffnen } = useWer();
  useEffect(() => {
    if (z.laedt || window.location.hash !== '#archiv') return;
    window.setTimeout(() => document.getElementById('archiv')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, [z.laedt]);
  if (z.laedt) return <Laedt text="Checking your access" />;
  const stufe = z.admin ? 'Admin' : z.manager ? 'Manager' : z.pro ? 'Pro' : z.vip ? 'VIP' : 'Free';
  const hat = (recht: string | null) => z.admin || (z.vip && (recht === null || z.rechte.includes(recht)));
  const offen = WERKZEUGE.filter((w) => hat(w.recht)).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ------------------------------------------- der Pass */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={`fl-fest relative overflow-hidden p-6 sm:p-7 xl:sticky xl:top-[7.5rem] xl:self-start ${z.vip ? '!border-amber-300/25' : ''}`}>
          <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${z.vip ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200' : 'bg-white/10'}`} />
          <div className="flex items-center justify-between gap-3">
            <p className="ueber">Streamer · Access</p>
            {z.vip ? <span className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-black">{stufe}</span> : <StufenMarke vip={false} />}
          </div>
          <h1 className="titel mt-3 text-6xl leading-[0.9]">{z.vip ? <>VIP pass<span className="block truncate text-4xl text-white/70">{z.name}</span></> : <>CompHub VIP</>}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            {z.vip ? `${offen} of ${WERKZEUGE.length} VIP tools are switched on for you – plus every overlay and list you saved, below.` : 'Live cup data on your stream: leaderboards, team banners and the qual line – plus the Twitch bot and statistics.'}
          </p>

          <div className="mt-5">{z.vip ? <Schluessel /> : (
            <div className="space-y-2">
              <button type="button" onClick={() => oeffnen('schluessel')} className="knopf-prim w-full">Enter VIP access key</button>
              <p className="text-center text-xs text-white/40">Got a key from CompHub? It unlocks VIP on this account.</p>
            </div>
          )}</div>

          <div className="mt-5 border-t border-white/[0.06] pt-5">
            <p className="text-sm font-semibold text-white">{z.vip ? 'Need another tool?' : 'Want VIP access?'}</p>
            <p className="mt-0.5 text-xs text-white/45">Join our Discord or write us on X.</p>
            <div className="mt-3 flex gap-2">
              <a href={MARKE.discord} target="_blank" rel="noreferrer" className="knopf flex-1">Discord</a>
              <a href={`https://x.com/${MARKE.x}`} target="_blank" rel="noreferrer" className="knopf flex-1">Write on X</a>
            </div>
          </div>
        </motion.section>

        {/* ------------------------------------------- was der Zugang freischaltet */}
        <section className="fl-fest p-5 sm:p-6">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="titel text-4xl">VIP tools</h2>
              <p className="mt-1 text-xs text-white/45">Overlays and Globals come with every VIP. The other tools are switched on per streamer by CompHub.</p>
            </div>
            <span className="zahl text-sm text-white/45"><b className="text-white">{offen}</b> / {WERKZEUGE.length} unlocked</span>
          </div>
          <ul className="divide-y divide-white/[0.05]">
            {WERKZEUGE.map((w, i) => {
              const an = hat(w.recht);
              const zeile = (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }} className="group flex items-center gap-4 py-3.5">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${an ? 'bg-akz/15 text-akz' : 'bg-white/[0.04] text-white/30'}`}><Zeichen name={w.z} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-bold ${an ? 'text-white' : 'text-white/50'}`}>{w.titel}</span>
                    <span className={`block text-xs ${an ? 'text-white/50' : 'text-white/35'}`}>{w.was}</span>
                    {!an && z.vip && w.recht && <span className="mt-0.5 block text-[11px] text-amber-200/70">Not switched on for your account yet – ask us on Discord.</span>}
                  </span>
                  {an ? <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><Zeichen name="haken" className="h-4 w-4" /><span className="hidden sm:inline">Open</span></span>
                    : <StufenMarke vip zu />}
                </motion.div>
              );
              if (!an) return <li key={w.titel}>{zeile}</li>;
              return <li key={w.titel}>{w.extern ? <a href={`https://www.thecomphub.com${w.extern}`} target="_blank" rel="noreferrer" className="block transition hover:bg-white/[0.02]">{zeile}</a> : <Link to={w.ziel!} className="block transition hover:bg-white/[0.02]">{zeile}</Link>}</li>;
            })}
          </ul>
          <div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/25 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Free with every account</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FREI.map((f) => <Link key={f.titel} to={f.zu} className="chip">{f.titel}</Link>)}
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------- Mein Archiv */}
      <div className="scroll-mt-32"><MeinArchiv /></div>
    </div>
  );
}
