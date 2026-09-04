'use client';

// Die gewaehlte Sprache fuer die ganze Anwendung.
//
// Sie steht in einem Cookie, nicht im localStorage. Das ist keine
// Geschmacksfrage, sondern die Bedingung dafuer, dass es ueberhaupt
// funktioniert: Die Seiten werden auf dem Server vorgezeichnet, und der
// Server sieht keinen localStorage. Er haette also immer Deutsch geliefert,
// waehrend der Browser gleich darauf auf Englisch umgestellt haette - React
// nennt das eine Hydration-Abweichung und zeichnet den Baum neu.
//
// Ein Cookie schickt der Browser bei jeder Anfrage mit. Damit weiss der
// Server die Sprache schon beim Zeichnen, beide Seiten kommen zum selben
// Ergebnis, und es gibt weder eine Abweichung noch ein kurzes Aufblitzen der
// falschen Sprache.

import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { uebersetze, SPRACH_COOKIE, type Sprache } from '@/app/lib/sprache';

export { SPRACH_COOKIE };

interface Stand {
  sprache: Sprache;
  setzeSprache: (s: Sprache) => void;
  t: (text: string) => string;
}

const Zusammenhang = createContext<Stand | null>(null);

// Ohne Angabe englisch - dieselbe Voreinstellung wie im Layout.
export function SprachProvider({ anfang = 'en', children }: {
  /** Was im Cookie stand, vom Server gelesen. */
  anfang?: Sprache;
  children: React.ReactNode;
}) {
  const [sprache, setSpracheIntern] = useState<Sprache>(anfang);

  const router = useRouter();

  const setzeSprache = useCallback((s: Sprache) => {
    setSpracheIntern(s);
    // Ein Jahr Haltbarkeit, fuer die ganze Seite, und beim Verlassen der
    // Seite nicht mitgeschickt - es geht um eine Anzeigeeinstellung, nicht
    // um eine Anmeldung.
    document.cookie =
      `${SPRACH_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = s;

    /*
     * Den zwischengespeicherten Server-Stand wegwerfen.
     *
     * Next haelt zu jeder besuchten Adresse die vom Server gezeichnete
     * Fassung im Browser vor. Nach dem Umschalten lag dort noch die alte
     * Sprache: beim naechsten Aufruf einer solchen Seite kam ein deutscher
     * Serverstand an, waehrend der Browser laengst englisch dachte - React
     * meldete das als Hydration-Abweichung ("Alle Events" gegen "All
     * events"). Ein Auffrischen laesst die Serverbestandteile mit dem neuen
     * Cookie noch einmal zeichnen; der Zustand der Seite bleibt dabei.
     */
    router.refresh();
  }, [router]);

  const wert = useMemo<Stand>(() => ({
    sprache,
    setzeSprache,
    t: (text: string) => uebersetze(text, sprache),
  }), [sprache, setzeSprache]);

  return <Zusammenhang.Provider value={wert}>{children}</Zusammenhang.Provider>;
}

/**
 * Die Sprache lesen und umschalten.
 *
 * Ausserhalb des Providers - etwa in einem Stueck, das ohne ihn gerendert
 * wird - faellt es still auf Deutsch zurueck, statt die Seite mit einem
 * Fehler abzubrechen.
 */
export function useSprache(): Stand {
  const s = useContext(Zusammenhang);
  if (s) return s;
  return {
    sprache: 'en',
    setzeSprache: () => {},
    t: (text: string) => text,
  };
}

/** Nur die Uebersetzungsfunktion - der haeufigste Fall. */
export function useT() {
  return useSprache().t;
}

export default SprachProvider;
