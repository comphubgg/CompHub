'use client';

import { useEffect } from 'react';
import { fokusVon } from '@/lib/fotoFokus';

/*
 * Richtet jedes Spielerfoto auf der Seite auf das Gesicht aus (Betreiber, 14.10.2026: "du musst gucken, dass jeder immer mittig ist - bei dem einen
 * erkennt man die Person gut, beim anderen fehlt der Kopf").
 *
 * Wo ein Foto in einen Rahmen mit anderem Seitenverhaeltnis kommt, schneidet der Browser es aus. Statt an jedem der vielen Orte den Ausschnitt von Hand zu
 * setzen, setzt dieses Bauteil fuer jedes <img> auf ein Spielerfoto (/spielerbilder, /spielerbilder-klein) die "object-position" aus der Tafel von
 * scripts/foto-fokus.py - auch fuer Bilder, die spaeter nachgeladen werden. Es zeichnet selbst nichts.
 */
export default function FotoFokus() {
  useEffect(() => {
    const setze = (img: HTMLImageElement) => {
      const src = img.getAttribute('src') ?? '';
      if (!/\/spielerbilder(-klein)?\//.test(src)) return;
      const p = fokusVon(src);
      if (img.style.objectPosition !== p) img.style.objectPosition = p;
    };
    const alle = () => document.querySelectorAll<HTMLImageElement>('img[src*="/spielerbilder"]').forEach(setze);
    alle();
    let r = 0;
    const beobachter = new MutationObserver(() => { cancelAnimationFrame(r); r = requestAnimationFrame(alle); });
    beobachter.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
    return () => { beobachter.disconnect(); cancelAnimationFrame(r); };
  }, []);
  return null;
}
