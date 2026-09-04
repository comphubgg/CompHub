'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { namensSchluessel } from '@/lib/homoglyph';

// Das Player Center.
//
// Flagge und X-Konto wurden bisher im Beitrags-Panel gepflegt - zwischen den
// Kacheln eines einzelnen Spieltags. Das hiess: wer gerade nicht mitspielte,
// war nicht zu erreichen, und wer in mehreren Cups antrat, tauchte immer
// wieder auf. Hier steht stattdessen das ganze Archiv, nach Heimatregion
// geordnet, und jede Zeile laesst sich an Ort und Stelle bearbeiten.
//
// Geschluesselt wird ueber die Epic-Konto-ID. Namen wechseln von Turnier zu
// Turnier; wer danach zuordnet, heftet einem Nachahmer die Flagge des Profis
// an - genau der Fehler, wegen dem die Zuordnung einmal umgestellt wurde.

interface Spieler {
  epicId: string; name: string; turniername: string; namen: string[];
  region: string; land: string; landQuelle: string; x: string;
  gepflegt: boolean; foto: string | null;
  matches: number; events: number; elims: number;
}

/**
 * Die Reiter. "alle" steht voran: manchmal sucht man jemanden, ohne zu
 * wissen, wo er zu Hause ist - und dann ist ein Reiter nach dem anderen
 * durchzuklicken die falsche Bedienung.
 */
/**
 * Die Filter - und welche sich gegenseitig ausschliessen.
 *
 * "mit Foto" und "ohne Foto" zusammen ergaeben nie einen Treffer. Statt den
 * Nutzer in diese Leere laufen zu lassen, loest der eine den anderen ab;
 * genau so verhalten sich "ohne @-Konto" und "selbst eingetragen" nicht -
 * die duerfen zusammen stehen.
 */
type Filterart = 'ohneFlagge' | 'ohneKonto' | 'mitFoto' | 'ohneFoto' | 'selbst';

const FILTER: Array<{ wert: Filterart; titel: string; gegenteil?: Filterart }> = [
  { wert: 'ohneFlagge', titel: 'ohne Flagge' },
  { wert: 'ohneKonto', titel: 'ohne @-Konto' },
  { wert: 'mitFoto', titel: 'mit Foto', gegenteil: 'ohneFoto' },
  { wert: 'ohneFoto', titel: 'ohne Foto', gegenteil: 'mitFoto' },
  { wert: 'selbst', titel: 'selbst eingetragen' },
];

const REGIONEN = ['alle', 'EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/** Wie viele Zeilen auf einmal - der Rest kommt auf Knopfdruck. */
const SCHRITT = 150;

const zahl = (n: number) => n.toLocaleString('de-DE');

/** Das Flaggenbild aus dem eigenen Ordner - Windows hat keine Flaggenschrift. */
function Flagge({ land }: { land: string }) {
  if (!land || !/^[A-Za-z]{2}$/.test(land)) {
    return <span className="inline-block w-[22px] text-center text-slate-700">–</span>;
  }
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={`/flags/${land.toLowerCase()}.png`} alt={land.toUpperCase()}
    title={land.toUpperCase()} width={22} height={15}
    className="inline-block rounded-[2px]" />;
}

export default function PlayerCenter() {
  const t = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [region, setRegion] = useState('EU');
  const [alle, setAlle] = useState<Spieler[]>([]);
  const [jeRegion, setJeRegion] = useState<Record<string, number>>({});
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  /**
   * Mehrere Filter zugleich.
   *
   * Ein einzelner Filter beantwortet selten die Frage, die man wirklich hat.
   * "Wer ist wichtig genug fuer einen Beitrag, hat aber noch kein X-Konto?"
   * heisst: mit Foto UND ohne @-Konto. Deshalb ein Satz statt eines Wertes -
   * verbunden mit UND, denn jeder Filter engt weiter ein.
   *
   * Ein leerer Satz heisst "alle".
   */
  const [filter, setFilter] = useState<Set<Filterart>>(new Set());
  const [menge, setMenge] = useState(SCHRITT);
  /** Ab wie vielen Matches jemand ueberhaupt auftaucht. */
  const [mindestens, setMindestens] = useState(20);

  // Was gerade bearbeitet wird
  const [offen, setOffen] = useState<string | null>(null);
  const [eLand, setELand] = useState('');
  const [eX, setEX] = useState('');
  /** Der Anzeigename - was im Beitrag steht, wenn kein @-Konto da ist. */
  const [eName, setEName] = useState('');
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    fetch('/api/auth/check-admin')
      .then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true))
      .catch(() => setIstAdmin(false));
  }, []);

  /*
   * Die Liste holen.
   *
   * Der Abruf startet einen Mikrotask spaeter: ein Effekt, der noch im selben
   * Durchlauf Zustand setzt, loest eine zweite Renderrunde aus, bevor die
   * erste fertig ist. Der Abruf ist ohnehin asynchron - ihn eine
   * Warteschlange spaeter zu beginnen kostet nichts.
   */
  useEffect(() => {
    let weg = false;
    void Promise.resolve().then(async () => {
      setLaedt(true);
      try {
        const r = await fetch(
          '/api/spieler-center?region='
          + encodeURIComponent(region === 'alle' ? '' : region)
          + `&mindestens=${mindestens}`, { cache: 'no-store' });
        const j = await r.json();
        if (weg) return;
        setAlle(j?.spieler ?? []);
        setJeRegion(j?.jeRegion ?? {});
      } catch { if (!weg) setAlle([]); }
      finally { if (!weg) setLaedt(false); }
    });
    return () => { weg = true; };
  }, [region, mindestens]);

  /*
   * Die Anzahl gezeigter Zeilen wird dort zurueckgesetzt, wo sich die Auswahl
   * aendert - nicht in einem Effekt. Ein Effekt dafuer waere eine zweite
   * Renderrunde fuer etwas, das der Klick ohnehin schon weiss.
   */
  const waehle = <T,>(setzen: (w: T) => void) => (wert: T) => {
    setzen(wert);
    setMenge(SCHRITT);
  };

  /**
   * Was zu sehen ist.
   *
   * Die Suche geht ueber alle Namen eines Kontos, nicht nur den aktuellen:
   * wer "scroll" tippt, findet ihn auch, wenn er zuletzt als "AG Scroll 10!"
   * antrat. Ueber die Konto-ID laesst sich ebenfalls suchen - manchmal hat
   * man nur die.
   */
  const q = namensSchluessel(suche);
  const gezeigt = alle.filter((s) => {
    // UND, nicht ODER: jeder gewaehlte Filter engt weiter ein.
    if (filter.has('ohneFlagge') && s.land) return false;
    if (filter.has('ohneKonto') && s.x) return false;
    if (filter.has('mitFoto') && !s.foto) return false;
    if (filter.has('ohneFoto') && s.foto) return false;
    if (filter.has('selbst') && !s.gepflegt) return false;
    if (!suche.trim()) return true;
    if (s.epicId.startsWith(suche.trim().toLowerCase())) return true;
    if (q.length < 2) return false;
    return [s.name, s.turniername, s.x, ...s.namen]
      .filter(Boolean).some((n) => namensSchluessel(n).includes(q));
  });

  const oeffnen = (s: Spieler) => {
    setOffen(s.epicId);
    // Die Flagge aus der Quelle wird vorbelegt: sonst muesste man abtippen,
    // was danebensteht - und ein leeres Feld beim Speichern loeschte sie.
    setELand(s.land);
    setEX(s.x);
    // Nur einen selbst gesetzten Namen vorbelegen. Stuende hier der
    // Turniername, machte das blosse Oeffnen und Speichern ihn dauerhaft -
    // und beim naechsten Namenswechsel des Spielers waere er veraltet.
    setEName(s.name === s.turniername ? '' : s.name);
  };

  const speichern = useCallback(async (s: Spieler) => {
    setSpeichert(true);
    try {
      const r = await fetch('/api/spieler-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.epicId, name: s.turniername,
          land: eLand.trim().toUpperCase(), x: eX.trim().replace(/^@/, ''),
          anzeige: eName.trim(),
        }),
      });
      if (!r.ok) return;
      const j = await r.json();
      setAlle((vorher) => vorher.map((x) => (x.epicId === s.epicId ? {
        ...x,
        name: j.profile?.anzeige || x.turniername,
        land: j.profile?.land ?? '',
        landQuelle: j.profile?.land ? 'gepflegt' : x.landQuelle,
        x: j.profile?.x ?? '',
        gepflegt: Boolean(j.profile),
      } : x)));
      setOffen(null);
    } finally { setSpeichert(false); }
  }, [eLand, eX, eName]);

  if (istAdmin === false) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-16 text-center">
        <p className="text-sm text-slate-500">
          <T>Dieser Bereich ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="text-2xl font-bold"><T>Player Center</T></h1>
          {/* Zwei Wege zurueck: der Browserverlauf fuer den Weg, den man
              gekommen ist, und der feste Link ins Dashboard. Wer ueber einen
              Lesezeichen-Link hier landet, hat keinen Verlauf. */}
          <button onClick={() => window.history.back()}
            className="rounded-lg border border-zinc-800 px-3 py-1 text-xs
                       text-slate-400 transition hover:border-sky-500/60
                       hover:text-sky-400">
            ← <T>zurück</T>
          </button>
          <Link href="/admin"
            className="text-xs text-slate-500 transition hover:text-sky-400">
            <T>Dashboard</T>
          </Link>
          <span className="ml-auto text-xs text-slate-600">
            <T>Flagge und @-Konto hängen an der Konto-ID, nicht am Namen —
            ein Namenswechsel ändert nichts.</T>
          </span>
        </div>

        {/* ------------------------------------------------------ Regionen */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {REGIONEN.map((r) => (
            <button key={r} onClick={() => waehle(setRegion)(r)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold
                          transition ${region === r
                ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
              <T>{r}</T>
              <span className="ml-1.5 font-normal tabular-nums text-slate-600">
                {jeRegion[r] ?? '–'}
              </span>
            </button>
          ))}
        </div>

        {/* ------------------------------------------ Suche und Filter */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input value={suche}
            onChange={(e) => waehle(setSuche)(e.target.value)}
            placeholder={t('Name, alter Name oder Konto-ID')}
            spellCheck={false}
            className="w-72 max-w-full rounded-lg border border-zinc-800
                       bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100
                       outline-none placeholder:text-slate-600
                       focus:border-sky-500" />

          <span className="flex flex-wrap items-center gap-1">
            <button onClick={() => waehle(setFilter)(new Set<Filterart>())}
              className={`rounded-md border px-2 py-0.5 text-[11px] transition
                          ${!filter.size
                ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
              <T>alle</T>
            </button>

            {FILTER.map((f) => (
              <button key={f.wert}
                title={t('Mit Umschalt anklicken, um mehrere zu verbinden')}
                onClick={(e) => {
                  /*
                   * Ein Klick waehlt genau diesen Filter. Mit gedrueckter
                   * Umschalttaste kommt er dazu oder faellt weg - so wie
                   * man es aus jeder Dateiliste kennt.
                   *
                   * Ein Gegenteil weicht dabei: "mit Foto" und "ohne Foto"
                   * zusammen faenden nie jemanden.
                   */
                  const naechster = new Set(e.shiftKey ? filter : []);
                  if (naechster.has(f.wert)) naechster.delete(f.wert);
                  else {
                    naechster.add(f.wert);
                    if (f.gegenteil) naechster.delete(f.gegenteil);
                  }
                  waehle(setFilter)(naechster);
                }}
                className={`rounded-md border px-2 py-0.5 text-[11px] transition
                            ${filter.has(f.wert)
                  ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                  : 'border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
                <T>{f.titel}</T>
              </button>
            ))}

            {filter.size > 1 && (
              <span className="ml-1 text-[10px] text-slate-600">
                {filter.size} <T>verbunden</T>
              </span>
            )}
          </span>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <T>ab</T>
            <input type="number" min={1} value={mindestens}
              onChange={(e) =>
                waehle(setMindestens)(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-zinc-800 bg-zinc-900/80 px-2
                         py-1 text-center text-xs text-slate-100 outline-none
                         focus:border-sky-500" />
            <T>Matches</T>
          </label>

          <span className="ml-auto text-[11px] tabular-nums text-slate-600">
            {zahl(gezeigt.length)} <T>von</T> {zahl(alle.length)}
          </span>
        </div>

        {/* ------------------------------------------------------- Liste */}
        {laedt ? (
          <p className="py-10 text-center text-xs text-slate-600">
            <T>Wird geladen …</T>
          </p>
        ) : !gezeigt.length ? (
          <p className="py-10 text-center text-xs text-slate-600">
            <T>Niemand passt dazu.</T>
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900/70">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left font-medium"><T>Spieler</T></th>
                    <th className="px-3 py-2 text-center font-medium"><T>Flagge</T></th>
                    <th className="px-3 py-2 text-left font-medium"><T>@-Konto</T></th>
                    <th className="px-3 py-2 text-right font-medium"><T>Matches</T></th>
                    <th className="px-3 py-2 text-right font-medium"><T>Elims</T></th>
                    <th className="px-3 py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {gezeigt.slice(0, menge).map((s) => {
                    const auf = offen === s.epicId;
                    return (
                      <tr key={s.epicId}
                        className={`border-t border-zinc-900 ${auf
                          ? 'bg-sky-950/30' : 'hover:bg-zinc-900/40'}`}>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            {s.foto ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={s.foto} alt="" loading="lazy"
                                className="h-7 w-7 shrink-0 rounded object-cover
                                           object-top" />
                            ) : (
                              <span className="flex h-7 w-7 shrink-0 items-center
                                               justify-center rounded bg-zinc-900
                                               text-[11px] text-zinc-700">?</span>
                            )}
                            <span className="min-w-0 flex-1">
                              {auf ? (
                                <input value={eName}
                                  onChange={(e) => setEName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void speichern(s);
                                  }}
                                  placeholder={s.turniername}
                                  spellCheck={false}
                                  className="w-full rounded border border-zinc-700
                                             bg-zinc-950 px-2 py-0.5 text-xs
                                             text-slate-100 outline-none
                                             focus:border-sky-500" />
                              ) : (
                                <span className="block truncate text-slate-200">
                                  {s.name}
                                </span>
                              )}
                              {/* Der Turniername darunter, sobald er abweicht -
                                  so ist zu sehen, wovon der Anzeigename kommt
                                  und unter welchem Namen der Spieler antrat. */}
                              {(auf || s.name !== s.turniername) && (
                                <span className="block truncate text-[10px] text-slate-600">
                                  {s.turniername}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>

                        <td className="px-3 py-1.5 text-center">
                          {auf ? (
                            <input value={eLand}
                              onChange={(e) => setELand(e.target.value.toUpperCase())}
                              onKeyDown={(e) => { if (e.key === 'Enter') void speichern(s); }}
                              maxLength={2} placeholder="DE" spellCheck={false}
                              className="w-12 rounded border border-zinc-700
                                         bg-zinc-950 px-1 py-0.5 text-center
                                         text-xs uppercase text-slate-100
                                         outline-none focus:border-sky-500" />
                          ) : (
                            <span title={s.landQuelle === 'quelle'
                              ? t('aus der Szene-Quelle — noch nicht bestätigt')
                              : s.landQuelle === 'gepflegt' ? t('von Hand gepflegt') : ''}
                              className={s.landQuelle === 'quelle' ? 'opacity-60' : ''}>
                              <Flagge land={s.land} />
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-1.5">
                          {auf ? (
                            <input value={eX}
                              onChange={(e) => setEX(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') void speichern(s); }}
                              placeholder={t('ohne @')} spellCheck={false}
                              className="w-44 rounded border border-zinc-700
                                         bg-zinc-950 px-2 py-0.5 text-xs
                                         text-slate-100 outline-none
                                         focus:border-sky-500" />
                          ) : s.x ? (
                            <span className="text-sky-400">@{s.x}</span>
                          ) : (
                            <span className="text-slate-700">–</span>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {zahl(s.matches)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                          {zahl(s.elims)}
                        </td>

                        <td className="px-3 py-1.5 text-right">
                          {auf ? (
                            <span className="flex items-center justify-end gap-2">
                              <button onClick={() => void speichern(s)}
                                disabled={speichert}
                                className="rounded bg-sky-500 px-2.5 py-0.5 text-[11px]
                                           font-medium text-white transition
                                           hover:bg-sky-400 disabled:opacity-40">
                                <T>speichern</T>
                              </button>
                              <button onClick={() => setOffen(null)}
                                className="text-[11px] text-slate-500 transition
                                           hover:text-slate-300">
                                <T>abbrechen</T>
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => oeffnen(s)}
                              className="rounded border border-zinc-800 px-2.5 py-0.5
                                         text-[11px] text-slate-500 transition
                                         hover:border-sky-500/60 hover:text-sky-400">
                              <T>bearbeiten</T>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {gezeigt.length > menge && (
              <button onClick={() => setMenge((m) => m + SCHRITT)}
                className="mt-3 w-full rounded-lg border border-zinc-800 py-2
                           text-xs text-slate-400 transition
                           hover:border-sky-500/60 hover:text-sky-400">
                <T>weitere anzeigen</T> ({zahl(gezeigt.length - menge)})
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
