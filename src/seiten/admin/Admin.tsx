import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { Glas } from '../../teile/Glas';
import { useWer, type Wer } from '../../teile/Anmeldung';
import Rahmen from './Rahmen';
import Live from './Live';
import VipZugaenge from './VipZugaenge';
import Vips from './Vips';
import Spieler from './Spieler';
import Sektionen from './Sektionen';
import Kontakt from './Kontakt';
import { portiert } from './port/Portiert';
import TweetSeite from './tweets/page';
import KontenSeite from './accounts/page';
import PrognosenSeite from './predictions/page';
import ReplaysSeite from './replays/page';
import ReplaySeite from './replay/page';
import OrgsSeite from './orgs/page';
import AwardsEditor from './awards/AwardsEditor';
import FotoPool from './fotos-pool/page';
import FotoCredits from './fotos-credits/page';
import FlaggenSeite from './flaggen/page';
import ProspectsSeite from './prospects/page';
import AlteMaps from './alte-maps/Werkzeug';
import PostIdeenSeite from './post-ideen/page';
import TikTokSeite from './tiktok/page';
import PlakateSeite from './plakate/page';
import ArchivSeite from './archive/page';
import BildvorratSeite from './assets/page';
import WechselSeite from './switch/page';
import DiensteSeite from './services/page';
import PartnerSeite from './partner/page';
import LootRouten from './loot-routen/page';
import AlleEpicFreunde from './epic-friends/page';
import { GRUPPEN, WERKZEUGE, passt, werkzeugNach, type Werkzeug } from './werkzeuge';
import { Laedt, NurAdmins, feld } from './teile';

/*
 * Der Admin-Bereich im Hub (/admin, Betreiber 26.11.2026: "als Admin muss ich auch meine Admin-Tools und alles sehen. Du darfst nicht einfach Sachen
 * entfernen."). Links alle Werkzeuge nach Gruppen (werkzeuge.ts - jedes Werkzeug der echten Seite), rechts das gewaehlte. Im Hub gebaut sind die mit
 * "eigen"; alle anderen laufen als echte Seite im Rahmen (Rahmen.tsx). Nur fuer Admins - alle anderen sehen eine freundliche Karte.
 */
const EIGEN: Record<string, ComponentType<{ klassisch: () => void }>> = { live: Live, 'vip-access': VipZugaenge, vips: Vips, players: Spieler, sections: Sektionen, contact: Kontakt,
  tweets: portiert(TweetSeite, 'Content'),
  accounts: portiert(KontenSeite, 'Users & Access'),
  predictions: portiert(PrognosenSeite, 'Content'),
  replays: portiert(ReplaysSeite, 'Data & Replays'),
  replay: portiert(ReplaySeite, 'Data & Replays'),
  orgs: portiert(OrgsSeite, 'Players & Teams'),
  awards: portiert(AwardsEditor, 'Content'),
  'fotos-pool': portiert(FotoPool, 'Players & Teams'),
  'fotos-credits': portiert(FotoCredits, 'Players & Teams'),
  flaggen: portiert(FlaggenSeite, 'Players & Teams'),
  prospects: portiert(ProspectsSeite, 'Players & Teams'),
  'alte-maps': portiert(AlteMaps, 'Content'),
  'post-ideen': portiert(PostIdeenSeite, 'Content'),
  'tiktok': portiert(TikTokSeite, 'Content'),
  'plakate': portiert(PlakateSeite, 'Content'),
  'archive': portiert(ArchivSeite, 'Content'),
  'assets': portiert(BildvorratSeite, 'Content'),
  'switch': portiert(WechselSeite, 'Users & Access'),
  'services': portiert(DiensteSeite, 'Users & Access'),
  'partner': portiert(PartnerSeite, 'Inbox'),
  'loot-routen': LootRouten,
  'epic-friends': AlleEpicFreunde,
};

/** check-admin selbst nachfragen, solange useWer noch nichts weiss - sonst blitzte kurz "admins only" auf. */
function useAdmin(): Wer | null | 'laedt' {
  const { wer } = useWer();
  const [eigen, setEigen] = useState<Wer | null | 'laedt'>('laedt');
  useEffect(() => {
    fetch('/api/auth/check-admin', { cache: 'no-store' }).then((r) => r.json()).then(setEigen).catch(() => setEigen(null));
  }, [wer?.userName]);
  return wer ?? eigen;
}

export default function Admin() {
  const wer = useAdmin();
  return (
    <div className="min-h-screen">
      <Kopf bereich="admin" />
      <main className="px-6 pb-16 pt-6 lg:px-10">
        {wer === 'laedt' ? <Laedt text="Checking your rights …" /> : !wer?.isAdmin ? <NurAdmins text="The admin area is for CompHub admins only." /> : (
          <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
            <Leiste />
            <div className="min-w-0">
              <Routes>
                <Route index element={<Uebersicht />} />
                <Route path=":slug/*" element={<Werkzeugseite />} />
              </Routes>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** Die Seitenleiste: Suche, Uebersicht und jede Gruppe mit ihren Werkzeugen. */
function Leiste() {
  const [suche, setSuche] = useState('');
  const ort = useLocation();
  const gefiltert = WERKZEUGE.filter((w) => passt(w, suche));
  return (
    <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1">
      <Glas className="p-3">
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={`Search ${WERKZEUGE.length} tools …`} className={`${feld} w-full rounded-full py-1.5 text-xs`} />
        <NavLink to="/admin" end className={({ isActive }) => `mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-white/[0.08] text-white' : 'text-white/65 hover:bg-white/[0.04] hover:text-white'}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>Overview
        </NavLink>
        {GRUPPEN.map((g) => {
          const liste = gefiltert.filter((w) => w.gruppe === g.id);
          if (!liste.length) return null;
          return (
            <div key={g.id} className="mt-3">
              <p className={`flex items-center gap-2 px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] ${g.farbe}`}><span className={`h-1.5 w-1.5 rounded-full ${g.punkt}`} />{g.titel}</p>
              {liste.map((w) => {
                const aktiv = ort.pathname === `/admin/${w.slug}` || ort.pathname.startsWith(`/admin/${w.slug}/`);
                return (
                  <Link key={w.slug} to={w.hub ?? `/admin/${w.slug}`} title={w.hub ? `Opens the hub page ${w.hub.split('?')[0]}` : undefined} className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] transition ${aktiv ? 'text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}>
                    {aktiv && <motion.span layoutId="admin-aktiv" className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.08]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className="relative truncate">{w.titel}</span>
                    {w.eigen && <span className="relative ml-auto rounded-full bg-sky-400/15 px-1.5 py-px text-[9px] font-bold uppercase text-sky-300">Hub</span>}
                    {w.hub && <span className="relative ml-auto rounded-full bg-teal-400/15 px-1.5 py-px text-[9px] font-bold uppercase text-teal-300">Hub ↗</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
        {!gefiltert.length && <p className="px-3 py-4 text-xs text-white/40">No tool matches.</p>}
      </Glas>
    </aside>
  );
}

/** Ein Werkzeug: im Hub gebaut (mit "Classic view") oder die echte Seite im Rahmen. ?classic=1 zeigt immer die echte Seite. */
function Werkzeugseite() {
  const { slug = '' } = useParams();
  const [p, setP] = useSearchParams();
  const w = werkzeugNach(slug);
  if (!w) return <Glas className="p-8 text-sm text-white/55">This tool does not exist. <Link to="/admin" className="text-sky-300">Back to the overview</Link></Glas>;
  // Die Seite gibt es im Hub schon (Maps, Scrims, Awards, Tagesposts) - dorthin; ?classic=1 zeigt weiter die echte Seite.
  if (w.hub && p.get('classic') !== '1') return <Navigate to={w.hub} replace />;
  const Eigen = EIGEN[w.slug];
  const klassisch = p.get('classic') === '1';
  if (Eigen && !klassisch) return <Eigen key={w.slug} klassisch={() => setP({ classic: '1' })} />;
  return <Rahmen key={w.slug} pfad={w.pfad} titel={w.titel} nativ={Eigen ? () => setP({}) : undefined} />;
}

/** Zahlen fuer die Uebersicht - nur lesende Abrufe, die es auf der Seite auch gibt. */
function useZahlen() {
  const [z, setZ] = useState<{ online?: number; leute?: number; kontakt?: number; vips?: number }>({});
  useEffect(() => {
    let weg = false;
    const setze = (t: Partial<typeof z>) => { if (!weg) setZ((v) => ({ ...v, ...t })); };
    fetch('/api/admin/anwesend', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setze({ online: (j.leute ?? []).filter((x: { online: boolean }) => x.online).length, leute: (j.leute ?? []).length })).catch(() => {});
    fetch('/api/kontakt?zaehlen=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setze({ kontakt: Number(j.offen ?? 0) })).catch(() => {});
    fetch('/api/vips?alle=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setze({ vips: (j.vips ?? []).filter((v: { aktiv: boolean }) => v.aktiv).length })).catch(() => {});
    return () => { weg = true; };
  }, []);
  return z;
}

function Zahl({ wert }: { wert?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (wert === undefined) return undefined;
    const start = performance.now(); let f = 0;
    const lauf = (t: number) => { const a = Math.min(1, (t - start) / 700); setN(Math.round(wert * (1 - Math.pow(1 - a, 3)))); if (a < 1) f = requestAnimationFrame(lauf); };
    f = requestAnimationFrame(lauf); return () => cancelAnimationFrame(f);
  }, [wert]);
  return <>{wert === undefined ? '–' : n}</>;
}

function Uebersicht() {
  const [suche, setSuche] = useState('');
  const z = useZahlen();
  const weiter = useNavigate();
  const gefiltert = useMemo(() => WERKZEUGE.filter((w) => passt(w, suche)), [suche]);
  const kacheln = [
    { titel: 'Online now', wert: z.online, unter: z.leute !== undefined ? `${z.leute} people recorded` : 'Live presence', zu: 'live', farbe: 'text-emerald-300' },
    { titel: 'Open contact messages', wert: z.kontakt, unter: 'Contact inbox', zu: 'contact', farbe: 'text-rose-300' },
    { titel: 'VIPs on the homepage', wert: z.vips, unter: 'Homepage selection', zu: 'vips', farbe: 'text-violet-300' },
    { titel: 'Admin tools', wert: WERKZEUGE.length, unter: `${WERKZEUGE.filter((w) => w.eigen || w.hub).length} in the hub`, zu: '', farbe: 'text-sky-300' },
  ];
  let n = 0;
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Admin</p>
          <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">Control room</h1>
          <p className="mt-2 text-white/55">Every tool of thecomphub.com in one place. Tools marked <span className="rounded-full bg-sky-400/15 px-1.5 text-[10px] font-bold uppercase text-sky-300">Hub</span> are rebuilt here, <span className="rounded-full bg-teal-400/15 px-1.5 text-[10px] font-bold uppercase text-teal-300">Hub ↗</span> open the hub's own public page; all others open the real page inside the hub.</p>
        </div>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search tools …" autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && gefiltert[0]) weiter(`/admin/${gefiltert[0].slug}`); }}
          className={`${feld} w-80 max-w-full rounded-full py-2.5`} />
      </motion.div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {kacheln.map((k, i) => (
          <motion.div key={k.titel} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -3 }}>
            <Link to={k.zu ? `/admin/${k.zu}` : '/admin'} className="block rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-white/20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">{k.titel}</p>
              <p className={`mt-1 text-5xl font-extrabold tabular-nums tracking-tight ${k.farbe}`}><Zahl wert={k.wert} /></p>
              <p className="mt-1 text-xs text-white/45">{k.unter}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="space-y-8">
        {GRUPPEN.map((g) => {
          const liste = gefiltert.filter((w) => w.gruppe === g.id);
          if (!liste.length) return null;
          return (
            <section key={g.id}>
              <h2 className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] ${g.farbe}`}><span className={`h-2 w-2 rounded-full ${g.punkt}`} />{g.titel}<span className="text-white/30">{liste.length}</span></h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {liste.map((w) => <Kachel key={w.slug} w={w} rand={g.rand} i={n++} kontakt={w.zaehler === 'kontakt' ? z.kontakt : undefined} />)}
              </div>
            </section>
          );
        })}
        {!gefiltert.length && <Glas className="p-8 text-center text-sm text-white/50">No tool matches “{suche}”.</Glas>}
      </div>
    </>
  );
}

function Kachel({ w, rand, i, kontakt }: { w: Werkzeug; rand: string; i: number; kontakt?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.02, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -3 }}>
      <Link to={w.hub ?? `/admin/${w.slug}`} className={`group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition hover:bg-white/[0.055] ${rand}`}>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-white group-hover:text-sky-200">{w.titel}</span>
          {!!kontakt && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{kontakt}</span>}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${w.eigen ? 'bg-sky-400/15 text-sky-300' : w.hub ? 'bg-teal-400/15 text-teal-300' : 'bg-white/5 text-white/40'}`}>{w.eigen ? 'Hub' : w.hub ? 'Hub page ↗' : 'Live page'}</span>
        </span>
        <span className="mt-1.5 flex-1 text-xs leading-relaxed text-white/50">{w.text}</span>
        <span className="mt-3 font-mono text-[10px] text-white/25">{w.hub ? w.hub.split('?')[0] : w.pfad}</span>
      </Link>
    </motion.div>
  );
}
