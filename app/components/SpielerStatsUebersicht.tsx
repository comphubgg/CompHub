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
import StatVollansicht from '@/app/components/StatVollansicht';

/**
 * Die Kennzahlen - erst die zehn des Vorbilds in seiner Reihenfolge (Betreiber, 29.10.2026: "mindestens Damage-Ratio, Damage-to-Player, Eliminations,
 * Solo-Clutch-Points, Time-in-Storm, Time-Alive, Distance-Traveled, Hits to Player, Mats Farmed, Builds Placed ... umso mehr, umso besser"), dann was
 * es bei uns mehr gibt. Strecke, Material und Bauteile stehen nur in der Szene-Quelle (Finals); die Server-Replays fuehren sie nicht.
 */
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
  // Mehr als beim Vorbild: Knocks gibt es fuer jeden Spieler jedes Cups (schneller Replay-Abruf).
  { feld: 'knocks', titel: 'Knocks' },
  { feld: 'elimsJeMatch', titel: 'Eliminierungen je Match', nachkomma: 2 },
  { feld: 'kd', titel: 'K/D', nachkomma: 2 },
  { feld: 'headshots', titel: 'Kopftreffer' },
  { feld: 'reboots', titel: 'Reboots und Revives' },
  { feld: 'damageTaken', titel: 'Erlittener Schaden' },
  { feld: 'assists', titel: 'Assists' },
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

export default function SpielerStatsUebersicht({ spieler, matches, aktualisiert, szene, schadenAusReplay, laeuft, endeMs, teamWerte, gesamt, summen, schadenTeil, quelle, zuDetails }: {
  spieler: KachelSpieler[];
  /** Die Abfrage dieser Player Stats (/api/cup-spieler?window=...) - damit laedt die Vollansicht einer Kennzahl alle Spieler seitenweise. */
  quelle?: string;
  /** Zu den Werten eines Spielers je Match (Reiter mit der Spieler-Suche). */
  zuDetails?: (s: { id: string; name: string }) => void;
  /** Wie viele Spieler der Spieltag insgesamt hat - die Liste zeigt nur die besten. */
  gesamt?: number | null;
  /** Summen ueber alle Spieler (Schnittstelle /api/cup-spieler); ohne sie zaehlen die Kacheln nur die gezeigte Liste. */
  summen?: Record<string, number> | null;
  /** Grosser Spieltag: Schaden & Co. nur aus den Matches der besten Teams (vollstaendig fuer deren Spieler). */
  schadenTeil?: { teams: number; matches: number } | null;
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
  /**
   * Die Zeilen sind Teams (Duo, Trio) mit den Werten aus Epics Bestenliste, nicht Spieler aus den Replays - fuer
   * Cups, zu denen keine Replays ausgewertet sind. Der Betreiber (11.10.2026): jeder Cup soll Statistik haben.
   */
  teamWerte?: boolean;
}) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [gruppe, setGruppe] = useState('alle');
  const [art, setArt] = useState('summe');
  const [mehr, setMehr] = useState(false);
  // Eine Kennzahl in voller Laenge - ersetzt die Uebersicht, bis "Zurueck zur Uebersicht" (Betreiber, 29.10.2026: kein Fenster daruebergelegt).
  const [voll, setVoll] = useState<KachelListe | null>(null);

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

  // Unter "Alle Spieler" zaehlen die Summen der Schnittstelle (alle Spieler des Spieltags), nicht nur die gezeigte Liste.
  const ganz = gruppe === 'alle' && summen ? summen : null;
  const anzahl = gruppe === 'alle' && gesamt ? gesamt : feld.length;
  const summe = (f: string) => (ganz && typeof ganz[f] === 'number' ? ganz[f] : feld.reduce((a, s) => a + (Number(s[f]) || 0), 0));
  const spieleSumme = ganz && typeof ganz.spiele === 'number' ? ganz.spiele : feld.reduce((a, s) => a + (Number(s.spiele) || 0), 0);
  const teiler = art === 'jeMatch' ? Math.max(1, matches)
    : art === 'jeSpieler' ? Math.max(1, anzahl)
      : art === 'jeSpielerMatch' ? Math.max(1, spieleSumme) : 1;

  // "Matches" steht in beiden Sprachen so - ohne Uebersetzung (die kennt
  // "Matches" als Kleinwort im Satz).
  const kacheln: Array<{ titel: string; wert: string; roh?: boolean }> = [
    { titel: 'Matches', wert: zahl(matches), roh: true },
    { titel: teamWerte ? 'Teams' : 'Spieler', wert: zahl(anzahl) },
    // Steht eine Summe ueber alle Spieler bereit, keine Kachel, die nur einen Teil zusammenzaehlt (Schaden gibt es bei grossen Cups nur fuer die besten Teams).
    ...SUMMEN.filter((s) => vorhanden.has(s.feld) && (!ganz || typeof ganz[s.feld] === 'number')).map((s) => ({
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
  })
    // Nur Kennzahlen mit einem Wert (Betreiber, 28.10.2026: keine Kachel mit "Epic liefert diesen Wert nicht" - nirgendwo).
    .filter((x) => x.beste)
    // Hoechstens zehn - zwei saubere Reihen zu fuenf wie bei Osirion, keine dritte mit zwei Extras (Betreiber, 29.10.2026).
    .slice(0, 10);

  const auswahl = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500';

  /*
   * Warum eine Kachel leer ist - ehrlich und je nach Alter des Cups. Alles ausser den Eliminierungen kommt aus den
   * Server-Replays; Epic loescht sie nach 31 Tagen. Ist der Cup juenger, kommt der Wert nach der Auswertung noch;
   * ist er aelter und wurde damals nicht aufgezeichnet, kommt er nie mehr (kein Wert, der erfunden waere).
   */
  const alterTage = endeMs ? (Date.now() - endeMs) / 86_400_000 : null;
  const leerText = (f: string): string => {
    if (teamWerte) return t('Epic liefert diesen Wert für diesen Cup nicht mit.');
    if (f === 'elims') return t('Liegt für diesen Cup nicht vor');
    // Gerechnet, aber keiner hat allein Punkte geholt (z. B. ein Cup, in dem nur der Sieg zaehlt): das ist ein Ergebnis, kein Rueckstand (Betreiber, 26.10.2026).
    if (f === 'clutch' && spieler.some((s) => typeof s.clutch === 'number')) return t('In dieser Auswertung hat niemand allein Punkte geholt.');
    return alterTage !== null && alterTage <= 31
      ? t('Wird aus den Replays nachgetragen, sobald sie ausgewertet sind')
      : t('Dieser Wert kommt aus den Server-Replays. Epic löscht sie nach 31 Tagen — für diesen Cup wurden sie nicht aufgezeichnet.');
  };

  if (voll && quelle) {
    return <StatVollansicht kachel={voll} alle={OSIRION_KACHELN} quelle={quelle} zurueck={() => setVoll(null)} zuDetails={zuDetails} />;
  }

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
        {teamWerte && (
          <span className="block text-slate-500">
            <T>Diese Werte stammen direkt aus Epics Bestenliste und gelten je Team (Duo oder Trio), nicht je Spieler. Werte je einzelnem Spieler stehen nur in den Replays — zu diesem Cup liegen sie nicht vor.</T>
          </span>
        )}
        {/* Gezaehlt, nicht von Epic - das muss dabeistehen (echte, aber abgeleitete Zahlen). */}
        {schadenTeil && (
          <span className="mt-1 block text-slate-500">
            {t('Schaden, Treffer und Kopftreffer: aus den vollen Replays aller {m} Spiele der besten {n} Teams - für diese Spieler vollständig. Ein volles Replay sind rund 140 MB, alle Lobbys eines offenen Cups wären Hunderte Gigabyte.').replace('{m}', String(schadenTeil.matches)).replace('{n}', String(schadenTeil.teams))}
          </span>
        )}
        {schadenAusReplay && (
          <span className="mt-1 block text-slate-600">
            <T>Schaden, Treffer und Kopftreffer aus den Server-Replays gezählt (ohne Treffer auf Umgehauene); im Abgleich mit Epics eigenen Werten im Mittel 6 % niedriger.</T>
          </span>
        )}
      </p>

      <StatKacheln spieler={spieler} listen={OSIRION_KACHELN} anzahl={5} leerText={leerText} vorbild aufVoll={quelle ? setVoll : undefined} />
    </div>
  );
}
