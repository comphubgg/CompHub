'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { MeineListe, Regler, Wahlreihe } from '../Teile';

/*
 * Den Offspawn-Stand einstellen.
 *
 * Anders als die uebrigen Overlays holt dieses nichts von Epic: wer wo landet
 * und wie es steht, entscheidet sich in einer Absprache zwischen zwei Teams,
 * und davon weiss keine Schnittstelle etwas. Der Betreiber pflegt den Stand
 * deshalb hier von Hand - "nachher kann er das im Tool eingeben, und in OBS
 * wird das direkt uebernommen".
 *
 * Genau darauf ist die Seite ausgelegt: zwei grosse Knoepfe je Seite, mit
 * denen sich der Stand waehrend des Streams in einem Klick aendern laesst,
 * und alles andere darunter.
 */

const STANDARD = {
  kopf: 'OFFSPAWN',
  kopfZeigen: true,
  name1: 'TEAM 1', name2: 'TEAM 2',
  punkte1: 0, punkte2: 0,
  zusatz: '',
  farbe1: '#38bdf8', farbe2: '#f43f5e',
  grund: '0 0 0', deckkraft: 0.72,
  schrift: 30,
};

type Config = typeof STANDARD;

const GRUENDE: Array<{ wert: string; titel: string }> = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const FARBEN: Array<{ wert: string; titel: string }> = [
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#a78bfa', titel: 'Violett' },
  { wert: '#ffffff', titel: 'Weiß' },
];

export default function OffspawnSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('offspawn');

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Offspawn');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [gespeichert, setGespeichert] = useState(false);
  const [schmutzig, setSchmutzig] = useState(false);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) => {
    setCfg((alt) => ({ ...alt, [k]: v }));
    setSchmutzig(true);
  };

  useEffect(() => { setSchmutzig(false); }, [id]);

  const vorschau = useMemo(
    () => `/overlay/offspawn.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
    [cfg]);

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...STANDARD, ...(o.config as Partial<Config>) });
  }

  const [ausAdresseGeladen, setAusAdresseGeladen] = useState(false);
  useEffect(() => {
    if (ausAdresseGeladen || !liste) return;
    const wunsch = new URLSearchParams(window.location.search).get('id');
    if (!wunsch) { setAusAdresseGeladen(true); return; }
    const o = liste.find((x) => x.id === wunsch);
    if (o) waehlen(o);
    setAusAdresseGeladen(true);
    // waehlen haengt nur an setState-Funktionen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, ausAdresseGeladen]);

  /**
   * Speichern - und zwar sofort, wenn schon eines offen ist.
   *
   * Waehrend eines Streams zaehlt jeder Klick: wer den Stand aendert, will
   * ihn im Bild sehen und nicht erst noch "Übernehmen" suchen. Deshalb
   * schreibt jede Änderung am Stand direkt durch, sobald das Overlay einmal
   * angelegt ist.
   */
  async function sichern(neuerStand?: Partial<Config>) {
    const stand = { ...cfg, ...(neuerStand ?? {}) };
    const neu = await speichern({ id: id ?? undefined, name, config: stand });
    if (!neu) return;
    setId(neu);
    setSchmutzig(false);
    setGespeichert(true);
    window.setTimeout(() => setGespeichert(false), 1200);
  }

  /** Den Stand einer Seite ändern und, wenn möglich, gleich speichern. */
  function zaehle(welche: 'punkte1' | 'punkte2', wieviel: number) {
    const wert = Math.max(0, Math.min(99, (cfg[welche] as number) + wieviel));
    setCfg((alt) => ({ ...alt, [welche]: wert }));
    if (id) void sichern({ [welche]: wert } as Partial<Config>);
    else setSchmutzig(true);
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <OverlayGeruest aktiv="offspawn">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100"><T>Offspawn</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Zwei Teams, ein Stand von Hand. Epic weiß davon nichts — was hier
          steht, steht im Stream.</T>
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">

          {/* ------------------------------------------------ Der Stand */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Der Stand</T>
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {([['punkte1', 'name1', 'farbe1'], ['punkte2', 'name2', 'farbe2']] as const)
                .map(([pk, nk, fk]) => (
                  <div key={pk} className="rounded-lg border border-zinc-800
                                           bg-zinc-950/60 p-3">
                    <input value={cfg[nk] as string}
                      onChange={(e) => setz(nk, e.target.value)}
                      placeholder={t('Teamname')}
                      className={`${feld} text-center font-semibold`}
                      style={{ color: cfg[fk] as string }} />
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <button onClick={() => zaehle(pk, -1)}
                        className="h-11 w-11 rounded-lg border border-zinc-800
                                   text-lg font-bold text-slate-300 transition
                                   hover:border-sky-500 hover:text-sky-300">
                        −
                      </button>
                      <span className="w-14 text-center text-3xl font-black
                                       tabular-nums text-slate-100">
                        {cfg[pk] as number}
                      </span>
                      <button onClick={() => zaehle(pk, 1)}
                        className="h-11 w-11 rounded-lg bg-sky-500 text-lg
                                   font-bold text-white transition
                                   hover:bg-sky-400">
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <label className="mt-4 block">
              <span className="text-xs text-slate-400">
                <T>Zeile darunter</T>{' '}
                <span className="text-slate-600"><T>— freiwillig</T></span>
              </span>
              <input value={cfg.zusatz}
                onChange={(e) => setz('zusatz', e.target.value)}
                placeholder={t('zum Beispiel „Game 1 / 4“')}
                className={`${feld} mt-1`} />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-400"><T>Überschrift</T></span>
                <input value={cfg.kopf}
                  onChange={(e) => setz('kopf', e.target.value)}
                  className={`${feld} mt-1`} />
              </label>
              <Wahlreihe titel="Überschrift zeigen" wert={cfg.kopfZeigen ? 1 : 0}
                optionen={[{ wert: 1, titel: 'Ja' }, { wert: 0, titel: 'Nein' }]}
                setzen={(w) => setz('kopfZeigen', w === 1)} />
            </div>
          </section>

          {/* ----------------------------------------------- Aussehen */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Wahlreihe titel="Farbe links" wert={cfg.farbe1} optionen={FARBEN}
                setzen={(w) => setz('farbe1', w)} />
              <Wahlreihe titel="Farbe rechts" wert={cfg.farbe2} optionen={FARBEN}
                setzen={(w) => setz('farbe2', w)} />
              <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                setzen={(w) => setz('grund', w)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={14} bis={80}
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
              <button onClick={() => void sichern()}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold
                           text-white transition hover:bg-sky-400">
                {gespeichert ? t('gespeichert') : (id ? t('Übernehmen') : t('Anlegen'))}
              </button>
            </div>
            {fehler && <p className="mb-2 text-xs text-rose-400">{fehler}</p>}
            {id && schmutzig && (
              <p className="mb-2 text-[11px] text-amber-500/90">
                <T>Nicht übernommen — im Stream steht noch der vorige Stand.</T>
              </p>
            )}

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
                className="h-28 w-full border-0" />
            </div>

            {id && (
              <input readOnly value={overlayAdresse('offspawn', id)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                           px-3 py-2 font-mono text-[11px] text-slate-400" />
            )}
          </section>

          <MeineListe liste={liste} typ="offspawn" offen={id}
            waehlen={waehlen} entfernen={entfernen} />
        </div>
      </div>
    </OverlayGeruest>
  );
}
