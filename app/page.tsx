'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import VipSlider from '@/app/components/VipSlider';

// Die Startseite.
//
// Bis hierher lag an dieser Stelle das Multiview-Dashboard - das Werkzeug
// selbst, ohne ein Wort darueber, was es ist. Wer zum ersten Mal herkam, sah
// eine leere Streamwand und musste raten. Das Dashboard liegt jetzt unter
// /streams; hier steht, worum es geht.
//
// Die Zahlen im Kopf sind echt und werden geholt, nicht geschrieben: sie
// kommen aus demselben Archiv, das auch die Statistikseite fuellt. Eine
// erfundene Zahl auf der Startseite waere die erste Luege, die ein Besucher
// liest.

interface Stand {
  saisons: number;
  spieltage: number;
  regionen: number;
  konten: number | null;
  replays: number | null;
}

/**
 * Ein Abschnitt, der beim Hereinscrollen erscheint.
 *
 * Kein Selbstzweck: die Seite ist lang, und ohne diesen Anhalt liest sie
 * sich wie eine einzige Wand. Wer das nicht mag, sieht sie trotzdem - die
 * Voreinstellung ist sichtbar, die Bewegung kommt nur dazu.
 */
function Abschnitt({ children, className = '' }: {
  children: React.ReactNode; className?: string;
}) {
  const [drin, setDrin] = useState(false);
  const [halter, setHalter] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!halter) return;
    // Kein Beobachter (sehr alte Browser, Textbrowser): dann sofort zeigen -
    // aber einen Mikrotask spaeter, damit der Effekt nicht noch im selben
    // Durchlauf Zustand setzt.
    if (typeof IntersectionObserver === 'undefined') {
      void Promise.resolve().then(() => setDrin(true));
      return;
    }
    const beobachter = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setDrin(true); beobachter.disconnect(); }
    }, { rootMargin: '-60px' });
    beobachter.observe(halter);
    return () => beobachter.disconnect();
  }, [halter]);

  return (
    <div ref={setHalter}
      className={`transition-all duration-700 ${drin
        ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

/** Die Bereiche des Werkzeugs - dieselben wie in der Kopfzeile. */
const BEREICHE = [
  {
    href: '/statistiken', titel: 'Statistiken',
    text: 'Jeder Spieler, jeder Spieltag, jede Kennzahl — Schaden, Material, '
      + 'Bauteile, Trefferquote. Mit Verlauf über alle Chapter.',
  },
  {
    href: '/events', titel: 'Turniere',
    text: 'Der komplette Kalender aller Regionen: was läuft, was kommt, was '
      + 'vorbei ist — mit Endstand und Qualifikation.',
  },
  {
    href: '/power-rankings', titel: 'Ranglisten',
    text: 'Epics weltweite Power Rankings, täglich erneuert, mit dem '
      + 'Unterschied zur Vorwoche.',
  },
  {
    href: '/tierlist', titel: 'Tierlist',
    text: 'Eigene Tierlists bauen und teilen — Spieler ziehen, Stufen benennen, '
      + 'als Bild speichern.',
  },
  {
    href: '/streams', titel: 'Streams',
    text: 'Mehrere Twitch-Streams nebeneinander, in eigenen Ordnern, mit '
      + 'Live-Anzeige und gemeinsamem Chat.',
  },
  {
    href: '/overlays', titel: 'Overlays',
    text: 'Einblendungen für den eigenen Stream — aus denselben Turnierdaten '
      + 'gespeist, ohne Abtippen.',
  },
];

export default function Startseite() {
  const [stand, setStand] = useState<Stand | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const [archiv, replays] = await Promise.all([
          fetch('/api/szene-stats').then((r) => r.json()).catch(() => null),
          fetch('/api/replays').then((r) => r.json()).catch(() => null),
        ]);
        setStand({
          saisons: archiv?.saisons?.length ?? 0,
          spieltage: archiv?.spieltage ?? 0,
          regionen: archiv?.regionen?.length ?? 0,
          konten: null,
          replays: (replays?.fenster ?? []).reduce(
            (n: number, f: { zaehler?: Record<string, number> }) =>
              n + (f.zaehler?.PARSED ?? 0), 0) || null,
        });
      } catch { /* dann bleiben die Zahlen aus */ }
    });
  }, []);

  const zahl = (n: number | null) => (n === null ? '—' : n.toLocaleString('de-DE'));

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      {/* ------------------------------------------------------- Der Kopf */}
      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:pt-32">
        {/* Ein ruhiger Schein hinter dem Logo statt einer Grafik: er traegt
            die Farbe der Seite, ohne von der Schrift abzulenken. */}
        <div aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[900px]
                     -translate-x-1/2 rounded-full bg-sky-500/[0.07] blur-[120px]" />

        <div className="relative mx-auto max-w-4xl text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo-frei.png" alt=""
            className="mx-auto mb-8 h-20 w-auto opacity-90 sm:h-24" />

          <h1 className="text-5xl font-black leading-[0.95] tracking-tight
                         sm:text-7xl">
            <span className="text-sky-500">COMP</span><span>HUB</span>
          </h1>

          {/* Hier stand "Jedes Turnier. Jeder Spieltag. Jeder Spieler." -
              das stimmt nicht. Das Archiv beginnt in Chapter 5, und zu
              einzelnen Cups hat die Quelle nie etwas veroeffentlicht. Eine
              Startseite, deren erster Satz uebertreibt, macht jede Zahl
              darunter angreifbar. */}
          <p className="mx-auto mt-7 max-w-2xl text-base text-slate-300 sm:text-lg">
            <T>Statistiken, Turniere und Streams an einem Ort.</T>
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            <T>Zehn Saisons, sieben Regionen — vom Chapter-5-Archiv bis zum
            Spieltag von gestern.</T>
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/statistiken"
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold
                         text-white transition hover:bg-sky-400">
              <T>Statistiken ansehen</T>
            </Link>
            <Link href="/streams"
              className="rounded-xl border border-zinc-800 px-6 py-3 text-sm
                         font-semibold text-slate-300 transition
                         hover:border-sky-500/60 hover:text-sky-400">
              <T>Streams öffnen</T>
            </Link>
          </div>
        </div>

        {/* --------------------------------------------------- Die Zahlen */}
        <div className="relative mx-auto mt-20 max-w-4xl">
          <div className="grid grid-cols-2 divide-zinc-800 rounded-2xl border
                          border-zinc-800 bg-zinc-900/30 sm:grid-cols-4
                          sm:divide-x">
            {([
              [zahl(stand?.spieltage ?? null), 'Spieltage im Archiv'],
              [zahl(stand?.saisons ?? null), 'Saisons erfasst'],
              [zahl(stand?.regionen ?? null), 'Regionen'],
              [zahl(stand?.replays ?? null), 'Matches ausgewertet'],
            ] as Array<[string, string]>).map(([wert, titel]) => (
              <div key={titel} className="px-6 py-8 text-center">
                <p className="text-3xl font-black tabular-nums text-sky-500
                              sm:text-4xl">{wert}</p>
                <p className="mt-2 text-[10px] font-semibold uppercase
                              tracking-[0.16em] text-slate-500">
                  <T>{titel}</T>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-700">
            <T>Live aus dem eigenen Archiv — keine geschätzten Zahlen.</T>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ Bereiche */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Abschnitt>
            <h2 className="mb-2 text-center text-3xl font-black tracking-tight
                           sm:text-4xl">
              <T>Was hier drin steckt</T>
            </h2>
            <p className="mb-12 text-center text-sm text-slate-500">
              <T>Sechs Bereiche, eine Datengrundlage.</T>
            </p>
          </Abschnitt>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BEREICHE.map((b, i) => (
              <Abschnitt key={b.href} className={`delay-[${(i % 3) * 80}ms]`}>
                <Link href={b.href}
                  className="group flex h-full flex-col rounded-2xl border
                             border-zinc-800 bg-zinc-900/30 p-6 transition
                             hover:border-sky-500/50 hover:bg-zinc-900/60">
                  <h3 className="text-lg font-bold text-slate-100
                                 group-hover:text-sky-400">
                    <T>{b.titel}</T>
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">
                    <T>{b.text}</T>
                  </p>
                  <span className="mt-4 text-xs font-semibold text-sky-500/80
                                   transition group-hover:text-sky-400">
                    <T>öffnen</T> →
                  </span>
                </Link>
              </Abschnitt>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- Woher die Daten */}
      <section className="border-y border-zinc-900 bg-zinc-900/20 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <Abschnitt>
            <h2 className="mb-8 text-center text-3xl font-black tracking-tight
                           sm:text-4xl">
              <T>Woher die Zahlen kommen</T>
            </h2>
            {/* Genannt wird nur, was ohne Absprache genannt werden kann:
                Epics eigene Schnittstellen. Eine zweite Quelle stand hier
                zwischenzeitlich mit Namen - die ist wieder heraus, solange
                mit ihr nichts vereinbart ist. Was sie beitraegt, steht
                weiterhin da, nur ohne sie zu benennen. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['Epic Games', 'Turnierkalender, Bestenlisten, Platzierungen und '
                  + 'Mitspieler — direkt aus der offiziellen Schnittstelle.'],
                ['Turnier-Replays', 'Eliminierungen, Knocks und Waffe je Match — '
                  + 'selbst ausgewertet, aus Epics eigenen Server-Replays.'],
              ] as Array<[string, string]>).map(([titel, text]) => (
                <div key={titel}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
                  <h3 className="text-sm font-bold text-sky-400"><T>{titel}</T></h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    <T>{text}</T>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-slate-600">
              <T>Fehlt eine Zahl bei der Quelle, bleibt sie hier leer — statt
              geschätzt zu werden.</T>
            </p>
          </Abschnitt>
        </div>
      </section>

      {/* ----------------------------------------------------- Anmeldung */}
      <section className="px-4 py-24">
        <Abschnitt className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            <T>Mit Konto mehr</T>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            <T>Ohne Anmeldung ist alles zu sehen. Angemeldet bleiben deine
            Streamwände, Ordner und Tierlists erhalten — auf jedem Gerät.</T>
          </p>
          {/* Beide Knoepfe fuehren zur Anmeldeseite - "Loslegen" fuehrte
              vorher auf die Streamwand, was ohne Konto nichts brachte, und
              der Twitch-Knopf direkt zu Twitch, wo mangels Zugangsdaten nur
              "invalid client" stand. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/anmelden"
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold
                         text-white transition hover:bg-sky-400">
              <T>Konto anlegen</T>
            </Link>
            <Link href="/anmelden"
              className="rounded-xl border border-zinc-800 px-6 py-3 text-sm
                         font-semibold text-slate-300 transition
                         hover:border-sky-500/60 hover:text-sky-400">
              <T>Anmelden</T>
            </Link>
          </div>
        </Abschnitt>
      </section>

      {/*
        * Die Partnerleiste - wer das Werkzeug benutzt.
        *
        * Sie steht vor dem Abschnitt darueber, wie man VIP wird: erst
        * sieht man, wer schon dabei ist, dann liest man, wie man dazu
        * kommt. Ist niemand ausgewaehlt, zeichnet sie sich selbst nicht.
        */}
      <VipSlider />

      {/* ----------------------------------------------------------- VIP */}
      {/* Die Sprungmarke, auf die der Knopf in der Partnerleiste zielt. */}
      <section id="vip-zugang"
        className="scroll-mt-20 border-t border-zinc-900 px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]
                        text-sky-400"><T>VIP-Zugang</T></p>
          <h2 className="mt-3 text-2xl font-bold text-slate-100">
            <T>Wie man VIP wird</T>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Der VIP-Zugang schaltet die Overlays frei, eigene Ordner auf der
            Streamseite, die Filter im Turnierkalender und den Vergleich in den
            Statistiken. Er wird vergeben, nicht gekauft.</T>
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {([
              ['Reichweite',
               'Du solltest auf Twitch, X oder YouTube ein Publikum haben — '
               + 'wie groß, entscheide ich im Einzelfall.'],
              ['Sichtbarkeit',
               'Zeig CompHub bei deinen Zuschauern. Ein Overlay im Stream oder '
               + 'ein Beitrag reicht schon.'],
              ['Anfrage',
               'Schreib mir persönlich auf X. Ich antworte selbst, es gibt kein '
               + 'Formular und keine Warteliste.'],
            ] as Array<[string, string]>).map(([titel, text], i) => (
              <div key={titel}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                <p className="text-[11px] font-bold tabular-nums text-sky-400">
                  {i + 1}
                </p>
                <h3 className="mt-2 text-sm font-bold text-slate-100">
                  <T>{titel}</T>
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  <T>{text}</T>
                </p>
              </div>
            ))}
          </div>

          <a href="https://x.com/CompHub_gg" target="_blank" rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full
                       bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white
                       transition hover:bg-sky-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
              aria-hidden>
              <path d="M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.3 22H2l7.5-8.6L1.7 2h7.2
                       l4.5 6.6L18.9 2z" />
            </svg>
            <T>Zugang anfragen</T>
          </a>
        </div>
      </section>

      <footer className="border-t border-zinc-900 px-4 py-10 text-center">
        <a href="https://x.com/CompHub_gg" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-xs text-slate-500
                     transition hover:text-sky-400">
          {/* Das X-Zeichen als Pfad statt als Schrift - eine Ikonenschrift
              nur fuer ein Zeichen waere zu viel. */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"
            aria-hidden>
            <path d="M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.3 22H2l7.5-8.6L1.7 2h7.2
                     l4.5 6.6L18.9 2zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20z" />
          </svg>
          @CompHub_gg
        </a>
        <p className="mt-4 text-[11px] text-slate-700">
          <T>Nicht mit Epic Games verbunden.</T>
        </p>
      </footer>
    </main>
  );
}
