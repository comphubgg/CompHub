import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { DatenFehlen, LinkKopieren, useHubDatei } from '../Bausteine';
import { Laedt, TEAL, Ueberschrift } from '../Teile';
import { datumKurz, holen, seltenVon, useAblage, useTeile, type Teil } from './daten';
import { AblageHinweis, Auswahl, Bereich, Kachel } from './Raster';

/*
 * Die uebrigen Menuepunkte der Spezifikation:
 *   Discover / Creators: jetzt in epic/Live.tsx (Epics Fortnite Data API)
 *   Community (27)    Linksammlung (Discord, X, TikTok, Reddit) + Reddit-Beitraege je Thema direkt aus dem Browser (reddit.com/.json, wenn erreichbar)
 *                     + Epics Spiel-News (fortnite-api.com/v2/news/br)
 *   Sprites (1)       /hub-daten/sprites.json (Spieldaten-Export) + Owned/Mastered pro Variante
 *   Treasure Hunt (2) /hub-daten/schatzsuche.json (Spieldaten-Export, Format unten) + "Mark as found"; dazu die Kosmetik der laufenden Saison
 *   Lorebook (25)     Geruest aus den echten Kapiteln/Saisons (fortnite-api: introduction); Texte redaktionell in /hub-daten/lorebook.json
 */

const SOCIAL = {
  discord: 'https://discord.gg/8jQ3tf37sQ', x: 'https://x.com/CompHub_gg', tiktok: 'https://www.tiktok.com/@comphub.gg',
};

/* ---------------------------------------------- Community */
const THEMEN: Array<{ k: string; titel: string; sub: string }> = [
  { k: 'comp', titel: 'Competitive', sub: 'FortniteCompetitive' }, { k: 'br', titel: 'Battle Royale', sub: 'FortNiteBR' }, { k: 'leaks', titel: 'Leaks', sub: 'FortniteLeaks' },
  { k: 'creative', titel: 'Creative', sub: 'FortniteCreative' }, { k: 'fashion', titel: 'Fashion', sub: 'FortniteFashion' },
];
interface Beitrag { id: string; title: string; author: string; permalink: string; score: number; num_comments: number; created_utc: number; link_flair_text?: string }
export function CommunitySeite() {
  const [thema, setThema] = useState(THEMEN[0]);
  const [beitraege, setBeitraege] = useState<Beitrag[] | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [news, setNews] = useState<Array<{ id: string; title: string; body: string; image?: string; tileImage?: string }>>([]);
  useEffect(() => {
    let weg = false; setBeitraege(null); setFehlt(false);
    fetch(`https://www.reddit.com/r/${thema.sub}/hot.json?limit=25&raw_json=1`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (!weg) setBeitraege((j?.data?.children ?? []).map((c: { data: Beitrag }) => c.data).filter((b: Beitrag & { stickied?: boolean }) => !b.stickied)); })
      .catch(() => { if (!weg) setFehlt(true); });
    return () => { weg = true; };
  }, [thema]);
  useEffect(() => { holen<{ motds?: Array<{ id: string; title: string; body: string; image?: string; tileImage?: string }> }>('/v2/news/br').then((d) => setNews(d?.motds ?? [])).catch(() => {}); }, []);
  const karten = [
    { t: 'Discord', s: 'Our server – cups, results, help', u: SOCIAL.discord, f: '#818cf8' }, { t: 'X', s: '@CompHub_gg – live results and news', u: SOCIAL.x, f: '#e5e7eb' },
    { t: 'TikTok', s: '@comphub.gg – clips and highlights', u: SOCIAL.tiktok, f: '#f472b6' }, { t: 'Reddit', s: `r/${thema.sub}`, u: `https://www.reddit.com/r/${thema.sub}/`, f: '#fb923c' },
  ];
  const vor = (s: number) => { const h = Math.floor((Date.now() / 1000 - s) / 3600); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community" titel="Community" farbe={TEAL} text="Where the Fortnite community talks – our own channels, the big subreddits and Epic's latest news." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {karten.map((k, i) => (
          <motion.a key={k.t} href={k.u} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl hover:border-white/25">
            <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: `${k.f}33` }} />
            <p className="text-2xl font-extrabold text-white">{k.t} <span className="text-base text-white/40">↗</span></p>
            <p className="mt-1 text-sm text-white/55">{k.s}</p>
          </motion.a>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {THEMEN.map((t) => (
              <button key={t.k} type="button" onClick={() => setThema(t)} className="relative rounded-xl px-3.5 py-1.5 text-sm font-bold">
                {thema.k === t.k && <motion.span layoutId="komm-thema" className="absolute inset-0 rounded-xl bg-teal-300" />}
                <span className={`relative ${thema.k === t.k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{t.titel}</span>
              </button>
            ))}
          </div>
          <Glas className="overflow-hidden">
            {fehlt ? (
              <div className="p-8 text-center text-sm text-white/50">Reddit didn't answer from your browser (some networks and privacy blockers stop it). <a href={`https://www.reddit.com/r/${thema.sub}/`} target="_blank" rel="noreferrer" className="font-semibold text-teal-200 hover:text-white">Open r/{thema.sub} ↗</a></div>
            ) : !beitraege ? <div className="px-5"><Laedt farbe={TEAL} /></div> : (
              <ul>
                {beitraege.map((b, i) => (
                  <motion.li key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }} className="border-t border-white/5 first:border-0">
                    <a href={`https://www.reddit.com${b.permalink}`} target="_blank" rel="noreferrer" className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03]">
                      <span className="w-12 shrink-0 text-center text-sm font-black tabular-nums text-orange-300">{b.score >= 1000 ? `${(b.score / 1000).toFixed(1)}k` : b.score}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">{b.title}</span>
                        <span className="block text-[11px] text-white/40">u/{b.author} · {vor(b.created_utc)} · {b.num_comments} comments{b.link_flair_text ? ` · ${b.link_flair_text}` : ''}</span>
                      </span>
                    </a>
                  </motion.li>
                ))}
              </ul>
            )}
          </Glas>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold text-white">From Epic</h2>
          {news.slice(0, 5).map((n, i) => (
            <Glas key={n.id} className="overflow-hidden" verzoegerung={i * 0.05}>
              {(n.tileImage || n.image) && <div className="aspect-video bg-gradient-to-br from-teal-400/15 to-violet-500/10"><img src={n.tileImage ?? n.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" /></div>}
              <div className="p-4"><p className="font-bold text-white">{n.title}</p><p className="mt-1 line-clamp-3 text-sm text-white/55">{n.body}</p></div>
            </Glas>
          ))}
          <Link to="/community/news" className="block text-sm font-semibold text-teal-200 hover:text-white">All news →</Link>
        </div>
      </div>
      <p className="text-[11px] text-white/30">Reddit posts are loaded straight from reddit.com in your browser and open there. Our own posts with comments and profiles need a moderated community backend – not built yet.</p>
    </div>
  );
}

/* ---------------------------------------------- Sprites */
interface Sprite { id: string; name: string; varianten?: string[]; bild?: string; text?: string; neu?: boolean }
export function Sprites() {
  const { daten, status } = useHubDatei<{ saison?: string; sprites: Sprite[] }>('sprites.json');
  const stand = useAblage<Record<string, { o?: boolean; m?: boolean }>>('sprites', {});
  const [filter, setFilter] = useState('alle'); const [variante, setVariante] = useState('alle');
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  const zeilen = (daten?.sprites ?? []).flatMap((s) => (s.varianten?.length ? s.varianten : ['Standard']).map((v) => ({ s, v, k: `${s.id}:${v}` })));
  const sicht = zeilen.filter((z) => (variante === 'alle' || z.v === variante) && (filter === 'alle' || (filter === 'hab' ? stand.wert[z.k]?.o : filter === 'fehlt' ? !stand.wert[z.k]?.o : z.s.neu)));
  const hab = zeilen.filter((z) => stand.wert[z.k]?.o).length; const meister = zeilen.filter((z) => stand.wert[z.k]?.m).length;
  const schalten = (k: string, f: 'o' | 'm') => stand.setzen((v) => ({ ...v, [k]: { ...v[k], [f]: !v[k]?.[f] } }));
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Season" titel="Sprites" farbe={TEAL} text="Track which sprites you own and which you've mastered – every variant." rechts={<div className="flex gap-2"><AblageHinweis ort={stand.ort} /><LinkKopieren /></div>} />
      {status === 'fehlt' ? (
        <DatenFehlen titel="The sprite list comes from the game files" text={<>Names, variants (Standard, Fortune, Cursed, Gold …) and where each sprite spawns are part of this season's game data. Once our export writes <code className="text-teal-200">/hub-daten/sprites.json</code>, the tracker with Owned / Mastered switches and progress appears here – saved to your account.
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] text-white/60">{JSON.stringify({ saison: 'Chapter 7 Season 5', sprites: [{ id: 'sprite_x', name: '…', varianten: ['Standard', 'Fortune', 'Cursed', 'Gold'], bild: '/hub-daten/sprites/x.png', neu: true }] }, null, 2)}</pre></>}
          braucht={['Game data export: sprite list + variants', 'Sprite images (own renders)']} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[['Owned', `${hab} / ${zeilen.length}`], ['Mastered', `${meister} / ${zeilen.length}`], ['Season', daten?.saison ?? '—']].map(([k, v], i) => <Glas key={k} className="p-5" verzoegerung={i * 0.05}><p className="text-3xl font-black tabular-nums text-teal-200">{v}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p></Glas>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Auswahl titel="Status" wert={filter} setzen={setFilter} optionen={[['alle', 'All'], ['hab', 'Owned'], ['fehlt', 'Missing'], ['neu', 'New']]} />
            <Auswahl titel="Variant" wert={variante} setzen={setVariante} optionen={[['alle', 'All'], ...[...new Set(zeilen.map((z) => z.v))].map((v): [string, string] => [v, v])]} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {sicht.map(({ s, v, k }, i) => (
              <Glas key={k} className="overflow-hidden" verzoegerung={Math.min(i, 20) * 0.02}>
                <div className="aspect-square bg-gradient-to-b from-teal-400/20 to-transparent">{s.bild && <img src={s.bild} alt="" className="h-full w-full object-contain p-3" />}</div>
                <div className="p-3">
                  <p className="font-bold text-white">{s.name}</p><p className="text-[11px] text-teal-200/80">{v}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(['o', 'm'] as const).map((f) => <button key={f} type="button" onClick={() => schalten(k, f)} className={`rounded-lg py-1 text-[11px] font-bold ${stand.wert[k]?.[f] ? 'bg-teal-300 text-[#06080f]' : 'bg-white/[0.06] text-white/55 hover:text-white'}`}>{f === 'o' ? 'Owned' : 'Mastered'}</button>)}
                  </div>
                </div>
              </Glas>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------- Treasure Hunt */
interface Schatz { saison?: string; stand?: string; mechanik?: Array<{ titel: string; text: string }>; belohnungen: Array<{ id: string; name: string; typ?: string; chance?: number; einsIn?: number; bild?: string; cosmeticId?: string; quelle?: string }> }
export function Schatzsuche() {
  const { daten, status } = useHubDatei<Schatz>('schatzsuche.json');
  const gefunden = useAblage<string[]>('schatz-gefunden', []);
  const { teile } = useTeile(['br']);
  // Kosmetik der laufenden Saison (hoechste Saison-Nummer in den Daten) - "Treasure Hunters" ist Saison 43
  const saisonNr = useMemo(() => Math.max(0, ...teile.map((t) => t.saisonNr ?? 0)), [teile]);
  const dieseSaison = useMemo(() => teile.filter((t) => t.saisonNr === saisonNr && ['outfit', 'backpack', 'pickaxe', 'glider', 'emote'].includes(t.typ)).sort((a, b) => b.hinzu.localeCompare(a.hinzu)), [teile, saisonNr]);
  const karte = useMemo(() => new Map(teile.map((t) => [t.id.toLowerCase(), t])), [teile]);
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  const einsIn = (b: Schatz['belohnungen'][number]) => b.einsIn ?? (b.chance ? Math.round(1 / b.chance) : null);
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Season" titel="Treasure Hunt" farbe={TEAL} text={<>{daten?.saison ?? 'Treasure Hunters'} – what you can dig up, how likely each reward is, and what you've already found.</>} rechts={<AblageHinweis ort={gefunden.ort} />} />
      {daten?.mechanik?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {daten.mechanik.map((m, i) => <Glas key={m.titel} className="p-5" verzoegerung={i * 0.05}><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">Step {i + 1}</p><h3 className="mt-1 text-lg font-extrabold text-white">{m.titel}</h3><p className="mt-1 text-sm text-white/55">{m.text}</p></Glas>)}
        </div>
      ) : null}
      {status === 'fehlt' ? (
        <DatenFehlen titel="Rewards and drop chances come from the game files" text={<>The loot tables of the treasure chests (which reward, how likely, from which source) are in this season's game data. When our export writes <code className="text-teal-200">/hub-daten/schatzsuche.json</code>, the reward cards with "1 in N" chances and "Mark as found" appear here – and the dig spots go onto the <Link to="/community/map" className="text-teal-200">map</Link>.
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] text-white/60">{JSON.stringify({ saison: 'Treasure Hunters', stand: '2026-11-26', mechanik: [{ titel: 'Find a map', text: '…' }], belohnungen: [{ id: 'r1', name: '…', typ: 'Back Bling', chance: 0.02, cosmeticId: 'Backpack_…', quelle: 'Buried chest' }] }, null, 2)}</pre>
          Dig spots for the map use the map's object format: <code className="text-teal-200">{'{ typ: "buried_chest", x, y, z, chance }'}</code> in objekte.json.</>}
          braucht={['Loot tables of the treasure chests', 'Dig-spot positions', 'Reward cosmetic IDs']} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {daten!.belohnungen.map((b, i) => {
            const t = b.cosmeticId ? karte.get(b.cosmeticId.toLowerCase()) : undefined; const da = gefunden.wert.includes(b.id); const n = einsIn(b);
            return (
              <Glas key={b.id} className={`overflow-hidden ${da ? 'ring-1 ring-emerald-300/40' : ''}`} verzoegerung={Math.min(i, 20) * 0.02}>
                <div className="relative aspect-square" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${seltenVon(t?.selten ?? 'legendary').a}55, #05070d)` }}>
                  {(b.bild ?? t?.bild) && <img src={b.bild ?? t!.bild} alt="" className="h-full w-full object-contain" />}
                  {n && <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-amber-200">1 in {n.toLocaleString('en')}</span>}
                </div>
                <div className="p-3">
                  <p className="truncate font-bold text-white">{b.name}</p><p className="text-[11px] text-white/45">{b.typ ?? t?.typName}{b.quelle ? ` · ${b.quelle}` : ''}</p>
                  <button type="button" onClick={() => gefunden.setzen((v) => (da ? v.filter((x) => x !== b.id) : [...v, b.id]))} className={`mt-2 w-full rounded-lg py-1 text-[11px] font-bold ${da ? 'bg-emerald-400 text-[#06080f]' : 'bg-white/[0.06] text-white/60 hover:text-white'}`}>{da ? '✓ Found' : 'Mark as found'}</button>
                </div>
              </Glas>
            );
          })}
        </div>
      )}
      {dieseSaison.length > 0 && (
        <Bereich titel={<>New this season <span className="text-sm font-semibold text-white/40">{dieseSaison.length}</span></>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">{dieseSaison.slice(0, 40).map((t: Teil, i) => <Kachel key={t.id} t={t} index={i} />)}</div>
        </Bereich>
      )}
    </div>
  );
}

/* ---------------------------------------------- Lorebook */
interface Lore { aktuell?: { titel: string; text: string }; kapitel?: Record<string, { titel?: string; zeitraum?: string; text?: string; saisons?: Record<string, string> }> }
export function Lorebook() {
  const { daten } = useHubDatei<Lore>('lorebook.json');
  const { teile, laedt } = useTeile(['br']);
  const kapitel = useMemo(() => {
    const m = new Map<string, Map<string, { n: number; bild?: Teil }>>();
    for (const t of teile) {
      if (!t.kapitel || !t.saison) continue;
      const k = m.get(t.kapitel) ?? new Map(); const s = k.get(t.saison) ?? { n: 0 };
      s.n += 1; if (t.typ === 'outfit' && (!s.bild || t.selten === 'legendary')) s.bild = t; k.set(t.saison, s); m.set(t.kapitel, k);
    }
    return [...m.entries()].sort((a, b) => Number(b[0]) - Number(a[0]) || b[0].localeCompare(a[0]))
      .map(([k, s]) => ({ k, saisons: [...s.entries()].sort((a, b) => (Number(a[0]) || 99) - (Number(b[0]) || 99) || a[0].localeCompare(b[0])) }));
  }, [teile]);
  const [offen, setOffen] = useState<string | null>(null);
  const zeig = offen ?? kapitel[0]?.k ?? null;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Season" titel="Lorebook" farbe={TEAL} text="Fortnite's story, chapter by chapter." />
      {daten?.aktuell && <Glas className="border-teal-300/25 p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">Current season</p><h2 className="mt-1 text-3xl font-extrabold text-white">{daten.aktuell.titel}</h2><p className="mt-2 max-w-3xl whitespace-pre-line text-white/60">{daten.aktuell.text}</p></Glas>}
      {laedt ? <Laedt farbe={TEAL} /> : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Glas className="h-max p-3">
            {kapitel.map((c) => (
              <button key={c.k} type="button" onClick={() => setOffen(c.k)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${zeig === c.k ? 'bg-teal-300/15 text-white ring-1 ring-teal-300/30' : 'text-white/65 hover:bg-white/5'}`}>
                <span className="font-bold">{daten?.kapitel?.[c.k]?.titel ?? `Chapter ${c.k}`}</span><span className="text-xs text-white/40">{c.saisons.length} seasons</span>
              </button>
            ))}
          </Glas>
          {zeig && (() => {
            const c = kapitel.find((x) => x.k === zeig)!; const ed = daten?.kapitel?.[zeig];
            return (
              <motion.div key={zeig} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <Glas className="p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">Chapter {zeig}{ed?.zeitraum ? ` · ${ed.zeitraum}` : ''}</p>
                  <h2 className="mt-1 text-3xl font-extrabold text-white">{ed?.titel ?? `Chapter ${zeig}`}</h2>
                  <p className="mt-2 max-w-3xl whitespace-pre-line text-white/60">{ed?.text ?? 'The story of this chapter is being written by our editors.'}</p>
                </Glas>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {c.saisons.map(([s, x], i) => (
                    <Glas key={s} className="flex gap-4 p-4" verzoegerung={i * 0.03}>
                      {x.bild && <img src={x.bild.bild} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-contain" style={{ background: seltenVon(x.bild.selten).b }} />}
                      <div className="min-w-0">
                        <p className="text-lg font-extrabold text-white">{/^\d+$/.test(s) ? `Season ${s}` : s}</p>
                        <p className="text-[11px] text-white/40">{x.n.toLocaleString('en')} cosmetics introduced</p>
                        <p className="mt-1 line-clamp-3 text-sm text-white/55">{ed?.saisons?.[s] ?? ''}</p>
                      </div>
                    </Glas>
                  ))}
                </div>
              </motion.div>
            );
          })()}
        </div>
      )}
      {!daten && <p className="text-[11px] text-white/30">Chapters and seasons come from the cosmetics data. Story texts go into <code>/hub-daten/lorebook.json</code> ({'{ aktuell: { titel, text }, kapitel: { "7": { titel, zeitraum, text, saisons: { "1": "…" } } } }'}).</p>}
    </div>
  );
}
