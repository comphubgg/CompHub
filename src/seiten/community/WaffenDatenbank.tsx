import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ModusUmschalter } from './Bausteine';
import { bildVon } from './WaffenSeiten';
import { Glas } from '../../teile/Glas';
import { KLASSEN_DB, SELTENHEITEN, WERTE, abgleichSchluessel, fmt, gesamtChance, pro, selten, type Datenbank, type DbWaffe, type Stufe } from './waffenDaten';
import { kern, waffeVon } from './waffenNamen';
import { useAktuelleSaison } from './waffenWiki';

/** Saisons einer Waffe - wer jetzt im Pool ist (nicht vaulted), ist auch in der laufenden Saison, auch wenn der Wiki-Text sie noch nicht nennt. */
export const saisonenVon = (w: DbWaffe, aktuell?: string) => (aktuell && !w.vaulted && !(w.saisons ?? []).includes(aktuell) ? [...(w.saisons ?? []), aktuell] : w.saisons ?? []);

/*
 * Volle Waffen-Datenbank (nur wenn public/hub-daten/waffen.json da ist): Karte je Waffe mit Seltenheits-Wahl, die alle Werte umschaltet,
 * Boden-/Truhenchance, darunter "In tournaments" aus Deep Stats. Sortieren/Filtern nach Klasse, Vergleich von 2-3 Waffen nebeneinander.
 * Alle Zahlen stammen aus der Datei bzw. aus den Replays - fehlt ein Wert, steht "—".
 */

export interface TurnierWaffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number; tage: number }
export interface Turnier { dmg: number; hits: number; krit: number; spieler: number; tage: number }
type Wiki = Map<string, { name: string; bild: string }> | undefined;

const SORTEN = [
  { k: 'klasse', titel: 'Class' }, { k: 'name', titel: 'Name' }, ...WERTE.map((w) => ({ k: w.k, titel: w.titel })),
  { k: 'floor', titel: 'Floor chance' }, { k: 'chest', titel: 'Chest chance' }, { k: 'nutzung', titel: 'Tournament usage' },
];

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
export interface WikiZustand { status: 'laedt' | 'da' | 'fehlt'; fertig: number; gesamt: number; neu: () => void }

export default function WaffenDatenbank({ db, turnier, gesamt, spielerTage, wiki, vergleich, umschalten, wikiZustand }: { db: Datenbank; turnier: TurnierWaffe[]; gesamt: number; spielerTage: number; wiki: Wiki; vergleich: string[]; umschalten: (id: string) => void; wikiZustand?: WikiZustand }) {
  const [klasse, setKlasse] = useState<string>('alle');
  const [sorte, setSorte] = useState('klasse');
  const [wunsch, setWunsch] = useState('hoechste');
  const [eigene, setEigene] = useState<Record<string, string>>({});
  const [suche, setSuche] = useState('');
  const nav = useNavigate();
  const modiDa = useMemo(() => [...new Set(db.weapons.flatMap((w) => w.modes ?? []))], [db]);
  const [modus, setModus] = useState('br');
  const [bauen, setBauen] = useState<'build' | 'zb'>('build');
  const [ansicht, setAnsicht] = useState<'raster' | 'liste'>('raster');
  // Alle Waffen je (Fortnite Wiki): aktueller Pool, vaulted oder alle - und je Saison
  const mitWiki = useMemo(() => db.weapons.some((w) => w.quelle === 'wiki' || w.wiki), [db]);
  // Betreiber 28.11.2026: "alle Waffen, die es je gab" soll man sofort sehen - deshalb steht die Ansicht vorn und ist die erste Wahl
  const [poolArt, setPoolArt] = useState<'aktuell' | 'vaulted' | 'alle'>('alle');
  const [saison, setSaison] = useState('alle');
  const aktuell = useAktuelleSaison();
  const saisonListe = useMemo(() => { const m = new Map<string, number>(); for (const w of db.weapons) for (const x of saisonenVon(w, aktuell?.k)) m.set(x, (m.get(x) ?? 0) + 1);
    const wert = (x: string) => { const [, c, t] = /C(\d+) S(\w+)/.exec(x) ?? []; return Number(c) * 100 + (Number(t) || (t === 'X' ? 10 : 60)); };
    return [...m.keys()].sort((a, b) => wert(b) - wert(a)); }, [db, aktuell]);
  const imPool = (w: DbWaffe) => (!mitWiki || poolArt === 'alle' || (poolArt === 'vaulted' ? !!w.vaulted : !w.vaulted)) && (saison === 'alle' || saisonenVon(w, aktuell?.k).includes(saison));

  const { proWaffe, ohne } = useMemo(() => turnierZuordnen(db, turnier), [db, turnier]);

  const stufe = (w: DbWaffe) => (eigene[w.id] ? w.rarities.find((r) => r.rarity === eigene[w.id]) : undefined) ?? stufeFuer(w, wunsch);
  const klassen = KLASSEN_DB.map((k) => ({ ...k, n: db.weapons.filter((w) => w.class === k.k).length })).filter((k) => k.n);

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
  }, [db, klasse, sorte, wunsch, eigene, suche, proWaffe, modus, bauen, modiDa, poolArt, saison, mitWiki]);

  const imVergleich = vergleich.map((id) => db.weapons.find((w) => w.id === id)!).filter(Boolean);
  const stand = db.exportedAt ? new Date(db.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <div className="space-y-6">
      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          [mitWiki ? (poolArt === 'aktuell' ? 'In the current pool' : poolArt === 'vaulted' ? 'Vaulted weapons' : 'Weapons ever') : 'Weapons in the pool', String(liste.length)],
          ['Rarity variants', String(db.weapons.reduce((a, w) => a + w.rarities.length, 0))],
          ['Seen in tournaments', String(proWaffe.size)],
          mitWiki && !stand && !db.season ? ['Seasons covered', String(saisonListe.length)] : ['From the game files', stand ?? (db.season ? `Season ${db.season}` : 'Export')],
        ].map(([k, v], i) => (
          <Glas key={k} className="p-5" verzoegerung={0.05 * i}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p>
            <p className="mt-1 truncate text-3xl font-extrabold tabular-nums text-white" title={db.build}>{v}</p>
          </Glas>
        ))}
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
      {mitWiki && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-white/10 bg-black/40 p-1">
            {([['alle', 'All weapons ever'], ['aktuell', 'Current pool'], ['vaulted', 'Vaulted']] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setPoolArt(k)} className={`relative rounded-xl font-bold ${k === 'alle' ? 'px-4 py-2 text-base' : 'px-3.5 py-1.5 text-sm'}`}>
                {poolArt === k && <motion.span layoutId="waffen-pool" className="absolute inset-0 rounded-xl bg-akz shadow-[0_6px_18px_-6px_rgb(var(--akz)/0.9)]" />}
                <span className={`relative ${poolArt === k ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{t}<span className="zahl ml-1.5 text-xs opacity-60">{db.weapons.filter((w) => k === 'alle' || (k === 'vaulted' ? w.vaulted : !w.vaulted)).length}</span></span>
              </button>
            ))}
          </div>
          {saisonListe.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-white/50">Season
              <select value={saison} onChange={(e) => setSaison(e.target.value)} className="rounded-lg border border-white/10 bg-[#0b1220] px-2.5 py-1.5 text-sm text-white focus:border-teal-300/60 focus:outline-none">
                <option value="alle">Any season</option>{saisonListe.map((x) => <option key={x} value={x}>{saisonText(x)}{x === aktuell?.k ? ' · now' : ''}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <ModusUmschalter modus={modus} setzen={setModus} bauen={bauen} setBauen={setBauen} verfuegbar={modiDa.length ? modiDa : ['br']} />

      {/* Werkzeugleiste */}
      <Glas className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4" verzoegerung={0.15}>
        <div className="flex flex-wrap gap-1.5">
          {[{ k: 'alle', titel: 'All', n: db.weapons.length }, ...klassen].map((g) => (
            <button key={g.k} type="button" onClick={() => setKlasse(g.k)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${klasse === g.k ? 'border-teal-300/50 bg-teal-300/15 text-white' : 'border-white/10 text-white/55 hover:bg-white/5 hover:text-white'}`}>
              {g.titel}<span className="ml-1.5 text-white/40">{g.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" title="Show every weapon at this rarity (or the closest one it has)">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Rarity</span>
          <button type="button" onClick={() => { setWunsch('hoechste'); setEigene({}); }}
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${wunsch === 'hoechste' ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>Best</button>
          {SELTENHEITEN.filter((s) => db.weapons.some((w) => w.rarities.some((r) => r.rarity === s.k))).map((s) => (
            <button key={s.k} type="button" title={s.titel} onClick={() => { setWunsch(s.k); setEigene({}); }}
              className={`h-6 w-6 rounded-md transition ${wunsch === s.k ? 'ring-2 ring-white/80' : 'opacity-45 hover:opacity-90'}`} style={{ background: s.farbe }} />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/50">
          Sort
          <select value={sorte} onChange={(e) => setSorte(e.target.value)} className="rounded-lg border border-white/10 bg-[#0b1220] px-2.5 py-1.5 text-sm text-white focus:border-teal-300/60 focus:outline-none">
            {SORTEN.map((s) => <option key={s.k} value={s.k}>{s.titel}</option>)}
          </select>
        </label>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a weapon…"
          className="ml-auto w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none sm:w-56" />
        <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
          {([['raster', 'Grid'], ['liste', 'List']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setAnsicht(k)} className={`rounded-lg px-2.5 py-1 ${ansicht === k ? 'bg-white/15 text-white' : 'text-white/45'}`}>{t}</button>)}
        </div>
      </Glas>

      {ansicht === 'liste' ? <Liste liste={liste} stufe={stufe} wiki={wiki} vergleich={vergleich} umschalten={umschalten} /> : (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {liste.map((w, i) => (
          <DbKarte key={w.id} w={w} s={stufe(w)} waehlen={(r) => setEigene((e) => ({ ...e, [w.id]: r }))} bild={bildVon(w, wiki, stufe(w)?.rarity)} i={i}
            t={proWaffe.get(w.id)} gesamt={gesamt} spielerTage={spielerTage} imVergleich={vergleich.includes(w.id)} vergleichen={() => umschalten(w.id)} />
        ))}
      </div>)}
      {!liste.length && <p className="text-sm text-white/45">No weapon matches.</p>}

      {ohne.length > 0 && (
        <p className="text-xs text-white/35">
          Also seen in tournaments but not in the {db.build || db.exportedAt ? 'game-file export' : 'database yet'}: {ohne.slice(0, 12).map((t) => waffeVon(t.roh, wiki).name).join(', ')}{ohne.length > 12 ? ` and ${ohne.length - 12} more` : ''}.
        </p>
      )}
      <p className="text-xs leading-relaxed text-white/35">
        {db.build || db.exportedAt ? <>Base stats and loot chances: exported from the game files{db.build ? ` (${db.build})` : ''}{db.playlist ? `, loot for ${db.playlist}` : ''}. </> : null}
        {mitWiki && <>Vaulted weapons, seasons and stats not in the game files: <a href="https://fortnite.fandom.com/" target="_blank" rel="noreferrer" className="text-teal-200/80 hover:text-white">Data: Fortnite Wiki, CC BY-SA</a> (marked "wiki"). </>}
        Damage is per body shot (all pellets for shotguns).
        DPS marked "calc." is damage × fire rate. "In tournaments": the latest tournament days on the main island, rarities pooled.
      </p>

      {/* Vergleichsleiste und -fenster: per Portal an <body>, weil der Seitenrahmen transformiert ist (fixed waere sonst relativ zur Seite) */}
      {createPortal(<>
      <AnimatePresence>
        {imVergleich.length > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto rounded-2xl border border-white/15 bg-[#06080f]/90 p-2.5 pl-4 shadow-2xl backdrop-blur-xl">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Compare</span>
            {imVergleich.map((w) => (
              <button key={w.id} type="button" onClick={() => umschalten(w.id)} title="Remove" className="group flex items-center gap-2 whitespace-nowrap rounded-xl bg-white/[0.05] py-1 pl-1 pr-2.5 text-sm font-semibold text-white hover:bg-white/10">
                <Symbol bild={bildVon(w, wiki)} name={w.name} klein />{w.name}<span className="text-white/30 group-hover:text-white">✕</span>
              </button>
            ))}
            {imVergleich.length < 4 && <span className="whitespace-nowrap text-xs text-white/35">{imVergleich.length} of 4 · {imVergleich.length === 1 ? 'pick one more' : 'ready to compare'}</span>}
            <button type="button" disabled={imVergleich.length < 2} onClick={() => nav(`/community/weapons/compare?w=${vergleich.join(',')}`)}
              className="whitespace-nowrap rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-teal-200 disabled:opacity-30">Compare {imVergleich.length}</button>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>, document.body)}
    </div>
  );
}

/** "C1 S7" -> "Ch. 1 S7" */
export const saisonText = (x: string) => x.replace(/^C(\d+) S(\w+)$/, 'Ch. $1 S$2');

function Symbol({ bild, name, klein }: { bild: string | null; name: string; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const g = klein ? 'h-7 w-7' : 'h-[110px] w-[110px]';
  // Kein Bild: nichts zeigen (kein "?", keine Buchstaben - Betreiber 28.11.2026)
  if (!bild || kaputt) return <span className={`block ${g}`} aria-hidden />;
  return <img src={bild} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setKaputt(true)} className={`${g} object-contain ${klein ? '' : 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]'}`} />;
}

function DbKarte({ w, s, waehlen, bild, i, t, gesamt, spielerTage, imVergleich, vergleichen }: {
  w: DbWaffe; s?: Stufe; waehlen: (r: string) => void; bild: string | null; i: number; t?: Turnier; gesamt: number; spielerTage: number; imVergleich: boolean; vergleichen: () => void;
}) {
  const farbe = selten(s?.rarity ?? 'common').farbe;
  const haupt = WERTE.filter((x) => ['damage', 'dps', 'magazine', 'reloadTime'].includes(x.k));
  const neben = WERTE.filter((x) => ['fireRate', 'headshotMultiplier', 'structureDamage'].includes(x.k));
  const boden = s?.loot?.floor; const truhe = s?.loot?.chest;
  const bodenAlle = gesamtChance(w, 'floor'); const truheAlle = gesamtChance(w, 'chest');
  return (
    <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.03 * i, 0.5), duration: 0.45 }} whileHover={{ y: -5 }}
      className={`group relative overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl ${imVergleich ? 'border-teal-300/50' : 'border-white/10'}`}>
      <div className="relative h-36 overflow-hidden transition-colors duration-500" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${farbe}55, ${farbe}10 60%, transparent)` }}>
        <div className="absolute inset-x-0 top-0 h-[3px] transition-colors duration-500" style={{ background: farbe }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition duration-500 group-hover:scale-110"><Symbol bild={bild} name={w.name} /></div>
        <button type="button" onClick={vergleichen}
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur transition ${imVergleich ? 'bg-teal-300 text-[#06080f]' : 'bg-black/40 text-white/70 hover:bg-black/60 hover:text-white'}`}>
          {imVergleich ? '✓ Comparing' : '+ Compare'}
        </button>
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
          {w.vaulted && <span className="rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#06080f]">Vaulted</span>}
          {w.ammo && <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/60 backdrop-blur">{w.ammo}</span>}
        </div>
      </div>
      <div className="p-5 pt-4">
        <Link to={`/community/weapons/${w.id}`} className="block truncate text-lg font-extrabold tracking-tight text-white hover:text-teal-200" title={w.name}>{w.name} <span className="text-sm text-white/30">→</span></Link>
        <div className="mt-2.5 flex gap-1">
          {SELTENHEITEN.filter((x) => x.k !== 'exotic' || w.rarities.some((r) => r.rarity === 'exotic')).map((x) => {
            const da = w.rarities.some((r) => r.rarity === x.k);
            return (
              <button key={x.k} type="button" title={da ? x.titel : `${x.titel} – not in the pool`} disabled={!da} onClick={() => waehlen(x.k)}
                className={`h-5 flex-1 rounded-md transition ${s?.rarity === x.k ? 'ring-2 ring-white/80' : da ? 'opacity-45 hover:opacity-90' : 'cursor-not-allowed opacity-[0.08]'}`} style={{ background: x.farbe }} />
            );
          })}
        </div>
        <p className="mt-1 text-[11px] font-semibold" style={{ color: farbe }}>{selten(s?.rarity ?? 'common').titel}{(s?.pellets ?? 1) > 1 ? <span className="text-white/40"> · {s!.pellets} pellets × {fmt(s!.damage!)}</span> : null}{(s?.ausWiki || w.quelle === 'wiki') && s ? <span className="ml-1.5 rounded bg-white/10 px-1 text-[9px] uppercase text-white/50">wiki</span> : null}</p>
        {w.saisons?.length ? <p className="mt-1 truncate text-[10px] text-white/40" title={w.saisons.map(saisonText).join(', ')}>{saisonText(w.saisons[0])}{w.saisons.length > 1 ? ` – ${saisonText(w.saisons.at(-1)!)} · ${w.saisons.length} seasons` : ''}</p> : null}

        <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {haupt.map((x) => {
            const v = s ? x.wert(s) : undefined;
            return (
              <div key={x.k} className="rounded-lg bg-white/[0.04] py-1.5">
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{x.kurz}</dt>
                <dd className={`text-sm font-bold tabular-nums ${v === undefined ? 'text-white/25' : 'text-white'}`}>
                  {v === undefined ? '—' : `${x.text ? x.text(s!) : fmt(v)}${x.einheit === 's' ? 's' : ''}`}
                </dd>
                {x.k === 'dps' && s?.dpsGerechnet && <span className="block text-[8px] uppercase tracking-wider text-white/30">calc.</span>}
              </div>
            );
          })}
        </dl>
        <div className="mt-3 space-y-1">
          {neben.map((x) => { const v = s ? x.wert(s) : undefined; return <Zeile key={x.k} titel={x.titel} wert={v === undefined ? '—' : `${fmt(v)}${x.einheit === '×' ? '×' : x.einheit ?? ''}`} />; })}
        </div>

        {/* Fundchancen */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[['Floor', boden, bodenAlle], ['Chest', truhe, truheAlle]].map(([k, a, b]) => (
            <div key={k as string} className="rounded-xl border border-white/[0.07] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{k as string} chance</p>
              <p className="text-sm font-bold tabular-nums text-white">{pro(a as number | undefined)}</p>
              {typeof b === 'number' && b !== a && <p className="text-[10px] tabular-nums text-white/35">{pro(b)} any rarity</p>}
            </div>
          ))}
        </div>

        {/* In Turnieren */}
        {t && t.hits >= 5 && (
          <div className="mt-4 rounded-2xl bg-teal-300/[0.06] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">In tournaments</p>
            <div className="mt-2 space-y-2">
              <Zeile titel="Avg. damage per hit" wert={(t.dmg / t.hits).toFixed(1)} />
              <Balken titel="Headshot rate" wert={(t.krit / t.hits) * 100} />
              <Balken titel="Share of all damage" wert={gesamt ? (t.dmg / gesamt) * 100 : 0} max={40} />
              <Balken titel="Players who used it" wert={spielerTage ? Math.min(100, (t.spieler / spielerTage) * 100) : 0} stellen={0} />
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function Zeile({ titel, wert }: { titel: string; wert: string }) {
  return <div className="flex items-baseline justify-between text-sm"><span className="text-white/50">{titel}</span><span className="font-bold tabular-nums text-white">{wert}</span></div>;
}
function Balken({ titel, wert, max = 100, stellen = 1 }: { titel: string; wert: number; max?: number; stellen?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs"><span className="text-white/50">{titel}</span><span className="font-bold tabular-nums text-white">{wert.toFixed(stellen)} %</span></div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-teal-300" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (wert / max) * 100)}%` }} transition={{ duration: 0.9, delay: 0.2 }} />
      </div>
    </div>
  );
}

function Liste({ liste, stufe, wiki, vergleich, umschalten }: { liste: DbWaffe[]; stufe: (w: DbWaffe) => Stufe | undefined; wiki: Wiki; vergleich: string[]; umschalten: (id: string) => void }) {
  return (
    <Glas className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.2em] text-white/40"><tr><th className="px-4 py-3">Weapon</th>{WERTE.map((d) => <th key={d.k} className="text-right">{d.kurz}</th>)}<th className="text-right">Floor</th><th className="text-right">Chest</th><th className="pr-4" /></tr></thead>
        <tbody>{liste.map((w) => {
          const s = stufe(w);
          return (
            <tr key={w.id} className="border-t border-white/5 hover:bg-white/[0.03]">
              <td className="px-4 py-2"><Link to={`/community/weapons/${w.id}`} className="flex items-center gap-3"><Symbol bild={bildVon(w, wiki)} name={w.name} klein /><span className="font-bold text-white">{w.name}</span><span className="h-2 w-2 rounded-full" style={{ background: selten(s?.rarity ?? 'common').farbe }} /></Link></td>
              {WERTE.map((d) => { const v = s ? d.wert(s) : undefined; return <td key={d.k} className="text-right tabular-nums text-white/85">{v === undefined ? '—' : fmt(v)}</td>; })}
              <td className="text-right tabular-nums text-white/70">{pro(s?.loot?.floor)}</td><td className="text-right tabular-nums text-white/70">{pro(s?.loot?.chest)}</td>
              <td className="pr-4 text-right"><button type="button" onClick={() => umschalten(w.id)} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${vergleich.includes(w.id) ? 'bg-teal-300 text-[#06080f]' : 'bg-white/[0.06] text-white/60'}`}>{vergleich.includes(w.id) ? '✓' : '+'}</button></td>
            </tr>
          );
        })}</tbody>
      </table>
    </Glas>
  );
}
