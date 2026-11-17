'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';

/*
 * Der Fotograf an jedem groesser gezeigten Spielerfoto (Betreiber, 16.11.2026) - aber nur, wenn die Angabe bestaetigt ist
 * (lib/fotoCredits.ts, /api/foto-credits liefert nur solche). Ohne bestaetigte Angabe steht am Foto nichts.
 *
 * Aussehen (Betreiber, 17.11.2026): eine kleine Pille OBEN MITTIG auf dem Foto, halbdurchsichtig dunkel, mit Kamera-Zeichen und dem X-Konto des
 * Fotografen ("@KonkolMichal"), verlinkt auf sein X-Profil. Bewusst anders als die Bildunterschrift unten rechts, die eine andere Seite benutzt.
 * Ohne X-Konto steht der Name des Fotografen (oder die Quelle) darin. Grosse Fotos (Profilkopf, grosse Karten) zeigen sie immer; mittlere
 * (kleine Karten) nur, solange die Maus darueber ist; kleine Kreise in Listen gar nicht.
 *
 * Wie FotoFokus: statt an jeder der vielen Stellen (Profilkopf, Spielerkarten, Rangliste ...) etwas einzubauen, sucht dieses Bauteil jedes <img> auf ein
 * Spielerfoto (/spielerbilder, /spielerbilder-klein) und legt unten rechts eine kleine Marke darueber. Nur auf Fotos, die mindestens 110 Pixel gross
 * gezeigt werden - an kleinen Kreisen in Listen waere sie unlesbar - und nicht auf verwischten Hintergrund-Kopien (aria-hidden).
 *
 * Liegt das Foto in einem Link oder Knopf (Spielerkarte), ist die Marke kein zweiter Link darin (das waere ungueltiges HTML), sondern oeffnet den Link
 * des Fotografen selbst und haelt den Klick von der Karte fern.
 */

type Credits = Record<string, { text: string; link?: string; handle?: string; fotograf?: string }>;
/** Ab dieser Groesse (kuerzere Seite, Pixel) steht die Marke immer da, darunter bis KLEIN nur beim Darueberfahren. */
const GROSS = 180;
const KLEIN = 110;
const KAMERA = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
  + 'stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>'
  + '<circle cx="12" cy="13.5" r="3.5"/></svg>';
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
        m.innerHTML = KAMERA;
        const s = document.createElement('span');
        s.textContent = text;
        s.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        m.appendChild(s);
        m.style.cssText = 'position:absolute;z-index:5;display:inline-flex;align-items:center;gap:4px;max-width:calc(100% - 16px);transform:translateX(-50%);'
          + 'padding:2px 8px 2px 7px;border-radius:999px;background:rgba(9,9,11,.62);border:1px solid rgba(255,255,255,.14);'
          + 'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);color:#fff;font:600 10.5px/15px system-ui,sans-serif;'
          + 'letter-spacing:.01em;pointer-events:auto;text-decoration:none;transition:opacity .15s;';
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
      // Oben mittig am Foto selbst, nicht am Rahmen (das Profilfoto fuellt nur die rechte Haelfte seiner Flaeche).
      const links = `${img.offsetLeft + img.offsetWidth / 2}px`;
      const oben = `${Math.max(0, img.offsetTop) + 6}px`;
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
