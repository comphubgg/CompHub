'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Overlay loeschen - und wieder zurueckholen.
 *
 * Der Server merkt ein geloeschtes Overlay nur vor (sieben Tage lang), die
 * Kennung und damit die Adresse in OBS bleibt also erhalten. Dieses Teil ist
 * allen Listen gemeinsam: "Meine Overlays" und die Listen in den Baukaesten
 * zeigen denselben Hinweis, dieselbe Liste "Zuletzt gelöscht" und dieselben
 * Fehler. Der Stand liegt deshalb ausserhalb der Bauteile; jede Liste lauscht
 * auf `version` und laedt sich neu, sobald etwas geloescht oder
 * wiederhergestellt wurde.
 */

const SCHNITTSTELLE = '/api/overlay-config';
/** Wie lange "Rückgängig" nach dem Loeschen angeboten wird. */
const HINWEIS_MS = 10_000;

export interface GeloeschtesOverlay {
  id: string; typ: string; name: string; geloeschtAm: number;
}

interface Stand {
  hinweis: { id: string; typ: string; name: string } | null;
  fehler: { art: 'loeschen' | 'wiederherstellen'; status: number; typ: string } | null;
  version: number;
}

let stand: Stand = { hinweis: null, fehler: null, version: 0 };
const hoerer = new Set<() => void>();
let hinweisUhr: ReturnType<typeof setTimeout> | null = null;

function setze(neu: Partial<Stand>) {
  stand = { ...stand, ...neu };
  hoerer.forEach((h) => h());
}
const abonnieren = (h: () => void) => { hoerer.add(h); return () => { hoerer.delete(h); }; };
const aktuell = () => stand;

/** Der Stand der Loesch-Leiste; `version` aendert sich nach jedem Loeschen/Wiederherstellen. */
export function useLoeschStand(): Stand {
  return useSyncExternalStore(abonnieren, aktuell, aktuell);
}

async function senden(id: string, aktion: 'loeschen' | 'wiederherstellen'): Promise<number> {
  try {
    const r = await fetch(SCHNITTSTELLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [aktion]: true }),
    });
    return r.status;
  } catch {
    return 0; // keine Verbindung
  }
}

export async function overlayLoeschen(o: { id: string; typ: string; name: string }): Promise<boolean> {
  if (hinweisUhr) clearTimeout(hinweisUhr);
  setze({ hinweis: null, fehler: null });
  const status = await senden(o.id, 'loeschen');
  if (status < 200 || status >= 300) {
    setze({ fehler: { art: 'loeschen', status, typ: o.typ }, version: stand.version + 1 });
    return false;
  }
  setze({ hinweis: { id: o.id, typ: o.typ, name: o.name }, version: stand.version + 1 });
  hinweisUhr = setTimeout(() => setze({ hinweis: null }), HINWEIS_MS);
  return true;
}

export async function overlayWiederherstellen(o: { id: string; typ: string }): Promise<boolean> {
  if (hinweisUhr) clearTimeout(hinweisUhr);
  setze({ fehler: null });
  const status = await senden(o.id, 'wiederherstellen');
  if (status < 200 || status >= 300) {
    setze({ fehler: { art: 'wiederherstellen', status, typ: o.typ }, version: stand.version + 1 });
    return false;
  }
  setze({ hinweis: null, version: stand.version + 1 });
  return true;
}

/**
 * Hinweis nach dem Loeschen, Fehlermeldung und die Liste "Zuletzt gelöscht".
 *
 * @param typ Wenn gesetzt, nur Overlays dieser Art.
 */
export default function LoeschLeiste({ typ = '' }: { typ?: string }) {
  const t = useT();
  const { hinweis, fehler, version } = useLoeschStand();
  const [liste, setListe] = useState<GeloeschtesOverlay[]>([]);

  useEffect(() => {
    let aktiv = true;
    fetch(`${SCHNITTSTELLE}?geloescht=1`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (aktiv) setListe(j.geloescht ?? []); })
      .catch(() => { if (aktiv) setListe([]); });
    return () => { aktiv = false; };
  }, [version]);

  const sichtbar = typ ? liste.filter((o) => o.typ === typ) : liste;
  const meinHinweis = hinweis && (!typ || hinweis.typ === typ) ? hinweis : null;
  const meinFehler = fehler && (!typ || fehler.typ === typ) ? fehler : null;
  if (!meinHinweis && !meinFehler && !sichtbar.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {meinHinweis && (
        <div role="status"
          className="flex items-center gap-3 rounded-xl border border-zinc-700
                     bg-zinc-900/80 px-3 py-2 text-[11px] text-slate-300">
          <span className="min-w-0 flex-1 truncate">
            <T>Overlay gelöscht</T>{meinHinweis.name ? `: ${meinHinweis.name}` : ''}
          </span>
          <button onClick={() => void overlayWiederherstellen(meinHinweis)}
            className="rounded-lg bg-sky-500 px-3 py-1 text-[11px] font-medium
                       text-white hover:bg-sky-400">
            <T>Rückgängig</T>
          </button>
        </div>
      )}

      {meinFehler && (
        <p role="alert"
          className="rounded-xl border border-rose-500/50 bg-rose-950/30 px-3 py-2
                     text-[11px] font-medium text-rose-300">
          {meinFehler.art === 'loeschen' ? t('Nicht gelöscht') : t('Nicht wiederhergestellt')}
          {' – '}
          {meinFehler.status ? `HTTP ${meinFehler.status}` : t('Keine Verbindung')}
        </p>
      )}

      {sichtbar.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <T>Zuletzt gelöscht</T>
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {sichtbar.map((o) => (
              <li key={o.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
                  {o.name}
                </span>
                <button onClick={() => void overlayWiederherstellen(o)}
                  className="rounded-lg bg-sky-500 px-3 py-1 text-[11px] font-medium
                             text-white hover:bg-sky-400">
                  <T>Wiederherstellen</T>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
