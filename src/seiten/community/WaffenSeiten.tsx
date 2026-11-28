import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { DatenFehlen, LinkKopieren } from './Bausteine';
import { bildNachName } from './waffenNamen';
import { TEAL, Ueberschrift } from './Teile';
import {
  KLASSEN_DB, QUELLEN, SELTENHEITEN, WERTE, WERTE_MEHR, ZIELE, fmt, gesamtChance, pro, selten, zeitBisKill, type Datenbank, type DbWaffe, type Stufe,
} from './waffenDaten';
import { waffeVon } from './waffenNamen';

/*
 * Unterseiten der Waffen: Einzelwaffe (/community/weapons/:id), Vergleich (/compare?w=id:rarity,...) und Aenderungen (/changes).
 * Alle Grundwerte aus waffen.json; Zeit bis zum Kill, Rang in der Klasse und Kopfschaden sind daraus abgeleitet und so gekennzeichnet.
 */

export interface Turnier { dmg: number; hits: number; krit: number; spieler: number; tage: number }
type Wiki = Map<string, { name: string; bild: string }> | undefined;
/** Bild: eigenes Symbol (/waffen, /api/waffen-bilder) zuerst, Bild aus dem Fortnite Wiki nur als Ersatz. */
/** Bild: Export-Symbol, Spiel-Symbol (/waffen), dann das Wiki-Bild - je Seltenheit, wo das Wiki eins hat. */
export const bildVon = (w: DbWaffe, wiki: Wiki, seltenheit?: string) => w.icon ?? (w.blueprints[0] || w.rarities[0]?.wid ? waffeVon(w.blueprints[0] ?? w.rarities[0]!.wid!, wiki).bild : null) ?? bildNachName(w.name, wiki)
  ?? (seltenheit ? w.wikiBilder?.[seltenheit] : undefined) ?? w.wikiBild ?? (w.wikiBilder ? Object.values(w.wikiBilder)[0] : undefined) ?? null;
const ALLE_WERTE = [...WERTE, ...WERTE_MEHR];

export function WaffenTabs({ ids }: { ids: string[] }) {
  const anzahl = ids.length;
  const t = ({ isActive }: { isActive: boolean }) => `relative rounded-xl px-4 py-1.5 text-sm font-bold transition ${isActive ? 'bg-teal-300 text-[#06080f]' : 'text-white/55 hover:text-white'}`;
  return (
    <div className="inline-flex rounded-2xl border border-white/10 bg-black/30 p-1">
      <NavLink to="/community/weapons" end className={t}>Loot Pool</NavLink>
      <NavLink to={`/community/weapons/compare${ids.length ? `?w=${ids.join(',')}` : ''}`} className={t}>Compare{anzahl ? <span className="ml-1.5 rounded-full bg-black/30 px-1.5 text-[11px]">{anzahl}</span> : null}</NavLink>
      <NavLink to="/community/weapons/changes" className={t}>Changes</NavLink>
    </div>
  );
}

function Symbol({ bild, name, groesse = 'h-28 w-28' }: { bild: string | null; name: string; groesse?: string }) {
  const [kaputt, setKaputt] = useState(false);
  // Kein Bild: nichts zeigen (kein "?", keine Buchstaben - Betreiber 28.11.2026)
  if (!bild || kaputt) return <span className={`block ${groesse}`} aria-hidden />;
  return <img src={bild} alt={name} referrerPolicy="no-referrer" onError={() => setKaputt(true)} className={`${groesse} object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]`} />;
}
function Punkte({ w, wahl, setzen }: { w: DbWaffe; wahl?: string; setzen: (r: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {w.rarities.map((r) => <button key={r.rarity} type="button" title={selten(r.rarity).titel} onClick={() => setzen(r.rarity)}
        className={`h-5 w-5 rounded-full transition ${wahl === r.rarity ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0b111c]' : 'opacity-50 hover:opacity-100'}`} style={{ background: selten(r.rarity).farbe }} />)}
    </div>
  );
}
/** Naechste Seltenheit einer anderen Waffe zum Vergleich in der Klasse. */
function naechste(w: DbWaffe, r: string): Stufe | undefined {
  const i = SELTENHEITEN.findIndex((s) => s.k === r);
  return [...w.rarities].sort((a, b) => Math.abs(SELTENHEITEN.findIndex((s) => s.k === a.rarity) - i) - Math.abs(SELTENHEITEN.findIndex((s) => s.k === b.rarity) - i))[0];
}

/* ---------------------------------------------- Einzelwaffe */
export function Einzelwaffe({ db, wiki, proWaffe, imVergleich, vergleichen }: { db: Datenbank; wiki: Wiki; proWaffe: Map<string, Turnier>; imVergleich: (id: string) => boolean; vergleichen: (id: string) => void }) {
  const { id } = useParams();
  const w = db.weapons.find((x) => x.id === id);
  const [r, setR] = useState<string | null>(null);
  if (!w) return <Glas className="p-6 text-sm text-white/60">This weapon isn't in the database (yet). <Link to="/community/weapons" className="text-teal-300">Back to the loot pool</Link></Glas>;
  const s = w.rarities.find((x) => x.rarity === r) ?? w.rarities[Math.min(1, w.rarities.length - 1)];
  const farbe = selten(s?.rarity ?? 'common').farbe;
  const klasse = KLASSEN_DB.find((k) => k.k === w.class)?.titel ?? 'Weapons';
  const andere = db.weapons.filter((x) => x.class === w.class);
  const t = proWaffe.get(w.id);
  const aenderungen = db.changes.filter((c) => c.weaponId === w.id).sort((a, b) => b.date.localeCompare(a.date));
  const wert = (k: string, st?: Stufe) => (st ? ALLE_WERTE.find((x) => x.k === k)?.wert(st) : undefined);
  const zeigen = (k: string, v: number | undefined) => { const d = ALLE_WERTE.find((x) => x.k === k)!; return v === undefined ? '—' : `${fmt(v)}${d.einheit ?? ''}`; };
  const quellen = Object.keys({ ...(s?.loot ?? {}), ...Object.fromEntries(w.rarities.flatMap((x) => Object.keys(x.loot ?? {})).map((k) => [k, 1])) });

  const rang = ['damage', 'dps', 'fireRate', 'magazine', 'reloadTime', 'equipTime'].map((k) => {
    const d = ALLE_WERTE.find((x) => x.k === k)!;
    const werte = andere.map((x) => ({ id: x.id, v: d.wert(x.id === w.id ? s! : naechste(x, s!.rarity)!) })).filter((x): x is { id: string; v: number } => x.v !== undefined);
    const eigen = werte.find((x) => x.id === w.id);
    if (!eigen) return null;
    const sortiert = [...werte].sort((a, b) => (d.hoeher ? b.v - a.v : a.v - b.v));
    return { d, v: eigen.v, platz: sortiert.findIndex((x) => x.id === w.id) + 1, n: werte.length, max: Math.max(...werte.map((x) => x.v)) };
  }).filter(Boolean) as Array<{ d: (typeof ALLE_WERTE)[number]; v: number; platz: number; n: number; max: number }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm"><Link to="/community/weapons" className="text-white/55 hover:text-white">← Loot pool</Link><span className="text-white/25">/</span><span className="text-white/45">{klasse}</span><span className="ml-auto"><LinkKopieren /></span></div>
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Steckbrief */}
        <Glas className="h-fit overflow-hidden xl:sticky xl:top-[130px]">
          <div className="grid h-56 place-items-center" style={{ background: `radial-gradient(110% 90% at 50% 10%, ${farbe}55, ${farbe}10 60%, transparent)` }}><Symbol bild={bildVon(w, wiki)} name={w.name} groesse="h-40 w-40" /></div>
          <div className="space-y-4 p-6">
            <h1 className="text-3xl font-black uppercase leading-none tracking-tight text-white">{w.name}</h1>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-white/70">{klasse}</span>
              {w.ammo && <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-white/70">{w.ammo}</span>}
              {w.vaulted ? <span className="rounded-lg bg-amber-300/90 px-2 py-1 font-black uppercase text-[#06080f]">Vaulted</span> : <span className="rounded-lg bg-emerald-400/15 px-2 py-1 text-emerald-200">In the current pool</span>}
            </div>
            {w.saisons?.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Seasons available</p>
                <div className="mt-1.5 flex flex-wrap gap-1">{w.saisons.map((x, i) => <motion.span key={x} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/75">{x.replace(/^C(\d+) S(\w+)$/, 'Ch. $1 S$2')}</motion.span>)}</div>
              </div>
            ) : null}
            {w.wiki && <a href={w.wiki} target="_blank" rel="noreferrer" className="block text-xs font-semibold text-white/45 hover:text-white">Data: Fortnite Wiki, CC BY-SA ↗</a>}
            {w.description && <p className="text-sm text-white/55">{w.description}</p>}
            <div className="flex items-center gap-3"><Punkte w={w} wahl={s?.rarity} setzen={setR} /><span className="text-sm font-bold" style={{ color: farbe }}>{selten(s?.rarity ?? 'common').titel}</span></div>
            <button type="button" onClick={() => vergleichen(w.id)} className={`w-full rounded-xl py-2.5 text-sm font-bold transition ${imVergleich(w.id) ? 'border border-teal-300/50 bg-teal-300/10 text-teal-100' : 'bg-teal-300 text-[#06080f] hover:bg-teal-200'}`}>{imVergleich(w.id) ? '✓ In compare' : '⇄ Add to compare'}</button>
            <Link to={`/community/assets?q=${encodeURIComponent(w.name)}`} className="block text-center text-xs font-semibold text-white/50 hover:text-white">Open in Asset Studio →</Link>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Modes</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{w.modes?.length ? w.modes.map((m) => <span key={m} className="rounded-md bg-teal-300/10 px-2 py-0.5 text-[11px] font-bold uppercase text-teal-200">{m}</span>) : <span className="text-xs text-white/40">{db.playlist ? `Loot pool of ${db.playlist}` : 'Battle Royale'}</span>}</div>
            </div>
          </div>
        </Glas>

        <div className="space-y-5">
          {/* Kennzahlen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ['Damage', wert('damage', s), wert('headshotDamage', s) !== undefined ? `${fmt(wert('headshotDamage', s)!)} headshot` : '', 'lg:col-span-3'],
              ['DPS', wert('dps', s), s?.fireRate !== undefined ? `${fmt(s.fireRate)} shots / s${s.dpsGerechnet ? ' · calc.' : ''}` : '', 'lg:col-span-3'],
              ['Magazine', s?.magazine, 'per reload', 'lg:col-span-2'],
              ['Reload', s?.reloadTime, s?.magazine && s?.fireRate ? `${fmt(s.magazine / s.fireRate)}s to empty` : '', 'lg:col-span-2'],
              ['Structures', s?.structureDamage, 'damage to builds', ''],
              ['Headshot', s?.headshotMultiplier, 'multiplier', ''],
            ].map(([k, v, unter, span], i) => (
              <Glas key={k as string} className={`p-4 ${span}`} verzoegerung={i * 0.04}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{k as string}</p>
                <p className={`font-black tabular-nums text-white ${i < 2 ? 'text-5xl' : 'text-3xl'}`}>{typeof v === 'number' ? `${fmt(v)}${k === 'Reload' ? 's' : k === 'Headshot' ? '×' : ''}` : '—'}</p>
                <p className="text-xs text-white/40">{unter as string}</p>
              </Glas>
            ))}
          </div>

          {/* Rang in der Klasse */}
          {rang.length > 0 && (
            <Glas className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-extrabold uppercase tracking-tight text-white">Among {klasse.toLowerCase()}</h2><span className="text-xs text-white/40">{selten(s!.rarity).titel} against the closest rarity of each</span></div>
              <div className="mt-4 space-y-3">
                {rang.map((x) => (
                  <div key={x.d.k} className="grid grid-cols-[140px_minmax(0,1fr)_70px_80px] items-center gap-3 text-sm">
                    <span className="text-white/60">{x.d.titel}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-teal-300" initial={{ width: 0 }} animate={{ width: `${(x.v / x.max) * 100}%` }} transition={{ duration: 0.8 }} /></div>
                    <span className="text-right font-bold tabular-nums text-white">{fmt(x.v)}{x.d.einheit ?? ''}</span>
                    <span className={`rounded-md px-2 py-0.5 text-center text-[11px] font-bold ${x.platz === 1 ? 'bg-amber-300 text-[#06080f]' : x.platz <= Math.ceil(x.n / 2) ? 'bg-teal-300/15 text-teal-200' : 'bg-rose-400/15 text-rose-200'}`}>{x.platz === 1 ? `Best of ${x.n}` : `#${x.platz} of ${x.n}`}</span>
                  </div>
                ))}
              </div>
            </Glas>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Zeit bis zum Kill */}
            <Glas className="p-5">
              <h2 className="font-extrabold uppercase tracking-tight text-white">Time to kill</h2>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-[10px] uppercase tracking-[0.2em] text-white/40"><tr><th className="py-1">Target</th><th className="text-right">Body</th><th className="text-right">Headshots</th></tr></thead>
                <tbody>{ZIELE.map((z) => {
                  const k = s ? zeitBisKill(s, z.hp, false) : null; const h = s ? zeitBisKill(s, z.hp, true) : null;
                  const zelle = (x: typeof k) => (x ? <><span className="font-bold tabular-nums text-white">{x.sekunden.toFixed(2)}s</span> <span className="text-xs text-white/40">{x.schuesse} shots</span></> : '—');
                  return <tr key={z.hp} className="border-t border-white/5"><td className="py-2 text-white/65">{z.titel}</td><td className="text-right">{zelle(k)}</td><td className="text-right">{zelle(h)}</td></tr>;
                })}</tbody>
              </table>
              <p className="mt-2 text-[11px] text-white/35">Calculated from the game values: every shot hits, no damage falloff, reload when the magazine is empty.</p>
            </Glas>
            {/* Schaden nach Entfernung */}
            <Glas className="p-5">
              <h2 className="font-extrabold uppercase tracking-tight text-white">Damage by distance</h2>
              {s?.falloff?.length && s.damage !== undefined ? <Abfall s={s} /> : <p className="mt-3 text-sm text-white/45">Damage falloff per distance comes with the next game-file export.</p>}
            </Glas>
          </div>

          {/* Fundorte */}
          <Glas className="p-5">
            <div className="flex items-baseline justify-between"><h2 className="font-extrabold uppercase tracking-tight text-white">Where to find it</h2><span className="text-xs text-white/40">{selten(s?.rarity ?? 'common').titel}</span></div>
            {quellen.length ? (
              <div className="mt-4 space-y-2.5">
                {quellen.map((q) => {
                  const v = s?.loot?.[q] ?? undefined; const alle = gesamtChance(w, q); const max = Math.max(...quellen.map((x) => s?.loot?.[x] ?? 0), 0.01);
                  return (
                    <div key={q} className="grid grid-cols-[130px_minmax(0,1fr)_70px] items-center gap-3 text-sm">
                      <span className="text-white/60">{QUELLEN[q] ?? q}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-teal-300" initial={{ width: 0 }} animate={{ width: `${((v ?? 0) / max) * 100}%` }} /></div>
                      <span className="text-right font-bold tabular-nums text-white" title={alle !== undefined ? `${pro(alle)} any rarity` : undefined}>{pro(v)}</span>
                    </div>
                  );
                })}
                <p className="pt-1 text-xs text-white/40">Any rarity: {quellen.map((q) => `${QUELLEN[q] ?? q} ${pro(gesamtChance(w, q))}`).join(' · ')}</p>
              </div>
            ) : <p className="mt-3 text-sm text-white/45">No loot chances in the export for this weapon.</p>}
          </Glas>

          {/* Alle Seltenheiten */}
          <Glas className="overflow-x-auto p-5">
            <h2 className="font-extrabold uppercase tracking-tight text-white">All rarities</h2>
            <table className="mt-3 w-full min-w-[520px] text-sm">
              <thead><tr><th />{w.rarities.map((x) => <th key={x.rarity} className={`px-2 py-1.5 text-right text-xs font-bold ${x.rarity === s?.rarity ? 'rounded-t-lg bg-white/[0.06]' : ''}`} style={{ color: selten(x.rarity).farbe }}>{selten(x.rarity).titel}</th>)}</tr></thead>
              <tbody>{ALLE_WERTE.filter((d) => w.rarities.some((x) => d.wert(x) !== undefined)).map((d) => {
                const werte = w.rarities.map((x) => d.wert(x));
                const best = Math.max(...werte.filter((v): v is number => v !== undefined).map((v) => (d.hoeher ? v : -v)));
                return (
                  <tr key={d.k} className="border-t border-white/5"><td className="py-2 text-white/55">{d.titel}</td>
                    {werte.map((v, i) => <td key={i} className={`px-2 text-right tabular-nums ${w.rarities[i].rarity === s?.rarity ? 'bg-white/[0.06]' : ''} ${v !== undefined && (d.hoeher ? v : -v) === best && werte.length > 1 ? 'font-bold text-teal-300' : 'text-white'}`}>{zeigen(d.k, v)}</td>)}
                  </tr>
                );
              })}</tbody>
            </table>
          </Glas>

          {t && t.hits >= 5 && (
            <Glas className="p-5">
              <h2 className="font-extrabold uppercase tracking-tight text-teal-200">In tournaments</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[['Avg. damage per hit', (t.dmg / t.hits).toFixed(1)], ['Headshot rate', `${((t.krit / t.hits) * 100).toFixed(1)} %`], ['Damage dealt', t.dmg.toLocaleString('en')], ['Tournament days', String(t.tage)]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/[0.04] p-3"><p className="text-[10px] uppercase tracking-wider text-white/40">{k}</p><p className="text-xl font-bold tabular-nums text-white">{v}</p></div>
                ))}
              </div>
            </Glas>
          )}

          {aenderungen.length > 0 && (
            <Glas className="p-5">
              <h2 className="font-extrabold uppercase tracking-tight text-white">Changes</h2>
              <ul className="mt-3 space-y-1.5 text-sm">{aenderungen.map((c, i) => <AenderungZeile key={i} c={c} />)}</ul>
            </Glas>
          )}

          {/* Mehr aus der Klasse */}
          <Glas className="p-5">
            <h2 className="font-extrabold uppercase tracking-tight text-white">More {klasse.toLowerCase()}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {andere.filter((x) => x.id !== w.id).map((x) => {
                const st = naechste(x, s?.rarity ?? 'rare');
                return (
                  <Link key={x.id} to={`/community/weapons/${x.id}`} className="flex items-center gap-3 rounded-xl border border-white/10 p-2.5 transition hover:border-teal-300/40 hover:bg-white/[0.04]">
                    <Symbol bild={bildVon(x, wiki)} name={x.name} groesse="h-10 w-10" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{x.name}</span>
                    <span className="text-xs tabular-nums text-white/50">{st?.dps !== undefined ? `${fmt(st.dps)} DPS` : ''}</span>
                  </Link>
                );
              })}
            </div>
          </Glas>
        </div>
      </div>
    </div>
  );
}

function Abfall({ s }: { s: Stufe }) {
  const pkt = s.falloff!; const maxD = Math.max(100, ...pkt.map((p) => p.distance)); const basis = s.damage! * (s.pellets ?? 1); const hs = basis * (s.headshotMultiplier ?? 1);
  const x = (d: number) => 30 + (d / maxD) * 460; const y = (v: number) => 170 - (v / hs) * 150;
  const pfad = (m: number) => pkt.map((p, i) => `${i ? 'L' : 'M'}${x(p.distance)} ${y(basis * m * p.factor)}`).join(' ');
  return (
    <svg viewBox="0 0 500 190" className="mt-3 w-full">
      {[0, 50, 100].filter((d) => d <= maxD).map((d) => <g key={d}><line x1={x(d)} x2={x(d)} y1={15} y2={170} stroke="rgba(255,255,255,0.06)" /><text x={x(d)} y={185} fill="rgba(255,255,255,0.4)" fontSize="10" textAnchor="middle">{d} m</text></g>)}
      <path d={pfad(s.headshotMultiplier ?? 1)} fill="none" stroke="#5eead4" strokeDasharray="5 4" strokeWidth="2" />
      <path d={pfad(1)} fill="none" stroke="#5eead4" strokeWidth="2.5" />
      {pkt.map((p) => <text key={p.distance} x={x(p.distance)} y={y(basis * p.factor) - 6} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle">{fmt(basis * p.factor)}</text>)}
    </svg>
  );
}

function AenderungZeile({ c, mitWaffe }: { c: Datenbank['changes'][number]; mitWaffe?: string }) {
  const titel = ALLE_WERTE.find((d) => d.k === c.field)?.titel ?? QUELLEN[c.field] ?? c.field;
  const zahl = (v: unknown) => (typeof v === 'number' ? fmt(v) : v == null ? '—' : String(v));
  const besser = typeof c.from === 'number' && typeof c.to === 'number' ? ((ALLE_WERTE.find((d) => d.k === c.field)?.hoeher ?? true) ? c.to > c.from : c.to < c.from) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.03] px-3 py-2">
      <span className="w-24 text-xs tabular-nums text-white/40">{c.date}{c.build ? ` · v${c.build}` : ''}</span>
      {mitWaffe && <span className="font-bold text-white">{mitWaffe}</span>}
      {c.rarity && <span className="text-xs font-bold" style={{ color: selten(c.rarity).farbe }}>{selten(c.rarity).titel}</span>}
      <span className="text-white/65">{titel}</span>
      <span className="tabular-nums text-white/45 line-through">{zahl(c.from)}</span><span className="text-white/30">→</span>
      <span className={`font-bold tabular-nums ${besser === null ? 'text-white' : besser ? 'text-emerald-300' : 'text-rose-300'}`}>{zahl(c.to)}</span>
      {c.modes?.length ? <span className="ml-auto text-[10px] font-bold uppercase text-white/35">{c.modes.join(' · ')}</span> : null}
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
    return KLASSEN_DB.map((k) => db.weapons.filter((w) => w.class === k.k)).filter((l) => l.length >= 2).map((l) => [l[0], l[1]]).slice(0, 4);
  }, [db]);
  if (!db) return <DatenFehlen titel="Compare needs the weapon stats from the game files" text="As soon as hub-daten/waffen.json is there, pick up to four weapons and compare every stat, time-to-kill and loot chance side by side – the selection lives in the link, so you can share it." />;
  const waffen = auswahl.map((x) => ({ w: db.weapons.find((y) => y.id === x.id)!, r: x.r }));
  const stufen = waffen.map(({ w, r }) => w.rarities.find((x) => x.rarity === r) ?? w.rarities[Math.min(1, w.rarities.length - 1)]);
  const treffer = q.length >= 1 ? db.weapons.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()) && !auswahl.some((a) => a.id === w.id)).slice(0, 8) : [];
  const zeilen: Array<{ titel: string; werte: Array<number | undefined>; hoeher: boolean; text: (v: number) => string }> = [
    ...ALLE_WERTE.map((d) => ({ titel: d.titel, werte: stufen.map((s) => (s ? d.wert(s) : undefined)), hoeher: d.hoeher, text: (v: number) => `${fmt(v)}${d.einheit ?? ''}` })),
    ...ZIELE.map((z) => ({ titel: `TTK ${z.titel}`, werte: stufen.map((s) => (s ? zeitBisKill(s, z.hp, false)?.sekunden : undefined)), hoeher: false, text: (v: number) => `${v.toFixed(2)}s` })),
    { titel: 'Headshots to kill (200)', werte: stufen.map((s) => (s ? zeitBisKill(s, 200, true)?.schuesse : undefined)), hoeher: false, text: (v: number) => String(v) },
    ...Object.keys(QUELLEN).map((q2) => ({ titel: `${QUELLEN[q2]} chance`, werte: stufen.map((s) => s?.loot?.[q2] ?? undefined), hoeher: true, text: (v: number) => pro(v) })),
    { titel: 'Tournament dmg / hit', werte: waffen.map(({ w }) => { const t = proWaffe.get(w.id); return t && t.hits >= 5 ? t.dmg / t.hits : undefined; }), hoeher: true, text: (v: number) => v.toFixed(1) },
  ].filter((z) => z.werte.some((v) => v !== undefined));
  const bestIn = waffen.map((_, i) => zeilen.filter((z) => { const da = z.werte.filter((v): v is number => v !== undefined); return da.length > 1 && z.werte[i] === (z.hoeher ? Math.max(...da) : Math.min(...da)); }).length);
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Weapons" titel="Compare weapons" farbe={TEAL} rechts={<div className="flex gap-2"><LinkKopieren /><button type="button" onClick={() => schreiben([])} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/60 hover:text-white">Clear all</button></div>} />
      <div className="relative max-w-xl">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={auswahl.length >= 4} placeholder={auswahl.length >= 4 ? 'Four weapons is the maximum' : 'Add a weapon…'} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
        {treffer.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] shadow-2xl">
            {treffer.map((w) => <button key={w.id} type="button" onClick={() => { schreiben([...auswahl, { id: w.id }]); setQ(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"><Symbol bild={bildVon(w, wiki)} name={w.name} groesse="h-8 w-8" /><span className="font-semibold text-white">{w.name}</span></button>)}
          </div>
        )}
      </div>
      {!waffen.length ? (
        <Glas className="p-6">
          <p className="text-sm text-white/55">Pick weapons above, use “+ Compare” in the loot pool – or start with one of these:</p>
          <div className="mt-3 flex flex-wrap gap-2">{vorschlaege.map((p) => <button key={p.map((x) => x.id).join()} type="button" onClick={() => schreiben(p.map((x) => ({ id: x.id })))} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/75 hover:border-teal-300/40 hover:text-white">{p[0].name} vs {p[1].name}</button>)}</div>
        </Glas>
      ) : (
        <Glas className="overflow-x-auto p-5">
          <div className="grid min-w-[640px] gap-x-3" style={{ gridTemplateColumns: `minmax(150px,0.8fr) repeat(${waffen.length}, minmax(0,1fr))` }}>
            <div />
            {waffen.map(({ w }, i) => {
              const f = selten(stufen[i]?.rarity ?? 'common').farbe;
              return (
                <div key={w.id} className="relative rounded-2xl p-3 text-center" style={{ background: `linear-gradient(180deg, ${f}33, transparent)` }}>
                  <button type="button" onClick={() => schreiben(auswahl.filter((x) => x.id !== w.id))} className="absolute right-2 top-2 text-white/40 hover:text-white">✕</button>
                  <button type="button" onClick={() => nav(`/community/weapons/${w.id}`)} className="mx-auto block"><Symbol bild={bildVon(w, wiki)} name={w.name} groesse="h-20 w-20" /></button>
                  <p className="mt-1 truncate font-extrabold text-white">{w.name}</p>
                  <select value={stufen[i]?.rarity} onChange={(e) => schreiben(auswahl.map((x) => (x.id === w.id ? { ...x, r: e.target.value } : x)))} className="mt-2 rounded-lg border border-white/10 bg-[#0b1220] px-2 py-1 text-xs font-bold" style={{ color: f }}>
                    {w.rarities.map((r) => <option key={r.rarity} value={r.rarity}>{selten(r.rarity).titel}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-white/45">Best in {bestIn[i]}</p>
                </div>
              );
            })}
            {zeilen.map((z) => {
              const da = z.werte.filter((v): v is number => v !== undefined);
              const best = da.length > 1 ? (z.hoeher ? Math.max(...da) : Math.min(...da)) : undefined;
              const schlecht = da.length > 1 ? (z.hoeher ? Math.min(...da) : Math.max(...da)) : undefined;
              const max = da.length ? Math.max(...da) : 0;
              return [
                <div key={`${z.titel}-t`} className="border-t border-white/5 py-2.5 text-sm text-white/55">{z.titel}</div>,
                ...z.werte.map((v, i) => {
                  const farbe = v === undefined ? '' : v === best ? 'emerald' : v === schlecht && best !== schlecht ? 'rose' : '';
                  return (
                    <div key={`${z.titel}-${i}`} className="border-t border-white/5 px-2 py-2.5">
                      <p className={`text-sm font-bold tabular-nums ${v === undefined ? 'text-white/25' : farbe === 'emerald' ? 'text-emerald-300' : farbe === 'rose' ? 'text-rose-300' : 'text-white'}`}>{v === undefined ? '—' : z.text(v)}</p>
                      {v !== undefined && max > 0 && <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className={`h-full rounded-full ${farbe === 'emerald' ? 'bg-emerald-400' : farbe === 'rose' ? 'bg-rose-400' : 'bg-white/30'}`} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} /></div>}
                    </div>
                  );
                }),
              ];
            })}
          </div>
          <p className="mt-4 text-[11px] text-white/35">Green = best, red = worst in the row (lower wins for reload, pullout, spread, recoil and time-to-kill). TTK is calculated: every shot hits, no falloff.</p>
        </Glas>
      )}
    </div>
  );
}

/* ---------------------------------------------- Aenderungen */
export function Aenderungen({ db, wiki }: { db: Datenbank | null; wiki?: Wiki }) {
  const [q, setQ] = useState('');
  if (!db || !db.changes.length) return <SaisonVerlauf db={db} wiki={wiki} />;
  const name = (id: string) => db.weapons.find((w) => w.id === id)?.name ?? id;
  const liste = db.changes.filter((c) => name(c.weaponId).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const tage = [...new Set(liste.map((c) => c.date))];
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Weapons" titel="Changes" farbe={TEAL} text="Every weapon and loot-pool change between patches, straight from comparing the game files." />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by weapon…" className="w-72 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
      {tage.map((d) => (
        <Glas key={d} className="p-5">
          <h2 className="font-extrabold text-white">{new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">{liste.filter((c) => c.date === d).map((c, i) => <AenderungZeile key={i} c={c} mitWaffe={name(c.weaponId)} />)}</ul>
        </Glas>
      ))}
    </div>
  );
}

/* ---------------------------------------------- Ohne Patch-Vergleich: Waffen je Saison (Fortnite Wiki) */
function SaisonVerlauf({ db, wiki }: { db: Datenbank | null; wiki?: Wiki }) {
  const saisons = useMemo(() => {
    const wert = (x: string) => { const [, c, t] = /C(\d+) S(\w+)/.exec(x) ?? []; return Number(c) * 100 + (Number(t) || (t === 'X' ? 10 : 60)); };
    const m = new Map<string, { neu: DbWaffe[]; weg: DbWaffe[] }>();
    for (const w of db?.weapons ?? []) {
      const l = w.saisons ?? []; if (!l.length) continue;
      const erst = l[0]; const letzt = l[l.length - 1];
      if (!m.has(erst)) m.set(erst, { neu: [], weg: [] }); m.get(erst)!.neu.push(w);
      if (w.vaulted && l.length > 1) { if (!m.has(letzt)) m.set(letzt, { neu: [], weg: [] }); m.get(letzt)!.weg.push(w); }
    }
    return [...m.entries()].sort((a, b) => wert(b[0]) - wert(a[0]));
  }, [db]);
  const [n, setN] = useState(8);
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Weapons" titel="Changes" farbe={TEAL} text="Which weapons came into the game and which were vaulted, season by season." />
      {!saisons.length && <p className="text-sm text-white/45">Loading the weapon history …</p>}
      <div className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-white/10">
        {saisons.slice(0, n).map(([x, g], i) => (
          <motion.div key={x} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }} className="relative">
            <span className="absolute -left-[22px] top-5 h-3 w-3 rounded-full border-2 border-[#06080f] bg-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.7)]" />
            <Glas className="p-5">
              <h2 className="text-xl font-extrabold text-white">{x.replace(/^C(\d+) S(\w+)$/, 'Chapter $1 · Season $2')}</h2>
              {([['Added', g.neu, 'text-emerald-300'], ['Last season before the vault', g.weg, 'text-amber-300']] as const).map(([t, l, f]) => l.length ? (
                <div key={t} className="mt-3">
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${f}`}>{t} · {l.length}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {l.map((w) => <Link key={w.id} to={`/community/weapons/${w.id}`} className="flex items-center gap-2 rounded-xl bg-white/[0.05] py-1 pl-1 pr-2.5 text-sm font-semibold text-white hover:bg-white/10"><Symbol bild={bildVon(w, wiki)} name={w.name} groesse="h-7 w-7" />{w.name}</Link>)}
                  </div>
                </div>
              ) : null)}
            </Glas>
          </motion.div>
        ))}
      </div>
      {saisons.length > n && <button type="button" onClick={() => setN((v) => v + 10)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white">Older seasons ({saisons.length - n})</button>}
      <p className="text-[11px] text-white/30">Seasons: <a href="https://fortnite.fandom.com/" target="_blank" rel="noreferrer" className="text-teal-200/70 hover:text-white">Data: Fortnite Wiki, CC BY-SA</a>. Per-stat patch changes (old → new) appear here once two game-file exports can be compared.</p>
    </div>
  );
}
