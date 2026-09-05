'use client';

import Link from 'next/link';
import T from '@/app/components/T';

/*
 * Die Fusszeile - unter der Startseite und unter dem Dashboard.
 *
 * Sie stand urspruenglich mitten in app/page.tsx. Der Betreiber wollte sie
 * auch unter dem Dashboard haben: "das, was Home ganz unten ist, soll auch
 * unter Dashboard ganz unten sein." Sie ein zweites Mal hinzuschreiben haette
 * bedeutet, sie ab sofort zweimal zu pflegen - und eine Mailadresse, die nur
 * an einer der beiden Stellen berichtigt wird, ist schlimmer als gar keine.
 *
 * Vorher stand unter der Startseite ein einzelner X-Verweis und ein Halbsatz.
 * Fuer eine Seite, die Moderatoren und Profispielern gezeigt wird, ist das zu
 * wenig: wer wissen will, wem das Werkzeug gehoert und wie man den Betreiber
 * erreicht, soll nicht suchen muessen.
 *
 * Drei Spalten, weil es drei Fragen sind: was ist das hier, was gibt es
 * darin, und wie erreicht man jemanden. Der Hinweis auf Epic steht unten und
 * nicht klein am Rand - er ist keine Fussnote, sondern eine Klarstellung.
 */
export default function Fusszeile() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950/60 px-4 py-14">
      <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-3">

        {/* ------------------------------------------------ Wer das ist */}
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/CompHub-Logo-frei.png" alt=""
              className="h-7 w-auto opacity-90" />
            <span className="text-sm font-black tracking-tight">
              <span className="text-sky-500">COMP</span>
              <span className="text-slate-100">HUB</span>
            </span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
            <T>Statistiken, Turniere und Streams der kompetitiven
            Fortnite-Szene — an einem Ort, aus einem Archiv.</T>
          </p>
        </div>

        {/* --------------------------------------------------- Bereiche */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]
                         text-slate-600">
            <T>Bereiche</T>
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-1">
            {([
              ['/statistiken', 'Statistiken'],
              ['/events', 'Events'],
              ['/power-rankings', 'Power Rankings'],
              ['/tierlist', 'Tierlist'],
              ['/streams', 'Streams'],
              ['/overlays', 'Overlays'],
            ] as Array<[string, string]>).map(([pfad, titel]) => (
              <li key={pfad}>
                <Link href={pfad}
                  className="text-slate-500 transition hover:text-sky-400">
                  <T>{titel}</T>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* -------------------------------------------- Kontakt, Socials */}
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]
                         text-slate-600">
            <T>Kontakt</T>
          </h3>

          <div className="mt-3 flex gap-2">
            <a href="https://x.com/CompHub_gg" target="_blank" rel="noreferrer"
              aria-label="X"
              className="grid h-9 w-9 place-items-center rounded-lg border
                         border-zinc-800 text-slate-400 transition
                         hover:border-sky-500 hover:text-sky-400">
              {/* Die Zeichen als Pfad statt als Schrift - eine Ikonenschrift
                  fuer zwei Zeichen waere ein halbes Megabyte fuer nichts. */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.3 22H2l7.5-8.6L1.7 2h7.2
                         l4.5 6.6L18.9 2zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20z" />
              </svg>
            </a>
            <a href="https://www.tiktok.com/@comphub.gg" target="_blank" rel="noreferrer"
              aria-label="TikTok"
              className="grid h-9 w-9 place-items-center rounded-lg border
                         border-zinc-800 text-slate-400 transition
                         hover:border-sky-500 hover:text-sky-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.6 5.8a4.9 4.9 0 0 1-1.2-3.2h-3.3v13a2.8 2.8 0 1 1-2-2.7V9.5a6.1
                         6.1 0 1 0 5.3 6V9.1a8.2 8.2 0 0 0 4.7 1.5V7.3a4.8 4.8 0 0 1-3.5-1.5z" />
              </svg>
            </a>
          </div>

          <ul className="mt-4 space-y-1.5 text-xs">
            <li>
              <a href="mailto:contact@thecomphub.com"
                className="text-slate-500 transition hover:text-sky-400">
                contact@thecomphub.com
              </a>
            </li>
            <li>
              <a href="mailto:comphubgg@gmail.com"
                className="text-slate-500 transition hover:text-sky-400">
                comphubgg@gmail.com
              </a>
            </li>
            <li className="pt-1">
              <Link href="/kontakt"
                className="text-sky-500 transition hover:text-sky-400">
                <T>Formular im Werkzeug →</T>
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------- Die Fusszeile */}
      <div className="mx-auto mt-12 flex max-w-5xl flex-col items-center gap-2
                      border-t border-zinc-900 pt-6 text-center sm:flex-row
                      sm:justify-between sm:text-left">
        <p className="text-[11px] text-slate-700">
          © {new Date().getFullYear()} CompHub
        </p>
        <p className="text-[11px] text-slate-700">
          <T>Nicht mit Epic Games verbunden. Alle Marken gehören ihren
          Inhabern.</T>
        </p>
      </div>
    </footer>
  );
}
