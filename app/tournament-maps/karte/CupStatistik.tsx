'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import type { SolosTeam } from '@/lib/globalsSolos';

/*
 * Die Statistik eines Spieltags (Reiter "Statistik" auf der Cup-Seite).
 *
 * Der Betreiber (13.10.2026): die Cup-Seite soll wie beim Vorbild einen Statistik-Reiter haben. Gerechnet wird aus der
 * Bestenliste des Spieltags - Epics, wo es eine gibt, sonst aus dem, was der Admin eingetragen hat: wer die meisten
 * Eliminierungen hatte, die meisten Siege, den besten Schnittplatz, das beste einzelne Spiel. Was die Quelle nicht
 * liefert (Schaden bei älteren Spieltagen), steht hier nicht - es wird nichts geschätzt.
 */

interface Zeile {
  rank: number; points: number; wins: number; elims: number; games: number; avgPlace?: number; avgPoints?: number;
  matches?: Array<{ elims?: number; placement?: number }>;
  players: Array<{ id: string; name?: string; displayName?: string }>;
}
interface Eintrag { team: string; ids: string[]; wert: number; zusatz?: string }

const nameDe = (z: Zeile) => z.players.map((p) => p.displayName || p.name || '—').join(' · ');

function Liste({ titel, zeilen, einheit, laender }: { titel: string; zeilen: Eintrag[]; einheit?: string; laender: Map<string, string | null> }) {
  if (!zeilen.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
      <p className="border-b border-white/[0.08] bg-zinc-900/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"><T>{titel}</T></p>
      <ol>
        {zeilen.map((z, i) => (
          <li key={`${z.team}${i}`} className="flex items-center gap-2.5 border-b border-white/[0.04] px-3 py-2 last:border-b-0">
            <span className={`w-4 text-center text-[11px] font-black tabular-nums ${i === 0 ? 'text-amber-300' : 'text-slate-500'}`}>{i + 1}</span>
            <TeamFlagge groesse={z.ids.length > 1 ? 24 : 18} laender={z.ids.map((id) => laender.get(id) ?? undefined)} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase text-slate-100">{z.team}</span>
            {z.zusatz && <span className="text-[10px] text-slate-500">{z.zusatz}</span>}
            <span className="text-sm font-black tabular-nums text-sky-400">{z.wert}{einheit ?? ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CupStatistik({ eventId, windowId, teams, vonHand, laender }: {
  eventId: string | null; windowId: string; teams: SolosTeam[]; vonHand: boolean; laender: Map<string, string | null>;
}) {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    setZeilen(null); setFehler(false);
    if (vonHand || !eventId) {
      // Von Hand gepflegt: die Zahlen, die der Admin eingetragen hat.
      setZeilen(teams.filter((x) => x.punkte != null || x.elims != null).map((x) => ({
        rank: x.rang ?? 0, points: x.punkte ?? 0, wins: x.siege ?? 0, elims: x.elims ?? 0, games: 0,
        players: x.spieler.map((s) => ({ id: s.id, displayName: s.anzeige })),
      })));
      return undefined;
    }
    let weg = false;
    fetch(`/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&limit=100`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (weg) return; if (Array.isArray(j?.entries)) setZeilen(j.entries); else setFehler(true); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [eventId, windowId, vonHand, teams]);

  const listen = useMemo(() => {
    if (!zeilen?.length) return null;
    const eintrag = (z: Zeile, wert: number, zusatz?: string): Eintrag => ({ team: nameDe(z), ids: z.players.map((p) => p.id), wert, zusatz });
    const top = (f: (z: Zeile) => number | null, n = 8, absteigend = true, zusatz?: (z: Zeile) => string | undefined) =>
      zeilen.map((z) => ({ z, w: f(z) })).filter((x): x is { z: Zeile; w: number } => x.w !== null && Number.isFinite(x.w))
        .sort((a, b) => (absteigend ? b.w - a.w : a.w - b.w)).slice(0, n).map((x) => eintrag(x.z, x.w, zusatz?.(x.z)));
    const bestesSpiel = (z: Zeile) => {
      const w = (z.matches ?? []).map((m) => m.elims ?? 0);
      return w.length ? Math.max(...w) : null;
    };
    return {
      elims: top((z) => (z.elims > 0 ? z.elims : null)),
      siege: top((z) => (z.wins > 0 ? z.wins : null)),
      schnitt: top((z) => (z.avgPlace && z.games >= 3 ? Math.round(z.avgPlace * 10) / 10 : null), 8, false),
      spiel: top(bestesSpiel),
      punkteProSpiel: top((z) => (z.games > 0 ? Math.round((z.points / z.games) * 10) / 10 : null)),
    };
  }, [zeilen]);

  if (fehler) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;
  if (!zeilen) return <LadeSchirm />;
  if (!listen || !(listen.elims.length || listen.siege.length || listen.schnitt.length)) {
    return <p className="text-sm text-slate-500"><T>Zu diesem Spieltag gibt es noch keine Zahlen.</T></p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Liste titel="Meiste Eliminierungen" zeilen={listen.elims} laender={laender} />
      <Liste titel="Meiste Siege" zeilen={listen.siege} laender={laender} />
      <Liste titel="Bester Schnittplatz" zeilen={listen.schnitt} laender={laender} />
      <Liste titel="Bestes einzelnes Spiel (Eliminierungen)" zeilen={listen.spiel} laender={laender} />
      <Liste titel="Punkte pro Spiel" zeilen={listen.punkteProSpiel} laender={laender} />
    </div>
  );
}
