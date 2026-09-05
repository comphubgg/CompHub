'use client';

// Die Power Rankings.
//
// Epic fuehrt eine einzige weltweite Liste - keine Regionen. Die Adresse
// nimmt zwar einen Parameter dafuer entgegen, am Ergebnis aendert er nichts:
// in der angeblichen EU-Liste stehen sechsunddreissig Laender, angefuehrt von
// Spielern aus den Vereinigten Staaten. Reiter je Region waeren also eine
// Behauptung, die die Daten nicht hergeben.
//
// Die Spalten folgen dem Original: ganz links der Platz, direkt daneben die
// Veraenderung seit der letzten Fortschreibung, dann Flagge und Name, rechts
// die Wertung. Weiter rechts steht nichts mehr.
//
// Einen Knopf zum Aktualisieren gibt es bewusst nicht: erneuert wird einmal
// taeglich um ein Uhr im Hintergrund.

import { useCallback, useEffect, useMemo, useState } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import { ohneZierrat } from '@/lib/homoglyph';

import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
interface Spieler {
  rank: number;
  id: string;
  name: string;
  land: string;
  wertung: number;
  bestwert: number;
  deltaWertung: number;
  deltaPlatz: number;
}

interface Antwort {
  success: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  matched: number;
  total: number;
  fetchedAt: number;
  players: Spieler[];
  /** Noch nichts da - der Lauf ist angestossen. */
  holt?: boolean;
  error?: string;
}

/** Mehr als hundert Zeilen auf einer Seite werden unuebersichtlich. */
const ZEILEN_PRO_SEITE = [50, 100] as const;

function zahl(n: number) {
  return n.toLocaleString('de-DE');
}

/**
 * Wie lange ist der Stand her?
 *
 * Der Uebersetzer kommt als Parameter herein: die Funktion steht ausserhalb
 * der Komponente und darf keinen Hook rufen. Der Schluessel ist jeweils der
 * ganze Satz mit {n} statt der Zahl - "vor 3 Tagen" heisst auf Englisch
 * "3 days ago", das Wort wandert also ans andere Ende.
 */
function seitWann(ms: number, t: (s: string) => string) {
  if (!ms) return '';
  const mit = (satz: string, n: number) => t(satz).replace('{n}', String(n));
  const minuten = Math.round((Date.now() - ms) / 60_000);
  if (minuten < 2) return t('gerade eben');
  if (minuten < 60) return mit('vor {n} Minuten', minuten);
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) {
    return mit(stunden === 1 ? 'vor {n} Stunde' : 'vor {n} Stunden', stunden);
  }
  const tage = Math.round(stunden / 24);
  return mit(tage === 1 ? 'vor {n} Tag' : 'vor {n} Tagen', tage);
}

/**
 * Der Pfeil neben der Veraenderung.
 *
 * Ein gezeichneter Winkel, kein Zeichen aus dem Schriftsatz: "▲" ist ein
 * ausgefuelltes Dreieck, das je nach Schrift anders aussieht und immer etwas
 * klobig wirkt. Zwei Striche mit runden Enden geben denselben Hinweis und
 * bleiben ruhig - so macht es Epic auf seiner eigenen Seite auch.
 */
function Winkel({ hoch }: { hoch: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true"
      className="shrink-0 overflow-visible">
      <path d={hoch ? 'M4 15.5 12 7.5l8 8' : 'M4 8.5 12 16.5l8-8'}
        fill="none" stroke="currentColor" strokeWidth="3.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Die Veraenderung des Platzes seit der letzten Fortschreibung.
 *
 * Sie steht direkt neben dem Platz, weil sie genau dazu gehoert. Wer sich
 * nicht bewegt hat, bekommt einen Strich statt einer Null - das liest sich
 * ruhiger und laesst die echten Spruenge hervortreten.
 *
 * Die Farbe sitzt nur im Pfeil, nicht in der ganzen Flaeche. Eine gruen
 * unterlegte Pille neben jedem zweiten Platz zieht mehr Aufmerksamkeit auf
 * sich als der Platz selbst; ein dunkles, fast durchsichtiges Feld mit weisser
 * Zahl laesst die Spalte zurueckstehen, wo sie hingehoert. Gruen und Rot
 * bleiben, weil das Werkzeug dieses Paar ohnehin fuer "gut" und "schlecht"
 * fuehrt - Epics Gold und Violett waeren zwei weitere Farbtoene, und Gold
 * traegt hier schon die ersten drei Plaetze.
 */
function Veraenderung({ platz }: { platz: number }) {
  if (!platz) return <span className="text-slate-700">—</span>;
  const hoch = platz > 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05]
                     px-2 py-[3px] text-[11px] font-semibold tabular-nums
                     text-slate-200 ring-1 ring-inset ring-white/[0.06]">
      <span className={hoch ? 'text-emerald-400' : 'text-rose-400'}>
        <Winkel hoch={hoch} />
      </span>
      {zahl(Math.abs(platz))}
    </span>
  );
}

export default function PowerRankingsTable() {
  const t = useT();
  const [suche, setSuche] = useState('');
  const [proSeite, setProSeite] = useState<number>(ZEILEN_PRO_SEITE[0]);
  const [seite, setSeite] = useState(1);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const holen = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const p = new URLSearchParams({
        page: String(seite), pageSize: String(proSeite),
      });
      if (suche.trim()) p.set('q', suche.trim());
      const r = await fetch(`/api/power-rankings?${p}`, { cache: 'no-store' });
      const j = await r.json() as Antwort;
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Nicht ladbar');
      setDaten(j);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
    }
  }, [seite, proSeite, suche]);

  // Der Suchbegriff wird nicht bei jedem Tastendruck abgeschickt.
  useEffect(() => {
    const uhr = window.setTimeout(holen, suche ? 300 : 0);
    return () => window.clearTimeout(uhr);
  }, [holen, suche]);

  const seitenZahl = daten?.totalPages ?? 1;
  const seiteJetzt = Math.min(Math.max(1, seite), seitenZahl);

  /**
   * Welche Seitenzahlen stehen unter der Tabelle?
   *
   * Bei zweihundert Seiten kann nicht jede dastehen. Gezeigt werden Anfang,
   * Ende und die Umgebung der offenen Seite.
   */
  const leiste = useMemo(() => {
    const raus: Array<number | 'luecke'> = [];
    for (let i = 1; i <= seitenZahl; i++) {
      if (i === 1 || i === seitenZahl || Math.abs(i - seiteJetzt) <= 1) raus.push(i);
      else if (raus[raus.length - 1] !== 'luecke') raus.push('luecke');
    }
    return raus;
  }, [seitenZahl, seiteJetzt]);

  const spieler = daten?.players ?? [];

  return (
    // data-tour: Marken fuer die Fuehrung durch die Vorschau.
    <section data-tour="rankingsTable"
      className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b
                         border-zinc-800 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100"><T>Globale Bestenliste</T></h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {daten
              ? `${zahl(daten.total)} ${t('Spieler')}`
              : t('Wird geladen …')}
            {daten && daten.matched !== daten.total
              ? ` · ${zahl(daten.matched)} ${t('Treffer')}` : ''}
            {!!daten?.fetchedAt
              && ` · ${t('Stand')} ${seitWann(daten.fetchedAt, t)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input value={suche}
            onChange={(e) => { setSuche(e.target.value); setSeite(1); }}
            placeholder={t('Spieler suchen …')}
            className="w-56 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2
                       text-sm text-slate-100 outline-none placeholder:text-slate-600
                       focus:border-sky-500" />
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <T>Zeilen</T>
            <select value={proSeite}
              onChange={(e) => { setProSeite(+e.target.value); setSeite(1); }}
              className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-2
                         text-sm text-slate-200 outline-none focus:border-sky-500">
              {ZEILEN_PRO_SEITE.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </header>

      {fehler ? (
        <p className="p-8 text-center text-sm text-rose-400">{fehler}</p>
      ) : laedt && !spieler.length ? (
        <div className="space-y-1.5 p-4">
          {[...Array(12)].map((_, i) =>
            <div key={i} className="h-11 animate-pulse rounded bg-zinc-900/60" />)}
        </div>
      ) : daten?.holt ? (
        <p className="p-8 text-center text-sm text-slate-400">
          Die Rangliste wird gerade geholt — zehntausend Plätze in hundert
          Schritten. Das dauert einige Minuten; lade die Seite danach neu.
        </p>
      ) : !spieler.length ? (
        <p className="p-8 text-center text-sm text-slate-500">
          {suche ? `Kein Spieler gefunden für „${suche}“.` : 'Keine Daten.'}
        </p>
      ) : (
        <>
          {/*
            * Schmalere Polster auf dem Handy.
            *
            * Mit den urspruenglichen zwanzig Pixeln je Seite war die Tabelle
            * 416 Pixel breit - auf einem 375 Pixel breiten Telefon lag die
            * Spalte mit der Wertung damit ausserhalb des Bildes. Und eine
            * Rangliste ohne Wertung beantwortet genau die Frage nicht, wegen
            * der man sie aufschlaegt. Das overflow-x bleibt als Netz.
            */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase
                               tracking-wider text-slate-500">
                  <th className="w-14 px-2 py-3 text-right font-medium sm:w-20 sm:px-5"><T>Platz</T></th>
                  <th className="w-20 px-2 py-3 text-left font-medium sm:w-28 sm:px-3"><T>Veränderung</T></th>
                  <th className="px-2 py-3 text-left font-medium sm:px-3"><T>Spieler</T></th>
                  <th className="px-2 py-3 text-right font-medium sm:px-5"><T>PR-Wertung</T></th>
                </tr>
              </thead>
              <tbody>
                {spieler.map((s) => (
                  <tr key={`${s.rank}-${s.name}`}
                    className="border-b border-zinc-900 transition hover:bg-zinc-900/60">
                    <td className={`px-2 py-2.5 text-right text-base font-bold tabular-nums sm:px-5 ${
                      s.rank <= 3 ? 'text-amber-400' : 'text-sky-400'}`}>
                      {zahl(s.rank)}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3">
                      <Veraenderung platz={s.deltaPlatz} />
                    </td>
                    <td className="px-2 py-2.5 sm:px-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        {/* Wo Epic keine Herkunft fuehrt, steht die Weltkugel. */}
                        <TeamFlagge groesse={26} laender={[s.land || undefined]} />
                        {/* Angehaengte Zierzeichen fallen weg, wie ueberall
                            sonst auch: aus "AG Scroll 10ǃ" wird "AG Scroll
                            10". Der Orgtag bleibt - in einer Rangliste
                            gehoert er zum Namen. */}
                        <span className="truncate text-slate-200">
                          {ohneZierrat(s.name)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums
                                   text-slate-100 sm:px-5">
                      {zahl(s.wertung)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {seitenZahl > 1 && (
            <div data-tour="rankingsFooter"
              className="flex flex-wrap items-center justify-between gap-3
                         border-t border-zinc-900 px-4 py-3">
              <span className="text-xs text-slate-500">
                <T>Platz</T> {zahl((seiteJetzt - 1) * proSeite + 1)} <T>bis</T>{' '}
                {zahl(Math.min(seiteJetzt * proSeite, daten?.matched ?? 0))} <T>von</T>{' '}
                {zahl(daten?.matched ?? 0)}
              </span>

              <div className="flex flex-wrap items-center gap-1">
                <button onClick={() => setSeite(seiteJetzt - 1)}
                  disabled={seiteJetzt <= 1}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                             text-slate-300 transition hover:border-sky-500
                             disabled:cursor-not-allowed disabled:opacity-30">‹</button>
                {leiste.map((n, i) => (n === 'luecke' ? (
                  <span key={`l${i}`} className="px-1 text-xs text-slate-600">…</span>
                ) : (
                  <button key={n} onClick={() => setSeite(n)}
                    className={`min-w-9 rounded-lg border px-3 py-1.5 text-xs
                                tabular-nums transition ${n === seiteJetzt
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                    {n}
                  </button>
                )))}
                <button onClick={() => setSeite(seiteJetzt + 1)}
                  disabled={seiteJetzt >= seitenZahl}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                             text-slate-300 transition hover:border-sky-500
                             disabled:cursor-not-allowed disabled:opacity-30">›</button>
              </div>

              {seitenZahl > 5 && (
                <form className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const wert = new FormData(e.currentTarget).get('zuSeite');
                    const n = parseInt(String(wert ?? ''), 10);
                    if (Number.isFinite(n)) setSeite(Math.min(Math.max(1, n), seitenZahl));
                  }}>
                  <span className="text-xs text-slate-500"><T>Zu Seite</T></span>
                  <input name="zuSeite" inputMode="numeric" placeholder={String(seiteJetzt)}
                    className="w-16 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2
                               py-1.5 text-center text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  <button type="submit"
                    className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs
                               text-slate-300 transition hover:border-sky-500"><T>Los</T></button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
