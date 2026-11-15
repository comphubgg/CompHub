import { FT_BLAU, ftSchriften, gekuerzt, hintergrund, karte, ladeBild, rundesRechteck, WAND_BILDER } from './ftBild';
import type { LeaderAntwort } from './turnierLeader';

/*
 * Das teilbare Bild der Tournament Leaders (Betreiber, 15.11.2026): 2000 x 1213, derselbe Stil wie lib/ftBild.ts / lib/statKarteBild.ts (dunkle Wand aus
 * Cup-Kacheln, blauer Schein, Cup-Bild und Titel links oben, unser Logo mit "thecomphub.com" rechts oben). Links der Event MVP als Karte (Foto nur bei nachgewiesener Konto-Zuordnung, sonst
 * Platzhalter) mit seinen Werten, rechts die neun Tafeln (3 x 3) mit den besten fuenf. Nur Blau/Weiss - kein Gold.
 * Ohne Importe ausser ftBild und Typen; gezeichnet wird im Browser, alle Bilder von derselben Herkunft.
 */

export const LEADER_BILD_BREITE = 2000;
export const LEADER_BILD_HOEHE = 1213;

/** Sekunden als "2h 22m". */
const zeitText = (sek: number) => { const s = Math.max(0, Math.round(sek)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const zahl = (v: number, n = 0) => v.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });

function abstand(ctx: CanvasRenderingContext2D, wert: string) {
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = wert;
}

function flaeche(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hervor = false) {
  ctx.save();
  rundesRechteck(ctx, x, y, w, h, 16);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(16,27,46,.88)'); g.addColorStop(1, 'rgba(9,15,27,.88)');
  ctx.fillStyle = g;
  ctx.shadowColor = `rgba(${FT_BLAU},${hervor ? 0.25 : 0.1})`;
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hervor ? `rgba(${FT_BLAU},.55)` : 'rgba(255,255,255,.08)';
  ctx.lineWidth = hervor ? 1.6 : 1;
  ctx.stroke();
  ctx.restore();
}

export async function turnierLeaderZeichnen(leinwand: HTMLCanvasElement, d: LeaderAntwort, titel: string, opt: { basis?: string; schrift?: string } = {}): Promise<void> {
  const basis = opt.basis ?? '';
  const familie = opt.schrift || (typeof getComputedStyle === 'function' ? getComputedStyle(document.body).fontFamily : '') || 'Inter, system-ui, sans-serif';
  const W = LEADER_BILD_BREITE; const H = LEADER_BILD_HOEHE;
  leinwand.width = W; leinwand.height = H;
  const ctx = leinwand.getContext('2d');
  if (!ctx) return;

  const m = d.mvp;
  const laender = [...new Set([m?.land ?? '', ...d.tafeln.flatMap((t) => t.zeilen.map((z) => z.land))].filter((l) => /^[a-z]{2}$/i.test(l)).map((l) => l.toLowerCase()))];
  const [logo, cupBild, foto, wand, flaggenListe] = await Promise.all([
    ladeBild(`${basis}/logos/CompHub-Logo-frei.png`),
    d.kopf?.bild ? ladeBild(`${basis}${d.kopf.bild}`) : Promise.resolve(null),
    m?.datei ? ladeBild(`${basis}/spielerbilder/${encodeURIComponent(m.datei)}`) : Promise.resolve(null),
    Promise.all(WAND_BILDER.map((b) => ladeBild(`${basis}/cups/${b}`))),
    Promise.all(laender.map(async (l) => [l, await ladeBild(`${basis}/flags/${l}.png`)] as const)),
  ]);
  const flagge = new Map(flaggenListe);
  const flaggeVon = (l: string) => (l ? flagge.get(l.toLowerCase()) ?? null : null);
  const anzeige = await ftSchriften(familie);

  hintergrund(ctx, W, H, wand);

  const rand = 80;
  const k = d.kopf;
  // Kopf links: Cup-Bild, Titel, darunter "Tournament Leaders · Saison · Region · Datum".
  let tx = rand;
  if (cupBild) {
    const g = 112;
    ctx.save();
    rundesRechteck(ctx, rand, 44, g, g, 18);
    ctx.shadowColor = `rgba(${FT_BLAU},.45)`; ctx.shadowBlur = 24;
    ctx.fillStyle = '#0d1626'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    const s0 = Math.max(g / cupBild.naturalWidth, g / cupBild.naturalHeight);
    ctx.drawImage(cupBild, rand + (g - cupBild.naturalWidth * s0) / 2, 44 + (g - cupBild.naturalHeight * s0) / 2, cupBild.naturalWidth * s0, cupBild.naturalHeight * s0);
    ctx.restore();
    ctx.save(); rundesRechteck(ctx, rand + 0.5, 44.5, g - 1, g - 1, 18); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.stroke(); ctx.restore();
    tx = rand + g + 30;
  }
  // Rechts: unser Logo und die Adresse.
  const logoH = 64;
  let rechtsFrei = W - rand;
  if (logo) {
    const lw = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.save();
    ctx.shadowColor = `rgba(${FT_BLAU},.9)`; ctx.shadowBlur = 36;
    ctx.drawImage(logo, W - rand - lw, 46, lw, logoH);
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, W - rand - lw, 46, lw, logoH);
    ctx.restore();
    rechtsFrei = W - rand - Math.max(lw, 230) - 40;
  }
  ctx.save();
  ctx.font = `700 24px ${anzeige}`;
  ctx.textAlign = 'right';
  abstand(ctx, '1px');
  ctx.fillStyle = '#c9d8ec';
  ctx.shadowColor = `rgba(${FT_BLAU},.55)`; ctx.shadowBlur = 14;
  ctx.fillText('thecomphub.com', W - rand, 46 + logoH + 38);
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  let px = 54;
  ctx.font = `700 ${px}px ${anzeige}`;
  while (px > 30 && ctx.measureText(titel).width > rechtsFrei - tx) { px -= 2; ctx.font = `700 ${px}px ${anzeige}`; }
  ctx.shadowColor = `rgba(${FT_BLAU},.35)`; ctx.shadowBlur = 18;
  ctx.fillText(gekuerzt(ctx, titel, rechtsFrei - tx), tx, 104);
  ctx.shadowBlur = 0;
  const datum = k?.datum ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' }).format(new Date(k.datum)) : '';
  const unter = ['TOURNAMENT LEADERS', k?.saison?.toUpperCase(), k?.region, datum.toUpperCase()].filter(Boolean).join('  ·  ');
  ctx.fillStyle = '#7cc8ff';
  ctx.font = `800 21px ${familie}`;
  abstand(ctx, '3px');
  ctx.fillText(gekuerzt(ctx, unter, rechtsFrei - tx), tx, 146);
  ctx.restore();

  const oben = 214;
  const unten = H - 62;

  // Links: der Event MVP.
  const lw = 520;
  const kartenH = 560;
  if (m) {
    karte(ctx, rand + 26, oben + 6, lw - 52, kartenH - 6, foto, { name: m.name, gesicht: m.gesicht }, flaggeVon(m.land), false, familie);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.font = `800 20px ${familie}`;
    abstand(ctx, '3px');
    const t = 'EVENT MVP';
    const tw = ctx.measureText(t).width + 36;
    const sx = rand + 46; const sy = oben + 24;
    rundesRechteck(ctx, sx, sy, tw, 38, 19);
    ctx.fillStyle = `rgb(${FT_BLAU})`;
    ctx.shadowColor = `rgba(${FT_BLAU},.7)`; ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#04101f';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, sx + 18, sy + 20);
    ctx.restore();

    const werte: Array<[string, string]> = [
      ['RATING', zahl(m.rating, 1)], ['DAMAGE DEALT', zahl(m.damage)],
      ['DAMAGE RATIO', m.quote != null ? zahl(m.quote, 2) : '–'], ['HITS TO PLAYERS', m.hits != null ? zahl(m.hits) : '–'],
      ['HEADSHOTS', m.headshots != null ? zahl(m.headshots) : '–'], ['PLACEMENT', m.platz ? `#${m.platz}` : '–'],
    ];
    const ty = oben + kartenH + 24;
    const gap = 12;
    const th = (unten - ty - gap * 2) / 3;
    const tw2 = (lw - gap) / 2;
    werte.forEach(([kz, v], i) => {
      const x = rand + (i % 2) * (tw2 + gap); const y = ty + Math.floor(i / 2) * (th + gap);
      flaeche(ctx, x, y, tw2, th, i === 0);
      ctx.save();
      ctx.fillStyle = '#8ea3bf';
      ctx.font = `700 16px ${familie}`;
      abstand(ctx, '1.5px');
      ctx.fillText(kz, x + 20, y + 32);
      abstand(ctx, '0px');
      ctx.fillStyle = i === 0 ? '#7cc8ff' : '#ffffff';
      ctx.font = `700 ${Math.min(42, th * 0.42)}px ${anzeige}`;
      ctx.fillText(v, x + 20, y + th - 16);
      ctx.restore();
    });
  }

  // Rechts: die Tafeln, drei Spalten, drei Reihen.
  const rx = rand + lw + 44;
  const rb = W - rand - rx;
  const sp = 3; const gap = 20;
  const tb = (rb - gap * (sp - 1)) / sp;
  // Immer drei Reihen: fehlen Tafeln (Replay-Auswertung laeuft noch), bleibt der Platz mit einem Hinweis statt riesiger Tafeln.
  const reihen = 3;
  const th = (unten - oben - gap * (reihen - 1)) / reihen;
  d.tafeln.slice(0, 9).forEach((t, i) => {
    const x = rx + (i % sp) * (tb + gap); const y = oben + Math.floor(i / sp) * (th + gap);
    const hervor = t.schluessel === 'rating';
    flaeche(ctx, x, y, tb, th, hervor);
    ctx.save();
    rundesRechteck(ctx, x, y, tb, th, 16);
    ctx.clip();
    const kopfH = 52;
    ctx.fillStyle = hervor ? `rgba(${FT_BLAU},.16)` : 'rgba(255,255,255,.035)';
    ctx.fillRect(x, y, tb, kopfH);
    ctx.fillStyle = `rgba(${FT_BLAU},.9)`;
    ctx.fillRect(x, y, 4, kopfH);
    ctx.fillStyle = '#dbe7f6';
    ctx.font = `800 18px ${familie}`;
    abstand(ctx, '2px');
    ctx.textBaseline = 'middle';
    ctx.fillText(gekuerzt(ctx, t.titel.toUpperCase(), tb - 40), x + 22, y + kopfH / 2 + 1);
    abstand(ctx, '0px');
    const zh = (th - kopfH - 10) / 5;
    t.zeilen.slice(0, 5).forEach((z, j) => {
      const zy = y + kopfH + 5 + j * zh + zh / 2;
      if (j > 0) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(x + 16, zy - zh / 2, tb - 32, 1); }
      ctx.fillStyle = z.rang === 1 ? '#7cc8ff' : '#6b7d96';
      ctx.font = `800 20px ${familie}`;
      ctx.textAlign = 'right';
      ctx.fillText(String(z.rang), x + 42, zy);
      ctx.textAlign = 'left';
      let nx = x + 56;
      const f = flaggeVon(z.land);
      if (f) {
        ctx.save();
        rundesRechteck(ctx, nx, zy - 10, 28, 20, 3);
        ctx.clip();
        ctx.drawImage(f, nx, zy - 10, 28, 20);
        ctx.restore();
        nx += 36;
      }
      const wert = t.zeit ? zeitText(z.wert) : zahl(z.wert, t.nachkomma);
      ctx.font = `700 22px ${anzeige}`;
      const ww = ctx.measureText(wert).width;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(wert, x + tb - 20, zy + 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = z.rang === 1 ? '#ffffff' : '#c3cfdf';
      ctx.font = `${z.rang === 1 ? 800 : 600} 20px ${familie}`;
      ctx.fillText(gekuerzt(ctx, z.name, x + tb - 20 - ww - 14 - nx), nx, zy + 1);
    });
    ctx.restore();
  });

  if (d.tafeln.length <= 6 && d.replayStand) {
    ctx.save();
    const y0 = oben + Math.ceil(d.tafeln.length / sp) * (th + gap);
    flaeche(ctx, rx, y0, rb, Math.min(160, unten - y0), false);
    ctx.fillStyle = '#9fb3cc';
    ctx.font = `600 24px ${familie}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`Replay ${d.replayStand.gelesen}/${d.replayStand.gesamt} games read – hits, headshots, builds, damage taken and ratio follow.`, rx + 30, y0 + Math.min(160, unten - y0) / 2);
    ctx.restore();
  }

  // Fusszeile: woher die Zahlen kommen und wie das Rating entsteht.
  ctx.save();
  ctx.fillStyle = '#5d6e86';
  ctx.font = `600 16px ${familie}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Per player · Damage Dealt as Epic reports it where available, other stats from the match replays · Damage Taken from players only · CompHub Rating = 30% elims, 25% damage, 15% dmg ratio, 10% hits, 20% placement', rand, H - 22);
  ctx.restore();
}
