'use client';

/*
 * Die Seite eines Cups: Karte, Spieler, Leaderboard, Tierlist, Länder - und oben die Wochen zum Umschalten.
 *
 * Der Betreiber (12.10.2026): beim Klick auf einen Cup kommt die Karte mit den Reitern MAP, PLAYERS, LEADERBOARD,
 * TIERLIST, NATIONALITIES; oben stehen alle Spieltage des Cups ("Week 1 - Finals 23.08 ..."), und man wechselt direkt
 * von einem zum anderen. Die Karte muss die richtige zur Spielversion sein (bei Reload die Reload-Karte) - und der
 * Admin kann sie ändern. Alles aus dem Werkzeug selbst (/api/maps-karte, /api/maps-liste, /api/maps-bild).
 *
 * 13.10.2026: neben der Karte steht die Bestenliste (wie beim Vorbild), der Statistik-Reiter ist weg, und ein Finale an zwei
 * Tagen ist eine Karte mit Umschalter Day 1 / Day 2 / Combined.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { regionAnzeige } from '@/lib/regionFarbe';
import type { SolosFenster } from '@/lib/globalsSolos';
import { Karte } from '@/app/globals-solos/Bausteine';
import LaenderListe from '@/app/components/LaenderListe';
import { TeamKarten, RangTabelle, RangAusTeams, Platzierungen, type PlatzZeile } from './Mannschaften';
import CupTierlist from './CupTierlist';
import KartenUpdateWahl from '@/app/components/KartenUpdateWahl';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; ende: number | null; saison: string; saisonKurz: string; saisonName: string; bild: string | null; eventId: string | null;
  reihe?: number; lan?: boolean; alt?: boolean; saisonTitel?: string; epicFenster?: string;
  tage?: Array<{ name: string; windowId: string; eventId: string | null }>;
}

const KURZ = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' });
const LANG = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

type Reiter = 'karte' | 'spieler' | 'leaderboard' | 'tierlist' | 'laender';
const REITER: Array<[Reiter, string]> = [
  ['karte', 'Landepunkte'], ['spieler', 'Teams'], ['leaderboard', 'Rangliste'], ['tierlist', 'Tierlist'], ['laender', 'Länder'],
];

/** Beendet, laufend oder kommend - aus Beginn und Ende des Spieltags. */
function stand(e: { datum: number | null; ende: number | null } | null, f: SolosFenster | null): 'ended' | 'live' | 'upcoming' | null {
  const beginn = e?.datum ?? (f?.start ? Date.parse(f.start) : null);
  const ende = e?.ende ?? (f?.end ? Date.parse(f.end) : null);
  const jetzt = Date.now();
  if (!beginn) return null;
  if (jetzt < beginn) return 'upcoming';
  if (ende && jetzt > ende) return 'ended';
  if (!ende) return jetzt - beginn > 12 * 3600_000 ? 'ended' : 'live';
  return 'live';
}

export default function KartenSeite() {
  const t = useT();
  const zugang = useZugang();
  const [params, setParams] = useState<{ t: string; r: string; w: string } | null>(null);
  const [fenster, setFenster] = useState<SolosFenster | null>(null);
  /** Bei einem Finale an zwei Tagen: welcher Tag gerade gilt ("gesamt", "1", "2"). */
  const [tag, setTag] = useState('gesamt');
  const [tage, setTage] = useState<Array<{ name: string; windowId: string }>>([]);
  /** Die ersten Plaetze eines FNCS-Endspiels (Eckdaten) - fuer Events, zu denen Epic keine Bestenliste mehr fuehrt. */
  const [platzierungen, setPlatzierungen] = useState<PlatzZeile[]>([]);
  /** Gibt es zu diesem Spieltag ausgewertete Replays (Seite /replays)? */
  const [hatReplays, setHatReplays] = useState(false);
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [fehler, setFehler] = useState('');
  const [reiter, setReiter] = useState<Reiter>('karte');
  const [wahlBild, setWahlBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [speichert, setSpeichert] = useState(false);
  const [bilderOffen, setBilderOffen] = useState(false);
  /** Das gewaehlte Bild fuer alle Spieltage der Saison uebernehmen, nicht nur fuer diesen. */
  const [fuerSaison, setFuerSaison] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const [tid, r, w] = [p.get('t') ?? '', p.get('r') ?? '', p.get('w') ?? ''];
    if (!tid || !r || !w) { setFehler('Diese Karte ist nicht angegeben.'); return; }
    setParams({ t: tid, r, w });
  }, []);

  // Ein anderer Spieltag: alles zurueck auf Anfang (die Karte wird neu geholt, der Tag steht wieder auf "gesamt").
  useEffect(() => {
    if (!params) return;
    setFenster(null); setFehler(''); setTag('gesamt'); setTage([]); setPlatzierungen([]);
  }, [params]);

  // Die Karte samt Teams - ein anderer Tag holt nur die Teams neu, die Karte bleibt stehen.
  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    fetch(`/api/maps-karte?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}&tag=${encodeURIComponent(tag)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (weg) return; if (j?.ok) { setFenster(j.fenster); setTage(j.tage ?? []); setPlatzierungen(j.platzierungen ?? []); } else setFehler(j?.error || 'Die Karte ließ sich nicht laden.'); })
      .catch(() => { if (!weg) setFehler('Die Karte ließ sich nicht laden.'); });
    return () => { weg = true; };
  }, [params, tag]);

  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    fetch(`/api/maps-bild?w=${encodeURIComponent(params.w)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (!weg && j?.ok) { setWahlBild(j.u ?? null); setAuswahl(j.auswahl ?? []); } })
      .catch(() => { /* ohne Wahl gilt das Bild der Spielversion */ });
    return () => { weg = true; };
  }, [params]);

  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    setHatReplays(false);
    fetch(`/api/replay?tag=${encodeURIComponent(params.w)}`).then((x) => { if (!weg && x.ok) setHatReplays(true); }).catch(() => { /* ohne Auskunft kein Knopf */ });
    return () => { weg = true; };
  }, [params]);

  useEffect(() => {
    let weg = false;
    fetch('/api/maps-liste').then((x) => x.json())
      .then((j) => { if (!weg && j?.ok) setListe(j.eintraege); })
      .catch(() => { /* ohne Verzeichnis fehlen Kopf und Wochen */ });
    return () => { weg = true; };
  }, []);

  const meta = useMemo(() => liste.find((e) => params && e.windowId === params.w && e.region === params.r) ?? null, [liste, params]);
  const wochen = useMemo(
    () => liste.filter((e) => meta && e.turnierId === meta.turnierId && e.region === meta.region).sort((a, b) => (a.alt && b.alt ? 0 : (a.datum ?? 0) - (b.datum ?? 0)) || (a.reihe ?? 0) - (b.reihe ?? 0)),
    [liste, meta],
  );
  const laender = useMemo(() => new Map((fenster?.spieler ?? []).map((s) => [s.id, s.land])), [fenster]);
  const bild = wahlBild ?? fenster?.bild ?? null;
  const zustand = stand(meta, fenster);
  /** Gibt es zu dieser Karte keine Bestenliste (weder Epic noch vom Admin), stehen die ersten Plaetze aus den Eckdaten da. */
  const nurPlatzierungen = platzierungen.length > 0 && !(fenster?.teams ?? []).some((x) => x.rang != null) && !(!meta?.alt && meta?.eventId);
  /** Welche Epic-Fenster die Bestenliste gerade zusammenrechnet: bei zwei Tagen alle ("gesamt") oder der gewaehlte. */
  const tageFenster = useMemo(() => {
    if (tage.length < 2) return [] as string[];
    const nr = Number(tag);
    return Number.isInteger(nr) && nr >= 1 && nr <= tage.length ? [tage[nr - 1].windowId] : tage.map((d) => d.windowId);
  }, [tage, tag]);

  const bildSpeichern = useCallback(async (u: string) => {
    if (!params) return;
    setSpeichert(true);
    try {
      const ws = fuerSaison && meta?.saison ? liste.filter((e) => e.saison === meta.saison).map((e) => e.windowId) : [];
      const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ws.length ? { ws, u } : { w: params.w, u }) });
      const j = await r.json();
      if (j?.ok) setWahlBild(j.u ?? null);
    } finally { setSpeichert(false); }
  }, [params, fuerSaison, liste, meta]);

  const titelOben = meta?.cup || '';
  const chip = (an: boolean) => `rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an
    ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:bg-zinc-800 hover:text-slate-100'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <Link href={meta?.saison ? `/tournament-maps?saison=${meta.saison}` : '/tournament-maps'}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-300 shadow-sm transition hover:border-sky-500/70 hover:text-sky-500">
          ← {meta?.saisonKurz || t('Alle Maps')}
        </Link>

        {/*
          * Der Kopf (Betreiber, 14.10.2026): das Cup-Bild als Bühne unter einem festen dunklen Verlauf, Titel und Marken in fester heller
          * Schrift darauf - in der hellen wie in der dunklen Fassung gleich. Die Spieltage stehen als Reihe am unteren Rand der Bühne.
          */}
        <section className="relative isolate mt-4 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm">
          {meta?.bild && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={encodeURI(meta.bild)} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />
          )}
          <span aria-hidden className="foto-hero absolute inset-0 -z-10" />
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-end gap-5">
              {meta?.bild && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={encodeURI(meta.bild)} alt="" className="hidden h-24 w-40 rounded-xl border border-[rgba(255,255,255,.18)] object-cover shadow-xl sm:block" />
              )}
              <div className="min-w-0">
                <h1 className="schrift-anzeige text-3xl font-extrabold leading-tight tracking-tight text-[#fff] sm:text-5xl">{titelOben || fenster?.name || t('Karte')}</h1>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">
                  {meta?.lan && <span className="rounded bg-amber-400 px-1.5 py-0.5 font-black text-[#0b1220]">LAN</span>}
                  {meta?.saisonKurz && <span>{meta.saisonKurz}{meta.saisonTitel ? ` — ${meta.saisonTitel}` : ''}</span>}
                  {meta?.region && <span className="rounded bg-[rgba(255,255,255,.16)] px-1.5 py-0.5 text-[#f1f5f9]">{regionAnzeige(meta)}</span>}
                  {hatReplays && params && (
                    <Link href={`/replays/${encodeURIComponent(params.w)}`} className="rounded bg-sky-500 px-1.5 py-0.5 font-black text-[#fff] transition hover:bg-sky-400">▶ Replays</Link>
                  )}
                  {(fenster?.teams ?? []).length > 0 && <span className="rounded bg-[rgba(255,255,255,.16)] px-1.5 py-0.5 text-[#f1f5f9]">{(fenster?.teams ?? []).length} <T>Teams</T></span>}
                  {(fenster?.start || meta?.datum) && <span>{LANG.format(new Date(fenster?.start ?? (meta?.datum as number)))}</span>}
                  {zustand && (
                    <span className={`rounded px-1.5 py-0.5 ${zustand === 'live' ? 'bg-red-500/30 text-red-300' : zustand === 'upcoming' ? 'bg-sky-500/30 text-sky-200' : 'bg-[rgba(255,255,255,.12)] text-[#cbd5e1]'}`}>
                      {zustand === 'live' ? 'Live' : zustand === 'upcoming' ? 'Upcoming' : 'Ended'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {wochen.length > 1 && (
              <div className="flex flex-wrap gap-1 rounded-2xl border border-[rgba(255,255,255,.12)] bg-[rgba(6,10,18,.55)] p-1.5 backdrop-blur">
                {wochen.map((w) => (
                  /*
                   * Ein Klick wechselt den Spieltag direkt auf der Seite: Karte, Teams, Leaderboard und Tierlist werden neu
                   * geholt, die Adresse zieht nach. Als blosser Link aenderte sich nur die Adresse - der Betreiber:
                   * "es aendert was in der URL, aber es aendert die Map nicht."
                   */
                  <button key={w.windowId} type="button"
                    onClick={() => {
                      setParams({ t: w.turnierId, r: w.region, w: w.windowId });
                      window.history.replaceState(null, '', `/tournament-maps/karte?t=${encodeURIComponent(w.turnierId)}&r=${encodeURIComponent(w.region)}&w=${encodeURIComponent(w.windowId)}`);
                    }}
                    className={`rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${w.windowId === params?.w
                      ? 'bg-[#fff] text-[#0b1220]' : 'text-[#cbd5e1] hover:bg-[rgba(255,255,255,.12)] hover:text-[#fff]'}`}>
                    {w.fenster}{w.datum ? <span className="ml-1.5 font-semibold opacity-60">{KURZ.format(new Date(w.datum))}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        {fehler && !fenster && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!fenster && !fehler && <LadeSchirm />}

        {fenster && (
          <>
            <div className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-sm">
              {REITER.map(([k, tt]) => (
                <button key={k} type="button" onClick={() => setReiter(k)} className={chip(reiter === k)}><T>{tt}</T></button>
              ))}
            </div>

            {tage.length > 1 && (
              <div className="ml-3 mt-4 inline-flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-1 shadow-sm">
                {[...tage.map((d, i) => [String(i + 1), d.name] as const), ['gesamt', 'Combined'] as const].map(([k, name]) => (
                  <button key={k} type="button" onClick={() => setTag(k)} className={chip(tag === k)}>{name}</button>
                ))}
              </div>
            )}

            <div className="mt-5">
              {reiter === 'karte' && (
                <div>
                  {zugang.admin && params && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs">
                      <span className="font-semibold uppercase tracking-wider text-amber-300/90">Admin</span>
                      <Link href={`/admin/alte-maps/bearbeiten?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}`}
                        className="rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-zinc-950 transition hover:bg-amber-300">
                        <T>Diese Karte bearbeiten</T>
                      </Link>
                      <Link href="/admin/alte-maps" className="rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-slate-300 transition hover:border-sky-500/60">
                        <T>Alle alten Maps</T>
                      </Link>
                    </div>
                  )}
                  {zugang.admin && auswahl.length > 0 && (
                    <div className="mb-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold uppercase tracking-wider text-amber-300/80">Admin</span>
                        <button type="button" onClick={() => setBilderOffen((v) => !v)}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-semibold text-slate-200 transition hover:border-sky-500/60">
                          <T>Kartenbild wählen</T>
                        </button>
                        {wahlBild && (
                          <button type="button" disabled={speichert} onClick={() => void bildSpeichern('')}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300">
                            <T>Standard der Spielversion</T>
                          </button>
                        )}
                        {speichert && <span><T>Speichert …</T></span>}
                      </div>
                      {bilderOffen && (
                        <div className="mt-2 grid grid-cols-4 gap-2 rounded-xl border border-white/[0.08] bg-black/30 p-2 sm:grid-cols-6 lg:grid-cols-8">
                          {auswahl.map((a) => (
                            <button key={a.u} type="button" disabled={speichert} title={a.titel}
                              onClick={() => { void bildSpeichern(a.u); setBilderOffen(false); }}
                              className={`group overflow-hidden rounded-lg border text-left transition ${wahlBild === a.u ? 'border-sky-400' : 'border-white/10 hover:border-sky-500/60'}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                              <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{a.titel}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-400">
                        <input type="checkbox" checked={fuerSaison} onChange={(e) => setFuerSaison(e.target.checked)} />
                        <T>Für alle Spieltage dieser Saison übernehmen</T>
                      </label>
                      {bilderOffen && (
                        <KartenUpdateWahl aktuell={wahlBild} vorgabe={meta?.saisonKurz} speichert={speichert}
                          waehle={(u) => { void bildSpeichern(u); setBilderOffen(false); }} />
                      )}
                    </div>
                  )}
                  <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)] lg:items-start">
                    <Karte f={fenster} bild={bild} rotAb={2} />
                    <aside className="lg:sticky lg:top-4 lg:order-first">
                      <h2 className="schrift-anzeige mb-2 text-lg font-extrabold text-slate-100"><T>Rangliste</T></h2>
                      <div className="max-h-[80vh] overflow-y-auto rounded-xl">
                        {nurPlatzierungen ? <Platzierungen zeilen={platzierungen} schmal />
                          : !meta?.alt && meta?.eventId && fenster.quelle !== 'hand'
                          ? <RangTabelle eventId={meta.eventId} windowId={tageFenster.length === 1 ? tageFenster[0] : (meta?.epicFenster ?? fenster.windowId)}
                              windows={tageFenster.length > 1 ? tageFenster : undefined} laender={laender} schmal
                              anzeigen={new Map((fenster.teams ?? []).flatMap((x) => x.spieler.map((s) => [s.id, s.anzeige] as const)))} />
                          : <RangAusTeams teams={fenster.teams ?? []} schmal />}
                      </div>
                    </aside>
                  </div>
                </div>
              )}
              {reiter === 'spieler' && <TeamKarten teams={fenster.teams ?? []} />}
              {reiter === 'leaderboard' && (nurPlatzierungen ? <Platzierungen zeilen={platzierungen} />
                : meta?.alt || fenster.quelle === 'hand'
                ? <RangAusTeams teams={fenster.teams ?? []} />
                : <RangTabelle eventId={meta?.eventId ?? null} windowId={tageFenster.length === 1 ? tageFenster[0] : (meta?.epicFenster ?? fenster.windowId)}
                    windows={tageFenster.length > 1 ? tageFenster : undefined} laender={laender}
                    anzeigen={new Map((fenster.teams ?? []).flatMap((x) => x.spieler.map((s) => [s.id, s.anzeige] as const)))} />)}
              {reiter === 'tierlist' && <CupTierlist windowId={fenster.windowId} teams={fenster.teams ?? []} />}
              {reiter === 'laender' && (
                <div className="max-w-2xl">
                  <h2 className="mb-3 text-lg font-black uppercase tracking-wide text-slate-100"><T>Spieler nach Land</T></h2>
                  <LaenderListe spieler={fenster.spieler} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
