'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import MeineOverlays from './MeineOverlays';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import {
  managerDarfCup, overlayCupErlaubt, overlayCupRang, overlayRegionRang,
  overlayZeitraumWeit, rundenBeschriftung,
} from '@/lib/overlayCups';
import { ARTEN } from './OverlayGeruest';

/*
 * Die Startseite der Overlays.
 *
 * Der Betreiber wollte nicht mehr mitten im Baukasten landen: "wenn man
 * draufkommt, sieht man alle seine gespeicherten. Die kann man auswaehlen,
 * neuen Cup auswaehlen ... wenn man ein neues will, muss man draufdruecken."
 *
 * Also drei Schritte statt einem Formular:
 *
 *   1. Was schon da ist - die eigenen Overlays, gross und als Erstes.
 *   2. Ein neues: welcher Cup? Nur was gerade laeuft (19.10.2026: "nur live
 *      Cups, keine kommenden"), standardmaessig nur FNCS, Cash und
 *      Performance - fuer Ranked, Reload und Co. schaltet man den Filter aus.
 *   3. Welche Art? Team-Karte, Standings oder Qual-Linie.
 *
 * Danach geht es in den Baukasten der gewaehlten Art, mit dem Cup schon
 * eingestellt - die Adresse traegt ihn mit, und die Cup-Auswahl dort liest
 * ihn beim Aufgehen.
 */

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number; end?: number; istFinale: boolean;
}
interface Cup {
  id: string; titel: string;
  regionen?: Record<string, Fenster[]>;
}

interface Wahl {
  eventId: string; windowId: string; region: string; titel: string;
  /** Die Runde: "Event 3", "Runde 2", "Finale" - oder leer, wenn der Cup nur eine hat. */
  stufe: string;
  /** Das Ende des Spieltags - fuer "gerade vorbei". */
  ende: number | null;
  istFinale: boolean; live: boolean; begin: number; erlaubt: boolean;
}

/** "läuft", "heute", "morgen", "gestern" - oder das Datum. */
function wann(status: string, begin: number): string {
  if (status === 'live') return 'läuft';
  const tag = new Date(begin); tag.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const abstand = Math.round((tag.getTime() - heute.getTime()) / 86_400_000);
  if (abstand === 0) return 'heute';
  if (abstand === -1) return 'gestern';
  if (abstand === 1) return 'morgen';
  return new Date(begin).toLocaleDateString('de-DE',
    { day: '2-digit', month: '2-digit' });
}

/**
 * Die Startseite einer Overlay-Art.
 *
 * @param onWeiter Wird mit dem gewaehlten Spieltag gerufen, wenn es in den
 *   Baukasten gehen soll. Die Art steht nicht zur Wahl: wer auf der Seite
 *   "Team card" ist, will eine Team-Karte. Der Betreiber: "wenn ich auf Team
 *   cards bin, ist obvious, dass ich Team cards will."
 */
export default function Startansicht({ onWeiter, art }: {
  onWeiter: (eventId: string, windowId: string) => void;
  /** Welche Art diese Seite zeigt - danach wird die Liste gefiltert. */
  art: string;
}) {
  const t = useT();
  const zugang = useZugang();
  /*
   * Ist das ein Manager-Zugang?
   *
   * Dann steht nur zur Wahl, was gerade laeuft oder gleich anfaengt. Alles
   * andere waere waehrend eines Streams ein Fehlgriff mit Folgen: das Overlay
   * zeigte auf einmal ein Turnier von naechster Woche.
   */
  const nurLaufende = Boolean(zugang.verwaltet);
  /*
   * Braucht diese Art einen Cup?
   *
   * Offspawn und der eigene Text hoeren nicht auf Epic - dort gibt es
   * nichts zu waehlen, und "Neues Overlay" fuehrt sofort in den Baukasten.
   */
  const ohneCup = Boolean(ARTEN.find((a) => a.schluessel === art)?.ohneCup);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [neu, setNeu] = useState(false);
  /*
   * Auch Spieltage der letzten Woche zeigen?
   *
   * Zur Wahl steht nur, was gerade laeuft (oder in einer halben Stunde
   * anfaengt) - "keine kommenden Cups" (Betreiber, 19.10.2026). Wer ein
   * Overlay fuer einen Spieltag von vorgestern braucht, schaltet das hier zu.
   */
  const [frueher, setFrueher] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Wahl | null>(null);
  /*
   * Die Suche in der Cup-Liste.
   *
   * Ganz aufgeklappt sind es an einem Cup-Tag sechzig Kacheln und mehr; wer
   * einen bestimmten sucht, will ihn tippen, nicht scrollen. Der Betreiber:
   * "wenn ich hier dann alle eingeblendet hab, soll mittig eine Suchliste
   * kommen." Sobald etwas drinsteht, wird alles durchsucht, nicht nur die
   * gerade offene Stufe.
   */
  const [suche, setSuche] = useState('');
  /*
   * Die Filter unter der Suche: Region, nur die wichtigen Cups, nur Finals.
   *
   * Der Betreiber: "mach in dieser Ansicht noch einen Filter fuer Europa,
   * NAC und so, dass man Cups auch filtern kann." Ein gesetzter Filter wirkt
   * wie die Suche - er zeigt alles Passende aus dem Zeitraum, nicht nur die
   * gerade offene Stufe.
   */
  const [regionFilter, setRegionFilter] = useState('');
  // Voreingestellt: nur FNCS, Cash und Performance; fuer Ranked und Co. ausschalten.
  const [nurWichtige, setNurWichtige] = useState(true);
  const [nurFinals, setNurFinals] = useState(false);
  const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

  /*
   * Kommt jemand von der Uebersicht mit "Neues Overlay" (?neu=1), geht es
   * gleich in die Cup-Wahl - ohne noch einmal auf "Neues Overlay" zu druecken.
   */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('neu')) return;
    if (ohneCup) onWeiter('', ''); else setNeu(true);
    // Nur beim Aufschlagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Jedes Fenster als eigene Kachel.
   *
   * Was ueblicherweise gebraucht wird, steht vorn; alles andere erst, wenn
   * "andere" gedrueckt ist. Der Betreiber wollte die Ausnahme ausdruecklich
   * moeglich haben - "falls man mal ausnahmsweise Standings fuer jemand
   * anderen will" -, aber nicht im Weg.
   */
  const alleKacheln = useMemo(() => {
    const { von, bis } = overlayZeitraumWeit();
    const raus: Wahl[] = [];
    // NA Central und NA West teilen sich Fenster - jedes windowId nur einmal, mit seiner eigenen Region.
    const gesehen = new Set<string>();
    for (const c of cups ?? []) {
      const erlaubt = overlayCupErlaubt(c.titel);
      for (const liste of Object.values(c.regionen ?? {})) {
        const frisch = (liste ?? []).filter((w) => w.begin >= von && w.begin <= bis && !gesehen.has(w.windowId));
        // Die Runde je Spieltag - auch wenn Epic sie nicht in die Kennung schreibt (Last Chance Qualifier und sein Finale).
        const stufen = rundenBeschriftung(liste ?? [], t);
        for (const w of frisch) {
          gesehen.add(w.windowId);
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region: /_([A-Z]{2,4})$/.exec(w.windowId)?.[1] ?? w.region,
            titel: c.titel, stufe: stufen.get(w.windowId) ?? '', ende: w.end ?? null, istFinale: w.istFinale, begin: w.begin,
            live: w.status === 'live', erlaubt,
          });
        }
      }
    }
    /*
     * Was laeuft zuerst, danach nach Datum - der naechste Termin oben.
     *
     * Die Wichtigkeit des Cups entscheidet erst, wenn zwei zur selben Zeit
     * anfangen. Der Betreiber wollte die Liste zeitlich geordnet, damit sie
     * sich lesen laesst wie ein Kalender.
     */
    const jetzt = Date.now();
    return raus.sort((a, b) => Number(b.live) - Number(a.live)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt)
      || overlayRegionRang(a.region) - overlayRegionRang(b.region)
      || overlayCupRang(a.titel) - overlayCupRang(b.titel));
  }, [cups, t]);

  /*
   * Was zu sehen ist.
   *
   * Laufendes und was in einer halben Stunde anfaengt; auf Wunsch dazu die
   * letzte Woche. Kommendes nie. Die Filter und die Suche wirken darauf.
   */
  const kacheln = useMemo(() => {
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const jetzt = Date.now();
    return alleKacheln.filter((k) => {
      if (nurLaufende) {
        // Ein Manager hat seine eigene Regel (Europa ab 15 Minuten vorher, sonst zwei Stunden).
        if (!managerDarfCup(k.begin, k.region, k.live)) return false;
      } else {
        const bald = !k.live && k.begin > jetzt && k.begin - jetzt <= 30 * 60_000;
        const vorbei = !k.live && k.begin <= jetzt;
        // Gerade zu Ende gegangen: noch eine halbe Stunde dabei.
        const frischVorbei = vorbei && k.ende !== null && jetzt > k.ende && jetzt - k.ende <= 30 * 60_000;
        if (!k.live && !bald && !frischVorbei && !(frueher && vorbei)) return false;
      }
      if (regionFilter && k.region !== regionFilter) return false;
      if (nurWichtige && !k.erlaubt) return false;
      if (nurFinals && !k.istFinale) return false;
      /*
       * Mit Suchtext zaehlt nur der Treffer - jedes getippte Wort muss ein
       * Wort anfangen, in Name, Region, "Finals", Datum oder "heute". So
       * findet "reload eu" die Reload-Cups in Europa und "11.09." alles von
       * diesem Tag.
       *
       * Wortanfang, nicht Teilstueck: "eu" steckt auch in "heute", und die
       * erste Fassung zeigte damit fuer "reload eu" jede Region an.
       */
      if (woerter.length) {
        const zeit = wann(k.live ? 'live' : '', k.begin);
        const imText = [
          k.titel, k.stufe, k.region, k.istFinale ? 'finals finale' : '',
          new Date(k.begin).toLocaleDateString('de-DE',
            { day: '2-digit', month: '2-digit' }),
          zeit, t(zeit),
        ].join(' ').toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter(Boolean);
        return woerter.every((w) => imText.some((x) => x.startsWith(w)));
      }
      return true;
    });
  }, [alleKacheln, nurLaufende, suche, t, regionFilter, nurWichtige, nurFinals, frueher]);

  const sucht = suche.trim().length > 0 || Boolean(regionFilter) || nurFinals;

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------ Schritt 1 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-slate-100">
            {zugang.verwaltet
              ? `${zugang.verwaltet} Overlays` : <T>Deine Overlays</T>}
          </h1>
          {!neu && (
            <button onClick={() => (ohneCup ? onWeiter('', '') : setNeu(true))}
              className="ml-auto rounded-lg bg-sky-500 px-4 py-2 text-sm
                         font-semibold text-white transition hover:bg-sky-400">
              <T>Neues Overlay</T>
            </button>
          )}
        </div>

        {!neu && <MeineOverlays nurArt={art} />}
      </section>

      {/* ------------------------------------------------ Schritt 2 */}
      {neu && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em]
                           text-slate-400">
              <T>Für welchen Cup?</T>
            </h2>
            {!nurLaufende && (
              <button onClick={() => setFrueher((v) => !v)}
                className={`ml-auto text-[11px] transition hover:text-sky-400 ${
                  frueher ? 'text-sky-400' : 'text-slate-500'}`}>
                {frueher ? <T>nur was läuft</T> : <T>auch die letzte Woche zeigen</T>}
              </button>
            )}
          </div>

          {/* Die Suche - mittig, so wollte es der Betreiber. */}
          {cups && cups.length > 0 && (
            <div className="mb-4 flex justify-center">
              <input value={suche} onChange={(e) => setSuche(e.target.value)}
                placeholder={t('Cup, Region oder Datum suchen …')}
                className="w-full max-w-md rounded-lg border border-zinc-800
                           bg-zinc-950 px-4 py-2.5 text-center text-sm
                           text-slate-100 outline-none
                           placeholder:text-slate-600 focus:border-sky-500" />
            </div>
          )}
          {/* Die Filter: Region, wichtige Cups, Finals - im Stil der Reiter daneben. */}
          {cups && cups.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5">
              {['', ...REGIONEN].map((r) => (
                <button key={r || 'alle'} onClick={() => setRegionFilter(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    regionFilter === r
                      ? 'bg-sky-500 text-white'
                      : 'border border-zinc-800 text-slate-400 hover:border-sky-500 hover:text-slate-200'}`}>
                  {r || t('Alle Regionen')}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-zinc-800" />
              <button onClick={() => setNurWichtige((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  nurWichtige ? 'bg-sky-500 text-white'
                    : 'border border-zinc-800 text-slate-400 hover:border-sky-500 hover:text-slate-200'}`}>
                <T>Nur FNCS, Cash und Performance</T>
              </button>
              <button onClick={() => setNurFinals((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  nurFinals ? 'bg-sky-500 text-white'
                    : 'border border-zinc-800 text-slate-400 hover:border-sky-500 hover:text-slate-200'}`}>
                <T>Nur Finals</T>
              </button>
            </div>
          )}

          {!cups && <LadeSchirm />}
          {nurLaufende && (
            <p className="mb-3 text-[11px] leading-relaxed text-sky-400/80">
              <T>Als Manager wählst du den Spieltag, um den es gerade geht:
              was läuft, was heute schon lief, und was gleich anfängt — in
              Europa ab 15 Minuten vorher, in den anderen Regionen ab zwei
              Stunden vorher.</T>
            </p>
          )}

          {cups && !kacheln.length && sucht && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>Nichts gefunden für</T> &quot;{suche.trim()}&quot;
            </p>
          )}
          {cups && !kacheln.length && !sucht && nurLaufende && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>Gerade läuft kein Spieltag und keiner fängt gleich an. Sobald
              einer ansteht, erscheint er hier von selbst.</T>
            </p>
          )}
          {cups && !kacheln.length && !sucht && !nurLaufende && (
            <p className="text-sm leading-relaxed text-amber-500/80">
              <T>Gerade läuft kein passender Cup. Schalte den Filter „Nur FNCS,
              Cash und Performance“ aus, um auch Ranked, Reload, Mobile und
              Arenas zu sehen, oder zeig die letzte Woche.</T>
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kacheln.map((k) => {
              const ist = gewaehlt?.windowId === k.windowId;
              return (
                <button key={k.windowId} onClick={() => setGewaehlt(k)}
                  className={`rounded-xl border px-4 py-3 text-left transition
                    ${ist
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'}`}>
                  <span className="flex items-center gap-2">
                    {k.live && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold
                                     text-slate-100">
                      {k.titel}
                    </span>
                    {/*
                      * Das Datum steht rechts aussen und grau.
                      *
                      * So laeuft es in allen Kacheln auf einer Linie und die
                      * Liste liest sich wie ein Kalender - der Betreiber:
                      * "es soll ganz rechts am Rand ueberall noch das Datum
                      * stehen, das ist ein bisschen uebersichtlicher."
                      */}
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums
                                     text-slate-500">
                      {new Date(k.begin).toLocaleDateString('de-DE',
                        { day: '2-digit', month: '2-digit' })}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {k.region}
                    {k.stufe ? ` · ${k.stufe}` : ''}
                    {` · ${t(k.ende !== null && !k.live && Date.now() > k.ende && Date.now() - k.ende <= 30 * 60_000 ? 'gerade vorbei' : wann(k.live ? 'live' : '', k.begin))}`}
                    {!k.erlaubt ? ` · ${t('sonstiger Cup')}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/*
        * Weiter oder abbrechen.
        *
        * Links das Zurueck, rechts das Weiter - so wie der Betreiber es
        * beschrieben hat. Die Art steht nicht mehr zur Wahl: sie ergibt sich
        * aus der Seite, auf der man ist.
        */}
      {neu && (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3
                        border-t border-zinc-800 bg-zinc-950/95 px-4 py-3
                        backdrop-blur">
          <button onClick={() => { setNeu(false); setGewaehlt(null); }}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm
                       text-slate-400 transition hover:border-zinc-700
                       hover:text-slate-200">
            <T>Abbrechen</T>
          </button>
          <span className="min-w-0 truncate text-[11px] text-slate-500">
            {gewaehlt ? [gewaehlt.titel, gewaehlt.stufe, gewaehlt.region].filter(Boolean).join(' · ') : ''}
          </span>
          <button
            onClick={() => gewaehlt && onWeiter(gewaehlt.eventId, gewaehlt.windowId)}
            disabled={!gewaehlt}
            className="ml-auto rounded-lg bg-sky-500 px-5 py-2 text-sm
                       font-semibold text-white transition hover:bg-sky-400
                       disabled:cursor-not-allowed disabled:opacity-40">
            <T>Weiter</T>
          </button>
        </div>
      )}
    </div>
  );
}
