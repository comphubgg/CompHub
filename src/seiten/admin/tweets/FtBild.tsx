import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import T from '../port/app/components/T';
import { useSprache } from '../port/app/components/SprachProvider';
import { speichereLeinwand } from '../port/app/lib/bildSpeichern';
import { ftBildBlob, ftBildZeichnen } from '../port/lib/ftBild';
import type { FtBildSpieler } from '../port/lib/ftPosts';

/*
 * Das Bild unter einem Stat-Post (Betreiber, 14.11.2026): die Fotos der besten Spieler des Posts im Header-Stil, das Logo in der Mitte - gezeichnet von
 * lib/ftBild.ts auf eine Leinwand (1600 x 900), mit "Bild herunterladen" und, wo der Browser Bilder in die Zwischenablage legen kann, "Bild kopieren".
 */
export default function FtBild({ spieler, dateiname }: { spieler: FtBildSpieler[]; dateiname: string }) {
  const { t } = useSprache();
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const schluessel = spieler.map((s) => `${s.datei}:${s.name}:${s.land ?? ''}`).join('|');
  // Welche Fotos zuletzt fertig gezeichnet sind - "fertig" gilt nur fuer die aktuellen.
  const [gezeichnet, setGezeichnet] = useState<string | null>(null);
  const fertig = gezeichnet === schluessel;
  // Bilder in die Zwischenablage koennen nicht alle Browser (Firefox erst seit Kurzem); auf dem Server nie.
  const kannKopieren = useSyncExternalStore(() => () => {}, () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write, () => false);

  useEffect(() => {
    let weg = false;
    const c = leinwand.current;
    if (!c || !spieler.length) return;
    ftBildZeichnen(c, spieler).then(() => { if (!weg) setGezeichnet(schluessel); }).catch(() => { if (!weg) setMeldung('The image could not be drawn.'); });
    return () => { weg = true; };
    // Neu zeichnen nur, wenn sich die Fotos aendern - nicht bei jedem neuen Array derselben Spieler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  const zeige = (text: string) => { setMeldung(text); setTimeout(() => setMeldung((m) => (m === text ? null : m)), 1800); };

  async function herunterladen() {
    if (!leinwand.current) return;
    try { await speichereLeinwand(leinwand.current, dateiname, true); zeige('Saved'); } catch (e) { setMeldung(e instanceof Error ? e.message : String(e)); }
  }
  async function kopieren() {
    if (!leinwand.current) return;
    try {
      const blob = await ftBildBlob(leinwand.current);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      zeige('Copied');
    } catch (e) { setMeldung(e instanceof Error ? e.message : String(e)); }
  }

  if (!spieler.length) {
    return <p className="px-4 pb-3 text-[11px] text-white/40"><T>Kein Bild – keiner dieser Spieler hat ein Foto.</T></p>;
  }
  const knopf = 'rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-akz hover:text-akz disabled:opacity-40';
  return (
    <div className="px-4 pb-3">
      <canvas ref={leinwand} width={1600} height={900}
        className={`aspect-[16/9] w-full rounded-lg border border-white/10 bg-[#05080e] transition-opacity ${fertig ? 'opacity-100' : 'opacity-40'}`} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={herunterladen} disabled={!fertig} className={knopf}>{t('Bild herunterladen')}</button>
        {kannKopieren && <button type="button" onClick={kopieren} disabled={!fertig} className={knopf}>{t('Bild kopieren')}</button>}
        {!fertig && <span className="text-[11px] text-white/40"><T>Bild wird gezeichnet…</T></span>}
        {meldung && <span className="text-[11px] text-emerald-400">{t(meldung)}</span>}
      </div>
    </div>
  );
}
