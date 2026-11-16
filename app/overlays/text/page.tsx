'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, { overlayAdresse, useOverlays, type OverlayEintrag } from '../OverlayGeruest';
import { MeineListe } from '../Teile';
import {
  Buehne, FELD, Gruppe, HausGruppe, HAUS_STANDARD, KopierFeld, LOOK_STANDARD, ObsSchritte, Schalter, Schieber, Segmente, Text,
  type HausConfig, DesignGruppe,
} from '../Bausteine';

/*
 * Der eigene Text - redesigned 11/2026 in the CompHub house style
 * (public/overlay/text.html + look.js).
 *
 * Der Betreiber wollte ihn schlicht: "Bar Color, kannst aber auch sagen keine
 * Bar Color, dann den Text, Schriftart und Schriftfarbe." Das bleibt; dazu
 * vier Formen (Zeile, Pille, Bauchbinde, Laufband), ein kleines Label,
 * mehrere Zeilen im Wechsel, der Rahmen und die Looks.
 */

const STANDARD = {
  text: 'GAME 1 / 4',
  balken: '#000000',
  schriftart: 'standard',
  farbe: '#ffffff',
  schrift: 32,
  form: 'zeile' as 'zeile' | 'pille' | 'unten' | 'ticker',
  label: '',
  punkt: false,
  texte: [] as string[],
  takt: 6,
  breite: 900,
  tempo: 18,
  grund: '10 12 18',
  deckkraft: 0.66,
  ...LOOK_STANDARD,
  ...HAUS_STANDARD,
  wasserzeichen: 'aus' as HausConfig['wasserzeichen'],
};
type Config = typeof STANDARD;

const VORLAGEN: Array<{ name: string; setzt: Partial<Config> }> = [
  { name: 'Clean line', setzt: { form: 'zeile', look: 'clean', balken: '#000000', label: '', punkt: false } },
  { name: 'Text only', setzt: { form: 'zeile', look: 'clean', balken: '' } },
  { name: 'Pill', setzt: { form: 'pille', look: 'clean', balken: '#000000', punkt: true } },
  { name: 'Lower third', setzt: { form: 'unten', look: 'clean', balken: '#000000', label: 'NEXT UP' } },
  { name: 'Ticker', setzt: { form: 'ticker', look: 'clean', balken: '#000000' } },
  { name: 'Classic bar', setzt: { form: 'zeile', look: 'klassisch', balken: '#f97316' } },
];

export default function TextSeite() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('text');
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Custom text');
  const [cfg, setCfg] = useState<Config>(STANDARD);
  const [schmutzig, setSchmutzig] = useState(false);
  const [status, setStatus] = useState('');
  const setz = <K extends keyof Config>(k: K, v: Config[K]) => { setCfg((a) => ({ ...a, [k]: v })); setSchmutzig(true); };
  const setzAll = (k: string, v: unknown) => setz(k as keyof Config, v as Config[keyof Config]);

  const vorschau = useMemo(() => `/overlay/text.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`, [cfg]);

  function waehlen(o: OverlayEintrag) {
    setId(o.id); setName(o.name);
    setCfg({ ...STANDARD, texte: [], ...(o.config as Partial<Config>) });
    setSchmutzig(false);
  }
  const [ausAdresse, setAusAdresse] = useState(false);
  useEffect(() => {
    if (ausAdresse || !liste) return;
    const w = new URLSearchParams(window.location.search).get('id');
    const o = w ? liste.find((x) => x.id === w) : undefined;
    if (o) waehlen(o);
    setAusAdresse(true);
  }, [liste, ausAdresse]);

  async function sichern() {
    const n = await speichern({ id: id ?? undefined, name, config: cfg });
    if (!n) return;
    setId(n); setSchmutzig(false);
    setStatus(t('Saved — live in OBS within seconds'));
    window.setTimeout(() => setStatus(''), 2000);
  }

  return (
    <OverlayGeruest aktiv="text" immerBaukasten>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <div className="order-2 space-y-4 xl:order-1">
          <Gruppe titel="Text" text="One line — or several that take turns (or scroll in the ticker).">
            <Text titel="Text" wert={cfg.text} setzen={(v) => setz('text', v)} platzhalter="GAME 1 / 4" max={80} />
            {cfg.texte.map((z, i) => (
              <div key={i} className="flex gap-1.5">
                <input value={z} maxLength={80} onChange={(e) => { const n = [...cfg.texte]; n[i] = e.target.value; setz('texte', n); }}
                  className={`${FELD} min-w-0 flex-1`} />
                <button type="button" onClick={() => setz('texte', cfg.texte.filter((_, k) => k !== i))}
                  className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.08] text-slate-500 hover:text-rose-300">×</button>
              </div>
            ))}
            {cfg.texte.length < 6 && (
              <button type="button" onClick={() => setz('texte', [...cfg.texte, ''])}
                className="w-full rounded-lg border border-dashed border-white/[0.12] py-1.5 text-xs font-semibold text-slate-400 hover:text-white">+ <T>Add a line</T></button>
            )}
            {cfg.texte.length > 0 && cfg.form !== 'ticker' && (
              <Schieber titel="Each line shows for" wert={cfg.takt} von={2} bis={30} einheit=" s" setzen={(n) => setz('takt', n)} />
            )}
            <Text titel="Small label (optional)" wert={cfg.label} setzen={(v) => setz('label', v)} platzhalter="NEXT UP" max={24} />
            <Schalter titel="Small dot before the text" an={cfg.punkt} setzen={(b) => setz('punkt', b)} />
          </Gruppe>

          <Gruppe titel="Form">
            <div className="grid grid-cols-3 gap-1.5">
              {VORLAGEN.map((v) => (
                <button key={v.name} type="button" onClick={() => { setCfg((a) => ({ ...a, ...v.setzt })); setSchmutzig(true); }}
                  className="rounded-lg border border-white/[0.08] px-2 py-1.5 text-xs font-semibold text-slate-300 hover:border-sky-400/60"><T>{v.name}</T></button>
              ))}
            </div>
            <Segmente titel="Form" wert={cfg.form} setzen={(v) => setz('form', v)}
              optionen={[{ wert: 'zeile', titel: 'Line' }, { wert: 'pille', titel: 'Pill' }, { wert: 'unten', titel: 'Lower third' }, { wert: 'ticker', titel: 'Ticker' }]} />
            {cfg.form === 'ticker' && (
              <div className="grid grid-cols-2 gap-3">
                <Schieber titel="Width" wert={cfg.breite} von={300} bis={1900} schritt={20} einheit=" px" setzen={(n) => setz('breite', n)} />
                <Schieber titel="One pass takes" wert={cfg.tempo} von={6} bis={60} einheit=" s" setzen={(n) => setz('tempo', n)} />
              </div>
            )}
            <Schalter titel="Box behind the text" an={Boolean(cfg.balken)} setzen={(b) => setz('balken', b ? '#000000' : '')} />
            <Schieber titel="Box opacity" wert={Math.round(cfg.deckkraft * 100)} von={10} bis={100} einheit=" %" setzen={(n) => setz('deckkraft', n / 100)} />
            <Schieber titel="Text size" wert={cfg.schrift} von={14} bis={120} einheit=" px" setzen={(n) => setz('schrift', n)} />
          </Gruppe>

          <HausGruppe cfg={cfg} setz={setzAll} />
          <DesignGruppe cfg={cfg} setz={setzAll} />
        </div>

        <div className="order-1 xl:order-2">
          <div className="space-y-4 xl:sticky xl:top-20">
            <Buehne src={vorschau} szene breite={1280} hoehe={720}
              kopf={<><span className="font-mono uppercase tracking-[0.18em]"><T>live preview</T></span><span className="text-slate-500"><T>Transparent in OBS</T></span></>} />
            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${FELD} min-w-0 flex-1 sm:max-w-xs`} />
                <button type="button" onClick={() => void sichern()} className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-bold text-white hover:bg-sky-400">
                  {id ? t('Save changes') : t('Save and get OBS URL')}
                </button>
                {status && <span className="text-xs text-sky-300">{status}</span>}
              </div>
              {fehler && <p className="mt-2 text-xs text-rose-400">{fehler}</p>}
              {id && schmutzig && <p className="mt-2 text-xs text-orange-300"><T>Unsaved changes — OBS still shows the last saved version.</T></p>}
              {id && <div className="mt-4"><KopierFeld wert={overlayAdresse('text', id)} /></div>}
            </section>
            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-100"><T>How to add it in OBS</T></h3>
              <ObsSchritte breite={1920} hoehe={1080} />
            </section>
            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-100"><T>Your texts</T></h3>
              <MeineListe liste={liste} typ="text" offen={id} waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) { setId(null); setCfg(STANDARD); } }} />
            </section>
          </div>
        </div>
      </div>
    </OverlayGeruest>
  );
}
