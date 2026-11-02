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
  const [stand, setStand] = useState<{ gelesen: number; gesamt: number; ohneReplay: number } | null>(null);
  useEffect(() => {
    let weg = false;
    setStand(null);
    fetch(`/api/replays?stand=${encodeURIComponent(windowId)}`)
      .then((r) => r.json())
      .then((j: { gelesen?: number; gesamt?: number; ohneReplay?: number }) => {
        if (!weg && j.gesamt) setStand({ gelesen: j.gelesen ?? 0, gesamt: j.gesamt, ohneReplay: j.ohneReplay ?? 0 });
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [windowId]);
  if (!stand) return null;
  // Matches, zu denen Epic gar kein Replay herausgibt, kann niemand auswerten - sie stehen extra dahinter, nicht als Rueckstand.
  const lesbar = Math.max(stand.gesamt - stand.ohneReplay, stand.gelesen);
  if (!lesbar) return null;
  const ort = sprache === 'en' ? 'en-US' : 'de-DE';
  const zahl = (n: number) => n.toLocaleString(ort);
  const anteil = (stand.gelesen / lesbar) * 100;
  const prozent = anteil.toLocaleString(ort, { maximumFractionDigits: anteil >= 99 && anteil < 100 ? 2 : 1 });
  return (
    <p className="pt-0.5 text-[11px] leading-snug text-slate-500 tabular-nums">
      {t('Ausgewertet')}: <span className={stand.gelesen >= lesbar ? 'text-emerald-400/80' : 'text-amber-300/80'}>
        {zahl(stand.gelesen)} / {zahl(lesbar)} {t('Matches')} ({prozent} %)
      </span>
      {stand.ohneReplay > 0 && <> · {zahl(stand.ohneReplay)} {t('ohne Replay bei Epic')}</>}
    </p>
  );
}
