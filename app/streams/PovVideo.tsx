'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { MvPlayerHandle } from './MvPlayer';
import type { HudOrt } from '@/lib/pov';
import { HudBanner, type HudGroesse } from '@/app/components/PovHud';
import { useT } from '@/app/components/SprachProvider';

/*
 * Das POV eines Profis abspielen - Zuschauer-Seite des Weiterreichers (lib/povRelay.ts).
 *
 * Der Normalfall ist der Strom: eine offene Antwort des Servers, Stueck fuer Stueck MP4-Fragmente (etwa alle
 * 100 ms). Sie werden an einen Medienpuffer gehaengt (Media Source Extensions); der Player haelt sich dicht am
 * Live-Rand - hinkt er mehr als eine halbe Sekunde hinterher, holt er mit leicht erhoehter Geschwindigkeit
 * auf, bei mehr als anderthalb Sekunden springt er. Endet der Strom (der Profi hoert auf), steht sofort
 * "offline" da. Wo der Profi in Stuecken sendet (alter Weg), laeuft die alte Abfrage weiter.
 *
 * Auf der Wand traegt die Kachel eine Leiste: Lautstaerke (bis 200 Prozent), Zahnrad fuer das Namensbanner
 * (an/aus, Position, Groesse), Vollbild. In OBS ist keine Leiste da.
 */

type Stand = 'verbinde' | 'live' | 'offline' | 'verboten';

export interface BannerEinst { an: boolean; ort: HudOrt; mitBild: boolean; groesse: HudGroesse }

interface Props {
  /** Die Kennung des Profis. */
  pro: string;
  /** Link-Schluessel statt Anmeldung (fuer OBS). */
  schluessel?: string;
  /** Mit Ton? Auf der Wand beginnen alle stumm. */
  stumm?: boolean;
  /** Der Name, fuer die Anzeige "offline". */
  name?: string;
  /** Das Namensbanner nach den Einstellungen des Zuschauers - mit Name und Bild des Profis. */
  banner?: { einst: BannerEinst; name: string; bild: string | null };
  /** Mit Bedienleiste (Wand): so aendert der Zuschauer sein Banner. In OBS fehlt es. */
  aendereBanner?: (teil: Partial<BannerEinst>) => void;
}

/** "video/mp4;codecs=avc1.64002A,mp4a.40.2" -> 'video/mp4; codecs="avc1.64002A,mp4a.40.2"' */
function fuerPuffer(mime: string): string {
  const m = /^([^;]+);\s*codecs=(.+)$/i.exec(mime.trim());
  return m ? `${m[1]}; codecs="${m[2].replace(/"/g, '')}"` : mime;
}

const LAUT_SCHLUESSEL = 'multihub_pov_laut_v1';
const leseLaut = (pro: string): number => {
  try {
    const j = JSON.parse(localStorage.getItem(LAUT_SCHLUESSEL) ?? '{}') as Record<string, number>;
    const v = Number(j[pro]);
    return Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1;
  } catch { return 1; }
};
const speichereLaut = (pro: string, v: number) => {
  try {
    const j = JSON.parse(localStorage.getItem(LAUT_SCHLUESSEL) ?? '{}') as Record<string, number>;
    j[pro] = v;
    localStorage.setItem(LAUT_SCHLUESSEL, JSON.stringify(j));
  } catch { /* ohne Speicher bleibt es bei der Sitzung */ }
};

const verbinde = (teile: Uint8Array[]): Uint8Array => {
  let n = 0; for (const t of teile) n += t.length;
  const r = new Uint8Array(n); let o = 0;
  for (const t of teile) { r.set(t, o); o += t.length; }
  return r;
};

const knopf = 'flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-black/90';

const Ikone = ({ d, extra = '' }: { d: string; extra?: string }) => (
  <svg viewBox="0 0 20 20" className={`h-4 w-4 ${extra}`} fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const ORTE: Array<{ wert: HudOrt; titel: string }> = [
  { wert: 'oben', titel: 'Oben' }, { wert: 'unten', titel: 'Unten' }, { wert: 'links', titel: 'Links' }, { wert: 'rechts', titel: 'Rechts' },
];
const GROESSEN: Array<{ wert: HudGroesse; titel: string }> = [
  { wert: 'klein', titel: 'Klein' }, { wert: 'mittel', titel: 'Mittel' }, { wert: 'gross', titel: 'Groß' },
];

const PovVideo = forwardRef<MvPlayerHandle, Props>(function PovVideo(
  { pro, schluessel, stumm = true, name, banner, aendereBanner }, ref,
) {
  const t = useT();
  const wurzel = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [stand, setStand] = useState<Stand>('verbinde');
  const [ton, setTon] = useState(!stumm);
  const [laut, setLaut] = useState(1);
  const [vollbild, setVollbild] = useState(false);
  const [zahnrad, setZahnrad] = useState(false);
  const graph = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);

  // Die gemerkte Lautstaerke dieses POVs - erst im Browser lesbar.
  useEffect(() => { setLaut(leseLaut(pro)); }, [pro]);

  /** Lautstaerke anwenden: bis 100 Prozent am Element, darueber ueber einen Verstaerker (WebAudio). */
  const wendeAn = useCallback((v: number, aus: boolean) => {
    const el = video.current;
    if (!el) return;
    el.muted = aus;
    if (v > 1 && !graph.current) {
      try {
        const ctx = new AudioContext();
        const quelle = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        quelle.connect(gain); gain.connect(ctx.destination);
        graph.current = { ctx, gain };
      } catch { /* dann bleibt es bei 100 Prozent */ }
    }
    if (graph.current) {
      graph.current.gain.gain.value = v;
      el.volume = 1;
      void graph.current.ctx.resume().catch(() => undefined);
    } else {
      el.volume = Math.min(1, v);
    }
  }, []);
  useEffect(() => { wendeAn(laut, !ton); }, [laut, ton, wendeAn]);
  useEffect(() => () => { void graph.current?.ctx.close().catch(() => undefined); graph.current = null; }, []);

  useImperativeHandle(ref, () => ({
    abspielen: () => { void video.current?.play().catch(() => undefined); },
    pausiert: () => (video.current ? video.current.paused : null),
    pausieren: () => video.current?.pause(),
    stumm: (an: boolean) => { setTon(!an); },
    qualitaet: () => undefined,
  }), []);

  /* ------------------------------------------------------------ Vollbild */
  useEffect(() => {
    const beiWechsel = () => setVollbild(document.fullscreenElement === wurzel.current);
    document.addEventListener('fullscreenchange', beiWechsel);
    return () => document.removeEventListener('fullscreenchange', beiWechsel);
  }, []);
  const vollbildUmschalten = () => {
    const el = wurzel.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  /* ------------------------------------------------------------ Abspielen */
  useEffect(() => {
    const v = video.current;
    if (!v || typeof MediaSource === 'undefined') return undefined;
    let ab = false;
    const abbruch = new AbortController();
    const zuschauer = Math.random().toString(36).slice(2, 12);
    let ms: MediaSource | null = null;
    let sb: SourceBuffer | null = null;
    let aktuelleArt = '';
    let erster = true;
    let nach = 0; // alter Weg: Nummer des letzten Stuecks
    const warte: Uint8Array[] = [];

    const aufraeumen = () => {
      if (ms && ms.readyState === 'open') { try { ms.endOfStream(); } catch { /* egal */ } }
      if (v.src) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); }
      ms = null; sb = null; aktuelleArt = ''; warte.length = 0; erster = true;
      v.playbackRate = 1;
    };

    /** Nach jedem Anhaengen: dicht am Live-Rand bleiben. */
    const amRand = () => {
      if (!v.buffered.length) return;
      const ende = v.buffered.end(v.buffered.length - 1);
      if (erster) {
        erster = false;
        v.currentTime = Math.max(v.buffered.start(v.buffered.length - 1), ende - 0.3);
      } else {
        const rueck = ende - v.currentTime;
        if (rueck > 1.5) v.currentTime = ende - 0.4;
        else if (rueck > 0.7) { if (v.playbackRate !== 1.12) v.playbackRate = 1.12; }
        else if (rueck < 0.4 && v.playbackRate !== 1) v.playbackRate = 1;
      }
      if (v.paused) void v.play().catch(() => undefined);
    };

    const pumpe = () => {
      if (!sb || sb.updating || !warte.length) return;
      try {
        // Alten Puffer wegraeumen, sonst fuellt er sich ueber Stunden.
        if (v.buffered.length && v.currentTime - v.buffered.start(0) > 12) {
          sb.remove(v.buffered.start(0), Math.max(0, v.currentTime - 6));
          return;
        }
        let n = 0; let bytes = 0;
        while (n < warte.length && bytes < 1_500_000) { bytes += warte[n].length; n += 1; }
        const teil = n === 1 ? warte.shift()! : verbinde(warte.splice(0, n));
        sb.appendBuffer(teil as BufferSource);
      } catch (e) {
        if ((e as DOMException).name === 'QuotaExceededError' && v.buffered.length) {
          try { sb.remove(v.buffered.start(0), Math.max(0, v.currentTime - 2)); } catch { /* neu aufbauen */ }
        } else { warte.length = 0; aufraeumen(); setStand('verbinde'); }
      }
    };

    const bereit = async (mime: string, weise: 'segments' | 'sequence') => {
      if (ms && aktuelleArt === mime) return true;
      aufraeumen();
      const typ = fuerPuffer(mime);
      if (!MediaSource.isTypeSupported(typ)) return false;
      ms = new MediaSource();
      v.src = URL.createObjectURL(ms);
      await new Promise<void>((ok) => ms!.addEventListener('sourceopen', () => ok(), { once: true }));
      sb = ms.addSourceBuffer(typ);
      sb.mode = weise;
      sb.addEventListener('updateend', () => { amRand(); pumpe(); });
      aktuelleArt = mime;
      return true;
    };

    const beiSpiel = () => setStand('live');
    v.addEventListener('playing', beiSpiel);
    const beiFehler = () => { if (!ab) { aufraeumen(); setStand('verbinde'); } };
    v.addEventListener('error', beiFehler);

    /** Der Strom: lesen, bis er endet - der Profi hat dann aufgehoert (oder die Leitung riss). */
    const strom = async (r: Response) => {
      const mime = r.headers.get('X-Pov-Mime') ?? '';
      if (!await bereit(mime, 'segments') || !r.body) { setStand('offline'); await new Promise((x) => setTimeout(x, 3000)); return; }
      setStand('verbinde');
      const leser = r.body.getReader();
      try {
        for (;;) {
          const { done, value } = await leser.read();
          if (done || ab) break;
          if (value?.length) { warte.push(value); pumpe(); }
        }
      } catch { /* abgebrochen oder Leitung weg */ }
      if (!ab) { aufraeumen(); setStand('offline'); }
    };

    /** Alter Weg: ein Stueck abholen (Long Polling). */
    const alteRunde = async () => {
      const s = schluessel ? `&s=${encodeURIComponent(schluessel)}` : '';
      const r = await fetch(`/api/pov/segment?pro=${encodeURIComponent(pro)}&nach=${nach}&z=${zuschauer}${s}`,
        { cache: 'no-store', signal: abbruch.signal });
      if (ab) return;
      if (r.status === 401 || r.status === 403) { setStand('verboten'); await new Promise((x) => setTimeout(x, 6000)); return; }
      if (r.status === 204) {
        const live = r.headers.get('X-Pov-Live') === '1';
        setStand(live ? 'verbinde' : 'offline');
        if (!live) { nach = 0; aufraeumen(); }
        return;
      }
      if (!r.ok) { await new Promise((x) => setTimeout(x, 2000)); return; }
      const mime = r.headers.get('X-Pov-Mime') ?? '';
      nach = Number(r.headers.get('X-Pov-Seq') ?? nach) || nach;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (ab) return;
      if (!await bereit(mime, 'sequence')) { setStand('offline'); await new Promise((x) => setTimeout(x, 5000)); return; }
      warte.push(bytes);
      pumpe();
    };

    void (async () => {
      const s = schluessel ? `&s=${encodeURIComponent(schluessel)}` : '';
      while (!ab) {
        try {
          const r = await fetch(`/api/pov/strom?pro=${encodeURIComponent(pro)}&z=${zuschauer}${s}`,
            { cache: 'no-store', signal: abbruch.signal });
          if (ab) return;
          if (r.status === 401 || r.status === 403) { setStand('verboten'); await new Promise((x) => setTimeout(x, 6000)); continue; }
          if (r.status === 200 && r.headers.get('X-Pov-Mode') === 'strom') { await strom(r); continue; }
          if (r.status === 204) {
            if (r.headers.get('X-Pov-Mode') === 'segmente') { await alteRunde(); continue; }
            // Der Server hat bis zu acht Sekunden gewartet: der Profi sendet nicht.
            setStand('offline');
            continue;
          }
          await new Promise((x) => setTimeout(x, 2000));
        } catch (e) {
          if (ab || (e as Error).name === 'AbortError') return;
          await new Promise((x) => setTimeout(x, 1500));
        }
      }
    })();

    return () => {
      ab = true; abbruch.abort();
      v.removeEventListener('playing', beiSpiel); v.removeEventListener('error', beiFehler);
      aufraeumen();
    };
  }, [pro, schluessel]);

  /* ------------------------------------------------------------ Anzeige */
  const stummGeschaltet = !ton || laut === 0;
  const prozent = Math.round(laut * 100);

  return (
    <div ref={wurzel} className="group/pov relative h-full w-full bg-black" onMouseLeave={() => setZahnrad(false)}>
      <video ref={video} className="h-full w-full object-contain" autoPlay playsInline muted={!ton}
        onDoubleClick={aendereBanner ? vollbildUmschalten : undefined} />

      {stand !== 'live' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <p className="rounded-lg bg-black/70 px-4 py-2 text-xs text-slate-300">
            {stand === 'verboten' ? 'Not approved' : stand === 'offline' ? `${name ?? 'POV'} · offline` : 'Connecting …'}
          </p>
        </div>
      )}

      {banner && stand === 'live' && (
        <HudBanner hud={{ ...banner.einst, text: '' }} groesse={banner.einst.groesse} name={banner.name} bild={banner.bild} />
      )}

      {aendereBanner && (
        <>
          {zahnrad && banner && (
            <div className="absolute bottom-12 right-2 z-30 w-60 space-y-3 rounded-lg border border-white/10 bg-zinc-900/95 p-3 text-xs text-slate-200 shadow-xl"
              onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" role="switch" aria-checked={banner.einst.an}
                onClick={() => aendereBanner({ an: !banner.einst.an })}
                className="flex w-full items-center justify-between gap-3 text-left">
                <span>{t('Namensbanner zeigen')}</span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${banner.einst.an ? 'bg-sky-500' : 'bg-zinc-600/70'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${banner.einst.an ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </button>
              {banner.einst.an && (
                <>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{t('Position')}</p>
                    <div className="grid grid-cols-4 gap-1">
                      {ORTE.map((o) => (
                        <button key={o.wert} type="button" onClick={() => aendereBanner({ ort: o.wert })}
                          className={`rounded-md border px-1 py-1 transition ${banner.einst.ort === o.wert
                            ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'border-zinc-700 hover:border-zinc-500'}`}>
                          {t(o.titel)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{t('Größe')}</p>
                    <div className="grid grid-cols-3 gap-1">
                      {GROESSEN.map((o) => (
                        <button key={o.wert} type="button" onClick={() => aendereBanner({ groesse: o.wert })}
                          className={`rounded-md border px-1 py-1 transition ${banner.einst.groesse === o.wert
                            ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'border-zinc-700 hover:border-zinc-500'}`}>
                          {t(o.titel)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={banner.einst.mitBild} className="accent-sky-500"
                      onChange={(e) => aendereBanner({ mitBild: e.target.checked })} />
                    {t('Mit Profilbild')}
                  </label>
                </>
              )}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 p-2 opacity-0 transition-opacity
                          focus-within:opacity-100 group-hover/pov:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className={knopf} onClick={() => setTon((x) => !x)}
              title={stummGeschaltet ? t('Ton an') : t('Stumm')} aria-label={stummGeschaltet ? t('Ton an') : t('Stumm')}>
              {stummGeschaltet
                ? <Ikone d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4zM13 7.5l4 5M17 7.5l-4 5" />
                : <Ikone d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4zM13 7.5a3.5 3.5 0 0 1 0 5M15.2 5.3a6.5 6.5 0 0 1 0 9.4" />}
            </button>
            <input type="range" min={0} max={200} step={5} value={ton ? prozent : 0}
              onChange={(e) => {
                const n = Number(e.target.value) / 100;
                setLaut(n); speichereLaut(pro, n);
                setTon(n > 0);
              }}
              title={`${t('Lautstärke')} ${ton ? prozent : 0} %`} aria-label={t('Lautstärke')}
              className="h-1 w-24 cursor-pointer accent-sky-500" />
            <span className="w-9 text-[10px] tabular-nums text-white/80">{ton ? prozent : 0}%</span>

            <span className="flex-1" />

            {banner && (
              <button type="button" className={`${knopf} ${zahnrad ? 'ring-1 ring-sky-400' : ''}`} onClick={() => setZahnrad((x) => !x)}
                title={t('POV-Banner')} aria-label={t('POV-Banner')}>
                <Ikone d="M3 6h8M15 6h2M3 14h2M9 14h8M13 4v4M7 12v4" />
              </button>
            )}
            <button type="button" className={knopf} onClick={vollbildUmschalten}
              title={vollbild ? t('Vollbild verlassen') : t('Vollbild')} aria-label={vollbild ? t('Vollbild verlassen') : t('Vollbild')}>
              <Ikone d={vollbild ? 'M7.5 2.5v5h-5M12.5 2.5v5h5M17.5 12.5h-5v5M2.5 12.5h5v5' : 'M7.5 2.5h-5v5M12.5 2.5h5v5M17.5 12.5v5h-5M2.5 12.5v5h5'} />
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default PovVideo;
