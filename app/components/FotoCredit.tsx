'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';

/*
 * Der kleine Credit am einzelnen Spielerfoto - nur noch fuer kleine Quellen (Betreiber, 17.11.2026, lib/fotoQuellen.ts): grosse, wiederkehrende Quellen
 * (Fortnite Competitive / Epic Games, Esports World Cup, die Event-Fotografen) stehen nur in der Liste "Photos from" (app/components/FotoQuellen.tsx);
 * am Foto bleibt nur, wer weniger als zwei oeffentliche Fotos hat - typisch das X-Konto einer Org (f1shyx -> @glore_gg) - oder "einzeln" traegt.
 * /api/foto-credits liefert nur diese.
 *
 * Aussehen: ein kleines Schild UNTEN LINKS im Foto, halbdurchsichtig schwarz, helle Schrift in der Seitenschrift, leicht abgerundet, nur das X-Konto
 * (oder der Name). Grosse Fotos (Profilkopf, grosse Karten) zeigen es immer; mittlere (kleine Karten) nur beim Darueberfahren; kleine Kreise gar nicht.
 *
 * Wie FotoFokus: statt an jeder der vielen Stellen etwas einzubauen, sucht dieses Bauteil jedes <img> auf ein Spielerfoto (/spielerbilder,
 * /spielerbilder-klein) und legt das Schild darueber - nicht auf verwischten Hintergrund-Kopien (aria-hidden) und nicht in [data-ohne-foto-credit].
 *
 * Liegt das Foto in einem Link oder Knopf (Spielerkarte), ist das Schild kein zweiter Link darin (das waere ungueltiges HTML), sondern oeffnet den Link
 * selbst und haelt den Klick von der Karte fern.
 */

type Credits = Record<string, { text: string; link?: string; handle?: string; fotograf?: string }>;
/** Ab dieser Groesse (kuerzere Seite, Pixel) steht die Marke immer da, darunter bis KLEIN nur beim Darueberfahren. */
const GROSS = 180;
const KLEIN = 110;
let geladen: Promise<Credits> | null = null;
const holen = () => (geladen ??= fetch('/api/foto-credits').then((r) => (r.ok ? r.json() : { credits: {} }))
  .then((j: { credits?: Credits }) => j.credits ?? {}).catch(() => ({})));

const MARKE = 'data-foto-credit';

function stammVon(src: string): string {
  const datei = src.split('?')[0].split('/').pop() ?? '';
  let d = datei;
  try { d = decodeURIComponent(datei); } catch { /* bleibt */ }
  return d.replace(/\.(jpe?g|png|webp)$/i, '').toLowerCase();
}

export default function FotoCredit() {
  const t = useT();
  const [credits, setCredits] = useState<Credits | null>(null);
  useEffect(() => { let weg = false; holen().then((c) => { if (!weg) setCredits(c); }); return () => { weg = true; }; }, []);

  useEffect(() => {
    if (!credits || !Object.keys(credits).length) return;
    const marken = new Map<HTMLImageElement, HTMLElement>();
    const wort = t('Foto');
    /** Mittlere Fotos: die Marke erscheint beim Darueberfahren - je Rahmen ein Paar Zuhoerer. */
    const schweben = new Map<HTMLElement, () => void>();
    const schwebenAus = (rahmen: HTMLElement) => { schweben.get(rahmen)?.(); schweben.delete(rahmen); };

    const entfernen = (img: HTMLImageElement) => {
      const m = marken.get(img);
      if (m?.parentElement) schwebenAus(m.parentElement);
      m?.remove(); marken.delete(img);
    };
    const setze = (img: HTMLImageElement) => {
      const c = credits[stammVon(img.getAttribute('src') ?? '')];
      const op = img.offsetParent as HTMLElement | null;
      const rahmen = op && op !== document.body && getComputedStyle(op).position !== 'static' ? op : null;
      const seite = Math.min(img.offsetWidth, img.offsetHeight);
      if (!c || !rahmen || seite < KLEIN || img.getAttribute('aria-hidden') === 'true' || img.closest('[data-ohne-foto-credit]')) { entfernen(img); return; }
      const immer = seite >= GROSS;
      let m = marken.get(img);
      const text = c.handle ? `@${c.handle}` : (c.fotograf || c.text);
      if (!m || m.parentElement !== rahmen || m.dataset.text !== text) {
        if (m?.parentElement) schwebenAus(m.parentElement);
        m?.remove();
        const imKlickbaren = Boolean(img.closest('a, button'));
        m = document.createElement(c.link && !imKlickbaren ? 'a' : 'span');
        m.setAttribute(MARKE, '');
        m.dataset.text = text;
        m.setAttribute('aria-label', `${wort}: ${c.text}`);
        m.textContent = text;
        m.style.cssText = 'position:absolute;z-index:5;display:block;max-width:calc(100% - 12px);transform:translateY(-100%);'
          + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,.55);'
          + 'color:rgba(241,245,249,.88);font-family:inherit;font-size:9.5px;line-height:14px;font-weight:500;letter-spacing:.01em;'
          + 'pointer-events:auto;text-decoration:none;transition:opacity .15s,color .15s;';
        const schild = m;
        schild.addEventListener('mouseenter', () => { schild.style.color = '#fff'; });
        schild.addEventListener('mouseleave', () => { schild.style.color = 'rgba(241,245,249,.88)'; });
        if (c.link) {
          const ziel = c.link;
          if (m instanceof HTMLAnchorElement) { m.href = ziel; m.target = '_blank'; m.rel = 'noopener noreferrer'; } else {
            m.setAttribute('role', 'link'); m.tabIndex = 0; m.style.cursor = 'pointer';
            const oeffnen = (e: Event) => { e.preventDefault(); e.stopPropagation(); window.open(ziel, '_blank', 'noopener,noreferrer'); };
            m.addEventListener('click', oeffnen);
            m.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') oeffnen(e); });
          }
          m.title = c.link;
        }
        rahmen.appendChild(m);
        marken.set(img, m);
      }
      // Unten links am Foto selbst, nicht am Rahmen (das Profilfoto fuellt nur die rechte Haelfte seiner Flaeche).
      const links = `${img.offsetLeft + 6}px`;
      const oben = `${img.offsetTop + img.offsetHeight - 6}px`;
      if (m.style.left !== links) m.style.left = links;
      if (m.style.top !== oben) m.style.top = oben;
      const marke = m;
      if (immer) {
        schwebenAus(rahmen);
        if (marke.style.opacity !== '1') { marke.style.opacity = '1'; marke.style.pointerEvents = 'auto'; }
      } else if (!schweben.has(rahmen)) {
        const an = () => { marke.style.opacity = '1'; marke.style.pointerEvents = 'auto'; };
        const aus = () => { marke.style.opacity = '0'; marke.style.pointerEvents = 'none'; };
        aus();
        rahmen.addEventListener('mouseenter', an);
        rahmen.addEventListener('mouseleave', aus);
        rahmen.addEventListener('focusin', an);
        rahmen.addEventListener('focusout', aus);
        schweben.set(rahmen, () => {
          rahmen.removeEventListener('mouseenter', an); rahmen.removeEventListener('mouseleave', aus);
          rahmen.removeEventListener('focusin', an); rahmen.removeEventListener('focusout', aus);
        });
      }
    };
    const alle = () => {
      const jetzt = new Set(document.querySelectorAll<HTMLImageElement>('img[src*="/spielerbilder"]'));
      for (const img of [...marken.keys()]) if (!jetzt.has(img) || !img.isConnected) entfernen(img);
      jetzt.forEach(setze);
    };
    alle();
    let r = 0;
    const neu = () => { cancelAnimationFrame(r); r = requestAnimationFrame(alle); };
    const beobachter = new MutationObserver((liste) => {
      // Die eigenen Marken loesen nichts aus - sonst liefe das im Kreis.
      if (liste.every((m) => (m.target as Element).hasAttribute?.(MARKE) || [...m.addedNodes, ...m.removedNodes].every((n) => (n as Element).hasAttribute?.(MARKE)) && m.type === 'childList')) return;
      neu();
    });
    beobachter.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });
    window.addEventListener('resize', neu);
    // Bilder, die erst spaeter ihre Groesse bekommen (Laden), und Wechsel ohne DOM-Aenderung.
    document.addEventListener('load', neu, true);
    return () => {
      beobachter.disconnect(); cancelAnimationFrame(r);
      window.removeEventListener('resize', neu); document.removeEventListener('load', neu, true);
      for (const m of marken.values()) m.remove();
      for (const weg of schweben.values()) weg();
    };
  }, [credits, t]);

  return null;
}
