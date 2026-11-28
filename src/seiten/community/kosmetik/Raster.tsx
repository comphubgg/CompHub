import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useWer } from '../../../teile/Anmeldung';
import { datumKurz, REITER, seltenVon, SELTEN, tageSeit, useReaktionen, useSpind, useWunschliste, type Teil } from './daten';

/*
 * Bausteine der Kosmetik-Seiten (Spezifikation: "Kosmetik-Raster" und "Reaktionsleiste" - einmal bauen, ueberall nutzen):
 *   Kachel      Bild auf Seltenheits-Verlauf, Name, Typ, Herz (Wunschliste) und Haken (Spind), optional Preis / Zusatzzeile
 *   Raster      Typ-Reiter, Suche, Filter (Seltenheit, Saison, Set, Herkunft), Sortierung, Schalter (Namen, Wunschliste/Spind ausblenden),
 *               waechst beim Scrollen nach (16.000 Kacheln auf einmal waeren zu viel)
 *   Reaktionen  fuenf feste Reaktionen; gespeichert wird die eigene (Konto oder Browser) - Summen aller Nutzer brauchen einen Server-Zaehler
 *   AblageHinweis  sagt ehrlich, wo die eigenen Listen liegen (Konto oder nur dieser Browser)
 */

/* Das Original-V-Bucks-Symbol (Betreiber 27.11.: kein selbstgemaltes) - fortnite-api.com liefert es im Shop-Endpunkt als data.vbuckIcon. */
export const VBUCK_BILD = 'https://fortnite-api.com/images/vbuck.png';
export const VBUCK = <img src={VBUCK_BILD} alt="V-Bucks" title="V-Bucks" className="inline-block h-[1.1em] w-[1.1em] shrink-0 -translate-y-px object-contain" />;
export const preis = (n: number) => <span className="inline-flex items-center gap-1 tabular-nums">{VBUCK}{n.toLocaleString('en')}</span>;

/* ---------------------------------------------- Kachel */
/** beiKlick: statt zur Detailseite zu springen, ruft die Kachel das auf (z. B. Free Cosmetics: "So bekommst du es"). */
export function Kachel({ t, unten, gross = false, namen = true, index = 0, link = true, beiKlick }: { t: Teil; unten?: ReactNode; gross?: boolean; namen?: boolean; index?: number; link?: boolean; beiKlick?: () => void }) {
  const s = seltenVon(t.selten);
  const wunsch = useWunschliste(); const spind = useSpind();
  const gewuenscht = wunsch.wert.includes(t.id); const besessen = spind.wert.includes(t.id);
  const umschalten = (liste: typeof wunsch, an: boolean) => liste.setzen((l) => (an ? l.filter((x) => x !== t.id) : [...l, t.id]));
  const inhalt = (
    <>
      <div className="relative aspect-square overflow-hidden" style={{ background: `radial-gradient(120% 90% at 50% 12%, ${s.a}66, ${s.b} 62%, #04050a)` }}>
        {t.art === 'track' && <span className="absolute inset-0 grid place-items-center text-4xl text-white/20">♪</span>}
        {t.bild ? <img src={t.bild} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} className={`absolute inset-0 h-full w-full ${t.art === 'track' ? 'object-cover' : 'object-contain p-1'} transition duration-500 group-hover:scale-[1.07]`} /> : null}
        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: s.a }} />
        {besessen && <span className="absolute bottom-2.5 left-2 rounded-md bg-emerald-400/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#06080f]">Owned</span>}
      </div>
      {namen && (
        <div className="px-2.5 pb-2.5 pt-2">
          <p className={`truncate font-bold leading-tight text-white group-hover:text-akz ${gross ? 'text-base' : 'text-sm'}`}>{t.name}</p>
          <p className="truncate text-[11px] font-semibold" style={{ color: s.a }}>{t.art === 'track' ? t.text : `${t.seltenName} ${t.typName}`}</p>
          {unten}
        </div>
      )}
    </>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 24) * 0.015, duration: 0.35 }}
      className="fl-fest fl-klick group relative overflow-hidden !rounded-2xl">
      {beiKlick ? <div role="button" tabIndex={0} onClick={beiKlick} onKeyDown={(e) => { if (e.key === 'Enter') beiKlick(); }} className="block cursor-pointer">{inhalt}</div>
        : link ? <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className="block">{inhalt}</Link> : inhalt}
      <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" title={gewuenscht ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => umschalten(wunsch, gewuenscht)}
          className={`grid h-7 w-7 place-items-center rounded-lg backdrop-blur transition ${gewuenscht ? 'bg-rose-500 text-white' : 'bg-black/55 text-white/75 hover:text-white'}`}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={gewuenscht ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        </button>
        <button type="button" title={besessen ? 'Remove from my locker' : 'I own this'} onClick={() => umschalten(spind, besessen)}
          className={`grid h-7 w-7 place-items-center rounded-lg backdrop-blur transition ${besessen ? 'bg-emerald-400 text-[#06080f]' : 'bg-black/55 text-white/75 hover:text-white'}`}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4L19 7" /></svg>
        </button>
      </div>
      {gewuenscht && <span className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-400 group-hover:opacity-0" />}
    </motion.div>
  );
}

/* ---------------------------------------------- Reaktionen */
export const REAKTIONEN = [
  { k: 'feuer', z: '🔥', t: 'Fire' }, { k: 'liebe', z: '😍', t: 'Love it' }, { k: 'naja', z: '😐', t: 'Meh' }, { k: 'uebel', z: '🤢', t: 'Nope' }, { k: 'mist', z: '💩', t: 'Trash' },
];
/** Wert einer Reaktion fuer Ranglisten (Feuer +2 ... Mist -2). */
export const PUNKTE: Record<string, number> = { feuer: 2, liebe: 1, naja: 0, uebel: -1, mist: -2 };
export function Reaktionen({ id, klein = false }: { id: string; klein?: boolean }) {
  const { wert, setzen } = useReaktionen();
  const meine = wert[id];
  return (
    <div className={`inline-flex rounded-xl border border-white/10 bg-black/30 ${klein ? 'p-0.5' : 'p-1'}`}>
      {REAKTIONEN.map((r) => (
        <button key={r.k} type="button" title={r.t} onClick={(e) => { e.preventDefault(); setzen((v) => { const n = { ...v }; if (n[id] === r.k) delete n[id]; else n[id] = r.k; return n; }); }}
          className={`relative rounded-lg transition ${klein ? 'px-1 py-0.5 text-sm' : 'px-2 py-1 text-lg'} ${meine === r.k ? 'bg-white/15' : meine ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0' : 'hover:bg-white/10'}`}>
          <motion.span animate={meine === r.k ? { scale: [1, 1.35, 1] } : { scale: 1 }} transition={{ duration: 0.3 }} className="inline-block">{r.z}</motion.span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Wo liegen meine Listen? */
export function AblageHinweis({ ort }: { ort: 'konto' | 'browser' }) {
  const { oeffnen } = useWer();
  return ort === 'konto'
    ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Saved to your CompHub account</span>
    : <button type="button" onClick={() => oeffnen('konto')} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-300/15">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Saved in this browser only · sign in to keep it on your account</button>;
}

/* ---------------------------------------------- Auswahlfeld */
export function Auswahl({ wert, setzen, optionen, titel }: { wert: string; setzen: (v: string) => void; optionen: Array<[string, string]>; titel: string }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="pointer-events-none absolute left-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">{titel}</span>
      <select value={wert} onChange={(e) => setzen(e.target.value)}
        className="appearance-none rounded-xl border border-white/10 bg-black/40 py-2 pl-[calc(0.75rem+var(--l,0px))] pr-8 text-sm font-semibold text-white focus:border-akz/60 focus:outline-none"
        style={{ ['--l' as string]: `${titel.length * 7 + 8}px` }}>
        {optionen.map(([k, t]) => <option key={k} value={k} className="bg-[#0b1220]">{t}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 text-[10px] text-white/40">▾</span>
    </label>
  );
}
export function Schalter({ titel, an, setzen }: { titel: string; an: boolean; setzen: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => setzen(!an)} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold text-white/65 hover:text-white">
      <span className={`relative h-4 w-7 rounded-full transition ${an ? 'bg-akz/80' : 'bg-white/10'}`}><motion.span layout className={`absolute top-0.5 h-3 w-3 rounded-full bg-white ${an ? 'right-0.5' : 'left-0.5'}`} /></span>{titel}
    </button>
  );
}

/* ---------------------------------------------- Raster mit Filtern */
export type Sortierung = 'neu' | 'alt' | 'name' | 'selten' | 'shop' | 'warten' | 'oft';
const SORT: Array<[Sortierung, string]> = [['neu', 'Newest'], ['alt', 'Oldest'], ['name', 'Name A–Z'], ['selten', 'Rarity'], ['shop', 'Last in shop'], ['warten', 'Longest wait'], ['oft', 'Most shop days']];
const SELTEN_RANG = Object.keys(SELTEN);

export function Raster({ teile, reiter, setReiter, standardSort = 'neu', ohneReiter = false, leer, zusatz, oben, kopf }: {
  teile: Teil[]; reiter?: string; setReiter?: (r: string) => void; standardSort?: Sortierung; ohneReiter?: boolean; leer?: ReactNode;
  zusatz?: (t: Teil) => ReactNode; oben?: ReactNode; kopf?: ReactNode;
}) {
  const [suche, setSuche] = useState('');
  const [selten, setSelten] = useState('alle'); const [saison, setSaison] = useState('alle'); const [set, setSet] = useState('alle'); const [herkunft, setHerkunft] = useState('alle');
  const [sort, setSort] = useState<Sortierung>(standardSort);
  const [namen, setNamen] = useState(true); const [ohneWunsch, setOhneWunsch] = useState(false); const [ohneBesitz, setOhneBesitz] = useState(false);
  const wunsch = useWunschliste(); const spind = useSpind();
  const imReiter = useMemo(() => {
    if (ohneReiter || !reiter) return teile;
    const r = REITER.find((x) => x.k === reiter);
    if (!r) return teile;
    return teile.filter((t) => t.art === r.art && (!r.typen || r.typen.includes(t.typ)));
  }, [teile, reiter, ohneReiter]);
  const optSelten = useMemo(() => [...new Set(imReiter.map((t) => t.selten))].sort((a, b) => SELTEN_RANG.indexOf(a) - SELTEN_RANG.indexOf(b)), [imReiter]);
  const optSaison = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of imReiter) if (t.saisonNr !== undefined && t.kapitel) m.set(t.saisonNr, `Chapter ${t.kapitel}, Season ${t.saison}`);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [imReiter]);
  const optSet = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of imReiter) if (t.set) m.set(t.set, (m.get(t.set) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [imReiter]);
  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const l = imReiter.filter((t) => (selten === 'alle' || t.selten === selten) && (saison === 'alle' || String(t.saisonNr) === saison) && (set === 'alle' || t.set === set)
      && (herkunft === 'alle' || (herkunft === 'shop' ? t.shop.length > 0 : t.shop.length === 0))
      && (!ohneWunsch || !wunsch.wert.includes(t.id)) && (!ohneBesitz || !spind.wert.includes(t.id))
      && (!q || `${t.name} ${t.text} ${t.set ?? ''} ${t.id} ${t.tags.join(' ')}`.toLowerCase().includes(q)));
    const letzt = (t: Teil) => t.shop.at(-1) ?? '';
    const f: Record<Sortierung, (a: Teil, b: Teil) => number> = {
      neu: (a, b) => (b.hinzu ?? '').localeCompare(a.hinzu ?? ''), alt: (a, b) => (a.hinzu ?? '').localeCompare(b.hinzu ?? ''), name: (a, b) => a.name.localeCompare(b.name),
      selten: (a, b) => SELTEN_RANG.indexOf(b.selten) - SELTEN_RANG.indexOf(a.selten) || a.name.localeCompare(b.name),
      shop: (a, b) => letzt(b).localeCompare(letzt(a)),
      warten: (a, b) => (a.shop.length ? letzt(a) : '9').localeCompare(b.shop.length ? letzt(b) : '9'),
      oft: (a, b) => b.shop.length - a.shop.length,
    };
    return [...l].sort(f[sort]);
  }, [imReiter, suche, selten, saison, set, herkunft, sort, ohneWunsch, ohneBesitz, wunsch.wert, spind.wert]);
  // Nachwachsen beim Scrollen
  const [anzahl, setAnzahl] = useState(96);
  useEffect(() => { setAnzahl(96); }, [reiter, suche, selten, saison, set, herkunft, sort]);
  const ende = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ende.current; if (!el) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setAnzahl((n) => n + 96); }, { rootMargin: '800px' });
    io.observe(el); return () => io.disconnect();
  }, [liste.length]);
  const filterAn = selten !== 'alle' || saison !== 'alle' || set !== 'alle' || herkunft !== 'alle' || !!suche;
  const reiterTitel = REITER.find((r) => r.k === reiter)?.titel;
  return (
    <div className="space-y-4">
      {!ohneReiter && setReiter && (
        <div className="ohne-leiste -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {REITER.map((r) => <button key={r.k} type="button" onClick={() => setReiter(r.k)} className={`chip shrink-0 ${reiter === r.k ? 'chip-an' : ''}`}>{r.titel}</button>)}
        </div>
      )}
      {oben}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Filter: auf breiten Schirmen angedockt links, auf dem Handy als Block oben */}
        <aside className="fl-fest relative z-10 space-y-3 p-4 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
          <div>
            <p className="titel text-3xl leading-none"><span className="zahl">{liste.length.toLocaleString('en')}</span></p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{reiterTitel ?? 'Items'}{filterAn ? ' · filtered' : ''}</p>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name, set, tag or ID" className="eingabe w-full !pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 [&_label]:w-full [&_select]:w-full">
            {optSelten.length > 1 && <Auswahl titel="Rarity" wert={selten} setzen={setSelten} optionen={[['alle', 'All'], ...optSelten.map((k): [string, string] => [k, seltenVon(k).name])]} />}
            {optSaison.length > 1 && <Auswahl titel="Season" wert={saison} setzen={setSaison} optionen={[['alle', 'All'], ...optSaison.map(([k, t]): [string, string] => [String(k), t])]} />}
            {optSet.length > 1 && <Auswahl titel="Set" wert={set} setzen={setSet} optionen={[['alle', 'All'], ...optSet.map(([k, n]): [string, string] => [k, `${k} (${n})`])]} />}
            <Auswahl titel="Source" wert={herkunft} setzen={setHerkunft} optionen={[['alle', 'All'], ['shop', 'Item Shop'], ['nie', 'Never in the shop']]} />
            <Auswahl titel="Sort" wert={sort} setzen={(v) => setSort(v as Sortierung)} optionen={SORT} />
          </div>
          {filterAn && <button type="button" onClick={() => { setSuche(''); setSelten('alle'); setSaison('alle'); setSet('alle'); setHerkunft('alle'); }} className="knopf-leer !text-xs">Clear filters</button>}
          <div className="flex flex-wrap gap-x-1 border-t border-white/[0.06] pt-2 lg:flex-col lg:items-start">
            <Schalter titel="Show names" an={namen} setzen={setNamen} />
            <Schalter titel="Hide wishlisted" an={ohneWunsch} setzen={setOhneWunsch} />
            <Schalter titel="Hide owned" an={ohneBesitz} setzen={setOhneBesitz} />
          </div>
          {kopf && <div className="border-t border-white/[0.06] pt-3">{kopf}</div>}
        </aside>
        <div className="min-w-0">
          {liste.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {liste.slice(0, anzahl).map((t, i) => <Kachel key={`${t.art}:${t.id}`} t={t} namen={namen} index={i % 96} unten={zusatz?.(t)} />)}
            </div>
          ) : (leer ?? <div className="fl-fest p-10 text-center text-sm text-white/45">Nothing matches these filters.</div>)}
          <div ref={ende} />
        </div>
      </div>
    </div>
  );
}

/** Kleine Zeile unter der Kachel: zuletzt im Shop. */
export function ZuletztImShop({ t }: { t: Teil }) {
  const d = t.shop.at(-1);
  if (!d) return <p className="mt-1 text-[10px] text-white/30">Never in the shop</p>;
  const n = tageSeit(d) ?? 0;
  return <p className="mt-1 text-[10px] text-white/40" title={datumKurz(d)}>{n <= 0 ? 'In the shop today' : `Last in shop ${n}d ago`}</p>;
}

/** Ein- und ausblendender Bereich mit Ueberschrift. */
export function Bereich({ titel, rechts, children, verzoegerung = 0 }: { titel: ReactNode; rechts?: ReactNode; children: ReactNode; verzoegerung?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verzoegerung, duration: 0.45 }} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2"><div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" /><h2 className="titel text-3xl">{titel}</h2></div>{rechts}</div>
      {children}
    </motion.section>
  );
}
export { AnimatePresence };
