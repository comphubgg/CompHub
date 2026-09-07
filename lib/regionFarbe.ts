/*
 * Eine Farbe je Wettkampfregion.
 *
 * Der Betreiber wollte die Regionen auf einen Blick unterscheiden koennen:
 * "EU blau, NAC rot, Asia gelb, NA West oder Brasilien gruen, OCE dunkelblau
 * - so ein bisschen, dass es zu den Flaggen passt."
 *
 * Sieben Regionen, sieben Farben - und zwar ueberall dieselbe. Eine Marke,
 * die auf der Statistikseite blau und auf der Eventseite grau ist, hilft
 * niemandem beim Wiedererkennen.
 *
 * Die Klassen stehen ausgeschrieben da, weil Tailwind seine Klassen aus dem
 * Quelltext liest: ein zusammengesetzter Name wie `text-${farbe}-400` waere
 * im fertigen Stylesheet nicht enthalten und bliebe wirkungslos.
 */

export interface RegionFarbe {
  /** Fuer eine Marke mit Hintergrund - Text, Flaeche und Rand zusammen. */
  marke: string;
  /** Nur die Schriftfarbe, wo kein Hintergrund gewuenscht ist. */
  schrift: string;
}

const FARBEN: Record<string, RegionFarbe> = {
  EU: {
    marke: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    schrift: 'text-sky-300',
  },
  NAC: {
    marke: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    schrift: 'text-rose-300',
  },
  NAW: {
    marke: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
    schrift: 'text-teal-300',
  },
  BR: {
    marke: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    schrift: 'text-emerald-300',
  },
  ASIA: {
    marke: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    schrift: 'text-amber-300',
  },
  ME: {
    marke: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    schrift: 'text-orange-300',
  },
  OCE: {
    marke: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    schrift: 'text-indigo-300',
  },
};

/** Grau, solange die Region unbekannt ist - erfunden wird keine Farbe. */
const UNBEKANNT: RegionFarbe = {
  marke: 'border-zinc-800 bg-zinc-900 text-slate-400',
  schrift: 'text-slate-400',
};

export function regionFarbe(region?: string | null): RegionFarbe {
  const k = (region ?? '').trim().toUpperCase();
  return FARBEN[k] ?? UNBEKANNT;
}

/** Die Regionen in der Reihenfolge, in der sie im Werkzeug stehen. */
export const REGIONEN_REIHE = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
