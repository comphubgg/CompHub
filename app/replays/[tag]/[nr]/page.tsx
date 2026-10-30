'use client';

/*
 * Ein Game zum Abspielen: /replays/<Fenster-Kennung>/<Game-Nummer>. Beides bleibt dauerhaft gleich - die Nummer ist die Reihenfolge des
 * Beginns innerhalb des Spieltags.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { saisonKarte } from '@/lib/bildAdressen';
import { replayDatum, replayUhrzeit, tagName, ohneMarke, schoenerTitel } from '@/lib/replayNamen';
import ReplayAnsicht, { type RMatch, type RWertung } from '../../ReplayAnsicht';

interface Game { id: string; nr: number; beginn?: string; sieger?: string[] }
interface Tag { windowId: string; titel: string; region: string; season: string; matches: Game[] }
interface Geschwister { windowId: string; matches: number }

export default function GameSeite() {
  const params = useParams<{ tag: string; nr: string }>();
  const tagId = decodeURIComponent(String(params?.tag ?? ''));
  const nr = Number(params?.nr);
  const [tag, setTag] = useState<Tag | null>(null);
  const [geschwister, setGeschwister] = useState<Geschwister[]>([]);
  const [match, setMatch] = useState<(RMatch & { karte?: string; wertung?: RWertung | null }) | null>(null);
  const [fehler, setFehler] = useState('');
  /** Aus "Meine Cups": das Epic-Konto, dessen Team in dieser Ansicht von Anfang an markiert ist (?spieler=...). */
  const [hervorheben, setHervorheben] = useState('');
  useEffect(() => {
    try { setHervorheben((new URLSearchParams(window.location.search).get('spieler') ?? '').toLowerCase()); } catch { /* ohne Adresse keine Markierung */ }
  }, [tagId, nr]);

  useEffect(() => {
    if (!tagId || !Number.isInteger(nr)) return undefined;
    let weg = false;
    setTag(null); setMatch(null); setFehler('');
    (async () => {
      try {
        const r = await fetch(`/api/replay?tag=${encodeURIComponent(tagId)}`);
        const j = await r.json().catch(() => null);
        if (weg) return;
        if (!r.ok || !j?.tag) { setFehler(j?.error ?? 'Die Replays ließen sich gerade nicht laden.'); return; }
        setTag(j.tag); setGeschwister(j.geschwister ?? []);
        const game = (j.tag as Tag).matches.find((m) => m.nr === nr);
        if (!game) { setFehler('Dieses Game gibt es nicht.'); return; }
        // Ein Fehler der Ablage ist meist ein Augenblick: still bis zu viermal nachfragen, bevor die Seite einen Fehler zeigt.
        let rm: Response | null = null;
        let mj: (RMatch & { karte?: string; wertung?: RWertung | null; error?: string }) | null = null;
        for (let versuch = 0; versuch < 4; versuch += 1) {
          if (versuch) await new Promise((res) => setTimeout(res, 1500 * versuch));
          if (weg) return;
          rm = await fetch(`/api/replay?match=${encodeURIComponent(game.id)}&v=3`).catch(() => null);
          mj = rm ? await rm.json().catch(() => null) : null;
          if (rm?.ok && mj) break;
          if (rm?.status === 404) break; // ein nicht ausgewertetes Match ist auch beim vierten Mal nicht da
        }
        if (weg) return;
        if (!rm?.ok || !mj) { setFehler(mj?.error ?? 'Die Auswertung ist gerade nicht lesbar.'); return; }
        setMatch(mj);
      } catch { if (!weg) setFehler('Die Replays ließen sich gerade nicht laden.'); }
    })();
    return () => { weg = true; };
  }, [tagId, nr]);

  const game = tag?.matches.find((m) => m.nr === nr) ?? null;
  const tagNr = tag ? Math.max(0, geschwister.findIndex((g) => g.windowId === tag.windowId)) : 0;
  const href = (n: number) => `/replays/${encodeURIComponent(tagId)}/${n}`;
  // Die grosse Insel hat ein Kartenbild; die kleinen Reload-Inseln ("Athena_Empty") nicht - dort gilt ein Raster nach den Daten.
  const kartenBild = match && /^Athena_Empty/i.test(match.karte ?? '') ? null : saisonKarte(tagId);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/replays/${encodeURIComponent(tagId)}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">
            ← {tag ? schoenerTitel(tag.titel) : <T>Spieltag</T>}
          </Link>
          {tag && (
            <div className="ml-auto flex items-center gap-1.5">
              {nr > 1 && <Link href={href(nr - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">← Game {nr - 1}</Link>}
              {nr < tag.matches.length && <Link href={href(nr + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">Game {nr + 1} →</Link>}
            </div>
          )}
        </div>

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!fehler && (!tag || !match) && <div className="mt-6"><LadeSchirm /></div>}

        {tag && match && game && (
          <>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{schoenerTitel(tag.titel)} · Game {game.nr}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{tag.region}</span>
              {geschwister.length > 1 && <span>{tagName(tag.windowId, tagNr)}</span>}
              <span>{tag.season}</span>
              <span>{replayDatum(game.beginn)} {replayUhrzeit(game.beginn)}</span>
              {(game.sieger ?? []).length > 0 && <span className="text-amber-300">🏆 {(game.sieger ?? []).map(ohneMarke).join(' · ')}</span>}
            </p>
            <div className="mt-5">
              <ReplayAnsicht match={match} kartenBild={kartenBild} titel={`Game ${game.nr}`} wertung={match.wertung} hervorheben={hervorheben || undefined} />
            </div>
            <p className="mt-8 text-[11px] text-slate-600"><T>Diese Adresse bleibt dauerhaft gleich.</T> <code className="text-slate-500">/replays/{tag.windowId}/{game.nr}</code></p>
          </>
        )}
      </div>
    </main>
  );
}
