import { FT_BILD_BREITE, FT_BILD_HOEHE, FT_BLAU, FT_GOLD, ftKopf, ftSchriften, gekuerzt, hintergrund, karte, ladeBild, rundesRechteck, WAND_BILDER } from './ftBild';

/*
 * Das Bild unter einem Beitrag ueber EINEN Spieler (Player Card) oder EIN Team (Team Spotlight) - Betreiber, 15.11.2026: "IMMER ein Bild unter dem Text".
 * Derselbe Stil wie lib/ftBild.ts (dunkle, schraege Wand aus Cup-Kacheln, blauer Schein, Logo und "thecomphub.com" oben): links das Foto als grosse Karte
 * (beim Team 2-4 Karten nebeneinander), Gesicht mittig (ftGesichtLage), Flagge und Name unten in der Karte; rechts der Cup-Titel und die wichtigsten
 * Werte des Posts als Kacheln, wahlweise mit dem Platz im Feld ("#1").
 * Ohne echtes Foto steht der Platzhalter in der Karte (lib/ftBild.ts, ftPlatzhalter) - es entsteht also immer ein Bild.
 *
 * Der Text im Bild ist englisch wie die Beitraege. Gezeichnet wird im Browser (1600 x 900), alle Bilder von derselben Herkunft.
 */

export interface StatKarteSpieler {
  name: string;
  /** Laenderkuerzel (zwei Buchstaben) fuer die Flagge. */
  land: string | null;
  /** Datei in public/spielerbilder - nur ein echtes Foto, sonst null (dann der Platzhalter). */
  datei: string | null;
  gesicht: [number, number, number] | null;
}

export interface StatKarteWert {
  titel: string;
  wert: string;
  /** Platz im Feld; null/undefined = ohne Abzeichen. */
  platz?: number | null;
}

export interface StatKarteDaten {
  /** Die grosse Zeile rechts, z. B. der Cup. */
  titel: string;
  /** Die kleine Zeile darunter, z. B. "Player Card" oder "Finished #3 · 412 pts". */
  untertitel?: string;
  spieler: StatKarteSpieler[];
  werte: StatKarteWert[];
  /** Die Plaetze als Abzeichen zeigen. */
  plaetze: boolean;
}

export interface StatKarteOptionen {
  basis?: string;
  schrift?: string;
  anzeige?: string;
}

/** Hoechstens so viele Kacheln rechts. */
export const STAT_KARTE_WERTE = 8;

/** Die Schrift so lange verkleinern, bis der Text in die Breite passt - danach kuerzen. */
function passend(ctx: CanvasRenderingContext2D, text: string, breite: number, gross: number, klein: number, schnitt: (px: number) => string) {
  let px = gross;
  ctx.font = schnitt(px);
  while (px > klein && ctx.measureText(text).width > breite) {
    px -= 2;
    ctx.font = schnitt(px);
  }
  return { px, text: gekuerzt(ctx, text, breite) };
}

/**
 * Der Titel: eine Zeile, solange er bei mindestens 34 px passt - sonst zwei Zeilen (an Wortgrenzen), die zweite notfalls gekuerzt.
 */
function titelZeilen(ctx: CanvasRenderingContext2D, text: string, breite: number, anzeige: string): { px: number; zeilen: string[] } {
  const schnitt = (p: number) => `700 ${p}px ${anzeige}`;
  const eine = passend(ctx, text, breite, 50, 34, schnitt);
  ctx.font = schnitt(eine.px);
  if (ctx.measureText(text).width <= breite) return { px: eine.px, zeilen: [text] };
  const woerter = text.split(/\s+/);
  for (let px = 44; px >= 30; px -= 2) {
    ctx.font = schnitt(px);
    let erste = '';
    let i = 0;
    while (i < woerter.length) {
      const probe = erste ? `${erste} ${woerter[i]}` : woerter[i];
      if (ctx.measureText(probe).width > breite) break;
      erste = probe; i += 1;
    }
    if (!erste) continue;
    const rest = woerter.slice(i).join(' ');
    if (ctx.measureText(rest).width <= breite || px === 30) return { px, zeilen: [erste, gekuerzt(ctx, rest, breite)] };
  }
  return { px: eine.px, zeilen: [eine.text] };
}

function abstandZeichen(ctx: CanvasRenderingContext2D, wert: string) {
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = wert;
}

/** Eine Kachel: Bezeichnung klein oben, der Wert gross darunter, rechts oben der Platz. */
function kachel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, w0: StatKarteWert, plaetze: boolean,
  schrift: string, anzeige: string) {
  const erster = plaetze && w0.platz === 1;
  const farbe = erster ? FT_GOLD : FT_BLAU;
  ctx.save();
  rundesRechteck(ctx, x, y, w, h, 16);
  const grund = ctx.createLinearGradient(x, y, x + w, y + h);
  grund.addColorStop(0, 'rgba(16,27,46,.86)'); grund.addColorStop(1, 'rgba(9,15,27,.86)');
  ctx.fillStyle = grund;
  ctx.shadowColor = `rgba(${farbe},${erster ? 0.22 : 0.1})`;
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = erster ? `rgba(${FT_GOLD},.5)` : 'rgba(255,255,255,.08)';
  ctx.lineWidth = erster ? 1.6 : 1;
  ctx.stroke();
  // Der Streifen links in der Farbe der Kachel.
  ctx.save();
  rundesRechteck(ctx, x, y, w, h, 16);
  ctx.clip();
  const kante = ctx.createLinearGradient(0, y, 0, y + h);
  kante.addColorStop(0, `rgba(${farbe},.95)`); kante.addColorStop(1, `rgba(${farbe},.25)`);
  ctx.fillStyle = kante;
  ctx.fillRect(x, y, 4, h);
  ctx.restore();

  const innen = 24;
  const klein = h < 96;
  // Das Abzeichen mit dem Platz.
  let abzeichen = 0;
  if (plaetze && w0.platz) {
    const t = `#${w0.platz.toLocaleString('en-US')}`;
    ctx.font = `800 ${klein ? 18 : 21}px ${schrift}`;
    abstandZeichen(ctx, '0px');
    const tb = ctx.measureText(t).width;
    const bw = tb + 22; const bh = klein ? 28 : 32;
    const bx = x + w - innen + 6 - bw; const by = y + (klein ? 12 : 16);
    rundesRechteck(ctx, bx, by, bw, bh, bh / 2);
    const oben = w0.platz <= 3;
    ctx.fillStyle = erster ? `rgba(${FT_GOLD},.18)` : oben ? `rgba(${FT_BLAU},.18)` : 'rgba(255,255,255,.06)';
    ctx.fill();
    ctx.strokeStyle = erster ? `rgba(${FT_GOLD},.55)` : oben ? `rgba(${FT_BLAU},.45)` : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = erster ? `rgb(${FT_GOLD})` : oben ? '#7cc8ff' : '#aab6c8';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, bx + 11, by + bh / 2 + 1);
    abzeichen = bw + 12;
  }

  // Bezeichnung.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8ea3bf';
  ctx.font = `700 ${klein ? 15 : 17}px ${schrift}`;
  abstandZeichen(ctx, '1.5px');
  const titel = gekuerzt(ctx, w0.titel.toUpperCase(), w - 2 * innen - abzeichen);
  ctx.fillText(titel, x + innen, y + (klein ? 32 : 40));

  // Wert.
  abstandZeichen(ctx, '0px');
  ctx.fillStyle = '#ffffff';
  const gross = Math.min(52, Math.round(h * 0.4));
  const { px, text } = passend(ctx, w0.wert, w - 2 * innen, gross, 22, (p) => `700 ${p}px ${anzeige}`);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8;
  ctx.fillText(text, x + innen, Math.min(y + h - (klein ? 14 : 20), y + (klein ? 32 : 40) + 10 + px));
  ctx.restore();
}

/** Zeichnet das Bild. Wirft nicht: ein Foto, das nicht laedt, wird zum Platzhalter. */
export async function statKarteZeichnen(leinwand: HTMLCanvasElement, d: StatKarteDaten, opt: StatKarteOptionen = {}): Promise<void> {
  const basis = opt.basis ?? '';
  const schrift = opt.schrift ?? (typeof getComputedStyle === 'function' ? getComputedStyle(document.body).fontFamily : '') ?? '';
  const familie = schrift || 'Inter, system-ui, sans-serif';
  const W = FT_BILD_BREITE; const H = FT_BILD_HOEHE;
  leinwand.width = W; leinwand.height = H;
  const ctx = leinwand.getContext('2d');
  if (!ctx) return;

  const spieler = d.spieler.slice(0, 4);
  const [logo, fotos, flaggen, wand] = await Promise.all([
    ladeBild(`${basis}/logos/CompHub-Logo-frei.png`),
    Promise.all(spieler.map((s) => (s.datei ? ladeBild(`${basis}/spielerbilder/${encodeURIComponent(s.datei)}`) : Promise.resolve(null)))),
    Promise.all(spieler.map((s) => (s.land && /^[a-z]{2}$/i.test(s.land) ? ladeBild(`${basis}/flags/${s.land.toLowerCase()}.png`) : Promise.resolve(null)))),
    Promise.all(WAND_BILDER.map((b) => ladeBild(`${basis}/cups/${b}`))),
  ]);
  const anzeige = await ftSchriften(familie, opt.anzeige);

  hintergrund(ctx, W, H, wand);
  const { logoY, kopf } = ftKopf(ctx, W, logo, anzeige);

  const rand = 80;
  const oben = logoY + kopf + 38;
  const kh = H - oben - 58;

  // Links die Karten: eine grosse, beim Team 2-4 nebeneinander.
  const n = Math.max(1, spieler.length);
  const luecke = 14;
  const linksBreite = [0, 470, 620, 720, 800][n];
  const kw = (linksBreite - luecke * (n - 1)) / n;
  // Die Karten sind schraeg: oben ragen sie nach rechts, unten nach links - etwas Luft zum Rand.
  let kx = rand + 20;
  const liste = spieler.length ? spieler : [{ name: '', land: null, datei: null, gesicht: null }];
  liste.forEach((sp, i) => {
    karte(ctx, kx, oben, kw, kh, fotos[i] ?? null, { name: sp.name, gesicht: sp.gesicht }, flaggen[i] ?? null, n === 1 || i === 0, familie);
    kx += kw + luecke;
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Rechts: Titel, Untertitel, die Kacheln.
  const rx = rand + 20 + linksBreite + 70;
  const rb = W - rand - rx;
  const werte = d.werte.slice(0, STAT_KARTE_WERTE);
  const spalten = werte.length > 3 ? 2 : 1;
  const reihen = Math.max(1, Math.ceil(werte.length / spalten));
  const kLuecke = 16;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const t = titelZeilen(ctx, d.titel, rb, anzeige);
  const zeilenH = Math.round(t.px * 1.12);
  const ut = d.untertitel ?? '';
  const titelH = zeilenH * t.zeilen.length + 6;
  const unterH = ut ? 40 : 0;
  const strichH = 34;
  const verfuegbar = kh - titelH - unterH - strichH;
  const kachelH = werte.length ? Math.min(werte.length > 6 ? 112 : 128, (verfuegbar - kLuecke * (reihen - 1)) / reihen) : 0;
  const block = titelH + unterH + strichH + (werte.length ? reihen * kachelH + (reihen - 1) * kLuecke : 60);
  let y = oben + Math.max(0, (kh - block) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${t.px}px ${anzeige}`;
  ctx.shadowColor = `rgba(${FT_BLAU},.35)`; ctx.shadowBlur = 18;
  t.zeilen.forEach((z, i) => ctx.fillText(z, rx, y + t.px * 0.82 + i * zeilenH));
  ctx.shadowBlur = 0;
  y += titelH;
  if (ut) {
    ctx.font = `700 24px ${familie}`;
    abstandZeichen(ctx, '1px');
    ctx.fillStyle = '#7cc8ff';
    ctx.fillText(gekuerzt(ctx, ut, rb), rx, y + 30);
    abstandZeichen(ctx, '0px');
    y += unterH;
  }
  // Eine feine Lichtkante unter dem Titel.
  const strich = ctx.createLinearGradient(rx, 0, rx + 260, 0);
  strich.addColorStop(0, `rgba(${FT_BLAU},.9)`); strich.addColorStop(1, `rgba(${FT_BLAU},0)`);
  ctx.fillStyle = strich;
  ctx.fillRect(rx, y + 12, 260, 3);
  y += strichH;
  ctx.restore();

  if (!werte.length) {
    ctx.save();
    ctx.font = `600 24px ${familie}`;
    ctx.fillStyle = '#6b7d96';
    ctx.fillText('No stats recorded for this match day.', rx, y + 36);
    ctx.restore();
    return;
  }
  const kb = (rb - kLuecke * (spalten - 1)) / spalten;
  werte.forEach((w0, i) => {
    const sx = rx + (i % spalten) * (kb + kLuecke);
    const sy = y + Math.floor(i / spalten) * (kachelH + kLuecke);
    kachel(ctx, sx, sy, kb, kachelH, w0, d.plaetze, familie, anzeige);
  });
}
