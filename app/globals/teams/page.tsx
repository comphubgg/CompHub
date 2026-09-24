'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { GLOBALS_TAGE } from '@/lib/globalsCup';
import { flaggenPfad } from '@/components/TeamFlagge';

/*
 * Das Feld der Global Championship.
 *
 * Der Betreiber wollte unter /globals "die verschiedenen Team und aus
 * welchem Land" sehen. Die Teams kommen aus Epics Teilnehmerliste (siehe
 * /api/globals-teams), Land, Name und Foto vom gewoehnlichen Konto.
 *
 * Und dazu, nach seinem zweiten Blick: "mach die Bilder groesser ... lass
 * mich auf ein Duo druecken, und dann sehe ich eine Art Overview ueber das
 * Duo mit beiden Bildern gross und darunter deren letzten paar Cups der
 * ganzen Season, die sie zusammen gespielt haben." Genau das tut der Klick
 * auf eine Karte - siehe DuoAnsicht.
 */

interface Spieler {
  turnierId: string; epicId: string | null;
  name: string; anzeige: string; land: string | null;
  x: string | null; bild: string | null;
}
interface Team {
  rang: number; punkte: number; spiele: number; elims: number;
  /** Fuer welche Region das Team spielt, "EU" oder bei gemischten "NAC/EU". */
  region?: string | null;
  spieler: Spieler[];
}

/*
 * Die Flagge als Bild, nicht als Zeichen - Windows zeichnet die
 * Flaggen-Emoji nicht, dort standen sonst zwei Buchstaben.
 */
function Flagge({ land, groesse = 'h-4 w-4' }: { land: string | null; groesse?: string }) {
  if (!land) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={flaggenPfad(land)} alt={land} title={land}
      className={`${groesse} shrink-0 rounded-full object-cover ring-1 ring-black/40`} />
  );
}

/** Das Foto - oder ein ruhiges Feld mit dem Anfangsbuchstaben, nie ein Ersatzgesicht. */
function Foto({ s, klasse }: { s: Spieler; klasse: string }) {
  const [kaputt, setKaputt] = useState(false);
  if (s.bild && !kaputt) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={s.bild} alt="" onError={() => setKaputt(true)}
        className={`${klasse} shrink-0 object-cover object-[center_20%]`} />
    );
  }
  return (
    <span className={`${klasse} grid shrink-0 place-items-center bg-zinc-800/80
                      font-bold text-slate-500`}>
      {(s.anzeige || s.name).slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ------------------------------------------------------------ Duo-Ansicht */

interface Zeile {
  windowId: string; titel: string; season: string; datum: number;
  platz: number | null; punkte: number | null; elims: number | null;
  verdienst: number | null;
}

/**
 * Die gemeinsamen Cups eines Duos in der laufenden Saison.
 *
 * Vom Server fertig zusammengestellt (/api/globals-duo) - nur die
 * Spieltage, an denen beide Konten im selben Team standen. Vorher holte die
 * Ansicht dafuer die ganze Spielerakte und brauchte auf einem kalten Server
 * eine halbe Minute und mehr; der Betreiber: "das kann nicht sein."
 * Ohne beide Konto-Ids gibt es nichts Sicheres zu finden - dann null.
 */
async function gemeinsameCups(a: Spieler, b: Spieler): Promise<Zeile[] | null> {
  if (!a.epicId || !b.epicId) return null;
  const r = await fetch(`/api/globals-duo?a=${encodeURIComponent(a.epicId)}&b=${encodeURIComponent(b.epicId)}`,
    { signal: AbortSignal.timeout(45_000) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error ?? String(r.status));
  return d.zeilen ?? [];
}

/*
 * Wer aus welchem Land kommt - alle Laender auf einen Blick.
 *
 * Der Betreiber (#admin-todo, 24.9.2026): "wenn ich auf einen denen druecke,
 * soll so wie in Bild 2 eine Liste mit den Regionen kommen und wo welcher
 * von ist, also Land usw." Seit dem Abend desselben Tages eine eigene Ansicht
 * ("Nationalities") neben den Spielern und den Regionen. Jedes Land eine
 * Karte mit Flagge, Name, Zahl und seinen Spielern, das groesste zuerst.
 */
function LaenderRaster({ teams }: { teams: Team[] }) {
  const { sprache } = useSprache();
  const namen = useMemo(() => {
    try { return new Intl.DisplayNames([sprache === 'en' ? 'en' : 'de'], { type: 'region' }); }
    catch { return null; }
  }, [sprache]);
  const gruppen = useMemo(() => {
    const je = new Map<string, Spieler[]>();
    for (const tm of teams) for (const s of tm.spieler) {
      if (!s.land) continue;
      (je.get(s.land) ?? je.set(s.land, []).get(s.land)!).push(s);
    }
    return [...je.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [teams]);
  const ohne = teams.flatMap((tm) => tm.spieler).filter((s) => !s.land).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {gruppen.map(([land, spieler]) => (
          <div key={land} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 pb-2">
              <Flagge land={land} groesse="h-5 w-5" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
                {namen?.of(land) ?? land}
              </span>
              <span className="text-xs tabular-nums text-slate-500">{spieler.length}</span>
            </div>
            <ul className="space-y-1 text-center">
              {spieler.map((s) => (
                <li key={s.turnierId} className="truncate text-sm font-semibold uppercase
                                                 tracking-wide text-slate-200">
                  {s.anzeige}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {ohne > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {ohne} <T>Spieler ohne gepflegtes Land</T>
        </p>
      )}
    </>
  );
}

/*
 * Die Teams nach Wettkampfregion - EU, NA Central, NA West, Brasilien, Asien,
 * Middle East, Ozeanien. Jedes Team steht genau einmal, unter der Region
 * seiner Qualifikation (siehe /api/globals-teams).
 */
const REGIONEN: Array<[string, string]> = [
  ['EU', 'Europe'], ['NAC', 'NA Central'], ['NAW', 'NA West'], ['BR', 'Brazil'],
  ['ASIA', 'Asia'], ['ME', 'Middle East'], ['OCE', 'Oceania'],
];

function RegionenRaster({ teams, oeffnen }: { teams: Team[]; oeffnen: (t: Team) => void }) {
  const gruppen = REGIONEN
    .map(([kurz, name]) => ({
      kurz, name,
      teams: teams.filter((tm) => tm.region === kurz),
    }))
    .filter((g) => g.teams.length);
  const ohne = teams.filter((tm) => !tm.region).length;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {gruppen.map((g) => (
          <div key={g.kurz} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 pb-2">
              <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-black text-amber-200">
                {g.kurz}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{g.name}</span>
              <span className="text-xs tabular-nums text-slate-500">{g.teams.length}</span>
            </div>
            <ul className="space-y-1">
              {g.teams.map((tm) => (
                <li key={tm.rang}>
                  <button type="button" onClick={() => oeffnen(tm)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm
                               text-slate-200 transition hover:bg-zinc-800/70">
                    <span className="flex shrink-0 -space-x-1">
                      {tm.spieler.map((sp) => <Flagge key={sp.turnierId} land={sp.land} />)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {tm.spieler.map((sp) => sp.anzeige).join(' + ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {ohne > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {ohne} <T>Teams ohne bekannte Region</T>
        </p>
      )}
    </>
  );
}

function DuoAnsicht({ team, schliessen }: { team: Team; schliessen: () => void }) {
  const t = useT();
  const { sprache } = useSprache();
  const [zeilen, setZeilen] = useState<Zeile[] | null | 'fehler'>(null);
  const [a, b] = team.spieler;

  useEffect(() => {
    let weg = false;
    if (!a || !b) return;
    gemeinsameCups(a, b)
      .then((z) => { if (!weg) setZeilen(z ?? []); })
      .catch(() => { if (!weg) setZeilen('fehler'); });
    return () => { weg = true; };
  }, [a, b]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [schliessen]);

  const datum = (ms: number) => (ms
    ? new Date(ms).toLocaleDateString(sprache === 'en' ? 'en-GB' : 'de-DE',
      { day: '2-digit', month: '2-digit' })
    : '');

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto
                    bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      onClick={schliessen}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-500/30
                      bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Beide Spieler gross, nebeneinander */}
        <div className="relative grid grid-cols-2">
          {team.spieler.slice(0, 2).map((s) => (
            <div key={s.turnierId} className="relative aspect-[4/5] overflow-hidden">
              <Foto s={s} klasse="h-full w-full text-5xl" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="flex items-center gap-2">
                  <Flagge land={s.land} groesse="h-5 w-5" />
                  <p className="truncate text-xl font-black text-white">{s.anzeige}</p>
                </div>
                {s.x && (
                  <a href={`https://x.com/${s.x}`} target="_blank" rel="noreferrer"
                    className="mt-1 inline-block text-xs text-slate-300 hover:text-sky-400">
                    @{s.x}
                  </a>
                )}
              </div>
            </div>
          ))}
          {/* Vor dem ersten Match keine Platzierung - Epic fuehrt das Feld
              dann nur in irgendeiner Reihenfolge. */}
          {team.spiele > 0 && (
            <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1
                             text-sm font-bold text-amber-300">
              #{team.rang}
            </span>
          )}
          <button type="button" onClick={schliessen} aria-label={t('Schließen')}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full
                       bg-black/70 text-lg text-slate-200 transition hover:bg-black">
            ×
          </button>
        </div>

        {/* Ihre gemeinsamen Cups dieser Saison */}
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-amber-200">
            <T>Zusammen gespielt — diese Saison</T>
          </h3>
          {zeilen === null ? (
            <p className="py-6 text-center text-xs text-slate-500"><T>lädt …</T></p>
          ) : zeilen === 'fehler' ? (
            <p className="py-6 text-center text-xs text-slate-500">
              <T>Die Cups ließen sich gerade nicht laden.</T>
            </p>
          ) : !a?.epicId && !b?.epicId ? (
            <p className="py-6 text-center text-xs text-slate-500">
              <T>Zu diesem Duo kennt das Werkzeug keines der Konten — Cups gibt es deshalb keine.</T>
            </p>
          ) : !zeilen.length ? (
            <p className="py-6 text-center text-xs text-slate-500">
              <T>In dieser Saison haben die beiden keinen erfassten Cup zusammen gespielt.</T>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium"><T>Cup</T></th>
                    <th className="py-1.5 pr-2 font-medium"><T>Datum</T></th>
                    <th className="py-1.5 pr-2 text-right font-medium"><T>Platz</T></th>
                    <th className="py-1.5 pr-2 text-right font-medium"><T>Punkte</T></th>
                    <th className="py-1.5 pr-2 text-right font-medium"><T>Elims</T></th>
                    <th className="py-1.5 text-right font-medium"><T>Verdienst</T></th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {zeilen.map((z) => (
                    <tr key={z.windowId} className="border-t border-zinc-900">
                      <td className="max-w-[260px] truncate py-2 pr-2 text-slate-200">{z.titel}</td>
                      <td className="py-2 pr-2 text-slate-500">{datum(z.datum)}</td>
                      <td className={`py-2 pr-2 text-right font-semibold ${
                        z.platz && z.platz <= 3 ? 'text-amber-300' : 'text-slate-200'}`}>
                        {z.platz ? `#${z.platz}` : '–'}
                      </td>
                      <td className="py-2 pr-2 text-right text-slate-300">{z.punkte ?? '–'}</td>
                      <td className="py-2 pr-2 text-right text-slate-300">{z.elims ?? '–'}</td>
                      <td className="py-2 text-right text-emerald-300/90">
                        {z.verdienst ? `$${z.verdienst.toLocaleString('en-US')}` : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-600">
                <T>Elims je Spieler aus der Szene-Quelle, sonst aus unseren Replays; fehlt beides, steht ein Strich.</T>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

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
  const [zahlen, setZahlen] = useState({ zugeordnet: 0, spieler: 0, mitFoto: 0 });
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<Team | null>(null);
  /*
   * Drei Ansichten, gleichrangig nebeneinander: die Duos, die Laender, die
   * Regionen. Der Betreiber: "unter den Teams gibt es dann drei verschiedene
   * Funktionen - allgemein die Players, dann Nationalities, dann Region."
   */
  const [ansicht, setAnsicht] = useState<'spieler' | 'laender' | 'regionen'>('spieler');

  useEffect(() => {
    let weg = false;
    fetch(`/api/globals-teams?fenster=${encodeURIComponent(fenster)}`)
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        if (j?.error) { setFehler(String(j.error)); setTeams([]); return; }
        setTeams(Array.isArray(j.teams) ? j.teams : []);
        setZahlen({
          zugeordnet: j.zugeordnet ?? 0, spieler: j.spieler ?? 0, mitFoto: j.mitFoto ?? 0,
        });
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

  return (
    <GlobalsGeruest aktiv="/globals/teams">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-slate-500">
          <T>Auf ein Duo klicken — beide groß, dazu ihre gemeinsamen Cups dieser Saison.</T>
        </p>
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
          {/*
            * Die drei Ansichten als schmaler Umschalter, daneben die Zahl.
            * Der Betreiber (24.9.2026): die Laenderknoepfe oben weg, und "die
            * Filterungen zwischen Nationality, Regions und Player kleiner und
            * cleaner".
            */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-zinc-900/70 p-0.5 ring-1 ring-zinc-800">
              {([['spieler', 'Spieler'], ['laender', 'Nationalitäten'], ['regionen', 'Regionen']] as const)
                .map(([k, titel]) => (
                  <button key={k} type="button" onClick={() => setAnsicht(k)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${ansicht === k
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'text-slate-400 hover:text-slate-100'}`}>
                    <T>{titel}</T>
                  </button>
                ))}
            </div>
            <span className="text-xs tabular-nums text-slate-500">
              {teams.length} <T>Teams</T> · {zahlen.spieler} <T>Spieler</T>
            </span>
          </div>

          {ansicht === 'laender' && <LaenderRaster teams={gezeigt} />}
          {ansicht === 'regionen' && <RegionenRaster teams={gezeigt} oeffnen={setOffen} />}

          {/*
            * Die Duos als Karten - die Fotos gross, jedes mit Flagge und Namen
            * darunter. Ein Klick oeffnet die Duo-Ansicht.
            */}
          {ansicht === 'spieler' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {gezeigt.map((tm) => (
              <button key={tm.rang} type="button" onClick={() => setOffen(tm)}
                className="group relative overflow-hidden rounded-xl border border-zinc-800
                           bg-zinc-900/40 text-left transition hover:border-amber-400/50">
                <div className="grid grid-cols-2">
                  {tm.spieler.slice(0, 2).map((s) => (
                    <div key={s.turnierId} className="relative aspect-square overflow-hidden">
                      <Foto s={s} klasse="h-full w-full text-3xl transition duration-300 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2.5">
                        <Flagge land={s.land} />
                        <span className="truncate text-sm font-bold text-white">{s.anzeige}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Vor dem ersten Match keine Platzierung (siehe DuoAnsicht). */}
                {tm.spiele > 0 && (
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5
                                   text-xs font-bold tabular-nums text-amber-300">
                    #{tm.rang}
                  </span>
                )}
                {tm.spiele > 0 && (
                  <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5
                                   text-xs tabular-nums text-slate-200">
                    {tm.punkte} <T>Punkte</T>
                  </span>
                )}
              </button>
            ))}
          </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
            {t('Flagge und Name von {n} der {m} Konten, Fotos von {f} — Epic legt für '
              + 'das LAN eigene Konten an, zugeordnet wird über den Namen. Wer nicht '
              + 'eindeutig zuzuordnen ist, bleibt ohne Flagge; ein Foto kommt nur vom '
              + 'zugeordneten Konto selbst.')
              .replace('{n}', String(zahlen.zugeordnet))
              .replace('{m}', String(zahlen.spieler))
              .replace('{f}', String(zahlen.mitFoto))}
          </p>
        </>
      )}

      {offen && <DuoAnsicht team={offen} schliessen={() => setOffen(null)} />}
    </GlobalsGeruest>
  );
}
