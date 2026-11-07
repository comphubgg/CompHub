'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/*
 * Ein Seitenwechsel darf nicht haengen bleiben (Betreiber, 7.11.2026: "wenn ich unter Tierlist bin und auf Ranking druecke, geht es einfach nicht auf die
 * Seite"). Nachstellen liess es sich nicht - sechs Wechsel brauchten je rund 0,1 s. Am wahrscheinlichsten trifft es Klicks waehrend einer Veroeffentlichung,
 * wenn der Server kurz neu startet. Deshalb: kommt ein Wechsel ueber einen Verweis der eigenen Seite nach vier Sekunden nicht an, laedt der Browser das
 * Ziel ganz neu. Das kostet im Normalfall nichts, die Wache wird beim Ankommen sofort abgebaut.
 */
export default function SeitenwechselWache() {
  const pfad = usePathname();
  useEffect(() => {
    let uhr: ReturnType<typeof setTimeout> | null = null;
    const klick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.('a');
      if (!a || a.target || a.hasAttribute('download')) return;
      const ziel = new URL(a.href, location.href);
      if (ziel.origin !== location.origin || ziel.pathname === location.pathname) return;
      if (uhr) clearTimeout(uhr);
      uhr = setTimeout(() => { if (location.pathname !== ziel.pathname) location.assign(ziel.href); }, 4000);
    };
    document.addEventListener('click', klick, true);
    return () => { document.removeEventListener('click', klick, true); if (uhr) clearTimeout(uhr); };
  }, [pfad]);
  return null;
}
