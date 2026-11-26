import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { LinkKopieren, restText, useJetzt } from '../Bausteine';
import { Laedt, TEAL, Ueberschrift } from '../Teile';
import { auftritte, datumKurz, seitTagen, seltenVon, tageSeit, useNachschlag, useShop, useSpind, useTeile, useWunschliste, zuvor, type Angebot, type Teil } from './daten';
import { Auswahl, Kachel, preis, Reaktionen } from './Raster';

/*
 * Item Shop (Spezifikation Punkt 6). Quelle fortnite-api.com/v2/shop (heute) und /v2/cosmetics/br?responseFlags=4 (Shop-Verlauf je Teil).
 *   Kopf      Datum, Gesamtwert aller Angebote, Countdown bis zum Reset (00:00 UTC)
 *   Reiter    All, New (zum ersten Mal im Shop), My Wishlist, Different than yesterday (heute neu dazugekommen), Leaving (geht heute raus),
 *             Longest wait (am laengsten nicht mehr da gewesen), History (Shop eines frueheren Tages, aus dem Verlauf rekonstruiert - nur BR-Teile)
 *   Kachel    Bild, Preis (durchgestrichen bei Rabatt), Banner, "zuletzt gesehen vor N Tagen" bzw. NEW, Restzeit, Besitz-Marker, Reaktionen
 *   Klick     Fenster mit allen Teilen des Angebots, Auftritten im Shop und Link zur Detailseite
 * "Best Sellers" gibt es nicht: Verkaufszahlen veroeffentlicht Epic nicht - deshalb kein Reiter statt erfundener Zahlen.
 */

type Reiter = 'alle' | 'neu' | 'wunsch' | 'anders' | 'geht' | 'warten' | 'verlauf';
const REITER: Array<[Reiter, string]> = [['alle', 'All'], ['neu', 'New'], ['wunsch', 'My Wishlist'], ['anders', 'Different than yesterday'], ['geht', 'Leaving'], ['warten', 'Longest wait'], ['verlauf', 'History']];
const ARTEN: Array<[string, string]> = [['alle', 'All'], ['outfit', 'Outfits'], ['emote', 'Emotes'], ['pickaxe', 'Pickaxes'], ['backpack', 'Back Blings'], ['glider', 'Gliders'], ['wrap', 'Wraps'], ['shoe', 'Kicks'], ['track', 'Jam Tracks'], ['instrument', 'Instruments'], ['car', 'Cars'], ['bundle', 'Bundles']];

export default function Shop() {
  const { datum, angebote, laedt, fehler } = useShop();
  const { karte, laedt: verlaufLaedt } = useNachschlag(['br']);
  const jetzt = useJetzt();
  const wunsch = useWunschliste(); const spind = useSpind();
  const [reiter, setReiter] = useState<Reiter>('alle');
  const [art, setArt] = useState('alle');
  const [sort, setSort] = useState('shop');
  const [offen, setOffen] = useState<Angebot | null>(null);
  const heute = (datum ?? new Date().toISOString()).slice(0, 10);
  const reset = Date.UTC(new Date(jetzt).getUTCFullYear(), new Date(jetzt).getUTCMonth(), new Date(jetzt).getUTCDate() + 1);

  // Teile mit Shop-Verlauf anreichern (der Shop-Endpunkt liefert keinen Verlauf)
  const reich = useMemo(() => angebote.map((a) => {
    const teile = a.teile.map((t) => { const v = karte.get(t.id.toLowerCase()); return v ? { ...t, shop: v.shop, varianten: v.varianten } : t; });
    const vorher = teile.map((t) => zuvor(t, datum)).filter(Boolean).sort().at(-1) ?? null;
    const neu = karte.size > 0 && teile.every((t) => t.art !== 'br' || !zuvor(t, datum)) && teile.some((t) => t.art === 'br');
    const laeuft = teile[0] && karte.size ? seitTagen(teile[0], datum) : 1;
    return { ...a, teile, vorher, neu, laeuft, wartezeit: vorher ? tageSeit(vorher, Date.parse(heute) - (laeuft - 1) * 864e5) : null };
  }), [angebote, karte, datum, heute]);

  const gefiltert = useMemo(() => {
    let l = reich;
    if (reiter === 'neu') l = l.filter((a) => a.neu);
    if (reiter === 'wunsch') l = l.filter((a) => a.teile.some((t) => wunsch.wert.includes(t.id)));
    if (reiter === 'anders') l = l.filter((a) => (a.ab ?? '').slice(0, 10) === heute);
    if (reiter === 'geht') l = l.filter((a) => (a.bis ?? '').slice(0, 10) === heute);
    if (reiter === 'warten') l = [...l].filter((a) => a.wartezeit !== null).sort((a, b) => (b.wartezeit ?? 0) - (a.wartezeit ?? 0));
    if (art !== 'alle') l = l.filter((a) => (art === 'bundle' ? a.bundle : a.teile[0]?.typ === art || a.teile[0]?.art === art || a.teile[0]?.typ.startsWith(`${art}:`)));
    if (sort === 'teuer') l = [...l].sort((a, b) => b.preis - a.preis);
    if (sort === 'billig') l = [...l].sort((a, b) => a.preis - b.preis);
    if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [reich, reiter, art, sort, wunsch.wert, heute]);
  const abschnitte = useMemo(() => {
    if (reiter === 'warten' || sort !== 'shop') return [{ name: '', liste: gefiltert }];
    const m = new Map<string, { rang: number; liste: typeof gefiltert }>();
    for (const a of gefiltert) { const g = m.get(a.abschnitt) ?? { rang: a.abschnittRang, liste: [] }; g.liste.push(a); g.rang = Math.min(g.rang, a.abschnittRang); m.set(a.abschnitt, g); }
    return [...m.entries()].sort((a, b) => a[1].rang - b[1].rang).map(([name, g]) => ({ name, liste: g.liste }));
  }, [gefiltert, reiter, sort]);
  const gesamt = angebote.reduce((s, a) => s + (a.preis || 0), 0);
  const zaehler: Partial<Record<Reiter, number>> = {
    neu: reich.filter((a) => a.neu).length, wunsch: reich.filter((a) => a.teile.some((t) => wunsch.wert.includes(t.id))).length,
    anders: reich.filter((a) => (a.ab ?? '').slice(0, 10) === heute).length, geht: reich.filter((a) => (a.bis ?? '').slice(0, 10) === heute).length,
  };

  if (laedt) return <Laedt farbe={TEAL} text="Loading today's shop …" />;
  if (fehler) return <Glas className="p-8 text-sm text-white/60">The item shop couldn't be loaded right now ({fehler}). Try again in a minute.</Glas>;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Item Shop" farbe={TEAL}
        text={<>Everything in today's shop – with when each item was last seen and how long it stays. {verlaufLaedt && <span className="text-teal-200/70">Loading shop history …</span>}</>}
        rechts={<LinkKopieren />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Shop of', new Date(datum ?? Date.now()).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }), '#5eead4'],
          ['Resets in', restText(reset - jetzt), '#fde047'],
          ['Offers', angebote.length.toLocaleString('en'), '#c4b5fd'],
          ['Total value', <span key="v">{preis(gesamt)}</span>, '#7dd3fc'],
        ].map(([k, v, f], i) => (
          <Glas key={k as string} className="p-5" verzoegerung={i * 0.05}>
            <p className="text-2xl font-black tabular-nums md:text-3xl" style={{ color: f as string }}>{v}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k as string}</p>
          </Glas>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-black/30 p-1">
          {REITER.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setReiter(k)} className="relative rounded-xl px-3.5 py-1.5 text-sm font-bold">
              {reiter === k && <motion.span layoutId="shop-reiter" className="absolute inset-0 rounded-xl bg-teal-300 shadow-[0_0_20px_rgba(45,212,191,0.35)]" />}
              <span className={`relative ${reiter === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{t}{zaehler[k] !== undefined && <span className="ml-1.5 text-[11px] opacity-60">{zaehler[k]}</span>}</span>
            </button>
          ))}
        </div>
        {reiter !== 'verlauf' && <>
          <Auswahl titel="Type" wert={art} setzen={setArt} optionen={ARTEN} />
          <Auswahl titel="Sort" wert={sort} setzen={setSort} optionen={[['shop', 'Shop order'], ['teuer', 'Price: high'], ['billig', 'Price: low'], ['name', 'Name']]} />
        </>}
      </div>

      {reiter === 'verlauf' ? <Verlauf heute={heute} /> : (
        <>
          {reiter === 'wunsch' && !wunsch.wert.length && <Glas className="p-6 text-sm text-white/55">Your wishlist is empty. Tap the heart on any item (here or in <Link to="/community/cosmetics" className="text-teal-200 hover:text-white">Cosmetics</Link>) and you'll see here when it's in the shop.</Glas>}
          {abschnitte.map((g, gi) => (
            <section key={g.name || 'alle'} className="space-y-3">
              {g.name && <motion.h2 initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(gi, 8) * 0.04 }} className="flex items-baseline gap-2 text-xl font-extrabold tracking-tight text-white">{g.name}<span className="text-xs font-semibold text-white/35">{g.liste.length}</span></motion.h2>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9">
                {g.liste.map((a, i) => <ShopKachel key={a.id} a={a} i={i} besessen={a.teile.length > 0 && a.teile.every((t) => spind.wert.includes(t.id))} gewuenscht={a.teile.some((t) => wunsch.wert.includes(t.id))} oeffnen={() => setOffen(a)} jetzt={jetzt} />)}
              </div>
            </section>
          ))}
          {!gefiltert.length && reiter !== 'wunsch' && <Glas className="p-8 text-center text-sm text-white/45">Nothing in this view today.</Glas>}
        </>
      )}
      <p className="text-[11px] text-white/30">Shop data: fortnite-api.com. Epic doesn't publish sales numbers, so there's no "best sellers" list here.</p>
      <AnimatePresence>{offen && <AngebotFenster a={reich.find((x) => x.id === offen.id) ?? offen} zu={() => setOffen(null)} />}</AnimatePresence>
    </div>
  );
}

function ShopKachel({ a, i, besessen, gewuenscht, oeffnen, jetzt }: { a: Angebot & { vorher: string | null; neu: boolean; wartezeit: number | null; laeuft: number }; i: number; besessen: boolean; gewuenscht: boolean; oeffnen: () => void; jetzt: number }) {
  const t = a.teile[0];
  const s = seltenVon(t?.selten ?? 'common');
  const geht = Date.parse(a.bis) - jetzt;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 18) * 0.02 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-white/25">
      <button type="button" onClick={oeffnen} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden" style={{ background: a.farben?.length ? `radial-gradient(120% 90% at 50% 15%, ${a.farben[0]}, ${a.farben.at(-1)} 75%, #05070d)` : `radial-gradient(120% 90% at 50% 15%, ${s.a}55, ${s.b} 70%, #05070d)` }}>
          {t?.art === 'track' && <span className="absolute inset-0 grid place-items-center text-4xl text-white/20">♪</span>}
          {a.bild && <img src={a.bild} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className={`absolute inset-0 h-full w-full ${t?.art === 'track' ? 'object-cover' : 'object-contain'} transition duration-300 group-hover:scale-[1.04]`} />}
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: s.a }} />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {a.neu && <span className="rounded-md bg-teal-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">New</span>}
            {a.banner && <span className="max-w-[140px] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">{a.banner}</span>}
            {besessen && <span className="rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">Owned</span>}
          </div>
          {gewuenscht && <span className="absolute right-2 top-2 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">Wish</span>}
        </div>
        <div className="px-2.5 pb-1 pt-2">
          <p className="truncate text-sm font-extrabold leading-tight text-white">{a.name}</p>
          <p className="flex items-center justify-between gap-2 text-sm font-bold text-white/85">
            <span>{preis(a.preis)}{a.regulaer > a.preis && <span className="ml-1.5 text-[11px] text-white/35 line-through">{a.regulaer.toLocaleString('en')}</span>}</span>
          </p>
          <p className="mt-0.5 flex justify-between text-[10px] text-white/40">
            <span>{a.bundle ? `${a.teile.length} items · ` : ''}{a.laeuft > 1 ? `In shop ${a.laeuft}d` : a.vorher ? `Back after ${a.wartezeit}d` : a.neu ? 'First time' : t?.art === 'br' ? '' : t?.typName}</span>
            {geht > 0 && geht < 7 * 864e5 && <span className={geht < 864e5 ? 'text-amber-200/80' : ''}>{restText(geht)} left</span>}
          </p>
        </div>
      </button>
      <div className="px-2 pb-2"><Reaktionen id={a.teile[0]?.id ?? a.id} klein /></div>
    </motion.div>
  );
}

function AngebotFenster({ a, zu }: { a: Angebot; zu: () => void }) {
  const alleTage = [...new Set(a.teile.flatMap((t) => t.shop))].sort();
  const l = auftritte(alleTage);
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={zu}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
        className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0f19]/95 p-6 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">{a.abschnitt}{a.bundle ? ' · Bundle' : ''}</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white">{a.name}</h2>
            <p className="mt-1 text-lg font-bold text-white/85">{preis(a.preis)}{a.regulaer > a.preis && <span className="ml-2 text-sm text-white/40 line-through">{a.regulaer.toLocaleString('en')}</span>}</p>
            <p className="mt-1 text-xs text-white/45">In the shop {datumKurz(a.ab)} – {datumKurz(a.bis)}</p>
          </div>
          <button type="button" onClick={zu} className="text-xl text-white/40 hover:text-white">✕</button>
        </div>
        <div className="mt-4"><Reaktionen id={a.teile[0]?.id ?? a.id} /></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {a.teile.map((t, i) => <Kachel key={t.id} t={t} index={i} />)}
        </div>
        {l.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold text-white">Shop appearances <span className="text-sm font-semibold text-white/40">{l.length} · {alleTage.length} days in total</span></h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...l].reverse().slice(0, 40).map((x) => <span key={x.ab} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] tabular-nums text-white/65">{datumKurz(x.ab)}{x.tage > 1 ? ` · ${x.tage}d` : ''}</span>)}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Shop eines frueheren Tages - aus dem Shop-Verlauf aller BR-Teile zusammengesetzt. */
function Verlauf({ heute }: { heute: string }) {
  const { teile, laedt } = useTeile(['br']);
  const gestern = new Date(Date.parse(heute) - 864e5).toISOString().slice(0, 10);
  const [tag, setTag] = useState(gestern);
  const anTag = useMemo(() => teile.filter((t) => t.shop.some((d) => d.slice(0, 10) === tag)), [teile, tag]);
  const verschieben = (n: number) => setTag((d) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10));
  if (laedt) return <Laedt farbe={TEAL} text="Loading shop history …" />;
  return (
    <div className="space-y-4">
      <Glas className="flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={() => verschieben(-1)} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-white/70 hover:text-white">←</button>
        <input type="date" value={tag} max={heute} onChange={(e) => e.target.value && setTag(e.target.value)} className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-white [color-scheme:dark]" />
        <button type="button" disabled={tag >= heute} onClick={() => verschieben(1)} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-white/70 hover:text-white disabled:opacity-30">→</button>
        <span className="text-sm text-white/55">{anTag.length} Battle Royale items were in the shop on {datumKurz(tag)}</span>
        <span className="ml-auto text-[11px] text-white/35">Rebuilt from each item's shop history – Jam Tracks, cars and instruments aren't included.</span>
      </Glas>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {anTag.map((t: Teil, i) => <Kachel key={t.id} t={t} index={i} />)}
      </div>
      {!anTag.length && <Glas className="p-8 text-center text-sm text-white/45">No shop history for this day.</Glas>}
    </div>
  );
}
