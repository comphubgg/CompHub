import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Flaeche, Marke } from '../../ds/Bausteine';
import { ModusUmschalter } from './Bausteine';
import { bildVon } from './WaffenSeiten';
import { KLASSEN_DB, SELTENHEITEN, WERTE, abgleichSchluessel, fmt, gesamtChance, pro, selten, type Datenbank, type DbWaffe, type Stufe } from './waffenDaten';
import { kern, waffeVon } from './waffenNamen';
import { Linie, WaffenBild, schein } from './waffenTeile';
import { useAktuelleSaison } from './waffenWiki';

/*
 * Waffen-Datenbank (Design 3.0, neu komponiert 28.11.2026): Spieldateien-Export (public/hub-daten/waffen.json, nur lokal) und/oder Fortnite Wiki.
 *   1. Buehne: drei grosse Schalter "All weapons ever / In the pool now / Vaulted" mit je einer Bildleiste, daneben "In cups this season"
 *      (Deep Stats - was die Profis wirklich benutzen; das hat sonst niemand).
 *   2. Filter: Klassen, Saisons als Chips (aus den Daten + laufende Saison von fortnite-api.com), Seltenheit, Sortierung, Suche, Raster/Liste.
 *   3. Raster gleich grosser Karten, nach Klasse gruppiert; Klick -> eigene Seite (/community/weapons/:id). Vergleichsleiste unten.
 * Alle Zahlen stammen aus der Datei, dem Wiki oder den Replays - fehlt ein Wert, steht "—".
 */

export interface TurnierWaffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number; tage: number }
export interface Turnier { dmg: number; hits: number; krit: number; spieler: number; tage: number }
type Wiki = Map<string, { name: string; bild: string }> | undefined;

const SORTEN = [
  { k: 'klasse', titel: 'Class' }, { k: 'name', titel: 'Name' }, ...WERTE.map((w) => ({ k: w.k, titel: w.titel })),
  { k: 'floor', titel: 'Floor chance' }, { k: 'chest', titel: 'Chest chance' }, { k: 'nutzung', titel: 'Tournament usage' },
];
const SEITE = 96;

/** Gewuenschte Seltenheit, sonst die naechst niedrigere vorhandene, sonst die niedrigste. */
function stufeFuer(w: DbWaffe, wunsch: string): Stufe | undefined {
  if (!w.rarities.length) return undefined;
  if (wunsch === 'hoechste') return w.rarities[w.rarities.length - 1];
  const i = SELTENHEITEN.findIndex((s) => s.k === wunsch);
  return [...w.rarities].reverse().find((r) => SELTENHEITEN.findIndex((s) => s.k === r.rarity) <= i) ?? w.rarities[0];
}

/** Turnierwerte den Waffen der Datei zuordnen (ueber Bauplan/WID-Kern); Uebriges bleibt "nur im Turnier gesehen". */
export function turnierZuordnen(db: Datenbank, turnier: TurnierWaffe[]) {
  const schluessel = new Map<string, string>();
  for (const w of db.weapons) for (const k of abgleichSchluessel(w)) if (!schluessel.has(k)) schluessel.set(k, w.id);
  // Waffen ohne Bauplan (Fortnite Wiki): ueber den Anzeigenamen
  const nachName = new Map(db.weapons.map((w) => [w.name.toLowerCase().replace(/[^a-z0-9]/g, ''), w.id]));
  const m = new Map<string, Turnier>(); const rest: TurnierWaffe[] = [];
  for (const t of turnier) {
    const id = [kern(t.roh), kern(t.roh).replace(/\d+$/, '')].map((k) => schluessel.get(k)).find(Boolean) ?? nachName.get(waffeVon(t.roh).name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (!id) { rest.push(t); continue; }
    const x = m.get(id) ?? { dmg: 0, hits: 0, krit: 0, spieler: 0, tage: 0 };
    x.dmg += t.dmg; x.hits += t.hits; x.krit += t.krit; x.spieler += t.spieler; x.tage = Math.max(x.tage, t.tage);
    m.set(id, x);
  }
  return { proWaffe: m, ohne: rest };
}

/** Zustand des Wiki-Abrufs (alle Waffen, die es je gab) - fuer Fortschritt und die eine Fehlerzeile */
export interface WikiZustand { status: 'laedt' | 'da' | 'fehlt'; fertig: number; gesamt: number; imWiki?: number; neu: () => void }

/** "C1 S7" -> "Ch. 1 S7" */
export const saisonText = (x: string) => x.replace(/^C(\d+) S(\w+)$/, 'Ch. $1 S$2');
export const saisonWert = (x: string) => { const [, c, t] = /C(\d+) S(\w+)/.exec(x) ?? []; return Number(c) * 100 + (Number(t) || (t === 'X' ? 10 : t === 'OG' ? 50 : 60)); };
/** Saisons einer Waffe - wer jetzt im Pool ist (nicht vaulted), ist auch in der laufenden Saison, auch wenn der Wiki-Text sie noch nicht nennt. */
export const saisonenVon = (w: DbWaffe, aktuell?: string) => (aktuell && !w.vaulted && !(w.saisons ?? []).includes(aktuell) ? [...(w.saisons ?? []), aktuell] : w.saisons ?? []);
export const klasseTitel = (k: string) => KLASSEN_DB.find((x) => x.k === k)?.titel ?? 'Specials';

export default function WaffenDatenbank({ db, turnier, gesamt, wiki, vergleich, umschalten, wikiZustand }: { db: Datenbank; turnier: TurnierWaffe[]; gesamt: number; spielerTage?: number; wiki: Wiki; vergleich: string[]; umschalten: (id: string) => void; wikiZustand?: WikiZustand }) {
  const [klasse, setKlasse] = useState<string>('alle');
  const [sorte, setSorte] = useState('klasse');
  const [wunsch, setWunsch] = useState('hoechste');
  const [eigene, setEigene] = useState<Record<string, string>>({});
  const [suche, setSuche] = useState('');
  const [anzahl, setAnzahl] = useState(SEITE);
  const nav = useNavigate();
  const modiDa = useMemo(() => [...new Set(db.weapons.flatMap((w) => w.modes ?? []))], [db]);
  const [modus, setModus] = useState('br');
  const [bauen, setBauen] = useState<'build' | 'zb'>('build');
  const [ansicht, setAnsicht] = useState<'raster' | 'liste'>('raster');
  const mitWiki = useMemo(() => db.weapons.some((w) => w.quelle === 'wiki' || w.wiki), [db]);
  // Betreiber 28.11.2026: "alle Waffen, die es je gab" soll man sofort sehen - deshalb ist das die erste Wahl
  const [poolArt, setPoolArtRoh] = useState<'aktuell' | 'vaulted' | 'alle'>('alle');
  const [saison, setSaison] = useState('alle');
  const aktuell = useAktuelleSaison();
  // "In the pool now" heisst: laufende Saison - der Saison-Filter springt mit
  const setPoolArt = (k: 'aktuell' | 'vaulted' | 'alle') => { setPoolArtRoh(k); setAnzahl(SEITE); if (k === 'aktuell' && aktuell) setSaison(aktuell.k); else if (k !== 'aktuell' && saison === aktuell?.k) setSaison('alle'); };
  const saisonListe = useMemo(() => {
    const m = new Map<string, number>(); for (const w of db.weapons) for (const x of saisonenVon(w, aktuell?.k)) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => saisonWert(b[0]) - saisonWert(a[0]));
  }, [db, aktuell]);
  const inArt = (w: DbWaffe, k: string) => !mitWiki || k === 'alle' || (k === 'vaulted' ? !!w.vaulted : !w.vaulted);
  const imPool = (w: DbWaffe) => inArt(w, poolArt) && (saison === 'alle' || saisonenVon(w, aktuell?.k).includes(saison));

  const { proWaffe, ohne } = useMemo(() => turnierZuordnen(db, turnier), [db, turnier]);
  const stufe = (w: DbWaffe) => (eigene[w.id] ? w.rarities.find((r) => r.rarity === eigene[w.id]) : undefined) ?? stufeFuer(w, wunsch);
  const klassen = KLASSEN_DB.map((k) => ({ ...k, n: db.weapons.filter((w) => w.class === k.k && imPool(w)).length })).filter((k) => k.n);

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    // Modus-Filter nur, wenn die Datei Modi fuehrt (sonst ist alles der Pool der exportierten Playlist).
    const imModus = (w: DbWaffe) => !modiDa.length || !w.modes || (w.modes.includes(modus) && (bauen === 'build' || w.modes.includes('zb') || !modiDa.includes('zb')));
    const l = db.weapons.filter((w) => imPool(w) && imModus(w) && (klasse === 'alle' || w.class === klasse) && (!q || w.name.toLowerCase().includes(q)));
    const wert = (w: DbWaffe): number | undefined => {
      const s = stufe(w);
      if (sorte === 'floor') return s?.loot?.floor ?? gesamtChance(w, 'floor');
      if (sorte === 'chest') return s?.loot?.chest ?? gesamtChance(w, 'chest');
      if (sorte === 'nutzung') return proWaffe.get(w.id)?.dmg;
      const d = WERTE.find((x) => x.k === sorte); return d && s ? d.wert(s) : undefined;
    };
    const klassenRang = (w: DbWaffe) => KLASSEN_DB.findIndex((k) => k.k === w.class);
    if (sorte === 'name') return l.sort((a, b) => a.name.localeCompare(b.name));
    if (sorte === 'klasse') return l.sort((a, b) => klassenRang(a) - klassenRang(b) || a.name.localeCompare(b.name));
    const aufsteigend = sorte === 'reloadTime';
    return l.sort((a, b) => {
      const x = wert(a); const y = wert(b);
      if (x === undefined && y === undefined) return a.name.localeCompare(b.name);
      if (x === undefined) return 1; if (y === undefined) return -1;
      return aufsteigend ? x - y : y - x;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, klasse, sorte, wunsch, eigene, suche, proWaffe, modus, bauen, modiDa, poolArt, saison, mitWiki, aktuell]);

  const imVergleich = vergleich.map((id) => db.weapons.find((w) => w.id === id)!).filter(Boolean);
  const stand = db.exportedAt ? new Date(db.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  // Bildleisten der drei Schalter - jede Waffe nur in einer Leiste
  const leisten = useMemo(() => {
    const mitBild = db.weapons.filter((w) => bildVon(w, wiki));
    const genommen = new Set<string>();
    const nimm = (l: DbWaffe[]) => { const out: DbWaffe[] = []; for (const w of l) { if (out.length >= 4) break; if (!genommen.has(w.id)) { genommen.add(w.id); out.push(w); } } return out; };
    const jetzt = nimm([...mitBild.filter((w) => !w.vaulted)].sort((a, b) => (proWaffe.get(b.id)?.dmg ?? 0) - (proWaffe.get(a.id)?.dmg ?? 0)));
    const alt = nimm(mitBild.filter((w) => w.vaulted).sort((a, b) => saisonWert((b.saisons ?? []).at(-1) ?? 'C0 S0') - saisonWert((a.saisons ?? []).at(-1) ?? 'C0 S0')));
    const alle = nimm([...mitBild].sort((a, b) => saisonWert(a.saisons?.[0] ?? 'C9 S9') - saisonWert(b.saisons?.[0] ?? 'C9 S9')));
    return { alle, aktuell: jetzt, vaulted: alt };
  }, [db, wiki, proWaffe]);
  const inCups = useMemo(() => [...proWaffe.entries()].filter(([, t]) => t.hits >= 5).sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 6)
    .map(([id, t]) => ({ w: db.weapons.find((x) => x.id === id)!, t })).filter((x) => x.w), [proWaffe, db]);

  const gruppen = sorte === 'klasse' && klasse === 'alle'
    ? KLASSEN_DB.map((k) => ({ k: k.k, titel: k.titel, l: liste.filter((w) => w.class === k.k) })).filter((g) => g.l.length)
    : [{ k: 'alle', titel: '', l: liste }];
  let rest = anzahl;
  const karte = (w: DbWaffe, i: number) => (
    <WaffenKarte key={w.id} w={w} s={stufe(w)} waehlen={(r) => setEigene((e) => ({ ...e, [w.id]: r }))} bild={bildVon(w, wiki, stufe(w)?.rarity)} i={i}
      t={proWaffe.get(w.id)} gesamt={gesamt} jetzt={aktuell?.k} imVergleich={vergleich.includes(w.id)} vergleichen={() => umschalten(w.id)} />
  );

  return (
    <div className="space-y-6">
      {/* 1 - Buehne: drei Schalter + In cups */}
      <div className={`grid gap-4 ${inCups.length ? 'xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]' : ''}`}>
        <div className={`grid gap-3 ${mitWiki ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {(mitWiki ? (['alle', 'aktuell', 'vaulted'] as const) : (['alle'] as const)).map((k, i) => {
            const an = poolArt === k; const n = db.weapons.filter((w) => inArt(w, k)).length;
            const titel = !mitWiki ? (db.season ? `Season ${db.season} pool` : 'In the pool') : k === 'alle' ? 'All weapons ever' : k === 'aktuell' ? 'In the pool now' : 'Vaulted';
            return (
              <motion.button key={k} type="button" onClick={() => setPoolArt(k)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className={`fl-fest group relative flex flex-col overflow-hidden !rounded-2xl p-3 text-left transition sm:p-5 ${an ? '!border-akz/60 shadow-[0_20px_50px_-30px_rgb(var(--akz)/0.9)]' : 'hover:!border-white/20'}`}>
                {an && <motion.span layoutId="waffen-schalter" className="absolute inset-x-0 top-0 h-[3px] bg-akz" />}
                <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-[11px] ${an ? 'text-akz' : 'text-white/50'}`}>{titel}</p>
                <p className="titel zahl mt-1 text-4xl sm:text-6xl">{n.toLocaleString('en')}</p>
                <div className="mt-3 hidden min-h-[56px] flex-1 items-center gap-1 sm:flex">
                  {leisten[k].map((w) => <WaffenBild key={w.id} bild={bildVon(w, wiki)} name={w.name} className="h-full max-h-24 min-h-14 min-w-0 flex-1 transition duration-500 group-hover:-translate-y-1" />)}
                </div>
              </motion.button>
            );
          })}
        </div>
        {inCups.length > 0 && (
          <Flaeche fest className="p-5" verz={0.1}>
            <div className="flex items-baseline justify-between gap-3"><p className="ueber">In cups this season</p><span className="text-[11px] text-white/40">share of all damage</span></div>
            <ul className="mt-3 space-y-2">
              {inCups.map(({ w, t }, i) => (
                <li key={w.id}>
                  <Link to={`/community/weapons/${w.id}`} className="group flex items-center gap-3">
                    <span className="titel zahl w-5 text-xl text-white/35">{i + 1}</span>
                    <WaffenBild bild={bildVon(w, wiki)} name={w.name} className="h-9 w-14 shrink-0" schatten={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-bold text-white group-hover:text-akz">{w.name}</span><span className="zahl shrink-0 whitespace-nowrap text-xs font-bold text-white">{gesamt ? ((t.dmg / gesamt) * 100).toFixed(1) : '—'} %</span></div>
                      <Linie anteil={gesamt ? (t.dmg / gesamt) * 100 * 2.5 : 0} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Flaeche>
        )}
      </div>

      {/* Alle Waffen je: Fortschritt beim ersten Laden, eine Zeile, wenn das Wiki nicht antwortet */}
      {!mitWiki && wikiZustand?.status === 'laedt' && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
          <span className="font-semibold text-white/75">Loading every weapon ever</span>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-akz" animate={{ width: wikiZustand.gesamt ? `${(wikiZustand.fertig / wikiZustand.gesamt) * 100}%` : '4%' }} /></div>
          {wikiZustand.gesamt > 0 && <span className="zahl">{wikiZustand.fertig.toLocaleString('en')} / {wikiZustand.gesamt.toLocaleString('en')} wiki pages</span>}
        </div>
      )}
      {!mitWiki && wikiZustand?.status === 'fehlt' && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />The Fortnite Wiki didn't answer – weapons from earlier seasons are missing.<button type="button" onClick={wikiZustand.neu} className="font-semibold text-akz hover:text-white">Try again</button></p>
      )}

      {/* 2 - Filter */}
      <Flaeche className="space-y-3 p-3 sm:p-4" verz={0.12}>
        <div className="ohne-leiste -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {[{ k: 'alle', titel: 'All classes', n: klassen.reduce((a, k) => a + k.n, 0) }, ...klassen].map((g) => (
            <button key={g.k} type="button" onClick={() => { setKlasse(g.k); setAnzahl(SEITE); }} className={`chip ${klasse === g.k ? 'chip-an' : ''}`}>{g.titel}<span className="zahl text-white/40">{g.n}</span></button>
          ))}
        </div>
        {mitWiki && saisonListe.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Season</span>
            <div className="ohne-leiste -mr-1 flex gap-1.5 overflow-x-auto pr-1">
              <button type="button" onClick={() => setSaison('alle')} className={`chip ${saison === 'alle' ? 'chip-an' : ''}`}>Any</button>
              {saisonListe.map(([x, n]) => (
                <button key={x} type="button" onClick={() => { setSaison(x); setAnzahl(SEITE); }} className={`chip ${saison === x ? 'chip-an' : ''}`} title={`${n} weapons`}>
                  {x === aktuell?.k && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]" />}{saisonText(x)}{x === aktuell?.k ? <span className="text-emerald-300">now</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="flex items-center gap-1" title="Show every weapon at this rarity (or the closest one it has)">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Rarity</span>
            <button type="button" onClick={() => { setWunsch('hoechste'); setEigene({}); }} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${wunsch === 'hoechste' ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>Best</button>
            {SELTENHEITEN.filter((s) => db.weapons.some((w) => w.rarities.some((r) => r.rarity === s.k))).map((s) => (
              <button key={s.k} type="button" title={s.titel} onClick={() => { setWunsch(s.k); setEigene({}); }}
                className={`h-6 w-6 rounded-md transition ${wunsch === s.k ? 'ring-2 ring-white/80' : 'opacity-45 hover:opacity-90'}`} style={{ background: s.farbe }} />
            ))}
          </div>
          <select value={sorte} onChange={(e) => setSorte(e.target.value)} className="eingabe !py-1.5" aria-label="Sort">
            {SORTEN.map((s) => <option key={s.k} value={s.k}>Sort: {s.titel}</option>)}
          </select>
          {modiDa.length > 0 && <ModusUmschalter modus={modus} setzen={setModus} bauen={bauen} setBauen={setBauen} verfuegbar={modiDa} />}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a weapon…" className="eingabe !py-1.5 min-w-0 flex-1 sm:w-60" />
            <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-black/40 p-0.5 text-xs font-bold">
              {([['raster', 'Grid'], ['liste', 'List']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setAnsicht(k)} className={`rounded-lg px-2.5 py-1 ${ansicht === k ? 'bg-akz text-[#04050a]' : 'text-white/50 hover:text-white'}`}>{t}</button>)}
            </div>
          </div>
        </div>
      </Flaeche>

      {/* 3 - Raster / Liste */}
      <p className="text-sm text-white/50"><b className="zahl text-white">{liste.length.toLocaleString('en')}</b> {liste.length === 1 ? 'weapon' : 'weapons'}{saison !== 'alle' ? ` in ${saisonText(saison)}` : ''}{wikiZustand?.imWiki ? <span className="text-white/35"> · the wiki's largest weapon category lists {wikiZustand.imWiki.toLocaleString('en')} pages</span> : null}</p>
      {ansicht === 'liste' ? <Liste liste={liste.slice(0, anzahl)} stufe={stufe} wiki={wiki} vergleich={vergleich} umschalten={umschalten} /> : (
        <div className="space-y-8">
          {gruppen.map((g) => {
            if (rest <= 0) return null;
            const zeigen = g.l.slice(0, rest); rest -= zeigen.length;
            return (
              <section key={g.k}>
                {g.titel && <div className="mb-3 flex items-baseline gap-3"><h2 className="titel text-3xl">{g.titel}</h2><span className="zahl text-sm text-white/40">{g.l.length}</span></div>}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{zeigen.map(karte)}</div>
              </section>
            );
          })}
        </div>
      )}
      {liste.length > anzahl && <div className="flex justify-center"><button type="button" onClick={() => setAnzahl(liste.length)} className="knopf">Show all {liste.length.toLocaleString('en')} weapons</button></div>}
      {!liste.length && <p className="text-sm text-white/45">No weapon matches.</p>}

      {ohne.length > 0 && (
        <p className="text-xs text-white/35">
          Also seen in tournaments but not in the {db.build || db.exportedAt ? 'game-file export' : 'database yet'}: {ohne.slice(0, 12).map((t) => waffeVon(t.roh, wiki).name).join(', ')}{ohne.length > 12 ? ` and ${ohne.length - 12} more` : ''}.
        </p>
      )}
      <p className="text-xs leading-relaxed text-white/35">
        {db.build || db.exportedAt ? <>Base stats and loot chances: exported from the game files{db.build ? ` (${db.build})` : ''}{db.playlist ? `, loot for ${db.playlist}` : ''}{stand ? `, ${stand}` : ''}. </> : null}
        {mitWiki && <>Vaulted weapons, seasons and stats not in the game files: <a href="https://fortnite.fandom.com/" target="_blank" rel="noreferrer" className="text-akz/80 hover:text-white">Data: Fortnite Wiki, CC BY-SA</a> (marked "wiki"). </>}
        Damage is per body shot (all pellets for shotguns). DPS marked "calc." is damage × fire rate. "In cups": the latest tournament days on the main island, rarities pooled.
      </p>

      {/* Vergleichsleiste: per Portal an <body>, weil der Seitenrahmen transformiert ist (fixed waere sonst relativ zur Seite) */}
      {createPortal(
        <AnimatePresence>
          {imVergleich.length > 0 && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
              <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#05070c]/95 p-2 pl-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-akz sm:inline">Compare</span>
                {imVergleich.map((w) => (
                  <button key={w.id} type="button" onClick={() => umschalten(w.id)} title="Remove" className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-white/[0.05] py-1 pl-1 pr-2.5 text-sm font-semibold text-white hover:bg-white/10">
                    <WaffenBild bild={bildVon(w, wiki)} name={w.name} className="h-7 w-10" schatten={false} /><span className="hidden max-w-[10rem] truncate sm:inline">{w.name}</span><span className="text-white/30 group-hover:text-white">✕</span>
                  </button>
                ))}
                {imVergleich.length < 4 && <span className="hidden whitespace-nowrap text-xs text-white/35 md:inline">{imVergleich.length} of 4 · {imVergleich.length === 1 ? 'pick one more' : 'ready'}</span>}
                <button type="button" disabled={imVergleich.length < 2} onClick={() => nav(`/community/weapons/compare?w=${vergleich.join(',')}`)} className="knopf-prim shrink-0 !py-2">Compare {imVergleich.length}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </div>
  );
}

/** Gleich grosse Karte: Bild auf dem Schein der Seltenheit, Name, Saisons, vier Werte; Klick auf Bild oder Name oeffnet die Waffe. */
function WaffenKarte({ w, s, waehlen, bild, i, t, gesamt, jetzt, imVergleich, vergleichen }: {
  w: DbWaffe; s?: Stufe; waehlen: (r: string) => void; bild: string | null; i: number; t?: Turnier; gesamt: number; jetzt?: string; imVergleich: boolean; vergleichen: () => void;
}) {
  const r = s?.rarity ?? 'common';
  const haupt = WERTE.filter((x) => ['damage', 'dps', 'magazine', 'reloadTime'].includes(x.k));
  const boden = s?.loot?.floor ?? gesamtChance(w, 'floor'); const truhe = s?.loot?.chest ?? gesamtChance(w, 'chest');
  const saisons = saisonenVon(w, jetzt);
  return (
    <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 16) * 0.025, duration: 0.4 }}
      className={`fl-fest fl-klick group flex flex-col overflow-hidden !rounded-2xl ${imVergleich ? '!border-akz/60' : ''}`}>
      <Link to={`/community/weapons/${w.id}`} className="relative block aspect-[16/10] overflow-hidden transition-[background] duration-500" style={schein(r)}>
        <span className="absolute inset-x-0 bottom-0 h-[3px] transition-colors duration-500" style={{ background: selten(r).farbe }} />
        <div className="absolute inset-0 grid place-items-center p-4 transition duration-500 group-hover:scale-[1.08]"><WaffenBild bild={bild} name={w.name} className="h-full w-full" /></div>
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {w.vaulted ? <Marke ton="gold">Vaulted</Marke> : w.quelle === 'wiki' || w.wiki ? <Marke ton="gruen">In pool</Marke> : null}
        </div>
      </Link>
      <button type="button" onClick={vergleichen} title={imVergleich ? 'Remove from compare' : 'Add to compare'}
        className={`absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-xs font-bold backdrop-blur transition ${imVergleich ? 'bg-akz text-[#04050a]' : 'bg-black/55 text-white/70 hover:text-white'}`}>{imVergleich ? '✓' : '+'}<span className="sr-only">Compare</span></button>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <Link to={`/community/weapons/${w.id}`} className="truncate text-[15px] font-bold leading-snug text-white hover:text-akz" title={w.name}>{w.name}</Link>
        <p className="truncate text-[11px] text-white/45">
          <span style={{ color: selten(r).farbe }} className="font-semibold">{selten(r).titel}</span>{w.ammo ? ` · ${w.ammo}` : ''}
          {(s?.ausWiki || w.quelle === 'wiki') && s ? <span className="ml-1.5 rounded bg-white/10 px-1 text-[9px] uppercase text-white/50">wiki</span> : null}
        </p>
        {saisons.length > 0 && <p className="truncate text-[11px] text-white/35" title={saisons.map(saisonText).join(', ')}>{saisonText(saisons[0])}{saisons.length > 1 ? ` – ${saisonText(saisons.at(-1)!)} · ${saisons.length} seasons` : ''}</p>}
        <div className="mt-2 flex gap-1">
          {w.rarities.map((x) => (
            <button key={x.rarity} type="button" title={selten(x.rarity).titel} onClick={() => waehlen(x.rarity)}
              className={`h-2 flex-1 rounded-full transition ${s?.rarity === x.rarity ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-fl' : 'opacity-40 hover:opacity-90'}`} style={{ background: selten(x.rarity).farbe }} />
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
          {haupt.map((x) => {
            const v = s ? x.wert(s) : undefined;
            return (
              <div key={x.k} className="rounded-lg bg-black/30 px-0.5 py-1.5">
                <dt className="text-[8px] font-semibold uppercase tracking-wider text-white/40 sm:text-[9px]">{x.kurz}</dt>
                <dd className={`zahl text-[13px] font-bold sm:text-sm ${v === undefined ? 'text-white/25' : 'text-white'}`}>{v === undefined ? '—' : `${x.text ? x.text(s!) : fmt(v)}${x.einheit === 's' ? 's' : ''}`}</dd>
              </div>
            );
          })}
        </dl>
        {(boden !== undefined || truhe !== undefined || (t && t.hits >= 5)) && (
          <div className="mt-auto space-y-0.5 pt-2.5 text-[11px] text-white/50">
            {(boden !== undefined || truhe !== undefined) && <p>Floor <b className="zahl text-white">{pro(boden)}</b> · Chest <b className="zahl text-white">{pro(truhe)}</b></p>}
            {t && t.hits >= 5 && <p>In cups <b className="zahl text-akz">{gesamt ? ((t.dmg / gesamt) * 100).toFixed(1) : '—'} %</b> of all damage</p>}
          </div>
        )}
      </div>
    </motion.article>
  );
}

function Liste({ liste, stufe, wiki, vergleich, umschalten }: { liste: DbWaffe[]; stufe: (w: DbWaffe) => Stufe | undefined; wiki: Wiki; vergleich: string[]; umschalten: (id: string) => void }) {
  return (
    <Flaeche fest className="overflow-x-auto">
      <table className="tabelle min-w-[860px]">
        <thead><tr><th className="!pl-5">Weapon</th>{WERTE.map((d) => <th key={d.k} className="!text-right">{d.kurz}</th>)}<th className="!text-right">Floor</th><th className="!text-right">Chest</th><th className="!pr-5" /></tr></thead>
        <tbody>{liste.map((w) => {
          const s = stufe(w);
          return (
            <tr key={w.id}>
              <td className="!pl-5"><Link to={`/community/weapons/${w.id}`} className="flex items-center gap-3"><WaffenBild bild={bildVon(w, wiki, s?.rarity)} name={w.name} className="h-8 w-12 shrink-0" schatten={false} /><span className="font-bold text-white hover:text-akz">{w.name}</span><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selten(s?.rarity ?? 'common').farbe }} />{w.vaulted && <span className="text-[10px] font-bold uppercase text-amber-200/80">vaulted</span>}</Link></td>
              {WERTE.map((d) => { const v = s ? d.wert(s) : undefined; return <td key={d.k} className="zahl text-right text-white/85">{v === undefined ? '—' : fmt(v)}</td>; })}
              <td className="zahl text-right text-white/70">{pro(s?.loot?.floor)}</td><td className="zahl text-right text-white/70">{pro(s?.loot?.chest)}</td>
              <td className="!pr-5 text-right"><button type="button" onClick={() => umschalten(w.id)} className={`rounded-lg px-2 py-0.5 text-xs font-bold ${vergleich.includes(w.id) ? 'bg-akz text-[#04050a]' : 'bg-white/[0.06] text-white/60 hover:text-white'}`}>{vergleich.includes(w.id) ? '✓' : '+'}</button></td>
            </tr>
          );
        })}</tbody>
      </table>
    </Flaeche>
  );
}
