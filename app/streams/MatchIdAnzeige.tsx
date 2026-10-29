'use client';

/*
 * Die laufende Match-ID des gezeigten Streamers - neben dem Kanalnamen der Einzelansicht, zum Kopieren und Zuschauen im Spiel.
 * Erscheint nur, wenn /api/streams/match-id eine liefert (Admin oder VIP mit Match-ID-Finder, Streamer mit Epic-Profil, befreundet mit dem
 * CompHub-Konto und gerade in einem Game). Alle 30 Sekunden neu gefragt.
 */

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';

export default function MatchIdAnzeige({ kanal }: { kanal: string }) {
  const t = useT();
  const [id, setId] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => {
    if (!kanal) return undefined;
    let weg = false;
    const frag = () => fetch(`/api/streams/match-id?kanal=${encodeURIComponent(kanal)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j: { matchId?: string | null }) => { if (!weg) setId(j?.matchId ?? null); }).catch(() => {});
    setId(null); frag();
    const uhr = setInterval(frag, 30_000);
    return () => { weg = true; clearInterval(uhr); };
  }, [kanal]);
  if (!id) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px]">
      <span className="font-semibold text-sky-300">{t('Match-ID')}</span>
      <code className="font-mono text-slate-200">{id}</code>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(id).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }); }}
        className="rounded border border-sky-500/40 px-1.5 font-semibold text-sky-300 transition hover:bg-sky-500/20">
        {kopiert ? t('Kopiert') : t('Kopieren')}
      </button>
    </span>
  );
}
