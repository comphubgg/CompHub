import type { FtBildSpieler } from './ftPosts';

/*
 * Das Bild unter einem Stat-Post (lib/ftPosts.ts) - im Stil des Twitter-Headers des Betreibers (14.11.2026): dunkel/blau, nur die Fotos der besten
 * Spieler des Posts in schraeg gestellten Karten (skewX) mit einem leisen Schein, das CompHub-Logo in der Mitte, unter jedem Foto Flagge und Name - sonst nichts.
 * Vorlage: tools/posts/collage.html (dieselben Farben, dieselbe Schraege und dieselbe Rechnung, die das Gesicht gross und mittig setzt).
 *
 * Gezeichnet wird im Browser auf eine Leinwand (1600 x 900). Alle Bilder kommen von derselben Herkunft (/spielerbilder, /flags, /logos), damit die
 * Leinwand lesbar bleibt (Herunterladen, Kopieren). Ohne Importe ausser Typen, damit sich die Datei auch ohne die Seite pruefen laesst.
 */

export const FT_BILD_BREITE = 1600;
export const FT_BILD_HOEHE = 900;

const SCHRAEGE = Math.tan((-6 * Math.PI) / 180);
const BLAU = '0,163,255';
const GOLD = '245,197,66';

export interface FtBildOptionen {
  /** Vor die Adressen, z. B. "" (dieselbe Herkunft) oder "/public" in einer Testseite. */
  basis?: string;
  /** Schriftfamilie fuer die Namen (Standard: die Schrift der Seite). */
  schrift?: string;
}

function ladeBild(src: string): Promise<HTMLImageElement | null> {
  return new Promise((fertig) => {
    const b = new Image();
    b.decoding = 'async';
    b.onload = () => fertig(b);
    b.onerror = () => fertig(null);
    b.src = src;
  });
}

function rundesRechteck(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text auf eine Breite kuerzen (mit "…"). */
function gekuerzt(ctx: CanvasRenderingContext2D, text: string, breite: number): string {
  if (ctx.measureText(text).width <= breite) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > breite) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Wo das Foto in einem Feld W x H liegt, damit das Gesicht gross und mittig sitzt - dieselbe Rechnung wie tools/posts/collage.html:
 * g = [x, y, Breite] des Gesichts als Anteile des Fotos (public/spielerbilder/_gesichter.json).
 */
export function ftGesichtLage(W: number, H: number, nw: number, nh: number, gesicht: [number, number, number] | null) {
  const g = gesicht ?? [0.5, 0.3, 0.3];
  const s = Math.max(W / nw, H / nh, (W * 0.3) / (g[2] * nw), W / (2 * Math.max(0.05, Math.min(g[0], 1 - g[0])) * nw));
  const x = W / 2 - g[0] * nw * s;
  const y = H * 0.36 - g[1] * nh * s;
  return { s, x: Math.min(0, Math.max(W - nw * s, x)), y: Math.min(0, Math.max(H - nh * s, y)), w: nw * s, h: nh * s };
}

/** Der Hintergrund: Verlauf von unten, ein feines Raster, das zum Rand hin verschwindet. */
function hintergrund(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, W, H);
  // radial-gradient(ellipse at 50% 120%, ...): ein Kreis, in der Hoehe gestaucht.
  ctx.save();
  ctx.translate(W / 2, H * 1.2);
  ctx.scale(1, 0.62);
  const r = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
  r.addColorStop(0, '#0f2a55'); r.addColorStop(0.4, '#081226'); r.addColorStop(0.7, '#05080e'); r.addColorStop(1, '#05080e');
  ctx.fillStyle = r;
  ctx.fillRect(-W, -H * 3, W * 2, H * 4);
  ctx.restore();
  // Ein Hauch Blau von oben.
  const oben = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.55);
  oben.addColorStop(0, `rgba(${BLAU},.13)`); oben.addColorStop(1, `rgba(${BLAU},0)`);
  ctx.fillStyle = oben;
  ctx.fillRect(0, 0, W, H);
  // Raster 56 px, zur Mitte hin sichtbar (wie die Maske in der Vorlage).
  // Ohne Raster (Betreiber, 14.11.2026: "Hintergrund noch cleaner", wie der Twitter-Header).
}

/** Eine Karte: schraeg, abgerundet, mit leichtem Leuchten, das Foto darin gerade (wie .k / .k .i in der Vorlage). */
function karte(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, foto: HTMLImageElement | null,
  sp: FtBildSpieler, flagge: HTMLImageElement | null, erster: boolean, schrift: string) {
  const farbe = erster ? GOLD : BLAU;
  const cx = x + w / 2; const cy = y + h / 2;
  const schraeg = () => ctx.setTransform(1, 0, SCHRAEGE, 1, -SCHRAEGE * cy, 0);

  // Leuchten hinter der Karte.
  ctx.save();
  schraeg();
  ctx.shadowColor = `rgba(${farbe},${erster ? 0.32 : 0.22})`;
  ctx.shadowBlur = 38;
  rundesRechteck(ctx, x, y, w, h, 18);
  ctx.fillStyle = '#0d1626';
  ctx.fill();
  ctx.restore();

  ctx.save();
  schraeg();
  rundesRechteck(ctx, x, y, w, h, 18);
  ctx.clip();
  // Das Foto ungeschraegt in ein Feld, das links und rechts 50 px ueber die Karte reicht (.k .i: left/right -50px).
  if (foto) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const FW = w + 100; const fx = x - 50;
    const l = ftGesichtLage(FW, h, foto.naturalWidth, foto.naturalHeight, sp.gesicht);
    if ('filter' in ctx) ctx.filter = 'saturate(.9) contrast(1.05)';
    // Die Karte ist schraeg: auf Gesichtshoehe liegt ihre Mitte um diesen Versatz neben der Mitte des Rechtecks - das Gesicht soll genau dort sitzen.
    const dx = SCHRAEGE * (y + h * 0.36 - cy);
    ctx.drawImage(foto, fx + l.x + dx, y + l.y, l.w, l.h);
    ctx.restore();
  }
  // Abdunkeln nach unten (fuer den Namen) und ein Schimmer der Kartenfarbe von oben.
  const unten = ctx.createLinearGradient(0, y, 0, y + h);
  unten.addColorStop(0, 'rgba(5,8,14,0)'); unten.addColorStop(0.5, 'rgba(5,8,14,0)'); unten.addColorStop(0.93, 'rgba(5,8,14,.94)'); unten.addColorStop(1, 'rgba(5,8,14,.96)');
  ctx.fillStyle = unten;
  ctx.fillRect(x - 100, y, w + 200, h);
  const schein = ctx.createLinearGradient(0, y, 0, y + h * 0.42);
  schein.addColorStop(0, `rgba(${farbe},.14)`); schein.addColorStop(1, `rgba(${farbe},0)`);
  ctx.fillStyle = schein;
  ctx.fillRect(x - 100, y, w + 200, h);
  // Ein leiser Lichtstreifen quer ueber die Karte.
  const streifen = ctx.createLinearGradient(x, y, x + w, y + h * 0.55);
  streifen.addColorStop(0.3, 'rgba(255,255,255,0)'); streifen.addColorStop(0.42, 'rgba(255,255,255,.06)'); streifen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = streifen;
  ctx.fillRect(x - 100, y, w + 200, h);
  ctx.restore();

  // Rahmen.
  ctx.save();
  schraeg();
  rundesRechteck(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18);
  ctx.strokeStyle = erster ? `rgba(${GOLD},.6)` : 'rgba(255,255,255,.10)';
  ctx.lineWidth = erster ? 2 : 1.2;
  ctx.stroke();
  // Eine feine Lichtkante oben.
  const kante = ctx.createLinearGradient(x, 0, x + w, 0);
  kante.addColorStop(0, `rgba(${farbe},0)`); kante.addColorStop(0.5, `rgba(${farbe},.7)`); kante.addColorStop(1, `rgba(${farbe},0)`);
  ctx.fillStyle = kante;
  ctx.fillRect(x + 18, y, w - 36, 2);
  ctx.restore();

  // Flagge und Name, gerade, unten in der Karte (die Karte ist dort um die Schraege versetzt).
  ctx.save();
  const ny = y + h - 34;
  const versatz = SCHRAEGE * (ny - cy);
  const groesse = w < 200 ? 24 : 28;
  ctx.font = `900 ${groesse}px ${schrift}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const fb = flagge ? 30 : 0; const fh = 20; const abstand = flagge ? 10 : 0;
  const name = gekuerzt(ctx, sp.name, w - 28 - fb - abstand);
  const tb = ctx.measureText(name).width;
  let lx = cx + versatz - (fb + abstand + tb) / 2;
  if (flagge) {
    ctx.save();
    rundesRechteck(ctx, lx, ny - fh / 2, fb, fh, 3);
    ctx.clip();
    ctx.drawImage(flagge, lx, ny - fh / 2, fb, fh);
    ctx.restore();
    lx += fb + abstand;
  }
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  ctx.fillText(name, lx, ny + 1);
  ctx.restore();
}

/**
 * Zeichnet das Bild auf die Leinwand und wartet dafuer auf Fotos, Flaggen, Logo und Schrift.
 * Die Leinwand wird auf 1600 x 900 gesetzt. Wirft nicht: ein Foto, das nicht laedt, laesst die Karte dunkel.
 */
export async function ftBildZeichnen(leinwand: HTMLCanvasElement, spieler: FtBildSpieler[], opt: FtBildOptionen = {}): Promise<void> {
  const basis = opt.basis ?? '';
  const schrift = opt.schrift ?? (typeof getComputedStyle === 'function' ? getComputedStyle(document.body).fontFamily : '') ?? '';
  const familie = schrift || 'Inter, system-ui, sans-serif';
  const W = FT_BILD_BREITE; const H = FT_BILD_HOEHE;
  leinwand.width = W; leinwand.height = H;
  const ctx = leinwand.getContext('2d');
  if (!ctx) return;

  const liste = spieler.slice(0, 6);
  const [logo, fotos, flaggen] = await Promise.all([
    ladeBild(`${basis}/logos/CompHub-Logo-frei.png`),
    Promise.all(liste.map((s) => ladeBild(`${basis}/spielerbilder/${encodeURIComponent(s.datei)}`))),
    Promise.all(liste.map((s) => (s.land && /^[a-z]{2}$/i.test(s.land) ? ladeBild(`${basis}/flags/${s.land.toLowerCase()}.png`) : Promise.resolve(null)))),
  ]);
  try {
    await document.fonts?.load(`900 28px ${familie}`);
    await document.fonts?.ready;
  } catch { /* dann die Ersatzschrift */ }

  hintergrund(ctx, W, H);

  // Das Logo oben in der Mitte, mit einem leisen blauen Hof.
  const logoH = 118;
  const logoY = 44;
  if (logo) {
    const lw = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.save();
    ctx.shadowColor = `rgba(${BLAU},.45)`;
    ctx.shadowBlur = 40;
    ctx.drawImage(logo, (W - lw) / 2, logoY, lw, logoH);
    ctx.restore();
  }

  // Die Karten in einer Reihe, mittig unter dem Logo.
  const n = liste.length;
  if (!n) return;
  // Breitere Karten, kaum Abstand (Betreiber, 14.11.2026: "nicht so duenn ... ruhig instant nebeneinander").
  const rand = 40; const luecke = 10;
  const kw = Math.min(320, (W - 2 * rand - luecke * (n - 1)) / n);
  const kh = H - (logoY + logoH + 52) - 58;
  const gesamt = n * kw + (n - 1) * luecke;
  const ky = logoY + logoH + 52;
  let kx = (W - gesamt) / 2;
  liste.forEach((sp, i) => {
    karte(ctx, kx, ky, kw, kh, fotos[i], sp, flaggen[i], i === 0, familie);
    kx += kw + luecke;
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Die Leinwand als PNG. */
export function ftBildBlob(leinwand: HTMLCanvasElement): Promise<Blob> {
  return new Promise((fertig, schief) => {
    try {
      leinwand.toBlob((b) => (b ? fertig(b) : schief(new Error('Das Bild ließ sich nicht auslesen.'))), 'image/png');
    } catch (e) { schief(e instanceof Error ? e : new Error(String(e))); }
  });
}
