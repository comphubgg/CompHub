/*
 * Fotos am Gesicht zuschneiden - fuer alle Overlays gleich.
 *
 * Der Betreiber (1.10.2026) zum Trio-Banner: "man erkennt ja die Spieler gar
 * nicht ... zuschneiden, immer so, dass der Kopf mittig ist." Wo das Gesicht
 * in einem Foto steht, rechnet scripts/gesichter-erkennen.py einmal vor und
 * legt es in /spielerbilder/_gesichter.json ab: je Datei [mitte_x, mitte_y,
 * hoehe] als Anteil des Bildes. Dieser Baustein sucht dort nach und setzt
 * Groesse und Lage des Bildes im Rahmen so, dass das Gesicht in der Mitte
 * steht. Der Rahmen braucht position: relative und overflow: hidden, das Bild
 * liegt darin absolut (der Baustein setzt left/top/width/height in Prozent).
 *
 * Fotos, die in der Liste fehlen (neu hochgeladen, kein Gesicht erkannt),
 * bekommen einen Kopfbild-Standard.
 *
 *   Gesicht.lade(server)                       Liste holen (einmal)
 *   Gesicht.binde(img, anteil, mitteY)         zuschneiden, sobald das Bild geladen ist
 *     anteil  Hoehe des Gesichts als Teil der Rahmenhoehe (Standard 0.33)
 *     mitteY  wo die Gesichtsmitte im Rahmen sitzt, 0 oben bis 1 unten (Standard 0.47)
 */
(function (global) {
  'use strict';
  let laden = null;
  let daten = {};

  function lade(server) {
    if (!laden) {
      laden = fetch((server || '') + '/spielerbilder/_gesichter.json')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; })
        .then(function (d) { daten = d || {}; return daten; });
    }
    return laden;
  }

  function zuschneiden(img, anteil, mitteY) {
    const k = img.parentElement;
    if (!k) return;
    const W = k.clientWidth; const H = k.clientHeight;
    const nw = img.naturalWidth; const nh = img.naturalHeight;
    if (!W || !H || !nw || !nh) return;
    let datei = (img.getAttribute('src') || '').split('?')[0].split('/').pop();
    try { datei = decodeURIComponent(datei); } catch (e) { /* bleibt */ }
    const g = daten[datei] || [0.5, 0.3, 0.2];
    const smin = Math.max(W / nw, H / nh);
    const s = Math.max(smin, Math.min((anteil || 0.33) * H / (g[2] * nh), 1.6));
    const my = mitteY == null ? 0.47 : mitteY;
    const links = Math.min(0, Math.max(W - nw * s, W / 2 - g[0] * nw * s));
    const oben = Math.min(0, Math.max(H - nh * s, my * H - g[1] * nh * s));
    const st = img.style;
    st.position = 'absolute';
    st.objectFit = 'fill';
    st.width = (nw * s / W * 100) + '%';
    st.height = (nh * s / H * 100) + '%';
    st.left = (links / W * 100) + '%';
    st.top = (oben / H * 100) + '%';
  }

  function binde(img, anteil, mitteY) {
    const tue = function () { zuschneiden(img, anteil, mitteY); };
    if (img.complete && img.naturalWidth) tue();
    else img.addEventListener('load', tue, { once: true });
  }

  global.Gesicht = { lade: lade, zuschneiden: zuschneiden, binde: binde };
})(window);
