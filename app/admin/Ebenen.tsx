'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import T from '@/app/components/T';

/*
 * Die Werkzeuge im Dashboard - nach dem, wer sie sieht, und jede Stufe in ihrer eigenen Form.
 *
 * Der Betreiber (12.10.2026): "dass man sieht, was only fuer VIP ist, dass man sieht, was fuer jeden ist, dass man ein bisschen uebersichtlicher sieht, was nur
 * im Dashboard ist". Und am 20.10.2026 zur VIP-Seite: "du passt immer nur optisch an, aber die Kaestchen, wo die sind, nicht geaendert - wenn ich sage, passt mir
 * das an, dann so, dass es komplett anders aussieht." Vorher waren es drei gleiche Kachelfelder untereinander, die VIP-Werkzeuge in der Mitte. Jetzt:
 *
 *   VIP                    - ganz oben, als grosse Karten: das ist das, wofuer ein VIP hier ist (Overlays, Globals, POV)
 *   Nur im Dashboard       - als Zeilen mit Beschreibung, drei nebeneinander
 *   Fuer alle              - als schmale Marken in einer Reihe; sie stehen ohnehin in der Leiste und brauchen keine Kacheln
 *
 * Die Verwaltungswerkzeuge des Admins stehen weiter darunter (AdminZentrale) - das ist eine eigene Stufe. Die Abschnitte tragen weiter data-dash,
 * damit sich jede Stufe in den Einstellungen ausblenden laesst.
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
  schloss: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
};

const Zeichen = ({ name, groesse = 18 }: { name: string; groesse?: number }) => (
  <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {SYMBOL[name]}
  </svg>
);

const FUER_ALLE: Ziel[] = [
  { href: '/streams', titel: 'Streams', text: 'Mehrere Streams nebeneinander, in eigenen Ordnern', symbol: 'streams' },
  { href: '/power-rankings', titel: 'Rankings', text: 'Epics weltweite Bestenliste', symbol: 'rangliste' },
  { href: '/events', titel: 'Events', text: 'Cups und Leaderboards', symbol: 'events' },
  { href: '/statistics', titel: 'Statistiken', text: 'Spieler, Spieltage, Kennzahlen', symbol: 'statistik' },
  { href: '/tierlist', titel: 'Tierlist', text: 'Spieler und Trios einsortieren', symbol: 'tierlist' },
  { href: '/tournament-maps', titel: 'Maps', text: 'Wo die Teams gelandet sind — jeder Cup', symbol: 'karte' },
  { href: '/fncs', titel: 'FNCS', text: 'Alle Endspiele und die Eliminierungen der Grand Finals', symbol: 'events' },
  { href: '/predictions', titel: 'Prognosen', text: 'Tipp auf den Ausgang', symbol: 'prognose' },
];

/** Was es nur hier gibt. Mein Archiv und Profil stehen darunter auf der Seite selbst, das Chatarchiv braucht nur der Admin. */
const NUR_HIER: Ziel[] = [
  // FNCS Solos (Betreiber, 19.10.2026): fuer jeden offen, aber nur hier im Dashboard - nicht in der Leiste.
  { href: '/globals-solos', titel: 'FNCS Solos', text: 'Alle Regionen: Qualifizierte, Heats, Last Chance, Finale und die Karte jedes Spieltags', symbol: 'solos' },
  // Replays gibt es nur hier (nicht in der Leiste): alle Games zum Abspielen, dort umschaltbar auf "Meine Replays".
  { href: '/replays', titel: 'Replays', text: 'Jedes Game zum Abspielen - alle Cups oder nur deine eigenen', symbol: 'karte' },
  { href: '/contact', titel: 'Kontakt', text: 'Etwas kaputt, fehlt oder besser zu machen? Schreib es dem Betreiber', symbol: 'kontakt' },
];
const NUR_HIER_ADMIN: Ziel[] = [];

/** Der Kopf eines Abschnitts: Name, Marke und eine Linie, die bis zum Rand reicht. */
function Kopf({ ton, titel, marke, text }: { ton: Ton; titel: string; marke: string; text: string }) {
  const farbe = ton === 'vip' ? 'text-amber-300' : ton === 'hier' ? 'text-slate-200' : 'text-sky-300';
  const pille = ton === 'vip' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    : ton === 'hier' ? 'border-white/20 bg-white/[0.06] text-slate-300' : 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className={`text-sm font-extrabold uppercase tracking-[0.18em] ${farbe}`}><T>{titel}</T></h2>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pille}`}><T>{marke}</T></span>
      <span aria-hidden className="hidden h-px min-w-[2rem] flex-1 bg-white/[0.08] sm:block" />
      <p className="w-full text-xs text-slate-500 sm:w-auto"><T>{text}</T></p>
    </div>
  );
}

/** Eine grosse VIP-Karte: Symbol, Name, ein Satz und der Weg hinein. Fuer Konten ohne VIP ausgegraut mit Schloss. */
function VipKarte({ z, i, gesperrt }: { z: Ziel; i: number; gesperrt: boolean }) {
  const inhalt = (
    <>
      <span aria-hidden className={`pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-amber-400/10 blur-2xl transition ${gesperrt ? '' : 'group-hover:bg-amber-400/20'}`} />
      <span className="relative flex items-start justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-zinc-950"><Zeichen name={z.symbol} groesse={22} /></span>
        {gesperrt && <span className="text-slate-500"><Zeichen name="schloss" groesse={18} /></span>}
      </span>
      <h3 className="relative mt-5 text-xl font-black tracking-tight text-slate-50"><T>{z.titel}</T></h3>
      <p className="relative mt-1 max-w-[34ch] text-sm leading-snug text-slate-400"><T>{z.text}</T></p>
      <span className="relative mt-auto pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300">
        {gesperrt ? <T>Nur für VIP</T> : <><T>Öffnen</T> →</>}
      </span>
    </>
  );
  const klasse = `eb-an group relative flex min-h-[184px] flex-col overflow-hidden rounded-3xl border bg-zinc-900 p-5 transition ${gesperrt
    ? 'pointer-events-none border-white/[0.08] opacity-50' : 'border-amber-500/30 hover:-translate-y-0.5 hover:border-amber-400/70'}`;
  const stil = { animation: `eb-rein .45s ${i * 60}ms cubic-bezier(.2,.8,.2,1) both` };
  if (gesperrt) return <div className={klasse} style={stil} aria-disabled>{inhalt}</div>;
  return <Link href={z.href} className={klasse} style={stil}>{inhalt}</Link>;
}

/** Eine Zeile fuer "nur hier": Symbol links, Name und Beschreibung, Pfeil. */
function HierZeile({ z, i }: { z: Ziel; i: number }) {
  const klasse = 'eb-an group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-zinc-900 px-4 py-3.5 transition hover:border-sky-500/60 hover:bg-zinc-800';
  const stil = { animation: `eb-rein .45s ${i * 60}ms cubic-bezier(.2,.8,.2,1) both` };
  const inhalt = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-slate-200 transition group-hover:bg-sky-500/15 group-hover:text-sky-300"><Zeichen name={z.symbol} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-100"><T>{z.titel}</T></span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-400"><T>{z.text}</T></span>
      </span>
      <span aria-hidden className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-sky-300">→</span>
    </>
  );
  return z.anker
    ? <a href={z.href} className={klasse} style={stil}>{inhalt}</a>
    : <Link href={z.href} className={klasse} style={stil}>{inhalt}</Link>;
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
    ...((pro || admin) ? [{ href: '/pov', titel: 'POV', text: 'Dein Bild live an die freigegebenen Zuschauer senden', symbol: 'pov' }] : []),
  ];
  const hier = [...NUR_HIER, ...(admin ? NUR_HIER_ADMIN : [])];
  const darfVip = vip || admin;
  return (
    <div className="space-y-9">
      <style>{CSS}</style>

      <section data-dash="vip">
        <Kopf ton="vip" titel="VIP" marke="Nur für VIP"
          text={darfVip ? 'Sichtbar nur für dich — die Overlays und die Globals.' : 'Für VIPs freigeschaltet — die Overlays und die Globals.'} />
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vipZiele.map((z, i) => <VipKarte key={z.href} z={z} i={i} gesperrt={!darfVip} />)}
        </div>
      </section>

      <section data-dash="hier">
        <Kopf ton="hier" titel="Nur im Dashboard" marke="Nur hier" text="Das gibt es nirgends sonst." />
        <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
          {hier.map((z, i) => <HierZeile key={z.href} z={z} i={i + vipZiele.length} />)}
        </div>
      </section>

      <section data-dash="alle">
        <Kopf ton="alle" titel="Für alle" marke="Offen für jeden" text="Steht auch ohne Konto in der Leiste." />
        <div className="mt-4 flex flex-wrap gap-2">
          {FUER_ALLE.map((z, i) => (
            <Link key={z.href + z.titel} href={z.href} title={z.text}
              className="eb-an group inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-zinc-900 py-2 pl-3 pr-4 text-sm font-semibold text-slate-200 transition hover:border-sky-500/60 hover:bg-zinc-800 hover:text-sky-300"
              style={{ animation: `eb-rein .45s ${(i + vipZiele.length + hier.length) * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
              <span className="text-sky-400"><Zeichen name={z.symbol} groesse={16} /></span>
              <T>{z.titel}</T>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
