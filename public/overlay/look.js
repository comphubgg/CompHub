/*
 * Shared design layer of the overlays (redesign 11/2026) - see look.css.
 *
 *   Look.anwenden(cfg)   applies look, accent, font, position and motion from
 *                        the overlay's settings (all optional):
 *     look       'clean' (default) | 'glass' | 'kante' | 'mono' | 'klassisch'
 *     akzent     accent colour of the look (falls back to cfg.akzent / farbe)
 *     schriftArt 'inter' | 'oswald' | 'barlow' | 'bebas' | 'rajdhani' | 'anton' | ''
 *     vert/horiz/rand  where the overlay sits on a 1920 x 1080 source; unset =
 *                        top left with no margin, exactly as before
 *     animation  'gleiten' (default) | 'blende' | 'ruhig' | 'aus'
 *   Look.neu(el)         plays the "value changed" animation on an element.
 *   Look.zahl(el, wert)  sets a number and animates it when it changed.
 */
(function (global) {
  'use strict';
  var FONTS = {
    inter: { css: "'Inter', 'Segoe UI', sans-serif", g: 'Inter:wght@400;500;600;700;800;900' },
    oswald: { css: "'Oswald', 'Arial Narrow', sans-serif", g: 'Oswald:wght@400;500;600;700' },
    barlow: { css: "'Barlow Condensed', 'Arial Narrow', sans-serif", g: 'Barlow+Condensed:wght@500;600;700;800' },
    bebas: { css: "'Bebas Neue', 'Arial Narrow', sans-serif", g: 'Bebas+Neue' },
    rajdhani: { css: "'Rajdhani', sans-serif", g: 'Rajdhani:wght@500;600;700' },
    anton: { css: "'Anton', Impact, sans-serif" },
  };
  var geladen = {};
  function font(k) {
    var f = FONTS[k];
    if (!f) return '';
    if (!geladen[k]) {
      geladen[k] = true;
      if (f.g) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + f.g + '&display=block';
        document.head.appendChild(l);
      } else {
        var st = document.createElement('style');
        st.textContent = "@font-face{font-family:'Anton';src:url('/fonts/anton-latin.woff2') format('woff2');font-display:block}";
        document.head.appendChild(st);
      }
    }
    return f.css;
  }
  // Inter is the base face of every look.
  font('inter');

  var LOOKS = ['clean', 'glass', 'kante', 'mono', 'klassisch'];
  var ANIMS = ['gleiten', 'blende', 'ruhig', 'aus'];

  function anwenden(cfg) {
    cfg = cfg || {};
    var b = document.body, r = document.documentElement;
    var look = LOOKS.indexOf(cfg.look) >= 0 ? cfg.look : 'clean';
    var anim = ANIMS.indexOf(cfg.animation) >= 0 ? cfg.animation : 'gleiten';
    LOOKS.forEach(function (l) { b.classList.toggle('look-' + l, l === look); });
    ANIMS.forEach(function (a) { b.classList.toggle('anim-' + a, a === anim); });
    if (look === 'kante') font('barlow');
    var akzent = String(cfg.lookAkzent || cfg.akzent || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(akzent)) r.style.setProperty('--lk-akzent', akzent); else r.style.removeProperty('--lk-akzent');
    var f = font(cfg.schriftArt);
    if (f) r.style.setProperty('--lk-font', f); else r.style.removeProperty('--lk-font');
    b.classList.toggle('lk-eigeneSchrift', Boolean(f));
    // Position on the source - only when chosen, so old sources stay where they were.
    var v = ['top', 'middle', 'bottom'].indexOf(cfg.vert) >= 0 ? cfg.vert : '';
    var h = ['left', 'center', 'right'].indexOf(cfg.horiz) >= 0 ? cfg.horiz : '';
    var pos = Boolean(v || h || Number(cfg.rand) > 0);
    r.classList.toggle('lk-pos', pos);
    ['top', 'middle', 'bottom'].forEach(function (x) { b.classList.toggle('lk-v-' + x, pos && (v || 'top') === x); });
    ['left', 'center', 'right'].forEach(function (x) { b.classList.toggle('lk-h-' + x, pos && (h || 'left') === x); });
    r.style.setProperty('--lk-rand', Math.max(0, Math.min(400, Number(cfg.rand) || 0)) + 'px');
  }
  function neu(el) {
    if (!el) return;
    el.classList.remove('lk-neu');
    void el.offsetWidth;
    el.classList.add('lk-neu');
  }
  function zahl(el, wert) {
    if (!el) return;
    var s = String(wert);
    if (el.textContent !== s) {
      var war = el.textContent;
      el.textContent = s;
      if (war !== '') neu(el);
    }
  }
  /*
   * The CompHub house frame around a box: rotating border, faint hero rows.
   *   Look.rahmen(box, cfg)  wraps `box` once (box gets .lk-box) and applies
   *   cfg.rahmen (default on), cfg.rahmenTempo (4 s), cfg.rahmenBreite (2.5 px),
   *   cfg.heroDeck (0.10; 0 = off) and cfg.ecken (corner radius, 14 px).
   */
  var HERO = ['cup-performance', 'karte-1', 'cup-division', 'karte-2', 'cup-global', 'karte-3', 'cup-reload', 'karte-4', 'karte-5', 'karte-6', 'karte-7', 'karte-8'];
  function server() { var p = new URLSearchParams(location.search); return p.get('server') || location.origin; }
  function rahmen(box, cfg, opts) {
    cfg = cfg || {};
    var huelle = box.parentNode && box.parentNode.classList && box.parentNode.classList.contains('lk-rand') ? box.parentNode : null;
    if (!huelle) {
      huelle = document.createElement('div');
      huelle.className = 'lk-rand';
      box.parentNode.insertBefore(huelle, box);
      huelle.appendChild(box);
      box.classList.add('lk-box');
    }
    var an = cfg.rahmen !== false;
    huelle.classList.toggle('aus', !an);
    var st = huelle.style;
    st.setProperty('--lk-bw', Math.max(1, Math.min(8, Number(cfg.rahmenBreite) || 2.5)) + 'px');
    st.setProperty('--lk-rt', Math.max(1, Math.min(30, Number(cfg.rahmenTempo) || 4)) + 's');
    var ecken = cfg.ecken === undefined || cfg.ecken === null || cfg.ecken === '' ? 14 : Math.max(0, Math.min(30, Number(cfg.ecken)));
    st.setProperty('--lk-r', ecken + 'px');
    var deck = cfg.heroDeck === undefined || cfg.heroDeck === null || cfg.heroDeck === '' ? 0.1 : Math.max(0, Math.min(1, Number(cfg.heroDeck)));
    var modus = ['aus', 'hero', 'fotos', 'eigen'].indexOf(cfg.hintergrund) >= 0 ? cfg.hintergrund : 'hero';
    if (deck <= 0) modus = 'aus';
    hintergrund(box, modus, deck, cfg, opts || {});
    wasserzeichen(box, cfg);
    return huelle;
  }
  /*
   * The background inside the box (cfg.hintergrund):
   *   'hero'  (default) the homepage hero rows drifting, cfg.heroDeck opacity
   *   'fotos' the players' photos, blurred, left players behind the left half,
   *           right players behind the right half (opts.fotos = { links: [names],
   *           rechts: [names] }); without any photo it falls back to 'hero'
   *   'eigen' cfg.hintergrundUrl - an image, or a video (.mp4 / .webm), muted loop
   *   'aus'   nothing
   */
  var fotoCache = {};
  function hintergrund(box, modus, deck, cfg, opts) {
    var schicht = box.querySelector(':scope > .lk-hg');
    if (!schicht) { schicht = document.createElement('div'); schicht.className = 'lk-hg'; box.insertBefore(schicht, box.firstChild); }
    schicht.style.setProperty('--lk-hero', String(deck));
    var links = (opts.fotos && opts.fotos.links) || [], rechts = (opts.fotos && opts.fotos.rechts) || [];
    var url = String(cfg.hintergrundUrl || '').trim();
    var key = modus + '|' + (modus === 'fotos' ? links.join(',') + '/' + rechts.join(',') : '') + '|' + (modus === 'eigen' ? url : '');
    if (schicht.dataset.k === key) return;
    schicht.dataset.k = key;
    schicht.textContent = '';
    if (modus === 'aus') return;
    if (modus === 'eigen' && /^(https?:\/\/|\/)/.test(url)) {
      var el;
      if (/\.(mp4|webm)(\?|#|$)/i.test(url)) {
        el = document.createElement('video');
        el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true; el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
        el.src = url;
      } else { el = new Image(); el.alt = ''; el.src = url; }
      el.className = 'lk-hg-voll';
      schicht.appendChild(el);
      return;
    }
    if (modus === 'fotos' && (links.length || rechts.length)) {
      fotosHolen(links.concat(rechts)).then(function (b) {
        if (schicht.dataset.k !== key) return;
        var l = links.map(function (n) { return b[n]; }).filter(Boolean);
        var r = rechts.map(function (n) { return b[n]; }).filter(Boolean);
        if (!l.length && !r.length) { heroBauen(schicht); return; }
        [['links', l], ['rechts', r]].forEach(function (x) {
          var h = document.createElement('div');
          h.className = 'lk-hg-halb ' + x[0];
          x[1].slice(0, 4).forEach(function (src) { var i = new Image(); i.alt = ''; i.src = src; h.appendChild(i); });
          schicht.appendChild(h);
        });
      });
      return;
    }
    heroBauen(schicht);
  }
  function heroBauen(schicht) {
    var hero = document.createElement('div');
    hero.className = 'lk-hero';
    for (var r = 0; r < 4; r++) {
      var reihe = document.createElement('div');
      reihe.className = 'r' + (r % 2 ? ' b' : '');
      var liste = HERO.slice(r * 3).concat(HERO.slice(0, r * 3));
      liste.concat(liste).forEach(function (n) { var i = new Image(); i.alt = ''; i.decoding = 'async'; i.src = server() + '/hero/' + n + '.webp'; reihe.appendChild(i); });
      hero.appendChild(reihe);
    }
    schicht.appendChild(hero);
  }
  /* Our player photos by name - one request for all names, remembered. */
  function fotosHolen(namen) {
    var fehlt = namen.filter(function (n) { return n && !(n in fotoCache); });
    if (!fehlt.length) return Promise.resolve(fotoCache);
    return fetch(server() + '/api/spielerbild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: fehlt }) })
      .then(function (r) { return r.ok ? r.json() : { bilder: {} }; })
      .then(function (j) {
        fehlt.forEach(function (n) { var b = j && j.bilder ? j.bilder[n] : null; fotoCache[n] = b ? (/^https?:/.test(b) ? b : server() + b) : null; });
        return fotoCache;
      })
      .catch(function () { return fotoCache; });
  }
  /*
   * "thecomphub.com", small and half transparent (cfg.wasserzeichen):
   * 'rechts' (default, bottom right) | 'links' (bottom left) | 'kopf' (next to
   * the logo, in the element marked data-lk-kopf) | 'aus'.
   */
  function wasserzeichen(box, cfg) {
    var w = box.querySelector('.lk-url');
    var modus = ['rechts', 'links', 'kopf', 'aus'].indexOf(cfg.wasserzeichen) >= 0 ? cfg.wasserzeichen : 'rechts';
    if (modus === 'aus') { if (w) w.remove(); return; }
    if (!w) { w = document.createElement('span'); w.textContent = 'thecomphub.com'; }
    var kopf = box.querySelector('[data-lk-kopf]');
    w.className = 'lk-url ' + (modus === 'kopf' && kopf ? 'im-kopf' : modus === 'links' ? 'ecke links' : 'ecke rechts');
    var ziel = modus === 'kopf' && kopf ? kopf : box;
    if (w.parentNode !== ziel) ziel.appendChild(w);
  }

  /** The CompHub logo as a small image. */
  function logo(cls) { var i = new Image(); i.alt = ''; i.className = cls || 'lk-logo'; i.src = server() + '/favicon-192.png'; return i; }
  /**
   * Everything of the house style in one call: look classes plus the frame
   * around `box`. With the classic look (or opts.ohneRahmen) the frame,
   * background and watermark stay off - the overlay looks as it used to.
   */
  function haus(box, cfg, opts) {
    anwenden(cfg);
    var klassisch = (cfg && cfg.look) === 'klassisch';
    var aus = klassisch || (opts && opts.ohneRahmen);
    return rahmen(box, aus ? Object.assign({}, cfg, { rahmen: false, heroDeck: 0, wasserzeichen: 'aus' }) : cfg, opts);
  }
  global.Look = { haus: haus, anwenden: anwenden, neu: neu, zahl: zahl, font: font, rahmen: rahmen, logo: logo };
})(window);
