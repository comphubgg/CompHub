import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { awardsSichtbar } from '@/lib/awardsZugang';
import { OEFFENTLICH } from '@/lib/awards';

/*
 * Der Rahmen um /awards und /awards/<kategorie> (lib/awards). Solange die Awards nicht oeffentlich sind, nur fuer den Admin: die Middleware antwortet
 * allen anderen schon mit 404, und hier wird auf dem Server noch einmal geprueft - es erreicht also nichts davon den Browser. Nie indexieren.
 *
 * Stil wie das freigegebene LCQ-Banner: dunkles Navy, blauer Schein, Anton fuer Ueberschriften.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'CompHub Awards 2026',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const STIL = `
@font-face{font-family:AwardsAnton;src:url(/fonts/anton-latin.woff2) format('woff2');font-display:swap}
.aw-seite{background:linear-gradient(135deg,#04070d 0%,#0a1324 60%,#06101f 100%);color:#fff;position:relative;overflow:hidden;min-height:100vh}
.aw-schein{position:absolute;border-radius:50%;pointer-events:none}
.aw-schein.a{left:-260px;top:-300px;width:900px;height:900px;background:radial-gradient(circle,rgba(14,165,233,.26),rgba(14,165,233,0) 70%)}
.aw-schein.b{right:-320px;top:40%;width:900px;height:900px;background:radial-gradient(circle,rgba(56,189,248,.12),rgba(56,189,248,0) 70%)}
.aw-seite .aw-anton{font-family:AwardsAnton,Impact,'Arial Narrow',sans-serif;letter-spacing:.02em;font-weight:400}
.aw-kicker{color:#38bdf8;font-weight:800;letter-spacing:.28em;text-transform:uppercase}
.aw-box{background:rgba(15,23,42,.6);border:1px solid rgba(56,189,248,.25);border-radius:18px}
.aw-box-link{transition:border-color .15s,box-shadow .15s,transform .15s}
.aw-box-link:hover{border-color:rgba(56,189,248,.7);box-shadow:0 0 34px rgba(14,165,233,.22);transform:translateY(-2px)}
.aw-gold{color:#fcd34d}
`;

export default async function AwardsRahmen({ children }: { children: ReactNode }) {
  if (!(await awardsSichtbar())) notFound();
  return (
    <div className="aw-seite">
      <style>{STIL}</style>
      <span aria-hidden className="aw-schein a" />
      <span aria-hidden className="aw-schein b" />
      {!OEFFENTLICH && (
        <div className="relative z-10 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Admin preview · not public · edit in <a href="/admin/awards" className="underline hover:text-amber-200">/admin/awards</a>
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
