'use strict';
/* ====================================================================================================================
 * Das tägliche TikTok-Video: Vorspann, die fünf Ersten von Platz fünf bis eins, Abspann. Daten kommen aus window.DATEN (api/tiktok-daten),
 * die Zeitleiste aus der Stimme (tagesvideo.py). Hochformat 1080 x 1920 mit Untertiteln.
 * ================================================================================================================== */
const DATEN = window.DATEN;
const ZEILEN = DATEN.zeilen;
const PUNKTE = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const REGION = { EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };
const SILHOUETTE = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.5" r="4.2"/><path d="M3.6 21c.5-4.4 3.9-7 8.4-7s7.9 2.6 8.4 7z"/></svg>';

/* ---- Vorspann */
szene('intro', (S) => {
  const mitte = mk('div', 'abs', S.el); mitte.style.cssText = 'left:0;right:0;top:0;bottom:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center;padding:0 60px;';
  const logo = mk('img', null, mitte); logo.src = LOGO; logo.style.cssText = 'width:200px;';
  S.tr(logo, 's', .1, 1.0, .55, 1, 'back'); S.tr(logo, 'o', .1, .6, 0, 1, 'lin');
  const c = mk('div', 'chip', mitte, 'Fresh results');
  S.tr(c, 'o', .45, .9, 0, 1, 'lin'); S.tr(c, 'y', .45, 1.1, 30, 0, 'out5');
  const h = kin(mitte, DATEN.titel.replace(/ /g, ' '), 'h2', S, .7, { per: .09 }); h.style.textAlign = 'center'; h.style.fontSize = (DATEN.titel.length > 26 ? 80 : 96) + 'px';
  h.querySelectorAll('.ln').forEach((l) => { l.style.whiteSpace = 'normal'; });
  const sub = mk('div', 'sub', mitte, (REGION[DATEN.region] || DATEN.region) + ' · ' + DATEN.datum); sub.style.cssText += 'font-size:40px;color:#dfe5f1;';
  S.tr(sub, 'o', 1.3, 1.9, 0, 1, 'lin'); S.tr(sub, 'y', 1.3, 2.0, 24, 0, 'out5');
});

/* ---- Die Rangliste: bleibt von Platz fünf bis zum Abspann stehen und fuellt sich von unten nach oben */
const ERSTE = szeneInfo('r' + ZEILEN[ZEILEN.length - 1].rang) || szeneInfo('r5');
const ABSPANN = szeneInfo('outro');
const brett = mk('div', 'abs', stage); brett.style.cssText = 'left:0;top:0;width:100%;height:100%;z-index:10;';
const tStart = szeneInfo('r5').start;
tr(brett, 'o', tStart - .1, tStart + .4, 0, 1, 'lin');
tr(brett, 'o', ABSPANN.start - .25, ABSPANN.start + .25, 1, 0, 'lin');

const kopf = mk('div', 'kopf', brett);
mk('div', 'chip', kopf, 'Top 5 · ' + (REGION[DATEN.region] || DATEN.region));
const titel = mk('div', 'titel' + (DATEN.titel.length > 22 ? ' klein' : ''), kopf, DATEN.titel);
const dat = mk('div', 'sub', kopf, DATEN.datum); dat.style.cssText += 'margin-top:14px;font-size:34px;';

const REIHE_Y0 = 500, REIHE_H = 148, REIHE_G = 12;
ZEILEN.slice().reverse().forEach((z, i) => {           // i = 0 -> Platz 5 (unten), 4 -> Platz 1 (oben)
  const platz = ZEILEN.length - i;                      // Platz 5 liegt unten
  const y = REIHE_Y0 + (platz - 1) * (REIHE_H + REIHE_G);
  const id = 'r' + z.rang;
  const info = szeneInfo(id);
  const erster = z.rang === 1;
  const r = mk('div', 'reihe leer' + (erster ? ' erster' : ''), brett);
  r.style.top = y + 'px';
  mk('div', 'rg', r, '#' + z.rang);
  const fo = mk('div', 'fo', r);
  z.fotos.slice(0, 3).forEach((u) => {
    const d = mk('div', null, fo);
    if (u) { const im = mk('img', null, d); im.src = u; } else d.innerHTML = SILHOUETTE;
  });
  const nm = mk('div', 'nm', r);
  const b = mk('b', null, nm, z.namen.join(' & ')); b.style.fontSize = (z.namen.join(' & ').length > 30 ? 34 : z.namen.join(' & ').length > 20 ? 40 : 50) + 'px';
  const fl = mk('span', null, nm);
  z.laender.filter((l) => /^[A-Za-z]{2}$/.test(l)).slice(0, 3).forEach((l) => { const im = mk('img', null, fl); im.src = BASIS + '/public/flags/' + l.toLowerCase() + '.png'; im.onerror = () => im.remove(); });
  if (erster) { const w = mk('em', null, fl, 'WINNER'); w.style.cssText = 'font-style:normal;font-size:22px;font-weight:900;letter-spacing:.2em;color:#fbbf24;align-self:center;margin-left:8px;'; }
  const pt = mk('div', 'pt', r, '<span>0</span><small>PTS</small>');
  const zahl = pt.querySelector('span');

  // Aufdecken: der leere Platz fuellt sich, wenn die Stimme die Zeile beginnt.
  const a = info.start + .2;
  tr(r, 'y', a, a + .6, 90, 0, 'out5');
  tr(r, 's', a, a + .6, .94, 1, 'out5');
  FRAME.push((t) => {
    const an = t >= a;
    if (an !== r.__an) { r.classList.toggle('leer', !an); r.__an = an; }
    if (an) {
      const u = clamp((t - (a + .35)) / 1.1, 0, 1);
      zahl.textContent = PUNKTE(Math.round(z.punkte * EASE.out(u)));
    }
  });
  if (erster) { tr(r, 's', a + .6, a + 1.0, 1, 1.04, 'soft'); tr(r, 's', a + 1.0, a + 1.5, 1.04, 1, 'soft'); }
});

/* ---- Abspann */
szene('outro', (S) => {
  const mitte = mk('div', 'abs', S.el); mitte.style.cssText = 'left:0;right:0;top:0;bottom:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;';
  const logo = mk('img', null, mitte); logo.src = LOGO; logo.style.cssText = 'width:170px;';
  S.tr(logo, 's', .2, 1.0, .6, 1, 'back'); S.tr(logo, 'o', .2, .6, 0, 1, 'lin');
  const t = mk('div', null, mitte); t.style.cssText = 'font-size:96px;font-weight:900;letter-spacing:-.04em;line-height:1.05;display:flex;';
  const a = .5;
  'thecomphub.com'.split('').forEach((ch, i) => {
    const m = mk('span', 'w', t); m.style.cssText = 'padding:0 .005em .12em 0;margin:0 0 -.12em 0;';
    const s = mk('span', 'wi', m, ch); s.style.color = i < 7 ? 'var(--sky)' : '#fff';
    S.tr(s, 'y', a + i * .035, a + i * .035 + .7, 190, 0, 'out5');
  });
  const lin = mk('div', null, mitte); lin.style.cssText = 'height:5px;border-radius:3px;background:linear-gradient(90deg,var(--sky),#6366f1);width:0;margin-top:6px;';
  S.tr(lin, 'w', a + .6, a + 1.7, 0, 640, 'inout');
  const sub = mk('div', 'sub', mitte, 'Full results, maps and stats<br>A new recap every day'); sub.style.cssText += 'margin-top:26px;font-size:36px;color:#d6ddea;text-align:center;';
  S.tr(sub, 'o', 1.3, 1.9, 0, 1, 'lin'); S.tr(sub, 'y', 1.3, 2.0, 24, 0, 'out5');
});
