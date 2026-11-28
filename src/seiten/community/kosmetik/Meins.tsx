import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LinkKopieren } from '../Bausteine';
import { Flaeche, Laedt, Leer, Marke, SeitenKopf } from '../../../ds/Bausteine';
import { useInselInfos, useRangliste } from '../epic/fn';
import { InselBild, inselPfad } from '../epic/Teile';
import { REITER, seltenVon, useAblage, useReaktionen, useShop, useTeile, type Teil } from './daten';
import { AblageHinweis, Kachel, preis, PUNKTE, Raster, REAKTIONEN, Reaktionen, ZahlenLeiste } from './Raster';

/*
 * Persoenliche Seiten (Spezifikation Punkte 8, 9, 21, 22):
 *   My Wishlist / My Locker   geordnete Liste (Ziehen zum Umordnen), Gesamtwert, "heute im Shop", Fortschritt je Typ (Spind), Raster mit Filtern,
 *                             Teilen per Link (?ids=...) - die Liste steckt im Link, weil /api/user-storage nur fuer den Besitzer lesbar ist.
 *   My Collections            eigene Sammlungen von Creative-Inseln (Code + Name), Standard "Favorites"
 *   Rankings                  Reaktionen auf Kosmetik, Saisons und den heutigen Shop - eigene Wertung sofort, Gesamtwertung aller Nutzer braucht
 *                             einen Zaehler auf dem Server (ehrliche Karte)
 * Wert: Epic-Standardpreise je Typ und Seltenheit (Schaetzung, als solche gekennzeichnet); ist das Teil heute im Shop, gilt der echte Preis.
 * Umrechnung grob mit 1.000 V-Bucks = 8,99 USD (kleinstes Paket).
 */

const STANDARDPREIS: Record<string, Record<string, number>> = {
  outfit: { uncommon: 800, rare: 1200, epic: 1500, legendary: 2000 }, pickaxe: { uncommon: 500, rare: 800, epic: 1200, legendary: 1500 },
  glider: { uncommon: 500, rare: 800, epic: 1200, legendary: 1500 }, emote: { uncommon: 200, rare: 500, epic: 800, legendary: 800 },
  backpack: { uncommon: 200, rare: 300, epic: 400, legendary: 500 }, wrap: { uncommon: 300, rare: 500, epic: 700 }, shoe: { rare: 500, epic: 800 },
  contrail: { rare: 300, epic: 500 }, music: { rare: 200, epic: 300 }, loadingscreen: {}, spray: {}, emoji: {}, banner: {},
};
const SERIEN_PREIS: Record<string, number> = { outfit: 1500, pickaxe: 800, glider: 1200, emote: 500, backpack: 400 };
function wertVon(t: Teil, heute: Map<string, number>): { v: number; echt: boolean } | null {
  const h = heute.get(t.id.toLowerCase()); if (h !== undefined) return { v: h, echt: true };
  if (t.art === 'track') return { v: 500, echt: false };
  const tab = STANDARDPREIS[t.typ]; if (!tab) return null;
  const v = tab[t.selten] ?? (t.serie ? SERIEN_PREIS[t.typ] : undefined);
  return v ? { v, echt: false } : null;
}
const usd = (vb: number) => (vb * 0.00899).toLocaleString('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* ---------------------------------------------- Wishlist / Locker */
export function MeineListe({ art }: { art: 'wunsch' | 'spind' }) {
  const eigene = useAblage<string[]>(art === 'wunsch' ? 'wunschliste' : 'spind', []);
  const [params] = useSearchParams();
  const geteilt = params.get('ids');
  const ids = useMemo(() => (geteilt ? geteilt.split(',').filter(Boolean) : eigene.wert), [geteilt, eigene.wert]);
  const { teile, laedt } = useTeile(['br', 'track']);
  const shop = useShop();
  const heute = useMemo(() => { const m = new Map<string, number>(); for (const a of shop.angebote) if (a.teile.length === 1) m.set(a.teile[0].id.toLowerCase(), a.preis); return m; }, [shop.angebote]);
  const imShop = useMemo(() => new Set(shop.angebote.flatMap((a) => a.teile.map((t) => t.id.toLowerCase()))), [shop.angebote]);
  const karte = useMemo(() => new Map(teile.map((t) => [t.id.toLowerCase(), t])), [teile]);
  const liste = useMemo(() => ids.map((id) => karte.get(id.toLowerCase())).filter(Boolean) as Teil[], [ids, karte]);
  const [ansicht, setAnsicht] = useState<'ordnung' | 'raster'>('ordnung');
  const [ziehe, setZiehe] = useState<number | null>(null);
  const summe = liste.reduce((s, t) => s + (wertVon(t, heute)?.v ?? 0), 0);
  const geschaetzt = liste.some((t) => wertVon(t, heute) && !wertVon(t, heute)!.echt);
  const heuteDa = liste.filter((t) => imShop.has(t.id.toLowerCase()));
  // Fuer die leere Liste: je Angebot das erste BR-Teil von heute, Outfits zuerst
  const heuteTeile = useMemo(() => [...new Map(shop.angebote.flatMap((a) => a.teile.filter((t) => t.art === 'br').slice(0, 1)).map((t) => [t.id, t] as const)).values()].sort((a, b) => Number(b.typ === 'outfit') - Number(a.typ === 'outfit')), [shop.angebote]);
  const titel = art === 'wunsch' ? 'My wishlist' : 'My locker';
  const teilLink = `${window.location.origin}${window.location.pathname}?ids=${eigene.wert.join(',')}`;
  function verschieben(von: number, nach: number) {
    eigene.setzen((l) => { const n = [...l]; const [x] = n.splice(von, 1); n.splice(nach, 0, x); return n; });
  }
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber={geteilt ? 'Community · Shared list' : 'Community · Mine'} titel={geteilt ? `A shared ${art === 'wunsch' ? 'wishlist' : 'locker'}` : titel}
        text={geteilt ? 'Someone shared this list with you.' : art === 'wunsch' ? "Everything you want – and a heads-up when it's in today's shop." : 'Mark what you own and see your collection grow.'}
        rechts={<div className="flex flex-wrap items-center gap-2">{!geteilt && <AblageHinweis ort={eigene.ort} />}{!geteilt && eigene.wert.length > 0 && <LinkKopieren text="Share list" url={teilLink} />}</div>} />
      <ZahlenLeiste werte={[
        ['Items', liste.length.toLocaleString('en')], [geschaetzt ? 'Value (estimated)' : 'Value', preis(summe)], ['In US dollars', `≈ ${usd(summe)}`],
        [art === 'wunsch' ? 'In the shop today' : 'Outfits owned', art === 'wunsch' ? String(heuteDa.length) : String(liste.filter((t) => t.typ === 'outfit').length)],
      ]} />
      {art === 'wunsch' && heuteDa.length > 0 && !geteilt && (
        <Flaeche fest className="border-rose-300/25 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-rose-300">In the shop right now</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {heuteDa.map((t) => <Link key={t.id} to="/community/shop" className="flex items-center gap-2 rounded-xl bg-white/[0.05] py-1.5 pl-1.5 pr-3 hover:bg-white/10"><img src={t.bild} alt="" className="h-10 w-10 rounded-lg object-contain" style={{ background: seltenVon(t.selten).b }} /><span className="text-sm font-bold text-white">{t.name}</span>{heute.get(t.id.toLowerCase()) !== undefined && <span className="text-xs text-white/60">{preis(heute.get(t.id.toLowerCase())!)}</span>}</Link>)}
          </div>
        </Flaeche>
      )}
      {art === 'spind' && liste.length > 0 && <Fortschritt eigene={liste} alle={teile} />}
      {laedt ? <Laedt /> : !liste.length ? (
        <Flaeche fest className="p-6 text-center lg:p-8">
          <p className="titel text-3xl">{geteilt ? 'This list is empty.' : `Your ${art === 'wunsch' ? 'wishlist' : 'locker'} is empty`}</p>
          {!geteilt && <p className="mt-1 text-sm text-white/50">Open <Link to="/community/cosmetics" className="text-akz hover:text-white">Cosmetics</Link> or the <Link to="/community/shop" className="text-akz hover:text-white">Item Shop</Link> and tap {art === 'wunsch' ? 'the heart' : 'the tick'} on any item – or start right here with today's shop.</p>}
          {/* Leere Liste: gleich mit dem heutigen Shop anfangen (Herz/Haken sitzen auf jeder Kachel) */}
          {!geteilt && heuteTeile.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 text-left sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {heuteTeile.slice(0, 16).map((t, i) => <Kachel key={t.id} t={t} index={i} />)}
            </div>
          )}
        </Flaeche>
      ) : (
        <>
          <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
            {([['ordnung', geteilt ? 'In order' : 'My order (drag to reorder)'], ['raster', 'Browse with filters']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setAnsicht(k)} className={`rounded-lg px-3.5 py-1.5 ${ansicht === k ? 'bg-akz text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{t}</button>)}
          </div>
          {ansicht === 'raster' ? <Raster teile={liste} ohneReiter /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
              {liste.map((t, i) => (
                <div key={t.id} draggable={!geteilt} onDragStart={() => setZiehe(i)} onDragOver={(e) => { e.preventDefault(); if (ziehe !== null && ziehe !== i) { verschieben(ziehe, i); setZiehe(i); } }} onDragEnd={() => setZiehe(null)}
                  className={`relative ${ziehe === i ? 'opacity-50' : ''} ${geteilt ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-black/60 px-1.5 text-[10px] font-black tabular-nums text-white">{i + 1}</span>
                  <Kachel t={t} index={i} unten={(() => { const w = wertVon(t, heute); return w ? <p className="mt-1 text-[11px] font-semibold text-white/60">{w.echt ? 'Today ' : '≈ '}{preis(w.v)}</p> : null; })()} />
                  {!geteilt && (
                    <div className="mt-1 flex justify-center gap-1">
                      <button type="button" disabled={!i} onClick={() => verschieben(i, i - 1)} className="rounded-md px-2 text-xs text-white/40 hover:text-white disabled:opacity-20">←</button>
                      <button type="button" disabled={i === liste.length - 1} onClick={() => verschieben(i, i + 1)} className="rounded-md px-2 text-xs text-white/40 hover:text-white disabled:opacity-20">→</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-white/30">Values use Epic's usual shop prices per type and rarity – real prices vary with bundles and sales. Items in today's shop use today's price.{!geteilt && ' Sharing creates a link that contains your list; nobody can see it without that link.'}</p>
    </div>
  );
}
function Fortschritt({ eigene, alle }: { eigene: Teil[]; alle: Teil[] }) {
  const reihen = REITER.filter((r) => r.art === 'br' || r.art === 'track').map((r) => {
    const gesamt = alle.filter((t) => t.art === r.art && (!r.typen || r.typen.includes(t.typ))).length;
    const hab = eigene.filter((t) => t.art === r.art && (!r.typen || r.typen.includes(t.typ))).length;
    return { ...r, gesamt, hab };
  }).filter((r) => r.hab > 0);
  return (
    <Flaeche fest className="p-5">
      <h3 className="font-bold text-white">Collection progress</h3>
      <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {reihen.map((r, i) => (
          <div key={r.k}>
            <div className="flex justify-between text-xs"><span className="font-semibold text-white/75">{r.titel}</span><span className="tabular-nums text-white/45">{r.hab} / {r.gesamt.toLocaleString('en')}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, (r.hab / Math.max(1, r.gesamt)) * 100)}%` }} transition={{ delay: i * 0.04, duration: 0.7 }} className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-akz" /></div>
          </div>
        ))}
      </div>
    </Flaeche>
  );
}

/* ---------------------------------------------- Collections (Creative-Inseln) */
interface Sammlung { id: string; name: string; inseln: Array<{ code: string; name?: string }> }
const CODE = /^\d{4}-\d{4}-\d{4}$/;
export function Sammlungen() {
  const ablage = useAblage<Sammlung[]>('sammlungen', [{ id: 'favoriten', name: 'Favorites', inseln: [] }]);
  const [offen, setOffen] = useState('favoriten');
  const [neuName, setNeuName] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [kopiert, setKopiert] = useState<string | null>(null);
  const s = ablage.wert.find((x) => x.id === offen) ?? ablage.wert[0];
  // Titel, Thumbnail und Creator je Code von der Seite (/api/fn-inseln), Spieler jetzt aus /api/fn-entdecken
  const info = useInselInfos(s?.inseln.map((i) => i.code) ?? []);
  const r = useRangliste();
  const jetzt = useMemo(() => new Map(r.liste.map((e) => [e.code, e])), [r.liste]);
  const aendern = (f: (x: Sammlung) => Sammlung) => ablage.setzen((l) => l.map((x) => (x.id === s.id ? f(x) : x)));
  const codeOk = CODE.test(code.trim());
  const kopieren = (c: string) => { void navigator.clipboard?.writeText(c); setKopiert(c); setTimeout(() => setKopiert((k) => (k === c ? null : k)), 1500); };
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber="Community · Mine" titel="My collections" text="Your own lists of Creative islands – practice maps, box fights, zone wars, whatever you play." rechts={<AblageHinweis ort={ablage.ort} />} />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Flaeche fest className="p-4 lg:sticky lg:top-32 lg:self-start">
          <ul className="space-y-1">
            {ablage.wert.map((x) => (
              <li key={x.id}><button type="button" onClick={() => setOffen(x.id)} className={`relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${x.id === s?.id ? 'text-white' : 'text-white/70 hover:bg-white/5'}`}>
                {x.id === s?.id && <motion.span layoutId="sammlung-wahl" className="absolute inset-0 rounded-xl bg-akz/15 ring-1 ring-akz/30" />}
                <span className="relative font-bold">{x.id === 'favoriten' ? '★ ' : ''}{x.name}</span><span className="zahl relative text-xs text-white/40">{x.inseln.length} maps</span></button></li>
            ))}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!neuName.trim()) return; const id = `s${Date.now().toString(36)}`; ablage.setzen((l) => [...l, { id, name: neuName.trim().slice(0, 40), inseln: [] }]); setOffen(id); setNeuName(''); }}>
            <input value={neuName} onChange={(e) => setNeuName(e.target.value)} placeholder="New collection" className="eingabe min-w-0 flex-1" />
            <button type="submit" className="knopf-prim !px-4">+</button>
          </form>
        </Flaeche>
        {s && (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="titel text-5xl">{s.name} <span className="zahl text-2xl text-white/35">{s.inseln.length}</span></h2>
              {s.id !== 'favoriten' && <button type="button" onClick={() => { ablage.setzen((l) => l.filter((x) => x.id !== s.id)); setOffen('favoriten'); }} className="text-xs font-semibold text-white/40 hover:text-rose-300">Delete collection</button>}
            </div>
            <form className="fl-fest flex flex-wrap gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (!codeOk) return; aendern((x) => ({ ...x, inseln: [...x.inseln.filter((i) => i.code !== code.trim()), { code: code.trim(), name: name.trim() || undefined }] })); setCode(''); setName(''); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d-]/g, '').slice(0, 14))} placeholder="Island code, e.g. 1234-5678-9012" className="eingabe w-full font-mono sm:w-72" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name for it (optional)" className="eingabe min-w-[180px] flex-1" />
              <button type="submit" disabled={!codeOk} className="knopf-prim disabled:opacity-30">Add map</button>
            </form>
            {s.inseln.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <AnimatePresence initial={false}>
                  {s.inseln.map((i) => {
                    const x = info(i.code); const e = jetzt.get(i.code);
                    const titel = i.name ?? e?.titel ?? x?.titel ?? i.code;
                    return (
                      <motion.div key={i.code} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="fl-fest fl-klick group overflow-hidden">
                        <Link to={inselPfad(i.code)} className="relative block aspect-video overflow-hidden">
                          <InselBild code={i.code} bild={e?.bild ?? x?.bild} className="absolute inset-0 transition duration-700 group-hover:scale-[1.06]" />
                          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
                          {e && <span className="absolute right-3 top-3"><Marke ton="rot" puls>{e.spieler.toLocaleString('en')} playing</Marke></span>}
                        </Link>
                        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
                          <div className="min-w-0 flex-1"><p className="truncate font-bold text-white group-hover:text-akz">{titel}</p><p className="truncate text-xs text-white/45"><span className="font-mono">{i.code}</span>{(e?.creator || x?.creator) ? ` · @${e?.creator || x?.creator}` : ''}</p></div>
                          <button type="button" onClick={() => kopieren(i.code)} className="knopf !px-2.5 !py-1 !text-xs">{kopiert === i.code ? 'Copied' : 'Copy'}</button>
                          <button type="button" title="Remove" onClick={() => aendern((y) => ({ ...y, inseln: y.inseln.filter((z) => z.code !== i.code) }))} className="px-1 text-white/30 hover:text-rose-300">✕</button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              <div className="space-y-4">
                <Leer text={<>No maps yet. Paste an island code above, add one from any island page in <Link to="/community/discover" className="text-akz">Discover</Link> – or pick from what's popular right now.</>} />
                {/* Leere Sammlung: die meistgespielten Creator-Inseln gleich zum Hinzufuegen */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {r.liste.filter((e) => !e.epic).slice(0, 8).map((e, k) => (
                    <motion.div key={e.code} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }} className="fl-fest group overflow-hidden">
                      <Link to={inselPfad(e.code)} className="relative block aspect-video overflow-hidden"><InselBild code={e.code} bild={e.bild} className="absolute inset-0 transition duration-700 group-hover:scale-[1.06]" /><div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" /><span className="absolute right-3 top-3"><Marke ton="rot" puls>{e.spieler.toLocaleString('en')} playing</Marke></span></Link>
                      <div className="flex items-center gap-2 px-4 pb-4 pt-1">
                        <div className="min-w-0 flex-1"><p className="truncate font-bold text-white">{e.titel}</p><p className="truncate text-xs text-white/45">@{e.creator}</p></div>
                        <button type="button" onClick={() => aendern((x) => ({ ...x, inseln: [...x.inseln.filter((i) => i.code !== e.code), { code: e.code }] }))} className="knopf-prim !px-3 !py-1.5 !text-xs">+ Add</button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------- Rankings */
const LISTEN: Array<{ k: string; titel: string; text: string }> = [
  { k: 'shop', titel: 'Rate today\'s shop', text: 'One item at a time' }, { k: 'cosmetics', titel: 'Best cosmetics', text: 'Everything you reacted to' },
  { k: 'seasons', titel: 'Best seasons', text: 'Every season since Chapter 1' }, { k: 'unreleased', titel: 'Best unreleased', text: 'Still only in the files' },
  { k: 'crew', titel: 'Best Crew skins', text: 'Fortnite Crew outfits' },
];
export function Ranglisten() {
  const { liste = 'shop' } = useParams();
  const nav = useNavigate();
  const r = useReaktionen();
  const { teile, laedt } = useTeile(['br']);
  const shop = useShop();
  const karte = useMemo(() => new Map(teile.map((t) => [t.id, t])), [teile]);
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber="Community · Rankings" titel="Rankings" text="React to cosmetics and seasons – your picks build your own ranking right away." rechts={<AblageHinweis ort={r.ort} />} />
      <div className="flex flex-wrap gap-2">
        {LISTEN.map((l) => (
          <button key={l.k} type="button" onClick={() => nav(`/community/rankings/${l.k}`)} className={`rounded-2xl border px-4 py-2.5 text-left transition ${liste === l.k ? 'border-akz/40 bg-akz/10' : 'fl-fest !rounded-2xl hover:border-akz/30'}`}>
            <p className="text-sm font-bold text-white">{l.titel}</p><p className="text-[11px] text-white/45">{l.text}</p>
          </button>
        ))}
      </div>
      {laedt ? <Laedt /> : liste === 'shop' ? <ShopBewerten angebote={shop.angebote.flatMap((a) => a.teile.filter((t) => t.art === 'br').slice(0, 1)).sort((a, b) => Number(b.typ === 'outfit') - Number(a.typ === 'outfit'))} />
        : liste === 'seasons' ? <Saisons teile={teile} />
        : <EigeneWertung teile={liste === 'unreleased' ? teile.filter((t) => !t.shop.length && Date.now() - Date.parse(t.hinzu) < 120 * 864e5) : liste === 'crew' ? teile.filter((t) => t.serie?.toLowerCase().includes('crew') && t.typ === 'outfit') : [...r.wert ? Object.keys(r.wert) : []].map((id) => karte.get(id)).filter(Boolean) as Teil[]} alleZeigen={liste !== 'cosmetics'} />}
    </div>
  );
}
function EigeneWertung({ teile, alleZeigen, leer }: { teile: Teil[]; alleZeigen: boolean; leer?: string }) {
  const { wert } = useReaktionen();
  const bewertet = teile.filter((t) => wert[t.id]).sort((a, b) => (PUNKTE[wert[b.id]] ?? 0) - (PUNKTE[wert[a.id]] ?? 0) || a.name.localeCompare(b.name));
  const offen = alleZeigen ? teile.filter((t) => !wert[t.id]).sort((a, b) => b.hinzu.localeCompare(a.hinzu)).slice(0, 60) : [];
  return (
    <div className="space-y-5">
      {REAKTIONEN.map((re) => {
        const l = bewertet.filter((t) => wert[t.id] === re.k);
        if (!l.length) return null;
        return (
          <section key={re.k} className="space-y-2">
            <h3 className="text-lg font-extrabold text-white">{re.z} {re.t} <span className="text-sm font-semibold text-white/40">{l.length}</span></h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">{l.map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<div className="mt-1.5"><Reaktionen id={t.id} klein /></div>} />)}</div>
          </section>
        );
      })}
      {!bewertet.length && !alleZeigen && <Flaeche fest className="p-8 text-center text-sm text-white/50">{leer ?? <>You haven't reacted to anything yet – start with <Link to="/community/rankings/shop" className="text-akz">today's shop</Link>.</>}</Flaeche>}
      {offen.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg font-extrabold text-white">Not rated yet</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">{offen.map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<div className="mt-1.5"><Reaktionen id={t.id} klein /></div>} />)}</div>
        </section>
      )}
    </div>
  );
}
function ShopBewerten({ angebote }: { angebote: Teil[] }) {
  const { wert, setzen } = useReaktionen();
  const offen = angebote.filter((t) => !wert[t.id]);
  const [vorne, setVorne] = useState<string | null>(null);
  const t = offen.find((x) => x.id === vorne) ?? offen[0];
  const s = t ? seltenVon(t.selten) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <Flaeche fest className="p-6">
        <p className="text-xs text-white/45">{angebote.length - offen.length} of {angebote.length} rated</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div animate={{ width: `${((angebote.length - offen.length) / Math.max(1, angebote.length)) * 100}%` }} className="h-full rounded-full bg-akz" /></div>
        <AnimatePresence mode="wait">
          {t && s ? (
            <motion.div key={t.id} initial={{ opacity: 0, x: 40, rotate: 2 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: -60, rotate: -4 }} transition={{ duration: 0.25 }} className="mt-5">
              <div className="relative aspect-square overflow-hidden rounded-2xl" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${s.a}66, ${s.b} 68%, #05070d)` }}><img src={t.bildGross} alt={t.name} className="absolute inset-0 h-full w-full object-contain" /></div>
              <h3 className="mt-3 text-2xl font-extrabold text-white">{t.name}</h3>
              <p className="text-sm font-semibold" style={{ color: s.a }}>{t.seltenName} {t.typName}</p>
              <div className="mt-4 flex justify-between">
                {REAKTIONEN.map((re) => <button key={re.k} type="button" title={re.t} onClick={() => setzen((v) => ({ ...v, [t.id]: re.k }))} className="rounded-2xl bg-white/[0.05] px-3 py-2 text-3xl transition hover:scale-110 hover:bg-white/10">{re.z}</button>)}
              </div>
            </motion.div>
          ) : <motion.p key="fertig" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 text-center text-lg font-bold text-white">All of today's shop rated ✓</motion.p>}
        </AnimatePresence>
      </Flaeche>
      <div className="min-w-0 space-y-5">
        <EigeneWertung teile={angebote} alleZeigen={false} leer="Your ratings of today's shop show up here, grouped by reaction." />
        {/* Was als Naechstes kommt - so ist die rechte Seite nie leer, und ein Klick springt direkt zu einem Teil */}
        {offen.length > 1 && (
          <div>
            <p className="ueber mb-3">Up next · {offen.length - 1} to go</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              {offen.filter((x) => x.id !== t?.id).slice(0, 12).map((x, i) => (
                <Kachel key={x.id} t={x} index={i} link={false} beiKlick={() => setVorne(x.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Saisons({ teile }: { teile: Teil[] }) {
  const liste = useMemo(() => {
    const m = new Map<number, { nr: number; kapitel: string; saison: string; n: number; bild?: Teil }>();
    for (const t of teile) {
      if (t.saisonNr === undefined || !t.kapitel) continue;
      const x = m.get(t.saisonNr) ?? { nr: t.saisonNr, kapitel: t.kapitel, saison: t.saison ?? '', n: 0 };
      x.n += 1; if (!x.bild && t.typ === 'outfit' && t.selten === 'legendary') x.bild = t; m.set(t.saisonNr, x);
    }
    for (const x of m.values()) if (!x.bild) x.bild = teile.find((t) => t.saisonNr === x.nr && t.typ === 'outfit');
    return [...m.values()].sort((a, b) => b.nr - a.nr);
  }, [teile]);
  const { wert } = useReaktionen();
  const sort = [...liste].sort((a, b) => (PUNKTE[wert[`saison-${b.nr}`]] ?? -9) - (PUNKTE[wert[`saison-${a.nr}`]] ?? -9) || b.nr - a.nr);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {sort.map((x, i) => (
        <Flaeche fest key={x.nr} className="flex items-center gap-4 p-4" verz={Math.min(i, 20) * 0.02}>
          {x.bild && <img src={x.bild.bild} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-contain" style={{ background: seltenVon(x.bild.selten).b }} />}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-akz">Chapter {x.kapitel}</p>
            <p className="text-lg font-extrabold text-white">Season {x.saison}</p>
            <p className="text-[11px] text-white/40">{x.n.toLocaleString('en')} cosmetics introduced</p>
            <div className="mt-1.5"><Reaktionen id={`saison-${x.nr}`} klein /></div>
          </div>
        </Flaeche>
      ))}
    </div>
  );
}
