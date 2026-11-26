/*
 * CompHub Live - gemeinsames Skript fuer Panel, Overlay und Einstellungen (lib/twitchErweiterung, app/api/twitch-ext).
 * Twitch erlaubt kein Inline-Skript: die Ansicht steht in <body data-ansicht="...">. Alle Daten werden mit textContent gesetzt (nie innerHTML).
 */
(function () {
  var API = 'https://www.thecomphub.com/api/twitch-ext';
  var token = null, rolle = null, uhr = null, letzte = null;
  var ansicht = document.body.getAttribute('data-ansicht');

  function el(tag, attr, kinder) {
    var e = document.createElement(tag);
    if (attr) for (var k in attr) { if (k === 'text') e.textContent = attr[k]; else if (k === 'klasse') e.className = attr[k]; else e.setAttribute(k, attr[k]); }
    (kinder || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function abruf(methode, daten) {
    return fetch(API, { method: methode, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: daten ? JSON.stringify(daten) : undefined })
      .then(function (r) { return r.json(); });
  }
  function vor(iso) {
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(m)) return '';
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ago';
  }
  function zeit(iso) { var d = new Date(iso); return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
  function kopieren(text, knopf) {
    var fertig = function () { knopf.textContent = 'Copied'; setTimeout(function () { knopf.textContent = 'Copy code'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(fertig, function () { markieren(); });
    else markieren();
    function markieren() { var c = document.getElementById('code'); if (c) { var r = document.createRange(); r.selectNodeContents(c); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } knopf.textContent = 'Press Ctrl+C'; }
  }

  function zeichnen(d) {
    var ziel = document.getElementById('inhalt');
    if (!ziel) return;
    ziel.textContent = '';
    var live = document.getElementById('live');
    if (live) live.hidden = !d.imMatch;
    if (d.spieler) { var l = document.getElementById('link'); if (l) l.href = d.spieler.profil; }
    if (!d.eingerichtet) {
      ziel.appendChild(el('p', { klasse: 'leise', text: rolle === 'broadcaster' ? 'Enter your Epic name in the extension settings to get started.' : 'This streamer has not set up CompHub Live yet.' }));
      planZeichnen(ziel, d.plan);
      return;
    }
    if (d.cup) {
      var c = d.cup;
      ziel.appendChild(el('div', { klasse: 'karte' }, [
        el('p', { klasse: 'titel', text: (c.live ? 'Live now · ' : 'Last cup · ') + c.titel }),
        el('div', { klasse: 'zahlen' }, [
          el('div', { klasse: 'zahl' }, [el('b', { text: c.rang ? '#' + c.rang : '–' }), el('span', { text: 'Placement' })]),
          el('div', { klasse: 'zahl' }, [el('b', { text: c.punkte != null ? String(c.punkte) : '–' }), el('span', { text: 'Points' })]),
          el('div', { klasse: 'zahl' }, [el('b', { text: String(d.matches.length) }), el('span', { text: 'Matches' })]),
        ]),
      ]));
      var kurz = document.getElementById('kurz');
      if (kurz) kurz.textContent = c.rang ? '#' + c.rang + ' · ' + (c.punkte || 0) + ' pts' : '';
      var ov = document.getElementById('ov');
      if (ov) ov.hidden = false;
    } else {
      ziel.appendChild(el('p', { klasse: 'leise', text: 'Not in a cup right now.' }));
      var ov2 = document.getElementById('ov');
      if (ov2) ov2.hidden = !d.code;
    }
    if (d.code) {
      if (d.code.matchId) {
        var knopf = el('button', { text: 'Copy code' });
        var id = d.code.matchId;
        knopf.addEventListener('click', function () { kopieren(id, knopf); });
        ziel.appendChild(el('div', { klasse: 'karte' }, [el('p', { klasse: 'titel', text: 'Match code' }), el('p', {}, [el('code', { id: 'code', text: id })]), knopf]));
      } else if (d.code.wartet) {
        ziel.appendChild(el('div', { klasse: 'karte' }, [el('p', { klasse: 'titel', text: 'Match code' }), el('p', { klasse: 'leise', text: 'Appears in ' + Math.ceil(d.code.wartet / 60) + ' min (streamer delay).' })]));
      }
    }
    if (d.matches.length) {
      var k = el('div', { klasse: 'karte' }, [el('p', { klasse: 'titel', text: 'Recent matches' })]);
      d.matches.forEach(function (m) {
        k.appendChild(el('div', { klasse: 'zeile' }, [el('span', { text: (m.platz ? '#' + m.platz : '–') + ' · ' + (m.elims != null ? m.elims + ' elims' : '') }), el('span', { klasse: 'leise', text: m.ende ? vor(m.ende) : 'live' })]));
      });
      ziel.appendChild(k);
    }
    planZeichnen(ziel, d.plan);
  }
  function planZeichnen(ziel, plan) {
    if (!plan || !plan.length || ansicht === 'overlay') return;
    var k = el('div', { klasse: 'karte' }, [el('p', { klasse: 'titel', text: 'Stream schedule' })]);
    plan.forEach(function (p) { k.appendChild(el('div', { klasse: 'zeile' }, [el('span', { text: p.titel || p.spiel || 'Stream' }), el('span', { klasse: 'leise', text: zeit(p.start) })])); });
    ziel.appendChild(k);
  }

  function laden() {
    if (!token) return;
    abruf('GET').then(function (d) { if (d && d.ok) { letzte = d; if (ansicht === 'config') konfigFuellen(d.konfig); else zeichnen(d); } }).catch(function () {});
  }

  function konfigFuellen(k) {
    if (!k) return;
    document.getElementById('epic').value = k.epicName || '';
    document.getElementById('plan').checked = !!k.plan;
    document.getElementById('code').checked = !!k.code;
    document.getElementById('verz').value = String(k.verzoegerungMin);
  }
  function konfigStart() {
    document.getElementById('speichern').addEventListener('click', function () {
      var m = document.getElementById('meldung');
      m.className = 'leise'; m.textContent = 'Saving…';
      abruf('POST', {
        epicName: document.getElementById('epic').value.trim(),
        plan: document.getElementById('plan').checked,
        code: document.getElementById('code').checked,
        verzoegerungMin: Number(document.getElementById('verz').value),
      }).then(function (r) {
        if (r.ok) { m.className = 'ok'; m.textContent = 'Saved' + (r.konfig.epicName ? ' – linked to ' + r.konfig.epicName : ''); konfigFuellen(r.konfig); }
        else { m.className = 'fehler'; m.textContent = r.fehler === 'Epic-Name nicht gefunden' ? 'Epic name not found' : 'Could not save'; }
      }).catch(function () { m.className = 'fehler'; m.textContent = 'Could not save'; });
    });
  }

  if (ansicht === 'overlay') {
    document.getElementById('ovKopf').addEventListener('click', function () { document.getElementById('ov').classList.toggle('zu'); });
  }
  if (ansicht === 'config') konfigStart();

  window.Twitch.ext.onAuthorized(function (auth) {
    var erst = !token;
    token = auth.token; rolle = auth.role || null;
    try { rolle = JSON.parse(atob(auth.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (e) {}
    if (erst) {
      laden();
      // Verteilt (nicht alle Zuschauer zur selben Sekunde): alle 20-25 s.
      if (ansicht !== 'config') uhr = setInterval(laden, 20000 + Math.floor(Math.random() * 5000));
    }
  });
  window.Twitch.ext.onVisibilityChanged && window.Twitch.ext.onVisibilityChanged(function (sichtbar) {
    if (ansicht === 'config') return;
    if (!sichtbar && uhr) { clearInterval(uhr); uhr = null; }
    else if (sichtbar && !uhr && token) { laden(); uhr = setInterval(laden, 20000 + Math.floor(Math.random() * 5000)); }
  });
})();
