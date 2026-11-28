/*
 * Verwaltung der alten Maps - eine eigene Seite mit eigenem Menü, getrennt vom Karten-Werkzeug.
 *
 * Der Betreiber (13.10.2026): "die Edit-Menü muss komplett extra Seite und extra Menü für solche Maps sein ... da kann ich nur
 * Teams erstellen, löschen, bearbeiten, genauso wie die Formen, mehr nicht - und für jede einzelne Map das Einzelne machen,
 * Leaderboard auch von Hand." Links die Kapitel und Saisons, rechts die Karten der Auswahl mit ihren Zahlen (Formen, Teams,
 * Platzierungen); von hier aus legt man Events an, versteckt sie oder öffnet den Editor (bearbeiten/page.tsx).
 */

import NurAdminSeite from '../port/app/components/NurAdminSeite';
import { useEffect, useMemo, useState } from 'react';
import KartenUpdateWahl from '../port/app/components/KartenUpdateWahl';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import { useT } from '../port/app/components/SprachProvider';
import LadeSchirm from '../port/app/components/LadeSchirm';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useZugang } from '../port/app/lib/zugang';

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
    if (!a?.ok) { setFehler(a?.error || 'The maps could not be loaded.'); return; }
    setEintraege(a.eintraege ?? []); setZahlen(a.zahlen ?? {}); setSaisons(l?.saisons ?? []); setFehler('');
  }).catch(() => setFehler('The maps could not be loaded.'));

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
      if (!j?.ok) { setStatus(j?.error || 'Not saved.'); return; }
      setStatus('Created.'); setNeu({ ...neu, fenster: '' });
      await laden();
    } catch { setStatus('Not saved.'); }
  };

  /** Das Inselbild fuer alle gerade angezeigten Karten setzen - sonst waeren es hundert einzelne Klicks. */
  const bilderLaden = async () => {
    setBildOffen((v) => !v); setBildStatus('');
    if (bilder.length) return;
    const j = await fetch('/api/maps-bild', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setBilder(j.auswahl ?? []);
  };
  const bildFuerAlle = async (u: string) => {
    if (!sichtbar.length || !window.confirm(`Set this map image for all ${sichtbar.length} shown maps?`)) return;
    setBildStatus('…');
    const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: sichtbar.map((e) => e.windowId), u }) });
    const j = await r.json().catch(() => ({}));
    setBildStatus(j?.ok ? `Set for ${j.gesetzt} maps.` : (j?.error || 'Not saved.'));
  };

  const verstecken = async (w: string, versteckt: boolean) => {
    await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'verstecken', w, versteckt }) });
    await laden();
  };
  const loeschen = async (e: Eintrag) => {
    if (!window.confirm(`Really delete ${e.titel}?`)) return;
    const r = await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'loeschen', w: e.windowId }) });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) window.alert(j?.error || 'Not deleted.');
    await laden();
  };

  if (zugang.laedt) return <main className=""><LadeSchirm /></main>;
  if (!zugang.admin) return <NurAdminSeite />;

  const feld = 'rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-akz';
  const zeile = (e: Eintrag) => {
    const z = zahlen[e.windowId];
    const eigen = e.windowId.startsWith('alt_admin_');
    return (
      <tr key={e.windowId} className={`border-b border-white/[0.05] transition hover:bg-akz/[0.05] ${e.versteckt ? 'opacity-50' : ''}`}>
        <td className="px-3 py-2">
          <p className="text-[13px] font-bold text-white">{e.titel.replace(/\s*·\s*/g, ' – ')}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            <span>{e.saisonKurz}</span>
            {e.lan && <span className="rounded bg-amber-400 px-1 py-px font-black text-black">LAN</span>}
            {e.eventId && <span className="rounded bg-akz/15 px-1 py-px text-akz">Epic</span>}
            {!e.alt && <span className="rounded bg-violet-500/20 px-1 py-px text-violet-200">Noble</span>}
            {e.versteckt && <span className="rounded bg-rose-500/20 px-1 py-px text-rose-300">hidden</span>}
          </p>
        </td>
        <td className="px-3 py-2 text-[11px] tabular-nums text-white/55">{e.datum ? DATUM.format(new Date(e.datum)) : '—'}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-white/70">{z?.formen ?? 0}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-white/70">{z?.teams ?? 0}</td>
        <td className="px-3 py-2 text-center text-xs tabular-nums text-white/70">{z?.rang ?? 0}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            <Link href={`/admin/alte-maps/bearbeiten?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
              className="rounded-full bg-akz px-3.5 py-1 text-[11px] font-bold text-[#04050a] transition hover:brightness-110"><T>Bearbeiten</T></Link>
            {!e.versteckt && (
              <Link href={`/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/70 transition hover:border-akz hover:text-akz"><T>View</T></Link>
            )}
            {e.alt && (
              <button type="button" onClick={() => void verstecken(e.windowId, !e.versteckt)}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/55 transition hover:border-akz hover:text-akz">
                {e.versteckt ? <T>Zeigen</T> : 'Hide'}
              </button>
            )}
            {eigen && <button type="button" onClick={() => void loeschen(e)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-white/30 transition hover:bg-rose-500/15 hover:text-rose-300"><T>Löschen</T></button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <main className="text-white">
      <div>
        <SeitenKopf marke="Content" titel={<T>Old maps</T>}
          text={<T>Maintain maps by hand here: drop spots, teams and leaderboard per map - without loading anything. Maps from Noble Practice are here too (marked Noble): where they have no drop spots, draw them yourself.</T>}
          rechts={<>
            <Link href="/tournament-maps" className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-bold text-white/70 transition hover:border-akz hover:text-akz"><T>To the public overview</T> →</Link>
            <button type="button" onClick={() => { setNeuOffen((v) => !v); setStatus(''); if (!neu.saison && saison) setNeu((n) => ({ ...n, saison })); }}
              className="rounded-full bg-akz px-5 py-1.5 text-xs font-bold text-[#04050a] transition hover:brightness-110">+ <T>Create event</T></button>
          </>} />

        {neuOffen && (
          <div className="mt-4 fl p-5">
            <p className="text-xs text-white/55"><T>Create an event. Then open it with “Edit” and draw shapes, teams and leaderboard.</T></p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto]">
              <input value={neu.cup} onChange={(e) => setNeu({ ...neu, cup: e.target.value })} list="alte-cups" placeholder={t('Cup, z. B. Elite Cup')} className={feld} />
              <datalist id="alte-cups">{[...new Set((eintraege ?? []).map((x) => x.cup))].slice(0, 100).map((c) => <option key={c} value={c} />)}</datalist>
              <input value={neu.fenster} onChange={(e) => setNeu({ ...neu, fenster: e.target.value })} placeholder={t('Match day, e.g. Week 3 - Finals')} className={feld} />
              <select value={neu.saison} onChange={(e) => setNeu({ ...neu, saison: e.target.value })} className={feld}>
                <option value="">{t('Pick season')}</option>
                {[...saisons].reverse().map((s) => <option key={s.kennung} value={s.kennung}>{s.name}</option>)}
              </select>
              <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })} className={feld} />
              <label className="flex items-center gap-2 text-xs font-semibold text-white/70"><input type="checkbox" checked={neu.lan} onChange={(e) => setNeu({ ...neu, lan: e.target.checked })} /> LAN</label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" disabled={!neu.cup.trim() || !neu.fenster.trim() || !neu.saison} onClick={() => void anlegen()}
                className="rounded-full bg-akz px-5 py-2 text-sm font-bold text-[#04050a] transition hover:brightness-110 disabled:opacity-40"><T>Anlegen</T></button>
              {status && <span className="text-xs text-white/55">{status}</span>}
            </div>
          </div>
        )}

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!eintraege && !fehler && <div className="mt-10"><LadeSchirm /></div>}

        {eintraege && (
          <div className="mt-6 flex flex-col gap-5 lg:flex-row">
            {/* ------------------------------------------------- Menü */}
            <nav className="h-fit shrink-0 fl p-2.5 lg:w-[240px]">
              <ul className="space-y-1">
                {kapitelListe.map((k) => (
                  <li key={k.nr}>
                    <button type="button" onClick={() => { setKapitel(k.nr); setSaison(''); }}
                      className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-left text-sm font-bold transition ${k.nr === kapitel ? 'bg-akz text-[#04050a] shadow' : 'text-white/70 hover:bg-white/[0.08]'}`}>
                      <span>Chapter {k.nr}</span><span className={`text-xs tabular-nums ${k.nr === kapitel ? 'text-akz' : 'text-white/40'}`}>{k.n}</span>
                    </button>
                    {k.nr === kapitel && (
                      <ul className="mb-1 mt-1 space-y-0.5 pl-3">
                        <li><button type="button" onClick={() => setSaison('')} className={`w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider ${saison === '' ? 'bg-akz/15 text-akz' : 'text-white/55 hover:bg-white/[0.08]'}`}><T>Alle</T></button></li>
                        {k.saisons.map((s) => (
                          <li key={s.kennung}>
                            <button type="button" onClick={() => setSaison(s.kennung)}
                              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider ${saison === s.kennung ? 'bg-akz/15 text-akz' : 'text-white/55 hover:bg-white/[0.08]'}`}>
                              <span>{s.kurz}</span><span className="tabular-nums text-white/30">{zahlJe.get(s.kennung) ?? 0}</span>
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
                <h2 className="text-xl font-extrabold tracking-tight">
                  {saison ? (saisons.find((s) => s.kennung === saison)?.name ?? '') : (kapitel ? `Chapter ${kapitel}` : '')}
                  <span className="ml-2 text-xs font-semibold normal-case tracking-normal text-white/40">{sichtbar.length}</span>
                </h2>
                <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Search map …')} className={`${feld} w-full max-w-[220px]`} />
                <label className="flex items-center gap-2 text-xs font-semibold text-white/55"><input type="checkbox" checked={nurLeere} onChange={(e) => setNurLeere(e.target.checked)} /> <T>only without shapes</T></label>
                <button type="button" onClick={() => void bilderLaden()} disabled={!sichtbar.length}
                  className="ml-auto rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/85 transition hover:border-akz hover:text-akz disabled:opacity-40"><T>Set map image for all here</T></button>
              </div>
              {bildOffen && (
                <div className="mb-3 rounded-xl border border-white/[0.08] bg-black/30 p-2">
                  <p className="mb-2 px-1 text-[11px] text-white/55"><T>Pick an island - it then applies to all shown maps. Change single ones later in the editor.</T> {bildStatus && <span className="ml-2 font-semibold text-akz">{bildStatus}</span>}</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
                    {bilder.map((a) => (
                      <button key={a.u} type="button" title={a.titel} onClick={() => void bildFuerAlle(a.u)}
                        className="overflow-hidden rounded-lg border border-white/10 text-left transition hover:border-akz/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/55">{a.titel}</span>
                      </button>
                    ))}
                  </div>
                  <KartenUpdateWahl aktuell={null} vorgabe={saison ? saisons.find((s) => s.kennung === saison)?.kurz : undefined}
                    waehle={(u) => void bildFuerAlle(u)} />
                </div>
              )}
              {sichtbar.length === 0 ? (
                <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center text-sm text-white/40"><T>Nothing here yet. “Create event” adds the first map.</T></p>
              ) : (
                <div className="overflow-x-auto fl">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
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
