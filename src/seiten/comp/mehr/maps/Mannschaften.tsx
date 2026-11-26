import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { Laedt, Suche, TeamFlagge, TeamFotos } from '../teile';

/*
 * Die Teams eines Cups (Reiter "Teams"), die Bestenliste (Epic ueber /api/cup-leaderboard, sonst die eingetragenen Teams, sonst die Eckdaten
 * der ersten Plaetze) und die private Cup-Tierlist (S bis F, je Spieltag im Browser gemerkt, Stufen umbenennbar).
 */

export interface MSpieler { id: string; name: string; anzeige: string; land: string | null; bild?: string | null }
export interface MTeam { id: string; spieler: MSpieler[]; rang: number | null; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null }
export interface PlatzZeile { rang: number; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null; preis?: string; spieler: Array<{ name: string; land: string | null }> }

const kopf = 'border-b border-white/5 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40';
const platzFarbe = (r: number) => (r === 1 ? 'text-amber-300' : r === 2 ? 'text-slate-200' : r === 3 ? 'text-amber-600' : 'text-white/40');

function Namen({ namen }: { namen: string[] }) {
  return <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{namen.map((n, i) => <span key={i} className="truncate">{n}</span>)}</span>;
}

export function TeamKarten({ teams }: { teams: MTeam[] }) {
  const [suche, setSuche] = useState('');
  const geordnet = useMemo(() => {
    const hatRang = teams.some((x) => x.rang !== null);
    return [...teams].sort((a, b) => (hatRang ? (a.rang ?? 9999) - (b.rang ?? 9999) : 0));
  }, [teams]);
  const q = suche.trim().toLowerCase();
  const sichtbar = q ? geordnet.filter((x) => x.spieler.some((s) => s.anzeige.toLowerCase().includes(q) || (s.land ?? '').toLowerCase() === q)) : geordnet;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-white">Teams <span className="ml-1 text-sm text-white/35">{teams.length}</span></h2>
        <Suche wert={suche} setze={setSuche} platz="Search a player …" />
      </div>
      {sichtbar.length === 0 ? <p className="text-sm text-white/45">No player found.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {sichtbar.map((x, i) => (
            <motion.li key={x.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 24) * 0.02 }} whileHover={{ y: -3 }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-4 text-center backdrop-blur-xl transition hover:border-sky-400/40">
              {x.spieler.length && x.spieler.every((s) => s.bild) ? <TeamFotos spieler={x.spieler} /> : <TeamFlagge groesse={x.spieler.length > 1 ? 40 : 32} laender={x.spieler.map((s) => s.land)} />}
              <span className="flex flex-col text-[11px] font-black uppercase leading-snug tracking-wide text-white">
                {x.spieler.map((s) => <Link key={s.id} to={`/competitive/player/${s.id}`} className="hover:text-sky-300">{s.anzeige}</Link>)}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-white/35">#{x.rang ?? i + 1}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RangAusTeams({ teams, schmal = false }: { teams: MTeam[]; schmal?: boolean }) {
  const zeilen = teams.filter((x) => x.rang !== null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  if (!zeilen.length) return <p className="p-4 text-sm text-white/45">No leaderboard for this day yet.</p>;
  return (
    <Platzierungen schmal={schmal} zeilen={zeilen.map((z) => ({ rang: z.rang ?? 0, punkte: z.punkte, siege: z.siege, elims: z.elims, spiele: z.spiele, spieler: z.spieler.map((s) => ({ name: s.anzeige, land: s.land, id: s.id })) }))} />
  );
}

export function Platzierungen({ zeilen, schmal = false }: { zeilen: Array<PlatzZeile & { spieler: Array<{ name: string; land: string | null; id?: string }> }>; schmal?: boolean }) {
  if (!zeilen.length) return <p className="p-4 text-sm text-white/45">No leaderboard for this day yet.</p>;
  const mit = (k: 'punkte' | 'siege' | 'elims' | 'spiele') => zeilen.some((z) => z[k] != null) && (k === 'punkte' || !schmal);
  const mitPreis = zeilen.some((z) => z.preis);
  return (
    <Glas className="overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className={kopf}>
          <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Team</th>
          {mit('punkte') && <th className="w-16 px-3 py-2.5 text-right">{schmal ? 'Pts' : 'Points'}</th>}
          {mit('siege') && <th className="w-14 px-3 py-2.5 text-right">Wins</th>}
          {mit('elims') && <th className="w-16 px-3 py-2.5 text-right">Elims</th>}
          {mit('spiele') && <th className="w-20 px-3 py-2.5 text-right">Matches</th>}
          {mitPreis && <th className="w-24 px-3 py-2.5 text-right">Prize</th>}
        </tr></thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.rang} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
              <td className={`px-3 py-2 text-xs font-black tabular-nums ${platzFarbe(z.rang)}`}>{z.rang}</td>
              <td className="px-3 py-2"><span className="flex items-center gap-2.5"><TeamFlagge groesse={z.spieler.length > 1 ? 28 : 22} laender={z.spieler.map((p) => p.land)} /><Namen namen={z.spieler.map((p) => p.name)} /></span></td>
              {mit('punkte') && <td className="px-3 py-2 text-right font-bold tabular-nums text-white">{z.punkte ?? ''}</td>}
              {mit('siege') && <td className="px-3 py-2 text-right tabular-nums text-white/70">{z.siege ?? ''}</td>}
              {mit('elims') && <td className="px-3 py-2 text-right tabular-nums text-white/70">{z.elims ?? ''}</td>}
              {mit('spiele') && <td className="px-3 py-2 text-right tabular-nums text-white/70">{z.spiele ?? ''}</td>}
              {mitPreis && <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-400">{z.preis ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Glas>
  );
}

interface LbZeile { rank: number; points: number; wins: number; elims: number; games: number; players: Array<{ id: string; name?: string; displayName?: string; anzeige?: string; land?: string | null }> }

/** Die Bestenliste von Epic: Platz, das ganze Team mit Flagge, Punkte, Siege, Elims, Spiele. Klick auf eine Zeile oeffnet den Match-Verlauf, ein Name das Profil. */
export function RangTabelle({ eventId, windowId, windows, laender, anzeigen, schmal = false, aufKlick }: {
  eventId: string | null; windowId: string; windows?: string[]; laender: Map<string, string | null>; anzeigen?: Map<string, string>; schmal?: boolean;
  /** Klick auf eine Zeile oeffnet den Match-Verlauf (wie auf der Seite) - die Namen bleiben Links zum Spielerprofil. */
  aufKlick?: (p: { id: string; name: string }) => void;
}) {
  const schluessel = windows && windows.length > 1 ? windows.join(',') : '';
  const [zeilen, setZeilen] = useState<LbZeile[] | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    if (!eventId) { setFehler(true); return undefined; }
    let weg = false; setZeilen(null); setFehler(false);
    const ziel = schluessel ? `windows=${encodeURIComponent(schluessel)}` : `window=${encodeURIComponent(windowId)}`;
    fetch(`/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&${ziel}&limit=100`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (!weg) { if (Array.isArray(j?.entries)) setZeilen(j.entries); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [eventId, windowId, schluessel]);
  if (fehler || (zeilen && !zeilen.length)) return <p className="p-4 text-sm text-white/45">No leaderboard for this day yet.</p>;
  if (!zeilen) return <Laedt />;
  const name = (p: LbZeile['players'][number]) => anzeigen?.get(p.id) || p.anzeige || p.displayName || p.name || '—';
  return (
    <Glas className="overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className={kopf}>
          <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Team</th><th className="w-16 px-3 py-2.5 text-right">{schmal ? 'Pts' : 'Points'}</th>
          {!schmal && <><th className="w-14 px-3 py-2.5 text-right">Wins</th><th className="w-16 px-3 py-2.5 text-right">Elims</th><th className="w-20 px-3 py-2.5 text-right">Matches</th></>}
        </tr></thead>
        <tbody>
          {zeilen.slice(0, 100).map((z) => (
            <tr key={z.rank} title={aufKlick ? 'Open the match history' : undefined}
              onClick={aufKlick && z.players[0] ? () => aufKlick({ id: z.players[0].id, name: name(z.players[0]) }) : undefined}
              className={`border-b border-white/[0.04] transition hover:bg-sky-400/[0.05] ${aufKlick ? 'cursor-pointer' : ''}`}>
              <td className={`px-3 py-2 text-xs font-black tabular-nums ${platzFarbe(z.rank)}`}>{z.rank}</td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2.5">
                  <TeamFlagge groesse={z.players.length > 1 ? 28 : 22} laender={z.players.map((p) => laender.get(p.id) ?? p.land ?? null)} />
                  <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">
                    {z.players.map((p) => <Link key={p.id} to={`/competitive/player/${p.id}`} onClick={(e) => e.stopPropagation()} className="truncate hover:text-sky-300">{name(p)}</Link>)}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-white">{z.points}</td>
              {!schmal && <><td className="px-3 py-2 text-right tabular-nums text-white/70">{z.wins}</td><td className="px-3 py-2 text-right tabular-nums text-white/70">{z.elims}</td><td className="px-3 py-2 text-right tabular-nums text-white/70">{z.games}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </Glas>
  );
}

/* ---------------------------------------------------------------- Tierlist */

const STUFEN = [
  { k: 'S', farbe: '#ef4444' }, { k: 'A', farbe: '#f97316' }, { k: 'B', farbe: '#fbbf24' }, { k: 'C', farbe: '#22c55e' },
  { k: 'D', farbe: '#3b82f6' }, { k: 'E', farbe: '#8b5cf6' }, { k: 'F', farbe: '#64748b' },
] as const;
type Stufe = typeof STUFEN[number]['k'];

function TeamChip({ t, aktiv, breit, onKlick, onZiehen }: { t: MTeam; aktiv?: boolean; breit?: boolean; onKlick: () => void; onZiehen: (id: string | null) => void }) {
  return (
    <button type="button" draggable onClick={(e) => { e.stopPropagation(); onKlick(); }}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onZiehen(t.id); }} onDragEnd={() => onZiehen(null)}
      className={`flex ${breit ? 'w-full' : 'w-fit max-w-full'} items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition ${aktiv ? 'border-sky-400 bg-sky-400/15' : 'border-white/10 bg-black/30 hover:border-sky-400/50'}`}>
      <TeamFlagge groesse={t.spieler.length > 1 ? 28 : 22} laender={t.spieler.map((s) => s.land)} />
      <Namen namen={t.spieler.map((s) => s.anzeige)} />
    </button>
  );
}

export function CupTierlist({ windowId, teams }: { windowId: string; teams: MTeam[] }) {
  const sk = `maps_tierlist_${windowId}`;
  const [zu, setZu] = useState<Record<string, Stufe>>({});
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [zieht, setZieht] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  // Eigene Stufennamen - bewusst nur solange die Seite offen ist (Betreiber).
  const [namen, setNamen] = useState<Partial<Record<Stufe, string>>>({});
  useEffect(() => { try { setZu(JSON.parse(localStorage.getItem(sk) ?? '{}')); } catch { setZu({}); } }, [sk]);
  const speichern = (neu: Record<string, Stufe>) => { setZu(neu); try { localStorage.setItem(sk, JSON.stringify(neu)); } catch { /* ohne Speicher */ } };
  const setze = (id: string, st: Stufe | null) => { const neu = { ...zu }; if (st) neu[id] = st; else delete neu[id]; speichern(neu); setGewaehlt(null); };
  const nachId = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);
  const pool = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return teams.filter((x) => !zu[x.id] && (!q || x.spieler.some((s) => s.anzeige.toLowerCase().includes(q))));
  }, [teams, zu, suche]);
  if (!teams.length) return <p className="text-sm text-white/45">No teams for this day yet.</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-white/45">
        <button type="button" onClick={() => speichern({})} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-semibold text-white/75 transition hover:border-sky-400/50">Reset</button>
        <span>Drag or tap a team, then tap a tier — tap a placed team to take it out. The letters can be renamed.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
        <div className="space-y-1.5">
          {STUFEN.map((st) => {
            const drin = teams.filter((x) => zu[x.id] === st.k);
            const wert = namen[st.k] ?? st.k;
            return (
              <div key={st.k} className="flex min-h-[72px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || zieht; if (id && nachId.has(id)) setze(id, st.k); setZieht(null); }}
                onClick={() => { if (gewaehlt) setze(gewaehlt, st.k); }}>
                <span className="flex w-20 shrink-0 items-center justify-center px-1" style={{ background: st.farbe }} onClick={(e) => e.stopPropagation()}>
                  <input value={wert} maxLength={16} aria-label="Rename tier" onChange={(e) => setNamen((a) => ({ ...a, [st.k]: e.target.value }))}
                    onBlur={(e) => { if (!e.target.value.trim()) setNamen((a) => { const n = { ...a }; delete n[st.k]; return n; }); }}
                    className={`w-full bg-transparent text-center font-black uppercase leading-tight text-[#06080f] outline-none focus:rounded focus:bg-white/30 ${wert.length <= 2 ? 'text-xl' : wert.length <= 5 ? 'text-sm' : 'text-[10px]'}`} />
                </span>
                <div className="flex flex-1 flex-wrap content-start gap-1.5 p-2">
                  {drin.map((x) => <TeamChip key={x.id} t={x} onKlick={() => setze(x.id, null)} onZiehen={setZieht} />)}
                </div>
              </div>
            );
          })}
        </div>
        <aside className="relative rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex max-h-[520px] flex-col p-3 lg:absolute lg:inset-0 lg:max-h-none">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Pool <span className="text-white/30">{pool.length}</span></p>
            <Suche wert={suche} setze={setSuche} platz="Search a player …" className="mb-2 sm:w-full" />
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {pool.map((x) => <TeamChip key={x.id} t={x} breit aktiv={gewaehlt === x.id} onKlick={() => setGewaehlt(gewaehlt === x.id ? null : x.id)} onZiehen={setZieht} />)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
