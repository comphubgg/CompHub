'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Was im Werkzeug los ist - unten im Dashboard.
 *
 * Drei Reihen, weil es drei verschiedene Dinge sind und ein gemeinsames
 * Diagramm sie nur ineinanderschieben wuerde: Besuche gehen in die Hunderte,
 * neue Konten an einem guten Tag in die Einer. Nebeneinander in einem
 * Massstab waere die interessantere der beiden Reihen ein flacher Strich.
 *
 * Jede Reihe hat ihren eigenen Massstab, und ueber jeder steht ihr
 * Hoechstwert - sonst laesst sich aus der Hoehe eines Balkens nichts ablesen.
 *
 * Der wichtigste Teil ist die Schraffur: Tage vor Beginn der Zaehlung sind
 * nicht null, sondern unbekannt. Ein leerer Balken sagt "da war niemand",
 * und das waere gelogen - da wurde nur nicht gezaehlt.
 */

interface Tag {
  tag: string;
  konten: number;
  vips: number;
  aufrufe: number;
  besucher: number;
  neu: number;
}

interface Zahlen {
  tage: Tag[];
  seit: { konten: string | null; vips: string | null; besuche: string | null };
  jetzt: {
    konten: number; bestaetigt: number;
    vipKonten: number; vipSchluessel: number;
  };
}

/** Eine Reihe im Diagramm. */
interface Reihe {
  schluessel: 'besucher' | 'aufrufe' | 'konten' | 'vips';
  titel: string;
  erklaerung: string;
  /** Ab wann diese Reihe ueberhaupt etwas weiss. */
  quelle: 'besuche' | 'konten' | 'vips';
  farbe: string;
  /*
   * Ist eine Null vor dem ersten Eintrag eine Luecke oder wirklich eine Null?
   *
   * Bei den Besuchen eine Luecke: gezaehlt wurde vor der Einrichtung nichts,
   * und ein leerer Balken wuerde faelschlich "niemand war da" behaupten.
   * Bei Konten und VIP-Schluesseln dagegen eine echte Null - die Datumsfelder
   * gab es von Anfang an, es hat sich an dem Tag schlicht niemand angemeldet.
   * Alles zu schraffieren waere genauso falsch wie gar nichts.
   */
  luecke: boolean;
  /** Ein Satz unter der Reihe, wenn an ihr etwas zu erklaeren ist. */
  fussnote?: string;
}

const REIHEN: Reihe[] = [
  {
    schluessel: 'besucher', titel: 'Besucher',
    erklaerung: 'Browser, die an dem Tag da waren',
    quelle: 'besuche', farbe: '#0ea5e9', luecke: true,
  },
  {
    schluessel: 'aufrufe', titel: 'Seitenaufrufe',
    erklaerung: 'Jede geöffnete Seite einzeln',
    quelle: 'besuche', farbe: '#38bdf8', luecke: true,
  },
  {
    schluessel: 'konten', titel: 'Neue Konten',
    erklaerung: 'An dem Tag registriert',
    quelle: 'konten', farbe: '#34d399', luecke: false,
  },
  {
    schluessel: 'vips', titel: 'VIP vergeben',
    erklaerung: 'Konten und Zugangsschlüssel zusammen',
    quelle: 'vips', farbe: '#fbbf24', luecke: false,
    /*
     * Die halbe Wahrheit gehoert dazugesagt: die Zugangsschluessel tragen
     * ihr Datum seit jeher, die Konten nicht - dort stand nur, bis wann VIP
     * gilt. Wer hier einen alten Tag ohne Balken sieht, soll wissen, dass
     * eine Vergabe an einem Konto damals nirgends vermerkt wurde.
     */
    fussnote: 'Bei Konten wird die Vergabe erst ab jetzt festgehalten; '
      + 'ältere Balken zeigen nur die Zugangsschlüssel.',
  },
];

const SPANNEN = [7, 30, 90] as const;

export default function Nutzungszahlen() {
  const t = useT();
  const [spanne, setSpanne] = useState<number>(30);
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    void (async () => {
      try {
        const r = await fetch(`/api/statistik/nutzung?tage=${spanne}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Zahlen;
        if (!abgebrochen) { setZahlen(j); setFehler(''); }
      } catch {
        if (!abgebrochen) setFehler(t('Die Zahlen ließen sich nicht laden.'));
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [spanne, t]);

  /** Der Tag als "5.9." - die Jahreszahl steht dreissigmal daneben nur im Weg. */
  const kurz = (tag: string) => {
    const [, m, d] = tag.split('-');
    return `${Number(d)}.${Number(m)}.`;
  };

  const summen = useMemo(() => {
    if (!zahlen) return null;
    const s = { besucher: 0, aufrufe: 0, konten: 0, vips: 0, neu: 0 };
    for (const tg of zahlen.tage) {
      s.besucher += tg.besucher; s.aufrufe += tg.aufrufe;
      s.konten += tg.konten; s.vips += tg.vips; s.neu += tg.neu;
    }
    return s;
  }, [zahlen]);

  const kasten = 'rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5';

  return (
    <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-100"><T>Nutzung</T></h2>
          <span className="text-xs text-slate-500"><T>sichtbar nur für dich</T></span>
        </div>
        <div className="flex gap-1">
          {SPANNEN.map((s) => (
            <button key={s} type="button" onClick={() => setSpanne(s)}
              aria-pressed={spanne === s}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                spanne === s
                  ? 'bg-sky-500/15 text-sky-400'
                  : 'border border-zinc-800 text-slate-500 hover:text-slate-300'}`}>
              {s} <T>Tage</T>
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------ Der Bestand */}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className={kasten}>
          <span className="block text-xs text-slate-500"><T>Konten insgesamt</T></span>
          <span className="block text-lg font-semibold text-slate-100">
            {zahlen ? zahlen.jetzt.konten : '—'}
          </span>
        </div>
        <div className={kasten}>
          <span className="block text-xs text-slate-500"><T>Adresse bestätigt</T></span>
          <span className="block text-lg font-semibold text-slate-100">
            {zahlen ? zahlen.jetzt.bestaetigt : '—'}
          </span>
        </div>
        <div className={kasten}>
          <span className="block text-xs text-slate-500"><T>VIP-Konten</T></span>
          <span className="block text-lg font-semibold text-slate-100">
            {zahlen ? zahlen.jetzt.vipKonten : '—'}
          </span>
        </div>
        <div className={kasten}>
          <span className="block text-xs text-slate-500"><T>VIP-Zugangsschlüssel</T></span>
          <span className="block text-lg font-semibold text-slate-100">
            {zahlen ? zahlen.jetzt.vipSchluessel : '—'}
          </span>
        </div>
      </div>

      {fehler && <p className="mt-3 text-sm text-rose-400">{fehler}</p>}
      {laedt && !zahlen && (
        <p className="mt-3 text-sm text-slate-500"><T>Wird geladen …</T></p>
      )}

      {/* ------------------------------------------------------ Die Reihen */}

      {zahlen && (
        <div className="mt-4 space-y-4">
          {REIHEN.map((r) => {
            const werte = zahlen.tage.map((tg) => tg[r.schluessel]);
            const hoechst = Math.max(1, ...werte);
            const seit = zahlen.seit[r.quelle];
            const gesamt = werte.reduce((a, b) => a + b, 0);

            return (
              <div key={r.schluessel}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: r.farbe }} aria-hidden />
                    <span className="text-sm font-medium text-slate-200">
                      <T>{r.titel}</T>
                    </span>
                    <span className="text-xs text-slate-500"><T>{r.erklaerung}</T></span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {gesamt} <T>im Zeitraum</T> · <T>Höchstwert</T> {hoechst}
                  </span>
                </div>

                {/*
                  * Die Balken. Bewusst als schlichte Flaechen und nicht als
                  * gezeichnetes Diagramm mit Achsen: dreissig Werte zwischen
                  * null und ein paar hundert brauchen keine Beschriftung an
                  * jeder Kante, sondern eine Hoehe, die man vergleichen kann.
                  */}
                <div className="mt-1.5 flex h-20 items-end gap-[2px]">
                  {zahlen.tage.map((tg) => {
                    const wert = tg[r.schluessel];
                    const unbekannt = r.luecke && (!seit || tg.tag < seit);
                    const hoehe = unbekannt ? 100 : Math.max(wert > 0 ? 4 : 1,
                      Math.round((wert / hoechst) * 100));
                    return (
                      <div key={tg.tag}
                        title={unbekannt
                          ? `${kurz(tg.tag)} — ${t('wurde damals noch nicht gezählt')}`
                          : `${kurz(tg.tag)} — ${wert}`}
                        className="flex-1 rounded-t-[2px] transition"
                        style={unbekannt ? {
                          /* Schraffiert: unbekannt, nicht null. */
                          height: '100%',
                          background: 'repeating-linear-gradient(45deg,'
                            + '#27272a 0 3px, transparent 3px 6px)',
                        } : {
                          height: `${hoehe}%`,
                          background: wert > 0 ? r.farbe : '#27272a',
                          opacity: wert > 0 ? 1 : 0.5,
                        }} />
                    );
                  })}
                </div>

                <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                  <span>{kurz(zahlen.tage[0]?.tag ?? '')}</span>
                  <span>{kurz(zahlen.tage[zahlen.tage.length - 1]?.tag ?? '')}</span>
                </div>

                {/*
                  * Wo die Aufzeichnung anfaengt, gehoert es dazugeschrieben.
                  * Ohne diesen Satz sieht die Schraffur nur nach einem
                  * Darstellungsfehler aus.
                  */}
                {r.luecke && !seit ? (
                  <p className="mt-1 text-[11px] text-amber-500/80">
                    <T>Dafür liegt noch nichts vor — die Zählung beginnt jetzt.</T>
                  </p>
                ) : r.luecke && seit && seit > (zahlen.tage[0]?.tag ?? '') ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    <T>Schraffiert: davor wurde das nicht festgehalten. Erfasst seit</T>
                    {' '}{kurz(seit)}
                  </p>
                ) : null}
                {r.fussnote && (
                  <p className="mt-1 text-[11px] text-slate-500"><T>{r.fussnote}</T></p>
                )}
              </div>
            );
          })}

          {/* --------------------------------------------------- Der Zusatz */}

          {summen && (
            <p className="text-xs text-slate-500">
              <T>Davon zum ersten Mal hier</T>: {summen.neu}
            </p>
          )}

          <p className="border-t border-zinc-900 pt-3 text-[11px] leading-relaxed
                        text-slate-600">
            <T>Gezählt werden Browser, nicht Menschen: wer Handy und Rechner
              benutzt, zählt zweimal, wer seine Daten löscht, gilt danach als
              neu. Deine eigenen Aufrufe als Admin zählen nicht mit.</T>
          </p>
        </div>
      )}
    </section>
  );
}
