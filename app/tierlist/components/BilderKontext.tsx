'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { spielerbildMini } from '@/lib/spielerbildKlein';
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

/*
 * Die Fotos fuer eine einzelne Kachel.
 *
 * Meldet ihre Namen zum Holen an und abonniert die Schübe. Zeichnet die
 * Kachel nur neu, wenn sich IHRE Fotos geaendert haben - so greift das
 * React.memo um die Kachel, und ein ankommendes Foto fuer irgendwen
 * zeichnet nicht die ganze Liste neu. Gibt je Teil die Foto-Adresse (klein)
 * oder null.
 */
export function useBilderFuer(teile: Array<{ anzeige?: string; roh?: string }>): Array<string | null> {
  const { bilder, fotoFuer, vormerken } = useBilder();
  const schluessel = teile.map((t) => `${t.anzeige ?? ''}|${t.roh ?? ''}`).join('||');
  const [, tick] = useState(0);
  const berechne = useCallback(
    () => teile.map((t) => (bilder ? fotoFuer(t.anzeige, t.roh) : null)),
    // teile steckt in schluessel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bilder, schluessel, fotoFuer],
  );
  const letzte = useRef<string>('');
  useEffect(() => {
    if (!bilder) return;
    vormerken(teile.flatMap((t) => [t.anzeige, t.roh]));
    letzte.current = JSON.stringify(berechne());
    const fn = () => {
      const neu = JSON.stringify(berechne());
      if (neu !== letzte.current) { letzte.current = neu; tick((x) => x + 1); }
    };
    HOERER.add(fn);
    return () => { HOERER.delete(fn); };
    // teile steckt in schluessel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilder, schluessel, vormerken, berechne]);
  return berechne();
}

const MERKER = 'comphub-tierlist-bilder';
/** Name -> Foto-Adresse (klein) oder null; ueber alle Kacheln und Seitenaufrufe hinweg. */
const GEFUNDEN = new Map<string, string | null>();
/*
 * Wer auf neu eingetroffene Fotos wartet.
 *
 * Frueher rief ein ankommender Schub `neuZeichnen` am Anbieter - und weil
 * der ueber dem ganzen Baum steht, zeichnete das alle Hunderte Kacheln neu,
 * bei jedem der Schuebe. Jetzt meldet sich jede Kachel selbst an; nach einem
 * Schub rechnet jede nur ihr eigenes Foto nach und zeichnet sich bloss dann
 * neu, wenn sich daran wirklich etwas geaendert hat. So bleibt die Liste
 * auch waehrend des Ladens fluessig (23.11.2026).
 */
const HOERER = new Set<() => void>();

export function BilderAnbieter({ children }: { children: React.ReactNode }) {
  const [bilder, setBilderRoh] = useState(false);
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
          // Ohne das Kennzeichen "?v=": mit ihm passte der Name nicht mehr auf die kleine Fassung, und aus dem Fragezeichen wurde eine Adresse, die es nicht gibt (6.11.2026: leere Kacheln).
          const pfad = (img ?? '').split('?')[0].replace(/^\/spielerbilder\//, '');
          if (pfad) { try { datei = decodeURIComponent(pfad); } catch { datei = pfad; } }
          // Die winzige Fassung (128 px) statt der 480er: die Tierlist-Kachel ist nur rund 48-96 px breit, und Hunderte 480er liessen die Liste rund eine Minute laden (23.11.2026).
          GEFUNDEN.set(n, datei ? spielerbildMini(datei) : null);
        }
      } catch { /* die Namen bleiben ohne Eintrag und werden beim naechsten Zeichnen noch einmal angemeldet */ }
      // Nach jedem Schub die wartenden Kacheln wecken - nicht erst am Ende,
      // damit die ersten Fotos sofort erscheinen, nicht erst nach allen.
      for (const fn of HOERER) fn();
    }
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

/** Der Umschalter "Bilder / Ohne Bilder": ein kleines Zeichen rechts neben der Suche (Betreiber, 20.10.2026: "das Profil an/aus daneben, so klein ein Zeichen"). */
export function BilderSchalter() {
  const { bilder, setBilder } = useBilder();
  const t = useT();
  return (
    <button type="button" aria-pressed={bilder} onClick={() => setBilder(!bilder)} className="bilder-icon"
      title={bilder ? t('Fotos an - zum Ausschalten klicken') : t('Fotos aus - zum Einschalten klicken')}
      aria-label={t('Spieler mit Fotos oder nur mit Namen anzeigen')}>
      {/* Das uebliche Bild-Zeichen (Rahmen, Sonne, Berg) - ohne Fotos mit einem Strich quer darueber: das Standardzeichen fuer "keine Bilder" (Betreiber, 26.10.2026: "nicht die Person, sondern das normale No-Picture-Zeichen"). */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="M21 16l-5-5-8 9" />
        {!bilder && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}

/** Die frühere breite Fassung - nicht mehr eingebaut. */
export function BilderSchalterBreit() {
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
