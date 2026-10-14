'use client';

/*
 * Maps - die Karten aller Cups, nach Kapitel und Saison geordnet.
 *
 * Gleich bleibt, was die Seite kann (Betreiber, 12.10.2026): Kapitel 1 bis 7 mit Bild (grau, solange sie nicht offen sind), darunter die
 * Saisons, dann die Cups mit Bild, Datum, Region und Stand (Ended, Live, Upcoming), filterbar nach FNCS, Performance, Division und Reload,
 * als Kacheln oder Liste. Einen "All time"-Filter gibt es nicht - er wäre viel zu viel.
 *
 * Neu ist die Anordnung (Betreiber, 14.10.2026: "irgendwie anders anordnen, aber Funktionen, Farben und Tags bleiben"): die Kapitel stehen als
 * Bildstreifen oben statt als Leiste links, die Saisons als Reihe darunter; die Kachel trägt ihren Titel auf dem Bild statt darunter.
 *
 * Kapitel ohne Karten stehen trotzdem im Streifen, grau und mit "0": für sie liegen keine Landepunkte vor, und die Seite tut nicht so,
 * als gäbe es sie.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { regionFarbe, regionAnzeige } from '@/lib/regionFarbe';
import { useZugang } from '@/app/lib/zugang';

type Typ = 'fncs' | 'performance' | 'division' | 'reload' | 'sonst';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; ende: number | null; saison: string; saisonKurz: string; saisonName: string; typ: Typ; bild: string | null;
  reihe?: number; lan?: boolean; alt?: boolean; saisonTitel?: string;
}
interface Saison { kennung: string; nr: number; name: string; kurz: string; kapitel: number; titel?: string }
interface Eigene {
  id: string; titel: string; region: string | null; windowId: string | null; datum: number | null; bild: string | null;
}

const TYPEN: Array<[Typ, string]> = [['fncs', 'FNCS'], ['performance', 'Performance'], ['division', 'Division'], ['reload', 'Reload'], ['sonst', 'Cups']];
const TYP_NAME: Record<Typ, string> = { fncs: 'FNCS', performance: 'Performance', division: 'Division', reload: 'Reload', sonst: 'Cup' };

/** Das Bild je Kapitel - Saisonbilder, die im Werkzeug liegen. Wo keins da ist, steht die Nummer. */
const KAPITEL_BILD: Record<number, string> = {
  7: '/saisonbilder/CH7S4.jpg', 6: '/saisonbilder/CH6S4.webp', 5: '/saisonbilder/CH5S4.jpg', 4: '/saisonbilder/CH4.jpg',
  3: '/saisonbilder/CH3.jpg', 2: '/saisonbilder/Chapter 2 Remix.jpg', 1: '/saisonbilder/CH1.jpg',
};

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

const CSS = `
@keyframes mp-rein { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .mp-an { animation: none !important; } }
`;

function stand(e: { datum: number | null; ende: number | null }): 'ended' | 'live' | 'upcoming' {
  const jetzt = Date.now();
  if (e.datum && jetzt < e.datum) return 'upcoming';
  if (e.ende && jetzt > e.ende) return 'ended';
  if (!e.ende && e.datum && jetzt - e.datum > 12 * 3600_000) return 'ended';
  return e.datum ? 'live' : 'ended';
}

const StandMarke = ({ s }: { s: 'ended' | 'live' | 'upcoming' }) => (
  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm ${s === 'live'
    ? 'border-red-400/50 bg-red-500/70 text-white' : s === 'upcoming' ? 'border-sky-300/40 bg-sky-500/70 text-white' : 'border-white/20 bg-black/55 text-slate-200'}`}>
    {s === 'live' ? 'Live' : s === 'upcoming' ? 'Upcoming' : 'Ended'}
  </span>
);

/** Die Kachel: Bild mit Titel darauf, darunter die Marken in einer Zeile und das Datum rechts. */
function Kachel({ e, i }: { e: Eintrag; i: number }) {
  return (
    <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
      className="mp-an group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-sky-500 hover:shadow-lg"
      style={{ animation: `mp-rein .5s ${Math.min(i, 14) * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {e.bild ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(e.bild)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950 text-3xl font-black text-sky-500/40">MAP</div>
        )}
        <span aria-hidden className="absolute inset-0 foto-unten" />
        <span className="absolute left-3 top-3"><StandMarke s={stand(e)} /></span>
        <span className="absolute right-3 top-3 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">{regionAnzeige(e)}</span>
        <p className="schrift-anzeige absolute inset-x-3 bottom-3 line-clamp-2 text-left text-[1.05rem] font-extrabold leading-tight text-[#fff] drop-shadow">{e.titel.replace(/\s*·\s*/g, ' – ')}</p>
      </div>
      {/* Kleine Marken: die Region in ihrer Farbe, die Saison als Umriss, Art und Spieltag grau. */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2.5">
        {e.lan && <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-950">LAN</span>}
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${regionAnzeige(e) === 'GLOBAL' ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : regionFarbe(e.region).marke}`}>{regionAnzeige(e)}</span>
        {e.saisonKurz && <span className="rounded border border-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">{e.saisonKurz}</span>}
        <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{TYP_NAME[e.typ]}</span>
        {e.fenster && <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{e.fenster}</span>}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</span>
      </div>
    </Link>
  );
}

function EigeneKachel({ k, i }: { k: Eigene; i: number }) {
  return (
    <Link href={`/maps?id=${encodeURIComponent(k.id)}`}
      className="mp-an group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-sky-500 hover:shadow-lg"
      style={{ animation: `mp-rein .5s ${Math.min(i, 14) * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {k.bild ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={k.bild} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950 text-3xl font-black text-sky-500/40">MAP</div>}
        <span aria-hidden className="absolute inset-0 foto-unten" />
        {k.region && k.region !== 'GLOBAL' && (
          <span className="absolute right-3 top-3 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">{k.region}</span>
        )}
        <p className="schrift-anzeige absolute inset-x-3 bottom-3 line-clamp-2 text-left text-[1.05rem] font-extrabold leading-tight text-[#fff] drop-shadow">{k.titel.replace(/\s*·\s*/g, ' – ')}</p>
      </div>
      <div className="flex items-center px-3 py-2.5">
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">{k.datum ? DATUM.format(new Date(k.datum)) : ''}</span>
      </div>
    </Link>
  );
}

export default function Maps() {
  const t = useT();
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [eigene, setEigene] = useState<Eigene[]>([]);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState<Typ | ''>('');
  const [kapitel, setKapitel] = useState(0);
  const [saison, setSaison] = useState('');
  const [ansicht, setAnsicht] = useState<'kacheln' | 'liste'>('kacheln');
  const zugang = useZugang();

  useEffect(() => {
    try { const a = localStorage.getItem('maps_ansicht'); if (a === 'liste' || a === 'kacheln') setAnsicht(a); } catch { /* ohne Speicher */ }
  }, []);

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste')
      .then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) { setEintraege(j.eintraege); setSaisons(j.saisons ?? []); } else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    fetch('/api/turnier-karten?liste=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!weg && Array.isArray(j?.karten)) setEigene(j.karten); })
      .catch(() => { /* ohne eigene Karten bleibt es bei den anderen */ });
    return () => { weg = true; };
  }, []);

  /** Wie viele Karten je Saison. */
  const zahlJe = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eintraege ?? []) if (e.saison) m.set(e.saison, (m.get(e.saison) ?? 0) + 1);
    return m;
  }, [eintraege]);

  const kapitelListe = useMemo(() => {
    const m = new Map<number, { nr: number; saisons: Saison[]; n: number }>();
    for (const s of saisons) {
      const k = m.get(s.kapitel) ?? { nr: s.kapitel, saisons: [], n: 0 };
      k.saisons.push(s); k.n += zahlJe.get(s.kennung) ?? 0; m.set(s.kapitel, k);
    }
    return [...m.values()].sort((a, b) => a.nr - b.nr);
  }, [saisons, zahlJe]);

  // Beim ersten Laden: das jüngste Kapitel mit Karten; aus der Adresse ?typ= und ?saison= (von der Startseite und vom Cup).
  useEffect(() => {
    if (!kapitelListe.length) return;
    const p = new URLSearchParams(window.location.search);
    const w = p.get('typ');
    if (w && TYPEN.some(([k]) => k === w)) setTyp(w as Typ);
    const s = p.get('saison');
    const ausAdresse = s ? saisons.find((x) => x.kennung === s) : null;
    if (ausAdresse) { setKapitel(ausAdresse.kapitel); setSaison(ausAdresse.kennung); return; }
    const juengstes = [...kapitelListe].reverse().find((k) => k.n > 0);
    if (juengstes) setKapitel(juengstes.nr);
  }, [kapitelListe, saisons]);

  const offen = kapitelListe.find((k) => k.nr === kapitel) ?? null;

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const kennungen = new Set((offen?.saisons ?? []).map((s) => s.kennung));
    return (eintraege ?? []).filter((e) => kennungen.has(e.saison)
      && (!saison || e.saison === saison)
      && (!typ || e.typ === typ)
      && (!q || `${e.titel} ${e.cup} ${e.fenster} ${e.region} ${e.saisonKurz}`.toLowerCase().includes(q)));
  }, [eintraege, offen, saison, typ, suche]);

  const bekannteFenster = useMemo(() => new Set((eintraege ?? []).map((e) => e.windowId)), [eintraege]);
  const nurEigene = useMemo(() => {
    if (typ || saison || (offen && offen.nr !== Math.max(...kapitelListe.filter((k) => k.n > 0).map((k) => k.nr), 0))) return [];
    const q = suche.trim().toLowerCase();
    return eigene.filter((k) => !(k.windowId && bekannteFenster.has(k.windowId)) && (!q || `${k.titel} ${k.region ?? ''}`.toLowerCase().includes(q)));
  }, [eigene, bekannteFenster, typ, saison, suche, offen, kapitelListe]);

  const chip = (an: boolean) => `rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an
    ? 'bg-sky-500 text-white shadow-sm' : 'border border-zinc-700 bg-zinc-900 text-slate-300 hover:border-sky-500/70 hover:text-sky-500'}`;

  const gesamt = eintraege?.length ?? 0;
  const titelZeile = saison
    ? (() => { const s = saisons.find((x) => x.kennung === saison); return s ? `${s.name}${s.titel ? ` · ${s.titel}` : ''}` : ''; })()
    : (kapitel ? `Chapter ${kapitel}` : '');

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <style>{CSS}</style>
      <div className="mx-auto max-w-[1500px] px-4 py-8">
        {/* ---------------------------------------------------------------- Kopf */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Landepunkte</T></p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Maps</h1>
            <p className="mt-3 max-w-xl text-base text-slate-400"><T>Wo die Teams gelandet sind — jeder Cup, jede Saison.</T></p>
          </div>
          {eintraege && (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-3 text-right shadow-sm">
              <span className="schrift-anzeige block text-3xl font-extrabold tabular-nums text-sky-500">{gesamt.toLocaleString('de-DE')}</span>
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Karten</T></span>
            </p>
          )}
        </div>

        {/* ------------------------------------------------- Kapitel als Bildstreifen */}
        <div className="mt-7 flex gap-3 overflow-x-auto pb-2" role="tablist" aria-label="Chapter">
          {kapitelListe.length === 0 && <div className="p-4"><LadeSchirm /></div>}
          {[...kapitelListe].reverse().map((k) => {
            const an = k.nr === kapitel;
            return (
              <button key={k.nr} type="button" role="tab" aria-selected={an} onClick={() => { setKapitel(k.nr); setSaison(''); }}
                className={`group relative h-24 w-44 shrink-0 overflow-hidden rounded-2xl border text-left transition duration-300 ${an ? 'border-sky-500 shadow-md ring-2 ring-sky-500/30' : 'border-zinc-800 hover:border-zinc-600'}`}>
                {KAPITEL_BILD[k.nr] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={encodeURI(KAPITEL_BILD[k.nr])} alt="" loading="lazy"
                    className={`absolute inset-0 h-full w-full object-cover transition duration-500 ${an ? 'scale-105' : 'grayscale brightness-[.55] group-hover:brightness-75'}`} />
                ) : (
                  <span className={`absolute inset-0 bg-gradient-to-br transition ${an ? 'from-sky-900 to-zinc-900' : 'from-zinc-800 to-zinc-900 grayscale'}`} />
                )}
                <span className="absolute inset-0 foto-unten" />
                <span className="relative flex h-full w-full flex-col justify-end px-3 pb-2.5">
                  <span className="schrift-anzeige text-base font-extrabold uppercase tracking-wide text-[#fff] drop-shadow">Chapter {k.nr}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-[#cbd5e1]">{k.n} <T>Karten</T></span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ---------------------------------------------------- Saisonreihe */}
        {offen && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSaison('')} className={chip(saison === '')}><T>Alle</T></button>
            {offen.saisons.map((s) => {
              const n = zahlJe.get(s.kennung) ?? 0;
              return (
                <button key={s.kennung} type="button" onClick={() => setSaison(s.kennung)}
                  className={`${chip(saison === s.kennung)} ${n || saison === s.kennung ? '' : 'opacity-50'}`}>
                  {s.kurz}
                  {s.titel && <span className="ml-1.5 font-semibold normal-case tracking-normal opacity-70">{s.titel}</span>}
                  <span className="ml-2 tabular-nums opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* --------------------------------------------------------- Werkzeugleiste */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 shadow-sm">
          <h2 className="schrift-anzeige mr-2 text-lg font-extrabold text-slate-100">
            {titelZeile}
            <span className="ml-2 text-xs font-semibold text-slate-500">{sichtbar.length}</span>
          </h2>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Cup suchen …')}
            className="w-full max-w-[200px] rounded-full border border-zinc-700 bg-zinc-950 px-4 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500" />
          <div className="flex flex-wrap gap-1.5">
            {TYPEN.map(([k, titel]) => (
              <button key={k} type="button" onClick={() => setTyp(typ === k ? '' : k)} className={chip(typ === k)}>{titel}</button>
            ))}
          </div>
          {zugang.admin && (
            <Link href="/admin/alte-maps" className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-200 transition hover:border-amber-300">
              <T>Alte Maps verwalten</T> →
            </Link>
          )}
          <div className="ml-auto flex gap-1.5">
            {([['kacheln', t('Kacheln')], ['liste', t('Liste')]] as const).map(([k, titel]) => (
              <button key={k} type="button" onClick={() => { setAnsicht(k); try { localStorage.setItem('maps_ansicht', k); } catch { /* ohne Speicher */ } }} className={chip(ansicht === k)}>{titel}</button>
            ))}
          </div>
        </div>

        {fehler && (
          <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            <T>Die Maps ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T>
          </p>
        )}
        {eintraege === null && !fehler && <div className="mt-10"><LadeSchirm /></div>}

        {eintraege && offen && offen.n === 0 && (
          <p className="mt-8 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-500">
            <T>Für dieses Kapitel liegen noch keine Karten vor.</T>
          </p>
        )}
        {eintraege && offen && offen.n > 0 && sichtbar.length === 0 && nurEigene.length === 0 && (
          <p className="mt-8 text-sm text-slate-500"><T>Keine Map gefunden.</T></p>
        )}

        {ansicht === 'kacheln' ? (
          <div key={`${kapitel}|${saison}|${typ}|${suche}`} className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sichtbar.map((e, i) => <Kachel key={`${e.turnierId}|${e.region}|${e.windowId}`} e={e} i={i} />)}
            {nurEigene.map((k, i) => <EigeneKachel key={k.id} k={k} i={sichtbar.length + i} />)}
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm">
            {sichtbar.map((e) => (
              <li key={`${e.turnierId}|${e.region}|${e.windowId}`}>
                <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-sky-500/[0.07]">
                  <span className="w-24 shrink-0 text-[11px] tabular-nums text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</span>
                  <span className="w-9 shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-center text-[10px] font-bold text-slate-300">{regionAnzeige(e)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{e.titel}</span>
                  <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{e.saisonKurz}</span>
                  <span aria-hidden className="text-slate-600">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
