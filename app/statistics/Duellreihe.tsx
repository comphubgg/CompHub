'use client';

/*
 * Eine Zeile im Kopf-an-Kopf (Betreiber, 17.11.2026): keine gespiegelten Balken mehr, sondern [linker Wert] [Wert-Name] [rechter Wert].
 *
 * Der Bessere steht fett in Sky (der Akzentfarbe der Seite) mit einer kleinen Marke "▲ +45" - dem Abstand. Der andere bleibt schlicht grau.
 * Darunter ein einziger duenner Balken, der zum Besseren hin gefuellt ist (sein Anteil an beiden zusammen) - nicht gespiegelt.
 * Wo weniger besser ist (erlittener Schaden), steht das unter dem Namen und der kleinere Wert gewinnt. Unbekannt (null) ist ein Strich und
 * gewinnt nie; sind beide Werte 0 oder unbekannt, faellt die Zeile weg (zeigeReihe).
 * Verglichen wird, was angezeigt wird: zwei gleich gerundete Werte sind gleichauf.
 */

import T from '@/app/components/T';

export interface DuellWert {
  titel: string;
  a: number | null;
  b: number | null;
  /** Nachkommastellen der Anzeige. */
  nk: number;
  suffix?: string;
  /** Weniger ist besser (erlittener Schaden, Tode). */
  weniger?: boolean;
}

/** -1 links vorn, 1 rechts vorn, 0 gleichauf oder nicht vergleichbar. */
export function sieger(w: DuellWert): -1 | 0 | 1 {
  if (w.a === null || w.b === null) return 0;
  const a = Number(w.a.toFixed(w.nk)); const b = Number(w.b.toFixed(w.nk));
  if (a === b) return 0;
  return (w.weniger ? a < b : a > b) ? -1 : 1;
}

/** Eine Zeile lohnt nur, wenn mindestens eine Seite einen Wert ueber 0 hat. */
export function zeigeReihe(w: DuellWert): boolean {
  return (w.a ?? 0) !== 0 || (w.b ?? 0) !== 0;
}

/** Wie viele Werte jede Seite gewinnt - fuer "3 – 2" im Kopf. */
export function spielstand(werte: DuellWert[]): [number, number] {
  let l = 0, r = 0;
  for (const w of werte) { const s = sieger(w); if (s === -1) l++; else if (s === 1) r++; }
  return [l, r];
}

export default function Duellreihe({ wert, format }: { wert: DuellWert; format: (x: number, nk: number) => string }) {
  const { a, b, nk, suffix = '', weniger, titel } = wert;
  const vorn = sieger(wert);
  const abstand = a !== null && b !== null ? Math.abs(a - b) : 0;
  const zelle = (x: number | null, seite: -1 | 1) => {
    const gewinnt = vorn === seite;
    return (
      <span className={`flex min-w-0 items-center gap-1.5 ${seite === -1 ? 'justify-end' : 'justify-start'}`}>
        {seite === 1 && gewinnt && <Marke text={`${format(abstand, nk)}${suffix}`} weniger={weniger} />}
        <span className={`text-sm tabular-nums sm:text-base ${gewinnt ? 'font-black text-sky-400' : vorn === 0 && x !== null ? 'font-bold text-slate-200' : 'font-semibold text-slate-500'}`}>
          {x === null ? '—' : <>{format(x, nk)}{suffix}</>}
        </span>
        {seite === -1 && gewinnt && <Marke text={`${format(abstand, nk)}${suffix}`} weniger={weniger} />}
      </span>
    );
  };
  // Der Anteil des Besseren an beiden zusammen - bei "weniger ist besser" umgekehrt (der Kleinere bekommt den groesseren Anteil).
  const summe = (a ?? 0) + (b ?? 0);
  const anteilVorn = vorn === 0 || summe <= 0 ? 0
    : Math.max(0.5, (weniger ? (vorn === -1 ? (b ?? 0) : (a ?? 0)) : (vorn === -1 ? (a ?? 0) : (b ?? 0))) / summe);
  return (
    <div className="grid grid-cols-[1fr_minmax(104px,180px)_1fr] items-center gap-2 border-b border-zinc-800/70 py-2.5 last:border-b-0 sm:gap-4">
      {zelle(a, -1)}
      <span className="flex min-w-0 flex-col items-center gap-1 text-center">
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-400"><T>{titel}</T></span>
        {weniger && <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-600"><T>weniger ist besser</T></span>}
        <span className={`flex h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-zinc-800 ${vorn === 1 ? 'justify-end' : ''}`} aria-hidden>
          {anteilVorn > 0 && <span className="h-full rounded-full bg-sky-400" style={{ width: `${anteilVorn * 100}%` }} />}
        </span>
      </span>
      {zelle(b, 1)}
    </div>
  );
}

function Marke({ text, weniger }: { text: string; weniger?: boolean }) {
  return (
    <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-sky-400">
      {weniger ? '▼' : '▲'} {weniger ? '−' : '+'}{text}
    </span>
  );
}
