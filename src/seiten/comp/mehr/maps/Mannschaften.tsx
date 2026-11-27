import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Laedt, Suche, TeamFlagge, TeamFotos } from '../teile';

/*
 * Die Teams eines Cups (Ansicht "Teams"), die Bestenliste (Epic ueber /api/cup-leaderboard, sonst die eingetragenen Teams, sonst die Eckdaten
 * der ersten Plaetze) und die private Cup-Tierlist (S bis F, je Spieltag im Browser gemerkt, Stufen umbenennbar).
 * Design-System 3.0: die Tabellen stehen ohne eigene Flaeche (die Seite setzt sie in ein Dock oder eine Flaeche), Teams als gleich grosse
 * Kacheln - Hochkant-Fotos nur, wenn jeder im Team eines hat; sonst dieselbe Kachel ohne Fotostreifen.
 */

export interface MSpieler { id: string; name: string; anzeige: string; land: string | null; bild?: string | null }
export interface MTeam { id: string; spieler: MSpieler[]; rang: number | null; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null }
export interface PlatzZeile { rang: number; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null; preis?: string; spieler: Array<{ name: string; land: string | null }> }

const platzFarbe = (r: number) => (r === 1 ? 'text-amber-300' : r === 2 ? 'text-slate-200' : r === 3 ? 'text-amber-600' : 'text-white/40');
const leer = <p className="px-4 py-6 text-center text-sm text-white/45">No leaderboard for this day yet.</p>;

function Namen({ namen }: { namen: string[] }) {
  return <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">{namen.map((n, i) => <span key={i} className="truncate">{n}</span>)}</span>;
}

/** Alle Teams als gleich grosse Kacheln: Platz, Fotos (wenn vollstaendig), Flagge, Namen als Links zum Profil. */
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-akz" /><h2 className="titel text-3xl">Teams <span className="zahl font-text text-sm font-semibold normal-case tracking-normal text-white/35">{teams.length}</span></h2></div>
        <Suche wert={suche} setze={setSuche} platz="Search a player or country code …" />
      </div>
      {sichtbar.length === 0 ? <p className="text-sm text-white/45">No player found.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {sichtbar.map((x, i) => (
            <motion.li key={x.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 24) * 0.02 }}
              className="fl-fest fl-klick flex min-h-[148px] flex-col gap-3 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <span className={`titel text-3xl ${(x.rang ?? i + 1) <= 3 ? '!text-amber-300' : '!text-white/35'}`}>{x.rang ?? i + 1}</span>
                <TeamFotos spieler={x.spieler} />
              </div>
              <div className="mt-auto flex items-end gap-2.5">
                <TeamFlagge groesse={x.spieler.length > 1 ? 30 : 24} laender={x.spieler.map((s) => s.land)} />
                <span className="flex min-w-0 flex-1 flex-col text-[12px] font-bold uppercase leading-snug tracking-wide text-white">
                  {x.spieler.map((s) => <Link key={s.id} to={`/competitive/player/${s.id}`} className="truncate hover:text-akz">{s.anzeige}</Link>)}
                </span>
                {x.punkte != null && <span className="zahl shrink-0 text-xs font-bold text-white/55">{x.punkte}</span>}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RangAusTeams({ teams, schmal = false }: { teams: MTeam[]; schmal?: boolean }) {
  const zeilen = teams.filter((x) => x.rang !== null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  if (!zeilen.length) return leer;
  return (
    <Platzierungen schmal={schmal} zeilen={zeilen.map((z) => ({ rang: z.rang ?? 0, punkte: z.punkte, siege: z.siege, elims: z.elims, spiele: z.spiele, spieler: z.spieler.map((s) => ({ name: s.anzeige, land: s.land, id: s.id, bild: s.bild })) }))} />
  );
}

export function Platzierungen({ zeilen, schmal = false }: { zeilen: Array<PlatzZeile & { spieler: Array<{ name: string; land: string | null; id?: string; bild?: string | null }> }>; schmal?: boolean }) {
  if (!zeilen.length) return leer;
  const mit = (k: 'punkte' | 'siege' | 'elims' | 'spiele') => zeilen.some((z) => z[k] != null) && (k === 'punkte' || !schmal);
  const mitPreis = zeilen.some((z) => z.preis);
  return (
    <table className="tabelle">
      <thead><tr>
        <th className="w-10">#</th><th>Team</th>
        {mit('punkte') && <th className="w-16 !text-right">{schmal ? 'Pts' : 'Points'}</th>}
        {mit('siege') && <th className="w-14 !text-right">Wins</th>}
        {mit('elims') && <th className="w-16 !text-right">Elims</th>}
        {mit('spiele') && <th className="w-20 !text-right">Matches</th>}
        {mitPreis && <th className="w-24 !text-right">Prize</th>}
      </tr></thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.rang}>
            <td className={`zahl text-xs font-black ${platzFarbe(z.rang)}`}>{z.rang}</td>
            <td><span className="flex items-center gap-2.5"><TeamFlagge groesse={z.spieler.length > 1 ? 28 : 22} laender={z.spieler.map((p) => p.land)} />{!schmal && <TeamFotos klein spieler={z.spieler} />}<Namen namen={z.spieler.map((p) => p.name)} /></span></td>
            {mit('punkte') && <td className="zahl text-right font-bold text-white">{z.punkte ?? ''}</td>}
            {mit('siege') && <td className="zahl text-right text-white/70">{z.siege ?? ''}</td>}
            {mit('elims') && <td className="zahl text-right text-white/70">{z.elims ?? ''}</td>}
            {mit('spiele') && <td className="zahl text-right text-white/70">{z.spiele ?? ''}</td>}
            {mitPreis && <td className="zahl text-right font-bold text-emerald-400">{z.preis ?? ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface LbZeile { rank: number; points: number; wins: number; elims: number; games: number; players: Array<{ id: string; name?: string; displayName?: string; anzeige?: string; land?: string | null }> }

/** Die Bestenliste von Epic: Platz, das ganze Team mit Flagge (und Fotos, wo alle eines haben), Punkte, Siege, Elims, Spiele. Klick auf eine Zeile oeffnet den Match-Verlauf, ein Name das Profil. */
export function RangTabelle({ eventId, windowId, windows, laender, anzeigen, bilder, schmal = false, aufKlick }: {
  eventId: string | null; windowId: string; windows?: string[]; laender: Map<string, string | null>; anzeigen?: Map<string, string>; bilder?: Map<string, string | null | undefined>; schmal?: boolean;
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
  if (fehler || (zeilen && !zeilen.length)) return leer;
  if (!zeilen) return <Laedt />;
  const name = (p: LbZeile['players'][number]) => anzeigen?.get(p.id) || p.anzeige || p.displayName || p.name || '—';
  return (
    <table className="tabelle">
      <thead><tr>
        <th className="w-10">#</th><th>Team</th><th className="w-16 !text-right">{schmal ? 'Pts' : 'Points'}</th>
        {!schmal && <><th className="w-14 !text-right">Wins</th><th className="w-16 !text-right">Elims</th><th className="w-20 !text-right">Matches</th></>}
      </tr></thead>
      <tbody>
        {zeilen.slice(0, 100).map((z) => (
          <tr key={z.rank} title={aufKlick ? 'Open the match history' : undefined}
            onClick={aufKlick && z.players[0] ? () => aufKlick({ id: z.players[0].id, name: name(z.players[0]) }) : undefined}
            className={aufKlick ? 'cursor-pointer' : ''}>
            <td className={`zahl text-xs font-black ${platzFarbe(z.rank)}`}>{z.rank}</td>
            <td>
              <span className="flex items-center gap-2.5">
                <TeamFlagge groesse={z.players.length > 1 ? 28 : 22} laender={z.players.map((p) => laender.get(p.id) ?? p.land ?? null)} />
                {!schmal && bilder && <TeamFotos klein spieler={z.players.map((p) => ({ bild: bilder.get(p.id) }))} />}
                <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.3] tracking-wide text-white">
                  {z.players.map((p) => <Link key={p.id} to={`/competitive/player/${p.id}`} onClick={(e) => e.stopPropagation()} className="truncate hover:text-akz">{name(p)}</Link>)}
                </span>
              </span>
            </td>
            <td className="zahl text-right font-bold text-white">{z.points}</td>
            {!schmal && <><td className="zahl text-right text-white/70">{z.wins}</td><td className="zahl text-right text-white/70">{z.elims}</td><td className="zahl text-right text-white/70">{z.games}</td></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- Tierlist */

const STUFEN = [
  { k: 'S', farbe: '#ef4444' }, { k: 'A', farbe: '#f97316' }, { k: 'B', farbe: '#fbbf24' }, { k: 'C', farbe: '#22c55e' },
  { k: 'D', farbe: '#3b82f6' }, { k: 'E', farbe: '#8b5cf6' }, { k: 'F', farbe: '#64748b' },
] as const;
type Stufe = typeof STUFEN[number]['k'];

/** Ein Team als Baustein der Tierlist - ueberall dieselbe Groesse (Betreiber: gleichfoermige Kacheln), Fotos nur bei vollstaendigem Team. */
function TeamChip({ t, aktiv, onKlick, onZiehen }: { t: MTeam; aktiv?: boolean; onKlick: () => void; onZiehen: (id: string | null) => void }) {
  return (
    <button type="button" draggable onClick={(e) => { e.stopPropagation(); onKlick(); }}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onZiehen(t.id); }} onDragEnd={() => onZiehen(null)}
      className={`flex h-[58px] w-[186px] items-center gap-2 rounded-xl border px-2.5 text-left transition ${aktiv ? 'border-akz bg-akz/15' : 'border-white/[0.08] bg-black/40 hover:border-akz/50'}`}>
      <TeamFlagge groesse={t.spieler.length > 1 ? 26 : 22} laender={t.spieler.map((s) => s.land)} />
      <Namen namen={t.spieler.map((s) => s.anzeige)} />
      <span className="ml-auto"><TeamFotos klein spieler={t.spieler.length <= 2 ? t.spieler : []} /></span>
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
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch">
      <div className="fl-fest overflow-hidden">
        {STUFEN.map((st) => {
          const drin = teams.filter((x) => zu[x.id] === st.k);
          const wert = namen[st.k] ?? st.k;
          return (
            <div key={st.k} className="flex min-h-[78px] border-b border-white/[0.06] last:border-b-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || zieht; if (id && nachId.has(id)) setze(id, st.k); setZieht(null); }}
              onClick={() => { if (gewaehlt) setze(gewaehlt, st.k); }}>
              <span className="flex w-20 shrink-0 items-center justify-center px-1" style={{ background: st.farbe }} onClick={(e) => e.stopPropagation()}>
                <input value={wert} maxLength={16} aria-label="Rename tier" onChange={(e) => setNamen((a) => ({ ...a, [st.k]: e.target.value }))}
                  onBlur={(e) => { if (!e.target.value.trim()) setNamen((a) => { const n = { ...a }; delete n[st.k]; return n; }); }}
                  className={`w-full bg-transparent text-center font-titel uppercase leading-tight text-[#04050a] outline-none focus:rounded focus:bg-white/30 ${wert.length <= 2 ? 'text-4xl' : wert.length <= 5 ? 'text-xl' : 'text-xs'}`} />
              </span>
              <div className={`flex flex-1 flex-wrap content-start gap-1.5 p-2.5 transition ${gewaehlt ? 'cursor-pointer hover:bg-akz/[0.06]' : ''}`}>
                {drin.map((x) => <TeamChip key={x.id} t={x} onKlick={() => setze(x.id, null)} onZiehen={setZieht} />)}
              </div>
            </div>
          );
        })}
      </div>
      <aside className="fl-fest relative min-h-[320px]">
        <div className="flex max-h-[560px] flex-col p-3 xl:absolute xl:inset-0 xl:max-h-none">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-akz" /><h3 className="titel text-xl">Pool</h3><span className="zahl text-xs font-semibold text-white/40">{pool.length}</span>
            <button type="button" onClick={() => speichern({})} className="knopf ml-auto !px-3 !py-1 !text-xs">Reset</button>
          </div>
          <Suche wert={suche} setze={setSuche} platz="Search a player …" className="mb-2 sm:!w-full" />
          <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
            {pool.map((x) => <TeamChip key={x.id} t={x} aktiv={gewaehlt === x.id} onKlick={() => setGewaehlt(gewaehlt === x.id ? null : x.id)} onZiehen={setZieht} />)}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">Drag or tap a team, then tap a tier — tap a placed team to take it out. The letters can be renamed.</p>
        </div>
      </aside>
    </div>
  );
}
