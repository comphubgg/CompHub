import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Countdown, Hinweis, LinkKopieren, restText, useHubDatei, useJetzt } from '../Bausteine';
import { Bild, dauer, Flaeche, Laedt, Leer, Marke, Segment } from '../../../ds/Bausteine';
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
const RASTER = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';

/** Fortschritt als Ring (Design 3.0): grosse Zahl in der Mitte. */
function Ring({ hab, von, titel, groesse = 150 }: { hab: number; von: number; titel: string; groesse?: number }) {
  const r = 42; const u = 2 * Math.PI * r; const p = von ? hab / von : 0;
  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <motion.circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--akz))" strokeWidth="7" strokeLinecap="round" strokeDasharray={u}
          initial={{ strokeDashoffset: u }} animate={{ strokeDashoffset: u * (1 - p) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="titel zahl text-4xl leading-none">{hab}<span className="text-xl text-white/40">/{von}</span></p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{titel}</p>
      </div>
    </div>
  );
}
/** Breites Saisonbild als Buehne (16:9-Motiv, ganze Hoehe), Text unten links. */
function Buehne({ bild, ueber, titel, unter, kinder }: { bild?: string; ueber: string; titel: string; unter?: ReactNode; kinder?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="fl-fest relative isolate min-h-[340px] overflow-hidden lg:min-h-[420px]">
      {bild && <motion.img src={bild} alt="" initial={{ scale: 1.05 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 -z-10 h-full w-full object-cover" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-fl/50 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl/85 via-transparent to-transparent" />
      <div className="flex h-full min-h-[inherit] flex-col justify-end p-6 md:p-8">
        <p className="ueber">{ueber}</p>
        <h2 className="titel mt-1 text-6xl md:text-7xl">{titel}</h2>
        {unter && <div className="mt-2 max-w-2xl text-sm text-white/70">{unter}</div>}
        {kinder}
      </div>
    </motion.div>
  );
}
/** Eine Zeile im Fortschrittsfeld: Name, Zahl, feine Linie - klickbar als Filter. */
function KatZeile({ titel, hab, von, an, klick }: { titel: string; hab: number; von: number; an: boolean; klick: () => void }) {
  return (
    <button type="button" onClick={klick} className={`w-full rounded-xl px-3 py-2 text-left transition ${an ? 'bg-akz/10 ring-1 ring-akz/40' : 'hover:bg-white/[0.04]'}`}>
      <span className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-white">{titel}</span><span className="zahl text-xs font-bold text-white/60">{hab} / {von}</span></span>
      <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/[0.07]"><motion.span className="block h-full rounded-full bg-akz" initial={{ width: 0 }} animate={{ width: `${von ? (hab / von) * 100 : 0}%` }} transition={{ duration: 0.8 }} /></span>
    </button>
  );
}

/* ================================================================== Treasure Hunt (Design 3.0, neu komponiert 28.11.2026)
 * Schatzkarte: links die Key Art der Saison mit Countdown als Buehne, rechts "Your haul" - Ring mit allem Gefundenen und je Kategorie
 * eine Zeile, die zugleich Filter ist. Darunter EIN Raster gleich grosser Kacheln, umgeschaltet per Segment (Alle Belohnungen, Free tier,
 * Battle Pass, Quests, Schatz-Kosmetik). Optional aus schatzsuche.json: Ablauf-Schritte und Truhen-Belohnungen mit Chance.
 */
interface Schatz { saison?: string; mechanik?: Array<{ titel: string; text: string }>; belohnungen: Array<{ id: string; name: string; typ?: string; chance?: number; einsIn?: number; bild?: string; cosmeticId?: string; quelle?: string }> }
type SchatzKat = 'alle' | 'frei' | 'pass' | 'quest' | 'schatz';
export function Schatzsuche() {
  const { teile, laedt, nr } = useSaisonTeile();
  const { s } = useSaison();
  const { daten } = useHubDatei<Schatz>('schatzsuche.json');
  const gefunden = useAblage<string[]>('schatz-gefunden', []);
  const news = useNews();
  const [nurOffen, setNurOffen] = useState(false);
  const [kat, setKat] = useState<SchatzKat>('alle');
  const d = useMemo(() => {
    const dieSaison = teile.filter((t) => t.saisonNr === nr);
    const hat = (t: Teil, h: string) => (t.herkunft ?? []).some((x) => x === h || x.startsWith(`${h}.`));
    const bpFrei = teile.filter((t) => hat(t, `Season${nr}.BattlePass.Free`));
    const bpBezahlt = teile.filter((t) => !bpFrei.includes(t) && hat(t, `Season${nr}.BattlePass`));
    const quests = dieSaison.filter((t) => hat(t, 'QuestReward'));
    const schatz = dieSaison.filter((t) => /treasure|gold|pirate|captain|finders|keepers|loot|chest|map|buried|doubloon|tide/i.test(`${t.name} ${t.text} ${t.set ?? ''}`) && !bpFrei.includes(t) && !bpBezahlt.includes(t) && !quests.includes(t) && HAUPT.includes(t.typ)).slice(0, 48);
    const keyArt = dieSaison.find((t) => /KeyArt/i.test(t.id) && t.bildBreit) ?? dieSaison.find((t) => t.typ === 'loadingscreen' && t.bildBreit);
    return { bpFrei, bpBezahlt, quests, schatz, keyArt, anzahl: dieSaison.length };
  }, [teile, nr]);
  const belohnungen = [...d.bpFrei, ...d.bpBezahlt, ...d.quests];
  const zahl = (l: Teil[]) => l.filter((t) => gefunden.wert.includes(t.id)).length;
  const hab = zahl(belohnungen);
  const umschalten = (id: string) => gefunden.setzen((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const schatzNews = news.filter((m) => /treasure|gold|loot|chest|devil fruit|captain|pirate|hunt/i.test(`${m.title} ${m.body}`));
  const marke = (t: Teil) => (d.bpFrei.includes(t) ? 'Free tier' : d.bpBezahlt.includes(t) ? ((t.herkunft ?? []).some((h) => h.endsWith('Additional')) ? 'Bonus reward' : 'Paid tier') : d.quests.includes(t) ? 'Quest' : t.set ?? 'Treasure-themed');
  const quelle: Record<SchatzKat, Teil[]> = { alle: belohnungen, frei: d.bpFrei, pass: d.bpBezahlt, quest: d.quests, schatz: d.schatz };
  const sicht = quelle[kat].filter((t) => !nurOffen || !gefunden.wert.includes(t.id));
  const wahl: Array<{ k: SchatzKat; titel: string }> = [{ k: 'alle', titel: `All rewards ${belohnungen.length}` }, { k: 'frei', titel: `Free tier ${d.bpFrei.length}` }, { k: 'pass', titel: `Battle Pass ${d.bpBezahlt.length}` }, ...(d.quests.length ? [{ k: 'quest' as const, titel: `Quests ${d.quests.length}` }] : []), ...(d.schatz.length ? [{ k: 'schatz' as const, titel: `Treasure-themed ${d.schatz.length}` }] : [])];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="ueber">Community · Season</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Treasure Hunt</h1></div>
        <div className="flex flex-wrap gap-2"><AblageHinweis ort={gefunden.ort} /><LinkKopieren /></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Buehne bild={d.keyArt?.bildBreit} ueber={`${s.sub ?? 'Season'} · Season ${s.season}`} titel={s.name} unter={d.keyArt?.text || 'Sand, sun, and searching for lost loot.'}
          kinder={<div className="mt-5"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Season ends in</p><Countdown ziel={Date.parse(s.end)} groesse="mittel" /></div>} />
        <Flaeche fest verz={0.06} className="flex flex-col p-5">
          <p className="ueber">Your haul</p>
          <div className="mt-3 flex items-center gap-5">
            <Ring hab={hab} von={belohnungen.length} titel="Found" />
            <div className="min-w-0 text-sm text-white/55"><p><b className="titel zahl text-3xl text-white"><Zahl wert={d.anzahl} /></b><br />new cosmetics this season</p><p className="mt-2 text-xs">Mark a reward as found and it's remembered {gefunden.ort === 'konto' ? 'on your account' : 'in this browser'}.</p></div>
          </div>
          <div className="mt-4 space-y-1">
            <KatZeile titel="Free pass rewards" hab={zahl(d.bpFrei)} von={d.bpFrei.length} an={kat === 'frei'} klick={() => setKat('frei')} />
            <KatZeile titel="Battle Pass rewards" hab={zahl(d.bpBezahlt)} von={d.bpBezahlt.length} an={kat === 'pass'} klick={() => setKat('pass')} />
            {d.quests.length > 0 && <KatZeile titel="Quest rewards" hab={zahl(d.quests)} von={d.quests.length} an={kat === 'quest'} klick={() => setKat('quest')} />}
          </div>
          {/* Epics News zur Schatzsuche - kompakt im selben Feld */}
          {schatzNews.length > 0 && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">On the island right now</p>
              <ul className="space-y-3">
                {schatzNews.slice(0, 3).map((m) => (
                  <li key={m.id} className="flex gap-3">
                    <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black/40"><Bild src={m.image || m.tileImage} className="absolute inset-0 h-full w-full" /></span>
                    <span className="min-w-0"><span className="block text-sm font-bold leading-snug text-white">{m.title}</span><span className="line-clamp-2 text-xs text-white/50">{m.body}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Flaeche>
      </div>

      {daten?.mechanik?.length ? (
        <Flaeche fest className="grid divide-white/[0.06] md:grid-cols-2 md:divide-x xl:grid-cols-4">
          {daten.mechanik.map((m, i) => <div key={m.titel} className="p-5"><p className="titel zahl text-4xl text-akz">{String(i + 1).padStart(2, '0')}</p><h3 className="mt-1 text-lg font-extrabold text-white">{m.titel}</h3><p className="mt-1 text-sm text-white/55">{m.text}</p></div>)}
        </Flaeche>
      ) : null}

      {daten?.belohnungen?.length ? (
        <Bereich titel="Treasure chest rewards & chances">
          <div className={RASTER}>
            {daten.belohnungen.map((b, i) => {
              const t = b.cosmeticId ? teile.find((x) => x.id.toLowerCase() === b.cosmeticId!.toLowerCase()) : undefined; const n = b.einsIn ?? (b.chance ? Math.round(1 / b.chance) : null);
              const da = gefunden.wert.includes(b.id);
              return (
                <Flaeche fest key={b.id} className={`overflow-hidden !rounded-2xl ${da ? 'ring-1 ring-emerald-300/40' : ''}`} verz={Math.min(i, 20) * 0.02}>
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

      <section className="space-y-4">
        <div className="fl-fest flex flex-wrap items-center justify-between gap-3 p-2">
          <div className="ohne-leiste max-w-full overflow-x-auto"><Segment id="schatz-kat" wert={kat} onWahl={setKat} wahl={wahl} klein /></div>
          {kat !== 'schatz' ? <Schalter titel="Hide what I've found" an={nurOffen} setzen={setNurOffen} /> : <Link to="/community/shop" className="knopf-leer px-2">Item Shop →</Link>}
        </div>
        {laedt ? <Laedt text="Loading this season's cosmetics" /> : !sicht.length ? <Leer text={nurOffen ? 'You found everything here.' : 'Nothing in this group this season.'} /> : (
          <div key={kat} className={RASTER}>
            {sicht.map((t, i) => (
              <Kachel key={t.id} t={t} index={i} unten={<>
                <p className="mt-1 truncate text-[10px] font-semibold text-amber-200/80">{marke(t)}</p>
                {kat !== 'schatz' ? <Merker an={gefunden.wert.includes(t.id)} setzen={() => umschalten(t.id)} text="Mark as found" textAn="✓ Found" />
                  : null}
              </>} />
            ))}
          </div>
        )}
      </section>
      {!daten?.belohnungen?.length && (
        <Hinweis mehr={<>Drop chances per chest aren't published by Epic, so they're not shown here. Dig spots are on the <Link to="/community/map" className="text-akz">map</Link>.</>}>
          Rewards come from this season's cosmetics; mark what you've found and it's remembered.
        </Hinweis>
      )}
      <p className="text-[11px] text-white/30">Rewards come from the game's own tags (battle pass free / paid, quest) via fortnite-api.com · "Found" is saved {gefunden.ort === 'konto' ? 'to your account' : 'in this browser'}.</p>
    </div>
  );
}

/* ================================================================== Sprites (Design 3.0, neu komponiert 28.11.2026)
 * Wie die Schatzsuche aufgebaut: Key Art als Buehne mit den Sprite-Arten darauf, rechts zwei Ringe (Owned / Mastered); darunter ein
 * Raster mit Ansicht (alle Teile / Meisterschafts-Belohnungen) und Filter (alle, fehlt, besessen, gemeistert). sprites.json optional.
 */
interface Sprite { id: string; name: string; varianten?: string[]; bild?: string; neu?: boolean }
export function Sprites() {
  const { teile, laedt } = useTeile(['br']);
  const { daten } = useHubDatei<{ saison?: string; sprites: Sprite[] }>('sprites.json');
  const stand = useAblage<Record<string, { o?: boolean; m?: boolean }>>('sprites', {});
  const [filter, setFilter] = useState<'alle' | 'fehlt' | 'hab' | 'meister'>('alle');
  const [ansicht, setAnsicht] = useState<'alle' | 'belohnung'>('alle');
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
  const basis = ansicht === 'alle' ? d.alle : d.meister;
  const sicht = basis.filter((t) => filter === 'alle' || (filter === 'hab' ? stand.wert[t.id]?.o : filter === 'meister' ? stand.wert[t.id]?.m : !stand.wert[t.id]?.o));
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="ueber">Community · Season</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Sprites</h1></div>
        <div className="flex flex-wrap gap-2"><AblageHinweis ort={stand.ort} /><LinkKopieren /></div>
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Buehne bild={d.keyArt?.bildBreit} ueber={d.keyArt?.saisonText?.replace('Introduced in ', '').replace(/\.$/, '') ?? 'Sprites'} titel={d.keyArt?.name ?? 'Sprites'} unter={d.keyArt?.text}
          kinder={d.arten.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {d.arten.map((a, i) => <motion.span key={a} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}><Marke ton="akz">{a} Sprite</Marke></motion.span>)}
            </div>
          ) : undefined} />
        <Flaeche fest verz={0.06} className="flex flex-col p-5">
          <p className="ueber">Your collection</p>
          <div className="mt-4 flex flex-wrap justify-around gap-4">
            <Ring hab={hab} von={d.alle.length} titel="Owned" groesse={140} />
            <Ring hab={gemeistert} von={d.alle.length} titel="Mastered" groesse={140} />
          </div>
          <p className="mt-4 text-sm text-white/55">Every sprite-related item in Fortnite's files – mastery rewards, sprite types and sprite gear. Mark each as owned or mastered.</p>
          {d.saisonen.length > 0 && <p className="mt-auto pt-3 text-xs text-white/40">Items from {d.saisonen.slice(0, 4).join(', ')}</p>}
        </Flaeche>
      </div>
      {zeilen.length > 0 && (
        <Bereich titel={<>Sprite list {daten?.saison ? <span className="text-sm font-semibold text-white/40">{daten.saison}</span> : null}</>}>
          <div className={RASTER}>
            {zeilen.map(({ s, v, k }, i) => (
              <Flaeche fest key={k} className="overflow-hidden !rounded-2xl" verz={Math.min(i, 20) * 0.02}>
                <div className="aspect-square bg-gradient-to-b from-akz/20 to-transparent">{s.bild && <img src={s.bild} alt="" className="h-full w-full object-contain p-3" />}</div>
                <div className="p-3"><p className="font-bold text-white">{s.name}</p><p className="text-[11px] text-akz/80">{v}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">{(['o', 'm'] as const).map((f) => <button key={f} type="button" onClick={() => schalten(k, f)} className={`rounded-lg py-1 text-[11px] font-bold ${stand.wert[k]?.[f] ? 'bg-akz text-[#06080f]' : 'bg-white/[0.06] text-white/55 hover:text-white'}`}>{f === 'o' ? 'Owned' : 'Mastered'}</button>)}</div></div>
              </Flaeche>
            ))}
          </div>
        </Bereich>
      )}
      <section className="space-y-4">
        <div className="fl-fest flex flex-wrap items-center justify-between gap-3 p-2">
          <Segment id="sprite-ansicht" klein wert={ansicht} onWahl={setAnsicht} wahl={[{ k: 'alle', titel: `All sprite items ${d.alle.length}` }, { k: 'belohnung', titel: `Mastery rewards ${d.meister.length}` }]} />
          <Segment id="sprite-filter" klein wert={filter} onWahl={setFilter} wahl={[{ k: 'alle', titel: 'All' }, { k: 'fehlt', titel: 'Missing' }, { k: 'hab', titel: 'Owned' }, { k: 'meister', titel: 'Mastered' }]} />
        </div>
        {laedt ? <Laedt text="Searching the files for sprites" /> : !sicht.length ? <Leer text="Nothing here with this filter." />
          : <div key={`${ansicht}-${filter}`} className={RASTER}>{sicht.map((t, i) => <Kachel key={t.id} t={t} index={i} unten={<SpriteKnoepfe id={t.id} stand={stand.wert} schalten={schalten} />} />)}</div>}
      </section>
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
/*
 * Free Cosmetics (Design 3.0, neu komponiert 28.11.2026): eine Abhakliste. Links klebt das Pult - Ring "Claimed", Restzeit der Freistufe,
 * die Quellen als Liste mit Zahl (zugleich Filter) und "Hide what I've claimed"; rechts die zeitlich begrenzten Redaktions-Eintraege und
 * darunter die gewaehlten Quellen als gleich grosse Kacheln. Klick auf ein Teil oeffnet "How to get it".
 */
export function GratisKosmetik() {
  const { teile, laedt, nr } = useSaisonTeile();
  const { s } = useSaison();
  const shop = useShop();
  const { daten } = useHubDatei<{ eintraege: Gratis[] }>('gratis.json');
  const erledigt = useAblage<string[]>('gratis-erledigt', []);
  const [ausblenden, setAusblenden] = useState(false);
  const [offen, setOffen] = useState<Teil | null>(null);
  const [quelleWahl, setQuelleWahl] = useState('alle');
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
  const abschnitte: Array<{ k: string; titel: string; text: string; liste: Teil[]; bis?: number; marke: string; shop?: boolean }> = [
    { k: 'shop', titel: 'Free in the shop today', text: 'Costs 0 V-Bucks – claim it before it leaves.', liste: gratisShop.map((x) => x.t), marke: 'Free', shop: true },
    { k: 'frei', titel: 'Free pass rewards', text: `Free tier of this season's pass – claim before ${datumKurz(s.end)}.`, liste: d.frei, bis: Date.parse(s.end), marke: 'Free tier' },
    { k: 'quest', titel: 'Quest rewards', text: 'Unlocked by completing quests – no V-Bucks needed.', liste: d.quest, marke: 'Quest' },
    { k: 'event', titel: 'Events & promotions', text: 'Added in the last 120 days for events, promos and challenges.', liste: d.event, marke: 'Event' },
    { k: 'turnier', titel: 'Tournament rewards', text: 'Earned by playing cups and FNCS – see the Tournaments page for times.', liste: d.turnier, marke: 'Tournament' },
  ];
  const alle = abschnitte.flatMap((a) => a.liste);
  const fertig = alle.filter((t) => erledigt.wert.includes(t.id)).length;
  const umschalten = (id: string) => erledigt.setzen((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const sicht = (l: Teil[]) => (ausblenden ? l.filter((t) => !erledigt.wert.includes(t.id)) : l);
  const eigene = (daten?.eintraege ?? []).filter((e) => !e.bis || Date.parse(e.bis) > jetzt);
  const gezeigt = abschnitte.filter((a) => a.liste.length && (quelleWahl === 'alle' || quelleWahl === a.k));
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="ueber">Community · Cosmetics</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Free cosmetics</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-white/55">Everything you can get without spending V-Bucks right now. Click any item to see how to get it.</p></div>
        <LinkKopieren />
      </header>
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------ Pult (klebt) */}
        <Flaeche fest className="space-y-5 p-5 lg:sticky lg:top-[7.5rem]">
          <div className="flex items-center gap-4">
            <Ring hab={fertig} von={alle.length} titel="Claimed" groesse={120} />
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Free tier ends in</p><p className="titel zahl text-3xl text-akz">{dauer(Date.parse(s.end) - jetzt)}</p></div>
          </div>
          <nav className="space-y-1">
            {[{ k: 'alle', titel: 'All free items', n: alle.length }, ...abschnitte.map((a) => ({ k: a.k, titel: a.titel, n: a.liste.length }))].map((q) => (
              <button key={q.k} type="button" disabled={q.k !== 'alle' && !q.n} onClick={() => setQuelleWahl(q.k)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition disabled:opacity-35 ${quelleWahl === q.k ? 'bg-akz/15 font-bold text-white ring-1 ring-akz/40' : 'text-white/65 hover:bg-white/[0.04] hover:text-white'}`}>
                <span className="truncate">{q.titel}</span><span className="zahl text-xs text-white/45">{laedt && q.k !== 'shop' ? '…' : q.n}</span>
              </button>
            ))}
          </nav>
          <Schalter titel="Hide what I've claimed" an={ausblenden} setzen={setAusblenden} />
          <AblageHinweis ort={erledigt.ort} />
        </Flaeche>

        <div className="min-w-0 space-y-7">
          {eigene.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {eigene.map((e, i) => (
                <Flaeche fest key={e.id} className="flex flex-col overflow-hidden" verz={i * 0.04}>
                  {e.bild && <div className="relative aspect-video"><Bild src={e.bild} className="absolute inset-0 h-full w-full" /></div>}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="ueber">Limited time</p>
                    <h3 className="mt-1 text-lg font-extrabold text-white">{e.titel}</h3>
                    {e.bis && <p className="text-xs font-semibold text-amber-200/80">{restText(Date.parse(e.bis) - jetzt)} left · ends {datumKurz(e.bis)}</p>}
                    <p className="mt-1.5 text-sm text-white/60">{e.text}</p>
                    <div className="mt-auto flex items-center justify-between pt-3">{e.quelle ? <a href={e.quelle} target="_blank" rel="noreferrer" className="text-xs font-semibold text-akz">Source ↗</a> : <span />}
                      <button type="button" onClick={() => umschalten(e.id)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${erledigt.wert.includes(e.id) ? 'bg-emerald-400 text-[#06080f]' : 'border border-white/10 text-white/75'}`}>{erledigt.wert.includes(e.id) ? '✓ Completed' : 'Mark as completed'}</button></div>
                  </div>
                </Flaeche>
              ))}
            </div>
          )}
          {laedt && <Laedt text="Looking for free rewards in the files" />}
          {gezeigt.map((a) => {
            const l = sicht(a.liste);
            return (
              <section key={a.k} className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" /><h2 className="titel text-3xl">{a.titel} <span className="zahl text-base text-white/40">{a.liste.length}</span></h2></div>
                  <span className="text-xs text-white/40">{a.text}</span>
                </div>
                {!l.length ? <p className="text-sm text-white/40">All claimed here.</p> : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {(quelleWahl === 'alle' ? l.slice(0, 48) : l).map((t, i) => {
                      const bis = a.shop ? Date.parse(gratisShop.find((x) => x.t.id === t.id)!.bis) : a.bis;
                      return <Kachel key={t.id} t={t} index={i} beiKlick={() => setOffen(t)} unten={<><p className="mt-1 truncate text-[10px] font-semibold text-akz/70">{a.marke}{bis ? ` · ${restText(bis - jetzt)} left` : ` · ${datumKurz(t.hinzu)}`}</p><Merker an={erledigt.wert.includes(t.id)} setzen={() => umschalten(t.id)} text="Mark as claimed" textAn="✓ Claimed" /></>} />;
                    })}
                  </div>
                )}
                {quelleWahl === 'alle' && l.length > 48 && <button type="button" onClick={() => setQuelleWahl(a.k)} className="knopf-leer">All {l.length} {a.titel.toLowerCase()} →</button>}
              </section>
            );
          })}
          <Hinweis mehr={<>Twitch drops, Fortnite Crew perks and one-off promotions aren't marked in the game data, so they only show up here when CompHub adds them by hand.</>}>
            Free rewards are found through the game's own source tags (free pass tier, quest, event, tournament). Click any item to see how to get it.
          </Hinweis>
        </div>
      </div>
      <WieBekommen t={offen} zu={() => setOffen(null)} passEnde={s.end} shopBis={offen ? gratisShop.find((x) => x.t.id === offen.id)?.bis : undefined}
        redaktion={offen ? (daten?.eintraege ?? []).find((e) => e.teile?.some((id) => id.toLowerCase() === offen.id.toLowerCase())) : undefined} />
    </div>
  );
}

/* ================================================================== Most Used (Design 3.0, neu komponiert 28.11.2026)
 * Ehrlicher Ersatz (Epic veroeffentlicht keine Nutzungszahlen): am haeufigsten im Shop gesehen. Neu: Bento statt Podest + Liste -
 * Platz 1 als grosse Buehne, 2-5 als vier kleinere Buehnen daneben, ab Platz 6 gleich grosse Kacheln mit Rang und feiner Tageslinie.
 */
const MEIST_TYPEN = [['outfit', 'Outfits'], ['emote', 'Emotes'], ['pickaxe', 'Pickaxes'], ['backpack', 'Back Blings'], ['glider', 'Gliders'], ['wrap', 'Wraps']] as const;
function MeistBuehne({ t, n, platz, gross = false, verz = 0 }: { t: Teil; n: number; platz: number; gross?: boolean; verz?: number }) {
  const s = seltenVon(t.selten);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verz, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="h-full">
      <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className={`fl-fest fl-klick group relative isolate flex h-full overflow-hidden ${gross ? 'min-h-[420px] lg:min-h-[520px]' : 'min-h-[200px] lg:min-h-0'}`}>
        <div className="absolute inset-0 -z-20" style={{ background: `radial-gradient(90% 100% at 70% 30%, ${s.a}77, ${s.b} 60%, #04050a)` }} />
        <img src={gross ? t.bildGross || t.bild : t.bild} alt="" className={`absolute -z-10 object-contain transition duration-700 group-hover:scale-[1.05] ${gross ? 'inset-y-0 right-0 h-full w-[70%] object-right-bottom' : 'bottom-0 right-0 h-[88%] w-[60%] object-right-bottom'}`} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04050a]/85 via-[#04050a]/30 to-transparent" />
        <div className="flex flex-col justify-between p-5 lg:p-6">
          <span className={`titel zahl text-white/90 ${gross ? 'text-9xl' : 'text-6xl'}`}>{String(platz).padStart(2, '0')}</span>
          <div>
            <p className={`titel zahl text-akz ${gross ? 'text-7xl' : 'text-4xl'}`}><Zahl wert={n} /></p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">days in the shop</p>
            <p className={`mt-2 font-extrabold text-white group-hover:text-akz ${gross ? 'text-3xl' : 'text-lg'}`}>{t.name}</p>
            <p className="text-xs font-semibold" style={{ color: s.a }}>{t.seltenName} {t.typName}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
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
      {/* Kopf und Umschalter in einem Band: Art links, Zeitraum rechts */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="ueber">Community · Cosmetics</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Most used</h1>
            <p className="mt-1 max-w-2xl text-[15px] text-white/55">What the item shop shows the most – the closest honest proxy for what you meet on the island.</p></div>
          <LinkKopieren />
        </div>
        <div className="fl-fest flex flex-wrap items-center justify-between gap-3 p-2">
          <div className="ohne-leiste max-w-full overflow-x-auto"><Segment id="meist-typ" wert={typ} onWahl={setTyp} wahl={MEIST_TYPEN.map(([k, t]) => ({ k, titel: t }))} /></div>
          <Segment id="meist-zeit" klein wert={zeit} onWahl={setZeit} wahl={[{ k: '365', titel: 'Last 12 months' }, { k: 'alle', titel: 'All time' }]} />
        </div>
        <Hinweis mehr={<>Epic doesn't publish what players wear, and we won't guess. Our tournament replays contain every player's outfit, so a real "Most used in pro play" list can come from the replay parser – this page then switches to it.</>}>
          <b className="text-white/70">Not usage numbers:</b> ranked by days in the item shop{zeit === '365' ? ' over the last 12 months' : ' since the shop began'}.
        </Hinweis>
      </header>
      {laedt ? <Laedt text="Counting shop days" /> : !liste.length ? <Leer text="No shop days in this period." /> : (
        <>
          {/* Bento: 1 gross, 2-5 als Viererblock */}
          <div key={`${typ}-${zeit}`} className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <MeistBuehne t={liste[0].t} n={liste[0].n} platz={1} gross />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-rows-2">
              {liste.slice(1, 5).map(({ t, n }, i) => <MeistBuehne key={t.id} t={t} n={n} platz={i + 2} verz={0.06 + i * 0.05} />)}
            </div>
          </div>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3"><h2 className="titel text-3xl">{titel} · places 6–{liste.length}</h2><span className="text-xs text-white/40">days in the shop</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
              {liste.slice(5).map(({ t, n }, i) => {
                const s = seltenVon(t.selten);
                return (
                  <motion.div key={`${typ}-${t.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.012 }}>
                    <Link to={`/community/cosmetics/${encodeURIComponent(t.id)}`} className="fl-fest fl-klick group block overflow-hidden !rounded-2xl">
                      <div className="relative aspect-square overflow-hidden" style={{ background: `radial-gradient(120% 90% at 50% 12%, ${s.a}55, ${s.b} 62%, #04050a)` }}>
                        <img src={t.bild} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-1 transition duration-500 group-hover:scale-[1.07]" />
                        <span className="titel zahl absolute left-2 top-1.5 text-2xl text-white drop-shadow">{i + 6}</span>
                      </div>
                      <div className="px-2.5 pb-2.5 pt-2">
                        <p className="truncate text-sm font-bold text-white group-hover:text-akz">{t.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]"><motion.span className="block h-full rounded-full bg-akz/70" initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ duration: 0.7, delay: Math.min(i, 30) * 0.012 }} /></span>
                          <span className="zahl text-xs font-black text-white">{n}</span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
          <p className="text-[11px] text-white/30">Data: complete item-shop history from fortnite-api.com. More shop leaderboards in <Link to="/community/cosmetic-stats" className="text-akz/80">Cosmetic Stats</Link>.</p>
        </>
      )}
    </div>
  );
}
