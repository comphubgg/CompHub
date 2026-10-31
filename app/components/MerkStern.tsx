'use client';

import { useLieblinge } from '@/app/lib/lieblinge';
import { useT } from '@/app/components/SprachProvider';

/** Der Stern im Spielerprofil: Spieler zu "Deine Spieler" hinzufuegen oder wieder entfernen. */
export default function MerkStern({ epicId, name, bild }: { epicId: string; name: string; bild: string | null }) {
  const { istLiebling, umschalten } = useLieblinge();
  const t = useT();
  const an = istLiebling(epicId);
  const titel = an ? t('Aus „Deine Spieler“ entfernen') : t('Zu „Deine Spieler“ hinzufügen');
  return (
    <button type="button" title={titel} aria-label={titel} aria-pressed={an}
      onClick={() => umschalten({ epicId, name, bild })}
      className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${
        an ? 'border-sky-500 bg-sky-500/15 text-sky-500' : 'border-zinc-700 bg-zinc-950/60 text-slate-400 hover:border-sky-500/60 hover:text-sky-500'}`}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill={an ? 'currentColor' : 'none'} stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.7.9 5.2L10 14.4l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" />
      </svg>
    </button>
  );
}
