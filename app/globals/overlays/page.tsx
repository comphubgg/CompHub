'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import GlobalsGeruest from '../GlobalsGeruest';
import { Vorschau } from '@/app/overlays/Teile';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Die drei Overlays der Global Championship.
 *
 * Jedes an eigener Adresse, so wie der Betreiber es wollte:
 * /globals/overlays/standings, /globals/overlays/teamkarte,
 * /globals/overlays/custom. Und jedes hier schon als Vorschau - "man muss
 * auch eine Preview-Anzeige haben, um zu sehen, wie es aussehen wuerde",
 * und zwar bevor man hineingeht.
 *
 * Die Vorschauen zeigen das echte Overlay mit den Werten, mit denen der
 * Baukasten anfaengt - kein nachgebautes Bild, das mit der Zeit abweicht.
 */

const TAG1 = GLOBALS_TAGE[0].windowId;

/** Wie ein frisch angelegtes Leaderboard aussieht - siehe Baukasten. */
const STANDINGS_PROBE = {
  event: GLOBALS_EVENT, window: TAG1, fenster: [] as string[],
  titel: 'GLOBAL CHAMPIONSHIP', kopfrechts: 'POINTS',
  thema: 'globals', ecken: 10, marke: 1,
  von: 1, bis: 5, takt: 15,
  grund: '0 0 0', deckkraft: 0.72, akzent: '#f5c542',
  schrift: 16, breite: 420, bilder: false, gold: 1,
  pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8,
};

const CUSTOM_PROBE = {
  kopf: 'GLOBAL CHAMPIONSHIP', kopfZeigen: true,
  name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 0, punkte2: 0,
  farbe1: '#f5c542', farbe2: '#f5c542',
  breite: 0, massstab: 1, bild1: '', bild2: '',
  grund: '0 0 0', deckkraft: 0.72, schrift: 30,
  thema: 'globals', ecken: 12,
};

/**
 * Die Vorschauen - der Banner bekommt ein echtes Duo mitgegeben.
 *
 * Ohne Spieler stand dort "NOT SET UP". Das ist richtig, wenn niemand
 * gewaehlt ist, taugt aber nicht als Vorschau: man soll sehen, wie es
 * aussieht. Genommen wird das erste Team des Feldes - echte Namen, echte
 * Fotos, nichts ausgedacht.
 */
function overlays(duo: string): Array<{
  pfad: string; titel: string; was: string; vorschau: string; hoehe: number;
}> { return [
  {
    pfad: '/globals/overlays/standings',
    titel: 'Leaderboard',
    was: 'Die vordersten Plätze — ein Spieltag oder der Gesamtstand über beide',
    vorschau: `/overlay/standings.html?vorschau=${encodeURIComponent(JSON.stringify(STANDINGS_PROBE))}`,
    hoehe: 300,
  },
  {
    pfad: '/globals/overlays/teamkarte',
    titel: 'Spieler-Banner',
    was: 'Zwei Spieler mit Foto und ihren Werten — Foto selbst wählbar',
    vorschau: `/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}`
      + `&window=${encodeURIComponent(TAG1)}&vorlage=globals&klar=70&hoehe=190`
      + (duo ? `&id=${encodeURIComponent(duo)}` : ''),
    hoehe: 240,
  },
  {
    pfad: '/globals/overlays/custom',
    titel: 'Freies Overlay',
    was: '1v1s, 2v2s und alles andere — Stand von Hand, Titel frei',
    vorschau: `/overlay/offspawn.html?vorschau=${encodeURIComponent(JSON.stringify(CUSTOM_PROBE))}`,
    hoehe: 220,
  },
]; }

export default function GlobalsOverlays() {
  /*
   * Ein echtes Duo aus dem Feld - fuer die Vorschau des Banners.
   *
   * Steht das Feld noch nicht, bleibt es leer, und die Vorschau sagt wie
   * bisher, dass noch nichts eingestellt ist.
   */
  const [duo, setDuo] = useState('');
  useEffect(() => {
    let weg = false;
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(TAG1)}`)
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const erste = (j?.teams ?? [])[0];
        const ids = (erste?.spieler ?? [])
          .map((s: { turnierId: string }) => s.turnierId).filter(Boolean);
        if (ids.length) setDuo(ids.join(','));
      })
      .catch(() => { /* dann eben ohne Duo */ });
    return () => { weg = true; };
  }, []);

  return (
    <GlobalsGeruest aktiv="/globals/overlays">
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-400">
        <T>Drei Einblendungen, alle im Aussehen der Global Championship. Einen
        Cup gibt es hier nicht auszuwählen — nur die beiden Spieltage des
        Turniers.</T>
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {overlays(duo).map((o) => (
          <section key={o.pfad}
            className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-3">
            <Vorschau src={o.vorschau} hoehe={o.hoehe} klebt={false} />
            <h2 className="text-base font-semibold text-amber-200">
              <T>{o.titel}</T>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <T>{o.was}</T>
            </p>
            <Link href={o.pfad}
              className="mt-3 inline-block rounded-lg border border-amber-500/40
                         bg-amber-400/10 px-4 py-2 text-sm font-semibold
                         text-amber-200 transition hover:bg-amber-400/20">
              <T>Einstellen</T>
            </Link>
          </section>
        ))}
      </div>
    </GlobalsGeruest>
  );
}
