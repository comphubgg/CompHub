import Link from './Link';
import T from './T';
import { MARKE } from './ort';
import { useWer } from '../../../teile/Anmeldung';

/*
 * Was sieht, wer ohne VIP auf die Overlays kommt.
 *
 * Vorher stand dort ein einzelner grauer Satz auf Schwarz. Der Betreiber:
 * "das sieht ein bisschen einfach und tot aus ... so mit Animationen, so wie
 * bei Scrims ... mit Farbe im Hintergrund, mit unserem Logo, mit 'Wanna get
 * access?', join our Discord oder DM uns auf Twitter."
 *
 * Also wie der Vorhang der Scrims-Seite: Punkteraster mit einem Schimmer im
 * Blau der Startseite, das Logo mit atmendem Schein - und dahinter ziehen
 * drei schemenhafte Overlays vorbei (Rangliste, Teamkarte, Cup-Timer), damit
 * man ahnt, was hinter der Tuer liegt. Wer Bewegung abgeschaltet hat, sieht
 * sie still.
 */

const HINTERGRUND = {
  backgroundImage:
    'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),'
    + 'radial-gradient(55% 45% at 50% 0%, rgba(14,165,233,0.22), transparent 70%),'
    + 'radial-gradient(40% 35% at 85% 90%, rgba(14,165,233,0.10), transparent 70%)',
  backgroundSize: '22px 22px, 100% 100%, 100% 100%',
} as const;

/** Ein schemenhaftes Overlay - nur Form, kein Inhalt. */
function Schemen({ art, klasse, verzug }: {
  art: 'rangliste' | 'teamkarte' | 'timer'; klasse: string; verzug: string;
}) {
  return (
    <div aria-hidden
      className={`vorhang-schweben pointer-events-none absolute hidden rounded-2xl border
                  border-akz/20 bg-violet-950/30 p-3 shadow-[0_0_40px_rgba(14,165,233,0.12)]
                  backdrop-blur-[2px] md:block ${klasse}`}
      style={{ animationDelay: verzug }}>
      {art === 'rangliste' && (
        <div className="space-y-1.5">
          <div className="mb-2 h-2 w-20 rounded bg-akz/40" />
          {[88, 76, 70, 61, 55].map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-3 rounded bg-akz/30" />
              <span className="h-2 rounded bg-white/15" style={{ width: `${b}%` }} />
            </div>
          ))}
        </div>
      )}
      {art === 'teamkarte' && (
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 rounded-xl bg-akz/25" />
          <span className="h-12 w-12 rounded-xl bg-akz/15" />
          <span className="space-y-2">
            <span className="block h-2 w-24 rounded bg-white/20" />
            <span className="block h-2 w-16 rounded bg-akz/30" />
          </span>
        </div>
      )}
      {art === 'timer' && (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-akz/60" />
          <span className="font-mono text-xl font-bold tracking-widest text-akz/40">12:47</span>
        </div>
      )}
    </div>
  );
}

/**
 * Ohne Angaben: der Vorhang vor den Overlays (kein VIP). Mit titel/text: ein VIP-Werkzeug, das fuer dieses Konto noch nicht freigeschaltet ist
 * (lib/rechte VIP_BEREICHE) - dann ohne "Schon VIP? Anmelden".
 */
export default function VipVorhang({ titel, text }: { titel?: string; text?: string } = {}) {
  // Im Hub kommt man mit dem VIP-Zugangsschluessel hinein - der Weg steht hier neben Discord/X (wie auf dem Streamer-Tor)
  const { oeffnen } = useWer();
  return (
    <div className="relative flex overflow-hidden text-white/85"
      style={HINTERGRUND}>
      <style>{`
        @keyframes vorhang-schweben {
          0%, 100% { transform: translateY(0) rotate(var(--dreh, 0deg)); }
          50% { transform: translateY(-14px) rotate(var(--dreh, 0deg)); }
        }
        .vorhang-schweben { animation: vorhang-schweben 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .vorhang-schweben { animation: none; } }
      `}</style>

      <Schemen art="rangliste" verzug="0s"
        klasse="left-[6%] top-[18%] w-56 [--dreh:-4deg]" />
      <Schemen art="teamkarte" verzug="-2.5s"
        klasse="right-[7%] top-[24%] [--dreh:3deg]" />
      <Schemen art="timer" verzug="-4.5s"
        klasse="bottom-[16%] left-[14%] [--dreh:2deg]" />

      <div className="relative mx-auto flex min-h-[78vh] max-w-2xl flex-col items-center
                      justify-center px-4 py-20 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-akz/25 blur-3xl
                          motion-reduce:animate-none" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARKE.logoFrei} alt="CompHub" className="h-24 w-auto sm:h-28" />
        </div>

        <p className="mt-8 rounded-full border border-akz/30 bg-akz/10 px-3 py-1 text-[11px]
                      font-bold uppercase tracking-[0.25em] text-akz">
          VIP
        </p>
        <h1 className="mt-4 text-balance text-3xl font-black tracking-tight text-white sm:text-5xl">
          <T>{titel ?? 'Die Overlays sind Teil des VIP-Zugangs.'}</T>
        </h1>
        <p className="mt-4 max-w-xl text-sm text-white/55 sm:text-base">
          <T>{text ?? 'Ranglisten, Teamkarten, Cup-Timer und mehr — live in deinem Stream.'}</T>
        </p>

        <div className="mt-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/50 p-5
                        backdrop-blur-sm">
          <p className="text-lg font-bold text-white"><T>Zugang gewünscht?</T></p>
          <p className="mt-1 text-sm text-white/55">
            <T>Tritt unserem Discord bei oder schreib uns auf X.</T>
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a href={MARKE.discord} target="_blank" rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-akz px-4
                         py-2.5 text-sm font-semibold text-[#04050a] transition hover:brightness-110">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18.3 18.3 0 0 1 4.5 1.6 16.5 16.5 0 0 0-15.4 0A18.3 18.3 0 0 1 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 .1 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.9 12.9 0 0 1-2 1L17.7 21a19.9 19.9 0 0 0 6-3c.3-5.2-.6-9.7-3.4-13.6ZM8.4 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
              </svg>
              <T>Join our Discord</T>
            </a>
            <a href={`https://x.com/${MARKE.x}`} target="_blank" rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15
                         bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition
                         hover:border-akz hover:text-akz">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z" />
              </svg>
              <T>Auf X schreiben</T>
            </a>
          </div>
        </div>

        <button type="button" onClick={() => oeffnen('schluessel')}
          className="mt-6 rounded-full bg-akz px-6 py-2.5 text-sm font-bold text-[#06080f] transition hover:-translate-y-0.5 hover:brightness-110">
          Have a VIP access key?
        </button>
        {!titel && (
          <Link href="/sign-in"
            className="mt-4 text-xs font-semibold text-white/45 transition hover:text-akz">
            <T>Schon VIP? Anmelden</T> →
          </Link>
        )}
      </div>
    </div>
  );
}
