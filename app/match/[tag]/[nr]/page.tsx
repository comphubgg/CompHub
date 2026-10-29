'use client';

/*
 * Ein einzelnes Game aus den Matches eines Cups - fuer freigeschaltete VIPs (Betreiber, 29.10.2026: "die VIPs, wo ich Access dazu gebe, sollen die
 * Replays ... angucken gehen koennen als 2D ... die Zonen, wie sie gepullt sind ... nicht die Ansicht, wo alle anderen Replays sind, sondern nur fuer die
 * Runde, wo man drauf drueckt ... wenn man zurueckkommt, wieder zu der Leaderboard-Seite").
 *
 *   /match/<Fenster-Kennung>/<Game-Nummer>?zurueck=<Adresse der Cup-Seite>
 *
 * Dieselbe Ansicht wie /replays/<Fenster>/<Game> (2D/3D, Zone mit Zeitleiste, Kill-Feed, Teams, Spieler), aber ohne den Weg zu anderen Cups oder
 * Games: zurueck geht es nur zur Bestenliste, von der man kam. Die Replay-Section selbst kann dabei gesperrt bleiben.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from '@/app/overlays/VipVorhang';
import { useZugang } from '@/app/lib/zugang';
import { fortniteKarte } from '@/lib/bildAdressen';
import { replayDatum, replayUhrzeit, ohneMarke, schoenerTitel } from '@/lib/replayNamen';
import ReplayAnsicht, { type RMatch, type RWertung } from '@/app/replays/ReplayAnsicht';

interface Game { id: string; nr: number; beginn?: string; sieger?: string[] }
interface Tag { windowId: string; titel: string; region: string; season: string; matches: Game[] }

export default function MatchSeite() {
  const params = useParams<{ tag: string; nr: string }>();
  const tagId = decodeURIComponent(String(params?.tag ?? ''));
  const nr = Number(params?.nr);
  const zugang = useZugang();
  const darf = zugang.admin || (zugang.vip && zugang.rechte.includes('replays'));
  const [tag, setTag] = useState<Tag | null>(null);
  const [match, setMatch] = useState<(RMatch & { karte?: string; wertung?: RWertung | null }) | null>(null);
  const [fehler, setFehler] = useState('');
  // Zurueck nur auf eine Seite dieses Werkzeugs (die Cup-Seite, von der man kam).
  const [zurueck, setZurueck] = useState('/events');
  useEffect(() => {
    try {
      const z = new URLSearchParams(window.location.search).get('zurueck') ?? '';
      if (z.startsWith('/') && !z.startsWith('//')) setZurueck(z);
    } catch { /* ohne Adresse zu den Events */ }
  }, []);

  useEffect(() => {
    if (!darf || !tagId || !Number.isInteger(nr)) return undefined;
    let weg = false;
    setTag(null); setMatch(null); setFehler('');
    (async () => {
      try {
        const r = await fetch(`/api/replay?tag=${encodeURIComponent(tagId)}`);
        const j = await r.json().catch(() => null);
        if (weg) return;
        if (!r.ok || !j?.tag) { setFehler(j?.error ?? 'Die Replays ließen sich gerade nicht laden.'); return; }
        setTag(j.tag);
        const game = (j.tag as Tag).matches.find((m) => m.nr === nr);
        if (!game) { setFehler('Dieses Game gibt es nicht.'); return; }
        // Ein Fehler der Ablage ist meist ein Augenblick: still bis zu viermal nachfragen, bevor die Seite einen Fehler zeigt.
        let rm: Response | null = null;
        let mj: (RMatch & { karte?: string; wertung?: RWertung | null; error?: string }) | null = null;
        for (let versuch = 0; versuch < 4; versuch += 1) {
          if (versuch) await new Promise((res) => setTimeout(res, 1500 * versuch));
          if (weg) return;
          rm = await fetch(`/api/replay?match=${encodeURIComponent(game.id)}&v=2`).catch(() => null);
          mj = rm ? await rm.json().catch(() => null) : null;
          if (rm?.ok && mj) break;
          if (rm?.status === 404) break;
        }
        if (weg) return;
        if (!rm?.ok || !mj) { setFehler(mj?.error ?? 'Die Auswertung ist gerade nicht lesbar.'); return; }
        setMatch(mj);
      } catch { if (!weg) setFehler('Die Replays ließen sich gerade nicht laden.'); }
    })();
    return () => { weg = true; };
  }, [darf, tagId, nr]);

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf && zugang.vip) {
    return <VipVorhang titel="Die Replay-Ansicht ist für dein Konto noch nicht freigeschaltet." text="CompHub schaltet sie je VIP frei - schreib uns kurz auf Discord." />;
  }
  if (!darf) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500"><T>Jedes Game eines Cups in 2D und 3D: die Zonen, wie sie gezogen sind, der Kill-Feed und alle Teams.</T></p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Zur Anmeldung</T></Link>
        </div>
      </main>
    );
  }

  const game = tag?.matches.find((m) => m.nr === nr) ?? null;
  // Die grosse Insel hat ein Kartenbild; die kleinen Reload-Inseln ("Athena_Empty") nicht - dort gilt ein Raster nach den Daten.
  const kartenBild = match && /^Athena_Empty/i.test(match.karte ?? '') ? null : fortniteKarte(false);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6">
        <Link href={zurueck}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400">
          ← <T>Zurück zur Bestenliste</T>
        </Link>

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!fehler && (!tag || !match) && <div className="mt-6"><LadeSchirm /></div>}

        {tag && match && game && (
          <>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{schoenerTitel(tag.titel)} · Game {game.nr}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{tag.region}</span>
              <span>{tag.season}</span>
              <span>{replayDatum(game.beginn)} {replayUhrzeit(game.beginn)}</span>
              {(game.sieger ?? []).length > 0 && <span className="text-amber-300">🏆 {(game.sieger ?? []).map(ohneMarke).join(' · ')}</span>}
            </p>
            <div className="mt-5">
              <ReplayAnsicht match={match} kartenBild={kartenBild} titel={`Game ${game.nr}`} wertung={match.wertung} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
