'use client';

/*
 * Verwaltung der alten Maps - eine eigene Seite mit eigenem Menü, getrennt vom Karten-Werkzeug.
 *
 * Der Betreiber (13.10.2026): "die Edit-Menü muss komplett extra Seite und extra Menü für solche Maps sein ... da kann ich nur
 * Teams erstellen, löschen, bearbeiten, genauso wie die Formen, mehr nicht - und für jede einzelne Map das Einzelne machen,
 * Leaderboard auch von Hand." Links die Kapitel und Saisons, rechts die Karten der Auswahl mit ihren Zahlen (Formen, Teams,
 * Platzierungen); von hier aus legt man Events an, versteckt sie oder öffnet den Editor (bearbeiten/page.tsx).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; saison: string; saisonKurz: string; eventId: string | null; reihe?: number; lan?: boolean; versteckt?: boolean;
  /** Eine alte Karte ohne Landepunkte (von Hand) - sonst eine, die Noble Practice fuehrt. */
  alt?: boolean;
}
interface Saison { kennung: string; nr: number; name: string; kurz: string; kapitel: number }
interface Zahlen { formen: number; teams: number; rang: number; versteckt: boolean }

const DATUM = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Brussels' });

export default function AlteMapsVerwaltung() {
  const t = useT();
  const zugang = useZugang();
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [zahlen, setZahlen] = useState<Record<string, Zahlen>>({});
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [fehler, setFehler] = useState('');
  const [kapitel, setKapitel] = useState(0);
  const [saison, setSaison] = useState('');
  const [suche, setSuche] = useState('');
  const [nurLeere, setNurLeere] = useState(false);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState({ cup: '', fenster: '', saison: '', datum: '', lan: false });
  const [status, setStatus] = useState('');
  const [bildOffen, setBildOffen] = useState(false);
  const [bilder, setBilder] = useState<Array<{ u: string; titel: string }>>([]);
  const [bildStatus, setBildStatus] = useState('');

  const laden = () => Promise.all([
    fetch('/api/alte-maps?liste=1', { cache: 'no-store' }).then((r) => r.json()),
    fetch('/api/maps-liste', { cache: 'no-store' }).then((r) => r.json()),
  ]).then(([a, l]) => {
    if (!a?.ok) { setFehler(a?.error || 'Die Karten ließen sich nicht laden.'); return; }
    setEintraege(a.eintraege ?? []); setZahlen(a.zahlen ?? {}); setSaisons(l?.saisons ?? []); setFehler('');
  }).catch(() => setFehler('Die Karten ließen sich nicht laden.'));

  useEffect(() => { if (zugang.admin) void laden(); }, [zugang.admin]);

  const kapitelListe = useMemo(() => {
    const je = new Map<number, { nr: number; saisons: Saison[]; n: number }>();
    for (const s of saisons) {
      const k = je.get(s.kapitel) ?? { nr: s.kapitel, saisons: [], n: 0 };
      k.saisons.push(s); je.set(s.kapitel, k);
    }
    for (const e of eintraege ?? []) {
      const s = saisons.find((x) => x.kennung === e.saison);
      if (s) je.get(s.kapitel)!.n += 1;
    }
    return [...je.values()].sort((a, b) => b.nr - a.nr);
  }, [saisons, eintraege]);

  useEffect(() => {
    if (!kapitel && kapitelListe.length) setKapitel((kapitelListe.find((k) => k.n > 0) ?? kapitelListe[0]).nr);
  }, [kapitelListe, kapitel]);

  const offen = kapitelListe.find((k) => k.nr === kapitel) ?? null;
  const zahlJe = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eintraege ?? []) m.set(e.saison, (m.get(e.saison) ?? 0) + 1);
    return m;
  }, [eintraege]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const kennungen = new Set((offen?.saisons ?? []).map((s) => s.kennung));
    return (eintraege ?? []).filter((e) => kennungen.has(e.saison) && (!saison || e.saison === saison)
      && (!q || `${e.titel} ${e.saisonKurz}`.toLowerCase().includes(q))
      && (!nurLeere || ((zahlen[e.windowId]?.formen ?? 0) === 0)))
      .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0) || (b.reihe ?? 0) - (a.reihe ?? 0));
  }, [eintraege, offen, saison, suche, nurLeere, zahlen]);

  const anlegen = async () => {
    setStatus('…');
    try {
      const r = await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'neu', ...neu }) });
      const j = await r.json();
      if (!j?.ok) { setStatus(j?.error || 'Nicht gespeichert.'); return; }
      setStatus('Angelegt.'); setNeu({ ...neu, fenster: '' });
      await laden();
    } catch { setStatus('Nicht gespeichert.'); }
  };

  /** Das Inselbild fuer alle gerade angezeigten Karten setzen - sonst waeren es hundert einzelne Klicks. */
  const bilderLaden = async () => {
    setBildOffen((v) => !v); setBildStatus('');
    if (bilder.length) return;
    const j = await fetch('/api/maps-bild', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setBilder(j.auswahl ?? []);
  };
  const bildFuerAlle = async (u: string) => {
    if (!sichtbar.length || !window.confirm(`Dieses Kartenbild für alle ${sichtbar.length} angezeigten Karten setzen?`)) return;
    setBildStatus('…');
    const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: sichtbar.map((e) => e.windowId), u }) });
    const j = await r.json().catch(() => ({}));
    setBildStatus(j?.ok ? `Für ${j.gesetzt} Karten gesetzt.` : (j?.error || 'Nicht gespeichert.'));
  };

  const verstecken = async (w: string, versteckt: boolean) => {
    await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'verstecken', w, versteckt }) });
    await laden();
  };
  const loeschen = async (e: Eintrag) => {
    if (!window.confirm(`${e.titel} wirklich löschen?`)) return;
    const r = await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'loeschen', w: e.windowId }) });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) window.alert(j?.error || 'Nicht gelöscht.');
    await laden();
  };

  if (zugang.laedt) return <main className="min-h-screen bg-zinc-950"><LadeSchirm /></main>;
  if (!zugang.admin) return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-sm text-slate-400"><T>Nur für den Admin.</T></main>;

  const feld = 'rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500';
  const zeile = (e: Eintrag) => {
    const z = zahlen[e.windowId];
    const eigen = e.windowId.startsWith('alt_admin_');
    return (
      <tr key={e.windowId} className={`border-b border-white/[0.05] transition hover:bg-sky-500/[0.05] ${e.versteckt ? 'opacity-50' : ''}`}>
        <td className="px-3 py-2">
          <p className="text-[13px] font-bold text-slate-100">{e.titel.replace(/\s*·\s*/g, ' – ')}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>{e.saisonKurz}</span>
            {e.lan && <span className="rounded bg-amber-400 px-1 py-px font-black text-zinc-950">LAN</span>}
            {e.eventId && <span className="rounded bg-sky-500/15 px-1 py-px text-sky-300">Epic</span>}
            {!e.alt && <span className="rounded bg-violet-500/20 px-1 py-px text-violet-200">Noble</span>}
            {e.versteckt && <span className="rounded bg-rose-500/20 px-1 py-px text-rose-300">versteckt</span>}
          </p>
        </td>
        <td className="px-3 py-2 text-[11px] tabular-nums text-slate-400">{e.datum ? DATUM.format(new Date(e.datum)) : '—'}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-slate-300">{z?.formen ?? 0}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-slate-300">{z?.teams ?? 0}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-slate-300">{z?.rang ?? 0}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            <Link href={`/admin/alte-maps/bearbeiten?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
              className="rounded-md bg-amber-400 px-3 py-1 text-[11px] font-black text-zinc-950 transition hover:bg-amber-300"><T>Bearbeiten</T></Link>
            {!e.versteckt && (
              <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
                className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Ansehen</T></Link>
            )}
            {e.alt && (
              <button type="button" onClick={() => void verstecken(e.windowId, !e.versteckt)}
                className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:border-sky-500/60">
                {e.versteckt ? <T>Zeigen</T> : <T>Verstecken</T>}
              </button>
            )}
            {eigen && <button type="button" onClick={() => void loeschen(e)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-rose-500/15 hover:text-rose-300"><T>Löschen</T></button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/admin" className="text-[11px] font-bold uppercase tracking-wider text-slate-500 transition hover:text-sky-400">← Dashboard</Link>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl"><T>Alte Maps</T></h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400"><T>Hier pflegst du die Karten von Hand: Landepunkte, Teams und Leaderboard je Karte - ohne etwas zu laden. Auch Karten von Noble Practice stehen hier (Markierung Noble): wo dort keine Landepunkte stehen, zeichnest du sie selbst ein.</T></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/tournament-maps" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60"><T>Zur öffentlichen Übersicht</T> →</Link>
            <button type="button" onClick={() => { setNeuOffen((v) => !v); setStatus(''); if (!neu.saison && saison) setNeu((n) => ({ ...n, saison })); }}
              className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-950 transition hover:bg-amber-300">+ <T>Event anlegen</T></button>
          </div>
        </div>

        {neuOffen && (
          <div className="mt-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4">
            <p className="text-xs text-slate-400"><T>Ein Event anlegen. Danach öffnest du es mit „Bearbeiten“ und zeichnest Formen, Teams und Leaderboard ein.</T></p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto]">
              <input value={neu.cup} onChange={(e) => setNeu({ ...neu, cup: e.target.value })} list="alte-cups" placeholder={t('Cup, z. B. Elite Cup')} className={feld} />
              <datalist id="alte-cups">{[...new Set((eintraege ?? []).map((x) => x.cup))].slice(0, 100).map((c) => <option key={c} value={c} />)}</datalist>
              <input value={neu.fenster} onChange={(e) => setNeu({ ...neu, fenster: e.target.value })} placeholder={t('Spieltag, z. B. Week 3 - Finals')} className={feld} />
              <select value={neu.saison} onChange={(e) => setNeu({ ...neu, saison: e.target.value })} className={feld}>
                <option value="">{t('Saison wählen')}</option>
                {[...saisons].reverse().map((s) => <option key={s.kennung} value={s.kennung}>{s.name}</option>)}
              </select>
              <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })} className={feld} />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={neu.lan} onChange={(e) => setNeu({ ...neu, lan: e.target.checked })} /> LAN</label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" disabled={!neu.cup.trim() || !neu.fenster.trim() || !neu.saison} onClick={() => void anlegen()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-sky-100 disabled:opacity-40"><T>Anlegen</T></button>
              {status && <span className="text-xs text-slate-400">{status}</span>}
            </div>
          </div>
        )}

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!eintraege && !fehler && <div className="mt-10"><LadeSchirm /></div>}

        {eintraege && (
          <div className="mt-6 flex flex-col gap-5 lg:flex-row">
            {/* ------------------------------------------------- Menü */}
            <nav className="shrink-0 lg:w-[230px]">
              <ul className="space-y-1">
                {kapitelListe.map((k) => (
                  <li key={k.nr}>
                    <button type="button" onClick={() => { setKapitel(k.nr); setSaison(''); }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold transition ${k.nr === kapitel ? 'bg-white text-zinc-900' : 'text-slate-300 hover:bg-white/[0.06]'}`}>
                      <span>Chapter {k.nr}</span><span className={`text-xs tabular-nums ${k.nr === kapitel ? 'text-zinc-600' : 'text-slate-500'}`}>{k.n}</span>
                    </button>
                    {k.nr === kapitel && (
                      <ul className="mb-1 mt-1 space-y-0.5 pl-3">
                        <li><button type="button" onClick={() => setSaison('')} className={`w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider ${saison === '' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:bg-white/[0.05]'}`}><T>Alle</T></button></li>
                        {k.saisons.map((s) => (
                          <li key={s.kennung}>
                            <button type="button" onClick={() => setSaison(s.kennung)}
                              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider ${saison === s.kennung ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:bg-white/[0.05]'}`}>
                              <span>{s.kurz}</span><span className="tabular-nums text-slate-600">{zahlJe.get(s.kennung) ?? 0}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            {/* ------------------------------------------------- Karten */}
            <section className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-black uppercase tracking-wide">
                  {saison ? (saisons.find((s) => s.kennung === saison)?.name ?? '') : (kapitel ? `Chapter ${kapitel}` : '')}
                  <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-slate-500">{sichtbar.length}</span>
                </h2>
                <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Karte suchen …')} className={`${feld} w-full max-w-[220px]`} />
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-400"><input type="checkbox" checked={nurLeere} onChange={(e) => setNurLeere(e.target.checked)} /> <T>nur ohne Formen</T></label>
                <button type="button" onClick={() => void bilderLaden()} disabled={!sichtbar.length}
                  className="ml-auto rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60 disabled:opacity-40"><T>Kartenbild für alle hier setzen</T></button>
              </div>
              {bildOffen && (
                <div className="mb-3 rounded-xl border border-white/[0.08] bg-black/30 p-2">
                  <p className="mb-2 px-1 text-[11px] text-slate-400"><T>Eine Insel auswählen - sie gilt danach für alle angezeigten Karten. Einzelne änderst du später im Editor.</T> {bildStatus && <span className="ml-2 font-semibold text-sky-300">{bildStatus}</span>}</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
                    {bilder.map((a) => (
                      <button key={a.u} type="button" title={a.titel} onClick={() => void bildFuerAlle(a.u)}
                        className="overflow-hidden rounded-lg border border-white/10 text-left transition hover:border-sky-500/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{a.titel}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sichtbar.length === 0 ? (
                <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-500"><T>Hier steht noch nichts. Mit „Event anlegen“ kommt die erste Karte dazu.</T></p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900/40">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-3 py-2"><T>Karte</T></th><th className="px-3 py-2"><T>Datum</T></th>
                        <th className="px-3 py-2 text-center"><T>Formen</T></th><th className="px-3 py-2 text-center">Teams</th><th className="px-3 py-2 text-center"><T>Platzierungen</T></th><th />
                      </tr>
                    </thead>
                    <tbody>{sichtbar.map(zeile)}</tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
