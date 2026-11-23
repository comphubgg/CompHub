'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TierKey } from '../types';

/*
 * Ziehen mit dem Zeiger (Pointer Events) statt mit HTML5-Drag.
 *
 * Warum nicht mehr HTML5-Drag: das native Ablegen war unzuverlaessig - mal
 * fiel die Kachel in die Stufe, mal "wollte sie einfach nicht rein". Es
 * haengt am genauen Zeichentakt (der gezogene Wert steht erst im naechsten
 * Bild), bricht ab, sobald zwischendurch neu gezeichnet wird (etwa weil
 * gerade Fotos ankommen), und auf dem Handy gibt es gar kein HTML5-Drag.
 *
 * Pointer Events kennen diese Schwaechen nicht: ein pointerdown auf einer
 * Kachel, ab ein paar Pixeln Bewegung ein Zug mit einem mitlaufenden Abbild,
 * beim pointerup wird unter dem Zeiger das Ziel gesucht (Stufe oder Pool) und
 * die Kachel dorthin gesetzt. Ein pointerdown/-up ohne Bewegung ist ein
 * Klick - auf einer eingestuften Kachel heisst das: zurueck in den Pool.
 * Dasselbe Verfahren traegt Maus, Stift und Finger.
 *
 * Schnell bleibt es, weil das Abbild unmittelbar ueber den Stil bewegt wird
 * (kein Neuzeichnen je Mausschritt) und sich der Zustand nur aendert, wenn
 * sich wirklich die hervorgehobene Stufe wechselt.
 */

export type ZielBereich = TierKey | 'pool' | null;

interface Args {
  /** Die eine Setz-Funktion: Stufe (oder null = Pool) und die Kachel, vor der eingefuegt wird (oder null = ans Ende). */
  platziere: (id: string, stufe: TierKey | null, vorId: string | null) => void;
  /** Ein Klick ohne Zug auf eine Kachel - bereich sagt, woher sie kommt. */
  klick: (id: string, bereich: 'stufe' | 'pool') => void;
  /** Ganz aus, etwa fuer Gaeste in der Vorschau. */
  aus?: boolean;
}

const SCHWELLE = 6; // Pixel Bewegung, ab denen aus dem Klick ein Zug wird.

export function useZeigerZiehen({ platziere, klick, aus = false }: Args) {
  const [ziehId, setZiehId] = useState<string | null>(null);
  const [zielStufe, setZielStufe] = useState<ZielBereich>(null);

  const lauf = useRef<{
    id: string; bereich: 'stufe' | 'pool';
    x0: number; y0: number; gx: number; gy: number;
    ziehen: boolean; geist: HTMLElement | null; quelle: HTMLElement;
  } | null>(null);

  // Die Zeiger-Id steckt beim Ablegen unter dem Zeiger - das Abbild selbst
  // darf nicht treffen, sonst faende elementFromPoint nur sich.
  const zielBei = (x: number, y: number, ziehId: string): { stufe: TierKey | null; vorId: string | null } | null => {
    const unten = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!unten) return null;
    const stufeEl = unten.closest('[data-stufe]');
    const poolEl = unten.closest('[data-pool]');
    const behaelter = stufeEl ?? poolEl;
    if (!behaelter) return null;
    const stufe = stufeEl ? (stufeEl.getAttribute('data-stufe') as TierKey) : null;
    // Vor welche Kachel? Die erste, deren Mitte hinter dem Zeiger liegt
    // (gleiche Zeile und rechts davon, oder eine Zeile tiefer).
    let vorId: string | null = null;
    const kacheln = Array.from(behaelter.querySelectorAll<HTMLElement>('[data-id]'));
    for (const k of kacheln) {
      if (k.getAttribute('data-id') === ziehId) continue;
      const r = k.getBoundingClientRect();
      if (y < r.top) { vorId = k.getAttribute('data-id'); break; }
      if (y <= r.bottom && x < r.left + r.width / 2) { vorId = k.getAttribute('data-id'); break; }
    }
    return { stufe, vorId };
  };

  const bewegenRef = useRef<(e: PointerEvent) => void>(() => {});
  const endeRef = useRef<(e: PointerEvent) => void>(() => {});
  // Stabile Hüllen, damit removeEventListener dieselbe Kennung bekommt.
  const bewegen = useRef((e: PointerEvent) => bewegenRef.current(e)).current;
  const ende = useRef((e: PointerEvent) => endeRef.current(e)).current;

  const aufraeumen = useCallback(() => {
    window.removeEventListener('pointermove', bewegen);
    window.removeEventListener('pointerup', ende);
    window.removeEventListener('pointercancel', ende);
    const l = lauf.current;
    if (l?.geist) l.geist.remove();
    document.body.style.userSelect = '';
    lauf.current = null;
  }, [bewegen, ende]);

  // Die aktuellen Fassungen von bewegen/ende in den Refs halten - und zwar
  // nach dem Zeichnen (useEffect), nicht waehrend. So bleiben die beim
  // Fenster angemeldeten Huellen dieselben, waehrend ihr Inneres stets die
  // frischen platziere/klick/zielBei kennt.
  useEffect(() => {
    endeRef.current = (e: PointerEvent) => {
      const l = lauf.current;
      if (!l) { aufraeumen(); return; }
      const gezogen = l.ziehen;
      const id = l.id, bereich = l.bereich;
      aufraeumen();
      setZiehId(null);
      setZielStufe(null);
      if (gezogen) {
        const ziel = zielBei(e.clientX, e.clientY, id);
        if (ziel) platziere(id, ziel.stufe, ziel.vorId);
      } else {
        klick(id, bereich);
      }
    };
    bewegenRef.current = (e: PointerEvent) => {
      const l = lauf.current;
      if (!l) return;
      if (!l.ziehen) {
        if (Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < SCHWELLE) return;
        l.ziehen = true;
        setZiehId(l.id);
        document.body.style.userSelect = 'none';
        const g = l.quelle.cloneNode(true) as HTMLElement;
        const r = l.quelle.getBoundingClientRect();
        g.style.position = 'fixed';
        g.style.left = '0';
        g.style.top = '0';
        g.style.width = `${r.width}px`;
        g.style.height = `${r.height}px`;
        g.style.margin = '0';
        g.style.pointerEvents = 'none';
        g.style.opacity = '0.85';
        g.style.zIndex = '99999';
        g.style.transform = `translate(${e.clientX - l.gx}px, ${e.clientY - l.gy}px) rotate(2deg)`;
        g.style.boxShadow = '0 12px 30px rgba(0,0,0,0.6)';
        g.classList.add('zieh-abbild');
        document.body.appendChild(g);
        l.geist = g;
      }
      if (l.geist) {
        l.geist.style.transform = `translate(${e.clientX - l.gx}px, ${e.clientY - l.gy}px) rotate(2deg)`;
      }
      const ziel = zielBei(e.clientX, e.clientY, l.id);
      const neu: ZielBereich = ziel ? (ziel.stufe ?? 'pool') : null;
      setZielStufe((vorher) => (vorher === neu ? vorher : neu));
    };
  });

  useEffect(() => () => aufraeumen(), [aufraeumen]);

  /** An jede Kachel: onPointerDown. Die Kachel traegt data-id und data-bereich. */
  const beginnen = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (aus || e.button !== 0) return;
    const ziel = e.target as HTMLElement;
    // Knoepfe, Felder und das Bearbeiten-Fenster ziehen nicht.
    if (ziel.closest('button, input, textarea, a, [data-no-drag]')) return;
    const el = e.currentTarget;
    const id = el.getAttribute('data-id');
    const bereich = el.getAttribute('data-bereich') as 'stufe' | 'pool' | null;
    if (!id || !bereich) return;
    const r = el.getBoundingClientRect();
    lauf.current = {
      id, bereich,
      x0: e.clientX, y0: e.clientY,
      gx: e.clientX - r.left, gy: e.clientY - r.top,
      ziehen: false, geist: null, quelle: el,
    };
    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
  }, [aus, bewegen, ende]);

  return { beginnen, ziehId, zielStufe };
}
