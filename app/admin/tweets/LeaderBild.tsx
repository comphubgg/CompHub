'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
import { ftBildBlob } from '@/lib/ftBild';
import { useLeader } from '@/app/components/TurnierLeader';
import { LEADER_BILD_BREITE, LEADER_BILD_HOEHE, turnierLeaderZeichnen } from '@/lib/turnierLeaderBild';

/*
 * Das teilbare Bild der Tournament Leaders (2000 x 1213, lib/turnierLeaderBild.ts) fuer den gewaehlten Spieltag - oder, bei mehrtaegigen Finals, fuer alle
 * Tage zusammen. Dieselben Daten wie der Abschnitt in den Player Stats (/api/turnier-leader). Darunter "Bild kopieren" und "speichern".
 */
export default function LeaderBild({ eventId, windowId, tage, titel, dateiname }: {
  eventId: string; windowId: string; tage: string[]; titel: string; dateiname: string;
}) {
  const { t } = useSprache();
  const [alleTage, setAlleTage] = useState(true);
  const windows = alleTage && tage.length > 1 ? tage : null;
  const { laedt, daten, fehler } = useLeader(eventId, windows ? tage[tage.length - 1] : windowId, windows);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [fertig, setFertig] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const kannKopieren = useSyncExternalStore(() => () => {}, () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write, () => false);
  // Der Titel aus dem Cup-Archiv ("FNCS Solos Reload · Heat 2", bei Finals mit "Day 1 + 2"), sonst der Titel der Seite.
  const voll = daten?.kopf?.titel || (windows ? `${titel} · ${tage.map((w) => `Day ${/Day(\d+)/i.exec(w)?.[1] ?? ''}`).join(' + ')}` : titel);
  const schluessel = JSON.stringify([voll, daten?.mvp?.epicId, daten?.tafeln.map((x) => x.zeilen.map((z) => z.wert))]);

  useEffect(() => {
    const c = leinwand.current;
    if (!c || !daten?.vorhanden) return;
    let weg = false;
    void turnierLeaderZeichnen(c, daten, voll).then(() => { if (!weg) setFertig(schluessel); }).catch(() => { if (!weg) setMeldung('Das Bild ließ sich nicht zeichnen.'); });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  const zeige = (text: string) => { setMeldung(text); setTimeout(() => setMeldung((m) => (m === text ? null : m)), 1800); };
  const bereit = fertig === schluessel;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {tage.length > 1 && (
          <label className="mr-auto flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={alleTage} onChange={(e) => setAlleTage(e.target.checked)} className="accent-sky-500" />
            <T>Alle Tage zusammen</T>
          </label>
        )}
        {(laedt || (!bereit && daten?.vorhanden)) && <span className="text-[11px] text-slate-500"><T>Bild wird gezeichnet…</T></span>}
        {meldung && <span className="text-[11px] text-sky-300">{t(meldung)}</span>}
        {kannKopieren && (
          <button type="button" disabled={!bereit} onClick={async () => {
            if (!leinwand.current) return;
            try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await ftBildBlob(leinwand.current) })]); zeige('kopiert'); }
            catch { setMeldung('Der Browser gibt die Zwischenablage nicht frei — bitte das Bild speichern.'); }
          }} className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40">
            <T>Bild kopieren</T>
          </button>
        )}
        <button type="button" disabled={!bereit} onClick={async () => {
          if (!leinwand.current) return;
          try { await speichereLeinwand(leinwand.current, dateiname, true); zeige('Gespeichert'); } catch (e) { setMeldung(e instanceof Error ? e.message : String(e)); }
        }} className="rounded-lg border border-zinc-800 px-3 py-1 text-xs text-slate-400 transition hover:border-sky-500/60 hover:text-sky-400 disabled:opacity-40">
          <T>speichern</T>
        </button>
      </div>
      {!laedt && (fehler || !daten?.vorhanden) ? (
        <p className="py-6 text-center text-xs text-slate-600"><T>Für diesen Spieltag liegen noch keine Werte je Spieler vor.</T></p>
      ) : (
        <canvas ref={leinwand} width={LEADER_BILD_BREITE} height={LEADER_BILD_HOEHE}
          className={`aspect-[2000/1213] w-full rounded-lg border border-zinc-800 bg-[#05080e] transition-opacity ${bereit ? 'opacity-100' : 'opacity-40'}`} />
      )}
    </div>
  );
}
