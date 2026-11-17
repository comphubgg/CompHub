'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import FotoQuellen from '@/app/components/FotoQuellen';

/*
 * Der allgemeine Hinweis zu den Spielerfotos (Betreiber, 16.11.2026) - in der Fusszeile und unter dem Profilkopf. Seit 17.11.2026 mit dem Link
 * "Photos from" (app/components/FotoQuellen.tsx): wer die Fotos gemacht hat, steht in dieser einen Liste statt an jedem Foto.
 */
export default function FotoHinweis({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-slate-600 ${className}`}>
      <FotoQuellen className="!text-[11px] align-baseline" />
      <span aria-hidden className="mx-1.5">·</span>
      <T>Soll ein Foto genannt oder entfernt werden?</T>{' '}
      <Link href="/contact" className="text-sky-500/80 underline-offset-2 transition hover:text-sky-400 hover:underline"><T>Schreib uns.</T></Link>
    </p>
  );
}
