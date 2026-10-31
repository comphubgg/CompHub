'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import SpielerPlatzhalter, { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import Rollzahl from '@/app/components/Rollzahl';
import { fokusVon } from '@/lib/fotoFokus';
import { ortJetzt } from '@/app/lib/ort';

/*
 * Die Schaukaesten der Startseite.
 *
 * Neu angeordnet (Betreiber, 14.10.2026: "Statistics und More sehen eins zu eins aus wie beim Vorbild, das kann man nicht so kopieren - ich
 * will sie auf jeden Fall auch, aber anders"): oben die Maps gross neben einem Spieler im Rampenlicht (Foto, wechselt von allein), darunter
 * die Statistik als Reihe aus Turnier, Rangliste und Regionen, zuletzt Tierlist und Globals Solos nebeneinander. Die Karten selbst und ihre
 * Daten sind dieselben wie vorher; die drei Spalten sind weg.
 *
 * (Aelterer Kommentar zur ersten Fassung:)
 *
 * Der Betreiber (12.10.2026) hatte bei einem anderen Statistikangebot gesehen, wie eine Startseite wirken kann, und
 * wollte genau diese Art: drei Spalten, Karten, die von allein rotieren (Spieler, Turniere, Global), ein Kartenstreifen,
 * der beim Ueberfahren den Cup wechselt, und kleine Vorschauen. "Einfach halt obviously mein Style" - uebernommen ist
 * der Aufbau und die Bewegung, nicht die Optik: unser Blau, unsere Schrift, Glas nur hier.
 *
 * Seine Rueckmeldung zur ersten Fassung: das Ganze breiter (links und rechts war Platz), die Maps groesser; beim Klick auf
 * einen Cup im Kartenstreifen sollen die anderen verschwinden; die Turnierkarte zeigt wechselnde Cups mit Bild und die
 * Bestenliste mit dem ganzen Team (Flaggen, Punkte, Siege, Eliminierungen, Platz); die Zahlen der Spieler-Karte rollen
 * bei jedem neuen Spieler; Heats und Trios gibt es als eigene Seiten nicht - statt ihrer stehen hier die Rangliste und die
 * Globals Solos (die es als Seite gibt).
 *
 * Alle Zahlen kommen aus den eigenen Antworten (/api/startvitrine); fehlt eine, steht ein Hinweis statt einer leeren Flaeche.
 */

const CSS = `
@keyframes vit-fuell { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes vit-rein { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes vit-rechts { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
@keyframes vit-puls { 0%, 100% { opacity: .35; } 50% { opacity: .7; } }
.vit-glas { border: 1px solid rgba(255,255,255,.09); background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.02));
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06); }
.vit-karte { border: 1px solid rgba(255,255,255,.07); background: rgba(9,9,11,.55); }
.vit-gold { border: 1px solid rgba(245,197,66,.28); background: linear-gradient(160deg, rgba(245,197,66,.09), rgba(9,9,11,.55)); }
.vit-scheibe { transition: flex-grow .65s cubic-bezier(.2,.8,.2,1), filter .4s, opacity .3s, margin .65s; }
@media (prefers-reduced-motion: reduce) { .vit-an { animation: none !important; } .vit-scheibe { transition: none; } }
`;

/* ------------------------------------------------------------------ Typen */

interface VSpieler { id: string; name: string; land: string | null; region: string; bild: string | null; elims: number; schaden: number; quote: number; matches: number }
interface VZeile { rang: number; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }
interface VCup { titel: string; cup: string; typ: string; bild: string | null; datum: number | null; region: string; saisonKurz: string; zeilen: VZeile[] }
interface VRegion { region: string; name: string; land: string | null; elims: number }
interface VRang { rang: number; name: string; land: string | null; wertung: number; delta: number }
interface Vitrine { ok: boolean; saison: string | null; saisonName?: string | null; spieler: VSpieler[]; cups: VCup[]; maps: number; regionen: VRegion[]; rangliste: VRang[] }
interface SolosFenster { windowId: string; name: string; art: string; spieler: Array<{ id: string; anzeige: string; land: string | null }> }

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/Brussels' });

/* ----------------------------------------------------------------- Helfer */

/** Ein Zaehler, der reihum weiterschaltet - und stehen bleibt, solange die Maus darauf liegt. */
function useRad(n: number, ms: number, halt: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (n < 2 || halt) return undefined;
    const id = window.setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => window.clearInterval(id);
  }, [n, ms, halt]);
  return n ? i % n : 0;
}

/** Wird das Element gesehen? Dann beginnen die Bewegungen - vorher wuerde niemand sie sehen. */
function useSichtbar<E extends HTMLElement>(): [(el: E | null) => void, boolean] {
  const [halter, setHalter] = useState<E | null>(null);
  const [drin, setDrin] = useState(false);
  useEffect(() => {
    if (!halter) return undefined;
    if (typeof IntersectionObserver === 'undefined') { void Promise.resolve().then(() => setDrin(true)); return undefined; }
    const b = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDrin(true); b.disconnect(); } }, { rootMargin: '-40px' });
    b.observe(halter);
    return () => b.disconnect();
  }, [halter]);
  return [setHalter, drin];
}

// Das Zahlenformat der eingestellten Sprache (app/lib/ort): fest 'de-DE' las sich auf der englischen Startseite als "300.283" Schaden und
// "39.859" PR, waehrend direkt darueber "867,907" stand (31.10.2026). Die Zahlen erscheinen erst nach dem Laden - kein Unterschied zum Server-Bild.
const zahl = (n: number) => n.toLocaleString(ortJetzt());

function Gesicht({ name, bild, px }: { name: string; bild: string | null; px: number }) {
  return bild
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={bild} alt="" loading="lazy" style={{ width: px, height: px, objectPosition: fokusVon(bild) }} className="shrink-0 rounded-full border border-white/15 object-cover" />
    : <PlatzhalterRund name={name} groesse={px} />;
}

/** Eine Karte mit Kopf: Symbol, Titel, Pfeil zur ganzen Seite. */
function Karte({ titel, href, symbol, children, gold = false, glas = false, className = '' }: { titel: string; href: string; symbol: ReactNode; children: ReactNode; gold?: boolean; glas?: boolean; className?: string }) {
  // glas: eine eigene, groessere Flaeche (die Reihen der Startseite); sonst die kleine Karte in einer Spalte.
  const flaeche = gold ? (glas ? 'vit-gold rounded-3xl p-5' : 'vit-gold rounded-2xl p-3.5') : (glas ? 'vit-glas rounded-3xl p-5' : 'vit-karte rounded-2xl p-3.5');
  return (
    <div className={`${flaeche} group/karte ${className}`}>
      <Link href={href} className={`mb-2.5 flex items-center justify-between gap-2 transition ${gold ? 'text-amber-200 hover:text-amber-100' : 'text-slate-100 hover:text-sky-400'}`}>
        <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
          <span className={gold ? 'text-amber-300' : 'text-sky-500'}>{symbol}</span><T>{titel}</T>
        </span>
        <span aria-hidden className="text-slate-600 transition group-hover/karte:translate-x-0.5 group-hover/karte:text-sky-400">→</span>
      </Link>
      {children}
    </div>
  );
}

const Hinweis = ({ geladen }: { geladen: boolean }) => (
  <p className="py-6 text-center text-xs text-slate-600">
    {geladen ? <T>Gerade nicht erreichbar.</T> : <span className="vit-an inline-block h-3 w-24 rounded bg-white/10" style={{ animation: 'vit-puls 1.4s ease-in-out infinite' }} />}
  </p>
);

const SYM = {
  spieler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
  pokal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>,
  welt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>,
  stufen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h10M4 12h14M4 18h8" /></svg>,
  flamme: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" /></svg>,
  rang: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>,
};

/* ------------------------------------------------------- Statistics: Spieler */

const RAD_MS = 4600;

/** Ein Spieler im Rampenlicht: das Foto gross hinter dem Namen, darunter die Zahlen - wechselt reihum, bleibt stehen, solange die Maus darauf liegt. */
function SpotlightKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.spieler ?? [];
  const [halt, setHalt] = useState(false);
  const i = useRad(liste.length, RAD_MS + 1400, halt);
  const s = liste[i];
  return (
    <div onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}
      className="vit-glas relative isolate flex min-h-[560px] flex-col justify-end overflow-hidden rounded-3xl">
      {!s ? <div className="m-auto p-8"><Hinweis geladen={fertig} /></div> : (
        <>
          <div key={s.id} className="vit-an absolute inset-0 -z-10" style={{ animation: 'vit-rein .6s cubic-bezier(.2,.8,.2,1) both' }}>
            {s.bild ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.bild} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: fokusVon(s.bild) }} />
            ) : (
              <SpielerPlatzhalter name={s.name} />
            )}
            <span aria-hidden className="foto-unten absolute inset-0" />
          </div>
          <div className="p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400"><T>Spieler im Rampenlicht</T></p>
            <Link key={s.id} href={`/statistics?spieler=${encodeURIComponent(s.name)}`} className="vit-an mt-2 block" style={{ animation: 'vit-rein .55s cubic-bezier(.2,.8,.2,1) both' }}>
              <span className="flex items-center gap-3">
                <TeamFlagge groesse={30} laender={[s.land ?? undefined]} />
                <span className="schrift-anzeige min-w-0 truncate text-4xl font-extrabold uppercase tracking-tight text-[#fff] sm:text-5xl">{s.name}</span>
                <span className="rounded border border-[rgba(255,255,255,.3)] bg-[rgba(255,255,255,.12)] px-1.5 py-0.5 text-[10px] font-bold text-[#e2e8f0]">{s.region}</span>
              </span>
            </Link>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([['Quote', s.quote.toFixed(2), 'text-emerald-400'], ['Elims', zahl(s.elims), 'text-[#fff]'], ['Schaden', zahl(s.schaden), 'text-[#fff]']] as const).map(([t, w, farbe]) => (
                <div key={t} className="rounded-xl border border-[rgba(255,255,255,.14)] bg-[rgba(6,10,18,.55)] px-2 py-3 text-center backdrop-blur">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]"><T>{t}</T></p>
                  <p className={`mt-0.5 text-2xl font-black tabular-nums ${farbe}`}><Rollzahl wert={w} los dauer={900} /></p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,.18)]">
                <div key={i} className="vit-an h-full origin-left bg-sky-400" style={{ animation: `vit-fuell ${RAD_MS + 1400}ms linear both`, animationPlayState: halt ? 'paused' : 'running' }} />
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]"><T>alle Saisons</T></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ Statistics: Turniere */

const CUP_MS = 7500;

/** Ein Cup nach dem anderen - mit Bild, Datum, Region und den ersten Teams der Bestenliste. */
function CupKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.cups ?? [];
  const [halt, setHalt] = useState(false);
  const i = useRad(liste.length, CUP_MS, halt);
  const c = liste[i];
  return (
    <Karte titel="Turniere" href="/events" symbol={SYM.pokal} glas>
      {!c ? <Hinweis geladen={fertig} /> : (
        <div onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <div key={c.titel} className="vit-an" style={{ animation: 'vit-rein .55s cubic-bezier(.2,.8,.2,1) both' }}>
            <div className="mb-2 flex items-center gap-3">
              {c.bild && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={encodeURI(c.bild)} alt="" loading="lazy" className="h-10 w-[72px] shrink-0 rounded-md border border-white/10 object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black uppercase tracking-wide text-slate-100">{c.titel.replace(/\s*·\s*/g, ' – ')}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="rounded bg-white/[0.08] px-1 py-0.5 text-slate-300">{c.region}</span>
                  <span>{c.saisonKurz}</span>{c.datum ? <span>{DATUM.format(new Date(c.datum))}</span> : null}
                </p>
              </div>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <th className="w-6 pb-1">#</th><th className="pb-1">Team</th><th className="w-10 pb-1 text-right">Pts</th><th className="w-8 pb-1 text-right" title="Victory Royales">VR</th><th className="w-10 pb-1 text-right">Elims</th>
                </tr>
              </thead>
              <tbody>
                {c.zeilen.slice(0, 5).map((z, k) => (
                  <tr key={z.rang} className="vit-an border-t border-white/[0.05]" style={{ animation: `vit-rechts .45s ${k * 90}ms cubic-bezier(.2,.8,.2,1) both` }}>
                    <td className="py-1.5 text-[10px] font-bold tabular-nums text-slate-500">{z.rang}</td>
                    <td className="py-1.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {z.spieler.map((p) => (
                          <span key={p.name} className="flex items-center gap-1 font-bold uppercase text-slate-200">
                            <TeamFlagge groesse={12} laender={[p.land ?? undefined]} />{p.name}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-bold tabular-nums text-sky-400">{z.punkte}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-300">{z.siege}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-300">{z.elims}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {liste.map((x, k) => <span key={x.titel} className={`h-1 rounded-full transition-all duration-500 ${k === i ? 'w-6 bg-sky-500' : 'w-2 bg-white/15'}`} />)}
          </div>
        </div>
      )}
    </Karte>
  );
}

/* -------------------------------------------------------- Statistics: Global */

function GlobalKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const regionen = daten?.regionen ?? [];
  const [setHalter, drin] = useSichtbar<HTMLDivElement>();
  const [halt, setHalt] = useState(false);
  const hell = useRad(regionen.length, 2200, halt);
  const max = Math.max(1, ...regionen.map((r) => r.elims));
  return (
    <Karte titel="Global" href="/statistics" symbol={SYM.welt} glas>
      {regionen.length === 0 ? <Hinweis geladen={fertig} /> : (
        <div ref={setHalter} onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <p className="mb-2 flex justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span><T>Meiste Eliminierungen · Bester je Region</T></span>
            {(daten?.saisonName || daten?.saison) && <span>{daten.saisonName || daten.saison}</span>}
          </p>
          <ul className="space-y-1.5">
            {regionen.map((r, k) => (
              <li key={r.region} className="flex items-center gap-2 text-[11px]">
                <span className="w-9 shrink-0 font-bold text-slate-400">{r.region}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-white/[0.05]">
                  <span className="absolute inset-y-0 left-0 origin-left rounded"
                    style={{
                      width: `${(r.elims / max) * 100}%`,
                      background: k === hell ? 'linear-gradient(90deg,#0284c7,#38bdf8)' : 'linear-gradient(90deg,#0c4a6e,#0369a1)',
                      transform: drin ? 'scaleX(1)' : 'scaleX(0)',
                      transition: `transform .9s cubic-bezier(.2,.8,.2,1) ${k * 90}ms, background .5s`,
                    }} />
                  <span className="relative z-10 flex h-full items-center gap-1 px-1.5 text-[10px] font-semibold text-white/90">
                    <TeamFlagge groesse={11} laender={[r.land ?? undefined]} />
                    <span className="truncate uppercase">{r.name}</span>
                  </span>
                </span>
                <span className="w-10 shrink-0 text-right font-bold tabular-nums text-slate-200">{zahl(r.elims)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Karte>
  );
}

/* ------------------------------------------------------------------ Maps */

const SCHEIBEN: Array<{ titel: string; bild: string; typ: string }> = [
  { titel: 'Performance Cup', bild: '/tournaments/Fortnite Performance Evaluation.jpg', typ: 'performance' },
  { titel: 'Division Cup', bild: '/tournaments/FNCS Division 1.jpg', typ: 'division' },
  { titel: 'FNCS', bild: '/cups/fncs-global-championship-2026-hd.jpg', typ: 'fncs' },
  { titel: 'Reload', bild: '/tournaments/Reload Elite Series Finals.jpg', typ: 'reload' },
];

function MapsSpalte({ anzahl }: { anzahl: number }) {
  const router = useRouter();
  const [auf, setAuf] = useState<number | null>(null);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [setHalter, drin] = useSichtbar<HTMLDivElement>();
  const [gezaehlt, setGezaehlt] = useState(0);
  useEffect(() => {
    if (!drin || !anzahl) return undefined;
    let raf = 0; const t0 = performance.now();
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setGezaehlt(Math.round(anzahl * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [drin, anzahl]);

  /** Ein Klick laesst die anderen verschwinden; der gewaehlte fuellt den Streifen, dann geht es zur Seite. */
  const waehle = (k: number, typ: string) => {
    setGewaehlt(k);
    window.setTimeout(() => router.push(`/tournament-maps?typ=${typ}`), 1100);
  };

  return (
    <div ref={setHalter} className="vit-glas flex min-h-[560px] flex-col overflow-hidden rounded-3xl p-6">
      <h3 className="text-4xl font-black uppercase tracking-tight text-slate-50 sm:text-5xl">Maps</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400"><T>Wo die Teams gelandet sind — jeder Cup, jede Saison.</T></p>

      <div className="relative mt-5 flex min-h-[360px] flex-1 overflow-hidden rounded-2xl" onMouseLeave={() => setAuf(null)}>
        {SCHEIBEN.map((s, k) => {
          const an = auf === k;
          const weg = gewaehlt !== null && gewaehlt !== k;
          const fokus = gewaehlt === k;
          return (
            <Link key={s.typ} href={`/tournament-maps?typ=${s.typ}`}
              onClick={(e) => { e.preventDefault(); if (gewaehlt === null) waehle(k, s.typ); }}
              onMouseEnter={() => setAuf(k)} onFocus={() => setAuf(k)}
              className="foto-dunkel vit-scheibe group/s relative block overflow-hidden"
              style={{
                flexGrow: weg ? 0.0001 : fokus ? 1 : an ? 3.2 : 1, flexBasis: 0, minWidth: 0,
                marginLeft: k && !weg ? '-3.2%' : 0, opacity: weg ? 0 : 1, pointerEvents: weg ? 'none' : 'auto',
                clipPath: fokus ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' : 'polygon(7% 0, 100% 0, 93% 100%, 0 100%)',
                filter: auf !== null && !an && !fokus ? 'brightness(.55) saturate(.7)' : 'none',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={encodeURI(s.bild)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/s:scale-110" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
              <span className="absolute inset-x-0 bottom-0 px-4 pb-5">
                <span className="block text-[11px] font-black uppercase leading-tight tracking-wide text-white drop-shadow sm:text-base">
                  <T>{s.titel}</T>
                </span>
                <span className="mt-1.5 block h-0.5 origin-left bg-sky-400 transition-transform duration-500" style={{ transform: an || fokus ? 'scaleX(1)' : 'scaleX(0)' }} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="text-4xl font-black tabular-nums leading-none text-sky-400 sm:text-6xl">
          {anzahl ? <>{zahl(gezaehlt)}<span className="text-sky-500">+</span></> : '—'}
          <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Maps</span>
        </p>
        <Link href="/tournament-maps"
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-900 shadow-lg transition hover:bg-sky-100">
          <T>Alle Maps ansehen</T> →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ More */

const STUFEN = [
  { buchstabe: 'S', farbe: 'bg-red-500', rand: 'border-red-500/40' },
  { buchstabe: 'A', farbe: 'bg-orange-500', rand: 'border-orange-500/40' },
  { buchstabe: 'B', farbe: 'bg-amber-400', rand: 'border-amber-400/40' },
];

/** Spieler, die auf dem Vorbild schon in der Vorschau stehen - hier bewusst andere (hoechstens einer, zwei davon). */
const NICHT_IN_DER_VORSCHAU = new Set(['peterbot', 'vico', 'rax', 'kami', 'mero', 'veno', 'bugha', 'shxrk', 'queasy']);

/** Die Tierlist wie eine Tierlist: Stufe um Stufe untereinander, links der Buchstabe, rechts die Spieler. */
function TierlistKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const alle = daten?.spieler ?? [];
  const frei = alle.filter((s) => !NICHT_IN_DER_VORSCHAU.has(s.name.toLowerCase()));
  // Genug andere? Dann nur sie; sonst mit dem Rest auffuellen.
  const liste = frei.length >= 9 ? frei : [...frei, ...alle.filter((s) => !frei.includes(s))];
  return (
    <Karte titel="Tierlist" href="/tierlist" symbol={SYM.stufen} glas>
      {liste.length < 9 ? <Hinweis geladen={fertig} /> : (
        <>
          {/* Die Stufen als drei Spalten nebeneinander (Betreiber, 14.10.2026: "sieht zu krass nach dem Vorbild aus") - oben der Buchstabe, darunter
              die Spieler untereinander. */}
          <div className="grid grid-cols-3 gap-2.5">
            {STUFEN.map((st, r) => (
              <div key={st.buchstabe} className={`vit-an overflow-hidden rounded-2xl border bg-black/20 ${st.rand}`}
                style={{ animation: `vit-rein .5s ${r * 120}ms cubic-bezier(.2,.8,.2,1) both` }}>
                <span className={`flex items-center justify-center py-2 text-2xl font-black text-zinc-950 ${st.farbe}`}>{st.buchstabe}</span>
                <div className="space-y-1.5 p-2">
                  {liste.slice(r * 3, r * 3 + 3).map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-zinc-900/70 p-1">
                      <Gesicht name={s.name} bild={s.bild} px={30} />
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase text-slate-100">{s.name}</span>
                      <TeamFlagge groesse={11} laender={[s.land ?? undefined]} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="pt-2 text-[10px] text-slate-600"><T>Vorschau nach Eliminierungen — bau deine eigene.</T></p>
        </>
      )}
    </Karte>
  );
}

interface SolosStufeKurz { windowId: string; name: string; art: string; status: 'live' | 'kommt' | 'vorbei'; begin: number; end: number | null }
interface FncsKurz { key: string; titel: string; kopf1: string; kopf2: string; bild: string | null; datum: number | null; preisgeld: string | null; spitze: Array<{ rang: number; punkte: number | null; preis?: string; spieler: Array<{ name: string; land: string | null; bild?: string | null }> }> }

/**
 * Die FNCS Solos - nur, solange eine Reihe laeuft (Betreiber, 30.10.2026: "Globals Solo kannst du auf der Home Page entfernen, ist ja zu Ende -
 * sobald es aktiv ist, also Heats usw., Solo Reload"). Oben das Bild der Reihe, darunter die Stufen mit Datum und Stand, dazu die Heats mit Spielern.
 */
function SoloKarte({ stufen, heats }: { stufen: SolosStufeKurz[]; heats: SolosFenster[] }) {
  const reload = stufen.some((s) => /reload/i.test(s.windowId));
  const zeigen = heats.filter((h) => h.spieler.length).slice(0, 2);
  return (
    <Link href="/globals-solos" className="vit-glas group/karte block overflow-hidden rounded-3xl">
      <div className="relative aspect-[16/6] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={reload ? '/cups/fncs-solo-reload.webp' : '/cups/fncs-solos.jpg'} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/karte:scale-105" />
        <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,.95), rgba(9,9,11,.1) 65%)' }} />
        <span className="absolute bottom-3 left-4 text-xl font-black uppercase tracking-tight text-[#fff] drop-shadow">FNCS Solos{reload ? ' Reload' : ''}</span>
        {stufen.some((s) => s.status === 'live') && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#ef4444] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#fff]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#fff]" />Live</span>
        )}
      </div>
      <div className="p-5">
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {stufen.slice(0, 8).map((s) => (
            <li key={s.windowId} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${s.status === 'live' ? 'border-sky-500/60 bg-sky-500/10' : 'border-white/[0.07] bg-black/25'}`}>
              <span className={`truncate font-bold uppercase ${s.status === 'vorbei' ? 'text-slate-500' : 'text-slate-100'}`}>{s.name}</span>
              <span className="shrink-0 tabular-nums text-slate-400">{DATUM.format(new Date(s.begin))}</span>
            </li>
          ))}
        </ol>
        {zeigen.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {zeigen.map((h) => (
              <div key={h.windowId} className="rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">{h.name}</p>
                {h.spieler.slice(0, 5).map((p) => (
                  <p key={p.id} className="flex items-center gap-1.5 truncate py-0.5 text-[11px] font-bold uppercase text-slate-200"><TeamFlagge groesse={12} laender={[p.land ?? undefined]} /><span className="truncate">{p.anzeige}</span></p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Ohne laufende Solos: das juengste FNCS-Endspiel gross - Bild, Titel und das Siegertreppchen mit Fotos (wie auf /fncs). */
function FncsKarte({ e, fertig }: { e: FncsKurz | null; fertig: boolean }) {
  if (!e) return <Karte titel="FNCS" href="/fncs" symbol={SYM.pokal} glas><Hinweis geladen={fertig} /></Karte>;
  const reihe = [e.spitze[1], e.spitze[0], e.spitze[2]];
  return (
    <Link href="/fncs" className="vit-glas group/karte block overflow-hidden rounded-3xl">
      <div className="relative aspect-[16/6] overflow-hidden">
        {e.bild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(e.bild)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/karte:scale-105" />
        )}
        <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,.95), rgba(9,9,11,.1) 65%)' }} />
        <span className="absolute bottom-3 left-4">
          <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-[#7dd3fc]">FNCS · {e.kopf1}</span>
          <span className="block text-xl font-black uppercase tracking-tight text-[#fff] drop-shadow">{e.kopf2}</span>
        </span>
        {e.preisgeld && <span className="absolute right-3 top-3 rounded-full bg-[rgba(0,0,0,.6)] px-2.5 py-1 text-[11px] font-black text-[#6ee7b7] backdrop-blur">{e.preisgeld}</span>}
      </div>
      <div className="grid grid-cols-3 items-end gap-2 p-5">
        {reihe.map((p, i) => p && (
          <div key={p.rang} className="flex min-w-0 flex-col items-center">
            <span className="flex">
              {p.spieler.map((s, k) => (
                <span key={`${s.name}-${k}`} style={{ marginLeft: k ? -10 : 0 }} className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-zinc-950 bg-zinc-800">
                  {s.bild
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.bild} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                    : <PlatzhalterRund name={s.name} groesse={44} />}
                </span>
              ))}
            </span>
            <span className="mt-1 line-clamp-2 w-full text-center text-[10px] font-black uppercase leading-tight text-slate-100">{p.spieler.map((s) => s.name).join(' · ')}</span>
            <span className={`mt-1.5 flex w-full justify-center rounded-t-lg border border-b-0 pt-1 text-sm font-black ${i === 1 ? 'h-12 border-sky-400/60 bg-sky-500/20 text-amber-300' : i === 0 ? 'h-9 border-white/10 bg-white/[0.06] text-slate-300' : 'h-7 border-white/10 bg-white/[0.06] text-amber-600'}`}>{p.rang}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

/** Die ersten fuenf der Power Rankings. */
function RangKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.rangliste ?? [];
  return (
    <Karte titel="Rankings" href="/power-rankings" symbol={SYM.rang} glas>
      {liste.length === 0 ? <Hinweis geladen={fertig} /> : (
        <ul className="space-y-1">
          {liste.map((r, k) => (
            <li key={r.rang} className="vit-an flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-1.5"
              style={{ animation: `vit-rechts .45s ${k * 90}ms cubic-bezier(.2,.8,.2,1) both` }}>
              <span className="w-4 text-center text-[11px] font-black tabular-nums text-slate-500">{r.rang}</span>
              <TeamFlagge groesse={13} laender={[r.land ?? undefined]} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase text-slate-100">{r.name}</span>
              <span className="text-[11px] font-bold tabular-nums text-sky-400">{zahl(r.wertung)}</span>
              <span className={`w-6 text-right text-[10px] font-bold tabular-nums ${r.delta > 0 ? 'text-emerald-400' : r.delta < 0 ? 'text-rose-400' : 'text-slate-600'}`}>
                {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '–'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Karte>
  );
}

/* ------------------------------------------------------------------ Ganzes */

export default function StartVitrine() {
  const [daten, setDaten] = useState<Vitrine | null>(null);
  const [heats, setHeats] = useState<SolosFenster[]>([]);
  /** Die Stufen der Solos - nur gesetzt, solange eine Reihe laeuft (live, bald oder bis 18 Stunden nach dem Finale). */
  const [solos, setSolos] = useState<SolosStufeKurz[] | null>(null);
  const [fncs, setFncs] = useState<FncsKurz | null>(null);
  const [geladen, setGeladen] = useState(false);
  const geholt = useRef(false);

  useEffect(() => {
    if (geholt.current) return;
    geholt.current = true;
    const j = (a: string) => fetch(a, { signal: AbortSignal.timeout(20_000), cache: 'no-store' }).then((r) => r.json());
    void Promise.allSettled([
      j('/api/startvitrine').then((v: Vitrine) => { if (v?.ok) setDaten(v); }),
      // Kurzfassung (nur die Heats) und eine zweite Chance: der erste Aufruf nach einem Neustart rechnet laenger als die Frist.
      j('/api/globals-solos?kurz=1').catch(() => j('/api/globals-solos?kurz=1')).then((v: { ok?: boolean; fenster?: SolosFenster[]; stufen?: SolosStufeKurz[] }) => {
        if (!v?.ok) return;
        setHeats((v.fenster ?? []).filter((f) => f.art === 'heat'));
        const jetzt = Date.now();
        const st = v.stufen ?? [];
        const laeuft = st.some((x) => x.status === 'live' || (x.status === 'kommt' && x.begin - jetzt < 2 * 864e5)
          || (x.art === 'finale' && x.status === 'vorbei' && x.end !== null && jetzt - x.end < 18 * 3600_000));
        setSolos(laeuft ? st : null);
      }),
      j('/api/fncs-ereignisse').then((v: { ok?: boolean; ereignisse?: FncsKurz[] }) => { if (v?.ok && v.ereignisse?.length) setFncs(v.ereignisse[v.ereignisse.length - 1]); }),
    ]).finally(() => setGeladen(true));
  }, []);

  return (
    <section className="relative px-4 py-10 xl:py-8">
      <style>{CSS}</style>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-72 max-w-5xl rounded-full bg-sky-500/[0.06] blur-[110px]" />
      <div className="vit-raster relative mx-auto max-w-[1500px] space-y-10">
        {/* Oben: die Maps gross, daneben ein Spieler im Rampenlicht */}
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <MapsSpalte anzahl={daten?.maps ?? 0} />
          <SpotlightKarte daten={daten} fertig={geladen} />
        </div>

        {/* Die Statistik als Reihe */}
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Aus dem Archiv</T></p>
              <h3 className="schrift-anzeige mt-1 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl"><T>Statistiken</T></h3>
            </div>
            <p className="max-w-md text-sm text-slate-500"><T>Aus den Spielwerten jedes Cups — nach jedem Event erneuert.</T></p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <CupKarte daten={daten} fertig={geladen} />
            <RangKarte daten={daten} fertig={geladen} />
            <GlobalKarte daten={daten} fertig={geladen} />
          </div>
        </div>

        {/* Mitmachen: Tierlist und daneben die laufenden FNCS Solos - sonst das juengste FNCS-Endspiel */}
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Zum Mitmachen</T></p>
              <h3 className="schrift-anzeige mt-1 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl"><T>Mehr</T></h3>
            </div>
            <p className="max-w-md text-sm text-slate-500"><T>Eigene Tierlist bauen und die FNCS verfolgen.</T></p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <TierlistKarte daten={daten} fertig={geladen} />
            {solos ? <SoloKarte stufen={solos} heats={heats} /> : <FncsKarte e={fncs} fertig={geladen} />}
          </div>
        </div>
      </div>
    </section>
  );
}
