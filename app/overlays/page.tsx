'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { Vorschau } from './Teile';
import VipVorhang from './VipVorhang';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Die Overlay-Seite: drei Arten zur Auswahl, jede mit Vorschau.
 *
 * Der Betreiber (1.10.2026): "man sieht einfach drei, auswaehlen zwischen
 * Team Banner, Leaderboard und Custom (das fuer Offspawns oder 1v1, 2v2
 * usw.)". Es soll nicht mehr nach Studio aussehen - kein Bildschirm als
 * Vorlage, sondern wieder jedes Overlay einzeln, mit Vorschau, so wie bei den
 * Globals.
 *
 * Die Vorschauen sind die echten Overlays, mit Beispielwerten: das
 * Leaderboard und der Banner zeigen den ersten Spieltag der Global
 * Championship (echte Namen, echte Plaetze), das freie Overlay einen
 * ausgedachten Stand, der als solcher klar erkennbar ist (TEAM 1, TEAM 2).
 * Nachgebaut ist nichts - was hier steht, ist das, was spaeter in OBS laeuft.
 */

const TAG1 = GLOBALS_TAGE[0].windowId;

const LEADERBOARD_PROBE = {
  event: GLOBALS_EVENT, window: TAG1, fenster: [] as string[],
  titel: 'LEADERBOARD', kopfrechts: 'POINTS',
  thema: '', ecken: 10, marke: 0,
  von: 1, bis: 5, takt: 15,
  grund: '0 0 0', deckkraft: 0.72, akzent: '#f5c542',
  schrift: 16, breite: 420, bilder: false, gold: 1,
  pausiert: 0, sichtbar: 15, seitenBis: 0, seitenTakt: 8,
};

const CUSTOM_PROBE = {
  kopf: 'OFFSPAWN', kopfZeigen: true,
  name1: 'TEAM 1', name2: 'TEAM 2', punkte1: 2, punkte2: 1,
  farbe1: '#ffffff', farbe2: '#ffffff',
  breite: 0, massstab: 1, bilder1: [] as string[], bilder2: [] as string[], bild1: '', bild2: '',
  grund: '0 0 0', deckkraft: 0.72, schrift: 30,
  thema: '', ecken: 12,
};

function arten(duo: string): Array<{
  pfad: string; titel: string; was: string; vorschau: string; hoehe: number;
}> {
  return [
    {
      pfad: '/overlays/teamkarte',
      titel: 'Team Banner',
      was: 'Zwei Spieler nebeneinander, mit Foto und ihren Werten — Foto selbst wählbar',
      vorschau: `/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}`
        + `&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190`
        + (duo ? `&id=${encodeURIComponent(duo)}` : ''),
      hoehe: 240,
    },
    {
      pfad: '/overlays/standings',
      titel: 'Leaderboard',
      was: 'Die vordersten Plätze eines Cups — live, mit Seitenwechsel',
      vorschau: `/overlay/standings.html?vorschau=${encodeURIComponent(JSON.stringify(LEADERBOARD_PROBE))}`,
      hoehe: 300,
    },
    {
      pfad: '/overlays/offspawn',
      titel: 'Custom',
      was: 'Offspawns, 1v1, 2v2 und alles andere — Stand von Hand, Titel frei',
      vorschau: `/overlay/offspawn.html?vorschau=${encodeURIComponent(JSON.stringify(CUSTOM_PROBE))}`,
      hoehe: 220,
    },
  ];
}

export default function OverlaysSeite() {
  const zugang = useZugang();

  /*
   * Ein echtes Duo fuer die Vorschau des Banners.
   *
   * Ohne Spieler steht dort "nicht eingestellt" - richtig, wenn niemand
   * gewaehlt ist, aber als Vorschau nutzlos. Genommen wird das erste Team des
   * Feldes der Global Championship: echte Namen, echte Fotos.
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

  if (zugang.laedt) return <LadeSchirm />;
  // Ohne VIP: der Vorhang mit dem Weg zum Zugang.
  if (!zugang.vip) return <VipVorhang />;

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-8 text-slate-200">
      <div className="mx-auto max-w-[1300px]">
        <h1 className="text-2xl font-semibold text-slate-100"><T>Overlays</T></h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
          <T>Such dir die Art aus, die du brauchst. Die Adresse in OBS bleibt immer dieselbe — was du einstellst, ist im Stream nach wenigen Sekunden zu sehen.</T>
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {arten(duo).map((o) => (
            <section key={o.pfad}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <Vorschau src={o.vorschau} hoehe={o.hoehe} klebt={false} />
              <h2 className="text-lg font-semibold text-slate-100"><T>{o.titel}</T></h2>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500"><T>{o.was}</T></p>
              <Link href={o.pfad}
                className="mt-4 inline-block self-start rounded-lg border border-sky-500/40
                           bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-400
                           transition hover:bg-sky-500/20">
                <T>Auswählen</T>
              </Link>
            </section>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-slate-600">
          <T>Die Vorschauen zeigen Beispielwerte.</T>
        </p>
        <Link href="/admin#archiv"
          className="mt-4 inline-block rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-sm
                     text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
          <T>Deine gespeicherten Overlays: Dashboard → Mein Archiv</T>
        </Link>
      </div>
    </main>
  );
}
