'use client';

/*
 * Das kleine Noble-Zeichen in der Ecke einer Kartenansicht - nur, wenn die Landepunkte von Noble Practice stammen (lib/nobleZeichen,
 * lib/kartenQuelle). Kein grosses Wasserzeichen (Noble Practice, 16.11.2026: die Formen werden leicht angepasst, lib/formVereinfachen);
 * das kleine Zeichen bleibt als Geste. Den Link-Hinweis "Drop maps by Noble Practice" gibt es nicht mehr (Betreiber, 16.11.2026).
 */
import { NOBLE_DOMAIN, NOBLE_MARKE } from '@/lib/nobleZeichen';

const AUS = true;

export default function NobleWasserzeichen() {
  // Abgeschaltet (Betreiber, 17.11.2026: "entferne das fuer immer"; Noble: nach angepassten Formen kein Wasserzeichen noetig).
  if (AUS) return null;
  // Oben links: unten links liegen auf manchen Karten Knoepfe ("Whole map"), die das Zeichen verdeckten (16.11.2026).
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-noble-zeichen>
      <div className="absolute left-2 top-2 rounded bg-[#05080e]/60 px-1.5 py-0.5 text-[9px] leading-none text-white sm:left-3 sm:top-3 sm:text-[10px]">
        <span className="font-extrabold tracking-wide">{NOBLE_MARKE}</span>
        <span className="font-semibold text-white/80"> · {NOBLE_DOMAIN}</span>
      </div>
    </div>
  );
}
