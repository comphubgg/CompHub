/*
 * Der Profi teilt sein Bild - Browser-Seite des Weiterreichers (lib/povRelay.ts).
 *
 * Aufgenommen wird in kurzen, in sich vollstaendigen Stuecken (etwa eine Sekunde, je Stueck mit
 * Schluesselbild): so kann jeder Zuschauer jederzeit einsteigen, und es braucht keinen Zusatzdienst.
 * Bevorzugt wird H.264 in MP4 - das kodiert die Grafikkarte, das schont den Rechner des Profis beim
 * Spielen. Wo der Browser das nicht kann, geht VP9 oder VP8 in WebM.
 *
 * Damit zwischen zwei Stuecken keine Luecke entsteht, startet die naechste Aufnahme, bevor die vorige
 * gestoppt wird; es ueberlappt sich dabei nur ein Augenblick.
 */

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

export function startSenden(stream: MediaStream, qualitaet: Qualitaet, beiEinzeln?: (z: Zustand) => void): { stop: () => void } {
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
