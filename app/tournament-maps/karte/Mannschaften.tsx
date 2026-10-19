'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import type { SolosTeam } from '@/lib/globalsSolos';

/*
 * Die Teams eines Cups als Karten (Reiter "Spieler") und die Bestenliste (Reiter "Leaderboard").
 *
 * Der Betreiber (12.10.2026): "Players soll auch so aussehen ..., dass es jeweils ein Duo ist" - eine Karte je Team mit
 * den Flaggen oben, den Namen darunter und dem Platz. Und bei der Bestenliste: "das ganze Trio, jeweilige Flagge, dann
 * mit Points, VR und Eliminations und mit der Platzierung".
 */

/** Eine Karte je Team: Flaggen oben, Namen, Platz. */
export function TeamKarten({ teams }: { teams: SolosTeam[] }) {
  const t = useT();
  const [suche, setSuche] = useState('');
  const geordnet = useMemo(() => {
    const hatRang = teams.some((x) => x.rang !== null);
    return [...teams].sort((a, b) => (hatRang ? (a.rang ?? 9999) - (b.rang ?? 9999) : 0));
  }, [teams]);
  const q = suche.trim().toLowerCase();
  const sichtbar = q ? geordnet.filter((x) => x.spieler.some((s) => s.anzeige.toLowerCase().includes(q) || (s.land ?? '').toLowerCase() === q)) : geordnet;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-300"><T>Teams</T> <span className="ml-1 text-slate-600">{teams.length}</span></h2>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
          className="w-full max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
      </div>
      {sichtbar.length === 0 ? <p className="text-sm text-slate-500"><T>Kein Spieler gefunden.</T></p> : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {sichtbar.map((x, i) => (
            <li key={x.id} className="flex flex-col items-center rounded-xl border border-white/[0.07] bg-zinc-900/50 px-3 py-4 text-center transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <TeamFlagge groesse={x.spieler.length > 1 ? 40 : 30} laender={x.spieler.map((s) => s.land ?? undefined)} />
              <span className="mt-2 flex flex-col text-[11px] font-black uppercase leading-snug tracking-wide text-slate-100">
                {x.spieler.map((s) => <span key={s.id}>{s.anzeige}</span>)}
              </span>
              <span className="mt-1 text-[10px] font-semibold tabular-nums text-slate-600">#{x.rang ?? i + 1}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Die Bestenliste eines von Hand angelegten Events: nur, was der Admin eingetragen hat (Platz, Team, Punkte). */
export function RangAusTeams({ teams, schmal = false }: { teams: SolosTeam[]; /** Die schmale Fassung neben der Karte: nur Platz, Team und Punkte. */ schmal?: boolean }) {
  const zeilen = teams.filter((x) => x.rang !== null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  const mitSiege = !schmal && zeilen.some((x) => x.siege != null);
  const mitElims = !schmal && zeilen.some((x) => x.elims != null);
  const mitSpiele = !schmal && zeilen.some((x) => x.spiele != null);
  if (!zeilen.length) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <th className="w-10 px-3 py-2">#</th><th className="px-3 py-2"><T>Team</T></th><th className="w-16 px-3 py-2 text-right">{schmal ? 'Pts' : 'Points'}</th>
            {mitSiege && <th className="w-14 px-3 py-2 text-right" title="Victory Royales">Wins</th>}
            {mitElims && <th className="w-16 px-3 py-2 text-right">Elims</th>}
            {mitSpiele && <th className="w-20 px-3 py-2 text-right">Matches</th>}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id} className="border-b border-white/[0.04] transition hover:bg-sky-500/[0.05]">
              <td className="px-3 py-2 text-[11px] font-bold tabular-nums text-slate-500">{z.rang}</td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2.5">
                  <TeamFlagge groesse={z.spieler.length > 1 ? 28 : 20} laender={z.spieler.map((p) => p.land ?? undefined)} />
                  <span className="flex flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                    {z.spieler.map((p) => <span key={p.id}>{p.anzeige}</span>)}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-100">{z.punkte ?? ''}</td>
              {mitSiege && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.siege ?? ''}</td>}
              {mitElims && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.elims ?? ''}</td>}
              {mitSpiele && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.spiele ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface PlatzZeile { rang: number; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null; preis?: string; spieler: Array<{ name: string; land: string | null }> }

/** Die ersten Plaetze eines Endspiels (Eckdaten): Platz, Team mit Flaggen, Punkte oder Preisgeld - fuer Events ohne Bestenliste bei Epic. */
export function Platzierungen({ zeilen, schmal = false }: { zeilen: PlatzZeile[]; schmal?: boolean }) {
  if (!zeilen.length) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;
  const mitPunkte = zeilen.some((z) => z.punkte != null);
  const mitPreis = zeilen.some((z) => z.preis);
  // Siege, Eliminierungen und Spiele - wo die Quelle sie fuehrt (archivierte Bestenlisten, Epic), nur in der grossen Ansicht.
  const mitSiege = !schmal && zeilen.some((z) => z.siege != null);
  const mitElims = !schmal && zeilen.some((z) => z.elims != null);
  const mitSpiele = !schmal && zeilen.some((z) => z.spiele != null);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <th className="w-10 px-3 py-2">#</th><th className="px-3 py-2"><T>Team</T></th>
            {mitPunkte && <th className="w-16 px-3 py-2 text-right">{schmal ? 'Pts' : 'Points'}</th>}
            {mitSiege && <th className="w-14 px-3 py-2 text-right" title="Victory Royales">Wins</th>}
            {mitElims && <th className="w-16 px-3 py-2 text-right">Elims</th>}
            {mitSpiele && <th className="w-20 px-3 py-2 text-right">Matches</th>}
            {mitPreis && <th className={`px-3 py-2 text-right ${schmal ? 'w-16' : 'w-24'}`}><T>Preisgeld</T></th>}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.rang} className="border-b border-white/[0.04]">
              <td className={`px-3 py-2 text-[11px] font-black tabular-nums ${z.rang === 1 ? 'text-amber-300' : 'text-slate-500'}`}>{z.rang}</td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2.5">
                  <TeamFlagge groesse={z.spieler.length > 1 ? 28 : 20} laender={z.spieler.map((p) => p.land)} />
                  <span className="flex flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                    {z.spieler.map((p) => <span key={p.name}>{p.name}</span>)}
                  </span>
                </span>
              </td>
              {mitPunkte && <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-100">{z.punkte ?? ''}</td>}
              {mitSiege && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.siege ?? ''}</td>}
              {mitElims && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.elims ?? ''}</td>}
              {mitSpiele && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.spiele ?? ''}</td>}
              {mitPreis && <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-400">{z.preis ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Zeile {
  rank: number; points: number; wins: number; elims: number; games: number;
  players: Array<{ id: string; name?: string; displayName?: string; anzeige?: string; land?: string | null }>;
}

/** Die Bestenliste: Platz, das ganze Team mit Flaggen, Punkte, Siege (VR) und Eliminierungen. */
export function RangTabelle({ eventId, windowId, windows, laender, anzeigen, schmal = false, aufKlick }: {
  /** Ein Klick auf eine Zeile: der erste Spieler des Teams (sein Team steht im Fenster daneben). */
  aufKlick?: (p: { id: string; name: string }) => void;
  eventId: string | null; windowId: string;
  /** Mehrere Spieltage zusammen (Day 1 + Day 2): ihre Fenster-Kennungen - dann gilt windowId nicht. */
  windows?: string[];
  laender: Map<string, string | null>;
  /** Die Namen, wie das Werkzeug sie kennt (ohne Orgtag), je Konto. */ anzeigen?: Map<string, string>;
  /** Die schmale Fassung neben der Karte: nur Platz, Team und Punkte. */ schmal?: boolean;
}) {
  const fensterSchluessel = windows && windows.length > 1 ? windows.join(',') : '';
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    if (!eventId) { setFehler(true); return undefined; }
    let weg = false;
    setZeilen(null); setFehler(false);
    const ziel = fensterSchluessel ? `windows=${encodeURIComponent(fensterSchluessel)}` : `window=${encodeURIComponent(windowId)}`;
    fetch(`/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&${ziel}&limit=100`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (weg) return; if (Array.isArray(j?.entries)) setZeilen(j.entries); else setFehler(true); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [eventId, windowId, fensterSchluessel]);

  if (fehler) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;
  if (!zeilen) return <LadeSchirm />;
  if (!zeilen.length) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <th className="w-10 px-3 py-2">#</th><th className="px-3 py-2"><T>Team</T></th>
            <th className="w-16 px-3 py-2 text-right">{schmal ? 'Pts' : 'Points'}</th>
            {!schmal && <th className="w-14 px-3 py-2 text-right" title="Victory Royales">Wins</th>}
            {!schmal && <th className="w-16 px-3 py-2 text-right">Elims</th>}
            {!schmal && <th className="w-20 px-3 py-2 text-right">Matches</th>}
          </tr>
        </thead>
        <tbody>
          {zeilen.slice(0, 100).map((z) => (
            <tr key={z.rank}
              onClick={aufKlick && z.players[0] ? () => aufKlick({ id: z.players[0].id, name: anzeigen?.get(z.players[0].id) || z.players[0].anzeige || z.players[0].displayName || z.players[0].name || '' }) : undefined}
              className={`border-b border-white/[0.04] transition hover:bg-sky-500/[0.05] ${aufKlick ? 'cursor-pointer' : ''}`}>
              <td className="px-3 py-2 text-[11px] font-bold tabular-nums text-slate-500">{z.rank}</td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2.5">
                  <TeamFlagge groesse={z.players.length > 1 ? 28 : 20} laender={z.players.map((p) => laender.get(p.id) ?? p.land ?? undefined)} />
                  <span className="flex flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                    {z.players.map((p) => <span key={p.id}>{anzeigen?.get(p.id) || p.anzeige || p.displayName || p.name || '—'}</span>)}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-100">{z.points}</td>
              {!schmal && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.wins}</td>}
              {!schmal && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.elims}</td>}
              {!schmal && <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.games}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
