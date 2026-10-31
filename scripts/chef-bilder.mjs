// Vorher/Nachher-Bilder fuer das Logbuch des Chefs - mit roten Rahmen um das, was sich geaendert hat.
//
// Der Betreiber (31.10.2026): "der Chef soll mir das per Screenshot schicken, im Bild markiert, was er geaendert hat - ich bin faul,
// so einfach wie moeglich". Der Chef selbst kann in der Cloud keine Bilder machen (dort fehlen die Zugangsdaten, die Seite zeigt keine
// Daten); deshalb laeuft das hier auf dem PC: je Eintrag und Pfad ein Bild der echten Seite (vorher) und eines von localhost:3200
// (nachher, Zweig claude/chef), Pixel fuer Pixel verglichen, geaenderte Stellen rot umrandet und nummeriert.
//
// Aufruf: node scripts/chef-bilder.mjs [chef-12 ...]   (ohne Ids: alle wartenden Eintraege ohne aktuelles Bild)
// Ergebnis: public/chef-bilder/<id>-<n>-vorher.png, -nachher.png und chef/bilder.json (beides nur lokal, nicht im Zweig).

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const ORDNER = process.cwd();
const ZIEL = path.join(ORDNER, 'public', 'chef-bilder');
const LISTE = path.join(ORDNER, 'chef', 'bilder.json');
const LIVE = 'https://www.thecomphub.com';
const LOKAL = 'http://localhost:3200';
const BREITE = 1440; const HOEHE_MAX = 2600; const ZELLE = 20;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const lies = (p, std) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return std; } };
// Bereiche mit Anmeldung zeigen ohne Konto nur die Sperrseite - ein Bild davon sagt nichts.
const zeigbar = (p) => typeof p === 'string' && p.startsWith('/') && !/^\/(admin|account|dashboard|overlays|sitemap|api)\b/.test(p);

/**
 * Was der Chef im Logbuch als geaendert benennt (Feld "markieren"): "text:Live and coming up" sucht den sichtbaren Text, "css:..." einen
 * Selektor, ein Eintrag ohne Vorsatz gilt als Text. Liefert Rechtecke in Seitenkoordinaten (das Bild beginnt oben an der Seite).
 */
async function stellenVom(seite, markieren) {
  const boxen = [];
  for (const m of markieren ?? []) {
    const roh = String(m ?? '').trim(); if (!roh) continue;
    const loc = roh.startsWith('css:') ? seite.locator(roh.slice(4)) : seite.getByText(roh.replace(/^text:/, ''), { exact: false });
    try {
      // Bei einem Text den ganzen Baustein umranden, nicht nur die Zeile: nach oben gehen, solange das Element flach ist (unter 120 px).
      const b = roh.startsWith('css:') ? await loc.first().boundingBox({ timeout: 3000 })
        : await loc.first().evaluate((el) => {
          let e = el;
          for (let i = 0; i < 5 && e.parentElement && e.getBoundingClientRect().height < 120
            && e.parentElement.getBoundingClientRect().width < window.innerWidth * 0.97; i += 1) e = e.parentElement;
          const r = e.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }, undefined, { timeout: 3000 });
      const y0 = await seite.evaluate(() => window.scrollY).catch(() => 0);
      if (b && b.width > 2 && b.height > 2) boxen.push({ x: b.x - 10, y: b.y + y0 - 10, w: b.width + 20, h: b.height + 20 });
    } catch { /* nicht gefunden */ }
  }
  return boxen;
}

async function foto(seite, url) {
  await seite.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  try { await seite.waitForLoadState('networkidle', { timeout: 15_000 }); } catch { /* weiter mit dem, was steht */ }
  await seite.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => {});
  await seite.waitForTimeout(1500);
  const hoehe = Math.min(HOEHE_MAX, await seite.evaluate(() => document.documentElement.scrollHeight).catch(() => 900));
  return seite.screenshot({ clip: { x: 0, y: 0, width: BREITE, height: Math.max(600, hoehe) }, fullPage: true });
}

/** Geaenderte Stellen als Rechtecke: Raster aus Zellen, Zelle geaendert, wenn die Farben im Mittel deutlich abweichen; Nachbarn verschmelzen. */
async function unterschiede(a, b) {
  const ma = await sharp(a).metadata(); const mb = await sharp(b).metadata();
  const w = Math.min(ma.width, mb.width); const h = Math.min(ma.height, mb.height);
  const ra = await sharp(a).extract({ left: 0, top: 0, width: w, height: h }).raw().ensureAlpha().toBuffer();
  const rb = await sharp(b).extract({ left: 0, top: 0, width: w, height: h }).raw().ensureAlpha().toBuffer();
  const sx = Math.ceil(w / ZELLE); const sy = Math.ceil(h / ZELLE);
  const an = new Uint8Array(sx * sy);
  for (let gy = 0; gy < sy; gy += 1) {
    for (let gx = 0; gx < sx; gx += 1) {
      let summe = 0; let n = 0;
      for (let y = gy * ZELLE; y < Math.min(h, (gy + 1) * ZELLE); y += 2) {
        for (let x = gx * ZELLE; x < Math.min(w, (gx + 1) * ZELLE); x += 2) {
          const i = (y * w + x) * 4;
          summe += Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]); n += 1;
        }
      }
      if (summe / Math.max(1, n) > 24) an[gy * sx + gx] = 1;
    }
  }
  // Zusammenhaengende Zellen (mit einer Zelle Luft) zu Rechtecken.
  const gesehen = new Uint8Array(sx * sy); const boxen = [];
  for (let s = 0; s < an.length; s += 1) {
    if (!an[s] || gesehen[s]) continue;
    let x0 = s % sx; let x1 = x0; let y0 = Math.floor(s / sx); let y1 = y0; let zellen = 0;
    const stapel = [s]; gesehen[s] = 1;
    while (stapel.length) {
      const c = stapel.pop(); const cx = c % sx; const cy = Math.floor(c / sx); zellen += 1;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= sx || ny >= sy) continue;
        const k = ny * sx + nx;
        if (an[k] && !gesehen[k]) { gesehen[k] = 1; stapel.push(k); }
      }
    }
    if (zellen < 2) continue;
    boxen.push({ x: x0 * ZELLE - 8, y: y0 * ZELLE - 8, w: (x1 - x0 + 1) * ZELLE + 16, h: (y1 - y0 + 1) * ZELLE + 16 });
  }
  boxen.sort((p, q) => (q.w * q.h) - (p.w * p.h));
  const anteil = an.reduce((x, v) => x + v, 0) / an.length;
  return { boxen: boxen.slice(0, 12).sort((p, q) => p.y - q.y || p.x - q.x), anteil, w, h };
}

async function markieren(bild, boxen, w, h) {
  const r = boxen.map((b, i) => {
    const x = Math.max(3, b.x); const y = Math.max(3, b.y);
    const bw = Math.min(w - x - 3, b.w); const bh = Math.min(h - y - 3, b.h);
    const ly = y > 44 ? y - 40 : y + 6;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="10" fill="rgba(239,68,68,0.10)" stroke="#ef4444" stroke-width="5"/>`
      + `<circle cx="${x + 18}" cy="${ly + 17}" r="17" fill="#ef4444"/><text x="${x + 18}" y="${ly + 24}" font-family="Arial" font-weight="700" font-size="20" fill="#fff" text-anchor="middle">${i + 1}</text>`;
  }).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${r}</svg>`);
  return sharp(bild).extract({ left: 0, top: 0, width: w, height: h }).composite([{ input: svg }]).png().toBuffer();
}

async function main() {
  const logbuch = lies(path.join(ORDNER, 'chef', 'logbuch.json'), []);
  const bilder = lies(LISTE, {});
  const wunsch = process.argv.slice(2);
  const zuMachen = logbuch.filter((e) => (wunsch.length ? wunsch.includes(e.id) : e.status === 'wartet')
    && (wunsch.length || !bilder[e.id] || bilder[e.id].stand !== (e.commits ?? []).join(',') + (e.runde ?? 1) + (e.markieren ?? []).join('|'))
    && (e.ansehen ?? []).some(zeigbar));
  if (!zuMachen.length) { console.log('Keine neuen Bilder noetig.'); return; }
  fs.mkdirSync(ZIEL, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}) });
  const kontext = await browser.newContext({ viewport: { width: BREITE, height: 900 }, deviceScaleFactor: 1, locale: 'de-DE' });
  // Drei Eintraege zugleich (Betreiber, 31.10.2026: "die Bilder sollen schneller gehen"); die neuesten zuerst.
  zuMachen.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  let naechster = 0;
  const arbeiter = async () => {
    const seite = await kontext.newPage();
    while (naechster < zuMachen.length) {
    const e = zuMachen[naechster++];
    const fotos = [];
    for (const [n, pfad] of (e.ansehen ?? []).filter(zeigbar).slice(0, 3).entries()) {
      try {
        const vorher = await foto(seite, LIVE + pfad);
        const nachher = await foto(seite, LOKAL + pfad);
        // Zuerst die Stellen, die der Chef selbst benennt - die Seite steht noch auf "nachher".
        const benannt = await stellenVom(seite, e.markieren);
        const u = await unterschiede(vorher, nachher);
        // Verschiebt eine Aenderung die ganze Seite (oder wechseln Hintergrundbilder), sagt der Pixelvergleich nichts - dann nur benannte Stellen.
        if (benannt.length) u.boxen = benannt.slice(0, 12);
        else if (u.anteil > 0.35) u.boxen = [];
        const name = `${e.id}-${n + 1}`;
        fs.writeFileSync(path.join(ZIEL, `${name}-vorher.png`), await sharp(vorher).png().toBuffer());
        fs.writeFileSync(path.join(ZIEL, `${name}-nachher.png`), await markieren(nachher, u.boxen, u.w, u.h));
        fotos.push({ pfad, vorher: `/chef-bilder/${name}-vorher.png`, nachher: `/chef-bilder/${name}-nachher.png`, stellen: u.boxen.length, benannt: benannt.length > 0, anteil: Math.round(u.anteil * 100) });
        console.log(`${e.id} ${pfad}: ${u.boxen.length} Stellen (${Math.round(u.anteil * 100)} % der Flaeche)`);
      } catch (f) { console.log(`${e.id} ${pfad}: ${String(f.message).slice(0, 120)}`); }
    }
    bilder[e.id] = { stand: (e.commits ?? []).join(',') + (e.runde ?? 1) + (e.markieren ?? []).join('|'), zeit: new Date().toISOString(), fotos };
    fs.writeFileSync(LISTE, `${JSON.stringify(bilder, null, 1)}\n`);
    }
    await seite.close();
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
  await browser.close();
}

main().catch((f) => { console.error(f); process.exit(1); });
