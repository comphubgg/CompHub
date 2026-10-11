import type { PovHud, HudOrt } from '@/lib/pov';

/*
 * Das HUD-Banner eines Pro-POVs: ein kleines Banner mit dem Namen (und auf Wunsch dem Profilbild) auf
 * dem POV, damit man sofort sieht, wessen POV es ist. Wie es aussieht, stellt der Zuschauer ein (Streams-Seite >
 * Einstellungen > POV-Banner, app/streams/mvTypen.ts); gezeichnet wird es auf der Wand und in der OBS-Ansicht.
 */

/** Wo das Banner im Bild sitzt. */
export function hudLage(ort: HudOrt): string {
  if (ort === 'oben') return 'left-1/2 top-11 -translate-x-1/2';
  if (ort === 'unten') return 'bottom-10 left-1/2 -translate-x-1/2';
  if (ort === 'links') return 'left-2 top-1/2 -translate-y-1/2';
  return 'right-2 top-1/2 -translate-y-1/2';
}

export function HudBanner({ hud, name, bild }: { hud: PovHud; name: string; bild: string | null }) {
  if (!hud.an) return null;
  return (
    <div className={`pointer-events-none absolute z-10 flex items-center gap-1.5 rounded-full bg-black/70 py-0.5 pl-0.5 pr-3 text-[11px] font-semibold text-white ${hudLage(hud.ort)}`}>
      {hud.mitBild && bild
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={bild} alt="" className="h-5 w-5 rounded-full object-cover" />
        : <span className={hud.mitBild ? 'h-5 w-5 rounded-full bg-sky-500/80' : 'w-2'} />}
      <span className="whitespace-nowrap">{hud.text.trim() || name}</span>
    </div>
  );
}
