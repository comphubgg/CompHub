'use client';

/*
 * Die Player Stats eines Cups - aufgebaut wie bei Osirion, in der eigenen
 * Optik (Vorgabe des Betreibers, 28.9.2026: "unter Player Stats soll es bei
 * mir genau so aussehen ... ausser das Diagramm").
 *
 *   oben     Filter nach Platzgruppe und Rechenart, die Summen des Feldes,
 *            "Mehr anzeigen" klappt die weiteren auf
 *   darunter die Spitze je Kennzahl ("Top Damage Ratio: XSET Clix mit 2,12")
 *   dann     wann zuletzt aktualisiert, und die zehn Kacheln (je Top 5, Plus fuer alle)
 *
 * Nur, was die Quelle je Spieler fuehrt. Builds Edited, Time spent Editing,
 * Hit by Surge, Weakpoint Hits, Overshield und Damage to Self kennt sie nicht
 * - die stehen deshalb nicht da, statt mit erfundenen Zahlen. Reboots und
 * Revives fuehrt sie nur zusammen.
 */

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import StatKacheln, { type KachelListe, type KachelSpieler } from '@/app/components/StatKacheln';
import AktualisierungsStand from '@/app/components/AktualisierungsStand';

/** Die zehn Kennzahlen - genau die des Vorbilds. */
export const OSIRION_KACHELN: KachelListe[] = [
  { feld: 'quote', titel: 'Schadensquote', nachkomma: 2 },
  { feld: 'damage', titel: 'Schaden an Spielern' },
  { feld: 'elims', titel: 'Eliminierungen' },
  { feld: 'clutch', titel: 'Solo Clutch Points' },
  { feld: 'timeInStorm', titel: 'Zeit im Sturm', format: 'zeit' },
  { feld: 'timeAlive', titel: 'Überlebenszeit', format: 'zeit' },
  { feld: 'distanz', titel: 'Zurückgelegte Strecke', format: 'km' },
  { feld: 'hits', titel: 'Treffer an Spielern' },
  { feld: 'mats', titel: 'Gefarmtes Material' },
  { feld: 'builds', titel: 'Gesetzte Bauteile' },
];

type Format = 'zahl' | 'zeit' | 'km';
/** Die Summen des Feldes - die ersten zwoelf stehen immer da, der Rest hinter "Mehr anzeigen". */
const SUMMEN: Array<{ feld: string; titel: string; format?: Format }> = [
  { feld: 'elims', titel: 'Eliminierungen' },
  { feld: 'assists', titel: 'Assists' },
  { feld: 'damage', titel: 'Schaden an Spielern' },
  { feld: 'shots', titel: 'Schüsse' },
  { feld: 'hits', titel: 'Treffer an Spielern' },
  { feld: 'builds', titel: 'Gesetzte Bauteile' },
  { feld: 'mats', titel: 'Gefarmtes Material' },
  { feld: 'distanz', titel: 'Zurückgelegte Strecke', format: 'km' },
  { feld: 'timeAlive', titel: 'Überlebenszeit', format: 'zeit' },
  { feld: 'timeInStorm', titel: 'Zeit im Sturm', format: 'zeit' },
  { feld: 'headshots', titel: 'Kopftreffer' },
  { feld: 'reboots', titel: 'Reboots und Revives' },
  { feld: 'fallDamage', titel: 'Fallschaden' },
  { feld: 'stormDamage', titel: 'Sturmschaden' },
  { feld: 'healthHealed', titel: 'Leben geheilt' },
  { feld: 'shieldHealed', titel: 'Schild geheilt' },
  { feld: 'damageTaken', titel: 'Erlittener Schaden' },
  { feld: 'knocks', titel: 'Knocks' },
  { feld: 'tode', titel: 'Tode' },
];

const GRUPPEN: Array<[string, string, number, number]> = [
  ['alle', 'Alle Spieler', 1, Infinity],
  ['1', '1. Platz', 1, 1],
  ['2-5', '2. bis 5. Platz', 2, 5],
  ['6-10', '6. bis 10. Platz', 6, 10],
  ['11-25', '11. bis 25. Platz', 11, 25],
  ['26-100', '26. bis 100. Platz', 26, 100],
];
const ARTEN: Array<[string, string]> = [
  ['summe', 'Gesamt'],
  ['jeMatch', 'Schnitt je Match'],
  ['jeSpieler', 'Schnitt je Spieler'],
  ['jeSpielerMatch', 'Schnitt je Spieler und Match'],
];

function alsZeit(sek: number, stunden = false): string {
  const s = Math.max(0, Math.round(sek));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (stunden && h >= 10) return `${h}h`;
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export default function SpielerStatsUebersicht({ spieler, matches, aktualisiert, szene, schadenAusReplay, laeuft, endeMs }: {
  spieler: KachelSpieler[];
  /** Wie viele Matches der Spieltag (oder das Turnier) hatte. */
  matches: number;
  /** Wann die Werte zuletzt gerechnet oder von Epic fortgeschrieben wurden. */
  aktualisiert?: string | null;
  /** Schaden, Treffer, Kopftreffer aus den eigenen Replays gezaehlt (nicht Epics Zahl). */
  schadenAusReplay?: boolean;
  /** Werte aus der Szene-Quelle (Endstand) statt aus den eigenen Replays. */
  szene?: boolean;
  /** Laeuft der Cup gerade? Dann kommt in zehn Minuten das naechste Update, sonst ist es der Endstand. */
  laeuft?: boolean;
  /** Wann der Spieltag zu Ende ging - daraus folgt, ob die Replays noch bei Epic liegen (31 Tage). */
  endeMs?: number | null;
}) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [gruppe, setGruppe] = useState('alle');
  const [art, setArt] = useState('summe');
  const [mehr, setMehr] = useState(false);

  const zahl = (v: number, n = 0) => v.toLocaleString(ort, { minimumFractionDigits: n, maximumFractionDigits: n });
  const zeigen = (v: number, f?: Format, n = 0) => (f === 'zeit' ? alsZeit(v, true)
    : f === 'km' ? `${zahl(v / 1000, 1)} km` : zahl(v, n));

  // Welche Felder es in diesen Daten ueberhaupt gibt - nur die stehen da.
  const vorhanden = useMemo(() => new Set(SUMMEN.map((s) => s.feld)
    .filter((f) => spieler.some((s) => typeof s[f] === 'number'))), [spieler]);

  const feld = useMemo(() => {
    const [, , von, bis] = GRUPPEN.find(([k]) => k === gruppe) ?? GRUPPEN[0];
    if (gruppe === 'alle') return spieler;
    return spieler.filter((s) => typeof s.platz === 'number' && (s.platz as number) >= von && (s.platz as number) <= bis);
  }, [spieler, gruppe]);

  const summe = (f: string) => feld.reduce((a, s) => a + (Number(s[f]) || 0), 0);
  const spieleSumme = feld.reduce((a, s) => a + (Number(s.spiele) || 0), 0);
  const teiler = art === 'jeMatch' ? Math.max(1, matches)
    : art === 'jeSpieler' ? Math.max(1, feld.length)
      : art === 'jeSpielerMatch' ? Math.max(1, spieleSumme) : 1;

  // "Matches" steht in beiden Sprachen so - ohne Uebersetzung (die kennt
  // "Matches" als Kleinwort im Satz).
  const kacheln: Array<{ titel: string; wert: string; roh?: boolean }> = [
    { titel: 'Matches', wert: zahl(matches), roh: true },
    { titel: 'Spieler', wert: zahl(feld.length) },
    ...SUMMEN.filter((s) => vorhanden.has(s.feld)).map((s) => ({
      titel: s.titel,
      wert: zeigen(summe(s.feld) / teiler, s.format, teiler > 1 && s.format !== 'zeit' && s.format !== 'km' ? 1 : 0),
    })),
  ];
  const sichtbar = mehr ? kacheln : kacheln.slice(0, 12);

  // Die Spitze je Kennzahl - dieselbe Reihenfolge wie die Kacheln darunter.
  const spitzen = OSIRION_KACHELN.map((k) => {
    const beste = spieler.filter((s) => Number(s[k.feld]) > 0)
      .sort((a, b) => Number(b[k.feld]) - Number(a[k.feld]))[0];
    return { k, beste };
  });

  const auswahl = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500';

  /*
   * Warum eine Kachel leer ist - ehrlich und je nach Alter des Cups. Alles ausser den Eliminierungen kommt aus den
   * Server-Replays; Epic loescht sie nach 31 Tagen. Ist der Cup juenger, kommt der Wert nach der Auswertung noch;
   * ist er aelter und wurde damals nicht aufgezeichnet, kommt er nie mehr (kein Wert, der erfunden waere).
   */
  const alterTage = endeMs ? (Date.now() - endeMs) / 86_400_000 : null;
  const leerText = (f: string): string => {
    if (f === 'elims') return t('Liegt für diesen Cup nicht vor');
    return alterTage !== null && alterTage <= 31
      ? t('Wird aus den Replays nachgetragen, sobald sie ausgewertet sind')
      : t('Dieser Wert kommt aus den Server-Replays. Epic löscht sie nach 31 Tagen — für diesen Cup wurden sie nicht aufgezeichnet.');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={gruppe} onChange={(e) => setGruppe(e.target.value)} className={auswahl}>
            {GRUPPEN.map(([k, titel]) => <option key={k} value={k}>{t(titel)}</option>)}
          </select>
          <select value={art} onChange={(e) => setArt(e.target.value)} className={auswahl}>
            {ARTEN.map(([k, titel]) => <option key={k} value={k}>{t(titel)}</option>)}
          </select>
          {kacheln.length > 12 && (
            <button type="button" onClick={() => setMehr((x) => !x)}
              className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-slate-200
                         transition hover:border-sky-500 hover:text-sky-400">
              {mehr ? <T>Weniger anzeigen</T> : <T>Mehr anzeigen</T>}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {sichtbar.map((k) => (
            <div key={k.titel} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-center">
              <p className="truncate text-[11px] text-slate-400">{k.roh ? k.titel : <T>{k.titel}</T>}</p>
              <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-slate-50">{k.wert}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Die Spitze je Kennzahl. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {spitzen.map(({ k, beste }) => (
          <div key={k.feld} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center">
            <p className="truncate text-[11px] text-slate-400">Top <T>{k.titel}</T></p>
            {beste ? (
              <>
                <p className="mt-0.5 flex items-center justify-center gap-1.5 truncate text-sm font-bold text-slate-100">
                  <TeamFlagge groesse={16} laender={[beste.land || undefined]} />
                  <span className="truncate">{beste.name}</span>
                </p>
                <p className="text-[12px] text-slate-400">
                  <T>mit</T>{' '}
                  <span className="font-semibold text-sky-400">
                    {zeigen(Number(beste[k.feld]), k.format === 'zeit' ? 'zeit' : k.format === 'km' ? 'km' : 'zahl', k.nachkomma ?? 0)}
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{leerText(k.feld)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Wann zuletzt, auf die Sekunde - und wann das naechste Update kommt (siehe AktualisierungsStand). */}
      <AktualisierungsStand stand={aktualisiert} art={laeuft ? 'laeuft' : 'fertig'} />
      <p className="text-[11px] text-slate-500">
        {szene ? <T>Endstand aus der Szene-Quelle</T> : null}
        {/* Gezaehlt, nicht von Epic - das muss dabeistehen (echte, aber abgeleitete Zahlen). */}
        {schadenAusReplay && (
          <span className="mt-1 block text-slate-600">
            <T>Schaden, Treffer und Kopftreffer aus den Server-Replays gezählt (ohne Treffer auf Umgehauene); im Abgleich mit Epics eigenen Werten im Mittel 6 % niedriger.</T>
          </span>
        )}
      </p>

      <StatKacheln spieler={spieler} listen={OSIRION_KACHELN} anzahl={5} leereZeigen leerText={leerText} />
    </div>
  );
}
