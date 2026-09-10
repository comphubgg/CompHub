'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ARTEN, overlayAdresse, type OverlayEintrag } from './OverlayGeruest';
import { useZugang } from '@/app/lib/zugang';
import {
  managerDarfCup, overlayCupErlaubt, overlayCupRang, overlayRegionRang,
  overlayZeitraumWeit,
} from '@/lib/overlayCups';

/*
 * Die Bausteine, die sich alle Overlay-Seiten teilen: die Cup-Auswahl, die
 * Liste der eigenen Overlays und ein paar Regler, die sonst auf jeder Seite
 * noch einmal geschrieben werden muessten.
 */

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number; istFinale: boolean;
}
interface Cup {
  id: string; titel: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
}

/*
 * Welche Cups zur Auswahl stehen, steht in lib/overlayCups.ts - dieselbe
 * Regel wie auf der Team-Karte. Hier war frueher eine zweite, etwas andere
 * Fassung; sie liess unter anderem jeden globalen Cup durch.
 *
 * Was der Schalter darunter aufhebt, ist nur die inhaltliche Einschraenkung.
 * Der Zeitraum bleibt: gestern, heute, morgen.
 */

/** Wie eine Zeile beschriftet wird - "läuft", "gestern", "morgen". */
function zeitwort(status: string, begin: number): string {
  if (status === 'live') return 'läuft';
  const tag = new Date(begin); tag.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const abstand = Math.round((tag.getTime() - heute.getTime()) / 86_400_000);
  if (abstand === 0) return 'heute';
  if (abstand === -1) return 'gestern';
  if (abstand === 1) return 'morgen';
  return '';
}

export function CupWahl({ event, window: fenster, onWahl, nurKommende = false }: {
  event: string; window: string;
  onWahl: (event: string, window: string, titel: string) => void;
  /**
   * Nur Spieltage, die noch nicht angefangen haben.
   *
   * Fuer den Countdown: auf einen Spieltag von gestern laesst sich nicht
   * zaehlen. Der Betreiber wollte das gar nicht erst anbieten - "man soll
   * keine vergangenen Cups auswaehlen koennen" - statt hinterher zu
   * erklaeren, warum die Vorschau leer bleibt.
   */
  nurKommende?: boolean;
}) {
  const t = useT();
  const zugang = useZugang();
  // Ein Manager waehlt nur, was gerade dran ist - siehe managerDarfCup().
  const nurLaufende = Boolean(zugang.verwaltet);
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [alle, setAlle] = useState(false);

  useEffect(() => {
    // "alle", damit auch der gestrige Spieltag mitkommt: die Voreinstellung
    // "aktuell" gibt nur Laufendes und Kommendes heraus.
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Jedes Fenster von gestern, heute und morgen als eigene Zeile.
   *
   * Frueher stand hier "nur was gerade laeuft". Der Betreiber: "Cup only when
   * it's running now - das kannst du entfernen. Wenn der Cup heute oder
   * gestern war, soll er trotzdem angezeigt werden." Eine Tabelle ist nach
   * dem Cup genauso interessant wie waehrenddessen, und zwischen zwei Runden
   * laeuft gerade gar nichts - dann stand die Liste leer da.
   */
  const laufend = useMemo(() => {
    /*
     * Eine Woche zurueck, zwei nach vorn - nicht nur gestern bis morgen.
     *
     * Der Betreiber: "wenn diese irgendwie live sind oder in der Zukunft
     * kommen oder gewesen sind, sollte die trotzdem zu sehen sein." Ein
     * Overlay entsteht oft Tage vor dem Spieltag, und die Tabelle eines Cups
     * von letzter Woche will er auch noch zeigen koennen.
     */
    const { von, bis } = overlayZeitraumWeit();
    const raus: Array<{
      eventId: string; windowId: string; region: string;
      titel: string; istFinale: boolean; wann: string; live: boolean; begin: number;
    }> = [];
    for (const c of cups ?? []) {
      if (!alle && !overlayCupErlaubt(c.titel)) continue;
      for (const liste of Object.values(c.regionen ?? {})) {
        for (const w of liste) {
          if (w.begin < von || w.begin > bis) continue;
          if (nurKommende && w.begin <= Date.now()) continue;
          if (nurLaufende
            && !managerDarfCup(w.begin, w.region, w.status === 'live')) continue;
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region: w.region,
            titel: c.titel, istFinale: w.istFinale,
            wann: zeitwort(w.status, w.begin), live: w.status === 'live',
            begin: w.begin,
          });
        }
      }
    }
    /*
     * Laufendes zuerst, dann nach Wichtigkeit.
     *
     * Vorher stand hier "dann das Neueste" - und damit lag ein Arena Test Cup
     * von heute ueber den Grand Finals von morgen. Der Betreiber wollte es
     * nach Wichtigkeit: die grossen Finals, Division 1, Solo-FNCS,
     * Performance, Cash und Victory; Europa vor dem Rest. Das Datum
     * entscheidet erst, wenn zwei Fenster gleich wichtig sind, und dann der
     * naehere zuerst.
     */
    /*
     * Nach Datum, nicht nach Cup.
     *
     * Vorher stand die Wichtigkeit vorn, und damit lagen die Spieltage
     * derselben Woche wild durcheinander. Der Betreiber wollte es zeitlich:
     * "es soll nicht nach Division Cup sortieren, sondern nach Datum." Was
     * laeuft, bleibt trotzdem ganz oben - das ist die Zeile, die er waehrend
     * eines Streams braucht.
     */
    const jetzt = Date.now();
    return raus.sort((a, b) => Number(b.live) - Number(a.live)
      || Math.abs(a.begin - jetzt) - Math.abs(b.begin - jetzt)
      || overlayRegionRang(a.region) - overlayRegionRang(b.region)
      || a.titel.localeCompare(b.titel));
  }, [cups, alle, nurLaufende, nurKommende]);

  /*
   * Kommt der Cup schon aus der Adresse?
   *
   * Die Startseite schickt ihn mit: /overlays/standings?event=…&fenster=…
   * Ohne diesen Griff muesste man ihn im Baukasten ein zweites Mal suchen,
   * und das war genau der Weg, den der Betreiber loswerden wollte.
   *
   * Nur einmal und nur, solange nichts gewaehlt ist - sonst spraenge die
   * Auswahl bei jeder Aenderung wieder zurueck.
   */
  const [ausAdresse, setAusAdresse] = useState(false);
  useEffect(() => {
    if (ausAdresse || fenster || !laufend.length) return;
    const p = new URLSearchParams(window.location.search);
    const w = p.get('fenster');
    if (!w) return;
    const treffer = laufend.find((x) => x.windowId === w);
    if (treffer) {
      onWahl(treffer.eventId, treffer.windowId, `${treffer.titel} · ${treffer.region}`);
      setAusAdresse(true);
    }
  }, [laufend, fenster, ausAdresse, onWahl]);

  return (
    <div>
      <label className="text-xs text-slate-400">
        <T>Cup — nach Datum geordnet</T>
        <select value={fenster}
          onChange={(e) => {
            const w = laufend.find((x) => x.windowId === e.target.value);
            if (w) onWahl(w.eventId, w.windowId, `${w.titel} · ${w.region}`);
            else onWahl('', '', '');
          }}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                     px-3 py-2 text-sm text-slate-100 outline-none
                     focus:border-sky-500">
          <option value="">{t('— auswählen —')}</option>
          {laufend.map((w) => (
            <option key={w.windowId} value={w.windowId}>
              {w.live ? '🔴 ' : ''}{w.titel} · {w.region}
              {w.istFinale ? ' · Finale' : ''}
              {' — '}
              {new Date(w.begin).toLocaleDateString('de-DE',
                { day: '2-digit', month: '2-digit' })}
              {w.wann ? ` (${t(w.wann)})` : ''}
            </option>
          ))}
        </select>
      </label>

      {/*
        * Eine leere Liste braucht eine Begruendung.
        *
        * Ausserhalb der Cup-Zeiten laeuft nichts, und ein leeres Auswahlfeld
        * sieht aus wie ein Fehler im Werkzeug.
        */}
      {cups && !laufend.length && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-500/80">
          <T>In diesen Tagen läuft kein passender Cup. Die Auswahl füllt sich
          von selbst, sobald einer ansteht — das Overlay in OBS musst du dafür
          nicht anfassen.</T>
        </p>
      )}

      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
        <input type="checkbox" checked={alle}
          onChange={(e) => setAlle(e.target.checked)}
          className="accent-sky-500" />
        <T>mehr — auch Ranked, Reload, Mobile und Arenas</T>
      </label>
      {event && (
        <p className="mt-1 truncate font-mono text-[10px] text-slate-700">
          {fenster}
        </p>
      )}
    </div>
  );
}

/** Ein Regler mit Beschriftung und Wert - auf jeder Seite dieselbe Form. */
export function Regler({ titel, wert, von, bis, schritt = 1, einheit, setzen }: {
  titel: string; wert: number; von: number; bis: number;
  schritt?: number; einheit?: string; setzen: (n: number) => void;
}) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="flex items-baseline justify-between gap-2">
        <T>{titel}</T>
        <span className="tabular-nums text-slate-300">
          {wert}{einheit ? ` ${einheit}` : ''}
        </span>
      </span>
      <input type="range" min={von} max={bis} step={schritt} value={wert}
        onChange={(e) => setzen(Number(e.target.value))}
        className="mt-1 w-full accent-sky-500" />
    </label>
  );
}

/** Eine Reihe Knoepfe, von denen genau einer gilt. */
export function Wahlreihe<W extends string | number>({ titel, wert, optionen, setzen }: {
  titel: string; wert: W;
  optionen: Array<{ wert: W; titel: string }>;
  setzen: (w: W) => void;
}) {
  return (
    <div className="text-xs text-slate-400">
      <T>{titel}</T>
      <div className="mt-1 flex flex-wrap gap-1">
        {optionen.map((o) => (
          <button key={String(o.wert)} type="button" onClick={() => setzen(o.wert)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              wert === o.wert
                ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
            <T>{o.titel}</T>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Die eigenen Overlays dieser Art.
 *
 * Jede Zeile traegt die Adresse, die in OBS gehoert - kopieren, einfuegen,
 * fertig. Sie aendert sich nie wieder.
 */
export function MeineListe({ liste, typ, offen, waehlen, entfernen }: {
  liste: OverlayEintrag[] | null;
  typ: string;
  offen: string | null;
  waehlen: (o: OverlayEintrag) => void;
  entfernen: (id: string) => void;
}) {
  const t = useT();
  const [kopiert, setKopiert] = useState<string | null>(null);

  const kopieren = async (id: string) => {
    try {
      await navigator.clipboard.writeText(overlayAdresse(typ, id));
      setKopiert(id);
      setTimeout(() => setKopiert(null), 1800);
    } catch { /* dann von Hand markieren */ }
  };

  if (!liste) {
    return <div className="h-20 animate-pulse rounded-xl bg-zinc-900/60" />;
  }

  if (!liste.length) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6
                    text-center text-[11px] text-slate-600">
        <T>Noch keins angelegt. Links einstellen und speichern.</T>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {liste.map((o) => (
        <div key={o.id}
          className={`rounded-xl border px-3 py-2.5 transition ${o.id === offen
            ? 'border-sky-600 bg-sky-950/20' : 'border-zinc-800 bg-zinc-950/60'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => waehlen(o)}
              className="min-w-0 flex-1 truncate text-left text-sm font-semibold
                         text-slate-200 hover:text-sky-400">
              {o.name}
            </button>
            <button onClick={() => kopieren(o.id)}
              className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-medium
                         text-white transition hover:bg-sky-400">
              {kopiert === o.id ? t('kopiert') : t('Adresse kopieren')}
            </button>
            <button onClick={() => entfernen(o.id)}
              title={t('entfernen')}
              className="rounded-lg border border-zinc-800 px-2 py-1 text-[11px]
                         text-slate-500 transition hover:border-rose-500/60
                         hover:text-rose-400">
              ×
            </button>
          </div>
          <code className="mt-1 block truncate text-[10px] text-slate-600">
            /overlay/{ARTEN.find((a) => a.schluessel === typ)?.datei}?id={o.id}
          </code>
        </div>
      ))}
    </div>
  );
}
