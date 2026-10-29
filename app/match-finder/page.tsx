'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from '@/app/overlays/VipVorhang';
import { useZugang } from '@/app/lib/zugang';
import { useT } from '@/app/components/SprachProvider';
import { loadUserStorageCloud, loadUserStorageValue, saveUserStorageCloud, saveUserStorageValue } from '@/app/lib/userStorage';

/*
 * Der Match-ID-Finder (Betreiber, 27.10.2026): Spieler als Favoriten speichern und waehrend eines Cups sehen, in welchem Match sie gerade sind - die Match-ID
 * kopieren und im Spiel zuschauen. Nur fuer VIPs. Daten: /api/match-finder (lib/matchFinder). Die Favoriten liegen am Konto (user-storage), wie Ordner und
 * Tierlisten.
 */

interface Favorit { id: string; name: string }
interface FMatch { matchId: string; ende: string | null; platz: number | null; elims: number | null; windowId: string; titel: string }
interface FLive { matchId: string; quelle: 'bestenliste' | 'sitzung'; windowId: string | null; titel: string | null; playlist: string | null }
interface FSpieler { live: FLive | null; matches: FMatch[]; rang: number | null; punkte: number | null; windowId: string | null }
interface FCup { windowId: string; titel: string; region: string; live: boolean }
interface Antwort { ok: boolean; error?: string; cups: FCup[]; spieler: Record<string, FSpieler>; roh?: unknown[] }

const SPEICHER = 'match-finder-favoriten';
const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';

/** Epics Playlist-Kennung lesbar: "Playlist_ShowdownAlt_Duos" -> "Tournament · Duos", "Playlist_PlaygroundV2" -> "Creative / custom lobby". */
function spielart(p: string | null): string | null {
  if (!p) return null;
  const k = p.replace(/^Playlist_/i, '');
  const groesse = /solo/i.test(k) ? 'Solo' : /duo/i.test(k) ? 'Duos' : /trio/i.test(k) ? 'Trios' : /squad/i.test(k) ? 'Squads' : '';
  const art = /showdown|tournament|arena/i.test(k) ? 'Tournament'
    : /playground|creative|custom|private/i.test(k) ? 'Custom lobby / scrim'
      : /respawn|reload|blastberry|punchberry/i.test(k) ? 'Reload'
        : /nobuild|nobuildbr/i.test(k) ? 'Zero Build' : 'Match';
  return [art, groesse].filter(Boolean).join(' · ');
}

function uhrzeit(iso: string | null) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function MatchFinder() {
  const t = useT();
  const zugang = useZugang();
  const [favoriten, setFavoriten] = useState<Favorit[]>([]);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Favorit[] | null>(null);
  const [kopiert, setKopiert] = useState('');
  const geladen = useRef(false);
  const darf = zugang.admin || (zugang.vip && zugang.rechte.includes('matchfinder'));

  // Favoriten: sofort aus dem Browser, dann vom Konto (dort gilt der Stand, der zuletzt gespeichert wurde).
  useEffect(() => {
    if (!darf || geladen.current) return;
    geladen.current = true;
    const lokal = loadUserStorageValue<Favorit[]>(SPEICHER);
    if (Array.isArray(lokal)) setFavoriten(lokal);
    void loadUserStorageCloud<Favorit[]>(SPEICHER).then((wolke) => { if (Array.isArray(wolke)) { setFavoriten(wolke); saveUserStorageValue(SPEICHER, wolke); } });
  }, [darf]);
  const speichern = (liste: Favorit[]) => { setFavoriten(liste); saveUserStorageValue(SPEICHER, liste); void saveUserStorageCloud(SPEICHER, liste); };

  const ids = useMemo(() => favoriten.map((f) => f.id).join(','), [favoriten]);
  const laden = useCallback(() => {
    if (!ids) { setDaten(null); return; }
    fetch(`/api/match-finder?ids=${ids}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setDaten(j); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, [ids]);
  // Waehrend eines Cups alle zwanzig Sekunden, sonst jede Minute.
  const liveCup = Boolean(daten?.cups.some((c) => c.live));
  useEffect(() => {
    if (!darf) return undefined;
    laden();
    const id = window.setInterval(laden, liveCup ? 20_000 : 60_000);
    return () => window.clearInterval(id);
  }, [darf, laden, liveCup]);

  // Suche: Szene-Liste (Teilname) und dazu der genaue Epic-Name (auch fuer Spieler aus offenen Cups).
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer(null); return undefined; }
    let weg = false;
    const uhr = window.setTimeout(async () => {
      const [szene, epic] = await Promise.all([
        fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ spieler?: Array<{ epicId: string; name: string }> } | null>,
        q.length >= 3 ? fetch(`/api/match-finder?name=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ treffer?: Favorit | null } | null> : Promise.resolve(null),
      ]);
      if (weg) return;
      const liste: Favorit[] = [];
      if (epic?.treffer?.id) liste.push({ id: epic.treffer.id.toLowerCase(), name: epic.treffer.name });
      for (const s of szene?.spieler ?? []) if (s.epicId && !liste.some((x) => x.id === s.epicId)) liste.push({ id: s.epicId, name: s.name });
      setTreffer(liste.slice(0, 8));
    }, 350);
    return () => { weg = true; window.clearTimeout(uhr); };
  }, [suche]);

  const kopieren = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setKopiert(text); window.setTimeout(() => setKopiert(''), 2500); }).catch(() => undefined);
  };

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf && zugang.vip) return <VipVorhang titel="Der Match-ID-Finder ist für dein Konto noch nicht freigeschaltet." text="CompHub schaltet es je VIP frei - schreib uns kurz auf Discord." />;
  if (!darf) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500"><T>Der Match-ID-Finder zeigt VIPs, in welchem Match ihre Lieblingsspieler gerade sind - zum Zuschauen im Spiel.</T></p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Zur Anmeldung</T></Link>
        </div>
      </main>
    );
  }

  const liveCups = daten?.cups.filter((c) => c.live) ?? [];
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">VIP</p>
            <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl"><T>Match-ID-Finder</T></h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              <T>Speichere Spieler als Favoriten. Läuft ein Cup, siehst du hier, in welchem Match sie gerade sind - Match-ID kopieren und im Spiel zuschauen.</T>
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {liveCups.length
                ? <span className="flex items-center gap-1.5 font-semibold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{liveCups.length} {liveCups.length === 1 ? <T>Cup läuft gerade</T> : <T>Cups laufen gerade</T>}</span>
                : <span className="text-slate-500"><T>Gerade läuft kein Cup - die Match-IDs erscheinen, sobald einer läuft.</T></span>}
            </p>
          </div>
        </section>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-3">
            {favoriten.length === 0 && (
              <p className={`${karte} text-center text-sm text-slate-500`}><T>Noch keine Favoriten. Such rechts einen Spieler und füge ihn hinzu.</T></p>
            )}
            {favoriten.map((f) => {
              const s = daten?.spieler[f.id];
              return (
                <article key={f.id} className={karte}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-100">{f.name}</p>
                      {s?.rang ? <p className="text-xs text-slate-500">#{s.rang} · {s.punkte ?? 0} <T>Punkte</T></p> : null}
                    </div>
                    <button type="button" onClick={() => speichern(favoriten.filter((x) => x.id !== f.id))}
                      className="text-xs text-slate-500 transition hover:text-rose-400"><T>Entfernen</T></button>
                  </div>
                  {s?.live ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>
                      <span className="text-xs text-slate-300">{s.live.titel ?? spielart(s.live.playlist) ?? t('Im Match')}</span>
                      <code className="rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-slate-200">{s.live.matchId}</code>
                      <button type="button" onClick={() => kopieren(s.live!.matchId)}
                        className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400">
                        {kopiert === s.live.matchId ? t('Kopiert') : t('Match-ID kopieren')}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">{daten ? <T>Gerade in keinem Match.</T> : <T>Wird geladen …</T>}</p>
                  )}
                  {s && s.matches.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {s.matches.map((m) => (
                            <tr key={m.matchId} className="border-t border-zinc-800/80">
                              <td className="py-1.5 pr-3 tabular-nums text-slate-500">{uhrzeit(m.ende)}</td>
                              <td className="py-1.5 pr-3 text-slate-400">{m.titel}</td>
                              <td className="py-1.5 pr-3 tabular-nums text-slate-300">{m.platz ? `#${m.platz}` : ''}</td>
                              <td className="py-1.5 pr-3 tabular-nums text-slate-300">{m.elims != null ? `${m.elims} elims` : ''}</td>
                              <td className="py-1.5 text-right">
                                <button type="button" onClick={() => kopieren(m.matchId)} title={m.matchId}
                                  className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[11px] text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
                                  {kopiert === m.matchId ? t('Kopiert') : `${m.matchId.slice(0, 8)}…`}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
            {zugang.admin && daten?.roh && daten.roh.length > 0 && (
              <details className={karte}>
                <summary className="cursor-pointer text-xs text-slate-500">Admin: Epic liveSessions (roh)</summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-slate-500">{JSON.stringify(daten.roh, null, 1)}</pre>
              </details>
            )}
          </section>

          <aside className={`${karte} h-fit`}>
            <h2 className="text-sm font-semibold"><T>Spieler hinzufügen</T></h2>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Name des Spielers')}
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            {treffer && treffer.length === 0 && <p className="mt-3 text-xs text-slate-500"><T>Niemand gefunden. Bei Spielern aus offenen Cups den genauen Epic-Namen eingeben.</T></p>}
            {treffer && treffer.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {treffer.map((x) => {
                  const da = favoriten.some((f) => f.id === x.id);
                  return (
                    <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                      <span className="truncate text-sm text-slate-200">{x.name}</span>
                      <button type="button" disabled={da || favoriten.length >= 12}
                        onClick={() => { speichern([...favoriten, x]); setSuche(''); setTreffer(null); }}
                        className="shrink-0 rounded-md bg-sky-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
                        {da ? t('Favorit') : t('Hinzufügen')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              <T>Höchstens 12 Favoriten. Die Match-ID eines laufenden Spiels kommt aus Epics Bestenliste und Sitzungsdaten; gespielte Matches stehen darunter mit ihrer ID.</T>
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
