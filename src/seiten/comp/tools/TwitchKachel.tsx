import { useEffect, useId, useRef } from 'react';

/*
 * Ein Twitch-Player ueber die Embed-Schnittstelle (wie app/streams/Kachel.tsx der echten Seite): einmal gebaut, danach werden Ton und Lautstaerke am
 * laufenden Player gestellt - kein Neuladen beim Umschalten des Tons. parent = der Host, auf dem der Hub laeuft (localhost / 127.0.0.1).
 */

interface TwitchSpieler { setMuted(s: boolean): void; setVolume(v: number): void; addEventListener(e: string, f: () => void): void }
declare global {
  interface Window { Twitch?: { Player: { new (ziel: string, o: Record<string, unknown>): TwitchSpieler; READY: string } } }
}

let laden: Promise<void> | null = null;
function skriptLaden(): Promise<void> {
  if (window.Twitch?.Player) return Promise.resolve();
  if (!laden) {
    laden = new Promise<void>((ok, nein) => {
      const s = document.createElement('script');
      s.src = 'https://player.twitch.tv/js/embed/v1.js';
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { laden = null; nein(new Error('Twitch-Skript nicht geladen')); };
      document.head.appendChild(s);
    });
  }
  return laden;
}

export default function TwitchKachel({ kanal, ton, lautstaerke = 0.5 }: { kanal: string; ton: boolean; lautstaerke?: number }) {
  const ziel = `tw-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const spieler = useRef<TwitchSpieler | null>(null);
  const bereit = useRef(false);
  const wunsch = useRef({ ton, lautstaerke });
  wunsch.current = { ton, lautstaerke };

  useEffect(() => {
    let weg = false;
    const host = window.location.hostname;
    skriptLaden().then(() => {
      if (weg || !window.Twitch || !document.getElementById(ziel)) return;
      const p = new window.Twitch.Player(ziel, {
        channel: kanal, parent: [...new Set([host, 'localhost', '127.0.0.1'])], autoplay: true, muted: !wunsch.current.ton, width: '100%', height: '100%',
      });
      p.addEventListener(window.Twitch.Player.READY, () => {
        bereit.current = true;
        p.setMuted(!wunsch.current.ton);
        if (wunsch.current.ton) p.setVolume(wunsch.current.lautstaerke);
      });
      spieler.current = p;
    }).catch(() => { /* ohne Skript bleibt die Kachel leer */ });
    return () => {
      weg = true; spieler.current = null; bereit.current = false;
      const el = document.getElementById(ziel);
      if (el) el.innerHTML = '';
    };
  }, [kanal, ziel]);

  useEffect(() => {
    const p = spieler.current;
    if (!p || !bereit.current) return;
    p.setMuted(!ton);
    if (ton) p.setVolume(lautstaerke);
  }, [ton, lautstaerke]);

  return <div id={ziel} className="h-full w-full bg-black" />;
}
