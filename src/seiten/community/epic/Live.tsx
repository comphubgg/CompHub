import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Abschnitt, Flaeche, Kennzahl, Laedt, Leer, Marke, Segment, SeitenKopf, Zaehler } from '../../../ds/Bausteine';
import { LinkKopieren } from '../Bausteine';
import { useAblage } from '../kosmetik/daten';
import { AblageHinweis } from '../kosmetik/Raster';
import { kurz, poolAbo, poolLaden, poolStand, type Insel } from './daten';
import { MiniVerlauf, Verlauf } from './Diagramm';
import { creatorsAus, useInselInfos, useRangliste, type Creator, type Eintrag } from './fn';
import { AnteilLinie, InselBild, InselKarte, inselPfad, QuellenZeile, vonWem } from './Teile';

/*
 * Live-Seiten (Design-System 3.0, neu komponiert 28.11.2026). Zahlen "jetzt" und Thumbnails kommen von der Seite (/api/fn-entdecken,
 * /api/fn-inseln - siehe epic/fn.ts), MIT Epics eigenen Modi; Verlauf und Retention einer einzelnen Insel aus Epics Fortnite Data API.
 *   Player Count   EINE grosse Zahl (alle Spieler jetzt), Epic gegen Creator-Inseln, Verlauf der groessten, Treppchen mit Bildern, Rangliste
 *   Discover       Bilderwand wie der Discover-Schirm im Spiel: #1 als Buehne, #2-#5 daneben, "Climbing", dann alle als gleiche Karten
 *   Creators       Spieler je Creator zusammengezaehlt (Epic steht wie in Wirklichkeit vorn), Liste + Schaukasten des gewaehlten Creators
 *   Creative       Werkzeug zum Stoebern: Filter links (Suche, Code, Tags, Sortierung), Karten rechts
 *   Insel          eigene Datei: epic/Insel.tsx
 */

const FARBEN = ['#5eead4', '#38bdf8', '#a78bfa', '#f59e0b', '#f472b6', '#34d399', '#fb7185', '#facc15'];
type Sicht = 'alle' | 'epic' | 'creator';
const SICHT: Array<{ k: Sicht; titel: string }> = [{ k: 'alle', titel: 'Everything' }, { k: 'epic', titel: 'Epic modes' }, { k: 'creator', titel: 'Creator islands' }];
const nachSicht = (l: Eintrag[], s: Sicht) => (s === 'alle' ? l : l.filter((e) => (s === 'epic' ? e.epic : !e.epic)));
const prozent = (teil: number, ganz: number) => (ganz ? `${((teil / ganz) * 100).toFixed(teil / ganz < 0.1 ? 1 : 0)}%` : '');

/* ================================================================== Player Count */
export function Spielerzahl() {
  const r = useRangliste();
  const [sicht, setSicht] = useState<Sicht>('alle');
  const [n, setN] = useState(30);
  const summe = r.liste.reduce((s, e) => s + e.spieler, 0);
  const epic = r.liste.filter((e) => e.epic).reduce((s, e) => s + e.spieler, 0);
  const liste = nachSicht(r.liste, sicht);
  const teil = liste.reduce((s, e) => s + e.spieler, 0);
  const mitVerlauf = liste.slice(0, 8).filter((e) => e.serie.length > 2);
  const creators = useMemo(() => creatorsAus(r.liste).slice(0, 6), [r.liste]);
  const oben = new Set(liste.slice(0, 3).map((e) => e.code));
  // Ohne Stundenwerte zeigt die Buehne rechts die Plaetze 4-9 als Bilder; die Rangliste beginnt dann bei 10 (kein Bild doppelt)
  const ohneDiagramm = mitVerlauf.length < 2;
  const ab = ohneDiagramm ? 9 : 3;
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Player count" titel="Who plays what right now" rechts={<><Segment id="pc-sicht" wert={sicht} wahl={SICHT} onWahl={(k) => { setSicht(k); setN(30); }} /><LinkKopieren /></>} />

      <Flaeche fest className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col justify-between gap-8 p-7 lg:p-9">
            <div>
              <p className="ueber">Playing Fortnite right now</p>
              <p className="titel mt-2 text-7xl sm:text-8xl xl:text-[8.5rem]">{summe ? <Zaehler wert={summe} /> : '–'}</p>
              <QuellenZeile r={r} className="mt-2" />
            </div>
            <div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div className="h-full bg-akz" initial={{ width: 0 }} animate={{ width: summe ? `${(epic / summe) * 100}%` : 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                <motion.div className="h-full bg-violet-400/80" initial={{ width: 0 }} animate={{ width: summe ? `${((summe - epic) / summe) * 100}%` : 0 }} transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Kennzahl label="Epic's own modes" wert={epic || null} format={kurz} unter={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-akz" />{prozent(epic, summe) || 'Battle Royale, Reload …'}</span>} />
                <Kennzahl label="Creator-made islands" wert={summe - epic || null} format={kurz} unter={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" />{prozent(summe - epic, summe) || 'UEFN and Creative'}</span>} />
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.06] p-6 lg:border-l lg:border-t-0 lg:p-7">
            <div className="mb-3 flex items-baseline justify-between gap-3"><p className="text-sm font-bold text-white">{mitVerlauf.length >= 2 ? `The ${mitVerlauf.length} biggest · last 24 hours` : 'Places 4 – 9'}</p><p className="text-xs text-white/40">{mitVerlauf.length >= 2 ? 'players per hour, stacked' : 'players right now'}</p></div>
            {mitVerlauf.length >= 2 ? (
              <>
                <div className="pb-5"><Verlauf gestapelt hoehe={290} serien={[...mitVerlauf].reverse().map((e) => ({ name: e.titel, farbe: FARBEN[mitVerlauf.indexOf(e)], punkte: e.serie }))} /></div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">{mitVerlauf.map((e, k) => <Link key={e.code} to={inselPfad(e.code)} className="flex min-w-0 items-center gap-1.5 text-white/60 hover:text-white"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FARBEN[k] }} /><span className="max-w-[13rem] truncate">{e.titel}</span></Link>)}</div>
              </>
            ) : (
              /* Ohne Stundenwerte: die sechs groessten als Bilder statt eines leeren Diagramms */
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {liste.slice(3, 9).map((e, k) => (
                  <Link key={e.code} to={inselPfad(e.code)} className="group relative aspect-video overflow-hidden rounded-2xl">
                    <InselBild code={e.code} bild={e.bild} className="absolute inset-0 transition duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                    <span className="titel absolute left-2.5 top-1.5 text-2xl">{k + 4}</span>
                    <p className="absolute inset-x-2.5 bottom-2 truncate text-xs font-bold text-white">{e.titel} <span className="zahl font-semibold text-akz">{kurz(e.spieler)}</span></p>
                  </Link>
                ))}
                {!liste.length && <div className="col-span-full"><Laedt text="Counting players" /></div>}
              </div>
            )}
          </div>
        </div>
      </Flaeche>

      {liste.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {liste.slice(0, 3).map((e, k) => (
            <InselKarte key={e.code} e={e} platz={k + 1} verz={k * 0.06} unten={
              <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-3">
                <div><p className="titel text-4xl text-akz"><Zaehler wert={e.spieler} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">playing · {prozent(e.spieler, summe)} of everyone</p></div>
                <div className="w-28 shrink-0"><MiniVerlauf punkte={e.serie} farbe={FARBEN[k]} hoehe={34} /></div>
              </div>
            } />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Flaeche fest className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-5"><h2 className="titel text-3xl">Ranking</h2><p className="text-xs text-white/40">{liste.length.toLocaleString('en')} {sicht === 'epic' ? 'Epic modes' : sicht === 'creator' ? 'creator islands' : 'modes and islands'} · {kurz(teil)} players</p></div>
          <ol>
            {liste.slice(ab, n).map((e, k) => (
              <li key={e.code} className="border-t border-white/[0.05]">
                <Link to={inselPfad(e.code)} className="group relative flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.035] sm:gap-4 sm:px-5">
                  <AnteilLinie anteil={e.spieler / (liste[0]?.spieler || 1)} />
                  <span className="zahl w-7 shrink-0 text-right text-sm font-bold text-white/40">{k + ab + 1}</span>
                  <span className="relative h-11 w-20 shrink-0 overflow-hidden rounded-lg"><InselBild code={e.code} bild={e.bild} className="absolute inset-0" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white group-hover:text-akz">{e.titel}</span><span className="block truncate text-xs text-white/45">{vonWem(e)}</span></span>
                  <span className="hidden w-28 shrink-0 md:block"><MiniVerlauf punkte={e.serie} farbe="rgb(45 212 191)" hoehe={26} /></span>
                  <span className="zahl hidden w-14 shrink-0 text-right text-xs text-white/40 sm:block">{prozent(e.spieler, summe)}</span>
                  <span className="zahl w-16 shrink-0 text-right text-base font-extrabold text-white sm:w-20">{kurz(e.spieler)}</span>
                </Link>
              </li>
            ))}
          </ol>
          {liste.length > n && <button type="button" onClick={() => setN((v) => v + 40)} className="w-full border-t border-white/[0.05] py-3.5 text-sm font-semibold text-akz transition hover:bg-white/[0.035]">Show more · {liste.length - n} left</button>}
          {!liste.length && <div className="border-t border-white/[0.05] px-5">{r.laedt ? <Laedt text="Counting players" /> : <p className="py-8 text-center text-sm text-white/45">Nothing in this view right now.</p>}</div>}
        </Flaeche>

        <div className="space-y-6 xl:sticky xl:top-32 xl:self-start">
          <Flaeche className="p-5" verz={0.05}>
            <div className="flex items-baseline justify-between"><h3 className="titel text-2xl">Biggest creators</h3><Link to="/community/creators" className="knopf-leer !text-xs">All <span aria-hidden>→</span></Link></div>
            <ol className="mt-3 space-y-1">
              {creators.map((c, k) => (
                <li key={c.name}><Link to={`/community/creators?c=${encodeURIComponent(c.name)}`} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                  <span className="zahl w-5 text-right text-xs font-bold text-white/40">{k + 1}</span>
                  <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md">{(() => { const i = c.inseln.find((x) => !oben.has(x.code)) ?? c.inseln[0]; return <InselBild code={i.code} bild={i.bild} className="absolute inset-0" />; })()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white group-hover:text-akz">{c.epic ? c.name : `@${c.name}`}</span><span className="block truncate text-[11px] text-white/40">{c.inseln.length} {c.epic ? 'mode' : 'island'}{c.inseln.length === 1 ? '' : 's'}</span></span>
                  <span className="zahl text-sm font-extrabold text-white">{kurz(c.spieler)}</span>
                </Link></li>
              ))}
              {!creators.length && <li className="py-4 text-sm text-white/40">{r.laedt ? 'Loading …' : 'No creator islands in the list.'}</li>}
            </ol>
          </Flaeche>
          <Flaeche className="p-5 text-xs leading-relaxed text-white/50" verz={0.1}>
            <p className="text-sm font-bold text-white">How this is counted</p>
            <p className="mt-2">Players in each mode and island at this moment, as Fortnite's Discover shows them – Epic's own modes included. The big number is everything on Discover added up.</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1"><Link to="/community/discover" className="knopf-leer !text-xs">Discover with pictures →</Link><Link to="/community/rotation" className="knopf-leer !text-xs">Map rotation →</Link></div>
          </Flaeche>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== Discover */
/** Wachstum gegen den Wert vor drei Stunden (nur mit Stundenverlauf). */
function wachstum(e: Eintrag): number | null {
  const alt = [...e.serie].reverse().find((p) => p.t <= Date.now() - 2.5 * 36e5);
  return alt && alt.v >= 50 ? e.spieler / alt.v - 1 : null;
}
export function Entdecken() {
  const r = useRangliste();
  const [sicht, setSicht] = useState<Sicht>('alle');
  const [q, setQ] = useState('');
  const [n, setN] = useState(36);
  const s = q.trim().toLowerCase();
  const liste = nachSicht(r.liste, sicht).filter((e) => !s || `${e.titel} ${e.creator} ${e.code}`.toLowerCase().includes(s));
  const rang = useMemo(() => new Map(r.liste.map((e, k) => [e.code, k + 1])), [r.liste]);
  const steigt = useMemo(() => liste.filter((e) => e.spieler >= 300).map((e) => ({ e, w: wachstum(e) })).filter((x): x is { e: Eintrag; w: number } => x.w !== null && x.w > 0.05).sort((a, b) => b.w - a.w).slice(0, 6), [liste]);
  const buehne = !s && liste.length >= 5;
  const erste = liste[0];
  const rest = buehne ? liste.slice(5) : liste;
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Discover" titel="What everyone is playing" text="Fortnite's Discover screen, ranked by players right now – every mode and island with its picture."
        rechts={<><input value={q} onChange={(e) => { setQ(e.target.value); setN(36); }} placeholder="Search islands or creators" className="eingabe w-56" /><Segment id="disc-sicht" wert={sicht} wahl={SICHT} onWahl={(k) => { setSicht(k); setN(36); }} /></>} />
      <QuellenZeile r={r} />
      {r.laedt && !liste.length && <Laedt text="Loading Discover" />}

      {buehne && erste && (
        <div className="grid gap-4 lg:grid-cols-4">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="fl-fest fl-klick group overflow-hidden lg:col-span-2 lg:row-span-2">
            <Link to={inselPfad(erste.code)} className="relative block h-full min-h-[300px] sm:min-h-[380px]">
              <InselBild code={erste.code} bild={erste.bild} className="absolute inset-0 transition duration-[1200ms] group-hover:scale-[1.04]" />
              <div className="absolute inset-0 bg-gradient-to-t from-fl via-fl/35 to-transparent" />
              <div className="absolute left-5 top-5"><Marke ton="gold">#1 most played</Marke></div>
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-6 lg:p-8">
                <div className="min-w-0"><p className="text-sm font-semibold text-white/65">{vonWem(erste)}</p><h2 className="titel mt-1 text-5xl lg:text-7xl">{erste.titel}</h2></div>
                <div className="text-right"><p className="titel text-6xl text-akz lg:text-7xl"><Zaehler wert={erste.spieler} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">playing right now</p></div>
              </div>
            </Link>
          </motion.div>
          {liste.slice(1, 5).map((e, k) => <InselKarte key={e.code} e={e} platz={k + 2} verz={0.08 + k * 0.05} />)}
        </div>
      )}

      {buehne && steigt.length >= 3 && (
        <Abschnitt titel="Climbing right now" ueber="vs. three hours ago">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
            {steigt.map(({ e, w }, k) => <InselKarte key={e.code} e={e} klein platz={rang.get(e.code)} verz={k * 0.04} unten={<p className="zahl mt-1.5 text-xs font-bold text-emerald-300">▲ {Math.round(w * 100)}% <span className="font-medium text-white/40">in 3 h</span></p>} />)}
          </div>
        </Abschnitt>
      )}

      {rest.length > 0 && (
        <Abschnitt titel={s ? `${liste.length} results` : sicht === 'epic' ? "Epic's modes" : sicht === 'creator' ? 'Creator islands' : 'Everything on Discover'} rechts={<span className="text-xs text-white/40">{liste.length.toLocaleString('en')} in total</span>}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {rest.slice(0, n).map((e, k) => <InselKarte key={e.code} e={e} klein platz={rang.get(e.code)} verz={Math.min(k % 12, 11) * 0.03} />)}
          </div>
          {rest.length > n && <div className="mt-6 text-center"><button type="button" onClick={() => setN((v) => v + 36)} className="knopf">Show more · {rest.length - n} left</button></div>}
        </Abschnitt>
      )}
      {!r.laedt && !liste.length && <Leer text={s ? `Nothing on Discover matches "${q}".` : 'Nothing in this view right now.'}><Link to="/community/creative" className="knopf-leer">Open an island by its code →</Link></Leer>}
    </div>
  );
}

/* ================================================================== Creators */
export function Creators() {
  const r = useRangliste();
  const folge = useAblage<string[]>('creators-folgen', []);
  const [reiter, setReiter] = useState<'alle' | 'folge'>('alle');
  const [suche, setSuche] = useState(''); const [sort, setSort] = useState<'spieler' | 'maps' | 'name'>('spieler'); const [n, setN] = useState(40);
  const creators = useMemo(() => creatorsAus(r.liste), [r.liste]);
  const rang = useMemo(() => new Map(creators.map((c, k) => [c.name, k + 1])), [creators]);
  const summe = creators.reduce((s, c) => s + c.spieler, 0);
  const [wahl, setWahl] = useState<string | null>(() => new URLSearchParams(window.location.search).get('c'));
  const liste = creators.filter((c) => (reiter === 'alle' || folge.wert.includes(c.name)) && c.name.toLowerCase().includes(suche.trim().toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'maps' ? b.inseln.length - a.inseln.length || b.spieler - a.spieler : b.spieler - a.spieler));
  const gewaehlt = creators.find((c) => c.name === wahl) ?? liste[0] ?? null;
  const folgen = (name: string) => folge.setzen((v) => (v.includes(name) ? v.filter((x) => x !== name) : [...v, name]));
  const stern = (c: Creator, gross = false) => {
    const an = folge.wert.includes(c.name);
    return <button type="button" title={an ? 'Unfollow' : 'Follow'} onClick={(e) => { e.stopPropagation(); folgen(c.name); }} className={gross ? (an ? 'knopf-prim' : 'knopf') : `shrink-0 rounded-lg px-2 py-1 text-lg leading-none transition ${an ? 'text-amber-300' : 'text-white/25 hover:text-white'}`}>{gross ? (an ? '★ Following' : '☆ Follow') : an ? '★' : '☆'}</button>;
  };
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Creators" titel="Who makes what people play" rechts={<AblageHinweis ort={folge.ort} />}>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <Kennzahl label="Creators on Discover" wert={creators.length || null} />
          <Kennzahl label="Players right now" wert={summe || null} format={kurz} ton="akz" />
          <Kennzahl label="Islands and modes" wert={r.liste.length || null} />
          <Kennzahl label="You follow" wert={folge.wert.length} />
        </div>
      </SeitenKopf>
      <QuellenZeile r={r} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="order-2 min-w-0 space-y-4 xl:order-1">
          <div className="flex flex-wrap items-center gap-2">
            <Segment id="creator-reiter" wert={reiter} wahl={[{ k: 'alle', titel: 'All creators' }, { k: 'folge', titel: `Following ${folge.wert.length}` }]} onWahl={setReiter} />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a creator" className="eingabe w-48" />
            <div className="sm:ml-auto"><Segment klein id="creator-sort" wert={sort} wahl={[{ k: 'spieler', titel: 'Players' }, { k: 'maps', titel: 'Islands' }, { k: 'name', titel: 'A–Z' }]} onWahl={setSort} /></div>
          </div>
          <Flaeche fest className="overflow-hidden">
            <ol>
              {liste.slice(0, n).map((c) => {
                const an = gewaehlt?.name === c.name; const platz = rang.get(c.name) ?? 0;
                return (
                  <li key={c.name} className="border-t border-white/[0.05] first:border-0">
                    <div role="button" tabIndex={0} onClick={() => setWahl(c.name)} onKeyDown={(e) => { if (e.key === 'Enter') setWahl(c.name); }}
                      className={`relative flex cursor-pointer items-center gap-3 px-4 py-2.5 transition sm:gap-4 sm:px-5 ${an ? 'bg-akz/[0.08]' : 'hover:bg-white/[0.035]'}`}>
                      {an && <motion.span layoutId="creator-wahl" className="absolute inset-y-0 left-0 w-[3px] bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" />}
                      <AnteilLinie anteil={c.spieler / (creators[0]?.spieler || 1)} />
                      <span className={`titel w-8 shrink-0 text-right text-2xl ${platz === 1 ? 'text-amber-300' : platz <= 3 ? 'text-white' : 'text-white/35'}`}>{platz}</span>
                      <span className="relative h-11 w-20 shrink-0 overflow-hidden rounded-lg"><InselBild code={c.inseln[0].code} bild={c.inseln[0].bild} className="absolute inset-0" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{c.epic ? c.name : `@${c.name}`}</span><span className="block truncate text-xs text-white/45">{c.inseln.length} {c.epic ? 'mode' : 'island'}{c.inseln.length === 1 ? '' : 's'} · {c.inseln[0].titel}</span></span>
                      <span className="zahl hidden w-12 shrink-0 text-right text-xs text-white/40 sm:block">{prozent(c.spieler, summe)}</span>
                      <span className="zahl w-16 shrink-0 text-right text-base font-extrabold text-white">{kurz(c.spieler)}</span>
                      {stern(c)}
                    </div>
                  </li>
                );
              })}
            </ol>
            {liste.length > n && <button type="button" onClick={() => setN((v) => v + 40)} className="w-full border-t border-white/[0.05] py-3.5 text-sm font-semibold text-akz transition hover:bg-white/[0.035]">Show more · {liste.length - n} left</button>}
            {!liste.length && <div className="px-5">{r.laedt ? <Laedt text="Adding up players per creator" /> : <p className="py-8 text-center text-sm text-white/45">{reiter === 'folge' ? 'You don’t follow anyone yet – tap ☆ next to a creator.' : 'No creator matches.'}</p>}</div>}
          </Flaeche>
          <p className="text-xs text-white/35">Players = everyone currently in all of a creator's islands on Discover, added up. Epic Games counts with its own modes.</p>
        </div>

        {/* Schaukasten des gewaehlten Creators */}
        <div className="order-1 min-w-0 xl:sticky xl:top-32 xl:order-2 xl:self-start">
          <AnimatePresence mode="wait">
            {gewaehlt && (
              <motion.div key={gewaehlt.name} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fl-fest overflow-hidden">
                <div className="relative aspect-[16/8] overflow-hidden">
                  <InselBild code={gewaehlt.inseln[0].code} bild={gewaehlt.inseln[0].bild} className="absolute inset-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-fl via-fl/40 to-transparent" />
                  <div className="absolute left-4 top-4"><Marke ton={rang.get(gewaehlt.name) === 1 ? 'gold' : 'still'}>#{rang.get(gewaehlt.name)} creator</Marke></div>
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-5 pb-3">
                    <h2 className="titel min-w-0 truncate text-5xl">{gewaehlt.epic ? gewaehlt.name : `@${gewaehlt.name}`}</h2>
                    <div className="shrink-0 text-right"><p className="titel text-4xl text-akz"><Zaehler wert={gewaehlt.spieler} /></p><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">playing now</p></div>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {stern(gewaehlt, true)}
                    {!gewaehlt.epic && <a href={`https://www.fortnite.com/@${encodeURIComponent(gewaehlt.name)}`} target="_blank" rel="noreferrer" className="knopf">fortnite.com ↗</a>}
                    <span className="ml-auto text-xs text-white/45">{prozent(gewaehlt.spieler, summe)} of all players</span>
                  </div>
                  <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
                    {gewaehlt.inseln.slice(0, 30).map((e) => (
                      <li key={e.code}><Link to={inselPfad(e.code)} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.04]">
                        <span className="relative h-11 w-20 shrink-0 overflow-hidden rounded-lg"><InselBild code={e.code} bild={e.bild} className="absolute inset-0" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white group-hover:text-akz">{e.titel}</span><span className="block truncate font-mono text-[11px] text-white/35">{e.epic ? 'Epic mode' : e.code}</span></span>
                        <span className="zahl text-sm font-extrabold text-white">{kurz(e.spieler)}</span>
                      </Link></li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== Creative - stoebern */
interface Stoeber { code: string; titel: string; creator: string; bild: string | null; epic: boolean; jetzt: number | null; tag: number | null; woche: number | null; tags: string[]; art?: string }
type Sortierung = 'jetzt' | 'tag' | 'woche' | 'name';
export function Creative() {
  const r = useRangliste();
  const geh = useNavigate();
  const [, neu] = useState(0);
  const [mehr, setMehr] = useState(() => poolStand().gestartet);
  useEffect(() => { if (!mehr) return undefined; const ab = poolAbo(() => neu((x) => x + 1)); if (!poolStand().gestartet) void poolLaden(); return ab; }, [mehr]);
  const pool = poolStand();
  const [suche, setSuche] = useState(''); const [ohneEpic, setOhneEpic] = useState(false); const [tag, setTag] = useState('alle');
  const [art, setArt] = useState('alle'); const [sort, setSort] = useState<Sortierung>('jetzt'); const [code, setCode] = useState(''); const [n, setN] = useState(40);
  // Rangliste (Spieler jetzt, Bild) + bei Bedarf Epics oeffentliche Liste (Tags, Engine, Spitzen) zu EINER Liste zusammenfuehren
  const alle = useMemo(() => {
    const m = new Map<string, Stoeber>();
    for (const e of r.liste) m.set(e.code, { code: e.code, titel: e.titel, creator: e.creator, bild: e.bild, epic: e.epic, jetzt: e.spieler, tag: e.serie.length ? Math.max(e.spieler, ...e.serie.map((p) => p.v)) : null, woche: null, tags: e.tags });
    if (mehr) for (const i of pool.inseln) {
      if (i.code.startsWith('modus:')) continue;
      const w = pool.werte.get(i.code); const da = m.get(i.code);
      m.set(i.code, { code: i.code, titel: da?.titel ?? i.titel, creator: da?.creator || i.creator, bild: da?.bild ?? i.bild ?? null, epic: da?.epic ?? i.epic, jetzt: da?.jetzt ?? w?.jetzt ?? null, tag: da?.tag ?? w?.tag ?? null, woche: w?.woche ?? null, tags: i.tags.length ? i.tags : da?.tags ?? [], art: i.erstelltIn });
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.liste, mehr, pool.inseln.length, pool.geprueft]);
  const tags = useMemo(() => { const m = new Map<string, number>(); for (const i of alle) for (const t of i.tags) m.set(t, (m.get(t) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t); }, [alle]);
  const arten = useMemo(() => [...new Set(alle.map((i) => i.art).filter(Boolean) as string[])], [alle]);
  const q = suche.trim().toLowerCase();
  const wert = (i: Stoeber) => (sort === 'tag' ? i.tag : sort === 'woche' ? i.woche : i.jetzt) ?? -1;
  const liste = alle.filter((i) => (!ohneEpic || !i.epic) && (tag === 'alle' || i.tags.includes(tag)) && (art === 'alle' || i.art === art) && (!q || `${i.titel} ${i.creator} ${i.code} ${i.tags.join(' ')}`.toLowerCase().includes(q)))
    .sort((a, b) => (sort === 'name' ? a.titel.localeCompare(b.titel) : wert(b) - wert(a) || (b.jetzt ?? 0) - (a.jetzt ?? 0)));
  const codeOk = /^\d{4}-\d{4}-\d{4}$/.test(code.trim());
  const filterAn = !!q || ohneEpic || tag !== 'alle' || art !== 'alle';
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Creative" titel="Browse islands" text="Search every island on Discover, filter by tag, or jump straight to any island with its code." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Flaeche className="space-y-5 p-5 lg:sticky lg:top-32 lg:self-start">
          <form onSubmit={(e) => { e.preventDefault(); if (codeOk) geh(inselPfad(code.trim())); }}>
            <label className="ueber !tracking-[0.25em]" htmlFor="insel-code">Open by island code</label>
            <div className="mt-2 flex gap-2">
              <input id="insel-code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d-]/g, '').slice(0, 14))} placeholder="1234-5678-9012" className="eingabe min-w-0 flex-1 font-mono" />
              <button type="submit" disabled={!codeOk} className="knopf-prim !px-4">Open</button>
            </div>
          </form>
          <div>
            <label className="ueber !tracking-[0.25em]" htmlFor="insel-suche">Search</label>
            <input id="insel-suche" value={suche} onChange={(e) => { setSuche(e.target.value); setN(40); }} placeholder="Island, creator or tag" className="eingabe mt-2 w-full" />
          </div>
          <div>
            <p className="ueber !tracking-[0.25em]">Sort by</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([['jetzt', 'Players now'], ['tag', 'Peak 24h'], ...(mehr ? [['woche', 'Peak 7 days'] as const] : []), ['name', 'Name']] as Array<readonly [Sortierung, string]>).map(([k, t]) => <button key={k} type="button" onClick={() => setSort(k)} className={`chip ${sort === k ? 'chip-an' : ''}`}>{t}</button>)}
            </div>
          </div>
          {tags.length > 0 && (
            <div>
              <p className="ueber !tracking-[0.25em]">Tags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{['alle', ...tags].map((t) => <button key={t} type="button" onClick={() => { setTag(t); setN(40); }} className={`chip capitalize ${tag === t ? 'chip-an' : ''}`}>{t === 'alle' ? 'All' : t}</button>)}</div>
            </div>
          )}
          {arten.length > 1 && (
            <div>
              <p className="ueber !tracking-[0.25em]">Made in</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{['alle', ...arten].map((a) => <button key={a} type="button" onClick={() => setArt(a)} className={`chip ${art === a ? 'chip-an' : ''}`}>{a === 'alle' ? 'All' : a}</button>)}</div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
            <button type="button" onClick={() => setOhneEpic((v) => !v)} className={`chip ${ohneEpic ? 'chip-an' : ''}`}>{ohneEpic ? '✓ ' : ''}Hide Epic's modes</button>
            {filterAn && <button type="button" onClick={() => { setSuche(''); setOhneEpic(false); setTag('alle'); setArt('alle'); }} className="chip">Clear filters</button>}
          </div>
        </Flaeche>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/55"><span className="zahl font-bold text-white">{liste.length.toLocaleString('en')}</span> island{liste.length === 1 ? '' : 's'}{filterAn ? ' match' : ''}</p>
            <QuellenZeile r={r} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5">
            {liste.slice(0, n).map((i, k) => (
              <InselKarte key={i.code} klein verz={Math.min(k % 10, 9) * 0.03} e={{ code: i.code, titel: i.titel, bild: i.bild, creator: i.creator, spieler: i.jetzt ?? 0, epic: i.epic, serie: [], tags: i.tags }}
                unten={<p className="zahl mt-1.5 flex justify-between gap-2 text-[11px] text-white/40"><span>24h peak <b className="font-semibold text-white/75">{kurz(i.tag)}</b></span>{i.woche !== null && <span>7d <b className="font-semibold text-white/75">{kurz(i.woche)}</b></span>}</p>} />
            ))}
          </div>
          {r.laedt && !liste.length && <Laedt text="Loading islands" />}
          {!r.laedt && !liste.length && <Leer text="No island matches these filters." />}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {liste.length > n && <button type="button" onClick={() => setN((v) => v + 40)} className="knopf">Show more · {liste.length - n} left</button>}
            {!mehr ? <button type="button" onClick={() => setMehr(true)} className="knopf">Add islands from Epic's public list (tags, 7-day peaks)</button>
              : pool.laedt ? <span className="text-xs text-white/45">Loading Epic's public list … {pool.geprueft.toLocaleString('en')} islands checked</span>
                : <button type="button" onClick={() => void poolLaden(2)} className="knopf">Load 200 more from Epic's public list</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Insel-Detail steht seit 28.11.2026 in einer eigenen Datei (epic/Insel.tsx) - hier nur weitergereicht. */
export { InselDetail } from './Insel';
