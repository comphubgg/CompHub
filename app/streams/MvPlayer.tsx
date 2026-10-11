'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { skriptLaden, type TwitchSpieler } from './Kachel';

/*
 * Ein Twitch-Player fuer die Wand, von aussen steuerbar.
 *
 * Wie Kachel.tsx wird der Player einmal gebaut und danach nur noch gestellt - Ton, Pause, Qualitaet -,
 * ohne ihn neu zu laden. Die Wand braucht dazu Griffe fuer "Alle pausieren", "Alle stumm" und die
 * gemeinsame Qualitaet; sie liegen hier als Handle, damit die Wand keine eigene Kopie des
 * Player-Zustands fuehren muss.
 *
 * Alle Player starten stumm: ohne vorherigen Klick spielt der Browser ohnehin keinen Ton ab, und
 * zwanzig Streams gleichzeitig mit Ton waeren unbrauchbar. Den Ton legt man im Player selbst an.
 */
export interface MvPlayerHandle {
  abspielen(): void;
  pausieren(): void;
  stumm(an: boolean): void;
  qualitaet(wert: string): void;
}

interface Props {
  kanal: string;
  /** Die Seite, auf der der Player liegt - Twitch verlangt sie. */
  host: string;
  /** 'auto', 'chunked' (Source), '720p60' ... */
  qualitaet: string;
}

const MvPlayer = forwardRef<MvPlayerHandle, Props>(function MvPlayer({ kanal, host, qualitaet }, ref) {
  const kennung = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ziel = `mv-${kennung}`;
  const spieler = useRef<TwitchSpieler | null>(null);
  const bereit = useRef(false);
  // Der letzte Wunsch - falls er ankommt, bevor der Player bereit ist.
  const wunsch = useRef(qualitaet);
  wunsch.current = qualitaet;

  const stelleQualitaet = (wert: string) => {
    try { spieler.current?.setQuality?.(wert); } catch { /* Player gerade ohne Auswahl */ }
  };

  useImperativeHandle(ref, () => ({
    abspielen: () => {
      const p = spieler.current;
      if (!p) return;
      try { p.play(); } catch { /* noch nicht bereit */ }
      /*
       * Twitch laesst play() aus dem Elternfenster manchmal ins Leere laufen (Autoplay-Sperre des
       * Browsers). Stumm abspielen ist immer erlaubt - also wird nach einem Moment nachgesehen und
       * notfalls stumm noch einmal angestossen. Der Ton bleibt dabei, wie er war, solange es klappt.
       */
      window.setTimeout(() => {
        try {
          if (spieler.current === p && p.isPaused?.()) { p.setMuted(true); p.play(); }
        } catch { /* Player gerade weg */ }
      }, 900);
    },
    pausieren: () => { try { spieler.current?.pause(); } catch { /* noch nicht bereit */ } },
    stumm: (an: boolean) => { try { spieler.current?.setMuted(an); } catch { /* noch nicht bereit */ } },
    qualitaet: stelleQualitaet,
  }), []);

  useEffect(() => {
    let weg = false;
    skriptLaden().then(() => {
      if (weg || !window.Twitch || !document.getElementById(ziel)) return;
      const p = new window.Twitch.Player(ziel, {
        channel: kanal,
        parent: [host],
        autoplay: true,
        muted: true,
        width: '100%',
        height: '100%',
      });
      p.addEventListener(window.Twitch.Player.READY, () => {
        bereit.current = true;
        if (wunsch.current && wunsch.current !== 'auto') stelleQualitaet(wunsch.current);
      });
      spieler.current = p;
    }).catch(() => { /* Ohne Skript bleibt die Kachel schwarz - besser als ein Fehler ueber allem. */ });

    return () => {
      weg = true;
      spieler.current = null;
      bereit.current = false;
      const el = document.getElementById(ziel);
      if (el) el.innerHTML = '';
    };
  }, [kanal, host, ziel]);

  // Eine andere Qualitaet am laufenden Player - kein Neuladen.
  useEffect(() => {
    if (bereit.current) stelleQualitaet(qualitaet);
  }, [qualitaet]);

  return <div id={ziel} className="h-full w-full" />;
});

export default MvPlayer;
