'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { CupWahl, MeineListe, Regler, Wahlreihe } from '../Teile';

/*
 * Das Standings-Overlay einstellen.
 *
 * Eine eigene Seite, so wie der Betreiber es wollte. Links die Einstellungen,
 * rechts die Vorschau und die eigenen Overlays.
 *
 * Der Kern: gespeichert wird in /api/overlay-config unter einer Kennung, und
 * die Adresse in OBS traegt nur diese Kennung. Wer hier etwas umstellt und
 * speichert, sieht es im Stream binnen Sekunden - die Browserquelle bleibt
 * unberuehrt.
 */

const STANDARD = {
  event: '', window: '',
  titel: 'STANDINGS',
  kopfrechts: 'POINTS',
  von: 1, bis: 5,
  takt: 15,
  grund: '0 0 0', deckkraft: 0.72,
  akzent: '#f5c542',
  schrift: 16,
  breite: 420,
  bilder: false,
  gold: 1,
  pausiert: 0,
  sichtbar: 15,
};

type Config = typeof STANDARD;

/** Die Grundfarben, die er wollte - schwarz, grau, und ein paar Töne. */
const GRUENDE: Array<{ wert: string; titel: string }> = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const AKZENTE: Array<{ wert: string; titel: string }> = [
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#ffffff', titel: 'Weiß' },
];

export default function StandingsSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('standings');

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Standings');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [gespeichert, setGespeichert] = useState(false);
  const [vorschauNr, setVorschauNr] = useState(0);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) =>
    setCfg((alt) => ({ ...alt, [k]: v }));

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...STANDARD, ...(o.config as Partial<Config>) });
  }

  function neu() {
    setId(null);
    setName('Standings');
    setCfg(STANDARD);
  }

  async function sichern() {
    const neueId = await speichern({ id: id ?? undefined, name, config: cfg });
    if (neueId) {
      setId(neueId);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
      // Die Vorschau neu laden, damit man das Ergebnis sofort sieht.
      setVorschauNr((n) => n + 1);
    }
  }

  /*
   * Die Vorschau zeigt dasselbe Overlay, das spaeter in OBS laeuft.
   *
   * Nicht ein nachgebautes Abbild: ein Nachbau weicht mit der Zeit ab, und
   * dann sieht man hier etwas anderes als im Stream.
   */
  const vorschau = useMemo(
    () => (id ? `${overlayAdresse('standings', id)}&t=${vorschauNr}` : ''),
    [id, vorschauNr]);

  // Ungespeicherte Aenderungen sollen sichtbar sein, sonst klickt man
  // "Adresse kopieren" und wundert sich, dass nichts anders aussieht.
  const [schmutzig, setSchmutzig] = useState(false);
  useEffect(() => { setSchmutzig(true); }, [cfg, name]);
  useEffect(() => { setSchmutzig(false); }, [id]);

  return (
    <OverlayGeruest aktiv="standings">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100"><T>Standings</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Die vordersten Plätze des laufenden Spieltags — als Einblendung
          für deinen Stream.</T>
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">

        {/* ------------------------------------------------ Einstellungen */}
        <div className="space-y-4">

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Was gezeigt wird</T>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <CupWahl event={cfg.event} window={cfg.window}
                onWahl={(e, w, titel) => setCfg((alt) => ({
                  ...alt, event: e, window: w,
                  // Der Titel wird vorgeschlagen, bleibt aber überschreibbar.
                  titel: alt.titel === STANDARD.titel && titel
                    ? titel.toUpperCase() : alt.titel,
                }))} />

              <label className="text-xs text-slate-400">
                <T>Überschrift</T>
                <input value={cfg.titel}
                  onChange={(e) => setz('titel', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                             px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-sky-500" />
              </label>

              <label className="text-xs text-slate-400">
                <T>Rechts in der Kopfzeile</T>
                <input value={cfg.kopfrechts}
                  onChange={(e) => setz('kopfrechts', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                             px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-sky-500" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">
                  <T>Von Platz</T>
                  <input type="number" min={1} max={200} value={cfg.von}
                    onChange={(e) => setz('von', Math.max(1, +e.target.value || 1))}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                               px-3 py-2 text-sm text-slate-100 outline-none
                               focus:border-sky-500" />
                </label>
                <label className="text-xs text-slate-400">
                  <T>Bis Platz</T>
                  <input type="number" min={1} max={200} value={cfg.bis}
                    onChange={(e) => setz('bis', Math.max(cfg.von, +e.target.value || 5))}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                               px-3 py-2 text-sm text-slate-100 outline-none
                               focus:border-sky-500" />
                </label>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[5, 10, 20, 50].map((n) => (
                <button key={n} type="button"
                  onClick={() => setCfg((a) => ({ ...a, von: 1, bis: n }))}
                  className={`rounded-lg border px-3 py-1 text-xs transition ${
                    cfg.von === 1 && cfg.bis === n
                      ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
                  <T>Top</T> {n}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                setzen={(w) => setz('grund', w)} />
              <Wahlreihe titel="Akzent" wert={cfg.akzent} optionen={AKZENTE}
                setzen={(w) => setz('akzent', w)} />
              <Regler titel="Deckkraft" wert={Math.round(cfg.deckkraft * 100)}
                von={0} bis={100} einheit="%"
                setzen={(n) => setz('deckkraft', n / 100)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={10} bis={40}
                einheit="px" setzen={(n) => setz('schrift', n)} />
              <Regler titel="Breite" wert={cfg.breite} von={260} bis={900}
                schritt={10} einheit="px" setzen={(n) => setz('breite', n)} />
              <Regler titel="Aktualisierung" wert={cfg.takt} von={3} bis={120}
                einheit="s" setzen={(n) => setz('takt', n)} />

              <Wahlreihe titel="Golden hervorheben" wert={cfg.gold}
                optionen={[
                  { wert: 0, titel: 'keine' },
                  { wert: 1, titel: 'nur Platz 1' },
                  { wert: 3, titel: 'Top 3' },
                ]}
                setzen={(w) => setz('gold', w)} />

              <label className="flex items-center gap-2 self-end text-xs text-slate-400">
                <input type="checkbox" checked={cfg.bilder}
                  onChange={(e) => setz('bilder', e.target.checked)}
                  className="accent-sky-500" />
                <T>Fotos vor dem Namen</T>
              </label>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              <T>Die Karte ist so breit wie eingestellt, wächst aber mit, wenn
              die Zahlen mehr Platz brauchen — bei Platz 1100 rutscht nichts
              zusammen. Ziehst du sie in OBS schmaler, verliert zuerst der
              Teamname Zeichen, nie die Zahlen.</T>
            </p>
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
            {cfg.pausiert > 0 && (
              <p className="mt-2 text-[11px] text-sky-400/80">
                {t('Alle {p} verborgen, dann {s} zu sehen.')
                  .replace('{p}', cfg.pausiert >= 60
                    ? `${Math.round(cfg.pausiert / 60)} min` : `${cfg.pausiert} s`)
                  .replace('{s}', `${cfg.sichtbar} s`)}
              </p>
            )}
          </section>
        </div>

        {/* ------------------------------------------ Vorschau und Liste */}
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

            {/*
              * Die Vorschau liegt auf einem Schachbrett.
              *
              * Ein Overlay ist durchsichtig; auf schwarzem Grund sieht man
              * nicht, wie viel davon durchscheint.
              */}
            <div className="overflow-hidden rounded-lg border border-zinc-800"
              style={{
                backgroundImage:
                  'linear-gradient(45deg,#27272a 25%,transparent 25%),'
                  + 'linear-gradient(-45deg,#27272a 25%,transparent 25%),'
                  + 'linear-gradient(45deg,transparent 75%,#27272a 75%),'
                  + 'linear-gradient(-45deg,transparent 75%,#27272a 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              }}>
              {vorschau ? (
                <iframe key={vorschau} src={vorschau} title="Vorschau"
                  className="h-64 w-full border-0" />
              ) : (
                <p className="px-4 py-10 text-center text-[11px] text-slate-500">
                  <T>Erst anlegen — dann steht hier die Vorschau, genau so wie
                  sie im Stream aussieht.</T>
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Meine Standings</T>
            </h2>
            <MeineListe liste={liste} typ="standings" offen={id}
              waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }} />
          </section>
        </div>
      </div>
    </OverlayGeruest>
  );
}
