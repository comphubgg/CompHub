// Gemeinsame Grundlage aller Overlays: Optik aus der URL lesen, Bilder
// setzen, Werte anzeigen, Farben je Spieler bestimmen.

(function (global) {

  const P = new URLSearchParams(location.search);

  const VARS = ['accent','accent2','bg','bg2','text','muted','radius','cut','pad',
                'gap','font','label','value','name','speed','imgsize','logosize',
                'imgzoom','imgx','imgy','imgzoom2','imgx2','imgy2','imggap'];

  // Werte aus der URL sind der Rueckfall, wenn ein Spieler weder eigene
  // Einstellungen noch ein auswertbares Bild hat.
  const BASIS = {};

  function init() {
    for (const v of VARS) {
      const val = P.get(v);
      if (val) document.documentElement.style.setProperty('--' + v, decodeURIComponent(val));
      BASIS[v] = val ? decodeURIComponent(val) : null;
    }
    if (P.get('scale')) document.body.style.zoom = P.get('scale');
    if (P.get('anim') === 'off') document.documentElement.style.setProperty('--speed', '0s');

    const SHAPES = ['round','slant','slantl','both','arrow','tag','notch','bevel'];
    const shape = SHAPES.includes(P.get('shape')) ? P.get('shape') : 'round';
    const card = document.getElementById('card');
    if (card) card.className = 's-' + shape;

    const imgMode = P.get('img') || 'free';
    if (imgMode === 'inline') document.body.classList.add('img-inline');
    if (imgMode === 'off') document.body.classList.add('img-none');

    return {
      P, BASIS, shape, imgMode,
      server: P.get('server') || '',
      event: P.get('event') || '',
      window: P.get('window') || '',
      partner: P.get('partner') !== 'off',
      logos: P.get('logos') !== 'off',
      autocolor: P.get('autocolor') !== 'off',
      every: Math.max(10, parseInt(P.get('every') || '30', 10)) * 1000,
    };
  }

  // Gespeicherte Einstellungen je Spieler. Schluessel ist ein Namensteil,
  // z.B. "peterbot" fuer "[EWC2026] FLCN peterbot".
  let gespeichert = {};

  async function ladeCfg(server) {
    try { gespeichert = await (await fetch((server || '') + '/api/cup-playercfg')).json(); }
    catch { gespeichert = {}; }
    return gespeichert;
  }

  function cfgFuer(name) {
    const n = String(name).toLowerCase();
    let treffer = null;
    for (const key of Object.keys(gespeichert)) {
      if (key && n.includes(key) && (!treffer || key.length > treffer.length)) treffer = key;
    }
    return treffer ? gespeichert[treffer] : null;
  }

  // Setzt Farben und Bildausschnitt fuer den gezeigten Spieler.
  // Reihenfolge: eigene Einstellung > aus dem Bild gelesen > URL-Wert.
  async function setzeStil(cfgIn, spieler, opt) {
    const eigen = cfgFuer(spieler.name) || {};
    let auto = null;
    if (opt.autocolor && spieler.img && !(eigen.accent && eigen.bg) && global.Farben) {
      auto = await global.Farben.ausPfad((opt.server || '') + spieler.img);
    }
    const st = document.documentElement.style;
    for (const k of ['accent','accent2','bg','bg2','muted']) {
      const v = eigen[k] || (auto && auto[k]) || cfgIn.BASIS[k];
      if (v) st.setProperty('--' + k, v); else st.removeProperty('--' + k);
    }
    for (const k of ['imgsize','imgzoom','imgx','imgy','imgzoom2','imgx2','imgy2','imggap']) {
      const v = eigen[k] || cfgIn.BASIS[k];
      if (v) st.setProperty('--' + k, v); else st.removeProperty('--' + k);
    }
    return auto;
  }

  // Bild setzen; gibt zurueck, ob eines sichtbar ist.
  function setzeBild(imgEl, boxEl, src, an) {
    const zeigen = !!src && an;
    if (zeigen && imgEl.getAttribute('src') !== src) imgEl.src = src;
    boxEl.classList.toggle('on', zeigen);
    return zeigen;
  }

  // Baut die Wertespalten einmalig auf.
  function baueStats(box, felder, labels) {
    if (box.children.length) return;
    for (const f of felder) {
      const d = document.createElement('div');
      d.className = 'stat' + (f === 'rank' ? ' hl' : '');
      d.innerHTML = '<div class="l">' + (labels[f] || f) +
                    '</div><div class="v" data-f="' + f + '">0</div>';
      box.appendChild(d);
    }
  }

  // Sekunden als "9m 12s" - so steht es auch in den Turnierseiten.
  function zeit(sek) {
    sek = Math.round(sek || 0);
    if (sek < 60) return sek + 's';
    return Math.floor(sek / 60) + 'm ' + String(sek % 60).padStart(2, '0') + 's';
  }

  function formatiere(feld, wert) {
    if (wert === null || wert === undefined) return '–';
    if (feld === 'rank') return wert ? '#' + wert : '–';
    if (feld === 'timeAlive' || feld === 'avgTimeAlive') return zeit(wert);
    if (feld === 'damage' || feld === 'damageTaken') {
      return Number(wert).toLocaleString('de-DE');
    }
    return String(wert);
  }

  // Werte schreiben und bei Aenderung kurz aufblitzen lassen.
  const letzte = {};
  function schreibeStats(box, felder, eintrag) {
    for (const f of felder) {
      const el = box.querySelector('[data-f="' + f + '"]');
      if (!el) continue;
      const roh = eintrag ? eintrag[f] : 0;
      const txt = formatiere(f, roh);
      if (el.textContent !== txt) {
        el.textContent = txt;
        if (letzte[f] !== undefined) {
          el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        }
        letzte[f] = roh;
      }
    }
  }

  const LABELS_STANDARD = {
    rank: 'TOP', points: 'PTS', elims: 'ELIMS', games: 'GAMES', wins: 'WINS',
    damage: 'DAMAGE', damageTaken: 'DMG RECV', headshots: 'HEADSHOTS',
    timeAlive: 'TIME ALIVE', avgPoints: 'AVG PTS', avgPlace: 'AVG PLACE',
    avgElims: 'AVG ELIMS', avgTimeAlive: 'AVG ALIVE', kd: 'K/D',
    bestPlace: 'BEST',
  };

  function labels(P) {
    const out = { ...LABELS_STANDARD };
    for (const k of Object.keys(out)) {
      const v = P.get('l_' + k);
      if (v) out[k] = decodeURIComponent(v);
    }
    return out;
  }

  global.Overlay = {
    init, ladeCfg, cfgFuer, setzeStil, setzeBild,
    baueStats, schreibeStats, labels, zeit, formatiere,
    LABELS_STANDARD,
  };

})(window);
