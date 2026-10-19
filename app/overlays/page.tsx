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
 * Die Overlay-Seite: eine Werkbank statt einer Kartenreihe.
 *
 * Der Betreiber (19.10.2026): die Uebersicht "sieht immer noch eins zu eins
 * aus wie die Hauptseite" - sie soll komplett anders werden. Vorher standen
 * hier drei gleiche, abgerundete Karten nebeneinander, so wie auf jeder
 * anderen Seite. Jetzt links eine schmale Schiene mit allen Arten, rechts
 * ein grosser Monitor mit dem echten Overlay (Beispielwerte) und dem, was man
 * daran einstellt; darunter die drei Handgriffe in OBS.
 *
 * Die Vorschauen sind die echten Overlays: der Banner, das Leaderboard, der
 * Timer und die Qual line zeigen die Global Championship (echte Namen, echte
 * Plaetze), das freie Overlay einen ausgedachten Stand, der als solcher
 * erkennbar ist (TEAM 1, TEAM 2). Nachgebaut ist nichts.
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

// Ein Beispiel-Start in gut zwei Stunden - einmal beim Laden festgelegt, damit die Vorschau nicht bei jedem Zeichnen neu laedt.
const BEISPIEL_START = Date.now() + 2 * 3_600_000 + 14 * 60_000;

const TIMER_PROBE = {
  event: GLOBALS_EVENT, window: TAG1, beginn: BEISPIEL_START, cup: 'FNCS Global Championship',
  wort: 'STARTS IN', cupZeigen: true, grund: '0 0 0', deckkraft: 0.72,
  akzent: '#38bdf8', schrift: 34, abStunden: 12, anordnung: 'zwei', immer: true,
};

const QUAL_PROBE = {
  event: GLOBALS_EVENT, window: TAG1, schwelle: 50, wort: 'QUAL ~', takt: 15,
  grund: '0 0 0', deckkraft: 0.72, akzent: '#38bdf8', schrift: 18,
  pausiert: 0, sichtbar: 15, anordnung: 'zwei',
};

interface Art {
  pfad: string; kuerzel: string; titel: string; was: string;
  /** Was man daran einstellt - kurze Stichpunkte. */
  einstellen: string[];
  vorschau: string; hoehe: number;
}

function arten(duo: string): Art[] {
  const json = (o: unknown) => encodeURIComponent(JSON.stringify(o));
  return [
    {
      pfad: '/overlays/teamkarte', kuerzel: 'TB', titel: 'Team Banner',
      was: 'Spieler, Duo oder Trio mit Foto und den Werten ihres Teams — als Karte oder als schräge Leiste.',
      einstellen: ['Cup und Spieltag', 'Solo, Duo oder Trio', 'Karte oder Leiste', 'Farben und Deckkraft'],
      vorschau: `/overlay/banner.html?event=${encodeURIComponent(GLOBALS_EVENT)}`
        + `&window=${encodeURIComponent(TAG1)}&klar=70&hoehe=190`
        + (duo ? `&id=${encodeURIComponent(duo)}` : ''),
      hoehe: 240,
    },
    {
      pfad: '/overlays/standings', kuerzel: 'LB', titel: 'Leaderboard',
      was: 'Die vordersten Plätze eines laufenden Cups — live, mit Seitenwechsel.',
      einstellen: ['Welche Plätze', 'Seitenwechsel', 'Aussehen je Turnierreihe', 'Fotos und Marke'],
      vorschau: `/overlay/standings.html?vorschau=${json(LEADERBOARD_PROBE)}`,
      hoehe: 300,
    },
    {
      pfad: '/overlays/timer', kuerzel: 'TM', titel: 'Cup timer',
      was: 'Ein Countdown bis zum Start des Spieltags — mit dem Namen des Cups.',
      einstellen: ['Cup', 'Eine Zeile oder zwei', 'Text davor', 'Farbe und Schrift'],
      vorschau: `/overlay/timer.html?vorschau=${json(TIMER_PROBE)}`,
      hoehe: 180,
    },
    {
      pfad: '/overlays/qual', kuerzel: 'QL', titel: 'Qual line',
      was: 'Wie viele Punkte es zum Weiterkommen braucht — geschätzt aus früheren Ausgaben, daneben der Stand von jetzt.',
      einstellen: ['Cup', 'Platz der Linie', 'Aktualisierung', 'Farbe und Schrift'],
      vorschau: `/overlay/qual.html?vorschau=${json(QUAL_PROBE)}`,
      hoehe: 180,
    },
    {
      pfad: '/overlays/offspawn', kuerzel: 'CU', titel: 'Custom',
      was: 'Offspawns, 1v1, 2v2 und alles andere — Stand von Hand, Titel frei.',
      einstellen: ['Namen und Stand', 'Titel', 'Bilder', 'Vorlage'],
      vorschau: `/overlay/offspawn.html?vorschau=${json(CUSTOM_PROBE)}`,
      hoehe: 220,
    },
  ];
}

const SCHRITTE = [
  { titel: 'Anlegen', text: 'Art wählen, Cup wählen, Aussehen einstellen und speichern.' },
  { titel: 'Adresse kopieren', text: 'Du bekommst eine Adresse. Sie bleibt immer dieselbe, auch wenn du später etwas änderst.' },
  { titel: 'In OBS einfügen', text: 'Quelle „Browser“ hinzufügen und die Adresse eintragen. Mehr musst du nie anfassen.' },
];

export default function OverlaysSeite() {
  const zugang = useZugang();
  const [nr, setNr] = useState(0);

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

  const liste = arten(duo);
  const art = liste[nr];

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-8 text-slate-200">
      <div className="mx-auto max-w-[1300px]">

        {/* Kopf: eine schmale Zeile mit Linie darunter - keine Flaeche wie auf den anderen Seiten. */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sky-500">
              <T>OBS · Browser-Quelle</T>
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white"><T>Overlays</T></h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-500">
            <T>Such dir die Art aus. Die Adresse in OBS bleibt immer dieselbe — was du einstellst, ist im Stream nach wenigen Sekunden zu sehen.</T>
          </p>
        </div>

        {/* Die Werkbank: links die Schiene, rechts der Monitor. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-0 lg:overflow-visible lg:border-l lg:border-zinc-800">
            {liste.map((a, i) => (
              <li key={a.pfad} className="shrink-0 lg:shrink">
                <button type="button" onClick={() => setNr(i)} aria-pressed={i === nr}
                  className={`group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition lg:-ml-px lg:rounded-none lg:rounded-r-lg lg:border-l-2 ${
                    i === nr
                      ? 'bg-zinc-900 text-white lg:border-sky-500'
                      : 'text-slate-400 hover:bg-zinc-900/60 hover:text-slate-200 lg:border-transparent'}`}>
                  <span className={`font-mono text-[11px] font-bold tracking-widest ${
                    i === nr ? 'text-sky-400' : 'text-slate-600 group-hover:text-slate-400'}`}>
                    {a.kuerzel}
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold"><T>{a.titel}</T></span>
                </button>
              </li>
            ))}
          </ul>

          <section aria-live="polite">
            {/* Der Monitor. */}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  {art.kuerzel} · <T>{art.titel}</T>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                  <T>Beispielwerte</T>
                </span>
              </div>
              <div className="p-4">
                <Vorschau key={art.pfad} src={art.vorschau} hoehe={art.hoehe} klebt={false} />
              </div>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <h2 className="text-xl font-extrabold text-white"><T>{art.titel}</T></h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400"><T>{art.was}</T></p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {art.einstellen.map((e) => (
                    <li key={e} className="rounded-md border border-zinc-800 px-2.5 py-1 text-[11px] text-slate-400">
                      <T>{e}</T>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`${art.pfad}?neu=1`}
                  className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400">
                  <T>Neues Overlay</T>
                </Link>
                <Link href={art.pfad}
                  className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                  <T>Meine Overlays</T>
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* In OBS: die drei Handgriffe - eine Reihe, durch Linien getrennt. */}
        <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3">
          {SCHRITTE.map((s, i) => (
            <li key={s.titel} className="bg-zinc-950 p-5">
              <span className="font-mono text-[11px] font-bold tracking-widest text-sky-500">0{i + 1}</span>
              <p className="mt-1 text-sm font-bold text-slate-100"><T>{s.titel}</T></p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500"><T>{s.text}</T></p>
            </li>
          ))}
        </ol>

        <Link href="/admin#archiv"
          className="mt-6 inline-block text-xs text-slate-500 underline-offset-4 transition hover:text-sky-400 hover:underline">
          <T>Deine gespeicherten Overlays: Dashboard → Mein Archiv</T>
        </Link>
      </div>
    </main>
  );
}
