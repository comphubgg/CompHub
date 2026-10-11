'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import {
  KUERZEL_STANDARD, LIVE_TAKTE, kanalAusEingabe, kuerzelText,
  type Kuerzel, type KuerzelName, type MvEinstellungen,
} from './mvTypen';

/*
 * Die Fenster der Multiview: Einstellungen, Tastenkuerzel und "Kanal aendern".
 * Aufbau und Reihenfolge wie bei viewington.com/watch; ohne Farbwahl und ohne Import/Export.
 */

function Rahmen({ titel, unter, zu, children }: {
  titel: ReactNode; unter?: ReactNode; zu: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zu]);
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) zu(); }}>
      <div role="dialog" aria-modal="true"
        className="mv-fl max-h-[88vh] w-full max-w-[26rem] overflow-y-auto rounded-xl border p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{titel}</h2>
            {unter && <p className="mv-mute mt-0.5 text-xs">{unter}</p>}
          </div>
          <button type="button" onClick={zu} aria-label="Close"
            className="mv-mute mv-hover rounded-md p-1 transition">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const POV_ORTE: Array<{ wert: 'oben' | 'unten' | 'links' | 'rechts'; titel: string }> = [
  { wert: 'oben', titel: 'Oben' }, { wert: 'unten', titel: 'Unten' },
  { wert: 'links', titel: 'Links' }, { wert: 'rechts', titel: 'Rechts' },
];

function Zeile({ symbol, text, an, aendern }: {
  symbol: ReactNode; text: string; an: boolean; aendern: (an: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={an} onClick={() => aendern(!an)}
      className="mv-hover flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition">
      <span className="mv-mute flex h-4 w-4 shrink-0 items-center justify-center">{symbol}</span>
      <span className="min-w-0 flex-1">{text}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${an ? 'bg-sky-500' : 'bg-zinc-600/70'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${an ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

const Strich = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

function Abschnitt({ titel }: { titel: string }) {
  return <p className="mv-mute mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]">{titel}</p>;
}

export function EinstellungenFenster({ einst, aendern, kuerzel, zu }: {
  einst: MvEinstellungen;
  aendern: (teil: Partial<MvEinstellungen>) => void;
  kuerzel: () => void;
  zu: () => void;
}) {
  const t = useT();
  return (
    <Rahmen titel={<T>Einstellungen</T>} unter={<T>Passe die Ansicht an dich an</T>} zu={zu}>
      <Abschnitt titel={t('Player')} />
      <Zeile symbol={<Strich d="M10 2v16M2 10h16M5 5l-3 5 3 5M15 5l3 5-3 5" />} text={t('Von überall ziehen')}
        an={einst.ziehenUeberall} aendern={(v) => aendern({ ziehenUeberall: v })} />
      <Zeile symbol={<Strich d="M3 6h14M3 10h14M3 14h14" />} text={t('Qualität je Stream')}
        an={einst.qualitaetJeStream} aendern={(v) => aendern({ qualitaetJeStream: v })} />
      <Zeile symbol={<Strich d="M3 8V5a2 2 0 0 1 2-2h3M12 3h3a2 2 0 0 1 2 2v3M17 12v3a2 2 0 0 1-2 2h-3M8 17H5a2 2 0 0 1-2-2v-3" />}
        text={t('Abgerundete Ecken')} an={einst.abgerundet} aendern={(v) => aendern({ abgerundet: v })} />
      <Zeile symbol={<Strich d="M10 14v.01M10 6v5M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0" />} text={t('Tooltips')}
        an={einst.tooltips} aendern={(v) => aendern({ tooltips: v })} />
      <Zeile symbol={<Strich d="M4 10a6 6 0 0 1 12 0M7 10a3 3 0 0 1 6 0M10 10v.01" />} text={t('Tabs synchron halten')}
        an={einst.tabSync} aendern={(v) => aendern({ tabSync: v })} />
      <Zeile symbol={<Strich d="M2 4h16v12H2zM2 7h16" />} text={t('Stream-Modus: Kopfzeile ausblenden')}
        an={einst.streamModus} aendern={(v) => aendern({ streamModus: v })} />

      <Abschnitt titel={t('Vollbild')} />
      <Zeile symbol={<Strich d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />} text={t('Andere im Vollbild stummschalten')}
        an={einst.vollbildAndereStumm} aendern={(v) => aendern({ vollbildAndereStumm: v })} />
      <Zeile symbol={<Strich d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />} text={t('Quelle im Vollbild')}
        an={einst.vollbildQuelle} aendern={(v) => aendern({ vollbildQuelle: v })} />
      <Zeile symbol={<Strich d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />} text={t('Qualität beim Verlassen zurücksetzen')}
        an={einst.vollbildZurueck} aendern={(v) => aendern({ vollbildZurueck: v })} />
      <Zeile symbol={<Strich d="M4 8h3l4-3v10l-4-3H4zM14 8l3 4M17 8l-3 4" />} text={t('Beim Verlassen stummschalten')}
        an={einst.vollbildStummBeimVerlassen} aendern={(v) => aendern({ vollbildStummBeimVerlassen: v })} />

      <Abschnitt titel={t('Live-Status')} />
      <Zeile symbol={<Strich d="M4 10a6 6 0 0 1 12 0M7 10a3 3 0 0 1 6 0M10 10v.01" />} text={t('Live-Status abfragen')}
        an={einst.liveAbfrage} aendern={(v) => aendern({ liveAbfrage: v })} />
      <Zeile symbol={<Strich d="M10 4.5C5 4.5 1.5 10 1.5 10S5 15.5 10 15.5 18.5 10 18.5 10 15 4.5 10 4.5zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />}
        text={t('Offline-Streams zeigen')} an={einst.offlineAlle} aendern={(v) => aendern({ offlineAlle: v })} />
      {einst.liveAbfrage && (
        <div className="flex items-center gap-3 px-2 py-2 text-sm">
          <span className="w-4 shrink-0" />
          <span className="min-w-0 flex-1"><T>Abfrage alle</T></span>
          <select value={einst.liveTakt} onChange={(e) => aendern({ liveTakt: Number(e.target.value) })}
            className="mv-fl rounded-md border px-2 py-1 text-xs outline-none focus:border-sky-500">
            {LIVE_TAKTE.map((s) => (
              <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>
            ))}
          </select>
        </div>
      )}

      <Abschnitt titel={t('POV-Banner')} />
      <Zeile symbol={<Strich d="M3 14h14M5 14V9h10v5M7 9V6h6v3" />} text={t('Namensbanner auf Pro-POVs')}
        an={einst.povBanner} aendern={(v) => aendern({ povBanner: v })} />
      {einst.povBanner && (
        <>
          <div className="flex items-center gap-3 px-2 py-2 text-sm">
            <span className="w-4 shrink-0" />
            <span className="min-w-0 flex-1"><T>Position</T></span>
            <div className="flex gap-1">
              {POV_ORTE.map((o) => (
                <button key={o.wert} type="button" onClick={() => aendern({ povBannerOrt: o.wert })}
                  className={`rounded-md border px-2 py-1 text-xs transition ${einst.povBannerOrt === o.wert
                    ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'mv-fl mv-hover'}`}>
                  {t(o.titel)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 px-2 py-2 text-sm">
            <span className="w-4 shrink-0" />
            <span className="min-w-0 flex-1"><T>Größe</T></span>
            <div className="flex gap-1">
              {([['klein', 'Klein'], ['mittel', 'Mittel'], ['gross', 'Groß']] as const).map(([wert, titel]) => (
                <button key={wert} type="button" onClick={() => aendern({ povBannerGroesse: wert })}
                  className={`rounded-md border px-2 py-1 text-xs transition ${einst.povBannerGroesse === wert
                    ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'mv-fl mv-hover'}`}>
                  {t(titel)}
                </button>
              ))}
            </div>
          </div>
          <Zeile symbol={<Strich d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17a6 6 0 0 1 12 0" />} text={t('Mit Profilbild')}
            an={einst.povBannerBild} aendern={(v) => aendern({ povBannerBild: v })} />
        </>
      )}

      <Abschnitt titel={t('Darstellung')} />
      <Zeile symbol={<Strich d="M16 12A7 7 0 0 1 8 4a7 7 0 1 0 8 8z" />} text={t('Dunkler Modus')}
        an={einst.dunkel} aendern={(v) => aendern({ dunkel: v })} />

      <button type="button" onClick={kuerzel}
        className="mv-fl mv-hover mt-5 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition">
        <Strich d="M2 6h16v9H2zM5 9h1M8 9h1M11 9h1M14 9h1M6 12h8" />
        <T>Tastenkürzel</T>
      </button>
    </Rahmen>
  );
}

const KUERZEL_TEXTE: Array<{ name: KuerzelName; titel: string; was: string }> = [
  { name: 'alleStumm', titel: 'Alle stumm', was: 'Alle Streams stummschalten' },
  { name: 'q360', titel: '360p-Qualität', was: 'Alle Streams auf 360p stellen' },
  { name: 'qAuto', titel: 'Auto-Qualität', was: 'Alle Streams auf Auto stellen' },
  { name: 'ziehenUmschalten', titel: 'Ziehen von überall', was: 'Ziehen von überall ein- oder ausschalten' },
  { name: 'alleNeuLaden', titel: 'Alle neu laden', was: 'Alle Streams neu laden' },
];

export function KuerzelFenster({ kuerzel, setzen, zurueck, zu }: {
  kuerzel: Record<KuerzelName, Kuerzel>;
  setzen: (name: KuerzelName, k: Kuerzel) => void;
  zurueck: () => void;
  zu: () => void;
}) {
  const t = useT();
  const [wartet, setWartet] = useState<KuerzelName | null>(null);

  useEffect(() => {
    if (!wartet) return undefined;
    const taste = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setWartet(null); return; }
      // Eine Taste allein (Shift, Ctrl, Alt) ist noch kein Kuerzel.
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      setzen(wartet, { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey });
      setWartet(null);
    };
    window.addEventListener('keydown', taste, true);
    return () => window.removeEventListener('keydown', taste, true);
  }, [wartet, setzen]);

  return (
    <Rahmen titel={<T>Tastenkürzel</T>}
      unter={<T>Auf ein Kürzel klicken, um es zu ändern. Esc bricht ab.</T>}
      zu={() => { if (wartet) setWartet(null); else zu(); }}>
      <div className="mt-4 space-y-1">
        {KUERZEL_TEXTE.map((z) => (
          <div key={z.name} className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(z.titel)}</p>
              <p className="mv-mute text-[11px]">{t(z.was)}</p>
            </div>
            <button type="button" onClick={() => setWartet(z.name)}
              className={`mv-fl rounded-md border px-2.5 py-1 font-mono text-xs transition
                ${wartet === z.name ? 'border-sky-500 text-sky-400' : 'mv-hover'}`}>
              {wartet === z.name ? t('Taste drücken …') : kuerzelText(kuerzel[z.name])}
            </button>
          </div>
        ))}
        <p className="mv-mute px-2 pt-1 text-[11px]"><T>Die Seitenleiste öffnet und schließt Strg + B.</T></p>
      </div>
      <div className="mt-5 flex justify-between gap-2">
        <button type="button" onClick={zurueck}
          className="mv-mute mv-hover rounded-md px-3 py-1.5 text-xs transition"
          disabled={JSON.stringify(kuerzel) === JSON.stringify(KUERZEL_STANDARD)}>
          <T>Auf Standard zurücksetzen</T>
        </button>
        <button type="button" onClick={zu}
          className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400">
          <T>Schließen</T>
        </button>
      </div>
    </Rahmen>
  );
}

export function KanalAendernFenster({ kanal, speichern, zu }: {
  kanal: string; speichern: (neu: string) => void; zu: () => void;
}) {
  const t = useT();
  const [wert, setWert] = useState(kanal);
  const feld = useRef<HTMLInputElement | null>(null);
  useEffect(() => { feld.current?.focus(); feld.current?.select(); }, []);
  const neu = kanalAusEingabe(wert);
  const abschicken = () => { if (neu) { speichern(neu); zu(); } };
  return (
    <Rahmen titel={<T>Kanal ändern</T>} unter={<T>Der Stream bleibt an seinem Platz.</T>} zu={zu}>
      <input ref={feld} value={wert} onChange={(e) => setWert(e.target.value)} spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); abschicken(); } }}
        placeholder={t('Kanalname …')}
        className="mv-fl mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500" />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={zu} className="mv-mute mv-hover rounded-md px-3 py-1.5 text-xs transition">
          <T>Abbrechen</T>
        </button>
        <button type="button" onClick={abschicken} disabled={!neu}
          className="rounded-md bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
          <T>Speichern</T>
        </button>
      </div>
    </Rahmen>
  );
}
