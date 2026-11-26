import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import T from '../port/app/components/T';
import { useSprache } from '../port/app/components/SprachProvider';
import { speichereLeinwand } from '../port/app/lib/bildSpeichern';
import { ftBildBlob } from '../port/lib/ftBild';
import { statKarteZeichnen, type StatKarteDaten, type StatKarteWert } from '../port/lib/statKarteBild';

/*
 * Das Bild unter einer Player Card oder einem Team Spotlight (Betreiber, 15.11.2026: "IMMER ein Bild unter dem Text"): links das Foto bzw. die Fotos des
 * Teams, rechts die wichtigsten Werte - gezeichnet von lib/statKarteBild.ts auf eine Leinwand (1600 x 900). Die Fotos sucht /api/karten-fotos; wer keins
 * hat, steht als Platzhalter da. Darunter "Bild kopieren" und "speichern".
 */

export interface StatKartePerson { id?: string; name: string; land: string | null }

export default function StatKarte({ titel, untertitel, personen, werte, plaetze, dateiname }: {
  titel: string; untertitel?: string; personen: StatKartePerson[]; werte: StatKarteWert[]; plaetze: boolean; dateiname: string;
}) {
  const { t } = useSprache();
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [gezeichnet, setGezeichnet] = useState<string | null>(null);
  const kannKopieren = useSyncExternalStore(() => () => {}, () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write, () => false);

  // Neu zeichnen nur, wenn sich etwas Sichtbares aendert - nicht bei jedem neuen Array derselben Werte.
  const schluessel = JSON.stringify([titel, untertitel ?? '', personen, werte, plaetze]);
  const fertig = gezeichnet === schluessel;

  useEffect(() => {
    let weg = false;
    const c = leinwand.current;
    if (!c || !personen.length) return;
    void (async () => {
      // Erst die Fotos: Datei und Gesicht je Spieler. Klappt das nicht, zeichnet das Bild eben Platzhalter.
      let fotos: Array<{ datei: string | null; gesicht: [number, number, number] | null }> = [];
      try {
        const r = await fetch(`/api/karten-fotos?ids=${encodeURIComponent(personen.map((p) => p.id ?? '').join(','))}`
          + `&namen=${encodeURIComponent(personen.map((p) => p.name.replace(/,/g, ' ')).join(','))}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null) as { spieler?: typeof fotos } | null;
        fotos = j?.spieler ?? [];
      } catch { /* ohne Fotos */ }
      if (weg) return;
      const daten: StatKarteDaten = {
        titel, untertitel, plaetze, werte,
        spieler: personen.map((p, i) => ({ name: p.name, land: p.land, datei: fotos[i]?.datei ?? null, gesicht: fotos[i]?.gesicht ?? null })),
      };
      try {
        await statKarteZeichnen(c, daten);
        if (!weg) setGezeichnet(schluessel);
      } catch {
        if (!weg) setMeldung('The image could not be drawn.');
      }
    })();
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  const zeige = (text: string) => { setMeldung(text); setTimeout(() => setMeldung((m) => (m === text ? null : m)), 1800); };

  async function speichern() {
    if (!leinwand.current) return;
    try { await speichereLeinwand(leinwand.current, dateiname, true); zeige('Saved'); } catch (e) { setMeldung(e instanceof Error ? e.message : String(e)); }
  }
  async function kopieren() {
    if (!leinwand.current) return;
    try {
      const blob = await ftBildBlob(leinwand.current);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      zeige('copied');
    } catch {
      setMeldung('The browser will not release the clipboard — please save the image instead.');
    }
  }

  if (!personen.length) {
    return <p className="py-6 text-center text-xs text-white/30"><T>Erst einen Spieler oder ein Team wählen – dann entsteht hier das Bild.</T></p>;
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {!fertig && <span className="mr-auto text-[11px] text-white/40"><T>Bild wird gezeichnet…</T></span>}
        {meldung && <span className="mr-auto text-[11px] text-emerald-400">{t(meldung)}</span>}
        {kannKopieren && (
          <button type="button" onClick={kopieren} disabled={!fertig}
            className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40">
            <T>Bild kopieren</T>
          </button>
        )}
        <button type="button" onClick={speichern} disabled={!fertig}
          className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/55 transition hover:border-sky-500/60 hover:text-sky-400 disabled:opacity-40">
          <T>speichern</T>
        </button>
      </div>
      <canvas ref={leinwand} width={1600} height={900}
        className={`aspect-[16/9] w-full rounded-lg border border-white/10 bg-[#05080e] transition-opacity ${fertig ? 'opacity-100' : 'opacity-40'}`} />
    </div>
  );
}
