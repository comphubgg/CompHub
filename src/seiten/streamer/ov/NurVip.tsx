import { motion } from 'framer-motion';
import { useWer } from '../../../teile/Anmeldung';

/* Ein VIP-Werkzeug ohne VIP: violettes Glas mit Anmelden und Zugangsschluessel (ersetzt "Nur fuer VIPs" der Seite auf main). */
export default function NurVip({ titel = 'VIPs only', text }: { titel?: string; text: string }) {
  const { oeffnen } = useWer();
  return (
    <div className="relative grid min-h-[60vh] place-items-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[min(620px,100%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[110px]" />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-xl rounded-[2rem] border border-violet-300/20 bg-[#0b0d16]/75 p-9 text-center backdrop-blur-2xl">
        <span className="rounded-full bg-violet-400 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#06080f]">VIP</span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">{titel}</h1>
        <p className="mt-2 text-white/55">{text}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => oeffnen('schluessel')} className="rounded-full bg-violet-400 px-6 py-2.5 text-sm font-bold text-[#06080f] transition hover:-translate-y-0.5 hover:bg-violet-300">Enter VIP access key</button>
          <button type="button" onClick={() => oeffnen('konto')} className="rounded-full border border-violet-300/40 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-violet-400/10">Sign in with another account</button>
        </div>
        <a href="https://discord.gg/8jQ3tf37sQ" target="_blank" rel="noreferrer" className="mt-5 inline-block text-xs text-white/45 hover:text-violet-200">Want VIP? Ask us on Discord →</a>
      </motion.div>
    </div>
  );
}
