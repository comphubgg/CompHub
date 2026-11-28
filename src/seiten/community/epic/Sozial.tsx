import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Abschnitt, Bild, Flaeche, Laedt, Leer, SeitenKopf } from '../../../ds/Bausteine';

/*
 * Social (Design-System 3.0, neu komponiert 28.11.2026; Betreiber: "X zuerst, Reddit als Zweites").
 *   X        drei eingebettete Zeitleisten nebeneinander (@CompHub_gg, @FortniteGame, @FNCompetitive) ueber X' freies Widget
 *            (platform.twitter.com/widgets.js). Laedt das Widget nicht (Blocker, X verlangt eine Anmeldung), bleibt je Konto die Karte mit
 *            dem Knopf "Open on X" - nie ein leerer Kasten.
 *   Reddit   Beitraege je Thema MIT Bildern; serverseitig ueber /hub-quellen/reddit (tools/hubQuellen.mjs), weil Reddit Abfragen aus dem
 *            Browser sperrt. Antwortet der Helfer nicht, wird es einmal direkt aus dem Browser versucht.
 *   Kanaele  Discord, X, TikTok von CompHub als Knoepfe im Kopf.
 */

const KANAELE = [
  { t: 'Discord', s: 'Cups, results, help', u: 'https://discord.gg/8jQ3tf37sQ' },
  { t: 'X', s: '@CompHub_gg', u: 'https://x.com/CompHub_gg' },
  { t: 'TikTok', s: '@comphub.gg', u: 'https://www.tiktok.com/@comphub.gg' },
];
const X_KONTEN = [
  { name: 'CompHub_gg', titel: 'CompHub', text: 'Live results, rankings and daily graphics' },
  { name: 'FortniteGame', titel: 'Fortnite', text: 'The official account – updates, shop, collabs' },
  { name: 'FNCompetitive', titel: 'Fortnite Competitive', text: 'Cups, FNCS and rule changes' },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
let xSkript: Promise<any> | null = null;
/** X' Widget-Skript einmal laden. null = nicht erreichbar. */
function xLaden(): Promise<any> {
  if (!xSkript) {
    xSkript = new Promise((fertig) => {
      const w = window as any;
      if (w.twttr?.widgets) { fertig(w.twttr); return; }
      const s = document.createElement('script'); s.src = 'https://platform.twitter.com/widgets.js'; s.async = true;
      const ende = setTimeout(() => fertig(null), 9000);
      s.onload = () => { const t = (window as any).twttr; if (t?.ready) t.ready((x: any) => { clearTimeout(ende); fertig(x); }); else { clearTimeout(ende); fertig(t?.widgets ? t : null); } };
      s.onerror = () => { clearTimeout(ende); fertig(null); };
      document.head.appendChild(s);
    });
  }
  return xSkript;
}

function XZeitleiste({ konto, verz }: { konto: typeof X_KONTEN[number]; verz: number }) {
  const kasten = useRef<HTMLDivElement>(null);
  const [stand, setStand] = useState<'laedt' | 'da' | 'aus'>('laedt');
  useEffect(() => {
    let weg = false; const el = kasten.current;
    xLaden().then(async (twttr) => {
      if (weg || !el) return;
      if (!twttr?.widgets?.createTimeline) { setStand('aus'); return; }
      el.innerHTML = '';
      const rahmen = await Promise.race([
        twttr.widgets.createTimeline({ sourceType: 'profile', screenName: konto.name }, el, { theme: 'dark', height: 620, chrome: 'noheader nofooter noborders transparent', dnt: true }),
        new Promise((r) => setTimeout(() => r(null), 12_000)),
      ]).catch(() => null);
      if (!weg) setStand(rahmen ? 'da' : 'aus');
    });
    return () => { weg = true; };
  }, [konto.name]);
  return (
    <Flaeche fest verz={verz} className="flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0"><p className="titel truncate text-2xl">{konto.titel}</p><p className="truncate text-xs text-white/45">@{konto.name} · {konto.text}</p></div>
        <a href={`https://x.com/${konto.name}`} target="_blank" rel="noreferrer" className="knopf shrink-0 !px-3 !py-1.5 !text-xs">Open on X ↗</a>
      </div>
      <div className="relative min-h-[220px] flex-1">
        <div ref={kasten} className={stand === 'da' ? 'px-2' : 'hidden'} />
        {stand === 'laedt' && <Laedt text="Loading posts" />}
        {stand === 'aus' && (
          <div className="grid h-full min-h-[220px] place-items-center px-6 py-8 text-center">
            <div><p className="text-sm leading-relaxed text-white/55">X didn't hand out the posts of @{konto.name} here – it often asks you to be signed in to X in this browser, and blockers stop the widget too.</p>
              <a href={`https://x.com/${konto.name}`} target="_blank" rel="noreferrer" className="knopf-prim mt-4">Read @{konto.name} on X ↗</a></div>
          </div>
        )}
      </div>
    </Flaeche>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------------------------------------------- Reddit */
const THEMEN = [
  { k: 'comp', titel: 'Competitive', sub: 'FortniteCompetitive' }, { k: 'br', titel: 'Battle Royale', sub: 'FortNiteBR' }, { k: 'leaks', titel: 'Leaks', sub: 'FortniteLeaks' },
  { k: 'creative', titel: 'Creative', sub: 'FortniteCreative' }, { k: 'fashion', titel: 'Fashion', sub: 'FortniteFashion' }, { k: 'festival', titel: 'Festival', sub: 'FortniteFestival' },
] as const;
interface Beitrag { id: string; title: string; author: string; permalink: string; score: number; num_comments: number; created_utc: number; link_flair_text?: string | null; bild?: string | null; video?: boolean; text?: string }
const vor = (s: number) => { const h = Math.floor((Date.now() / 1000 - s) / 3600); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
const kurzZahl = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
/* eslint-disable @typescript-eslint/no-explicit-any */
async function redditHolen(sub: string): Promise<Beitrag[] | null> {
  try {
    const r = await fetch(`/hub-quellen/reddit?sub=${sub}`);
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { const j = await r.json(); if (j?.ok) return j.beitraege as Beitrag[]; }
  } catch { /* weiter mit dem Browser-Versuch */ }
  try {
    const r = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=30&raw_json=1`);
    if (!r.ok) return null;
    const j = await r.json();
    return ((j?.data?.children ?? []) as any[]).map((c) => c.data).filter((b) => b && !b.stickied && !b.over_18).map((b): Beitrag => ({ id: b.id, title: b.title, author: b.author, permalink: b.permalink, score: b.score, num_comments: b.num_comments, created_utc: b.created_utc,
      link_flair_text: b.link_flair_text, bild: b.preview?.images?.[0]?.resolutions?.filter((x: any) => x.width <= 960).at(-1)?.url ?? null, video: !!b.is_video, text: (b.selftext ?? '').slice(0, 260) }));
  } catch { return null; }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function CommunitySeite() {
  const [thema, setThema] = useState<typeof THEMEN[number]['k']>('comp');
  const t = THEMEN.find((x) => x.k === thema)!;
  const [beitraege, setBeitraege] = useState<Beitrag[] | null | undefined>(undefined);
  useEffect(() => { let weg = false; setBeitraege(undefined); redditHolen(t.sub).then((l) => { if (!weg) setBeitraege(l); }); return () => { weg = true; }; }, [t.sub]);
  const mitBild = (beitraege ?? []).filter((b) => b.bild).slice(0, 8);
  const rest = (beitraege ?? []).filter((b) => !mitBild.includes(b));
  return (
    <div className="space-y-8">
      <SeitenKopf klein ueber="Live · Social" titel="Where Fortnite talks" text="The official accounts and CompHub on X, and the big subreddits – in one place."
        rechts={KANAELE.map((k) => <a key={k.t} href={k.u} target="_blank" rel="noreferrer" className="knopf"><span className="font-bold">{k.t}</span><span className="hidden text-white/45 sm:inline">{k.s}</span><span aria-hidden>↗</span></a>)} />

      <Abschnitt titel="On X" ueber="Latest posts">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{X_KONTEN.map((k, i) => <XZeitleiste key={k.name} konto={k} verz={i * 0.06} />)}</div>
      </Abschnitt>

      <Abschnitt titel="On Reddit" ueber={`r/${t.sub} · hot right now`} rechts={<a href={`https://www.reddit.com/r/${t.sub}/`} target="_blank" rel="noreferrer" className="knopf-leer">Open on Reddit <span aria-hidden>↗</span></a>}>
        <div className="mb-4 flex flex-wrap gap-1.5">{THEMEN.map((x) => <button key={x.k} type="button" onClick={() => setThema(x.k)} className={`chip ${thema === x.k ? 'chip-an' : ''}`}>{x.titel}</button>)}</div>
        {beitraege === undefined ? <Laedt text={`Loading r/${t.sub}`} /> : beitraege === null ? (
          <Leer text={`Reddit didn't answer for r/${t.sub} right now.`}><a href={`https://www.reddit.com/r/${t.sub}/`} target="_blank" rel="noreferrer" className="knopf-prim">Open r/{t.sub} ↗</a></Leer>
        ) : (
          <div className="space-y-4">
            {mitBild.length > 0 && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {mitBild.map((b, i) => (
                  <motion.a key={b.id} href={`https://www.reddit.com${b.permalink}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 4) * 0.05, duration: 0.45 }} className="fl-fest fl-klick group flex flex-col overflow-hidden">
                    <div className="relative aspect-video shrink-0 overflow-hidden"><Bild src={b.bild} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.06]" /><div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
                      <span className="zahl absolute left-3 top-3 rounded-lg bg-black/75 px-2 py-1 text-xs font-bold text-orange-300 backdrop-blur">▲ {kurzZahl(b.score)}</span></div>
                    <div className="flex flex-1 flex-col px-4 pb-4 pt-1"><p className="line-clamp-2 text-sm font-bold leading-snug text-white">{b.title}</p><p className="mt-auto pt-2 text-[11px] text-white/40">u/{b.author} · {vor(b.created_utc)} · {b.num_comments} comments</p></div>
                  </motion.a>
                ))}
              </div>
            )}
            <Flaeche fest className="overflow-hidden">
              <ul className="grid lg:grid-cols-2">
                {rest.map((b) => (
                  <li key={b.id} className="border-t border-white/[0.05] lg:[&:nth-child(-n+2)]:border-t-0 lg:odd:border-r lg:odd:border-white/[0.05]">
                    <a href={`https://www.reddit.com${b.permalink}`} target="_blank" rel="noreferrer" className="group flex items-center gap-4 px-5 py-3 transition hover:bg-white/[0.035]">
                      <span className="zahl w-12 shrink-0 text-center text-sm font-bold text-orange-300">{kurzZahl(b.score)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white group-hover:text-akz">{b.title}</span><span className="block truncate text-[11px] text-white/40">u/{b.author} · {vor(b.created_utc)} · {b.num_comments} comments{b.link_flair_text ? ` · ${b.link_flair_text}` : ''}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
              {!rest.length && !mitBild.length && <p className="px-5 py-8 text-center text-sm text-white/45">No posts right now.</p>}
            </Flaeche>
          </div>
        )}
      </Abschnitt>
      <p className="text-xs text-white/35">Posts open on X and Reddit. Nothing is posted or tracked from here.</p>
    </div>
  );
}
