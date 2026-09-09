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
 *
 * ---------------------------------------------------------------------------
 *
 * Wann die Farbe erscheint - und wann nicht.
 *
 * Frueher leuchteten alle sieben Knoepfe gleichzeitig in ihrer Farbe, auch
 * die sechs, auf denen man gerade nicht steht. Damit trug die Farbe nichts
 * mehr bei: sie sagte nicht, wo man ist, sondern nur, dass es Regionen gibt.
 * Der Betreiber: "Wenn ich gerade Europa bin, sind NA Central, NA West,
 * Brasil, Asia, Middle East und Oceania normal, ohne Farbe."
 *
 * Deshalb gilt jetzt: neutral, solange nichts gewaehlt ist. Die Farbe kommt
 * zur gewaehlten Region - oder unter den Mauszeiger, damit sichtbar bleibt,
 * was man gleich waehlt.
 */

export interface RegionFarbe {
  /** Fuer den gewaehlten Zustand - Text, Flaeche und Rand zusammen. */
  marke: string;
  /**
   * Fuer den ungewaehlten Zustand: neutral, die Farbe erst unter der Maus.
   *
   * Der Betreiber wollte die Filterknoepfe "immer so umrandet, nicht nur die
   * Schrift" - der Rand bleibt deshalb, er ist nur grau statt bunt. Wer mit
   * der Maus darueberfaehrt, sieht die Farbe der Region und weiss, was ihn
   * erwartet.
   */
  ruhig: string;
  /**
   * Nur die Schriftfarbe, wo weder Rand noch Flaeche gewuenscht ist.
   *
   * Gedacht fuer Zeilen innerhalb einer groesseren Flaeche - etwa die
   * Regionen einer Cup-Kachel auf der Eventseite. Die Farbe haengt hier am
   * Mauszeiger ueber der ganzen Zeile, nicht ueber dem Wort selbst; das
   * umgebende Element braucht dafuer die Klasse "group".
   */
  schrift: string;
}

const FARBEN: Record<string, RegionFarbe> = {
  EU: {
    marke: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-sky-500/50 hover:text-sky-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-sky-300',
  },
  NAC: {
    marke: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-rose-500/50 hover:text-rose-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-rose-300',
  },
  NAW: {
    marke: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-orange-500/50 hover:text-orange-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-orange-300',
  },
  BR: {
    marke: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-emerald-300',
  },
  ASIA: {
    marke: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-amber-500/50 hover:text-amber-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-amber-300',
  },
  ME: {
    marke: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-blue-500/50 hover:text-blue-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-blue-300',
  },
  OCE: {
    marke: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    ruhig: 'border-zinc-800 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300',
    schrift: 'text-slate-400 transition-colors group-hover:text-indigo-300',
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
