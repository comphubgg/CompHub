'use client';

/*
 * Die eigenen Werte eines Spieltags - und die des Mitspielers daneben.
 *
 * Woher die Zahlen kommen, ist die halbe Geschichte dieses Bereichs:
 *
 *   Epics Turnier-Schnittstelle gibt zu einem Match nur Platz,
 *   Eliminierungen, Lebenszeit und Siege heraus. Nachgemessen an sechs
 *   Cup-Arten - kein Schaden, keine Trefferquote, kein Material.
 *
 *   Das Server-Replay, das dieses Werkzeug ohnehin holt, gibt die
 *   vollstaendige Lobby mit Platzierungen und Kills je Spieler, aber
 *   ebenfalls keinen Schaden: dort steht "Stats: null", weil ein
 *   Server-Replay niemanden hat, der es aufzeichnet.
 *
 *   Die Szene-Quelle dagegen veroeffentlicht genau diese Einzelwerte - fuer
 *   jeden Spieler, nicht nur fuer einen. Sie deckt allerdings nicht jeden
 *   Cup ab und erscheint ein bis zwei Tage spaeter.
 *
 * Deshalb steht hier, wenn nichts vorliegt, auch genau das - und keine
 * Tabelle voller Nullen.
 *
 * Der Vergleich zweier Spieler ist dem Vorbild nachgebaut, das der
 * Betreiber danebengehalten hat: zwei Spalten, je Kennzahl ein Balken, und
 * ein Pfeil daran, wer vorn liegt. Die Farben sind seine: das Blau der
 * Startseite fuer ihn selbst, Rot fuer den Vergleich.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

/** Ein Spieler, so wie /api/spieler-stats ihn ausgibt. */
interface Werte {
  name: string;
  epicId: string;
  elims: number;
  assists: number;
  reboots: number;
  headshots: number;
  hits: number;
  shots: number;
  damage: number;
  damageTaken: number;
  quote: number;
  heals: number;
  stormDamage: number;
  genauigkeit: number;
  fallDamage: number;
  mats: number;
  builds: number;
  distanz: number;
  distanzGesamt: number;
  timeInStorm: number;
  timeAlive: number;
  avgLife: number;
}

interface Antwort {
  vorhanden: boolean;
  hinweis?: string;
  turnier?: string;
  matches?: number;
  quelle?: string;
  spieler: Werte[];
}

/** Wo sich die zuletzt gewaehlten Namen merken. */
const SPEICHER = 'comphub.werte.namen';

/**
 * Was gezeigt wird, in welcher Reihenfolge und wie.
 *
 * "hoeherIstBesser" entscheidet nur ueber den Pfeil. Bei erlittenem Schaden
 * und Sturmschaden ist weniger besser; das als "besser" zu markieren waere
 * schlicht falsch herum.
 */
const ZEILEN: Array<{
  schluessel: keyof Werte;
  name: string;
  einheit?: string;
  nachkomma?: number;
  hoeherIstBesser: boolean;
}> = [
  { schluessel: 'elims', name: 'Eliminierungen', hoeherIstBesser: true },
  { schluessel: 'damage', name: 'Schaden an Spielern', hoeherIstBesser: true },
  { schluessel: 'damageTaken', name: 'Schaden erhalten', hoeherIstBesser: false },
  { schluessel: 'quote', name: 'Schadensverhältnis', nachkomma: 2, hoeherIstBesser: true },
  { schluessel: 'genauigkeit', name: 'Trefferquote', einheit: '%', nachkomma: 1, hoeherIstBesser: true },
  { schluessel: 'headshots', name: 'Kopftreffer', hoeherIstBesser: true },
  { schluessel: 'hits', name: 'Treffer', hoeherIstBesser: true },
  { schluessel: 'shots', name: 'Schüsse', hoeherIstBesser: true },
  { schluessel: 'assists', name: 'Assists', hoeherIstBesser: true },
  { schluessel: 'reboots', name: 'Wiederbelebungen', hoeherIstBesser: true },
  { schluessel: 'heals', name: 'Geheilt', hoeherIstBesser: true },
  { schluessel: 'mats', name: 'Material gefarmt', hoeherIstBesser: true },
  { schluessel: 'builds', name: 'Bauteile gesetzt', hoeherIstBesser: true },
  { schluessel: 'timeAlive', name: 'Lebenszeit', einheit: 's', hoeherIstBesser: true },
  { schluessel: 'avgLife', name: 'Lebenszeit je Runde', einheit: 'min', nachkomma: 2, hoeherIstBesser: true },
  { schluessel: 'timeInStorm', name: 'Zeit im Sturm', einheit: 's', hoeherIstBesser: false },
  { schluessel: 'stormDamage', name: 'Sturmschaden', hoeherIstBesser: false },
  { schluessel: 'fallDamage', name: 'Fallschaden', hoeherIstBesser: false },
  { schluessel: 'distanzGesamt', name: 'Strecke', einheit: 'km', nachkomma: 1, hoeherIstBesser: true },
];

export default function Werte({
  windowId, teams,
}: {
  windowId: string | null;
  /** Die Teams der Bestenliste - daraus kommt der Mitspieler. */
  teams: Array<{ players: Array<{ id: string; name: string }> }>;
}) {
  const t = useT();
  const { sprache } = useSprache();
  // Zahlen richten sich nach der Sprache - dieselbe Regel wie ueberall sonst.
  const ort = ortVon(sprache);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string>('');
  const [zuletzt, setZuletzt] = useState<string[]>([]);

  /* Die zuletzt gewaehlten Namen kommen aus dem Browser, nicht vom Server:
     sie gehoeren zu diesem Geraet und zu niemandem sonst. */
  useEffect(() => {
    try {
      const roh = localStorage.getItem(SPEICHER);
      if (roh) setZuletzt(JSON.parse(roh) as string[]);
    } catch { /* dann eben ohne Verlauf */ }
  }, []);

  const merken = useCallback((name: string) => {
    setZuletzt((bisher) => {
      const neu = [name, ...bisher.filter((x) => x !== name)].slice(0, 8);
      try { localStorage.setItem(SPEICHER, JSON.stringify(neu)); } catch { /* egal */ }
      return neu;
    });
  }, []);

  useEffect(() => {
    if (!windowId) return undefined;
    let weg = false;
    setLaedt(true);
    setDaten(null);
    fetch(`/api/spieler-stats?window=${encodeURIComponent(windowId)}`)
      .then((r) => r.json())
      .then((j) => { if (!weg) setDaten(j as Antwort); })
      .catch(() => { if (!weg) setDaten(null); })
      .finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [windowId]);

  const spieler = daten?.spieler ?? [];

  /** Der gewaehlte Spieler - ueber den Namen, so wie er ihn eintippt. */
  const ich = useMemo(() => {
    if (!gewaehlt) return null;
    const k = gewaehlt.trim().toLowerCase();
    return spieler.find((p) => p.name.toLowerCase() === k)
      ?? spieler.find((p) => p.name.toLowerCase().includes(k))
      ?? null;
  }, [gewaehlt, spieler]);

  /**
   * Der Mitspieler - aus der Bestenliste, nicht geraten.
   *
   * Die Szene-Quelle kennt nur einzelne Spieler; wer mit wem ein Duo
   * bildete, steht in Epics Bestenliste. Ohne sie bleibt die zweite Spalte
   * leer, statt irgendjemanden danebenzustellen.
   */
  const mate = useMemo(() => {
    if (!ich) return null;
    const meins = ich.epicId.toLowerCase();
    const team = teams.find((tm) => tm.players.some((p) => (p.id ?? '').toLowerCase() === meins));
    const partner = team?.players.find((p) => (p.id ?? '').toLowerCase() !== meins);
    if (!partner) return null;
    return spieler.find((p) => p.epicId.toLowerCase() === (partner.id ?? '').toLowerCase()) ?? null;
  }, [ich, teams, spieler]);

  const vorschlaege = useMemo(() => {
    const k = suche.trim().toLowerCase();
    if (!k) return [];
    return spieler.filter((p) => p.name.toLowerCase().includes(k)).slice(0, 8);
  }, [suche, spieler]);

  const zahl = (w: number, nachkomma = 0) =>
    w.toLocaleString(ort, { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });

  if (!windowId) return null;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b
                         border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100"><T>Deine Werte</T></h2>
        {daten?.matches ? (
          <span className="text-xs text-slate-500">
            {daten.turnier} · {daten.matches} <T>Runden</T>
          </span>
        ) : null}
      </header>

      <div className="p-4">
        {/* Auswahl: zuletzt genutzte Namen und ein Suchfeld daneben. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={gewaehlt}
            onChange={(e) => { setGewaehlt(e.target.value); if (e.target.value) merken(e.target.value); }}
            className="w-56 rounded-lg border border-sky-600/60 bg-zinc-900/80 px-3 py-2
                       text-sm text-slate-100 outline-none focus:border-sky-500">
            <option value="">{t('Konto auswählen')}</option>
            {zuletzt.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>

          <div className="relative">
            <input value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t('Spieler suchen …')}
              className="w-56 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2
                         text-sm text-slate-100 outline-none focus:border-sky-500" />
            {vorschlaege.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border
                              border-zinc-700 bg-zinc-900 shadow-xl">
                {vorschlaege.map((p) => (
                  <button key={p.epicId} type="button"
                    onClick={() => { setGewaehlt(p.name); merken(p.name); setSuche(''); }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-200
                               transition hover:bg-sky-500/15 hover:text-sky-300">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {laedt && (
          <p className="py-8 text-center text-sm text-slate-500"><T>Wird geladen …</T></p>
        )}

        {!laedt && daten && !daten.vorhanden && (
          /* Ehrlich statt leer: die Quelle deckt nicht jeden Cup ab. */
          <p className="py-8 text-center text-sm leading-relaxed text-slate-500">
            <T>Zu diesem Spieltag liegen keine Einzelwerte vor. Schaden,
            Trefferquote und Material veröffentlicht Epic nicht — sie kommen
            aus einer Szene-Quelle, die ein bis zwei Tage später erscheint und
            nicht jeden Cup abdeckt.</T>
          </p>
        )}

        {!laedt && daten?.vorhanden && !ich && (
          <p className="py-8 text-center text-sm text-slate-500">
            <T>Wähle oben dein Konto — dann stehen hier deine Werte und die
            deines Mitspielers nebeneinander.</T>
          </p>
        )}

        {ich && (
          <div>
            {/* Die beiden Namen als Kopf der Spalten. */}
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="text-right text-sm font-semibold text-sky-300">{ich.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-600">
                <T>gegen</T>
              </div>
              <div className="text-sm font-semibold text-rose-300">
                {mate ? mate.name : <span className="text-slate-600"><T>kein Mitspieler</T></span>}
              </div>
            </div>

            <div className="space-y-1.5">
              {ZEILEN.map((z) => {
                const a = Number(ich[z.schluessel] ?? 0);
                const b = mate ? Number(mate[z.schluessel] ?? 0) : 0;
                const groesster = Math.max(a, b, 1);
                const aBesser = z.hoeherIstBesser ? a > b : a < b;
                const bBesser = z.hoeherIstBesser ? b > a : b < a;
                return (
                  <div key={z.schluessel}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    {/* Links: eigener Wert mit Balken nach rechts auslaufend. */}
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-sm font-semibold tabular-nums ${
                        aBesser ? 'text-sky-300' : 'text-slate-400'}`}>
                        {zahl(a, z.nachkomma ?? 0)}{z.einheit ? ` ${z.einheit}` : ''}
                      </span>
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-900 sm:w-40">
                        <div className="ml-auto h-full rounded-full bg-sky-500"
                          style={{ width: `${Math.round((a / groesster) * 100)}%` }} />
                      </div>
                    </div>

                    <div className="w-40 text-center text-[11px] text-slate-500">
                      <T>{z.name}</T>
                    </div>

                    {/* Rechts: der Mitspieler in der Vergleichsfarbe. */}
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-900 sm:w-40">
                        <div className="h-full rounded-full bg-rose-500"
                          style={{ width: mate ? `${Math.round((b / groesster) * 100)}%` : '0%' }} />
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        bBesser ? 'text-rose-300' : 'text-slate-400'}`}>
                        {mate ? `${zahl(b, z.nachkomma ?? 0)}${z.einheit ? ` ${z.einheit}` : ''}` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
              <T>Diese Einzelwerte veröffentlicht Epic nicht. Sie stammen aus
              der Szene-Quelle, die dieses Werkzeug spiegelt.</T>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
