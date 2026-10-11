'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

/*
 * Wann die Statistik zuletzt aktualisiert wurde - gross, auf die Sekunde, mit dem naechsten Update.
 *
 * Der Betreiber (11.10.2026): "bei Player Stats Last Update soll das offensichtlicher sein, so dass ich auch die
 * Sekunden sehe, und wann das naechste Update geplant ist - wie bei Osirion". Die Zeit tickt jede Sekunde.
 *
 * Wann das naechste kommt, haengt vom Cup ab:
 *   laeuft  -  das Werkzeug liest laufende Cups alle zehn Minuten nach (Ablauf "Replays live", Minute 0, 10, 20 ...)
 *   fertig  -  der Cup ist vorbei: Endstand, es kommt nichts mehr
 *   stunde  -  sonst jede Stunde, fuenfzehn nach (Ablauf "Daten erneuern")
 */

export type UpdateArt = 'laeuft' | 'fertig' | 'stunde';

/** Der naechste planmaessige Lauf nach "jetzt" - Minutenraster, in Millisekunden. */
function naechsterLauf(art: UpdateArt, jetzt: number): number | null {
  if (art === 'fertig') return null;
  const d = new Date(jetzt);
  if (art === 'laeuft') {
    const m = Math.floor(d.getMinutes() / 10) * 10 + 10;
    d.setMinutes(m, 0, 0);
    return d.getTime();
  }
  d.setMinutes(15, 0, 0);
  if (d.getTime() <= jetzt) d.setHours(d.getHours() + 1);
  return d.getTime();
}

/** "3 d 4 h 12 min 31 s" - ohne fuehrende Nullen. */
function dauer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  const teile: string[] = [];
  if (d) teile.push(`${d} d`);
  if (d || h) teile.push(`${h} h`);
  if (d || h || m) teile.push(`${m} min`);
  teile.push(`${sek} s`);
  return teile.join(' ');
}

export default function AktualisierungsStand({ stand, art }: { stand: string | number | null | undefined; art: UpdateArt }) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const zeit = typeof stand === 'number' ? stand : stand ? Date.parse(stand) : NaN;
  const naechste = naechsterLauf(art, jetzt);
  if (!Number.isFinite(zeit)) return null;

  const alt = jetzt - zeit;
  // Frisch (gruen) bis 15 Minuten, danach gelb, nach einem Tag grau - bei einem fertigen Cup ist alt normal.
  const farbe = art === 'fertig' ? 'bg-slate-500' : alt < 15 * 60_000 ? 'bg-emerald-400' : alt < 3 * 3600_000 ? 'bg-amber-400' : 'bg-rose-400';
  const uhr = (ms: number) => new Date(ms).toLocaleTimeString(ort, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="mt-1 flex flex-wrap items-stretch gap-2 text-xs">
      <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${farbe} ${art === 'laeuft' ? 'animate-pulse' : ''}`} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><T>Zuletzt aktualisiert</T></p>
          <p className="mt-0.5 tabular-nums text-slate-200">
            {new Date(zeit).toLocaleDateString(ort, { day: 'numeric', month: 'short', year: 'numeric' })}{' · '}
            <span className="font-semibold">{uhr(zeit)}</span>
          </p>
          <p className="tabular-nums text-sky-400">{sprache === 'en' ? `${dauer(alt)} ago` : `vor ${dauer(alt)}`}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><T>Nächstes Update</T></p>
          {naechste !== null ? (
            <>
              <p className="mt-0.5 tabular-nums text-slate-200"><span className="font-semibold">{uhr(naechste)}</span></p>
              <p className="tabular-nums text-sky-400">in {dauer(naechste - jetzt)}</p>
            </>
          ) : (
            <p className="mt-0.5 max-w-[16rem] text-slate-400"><T>Cup beendet — Endstand, keine weiteren Updates geplant</T></p>
          )}
        </div>
      </div>
    </div>
  );
}
