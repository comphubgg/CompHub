import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bild, Leer, Marke } from '../../../ds/Bausteine';
import { useWer } from '../../../teile/Anmeldung';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt } from './teile';

/*
 * Tagesposts im Hub (wie /posts und /posts/[datum], nur Admin): die Posts des Tages fuer X (/api/posts?datum=) mit Bild (/api/post-bild), Text kopieren,
 * Bild kopieren (sonst herunterladen), "Anderen Post" (POST aktion neu), Tag vor/zurueck. Alles aus echten Zahlen, nichts doppelt.
 * Dazu die Match-Seite /competitive/match/:tag/:nr - sie fuehrt auf das Game in den Replays des Hubs.
 * Aufbau (Design-System 3.0, 27.11.2026): oben der Tag gross und eine Wochenleiste zum Springen (sieben Tage, kein Vor/Zurueck-Raten); links klebt
 * die Reihenfolge des Tages (Art, Titel, Zeichenzahl - Klick springt zum Post), rechts die Posts als Bildkarten in zwei Spalten: Bild oben in
 * 16:9, darunter Text, Zeichenbalken bis 280 und die Knoepfe.
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
  const woche = Array.from({ length: 7 }, (_, i) => versatz(datum, i - 3));
  const tagName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <p className="ueber">Daily posts · for the CompHub X account</p>
          <h1 className="titel mt-1 text-5xl lg:text-7xl">{new Date(`${datum}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">Today's posts: copy text and picture, paste into X. Everything from real numbers, no hashtags, nothing twice.</p>
        </motion.div>
        {/* Wochenleiste: drei Tage zurueck, drei voraus */}
        <nav className="ohne-leiste flex max-w-full items-stretch gap-1.5 overflow-x-auto">
          {woche.map((d) => {
            const an = d === datum, istHeute = d === heute();
            return (
              <Link key={d} to={`/competitive/posts/${d}`} className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition ${an ? 'border-akz bg-akz/15' : 'border-white/[0.08] bg-fl hover:border-white/25'}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${istHeute ? 'text-akz' : 'text-white/40'}`}>{istHeute ? 'Today' : tagName(d)}</span>
                <span className={`titel zahl text-3xl ${an ? '' : '!text-white/60'}`}>{Number(d.slice(8))}</span>
              </Link>
            );
          })}
          {!woche.includes(heute()) && <Link to={`/competitive/posts/${heute()}`} className="knopf shrink-0 self-center">Today</Link>}
        </nav>
      </header>
      {plan === undefined && <Laedt />}
      {fehler && <FehlerZeile text={fehler} />}
      {plan === null && !fehler && <Leer text="No posts for this day yet." />}
      {plan && !plan.posts.length && <Leer text="Today's data does not allow a post — nothing is invented." />}
      {plan && plan.posts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
          {/* Die Reihenfolge des Tages */}
          <aside className="fl-fest overflow-hidden xl:sticky xl:top-[7.5rem]">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3"><span className="h-4 w-1 rounded-full bg-akz" /><h2 className="titel text-xl">Today's queue</h2><span className="zahl text-xs font-semibold text-white/40">{plan.posts.length} posts</span></div>
            <ol>
              {plan.posts.map((p, i) => (
                <li key={`${p.nr}-${p.schluessel}`}>
                  <a href={`#post-${p.nr}`} className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 transition last:border-b-0 hover:bg-akz/[0.07]">
                    <span className="titel w-7 shrink-0 text-3xl !text-white/30">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-akz">{ART[p.art] ?? p.art}</span><span className="block truncate text-[13px] font-semibold text-white/85">{p.titel}</span></span>
                    <span className={`zahl shrink-0 text-[11px] ${p.text.length > 280 ? 'text-amber-300' : 'text-white/35'}`}>{p.text.length}</span>
                  </a>
                </li>
              ))}
            </ol>
          </aside>
          {/* Die Posts */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            {plan.posts.map((p, i) => (
              <motion.article key={`${p.nr}-${p.schluessel}-${stand}`} id={`post-${p.nr}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}
                className="fl-fest flex scroll-mt-36 flex-col overflow-hidden">
                <div className="relative">
                  <Bild src={bildUrl(p)} className="aspect-video w-full" />
                  <span className="absolute left-3 top-3 flex gap-1.5"><Marke ton="akz">{ART[p.art] ?? p.art}</Marke><Marke><span className="zahl">#{i + 1}</span></Marke></span>
                  <button type="button" onClick={() => void bildKopieren(p)} className="absolute bottom-3 right-3 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:border-akz/60">{bildKopiert === p.nr ? 'Picture copied ✓' : 'Copy picture'}</button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <h2 className="truncate text-[15px] font-bold text-white">{p.titel}</h2>
                  <pre className="mt-2.5 flex-1 whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-black/40 p-4 font-sans text-sm leading-relaxed text-white/85">{p.text}</pre>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]"><span className={`block h-full rounded-full ${p.text.length > 280 ? 'bg-amber-300' : 'bg-akz'}`} style={{ width: `${Math.min(100, (p.text.length / 280) * 100)}%` }} /></span>
                    <span className={`zahl text-[11px] ${p.text.length > 280 ? 'text-amber-300' : 'text-white/40'}`}>{p.text.length} / 280+</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(p.text).then(() => { setKopiert(p.nr); setTimeout(() => setKopiert(null), 1800); }).catch(() => {}); }} className="knopf-prim !py-2">{kopiert === p.nr ? 'Copied ✓' : 'Copy text'}</button>
                    <button type="button" disabled={ersetzt === p.nr} onClick={() => void anderen(p.nr)} className="knopf">{ersetzt === p.nr ? 'searching …' : 'Another post'}</button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** /competitive/match/:tag/:nr - ein Game eines Spieltags; die Ansicht selbst steht in den Replays. */
export function MatchSeite() {
  const { tag = '', nr = '' } = useParams();
  return <Navigate to={`/competitive/replays?tag=${encodeURIComponent(tag)}&game=${encodeURIComponent(nr)}`} replace />;
}
