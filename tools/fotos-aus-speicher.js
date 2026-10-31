/*
 * CompHub: Spielerfotos aus dem Browser-Speicher retten (31.10.2026).
 *
 * Fuer den Fall, dass eine Seite die Bilder schon angezeigt hat, inzwischen aber nicht mehr antwortet (EU Competitive nach dem Foto-Befehl): nimmt jedes
 * Spielerbild der offenen Seite aus dem Zwischenspeicher des Browsers (fetch mit only-if-cached - geht nie ins Netz) oder, wenn es dort fehlt, direkt
 * vom angezeigten Bild. Gepackt wird in ZIP-Dateien zu je 500 Bildern ("comphub-fotos-01.zip" ...), benannt nach der Bild-Adresse. Die Seite selbst
 * wird dabei nicht ein einziges Mal abgefragt.
 *
 * In der Konsole (F12) der noch offenen Seite einfuegen und Enter. Den Tab vorher NICHT neu laden - sonst ist der Speicher weg.
 */
(async () => {
  const MUSTER = /\/playerpictures\//i;
  const JE_ZIP = 500;

  const anzeige = document.createElement('div');
  anzeige.style.cssText = 'position:fixed;top:12px;left:12px;z-index:2147483647;background:#22c55e;color:#04130a;font:700 15px system-ui;padding:12px 16px;border-radius:10px;box-shadow:0 4px 20px #0008';
  document.body.appendChild(anzeige);
  const zeig = (t) => { anzeige.textContent = 'CompHub · ' + t; };

  // Alle Spielerbilder der Seite, je Adresse einmal (die Seite selbst und das Fenster des Foto-Befehls).
  const bilder = new Map();
  for (const img of document.querySelectorAll('img')) {
    const url = img.currentSrc || img.src;
    if (!url || !MUSTER.test(url)) continue;
    const alt = bilder.get(url);
    if (!alt || (!(alt.complete && alt.naturalWidth) && img.complete && img.naturalWidth)) bilder.set(url, img);
  }
  zeig(`${bilder.size} Bilder gefunden - packe ...`);

  const sauber = (n) => n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/[. ]+$/, '').trim() || 'SPIELER';
  const vergeben = new Set();
  const name = (url) => {
    let n = 'SPIELER';
    try { n = sauber(decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/\.(jpe?g|png|webp|gif)$/i, '')); } catch { /* bleibt */ }
    let k = n, i = 2;
    while (vergeben.has(k.toUpperCase())) k = `${n}_${i++}`;
    vergeben.add(k.toUpperCase());
    return k;
  };

  // Erst das angezeigte Bild (sofort, braucht nichts), sonst der Zwischenspeicher - mit kurzer Frist: haengt dort noch eine Anfrage des Herunterladen-
  // Knopfs an derselben Adresse, wartet der Speicher sonst auf sie (31.10.2026: "seit 10 Sekunden 1 von 7290").
  async function holen(url, img) {
    if (img.complete && img.naturalWidth > 20) {
      try {
        // Hoechstens 1600 Pixel an der langen Seite: zugeschnitten wird ohnehin auf 800x1000, und riesige Pressefotos zu verpacken kostete pro Bild
        // eine Sekunde (31.10.2026).
        const f = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * f); c.height = Math.round(img.naturalHeight * f);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
        if (b) return { daten: new Uint8Array(await b.arrayBuffer()), typ: 'image/jpeg', quelle: 'bild' };
      } catch { /* Bild gesperrt */ }
    }
    try {
      const r = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin', signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        const b = await r.blob();
        if (b.size > 500) return { daten: new Uint8Array(await b.arrayBuffer()), typ: b.type, quelle: 'speicher' };
      }
    } catch { /* nicht im Speicher */ }
    return null;
  }

  // Ein ZIP ohne Kompression (Fotos werden ohnehin nicht kleiner), mit UTF-8-Namen.
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (d) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(dateien) {
    const teile = [], zentral = [];
    let ab = 0;
    for (const f of dateien) {
      const n = new TextEncoder().encode(f.name), crc = crc32(f.daten), len = f.daten.length;
      const kopf = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, len, 4], [22, len, 4], [26, n.length, 2], [28, 0, 2]]
        .forEach(([o, v, b]) => (b === 4 ? kopf.setUint32(o, v, true) : kopf.setUint16(o, v, true)));
      const z = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, len, 4], [24, len, 4], [28, n.length, 2],
        [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, ab, 4]]
        .forEach(([o, v, b]) => (b === 4 ? z.setUint32(o, v, true) : z.setUint16(o, v, true)));
      teile.push(kopf, n, f.daten); zentral.push(z, n);
      ab += 30 + n.length + len;
    }
    const groesse = zentral.reduce((s, x) => s + x.byteLength, 0);
    const ende = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, dateien.length, 2], [10, dateien.length, 2], [12, groesse, 4], [16, ab, 4], [20, 0, 2]]
      .forEach(([o, v, b]) => (b === 4 ? ende.setUint32(o, v, true) : ende.setUint16(o, v, true)));
    return new Blob([...teile, ...zentral, ende], { type: 'application/zip' });
  }

  const liste = [...bilder];
  let speicher = 0, vomBild = 0, fehlt = 0, nr = 0, stapel = [];
  const fehlend = [];
  const raus = async () => {
    if (!stapel.length) return;
    nr += 1;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip(stapel));
    a.download = `comphub-fotos-${String(nr).padStart(2, '0')}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    stapel = [];
    await new Promise((r) => setTimeout(r, 1500));
  };
  // Sechs zugleich - das Verpacken laeuft im Browser, ins Netz geht dabei nichts.
  let naechster = 0, fertig = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (naechster < liste.length) {
      const [url, img] = liste[naechster++];
      const b = await holen(url, img);
      fertig += 1;
      if (!b) { fehlt += 1; fehlend.push(url); continue; }
      b.quelle === 'speicher' ? speicher += 1 : vomBild += 1;
      const endung = /png/.test(b.typ) ? 'png' : /webp/.test(b.typ) ? 'webp' : 'jpg';
      stapel.push({ name: `${name(url)}.${endung}`, daten: b.daten });
      if (stapel.length >= JE_ZIP) await raus();
      if (fertig % 10 === 0) zeig(`${fertig} von ${liste.length} · ${speicher + vomBild} gerettet · ZIP ${nr + 1}`);
    }
  }));
  await raus();
  // Was weder im Speicher noch auf dem Bildschirm war, als Liste dazu - die holt Claude, sobald die Seite wieder antwortet.
  if (fehlend.length) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([fehlend.join('\n')], { type: 'text/plain' }));
    a.download = 'comphub-fotos-fehlen.txt';
    document.body.appendChild(a); a.click(); a.remove();
  }
  zeig(`Fertig: ${speicher + vomBild} Bilder in ${nr} ZIP-Datei(en) · ${fehlt} fehlen (nicht geladen gewesen)`);
  alert(`Fertig: ${speicher + vomBild} Bilder in ${nr} ZIP-Datei(en) im Download-Ordner.\n${fehlt} Bilder waren nicht im Speicher - die hole ich spaeter.\n\nClaude Bescheid geben, die ZIPs nicht entpacken.`);
})();
