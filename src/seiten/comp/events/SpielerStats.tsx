import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas, flagge } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { zahl } from './gemeinsam';
import { Avatar, type LbSpieler, spielerName } from './Bestenliste';

/*
 * Spieler-Stats eines Spieltags (/api/cup-spieler): Schaden, Elims, Treffer, Bauteile, Mats ... je Spieler aus den Server-Replays.
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
  const spalten = useMemo(() => SPALTEN.filter((s) => d?.spieler.some((z) => typeof z[s.feld] === 'number' && (z[s.feld] as number) > 0)), [d]);
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = (d?.spieler ?? []).filter((z) => !t || `${z.name} ${spielerInfo.get(z.epicId)?.anzeige ?? ''}`.toLowerCase().includes(t));
    const w = (z: Zeile) => (typeof z[sort.feld] === 'number' ? (z[sort.feld] as number) : sort.ab ? -Infinity : Infinity);
    return [...l].sort((a, b) => (sort.ab ? w(b) - w(a) : w(a) - w(b)));
  }, [d, q, sort, spielerInfo]);

  if (status === 'anmelden') return (
    <Glas className="p-10 text-center">
      <p className="text-lg font-bold text-white">Sign in to see this</p>
      <p className="mt-1 text-sm text-white/50">Player stats for this match day need a CompHub account.</p>
      <button type="button" onClick={() => oeffnen('konto')} className="mt-4 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-[#06080f] hover:bg-sky-300">Sign in</button>
    </Glas>
  );
  if (status === 'laedt') return <div className="space-y-1.5 p-4">{[...Array(10)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.03]" />)}</div>;
  if (status === 'fehler' || !d) return <p className="p-10 text-center text-sm text-white/50">Player stats aren't reachable right now.</p>;
  if (!d.vorhanden || !d.spieler?.length) return <p className="p-10 text-center text-sm leading-relaxed text-white/50">{d.hinweis || 'Per-player values come from the server replays — they are not read for this match day yet.'}</p>;

  const kopf = (feld: keyof Zeile) => setSort((s) => ({ feld, ab: s.feld === feld ? !s.ab : feld !== 'platz' }));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3 text-xs text-white/50">
        <span>{zahl(d.gesamt ?? d.spieler.length)} players</span>
        <span>·</span>
        {teilweise ? <span className="text-amber-300/90">{zahl(d.runden)} of {zahl(d.rundenGesamt)} games read from replays</span> : <span>{zahl(d.runden)} games</span>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…" className="ml-auto w-56 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
              <th className="w-12 px-4 py-2.5 text-left">#</th>
              <th className="px-2 py-2.5 text-left">Player</th>
              {spalten.map((s) => (
                <th key={s.feld} onClick={() => kopf(s.feld)} className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-right transition hover:text-white ${sort.feld === s.feld ? 'text-sky-300' : ''}`}>
                  {s.titel}{sort.feld === s.feld ? (sort.ab ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {liste.slice(0, zeige).map((z, i) => {
              const info = spielerInfo.get(z.epicId);
              const p: LbSpieler = info ?? { id: z.epicId, name: z.name, land: z.land };
              const stern = teilweise && !z.elimsAusReplay;
              const land = info?.land || z.land || info?.spielLand;
              return (
                <motion.tr key={z.epicId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.015 }} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 text-xs font-bold tabular-nums text-white/45">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link to={`/competitive/player/${z.epicId}`} className="group flex items-center gap-2.5">
                      <Avatar p={p} groesse={7} />
                      {land && <img src={flagge(land)} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}
                      <span className="truncate font-semibold text-white group-hover:text-sky-300">{spielerName(p)}</span>
                    </Link>
                  </td>
                  {spalten.map((s) => (
                    <td key={s.feld} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${sort.feld === s.feld ? 'font-bold text-white' : 'text-white/70'}`}>
                      {zeigen(z[s.feld], s.f)}{stern && s.replay && typeof z[s.feld] === 'number' ? <span className="text-amber-300">*</span> : null}
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.length > zeige && <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((x) => x + 200)} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-white/80 hover:border-sky-400/40">Show more ({zahl(liste.length - zeige)})</button></div>}
      <p className="border-t border-white/5 px-4 py-3 text-[11px] leading-relaxed text-white/40">
        {teilweise && <><span className="text-amber-300">*</span> Not every game of this player has been read from the replays yet — replay values are provisional. </>}
        {d.streckeGeschaetzt && 'Distance is estimated from position samples. '}
        {d.hinweis}
      </p>
    </div>
  );
}
