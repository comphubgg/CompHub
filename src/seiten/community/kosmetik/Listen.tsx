import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkKopieren } from '../Bausteine';
import { Bild, Flaeche, Laedt, Leer, Segment, SeitenKopf } from '../../../ds/Bausteine';
import { auftritte, datumKurz, holen, QUELLEN, seltenVon, tageSeit, useShop, useTeile, type Teil } from './daten';
import { Kachel, preis as vb, Schalter } from './Raster';

/*
 * Weitere Kosmetik-Seiten der Spezifikation:
 *   New in the files  (Punkt 10 "Leaks")  fortnite-api.com/v2/cosmetics/new - was mit dem letzten Patch in die Spieldateien kam, dazu alles, was
 *                     in den letzten 60 Tagen hinzukam, nach Datum gruppiert. Stufe "Released" (schon im Shop) / "Not released yet" (nur in den Dateien).
 *   Free Cosmetics    (Punkt 13) redaktionell - /hub-daten/gratis.json, "Mark as completed" pro Konto/Browser
 *   Jam Tracks        (Punkt 14) Jam Tracks im heutigen Shop (v2/shop) + ganze Bibliothek (v2/cosmetics/tracks) mit Suche, Genre, Schwierigkeit
 *   Cosmetic Stats    (Punkt 12) aus dem Shop-Verlauf: laengste Wartezeit, meiste Shop-Tage, meiste Auftritte, Rueckkehrer von heute
 *   Most Used         (Punkt 11) Epic veroeffentlicht keine Nutzungszahlen -> ehrliche Karte
 */

/* ---------------------------------------------- New in the files (Design 3.0, neu komponiert 28.11.2026)
 * Das Update ist die Buehne: Versionsnummer gross, verglichen mit, Zahlen. Darunter getrennt, was noch NICHT raus ist (das Spannende, breite
 * Spalte) und was schon im Shop war. Danach eine Zeitleiste: links klebt der Tag, rechts seine Kacheln; Status und Zeitraum als Segmente.
 */
interface Neu { date: string; build: string; previousBuild: string; items: Record<string, unknown[] | null> }
const version = (b: string) => b.replace(/^\+\+Fortnite\+Release-/, '').replace(/-CL-\d+$/, '');
export function NeuInDateien() {
  const [neu, setNeu] = useState<Neu | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => { holen<Neu>('/v2/cosmetics/new').then(setNeu).catch((e) => setFehler((e as Error).message)); }, []);
  const { teile, laedt } = useTeile(['br', 'track']);
  const [tage, setTage] = useState<'7' | '30' | '60'>('30');
  const [stufe, setStufe] = useState<'alle' | 'raus' | 'nicht'>('alle');
  const patch = useMemo(() => {
    if (!neu) return [] as Teil[];
    const ids = new Set([...(neu.items.br ?? []), ...(neu.items.tracks ?? []), ...(neu.items.instruments ?? [])].map((x) => String((x as { id: string }).id).toLowerCase()));
    const ausListe = teile.filter((t) => ids.has(t.id.toLowerCase()));
    // Instrumente sind nicht in der BR-Liste - direkt umbauen
    const inst = (neu.items.instruments ?? []).map((x) => QUELLEN.instrument.umbau(x));
    return [...ausListe, ...inst.filter((t) => !ausListe.some((a) => a.id === t.id))];
  }, [neu, teile]);
  const juengst = useMemo(() => {
    const grenze = Date.now() - Number(tage) * 864e5;
    const l = teile.filter((t) => Date.parse(t.hinzu) >= grenze && (stufe === 'alle' || (stufe === 'raus' ? t.shop.length > 0 : t.shop.length === 0)))
      .sort((a, b) => b.hinzu.localeCompare(a.hinzu));
    const m = new Map<string, Teil[]>();
    for (const t of l) { const k = t.hinzu.slice(0, 10); m.set(k, [...(m.get(k) ?? []), t]); }
    return [...m.entries()];
  }, [teile, tage, stufe]);
  const offen = patch.filter((t) => !t.shop.length); const raus = patch.filter((t) => t.shop.length);
  const raster = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4';
  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ das Update als Buehne */}
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="fl-fest relative overflow-hidden p-6 lg:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-akz/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div>
            <p className="ueber">Community · New in the files</p>
            <h1 className="titel mt-2 text-7xl lg:text-8xl">{neu ? `v${version(neu.build)}` : fehler ? 'New in the files' : '…'}</h1>
            <p className="mt-2 text-sm text-white/55">{neu ? <>Latest update, {datumKurz(neu.date)} · compared with v{version(neu.previousBuild)}</> : fehler ? `The list couldn't be loaded (${fehler}).` : 'Reading the latest update'}</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {([['New items', patch.length, 'text-white'], ['Not released yet', offen.length, 'text-rose-300'], ['Already out', raus.length, 'text-emerald-300']] as const).map(([k, v, f]) => (
              <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{k}</p><p className={`titel zahl text-6xl ${f}`}>{neu && !laedt ? v : '…'}</p></div>
            ))}
            <div className="self-center"><LinkKopieren /></div>
          </div>
        </div>
        <p className="relative mt-4 max-w-3xl text-xs text-white/40">Cosmetics added to Fortnite's game files with the latest updates – some are already out, others haven't been released yet and can still change or never come out.</p>
      </motion.header>

      {laedt && <Laedt text="Loading cosmetics" />}
      {neu && patch.length > 0 && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="space-y-3">
            <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.8)]" /><h2 className="titel text-3xl">Not released yet <span className="zahl text-base text-white/40">{offen.length}</span></h2></div>
            {offen.length ? <div className={`${raster} xl:grid-cols-5 2xl:grid-cols-6`}>{offen.map((t, i) => <Kachel key={t.id} t={t} index={i} link={t.art !== 'instrument'} unten={<Stufe t={t} />} />)}</div>
              : <Leer text="Everything from this update is already out." />}
          </section>
          <section className="space-y-3">
            <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" /><h2 className="titel text-3xl">Already out <span className="zahl text-base text-white/40">{raus.length}</span></h2></div>
            {raus.length ? <div className={`${raster} xl:grid-cols-3 2xl:grid-cols-4`}>{raus.map((t, i) => <Kachel key={t.id} t={t} index={i} link={t.art !== 'instrument'} unten={<Stufe t={t} />} />)}</div>
              : <Leer text="Nothing from this update has been in the shop yet." />}
          </section>
        </div>
      )}

      {/* ------------------------------------------------ Zeitleiste */}
      <section className="space-y-4">
        <div className="fl-fest flex flex-wrap items-center justify-between gap-3 p-2 pl-5">
          <h2 className="titel text-3xl">Added recently</h2>
          <div className="flex flex-wrap gap-2">
            <Segment id="neu-stufe" klein wert={stufe} onWahl={setStufe} wahl={[{ k: 'alle', titel: 'All' }, { k: 'raus', titel: 'Released' }, { k: 'nicht', titel: 'Not released yet' }]} />
            <Segment id="neu-tage" klein wert={tage} onWahl={setTage} wahl={[{ k: '7', titel: '7 days' }, { k: '30', titel: '30 days' }, { k: '60', titel: '60 days' }]} />
          </div>
        </div>
        <div className="relative">
          <span className="absolute bottom-0 left-[7px] top-2 hidden w-px bg-white/[0.08] md:block" />
          {juengst.map(([tag, l], gi) => (
            <div key={tag} className="relative grid gap-3 pb-7 md:grid-cols-[170px_minmax(0,1fr)]">
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(gi, 10) * 0.04 }} className="md:sticky md:top-[7.5rem] md:self-start md:pl-7">
                <span className="absolute left-0 top-2 hidden h-[15px] w-[15px] rounded-full border-2 border-akz bg-grund md:block" />
                <p className="titel text-3xl leading-none">{new Date(tag).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                <p className="mt-1 text-xs text-white/45">{new Date(tag).toLocaleDateString('en-GB', { weekday: 'long' })} · <span className="zahl">{l.length}</span> items</p>
              </motion.div>
              <div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9">
                  {l.slice(0, 36).map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<Stufe t={t} />} />)}
                </div>
                {l.length > 36 && <p className="mt-2 text-xs text-white/35">+{l.length - 36} more from this day – see <Link to="/community/cosmetics" className="text-akz">Cosmetics</Link> sorted by newest.</p>}
              </div>
            </div>
          ))}
        </div>
        {!laedt && !juengst.length && <Leer text="Nothing in this period." />}
      </section>
      <p className="text-[11px] text-white/30">Data: fortnite-api.com, which reads the public game files after every update. Items that aren't released yet can still change or never come out.</p>
    </div>
  );
}
function Stufe({ t }: { t: Teil }) {
  return t.shop.length
    ? <p className="mt-1 text-[10px] font-semibold text-emerald-300/80">Released · {datumKurz(t.shop[0])}</p>
    : <p className="mt-1 text-[10px] font-semibold text-rose-300/80">Not released yet</p>;
}

/* ---------------------------------------------- Jam Tracks (Design 3.0, neu komponiert 28.11.2026)
 * Plattenladen statt Tabelle: oben links das Spotlight (ein Track des heutigen Shops gross - Cover, Zahlen, Schwierigkeit je Instrument, Preis),
 * rechts die Cover-Wand des heutigen Shops (ein Klick holt den Track ins Spotlight). Darunter die Bibliothek: links klebende Filter
 * (Suche, Sortierung, Genres mit Zahl, Jahrzehnte), rechts dichte Zeilen mit Cover, Zahlen und Schwierigkeitsbalken; "im Shop" markiert.
 * Daten: v2/shop (heute), v2/cosmetics/tracks (Bibliothek + Schwierigkeit).
 */
const SCHWIERIG: Array<[string, string]> = [['vocals', 'Vocals'], ['guitar', 'Lead'], ['bass', 'Bass'], ['drums', 'Drums']];
const laenge = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');
function Stufen({ n, gross = false }: { n: number; gross?: boolean }) {
  return <span className="flex gap-0.5">{Array.from({ length: 7 }, (_, j) => <span key={j} className={`${gross ? 'h-3 w-2.5' : 'h-2.5 w-1.5'} rounded-sm ${j < n ? 'bg-akz' : 'bg-white/10'}`} />)}</span>;
}
export function JamTracks() {
  const shop = useShop();
  const { teile, laedt } = useTeile(['track']);
  const [roh, setRoh] = useState<Map<string, Record<string, number>>>(new Map());
  useEffect(() => { holen<Array<{ id: string; difficulty?: Record<string, number> }>>('/v2/cosmetics/tracks').then((l) => setRoh(new Map(l.map((x) => [x.id, x.difficulty ?? {}])))).catch(() => {}); }, []);
  // Ein Track kann in mehreren Angeboten stecken - jeden nur einmal zeigen (sonst doppelte Kacheln und doppelte Schluessel)
  const imShop = useMemo(() => [...new Map(shop.angebote.flatMap((a) => a.teile.filter((t) => t.art === 'track').map((t) => ({ t, preis: a.preis, bis: a.bis }))).map((x) => [x.t.id, x] as const)).values()]
    .sort((a, b) => b.t.hinzu.localeCompare(a.t.hinzu) || a.t.name.localeCompare(b.t.name)), [shop.angebote]);
  const shopIds = useMemo(() => new Set(imShop.map((x) => x.t.id)), [imShop]);
  const [wahl, setWahl] = useState<string | null>(null);
  const spot = imShop.find((x) => x.t.id === wahl) ?? imShop[0] ?? null;
  const [alleCover, setAlleCover] = useState(false);
  const [suche, setSuche] = useState(''); const [genre, setGenre] = useState('alle'); const [sort, setSort] = useState('neu'); const [jahrzehnt, setJahrzehnt] = useState('alle');
  const [nurShop, setNurShop] = useState(false);
  const genres = useMemo(() => {
    const m = new Map<string, number>(); for (const t of teile) for (const g of t.tags) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [teile]);
  const jahrzehnte = useMemo(() => [...new Set(teile.map((t) => (t.jahr ? Math.floor(t.jahr / 10) * 10 : 0)).filter(Boolean))].sort((a, b) => b - a), [teile]);
  const liste = useMemo(() => {
    const q = suche.toLowerCase();
    const l = teile.filter((t) => (genre === 'alle' || t.tags.includes(genre)) && (!q || `${t.name} ${t.text}`.toLowerCase().includes(q))
      && (jahrzehnt === 'alle' || (t.jahr && Math.floor(t.jahr / 10) * 10 === Number(jahrzehnt))) && (!nurShop || shopIds.has(t.id)));
    const f: Record<string, (a: Teil, b: Teil) => number> = { neu: (a, b) => b.hinzu.localeCompare(a.hinzu), titel: (a, b) => a.name.localeCompare(b.name), kuenstler: (a, b) => a.text.localeCompare(b.text),
      jahr: (a, b) => (b.jahr ?? 0) - (a.jahr ?? 0), bpm: (a, b) => (b.bpm ?? 0) - (a.bpm ?? 0) };
    return [...l].sort(f[sort]);
  }, [teile, suche, genre, sort, jahrzehnt, nurShop, shopIds]);
  const [mehr, setMehr] = useState(60);
  useEffect(() => setMehr(60), [suche, genre, sort, jahrzehnt, nurShop]);
  const heute = shop.datum ? new Date(shop.datum).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const cover = alleCover ? imShop : imShop.slice(0, 18);
  const st = spot?.t;
  return (
    <div className="space-y-8">
      {/* schmaler Kopf: Titel und die drei Zahlen in einer Zeile */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div><p className="ueber">Community · Festival</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Jam Tracks</h1></div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          {([['In the shop today', imShop.length], ['In the library', teile.length], ['Genres', genres.length]] as const).map(([k, v]) => (
            <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{k}</p><p className="titel zahl text-4xl">{v ? v.toLocaleString('en') : '…'}</p></div>
          ))}
          <LinkKopieren />
        </div>
      </header>

      {/* ------------------------------------------------ Spotlight + Cover-Wand des heutigen Shops */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Flaeche fest className="relative flex flex-col overflow-hidden p-5 sm:p-6">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-akz/15 blur-3xl" />
          <p className="ueber relative">In the shop today{heute ? ` · ${heute}` : ''}</p>
          {shop.laedt ? <Laedt /> : !st ? <p className="relative mt-4 text-sm text-white/50">No Jam Tracks in today's shop.</p> : (
            <motion.div key={st.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative mt-4 flex flex-col gap-5 sm:flex-row">
              <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10 sm:w-60 lg:w-72 2xl:w-80">
                <Bild src={st.bild} className="absolute inset-0 h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="titel text-5xl lg:text-6xl">{st.name}</h2>
                <p className="mt-1 truncate text-lg font-semibold text-white/70">{st.text}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {st.tags.map((g) => <span key={g} className="chip !py-1">{g}</span>)}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {([['Year', st.jahr ?? '—'], ['BPM', st.bpm ?? '—'], ['Length', laenge(st.dauer)]] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{k}</dt><dd className="titel zahl text-3xl">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2">
                  {SCHWIERIG.map(([k, t]) => <div key={k} className="flex items-center justify-between gap-2 text-xs text-white/55"><span>{t}</span><Stufen n={roh.get(st.id)?.[k] ?? 0} gross /></div>)}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-xl font-extrabold text-white">{vb(spot!.preis)}</span>
                  {spot!.bis && <span className="text-xs text-white/45">until {datumKurz(spot!.bis)}</span>}
                  <Link to={`/community/cosmetics/${st.id}`} className="knopf-prim ml-auto">Track page <span aria-hidden>→</span></Link>
                </div>
              </div>
            </motion.div>
          )}
          {/* als Naechstes: die vier Tracks nach dem Spotlight - ein Klick holt sie nach vorn */}
          {st && imShop.length > 1 && (
            <div className="relative mt-auto pt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Up next</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[1, 2, 3, 4].map((d) => imShop[(imShop.findIndex((x) => x.t.id === st.id) + d) % imShop.length]).filter((x, i, l) => x.t.id !== st.id && l.findIndex((y) => y.t.id === x.t.id) === i).map(({ t }) => (
                  <button key={t.id} type="button" onClick={() => setWahl(t.id)} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.03] p-1.5 text-left ring-1 ring-white/[0.05] transition hover:ring-akz/40">
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/40"><Bild src={t.bild} className="absolute inset-0 h-full w-full" /></span>
                    <span className="min-w-0"><span className="block truncate text-xs font-bold text-white">{t.name}</span><span className="block truncate text-[10px] text-white/45">{t.text}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Flaeche>

        <Flaeche fest verz={0.05} className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="titel text-3xl">Today's wall <span className="zahl text-base text-white/40">{imShop.length}</span></h2>
            <span className="hidden text-xs text-white/40 sm:inline">Newest first · click a cover for the spotlight</span>
          </div>
          {shop.laedt ? <Laedt /> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {cover.map(({ t, preis }, i) => (
                <motion.button key={t.id} type="button" onClick={() => setWahl(t.id)} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 24) * 0.015 }}
                  className={`group relative aspect-square overflow-hidden rounded-xl bg-black/40 text-left ring-1 transition ${spot?.t.id === t.id ? 'ring-2 ring-akz' : 'ring-white/[0.07] hover:ring-akz/50'}`} title={`${t.name} – ${t.text}`}>
                  <Bild src={t.bild} className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pb-1.5 pt-6">
                    <span className="block truncate text-[12px] font-bold leading-tight text-white">{t.name}</span>
                    <span className="flex items-center justify-between gap-1 text-[10px] text-white/55"><span className="truncate">{t.text}</span><span className="shrink-0">{vb(preis)}</span></span>
                  </span>
                </motion.button>
              ))}
            </div>
          )}
          {imShop.length > 18 && <button type="button" onClick={() => setAlleCover((x) => !x)} className="knopf-leer mt-3">{alleCover ? 'Show fewer' : `Show all ${imShop.length}`}</button>}
          <p className="mt-2 text-[11px] text-white/35">Also in the <Link to="/community/shop" className="text-akz/80 hover:text-akz">Item Shop</Link>.</p>
        </Flaeche>
      </section>

      {/* ------------------------------------------------ Bibliothek: Filter links (klebt), Zeilen rechts */}
      <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <Flaeche fest className="space-y-5 p-5 lg:sticky lg:top-[7.5rem]">
          <div><p className="ueber">The library</p><h2 className="titel mt-1 text-4xl">Every track</h2></div>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Song or artist…" className="eingabe w-full" />
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Sort</p>
            <div className="flex flex-wrap gap-1.5">{([['neu', 'Newest'], ['titel', 'Title'], ['kuenstler', 'Artist'], ['jahr', 'Year'], ['bpm', 'BPM']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setSort(k)} className={`chip ${sort === k ? 'chip-an' : ''}`}>{t}</button>)}</div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Genre</p>
            <div className="ohne-leiste flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              <button type="button" onClick={() => setGenre('alle')} className={`chip ${genre === 'alle' ? 'chip-an' : ''}`}>All</button>
              {genres.map(([g, n]) => <button key={g} type="button" onClick={() => setGenre(g)} className={`chip ${genre === g ? 'chip-an' : ''}`}>{g}<span className="zahl text-white/35">{n}</span></button>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Released</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setJahrzehnt('alle')} className={`chip ${jahrzehnt === 'alle' ? 'chip-an' : ''}`}>Any</button>
              {jahrzehnte.map((j) => <button key={j} type="button" onClick={() => setJahrzehnt(String(j))} className={`chip ${jahrzehnt === String(j) ? 'chip-an' : ''}`}>{j}s</button>)}
            </div>
          </div>
          <Schalter titel="Only what's in the shop today" an={nurShop} setzen={setNurShop} />
          <p className="zahl text-xs text-white/40">{liste.length.toLocaleString('en')} tracks match</p>
        </Flaeche>

        {laedt ? <Laedt text="Loading the library" /> : (
          <Flaeche fest verz={0.05} className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1fr)_56px_56px_56px_auto_88px] items-center gap-4 border-b border-white/[0.06] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 md:grid xl:grid-cols-[minmax(0,1fr)_56px_56px_56px_300px_88px]">
              <span>Song</span><span>Year</span><span>BPM</span><span>Length</span><span className="hidden xl:grid xl:grid-cols-4 xl:gap-3">{SCHWIERIG.map(([, t]) => <span key={t}>{t}</span>)}</span><span className="text-right">Added</span>
            </div>
            <ul>
              {liste.slice(0, mehr).map((t) => (
                <li key={t.id} className="border-t border-white/[0.04] first:border-t-0">
                  <Link to={`/community/cosmetics/${t.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 transition hover:bg-white/[0.035] md:grid-cols-[minmax(0,1fr)_56px_56px_56px_auto_88px] xl:grid-cols-[minmax(0,1fr)_56px_56px_56px_300px_88px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/40"><Bild src={t.bild} className="absolute inset-0 h-full w-full" /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2"><span className="truncate font-bold text-white">{t.name}</span>{shopIds.has(t.id) && <span className="shrink-0 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">In shop</span>}</span>
                        <span className="block truncate text-xs text-white/50">{t.text}{t.tags.length ? ` · ${t.tags.join(', ')}` : ''}</span>
                      </span>
                    </span>
                    <span className="zahl hidden text-sm text-white/60 md:block">{t.jahr ?? '—'}</span>
                    <span className="zahl hidden text-sm text-white/60 md:block">{t.bpm ?? '—'}</span>
                    <span className="zahl hidden text-sm text-white/60 md:block">{laenge(t.dauer)}</span>
                    <span className="hidden xl:grid xl:grid-cols-4 xl:gap-3">{SCHWIERIG.map(([k]) => <Stufen key={k} n={roh.get(t.id)?.[k] ?? 0} />)}</span>
                    <span className="zahl text-right text-xs text-white/45">{datumKurz(t.hinzu)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {!liste.length && <p className="px-5 py-10 text-center text-sm text-white/45">No track matches these filters.</p>}
            {liste.length > mehr && <button type="button" onClick={() => setMehr((n) => n + 100)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-akz hover:bg-white/[0.03]">Show more ({liste.length - mehr} left)</button>}
          </Flaeche>
        )}
      </section>
      <p className="text-[11px] text-white/30">Data: fortnite-api.com. Festival's free daily rotation isn't in a public feed we can read from the browser – this page shows the Jam Tracks you can buy today.</p>
    </div>
  );
}

/* ---------------------------------------------- Cosmetic Stats (Betreiber 27.11.: Balken "zu fest" - jetzt nur eine feine Linie unter der Zeile) */
export function KosmetikStats() {
  const { teile, laedt } = useTeile(['br']);
  const shop = useShop();
  const tabellen = useMemo(() => {
    const mitShop = teile.filter((t) => t.shop.length);
    const heute = shop.datum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const heuteIds = new Set(shop.angebote.flatMap((a) => a.teile.map((t) => t.id.toLowerCase())));
    const warten = mitShop.filter((t) => !heuteIds.has(t.id.toLowerCase())).map((t) => ({ t, w: tageSeit(t.shop.at(-1)) ?? 0 })).sort((a, b) => b.w - a.w);
    const tage = [...mitShop].sort((a, b) => b.shop.length - a.shop.length).map((t) => ({ t, w: t.shop.length }));
    const auftr = mitShop.map((t) => ({ t, w: auftritte(t.shop).length })).sort((a, b) => b.w - a.w);
    const zurueck = mitShop.filter((t) => heuteIds.has(t.id.toLowerCase())).map((t) => {
      const l = auftritte(t.shop.filter((d) => d.slice(0, 10) <= heute)); const vor = l.at(-2);
      return { t, w: vor ? tageSeit(vor.bis, Date.parse(l.at(-1)!.ab)) ?? 0 : 0 };
    }).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
    const nie = teile.filter((t) => !t.shop.length && ['outfit', 'emote', 'pickaxe', 'backpack', 'glider'].includes(t.typ)).length;
    return { warten, tage, auftr, zurueck, nie, mitShop: mitShop.length };
  }, [teile, shop.angebote, shop.datum]);
  if (laedt) return <Laedt text="Loading shop history" />;
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber="Community · Cosmetics" titel="Cosmetic stats" text="Leaderboards built from the complete item-shop history." rechts={<LinkKopieren />} />
      {/* Zwei Rekorde als Buehnen (je ein eigenes Bild), die Zahlen dazwischen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,5fr)]">
        {tabellen.warten[0] && <Rekord t={tabellen.warten[0].t} wert={tabellen.warten[0].w} titel="Longest wait right now" unter="days since it was last in the shop" />}
        <Flaeche fest verz={0.05} className="grid grid-cols-2 content-center gap-x-6 gap-y-6 p-6 lg:grid-cols-1">
          {([['Items ever in the shop', tabellen.mitShop], ['Never sold', tabellen.nie, 'outfits, emotes, pickaxes, back blings, gliders'], ['Back today', tabellen.zurueck.length, 'after a break']] as Array<[string, number, string?]>).map(([k, v, u]) => (
            <div key={k}><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{k}</p><p className="titel zahl mt-1 text-5xl">{v.toLocaleString('en')}</p>{u && <p className="text-[11px] text-white/40">{u}</p>}</div>
          ))}
        </Flaeche>
        {tabellen.zurueck[0] && <Rekord t={tabellen.zurueck[0].t} wert={tabellen.zurueck[0].w} titel="Biggest comeback today" unter="days away before today's shop" verz={0.1} />}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Tabelle titel="Longest wait in the shop" einheit="days since last seen" liste={tabellen.warten} />
        <Tabelle titel="Back today after the longest break" einheit="days away" liste={tabellen.zurueck} />
        <Tabelle titel="Most days in the shop" einheit="days" liste={tabellen.tage} />
        <Tabelle titel="Most shop appearances" einheit="times" liste={tabellen.auftr} />
      </div>
    </div>
  );
}
/** Ein Rekord als Buehne: grosses Bild auf Seltenheitslicht, Zahl in Bebas. */
function Rekord({ t, wert, titel, unter, verz = 0 }: { t: Teil; wert: number; titel: string; unter: string; verz?: number }) {
  const sv = seltenVon(t.selten);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verz, duration: 0.5 }}>
      <Link to={`/community/cosmetics/${t.id}`} className="fl-fest fl-klick group relative isolate flex h-full min-h-[300px] overflow-hidden">
        <div className="absolute inset-0 -z-20" style={{ background: `radial-gradient(90% 110% at 78% 35%, ${sv.a}88, ${sv.b} 60%, #04050a)` }} />
        <img src={t.bildGross || t.bild} alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-[62%] object-contain object-right transition duration-700 group-hover:scale-[1.05]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04050a]/90 via-[#04050a]/45 to-transparent" />
        <div className="flex flex-col justify-end p-6">
          <p className="ueber">{titel}</p>
          <p className="titel zahl mt-1 text-7xl text-akz">{wert.toLocaleString('en')}</p>
          <p className="text-xs text-white/50">{unter}</p>
          <p className="mt-3 text-xl font-bold text-white group-hover:text-akz">{t.name}</p>
          <p className="text-xs font-semibold" style={{ color: sv.a }}>{t.seltenName} {t.typName}</p>
        </div>
      </Link>
    </motion.div>
  );
}
function Tabelle({ titel, einheit, liste }: { titel: string; einheit: string; liste: Array<{ t: Teil; w: number }> }) {
  const [n, setN] = useState(10);
  const max = Math.max(1, liste[0]?.w ?? 1);
  return (
    <Flaeche fest className="p-5">
      <div className="flex items-baseline justify-between gap-3"><h3 className="titel text-3xl">{titel}</h3><span className="text-xs text-white/40">{einheit}</span></div>
      <ol className="mt-3 space-y-1.5">
        {liste.slice(0, n).map(({ t, w }, i) => (
          <li key={t.id}>
            <Link to={`/community/cosmetics/${t.id}`} className="relative flex items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
              <motion.span initial={{ width: 0 }} animate={{ width: `${(w / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.02 }} className="absolute bottom-0 left-2 h-[2px] rounded-full bg-akz/25" />
              <span className="relative w-6 text-right text-xs font-bold tabular-nums text-white/40">{i + 1}</span>
              <img src={t.bild} alt="" loading="lazy" className="relative h-9 w-9 rounded-lg object-contain" style={{ background: seltenVon(t.selten).b }} />
              <span className="relative min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{t.name}</span><span className="block truncate text-[11px]" style={{ color: seltenVon(t.selten).a }}>{t.typName}</span></span>
              <span className="relative text-sm font-black tabular-nums text-white">{w.toLocaleString('en')}</span>
            </Link>
          </li>
        ))}
      </ol>
      {liste.length > n && <button type="button" onClick={() => setN((x) => x + 15)} className="mt-2 text-sm font-semibold text-akz hover:text-white">More</button>}
    </Flaeche>
  );
}
