'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { ARTEN, overlayAdresse, type OverlayEintrag } from './OverlayGeruest';

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

/**
 * Welche Cups zur Auswahl stehen.
 *
 * Der Betreiber: "Es wird nur als Option ausgewaehlt, die Cups, die heute an
 * diesem Tag live sind" - und inhaltlich nur Division 1, die Performance Cups
 * und die globalen Cups, jeweils Finals und Opens. Alles andere waere fuer
 * ein Stream-Overlay Beiwerk.
 *
 * Der Schalter darunter hebt die inhaltliche Einschraenkung auf, nicht die
 * zeitliche: laeuft ausnahmsweise etwas anderes, an dem er dransein will,
 * soll er nicht vor einer leeren Liste stehen.
 */
function passt(cup: Cup): boolean {
  const t = (cup.titel ?? '').toLowerCase();
  if (/division/.test(t)) return /division\s*1\b/.test(t);
  if (/performance/.test(t)) return true;
  if (cup.global) return true;
  if (/fncs/.test(t)) return true;
  return false;
}

export function CupWahl({ event, window: fenster, onWahl }: {
  event: string; window: string;
  onWahl: (event: string, window: string, titel: string) => void;
}) {
  const t = useT();
  const [cups, setCups] = useState<Cup[] | null>(null);
  const [alle, setAlle] = useState(false);

  useEffect(() => {
    fetch('/api/cup-catalog')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /** Jedes laufende Fenster als eigene Zeile - Cup, Region, Runde. */
  const laufend = useMemo(() => {
    const raus: Array<{
      eventId: string; windowId: string; region: string;
      titel: string; istFinale: boolean; cup: Cup;
    }> = [];
    for (const c of cups ?? []) {
      if (!alle && !passt(c)) continue;
      for (const liste of Object.values(c.regionen ?? {})) {
        for (const w of liste) {
          if (w.status !== 'live') continue;
          raus.push({
            eventId: w.eventId, windowId: w.windowId, region: w.region,
            titel: c.titel, istFinale: w.istFinale, cup: c,
          });
        }
      }
    }
    return raus.sort((a, b) => a.titel.localeCompare(b.titel)
      || a.region.localeCompare(b.region));
  }, [cups, alle]);

  return (
    <div>
      <label className="text-xs text-slate-400">
        <T>Cup — nur was gerade läuft</T>
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
              🔴 {w.titel} · {w.region}{w.istFinale ? ' · Finale' : ''}
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
          <T>Gerade läuft kein Cup. Die Auswahl füllt sich von selbst, sobald
          einer beginnt — das Overlay in OBS musst du dafür nicht anfassen.</T>
        </p>
      )}

      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
        <input type="checkbox" checked={alle}
          onChange={(e) => setAlle(e.target.checked)}
          className="accent-sky-500" />
        <T>auch die übrigen laufenden Cups</T>
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
