import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LinkKopieren } from '../Bausteine';
import { Flaeche, Laedt, SeitenKopf } from '../../../ds/Bausteine';
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
      <SeitenKopf klein ueber="Community · Cosmetics" titel="Cosmetics"
        text="Every outfit, emote, pickaxe, Jam Track, car and more – search, filter and see when it was last in the shop." rechts={<LinkKopieren />} />
      {fehler ? <Flaeche fest className="p-8 text-sm text-white/60">Cosmetics couldn't be loaded ({fehler}).</Flaeche> : (
        <Raster teile={teile} reiter={r.k} setReiter={(k) => setParams({ type: k }, { replace: true })} zusatz={(t) => <ZuletztImShop t={t} />}
          oben={laedt ? <Laedt text={r.art === 'br' ? 'Loading all cosmetics with shop history (about 2 MB, once per visit)' : 'Loading'} /> : null} />
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
  if (nicht) return <Flaeche fest className="p-8 text-sm text-white/60">No cosmetic with the ID <code className="text-akz">{id}</code>. <Link to="/community/cosmetics" className="text-akz hover:text-white">Back to Cosmetics</Link></Flaeche>;
  if (!teil) return <Laedt />;
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
  const fakten = ([
    ['Introduced', teil.kapitel ? `Chapter ${teil.kapitel}, Season ${teil.saison}` : null], ['Added to the files', datumKurz(teil.hinzu)], ['Source', quelle],
    ['Set', teil.set ?? null], ['First in shop', teil.shop[0] ? datumKurz(teil.shop[0]) : teil.art === 'br' ? 'Never' : null], ['Last in shop', teil.shop.at(-1) ? datumKurz(teil.shop.at(-1)) : null],
    ['Release year', teil.jahr ? String(teil.jahr) : null], ['BPM', teil.bpm ? String(teil.bpm) : null], ['Length', teil.dauer ? `${Math.floor(teil.dauer / 60)}:${String(teil.dauer % 60).padStart(2, '0')}` : null],
    ['ID', teil.id],
  ] as Array<[string, string | null]>).filter(([, v]) => v);
  const gross: Array<[string, string]> = ([
    ['Shop days', teil.shop.length ? String(teil.shop.length) : null], ['Appearances', l.length ? String(l.length) : null],
    ['Longest break', pausen.length ? `${Math.max(...pausen)}d` : null], ['Last seen', teil.shop.length ? `${Math.max(0, tageSeit(teil.shop.at(-1)!) ?? 0)}d ago` : null],
  ] as Array<[string, string | null]>).filter((x): x is [string, string] => !!x[1]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-white/45">
        <Link to="/community/cosmetics" className="hover:text-white">Cosmetics</Link><span>/</span>
        {reiterVon && <><Link to={`/community/cosmetics?type=${reiterVon.k}`} className="hover:text-white">{reiterVon.titel}</Link><span>/</span></>}
        <span className="text-white/75">{teil.name}</span>
      </div>

      {/* Buehne: Bild und Name in EINER Flaeche, Seltenheitsfarbe als Licht */}
      <Flaeche fest className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(70% 120% at 22% 40%, ${s.a}55, transparent 70%)` }} />
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="relative aspect-square lg:aspect-auto lg:min-h-[520px]" style={{ background: `radial-gradient(90% 80% at 50% 30%, ${s.a}77, ${s.b} 70%, #04050a)` }}>
            <motion.img key={bild ?? teil.bildGross} src={bild ?? teil.bildGross} alt={teil.name} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }} className={`absolute inset-0 h-full w-full ${teil.art === 'track' ? 'object-cover' : 'object-contain'}`} />
            <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: s.a }} />
          </div>
          <div className="flex flex-col gap-6 p-6 lg:p-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: s.a }}>{teil.art === 'track' ? 'Jam Track' : `${teil.seltenName} · ${teil.typName}`}</p>
              <h1 className="titel mt-1 text-6xl lg:text-8xl">{teil.name}</h1>
              {teil.text && <p className="mt-2 max-w-2xl whitespace-pre-line text-white/60">{teil.art === 'track' ? `by ${teil.text}` : teil.text}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => wunsch.setzen((v) => (gewuenscht ? v.filter((x) => x !== teil.id) : [...v, teil.id]))}
                className={gewuenscht ? 'knopf !bg-rose-500 !text-white' : 'knopf'}>{gewuenscht ? '♥ On your wishlist' : '♡ Add to wishlist'}</button>
              <button type="button" onClick={() => spind.setzen((v) => (besessen ? v.filter((x) => x !== teil.id) : [...v, teil.id]))}
                className={besessen ? 'knopf !bg-emerald-400 !text-[#06080f]' : 'knopf'}>{besessen ? '✓ In your locker' : '+ I own this'}</button>
              <LinkKopieren />
              <Reaktionen id={teil.id} />
            </div>
            {gross.length > 0 && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {gross.map(([k, v]) => <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{k}</p><p className="titel zahl mt-1 text-5xl">{v}</p></div>)}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {fakten.map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-black/35 px-3 py-2 ring-1 ring-white/[0.05]"><dt className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{k}</dt><dd className="truncate text-sm font-bold text-white" title={v ?? ''}>{v}</dd></div>
              ))}
            </dl>
            {(extra?.customExclusiveCallout || extra?.unlockRequirements || teil.video) && (
              <div className="space-y-1.5 text-xs">
                {extra?.customExclusiveCallout && <p className="text-amber-200/80">{extra.customExclusiveCallout}</p>}
                {extra?.unlockRequirements && <p className="text-white/50">{extra.unlockRequirements}</p>}
                {teil.video && <a href={`https://www.youtube.com/watch?v=${teil.video}`} target="_blank" rel="noreferrer" className="knopf-leer">Watch Epic's showcase video ↗</a>}
              </div>
            )}
          </div>
        </div>
      </Flaeche>

      {monate.length > 0 && (
        <Flaeche fest className="p-6" verz={0.06}>
          <div className="flex items-baseline justify-between gap-3"><h3 className="titel text-3xl">Shop history</h3><span className="text-xs text-white/40">days per month · last 3 years</span></div>
          <div className="mt-4 flex h-28 items-end gap-[3px]">
            {monate.map((x, i) => (
              <div key={x.k} className="group relative h-full flex-1">
                <div className="absolute inset-x-0 bottom-0 flex h-full items-end"><motion.div initial={{ height: 0 }} animate={{ height: `${(x.n / maxM) * 100}%` }} transition={{ delay: i * 0.01, duration: 0.5 }} className="min-h-[2px] w-full rounded-t bg-akz/80" style={{ opacity: x.n ? 1 : 0.15 }} /></div>
                <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{x.k}: {x.n}d</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[...l].reverse().slice(0, 30).map((x) => <span key={x.ab} className="zahl rounded-lg bg-black/35 px-2 py-1 text-[11px] text-white/65 ring-1 ring-white/[0.05]">{datumKurz(x.ab)}{x.tage > 1 ? ` · ${x.tage} days` : ''}</span>)}
            {l.length > 30 && <span className="px-2 py-1 text-[11px] text-white/35">+{l.length - 30} earlier</span>}
          </div>
        </Flaeche>
      )}
      {teil.varianten?.length ? (
        <Flaeche fest className="p-6" verz={0.1}>
          <h3 className="titel text-3xl">Styles <span className="zahl text-base text-white/40">{teil.varianten.reduce((n, v) => n + v.options.length, 0)}</span></h3>
          <div className="mt-3 space-y-4">
            {teil.varianten.map((v) => (
              <div key={v.channel}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{v.type ?? v.channel}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12">
                  {v.options.map((o) => (
                    <button key={o.tag} type="button" onClick={() => setBild(o.image)} title={o.name}
                      className={`overflow-hidden rounded-xl border text-left transition ${bild === o.image ? 'border-akz/60' : 'border-white/10 hover:border-white/25'}`}>
                      <div className="aspect-square" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${s.a}44, ${s.b} 75%)` }}>{o.image && <img src={o.image} alt="" loading="lazy" className="h-full w-full object-contain" />}</div>
                      <p className="truncate px-2 py-1 text-[11px] font-semibold text-white/75">{o.name || o.tag}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Flaeche>
      ) : null}
      {emotes.length > 0 && <Gruppe titel="Built-in emotes" liste={emotes} />}
      {imSet.length > 0 && <Gruppe titel={<>More from the <span style={{ color: s.a }}>{teil.set}</span> set</>} liste={imSet} />}
    </div>
  );
}
function Gruppe({ titel, liste }: { titel: React.ReactNode; liste: Teil[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" /><h2 className="titel text-3xl">{titel}</h2></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{liste.slice(0, 32).map((t, i) => <Kachel key={t.id} t={t} index={i} />)}</div>
    </section>
  );
}
