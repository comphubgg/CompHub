'use client';

/*
 * Die Seite eines Cups: Karte, Spieler, Leaderboard, Tierlist, Länder - und oben die Wochen zum Umschalten.
 *
 * Der Betreiber (12.10.2026): beim Klick auf einen Cup kommt die Karte mit den Reitern MAP, PLAYERS, LEADERBOARD,
 * TIERLIST, NATIONALITIES; oben stehen alle Spieltage des Cups ("Week 1 - Finals 23.08 ..."), und man wechselt direkt
 * von einem zum anderen. Die Karte muss die richtige zur Spielversion sein (bei Reload die Reload-Karte) - und der
 * Admin kann sie ändern. Alles aus dem Werkzeug selbst (/api/maps-karte, /api/maps-liste, /api/maps-bild).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import type { SolosFenster } from '@/lib/globalsSolos';
import { Karte } from '@/app/globals-solos/Bausteine';
import LaenderListe from '@/app/components/LaenderListe';
import { TeamKarten, RangTabelle } from './Mannschaften';
import CupTierlist from './CupTierlist';

interface Eintrag {
  turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string;
  datum: number | null; ende: number | null; saison: string; saisonKurz: string; saisonName: string; bild: string | null; eventId: string | null;
}

const KURZ = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' });
const LANG = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' });

type Reiter = 'karte' | 'spieler' | 'leaderboard' | 'tierlist' | 'laender';
const REITER: Array<[Reiter, string]> = [
  ['karte', 'Map'], ['spieler', 'Spieler'], ['leaderboard', 'Leaderboard'], ['tierlist', 'Tierlist'], ['laender', 'Länder'],
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
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [fehler, setFehler] = useState('');
  const [reiter, setReiter] = useState<Reiter>('karte');
  const [wahlBild, setWahlBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [speichert, setSpeichert] = useState(false);
  const [bilderOffen, setBilderOffen] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const [tid, r, w] = [p.get('t') ?? '', p.get('r') ?? '', p.get('w') ?? ''];
    if (!tid || !r || !w) { setFehler('Diese Karte ist nicht angegeben.'); return; }
    setParams({ t: tid, r, w });
  }, []);

  useEffect(() => {
    if (!params) return undefined;
    let weg = false;
    setFenster(null); setFehler('');
    fetch(`/api/maps-karte?t=${encodeURIComponent(params.t)}&r=${encodeURIComponent(params.r)}&w=${encodeURIComponent(params.w)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (weg) return; if (j?.ok) setFenster(j.fenster); else setFehler(j?.error || 'Die Karte ließ sich nicht laden.'); })
      .catch(() => { if (!weg) setFehler('Die Karte ließ sich nicht laden.'); });
    fetch(`/api/maps-bild?w=${encodeURIComponent(params.w)}`, { cache: 'no-store' })
      .then((x) => x.json())
      .then((j) => { if (!weg && j?.ok) { setWahlBild(j.u ?? null); setAuswahl(j.auswahl ?? []); } })
      .catch(() => { /* ohne Wahl gilt das Bild der Spielversion */ });
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
    () => liste.filter((e) => meta && e.turnierId === meta.turnierId && e.region === meta.region).sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0)),
    [liste, meta],
  );
  const laender = useMemo(() => new Map((fenster?.spieler ?? []).map((s) => [s.id, s.land])), [fenster]);
  const teamSpiel = (fenster?.teams ?? []).some((x) => x.spieler.length > 1);
  const bild = wahlBild ?? fenster?.bild ?? null;
  const zustand = stand(meta, fenster);

  const bildSpeichern = useCallback(async (u: string) => {
    if (!params) return;
    setSpeichert(true);
    try {
      const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ w: params.w, u }) });
      const j = await r.json();
      if (j?.ok) setWahlBild(j.u ?? null);
    } finally { setSpeichert(false); }
  }, [params]);

  const titelOben = meta?.cup || '';
  const chip = (an: boolean) => `rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an
    ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        {meta?.bild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={encodeURI(meta.bild)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-xl" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/70 to-zinc-950" />
        <div className="relative mx-auto max-w-[1600px] px-4 py-6">
          <Link href={meta?.saison ? `/tournament-maps?saison=${meta.saison}` : '/tournament-maps'}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">
            ← {meta?.saisonKurz || t('Alle Maps')}
          </Link>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            {meta?.bild && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={encodeURI(meta.bild)} alt="" className="hidden h-20 w-36 rounded-lg border border-white/10 object-cover shadow-xl sm:block" />
            )}
            <div className="min-w-0">
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{titelOben || fenster?.name || t('Karte')}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {meta?.saisonKurz && <span>{meta.saisonKurz}</span>}
                {meta?.region && <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{meta.region}</span>}
                {(fenster?.start || meta?.datum) && <span>{LANG.format(new Date(fenster?.start ?? (meta?.datum as number)))}</span>}
                {zustand && (
                  <span className={`rounded px-1.5 py-0.5 ${zustand === 'live' ? 'bg-red-500/20 text-red-400' : zustand === 'upcoming' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/[0.07] text-slate-400'}`}>
                    {zustand === 'live' ? 'Live' : zustand === 'upcoming' ? 'Upcoming' : 'Ended'}
                  </span>
                )}
              </p>
            </div>
          </div>

          {wochen.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-1 rounded-2xl border border-white/[0.07] bg-black/30 p-1.5">
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
                  className={`rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${w.windowId === params?.w
                    ? 'bg-white text-zinc-900' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'}`}>
                  {w.fenster}{w.datum ? <span className="ml-1.5 font-semibold opacity-60">{KURZ.format(new Date(w.datum))}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        {fehler && !fenster && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!fenster && !fehler && <LadeSchirm />}

        {fenster && (
          <>
            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
              {REITER.map(([k, tt]) => (
                <button key={k} type="button" onClick={() => setReiter(k)} className={chip(reiter === k)}><T>{tt}</T></button>
              ))}
            </div>

            <div className="mt-5">
              {reiter === 'karte' && (
                <div>
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
                    </div>
                  )}
                  <Karte f={fenster} bild={bild} rotAb={teamSpiel ? 3 : 2} />
                </div>
              )}
              {reiter === 'spieler' && <TeamKarten teams={fenster.teams ?? []} />}
              {reiter === 'leaderboard' && <RangTabelle eventId={meta?.eventId ?? null} windowId={fenster.windowId} laender={laender} />}
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
