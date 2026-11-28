import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../../../teile/Glas';
import { useWer } from '../../../teile/Anmeldung';
import { zahl } from './gemeinsam';
import { type Eintrag, type LbSpieler, spielerName } from './Bestenliste';
import { Hochkant } from './teile';

/*
 * Player stats eines Spieltags - dichte Tabelle wie bei Osirion: klebender Kopf, klebende Spielerspalte, Zahlen rechtsbuendig und tabellarisch, jede
 * Spalte sortierbar.
 *
 * Tempo (Betreiber 28.11.: "laedt zu lange oder gar nicht"): /api/cup-spieler rechnet auf dem Server 7-30 s (gemessen 28.11. an Cups von S43:
 * Performance Eval 7 s, Scott Pilgrim Cup EU 17-28 s, Ranked Solo 14 s - unabhaengig von `limit`). Darum
 *   1. steht die Tabelle SOFORT da - aus der Bestenliste, die die Cup-Seite schon hat (Platz, Punkte, Spiele, Siege je Spieler); die Replay-Spalten
 *      (Elims, Schaden, Treffer ...) fuellen sich, sobald die Antwort da ist, bis dahin stehen dort ruhige Platzhalter und oben laeuft die Uhr;
 *   2. holt die Cup-Seite die Antwort schon beim Oeffnen vor (spielerStatsVorladen) - beim Klick auf den Reiter ist sie meist schon fertig;
 *   3. haelt ein Zwischenspeicher je Spieltag die Antwort (Reiterwechsel kostet nichts), live wird erst nach Ende der vorigen Abfrage neu gefragt.
 * Eine Suche ab drei Zeichen fragt zusaetzlich den Server im ganzen Feld (auch weit hinter den gezeigten 500).
 * Sternchen-Regel wie auf der Seite: solange nicht alle Runden gelesen sind, bekommen Spieler ohne elimsAusReplay ein Sternchen an den Replay-Werten.
 */

interface Zeile {
  epicId: string; name: string; land?: string | null; rang?: number; platz?: number | null; spiele?: number; elims?: number; knocks?: number; tode?: number;
  kd?: number; elimsJeMatch?: number; clutch?: number | null; damage?: number; damageTaken?: number; quote?: number | null; hits?: number; headshots?: number;
  builds?: number; matsFarmed?: number; timeAlive?: number; distanz?: number; reboots?: number; timeInStorm?: number; elimsAusReplay?: boolean; partner?: string[];
}
interface Antwort {
  vorhanden: boolean; spieler: Zeile[]; gesamt?: number; runden?: number; rundenGesamt?: number; hinweis?: string; streckeGeschaetzt?: boolean;
  summen?: Record<string, number> | null; plattformen?: Record<string, number> | null; liveVorlaeufig?: boolean;
}
type Ergebnis = { art: 'ok'; d: Antwort } | { art: 'anmelden' } | { art: 'fehler' };

/* ---------------------------------------------------------------- Abfrage mit Zwischenspeicher */
const vorrat = new Map<string, { zeit: number; p: Promise<Ergebnis> }>();
function abfragen(eventId: string, windowId: string, q = ''): Promise<Ergebnis> {
  const ab = new AbortController();
  const uhr = setTimeout(() => ab.abort(), 120_000);
  return fetch(`/api/cup-spieler?window=${encodeURIComponent(windowId)}&event=${encodeURIComponent(eventId)}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { signal: ab.signal })
    .then(async (r): Promise<Ergebnis> => {
      if (r.status === 401 || r.status === 403) return { art: 'anmelden' };
      if (!r.ok) return { art: 'fehler' };
      return { art: 'ok', d: await r.json() };
    })
    .catch((): Ergebnis => ({ art: 'fehler' }))
    .finally(() => clearTimeout(uhr));
}
/** Holt die Player stats eines Spieltags (oder nimmt die gemerkte Antwort, solange sie juenger als `alter` ms ist). */
function holen(eventId: string, windowId: string, alter = 10 * 60_000): Promise<Ergebnis> {
  const k = `${eventId}|${windowId}`;
  const da = vorrat.get(k);
  if (da && Date.now() - da.zeit < alter) return da.p;
  const p = abfragen(eventId, windowId).then((e) => { if (e.art === 'fehler') vorrat.delete(k); return e; });
  vorrat.set(k, { zeit: Date.now(), p });
  return p;
}
/** Fuer die Cup-Seite: die Antwort schon holen, bevor jemand den Reiter oeffnet. */
export function spielerStatsVorladen(eventId: string, windowId: string) { void holen(eventId, windowId); }

/* ---------------------------------------------------------------- Spalten */
type Format = 'zahl' | 'dez' | 'zeit' | 'km';
type Feld = 'platz' | 'punkte' | 'spiele' | 'siege' | 'elims' | 'knocks' | 'kd' | 'elimsJeMatch' | 'clutch' | 'damage' | 'damageTaken' | 'quote' | 'hits'
  | 'headshots' | 'builds' | 'matsFarmed' | 'timeAlive' | 'distanz' | 'timeInStorm' | 'reboots';
interface Spalte { feld: Feld; titel: string; lang?: string; f?: Format; replay?: boolean; klein?: boolean }
/** Sofort da (aus der Bestenliste). */
const BASIS: Spalte[] = [
  { feld: 'platz', titel: 'Place', lang: 'Placement of the team on this match day' }, { feld: 'punkte', titel: 'Pts', lang: 'Points of the team' },
  { feld: 'spiele', titel: 'Games' }, { feld: 'siege', titel: 'Wins', klein: true },
];
/** Aus den Replays (kommen nach). */
const REPLAY: Spalte[] = [
  { feld: 'elims', titel: 'Elims', replay: true }, { feld: 'knocks', titel: 'Knocks', replay: true }, { feld: 'kd', titel: 'K/D', f: 'dez', lang: 'from 5 games', replay: true },
  { feld: 'elimsJeMatch', titel: 'Elims/G', f: 'dez', lang: 'Eliminations per game, from 5 games', replay: true }, { feld: 'clutch', titel: 'Clutch', lang: 'Clutch points', replay: true },
  { feld: 'damage', titel: 'Damage', replay: true }, { feld: 'damageTaken', titel: 'Dmg taken', replay: true }, { feld: 'quote', titel: 'Ratio', f: 'dez', lang: 'Damage dealt / taken', replay: true },
  { feld: 'hits', titel: 'Hits', replay: true }, { feld: 'headshots', titel: 'HS', lang: 'Headshots', replay: true }, { feld: 'builds', titel: 'Builds', replay: true },
  { feld: 'matsFarmed', titel: 'Mats', lang: 'Materials farmed', replay: true }, { feld: 'timeAlive', titel: 'Alive', f: 'zeit', lang: 'Time alive', replay: true },
  { feld: 'distanz', titel: 'Km', f: 'km', lang: 'Distance travelled', replay: true }, { feld: 'timeInStorm', titel: 'Storm', f: 'zeit', lang: 'Time in storm', replay: true },
  { feld: 'reboots', titel: 'Reboots', replay: true },
];
/** Platzhalter-Spalten, solange die Replay-Antwort fehlt (danach nur die mit Werten). */
const ERWARTET: Feld[] = ['elims', 'knocks', 'damage', 'damageTaken', 'hits', 'headshots', 'builds', 'timeAlive', 'distanz'];
/** Die Tagesbesten oben. */
const BESTE: Array<{ feld: Feld; titel: string; f?: Format }> = [
  { feld: 'elims', titel: 'Top elims' }, { feld: 'damage', titel: 'Top damage' }, { feld: 'headshots', titel: 'Top headshots' },
  { feld: 'builds', titel: 'Top builds' }, { feld: 'matsFarmed', titel: 'Top mats farmed' }, { feld: 'timeAlive', titel: 'Longest alive', f: 'zeit' },
];
const zeigen = (v: unknown, f?: Format) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (f === 'dez') return zahl(v, 2);
  if (f === 'km') return zahl(v / 1000, 1);
  if (f === 'zeit') { const m = Math.floor(v / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m ${String(Math.round(v % 60)).padStart(2, '0')}s`; }
  return zahl(v);
};

/** Eine Zeile der Tabelle: Spieler, Werte aus der Bestenliste, Werte aus den Replays (w). */
interface Reihe { id: string; p: LbSpieler; platz?: number | null; punkte?: number; spiele?: number; siege?: number; partner: string[]; w?: Zeile }
const wert = (r: Reihe, feld: Feld): number | undefined => {
  const v = feld === 'platz' ? r.platz ?? r.w?.platz : feld === 'punkte' ? r.punkte : feld === 'siege' ? r.siege : feld === 'spiele' ? r.w?.spiele ?? r.spiele : r.w?.[feld];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

export default function SpielerStats({ eventId, windowId, live, spielerInfo, tabelle }: {
  eventId: string; windowId: string; live: boolean; spielerInfo: Map<string, LbSpieler>; tabelle: Eintrag[];
}) {
  const [erg, setErg] = useState<Ergebnis | null>(null);
  const [seit, setSeit] = useState(Date.now());
  const [sek, setSek] = useState(0);
  const [sort, setSort] = useState<{ feld: Feld; ab: boolean }>({ feld: 'platz', ab: false });
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<Zeile[] | null>(null);
  const [zeige, setZeige] = useState(100);
  const [nochmal, setNochmal] = useState(0);
  const { oeffnen } = useWer();

  // ---- Replay-Werte holen (aus dem Vorrat); live nach Ende der vorigen Abfrage jede Minute neu
  useEffect(() => {
    let weg = false; let takt: ReturnType<typeof setTimeout> | undefined;
    setErg(null); setSeit(Date.now()); setSek(0);
    const runde = (alter?: number) => {
      holen(eventId, windowId, alter).then((e) => {
        if (weg) return;
        // Ein Fehler beim Nachfassen ersetzt keine Antwort, die schon dasteht.
        setErg((alt) => (e.art === 'fehler' && alt?.art === 'ok' ? alt : e));
        if (live) takt = setTimeout(() => runde(55_000), 60_000);
      });
    };
    runde(live ? 55_000 : undefined);
    return () => { weg = true; if (takt) clearTimeout(takt); };
  }, [eventId, windowId, live, nochmal]);
  // die Uhr, solange gewartet wird
  useEffect(() => {
    if (erg) return;
    const i = setInterval(() => setSek(Math.round((Date.now() - seit) / 1000)), 1000);
    return () => clearInterval(i);
  }, [erg, seit]);

  // ---- Suche im ganzen Feld (Server), sobald drei Zeichen da sind
  useEffect(() => {
    const t = q.trim();
    setTreffer(null);
    if (t.length < 3 || erg?.art !== 'ok') return;
    let weg = false;
    const uhr = setTimeout(() => abfragen(eventId, windowId, t).then((e) => { if (!weg) setTreffer(e.art === 'ok' ? e.d.spieler ?? [] : []); }), 500);
    return () => { weg = true; clearTimeout(uhr); };
  }, [q, eventId, windowId, erg?.art]);

  const d = erg?.art === 'ok' ? erg.d : null;
  const hatReplay = !!d?.vorhanden && !!d.spieler?.length;
  const teilweise = !!d?.rundenGesamt && (d.rundenGesamt ?? 0) > (d.runden ?? 0);

  // ---- Zeilen: alle Spieler der Bestenliste, dazu die Replay-Werte (und Spieler, die nur die Replays kennen)
  const reihen = useMemo(() => {
    const m = new Map<string, Reihe>();
    for (const e of tabelle) for (const p of e.players) {
      m.set(p.id, { id: p.id, p, platz: e.rank, punkte: e.points, spiele: e.games, siege: e.wins, partner: e.players.filter((x) => x.id !== p.id).map(spielerName) });
    }
    const dazu = (z: Zeile) => {
      const r = m.get(z.epicId);
      if (r) r.w = z;
      else m.set(z.epicId, { id: z.epicId, p: spielerInfo.get(z.epicId) ?? { id: z.epicId, name: z.name, land: z.land }, platz: z.platz, partner: z.partner ?? [], w: z });
    };
    for (const z of d?.spieler ?? []) dazu(z);
    for (const z of treffer ?? []) dazu(z);
    return [...m.values()];
  }, [tabelle, d, treffer, spielerInfo]);

  const replaySpalten = useMemo(() => (hatReplay
    ? REPLAY.filter((s) => d!.spieler.some((z) => { const v = z[s.feld as keyof Zeile]; return typeof v === 'number' && v > 0; }))
    : erg ? [] : REPLAY.filter((s) => ERWARTET.includes(s.feld))), [hatReplay, d, erg]);
  const basisSpalten = useMemo(() => BASIS.filter((s) => (s.feld === 'siege' ? reihen.some((r) => (r.siege ?? 0) > 0) : true)), [reihen]);
  const spalten = [...basisSpalten, ...replaySpalten];
  const solo = (tabelle[0]?.players.length ?? 1) === 1;

  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    const vomServer = new Set((treffer ?? []).map((z) => z.epicId));
    const l = t ? reihen.filter((r) => vomServer.has(r.id) || `${r.p.name} ${r.p.anzeige ?? ''} ${r.w?.name ?? ''}`.toLowerCase().includes(t)) : reihen;
    // ohne Wert immer ans Ende, egal in welche Richtung sortiert wird
    return [...l].sort((a, b) => {
      const x = wert(a, sort.feld); const y = wert(b, sort.feld);
      if (x === undefined || y === undefined) return x === undefined ? (y === undefined ? 0 : 1) : -1;
      return sort.ab ? y - x : x - y;
    });
  }, [reihen, q, sort, treffer]);

  const beste = useMemo(() => BESTE.map((b) => {
    let top: Reihe | null = null; let best = 0;
    for (const r of reihen) { const v = wert(r, b.feld); if (v !== undefined && v > best) { best = v; top = r; } }
    return top ? { ...b, r: top as Reihe, v: best } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x), [reihen]);

  const kopf = (feld: Feld) => setSort((s) => ({ feld, ab: s.feld === feld ? !s.ab : feld !== 'platz' }));
  const plattformen = d?.plattformen ? Object.entries(d.plattformen).sort((a, b) => b[1] - a[1]) : [];
  const plattSumme = plattformen.reduce((a, [, n]) => a + n, 0);

  // ---- Zustand der Replay-Werte in einer Zeile (blockiert nie die Tabelle)
  const zustand = !erg ? (
    <span className="flex items-center gap-2 text-white/55">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/15 border-t-akz" />
      Reading replay stats <span className="zahl text-white/35">{sek}s</span>{sek > 12 && <span className="hidden text-white/35 md:inline">– big cups take up to 30 s</span>}
    </span>
  ) : erg.art === 'anmelden' ? (
    <span className="flex items-center gap-2 text-white/55">Replay stats need a CompHub account. <button type="button" onClick={() => oeffnen('konto')} className="font-semibold text-akz hover:underline">Sign in</button></span>
  ) : erg.art === 'fehler' ? (
    <span className="flex items-center gap-2 text-white/55">Replay stats aren't reachable right now. <button type="button" onClick={() => setNochmal((n) => n + 1)} className="font-semibold text-akz hover:underline">Retry</button></span>
  ) : !hatReplay ? (
    <span className="text-white/50">Per-player replay values are not read for this match day yet – placement and points below.</span>
  ) : (
    <span className="zahl text-white/50">
      {teilweise ? <span className="text-amber-300/90">{zahl(d!.runden)} of {zahl(d!.rundenGesamt)} games read</span> : <>{zahl(d!.runden)} games read</>}
      {d!.liveVorlaeufig && <span className="text-amber-300/90"> · live, provisional</span>}
    </span>
  );
  const tafelLeer = erg && !beste.some((b) => b.feld !== 'elims');

  return (
    <div>
      {/* ------------------------------------------------ Tagesbeste: kleine Kacheln, ein Klick sortiert danach (feste Hoehe, damit nichts springt) */}
      {!tafelLeer && (
        <div className="ohne-leiste flex gap-px overflow-x-auto border-b border-white/[0.06] bg-white/[0.06] md:grid md:grid-cols-3 xl:grid-cols-6">
          {BESTE.map((b0, i) => {
            const b = beste.find((x) => x.feld === b0.feld);
            const an = sort.feld === b0.feld;
            if (!b) return (
              <div key={b0.feld} className="h-[68px] w-[190px] shrink-0 bg-fl px-4 py-3 md:w-auto">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">{b0.titel}</p>
                <span className="mt-2 block h-5 w-20 rounded bg-white/[0.05]" />
              </div>
            );
            return (
              <motion.button key={b.feld} type="button" onClick={() => setSort({ feld: b.feld, ab: true })} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                className={`flex h-[68px] w-[190px] min-w-0 shrink-0 items-center gap-3 px-4 text-left transition md:w-auto ${an ? 'bg-akz/10' : 'bg-fl hover:bg-white/[0.03]'}`}>
                <Hochkant p={spielerInfo.get(b.r.id) ?? b.r.p} mass="h-12 w-9" rund="rounded-md" />
                <span className="min-w-0">
                  <span className={`block truncate text-[9px] font-semibold uppercase tracking-[0.2em] ${an ? 'text-akz' : 'text-white/40'}`}>{b.titel}</span>
                  <span className="titel zahl block text-2xl">{zeigen(b.v, b.f)}</span>
                  <span className="block truncate text-[11px] font-semibold text-white/70">{spielerName(spielerInfo.get(b.r.id) ?? b.r.p)}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------ Werkzeugzeile: Stand der Replays, Summen, Plattformen, Suche */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.06] px-4 py-2.5 text-xs sm:px-5">
        <span className="zahl font-semibold text-white/70">{zahl(Math.max(reihen.length, d?.gesamt ?? 0))} players</span>
        {zustand}
        {hatReplay && d!.summen && !teilweise && (
          <span className="zahl hidden text-white/40 lg:inline">
            {zahl(d!.summen.elims)} elims{d!.summen.damage ? ` · ${zahl(d!.summen.damage)} damage` : ''}{d!.summen.headshots ? ` · ${zahl(d!.summen.headshots)} headshots` : ''}
          </span>
        )}
        {plattSumme > 0 && (
          <span className="zahl hidden items-center gap-3 text-white/40 2xl:flex">
            {plattformen.slice(0, 4).map(([n, c]) => <span key={n}>{n} <span className="text-white/65">{Math.round((c / plattSumme) * 100)}%</span></span>)}
          </span>
        )}
        <input value={q} onChange={(e) => { setQ(e.target.value); setZeige(100); }} placeholder="Search a player…" className="eingabe ml-auto w-full !py-1.5 sm:w-56" />
      </div>

      {/* ------------------------------------------------ Tabelle: Kopf klebt oben, Spieler klebt links */}
      <div className="max-h-[78vh] overflow-auto">
        <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-10 border-b border-white/[0.08] bg-fl py-2 pl-4 pr-1 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:w-[52px] sm:pl-5">#</th>
              <th className="sticky left-10 top-0 z-30 border-b border-r border-white/[0.08] bg-fl px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 sm:left-[52px]">Player</th>
              {spalten.map((s, i) => {
                const an = sort.feld === s.feld;
                const warten = s.replay && !erg;
                return (
                  <th key={s.feld} title={s.lang} onClick={() => !warten && kopf(s.feld)} aria-sort={an ? (sort.ab ? 'descending' : 'ascending') : undefined}
                    className={`sticky top-0 z-20 select-none whitespace-nowrap border-b border-white/[0.08] bg-fl px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] transition ${warten ? 'text-white/25' : 'cursor-pointer hover:text-white'} ${an ? '!text-akz' : 'text-white/40'} ${i === basisSpalten.length ? 'border-l border-l-white/[0.06]' : ''} ${s.klein ? 'hidden sm:table-cell' : ''}`}>
                    {s.titel}<span className="inline-block w-2.5 text-[8px]">{an ? (sort.ab ? '▼' : '▲') : ''}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {liste.slice(0, zeige).map((r, i) => {
              const stern = teilweise && !!r.w && !r.w.elimsAusReplay;
              const info = spielerInfo.get(r.id);
              const land = info?.land || r.p.land || r.w?.land || info?.spielLand;
              return (
                <tr key={r.id} className="group/z">
                  <td className="zahl sticky left-0 z-10 border-b border-white/[0.04] bg-fl py-1 pl-4 pr-1 text-[11px] font-bold text-white/35 group-hover/z:bg-[#141722] sm:pl-5">{i + 1}</td>
                  <td className="sticky left-10 z-10 max-w-[170px] border-b border-r border-white/[0.04] border-r-white/[0.08] bg-fl px-2 py-1 group-hover/z:bg-[#141722] sm:left-[52px] sm:max-w-[320px]">
                    <Link to={`/competitive/player/${r.id}`} className="flex min-w-0 items-center gap-2">
                      {land ? <img src={flagge(land)} alt="" className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover" /> : <span className="w-[18px] shrink-0" />}
                      <span className="truncate font-semibold text-white transition hover:text-akz">{spielerName(info ?? r.p)}</span>
                      {!solo && r.partner.length > 0 && <span className="hidden truncate text-[11px] text-white/35 xl:inline">w/ {r.partner.join(', ')}</span>}
                    </Link>
                  </td>
                  {spalten.map((s, k) => {
                    const v = wert(r, s.feld);
                    const an = sort.feld === s.feld;
                    return (
                      <td key={s.feld} className={`zahl whitespace-nowrap border-b border-white/[0.04] px-2 py-1 text-right group-hover/z:bg-white/[0.03] ${k === basisSpalten.length ? 'border-l border-l-white/[0.06]' : ''} ${s.klein ? 'hidden sm:table-cell' : ''} ${an ? 'font-bold text-white' : v === undefined ? 'text-white/20' : s.feld === 'siege' && v > 0 ? 'font-semibold text-amber-300' : 'text-white/70'}`}>
                        {s.replay && !erg ? <span className="ml-auto block h-2 w-8 rounded-sm bg-white/[0.06]" />
                          : <>{s.feld === 'platz' && v !== undefined ? `#${v}` : zeigen(v, s.f)}{stern && s.replay && v !== undefined ? <span className="text-amber-300">*</span> : null}</>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!liste.length && <p className="p-10 text-center text-sm text-white/45">{q ? (q.trim().length >= 3 && erg?.art === 'ok' && treffer === null ? 'Searching the whole field…' : 'No player matches this search.') : 'No results yet.'}</p>}
      </div>
      {liste.length > zeige && <div className="flex justify-center border-t border-white/[0.06] p-3"><button type="button" onClick={() => setZeige((x) => x + 200)} className="knopf">Show more ({zahl(liste.length - zeige)})</button></div>}
      <p className="border-t border-white/[0.06] px-5 py-2.5 text-[11px] leading-relaxed text-white/40">
        {teilweise && <><span className="text-amber-300">*</span> Not every game of this player has been read from the replays yet – replay values are provisional. </>}
        Place, points and wins are the team's; everything else is per player, counted from the server replays. Distance in km{d?.streckeGeschaetzt ? ' (estimated from position samples)' : ''}.
      </p>
    </div>
  );
}
