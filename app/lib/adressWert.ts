'use client';

/*
 * Ein Wert, der auch in der Adresse steht (Betreiber, 7.11.2026: "wenn ich auf Europa druecke, soll die URL sich aendern ... und das allgemein bei allen
 * Sachen, wo man was aendern kann"). Wie useState, nur dass der Wert nach dem Laden aus ?schluessel= kommt und jede Aenderung dort landet - ohne neuen
 * Eintrag im Verlauf. Der Standardwert steht nicht in der Adresse. Gelesen wird erst nach dem Aufbau, damit Server und Browser dasselbe zeichnen.
 */

import { useCallback, useEffect, useState } from 'react';

export function useAdressWert<T extends string>(schluessel: string, standard: T, erlaubt?: readonly T[]): [T, (v: T) => void] {
  const [wert, setWert] = useState<T>(standard);
  useEffect(() => {
    const roh = new URLSearchParams(window.location.search).get(schluessel);
    if (roh === null || (erlaubt && !erlaubt.includes(roh as T))) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWert(roh as T);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);
  const setze = useCallback((v: T) => {
    setWert(v);
    try {
      const u = new URL(window.location.href);
      if (v === standard || v === '') u.searchParams.delete(schluessel); else u.searchParams.set(schluessel, v);
      if (u.href !== window.location.href) window.history.replaceState(window.history.state, '', u.href);
    } catch { /* ohne Adresse bleibt die Auswahl trotzdem */ }
  }, [schluessel, standard]);
  return [wert, setze];
}
