import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Glas } from '../../../teile/Glas';
import { Hinweis } from '../Bausteine';
import { Laedt, TEAL } from '../Teile';
import { EpicFehler, kurz, letzter, metrikenZeitraum, summe, useEpicErreichbar, type Punkt } from './daten';
import { BLITZ_KARTEN, RELOAD_KARTEN } from './modi';

/*
 * Map Rotation ohne Fahrplan-Datei: Epics Data API zeigt je Karten-Playlist, wann dort gespielt wurde. Die Karte mit Spielern in der letzten
 * Stunde ist die laufende; die 24-Stunden-Leiste je Karte macht die Rotation sichtbar. Codenamen -> Kartennamen in NAMEN (bekannte eintragen).
 */
const NAMEN: Record<string, string> = { BlastBerry: 'Venture' };
const anzeige = (k: string) => NAMEN[k] ?? (k.replace(/^ForbiddenFruit_?/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Old$/, 'Classic') || 'Blitz Royale');
const codesReload = (k: string) => [`Playlist_${k}Squad`, `Playlist_${k}Duo`, `Playlist_${k}Solo`, `Playlist_${k}NoBuildSquad`, `Playlist_${k}NoBuildDuo`];
const codesBlitz = (k: string) => [`Playlist_${k}NoBuildBRSquad`, `Playlist_${k}NoBuildBRDuo`, `Playlist_${k}NoBuildBRSolo`, `Playlist_${k}BRSquad`, `Playlist_${k}BRSolo`];

interface Karte { k: string; name: string; reihe: Punkt[]; jetzt: number | null }
function useKarten(modus: 'reload' | 'blitz') {
  const [z, setZ] = useState<{ karten: Karte[]; fertig: boolean; offline: boolean }>({ karten: [], fertig: false, offline: false });
  useEffect(() => {
    let weg = false; setZ({ karten: [], fertig: false, offline: false });
    const liste = modus === 'reload' ? RELOAD_KARTEN : BLITZ_KARTEN;
    const codes = modus === 'reload' ? codesReload : codesBlitz;
    Promise.all(liste.map(async (k) => {
      const r = await Promise.allSettled(codes(k).map((c) => metrikenZeitraum(c, '1D')));
      if (r.some((x) => x.status === 'rejected' && x.reason instanceof EpicFehler && x.reason.status === 0)) throw new EpicFehler(0, 'offline');
      const reihe = summe(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value.peakCCU] : [])));
      const karte: Karte = { k, name: anzeige(k), reihe, jetzt: reihe.length && Date.now() - reihe.at(-1)!.t < 2 * 36e5 ? letzter(reihe) : null };
      if (!weg && reihe.length) setZ((v) => ({ ...v, karten: [...v.karten, karte] }));
    })).then(() => { if (!weg) setZ((v) => ({ ...v, fertig: true })); }).catch(() => { if (!weg) setZ((v) => ({ ...v, fertig: true, offline: true })); });
    return () => { weg = true; };
  }, [modus]);
  return z;
}

export function RotationLive({ bilder, live: liveMelden }: { bilder: Array<{ id: string; name: string }>; live?: (namen: string[]) => void }) {
  const [modus, setModus] = useState<'reload' | 'blitz'>('reload');
  const { karten, fertig, offline } = useKarten(modus);
  const erreichbar = useEpicErreichbar();
  const sortiert = useMemo(() => [...karten].sort((a, b) => (b.jetzt ?? 0) - (a.jetzt ?? 0)), [karten]);
  const live = sortiert.filter((k) => (k.jetzt ?? 0) > 0);
  const liveNamen = live.slice(0, 3).map((k) => k.name.toLowerCase()).join('|');
  useEffect(() => { liveMelden?.(liveNamen ? liveNamen.split('|') : []); }, [liveNamen]); // eslint-disable-line react-hooks/exhaustive-deps
  const stunden = useMemo(() => { const jetzt = Math.floor(Date.now() / 36e5) * 36e5; return Array.from({ length: 24 }, (_, i) => jetzt - (23 - i) * 36e5); }, []);
  const max = Math.max(1, ...karten.flatMap((k) => k.reihe.map((p) => p.v)));
  const bildVon = (name: string) => bilder.find((b) => b.name.toLowerCase() === name.toLowerCase());
  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-sm font-bold">
        {(['reload', 'blitz'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setModus(k)} className="relative rounded-lg px-4 py-1.5 capitalize">
            {modus === k && <motion.span layoutId="rot-modus" className="absolute inset-0 rounded-lg bg-teal-300" />}<span className={`relative ${modus === k ? 'text-[#06080f]' : 'text-white/55 hover:text-white'}`}>{k === 'blitz' ? 'Blitz Royale' : 'Reload'}</span>
          </button>
        ))}
      </div>
      {(offline || erreichbar === 'aus') && !karten.length && <Hinweis ton="amber">Epic's Fortnite Data API isn't answering – the live rotation fills in as soon as it does.</Hinweis>}
      <div className="grid gap-4 lg:grid-cols-3">
        {(live.length ? live.slice(0, 3) : fertig ? [] : [null, null, null]).map((k, i) => k ? (
          <motion.div key={k.k} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Glas className="relative overflow-hidden">
              <div className="relative aspect-video">
                {bildVon(k.name) ? <img src={`/api/karten-bild?id=${encodeURIComponent(bildVon(k.name)!.id)}&datei=1`} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-amber-400/25 via-teal-500/10 to-transparent" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-[#06080f]/30 to-transparent" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-500/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{i ? 'Also live' : 'Live now'}</span>
                <div className="absolute bottom-0 p-5">
                  <h2 className={`font-black tracking-tight text-white ${i ? 'text-2xl' : 'text-4xl'}`}>{k.name}</h2>
                  <p className="text-sm text-white/60"><b className="text-teal-200">{kurz(k.jetzt)}</b> players in the last hour · <span className="font-mono text-white/40">{k.k}</span></p>
                </div>
              </div>
            </Glas>
          </motion.div>
        ) : <div key={i} className="aspect-video animate-pulse rounded-3xl bg-white/[0.03]" />)}
      </div>
      <Glas className="overflow-x-auto p-5">
        <div className="min-w-[720px]">
          <div className="flex items-baseline justify-between"><h3 className="font-bold text-white">Last 24 hours – when each map was live</h3><span className="text-xs text-white/40">brighter = more players</span></div>
          <div className="mt-3 space-y-1.5">
            {sortiert.map((k, n) => (
              <motion.div key={k.k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.03 }} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-sm font-semibold text-white/80">{k.name}</span>
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
                  {stunden.map((h) => { const v = k.reihe.find((p) => Math.abs(p.t - h) < 18e5)?.v ?? 0; return <span key={h} title={`${new Date(h).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${Math.round(v).toLocaleString('en')}`} className="h-5 rounded-sm" style={{ background: v ? `rgba(${TEAL},${0.15 + 0.85 * (v / max)})` : 'rgba(255,255,255,0.04)' }} />; })}
                </div>
                <span className="w-16 text-right text-xs font-bold tabular-nums text-white/60">{kurz(k.jetzt)}</span>
              </motion.div>
            ))}
          </div>
          <div className="mt-2 flex justify-between pl-[156px] pr-[76px] text-[10px] tabular-nums text-white/30"><span>{new Date(stunden[0]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><span>now</span></div>
          {!sortiert.length && <div className="py-6">{fertig ? <p className="text-sm text-white/45">No map playlists answered.</p> : <Laedt farbe={TEAL} text="Asking Epic which maps were played …" />}</div>}
        </div>
      </Glas>
      <p className="text-[11px] text-white/30">Live detection from Epic's Fortnite Data API (players per map playlist). Map codenames come from the game files.</p>
    </div>
  );
}
