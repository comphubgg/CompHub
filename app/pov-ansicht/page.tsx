'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PovVideo from '@/app/streams/PovVideo';
import type { HudGroesse } from '@/app/components/PovHud';
import type { BannerEinst, StatsEinst } from '@/app/streams/PovVideo';

/*
 * Ein Pro-POV als reine Bildflaeche - fuer eine Browserquelle in OBS.
 *
 * Der Streamer fuegt in OBS die Adresse mit seinem Link-Schluessel ein (aus der Streams-Seite: "Link fuer OBS
 * kopieren"). Die Seite liegt ueber der ganzen Flaeche, ohne Kopfzeile, mit Ton und - wenn der Profi es
 * eingestellt hat - seinem Namensbanner. Ist der Zuschauer nicht (mehr) freigegeben, steht dort "Not approved".
 *
 * Das Banner richtet sich nach den Einstellungen des Zuschauers auf der Streams-Seite; sie stehen im Link
 * (&hud=oben|unten|links|rechts|aus, &bild=1|0 und &gr=klein|mittel|gross), der dort kopiert wird. Mit &st=oben|mitte|links|
 * rechts|unten (dazu &stbild=1|0 und &stgr=klein|mittel|gross) kommt die Statistik des Profis dazu, sofern er ein
 * verbundenes Epic-Konto hat.
 */

function Inhalt() {
  const p = useSearchParams();
  const pro = p.get('pro') ?? '';
  const schluessel = p.get('s') ?? undefined;
  const hudWahl = p.get('hud') ?? 'unten';
  const groesseWahl = p.get('gr') ?? 'mittel';
  const hud: BannerEinst = {
    an: hudWahl !== 'aus',
    ort: (['oben', 'unten', 'links', 'rechts'] as const).find((o) => o === hudWahl) ?? 'unten',
    mitBild: p.get('bild') !== '0',
    groesse: (['klein', 'mittel', 'gross'] as const).find((o) => o === groesseWahl) as HudGroesse | undefined ?? 'mittel',
  };
  const stWahl = p.get('st') ?? '';
  const stGroesse = p.get('stgr') ?? 'mittel';
  const statsEinst: StatsEinst = {
    an: ['oben', 'mitte', 'links', 'rechts', 'unten'].includes(stWahl),
    ort: (['oben', 'mitte', 'links', 'rechts', 'unten'] as const).find((o) => o === stWahl) ?? 'oben',
    mitBild: p.get('stbild') !== '0',
    groesse: (['klein', 'mittel', 'gross'] as const).find((o) => o === stGroesse) as HudGroesse | undefined ?? 'mittel',
  };
  const [info, setInfo] = useState<{ name: string; bild: string | null; stats?: boolean } | null>(null);

  useEffect(() => {
    if (!pro) return undefined;
    let weg = false;
    const holen = () => {
      fetch(`/api/pov/segment?aktion=info&pro=${encodeURIComponent(pro)}${schluessel ? `&s=${encodeURIComponent(schluessel)}` : ''}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (!weg && j?.ok && j.info) setInfo(j.info); })
        .catch(() => undefined);
    };
    holen();
    const t = window.setInterval(holen, 60_000);
    return () => { weg = true; window.clearInterval(t); };
  }, [pro, schluessel]);

  if (!pro) return null;
  return (
    <div className="group fixed inset-0 z-[1000] bg-black">
      <PovVideo pro={pro} schluessel={schluessel} stumm={false} name={info?.name}
        banner={info ? { einst: hud, name: info.name, bild: info.bild } : undefined}
        stats={info?.stats ? { einst: statsEinst, name: info.name, bild: info.bild } : undefined} />
    </div>
  );
}

export default function PovAnsicht() {
  return <Suspense fallback={null}><Inhalt /></Suspense>;
}
