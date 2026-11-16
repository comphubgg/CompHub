'use client';

/*
 * Das kleine Noble-Zeichen in der Ecke einer Kartenansicht - nur, wenn die Landepunkte von Noble Practice stammen (lib/nobleZeichen,
 * lib/kartenQuelle). Kein grosses Wasserzeichen (Noble Practice, 16.11.2026: die Formen werden leicht angepasst, lib/formVereinfachen);
 * das Zeichen und der Hinweis "Drop maps by Noble Practice" mit Link bleiben als Geste.
 */
import { NOBLE_DOMAIN, NOBLE_MARKE } from '@/lib/nobleZeichen';
import { NOBLE_ADRESSE, NOBLE_HINWEIS } from '@/lib/kartenQuelle';

export default function NobleWasserzeichen({ schildUnten = '2%' }: {
  /** Abstand des Zeichens vom unteren Rand (CSS), damit es ueber Knoepfen/Leisten steht. */
  schildUnten?: string;
} = {}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-noble-zeichen>
      <div className="absolute left-2 rounded bg-[#05080e]/60 px-1.5 py-0.5 text-[9px] leading-none text-white sm:left-3 sm:text-[10px]"
        style={{ bottom: schildUnten }}>
        <span className="font-extrabold tracking-wide">{NOBLE_MARKE}</span>
        <span className="font-semibold text-white/80"> · {NOBLE_DOMAIN}</span>
      </div>
    </div>
  );
}

/** Der Link-Hinweis "Drop maps by Noble Practice ↗" - oben links ueber der Karte, ausserhalb der Zoom-Ebene. */
export function NobleHinweis({ className = 'absolute left-2 top-2' }: { className?: string }) {
  return (
    <a href={NOBLE_ADRESSE} target="_blank" rel="noopener noreferrer"
      onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      className={`${className} z-30 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium text-slate-200 transition hover:bg-black/90`}>
      {NOBLE_HINWEIS} ↗
    </a>
  );
}
