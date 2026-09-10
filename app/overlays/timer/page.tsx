'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { CupWahl, MeineListe, Regler, Wahlreihe } from '../Teile';

/*
 * Den Countdown bis zum Cup einstellen.
 *
 * Der Betreiber wollte ihn als eigene Art neben Team-Karte, Standings und
 * Qual-Linie: "wenn einer heute ist, dann gibt's eine Cup Timeline ... nachher
 * kommt ein Timer fuer den aktuellen Cup. Sobald der live ist, ist der Timer
 * auf null und wird wie geloescht."
 *
 * Wenig einzustellen, mit Absicht: welcher Cup, wie lange vorher er
 * auftaucht, und wie er aussieht. Die Startzeit kommt aus dem Katalog und
 * wandert in die Einstellung, damit das Overlay auch ohne Nachfrage weiss,
 * worauf es wartet.
 */

const STANDARD = {
  event: '', window: '',
  beginn: 0,
  cup: '',
  wort: 'STARTS IN',
  cupZeigen: true,
  grund: '0 0 0', deckkraft: 0.72,
  akzent: '#38bdf8',
  schrift: 34,
  abStunden: 12,
  /** "zwei" = untereinander, "eine" = alles in einer Zeile. */
  anordnung: 'zwei' as 'zwei' | 'eine',
};

type Config = typeof STANDARD;

const GRUENDE: Array<{ wert: string; titel: string }> = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const AKZENTE: Array<{ wert: string; titel: string }> = [
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#ffffff', titel: 'Weiß' },
];

interface Fenster {
  windowId: string; eventId: string; region: string;
  status: string; begin: number;
}
interface Cup { id: string; titel: string; regionen?: Record<string, Fenster[]> }

export default function TimerSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('timer');

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Cup timer');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [gespeichert, setGespeichert] = useState(false);
  const [schmutzig, setSchmutzig] = useState(false);
  const [cups, setCups] = useState<Cup[] | null>(null);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) => {
    setCfg((alt) => ({ ...alt, [k]: v }));
    setSchmutzig(true);
  };

  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => setCups(j.cups ?? []))
      .catch(() => setCups([]));
  }, []);

  /*
   * Die Startzeit des gewaehlten Spieltags.
   *
   * Sie wandert mit in die Einstellung: das Overlay soll den Countdown auch
   * dann zeichnen koennen, wenn der Katalog gerade nicht antwortet.
   */
  const gewaehlt = useMemo(() => {
    if (!cfg.window) return null;
    for (const c of cups ?? []) {
      for (const l of Object.values(c.regionen ?? {})) {
        const w = l.find((x) => x.windowId === cfg.window);
        if (w) {
          /*
           * Die Runde gehoert dazu.
           *
           * "Performance Evaluation Cup · EU" allein sagt nicht, auf welchen
           * der drei Spieltage der Countdown zeigt - der Betreiber stand vor
           * einer Zahl und wusste nicht, ob sie zum Anfang der naechsten
           * Runde gehoert oder zum Ende der laufenden. Epic nummeriert die
           * Fenster in der Kennung, und genau die steht hier.
           */
          const runde = /round\s*(\d+)/i.exec(w.windowId)?.[1];
          return {
            begin: w.begin, region: w.region,
            titel: runde ? `${c.titel} · Round ${runde}` : c.titel,
          };
        }
      }
    }
    return null;
  }, [cups, cfg.window]);

  useEffect(() => {
    if (!gewaehlt) return;
    setCfg((alt) => (alt.beginn === gewaehlt.begin && alt.cup
      ? alt
      : { ...alt, beginn: gewaehlt.begin, cup: `${gewaehlt.titel} · ${gewaehlt.region}` }));
  }, [gewaehlt]);

  useEffect(() => { setSchmutzig(false); }, [id]);

  /*
   * Ein Overlay, das aus der Liste heraus bearbeitet wird.
   *
   * Die Adresse traegt dann seine Kennung. Einmal geladen, danach nicht mehr -
   * sonst spraengen die Regler bei jeder Aenderung auf den gespeicherten Stand
   * zurueck.
   */
  const [ausAdresseGeladen, setAusAdresseGeladen] = useState(false);
  useEffect(() => {
    if (ausAdresseGeladen || !liste) return;
    const wunsch = new URLSearchParams(window.location.search).get('id');
    if (!wunsch) return;
    const o = liste.find((x) => x.id === wunsch);
    if (o) laden(o);
    setAusAdresseGeladen(true);
    // laden() haengt an setState-Funktionen und aendert sich nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, ausAdresseGeladen]);

  /*
   * Die Vorschau zeigt denselben Countdown, der spaeter in OBS laeuft.
   *
   * Sie folgt den Reglern und nicht dem gespeicherten Stand - man soll sehen,
   * was man gerade einstellt. Dieselbe Datei, derselbe Zaehler; nur die
   * Einstellung kommt aus der Adresse statt vom Server.
   *
   * Der Betreiber hatte gemerkt, dass sie hier als Einzige fehlte: "bei
   * Standings sehe ich eine Preview, bei Qual line auch, aber nicht beim Cup
   * timer."
   */
  const vorschau = useMemo(
    () => `/overlay/timer.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
    [cfg]);

  async function sichern() {
    const neu = await speichern({ id: id ?? undefined, name, config: cfg });
    if (!neu) return;
    setId(neu);
    setSchmutzig(false);
    setGespeichert(true);
    window.setTimeout(() => setGespeichert(false), 1500);
  }

  function neu() {
    setId(null);
    setName('Cup timer');
    setCfg(STANDARD);
    setSchmutzig(false);
  }

  function laden(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...STANDARD, ...(o.config as Partial<Config>) });
  }

  /** Wie lange es noch dauert - nur zur Anzeige im Werkzeug. */
  const restText = useMemo(() => {
    if (!cfg.beginn) return '';
    const s = Math.floor((cfg.beginn - Date.now()) / 1000);
    if (s <= 0) return t('läuft schon oder ist vorbei');
    const st = Math.floor(s / 3600);
    const mi = Math.floor((s % 3600) / 60);
    return st > 0 ? `${st} h ${mi} min` : `${mi} min`;
  }, [cfg.beginn, t]);

  return (
    <OverlayGeruest aktiv="timer">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100"><T>Cup timer</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Ein Countdown bis zum Start des Spieltags. Sobald der Cup läuft,
          verschwindet er von selbst.</T>
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Worauf gewartet wird</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CupWahl event={cfg.event} window={cfg.window} nurKommende
                onWahl={(e, w) => {
                  setCfg((alt) => ({ ...alt, event: e, window: w }));
                  setSchmutzig(true);
                }} />

              <label className="text-xs text-slate-400">
                <T>Überschrift</T>
                <input value={cfg.wort}
                  onChange={(e) => setz('wort', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800
                             bg-zinc-950 px-3 py-2 text-sm text-slate-100
                             outline-none focus:border-sky-500" />
              </label>
            </div>

            {cfg.beginn > 0 && (
              <p className="mt-3 text-[11px] text-sky-400/80">
                <T>Start</T>{': '}
                {new Date(cfg.beginn).toLocaleString('de-DE')}
                {restText ? ` · ${restText}` : ''}
              </p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Regler titel="Erst sichtbar ab" wert={cfg.abStunden} von={0} bis={48}
                einheit="h" setzen={(n) => setz('abStunden', n)} />
              <Wahlreihe titel="Cup-Name darunter" wert={cfg.cupZeigen ? 1 : 0}
                optionen={[{ wert: 1, titel: 'Ja' }, { wert: 0, titel: 'Nein' }]}
                setzen={(w) => setz('cupZeigen', w === 1)} />
              <Wahlreihe titel="Anordnung" wert={cfg.anordnung}
                optionen={[
                  { wert: 'zwei' as const, titel: 'Untereinander' },
                  { wert: 'eine' as const, titel: 'Eine Zeile' },
                ]}
                setzen={(w) => setz('anordnung', w)} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
              <T>Null Stunden heißt: immer sichtbar. Sonst bleibt der Timer
              verborgen, bis es so weit ist — ein Countdown über zwei Tage ist
              keine Information, sondern eine Uhr im Bild.</T>
            </p>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                setzen={(w) => setz('grund', w)} />
              <Wahlreihe titel="Akzent" wert={cfg.akzent} optionen={AKZENTE}
                setzen={(w) => setz('akzent', w)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={16} bis={96}
                einheit="px" setzen={(n) => setz('schrift', n)} />
              <Regler titel="Wie deckend der Grund ist" wert={cfg.deckkraft}
                von={0} bis={1} schritt={0.02}
                setzen={(n) => setz('deckkraft', n)} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('Name im Dashboard')}
                className="min-w-0 flex-1 rounded-lg border border-zinc-800
                           bg-zinc-950 px-3 py-2 text-sm text-slate-100
                           outline-none focus:border-sky-500" />
              <button onClick={sichern}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold
                           text-white transition hover:bg-sky-400">
                {gespeichert ? t('gespeichert') : (id ? t('Übernehmen') : t('Anlegen'))}
              </button>
              {id && (
                <button onClick={neu}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-xs
                             text-slate-400 transition hover:border-sky-500/60
                             hover:text-sky-400">
                  <T>Neu</T>
                </button>
              )}
            </div>
            {fehler && <p className="mb-2 text-xs text-rose-400">{fehler}</p>}
            {id && schmutzig && (
              <p className="mb-2 text-[11px] text-amber-500/90">
                <T>Nicht übernommen — im Stream steht noch der vorige Stand.</T>
              </p>
            )}
            {/*
              * Die Vorschau liegt auf einem Schachbrett - ein Overlay ist
              * durchsichtig, und auf schwarzem Grund sieht man nicht, wie
              * viel davon durchscheint.
              */}
            <div className="mb-3 overflow-hidden rounded-lg border border-zinc-800"
              style={{
                backgroundImage:
                  'linear-gradient(45deg,#27272a 25%,transparent 25%),'
                  + 'linear-gradient(-45deg,#27272a 25%,transparent 25%),'
                  + 'linear-gradient(45deg,transparent 75%,#27272a 75%),'
                  + 'linear-gradient(-45deg,transparent 75%,#27272a 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              }}>
              <iframe key={vorschau} src={vorschau} title="Vorschau"
                className="h-32 w-full border-0" />
            </div>
            {id && (
              <input readOnly value={overlayAdresse('timer', id)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                           px-3 py-2 font-mono text-[11px] text-slate-400" />
            )}
          </section>

          <MeineListe liste={liste} typ="timer" offen={id}
            waehlen={laden} entfernen={entfernen} />
        </div>
      </div>
    </OverlayGeruest>
  );
}
