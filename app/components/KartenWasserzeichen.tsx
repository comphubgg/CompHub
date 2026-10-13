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
export default function KartenWasserzeichen() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
        * Das Logo des Werkzeugs oben rechts - dort, wo auf Nobles Kartenbildern ihr Logo sass (13.10.2026: "mein Logo muss dort
        * sein, nicht Noble"). Gross genug zum Erkennen, klein genug, um keine Landepunkte zu verdecken; zoomt mit der Karte.
        */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/karten-abzeichen.png" alt="" draggable={false}
        className="absolute right-[2%] top-[1.5%] opacity-90" style={{ width: '19%' }} />
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
