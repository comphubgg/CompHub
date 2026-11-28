import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dauer, Flaeche, Laedt, Leer, Marke, useJetzt, Zaehler } from '../../../ds/Bausteine';
import { LinkKopieren, restText } from '../Bausteine';
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

  // Buehne: das teuerste neue Angebot (sonst das teuerste ueberhaupt) - Epics "Featured" gibt es im Endpunkt nicht als Feld
  const buehne = useMemo(() => [...reich].filter((a) => a.bild).sort((x, y) => Number(y.neu) - Number(x.neu) || y.preis - x.preis)[0] ?? null, [reich]);
  const zahlenKopf: Array<[string, React.ReactNode, string?]> = [
    ['Offers', angebote.length.toLocaleString('en')], ['New today', zaehler.anders ?? 0, 'akz'], ['First time ever', zaehler.neu ?? 0],
    ['Leaving today', zaehler.geht ?? 0, 'gold'], ['Total value', preis(gesamt)],
  ];

  if (laedt) return <Laedt text="Loading today's shop" />;
  if (fehler) return <Leer text={`The item shop couldn't be loaded right now (${fehler}). Try again in a minute.`} />;
  return (
    <div className="space-y-6">
      {/* Buehne: grosses Angebot links, Uhr und Zahlen rechts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {buehne && (
          <motion.button type="button" onClick={() => setOffen(buehne)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="fl-fest fl-klick group relative isolate min-h-[340px] overflow-hidden text-left lg:min-h-[420px]">
            <div className="absolute inset-0 -z-20" style={{ background: buehne.farben?.length ? `radial-gradient(110% 100% at 70% 30%, ${buehne.farben[0]}, ${buehne.farben.at(-1)} 70%, #04050a)` : `radial-gradient(110% 100% at 70% 30%, ${seltenVon(buehne.teile[0]?.selten ?? 'common').a}88, #04050a 75%)` }} />
            <img src={buehne.bild} alt="" draggable={false} className="absolute inset-y-0 right-0 -z-10 h-full w-full object-contain object-right transition duration-700 group-hover:scale-[1.04] sm:w-[70%]" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04050a]/95 via-[#04050a]/55 to-transparent" />
            <div className="flex h-full flex-col justify-end p-6 lg:p-9">
              <p className="ueber">Item Shop · {new Date(datum ?? Date.now()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <h1 className="titel mt-2 max-w-xl text-6xl lg:text-8xl">{buehne.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {buehne.neu && <Marke ton="akz">First time in the shop</Marke>}
                {buehne.bundle && <Marke>{buehne.teile.length} items</Marke>}
                {buehne.banner && <Marke>{buehne.banner}</Marke>}
              </div>
              <p className="titel mt-4 text-4xl">{preis(buehne.preis)}{buehne.regulaer > buehne.preis && <span className="ml-3 text-2xl text-white/35 line-through">{buehne.regulaer.toLocaleString('en')}</span>}</p>
            </div>
          </motion.button>
        )}
        <Flaeche fest verz={0.06} className="flex flex-col justify-between gap-6 p-6 lg:p-8">
          <div className="flex items-start justify-between gap-3">
            <div><p className="ueber">Next shop in</p><p className="titel zahl mt-1 text-6xl text-akz lg:text-7xl">{dauer(reset - jetzt)}</p><p className="text-xs text-white/45">Resets every day at 00:00 UTC</p></div>
            <LinkKopieren />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {zahlenKopf.map(([k, v, ton], i) => (
              <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{k}</p>
                <p className={`mt-1 text-3xl font-extrabold leading-none ${ton === 'akz' ? 'text-akz' : ton === 'gold' ? 'text-amber-200' : 'text-white'}`}>{typeof v === 'number' ? <Zaehler wert={v} /> : v}</p>{i === 0 && verlaufLaedt && <p className="mt-1 text-[10px] text-white/35">Loading shop history …</p>}</div>
            ))}
          </div>
          <button type="button" onClick={() => setReiter('verlauf')} className="knopf self-start">Browse earlier shops <span aria-hidden>→</span></button>
        </Flaeche>
      </div>

      {/* Ansicht, Typ und Sortierung - alles sichtbar in einer Zeile */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="ohne-leiste -mx-4 flex max-w-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {REITER.map(([k, t]) => <button key={k} type="button" onClick={() => setReiter(k)} className={`chip shrink-0 ${reiter === k ? 'chip-an' : ''}`}>{t}{zaehler[k] !== undefined && <span className="zahl ml-1 opacity-60">{zaehler[k]}</span>}</button>)}
        </div>
        {reiter !== 'verlauf' && <div className="flex gap-2 sm:ml-auto">
          <Auswahl titel="Type" wert={art} setzen={setArt} optionen={ARTEN} />
          <Auswahl titel="Sort" wert={sort} setzen={setSort} optionen={[['shop', 'Shop order'], ['teuer', 'Price: high'], ['billig', 'Price: low'], ['name', 'Name']]} />
        </div>}
      </div>

      {reiter === 'verlauf' ? <Verlauf heute={heute} /> : (
        <>
          {reiter === 'wunsch' && !wunsch.wert.length && <Leer text={<>Your wishlist is empty. Tap the heart on any item (here or in <Link to="/community/cosmetics" className="text-akz hover:text-white">Cosmetics</Link>) and you'll see here when it's in the shop.</>} />}
          {abschnitte.map((g) => (
            <section key={g.name || 'alle'} className="space-y-3">
              {g.name && <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" /><h2 className="titel text-3xl">{g.name}</h2><span className="zahl text-sm text-white/35">{g.liste.length}</span></div>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                {g.liste.map((a, i) => <ShopKachel key={a.id} a={a} i={i} besessen={a.teile.length > 0 && a.teile.every((t) => spind.wert.includes(t.id))} gewuenscht={a.teile.some((t) => wunsch.wert.includes(t.id))} oeffnen={() => setOffen(a)} jetzt={jetzt} />)}
              </div>
            </section>
          ))}
          {!gefiltert.length && reiter !== 'wunsch' && <Leer text="Nothing in this view today." />}
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
      className="fl-fest fl-klick group relative overflow-hidden !rounded-2xl">
      <button type="button" onClick={oeffnen} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden" style={{ background: a.farben?.length ? `radial-gradient(120% 90% at 50% 15%, ${a.farben[0]}, ${a.farben.at(-1)} 75%, #05070d)` : `radial-gradient(120% 90% at 50% 15%, ${s.a}55, ${s.b} 70%, #05070d)` }}>
          {t?.art === 'track' && <span className="absolute inset-0 grid place-items-center text-4xl text-white/20">♪</span>}
          {a.bild && <img src={a.bild} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className={`absolute inset-0 h-full w-full ${t?.art === 'track' ? 'object-cover' : 'object-contain'} transition duration-300 group-hover:scale-[1.04]`} />}
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: s.a }} />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {a.neu && <span className="rounded-md bg-akz px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">New</span>}
            {a.banner && <span className="max-w-[140px] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur">{a.banner}</span>}
            {besessen && <span className="rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">Owned</span>}
          </div>
          {gewuenscht && <span className="absolute right-2 top-2 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">Wish</span>}
        </div>
        <div className="px-2.5 pb-1 pt-2">
          <p className="truncate text-sm font-bold leading-tight text-white group-hover:text-akz">{a.name}</p>
          <p className="flex items-center justify-between gap-2 text-sm font-bold text-white/85">
            <span>{preis(a.preis)}{a.regulaer > a.preis && <span className="ml-1.5 text-[11px] text-white/35 line-through">{a.regulaer.toLocaleString('en')}</span>}</span>
          </p>
          <p className="mt-0.5 flex justify-between gap-1 text-[10px] text-white/40">
            <span className="truncate">{a.bundle ? `${a.teile.length} items · ` : ''}{a.laeuft > 1 ? `In shop ${a.laeuft}d` : a.vorher ? `Back after ${a.wartezeit}d` : a.neu ? 'First time' : t?.art === 'br' ? '' : t?.typName}</span>
            {geht > 0 && geht < 7 * 864e5 && <span className={`shrink-0 ${geht < 864e5 ? 'text-amber-200/80' : ''}`}>{restText(geht)}</span>}
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
        className="fl-fest max-h-[88vh] w-full max-w-4xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ueber">{a.abschnitt}{a.bundle ? ' · Bundle' : ''}</p>
            <h2 className="titel mt-1 text-5xl">{a.name}</h2>
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
  if (laedt) return <Laedt text="Loading shop history" />;
  return (
    <div className="space-y-4">
      <div className="fl-fest flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={() => verschieben(-1)} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-white/70 hover:text-white">←</button>
        <input type="date" value={tag} max={heute} onChange={(e) => e.target.value && setTag(e.target.value)} className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-semibold text-white [color-scheme:dark]" />
        <button type="button" disabled={tag >= heute} onClick={() => verschieben(1)} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-white/70 hover:text-white disabled:opacity-30">→</button>
        <span className="text-sm text-white/55">{anTag.length} Battle Royale items were in the shop on {datumKurz(tag)}</span>
        <span className="ml-auto text-[11px] text-white/35">Rebuilt from each item's shop history – Jam Tracks, cars and instruments aren't included.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {anTag.map((t: Teil, i) => <Kachel key={t.id} t={t} index={i} />)}
      </div>
      {!anTag.length && <Leer text="No shop history for this day." />}
    </div>
  );
}
