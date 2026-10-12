'use client';

/*
 * Maps - die Karten aller Cups, nach Saison und Art sortierbar.
 *
 * Der Betreiber (12.10.2026): "du hast Maps von jeder einzelnen Season und jedem einzelnen Cup" - mit Bild, Datum,
 * Region und Tag; sortierbar ueber FNCS, Performance, Division und Reload; als Kacheln oder Liste; und beim Klick die
 * Karte dazu. Die Karten kommen von Noble Practice (lib/mapsVerzeichnis); dazu die vom Betreiber selbst gelegten
 * Karten (/api/turnier-karten), wo es sie gibt. Was die Quelle nicht kennt, steht hier nicht - und das sagt die Seite.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';

type Typ = 'fncs' | 'performance' | 'division' | 'reload' | 'sonst';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; saison: string; saisonKurz: string; saisonName: string; typ: Typ; bild: string | null;
}
interface Eigene {
  id: string; titel: string; region: string | null; windowId: string | null; datum: number | null; bild: string | null;
}

const TYPEN: Array<[Typ | 'alle', string]> = [
  ['alle', 'Alle'], ['fncs', 'FNCS'], ['performance', 'Performance'], ['division', 'Division'], ['reload', 'Reload'],
];

const DATUM = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

const CSS = `
@keyframes mp-rein { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
.mp-glas { border: 1px solid rgba(255,255,255,.09); background: linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.015));
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 10px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05); }
@media (prefers-reduced-motion: reduce) { .mp-an { animation: none !important; } }
`;

/** "Performance Evaluation Cup · Event 1 · Round 2 · Finals" -> in Grossbuchstaben, mit Gedankenstrichen. */
const einfach = (titel: string) => titel.replace(/\s*·\s*/g, ' – ').toUpperCase();

function Kachel({ e, i }: { e: Eintrag; i: number }) {
  return (
    <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
      className="mp-an group overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/50 transition hover:-translate-y-0.5 hover:border-sky-500 hover:bg-zinc-900"
      style={{ animation: `mp-rein .5s ${Math.min(i, 14) * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
      <div className="relative aspect-video overflow-hidden bg-zinc-900">
        {e.bild ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(e.bild)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950 text-3xl font-black text-sky-500/40">MAP</div>
        )}
        <span className="absolute left-2 top-2 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">
          {e.saisonKurz || '—'}
        </span>
        <span className="absolute right-2 top-2 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">
          {e.region}
        </span>
      </div>
      <div className="px-3 pb-3 pt-2.5 text-center">
        <p className="min-h-[2.6em] text-[13px] font-bold leading-snug tracking-wide text-slate-100">{einfach(e.titel)}</p>
        <p className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[11px] text-slate-500">
          {e.datum ? DATUM.format(new Date(e.datum)) : ''}{e.datum ? ' · ' : ''}{e.fenster}
        </p>
      </div>
    </Link>
  );
}

function EigeneKachel({ k, i }: { k: Eigene; i: number }) {
  return (
    <Link href={`/maps?id=${encodeURIComponent(k.id)}`}
      className="mp-an group overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/50 transition hover:-translate-y-0.5 hover:border-sky-500 hover:bg-zinc-900"
      style={{ animation: `mp-rein .5s ${Math.min(i, 14) * 40}ms cubic-bezier(.2,.8,.2,1) both` }}>
      <div className="relative aspect-video overflow-hidden bg-zinc-900">
        {k.bild ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={k.bild} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-950 via-zinc-900 to-zinc-950 text-3xl font-black text-sky-500/40">MAP</div>}
        {k.region && k.region !== 'GLOBAL' && (
          <span className="absolute right-2 top-2 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-100 backdrop-blur-sm">{k.region}</span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5 text-center">
        <p className="min-h-[2.6em] text-[13px] font-bold leading-snug tracking-wide text-slate-100">{einfach(k.titel)}</p>
        <p className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[11px] text-slate-500">{k.datum ? DATUM.format(new Date(k.datum)) : ''}</p>
      </div>
    </Link>
  );
}

export default function Maps() {
  const t = useT();
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [eigene, setEigene] = useState<Eigene[]>([]);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState<Typ | 'alle'>('alle');
  const [saison, setSaison] = useState('');
  const [ansicht, setAnsicht] = useState<'kacheln' | 'liste'>('kacheln');

  // Aus der Startseite: /tournament-maps?typ=performance
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get('typ');
    if (w && TYPEN.some(([k]) => k === w)) setTyp(w as Typ);
    try { const a = localStorage.getItem('maps_ansicht'); if (a === 'liste' || a === 'kacheln') setAnsicht(a); } catch { /* ohne Speicher */ }
  }, []);

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste')
      .then((r) => r.json())
      .then((j) => { if (!weg) { if (j?.ok) setEintraege(j.eintraege); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    fetch('/api/turnier-karten?liste=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!weg && Array.isArray(j?.karten)) setEigene(j.karten); })
      .catch(() => { /* ohne eigene Karten bleibt es bei Noble */ });
    return () => { weg = true; };
  }, []);

  const ansichtWaehlen = (a: 'kacheln' | 'liste') => {
    setAnsicht(a);
    try { localStorage.setItem('maps_ansicht', a); } catch { /* ohne Speicher */ }
  };

  const saisons = useMemo(() => {
    const m = new Map<string, { kurz: string; name: string; n: number }>();
    for (const e of eintraege ?? []) {
      if (!e.saison) continue;
      const z = m.get(e.saison) ?? { kurz: e.saisonKurz, name: e.saisonName, n: 0 };
      z.n += 1; m.set(e.saison, z);
    }
    return [...m.entries()].sort((a, b) => Number(b[0].slice(1)) - Number(a[0].slice(1)));
  }, [eintraege]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (eintraege ?? []).filter((e) => (typ === 'alle' || e.typ === typ)
      && (!saison || e.saison === saison)
      && (!q || `${e.titel} ${e.cup} ${e.fenster} ${e.region} ${e.saisonKurz}`.toLowerCase().includes(q)));
  }, [eintraege, typ, saison, suche]);

  // Die eigenen Karten, die Noble nicht kennt - nur ohne Saison- oder Artfilter, sonst passen sie nicht dazu.
  const nobleFenster = useMemo(() => new Set((eintraege ?? []).map((e) => e.windowId)), [eintraege]);
  const nurEigene = useMemo(() => {
    if (typ !== 'alle' || saison) return [];
    const q = suche.trim().toLowerCase();
    return eigene.filter((k) => !(k.windowId && nobleFenster.has(k.windowId)) && (!q || `${k.titel} ${k.region ?? ''}`.toLowerCase().includes(q)));
  }, [eigene, nobleFenster, typ, saison, suche]);

  // Nach Saison gruppiert (neueste zuerst); ohne Saison am Ende.
  const gruppen = useMemo(() => {
    const m = new Map<string, Eintrag[]>();
    for (const e of sichtbar) { const k = e.saison || '—'; (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
    return [...m.entries()].sort((a, b) => (Number(b[0].slice(1)) || -1) - (Number(a[0].slice(1)) || -1));
  }, [sichtbar]);

  const chip = (an: boolean) => `rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${an
    ? 'bg-sky-500 text-white' : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <style>{CSS}</style>
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-[820px] -translate-x-1/2 rounded-full bg-sky-500/[0.08] blur-[110px]" />
        <div className="relative mx-auto max-w-[1300px] px-4 py-10">
          <h1 className="text-5xl font-black uppercase tracking-tight sm:text-6xl">Maps</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            <T>Wo die Teams gelandet sind — jeder Cup, jede Saison. Karten gibt es für alle Cups, die Noble Practice führt (Europa, seit Juli 2025).</T>
          </p>
          {eintraege && (
            <div className="mt-5 flex flex-wrap gap-6 text-sm">
              <p><span className="text-3xl font-black tabular-nums text-sky-400">{eintraege.length.toLocaleString('de-DE')}</span> <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Karten</T></span></p>
              <p><span className="text-3xl font-black tabular-nums text-sky-400">{saisons.length}</span> <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Saisons</T></span></p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <div className="mp-glas flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Cup suchen …')}
            className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
          <div className="flex flex-wrap gap-1.5">
            {TYPEN.map(([k, titel]) => (
              <button key={k} type="button" onClick={() => setTyp(k)} className={chip(typ === k)}>{k === 'alle' ? <T>Alle</T> : titel}</button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            {([['kacheln', 'Kacheln'], ['liste', 'Liste']] as const).map(([k, titel]) => (
              <button key={k} type="button" onClick={() => ansichtWaehlen(k)} className={chip(ansicht === k)}><T>{titel}</T></button>
            ))}
          </div>
        </div>

        {saisons.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button type="button" onClick={() => setSaison('')} className={`${chip(saison === '')} shrink-0`}><T>Alle Saisons</T></button>
            {saisons.map(([k, s]) => (
              <button key={k} type="button" onClick={() => setSaison(k)} title={s.name} className={`${chip(saison === k)} shrink-0`}>{s.kurz}</button>
            ))}
          </div>
        )}

        {fehler && (
          <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            <T>Die Maps ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T>
          </p>
        )}
        {eintraege === null && !fehler && <div className="mt-10"><LadeSchirm /></div>}
        {eintraege && sichtbar.length === 0 && nurEigene.length === 0 && (
          <p className="mt-8 text-sm text-slate-500"><T>Keine Map gefunden.</T></p>
        )}

        {gruppen.map(([k, liste]) => (
          <section key={k} className="mt-8">
            <h2 className="mb-3 flex items-baseline gap-3 text-lg font-black uppercase tracking-wide text-slate-100">
              {liste[0].saisonName || t('Ohne Saison')}
              <span className="text-xs font-semibold normal-case tracking-normal text-slate-500">{liste.length}</span>
            </h2>
            {ansicht === 'kacheln' ? (
              <div key={`${typ}|${saison}|${suche}`} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {liste.map((e, i) => <Kachel key={`${e.turnierId}|${e.region}|${e.windowId}`} e={e} i={i} />)}
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
                {liste.map((e) => (
                  <li key={`${e.turnierId}|${e.region}|${e.windowId}`}>
                    <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-sky-500/[0.07]">
                      <span className="w-14 shrink-0 text-[11px] tabular-nums text-slate-500">{e.datum ? DATUM.format(new Date(e.datum)) : ''}</span>
                      <span className="w-9 shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-center text-[10px] font-bold text-slate-300">{e.region}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{e.titel}</span>
                      <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{e.fenster}</span>
                      <span aria-hidden className="text-slate-600">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {nurEigene.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-black uppercase tracking-wide text-slate-100"><T>Weitere Karten</T> <span className="text-xs font-semibold normal-case tracking-normal text-slate-500">{nurEigene.length}</span></h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {nurEigene.map((k, i) => <EigeneKachel key={k.id} k={k} i={i} />)}
            </div>
          </section>
        )}

        {eintraege && (
          <p className="mt-10 text-[11px] leading-relaxed text-slate-600">
            <T>Die Karten kommen von Noble Practice und gibt es für die Cups, die dort geführt werden — Europa, seit Juli 2025. Für ältere Cups liegt keine Quelle vor; sie stehen hier nicht.</T>
          </p>
        )}
      </div>
    </main>
  );
}
