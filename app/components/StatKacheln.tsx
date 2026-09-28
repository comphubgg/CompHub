'use client';

/*
 * Die Bestenlisten eines Turniers als Kacheln: je Kennzahl die Besten.
 *
 * Nach Osirions Vorbild (Inhalt und Aufbau, die Optik ist die eigene - wie die
 * Kacheln in der Statistik): Damage Ratio, Damage, Eliminations, Solo Clutch
 * Points, Time in Storm, Time Alive, Distance, Hits, Mats Farmed, Builds
 * Placed. Der Betreiber (28.9.2026) zu den Player-Stats der Globals: "das
 * sieht nicht aus wie in Bild 2" - und dann: "nur Top 5 ... und dann ein Plus
 * oben rechts, so dass man dann alle anderen Spieler auch sehen kann".
 *
 * Wer unter der Maus steht, leuchtet in jeder Kachel auf, in der er unter den
 * Besten ist - "mit Blau, halt mit meiner Farbe".
 *
 * Eine Kennzahl ohne Werte (etwa die Clutch Points, solange sie nicht belegt
 * sind) bekommt keine leere Kachel; an ihre Stelle rueckt Assists, damit das
 * Raster voll bleibt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

export interface KachelSpieler {
  epicId: string;
  name: string;
  land?: string | null;
  [feld: string]: unknown;
}

export interface KachelListe {
  feld: string;
  titel: string;
  nachkomma?: number;
  einheit?: string;
  kleinBesser?: boolean;
  /** "zeit": Sekunden als "1h 30m"; "km": Meter als Kilometer. */
  format?: 'zeit' | 'km';
}

/** Die zehn Kacheln des Vorbilds - dieselben Titel wie in der Statistik. */
export const TURNIER_KACHELN: KachelListe[] = [
  { feld: 'quote', titel: 'Beste Schadensquote', nachkomma: 2 },
  { feld: 'damage', titel: 'Meister Schaden' },
  { feld: 'elims', titel: 'Meiste Eliminierungen' },
  { feld: 'clutch', titel: 'Meiste Solo Clutch Points' },
  { feld: 'timeInStorm', titel: 'Längste Zeit im Sturm', format: 'zeit' },
  { feld: 'timeAlive', titel: 'Längste Überlebenszeit', format: 'zeit' },
  { feld: 'distanz', titel: 'Längste Strecke', format: 'km' },
  { feld: 'hits', titel: 'Meiste Treffer' },
  { feld: 'mats', titel: 'Meistes Material' },
  { feld: 'builds', titel: 'Meiste Bauteile' },
];

const ERSATZ: KachelListe = { feld: 'assists', titel: 'Meiste Assists' };

/** "47m 3s" / "2h 2m" - wie in den Ranglisten der Statistik. */
function alsZeit(sek: number): string {
  const s = Math.max(0, Math.round(sek));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

type Kachel = KachelListe & { zeilen: KachelSpieler[] };

export default function StatKacheln({ spieler, listen = TURNIER_KACHELN, anzahl = 5, aufKlick }: {
  spieler: KachelSpieler[];
  listen?: KachelListe[];
  /** Wie viele je Kachel stehen - der Rest hinter dem Plus. */
  anzahl?: number;
  aufKlick?: (s: KachelSpieler) => void;
}) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [markiert, setMarkiert] = useState<string | null>(null);
  const [offen, setOffen] = useState<Kachel | null>(null);

  const kacheln = useMemo(() => {
    const mitZeilen = (k: KachelListe): Kachel => ({
      ...k,
      zeilen: spieler
        .filter((s) => Number(s[k.feld]) > 0)
        .sort((a, b) => (k.kleinBesser
          ? Number(a[k.feld]) - Number(b[k.feld])
          : Number(b[k.feld]) - Number(a[k.feld]))),
    });
    const da = listen.map(mitZeilen).filter((l) => l.zeilen.length);
    if (da.length < listen.length && !da.some((l) => l.feld === ERSATZ.feld)) {
      const ersatz = mitZeilen(ERSATZ);
      if (ersatz.zeilen.length) da.push(ersatz);
    }
    return da;
  }, [spieler, listen]);

  const wert = (k: KachelListe, v: number) => (k.format === 'zeit' ? alsZeit(v)
    : k.format === 'km' ? `${(v / 1000).toLocaleString(ort, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
    : v.toLocaleString(ort, { minimumFractionDigits: k.nachkomma ?? 0, maximumFractionDigits: k.nachkomma ?? 0 })
      + (k.einheit ?? ''));

  if (!kacheln.length) return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        onMouseLeave={() => setMarkiert(null)}>
        {kacheln.map((k) => (
          <div key={k.titel} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
            <p className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[10px]
                          font-semibold uppercase tracking-[0.14em] text-slate-400">
              <T>{k.titel}</T>
              {k.zeilen.length > anzahl && (
                <button type="button" onClick={() => setOffen(k)}
                  title={`${t('Alle anzeigen')} (${k.zeilen.length})`}
                  className="ml-auto rounded border border-zinc-700 px-1.5 text-[11px] leading-4 text-slate-400
                             transition hover:border-sky-500 hover:text-sky-400">
                  +
                </button>
              )}
            </p>
            <div className="divide-y divide-zinc-900">
              {k.zeilen.slice(0, anzahl).map((s, i) => (
                // Kein deaktivierter Knopf: der bekommt im Browser keine
                // Maus-Ereignisse, und das Hervorheben blieb aus.
                <div key={s.epicId} role={aufKlick ? 'button' : undefined} tabIndex={aufKlick ? 0 : undefined}
                  onClick={aufKlick ? () => aufKlick(s) : undefined}
                  onMouseEnter={() => setMarkiert(s.epicId)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${aufKlick ? 'cursor-pointer' : ''} ${markiert === s.epicId
                    ? 'rounded-md bg-sky-500/10 ring-1 ring-inset ring-sky-500/70'
                    : aufKlick ? 'hover:bg-zinc-900/60' : ''}`}>
                  <span className={`w-5 shrink-0 text-[11px] font-bold tabular-nums ${i === 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {i + 1}
                  </span>
                  <TeamFlagge groesse={18} laender={[s.land || undefined]} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-200">{s.name}</span>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-sky-400">
                    {wert(k, Number(s[k.feld]))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {offen && <GanzeListe kachel={offen} wert={wert} zu={() => setOffen(null)} aufKlick={aufKlick} />}
    </>
  );
}

/**
 * Eine Kennzahl in voller Laenge - als Ueberlagerung wie die Turnierstatistik
 * der Cup-Seite (Top 50 / Top 100 / Alle, Suche). Unter "Alle" kommen die
 * Zeilen beim Scrollen nach und nach dazu, statt Tausende auf einmal zu
 * zeichnen. Der Platz bleibt der Platz, auch gefiltert.
 */
function GanzeListe({ kachel, wert, zu, aufKlick }: {
  kachel: Kachel;
  wert: (k: KachelListe, v: number) => string;
  zu: () => void;
  aufKlick?: (s: KachelSpieler) => void;
}) {
  const { t } = useSprache();
  const [tiefe, setTiefe] = useState<50 | 100 | 0>(50);
  const [suche, setSuche] = useState('');
  const [gezeigt, setGezeigt] = useState(500);
  const liste = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zu]);

  const mitPlatz = kachel.zeilen.map((s, i) => ({ s, platz: i + 1 }));
  const q = suche.trim().toLowerCase();
  const gefiltert = q ? mitPlatz.filter(({ s }) => s.name.toLowerCase().includes(q))
    : tiefe ? mitPlatz.slice(0, tiefe) : mitPlatz;
  const zeilen = gefiltert.slice(0, gezeigt);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 sm:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) zu(); }}>
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-700
                      bg-zinc-950 shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100"><T>{kachel.titel}</T></h3>
          <span className="text-xs text-slate-500">
            {kachel.zeilen.length.toLocaleString()} <T>Spieler</T>
          </span>
          <input value={suche} autoFocus
            onChange={(e) => { setSuche(e.target.value); setGezeigt(500); }}
            placeholder={t('Spieler suchen …')}
            className="w-44 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs text-slate-100
                       outline-none focus:border-sky-500" />
          <div className="ml-auto flex items-center gap-1">
            {([50, 100, 0] as const).map((n) => (
              <button key={n} type="button" onClick={() => { setTiefe(n); setGezeigt(500); liste.current?.scrollTo({ top: 0 }); }}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${tiefe === n
                  ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                  : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                {n === 0 ? <T>Alle</T> : `Top ${n}`}
              </button>
            ))}
            <button type="button" onClick={zu}
              className="ml-1 rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-slate-400 transition
                         hover:border-rose-500/60 hover:text-rose-400">
              ×
            </button>
          </div>
        </header>
        <ol ref={liste} className="divide-y divide-zinc-900 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && gezeigt < gefiltert.length) {
              setGezeigt((n) => n + 500);
            }
          }}>
          {zeilen.map(({ s, platz }) => (
            <li key={s.epicId}>
              <button type="button" onClick={aufKlick ? () => aufKlick(s) : undefined} disabled={!aufKlick}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left ${aufKlick ? 'hover:bg-zinc-900/60' : ''}`}>
                <span className={`w-10 shrink-0 text-right text-xs font-bold tabular-nums ${platz === 1 ? 'text-amber-400' : 'text-slate-600'}`}>
                  {platz}
                </span>
                <TeamFlagge groesse={22} laender={[s.land || undefined]} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">{s.name}</span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-100">
                  {wert(kachel, Number(s[kachel.feld]))}
                </span>
              </button>
            </li>
          ))}
          {!zeilen.length && (
            <li className="px-4 py-6 text-center text-sm text-slate-500"><T>Kein Spieler gefunden.</T></li>
          )}
        </ol>
      </div>
    </div>
  );
}
