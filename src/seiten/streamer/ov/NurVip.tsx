import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useWer } from '../../../teile/Anmeldung';
import { StufenMarke, Zeichen } from '../Teile';

/*
 * Ein VIP-Werkzeug ohne VIP (Design 3.0, 28.11.2026): links was fehlt und die zwei Wege hinein (Zugangsschluessel, anderes Konto), rechts was
 * VIP alles freischaltet - eine echte Auskunft statt eines leuchtenden Kastens. VIP ist Gold (Bedeutungsfarbe), der Bereich bleibt Violett.
 */
const EXTRAS: Array<{ z: string; titel: string; text: string; zu: string }> = [
  { z: 'overlay', titel: 'Live cup overlays', text: 'Team banner, leaderboard and qual line with live Epic data', zu: '/streamer/overlays' },
  { z: 'pokal', titel: 'Globals 2026 overlays', text: 'In the look of the Global Championship', zu: '/streamer/overlays/globals' },
  { z: 'bot', titel: 'Twitch bot', text: 'Your commands and chat rules, around the clock', zu: '/streamer/twitch-bot' },
  { z: 'kurve', titel: 'Twitch stats', text: 'Peak, average, followers and chatters per stream', zu: '/streamer/twitch-stats' },
  { z: 'archiv', titel: 'Your archive', text: 'Every overlay you saved, in one place', zu: '/streamer/vip' },
];

export default function NurVip({ titel = 'VIPs only', text }: { titel?: string; text: string }) {
  const { oeffnen } = useWer();
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fl-fest grid overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="p-7 sm:p-10">
        <StufenMarke vip />
        <h1 className="titel mt-4 text-5xl sm:text-6xl">{titel}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">{text}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" onClick={() => oeffnen('schluessel')} className="knopf-prim">Enter VIP access key</button>
          <button type="button" onClick={() => oeffnen('konto')} className="knopf">Sign in with another account</button>
        </div>
        <a href="https://discord.gg/8jQ3tf37sQ" target="_blank" rel="noreferrer" className="knopf-leer mt-6">Want VIP? Ask us on Discord <span aria-hidden>→</span></a>
      </div>
      <div className="border-t border-white/[0.06] bg-black/20 p-7 sm:p-10 lg:border-l lg:border-t-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">What VIP unlocks</p>
        <ul className="mt-4 divide-y divide-white/[0.05]">
          {EXTRAS.map((x) => (
            <li key={x.titel}>
              <Link to={x.zu} className="group flex items-center gap-4 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-200"><Zeichen name={x.z} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{x.titel}</span>
                  <span className="block truncate text-xs text-white/45">{x.text}</span>
                </span>
                <Zeichen name="pfeil" className="h-4 w-4 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
