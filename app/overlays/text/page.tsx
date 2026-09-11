'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { MeineListe, Regler, Vorschau, Wahlreihe } from '../Teile';

/*
 * Den eigenen Text einstellen.
 *
 * Er war ein Balken unter dem Offspawn-Stand; der Betreiber wollte ihn als
 * eigenes Overlay: "das gibt's dann einfach als Overlay, einfach selber."
 * Und er hat den Umfang festgelegt: Balkenfarbe oder keine, der Text,
 * Schriftart, Schriftfarbe - "und mehr braucht es dann eigentlich nicht."
 *
 * Dazu kommt einzig die Schriftgroesse: ohne sie muesste man die Quelle in
 * OBS ziehen, und genau das macht sie unscharf.
 */

const STANDARD = {
  text: '',
  /** Die Farbe des Balkens - leer heisst: kein Balken. */
  balken: '#f97316',
  schriftart: 'standard',
  farbe: '#ffffff',
  schrift: 32,
};

type Config = typeof STANDARD;

const BALKEN: Array<{ wert: string; titel: string }> = [
  { wert: '', titel: 'Keiner' },
  { wert: '#f97316', titel: 'Orange' },
  { wert: '#22c55e', titel: 'Grün' },
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#a78bfa', titel: 'Violett' },
  { wert: '#000000', titel: 'Schwarz' },
  { wert: '#3f3f46', titel: 'Grau' },
  { wert: '#ffffff', titel: 'Weiß' },
];

const SCHRIFTARTEN: Array<{ wert: string; titel: string }> = [
  { wert: 'standard', titel: 'Standard' },
  { wert: 'anton', titel: 'Anton' },
  { wert: 'roboto', titel: 'Roboto' },
  { wert: 'mono', titel: 'Roboto Mono' },
];

const FARBEN: Array<{ wert: string; titel: string }> = [
  { wert: '#ffffff', titel: 'Weiß' },
  { wert: '#000000', titel: 'Schwarz' },
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#a78bfa', titel: 'Violett' },
  { wert: '#f97316', titel: 'Orange' },
];

export default function TextSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('text');

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Custom text');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [gespeichert, setGespeichert] = useState(false);
  const [schmutzig, setSchmutzig] = useState(false);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) => {
    setCfg((alt) => ({ ...alt, [k]: v }));
    setSchmutzig(true);
  };

  useEffect(() => { setSchmutzig(false); }, [id]);

  const vorschau = useMemo(
    () => `/overlay/text.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
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

  async function sichern() {
    const neu = await speichern({ id: id ?? undefined, name, config: cfg });
    if (!neu) return;
    setId(neu);
    setSchmutzig(false);
    setGespeichert(true);
    window.setTimeout(() => setGespeichert(false), 1200);
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <OverlayGeruest aktiv="text">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100"><T>Eigener Text</T></h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Eine Zeile, frei geschrieben — mit Balken oder ohne. Was hier
          steht, steht im Stream.</T>
        </p>
      </div>

      <Vorschau src={vorschau} hoehe={200} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Text</T>
            </h2>
            <input value={cfg.text}
              onChange={(e) => setz('text', e.target.value)}
              placeholder={t('zum Beispiel „Game 1 / 4“')}
              className={`${feld} text-lg font-semibold`} />
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              <T>Aussehen</T>
            </h2>
            <div className="grid gap-4">
              <Wahlreihe titel="Farbe des Balkens" wert={cfg.balken}
                optionen={BALKEN} setzen={(w) => setz('balken', w)} />
              <Wahlreihe titel="Schriftart" wert={cfg.schriftart}
                optionen={SCHRIFTARTEN} setzen={(w) => setz('schriftart', w)} />
              <Wahlreihe titel="Schriftfarbe" wert={cfg.farbe}
                optionen={FARBEN} setzen={(w) => setz('farbe', w)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={14} bis={120}
                einheit="px" setzen={(n) => setz('schrift', n)} />
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

            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              <T>Unscharf in OBS? Zieh die Quelle in der Szene nie größer, als
              sie eingetragen ist — stell lieber hier die Schriftgröße höher.</T>
            </p>
            {id && (
              <input readOnly value={overlayAdresse('text', id)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                           px-3 py-2 font-mono text-[11px] text-slate-400" />
            )}
          </section>

          <MeineListe liste={liste} typ="text" offen={id}
            waehlen={waehlen} entfernen={entfernen} />
        </div>
      </div>
    </OverlayGeruest>
  );
}
