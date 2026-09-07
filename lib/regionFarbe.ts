/*
 * Eine Farbe je Wettkampfregion.
 *
 * Der Betreiber hat sie einzeln festgelegt: "EU blau, NAC rot, NA West
 * orange, Brasilien gruen, Asien gelb, Ozeanien dunkelblau, Middle East
 * blau."
 *
 * Drei davon sind blau, und das ist so gewollt. Damit sie sich trotzdem
 * unterscheiden lassen, liegen sie weit auseinander: EU im hellen Himmelblau,
 * Middle East im satten Blau, Ozeanien im dunklen Indigo.
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
  /** Fuer den gewaehlten Zustand - Text, Flaeche und Rand zusammen. */
  marke: string;
  /**
   * Fuer den ungewaehlten Zustand: Rand und Schrift, aber keine Flaeche.
   *
   * Der Betreiber wollte die Filterknoepfe "immer so umrandet, nicht nur die
   * Schrift". Ohne Rand sah eine ungewaehlte Reihe aus wie blosser Text; mit
   * Flaeche saehen alle sieben aus, als waeren sie gewaehlt.
   */
  ruhig: string;
  /** Nur die Schriftfarbe, wo weder Rand noch Flaeche gewuenscht ist. */
  schrift: string;
}

const FARBEN: Record<string, RegionFarbe> = {
  EU: {
    marke: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    ruhig: 'border-sky-500/50 text-sky-300',
    schrift: 'text-sky-300',
  },
  NAC: {
    marke: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    ruhig: 'border-rose-500/50 text-rose-300',
    schrift: 'text-rose-300',
  },
  NAW: {
    marke: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    ruhig: 'border-orange-500/50 text-orange-300',
    schrift: 'text-orange-300',
  },
  BR: {
    marke: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    ruhig: 'border-emerald-500/50 text-emerald-300',
    schrift: 'text-emerald-300',
  },
  ASIA: {
    marke: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    ruhig: 'border-amber-500/50 text-amber-300',
    schrift: 'text-amber-300',
  },
  ME: {
    marke: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    ruhig: 'border-blue-500/50 text-blue-300',
    schrift: 'text-blue-300',
  },
  OCE: {
    marke: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    ruhig: 'border-indigo-500/50 text-indigo-300',
    schrift: 'text-indigo-300',
  },
};

/** Grau, solange die Region unbekannt ist - erfunden wird keine Farbe. */
const UNBEKANNT: RegionFarbe = {
  marke: 'border-zinc-800 bg-zinc-900 text-slate-400',
  ruhig: 'border-zinc-800 text-slate-400',
  schrift: 'text-slate-400',
};

export function regionFarbe(region?: string | null): RegionFarbe {
  const k = (region ?? '').trim().toUpperCase();
  return FARBEN[k] ?? UNBEKANNT;
}

/** Die Regionen in der Reihenfolge, in der sie im Werkzeug stehen. */
export const REGIONEN_REIHE = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
