'use client';

import T from '@/app/components/T';

/*
 * Das Punktesystem eines Spieltags unter About (Betreiber, 16.11.2026: "jeder Cup soll im About-Reiter das Scoring zeigen").
 *
 * Aus Epics Punktetabelle (app/api/cup-preise, "wertung"; lib/cupWertung). Epics Platzregeln sind kumulativ: "Platz 1 bis 2: +4" gilt fuer Platz 1 und 2,
 * ein Sieger bekommt die Summe aller Stufen - genau so rechnet Epic die Tagessumme (lib/cupWertung punkteFuerRunde). Eliminierungen stehen entweder als eine
 * Stufe "je Stueck" (unbegrenzt) oder als einzelne Stufen "ab 1, ab 2, ... ab 10" (dann zaehlen hoechstens zehn) - beides wird hier ausgerechnet.
 * Steht keine Tabelle da, sagt der Kasten das, statt Punkte zu erfinden.
 */

export type Regel = { was: string; schwelle: number; regel: string; punkte: number; jeStueck: boolean };

function platzPunkte(regeln: Regel[], platz: number): number {
  let s = 0;
  for (const r of regeln) {
    if (r.was !== 'Placement') continue;
    if (r.regel === 'lte' ? platz <= r.schwelle : platz >= r.schwelle) s += r.punkte;
  }
  return s;
}

function elimPunkte(regeln: Regel[], elims: number): number {
  let s = 0;
  for (const r of regeln) {
    if (r.was !== 'Elimination' || elims < r.schwelle) continue;
    s += r.jeStueck ? r.punkte * elims : r.punkte;
  }
  return s;
}

export default function Punktesystem({ wertung, quelle, sofortPunkte, ort }: {
  wertung: Regel[] | null | undefined; quelle?: string | null; sofortPunkte?: number; ort: string;
}) {
  const regeln = (wertung ?? []).filter((r) => r && r.punkte > 0);
  const kopf = (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"><T>Punktesystem</T></p>
  );
  if (wertung === undefined) return null;
  if (!regeln.length) {
    return (
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        {kopf}
        <p className="text-sm text-slate-500">Scoring not published</p>
      </div>
    );
  }

  // Plaetze: von 1 bis zur letzten Platzstufe, gleiche Punkte zu Spannen zusammengefasst.
  const platzRegeln = regeln.filter((r) => r.was === 'Placement');
  const bisPlatz = Math.min(100, platzRegeln.reduce((m, r) => Math.max(m, r.regel === 'lte' ? r.schwelle : 0), 0));
  const spannen: Array<{ von: number; bis: number; punkte: number }> = [];
  for (let p = 1; p <= bisPlatz; p++) {
    const pk = platzPunkte(regeln, p);
    const letzte = spannen[spannen.length - 1];
    if (letzte && letzte.punkte === pk) letzte.bis = p; else spannen.push({ von: p, bis: p, punkte: pk });
  }

  // Eliminierungen: Punkte je Elim und ab wann keine mehr dazukommen.
  const elimRegeln = regeln.filter((r) => r.was === 'Elimination');
  const unbegrenzt = elimRegeln.some((r) => r.jeStueck);
  const hoechsteStufe = elimRegeln.reduce((m, r) => Math.max(m, r.schwelle), 0);
  const jeElim = elimRegeln.length ? elimPunkte(regeln, 1) : 0;
  const linear = elimRegeln.length > 0 && Array.from({ length: hoechsteStufe + 1 }, (_, i) => i + 1)
    .every((k) => elimPunkte(regeln, k) === (unbegrenzt || k <= hoechsteStufe ? jeElim * k : jeElim * hoechsteStufe));
  const sieg = regeln.filter((r) => r.was === 'Victory Royale').reduce((s, r) => s + r.punkte, 0);
  const proSpiel = regeln.filter((r) => r.was === 'Match played').reduce((s, r) => s + r.punkte, 0);

  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      {kopf}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {spannen.length > 0 && (
          <table className="text-sm">
            <thead>
              <tr className="text-left text-[11px] text-slate-500">
                <th className="pr-6 font-semibold"><T>Platz</T></th>
                <th className="text-right font-semibold"><T>Punkte</T></th>
              </tr>
            </thead>
            <tbody>
              {spannen.map((s) => (
                <tr key={s.von} className="border-t border-zinc-800/70">
                  <td className="py-0.5 pr-6 text-slate-300">{s.von === s.bis ? `#${s.von}` : `#${s.von}–${s.bis}`}</td>
                  <td className="py-0.5 text-right font-semibold text-sky-400">{s.punkte.toLocaleString(ort)}</td>
                </tr>
              ))}
              <tr className="border-t border-zinc-800/70">
                <td className="py-0.5 pr-6 text-slate-500">#{bisPlatz + 1}+</td>
                <td className="py-0.5 text-right text-slate-500">0</td>
              </tr>
            </tbody>
          </table>
        )}
        <ul className="space-y-1 text-sm text-slate-300">
          {elimRegeln.length > 0 && (linear ? (
            <li>
              <span className="font-semibold text-sky-400">+{jeElim.toLocaleString(ort)}</span> <T>je Elimination</T>
              {!unbegrenzt && (
                <span className="text-slate-500"> · max. {hoechsteStufe} Elims ({(jeElim * hoechsteStufe).toLocaleString(ort)} <T>Punkte</T>)</span>
              )}
            </li>
          ) : (
            <li>
              <T>Elims</T>: {Array.from({ length: Math.min(hoechsteStufe, 12) }, (_, i) => `${i + 1} = ${elimPunkte(regeln, i + 1)}`).join(', ')}
              {!unbegrenzt && <span className="text-slate-500"> · max. {hoechsteStufe}</span>}
            </li>
          ))}
          {sieg > 0 && <li><span className="font-semibold text-sky-400">+{sieg.toLocaleString(ort)}</span> Victory Royale</li>}
          {proSpiel > 0 && <li><span className="font-semibold text-sky-400">+{proSpiel.toLocaleString(ort)}</span> <T>je gespieltem Match</T></li>}
          {!!sofortPunkte && sofortPunkte > 0 && (
            <li className="text-slate-400"><T>Sofort weiter ab</T> {sofortPunkte.toLocaleString(ort)} <T>Punkte</T></li>
          )}
          {quelle && quelle !== 'epic' && (
            <li className="text-[11px] text-slate-500">
              {quelle === 'replay' || quelle === 'archiv' ?<T>Aus Epics Daten, als der Spieltag lief</T> : <><T>Aus Epics Daten derselben Runde in</T> {quelle.replace(/^epic-/, '')}</>}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
