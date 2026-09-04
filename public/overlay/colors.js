// Farbanalyse von Spielerbildern. Wird von allen Overlays und vom
// Konfigurator gemeinsam benutzt, damit alle zum selben Ergebnis kommen.
//
// Idee: transparente Flaechen, Hauttoene und Graustufen rausfiltern -
// uebrig bleibt das Trikot. Daraus wird ein passendes Farbschema gebaut.

(function (global) {

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(1, Math.max(0, s));
    l = Math.min(1, Math.max(0, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    const f = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }

  // Hauttoene liegen alle in einem engen Bereich - sonst wird jedes
  // Overlay beige, weil Gesicht und Haende viel Flaeche einnehmen.
  function istHaut(h, s, l) {
    return h >= 5 && h <= 45 && s > .12 && s < .72 && l > .3 && l < .82;
  }

  function ausBild(img) {
    const N = 140;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, N, N);

    let px;
    try { px = cx.getImageData(0, 0, N, N).data; }
    catch { return null; }          // fremde Quelle ohne Freigabe

    const eimer = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;                 // freigestellter Bereich
      const [h, s, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      if (l < .12 || l > .93) continue;              // fast schwarz / fast weiss
      if (s < .18) continue;                         // grau
      if (istHaut(h, s, l)) continue;

      const key = Math.round(h / 15);                // 15-Grad-Buendel
      const e = eimer.get(key) || { n: 0, h: 0, s: 0, l: 0 };
      const w = 1 + s * 2;                           // kraeftige Farben zaehlen mehr
      e.n += w; e.h += h * w; e.s += s * w; e.l += l * w;
      eimer.set(key, e);
    }

    const sortiert = [...eimer.values()]
      .map(e => ({ n: e.n, h: e.h / e.n, s: e.s / e.n, l: e.l / e.n }))
      .sort((a, b) => b.n - a.n);
    if (!sortiert.length) return null;

    const haupt = sortiert[0];
    let zweit = sortiert.find(c => {
      const d = Math.abs(c.h - haupt.h);
      return Math.min(d, 360 - d) > 40;
    });
    if (!zweit) zweit = { h: haupt.h + 28, s: haupt.s, l: haupt.l };

    return {
      accent:  hsl2hex(haupt.h, Math.max(.62, haupt.s), .63),
      accent2: hsl2hex(zweit.h, Math.max(.55, zweit.s), .58),
      bg:      hsl2hex(haupt.h, .38, .075),
      bg2:     hsl2hex(haupt.h, .34, .155),
      muted:   hsl2hex(haupt.h, .30, .76),
      roh: sortiert.slice(0, 5).map(c => hsl2hex(c.h, c.s, c.l)),
    };
  }

  // Bildpfad rein, Farbschema raus. Ergebnisse werden gemerkt, damit
  // dasselbe Bild nicht mehrfach analysiert wird.
  const merker = new Map();

  async function ausPfad(src) {
    if (!src) return null;
    if (merker.has(src)) return merker.get(src);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
      const f = ausBild(img);
      merker.set(src, f);
      return f;
    } catch {
      merker.set(src, null);
      return null;
    }
  }

  global.Farben = { ausBild, ausPfad, rgb2hsl, hsl2hex };

})(window);
