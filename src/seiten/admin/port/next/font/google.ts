/*
 * next/font/google fuer die portierten Werkzeuge: dieselbe Schrift, nur ueber Google Fonts geladen (Next laedt sie auf main selbst).
 * Liefert wie Next className, style und variable (die CSS-Variable steht dann auf dem Element mit dieser Klasse).
 */
interface Wahl { weight?: string | string[]; subsets?: string[]; display?: string; variable?: string }
function schrift(familie: string) {
  return (w: Wahl = {}) => {
    const gewicht = Array.isArray(w.weight) ? w.weight.join(';') : (w.weight ?? '400');
    const klasse = `schrift-${familie.toLowerCase().replace(/\W+/g, '-')}`;
    if (typeof document !== 'undefined' && !document.getElementById(klasse)) {
      const l = document.createElement('link'); l.id = klasse; l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familie)}:wght@${gewicht}&display=${w.display ?? 'swap'}`;
      document.head.appendChild(l);
      const s = document.createElement('style');
      s.textContent = `.${klasse}{${w.variable ? `${w.variable}:'${familie}';` : ''}}`;
      document.head.appendChild(s);
    }
    return { className: klasse, variable: klasse, style: { fontFamily: `'${familie}', system-ui, sans-serif` } };
  };
}
export const Alata = schrift('Alata');
