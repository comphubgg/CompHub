import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glas } from '../../teile/Glas';
import { TEAL } from './Teile';
import { KLASSEN_DB, SELTENHEITEN, WERTE, abgleichSchluessel, fmt, gesamtChance, pro, selten, type Datenbank, type DbWaffe, type Stufe } from './waffenDaten';
import { kern, waffeVon } from './waffenNamen';

/*
 * Volle Waffen-Datenbank (nur wenn public/hub-daten/waffen.json da ist): Karte je Waffe mit Seltenheits-Wahl, die alle Werte umschaltet,
 * Boden-/Truhenchance, darunter "In tournaments" aus Deep Stats. Sortieren/Filtern nach Klasse, Vergleich von 2-3 Waffen nebeneinander.
 * Alle Zahlen stammen aus der Datei bzw. aus den Replays - fehlt ein Wert, steht "—".
 */

export interface TurnierWaffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number; tage: number }
interface Turnier { dmg: number; hits: number; krit: number; spieler: number; tage: number }
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
const bildVon = (w: DbWaffe, wiki: Wiki) => w.icon ?? waffeVon(w.blueprints[0] ?? w.rarities[0]?.wid ?? w.id, wiki).bild;

export default function WaffenDatenbank({ db, turnier, gesamt, spielerTage, wiki }: { db: Datenbank; turnier: TurnierWaffe[]; gesamt: number; spielerTage: number; wiki: Wiki }) {
  const [klasse, setKlasse] = useState<string>('alle');
  const [sorte, setSorte] = useState('klasse');
  const [wunsch, setWunsch] = useState('hoechste');
  const [eigene, setEigene] = useState<Record<string, string>>({});
  const [suche, setSuche] = useState('');
  const [vergleich, setVergleich] = useState<string[]>([]);
  const [offen, setOffen] = useState(false);

  // Turnierwerte den Waffen der Datei zuordnen (ueber Bauplan/WID-Kern); Uebriges bleibt "nur im Turnier gesehen".
  const { proWaffe, ohne } = useMemo(() => {
    const schluessel = new Map<string, string>();
    for (const w of db.weapons) for (const k of abgleichSchluessel(w)) if (!schluessel.has(k)) schluessel.set(k, w.id);
    const m = new Map<string, Turnier>(); const rest: TurnierWaffe[] = [];
    for (const t of turnier) {
      const id = [kern(t.roh), kern(t.roh).replace(/\d+$/, '')].map((k) => schluessel.get(k)).find(Boolean);
      if (!id) { rest.push(t); continue; }
      const x = m.get(id) ?? { dmg: 0, hits: 0, krit: 0, spieler: 0, tage: 0 };
      x.dmg += t.dmg; x.hits += t.hits; x.krit += t.krit; x.spieler += t.spieler; x.tage = Math.max(x.tage, t.tage);
      m.set(id, x);
    }
    return { proWaffe: m, ohne: rest };
  }, [db, turnier]);

  const stufe = (w: DbWaffe) => (eigene[w.id] ? w.rarities.find((r) => r.rarity === eigene[w.id]) : undefined) ?? stufeFuer(w, wunsch);
  const klassen = KLASSEN_DB.map((k) => ({ ...k, n: db.weapons.filter((w) => w.class === k.k).length })).filter((k) => k.n);

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const l = db.weapons.filter((w) => (klasse === 'alle' || w.class === klasse) && (!q || w.name.toLowerCase().includes(q)));
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
  }, [db, klasse, sorte, wunsch, eigene, suche, proWaffe]);

  const umschalten = (id: string) => setVergleich((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 3 ? [...v.slice(1), id] : [...v, id]));
  const imVergleich = vergleich.map((id) => db.weapons.find((w) => w.id === id)!).filter(Boolean);
  const stand = db.exportedAt ? new Date(db.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <div className="space-y-6">
      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Weapons in the pool', String(db.weapons.length)],
          ['Rarity variants', String(db.weapons.reduce((a, w) => a + w.rarities.length, 0))],
          ['Seen in tournaments', String(proWaffe.size)],
          ['From the game files', stand ?? (db.season ? `Season ${db.season}` : 'Export')],
        ].map(([k, v], i) => (
          <Glas key={k} className="p-5" verzoegerung={0.05 * i}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p>
            <p className="mt-1 truncate text-3xl font-extrabold tabular-nums text-white" title={db.build}>{v}</p>
          </Glas>
        ))}
      </div>

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
      </Glas>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {liste.map((w, i) => (
          <DbKarte key={w.id} w={w} s={stufe(w)} waehlen={(r) => setEigene((e) => ({ ...e, [w.id]: r }))} bild={bildVon(w, wiki)} i={i}
            t={proWaffe.get(w.id)} gesamt={gesamt} spielerTage={spielerTage} imVergleich={vergleich.includes(w.id)} vergleichen={() => umschalten(w.id)} />
        ))}
      </div>
      {!liste.length && <p className="text-sm text-white/45">No weapon matches.</p>}

      {ohne.length > 0 && (
        <p className="text-xs text-white/35">
          Also seen in tournaments but not in the game-file export: {ohne.slice(0, 12).map((t) => waffeVon(t.roh, wiki).name).join(', ')}{ohne.length > 12 ? ` and ${ohne.length - 12} more` : ''}.
        </p>
      )}
      <p className="text-xs leading-relaxed text-white/35">
        Base stats and loot chances: exported from the game files{db.build ? ` (${db.build})` : ''}{db.playlist ? `, loot for ${db.playlist}` : ''}. Damage is per body shot (all pellets for shotguns).
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
            {imVergleich.length < 3 && <span className="whitespace-nowrap text-xs text-white/35">{imVergleich.length === 1 ? 'pick 1–2 more' : 'add 1 more?'}</span>}
            <button type="button" disabled={imVergleich.length < 2} onClick={() => setOffen(true)}
              className="whitespace-nowrap rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-teal-200 disabled:opacity-30">Compare {imVergleich.length}</button>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {offen && imVergleich.length >= 2 && (
          <Vergleich waffen={imVergleich} wiki={wiki} start={(w) => stufe(w)?.rarity} proWaffe={proWaffe} schliessen={() => setOffen(false)} />
        )}
      </AnimatePresence>
      </>, document.body)}
    </div>
  );
}

function Symbol({ bild, name, klein }: { bild: string | null; name: string; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  const g = klein ? 'h-7 w-7' : 'h-[110px] w-[110px]';
  if (!bild || kaputt) return <span className={`grid ${g} place-items-center rounded-lg text-white/20 ${klein ? 'bg-white/5 text-xs' : 'text-4xl font-black'}`}>?</span>;
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
        {w.ammo && <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/60 backdrop-blur">{w.ammo}</span>}
      </div>
      <div className="p-5 pt-4">
        <h3 className="truncate text-lg font-extrabold tracking-tight text-white" title={w.name}>{w.name}</h3>
        <div className="mt-2.5 flex gap-1">
          {SELTENHEITEN.filter((x) => x.k !== 'exotic' || w.rarities.some((r) => r.rarity === 'exotic')).map((x) => {
            const da = w.rarities.some((r) => r.rarity === x.k);
            return (
              <button key={x.k} type="button" title={da ? x.titel : `${x.titel} – not in the pool`} disabled={!da} onClick={() => waehlen(x.k)}
                className={`h-5 flex-1 rounded-md transition ${s?.rarity === x.k ? 'ring-2 ring-white/80' : da ? 'opacity-45 hover:opacity-90' : 'cursor-not-allowed opacity-[0.08]'}`} style={{ background: x.farbe }} />
            );
          })}
        </div>
        <p className="mt-1 text-[11px] font-semibold" style={{ color: farbe }}>{selten(s?.rarity ?? 'common').titel}{(s?.pellets ?? 1) > 1 ? <span className="text-white/40"> · {s!.pellets} pellets × {fmt(s!.damage!)}</span> : null}</p>

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

/* ---------------------------------------------- Vergleich: 2-3 Waffen nebeneinander, jede mit eigener Seltenheit */
function Vergleich({ waffen, wiki, start, proWaffe, schliessen }: { waffen: DbWaffe[]; wiki: Wiki; start: (w: DbWaffe) => string | undefined; proWaffe: Map<string, Turnier>; schliessen: () => void }) {
  const [wahl, setWahl] = useState<Record<string, string>>(() => Object.fromEntries(waffen.map((w) => [w.id, start(w) ?? w.rarities[0]?.rarity ?? 'common'])));
  const stufen = waffen.map((w) => w.rarities.find((r) => r.rarity === wahl[w.id]) ?? w.rarities[0]);
  const zeilen: Array<{ titel: string; werte: Array<number | undefined>; text: (v: number, i: number) => string; hoeher: boolean }> = [
    ...WERTE.map((x) => ({ titel: x.titel, werte: stufen.map((s) => (s ? x.wert(s) : undefined)), hoeher: x.hoeher,
      text: (v: number, i: number) => `${x.text && stufen[i] ? x.text(stufen[i]!) : fmt(v)}${x.einheit ?? ''}${x.k === 'dps' && stufen[i]?.dpsGerechnet ? ' (calc.)' : ''}` })),
    { titel: 'Floor chance', werte: stufen.map((s) => s?.loot?.floor ?? undefined), hoeher: true, text: (v: number) => pro(v) },
    { titel: 'Chest chance', werte: stufen.map((s) => s?.loot?.chest ?? undefined), hoeher: true, text: (v: number) => pro(v) },
    { titel: 'Tournament dmg / hit', werte: waffen.map((w) => { const t = proWaffe.get(w.id); return t && t.hits >= 5 ? t.dmg / t.hits : undefined; }), hoeher: true, text: (v: number) => v.toFixed(1) },
    { titel: 'Tournament headshot rate', werte: waffen.map((w) => { const t = proWaffe.get(w.id); return t && t.hits >= 5 ? (t.krit / t.hits) * 100 : undefined; }), hoeher: true, text: (v: number) => `${v.toFixed(1)} %` },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={schliessen}>
      <motion.div initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }} onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0f1a]/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${TEAL})` }}>Compare</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Side by side</h2>
          </div>
          <button type="button" onClick={schliessen} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:text-white">Close ✕</button>
        </div>
        <div className="mt-5 grid gap-x-4" style={{ gridTemplateColumns: `minmax(130px,0.8fr) repeat(${waffen.length}, minmax(0,1fr))` }}>
          <div />
          {waffen.map((w, i) => {
            const f = selten(stufen[i]?.rarity ?? 'common').farbe;
            return (
              <div key={w.id} className="rounded-2xl p-3 text-center" style={{ background: `linear-gradient(180deg, ${f}33, transparent)` }}>
                <div className="mx-auto w-fit"><Symbol bild={bildVon(w, wiki)} name={w.name} /></div>
                <p className="mt-1 truncate font-extrabold text-white">{w.name}</p>
                <div className="mt-2 flex justify-center gap-1">
                  {w.rarities.map((r) => (
                    <button key={r.rarity} type="button" title={selten(r.rarity).titel} onClick={() => setWahl((x) => ({ ...x, [w.id]: r.rarity }))}
                      className={`h-4 w-6 rounded transition ${wahl[w.id] === r.rarity ? 'ring-2 ring-white/80' : 'opacity-45 hover:opacity-90'}`} style={{ background: selten(r.rarity).farbe }} />
                  ))}
                </div>
              </div>
            );
          })}
          {zeilen.map((z) => {
            const da = z.werte.filter((v): v is number => v !== undefined);
            const best = da.length > 1 ? (z.hoeher ? Math.max(...da) : Math.min(...da)) : undefined;
            const max = da.length ? Math.max(...da) : 0;
            return [
              <div key={`${z.titel}-t`} className="border-t border-white/5 py-2.5 text-sm text-white/50">{z.titel}</div>,
              ...z.werte.map((v, i) => (
                <div key={`${z.titel}-${i}`} className="border-t border-white/5 px-2 py-2.5">
                  <p className={`text-sm font-bold tabular-nums ${v === undefined ? 'text-white/25' : v === best ? 'text-teal-300' : 'text-white'}`}>{v === undefined ? '—' : z.text(v, i)}</p>
                  {v !== undefined && max > 0 && <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className={`h-full rounded-full ${v === best ? 'bg-teal-300' : 'bg-white/30'}`} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} /></div>}
                </div>
              )),
            ];
          })}
        </div>
        <p className="mt-4 text-[11px] text-white/35">Best value per row in teal (lower is better for reload time). Values from the game-file export; tournament rows from replays.</p>
      </motion.div>
    </motion.div>
  );
}
