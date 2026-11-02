'use client';

import { useEffect, useState } from 'react';
import { useT, useSprache } from '@/app/components/SprachProvider';

/*
 * Wie viele Matches eines Spieltags schon ausgewertet sind - eine Zeile im About, "wirklich mini klein" (Betreiber, 2.11.2026, nach dem
 * "Parsing Status" bei Osirion). Zahlen aus der Replay-Uebersicht (/api/replays?stand=). Ohne Replays fuer diesen Spieltag (nicht
 * gesammelt, noch nicht begonnen) steht hier nichts.
 */
export default function AuswertungsStand({ windowId }: { windowId: string }) {
  const t = useT();
  const { sprache } = useSprache();
  const [stand, setStand] = useState<{ gelesen: number; gesamt: number } | null>(null);
  useEffect(() => {
    let weg = false;
    setStand(null);
    fetch(`/api/replays?stand=${encodeURIComponent(windowId)}`)
      .then((r) => r.json())
      .then((j: { gelesen?: number; gesamt?: number }) => { if (!weg && j.gesamt) setStand({ gelesen: j.gelesen ?? 0, gesamt: j.gesamt }); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [windowId]);
  if (!stand) return null;
  const zahl = (n: number) => n.toLocaleString(sprache === 'en' ? 'en-US' : 'de-DE');
  const anteil = (stand.gelesen / stand.gesamt) * 100;
  const prozent = anteil.toLocaleString(sprache === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: anteil >= 99 && anteil < 100 ? 2 : 1 });
  return (
    <p className="pt-0.5 text-[11px] leading-snug text-slate-500 tabular-nums">
      {t('Ausgewertet')}: <span className={stand.gelesen >= stand.gesamt ? 'text-emerald-400/80' : 'text-amber-300/80'}>
        {zahl(stand.gelesen)} / {zahl(stand.gesamt)} {t('Matches')} ({prozent} %)
      </span>
    </p>
  );
}
