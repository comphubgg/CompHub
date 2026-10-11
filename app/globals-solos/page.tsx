'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import { useZugang } from '@/app/lib/zugang';
import { sichtbarerTakt } from '@/app/lib/takt';
import { fortniteKarte } from '@/lib/bildAdressen';
import type { SolosDaten, SolosFenster, SolosSpieler } from '@/lib/globalsSolos';

/*
 * FNCS Globals Solos - die Seite fuer VIPs.
 *
 * Der Betreiber (11.10.2026): "eine neue VIP-Page fuer Globals Solos. Da tust du automatisch immer die
 * eintragen, die sich direkt qualifiziert haben ... dann Heat 1 und Heat 2 mit den Spielern ... dann
 * natuerlich die Map." Alles kommt von selbst von Noble Practice (lib/globalsSolos); hier wird nichts
 * eingetragen, nichts verteilt und nichts gespeichert. Die Seite erneuert sich alle zwei Minuten.
 */

const GOLD = '#f5c542';
const BLAU = '#0e47de';

const datum = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' }).format(new Date(iso))
  : '');
const uhr = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }).format(new Date(iso))
  : '');

function Gesicht({ s, gross }: { s: SolosSpieler; gross?: boolean }) {
  const px = gross ? 'h-12 w-12' : 'h-8 w-8';
  return s.bild
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={s.bild} alt="" loading="lazy" className={`${px} shrink-0 rounded-full border border-amber-400/30 object-cover object-top`} />
    : (
      <span className={`${px} flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-slate-500`}>
        {s.anzeige.slice(0, 1).toUpperCase()}
      </span>
    );
}

/* ------------------------------------------------------------------ Karte */

function Karte({ f }: { f: SolosFenster }) {
  const t = useT();
  const rahmen = useRef<HTMLDivElement | null>(null);
  const [breite, setBreite] = useState(800);
  const [orte, setOrte] = useState(true);

  useEffect(() => {
    const el = rahmen.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const messen = () => setBreite(el.clientWidth || 800);
    const b = new ResizeObserver(messen);
    b.observe(el);
    messen();
    return () => b.disconnect();
  }, []);

  const schrift = Math.max(7, Math.min(13, breite / 78));

  if (!f.formen.length) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500">
        <T>Für diesen Spieltag hat Noble noch keine Landepunkte eingetragen.</T>
      </p>
    );
  }

  return (
    <div>
      <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={orte} onChange={(e) => setOrte(e.target.checked)} className="accent-sky-500" />
        <T>Ortsnamen zeigen</T>
      </label>
      <div ref={rahmen} className="relative mx-auto aspect-square w-full max-w-[min(100%,980px)] overflow-hidden rounded-xl border border-amber-500/25 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fortniteKarte(orte)} alt={t('Karte')} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {f.formen.map((fo, i) => (
            <polygon key={i} points={fo.punkte.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={fo.spieler.length ? 'rgba(245,197,66,0.30)' : 'rgba(14,71,222,0.25)'}
              stroke={fo.spieler.length ? GOLD : '#7aa2ff'} strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {f.formen.map((fo, i) => {
          if (!fo.spieler.length) return null;
          const mx = fo.punkte.reduce((a, p) => a + p.x, 0) / fo.punkte.length;
          const my = fo.punkte.reduce((a, p) => a + p.y, 0) / fo.punkte.length;
          return (
            <div key={i}
              style={{ left: `${mx}%`, top: `${my}%`, fontSize: schrift, lineHeight: 1.15 }}
              className="pointer-events-none absolute w-max max-w-[16%] -translate-x-1/2 -translate-y-1/2 text-center font-extrabold uppercase text-white [text-shadow:0_0_3px_#000,0_0_3px_#000,0_1px_2px_#000]">
              {fo.spieler.map((n) => <div key={n} className="truncate">{n}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function GlobalsSolos() {
  const t = useT();
  const zugang = useZugang();
  const [daten, setDaten] = useState<SolosDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [kartenWahl, setKartenWahl] = useState<string>('');

  const holen = useCallback(async (frisch: boolean) => {
    setLaedt(true);
    try {
      const r = await fetch(`/api/globals-solos${frisch ? '?frisch=1' : ''}`, { cache: 'no-store' });
      const j = await r.json() as ({ ok: true } & SolosDaten) | { ok: false; error?: string };
      if (!r.ok || !j.ok) throw new Error(('error' in j && j.error) || 'nicht ladbar');
      setDaten(j); setFehler('');
    } catch (e) {
      setFehler((e as Error).message);
    } finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    void holen(false);
    return sichtbarerTakt(() => { void holen(false); }, 120_000);
  }, [holen]);

  const heats = useMemo(() => (daten?.fenster ?? []).filter((f) => f.art === 'heat'), [daten]);
  const kartenFenster = useMemo(() => daten?.fenster ?? [], [daten]);
  const aktiveKarte = kartenFenster.find((f) => f.windowId === kartenWahl)
    ?? kartenFenster.find((f) => f.art === 'finale') ?? kartenFenster[0];
  const finalZahl = (daten?.qualifiziert ?? []).reduce((a, g) => a + g.spieler.length, 0);

  if (zugang.laedt) return <LadeSchirm />;
  const darfHinein = zugang.admin || zugang.rechte.includes('globals');
  if (!darfHinein) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Die Globals-Seiten werden einzeln vergeben — mit einem gewöhnlichen Konto sind sie nicht zugänglich.</T>
          </p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 text-slate-200">
      <div className="relative overflow-hidden border-b border-amber-500/25">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url('/overlay/globals/fncs-breit.jpg')" }} />
        <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${BLAU}55, transparent 55%), rgba(0,0,0,.72)` }} />
        <div className="relative mx-auto max-w-[1500px] px-4 py-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">
            VIP · FNCS Solos · EU
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: '#ffd766' }}>
            FNCS Globals Solos 2026
          </h1>
          {daten && (
            <div className="mt-4 flex flex-wrap gap-2">
              {daten.fenster.map((f) => (
                <span key={f.windowId} className="rounded-lg border border-amber-500/25 bg-zinc-950/60 px-3 py-1.5 text-xs text-amber-200/90">
                  {f.name} · {datum(f.start)} {uhr(f.start)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-10 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            <T>Quelle: Noble Practice. Die Seite erneuert sich alle zwei Minuten.</T>
            {daten && <> · <T>Stand</T> {uhr(daten.stand)}</>}
          </span>
          <button type="button" onClick={() => void holen(zugang.admin)} disabled={laedt}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
            {laedt ? <T>Wird geladen …</T> : <T>Aktualisieren</T>}
          </button>
        </div>

        {!daten && laedt && <LadeSchirm />}
        {fehler && !daten && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{fehler}</p>
        )}

        {daten && (
          <>
            {/* ---------------------------------------------- Qualifiziert */}
            <section>
              <h2 className="text-lg font-bold text-amber-200">
                <T>Qualifiziert für das Finale</T> <span className="text-sm font-normal text-slate-500">({finalZahl})</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500"><T>Alle, die Noble im Finale führt — gruppiert danach, wie sie sich qualifiziert haben.</T></p>
              {daten.qualifiziert.length === 0 ? (
                <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500">
                  <T>Noch hat sich niemand qualifiziert.</T>
                </p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {daten.qualifiziert.map((g) => (
                    <div key={g.windowId ?? g.quelle} className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4">
                      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-slate-100">
                        {g.quelle === 'Other' ? t('Sonstige') : g.quelle}
                        <span className="text-xs font-normal text-slate-500">
                          {g.spieler.length}
                          {g.art === 'qualifier' ? ` · ${t('direkt qualifiziert')}` : g.art === 'heat' ? ` · ${t('über den Heat')}` : ''}
                        </span>
                      </h3>
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {g.spieler.map((s) => (
                          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                            <Gesicht s={s} gross />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <TeamFlagge groesse={16} laender={[s.land ?? undefined]} />
                                <span className="truncate text-sm font-semibold text-slate-100">{s.anzeige}</span>
                              </span>
                              {s.rang !== null && (
                                <span className="block text-[11px] tabular-nums text-slate-500">
                                  #{s.rang}{s.punkte !== null ? ` · ${s.punkte} ${t('Punkte')}` : ''}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------------------------------------------- Heats */}
            <section>
              <h2 className="text-lg font-bold text-amber-200"><T>Heats</T></h2>
              {heats.length === 0 ? (
                <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-slate-500">
                  <T>Noch keine Heats eingeteilt.</T>
                </p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {heats.map((h) => (
                    <div key={h.windowId} className="rounded-xl border border-amber-500/20 bg-zinc-900/40 p-4">
                      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-slate-100">
                        {h.name}
                        <span className="text-xs font-normal text-slate-500">{datum(h.start)} {uhr(h.start)} · {h.spieler.length} <T>Spieler</T></span>
                      </h3>
                      {h.spieler.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>
                      ) : (
                        <ol className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {h.spieler.map((s, i) => (
                            <li key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                              <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-slate-600">{i + 1}</span>
                              <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />
                              <span className="truncate text-slate-200">{s.anzeige}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------------------------------------------- Karte */}
            <section>
              <h2 className="text-lg font-bold text-amber-200"><T>Karte</T></h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {kartenFenster.map((f) => (
                  <button key={f.windowId} type="button" onClick={() => setKartenWahl(f.windowId)}
                    className={`rounded-lg px-3.5 py-2 text-sm transition ${aktiveKarte?.windowId === f.windowId
                      ? 'bg-amber-400/15 font-semibold text-amber-200 ring-1 ring-amber-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-amber-200'}`}>
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="mt-4">{aktiveKarte && <Karte key={aktiveKarte.windowId} f={aktiveKarte} />}</div>
              <p className="mt-2 text-[11px] text-slate-600">
                <T>Die Landepunkte und wer wo steht, kommen unverändert von Noble Practice.</T>
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
