'use client';

import { useEffect, useState } from 'react';

/** Ist der helle Modus der Seite an (Attribut data-modus am Wurzelelement, geschaltet vom Zahnrad)? Folgt jeder Umschaltung sofort. */
export function useHell(): boolean {
  const [hell, setHell] = useState(false);
  useEffect(() => {
    const lies = () => setHell(document.documentElement.dataset.modus === 'hell');
    lies();
    const beo = new MutationObserver(lies);
    beo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modus'] });
    return () => beo.disconnect();
  }, []);
  return hell;
}
