'use client';

/*
 * Kontakt - ohne Formular.
 *
 * Der Betreiber (27.10.2026): "Unter VIP haben die immer noch Kontaktfunktionen ... das machst du nicht mehr: sie koennen mich nur ueber Discord erreichen oder per E-Mail, fertig -
 * nicht ueber die Seite selbst, kein Formular." Bis dahin stand hier ein Formular mit Themen, Bildern und Chat. Die Seite bleibt unter derselben Adresse (/contact, Fusszeile,
 * Dashboard), zeigt aber nur die zwei Wege.
 */

import DiscordKnopf from '@/app/components/DiscordKnopf';
import T from '@/app/components/T';

const MAIL = 'contact@thecomphub.com';

export default function KontaktSeite() {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 px-4 py-20 text-slate-100">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-80 w-[640px] -translate-x-1/2 rounded-full bg-sky-500/[0.14] blur-[110px]" />
      <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 shadow-[0_24px_60px_rgba(15,23,42,.25)] backdrop-blur-xl sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/CompHub-Logo-frei.png" alt="" className="mx-auto mb-5 h-14 w-auto" />
        <h1 className="schrift-anzeige text-center text-3xl font-extrabold tracking-tight"><T>Kontakt</T></h1>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-slate-400">
          <T>Fragen, Ideen oder etwas funktioniert nicht? Schreib mir auf Discord oder per E-Mail - ich antworte so schnell ich kann.</T>
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Discord</p>
            <p className="mt-2 text-sm text-slate-300"><T>Der schnellste Weg - auch für Zugänge und VIP.</T></p>
            <div className="mt-4"><DiscordKnopf /></div>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>E-Mail</T></p>
            <p className="mt-2 text-sm text-slate-300"><T>Für alles, was länger wird.</T></p>
            <a href={`mailto:${MAIL}`}
              className="mt-4 inline-block rounded-full border border-sky-500/50 bg-sky-500/10 px-5 py-2.5 text-sm font-bold text-sky-300 transition hover:-translate-y-0.5 hover:bg-sky-500/20">
              {MAIL}
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <T>Du kannst mir gern auf Deutsch oder Englisch schreiben.</T>
        </p>
      </div>
    </main>
  );
}
