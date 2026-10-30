'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { Karte } from '@/app/globals-solos/Bausteine';
import { sichtbarerTakt } from '@/app/lib/takt';
import { eigeneKarte, fortniteKarte } from '@/lib/bildAdressen';
import { kartenName } from '@/app/lib/kartenStil';
import type { SolosFenster } from '@/lib/globalsSolos';

/*
 * Die Turnierkarte gleich auf der Event-Seite (Betreiber, 26.10.2026: "dass man auf die Map so extra klicken muss, gefaellt mir nicht").
 *
 * Gezeichnet wird sie von demselben Baustein wie auf den Karten-Seiten (Zoom, Vollbild, Spielersuche); die Formen und Teams sind die, die der Betreiber im
 * Karten-Werkzeug gespeichert hat. Hier wird nur gelesen - nichts verteilt, nichts gespeichert. Eine Karte, auf der noch kein Team steht, zeigt stattdessen den
 * bisherigen Knopf (`leer`), damit der Weg zur Seite nicht verschwindet.
 */

interface Eintrag { id: string; titel: string; spiele?: string; bildTitel?: string }
interface Stand {
  geaendert: number; bildId?: string;
  spots?: Array<{ id: string; punkte: Array<{ x: number; y: number }>; teams: string[] }>;
  teams?: Array<{ id: string; spieler: string[] }>;
}

export default function KarteImEvent({ karten, leer, alsReiter }: { karten: Eintrag[]; leer: ReactNode; zusatz?: ReactNode; alsReiter?: boolean }) {
  const t = useT();
  const [wahl, setWahl] = useState(0);
  /** Zugeklappt, bis man es oeffnet (Betreiber, 26.10.2026: "nicht sofort anzeigen, sondern nur wenn man es aufklappt"). */
  // Als Reiter der Event-Seite (27.10.2026) steht die Karte gleich offen.
  const [offen, setOffen] = useState(Boolean(alsReiter));
  const aktuell = karten[Math.min(wahl, karten.length - 1)];
  // Eine Karte nach der anderen im Speicher halten, damit ein Wechsel zwischen den Inseln sofort steht.
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [geladen, setGeladen] = useState<Record<string, boolean>>({});
  const stand = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!aktuell) return undefined;
    let weg = false;
    const id = aktuell.id;
    const holen = () => {
      const seit = stand.current[id] ?? 0;
      fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}&nur=stand${seit ? `&seit=${seit}` : ''}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: (Stand & { unveraendert?: boolean }) | null) => {
          if (weg) return;
          setGeladen((alt) => (alt[id] ? alt : { ...alt, [id]: true }));
          if (!j || j.unveraendert) return;
          stand.current[id] = j.geaendert;
          setStaende((alt) => ({ ...alt, [id]: j }));
        })
        .catch(() => { if (!weg) setGeladen((alt) => (alt[id] ? alt : { ...alt, [id]: true })); });
    };
    holen();
    const stopp = sichtbarerTakt(holen, 30_000);
    return () => { weg = true; stopp(); };
  }, [aktuell]);

  const s = aktuell ? staende[aktuell.id] : undefined;
  const fenster = useMemo<SolosFenster | null>(() => {
    if (!aktuell || !s?.spots) return null;
    const team = new Map((s.teams ?? []).map((x) => [x.id, x]));
    const formen = s.spots
      .filter((sp) => (sp.punkte?.length ?? 0) >= 3)
      .map((sp) => {
        const gruppen = (sp.teams ?? []).map((id) => team.get(id)?.spieler ?? []).filter((g) => g.length);
        return { punkte: sp.punkte, spieler: gruppen.flat(), teams: gruppen.length, gruppen };
      })
      // Nur, wo jemand landet - leere Formen sagen auf der Seite niemandem etwas.
      .filter((fo) => fo.teams > 0);
    return { windowId: aktuell.id, name: aktuell.titel, art: 'finale', start: null, end: null, spieler: [], formen };
  }, [aktuell, s]);

  if (!aktuell) return <>{leer}</>;
  // Solange die erste Antwort aussteht, steht schon der Knopf da - die Seite springt nicht, wenn die Karte kommt.
  if (!geladen[aktuell.id] && !s) return <>{leer}</>;
  if (!fenster || !fenster.formen.length) return <>{leer}</>;

  const bild = s?.bildId ? eigeneKarte(s.bildId) : fortniteKarte(false);
  const name = aktuell.titel.split('·')[0].trim() || aktuell.bildTitel || t('Karte');
  return (
    <section className="mb-5 max-w-[1180px]">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <T>Karte</T> · <span className="normal-case tracking-normal text-slate-300">{name}{aktuell.spiele ? ` · ${t('Spiele')} ${aktuell.spiele}` : ''}</span>
        </h2>
        <div className="flex items-center gap-3">
          {offen && (
            <Link href={`/maps?id=${encodeURIComponent(aktuell.id)}`} prefetch={false}
              className="text-[11px] font-semibold text-slate-400 transition hover:text-sky-400">
              <T>Eigene Seite öffnen</T> →
            </Link>
          )}
          {!alsReiter && <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
            {offen ? <T>Ausblenden</T> : <T>Anzeigen</T>}
            <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${offen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
          </button>}
        </div>
      </div>
      {offen && karten.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {karten.map((k, i) => (
            <button key={k.id} type="button" onClick={() => setWahl(i)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${aktuell.id === k.id
                ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-slate-400 hover:border-zinc-500 hover:text-slate-200'}`}>
              {k.bildTitel || k.titel.split('·')[0].trim() || `${t('Karte')} ${i + 1}`}{k.spiele ? ` · ${k.spiele}` : ''}
            </button>
          ))}
        </div>
      )}
      {/*
        * Nur die Karte und die Spielerliste daneben (Betreiber, 30.10.2026: unter Events -> Cup -> Map keine Karten-Kachel, "einfach nur die Map und die
        * Spielerliste links/rechts"). Die Kachel zum Bearbeiten (zusatz) steht deshalb hier nicht mehr - bearbeitet wird ueber "Eigene Seite oeffnen".
        */}
      {offen && (
        <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <Karte f={fenster} bild={bild} rotAb={2} />
          </div>
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 lg:max-h-[80vh] lg:overflow-y-auto">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Spieler</T> · {fenster.formen.reduce((a, fo) => a + fo.spieler.length, 0)}</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold text-slate-200 lg:grid-cols-1">
              {fenster.formen.flatMap((fo) => fo.gruppen ?? fo.spieler.map((n) => [n]))
                .map((g) => g.map(kartenName).join(' · '))
                .sort((a, b) => a.localeCompare(b))
                .map((zeile, i) => <li key={`${zeile}-${i}`} className="truncate">{zeile}</li>)}
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
}
