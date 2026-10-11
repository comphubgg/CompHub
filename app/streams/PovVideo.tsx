'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MvPlayerHandle } from './MvPlayer';

/*
 * Das POV eines Profis abspielen - Zuschauer-Seite des Weiterreichers (lib/povRelay.ts).
 *
 * Der Server liefert kurze, in sich vollstaendige Stuecke (etwa eine Sekunde). Sie werden hier an einen
 * Medienpuffer gehaengt (Media Source Extensions) und laufen als ein Film. Spielt der Puffer weit hinter dem
 * Ende, springt das Bild nach vorn zum Live-Rand. Kommt nichts mehr, steht "POV offline".
 */

type Stand = 'verbinde' | 'live' | 'offline' | 'verboten';

interface Props {
  /** Die Kennung des Profis. */
  pro: string;
  /** Link-Schluessel statt Anmeldung (fuer OBS). */
  schluessel?: string;
  /** Mit Ton? Auf der Wand beginnen alle stumm. */
  stumm?: boolean;
  /** Der Name, fuer die Anzeige "offline". */
  name?: string;
}

/** "video/mp4;codecs=avc1.64002A,mp4a.40.2" -> 'video/mp4; codecs="avc1.64002A,mp4a.40.2"' */
function fuerPuffer(mime: string): string {
  const m = /^([^;]+);\s*codecs=(.+)$/i.exec(mime.trim());
  return m ? `${m[1]}; codecs="${m[2].replace(/"/g, '')}"` : mime;
}

const PovVideo = forwardRef<MvPlayerHandle, Props>(function PovVideo({ pro, schluessel, stumm = true, name }, ref) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [stand, setStand] = useState<Stand>('verbinde');
  const [ton, setTon] = useState(!stumm);

  useImperativeHandle(ref, () => ({
    abspielen: () => { void video.current?.play().catch(() => undefined); },
    pausiert: () => (video.current ? video.current.paused : null),
    pausieren: () => video.current?.pause(),
    stumm: (an: boolean) => { if (video.current) video.current.muted = an; setTon(!an); },
    qualitaet: () => undefined,
  }), []);

  useEffect(() => {
    const v = video.current;
    if (!v) return undefined;
    v.muted = !ton;
  }, [ton]);

  useEffect(() => {
    const v = video.current;
    if (!v || typeof MediaSource === 'undefined') return undefined;
    let ab = false;
    const abbruch = new AbortController();
    const zuschauer = Math.random().toString(36).slice(2, 12);
    let ms: MediaSource | null = null;
    let sb: SourceBuffer | null = null;
    let aktuelleArt = '';
    const warte: ArrayBuffer[] = [];

    const aufraeumen = () => {
      if (ms && ms.readyState === 'open') { try { ms.endOfStream(); } catch { /* egal */ } }
      if (v.src) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); }
      ms = null; sb = null; aktuelleArt = ''; warte.length = 0;
    };

    const pumpe = () => {
      if (!sb || sb.updating || !warte.length) return;
      try {
        // Alten Puffer wegraeumen, sonst fuellt er sich ueber Stunden.
        if (v.buffered.length && v.currentTime - v.buffered.start(0) > 25) {
          sb.remove(v.buffered.start(0), Math.max(0, v.currentTime - 10));
          return;
        }
        sb.appendBuffer(warte.shift()!);
      } catch (e) {
        if ((e as DOMException).name === 'QuotaExceededError' && v.buffered.length) {
          try { sb.remove(v.buffered.start(0), Math.max(0, v.currentTime - 2)); } catch { /* neu aufbauen */ }
        } else { warte.length = 0; aufraeumen(); }
      }
    };

    const bereit = async (mime: string) => {
      if (ms && aktuelleArt === mime) return true;
      aufraeumen();
      const typ = fuerPuffer(mime);
      if (!MediaSource.isTypeSupported(typ)) return false;
      ms = new MediaSource();
      v.src = URL.createObjectURL(ms);
      await new Promise<void>((ok) => ms!.addEventListener('sourceopen', () => ok(), { once: true }));
      sb = ms.addSourceBuffer(typ);
      sb.mode = 'sequence';
      sb.addEventListener('updateend', () => {
        if (!v.buffered.length) { pumpe(); return; }
        const ende = v.buffered.end(v.buffered.length - 1);
        if (v.paused) void v.play().catch(() => undefined);
        // Hinterher? Dann zum Live-Rand springen.
        if (ende - v.currentTime > 2.4 || (v.readyState < 3 && ende - v.currentTime > 0.5)) v.currentTime = Math.max(0, ende - 0.6);
        pumpe();
      });
      aktuelleArt = mime;
      return true;
    };

    void (async () => {
      let nach = 0;
      const s = schluessel ? `&s=${encodeURIComponent(schluessel)}` : '';
      while (!ab) {
        try {
          const r = await fetch(`/api/pov/segment?pro=${encodeURIComponent(pro)}&nach=${nach}&z=${zuschauer}${s}`,
            { cache: 'no-store', signal: abbruch.signal });
          if (ab) return;
          if (r.status === 401 || r.status === 403) { setStand('verboten'); await new Promise((x) => setTimeout(x, 6000)); continue; }
          if (r.status === 204) {
            const live = r.headers.get('X-Pov-Live') === '1';
            setStand(live ? 'verbinde' : 'offline');
            if (!live) nach = 0;
            continue;
          }
          if (!r.ok) { await new Promise((x) => setTimeout(x, 2000)); continue; }
          const mime = r.headers.get('X-Pov-Mime') ?? '';
          nach = Number(r.headers.get('X-Pov-Seq') ?? nach) || nach;
          const bytes = await r.arrayBuffer();
          if (ab) return;
          if (!await bereit(mime)) { setStand('offline'); await new Promise((x) => setTimeout(x, 5000)); continue; }
          warte.push(bytes);
          pumpe();
          setStand('live');
        } catch (e) {
          if (ab || (e as Error).name === 'AbortError') return;
          await new Promise((x) => setTimeout(x, 1500));
        }
      }
    })();

    return () => { ab = true; abbruch.abort(); aufraeumen(); };
  }, [pro, schluessel]);

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={video} className="h-full w-full object-contain" autoPlay playsInline muted={!ton} />
      {stand !== 'live' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <p className="rounded-lg bg-black/70 px-4 py-2 text-xs text-slate-300">
            {stand === 'verboten' ? 'Not approved' : stand === 'offline' ? `${name ?? 'POV'} · offline` : 'Connecting …'}
          </p>
        </div>
      )}
      {stand === 'live' && (
        <button type="button" onClick={() => setTon((x) => !x)} aria-label={ton ? 'Mute' : 'Unmute'}
          className="absolute bottom-2 left-2 z-10 rounded-md bg-black/70 p-1.5 text-white opacity-0 transition hover:bg-black/90 group-hover:opacity-100 focus:opacity-100">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4z" />
            {ton ? <><path d="M13 7.5a3.5 3.5 0 0 1 0 5" /><path d="M15.2 5.3a6.5 6.5 0 0 1 0 9.4" /></>
              : <><line x1="13" y1="7.5" x2="17" y2="12.5" /><line x1="17" y1="7.5" x2="13" y2="12.5" /></>}
          </svg>
        </button>
      )}
    </div>
  );
});

export default PovVideo;
