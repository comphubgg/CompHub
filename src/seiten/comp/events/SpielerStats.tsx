import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Laedt, Leer } from '../../../ds/Bausteine';
import { flagge } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { zahl } from './gemeinsam';
import { type LbSpieler, spielerName } from './Bestenliste';
import { Hochkant } from './teile';

/*
 * Spieler-Stats eines Spieltags (/api/cup-spieler): Schaden, Elims, Treffer, Bauteile, Mats ... je Spieler aus den Server-Replays.
 * Neu gesetzt: oben die Tagesbesten je Wertung als Fotokacheln (ein Klick sortiert die Tabelle danach), darunter die sortierbare Tabelle.
 * Sternchen-Regel wie auf der Seite: solange nicht alle Runden gelesen sind, bekommen Spieler ohne elimsAusReplay ein Sternchen an den Replay-Werten.
 */

interface Zeile {
  epicId: string; name: string; land?: string | null; rang?: number; platz?: number; spiele?: number; elims?: number; knocks?: number;
  damage?: number; damageTaken?: number; quote?: number; hits?: number; headshots?: number; builds?: number; matsFarmed?: number;
  timeAlive?: number; distanz?: number; reboots?: number; timeInStorm?: number; elimsAusReplay?: boolean; partner?: string[];
}
interface Antwort { vorhanden: boolean; spieler: Zeile[]; gesamt?: number; runden?: number; rundenGesamt?: number; hinweis?: string; streckeGeschaetzt?: boolean }

type Format = 'zahl' | 'dez' | 'zeit' | 'km';
const SPALTEN: Array<{ feld: keyof Zeile; titel: string; f?: Format; replay?: boolean }> = [
  { feld: 'platz', titel: 'Place' }, { feld: 'spiele', titel: 'Games' }, { feld: 'elims', titel: 'Elims' }, { feld: 'knocks', titel: 'Knocks', replay: true },
  { feld: 'damage', titel: 'Damage', replay: true }, { feld: 'damageTaken', titel: 'Dmg taken', replay: true }, { feld: 'quote', titel: 'Dmg ratio', f: 'dez', replay: true },
  { feld: 'hits', titel: 'Hits', replay: true }, { feld: 'headshots', titel: 'Headshots', replay: true }, { feld: 'builds', titel: 'Builds', replay: true },
  { feld: 'matsFarmed', titel: 'Mats farmed', replay: true }, { feld: 'timeAlive', titel: 'Time alive', f: 'zeit', replay: true },
  { feld: 'distanz', titel: 'Distance', f: 'km', replay: true }, { feld: 'reboots', titel: 'Reboots', replay: true },
];
/** Die Wertungen der Fotokacheln oben. */
const BESTE: Array<{ feld: keyof Zeile; titel: string; f?: Format }> = [
  { feld: 'elims', titel: 'Most eliminations' }, { feld: 'damage', titel: 'Most damage' }, { feld: 'headshots', titel: 'Most headshots' },
  { feld: 'builds', titel: 'Most builds' }, { feld: 'matsFarmed', titel: 'Most mats farmed' }, { feld: 'timeAlive', titel: 'Longest alive', f: 'zeit' },
];
const zeigen = (v: unknown, f?: Format) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (f === 'dez') return zahl(v, 2);
  if (f === 'km') return `${zahl(v / 1000, 1)} km`;
  if (f === 'zeit') { const m = Math.floor(v / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m ${String(Math.round(v % 60)).padStart(2, '0')}s`; }
  return zahl(v);
};

export default function SpielerStats({ eventId, windowId, live, spielerInfo }: { eventId: string; windowId: string; live: boolean; spielerInfo: Map<string, LbSpieler> }) {
  const [d, setD] = useState<Antwort | null>(null);
  const [status, setStatus] = useState<'laedt' | 'ok' | 'fehler' | 'anmelden'>('laedt');
  const [sort, setSort] = useState<{ feld: keyof Zeile; ab: boolean }>({ feld: 'elims', ab: true });
  const [q, setQ] = useState('');
  const [zeige, setZeige] = useState(100);
  const { oeffnen } = useWer();

  useEffect(() => {
    let weg = false;
    const holen = () => fetch(`/api/cup-spieler?window=${encodeURIComponent(windowId)}&event=${encodeURIComponent(eventId)}`)
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { if (!weg) setStatus('anmelden'); return; }
        const j = await r.json();
        if (!weg) { setD(j); setStatus('ok'); }
      }).catch(() => { if (!weg) setStatus((s) => (s === 'ok' ? s : 'fehler')); });
    setD(null); setStatus('laedt'); holen();
    const i = live ? setInterval(holen, 60_000) : undefined;
    return () => { weg = true; if (i) clearInterval(i); };
  }, [eventId, windowId, live]);

  const teilweise = !!d?.rundenGesamt && (d.rundenGesamt ?? 0) > (d.runden ?? 0);
  const spalten = useMemo(() => SPALTEN.filter((s) => d?.spieler?.some((z) => typeof z[s.feld] === 'number' && (z[s.feld] as number) > 0)), [d]);
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = (d?.spieler ?? []).filter((z) => !t || `${z.name} ${spielerInfo.get(z.epicId)?.anzeige ?? ''}`.toLowerCase().includes(t));
    const w = (z: Zeile) => (typeof z[sort.feld] === 'number' ? (z[sort.feld] as number) : sort.ab ? -Infinity : Infinity);
    return [...l].sort((a, b) => (sort.ab ? w(b) - w(a) : w(a) - w(b)));
  }, [d, q, sort, spielerInfo]);
  /** Der Tagesbeste je Wertung. */
  const beste = useMemo(() => BESTE.map((b) => {
    let top: Zeile | null = null;
    for (const z of d?.spieler ?? []) { const v = z[b.feld]; if (typeof v === 'number' && v > 0 && (!top || v > (top[b.feld] as number))) top = z; }
    return top ? { ...b, z: top as Zeile } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x), [d]);

  if (status === 'anmelden') return (
    <div className="p-6"><Leer text={<><span className="block text-base font-bold text-white">Sign in to see this</span>Player stats for this match day need a CompHub account.</>}>
      <button type="button" onClick={() => oeffnen('konto')} className="knopf-prim">Sign in</button>
    </Leer></div>
  );
  if (status === 'laedt') return <Laedt text="Loading player stats" />;
  if (status === 'fehler' || !d) return <p className="p-10 text-center text-sm text-white/50">Player stats aren't reachable right now.</p>;
  if (!d.vorhanden || !d.spieler?.length) return <p className="p-10 text-center text-sm leading-relaxed text-white/50">{d.hinweis || 'Per-player values come from the server replays — they are not read for this match day yet.'}</p>;

  const kopf = (feld: keyof Zeile) => setSort((s) => ({ feld, ab: s.feld === feld ? !s.ab : feld !== 'platz' }));
  const person = (z: Zeile): LbSpieler => spielerInfo.get(z.epicId) ?? { id: z.epicId, name: z.name, land: z.land };
  return (
    <div>
      {/* ------------------------------------------------ Tagesbeste als Fotokacheln */}
      {beste.length > 0 && (
        <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] bg-white/[0.06] md:grid-cols-3 2xl:grid-cols-6">
          {beste.map((b, i) => {
            const p = person(b.z); const an = sort.feld === b.feld;
            return (
              <motion.button key={b.feld} type="button" onClick={() => setSort({ feld: b.feld, ab: true })} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 px-4 py-3 text-left transition ${an ? 'bg-akz/10' : 'bg-fl hover:bg-white/[0.03]'}`}>
                <Hochkant p={p} mass="h-14 w-[42px]" />
                <span className="min-w-0">
                  <span className={`block text-[9px] font-semibold uppercase tracking-[0.2em] ${an ? 'text-akz' : 'text-white/40'}`}>{b.titel}</span>
                  <span className="titel zahl block text-3xl">{zeigen(b.z[b.feld], b.f)}</span>
                  <span className="block truncate text-xs font-semibold text-white/75">{spielerName(p)}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-3 text-xs text-white/50 sm:px-5">
        <span className="zahl">{zahl(d.gesamt ?? d.spieler.length)} players</span>
        <span>·</span>
        {teilweise ? <span className="zahl text-amber-300/90">{zahl(d.runden)} of {zahl(d.rundenGesamt)} games read from replays</span> : <span className="zahl">{zahl(d.runden)} games</span>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…" className="eingabe ml-auto w-full !py-1.5 sm:w-56" />
      </div>
      <div className="overflow-x-auto">
        <table className="tabelle min-w-[1100px]">
          <thead>
            <tr>
              <th className="w-12 !pl-5">#</th>
              <th>Player</th>
              {spalten.map((s) => (
                <th key={s.feld} onClick={() => kopf(s.feld)} className={`cursor-pointer select-none whitespace-nowrap !text-right transition hover:!text-white ${sort.feld === s.feld ? '!text-akz' : ''}`}>
                  {s.titel}{sort.feld === s.feld ? (sort.ab ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liste.slice(0, zeige).map((z, i) => {
              const info = spielerInfo.get(z.epicId);
              const p = person(z);
              const stern = teilweise && !z.elimsAusReplay;
              const land = info?.land || z.land || info?.spielLand;
              return (
                <tr key={z.epicId}>
                  <td className="zahl !py-1.5 !pl-5 text-xs font-bold text-white/45">{i + 1}</td>
                  <td className="!py-1.5">
                    <Link to={`/competitive/player/${z.epicId}`} className="group flex items-center gap-2.5">
                      {/* Foto oder nichts - der Platz bleibt, damit die Namen untereinander stehen */}
                      <span className="flex h-10 w-[30px] shrink-0"><Hochkant p={p} mass="h-10 w-[30px]" rund="rounded-md" /></span>
                      {land ? <img src={flagge(land)} alt="" className="h-3 w-[18px] shrink-0 rounded-[3px] object-cover" /> : <span className="w-[18px] shrink-0" />}
                      <span className="truncate font-semibold text-white transition group-hover:text-akz">{spielerName(p)}</span>
                    </Link>
                  </td>
                  {spalten.map((s) => (
                    <td key={s.feld} className={`zahl whitespace-nowrap !py-1.5 text-right ${sort.feld === s.feld ? 'font-bold text-white' : 'text-white/65'}`}>
                      {zeigen(z[s.feld], s.f)}{stern && s.replay && typeof z[s.feld] === 'number' ? <span className="text-amber-300">*</span> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.length > zeige && <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((x) => x + 200)} className="knopf">Show more ({zahl(liste.length - zeige)})</button></div>}
      {(teilweise || d.streckeGeschaetzt || d.hinweis) && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-[11px] leading-relaxed text-white/40">
          {teilweise && <><span className="text-amber-300">*</span> Not every game of this player has been read from the replays yet — replay values are provisional. </>}
          {d.streckeGeschaetzt && 'Distance is estimated from position samples. '}
          {d.hinweis}
        </p>
      )}
    </div>
  );
}
