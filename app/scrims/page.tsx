'use client';

// Scrims: die Übungsrunden der Community-Server (Noble, Vital, Manu …).
//
// Sie kommen nicht von Epic, sondern von Yunite - dem Discord-Bot, mit dem
// diese Server ihre Scrims veranstalten (siehe lib/yunite). Der Betreiber
// wollte das, was Fortnite Tracker unter "Scrims" zeigt, auf seiner eigenen
// Seite haben: "wenn sie live sind, sieht das dann mit dem Leaderboard aus,
// mit Statistics wie Wins, Matches, Points."
//
// Noch nicht für alle: "mach es aber nicht sichtbar … dass jetzt Coming Soon
// für jeden anderen außer Admin." Besucher sehen deshalb den Vorhang
// ("Something Big Is Coming"), der Betreiber die Sache selbst.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import { MARKE } from '@/lib/marke';

interface Server { guildId: string; name: string; bild: string | null; rechte: string[] }
interface Turnier {
  id: string; name: string; beschreibung?: string; bild?: string;
  teamGroesse: number; region: string; beginn: number; ende: number;
  art: string; bauen?: string | null; spielart?: string | null;
  live: boolean; vorbei: boolean;
}
interface Team {
  teamId: string;
  spieler: Array<{ name: string; epicId?: string; discordId?: string }>;
  platz: number; punkte: number; elims: number; matches: number; siege: number;
  elimsJeMatch: number; schnittPlatz: number; zeitSchnitt: number;
  spiele: Array<{ platz: number; elims: number; punkte: number; zeitpunkt: number; zaehlt: boolean }>;
}
interface Runde {
  sessionId: string; zeitpunkt: number; gastgeber: string | null;
  spieler: number; gewertet: string; ignoriert: boolean;
}

/** Wie viele Spieler ein Team hat - als Wort, wie im Turnierbereich. */
const GROESSE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad' };

function uhr(ms: number, sprache: string) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE',
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/*
 * Der Hintergrund: schwarz mit feinen Punkten, darüber ein Schimmer im Blau
 * der Startseite. Der Betreiber über das Vorbild: "vom Hintergrund ist so
 * mit Punkten schwarz … und diese transparente Schwarz, das finde ich
 * maximal." Also keine farbigen Rahmen um die Kacheln, sondern durchscheinendes
 * Schwarz auf einem Punkteraster.
 */
const PUNKTE = {
  backgroundImage:
    'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),'
    + 'radial-gradient(60% 50% at 50% 0%, rgba(14,165,233,0.10), transparent 70%)',
  backgroundSize: '22px 22px, 100% 100%',
} as const;

export default function ScrimsSeite() {
  const { sprache, t } = useSprache();
  const zugang = useZugang();
  const [server, setServer] = useState<Server[]>([]);
  const [turniere, setTurniere] = useState<Turnier[]>([]);
  const [offen, setOffen] = useState<Turnier | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [runden, setRunden] = useState<Runde[]>([]);
  /*
   * Erst laden, wenn feststeht, wer da ist: ein Besucher sieht den Vorhang
   * und soll gar nichts anfragen.
   */
  const [laedt, setLaedt] = useState(true);
  const [laedtCup, setLaedtCup] = useState(false);
  const [hinweis, setHinweis] = useState('');
  const [region, setRegion] = useState('alle');

  const darf = zugang.admin;

  /** Die freigeschalteten Server und ihre Scrims - alles in einem Zug. */
  const holen = useCallback(async () => {
    setHinweis('');
    try {
      const d = await fetch('/api/scrims').then((r) => r.json());
      if (d.error === 'nicht-eingerichtet' || d.eingerichtet === false) {
        setHinweis('nicht-eingerichtet'); setServer([]); setTurniere([]); return;
      }
      const liste: Server[] = d.server ?? [];
      setServer(liste);
      if (!liste.length) { setHinweis('kein-server'); setTurniere([]); return; }

      const alle: Turnier[] = [];
      let ohnePremium = 0;
      for (const s of liste) {
        const e = await fetch(`/api/scrims?server=${encodeURIComponent(s.guildId)}`).then((r) => r.json());
        if (e.error === 'kein-premium') { ohnePremium += 1; continue; }
        for (const x of e.turniere ?? []) alle.push({ ...x, serverName: s.name, serverBild: s.bild } as Turnier);
      }
      alle.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.beginn - a.beginn);
      setTurniere(alle);
      if (!alle.length) setHinweis(ohnePremium ? 'kein-premium' : 'keine-scrims');
    } catch {
      setHinweis('fehler');
    } finally { setLaedt(false); }
  }, []);

  /*
   * Geholt wird nach dem Aufbau, nicht waehrend dessen: der Ladezustand
   * steht schon vorher auf "laedt", sobald feststeht, dass hier ein
   * Betreiber sitzt - so setzt der Effekt selbst keinen Zustand.
   */
  useEffect(() => {
    if (zugang.laedt || !darf) return;
    const id = setTimeout(() => { void holen(); }, 0);
    return () => clearTimeout(id);
  }, [zugang.laedt, darf, holen]);

  /** Ein Scrim öffnen: Bestenliste und Runden dazu. */
  async function oeffnen(tn: Turnier & { guildId?: string }) {
    setOffen(tn); setTeams([]); setRunden([]); setLaedtCup(true);
    try {
      const gid = (tn as { guildId?: string }).guildId ?? server[0]?.guildId;
      const d = await fetch(`/api/scrims?server=${encodeURIComponent(gid ?? '')}`
        + `&turnier=${encodeURIComponent(tn.id)}`).then((r) => r.json());
      setTeams(d.teams ?? []);
      setRunden(d.runden ?? []);
    } catch { /* dann bleibt es leer, der Hinweis steht unten */ }
    finally { setLaedtCup(false); }
  }

  const regionen = useMemo(
    () => [...new Set(turniere.map((x) => x.region).filter(Boolean))].sort(), [turniere]);
  const gezeigt = useMemo(
    () => (region === 'alle' ? turniere : turniere.filter((x) => x.region === region)), [turniere, region]);

  /* ------------------------------------------------------------ Vorhang */

  if (!zugang.laedt && !darf) {
    return (
      <main className="relative flex-1 overflow-hidden bg-zinc-950 text-slate-200" style={PUNKTE}>
        <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center
                        justify-center px-4 py-20 text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-sky-500/20 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARKE.logoFrei} alt="" className="h-28 w-28 opacity-90" />
          </div>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-100 sm:text-5xl">
            <T>Something Big Is Coming</T>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
            <T>Scrims der Community-Server — Leaderboards, Sessions und Statistiken,
            direkt auf CompHub.</T>
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/events"
              className="rounded-xl border border-zinc-800 bg-black/40 px-5 py-2.5 text-sm
                         font-semibold text-slate-300 transition hover:border-sky-500
                         hover:text-sky-400">
              <T>Zu den Turnieren</T>
            </Link>
            <a href={MARKE.discord} target="_blank" rel="noreferrer"
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white
                         transition hover:bg-sky-400">
              <T>Im Discord erfahren, wann es losgeht</T>
            </a>
          </div>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------- Die Ansicht */

  return (
    <main className="relative flex-1 bg-zinc-950 px-4 py-6 text-slate-200" style={PUNKTE}>
      <div className="mx-auto max-w-[1500px]">

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-100"><T>Scrims</T></h1>
            <p className="mt-1 text-sm text-slate-500">
              <T>Übungsrunden der Community-Server — Leaderboard, Sessions und Statistiken.</T>
            </p>
          </div>
          {/* Der Umschalter zwischen Epics Turnieren und den Scrims. */}
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-black/40 p-1">
            <Link href="/events"
              className="rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-400
                         transition hover:text-slate-200">
              <T>Fortnite Events</T>
            </Link>
            <span className="rounded-md bg-sky-500 px-3.5 py-1.5 text-xs font-medium text-white">
              <T>Scrims</T>
            </span>
          </div>
        </div>

        {regionen.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {['alle', ...regionen].map((r) => (
              <button key={r} onClick={() => setRegion(r)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  region === r
                    ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                    : 'border-zinc-800 bg-black/40 text-slate-400 hover:text-slate-200'}`}>
                {r === 'alle' ? t('Alle Regionen') : r}
              </button>
            ))}
          </div>
        )}

        {laedt || zugang.laedt ? <LadeSchirm /> : hinweis ? (
          <div className="rounded-xl border border-zinc-800 bg-black/40 p-6 text-center text-sm text-slate-400">
            {hinweis === 'nicht-eingerichtet' && (
              <T>Yunite ist noch nicht eingerichtet — es fehlt der Schlüssel der App.</T>
            )}
            {hinweis === 'kein-server' && (
              <T>Noch hat kein Discord-Server die App freigeschaltet. Sobald einer es tut, stehen seine Scrims hier.</T>
            )}
            {hinweis === 'kein-premium' && (
              <T>Der freigeschaltete Server hat kein Yunite-Premium — ohne das gibt Yunite seine Scrims nicht heraus.</T>
            )}
            {hinweis === 'keine-scrims' && <T>Dieser Server hat noch keine Scrims veranstaltet.</T>}
            {hinweis === 'fehler' && <T>Yunite antwortet gerade nicht.</T>}
          </div>
        ) : offen ? (
          /* ---------------------------------------------- Ein Scrim offen */
          <div>
            <button onClick={() => setOffen(null)}
              className="mb-3 rounded-lg border border-zinc-800 bg-black/40 px-3 py-1.5
                         text-xs text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
              ← <T>Alle Scrims</T>
            </button>

            <div className="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-black/40">
              <div className="flex flex-wrap items-center gap-4 p-4">
                {offen.bild && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={offen.bild} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-slate-100">{offen.name}</h2>
                  <p className="text-xs text-slate-500">
                    {offen.region} · {GROESSE[offen.teamGroesse] ?? `${offen.teamGroesse}er`}
                    {offen.bauen === 'ZERO_BUILD' && <> · Zero Build</>}
                    {' · '}{uhr(offen.beginn, sprache)}
                    {offen.live && <span className="ml-2 font-semibold text-rose-400">LIVE</span>}
                  </p>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-lg font-bold text-slate-100">{teams.length}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500"><T>Teams</T></p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-100">{runden.filter((r) => !r.ignoriert).length}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500"><T>Runden</T></p>
                  </div>
                </div>
              </div>
            </div>

            {laedtCup ? <LadeSchirm /> : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Das Leaderboard */}
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black/40">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2 text-right font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Team</th>
                        <th className="px-3 py-2 text-right font-medium"><T>Punkte</T></th>
                        <th className="px-3 py-2 text-right font-medium"><T>Elims</T></th>
                        <th className="px-3 py-2 text-right font-medium"><T>Siege</T></th>
                        <th className="px-3 py-2 text-right font-medium"><T>Ø Platz</T></th>
                        <th className="px-4 py-2 text-right font-medium"><T>Spiele</T></th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((x) => (
                        <tr key={x.teamId} className="border-b border-zinc-900 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-400">{x.platz}</td>
                          <td className="px-3 py-2">
                            <span className="flex flex-col leading-tight">
                              {x.spieler.map((s, i) => (
                                <span key={i} className="truncate text-slate-100">{s.name}</span>
                              ))}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-sky-400">{x.punkte}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{x.elims}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">{x.siege}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                            {x.schnittPlatz ? x.schnittPlatz.toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-400">{x.matches}</td>
                        </tr>
                      ))}
                      {!teams.length && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">
                          <T>Zu diesem Scrim liegt noch keine Bestenliste vor.</T>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Die Runden */}
                <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-100"><T>Runden</T></h3>
                  <div className="space-y-1">
                    {runden.map((r, i) => (
                      <div key={r.sessionId + i}
                        className="flex items-center justify-between gap-2 rounded-lg
                                   border border-zinc-800/80 px-2.5 py-1.5 text-xs">
                        <span className="text-slate-300">
                          <T>Runde</T> {runden.length - i}
                          <span className="ml-1.5 text-slate-500">{uhr(r.zeitpunkt, sprache)}</span>
                        </span>
                        <span className={r.ignoriert ? 'text-slate-600'
                          : r.gewertet === 'SCORED' ? 'text-emerald-400' : 'text-amber-400'}>
                          {r.ignoriert ? t('nicht gewertet')
                            : r.gewertet === 'SCORED' ? `${r.spieler} ${t('Spieler')}` : t('wird gewertet')}
                        </span>
                      </div>
                    ))}
                    {!runden.length && (
                      <p className="py-4 text-center text-xs text-slate-500"><T>Noch keine Runde gespielt.</T></p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ------------------------------------------------ Die Kacheln */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gezeigt.map((tn) => {
              const s = server.find((x) => (tn as { guildId?: string }).guildId === x.guildId) ?? server[0];
              return (
                <button key={tn.id} onClick={() => oeffnen({ ...tn, guildId: s?.guildId })}
                  className="group overflow-hidden rounded-xl border border-zinc-800 bg-black/40
                             text-left transition hover:border-sky-500/60">
                  <div className="relative h-40 w-full overflow-hidden bg-zinc-900">
                    {tn.bild ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={tn.bild} alt="" loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br
                                      from-sky-900/60 to-zinc-950 px-4">
                        <span className="text-center text-sm font-bold uppercase tracking-wide text-white/70">
                          {tn.name}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      {tn.live ? (
                        <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold
                                         uppercase tracking-wider text-white">Live</span>
                      ) : (
                        <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold
                                         uppercase tracking-wider text-slate-300">
                          {uhr(tn.beginn, sprache).slice(0, 5)}
                        </span>
                      )}
                      {tn.art === 'SCRIM' && (
                        <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold
                                         uppercase tracking-wider text-slate-300">Scrim</span>
                      )}
                    </div>
                    {tn.region && (
                      <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5
                                       text-[10px] font-semibold uppercase tracking-wider text-slate-200">
                        {tn.region}
                      </span>
                    )}
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <h3 className="truncate text-sm font-semibold text-slate-100">{tn.name}</h3>
                    <p className="truncate text-xs text-slate-500">
                      {GROESSE[tn.teamGroesse] ?? `${tn.teamGroesse}er`}
                      {tn.bauen === 'ZERO_BUILD' && <> · Zero Build</>}
                      {s?.name && <> · {s.name}</>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
