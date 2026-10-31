/* CompHub · Spielerfotos sammeln (31.10.2026)
 *
 * In die Browser-Konsole einer beliebigen Seite mit Spielerbildern einfuegen (F12 -> Konsole; Chrome verlangt beim ersten Mal "allow pasting").
 * Knoepfe wie "Show more" klappt es vorher selbst auf, so schnell es geht.
 *
 * Sammelt alle Bilder der Seite, die nach Spielerfoto aussehen, raet den Namen (Alt-Text, Titel, Text der Karte) und zeigt nur die Spieler,
 * die auf thecomphub.com noch kein echtes Foto haben (/api/fotos-bekannt). Namen lassen sich im Fenster korrigieren, Haken abwaehlen.
 * "Herunterladen" speichert NAME.jpg/.png/.webp in den Download-Ordner - von dort nach C:\Users\jumik\Desktop\players.
 * Laesst eine Seite das Herunterladen nicht zu, steht die Karte rot da: "Liste kopieren" legt NAME + Adresse in die Zwischenablage - das an Claude geben.
 */
(async () => {
  /*
   * Erst alles aufklappen (Betreiber, 31.10.2026: "Show More (9982 more)" - jeder Klick laedt nur zehn nach). Klickt jeden Knopf "Show more",
   * "Load more", "Mehr anzeigen" ... so schnell es die Seite zulaesst, bis keiner mehr da ist oder nichts mehr dazukommt (hoechstens 3 Minuten).
   */
  const MEHR = /^\s*(show|load|see|view)\s+more|^\s*mehr\s+(anzeigen|laden)/i;
  // Nur Aufklapp-Knoepfe - keine Links, die auf eine andere Seite fuehren ("Show all ->").
  const knopf = () => [...document.querySelectorAll('button, [role="button"], a:not([href]), a[href="#"]')]
    .find((el) => MEHR.test(el.innerText || el.textContent || '') && el.offsetParent !== null && !el.disabled);
  const anzeige = document.createElement('div');
  anzeige.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#1d9bf0;color:#fff;font:700 14px system-ui;padding:10px 14px;border-radius:10px';
  let klicks = 0; const bis = Date.now() + 180_000; let ohneWachstum = 0; const alleElemente = document.getElementsByTagName('*'); let groesse = alleElemente.length;
  if (knopf()) document.body.appendChild(anzeige);
  while (Date.now() < bis) {
    const k = knopf();
    if (!k) break;
    k.click(); klicks += 1;
    anzeige.textContent = `CompHub: klappe auf ... ${klicks} Klicks`;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const jetzt = alleElemente.length;
    ohneWachstum = jetzt > groesse ? 0 : ohneWachstum + 1;
    groesse = jetzt;
    if (ohneWachstum > 200) await new Promise((r) => setTimeout(r, 300));
    if (ohneWachstum > 260) break;
  }
  anzeige.remove();
  // Nachgeladene Bilder (loading=lazy) einmal anstossen: einmal ganz runter und zurueck.
  if (klicks) { window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 1500)); window.scrollTo(0, 0); }
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  await new Promise((r) => setTimeout(r, klicks ? 2500 : 0));

  const LISTE = 'https://www.thecomphub.com/api/fotos-bekannt';
  const key = (n) => String(n || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  let bekannt = new Set(); let listeOk = true;
  try { bekannt = new Set((await (await fetch(LISTE)).json()).namen); } catch { listeOk = false; }

  const groesste = (img) => {
    const s = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const teile = s.split(',').map((x) => x.trim().split(/\s+/)).filter((x) => x[0]);
    if (teile.length) return new URL(teile.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))[0][0], location.href).href;
    const u = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
    return u ? new URL(u, location.href).href : '';
  };
  const MUELL = /\b(photo|foto|avatar|profile|picture|image|img|portrait|headshot|player|thumbnail|logo)\b/gi;
  const sauber = (t) => String(t || '').replace(MUELL, '').replace(/\.(jpe?g|png|webp|gif|avif)$/i, '').replace(/[_|·•]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nameVon = (el) => {
    for (const a of ['alt', 'title', 'aria-label', 'data-name']) { const t = sauber(el.getAttribute?.(a)); if (t.length >= 2 && t.length <= 24) return t; }
    let p = el.parentElement;
    for (let i = 0; p && i < 5; i += 1, p = p.parentElement) {
      const zeilen = (p.innerText || '').split('\n').map(sauber).filter((z) => z.length >= 2 && z.length <= 24 && !/^[\d\s.,:%#$€+-]+$/.test(z));
      if (zeilen.length && zeilen.length <= 8) return zeilen[0];
    }
    const datei = decodeURIComponent((groesste(el) || '').split('/').pop().split('?')[0]);
    return sauber(datei.replace(/[-_]\d+x\d+/, '').replace(/[-_]/g, ' '));
  };

  const funde = new Map();
  const nimm = (el, url, b, h) => {
    if (!url || url.startsWith('data:') || /\.svg(\?|$)/i.test(url) || funde.has(url)) return;
    if (/logo|icon|emblem|badge|flag|sprite|banner|emote|favicon/i.test(url.split('?')[0])) return;
    if (b < 60 || h < 60) return;                 // Symbole, Flaggen, Emotes
    const v = h / b; if (v < 0.6 || v > 1.9) return; // Banner und Leisten
    funde.set(url, { url, name: nameVon(el) });
  };
  for (const img of document.querySelectorAll('img')) {
    const b = Math.max(img.naturalWidth, img.width), h = Math.max(img.naturalHeight, img.height);
    nimm(img, groesste(img), b, h);
  }
  for (const el of document.querySelectorAll('div,span,a,figure,li')) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg !== 'none' && /url\(["']?([^"')]+)/.exec(bg);
    if (m) { const r = el.getBoundingClientRect(); nimm(el, new URL(m[1], location.href).href, r.width, r.height); }
  }

  const alle = [...funde.values()];
  // Auch ohne typische Endungen vergleichen ("SHADOW" gegen "shadow1x").
  const hat = (n) => { const k = key(n); return bekannt.has(k) || bekannt.has(k.replace(/(1x|fv|fn|ttv|yt|\d+)$/, '')); };
  const neu = alle.filter((f) => !hat(f.name));

  document.getElementById('ch-fotos')?.remove();
  const box = document.createElement('div');
  box.id = 'ch-fotos';
  box.innerHTML = `<style>
    #ch-fotos{position:fixed;inset:0;z-index:2147483647;background:#0b0e14f2;color:#e2e8f0;font:13px system-ui,sans-serif;overflow:auto;padding:16px}
    #ch-fotos .kopf{position:sticky;top:-16px;background:#0b0e14;padding:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #1e293b;margin-bottom:12px}
    #ch-fotos button{background:#1d9bf0;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
    #ch-fotos button.grau{background:#1e293b}
    #ch-fotos .gitter{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
    #ch-fotos .karte{background:#111827;border:2px solid #1e293b;border-radius:10px;padding:6px}
    #ch-fotos .karte.aus{opacity:.35} #ch-fotos .karte.fehler{border-color:#ef4444} #ch-fotos .karte.ok{border-color:#22c55e}
    #ch-fotos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block;cursor:pointer}
    #ch-fotos input{width:100%;box-sizing:border-box;margin-top:6px;background:#0b0e14;color:#fff;border:1px solid #334155;border-radius:6px;padding:5px;font-weight:700;text-transform:uppercase}
  </style>
  <div class="kopf"><b style="font-size:15px">CompHub · ${neu.length} neue von ${alle.length} Bildern</b>
    <span style="color:#94a3b8">${listeOk ? `${bekannt.size} Namen mit Foto auf CompHub ausgeblendet` : 'CompHub-Liste nicht erreichbar (Seite blockt) - es werden alle gezeigt'} · Klick aufs Bild = abwaehlen</span>
    <span style="flex:1"></span>
    <button id="ch-los">Herunterladen</button><button class="grau" id="ch-kopie">Liste kopieren</button><button class="grau" id="ch-zu">Schliessen</button></div>
  <div class="gitter"></div>`;
  document.body.appendChild(box);
  const gitter = box.querySelector('.gitter');
  const karten = neu.map((f) => {
    const k = document.createElement('div'); k.className = 'karte';
    k.innerHTML = `<img referrerpolicy="no-referrer"><input spellcheck="false">`;
    k.querySelector('img').src = f.url;
    const feld = k.querySelector('input'); feld.value = f.name.toUpperCase();
    k.querySelector('img').onclick = () => k.classList.toggle('aus');
    gitter.appendChild(k);
    return { f, k, feld };
  });
  const gewaehlt = () => karten.filter((x) => !x.k.classList.contains('aus') && x.feld.value.trim());
  const datei = (n) => n.trim().toUpperCase().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');

  box.querySelector('#ch-zu').onclick = () => box.remove();
  box.querySelector('#ch-kopie').onclick = async () => {
    const text = gewaehlt().map((x) => `${datei(x.feld.value)}\t${x.f.url}`).join('\n');
    await navigator.clipboard.writeText(text);
    alert(`${gewaehlt().length} Eintraege kopiert - an Claude geben.`);
  };
  box.querySelector('#ch-los').onclick = async () => {
    let ok = 0, schief = 0;
    for (const x of gewaehlt()) {
      try {
        const r = await fetch(x.f.url, { mode: 'cors', referrerPolicy: 'no-referrer' });
        if (!r.ok) throw new Error(r.status);
        const blob = await r.blob();
        const endung = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : 'jpg';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `${datei(x.feld.value)}.${endung}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        x.k.classList.add('ok'); ok += 1;
      } catch { x.k.classList.add('fehler'); schief += 1; }
      await new Promise((r) => setTimeout(r, 350));
    }
    alert(`${ok} heruntergeladen${schief ? `, ${schief} gesperrt (rot) - dafuer "Liste kopieren" und an Claude geben` : ''}.`);
  };
})();
