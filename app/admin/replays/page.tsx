'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

// Die Replay-Verwaltung.
//
// Zum Nachsehen und Ausprobieren, nicht zum Betreiben: das Einsammeln laeuft
// planmaessig von selbst (scripts/replays-holen.mjs, angestossen in
// instrumentation.ts). Epic haelt ein Replay 31 Tage vor - ein Werkzeug, das
// erst sammelt, wenn jemand einen Knopf drueckt, sammelt Luecken.
//
// Was hier steht, beantwortet zwei Fragen: Laeuft das Einsammeln? Und was
// genau steckt in einem einzelnen Match?

interface Fenster {
  season: string; windowId: string; region?: string; titel?: string;
  datum?: number; zaehler: Record<string, number>;
}

interface Match {
  matchId: string; stand: string; zeitpunkt?: string | null;
  elims?: number; konten?: number; bytes?: number;
  fehler?: string | null; versuche?: number; zuletzt?: string;
  parserVersion?: string; pfad?: string;
}

interface Elim {
  zeit: number | null; opfer: string | null; taeter: string | null;
  waffe: string | null; knock: boolean;
}

interface Auswertung {
  matchId: string; karte?: string | null; dauerMs?: number | null;
  zeitpunkt?: string | null; fortnite?: string | null; bytes?: number;
  konten: string[]; elims: Elim[]; parserVersion: string;
  ereignisArten?: Record<string, number>;
}

/** Die Zustaende aus der Pipeline, mit ihrer Farbe. */
const FARBE: Record<string, string> = {
  PARSED: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  FAILED: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  NOT_AVAILABLE: 'text-slate-500 border-zinc-800 bg-zinc-900/60',
  DOWNLOADING: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  PARSING: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  PENDING: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  RETRYING: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
};

function Marke({ stand }: { stand: string }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px]
                      font-semibold uppercase tracking-wider
                      ${FARBE[stand] ?? 'text-slate-400 border-zinc-800'}`}>
      {stand}
    </span>
  );
}

const zahl = (n: number) => n.toLocaleString('de-DE');

export default function ReplayVerwaltung() {
  const t = useT();
  const [istAdmin, setIstAdmin] = useState(false);
  const [fenster, setFenster] = useState<Fenster[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  // Die Testfunktion
  const [eingabe, setEingabe] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{
    gefunden: boolean; stand: string; hinweis?: string; dauerMs?: number;
    match?: Auswertung; error?: string; namen?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/auth/check-admin', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setIstAdmin(Boolean(d?.isAdmin)))
      .catch(() => setIstAdmin(false));
  }, []);

  useEffect(() => {
    fetch('/api/replays', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setFenster(d?.fenster ?? []))
      .catch(() => setFenster([]));
  }, []);

  const fensterOeffnen = useCallback(async (f: Fenster) => {
    if (offen === f.windowId) { setOffen(null); setMatches([]); return; }
    setOffen(f.windowId);
    setMatches([]);
    try {
      const r = await fetch(
        `/api/replays?fenster=${encodeURIComponent(f.windowId)}`
        + `&saison=${encodeURIComponent(f.season)}`, { cache: 'no-store' });
      const d = await r.json();
      setMatches(d?.matches ?? []);
    } catch { setMatches([]); }
  }, [offen]);

  /**
   * Ein einzelnes Match auswerten.
   *
   * Genau der Ablauf, den auch der planmaessige Lauf nimmt - nur fuer eine
   * Id und ohne etwas abzulegen. So laesst sich pruefen, ob die Kette steht,
   * bevor man ihr tausend Matches anvertraut.
   */
  const testen = useCallback(async () => {
    const id = eingabe.trim();
    if (!id) return;
    setLaeuft(true); setErgebnis(null);
    try {
      const r = await fetch('/api/replays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: id }),
      });
      // Die Namen loest die Schnittstelle mit auf - im Replay stehen nur Ids.
      setErgebnis(await r.json());
    } catch (e) {
      setErgebnis({ gefunden: false, stand: 'FAILED', error: (e as Error).message });
    } finally { setLaeuft(false); }
  }, [eingabe]);

  /** Aus den Ereignissen die Tabelle je Spieler - dieselbe Rechnung wie im Lauf. */
  const jeSpieler = (a: Auswertung) => {
    const karte = new Map<string, { kills: number; knocks: number; tot: number }>();
    for (const k of a.konten) karte.set(k, { kills: 0, knocks: 0, tot: 0 });
    for (const e of a.elims) {
      if (e.taeter && karte.has(e.taeter)) {
        if (e.knock) karte.get(e.taeter)!.knocks++; else karte.get(e.taeter)!.kills++;
      }
      if (e.opfer && karte.has(e.opfer) && !e.knock) karte.get(e.opfer)!.tot++;
    }
    return [...karte.entries()]
      .map(([epicId, w]) => ({ epicId, ...w }))
      .sort((a2, b2) => b2.kills - a2.kills);
  };

  const name = (id: string) =>
    ergebnis?.namen?.[id] || `${id.slice(0, 8)}…`;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex items-baseline gap-4">
          <h1 className="text-2xl font-bold"><T>Replay-Verwaltung</T></h1>
          <Link href="/admin"
            className="text-xs text-slate-500 transition hover:text-sky-400">
            ← <T>Zurück zum Dashboard</T>
          </Link>
        </div>

        {/* Was dieses Werkzeug kann und was nicht - direkt oben, damit
            niemand hier nach Schaden oder Material sucht. */}
        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm leading-relaxed text-slate-400">
            <T>Aus den Server-Replays kommen Eliminierungen, Knocks, Waffe und
            Zeitpunkt — und wer wen ausgeschaltet hat. Schaden, Kopftreffer,
            Material und Bauteile stehen im Netzwerk-Stream, den der offene
            Parser nicht mehr lesen kann; die bleiben Sache der Szene-Quelle.</T>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-400/90">
            <T>Epic hält ein Replay 31 Tage vor. Was in dieser Zeit nicht geholt
            wird, ist danach für immer fort — deshalb sammelt das Werkzeug
            planmäßig von selbst und nicht auf Knopfdruck.</T>
          </p>
        </div>

        {/* ------------------------------------------------ Testfunktion */}
        {istAdmin && (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]
                           text-slate-500"><T>Einzelnes Match prüfen</T></h2>
            <div className="flex flex-wrap items-center gap-3">
              <input value={eingabe}
                onChange={(e) => setEingabe(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void testen(); }}
                placeholder={t('Match-ID (32 Zeichen)')}
                spellCheck={false}
                className="w-[27rem] max-w-full rounded-lg border border-zinc-800
                           bg-zinc-900/80 px-4 py-2.5 font-mono text-sm
                           text-slate-100 outline-none placeholder:text-slate-600
                           focus:border-sky-500" />
              <button onClick={testen} disabled={laeuft || !eingabe.trim()}
                className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold
                           text-white transition hover:bg-sky-400
                           disabled:cursor-not-allowed disabled:opacity-40">
                {laeuft ? <T>Wird geprüft …</T> : <T>Replay auswerten</T>}
              </button>
            </div>

            {ergebnis && (
              <div className="mt-5 rounded-xl border border-zinc-800
                              bg-zinc-900/40 p-5">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <Marke stand={ergebnis.stand} />
                  {ergebnis.dauerMs !== undefined && (
                    <span className="text-xs text-slate-500">
                      {(ergebnis.dauerMs / 1000).toFixed(1)} s
                    </span>
                  )}
                  {ergebnis.match && (
                    <span className="text-xs text-slate-500">
                      {((ergebnis.match.bytes ?? 0) / 1048576).toFixed(2)} MB
                      {' · '}<T>Fortnite</T> {ergebnis.match.fortnite}
                      {' · '}<T>Auswerter</T> {ergebnis.match.parserVersion}
                    </span>
                  )}
                </div>

                {ergebnis.hinweis && (
                  <p className="text-sm text-slate-400"><T>{ergebnis.hinweis}</T></p>
                )}
                {ergebnis.error && (
                  <p className="font-mono text-xs text-rose-400">{ergebnis.error}</p>
                )}

                {ergebnis.match && (() => {
                  const a = ergebnis.match!;
                  const tabelle = jeSpieler(a);
                  const kills = a.elims.filter((e) => !e.knock).length;
                  return (
                    <>
                      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {([
                          ['Spieler gefunden', zahl(a.konten.length)],
                          ['Eliminierungen', zahl(kills)],
                          ['Knocks', zahl(a.elims.length - kills)],
                          ['Dauer', `${Math.round((a.dauerMs ?? 0) / 60000)} min`],
                        ] as Array<[string, string]>).map(([l, v]) => (
                          <div key={l} className="rounded-lg border border-zinc-800
                                                  bg-zinc-950/60 px-4 py-3">
                            <p className="text-lg font-bold text-sky-400">{v}</p>
                            <p className="mt-0.5 text-[10px] font-semibold uppercase
                                          tracking-[0.14em] text-slate-500">
                              <T>{l}</T>
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="max-h-[26rem] overflow-y-auto rounded-lg
                                      border border-zinc-800">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-zinc-900">
                            <tr className="text-[10px] uppercase tracking-wider
                                           text-slate-500">
                              <th className="px-3 py-2 text-left font-medium">
                                <T>Spieler</T></th>
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Kills</T></th>
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Knocks</T></th>
                              <th className="px-3 py-2 text-right font-medium">
                                <T>Ausgeschaltet</T></th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabelle.map((z) => (
                              <tr key={z.epicId}
                                className="border-t border-zinc-900">
                                <td className="px-3 py-1.5 text-slate-300">
                                  {name(z.epicId)}
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold
                                               tabular-nums text-sky-400">
                                  {z.kills}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums
                                               text-slate-400">{z.knocks}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums
                                               text-slate-500">{z.tot}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </section>
        )}

        {/* -------------------------------------------------- Die Fenster */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]
                         text-slate-500"><T>Eingesammelte Turniere</T></h2>

          {!fenster.length ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5
                          text-sm text-slate-500">
              <T>Noch nichts eingesammelt. Der planmäßige Lauf holt die Turniere
              der letzten 31 Tage.</T>
            </p>
          ) : (
            <div className="space-y-2">
              {fenster.map((f) => (
                <div key={f.windowId}
                  className="overflow-hidden rounded-xl border border-zinc-800
                             bg-zinc-900/40">
                  <button onClick={() => fensterOeffnen(f)}
                    className="flex w-full flex-wrap items-center gap-4 px-5 py-4
                               text-left transition hover:bg-zinc-900/70">
                    <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px]
                                     font-semibold tracking-wider text-slate-400">
                      {f.region}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">
                      {f.titel ?? f.windowId}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      {f.datum ? new Date(f.datum).toLocaleDateString('de-DE') : ''}
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {Object.entries(f.zaehler).map(([stand, n]) => (
                        <span key={stand} className="flex items-center gap-1.5">
                          <Marke stand={stand} />
                          <span className="text-xs tabular-nums text-slate-400">
                            {n}
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>

                  {offen === f.windowId && (
                    <div className="max-h-[24rem] overflow-y-auto border-t
                                    border-zinc-800">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-zinc-900">
                          <tr className="text-[10px] uppercase tracking-wider
                                         text-slate-500">
                            <th className="px-4 py-2 text-left font-medium">
                              <T>Match-ID</T></th>
                            <th className="px-4 py-2 text-left font-medium">
                              <T>Zeitpunkt</T></th>
                            <th className="px-4 py-2 text-center font-medium">
                              <T>Zustand</T></th>
                            <th className="px-4 py-2 text-right font-medium">
                              <T>Spieler</T></th>
                            <th className="px-4 py-2 text-right font-medium">
                              <T>Ereignisse</T></th>
                            <th className="px-4 py-2 text-left font-medium">
                              <T>Fehler</T></th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map((m) => (
                            <tr key={m.matchId} className="border-t border-zinc-900">
                              <td className="px-4 py-1.5 font-mono text-[11px]
                                             text-slate-500">
                                {m.matchId.slice(0, 16)}…
                              </td>
                              <td className="px-4 py-1.5 text-slate-500">
                                {m.zeitpunkt
                                  ? new Date(m.zeitpunkt).toLocaleString('de-DE')
                                  : '—'}
                              </td>
                              <td className="px-4 py-1.5 text-center">
                                <Marke stand={m.stand} />
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums
                                             text-slate-400">{m.konten ?? '—'}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums
                                             text-slate-400">{m.elims ?? '—'}</td>
                              <td className="px-4 py-1.5 text-rose-400/80">
                                {m.fehler ?? ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
