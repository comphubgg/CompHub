/*
 * The Finest Creative scoreboard page (PRIVATE) - served only by
 * app/overlays/finest/live/route.ts after the access check, never from
 * public/. Plain HTML + JS like the other overlays in public/overlay/; kept
 * here as a string so it ships inside the server bundle and nowhere else.
 * Edit it like an HTML file: no backticks and no dollar-brace inside.
 */
export const FC_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Finest Creative scoreboard</title>
<!--
  Finest Creative scoreboard - PRIVATE. Served only by
  app/overlays/finest/live/route.ts (never from public/): with a saved
  overlay's id and secret view key, or for someone signed in with the
  "finest" tick (lib/finestZugang). Settings, score and the partner's files
  (logo, clip, thumbnail from the private archive via /api/finest/datei) are
  fetched with the same key. There is deliberately no "plain URL params" mode.

    ?id=<id>&k=<key>  saved overlay (/overlays/finest). Score from the control
                      page arrives within ~1 s.
    ?vorschau=<json>  only inside the configurator (same-origin frame).

  House style: /overlay/look.css + look.js - the rotating border (Look.rahmen,
  here in gold/black), position (Look.anwenden) and the size report that lets
  the configurator crop its preview to the scoreboard.
  Flags: the real ones from our profile data (/api/spieler-laender?wer=),
  never typed in.

  Look (operator-approved mockup v3, 11/2026): a map-promo header - looping
  clip of the map, a thin hazard stripe, logo + map title, then "Search:
  FINEST" and the island code - over a clean semi-transparent black panel
  with plain Inter text. The stripe is the only pattern; yellow only for small
  accents (search term, round dots, compact scores). Text never wraps: the
  map title is cut with an ellipsis.

  Variants:  leiste (1v1 top bar) · stapel (3v3 stacked) · seite (4v4 sidebar)
             · kompakt (2v2 compact with round dots)
             · liste (3+ teams, one row per team) · spalten (3-4 teams, one column each)
  2-4 teams with 1-4 players each (teams, spieler1..4, punkte1..4, name1..4).
  With more than two teams the two-sided variants switch to liste / spalten.
-->
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&display=block">
<link rel="stylesheet" href="/overlay/look.css">
<script src="/overlay/look.js"></script>
<meta name="robots" content="noindex, nofollow">
<style>
:root {
  --gelb: #f5b82e;
  --panel: 10 10 12;
  --deck: .7;
  --text: #ffffff;
  --mass: 1;
  --rand: 30px;
  --unschaerfe: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
[hidden] { display: none !important; }
html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; -webkit-font-smoothing: antialiased; }
body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; color: var(--text); }

#board { zoom: var(--mass); opacity: 0; transition: opacity .3s ease; }
#board.da { opacity: 1; }

/*
 * The whole scoreboard sits in the house frame (look.css .lk-rand, built by
 * Look.rahmen): a thin rotating conic border, here mostly black with a gold
 * highlight. Border only - masked to the ring, the body stays see-through.
 */
.box > .lk-rand { display: block; box-shadow: 0 10px 30px rgba(0, 0, 0, .3); }
.box > .lk-rand::before {
  background: conic-gradient(from var(--lk-a), var(--r0) 0deg, var(--r0) 200deg, var(--r1) 250deg, var(--r2) 290deg, var(--r3) 305deg, var(--r2) 320deg, var(--r0) 360deg);
}
.innen { border-radius: 14px; overflow: hidden; }
:root { --r0: #111111; --r1: #7a5a12; --r2: #f5b82e; --r3: #ffe9a8; }
/* Real flags next to the names (from our profile data). */
.fl { display: inline-block; height: .74em; width: auto; max-width: 1.4em; margin: 0 .34em .06em 0; border-radius: 2px; vertical-align: baseline; box-shadow: 0 0 0 1px rgba(0, 0, 0, .25); }
.fl.nach { margin: 0 0 .06em .34em; }

.head {
  /* one low row across the full width: thumbnail · title · search · code */
  --kh: calc(52px * var(--kmass, 1));
  position: relative;
  height: var(--kh);
  overflow: hidden;
  background: #101318;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}
.head .bg { position: absolute; inset: 0; }
.head .bg video, .head .bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(.72) saturate(1.1); }
.head .bg img.unscharf { filter: blur(6px) brightness(.72) saturate(1.1); transform: scale(1.1); }
.head .dunkel { position: absolute; inset: 0; background: rgba(8, 10, 14, var(--kd)); }
.head .linie { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--gelb), #ff7a1a, var(--gelb)); }
.head .inhalt {
  position: absolute; inset: 0;
  display: flex; align-items: center; gap: calc(var(--kh) * .27);
  padding: 0 calc(var(--kh) * .3);
}
.head .thumb {
  flex: 0 0 auto;
  height: calc(var(--kh) * .77); aspect-ratio: 70 / 40;
  border-radius: calc(var(--kh) * .115);
  border: 1.5px solid rgba(255, 255, 255, .85);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .5);
  overflow: hidden;
  background: #fff;
  will-change: transform, opacity;
}
.head .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.head .thumb.logo { display: grid; place-items: center; }
.head .thumb.logo img { width: 72%; height: 72%; object-fit: contain; }
.head .tx { flex: 1 1 0; width: 0; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: calc(var(--kh) * .3); }
.head .tt {
  display: flex; align-items: center; gap: calc(var(--kh) * .12);
  min-width: 0; flex: 0 1 auto;
  font-size: calc(var(--kh) * .404 * var(--fit, 1));
  font-weight: 900; letter-spacing: .015em; color: #fff;
  white-space: nowrap; overflow: hidden;
  text-shadow: 0 2px 6px rgba(0, 0, 0, .6);
  will-change: transform, opacity;
}
.head .tt img { height: .85em; flex: 0 0 auto; }
.head .tt b { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 900; }
.head .rw {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: calc(var(--kh) * .3);
  font-size: calc(var(--kh) * .23 * var(--fitR, 1));
  font-weight: 800; letter-spacing: .07em; color: #fff; white-space: nowrap;
  text-shadow: 0 1px 4px rgba(0, 0, 0, .7);
}
.head .rw .such, .head .rw .c { will-change: transform, opacity; }
.head .rw .such { display: inline-flex; align-items: center; gap: .4em; }
.head .rw svg { width: 1em; height: 1em; }
.head .rw .y { color: #ffd23f; }
.head .rw .c { font-variant-numeric: tabular-nums; }
.v3 .head .rw .c { display: none; }
.v3 .head .tt { font-size: calc(var(--kh) * .346 * var(--fit, 1)); }
.v3 .head .rw { font-size: calc(var(--kh) * .212 * var(--fitR, 1)); }
.klein .head { --kh: calc(40px * var(--kmass, 1)); }
.klein .head .thumb { height: calc(var(--kh) * .75); }
.klein .head .rw { gap: calc(var(--kh) * .25); font-size: calc(var(--kh) * .25 * var(--fitR, 1)); }
/* The loop (transform/opacity only). JS sets the phase classes; durations come from --t. */
.head .thumb, .head .tt, .head .rw .such, .head .rw .c {
  transition: transform calc(var(--t) * 600ms) cubic-bezier(.2, .8, .2, 1), opacity calc(var(--t) * 450ms) ease;
}
.head.p-leer .thumb { opacity: 0; transform: translateX(var(--mitte)) scale(.55); }
.head.p-pop .thumb { opacity: 1; transform: translateX(var(--mitte)) scale(1.15); }
.head.p-leer .tt, .head.p-pop .tt, .head.p-links .tt { opacity: 0; transform: translateY(18%); }
.head.p-leer .such, .head.p-pop .such, .head.p-links .such, .head.p-titel .such { opacity: 0; transform: translateY(30%); }
.head.p-leer .c, .head.p-pop .c, .head.p-links .c, .head.p-titel .c, .head.p-suche .c { opacity: 0; }
.head.p-aus .thumb { opacity: 0; transform: translateX(-12%); }
.head.p-aus .tt, .head.p-aus .such, .head.p-aus .c { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .head * { transition: none !important; animation: none !important; } }
.body { background: rgb(var(--panel) / var(--deck)); }
body.blur .body { -webkit-backdrop-filter: blur(var(--unschaerfe)); backdrop-filter: blur(var(--unschaerfe)); }
.sub { font-size: 13px; font-weight: 600; letter-spacing: 1.5px; color: rgba(255, 255, 255, .6); text-transform: uppercase; white-space: nowrap; }
.num { font-weight: 700; font-variant-numeric: tabular-nums; display: inline-block; }
.y { color: var(--gelb); }
.teiler { color: rgba(255, 255, 255, .35); }
.num.pop { animation: pop .5s cubic-bezier(.2, 1.6, .4, 1); }
@keyframes pop { 0% { transform: scale(1); } 35% { transform: scale(1.25); } 100% { transform: scale(1); } }

/* 1 - 1v1 top bar */
.v1 { width: 760px; }
.v1 .body.haupt { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 14px 34px; }
.v1 .body.haupt .n:last-child { text-align: right; }
.v1 .n { font-size: 30px; font-weight: 600; white-space: nowrap; }
.v1 .sc { display: flex; align-items: center; gap: 16px; padding: 0 20px; font-size: 46px; }
.v1 .sc .teiler { font-size: 30px; }
.v1 .fuss { display: flex; justify-content: center; padding: 6px; background: rgb(var(--panel) / calc(var(--deck) * .78)); }

/* 2 - 3v3 stacked */
.v2 { width: 640px; }
.v2 .body { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 16px 34px; }
.v2 .t div { font-size: 22px; font-weight: 500; line-height: 1.45; white-space: nowrap; }
.v2 .t.l { text-align: left; }
.v2 .t.r { text-align: right; }
.v2 .m { display: flex; flex-direction: column; align-items: center; padding: 0 22px; text-align: center; }
.v2 .m .sc { display: flex; align-items: center; gap: 12px; font-size: 52px; line-height: 1; margin: 4px 0; }

/* 3 - 4v4 sidebar */
.v3 { width: 440px; }
.v3 .body { padding: 16px 22px; }
.v3 .tr { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.v3 .tn { font-size: 22px; font-weight: 700; }
.v3 .pl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 19px; font-weight: 600; color: #fff; }
.v3 .sub.tn { margin-bottom: 2px; font-size: 11px; }
.v2 .t .sub.tn { font-size: 11px; line-height: 1.6; }
.v3 .bigsc { font-size: 38px; }
.v3 hr { border: 0; height: 1px; margin: 12px 0; background: rgba(255, 255, 255, .12); }
.v3 .sub.oben { margin-bottom: 10px; }
.v3 .sub.unten { margin-top: 12px; }

/* 4 - 2v2 compact */
.v4 { width: 600px; }
.v4 .body { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 22px; font-size: 20px; font-weight: 600; white-space: nowrap; }
.dots { display: flex; gap: 6px; }
.dots i { display: block; width: 12px; height: 12px; border-radius: 50%; background: rgba(255, 255, 255, .2); transition: background .3s ease; }
.dots i.an { background: var(--gelb); }
.vs { color: rgba(255, 255, 255, .4); }

/* 5 - 3+ teams, one row each */
.v5 { width: 440px; }
.v5 .body { padding: 12px 20px; }
.v5 .sub.oben { margin-bottom: 4px; }
.v5 .row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid rgba(255, 255, 255, .1); }
.v5 .row:last-child { border: 0; }
.v5 .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 19px; font-weight: 600; }
.v5 .sc { font-size: 30px; }
.v5 .lead .nm::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 10px; border-radius: 50%; background: var(--gelb); vertical-align: 3px; }
.v5 .head .rw .c { display: none; }
.v5 .head .tt { font-size: calc(var(--kh) * .346 * var(--fit, 1)); }
.v5 .head .rw { font-size: calc(var(--kh) * .212 * var(--fitR, 1)); }
/* 6 - 3-4 teams, one column each */
.v6 .body { display: grid; }
.v6 .col { padding: 14px 18px; text-align: center; border-right: 1px solid rgba(255, 255, 255, .1); min-width: 0; }
.v6 .col:last-child { border: 0; }
.v6 .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 600; }
.v6 .sc { font-size: 40px; line-height: 1.1; }
.v6 .lead .sc { color: var(--gelb); }
.v6 .fuss { display: flex; justify-content: center; padding: 5px; background: rgb(var(--panel) / calc(var(--deck) * .83)); }

@media (prefers-reduced-motion: reduce) { #board, .num, .dots i { transition: none !important; animation: none !important; } }
</style>
</head>
<body class="blur">
<div id="board"></div>

<script>
(function () {
  'use strict';
  var P = new URLSearchParams(location.search);
  var ID = P.get('id') || '', KEY = P.get('k') || '';
  /*
   * The partner's files come from the private archive through /api/finest/datei,
   * which wants the tick (configurator) or this overlay's id + view key (OBS).
   */
  function geheim(u) {
    u = String(u || '');
    if (u.indexOf('/api/finest/') !== 0 || !ID || !KEY) return u;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(ID) + '&k=' + encodeURIComponent(KEY);
  }
  var LOGO = geheim('/api/finest/datei/logo.png');
  var STANDARD = {
    // Map header (like a map promo): clip, title, search term, island code.
    karte: '1V1-4V4 REALISTICS', suche: 'FINEST', code: '9854-1829-8735',
    clip: '/api/finest/datei/bg.mp4', bild: '/api/finest/datei/thumb.jpg', logoZeigen: false,
    // Header animation: 'loop' (pop - slide - title - search - code - hold - out) or 'static'.
    kopfAnimation: 'loop', kopfHalten: 3, kopfTempo: 1, kopfDunkel: 0.25,
    // Header scale.
    kopfMass: 1,
    // Animated border: rotating conic gradient around the whole scoreboard.
    rahmen: true, rahmenTempo: 4, rahmenBreite: 2.5,
    rahmenGrund: '#111111', rahmen1: '#7a5a12', rahmen2: '#f5b82e', rahmen3: '#ffe9a8',
    variante: 'stapel',
    // Optional extra text for the status line; the line itself is automatic ("1v1 · First to 5").
    titel: '', titelZeigen: true,
    // Team names are optional - without them the player names are shown.
    name1: '', name2: '',
    spieler1: ['Chap', 'Kaan', 'Fastroki'], spieler2: ['Nociff', 'Izzi', 'Akiira'],
    teams: 2, name3: '', name4: '', spieler3: [], spieler4: [], punkte3: 0, punkte4: 0,
    // Real flags from our profile data next to every player name.
    flaggen: true,
    punkte1: 0, punkte2: 0,
    ziel: 5, zielZeigen: true, runde: 0, serie1: 0, serie2: 0, serieZeigen: false,
    farbe: '#f5b82e', deckkraft: 0.7, blur: true, text: '#ffffff',
    kopfZeigen: true,
    groesse: 1, vert: 'top', horiz: 'center', rand: 30, animation: 'pop',
  };
  var SERVER = location.origin;
  var board = document.getElementById('board');

  function hex(v, std) { v = String(v || '').trim(); return /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? (v[0] === '#' ? v : '#' + v) : std; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = String(text);
    return e;
  }
  function namen(c, n) { return (Array.isArray(c['spieler' + n]) ? c['spieler' + n] : []).map(String).filter(Boolean).slice(0, 4); }
  function team(c, n) { return String(c['name' + n] || '').trim(); }
  /** "1v1", "2v2" ... from the number of players. */
  function anzahl(c) { return Math.max(2, Math.min(4, Number(c.teams) || 2)); }
  function format(c) {
    if (anzahl(c) > 2) return anzahl(c) + ' Teams';
    var a = namen(c, 1).length, b = namen(c, 2).length; if (!a && !b) return ''; return (a || b) + 'v' + (b || a);
  }
  /** Who leads: every team with the highest score (above 0). */
  function fuehrt(c, n) {
    var max = 0, i;
    for (i = 1; i <= anzahl(c); i++) max = Math.max(max, Number(c['punkte' + i]) || 0);
    return max > 0 && (Number(c['punkte' + n]) || 0) === max;
  }
  function zahl(n, wert, extra) { var z = el('span', 'num' + (extra ? ' ' + extra : ''), Number(wert) || 0); z.dataset.z = n; return z; }
  function ziel(c) { return c.zielZeigen && Number(c.ziel) > 0 ? 'First to ' + Number(c.ziel) : ''; }
  function extra(c) { return c.titelZeigen && c.titel ? String(c.titel) : ''; }
  function runde(c) { return Number(c.runde) > 0 ? 'Round ' + Number(c.runde) : ''; }
  function serie(c) { return c.serieZeigen ? 'Series ' + (Number(c.serie1) || 0) + '–' + (Number(c.serie2) || 0) : ''; }
  function zeile() { return Array.prototype.filter.call(arguments, Boolean).join(' · '); }

  /*
   * Real flags from our profile data (/api/spieler-laender?wer=...): one small
   * request for all names, remembered; redrawn once they arrive. Nothing is
   * typed in by hand - a player we do not know simply has no flag.
   */
  var LAND = {};
  var flaggenUhr = null;
  var letzte = null;
  function laenderHolen(c) {
    var alle = [];
    for (var n = 1; n <= 4; n++) alle = alle.concat(namen(c, n));
    var fehlt = alle.filter(function (x) { return !(x.toLowerCase() in LAND); }).slice(0, 16);
    if (!fehlt.length) return;
    fehlt.forEach(function (x) { LAND[x.toLowerCase()] = ''; });
    fetch(SERVER + '/api/spieler-laender?wer=' + encodeURIComponent(fehlt.join(',')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.laender) return;
        Object.keys(j.laender).forEach(function (x) { LAND[x.toLowerCase()] = String(j.laender[x]).toLowerCase(); });
        if (letzte) anwenden(letzte);
      })
      .catch(function () { /* without flags */ });
  }
  function flagge(c, name, nach) {
    var code = c.flaggen === false ? '' : LAND[String(name).toLowerCase()];
    if (!/^[a-z]{2}$/.test(code || '')) return null;
    var i = el('img', 'fl' + (nach ? ' nach' : '')); i.alt = '';
    // The line gets wider once the flag has loaded: fit the names again then.
    i.onload = function () { clearTimeout(flaggenUhr); flaggenUhr = setTimeout(namenPassen, 30); };
    i.src = SERVER + '/flags/' + code + '.png';
    return i;
  }
  /** One player: flag and name (flag after the name on the right-hand side). */
  function spieler(c, name, nach) {
    var s = el('span', 'sp');
    var f = flagge(c, name, nach);
    if (f && !nach) s.appendChild(f);
    s.appendChild(document.createTextNode(name));
    if (f && nach) s.appendChild(f);
    return s;
  }
  /** A side in one line: the team name if set, else its players with flags ("Chap & Kaan"). */
  function seiteKnoten(c, n, trenner, nach) {
    var t = team(c, n);
    return t ? document.createTextNode(t) : spielerKnoten(c, n, trenner, nach);
  }
  /** Only the players of a side, with flags. */
  function spielerKnoten(c, n, trenner, nach) {
    var d = document.createDocumentFragment();
    var s = namen(c, n);
    trenner = trenner || (s.length > 2 ? ' · ' : ' & ');
    s.forEach(function (x, i) { if (i) d.appendChild(document.createTextNode(trenner)); d.appendChild(spieler(c, x, nach)); });
    return d;
  }
  function mitKnoten(tag, cls, knoten) { var e = el(tag, cls); e.appendChild(knoten); return e; }

  /*
   * The map header - built once and kept across redraws, so the background
   * clip keeps playing and the animation loop is not restarted by a score
   * change. Only its texts are updated in place.
   */
  function url(u) { u = String(u || '').trim(); return /^(https?:\/\/|\/|data:image\/)/.test(u) ? geheim(u) : ''; }
  var KOPF = null;
  var LUPE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><circle cx="14" cy="10" r="6.5"/><path d="M9.2 14.8 3.5 20.5"/></svg>';
  function kopfBauen() {
    var h = el('div', 'head p-leer');
    h.innerHTML = '<div class="bg"></div><div class="dunkel"></div>'
      + '<div class="inhalt"><div class="thumb"></div><div class="tx">'
      + '<div class="tt"><b></b></div>'
      + '<div class="rw"><span class="such">' + LUPE + '<span><span class="wort">SEARCH: </span><span class="y"></span></span></span><span class="c"></span></div>'
      + '</div></div><div class="linie"></div>';
    KOPF = { node: h, bg: '', thumb: '', logo: null, timer: null, phase: '', cfgKey: '' };
    return KOPF;
  }
  function kopfAktualisieren(c) {
    var k = KOPF || kopfBauen();
    var h = k.node;
    h.hidden = !c.kopfZeigen;
    h.style.setProperty('--kd', String(Math.max(0, Math.min(.95, Number(c.kopfDunkel)))));
    h.style.setProperty('--t', String(Math.max(.3, Math.min(3, Number(c.kopfTempo) || 1))));
    // Background: the looping clip across the whole header; else the thumbnail, blurred.
    var v = url(c.clip); if (/^data:/.test(v)) v = '';
    var b = url(c.bild);
    var bgKey = v + '|' + b;
    if (k.bg !== bgKey) {
      k.bg = bgKey;
      var bg = h.querySelector('.bg');
      bg.textContent = '';
      if (v) {
        var vid = document.createElement('video');
        vid.muted = true; vid.defaultMuted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
        vid.setAttribute('muted', ''); vid.setAttribute('playsinline', ''); vid.preload = 'auto';
        vid.src = v;
        bg.appendChild(vid);
      } else if (b) {
        var bi = el('img', 'unscharf'); bi.alt = ''; bi.src = b; bg.appendChild(bi);
      }
    }
    var th = h.querySelector('.thumb');
    var thKey = b || LOGO;
    if (k.thumb !== thKey) {
      k.thumb = thKey;
      th.textContent = '';
      th.className = 'thumb' + (b ? '' : ' logo');
      var ti = el('img'); ti.alt = ''; ti.src = thKey; th.appendChild(ti);
    }
    var tt = h.querySelector('.tt');
    var lg = tt.querySelector('img');
    if (c.logoZeigen && !lg) { lg = el('img'); lg.alt = ''; lg.src = LOGO; tt.insertBefore(lg, tt.firstChild); }
    if (!c.logoZeigen && lg) lg.remove();
    tt.querySelector('b').textContent = c.karte || 'FINEST CREATIVE';
    var such = h.querySelector('.such');
    such.querySelector('.y').textContent = c.suche || '';
    such.hidden = !c.suche;
    var code = h.querySelector('.c');
    code.textContent = c.code || '';
    code.hidden = !c.code;
    var key = (c.kopfAnimation === 'static' ? 's' : 'l') + '|' + c.kopfHalten + '|' + c.kopfTempo;
    if (k.cfgKey !== key) { k.cfgKey = key; kopfStarten(c); }
    return h;
  }
  /* Title never wraps: shrink it (down to 62 %), then cut with an ellipsis. */
  /* Text never wraps or overflows: drop the code, then shrink, then cut the title with an ellipsis. */
  function passen() {
    if (!KOPF) return;
    var h = KOPF.node, tt = h.querySelector('.tt'), b = tt.querySelector('b'), rw = h.querySelector('.rw'), tx = h.querySelector('.tx');
    var code = rw.querySelector('.c');
    code.style.display = '';
    tt.style.setProperty('--fit', '1'); rw.style.setProperty('--fitR', '1');
    var eng = function () { return tx.scrollWidth > tx.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1; };
    if (eng() && code.textContent) code.style.display = 'none';
    var g = 1;
    while (eng() && g > 0.8) { g -= 0.05; rw.style.setProperty('--fitR', String(g)); }
    var f = 1;
    while (eng() && f > 0.66) { f -= 0.04; tt.style.setProperty('--fit', String(f)); }
  }
  /* Long line-ups (4v4 with flags) never get cut: the names shrink a little first (down to 70 %). */
  function namenPassen() {
    board.querySelectorAll('.v3 .pl, .v5 .nm, .v6 .nm').forEach(function (e) {
      e.style.fontSize = '';
      var basis = parseFloat(getComputedStyle(e).fontSize) || 19, g = basis;
      // The text's natural width (max-content) against the width it gets in the row.
      var zuBreit = function () {
        e.style.flex = ''; e.style.width = '';
        var hat = e.getBoundingClientRect().width;
        e.style.flex = 'none'; e.style.width = 'max-content';
        var will = e.getBoundingClientRect().width;
        e.style.flex = ''; e.style.width = '';
        return will > hat + 1;
      };
      while (zuBreit() && g > basis * 0.7) { g -= 0.5; e.style.fontSize = g + 'px'; }
    });
  }
  function mitteMessen() {
    // Layout offsets ignore transforms: the thumbnail's resting centre vs. the header's centre.
    var h = KOPF.node, th = h.querySelector('.thumb');
    var dx = h.offsetWidth / 2 - (th.offsetLeft + th.offsetWidth / 2);
    h.style.setProperty('--mitte', dx + 'px');
  }
  function phase(p) {
    var h = KOPF.node;
    h.classList.remove('p-leer', 'p-pop', 'p-links', 'p-titel', 'p-suche', 'p-halt', 'p-aus');
    h.classList.add('p-' + p);
    KOPF.phase = p;
  }
  function kopfStarten(c) {
    var k = KOPF;
    if (k.timer) { clearTimeout(k.timer); k.timer = null; }
    if (c.kopfAnimation === 'static') { phase('halt'); return; }
    var t = Math.max(.3, Math.min(3, Number(c.kopfTempo) || 1));
    var halten = Math.max(2, Math.min(600, Number(c.kopfHalten) || 12)) * 1000;
    // pop in centre -> slide left -> title -> search -> code -> hold -> out -> again
    var schritte = [['leer', 350], ['pop', 1100], ['links', 650], ['titel', 450], ['suche', 450], ['halt', halten], ['aus', 700]];
    var i = 0;
    function weiter() {
      var s = schritte[i];
      if (s[0] === 'leer' || s[0] === 'pop') { requestAnimationFrame(mitteMessen); }
      phase(s[0]);
      i = (i + 1) % schritte.length;
      k.timer = setTimeout(weiter, s[0] === 'halt' ? s[1] : s[1] * t);
    }
    weiter();
  }

  var BAU = {
    leiste: function (c) {
      var b = el('div', 'box v1');
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body haupt');
      h.appendChild(mitKnoten('div', 'n', seiteKnoten(c, 1)));
      var sc = el('div', 'sc');
      sc.appendChild(zahl(1, c.punkte1)); sc.appendChild(el('span', 'teiler', ':')); sc.appendChild(zahl(2, c.punkte2));
      h.appendChild(sc);
      h.appendChild(mitKnoten('div', 'n', seiteKnoten(c, 2, '', true)));
      b.appendChild(h);
      var f = zeile(format(c), extra(c), ziel(c), runde(c), serie(c));
      if (f) { var fu = el('div', 'body fuss'); fu.appendChild(el('span', 'sub', f)); b.appendChild(fu); }
      return b;
    },
    stapel: function (c) {
      var b = el('div', 'box v2');
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body');
      var spalte = function (n) {
        var d = el('div', 't ' + (n === 1 ? 'l' : 'r'));
        if (team(c, n)) d.appendChild(el('div', 'sub tn', team(c, n)));
        var liste = namen(c, n);
        if (liste.length) liste.forEach(function (x) { d.appendChild(mitKnoten('div', '', spieler(c, x, n === 2))); });
        else d.appendChild(el('div', '', team(c, n)));
        return d;
      };
      h.appendChild(spalte(1));
      var m = el('div', 'm');
      var oben = runde(c) || extra(c);
      if (oben) m.appendChild(el('div', 'sub', oben));
      var sc = el('div', 'sc');
      sc.appendChild(zahl(1, c.punkte1)); sc.appendChild(el('span', 'teiler', ':')); sc.appendChild(zahl(2, c.punkte2));
      m.appendChild(sc);
      var unten = zeile(ziel(c), serie(c));
      if (unten) m.appendChild(el('div', 'sub', unten));
      h.appendChild(m);
      h.appendChild(spalte(2));
      b.appendChild(h);
      return b;
    },
    seite: function (c) {
      var b = el('div', 'box v3');
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body');
      var oben = zeile(format(c), extra(c), ziel(c), serie(c));
      if (oben) h.appendChild(el('div', 'sub oben', oben));
      [1, 2].forEach(function (n) {
        if (n === 2) h.appendChild(el('hr'));
        if (team(c, n)) h.appendChild(el('div', 'sub tn', team(c, n)));
        var tr = el('div', 'tr');
        tr.appendChild(namen(c, n).length ? mitKnoten('span', 'pl', spielerKnoten(c, n, ' · ')) : el('span', 'pl', team(c, n)));
        tr.appendChild(zahl(n, c['punkte' + n], 'bigsc'));
        h.appendChild(tr);
      });
      var unten = runde(c);
      if (unten) h.appendChild(el('div', 'sub unten', unten));
      b.appendChild(h);
      return b;
    },
    liste: function (c) {
      var b = el('div', 'box v5');
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body');
      var oben = zeile(format(c), extra(c), ziel(c), runde(c), serie(c));
      if (oben) h.appendChild(el('div', 'sub oben', oben));
      for (var n = 1; n <= anzahl(c); n++) {
        var r = el('div', 'row' + (fuehrt(c, n) ? ' lead' : ''));
        r.appendChild(mitKnoten('span', 'nm', seiteKnoten(c, n, ' · ')));
        r.appendChild(zahl(n, c['punkte' + n], 'sc'));
        h.appendChild(r);
      }
      b.appendChild(h);
      return b;
    },
    spalten: function (c) {
      var b = el('div', 'box v6');
      b.style.width = (anzahl(c) * 305) + 'px';
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body');
      h.style.gridTemplateColumns = 'repeat(' + anzahl(c) + ', 1fr)';
      for (var n = 1; n <= anzahl(c); n++) {
        var col = el('div', 'col' + (fuehrt(c, n) ? ' lead' : ''));
        col.appendChild(mitKnoten('div', 'nm', seiteKnoten(c, n, ' · ')));
        col.appendChild(zahl(n, c['punkte' + n], 'sc'));
        h.appendChild(col);
      }
      b.appendChild(h);
      var f = zeile(format(c), extra(c), ziel(c), runde(c), serie(c));
      if (f) { var fu = el('div', 'body fuss'); fu.appendChild(el('span', 'sub', f)); b.appendChild(fu); }
      return b;
    },
    kompakt: function (c) {
      var b = el('div', 'box v4 klein');
      b.appendChild(kopfAktualisieren(c));
      var h = el('div', 'body');
      var max = Math.max(0, Math.min(12, Number(c.ziel) || 0));
      var punkte = function (n) {
        var d = el('div', 'dots');
        var w = Number(c['punkte' + n]) || 0;
        for (var i = 0; i < max; i++) d.appendChild(el('i', i < w ? 'an' : ''));
        return d;
      };
      var a = el('span');
      a.appendChild(seiteKnoten(c, 1)); a.appendChild(document.createTextNode(' '));
      a.appendChild(zahl(1, c.punkte1, 'y'));
      h.appendChild(a);
      if (max) h.appendChild(punkte(1));
      h.appendChild(el('span', 'vs', 'vs'));
      if (max) h.appendChild(punkte(2));
      var z = el('span');
      z.appendChild(zahl(2, c.punkte2, 'y'));
      z.appendChild(document.createTextNode(' ')); z.appendChild(seiteKnoten(c, 2));
      h.appendChild(z);
      b.appendChild(h);
      var f = zeile(runde(c), serie(c));
      if (f) { var fu = el('div', 'body'); fu.style.cssText = 'justify-content:center;padding:0 0 8px'; fu.appendChild(el('span', 'sub', f)); b.appendChild(fu); }
      return b;
    },
  };

  var vorher = { 1: null, 2: null, 3: null, 4: null };
  function anwenden(c) {
    var r = document.documentElement.style;
    r.setProperty('--gelb', hex(c.farbe, '#f5b82e'));
    r.setProperty('--deck', String(Math.max(0, Math.min(1, Number(c.deckkraft)))));
    r.setProperty('--text', hex(c.text, '#ffffff'));
    r.setProperty('--mass', String(Math.max(0.4, Math.min(2.5, Number(c.groesse) || 1))));
    var variante = BAU[c.variante] ? c.variante : 'leiste';
    // More than two teams: the two-sided layouts become a list or columns.
    if (anzahl(c) > 2 && variante !== 'liste' && variante !== 'spalten') {
      variante = (variante === 'leiste' || variante === 'kompakt') ? 'spalten' : 'liste';
    }
    r.setProperty('--r0', hex(c.rahmenGrund, '#111111'));
    r.setProperty('--r1', hex(c.rahmen1, '#7a5a12'));
    r.setProperty('--r2', hex(c.rahmen2, '#f5b82e'));
    r.setProperty('--r3', hex(c.rahmen3, '#ffe9a8'));
    r.setProperty('--kmass', String(Math.max(.6, Math.min(2, Number(c.kopfMass) || 1))));
    // House style: position on the 1920 x 1080 source (look.js).
    if (window.Look) {
      Look.anwenden({
        look: 'clean', animation: 'aus',
        vert: ['top', 'middle', 'bottom'].indexOf(c.vert) >= 0 ? c.vert : 'top',
        horiz: ['left', 'center', 'right'].indexOf(c.horiz) >= 0 ? c.horiz : 'center',
        rand: Math.max(0, Math.min(400, Number(c.rand) || 0)),
      });
    }
    document.body.classList.toggle('blur', Boolean(c.blur));
    letzte = c;
    laenderHolen(c);
    board.textContent = '';
    var box = BAU[variante](c);
    // Everything under the header goes into one rounded body of full width.
    // Header and body together inside the rounded inner frame; the animated border runs around it.
    var innen = el('div', 'innen');
    Array.prototype.slice.call(box.children).forEach(function (k) { innen.appendChild(k); });
    box.appendChild(innen);
    board.appendChild(box);
    innen.classList.add('da');
    /*
     * The house frame around it (look.css .lk-rand, gold here): rotating border
     * only, no hero rows, no watermark - and the size report for the preview crop.
     */
    if (window.Look) {
      Look.rahmen(innen, {
        rahmen: c.rahmen !== false, rahmenTempo: c.rahmenTempo, rahmenBreite: c.rahmenBreite,
        ecken: 14, heroDeck: 0, hintergrund: 'aus', wasserzeichen: 'aus',
      });
    }
    // The clip pauses when its node is moved - carry on.
    var vid = board.querySelector('.head video');
    if (vid) { var pl = vid.play(); if (pl && pl.catch) pl.catch(function () { /* poster/thumbnail stays */ }); }
    passen(); namenPassen();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { passen(); namenPassen(); });
    [1, 2, 3, 4].forEach(function (n) {
      var w = Number(c['punkte' + n]) || 0;
      if (vorher[n] !== null && vorher[n] !== w && c.animation !== 'none') {
        board.querySelectorAll('[data-z="' + n + '"]').forEach(function (z) { z.classList.add('pop'); });
      }
      vorher[n] = w;
    });
    board.classList.add('da');
  }
  function mit(c) { var o = {}; var k; for (k in STANDARD) o[k] = STANDARD[k]; for (k in (c || {})) o[k] = c[k]; return o; }
  function leer() { board.textContent = ''; board.classList.remove('da'); }

  // Preview: only inside our own configurator (a same-origin frame), never as an OBS source.
  var vorschau = P.get('vorschau');
  if (vorschau) {
    var eingebettet = false;
    try { eingebettet = window.parent !== window && window.parent.location.origin === location.origin; } catch (e) { eingebettet = false; }
    if (!eingebettet) return;
    try { anwenden(mit(JSON.parse(vorschau))); } catch (e) { anwenden(mit({})); }
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin || !ev.data || ev.data.comphub !== 'fc-cfg') return;
      anwenden(mit(ev.data.cfg));
    });
    return;
  }

  var id = P.get('id');
  if (!id) return;
  var MERK = 'comphub-overlay:' + id;
  var stand = -1;
  var laeuft = false;
  function gesperrt() {
    // Access revoked or overlay removed: forget the local copy and draw nothing.
    try { localStorage.removeItem(MERK); } catch (e) { /* blocked */ }
    laeuft = false; stand = -1; leer();
  }
  function merkzettel() {
    if (laeuft) return;
    try { var g = JSON.parse(localStorage.getItem(MERK) || 'null'); if (g && g.config) { laeuft = true; anwenden(mit(g.config)); } } catch (e) { /* none */ }
  }
  function voll() {
    return fetch(SERVER + '/api/overlay-config?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(KEY), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 403 || r.status === 404) { gesperrt(); return null; }
        if (!r.ok) { merkzettel(); return null; }
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.config) return;
        try { localStorage.setItem(MERK, JSON.stringify({ config: j.config, stand: j.stand })); } catch (e) { /* blocked */ }
        stand = j.stand; laeuft = true;
        anwenden(mit(j.config));
      })
      .catch(merkzettel);
  }
  var unterwegs = false;
  function kurz() {
    if (unterwegs || document.hidden) return;
    unterwegs = true;
    fetch(SERVER + '/api/overlay-config?nur=stand&id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(KEY), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 403 || r.status === 404) { gesperrt(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (j) { if (j && typeof j.stand === 'number' && j.stand !== stand) return voll(); })
      .catch(function () { /* keep what is on screen */ })
      .then(function () { unterwegs = false; });
  }
  voll();
  // Every second: a few bytes - the score from the control page shows within ~1 s.
  setInterval(kurz, 1000);
})();
</script>
</body>
</html>
`;
