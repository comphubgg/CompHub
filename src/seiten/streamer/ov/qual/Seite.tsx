import { OV } from '../ort';
import { useEffect, useMemo, useState } from 'react';
import T from '../T';
import { useT } from '../sprache';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { CupWahl, MeineListe, Regler, Vorschau, Wahlreihe } from '../Teile';
import { DesignGruppe, HausGruppe, HAUS_STANDARD, LOOK_STANDARD, Schalter, Segmente } from '../Bausteine';

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
  /** Null: automatisch aus dem Cup. */
  schwelle: 0,
  /** Punkte, die auf den Schnitt frueherer Ausgaben aufgeschlagen werden. */
  zuschlag: 5,
  /** Die geschaetzten Punkte von Hand - null: CompHubs Schaetzung. Der Platz (Top 1.000 ...) kommt immer aus dem Cup. */
  punkte: 0,
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
  // Redesign 11/2026 (public/overlay/qual.html + look.js).
  layout: 'zwei' as 'zwei' | 'eine' | 'meter' | 'gross',
  liveZeigen: true,
  topZeigen: true,
  ...LOOK_STANDARD,
  ...HAUS_STANDARD,
  wasserzeichen: 'aus' as typeof HAUS_STANDARD.wasserzeichen,
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

  const setzLos = (k: string, v: unknown) => setz(k as keyof Config, v as Config[keyof Config]);
  const setz = <K extends keyof Config>(k: K, v: Config[K]) =>
    setCfg((alt) => ({ ...alt, [k]: v }));

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    const alt = o.config as Partial<Config>;
    setCfg({ ...STANDARD, ...alt, layout: alt.layout ?? (alt.anordnung === 'eine' ? 'eine' : 'zwei') });
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
    () => `${OV}/overlay/qual.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
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
        <h1 className="sr-only"><T>Qual line</T></h1>
        <p className="mt-1 text-sm text-white/45">
          <T>Wie viele Punkte es zum Weiterkommen braucht — geschätzt aus
          früheren Ausgaben desselben Cups, daneben der Stand von jetzt.</T>
        </p>
      </div>


      {/* Design 3.0: links die grosse Vorschau mit Speichern und OBS-Adresse (klebt), rechts die Einstellungen angedockt */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4 xl:sticky xl:top-[7.5rem] xl:max-h-[calc(100dvh-8.5rem)] xl:overflow-y-auto">
        <Vorschau klebt={false} src={vorschau || null} hoehe={380}
          leer={<T>Erst anlegen — dann steht hier die Vorschau, genau so wie
            sie im Stream aussieht.</T>} />
            <section className="rounded-2xl border border-white/[0.07] bg-fl p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('Name im Dashboard')}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30
                             px-3 py-2 text-sm text-white outline-none
                             focus:border-akz" />
                <button onClick={sichern}
                  className="rounded-lg bg-akz px-4 py-2 text-sm font-semibold
                             text-[#04050a] transition hover:brightness-110">
                  {gespeichert ? t('gespeichert') : (id ? t('Übernehmen') : t('Anlegen'))}
                </button>
                {id && (
                  <button onClick={neu}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs
                               text-white/55 transition hover:border-akz/60
                               hover:text-akz">
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
  
            <section className="rounded-2xl border border-white/[0.07] bg-fl p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">
                <T>Meine Qual lines</T>
              </h2>
              <MeineListe liste={liste} typ="qual" offen={id}
                waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }} />
            </section>
          </div>
        <div className="space-y-4">

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              <T>Was gezeigt wird</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CupWahl event={cfg.event} window={cfg.window}
                onWahl={(e, w) => setCfg((alt) => ({ ...alt, event: e, window: w }))} />

              {/*
                * Der Platz kommt immer aus dem Cup (Top 1.000 steht fest); von Hand gibt man die geschaetzten PUNKTE ein, wenn man CompHubs
                * Schaetzung nicht teilt (Betreiber, 3.11.2026 - vorher stellte "Von Hand" den Platz ein).
                */}
              <div>
                <Wahlreihe titel="Geschätzte Punkte" wert={cfg.punkte > 0 ? 1 : 0}
                  optionen={[
                    { wert: 0, titel: 'Automatisch (CompHub)' },
                    { wert: 1, titel: 'Von Hand' },
                  ]}
                  setzen={(w) => setz('punkte', w === 0 ? 0 : 300)} />
                {cfg.punkte > 0 && (
                  <input type="number" min={1} max={5000} value={cfg.punkte}
                    onChange={(e) => setz('punkte', Math.max(1, +e.target.value || 1))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30
                               px-3 py-2 text-sm text-white outline-none
                               focus:border-akz" />
                )}
                <span className="mt-1 block text-[11px] text-white/30">
                  {cfg.punkte > 0
                    ? <T>Deine eigene Schätzung in Punkten. Der Platz, bis zu dem es weitergeht, kommt weiter aus dem Cup.</T>
                    : <T>CompHub schätzt aus früheren Ausgaben desselben Cups, sonst aus Cups mit gleichem Modus und gleicher Spielzahl.</T>}
                </span>
              </div>

              {cfg.punkte === 0 && (
                <Regler titel="Zuschlag auf die Schätzung" wert={cfg.zuschlag} von={0} bis={50}
                  einheit="Punkte" setzen={(n) => setz('zuschlag', n)} />
              )}

              <label className="text-xs text-white/55">
                <T>Wort davor</T>
                <input value={cfg.wort}
                  onChange={(e) => setz('wort', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30
                             px-3 py-2 text-sm text-white outline-none
                             focus:border-akz" />
              </label>
            </div>
          </section>

          <HausGruppe cfg={cfg} setz={setzLos} />
          <DesignGruppe cfg={cfg} setz={setzLos} />

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-3">
                <Segmente titel="Layout" wert={cfg.layout}
                  setzen={(w) => { setz('layout', w); setz('anordnung', w === 'eine' ? 'eine' : 'zwei'); }}
                  optionen={[{ wert: 'zwei', titel: 'Two lines' }, { wert: 'eine', titel: 'One line' }, { wert: 'meter', titel: 'Meter' }, { wert: 'gross', titel: 'Big number' }]} />
                <div className="grid grid-cols-2 gap-2">
                  <Schalter titel="Show the live qualifying score" an={cfg.liveZeigen} setzen={(b) => setz('liveZeigen', b)} />
                  <Schalter titel="Show “TOP N”" an={cfg.topZeigen} setzen={(b) => setz('topZeigen', b)} />
                </div>
              </div>
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

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4">
            <h2 className="mb-1 text-sm font-semibold text-white">
              <T>Ein- und ausblenden</T>
            </h2>
            <p className="mb-3 text-[11px] text-white/45">
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

      </div>
    </OverlayGeruest>
  );
}
