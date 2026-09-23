'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { GLOBALS_EVENT } from '@/lib/globalsCup';
import { flaggenPfad } from '@/components/TeamFlagge';

/*
 * Der Tipp auf den Ausgang der Global Championship.
 *
 * Gebaut wird eine Prognose im Admin-Werkzeug - dort legt der Betreiber die
 * Reihenfolge fest, und zwar von Hand. Diese Seite zeigt sie: die getippte
 * Reihenfolge mit Namen und Flaggen, und einen Weg in die ausfuehrliche
 * Prognoseseite mit Karte, Regionen und Preisgeld.
 *
 * Gibt es noch keine, steht das da. Eine Reihenfolge auszudenken waere das
 * Gegenteil dessen, wozu die Seite da ist.
 */

interface Team {
  key: string; namen: string[]; ids: string[];
  herkunft?: string[]; besterPlatz?: number; region?: string;
}
interface Quelle { eventId: string; windowId: string; region: string; titel: string }
interface Prognose {
  id: string; titel: string; cupTitel?: string; gruppe?: string;
  quellen?: Quelle[]; plaetze: Array<string | null>;
  feld?: Team[]; manuell?: Team[];
  geaendert?: number; oeffentlich?: boolean;
}
interface Profil { land?: string; anzeige?: string; name?: string }

/** Die Flagge als Bild - Windows zeichnet die Emoji nicht. */
function Flagge({ land }: { land: string | null | undefined }) {
  if (!land) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={flaggenPfad(land)} alt={land} title={land}
      className="mr-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full
                 object-cover align-[-2px] ring-1 ring-black/40" />
  );
}

/** Gehört diese Prognose zur Global Championship? */
function istGlobals(p: Prognose): boolean {
  if ((p.quellen ?? []).some((q) => q.eventId === GLOBALS_EVENT)) return true;
  return /global\s*championship|globals/i.test(`${p.titel} ${p.cupTitel ?? ''}`);
}

export default function GlobalsPredictions() {
  const [alle, setAlle] = useState<Prognose[] | null>(null);
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  const [laender, setLaender] = useState<Record<string, string>>({});
  const [nr, setNr] = useState(0);

  useEffect(() => {
    let weg = false;
    void Promise.all([
      fetch('/api/prognosen', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/spieler-profile').then((r) => r.json()).catch(() => null),
      fetch('/api/spieler-laender').then((r) => r.json()).catch(() => null),
    ]).then(([pg, pr, la]) => {
      if (weg) return;
      const liste: Prognose[] = Array.isArray(pg?.prognosen) ? pg.prognosen : [];
      setAlle(liste.filter(istGlobals));
      setProfile(pr?.profile ?? {});
      setLaender(la?.laender ?? {});
    });
    return () => { weg = true; };
  }, []);

  const prognose = alle?.[nr] ?? null;

  /** Zu einem Teamschlüssel die Spieler - Name und Flagge. */
  const teamVon = useMemo(() => {
    const karte = new Map<string, Team>();
    for (const t of [...(prognose?.feld ?? []), ...(prognose?.manuell ?? [])]) {
      karte.set(t.key, t);
    }
    return (key: string | null) => (key ? karte.get(key) ?? null : null);
  }, [prognose]);

  /** Der Name eines Kontos - gepflegt, sonst der Turniername. */
  function nameVon(id: string, ersatz: string): string {
    const pr = profile[id];
    return pr?.anzeige || pr?.name || ersatz.replace(/\[[^\]]*\]\s*/g, '').trim();
  }

  return (
    <GlobalsGeruest aktiv="/globals/predictions">
      {alle === null ? (
        <LadeSchirm />
      ) : !alle.length ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold text-slate-100">
            <T>Noch keine Prognose für die Globals</T>
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
            <T>Die Reihenfolge legst du im Prognose-Werkzeug fest. Hier steht
            danach, was du getippt hast — ausgedacht wird hier nichts.</T>
          </p>
          <Link href="/admin/predictions"
            className="mt-4 inline-block rounded-lg border border-amber-500/40
                       bg-amber-400/10 px-4 py-2 text-sm font-semibold
                       text-amber-200 transition hover:bg-amber-400/20">
            <T>Prognose anlegen</T>
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {alle.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setNr(i)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  i === nr
                    ? 'border-amber-400/60 bg-amber-400/15 font-semibold text-amber-200'
                    : 'border-zinc-800 text-slate-300 hover:border-zinc-700'}`}>
                {p.gruppe || p.titel}
              </button>
            ))}
            {prognose && (
              <Link href={`/predictions?id=${encodeURIComponent(prognose.id)}`}
                className="ml-auto rounded-lg border border-zinc-800 px-3 py-2
                           text-xs text-slate-400 transition
                           hover:border-amber-400/60 hover:text-amber-200">
                <T>Ausführliche Prognose</T>
              </Link>
            )}
          </div>

          {!prognose?.plaetze?.some(Boolean) ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3
                          text-sm text-slate-400">
              <T>Die Reihenfolge ist noch nicht gesetzt.</T>
            </p>
          ) : (
            <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {prognose.plaetze.map((key, i) => {
                const tm = teamVon(key);
                return (
                  <li key={`${key ?? 'leer'}-${i}`}
                    className="flex items-center gap-2.5 rounded-lg border
                               border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <span className={`w-6 shrink-0 text-center text-sm font-bold
                                      tabular-nums ${i < 3
                      ? 'text-amber-300' : 'text-slate-500'}`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {tm
                        ? tm.ids.map((id, j) => (
                          <span key={id} className="mr-2 whitespace-nowrap">
                            <Flagge land={profile[id]?.land || laender[id]} />
                            {nameVon(id, tm.namen[j] ?? '')}
                          </span>
                        ))
                        : <span className="text-slate-600"><T>offen</T></span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </GlobalsGeruest>
  );
}
