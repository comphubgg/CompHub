/*
 * Der Platzhalter fuer einen Spieler ohne Foto: ein Verlauf in den Blautoenen der Seite mit einem Kopf-und-Schultern-Zeichen.
 *
 * Der Betreiber (19.10.2026): "wenn ich bei Stats wie Solo Heats kein Profilbild habe, nicht einfach ein Bild mit Anfangsbuchstabe, sondern so wie im Bild" -
 * eine dunkle Flaeche mit dem grauen Zeichen einer Person - "mit meinen Farben". Der Name steht ohnehin neben oder unter dem Bild; der Platzhalter
 * muss nur sagen "hier fehlt ein Foto", nicht raten lassen, wer es ist.
 *
 * Zwei Formen:
 *   - SpielerPlatzhalter fuellt das Elternelement (position: absolute) - fuer Kacheln, die ein Foto in voller Flaeche zeigen
 *   - PlatzhalterRund ist ein eigenes Rund oder Quadrat in fester Groesse - fuer kleine Bilder in Listen
 */

const TON = ['from-sky-800/55 to-zinc-900', 'from-blue-800/55 to-zinc-900', 'from-indigo-800/50 to-zinc-900', 'from-cyan-800/45 to-zinc-900', 'from-slate-600/55 to-zinc-900'];

/** Ein Blauton je Name - jeder Spieler sieht anders aus, keiner fremd. */
const tonVon = (name: string) => TON[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % TON.length];

function Zeichen({ klasse }: { klasse: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`fill-current ${klasse}`}>
      <circle cx="50" cy="36" r="17" />
      <path d="M16 92c0-19 15-33 34-33s34 14 34 33z" />
    </svg>
  );
}

export default function SpielerPlatzhalter({ name = '' }: { name?: string }) {
  return (
    <span aria-hidden className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${tonVon(name)}`}>
      <Zeichen klasse="h-1/2 w-1/2 text-white/[0.12]" />
    </span>
  );
}

export function PlatzhalterRund({ name = '', groesse = 28, eckig = false, className = '' }: { name?: string; groesse?: number; eckig?: boolean; className?: string }) {
  return (
    <span aria-hidden style={{ width: groesse, height: groesse }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br ${tonVon(name)} ${eckig ? 'rounded-lg' : 'rounded-full'} ${className}`}>
      <Zeichen klasse="h-3/5 w-3/5 translate-y-[8%] text-white/[0.14]" />
    </span>
  );
}
