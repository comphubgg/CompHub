import { useEffect, useId, useRef } from 'react';
import { skriptLaden, type TwitchSpieler } from '../../streamer/mv/Kachel';

/*
 * Ein Twitch-Player ueber die Embed-Schnittstelle (wie app/streams/Kachel.tsx der echten Seite): einmal gebaut, danach werden Ton und Lautstaerke am
 * laufenden Player gestellt - kein Neuladen beim Umschalten des Tons. parent = der Host, auf dem der Hub laeuft (localhost / 127.0.0.1).
 */

// Skript und Typen teilt sie mit der Multiview (src/seiten/streamer/mv/Kachel.tsx - die Multiview der echten Seite).
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
