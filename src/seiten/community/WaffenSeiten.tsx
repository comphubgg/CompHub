import { motion } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abschnitt, Flaeche, Marke } from '../../ds/Bausteine';
import { LinkKopieren } from './Bausteine';
import { bildNachName, waffeVon } from './waffenNamen';
import {
  KLASSEN_DB, QUELLEN, SELTENHEITEN, WERTE, WERTE_MEHR, ZIELE, fmt, gesamtChance, pro, selten, zeitBisKill, type Datenbank, type DbWaffe, type Stufe,
} from './waffenDaten';
import { Linie, Tipp, WaffenBild, WaffenReiter, Wert, schein } from './waffenTeile';
import { saisonText, saisonWert, saisonenVon } from './WaffenDatenbank';
import { useAktuelleSaison } from './waffenWiki';

/*
 * Unterseiten der Waffen (Design 3.0, neu komponiert 28.11.2026):
 *   Einzelwaffe (/community/weapons/:id) - wie fortnite.gg/weapons, eigene Anordnung: Buehne (Bild auf dem Schein der Seltenheit | Name,
 *     Seltenheiten, Saisons, Vergleich) mit der Zahlenreihe darunter; "Among <class>" neben der Zeit bis zum Kill; Schaden nach Entfernung und
 *     Fundorte nur, wenn die Daten da sind; "In cups" (Deep Stats - hat sonst niemand); alle Seltenheiten; Verlauf; mehr aus der Klasse.
 *   Vergleich (/compare?w=id:rarity,...) - 2-4 Waffen nebeneinander, Werte + TTK + Abfall-Kurven uebereinander; Auswahl steht in der Adresse.
 *   Aenderungen (/changes) - Werte-Aenderungen aus dem Export (alt -> neu), sonst Waffen je Saison (neu / vaulted) aus dem Wiki.
 * Grundwerte aus waffen.json bzw. dem Fortnite Wiki; TTK, Rang in der Klasse und Kopfschaden sind daraus gerechnet und so gekennzeichnet.
 */

export interface Turnier { dmg: number; hits: number; krit: number; spieler: number; tage: number }
type Wiki = Map<string, { name: string; bild: string }> | undefined;
/** Bild: Export-Symbol, Spiel-Symbol (/waffen), dann das Wiki-Bild - je Seltenheit, wo das Wiki eins hat. */
export const bildVon = (w: DbWaffe, wiki: Wiki, seltenheit?: string) => w.icon ?? (w.blueprints[0] || w.rarities[0]?.wid ? waffeVon(w.blueprints[0] ?? w.rarities[0]!.wid!, wiki).bild : null) ?? bildNachName(w.name, wiki)
  ?? (seltenheit ? w.wikiBilder?.[seltenheit] : undefined) ?? w.wikiBild ?? (w.wikiBilder ? Object.values(w.wikiBilder)[0] : undefined) ?? null;
const ALLE_WERTE = [...WERTE, ...WERTE_MEHR];
const MODUS_TITEL: Record<string, string> = { br: 'Battle Royale', zb: 'Zero Build', reload: 'Reload', blitz: 'Blitz', og: 'OG', ranked: 'Ranked', creative: 'Creative' };
/** Linienfarben im Vergleich: Bereichsfarbe zuerst, dann neutrale Toene (keine zweite Bereichsfarbe). */
const LINIEN = ['rgb(var(--akz))', '#f8fafc', '#fbbf24', '#fb7185'];

/** Naechste Seltenheit einer anderen Waffe zum Vergleich in der Klasse. */
function naechste(w: DbWaffe, r: string): Stufe | undefined {
  const i = SELTENHEITEN.findIndex((s) => s.k === r);
  return [...w.rarities].sort((a, b) => Math.abs(SELTENHEITEN.findIndex((s) => s.k === a.rarity) - i) - Math.abs(SELTENHEITEN.findIndex((s) => s.k === b.rarity) - i))[0];
}
const TTK_FORMEL = <>Time to kill = (shots − 1) ÷ fire rate + reloads × reload time, with shots = ⌈HP ÷ (damage × pellets{' '}× headshot multiplier)⌉. Every shot hits, no damage falloff, a reload whenever the magazine runs dry.</>;

function Karte({ ueber, titel, rechts, children, className = '', verz = 0 }: { ueber?: string; titel: ReactNode; rechts?: ReactNode; children: ReactNode; className?: string; verz?: number }) {
  return (
    <Flaeche fest className={`p-5 sm:p-6 ${className}`} verz={verz}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>{ueber && <p className="ueber !tracking-[0.25em]">{ueber}</p>}<h2 className="titel text-2xl sm:text-3xl">{titel}</h2></div>
        {rechts}
      </div>
      {children}
    </Flaeche>
  );
}

/* ---------------------------------------------- Einzelwaffe */
export function Einzelwaffe({ db, wiki, proWaffe, gesamt, spielerTage, vergleich, vergleichen }: {
  db: Datenbank; wiki: Wiki; proWaffe: Map<string, Turnier>; gesamt: number; spielerTage: number; vergleich: string[]; vergleichen: (id: string) => void;
}) {
  const { id } = useParams();
  const w = db.weapons.find((x) => x.id === id);
  const [r, setR] = useState<string | null>(null);
  const aktuell = useAktuelleSaison();
  if (!w) return <Flaeche fest className="p-6 text-sm text-white/60">This weapon isn't in the database. <Link to="/community/weapons" className="font-semibold text-akz">Back to the loot pool</Link></Flaeche>;
  const s = w.rarities.find((x) => x.rarity === r) ?? w.rarities[w.rarities.length - 1];
  const rar = s?.rarity ?? 'common';
  const farbe = selten(rar).farbe;
  const klasse = KLASSEN_DB.find((k) => k.k === w.class)?.titel ?? 'Weapons';
  const andere = db.weapons.filter((x) => x.class === w.class);
  const t = proWaffe.get(w.id);
  const aenderungen = db.changes.filter((c) => c.weaponId === w.id).sort((a, b) => b.date.localeCompare(a.date));
  const wert = (k: string, st?: Stufe) => (st ? ALLE_WERTE.find((x) => x.k === k)?.wert(st) : undefined);
  const zeigen = (k: string, v: number | undefined) => { const d = ALLE_WERTE.find((x) => x.k === k)!; return v === undefined ? '—' : `${fmt(v)}${d.einheit ?? ''}`; };
  const quellen = [...new Set([...Object.keys(s?.loot ?? {}), ...w.rarities.flatMap((x) => Object.keys(x.loot ?? {}))])];
  const saisons = saisonenVon(w, aktuell?.k);
  const imVergleich = vergleich.includes(w.id);
  const bild = bildVon(w, wiki, rar);

  const rang = s ? ['damage', 'dps', 'fireRate', 'magazine', 'reloadTime', 'equipTime', 'structureDamage'].map((k) => {
    const d = ALLE_WERTE.find((x) => x.k === k)!;
    const werte = andere.map((x) => ({ id: x.id, v: d.wert(x.id === w.id ? s : naechste(x, s.rarity)!) })).filter((x): x is { id: string; v: number } => x.v !== undefined);
    const eigen = werte.find((x) => x.id === w.id);
    if (!eigen || werte.length < 2) return null;
    const sortiert = [...werte].sort((a, b) => (d.hoeher ? b.v - a.v : a.v - b.v));
    return { d, v: eigen.v, platz: sortiert.findIndex((x) => x.id === w.id) + 1, n: werte.length, max: Math.max(...werte.map((x) => x.v)) };
  }).filter((x): x is NonNullable<typeof x> => !!x) : [];
  // Rang in den Cups (nach Schaden) - nur unter den Waffen, die dort gesehen wurden
  const cupRang = t ? [...proWaffe.values()].filter((x) => x.hits >= 5).sort((a, b) => b.dmg - a.dmg).indexOf(t) + 1 : 0;
  const cupN = [...proWaffe.values()].filter((x) => x.hits >= 5).length;

  const zahlen: Array<[string, number | undefined, string, ReactNode?]> = [
    ['Damage', wert('damage', s), '', wert('headshotDamage', s) !== undefined ? `${fmt(wert('headshotDamage', s)!)} headshot` : (s?.pellets ?? 1) > 1 ? `${s!.pellets} pellets` : undefined],
    ['DPS', s?.dps, '', s?.dpsGerechnet ? 'damage × fire rate' : 'per second'],
    ['Fire rate', s?.fireRate, '', 'shots per second'],
    ['Magazine', s?.magazine, '', s?.magazine && s?.fireRate ? `${fmt(s.magazine / s.fireRate)}s to empty` : 'per reload'],
    ['Reload', s?.reloadTime, '', 'seconds'],
    ['Headshot', s?.headshotMultiplier, '×', 'multiplier'],
    ['Structures', s?.structureDamage, '', 'damage to builds'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link to="/community/weapons" className="font-semibold text-white/60 hover:text-white">← Weapons</Link><span className="text-white/25">/</span><span className="text-white/45">{klasse}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2"><WaffenReiter ids={vergleich} /><LinkKopieren /></div>
      </div>

      {/* Buehne */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="fl-fest overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="relative grid min-h-[220px] place-items-center overflow-hidden p-8 transition-[background] duration-500 sm:min-h-[280px]" style={schein(rar, 0.55)}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:32px_32px]" />
            <motion.div key={bild ?? ''} initial={{ opacity: 0, scale: 0.92, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="relative grid h-40 w-full place-items-center sm:h-60">
              <WaffenBild bild={bild} name={w.name} className="h-full w-full" />
            </motion.div>
            <span className="absolute inset-x-0 bottom-0 h-1 transition-colors duration-500" style={{ background: farbe }} />
            <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
              {w.vaulted ? <Marke ton="gold">Vaulted</Marke> : <Marke ton="gruen">In the pool now</Marke>}
              {w.ammo && <Marke>{w.ammo}</Marke>}
            </div>
          </div>
          <div className="flex flex-col p-6 sm:p-8">
            <p className="ueber">{klasse}</p>
            <h1 className="titel mt-1 text-5xl sm:text-6xl xl:text-7xl">{w.name}</h1>
            {w.description && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">{w.description}</p>}
            {w.rarities.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {w.rarities.map((x) => {
                  const an = x.rarity === rar; const f = selten(x.rarity).farbe;
                  return (
                    <button key={x.rarity} type="button" onClick={() => setR(x.rarity)} className={`relative rounded-lg border px-3 py-1.5 text-xs font-bold transition ${an ? 'text-[#04050a]' : 'border-white/10 text-white/70 hover:text-white'}`} style={an ? { background: f, borderColor: f } : undefined}>
                      {!an && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: f }} />}{selten(x.rarity).titel}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => vergleichen(w.id)} className={imVergleich ? 'knopf !border-akz/50' : 'knopf-prim'}>{imVergleich ? '✓ In compare' : '+ Add to compare'}</button>
              {vergleich.length >= 2 && imVergleich && <Link to={`/community/weapons/compare?w=${vergleich.join(',')}`} className="knopf">Compare {vergleich.length} →</Link>}
              <Link to={`/community/assets?q=${encodeURIComponent(w.name)}`} className="knopf">Asset Studio</Link>
            </div>
            {saisons.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{saisons.length} {saisons.length === 1 ? 'season' : 'seasons'} · {saisonText(saisons[0])}{saisons.length > 1 ? ` – ${saisonText(saisons.at(-1)!)}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1">{saisons.map((x) => <span key={x} className={`zahl rounded-md px-2 py-0.5 text-[11px] font-bold ${x === aktuell?.k ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.06] text-white/70'}`}>{saisonText(x)}</span>)}</div>
              </div>
            )}
            {w.modes?.length ? (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Modes</p>
                <div className="mt-2 flex flex-wrap gap-1">{w.modes.map((m) => <span key={m} className="rounded-md bg-akz/15 px-2 py-0.5 text-[11px] font-bold text-akz">{MODUS_TITEL[m] ?? m}</span>)}</div>
              </div>
            ) : db.playlist ? <p className="mt-4 text-xs text-white/40">Loot pool of {db.playlist}</p> : null}
            {w.wiki && <a href={w.wiki} target="_blank" rel="noreferrer" className="mt-auto pt-6 text-xs font-semibold text-white/40 hover:text-white">Data: Fortnite Wiki, CC BY-SA ↗</a>}
          </div>
        </div>
        {/* Zahlenreihe */}
        <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-4 lg:grid-cols-7">
          {zahlen.map(([k, v, e, u], i) => (
            <div key={k} className={`bg-fl px-5 py-4 ${i === zahlen.length - 1 ? 'max-sm:col-span-2' : ''}`}>
              <Wert titel={k} wert={v === undefined ? '—' : `${fmt(v)}${e}`} unter={u} gross={i < 2} ton={i === 1 && v !== undefined ? '!text-akz' : v === undefined ? '!text-white/25' : ''} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* Klasse | TTK */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {rang.length > 0 ? (
          <Karte ueber={`${selten(rar).titel} vs. the closest rarity of each`} titel={`Among ${klasse.toLowerCase()}`} rechts={<span className="zahl text-xs text-white/40">{andere.length} weapons</span>}>
            <div className="space-y-3.5">
              {rang.map((x) => (
                <div key={x.d.k} className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-3 text-sm sm:grid-cols-[130px_minmax(0,1fr)_64px_92px]">
                  <span className="truncate text-white/60">{x.d.titel}</span>
                  <Linie anteil={(x.v / x.max) * 100} ton={x.platz === 1 ? 'bg-amber-300' : 'bg-akz'} />
                  <span className="zahl text-right font-bold text-white">{fmt(x.v)}{x.d.einheit ?? ''}</span>
                  <span className={`hidden rounded-md px-2 py-0.5 text-center text-[11px] font-bold sm:block ${x.platz === 1 ? 'bg-amber-300 text-[#04050a]' : x.platz <= Math.ceil(x.n / 2) ? 'bg-akz/15 text-akz' : 'bg-white/[0.06] text-white/55'}`}>{x.platz === 1 ? `Best of ${x.n}` : `#${x.platz} of ${x.n}`}</span>
                </div>
              ))}
            </div>
          </Karte>
        ) : <Karte titel={`Among ${klasse.toLowerCase()}`}><p className="text-sm text-white/45">No other {klasse.toLowerCase()} with comparable stats.</p></Karte>}
        <Karte ueber="Calculated" titel="Time to kill" rechts={<Tipp>{TTK_FORMEL}</Tipp>} verz={0.05}>
          <table className="tabelle">
            <thead><tr><th className="!pl-0">Target</th><th className="!text-right">Body</th><th className="!pr-0 !text-right">Headshots</th></tr></thead>
            <tbody>{ZIELE.map((z) => {
              const k = s ? zeitBisKill(s, z.hp, false) : null; const h = s ? zeitBisKill(s, z.hp, true) : null;
              const zelle = (x: typeof k) => (x ? <><span className="zahl font-bold text-white">{x.sekunden.toFixed(2)}s</span> <span className="zahl text-[11px] text-white/40">{x.schuesse} {x.schuesse === 1 ? 'shot' : 'shots'}</span></> : <span className="text-white/25">—</span>);
              return <tr key={z.hp}><td className="!pl-0 text-white/65">{z.titel}</td><td className="text-right">{zelle(k)}</td><td className="!pr-0 text-right">{zelle(h)}</td></tr>;
            })}</tbody>
          </table>
        </Karte>
      </div>

      {/* Entfernung | Fundorte - nur mit Daten */}
      {(s?.falloff?.length || quellen.length) ? (
        <div className={`grid gap-5 ${s?.falloff?.length && quellen.length ? 'lg:grid-cols-2' : ''}`}>
          {s?.falloff?.length && s.damage !== undefined ? <Karte ueber="Falloff" titel="Damage by distance"><Abfall reihen={[{ s, farbe: LINIEN[0], name: w.name }]} /></Karte> : null}
          {quellen.length > 0 && (
            <Karte ueber={selten(rar).titel} titel="Where to find it" verz={0.05}>
              <div className="space-y-3">
                {quellen.map((q) => {
                  const v = s?.loot?.[q] ?? undefined; const max = Math.max(...quellen.map((x) => s?.loot?.[x] ?? 0), 0.01);
                  return (
                    <div key={q} className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
                      <span className="text-white/60">{QUELLEN[q] ?? q}</span><Linie anteil={((v ?? 0) / max) * 100} /><span className="zahl text-right font-bold text-white">{pro(v)}</span>
                    </div>
                  );
                })}
                <p className="pt-1 text-xs text-white/40">Any rarity: {quellen.map((q) => `${QUELLEN[q] ?? q} ${pro(gesamtChance(w, q))}`).join(' · ')}</p>
              </div>
            </Karte>
          )}
        </div>
      ) : <p className="text-xs text-white/35">Damage falloff and spawn chances come from the game-file export – not available for this weapon.</p>}

      {/* In Cups - Deep Stats */}
      {t && t.hits >= 5 && (
        <Karte ueber="Only on CompHub · latest cups this season" titel="In competitive play" rechts={<Link to="/competitive/deep-stats" className="knopf-leer">Deep Stats →</Link>}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
            <Wert titel="Rank by damage" wert={cupRang ? `#${cupRang}` : '—'} unter={cupN ? `of ${cupN} weapons` : undefined} ton="!text-akz" />
            <Wert titel="Damage dealt" wert={t.dmg.toLocaleString('en')} unter={`${t.hits.toLocaleString('en')} hits`} />
            <Wert titel="Damage per hit" wert={(t.dmg / t.hits).toFixed(1)} unter="rarities pooled" />
            <Wert titel="Headshot rate" wert={`${((t.krit / t.hits) * 100).toFixed(1)}%`} />
            <Wert titel="Share of all damage" wert={gesamt ? `${((t.dmg / gesamt) * 100).toFixed(1)}%` : '—'} />
            <Wert titel="Players used it" wert={spielerTage ? `${Math.min(100, (t.spieler / spielerTage) * 100).toFixed(0)}%` : '—'} unter={`on ${t.tage} cup ${t.tage === 1 ? 'day' : 'days'}`} />
          </div>
        </Karte>
      )}

      {/* Alle Seltenheiten */}
      {w.rarities.length > 0 && (
        <Karte titel="All rarities">
          <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
            <table className="tabelle min-w-[520px]">
              <thead><tr><th className="!pl-0" />{w.rarities.map((x) => <th key={x.rarity} className={`!text-right ${x.rarity === rar ? 'rounded-t-lg bg-white/[0.05]' : ''}`} style={{ color: selten(x.rarity).farbe }}>{selten(x.rarity).titel}</th>)}</tr></thead>
              <tbody>{ALLE_WERTE.filter((d) => w.rarities.some((x) => d.wert(x) !== undefined)).map((d) => {
                const werte = w.rarities.map((x) => d.wert(x));
                const da = werte.filter((v): v is number => v !== undefined); const best = new Set(da).size > 1 ? Math.max(...da.map((v) => (d.hoeher ? v : -v))) : NaN;
                return (
                  <tr key={d.k}><td className="!pl-0 text-white/55">{d.titel}</td>
                    {werte.map((v, i) => <td key={i} className={`zahl text-right ${w.rarities[i].rarity === rar ? 'bg-white/[0.05]' : ''} ${v !== undefined && (d.hoeher ? v : -v) === best && werte.length > 1 ? 'font-bold text-akz' : 'text-white'}`}>{zeigen(d.k, v)}</td>)}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Karte>
      )}

      {/* Verlauf: Patch-Aenderungen (Export) und Wiki-Geschichte */}
      {(aenderungen.length > 0 || (w.historie?.length ?? 0) > 0) && (
        <Karte titel="Changes" ueber={aenderungen.length ? 'Patch by patch' : 'From the Fortnite Wiki'}>
          {aenderungen.length > 0 && <ul className="space-y-1.5">{aenderungen.map((c, i) => <AenderungZeile key={i} c={c} />)}</ul>}
          {(w.historie?.length ?? 0) > 0 && <WikiVerlauf h={w.historie!} />}
        </Karte>
      )}

      {/* Mehr aus der Klasse */}
      {andere.length > 1 && (
        <Abschnitt titel={`More ${klasse.toLowerCase()}`} zu="/community/weapons" zuText="Loot pool">
          <div className="ohne-leiste -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:-mx-8 lg:px-8">
            {andere.filter((x) => x.id !== w.id).sort((a, b) => Number(!!a.vaulted) - Number(!!b.vaulted) || a.name.localeCompare(b.name)).slice(0, 24).map((x) => {
              const st = naechste(x, rar);
              return (
                <Link key={x.id} to={`/community/weapons/${x.id}`} onClick={() => setR(null)} className="fl-fest fl-klick group w-44 shrink-0 overflow-hidden !rounded-2xl">
                  <div className="grid h-28 place-items-center p-3" style={schein(st?.rarity ?? 'common', 0.35)}><WaffenBild bild={bildVon(x, wiki)} name={x.name} className="h-[88px] w-full transition duration-500 group-hover:scale-110" /></div>
                  <div className="p-3"><p className="truncate text-sm font-bold text-white group-hover:text-akz">{x.name}</p><p className="zahl text-[11px] text-white/45">{st?.dps !== undefined ? `${fmt(st.dps)} DPS` : x.vaulted ? 'Vaulted' : 'In the pool'}</p></div>
                </Link>
              );
            })}
          </div>
        </Abschnitt>
      )}
    </div>
  );
}

/** Geschichte aus dem Wiki (Abschnitt "Update History"/"Changelog") - Text, wie er dort steht; neu/unvaulted gruen, vaulted/entfernt gelb. */
function WikiVerlauf({ h }: { h: Array<{ wann?: string; text: string }> }) {
  const [alle, setAlle] = useState(false);
  const zeigen = alle ? h : h.slice(0, 12);
  return (
    <div className="mt-3">
      <ul className="space-y-1.5">
        {zeigen.map((x, i) => {
          const ton = /unvault|added|introduc|return/i.test(x.text) ? 'bg-emerald-400' : /vault|remov|disabled/i.test(x.text) ? 'bg-amber-300' : 'bg-white/30';
          return (
            <li key={i} className="flex gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ton}`} />
              {x.wann && <span className="zahl w-24 shrink-0 text-xs font-bold text-white/50">{x.wann}</span>}
              <span className="text-white/75">{x.text}</span>
            </li>
          );
        })}
      </ul>
      {h.length > 12 && <button type="button" onClick={() => setAlle((v) => !v)} className="knopf-leer mt-3">{alle ? 'Less' : `All ${h.length} entries`}</button>}
    </div>
  );
}

/** Schaden nach Entfernung - eine oder mehrere Waffen (Vergleich), Koerper durchgezogen, Kopf gestrichelt. */
function Abfall({ reihen }: { reihen: Array<{ s: Stufe; farbe: string; name: string }> }) {
  const mit = reihen.filter((r) => r.s.falloff?.length && r.s.damage !== undefined);
  const maxD = Math.max(100, ...mit.flatMap((r) => r.s.falloff!.map((p) => p.distance)));
  const maxV = Math.max(1, ...mit.map((r) => r.s.damage! * (r.s.pellets ?? 1) * (r.s.headshotMultiplier ?? 1)));
  const x = (d: number) => 34 + (d / maxD) * 456; const y = (v: number) => 172 - (v / maxV) * 150;
  return (
    <div>
      <svg viewBox="0 0 500 192" className="w-full">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={34} x2={490} y1={y(maxV * f)} y2={y(maxV * f)} stroke="rgba(255,255,255,0.06)" /><text x={28} y={y(maxV * f) + 3} fill="rgba(255,255,255,0.35)" fontSize="9" textAnchor="end">{fmt(maxV * f)}</text></g>)}
        {[0, 25, 50, 75, 100, 150, 200].filter((d) => d <= maxD).map((d) => <text key={d} x={x(d)} y={188} fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle">{d} m</text>)}
        {mit.map((r) => {
          const basis = r.s.damage! * (r.s.pellets ?? 1); const pkt = r.s.falloff!;
          const pfad = (m: number) => pkt.map((p, i) => `${i ? 'L' : 'M'}${x(p.distance)} ${y(basis * m * p.factor)}`).join(' ');
          return (
            <g key={r.name}>
              <path d={pfad(r.s.headshotMultiplier ?? 1)} fill="none" style={{ stroke: r.farbe }} strokeOpacity={0.6} strokeDasharray="5 4" strokeWidth="2" />
              <path d={pfad(1)} fill="none" style={{ stroke: r.farbe }} strokeWidth="2.5" />
              {mit.length === 1 && pkt.map((p) => <text key={p.distance} x={x(p.distance)} y={y(basis * p.factor) - 7} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle">{fmt(basis * p.factor)}</text>)}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40">{mit.length > 1 && mit.map((r) => <span key={r.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.farbe }} />{r.name}</span>)}<span>Solid = body, dashed = headshot.</span></div>
    </div>
  );
}

function AenderungZeile({ c, mitWaffe, bild }: { c: Datenbank['changes'][number]; mitWaffe?: string; bild?: string | null }) {
  const titel = ALLE_WERTE.find((d) => d.k === c.field)?.titel ?? QUELLEN[c.field] ?? c.field;
  const zahl = (v: unknown) => (typeof v === 'number' ? fmt(v) : v == null ? '—' : String(v));
  const besser = typeof c.from === 'number' && typeof c.to === 'number' ? ((ALLE_WERTE.find((d) => d.k === c.field)?.hoeher ?? true) ? c.to > c.from : c.to < c.from) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/25 px-3 py-2 text-sm">
      <span className={`h-full w-1 self-stretch rounded-full ${besser === null ? 'bg-white/20' : besser ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {mitWaffe && <span className="flex min-w-0 items-center gap-2 font-bold text-white">{bild !== undefined && <WaffenBild bild={bild} name={mitWaffe} className="h-7 w-10 shrink-0" schatten={false} />}{mitWaffe}</span>}
      {!mitWaffe && <span className="zahl w-24 text-xs text-white/40">{c.date}{c.build ? ` · v${c.build}` : ''}</span>}
      {c.rarity && <span className="text-xs font-bold" style={{ color: selten(c.rarity).farbe }}>{selten(c.rarity).titel}</span>}
      <span className="text-white/65">{titel}</span>
      <span className="zahl text-white/45 line-through">{zahl(c.from)}</span><span className="text-white/30">→</span>
      <span className={`zahl font-bold ${besser === null ? 'text-white' : besser ? 'text-emerald-300' : 'text-rose-300'}`}>{zahl(c.to)}</span>
      {besser !== null && <span className={`text-[10px] font-bold uppercase ${besser ? 'text-emerald-300/80' : 'text-rose-300/80'}`}>{besser ? 'buff' : 'nerf'}</span>}
      {c.modes?.length ? <span className="ml-auto text-[10px] font-bold uppercase text-white/35">{c.modes.map((m) => MODUS_TITEL[m] ?? m).join(' · ')}</span> : null}
    </li>
  );
}

/* ---------------------------------------------- Vergleich */
export function VergleichSeite({ db, wiki, proWaffe, setVergleich }: { db: Datenbank | null; wiki: Wiki; proWaffe: Map<string, Turnier>; setVergleich: (ids: string[]) => void }) {
  const [suche, setSuche] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const auswahl = (suche.get('w') ?? '').split(',').filter(Boolean).map((t) => { const [id, r] = t.split(':'); return { id, r }; })
    .filter((x) => db?.weapons.some((w) => w.id === x.id)).slice(0, 4);
  const schreiben = (l: Array<{ id: string; r?: string }>) => { setSuche(l.length ? { w: l.map((x) => (x.r ? `${x.id}:${x.r}` : x.id)).join(',') } : {}, { replace: true }); setVergleich(l.map((x) => x.id)); };
  const vorschlaege = useMemo(() => {
    if (!db) return [];
    // Paare aus dem aktuellen Pool, je Klasse die ersten zwei mit Werten
    return KLASSEN_DB.map((k) => db.weapons.filter((w) => w.class === k.k && !w.vaulted && w.rarities.some((r) => r.damage !== undefined))).filter((l) => l.length >= 2).map((l) => [l[0], l[1]]).slice(0, 4);
  }, [db]);
  if (!db) return <p className="text-sm text-white/55">Compare needs the weapon stats from the Fortnite Wiki or the game-file export – neither answered just now.</p>;
  const waffen = auswahl.map((x) => ({ w: db.weapons.find((y) => y.id === x.id)!, r: x.r }));
  const stufen = waffen.map(({ w, r }) => w.rarities.find((x) => x.rarity === r) ?? w.rarities[w.rarities.length - 1]);
  const treffer = q.length >= 1 ? db.weapons.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()) && !auswahl.some((a) => a.id === w.id)).slice(0, 8) : [];
  const zeilen: Array<{ titel: string; werte: Array<number | undefined>; hoeher: boolean; text: (v: number) => string; gruppe: string }> = [
    ...ALLE_WERTE.map((d) => ({ titel: d.titel, werte: stufen.map((s) => (s ? d.wert(s) : undefined)), hoeher: d.hoeher, text: (v: number) => `${fmt(v)}${d.einheit ?? ''}`, gruppe: 'Stats' })),
    ...ZIELE.map((z) => ({ titel: z.titel, werte: stufen.map((s) => (s ? zeitBisKill(s, z.hp, false)?.sekunden : undefined)), hoeher: false, text: (v: number) => `${v.toFixed(2)}s`, gruppe: 'Time to kill' })),
    { titel: 'Headshots to kill (200)', werte: stufen.map((s) => (s ? zeitBisKill(s, 200, true)?.schuesse : undefined)), hoeher: false, text: (v: number) => String(v), gruppe: 'Time to kill' },
    ...Object.keys(QUELLEN).map((q2) => ({ titel: `${QUELLEN[q2]}`, werte: stufen.map((s) => s?.loot?.[q2] ?? undefined), hoeher: true, text: (v: number) => pro(v), gruppe: 'Where to find it' })),
    { titel: 'Damage per hit in cups', werte: waffen.map(({ w }) => { const t = proWaffe.get(w.id); return t && t.hits >= 5 ? t.dmg / t.hits : undefined; }), hoeher: true, text: (v: number) => v.toFixed(1), gruppe: 'In cups' },
  ].filter((z) => z.werte.some((v) => v !== undefined));
  const bestIn = waffen.map((_, i) => zeilen.filter((z) => { const da = z.werte.filter((v): v is number => v !== undefined); return da.length > 1 && z.werte[i] === (z.hoeher ? Math.max(...da) : Math.min(...da)); }).length);
  const mitAbfall = stufen.some((s) => s?.falloff?.length);
  const ttk200 = stufen.map((s) => (s ? zeitBisKill(s, 200, false)?.sekunden : undefined));
  const ttkMax = Math.max(0.01, ...ttk200.filter((v): v is number => v !== undefined));
  const spalten = `minmax(120px,0.7fr) repeat(${Math.max(1, waffen.length)}, minmax(130px,1fr))`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={auswahl.length >= 4} placeholder={auswahl.length >= 4 ? 'Four weapons is the maximum' : 'Add a weapon…'} className="eingabe w-full" />
          {treffer.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-white/10 bg-[#07090f] shadow-2xl">
              {treffer.map((w) => <button key={w.id} type="button" onClick={() => { schreiben([...auswahl, { id: w.id }]); setQ(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"><WaffenBild bild={bildVon(w, wiki)} name={w.name} className="h-8 w-12 shrink-0" schatten={false} /><span className="truncate font-semibold text-white">{w.name}</span>{w.vaulted && <span className="ml-auto text-[10px] font-bold uppercase text-amber-200/70">vaulted</span>}</button>)}
            </div>
          )}
        </div>
        <LinkKopieren />
        {auswahl.length > 0 && <button type="button" onClick={() => schreiben([])} className="knopf">Clear all</button>}
      </div>

      {!waffen.length ? (
        <Karte titel="Pick two to four weapons" ueber="Compare">
          <p className="text-sm text-white/55">Search above, use “+” on any weapon in the loot pool – or start with one of these:</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {vorschlaege.map((p) => (
              <button key={p.map((x) => x.id).join()} type="button" onClick={() => schreiben(p.map((x) => ({ id: x.id })))} className="fl-fest fl-klick group flex items-center gap-2 !rounded-2xl p-3 text-left">
                <WaffenBild bild={bildVon(p[0], wiki)} name={p[0].name} className="h-12 w-16 shrink-0" />
                <span className="titel text-xl text-white/40">vs</span>
                <WaffenBild bild={bildVon(p[1], wiki)} name={p[1].name} className="h-12 w-16 shrink-0" />
                <span className="min-w-0 text-xs font-semibold text-white/70 group-hover:text-white">{p[0].name} <span className="text-white/35">vs</span> {p[1].name}</span>
              </button>
            ))}
          </div>
        </Karte>
      ) : (
        <>
          <Flaeche fest className="overflow-x-auto p-4 sm:p-5">
            <div className="grid gap-x-3" style={{ gridTemplateColumns: spalten, minWidth: 120 + waffen.length * 150 }}>
              <div className="flex flex-col justify-end pb-3"><p className="ueber">Compare</p><p className="titel text-3xl">{waffen.length} weapons</p></div>
              {waffen.map(({ w }, i) => {
                const r = stufen[i]?.rarity ?? 'common';
                return (
                  <div key={w.id} className="relative mb-3 overflow-hidden rounded-2xl border border-white/[0.07]">
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: LINIEN[i] }} />
                    <button type="button" onClick={() => schreiben(auswahl.filter((x) => x.id !== w.id))} className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-lg bg-black/50 text-xs text-white/60 hover:text-white" title="Remove">✕</button>
                    <button type="button" onClick={() => nav(`/community/weapons/${w.id}`)} className="grid aspect-[16/10] w-full place-items-center p-3" style={schein(r, 0.4)}><WaffenBild bild={bildVon(w, wiki, r)} name={w.name} className="h-full w-full" /></button>
                    <div className="p-3">
                      <p className="truncate font-bold text-white">{w.name}</p>
                      <select value={stufen[i]?.rarity} onChange={(e) => schreiben(auswahl.map((x) => (x.id === w.id ? { ...x, r: e.target.value } : x)))} className="eingabe mt-2 w-full !py-1 !text-xs font-bold" style={{ color: selten(r).farbe }}>
                        {w.rarities.map((x) => <option key={x.rarity} value={x.rarity}>{selten(x.rarity).titel}</option>)}
                      </select>
                      <p className="mt-1.5 text-[11px] text-white/45">Best in <b className="zahl text-white">{bestIn[i]}</b></p>
                    </div>
                  </div>
                );
              })}
              {zeilen.map((z, n) => {
                const da = z.werte.filter((v): v is number => v !== undefined);
                const best = da.length > 1 ? (z.hoeher ? Math.max(...da) : Math.min(...da)) : undefined;
                const schlecht = da.length > 1 ? (z.hoeher ? Math.min(...da) : Math.max(...da)) : undefined;
                const max = da.length ? Math.max(...da) : 0;
                const neueGruppe = n === 0 || zeilen[n - 1].gruppe !== z.gruppe;
                return [
                  neueGruppe ? <p key={`${z.gruppe}-g`} className="ueber col-span-full mt-4 !tracking-[0.25em]" style={{ gridColumn: '1 / -1' }}>{z.gruppe}</p> : null,
                  <div key={`${z.titel}-t`} className="border-t border-white/[0.05] py-2.5 text-sm text-white/55">{z.titel}</div>,
                  ...z.werte.map((v, i) => {
                    const ton = v === undefined ? '' : v === best ? 'gut' : v === schlecht && best !== schlecht ? 'schlecht' : '';
                    return (
                      <div key={`${z.titel}-${i}`} className="border-t border-white/[0.05] px-1 py-2.5">
                        <p className={`zahl text-sm font-bold ${v === undefined ? 'text-white/25' : ton === 'gut' ? 'text-emerald-300' : ton === 'schlecht' ? 'text-rose-300' : 'text-white'}`}>{v === undefined ? '—' : z.text(v)}</p>
                        {v !== undefined && max > 0 && <div className="mt-1"><Linie anteil={(v / max) * 100} ton={ton === 'gut' ? 'bg-emerald-400' : ton === 'schlecht' ? 'bg-rose-400' : 'bg-white/30'} /></div>}
                      </div>
                    );
                  }),
                ];
              })}
            </div>
          </Flaeche>
          <div className={`grid gap-5 ${mitAbfall ? 'lg:grid-cols-2' : ''}`}>
            {ttk200.some((v) => v !== undefined) && (
              <Karte ueber="Calculated" titel="Time to kill · 200 HP" rechts={<Tipp>{TTK_FORMEL}</Tipp>}>
                <div className="space-y-3">
                  {waffen.map(({ w }, i) => (
                    <div key={w.id} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_64px] items-center gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LINIEN[i] }} /><span className="truncate text-white/75">{w.name}</span></span>
                      <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full" style={{ background: LINIEN[i] }} initial={{ width: 0 }} animate={{ width: `${((ttk200[i] ?? 0) / ttkMax) * 100}%` }} transition={{ duration: 0.8 }} /></div>
                      <span className="zahl text-right font-bold text-white">{ttk200[i] !== undefined ? `${ttk200[i]!.toFixed(2)}s` : '—'}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-white/40">Shorter is better. Body shots, every shot hits.</p>
                </div>
              </Karte>
            )}
            {mitAbfall && <Karte ueber="Falloff" titel="Damage by distance"><Abfall reihen={stufen.map((s, i) => ({ s: s!, farbe: LINIEN[i], name: waffen[i].w.name })).filter((x) => x.s)} /></Karte>}
          </div>
          <p className="text-[11px] text-white/35">Green = best, red = worst in the row (lower wins for reload, pullout, spread, recoil and time to kill). The selection lives in the link – share it.</p>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------- Aenderungen */
export function Aenderungen({ db, wiki }: { db: Datenbank | null; wiki?: Wiki }) {
  const [q, setQ] = useState('');
  if (!db || !db.changes.length) return <SaisonVerlauf db={db} wiki={wiki} />;
  const waffe = (id: string) => db.weapons.find((w) => w.id === id);
  const liste = db.changes.filter((c) => (waffe(c.weaponId)?.name ?? c.weaponId).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const tage = [...new Set(liste.map((c) => c.date))];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/55">Every weapon and loot-pool change between patches, from comparing the game files.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by weapon…" className="eingabe w-full sm:w-72" />
      </div>
      {tage.map((d, i) => {
        const l = liste.filter((c) => c.date === d);
        return (
          <Karte key={d} ueber={l[0]?.build ? `Patch v${l[0].build}` : 'Patch'} titel={new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} verz={Math.min(i, 4) * 0.04}
            rechts={<span className="text-xs text-white/45"><b className="text-emerald-300">{l.filter((c) => typeof c.from === 'number' && typeof c.to === 'number' && ((ALLE_WERTE.find((x) => x.k === c.field)?.hoeher ?? true) ? c.to > c.from : c.to < c.from)).length}</b> buffs</span>}>
            <ul className="space-y-1.5">{l.map((c, j) => { const w = waffe(c.weaponId); return <AenderungZeile key={j} c={c} mitWaffe={w?.name ?? c.weaponId} bild={w ? bildVon(w, wiki) : null} />; })}</ul>
          </Karte>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------- Ohne Patch-Vergleich: Waffen je Saison (Fortnite Wiki) */
function SaisonVerlauf({ db, wiki }: { db: Datenbank | null; wiki?: Wiki }) {
  const aktuell = useAktuelleSaison();
  const saisons = useMemo(() => {
    const m = new Map<string, { neu: DbWaffe[]; weg: DbWaffe[] }>();
    for (const w of db?.weapons ?? []) {
      const l = saisonenVon(w, aktuell?.k); if (!l.length) continue;
      const erst = l[0]; const letzt = l[l.length - 1];
      if (!m.has(erst)) m.set(erst, { neu: [], weg: [] }); m.get(erst)!.neu.push(w);
      if (w.vaulted && l.length > 1) { if (!m.has(letzt)) m.set(letzt, { neu: [], weg: [] }); m.get(letzt)!.weg.push(w); }
    }
    return [...m.entries()].sort((a, b) => saisonWert(b[0]) - saisonWert(a[0]));
  }, [db, aktuell]);
  const [n, setN] = useState(6);
  const kachel = (w: DbWaffe) => (
    <Link key={w.id} to={`/community/weapons/${w.id}`} className="group flex w-28 shrink-0 flex-col items-center gap-1 rounded-xl bg-black/25 p-2 text-center transition hover:bg-white/[0.06] sm:w-32">
      <WaffenBild bild={bildVon(w, wiki)} name={w.name} className="h-14 w-full transition duration-500 group-hover:scale-110" schatten={false} />
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-white/75 group-hover:text-white">{w.name}</span>
    </Link>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">Which weapons came into the game and which were vaulted, season by season.</p>
      {!saisons.length && <p className="text-sm text-white/45">Loading the weapon history …</p>}
      {saisons.slice(0, n).map(([x, g], i) => (
        <Flaeche fest key={x} className="grid gap-4 p-5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6" verz={Math.min(i, 6) * 0.04}>
          <div>
            <p className="ueber">{x === aktuell?.k ? 'Now' : 'Season'}</p>
            <p className="titel text-4xl md:text-5xl">{x.replace(/^C(\d+) S(\w+)$/, 'Ch.$1 · S$2')}</p>
            <p className="mt-1 text-xs text-white/45"><b className="text-emerald-300">{g.neu.length}</b> added{g.weg.length ? <> · <b className="text-amber-200">{g.weg.length}</b> vaulted after</> : null}</p>
          </div>
          <div className="min-w-0 space-y-3">
            {([['Added', g.neu, 'text-emerald-300'], ['Last season before the vault', g.weg, 'text-amber-200']] as const).map(([t, l, f]) => l.length ? (
              <div key={t}>
                <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${f}`}>{t}</p>
                <div className="ohne-leiste flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">{l.map(kachel)}</div>
              </div>
            ) : null)}
          </div>
        </Flaeche>
      ))}
      {saisons.length > n && <button type="button" onClick={() => setN((v) => v + 10)} className="knopf">Older seasons ({saisons.length - n})</button>}
      <p className="text-[11px] text-white/35">Seasons: <a href="https://fortnite.fandom.com/" target="_blank" rel="noreferrer" className="text-akz/80 hover:text-white">Data: Fortnite Wiki, CC BY-SA</a>; the season that is live now comes from fortnite-api.com. Per-stat patch changes (old → new) appear here once two game-file exports can be compared.</p>
    </div>
  );
}
