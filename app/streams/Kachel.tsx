'use client';

import { useEffect, useId, useRef } from 'react';

/*
 * Ein Twitch-Player, der nie neu laedt.
 *
 * Bisher war jeder Stream ein iframe mit fester Adresse; Ton und Lautstaerke
 * standen in dieser Adresse, und jede Aenderung daran baute den Player von
 * vorn auf. Wer den Ton auf einen anderen Stream legte oder zwischen Einzel-
 * und Kachelansicht wechselte, sah alle Streams von vorn anlaufen. Der
 * Betreiber: "der Stream soll immer weiterlaufen, ohne dass er Pause macht."
 *
 * Deshalb hier die Embed-Schnittstelle von Twitch: der Player wird einmal
 * gebaut, danach werden Ton und Lautstaerke am laufenden Player gestellt.
 * Sie ist kostenlos und braucht keinen Schluessel - nur die Angabe, auf
 * welcher Seite der Player liegt.
 */

declare global {
  interface Window {
    Twitch?: {
      Player: {
        new (ziel: string, optionen: Record<string, unknown>): TwitchSpieler;
        READY: string;
        ONLINE: string;
        OFFLINE: string;
      };
    };
  }
}

interface TwitchSpieler {
  setMuted(stumm: boolean): void;
  setVolume(wert: number): void;
  play(): void;
  pause(): void;
  addEventListener(ereignis: string, ruf: () => void): void;
}

const SKRIPT = 'https://player.twitch.tv/js/embed/v1.js';
let laden: Promise<void> | null = null;

/** Das Skript einmal holen - alle Kacheln teilen sich denselben Aufruf. */
function skriptLaden(): Promise<void> {
  if (window.Twitch?.Player) return Promise.resolve();
  if (!laden) {
    laden = new Promise<void>((ok, nein) => {
      const s = document.createElement('script');
      s.src = SKRIPT;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { laden = null; nein(new Error('Twitch-Skript nicht geladen')); };
      document.head.appendChild(s);
    });
  }
  return laden;
}

/**
 * @param kanal Der Twitch-Name.
 * @param parent Die Seite, auf der der Player liegt - Twitch verlangt sie.
 * @param ton Ob dieser Stream zu hoeren ist. Nur einer hat den Ton.
 * @param lautstaerke 0 bis 1, gilt nur mit Ton.
 */
export default function Kachel({ kanal, parent, ton, lautstaerke }: {
  kanal: string; parent: string; ton: boolean; lautstaerke: number;
}) {
  const kennung = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ziel = `kachel-${kennung}`;
  const spieler = useRef<TwitchSpieler | null>(null);
  const bereit = useRef(false);
  // Der letzte Wunsch - falls er ankommt, bevor der Player bereit ist.
  const wunsch = useRef({ ton, lautstaerke });
  wunsch.current = { ton, lautstaerke };

  useEffect(() => {
    let weg = false;
    skriptLaden().then(() => {
      if (weg || !window.Twitch || !document.getElementById(ziel)) return;
      const p = new window.Twitch.Player(ziel, {
        channel: kanal,
        parent: [parent],
        autoplay: true,
        muted: !wunsch.current.ton,
        width: '100%',
        height: '100%',
      });
      p.addEventListener(window.Twitch.Player.READY, () => {
        bereit.current = true;
        p.setMuted(!wunsch.current.ton);
        if (wunsch.current.ton) p.setVolume(wunsch.current.lautstaerke);
      });
      spieler.current = p;
    }).catch(() => { /* Ohne Skript bleibt die Kachel leer - besser als ein Fehler ueber allem. */ });

    return () => {
      weg = true;
      spieler.current = null;
      bereit.current = false;
      const el = document.getElementById(ziel);
      if (el) el.innerHTML = '';
    };
  }, [kanal, parent, ziel]);

  /* Ton und Lautstaerke am laufenden Player - kein Neuladen. */
  useEffect(() => {
    const p = spieler.current;
    if (!p || !bereit.current) return;
    p.setMuted(!ton);
    if (ton) p.setVolume(lautstaerke);
  }, [ton, lautstaerke]);

  return <div id={ziel} className="h-full w-full" />;
}
