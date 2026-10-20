'use strict';
/* ====================================================================================================================
 * Die Film-Engine: alles ist eine Funktion der Zeit t - kein Bild haengt von der Wiedergabe ab. render(t) stellt jedes Element auf den
 * Stand von t; ein Aufnahmeprogramm ruft sie Bild fuer Bild und legt Standbilder ab (render.py).
 *
 * Zwei Formate aus denselben Szenen: "quer" (1920 x 1080, fuer X, YouTube, die Webseite) und "hoch" (1080 x 1920, fuer TikTok). window.FORMAT und
 * window.TIMELINE setzt das Aufnahmeprogramm vor dem Laden. Im Hochformat laufen dazu Untertitel (aus den Wortzeiten der Stimme), weil auf TikTok
 * viele ohne Ton schauen.
 * ================================================================================================================== */
const FORMAT = window.FORMAT || 'quer';
const V = FORMAT === 'hoch';
const SW = V ? 1080 : 1920;
const SH = V ? 1920 : 1080;
const TL = window.TIMELINE;              // timeline*.json (vom Aufnahmeprogramm eingesetzt)
const BASIS = window.BASIS != null ? window.BASIS : '..';   // wo public/ liegt ('' = Wurzel des Servers)
const stage = document.getElementById('stage');
if (V) document.documentElement.classList.add('v');

const EASE = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  inout: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in: (t) => t * t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  soft: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const REG = new Set();      // Elemente mit Spuren
const CAMS = new Set();     // Elemente mit Kamera
const FRAME = [];           // Funktionen, die jedes Bild laufen

function mk(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

/* Eine Spur: Eigenschaft prop geht von Zeit t0 bis t1 von a nach b. Zeiten sind global (Sekunden im Film). */
function tr(el, prop, t0, t1, a, b, e) {
  (el.__tr ||= {});
  (el.__tr[prop] ||= []).push({ t0, t1, a, b, e: e || 'out' });
  REG.add(el);
  return el;
}
function wert(segs, t) {
  if (!segs.sorted) { segs.sort((p, q) => p.t0 - q.t0); segs.sorted = true; }
  let v = segs[0].a;
  for (const g of segs) {
    if (t >= g.t1) v = g.b;
    else { if (t > g.t0) v = lerp(g.a, g.b, EASE[g.e]((t - g.t0) / (g.t1 - g.t0))); break; }
  }
  return v;
}

/* Kamera auf einem Bild im Fenster: Schluessel {t, cx, cy, z, e} - Mittelpunkt im Bild (Pixel) und Zoom (1 = Breite des Fensters). */
function cam(zoomEl, vw, vh, w0, h0, keys) {
  zoomEl.__cam = { vw, vh, w0, h0, keys };
  CAMS.add(zoomEl);
}
function kameraStand(c, t) {
  const k = c.keys;
  let cx = k[0].cx, cy = k[0].cy, z = k[0].z;
  for (let i = 1; i < k.length; i += 1) {
    if (t >= k[i].t) { cx = k[i].cx; cy = k[i].cy; z = k[i].z; }
    else {
      if (t > k[i - 1].t) {
        const u = EASE[k[i].e || 'inout']((t - k[i - 1].t) / (k[i].t - k[i - 1].t));
        cx = lerp(k[i - 1].cx, k[i].cx, u); cy = lerp(k[i - 1].cy, k[i].cy, u); z = lerp(k[i - 1].z, k[i].z, u);
      }
      break;
    }
  }
  const s = (c.vw / c.w0) * z;
  let tx = c.vw / 2 - cx * s, ty = c.vh / 2 - cy * s;
  tx = c.w0 * s <= c.vw ? (c.vw - c.w0 * s) / 2 : clamp(tx, c.vw - c.w0 * s, 0);
  ty = c.h0 * s <= c.vh ? (c.vh - c.h0 * s) / 2 : clamp(ty, c.vh - c.h0 * s, 0);
  return { s, tx, ty };
}

function render(t) {
  for (const el of REG) {
    const p = el.__tr;
    const v = {};
    for (const k in p) v[k] = wert(p[k], t);
    const tf = [];
    if ('x' in v || 'y' in v || 'z' in v) tf.push('translate3d(' + (v.x || 0) + 'px,' + (v.y || 0) + 'px,' + (v.z || 0) + 'px)');
    if ('rx' in v) tf.push('rotateX(' + v.rx + 'deg)');
    if ('ry' in v) tf.push('rotateY(' + v.ry + 'deg)');
    if ('r' in v) tf.push('rotate(' + v.r + 'deg)');
    if ('s' in v) tf.push('scale(' + v.s + ')');
    if (tf.length) el.style.transform = tf.join(' ');
    if ('o' in v) { el.style.opacity = v.o; el.style.visibility = v.o <= 0.001 ? 'hidden' : 'visible'; }
    if ('bl' in v || 'br' in v) el.style.filter = 'blur(' + (v.bl || 0) + 'px) brightness(' + (v.br == null ? 1 : v.br) + ')';
    if ('w' in v) el.style.width = v.w + 'px';
    if ('hh' in v) el.style.height = v.hh + 'px';
  }
  for (const el of CAMS) {
    const c = el.__cam; const k = kameraStand(c, t);
    el.style.transform = 'translate(' + k.tx + 'px,' + k.ty + 'px) scale(' + k.s + ')';
    el.style.setProperty('--s', k.s);
  }
  for (const f of FRAME) f(t);
}

/* ------------------------------------------------------------------ Bausteine */

const SZENEN = {};
const szeneInfo = (id) => TL.szenen.find((s) => s.id === id);
const hat = (id) => !!szeneInfo(id);

/** Zeit (lokal in der Szene) des n-ten Wortes, das 'wort' enthaelt ('=' vorn: genau dieses Wort). */
function cue(id, wort, n) {
  const s = szeneInfo(id);
  const exakt = String(wort).startsWith('=');
  const ziel = String(wort).replace(/^=/, '').toLowerCase();
  let zaehler = 0;
  for (const w of s.woerter) {
    const wn = w.w.toLowerCase().replace(/[^a-z0-9']/g, '');
    if (exakt ? wn === ziel : wn.includes(ziel)) { if (zaehler === (n || 0)) return s.audioStart + w.t; zaehler += 1; }
  }
  throw new Error('Wort nicht gefunden: ' + id + ' / ' + wort);
}

/** Eine Szene bauen - nur, wenn sie in dieser Zeitleiste vorkommt (die TikTok-Teile enthalten nur einen Ausschnitt). */
function szene(id, bauen, opt) {
  if (!hat(id)) return null;
  const info = szeneInfo(id);
  const el = mk('section', 'scene' + ((opt && opt.vip) ? ' vipszene' : ''), stage);
  el.id = 'szene-' + id;
  const S = {
    id, el, t0: info.start, L: info.laenge, info,
    tr: (e, prop, a, b, x, y, ease) => tr(e, prop, S.t0 + a, S.t0 + b, x, y, ease),
    cue: (wort, n) => cue(id, wort, n),
  };
  /* Ueberblendung: ein, aus (die naechste Szene beginnt eine halbe Sekunde vor dem Ende). */
  const erste = TL.szenen[0].id === id, letzte = TL.szenen[TL.szenen.length - 1].id === id;
  if (!erste) S.tr(el, 'o', 0, .5, 0, 1, 'lin'); else tr(el, 'o', -1, 0, 1, 1, 'lin');
  S.tr(el, 'o', S.L - (letzte ? 1.2 : .5), S.L, 1, 0, 'lin');
  bauen(S);
  SZENEN[id] = S;
  return S;
}

/** Kinetische Schrift: Zeilen mit <br>, Woerter steigen aus einer Maske. */
function kin(parent, text, cls, S, t0, opt) {
  const o = Object.assign({ per: .07, dur: .75, y: 120 }, opt || {});
  const h = mk('div', cls, parent);
  let i = 0;
  text.split('<br>').forEach((zeile) => {
    const ln = mk('span', 'ln', h);
    zeile.split(' ').forEach((wort) => {
      const klasse = wort.startsWith('*') ? 'acc' : '';
      const w = mk('span', 'w', ln);
      const wi = mk('span', 'wi ' + klasse, w, wort.replace(/^\*/, ''));
      S.tr(wi, 'y', t0 + i * o.per, t0 + i * o.per + o.dur, o.y, 0, 'out5');
      S.tr(wi, 'o', t0 + i * o.per, t0 + i * o.per + .25, 0, 1, 'lin');
      i += 1;
    });
  });
  return h;
}

function eyebrow(parent, text, S, t0) {
  const e = mk('div', 'eyebrow', parent, '<i></i>' + text);
  S.tr(e, 'x', t0, t0 + .7, -40, 0, 'out5');
  S.tr(e, 'o', t0, t0 + .5, 0, 1, 'lin');
  return e;
}

function pill(parent, text, S, t0, opt) {
  const p = mk('div', 'pill', parent, '<b></b>' + text);
  S.tr(p, 'y', t0, t0 + .6, 36, 0, 'out5');
  S.tr(p, 'o', t0, t0 + .4, 0, 1, 'lin');
  if (opt && opt.out != null) S.tr(p, 'o', opt.out, opt.out + .4, 1, 0, 'lin');
  return p;
}

/**
 * Ein Browserfenster mit einem oder mehreren Bildern. bilder: [{ src, w0, h0 }]. Gibt { el, zoom: [...], vw, vh } zurueck.
 */
function fenster(parent, S, opt) {
  const p3 = mk('div', 'p3d', parent);
  const w = mk('div', 'win', p3);
  w.style.left = opt.x + 'px'; w.style.top = opt.y + 'px'; w.style.width = opt.w + 'px'; w.style.height = opt.h + 'px';
  const bar = mk('div', 'bar', w);
  mk('i', 'pt', bar); mk('i', 'pt', bar); mk('i', 'pt', bar);
  mk('div', 'url', bar, opt.url || 'thecomphub.com');
  const view = mk('div', 'view', w);
  const vw = opt.w, vh = opt.h - 52;
  const zooms = opt.bilder.map((b) => {
    const z = mk('div', 'zoom', view);
    z.style.width = b.w0 + 'px'; z.style.height = b.h0 + 'px';
    const im = mk('img', null, z);
    im.src = BASIS + '/video-werkstatt/' + b.src; im.width = b.w0; im.height = b.h0;
    z.__b = b;
    return z;
  });
  return { el: w, p3, view, zoom: zooms, vw, vh };
}

/** Ein Hervorhebungsrahmen im Bild (Bildpixel; D() rechnet vom 2000-Pixel-Ansichtsmass um). */
const D = (x, y, w, h) => [x * 1.08, y * 1.08, w * 1.08, h * 1.08];
function hl(zoomEl, S, box, label, tIn, tOut, opt) {
  const [x, y, w, h] = box;
  const e = mk('div', 'hl', zoomEl, label ? '<div class="lb' + ((opt && opt.unten) ? ' u' : '') + '">' + label + '</div>' : '');
  e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = w + 'px'; e.style.height = h + 'px';
  if (opt && opt.lx) { const lb = e.querySelector('.lb'); if (lb) lb.style.left = opt.lx + 'px'; }
  S.tr(e, 'o', tIn, tIn + .35, 0, 1, 'out');
  S.tr(e, 'o', tOut, tOut + .35, 1, 0, 'out');
  return e;
}

/** Bildwechsel im selben Fenster: zoomEl blendet ein/aus. */
function zeige(zoomEl, S, a, b) {
  S.tr(zoomEl, 'o', a - .01, a, 0, 0, 'lin');
  S.tr(zoomEl, 'o', a, a + .45, 0, 1, 'out');
  if (b != null) S.tr(zoomEl, 'o', b, b + .45, 1, 0, 'out');
}
function nurErstes(zoomEl, S, bis) { tr(zoomEl, 'o', -1, 0, 1, 1, 'lin'); S.tr(zoomEl, 'o', bis, bis + .45, 1, 0, 'out'); }

/**
 * Der Standardaufbau einer Szene: links/rechts (quer) oder oben (hoch) die Schrift - Vorspann, Schlagzeile, Marken -, daneben/darunter ein
 * geneigtes Browserfenster. c.q = die Anordnung im Querformat (so wie die Szenen urspruenglich gebaut wurden), im Hochformat gilt eine feste.
 *
 *   c = { eb, head, cls, pills: [[Text, Zeit], ...], url, bilder, q: { text: {x,y,w}, pills: {x,y}, win: {x,y,w,h}, tilt: [von, bis, danach], enter: {x,y} } }
 */
function rahmen(S, c) {
  const g = V ? {
    text: { x: 64, y: 140, w: 952 }, pills: { x: 64, y: 478 }, win: { x: 40, y: 700, w: 1000, h: 640 }, tilt: [10, 3, 1.5], enter: { x: 0, y: 150 },
  } : c.q;
  const text = mk('div', 'abs', S.el); text.style.cssText = 'left:' + g.text.x + 'px;top:' + g.text.y + 'px;width:' + g.text.w + 'px;';
  eyebrow(text, c.eb, S, .4);
  const h = kin(text, c.head, c.cls || 'h1', S, .7); h.style.marginTop = (V ? 22 : 28) + 'px';
  let col = null;
  if (c.pills && c.pills.length && g.pills) {
    col = mk('div', 'abs pills', S.el);
    col.style.cssText = 'left:' + g.pills.x + 'px;top:' + g.pills.y + 'px;' + (V ? 'width:952px;' : '');
    c.pills.forEach(([txt, t]) => pill(col, txt, S, t));
  }
  const f = fenster(S.el, S, { x: g.win.x, y: g.win.y, w: g.win.w, h: g.win.h, url: c.url, bilder: c.bilder });
  const [t0, t1, t2] = g.tilt;
  S.tr(f.el, 'ry', 0, 1.4, t0, t1, 'out5');
  if (g.enter.x) S.tr(f.el, 'x', 0, 1.4, g.enter.x, 0, 'out5');
  if (g.enter.y) S.tr(f.el, 'y', 0, 1.4, g.enter.y, 0, 'out5');
  S.tr(f.el, 'o', 0, .6, 0, 1, 'lin');
  S.tr(f.el, 'ry', 1.4, S.L, t1, t2, 'soft');
  return { f, text, col, h };
}

/* ------------------------------------------------------------------ Hintergrund */
const bg = mk('div', 'layer', stage); bg.style.zIndex = 0;
const blobs = (V ? [
  { c: '#0b5f8a', x: 200, y: 380, r: 520 }, { c: '#312e81', x: 900, y: 1500, r: 640 }, { c: '#075985', x: 900, y: 200, r: 420 },
] : [
  { c: '#0b5f8a', x: 300, y: 250, r: 520 }, { c: '#312e81', x: 1500, y: 800, r: 640 }, { c: '#075985', x: 1500, y: 150, r: 420 },
]).map((b) => { const e = mk('div', 'blob', bg); e.style.width = e.style.height = (b.r * 2) + 'px'; e.style.background = b.c; return { e, b }; });
mk('div', 'gitter', bg);
FRAME.push((t) => {
  blobs.forEach(({ e, b }, i) => {
    const px = b.x + Math.sin(t * .13 + i * 2.1) * 140, py = b.y + Math.cos(t * .11 + i * 1.3) * 90;
    e.style.transform = 'translate(' + (px - b.r) + 'px,' + (py - b.r) + 'px)';
  });
});

/* Wasserzeichen: das Logo klein, ausser im Vor- und Abspann. */
const LOGO = BASIS + '/public/logos/CompHub-Logo-frei.png';
const wm = mk('img', null, stage);
wm.src = LOGO;
wm.style.cssText = V ? 'position:absolute;right:48px;top:64px;width:64px;z-index:50;opacity:0;' : 'position:absolute;right:56px;bottom:46px;width:54px;z-index:50;opacity:0;';
FRAME.push((t) => {
  const erste = TL.szenen[0], letzte = TL.szenen[TL.szenen.length - 1];
  const an = erste.id === 'intro' ? clamp((t - (erste.start + erste.laenge)) / .6, 0, 1) : 1;
  const aus = letzte.id === 'outro' ? 1 - clamp((t - (letzte.start - .2)) / .6, 0, 1) : 1;
  wm.style.opacity = (.55 * an * aus).toFixed(3);
});

/* Teil x von y (nur Hochformat, nur bei den TikTok-Teilen): oben links, nicht im Vorspann. */
if (V && TL.teil) {
  const tg = mk('div', 'teiltag', stage, 'PART ' + TL.teil.nr + ' / ' + TL.teil.von);
  FRAME.push((t) => {
    const erste = TL.szenen[0];
    const vorspann = erste.id === 'intro' && t < erste.start + erste.laenge;
    tg.style.opacity = vorspann ? 0 : 1;
  });
}

/* Untertitel (nur Hochformat): die Woerter der Stimme in kurzen Satzstuecken, das gerade gesprochene leuchtet. */
if (V) {
  const box = mk('div', 'untertitel', stage);
  const phrasen = [];
  TL.szenen.forEach((s) => {
    let akt = null;
    s.woerter.forEach((w, i) => {
      const t0 = s.start + s.audioStart + w.t, t1 = t0 + w.d;
      const luecke = akt && t0 - akt.ende > 0.45;
      const lang = akt && (akt.w.length >= 5 || akt.zeichen > 26);
      const satz = akt && /[.!?]$/.test(akt.w[akt.w.length - 1].w);
      if (!akt || luecke || lang || satz) { akt = { w: [], zeichen: 0, ende: t1, start: t0, szene: s.id }; phrasen.push(akt); }
      akt.w.push({ w: w.w, t0, t1 }); akt.zeichen += w.w.length + 1; akt.ende = t1;
    });
  });
  const aus = phrasen.map((p) => {
    const e = mk('div', 'ut', box);
    p.el = e; p.sp = p.w.map((w) => mk('span', null, e, w.w + ' '));
    return p;
  });
  aus.forEach((p, i) => { p.bis = i + 1 < aus.length ? Math.min(p.ende + .45, aus[i + 1].start - .03) : p.ende + .45; });
  FRAME.push((t) => {
    for (const p of aus) {
      const sicht = t >= p.start - .02 && t < p.bis;
      p.el.style.display = sicht ? 'block' : 'none';
      if (sicht) p.w.forEach((w, i) => { p.sp[i].className = (t >= w.t0 && t < w.t1 + .05) ? 'jetzt' : (t >= w.t1 ? 'schon' : ''); });
    }
  });
}
