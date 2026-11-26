import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { LinkKopieren } from '../Bausteine';
import { Laedt, TEAL, Ueberschrift } from '../Teile';
import { auftritte, datumKurz, FAPI, REITER, seltenVon, tageSeit, teileLaden, useSpind, useTeile, useWunschliste, type Art, type Teil } from './daten';
import { Kachel, Raster, Reaktionen, ZuletztImShop } from './Raster';

/*
 * Cosmetics (Spezifikation Punkt 7): Datenbank aller Kosmetik-Teile von fortnite-api.com - Typ-Reiter (BR-Arten, Jam Tracks, Instrumente,
 * Autos, LEGO-Bausaetze), Suche ohne Neuladen, Filter Seltenheit/Serie, Saison, Set, Herkunft (Shop / nie im Shop), Sortierung.
 * Der Reiter steht in der Adresse (?type=emote), damit ein Link genau diese Ansicht oeffnet.
 * Detailseite /community/cosmetics/<id>: Varianten (Klick zeigt sie gross), Shop-Verlauf (Auftritte, Tage, laengste Pause), Herkunft aus den
 * Spiel-Tags (Battle Pass, Shop ...), Set, eingebaute Emotes, Video, Wunschliste/Spind, Reaktionen.
 */

export function Kosmetik() {
  const [params, setParams] = useSearchParams();
  const reiter = params.get('type') ?? 'outfit';
  const r = REITER.find((x) => x.k === reiter) ?? REITER[0];
  const { teile, laedt, fehler } = useTeile([r.art]);
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Cosmetics" farbe={TEAL}
        text="Every outfit, emote, pickaxe, Jam Track, car and more – search, filter and see when it was last in the shop." rechts={<LinkKopieren />} />
      {fehler ? <Glas className="p-8 text-sm text-white/60">Cosmetics couldn't be loaded ({fehler}).</Glas> : (
        <Raster teile={teile} reiter={r.k} setReiter={(k) => setParams({ type: k }, { replace: true })} zusatz={(t) => <ZuletztImShop t={t} />}
          oben={laedt ? <Laedt farbe={TEAL} text={r.art === 'br' ? 'Loading all cosmetics with shop history (about 2 MB, once per visit) …' : 'Loading …'} /> : null} />
      )}
    </div>
  );
}

/* ---------------------------------------------- Detail */
const ALLE_ARTEN: Art[] = ['br', 'track', 'instrument', 'car', 'lego'];
interface Extra { gameplayTags?: string[]; builtInEmoteIds?: string[]; path?: string; unlockRequirements?: string; customExclusiveCallout?: string }
const QUELLE: Array<[RegExp, string]> = [[/BattlePass\.Paid/i, 'Battle Pass (paid)'], [/BattlePass\.Free/i, 'Battle Pass (free)'], [/BattlePass/i, 'Battle Pass'], [/ItemShop/i, 'Item Shop'],
  [/Starter|Pack/i, 'Starter pack'], [/Crew/i, 'Fortnite Crew'], [/Quest|Challenge/i, 'Quests'], [/Tournament|Cup/i, 'Tournament reward'], [/Twitch|Prime/i, 'Twitch / Prime'],
  [/Promo/i, 'Promotion'], [/Refer/i, 'Refer-a-friend'], [/Event/i, 'Event'], [/Ranked/i, 'Ranked reward']];

export function KosmetikDetail() {
  const { id = '' } = useParams();
  const [teil, setTeil] = useState<Teil | null>(null);
  const [nicht, setNicht] = useState(false);
  const [alle, setAlle] = useState<Teil[]>([]);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [bild, setBild] = useState<string | null>(null);
  const wunsch = useWunschliste(); const spind = useSpind();
  useEffect(() => {
    let weg = false; setTeil(null); setNicht(false); setBild(null); setExtra(null);
    (async () => {
      for (const a of ALLE_ARTEN) {
        const l = await teileLaden(a).catch(() => [] as Teil[]);
        const t = l.find((x) => x.id.toLowerCase() === id.toLowerCase());
        if (t) { if (!weg) { setTeil(t); setAlle(l); } return; }
      }
      if (!weg) setNicht(true);
    })();
    fetch(`${FAPI}/v2/cosmetics/br/${encodeURIComponent(id)}?responseFlags=7`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!weg && j?.data) setExtra(j.data); }).catch(() => {});
    return () => { weg = true; };
  }, [id]);
  const imSet = useMemo(() => (teil?.set ? alle.filter((t) => t.set === teil.set && t.id !== teil.id) : []), [alle, teil]);
  const emotes = useMemo(() => (extra?.builtInEmoteIds ?? []).map((e) => alle.find((t) => t.id.toLowerCase() === e.toLowerCase())).filter(Boolean) as Teil[], [extra, alle]);
  if (nicht) return <Glas className="p-8 text-sm text-white/60">No cosmetic with the ID <code className="text-teal-200">{id}</code>. <Link to="/community/cosmetics" className="text-teal-200 hover:text-white">Back to Cosmetics</Link></Glas>;
  if (!teil) return <Laedt farbe={TEAL} />;
  const s = seltenVon(teil.selten);
  const reiterVon = REITER.find((r) => r.art === teil.art && (!r.typen || r.typen.includes(teil.typ)));
  const l = auftritte(teil.shop);
  const pausen = l.slice(1).map((x, i) => (tageSeit(l[i].bis, Date.parse(x.ab)) ?? 0));
  const quelle = QUELLE.find(([re]) => extra?.gameplayTags?.some((g) => g.startsWith('Cosmetics.Source') && re.test(g)))?.[1] ?? (teil.shop.length ? 'Item Shop' : null);
  const gewuenscht = wunsch.wert.includes(teil.id); const besessen = spind.wert.includes(teil.id);
  // Shop-Tage je Monat fuer die kleine Zeitleiste (letzte 36 Monate)
  const monate = (() => {
    if (!teil.shop.length) return [];
    const m = new Map<string, number>(); for (const d of teil.shop) m.set(d.slice(0, 7), (m.get(d.slice(0, 7)) ?? 0) + 1);
    const jetzt = new Date(); return Array.from({ length: 36 }, (_, i) => { const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() - 35 + i, 1)); const k = d.toISOString().slice(0, 7); return { k, n: m.get(k) ?? 0 }; });
  })();
  const maxM = Math.max(1, ...monate.map((x) => x.n));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-white/45">
        <Link to="/community/cosmetics" className="hover:text-white">Cosmetics</Link><span>/</span>
        {reiterVon && <><Link to={`/community/cosmetics?type=${reiterVon.k}`} className="hover:text-white">{reiterVon.titel}</Link><span>/</span></>}
        <span className="text-white/75">{teil.name}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <Glas className="relative overflow-hidden">
          <div className="relative aspect-square" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${s.a}66, ${s.b} 68%, #05070d)` }}>
            <motion.img key={bild ?? teil.bildGross} src={bild ?? teil.bildGross} alt={teil.name} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className={`absolute inset-0 h-full w-full ${teil.art === 'track' ? 'object-cover' : 'object-contain'}`} />
            <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: s.a }} />
          </div>
        </Glas>
        <div className="space-y-5">
          <Glas className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: s.a }}>{teil.art === 'track' ? 'Jam Track' : `${teil.seltenName} · ${teil.typName}`}</p>
            <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">{teil.name}</h1>
            {teil.text && <p className="mt-2 max-w-2xl whitespace-pre-line text-white/60">{teil.art === 'track' ? `by ${teil.text}` : teil.text}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => wunsch.setzen((v) => (gewuenscht ? v.filter((x) => x !== teil.id) : [...v, teil.id]))}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${gewuenscht ? 'bg-rose-500 text-white' : 'border border-white/10 bg-white/[0.04] text-white/75 hover:text-white'}`}>{gewuenscht ? '♥ On your wishlist' : '♡ Add to wishlist'}</button>
              <button type="button" onClick={() => spind.setzen((v) => (besessen ? v.filter((x) => x !== teil.id) : [...v, teil.id]))}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${besessen ? 'bg-emerald-400 text-[#06080f]' : 'border border-white/10 bg-white/[0.04] text-white/75 hover:text-white'}`}>{besessen ? '✓ In your locker' : '+ I own this'}</button>
              <LinkKopieren />
              <Reaktionen id={teil.id} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {([
                ['Introduced', teil.kapitel ? `Chapter ${teil.kapitel}, Season ${teil.saison}` : null], ['Added to the files', datumKurz(teil.hinzu)], ['Source', quelle],
                ['Set', teil.set ?? null], ['First in shop', teil.shop[0] ? datumKurz(teil.shop[0]) : teil.art === 'br' ? 'Never' : null], ['Last in shop', teil.shop.at(-1) ? datumKurz(teil.shop.at(-1)) : null],
                ['Shop days', teil.shop.length ? String(teil.shop.length) : null], ['Appearances', l.length ? String(l.length) : null], ['Longest break', pausen.length ? `${Math.max(...pausen)} days` : null],
                ['Release year', teil.jahr ? String(teil.jahr) : null], ['BPM', teil.bpm ? String(teil.bpm) : null], ['Length', teil.dauer ? `${Math.floor(teil.dauer / 60)}:${String(teil.dauer % 60).padStart(2, '0')}` : null],
                ['ID', teil.id],
              ] as Array<[string, string | null]>).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{k}</dt><dd className="truncate text-sm font-bold text-white" title={v ?? ''}>{v}</dd></div>
              ))}
            </dl>
            {extra?.customExclusiveCallout && <p className="mt-3 text-xs text-amber-200/80">{extra.customExclusiveCallout}</p>}
            {extra?.unlockRequirements && <p className="mt-2 text-xs text-white/50">{extra.unlockRequirements}</p>}
            {teil.video && <a href={`https://www.youtube.com/watch?v=${teil.video}`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-teal-200 hover:text-white">Watch Epic's showcase video ↗</a>}
          </Glas>
          {monate.length > 0 && (
            <Glas className="p-6" verzoegerung={0.06}>
              <div className="flex items-baseline justify-between"><h3 className="font-bold text-white">Shop history</h3><span className="text-xs text-white/40">days per month · last 3 years</span></div>
              <div className="mt-4 flex h-24 items-end gap-[3px]">
                {monate.map((x, i) => (
                  <div key={x.k} className="group relative flex-1">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(x.n / maxM) * 100}%` }} transition={{ delay: i * 0.01, duration: 0.5 }} className="min-h-[2px] rounded-t bg-teal-300/80" style={{ opacity: x.n ? 1 : 0.15 }} />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{x.k}: {x.n}d</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {[...l].reverse().slice(0, 30).map((x) => <span key={x.ab} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] tabular-nums text-white/65">{datumKurz(x.ab)}{x.tage > 1 ? ` · ${x.tage} days` : ''}</span>)}
                {l.length > 30 && <span className="px-2 py-1 text-[11px] text-white/35">+{l.length - 30} earlier</span>}
              </div>
            </Glas>
          )}
        </div>
      </div>
      {teil.varianten?.length ? (
        <Glas className="p-6" verzoegerung={0.1}>
          <h3 className="font-bold text-white">Styles <span className="text-sm font-semibold text-white/40">{teil.varianten.reduce((n, v) => n + v.options.length, 0)}</span></h3>
          <div className="mt-3 space-y-4">
            {teil.varianten.map((v) => (
              <div key={v.channel}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{v.type ?? v.channel}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12">
                  {v.options.map((o) => (
                    <button key={o.tag} type="button" onClick={() => setBild(o.image)} title={o.name}
                      className={`overflow-hidden rounded-xl border text-left transition ${bild === o.image ? 'border-teal-300/60' : 'border-white/10 hover:border-white/25'}`}>
                      <div className="aspect-square" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${s.a}44, ${s.b} 75%)` }}>{o.image && <img src={o.image} alt="" loading="lazy" className="h-full w-full object-contain" />}</div>
                      <p className="truncate px-2 py-1 text-[11px] font-semibold text-white/75">{o.name || o.tag}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Glas>
      ) : null}
      {emotes.length > 0 && <Gruppe titel="Built-in emotes" liste={emotes} />}
      {imSet.length > 0 && <Gruppe titel={<>More from the <span style={{ color: s.a }}>{teil.set}</span> set</>} liste={imSet} />}
    </div>
  );
}
function Gruppe({ titel, liste }: { titel: React.ReactNode; liste: Teil[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-extrabold tracking-tight text-white">{titel}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">{liste.slice(0, 30).map((t, i) => <Kachel key={t.id} t={t} index={i} />)}</div>
    </section>
  );
}
