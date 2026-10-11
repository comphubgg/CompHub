'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PovVideo from '@/app/streams/PovVideo';
import { HudBanner } from '@/app/components/PovHud';
import type { PovHud } from '@/lib/pov';

/*
 * Ein Pro-POV als reine Bildflaeche - fuer eine Browserquelle in OBS.
 *
 * Der Streamer fuegt in OBS die Adresse mit seinem Link-Schluessel ein (aus der Streams-Seite: "Link fuer OBS
 * kopieren"). Die Seite liegt ueber der ganzen Flaeche, ohne Kopfzeile, mit Ton und - wenn der Profi es
 * eingestellt hat - seinem Namensbanner. Ist der Zuschauer nicht (mehr) freigegeben, steht dort "Not approved".
 */

function Inhalt() {
  const p = useSearchParams();
  const pro = p.get('pro') ?? '';
  const schluessel = p.get('s') ?? undefined;
  const [info, setInfo] = useState<{ name: string; bild: string | null; hud: PovHud } | null>(null);

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
      <PovVideo pro={pro} schluessel={schluessel} stumm={false} name={info?.name} />
      {info && <HudBanner hud={info.hud} name={info.name} bild={info.bild} />}
    </div>
  );
}

export default function PovAnsicht() {
  return <Suspense fallback={null}><Inhalt /></Suspense>;
}
