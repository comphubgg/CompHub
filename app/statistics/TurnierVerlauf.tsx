'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';

/*
 * Der Turnierverlauf im Profil - fuer JEDES Konto aus unseren Bestenlisten, nicht nur fuer die Pros (Betreiber, 16.11.2026).
 *
 * Die Daten kommen aus /api/spieler-verlauf (ein Index, den scripts/spieler-verlauf.mjs auf GitHub rechnet): je Spieltag Platz, Punkte, Mitspieler, Preisgeld
 * und die Quali-Grenze der Runde. Zaehler (Spieltage, Siege, Top 10, bester und mittlerer Platz, Preisgeld) gelten fuer die gewaehlten Filter.
 * Was Epic nicht in den ersten 10.000 einer Liste fuehrt, kennen wir nicht - das steht unter der Tabelle, statt still zu fehlen.
 */

export interface VerlaufKopf { name: string | null; region: string; zuletzt: number | null; events: number }

interface Zeile {
  w: string; titel: string; runde: string; region: string; saison: string; modus: 'reload' | 'br'; zb: boolean; ranked: boolean;
  datum: number | null; teams: number; gekuerzt: boolean; platz: number; punkte: number; matches: number; preis: number;
  cut: number | null; cutPunkte: number | null; mitspieler: Array<{ id: string; name: string | null }>; ausserhalb?: boolean;
}
interface Antwort {
  ok: boolean; epicId: string; name: string | null; alteNamen?: string[]; pr?: { platz: number; punkte: number } | null; prTop?: number;
  region?: string; zuletzt?: number | null; aktuelleSaison?: string; saisonNamen?: Record<string, string>; zeilen?: Zeile[]; fehler?: string;
}

const SEITE = 50;

function saisonKurz(name: string): string {
  return name.replace(/Chapter\s*(\d+)\s*Season\s*(\w+)/i, 'C$1 S$2');
}

export default function TurnierVerlauf({ epicId, aufKopf, aufSpieler }: {
  epicId: string;
  /** Name, Region und zuletzt gesehen fuer den Kopf des Profils (bei Konten ohne Akte steht dort sonst nichts). */
  aufKopf?: (k: VerlaufKopf) => void;
  /** Ein Mitspieler wurde angeklickt. */
  aufSpieler?: (id: string, name: string) => void;
}) {
  const { sprache, t } = useSprache();
  const [d, setD] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const [zeitraum, setZeitraum] = useState<'saison' | 'alle'>('alle');
  const [modus, setModus] = useState<'' | 'br' | 'reload'>('');
  const [region, setRegion] = useState('');
  const [mehr, setMehr] = useState(1);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    // Je Konto eine neue Instanz (key im Profil) - hier ist nichts zurueckzusetzen.
    let weg = false;
    fetch(`/api/spieler-verlauf?id=${encodeURIComponent(epicId)}`)
      .then((r) => r.json() as Promise<Antwort>)
      .then((j) => {
        if (weg) return;
        if (!j?.ok) { setFehler(true); return; }
        setD(j);
        const z = j.zeilen ?? [];
        // Wer in der laufenden Saison gespielt hat, sieht zuerst die laufende Saison.
        setZeitraum(z.some((x) => x.saison === j.aktuelleSaison) ? 'saison' : 'alle');
        aufKopf?.({ name: j.name, region: j.region ?? '', zuletzt: j.zuletzt ?? null, events: z.length });
      })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
    // aufKopf aendert sich mit jedem Zeichnen der Seite - geladen wird nur je Konto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicId, versuch]);

  const alle = useMemo(() => d?.zeilen ?? [], [d]);
  const regionen = useMemo(() => [...new Set(alle.map((z) => z.region).filter(Boolean))].sort(), [alle]);
  const gefiltert = useMemo(() => alle.filter((z) => (zeitraum === 'alle' || z.saison === d?.aktuelleSaison)
    && (!modus || z.modus === modus) && (!region || z.region === region)), [alle, zeitraum, modus, region, d?.aktuelleSaison]);

  const zahl = (n: number) => n.toLocaleString(sprache === 'de' ? 'de-DE' : 'en-US');
  const geld = (n: number) => `$${zahl(Math.round(n))}`;
  const datum = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(sprache === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const runde = (s: string) => s.replace(/\bRunde (\d+)/g, (_, n) => `${t('Runde')} ${n}`).replace(/\bTag (\d+)/g, (_, n) => `${t('Tag')} ${n}`);

  const zaehler = useMemo(() => {
    const p = gefiltert.map((z) => z.platz);
    return {
      events: gefiltert.length,
      siege: p.filter((x) => x === 1).length,
      top10: p.filter((x) => x <= 10).length,
      beste: p.length ? Math.min(...p) : null,
      schnitt: p.length ? Math.round(p.reduce((a, x) => a + x, 0) / p.length) : null,
      preis: gefiltert.reduce((a, z) => a + (z.preis || 0), 0),
    };
  }, [gefiltert]);

  if (fehler) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-slate-400"><T>Der Turnierverlauf ließ sich gerade nicht laden.</T></p>
        <button type="button" onClick={() => { setFehler(false); setVersuch((v) => v + 1); }}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Nochmal versuchen</T></button>
      </div>
    );
  }
  if (!d) return <p className="py-6 text-xs text-slate-600"><T>Wird geladen …</T></p>;

  const knopf = (aktiv: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition ${aktiv
    ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-zinc-700 text-slate-400 hover:border-zinc-500 hover:text-slate-200'}`;
  const sichtbar = gefiltert.slice(0, mehr * SEITE);
  const saisonText = (s: string) => saisonKurz(d.saisonNamen?.[s] ?? s);

  return (
    <div className="space-y-6">
      {/* Kopfangaben: Konto, Region, zuletzt gesehen, Power Ranking, Preisgeld - fuer jedes Konto, auch ohne Profil bei uns. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Konto', (
            <button key="k" type="button" title={t('Konto-Id kopieren')}
              onClick={() => { void navigator.clipboard?.writeText(epicId).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 1500); }); }}
              className="max-w-full truncate font-mono text-sm text-slate-200 transition hover:text-sky-300">
              {kopiert ? t('Kopiert') : epicId}
            </button>
          )],
          ['Region', d.region || '—'],
          ['Zuletzt gesehen', datum(d.zuletzt ?? null)],
          ['Power Ranking', d.pr ? `#${zahl(d.pr.platz)}` : (d.prTop ? `${t('nicht in den Top')} ${zahl(d.prTop)}` : '—')],
          ['Preisgeld gesamt', alle.some((z) => z.preis) ? geld(alle.reduce((a, z) => a + (z.preis || 0), 0)) : '—'],
        ].map(([l, v]) => (
          <div key={String(l)} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>{String(l)}</T></dt>
            <dd className="mt-1 truncate text-sm font-semibold text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      {d.alteNamen && d.alteNamen.length > 0 && (
        <p className="-mt-3 text-xs text-slate-500"><T>Frühere Namen</T>: {d.alteNamen.join(', ')}</p>
      )}

      {!alle.length ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-200"><T>Kein Turnierverlauf gefunden.</T></p>
          <p className="mt-2 text-xs text-slate-500"><T>Dieses Konto steht in keiner Bestenliste, die wir führen (je Runde die ersten 10.000 Teams, ältere Saisons die ersten 500).</T></p>
        </div>
      ) : (
        <>
          {/* Filter */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-wrap gap-1">
              <button type="button" className={knopf(zeitraum === 'saison')} onClick={() => { setZeitraum('saison'); setMehr(1); }}>
                <T>Diese Saison</T>{d.aktuelleSaison ? ` · ${saisonText(d.aktuelleSaison)}` : ''}
              </button>
              <button type="button" className={knopf(zeitraum === 'alle')} onClick={() => { setZeitraum('alle'); setMehr(1); }}><T>Alle Zeiten</T></button>
            </div>
            <div className="flex flex-wrap gap-1">
              {([['', 'Alle Modi'], ['br', 'Battle Royale'], ['reload', 'Reload']] as const).map(([w, l]) => (
                <button key={w || 'alle'} type="button" className={knopf(modus === w)} onClick={() => { setModus(w); setMehr(1); }}><T>{l}</T></button>
              ))}
            </div>
            {regionen.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {['', ...regionen].map((r) => (
                  <button key={r || 'alle'} type="button" className={knopf(region === r)} onClick={() => { setRegion(r); setMehr(1); }}>
                    {r || t('Alle Regionen')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zaehler fuer die Auswahl */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ['Turniere', zahl(zaehler.events)],
              ['Erste Plätze', zahl(zaehler.siege)],
              ['Top 10', zahl(zaehler.top10)],
              ['Bester Platz', zaehler.beste ? `#${zahl(zaehler.beste)}` : '—'],
              ['Ø Platz', zaehler.schnitt ? `#${zahl(zaehler.schnitt)}` : '—'],
              ['Verdientes Preisgeld', zaehler.preis ? geld(zaehler.preis) : '—'],
            ] as Array<[string, string]>).map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>{l}</T></p>
                <p className="schrift-anzeige mt-1 text-2xl font-extrabold tabular-nums text-slate-100">{v}</p>
              </div>
            ))}
          </div>

          {!gefiltert.length ? (
            <p className="py-6 text-center text-xs text-slate-500"><T>Keine Turniere für diese Auswahl.</T></p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {/* Am Handy je Turnier eine Karte - die Tabelle mit neun Spalten passt nicht auf 390 Pixel. */}
              <ul className="divide-y divide-zinc-800/70 md:hidden">
                {sichtbar.map((z) => {
                  const weiter = z.cut !== null && z.platz <= z.cut;
                  return (
                    <li key={z.w} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-100">{z.titel}</p>
                          <p className="truncate text-xs text-slate-500">{[runde(z.runde), z.ranked ? 'Ranked Cup' : ''].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <span className={z.platz <= 10 ? 'font-extrabold text-sky-300' : 'font-bold text-slate-100'}>#{zahl(z.platz)}</span>
                          <span className="block text-[0.7rem] text-slate-500">{zahl(z.punkte)} {t('Pkt')}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[0.7rem] text-slate-400">
                        {[z.modus === 'reload' ? 'Reload' : 'BR', z.zb ? 'ZB' : '', z.region, saisonText(z.saison), datum(z.datum)].filter(Boolean).join(' · ')}
                      </p>
                      {(z.preis > 0 || z.cut !== null) && (
                        <p className={`mt-0.5 text-[0.7rem] ${weiter ? 'text-sky-300' : 'text-slate-500'}`}>
                          {[z.preis > 0 ? geld(z.preis) : '', z.cut !== null ? `${weiter ? `${t('Weiter qualifiziert')} · ` : ''}Cut Top ${zahl(z.cut)}${z.cutPunkte !== null ? ` · ${zahl(z.cutPunkte)} ${t('Pkt')}` : ''}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {z.mitspieler.length > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.7rem]">
                          {z.mitspieler.map((m) => (
                            <button key={m.id} type="button" onClick={() => aufSpieler?.(m.id, m.name ?? '')} className="text-slate-300 hover:text-sky-300">
                              {m.name ?? `${m.id.slice(0, 8)}…`}
                            </button>
                          ))}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-[0.65rem] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold"><T>Turnier</T></th>
                    <th className="px-3 py-3 font-semibold"><T>Mitspieler</T></th>
                    <th className="px-3 py-3 font-semibold"><T>Modus</T></th>
                    <th className="px-3 py-3 font-semibold"><T>Region</T></th>
                    <th className="px-3 py-3 font-semibold"><T>Saison</T></th>
                    <th className="px-3 py-3 text-right font-semibold"><T>Punkte</T></th>
                    <th className="px-3 py-3 text-right font-semibold"><T>Platzierung</T></th>
                    <th className="px-3 py-3 font-semibold"><T>Preis / Cut</T></th>
                    <th className="px-4 py-3 text-right font-semibold"><T>Datum</T></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {sichtbar.map((z) => {
                    const weiter = z.cut !== null && z.platz <= z.cut;
                    return (
                      <tr key={z.w} className="align-top transition hover:bg-zinc-800/40">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-100">{z.titel}</p>
                          <p className="text-xs text-slate-500">{[runde(z.runde), z.ranked ? 'Ranked Cup' : ''].filter(Boolean).join(' · ') || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {z.mitspieler.length ? z.mitspieler.map((m) => (
                            <button key={m.id} type="button" onClick={() => aufSpieler?.(m.id, m.name ?? '')}
                              className="block max-w-[11rem] truncate text-left text-slate-300 transition hover:text-sky-300">
                              {m.name ?? `${m.id.slice(0, 8)}…`}
                            </button>
                          )) : <span className="text-slate-600"><T>Solo</T></span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-300">
                          {z.modus === 'reload' ? 'Reload' : 'BR'}{z.zb ? ' · ZB' : ''}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-slate-300">{z.region}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">{saisonText(z.saison)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{zahl(z.punkte)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                          <span className={z.platz === 1 ? 'font-extrabold text-sky-300' : z.platz <= 10 ? 'font-bold text-sky-400' : 'font-semibold text-slate-100'}>#{zahl(z.platz)}</span>
                          <span className="block text-[0.7rem] text-slate-500">
                            {z.ausserhalb ? t('hinter der Liste') : `${t('von')} ${zahl(z.teams)}${z.gekuerzt ? '+' : ''}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {z.preis > 0 && <span className="block font-semibold text-slate-100">{geld(z.preis)}</span>}
                          {z.cut !== null && (
                            <span className={`block ${weiter ? 'text-sky-300' : 'text-slate-500'}`}>
                              {weiter ? `${t('Weiter qualifiziert')} · ` : ''}Cut Top {zahl(z.cut)}{z.cutPunkte !== null ? ` · ${zahl(z.cutPunkte)} ${t('Pkt')}` : ''}
                            </span>
                          )}
                          {!z.preis && z.cut === null && <span className="text-slate-600">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-400">{datum(z.datum)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {gefiltert.length > sichtbar.length && (
                <div className="border-t border-zinc-800 p-3 text-center">
                  <button type="button" onClick={() => setMehr((m) => m + 1)}
                    className="rounded-lg border border-zinc-700 px-4 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-300">
                    <T>Mehr zeigen</T> ({zahl(gefiltert.length - sichtbar.length)})
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-600">
            <T>Quelle: Epics Bestenlisten - je Runde die ersten 10.000 Teams, ältere Saisons die ersten 500. Plätze dahinter führt Epic nur für das eigene Konto; sie fehlen hier. Preisgeld nach Epics Auszahlungstabelle je Person.</T>
          </p>
        </>
      )}
    </div>
  );
}
