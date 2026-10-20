'use client';

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Der Tweet zur Prognose (Betreiber, 20.10.2026: "dann schickt man auch einen Titel fuer den Tweet, wie ich das announcen soll - big, dass es richtig gross aussieht
 * und so wichtig. Und ob ich irgendwelche Spieler markieren soll oder Content Creator").
 *
 * Drei Titel zur Auswahl (Grossbuchstaben mit Zeichen davor und danach - so wirkt die erste Zeile gross), dazu Vorschlaege, wen man markiert: Spieler des Feldes mit
 * einem gepflegten X-Konto, die Besten zuerst; wer zusaetzlich einen Twitch-Kanal hat, ist als Streamer vermerkt (die teilen so etwas gern). Nichts wird geraten - ohne
 * gepflegtes X-Konto kommt kein Name in die Liste.
 */

interface FeldTeam { key: string; namen: string[]; ids: string[]; besterPlatz: number }
interface ProfilX { x?: string; twitch?: string }

const TITEL = [
  (c: string) => `🔮 ${c} PREDICTIONS 🔮`,
  (c: string) => `🚨 ${c}: WHO TAKES THE CROWN? 🚨`,
  (c: string) => `📊 MY ${c} PREDICTIONS ARE IN 📊`,
];

export default function AnkuendigungsTweet({ cupName, finale, region, datum, feld, plaetze, findeProfil }: {
  cupName: string; finale: string; region: string; datum: string; feld: FeldTeam[]; plaetze: number;
  findeProfil: (name: string, id?: string) => ProfilX | undefined;
}) {
  const t = useT();
  const [wahl, setWahl] = useState(0);
  const [kopiert, setKopiert] = useState(false);
  const [abgewaehlt, setAbgewaehlt] = useState<Record<string, boolean>>({});
  const [zusaetzlich, setZusaetzlich] = useState<Record<string, boolean>>({});

  /** Spieler des Feldes mit gepflegtem X-Konto, beste Setzplaetze zuerst. */
  const vorschlaege = useMemo(() => {
    const raus: Array<{ x: string; name: string; platz: number; streamer: boolean }> = [];
    const schon = new Set<string>();
    for (const team of feld.slice().sort((a, b) => a.besterPlatz - b.besterPlatz)) {
      team.namen.forEach((n, i) => {
        const p = findeProfil(n, team.ids[i] || undefined);
        const x = (p?.x ?? '').replace(/^@/, '').trim();
        if (!x || schon.has(x.toLowerCase())) return;
        schon.add(x.toLowerCase());
        raus.push({ x, name: n, platz: team.besterPlatz, streamer: !!(p?.twitch ?? '').trim() });
      });
      if (raus.length >= 16) break;
    }
    return raus;
  }, [feld, findeProfil]);

  // Vorbelegt: die ersten vier. Was der Betreiber an- oder abwaehlt, gilt.
  const markiert = vorschlaege.filter((v, i) => (zusaetzlich[v.x] ?? false) || (i < 4 && !abgewaehlt[v.x]));

  const cup = `${cupName}${region && region !== 'GLOBAL' ? ` ${region}` : ''}`.toUpperCase().replace(/\s+/g, ' ').trim();
  const text = useMemo(() => {
    const zeile2 = datum;
    return [
      TITEL[wahl](cup),
      '',
      [finale, zeile2].filter(Boolean).join(' · '),
      plaetze ? `Who finishes where? My full top ${plaetze} on the map ⬇️` : 'Who finishes where? My predictions on the map ⬇️',
      ...(markiert.length ? ['', markiert.map((m) => `@${m.x}`).join(' ')] : []),
      '',
      '🔗 thecomphub.com/predictions',
      '#Fortnite #FNCS',
    ].filter((z, i, a) => !(z === '' && (a[i - 1] === '' || i === 0))).join('\n');
  }, [wahl, cup, finale, region, datum, plaetze, markiert]);

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2000); } catch { /* der Text steht zum Markieren da */ }
  };

  return (
    <details open className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
        📣 <T>Tweet zur Ankündigung</T>
        <span className="ml-2 text-xs font-normal text-slate-500"><T>Titel wählen, Spieler markieren, kopieren</T></span>
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Titel</T></p>
          <div className="flex flex-col gap-1.5">
            {TITEL.map((f, i) => (
              <button key={i} type="button" onClick={() => setWahl(i)}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-extrabold tracking-wide transition ${wahl === i
                  ? 'border-sky-500 bg-sky-500/10 text-sky-200' : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                {f(cup)}
              </button>
            ))}
          </div>

          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Wen markieren?</T></p>
          {vorschlaege.length ? (
            <div className="flex flex-wrap gap-1.5">
              {vorschlaege.map((v) => {
                const an = markiert.some((m) => m.x === v.x);
                return (
                  <button key={v.x} type="button"
                    onClick={() => (an
                      ? (setAbgewaehlt((a) => ({ ...a, [v.x]: true })), setZusaetzlich((a) => ({ ...a, [v.x]: false })))
                      : (setAbgewaehlt((a) => ({ ...a, [v.x]: false })), setZusaetzlich((a) => ({ ...a, [v.x]: true }))))}
                    title={`${v.name} · #${v.platz}${v.streamer ? ' · Streamer' : ''}`}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${an
                      ? 'border-sky-500 bg-sky-500/15 text-sky-200' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    @{v.x}
                    {v.streamer && <span className="ml-1 rounded bg-violet-500/25 px-1 text-[9px] font-bold uppercase text-violet-300">{t('Streamer')}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500"><T>Zu den Spielern im Feld ist noch kein X-Konto gepflegt - im Spielerprofil lässt es sich eintragen.</T></p>
          )}
          <p className="mt-2 text-[11px] text-slate-600"><T>Vorgeschlagen werden die Besten des Feldes mit gepflegtem X-Konto; Streamer sind markiert, sie teilen so etwas gern.</T></p>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Fertiger Tweet</T></p>
          <textarea readOnly value={text} rows={9}
            className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-slate-200 outline-none" />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => void kopieren()}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400">
              {kopiert ? <T>Kopiert</T> : <T>Tweet kopieren</T>}
            </button>
            <span className={`text-xs ${text.length > 280 ? 'text-amber-400' : 'text-slate-500'}`}>{text.length} / 280</span>
            <span className="text-[11px] text-slate-600"><T>Das Bild kommt über den Screenshot-Knopf.</T></span>
          </div>
        </div>
      </div>
    </details>
  );
}
