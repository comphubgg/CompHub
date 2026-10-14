'use client';

import T from '@/app/components/T';
import DiscordKnopf from '@/app/components/DiscordKnopf';

/*
 * Wie man VIP wird - die Auskunft, die bis zum 14.10.2026 auf der Startseite stand ("Wie man VIP wird", drei Schritte). Der Betreiber: "kannst du
 * alles auch in Dashboards packen - eine Info fuer den, der VIP werden will - aber sie passt nicht zur Webseite". Sie steht jetzt im Konto
 * (app/account), und nur dort, wo das Konto noch kein VIP hat.
 */

const SCHRITTE: Array<[string, string]> = [
  ['Reichweite', 'Du solltest auf Twitch, X oder YouTube ein Publikum haben — wie groß, entscheide ich im Einzelfall.'],
  ['Sichtbarkeit', 'Zeig CompHub bei deinen Zuschauern. Ein Overlay im Stream oder ein Beitrag reicht schon.'],
  ['Anfrage', 'Drück im Discord unter Get Access auf den Knopf und füll das kurze Formular aus, oder schreib mir auf X. Ich antworte selbst, angenommen oder abgelehnt, immer mit Grund.'],
];

export default function VipInfo({ className = '' }: { className?: string }) {
  return (
    <section id="vip-zugang" className={`rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_10px_30px_rgba(15,23,42,.08)] ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>VIP-Zugang</T></p>
      <h2 className="schrift-anzeige mt-1 text-2xl font-extrabold tracking-tight text-slate-100"><T>Wie man VIP wird</T></h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        <T>Der VIP-Zugang schaltet die Overlays frei, eigene Ordner auf der Streamseite, die Filter im Turnierkalender und den Vergleich in den Statistiken. Er wird vergeben, nicht gekauft.</T>
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {SCHRITTE.map(([titel, text], i) => (
          <div key={titel} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-[11px] font-bold tabular-nums text-sky-500">{i + 1}</p>
            <h3 className="mt-1.5 text-sm font-bold text-slate-100"><T>{titel}</T></h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500"><T>{text}</T></p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <DiscordKnopf art="rund" text="Zugang im Discord anfragen" />
        <a href="https://x.com/CompHub_gg" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.3 22H2l7.5-8.6L1.7 2h7.2l4.5 6.6L18.9 2z" />
          </svg>
          <T>Zugang anfragen</T>
        </a>
      </div>
    </section>
  );
}
