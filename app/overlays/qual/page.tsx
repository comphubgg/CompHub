'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { CupWahl, MeineListe, Regler, Vorschau, Wahlreihe } from '../Teile';

/*
 * Die Qualifikationslinie einstellen.
 *
 * Zwei Zahlen, die waehrend eines Cups jeden interessieren: wie viele Punkte
 * es voraussichtlich braucht, und wie viele es gerade tatsaechlich sind. Wo
 * sie herkommen, steht in app/api/qualifikation - geraten wird nichts, und
 * ohne fruehere Ausgaben desselben Cups faellt die Schaetzung weg.
 */

const STANDARD = {
  event: '', window: '',
  schwelle: 50,
  wort: 'QUAL ~',
  takt: 15,
  grund: '0 0 0', deckkraft: 0.72,
  akzent: '#38bdf8',
  schrift: 18,
  pausiert: 0, sichtbar: 15,
  /**
   * Wie die Teile stehen.
   *
   * "zwei" ist das bisherige Bild: die Schaetzung gross oben, darunter klein
   * der Live-Wert. "eine" legt alles nebeneinander in eine flache Leiste, mit
   * duennen senkrechten Linien dazwischen - so, wie der Betreiber es
   * beschrieben hat.
   */
  anordnung: 'zwei' as 'zwei' | 'eine',
};

type Config = typeof STANDARD;

const GRUENDE = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const AKZENTE = [
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#ffffff', titel: 'Weiß' },
];

export default function QualSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('qual');

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Qual line');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [gespeichert, setGespeichert] = useState(false);
  const [schmutzig, setSchmutzig] = useState(false);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) =>
    setCfg((alt) => ({ ...alt, [k]: v }));

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...STANDARD, ...(o.config as Partial<Config>) });
  }

  function neu() {
    setId(null);
    setName('Qual line');
    setCfg(STANDARD);
  }

  async function sichern() {
    const neueId = await speichern({ id: id ?? undefined, name, config: cfg });
    if (neueId) {
      setId(neueId);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    }
  }

  /* Siehe Standings: die Vorschau zeigt die Regler, OBS den gespeicherten
     Stand. */
  const vorschau = useMemo(
    () => `/overlay/qual.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
    [cfg]);

  useEffect(() => { setSchmutzig(true); }, [cfg, name]);
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
    if (o) waehlen(o);
    setAusAdresseGeladen(true);
    // laden() haengt an setState-Funktionen und aendert sich nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, ausAdresseGeladen]);

  return (
    <OverlayGeruest aktiv="qual">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100"><T>Qual line</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Wie viele Punkte es zum Weiterkommen braucht — geschätzt aus
          früheren Ausgaben desselben Cups, daneben der Stand von jetzt.</T>
        </p>
      </div>

      <Vorschau src={vorschau || null} hoehe={200}
        leer={<T>Erst anlegen — dann steht hier die Vorschau, genau so wie
          sie im Stream aussieht.</T>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Was gezeigt wird</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CupWahl event={cfg.event} window={cfg.window}
                onWahl={(e, w) => setCfg((alt) => ({ ...alt, event: e, window: w }))} />

              <label className="text-xs text-slate-400">
                <T>Wie viele kommen weiter</T>
                <input type="number" min={1} max={5000} value={cfg.schwelle}
                  onChange={(e) => setz('schwelle', Math.max(1, +e.target.value || 50))}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                             px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-sky-500" />
                <span className="mt-1 block text-[11px] text-slate-600">
                  <T>Steht als Rangschwelle in Epics Auszahlungstabelle — bei
                  einem Divisional-Finale etwa Top 50.</T>
                </span>
              </label>

              <label className="text-xs text-slate-400">
                <T>Wort davor</T>
                <input value={cfg.wort}
                  onChange={(e) => setz('wort', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                             px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-sky-500" />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Wahlreihe titel="Anordnung" wert={cfg.anordnung}
                optionen={[
                  { wert: 'zwei', titel: 'Zwei Zeilen' },
                  { wert: 'eine', titel: 'Eine dünne Zeile' },
                ]}
                setzen={(w) => setz('anordnung', w)} />
              <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                setzen={(w) => setz('grund', w)} />
              <Wahlreihe titel="Akzent" wert={cfg.akzent} optionen={AKZENTE}
                setzen={(w) => setz('akzent', w)} />
              <Regler titel="Deckkraft" wert={Math.round(cfg.deckkraft * 100)}
                von={0} bis={100} einheit="%"
                setzen={(n) => setz('deckkraft', n / 100)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={10} bis={44}
                einheit="px" setzen={(n) => setz('schrift', n)} />
              <Regler titel="Aktualisierung" wert={cfg.takt} von={5} bis={120}
                einheit="s" setzen={(n) => setz('takt', n)} />
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-100">
              <T>Ein- und ausblenden</T>
            </h2>
            <p className="mb-3 text-[11px] text-slate-500">
              <T>Steht die Pause auf null, bleibt das Overlay dauerhaft
              stehen.</T>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Regler titel="Pause" wert={cfg.pausiert} von={0} bis={900}
                schritt={5} einheit="s" setzen={(n) => setz('pausiert', n)} />
              <Regler titel="Dann sichtbar für" wert={cfg.sichtbar} von={3} bis={120}
                einheit="s" setzen={(n) => setz('sichtbar', n)} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('Name im Dashboard')}
                className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950
                           px-3 py-2 text-sm text-slate-100 outline-none
                           focus:border-sky-500" />
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
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Meine Qual lines</T>
            </h2>
            <MeineListe liste={liste} typ="qual" offen={id}
              waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }} />
          </section>
        </div>
      </div>
    </OverlayGeruest>
  );
}
