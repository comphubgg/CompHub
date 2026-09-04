'use client';

/*
 * Das eigene Abschneiden in einem Turnier.
 *
 * Vorher stand hier nur eine Auswahlliste mit Epics roher Kennung
 * ("s42_reload_duos_victory") und darunter ein paar Zahlen. Daran war weder
 * zu erkennen, welcher Cup gemeint war, noch welcher Tag, noch welche Region.
 *
 * Jetzt: ein Turnier, eine Region, und darunter der Weg hindurch - Runde fuer
 * Runde, mit dem eigenen Platz in jeder. Wer auf eine Runde klickt, sieht ihre
 * Zahlen im Einzelnen, dazu jedes Spiel des Tages.
 *
 * Alle Werte kommen aus Epics Bestenliste. Was Epic zu einem Cup nicht
 * mitliefert, steht auch hier nicht - lieber eine kurze Zeile "dazu gibt es
 * keine Angaben" als eine Zahl, die niemand nachrechnen kann. Und weil Epic
 * je Duo bucht und nicht je Person, gelten die Zahlen fuer das Team; das
 * gehoert dazugesagt, statt sie einem der beiden zuzuschreiben.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { rundenName } from '@/lib/rundenName';

export interface Fenster {
  eventId: string; windowId: string; region: string; name: string; ende: number;
}
export interface Turnier { id: string; titel: string; fenster: Fenster[] }

interface Spiel {
  sessionId?: string; endTime?: string; placement?: number;
  timeAlive?: number; elims?: number; wins?: number;
}
interface Eintrag {
  rank: number; points?: number; elims?: number; games?: number; wins?: number;
  bestPlace?: number; timeAlive?: number; kd?: number;
  avgPoints?: number; avgPlace?: number; avgElims?: number; avgTimeAlive?: number;
  damage?: number; damageTaken?: number; headshots?: number;
  matsGefarmt?: number; matsVerbaut?: number; heilung?: number; schild?: number;
  strecke?: number; kisten?: number;
  players?: Array<{ name: string; id?: string }>;
  matches?: Spiel[];
}

/** Sekunden als "1h 55m" oder "18m 20s" - so wie man es ausspricht. */
function dauer(s?: number): string | null {
  if (!s || s <= 0) return null;
  const st = Math.floor(s / 3600);
  const mi = Math.floor((s % 3600) / 60);
  if (st) return `${st}h ${mi}m`;
  return `${mi}m ${Math.round(s % 60)}s`;
}

/** Null heisst hier "Epic fuehrt dazu nichts" und faellt deshalb weg. */
function zahl(n?: number): string | null {
  if (!n) return null;
  return n.toLocaleString('en-US');
}

export default function MeinErgebnis(
  { epicId, turniere }: { epicId: string; turniere: Turnier[] },
) {
  const t = useT();
  const [cupId, setCupId] = useState('');
  /*
   * Region und Runde stehen hier als *Wunsch*, nicht als Ergebnis.
   *
   * Was wirklich gilt, wird beim Zeichnen bestimmt: passt der Wunsch nicht zum
   * gewaehlten Turnier, greift die erste Region beziehungsweise die letzte
   * Runde. So braucht es keinen Effekt, der nach jedem Wechsel aufraeumt - und
   * damit auch keine Kette von Neuzeichnungen.
   */
  const [regionWunsch, setRegionWunsch] = useState('');
  const [rundeWunsch, setRundeWunsch] = useState('');
  const [wege, setWege] = useState<
    { schluessel: string; karte: Record<string, Eintrag | null> } | null>(null);

  const cup = useMemo(
    () => turniere.find((g) => g.id === cupId) ?? null, [turniere, cupId]);

  /** Die Regionen, in denen dieses Turnier gespielt wurde. */
  const regionen = useMemo(() => {
    if (!cup) return [];
    return [...new Set(cup.fenster.map((f) => f.region))].sort();
  }, [cup]);

  const region = regionen.includes(regionWunsch) ? regionWunsch : regionen[0] ?? '';

  /** Die Runden dieser Region, in der Reihenfolge, in der sie liefen. */
  const runden = useMemo(() => {
    if (!cup || !region) return [];
    return cup.fenster.filter((f) => f.region === region)
      .sort((a, b) => a.ende - b.ende);
  }, [cup, region]);

  /** Wozu die geladenen Wege gehoeren - damit alte Zahlen nie neu erscheinen. */
  const schluessel = `${cupId}|${region}`;
  const geladen = wege?.schluessel === schluessel ? wege.karte : null;
  const laeuft = Boolean(cupId && runden.length) && !geladen;

  /*
   * Fuer jede Runde einmal nachsehen, ob das eigene Konto darin steht.
   *
   * Das ergibt den Weg durch das Turnier: wo man angetreten ist, wie weit man
   * kam und wo Schluss war. Epic laesst keine Abfrage ueber mehrere Runden zu,
   * also je Runde eine - die Antworten liegen serverseitig im Zwischenspeicher,
   * ein zweiter Aufruf kostet nichts.
   */
  useEffect(() => {
    if (!epicId || !runden.length) return;
    let weg = false;
    void (async () => {
      const paare = await Promise.all(runden.map(async (f) => {
        try {
          const r = await fetch('/api/cup-leaderboard'
            + `?event=${encodeURIComponent(f.eventId)}`
            + `&window=${encodeURIComponent(f.windowId)}`
            + `&ids=${encodeURIComponent(epicId)}`);
          const j = await r.json();
          const e = (j?.entries ?? [])[0] as Eintrag | undefined;
          return [f.windowId, e ?? null] as const;
        } catch {
          return [f.windowId, null] as const;
        }
      }));
      if (weg) return;
      const karte: Record<string, Eintrag | null> = {};
      for (const [k, v] of paare) karte[k] = v;
      setWege({ schluessel, karte });
    })();
    return () => { weg = true; };
  }, [epicId, runden, schluessel]);

  /*
   * Welche Runde gezeigt wird: die zuletzt angeklickte, sofern sie zu diesem
   * Turnier gehoert - sonst die letzte, in der man wirklich angetreten ist.
   * Genau die will man sehen, wenn man ein Turnier aufmacht.
   */
  const runde = useMemo(() => {
    if (rundeWunsch && runden.some((f) => f.windowId === rundeWunsch)) return rundeWunsch;
    if (geladen) {
      const letzte = [...runden].reverse().find((f) => geladen[f.windowId]);
      if (letzte) return letzte.windowId;
    }
    return runden[runden.length - 1]?.windowId ?? '';
  }, [rundeWunsch, runden, geladen]);

  const gewaehlt = runden.find((f) => f.windowId === runde) ?? null;
  const eintrag = runde && geladen ? geladen[runde] ?? null : null;

  const nameVon = useCallback((f: Fenster) =>
    rundenName(f.windowId, /Final/i.test(f.windowId), t)
      || f.name || f.windowId, [t]);

  const datum = (ms: number) => (ms
    ? new Date(ms).toLocaleDateString(undefined,
      { day: '2-digit', month: 'short', year: 'numeric' })
    : '');

  const feld = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 '
    + 'text-sm text-slate-100 outline-none focus:border-sky-500';

  /* Nur was Epic zu diesem Cup wirklich fuehrt. */
  const gruppen = useMemo(() => {
    if (!eintrag) return [];
    const roh: Array<{ titel: string; werte: Array<[string, string | null]> }> = [
      { titel: 'Ergebnis', werte: [
        ['Beste Platzierung', eintrag.bestPlace ? `#${eintrag.bestPlace}` : null],
        ['Punkte je Spiel', eintrag.avgPoints ? eintrag.avgPoints.toFixed(1) : null],
        ['Platz im Schnitt', eintrag.avgPlace ? `#${eintrag.avgPlace.toFixed(1)}` : null],
      ] },
      { titel: 'Kampf', werte: [
        ['Eliminierungen', zahl(eintrag.elims)],
        ['Eliminierungen je Spiel', eintrag.avgElims ? eintrag.avgElims.toFixed(2) : null],
        ['K/D', eintrag.kd ? eintrag.kd.toFixed(2) : null],
        ['Schaden ausgeteilt', zahl(eintrag.damage)],
        ['Schaden erhalten', zahl(eintrag.damageTaken)],
        ['Kopftreffer', zahl(eintrag.headshots)],
      ] },
      { titel: 'Überleben', werte: [
        ['Zeit am Leben', dauer(eintrag.timeAlive)],
        ['Zeit am Leben je Spiel', dauer(eintrag.avgTimeAlive)],
        ['Geheilt', zahl(eintrag.heilung)],
        ['Schild aufgebaut', zahl(eintrag.schild)],
      ] },
      { titel: 'Material und Wege', werte: [
        ['Material gefarmt', zahl(eintrag.matsGefarmt)],
        ['Material verbaut', zahl(eintrag.matsVerbaut)],
        ['Truhen geöffnet', zahl(eintrag.kisten)],
        ['Strecke', eintrag.strecke
          ? `${Math.round(eintrag.strecke / 100000).toLocaleString('en-US')} km` : null],
      ] },
    ];
    return roh
      .map((g) => ({ ...g, werte: g.werte.filter(([, v]) => v !== null) }))
      .filter((g) => g.werte.length);
  }, [eintrag]);

  /*
   * Platz, Punkte, Spiele, Siege - die vier Zahlen, nach denen zuerst gesehen
   * wird. Sie standen bisher in derselben kleinen Reihe wie alles andere; in
   * einer schmalen Spalte brachen die Bezeichnungen dann um und der ganze
   * Kopf las sich unruhig. Gross und einzeln beantworten sie die Frage sofort.
   */
  const kopfzahlen = useMemo(() => {
    if (!eintrag) return [];
    return ([
      ['Platz', `#${eintrag.rank}`],
      ['Punkte', zahl(eintrag.points)],
      ['Spiele', zahl(eintrag.games)],
      ['Siege', eintrag.wins ? String(eintrag.wins) : '0'],
    ] as Array<[string, string | null]>).filter(([, v]) => v !== null);
  }, [eintrag]);

  if (!epicId) {
    return (
      <p className="text-[11px] leading-relaxed text-slate-500">
        <T>Sobald der Betreiber dir dein Epic-Konto zugewiesen hat, steht hier
        dein eigener Turnierweg.</T>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Turnier und Region - beides in Klartext, nicht als Epic-Kennung. */}
      <div className="flex flex-wrap gap-2">
        <select value={cupId} onChange={(e) => setCupId(e.target.value)}
          className={`${feld} min-w-[16rem] flex-1`}>
          <option value="">{t('— Turnier wählen —')}</option>
          {turniere.map((g) => (
            <option key={g.id} value={g.id}>{g.titel}</option>
          ))}
        </select>
        {regionen.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {regionen.map((r) => (
              <button key={r} onClick={() => setRegionWunsch(r)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  r === region ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                    : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {!cupId && (
        <p className="text-[11px] text-slate-600">
          <T>Wähle ein Turnier — danach steht hier jede Runde, in der du
          angetreten bist.</T>
        </p>
      )}

      {/* Der Weg durch das Turnier. Eine Runde je Kachel, in der Reihenfolge,
          in der gespielt wurde; angeklickt zeigt sie ihre Zahlen darunter. */}
      {cupId && runden.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-2">
          {runden.map((f, i) => {
            const e = geladen?.[f.windowId];
            const dabei = Boolean(e);
            const aktiv = f.windowId === runde;
            return (
              <div key={f.windowId} className="flex items-stretch gap-2">
                {i > 0 && (
                  <span className="self-center text-xs text-slate-700">→</span>
                )}
                <button onClick={() => setRundeWunsch(f.windowId)}
                  className={`min-w-[9rem] rounded-lg border px-3 py-2 text-left
                              transition ${aktiv
                    ? 'border-sky-500 bg-sky-500/10'
                    : dabei ? 'border-zinc-700 hover:border-sky-700'
                      : 'border-zinc-800/70 opacity-50 hover:opacity-80'}`}>
                  <span className="block text-[11px] font-semibold text-slate-100">
                    {nameVon(f)}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {datum(f.ende)}
                  </span>
                  <span className={`mt-1 block text-[11px] ${dabei
                    ? 'text-sky-300' : 'text-slate-600'}`}>
                    {!geladen ? t('sucht …')
                      : dabei ? `#${e!.rank} · ${e!.points ?? 0} ${t('Punkte')}`
                        : t('nicht dabei')}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Die gewaehlte Runde im Einzelnen. */}
      {gewaehlt && eintrag && (
        <div className="space-y-4 rounded-xl border border-zinc-800
                        bg-zinc-950/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {(cup?.titel ?? '').split('·')[0].trim()} · {nameVon(gewaehlt)}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {gewaehlt.region} · {datum(gewaehlt.ende)}
              {eintrag.players?.length
                ? ` · ${eintrag.players.map((p) => p.name).join(' + ')}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg
                          border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
            {kopfzahlen.map(([k, v]) => (
              <div key={k} className="bg-zinc-950 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  <T>{k}</T>
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-100">
                  {v}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {gruppen.map((g) => (
              <div key={g.titel}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase
                              tracking-[0.14em] text-slate-500">
                  <T>{g.titel}</T>
                </p>
                <dl className="space-y-1">
                  {g.werte.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 text-[11px] leading-tight text-slate-500">
                        <T>{k}</T>
                      </dt>
                      <dd className="shrink-0 whitespace-nowrap text-[13px]
                                     tabular-nums text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          {/* Jedes Spiel des Tages. Genau die drei Angaben, die Epic je Spiel
              fuehrt - Punkte je Spiel gibt es dort nicht. */}
          {!!eintrag.matches?.length && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase
                            tracking-[0.14em] text-slate-500">
                <T>Spiel für Spiel</T>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[24rem] text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase
                                   tracking-wider text-slate-600">
                      <th className="py-1 pr-3 font-medium"><T>Spiel</T></th>
                      <th className="py-1 pr-3 font-medium"><T>Platzierung</T></th>
                      <th className="py-1 pr-3 font-medium"><T>Elims</T></th>
                      <th className="py-1 font-medium"><T>Zeit am Leben</T></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...eintrag.matches]
                      .sort((a, b) => (a.endTime ?? '').localeCompare(b.endTime ?? ''))
                      .map((m, i) => (
                        <tr key={m.sessionId ?? i}
                          className="border-t border-zinc-900">
                          <td className="py-1.5 pr-3 text-slate-500">{i + 1}</td>
                          <td className={`py-1.5 pr-3 tabular-nums ${
                            m.placement === 1 ? 'font-semibold text-amber-300'
                              : 'text-slate-200'}`}>
                            {m.placement ? `#${m.placement}` : '—'}
                          </td>
                          <td className="py-1.5 pr-3 tabular-nums text-slate-200">
                            {m.elims ?? 0}
                          </td>
                          <td className="py-1.5 tabular-nums text-slate-400">
                            {dauer(m.timeAlive) ?? '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ehrlich sagen, was fehlt, statt eine leere Spalte zu zeigen. */}
          <p className="text-[11px] leading-relaxed text-slate-600">
            {gruppen.length <= 1
              ? <T>Zu diesem Cup führt Epic nur Platz, Punkte und Spiele —
                Schaden, Material und Heilung bleiben dort leer.</T>
              : <T>Epic bucht je Duo, nicht je Person — diese Zahlen gelten
                für euch beide zusammen.</T>}
          </p>
        </div>
      )}

      {cupId && !laeuft && runden.length > 0 && !eintrag && (
        <p className="text-[11px] text-slate-600">
          <T>In diesem Turnier steht dein Konto in keiner Runde.</T>
        </p>
      )}
    </div>
  );
}
