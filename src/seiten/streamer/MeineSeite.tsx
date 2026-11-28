import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWer } from '../../teile/Anmeldung';
import { KanalAnsicht } from './ov/StreamerSeite';
import { StufenMarke, Zeichen } from './Teile';
import { istVip } from './zugang';

/*
 * My page - neu gebaut auf dem Design-System 3.0 (28.11.2026). Oben eine Zeile: welcher Twitch-Kanal deiner ist (gemerkt im Browser), dann
 * genau die Seite, die CompHubs Zuschauer von dir sehen (KanalAnsicht aus ov/StreamerSeite: Buehne mit Banner und Live-Bild, Clips, Posts,
 * Plan). Die volle Seite (GET /api/streamer-seite) gibt der Server vorerst nur dem Admin - sonst zeigt sie, was Twitch sagt
 * (POST /api/live-status). VIPs bekommen den Link auf ihre oeffentliche Seite /streamer/page/:kanal.
 */

const MERKER = 'hub-streamer-kanal';
const lies = () => { try { return localStorage.getItem(MERKER) ?? ''; } catch { return ''; } };
const merke = (k: string) => { try { localStorage.setItem(MERKER, k); } catch { /* egal */ } };

export default function MeineSeite() {
  const { wer } = useWer();
  const vip = istVip(wer);
  const [eingabe, setEingabe] = useState(() => lies() || (wer?.userName ?? '').toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const [kanal, setKanal] = useState(eingabe);
  const uebernehmen = () => { const k = eingabe.trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[^a-z0-9_]/g, ''); setEingabe(k); setKanal(k); if (k) merke(k); };

  return (
    <div className="space-y-5">
      {/* Kopf: eine Zeile - Titel links, der eigene Kanal rechts */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Create · My page</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">My page</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">Your channel exactly as CompHub's viewers see it – live picture, clips, posts and your schedule.</p>
        </motion.div>
        <form onSubmit={(e) => { e.preventDefault(); uebernehmen(); }} className="flex w-full max-w-lg gap-2">
          <label className="flex min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-black/40 pl-3.5 transition focus-within:border-akz/60">
            <span className="text-sm text-white/35">twitch.tv/</span>
            <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} placeholder="your channel" className="w-full bg-transparent px-1 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
          </label>
          <button className="knopf-prim">Show</button>
        </form>
      </header>

      {kanal ? (
        <KanalAnsicht key={kanal} kanal={kanal} grund="Schedule, top clips and posts on your page are switched on by CompHub – for now only the admin sees them."
          knoepfe={vip
            ? <Link to={`/streamer/page/${kanal}`} className="knopf"><Zeichen name="seite" className="h-4 w-4" />Public page</Link>
            : <span className="knopf cursor-default opacity-70">Public page <StufenMarke vip zu /></span>} />
      ) : (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">Type your Twitch channel above to see your page.</p>
      )}
    </div>
  );
}
