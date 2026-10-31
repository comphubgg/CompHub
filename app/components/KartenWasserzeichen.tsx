/*
 * Das Wasserzeichen auf jeder Karte - thecomphub.com, schraeg und blass.
 *
 * Stand bisher nur im Karten-Werkzeug. Der Betreiber (25.9.2026): "bei
 * FNCS Global Champions, Prediction und Map soll auch ueberall dieses
 * Wasserzeichen drin sein. So wie normalerweise." Deshalb ein Baustein fuer
 * alle Kartenansichten, damit es ueberall gleich aussieht.
 *
 * Gehoert in die Zoom-Ebene, ueber das Kartenbild und unter die Formen: so
 * verdeckt es nichts, zoomt mit und laesst sich nicht wegschneiden. Die
 * Flaeche ragt in jede Richtung um die halbe Kartenbreite ueber den Rand,
 * damit nach der Drehung auch in den Ecken etwas steht.
 */
export default function KartenWasserzeichen({ logo = true, dicht = false }: {
  /** Das Logo unten rechts mitzeichnen - die grosse Karte setzt es selbst fest an den Rand. */
  logo?: boolean;
  /**
   * Viele kleine Schriftzuege ueber die ganze Flaeche wie bei Noble (Betreiber, 31.10.2026) - fuer die Karte, deren Zeichen ueber dem ganzen
   * Blau liegen und nicht mitzoomen.
   */
  dicht?: boolean;
} = {}) {
  if (dicht) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -inset-1/2 grid content-center justify-center gap-x-10 gap-y-9 opacity-[0.07]"
          style={{ transform: 'rotate(-20deg)', gridTemplateColumns: 'repeat(14, max-content)' }}>
          {Array.from({ length: 14 * 22 }, (_, i) => (
            <span key={i} className="whitespace-nowrap text-[11px] font-extrabold tracking-wide text-white"
              style={{ transform: Math.floor(i / 14) % 2 ? 'translateX(50%)' : undefined }}>
              thecomphub.com
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
        * Das Logo unten rechts wie auf dem kopierten Kartenbild, nur kleiner (Betreiber, 30.10.2026: "das Logo oben mit URL soll nur das Logo sein wie
        * unten rechts, einfach kleiner"). Zoomt mit der Karte. Etwas ueber der Ecke, damit die Knoepfe (Kopieren, Lupe, Vollbild) es nicht verdecken.
        */}
      {logo && (<div className="absolute bottom-[7%] right-[1.6%] flex flex-col items-end opacity-90" style={{ width: '10%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/CompHub-Logo-frei.png" alt="" draggable={false} className="w-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]" />
        <span className="mt-[2%] whitespace-nowrap font-semibold text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" style={{ fontSize: '1.15cqw' }}>thecomphub.com</span>
      </div>)}
      <div className="absolute -inset-1/2 grid content-center justify-center
                      gap-x-14 gap-y-16 opacity-[0.075]"
        style={{ transform: 'rotate(-20deg)', gridTemplateColumns: 'repeat(4, max-content)' }}>
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i}
            className="whitespace-nowrap text-lg font-extrabold tracking-wide text-white"
            style={{ transform: i % 8 >= 4 ? 'translateX(50%)' : undefined }}>
            thecomphub.com
          </span>
        ))}
      </div>
    </div>
  );
}
