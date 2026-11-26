import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { DatenFehlen, LinkKopieren, restText, useHubDatei, useJetzt } from '../Bausteine';
import { Laedt, TEAL, Ueberschrift } from '../Teile';
import { auftritte, datumKurz, holen, QUELLEN, seltenVon, tageSeit, useAblage, useShop, useTeile, type Teil } from './daten';
import { AblageHinweis, Auswahl, Bereich, Kachel, Schalter } from './Raster';

/*
 * Weitere Kosmetik-Seiten der Spezifikation:
 *   New in the files  (Punkt 10 "Leaks")  fortnite-api.com/v2/cosmetics/new - was mit dem letzten Patch in die Spieldateien kam, dazu alles, was
 *                     in den letzten 60 Tagen hinzukam, nach Datum gruppiert. Stufe "Released" (schon im Shop) / "Not released yet" (nur in den Dateien).
 *   Free Cosmetics    (Punkt 13) redaktionell - /hub-daten/gratis.json, "Mark as completed" pro Konto/Browser
 *   Jam Tracks        (Punkt 14) Jam Tracks im heutigen Shop (v2/shop) + ganze Bibliothek (v2/cosmetics/tracks) mit Suche, Genre, Schwierigkeit
 *   Cosmetic Stats    (Punkt 12) aus dem Shop-Verlauf: laengste Wartezeit, meiste Shop-Tage, meiste Auftritte, Rueckkehrer von heute
 *   Most Used         (Punkt 11) Epic veroeffentlicht keine Nutzungszahlen -> ehrliche Karte
 */

/* ---------------------------------------------- New in the files */
interface Neu { date: string; build: string; previousBuild: string; items: Record<string, unknown[] | null> }
export function NeuInDateien() {
  const [neu, setNeu] = useState<Neu | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => { holen<Neu>('/v2/cosmetics/new').then(setNeu).catch((e) => setFehler((e as Error).message)); }, []);
  const { teile, laedt } = useTeile(['br', 'track']);
  const [tage, setTage] = useState('30');
  const [stufe, setStufe] = useState('alle');
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
  const unveroeffentlicht = patch.filter((t) => !t.shop.length).length;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="New in the files" farbe={TEAL}
        text="Cosmetics that were added to Fortnite's game files with the latest updates – some are already out, others haven't been released yet." rechts={<LinkKopieren />} />
      {fehler && <Glas className="p-6 text-sm text-white/60">The list couldn't be loaded ({fehler}).</Glas>}
      {neu && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[['Latest update', neu.build.replace(/^\+\+Fortnite\+Release-/, '').replace(/-CL-\d+$/, ''), '#5eead4'], ['Compared with', neu.previousBuild.replace(/^\+\+Fortnite\+Release-/, '').replace(/-CL-\d+$/, ''), '#c4b5fd'],
            ['New items', String(patch.length), '#fde047'], ['Not released yet', laedt ? '…' : String(unveroeffentlicht), '#fda4af']].map(([k, v, f], i) => (
            <Glas key={k} className="p-5" verzoegerung={i * 0.05}>
              <p className="text-3xl font-black tabular-nums" style={{ color: f }}>{v}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p>
            </Glas>
          ))}
        </div>
      )}
      {laedt && <Laedt farbe={TEAL} text="Loading cosmetics …" />}
      {neu && patch.length > 0 && (
        <Bereich titel={<>With update {neu.build.replace(/^\+\+Fortnite\+Release-/, '').replace(/-CL-\d+$/, '')} <span className="text-sm font-semibold text-white/40">{datumKurz(neu.date)}</span></>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {patch.map((t, i) => <Kachel key={t.id} t={t} index={i} link={t.art !== 'instrument'} unten={<Stufe t={t} />} />)}
          </div>
        </Bereich>
      )}
      <Bereich titel="Added recently" rechts={
        <div className="flex flex-wrap gap-2">
          <Auswahl titel="Status" wert={stufe} setzen={setStufe} optionen={[['alle', 'All'], ['raus', 'Released'], ['nicht', 'Not released yet']]} />
          <Auswahl titel="Period" wert={tage} setzen={setTage} optionen={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['60', 'Last 60 days']]} />
        </div>
      }>
        {juengst.map(([tag, l], gi) => (
          <div key={tag} className="space-y-2">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(gi, 10) * 0.04 }} className="text-sm font-bold text-white/70">{datumKurz(tag)} <span className="font-semibold text-white/35">· {l.length} items</span></motion.p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
              {l.slice(0, 40).map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<Stufe t={t} />} />)}
            </div>
            {l.length > 40 && <p className="text-xs text-white/35">+{l.length - 40} more from this day – see <Link to="/community/cosmetics" className="text-teal-200">Cosmetics</Link> sorted by newest.</p>}
          </div>
        ))}
        {!laedt && !juengst.length && <Glas className="p-8 text-center text-sm text-white/45">Nothing in this period.</Glas>}
      </Bereich>
      <p className="text-[11px] text-white/30">Data: fortnite-api.com, which reads the public game files after every update. Items that aren't released yet can still change or never come out.</p>
    </div>
  );
}
function Stufe({ t }: { t: Teil }) {
  return t.shop.length
    ? <p className="mt-1 text-[10px] font-semibold text-emerald-300/80">Released · {datumKurz(t.shop[0])}</p>
    : <p className="mt-1 text-[10px] font-semibold text-rose-300/80">Not released yet</p>;
}

/* ---------------------------------------------- Free Cosmetics */
interface Gratis { id: string; titel: string; text: string; bis?: string; ab?: string; bild?: string; quelle?: string; teile?: string[] }
export function GratisKosmetik() {
  const { daten, status } = useHubDatei<{ stand?: string; eintraege: Gratis[] }>('gratis.json');
  const erledigt = useAblage<string[]>('gratis-erledigt', []);
  const [zeigen, setZeigen] = useState(false);
  const jetzt = useJetzt();
  const { teile } = useTeile(['br']);
  const liste = (daten?.eintraege ?? []).filter((e) => !e.bis || Date.parse(e.bis) > jetzt).filter((e) => zeigen || !erledigt.wert.includes(e.id))
    .sort((a, b) => (a.bis ? Date.parse(a.bis) : Infinity) - (b.bis ? Date.parse(b.bis) : Infinity));
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Free cosmetics" farbe={TEAL} text="Everything you can unlock for free right now – and how long you've got left." rechts={<AblageHinweis ort={erledigt.ort} />} />
      {status === 'fehlt' ? (
        <DatenFehlen titel="The free-rewards list is written by hand" text={<>Epic doesn't publish one list of free rewards – they come from quests, Twitch drops, events and promotions. Our editors keep them in <code className="text-teal-200">/hub-daten/gratis.json</code>; as soon as it's there, the cards with countdowns and "Mark as completed" appear here.<pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-3 text-[11px] text-white/60">{JSON.stringify({ stand: '2026-11-26', eintraege: [{ id: 'winterfest-1', titel: '…', text: 'What to do', bis: '2026-12-31T14:00:00Z', quelle: 'https://…', teile: ['CID_…'] }] }, null, 2)}</pre></>} braucht={['Editorial list', 'End date per reward', 'Cosmetic IDs (optional)']} />
      ) : (
        <>
          <div className="flex items-center gap-3"><Schalter titel="Show completed" an={zeigen} setzen={setZeigen} /><span className="text-xs text-white/40">{erledigt.wert.length} completed</span></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {liste.map((e, i) => {
              const fertig = erledigt.wert.includes(e.id);
              const zu = (e.teile ?? []).map((id) => teile.find((t) => t.id.toLowerCase() === id.toLowerCase())).filter(Boolean) as Teil[];
              return (
                <Glas key={e.id} className={`p-5 ${fertig ? 'opacity-60' : ''}`} verzoegerung={i * 0.04}>
                  <div className="flex gap-4">
                    {(e.bild || zu[0]?.bild) && <img src={e.bild ?? zu[0].bild} alt="" className="h-20 w-20 shrink-0 rounded-xl object-contain" style={{ background: `radial-gradient(circle at 50% 20%, ${seltenVon(zu[0]?.selten ?? 'rare').a}55, #05070d)` }} />}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-extrabold text-white">{e.titel}</h3>
                      {e.bis && <p className="text-xs font-semibold text-amber-200/80">{restText(Date.parse(e.bis) - jetzt)} left · ends {datumKurz(e.bis)}</p>}
                      <p className="mt-1.5 text-sm leading-relaxed text-white/60">{e.text}</p>
                    </div>
                  </div>
                  {zu.length > 1 && <div className="mt-3 flex gap-1.5">{zu.slice(1, 6).map((t) => <Link key={t.id} to={`/community/cosmetics/${t.id}`}><img src={t.bild} alt={t.name} title={t.name} className="h-10 w-10 rounded-lg object-contain" style={{ background: seltenVon(t.selten).b }} /></Link>)}</div>}
                  <div className="mt-4 flex items-center justify-between">
                    {e.quelle ? <a href={e.quelle} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-200 hover:text-white">Source ↗</a> : <span />}
                    <button type="button" onClick={() => erledigt.setzen((v) => (fertig ? v.filter((x) => x !== e.id) : [...v, e.id]))}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold ${fertig ? 'bg-emerald-400 text-[#06080f]' : 'border border-white/10 text-white/75 hover:text-white'}`}>{fertig ? '✓ Completed' : 'Mark as completed'}</button>
                  </div>
                </Glas>
              );
            })}
          </div>
          {!liste.length && <Glas className="p-8 text-center text-sm text-white/45">{zeigen ? 'No free rewards right now.' : 'All done – nothing left to claim.'}</Glas>}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------- Jam Tracks */
const SCHWIERIG: Array<[string, string]> = [['vocals', 'Vocals'], ['guitar', 'Lead'], ['bass', 'Bass'], ['drums', 'Drums']];
export function JamTracks() {
  const shop = useShop();
  const { teile, laedt } = useTeile(['track']);
  const [roh, setRoh] = useState<Map<string, Record<string, number>>>(new Map());
  useEffect(() => { holen<Array<{ id: string; difficulty?: Record<string, number> }>>('/v2/cosmetics/tracks').then((l) => setRoh(new Map(l.map((x) => [x.id, x.difficulty ?? {}])))).catch(() => {}); }, []);
  const imShop = useMemo(() => shop.angebote.flatMap((a) => a.teile.filter((t) => t.art === 'track').map((t) => ({ t, preis: a.preis, bis: a.bis }))), [shop.angebote]);
  const [suche, setSuche] = useState(''); const [genre, setGenre] = useState('alle'); const [sort, setSort] = useState('neu');
  const genres = useMemo(() => [...new Set(teile.flatMap((t) => t.tags))].sort(), [teile]);
  const liste = useMemo(() => {
    const q = suche.toLowerCase();
    const l = teile.filter((t) => (genre === 'alle' || t.tags.includes(genre)) && (!q || `${t.name} ${t.text}`.toLowerCase().includes(q)));
    const f: Record<string, (a: Teil, b: Teil) => number> = { neu: (a, b) => b.hinzu.localeCompare(a.hinzu), titel: (a, b) => a.name.localeCompare(b.name), kuenstler: (a, b) => a.text.localeCompare(b.text),
      jahr: (a, b) => (b.jahr ?? 0) - (a.jahr ?? 0), bpm: (a, b) => (b.bpm ?? 0) - (a.bpm ?? 0) };
    return [...l].sort(f[sort]);
  }, [teile, suche, genre, sort]);
  const [mehr, setMehr] = useState(60);
  const heute = shop.datum ? new Date(shop.datum).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Jam Tracks" farbe={TEAL} text={<>The Jam Tracks in today's shop{heute ? ` (${heute})` : ''} and the whole Festival library – search by song, artist or genre.</>} rechts={<LinkKopieren />} />
      <Bereich titel={<>In the shop today <span className="text-sm font-semibold text-white/40">{imShop.length}</span></>}>
        {shop.laedt ? <Laedt farbe={TEAL} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {[...imShop].sort((a, b) => a.t.name.localeCompare(b.t.name)).slice(0, 40).map(({ t, preis }, i) => <Kachel key={t.id} t={t} index={i} unten={<p className="mt-1 text-[10px] text-white/45">{preis.toLocaleString('en')} V-Bucks</p>} />)}
          </div>
        )}
        {imShop.length > 40 && <p className="text-xs text-white/40">+{imShop.length - 40} more in the <Link to="/community/shop" className="text-teal-200">Item Shop</Link>.</p>}
      </Bereich>
      <Bereich titel={<>Library <span className="text-sm font-semibold text-white/40">{teile.length}</span></>} rechts={
        <div className="flex flex-wrap gap-2">
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Song or artist…" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
          <Auswahl titel="Genre" wert={genre} setzen={setGenre} optionen={[['alle', 'All'], ...genres.map((g): [string, string] => [g, g])]} />
          <Auswahl titel="Sort" wert={sort} setzen={setSort} optionen={[['neu', 'Newest'], ['titel', 'Title'], ['kuenstler', 'Artist'], ['jahr', 'Release year'], ['bpm', 'BPM']]} />
        </div>
      }>
        {laedt ? <Laedt farbe={TEAL} /> : (
          <Glas className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-white/40"><tr><th className="px-4 py-3">Song</th><th className="hidden px-3 md:table-cell">Year</th><th className="hidden px-3 md:table-cell">BPM</th><th className="hidden px-3 lg:table-cell">Length</th>{SCHWIERIG.map(([, t]) => <th key={t} className="hidden px-3 xl:table-cell">{t}</th>)}<th className="px-4 text-right">Added</th></tr></thead>
              <tbody>
                {liste.slice(0, mehr).map((t, i) => (
                  <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 30) * 0.01 }} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-2"><Link to={`/community/cosmetics/${t.id}`} className="flex items-center gap-3"><span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06] text-white/25">♪<img src={t.bild} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full object-cover" /></span><span className="min-w-0"><span className="block truncate font-bold text-white">{t.name}</span><span className="block truncate text-xs text-white/50">{t.text}{t.tags.length ? ` · ${t.tags.join(', ')}` : ''}</span></span></Link></td>
                    <td className="hidden px-3 tabular-nums text-white/60 md:table-cell">{t.jahr ?? '—'}</td>
                    <td className="hidden px-3 tabular-nums text-white/60 md:table-cell">{t.bpm ?? '—'}</td>
                    <td className="hidden px-3 tabular-nums text-white/60 lg:table-cell">{t.dauer ? `${Math.floor(t.dauer / 60)}:${String(t.dauer % 60).padStart(2, '0')}` : '—'}</td>
                    {SCHWIERIG.map(([k]) => { const n = roh.get(t.id)?.[k] ?? 0; return <td key={k} className="hidden px-3 xl:table-cell"><span className="flex gap-0.5">{Array.from({ length: 7 }, (_, j) => <span key={j} className={`h-2.5 w-1.5 rounded-sm ${j < n ? 'bg-teal-300' : 'bg-white/10'}`} />)}</span></td>; })}
                    <td className="px-4 text-right text-xs tabular-nums text-white/45">{datumKurz(t.hinzu)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {liste.length > mehr && <button type="button" onClick={() => setMehr((n) => n + 100)} className="w-full border-t border-white/5 py-3 text-sm font-semibold text-teal-200 hover:bg-white/[0.03]">Show more ({liste.length - mehr} left)</button>}
          </Glas>
        )}
      </Bereich>
      <p className="text-[11px] text-white/30">Data: fortnite-api.com. Festival's free daily rotation isn't in a public feed we can read from the browser – this page shows the Jam Tracks you can buy today.</p>
    </div>
  );
}

/* ---------------------------------------------- Cosmetic Stats */
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
  if (laedt) return <Laedt farbe={TEAL} text="Loading shop history …" />;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Cosmetic stats" farbe={TEAL} text="Leaderboards built from the complete item-shop history." rechts={<LinkKopieren />} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['Items ever in the shop', tabellen.mitShop], ['Longest wait right now', `${(tabellen.warten[0]?.w ?? 0).toLocaleString('en')} days`], ['Biggest comeback today', `${(tabellen.zurueck[0]?.w ?? 0).toLocaleString('en')} days`], ['Never sold (main types)', tabellen.nie]].map(([k, v], i) => (
          <Glas key={k as string} className="p-5" verzoegerung={i * 0.05}><p className="text-3xl font-black tabular-nums text-teal-200">{typeof v === 'number' ? v.toLocaleString('en') : v}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k as string}</p></Glas>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Tabelle titel="Longest wait in the shop" einheit="days since last seen" liste={tabellen.warten} />
        <Tabelle titel="Back today after the longest break" einheit="days away" liste={tabellen.zurueck} />
        <Tabelle titel="Most days in the shop" einheit="days" liste={tabellen.tage} />
        <Tabelle titel="Most shop appearances" einheit="times" liste={tabellen.auftr} />
      </div>
      <DatenFehlen titel="Most wishlisted & best rated" text="These need everyone's wishlists and reactions added up on our server. Your own wishlist and reactions already save to your account – the shared counter is the missing piece." braucht={['Server counter for wishlists', 'Server counter for reactions']} />
    </div>
  );
}
function Tabelle({ titel, einheit, liste }: { titel: string; einheit: string; liste: Array<{ t: Teil; w: number }> }) {
  const [n, setN] = useState(10);
  const max = Math.max(1, liste[0]?.w ?? 1);
  return (
    <Glas className="p-5">
      <div className="flex items-baseline justify-between"><h3 className="font-bold text-white">{titel}</h3><span className="text-xs text-white/40">{einheit}</span></div>
      <ol className="mt-3 space-y-1.5">
        {liste.slice(0, n).map(({ t, w }, i) => (
          <li key={t.id}>
            <Link to={`/community/cosmetics/${t.id}`} className="relative flex items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
              <motion.span initial={{ width: 0 }} animate={{ width: `${(w / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.02 }} className="absolute inset-y-0 left-0 bg-teal-300/[0.07]" />
              <span className="relative w-6 text-right text-xs font-bold tabular-nums text-white/40">{i + 1}</span>
              <img src={t.bild} alt="" loading="lazy" className="relative h-9 w-9 rounded-lg object-contain" style={{ background: seltenVon(t.selten).b }} />
              <span className="relative min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{t.name}</span><span className="block truncate text-[11px]" style={{ color: seltenVon(t.selten).a }}>{t.typName}</span></span>
              <span className="relative text-sm font-black tabular-nums text-white">{w.toLocaleString('en')}</span>
            </Link>
          </li>
        ))}
      </ol>
      {liste.length > n && <button type="button" onClick={() => setN((x) => x + 15)} className="mt-2 text-sm font-semibold text-teal-200 hover:text-white">More</button>}
    </Glas>
  );
}

/* ---------------------------------------------- Most Used */
export function MeistGenutzt() {
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Cosmetics" titel="Most used" farbe={TEAL} text="Which skins people actually wear." />
      <DatenFehlen titel="No honest source for this yet" text={<>Epic doesn't publish how often a cosmetic is used, and we won't guess. Two ways we can get real numbers: our tournament replays already contain every player's outfit, so a <b className="text-white/80">"Most used in pro play"</b> list can come straight from the replay parser – and later, opt-in lockers of signed-in users (<Link to="/community/locker" className="text-teal-200">My Locker</Link>).</>}
        braucht={['Replay parser: export cosmetic IDs per player', 'Aggregation per tournament / season']} />
    </div>
  );
}
