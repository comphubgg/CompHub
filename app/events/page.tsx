'use client';

// Turnier-Uebersicht: eine Kachel je Cup, darin die Regionen. Ein Klick
// fuehrt auf die Cup-Seite mit Spieltagen und Leaderboard.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import type { Sprache } from '@/app/lib/sprache';
interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string;
  istFinale: boolean; matchCap?: number;
}
interface Cup {
  id: string; titel: string; untertitel?: string;
  bild?: string; farbe?: string; kapitel?: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  naechsterStart: number | null;
  letzterStart: number | null;
  live: boolean; vorbei: boolean;
}

/**
 * Die Zeile unter dem Cupnamen.
 *
 * Epic liefert dort haeufig etwas Brauchbares - "Battle Royale", "Zero Build",
 * "Finals", "Performance Evaluation". Wo nichts kommt, stand bisher die
 * interne Kennung ("s42_reloadelite"). Die sagt niemandem etwas. Stattdessen
 * steht dort jetzt der Zeitraum, und "Finale" nur dann, wenn dieser Cup
 * tatsaechlich einen Finaltag hat.
 */
function unterzeile(c: Cup, sprache: Sprache, t: (s: string) => string): string {
  const fenster = Object.values(c.regionen).flat();
  const teile: string[] = [];
  if (c.untertitel) teile.push(c.untertitel);

  const termine = fenster.map((f) => f.begin).filter(Boolean).sort((a, b) => a - b);
  if (termine.length) {
    // Das Datum in der Schreibweise der gewaehlten Sprache: im Deutschen
    // Tag vor Monat, im Englischen umgekehrt. Ein festes 'de-DE' waere sonst
    // die letzte deutsche Stelle auf einer englischen Seite.
    const tag = (ms: number) => new Date(ms)
      .toLocaleDateString(sprache === 'en' ? 'en-GB' : 'de-DE',
        { day: '2-digit', month: '2-digit' });
    const von = tag(termine[0]);
    const bis = tag(termine[termine.length - 1]);
    teile.push(von === bis ? von : `${von} – ${bis}`);
  }
  if (!c.untertitel && fenster.some((f) => f.istFinale)) teile.push(t('mit Finale'));
  return teile.join(' · ');
}

/** Verlauf je Cup-Art - fuer Kacheln ohne Bild von Epic. */
const ART_FARBE: Record<string, string> = {
  championship: 'from-amber-700 to-amber-950',
  division: 'from-sky-700 to-sky-950',
  finals: 'from-violet-700 to-violet-950',
  cash: 'from-emerald-700 to-emerald-950',
  reload: 'from-orange-700 to-orange-950',
  victory: 'from-yellow-700 to-yellow-950',
  ranked: 'from-lime-800 to-lime-950',
  mobile: 'from-cyan-800 to-cyan-950',
  skin: 'from-fuchsia-800 to-fuchsia-950',
  sonstige: 'from-zinc-700 to-zinc-900',
};

const REGION_TEXT: Record<string, string> = {
  GLOBAL: 'Alle Regionen', EU: 'Europe', NAC: 'NA Central', NAW: 'NA West',
  BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

const ART_TEXT: Record<string, string> = {
  championship: 'Championship', division: 'Division', finals: 'Finals',
  cash: 'Cash Cup', reload: 'Reload', victory: 'Victory Cup',
  solo: 'Open', ranked: 'Ranked', mobile: 'Mobile',
  skin: 'Skin-Cup', sonstige: 'Sonstige',
};

type Modus = 'aktuell' | 'standard' | 'vorbei' | 'alle';

const MODI: Array<{ wert: Modus; titel: string; hinweis: string }> = [
  { wert: 'aktuell',  titel: 'Aktuell & kommend', hinweis: 'Was gerade läuft und als Nächstes ansteht' },
  { wert: 'standard', titel: 'Standard',          hinweis: 'Reload, Cash Cups, Finals, Opens und Division Cups — auch vergangene' },
  { wert: 'vorbei',   titel: 'Vergangen',         hinweis: 'Was schon gelaufen ist, aus dem eigenen Archiv' },
  { wert: 'alle',     titel: 'Alle',              hinweis: 'Jedes Turnier — auch Ranked, Mobile und Skin-Cups' },
];

/*
 * Der Uebersetzer kommt als Parameter: beide Funktionen stehen ausserhalb
 * der Komponente. Der Schluessel ist der ganze Satz mit {n} statt der Zahl,
 * weil sich die Wortstellung zwischen den Sprachen verschiebt.
 */
function restzeit(ms: number, t: (s: string) => string) {
  const d = ms - Date.now();
  if (d <= 0) return null;
  const mit = (satz: string, n: number) => t(satz).replace('{n}', String(n));
  const std = Math.floor(d / 3_600_000);
  if (std < 1) return mit('in {n} Min.', Math.max(1, Math.floor(d / 60_000)));
  if (std < 48) return mit('in {n} Std.', std);
  return mit('in {n} Tagen', Math.floor(std / 24));
}

function vergangen(ms: number, t: (s: string) => string) {
  const tage = Math.floor((Date.now() - ms) / 86_400_000);
  if (tage < 1) return t('heute');
  if (tage === 1) return t('gestern');
  return t('vor {n} Tagen').replace('{n}', String(tage));
}

export default function EventsPage() {
  const { sprache, t } = useSprache();
  const router = useRouter();
  const [cups, setCups] = useState<Cup[]>([]);
  const [proArt, setProArt] = useState<Record<string, number>>({});
  /** Was im eigenen Archiv liegt - Turniere und Kalendertage, nicht Fenster. */
  const [archiv, setArchiv] = useState({ turniere: 0, tage: 0 });
  const [fehler, setFehler] = useState<string | null>(null);
  const [loginNoetig, setLoginNoetig] = useState(false);
  const [laedt, setLaedt] = useState(true);

  // Drei Ansichten statt zweier Filtergruppen: was jetzt laeuft, alle
  // wichtigen Cups ueber die Zeit, oder wirklich jedes Turnier.
  const zugang = useZugang();
  /*
   * Ohne VIP gibt es keine Filter - dann steht alles da, von Anfang an.
   * Der Modus bleibt trotzdem im Zustand, weil die Abfrage ihn braucht;
   * er wird nur nicht mehr umgestellt.
   */
  const [modus, setModus] = useState<Modus>('aktuell');

  useEffect(() => {
    if (zugang.laedt || zugang.vip) return;
    // Einen Mikrotask spaeter, damit der Effekt nicht im selben Durchlauf
    // Zustand setzt und eine zweite Zeichnung ausloest.
    let weg = false;
    void Promise.resolve().then(() => { if (!weg) setModus('alle'); });
    return () => { weg = true; };
  }, [zugang.laedt, zugang.vip]);
  const [offen, setOffen] = useState<string | null>(null);

  /**
   * Die Suche steht ueber dem Filter.
   *
   * Wer einen bestimmten Cup sucht, weiss meist nicht mehr, ob er kommt oder
   * schon gelaufen ist - eine Suche, die nur im gerade gewaehlten Ausschnitt
   * blaettert, findet ihn dann nicht. Sobald etwas im Feld steht, wird
   * deshalb im ganzen Bestand gesucht, unabhaengig von Ansicht und
   * Divisionsfilter.
   */
  const [suche, setSuche] = useState('');
  const [alleCups, setAlleCups] = useState<Cup[] | null>(null);
  const suchtGerade = suche.trim().length >= 2;

  useEffect(() => {
    if (!suchtGerade || alleCups) return;
    let weg = false;
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((d) => { if (!weg) setAlleCups(d.cups ?? []); })
      .catch(() => {});
    return () => { weg = true; };
  }, [suchtGerade, alleCups]);

  /** Was auf der Seite steht: der Suchtreffer, sonst die gewaehlte Ansicht. */
  const zeigeCups = useMemo(() => {
    if (!suchtGerade) return cups;
    const worte = suche.toLowerCase().split(/\s+/).filter(Boolean);
    return (alleCups ?? cups).filter((c) => {
      const heu = `${c.titel} ${c.untertitel ?? ''} ${c.kapitel ?? ''}`.toLowerCase();
      return worte.every((w) => heu.includes(w));
    });
  }, [suchtGerade, suche, alleCups, cups]);

  useEffect(() => {
    let weg = false;
    (async () => {
      setLaedt(true); setFehler(null);
      try {
        const r = await fetch(`/api/cup-catalog?modus=${modus}`);
        const d = await r.json();
        if (weg) return;
        if (!r.ok) {
          setLoginNoetig(Boolean(d.needsLogin));
          setFehler(d.error ?? 'nicht ladbar');
          setCups([]);
        } else {
          setLoginNoetig(false);
          setCups(d.cups ?? []);
          setProArt(d.proArt ?? {});
          setArchiv({
            turniere: d.archiv?.turniere ?? 0,
            tage: d.archiv?.tage ?? 0,
          });
        }
      } catch (e) { if (!weg) setFehler((e as Error).message); }
      finally { if (!weg) setLaedt(false); }
    })();
    return () => { weg = true; };
  }, [modus]);

  const ausgeblendet = useMemo(() => {
    if (modus === 'alle') return 0;
    return (proArt.ranked ?? 0) + (proArt.mobile ?? 0)
         + (proArt.skin ?? 0) + (proArt.sonstige ?? 0);
  }, [proArt, modus]);

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1500px]">

        <div className="mb-5">
          <h1 className="text-xl font-semibold text-slate-100"><T>Fortnite Events</T></h1>
          <p className="mt-1 text-sm text-slate-500">
            <T>Alle Cups mit Leaderboard — direkt von Epic.</T>
            {archiv.turniere > 0 && (
              <> <T>Im Archiv liegen</T> {archiv.turniere} <T>Turniere an</T>{' '}
                {archiv.tage} <T>Tagen.</T></>
            )}
          </p>
        </div>

        {/*
          * Die Filterzeile gehoert zum VIP-Zugang. Ohne sie steht alles da -
          * der Modus wird oben auf "alle" gestellt -, und ein Reiter, den
          * man nicht umstellen darf, waere nur ein Hinweis auf etwas
          * Fehlendes.
          */}
        {/* Filter links, Suche rechts - in einer Zeile. Uebereinander sah
            es aus, als kaeme noch etwas; nebeneinander ist es eine
            Bedienleiste. Die Suche gilt auch fuer Besucher ohne Zugang: sie
            aendert keine Ansicht, sie findet nur. */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {zugang.vip && (
            <>
              <div className="flex gap-1 rounded-lg border border-zinc-800
                              bg-zinc-900/60 p-1">
                {MODI.map((m) => (
                  <button key={m.wert} onClick={() => setModus(m.wert)}
                    title={t(m.hinweis)}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                      modus === m.wert
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'}`}>
                    <T>{m.titel}</T>
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500">
                {suchtGerade
                  ? `${zeigeCups.length} ${t('Treffer im ganzen Bestand')}`
                  : t(MODI.find((m) => m.wert === modus)?.hinweis ?? '')}
                {!suchtGerade && modus !== 'alle' && ausgeblendet > 0
                  && ` · ${t('{n} weitere unter „Alle“').replace('{n}', String(ausgeblendet))}`}
              </span>
            </>
          )}

          {/* Rechts aussen, auf derselben Zeile wie die Filter. */}
          <div className="ml-auto flex items-center gap-2">
            {suchtGerade && (
              <button onClick={() => setSuche('')}
                className="text-xs text-slate-400 underline hover:text-slate-200">
                <T>zurücksetzen</T>
              </button>
            )}
            <input value={suche} onChange={(e) => setSuche(e.target.value)}
              placeholder={t('Turnier suchen …')}
              className="w-56 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5
                         text-xs text-slate-100 outline-none placeholder:text-slate-600
                         focus:border-sky-500 sm:w-72" />
          </div>
        </div>

        {loginNoetig && (
          <div className="mb-5 rounded-xl border border-amber-700/40 bg-amber-950/30 p-4 text-sm">
            <p className="font-semibold text-amber-300"><T>Epic ist noch nicht verbunden</T></p>
            <p className="mt-1 text-amber-200/80">
              <T>Einmalig ausführen:</T>{' '}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-amber-100">npm run epic-login</code>
            </p>
          </div>
        )}
        {fehler && !loginNoetig && <p className="mb-4 text-sm text-rose-400">{fehler}</p>}

        {laedt ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {zeigeCups.map((c) => {
              const istOffen = offen === c.id;
              const regionen = Object.keys(c.regionen);
              return (
                <article key={c.id}
                  className={`group relative overflow-hidden rounded-xl border transition ${
                    istOffen ? 'border-sky-500' : 'border-zinc-800 hover:border-zinc-700'}`}>

                  <button
                    onClick={() => {
                      // Ein globales Turnier hat nur ein Leaderboard - da lohnt
                      // keine Regionsauswahl, wir gehen direkt auf die Seite.
                      if (c.global || regionen.length <= 1) router.push(`/events/${c.id}`);
                      else setOffen(istOffen ? null : c.id);
                    }}
                    className="block w-full text-left">
                    <div className="relative h-32 w-full overflow-hidden bg-zinc-900">
                      {c.bild ? (
                        <img src={c.bild} alt="" loading="lazy"
                          className="h-full w-full object-cover transition duration-300
                                     group-hover:scale-105" />
                      ) : (
                        /* Epic liefert das Kachelbild nur, solange ein Turnier
                           laeuft. Statt einer schwarzen Flaeche steht hier der
                           Name auf einem Verlauf, der zur Art des Cups passt -
                           erkennbar als das, was er ist, und nicht als
                           geliehenes Bild eines anderen Turniers. */
                        <div className={`flex h-full w-full items-center justify-center
                                         bg-gradient-to-br px-4 ${ART_FARBE[c.art]
                                           ?? 'from-zinc-800 to-zinc-900'}`}>
                          <span className="text-center text-sm font-bold uppercase
                                           tracking-wide text-white/80">
                            {c.titel}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />

                      <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                        {c.live ? (
                          <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px]
                                           font-bold uppercase tracking-wider text-white"><T>Live</T></span>
                        ) : c.naechsterStart ? (
                          <span className="rounded bg-sky-500/90 px-2 py-0.5 text-[10px]
                                           font-bold uppercase tracking-wider text-white">
                            {restzeit(c.naechsterStart, t)}
                          </span>
                        ) : c.letzterStart ? (
                          <span className="rounded bg-zinc-700/90 px-2 py-0.5 text-[10px]
                                           font-bold uppercase tracking-wider text-slate-200">
                            {vergangen(c.letzterStart, t)}
                          </span>
                        ) : null}
                        <span className="rounded bg-black/70 px-2 py-0.5 text-[10px]
                                         font-semibold uppercase tracking-wider text-slate-300">
                          <T>{ART_TEXT[c.art] ?? c.art}</T>
                        </span>
                      </div>
                      {!c.global && regionen.length > 1 && (
                        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5
                                         text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                          {regionen.length} <T>Regionen</T>
                        </span>
                      )}
                      {c.global && (
                        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5
                                         text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                          <T>global</T>
                        </span>
                      )}
                      {/* Kapitel und Season klein in die Ecke - im Titel
                          stoerten sie, hier ordnen sie ein. */}
                      {c.kapitel && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5
                                         py-0.5 text-[9px] font-semibold uppercase
                                         tracking-wider text-slate-400">
                          {c.kapitel}
                        </span>
                      )}
                    </div>

                    <div className="px-3 pb-3 pt-2">
                      <h3 className="truncate text-sm font-semibold text-slate-100">{c.titel}</h3>
                      <p className="truncate text-xs text-slate-500">{unterzeile(c, sprache, t)}</p>
                    </div>
                  </button>

                  {istOffen && (
                    <div className="max-h-60 overflow-y-auto border-t border-zinc-800 bg-zinc-950/80">
                      {regionen.map((r) => {
                        const liste = c.regionen[r];
                        const live = liste.find((x) => x.status === 'live');
                        const naechstes = liste.find((x) => x.status === 'kommt');
                        return (
                          <button key={r}
                            onClick={() => router.push(`/events/${c.id}?region=${r}`)}
                            className="flex w-full items-center justify-between gap-2 border-b
                                       border-zinc-900 px-3 py-2 text-left text-xs transition
                                       last:border-0 hover:bg-zinc-900">
                            <span className="flex items-center gap-2 text-slate-200">
                              {live && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                              {REGION_TEXT[r] ?? r}
                            </span>
                            <span className="text-slate-500">
                              {live ? t('läuft')
                                : naechstes ? restzeit(naechstes.begin, t)
                                : t('beendet')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!laedt && !cups.length && !fehler && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-slate-500">
            <T>Keine Cups in dieser Auswahl.</T>
            {modus !== 'alle' && <>
              {' '}<T>Unter „Alle“ stehen auch Ranked-, Mobile- und Skin-Cups.</T>
            </>}
          </p>
        )}
      </div>
    </main>
  );
}
