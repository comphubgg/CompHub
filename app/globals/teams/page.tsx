'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { GLOBALS_TAGE } from '@/lib/globalsCup';
import { flaggenPfad } from '@/components/TeamFlagge';

/*
 * Das Feld der Global Championship.
 *
 * Der Betreiber wollte unter /globals "die verschiedenen Team und aus
 * welchem Land" sehen. Die Teams kommen aus Epics Teilnehmerliste (siehe
 * /api/globals-teams), das Land aus den gepflegten Profilen.
 *
 * Was sich nicht zuordnen laesst, bleibt ohne Flagge - Epic legt fuer das
 * LAN eigene Konten an, und ein Name, der zwei Konten tragen koennte,
 * bekommt lieber keine Flagge als eine falsche.
 */

interface Spieler {
  turnierId: string; epicId: string | null;
  name: string; anzeige: string; land: string | null;
  x: string | null; bild: string | null;
}
interface Team {
  rang: number; punkte: number; spiele: number; elims: number;
  spieler: Spieler[];
}

/*
 * Die Flagge als Bild, nicht als Zeichen.
 *
 * Windows zeichnet die Flaggen-Emoji nicht - dort standen statt der Flagge
 * die beiden Buchstaben ("CH", "US"). Das Werkzeug hat die Flaggen laengst
 * als Dateien, und dieselben benutzt auch die Prognoseseite.
 */
function Flagge({ land, gross = false }: { land: string | null; gross?: boolean }) {
  if (!land) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={flaggenPfad(land)} alt={land} title={land}
      className={`${gross ? 'h-4 w-4' : 'h-3.5 w-3.5'} shrink-0 rounded-full
                  object-cover ring-1 ring-black/40`} />
  );
}

export default function GlobalsTeams() {
  const t = useT();
  /*
   * Das Feld steht an beiden Tagen fest - dieselben fuenfzig Duos. Der
   * Betreiber: "unter Teams muss es ja eigentlich kein Day 2 geben, das
   * sind ja die gleichen Teams." Gelesen wird deshalb Day 1, ohne Wahl.
   */
  const fenster = GLOBALS_TAGE[0].windowId;
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [zahlen, setZahlen] = useState({ zugeordnet: 0, spieler: 0 });
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let weg = false;
    setTeams(null);
    setFehler('');
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(fenster)}`)
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        if (j?.error) { setFehler(String(j.error)); setTeams([]); return; }
        setTeams(Array.isArray(j.teams) ? j.teams : []);
        setZahlen({ zugeordnet: j.zugeordnet ?? 0, spieler: j.spieler ?? 0 });
      })
      .catch((e) => { if (!weg) { setFehler((e as Error).message); setTeams([]); } });
    return () => { weg = true; };
  }, [fenster]);

  const gezeigt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q || !teams) return teams ?? [];
    return teams.filter((tm) => tm.spieler.some((s) =>
      s.anzeige.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
  }, [teams, suche]);

  /** Wie viele Teams je Land - die kleine Übersicht oben. */
  const laender = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const tm of teams ?? []) {
      for (const s of tm.spieler) {
        if (!s.land) continue;
        zaehler.set(s.land, (zaehler.get(s.land) ?? 0) + 1);
      }
    }
    return [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
  }, [teams]);

  return (
    <GlobalsGeruest aktiv="/globals/teams">
      <div className="mb-4 flex flex-wrap items-end justify-end gap-3">
        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Spieler suchen')}
          className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-950
                     px-3 py-2 text-sm text-slate-100 outline-none
                     placeholder:text-slate-600 focus:border-amber-400/60" />
      </div>

      {teams === null ? (
        <LadeSchirm />
      ) : fehler ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3
                      text-sm text-amber-300">
          {fehler}
        </p>
      ) : !teams.length ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3
                      text-sm text-slate-400">
          <T>Epic führt zu diesem Spieltag noch keine Teilnehmerliste. Sobald
          sie steht, stehen die Teams hier — erfunden wird hier nichts.</T>
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-amber-500/25 bg-zinc-900/60
                             px-3 py-1.5 text-xs text-amber-200/90">
              {teams.length} <T>Teams</T> · {zahlen.spieler} <T>Spieler</T>
            </span>
            {laender.slice(0, 12).map(([land, n]) => (
              <span key={land}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800
                           bg-zinc-900/40 px-2.5 py-1.5 text-xs text-slate-300">
                <Flagge land={land} gross /> {land}
                <span className="text-slate-500">{n}</span>
              </span>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            {gezeigt.map((tm) => (
              <div key={tm.rang}
                className="flex items-center gap-3 rounded-xl border border-zinc-800
                           bg-zinc-900/40 px-3 py-2.5">
                <span className="w-8 shrink-0 text-center text-sm font-bold
                                 tabular-nums text-amber-300/80">
                  {tm.rang}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {tm.spieler.map((s) => (
                    <div key={s.turnierId} className="flex min-w-0 items-center gap-2">
                      {s.bild ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.bild} alt=""
                          className="h-7 w-7 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="h-7 w-7 shrink-0 rounded bg-zinc-800" />
                      )}
                      <Flagge land={s.land} />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                        {s.anzeige}
                      </span>
                      {s.x && (
                        <a href={`https://x.com/${s.x}`} target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[11px] text-slate-600
                                     transition hover:text-sky-400">
                          @{s.x}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                {tm.spiele > 0 && (
                  <span className="shrink-0 text-right text-xs tabular-nums
                                   text-slate-400">
                    {tm.punkte}
                    <span className="block text-[10px] text-slate-600">
                      <T>Punkte</T>
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
            {t('Flagge und Foto von {n} der {m} Konten — Epic legt für das LAN '
              + 'eigene Konten an, zugeordnet wird über den Namen. Wer nicht '
              + 'eindeutig zuzuordnen ist, bleibt ohne Flagge.')
              .replace('{n}', String(zahlen.zugeordnet))
              .replace('{m}', String(zahlen.spieler))}
          </p>
        </>
      )}
    </GlobalsGeruest>
  );
}
