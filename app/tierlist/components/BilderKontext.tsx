'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die Tierlist mit oder ohne Fotos (Betreiber, 20.10.2026: "man soll zwischen Bild oder Nicht-Bild switchen koennen ... Pictures oder ohne Pictures, dass man das
 * wirklich ranken kann - fuer Solos, Duos und Trios").
 *
 * Mit Fotos wird aus jeder Namens-Kachel eine Foto-Kachel: je Spieler ein Foto (Gesicht mittig - die Ausrichtung setzt app/components/FotoFokus), der Name im Bild
 * unten, die Flagge oben links. Duos und Trios sind zwei und drei Fotos in einer Kachel. Wer kein Foto hat, zeigt eine Silhouette mit seinem Namen.
 *
 * Die Wahl merkt sich der Browser (nur eine Bequemlichkeit). Die Fotos holt dieser Kontext gesammelt ueber /api/spielerbild (POST), je Name einmal.
 */

interface Wert {
  bilder: boolean;
  setBilder: (an: boolean) => void;
  /** Die kleine Fassung des Fotos zum ersten Namen, der eines hat - oder null. */
  fotoFuer: (...namen: Array<string | undefined>) => string | null;
  /** Meldet Namen an, zu denen Fotos geholt werden sollen. */
  vormerken: (namen: Array<string | undefined>) => void;
}

const AUS: Wert = { bilder: false, setBilder: () => {}, fotoFuer: () => null, vormerken: () => {} };
const Kontext = createContext<Wert>(AUS);
export const useBilder = () => useContext(Kontext);

const MERKER = 'comphub-tierlist-bilder';
/** Name -> Foto-Adresse (klein) oder null; ueber alle Kacheln und Seitenaufrufe hinweg. */
const GEFUNDEN = new Map<string, string | null>();

export function BilderAnbieter({ children }: { children: React.ReactNode }) {
  const [bilder, setBilderRoh] = useState(false);
  const [, neuZeichnen] = useState(0);
  const warteschlange = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem(MERKER) === '1') setBilderRoh(true); } catch { /* ohne Speicher bleibt es aus */ }
  }, []);
  const setBilder = useCallback((an: boolean) => {
    setBilderRoh(an);
    try { localStorage.setItem(MERKER, an ? '1' : '0'); } catch { /* egal */ }
  }, []);

  const holen = useCallback(async () => {
    const namen = [...warteschlange.current]; warteschlange.current.clear();
    for (let i = 0; i < namen.length; i += 150) {
      const teil = namen.slice(i, i + 150);
      try {
        const r = await fetch('/api/spielerbild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: teil }) });
        const j = await r.json() as { bilder?: Record<string, string | null> };
        for (const n of teil) {
          const img = j.bilder?.[n] ?? null;
          let datei = '';
          if (img) { try { datei = decodeURIComponent(img.replace(/^\/spielerbilder\//, '')); } catch { datei = img.replace(/^\/spielerbilder\//, ''); } }
          GEFUNDEN.set(n, datei ? spielerbildKlein(datei) : null);
        }
      } catch { /* die Namen bleiben ohne Eintrag und werden beim naechsten Zeichnen noch einmal angemeldet */ }
    }
    neuZeichnen((x) => x + 1);
  }, []);

  const vormerken = useCallback((namen: Array<string | undefined>) => {
    let neu = false;
    for (const n of namen) {
      const s = (n ?? '').trim();
      if (s && !GEFUNDEN.has(s) && !warteschlange.current.has(s)) { warteschlange.current.add(s); neu = true; }
    }
    if (neu && !timer.current) timer.current = setTimeout(() => { timer.current = null; void holen(); }, 80);
  }, [holen]);

  const fotoFuer = useCallback((...namen: Array<string | undefined>) => {
    for (const n of namen) { const f = GEFUNDEN.get((n ?? '').trim()); if (f) return f; }
    return null;
  }, []);

  const wert = useMemo(() => ({ bilder, setBilder, fotoFuer, vormerken }), [bilder, setBilder, fotoFuer, vormerken]);
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

/** Der Umschalter "Bilder / Ohne Bilder" - sitzt bei den Modus-Knoepfen der Tierlist. */
export function BilderSchalter() {
  const { bilder, setBilder } = useBilder();
  const t = useT();
  return (
    <button type="button" aria-pressed={bilder} onClick={() => setBilder(!bilder)}
      title={t('Spieler mit Fotos oder nur mit Namen anzeigen')}
      className={`tierlist-button ${bilder ? 'tierlist-button-primary' : 'tierlist-button-secondary'}`}>
      {bilder ? t('Mit Bildern') : t('Ohne Bilder')}
    </button>
  );
}
