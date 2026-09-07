'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';

/*
 * Der Melde-Knopf.
 *
 * Der Betreiber: "Wenn ich zum Beispiel einen Error finde als normaler VIP
 * User, kann ich einen Knopf haben, da steht Report, und dann wird das
 * automatisch mir als E-Mail geschickt, dass dieser und dieser Account diesen
 * Report gemeldet hat - und dann muss ich das fixen."
 *
 * Der Weg dafuer besteht schon: /api/kontakt nimmt Meldungen entgegen, legt
 * sie im Werkzeug ab und schickt ihm eine Mail, deren Antwort-Adresse die des
 * Melders ist. Was fehlte, war der Knopf an Ort und Stelle. Wer einen Fehler
 * sieht, soll ihn dort melden koennen, wo er ihn sieht - nicht erst ins
 * Kontaktformular wechseln und dabei die Seite verlieren, um die es ging.
 *
 * Deshalb geht die Seite von selbst mit: Adresse, Fenstergroesse und Browser
 * stehen unter der Meldung, ohne dass jemand sie abtippt. Genau die Angaben
 * fehlen sonst in jeder zweiten Fehlermeldung.
 *
 * Sichtbar fuer jedes angemeldete Konto, nicht nur fuer VIPs - dieselbe Regel
 * wie in der Schnittstelle selbst: "Gerade die Meldungen von Leuten ohne
 * Rechte sind die, die man hoeren will."
 */

export default function Melden() {
  const t = useT();
  const zugang = useZugang();
  const pfad = usePathname();

  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState('');
  const feld = useRef<HTMLTextAreaElement>(null);

  // Beim Oeffnen gleich in das Feld springen - ein Klick weniger.
  useEffect(() => { if (offen) feld.current?.focus(); }, [offen]);

  // Mit Escape wieder zu.
  useEffect(() => {
    if (!offen) return;
    const auf = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    window.addEventListener('keydown', auf);
    return () => window.removeEventListener('keydown', auf);
  }, [offen]);

  if (zugang.laedt || !zugang.nutzer) return null;

  async function senden() {
    const roh = text.trim();
    if (roh.length < 10) {
      setFehler(t('Bitte beschreibe kurz, worum es geht.'));
      return;
    }
    setLaeuft(true);
    setFehler('');
    try {
      /*
       * Die Angaben zur Seite haengen unten an - englisch, weil die Mail
       * englisch ist, und in einer festen Form, damit sie sich beim Lesen
       * ueberspringen laesst.
       */
      const angaben = [
        `Page: ${window.location.pathname}${window.location.search}`,
        `Window: ${window.innerWidth}×${window.innerHeight}`,
        `Browser: ${navigator.userAgent}`,
      ].join('\n');

      const r = await fetch('/api/kontakt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thema: 'report',
          text: `${roh}\n\n---\n${angaben}`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.fehler || 'Senden fehlgeschlagen');
      setFertig(true);
      setText('');
      setTimeout(() => { setFertig(false); setOffen(false); }, 2500);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  /*
   * Unten rechts, aber links neben dem Sprachschalter.
   *
   * Der ist vierundneunzig Punkte breit und sitzt sechzehn vom Rand; sein
   * linker Rand liegt damit bei etwa hundertzehn. Bei "right-32", also
   * hundertachtundzwanzig, bleibt dazwischen Luft - bei "right-24" haette
   * der Knopf ihn ueberdeckt. Nachgemessen, nicht geschaetzt.
   */
  if (!offen) {
    return (
      <button onClick={() => setOffen(true)}
        title={t('Einen Fehler auf dieser Seite melden')}
        className="fixed bottom-4 right-32 z-[99] rounded-lg border
                   border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-xs
                   font-semibold text-slate-300 shadow-lg shadow-black/30
                   backdrop-blur transition hover:border-sky-500
                   hover:text-sky-400">
        <T>Melden</T>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[101] w-[min(360px,calc(100vw-2rem))]
                    rounded-xl border border-zinc-700 bg-zinc-900/97 p-4
                    shadow-xl shadow-black/50 backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            <T>Fehler melden</T>
          </h2>
          {/* Damit klar ist, dass die Seite mitgeht - niemand soll sie
              abtippen, und niemand soll ueberrascht sein, dass sie dabei ist. */}
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">
            {pfad}
          </p>
        </div>
        <button onClick={() => setOffen(false)} aria-label="close"
          className="shrink-0 text-slate-500 transition hover:text-slate-300">
          ✕
        </button>
      </div>

      {fertig ? (
        <p className="rounded-lg border border-emerald-800 bg-emerald-950/30
                      px-3 py-2 text-xs text-emerald-300">
          <T>Danke — die Meldung ist raus.</T>
        </p>
      ) : (
        <>
          <textarea ref={feld} value={text} rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Was stimmt hier nicht?')}
            className="w-full resize-y rounded-lg border border-zinc-800
                       bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none
                       placeholder:text-slate-600 focus:border-sky-500" />

          {fehler && (
            <p className="mt-2 text-[11px] text-rose-400">{fehler}</p>
          )}

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] text-slate-600">
              <T>Geht an den Betreiber, mit deinem Konto.</T>
            </span>
            <button onClick={() => void senden()} disabled={laeuft}
              className="shrink-0 rounded-lg bg-sky-500 px-4 py-1.5 text-xs
                         font-semibold text-white transition hover:bg-sky-400
                         disabled:opacity-50">
              {laeuft ? <T>Wird gesendet …</T> : <T>Senden</T>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
