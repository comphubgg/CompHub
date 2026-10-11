/*
 * Der Profi teilt sein Bild - Browser-Seite des Weiterreichers (lib/povRelay.ts).
 *
 * Zwei Wege (siehe lib/povRelay.ts):
 *
 *   Strom (Normalfall): der Rekorder des Browsers laeuft ohne Unterbrechung (H.264 und Opus in WebM, ein
 *   Stueck alle 100 ms), app/pov/fmp4.ts packt es in kleine MP4-Fragmente, und die gehen sofort an den Server.
 *   H.264 kodiert die Grafikkarte - das schont den Rechner des Profis beim Spielen. Kein Neustart des Rekorders,
 *   darum keine Luecken im Ton und keine Haenger; die Verzoegerung liegt bei gut einer Sekunde.
 *
 *   Stuecke (Rueckfall, wo der Browser kein H.264 in WebM aufnehmen kann): ganze Ein-Sekunden-Filme,
 *   VP9 oder VP8. Damit zwischen zwei Stuecken keine Luecke entsteht, startet die naechste Aufnahme, bevor die
 *   vorige gestoppt wird.
 */

import { WebmNachFmp4 } from './fmp4';

export type Qualitaet = 'max' | 'mittel' | 'niedrig';

/** Was die Qualitaeten bedeuten: Bildgroesse, Bildrate, Bitrate. */
export const QUALITAET: Record<Qualitaet, { breite: number; hoehe: number; fps: number; bps: number }> = {
  max: { breite: 1920, hoehe: 1080, fps: 60, bps: 8_000_000 },
  mittel: { breite: 1280, hoehe: 720, fps: 60, bps: 4_500_000 },
  niedrig: { breite: 1280, hoehe: 720, fps: 30, bps: 2_500_000 },
};

export interface Zustand {
  art: 'laeuft' | 'ende' | 'fehler';
  zuschauer?: number;
  /** Was zuletzt hochgeladen wurde, in kbit/s. */
  kbit?: number;
  /** Wie viele Stuecke warten (steigt, wenn die Leitung zu langsam ist). */
  warten?: number;
  mime?: string;
  text?: string;
  /** Kommt Ton mit? Ohne ist nur das Bild zu hoeren: still. */
  ton?: boolean;
  /** Wie laut der Ton gerade ist (0 bis 1) - damit der Profi sieht, ob sein Spielton ankommt. */
  pegel?: number;
  weg?: 'strom' | 'stuecke';
}

/** Die beste Aufnahmeart, die dieser Browser kann - mit oder ohne Ton. */
export function waehleAufnahme(mitTon: boolean): string | null {
  const ton = mitTon ? ',mp4a.40.2' : '';
  const webTon = mitTon ? ',opus' : '';
  const liste = [
    `video/mp4;codecs=avc1.64002A${ton}`,
    `video/mp4;codecs=avc1.42E01E${ton}`,
    `video/webm;codecs=vp9${webTon}`,
    `video/webm;codecs=vp8${webTon}`,
  ];
  return liste.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? null;
}

const STUECK_MS = 1000;

/**
 * Ein Testbild statt des Spielfensters: Farbbalken, die Uhrzeit und ein wandernder Block.
 *
 * Zum Ausprobieren, ohne ein zweites Konto und ohne Spiel: der Admin sendet das Testbild hier und sieht es
 * in einem zweiten Tab auf der Streams-Seite (dort sieht er alle POVs). Laeuft ueber denselben Weg wie
 * ein echtes Bild.
 */
export function testbildStrom(qualitaet: Qualitaet, name: string): MediaStream {
  const { breite, hoehe, fps } = QUALITAET[qualitaet];
  const flaeche = document.createElement('canvas');
  flaeche.width = breite; flaeche.height = hoehe;
  const g = flaeche.getContext('2d')!;
  const strom = flaeche.captureStream(Math.min(fps, 30));
  const spur = strom.getVideoTracks()[0];
  const start = performance.now();

  // Ein Ton dazu: ein kurzer Piepton jede Sekunde, im Takt der Uhr - so laesst sich Bild gegen Ton und die
  // Verzoegerung beurteilen. (Nur mit Ton, wo der Browser WebAudio kann.)
  let tonUhr = 0; let ac: AudioContext | null = null;
  try {
    ac = new AudioContext();
    const ziel = ac.createMediaStreamDestination();
    const osz = ac.createOscillator(); const laut = ac.createGain();
    osz.frequency.value = 880; laut.gain.value = 0;
    osz.connect(laut); laut.connect(ziel); osz.start();
    tonUhr = window.setInterval(() => {
      const a = ac; if (!a) return;
      const t = a.currentTime;
      laut.gain.setValueAtTime(0.35, t); laut.gain.setValueAtTime(0, t + 0.12);
    }, 1000);
    ziel.stream.getAudioTracks().forEach((x) => strom.addTrack(x));
  } catch { /* ohne Ton */ }
  const balken = ['#e5e5e5', '#e6d600', '#00c8c8', '#00c24a', '#c800c8', '#e02424', '#2455e0'];
  const text = (t: string, x: number, y: number, px: number) => {
    g.font = `700 ${px}px system-ui, sans-serif`;
    g.lineWidth = px * 0.14; g.strokeStyle = '#000'; g.lineJoin = 'round';
    g.strokeText(t, x, y); g.fillStyle = '#fff'; g.fillText(t, x, y);
  };
  let uhr = 0;
  const zeichne = () => {
    // Das Teilen ist zu Ende (Spur gestoppt): die Zeichnerei auch.
    if (spur.readyState === 'ended') { window.clearInterval(uhr); window.clearInterval(tonUhr); void ac?.close(); return; }
    const t = (performance.now() - start) / 1000;
    balken.forEach((f, i) => { g.fillStyle = f; g.fillRect((i * breite) / 7, 0, breite / 7 + 1, hoehe * 0.72); });
    g.fillStyle = '#101114'; g.fillRect(0, hoehe * 0.72, breite, hoehe * 0.28);
    g.fillStyle = '#fff'; g.fillRect((t * 240) % (breite - 140), hoehe * 0.72 + hoehe * 0.05, 140, hoehe * 0.18);
    // Ein Zeitstempel als Hell-Dunkel-Streifen oben links (41 Bit, Millisekunden): damit laesst sich die Verzoegerung
    // zwischen Senden und Anzeige messen, ohne Texterkennung.
    const jetzt = Date.now();
    for (let i = 0; i < 41; i++) { g.fillStyle = Math.floor(jetzt / 2 ** (40 - i)) % 2 ? '#fff' : '#000'; g.fillRect(i * 16, 0, 16, 16); }
    g.textAlign = 'center';
    text(`${name} · POV test`, breite / 2, hoehe * 0.3, hoehe * 0.075);
    text(new Date().toLocaleTimeString('de-DE'), breite / 2, hoehe * 0.5, hoehe * 0.11);
    g.textAlign = 'left';
  };
  uhr = window.setInterval(zeichne, 33);
  zeichne();
  return strom;
}

/*
 * Das Teilen haengt am Modul, nicht an der Seite: wechselt der Profi im Dashboard von POV zu Einstellungen oder
 * in eine andere Seite der Webseite, laeuft es weiter. Nur Tab schliessen oder Neuladen beendet es.
 */
let aktiv: { stop: () => void; vorschau: MediaStream } | null = null;
let letzter: Zustand | null = null;
const hoerer = new Set<(z: Zustand | null) => void>();

export function holeAktiv(): { stop: () => void; vorschau: MediaStream; zustand: Zustand | null } | null {
  return aktiv ? { ...aktiv, zustand: letzter } : null;
}

export function abonniere(f: (z: Zustand | null) => void): () => void {
  hoerer.add(f);
  return () => { hoerer.delete(f); };
}

/** Teilen beginnen: wenn moeglich als Strom, sonst in Stuecken. */
export function startSenden(stream: MediaStream, qualitaet: Qualitaet, beiEinzeln?: (z: Zustand) => void): { stop: () => void } {
  const art = waehleStromArt(stream.getAudioTracks().length > 0);
  if (art) {
    try { return startStrom(stream, qualitaet, art, beiEinzeln); } catch { /* dann in Stuecken */ }
  }
  return startSegmente(stream, qualitaet, beiEinzeln);
}

function waehleStromArt(mitTon: boolean): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const liste = mitTon
    ? ['video/webm;codecs=h264,opus', 'video/webm;codecs=avc1,opus']
    : ['video/webm;codecs=h264', 'video/webm;codecs=avc1'];
  return liste.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Den Pegel des Tons mitlesen - nicht an die Ausgabe gehaengt, sonst hoert sich der Profi doppelt. */
function pegelMessen(stream: MediaStream, gib: (p: number) => void): () => void {
  const spur = stream.getAudioTracks()[0];
  if (!spur || typeof AudioContext === 'undefined') return () => undefined;
  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  ctx.createMediaStreamSource(new MediaStream([spur])).connect(an);
  void ctx.resume().catch(() => undefined);
  const daten = new Uint8Array(an.fftSize);
  const uhr = window.setInterval(() => {
    an.getByteTimeDomainData(daten);
    let spitze = 0;
    for (const b of daten) spitze = Math.max(spitze, Math.abs(b - 128));
    gib(Math.min(1, spitze / 100));
  }, 120);
  return () => { window.clearInterval(uhr); void ctx.close().catch(() => undefined); };
}

const verbinde = (a: Uint8Array, b: Uint8Array) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

/**
 * Der Strom: laufende Aufnahme, in MP4-Fragmente umgepackt, Fragment fuer Fragment zum Server.
 *
 * Haengt die Leitung hinterher, werden die aeltesten Fragmente bis zum letzten Schluesselbild verworfen:
 * lieber ein Sprung im Bild als eine Verzoegerung, die immer weiter waechst.
 */
function startStrom(stream: MediaStream, qualitaet: Qualitaet, mime: string, beiEinzeln?: (z: Zustand) => void): { stop: () => void } {
  const bei = (z: Zustand) => {
    letzter = z;
    if (z.art !== 'laeuft') aktiv = null;
    beiEinzeln?.(z);
    hoerer.forEach((f) => f(z));
  };
  const q = QUALITAET[qualitaet];
  const hatTon = stream.getAudioTracks().length > 0;
  let laufend = true;
  let zuschauer = 0;
  let pegel = 0;
  let kbit = 0;
  let sendet = false;
  let initDaten: Uint8Array | null = null;
  let initMime = '';
  const warte: Array<{ daten: Uint8Array; key: boolean; mime?: string }> = [];
  const verlauf: Array<[number, number]> = [];

  const melde = (text?: string) => bei({
    art: 'laeuft', zuschauer, kbit, warten: warte.length, mime: 'H.264 · Strom', ton: hatTon, pegel, weg: 'strom',
    ...(text ? { text } : {}),
  });
  const fehler = (text: string) => { bei({ art: 'fehler', text }); beenden(false); };

  /** Bei Rueckstau alles bis zum letzten Schluesselbild verwerfen. */
  const drossele = () => {
    if (warte.length <= 30) return;
    let k = -1;
    for (let i = warte.length - 1; i > 0; i--) if (warte[i].key && !warte[i].mime) { k = i; break; }
    if (k > 0) warte.splice(0, k);
    else if (warte.length > 200) warte.splice(0, warte.length - 30);
  };

  const pumpe = async () => {
    if (sendet) return;
    sendet = true;
    try {
      while (laufend && warte.length) {
        const e = warte.shift()!;
        let body = e.daten;
        // Folgt Nicht-Schluesselbild-Material, geht es in einem Zug mit - weniger Anfragen, gleiche Reihenfolge.
        if (!e.mime) while (warte.length && !warte[0].key && !warte[0].mime) body = verbinde(body, warte.shift()!.daten);
        try {
          const r = await fetch('/api/pov/senden', {
            method: 'POST', cache: 'no-store',
            headers: {
              'Content-Type': 'application/octet-stream', 'X-Pov-Mode': 'fmp4',
              'X-Pov-Init': e.mime ? '1' : '0', 'X-Pov-Key': e.key ? '1' : '0',
              ...(e.mime ? { 'X-Pov-Mime': e.mime } : {}),
            },
            body: body as BodyInit,
          });
          const j = await r.json().catch(() => null) as { ok?: boolean; zuschauer?: number; error?: string } | null;
          if (r.status === 409 && initDaten) {
            // Der Server kennt den Strom nicht mehr (neu gestartet): Init noch einmal vorneweg.
            warte.unshift({ daten: initDaten, key: true, mime: initMime });
            continue;
          }
          if (!r.ok || !j?.ok) { fehler(j?.error ?? `Der Server nimmt das Bild nicht an (${r.status}).`); return; }
          zuschauer = j.zuschauer ?? zuschauer;
          const jetzt = performance.now();
          verlauf.push([jetzt, body.length]);
          while (verlauf.length && jetzt - verlauf[0][0] > 2000) verlauf.shift();
          kbit = Math.round((verlauf.reduce((a, v) => a + v[1], 0) * 8) / 2 / 1000);
          melde();
        } catch {
          melde('Verbindung unterbrochen …');
          await new Promise((x) => setTimeout(x, 400));
        }
      }
    } finally { sendet = false; }
  };

  const umpacker = new WebmNachFmp4((a) => {
    if (a.art === 'init') {
      initDaten = a.daten; initMime = a.mime;
      warte.unshift({ daten: a.daten, key: true, mime: a.mime });
    } else {
      warte.push({ daten: a.daten, key: a.key });
      drossele();
    }
    void pumpe();
  });

  const aufnahme = new MediaRecorder(stream, {
    mimeType: mime, videoBitsPerSecond: q.bps, audioBitsPerSecond: 192_000,
    // Ein Schluesselbild je Sekunde, wo der Browser die Angabe kennt: dort steigt ein spaeter Zuschauer ein.
    ...({ videoKeyFrameIntervalDuration: 1000 } as object),
  });
  let kette: Promise<void> = Promise.resolve();
  aufnahme.ondataavailable = (e) => {
    if (!e.data.size) return;
    // In der Reihenfolge, in der sie ankommen - auch wenn das Auslesen verschieden lange braucht.
    kette = kette.then(async () => { umpacker.fuettere(new Uint8Array(await e.data.arrayBuffer())); });
  };
  aufnahme.onerror = () => fehler('Die Aufnahme ist abgebrochen.');
  const stopPegel = pegelMessen(stream, (p) => { pegel = Math.max(p, pegel * 0.8); });

  const weg = () => { try { navigator.sendBeacon('/api/pov/senden?ende=1'); } catch { /* egal */ } };
  window.addEventListener('pagehide', weg);

  let beendet = false;
  function beenden(meldeEnde: unknown = true) {
    if (beendet) return;
    beendet = true;
    const lief = laufend;
    laufend = false;
    try { if (aufnahme.state !== 'inactive') aufnahme.stop(); } catch { /* war schon beendet */ }
    stopPegel();
    window.removeEventListener('pagehide', weg);
    stream.getTracks().forEach((t) => t.stop());
    void fetch('/api/pov/senden', { method: 'DELETE', keepalive: true }).catch(() => undefined);
    if (lief && meldeEnde !== false) bei({ art: 'ende' });
  }

  // Hoert der Profi im Browser auf zu teilen ("Freigabe beenden"), ist auch hier Schluss.
  stream.getVideoTracks()[0]?.addEventListener('ended', beenden);
  aufnahme.start(100);
  aktiv = { stop: () => beenden(), vorschau: stream };
  melde();
  return { stop: () => beenden() };
}

function startSegmente(stream: MediaStream, qualitaet: Qualitaet, beiEinzeln?: (z: Zustand) => void): { stop: () => void } {
  const bei = (z: Zustand) => {
    letzter = z;
    if (z.art !== 'laeuft') aktiv = null;
    beiEinzeln?.(z);
    hoerer.forEach((f) => f(z));
  };
  const mitTon = stream.getAudioTracks().length > 0;
  const mime = waehleAufnahme(mitTon);
  if (!mime) {
    bei({ art: 'fehler', text: 'Dieser Browser kann das Bild nicht aufnehmen.' });
    return { stop: () => undefined };
  }
  const bps = QUALITAET[qualitaet].bps;
  let laufend = true;
  let aktuell: MediaRecorder | null = null;
  const warteschlange: Blob[] = [];
  let sendet = false;
  let zuschauer = 0;
  let kbit = 0;

  const melde = () => bei({ art: 'laeuft', zuschauer, kbit, warten: warteschlange.length, mime });

  const pumpe = async () => {
    if (sendet) return;
    sendet = true;
    try {
      while (laufend && warteschlange.length) {
        // Haengt die Leitung hinterher, zaehlt das Neue: alte Stuecke verfallen.
        while (warteschlange.length > 3) warteschlange.shift();
        const stueck = warteschlange.shift()!;
        const t0 = performance.now();
        try {
          const r = await fetch('/api/pov/senden', {
            method: 'POST', headers: { 'X-Pov-Mime': mime, 'Content-Type': 'application/octet-stream' },
            body: stueck, cache: 'no-store',
          });
          const j = await r.json().catch(() => null) as { ok?: boolean; zuschauer?: number; error?: string } | null;
          if (!r.ok || !j?.ok) {
            bei({ art: 'fehler', text: j?.error ?? `Der Server nimmt das Bild nicht an (${r.status}).` });
            laufend = false;
            return;
          }
          zuschauer = j.zuschauer ?? 0;
          const dauer = Math.max(0.05, (performance.now() - t0) / 1000);
          kbit = Math.round((stueck.size * 8) / dauer / 1000);
          melde();
        } catch {
          // Kurz weg - das Stueck ist verloren, das naechste kommt.
          bei({ art: 'laeuft', zuschauer, kbit: 0, warten: warteschlange.length, mime, text: 'Verbindung unterbrochen …' });
          await new Promise((x) => setTimeout(x, 700));
        }
      }
    } finally { sendet = false; }
  };

  const neueAufnahme = (): MediaRecorder => {
    const rec = new MediaRecorder(stream, {
      mimeType: mime, videoBitsPerSecond: bps, ...(mitTon ? { audioBitsPerSecond: 128_000 } : {}),
    });
    const teile: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) teile.push(e.data); };
    rec.onstop = () => {
      if (teile.length && laufend) { warteschlange.push(new Blob(teile, { type: mime })); void pumpe(); }
    };
    rec.start();
    return rec;
  };

  aktuell = neueAufnahme();
  const takt = window.setInterval(() => {
    if (!laufend) return;
    const alt = aktuell;
    aktuell = neueAufnahme();
    try { alt?.stop(); } catch { /* war schon beendet */ }
  }, STUECK_MS);

  const beenden = () => {
    if (!laufend) return;
    laufend = false;
    window.clearInterval(takt);
    try { aktuell?.stop(); } catch { /* ok */ }
    stream.getTracks().forEach((t) => t.stop());
    void fetch('/api/pov/senden', { method: 'DELETE', keepalive: true }).catch(() => undefined);
    bei({ art: 'ende' });
  };
  // Hoert der Profi im Browser auf zu teilen ("Freigabe beenden"), ist auch hier Schluss.
  stream.getVideoTracks()[0]?.addEventListener('ended', beenden);
  aktiv = { stop: beenden, vorschau: stream };
  bei({ art: 'laeuft', zuschauer: 0, kbit: 0, warten: 0, mime });
  return { stop: beenden };
}
