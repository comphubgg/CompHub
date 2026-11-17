'use client';

import Link from 'next/link';
import T from '@/app/components/T';

/*
 * Der allgemeine Hinweis zu den Spielerfotos (Betreiber, 16.11.2026) - in der Fusszeile und unter dem Profilkopf. Am einzelnen Foto steht ein Name nur,
 * wenn er bestaetigt ist (app/components/FotoCredit.tsx); dieser Satz gilt fuer alle.
 */
export default function FotoHinweis({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-slate-600 ${className}`}>
      <T>Spielerfotos © bei den jeweiligen Fotografen.</T>{' '}
      <T>Soll ein Foto genannt oder entfernt werden?</T>{' '}
      <Link href="/contact" className="text-sky-500/80 underline-offset-2 transition hover:text-sky-400 hover:underline"><T>Schreib uns.</T></Link>
    </p>
  );
}
