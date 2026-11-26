import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';

import { FehlerZeile, Laedt, Leer, SeitenKopf } from './teile';

/*
 * Tagesposts im Hub (wie /posts und /posts/[datum], nur Admin): die Posts des Tages fuer X (/api/posts?datum=) mit Bild (/api/post-bild), Text kopieren,
 * Bild kopieren (sonst herunterladen), "Anderen Post" (POST aktion neu), Tag vor/zurueck. Alles aus echten Zahlen, nichts doppelt.
 * Dazu die Match-Seite /competitive/match/:tag/:nr - sie fuehrt auf das Game in den Replays des Hubs.
 */

interface Post { nr: number; art: string; schluessel: string; titel: string; text: string }
const ART: Record<string, string> = { ergebnis: 'Result', cup: 'Cup', spieler: 'Player', duell: 'Head to head', rekord: 'Leaders', ranking: 'Ranking', promo: 'Promo', update: 'Update', karte: 'Map', worst: 'Worst of 🧌' };
const versatz = (d: string, t: number) => new Date(Date.parse(`${d}T12:00:00Z`) + t * 86_400_000).toISOString().slice(0, 10);
const heute = () => new Date().toISOString().slice(0, 10);

export function PostsHeute() { return <Navigate to={`/competitive/posts/${heute()}`} replace />; }

export function Posts() {
  const { datum = heute() } = useParams();
  const { wer } = useWer();
  const [plan, setPlan] = useState<{ datum: string; posts: Post[] } | null | undefined>(undefined);
  const [fehler, setFehler] = useState('');
  const [kopiert, setKopiert] = useState<number | null>(null);
  const [bildKopiert, setBildKopiert] = useState<number | null>(null);
  const [ersetzt, setErsetzt] = useState<number | null>(null);
  const [stand, setStand] = useState(0);
  const laden = useCallback(async () => {
    setFehler(''); setPlan(undefined);
    try {
      const j = await fetch(`/api/posts?datum=${encodeURIComponent(datum)}`, { cache: 'no-store' }).then((r) => r.json());
      if (!j?.ok) { setFehler(j?.error ? 'The posts could not be loaded.' : 'Not available.'); setPlan(null); return; }
      setPlan(j.plan ?? null);
    } catch { setFehler('Not available.'); setPlan(null); }
  }, [datum]);
  useEffect(() => { if (wer?.isAdmin) void laden(); }, [wer?.isAdmin, laden]);
  if (!wer) return <Laedt />;
  if (!wer.isAdmin) return <AnmeldeKarte titel="Admins only" text="The daily posts are prepared for the CompHub X account — sign in as admin." />;

  const bildUrl = (p: Post) => `/api/post-bild?datum=${datum}&nr=${p.nr}&v=${stand}`;
  const bildKopieren = async (p: Post) => {
    try {
      const blob = await (await fetch(bildUrl(p))).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' }) })]);
      setBildKopiert(p.nr); setTimeout(() => setBildKopiert(null), 1800);
    } catch { const a = document.createElement('a'); a.href = bildUrl(p); a.download = `comphub-${datum}-${p.nr + 1}.png`; a.click(); }
  };
  const anderen = async (nr: number) => {
    setErsetzt(nr);
    try {
      const j = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datum, aktion: 'neu', nr }) }).then((r) => r.json());
      if (j?.ok) { setPlan(j.plan); setStand((s) => s + 1); } else setFehler('No other post found.');
    } finally { setErsetzt(null); }
  };
  const knopf = 'rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-white/75 backdrop-blur-xl transition hover:border-sky-400/50 hover:text-white';
  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Daily posts" titel={new Date(`${datum}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        text="Today's posts: copy text and picture, paste into X. Everything from real numbers, no hashtags, nothing twice."
        rechts={<><Link to={`/competitive/posts/${versatz(datum, -1)}`} className={knopf}>← {versatz(datum, -1)}</Link>{datum !== heute() && <Link to={`/competitive/posts/${heute()}`} className={knopf}>Today</Link>}<Link to={`/competitive/posts/${versatz(datum, 1)}`} className={knopf}>{versatz(datum, 1)} →</Link></>} />
      {plan === undefined && <Laedt />}
      {fehler && <FehlerZeile text={fehler} />}
      {plan === null && !fehler && <Leer text="No posts for this day yet." />}
      {plan && !plan.posts.length && <Leer text="Today's data does not allow a post — nothing is invented." />}
      <div className="space-y-6">
        {plan?.posts.map((p, i) => (
          <motion.article key={`${p.nr}-${p.schluessel}-${stand}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl lg:grid-cols-[1.15fr_1fr] lg:p-5">
            <div>
              <img src={bildUrl(p)} alt="" className="w-full rounded-2xl border border-white/10 bg-black/40" />
              <button type="button" onClick={() => void bildKopieren(p)} className={`mt-3 ${knopf}`}>{bildKopiert === p.nr ? 'Picture copied ✓' : 'Copy picture'}</button>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2"><span className="rounded-full bg-sky-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#06080f]">{ART[p.art] ?? p.art}</span><h2 className="min-w-0 truncate text-sm font-bold text-white/85">{p.titel}</h2></div>
              <pre className="mt-3 flex-1 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 font-sans text-sm leading-relaxed text-white/85">{p.text}</pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { void navigator.clipboard.writeText(p.text).then(() => { setKopiert(p.nr); setTimeout(() => setKopiert(null), 1800); }).catch(() => {}); }} className="rounded-full bg-sky-400 px-5 py-2 text-xs font-bold text-[#06080f] hover:bg-sky-300">{kopiert === p.nr ? 'Copied ✓' : 'Copy text'}</button>
                <button type="button" disabled={ersetzt === p.nr} onClick={() => void anderen(p.nr)} className={`${knopf} disabled:opacity-50`}>{ersetzt === p.nr ? 'searching …' : 'Another post'}</button>
                <span className={`ml-auto text-[11px] tabular-nums ${p.text.length > 280 ? 'text-amber-300' : 'text-white/40'}`}>{p.text.length} / 280+</span>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

/** /competitive/match/:tag/:nr - ein Game eines Spieltags; die Ansicht selbst steht in den Replays. */
export function MatchSeite() {
  const { tag = '', nr = '' } = useParams();
  return <Navigate to={`/competitive/replays?tag=${encodeURIComponent(tag)}&game=${encodeURIComponent(nr)}`} replace />;
}
