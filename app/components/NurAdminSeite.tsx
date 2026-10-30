'use client';

import Link from 'next/link';
import T from '@/app/components/T';

/*
 * Was Besucher auf reinen Admin-Seiten sehen (Posts, alte Maps) - im Stil der anderen Sperrseiten (app/components/SperrSeite) statt eines nackten
 * "Nur fuer den Admin." auf Schwarz (Durchsicht 30.10.2026; gesperrte-seiten-lebendig).
 */
export default function NurAdminSeite() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-zinc-950 px-6 py-20">
      <div className="w-full max-w-xl text-center">
        <div className="relative mx-auto mb-10 grid h-40 w-40 place-items-center">
          <span aria-hidden className="sperre-schein absolute inset-0 rounded-full bg-sky-500/30 blur-2xl" />
          <span aria-hidden className="sperre-ring absolute inset-2 rounded-full border border-dashed border-sky-500/25" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo.png" alt="CompHub" className="sperre-logo relative h-24 w-24 rounded-2xl object-contain" />
        </div>
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
          <span aria-hidden className="h-2 w-2 rounded-full bg-sky-400" />
          <T>Admin</T>
        </p>
        <h1 className="text-3xl font-bold leading-tight text-slate-100 sm:text-4xl"><T>Dieser Bereich ist nur für den Admin.</T></h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-400"><T>Hier entstehen Posts und Karten, bevor sie auf der Seite erscheinen.</T></p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"><T>zur Startseite</T></Link>
          <Link href="/tournament-maps" className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400"><T>Maps</T></Link>
        </div>
      </div>
    </main>
  );
}
