'use strict';
/* ====================================================================================================================
 * Das tägliche TikTok-Video: Vorspann, die fünf Ersten von Platz fünf bis eins, Abspann. Daten kommen aus window.DATEN (api/tiktok-daten),
 * die Zeitleiste aus der Stimme (tagesvideo.py). Hochformat 1080 x 1920 mit Untertiteln.
 * ================================================================================================================== */
const DATEN = window.DATEN;
const ZEILEN = DATEN.zeilen;
const PUNKTE = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const REGION = { EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };
/* Kopf (Betreiber, 20.10.2026): der Cup gross, darunter der Spieltag ("Event 8"), darunter die Stufe ("Finals"), dazu Marken fuer Modus und Spieltag. */
const CUP = DATEN.cupName || DATEN.titel;
const GROESSE = CUP.length <= 18 ? 104 : CUP.length <= 30 ? 88 : CUP.length <= 44 ? 72 : 60;
const RAND = (REGION[DATEN.region] || DATEN.region) + ' · ' + DATEN.datum;
const MARKEN = (DATEN.marken || []).filter((m) => m.length <= 14);
function marken(eltern) {
  const z = mk('div', 'marken', eltern);
  MARKEN.forEach((m) => mk('span', 'marke' + (/^finals?$/i.test(m) ? ' gold' : ''), z, m));
  return z;
}
function zeilenUnterTitel(eltern) {
  if (DATEN.spieltag) mk('div', 'spieltag', eltern, DATEN.spieltag);
  mk('div', 'randzeile', eltern, (DATEN.stufe ? '<em' + (DATEN.stufe === 'Finals' ? ' class="gold"' : '') + '>' + DATEN.stufe.toUpperCase() + '</em>' : '') + '<span>' + RAND + '</span>');
}
const SILHOUETTE = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.5" r="4.2"/><path d="M3.6 21c.5-4.4 3.9-7 8.4-7s7.9 2.6 8.4 7z"/></svg>';

/* ---- Vorspann */
szene('intro', (S) => {
  const mitte = mk('div', 'abs', S.el); mitte.style.cssText = 'left:0;right:0;top:0;bottom:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center;padding:0 60px;';
  const logo = mk('img', null, mitte); logo.src = LOGO; logo.style.cssText = 'width:200px;';
  S.tr(logo, 's', .1, 1.0, .55, 1, 'back'); S.tr(logo, 'o', .1, .6, 0, 1, 'lin');
  const c = mk('div', 'marken mitte', mitte); mk('span', 'chip', c, 'Fresh results'); MARKEN.forEach((m) => mk('span', 'marke' + (/^finals?$/i.test(m) ? ' gold' : ''), c, m));
  S.tr(c, 'o', .45, .9, 0, 1, 'lin'); S.tr(c, 'y', .45, 1.1, 30, 0, 'out5');
  const h = kin(mitte, CUP, 'h2', S, .7, { per: .09 }); h.style.textAlign = 'center'; h.style.fontSize = Math.min(GROESSE + 8, 112) + 'px';
  h.querySelectorAll('.ln').forEach((l) => { l.style.whiteSpace = 'normal'; });
  const unter = mk('div', 'unter mitte', mitte); zeilenUnterTitel(unter);
  S.tr(unter, 'o', 1.3, 1.9, 0, 1, 'lin'); S.tr(unter, 'y', 1.3, 2.0, 24, 0, 'out5');
});

/* ---- Die Rangliste: bleibt von Platz fünf bis zum Abspann stehen und fuellt sich von unten nach oben */
const ERSTE = szeneInfo('r' + ZEILEN[ZEILEN.length - 1].rang) || szeneInfo('r5');
const ABSPANN = szeneInfo('outro');
const brett = mk('div', 'abs', stage); brett.style.cssText = 'left:0;top:0;width:100%;height:100%;z-index:10;';
const tStart = szeneInfo('r5').start;
tr(brett, 'o', tStart - .1, tStart + .4, 0, 1, 'lin');
tr(brett, 'o', ABSPANN.start - .25, ABSPANN.start + .25, 1, 0, 'lin');

const kopf = mk('div', 'kopf', brett);
{ const z = marken(kopf); z.insertBefore(mk('span', 'marke grau', null, 'Top 5'), z.firstChild); }
const titel = mk('div', 'titel', kopf, CUP); titel.style.fontSize = GROESSE + 'px';
zeilenUnterTitel(kopf);

const REIHE_Y0 = 540, REIHE_H = 148, REIHE_G = 12;
ZEILEN.slice().reverse().forEach((z, i) => {           // i = 0 -> Platz 5 (unten), 4 -> Platz 1 (oben)
  const platz = ZEILEN.length - i;                      // Platz 5 liegt unten
  const y = REIHE_Y0 + (platz - 1) * (REIHE_H + REIHE_G);
  const id = 'r' + z.rang;
  const info = szeneInfo(id);
  const erster = z.rang === 1;
  const gr = Math.min(3, Math.max(1, z.namen.length));
  const r = mk('div', 'reihe leer t' + gr + (erster ? ' erster' : ''), brett);
  r.style.top = y + 'px';
  mk('div', 'rg', r, '#' + z.rang);
  const fo = mk('div', 'fo', r);
  z.fotos.slice(0, 3).forEach((u) => {
    const d = mk('div', null, fo);
    if (u) { const im = mk('img', null, d); im.src = u; } else d.innerHTML = SILHOUETTE;
  });
  const nm = mk('div', 'nm' + (gr > 1 ? ' team' : ''), r);
  let fl;
  if (gr > 1) {
    // Duo/Trio: je Spieler eine Zeile mit eigener Flagge (die Namen stehen so, wie sie auf der Cup-Seite stehen).
    z.namen.slice(0, 3).forEach((n, j) => {
      const p = mk('div', 'pn', nm);
      const l = z.laender[j] || '';
      if (/^[A-Za-z]{2}$/.test(l)) { const im = mk('img', null, p); im.src = BASIS + '/public/flags/' + l.toLowerCase() + '.png'; im.onerror = () => im.remove(); }
      const b = mk('b', null, p, n); b.style.fontSize = (gr === 3 ? 33 : 42) + 'px';
    });
    fl = mk('span', null, nm);
  } else {
    const b = mk('b', null, nm, z.namen.join(' & ')); b.style.fontSize = (z.namen.join(' & ').length > 30 ? 34 : z.namen.join(' & ').length > 20 ? 40 : 50) + 'px';
    // Eine Zeile dazu, wieso dieser Platz (eigene Videos): "$451,875 in 57 events - #1 in prize money".
    if (z.beschreibung) mk('div', 'besch', nm, z.beschreibung);
    fl = mk('span', null, nm);
    // Mit Beschreibung ist kein Platz fuer die Flaggen-Zeile (zwei Zeilen Text) - die Flagge steht dann nur im Namen-Kopf der Cup-Videos.
    if (z.beschreibung) fl.style.display = 'none';
    else z.laender.filter((l) => /^[A-Za-z]{2}$/.test(l)).slice(0, 3).forEach((l) => { const im = mk('img', null, fl); im.src = BASIS + '/public/flags/' + l.toLowerCase() + '.png'; im.onerror = () => im.remove(); });
  }
  if (erster && gr === 1 && !z.beschreibung) { const w = mk('em', null, fl, DATEN.erstBadge || 'WINNER'); w.style.cssText = 'font-style:normal;font-size:22px;font-weight:900;letter-spacing:.2em;color:#fbbf24;align-self:center;margin-left:' + (gr > 1 ? 0 : 8) + 'px;'; }
  // Eigene Videos (Top 5 des Jahres, Spieler-Rueckblick): die Zahl rechts kann ein Betrag mit Zeichen davor sein ("$451,875") oder fester Text ("#1"), die Bezeichnung darunter wechselt.
  const einheit = z.einheit || 'PTS';
  const pt = mk('div', 'pt', r, '<span>' + (z.wertText ? z.wertText : (z.praefix || '') + '0') + '</span><small>' + einheit + '</small>');
  const zahl = pt.querySelector('span');
  if (z.untertitel) mk('small', 'sub', pt, z.untertitel);
  if ((z.wertText || String(z.punkte)).length + (z.praefix || '').length > 7) pt.style.fontSize = '44px';

  // Aufdecken: der leere Platz fuellt sich, wenn die Stimme die Zeile beginnt.
  const a = info.start + .2;
  tr(r, 'y', a, a + .6, 90, 0, 'out5');
  tr(r, 's', a, a + .6, .94, 1, 'out5');
  FRAME.push((t) => {
    const an = t >= a;
    if (an !== r.__an) { r.classList.toggle('leer', !an); r.__an = an; }
    if (an) {
      const u = clamp((t - (a + .35)) / 1.1, 0, 1);
      if (!z.wertText) zahl.textContent = (z.praefix || '') + PUNKTE(Math.round(z.punkte * EASE.out(u)));
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
