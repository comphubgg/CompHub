'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';

/*
 * Die Schaukaesten der Startseite: Statistics - Maps - More.
 *
 * Der Betreiber (12.10.2026) hatte bei einem anderen Statistikangebot gesehen, wie eine Startseite wirken kann, und
 * wollte genau diese Art: drei Spalten, Karten, die von allein rotieren (Spieler, Turniere, Global), ein Kartenstreifen,
 * der beim Ueberfahren den Cup wechselt, und kleine Vorschauen auf Tierlist, Heats und Trios. "Einfach halt obviously
 * mein Style" - uebernommen ist also der Aufbau und die Bewegung, nicht die Optik: unser Blau, unsere Schrift, Glas
 * nur hier. Alle Zahlen kommen aus den eigenen Antworten (/api/startvitrine, /api/globals-solos, /api/turnier-karten);
 * fehlt eine, steht an ihrer Stelle ein Hinweis statt einer leeren Flaeche.
 */

const CSS = `
@keyframes vit-hoch { from { transform: translateY(0); } to { transform: translateY(-50%); } }
@keyframes vit-fuell { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes vit-rein { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes vit-rechts { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
@keyframes vit-puls { 0%, 100% { opacity: .35; } 50% { opacity: .7; } }
.vit-glas { border: 1px solid rgba(255,255,255,.09); background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.02));
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.06); }
.vit-karte { border: 1px solid rgba(255,255,255,.07); background: rgba(9,9,11,.55); }
.vit-schleier { mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 86%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 86%, transparent 100%); }
.vit-scheibe { transition: flex-grow .55s cubic-bezier(.2,.8,.2,1), filter .4s; }
@media (prefers-reduced-motion: reduce) { .vit-an { animation: none !important; } .vit-scheibe { transition: none; } }
`;

/* ------------------------------------------------------------------ Typen */

interface VSpieler { id: string; name: string; land: string | null; region: string; bild: string | null; elims: number; schaden: number; quote: number; matches: number }
interface VTurnier { name: string; region: string; datum: number | null; spieler: number; matches: number; sieger: { name: string; land: string | null; elims: number } | null }
interface VRegion { region: string; name: string; land: string | null; elims: number }
interface VTrio { spieler: Array<{ name: string; land: string | null }>; region: string | null; platz: number | null }
interface Vitrine { ok: boolean; saison: string | null; spieltage: number | null; spieler: VSpieler[]; turniere: VTurnier[]; regionen: VRegion[]; trios: VTrio[] }
interface SolosFenster { windowId: string; name: string; art: string; spieler: Array<{ id: string; anzeige: string; land: string | null }> }

const DATUM = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' });

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

/** Zaehlt beim Erscheinen von null auf den Wert. */
function useZaehler(ziel: number, los: boolean, ms = 1400): number {
  const [wert, setWert] = useState(0);
  useEffect(() => {
    if (!los || !ziel) return undefined;
    let raf = 0; const t0 = performance.now();
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setWert(Math.round(ziel * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [ziel, los, ms]);
  return wert;
}

const zahl = (n: number) => n.toLocaleString('de-DE');

function Gesicht({ name, bild, px }: { name: string; bild: string | null; px: number }) {
  return bild
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={bild} alt="" loading="lazy" style={{ width: px, height: px }} className="shrink-0 rounded-full border border-white/15 object-cover object-top" />
    : <span style={{ width: px, height: px }} className="flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-xs font-bold text-slate-500">{name.slice(0, 1).toUpperCase()}</span>;
}

/** Eine Karte mit Kopf: Symbol, Titel, Pfeil zur ganzen Seite. */
function Karte({ titel, href, symbol, children, className = '' }: { titel: string; href: string; symbol: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`vit-karte group/karte rounded-2xl p-4 ${className}`}>
      <Link href={href} className="mb-3 flex items-center justify-between gap-2 text-slate-100 transition hover:text-sky-400">
        <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
          <span className="text-sky-500">{symbol}</span><T>{titel}</T>
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
  gruppe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2 20c.7-3 3-5 6-5s5.3 2 6 5M15 15c3 0 5 1.6 6 4.5" /></svg>,
};

/* ------------------------------------------------------- Statistics: Spieler */

const RAD_MS = 4200;

function SpielerKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.spieler ?? [];
  const [halt, setHalt] = useState(false);
  const i = useRad(liste.length, RAD_MS, halt);
  const s = liste[i];
  return (
    <Karte titel="Spieler" href="/statistics" symbol={SYM.spieler}>
      {!s ? <Hinweis geladen={fertig} /> : (
        <div onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <div key={s.id} className="vit-an" style={{ animation: 'vit-rein .55s cubic-bezier(.2,.8,.2,1) both' }}>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5">
              <Gesicht name={s.name} bild={s.bild} px={38} />
              <TeamFlagge groesse={18} laender={[s.land ?? undefined]} />
              <span className="min-w-0 flex-1 truncate text-lg font-black uppercase tracking-wide text-slate-50">{s.name}</span>
              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{s.region}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([['Quote', s.quote.toFixed(2), 'text-emerald-400'], ['Elims', zahl(s.elims), 'text-slate-50'], ['Schaden', zahl(s.schaden), 'text-slate-50']] as const).map(([t, w, farbe]) => (
                <div key={t} className="rounded-xl border border-white/[0.07] bg-black/30 px-2 py-2 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>{t}</T></p>
                  <p className={`mt-0.5 text-lg font-black tabular-nums ${farbe}`}>{w}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
            <div key={i} className="vit-an h-full origin-left bg-sky-500" style={{ animation: `vit-fuell ${RAD_MS}ms linear both`, animationPlayState: halt ? 'paused' : 'running' }} />
          </div>
        </div>
      )}
    </Karte>
  );
}

/* ------------------------------------------------------ Statistics: Turniere */

function TurnierKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.turniere ?? [];
  // Doppelt gelegt: bei der halben Hoehe springt die Schleife unmerklich zurueck.
  const doppelt = useMemo(() => [...liste, ...liste], [liste]);
  const [halt, setHalt] = useState(false);
  return (
    <Karte titel="Turniere" href="/events" symbol={SYM.pokal}>
      {liste.length === 0 ? <Hinweis geladen={fertig} /> : (
        <div className="vit-schleier h-[170px] overflow-hidden" onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <ul className="vit-an" style={{ animation: `vit-hoch ${Math.max(24, liste.length * 4)}s linear infinite`, animationPlayState: halt ? 'paused' : 'running' }}>
            {doppelt.map((t, k) => (
              <li key={k} className="flex items-center gap-2 border-b border-white/[0.05] py-2 text-xs">
                <span className="w-9 shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-center text-[9px] font-bold text-slate-300">{t.region}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-200">{t.name}</span>
                  <span className="block text-[10px] tabular-nums text-slate-600">{t.datum ? DATUM.format(new Date(t.datum)) : ''}{t.spieler ? ` · ${zahl(t.spieler)}` : ''}</span>
                </span>
                {t.sieger && (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-300">
                    <TeamFlagge groesse={13} laender={[t.sieger.land ?? undefined]} />
                    <span className="max-w-[72px] truncate font-semibold uppercase">{t.sieger.name}</span>
                    <span className="tabular-nums text-sky-400">{t.sieger.elims}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
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
    <Karte titel="Global" href="/statistics" symbol={SYM.welt}>
      {regionen.length === 0 ? <Hinweis geladen={fertig} /> : (
        <div ref={setHalter} onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          <p className="mb-2 flex justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span><T>Meiste Eliminierungen · Bester je Region</T></span>
            {daten?.saison && <span>{daten.saison}</span>}
          </p>
          <ul className="space-y-1.5">
            {regionen.map((r, k) => (
              <li key={r.region} className="flex items-center gap-2 text-[11px]">
                <span className="w-9 shrink-0 font-bold text-slate-400">{r.region}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-white/[0.05]">
                  <span className="vit-an absolute inset-y-0 left-0 origin-left rounded transition-colors duration-500"
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
                <span className="w-9 shrink-0 text-right font-bold tabular-nums text-slate-200">{zahl(r.elims)}</span>
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
  { titel: 'FNCS', bild: '/cups/fncs-global-championship-2026.jpg', typ: 'fncs' },
  { titel: 'Reload', bild: '/tournaments/Reload Elite Series Finals.jpg', typ: 'reload' },
];

function MapsSpalte({ anzahl }: { anzahl: number | null }) {
  const [auf, setAuf] = useState<number | null>(null);
  const [setHalter, drin] = useSichtbar<HTMLDivElement>();
  const gezaehlt = useZaehler(anzahl ?? 0, drin);
  return (
    <div ref={setHalter} className="vit-glas flex min-h-[420px] flex-col overflow-hidden rounded-3xl p-5">
      <h3 className="text-4xl font-black uppercase tracking-tight text-slate-50 sm:text-5xl">Maps</h3>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400"><T>Wo die Teams gelandet sind — jeder Cup, jede Saison.</T></p>

      <div className="relative mt-4 flex min-h-[260px] flex-1 overflow-hidden rounded-2xl" onMouseLeave={() => setAuf(null)}>
        {SCHEIBEN.map((s, k) => {
          const an = auf === k;
          return (
            <Link key={s.typ} href={`/tournament-maps?typ=${s.typ}`} onMouseEnter={() => setAuf(k)} onFocus={() => setAuf(k)}
              className="vit-scheibe group/s relative block overflow-hidden"
              style={{
                flexGrow: an ? 3.2 : 1, flexBasis: 0, marginLeft: k ? '-3.2%' : 0,
                clipPath: 'polygon(7% 0, 100% 0, 93% 100%, 0 100%)',
                filter: auf !== null && !an ? 'brightness(.55) saturate(.7)' : 'none',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={encodeURI(s.bild)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/s:scale-110" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
              <span className="absolute inset-x-0 bottom-0 px-4 pb-4">
                <span className="block text-[11px] font-black uppercase leading-tight tracking-wide text-white drop-shadow sm:text-sm">
                  <T>{s.titel}</T>
                </span>
                <span className="mt-1 block h-0.5 origin-left bg-sky-400 transition-transform duration-500" style={{ transform: an ? 'scaleX(1)' : 'scaleX(0)' }} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-4xl font-black tabular-nums leading-none text-sky-400 sm:text-5xl">
          {anzahl ? <>{zahl(gezaehlt)}<span className="text-sky-500">+</span></> : '—'}
          <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Maps</span>
        </p>
        <Link href="/tournament-maps"
          className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-900 shadow-lg transition hover:bg-sky-100">
          <T>Alle Maps ansehen</T> →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ More */

const STUFEN = [
  { buchstabe: 'S', farbe: 'bg-red-500' },
  { buchstabe: 'A', farbe: 'bg-orange-500' },
  { buchstabe: 'B', farbe: 'bg-amber-400' },
];

function TierlistKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.spieler ?? [];
  return (
    <Karte titel="Tierlist" href="/tierlist" symbol={SYM.stufen}>
      {liste.length < 3 ? <Hinweis geladen={fertig} /> : (
        <div className="space-y-1.5">
          {STUFEN.map((st, r) => (
            <div key={st.buchstabe} className="vit-an flex items-stretch gap-1.5 overflow-hidden rounded-lg border border-white/[0.07] bg-black/30"
              style={{ animation: `vit-rechts .5s ${r * 120}ms cubic-bezier(.2,.8,.2,1) both` }}>
              <span className={`flex w-9 shrink-0 items-center justify-center text-base font-black text-zinc-950 ${st.farbe}`}>{st.buchstabe}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1 py-1.5 pr-1.5">
                {liste.slice(r * 3, r * 3 + 3).map((s) => (
                  <span key={s.id} className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-zinc-900/70 px-1.5 py-1 text-[10px] font-bold uppercase text-slate-200">
                    <TeamFlagge groesse={12} laender={[s.land ?? undefined]} />{s.name}
                  </span>
                ))}
              </span>
            </div>
          ))}
          <p className="pt-0.5 text-[10px] text-slate-600"><T>Vorschau nach Eliminierungen — bau deine eigene.</T></p>
        </div>
      )}
    </Karte>
  );
}

function HeatKarte({ heats, geladen }: { heats: SolosFenster[] | null; geladen: boolean }) {
  const zeigen = (heats ?? []).filter((h) => h.spieler.length).slice(0, 3);
  return (
    <Karte titel="Heats" href="/globals-solos/heats" symbol={SYM.flamme}>
      {zeigen.length === 0 ? (heats && geladen ? <p className="py-4 text-center text-xs text-slate-600"><T>Noch keine Heats eingeteilt.</T></p> : <Hinweis geladen={geladen} />) : (
        <div className="grid grid-cols-3 gap-1.5">
          {zeigen.map((h, k) => (
            <div key={h.windowId} className="vit-an rounded-lg border border-white/[0.07] bg-black/30 p-1.5"
              style={{ animation: `vit-rein .5s ${k * 130}ms cubic-bezier(.2,.8,.2,1) both` }}>
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{h.name}</p>
              {h.spieler.slice(0, 3).map((s) => (
                <p key={s.id} className="flex items-center gap-1 truncate py-0.5 text-[10px] font-bold uppercase text-slate-200">
                  <TeamFlagge groesse={11} laender={[s.land ?? undefined]} /><span className="truncate">{s.anzeige}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </Karte>
  );
}

function TrioKarte({ daten, fertig }: { daten: Vitrine | null; fertig: boolean }) {
  const liste = daten?.trios ?? [];
  const [halt, setHalt] = useState(false);
  const seiten = Math.max(1, Math.floor(liste.length / 3));
  const i = useRad(seiten, 5000, halt);
  const zeigen = liste.slice(i * 3, i * 3 + 3);
  return (
    <Karte titel="Trios" href="/tierlist" symbol={SYM.gruppe}>
      {zeigen.length === 0 ? <Hinweis geladen={fertig} /> : (
        <div key={i} className="space-y-1.5" onMouseEnter={() => setHalt(true)} onMouseLeave={() => setHalt(false)}>
          {zeigen.map((t, k) => (
            <div key={t.spieler.map((s) => s.name).join('|')} className="vit-an flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-2"
              style={{ animation: `vit-rechts .5s ${k * 110}ms cubic-bezier(.2,.8,.2,1) both` }}>
              {t.spieler.map((s) => (
                <span key={s.name} className="flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase text-slate-200">
                  <TeamFlagge groesse={12} laender={[s.land ?? undefined]} /><span className="truncate">{s.name}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </Karte>
  );
}

/* ------------------------------------------------------------------ Ganzes */

export default function StartVitrine() {
  const [daten, setDaten] = useState<Vitrine | null>(null);
  const [heats, setHeats] = useState<SolosFenster[] | null>(null);
  const [mapsAnzahl, setMapsAnzahl] = useState<number | null>(null);
  const [geladen, setGeladen] = useState(false);
  const geholt = useRef(false);

  useEffect(() => {
    if (geholt.current) return;
    geholt.current = true;
    const frist = () => AbortSignal.timeout(15_000);
    const j = (a: string) => fetch(a, { signal: frist(), cache: 'no-store' }).then((r) => r.json());
    void Promise.allSettled([
      j('/api/startvitrine').then((v: Vitrine) => { if (v?.ok) setDaten(v); }),
      j('/api/globals-solos').then((v: { ok?: boolean; fenster?: SolosFenster[] }) => { if (v?.ok) setHeats((v.fenster ?? []).filter((f) => f.art === 'heat')); }),
      j('/api/turnier-karten?liste=1').then((v: { karten?: unknown[] }) => { if (Array.isArray(v?.karten)) setMapsAnzahl(v.karten.length); }),
    ]).finally(() => setGeladen(true));
  }, []);

  return (
    <section className="relative px-4 py-16">
      <style>{CSS}</style>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-72 max-w-5xl rounded-full bg-sky-500/[0.06] blur-[110px]" />
      <div className="relative mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_1.12fr_1fr]">
        {/* ---------------------------------------------------- Statistics */}
        <div className="vit-glas rounded-3xl p-5">
          <h3 className="text-4xl font-black uppercase tracking-tight text-slate-50 sm:text-5xl"><T>Statistiken</T></h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400"><T>Aus den Spielwerten jedes Cups — nach jedem Event erneuert.</T></p>
          <div className="mt-4 space-y-3">
            <SpielerKarte daten={daten} fertig={geladen} />
            <TurnierKarte daten={daten} fertig={geladen} />
            <GlobalKarte daten={daten} fertig={geladen} />
          </div>
        </div>

        {/* ---------------------------------------------------------- Maps */}
        <MapsSpalte anzahl={mapsAnzahl} />

        {/* ----------------------------------------------------------- More */}
        <div className="vit-glas rounded-3xl p-5">
          <h3 className="text-4xl font-black uppercase tracking-tight text-slate-50 sm:text-5xl"><T>Mehr</T></h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400"><T>Eigene Tierlist bauen, die Heats der Solos und die aktuellen Trios.</T></p>
          <div className="mt-4 space-y-3">
            <TierlistKarte daten={daten} fertig={geladen} />
            <HeatKarte heats={heats} geladen={geladen} />
            <TrioKarte daten={daten} fertig={geladen} />
          </div>
        </div>
      </div>
    </section>
  );
}
