import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Countdown, Hinweis, LinkKopieren, restText, useHubDatei, useJetzt } from '../Bausteine';
import { Flaeche, Laedt, SeitenKopf } from '../../../ds/Bausteine';
import { useSaison } from '../SeitenSaison';
import { Zahl } from '../epic/Diagramm';
import { datumKurz, holen, REITER, seltenVon, useAblage, useShop, useTeile, type Teil } from './daten';
import { AblageHinweis, Bereich, Kachel, Schalter } from './Raster';

/*
 * Saison-Seiten mit dem, was es WIRKLICH gibt (Betreiber 27.11.2026: "Es soll immer etwas da sein"):
 *   Treasure Hunt   Saison 43 "Treasure Hunters": Key Art, Countdown, Battle-Pass-Belohnungen (frei/bezahlt aus den Spiel-Tags), Quest-Belohnungen,
 *                   Schatz-Kosmetik der Saison, Epics aktuelle News dazu, "Mark as found". Chancen pro Truhe erst mit dem Spieldaten-Export.
 *   Sprites         alle Sprite-Kosmetik aus den Dateien (Meisterschafts-Belohnungen, Sprite-Arten, Outfits ...), Owned / Mastered pro Teil
 *   Free Cosmetics  frei: Battle-Pass-Freistufe, Quest-Belohnungen, Events/Promos, Turnier-Belohnungen, heute gratis im Shop + redaktionelle Liste
 *   Most Used       ehrlicher Ersatz: am haeufigsten im Shop gesehen (Shop-Verlauf), klar so benannt
 * Quelle: fortnite-api.com /v2/cosmetics/br?responseFlags=6 (Spiel-Tags "Cosmetics.Source.*"), /v2/news/br, /v2/shop.
 */

const istTyp = (t: Teil, ...typen: string[]) => typen.includes(t.typ);
const HAUPT = ['outfit', 'backpack', 'pickaxe', 'glider', 'emote', 'contrail', 'wrap', 'shoe', 'sidekick', 'loadingscreen', 'spray', 'emoji'];
/** Aktuelle Saison = hoechste Saison-Nummer in den Daten. */
function useSaisonTeile() {
  const { teile, laedt, fehler } = useTeile(['br']);
  const nr = useMemo(() => Math.max(0, ...teile.map((t) => t.saisonNr ?? 0)), [teile]);
  return { teile, laedt, fehler, nr };
}
interface Motd { id: string; title: string; body: string; image?: string; tileImage?: string; hidden?: boolean }
function useNews() {
  const [n, setN] = useState<Motd[]>([]);
  useEffect(() => { holen<{ motds?: Motd[] }>('/v2/news/br').then((d) => setN((d?.motds ?? []).filter((m) => !m.hidden))).catch(() => {}); }, []);
  return n;
}

/** Knopf unter einer Kachel (Gefunden / Erhalten ...) - stoppt den Link der Kachel. */
function Merker({ an, setzen, text, textAn, farbe = 'bg-emerald-400' }: { an: boolean; setzen: () => void; text: string; textAn: string; farbe?: string }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setzen(); }}
      className={`mt-2 w-full rounded-lg py-1 text-[11px] font-bold transition ${an ? `${farbe} text-[#06080f]` : 'bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white'}`}>
      <motion.span key={String(an)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-block">{an ? textAn : text}</motion.span>
    </button>
  );
}
function Fortschritt({ hab, von, titel }: { hab: number; von: number; titel: string }) {
  const p = von ? (hab / von) * 100 : 0;
  return (
    <div className="min-w-[220px]">
      <div className="flex justify-between text-xs"><span className="font-semibold text-white/60">{titel}</span><span className="font-bold tabular-nums text-white">{hab} / {von}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-akz to-emerald-300" initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} /></div>
    </div>
  );
}
const RASTER = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';

/** Breites Saison-Bild (2:1, scharf) mit Text darueber. */
function Held({ bild, ueber, titel, unter, rechts, kinder }: { bild?: string; ueber: string; titel: string; unter?: ReactNode; rechts?: ReactNode; kinder?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative overflow-hidden rounded-3xl border border-white/10">
      <div className="relative aspect-[4/3] sm:aspect-[2/1] xl:aspect-[21/8]">
        {bild ? <motion.img src={bild} alt="" initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 h-full w-full object-cover object-center" />
          : <div className="absolute inset-0 bg-gradient-to-br from-akz/25 via-violet-500/10 to-transparent" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06080f]/80 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-6 p-6 md:p-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-akz">{ueber}</p>
            <h2 className="mt-1 text-4xl font-black tracking-tight text-white md:text-6xl">{titel}</h2>
            {unter && <div className="mt-2 max-w-2xl text-sm text-white/70">{unter}</div>}
            {kinder}
          </div>
          {rechts}
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================== Treasure Hunt */
interface Schatz { saison?: string; mechanik?: Array<{ titel: string; text: string }>; belohnungen: Array<{ id: string; name: string; typ?: string; chance?: number; einsIn?: number; bild?: string; cosmeticId?: string; quelle?: string }> }
export function Schatzsuche() {
  const { teile, laedt, nr } = useSaisonTeile();
  const { s } = useSaison();
  const { daten } = useHubDatei<Schatz>('schatzsuche.json');
  const gefunden = useAblage<string[]>('schatz-gefunden', []);
  const news = useNews();
  const [nurOffen, setNurOffen] = useState(false);
  const d = useMemo(() => {
    const dieSaison = teile.filter((t) => t.saisonNr === nr);
    const hat = (t: Teil, h: string) => (t.herkunft ?? []).some((x) => x === h || x.startsWith(`${h}.`));
    const bpFrei = teile.filter((t) => hat(t, `Season${nr}.BattlePass.Free`));
    const bpBezahlt = teile.filter((t) => !bpFrei.includes(t) && hat(t, `Season${nr}.BattlePass`));
    const quests = dieSaison.filter((t) => hat(t, 'QuestReward'));
    const schatz = dieSaison.filter((t) => /treasure|gold|pirate|captain|finders|keepers|loot|chest|map|buried|doubloon|tide/i.test(`${t.name} ${t.text} ${t.set ?? ''}`) && !bpFrei.includes(t) && !bpBezahlt.includes(t) && !quests.includes(t));
    const keyArt = dieSaison.find((t) => /KeyArt/i.test(t.id) && t.bildBreit) ?? dieSaison.find((t) => t.typ === 'loadingscreen' && t.bildBreit);
    return { bpFrei, bpBezahlt, quests, schatz, keyArt, anzahl: dieSaison.length };
  }, [teile, nr]);
  const belohnungen = [...d.bpFrei, ...d.bpBezahlt, ...d.quests];
  const hab = belohnungen.filter((t) => gefunden.wert.includes(t.id)).length;
  const umschalten = (id: string) => gefunden.setzen((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const sicht = (l: Teil[]) => (nurOffen ? l.filter((t) => !gefunden.wert.includes(t.id)) : l);
  const schatzNews = news.filter((m) => /treasure|gold|loot|chest|devil fruit|captain|pirate|hunt/i.test(`${m.title} ${m.body}`));
  const kachel = (t: Teil, i: number, zusatz?: string) => (
    <Kachel key={t.id} t={t} index={i} unten={<>{zusatz && <p className="mt-1 text-[10px] font-semibold text-amber-200/80">{zusatz}</p>}<Merker an={gefunden.wert.includes(t.id)} setzen={() => umschalten(t.id)} text="Mark as found" textAn="✓ Found" /></>} />
  );
  return (
    <div className="space-y-8">
      <SeitenKopf klein ueber="Community · Season" titel="Treasure Hunt" text={`${s.name} – every reward you can dig up, earn or unlock this season, and what you've already found.`}
        rechts={<div className="flex gap-2"><AblageHinweis ort={gefunden.ort} /><LinkKopieren /></div>} />
      <Held bild={d.keyArt?.bildBreit} ueber={`${s.sub ?? 'Season'} · Season ${s.season}`} titel={s.name} unter={d.keyArt?.text || 'Sand, sun, and searching for lost loot.'}
        kinder={<div className="mt-5"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Season ends in</p><Countdown ziel={Date.parse(s.end)} groesse="mittel" /></div>}
        rechts={<Flaeche fest className="p-4"><Fortschritt hab={hab} von={belohnungen.length} titel="Rewards found" /><p className="mt-2 text-[11px] text-white/45"><Zahl wert={d.anzahl} /> new cosmetics this season</p></Flaeche>} />

      {daten?.mechanik?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {daten.mechanik.map((m, i) => <Flaeche fest key={m.titel} className="p-5" verz={i * 0.05}><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-akz">Step {i + 1}</p><h3 className="mt-1 text-lg font-extrabold text-white">{m.titel}</h3><p className="mt-1 text-sm text-white/55">{m.text}</p></Flaeche>)}
        </div>
      ) : null}

      {schatzNews.length > 0 && (
        <Bereich titel="On the island right now">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {schatzNews.slice(0, 3).map((m, i) => (
              <Flaeche fest key={m.id} className="overflow-hidden" verz={i * 0.06}>
                {(m.image || m.tileImage) && <div className="aspect-video bg-gradient-to-br from-amber-300/15 via-akz/10 to-transparent"><img src={m.image || m.tileImage} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" /></div>}
                <div className="p-5"><h3 className="text-lg font-extrabold text-white">{m.title}</h3><p className="mt-1 text-sm leading-relaxed text-white/60">{m.body}</p></div>
              </Flaeche>
            ))}
          </div>
        </Bereich>
      )}

      {daten?.belohnungen?.length ? (
        <Bereich titel="Treasure chest rewards & chances">
          <div className={RASTER}>
            {daten.belohnungen.map((b, i) => {
              const t = b.cosmeticId ? teile.find((x) => x.id.toLowerCase() === b.cosmeticId!.toLowerCase()) : undefined; const n = b.einsIn ?? (b.chance ? Math.round(1 / b.chance) : null);
              const da = gefunden.wert.includes(b.id);
              return (
                <Flaeche fest key={b.id} className={`overflow-hidden ${da ? 'ring-1 ring-emerald-300/40' : ''}`} verz={Math.min(i, 20) * 0.02}>
                  <div className="relative aspect-square" style={{ background: `radial-gradient(110% 85% at 50% 18%, ${seltenVon(t?.selten ?? 'legendary').a}55, #05070d)` }}>
                    {(b.bild ?? t?.bild) && <img src={b.bild ?? t!.bild} alt="" className="h-full w-full object-contain" />}
                    {n && <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-amber-200">1 in {n.toLocaleString('en')}</span>}
                  </div>
                  <div className="p-3"><p className="truncate font-bold text-white">{b.name}</p><p className="text-[11px] text-white/45">{b.typ ?? t?.typName}{b.quelle ? ` · ${b.quelle}` : ''}</p>
                    <Merker an={da} setzen={() => umschalten(b.id)} text="Mark as found" textAn="✓ Found" /></div>
                </Flaeche>
              );
            })}
          </div>
        </Bereich>
      ) : null}

      <div className="flex flex-wrap items-center gap-3"><Schalter titel="Hide what I've found" an={nurOffen} setzen={setNurOffen} /></div>
      {laedt && <Laedt text="Loading this season's cosmetics …" />}
      {d.bpFrei.length > 0 && <Bereich titel={<>Free pass rewards <span className="text-sm font-semibold text-white/40">{d.bpFrei.length}</span></>}><div className={RASTER}>{sicht(d.bpFrei).map((t, i) => kachel(t, i, 'Free tier'))}</div></Bereich>}
      {d.bpBezahlt.length > 0 && <Bereich titel={<>Battle Pass rewards <span className="text-sm font-semibold text-white/40">{d.bpBezahlt.length}</span></>}><div className={RASTER}>{sicht(d.bpBezahlt).map((t, i) => kachel(t, i, (t.herkunft ?? []).some((h) => h.endsWith('Additional')) ? 'Bonus reward' : 'Paid tier'))}</div></Bereich>}
      {d.quests.length > 0 && <Bereich titel={<>Quest rewards <span className="text-sm font-semibold text-white/40">{d.quests.length}</span></>}><div className={RASTER}>{sicht(d.quests).map((t, i) => kachel(t, i, 'Quest'))}</div></Bereich>}
      {d.schatz.length > 0 && (
        <Bereich titel={<>Treasure-themed cosmetics <span className="text-sm font-semibold text-white/40">{d.schatz.length}</span></>} rechts={<Link to="/community/shop" className="text-sm font-semibold text-akz/80 hover:text-white">Item Shop →</Link>}>
          <div className={RASTER}>{d.schatz.filter((t) => HAUPT.includes(t.typ)).slice(0, 32).map((t, i) => <Kachel key={t.id} t={t} index={i} unten={t.set ? <p className="mt-1 truncate text-[10px] text-white/40">{t.set}</p> : undefined} />)}</div>
        </Bereich>
      )}
      {!daten?.belohnungen?.length && (
        <Hinweis mehr={<>Drop chances per chest aren't published by Epic, so they're not shown here. Dig spots are on the <Link to="/community/map" className="text-akz">map</Link>.</>}>
          Rewards come from this season's cosmetics; mark what you've found and it's remembered.
        </Hinweis>
      )}
      <p className="text-[11px] text-white/30">Rewards come from the game's own tags (battle pass free / paid, quest) via fortnite-api.com · "Found" is saved {gefunden.ort === 'konto' ? 'to your account' : 'in this browser'}.</p>
    </div>
  );
}

/* ================================================================== Sprites */
interface Sprite { id: string; name: string; varianten?: string[]; bild?: string; neu?: boolean }
export function Sprites() {
  const { teile, laedt } = useTeile(['br']);
  const { daten } = useHubDatei<{ saison?: string; sprites: Sprite[] }>('sprites.json');
  const stand = useAblage<Record<string, { o?: boolean; m?: boolean }>>('sprites', {});
  const [filter, setFilter] = useState<'alle' | 'fehlt' | 'hab'>('alle');
  const d = useMemo(() => {
    const alle = teile.filter((t) => /sprite/i.test(`${t.name} ${t.text}`) && !/aethersprite|woodsprite/i.test(t.name));
    const meister = alle.filter((t) => /mastery|trainer/i.test(t.name) || (t.herkunft ?? []).includes('QuestReward'));
    const arten = [...new Set(alle.flatMap((t) => [...`${t.name} ${t.text}`.matchAll(/\b(Fire|Water|Air|Earth|Dark|Light|Pixel|Gold|Shadow|Storm|Ice|Lava|Void)\s+Sprite/gi)].map((m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase())))];
    const keyArt = teile.find((t) => t.id === 'LoadingScreen_S41KeyArt') ?? alle.find((t) => t.typ === 'loadingscreen' && t.bildBreit);
    const saisonen = [...new Set(alle.map((t) => t.saisonText?.replace('Introduced in ', '').replace(/\.$/, '')).filter(Boolean))] as string[];
    return { alle: alle.filter((t) => t.typ !== 'loadingscreen' || t !== keyArt), meister, arten, keyArt, saisonen };
  }, [teile]);
  const zeilen = (daten?.sprites ?? []).flatMap((s) => (s.varianten?.length ? s.varianten : ['Standard']).map((v) => ({ s, v, k: `${s.id}:${v}` })));
  const schalten = (k: string, f: 'o' | 'm') => stand.setzen((v) => ({ ...v, [k]: { ...v[k], [f]: !v[k]?.[f] } }));
  const hab = d.alle.filter((t) => stand.wert[t.id]?.o).length; const gemeistert = d.alle.filter((t) => stand.wert[t.id]?.m).length;
  const sicht = d.alle.filter((t) => filter === 'alle' || (filter === 'hab' ? stand.wert[t.id]?.o : !stand.wert[t.id]?.o));
  return (
    <div className="space-y-8">
      <SeitenKopf klein ueber="Community · Season" titel="Sprites" text="Every sprite-related item in Fortnite's files – mastery rewards, sprite types and sprite gear – with your own Owned / Mastered tracker." rechts={<div className="flex gap-2"><AblageHinweis ort={stand.ort} /><LinkKopieren /></div>} />
      <Held bild={d.keyArt?.bildBreit} ueber={d.keyArt?.saisonText?.replace('Introduced in ', '').replace(/\.$/, '') ?? 'Sprites'} titel={d.keyArt?.name ?? 'Sprites'} unter={d.keyArt?.text}
        rechts={<Flaeche fest className="space-y-3 p-4"><Fortschritt hab={hab} von={d.alle.length} titel="Owned" /><Fortschritt hab={gemeistert} von={d.alle.length} titel="Mastered" /></Flaeche>} />
      {d.arten.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-white/45">Sprite types in the files:</span>
          {d.arten.map((a, i) => <motion.span key={a} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className="rounded-full border border-akz/30 bg-akz/10 px-3 py-1 text-xs font-bold text-akz">{a} Sprite</motion.span>)}
          {d.saisonen.length > 0 && <span className="text-xs text-white/35">· items from {d.saisonen.slice(0, 4).join(', ')}</span>}
        </div>
      )}
      {zeilen.length > 0 && (
        <Bereich titel={<>Sprite list {daten?.saison ? <span className="text-sm font-semibold text-white/40">{daten.saison}</span> : null}</>}>
          <div className={RASTER}>
            {zeilen.map(({ s, v, k }, i) => (
              <Flaeche fest key={k} className="overflow-hidden" verz={Math.min(i, 20) * 0.02}>
                <div className="aspect-square bg-gradient-to-b from-akz/20 to-transparent">{s.bild && <img src={s.bild} alt="" className="h-full w-full object-contain p-3" />}</div>
                <div className="p-3"><p className="font-bold text-white">{s.name}</p><p className="text-[11px] text-akz/80">{v}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">{(['o', 'm'] as const).map((f) => <button key={f} type="button" onClick={() => schalten(k, f)} className={`rounded-lg py-1 text-[11px] font-bold ${stand.wert[k]?.[f] ? 'bg-akz text-[#06080f]' : 'bg-white/[0.06] text-white/55 hover:text-white'}`}>{f === 'o' ? 'Owned' : 'Mastered'}</button>)}</div></div>
              </Flaeche>
            ))}
          </div>
        </Bereich>
      )}
      {d.meister.length > 0 && (
        <Bereich titel={<>Mastery rewards <span className="text-sm font-semibold text-white/40">{d.meister.length}</span></>}>
          <div className={RASTER}>{d.meister.map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<SpriteKnoepfe id={t.id} stand={stand.wert} schalten={schalten} />} />)}</div>
        </Bereich>
      )}
      <Bereich titel={<>All sprite items <span className="text-sm font-semibold text-white/40">{d.alle.length}</span></>} rechts={
        <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
          {([['alle', 'All'], ['fehlt', 'Missing'], ['hab', 'Owned']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className="relative rounded-lg px-3 py-1">
              {filter === k && <motion.span layoutId="sprite-filter" className="absolute inset-0 rounded-lg bg-akz" />}<span className={`relative ${filter === k ? 'text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{t}</span>
            </button>
          ))}
        </div>
      }>
        {laedt ? <Laedt text="Searching the files for sprites …" /> : <div className={RASTER}>{sicht.map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<SpriteKnoepfe id={t.id} stand={stand.wert} schalten={schalten} />} />)}</div>}
      </Bereich>
      {!zeilen.length && <Hinweis>The sprite items below come straight from Fortnite's cosmetics data – mark each as owned or mastered.</Hinweis>}
    </div>
  );
}
function SpriteKnoepfe({ id, stand, schalten }: { id: string; stand: Record<string, { o?: boolean; m?: boolean }>; schalten: (k: string, f: 'o' | 'm') => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {(['o', 'm'] as const).map((f) => (
        <button key={f} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); schalten(id, f); }}
          className={`rounded-lg py-1 text-[10px] font-bold transition ${stand[id]?.[f] ? 'bg-akz text-[#06080f]' : 'bg-white/[0.06] text-white/55 hover:text-white'}`}>{f === 'o' ? 'Owned' : 'Mastered'}</button>
      ))}
    </div>
  );
}

/* ================================================================== Free Cosmetics */
/*
 * "So bekommst du es" (Betreiber 27.11.2026): Klick auf ein Gratis-Teil oeffnet eine klare Anleitung. Grundlage sind nur echte Daten:
 * die Herkunfts-Tags der Spieldateien (Cosmetics.Source.*), Einfuehrung/Set/Beschreibung von fortnite-api.com, der Gratis-Shop von heute
 * und die Redaktions-Eintraege aus gratis.json. Was dort nicht steht (z. B. die genauen Quest-Schritte), sagen wir ausdruecklich.
 */
interface Weg { art: string; titel: string; schritte: string[]; unbekannt?: string; link?: { text: string; zu: string; extern?: boolean } }
const menschlich = (x: string) => x.replace(/\./g, ' · ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d+)/g, ' $1').replace(/\s+/g, ' ').trim();
function wegeFuer(t: Teil, o: { passEnde?: string; shopBis?: string; redaktion?: Gratis }): Weg[] {
  const h = t.herkunft ?? []; const w: Weg[] = [];
  if (o.redaktion) w.push({ art: 'Editor note', titel: o.redaktion.titel, schritte: [o.redaktion.text, ...(o.redaktion.bis ? [`Available until ${datumKurz(o.redaktion.bis)}.`] : [])], link: o.redaktion.quelle ? { text: 'Source', zu: o.redaktion.quelle, extern: true } : undefined });
  if (o.shopBis) w.push({ art: 'Item Shop', titel: 'Free in the Item Shop today', schritte: ['Open the Item Shop in the Fortnite lobby.', `Find "${t.name}" – it costs 0 V-Bucks.`, `Click it and confirm "Get" before it leaves the shop (${datumKurz(o.shopBis)}).`], link: { text: "Today's shop", zu: '/community/shop' } });
  for (const x of h) {
    const pass = /^Season(\d+)\.BattlePass\.Free$/.exec(x);
    if (pass) w.push({ art: 'Battle Pass · free tier', titel: `Free tier of the Season ${pass[1]} Battle Pass`, schritte: ['Play any mode to earn XP – every match, quest and daily goal counts.', 'Open the Battle Pass tab in the lobby and go to the page with this reward.', 'Claim it with Battle Stars (pages unlock as you level up) – no purchase needed.', ...(o.passEnde ? [`Claim before the season ends (${datumKurz(o.passEnde)}).`] : [])], unbekannt: 'Which pass page it sits on isn\u2019t in the public data – check the Battle Pass tab.', link: { text: 'XP calculator', zu: '/community/xp' } });
    else if (/^SparksPass\.Free$/.test(x)) w.push({ art: 'Music Pass · free tier', titel: 'Free tier of the Music (Sparks) Pass', schritte: ['Earn XP in any mode.', 'Open the Music Pass in the Pass tab and claim the reward on its page.'] });
    else if (x === 'QuestReward' || x === 'LevelUpQuest' || x === 'Challenge' || /Challenges$/.test(x)) w.push({ art: 'Quest', titel: 'Quest reward', schritte: ['Open the Quests tab in the lobby.', 'Find the quest line this reward belongs to and complete its stages.', 'The reward unlocks automatically when the last stage is done.'], unbekannt: 'The exact quest steps aren\u2019t in Epic\u2019s public files – the in-game Quests tab lists them.' });
    else if (/^Season\d+\.FirstWin$/.test(x)) w.push({ art: 'First win', titel: 'Win your first match of the season', schritte: ['Get a Victory Royale in Battle Royale or Zero Build during that season.', 'The reward is granted automatically.'] });
    else if (/^Season\d+\.Level[uU]p$/.test(x)) w.push({ art: 'Level reward', titel: 'Reach a season level', schritte: ['Level up during the season – the reward is granted at a set level.'], unbekannt: 'The exact level isn\u2019t in the public data.' });
    else if (x === 'FNCS' || x === 'CompReward' || /Tournament|Competitive/.test(x)) w.push({ art: 'Tournament', titel: x === 'FNCS' ? 'FNCS reward' : 'Tournament reward', schritte: ['Play the cup this reward belongs to (Compete tab in the lobby).', 'Reach the points or placement the cup asks for – shown in the cup\u2019s rules in game.', 'Rewards are usually granted within a few days after the event.'], unbekannt: 'Which cup and how many points isn\u2019t in the public files.', link: { text: 'Tournaments', zu: '/community/tournaments' } });
    else if (x === 'Granted.Twitch') w.push({ art: 'Twitch drop', titel: 'Twitch drop', schritte: ['Link your Epic account to Twitch (twitch.tv/drops → Connections).', 'Watch eligible Fortnite streams with drops enabled during the drop window.', 'Claim it in your Twitch Drops inventory – it appears in your locker afterwards.'], unbekannt: 'Past drop windows are over – it can only return with a new campaign.' });
    else if (x === 'Promo' || x.startsWith('Platform.') || x === 'PlaystationActivation') w.push({ art: 'Promotion', titel: x === 'Promo' ? 'Promotion' : `Platform reward (${menschlich(x.replace(/^Platform\./, ''))})`, schritte: ['Given out through a partner or platform promotion – usually as a code.', 'Redeem codes at fortnite.com/redeem while signed in to your Epic account.'], unbekannt: 'Which promotion and whether it still runs isn\u2019t in the public data.' });
    else if (x.startsWith('Event') || x.startsWith('Winterfest')) w.push({ art: 'Event', titel: `Event: ${menschlich(x.replace(/^Event\.?/, '')) || 'limited-time event'}`, schritte: ['Earned during a limited-time event – by completing its quests or opening its rewards (e.g. Winterfest presents).', 'When the event returns, its quests appear in the Quests tab.'], unbekannt: 'The exact event tasks aren\u2019t in the public files.' });
  }
  if (!w.length) w.push({ art: 'Unknown', titel: 'How to get it: unknown', schritte: [], unbekannt: `The game files tag this item only as ${h.length ? h.map(menschlich).join(', ') : 'nothing'} – no public source says how to get it for free. If you know, tell us and our editors add it.` });
  return w;
}

function WieBekommen({ t, zu, passEnde, shopBis, redaktion }: { t: Teil | null; zu: () => void; passEnde?: string; shopBis?: string; redaktion?: Gratis }) {
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); };
    document.addEventListener('keydown', taste); return () => document.removeEventListener('keydown', taste);
  }, [zu]);
  return (
    <AnimatePresence>
      {t && (
        <motion.div key={t.id} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={zu}>
          <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0d16] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
              <div className="relative aspect-square sm:aspect-auto" style={{ background: `radial-gradient(120% 90% at 50% 15%, ${seltenVon(t.selten).a}66, ${seltenVon(t.selten).b} 70%, #05070d)` }}>
                <img src={t.bildGross || t.bild} alt="" className="absolute inset-0 h-full w-full object-contain p-3" />
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-akz">How to get it</p>
                    <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-white">{t.name}</h3>
                    <p className="text-sm font-semibold" style={{ color: seltenVon(t.selten).a }}>{t.seltenName} {t.typName}</p>
                  </div>
                  <button type="button" onClick={zu} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60 hover:bg-white/10 hover:text-white">✕</button>
                </div>
                <div className="mt-5 space-y-4">
                  {wegeFuer(t, { passEnde, shopBis, redaktion }).map((w, i) => (
                    <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{w.art}</p>
                      <p className="mt-0.5 font-bold text-white">{w.titel}</p>
                      {w.schritte.length > 0 && (
                        <ol className="mt-2 space-y-1.5">
                          {w.schritte.map((x, k) => <li key={k} className="flex gap-2.5 text-sm text-white/75"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-akz/15 text-[11px] font-bold text-akz">{k + 1}</span>{x}</li>)}
                        </ol>
                      )}
                      {w.unbekannt && <p className="mt-2.5 flex gap-2 rounded-xl bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100/80"><span className="font-bold text-amber-200">Unknown:</span>{w.unbekannt}</p>}
                      {w.link && (w.link.extern ? <a href={w.link.zu} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-akz hover:text-white">{w.link.text} ↗</a>
                        : <Link to={w.link.zu} className="mt-2 inline-block text-xs font-semibold text-akz hover:text-white">{w.link.text} →</Link>)}
                    </div>
                  ))}
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {t.saisonText && <><dt className="text-white/40">Introduced</dt><dd className="text-white/75">{t.saisonText.replace(/^Introduced in /, '').replace(/\.$/, '')}</dd></>}
                  {t.set && <><dt className="text-white/40">Set</dt><dd className="text-white/75">{t.set}</dd></>}
                  <dt className="text-white/40">In the files since</dt><dd className="text-white/75">{datumKurz(t.hinzu)}</dd>
                  {(t.herkunft ?? []).length > 0 && <><dt className="text-white/40">Source tags</dt><dd className="break-words font-mono text-[10px] text-white/55">{t.herkunft!.join(', ')}</dd></>}
                </dl>
                <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className="mt-5 inline-flex rounded-xl bg-akz px-4 py-2 text-sm font-bold text-[#06080f] hover:bg-akz">Full item page →</Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface Gratis { id: string; titel: string; text: string; bis?: string; bild?: string; quelle?: string; teile?: string[] }
export function GratisKosmetik() {
  const { teile, laedt, nr } = useSaisonTeile();
  const { s } = useSaison();
  const shop = useShop();
  const { daten } = useHubDatei<{ eintraege: Gratis[] }>('gratis.json');
  const erledigt = useAblage<string[]>('gratis-erledigt', []);
  const [ausblenden, setAusblenden] = useState(false);
  const [offen, setOffen] = useState<Teil | null>(null);
  const jetzt = useJetzt(60_000);
  const d = useMemo(() => {
    const hat = (t: Teil, re: RegExp) => (t.herkunft ?? []).some((h) => re.test(h));
    const grenze = Date.now() - 120 * 864e5;
    const frei = teile.filter((t) => hat(t, new RegExp(`^Season${nr}\\.BattlePass\\.Free$`)));
    const quest = teile.filter((t) => hat(t, /^QuestReward$/) && (t.saisonNr ?? 0) >= nr - 1);
    const event = teile.filter((t) => hat(t, /^(Event|Promo|Winterfest|FirstWin|Twitch|Rewards?)/) && Date.parse(t.hinzu) >= grenze);
    const turnier = teile.filter((t) => hat(t, /^FNCS|Tournament|Competitive/) && Date.parse(t.hinzu) >= Date.now() - 365 * 864e5);
    return { frei, quest, event, turnier };
  }, [teile, nr]);
  const gratisShop = useMemo(() => shop.angebote.filter((a) => a.preis === 0).flatMap((a) => a.teile.map((t) => ({ t, bis: a.bis }))), [shop.angebote]);
  const abschnitte: Array<{ titel: string; text: string; liste: Teil[]; bis?: number; marke: string }> = [
    { titel: 'Free pass rewards', text: `Free tier of this season's pass – claim before ${datumKurz(s.end)}.`, liste: d.frei, bis: Date.parse(s.end), marke: 'Free tier' },
    { titel: 'Quest rewards', text: 'Unlocked by completing quests – no V-Bucks needed.', liste: d.quest, marke: 'Quest' },
    { titel: 'Events & promotions', text: 'Added in the last 120 days for events, promos and challenges.', liste: d.event, marke: 'Event' },
    { titel: 'Tournament rewards', text: 'Earned by playing cups and FNCS – see the Tournaments page for times.', liste: d.turnier, marke: 'Tournament' },
  ];
  const alle = [...gratisShop.map((x) => x.t), ...abschnitte.flatMap((a) => a.liste)];
  const fertig = alle.filter((t) => erledigt.wert.includes(t.id)).length;
  const umschalten = (id: string) => erledigt.setzen((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const sicht = (l: Teil[]) => (ausblenden ? l.filter((t) => !erledigt.wert.includes(t.id)) : l);
  const eigene = (daten?.eintraege ?? []).filter((e) => !e.bis || Date.parse(e.bis) > jetzt);
  return (
    <div className="space-y-8">
      <SeitenKopf klein ueber="Community · Cosmetics" titel="Free cosmetics" text="Everything you can get without spending V-Bucks right now – from the pass's free tier, quests, events, tournaments and free shop offers."
        rechts={<div className="flex gap-2"><AblageHinweis ort={erledigt.ort} /><LinkKopieren /></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Free items found', alle.length], ['Claimed by you', fertig], ['Free in the shop today', gratisShop.length], ['Free tier ends in', null]].map(([k, v], i) => (
          <Flaeche fest key={k as string} className="p-5" verz={i * 0.05}>
            <p className="text-3xl font-black text-akz">{v === null ? restText(Date.parse(s.end) - jetzt) : <Zahl wert={v as number} />}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k as string}</p>
          </Flaeche>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4"><Schalter titel="Hide what I've claimed" an={ausblenden} setzen={setAusblenden} /><Fortschritt hab={fertig} von={alle.length} titel="Claimed" /></div>
      {eigene.length > 0 && (
        <Bereich titel="Limited-time free rewards">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {eigene.map((e, i) => (
              <Flaeche fest key={e.id} className="p-5" verz={i * 0.04}>
                <h3 className="text-lg font-extrabold text-white">{e.titel}</h3>
                {e.bis && <p className="text-xs font-semibold text-amber-200/80">{restText(Date.parse(e.bis) - jetzt)} left · ends {datumKurz(e.bis)}</p>}
                <p className="mt-1.5 text-sm text-white/60">{e.text}</p>
                <div className="mt-3 flex items-center justify-between">{e.quelle ? <a href={e.quelle} target="_blank" rel="noreferrer" className="text-xs font-semibold text-akz">Source ↗</a> : <span />}
                  <button type="button" onClick={() => umschalten(e.id)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${erledigt.wert.includes(e.id) ? 'bg-emerald-400 text-[#06080f]' : 'border border-white/10 text-white/75'}`}>{erledigt.wert.includes(e.id) ? '✓ Completed' : 'Mark as completed'}</button></div>
              </Flaeche>
            ))}
          </div>
        </Bereich>
      )}
      {gratisShop.length > 0 && (
        <Bereich titel={<>Free in the shop today <span className="text-sm font-semibold text-white/40">{gratisShop.length}</span></>}>
          <div className={RASTER}>{sicht(gratisShop.map((x) => x.t)).map((t, i) => <Kachel key={t.id} t={t} index={i} beiKlick={() => setOffen(t)} unten={<><p className="mt-1 text-[10px] font-semibold text-emerald-300/80">Free · {restText(Date.parse(gratisShop.find((x) => x.t.id === t.id)!.bis) - jetzt)} left</p><Merker an={erledigt.wert.includes(t.id)} setzen={() => umschalten(t.id)} text="Mark as claimed" textAn="✓ Claimed" /></>} />)}</div>
        </Bereich>
      )}
      {laedt && <Laedt text="Looking for free rewards in the files …" />}
      {abschnitte.filter((a) => a.liste.length).map((a, k) => (
        <Bereich key={a.titel} verzoegerung={k * 0.04} titel={<>{a.titel} <span className="text-sm font-semibold text-white/40">{a.liste.length}</span></>} rechts={<span className="text-xs text-white/40">{a.text}</span>}>
          <div className={RASTER}>{sicht(a.liste).slice(0, 48).map((t, i) => <Kachel key={t.id} t={t} index={i} beiKlick={() => setOffen(t)} unten={<><p className="mt-1 text-[10px] font-semibold text-akz/70">{a.marke}{a.bis ? ` · ${restText(a.bis - jetzt)} left` : ` · ${datumKurz(t.hinzu)}`}</p><Merker an={erledigt.wert.includes(t.id)} setzen={() => umschalten(t.id)} text="Mark as claimed" textAn="✓ Claimed" /></>} />)}</div>
        </Bereich>
      ))}
      <Hinweis mehr={<>Twitch drops, Fortnite Crew perks and one-off promotions aren't marked in the game data, so they only show up here when CompHub adds them by hand.</>}>
        Free rewards are found through the game's own source tags (free pass tier, quest, event, tournament). Click any item to see how to get it.
      </Hinweis>
      <WieBekommen t={offen} zu={() => setOffen(null)} passEnde={s.end} shopBis={offen ? gratisShop.find((x) => x.t.id === offen.id)?.bis : undefined}
        redaktion={offen ? (daten?.eintraege ?? []).find((e) => e.teile?.some((id) => id.toLowerCase() === offen.id.toLowerCase())) : undefined} />
    </div>
  );
}

/* ================================================================== Most Used (ehrlicher Ersatz; Betreiber: Name wie bei fortnite.gg, Balken nur als feine Linie) */
const MEIST_TYPEN = [['outfit', 'Outfits'], ['emote', 'Emotes'], ['pickaxe', 'Pickaxes'], ['backpack', 'Back Blings'], ['glider', 'Gliders'], ['wrap', 'Wraps']] as const;
export function MeistGenutzt() {
  const { teile, laedt } = useTeile(['br']);
  const [typ, setTyp] = useState<string>('outfit');
  const [zeit, setZeit] = useState<'365' | 'alle'>('365');
  const liste = useMemo(() => {
    const ab = zeit === '365' ? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) : '';
    return teile.filter((t) => istTyp(t, typ)).map((t) => ({ t, n: new Set(t.shop.filter((d) => d.slice(0, 10) >= ab).map((d) => d.slice(0, 10))).size }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 60);
  }, [teile, typ, zeit]);
  const max = liste[0]?.n ?? 1;
  const titel = REITER.find((r) => r.k === typ)?.titel ?? MEIST_TYPEN.find(([k]) => k === typ)?.[1];
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber="Community · Cosmetics" titel="Most used" text="The cosmetics the item shop shows the most – the closest honest proxy for what you meet on the island." rechts={<LinkKopieren />} />
      <Hinweis mehr={<>Epic doesn't publish what players wear, and we won't guess. Our tournament replays contain every player's outfit, so a real "Most used in pro play" list can come from the replay parser – this page then switches to it.</>}>
        <b className="text-white/70">Not usage numbers:</b> ranked by days in the item shop{zeit === '365' ? ' over the last 12 months' : ' since the shop began'}.
      </Hinweis>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-black/30 p-1">
          {MEIST_TYPEN.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTyp(k)} className="relative rounded-xl px-3.5 py-1.5 text-sm font-bold">
              {typ === k && <motion.span layoutId="meist-typ" className="absolute inset-0 rounded-xl bg-akz" />}<span className={`relative ${typ === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{t}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
          {([['365', 'Last 12 months'], ['alle', 'All time']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setZeit(k)} className={`rounded-lg px-3 py-1 ${zeit === k ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{t}</button>)}
        </div>
      </div>
      {laedt ? <Laedt text="Counting shop days …" /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {liste.slice(0, 3).map(({ t, n }, i) => {
              const s = seltenVon(t.selten);
              return (
                <motion.div key={`${typ}-${t.id}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 26 }} whileHover={{ y: -5 }}>
                  <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className="relative block overflow-hidden rounded-3xl border border-white/10" style={{ background: `radial-gradient(120% 90% at 50% 10%, ${s.a}55, ${s.b} 65%, #05070d)` }}>
                    <span className="absolute left-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-2xl bg-black/55 text-2xl font-black text-white backdrop-blur">{i + 1}</span>
                    <div className="relative mx-auto aspect-square max-h-[320px]"><img src={t.bildGross || t.bild} alt="" className="h-full w-full object-contain" /></div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
                      <p className="text-xl font-extrabold text-white">{t.name}</p>
                      <p className="text-sm font-semibold" style={{ color: s.a }}><Zahl wert={n} /> days in the shop</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
          <Flaeche fest className="p-4">
            <h3 className="px-2 pb-2 font-bold text-white">{titel} · places 4–{liste.length}</h3>
            <ol className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
              {liste.slice(3).map(({ t, n }, i) => (
                <motion.li key={`${typ}-${t.id}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 30) * 0.015 }}>
                  <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className="relative flex items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
                    <motion.span className="absolute bottom-0 left-2 h-[2px] rounded-full bg-akz/25" initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ duration: 0.7, delay: Math.min(i, 30) * 0.015 }} />
                    <span className="relative w-6 text-right text-xs font-bold tabular-nums text-white/40">{i + 4}</span>
                    <img src={t.bild} alt="" loading="lazy" className="relative h-9 w-9 rounded-lg object-contain" style={{ background: seltenVon(t.selten).b }} />
                    <span className="relative min-w-0 flex-1 truncate text-sm font-bold text-white">{t.name}</span>
                    <span className="relative text-sm font-black tabular-nums text-white">{n}</span><span className="relative text-[10px] text-white/40">days</span>
                  </Link>
                </motion.li>
              ))}
            </ol>
          </Flaeche>
          <p className="text-[11px] text-white/30">Data: complete item-shop history from fortnite-api.com. More shop leaderboards in <Link to="/community/cosmetic-stats" className="text-akz/80">Cosmetic Stats</Link>.</p>
        </>
      )}
    </div>
  );
}
