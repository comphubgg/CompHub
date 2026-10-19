'use client';

import { useEffect, useState } from 'react';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import Link from 'next/link';
import T from '@/app/components/T';
import HeroHintergrund from '@/app/components/HeroHintergrund';
import Fusszeile from '@/app/components/Fusszeile';
import TeamFlagge from '@/components/TeamFlagge';
import DiscordKnopf from '@/app/components/DiscordKnopf';
import StartVitrine from '@/app/components/StartVitrine';
import Rollzahl from '@/app/components/Rollzahl';

/** Ein Platz in der Preisgeldliste der Startseite. */
interface Geldplatz {
  epicId: string; anzeige: string; land: string | null; bild: string | null;
  heimat: string; verdienst: number;
}

/**
 * Die fuenf mit dem meisten Preisgeld dieses Jahres.
 *
 * Die Idee des Betreibers fuer die Startseite: "ein Abschnitt mit Most
 * Earnings this year, Top 5, oben rechts View all, und dann kommt man auf
 * die Earnings-Seite 2026." Nur Preisgeld, nichts anderes - das ist die
 * Zahl, die jeder sofort versteht.
 */
function MeistesPreisgeld({ ort }: { ort: string }) {
  type Antwort = { jahr: number; plaetze: Geldplatz[]; spieltageMitRegel: number };
  const jahr = new Date().getUTCFullYear();
  /*
   * Zwei Listen, ein Umschalter: das Jahr und alle Zeit. Der Betreiber:
   * "ein zweiter Block Most Earnings all time - das ist die Zahl, die alle
   * vergleichen wollen." Beide kommen fertig gerechnet vom Laufrechner.
   */
  const [dieses, setDieses] = useState<Antwort | null>(null);
  const [alle, setAlle] = useState<Antwort | null>(null);
  const [wahl, setWahl] = useState<'jahr' | 'alle'>('jahr');
  useEffect(() => {
    const hole = (adresse: string, setz: (a: Antwort) => void) =>
      fetch(adresse, { signal: AbortSignal.timeout(10_000) })
        .then((r) => r.json())
        .then((j) => { if (j?.plaetze?.length) setz(j); })
        .catch(() => { /* dann fehlt der Abschnitt - besser als leere Karten */ });
    void hole(`/api/szene-stats?ansicht=jahr&jahr=${jahr}&kurz=1`, setDieses);
    void hole('/api/szene-stats?ansicht=jahr&jahr=alle&kurz=1', setAlle);
  }, [jahr]);
  const daten = wahl === 'alle' ? (alle ?? dieses) : (dieses ?? alle);
  if (!daten) return null;
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <Abschnitt>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-500">
                <T>Preisgeld</T>
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                <T>Meistes Preisgeld</T> {wahl === 'alle' ? <T>aller Zeiten</T> : jahr}
              </h2>
              {alle && dieses && (
                <div className="mt-2 flex gap-1.5">
                  {([['jahr', String(jahr)], ['alle', 'Alle Zeit']] as const).map(([w, titel]) => (
                    <button key={w} onClick={() => setWahl(w)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        wahl === w ? 'bg-sky-500 text-white'
                          : 'border border-zinc-800 text-slate-400 hover:border-sky-500 hover:text-slate-200'}`}>
                      {w === 'alle' ? <T>Alle Zeit</T> : titel}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link href={wahl === 'alle' ? '/statistics?bereich=jahr&jahr=alle' : '/statistics?bereich=jahr'}
              className="shrink-0 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                         font-semibold text-slate-300 transition hover:border-sky-500
                         hover:text-sky-400">
              <T>Alle anzeigen</T> →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {daten.plaetze.map((sp, i) => (
              <Link key={sp.epicId} href={`/statistics?spieler=${encodeURIComponent(sp.anzeige)}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-xl border
                           border-zinc-800 bg-zinc-900 transition hover:border-sky-500">
                {sp.bild ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={sp.bild} alt="" loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover object-top
                               transition duration-300 group-hover:scale-105" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-4xl
                                   text-zinc-800">?</span>
                )}
                <span className={`absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5
                                  text-[10px] font-bold tabular-nums ${
                                  i === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {i + 1}
                </span>
                {sp.heimat && (
                  <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5
                                   text-[9px] font-semibold tracking-wider text-slate-300">
                    {sp.heimat}
                  </span>
                )}
                <span className="absolute bottom-0 w-full bg-gradient-to-t from-black/95
                                 via-black/70 to-transparent px-3 pb-2.5 pt-10">
                  <span className="flex items-center gap-1.5">
                    <TeamFlagge groesse={16} laender={[sp.land ?? undefined]} />
                    <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide
                                     text-slate-50">{sp.anzeige}</span>
                  </span>
                  <span className="mt-1 block text-lg font-bold tabular-nums text-emerald-400">
                    ${sp.verdienst.toLocaleString(ort)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            <T>Epics Auszahlungstabelle je Spieltag und Region, angewendet auf Epics Bestenliste nach Platz; LAN-Events je Person aus veröffentlichten Tabellen.</T>
          </p>
        </Abschnitt>
      </div>
    </section>
  );
}

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
  saisons: number | null;
  spieltage: number | null;
  regionen: number | null;
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

/*
 * Der Hinweis auf den X-Account (Betreiber, 19.10.2026: Werbung fuer seinen Twitter-Account, kein TikTok).
 *
 * Ein schmales Band zwischen den Zahlen und der Fusszeile - nicht im Kopf, wo die Wege in die Seite stehen, und nicht in der Fusszeile, wo
 * der Verweis klein neben dem Kontakt untergeht.
 */
function XWerbung() {
  return (
    <section className="px-4 py-10">
      <div className="relative mx-auto flex max-w-5xl flex-wrap items-center gap-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-6 shadow-[0_10px_30px_rgba(15,23,42,.14)] sm:px-8">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-zinc-700 bg-zinc-950 text-slate-100">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">@CompHub_gg</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-white"><T>Folge CompHub auf X</T></h2>
          <p className="mt-1 text-sm text-slate-400"><T>Cup-Ergebnisse, Power Rankings und Neuigkeiten von CompHub.</T></p>
        </div>
        <a href="https://x.com/CompHub_gg" target="_blank" rel="noreferrer"
          className="relative rounded-full bg-sky-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-400">
          <T>Auf X folgen</T>
        </a>
      </div>
    </section>
  );
}

export default function Startseite() {
  const { sprache } = useSprache();
  const [stand, setStand] = useState<Stand | null>(null);
  /**
   * Wird noch geholt?
   *
   * Solange das laeuft, liegt ein Schleier ueber den Zahlen. Vorher standen
   * dort Striche, und niemand konnte unterscheiden, ob gerade geladen wird
   * oder ob es nichts zu zeigen gibt.
   */
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        /*
         * Nach zehn Sekunden ist Schluss.
         *
         * Der Betreiber: "Das soll auch maximal zehn Sekunden gehen." Er hat
         * recht - eine Zahl, auf die man laenger wartet, ist keine Auskunft
         * mehr. Bleibt eine Antwort aus, steht dort ein Strich, und die Seite
         * ist trotzdem fertig; die Zahlen sind Beiwerk, nicht der Inhalt.
         *
         * Im Regelfall greift die Frist nie: die Antworten liegen fertig in
         * der Ablage und kommen in Bruchteilen einer Sekunde.
         */
        const frist = AbortSignal.timeout(10_000);
        const [archiv, replays] = await Promise.all([
          fetch('/api/szene-stats', { signal: frist })
            .then((r) => r.json()).catch(() => null),
          fetch('/api/replays', { signal: frist })
            .then((r) => r.json()).catch(() => null),
        ]);
        // Bleibt die Antwort aus, steht ein Strich - eine Null waere eine Behauptung.
        setStand({
          saisons: archiv?.saisons?.length ?? null,
          spieltage: archiv?.spieltage ?? null,
          regionen: archiv?.regionen?.length ?? null,
          konten: null,
          replays: (replays?.fenster ?? []).reduce(
            (n: number, f: { zaehler?: Record<string, number> }) =>
              n + (f.zaehler?.PARSED ?? 0), 0) || null,
        });
      } catch { /* dann bleiben die Zahlen aus */ }
      finally { setLaedt(false); }
    });
  }, []);

  // Die Zahlen folgen der eingestellten Sprache. Vorher stand hier fest
  // 'de-DE', und auf Englisch las man "37.004 matches processed".
  const ort = ortVon(sprache);

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      {/*
        * Der Kopf (Betreiber, 14.10.2026: "die Homepage ist mir zu simpel"): eine laufende Vorschau der Seite im Hintergrund - Cup-Banner, Karten und
        * Spielerfotos -, davor Logo, Name und die Wege hinein. Die Abschnitte "Woher die Zahlen", "Mit Konto mehr", die Partnerleiste und "Wie man VIP
        * wird" sind von hier weg: die VIP-Auskunft steht im Konto (VipInfo), die Quellen in der Fusszeile.
        */}
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-28 sm:pt-36">
        <HeroHintergrund />

        <div className="relative mx-auto max-w-4xl text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo-frei.png" alt=""
            className="mx-auto mb-6 h-20 w-auto drop-shadow-xl sm:h-24" />

          <h1 className="schrift-anzeige text-6xl font-extrabold leading-[0.95] tracking-tight sm:text-8xl">
            <span className="text-sky-500">COMP</span><span>HUB</span>
          </h1>

          {/* Hier stand "Jedes Turnier. Jeder Spieltag. Jeder Spieler." - das stimmt nicht. Das Archiv beginnt in Chapter 5, und zu einzelnen
              Cups hat die Quelle nie etwas veroeffentlicht. Eine Startseite, deren erster Satz uebertreibt, macht jede Zahl darunter angreifbar. */}
          <p className="mx-auto mt-7 max-w-2xl text-lg font-semibold text-slate-200 sm:text-xl">
            <T>Statistiken, Turniere und Streams an einem Ort.</T>
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            <T>Zehn Saisons, sieben Regionen — vom Chapter-5-Archiv bis zum
            Spieltag von gestern.</T>
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/statistics"
              className="rounded-full bg-sky-500 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-400">
              <T>Statistiken ansehen</T>
            </Link>
            <Link href="/streams"
              className="rounded-full border border-zinc-700 bg-zinc-900/80 px-7 py-3 text-sm font-bold text-slate-200 backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-500/70 hover:text-sky-500">
              <T>Streams öffnen</T>
            </Link>
            {/* Der Weg auf den Server - Updates, Support, Zugang per Knopf. */}
            <DiscordKnopf art="rand" />
          </div>
        </div>

        {/* --------------------------------------------------- Die Zahlen */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          {/* Waehrend geholt wird, liegt ein Schleier darueber - wie beim Seitenwechsel auch. */}
          {laedt && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-zinc-950/60 backdrop-blur-[2px]">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-500" />
            </div>
          )}
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${laedt ? 'opacity-40' : ''}`}>
            {([
              [stand?.spieltage ?? null, 'Spieltage im Archiv'],
              [stand?.saisons ?? null, 'Saisons erfasst'],
              [stand?.regionen ?? null, 'Regionen'],
              [stand?.replays ?? null, 'Matches ausgewertet'],
            ] as Array<[number | null, string]>).map(([wert, titel]) => (
              <div key={titel} className="rounded-2xl border border-zinc-800 bg-zinc-900/85 px-4 py-6 text-center shadow-[0_10px_30px_rgba(15,23,42,.12)] backdrop-blur">
                <p className="schrift-anzeige text-3xl font-extrabold tabular-nums text-sky-500 sm:text-4xl"><Rollzahl wert={wert} los={!laedt} ort={ort} /></p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{titel}</T></p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">
            <T>Live aus dem eigenen Archiv — keine geschätzten Zahlen.</T>
          </p>
        </div>
      </section>

      {/* ------------------------------------------- Maps, Spieler, Statistik, Mehr */}
      <StartVitrine />

      <MeistesPreisgeld ort={ort} />

      <XWerbung />

      {/* Dieselbe Fusszeile steht unter dem Dashboard - siehe app/components/Fusszeile.tsx. */}
      <Fusszeile />
    </main>
  );
}
