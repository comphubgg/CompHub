import type { PovHud, HudOrt } from '@/lib/pov';

/*
 * Das HUD-Banner eines Pro-POVs: ein kleines Banner mit dem Namen (und auf Wunsch dem Profilbild) auf
 * dem POV, damit man sofort sieht, wessen POV es ist. Wie es aussieht, stellt der Zuschauer ein (Streams-Seite >
 * Einstellungen > POV-Banner oder das Zahnrad auf der Kachel, app/streams/mvTypen.ts); gezeichnet wird es auf der
 * Wand und in der OBS-Ansicht - einmal, nicht doppelt (Betreiber, 11.10.2026: "das soll nur eins haben").
 */

export type HudGroesse = 'klein' | 'mittel' | 'gross';

/** Wo das Banner im Bild sitzt: "unten" ganz unten am Rand, "oben" ganz oben (Betreiber, 11.10.2026). */
export function hudLage(ort: HudOrt): string {
  if (ort === 'oben') return 'left-1/2 top-2 -translate-x-1/2';
  if (ort === 'unten') return 'bottom-2 left-1/2 -translate-x-1/2';
  if (ort === 'links') return 'left-3 top-1/2 -translate-y-1/2';
  return 'right-3 top-1/2 -translate-y-1/2';
}

const GROESSEN: Record<HudGroesse, { text: string; bild: string; luft: string }> = {
  klein: { text: 'text-[11px]', bild: 'h-5 w-5', luft: 'pr-3' },
  mittel: { text: 'text-[14px]', bild: 'h-7 w-7', luft: 'pr-4' },
  gross: { text: 'text-[19px]', bild: 'h-10 w-10', luft: 'pr-5' },
};

export function HudBanner({ hud, name, bild, groesse = 'mittel' }: {
  hud: PovHud; name: string; bild: string | null; groesse?: HudGroesse;
}) {
  if (!hud.an) return null;
  const g = GROESSEN[groesse] ?? GROESSEN.mittel;
  return (
    <div className={`pointer-events-none absolute z-10 flex items-center gap-2 rounded-full bg-black/70 py-0.5 pl-0.5 font-semibold text-white
      ${g.text} ${g.luft} ${hudLage(hud.ort)}`}>
      {hud.mitBild && bild
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={bild} alt="" className={`${g.bild} rounded-full object-cover`} />
        : <span className={hud.mitBild ? `${g.bild} rounded-full bg-sky-500/80` : 'w-2'} />}
      <span className="whitespace-nowrap">{hud.text.trim() || name}</span>
    </div>
  );
}
