/*
 * Das kleine Noble-Zeichen auf Drop-Maps, deren Landepunkte von Noble Practice stammen.
 *
 * Noble Practice (16.11.2026): "Just make a few small adjustments to the shapes, and a watermark isn't necessarily required if you change the
 * shapes." Die Formen werden deshalb beim Zeichnen leicht vereinfacht (lib/formVereinfachen). Als Geste bleibt ein kleines, unaufdringliches
 * Zeichen "NOBLE PRACTICE · nobleprac.com" in der Ecke des Bildes - auf der Seite, im kopierten/gespeicherten Bild und in den erzeugten
 * Post-Bildern -, dazu auf der Seite der Hinweis "Drop maps by Noble Practice" mit Link (lib/kartenQuelle). Kein grosses Wasserzeichen.
 *
 * Karten, deren Formen nicht von Noble sind, bekommen das Zeichen nicht (die Entscheidung trifft der Aufrufer ueber lib/kartenQuelle).
 * Ohne Abhaengigkeiten: Browser (Canvas), Server (SVG fuer sharp) und Satori (post-bild) nehmen dieselben Werte.
 */

export const NOBLE_MARKE = 'NOBLE PRACTICE';
export const NOBLE_DOMAIN = 'nobleprac.com';
export const NOBLE_ZEICHEN = `${NOBLE_MARKE} · ${NOBLE_DOMAIN}`;

/**
 * Auf eine Leinwand zeichnen: das kleine Schild unten links im Rechteck (x, y, b, h).
 * `schildUnten` hebt das Schild ueber einen Fuss (z. B. ein Band mit Logo) an.
 */
export function zeichneNobleZeichen(
  g: CanvasRenderingContext2D, x: number, y: number, b: number, h: number,
  o: { schrift?: string; schildUnten?: number } = {},
): void {
  const schrift = o.schrift ?? 'Segoe UI, system-ui, sans-serif';
  const s = Math.min(b, h);

  const fs = Math.max(10, Math.round(s * 0.013));
  const rand = Math.round(s * 0.022);
  g.save();
  g.font = `800 ${fs}px ${schrift}`;
  const t1 = NOBLE_MARKE; const w1 = g.measureText(t1).width;
  g.font = `600 ${fs}px ${schrift}`;
  const t2 = ` · ${NOBLE_DOMAIN}`; const w2 = g.measureText(t2).width;
  const pad = fs * 0.6, hb = fs * 1.9, bb = w1 + w2 + pad * 2;
  const bx = x + rand, by = y + h - rand - hb - (o.schildUnten ?? 0);
  g.fillStyle = 'rgba(5,8,14,0.6)';
  g.beginPath();
  const rr = hb * 0.3;
  g.moveTo(bx + rr, by); g.arcTo(bx + bb, by, bx + bb, by + hb, rr); g.arcTo(bx + bb, by + hb, bx, by + hb, rr);
  g.arcTo(bx, by + hb, bx, by, rr); g.arcTo(bx, by, bx + bb, by, rr); g.closePath(); g.fill();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `800 ${fs}px ${schrift}`; g.fillStyle = '#ffffff'; g.fillText(t1, bx + pad, by + hb / 2);
  g.font = `600 ${fs}px ${schrift}`; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(t2, bx + pad + w1, by + hb / 2);
  g.restore();
}


/** Dasselbe Schild als SVG-Stueck fuer ein G x G grosses Bild (Server, sharp). `schildUnten` wie oben. */
export function nobleZeichenSvg(G: number, o: { schildUnten?: number } = {}): string {
  const fs = Math.max(10, Math.round(G * 0.013));
  const rand = Math.round(G * 0.022);
  const hb = fs * 1.9, bb = NOBLE_ZEICHEN.length * fs * 0.555 + fs * 1.2;
  const by = G - rand - hb - (o.schildUnten ?? 0);
  const schild = `<rect x="${rand}" y="${by}" width="${bb.toFixed(1)}" height="${hb.toFixed(1)}" rx="${(hb * 0.3).toFixed(1)}" fill="#05080e" fill-opacity="0.6"/>`
    + `<text x="${rand + fs * 0.6}" y="${(by + hb / 2).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${fs}" dominant-baseline="middle"><tspan font-weight="800" fill="#ffffff">${NOBLE_MARKE}</tspan><tspan dx="${(fs * 0.3).toFixed(1)}" font-weight="600" fill="#ffffff" fill-opacity="0.8">· ${NOBLE_DOMAIN}</tspan></text>`;
  return schild;
}
