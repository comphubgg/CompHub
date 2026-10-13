'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import T from '@/app/components/T';

/*
 * Die Werkzeuge im Dashboard - klar getrennt nach dem, wer sie sieht.
 *
 * Der Betreiber (12.10.2026): ein Redesign, "komplett clean ... dass man sieht, was only fuer VIP ist, dass man sieht,
 * was fuer jeden ist, dass man ein bisschen uebersichtlicher sieht, was nur im Dashboard ist". Drei Gruppen, jede mit
 * einer Marke, die sagt, fuer wen sie gilt:
 *
 *   Fuer alle              - was auch ohne Konto in der Leiste steht
 *   Nur fuer VIP           - dazu die Overlays (seit 12.10.2026 nicht mehr in der Leiste, sondern hier) und die Globals
 *   Nur hier im Dashboard  - was es nirgends sonst gibt: das eigene Archiv, das Chatarchiv, das Kontaktformular
 *
 * Die Verwaltungswerkzeuge des Admins stehen weiter darunter (AdminZentrale) - das ist eine eigene Stufe.
 */

const CSS = `
@keyframes eb-rein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .eb-an { animation: none !important; } }
`;

type Ton = 'alle' | 'vip' | 'hier';

interface Ziel { href: string; titel: string; text: string; symbol: string; anker?: boolean }

/** Kleine Linien-Symbole - ein Pfad je Werkzeug, in Kachelfarbe gezeichnet. */
const SYMBOL: Record<string, ReactNode> = {
  streams: <><rect x="3" y="5" width="11" height="8" rx="1.5" /><rect x="10" y="11" width="11" height="8" rx="1.5" /></>,
  rangliste: <><path d="M5 20V10M12 20V4M19 20v-7" /></>,
  events: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  statistik: <><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></>,
  tierlist: <><path d="M4 6h10M4 12h14M4 18h8" /></>,
  karte: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  solos: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></>,
  prognose: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  overlay: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 20h8M12 17v3" /></>,
  globals: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  pov: <><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></>,
  archiv: <><path d="M4 7h16v13H4zM4 7l2-3h12l2 3" /><path d="M10 12h4" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /></>,
  kontakt: <><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></>,
  profil: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
};

const FUER_ALLE: Ziel[] = [
  { href: '/streams', titel: 'Streams', text: 'Mehrere Streams nebeneinander, in eigenen Ordnern', symbol: 'streams' },
  { href: '/power-rankings', titel: 'Rankings', text: 'Epics weltweite Bestenliste', symbol: 'rangliste' },
  { href: '/events', titel: 'Events', text: 'Cups und Leaderboards', symbol: 'events' },
  { href: '/statistics', titel: 'Statistiken', text: 'Spieler, Spieltage, Kennzahlen', symbol: 'statistik' },
  { href: '/tierlist', titel: 'Tierlist', text: 'Spieler und Trios einsortieren', symbol: 'tierlist' },
  { href: '/tournament-maps', titel: 'Maps', text: 'Wo die Teams gelandet sind — jeder Cup', symbol: 'karte' },
  { href: '/fncs', titel: 'FNCS', text: 'Alle Endspiele und die Eliminierungen der Grand Finals', symbol: 'events' },
  { href: '/replays', titel: 'Replays', text: 'Jedes Game zum Abspielen: Zone, Eliminierungen, 2D und 3D', symbol: 'karte' },
  { href: '/globals-solos', titel: 'Globals Solos', text: 'Qualifizierte, Heats und Karten der FNCS Solos', symbol: 'solos' },
  { href: '/predictions', titel: 'Prognosen', text: 'Tipp auf den Ausgang', symbol: 'prognose' },
];

/** Was es nur hier gibt. Mein Archiv und Profil stehen darunter auf der Seite selbst, das Chatarchiv braucht nur der Admin. */
const NUR_HIER: Ziel[] = [
  { href: '/replays/meine', titel: 'Meine Replays', text: 'Deine Cups und jede Runde, die du gespielt hast - zum Abspielen', symbol: 'karte' },
  { href: '/contact', titel: 'Kontakt', text: 'Etwas kaputt, fehlt oder besser zu machen? Schreib es dem Betreiber', symbol: 'kontakt' },
];
const NUR_HIER_ADMIN: Ziel[] = [
  { href: '/messages', titel: 'Chatarchiv', text: 'Alle Gespräche, auch die abgeschlossenen', symbol: 'chat' },
];

const TON: Record<Ton, { rahmen: string; kachel: string; titel: string; symbol: string; marke: string; pille: string }> = {
  alle: {
    rahmen: 'border-white/[0.08]',
    kachel: 'border-white/[0.07] hover:border-sky-500/60 hover:bg-sky-500/[0.06]',
    titel: 'group-hover:text-sky-300', symbol: 'text-sky-400 bg-sky-500/10',
    marke: 'text-sky-400', pille: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  vip: {
    rahmen: 'border-amber-500/30',
    kachel: 'border-amber-500/20 hover:border-amber-400/60 hover:bg-amber-500/[0.07]',
    titel: 'group-hover:text-amber-200', symbol: 'text-amber-300 bg-amber-500/10',
    marke: 'text-amber-300', pille: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  hier: {
    rahmen: 'border-white/[0.08]',
    kachel: 'border-white/[0.07] hover:border-slate-400/50 hover:bg-white/[0.05]',
    titel: 'group-hover:text-white', symbol: 'text-slate-300 bg-white/[0.07]',
    marke: 'text-slate-300', pille: 'border-white/20 bg-white/[0.06] text-slate-300',
  },
};

function Gruppe({ ton, titel, marke, beschreibung, ziele, start = 0, gesperrt = false }: {
  ton: Ton; titel: string; marke: string; beschreibung: string; ziele: Ziel[]; start?: number; gesperrt?: boolean;
}) {
  const f = TON[ton];
  return (
    <section className={`rounded-2xl border bg-gradient-to-br from-white/[0.04] to-transparent p-4 ${f.rahmen}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className={`text-sm font-black uppercase tracking-[0.14em] ${f.marke}`}><T>{titel}</T></h2>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${f.pille}`}><T>{marke}</T></span>
        <p className="w-full text-xs text-slate-500 sm:ml-1 sm:w-auto"><T>{beschreibung}</T></p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ziele.map((z, i) => {
          const inhalt = (
            <>
              <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${f.symbol}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {SYMBOL[z.symbol]}
                </svg>
              </span>
              <span className={`flex items-center justify-between gap-2 text-sm font-semibold text-slate-100 transition ${f.titel}`}>
                <T>{z.titel}</T>
                <span aria-hidden className="text-slate-600 transition group-hover:translate-x-0.5">→</span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500"><T>{z.text}</T></span>
            </>
          );
          const klasse = `eb-an group block rounded-xl border bg-zinc-950/50 p-3 transition ${gesperrt ? 'pointer-events-none opacity-40' : f.kachel}`;
          const stil = { animation: `eb-rein .45s ${(start + i) * 45}ms cubic-bezier(.2,.8,.2,1) both` };
          if (gesperrt) return <div key={z.href} className={klasse} style={stil} aria-disabled>{inhalt}</div>;
          return z.anker
            ? <a key={z.href} href={z.href} className={klasse} style={stil}>{inhalt}</a>
            : <Link key={z.href} href={z.href} className={klasse} style={stil}>{inhalt}</Link>;
        })}
      </div>
    </section>
  );
}

export default function Ebenen({ admin, vip, pro }: {
  admin: boolean; vip: boolean; globals?: boolean; pro: boolean;
}) {
  /*
   * Fuer jeden VIP dasselbe: die Overlays und die Globals (2026 und Solos). Der Betreiber (12.10.2026): "Grand-Sachen
   * sind eigentlich fuer jeden VIP immer sichtbar. Und Overlays auch fuer jeden VIP." Wer kein VIP ist, sieht die
   * Gruppe trotzdem - ausgegraut -, damit klar ist, was sie bringt.
   */
  const vipZiele: Ziel[] = [
    { href: '/overlays', titel: 'Overlays', text: 'Einblendungen für deinen Stream — aus denselben Turnierdaten', symbol: 'overlay' },
    { href: '/globals', titel: 'Globals 2026', text: 'Overlays, Teams, Karte und Prognose zur Global Championship', symbol: 'globals' },
    { href: '/globals-solos', titel: 'Globals Solos', text: 'Qualifizierte, Heats und Karten der FNCS Solos', symbol: 'solos' },
    ...((pro || admin) ? [{ href: '/pov', titel: 'POV', text: 'Dein Bild live an die freigegebenen Zuschauer senden', symbol: 'pov' }] : []),
  ];
  const hier = [...NUR_HIER, ...(admin ? NUR_HIER_ADMIN : [])];
  const darfVip = vip || admin;
  return (
    <div className="space-y-3">
      <style>{CSS}</style>
      <Gruppe ton="alle" titel="Für alle" marke="Offen für jeden" ziele={FUER_ALLE}
        beschreibung="Steht auch ohne Konto in der Leiste." />
      <Gruppe ton="vip" titel="VIP" marke="Nur für VIP" ziele={vipZiele} start={FUER_ALLE.length} gesperrt={!darfVip}
        beschreibung={darfVip ? 'Sichtbar nur für dich — die Overlays und die Globals.' : 'Für VIPs freigeschaltet — die Overlays und die Globals.'} />
      <Gruppe ton="hier" titel="Nur im Dashboard" marke="Nur hier" ziele={hier} start={FUER_ALLE.length + vipZiele.length}
        beschreibung="Das gibt es nirgends sonst." />
    </div>
  );
}
