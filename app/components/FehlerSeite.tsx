'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import { FEHLER } from '@/app/lib/fehler';
import { MARKE } from '@/lib/marke';
import HeroHintergrund from '@/app/components/HeroHintergrund';

/*
 * Die eine Fehlerseite fuer alle Codes (Betreiber, 14.10.2026): das Logo, der Code gross, was passiert ist, eine Entschuldigung, die Wege
 * zurueck und die Einladung in den Discord. Texte stehen in app/lib/fehler. Mit "wiederholen" (nur bei Laufzeitfehlern) kommt ein Knopf
 * "Noch einmal versuchen" dazu.
 */

export default function FehlerSeite({ code, wiederholen }: { code: number; wiederholen?: () => void }) {
  const art = FEHLER[code] ?? FEHLER[500];
  return (
    <main className="relative isolate flex min-h-[calc(100vh-4.5rem)] items-center justify-center overflow-hidden px-4 py-16">
      {/* Derselbe Hintergrund wie die Anmeldeseite (Betreiber, 19.10.2026: "die 404-Seite soll so aussehen wie das Anmelden"). */}
      <HeroHintergrund />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-80 w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/[0.14] blur-[110px]" />
      <div className="relative w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900/80 px-6 py-10 text-center shadow-[0_24px_60px_rgba(15,23,42,.28)] backdrop-blur-xl sm:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARKE.logo} alt="CompHub" className="mx-auto h-16 w-16 rounded-2xl object-cover shadow-lg" />
        <p className="schrift-anzeige mt-6 bg-gradient-to-b from-sky-400 to-sky-600 bg-clip-text text-[7.5rem] font-extrabold leading-none tracking-tight text-transparent sm:text-[10rem]">
          {code}
        </p>
        <h1 className="schrift-anzeige mt-2 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl"><T>{art.titel}</T></h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-400"><T>{art.text}</T></p>
        <p className="mt-3 text-sm font-semibold text-slate-300"><T>Entschuldige — das hätte nicht passieren sollen.</T></p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {wiederholen && (
            <button type="button" onClick={wiederholen}
              className="rounded-full bg-sky-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-400">
              <T>Noch einmal versuchen</T>
            </button>
          )}
          <Link href="/" prefetch={false}
            className={`rounded-full px-6 py-2.5 text-sm font-bold shadow-sm transition ${wiederholen
              ? 'border border-zinc-700 bg-zinc-900 text-slate-200 hover:border-sky-500/70 hover:text-sky-500' : 'bg-sky-500 text-white hover:bg-sky-400'}`}>
            <T>Zur Startseite</T>
          </Link>
          <button type="button" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-6 py-2.5 text-sm font-bold text-slate-200 transition hover:border-sky-500/70 hover:text-sky-500">
            ← <T>Zurück</T>
          </button>
          <a href={MARKE.discord} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/50 bg-indigo-500/10 px-6 py-2.5 text-sm font-bold text-indigo-500 transition hover:bg-indigo-500/20">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.2 13.6.2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /></svg>
            <T>Dem Discord beitreten</T>
          </a>
        </div>

        <p className="mx-auto mt-10 max-w-md text-xs text-slate-500">
          <T>Wenn dich ein Link auf CompHub hierher geführt hat, sag uns im Discord Bescheid, dann reparieren wir ihn.</T>
        </p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs font-semibold text-slate-400">
          <Link href="/statistics" prefetch={false} className="transition hover:text-sky-500"><T>Statistiken</T></Link>
          <Link href="/power-rankings" prefetch={false} className="transition hover:text-sky-500"><T>Ranglisten</T></Link>
          <Link href="/events" prefetch={false} className="transition hover:text-sky-500">Events</Link>
          <Link href="/tournament-maps" prefetch={false} className="transition hover:text-sky-500">Maps</Link>
        </p>
        <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-slate-600"><T>Fehlercode</T> {code}</p>
      </div>
    </main>
  );
}
